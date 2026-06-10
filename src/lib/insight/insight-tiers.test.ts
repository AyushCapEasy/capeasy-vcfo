// src/lib/insight/insight-tiers.test.ts — Tiers 2 & 3 over the seeded Acme engine output.
// Asserts: every diagnosis rule resolves + additive decompositions sum to the observed delta EXACTLY;
// recommendations re-derive from engine figures + rules resolve; goal-tracking current values trace to
// engine fields; everything is status:'UNVERIFIED'.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeChain } from '../engine/engine';
import type { PeriodEngineInput, PeriodResult } from '../engine/types';
import { computeObservations } from './observations';
import { computeDiagnoses, DIAGNOSIS_RULES } from './diagnoses';
import { computeRecommendations, RECOMMENDATION_RULES, computeGoalTracking } from './recommendations';

const APR: PeriodEngineInput = { periodId: 'apr', label: 'Apr 2026', periodMonth: '2026-04-01', tb: { debitPaise: 1e9, creditPaise: 1e9 }, naturals: { cash_bank: 513500000, trade_receivables: 220000000, inventory: 110000000, prepaid_advances: 20000000, ppe: 310000000, trade_payables: 135000000, short_term_borrowings: 80000000, statutory_dues: 36250000, long_term_borrowings: 240000000, share_capital: 500000000, reserves_surplus: 160000000, operating_revenue: 300000000, cogs: 120000000, employee_benefits: 70000000, rent_utilities: 19000000, sales_marketing: 20000000, technology_software: 8000000, professional_fees: 6000000, admin_other_opex: 11000000, depreciation_amortisation: 10000000, finance_costs: 5000000, tax_expense: 8750000 } };
const MAY: PeriodEngineInput = { periodId: 'may', label: 'May 2026', periodMonth: '2026-05-01', tb: { debitPaise: 1e9, creditPaise: 1e9 }, naturals: { cash_bank: 498950000, trade_receivables: 240000000, inventory: 115000000, prepaid_advances: 18000000, ppe: 330000000, trade_payables: 140000000, short_term_borrowings: 80000000, statutory_dues: 40000000, long_term_borrowings: 230000000, share_capital: 500000000, reserves_surplus: 182250000, operating_revenue: 330000000, cogs: 132000000, employee_benefits: 72000000, rent_utilities: 19200000, sales_marketing: 24000000, technology_software: 8500000, professional_fees: 6500000, admin_other_opex: 12000000, depreciation_amortisation: 10000000, finance_costs: 4800000, tax_expense: 11300000 } };
const JUN: PeriodEngineInput = { periodId: 'jun', label: 'Jun 2026', periodMonth: '2026-06-01', tb: { debitPaise: 1e9, creditPaise: 1e9 }, naturals: { cash_bank: 536975000, trade_receivables: 260000000, inventory: 120000000, prepaid_advances: 18000000, ppe: 329500000, trade_payables: 148000000, short_term_borrowings: 100000000, statutory_dues: 45000000, long_term_borrowings: 220000000, share_capital: 500000000, reserves_surplus: 211950000, operating_revenue: 363000000, cogs: 145200000, employee_benefits: 75000000, rent_utilities: 20000000, sales_marketing: 25000000, technology_software: 9000000, professional_fees: 7000000, admin_other_opex: 12500000, depreciation_amortisation: 10500000, finance_costs: 4600000, tax_expense: 14675000 } };

const RESULTS: PeriodResult[] = computeChain([APR, MAY, JUN]);
const OBS = computeObservations(RESULTS);
const obsById = new Map(OBS.map((o) => [o.id, o]));
const DIAG = computeDiagnoses(OBS, RESULTS);
const RECS = computeRecommendations(OBS, DIAG, RESULTS);
const GOALS = computeGoalTracking(RESULTS);
const byId = new Map(RESULTS.map((r) => [r.periodId, r]));
function resolve(r: PeriodResult, path: string): number | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return path.split('.').reduce((o: any, k) => (o == null ? null : o[k]), r as any) as number | null;
}

