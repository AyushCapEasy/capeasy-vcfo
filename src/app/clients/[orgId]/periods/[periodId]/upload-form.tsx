'use client';
// Upload a TB file (CSV/XLSX) or a Tally TB XML export (reconstructed in-memory into the same TB grid).
// Parse failures (e.g. unrecognised columns) come back as an analyst-facing report — the structural arm
// of the §3.3 gate.
import { useActionState } from 'react';
import { uploadTb, type UploadState } from './actions';

const initial: UploadState = { ok: false };

export function UploadForm({ orgId, periodId }: { orgId: string; periodId: string }) {
  const [state, formAction, pending] = useActionState(uploadTb.bind(null, orgId, periodId), initial);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="file"
          name="file"
          accept=".csv,.xlsx,.xls,.xml"
          required
          className="text-sm text-muted file:mr-3 file:rounded-[var(--radius-ctl)] file:border file:border-line-strong file:bg-white file:px-3.5 file:py-2 file:text-sm file:font-medium file:text-body hover:file:bg-canvas"
        />
        <button type="submit" disabled={pending} className="btn btn-primary">
          {pending ? 'Uploading…' : 'Upload trial balance'}
        </button>
      </div>
      <p className="text-xs text-muted">CSV or XLSX trial balance, or a Tally TB XML export (reconstructed in-memory; you confirm the rows before anything is saved).</p>

      {state.errors?.length ? (
        <div role="alert" className="rounded-[var(--radius-ctl)] border border-red-200 bg-red-50 p-3.5 text-sm">
          <p className="font-semibold text-red-800">Upload blocked — the file could not be accepted:</p>
          <ul className="mt-1.5 list-disc pl-5 text-red-700 marker:text-red-300">
            {state.errors.map((e, i) => (
              <li key={i}>
                {e.message}
                {e.detail ? <span className="block text-xs text-red-500">{e.detail}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

    </form>
  );
}
