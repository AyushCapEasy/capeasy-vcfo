'use client';
// src/app/clients/[orgId]/reconcile/reconcile-panel.tsx — upload bank/GST, run the overlay, render the
// gaps. Parse-quality flags are shown in a SEPARATE, visually-distinct channel from real reconciliation
// gaps, so a parsing problem can never read as a compliance gap. Files are processed in-memory only.
import { useActionState } from 'react';
import { runReconcile, type ReconState } from './actions';
import { inr } from '@/lib/mis/present';
import type { ReconFlag } from '@/lib/overlay/overlay';

const initial: ReconState = { ran: false, overlay: null, periodLabel: null, provided: { bank: false, gst: false }, error: null };

const SEV: Record<Exclude<ReconFlag['severity'], 'parse'>, string> = {
  risk: 'border-l-red-500 bg-red-50/50',
  watch: 'border-l-amber-400 bg-amber-50/40',
  info: 'border-l-line-strong bg-canvas',
};

function Traces({ traces }: { traces: ReconFlag['traces'] }) {
  if (!traces.length) return null;
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

export function ReconcilePanel({ orgId }: { orgId: string }) {
  const [state, formAction, pending] = useActionState(runReconcile.bind(null, orgId), initial);
  const o = state.overlay;

  return (
    <div className="space-y-5">
      {/* Upload */}
      <form action={formAction} className="card p-5">
        <p className="text-sm font-semibold text-ink">Upload bank &amp; GST to check</p>
        <p className="mt-0.5 text-[12px] text-muted">Bank statement and/or GST return (CSV or XLSX). Processed in-memory — nothing is stored. Messy files are read defensively; unreadable rows are flagged, never guessed.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-body">Bank statement</span>
            <input type="file" name="bankFile" accept=".csv,.xlsx,.xls" className="text-sm text-muted file:mr-3 file:rounded-[var(--radius-ctl)] file:border file:border-line-strong file:bg-white file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-body hover:file:bg-canvas" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-body">GST return (GSTR-1 sales)</span>
            <input type="file" name="gstFile" accept=".csv,.xlsx,.xls" className="text-sm text-muted file:mr-3 file:rounded-[var(--radius-ctl)] file:border file:border-line-strong file:bg-white file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-body hover:file:bg-canvas" />
          </label>
        </div>
        <button type="submit" disabled={pending} className="btn btn-primary mt-3">{pending ? 'Checking…' : 'Check against my books'}</button>
        {state.error ? <p role="alert" className="mt-2 text-sm font-medium text-amber-700">{state.error}</p> : null}
      </form>

      {state.ran && o ? (
        <>
          {/* PARSE-QUALITY channel — kept visually apart; these are NOT gaps */}
          {o.parseWarnings.length ? (
            <div className="rounded-lg border border-dashed border-line-strong bg-hair/50 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Data quality — read this first (not reconciliation gaps)</p>
              <ul className="mt-1.5 space-y-1.5 text-[12.5px] leading-relaxed text-body">
                {o.parseWarnings.map((f, i) => <li key={i} className="flex gap-1.5"><span className="text-muted">⚠</span>{f.headline}</li>)}
              </ul>
              <p className="mt-2 text-[11px] text-muted">A gap from a misread file is worse than no overlay — anything above is excluded from the gaps below.</p>
            </div>
          ) : null}

          {/* Real gaps */}
          <section className="card p-5">
            <h2 className="text-sm font-semibold text-ink">What didn&apos;t match</h2>
            <p className="mt-0.5 text-[12px] text-muted">{o.sourceOfTruth}</p>
            {o.insights.length ? (
              <div className="mt-3 space-y-3">
                {o.insights.map((f, i) => (
                  <div key={i} className={`rounded-lg border border-line border-l-4 p-3.5 ${SEV[f.severity as Exclude<ReconFlag['severity'], 'parse'>] ?? SEV.info}`}>
                    <p className="text-[13.5px] font-semibold text-ink">{f.amountPaise !== null ? `${inr(f.amountPaise)} — ` : ''}{f.headline}</p>
                    <p className="mt-1 text-[12.5px] leading-relaxed text-body">{f.detail}</p>
                    <Traces traces={f.traces} />
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-[13px] text-muted">No material gaps surfaced from what was read. (This is a cross-check, not a clean-bill — it only sees the files you uploaded.)</p>
            )}
          </section>

          {/* Source summaries */}
          <div className="grid gap-4 md:grid-cols-2">
            {o.bank ? (
              <div className="card p-4">
                <p className="text-[12.5px] font-semibold text-ink">Bank statement</p>
                <p className="mt-1 text-[11.5px] text-muted">{o.bank.read.rows - o.bank.read.unread} of {o.bank.read.rows} rows read{o.bank.read.unread ? ` · ${o.bank.read.unread} unread` : ''}</p>
                <dl className="mt-2 space-y-1 text-[12.5px]">
                  <div className="flex justify-between"><dt className="text-muted">Credits (received)</dt><dd className="num font-medium text-ink">{inr(o.bank.bankCreditsPaise)}</dd></div>
                  <div className="flex justify-between"><dt className="text-muted">Debits (paid)</dt><dd className="num font-medium text-ink">{inr(o.bank.bankDebitsPaise)}</dd></div>
                  {o.bank.matchedCount ? <div className="flex justify-between"><dt className="text-muted">Matched to books</dt><dd className="num font-medium text-ink">{o.bank.matchedCount} · {inr(o.bank.matchedPaise)}</dd></div> : null}
                </dl>
                <p className="mt-2 text-[11px] text-muted">{o.bank.note}</p>
              </div>
            ) : null}
            {o.gst ? (
              <div className="card p-4">
                <p className="text-[12.5px] font-semibold text-ink">GST return</p>
                <p className="mt-1 text-[11.5px] text-muted">{o.gst.read.rows - o.gst.read.unread} of {o.gst.read.rows} rows read{o.gst.read.unread ? ` · ${o.gst.read.unread} unread` : ''}</p>
                <dl className="mt-2 space-y-1 text-[12.5px]">
                  <div className="flex justify-between"><dt className="text-muted">Booked revenue</dt><dd className="num font-medium text-ink">{inr(o.gst.bookedRevenuePaise)}</dd></div>
                  <div className="flex justify-between"><dt className="text-muted">GST filed (GSTR-1)</dt><dd className="num font-medium text-ink">{o.gst.filedSalesPaise === null ? '— unread' : inr(o.gst.filedSalesPaise)}</dd></div>
                  {o.gst.salesGapPaise !== null ? <div className="flex justify-between"><dt className="text-muted">Gap (booked − filed)</dt><dd className="num font-semibold text-ink">{inr(o.gst.salesGapPaise)}</dd></div> : null}
                </dl>
                <p className="mt-2 text-[11px] text-muted">{o.gst.note}</p>
              </div>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}
