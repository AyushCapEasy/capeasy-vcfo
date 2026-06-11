// src/lib/zoho/sales.ts — derive the SALES-SIDE picture from a Zoho pull. This is NOT a P&L/BS — Zoho
// holds only invoices/quotes/payments/customers (no cost side), so this is the revenue + receivables
// view only, to be labelled "sales-side only — not a complete MIS" wherever shown. Pure + deterministic
// (takes an explicit asOf date so it never depends on the wall clock). Amounts are Zoho-native (₹ major
// units, not paise) — kept as-is for the sales summary; conversion to the engine's paise is a later step.
import type { SalesSidePull } from './client';

export type AgeingBucket = { bucket: string; count: number; amount: number };
export type SalesSummary = {
  currency: string | null;
  invoices: { count: number; totalInvoiced: number; totalOutstanding: number };
  estimatesCount: number;
  customers: { count: number; totalReceivable: number };
  payments: { count: number; totalCollected: number };
  ageing: AgeingBucket[];
  topReceivables: { customer: string; amount: number }[];
};

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const daysBetween = (a: Date, b: Date) => Math.floor((a.getTime() - b.getTime()) / 86_400_000);

export function summarizeSales(pull: SalesSidePull, asOfISO: string): SalesSummary {
  const asOf = new Date(asOfISO);
  const inv = pull.invoices;
  const open = inv.filter((i) => (i.balance ?? 0) > 0 && i.due_date);

  const defs: { bucket: string; test: (d: number) => boolean }[] = [
    { bucket: 'not due / current', test: (d) => d <= 0 },
    { bucket: '1–30 days', test: (d) => d >= 1 && d <= 30 },
    { bucket: '31–60 days', test: (d) => d >= 31 && d <= 60 },
    { bucket: '61–90 days', test: (d) => d >= 61 && d <= 90 },
    { bucket: '90+ days', test: (d) => d > 90 },
  ];
  const ageing: AgeingBucket[] = defs.map((b) => {
    const rows = open.filter((i) => b.test(daysBetween(asOf, new Date(i.due_date as string))));
    return { bucket: b.bucket, count: rows.length, amount: sum(rows.map((i) => i.balance ?? 0)) };
  });

  const topReceivables = [...pull.customers]
    .filter((c) => (c.outstanding_receivable_amount ?? 0) > 0)
    .sort((a, b) => (b.outstanding_receivable_amount ?? 0) - (a.outstanding_receivable_amount ?? 0))
    .slice(0, 10)
    .map((c) => ({ customer: c.contact_name, amount: c.outstanding_receivable_amount ?? 0 }));

  return {
    currency: pull.org?.currency_code ?? null,
    invoices: {
      count: inv.length,
      totalInvoiced: sum(inv.map((i) => i.total ?? 0)),
      totalOutstanding: sum(inv.map((i) => i.balance ?? 0)),
    },
    estimatesCount: pull.estimates.length,
    customers: { count: pull.customers.length, totalReceivable: sum(pull.customers.map((c) => c.outstanding_receivable_amount ?? 0)) },
    payments: { count: pull.payments.length, totalCollected: sum(pull.payments.map((p) => p.amount ?? 0)) },
    ageing,
    topReceivables,
  };
}
