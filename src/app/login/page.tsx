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
    <main className="flex flex-1 items-center justify-center p-8">
      <div className="w-full max-w-sm">
        <p className="text-sm font-medium tracking-widest text-neutral-500 uppercase">CapEasy</p>
        <h1 className="mt-1 mb-6 text-2xl font-semibold">vCFO · Sign in</h1>
        <LoginForm />
        <p className="mt-6 text-xs text-neutral-500">
          Internal access only. Accounts are provisioned by an administrator.
        </p>
      </div>
    </main>
  );
}
