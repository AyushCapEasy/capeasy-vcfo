// src/app/admin/page.tsx — superadmin console: approve pending workspaces. DOUBLE-GATED:
// (1) app layer — a non-superadmin gets notFound() (404, not a hidden link); (2) DB layer — the
// admin RPCs each enforce is_superadmin(), so even a direct call returns nothing. Reads pending orgs
// cross-tenant via the SECURITY DEFINER admin_list_pending_orgs(); normal tenant RLS is unchanged.
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { isSuperadmin, listPendingOrgs } from '@/lib/admin/rpc';
import { readEmailConfig } from '@/lib/email';
import { ApproveButton } from './approve-button';
import { signOut } from '../actions';

export default async function AdminPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  if (!(await isSuperadmin(supabase))) notFound();

  const pending = await listPendingOrgs(supabase);
  const emailConfigured = readEmailConfig().provider === 'resend';
  const fmtDate = (s: string) => new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

  return (
    <div className="flex min-h-full flex-1 flex-col bg-canvas">
      <header className="sticky top-0 z-20 flex items-center justify-between gap-4 border-b border-line bg-white/85 px-8 py-4 backdrop-blur">
        <div className="flex items-center gap-2.5">
          <div className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[8px]" style={{ background: 'linear-gradient(135deg,#10B981 0%,#047857 60%,#065F46 100%)' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M4 19V5M4 19l5-5 4 3 7-8M20 6v4M20 6h-4" stroke="#fff" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </div>
          <div>
            <h1 className="font-serif text-[19px] font-semibold leading-tight tracking-[-0.01em] text-ink">Admin · Workspace approvals</h1>
            <p className="text-[12px] text-muted">{user.email} · superadmin</p>
          </div>
        </div>
        <form action={signOut}><button type="submit" className="btn btn-secondary px-3 py-1.5 text-xs">Sign out</button></form>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 space-y-5 px-8 py-7">
        {!emailConfigured ? (
          <div className="rounded-lg border border-amber-300/60 bg-amber-50 p-4 text-[12.5px] leading-relaxed text-amber-800">
            <span className="font-semibold">Approval email not configured in this environment.</span> Approving will still activate the
            workspace, but no email is sent until <code className="rounded bg-white/70 px-1 py-0.5">EMAIL_PROVIDER=resend</code> and{' '}
            <code className="rounded bg-white/70 px-1 py-0.5">RESEND_API_KEY</code> are set in the Vercel <strong>production</strong> environment.
          </div>
        ) : null}

        <div>
          <h2 className="text-sm font-semibold text-ink">Pending approval</h2>
          <p className="mt-0.5 text-[12.5px] text-muted">{pending.length ? `${pending.length} workspace${pending.length === 1 ? '' : 's'} awaiting approval.` : 'No workspaces are awaiting approval.'}</p>
        </div>

        {pending.length ? (
          <ul className="card divide-y divide-line overflow-hidden">
            {pending.map((o) => (
              <li key={o.id} className="flex items-center justify-between gap-4 px-5 py-4">
                <div className="min-w-0">
                  <p className="font-semibold text-ink">{o.legal_name}</p>
                  <p className="mt-0.5 text-[12.5px] text-muted">
                    {o.owner_email ?? 'owner email unknown'}
                    {o.entity_type ? ` · ${o.entity_type}` : ''}{o.state ? ` · ${o.state}` : ''} · created {fmtDate(o.created_at)}
                  </p>
                </div>
                <div className="shrink-0"><ApproveButton orgId={o.id} /></div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="card p-10 text-center text-sm text-muted">Nothing to approve right now.</div>
        )}
      </main>
    </div>
  );
}
