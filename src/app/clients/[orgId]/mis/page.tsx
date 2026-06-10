// src/app/clients/[orgId]/mis/page.tsx — Management MIS Pack (Bible §5A). Investor-grade view that
// renders ENTIRELY from the M5 engine results (via present.ts) — no metric is recomputed here. Every
// number traces to a PeriodResult field; drill-down opens the mapped source accounts. A persistent
// SAMPLE watermark (single flag in src/lib/watermark.ts) marks the whole pack UNVERIFIED until CA.
import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getMisChain, getPeriodDrilldown, type DrilldownLine } from '@/lib/engine/mis-data';
import {
  pnlRows, bsAssetRows, bsLiabEquityRows, cfRows, ratioCards, kpis, trendSeries, inr, type StmtRow,
} from '@/lib/mis/present';
import { computeObservations, GROUP_CODES, type Observation } from '@/lib/insight/observations';
import { computeDiagnoses, type Diagnosis } from '@/lib/insight/diagnoses';
import { computeRecommendations, computeGoalTracking, type Recommendation, type GoalTrack } from '@/lib/insight/recommendations';
import { Watermark, StatusRibbon } from './watermark';
import { Sparkline } from './sparkline';
import { Commentary } from './commentary';

const STATUS_STYLE: Record<string, string> = {
  draft: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  reviewed: 'bg-blue-50 text-blue-700 ring-blue-600/20',
  locked: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
};

