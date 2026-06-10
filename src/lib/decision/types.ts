// src/lib/decision/types.ts — Decision Engine (M9) shared types. PURE: no UI, no DB, no LLM.
// One DecisionRow per parsed TB row; the Stage 3 gate adds a routing bucket. Money is integer paise.
//
// Scope (Vision §4 / DevDoc M9): Stage 1 (confidence-scored rules) + Stage 3 (confidence gate),
// ACCOUNTING-STRUCTURED INPUTS ONLY. Stage 0 (bank reconciliation) and Stage 2 (LLM) are STUBBED
// interfaces only — see ./index.ts. Nothing here ever auto-commits on a guess; the gate routes by
// an HONEST confidence score, and the unclassifiable residue is surfaced as a rupee NUMBER.

/** Honest 0..1 confidence. NOT a calibrated probability — a relative "how sure is Stage 1" signal:
 *  exact/confirmed match ≈ 1; distinctive keyword high; generic/ambiguous name low. */
export type Confidence = number;

/** Who decided. 'rule' = Stage 1 fired; 'unclassified' = no rule cleared the floor (residue);
 *  'llm' is RESERVED for Stage 2 (M10) and is never produced in this milestone. */
export type DecidedBy = 'rule' | 'unclassified' | 'llm';

export type DecisionRuleId =
  | 'STAGE1.confirmed_mapping' // a human-confirmed prior mapping (the learning-loop hook; M10 persists these)
  | 'STAGE1.name_exact'        // exact / known-phrase name match
  | 'STAGE1.name_keyword'      // distinctive keyword/synonym match
  | 'STAGE1.name_fuzzy';       // partial / fuzzy match (low confidence)

/** Stage 3 routing bucket. auto = high-confidence, applied but SHOWN (non-blocking); confirm =
 *  founder confirms before it counts; flag = unclassifiable residue (contributes to dirty-rupees). */
export type GateBucket = 'auto' | 'confirm' | 'flag';

/** A category proposal for one source account, with full transparency on HOW it was reached. */
export type RowDecision = {
  rowNumber: number;
  accountCode: string;
  accountName: string;
  amountPaise: number; // gross magnitude on the row = max(debit, credit); the rupees riding on it
  proposedCategory: string | null;     // canonical category code, or null if unclassifiable
  proposedCategoryName: string | null; // display name for the code, or null
  confidence: Confidence;
  decidedBy: DecidedBy;
  ruleId: DecisionRuleId | null;
  reasoning: string;                    // plain-language, ALWAYS present (transparency requirement)
  alternatives: { code: string; name: string; score: number }[]; // runner-up candidates (ambiguity honesty)
};

export type GatedDecision = RowDecision & { bucket: GateBucket };

/** Stage 3 thresholds. CONFIG CONSTANTS with conservative defaults — NOT a guessed materiality
 *  floor. The "dirty-rupee" band threshold (when an MIS shows a "contains ₹X unclassified" banner)
 *  is a SEPARATE, real-data-tuned number deferred to RULE-REVIEW §E1 — not set here. */
export type DecisionThresholds = {
  autoApplyMin: number;     // confidence ≥ this → 'auto'
  founderConfirmMin: number; // confidence ≥ this (and < auto) → 'confirm'; below → 'flag'
};

/** Per-bucket tally, by row count AND by rupees (paise). */
export type BucketTally = { count: number; paise: number; pct: number };

export type Coverage = {
  totalRows: number;
  totalPaise: number;
  auto: BucketTally;
  confirm: BucketTally;
  flag: BucketTally;
  /** The un-auto-classifiable rupee residue = flag.paise. A NUMBER, surfaced for transparency —
   *  NOT compared against a materiality band here (that floor is deferred; RULE-REVIEW §E1). */
  dirtyRupeesPaise: number;
};

export type DecisionResult = {
  rows: GatedDecision[];
  coverage: Coverage;
  thresholds: DecisionThresholds;
};
