// src/lib/engine/mis-data.ts — server-only loader that feeds the MIS view from the SAME pure engine
// (engine once, views many). It assembles each period's category naturals from the RLS-scoped TB,
// runs computeChain, and returns the results + period chain. The view renders these numbers verbatim
// and NEVER recomputes a metric (Bible §8.1). All values remain UNVERIFIED until CA sign-off.
import { createClient } from '@/lib/supabase/server';
import { computeChain } from './engine';
import type { PeriodEngineInput, PeriodResult } from './types';

export type MisPeriodMeta = { id: string; label: string; periodMonth: string; status: string; commentary: string | null };
export type MisChain = {
  org: { id: string; legalName: string };
  periods: MisPeriodMeta[];
  results: PeriodResult[]; // index-aligned with `periods`
};

export async function getMisChain(orgId: string): Promise<MisChain | null> {
  const supabase = await createClient();
  const { data: org } = await supabase.from('orgs').select('id, legal_name').eq('id', orgId).single();
  if (!org) return null;

  const { data: periods } = await supabase
    .from('periods')
    .select('id, period_month, label, status, commentary')
    .eq('org_id', orgId)
    .order('period_month');
  if (!periods?.length) return { org: { id: org.id, legalName: org.legal_name }, periods: [], results: [] };

  const { data: cats } = await supabase.from('account_categories').select('id, code, normal_balance');
  const idToCode = new Map((cats ?? []).map((c) => [c.id, c.code]));
  const codeNormal = new Map((cats ?? []).map((c) => [c.code, c.normal_balance]));
  const { data: maps } = await supabase.from('account_mappings').select('source_account_code, category_id').eq('org_id', orgId);
  const codeToCat = new Map((maps ?? []).map((m) => [m.source_account_code, idToCode.get(m.category_id)]));

  const inputs: PeriodEngineInput[] = [];
  for (const p of periods) {
    const { data: tb } = await supabase
      .from('trial_balance_lines')
      .select('source_account_code, debit_amount, credit_amount')
      .eq('period_id', p.id);
    const naturals: Record<string, number> = {};
    let dr = 0;
    let cr = 0;
    for (const l of tb ?? []) {
      const d = Number(l.debit_amount);
      const c = Number(l.credit_amount);
      dr += d;
      cr += c;
      const cat = codeToCat.get(l.source_account_code);
      if (!cat) continue;
      const nb = codeNormal.get(cat);
      naturals[cat] = (naturals[cat] ?? 0) + (nb === 'debit' ? d - c : c - d);
    }
    const { data: rec } = await supabase.from('schedule_revenue_detail').select('amount, is_recurring').eq('period_id', p.id);
    const recurring = (rec ?? []).filter((r) => r.is_recurring).reduce((s, r) => s + Number(r.amount), 0);
    inputs.push({
      periodId: p.id,
      label: p.label ?? p.period_month,
      periodMonth: p.period_month,
      naturals,
      tb: { debitPaise: dr, creditPaise: cr },
      recurringRevenuePaise: recurring || null,
    });
  }

  return {
    org: { id: org.id, legalName: org.legal_name },
    periods: periods.map((p) => ({ id: p.id, label: p.label ?? p.period_month, periodMonth: p.period_month, status: p.status, commentary: p.commentary ?? null })),
    results: computeChain(inputs),
  };
}

export type DrilldownLine = { code: string; name: string; debitPaise: number; creditPaise: number };

/** Mapped source accounts grouped by canonical category code — powers headline → line → accounts. */
export async function getPeriodDrilldown(periodId: string): Promise<Record<string, DrilldownLine[]>> {
  const supabase = await createClient();
  const { data: period } = await supabase.from('periods').select('org_id').eq('id', periodId).single();
  if (!period) return {};

  const { data: cats } = await supabase.from('account_categories').select('id, code');
  const idToCode = new Map((cats ?? []).map((c) => [c.id, c.code]));
  const { data: maps } = await supabase.from('account_mappings').select('source_account_code, category_id').eq('org_id', period.org_id);
  const codeToCat = new Map((maps ?? []).map((m) => [m.source_account_code, idToCode.get(m.category_id)]));
  const { data: tb } = await supabase
    .from('trial_balance_lines')
    .select('source_account_code, source_account_name, debit_amount, credit_amount')
    .eq('period_id', periodId);

  const out: Record<string, DrilldownLine[]> = {};
  for (const l of tb ?? []) {
    const cat = codeToCat.get(l.source_account_code);
    if (!cat) continue;
    (out[cat] ??= []).push({
      code: l.source_account_code,
      name: l.source_account_name ?? l.source_account_code,
      debitPaise: Number(l.debit_amount),
      creditPaise: Number(l.credit_amount),
    });
  }
  return out;
}
