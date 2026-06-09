'use client';
// Editable analyst commentary block. Persists via the saveCommentary server action.
import { useActionState } from 'react';
import { saveCommentary, type CommentaryState } from './actions';

const initial: CommentaryState = { saved: false };

export function Commentary({ orgId, periodId, value }: { orgId: string; periodId: string; value: string | null }) {
  const [state, action, pending] = useActionState(saveCommentary.bind(null, orgId, periodId), initial);
  return (
    <form action={action} className="flex flex-col gap-3">
      <textarea
        name="commentary"
        defaultValue={value ?? ''}
        rows={5}
        placeholder="Analyst commentary — what drove the month, risks, and the story behind the numbers…"
        className="focus:border-primary w-full resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 outline-none"
      />
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="bg-primary hover:bg-primary/90 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {pending ? 'Saving…' : 'Save commentary'}
        </button>
        {state.saved ? <span className="text-positive text-sm">Saved.</span> : null}
      </div>
    </form>
  );
}
