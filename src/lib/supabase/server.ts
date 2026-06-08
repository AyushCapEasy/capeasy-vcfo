// src/lib/supabase/server.ts — Supabase client for Server Components / Route Handlers /
// Server Actions. Uses the ANON key + the request's auth cookies, so every query runs as the
// signed-in `authenticated` user and is gated by RLS (Build Plan §5: RLS is the tenant boundary,
// never bypassed). The service_role key is NEVER used here — it must stay out of any request path.
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Database } from '@/lib/database.types';

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // setAll called from a Server Component — ignored; the middleware refreshes the session.
          }
        },
      },
    }
  );
}
