'use server';
// src/app/signup/actions.ts — self-serve signup (email confirmation). DOUBLE-GATED CLOSED until C3:
// (1) this action refuses unless SIGNUP_OPEN=true, and (2) Supabase's signup toggle must also be on.
// On success Supabase sends a Saral-branded confirmation email (via Supabase→Resend SMTP, configured at C3);
// the user confirms, lands on /auth/callback, then creates their workspace (onboarding) on first login.
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { isSignupOpen } from '@/lib/auth/signup-gate';

export type SignUpState = { error: string | null; sent: boolean };

export async function signUp(_prev: SignUpState, formData: FormData): Promise<SignUpState> {
  if (!isSignupOpen()) return { error: 'Public signups are not open yet.', sent: false };

  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const confirm = String(formData.get('confirm') ?? '');
  if (!email || !password) return { error: 'Email and password are required.', sent: false };
  if (password.length < 8) return { error: 'Use a password of at least 8 characters.', sent: false };
  if (password !== confirm) return { error: 'The two passwords do not match.', sent: false };

  // Build the absolute confirmation-redirect URL from the request (works locally and on the prod domain).
  const h = await headers();
  const host = h.get('host') ?? '';
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  const origin = `${proto}://${host}`;

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: `${origin}/auth/callback?next=/` },
  });
  if (error) return { error: error.message, sent: false };

  return { error: null, sent: true };
}
