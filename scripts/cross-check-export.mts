// scripts/cross-check-export.mts — M-verify (b): emit the engine's seeded-Acme statements in the
// model-agnostic cross-check format (fixtures/cross-check-acme.json) for an independent model to
// recompute + diff. BUG-FINDER ONLY — never a correctness certificate (Vision §5).
import { writeFileSync } from 'node:fs';
import { computeChain } from '../src/lib/engine/engine';
import type { PeriodEngineInput } from '../src/lib/engine/types';
import { buildExport } from '../src/lib/verify/cross-check';

const APR: PeriodEngineInput = { periodId: 'apr', label: 'Apr 2026', periodMonth: '2026-04-01', tb: { debitPaise: 1e9, creditPaise: 1e9 }, naturals: { cash_bank: 513500000, trade_receivables: 220000000, inventory: 110000000, prepaid_advances: 20000000, ppe: 310000000, trade_payables: 135000000, short_term_borrowings: 80000000, statutory_dues: 36250000, long_term_borrowings: 240000000, share_capital: 500000000, reserves_surplus: 160000000, operating_revenue: 300000000, cogs: 120000000, employee_benefits: 70000000, rent_utilities: 19000000, sales_marketing: 20000000, technology_software: 8000000, professional_fees: 6000000, admin_other_opex: 11000000, depreciation_amortisation: 10000000, finance_costs: 5000000, tax_expense: 8750000 } };
const MAY: PeriodEngineInput = { periodId: 'may', label: 'May 2026', periodMonth: '2026-05-01', tb: { debitPaise: 1e9, creditPaise: 1e9 }, naturals: { cash_bank: 498950000, trade_receivables: 240000000, inventory: 115000000, prepaid_advances: 18000000, ppe: 330000000, trade_payables: 140000000, short_term_borrowings: 80000000, statutory_dues: 40000000, long_term_borrowings: 230000000, share_capital: 500000000, reserves_surplus: 182250000, operating_revenue: 330000000, cogs: 132000000, employee_benefits: 72000000, rent_utilities: 19200000, sales_marketing: 24000000, technology_software: 8500000, professional_fees: 6500000, admin_other_opex: 12000000, depreciation_amortisation: 10000000, finance_costs: 4800000, tax_expense: 11300000 } };
const JUN: PeriodEngineInput = { periodId: 'jun', label: 'Jun 2026', periodMonth: '2026-06-01', tb: { debitPaise: 1e9, creditPaise: 1e9 }, naturals: { cash_bank: 536975000, trade_receivables: 260000000, inventory: 120000000, prepaid_advances: 18000000, ppe: 329500000, trade_payables: 148000000, short_term_borrowings: 100000000, statutory_dues: 45000000, long_term_borrowings: 220000000, share_capital: 500000000, reserves_surplus: 211950000, operating_revenue: 363000000, cogs: 145200000, employee_benefits: 75000000, rent_utilities: 20000000, sales_marketing: 25000000, technology_software: 9000000, professional_fees: 7000000, admin_other_opex: 12500000, depreciation_amortisation: 10500000, finance_costs: 4600000, tax_expense: 14675000 } };

const r = computeChain([APR, MAY, JUN]);
const ex = buildExport([{ input: APR, result: r[0] }, { input: MAY, result: r[1] }, { input: JUN, result: r[2] }]);
writeFileSync('fixtures/cross-check-acme.json', JSON.stringify(ex, null, 2) + '\n');
console.log('wrote fixtures/cross-check-acme.json with', ex.cases.length, 'cases');
