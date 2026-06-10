// src/lib/verify/cross-check.test.ts — M-verify (b): the bug-finder harness behaves as a diff tool.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeChain } from '../engine/engine';
import type { PeriodEngineInput } from '../engine/types';
import { toComparable, diffComparable, buildExport } from './cross-check';

const base = { operating_revenue: 30000000, cogs: 12000000, employee_benefits: 8000000, depreciation_amortisation: 1000000, finance_costs: 500000, tax_expense: 1000000, cash_bank: 50000000, trade_receivables: 22000000, inventory: 11000000, ppe: 31000000, trade_payables: 13000000, short_term_borrowings: 8000000, long_term_borrowings: 24000000, share_capital: 50000000, reserves_surplus: 16000000 };
const P1: PeriodEngineInput = { periodId: 'p1', label: 'P1', periodMonth: '2026-04-01', tb: { debitPaise: 0, creditPaise: 0 }, naturals: { ...base }, recurringRevenuePaise: null };
const P2: PeriodEngineInput = { periodId: 'p2', label: 'P2', periodMonth: '2026-05-01', tb: { debitPaise: 0, creditPaise: 0 }, naturals: { ...base, operating_revenue: 33000000, cogs: 13200000 }, recurringRevenuePaise: null };

const [r1, r2] = computeChain([P1, P2]);

test('toComparable maps engine fields to ₹ exactly', () => {
  const c = toComparable(P2, r2);
  assert.equal(c.computedRupees.operatingRevenue, r2.pnl.operatingRevenuePaise / 100);
  assert.equal(c.computedRupees.netProfit, r2.pnl.netProfitPaise / 100);
  assert.equal(c.computedRupees.totalAssets, r2.balanceSheet.totalAssetsPaise / 100);
  assert.notEqual(c.computedRupees.cfo, null); // P2 has a prior → CF available
  assert.equal(toComparable(P1, r1).computedRupees.cfo, null); // P1 first period → CF n/a
  assert.equal(c.inputsRupees.operating_revenue, P2.naturals.operating_revenue / 100);
});

test('diffComparable: identical → no disagreements; a slip → flagged', () => {
  const ours = toComparable(P2, r2);
  assert.equal(diffComparable(ours, ours).length, 0);
  const theirs = { computedRupees: { ...ours.computedRupees, netProfit: (ours.computedRupees.netProfit as number) + 100 } };
  const d = diffComparable(ours, theirs);
  assert.equal(d.length, 1);
  assert.equal(d[0].field, 'netProfit');
  assert.equal(d[0].deltaRupees, -100);
});

test('buildExport carries the bug-finder caveat (never VERIFIED on agreement)', () => {
  const ex = buildExport([{ input: P1, result: r1 }, { input: P2, result: r2 }]);
  assert.equal(ex.cases.length, 2);
  assert.match(ex._meta.caveat, /NEVER|consistency/i);
});
