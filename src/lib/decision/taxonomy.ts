// src/lib/decision/taxonomy.ts — the canonical account-category taxonomy as a PURE constant
// (mirrors public.account_categories / migration 0003 — the fixed classification target, Bible §3.2).
// Shipped in-module so the decision engine is pure and unit-testable without the DB. The DB stays
// the runtime source of truth; this MUST be kept in sync with migration 0003's codes & names.
import type { CategoryMeta } from '../intake/types';

export const CANONICAL_CATEGORIES: CategoryMeta[] = [
  { code: 'operating_revenue', name: 'Operating revenue', group: 'income', statement: 'pl', normal_balance: 'credit' },
  { code: 'other_income', name: 'Other income', group: 'income', statement: 'pl', normal_balance: 'credit' },
  { code: 'cogs', name: 'COGS / cost of services', group: 'direct_costs', statement: 'pl', normal_balance: 'debit' },
  { code: 'employee_benefits', name: 'Employee benefits', group: 'operating_expenses', statement: 'pl', normal_balance: 'debit' },
  { code: 'rent_utilities', name: 'Rent & utilities', group: 'operating_expenses', statement: 'pl', normal_balance: 'debit' },
  { code: 'sales_marketing', name: 'Sales & marketing', group: 'operating_expenses', statement: 'pl', normal_balance: 'debit' },
  { code: 'technology_software', name: 'Technology/software', group: 'operating_expenses', statement: 'pl', normal_balance: 'debit' },
  { code: 'professional_fees', name: 'Professional fees', group: 'operating_expenses', statement: 'pl', normal_balance: 'debit' },
  { code: 'admin_other_opex', name: 'Admin & other opex', group: 'operating_expenses', statement: 'pl', normal_balance: 'debit' },
  { code: 'depreciation_amortisation', name: 'Depreciation & amortisation', group: 'below_the_line', statement: 'pl', normal_balance: 'debit' },
  { code: 'finance_costs', name: 'Finance costs', group: 'below_the_line', statement: 'pl', normal_balance: 'debit' },
  { code: 'tax_expense', name: 'Tax expense', group: 'below_the_line', statement: 'pl', normal_balance: 'debit' },
  { code: 'cash_bank', name: 'Cash & bank', group: 'current_assets', statement: 'bs', normal_balance: 'debit' },
  { code: 'trade_receivables', name: 'Trade receivables (AR)', group: 'current_assets', statement: 'bs', normal_balance: 'debit' },
  { code: 'inventory', name: 'Inventory', group: 'current_assets', statement: 'bs', normal_balance: 'debit' },
  { code: 'prepaid_advances', name: 'Prepaid & advances', group: 'current_assets', statement: 'bs', normal_balance: 'debit' },
  { code: 'other_current_assets', name: 'Other current assets', group: 'current_assets', statement: 'bs', normal_balance: 'debit' },
  { code: 'ppe', name: 'PP&E', group: 'non_current_assets', statement: 'bs', normal_balance: 'debit' },
  { code: 'intangibles', name: 'Intangibles', group: 'non_current_assets', statement: 'bs', normal_balance: 'debit' },
  { code: 'investments', name: 'Investments', group: 'non_current_assets', statement: 'bs', normal_balance: 'debit' },
  { code: 'other_non_current_assets', name: 'Other non-current assets', group: 'non_current_assets', statement: 'bs', normal_balance: 'debit' },
  { code: 'trade_payables', name: 'Trade payables (AP)', group: 'current_liabilities', statement: 'bs', normal_balance: 'credit' },
  { code: 'short_term_borrowings', name: 'Short-term borrowings', group: 'current_liabilities', statement: 'bs', normal_balance: 'credit' },
  { code: 'statutory_dues', name: 'Statutory dues', group: 'current_liabilities', statement: 'bs', normal_balance: 'credit' },
  { code: 'accrued_other_current_liabilities', name: 'Accrued/other current liabilities', group: 'current_liabilities', statement: 'bs', normal_balance: 'credit' },
  { code: 'long_term_borrowings', name: 'Long-term borrowings', group: 'non_current_liabilities', statement: 'bs', normal_balance: 'credit' },
  { code: 'provisions', name: 'Provisions', group: 'non_current_liabilities', statement: 'bs', normal_balance: 'credit' },
  { code: 'other_non_current_liabilities', name: 'Other non-current liabilities', group: 'non_current_liabilities', statement: 'bs', normal_balance: 'credit' },
  { code: 'share_capital', name: 'Share capital', group: 'equity', statement: 'bs', normal_balance: 'credit' },
  { code: 'reserves_surplus', name: 'Reserves & surplus / retained earnings', group: 'equity', statement: 'bs', normal_balance: 'credit' },
  { code: 'other_equity', name: 'Other equity', group: 'equity', statement: 'bs', normal_balance: 'credit' },
];

/** code → CategoryMeta, for resolving a proposed category's display name. */
export const CATEGORY_BY_CODE: Record<string, CategoryMeta> = Object.fromEntries(
  CANONICAL_CATEGORIES.map((c) => [c.code, c]),
);
