'use server';
// src/app/login/actions.ts — sign-in server action (admin-provisioned model; no signup).
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export type SignInState = { error: string | null };

export async function signIn(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  if (!email || !password) return { error: 'Email and password are required.' };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: error.message };

  // Append-only audit trail (best-effort; never blocks login). org_id null = system/auth event.
  try {
    await supabase.from('audit_log').insert({
      action: 'auth.login',
      actor_id: data.user?.id ?? null,
      detail: { email },
    });
  } catch {
    // audit write is non-critical; swallow.
  }

  redirect('/');
}
