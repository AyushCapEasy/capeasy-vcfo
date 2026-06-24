// src/app/clients/[orgId]/forecast/page.tsx — Forecast screen (warm design). Forward projections built
// from the REAL historical results (getMisChain → engine). Everything here is a FORECAST/ESTIMATE,
// visually distinct from actuals and never presented as fact; the SAMPLE watermark + status ribbon come
// from the shared client layout. Honest degradation: <2 periods → "insufficient history", no projection.
import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getMisChain } from '@/lib/engine/mis-data';
import { inr } from '@/lib/mis/present';
import { buildForecast, SCENARIOS, HORIZONS, type ScenarioKey, type Horizon, type MetricForecast, type SeriesPoint } from '@/lib/forecast/forecast';

const SCENARIO_LABEL: Record<ScenarioKey, string> = { pessimistic: 'Pessimistic', base: 'Base', optimistic: 'Optimistic' };

// A FORECAST badge — used everywhere a projected number appears, so nothing looks like an actual.
function EstBadge() {
  return <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wide text-amber-700 ring-1 ring-inset ring-amber-600/20">Forecast · est.</span>;
}

// Bar series: solid = actual, dashed/translucent = forecast, with a divider at the boundary. On the dark
// runway hero, `tone="dark"` switches to mint so the bars read on navy; otherwise navy on light surfaces.
function MiniBars({ history, projection, tone = 'light' }: { history: SeriesPoint[]; projection: SeriesPoint[]; tone?: 'light' | 'dark' }) {
  const all = [...history, ...projection];
  const max = Math.max(...all.map((p) => Math.abs(p.paise)), 1);
  const slot = 26, bw = 16, h = 72, pad = 8;
  const W = Math.max(all.length * slot, slot);
  const actualFill = tone === 'dark' ? '#6EE7B7' : '#0b1f4d';
  const projFill = tone === 'dark' ? 'rgba(110,231,183,0.22)' : 'rgba(11,31,77,0.18)';
  const projStroke = tone === 'dark' ? '#6EE7B7' : '#0b1f4d';
  const divider = tone === 'dark' ? 'rgba(255,255,255,0.28)' : '#d8e0ec';
  return (
    <svg viewBox={`0 0 ${W} ${h}`} preserveAspectRatio="none" className="h-20 w-full" role="img" aria-label="actual then forecast">
      {all.map((p, i) => {
        const bh = Math.max((Math.abs(p.paise) / max) * (h - 2 * pad), 2);
        const x = i * slot + (slot - bw) / 2;
        return (
          <rect key={i} x={x} y={h - pad - bh} width={bw} height={bh} rx={2}
            fill={p.actual ? actualFill : projFill}
            stroke={p.actual ? 'none' : projStroke} strokeWidth={p.actual ? 0 : 1} strokeDasharray={p.actual ? undefined : '3 2'} />
        );
      })}
      {history.length > 0 && projection.length > 0 ? (
        <line x1={history.length * slot} y1={2} x2={history.length * slot} y2={h - 2} stroke={divider} strokeWidth={1} strokeDasharray="2 2" />
      ) : null}
    </svg>
  );
}

