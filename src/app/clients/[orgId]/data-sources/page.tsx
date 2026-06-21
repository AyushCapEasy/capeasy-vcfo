// src/app/clients/[orgId]/data-sources/page.tsx — Data Sources screen (redesign, final screen).
// Shows the REAL connector state over the existing logic — NOTHING simulated. Zoho = the firm's own
// sales-side connector (D-014), state read from env via readZohoConfig (no secrets shown). Tally =
// per-client accrual export upload (Route C), processed in-memory, no live connection / no stored sync.
// The SAMPLE watermark + status ribbon come from the shared client layout.
import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { readZohoConfig } from '@/lib/zoho/config';

type ZohoStatus = 'connected' | 'auth_incomplete' | 'not_configured';
function readZohoStatus(): { status: ZohoStatus; dc?: string; orgSet?: boolean } {
  try {
    const c = readZohoConfig();
    if (c.refreshToken && c.orgId) return { status: 'connected', dc: c.dc, orgSet: true };
    return { status: 'auth_incomplete', dc: c.dc, orgSet: !!c.orgId };
  } catch {
    return { status: 'not_configured' };
  }
}

function StatusPill({ dotCls, textCls, label }: { dotCls: string; textCls: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold">
      <span className={`h-[9px] w-[9px] rounded-full ring-[3px] ${dotCls}`} aria-hidden />
      <span className={textCls}>{label}</span>
    </span>
  );
}

function Logo({ text, bg }: { text: string; bg: string }) {
  return <div className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-lg text-[13px] font-bold text-white" style={{ background: bg }}>{text}</div>;
}

const ZOHO_COPY: Record<ZohoStatus, { pill: React.ReactNode; body: React.ReactNode }> = {
  connected: {
    pill: <StatusPill dotCls="bg-positive ring-positive/20" textCls="text-positive" label="Connected" />,
    body: <>Own-firm Zoho Books org is configured (client credentials + OAuth refresh token + organisation). The sales-side pull is <strong className="text-ink">read-only</strong> and runs via the connector — invoices / receivables only, never a full P&amp;L/BS.</>,
  },
  auth_incomplete: {
    pill: <StatusPill dotCls="bg-amber-500 ring-amber-500/20" textCls="text-amber-700" label="Auth incomplete" />,
    body: <>Client credentials are present, but the OAuth refresh token / organisation isn&apos;t set yet. Complete the Self-Client grant (the <code className="rounded bg-canvas px-1 py-0.5 text-[11px] text-body">zoho:auth</code> step) to finish connecting.</>,
  },
  not_configured: {
    pill: <StatusPill dotCls="bg-faint ring-line" textCls="text-muted" label="Not configured" />,
    body: <>Not configured. Add the Zoho credentials to the gitignored <code className="rounded bg-canvas px-1 py-0.5 text-[11px] text-body">.env.local</code> and complete OAuth. Firm-level connector (D-014) — this is the firm&apos;s own books, not the client&apos;s.</>,
  },
};

export default async function DataSourcesPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: org } = await supabase.from('orgs').select('legal_name').eq('id', orgId).single();
  if (!org) notFound();

  const zoho = readZohoStatus();

  return (
    <div className="flex min-h-full flex-1 flex-col bg-canvas">
      <header className="sticky top-0 z-20 border-b border-line bg-white/85 px-8 py-4 backdrop-blur">
        <h1 className="font-serif text-[22px] font-semibold leading-tight tracking-[-0.01em] text-ink">Data Sources</h1>
        <p className="mt-0.5 text-[12.5px] text-muted">{org.legal_name} · accrual sources & reconciliation overlays · status reflects the actual configuration</p>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 space-y-5 px-8 py-7">
        <div className="grid gap-4 md:grid-cols-3">
          {/* Tally — accrual source of truth (per-client export upload) */}
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
              <p>Export the Trial Balance / Day Book (XML) and upload it — reconstructed <strong className="text-ink">in-memory</strong> (D-014), never persisted. No live connection, so there is no stored &ldquo;last sync&rdquo;.</p>
              <Link href={`/clients/${orgId}`} className="mt-3 inline-block text-[12.5px] font-medium text-primary hover:underline">Upload within a period →</Link>
            </div>
          </article>

          {/* Zoho — own-firm sales-side connector (real config state) */}
          <article className="card p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Logo text="Zo" bg="#C8202F" />
                <div>
                  <div className="text-[14.5px] font-semibold text-ink">Zoho Books</div>
                  <div className="text-[11.5px] text-muted">Own-firm sales · OAuth{zoho.dc ? ` · zoho.${zoho.dc}` : ''}</div>
                </div>
              </div>
              {ZOHO_COPY[zoho.status].pill}
            </div>
            <div className="mt-4 border-t border-line pt-3.5 text-[12.5px] text-body">
              <p>{ZOHO_COPY[zoho.status].body}</p>
              <p className="mt-2 text-[11.5px] text-muted">Last pull: not recorded — pulls run on demand, read-only. No secrets are shown here.</p>
            </div>
          </article>

          {/* Planned overlays */}
          <article className="card flex flex-col items-center justify-center gap-2 border-dashed p-5 text-center text-muted">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
            <span className="text-[13px] font-semibold text-body">More sources</span>
            <span className="text-[11px]">Bank · GST — reconciliation overlays</span>
            <span className="badge badge-neutral mt-1">Planned</span>
          </article>
        </div>

        {/* Honest data-sourcing model — no fabricated metrics */}
        <div className="card p-5">
          <p className="text-sm font-semibold text-ink">How the sources combine</p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-body">
            <strong className="text-ink">Tally is the accrual source of truth</strong> — the full chart of accounts with closing balances, the only source that gives a complete P&amp;L and balance sheet. The own-firm Zoho pull and, later, bank + GST are <strong className="text-ink">reconciliation overlays</strong>: they check against Tally&apos;s numbers, never replace them. Real client data is read <strong className="text-ink">in-memory only and never persisted here</strong> (D-014); the SAMPLE watermark stays on every screen and export until the one-time CA sign-off.
          </p>
        </div>

        <p className="pb-2 text-center text-xs text-muted">Connector status above reflects the actual configuration — no connection or sync is simulated.</p>
      </main>
    </div>
  );
}
