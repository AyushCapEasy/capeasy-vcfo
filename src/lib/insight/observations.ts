// src/lib/insight/observations.ts — Insight Layer, TIER 1 (Observations). PURE, like the engine
// ("engine once, views many"): no UI, no DB, unit-tested. Deterministic period-over-period
// observations derived ONLY from engine output (PeriodResult). NO interpretation, NO advice — that
// is Tier 2/3 and is deliberately NOT built here. True-by-construction: an observation only restates
// engine numbers and the move between two periods.
//
// DISCIPLINE (matches the engine):
//  - Reads engine fields; it does NOT recompute an engine-emitted metric. The ONLY derived figures
//    are the two expense ratios (COGS/revenue, opex/revenue), each formed transparently from two
//    engine P&L fields and traced to BOTH.
//  - The engine is UNVERIFIED pending CA sign-off (Bible §10.6), so EVERY observation carries
//    status:'UNVERIFIED' and traces to the specific (unverified) engine field(s) behind it.
//  - Nothing is fabricated: an observation is emitted ONLY when both period endpoints are non-null
//    (engine null = honest "n/a — needs input") and the move clears its threshold. Otherwise there
//    is simply no observation — honest silence, never a guessed value.
import type { PeriodResult } from '../engine/types';

/** Canonical statement groups (mirror migration 0001 `account_group`) — the drill-down anchor:
 *  group → categories → mapped accounts via getPeriodDrilldown(). */
export type AccountGroup =
  | 'income' | 'direct_costs' | 'operating_expenses' | 'below_the_line'
  | 'current_assets' | 'non_current_assets' | 'current_liabilities' | 'non_current_liabilities' | 'equity';

export type ObservationDirection = 'up' | 'down' | 'flat';
export type ObservationUnit = 'pp' | 'ratio' | 'days' | 'INR' | 'months';
export type ObservationFamily = 'margin' | 'revenue' | 'profit' | 'ratio' | 'working_capital' | 'expense_ratio' | 'burn_runway';

export type EngineTrace = {
  periodId: string;
  enginePath: string;               // dot-path into PeriodResult, e.g. 'ratios.ebitdaMarginPct'
  categoryGroups: AccountGroup[];   // statement groups behind it → drill-down to mapped accounts
};

export type Observation = {
  id: string;
  family: ObservationFamily;
  metric: string;
  periodsCompared: [string, string];   // [fromLabel, toLabel]
  values: { from: number; to: number }; // engine units (paise for money, % for margins, days, etc.)
  deltaAbs: number;
  deltaPct?: number;                    // relative % change (money, ratios, burn, runway)
  deltaPp?: number;                     // percentage-point change (margins, ROE/ROCE, expense ratios)
  direction: ObservationDirection;
  unit: ObservationUnit;
  statement: string;                    // plain-language, deterministic — NO interpretation/advice
  traces: EngineTrace[];
  status: 'UNVERIFIED';
};

/** Explicit, CA-tunable thresholds for what counts as "notable". Mirrored into the engine's
 *  ca_validate list (fixtures/PROPOSED-golden.json) so the CA tunes these alongside the fixture. */
export type ObservationThresholds = {
  marginMovePp: number;            // gross/EBITDA/net margin, ROE, ROCE, expense ratios — percentage points
  ratioMovePct: number;            // current/quick ratio, D/E, interest coverage — relative %
  revenueNetProfitMovePct: number; // operating revenue, net profit — relative %
  workingCapitalMoveDays: number;  // DSO / DPO / DIO / CCC — days
  burnRunwayMovePct: number;       // net burn, runway months — relative %
};
export const OBSERVATION_THRESHOLDS: ObservationThresholds = {
  marginMovePp: 1.0,
  ratioMovePct: 10,
  revenueNetProfitMovePct: 10,
  workingCapitalMoveDays: 2,
  burnRunwayMovePct: 10,
};

/** Canonical category codes per statement group (mirrors the engine's groupings + migration 0003
 *  taxonomy). Lets a view expand an observation's `categoryGroups` → codes → mapped accounts using
 *  the EXISTING by-code drill-down (getPeriodDrilldown) — no new query, no recomputation. */
