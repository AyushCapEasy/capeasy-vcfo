// src/lib/zoho/classify.ts — adapt Zoho Books chart-of-accounts → the existing decision engine
// (Stage 1 rules + Stage 3 gate). This is the REAL test of the classifier: real Zoho account names,
// not synthetic ones. Coverage is name-driven (chart-of-accounts carries no balances in this pull,
// so amounts are 0 and the headline is the count-based auto/confirm/flag split).
import type { ParsedTbRow } from '../intake/types';
import { classify, CATEGORY_BY_CODE, type DecisionResult } from '../decision';
import type { ZohoAccount } from './client';

// Zoho's own account_type → the canonical taxonomy GROUP(s) an account of that type SHOULD land in.
// The classifier keys on the NAME only; Zoho's type is authoritative. A name-based category whose
// group contradicts the Zoho type = an over-confidence miss worth surfacing (independent cross-check).
const ZOHO_TYPE_GROUPS: Record<string, string[]> = {
  income: ['income'], other_income: ['income'],
  expense: ['operating_expenses', 'below_the_line', 'direct_costs'],
  cost_of_goods_sold: ['direct_costs'],
  other_expense: ['operating_expenses', 'below_the_line'],
  cash: ['current_assets'], bank: ['current_assets'],
  accounts_receivable: ['current_assets'], stock: ['current_assets'],
  other_current_asset: ['current_assets'], payment_clearing: ['current_assets'], input_tax: ['current_assets'],
  fixed_asset: ['non_current_assets'], intangible_asset: ['non_current_assets'],
  other_asset: ['non_current_assets', 'current_assets'],
  accounts_payable: ['current_liabilities'], credit_card: ['current_liabilities'],
  other_current_liability: ['current_liabilities'], output_tax: ['current_liabilities'], overseas_tax_payable: ['current_liabilities'],
  long_term_liability: ['non_current_liabilities'],
  other_liability: ['current_liabilities', 'non_current_liabilities'],
  equity: ['equity'],
};

/** Cross-check a name-based proposal against Zoho's authoritative account_type. `suspicious` = the
 *  proposed category's group is NOT among the groups Zoho's type implies (a likely misclassification). */
export function crossCheckZohoType(
  zohoType: string | undefined,
  proposedCategoryCode: string | null,
): { suspicious: boolean; proposedGroup: string | null; expected: string[] | null } {
  const expected = zohoType ? ZOHO_TYPE_GROUPS[zohoType.toLowerCase()] ?? null : null;
  const proposedGroup = proposedCategoryCode ? CATEGORY_BY_CODE[proposedCategoryCode]?.group ?? null : null;
  const suspicious = !!expected && !!proposedGroup && !expected.includes(proposedGroup);
  return { suspicious, proposedGroup, expected };
}

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
