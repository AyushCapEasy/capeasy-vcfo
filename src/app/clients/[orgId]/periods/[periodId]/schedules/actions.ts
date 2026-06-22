'use server';
// src/app/clients/[orgId]/periods/[periodId]/schedules/actions.ts — add/remove supporting-schedule rows.
// Org-scoped by RLS (org_id is also auto-set from the period by a trigger); a row is only inserted if it
// carries real content (empty adds are ignored). Schedules are OPTIONAL — nothing here is required to
// finalise a period.
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { SCHEDULE_BY_TABLE, buildScheduleInsert, scheduleRowHasContent, type ScheduleTable } from '@/lib/schedules/config';

const revalidate = (orgId: string, periodId: string) => revalidatePath(`/clients/${orgId}/periods/${periodId}/schedules`);

export async function addScheduleRow(orgId: string, periodId: string, table: ScheduleTable, formData: FormData): Promise<void> {
  const def = SCHEDULE_BY_TABLE.get(table);
  if (!def) return;

  const row = buildScheduleInsert(def, (n) => String(formData.get(n) ?? ''));
  if (!scheduleRowHasContent(def, row)) return; // ignore an empty submission

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Dynamic table from a validated allowlist; the column set is built by buildScheduleInsert. RLS gates the
  // insert to org members; the period trigger validates org_id matches the period.
  await supabase.from(table).insert({ ...row, period_id: periodId, org_id: orgId } as never);
  revalidate(orgId, periodId);
}

export async function deleteScheduleRow(orgId: string, periodId: string, table: ScheduleTable, formData: FormData): Promise<void> {
  if (!SCHEDULE_BY_TABLE.has(table)) return;
  const id = String(formData.get('id') ?? '');
  if (!id) return;

  const supabase = await createClient();
  await supabase.from(table).delete().eq('id', id); // RLS scopes deletes to the caller's org
  revalidate(orgId, periodId);
}
