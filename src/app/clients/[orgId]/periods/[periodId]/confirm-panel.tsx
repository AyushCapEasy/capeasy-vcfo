// confirm-panel.tsx — "here's how I read your file" approval screen (server component).
// Every tolerance is shown for explicit approval; nothing is committed until the analyst confirms.
import { paiseToInr } from '@/lib/intake/money';
import { COLUMN_ROLES, type ColumnRole, type ParseResult } from '@/lib/intake/types';
import { reassignColumns, confirmTb, cancelTb } from './actions';

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

          {/* Normalizations applied */}
          <div>
            <h3 className="mb-2 text-xs font-semibold tracking-wide text-neutral-500 uppercase">
              Sign / side adjustments ({preview.adjustments.length})
            </h3>
            {preview.adjustments.length ? (
              <div className="overflow-hidden rounded-lg border border-amber-300 dark:border-amber-900">
                <table className="w-full text-sm">
                  <thead className="bg-amber-50 text-left text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
                    <tr><th className="px-3 py-2">Row</th><th className="px-3 py-2">Account</th><th className="px-3 py-2">As written (dr / cr)</th><th className="px-3 py-2">Read as (dr / cr)</th><th className="px-3 py-2">Why</th></tr>
                  </thead>
                  <tbody className="divide-y divide-amber-200 dark:divide-amber-900">
                    {preview.adjustments.map((a) => (
                      <tr key={a.rowNumber}>
                        <td className="px-3 py-2 tabular-nums text-neutral-500">{a.rowNumber}</td>
                        <td className="px-3 py-2">{a.account}</td>
                        <td className="px-3 py-2 tabular-nums">{a.originalDebit} / {a.originalCredit}</td>
                        <td className="px-3 py-2 tabular-nums font-medium">{a.resultDebitPaise ? paiseToInr(a.resultDebitPaise) : '—'} / {a.resultCreditPaise ? paiseToInr(a.resultCreditPaise) : '—'}</td>
                        <td className="px-3 py-2 text-xs text-neutral-600 dark:text-neutral-400">{a.reasons.join('; ')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="text-sm text-neutral-500">None — no signs were flipped and no rows were netted.</p>}
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
