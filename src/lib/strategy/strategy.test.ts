// src/lib/strategy/strategy.test.ts — the strategy layer must read the right SITUATION, trace every
// statement to a real number, rank priorities for the position (runway > margin when cash is short),
// FLAG the mechanically-correct-but-harmful "pay suppliers slower" move instead of asserting it, and
// DEGRADE HONESTLY on one period. Fixtures run through the real engine + forecast.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeChain } from '../engine/engine';
import type { PeriodEngineInput } from '../engine/types';
import { buildStrategy } from './strategy';

const M = 1_000_000;
const P = (idx: number, month: string, revenue: number, cogs: number, opex: number, cash: number, ar = 0): PeriodEngineInput => ({
  periodId: `p${idx}`, label: `M${idx}`, periodMonth: month,
  tb: { debitPaise: 0, creditPaise: 0 },
  naturals: { operating_revenue: revenue, cogs, employee_benefits: opex, cash_bank: cash, trade_receivables: ar },
});

// SHORT RUNWAY: loss-making (net −20M/mo), 40% gross margin, cash 60→40→20 (burn 20M → runway 1.0 mo),
// with receivables on the book (so the working-capital / supplier-stretch levers apply).
const SHORT = computeChain([
  P(0, '2026-01-01', 100 * M, 60 * M, 60 * M, 60 * M, 30 * M),
  P(1, '2026-02-01', 105 * M, 63 * M, 62 * M, 40 * M, 30 * M),
  P(2, '2026-03-01', 110 * M, 66 * M, 64 * M, 20 * M, 30 * M),
]);

// HEALTHY GROWTH: profitable, revenue +~15%/mo, ~60% gross margin, cash building 50→70→95 (not burning).
const GROWTH = computeChain([
  P(0, '2026-01-01', 100 * M, 40 * M, 20 * M, 50 * M),
  P(1, '2026-02-01', 115 * M, 46 * M, 22 * M, 70 * M),
  P(2, '2026-03-01', 132 * M, 53 * M, 24 * M, 95 * M),
]);

const everyTraced = (s: ReturnType<typeof buildStrategy>) =>
  s.trajectory.every((t) => t.traces.length > 0) && s.levers.every((l) => l.traces.length > 0);

test('SHORT RUNWAY: situation read, runway-extension levers with real numbers, runway outranks margin', () => {
  const s = buildStrategy(SHORT);
  assert.equal(s.situation, 'short_runway');
  assert.equal(s.sufficient, true);
  // the three honest runway-extension options, each present and number-traced
  const titles = s.levers.map((l) => l.title).join(' | ');
  assert.match(titles, /Cut burn/);
  assert.match(titles, /Raise ~/);
  assert.match(titles, /breakeven/);
  assert.ok(everyTraced(s), 'every trajectory + lever carries a number trace');
  // priority ranking: runway extension is #1 and explicitly outranks margin
  assert.equal(s.priorities[0].rank, 1);
  assert.match(s.priorities[0].focus, /runway/i);
  assert.match(s.priorities[0].because, /outranks margin/i);
});

test('SHORT RUNWAY: the "pay suppliers slower" move is FLAGGED for review, never asserted', () => {
  const s = buildStrategy(SHORT);
  const supplierLevers = s.levers.filter((l) => /supplier/i.test(l.title + l.rationale));
  assert.ok(supplierLevers.length > 0, 'the supplier-stretch lever is surfaced');
  // EVERY mention of stretching suppliers must be flagged for review — none asserted as a clean rec
  assert.ok(supplierLevers.every((l) => l.flaggedForReview === true), 'supplier-stretch is flagged, not asserted');
  assert.match(supplierLevers[0].reviewReason ?? '', /relationship|risk|naive/i);
  assert.ok(s.reviewFlags.some((f) => /supplier/i.test(f)), 'flagged in the review list');
});

test('HEALTHY GROWTH: profitable-growing situation, growth/margin levers (not runway), no supplier flag', () => {
  const s = buildStrategy(GROWTH);
  assert.equal(s.situation, 'profitable_growing');
  assert.match(s.priorities[0].focus, /growth/i); // sustain growth, not "extend runway"
  assert.match(s.trajectory.map((t) => t.headline).join(' '), /Already profitable/);
  // not burning → no runway-extension or supplier-stretch levers
  const titles = s.levers.map((l) => l.title).join(' | ');
  assert.doesNotMatch(titles, /Cut burn|Raise ~/);
  assert.ok(!s.levers.some((l) => l.flaggedForReview), 'no flagged-for-review lever when cash is not the constraint');
  assert.ok(everyTraced(s), 'every statement number-traced');
});

test('THIN DATA: one period → insufficient, no trajectory or levers invented', () => {
  const s = buildStrategy(computeChain([P(0, '2026-01-01', 100 * M, 60 * M, 60 * M, 60 * M)]));
  assert.equal(s.situation, 'insufficient_data');
  assert.equal(s.sufficient, false);
  assert.equal(s.confidence, 'none');
  assert.equal(s.trajectory.length, 0);
  assert.equal(s.levers.length, 0);
  assert.match(s.note, /Insufficient history/i);
  assert.match(s.priorities[0].focus, /Load a second period/i); // honest next step, not strategy
});

test('status carries the unverified/estimate flag (leans on forecasts)', () => {
  assert.equal(buildStrategy(SHORT).status, 'UNVERIFIED_ESTIMATE');
  assert.equal(buildStrategy(GROWTH).status, 'UNVERIFIED_ESTIMATE');
});
