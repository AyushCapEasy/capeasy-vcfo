// src/lib/insight/recommendations.ts — Insight Layer, TIER 3 (Recommendations + goal-tracking).
// PURE, unit-tested. ADVICE derived from Tier-2 diagnoses, with quantified impact that is exact
// counterfactual arithmetic on (unverified) engine figures — never a guessed number. Each rule is
// logged CA-VALIDATE. status:'UNVERIFIED' throughout. Built on the UNVERIFIED engine — re-validate
// after the CA diff (M-verify).
//
// GOALS (D-013): client targets are STUBBED with placeholders + a TODO for real analyst-entered
// capture (a per-org targets table + form — client-facing, so deferred behind the M-verify gate).
// Goal-tracking logic is real: it compares the engine's current trajectory vs the (placeholder) target.
import type { PeriodResult } from '../engine/types';
import type { Observation } from './observations';
import type { Diagnosis } from './diagnoses';
import { inr } from './observations';

export type Recommendation = {
  fromDiagnosisId: string;       // = the source observation/diagnosis id
  ruleId: string;
  metric: string;
  action: string;
  quantifiedImpact: { figurePaise: number; basis: string; traces: string[] };
  confidence: 'mechanical' | 'directional';
  status: 'UNVERIFIED';
};

/** CA-VALIDATE — every Tier-3 recommendation rule (advice) the CA must sign off. */
export const RECOMMENDATION_RULES: { id: string; appliesTo: string; logic: string }[] = [
  { id: 'REC.dso_cash_release', appliesTo: 'DSO increased', logic: 'Cash freed by returning DSO to prior = (DSO_to − DSO_from) × revenue_to ÷ days_to (implied receivables reduction). Exact counterfactual on engine fields.' },
  { id: 'REC.dio_cash_release', appliesTo: 'DIO increased', logic: 'Cash freed by returning DIO to prior = (DIO_to − DIO_from) × COGS_to ÷ days_to (implied inventory reduction).' },
  { id: 'REC.dpo_cash_defer', appliesTo: 'DPO decreased', logic: 'Cash deferred by restoring DPO to prior = (DPO_from − DPO_to) × COGS_to ÷ days_to (implied payables increase).' },
  { id: 'REC.opex_ratio_savings', appliesTo: 'opex/revenue increased', logic: 'Saving by returning opex/revenue to prior = (opexRatio_to − opexRatio_from) × revenue_to.' },
  { id: 'REC.cogs_ratio_savings', appliesTo: 'COGS/revenue increased', logic: 'Gross profit recovered by returning COGS/revenue to prior = (cogsRatio_to − cogsRatio_from) × revenue_to.' },
  { id: 'REC.runway_watch', appliesTo: 'net burn positive', logic: 'When net burn > 0, restate runway = cash ÷ net-burn (months) as a watch item — engine figure, no projection beyond it.' },
];

