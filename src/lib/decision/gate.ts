// src/lib/decision/gate.ts — Decision Engine STAGE 3: the confidence GATE. PURE.
// Routes each Stage-1 decision by its confidence into exactly one of three buckets and tallies
// coverage (by row count AND by rupees). The gate does NOT re-score — it only routes the honest
// confidence Stage 1 produced.
//
// Thresholds are CONFIG CONSTANTS with conservative defaults (DevDoc M9): a HIGH auto bar so the
// engine errs toward asking the founder rather than silently auto-applying an uncertain guess. These
// are NOT a materiality floor — the "dirty-rupee" band threshold (when an MIS shows a "contains ₹X
// unclassified" banner) is a separate, real-data-tuned number, deferred to RULE-REVIEW §E1.
import type {
  BucketTally, Coverage, DecisionThresholds, GateBucket, GatedDecision, RowDecision,
} from './types';

export const DECISION_THRESHOLDS: DecisionThresholds = {
  autoApplyMin: 0.9, // ≥ 0.90 → auto-apply (shown, non-blocking)
  founderConfirmMin: 0.5, // ≥ 0.50 (and < 0.90) → founder confirms; below 0.50 → flagged
};

/** Route a single confidence score to its bucket. */
export function bucketOf(confidence: number, t: DecisionThresholds = DECISION_THRESHOLDS): GateBucket {
  if (confidence >= t.autoApplyMin) return 'auto';
  if (confidence >= t.founderConfirmMin) return 'confirm';
  return 'flag';
}

/** Apply the gate to Stage-1 decisions. */
export function gate(
  decisions: RowDecision[],
  t: DecisionThresholds = DECISION_THRESHOLDS,
): GatedDecision[] {
  return decisions.map((d) => ({ ...d, bucket: bucketOf(d.confidence, t) }));
}

/** Coverage breakdown: % auto / % founder-confirm / % flagged, by count and by rupees, plus the
 *  dirty-rupee residue as a NUMBER (= flagged rupees). Percentages are by row count. */
export function coverageOf(gated: GatedDecision[]): Coverage {
  const totalRows = gated.length;
  const totalPaise = gated.reduce((s, d) => s + d.amountPaise, 0);
  const tally = (bucket: GateBucket): BucketTally => {
    const rows = gated.filter((d) => d.bucket === bucket);
    const count = rows.length;
    const paise = rows.reduce((s, d) => s + d.amountPaise, 0);
    return { count, paise, pct: totalRows ? Math.round((count / totalRows) * 1000) / 10 : 0 };
  };
  const flag = tally('flag');
  return {
    totalRows,
    totalPaise,
    auto: tally('auto'),
    confirm: tally('confirm'),
    flag,
    dirtyRupeesPaise: flag.paise,
  };
}
