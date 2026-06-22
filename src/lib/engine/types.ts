// src/lib/engine/types.ts — typed results of the pure computation engine (Bible §4).
// Money is ALWAYS integer paise. Ratios/metrics are plain numbers; null = "n/a — needs <input>"
// (never a fabricated value, Bible §8.5/§10). NO value here is "correct" until CA sign-off (§10.6).

/** A period's category natural amounts (paise, positive = normal balance) — the engine's only input. */
export type CategoryNaturals = Record<string, number>;

export type PeriodEngineInput = {
  periodId: string;
  label: string;
  periodMonth: string; // 'YYYY-MM-01'
  naturals: CategoryNaturals; // every canonical category's natural amount (missing → 0)
  tb: { debitPaise: number; creditPaise: number }; // raw TB totals, for the integrity invariant
  recurringRevenuePaise?: number | null; // from schedule_revenue_detail (optional → MRR n/a)
};

export type Pnl = {
  operatingRevenuePaise: number;
  otherIncomePaise: number;
  cogsPaise: number;
  grossProfitPaise: number;
  operatingExpensesPaise: number;
  ebitdaPaise: number;
  depreciationAmortisationPaise: number;
  ebitPaise: number;
  financeCostsPaise: number;
  ebtPaise: number;
  taxPaise: number;
  netProfitPaise: number;
};

export type BalanceSheet = {
  currentAssetsPaise: number;
  nonCurrentAssetsPaise: number;
  totalAssetsPaise: number;
  currentLiabilitiesPaise: number;
  nonCurrentLiabilitiesPaise: number;
  totalLiabilitiesPaise: number;
  shareCapitalPaise: number;
  openingRetainedEarningsPaise: number;
  netProfitPaise: number;
  closingRetainedEarningsPaise: number;
  otherEquityPaise: number;
  totalEquityPaise: number;
  cashPaise: number; // BS closing cash = mapped cash_bank natural (the INDEPENDENT source)
};

export type CashFlow = {
  available: true;
  openingCashPaise: number;
  cfoPaise: number;
  cfiPaise: number;
  cffPaise: number;
  netChangePaise: number;
  closingCashPaise: number; // CF-derived — never reads period-t cash_bank (independence guard)
  components: {
    netProfitPaise: number;
    depreciationAddbackPaise: number;
    workingCapitalChangePaise: number; // Δ current non-cash assets / operating liabilities
    capexPaise: number; // reconstructed = Δ(net depreciable assets) + D&A  (CA-VALIDATE)
    otherInvestingPaise: number;
    borrowingsChangePaise: number;
    equityChangePaise: number;
    dividendsPaise: number;
  };
};
export type CashFlowNA = { available: false; reason: string };

export type Ratios = {
  currentRatio: number | null;
  quickRatio: number | null;
  grossMarginPct: number | null;
  ebitdaMarginPct: number | null;
  netMarginPct: number | null;
  roePct: number | null;
  rocePct: number | null;
  debtToEquity: number | null;
  interestCoverage: number | null;
};

export type WorkingCapital = {
  daysInMonth: number;
  dso: number | null;
  dpo: number | null;
  dio: number | null;
  cashConversionCycle: number | null;
};

export type StartupMetrics = {
  mrrPaise: number | null;
  arrPaise: number | null;
  revenueGrowthPct: number | null;
  grossBurnPaise: number | null;
  netBurnPaise: number | null;
  runwayMonths: number | null;
  ruleOf40: number | null;
  notDerivable: string[]; // metrics that need data we don't have (CAC, LTV, churn, NRR, …)
};

export type PeriodResult = {
  periodId: string;
  label: string;
  periodMonth: string;
  pnl: Pnl;
  balanceSheet: BalanceSheet;
  cashFlow: CashFlow | CashFlowNA;
  ratios: Ratios;
  workingCapital: WorkingCapital;
  startupMetrics: StartupMetrics;
  // The engine's own per-category input naturals (paise), surfaced VERBATIM (no recomputation) so the
  // statutory Schedule III view can build prescribed line items the lumped pnl/bs fields don't carry
  // (e.g. employee benefits as its own expense line, named BS sub-lines). Same values, finer labels.
  naturalsPaise: CategoryNaturals;
};

export type InvariantStatus = 'pass' | 'fail' | 'na';
export type InvariantResult = {
  id: 'tb_integrity' | 'bs_identity' | 'cash_tie_out' | 'pl_to_equity';
  label: string;
  status: InvariantStatus;
  detail: string;
  deltaPaise?: number; // signed mismatch where applicable (0 on pass)
};
