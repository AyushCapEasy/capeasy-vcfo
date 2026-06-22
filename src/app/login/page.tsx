// src/app/login/page.tsx — sign-in screen. Already-authenticated users are bounced to the app.
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { isSignupOpen } from '@/lib/auth/signup-gate';
import { LoginForm } from './login-form';

export default async function LoginPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect('/');

  const signupOpen = isSignupOpen();

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <p className="eyebrow tracking-[0.2em]">CapEasy</p>
          <h1 className="mt-1.5 text-2xl font-bold text-ink">vCFO</h1>
          <p className="mt-1 text-sm text-muted">Sign in to the MIS workspace</p>
        </div>
        <div className="card p-6 shadow-md">
          <LoginForm />
        </div>
        <p className="mt-5 text-center text-xs text-muted">
          {signupOpen ? (
            <>New to Saral? <Link href="/signup" className="font-medium text-primary hover:underline">Create an account</Link></>
          ) : (
            'Saral is in private testing — access is invite-only for now.'
          )}
        </p>
      </div>
    </main>
  );
}
