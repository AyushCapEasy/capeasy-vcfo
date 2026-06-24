'use client';
// src/app/admin/approve-button.tsx — per-row Approve control. Shows the result inline (incl. the email
// status / env-var hint) and keeps it visible; the org leaves the pending list on the next page load.
import { useActionState } from 'react';
import { approveOrg, type ApproveState } from './actions';

const initial: ApproveState = { ok: false, message: '' };

export function ApproveButton({ orgId }: { orgId: string }) {
  const [state, action, pending] = useActionState(approveOrg, initial);
  const done = state.ok;
  return (
    <form action={action} className="flex flex-col items-end gap-1.5">
      <input type="hidden" name="orgId" value={orgId} />
      <button
        type="submit"
        disabled={pending || done}
        className="btn btn-primary px-4 py-2 text-[13px] disabled:opacity-60"
      >
        {pending ? 'Approving…' : done ? 'Approved ✓' : 'Approve'}
      </button>
      {state.message ? (
        <p className={`max-w-xs text-right text-[11.5px] leading-snug ${state.ok ? 'text-positive' : 'text-negative'}`}>{state.message}</p>
      ) : null}
    </form>
  );
}
