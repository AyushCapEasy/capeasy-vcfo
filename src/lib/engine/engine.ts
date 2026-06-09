// src/lib/engine/engine.ts — the PURE computation engine (Bible §4). One module, views only render
// ("engine once, views many", §8.1). Every output traces to category natural amounts (paise) of the
// period and its prior; deltas require ≥2 periods, never a fabricated prior (§3.5/§8.5).
// NOTHING here is "correct" until CA sign-off (§10.6) — callers must mark output UNVERIFIED.
import type {
  PeriodEngineInput, Pnl, BalanceSheet, CashFlow, CashFlowNA, Ratios, WorkingCapital, StartupMetrics, PeriodResult,
} from './types';

// --- Canonical category groupings (mirror migration 0003; the taxonomy is fixed) ---------
const OPEX = ['employee_benefits', 'rent_utilities', 'sales_marketing', 'technology_software', 'professional_fees', 'admin_other_opex'];
const CURRENT_ASSETS = ['cash_bank', 'trade_receivables', 'inventory', 'prepaid_advances', 'other_current_assets'];
const NON_CURRENT_ASSETS = ['ppe', 'intangibles', 'investments', 'other_non_current_assets'];
const CURRENT_LIABILITIES = ['trade_payables', 'short_term_borrowings', 'statutory_dues', 'accrued_other_current_liabilities'];
const NON_CURRENT_LIABILITIES = ['long_term_borrowings', 'provisions', 'other_non_current_liabilities'];
// Cash-flow-specific partitions:
const WC_ASSETS = ['trade_receivables', 'inventory', 'prepaid_advances', 'other_current_assets']; // non-cash current assets
const OPERATING_LIABILITIES = ['trade_payables', 'statutory_dues', 'accrued_other_current_liabilities', 'provisions', 'other_non_current_liabilities'];
const DEPRECIABLE_ASSETS = ['ppe', 'intangibles'];
const OTHER_NON_CURRENT_ASSETS = ['investments', 'other_non_current_assets'];
const BORROWINGS = ['short_term_borrowings', 'long_term_borrowings'];
const EQUITY_EXCL_RE = ['share_capital', 'other_equity'];

const nat = (i: PeriodEngineInput, code: string) => i.naturals[code] ?? 0;
const sum = (i: PeriodEngineInput, codes: string[]) => codes.reduce((s, c) => s + nat(i, c), 0);
const div = (a: number, b: number): number | null => (b === 0 ? null : a / b);
const pct = (a: number, b: number): number | null => (b === 0 ? null : (a / b) * 100);

function daysInMonth(periodMonth: string): number {
  const [y, m] = periodMonth.split('-').map(Number);
  if (m === 2) return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 29 : 28;
  return [4, 6, 9, 11].includes(m) ? 30 : 31;
}

// --- P&L (Bible §4.1) -----------------------------------------------------
export function computePnl(i: PeriodEngineInput): Pnl {
  const operatingRevenuePaise = nat(i, 'operating_revenue');
  const otherIncomePaise = nat(i, 'other_income');
  const cogsPaise = nat(i, 'cogs');
  const grossProfitPaise = operatingRevenuePaise - cogsPaise;
  const operatingExpensesPaise = sum(i, OPEX);
  const ebitdaPaise = grossProfitPaise - operatingExpensesPaise;
  const depreciationAmortisationPaise = nat(i, 'depreciation_amortisation');
  const ebitPaise = ebitdaPaise - depreciationAmortisationPaise;
  const financeCostsPaise = nat(i, 'finance_costs');
  // CA-VALIDATE: other income placed below EBIT (non-operating), before tax. Seed has 0 → no effect.
  const ebtPaise = ebitPaise + otherIncomePaise - financeCostsPaise;
  const taxPaise = nat(i, 'tax_expense');
  const netProfitPaise = ebtPaise - taxPaise;
  return {
    operatingRevenuePaise, otherIncomePaise, cogsPaise, grossProfitPaise, operatingExpensesPaise,
    ebitdaPaise, depreciationAmortisationPaise, ebitPaise, financeCostsPaise, ebtPaise, taxPaise, netProfitPaise,
  };
}

