// src/lib/admin/rpc.ts — typed access to the superadmin DB functions (0012). The generated
// database.types.ts omits Postgres functions (Functions: never), so the `rpc` calls are made through a
// single, explicitly-typed shim here (no `any`; the cast is localized to this file). Each underlying
// function enforces is_superadmin() in the DB, so these are safe to expose — a non-superadmin gets
// nothing (empty list / raised error), independent of the app-layer gate.
import type { SupabaseClient } from '@supabase/supabase-js';

export type PendingOrg = {
  id: string;
  legal_name: string;
  entity_type: string;
  state: string | null;
  created_at: string;
  owner_email: string | null;
};
export type ApprovedOrg = { org_id: string; org_name: string; owner_email: string | null };

type RpcResult = { data: unknown; error: { message: string } | null };
type RpcFn = (name: string, args?: Record<string, unknown>) => Promise<RpcResult>;
const asRpc = (c: SupabaseClient): RpcFn => c.rpc.bind(c) as unknown as RpcFn;

/** Is the signed-in caller a superadmin? (reads app_admins via the SECURITY DEFINER function). */
export async function isSuperadmin(client: SupabaseClient): Promise<boolean> {
  const { data } = await asRpc(client)('is_superadmin');
  return data === true;
}

/** Every pending_approval org + owner email, cross-tenant. Returns [] for a non-superadmin. */
export async function listPendingOrgs(client: SupabaseClient): Promise<PendingOrg[]> {
  const { data, error } = await asRpc(client)('admin_list_pending_orgs');
  if (error) return [];
  return (data ?? []) as PendingOrg[];
}

/** Flip a pending org to active (DB-gated to superadmin). Returns the org row, or an error string. */
export async function approveOrgRpc(client: SupabaseClient, orgId: string): Promise<{ row: ApprovedOrg | null; error: string | null }> {
  const { data, error } = await asRpc(client)('approve_org', { p_org: orgId });
  if (error) return { row: null, error: error.message };
  const rows = (data ?? []) as ApprovedOrg[];
  return { row: rows[0] ?? null, error: null };
}
