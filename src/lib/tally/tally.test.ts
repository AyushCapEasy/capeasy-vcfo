// src/lib/tally/tally.test.ts — Route C (Tally TB → MIS). Synthetic fixtures only (no real data).
// Proves: parse (data + display formats), source-type-dominates-name with the conflict catch,
// statement reconstruction + internal checks, and the engine-gap vs audit-adjustment reconcile.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTallyTB, tallyAmountToPaise, decodeTallyXml, parseTallyDayBook } from './parse';
import { classifyLedgers } from './classify';
import { reconstructFromTallyXml, reconstructFromTallyExports, reconcile, type AuditedStatements } from './index';

// A small BALANCED Tally TB in DATA format (CLOSINGBALANCE: Dr +, Cr −). One deliberate name↔group
// conflict: "Investments in MF" sits under Capital Account (equity) but its NAME screams asset.
const DATA_XML = `<ENVELOPE>
<LEDGER NAME="Sales - Services"><PARENT>Sales Accounts</PARENT><CLOSINGBALANCE>-1000000.00</CLOSINGBALANCE></LEDGER>
<LEDGER NAME="Salaries &amp; Wages"><PARENT>Indirect Expenses</PARENT><CLOSINGBALANCE>600000.00</CLOSINGBALANCE></LEDGER>
<LEDGER NAME="Depreciation"><PARENT>Indirect Expenses</PARENT><CLOSINGBALANCE>50000.00</CLOSINGBALANCE></LEDGER>
<LEDGER NAME="HDFC Bank"><PARENT>Bank Accounts</PARENT><CLOSINGBALANCE>350000.00</CLOSINGBALANCE></LEDGER>
<LEDGER NAME="Trade Receivables"><PARENT>Sundry Debtors</PARENT><CLOSINGBALANCE>200000.00</CLOSINGBALANCE></LEDGER>
<LEDGER NAME="Share Capital"><PARENT>Capital Account</PARENT><CLOSINGBALANCE>-100000.00</CLOSINGBALANCE></LEDGER>
<LEDGER NAME="Investments in MF"><PARENT>Capital Account</PARENT><CLOSINGBALANCE>-50000.00</CLOSINGBALANCE></LEDGER>
<LEDGER NAME="Sundry Creditors A/c"><PARENT>Sundry Creditors</PARENT><CLOSINGBALANCE>-50000.00</CLOSINGBALANCE></LEDGER>
</ENVELOPE>`;

test('amount parser handles commas, parens, Dr/Cr, ₹', () => {
  assert.equal(tallyAmountToPaise('1,210,000.00'), 121000000);
  assert.equal(tallyAmountToPaise('(50,000)'), -5000000);
  assert.equal(tallyAmountToPaise('₹ 1,234.50 Cr'), -123450);
  assert.equal(tallyAmountToPaise(''), 0);
});

test('parse DATA format: every ledger + parent group + closing balance', () => {
  const p = parseTallyTB(DATA_XML);
  assert.equal(p.format, 'data');
  assert.equal(p.ledgers.length, 8);
  assert.equal(p.withGroup, 8);
  const sales = p.ledgers.find((l) => l.name.startsWith('Sales'))!;
  assert.equal(sales.parentGroup, 'Sales Accounts');
  assert.equal(sales.closingCrPaise, 100000000); // credit closing
  assert.equal(sales.closingDrPaise, 0);
});

test('source-type-dominates-name: group authoritative, name refines, conflict flagged', () => {
  const d = classifyLedgers(parseTallyTB(DATA_XML).ledgers);
  const by = (n: string) => d.find((x) => x.name.startsWith(n))!;
  assert.equal(by('Sales').category, 'operating_revenue');         // group income + name agree
  assert.equal(by('Salaries').category, 'employee_benefits');      // name refines within Indirect Expenses
  assert.equal(by('Depreciation').category, 'depreciation_amortisation'); // refine (both P&L-expense macro)
  assert.equal(by('HDFC').category, 'cash_bank');
  // THE conflict catch: name "Investments in MF" → asset, but Tally group Capital Account → equity. Group wins.
  const inv = by('Investments');
  assert.equal(inv.conflict, true);
  assert.equal(inv.category, 'share_capital');
  assert.match(inv.conflictDetail ?? '', /group wins/);
  assert.equal(d.filter((x) => x.conflict).length, 1);
});