function DeltaChip({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-xs text-slate-400">— first period</span>;
  const up = pct >= 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${up ? 'text-positive' : 'text-negative'}`}>
      {up ? '▲' : '▼'} {Math.abs(pct).toFixed(1)}% <span className="font-normal text-slate-400">MoM</span>
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
    <div className="divide-y divide-slate-100">
      {rows.map((row) => {
        const accounts = (row.codes ?? []).flatMap((c) => drilldown[c] ?? []);
        const amountCls =
          row.kind === 'total' ? 'text-primary font-bold' : row.kind === 'subtotal' ? 'font-semibold text-slate-900' : (row.paise ?? 0) < 0 ? 'text-slate-500' : 'text-slate-800';
        const rowCls = row.kind === 'total' ? 'bg-primary-50 border-t border-slate-200' : row.kind === 'subtotal' ? 'bg-slate-50' : '';
        if (accounts.length) {
          return (
            <details key={row.label} className="group">
              <summary className={`grid cursor-pointer list-none grid-cols-[1fr_auto] items-center gap-4 px-5 py-2.5 text-sm hover:bg-slate-50/70 ${rowCls}`}>
                <span className="flex items-center gap-1.5 text-slate-700">
                  <svg className="h-3 w-3 text-slate-400 transition-transform group-open:rotate-90" viewBox="0 0 12 12">
                    <path d="M4 2l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.5" />
                  </svg>
                  {row.label}
                </span>
                <span className={`num ${amountCls}`}>{inr(row.paise)}</span>
              </summary>
              <div className="border-t border-slate-100 bg-slate-50/60 px-5 pt-1.5 pb-2.5 pl-9">
                <table className="w-full text-xs text-slate-500">
                  <tbody>
                    {accounts.map((a) => (
                      <tr key={a.code}>
                        <td className="py-0.5">{a.code} · {a.name}</td>
                        <td className="num py-0.5 pl-4 text-slate-600">{a.debitPaise ? `${inr(a.debitPaise)} Dr` : `${inr(a.creditPaise)} Cr`}</td>
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
            <span className={row.kind ? 'font-medium text-slate-900' : 'text-slate-700'}>
              {row.label}
              {row.note ? <span className="ml-1 text-xs font-normal text-slate-400">· {row.note}</span> : null}
            </span>
            <span className={`num ${amountCls}`}>{inr(row.paise)}</span>
          </div>
        );
      })}
    </div>
  );
}

// Tier 1 observations (M7) into the selected period, with reuse of the existing by-code drill-down.
function ObservationsBlock({ observations, drilldown }: { observations: Observation[]; drilldown: Record<string, DrilldownLine[]> }) {
  if (!observations.length) {
    return <p className="px-5 py-8 text-sm text-slate-400">No period-over-period move cleared the notability thresholds for this period (or it is the first period). Nothing is fabricated — honest silence.</p>;
  }
  return (
    <div className="divide-y divide-slate-100">
      {observations.map((o) => {
        const codes = [...new Set(o.traces.flatMap((t) => t.categoryGroups).flatMap((g) => GROUP_CODES[g]))];
        const accounts = codes.flatMap((c) => drilldown[c] ?? []);
        const enginePaths = [...new Set(o.traces.map((t) => t.enginePath))];
        return (
          <details key={o.id} className="group">
            <summary className="flex cursor-pointer list-none items-start gap-2.5 px-5 py-3 text-sm hover:bg-slate-50">
              <svg className="mt-1 h-3 w-3 shrink-0 text-slate-400 transition-transform group-open:rotate-90" viewBox="0 0 12 12"><path d="M4 2l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
              <span className="flex-1 leading-relaxed text-slate-700">{o.statement}</span>
              <span className="badge badge-neutral mt-0.5 shrink-0">{o.status}</span>
            </summary>
            <div className="space-y-1 bg-slate-50/60 px-5 pb-3 pl-10 text-xs text-slate-500">
              <p>
                Traces to engine field{enginePaths.length > 1 ? 's' : ''}:{' '}
                {enginePaths.map((p) => <code key={p} className="mr-1 rounded bg-white px-1 py-0.5 text-[11px] text-slate-600">{p}</code>)}
                <span className="text-slate-400"> · unverified</span>
              </p>
              {accounts.length ? (
                <table className="w-full"><tbody>
                  {accounts.map((a) => (
                    <tr key={a.code}><td className="py-0.5">{a.code} · {a.name}</td><td className="tnum py-0.5 pl-4 text-right whitespace-nowrap">{a.debitPaise ? `${inr(a.debitPaise)} Dr` : `${inr(a.creditPaise)} Cr`}</td></tr>
                  ))}
                </tbody></table>
              ) : <p className="text-slate-400">No mapped source accounts for these lines in this period.</p>}
            </div>
          </details>
        );
      })}
    </div>
  );
}

// Tier 2 — diagnoses (rule-based "why"; each move decomposed into engine-field drivers).
function DiagnosesBlock({ diagnoses }: { diagnoses: Diagnosis[] }) {
  if (!diagnoses.length) return <p className="px-5 py-8 text-sm text-slate-400">No observations this period, so nothing to diagnose.</p>;
  const fmt = (dr: Diagnosis['drivers'][number]) =>
    dr.contributionPp !== undefined ? `${dr.contributionPp >= 0 ? '+' : '−'}${Math.abs(dr.contributionPp).toFixed(2)}pp`
      : dr.contributionPaise !== undefined ? inr(dr.contributionPaise)
        : dr.effectAbs !== undefined ? `${dr.effectAbs >= 0 ? '+' : '−'}${Math.abs(dr.effectAbs).toFixed(2)}` : '';
  return (
    <div className="divide-y divide-slate-100">
      {diagnoses.map((d) => (
        <details key={d.observationId} className="group">
          <summary className="flex cursor-pointer list-none items-start gap-2.5 px-5 py-3 text-sm hover:bg-slate-50">
            <svg className="mt-1 h-3 w-3 shrink-0 text-slate-400 transition-transform group-open:rotate-90" viewBox="0 0 12 12"><path d="M4 2l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
            <span className="flex-1 leading-relaxed text-slate-700"><span className="font-semibold text-slate-900">{d.metric}</span> — {d.cause}</span>
            <span className="badge badge-neutral mt-0.5 shrink-0">{d.status}</span>
          </summary>
          <div className="bg-slate-50/60 px-5 pb-3 pl-10 text-xs text-slate-500">
            <p className="mb-1 text-[11px] text-slate-400">rule {d.ruleId} · {d.decomposition}{d.decomposition === 'single_factor' ? ' (ceteris-paribus, not additive)' : ''}</p>
            {d.drivers.length ? (
              <table className="w-full"><tbody>
                {d.drivers.map((dr, i) => (
                  <tr key={i}><td className="py-0.5">{dr.driver} <span className="text-slate-400">· {dr.detail}</span></td><td className="tnum py-0.5 pl-4 text-right whitespace-nowrap">{fmt(dr)}</td></tr>
                ))}
              </tbody></table>
            ) : <p className="text-slate-400">n/a — driver split not derivable from engine fields (not fabricated).</p>}
          </div>
        </details>
      ))}
    </div>
  );
}

// Tier 3 — recommendations (advice with quantified impact from engine figures).
function RecommendationsBlock({ recs }: { recs: Recommendation[] }) {
  if (!recs.length) return <p className="px-5 py-8 text-sm text-slate-400">No recommendations — no observed move this period implies an actionable lever (favourable moves don&apos;t generate advice). Nothing fabricated.</p>;
  return (
    <ul className="divide-y divide-slate-100">
      {recs.map((r, i) => (
        <li key={i} className="px-5 py-3.5 text-sm">
          <div className="flex items-start gap-2.5">
            <span className="mt-1.5 h-3.5 w-0.5 shrink-0 rounded-full bg-accent" aria-hidden />
            <div className="flex-1">
              <div className="flex items-start gap-2">
                <span className="flex-1 font-medium text-slate-800">{r.action}</span>
                <span className="badge badge-neutral mt-0.5 shrink-0">{r.status}</span>
              </div>
              <p className="mt-1 text-xs text-slate-500"><span className="font-medium text-slate-600">Impact:</span> {r.quantifiedImpact.basis}</p>
              <p className="mt-0.5 text-[11px] text-slate-400">rule {r.ruleId} · confidence {r.confidence} · traces {r.quantifiedImpact.traces.join(', ')}</p>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

// Tier 3 — goal tracking (trajectory vs PLACEHOLDER target, D-013).
function GoalsBlock({ goals }: { goals: GoalTrack[] }) {
  const badge = (s: GoalTrack['trackStatus']) => s === 'on_track' ? 'badge-positive' : s === 'off_track' ? 'badge-negative' : 'badge-neutral';
  return (
    <div className="divide-y divide-slate-100">
      <p className="flex items-start gap-1.5 border-b border-amber-200/60 bg-amber-50/60 px-5 py-2.5 text-xs text-amber-700">
        <span aria-hidden>⚠</span>
        <span>Targets are PLACEHOLDER stubs (D-013) — real analyst-entered client goals are a TODO. The tracking logic below is live against the engine.</span>
      </p>
      {goals.map((g) => (
        <div key={g.goalId} className="flex items-start gap-2 px-5 py-3 text-sm">
          <span className="flex-1 text-slate-700"><span className="font-semibold text-slate-900">{g.metric}</span> <span className="text-slate-400">· {g.detail}</span></span>
          <span className={`badge shrink-0 ${badge(g.trackStatus)}`}>{g.trackStatus.replace('_', ' ')}</span>
        </div>
      ))}
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
          <p className="text-sm text-slate-500">No periods yet for <span className="font-medium text-slate-700">{chain.org.legalName}</span>. Add a period and upload a trial balance first.</p>
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
  // M7 Tier 1: deterministic observations for the move INTO the selected period (vs its prior).
  const observations = computeObservations(chain.results).filter((o) => o.periodsCompared[1] === periodMeta.label);
  const diagnoses = computeDiagnoses(observations, chain.results);              // Tier 2
  const recommendations = computeRecommendations(observations, diagnoses, chain.results); // Tier 3
  const goalTracking = computeGoalTracking(chain.results);                      // Tier 3 (placeholder targets, D-013)

  const kpiCards = kpis(chain.results, selectedIdx);
  const cf = cfRows(result);
  const trends = trendSeries(chain.results);

  return (
    <div className="relative min-h-full bg-slate-50">
      <Watermark />
      <StatusRibbon />

      {/* Header */}
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-5xl px-6 py-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <Link href="/" className="hover:underline">CapEasy vCFO</Link>
                <span>/</span>
                <Link href={`/clients/${orgId}`} className="hover:underline">{chain.org.legalName}</Link>
              </div>
              <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Management MIS Pack</h1>
              <p className="mt-0.5 text-sm text-slate-500">
                {chain.org.legalName} · {periodMeta.label}
                <span className={`badge ml-2 ${STATUS_STYLE[periodMeta.status] ?? ''}`}>{periodMeta.status}</span>
              </p>
            </div>
            <div className="flex flex-col items-end gap-2.5">
              <div className="flex gap-2">
                <a href={`/clients/${orgId}/mis/pdf?p=${periodMeta.id}`} className="btn btn-primary">Export PDF</a>
                <a href={`/clients/${orgId}/mis/workbook?p=${periodMeta.id}`} className="btn btn-secondary">Download workbook</a>
              </div>
              <nav className="flex gap-1 rounded-[var(--radius-ctl)] bg-slate-100/70 p-0.5">
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
              <p className="tnum mt-1.5 text-2xl font-bold text-slate-900">{inr(k.paise)}</p>
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
            <div className="h-px bg-slate-200" />
            <StatementBlock rows={bsLiabEquityRows(result)} drilldown={drilldown} />
          </Section>
        </div>

        {/* Cash Flow */}
        <Section title="Cash Flow" subtitle="Indirect method · requires a prior period">
          {cf ? (
            <StatementBlock rows={cf} drilldown={drilldown} />
          ) : (
            <p className="px-5 py-8 text-sm text-slate-400">n/a — needs a prior period (first period in the chain).</p>
          )}
        </Section>

        {/* Observations (M7 Tier 1) */}
        <Section
          title="Observations"
          subtitle="Tier 1 · deterministic period-over-period changes that cleared the notability thresholds — no interpretation"
          right={<span className="rounded bg-amber-50 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-amber-700 uppercase ring-1 ring-inset ring-amber-600/20">Unverified — pending CA</span>}
        >
          <ObservationsBlock observations={observations} drilldown={drilldown} />
        </Section>

        {/* Diagnoses (M8 Tier 2) */}
        <Section title="Diagnoses" subtitle="Tier 2 · rule-based 'why' — each move decomposed into engine-field drivers (interpretation; CA must validate the rules)" right={<span className="rounded bg-amber-50 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-amber-700 uppercase ring-1 ring-inset ring-amber-600/20">Unverified — pending CA</span>}>
          <DiagnosesBlock diagnoses={diagnoses} />
        </Section>

        {/* Recommendations (M8 Tier 3) */}
        <Section title="Recommendations" subtitle="Tier 3 · actions with quantified impact from engine figures (advice; CA must validate the rules)" right={<span className="rounded bg-amber-50 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-amber-700 uppercase ring-1 ring-inset ring-amber-600/20">Unverified — pending CA</span>}>
          <RecommendationsBlock recs={recommendations} />
        </Section>

        {/* Goal tracking (M8 Tier 3) */}
        <Section title="Goal tracking" subtitle="Tier 3 · trajectory vs target — PLACEHOLDER targets (D-013)" right={<span className="rounded bg-amber-50 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-amber-700 uppercase ring-1 ring-inset ring-amber-600/20">Unverified — pending CA</span>}>
          <GoalsBlock goals={goalTracking} />
        </Section>

        {/* Ratios */}
        <Section title="Key ratios &amp; working capital" subtitle="§4.2–4.3">
          <div className="grid grid-cols-2 gap-px bg-slate-100 sm:grid-cols-3 lg:grid-cols-4">
            {ratioCards(result).map((c) => (
              <div key={c.label} className="bg-white px-4 py-3.5">
                <p className="text-[11px] font-medium tracking-wide text-slate-400 uppercase">{c.label}</p>
                <p className="tnum mt-1 text-lg font-semibold text-slate-900">{c.value}</p>
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
                <div className="mt-2 flex justify-between text-[11px] text-slate-400">
                  {t.points.map((pt) => (<span key={pt.label}>{pt.label.split(' ')[0]}</span>))}
                </div>
                <p className="tnum mt-1.5 text-base font-semibold text-slate-900">{inr(t.points[t.points.length - 1].paise)}</p>
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

        <p className="pb-4 text-center text-xs text-slate-400">
          Generated by CapEasy vCFO · engine statements <span className="font-semibold">CONSISTENCY-CHECKED</span> (identity battery); insight layer + accounting conventions pending one-time CA rule-review — <span className="font-semibold">NOT VERIFIED</span>.
        </p>
      </main>
    </div>
  );
}
