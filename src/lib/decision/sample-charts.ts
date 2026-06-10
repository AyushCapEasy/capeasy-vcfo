// src/lib/decision/sample-charts.ts — PURE fixtures for the M9 decision-engine coverage report.
// (1) NAME_BANK: a realistic raw account NAME per canonical category — the words a real Tally/Zoho/
//     Excel export uses, reusing the demo seed names where they exist. Deliberately a MIX of
//     distinctive and generic/ambiguous names so coverage exercises all three gate buckets rather
//     than a rigged all-auto result.
// (2) rowsFromNaturals: turn a battery chart's category→paise naturals into named raw TB rows, so the
//     decision engine can be run over the SAME 16 adversarial charts the identity battery uses.
// (3) SEEDED_ACME_TB: the demo seed's 25 account lines (names & codes from scripts/seed.mjs).
// (4) MESSY_TB: a deliberately messy real-world TB to exercise the founder-confirm / flag buckets.
import type { ParsedTbRow } from '../intake/types';
import { CATEGORY_BY_CODE } from './taxonomy';

/** Realistic raw account name per category. Seed names reused where the demo defines them; the rest
 *  are plausible Tally/Zoho ledger names (some intentionally generic, e.g. "Other Income"). */
export const NAME_BANK: Record<string, string> = {
  operating_revenue: 'Sales – Services',
  other_income: 'Other Income',
  cogs: 'Cost of Services',
  employee_benefits: 'Salaries & Wages',
  rent_utilities: 'Rent – Office',
  sales_marketing: 'Marketing & Advertising',
  technology_software: 'Software Subscriptions',
  professional_fees: 'Legal & Professional',
  admin_other_opex: 'Office & Admin',
  depreciation_amortisation: 'Depreciation',
  finance_costs: 'Interest on Term Loan',
  tax_expense: 'Income Tax Provision',
  cash_bank: 'HDFC Bank – Current A/c',
  trade_receivables: 'Trade Receivables',
  inventory: 'Inventory',
  prepaid_advances: 'Prepaid Expenses',
  other_current_assets: 'GST Input Credit',
  ppe: 'Plant & Equipment',
  intangibles: 'Goodwill',
  investments: 'Investments in Mutual Funds',
  other_non_current_assets: 'Security Deposit',
  trade_payables: 'Trade Payables',
  short_term_borrowings: 'Working Capital Loan',
  statutory_dues: 'GST Payable',
  accrued_other_current_liabilities: 'Outstanding Expenses',
  long_term_borrowings: 'Term Loan (HDFC)',
  provisions: 'Provision for Gratuity',
  other_non_current_liabilities: 'Deferred Tax Liability',
  share_capital: 'Share Capital',
  reserves_surplus: 'Retained Earnings',
  other_equity: 'Securities Premium',
};

/**
 * Convert a category-code→paise naturals map (from a battery chart) into named raw TB rows, placing
 * each amount on its category's normal-balance side. Absent (zero) accounts produce no row — so the
 * zero-revenue chart genuinely has no revenue line, etc. Magnitudes only (sign handled by the side).
 */
export function rowsFromNaturals(naturals: Record<string, number>): ParsedTbRow[] {
  const rows: ParsedTbRow[] = [];
  let n = 0;
  for (const [code, paise] of Object.entries(naturals)) {
    if (!paise) continue;
    const side = CATEGORY_BY_CODE[code]?.normal_balance ?? 'debit';
    const mag = Math.abs(paise);
    rows.push({
      rowNumber: ++n,
      accountCode: '', // battery charts carry no source codes → name-only classification
      accountName: NAME_BANK[code] ?? code,
      debitPaise: side === 'debit' ? mag : 0,
      creditPaise: side === 'credit' ? mag : 0,
    });
  }
  return rows;
}

const dr = (rowNumber: number, code: string, name: string, paise: number): ParsedTbRow =>
  ({ rowNumber, accountCode: code, accountName: name, debitPaise: paise, creditPaise: 0 });
const cr = (rowNumber: number, code: string, name: string, paise: number): ParsedTbRow =>
  ({ rowNumber, accountCode: code, accountName: name, debitPaise: 0, creditPaise: paise });

/** The demo seed's 25 account lines — names & codes from scripts/seed.mjs (Acme Foods). Amounts are
 *  representative (the bucket split is name-driven; amounts drive only the dirty-rupee weighting). */
export const SEEDED_ACME_TB: ParsedTbRow[] = [
  cr(1, '4000', 'Sales – Services', 360000000),
  dr(2, '5000', 'Cost of Services', 144000000),
  dr(3, '6000', 'Salaries & Wages', 90000000),
  dr(4, '6100', 'Rent – Office', 18000000),
  dr(5, '6110', 'Electricity & Utilities', 6000000),
  dr(6, '6200', 'Marketing & Advertising', 24000000),
  dr(7, '6300', 'Software Subscriptions', 12000000),
  dr(8, '6400', 'Legal & Professional', 8000000),
  dr(9, '6500', 'Office & Admin', 9000000),
  dr(10, '7000', 'Depreciation', 10000000),
  dr(11, '7100', 'Interest on Term Loan', 5000000),
  dr(12, '7200', 'Income Tax Provision', 8750000),
  dr(13, '1000', 'HDFC Bank – Current A/c', 70000000),
  dr(14, '1100', 'Trade Receivables', 200000000),
  dr(15, '1200', 'Inventory', 100000000),
  dr(16, '1300', 'Prepaid Expenses', 20000000),
  dr(17, '1500', 'Plant & Equipment', 300000000),
  cr(18, '1590', 'Accumulated Depreciation', 40000000),
  cr(19, '2000', 'Trade Payables', 130000000),
  cr(20, '2100', 'Working Capital Loan', 80000000),
  cr(21, '2200', 'GST Payable', 22000000),
  cr(22, '2210', 'TDS Payable', 8000000),
  cr(23, '2500', 'Term Loan (HDFC)', 240000000),
  cr(24, '3000', 'Share Capital', 500000000),
  cr(25, '3100', 'Retained Earnings', 100000000),
];

/** A deliberately messy real-world TB: distinctive names (auto), keyword-ish names (auto/confirm),
 *  and genuinely ambiguous / unknown names (flag) — to exercise every gate bucket. */
export const MESSY_TB: ParsedTbRow[] = [
  dr(1, 'L01', 'Salaries & Wages', 5000000),
  dr(2, 'L02', 'HDFC Bank Current Account', 9000000),
  dr(3, 'L03', 'Trade Receivables', 12000000),
  dr(4, 'L04', 'AWS Cloud Hosting', 800000),
  cr(5, 'L05', 'Sundry Creditors', 7000000),
  dr(6, 'L06', 'GST Input Credit', 1500000),
  dr(7, 'L07', 'Suspense A/c', 250000),
  cr(8, 'L08', 'Round Off', 1200),
  dr(9, 'L09', 'Misc', 300000),
  cr(10, 'L10', 'Inter-company Settlement', 4000000),
  dr(11, 'L11', 'Adjustment Entry', 600000),
];
