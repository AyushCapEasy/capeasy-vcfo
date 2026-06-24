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
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-[12px] shadow-[0_6px_18px_rgba(4,120,87,0.35)]" style={{ background: 'linear-gradient(135deg,#10B981 0%,#047857 60%,#065F46 100%)' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M4 19V5M4 19l5-5 4 3 7-8M20 6v4M20 6h-4" stroke="#fff" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </div>
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
            'Saral is in private testing — self-serve signups open soon.'
          )}
        </p>
      </div>
    </main>
  );
}
