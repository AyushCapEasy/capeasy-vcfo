// src/lib/decision/decision.test.ts — Decision Engine (M9): Stage 1 rules + Stage 3 gate.
// Asserts the CONFIDENCE behaviour (exact high, keyword mid, ambiguous reduced, unknown declined),
// the gate routing, the transparency contract (every row carries decidedBy + confidence + reasoning),
// coverage arithmetic, and that coverage runs over the seeded data AND all 16 adversarial charts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  classify, classifyRow, bucketOf, gate,
  DECISION_THRESHOLDS, SCORE, reconcileStage0, proposeStage2Llm,
} from './index';
import { SEEDED_ACME_TB, MESSY_TB, rowsFromNaturals } from './sample-charts';
import { CASES, buildInput, computeChainNp } from '../engine/battery-charts';
import type { ParsedTbRow } from '../intake/types';

const dr = (name: string, paise = 1000000, code = ''): ParsedTbRow =>
  ({ rowNumber: 1, accountCode: code, accountName: name, debitPaise: paise, creditPaise: 0 });

// --- Stage 1: confidence is the heart — honest about HOW sure, not just what it guessed ----------

test('distinctive name → high confidence, auto-applied', () => {
  const d = classifyRow(dr('Salaries & Wages'));
  assert.equal(d.proposedCategory, 'employee_benefits');
  assert.equal(d.decidedBy, 'rule');
  assert.ok(d.confidence >= DECISION_THRESHOLDS.autoApplyMin, `confidence ${d.confidence} should be auto-grade`);
  assert.equal(bucketOf(d.confidence), 'auto');
  assert.ok(d.reasoning.length > 0);
});

test('confirmed prior mapping → near-certain, beats name matching', () => {
  const d = classifyRow(dr('Some Cryptic Ledger XYZ', 1000000, 'SUS01'), undefined, {
    byCode: { sus01: 'admin_other_opex' }, byName: {},
  });
  assert.equal(d.ruleId, 'STAGE1.confirmed_mapping');
  assert.equal(d.proposedCategory, 'admin_other_opex');
  assert.equal(d.confidence, SCORE.confirmedConfidence);
  assert.equal(bucketOf(d.confidence), 'auto');
});

test('ambiguous name → confidence REDUCED, routed to founder-confirm', () => {
  const d = classifyRow(dr('Sales – Services')); // near-tie: operating_revenue vs sales_marketing
  assert.ok(d.confidence <= SCORE.ambiguousCap, `confidence ${d.confidence} should be capped low`);
  assert.equal(bucketOf(d.confidence), 'confirm', 'a near-tie keeps its hint → founder-confirm, not flagged');
  assert.match(d.reasoning, /AMBIGUOUS/);
  assert.ok(d.alternatives.length > 0, 'runner-up candidate should be surfaced');
});

test('unknown name → declined (unclassifiable residue), flagged', () => {
  for (const name of ['Suspense A/c', 'Round Off', 'Inter-company Settlement']) {
    const d = classifyRow(dr(name));
    assert.equal(d.proposedCategory, null, `${name} should not be classified`);
    assert.equal(d.decidedBy, 'unclassified', name);
    assert.equal(d.confidence, 0, name);
    assert.equal(d.ruleId, null, name);
    assert.ok(d.reasoning.length > 0, `${name} must still carry reasoning`);
    assert.equal(bucketOf(d.confidence), 'flag', name);
  }
});

test('bare generic stub (e.g. "Misc") is NEVER auto-applied even on a substring hit', () => {
  // "Misc" substring-matches the synonym "misc income"; the low-info guard caps it to founder-confirm.
  const d = classifyRow(dr('Misc'));
  assert.ok(d.confidence <= SCORE.ambiguousCap, `confidence ${d.confidence} must be capped`);
  assert.notEqual(bucketOf(d.confidence), 'auto', 'a contentless stub must not auto-apply');
  assert.match(d.reasoning, /low-information/);
});

// --- Stage 3: the gate routes by confidence; it does not re-judge --------------------------------

