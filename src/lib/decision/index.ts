// src/lib/decision/index.ts — Decision Engine (M9) public surface + orchestration. PURE.
//
// SCOPE (Vision §4 / DevDoc M9): Stage 1 (confidence-scored rules) + Stage 3 (confidence gate),
// ACCOUNTING-STRUCTURED INPUTS ONLY (TB / Tally / Zoho rows). Stage 0 (bank↔books reconciliation)
// and Stage 2 (LLM proposal) are deliberately NOT built — they are STUBBED interfaces below so the
// seams are visible and callers fail loudly rather than silently skipping a stage.
import type { ParsedTbRow, CategoryMeta } from '../intake/types';
import { CANONICAL_CATEGORIES } from './taxonomy';
import { classifyRow, NO_PRIOR_MAPPINGS, type PriorMappings } from './rules';
import { gate, coverageOf, DECISION_THRESHOLDS } from './gate';
import type { DecisionResult, DecisionThresholds } from './types';

export * from './types';
export { CANONICAL_CATEGORIES, CATEGORY_BY_CODE } from './taxonomy';
export { classifyRow, DECISION_RULES, SCORE, NO_PRIOR_MAPPINGS, type PriorMappings } from './rules';
export { bucketOf, gate, coverageOf, DECISION_THRESHOLDS } from './gate';

export type ClassifyOptions = {
  categories?: CategoryMeta[];        // defaults to the canonical taxonomy
  priorMappings?: PriorMappings;      // human-confirmed mappings (learning loop); default none
  thresholds?: DecisionThresholds;    // Stage 3 gate; default conservative constants
};

/**
 * Run the decision engine over parsed TB rows: Stage 1 classifies each row with an honest
 * confidence + reasoning, Stage 3 routes each into auto / founder-confirm / flag, and coverage is
 * tallied (by count and by rupees, with the dirty-rupee residue surfaced as a number).
 */
export function classify(rows: ParsedTbRow[], opts: ClassifyOptions = {}): DecisionResult {
  const categories = opts.categories ?? CANONICAL_CATEGORIES;
  const prior = opts.priorMappings ?? NO_PRIOR_MAPPINGS;
  const thresholds = opts.thresholds ?? DECISION_THRESHOLDS;
  const decided = rows.map((r) => classifyRow(r, categories, prior));
  const gated = gate(decided, thresholds);
  return { rows: gated, coverage: coverageOf(gated), thresholds };
}

// ============================================================================================
// STUBBED INTERFACES — NOT built in this phase. Defined so the architecture's seams are explicit
// and any premature call fails loudly. See DevDoc M10 (Stage 2) and M12+ / Vision §4 (Stage 0).
// ============================================================================================

/** A bank-statement transaction. Shape intentionally minimal — finalised when Stage 0 is built. */
export type BankLine = {
  date: string;
  description: string;
  amountPaise: number; // signed: +credit to the account / −debit
  reference?: string;
};

/**
 * STAGE 0 — bank↔books reconciliation. OUT OF SCOPE this phase: a later, separately-gated module
 * (Vision §4; DevDoc M12+). Bank-statement ingestion is explicitly excluded from M9–M11.
 * @throws always — not implemented.
 */
export function reconcileStage0(books: ParsedTbRow[], bank: BankLine[]): never {
  throw new Error(
    `Stage 0 (bank↔books reconciliation) is out of scope for this phase — DevDoc M12+, Vision §4. Not implemented. ` +
    `(received ${books.length} book rows, ${bank.length} bank lines)`,
  );
}

/** An LLM's category proposal — routed through the SAME Stage 3 gate, never auto-committed. */
export type LlmProposal = {
  rowNumber: number;
  proposedCategory: string;
  confidence: number;
  reasoning: string;
};

/**
 * STAGE 2 — LLM proposes a category for Stage-1 residue (the rows the rules could not confidently
 * place). OUT OF SCOPE this phase (DevDoc M10). When built, its output is routed through the
 * existing Stage 3 gate — an LLM proposal is never trusted enough to auto-commit on its own.
 * Until then, residue is handled by Stage 3 (founder-confirm or flagged).
 * @throws always — not implemented.
 */
export function proposeStage2Llm(residue: ParsedTbRow[]): Promise<LlmProposal[]> {
  throw new Error(
    `Stage 2 (LLM proposal) is M10 — not implemented. Stage-1 residue is routed to founder-confirm / flag by the Stage 3 gate. ` +
    `(received ${residue.length} residue rows)`,
  );
}
