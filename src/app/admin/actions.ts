'use server';
// src/app/admin/actions.ts — superadmin approval action. Flips a pending org to active via the
// SECURITY DEFINER approve_org() RPC (which itself enforces superadmin), then sends the approval email
// via the existing Resend module. The flip ALWAYS happens if authorized; the email is best-effort and
// only a real send when Resend is configured in THIS runtime env (Vercel prod needs EMAIL_PROVIDER=resend
// + RESEND_API_KEY) — otherwise the org is still approved and we report "email pending".
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { isSuperadmin, approveOrgRpc } from '@/lib/admin/rpc';
import { readEmailConfig, sendApprovalEmail } from '@/lib/email';

export type ApproveState = { ok: boolean; message: string };

export async function approveOrg(_prev: ApproveState, formData: FormData): Promise<ApproveState> {
  const orgId = String(formData.get('orgId') ?? '');
  if (!orgId) return { ok: false, message: 'Missing org id.' };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: 'Not signed in.' };
  // Defense in depth — the RPC also enforces this in the DB.
  if (!(await isSuperadmin(supabase))) return { ok: false, message: 'Not authorized.' };

  const { row, error } = await approveOrgRpc(supabase, orgId);
  if (error) return { ok: false, message: `Approval failed: ${error}` };
  if (!row) return { ok: false, message: 'Org not found (or already active).' };

  // Email is best-effort; the approval has already succeeded at the DB layer.
  const cfg = readEmailConfig();
  if (cfg.provider !== 'resend') {
    return { ok: true, message: `Approved “${row.org_name}” ✓ — workspace is now active. Email pending: set EMAIL_PROVIDER=resend + RESEND_API_KEY in the Vercel production env to send the approval email.` };
  }
  if (!row.owner_email) {
    return { ok: true, message: `Approved “${row.org_name}” ✓ — active. No owner email on file, so no email was sent.` };
  }
  const h = await headers();
  const host = h.get('host') ?? '';
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  const loginUrl = `${proto}://${host}/login`;
  const res = await sendApprovalEmail(row.owner_email, row.org_name, loginUrl);
  return res.ok
    ? { ok: true, message: `Approved “${row.org_name}” ✓ — active · approval email sent to ${row.owner_email}.` }
    : { ok: true, message: `Approved “${row.org_name}” ✓ — active, but the approval email failed to send: ${res.error}` };
}
