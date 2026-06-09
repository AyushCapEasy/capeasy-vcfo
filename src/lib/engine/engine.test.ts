// src/lib/engine/engine.test.ts — pure-engine tests (run: npm test). Two articulated periods
// (Apr→May, the corrected D-003 demo numbers in paise). Invariants must PASS on clean data, and the
// perturbation must show the cash tie-out is LIVE: corrupt a non-cash line by X → tie breaks by X.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeChain, computePeriod } from './engine';
import { checkInvariants, perturbNatural } from './invariants';
import type { PeriodEngineInput } from './types';

const APR: PeriodEngineInput = {
  periodId: 'apr', label: 'Apr 2026', periodMonth: '2026-04-01',
  tb: { debitPaise: 1_000_000_000, creditPaise: 1_000_000_000 },
  naturals: {
    cash_bank: 513500000, trade_receivables: 220000000, inventory: 110000000, prepaid_advances: 20000000, ppe: 310000000,
    trade_payables: 135000000, short_term_borrowings: 80000000, statutory_dues: 36250000, long_term_borrowings: 240000000,
    share_capital: 500000000, reserves_surplus: 160000000,
    operating_revenue: 300000000, cogs: 120000000, employee_benefits: 70000000, rent_utilities: 19000000,
    sales_marketing: 20000000, technology_software: 8000000, professional_fees: 6000000, admin_other_opex: 11000000,
    depreciation_amortisation: 10000000, finance_costs: 5000000, tax_expense: 8750000,
  },
};

const MAY: PeriodEngineInput = {
  periodId: 'may', label: 'May 2026', periodMonth: '2026-05-01',
  tb: { debitPaise: 1_000_000_000, creditPaise: 1_000_000_000 },
  naturals: {
    cash_bank: 498950000, trade_receivables: 240000000, inventory: 115000000, prepaid_advances: 18000000, ppe: 330000000,
    trade_payables: 140000000, short_term_borrowings: 80000000, statutory_dues: 40000000, long_term_borrowings: 230000000,
    share_capital: 500000000, reserves_surplus: 182250000,
    operating_revenue: 330000000, cogs: 132000000, employee_benefits: 72000000, rent_utilities: 19200000,
    sales_marketing: 24000000, technology_software: 8500000, professional_fees: 6500000, admin_other_opex: 12000000,
    depreciation_amortisation: 10000000, finance_costs: 4800000, tax_expense: 11300000,
  },
};

test('P&L waterfall ties to net profit (Apr)', () => {
  const r = computePeriod(APR, null);
  assert.equal(r.pnl.grossProfitPaise, 180000000); // 300m - 120m
  assert.equal(r.pnl.ebitdaPaise, 46000000);
  assert.equal(r.pnl.netProfitPaise, 22250000); // ₹2,22,500
});

test('all §4.5 invariants PASS on clean articulated data', () => {
  const [aprR, mayR] = computeChain([APR, MAY]);
  const aprInv = checkInvariants(APR, aprR, null);
  const mayInv = checkInvariants(MAY, mayR, { input: APR, result: aprR });

  assert.ok(aprInv.every((x) => x.status !== 'fail'), 'Apr invariants');
  assert.ok(mayInv.every((x) => x.status !== 'fail'), 'May invariants');
  // May has a prior, so cash tie-out and RE roll actually run and pass:
  assert.equal(mayInv.find((x) => x.id === 'cash_tie_out')!.status, 'pass');
  assert.equal(mayInv.find((x) => x.id === 'pl_to_equity')!.status, 'pass');
});

test('cash tie-out is independent: CF closing built without reading period-t cash', () => {
  const [, mayR] = computeChain([APR, MAY]);
  assert.equal(mayR.cashFlow.available, true);
  if (!mayR.cashFlow.available) return;
  // CF-derived closing equals BS cash — two independent sources.
  assert.equal(mayR.cashFlow.closingCashPaise, mayR.balanceSheet.cashPaise);
  assert.equal(mayR.cashFlow.closingCashPaise, 498950000);
});

test('PERTURBATION: corrupt a non-cash line by ₹50,000 → cash tie breaks by exactly ₹50,000', () => {
  const X = 5000000; // ₹50,000 in paise
  const aprR = computePeriod(APR, null);
  const corruptedMay = perturbNatural(MAY, 'trade_receivables', X, 'debit');
  const mayR = computePeriod(corruptedMay, APR);
  const inv = checkInvariants(corruptedMay, mayR, { input: APR, result: aprR });

  const cashTie = inv.find((x) => x.id === 'cash_tie_out')!;
  assert.equal(cashTie.status, 'fail');
  assert.equal(Math.abs(cashTie.deltaPaise!), X); // breaks by EXACTLY the corruption
  // BS cash itself was untouched — the break came from the CF side, proving independence.
  assert.equal(mayR.balanceSheet.cashPaise, 498950000);
});
