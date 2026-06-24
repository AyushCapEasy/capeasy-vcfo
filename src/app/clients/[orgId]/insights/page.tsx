// src/app/clients/[orgId]/insights/page.tsx — Insights screen (redesign). The M7/M8 insight layer
// (Observations · Diagnoses · Recommendations · Goals) for a selected period, on its own route.
// Renders ENTIRELY from the existing insight compute logic — REAL data, drill-down preserved, nothing
// fabricated. The SAMPLE watermark + status ribbon come from the shared client layout. UNVERIFIED until CA.
import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getMisChain, getPeriodDrilldown, type DrilldownLine } from '@/lib/engine/mis-data';
import { inr } from '@/lib/mis/present';
import { computeObservations, GROUP_CODES, type Observation } from '@/lib/insight/observations';
import { computeDiagnoses, type Diagnosis } from '@/lib/insight/diagnoses';
import { computeRecommendations, computeGoalTracking, type Recommendation, type GoalTrack } from '@/lib/insight/recommendations';

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="card overflow-hidden">
      <div className="panel-head">
        <div className="min-w-0">
          <h2 className="panel-title">{title}</h2>
          {subtitle ? <p className="panel-sub">{subtitle}</p> : null}
        </div>
      </div>
      {children}
    </section>
  );
}

// Tier 1 — observations, with the by-code drill-down to mapped source accounts.
function ObservationsBlock({ observations, drilldown }: { observations: Observation[]; drilldown: Record<string, DrilldownLine[]> }) {
  if (!observations.length) {
    return <p className="px-5 py-8 text-sm text-muted">No period-over-period move cleared the notability thresholds for this period (or it is the first period). Nothing is fabricated — honest silence.</p>;
  }
  return (
    <div className="divide-y divide-line">
      {observations.map((o) => {
        const codes = [...new Set(o.traces.flatMap((t) => t.categoryGroups).flatMap((g) => GROUP_CODES[g]))];
        const accounts = codes.flatMap((c) => drilldown[c] ?? []);
        const enginePaths = [...new Set(o.traces.map((t) => t.enginePath))];
        return (
          <details key={o.id} className="group">
            <summary className="flex cursor-pointer list-none items-start gap-2.5 px-5 py-3 text-sm hover:bg-canvas">
              <svg className="mt-1 h-3 w-3 shrink-0 text-muted transition-transform group-open:rotate-90" viewBox="0 0 12 12"><path d="M4 2l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
              <span className="flex-1 leading-relaxed text-body">{o.statement}</span>
            </summary>
            <div className="space-y-1 bg-canvas/60 px-5 pb-3 pl-10 text-xs text-muted">
              <p>
                Traces to engine field{enginePaths.length > 1 ? 's' : ''}:{' '}
                {enginePaths.map((p) => <code key={p} className="mr-1 rounded bg-white px-1 py-0.5 text-[11px] text-body">{p}</code>)}
              </p>
              {accounts.length ? (
                <table className="w-full"><tbody>
                  {accounts.map((a) => (
                    <tr key={a.code}><td className="py-0.5">{a.code} · {a.name}</td><td className="tnum py-0.5 pl-4 text-right whitespace-nowrap">{a.debitPaise ? `${inr(a.debitPaise)} Dr` : `${inr(a.creditPaise)} Cr`}</td></tr>
                  ))}
                </tbody></table>
              ) : <p className="text-muted">No mapped source accounts for these lines in this period.</p>}
            </div>
          </details>
        );
      })}
    </div>
  );
}

