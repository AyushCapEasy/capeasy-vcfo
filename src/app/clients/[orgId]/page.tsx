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
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center gap-2 px-6 py-3.5 text-sm">
          <Link href="/" className="text-slate-400 hover:text-slate-600 hover:underline">CapEasy vCFO</Link>
          <span className="text-slate-300">/</span>
          <span className="font-semibold text-slate-900">{org.legal_name}</span>
          <Link href={`/clients/${orgId}/mis`} className="btn btn-primary ml-auto px-3 py-1.5 text-xs">
            View MIS pack →
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 p-6">
        <h1 className="text-xl font-bold text-slate-900">Periods</h1>
        <p className="mt-1 text-sm text-slate-500">
          {org.entity_type}{org.state ? ` · ${org.state}` : ''} — period-over-period is first-class; each new month chains to the last.
        </p>

        <ul className="card mt-5 divide-y divide-slate-100 overflow-hidden">
          {(periods ?? []).map((p) => (
            <li key={p.id}>
              <Link href={`/clients/${orgId}/periods/${p.id}`} className="flex items-center justify-between px-5 py-3.5 hover:bg-slate-50">
                <span className="font-medium text-slate-900">{p.label ?? monthLabel(p.period_month)}</span>
                <span className="flex items-center gap-3 text-xs text-slate-400">
                  <span className="tnum">{taxYearLabel(p.period_month)}</span>
                  <span className={`badge ${STATUS_STYLE[p.status] ?? ''}`}>{p.status}</span>
                </span>
              </Link>
            </li>
          ))}
          {!periods?.length ? <li className="px-5 py-8 text-center text-sm text-slate-400">No periods yet — add the first one below.</li> : null}
        </ul>

        <form action={createPeriod.bind(null, orgId)} className="mt-6 flex items-end gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="label">New period (month)</span>
            <input type="month" name="month" required className="input w-auto" />
          </label>
          <button type="submit" className="btn btn-primary">
            Add period
          </button>
        </form>
      </main>
    </div>
  );
}