// --- Balance Sheet (Bible §4.1) — Equity carries closing RE = opening RE + NP --------------
export function computeBalanceSheet(i: PeriodEngineInput, pnl: Pnl): BalanceSheet {
  const currentAssetsPaise = sum(i, CURRENT_ASSETS);
  const nonCurrentAssetsPaise = sum(i, NON_CURRENT_ASSETS);
  const totalAssetsPaise = currentAssetsPaise + nonCurrentAssetsPaise;
  const currentLiabilitiesPaise = sum(i, CURRENT_LIABILITIES);
  const nonCurrentLiabilitiesPaise = sum(i, NON_CURRENT_LIABILITIES);
  const totalLiabilitiesPaise = currentLiabilitiesPaise + nonCurrentLiabilitiesPaise;
  const shareCapitalPaise = nat(i, 'share_capital');
  const otherEquityPaise = nat(i, 'other_equity');
  const openingRetainedEarningsPaise = nat(i, 'reserves_surplus'); // TB carries OPENING RE
  const closingRetainedEarningsPaise = openingRetainedEarningsPaise + pnl.netProfitPaise; // P&L → equity
  const totalEquityPaise = shareCapitalPaise + otherEquityPaise + closingRetainedEarningsPaise;
  return {
    currentAssetsPaise, nonCurrentAssetsPaise, totalAssetsPaise,
    currentLiabilitiesPaise, nonCurrentLiabilitiesPaise, totalLiabilitiesPaise,
    shareCapitalPaise, openingRetainedEarningsPaise, netProfitPaise: pnl.netProfitPaise,
    closingRetainedEarningsPaise, otherEquityPaise, totalEquityPaise,
    cashPaise: nat(i, 'cash_bank'),
  };
}

// --- Cash Flow (indirect, Bible §4.1) — REQUIRES the prior period. The closing cash is built from
//     opening cash + NP + Δ(non-cash accounts) and NEVER reads period-t cash_bank, so the §4.5 tie-out
//     compares two independently-sourced numbers (independence guard locked at M1). ----------------
export function computeCashFlow(i: PeriodEngineInput, prior: PeriodEngineInput | null, pnl: Pnl): CashFlow | CashFlowNA {
  if (!prior) return { available: false, reason: 'n/a — needs prior period' };

  const openingCashPaise = nat(prior, 'cash_bank');
  const da = pnl.depreciationAmortisationPaise;

  const dWcAssets = sum(i, WC_ASSETS) - sum(prior, WC_ASSETS); // ↑ asset = cash used
  const dOpLiab = sum(i, OPERATING_LIABILITIES) - sum(prior, OPERATING_LIABILITIES); // ↑ liab = cash source
  const workingCapitalChangePaise = -dWcAssets + dOpLiab;
  const cfoPaise = pnl.netProfitPaise + da + workingCapitalChangePaise;

  // Reconstruct gross capex from the change in NET depreciable assets + this period's D&A.
  // CA-VALIDATE: assumes no disposals (capex = Δ net book value + depreciation).
  const capexPaise = sum(i, DEPRECIABLE_ASSETS) - sum(prior, DEPRECIABLE_ASSETS) + da;
  const otherInvestingPaise = sum(i, OTHER_NON_CURRENT_ASSETS) - sum(prior, OTHER_NON_CURRENT_ASSETS);
  const cfiPaise = -capexPaise - otherInvestingPaise;

  const borrowingsChangePaise = sum(i, BORROWINGS) - sum(prior, BORROWINGS);
  const equityChangePaise = sum(i, EQUITY_EXCL_RE) - sum(prior, EQUITY_EXCL_RE);
  const dividendsPaise = 0; // CA-VALIDATE: no distribution data in v1 → assumed 0
  const cffPaise = borrowingsChangePaise + equityChangePaise - dividendsPaise;

  const netChangePaise = cfoPaise + cfiPaise + cffPaise;
  const closingCashPaise = openingCashPaise + netChangePaise;
  return {
    available: true, openingCashPaise, cfoPaise, cfiPaise, cffPaise, netChangePaise, closingCashPaise,
    components: {
      netProfitPaise: pnl.netProfitPaise, depreciationAddbackPaise: da, workingCapitalChangePaise,
      capexPaise, otherInvestingPaise, borrowingsChangePaise, equityChangePaise, dividendsPaise,
    },
  };
}