test('reconstruct P&L + BS + internal checks (balanced book ties)', () => {
  const { statements: s } = reconstructFromTallyXml(DATA_XML);
  assert.equal(s.pl.revenuePaise, 100000000);                 // ₹10,00,000
  assert.equal(s.pl.expensesPaise, 65000000);                 // salaries 6,00,000 + dep 50,000
  assert.equal(s.pl.netProfitPaise, 35000000);                // ₹3,50,000
  assert.equal(s.bs.assetsPaise, 55000000);                   // bank 3,50,000 + AR 2,00,000
  assert.equal(s.bs.liabilitiesPaise, 5000000);               // creditors 50,000
  assert.equal(s.bs.equityPaise, 15000000);                   // share cap 1,00,000 + (Inv→share_cap) 50,000
  assert.equal(s.checks.tbBalanced, true);
  assert.equal(s.checks.plTiesToBs, true);                    // Assets−(L+E) == net profit
});

test('reconcile distinguishes engine gaps from audit adjustments', () => {
  const { statements } = reconstructFromTallyXml(DATA_XML);
  const audited: AuditedStatements = {
    pl: {
      operating_revenue: 100000000,        // matches
      employee_benefits: 60000000,          // matches
      depreciation_amortisation: 60000000,  // differs 50k→60k → AUDIT ADJUSTMENT (dep finalised at audit)
      tax_expense: 2000000,                  // present in audited, absent in books → AUDIT ADJUSTMENT
    },
    bs: {
      cash_bank: 40000000,                   // differs 3.5L→4.0L, both material → ENGINE GAP
      trade_receivables: 20000000,           // matches
      share_capital: 15000000,               // matches
      trade_payables: 5000000,               // matches (Tally creditors)
    },
  };
  const r = reconcile(statements, audited);
  const status = (c: string) => r.lines.find((l) => l.category === c)!.status;
  assert.equal(status('depreciation_amortisation'), 'audit_adjustment');
  assert.equal(status('tax_expense'), 'audit_adjustment');
  assert.equal(status('cash_bank'), 'engine_gap');
  assert.equal(status('operating_revenue'), 'match');
  assert.ok(r.auditAdjustments >= 2 && r.engineGaps >= 1);
});