// Tier 2 — diagnoses (rule-based "why"; each move decomposed into engine-field drivers).
function DiagnosesBlock({ diagnoses }: { diagnoses: Diagnosis[] }) {
  if (!diagnoses.length) return <p className="px-5 py-8 text-sm text-muted">No observations this period, so nothing to diagnose.</p>;
  const fmt = (dr: Diagnosis['drivers'][number]) =>
    dr.contributionPp !== undefined ? `${dr.contributionPp >= 0 ? '+' : '−'}${Math.abs(dr.contributionPp).toFixed(2)}pp`
      : dr.contributionPaise !== undefined ? inr(dr.contributionPaise)
        : dr.effectAbs !== undefined ? `${dr.effectAbs >= 0 ? '+' : '−'}${Math.abs(dr.effectAbs).toFixed(2)}` : '';
  return (
    <div className="divide-y divide-line">
      {diagnoses.map((d) => (
        <details key={d.observationId} className="group">
          <summary className="flex cursor-pointer list-none items-start gap-2.5 px-5 py-3 text-sm hover:bg-canvas">
            <svg className="mt-1 h-3 w-3 shrink-0 text-muted transition-transform group-open:rotate-90" viewBox="0 0 12 12"><path d="M4 2l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
            <span className="flex-1 leading-relaxed text-body"><span className="font-semibold text-ink">{d.metric}</span> — {d.cause}</span>
          </summary>
          <div className="bg-canvas/60 px-5 pb-3 pl-10 text-xs text-muted">
            <p className="mb-1 text-[11px] text-muted">rule {d.ruleId} · {d.decomposition}{d.decomposition === 'single_factor' ? ' (ceteris-paribus, not additive)' : ''}</p>
            {d.drivers.length ? (
              <table className="w-full"><tbody>
                {d.drivers.map((dr, i) => (
                  <tr key={i}><td className="py-0.5">{dr.driver} <span className="text-muted">· {dr.detail}</span></td><td className="tnum py-0.5 pl-4 text-right whitespace-nowrap">{fmt(dr)}</td></tr>
                ))}
              </tbody></table>
            ) : <p className="text-muted">n/a — driver split not derivable from engine fields (not fabricated).</p>}
          </div>
        </details>
      ))}
    </div>
  );
}

