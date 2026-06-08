// src/proxy.ts — Next 16 proxy convention (replaces the deprecated `middleware` file).
// Runs on every matched request to refresh the Supabase session cookies.
import { type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/session';

export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  // Skip Next internals and static assets; run on everything else.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
