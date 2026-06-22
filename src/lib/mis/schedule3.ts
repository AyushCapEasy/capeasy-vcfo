// src/lib/mis/schedule3.ts — Companies Act 2013, Schedule III (Division I, AS) STATUTORY format.
// Re-presents the SAME engine PeriodResult values in the prescribed order / labels / grouping, with
// the mandated prior-year COMPARATIVE column. No value is recomputed here — every figure traces to a
// PeriodResult field or its category naturals (engine once, views many). Lines the engine cannot yet
// split honestly (current vs deferred tax; the 3-way cost-of-materials split; EPS share count) are
// shown as nil/combined with a visible note and logged as required data-layer follow-ups — NEVER
// fabricated. NOTHING here is "correct" until CA sign-off.
import type { PeriodResult } from '@/lib/engine/types';

export type Sch3Row = {
  label: string;
  no?: string;                 // Schedule III item number (I, II, …) — statutory look
  curPaise: number | null;     // current period (null = header row / nil line shown as —)
  priorPaise: number | null;   // prior period (null = first-year company → no comparative)
  kind?: 'header' | 'line' | 'subtotal' | 'total';
  indent?: 0 | 1;              // 1 = sub-line under a header
  note?: string;               // honest caveat / data-gap pointer
  codes?: string[];            // drill-down: canonical categories this line sums (current period)
};

// Task 2 — the standing tax-source caveat. Shown on every tax line, in every view.
export const TAX_SOURCE_NOTE = 'Tax figures as per books — not an independent tax computation.';

// Footnotes rendered once beneath each statement (the honest Schedule III data-layer gaps, logged).
export const SCH3_PL_FOOTNOTES = [
  'Cost of materials consumed already nets the closing-stock credit (GAP-1: purchases − change in inventories). The separate “purchases of stock-in-trade” / “changes in inventories” lines need inventory-movement data not in the trial balance — logged as required.',
  'Tax expense is shown combined and READ FROM THE BOOKS. The current-tax / deferred-tax split needs separately-ledgered tax — logged. ' + TAX_SOURCE_NOTE,
  'EPS (basic / diluted) needs the number of equity shares, which the trial balance does not carry — logged as required.',
];
export const SCH3_BS_FOOTNOTES = [
  'Current / non-current classification follows the canonical taxonomy (operating-cycle / 12-month rule); see the engine taxonomy.',
  '“Reserves and surplus” carries opening retained earnings + the period’s profit (and any other equity). Deferred-tax asset/liability is not separately ledgered — folded into other non-current balances; logged.',
];

const OTHER_EXPENSES = ['rent_utilities', 'sales_marketing', 'technology_software', 'professional_fees', 'admin_other_opex'];

const natSum = (r: PeriodResult, codes: string[]): number => codes.reduce((s, c) => s + (r.naturalsPaise[c] ?? 0), 0);

/** Pair a current-period picker with its prior-period value (null prior → first-year, no comparative). */
function pair(cur: PeriodResult, prior: PeriodResult | null | undefined, pick: (r: PeriodResult) => number) {
  return { curPaise: pick(cur), priorPaise: prior ? pick(prior) : null };
}

