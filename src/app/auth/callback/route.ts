// src/app/auth/callback/route.ts — handles the email-confirmation / recovery redirect. Supabase appends a
// PKCE `code`; we exchange it for a session (sets the auth cookies via @supabase/ssr), then send the user on
// to `next` (default home, where first-run onboarding prompts them to create a workspace). On failure we
// bounce to /login with a flag. Whitelisted in the proxy so it runs without an existing session.
import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/';
  // Only allow same-app relative redirects (no open-redirect).
  const dest = next.startsWith('/') ? next : '/';

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // Count this sign-in too (welcome-guide cadence). Best-effort; never blocks the redirect.
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: p } = await supabase.from('profiles').select('login_count').eq('id', user.id).single();
          await supabase.from('profiles').update({ login_count: (p?.login_count ?? 0) + 1 }).eq('id', user.id);
        }
      } catch { /* non-critical */ }
      return NextResponse.redirect(`${origin}${dest}`);
    }
  }
  return NextResponse.redirect(`${origin}/login?error=confirmation`);
}
