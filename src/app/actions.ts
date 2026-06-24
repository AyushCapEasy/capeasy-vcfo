'use server';
// src/app/actions.ts — app-wide server actions.
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

/** Welcome guide "don't show again" — sets the user's own profile flag (profiles_update_self RLS). */
export async function dismissWelcome(): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from('profiles').update({ welcome_dismissed: true }).eq('id', user.id);
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    try {
      await supabase.from('audit_log').insert({ action: 'auth.logout', actor_id: user.id });
    } catch {
      // non-critical.
    }
  }
  await supabase.auth.signOut();
  redirect('/login');
}
