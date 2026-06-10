// src/lib/insight/diagnoses.ts — Insight Layer, TIER 2 (Diagnoses). PURE, unit-tested. For each
// Tier-1 observation it produces a RULE-BASED "why": the move decomposed into drivers, each an EXACT
// function of (unverified) engine fields / line movements — never guessed. This tier INTERPRETS
// (which driver dominates), so every rule is logged CA-VALIDATE for the CA to sign off.
// status:'UNVERIFIED' throughout. Built on the UNVERIFIED engine — re-validate after the CA diff (M-verify).
import type { PeriodResult } from '../engine/types';
import type { Observation } from './observations';
import { inr } from './observations';

export type DiagnosisDriver = {
  driver: string;
  fromValue: number;
  toValue: number;
  contributionPp?: number;    // pp contribution (margin/ratio-pp bridges) — additive: drivers sum to ΔMetric
  contributionPaise?: number; // paise contribution (net-profit / burn bridges) — additive
  effectAbs?: number;         // single-factor ceteris-paribus effect (working capital — NOT additive)
  detail: string;
  traces: string[];           // engine field path(s)
};
export type Diagnosis = {
  observationId: string;
  ruleId: string;
  metric: string;
  decomposition: 'additive' | 'single_factor' | 'note';
  drivers: DiagnosisDriver[];
  cause: string;              // plain-language dominant cause
  traces: { periodId: string; enginePath: string }[];
  status: 'UNVERIFIED';
};

/** CA-VALIDATE — every Tier-2 rule is an interpretation the CA must sign off. */
export const DIAGNOSIS_RULES: { id: string; appliesTo: string; logic: string }[] = [
  { id: 'DIAG.margin_bridge', appliesTo: 'gross/EBITDA/net margin', logic: 'Decompose Δmargin (pp) into additive component-vs-revenue effects. Gross: COGS-effect + revenue-effect (exact N/D bridge on COGS/Rev). EBITDA: gross-margin change + opex/revenue change. Net: EBITDA-margin change + D&A/rev + finance/rev + tax/rev + other-income/rev changes. Drivers sum to the observed Δmargin.' },
  { id: 'DIAG.revenue_line', appliesTo: 'operating revenue', logic: 'Top-line move; the engine has no volume/price/mix split (needs unit-level data) — reported as honest n/a, not guessed.' },
  { id: 'DIAG.net_profit_bridge', appliesTo: 'net profit', logic: 'P&L waterfall: ΔNP = ΔRevenue − ΔCOGS − Δopex − ΔD&A − Δfinance − Δtax + Δother-income. Each driver in ₹; drivers sum to ΔNP.' },
  { id: 'DIAG.ratio_nd_bridge', appliesTo: 'current ratio / interest coverage / ROE / ROCE', logic: 'Exact numerator/denominator bridge on the ratio definition: numerator-effect=(N_to−N_from)/D_to, denominator-effect=N_from·(1/D_to−1/D_from); sum=ΔRatio (×100 for ROE/ROCE pp). Both N and D are engine fields.' },
  { id: 'DIAG.ratio_unavailable', appliesTo: 'quick ratio / debt-to-equity', logic: 'Numerator (quick assets / total borrowings) is not exposed as a PeriodResult field — no fabricated split; reported as n/a pending the inventory/borrowings breakdown.' },
  { id: 'DIAG.working_capital_factors', appliesTo: 'DSO / DPO / DIO', logic: 'M = balance/flow × days, balance implied = M·flow/days from engine fields. Report each factor (implied balance, flow=revenue|COGS, days) from→to and its ceteris-paribus single-factor effect on the metric. Multiplicative — single-factor effects, NOT additive; dominant factor names the cause.' },
  { id: 'DIAG.ccc_components', appliesTo: 'cash conversion cycle', logic: 'CCC = DSO + DIO − DPO. Additive: drivers = ΔDSO, ΔDIO, −ΔDPO (days); sum = ΔCCC.' },
  { id: 'DIAG.expense_ratio_bridge', appliesTo: 'COGS/revenue, opex/revenue', logic: 'Exact N/D bridge on expense/revenue: expense-effect + revenue-effect (pp); sum = Δ(expense/revenue).' },
  { id: 'DIAG.burn_bridge', appliesTo: 'net burn', logic: 'Net burn = −(CFO + CFI) = −NP − D&A − ΔWC + capex + other-investing. Additive: drivers = the changes in each CF component (₹); sum = Δnet-burn.' },
  { id: 'DIAG.runway_bridge', appliesTo: 'runway', logic: 'Runway = cash / net-burn. Exact N/D bridge: cash-effect + burn-effect (months); sum = Δrunway.' },
];

