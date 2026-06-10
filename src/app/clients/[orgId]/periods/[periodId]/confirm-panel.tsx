// confirm-panel.tsx — "here's how I read your file" approval screen (server component).
// Every tolerance is shown for explicit approval; nothing is committed until the analyst confirms.
import { paiseToInr } from '@/lib/intake/money';
import { COLUMN_ROLES, type ColumnRole, type ParseResult } from '@/lib/intake/types';
import { reassignColumns, confirmTb, cancelTb, setFlip } from './actions';

const ROLE_LABEL: Record<ColumnRole, string> = { code: 'account_code', name: 'account_name', debit: 'debit', credit: 'credit' };

export function ConfirmPanel({ orgId, periodId, filename, preview }: { orgId: string; periodId: string; filename: string | null; preview: ParseResult }) {
  return (
    <section>
      <div className="mb-1.5 flex items-center gap-2.5">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-white">✓</span>
        <h2 className="text-sm font-semibold text-slate-900">Confirm how this file was read</h2>
      </div>
      <p className="mb-4 text-xs text-slate-500">
        {filename ? <code className="rounded bg-slate-100 px-1 py-0.5 text-[11px] text-slate-600">{filename}</code> : 'Uploaded file'} — nothing is imported until you approve the mapping below.
        Every adjustment is shown so a misread column can&rsquo;t silently produce a balanced-but-wrong TB.
      </p>

      {!preview.ok ? (
        <div className="card overflow-hidden border-l-4 border-l-red-500">
          <p className="bg-red-50/60 px-5 py-3 text-sm font-semibold text-red-800">This file can&rsquo;t be read with the current columns:</p>
          <ul className="list-disc px-5 py-3 pl-9 text-sm text-red-700 marker:text-red-300">
            {preview.errors.map((e, i) => <li key={i}>{e.message}{e.detail ? <span className="block text-xs text-red-500">{e.detail}</span> : null}</li>)}
          </ul>
          <form action={cancelTb.bind(null, orgId, periodId)} className="border-t border-slate-100 px-5 py-3">
            <button className="btn btn-secondary">Discard upload</button>
          </form>
        </div>
      ) : (
        <div className="card space-y-7 p-5">
          {/* Column mapping (reassignable) */}
          <div>
            <h3 className="eyebrow mb-2.5">Column mapping</h3>
            <form action={reassignColumns.bind(null, orgId, periodId)} className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {COLUMN_ROLES.map((role) => (
                  <label key={role} className="flex flex-col gap-1 text-sm">
                    <span className="font-medium text-slate-700">{ROLE_LABEL[role]}</span>
                    <select name={`col_${role}`} defaultValue={preview.columns[role].index} className="select">
                      {preview.headerRow.cells.map((c, i) => (
                        <option key={i} value={i}>{c || `(column ${i + 1})`}</option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
              {preview.warnings.length ? <p className="text-xs text-amber-600">{preview.warnings.join(' ')}</p> : null}
              <button className="btn btn-secondary">Re-read with these columns</button>
            </form>
          </div>

          {/* Proposed debit↔credit moves — OFF by default; the analyst opts into each one */}
          <div>
            <h3 className="eyebrow mb-2.5">Proposed debit ↔ credit moves ({preview.proposals.length})</h3>
            <p className="mb-3 text-xs text-slate-500">
              Values are imported <strong className="font-semibold text-slate-700">as written, in their original column</strong>. A parenthesis or minus only
              raises a proposal — moving a value between debit and credit changes its accounting meaning, so it is your
              decision, never automatic.
            </p>
            {preview.proposals.length ? (
              <ul className="space-y-3">
                {preview.proposals.map((p) => (
                  <li key={p.rowNumber} className={`rounded-[var(--radius-card)] border p-3.5 text-sm ${p.accepted ? 'border-blue-300 bg-blue-50/50' : 'border-slate-200 bg-white'}`}>
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-medium text-slate-900">Row {p.rowNumber} · {p.account}</span>
                      <span className={`badge ${p.accepted ? 'badge-info' : 'badge-neutral'}`}>
                        {p.accepted ? 'FLIP ACCEPTED' : 'AS WRITTEN'}
                      </span>
                    </div>
                    <p className="mt-1 text-slate-600">
                      Original cell <code className="rounded bg-slate-100 px-1 py-0.5 text-[11px] text-slate-600">{p.originalText}</code> in the <strong className="font-semibold">{p.cell}</strong> column. {p.assumption}
                    </p>
                    <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
                      <div className={`rounded-[var(--radius-ctl)] border px-3 py-1.5 text-xs ${!p.accepted ? 'border-slate-400 bg-white' : 'border-slate-200 opacity-60'}`}>
                        <div className="font-medium text-slate-700">As written (default)</div>
                        <div className="num mt-0.5 text-left text-slate-600">dr {p.asWritten.debitPaise ? paiseToInr(p.asWritten.debitPaise) : '—'} · cr {p.asWritten.creditPaise ? paiseToInr(p.asWritten.creditPaise) : '—'}</div>
                      </div>
                      <div className={`rounded-[var(--radius-ctl)] border px-3 py-1.5 text-xs ${p.accepted ? 'border-blue-500 bg-white' : 'border-slate-200 opacity-60'}`}>
                        <div className="font-medium text-slate-700">If flipped</div>
                        <div className="num mt-0.5 text-left text-slate-600">dr {p.proposed.debitPaise ? paiseToInr(p.proposed.debitPaise) : '—'} · cr {p.proposed.creditPaise ? paiseToInr(p.proposed.creditPaise) : '—'}</div>
                      </div>
                    </div>
                    <form action={setFlip.bind(null, orgId, periodId)} className="mt-2.5">
                      <input type="hidden" name="row" value={p.rowNumber} />
                      <input type="hidden" name="accept" value={p.accepted ? '0' : '1'} />
                      <button className="rounded-[var(--radius-ctl)] border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50">
                        {p.accepted ? 'Undo — keep as written' : `Accept — move ${p.cell} → ${p.cell === 'credit' ? 'debit' : 'credit'}`}
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-slate-500">None — no parenthesised/negative values to interpret.</p>}
          </div>

          {/* Skipped rows */}
          <div>
            <h3 className="eyebrow mb-2.5">Skipped rows ({preview.skipped.length})</h3>
            {preview.skipped.length ? (
              <ul className="space-y-1 text-sm">
                {preview.skipped.map((s) => (
                  <li key={s.rowNumber} className="text-slate-600">
                    <span className="tnum text-slate-400">Row {s.rowNumber}</span> — {s.reason}: <code className="rounded bg-slate-100 px-1 py-0.5 text-[11px] text-slate-600">{s.text}</code>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-slate-500">None.</p>}
          </div>

          {/* Totals + confirm */}
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-[var(--radius-ctl)] border border-slate-200 bg-slate-50 p-4">
            <div className="text-sm">
              <span className="text-slate-500">Will import {preview.rows.length} line(s). </span>
              <span className="tnum font-medium text-slate-900">Σ debits {paiseToInr(preview.totals.debitPaise)} · Σ credits {paiseToInr(preview.totals.creditPaise)}</span>
              {preview.totals.differencePaise !== 0 ? <span className="ml-2 text-amber-600">(off by {paiseToInr(Math.abs(preview.totals.differencePaise))} — the gate will flag this)</span> : null}
            </div>
            <div className="flex items-center gap-2">
              <form action={cancelTb.bind(null, orgId, periodId)}>
                <button className="btn btn-secondary">Cancel</button>
              </form>
              <form action={confirmTb.bind(null, orgId, periodId)}>
                <button className="btn btn-primary">Confirm &amp; import</button>
              </form>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
