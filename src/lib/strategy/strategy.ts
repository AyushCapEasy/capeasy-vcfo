// src/lib/strategy/strategy.ts — the strategic decision layer (PURE). Extends the backward-looking
// insight tiers (observations/diagnoses/recommendations) FORWARD: it reads the forecast engine's real
// projections + the latest actuals and synthesises "where is this heading, and what could the founder
// consider." It computes NO new financial figures — every statement traces to a forecast/runway/actual
// number. Framed as OPTIONS a vCFO would raise, never as advice or guarantees. Mechanically-correct-but-
// harmful moves (the classic "pay suppliers slower") are FLAGGED for discussion, never asserted. Honest
// degradation on thin data. Everything carries UNVERIFIED_ESTIMATE — it leans on uncertain forecasts.
import type { PeriodResult } from '@/lib/engine/types';
import { buildForecast, roundSigPaise, type ScenarioKey, type Horizon } from '@/lib/forecast/forecast';
import { inr } from '@/lib/mis/present';

export type Situation =
  | 'insufficient_data'
  | 'short_runway' // burning + runway < 6 months (cash is the binding constraint)
  | 'funded_burn' // burning but runway ≥ 6 (pre-profit; path-to-profit matters)
  | 'declining' // revenue shrinking and loss-making (stabilise first)
  | 'profitable_growing'
  | 'profitable_stable'
  | 'growing_unprofitable'; // loss-making but not cash-critical (unit economics)

export type TraceNum = { label: string; value: string }; // the real number behind a statement

export type TrajectoryRead = { headline: string; traces: TraceNum[] };

export type StrategicLever = {
  title: string; // the framed option
  rationale: string; // why — with the numbers
  traces: TraceNum[];
  flaggedForReview?: boolean; // mechanically-correct-but-harmful → discuss, do not assert
  reviewReason?: string;
};

export type Priority = { rank: number; focus: string; because: string };

export type StrategyResult = {
  situation: Situation;
  situationSummary: string;
  sufficient: boolean;
  confidence: 'none' | 'low' | 'moderate' | 'good';
  note: string;
  trajectory: TrajectoryRead[];
  levers: StrategicLever[];
  priorities: Priority[];
  reviewFlags: string[]; // collected for human review
  basis: string;
  status: 'UNVERIFIED_ESTIMATE';
};

const TARGET_RUNWAY = 12; // the runway most early startups steer toward
const fracPct = (frac: number) => `${Math.round(Math.abs(frac) * 100)}%`;
const ratePct = (r: number) => `${(r * 100).toFixed(1)}%`;

