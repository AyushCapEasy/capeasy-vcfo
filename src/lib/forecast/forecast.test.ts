// src/lib/forecast/forecast.test.ts — the forecast must (a) project on the real trailing trend with the
// right math, (b) get runway right, (c) move optimistic > base > pessimistic, and (d) DEGRADE HONESTLY
// on one period (no trend from a single point). Fixtures are built through the real engine (computeChain).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeChain } from '../engine/engine';
import type { PeriodEngineInput } from '../engine/types';
import { buildForecast, roundSigPaise } from './forecast';

// One period of inputs: revenue / COGS / opex / cash (paise). Others default to 0 in the engine.
const P = (idx: number, month: string, revenue: number, cogs: number, opex: number, cash: number): PeriodEngineInput => ({
  periodId: `p${idx}`, label: `M${idx}`, periodMonth: month,
  tb: { debitPaise: 0, creditPaise: 0 },
  naturals: { operating_revenue: revenue, cogs, employee_benefits: opex, cash_bank: cash },
});

// 3 periods. Revenue 100→110→132 (MoM growth 0.10, 0.20 → mean 0.15, sample s.d. ≈ 0.0707).
// COGS 50→55→60, opex 30→33→36, cash 100→80→55 (burn 20, 25 → mean 22.5 → runway 55/22.5 = 2.44).
const M = 1_000_000; // ₹10,000 in paise — keeps the fixture readable
const A = computeChain([
  P(0, '2026-01-01', 100 * M, 50 * M, 30 * M, 100 * M),
  P(1, '2026-02-01', 110 * M, 55 * M, 33 * M, 80 * M),
  P(2, '2026-03-01', 132 * M, 60 * M, 36 * M, 55 * M),
]);

test('roundSigPaise kills false precision (3 significant figures of rupees)', () => {
  assert.equal(roundSigPaise(151_800_000), 152_000_000); // ₹15,18,000 → ₹15,20,000
  assert.equal(roundSigPaise(0), 0);
});

test('revenue forecast: trailing average MoM growth, compounded; rounded; labelled forecast', () => {
  const f = buildForecast(A, { horizon: 6, scenario: 'base' });
  assert.equal(f.quality.periods, 3);
  assert.equal(f.quality.sufficient, true);
  assert.equal(f.quality.confidence, 'moderate');
  assert.ok(Math.abs(f.baseGrowthRate! - 0.15) < 1e-9, 'base growth = mean(0.10, 0.20) = 0.15');
  assert.ok(Math.abs(f.growthSpread! - Math.sqrt(0.005)) < 1e-9, 'spread = sample s.d. of MoM growth');
  assert.equal(f.revenue!.projection.length, 6);
  assert.equal(f.revenue!.projection[0].actual, false); // explicitly a forecast, not actual
  assert.equal(f.revenue!.projection[0].paise, 152_000_000); // 132M × 1.15 = 151.8M → 3 s.f. → 152M
  assert.ok(f.revenue!.basis.includes('15.0%'), 'assumption surfaced');
});

test('horizon controls projection length (3 / 6 / 12)', () => {
  assert.equal(buildForecast(A, { horizon: 3 }).revenue!.projection.length, 3);
  assert.equal(buildForecast(A, { horizon: 12 }).revenue!.projection.length, 12);
});

test('cost lines project on their OWN trailing growth; net profit = revenue − total costs', () => {
  const f = buildForecast(A, { horizon: 6, scenario: 'base' });
  const cogs = f.costs.find((c) => c.metric === 'Cost of goods sold')!;
  assert.equal(cogs.projection[0].paise, 65_700_000); // 60M × 1.09545 = 65.73M → 3 s.f. → 65.7M
  assert.equal(f.netProfit!.projection[0].paise, 46_600_000); // 151.8M − 105.16M = 46.64M → 46.6M
  assert.equal(f.netProfit!.metric, 'Net profit / (burn)');
});

test('runway: current cash ÷ observed flat burn; months-to-zero is right', () => {
  const f = buildForecast(A, { horizon: 6 });
  assert.equal(f.runway!.currentCashPaise, 55 * M);
  assert.equal(f.runway!.monthlyBurnPaise, 22_500_000); // mean(20M, 25M)
  assert.equal(f.runway!.burning, true);
  assert.ok(Math.abs(f.runway!.runwayMonths! - 55 / 22.5) < 1e-9, 'runway = 55M / 22.5M ≈ 2.44 months');
  assert.equal(f.runway!.trajectory.length, 6);
});

test('scenario toggle moves the projection: optimistic > base > pessimistic', () => {
  const opt = buildForecast(A, { scenario: 'optimistic' }).revenue!.projection.at(-1)!.paise;
  const base = buildForecast(A, { scenario: 'base' }).revenue!.projection.at(-1)!.paise;
  const pess = buildForecast(A, { scenario: 'pessimistic' }).revenue!.projection.at(-1)!.paise;
  assert.ok(opt > base && base > pess, `expected ${opt} > ${base} > ${pess}`);
});

test('HONEST DEGRADATION: one period → insufficient history, NO trend invented', () => {
  const one = computeChain([P(0, '2026-01-01', 100 * M, 50 * M, 30 * M, 100 * M)]);
  const f = buildForecast(one, { horizon: 6 });
  assert.equal(f.quality.sufficient, false);
  assert.equal(f.quality.confidence, 'none');
  assert.match(f.quality.note, /Insufficient history/i);
  assert.equal(f.baseGrowthRate, null);
  assert.equal(f.revenue!.monthlyGrowthRate, null);
  assert.equal(f.revenue!.projection.length, 0); // projects NOTHING from a single point
  assert.equal(f.netProfit, null);
  assert.equal(f.runway, null);
  for (const c of f.costs) assert.equal(c.projection.length, 0);
});

test('two periods: forecasts, but scenarios collapse to base (a spread needs ≥3 periods)', () => {
  const two = computeChain([P(0, '2026-01-01', 100 * M, 50 * M, 30 * M, 100 * M), P(1, '2026-02-01', 110 * M, 55 * M, 33 * M, 80 * M)]);
  const f = buildForecast(two, { scenario: 'optimistic' });
  assert.equal(f.quality.sufficient, true);
  assert.equal(f.quality.confidence, 'low');
  assert.equal(f.quality.scenarioSpread, false);
  assert.equal(f.growthSpread, null);
  // optimistic == base because there is no volatility spread yet
  const optFirst = f.revenue!.projection[0].paise;
  const baseFirst = buildForecast(two, { scenario: 'base' }).revenue!.projection[0].paise;
  assert.equal(optFirst, baseFirst);
});
