// src/app/clients/[orgId]/mis/page.tsx — Management MIS Pack (Bible §5A). Investor-grade view that
// renders ENTIRELY from the M5 engine results (via present.ts) — no metric is recomputed here. Every
// number traces to a PeriodResult field; drill-down opens the mapped source accounts. The SAMPLE
// watermark + status ribbon come from the shared client layout; the insight layer lives on /insights.
import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getMisChain, getPeriodDrilldown, type DrilldownLine } from '@/lib/engine/mis-data';
import {
  pnlRows, bsAssetRows, bsLiabEquityRows, cfRows, ratioCards, kpis, trendSeries, inr, type StmtRow,
} from '@/lib/mis/present';
import { Sparkline } from './sparkline';
import { Commentary } from './commentary';

const STATUS_STYLE: Record<string, string> = {
  draft: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  reviewed: 'bg-blue-50 text-blue-700 ring-blue-600/20',
  locked: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
};

function DeltaChip({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-xs text-muted">— first period</span>;
  const up = pct >= 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${up ? 'text-positive' : 'text-negative'}`}>
      {up ? '▲' : '▼'} {Math.abs(pct).toFixed(1)}% <span className="font-normal text-muted">MoM</span>
    </span>
  );
}

function Section({ title, subtitle, children, right }: { title: string; subtitle?: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section className="card overflow-hidden">
      <div className="panel-head">
        <div className="min-w-0">
          <h2 className="panel-title">{title}</h2>
          {subtitle ? <p className="panel-sub">{subtitle}</p> : null}
        </div>
        {right ? <div className="shrink-0">{right}</div> : null}
      </div>
      {children}
    </section>
  );
}

function StatementBlock({ rows, drilldown }: { rows: StmtRow[]; drilldown: Record<string, DrilldownLine[]> }) {
  return (
    <div className="divide-y divide-line">
      {rows.map((row) => {
        const accounts = (row.codes ?? []).flatMap((c) => drilldown[c] ?? []);
        const amountCls =
          row.kind === 'total' ? 'text-primary font-bold' : row.kind === 'subtotal' ? 'font-semibold text-ink' : (row.paise ?? 0) < 0 ? 'text-muted' : 'text-ink';
        const rowCls = row.kind === 'total' ? 'bg-primary-50 border-t border-line' : row.kind === 'subtotal' ? 'bg-canvas' : '';
        if (accounts.length) {
          return (
            <details key={row.label} className="group">
              <summary className={`grid cursor-pointer list-none grid-cols-[1fr_auto] items-center gap-4 px-5 py-2.5 text-sm hover:bg-canvas/70 ${rowCls}`}>
                <span className="flex items-center gap-1.5 text-body">
                  <svg className="h-3 w-3 text-muted transition-transform group-open:rotate-90" viewBox="0 0 12 12">
                    <path d="M4 2l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.5" />
                  </svg>
                  {row.label}
                </span>
                <span className={`num ${amountCls}`}>{inr(row.paise)}</span>
              </summary>
              <div className="border-t border-line bg-canvas/60 px-5 pt-1.5 pb-2.5 pl-9">
                <table className="w-full text-xs text-muted">
                  <tbody>
                    {accounts.map((a) => (
                      <tr key={a.code}>
                        <td className="py-0.5">{a.code} · {a.name}</td>
                        <td className="num py-0.5 pl-4 text-body">{a.debitPaise ? `${inr(a.debitPaise)} Dr` : `${inr(a.creditPaise)} Cr`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          );
        }
        return (
          <div key={row.label} className={`grid grid-cols-[1fr_auto] items-center gap-4 px-5 py-2.5 text-sm ${rowCls}`}>
            <span className={row.kind ? 'font-medium text-ink' : 'text-body'}>
              {row.label}
              {row.note ? <span className="ml-1 text-xs font-normal text-muted">· {row.note}</span> : null}
            </span>
            <span className={`num ${amountCls}`}>{inr(row.paise)}</span>
          </div>
        );
      })}
    </div>
  );
}

export default async function MisPage({ params, searchParams }: { params: Promise<{ orgId: string }>; searchParams: Promise<{ p?: string }> }) {
  const { orgId } = await params;
  const { p } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const chain = await getMisChain(orgId);
  if (!chain) notFound();

  if (!chain.periods.length) {
    return (
      <main className="mx-auto flex min-h-full max-w-2xl items-center justify-center p-6">
        <div className="card w-full p-10 text-center">
          <p className="text-sm text-muted">No periods yet for <span className="font-medium text-body">{chain.org.legalName}</span>. Add a period and upload a trial balance first.</p>
          <Link href={`/clients/${orgId}`} className="text-primary mt-4 inline-block text-sm font-medium hover:underline">← Back to client</Link>
        </div>
      </main>
    );
  }

  const found = p ? chain.periods.findIndex((pp) => pp.id === p) : -1;
  const selectedIdx = found >= 0 ? found : chain.periods.length - 1;
  const periodMeta = chain.periods[selectedIdx];
  const result = chain.results[selectedIdx];
  const drilldown = await getPeriodDrilldown(periodMeta.id);

  const kpiCards = kpis(chain.results, selectedIdx);
  const cf = cfRows(result);
  const trends = trendSeries(chain.results);

  return (
    <div className="relative min-h-full bg-canvas">
      {/* Header (watermark + status ribbon come from the client-workspace layout). */}
      <header className="border-b border-line bg-white">
        <div className="mx-auto max-w-5xl px-6 py-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="font-serif text-2xl font-semibold tracking-tight text-ink">Management MIS Pack</h1>
              <p className="mt-0.5 text-sm text-muted">
                {chain.org.legalName} · {periodMeta.label}
                <span className={`badge ml-2 ${STATUS_STYLE[periodMeta.status] ?? ''}`}>{periodMeta.status}</span>
              </p>
            </div>
            <div className="flex flex-col items-end gap-2.5">
              <div className="flex gap-2">
                <Link href={`/clients/${orgId}/insights?p=${periodMeta.id}`} className="btn btn-ghost">Insights →</Link>
                <a href={`/clients/${orgId}/mis/pdf?p=${periodMeta.id}`} className="btn btn-primary">Export PDF</a>
                <a href={`/clients/${orgId}/mis/workbook?p=${periodMeta.id}`} className="btn btn-secondary">Download workbook</a>
              </div>
              <nav className="flex gap-1 rounded-[var(--radius-ctl)] bg-hair/70 p-0.5">
                {chain.periods.map((pp) => (
                  <Link key={pp.id} href={`/clients/${orgId}/mis?p=${pp.id}`} className={`pill ${pp.id === periodMeta.id ? 'pill-active shadow-sm' : 'pill-idle'}`}>
                    {pp.label}
                  </Link>
                ))}
              </nav>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-6 py-6">
        {/* KPI strip */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {kpiCards.map((k) => (
            <div key={k.label} className="card p-4">
              <p className="eyebrow">{k.label}</p>
              <p className="tnum mt-1.5 text-2xl font-bold text-ink">{inr(k.paise)}</p>
              <div className="mt-1.5"><DeltaChip pct={k.deltaPct} /></div>
            </div>
          ))}
        </div>

        {/* P&L + Balance Sheet */}
        <div className="grid gap-6 lg:grid-cols-2">
          <Section title="Profit &amp; Loss" subtitle={`${periodMeta.label} · click a line to see mapped accounts`}>
            <StatementBlock rows={pnlRows(result)} drilldown={drilldown} />
          </Section>
          <Section title="Balance Sheet" subtitle="Summary — assets, liabilities &amp; equity">
            <StatementBlock rows={bsAssetRows(result)} drilldown={drilldown} />
            <div className="h-px bg-line" />
            <StatementBlock rows={bsLiabEquityRows(result)} drilldown={drilldown} />
          </Section>
        </div>

        {/* Cash Flow */}
        <Section title="Cash Flow" subtitle="Indirect method · requires a prior period">
          {cf ? (
            <StatementBlock rows={cf} drilldown={drilldown} />
          ) : (
            <p className="px-5 py-8 text-sm text-muted">n/a — needs a prior period (first period in the chain).</p>
          )}
        </Section>

        {/* Ratios */}
        <Section title="Key ratios &amp; working capital" subtitle="§4.2–4.3">
          <div className="grid grid-cols-2 gap-px bg-hair sm:grid-cols-3 lg:grid-cols-4">
            {ratioCards(result).map((c) => (
              <div key={c.label} className="bg-white px-4 py-3.5">
                <p className="text-[11px] font-medium tracking-wide text-muted uppercase">{c.label}</p>
                <p className="tnum mt-1 text-lg font-semibold text-ink">{c.value}</p>
              </div>
            ))}
          </div>
        </Section>

        {/* MoM trend */}
        <Section title="Month-on-month trend" subtitle="Across the seeded period chain">
          <div className="grid gap-6 p-5 sm:grid-cols-3">
            {trends.map((t) => (
              <div key={t.label}>
                <p className="eyebrow">{t.label}</p>
                <div className="mt-2.5"><Sparkline values={t.points.map((pt) => pt.paise)} /></div>
                <div className="mt-2 flex justify-between text-[11px] text-muted">
                  {t.points.map((pt) => (<span key={pt.label}>{pt.label.split(' ')[0]}</span>))}
                </div>
                <p className="tnum mt-1.5 text-base font-semibold text-ink">{inr(t.points[t.points.length - 1].paise)}</p>
              </div>
            ))}
          </div>
        </Section>

        {/* Commentary */}
        <Section title="Analyst commentary" subtitle="Editable · saved to this period">
          <div className="p-5">
            <Commentary orgId={orgId} periodId={periodMeta.id} value={periodMeta.commentary} />
          </div>
        </Section>

        <p className="pb-4 text-center text-xs text-muted">
          Generated by CapEasy vCFO · engine statements <span className="font-semibold">CONSISTENCY-CHECKED</span> (identity battery); insight layer (now on the <Link href={`/clients/${orgId}/insights?p=${periodMeta.id}`} className="font-medium text-primary hover:underline">Insights</Link> tab) + accounting conventions pending one-time CA rule-review — <span className="font-semibold">NOT VERIFIED</span>.
        </p>
      </main>
    </div>
  );
}