// GAP-5 — the auto-bucketer must not cry wolf: opening-balance differences, net-neutral sibling
// reclassifications, and immaterial noise are NOT engine gaps. Without this the (c) bucket is
// untrustworthy at scale (Orafor: 8 flagged, truth was 1). Synthetic figures mirror Orafor's shape.
test('GAP-5 reconcile: opening-diff + net-neutral reclass + materiality → only genuine gaps stay (c)', () => {
  const R = (rupees: number) => rupees * 100; // paise
  const mk = (pl: Record<string, number>, bs: Record<string, number>) => ({
    pl: { lines: Object.entries(pl).map(([category, valuePaise]) => ({ category, label: category, group: '', statement: 'pl', valuePaise })) },
    bs: { lines: Object.entries(bs).map(([category, valuePaise]) => ({ category, label: category, group: '', statement: 'bs', valuePaise })) },
  } as unknown as Parameters<typeof reconcile>[0]);

  const audited: AuditedStatements = {
    pl: { operating_revenue: R(8000000), cogs: R(5000000), employee_benefits: R(1000000), admin_other_opex: R(2500000), finance_costs: R(500000) },
    bs: { trade_receivables: R(100000), trade_payables: R(100000) },
  };
  // Reconstructed PRE the "LOAN INT" fix: finance understated (the one genuine engine gap),
  // employee↔admin net-neutral reclass, AR/AP carry a ₹10,00,000 opening difference, cogs off by ₹500.
  const pre = mk(
    { operating_revenue: R(8000000), cogs: R(5000500), employee_benefits: R(3000000), admin_other_opex: R(500000), finance_costs: R(1000) },
    { trade_receivables: R(1300000), trade_payables: R(300000) },
  );
  const opts = {
    tolerancePaise: 100, materialityPaise: R(5000), reclassTolerancePaise: R(50000),
    openingDifferencePaise: R(1000000), openingDifferenceCategories: ['trade_receivables', 'trade_payables'],
    reclassGroups: [['employee_benefits', 'admin_other_opex']],
  };
  const r = reconcile(pre, audited, opts);
  const st = (c: string) => r.lines.find((l) => l.category === c)!.status;
  assert.equal(st('trade_receivables'), 'audit_adjustment'); // opening diff (i)
  assert.equal(st('trade_payables'), 'audit_adjustment');    // opening diff (i)
  assert.equal(st('employee_benefits'), 'audit_adjustment'); // net-neutral reclass (ii)
  assert.equal(st('admin_other_opex'), 'audit_adjustment');  // net-neutral reclass (ii)
  assert.equal(st('cogs'), 'immaterial');                    // materiality (iii)
  assert.equal(st('finance_costs'), 'engine_gap');           // the one GENUINE gap
  assert.equal(r.engineGaps, 1);

  // The OLD heuristic (no options) false-flags all of them as engine gaps.
  assert.ok(reconcile(pre, audited).engineGaps >= 5);

  // POST the fix (finance now matches) → zero genuine engine gaps.
  const post = mk(
    { operating_revenue: R(8000000), cogs: R(5000500), employee_benefits: R(3000000), admin_other_opex: R(500000), finance_costs: R(500000) },
    { trade_receivables: R(1300000), trade_payables: R(300000) },
  );
  assert.equal(reconcile(post, audited, opts).engineGaps, 0);
});

test('parse DISPLAY format: group-header context + ledger rows', () => {
  const DISPLAY_XML = `<ENVELOPE>
<DSPACCNAME><DSPDISPNAME>Sales Accounts</DSPDISPNAME></DSPACCNAME><DSPACCINFO/>
<DSPACCNAME><DSPDISPNAME>Consulting Income</DSPDISPNAME></DSPACCNAME><DSPACCINFO><DSPCLCRAMT><DSPCLCRAMTA>-500000</DSPCLCRAMTA></DSPCLCRAMT></DSPACCINFO>
<DSPACCNAME><DSPDISPNAME>Bank Accounts</DSPDISPNAME></DSPACCNAME><DSPACCINFO/>
<DSPACCNAME><DSPDISPNAME>ICICI Bank</DSPDISPNAME></DSPACCNAME><DSPACCINFO><DSPCLDRAMT><DSPCLDRAMTA>500000</DSPCLDRAMTA></DSPCLDRAMT></DSPACCINFO>
</ENVELOPE>`;
  const p = parseTallyTB(DISPLAY_XML);
  assert.equal(p.format, 'display');
  assert.equal(p.ledgers.length, 2);
  assert.equal(p.ledgers.find((l) => l.name === 'Consulting Income')!.parentGroup, 'Sales Accounts');
  assert.equal(p.ledgers.find((l) => l.name === 'ICICI Bank')!.parentGroup, 'Bank Accounts');
  const d = classifyLedgers(p.ledgers);
  assert.equal(d.find((x) => x.name === 'ICICI Bank')!.category, 'cash_bank');
});