export function computeRecommendations(observations: Observation[], _diagnoses: Diagnosis[], results: PeriodResult[]): Recommendation[] {
  const byId = new Map(results.map((r) => [r.periodId, r]));
  const out: Recommendation[] = [];
  for (const o of observations) {
    const key = o.id.split(':')[0];
    const [fromId, toId] = o.id.split(':')[1].split('->');
    const f = byId.get(fromId);
    const t = byId.get(toId);
    if (!f || !t) continue;
    const rec = (r: Omit<Recommendation, 'fromDiagnosisId' | 'status' | 'confidence'> & { confidence?: Recommendation['confidence'] }) =>
      out.push({ fromDiagnosisId: o.id, status: 'UNVERIFIED', confidence: 'mechanical', ...r });

    // Receivables: DSO up → cash trapped that returning to prior DSO would free
    if (key === 'dso' && o.direction === 'up' && f.workingCapital.dso !== null && t.workingCapital.dso !== null) {
      const freed = ((t.workingCapital.dso - f.workingCapital.dso) * t.pnl.operatingRevenuePaise) / t.workingCapital.daysInMonth;
      rec({ ruleId: 'REC.dso_cash_release', metric: o.metric, action: `Collect receivables to return DSO to the prior ${f.workingCapital.dso.toFixed(1)} days.`, quantifiedImpact: { figurePaise: freed, basis: `(${t.workingCapital.dso.toFixed(1)}−${f.workingCapital.dso.toFixed(1)}) days × ${inr(t.pnl.operatingRevenuePaise)} ÷ ${t.workingCapital.daysInMonth} = ${inr(freed)} cash freed`, traces: ['workingCapital.dso', 'pnl.operatingRevenuePaise', 'workingCapital.daysInMonth'] } });
    }
    // Inventory: DIO up → cash that returning to prior DIO would free
    if (key === 'dio' && o.direction === 'up' && f.workingCapital.dio !== null && t.workingCapital.dio !== null) {
      const freed = ((t.workingCapital.dio - f.workingCapital.dio) * t.pnl.cogsPaise) / t.workingCapital.daysInMonth;
      rec({ ruleId: 'REC.dio_cash_release', metric: o.metric, action: `Reduce inventory to return DIO to the prior ${f.workingCapital.dio.toFixed(1)} days.`, quantifiedImpact: { figurePaise: freed, basis: `(${t.workingCapital.dio.toFixed(1)}−${f.workingCapital.dio.toFixed(1)}) days × ${inr(t.pnl.cogsPaise)} ÷ ${t.workingCapital.daysInMonth} = ${inr(freed)} cash freed`, traces: ['workingCapital.dio', 'pnl.cogsPaise', 'workingCapital.daysInMonth'] } });
    }
    // Payables: DPO down (paying faster) → cash that restoring prior DPO would defer
    if (key === 'dpo' && o.direction === 'down' && f.workingCapital.dpo !== null && t.workingCapital.dpo !== null) {
      const deferred = ((f.workingCapital.dpo - t.workingCapital.dpo) * t.pnl.cogsPaise) / t.workingCapital.daysInMonth;
      rec({ ruleId: 'REC.dpo_cash_defer', metric: o.metric, action: `Negotiate payment terms to restore DPO to the prior ${f.workingCapital.dpo.toFixed(1)} days (it fell to ${t.workingCapital.dpo.toFixed(1)}).`, quantifiedImpact: { figurePaise: deferred, basis: `(${f.workingCapital.dpo.toFixed(1)}−${t.workingCapital.dpo.toFixed(1)}) days × ${inr(t.pnl.cogsPaise)} ÷ ${t.workingCapital.daysInMonth} = ${inr(deferred)} of outflow deferrable`, traces: ['workingCapital.dpo', 'pnl.cogsPaise', 'workingCapital.daysInMonth'] } });
    }
    // Opex ratio up → saving from returning to prior opex/revenue
    if (key === 'opex_to_revenue' && o.direction === 'up') {
      const saving = ((o.values.to - o.values.from) / 100) * t.pnl.operatingRevenuePaise;
      rec({ ruleId: 'REC.opex_ratio_savings', metric: o.metric, action: `Bring operating-expense ratio back to the prior ${o.values.from.toFixed(1)}% of revenue.`, quantifiedImpact: { figurePaise: saving, basis: `(${o.values.to.toFixed(1)}−${o.values.from.toFixed(1)})pp × ${inr(t.pnl.operatingRevenuePaise)} = ${inr(saving)} saving at current revenue`, traces: ['pnl.operatingExpensesPaise', 'pnl.operatingRevenuePaise'] } });
    }
    // COGS ratio up → gross profit recoverable
    if (key === 'cogs_to_revenue' && o.direction === 'up') {
      const recovered = ((o.values.to - o.values.from) / 100) * t.pnl.operatingRevenuePaise;
      rec({ ruleId: 'REC.cogs_ratio_savings', metric: o.metric, action: `Bring COGS ratio back to the prior ${o.values.from.toFixed(1)}% of revenue.`, quantifiedImpact: { figurePaise: recovered, basis: `(${o.values.to.toFixed(1)}−${o.values.from.toFixed(1)})pp × ${inr(t.pnl.operatingRevenuePaise)} = ${inr(recovered)} gross profit recoverable`, traces: ['pnl.cogsPaise', 'pnl.operatingRevenuePaise'] } });
    }
    // Net burn still positive → runway watch (engine figure, no projection)
    if (key === 'net_burn' && t.startupMetrics.netBurnPaise !== null && t.startupMetrics.netBurnPaise > 0 && t.startupMetrics.runwayMonths !== null) {
      rec({ ruleId: 'REC.runway_watch', metric: 'Runway', confidence: 'directional', action: `Net burn is positive — monitor runway; at the current net burn (${inr(t.startupMetrics.netBurnPaise)}/mo) runway is ${t.startupMetrics.runwayMonths.toFixed(1)} months.`, quantifiedImpact: { figurePaise: t.startupMetrics.netBurnPaise, basis: `cash ${inr(t.balanceSheet.cashPaise)} ÷ net burn ${inr(t.startupMetrics.netBurnPaise)} = ${t.startupMetrics.runwayMonths.toFixed(1)} months`, traces: ['startupMetrics.netBurnPaise', 'startupMetrics.runwayMonths', 'balanceSheet.cashPaise'] } });
    }
  }
  return out;
}

