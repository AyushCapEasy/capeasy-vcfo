// src/lib/tally/groups.ts — Tally PRIMARY group → canonical taxonomy placement. PURE.
// The Tally group is AUTHORITATIVE for the statement (P&L vs BS) and the macro bucket
// (income / expense / asset / liability / equity); the ledger NAME (decision engine) only refines the
// fine canonical category WITHIN that bucket. A name whose macro bucket disagrees with the Tally
// group's macro bucket is a name↔group CONFLICT (the over-confidence-miss catch from the Zoho pull).
import { CATEGORY_BY_CODE } from '../decision';

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();

// Tally's ~28 default primary groups (+ common reserved sub-groups) → a DEFAULT canonical category.
// Statement + macro bucket are derived from the canonical taxonomy, so they can never drift from it.
const GROUP_TO_CATEGORY: Record<string, string> = {
  // P&L — income
  'sales accounts': 'operating_revenue',
  'direct incomes': 'operating_revenue', 'direct income': 'operating_revenue',
  'indirect incomes': 'other_income', 'indirect income': 'other_income',
  // P&L — expense
  'purchase accounts': 'cogs',
  'direct expenses': 'cogs',
  'indirect expenses': 'admin_other_opex', // name refines: salaries/rent/depreciation/finance/tax…
  // BS — equity
  'capital account': 'share_capital',
  'reserves and surplus': 'reserves_surplus', 'reserves surplus': 'reserves_surplus',
  // BS — liabilities
  'loans liability': 'long_term_borrowings', 'loans liabilities': 'long_term_borrowings',
  'secured loans': 'long_term_borrowings', 'unsecured loans': 'long_term_borrowings',
  'bank od a c': 'short_term_borrowings', 'bank occ a c': 'short_term_borrowings', 'bank od cc': 'short_term_borrowings',
  'current liabilities': 'accrued_other_current_liabilities',
  'sundry creditors': 'trade_payables',
  'duties and taxes': 'statutory_dues', 'duties taxes': 'statutory_dues', // "Duties & Taxes" → norm "duties taxes" (& → space)
  'provisions': 'provisions',
  // BS — assets
  'fixed assets': 'ppe',
  'investments': 'investments',
  'current assets': 'other_current_assets',
  'bank accounts': 'cash_bank', 'cash in hand': 'cash_bank',
  'sundry debtors': 'trade_receivables',
  'stock in hand': 'inventory',
  'deposits asset': 'other_non_current_assets', 'deposits assets': 'other_non_current_assets',
  'loans and advances asset': 'prepaid_advances', 'loans advances asset': 'prepaid_advances',
  'misc expenses asset': 'other_non_current_assets', 'miscellaneous expenses asset': 'other_non_current_assets',
  // Suspense / Branch deliberately UNMAPPED → name fallback + flagged.
};

export type MacroBucket = 'pl_income' | 'pl_expense' | 'asset' | 'liability' | 'equity';

/** Macro bucket of a canonical taxonomy group — the level at which name↔group conflicts are judged. */
export function macroOf(canonGroup: string): MacroBucket | null {
  switch (canonGroup) {
    case 'income': return 'pl_income';
    case 'direct_costs': case 'operating_expenses': case 'below_the_line': return 'pl_expense';
    case 'current_assets': case 'non_current_assets': return 'asset';
    case 'current_liabilities': case 'non_current_liabilities': return 'liability';
    case 'equity': return 'equity';
    default: return null;
  }
}

export type TallyPlacement = { category: string; statement: 'pl' | 'bs'; group: string; macro: MacroBucket };

/** Authoritative placement for a Tally group, or null if the group is unknown (→ name fallback). */
export function tallyGroupPlacement(group: string): TallyPlacement | null {
  const code = GROUP_TO_CATEGORY[norm(group)];
  if (!code) return null;
  const meta = CATEGORY_BY_CODE[code];
  if (!meta) return null;
  const macro = macroOf(meta.group);
  if (!macro) return null;
  return { category: code, statement: meta.statement, group: meta.group, macro };
}
