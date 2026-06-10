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
        className="textarea resize-y leading-relaxed"
      />
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className="btn btn-primary">
          {pending ? 'Saving…' : 'Save commentary'}
        </button>
        {state.saved ? <span className="text-positive text-sm font-medium">Saved.</span> : null}
      </div>
    </form>
  );
}
