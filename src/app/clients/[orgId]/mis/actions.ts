'use server';
// Save the editable analyst commentary for a period (Bible §5A). RLS gates write to org members.
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

export type CommentaryState = { saved: boolean };

export async function saveCommentary(orgId: string, periodId: string, _prev: CommentaryState, formData: FormData): Promise<CommentaryState> {
  const commentary = String(formData.get('commentary') ?? '').slice(0, 8000);
  const supabase = await createClient();
  await supabase.from('periods').update({ commentary }).eq('id', periodId);
  try {
    await supabase.from('audit_log').insert({ org_id: orgId, action: 'mis.commentary', target_table: 'periods', target_id: periodId });
  } catch {
    // non-critical
  }
  revalidatePath(`/clients/${orgId}/mis`);
  return { saved: true };
}
