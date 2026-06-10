'use client';
// src/app/login/login-form.tsx — client login form wired to the signIn server action.
import { useActionState } from 'react';
import { signIn, type SignInState } from './actions';

const initial: SignInState = { error: null };

export function LoginForm() {
  const [state, formAction, pending] = useActionState(signIn, initial);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="label">Email</span>
        <input type="email" name="email" autoComplete="username" required className="input" />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="label">Password</span>
        <input type="password" name="password" autoComplete="current-password" required className="input" />
      </label>

      {state.error ? (
        <p role="alert" className="text-sm font-medium text-red-600">
          {state.error}
        </p>
      ) : null}

      <button type="submit" disabled={pending} className="btn btn-primary mt-1 w-full">
        {pending ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}
