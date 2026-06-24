// scripts/approve-org.mts — ADMIN: list pending orgs and approve one (flip pending_approval → active),
// then email the org owner via the existing Resend module. Service-role only: the key lives in the
// gitignored .env.local, so only the operator (ayush@) can run this — there is no public approval path.
//
//   npm run org:approve -- --list          list every org awaiting approval (id · name · owner · age)
//   npm run org:approve -- <orgId>          approve that org + email its owner that the workspace is live
//
// APP_URL (optional, in .env.local) sets the login link in the email; defaults to the prod domain.
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { parseEnv, ENV_PATH, PROJECT_REF } from './_env.mjs';
import { sendApprovalEmail } from '../src/lib/email/index';

const env = parseEnv(readFileSync(ENV_PATH, 'utf8'));
// Surface .env.local to the email module's readEmailConfig + force a live send for this admin action.
Object.assign(process.env, env, { EMAIL_PROVIDER: 'resend' });

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !url.includes(PROJECT_REF)) { console.error(`BLOCKED — NEXT_PUBLIC_SUPABASE_URL missing or not project ${PROJECT_REF}.`); process.exit(1); }
if (!serviceKey || /REPLACE_/.test(serviceKey)) { console.error('BLOCKED — SUPABASE_SERVICE_ROLE_KEY missing in .env.local.'); process.exit(1); }

const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
const loginUrl = (env.APP_URL || 'https://capeasy-vcfo.vercel.app').replace(/\/+$/, '') + '/login';

async function emailFor(userId: string | null): Promise<string | null> {
  if (!userId) return null;
  const { data } = await admin.from('profiles').select('email').eq('id', userId).single();
  return data?.email ?? null;
}

async function listPending(): Promise<void> {
  const { data, error } = await admin
    .from('orgs')
    .select('id, legal_name, created_by, created_at')
    .eq('status', 'pending_approval')
    .order('created_at', { ascending: true });
  if (error) { console.error('Query failed:', error.message); process.exit(1); }
  if (!data?.length) { console.log('No orgs are awaiting approval.'); return; }
  console.log(`Pending approval (${data.length}):\n`);
  for (const o of data) {
    const owner = (await emailFor(o.created_by)) ?? '(unknown owner)';
    console.log(`  ${o.id}  ${o.legal_name}`);
    console.log(`      owner: ${owner}   created: ${o.created_at}`);
  }
  console.log(`\nApprove one with:  npm run org:approve -- <orgId>`);
}

async function approve(orgId: string): Promise<void> {
  const { data: org, error } = await admin.from('orgs').select('id, legal_name, status, created_by').eq('id', orgId).single();
  if (error || !org) { console.error(`Org ${orgId} not found.`); process.exit(1); }
  if (org.status === 'active') { console.log(`Org "${org.legal_name}" is already active — nothing to do.`); return; }

  const { error: upErr } = await admin.from('orgs').update({ status: 'active' }).eq('id', orgId);
  if (upErr) { console.error('Approval (status update) failed:', upErr.message); process.exit(1); }
  console.log(`✓ Approved: "${org.legal_name}" (${orgId}) is now ACTIVE.`);

  // Audit (service_role insert; system actor). Append-only — non-critical if it fails.
  try {
    await admin.from('audit_log').insert({ org_id: orgId, action: 'org.approve', target_table: 'orgs', target_id: orgId, detail: { legal_name: org.legal_name, via: 'approve-org.mts' } });
  } catch { /* non-critical */ }

  const to = await emailFor(org.created_by);
  if (!to) { console.warn('⚠ Owner email not found — workspace is active, but no approval email was sent.'); return; }
  const res = await sendApprovalEmail(to, org.legal_name, loginUrl);
  if (res.ok) console.log(`✓ Approval email sent to ${to} (${res.provider} id ${res.id}).`);
  else console.warn(`⚠ Workspace is active, but the approval email FAILED to send to ${to}: ${res.error}`);
}

const args = process.argv.slice(2).filter((a) => a.trim());
const orgArg = args.find((a) => !a.startsWith('-'));
if (args.includes('--list') || !orgArg) {
  await listPending();
} else {
  await approve(orgArg);
}
