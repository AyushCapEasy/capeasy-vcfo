'use server';
// Intake server actions for one period: upload TB, persist a mapping (auto-applied next period),
// and finalise (status change is BLOCKED unless the §3.3 gate passes — re-checked server-side).
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { parseTb } from '@/lib/intake/parse';
import { getPeriodIntake } from '@/lib/intake/server-data';

export type UploadState = {
  ok: boolean;
  errors?: { message: string; detail?: string }[];
  inserted?: number;
  warnings?: string[];
};

export async function uploadTb(orgId: string, periodId: string, _prev: UploadState, formData: FormData): Promise<UploadState> {
  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, errors: [{ message: 'Choose a CSV or XLSX file to upload.' }] };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const parsed = parseTb({ buffer, filename: file.name });
  if (!parsed.ok) {
    return { ok: false, errors: parsed.errors.map((e) => ({ message: e.message, detail: e.detail })) };
  }

  const supabase = await createClient();
  // Replace any prior upload for this period (re-upload is idempotent).
  await supabase.from('trial_balance_lines').delete().eq('period_id', periodId);
  const payload = parsed.rows.map((r) => ({
    period_id: periodId,
    org_id: orgId,
    source_account_code: r.accountCode,
    source_account_name: r.accountName,
    debit_amount: r.debitPaise,
    credit_amount: r.creditPaise,
  }));
  const { error } = await supabase.from('trial_balance_lines').insert(payload);
  if (error) return { ok: false, errors: [{ message: 'Could not save the trial balance.', detail: error.message }] };

  try {
    await supabase.from('audit_log').insert({ org_id: orgId, action: 'tb.upload', target_table: 'periods', target_id: periodId, detail: { rows: payload.length, file: file.name } });
  } catch {
    // non-critical
  }
  revalidatePath(`/clients/${orgId}/periods/${periodId}`);
  return { ok: true, inserted: payload.length, warnings: parsed.warnings };
}

export async function saveMapping(orgId: string, periodId: string, formData: FormData): Promise<void> {
  const code = String(formData.get('code') ?? '');
  const name = String(formData.get('name') ?? '');
  const categoryId = String(formData.get('categoryId') ?? '');
  if (!code || !categoryId) return;

  const supabase = await createClient();
  // Persisted per-org → automatically applied to this and every future period (Bible §3.2).
  await supabase.from('account_mappings').upsert(
    { org_id: orgId, source_account_code: code, source_account_name: name, category_id: categoryId },
    { onConflict: 'org_id,source_account_code' }
  );
  try {
    await supabase.from('audit_log').insert({ org_id: orgId, action: 'mapping.set', detail: { code, category_id: categoryId } });
  } catch {
    // non-critical
  }
  revalidatePath(`/clients/${orgId}/periods/${periodId}`);
}

export async function finalizePeriod(orgId: string, periodId: string, formData: FormData): Promise<void> {
  const status = String(formData.get('status') ?? '') as 'draft' | 'reviewed' | 'locked';
  if (!(['draft', 'reviewed', 'locked'] as const).includes(status)) return;

  // Defense-in-depth: re-run the gate server-side; never let a period move past draft on red.
  if (status === 'reviewed' || status === 'locked') {
    const intake = await getPeriodIntake(periodId);
    if (!intake?.report?.ok) return; // blocked — the page already shows why
  }

  const supabase = await createClient();
  await supabase.from('periods').update({ status }).eq('id', periodId);
  try {
    await supabase.from('audit_log').insert({ org_id: orgId, action: 'period.status', target_table: 'periods', target_id: periodId, detail: { status } });
  } catch {
    // non-critical
  }
  revalidatePath(`/clients/${orgId}/periods/${periodId}`);
}