// --- Ratios (§4.2) --------------------------------------------------------
export function computeRatios(i: PeriodEngineInput, pnl: Pnl, bs: BalanceSheet): Ratios {
  const inventory = nat(i, 'inventory');
  const totalDebt = sum(i, BORROWINGS);
  return {
    currentRatio: div(bs.currentAssetsPaise, bs.currentLiabilitiesPaise),
    quickRatio: div(bs.currentAssetsPaise - inventory, bs.currentLiabilitiesPaise),
    grossMarginPct: pct(pnl.grossProfitPaise, pnl.operatingRevenuePaise),
    ebitdaMarginPct: pct(pnl.ebitdaPaise, pnl.operatingRevenuePaise),
    netMarginPct: pct(pnl.netProfitPaise, pnl.operatingRevenuePaise),
    roePct: pct(pnl.netProfitPaise, bs.totalEquityPaise),
    rocePct: pct(pnl.ebitPaise, bs.totalAssetsPaise - bs.currentLiabilitiesPaise),
    debtToEquity: div(totalDebt, bs.totalEquityPaise),
    interestCoverage: div(pnl.ebitPaise, pnl.financeCostsPaise),
  };
}

// --- Working capital (§4.3) ----------------------------------------------
export function computeWorkingCapital(i: PeriodEngineInput, pnl: Pnl): WorkingCapital {
  const days = daysInMonth(i.periodMonth);
  const ar = nat(i, 'trade_receivables');
  const ap = nat(i, 'trade_payables');
  const inventory = nat(i, 'inventory');
  const dso = pnl.operatingRevenuePaise ? (ar / pnl.operatingRevenuePaise) * days : null;
  const dpo = pnl.cogsPaise ? (ap / pnl.cogsPaise) * days : null;
  const dio = pnl.cogsPaise ? (inventory / pnl.cogsPaise) * days : null;
  const cashConversionCycle = dso !== null && dpo !== null && dio !== null ? dso + dio - dpo : null;
  return { daysInMonth: days, dso, dpo, dio, cashConversionCycle };
}

// --- Startup / SaaS metrics (§4.4) — only the derivable ones; the rest are honest n/a ----
export function computeStartupMetrics(i: PeriodEngineInput, prior: PeriodEngineInput | null, pnl: Pnl, cf: CashFlow | CashFlowNA): StartupMetrics {
  const mrrPaise = i.recurringRevenuePaise ?? null;
  const arrPaise = mrrPaise === null ? null : mrrPaise * 12;
  const priorRev = prior ? nat(prior, 'operating_revenue') : 0;
  const revenueGrowthPct = prior ? pct(pnl.operatingRevenuePaise - priorRev, priorRev) : null;
  // CA-VALIDATE: burn definitions vary. Gross burn ≈ cash operating outflow (excludes non-cash D&A).
  const grossBurnPaise = pnl.cogsPaise + pnl.operatingExpensesPaise + pnl.financeCostsPaise + pnl.taxPaise;
  // Net burn = -(CFO + CFI) = opening cash - closing cash ex-financing (needs 2 periods).
  const netBurnPaise = cf.available ? -(cf.cfoPaise + cf.cfiPaise) : null;
  const currentCash = nat(i, 'cash_bank');
  const runwayMonths = netBurnPaise !== null && netBurnPaise > 0 ? currentCash / netBurnPaise : null;
  const ruleOf40 = revenueGrowthPct !== null ? revenueGrowthPct + (pct(pnl.ebitdaPaise, pnl.operatingRevenuePaise) ?? 0) : null;
  return {
    mrrPaise, arrPaise, revenueGrowthPct, grossBurnPaise, netBurnPaise, runwayMonths, ruleOf40,
    notDerivable: ['CAC', 'ARPA', 'LTV', 'LTV:CAC', 'CAC payback', 'logo churn %', 'NRR %'], // need customer/churn data
  };
}

// --- Orchestration --------------------------------------------------------
export function computePeriod(i: PeriodEngineInput, prior: PeriodEngineInput | null): PeriodResult {
  const pnl = computePnl(i);
  const balanceSheet = computeBalanceSheet(i, pnl);
  const cashFlow = computeCashFlow(i, prior, pnl);
  const ratios = computeRatios(i, pnl, balanceSheet);
  const workingCapital = computeWorkingCapital(i, pnl);
  const startupMetrics = computeStartupMetrics(i, prior, pnl, cashFlow);
  return { periodId: i.periodId, label: i.label, periodMonth: i.periodMonth, pnl, balanceSheet, cashFlow, ratios, workingCapital, startupMetrics };
}

/** Compute a chain of consecutive periods (each linked to its predecessor). */
export function computeChain(inputs: PeriodEngineInput[]): PeriodResult[] {
  return inputs.map((input, idx) => computePeriod(input, idx > 0 ? inputs[idx - 1] : null));
}