export function buildStrategy(results: PeriodResult[], opts: { horizon?: Horizon; scenario?: ScenarioKey } = {}): StrategyResult {
  const horizon = opts.horizon ?? 12;
  const scenario = opts.scenario ?? 'base';
  const f = buildForecast(results, { horizon, scenario });
  const basis = `Base-case forecast over ${horizon} months (${f.quality.periods} periods of history).`;

  // ---- honest degradation: too little history to read a trajectory ----
  if (!f.quality.sufficient || !f.runway || !f.revenue || !f.netProfit) {
    return {
      situation: 'insufficient_data',
      situationSummary: 'Not enough history to read a trajectory yet.',
      sufficient: false,
      confidence: f.quality.confidence,
      note: f.quality.note,
      trajectory: [],
      levers: [],
      priorities: [{ rank: 1, focus: 'Load a second period', because: 'Strategy reads a forward trend; with one period there is no trend to read — nothing is invented from a single point.' }],
      reviewFlags: [],
      basis,
      status: 'UNVERIFIED_ESTIMATE',
    };
  }

  const latest = results[results.length - 1];
  const revNow = f.revenue.lastActualPaise;
  const g = f.baseGrowthRate ?? 0;
  const np = latest.pnl.netProfitPaise;
  const profitable = np > 0;
  const runway = f.runway;
  const burning = runway.burning && runway.runwayMonths !== null;
  const R = runway.runwayMonths;
  const B = runway.monthlyBurnPaise ?? 0;
  const C = runway.currentCashPaise;
  const gm = latest.ratios.grossMarginPct; // %
  const reviewFlags: string[] = [];

  // ---- situation classification ----
  let situation: Situation;
  if (burning && R! < 6) situation = 'short_runway';
  else if (g < -0.02 && !profitable) situation = 'declining';
  else if (burning) situation = 'funded_burn';
  else if (profitable && g > 0.02) situation = 'profitable_growing';
  else if (profitable) situation = 'profitable_stable';
  else situation = 'growing_unprofitable';

  // ---- trajectory read (plain synthesis of the forecast) ----
  const trajectory: TrajectoryRead[] = [];
  const projEnd = f.revenue.projection[f.revenue.projection.length - 1];
  trajectory.push({
    headline: `At the current trend (${ratePct(g)}/mo), revenue moves from ${inr(revNow)} to ~${inr(projEnd.paise)} by ${projEnd.label} (${horizon} months out).`,
    traces: [{ label: 'Revenue now', value: inr(revNow) }, { label: 'Avg MoM growth', value: ratePct(g) }, { label: `Projected (${projEnd.label})`, value: `~${inr(projEnd.paise)}` }],
  });
  if (burning) {
    trajectory.push({
      headline: `At the current burn (${inr(B)}/mo), cash of ${inr(C)} is exhausted in ~${R!.toFixed(1)} months — around ${runway.zeroMonthLabel}.`,
      traces: [{ label: 'Cash on hand', value: inr(C) }, { label: 'Monthly burn', value: inr(B) }, { label: 'Runway', value: `${R!.toFixed(1)} mo` }],
    });
  } else {
    trajectory.push({ headline: 'Cash is not declining at the current trend — no runway limit from the recent trajectory (not a guarantee of future cash flow).', traces: [{ label: 'Cash on hand', value: inr(C) }] });
  }
  // profitability crossover from the net-profit forecast
  const cross = f.netProfit.projection.find((p) => p.paise >= 0);
  const projNpEnd = f.netProfit.projection[f.netProfit.projection.length - 1];
  if (profitable) {
    trajectory.push({ headline: `Already profitable (~${inr(np)}/mo); at the current trend monthly profit reaches ~${inr(projNpEnd.paise)} by ${projNpEnd.label}.`, traces: [{ label: 'Net profit now', value: inr(np) }, { label: `Projected (${projNpEnd.label})`, value: `~${inr(projNpEnd.paise)}` }] });
  } else if (cross) {
    trajectory.push({ headline: `At the current trend, monthly net turns positive around ${cross.label}.`, traces: [{ label: 'Net now', value: inr(np) }, { label: 'Crosses ₹0', value: cross.label }] });
  } else {
    trajectory.push({ headline: `At the current trend you do NOT reach monthly profit within ${horizon} months — the gap at ${projNpEnd.label} is ~${inr(projNpEnd.paise)}/mo. The levers below are about closing it.`, traces: [{ label: 'Net now', value: inr(np) }, { label: `Projected (${projNpEnd.label})`, value: inr(projNpEnd.paise) }] });
  }

  // ---- strategic levers (framed options, each number-traced) ----
  const levers: StrategicLever[] = [];

  if (burning) {
    // Extend runway to the 12-month target — three honest, number-traced options.
    const targetBurn = C / TARGET_RUNWAY;
    const cutFrac = 1 - targetBurn / B; // = 1 − R/T
    if (cutFrac > 0) {
      levers.push({
        title: `Cut burn ~${fracPct(cutFrac)} to reach a ${TARGET_RUNWAY}-month runway`,
        rationale: `Runway is ${R!.toFixed(1)} months. Holding cash flat, burn would need to fall from ${inr(B)} to ~${inr(roundSigPaise(targetBurn))}/mo (a ~${fracPct(cutFrac)} cut) to stretch to ${TARGET_RUNWAY} months.`,
        traces: [{ label: 'Burn now', value: inr(B) }, { label: 'Target burn', value: inr(roundSigPaise(targetBurn)) }, { label: 'Runway now', value: `${R!.toFixed(1)} mo` }],
      });
    }
    const raiseNeeded = B * TARGET_RUNWAY - C;
    if (raiseNeeded > 0) {
      levers.push({
        title: `Raise ~${inr(roundSigPaise(raiseNeeded))} to fund ${TARGET_RUNWAY} months at the current burn`,
        rationale: `${TARGET_RUNWAY} months × ${inr(B)} burn = ${inr(roundSigPaise(B * TARGET_RUNWAY))} needed; against ${inr(C)} on hand, the gap is ~${inr(roundSigPaise(raiseNeeded))}.`,
        traces: [{ label: 'Cash needed (12mo)', value: inr(roundSigPaise(B * TARGET_RUNWAY)) }, { label: 'Cash on hand', value: inr(C) }, { label: 'Gap', value: inr(roundSigPaise(raiseNeeded)) }],
      });
    }
    // Grow to breakeven — honest about gross margin (incremental revenue only contributes its margin).
    if (gm !== null && gm > 0) {
      const uplift = B / (gm / 100); // revenue uplift whose gross profit covers the burn
      levers.push({
        title: `Grow revenue ~${fracPct(uplift / revNow)} (${inr(roundSigPaise(uplift))}/mo) to reach cash-flow breakeven`,
        rationale: `At a ${gm.toFixed(0)}% gross margin, covering the ${inr(B)} burn needs ~${inr(roundSigPaise(uplift))} more monthly revenue (≈${fracPct(uplift / revNow)} on ${inr(revNow)}), assuming fixed costs hold.`,
        traces: [{ label: 'Burn to cover', value: inr(B) }, { label: 'Gross margin', value: `${gm.toFixed(0)}%` }, { label: 'Revenue uplift', value: inr(roundSigPaise(uplift)) }],
      });
    } else if (gm !== null && gm <= 0) {
      levers.push({
        title: 'Fix unit economics before scaling — gross margin is not positive',
        rationale: `Gross margin is ${gm.toFixed(0)}%: each extra ₹ of revenue currently adds to the loss, so growth alone cannot close the burn. Pricing / COGS comes before a growth push.`,
        traces: [{ label: 'Gross margin', value: `${gm.toFixed(0)}%` }],
      });
    }
    // Working capital: a clean collections lever + the FLAGGED supplier-stretch consideration.
    const dso = latest.workingCapital.dso;
    if (dso !== null && dso > 0) {
      const impliedAR = (dso * latest.pnl.operatingRevenuePaise) / latest.workingCapital.daysInMonth;
      const per5 = (5 * latest.pnl.operatingRevenuePaise) / latest.workingCapital.daysInMonth;
      levers.push({
        title: 'Free trapped cash by collecting receivables faster',
        rationale: `~${inr(roundSigPaise(impliedAR))} is tied up in receivables at ${dso.toFixed(0)} days DSO; each 5 days faster collection frees ~${inr(roundSigPaise(per5))} — a one-time cash release, not a burn cut.`,
        traces: [{ label: 'Receivables (implied)', value: inr(roundSigPaise(impliedAR)) }, { label: 'DSO', value: `${dso.toFixed(0)} days` }, { label: 'Per 5 days', value: inr(roundSigPaise(per5)) }],
      });
      const dpoPer5 = (5 * latest.pnl.cogsPaise) / latest.workingCapital.daysInMonth;
      const reason = 'Stretching supplier payments is mechanically-correct-but-relationship-risky — the classic naive cash trick; weigh the supplier relationship, do not default to it.';
      levers.push({
        title: 'Stretching supplier payments — RAISE FOR DISCUSSION, not a recommendation',
        rationale: `Paying suppliers ~5 days slower would defer ~${inr(roundSigPaise(dpoPer5))} of outflow. It frees cash on paper, but ${reason}`,
        traces: [{ label: 'Defers per 5 days', value: inr(roundSigPaise(dpoPer5)) }],
        flaggedForReview: true,
        reviewReason: reason,
      });
      reviewFlags.push('Supplier-payment-stretch (DPO) lever flagged: mechanically frees cash but can harm supplier relationships — discuss, do not assert.');
    }
  } else {
    // Not burning — margin / growth / efficiency levers, all number-traced.
    if (gm !== null) {
      const perPp = 0.01 * latest.pnl.operatingRevenuePaise; // ₹ value of 1pp of margin at current revenue
      levers.push({
        title: 'Protect / expand gross margin as you scale',
        rationale: `Gross margin is ${gm.toFixed(0)}%. At ${inr(revNow)}/mo revenue, each 1 percentage point of margin is ~${inr(roundSigPaise(perPp))}/mo to the bottom line — margin compounds as revenue grows.`,
        traces: [{ label: 'Gross margin', value: `${gm.toFixed(0)}%` }, { label: 'Revenue/mo', value: inr(revNow) }, { label: 'Per 1pp margin', value: inr(roundSigPaise(perPp)) }],
      });
    }
    const opexRatio = revNow > 0 ? (latest.pnl.operatingExpensesPaise / revNow) * 100 : null;
    if (opexRatio !== null) {
      const perPp = 0.01 * revNow;
      levers.push({
        title: 'Operating-expense efficiency',
        rationale: `Operating expenses are ~${opexRatio.toFixed(0)}% of revenue (${inr(latest.pnl.operatingExpensesPaise)}/mo). Each 1pp of revenue held back from opex is ~${inr(roundSigPaise(perPp))}/mo — the lever for converting growth into profit.`,
        traces: [{ label: 'Opex / revenue', value: `${opexRatio.toFixed(0)}%` }, { label: 'Opex/mo', value: inr(latest.pnl.operatingExpensesPaise) }, { label: 'Per 1pp', value: inr(roundSigPaise(perPp)) }],
      });
    }
    if (profitable) {
      const monthlyCashBuild = -B; // not burning → B ≤ 0, so -B ≥ 0 (cash building)
      levers.push({
        title: 'Deploy the cash you are generating — growth vs reserves',
        rationale: `Cash isn't a constraint (building ~${inr(roundSigPaise(Math.max(0, monthlyCashBuild)))}/mo). The decision is allocation: reinvest into ${ratePct(g)}/mo growth, or bank reserves — a choice to make deliberately, not by default.`,
        traces: [{ label: 'Net profit/mo', value: inr(np) }, { label: 'Growth', value: ratePct(g) }],
      });
    }
  }

  // ---- priorities (ranked for the situation) ----
  let priorities: Priority[];
  let situationSummary: string;
  switch (situation) {
    case 'short_runway':
      situationSummary = `Burning ~${inr(B)}/mo with ~${R!.toFixed(1)} months of runway — cash is the binding constraint.`;
      priorities = [
        { rank: 1, focus: 'Extend runway (cut burn / raise / grow to breakeven)', because: `At ${R!.toFixed(1)} months, runway extension outranks margin optimisation — there isn't time for a slow efficiency programme to matter.` },
        { rank: 2, focus: 'Protect gross margin', because: `A healthy margin is what makes the "grow to breakeven" lever realistic; a thin margin makes growth a cash drain.` },
        { rank: 3, focus: 'Defer non-critical spend & non-dilutive cash', because: 'Collections and discretionary-spend timing buy weeks while the bigger levers play out.' },
      ];
      break;
    case 'funded_burn':
      situationSummary = `Pre-profit, burning ~${inr(B)}/mo with ~${R!.toFixed(1)} months runway — the path to profitability is the question.`;
      priorities = [
        { rank: 1, focus: 'Define the path to profitability', because: `Runway is ${R!.toFixed(1)} months — comfortable, but the burn still has to end; knowing the month it does drives every other call.` },
        { rank: 2, focus: 'Unit economics / gross margin', because: 'Profit at scale is set by the margin you grow into — fix it before it compounds.' },
        { rank: 3, focus: 'Runway monitoring', because: 'Re-check as actuals land; a burn that drifts up shortens the timeline fast.' },
      ];
      break;
    case 'profitable_growing':
      situationSummary = `Profitable (~${inr(np)}/mo) and growing ~${ratePct(g)}/mo — the question is durable, efficient scaling.`;
      priorities = [
        { rank: 1, focus: 'Sustain growth durably', because: `At ${ratePct(g)}/mo the trajectory compounds; protecting the growth engine is the highest-value focus.` },
        { rank: 2, focus: 'Protect margin while scaling', because: 'Growth that erodes margin trades a good business for a bigger weak one.' },
        { rank: 3, focus: 'Build cash reserves', because: 'A cash buffer converts a downturn from existential to a planning problem.' },
      ];
      break;
    case 'profitable_stable':
      situationSummary = `Profitable (~${inr(np)}/mo) and roughly flat — efficiency and selective growth are the options.`;
      priorities = [
        { rank: 1, focus: 'Efficiency / margin expansion', because: 'With flat top-line, margin is the nearest lever on profit.' },
        { rank: 2, focus: 'Selective growth investment', because: 'Test a growth channel without betting the (healthy) base.' },
        { rank: 3, focus: 'Reserves / capital allocation', because: 'Decide deliberately what the generated cash is for.' },
      ];
      break;
    case 'declining':
      situationSummary = `Revenue declining ~${ratePct(g)}/mo — stabilising the top line comes before optimisation.`;
      priorities = [
        { rank: 1, focus: 'Stabilise revenue', because: `Top line is shrinking ${ratePct(g)}/mo; efficiency on a falling base buys little.` },
        { rank: 2, focus: 'Protect cash', because: 'Preserve runway while the revenue problem is diagnosed.' },
        { rank: 3, focus: 'Cost-base review', because: 'Right-size to the realistic revenue, not the hoped-for one.' },
      ];
      break;
    default: // growing_unprofitable
      situationSummary = `Loss-making (~${inr(np)}/mo) but not cash-critical — unit economics / path to profit is the focus.`;
      priorities = [
        { rank: 1, focus: 'Unit economics / path to profit', because: 'Not burning today, but the loss has to close — the margin and the crossover month are the question.' },
        { rank: 2, focus: 'Controlled growth', because: 'Grow only where the contribution margin is positive, or growth widens the loss.' },
        { rank: 3, focus: 'Runway watch', because: 'Re-check cash as actuals land so a quiet drift becomes a flag early.' },
      ];
  }

  reviewFlags.push('All strategic guidance leans on the forecast, which is an estimate — treat these as options to weigh with a CFO, not instructions or guarantees.');

  return { situation, situationSummary, sufficient: true, confidence: f.quality.confidence, note: f.quality.note, trajectory, levers, priorities, reviewFlags, basis, status: 'UNVERIFIED_ESTIMATE' };
}
