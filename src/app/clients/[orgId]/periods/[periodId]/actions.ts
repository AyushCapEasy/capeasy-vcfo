'use server';
// Intake server actions for one period. Upload STAGES the raw file (no intake data is written);
// the analyst must CONFIRM how it was read before it is committed to trial_balance_lines
// (Bible §8.5 — no silent transforms). Reassign lets them correct the column mapping first.
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { readFileToGrid, parseGrid } from '@/lib/intake/parse';
import { getPeriodIntake } from '@/lib/intake/server-data';
import { COLUMN_ROLES, type ColumnOverride } from '@/lib/intake/types';

export type UploadState = { ok: boolean; errors?: { message: string; detail?: string }[] };

const revalidate = (orgId: string, periodId: string) => revalidatePath(`/clients/${orgId}/periods/${periodId}`);

// 1) Upload → STAGE only. Garbage/unreadable files are blocked here (never staged).
export async function uploadTb(orgId: string, periodId: string, _prev: UploadState, formData: FormData): Promise<UploadState> {
  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) return { ok: false, errors: [{ message: 'Choose a CSV or XLSX file to upload.' }] };

  const grid = readFileToGrid({ buffer: Buffer.from(await file.arrayBuffer()), filename: file.name });
  if (!grid.ok) return { ok: false, errors: grid.errors.map((e) => ({ message: e.message, detail: e.detail })) };

  // Pre-check column detection so an unrecognised layout is blocked before staging.
  const preview = parseGrid(grid.grid);
  if (!preview.ok) return { ok: false, errors: preview.errors.map((e) => ({ message: e.message, detail: e.detail })) };

  const supabase = await createClient();
  await supabase.from('tb_upload_staging').delete().eq('period_id', periodId);
  const { error } = await supabase.from('tb_upload_staging').insert({
    period_id: periodId,
    org_id: orgId,
    filename: file.name,
    raw_grid: grid.grid,
    column_override: null,
  });
  if (error) return { ok: false, errors: [{ message: 'Could not stage the file.', detail: error.message }] };

  try {
    await supabase.from('audit_log').insert({ org_id: orgId, action: 'tb.stage', target_table: 'periods', target_id: periodId, detail: { file: file.name, rows: preview.rows.length } });
  } catch {
    // non-critical
  }
  revalidate(orgId, periodId);
  return { ok: true };
}

// 2a) Accept / undo a per-row debit↔credit flip proposal (an accounting decision; default off).
export async function setFlip(orgId: string, periodId: string, formData: FormData): Promise<void> {
  const row = Number(formData.get('row'));
  const accept = formData.get('accept') === '1';
  if (!Number.isInteger(row)) return;

  const supabase = await createClient();
  const { data } = await supabase.from('tb_upload_staging').select('accepted_flips').eq('period_id', periodId).single();
  const current: number[] = Array.isArray(data?.accepted_flips) ? (data!.accepted_flips as number[]) : [];
  const next = accept ? Array.from(new Set([...current, row])) : current.filter((r) => r !== row);
  await supabase.from('tb_upload_staging').update({ accepted_flips: next }).eq('period_id', periodId);
  revalidate(orgId, periodId);
}

// 2) Re-assign which source column feeds each role, then re-read the staged grid.
export async function reassignColumns(orgId: string, periodId: string, formData: FormData): Promise<void> {
  const override: ColumnOverride = {};
  for (const role of COLUMN_ROLES) {
    const raw = formData.get(`col_${role}`);
    const idx = Number(raw);
    if (raw !== null && raw !== '' && Number.isInteger(idx) && idx >= 0) override[role] = idx;
  }
  const supabase = await createClient();
  await supabase.from('tb_upload_staging').update({ column_override: override }).eq('period_id', periodId);
  revalidate(orgId, periodId);
}

// 3) CONFIRM → commit the approved read to trial_balance_lines. Re-parses the staged grid
//    server-side (never trusts client numbers) and records the approved adjustments in the audit log.
export async function confirmTb(orgId: string, periodId: string): Promise<void> {
  const supabase = await createClient();
  const { data: staging } = await supabase
    .from('tb_upload_staging')
    .select('raw_grid, column_override, accepted_flips, filename')
    .eq('period_id', periodId)
    .single();
  if (!staging) return;

  const acceptedFlips = Array.isArray(staging.accepted_flips) ? (staging.accepted_flips as number[]) : [];
  const preview = parseGrid(staging.raw_grid as unknown as string[][], {
    override: (staging.column_override as ColumnOverride | null) ?? undefined,
    acceptedFlips,
  });
  if (!preview.ok) return; // should not happen (validated at upload); leave staging for re-review

  await supabase.from('trial_balance_lines').delete().eq('period_id', periodId);
  const payload = preview.rows.map((r) => ({
    period_id: periodId,
    org_id: orgId,
    source_account_code: r.accountCode,
    source_account_name: r.accountName,
    debit_amount: r.debitPaise,
    credit_amount: r.creditPaise,
  }));
  const { error } = await supabase.from('trial_balance_lines').insert(payload);
  if (error) return;

  await supabase.from('tb_upload_staging').delete().eq('period_id', periodId);
  try {
    await supabase.from('audit_log').insert({
      org_id: orgId,
      action: 'tb.upload',
      target_table: 'periods',
      target_id: periodId,
      detail: {
        file: staging.filename,
        rows: payload.length,
        proposals: preview.proposals.length,
        flips_accepted: acceptedFlips.length,
        skipped: preview.skipped.length,
        columns: Object.fromEntries(COLUMN_ROLES.map((r) => [r, preview.columns[r].header])),
      },
    });
  } catch {
    // non-critical
  }
  revalidate(orgId, periodId);
}

// 4) Cancel → discard the staged upload (nothing was committed).
export async function cancelTb(orgId: string, periodId: string): Promise<void> {
  const supabase = await createClient();
  await supabase.from('tb_upload_staging').delete().eq('period_id', periodId);
  revalidate(orgId, periodId);
}

export async function saveMapping(orgId: string, periodId: string, formData: FormData): Promise<void> {
  const code = String(formData.get('code') ?? '');
  const name = String(formData.get('name') ?? '');
  const categoryId = String(formData.get('categoryId') ?? '');
  if (!code || !categoryId) return;

  const supabase = await createClient();
  await supabase.from('account_mappings').upsert(
    { org_id: orgId, source_account_code: code, source_account_name: name, category_id: categoryId },
    { onConflict: 'org_id,source_account_code' }
  );
  try {
    await supabase.from('audit_log').insert({ org_id: orgId, action: 'mapping.set', detail: { code, category_id: categoryId } });
  } catch {
    // non-critical
  }
  revalidate(orgId, periodId);
}

export async function finalizePeriod(orgId: string, periodId: string, formData: FormData): Promise<void> {
  const status = String(formData.get('status') ?? '') as 'draft' | 'reviewed' | 'locked';
  if (!(['draft', 'reviewed', 'locked'] as const).includes(status)) return;

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
  revalidate(orgId, periodId);
}