export const GROUP_CODES: Record<AccountGroup, string[]> = {
  income: ['operating_revenue', 'other_income'],
  direct_costs: ['cogs'],
  operating_expenses: ['employee_benefits', 'rent_utilities', 'sales_marketing', 'technology_software', 'professional_fees', 'admin_other_opex'],
  below_the_line: ['depreciation_amortisation', 'finance_costs', 'tax_expense'],
  current_assets: ['cash_bank', 'trade_receivables', 'inventory', 'prepaid_advances', 'other_current_assets'],
  non_current_assets: ['ppe', 'intangibles', 'investments', 'other_non_current_assets'],
  current_liabilities: ['trade_payables', 'short_term_borrowings', 'statutory_dues', 'accrued_other_current_liabilities'],
  non_current_liabilities: ['long_term_borrowings', 'provisions', 'other_non_current_liabilities'],
  equity: ['share_capital', 'other_equity', 'reserves_surplus'],
};

type DeltaKind = 'pp' | 'pct' | 'days';
type MetricDef = {
  key: string;
  family: ObservationFamily;
  metric: string;
  unit: ObservationUnit;
  deltaKind: DeltaKind;
  enginePaths: string[];            // engine field(s) read (1; or 2 for the derived expense ratios)
  categoryGroups: AccountGroup[];
  read: (r: PeriodResult) => number | null;
  threshold: (t: ObservationThresholds) => number;
};

const ALL_PL: AccountGroup[] = ['income', 'direct_costs', 'operating_expenses', 'below_the_line'];

