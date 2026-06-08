// src/lib/intake/server-data.ts — server-only intake data loader. Reads everything through the
// RLS-scoped server client (the authenticated user), then runs the §3.3 gate. The server actions
// are thin wrappers over the same parse/validate libs, so the gate the analyst sees is the same
// code the tests exercise.
import { createClient } from '@/lib/supabase/server';
import { validateTb, type ContinuityInput } from './validate';
import { suggestCategories, type Suggestion } from './fuzzy';
import { parseGrid } from './parse';
import type { CategoryMeta, ParsedTbRow, ValidationReport, ParseResult, ColumnOverride } from './types';

/** Load the staged (uploaded-but-not-committed) file for a period and re-derive its preview. */
export async function getStagingPreview(periodId: string): Promise<{ filename: string | null; preview: ParseResult } | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('tb_upload_staging')
    .select('filename, raw_grid, column_override, accepted_flips')
    .eq('period_id', periodId)
    .single();
  if (!data) return null;
  const preview = parseGrid(data.raw_grid as unknown as string[][], {
    override: (data.column_override as ColumnOverride | null) ?? undefined,
    acceptedFlips: Array.isArray(data.accepted_flips) ? (data.accepted_flips as number[]) : [],
  });
  return { filename: data.filename, preview };
}

export type IntakeAccount = {
  code: string;
  name: string;
  mappedCategoryCode: string | null;
  debitPaise: number;
  creditPaise: number;
  suggestions: Suggestion[];
};

export type CategoryOption = { id: string; code: string; name: string; group: string };

export type PeriodIntake = {
  period: {
    id: string;
    orgId: string;
    month: string;
    label: string | null;
    status: string;
    taxYear: string;
    priorPeriodId: string | null;
  };
  categoryOptions: CategoryOption[];
  accounts: IntakeAccount[];
  hasTb: boolean;
  report: ValidationReport | null;
};

export async function getPeriodIntake(periodId: string): Promise<PeriodIntake | null> {
  const supabase = await createClient();

  const { data: period } = await supabase
    .from('periods')
    .select('id, org_id, period_month, label, status, tax_year, prior_period_id')
    .eq('id', periodId)
    .single();
  if (!period) return null; // not found OR RLS-denied — both render as "not found"

  const [{ data: catRows }, { data: mapRows }, { data: tbRows }] = await Promise.all([
    supabase.from('account_categories').select('id, code, name, group, statement, normal_balance, sort_order').order('sort_order'),
    supabase.from('account_mappings').select('source_account_code, category_id').eq('org_id', period.org_id),
    supabase.from('trial_balance_lines').select('source_account_code, source_account_name, debit_amount, credit_amount').eq('period_id', periodId),
  ]);

  const cats = catRows ?? [];
  const categories: CategoryMeta[] = cats.map((c) => ({
    code: c.code, name: c.name, group: c.group, statement: c.statement, normal_balance: c.normal_balance,
  }));
  const categoryOptions: CategoryOption[] = cats.map((c) => ({ id: c.id, code: c.code, name: c.name, group: c.group }));
  const categoryMeta = new Map(categories.map((c) => [c.code, c]));
  const idToCode = new Map(cats.map((c) => [c.id, c.code]));

  const mappingByCode = new Map<string, string | null>();
  for (const m of mapRows ?? []) mappingByCode.set(m.source_account_code, idToCode.get(m.category_id) ?? null);

  const rows: ParsedTbRow[] = (tbRows ?? []).map((t, i) => ({
    rowNumber: i + 1,
    accountCode: t.source_account_code,
    accountName: t.source_account_name ?? t.source_account_code,
    debitPaise: Number(t.debit_amount),
    creditPaise: Number(t.credit_amount),
  }));

  // Distinct source accounts (sum duplicate lines), with fuzzy suggestions where unmapped.
  const accMap = new Map<string, { name: string; debit: number; credit: number }>();
  for (const t of tbRows ?? []) {
    const cur = accMap.get(t.source_account_code) ?? { name: t.source_account_name ?? t.source_account_code, debit: 0, credit: 0 };
    cur.debit += Number(t.debit_amount);
    cur.credit += Number(t.credit_amount);
    accMap.set(t.source_account_code, cur);
  }
  const accounts: IntakeAccount[] = [...accMap].map(([code, v]) => {
    const mapped = mappingByCode.get(code) ?? null;
    return {
      code,
      name: v.name,
      mappedCategoryCode: mapped,
      debitPaise: v.debit,
      creditPaise: v.credit,
      suggestions: mapped ? [] : suggestCategories({ code, name: v.name }, categories),
    };
  });

  const hasTb = (tbRows ?? []).length > 0;

  let priorMonth: string | null = null;
  let priorExists = false;
  if (period.prior_period_id) {
    const { data: prior } = await supabase.from('periods').select('period_month').eq('id', period.prior_period_id).single();
    if (prior) {
      priorExists = true;
      priorMonth = prior.period_month;
    }
  }
  const continuity: ContinuityInput = {
    isFirstPeriod: !period.prior_period_id,
    priorExists,
    priorMonth,
    thisMonth: period.period_month,
  };

  const report = hasTb ? validateTb({ rows, mappingByCode, categoryMeta, continuity }) : null;

  return {
    period: {
      id: period.id,
      orgId: period.org_id,
      month: period.period_month,
      label: period.label,
      status: period.status,
      taxYear: period.tax_year,
      priorPeriodId: period.prior_period_id,
    },
    categoryOptions,
    accounts,
    hasTb,
    report,
  };
}
