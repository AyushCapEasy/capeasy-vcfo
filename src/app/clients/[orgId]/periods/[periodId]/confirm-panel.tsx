// confirm-panel.tsx — "here's how I read your file" approval screen (server component).
// Every tolerance is shown for explicit approval; nothing is committed until the analyst confirms.
import { paiseToInr } from '@/lib/intake/money';
import { COLUMN_ROLES, type ColumnRole, type ParseResult } from '@/lib/intake/types';
import { reassignColumns, confirmTb, cancelTb, setFlip } from './actions';

const ROLE_LABEL: Record<ColumnRole, string> = { code: 'account_code', name: 'account_name', debit: 'debit', credit: 'credit' };

export function ConfirmPanel({ orgId, periodId, filename, preview }: { orgId: string; periodId: string; filename: string | null; preview: ParseResult }) {
  return (
    <section>
      <h2 className="mb-1 text-sm font-semibold">Confirm how this file was read</h2>
      <p className="mb-4 text-xs text-neutral-500">
        {filename ? <code>{filename}</code> : 'Uploaded file'} — nothing is imported until you approve the mapping below.
        Every adjustment is shown so a misread column can&rsquo;t silently produce a balanced-but-wrong TB.
      </p>

      {!preview.ok ? (
        <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm dark:border-red-900 dark:bg-red-950/40">
          <p className="font-medium text-red-800 dark:text-red-300">This file can&rsquo;t be read with the current columns:</p>
          <ul className="mt-1 list-disc pl-5 text-red-700 dark:text-red-400">
            {preview.errors.map((e, i) => <li key={i}>{e.message}{e.detail ? <span className="block text-xs">{e.detail}</span> : null}</li>)}
          </ul>
          <form action={cancelTb.bind(null, orgId, periodId)} className="mt-3">
            <button className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-900">Discard upload</button>
          </form>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Column mapping (reassignable) */}
          <div>
            <h3 className="mb-2 text-xs font-semibold tracking-wide text-neutral-500 uppercase">Column mapping</h3>
            <form action={reassignColumns.bind(null, orgId, periodId)} className="space-y-2">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {COLUMN_ROLES.map((role) => (
                  <label key={role} className="flex flex-col gap-1 text-sm">
                    <span className="font-medium">{ROLE_LABEL[role]}</span>
                    <select name={`col_${role}`} defaultValue={preview.columns[role].index} className="rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900">
                      {preview.headerRow.cells.map((c, i) => (
                        <option key={i} value={i}>{c || `(column ${i + 1})`}</option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
              {preview.warnings.length ? <p className="text-xs text-amber-600 dark:text-amber-400">{preview.warnings.join(' ')}</p> : null}
              <button className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-900">Re-read with these columns</button>
            </form>
          </div>

          {/* Proposed debit↔credit moves — OFF by default; the analyst opts into each one */}
          <div>
            <h3 className="mb-2 text-xs font-semibold tracking-wide text-neutral-500 uppercase">
              Proposed debit ↔ credit moves ({preview.proposals.length})
            </h3>
            <p className="mb-3 text-xs text-neutral-500">
              Values are imported <strong>as written, in their original column</strong>. A parenthesis or minus only
              raises a proposal — moving a value between debit and credit changes its accounting meaning, so it is your
              decision, never automatic.
            </p>
            {preview.proposals.length ? (
              <ul className="space-y-3">
                {preview.proposals.map((p) => (
                  <li key={p.rowNumber} className={`rounded-lg border p-3 text-sm ${p.accepted ? 'border-blue-300 bg-blue-50/50 dark:border-blue-900 dark:bg-blue-950/20' : 'border-neutral-200 dark:border-neutral-800'}`}>
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-medium">Row {p.rowNumber} · {p.account}</span>
                      <span className={`rounded px-2 py-0.5 text-[10px] font-semibold ${p.accepted ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300' : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300'}`}>
                        {p.accepted ? 'FLIP ACCEPTED' : 'AS WRITTEN'}
                      </span>
                    </div>
                    <p className="mt-1 text-neutral-600 dark:text-neutral-400">
                      Original cell <code>{p.originalText}</code> in the <strong>{p.cell}</strong> column. {p.assumption}
                    </p>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      <div className={`rounded border px-2 py-1 text-xs ${!p.accepted ? 'border-neutral-500 dark:border-neutral-500' : 'border-neutral-200 opacity-60 dark:border-neutral-800'}`}>
                        <div className="font-medium">As written (default)</div>
                        <div className="tabular-nums">dr {p.asWritten.debitPaise ? paiseToInr(p.asWritten.debitPaise) : '—'} · cr {p.asWritten.creditPaise ? paiseToInr(p.asWritten.creditPaise) : '—'}</div>
                      </div>
                      <div className={`rounded border px-2 py-1 text-xs ${p.accepted ? 'border-blue-500 dark:border-blue-500' : 'border-neutral-200 opacity-60 dark:border-neutral-800'}`}>
                        <div className="font-medium">If flipped</div>
                        <div className="tabular-nums">dr {p.proposed.debitPaise ? paiseToInr(p.proposed.debitPaise) : '—'} · cr {p.proposed.creditPaise ? paiseToInr(p.proposed.creditPaise) : '—'}</div>
                      </div>
                    </div>
                    <form action={setFlip.bind(null, orgId, periodId)} className="mt-2">
                      <input type="hidden" name="row" value={p.rowNumber} />
                      <input type="hidden" name="accept" value={p.accepted ? '0' : '1'} />
                      <button className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-900">
                        {p.accepted ? 'Undo — keep as written' : `Accept — move ${p.cell} → ${p.cell === 'credit' ? 'debit' : 'credit'}`}
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-neutral-500">None — no parenthesised/negative values to interpret.</p>}
          </div>

          {/* Skipped rows */}
          <div>
            <h3 className="mb-2 text-xs font-semibold tracking-wide text-neutral-500 uppercase">Skipped rows ({preview.skipped.length})</h3>
            {preview.skipped.length ? (
              <ul className="space-y-1 text-sm">
                {preview.skipped.map((s) => (
                  <li key={s.rowNumber} className="text-neutral-600 dark:text-neutral-400">
                    <span className="tabular-nums text-neutral-500">Row {s.rowNumber}</span> — {s.reason}: <code className="text-xs">{s.text}</code>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-neutral-500">None.</p>}
          </div>

          {/* Totals + confirm */}
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
            <div className="text-sm">
              <span className="text-neutral-500">Will import {preview.rows.length} line(s). </span>
              <span className="font-medium">Σ debits {paiseToInr(preview.totals.debitPaise)} · Σ credits {paiseToInr(preview.totals.creditPaise)}</span>
              {preview.totals.differencePaise !== 0 ? <span className="ml-2 text-amber-600 dark:text-amber-400">(off by {paiseToInr(Math.abs(preview.totals.differencePaise))} — the gate will flag this)</span> : null}
            </div>
            <div className="flex items-center gap-2">
              <form action={cancelTb.bind(null, orgId, periodId)}>
                <button className="rounded-md border border-neutral-300 px-3 py-2 text-sm hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-900">Cancel</button>
              </form>
              <form action={confirmTb.bind(null, orgId, periodId)}>
                <button className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-900">Confirm &amp; import</button>
              </form>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
