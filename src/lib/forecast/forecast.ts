// src/lib/forecast/forecast.ts — forward projections built on the REAL historical results the engine
// already produces (operating revenue, costs, cash). PURE module. Methods are deliberately simple and
// transparent — trailing average month-over-month growth, compounded — NOT a black box. Every output
// carries its ASSUMPTION and is a FORECAST/ESTIMATE, never an actual. Honest degradation: with <2
// periods we say "insufficient history" and project NOTHING (never a trend from one point). Values are
// rounded to 3 significant figures (no false precision). NOTHING here is verified — forecasts are
// inherently uncertain and must not look authoritative (the watermark/unverified status stays).
import type { PeriodResult } from '@/lib/engine/types';

export type ScenarioKey = 'pessimistic' | 'base' | 'optimistic';
export type Horizon = 3 | 6 | 12;
export const HORIZONS: Horizon[] = [3, 6, 12];
export const SCENARIOS: ScenarioKey[] = ['pessimistic', 'base', 'optimistic'];

export type SeriesPoint = { label: string; periodMonth: string; paise: number; actual: boolean };

export type MetricForecast = {
  metric: string;
  monthlyGrowthRate: number | null; // decimal (0.05 = 5%/mo); null = can't derive → no projection
  basis: string; // human-readable assumption
  history: SeriesPoint[]; // the real actuals
  projection: SeriesPoint[]; // the forecast (empty when insufficient)
  lastActualPaise: number;
};

export type RunwayForecast = {
  currentCashPaise: number;
  monthlyBurnPaise: number | null; // observed avg monthly cash outflow; >0 = burning; null = insufficient
  burning: boolean;
  runwayMonths: number | null; // at the CURRENT (flat) burn; null = n/a (not burning / insufficient)
  zeroMonthLabel: string | null; // projected month cash would reach zero at flat burn
  basis: string;
  trajectory: SeriesPoint[]; // cash projected forward under the scenario's net cash flow
  reachesProfitability: boolean; // scenario turns cash-flow positive before running out
};

export type ForecastQuality = {
  periods: number;
  sufficient: boolean; // ≥2 periods → a trend exists
  scenarioSpread: boolean; // ≥3 periods → volatility (σ) is computable for optimistic/pessimistic
  confidence: 'none' | 'low' | 'moderate' | 'good';
  note: string;
};

export type ForecastResult = {
  quality: ForecastQuality;
  scenario: ScenarioKey;
  horizonMonths: Horizon;
  baseGrowthRate: number | null; // revenue trailing avg MoM growth
  growthSpread: number | null; // σ of revenue MoM growth (the ± applied for scenarios)
  scenarioGrowthRate: number | null; // revenue growth actually used under the chosen scenario
  revenue: MetricForecast | null;
  costs: MetricForecast[]; // COGS, Operating expenses, Total costs
  netProfit: MetricForecast | null; // projected = projected revenue − projected total costs
  runway: RunwayForecast | null;
  assumptions: string[]; // every surfaced assumption, collected for the screen
};

