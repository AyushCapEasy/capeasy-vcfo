// src/lib/zoho/classify.ts — adapt Zoho Books chart-of-accounts → the existing decision engine
// (Stage 1 rules + Stage 3 gate). This is the REAL test of the classifier: real Zoho account names,
// not synthetic ones. Coverage is name-driven (chart-of-accounts carries no balances in this pull,
// so amounts are 0 and the headline is the count-based auto/confirm/flag split).
import type { ParsedTbRow } from '../intake/types';
import { classify, type DecisionResult } from '../decision';
import type { ZohoAccount } from './client';

/** Map Zoho accounts to decision-engine rows (name-keyed; amounts unknown here → 0). */
export function accountsToRows(accounts: ZohoAccount[]): ParsedTbRow[] {
  return accounts.map((a, i) => ({
    rowNumber: i + 1,
    accountCode: a.account_id ?? '',
    accountName: a.account_name ?? '',
    debitPaise: 0,
    creditPaise: 0,
  }));
}

/** Run real Zoho account names through Stage 1 + Stage 3 and return the gated result + coverage. */
export function classifyZohoAccounts(accounts: ZohoAccount[]): DecisionResult {
  return classify(accountsToRows(accounts));
}
