// src/lib/insight/observations.test.ts — Tier 1 observations (run: npm test).
// Feeds the SEEDED Acme 3-period data through the REAL engine, then asserts:
//  (1) the engine output reproduces the PROPOSED-golden values (so we test genuine seeded output),
//  (2) every observation's numbers equal the engine field(s) it traces to, EXACTLY,
//  (3) every trace.enginePath resolves to a real PeriodResult field,
//  (4) delta math + threshold filtering are correct, and every observation is status:'UNVERIFIED'.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeChain } from '../engine/engine';
import type { PeriodEngineInput, PeriodResult } from '../engine/types';
import { computeObservations, OBSERVATION_THRESHOLDS } from './observations';

// --- Seeded Acme inputs (paise). Apr & May are verbatim from engine.test.ts; Jun reproduces the
//     PROPOSED-golden Jun output (verified: NP/BS/CF/WC all tie). ---
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
const JUN: PeriodEngineInput = {
  periodId: 'jun', label: 'Jun 2026', periodMonth: '2026-06-01',
  tb: { debitPaise: 1_000_000_000, creditPaise: 1_000_000_000 },
  naturals: {
    cash_bank: 536975000, trade_receivables: 260000000, inventory: 120000000, prepaid_advances: 18000000, ppe: 329500000,
    trade_payables: 148000000, short_term_borrowings: 100000000, statutory_dues: 45000000, long_term_borrowings: 220000000,
    share_capital: 500000000, reserves_surplus: 211950000,
    operating_revenue: 363000000, cogs: 145200000, employee_benefits: 75000000, rent_utilities: 20000000,
    sales_marketing: 25000000, technology_software: 9000000, professional_fees: 7000000, admin_other_opex: 12500000,
    depreciation_amortisation: 10500000, finance_costs: 4600000, tax_expense: 14675000,
  },
};

const RESULTS: PeriodResult[] = computeChain([APR, MAY, JUN]);
const byId = new Map(RESULTS.map((r) => [r.periodId, r]));
function resolve(r: PeriodResult, path: string): number | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return path.split('.').reduce((o: any, k) => (o == null ? null : o[k]), r as any) as number | null;
}

test('inputs reproduce the PROPOSED-golden engine output (genuine seeded Acme)', () => {
  const [apr, may, jun] = RESULTS;
  // P&L net profit
  assert.equal(apr.pnl.netProfitPaise, 22250000);
  assert.equal(may.pnl.netProfitPaise, 29700000);
  assert.equal(jun.pnl.netProfitPaise, 39525000);
  // BS cash (independent source)
  assert.equal(jun.balanceSheet.cashPaise, 536975000);
  // CF closing ties to BS cash (Jun), built independently
  assert.equal(jun.cashFlow.available, true);
  if (jun.cashFlow.available) assert.equal(jun.cashFlow.closingCashPaise, 536975000);
  // ratios / WC spot-checks
  assert.equal(jun.ratios.grossMarginPct, 60);
  assert.ok(Math.abs(jun.ratios.currentRatio! - 3.1910409556313994) < 1e-9);
  assert.ok(Math.abs(jun.workingCapital.dso! - 21.487603305785125) < 1e-9);
});

const OBS = computeObservations(RESULTS);

test('every observation traces to the EXACT engine value, and traces resolve', () => {
  assert.ok(OBS.length > 0, 'expected some observations');
  for (const o of OBS) {
    assert.equal(o.status, 'UNVERIFIED');
    const [fromL, toL] = o.periodsCompared;
    // recover from/to results via the trace periodIds
    const fromId = o.traces[0].periodId;
    const toId = o.traces[1].periodId;
    const fromR = byId.get(fromId)!;
    const toR = byId.get(toId)!;
    assert.equal(fromR.label, fromL);
    assert.equal(toR.label, toL);

    // every trace path resolves to a finite number on its period
    for (const tr of o.traces) {
      const v = resolve(byId.get(tr.periodId)!, tr.enginePath);
      assert.ok(typeof v === 'number' && Number.isFinite(v), `trace ${tr.enginePath} @ ${tr.periodId} resolves`);
      assert.ok(tr.categoryGroups.length > 0, 'trace carries category groups');
    }

    // values equal the engine output EXACTLY
    if (o.family === 'expense_ratio') {
      // derived = (numerator / revenue) * 100 from the two traced engine fields
      const numPathFrom = o.traces[0].enginePath; // numerator field (cogs or opex)
      const revPath = 'pnl.operatingRevenuePaise';
      const expFrom = (resolve(fromR, numPathFrom)! / resolve(fromR, revPath)!) * 100;
      const expTo = (resolve(toR, numPathFrom)! / resolve(toR, revPath)!) * 100;
      assert.equal(o.values.from, expFrom);
      assert.equal(o.values.to, expTo);
    } else {
      const path = o.traces[0].enginePath;
      assert.equal(o.values.from, resolve(fromR, path));
      assert.equal(o.values.to, resolve(toR, path));
    }

    // delta math
    assert.equal(o.deltaAbs, o.values.to - o.values.from);
    if (o.deltaPp !== undefined) assert.equal(o.deltaPp, o.values.to - o.values.from);
    if (o.deltaPct !== undefined) assert.ok(Math.abs(o.deltaPct - ((o.values.to - o.values.from) / Math.abs(o.values.from)) * 100) < 1e-9);
    const expDir = o.deltaAbs > 0 ? 'up' : o.deltaAbs < 0 ? 'down' : 'flat';
    assert.equal(o.direction, expDir);
  }
});

test('threshold filtering: flat / sub-threshold metrics are NOT surfaced; notable ones are', () => {
  const keys = new Set(OBS.map((o) => o.id.split(':')[0]));
  // gross margin is flat at 60% across all periods → never notable
  assert.ok(!keys.has('gross_margin'), 'flat gross margin must not surface');
  // current ratio moves < 10% → not surfaced
  assert.ok(!keys.has('current_ratio'), 'sub-threshold current ratio must not surface');
  // these clear thresholds on the seeded data
  assert.ok(keys.has('operating_revenue'), 'revenue +10% should surface');
  assert.ok(keys.has('net_profit'), 'net profit +~33% should surface');
  assert.ok(keys.has('ebitda_margin'), 'EBITDA margin move should surface');
  assert.ok(keys.has('interest_coverage'), 'interest coverage move should surface');
});

test('a known observation reads exactly the engine field (EBITDA margin, May→Jun)', () => {
  const o = OBS.find((x) => x.id === 'ebitda_margin:may->jun');
  assert.ok(o, 'EBITDA margin May→Jun observation exists');
  assert.equal(o!.values.from, byId.get('may')!.ratios.ebitdaMarginPct);
  assert.equal(o!.values.to, byId.get('jun')!.ratios.ebitdaMarginPct);
  assert.equal(o!.unit, 'pp');
  assert.equal(o!.deltaPp, o!.values.to - o!.values.from);
});

test('thresholds are the exported, configurable constant', () => {
  // tightening a threshold drops observations; loosening adds them (configurable, deterministic)
  const strict = computeObservations(RESULTS, { ...OBSERVATION_THRESHOLDS, marginMovePp: 100 });
  assert.ok(strict.filter((o) => o.unit === 'pp').length === 0, 'huge pp threshold removes all pp observations');
  const loose = computeObservations(RESULTS, { ...OBSERVATION_THRESHOLDS, workingCapitalMoveDays: 0 });
  assert.ok(loose.length > OBS.length, 'zero day-threshold surfaces more working-capital observations');
});
