'use client';
// Upload a TB file (CSV/XLSX). Parse failures (e.g. unrecognised columns) come back as an
// analyst-facing report — the structural arm of the §3.3 gate.
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
          accept=".csv,.xlsx,.xls"
          required
          className="text-sm text-slate-500 file:mr-3 file:rounded-[var(--radius-ctl)] file:border file:border-slate-300 file:bg-white file:px-3.5 file:py-2 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-50"
        />
        <button type="submit" disabled={pending} className="btn btn-primary">
          {pending ? 'Uploading…' : 'Upload trial balance'}
        </button>
      </div>

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
