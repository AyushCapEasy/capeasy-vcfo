// src/app/signup/page.tsx — self-serve signup screen. Reachable, but CLOSED until C3: when signup is not
// open it shows a "not open yet" state and renders no form (the action also refuses). Authenticated users
// are bounced to the app. The SAMPLE/unverified posture and watermark are unaffected (set in the app shell).
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { isSignupOpen } from '@/lib/auth/signup-gate';
import { SignupForm } from './signup-form';

export default async function SignupPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) redirect('/');

  const open = isSignupOpen();

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <p className="eyebrow tracking-[0.2em]">CapEasy</p>
          <h1 className="mt-1.5 text-2xl font-bold text-ink">Saral by CapEasy</h1>
          <p className="mt-1 text-sm text-muted">{open ? 'Create your workspace' : 'Turn your books into a structured MIS pack'}</p>
        </div>
        <div className="card p-6 shadow-md">
          {open ? (
            <SignupForm />
          ) : (
            <div className="text-center">
              <p className="text-sm font-semibold text-ink">Signups aren&apos;t open yet</p>
              <p className="mx-auto mt-1.5 max-w-xs text-[13px] text-muted">
                Saral is in private testing. Public signups will open soon — if you already have an account, sign in.
              </p>
              <Link href="/login" className="mt-4 inline-block text-sm font-medium text-primary hover:underline">Go to sign in →</Link>
            </div>
          )}
        </div>
        <p className="mt-5 text-center text-xs text-muted">
          Already have an account?{' '}
          <Link href="/login" className="font-medium text-primary hover:underline">Sign in</Link>
        </p>
      </div>
    </main>
  );
}