// --- Goals (STUB placeholders, D-013) + goal-tracking -----------------------------------------
export type Goal = { id: string; metric: string; horizon: string; targetValue: number; unit: 'INR_annualised' | 'pp' | 'months'; enginePath: string; placeholder: true };
export const GOALS_STUB: Goal[] = [
  // TODO: replace with per-org, analyst-entered client targets (capture not built — D-013).
  { id: 'goal.revenue_annualised', metric: 'Annualised operating revenue', horizon: '1yr', targetValue: 5_000_000_000, unit: 'INR_annualised', enginePath: 'pnl.operatingRevenuePaise', placeholder: true }, // ₹5.00 Cr/yr (placeholder)
  { id: 'goal.gross_margin', metric: 'Gross margin', horizon: '1yr', targetValue: 62, unit: 'pp', enginePath: 'ratios.grossMarginPct', placeholder: true },
  { id: 'goal.net_margin', metric: 'Net margin', horizon: '1yr', targetValue: 12, unit: 'pp', enginePath: 'ratios.netMarginPct', placeholder: true },
  { id: 'goal.runway', metric: 'Runway', horizon: '1yr', targetValue: 12, unit: 'months', enginePath: 'startupMetrics.runwayMonths', placeholder: true },
];

export type GoalTrack = {
  goalId: string;
  metric: string;
  horizon: string;
  target: number;
  unit: Goal['unit'];
  current: number | null;       // engine-traced current value (annualised for revenue)
  trackStatus: 'on_track' | 'off_track' | 'na';
  gap: number | null;           // current − target (signed)
  detail: string;
  traces: { periodId: string; enginePath: string }[];
  placeholderTarget: true;
  status: 'UNVERIFIED';
};

export function computeGoalTracking(results: PeriodResult[], goals: Goal[] = GOALS_STUB): GoalTrack[] {
  if (!results.length) return [];
  const latest = results[results.length - 1];
  return goals.map((g) => {
    let current: number | null;
    let detail: string;
    if (g.id === 'goal.revenue_annualised') {
      current = latest.pnl.operatingRevenuePaise * 12; // annualised run-rate from the latest month
      detail = `latest month ${inr(latest.pnl.operatingRevenuePaise)} × 12 = ${inr(current)} vs target ${inr(g.targetValue)}`;
    } else if (g.id === 'goal.gross_margin') {
      current = latest.ratios.grossMarginPct;
      detail = `latest ${current === null ? 'n/a' : current.toFixed(1) + '%'} vs target ${g.targetValue}%`;
    } else if (g.id === 'goal.net_margin') {
      current = latest.ratios.netMarginPct;
      detail = `latest ${current === null ? 'n/a' : current.toFixed(1) + '%'} vs target ${g.targetValue}%`;
    } else {
      current = latest.startupMetrics.runwayMonths;
      detail = current === null ? 'runway n/a (net burn ≤ 0 — cash-generative; no runway constraint)' : `latest ${current.toFixed(1)} months vs target ≥ ${g.targetValue} months`;
    }
    const trackStatus: GoalTrack['trackStatus'] = current === null ? 'na' : current >= g.targetValue ? 'on_track' : 'off_track';
    return {
      goalId: g.id, metric: g.metric, horizon: g.horizon, target: g.targetValue, unit: g.unit,
      current, trackStatus, gap: current === null ? null : current - g.targetValue, detail,
      traces: [{ periodId: latest.periodId, enginePath: g.enginePath }],
      placeholderTarget: true, status: 'UNVERIFIED',
    };
  });
}