const METRICS: MetricDef[] = [
  // --- margins (percentage points) — read engine ratios ---
  { key: 'gross_margin', family: 'margin', metric: 'Gross margin', unit: 'pp', deltaKind: 'pp', enginePaths: ['ratios.grossMarginPct'], categoryGroups: ['income', 'direct_costs'], read: (r) => r.ratios.grossMarginPct, threshold: (t) => t.marginMovePp },
  { key: 'ebitda_margin', family: 'margin', metric: 'EBITDA margin', unit: 'pp', deltaKind: 'pp', enginePaths: ['ratios.ebitdaMarginPct'], categoryGroups: ['income', 'direct_costs', 'operating_expenses'], read: (r) => r.ratios.ebitdaMarginPct, threshold: (t) => t.marginMovePp },
  { key: 'net_margin', family: 'margin', metric: 'Net margin', unit: 'pp', deltaKind: 'pp', enginePaths: ['ratios.netMarginPct'], categoryGroups: ALL_PL, read: (r) => r.ratios.netMarginPct, threshold: (t) => t.marginMovePp },
  // --- revenue & net profit (relative %) — read engine P&L (money) ---
  { key: 'operating_revenue', family: 'revenue', metric: 'Operating revenue', unit: 'INR', deltaKind: 'pct', enginePaths: ['pnl.operatingRevenuePaise'], categoryGroups: ['income'], read: (r) => r.pnl.operatingRevenuePaise, threshold: (t) => t.revenueNetProfitMovePct },
  { key: 'net_profit', family: 'profit', metric: 'Net profit', unit: 'INR', deltaKind: 'pct', enginePaths: ['pnl.netProfitPaise'], categoryGroups: ALL_PL, read: (r) => r.pnl.netProfitPaise, threshold: (t) => t.revenueNetProfitMovePct },
  // --- ratio moves (relative %) ---
  { key: 'current_ratio', family: 'ratio', metric: 'Current ratio', unit: 'ratio', deltaKind: 'pct', enginePaths: ['ratios.currentRatio'], categoryGroups: ['current_assets', 'current_liabilities'], read: (r) => r.ratios.currentRatio, threshold: (t) => t.ratioMovePct },
  { key: 'quick_ratio', family: 'ratio', metric: 'Quick ratio', unit: 'ratio', deltaKind: 'pct', enginePaths: ['ratios.quickRatio'], categoryGroups: ['current_assets', 'current_liabilities'], read: (r) => r.ratios.quickRatio, threshold: (t) => t.ratioMovePct },
  { key: 'debt_to_equity', family: 'ratio', metric: 'Debt-to-equity', unit: 'ratio', deltaKind: 'pct', enginePaths: ['ratios.debtToEquity'], categoryGroups: ['current_liabilities', 'non_current_liabilities', 'equity'], read: (r) => r.ratios.debtToEquity, threshold: (t) => t.ratioMovePct },
  { key: 'interest_coverage', family: 'ratio', metric: 'Interest coverage', unit: 'ratio', deltaKind: 'pct', enginePaths: ['ratios.interestCoverage'], categoryGroups: ALL_PL, read: (r) => r.ratios.interestCoverage, threshold: (t) => t.ratioMovePct },
  // --- ROE / ROCE (percentage points) ---
  { key: 'roe', family: 'ratio', metric: 'Return on equity', unit: 'pp', deltaKind: 'pp', enginePaths: ['ratios.roePct'], categoryGroups: [...ALL_PL, 'equity'], read: (r) => r.ratios.roePct, threshold: (t) => t.marginMovePp },
  { key: 'roce', family: 'ratio', metric: 'Return on capital employed', unit: 'pp', deltaKind: 'pp', enginePaths: ['ratios.rocePct'], categoryGroups: [...ALL_PL, 'non_current_assets', 'current_assets', 'current_liabilities'], read: (r) => r.ratios.rocePct, threshold: (t) => t.marginMovePp },
  // --- working capital (days) ---
  { key: 'dso', family: 'working_capital', metric: 'Days sales outstanding (DSO)', unit: 'days', deltaKind: 'days', enginePaths: ['workingCapital.dso'], categoryGroups: ['current_assets', 'income'], read: (r) => r.workingCapital.dso, threshold: (t) => t.workingCapitalMoveDays },
  { key: 'dpo', family: 'working_capital', metric: 'Days payable outstanding (DPO)', unit: 'days', deltaKind: 'days', enginePaths: ['workingCapital.dpo'], categoryGroups: ['current_liabilities', 'direct_costs'], read: (r) => r.workingCapital.dpo, threshold: (t) => t.workingCapitalMoveDays },
  { key: 'dio', family: 'working_capital', metric: 'Days inventory outstanding (DIO)', unit: 'days', deltaKind: 'days', enginePaths: ['workingCapital.dio'], categoryGroups: ['current_assets', 'direct_costs'], read: (r) => r.workingCapital.dio, threshold: (t) => t.workingCapitalMoveDays },
  { key: 'ccc', family: 'working_capital', metric: 'Cash conversion cycle', unit: 'days', deltaKind: 'days', enginePaths: ['workingCapital.cashConversionCycle'], categoryGroups: ['current_assets', 'current_liabilities', 'income', 'direct_costs'], read: (r) => r.workingCapital.cashConversionCycle, threshold: (t) => t.workingCapitalMoveDays },
  // --- expense-ratio shifts (percentage points) — DERIVED from two engine P&L fields, traced to both ---
  { key: 'cogs_to_revenue', family: 'expense_ratio', metric: 'COGS / revenue', unit: 'pp', deltaKind: 'pp', enginePaths: ['pnl.cogsPaise', 'pnl.operatingRevenuePaise'], categoryGroups: ['income', 'direct_costs'], read: (r) => (r.pnl.operatingRevenuePaise === 0 ? null : (r.pnl.cogsPaise / r.pnl.operatingRevenuePaise) * 100), threshold: (t) => t.marginMovePp },
  { key: 'opex_to_revenue', family: 'expense_ratio', metric: 'Operating expenses / revenue', unit: 'pp', deltaKind: 'pp', enginePaths: ['pnl.operatingExpensesPaise', 'pnl.operatingRevenuePaise'], categoryGroups: ['income', 'operating_expenses'], read: (r) => (r.pnl.operatingRevenuePaise === 0 ? null : (r.pnl.operatingExpensesPaise / r.pnl.operatingRevenuePaise) * 100), threshold: (t) => t.marginMovePp },
  // --- burn & runway (relative %) ---
  { key: 'net_burn', family: 'burn_runway', metric: 'Net burn', unit: 'INR', deltaKind: 'pct', enginePaths: ['startupMetrics.netBurnPaise'], categoryGroups: [...ALL_PL, 'current_assets', 'current_liabilities'], read: (r) => r.startupMetrics.netBurnPaise, threshold: (t) => t.burnRunwayMovePct },
  { key: 'runway', family: 'burn_runway', metric: 'Runway', unit: 'months', deltaKind: 'pct', enginePaths: ['startupMetrics.runwayMonths'], categoryGroups: ['current_assets', ...ALL_PL], read: (r) => r.startupMetrics.runwayMonths, threshold: (t) => t.burnRunwayMovePct },
];

