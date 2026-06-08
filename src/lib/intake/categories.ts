// src/lib/intake/categories.ts — synonym hints per canonical category code, to power fuzzy
// suggestion at mapping time. The DB (public.account_categories) remains the source of truth for
// the taxonomy; this only enriches matching with the words real Tally/Zoho/Excel exports use.
// Keys MUST stay in sync with migration 0003's category codes.

export const CATEGORY_SYNONYMS: Record<string, string[]> = {
  operating_revenue: ['revenue', 'sales', 'turnover', 'income from operations', 'service income', 'fees earned', 'gross receipts'],
  other_income: ['other income', 'interest income', 'misc income', 'forex gain', 'discount received', 'non operating income'],
  cogs: ['cogs', 'cost of goods sold', 'cost of services', 'cost of sales', 'direct cost', 'purchases', 'material consumed'],
  employee_benefits: ['salary', 'salaries', 'wages', 'payroll', 'staff cost', 'employee benefit', 'pf', 'esi', 'gratuity', 'bonus'],
  rent_utilities: ['rent', 'electricity', 'water', 'utilities', 'power', 'office rent', 'lease rent'],
  sales_marketing: ['marketing', 'advertising', 'advertisement', 'promotion', 'sales expense', 'branding', 'ads'],
  technology_software: ['software', 'subscription', 'saas', 'hosting', 'cloud', 'aws', 'it expense', 'licenses', 'technology'],
  professional_fees: ['legal', 'professional', 'consultancy', 'consulting', 'audit fee', 'retainer', 'advisory'],
  admin_other_opex: ['office', 'admin', 'administrative', 'printing', 'stationery', 'travel', 'conveyance', 'miscellaneous expense', 'general expense'],
  depreciation_amortisation: ['depreciation', 'amortisation', 'amortization', 'dep', 'd&a'],
  finance_costs: ['interest', 'finance cost', 'bank charges', 'interest on loan', 'borrowing cost'],
  tax_expense: ['tax', 'income tax', 'provision for tax', 'current tax', 'deferred tax'],
  cash_bank: ['cash', 'bank', 'current account', 'savings account', 'hdfc', 'icici', 'axis', 'sbi', 'petty cash', 'cash in hand', 'cash at bank'],
  trade_receivables: ['receivable', 'debtor', 'sundry debtors', 'accounts receivable', 'ar', 'trade debtors'],
  inventory: ['inventory', 'stock', 'stock in hand', 'closing stock', 'finished goods', 'raw material', 'wip'],
  prepaid_advances: ['prepaid', 'advance', 'advances', 'prepaid expense', 'advance to vendor', 'deposit'],
  other_current_assets: ['other current asset', 'gst input', 'input credit', 'tds receivable', 'loans and advances'],
  ppe: ['plant', 'equipment', 'machinery', 'furniture', 'fixtures', 'property plant equipment', 'fixed asset', 'vehicle', 'computer', 'accumulated depreciation'],
  intangibles: ['intangible', 'goodwill', 'patent', 'trademark', 'software asset', 'brand'],
  investments: ['investment', 'mutual fund', 'shares', 'securities', 'fixed deposit', 'fd'],
  other_non_current_assets: ['other non current asset', 'long term deposit', 'security deposit', 'deferred tax asset'],
  trade_payables: ['payable', 'creditor', 'sundry creditors', 'accounts payable', 'ap', 'trade creditors'],
  short_term_borrowings: ['working capital loan', 'overdraft', 'cc limit', 'cash credit', 'short term loan', 'bank od'],
  statutory_dues: ['gst payable', 'tds payable', 'pf payable', 'esi payable', 'statutory', 'tax payable', 'duties and taxes', 'professional tax'],
  accrued_other_current_liabilities: ['accrued', 'outstanding expense', 'provision for expense', 'other current liability', 'expenses payable'],
  long_term_borrowings: ['term loan', 'long term loan', 'secured loan', 'unsecured loan', 'debenture', 'borrowing'],
  provisions: ['provision', 'provision for gratuity', 'provision for leave', 'long term provision'],
  other_non_current_liabilities: ['other non current liability', 'deferred tax liability', 'long term liability'],
  share_capital: ['share capital', 'equity share', 'paid up capital', 'capital account', 'proprietor capital', 'partner capital'],
  reserves_surplus: ['reserves', 'surplus', 'retained earnings', 'p&l account', 'profit and loss account', 'general reserve', 'accumulated profit'],
  other_equity: ['other equity', 'securities premium', 'share premium', 'capital reserve'],
};
