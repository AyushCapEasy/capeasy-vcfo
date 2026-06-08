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
      <div className="flex items-center gap-3">
        <input
          type="file"
          name="file"
          accept=".csv,.xlsx,.xls"
          required
          className="text-sm file:mr-3 file:rounded-md file:border-0 file:bg-neutral-900 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white dark:file:bg-white dark:file:text-neutral-900"
        />
        <button type="submit" disabled={pending} className="rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium hover:bg-neutral-100 disabled:opacity-60 dark:border-neutral-700 dark:hover:bg-neutral-900">
          {pending ? 'Uploading…' : 'Upload trial balance'}
        </button>
      </div>

      {state.errors?.length ? (
        <div role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-sm dark:border-red-900 dark:bg-red-950/40">
          <p className="font-medium text-red-800 dark:text-red-300">Upload blocked — the file could not be accepted:</p>
          <ul className="mt-1 list-disc pl-5 text-red-700 dark:text-red-400">
            {state.errors.map((e, i) => (
              <li key={i}>
                {e.message}
                {e.detail ? <span className="block text-xs text-red-500">{e.detail}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {state.ok ? (
        <p className="text-sm text-emerald-700 dark:text-emerald-400">
          Imported {state.inserted} line(s).{state.warnings?.length ? ` ${state.warnings.join(' ')}` : ''}
        </p>
      ) : null}
    </form>
  );
}
