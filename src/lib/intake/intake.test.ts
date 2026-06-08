// src/lib/intake/intake.test.ts — headless tests for the intake pipeline (run: npm test).
// The §3.3 gate must BLOCK, not just pass: cases (a) unbalanced, (b) unmapped, (c) garbage columns.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTb } from './parse';
import { validateTb } from './validate';
import { suggestCategories } from './fuzzy';
import { rupeesCellToPaise } from './money';
import type { CategoryMeta, ParsedTbRow } from './types';

const buf = (s: string) => ({ buffer: Buffer.from(s, 'utf8'), filename: 'tb.csv' });

const CATS: CategoryMeta[] = [
  { code: 'operating_revenue', name: 'Operating revenue', group: 'income', statement: 'pl', normal_balance: 'credit' },
  { code: 'cogs', name: 'COGS / cost of services', group: 'direct_costs', statement: 'pl', normal_balance: 'debit' },
  { code: 'cash_bank', name: 'Cash & bank', group: 'current_assets', statement: 'bs', normal_balance: 'debit' },
  { code: 'trade_receivables', name: 'Trade receivables (AR)', group: 'current_assets', statement: 'bs', normal_balance: 'debit' },
  { code: 'share_capital', name: 'Share capital', group: 'equity', statement: 'bs', normal_balance: 'credit' },
];
const catMeta = new Map(CATS.map((c) => [c.code, c]));

// --- money ----------------------------------------------------------------
test('rupeesCellToPaise handles messy cells', () => {
  assert.equal(rupeesCellToPaise('1,200.50'), 120050);
  assert.equal(rupeesCellToPaise('₹ 5,00,000'), 50000000);
  assert.equal(rupeesCellToPaise('(500)'), -50000);
  assert.equal(rupeesCellToPaise(''), 0);
  assert.equal(rupeesCellToPaise('abc'), null); // non-numeric → flagged upstream
});

// --- parse: happy path ----------------------------------------------------
test('parseTb reads the default column format', () => {
  const res = parseTb(buf('account_code,account_name,debit,credit\n4000,Sales,0,1000\n1000,Cash,1000,0\n'));
  assert.equal(res.ok, true);
  if (!res.ok) return;
  assert.equal(res.rows.length, 2);
  assert.deepEqual(
    res.rows.map((r) => [r.accountCode, r.debitPaise, r.creditPaise]),
    [['4000', 0, 100000], ['1000', 100000, 0]]
  );
});

// --- parse transparency: mapping, sign flip, skipped row are all surfaced --
test('parseTb surfaces column mapping, a sign flip, and a skipped Total row', () => {
  const csv = [
    'Ledger Code,Particulars,Debit Amount,Credit Amount', // synonyms, not canonical headers
    '1000,Cash at Bank,"5,00,000",0',
    '4000,Sales – Services,0,"5,10,000"',
    '6500,Bank Charges Refund,0,"(10,000)"', // (x) → flips credit to a ₹10,000 debit
    'Total,,"5,10,000","5,10,000"', // dropped
  ].join('\n');
  const res = parseTb(buf(csv));
  assert.equal(res.ok, true);
  if (!res.ok) return;

  assert.equal(res.columns.code.header, 'Ledger Code'); // synonym surfaced
  assert.equal(res.columns.credit.header, 'Credit Amount');

  // The sign flip is a PROPOSAL, default OFF — the value stays as written in its original column.
  assert.equal(res.proposals.length, 1);
  assert.equal(res.proposals[0].account, 'Bank Charges Refund');
  assert.equal(res.proposals[0].cell, 'credit');
  assert.equal(res.proposals[0].originalText, '(10,000)');
  assert.equal(res.proposals[0].accepted, false);

  // As written: ₹10,000 stays in CREDIT → the TB is OUT of balance by ₹20,000 (the gate will catch it,
  // rather than the parser silently making it balance).
  assert.equal(res.totals.debitPaise, 50000000);
  assert.equal(res.totals.creditPaise, 52000000);

  assert.equal(res.skipped.length, 1);
  assert.match(res.skipped[0].reason, /Total/);

  // Accepting the flip moves it credit → debit and balances the TB — the analyst's explicit choice.
  const flipped = parseTb({ ...buf(csv), acceptedFlips: [4] });
  assert.equal(flipped.ok, true);
  if (!flipped.ok) return;
  assert.equal(flipped.proposals[0].accepted, true);
  assert.equal(flipped.totals.debitPaise, 51000000);
  assert.equal(flipped.totals.creditPaise, 51000000);
});

// --- GATE CASE (c): garbage / unrecognised column layout → BLOCK ----------
test('GATE(c): unrecognised columns are blocked at parse', () => {
  const res = parseTb(buf('foo,bar,baz\n1,2,3\n9,8,7\n'));
  assert.equal(res.ok, false);
  if (res.ok) return;
  assert.equal(res.errors[0].kind, 'missing_columns');
  assert.match(res.errors[0].message, /account_code, account_name, debit, credit/);
});

