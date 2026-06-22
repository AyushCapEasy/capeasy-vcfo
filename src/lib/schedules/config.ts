// src/lib/schedules/config.ts — declarative spec for the 7 supporting schedules.
// All are OPTIONAL: a period works on the trial balance alone; a schedule, when
// added, UNLOCKS the dimension named in `unlocks` (honest degradation — when absent we prompt "add X",
// never fabricate it). Shared by the capture page (render), the server actions (validate + build rows),
// and the unit test (the pure rupee→paise builder). Not a 'use server' module, so it can export data.

export type FieldKind = 'text' | 'money' | 'int' | 'rate' | 'bool' | 'select';
export type ScheduleField = { name: string; label: string; kind: FieldKind; options?: string[] };
export type ScheduleDef = {
  table: ScheduleTable;
  label: string;
  unlocks: string;       // what capturing this schedule unlocks — shown as the honest "add X to see Y" prompt
  primaryField: string;  // the row's identifying field (required to add a row; also the list label)
  fields: ScheduleField[];
};

export type ScheduleTable =
  | 'schedule_revenue_detail' | 'schedule_headcount' | 'schedule_ar_aging' | 'schedule_ap_aging'
  | 'schedule_cash_balances' | 'schedule_capex' | 'schedule_debt';

export const SCHEDULES: ScheduleDef[] = [
  {
    table: 'schedule_revenue_detail', label: 'Revenue detail (recurring vs one-time)', unlocks: 'MRR & ARR', primaryField: 'segment',
    fields: [
      { name: 'segment', label: 'Segment', kind: 'text' },
      { name: 'customer_name', label: 'Customer', kind: 'text' },
      { name: 'amount', label: 'Amount (₹)', kind: 'money' },
      { name: 'is_recurring', label: 'Recurring', kind: 'bool' },
    ],
  },
  {
    table: 'schedule_headcount', label: 'Headcount', unlocks: 'per-employee metrics (revenue / cost per head)', primaryField: 'department',
    fields: [
      { name: 'department', label: 'Department', kind: 'text' },
      { name: 'headcount', label: 'Headcount', kind: 'int' },
    ],
  },
  {
    table: 'schedule_ar_aging', label: 'Receivables (AR) aging', unlocks: 'overdue-receivables analysis', primaryField: 'customer_name',
    fields: [
      { name: 'customer_name', label: 'Customer', kind: 'text' },
      { name: 'current_0_30', label: '0–30d (₹)', kind: 'money' },
      { name: 'days_31_60', label: '31–60d (₹)', kind: 'money' },
      { name: 'days_61_90', label: '61–90d (₹)', kind: 'money' },
      { name: 'days_90_plus', label: '90d+ (₹)', kind: 'money' },
    ],
  },
  {
    table: 'schedule_ap_aging', label: 'Payables (AP) aging', unlocks: 'overdue-payables analysis', primaryField: 'vendor_name',
    fields: [
      { name: 'vendor_name', label: 'Vendor', kind: 'text' },
      { name: 'current_0_30', label: '0–30d (₹)', kind: 'money' },
      { name: 'days_31_60', label: '31–60d (₹)', kind: 'money' },
      { name: 'days_61_90', label: '61–90d (₹)', kind: 'money' },
      { name: 'days_90_plus', label: '90d+ (₹)', kind: 'money' },
    ],
  },
  {
    table: 'schedule_cash_balances', label: 'Cash by bank', unlocks: 'cash position split by bank', primaryField: 'bank_name',
    fields: [
      { name: 'bank_name', label: 'Bank', kind: 'text' },
      { name: 'balance', label: 'Balance (₹)', kind: 'money' },
    ],
  },
  {
    table: 'schedule_capex', label: 'Capex', unlocks: 'capex detail in the cash-flow view', primaryField: 'description',
    fields: [
      { name: 'description', label: 'Description', kind: 'text' },
      { name: 'amount', label: 'Amount (₹)', kind: 'money' },
    ],
  },
  {
    table: 'schedule_debt', label: 'Debt', unlocks: 'debt-servicing (DSCR) view', primaryField: 'lender',
    fields: [
      { name: 'lender', label: 'Lender', kind: 'text' },
      { name: 'kind', label: 'Kind', kind: 'select', options: ['short_term', 'long_term'] },
      { name: 'principal_outstanding', label: 'Principal (₹)', kind: 'money' },
      { name: 'interest_rate', label: 'Rate %', kind: 'rate' },
    ],
  },
];

export const SCHEDULE_BY_TABLE = new Map(SCHEDULES.map((s) => [s.table, s]));

const toPaise = (v: string): number => {
  const n = Number(v.replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};
const toInt = (v: string): number => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : 0;
};
const toRate = (v: string): number | null => {
  const n = Number(v);
  return v.trim() !== '' && Number.isFinite(n) ? n : null;
};

/** Build a DB insert row from submitted string values (money → paise). Pure; unit-tested. */
export function buildScheduleInsert(def: ScheduleDef, get: (name: string) => string): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  for (const f of def.fields) {
    const raw = (get(f.name) ?? '').trim();
    if (f.kind === 'text') row[f.name] = raw || null;
    else if (f.kind === 'money') row[f.name] = toPaise(raw);
    else if (f.kind === 'int') row[f.name] = toInt(raw);
    else if (f.kind === 'rate') row[f.name] = toRate(raw);
    else if (f.kind === 'bool') row[f.name] = raw === 'on' || raw === 'true';
    else if (f.kind === 'select') row[f.name] = f.options?.includes(raw) ? raw : null;
  }
  return row;
}

/** A submitted row is "real" only if it carries its identifier or a positive number — empty adds are ignored. */
export function scheduleRowHasContent(def: ScheduleDef, row: Record<string, unknown>): boolean {
  if (typeof row[def.primaryField] === 'string' && (row[def.primaryField] as string).trim()) return true;
  return def.fields.some((f) => (f.kind === 'money' || f.kind === 'int') && Number(row[f.name]) > 0);
}
