// src/lib/mis/schedule3.test.ts — the statutory Schedule III re-presentation must (a) be in the exact
// prescribed order, (b) re-label/re-group WITHOUT changing any value (every subtotal/total ties to the
// engine's own figures), (c) carry the prior-year comparative, and (d) show no comparative in year one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeChain } from '../engine/engine';
import type { PeriodEngineInput } from '../engine/types';
import { plScheduleIII, bsScheduleIII, TAX_SOURCE_NOTE, type Sch3Row } from './schedule3';

const APR: PeriodEngineInput = {
  periodId: 'apr', label: 'Apr 2026', periodMonth: '2026-04-01',
  tb: { debitPaise: 1_000_000_000, creditPaise: 1_000_000_000 },
  naturals: {
    cash_bank: 513500000, trade_receivables: 220000000, inventory: 110000000, prepaid_advances: 20000000, ppe: 310000000,
    trade_payables: 135000000, short_term_borrowings: 80000000, statutory_dues: 36250000, long_term_borrowings: 240000000,
    share_capital: 500000000, reserves_surplus: 160000000,
    operating_revenue: 300000000, cogs: 120000000, employee_benefits: 70000000, rent_utilities: 19000000,
    sales_marketing: 20000000, technology_software: 8000000, professional_fees: 6000000, admin_other_opex: 11000000,
    depreciation_amortisation: 10000000, finance_costs: 5000000, tax_expense: 8750000,
  },
};
const MAY: PeriodEngineInput = {
  periodId: 'may', label: 'May 2026', periodMonth: '2026-05-01',
  tb: { debitPaise: 1_000_000_000, creditPaise: 1_000_000_000 },
  naturals: {
    cash_bank: 498950000, trade_receivables: 240000000, inventory: 115000000, prepaid_advances: 18000000, ppe: 330000000,
    trade_payables: 140000000, short_term_borrowings: 80000000, statutory_dues: 40000000, long_term_borrowings: 230000000,
    share_capital: 500000000, reserves_surplus: 182250000,
    operating_revenue: 330000000, cogs: 132000000, employee_benefits: 72000000, rent_utilities: 19200000,
    sales_marketing: 24000000, technology_software: 8500000, professional_fees: 6500000, admin_other_opex: 12000000,
    depreciation_amortisation: 10000000, finance_costs: 4800000, tax_expense: 11300000,
  },
};

const [aprR, mayR] = computeChain([APR, MAY]);
const labels = (rows: Sch3Row[]) => rows.map((r) => r.label);
const find = (rows: Sch3Row[], label: string) => rows.find((r) => r.label === label)!;

test('Schedule III P&L is in the exact prescribed order', () => {
  assert.deepEqual(labels(plScheduleIII(mayR, aprR)), [
    'Revenue from operations',
    'Other income',
    'Total revenue',
    'Expenses',
    'Cost of materials consumed',
    'Purchases of stock-in-trade',
    'Changes in inventories of finished goods, WIP and stock-in-trade',
    'Employee benefits expense',
    'Finance costs',
    'Depreciation and amortisation expense',
    'Other expenses',
    'Total expenses',
    'Profit before exceptional and extraordinary items and tax',
    'Exceptional items',
    'Profit before extraordinary items and tax',
    'Extraordinary items',
    'Profit before tax',
    'Tax expense',
    'Profit (loss) for the period',
    'Earnings per equity share (basic and diluted)',
  ]);
});