// --- GATE CASE (a): Σdebits ≠ Σcredits → BLOCK ----------------------------
test('GATE(a): unbalanced TB fails tb_balances', () => {
  const rows: ParsedTbRow[] = [
    { rowNumber: 1, accountCode: '1000', accountName: 'Cash', debitPaise: 100000, creditPaise: 0 },
    { rowNumber: 2, accountCode: '4000', accountName: 'Sales', debitPaise: 0, creditPaise: 90000 },
  ];
  const report = validateTb({
    rows,
    mappingByCode: new Map([['1000', 'cash_bank'], ['4000', 'operating_revenue']]),
    categoryMeta: catMeta,
  });
  assert.equal(report.ok, false);
  const rule = report.rules.find((r) => r.id === 'tb_balances')!;
  assert.equal(rule.status, 'fail');
  assert.match(rule.summary, /out of balance/);
});

// --- GATE CASE (b): an unmapped account → BLOCK ---------------------------
test('GATE(b): an unmapped account fails no_unmapped', () => {
  const rows: ParsedTbRow[] = [
    { rowNumber: 1, accountCode: '1000', accountName: 'Cash', debitPaise: 100000, creditPaise: 0 },
    { rowNumber: 2, accountCode: '9999', accountName: 'Mystery Account', debitPaise: 0, creditPaise: 100000 },
  ];
  const report = validateTb({
    rows,
    mappingByCode: new Map([['1000', 'cash_bank']]), // 9999 deliberately missing
    categoryMeta: catMeta,
  });
  assert.equal(report.ok, false);
  const rule = report.rules.find((r) => r.id === 'no_unmapped')!;
  assert.equal(rule.status, 'fail');
  assert.equal(rule.offenders?.[0].label, '9999 — Mystery Account');
});

// --- sign sanity: revenue showing a debit balance → BLOCK -----------------
test('sign_sanity flags an inverted revenue balance', () => {
  const rows: ParsedTbRow[] = [
    { rowNumber: 1, accountCode: '4000', accountName: 'Sales', debitPaise: 50000, creditPaise: 0 }, // wrong side
    { rowNumber: 2, accountCode: '1000', accountName: 'Cash', debitPaise: 0, creditPaise: 50000 },
  ];
  const report = validateTb({
    rows,
    mappingByCode: new Map([['4000', 'operating_revenue'], ['1000', 'cash_bank']]),
    categoryMeta: catMeta,
  });
  const rule = report.rules.find((r) => r.id === 'sign_sanity')!;
  assert.equal(rule.status, 'fail');
});

// --- period continuity: a month gap → BLOCK -------------------------------
test('period_continuity fails on a month gap', () => {
  const report = validateTb({
    rows: [{ rowNumber: 1, accountCode: '1000', accountName: 'Cash', debitPaise: 0, creditPaise: 0 }],
    mappingByCode: new Map([['1000', 'cash_bank']]),
    categoryMeta: catMeta,
    continuity: { isFirstPeriod: false, priorExists: true, priorMonth: '2026-04-01', thisMonth: '2026-06-01' },
  });
  assert.equal(report.rules.find((r) => r.id === 'period_continuity')!.status, 'fail');
});

// --- the gate PASSES on clean, balanced, fully-mapped data ----------------
test('gate passes on clean balanced mapped data', () => {
  const rows: ParsedTbRow[] = [
    { rowNumber: 1, accountCode: '1000', accountName: 'Cash', debitPaise: 100000, creditPaise: 0 },
    { rowNumber: 2, accountCode: '4000', accountName: 'Sales', debitPaise: 0, creditPaise: 100000 },
  ];
  const report = validateTb({
    rows,
    mappingByCode: new Map([['1000', 'cash_bank'], ['4000', 'operating_revenue']]),
    categoryMeta: catMeta,
    continuity: { isFirstPeriod: true, priorExists: false, thisMonth: '2026-04-01' },
  });
  assert.equal(report.ok, true);
  assert.ok(report.rules.every((r) => r.status !== 'fail'));
});

// --- fuzzy: real-world account names land on the right category -----------
test('suggestCategories ranks the obvious match first', () => {
  assert.equal(suggestCategories({ code: '1000', name: 'HDFC Bank Current A/c' }, CATS)[0]?.code, 'cash_bank');
  assert.equal(suggestCategories({ code: '1100', name: 'Sundry Debtors' }, CATS)[0]?.code, 'trade_receivables');
  assert.equal(suggestCategories({ code: '4000', name: 'Sales - Services' }, CATS)[0]?.code, 'operating_revenue');
});