// Compact table: last actual (solid) then each projected month (dashed/muted + ~).
function ProjectionTable({ f }: { f: MetricForecast }) {
  const last = f.history[f.history.length - 1];
  return (
    <table className="w-full text-sm">
      <tbody className="divide-y divide-line">
        <tr>
          <td className="py-1.5 text-body">{last.label} <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">actual</span></td>
          <td className="num py-1.5 font-semibold text-ink">{inr(last.paise)}</td>
        </tr>
        {f.projection.map((p) => (
          <tr key={p.periodMonth} className="bg-canvas/40">
            <td className="py-1.5 text-muted">{p.label} <span className="text-[10px] font-medium italic text-amber-700">est.</span></td>
            <td className="num py-1.5 italic text-body" style={{ textDecoration: 'underline dashed', textUnderlineOffset: '3px', textDecorationColor: '#94a3b8' }}>~{inr(p.paise)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Card({ title, badge, basis, children }: { title: string; badge?: boolean; basis?: string; children: React.ReactNode }) {
  return (
    <section className="card p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        {badge ? <EstBadge /> : null}
      </div>
      {basis ? <p className="mt-1 text-[12px] text-muted">{basis}</p> : null}
      <div className="mt-3">{children}</div>
    </section>
  );
}

export default async function ForecastPage({ params, searchParams }: { params: Promise<{ orgId: string }>; searchParams: Promise<{ scenario?: string; h?: string }> }) {
  const { orgId } = await params;
  const sp = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const chain = await getMisChain(orgId);
  if (!chain) notFound();

  const scenario: ScenarioKey = (SCENARIOS as string[]).includes(sp.scenario ?? '') ? (sp.scenario as ScenarioKey) : 'base';
  const horizon: Horizon = (HORIZONS as number[]).includes(Number(sp.h)) ? (Number(sp.h) as Horizon) : 6;
  const f = buildForecast(chain.results, { scenario, horizon });

  const base = `/clients/${orgId}/forecast`;
  const sHref = (s: ScenarioKey) => `${base}?scenario=${s}&h=${horizon}`;
  const hHref = (hz: Horizon) => `${base}?scenario=${scenario}&h=${hz}`;
  const runway = f.runway;

  return (
    <div className="flex min-h-full flex-1 flex-col bg-canvas">
      <header className="sticky top-0 z-20 border-b border-line bg-white/85 px-8 py-4 backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-serif text-[22px] font-semibold leading-tight tracking-[-0.01em] text-ink">Forecast</h1>
            <p className="mt-0.5 text-[12.5px] text-muted">{chain.org.legalName} · projected from {f.quality.periods} period{f.quality.periods === 1 ? '' : 's'} of real history · <span className="font-semibold text-amber-700">FORECAST — not actual</span></p>
          </div>
          <span className="rounded-md bg-amber-50 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-amber-700 ring-1 ring-inset ring-amber-600/20">Estimate</span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 space-y-5 px-8 py-7">
        {chain.results.length === 0 ? (
          <div className="card p-8 text-center">
            <p className="text-sm font-semibold text-ink">No months yet</p>
            <p className="mx-auto mt-1.5 max-w-md text-[13px] text-muted">Connect your books to add a month, then add a second — a forecast needs at least two months of real history.</p>
            <Link href={`/clients/${orgId}`} className="mt-4 inline-block text-sm font-medium text-primary hover:underline">← Connect your books</Link>
          </div>
        ) : !f.quality.sufficient ? (
          // HONEST DEGRADATION — one period: say so, show actuals, invent nothing.
          <div className="card border-l-4 border-l-amber-400 p-6">
            <p className="text-sm font-semibold text-ink">Insufficient history for a reliable forecast</p>
            <p className="mt-1.5 text-[13px] leading-relaxed text-body">{f.quality.note}</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-line bg-canvas p-3.5">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted">Latest operating revenue</p>
                <p className="num mt-1 text-lg font-semibold text-ink">{inr(chain.results[0].pnl.operatingRevenuePaise)}</p>
              </div>
              <div className="rounded-lg border border-line bg-canvas p-3.5">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted">Cash on hand</p>
                <p className="num mt-1 text-lg font-semibold text-ink">{inr(chain.results[0].balanceSheet.cashPaise)}</p>
              </div>
            </div>
            <p className="mt-4 text-[12px] text-muted">No trend is invented from a single point. Load a second period and the projection appears here.</p>
          </div>
        ) : (
          <>
            {/* Controls — scenario + horizon (server-rendered query toggles) */}
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">Scenario</span>
                <nav className="flex gap-1 rounded-[var(--radius-ctl)] bg-hair/70 p-0.5">
                  {SCENARIOS.map((s) => (
                    <Link key={s} href={sHref(s)} className={`pill ${s === scenario ? 'pill-active shadow-sm' : 'pill-idle'}`}>{SCENARIO_LABEL[s]}</Link>
                  ))}
                </nav>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">Horizon</span>
                <nav className="flex gap-1 rounded-[var(--radius-ctl)] bg-hair/70 p-0.5">
                  {HORIZONS.map((hz) => (
                    <Link key={hz} href={hHref(hz)} className={`pill ${hz === horizon ? 'pill-active shadow-sm' : 'pill-idle'}`}>{hz} mo</Link>
                  ))}
                </nav>
              </div>
              {!f.quality.scenarioSpread && scenario !== 'base' ? (
                <span className="text-[11.5px] text-amber-700">Scenario spread needs ≥3 periods — showing base.</span>
              ) : null}
            </div>

            {/* Assumptions banner — every lever surfaced */}
            <div className="rounded-lg border border-line bg-primary-50/50 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">Assumptions ({SCENARIO_LABEL[scenario].toLowerCase()}, {horizon}-month horizon)</p>
              <ul className="mt-2 space-y-1 text-[12.5px] leading-relaxed text-body">
                {f.assumptions.map((a, i) => <li key={i} className="flex gap-1.5"><span className="text-muted">·</span>{a}</li>)}
              </ul>
              <p className="mt-2 text-[11.5px] text-muted">Confidence: {f.quality.confidence} ({f.quality.periods} periods). {f.quality.note}</p>
            </div>

            {/* Runway — THE number for a pre-profit startup */}
            {runway ? (
              // Runway is THE number for a pre-profit startup — given the Meridian gradient-hero treatment.
              <section className="relative overflow-hidden rounded-[var(--radius-card)] p-5 text-white shadow-[0_12px_30px_rgba(11,31,77,0.22)]" style={{ background: 'linear-gradient(135deg,#047857 0%,#065F46 55%,#0B1F4D 100%)' }}>
                <div aria-hidden className="pointer-events-none absolute -right-12 -top-12 h-56 w-56" style={{ background: 'radial-gradient(circle, rgba(16,185,129,0.30), transparent 70%)' }} />
                <div className="relative">
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-mint">Cash runway</h2>
                    <span className="rounded bg-white/15 px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wide text-white ring-1 ring-inset ring-white/25">Forecast · est.</span>
                  </div>
                  <div className="mt-3 grid gap-4 sm:grid-cols-3">
                    <div>
                      <p className="text-[11px] font-medium uppercase tracking-wide text-white/60">Runway at current burn</p>
                      <p className="mt-1 text-3xl font-bold tracking-tight text-white">{runway.burning ? `${runway.runwayMonths!.toFixed(1)} mo` : '—'}</p>
                      <p className="mt-1 text-[11.5px] text-white/70">{runway.burning ? `cash reaches zero ≈ ${runway.zeroMonthLabel}` : 'not burning at the current trend'}</p>
                    </div>
                    <div>
                      <p className="text-[11px] font-medium uppercase tracking-wide text-white/60">Cash on hand</p>
                      <p className="num mt-1 text-lg font-semibold text-white">{inr(runway.currentCashPaise)}</p>
                      <p className="mt-2 text-[11px] font-medium uppercase tracking-wide text-white/60">Monthly burn (observed)</p>
                      <p className="num mt-1 text-lg font-semibold text-white">{runway.monthlyBurnPaise !== null && runway.monthlyBurnPaise > 0 ? inr(runway.monthlyBurnPaise) : '—'}</p>
                    </div>
                    <div>
                      <p className="text-[11px] font-medium uppercase tracking-wide text-white/60">Projected cash ({SCENARIO_LABEL[scenario].toLowerCase()})</p>
                      <div className="mt-1"><MiniBars tone="dark" history={[{ label: 'now', periodMonth: '', paise: runway.currentCashPaise, actual: true }]} projection={runway.trajectory.map((t) => ({ ...t, paise: Math.max(0, t.paise) }))} /></div>
                      {runway.reachesProfitability ? <p className="mt-1 text-[11.5px] text-mint">scenario turns cash-flow positive within the horizon</p> : null}
                    </div>
                  </div>
                  <p className="mt-3 border-t border-white/15 pt-2.5 text-[11.5px] text-white/70">{runway.basis}</p>
                </div>
              </section>
            ) : null}

            {/* Revenue forecast */}
            {f.revenue ? (
              <Card title="Revenue forecast" badge basis={f.revenue.basis}>
                <div className="mb-3"><MiniBars history={f.revenue.history} projection={f.revenue.projection} /></div>
                <ProjectionTable f={f.revenue} />
              </Card>
            ) : null}

            {/* Cost forecast */}
            <Card title="Cost & expense forecast" badge basis="Each major cost line projected on its own historical growth — independent of the revenue scenario.">
              <div className="grid gap-5 sm:grid-cols-2">
                {f.costs.filter((c) => c.metric !== 'Total costs').map((c) => (
                  <div key={c.metric}>
                    <p className="text-[12.5px] font-semibold text-ink">{c.metric}</p>
                    <p className="mb-1 text-[11.5px] text-muted">{c.basis}</p>
                    <ProjectionTable f={c} />
                  </div>
                ))}
              </div>
            </Card>

            {/* Net profit / burn forecast */}
            {f.netProfit ? (
              <Card title="Net profit / (burn) forecast" badge basis={f.netProfit.basis}>
                <ProjectionTable f={f.netProfit} />
              </Card>
            ) : null}

            <p className="pb-2 text-center text-[11.5px] text-muted">Projections are estimates built on historical trend, not actuals — they will differ from real results and carry no assurance. Round figures reflect deliberate low precision.</p>
          </>
        )}
      </main>
    </div>
  );
}