const ndBridge = (nFrom: number, nTo: number, dFrom: number, dTo: number) => ({
  num: (nTo - nFrom) / dTo,            // numerator effect
  den: nFrom * (1 / dTo - 1 / dFrom),  // denominator effect  (num + den = nTo/dTo − nFrom/dFrom)
});
const ratioPp = (nFrom: number, nTo: number, rFrom: number, rTo: number) => 100 * (nTo / rTo - nFrom / rFrom);
const dom = (drivers: DiagnosisDriver[], key: 'contributionPp' | 'contributionPaise' | 'effectAbs') =>
  drivers.reduce((a, b) => (Math.abs((b[key] ?? 0)) > Math.abs((a[key] ?? 0)) ? b : a), drivers[0]);

const P = (path: string) => path; // readability for engine paths

export function computeDiagnoses(observations: Observation[], results: PeriodResult[]): Diagnosis[] {
  const byId = new Map(results.map((r) => [r.periodId, r]));
  const out: Diagnosis[] = [];

  for (const o of observations) {
    const key = o.id.split(':')[0];
    const [fromId, toId] = o.id.split(':')[1].split('->');
    const f = byId.get(fromId);
    const t = byId.get(toId);
    if (!f || !t) continue;
    const baseTraces = [...new Set(o.traces.map((x) => x.enginePath))].flatMap((p) => [
      { periodId: fromId, enginePath: p },
      { periodId: toId, enginePath: p },
    ]);
    const push = (d: Omit<Diagnosis, 'observationId' | 'status'>) => out.push({ observationId: o.id, status: 'UNVERIFIED', ...d });

    // --- margins ---
    if (key === 'gross_margin') {
      const b = ndBridge(f.pnl.cogsPaise, t.pnl.cogsPaise, f.pnl.operatingRevenuePaise, t.pnl.operatingRevenuePaise);
      const drivers: DiagnosisDriver[] = [
        { driver: 'COGS change', fromValue: f.pnl.cogsPaise, toValue: t.pnl.cogsPaise, contributionPp: -100 * b.num, detail: `COGS ${inr(f.pnl.cogsPaise)} → ${inr(t.pnl.cogsPaise)}`, traces: [P('pnl.cogsPaise'), P('pnl.operatingRevenuePaise')] },
        { driver: 'Revenue change', fromValue: f.pnl.operatingRevenuePaise, toValue: t.pnl.operatingRevenuePaise, contributionPp: -100 * b.den, detail: `revenue ${inr(f.pnl.operatingRevenuePaise)} → ${inr(t.pnl.operatingRevenuePaise)}`, traces: [P('pnl.operatingRevenuePaise')] },
      ];
      push({ ruleId: 'DIAG.margin_bridge', metric: o.metric, decomposition: 'additive', drivers, cause: `${dom(drivers, 'contributionPp').driver} dominates (${(dom(drivers, 'contributionPp').contributionPp! >= 0 ? '+' : '−')}${Math.abs(dom(drivers, 'contributionPp').contributionPp!).toFixed(1)}pp).`, traces: baseTraces });
      continue;
    }
    if (key === 'ebitda_margin') {
      const gmChange = (t.ratios.grossMarginPct ?? 0) - (f.ratios.grossMarginPct ?? 0);
      const opexRatioChange = -ratioPp(f.pnl.operatingExpensesPaise, t.pnl.operatingExpensesPaise, f.pnl.operatingRevenuePaise, t.pnl.operatingRevenuePaise);
      const drivers: DiagnosisDriver[] = [
        { driver: 'Gross-margin change', fromValue: f.ratios.grossMarginPct ?? 0, toValue: t.ratios.grossMarginPct ?? 0, contributionPp: gmChange, detail: `gross margin ${(f.ratios.grossMarginPct ?? 0).toFixed(1)}% → ${(t.ratios.grossMarginPct ?? 0).toFixed(1)}%`, traces: [P('ratios.grossMarginPct')] },
        { driver: 'Operating-expense ratio change', fromValue: f.pnl.operatingExpensesPaise, toValue: t.pnl.operatingExpensesPaise, contributionPp: opexRatioChange, detail: `opex/revenue ${(100 * f.pnl.operatingExpensesPaise / f.pnl.operatingRevenuePaise).toFixed(1)}% → ${(100 * t.pnl.operatingExpensesPaise / t.pnl.operatingRevenuePaise).toFixed(1)}%`, traces: [P('pnl.operatingExpensesPaise'), P('pnl.operatingRevenuePaise')] },
      ];
      push({ ruleId: 'DIAG.margin_bridge', metric: o.metric, decomposition: 'additive', drivers, cause: `${dom(drivers, 'contributionPp').driver} dominates (${(dom(drivers, 'contributionPp').contributionPp! >= 0 ? '+' : '−')}${Math.abs(dom(drivers, 'contributionPp').contributionPp!).toFixed(1)}pp).`, traces: baseTraces });
      continue;
    }
    if (key === 'net_margin') {
      const drivers: DiagnosisDriver[] = [
        { driver: 'EBITDA-margin change', fromValue: f.ratios.ebitdaMarginPct ?? 0, toValue: t.ratios.ebitdaMarginPct ?? 0, contributionPp: (t.ratios.ebitdaMarginPct ?? 0) - (f.ratios.ebitdaMarginPct ?? 0), detail: `EBITDA margin ${(f.ratios.ebitdaMarginPct ?? 0).toFixed(1)}% → ${(t.ratios.ebitdaMarginPct ?? 0).toFixed(1)}%`, traces: [P('ratios.ebitdaMarginPct')] },
        { driver: 'Depreciation/revenue change', fromValue: f.pnl.depreciationAmortisationPaise, toValue: t.pnl.depreciationAmortisationPaise, contributionPp: -ratioPp(f.pnl.depreciationAmortisationPaise, t.pnl.depreciationAmortisationPaise, f.pnl.operatingRevenuePaise, t.pnl.operatingRevenuePaise), detail: `D&A ${inr(f.pnl.depreciationAmortisationPaise)} → ${inr(t.pnl.depreciationAmortisationPaise)}`, traces: [P('pnl.depreciationAmortisationPaise'), P('pnl.operatingRevenuePaise')] },
        { driver: 'Finance-cost/revenue change', fromValue: f.pnl.financeCostsPaise, toValue: t.pnl.financeCostsPaise, contributionPp: -ratioPp(f.pnl.financeCostsPaise, t.pnl.financeCostsPaise, f.pnl.operatingRevenuePaise, t.pnl.operatingRevenuePaise), detail: `finance costs ${inr(f.pnl.financeCostsPaise)} → ${inr(t.pnl.financeCostsPaise)}`, traces: [P('pnl.financeCostsPaise'), P('pnl.operatingRevenuePaise')] },
        { driver: 'Tax/revenue change', fromValue: f.pnl.taxPaise, toValue: t.pnl.taxPaise, contributionPp: -ratioPp(f.pnl.taxPaise, t.pnl.taxPaise, f.pnl.operatingRevenuePaise, t.pnl.operatingRevenuePaise), detail: `tax ${inr(f.pnl.taxPaise)} → ${inr(t.pnl.taxPaise)}`, traces: [P('pnl.taxPaise'), P('pnl.operatingRevenuePaise')] },
        { driver: 'Other-income/revenue change', fromValue: f.pnl.otherIncomePaise, toValue: t.pnl.otherIncomePaise, contributionPp: ratioPp(f.pnl.otherIncomePaise, t.pnl.otherIncomePaise, f.pnl.operatingRevenuePaise, t.pnl.operatingRevenuePaise), detail: `other income ${inr(f.pnl.otherIncomePaise)} → ${inr(t.pnl.otherIncomePaise)}`, traces: [P('pnl.otherIncomePaise'), P('pnl.operatingRevenuePaise')] },
      ];
      push({ ruleId: 'DIAG.margin_bridge', metric: o.metric, decomposition: 'additive', drivers, cause: `${dom(drivers, 'contributionPp').driver} dominates (${(dom(drivers, 'contributionPp').contributionPp! >= 0 ? '+' : '−')}${Math.abs(dom(drivers, 'contributionPp').contributionPp!).toFixed(1)}pp).`, traces: baseTraces });
      continue;
    }

    // --- revenue (single line; honest n/a on price/mix) ---
    if (key === 'operating_revenue') {
      push({
        ruleId: 'DIAG.revenue_line', metric: o.metric, decomposition: 'note',
        drivers: [{ driver: 'Operating-revenue line', fromValue: f.pnl.operatingRevenuePaise, toValue: t.pnl.operatingRevenuePaise, contributionPaise: t.pnl.operatingRevenuePaise - f.pnl.operatingRevenuePaise, detail: `revenue ${inr(f.pnl.operatingRevenuePaise)} → ${inr(t.pnl.operatingRevenuePaise)}`, traces: [P('pnl.operatingRevenuePaise')] }],
        cause: 'Top-line revenue move. A volume/price/mix split is n/a — the engine has no unit-level data (not fabricated).',
        traces: baseTraces,
      });
      continue;
    }

    // --- net profit waterfall ---
    if (key === 'net_profit') {
      const d = (path: 'cogsPaise' | 'operatingExpensesPaise' | 'depreciationAmortisationPaise' | 'financeCostsPaise' | 'taxPaise' | 'operatingRevenuePaise' | 'otherIncomePaise', signFlip: number) =>
        signFlip * ((t.pnl[path] as number) - (f.pnl[path] as number));
      const drivers: DiagnosisDriver[] = [
        { driver: 'Revenue', fromValue: f.pnl.operatingRevenuePaise, toValue: t.pnl.operatingRevenuePaise, contributionPaise: d('operatingRevenuePaise', 1), detail: `${inr(f.pnl.operatingRevenuePaise)} → ${inr(t.pnl.operatingRevenuePaise)}`, traces: [P('pnl.operatingRevenuePaise')] },
        { driver: 'COGS', fromValue: f.pnl.cogsPaise, toValue: t.pnl.cogsPaise, contributionPaise: d('cogsPaise', -1), detail: `${inr(f.pnl.cogsPaise)} → ${inr(t.pnl.cogsPaise)}`, traces: [P('pnl.cogsPaise')] },
        { driver: 'Operating expenses', fromValue: f.pnl.operatingExpensesPaise, toValue: t.pnl.operatingExpensesPaise, contributionPaise: d('operatingExpensesPaise', -1), detail: `${inr(f.pnl.operatingExpensesPaise)} → ${inr(t.pnl.operatingExpensesPaise)}`, traces: [P('pnl.operatingExpensesPaise')] },
        { driver: 'Depreciation & amortisation', fromValue: f.pnl.depreciationAmortisationPaise, toValue: t.pnl.depreciationAmortisationPaise, contributionPaise: d('depreciationAmortisationPaise', -1), detail: `${inr(f.pnl.depreciationAmortisationPaise)} → ${inr(t.pnl.depreciationAmortisationPaise)}`, traces: [P('pnl.depreciationAmortisationPaise')] },
        { driver: 'Finance costs', fromValue: f.pnl.financeCostsPaise, toValue: t.pnl.financeCostsPaise, contributionPaise: d('financeCostsPaise', -1), detail: `${inr(f.pnl.financeCostsPaise)} → ${inr(t.pnl.financeCostsPaise)}`, traces: [P('pnl.financeCostsPaise')] },
        { driver: 'Tax', fromValue: f.pnl.taxPaise, toValue: t.pnl.taxPaise, contributionPaise: d('taxPaise', -1), detail: `${inr(f.pnl.taxPaise)} → ${inr(t.pnl.taxPaise)}`, traces: [P('pnl.taxPaise')] },
        { driver: 'Other income', fromValue: f.pnl.otherIncomePaise, toValue: t.pnl.otherIncomePaise, contributionPaise: d('otherIncomePaise', 1), detail: `${inr(f.pnl.otherIncomePaise)} → ${inr(t.pnl.otherIncomePaise)}`, traces: [P('pnl.otherIncomePaise')] },
      ];
      push({ ruleId: 'DIAG.net_profit_bridge', metric: o.metric, decomposition: 'additive', drivers, cause: `${dom(drivers, 'contributionPaise').driver} is the largest driver (${inr(dom(drivers, 'contributionPaise').contributionPaise!)}).`, traces: baseTraces });
      continue;
    }

    // --- ratios with both N,D as engine fields ---
    const ND: Record<string, { n: (r: PeriodResult) => number; d: (r: PeriodResult) => number; nL: string; dL: string; nP: string; dP: string; pp: boolean }> = {
      current_ratio: { n: (r) => r.balanceSheet.currentAssetsPaise, d: (r) => r.balanceSheet.currentLiabilitiesPaise, nL: 'current assets', dL: 'current liabilities', nP: 'balanceSheet.currentAssetsPaise', dP: 'balanceSheet.currentLiabilitiesPaise', pp: false },
      interest_coverage: { n: (r) => r.pnl.ebitPaise, d: (r) => r.pnl.financeCostsPaise, nL: 'EBIT', dL: 'finance costs', nP: 'pnl.ebitPaise', dP: 'pnl.financeCostsPaise', pp: false },
      roe: { n: (r) => r.pnl.netProfitPaise, d: (r) => r.balanceSheet.totalEquityPaise, nL: 'net profit', dL: 'total equity', nP: 'pnl.netProfitPaise', dP: 'balanceSheet.totalEquityPaise', pp: true },
      roce: { n: (r) => r.pnl.ebitPaise, d: (r) => r.balanceSheet.totalAssetsPaise - r.balanceSheet.currentLiabilitiesPaise, nL: 'EBIT', dL: 'capital employed', nP: 'pnl.ebitPaise', dP: 'balanceSheet.totalAssetsPaise−balanceSheet.currentLiabilitiesPaise', pp: true },
    };
    if (ND[key]) {
      const c = ND[key];
      const b = ndBridge(c.n(f), c.n(t), c.d(f), c.d(t));
      const scale = c.pp ? 100 : 1;
      const drivers: DiagnosisDriver[] = [
        { driver: `${c.nL} change`, fromValue: c.n(f), toValue: c.n(t), contributionPp: c.pp ? scale * b.num : undefined, effectAbs: c.pp ? undefined : b.num, detail: `${c.nL} ${inr(c.n(f))} → ${inr(c.n(t))}`, traces: [c.nP] },
        { driver: `${c.dL} change`, fromValue: c.d(f), toValue: c.d(t), contributionPp: c.pp ? scale * b.den : undefined, effectAbs: c.pp ? undefined : b.den, detail: `${c.dL} ${inr(c.d(f))} → ${inr(c.d(t))}`, traces: [c.dP] },
      ];
      const domKey = c.pp ? 'contributionPp' : 'effectAbs';
      push({ ruleId: 'DIAG.ratio_nd_bridge', metric: o.metric, decomposition: 'additive', drivers, cause: `${dom(drivers, domKey).driver} dominates.`, traces: baseTraces });
      continue;
    }
    if (key === 'quick_ratio' || key === 'debt_to_equity') {
      push({ ruleId: 'DIAG.ratio_unavailable', metric: o.metric, decomposition: 'note', drivers: [], cause: 'Numerator is not exposed as a PeriodResult field (quick assets / total borrowings) — no fabricated driver split; needs the inventory/borrowings breakdown.', traces: baseTraces });
      continue;
    }

    // --- working capital single-factor (DSO/DPO/DIO) ---
    const WC: Record<string, { metricFrom: number | null; metricTo: number | null; flowF: number; flowT: number; flowL: string; flowP: string; balL: string }> = {
      dso: { metricFrom: f.workingCapital.dso, metricTo: t.workingCapital.dso, flowF: f.pnl.operatingRevenuePaise, flowT: t.pnl.operatingRevenuePaise, flowL: 'revenue', flowP: 'pnl.operatingRevenuePaise', balL: 'receivables' },
      dpo: { metricFrom: f.workingCapital.dpo, metricTo: t.workingCapital.dpo, flowF: f.pnl.cogsPaise, flowT: t.pnl.cogsPaise, flowL: 'COGS', flowP: 'pnl.cogsPaise', balL: 'payables' },
      dio: { metricFrom: f.workingCapital.dio, metricTo: t.workingCapital.dio, flowF: f.pnl.cogsPaise, flowT: t.pnl.cogsPaise, flowL: 'COGS', flowP: 'pnl.cogsPaise', balL: 'inventory' },
    };
    if (WC[key] && WC[key].metricFrom !== null && WC[key].metricTo !== null) {
      const w = WC[key];
      const daysF = f.workingCapital.daysInMonth;
      const daysT = t.workingCapital.daysInMonth;
      const balF = (w.metricFrom! * w.flowF) / daysF; // implied balance from engine fields (exact identity)
      const balT = (w.metricTo! * w.flowT) / daysT;
      const balEffect = (balT / w.flowF) * daysF - w.metricFrom!;  // vary balance only
      const flowEffect = (balF / w.flowT) * daysF - w.metricFrom!;  // vary flow only
      const daysEffect = (balF / w.flowF) * daysT - w.metricFrom!;  // vary days only
      const drivers: DiagnosisDriver[] = [
        { driver: `${w.balL} change`, fromValue: balF, toValue: balT, effectAbs: balEffect, detail: `${w.balL} ${inr(balF)} → ${inr(balT)} (implied from the metric × flow ÷ days)`, traces: [`workingCapital.${key}`, w.flowP] },
        { driver: `${w.flowL} change`, fromValue: w.flowF, toValue: w.flowT, effectAbs: flowEffect, detail: `${w.flowL} ${inr(w.flowF)} → ${inr(w.flowT)}`, traces: [w.flowP] },
        { driver: 'days-in-month change', fromValue: daysF, toValue: daysT, effectAbs: daysEffect, detail: `${daysF} → ${daysT} days`, traces: ['workingCapital.daysInMonth'] },
      ];
      push({ ruleId: 'DIAG.working_capital_factors', metric: o.metric, decomposition: 'single_factor', drivers, cause: `${dom(drivers, 'effectAbs').driver} is the largest single-factor effect (${dom(drivers, 'effectAbs').effectAbs! >= 0 ? '+' : '−'}${Math.abs(dom(drivers, 'effectAbs').effectAbs!).toFixed(1)} days).`, traces: baseTraces });
      continue;
    }
    if (key === 'ccc' && f.workingCapital.cashConversionCycle !== null && t.workingCapital.cashConversionCycle !== null) {
      const dd = (m: 'dso' | 'dio' | 'dpo', s: number) => s * ((t.workingCapital[m] as number) - (f.workingCapital[m] as number));
      const drivers: DiagnosisDriver[] = [
        { driver: 'DSO', fromValue: f.workingCapital.dso!, toValue: t.workingCapital.dso!, contributionPp: dd('dso', 1), detail: `DSO ${f.workingCapital.dso!.toFixed(1)} → ${t.workingCapital.dso!.toFixed(1)} days`, traces: ['workingCapital.dso'] },
        { driver: 'DIO', fromValue: f.workingCapital.dio!, toValue: t.workingCapital.dio!, contributionPp: dd('dio', 1), detail: `DIO ${f.workingCapital.dio!.toFixed(1)} → ${t.workingCapital.dio!.toFixed(1)} days`, traces: ['workingCapital.dio'] },
        { driver: 'DPO (subtracts)', fromValue: f.workingCapital.dpo!, toValue: t.workingCapital.dpo!, contributionPp: dd('dpo', -1), detail: `DPO ${f.workingCapital.dpo!.toFixed(1)} → ${t.workingCapital.dpo!.toFixed(1)} days`, traces: ['workingCapital.dpo'] },
      ];
      push({ ruleId: 'DIAG.ccc_components', metric: o.metric, decomposition: 'additive', drivers, cause: `${dom(drivers, 'contributionPp').driver} drives the cycle change.`, traces: baseTraces });
      continue;
    }

    // --- expense ratios (N/D bridge, pp) ---
    if (key === 'cogs_to_revenue' || key === 'opex_to_revenue') {
      const nF = key === 'cogs_to_revenue' ? f.pnl.cogsPaise : f.pnl.operatingExpensesPaise;
      const nT = key === 'cogs_to_revenue' ? t.pnl.cogsPaise : t.pnl.operatingExpensesPaise;
      const nP = key === 'cogs_to_revenue' ? 'pnl.cogsPaise' : 'pnl.operatingExpensesPaise';
      const b = ndBridge(nF, nT, f.pnl.operatingRevenuePaise, t.pnl.operatingRevenuePaise);
      const drivers: DiagnosisDriver[] = [
        { driver: 'Expense change', fromValue: nF, toValue: nT, contributionPp: 100 * b.num, detail: `${inr(nF)} → ${inr(nT)}`, traces: [nP] },
        { driver: 'Revenue change', fromValue: f.pnl.operatingRevenuePaise, toValue: t.pnl.operatingRevenuePaise, contributionPp: 100 * b.den, detail: `revenue ${inr(f.pnl.operatingRevenuePaise)} → ${inr(t.pnl.operatingRevenuePaise)}`, traces: ['pnl.operatingRevenuePaise'] },
      ];
      push({ ruleId: 'DIAG.expense_ratio_bridge', metric: o.metric, decomposition: 'additive', drivers, cause: `${dom(drivers, 'contributionPp').driver} dominates (${dom(drivers, 'contributionPp').contributionPp! >= 0 ? '+' : '−'}${Math.abs(dom(drivers, 'contributionPp').contributionPp!).toFixed(1)}pp).`, traces: baseTraces });
      continue;
    }

    // --- net burn (additive over CF components) ---
    if (key === 'net_burn' && f.cashFlow.available && t.cashFlow.available) {
      const fc = f.cashFlow.components;
      const tc = t.cashFlow.components;
      const drivers: DiagnosisDriver[] = [
        { driver: 'Net profit', fromValue: fc.netProfitPaise, toValue: tc.netProfitPaise, contributionPaise: -(tc.netProfitPaise - fc.netProfitPaise), detail: `${inr(fc.netProfitPaise)} → ${inr(tc.netProfitPaise)}`, traces: ['cashFlow.components.netProfitPaise'] },
        { driver: 'Depreciation add-back', fromValue: fc.depreciationAddbackPaise, toValue: tc.depreciationAddbackPaise, contributionPaise: -(tc.depreciationAddbackPaise - fc.depreciationAddbackPaise), detail: `${inr(fc.depreciationAddbackPaise)} → ${inr(tc.depreciationAddbackPaise)}`, traces: ['cashFlow.components.depreciationAddbackPaise'] },
        { driver: 'Working-capital change', fromValue: fc.workingCapitalChangePaise, toValue: tc.workingCapitalChangePaise, contributionPaise: -(tc.workingCapitalChangePaise - fc.workingCapitalChangePaise), detail: `${inr(fc.workingCapitalChangePaise)} → ${inr(tc.workingCapitalChangePaise)}`, traces: ['cashFlow.components.workingCapitalChangePaise'] },
        { driver: 'Capex', fromValue: fc.capexPaise, toValue: tc.capexPaise, contributionPaise: (tc.capexPaise - fc.capexPaise), detail: `${inr(fc.capexPaise)} → ${inr(tc.capexPaise)}`, traces: ['cashFlow.components.capexPaise'] },
        { driver: 'Other investing', fromValue: fc.otherInvestingPaise, toValue: tc.otherInvestingPaise, contributionPaise: (tc.otherInvestingPaise - fc.otherInvestingPaise), detail: `${inr(fc.otherInvestingPaise)} → ${inr(tc.otherInvestingPaise)}`, traces: ['cashFlow.components.otherInvestingPaise'] },
      ];
      push({ ruleId: 'DIAG.burn_bridge', metric: o.metric, decomposition: 'additive', drivers, cause: `${dom(drivers, 'contributionPaise').driver} is the largest driver of the net-burn change (${inr(dom(drivers, 'contributionPaise').contributionPaise!)}).`, traces: baseTraces });
      continue;
    }

    // --- runway (N/D bridge, months) ---
    if (key === 'runway' && f.startupMetrics.runwayMonths !== null && t.startupMetrics.runwayMonths !== null && f.startupMetrics.netBurnPaise && t.startupMetrics.netBurnPaise) {
      const b = ndBridge(f.balanceSheet.cashPaise, t.balanceSheet.cashPaise, f.startupMetrics.netBurnPaise, t.startupMetrics.netBurnPaise);
      const drivers: DiagnosisDriver[] = [
        { driver: 'Cash change', fromValue: f.balanceSheet.cashPaise, toValue: t.balanceSheet.cashPaise, effectAbs: b.num, detail: `cash ${inr(f.balanceSheet.cashPaise)} → ${inr(t.balanceSheet.cashPaise)}`, traces: ['balanceSheet.cashPaise'] },
        { driver: 'Net-burn change', fromValue: f.startupMetrics.netBurnPaise, toValue: t.startupMetrics.netBurnPaise, effectAbs: b.den, detail: `net burn ${inr(f.startupMetrics.netBurnPaise)} → ${inr(t.startupMetrics.netBurnPaise)}`, traces: ['startupMetrics.netBurnPaise'] },
      ];
      push({ ruleId: 'DIAG.runway_bridge', metric: o.metric, decomposition: 'additive', drivers, cause: `${dom(drivers, 'effectAbs').driver} dominates.`, traces: baseTraces });
      continue;
    }
  }
  return out;
}