// GAP-3 — the real-world UTF-16 "All Masters" + "Day Book" two-file export. Synthetic (committable):
// masters carry the closing balance in <OPENINGBALANCE> (debit-negative); the Day Book carries the P&L
// postings; closing = field where present, else Σ postings; a cancelled voucher must be skipped.
test('GAP-3 two-file masters+daybook (UTF-16): field-as-closing + day-book postings reconstruct + balance', () => {
  const MASTERS = `<ENVELOPE><BODY>
<LEDGER NAME="Opening Cash"><PARENT>Cash-in-Hand</PARENT><OPENINGBALANCE>-50000.00</OPENINGBALANCE></LEDGER>
<LEDGER NAME="Capital A/c"><PARENT>Capital Account</PARENT><OPENINGBALANCE>50000.00</OPENINGBALANCE></LEDGER>
<LEDGER NAME="Sales &amp; Services"><PARENT>Sales Accounts</PARENT></LEDGER>
<LEDGER NAME="HDFC Bank"><PARENT>Bank Accounts</PARENT></LEDGER>
<LEDGER NAME="Purchases"><PARENT>Purchase Accounts</PARENT></LEDGER>
</BODY></ENVELOPE>`;
  const DAYBOOK = `<ENVELOPE><BODY>
<VOUCHER><VOUCHERTYPENAME>Sales</VOUCHERTYPENAME>
  <ALLLEDGERENTRIES.LIST><LEDGERNAME>HDFC Bank</LEDGERNAME><AMOUNT>-8000.00</AMOUNT></ALLLEDGERENTRIES.LIST>
  <ALLLEDGERENTRIES.LIST><LEDGERNAME>Sales &amp; Services</LEDGERNAME><AMOUNT>8000.00</AMOUNT><BILLALLOCATIONS.LIST><AMOUNT>8000.00</AMOUNT></BILLALLOCATIONS.LIST></ALLLEDGERENTRIES.LIST>
</VOUCHER>
<VOUCHER><VOUCHERTYPENAME>Purchase</VOUCHERTYPENAME>
  <LEDGERENTRIES.LIST><LEDGERNAME>Purchases</LEDGERNAME><AMOUNT>-3000.00</AMOUNT></LEDGERENTRIES.LIST>
  <LEDGERENTRIES.LIST><LEDGERNAME>HDFC Bank</LEDGERNAME><AMOUNT>3000.00</AMOUNT></LEDGERENTRIES.LIST>
</VOUCHER>
<VOUCHER><ISCANCELLED>Yes</ISCANCELLED><VOUCHERTYPENAME>Sales</VOUCHERTYPENAME>
  <ALLLEDGERENTRIES.LIST><LEDGERNAME>Sales &amp; Services</LEDGERNAME><AMOUNT>99999.00</AMOUNT></ALLLEDGERENTRIES.LIST>
</VOUCHER>
</BODY></ENVELOPE>`;

  // UTF-16 LE round-trip through the production decoder.
  const enc = (s: string) => decodeTallyXml(Buffer.from('﻿' + s, 'utf16le'));
  assert.equal(enc(MASTERS), MASTERS); // BOM-aware decode restores the original
  const masters = enc(MASTERS), daybook = enc(DAYBOOK);

  // cancelled voucher is skipped (2 live of 3).
  assert.equal(parseTallyDayBook(daybook).voucherCount, 2);

  const { parse, statements: s } = reconstructFromTallyExports(masters, daybook);
  assert.equal(parse.format, 'masters_daybook');
  const pl = (c: string) => s.pl.lines.find((l) => l.category === c)?.valuePaise ?? 0;
  const bs = (c: string) => s.bs.lines.find((l) => l.category === c)?.valuePaise ?? 0;
  // P&L from postings (no master field on these): revenue 8,000 · COGS 3,000 · net 5,000.
  assert.equal(pl('operating_revenue'), 800000);
  assert.equal(pl('cogs'), 300000);
  assert.equal(s.pl.netProfitPaise, 500000); // cancelled 99,999 NOT counted
  // BS: cash_bank = opening cash 50,000 (field) + HDFC 5,000 (postings) = 55,000; capital 50,000 (field).
  assert.equal(bs('cash_bank'), 5500000);
  assert.equal(bs('share_capital'), 5000000);
  // internal identities hold.
  assert.equal(s.checks.tbBalanced, true);
  assert.equal(s.checks.plTiesToBs, true);
});
