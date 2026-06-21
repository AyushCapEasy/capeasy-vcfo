// src/app/login/page.tsx — sign-in screen. Already-authenticated users are bounced to the app.
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { LoginForm } from './login-form';

export default async function LoginPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect('/');

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
          Internal access only. Accounts are provisioned by an administrator.
        </p>
      </div>
    </main>
  );
}
