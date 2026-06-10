// src/lib/engine/identity-battery.test.ts — M-verify (a): the IDENTITY BATTERY (Vision §5).
// Accounting identities are true by definition and must hold for ANY correct dataset. We build a
// BROAD, ADVERSARIAL set of synthetic articulating books (each constructed so a CORRECT engine yields
// passing identities — cash is the balancing plug, opening RE rolls), then assert all four §4.5
// identities PASS, plus the perturbation (corrupt a non-cash line by X → cash tie breaks by exactly X)
// to prove the checks are LIVE. This is the real pass/fail gate — not AI agreement.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeChain } from './engine';
import { checkInvariants, perturbNatural } from './invariants';
import type { PeriodEngineInput } from './types';

type Lines = {
  revenue: number; cogs: number; opex: number; da: number; finance: number; tax: number; otherIncome: number;
  receivables: number; inventory: number; prepaid: number; otherCA: number;
  ppe: number; intangibles: number; investments: number; otherNCA: number;
  payables: number; statutory: number; accrued: number; stBorrow: number; ltBorrow: number; provisions: number; otherNCL: number;
  shareCapital: number; otherEquity: number; recurring: number | null;
};
const BASE: Lines = {
  revenue: 300000000, cogs: 120000000, opex: 100000000, da: 10000000, finance: 5000000, tax: 8750000, otherIncome: 0,
  receivables: 200000000, inventory: 100000000, prepaid: 20000000, otherCA: 0,
  ppe: 300000000, intangibles: 0, investments: 0, otherNCA: 0,
  payables: 130000000, statutory: 30000000, accrued: 0, stBorrow: 80000000, ltBorrow: 240000000, provisions: 0, otherNCL: 0,
  shareCapital: 500000000, otherEquity: 0, recurring: 200000000,
};
const mk = (o: Partial<Lines>): Lines => ({ ...BASE, ...o });

// Build a balanced, articulating period: cash is the PLUG so Assets = L + E; RE rolls by NP.
function build(periodId: string, label: string, month: string, openingRE: number, L: Lines): PeriodEngineInput {
  const grossProfit = L.revenue - L.cogs;
  const ebitda = grossProfit - L.opex;
  const ebit = ebitda - L.da;
  const np = ebit + L.otherIncome - L.finance - L.tax;
  const closingRE = openingRE + np;
  const nonCashCA = L.receivables + L.inventory + L.prepaid + L.otherCA;
  const nca = L.ppe + L.intangibles + L.investments + L.otherNCA;
  const totalLiab = L.payables + L.statutory + L.accrued + L.stBorrow + L.ltBorrow + L.provisions + L.otherNCL;
  const totalEquity = L.shareCapital + L.otherEquity + closingRE;
  const cash = totalLiab + totalEquity - nonCashCA - nca; // PLUG → Assets = L + E by construction
  const totalAssets = cash + nonCashCA + nca;
  return {
    periodId, label, periodMonth: month,
    tb: { debitPaise: totalAssets, creditPaise: totalAssets }, // synthetic balanced TB (debits = credits)
    recurringRevenuePaise: L.recurring,
    naturals: {
      operating_revenue: L.revenue, other_income: L.otherIncome, cogs: L.cogs, employee_benefits: L.opex,
      depreciation_amortisation: L.da, finance_costs: L.finance, tax_expense: L.tax,
      cash_bank: cash, trade_receivables: L.receivables, inventory: L.inventory, prepaid_advances: L.prepaid, other_current_assets: L.otherCA,
      ppe: L.ppe, intangibles: L.intangibles, investments: L.investments, other_non_current_assets: L.otherNCA,
      trade_payables: L.payables, statutory_dues: L.statutory, accrued_other_current_liabilities: L.accrued,
      short_term_borrowings: L.stBorrow, long_term_borrowings: L.ltBorrow, provisions: L.provisions, other_non_current_liabilities: L.otherNCL,
      share_capital: L.shareCapital, other_equity: L.otherEquity, reserves_surplus: openingRE,
    },
  };
}

