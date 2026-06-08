// src/lib/supabase/client.ts — Supabase client for Client Components (browser).
// ANON key only; RLS applies. Never import the service_role key into client code (Build Plan §3/§5).
import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@/lib/database.types';

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
