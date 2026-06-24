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

  // Count this sign-in (drives the welcome guide's "every alternate login" cadence). Best-effort.
  if (data.user?.id) {
    try {
      const { data: p } = await supabase.from('profiles').select('login_count').eq('id', data.user.id).single();
      await supabase.from('profiles').update({ login_count: (p?.login_count ?? 0) + 1 }).eq('id', data.user.id);
    } catch { /* non-critical */ }
  }

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
