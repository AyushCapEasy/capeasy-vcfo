'use server';
// src/app/onboarding/actions.ts — first-run "create your workspace". The signed-in user creates their own
// org; created_by = themselves, so the add_org_creator_as_admin trigger makes them its admin and RLS then
// scopes everything to that org. We supply the id so we can redirect without an RLS-RETURNING round-trip
// (membership only exists after the AFTER-INSERT trigger). This is how a real self-serve user gets an org.
import { randomUUID } from 'node:crypto';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

const ENTITY_TYPES = ['pvt_ltd', 'llp', 'proprietorship', 'partnership', 'opc', 'other'] as const;
type EntityType = (typeof ENTITY_TYPES)[number];

export type CreateOrgState = { error: string | null };

export async function createOrg(_prev: CreateOrgState, formData: FormData): Promise<CreateOrgState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const legalName = String(formData.get('legal_name') ?? '').trim();
  const entityType = String(formData.get('entity_type') ?? '');
  const stateInput = String(formData.get('state') ?? '').trim();
  const gstInput = String(formData.get('gst_scheme') ?? '');
  if (!legalName) return { error: 'Company name is required.' };
  if (!ENTITY_TYPES.includes(entityType as EntityType)) return { error: 'Choose an entity type.' };
  const gstScheme = gstInput === 'monthly' || gstInput === 'qrmp' ? gstInput : null;

  const id = randomUUID();
  const { error } = await supabase.from('orgs').insert({
    id,
    legal_name: legalName,
    entity_type: entityType as EntityType,
    state: stateInput || null,
    gst_scheme: gstScheme,
    created_by: user.id, // RLS insert with-check: created_by = auth.uid(); trigger → creator becomes admin
  });
  if (error) return { error: error.message };

  try {
    await supabase.from('audit_log').insert({ org_id: id, action: 'org.create', target_table: 'orgs', target_id: id, actor_id: user.id, detail: { legal_name: legalName } });
  } catch {
    // non-critical
  }

  redirect(`/clients/${id}`);
}