test('P&L subtotals/totals RE-PRESENT engine values — no recomputation/drift', () => {
  const rows = plScheduleIII(mayR);
  // Total revenue = revenue from operations + other income
  assert.equal(find(rows, 'Total revenue').curPaise, mayR.pnl.operatingRevenuePaise + mayR.pnl.otherIncomePaise);
  // Total expenses = materials + employee + finance + D&A + other (= cogs + opex + finance + D&A)
  assert.equal(find(rows, 'Total expenses').curPaise, mayR.pnl.cogsPaise + mayR.pnl.operatingExpensesPaise + mayR.pnl.financeCostsPaise + mayR.pnl.depreciationAmortisationPaise);
  // Profit before tax ladder all equal engine ebt (no exceptional/extraordinary recognised)
  assert.equal(find(rows, 'Profit before exceptional and extraordinary items and tax').curPaise, mayR.pnl.ebtPaise);
  assert.equal(find(rows, 'Profit before tax').curPaise, mayR.pnl.ebtPaise);
  // Profit for the period ties to engine net profit EXACTLY (the value is unchanged)
  assert.equal(find(rows, 'Profit (loss) for the period').curPaise, mayR.pnl.netProfitPaise);
  // Cost of materials consumed = engine cogs; Employee benefits = its own line (split out of opex)
  assert.equal(find(rows, 'Cost of materials consumed').curPaise, mayR.pnl.cogsPaise);
  assert.equal(find(rows, 'Employee benefits expense').curPaise, mayR.naturalsPaise['employee_benefits']);
});

test('Tax line is READ from the tax_expense ledger and carries the as-per-books note (never computed)', () => {
  const taxRow = find(plScheduleIII(mayR), 'Tax expense');
  assert.equal(taxRow.curPaise, mayR.pnl.taxPaise);          // exactly the book figure
  assert.equal(taxRow.codes?.[0], 'tax_expense');            // drill-down to the tax ledgers
  assert.ok(taxRow.note?.includes(TAX_SOURCE_NOTE));         // visible caveat present
});

test('Comparative column: prior-year populated when a prior exists, null in year one', () => {
  // With prior → comparative carries the prior period's figures
  const withPrior = plScheduleIII(mayR, aprR);
  assert.equal(find(withPrior, 'Total revenue').priorPaise, aprR.pnl.operatingRevenuePaise + aprR.pnl.otherIncomePaise);
  assert.equal(find(withPrior, 'Profit (loss) for the period').priorPaise, aprR.pnl.netProfitPaise);
  // First-year company (no prior) → comparative correctly absent (null), not a fabricated 0
  const firstYear = plScheduleIII(aprR, null);
  assert.equal(find(firstYear, 'Total revenue').priorPaise, null);
  assert.equal(find(firstYear, 'Profit (loss) for the period').priorPaise, null);
});

test('Schedule III Balance Sheet: Equity & Liabilities precede Assets, sub-lines tie, BS identity holds', () => {
  const rows = bsScheduleIII(mayR, aprR);
  const idxEL = rows.findIndex((r) => r.label === 'EQUITY AND LIABILITIES');
  const idxA = rows.findIndex((r) => r.label === 'ASSETS');
  assert.ok(idxEL >= 0 && idxA > idxEL, 'Equity & Liabilities section comes before Assets');

  // Sub-line subtotals tie to the engine's own grouped figures (no value change)
  assert.equal(find(rows, 'Total shareholders’ funds').curPaise, mayR.balanceSheet.totalEquityPaise);
  assert.equal(find(rows, 'Total non-current liabilities').curPaise, mayR.balanceSheet.nonCurrentLiabilitiesPaise);
  assert.equal(find(rows, 'Total current liabilities').curPaise, mayR.balanceSheet.currentLiabilitiesPaise);
  assert.equal(find(rows, 'Total non-current assets').curPaise, mayR.balanceSheet.nonCurrentAssetsPaise);
  assert.equal(find(rows, 'Total current assets').curPaise, mayR.balanceSheet.currentAssetsPaise);

  // BS identity: TOTAL EQUITY AND LIABILITIES == TOTAL ASSETS
  assert.equal(find(rows, 'TOTAL EQUITY AND LIABILITIES').curPaise, find(rows, 'TOTAL ASSETS').curPaise);
  assert.equal(find(rows, 'TOTAL ASSETS').curPaise, mayR.balanceSheet.totalAssetsPaise);
});