// --- Statement of Profit and Loss (Schedule III, Part II) -----------------------------------------
export function plScheduleIII(cur: PeriodResult, prior?: PeriodResult | null): Sch3Row[] {
  const revenueOps = (r: PeriodResult) => r.pnl.operatingRevenuePaise;
  const otherIncome = (r: PeriodResult) => r.pnl.otherIncomePaise;
  const totalRevenue = (r: PeriodResult) => r.pnl.operatingRevenuePaise + r.pnl.otherIncomePaise;
  const materials = (r: PeriodResult) => r.pnl.cogsPaise;
  const employee = (r: PeriodResult) => r.naturalsPaise['employee_benefits'] ?? 0;
  const finance = (r: PeriodResult) => r.pnl.financeCostsPaise;
  const depreciation = (r: PeriodResult) => r.pnl.depreciationAmortisationPaise;
  const otherExpenses = (r: PeriodResult) => natSum(r, OTHER_EXPENSES);
  const totalExpenses = (r: PeriodResult) => materials(r) + employee(r) + finance(r) + depreciation(r) + otherExpenses(r);
  // With no exceptional/extraordinary items recognised, V = VII = IX = profit before tax (= engine ebt).
  const profitBeforeTax = (r: PeriodResult) => r.pnl.ebtPaise;
  const tax = (r: PeriodResult) => r.pnl.taxPaise;
  const profitForPeriod = (r: PeriodResult) => r.pnl.netProfitPaise;
  const nil = { curPaise: null as number | null, priorPaise: prior ? (null as number | null) : null };

  return [
    { label: 'Revenue from operations', no: 'I', kind: 'line', codes: ['operating_revenue'], ...pair(cur, prior, revenueOps) },
    { label: 'Other income', no: 'II', kind: 'line', codes: ['other_income'], ...pair(cur, prior, otherIncome) },
    { label: 'Total revenue', no: 'III', kind: 'subtotal', ...pair(cur, prior, totalRevenue) },

    { label: 'Expenses', no: 'IV', kind: 'header', curPaise: null, priorPaise: null },
    { label: 'Cost of materials consumed', indent: 1, kind: 'line', codes: ['cogs'], note: 'purchases − change in inventories (closing-stock credit applied)', ...pair(cur, prior, materials) },
    { label: 'Purchases of stock-in-trade', indent: 1, kind: 'line', note: 'folded into cost of materials consumed — split needs inventory data (logged)', ...nil },
    { label: 'Changes in inventories of finished goods, WIP and stock-in-trade', indent: 1, kind: 'line', note: 'folded into cost of materials consumed — split needs inventory data (logged)', ...nil },
    { label: 'Employee benefits expense', indent: 1, kind: 'line', codes: ['employee_benefits'], ...pair(cur, prior, employee) },
    { label: 'Finance costs', indent: 1, kind: 'line', codes: ['finance_costs'], ...pair(cur, prior, finance) },
    { label: 'Depreciation and amortisation expense', indent: 1, kind: 'line', codes: ['depreciation_amortisation'], ...pair(cur, prior, depreciation) },
    { label: 'Other expenses', indent: 1, kind: 'line', codes: OTHER_EXPENSES, ...pair(cur, prior, otherExpenses) },
    { label: 'Total expenses', kind: 'subtotal', ...pair(cur, prior, totalExpenses) },

    { label: 'Profit before exceptional and extraordinary items and tax', no: 'V', kind: 'subtotal', ...pair(cur, prior, profitBeforeTax) },
    { label: 'Exceptional items', no: 'VI', kind: 'line', note: 'none recognised', ...nil },
    { label: 'Profit before extraordinary items and tax', no: 'VII', kind: 'subtotal', ...pair(cur, prior, profitBeforeTax) },
    { label: 'Extraordinary items', no: 'VIII', kind: 'line', note: 'none recognised', ...nil },
    { label: 'Profit before tax', no: 'IX', kind: 'subtotal', ...pair(cur, prior, profitBeforeTax) },

    { label: 'Tax expense', no: 'X', kind: 'line', codes: ['tax_expense'], note: 'combined, as per books — current/deferred split needs separate ledgers (logged). ' + TAX_SOURCE_NOTE, ...pair(cur, prior, tax) },

    { label: 'Profit (loss) for the period', no: 'XI', kind: 'total', ...pair(cur, prior, profitForPeriod) },
    { label: 'Earnings per equity share (basic and diluted)', no: 'XII', kind: 'line', note: 'n/a — needs the number of equity shares (not in the TB); logged', curPaise: null, priorPaise: null },
  ];
}

