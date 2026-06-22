// src/lib/supabase/session.ts — refreshes the Supabase auth session on every request and keeps
// the auth cookies in sync between the browser and Server Components (the @supabase/ssr pattern).
// Invoked from src/proxy.ts (Next 16 proxy convention). Route-level auth gating (redirect
// unauthenticated users to /login) is layered on here once the login route exists — for now this
// only keeps the session alive.
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import type { Database } from '@/lib/database.types';

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          supabaseResponse = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            supabaseResponse.cookies.set(name, value, options);
          }
        },
      },
    }
  );

  // IMPORTANT (@supabase/ssr): do not run other logic between createServerClient and getUser,
  // or you risk hard-to-debug session desync.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Auth gate: unauthenticated requests go to /login. Public auth routes reachable WITHOUT a session:
  // sign-in, sign-up (itself gated CLOSED in-app until C3 — see signup-gate.ts), and the email-confirmation
  // callback (/auth/callback). Everything else requires a session.
  const path = request.nextUrl.pathname;
  const isAuthRoute =
    path === '/login' || path.startsWith('/login/') ||
    path === '/signup' || path.startsWith('/signup/') ||
    path.startsWith('/auth/');
  if (!user && !isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
