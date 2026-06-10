// src/lib/engine/battery-charts.ts — the 16 ADVERSARIAL synthetic charts. PURE data + construction.
// Single source of truth for BOTH the identity battery (M-verify a, identity-battery.test.ts) and the
// decision-engine coverage report (M9, ../decision), so the two can never drift.
//
// Each chart is built so a CORRECT engine yields passing §4.5 identities: cash is the balancing PLUG
// (Assets = L + E by construction) and opening retained earnings rolls by prior-period net profit.
// No test framework here — just the charts and the articulating-book construction.
import type { PeriodEngineInput } from './types';

export type Lines = {
  revenue: number; cogs: number; opex: number; da: number; finance: number; tax: number; otherIncome: number;
  receivables: number; inventory: number; prepaid: number; otherCA: number;
  ppe: number; intangibles: number; investments: number; otherNCA: number;
  payables: number; statutory: number; accrued: number; stBorrow: number; ltBorrow: number; provisions: number; otherNCL: number;
  shareCapital: number; otherEquity: number; recurring: number | null;
};

export const BASE: Lines = {
  revenue: 300000000, cogs: 120000000, opex: 100000000, da: 10000000, finance: 5000000, tax: 8750000, otherIncome: 0,
  receivables: 200000000, inventory: 100000000, prepaid: 20000000, otherCA: 0,
  ppe: 300000000, intangibles: 0, investments: 0, otherNCA: 0,
  payables: 130000000, statutory: 30000000, accrued: 0, stBorrow: 80000000, ltBorrow: 240000000, provisions: 0, otherNCL: 0,
  shareCapital: 500000000, otherEquity: 0, recurring: 200000000,
};

export const mk = (o: Partial<Lines>): Lines => ({ ...BASE, ...o });

// 16 adversarial scenarios: { name, openingRE for p1, p1 lines, p2 lines }.
export const CASES: { name: string; openingRE: number; p1: Lines; p2: Lines }[] = [
  { name: 'healthy growth', openingRE: 100000000, p1: mk({}), p2: mk({ revenue: 360000000, cogs: 144000000, opex: 110000000 }) },
  { name: 'revenue decline', openingRE: 100000000, p1: mk({}), p2: mk({ revenue: 220000000, cogs: 92000000, opex: 95000000 }) },
  { name: 'loss period (NP<0)', openingRE: 100000000, p1: mk({}), p2: mk({ revenue: 200000000, cogs: 180000000, opex: 60000000, tax: 0 }) },
  { name: 'deep loss', openingRE: 100000000, p1: mk({}), p2: mk({ revenue: 100000000, cogs: 150000000, opex: 80000000, tax: 0 }) },
  { name: 'negative equity', openingRE: -480000000, p1: mk({ shareCapital: 50000000 }), p2: mk({ shareCapital: 50000000, revenue: 150000000, cogs: 140000000, opex: 60000000, tax: 0 }) },
  { name: 'near-zero equity', openingRE: -491000000, p1: mk({ shareCapital: 500000000 }), p2: mk({ shareCapital: 500000000, revenue: 250000000, cogs: 130000000 }) },
  { name: 'high leverage', openingRE: 100000000, p1: mk({}), p2: mk({ stBorrow: 200000000, ltBorrow: 900000000, finance: 30000000 }) },
  { name: 'debt paydown', openingRE: 100000000, p1: mk({}), p2: mk({ stBorrow: 20000000, ltBorrow: 100000000, finance: 2000000 }) },
  { name: 'capital raise', openingRE: 100000000, p1: mk({}), p2: mk({ shareCapital: 900000000 }) },
  { name: 'zero revenue (pre-rev burn)', openingRE: 100000000, p1: mk({}), p2: mk({ revenue: 0, cogs: 0, opex: 60000000, tax: 0, recurring: null }) },
  { name: 'receivables blowout', openingRE: 100000000, p1: mk({}), p2: mk({ receivables: 520000000 }) },
  { name: 'inventory spike', openingRE: 100000000, p1: mk({}), p2: mk({ inventory: 420000000 }) },
  { name: 'payables blowout', openingRE: 100000000, p1: mk({}), p2: mk({ payables: 430000000 }) },
  { name: 'capex heavy', openingRE: 100000000, p1: mk({}), p2: mk({ ppe: 620000000, da: 35000000 }) },
  { name: 'other-income heavy', openingRE: 100000000, p1: mk({}), p2: mk({ otherIncome: 90000000 }) },
  { name: 'missing schedule (MRR n/a)', openingRE: 100000000, p1: mk({ recurring: null }), p2: mk({ recurring: null, revenue: 330000000, cogs: 132000000 }) },
];

/** Build a balanced, articulating period: cash is the PLUG so Assets = L + E; RE rolls by NP. */
export function buildInput(periodId: string, label: string, month: string, openingRE: number, L: Lines): PeriodEngineInput {
  const grossProfit = L.revenue - L.cogs;
  const ebitda = grossProfit - L.opex;
  const ebit = ebitda - L.da;
  const np = ebit + L.otherIncome - L.finance - L.tax;
  const closingRE = openingRE + np;
  const nonCashCA = L.receivables + L.inventory + L.prepaid + L.otherCA;
  const nca = L.ppe + L.intangibles + L.investments + L.otherNCA;
  const totalLiab = L.payables + L.statutory + L.accrued + L.stBorrow + L.ltBorrow + L.provisions + L.otherNCL;
  const totalEquity = L.shareCapital + L.otherEquity + closingRE;
  const cash = totalLiab + totalEquity - nonCashCA - nca; // PLUG → Assets = L + E by construction
  const totalAssets = cash + nonCashCA + nca;
  return {
    periodId, label, periodMonth: month,
    tb: { debitPaise: totalAssets, creditPaise: totalAssets }, // synthetic balanced TB (debits = credits)
    recurringRevenuePaise: L.recurring,
    naturals: {
      operating_revenue: L.revenue, other_income: L.otherIncome, cogs: L.cogs, employee_benefits: L.opex,
      depreciation_amortisation: L.da, finance_costs: L.finance, tax_expense: L.tax,
      cash_bank: cash, trade_receivables: L.receivables, inventory: L.inventory, prepaid_advances: L.prepaid, other_current_assets: L.otherCA,
      ppe: L.ppe, intangibles: L.intangibles, investments: L.investments, other_non_current_assets: L.otherNCA,
      trade_payables: L.payables, statutory_dues: L.statutory, accrued_other_current_liabilities: L.accrued,
      short_term_borrowings: L.stBorrow, long_term_borrowings: L.ltBorrow, provisions: L.provisions, other_non_current_liabilities: L.otherNCL,
      share_capital: L.shareCapital, other_equity: L.otherEquity, reserves_surplus: openingRE,
    },
  };
}

/** Minimal P&L net-profit recompute (to roll RE into p2's opening) — mirrors engine.computePnl. */
export function computeChainNp(p: PeriodEngineInput): number {
  const n = p.naturals;
  const gp = (n.operating_revenue ?? 0) - (n.cogs ?? 0);
  const opex = (n.employee_benefits ?? 0) + (n.rent_utilities ?? 0) + (n.sales_marketing ?? 0) + (n.technology_software ?? 0) + (n.professional_fees ?? 0) + (n.admin_other_opex ?? 0);
  const ebitda = gp - opex;
  const ebit = ebitda - (n.depreciation_amortisation ?? 0);
  return ebit + (n.other_income ?? 0) - (n.finance_costs ?? 0) - (n.tax_expense ?? 0);
}