// --- small, transparent helpers -------------------------------------------------------------------
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function monthLabel(periodMonth: string): string {
  const [y, m] = periodMonth.split('-').map(Number);
  return `${MONTHS[(m - 1) % 12]} ${y}`;
}
function addMonths(periodMonth: string, k: number): string {
  const [y, m] = periodMonth.split('-').map(Number);
  const total = y * 12 + (m - 1) + k;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}-01`;
}
const pct = (r: number) => `${(r * 100).toFixed(1)}%`;

/** Month-over-month growth rates across a series (skips steps where the base is 0 — undefined growth). */
function momGrowths(values: number[]): number[] {
  const g: number[] = [];
  for (let i = 1; i < values.length; i++) {
    if (values[i - 1] !== 0) g.push((values[i] - values[i - 1]) / values[i - 1]);
  }
  return g;
}
const mean = (a: number[]): number | null => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
function sampleStdDev(a: number[]): number | null {
  if (a.length < 2) return null; // a spread needs ≥2 observations (≥3 periods)
  const m = mean(a)!;
  return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1));
}

/** Round a paise amount to `sig` significant figures of its rupee value — no false precision. */
export function roundSigPaise(paise: number, sig = 3): number {
  if (paise === 0) return 0;
  const rupees = paise / 100;
  const digits = Math.ceil(Math.log10(Math.abs(rupees)));
  const factor = Math.pow(10, sig - digits);
  return Math.round((Math.round(rupees * factor) / factor) * 100);
}

/** Project a single metric forward by compounding a constant monthly growth rate. */
function projectMetric(
  results: PeriodResult[],
  metric: string,
  pick: (r: PeriodResult) => number,
  growthRate: number | null,
  horizon: Horizon,
  basis: string,
): MetricForecast {
  const history: SeriesPoint[] = results.map((r) => ({ label: r.label, periodMonth: r.periodMonth, paise: pick(r), actual: true }));
  const last = history[history.length - 1];
  const projection: SeriesPoint[] = [];
  if (growthRate !== null) {
    let v = last.paise;
    for (let k = 1; k <= horizon; k++) {
      v = v * (1 + growthRate);
      const month = addMonths(last.periodMonth, k);
      projection.push({ label: monthLabel(month), periodMonth: month, paise: roundSigPaise(v), actual: false });
    }
  }
  return { metric, monthlyGrowthRate: growthRate, basis, history, projection, lastActualPaise: last.paise };
}

// --- the forecast -------------------------------------------------------------------------------
const SCENARIO_LABEL: Record<ScenarioKey, string> = { pessimistic: 'Pessimistic', base: 'Base', optimistic: 'Optimistic' };

const totalCostsOf = (r: PeriodResult) => r.pnl.operatingRevenuePaise - r.pnl.netProfitPaise; // everything between revenue and net profit

export function buildForecast(results: PeriodResult[], opts: { horizon?: Horizon; scenario?: ScenarioKey } = {}): ForecastResult {
  const horizon = opts.horizon ?? 6;
  const scenario = opts.scenario ?? 'base';
  const periods = results.length;
  const assumptions: string[] = [];

  // ---- quality / honest degradation ----
  const sufficient = periods >= 2;
  const scenarioSpread = periods >= 3;
  const confidence: ForecastQuality['confidence'] = periods < 2 ? 'none' : periods === 2 ? 'low' : periods <= 4 ? 'moderate' : 'good';
  const note =
    periods < 2
      ? `Insufficient history for a reliable forecast — only ${periods} period${periods === 1 ? '' : 's'}. A forecast needs at least 2 periods of history; load a second period to project. Showing actuals only — no trend is invented from a single point.`
      : periods === 2
        ? 'Limited history (2 periods) — a single growth observation. Treat the projection as directional only; optimistic / pessimistic scenarios need ≥3 periods.'
        : periods <= 4
          ? `Moderate history (${periods} periods) — a usable trend, but still an estimate; the further out, the less reliable.`
          : `${periods} periods of history — a fuller trend, yet still a forecast: real results will differ.`;
  const quality: ForecastQuality = { periods, sufficient, scenarioSpread, confidence, note };

  if (periods === 0) {
    return { quality, scenario, horizonMonths: horizon, baseGrowthRate: null, growthSpread: null, scenarioGrowthRate: null, revenue: null, costs: [], netProfit: null, runway: null, assumptions };
  }

  // ---- revenue growth + scenario ----
  const revValues = results.map((r) => r.pnl.operatingRevenuePaise);
  const revGrowths = momGrowths(revValues);
  const baseGrowthRate = sufficient ? mean(revGrowths) : null;
  const growthSpread = scenarioSpread ? sampleStdDev(revGrowths) : null;
  const spread = growthSpread ?? 0;
  const scenarioGrowthRate =
    baseGrowthRate === null ? null : scenario === 'optimistic' ? baseGrowthRate + spread : scenario === 'pessimistic' ? baseGrowthRate - spread : baseGrowthRate;

  const n = periods;
  if (baseGrowthRate !== null) {
    assumptions.push(`Revenue: based on ${pct(baseGrowthRate)} average month-over-month growth over the last ${n} periods, compounded forward.`);
    if (scenarioSpread && scenario !== 'base') {
      assumptions.push(`${SCENARIO_LABEL[scenario]} scenario: revenue growth shifted by ${scenario === 'optimistic' ? '+' : '−'}${pct(spread)} (1 s.d. of your historical month-over-month volatility) → ${pct(scenarioGrowthRate!)}/mo.`);
    } else if (scenario !== 'base') {
      assumptions.push(`${SCENARIO_LABEL[scenario]} scenario unavailable with ${n} periods (a spread needs ≥3) — showing the base case.`);
    }
  }

  // ---- revenue + cost + net-profit forecasts ----
  const revBasis = baseGrowthRate === null ? 'Insufficient history to project revenue.' : `${pct(scenarioGrowthRate!)}/mo (${SCENARIO_LABEL[scenario].toLowerCase()}), from ${pct(baseGrowthRate)} trailing average over ${n} periods.`;
  const revenue = projectMetric(results, 'Operating revenue', (r) => r.pnl.operatingRevenuePaise, scenarioGrowthRate, horizon, revBasis);

  const costSpec: { metric: string; pick: (r: PeriodResult) => number }[] = [
    { metric: 'Cost of goods sold', pick: (r) => r.pnl.cogsPaise },
    { metric: 'Operating expenses', pick: (r) => r.pnl.operatingExpensesPaise },
    { metric: 'Total costs', pick: totalCostsOf },
  ];
  const costs = costSpec.map(({ metric, pick }) => {
    const g = sufficient ? mean(momGrowths(results.map(pick))) : null;
    const basis = g === null ? 'Insufficient history to project.' : `${pct(g)}/mo — this line's own trailing average over ${n} periods (independent of the revenue scenario).`;
    return projectMetric(results, metric, pick, g, horizon, basis);
  });
  if (sufficient) assumptions.push('Cost lines are each projected on their own historical growth — they do not auto-scale with the revenue scenario.');

  // Net profit / burn = projected revenue − projected total costs, month by month (consistent at the anchor).
  const totalCostsFc = costs[2];
  let netProfit: MetricForecast | null = null;
  if (sufficient && scenarioGrowthRate !== null) {
    const lastRev = revenue.lastActualPaise;
    const lastTC = totalCostsFc.lastActualPaise;
    const tcGrowth = totalCostsFc.monthlyGrowthRate ?? 0;
    const projection: SeriesPoint[] = [];
    for (let k = 1; k <= horizon; k++) {
      const rev = lastRev * (1 + scenarioGrowthRate) ** k;
      const tc = lastTC * (1 + tcGrowth) ** k;
      const month = addMonths(results[results.length - 1].periodMonth, k);
      projection.push({ label: monthLabel(month), periodMonth: month, paise: roundSigPaise(rev - tc), actual: false });
    }
    netProfit = {
      metric: 'Net profit / (burn)',
      monthlyGrowthRate: null,
      basis: 'Projected revenue − projected total costs each month.',
      history: results.map((r) => ({ label: r.label, periodMonth: r.periodMonth, paise: r.pnl.netProfitPaise, actual: true })),
      projection,
      lastActualPaise: results[results.length - 1].pnl.netProfitPaise,
    };
  }

  // ---- runway / burn (cash) ----
  const cashValues = results.map((r) => r.balanceSheet.cashPaise);
  const currentCashPaise = cashValues[cashValues.length - 1];
  let runway: RunwayForecast | null = null;
  if (sufficient) {
    // observed monthly burn = average month-over-month DECREASE in cash (positive = burning)
    const deltas: number[] = [];
    for (let i = 1; i < cashValues.length; i++) deltas.push(cashValues[i - 1] - cashValues[i]);
    const monthlyBurnPaise = mean(deltas);
    const burning = monthlyBurnPaise !== null && monthlyBurnPaise > 0;
    const runwayMonths = burning ? currentCashPaise / monthlyBurnPaise! : null;
    const zeroMonthLabel = runwayMonths !== null ? monthLabel(addMonths(results[results.length - 1].periodMonth, Math.max(0, Math.ceil(runwayMonths)))) : null;

    // scenario trajectory: walk cash forward using projected monthly net cash flow (net profit as proxy)
    const trajectory: SeriesPoint[] = [];
    let cash = currentCashPaise;
    let reachesProfitability = false;
    const npProj = netProfit?.projection ?? [];
    const last = results[results.length - 1];
    for (let k = 1; k <= horizon; k++) {
      const flow = npProj[k - 1]?.paise ?? -(monthlyBurnPaise ?? 0); // fall back to flat burn
      if (flow >= 0) reachesProfitability = true;
      cash = cash + flow;
      const month = addMonths(last.periodMonth, k);
      trajectory.push({ label: monthLabel(month), periodMonth: month, paise: roundSigPaise(cash), actual: false });
    }
    const burnPerMo = monthlyBurnPaise !== null ? `₹${Math.round(monthlyBurnPaise / 100).toLocaleString('en-IN')}/mo` : '—';
    const basis = burning
      ? `At the current burn — the observed average of ${burnPerMo} over ${cashValues.length} periods; assumes burn stays flat (does not assume revenue growth).`
      : `Cash is not declining over the last ${cashValues.length} periods — no runway limit at the current trend (not a guarantee of future cash flow).`;
    runway = { currentCashPaise, monthlyBurnPaise, burning, runwayMonths, zeroMonthLabel, basis, trajectory, reachesProfitability };
    if (burning) assumptions.push(`Runway: cash ₹${Math.round(currentCashPaise / 100).toLocaleString('en-IN')} ÷ current burn ₹${Math.round(monthlyBurnPaise! / 100).toLocaleString('en-IN')}/mo (flat) — the conservative "months to zero". The trajectory below also shows the scenario's growth-adjusted path.`);
  }

  return { quality, scenario, horizonMonths: horizon, baseGrowthRate, growthSpread, scenarioGrowthRate, revenue, costs, netProfit, runway, assumptions };
}