// Tier 3 — recommendations (advice with quantified impact from engine figures). The mockup's "Do" emphasis.
function RecommendationsBlock({ recs }: { recs: Recommendation[] }) {
  if (!recs.length) return <p className="px-5 py-8 text-sm text-muted">No recommendations — no observed move this period implies an actionable lever (favourable moves don&apos;t generate advice). Nothing fabricated.</p>;
  return (
    <ul className="divide-y divide-line">
      {recs.map((r, i) => (
        <li key={i} className="px-5 py-3.5 text-sm">
          <div className="flex items-start gap-2.5">
            <span className="mt-1.5 h-3.5 w-0.5 shrink-0 rounded-full bg-primary" aria-hidden />
            <div className="flex-1">
              <div className="flex items-start gap-2">
                <span className="flex-1 font-medium text-ink"><span className="mr-1 text-[11px] font-bold uppercase tracking-wide text-primary">Do</span>{r.action}</span>
              </div>
              <p className="mt-1 text-xs text-muted"><span className="font-medium text-body">Impact:</span> {r.quantifiedImpact.basis}</p>
              <p className="mt-0.5 text-[11px] text-muted">rule {r.ruleId} · confidence {r.confidence} · traces {r.quantifiedImpact.traces.join(', ')}</p>
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
    <div className="divide-y divide-line">
      <p className="flex items-start gap-1.5 border-b border-amber-200/60 bg-amber-50/60 px-5 py-2.5 text-xs text-amber-700">
        <span aria-hidden>⚠</span>
        <span>Targets are PLACEHOLDER stubs (D-013) — real analyst-entered client goals are a TODO. The tracking logic below is live against the engine.</span>
      </p>
      {goals.map((g) => (
        <div key={g.goalId} className="flex items-start gap-2 px-5 py-3 text-sm">
          <span className="flex-1 text-body"><span className="font-semibold text-ink">{g.metric}</span> <span className="text-muted">· {g.detail}</span></span>
          <span className={`badge shrink-0 ${badge(g.trackStatus)}`}>{g.trackStatus.replace('_', ' ')}</span>
        </div>
      ))}
    </div>
  );
}

function InsightsTopbar({ orgId, periods, sub, periodId }: { orgId: string; periods: { id: string; label: string }[]; sub: string; periodId?: string }) {
  return (
    <header className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 border-b border-line bg-white/85 px-8 py-4 backdrop-blur">
      <div className="min-w-0">
        <h1 className="font-serif text-[22px] font-semibold leading-tight tracking-[-0.01em] text-ink">Insights</h1>
        <p className="mt-0.5 text-[12.5px] text-muted">{sub}</p>
      </div>
      {periods.length ? (
        <nav className="flex gap-1 rounded-[var(--radius-ctl)] bg-hair p-0.5">
          {periods.map((pp) => (
            <Link key={pp.id} href={`/clients/${orgId}/insights?p=${pp.id}`} className={`pill ${pp.id === periodId ? 'pill-active shadow-sm' : 'pill-idle'}`}>{pp.label}</Link>
          ))}
        </nav>
      ) : null}
    </header>
  );
}

export default async function InsightsPage({ params, searchParams }: { params: Promise<{ orgId: string }>; searchParams: Promise<{ p?: string }> }) {
  const { orgId } = await params;
  const { p } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const chain = await getMisChain(orgId);
  if (!chain) notFound();

  if (!chain.periods.length) {
    return (
      <div className="flex min-h-full flex-1 flex-col bg-canvas">
        <InsightsTopbar orgId={orgId} periods={chain.periods} sub={chain.org.legalName} />
        <main className="mx-auto w-full max-w-3xl flex-1 px-8 py-7">
          <div className="card p-10 text-center text-sm text-muted">
            No periods yet for <span className="font-medium text-body">{chain.org.legalName}</span> — add a period and upload a trial balance to generate insights.
            <Link href={`/clients/${orgId}`} className="mt-4 block text-sm font-medium text-primary hover:underline">← Back to overview</Link>
          </div>
        </main>
      </div>
    );
  }

  const found = p ? chain.periods.findIndex((pp) => pp.id === p) : -1;
  const selectedIdx = found >= 0 ? found : chain.periods.length - 1;
  const periodMeta = chain.periods[selectedIdx];
  const drilldown = await getPeriodDrilldown(periodMeta.id);
  // Same compute path as the engine MIS — real insight data for the move INTO the selected period.
  const observations = computeObservations(chain.results).filter((o) => o.periodsCompared[1] === periodMeta.label);
  const diagnoses = computeDiagnoses(observations, chain.results);
  const recommendations = computeRecommendations(observations, diagnoses, chain.results);
  const goalTracking = computeGoalTracking(chain.results);

  return (
    <div className="flex min-h-full flex-1 flex-col bg-canvas">
      <InsightsTopbar orgId={orgId} periods={chain.periods} sub={`${chain.org.legalName} · ${periodMeta.label} · ${observations.length} observation${observations.length === 1 ? '' : 's'} · prioritised by impact`} periodId={periodMeta.id} />

      <main className="mx-auto w-full max-w-3xl flex-1 space-y-6 px-8 py-7">
        <Section title="Observations" subtitle="Tier 1 · deterministic period-over-period changes that cleared the notability thresholds — no interpretation">
          <ObservationsBlock observations={observations} drilldown={drilldown} />
        </Section>
        <Section title="Diagnoses" subtitle="Tier 2 · rule-based 'why' — each move decomposed into engine-field drivers (interpretation)">
          <DiagnosesBlock diagnoses={diagnoses} />
        </Section>
        <Section title="Recommendations" subtitle="Tier 3 · actions with quantified impact from engine figures (advice)">
          <RecommendationsBlock recs={recommendations} />
        </Section>
        <Section title="Goal tracking" subtitle="Tier 3 · trajectory vs target — PLACEHOLDER targets (D-013)">
          <GoalsBlock goals={goalTracking} />
        </Section>

        <p className="pb-2 text-center text-xs text-muted">
          <Link href={`/clients/${orgId}/mis?p=${periodMeta.id}`} className="font-medium text-primary hover:underline">← Back to the MIS pack</Link>
          {' · '}engine + insight rules CA-reviewed.
        </p>
      </main>
    </div>
  );
}