const sign = (n: number) => (n > 0 ? '+' : n < 0 ? '−' : '');
function inr(paise: number): string {
  const neg = paise < 0;
  const s = Math.round(Math.abs(paise) / 100).toString();
  let grouped: string;
  if (s.length <= 3) grouped = s;
  else { const last3 = s.slice(-3); const rest = s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ','); grouped = rest + ',' + last3; }
  return (neg ? '−₹' : '₹') + grouped;
}
const dirWord = (d: ObservationDirection) => (d === 'up' ? 'increased' : d === 'down' ? 'decreased' : 'was unchanged');

function buildStatement(def: MetricDef, fromL: string, toL: string, vFrom: number, vTo: number, deltaAbs: number, deltaPct: number | undefined, deltaPp: number | undefined, dir: ObservationDirection): string {
  const between = `between ${fromL} and ${toL}`;
  switch (def.unit) {
    case 'pp':
      return `${def.metric} ${dirWord(dir)} from ${vFrom.toFixed(1)}% to ${vTo.toFixed(1)}% (${sign(deltaPp!)}${Math.abs(deltaPp!).toFixed(1)}pp) ${between}.`;
    case 'ratio':
      return `${def.metric} ${dirWord(dir)} from ${vFrom.toFixed(2)} to ${vTo.toFixed(2)} (${sign(deltaPct!)}${Math.abs(deltaPct!).toFixed(1)}%) ${between}.`;
    case 'days':
      return `${def.metric} ${dirWord(dir)} from ${vFrom.toFixed(1)} to ${vTo.toFixed(1)} days (${sign(deltaAbs)}${Math.abs(deltaAbs).toFixed(1)} days) ${between}.`;
    case 'months':
      return `${def.metric} ${dirWord(dir)} from ${vFrom.toFixed(1)} to ${vTo.toFixed(1)} months (${sign(deltaPct!)}${Math.abs(deltaPct!).toFixed(1)}%) ${between}.`;
    case 'INR': {
      const tail = def.key === 'net_burn' && vTo < 0 ? ' (a negative net burn means the period generated cash rather than consumed it)' : '';
      return `${def.metric} ${dirWord(dir)} from ${inr(vFrom)} to ${inr(vTo)} (${sign(deltaPct!)}${Math.abs(deltaPct!).toFixed(1)}%) ${between}${tail}.`;
    }
  }
}

/** Tier 1 observations across consecutive period pairs. Pure: input = engine PeriodResult[]. */
export function computeObservations(results: PeriodResult[], thresholds: ObservationThresholds = OBSERVATION_THRESHOLDS): Observation[] {
  const out: Observation[] = [];
  for (let i = 1; i < results.length; i++) {
    const from = results[i - 1];
    const to = results[i];
    for (const def of METRICS) {
      const vFrom = def.read(from);
      const vTo = def.read(to);
      if (vFrom === null || vTo === null) continue; // honest n/a — both endpoints required, never fabricate
      const deltaAbs = vTo - vFrom;
      let deltaPct: number | undefined;
      let deltaPp: number | undefined;
      let notable: boolean;
      const thr = def.threshold(thresholds);
      if (def.deltaKind === 'pp') {
        deltaPp = deltaAbs;
        notable = Math.abs(deltaPp) >= thr;
      } else if (def.deltaKind === 'days') {
        notable = Math.abs(deltaAbs) >= thr;
      } else {
        if (vFrom === 0) continue; // no relative % move from a zero base — honest n/a
        deltaPct = (deltaAbs / Math.abs(vFrom)) * 100;
        notable = Math.abs(deltaPct) >= thr;
      }
      if (!notable) continue;
      const direction: ObservationDirection = deltaAbs > 0 ? 'up' : deltaAbs < 0 ? 'down' : 'flat';
      const traces: EngineTrace[] = def.enginePaths.flatMap((p) => [
        { periodId: from.periodId, enginePath: p, categoryGroups: def.categoryGroups },
        { periodId: to.periodId, enginePath: p, categoryGroups: def.categoryGroups },
      ]);
      out.push({
        id: `${def.key}:${from.periodId}->${to.periodId}`,
        family: def.family,
        metric: def.metric,
        periodsCompared: [from.label, to.label],
        values: { from: vFrom, to: vTo },
        deltaAbs,
        ...(deltaPct !== undefined ? { deltaPct } : {}),
        ...(deltaPp !== undefined ? { deltaPp } : {}),
        direction,
        unit: def.unit,
        statement: buildStatement(def, from.label, to.label, vFrom, vTo, deltaAbs, deltaPct, deltaPp, direction),
        traces,
        status: 'UNVERIFIED',
      });
    }
  }
  return out;
}
