'use server';
// Period creation for a client. The new period is chained to the org's latest existing period
// (prior_period_id is first-class, Bible §3.5) — never fabricated.
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { taxYearLabel, monthLabel } from '@/lib/intake/period';

export async function createPeriod(orgId: string, formData: FormData): Promise<void> {
  const month = String(formData.get('month') ?? ''); // 'YYYY-MM' from <input type=month>
  if (!/^\d{4}-\d{2}$/.test(month)) return;
  const periodMonth = `${month}-01`;

  const supabase = await createClient();
  const { data: latest } = await supabase
    .from('periods')
    .select('id, period_month')
    .eq('org_id', orgId)
    .order('period_month', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: created, error } = await supabase
    .from('periods')
    .insert({
      org_id: orgId,
      period_month: periodMonth,
      tax_year: taxYearLabel(periodMonth),
      label: monthLabel(periodMonth),
      prior_period_id: latest?.id ?? null,
      status: 'draft',
    })
    .select('id')
    .single();
  if (error || !created) return; // e.g. unique(org_id, period_month) — silently ignore dup for v1

  try {
    await supabase.from('audit_log').insert({ org_id: orgId, action: 'period.create', target_table: 'periods', target_id: created.id, detail: { period_month: periodMonth } });
  } catch {
    // non-critical
  }
  redirect(`/clients/${orgId}/periods/${created.id}`);
}
