// src/lib/engine/invariants.ts — the §4.5 accounting-identity invariants. These are IDENTITIES, not
// restatements of a formula, so they catch ENGINE errors even when the agent authors them (§10.6).
// They do NOT prove the numbers are correct — that is the CA golden fixture (PENDING). The cash
// tie-out is the non-circular check: its two sides come from independent sources (BS cash = the stored
// cash_bank natural; CF closing = opening cash + Δ non-cash accounts, never reading period-t cash).
import type { PeriodEngineInput, PeriodResult, InvariantResult } from './types';

const nat = (i: PeriodEngineInput, code: string) => i.naturals[code] ?? 0;
const p = (n: number) => `${(n / 100).toLocaleString('en-IN')} (₹)`;

export type PriorContext = { input: PeriodEngineInput; result: PeriodResult } | null;

export function checkInvariants(input: PeriodEngineInput, result: PeriodResult, prior: PriorContext = null): InvariantResult[] {
  const out: InvariantResult[] = [];
  const bs = result.balanceSheet;

  // 1) TB integrity — Σ debits = Σ credits.
  const tbDelta = input.tb.debitPaise - input.tb.creditPaise;
  out.push({
    id: 'tb_integrity', label: 'TB integrity (Σ debits = Σ credits)',
    status: tbDelta === 0 ? 'pass' : 'fail',
    detail: tbDelta === 0 ? `Σ debits = Σ credits = ${p(input.tb.debitPaise)}.` : `Out of balance by ${p(Math.abs(tbDelta))}.`,
    deltaPaise: tbDelta,
  });

  // 2) Balance-sheet identity — Assets = Liabilities + Equity.
  const bsDelta = bs.totalAssetsPaise - (bs.totalLiabilitiesPaise + bs.totalEquityPaise);
  out.push({
    id: 'bs_identity', label: 'Balance-sheet identity (Assets = Liabilities + Equity)',
    status: bsDelta === 0 ? 'pass' : 'fail',
    detail: bsDelta === 0
      ? `Assets ${p(bs.totalAssetsPaise)} = Liab ${p(bs.totalLiabilitiesPaise)} + Equity ${p(bs.totalEquityPaise)}.`
      : `Assets ≠ Liab + Equity — off by ${p(Math.abs(bsDelta))}.`,
    deltaPaise: bsDelta,
  });

  // 3) Cash tie-out — CF closing cash = BS closing cash (independent sources). Needs prior.
  if (result.cashFlow.available) {
    const cfClosing = result.cashFlow.closingCashPaise;
    const bsClosing = bs.cashPaise;
    const d = cfClosing - bsClosing;
    out.push({
      id: 'cash_tie_out', label: 'Cash tie-out (CF closing cash = BS closing cash)',
      status: d === 0 ? 'pass' : 'fail',
      detail: d === 0 ? `Both = ${p(bsClosing)} (CF-derived independently of BS cash).` : `CF ${p(cfClosing)} ≠ BS ${p(bsClosing)} — off by ${p(Math.abs(d))}.`,
      deltaPaise: d,
    });
  } else {
    out.push({ id: 'cash_tie_out', label: 'Cash tie-out (CF closing cash = BS closing cash)', status: 'na', detail: 'n/a — needs prior period.' });
  }

  // 4) P&L → equity — this period's opening RE = prior opening RE + prior net profit (the roll). Needs prior.
  if (prior) {
    const expected = nat(prior.input, 'reserves_surplus') + prior.result.pnl.netProfitPaise;
    const actual = nat(input, 'reserves_surplus');
    const d = actual - expected;
    out.push({
      id: 'pl_to_equity', label: 'P&L → equity (opening RE rolls by prior net profit)',
      status: d === 0 ? 'pass' : 'fail',
      detail: d === 0 ? `Opening RE ${p(actual)} = prior opening ${p(nat(prior.input, 'reserves_surplus'))} + prior NP ${p(prior.result.pnl.netProfitPaise)}.` : `Opening RE off by ${p(Math.abs(d))}.`,
      deltaPaise: d,
    });
  } else {
    out.push({ id: 'pl_to_equity', label: 'P&L → equity (opening RE rolls by prior net profit)', status: 'na', detail: 'n/a — needs prior period.' });
  }

  return out;
}

/** Return a copy of the input with one category's natural amount corrupted by deltaPaise, with the
 * matching side of the TB totals adjusted. Used by the perturbation test to prove the cash tie-out
 * is a LIVE check: corrupt a non-cash line by X → the cash tie breaks by exactly X. */
export function perturbNatural(
  input: PeriodEngineInput,
  code: string,
  deltaPaise: number,
  side: 'debit' | 'credit'
): PeriodEngineInput {
  return {
    ...input,
    naturals: { ...input.naturals, [code]: (input.naturals[code] ?? 0) + deltaPaise },
    tb: {
      debitPaise: input.tb.debitPaise + (side === 'debit' ? deltaPaise : 0),
      creditPaise: input.tb.creditPaise + (side === 'credit' ? deltaPaise : 0),
    },
  };
}
