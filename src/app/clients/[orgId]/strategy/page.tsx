// src/app/clients/[orgId]/strategy/page.tsx — Strategy screen (warm design). The forward strategic
// layer: where the company is heading (from the forecast) and the OPTIONS a vCFO would raise — framed
// as considerations, never advice or instructions. Every statement traces to a real number. Mechanically-
// correct-but-harmful moves are shown distinctly as "raise for discussion", not recommendations. Leans on
// forecasts → carries UNVERIFIED_ESTIMATE; the SAMPLE watermark comes from the shared client layout.
import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getMisChain } from '@/lib/engine/mis-data';
import { buildStrategy, type Situation, type TraceNum, type StrategicLever } from '@/lib/strategy/strategy';

const SITUATION_TONE: Record<Situation, { label: string; cls: string }> = {
  insufficient_data: { label: 'Insufficient data', cls: 'bg-hair text-body ring-line-strong/40' },
  short_runway: { label: 'Short runway', cls: 'bg-red-50 text-red-700 ring-red-600/20' },
  funded_burn: { label: 'Pre-profit · funded', cls: 'bg-amber-50 text-amber-700 ring-amber-600/20' },
  declining: { label: 'Declining', cls: 'bg-red-50 text-red-700 ring-red-600/20' },
  profitable_growing: { label: 'Profitable · growing', cls: 'bg-positive-50 text-positive ring-positive/20' },
  profitable_stable: { label: 'Profitable · stable', cls: 'bg-positive-50 text-positive ring-positive/20' },
  growing_unprofitable: { label: 'Loss-making · not cash-critical', cls: 'bg-amber-50 text-amber-700 ring-amber-600/20' },
};

function Traces({ traces }: { traces: TraceNum[] }) {
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {traces.map((t, i) => (
        <span key={i} className="inline-flex items-baseline gap-1 rounded bg-hair px-1.5 py-0.5 text-[11px]">
          <span className="text-muted">{t.label}</span><span className="num font-medium text-ink">{t.value}</span>
        </span>
      ))}
    </div>
  );
}

function LeverCard({ lever }: { lever: StrategicLever }) {
  if (lever.flaggedForReview) {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50/50 p-4">
        <div className="flex items-start justify-between gap-3">
          <p className="text-[13px] font-semibold text-amber-800">{lever.title}</p>
          <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wide text-amber-800 ring-1 ring-inset ring-amber-600/30">Review · not advised</span>
        </div>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-body">{lever.rationale}</p>
        <Traces traces={lever.traces} />
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-line border-l-2 border-l-primary/60 bg-canvas p-4">
      <p className="text-[13px] font-semibold text-ink">{lever.title}</p>
      <p className="mt-1.5 text-[12.5px] leading-relaxed text-body">{lever.rationale}</p>
      <Traces traces={lever.traces} />
    </div>
  );
}

export default async function StrategyPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const chain = await getMisChain(orgId);
  if (!chain) notFound();

  const s = buildStrategy(chain.results);
  const tone = SITUATION_TONE[s.situation];

  return (
    <div className="flex min-h-full flex-1 flex-col bg-canvas">
      <header className="sticky top-0 z-20 border-b border-line bg-white/85 px-8 py-4 backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-serif text-[22px] font-semibold leading-tight tracking-[-0.01em] text-ink">Strategy</h1>
            <p className="mt-0.5 text-[12.5px] text-muted">{chain.org.legalName} · where you&rsquo;re heading &amp; what to consider · <span className="font-semibold text-amber-700">FORWARD-LOOKING — options, not advice</span></p>
          </div>
          <span className="rounded-md bg-amber-50 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-amber-700 ring-1 ring-inset ring-amber-600/20">Estimate</span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 space-y-5 px-8 py-7">
        {chain.results.length === 0 ? (
          <div className="card p-8 text-center">
            <p className="text-sm font-semibold text-ink">No periods yet</p>
            <p className="mx-auto mt-1.5 max-w-md text-[13px] text-muted">Upload a trial balance and load a second period — strategy reads a forward trend, and there&rsquo;s no trend to read yet.</p>
            <Link href={`/clients/${orgId}`} className="mt-4 inline-block text-sm font-medium text-primary hover:underline">← Add a period</Link>
          </div>
        ) : !s.sufficient ? (
          <div className="card border-l-4 border-l-amber-400 p-6">
            <p className="text-sm font-semibold text-ink">Not enough history to read a trajectory</p>
            <p className="mt-1.5 text-[13px] leading-relaxed text-body">{s.note}</p>
            <p className="mt-3 text-[12.5px] text-muted"><span className="font-semibold text-ink">Next:</span> {s.priorities[0]?.focus} — {s.priorities[0]?.because}</p>
          </div>
        ) : (
          <>
            {/* Where you are */}
            <div className="card p-5">
              <div className="flex items-center gap-2.5">
                <span className={`rounded-md px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ring-1 ring-inset ${tone.cls}`}>{tone.label}</span>
                <span className="text-[11px] text-muted">confidence: {s.confidence} · {s.basis}</span>
              </div>
              <p className="mt-2.5 text-[15px] font-semibold leading-snug text-ink">{s.situationSummary}</p>
              <p className="mt-2 text-[12px] text-muted">These are options the numbers suggest you could consider — discussion points a vCFO would raise, not advice, instructions, or guarantees. Every line traces to a figure from your data and the (uncertain) forecast.</p>
            </div>

            {/* Trajectory — where this is heading */}
            <section className="card p-5">
              <h2 className="text-sm font-semibold text-ink">Where this is heading</h2>
              <p className="mt-0.5 text-[12px] text-muted">A plain read of the base-case forecast — <Link href={`/clients/${orgId}/forecast`} className="font-medium text-primary hover:underline">change scenarios on Forecast</Link>.</p>
              <ul className="mt-3 space-y-3">
                {s.trajectory.map((t, i) => (
                  <li key={i} className="border-l-2 border-line pl-3.5">
                    <p className="text-[13.5px] leading-relaxed text-body">{t.headline}</p>
                    <Traces traces={t.traces} />
                  </li>
                ))}
              </ul>
            </section>

            {/* Strategic levers — framed options */}
            <section className="card p-5">
              <h2 className="text-sm font-semibold text-ink">Levers you could consider</h2>
              <p className="mt-0.5 text-[12px] text-muted">Framed options for this situation — each with your real numbers. Not commands.</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {s.levers.map((l, i) => <LeverCard key={i} lever={l} />)}
              </div>
            </section>

            {/* Priorities — what matters most now */}
            <section className="card p-5">
              <h2 className="text-sm font-semibold text-ink">What matters most now</h2>
              <ol className="mt-3 space-y-2.5">
                {s.priorities.map((p) => (
                  <li key={p.rank} className="flex gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">{p.rank}</span>
                    <div>
                      <p className="text-[13.5px] font-semibold text-ink">{p.focus}</p>
                      <p className="text-[12.5px] leading-relaxed text-muted">{p.because}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </section>

            {/* Review flags + uncertainty */}
            <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">For discussion / review</p>
              <ul className="mt-1.5 space-y-1 text-[12px] leading-relaxed text-body">
                {s.reviewFlags.map((f, i) => <li key={i} className="flex gap-1.5"><span className="text-amber-600">⚠</span>{f}</li>)}
              </ul>
            </div>

            <p className="pb-2 text-center text-[11.5px] text-muted">Strategic guidance is built on forecasts, which are estimates — these are options to weigh, not financial advice.</p>
          </>
        )}
      </main>
    </div>
  );
}
