// src/app/pending/page.tsx — "workspace pending approval" screen. A self-serve org starts pending and
// reaches NO data (enforced in RLS + the client-workspace layout redirect). The owner waits here until
// an admin (ayush@) approves it; they're emailed when it goes active. Auth-gated; shows no client data.
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { signOut } from '../actions';

export default async function PendingPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Members can read their OWN org rows (status visible) — but not the data behind them (RLS).
  const { data: orgs } = await supabase.from('orgs').select('legal_name, status').order('legal_name');
  const pending = (orgs ?? []).filter((o) => o.status === 'pending_approval');
  // An approved user (or one with no org) has no business here — send them on.
  if (!pending.length) redirect('/');
  const name = pending[0]?.legal_name;

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-[12px] shadow-[0_6px_18px_rgba(4,120,87,0.35)]" style={{ background: 'linear-gradient(135deg,#10B981 0%,#047857 60%,#065F46 100%)' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M4 19V5M4 19l5-5 4 3 7-8M20 6v4M20 6h-4" stroke="#fff" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </div>
          <p className="eyebrow tracking-[0.2em]">CapEasy</p>
          <h1 className="mt-1.5 text-2xl font-bold text-ink">Workspace pending approval</h1>
        </div>
        <div className="card p-6 text-center shadow-md">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-amber-700 ring-1 ring-inset ring-amber-600/20">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> Pending review
          </span>
          <p className="mt-4 text-sm leading-relaxed text-body">
            Your workspace{name ? <> <strong className="text-ink">{name}</strong></> : null} has been created and is awaiting approval. We&apos;ll email <strong className="text-ink">{user.email}</strong> the moment it&apos;s active — then you can sign in and start building your MIS pack.
          </p>
          <p className="mt-3 text-[12.5px] text-muted">No workspace data is accessible until approval. This usually doesn&apos;t take long.</p>
        </div>
        <div className="mt-5 text-center">
          <form action={signOut}>
            <button type="submit" className="text-xs font-medium text-muted hover:text-body hover:underline">Sign out</button>
          </form>
        </div>
      </div>
    </main>
  );
}
