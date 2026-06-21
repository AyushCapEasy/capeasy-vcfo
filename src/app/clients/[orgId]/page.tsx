// src/app/clients/[orgId]/page.tsx — one client workspace: its period chain + create a period.
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { monthLabel, taxYearLabel } from '@/lib/intake/period';
import { createPeriod } from './actions';

const STATUS_STYLE: Record<string, string> = {
  draft: 'badge-warning',
  reviewed: 'badge-info',
  locked: 'badge-positive',
};

export default async function ClientWorkspace({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: org } = await supabase.from('orgs').select('id, legal_name, entity_type, state').eq('id', orgId).single();
  if (!org) notFound(); // not found OR RLS-denied (cross-tenant)

  const { data: periods } = await supabase
    .from('periods')
    .select('id, period_month, label, status')
    .eq('org_id', orgId)
    .order('period_month', { ascending: false });

  return (
    <div className="flex min-h-full flex-1 flex-col">
      {/* Topbar */}
      <header className="sticky top-0 z-20 flex items-center justify-between gap-4 border-b border-line bg-white/85 px-8 py-4 backdrop-blur">
        <div className="min-w-0">
          <h1 className="font-serif text-[22px] font-semibold leading-tight tracking-[-0.01em] text-ink">Overview</h1>
          <p className="mt-0.5 truncate text-[12.5px] text-muted">
            {org.legal_name}{org.entity_type ? ` · ${org.entity_type}` : ''}{org.state ? ` · ${org.state}` : ''}
          </p>
        </div>
        <Link href={`/clients/${orgId}/mis`} className="btn btn-primary shrink-0">View MIS pack →</Link>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-8 py-7">
        <div>
          <h2 className="text-sm font-semibold text-ink">Reporting periods</h2>
          <p className="mt-0.5 text-[12.5px] text-muted">Period-over-period is first-class — each new month chains to the last.</p>
        </div>

        <ul className="card mt-4 divide-y divide-line overflow-hidden">
          {(periods ?? []).map((p) => (
            <li key={p.id}>
              <Link href={`/clients/${orgId}/periods/${p.id}`} className="flex items-center justify-between px-5 py-3.5 transition-colors hover:bg-canvas">
                <span className="font-medium text-ink">{p.label ?? monthLabel(p.period_month)}</span>
                <span className="flex items-center gap-3 text-xs text-muted">
                  <span className="tnum">{taxYearLabel(p.period_month)}</span>
                  <span className={`badge ${STATUS_STYLE[p.status] ?? ''}`}>{p.status}</span>
                </span>
              </Link>
            </li>
          ))}
          {!periods?.length ? <li className="px-5 py-8 text-center text-sm text-muted">No periods yet — add the first one below.</li> : null}
        </ul>

        <form action={createPeriod.bind(null, orgId)} className="mt-6 flex items-end gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="label">New period (month)</span>
            <input type="month" name="month" required className="input w-auto" />
          </label>
          <button type="submit" className="btn btn-primary">Add period</button>
        </form>
      </main>
    </div>
  );
}
