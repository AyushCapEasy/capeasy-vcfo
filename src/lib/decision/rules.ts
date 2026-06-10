// src/lib/decision/rules.ts — Decision Engine STAGE 1: confidence-scored classification rules.
// PURE. Input = one parsed TB row; output = a category proposal with an HONEST confidence score and
// plain-language reasoning. The confidence score is the heart of this stage (DevDoc M9): an exact /
// confirmed match scores high; a distinctive keyword scores medium-high; a generic or AMBIGUOUS name
// scores low — Stage 1 reports how sure it is, not merely what it guessed. Stage 3 (gate.ts) routes
// on that score; it does not re-judge it.
//
// Built on the existing intake fuzzy matcher (suggestCategories) — the SAME matcher the analyst sees
// at mapping time, so the decision engine and the manual mapper agree by construction. We add: a
// confirmed-mapping rule (the learning-loop hook), a code→category hook (per-org chart, default
// empty), explicit confidence bands, and ambiguity dampening (a near-tie REDUCES confidence).
import type { ParsedTbRow, CategoryMeta } from '../intake/types';
import { suggestCategories, type Suggestion } from '../intake/fuzzy';
import { CANONICAL_CATEGORIES, CATEGORY_BY_CODE } from './taxonomy';
import type { Confidence, DecisionRuleId, RowDecision } from './types';

// --- Confidence bands & dampening (config constants; conservative; tunable in rule-review §F) ----
export const SCORE = {
  /** Below this top match score, Stage 1 declines to propose → unclassifiable residue. */
  classifyFloor: 0.30,
  /** Top match at/above this (phrase containment) is treated as an exact/known-phrase match. */
  exactPhrase: 0.999,
  /** Top match at/above this is a distinctive keyword match. */
  keyword: 0.70,
  /** A confirmed prior mapping (human-approved before) — the strongest signal. */
  confirmedConfidence: 0.99,
  /** Confidence assigned to an exact/known-phrase name match. */
  exactConfidence: 0.95,
  /** Ceiling for a (non-exact) keyword match — never claims certainty from a keyword alone. */
  keywordCap: 0.88,
  /** Ceiling for a fuzzy/partial match. */
  fuzzyCap: 0.60,
  /** If (top − runner-up) < this, the call is AMBIGUOUS → confidence capped low (founder-confirm). */
  ambiguityMargin: 0.12,
  /** Confidence ceiling for a near-tie or a low-information stub: sits in the founder-confirm band
   *  ([founderConfirmMin, autoApplyMin)) so the row carries its hint to a human instead of either
   *  auto-applying an uncertain guess or being buried in the unclassifiable dirty-rupee residue. */
  ambiguousCap: 0.55,
} as const;

/** Human-confirmed prior mappings for an org (the learning-loop input; M10 persists these). Keys are
 *  normalised. Default empty — nothing is "confirmed" until a human has actually confirmed it. */
export type PriorMappings = {
  byCode: Record<string, string>; // normalised source code  → category code
  byName: Record<string, string>; // normalised source name  → category code
};
export const NO_PRIOR_MAPPINGS: PriorMappings = { byCode: {}, byName: {} };

const normName = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
const normCode = (s: string) => s.toLowerCase().replace(/\s+/g, '').trim();

// Contentless "stub" ledger words. A name made up ENTIRELY of these carries no real classification
// signal even when the fuzzy matcher finds a substring hit (e.g. "Misc" ⊂ the synonym "misc income").
// Such a name is never auto-applied — it is capped to founder-confirm so a human decides. (This guards
// the gate's honesty; it does NOT touch the shared intake matcher.) Words that ARE a real category
// (income, expense, deposit, provision, …) are deliberately excluded.
const LOW_INFO = new Set([
  'misc', 'miscellaneous', 'sundry', 'suspense', 'other', 'others', 'general', 'adjustment',
  'adjustments', 'difference', 'differences', 'control', 'opening', 'closing', 'round', 'roundoff',
  'settlement', 'transfer', 'various', 'unknown', 'temp', 'temporary', 'clearing', 'entry', 'entries',
]);
function isLowInfoName(name: string): boolean {
  const toks = normName(name).split(' ').filter((t) => t.length > 1); // ignore single-letter noise (a/c)
  return toks.length > 0 && toks.every((t) => LOW_INFO.has(t));
}
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const pct = (n: number) => `${Math.round(n * 100)}%`;
const altsFrom = (sugg: Suggestion[]) =>
  sugg.slice(1).map((s) => ({ code: s.code, name: s.name, score: Math.round(s.score * 100) / 100 }));

