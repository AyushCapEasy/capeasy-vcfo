// src/app/clients/[orgId]/page.tsx — workspace home. First action for a new company is "Connect your
// financial data" (the ConnectData on-ramp); once a month exists, it lists the months + lets them add
// the next one. No bare "add period" form — a month is created from the uploaded books' detected dates.
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { monthLabel, taxYearLabel } from '@/lib/intake/period';
import { ConnectData } from './connect-data';

const STATUS_STYLE: Record<string, string> = {
  draft: 'badge-warning',
  reviewed: 'badge-info',
  locked: 'badge-positive',
};

export default async function ClientWorkspace({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: org } = await supabase.from('orgs').select('id, legal_name, entity_type, state').eq('id', orgId).single();
  if (!org) notFound(); // not found OR RLS-denied (cross-tenant)

  const { data: periods } = await supabase
    .from('periods')
    .select('id, period_month, label, status')
    .eq('org_id', orgId)
    .order('period_month', { ascending: false });
  const hasPeriods = (periods ?? []).length > 0;

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="sticky top-0 z-20 flex items-center justify-between gap-4 border-b border-line bg-white/85 px-8 py-4 backdrop-blur">
        <div className="min-w-0">
          <h1 className="font-serif text-[22px] font-semibold leading-tight tracking-[-0.01em] text-ink">Overview</h1>
          <p className="mt-0.5 truncate text-[12.5px] text-muted">
            {org.legal_name}{org.entity_type ? ` · ${org.entity_type}` : ''}{org.state ? ` · ${org.state}` : ''}
          </p>
        </div>
        {hasPeriods ? <Link href={`/clients/${orgId}/mis`} className="btn btn-primary shrink-0">View Financials →</Link> : null}
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-8 py-7">
        {hasPeriods ? (
          <>
            <div>
              <h2 className="text-sm font-semibold text-ink">Your months</h2>
              <p className="mt-0.5 text-[12.5px] text-muted">Each month builds on the last, so you can see the trend.</p>
            </div>
            <ul className="card mt-4 divide-y divide-line overflow-hidden">
              {(periods ?? []).map((p) => (
                <li key={p.id}>
                  <Link href={`/clients/${orgId}/mis?p=${p.id}`} className="flex items-center justify-between px-5 py-3.5 transition-colors hover:bg-canvas">
                    <span className="font-medium text-ink">{p.label ?? monthLabel(p.period_month)}</span>
                    <span className="flex items-center gap-3 text-xs text-muted">
                      <span className="tnum">{taxYearLabel(p.period_month)}</span>
                      <span className={`badge ${STATUS_STYLE[p.status] ?? ''}`}>{p.status}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>

            <div className="mt-9 border-t border-line pt-7">
              <h2 className="text-sm font-semibold text-ink">Add another month</h2>
              <p className="mt-0.5 text-[12.5px] text-muted">Upload the next month&apos;s books to extend your financials.</p>
              <div className="mt-4"><ConnectData orgId={orgId} /></div>
            </div>
          </>
        ) : (
          <div className="py-6"><ConnectData orgId={orgId} /></div>
        )}
      </main>
    </div>
  );
}
