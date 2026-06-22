// src/lib/mis/present.ts — the ONE place the MIS pack is turned from engine results into labelled
// display rows. The on-screen view, the PDF, and the workbook all read these — so every rendered
// number traces straight back to a field on the engine's PeriodResult, with NO recomputation in the
// view (Bible §8.1). `codes` on a row lists the canonical categories it sums, for drill-down.
import type { PeriodResult } from '@/lib/engine/types';

export type StmtRow = {
  label: string;
  paise: number | null;
  codes?: string[]; // categories summed → drill-down to mapped accounts
  kind?: 'line' | 'subtotal' | 'total';
  note?: string;
};

// --- formatting (INR, Indian grouping) ------------------------------------
export function inr(paise: number | null): string {
  if (paise === null || paise === undefined) return '—';
  const sign = paise < 0 ? '−' : '';
  const abs = Math.abs(paise);
  const whole = Math.floor(abs / 100);
  const dec = abs % 100;
  const body = whole.toLocaleString('en-IN');
  return dec === 0 ? `${sign}₹${body}` : `${sign}₹${body}.${String(dec).padStart(2, '0')}`;
}
export const fmtPct = (v: number | null, dp = 1) => (v === null ? '—' : `${v.toFixed(dp)}%`);
export const fmtRatio = (v: number | null, dp = 2) => (v === null ? '—' : v.toFixed(dp));
export const fmtDays = (v: number | null) => (v === null ? '—' : `${Math.round(v)} days`);

// --- statements -----------------------------------------------------------
// The statutory P&L + Balance Sheet now live in ./schedule3 (Companies Act 2013, Schedule III Div I,
// with prior-year comparatives). Cash flow + ratios + KPIs below stay in their managerial form.
export function cfRows(r: PeriodResult): StmtRow[] | null {
  const cf = r.cashFlow;
  if (!cf.available) return null;
  return [
    { label: 'Opening cash', paise: cf.openingCashPaise },
    { label: 'Net cash from operations', paise: cf.cfoPaise, kind: 'subtotal' },
    { label: 'Net cash from investing', paise: cf.cfiPaise, kind: 'subtotal' },
    { label: 'Net cash from financing', paise: cf.cffPaise, kind: 'subtotal' },
    { label: 'Net change in cash', paise: cf.netChangePaise, kind: 'subtotal' },
    { label: 'Closing cash', paise: cf.closingCashPaise, kind: 'total' },
  ];
}

export type RatioCard = { label: string; value: string };
export function ratioCards(r: PeriodResult): RatioCard[] {
  const x = r.ratios;
  const w = r.workingCapital;
  return [
    { label: 'Current ratio', value: fmtRatio(x.currentRatio) },
    { label: 'Quick ratio', value: fmtRatio(x.quickRatio) },
    { label: 'Gross margin', value: fmtPct(x.grossMarginPct) },
    { label: 'EBITDA margin', value: fmtPct(x.ebitdaMarginPct) },
    { label: 'Net margin', value: fmtPct(x.netMarginPct) },
    { label: 'Return on equity', value: fmtPct(x.roePct) },
    { label: 'Return on capital', value: fmtPct(x.rocePct) },
    { label: 'Debt / equity', value: fmtRatio(x.debtToEquity) },
    { label: 'Interest coverage', value: x.interestCoverage === null ? '—' : `${fmtRatio(x.interestCoverage)}×` },
    { label: 'DSO', value: fmtDays(w.dso) },
    { label: 'DPO', value: fmtDays(w.dpo) },
    { label: 'DIO', value: fmtDays(w.dio) },
  ];
}

// --- headline KPIs with MoM delta (uses the period chain) -----------------
export type Kpi = { label: string; paise: number; deltaPct: number | null };
export function kpis(results: PeriodResult[], idx: number): Kpi[] {
  const r = results[idx];
  const prior = idx > 0 ? results[idx - 1] : null;
  const delta = (cur: number, prev: number | undefined) => (prior && prev ? ((cur - prev) / prev) * 100 : null);
  return [
    { label: 'Revenue', paise: r.pnl.operatingRevenuePaise, deltaPct: delta(r.pnl.operatingRevenuePaise, prior?.pnl.operatingRevenuePaise) },
    { label: 'EBITDA', paise: r.pnl.ebitdaPaise, deltaPct: delta(r.pnl.ebitdaPaise, prior?.pnl.ebitdaPaise) },
    { label: 'Net profit', paise: r.pnl.netProfitPaise, deltaPct: delta(r.pnl.netProfitPaise, prior?.pnl.netProfitPaise) },
    { label: 'Cash', paise: r.balanceSheet.cashPaise, deltaPct: delta(r.balanceSheet.cashPaise, prior?.balanceSheet.cashPaise) },
  ];
}

// --- MoM trend series (whole chain) ---------------------------------------
export type TrendSeries = { label: string; points: { label: string; paise: number }[] };
export function trendSeries(results: PeriodResult[]): TrendSeries[] {
  const pts = (pick: (r: PeriodResult) => number) => results.map((r) => ({ label: r.label, paise: pick(r) }));
  return [
    { label: 'Revenue', points: pts((r) => r.pnl.operatingRevenuePaise) },
    { label: 'Net profit', points: pts((r) => r.pnl.netProfitPaise) },
    { label: 'Cash', points: pts((r) => r.balanceSheet.cashPaise) },
  ];
}