// 16 adversarial scenarios: { name, openingRE for p1, p1 lines, p2 lines }
const CASES: { name: string; openingRE: number; p1: Lines; p2: Lines }[] = [
  { name: 'healthy growth', openingRE: 100000000, p1: mk({}), p2: mk({ revenue: 360000000, cogs: 144000000, opex: 110000000 }) },
  { name: 'revenue decline', openingRE: 100000000, p1: mk({}), p2: mk({ revenue: 220000000, cogs: 92000000, opex: 95000000 }) },
  { name: 'loss period (NP<0)', openingRE: 100000000, p1: mk({}), p2: mk({ revenue: 200000000, cogs: 180000000, opex: 60000000, tax: 0 }) },
  { name: 'deep loss', openingRE: 100000000, p1: mk({}), p2: mk({ revenue: 100000000, cogs: 150000000, opex: 80000000, tax: 0 }) },
  { name: 'negative equity', openingRE: -480000000, p1: mk({ shareCapital: 50000000 }), p2: mk({ shareCapital: 50000000, revenue: 150000000, cogs: 140000000, opex: 60000000, tax: 0 }) },
  { name: 'near-zero equity', openingRE: -491000000, p1: mk({ shareCapital: 500000000 }), p2: mk({ shareCapital: 500000000, revenue: 250000000, cogs: 130000000 }) },
  { name: 'high leverage', openingRE: 100000000, p1: mk({}), p2: mk({ stBorrow: 200000000, ltBorrow: 900000000, finance: 30000000 }) },
  { name: 'debt paydown', openingRE: 100000000, p1: mk({}), p2: mk({ stBorrow: 20000000, ltBorrow: 100000000, finance: 2000000 }) },
  { name: 'capital raise', openingRE: 100000000, p1: mk({}), p2: mk({ shareCapital: 900000000 }) },
  { name: 'zero revenue (pre-rev burn)', openingRE: 100000000, p1: mk({}), p2: mk({ revenue: 0, cogs: 0, opex: 60000000, tax: 0, recurring: null }) },
  { name: 'receivables blowout', openingRE: 100000000, p1: mk({}), p2: mk({ receivables: 520000000 }) },
  { name: 'inventory spike', openingRE: 100000000, p1: mk({}), p2: mk({ inventory: 420000000 }) },
  { name: 'payables blowout', openingRE: 100000000, p1: mk({}), p2: mk({ payables: 430000000 }) },
  { name: 'capex heavy', openingRE: 100000000, p1: mk({}), p2: mk({ ppe: 620000000, da: 35000000 }) },
  { name: 'other-income heavy', openingRE: 100000000, p1: mk({}), p2: mk({ otherIncome: 90000000 }) },
  { name: 'missing schedule (MRR n/a)', openingRE: 100000000, p1: mk({ recurring: null }), p2: mk({ recurring: null, revenue: 330000000, cogs: 132000000 }) },
];

for (const c of CASES) {
  test(`identity battery · ${c.name}`, () => {
    const p1 = build('p1', 'P1', '2026-04-01', c.openingRE, c.p1);
    const closingRE1 = c.openingRE + computeChainNp(p1); // p2 opening RE = p1 closing RE
    const p2 = build('p2', 'P2', '2026-05-01', closingRE1, c.p2);
    const [r1, r2] = computeChain([p1, p2]);
    const inv = checkInvariants(p2, r2, { input: p1, result: r1 });
    // ALL four identities must hold (true by definition for a correct engine on articulating data)
    for (const x of inv) assert.notEqual(x.status, 'fail', `${c.name}: ${x.id} must not fail — ${x.detail}`);
    assert.equal(inv.find((x) => x.id === 'bs_identity')!.status, 'pass', `${c.name}: BS identity`);
    assert.equal(inv.find((x) => x.id === 'tb_integrity')!.status, 'pass', `${c.name}: TB integrity`);
    assert.equal(inv.find((x) => x.id === 'cash_tie_out')!.status, 'pass', `${c.name}: cash tie-out`);
    assert.equal(inv.find((x) => x.id === 'pl_to_equity')!.status, 'pass', `${c.name}: RE roll`);
    // PERTURBATION: corrupt a non-cash line by X → cash tie breaks by EXACTLY X (proves the check is live)
    const X = 1234500; // ₹12,345
    const corrupted = perturbNatural(p2, 'trade_receivables', X, 'debit');
    const rc = computeChain([p1, corrupted])[1];
    const invc = checkInvariants(corrupted, rc, { input: p1, result: r1 });
    const tie = invc.find((x) => x.id === 'cash_tie_out')!;
    assert.equal(tie.status, 'fail', `${c.name}: perturbation must break cash tie`);
    assert.equal(Math.abs(tie.deltaPaise!), X, `${c.name}: cash tie breaks by EXACTLY the corruption`);
  });
}

// minimal P&L recompute (to roll RE into p2's opening) — mirrors engine.computePnl net profit
function computeChainNp(p: PeriodEngineInput): number {
  const n = p.naturals;
  const gp = (n.operating_revenue ?? 0) - (n.cogs ?? 0);
  const opex = (n.employee_benefits ?? 0) + (n.rent_utilities ?? 0) + (n.sales_marketing ?? 0) + (n.technology_software ?? 0) + (n.professional_fees ?? 0) + (n.admin_other_opex ?? 0);
  const ebitda = gp - opex;
  const ebit = ebitda - (n.depreciation_amortisation ?? 0);
  return ebit + (n.other_income ?? 0) - (n.finance_costs ?? 0) - (n.tax_expense ?? 0);
}
