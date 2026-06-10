// src/lib/verify/cross-check.ts — M-verify (b): multi-AI cross-check BUG-FINDER (Vision §5).
// PURE. Exports the engine's computed statements in a clean, model-agnostic format ALONGSIDE the
// inputs, so an independent model can recompute the statements from the same inputs and we DIFF.
// Disagreements are items to investigate (likely engine slips). This is a CONSISTENCY CHECK ONLY:
// agreement across models reduces variance, NOT bias — it NEVER establishes correctness and NEVER
// stamps VERIFIED. (VERIFIED = identity battery (a) + the one-time human rule-review (c).)
import type { PeriodResult, PeriodEngineInput } from '../engine/types';

export type ComparableStatement = {
  periodId: string;
  label: string;
  inputsRupees: Record<string, number>;          // what an independent model recomputes FROM (₹)
  computedRupees: Record<string, number | null>;  // OUR engine's line items (₹) to be reproduced
};

export type CrossCheckExport = {
  _meta: {
    purpose: 'multi-AI cross-check — BUG-FINDER ONLY (Vision §5)';
    instructions: string;
    caveat: string;
  };
  cases: ComparableStatement[];
};

const r = (paise: number) => Math.round(paise) / 100; // paise → ₹ for clean cross-model comparison

export function toComparable(input: PeriodEngineInput, result: PeriodResult): ComparableStatement {
  const cf = result.cashFlow;
  return {
    periodId: result.periodId,
    label: result.label,
    inputsRupees: Object.fromEntries(Object.entries(input.naturals).map(([k, v]) => [k, r(v)])),
    computedRupees: {
      operatingRevenue: r(result.pnl.operatingRevenuePaise), cogs: r(result.pnl.cogsPaise), grossProfit: r(result.pnl.grossProfitPaise),
      operatingExpenses: r(result.pnl.operatingExpensesPaise), ebitda: r(result.pnl.ebitdaPaise), depreciationAmortisation: r(result.pnl.depreciationAmortisationPaise),
      ebit: r(result.pnl.ebitPaise), financeCosts: r(result.pnl.financeCostsPaise), ebt: r(result.pnl.ebtPaise), tax: r(result.pnl.taxPaise), netProfit: r(result.pnl.netProfitPaise),
      currentAssets: r(result.balanceSheet.currentAssetsPaise), nonCurrentAssets: r(result.balanceSheet.nonCurrentAssetsPaise), totalAssets: r(result.balanceSheet.totalAssetsPaise),
      currentLiabilities: r(result.balanceSheet.currentLiabilitiesPaise), totalLiabilities: r(result.balanceSheet.totalLiabilitiesPaise),
      closingRetainedEarnings: r(result.balanceSheet.closingRetainedEarningsPaise), totalEquity: r(result.balanceSheet.totalEquityPaise), cash: r(result.balanceSheet.cashPaise),
      cfo: cf.available ? r(cf.cfoPaise) : null, cfi: cf.available ? r(cf.cfiPaise) : null, cff: cf.available ? r(cf.cffPaise) : null, closingCash: cf.available ? r(cf.closingCashPaise) : null,
    },
  };
}

export function buildExport(pairs: { input: PeriodEngineInput; result: PeriodResult }[]): CrossCheckExport {
  return {
    _meta: {
      purpose: 'multi-AI cross-check — BUG-FINDER ONLY (Vision §5)',
      instructions: 'For each case, recompute computedRupees from inputsRupees with an INDEPENDENT model (standard Indian GAAP statement construction), then run diffComparable(ours, theirs). Investigate every disagreement as a possible engine slip.',
      caveat: 'CONSISTENCY CHECK ONLY. Agreement reduces variance, not bias — models can share a bias and all be wrong. This NEVER establishes correctness and NEVER permits the label VERIFIED. VERIFIED requires the identity battery AND the one-time human rule-review.',
    },
    cases: pairs.map((p) => toComparable(p.input, p.result)),
  };
}

export type Disagreement = { periodId: string; field: string; ours: number | null; theirs: number | null; deltaRupees: number | null };

/** Field-by-field diff of our computed statement vs an independent model's. Disagreements only. */
export function diffComparable(ours: ComparableStatement, theirs: Pick<ComparableStatement, 'computedRupees'>, tolRupees = 0): Disagreement[] {
  const out: Disagreement[] = [];
  for (const k of Object.keys(ours.computedRupees)) {
    const a = ours.computedRupees[k];
    const b = theirs.computedRupees?.[k] ?? null;
    if (a === null && b === null) continue;
    if (a === null || b === null || Math.abs(a - b) > tolRupees) {
      out.push({ periodId: ours.periodId, field: k, ours: a, theirs: b, deltaRupees: a === null || b === null ? null : a - b });
    }
  }
  return out;
}