test('Tier 2: a diagnosis per observation, valid rule ids, UNVERIFIED', () => {
  const ruleIds = new Set(DIAGNOSIS_RULES.map((r) => r.id));
  assert.equal(DIAG.length, OBS.length, 'one diagnosis per observation');
  for (const d of DIAG) {
    assert.ok(ruleIds.has(d.ruleId), `valid rule id: ${d.ruleId}`);
    assert.equal(d.status, 'UNVERIFIED');
    assert.ok(obsById.has(d.observationId), 'diagnosis maps to an observation');
    for (const dr of d.drivers) for (const p of dr.traces) assert.ok(typeof p === 'string' && p.length > 0, 'driver trace present');
  }
});

test('Tier 2: additive decompositions sum EXACTLY to the observed delta', () => {
  for (const d of DIAG.filter((x) => x.decomposition === 'additive')) {
    const o = obsById.get(d.observationId)!;
    const sum = d.drivers.reduce((s, dr) => s + (dr.contributionPp ?? dr.contributionPaise ?? dr.effectAbs ?? 0), 0);
    assert.ok(Math.abs(sum - o.deltaAbs) < 1e-6, `${d.observationId}: drivers (${sum}) sum to deltaAbs (${o.deltaAbs})`);
  }
});

test('Tier 2: working-capital single-factor implied balances round-trip to the engine metric', () => {
  for (const d of DIAG.filter((x) => x.ruleId === 'DIAG.working_capital_factors')) {
    const o = obsById.get(d.observationId)!;
    const [fromId] = d.observationId.split(':')[1].split('->');
    const from = byId.get(fromId)!;
    const days = from.workingCapital.daysInMonth;
    const bal = d.drivers[0]; // implied balance driver
    const flow = d.drivers[1].fromValue; // revenue or COGS (from)
    // implied metric_from = balance_from × days_from ÷ flow_from must equal the observation's from value
    assert.ok(Math.abs((bal.fromValue * days) / flow - o.values.from) < 1e-6, `${d.observationId}: implied balance round-trips`);
  }
});

test('Tier 3: recommendations have valid rules, trace, and re-derive from engine figures', () => {
  const ruleIds = new Set(RECOMMENDATION_RULES.map((r) => r.id));
  for (const r of RECS) {
    assert.ok(ruleIds.has(r.ruleId), `valid rec rule: ${r.ruleId}`);
    assert.equal(r.status, 'UNVERIFIED');
    assert.ok(obsById.has(r.fromDiagnosisId), 'rec maps to a diagnosis/observation');
    assert.ok(r.quantifiedImpact.traces.every((p) => p.length > 0), 'impact traces present');
  }
  // Acme (improving) fires the DPO-defer rec (DPO fell May→Jun); re-derive its figure from engine fields.
  const dpoRec = RECS.find((r) => r.ruleId === 'REC.dpo_cash_defer');
  assert.ok(dpoRec, 'DPO cash-defer recommendation fires');
  const jun = byId.get('jun')!;
  const may = byId.get('may')!;
  const expected = ((may.workingCapital.dpo! - jun.workingCapital.dpo!) * jun.pnl.cogsPaise) / jun.workingCapital.daysInMonth;
  assert.ok(Math.abs(dpoRec!.quantifiedImpact.figurePaise - expected) < 1e-6, 'DPO impact re-derives from engine fields');
  // favourable moves do NOT manufacture advice: opex/revenue fell, so no opex-savings rec
  assert.ok(!RECS.some((r) => r.ruleId === 'REC.opex_ratio_savings'), 'no opex rec on a favourable (falling) opex ratio');
});

test('Tier 3: goal-tracking currents trace to engine fields; placeholder targets; UNVERIFIED', () => {
  assert.equal(GOALS.length, 4);
  const jun = byId.get('jun')!;
  for (const g of GOALS) {
    assert.equal(g.status, 'UNVERIFIED');
    assert.equal(g.placeholderTarget, true);
    const engineVal = resolve(jun, g.traces[0].enginePath);
    if (g.goalId === 'goal.revenue_annualised') assert.equal(g.current, (engineVal as number) * 12);
    else assert.equal(g.current, engineVal); // gross/net margin, runway read the field directly
  }
  // spot-check trajectory vs placeholder targets
  assert.equal(GOALS.find((g) => g.goalId === 'goal.gross_margin')!.trackStatus, 'off_track'); // 60% < 62%
  assert.equal(GOALS.find((g) => g.goalId === 'goal.runway')!.trackStatus, 'na');               // Jun runway n/a (cash-generative)
});