// --- Balance Sheet (Schedule III, Part I) — Equity & Liabilities, then Assets ----------------------
export function bsScheduleIII(cur: PeriodResult, prior?: PeriodResult | null): Sch3Row[] {
  const n = (code: string) => (r: PeriodResult) => r.naturalsPaise[code] ?? 0;
  const reservesSurplus = (r: PeriodResult) => r.balanceSheet.closingRetainedEarningsPaise + r.balanceSheet.otherEquityPaise;
  const shareholdersFunds = (r: PeriodResult) => r.balanceSheet.totalEquityPaise;
  const otherCurrentLiab = (r: PeriodResult) => natSum(r, ['statutory_dues', 'accrued_other_current_liabilities']);
  const otherCurrentAssets = (r: PeriodResult) => natSum(r, ['prepaid_advances', 'other_current_assets']);
  const nonCurrentLiab = (r: PeriodResult) => r.balanceSheet.nonCurrentLiabilitiesPaise;
  const currentLiab = (r: PeriodResult) => r.balanceSheet.currentLiabilitiesPaise;
  const nonCurrentAssets = (r: PeriodResult) => r.balanceSheet.nonCurrentAssetsPaise;
  const currentAssets = (r: PeriodResult) => r.balanceSheet.currentAssetsPaise;
  const totalEL = (r: PeriodResult) => r.balanceSheet.totalEquityPaise + r.balanceSheet.totalLiabilitiesPaise;
  const totalAssets = (r: PeriodResult) => r.balanceSheet.totalAssetsPaise;

  return [
    { label: 'EQUITY AND LIABILITIES', kind: 'header', curPaise: null, priorPaise: null },
    { label: 'Shareholders’ funds', kind: 'header', indent: 1, curPaise: null, priorPaise: null },
    { label: 'Share capital', indent: 1, kind: 'line', codes: ['share_capital'], ...pair(cur, prior, n('share_capital')) },
    { label: 'Reserves and surplus', indent: 1, kind: 'line', codes: ['reserves_surplus', 'other_equity'], note: 'opening retained earnings + period profit (+ other equity)', ...pair(cur, prior, reservesSurplus) },
    { label: 'Total shareholders’ funds', kind: 'subtotal', ...pair(cur, prior, shareholdersFunds) },

    { label: 'Non-current liabilities', kind: 'header', indent: 1, curPaise: null, priorPaise: null },
    { label: 'Long-term borrowings', indent: 1, kind: 'line', codes: ['long_term_borrowings'], ...pair(cur, prior, n('long_term_borrowings')) },
    { label: 'Long-term provisions', indent: 1, kind: 'line', codes: ['provisions'], ...pair(cur, prior, n('provisions')) },
    { label: 'Other non-current liabilities', indent: 1, kind: 'line', codes: ['other_non_current_liabilities'], ...pair(cur, prior, n('other_non_current_liabilities')) },
    { label: 'Total non-current liabilities', kind: 'subtotal', ...pair(cur, prior, nonCurrentLiab) },

    { label: 'Current liabilities', kind: 'header', indent: 1, curPaise: null, priorPaise: null },
    { label: 'Short-term borrowings', indent: 1, kind: 'line', codes: ['short_term_borrowings'], ...pair(cur, prior, n('short_term_borrowings')) },
    { label: 'Trade payables', indent: 1, kind: 'line', codes: ['trade_payables'], ...pair(cur, prior, n('trade_payables')) },
    { label: 'Other current liabilities', indent: 1, kind: 'line', codes: ['statutory_dues', 'accrued_other_current_liabilities'], note: 'incl. statutory dues', ...pair(cur, prior, otherCurrentLiab) },
    { label: 'Total current liabilities', kind: 'subtotal', ...pair(cur, prior, currentLiab) },

    { label: 'TOTAL EQUITY AND LIABILITIES', kind: 'total', ...pair(cur, prior, totalEL) },

    { label: 'ASSETS', kind: 'header', curPaise: null, priorPaise: null },
    { label: 'Non-current assets', kind: 'header', indent: 1, curPaise: null, priorPaise: null },
    { label: 'Property, plant and equipment', indent: 1, kind: 'line', codes: ['ppe'], ...pair(cur, prior, n('ppe')) },
    { label: 'Intangible assets', indent: 1, kind: 'line', codes: ['intangibles'], ...pair(cur, prior, n('intangibles')) },
    { label: 'Non-current investments', indent: 1, kind: 'line', codes: ['investments'], ...pair(cur, prior, n('investments')) },
    { label: 'Other non-current assets', indent: 1, kind: 'line', codes: ['other_non_current_assets'], ...pair(cur, prior, n('other_non_current_assets')) },
    { label: 'Total non-current assets', kind: 'subtotal', ...pair(cur, prior, nonCurrentAssets) },

    { label: 'Current assets', kind: 'header', indent: 1, curPaise: null, priorPaise: null },
    { label: 'Inventories', indent: 1, kind: 'line', codes: ['inventory'], ...pair(cur, prior, n('inventory')) },
    { label: 'Trade receivables', indent: 1, kind: 'line', codes: ['trade_receivables'], ...pair(cur, prior, n('trade_receivables')) },
    { label: 'Cash and cash equivalents', indent: 1, kind: 'line', codes: ['cash_bank'], ...pair(cur, prior, n('cash_bank')) },
    { label: 'Short-term loans, advances and other current assets', indent: 1, kind: 'line', codes: ['prepaid_advances', 'other_current_assets'], ...pair(cur, prior, otherCurrentAssets) },
    { label: 'Total current assets', kind: 'subtotal', ...pair(cur, prior, currentAssets) },

    { label: 'TOTAL ASSETS', kind: 'total', ...pair(cur, prior, totalAssets) },
  ];
}