/** The Stage 1 rule registry — every rule that can fire, for transparency + RULE-REVIEW §F. */
export const DECISION_RULES: { id: DecisionRuleId; label: string; basis: string }[] = [
  { id: 'STAGE1.confirmed_mapping', label: 'Confirmed prior mapping', basis: 'a human approved this exact code/name → category before (learning loop)' },
  { id: 'STAGE1.name_exact', label: 'Exact / known-phrase name', basis: 'the source name contains (or is contained by) a canonical name or known synonym phrase' },
  { id: 'STAGE1.name_keyword', label: 'Distinctive keyword', basis: 'a strong, clear-margin keyword/synonym match (confidence = match strength, capped)' },
  { id: 'STAGE1.name_fuzzy', label: 'Fuzzy / partial', basis: 'a weak partial match; low confidence, routed to founder-confirm or flagged' },
];

const amountPaiseOf = (r: ParsedTbRow) => Math.max(r.debitPaise, r.creditPaise);

function decide(
  r: ParsedTbRow,
  code: string | null,
  confidence: Confidence,
  decidedBy: RowDecision['decidedBy'],
  ruleId: DecisionRuleId | null,
  reasoning: string,
  alternatives: RowDecision['alternatives'],
): RowDecision {
  const meta = code ? CATEGORY_BY_CODE[code] : undefined;
  return {
    rowNumber: r.rowNumber,
    accountCode: r.accountCode,
    accountName: r.accountName,
    amountPaise: amountPaiseOf(r),
    proposedCategory: code,
    proposedCategoryName: meta?.name ?? null,
    confidence: Math.round(confidence * 1000) / 1000,
    decidedBy,
    ruleId,
    reasoning,
    alternatives,
  };
}

/**
 * Classify ONE source account into the canonical taxonomy with an honest confidence score.
 * Rules are tried in priority order; the first that clears its bar wins (and its confidence is
 * reported — a later, weaker rule never overrides a stronger one).
 */
export function classifyRow(
  row: ParsedTbRow,
  categories: CategoryMeta[] = CANONICAL_CATEGORIES,
  prior: PriorMappings = NO_PRIOR_MAPPINGS,
): RowDecision {
  // Rule 1 — confirmed prior mapping (human-approved → the strongest, near-certain signal).
  const priorCode = prior.byCode[normCode(row.accountCode)] ?? prior.byName[normName(row.accountName)];
  if (priorCode && CATEGORY_BY_CODE[priorCode]) {
    const via = prior.byCode[normCode(row.accountCode)] ? `code "${row.accountCode}"` : `name "${row.accountName}"`;
    return decide(row, priorCode, SCORE.confirmedConfidence, 'rule', 'STAGE1.confirmed_mapping',
      `previously confirmed mapping for ${via} → "${CATEGORY_BY_CODE[priorCode].name}"`, []);
  }

  // Rules 2–4 — name/synonym matching. Code is matched separately (above); here we score on the
  // NAME only so a noisy source code can't dilute a clean name match.
  const sugg = suggestCategories({ code: '', name: row.accountName }, categories, 3);
  if (sugg.length === 0 || sugg[0].score < SCORE.classifyFloor) {
    return decide(row, null, 0, 'unclassified', null,
      sugg.length
        ? `no confident category — best guess "${sugg[0].name}" only ${pct(sugg[0].score)}; below the classify floor (${pct(SCORE.classifyFloor)})`
        : `no category matched "${row.accountName}"`,
      altsFrom(sugg));
  }

  const top = sugg[0];
  const margin = top.score - (sugg[1]?.score ?? 0);
  const ambiguous = top.score < SCORE.exactPhrase && margin < SCORE.ambiguityMargin;

  let ruleId: DecisionRuleId;
  let confidence: number;
  let reasoning: string;
  if (top.score >= SCORE.exactPhrase) {
    ruleId = 'STAGE1.name_exact';
    confidence = SCORE.exactConfidence;
    reasoning = `exact / known-phrase match → "${top.name}"`;
  } else if (top.score >= SCORE.keyword) {
    ruleId = 'STAGE1.name_keyword';
    confidence = clamp(top.score, 0, SCORE.keywordCap);
    reasoning = `keyword match → "${top.name}" (match ${pct(top.score)})`;
  } else {
    ruleId = 'STAGE1.name_fuzzy';
    confidence = clamp(top.score, 0, SCORE.fuzzyCap);
    reasoning = `partial/fuzzy match → "${top.name}" (match ${pct(top.score)})`;
  }
  if (ambiguous) {
    confidence = Math.min(confidence, SCORE.ambiguousCap);
    reasoning += `; AMBIGUOUS — near-tie with "${sugg[1].name}" (margin ${pct(margin)}), confidence reduced`;
  }
  if (isLowInfoName(row.accountName) && confidence > SCORE.ambiguousCap) {
    confidence = SCORE.ambiguousCap;
    reasoning += '; generic/low-information name — not auto-applied, needs confirmation';
  }
  return decide(row, top.code, confidence, 'rule', ruleId, reasoning, altsFrom(sugg));
}
