// src/app/clients/[orgId]/page.tsx — one client workspace: its period chain + create a period.
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { monthLabel, taxYearLabel } from '@/lib/intake/period';
import { createPeriod } from './actions';

const STATUS_STYLE: Record<string, string> = {
  draft: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  reviewed: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  locked: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
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
      <header className="flex items-center gap-2 border-b border-neutral-200 px-6 py-3 text-sm dark:border-neutral-800">
        <Link href="/" className="text-neutral-500 hover:underline">CapEasy vCFO</Link>
        <span className="text-neutral-400">/</span>
        <span className="font-medium">{org.legal_name}</span>
      </header>

      <main className="flex-1 p-6">
        <h1 className="text-lg font-semibold">Periods</h1>
        <p className="mt-1 text-sm text-neutral-500">
          {org.entity_type}{org.state ? ` · ${org.state}` : ''} — period-over-period is first-class; each new month chains to the last.
        </p>

        <ul className="mt-4 divide-y divide-neutral-200 rounded-lg border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
          {(periods ?? []).map((p) => (
            <li key={p.id}>
              <Link href={`/clients/${orgId}/periods/${p.id}`} className="flex items-center justify-between px-4 py-3 hover:bg-neutral-50 dark:hover:bg-neutral-900">
                <span className="font-medium">{p.label ?? monthLabel(p.period_month)}</span>
                <span className="flex items-center gap-3 text-xs text-neutral-500">
                  <span>{taxYearLabel(p.period_month)}</span>
                  <span className={`rounded px-2 py-0.5 font-medium tracking-wide uppercase ${STATUS_STYLE[p.status] ?? ''}`}>{p.status}</span>
                </span>
              </Link>
            </li>
          ))}
          {!periods?.length ? <li className="px-4 py-3 text-sm text-neutral-500">No periods yet — add the first one below.</li> : null}
        </ul>

        <form action={createPeriod.bind(null, orgId)} className="mt-6 flex items-end gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-neutral-700 dark:text-neutral-300">New period (month)</span>
            <input type="month" name="month" required className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100" />
          </label>
          <button type="submit" className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-900">
            Add period
          </button>
        </form>
      </main>
    </div>
  );
}
