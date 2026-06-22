'use client';
// src/app/signup/signup-form.tsx — client signup form wired to the signUp server action.
import { useActionState } from 'react';
import { signUp, type SignUpState } from './actions';

const initial: SignUpState = { error: null, sent: false };

export function SignupForm() {
  const [state, formAction, pending] = useActionState(signUp, initial);

  if (state.sent) {
    return (
      <div className="text-center">
        <p className="text-sm font-semibold text-ink">Check your email</p>
        <p className="mt-1.5 text-[13px] text-muted">
          We&apos;ve sent a confirmation link from <strong>Saral by CapEasy</strong>. Confirm your address to activate your workspace.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="label">Work email</span>
        <input type="email" name="email" autoComplete="email" required className="input" />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="label">Password</span>
        <input type="password" name="password" autoComplete="new-password" minLength={8} required className="input" />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="label">Confirm password</span>
        <input type="password" name="confirm" autoComplete="new-password" minLength={8} required className="input" />
      </label>

      {state.error ? (
        <p role="alert" className="text-sm font-medium text-red-600">{state.error}</p>
      ) : null}

      <button type="submit" disabled={pending} className="btn btn-primary mt-1 w-full">
        {pending ? 'Creating account…' : 'Create account'}
      </button>
    </form>
  );
}
