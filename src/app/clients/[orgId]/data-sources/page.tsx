// src/app/clients/[orgId]/data-sources/page.tsx — Data Sources (tenant view). Tally is the accrual
// source you upload today; Zoho Books and Bank/GST are honestly marked "Coming soon" — no dead links,
// no fake config, no operator/dev language. Bank/GST cross-checks can already be run manually on the
// Reconcile screen, so that card links there.
import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

function StatusPill({ dotCls, textCls, label }: { dotCls: string; textCls: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold">
      <span className={`h-[9px] w-[9px] rounded-full ring-[3px] ${dotCls}`} aria-hidden />
      <span className={textCls}>{label}</span>
    </span>
  );
}
const ComingSoon = () => <StatusPill dotCls="bg-faint ring-line" textCls="text-muted" label="Coming soon" />;

function Logo({ text, bg }: { text: string; bg: string }) {
  return <div className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-lg text-[13px] font-bold text-white" style={{ background: bg }}>{text}</div>;
}

export default async function DataSourcesPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: org } = await supabase.from('orgs').select('legal_name').eq('id', orgId).single();
  if (!org) notFound();

  return (
    <div className="flex min-h-full flex-1 flex-col bg-canvas">
      <header className="sticky top-0 z-20 border-b border-line bg-white/85 px-8 py-4 backdrop-blur">
        <h1 className="font-serif text-[22px] font-semibold leading-tight tracking-[-0.01em] text-ink">Your Data</h1>
        <p className="mt-0.5 text-[12.5px] text-muted">{org.legal_name} · where your numbers come from — Tally today, more sources coming</p>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 space-y-5 px-8 py-7">
        <div className="grid gap-4 md:grid-cols-3">
          {/* Tally — the accrual source you upload today (real, working) */}
          <article className="card p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Logo text="Ty" bg="#1A3A6B" />
                <div>
                  <div className="text-[14.5px] font-semibold text-ink">Tally Prime</div>
                  <div className="text-[11.5px] text-muted">Accrual source · export upload</div>
                </div>
              </div>
              <StatusPill dotCls="bg-amber-500 ring-amber-500/20" textCls="text-amber-700" label="Manual upload" />
            </div>
            <div className="mt-4 border-t border-line pt-3.5 text-[12.5px] text-body">
              <p>Export your Trial Balance / Day Book (XML) from Tally and upload it inside a period. It&apos;s read <strong className="text-ink">in memory only</strong> and never stored — so there&apos;s no live connection or stored sync.</p>
              <Link href={`/clients/${orgId}`} className="mt-3 inline-block text-[12.5px] font-medium text-primary hover:underline">Upload within a period →</Link>
            </div>
          </article>

          {/* Zoho Books — Coming soon: honest, non-actionable (no config path) */}
          <article className="card p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Logo text="Zo" bg="#C8202F" />
                <div>
                  <div className="text-[14.5px] font-semibold text-ink">Zoho Books</div>
                  <div className="text-[11.5px] text-muted">Automatic sales sync</div>
                </div>
              </div>
              <ComingSoon />
            </div>
            <div className="mt-4 border-t border-line pt-3.5 text-[12.5px] text-body">
              <p>Direct Zoho Books sync isn&apos;t available yet. For now, upload your Tally export within a period — we&apos;ll add Zoho Books as a connected source soon.</p>
            </div>
          </article>

          {/* Bank & GST — Coming soon for auto-connect; manual cross-check already exists on Reconcile */}
          <article className="card p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-lg bg-hair text-muted">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18M5 10h14M5 10V7l7-4 7 4v3M7 10v8M12 10v8M17 10v8" /></svg>
                </div>
                <div>
                  <div className="text-[14.5px] font-semibold text-ink">Bank &amp; GST</div>
                  <div className="text-[11.5px] text-muted">Reconciliation overlays</div>
                </div>
              </div>
              <ComingSoon />
            </div>
            <div className="mt-4 border-t border-line pt-3.5 text-[12.5px] text-body">
              <p>Automatic bank and GST connections are on the way. You can already run a one-off bank/GST cross-check today by uploading files on the Reconcile screen.</p>
              <Link href={`/clients/${orgId}/reconcile`} className="mt-3 inline-block text-[12.5px] font-medium text-primary hover:underline">Go to Reconcile →</Link>
            </div>
          </article>
        </div>

        {/* How your data is used — tenant-friendly, no internal refs */}
        <div className="card p-5">
          <p className="text-sm font-semibold text-ink">How your data is used</p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-body">
            <strong className="text-ink">Tally is your source of truth</strong> — your full chart of accounts with closing balances, the only source that produces a complete P&amp;L and balance sheet. Bank and GST cross-checks (on the Reconcile screen) compare against your books to surface gaps — they never replace your numbers. Your data is read <strong className="text-ink">in memory only and is never stored here</strong>.
          </p>
        </div>

        <p className="pb-2 text-center text-xs text-muted">Sources reflect what&apos;s available today — nothing is simulated.</p>
      </main>
    </div>
  );
}