test('gate routes strictly by the configured thresholds', () => {
  const t = DECISION_THRESHOLDS;
  assert.equal(bucketOf(t.autoApplyMin, t), 'auto');
  assert.equal(bucketOf(t.autoApplyMin - 0.001, t), 'confirm');
  assert.equal(bucketOf(t.founderConfirmMin, t), 'confirm');
  assert.equal(bucketOf(t.founderConfirmMin - 0.001, t), 'flag');
  assert.equal(bucketOf(0, t), 'flag');
});

// --- Transparency contract: EVERY row carries decidedBy + confidence + reasoning -----------------

test('every decision is transparent and self-consistent', () => {
  const { rows } = classify([...SEEDED_ACME_TB, ...MESSY_TB]);
  for (const r of rows) {
    assert.ok(r.confidence >= 0 && r.confidence <= 1, `confidence in range for ${r.accountName}`);
    assert.ok(r.reasoning.length > 0, `reasoning present for ${r.accountName}`);
    assert.ok(['rule', 'unclassified', 'llm'].includes(r.decidedBy));
    // ruleId is null IFF unclassified; a classified row names the rule that fired.
    assert.equal(r.ruleId === null, r.decidedBy === 'unclassified', `ruleId/decidedBy agree for ${r.accountName}`);
    assert.equal(r.proposedCategory === null, r.decidedBy === 'unclassified', `category/decidedBy agree for ${r.accountName}`);
  }
});

// --- Coverage arithmetic -------------------------------------------------------------------------

test('coverage tallies are internally consistent (counts, paise, dirty-rupees)', () => {
  const { coverage } = classify(MESSY_TB);
  const c = coverage;
  assert.equal(c.auto.count + c.confirm.count + c.flag.count, c.totalRows);
  assert.equal(c.auto.paise + c.confirm.paise + c.flag.paise, c.totalPaise);
  assert.equal(c.dirtyRupeesPaise, c.flag.paise, 'dirty-rupees == flagged rupees');
  assert.ok(Math.abs(c.auto.pct + c.confirm.pct + c.flag.pct - 100) < 0.2);
  assert.ok(c.flag.count > 0, 'the messy TB must produce a flagged residue');
});

test('seeded Acme data classifies — a real chart yields auto-grade rows', () => {
  const { coverage } = classify(SEEDED_ACME_TB);
  assert.equal(coverage.totalRows, SEEDED_ACME_TB.length);
  assert.ok(coverage.auto.count > 0, 'distinctive seed names should auto-classify');
  assert.equal(coverage.auto.count + coverage.confirm.count + coverage.flag.count, coverage.totalRows);
});

// --- Coverage over ALL 16 adversarial charts (same charts as the identity battery) ---------------

test('coverage runs over all 16 battery charts; buckets reconcile per chart', () => {
  for (const cse of CASES) {
    const p1 = buildInput('p1', 'P1', '2026-04-01', cse.openingRE, cse.p1);
    const p2 = buildInput('p2', 'P2', '2026-05-01', cse.openingRE + computeChainNp(p1), cse.p2);
    const rows = rowsFromNaturals(p2.naturals);
    const { coverage } = classify(rows);
    assert.equal(coverage.totalRows, rows.length, cse.name);
    assert.equal(coverage.auto.count + coverage.confirm.count + coverage.flag.count, rows.length, cse.name);
    assert.equal(coverage.dirtyRupeesPaise, coverage.flag.paise, cse.name);
  }
});

// --- Stubbed stages must fail loudly, never silently skip ----------------------------------------

test('Stage 0 (bank reconciliation) is a loud stub, not silently skipped', () => {
  assert.throws(() => reconcileStage0(SEEDED_ACME_TB, []), /Stage 0 .* not implemented/i);
});

test('Stage 2 (LLM) is a loud stub, not silently skipped', () => {
  assert.throws(() => proposeStage2Llm(MESSY_TB), /Stage 2 .* not implemented/i);
});

// gate() passthrough sanity (decisions in → gated out, same length)
test('gate() preserves rows and attaches a bucket to each', () => {
  const decided = SEEDED_ACME_TB.map((r) => classifyRow(r));
  const gated = gate(decided);
  assert.equal(gated.length, decided.length);
  assert.ok(gated.every((g) => ['auto', 'confirm', 'flag'].includes(g.bucket)));
});
