// src/lib/env/supabase-env.ts — single-project env invariant (D-014 REVISED: one Supabase project serves
// both demo and production; tenant isolation is enforced by RLS — proven by the launch gate test:rls — NOT
// by a second project). This build-time check asserts the app is wired to the EXPECTED project and that the
// Supabase URL is present + well-formed, so a misconfigured or empty NEXT_PUBLIC_SUPABASE_URL fails the
// build instead of silently shipping a broken/wrong-project deploy. It does NOT distinguish prod vs preview
// (there is only one project), so it never blocks the single-project setup.
//
// EXPECTED_SUPABASE_REF is the single shared project ref (also in scripts/_env.mjs and .env.example). It is
// a public project identifier, not a secret. To re-point the whole app at a different project, change it here.

export const EXPECTED_SUPABASE_REF = 'rsaztdwxrzgyxkvxrqrt';

/** Parse the project ref from a Supabase URL (https://<ref>.supabase.co). null if absent/malformed. */
export function parseSupabaseRef(url: string | undefined | null): string | null {
  if (!url) return null;
  const m = /^https:\/\/([a-z0-9-]+)\.supabase\.co\/?$/i.exec(url.trim());
  return m ? m[1] : null;
}

export type AssertInput = { supabaseUrl: string | undefined | null; expectedRef?: string };

/** Throws unless NEXT_PUBLIC_SUPABASE_URL is present, well-formed, and points at the expected project. */
export function assertSupabaseEnv({ supabaseUrl, expectedRef = EXPECTED_SUPABASE_REF }: AssertInput): void {
  const ref = parseSupabaseRef(supabaseUrl);
  if (!ref) {
    throw new Error('[env invariant] NEXT_PUBLIC_SUPABASE_URL is missing or not a https://<ref>.supabase.co URL — refusing the build.');
  }
  if (ref !== expectedRef) {
    throw new Error(`[env invariant] Supabase URL points at project "${ref}", but this app is wired to "${expectedRef}" — refusing the build.`);
  }
}

/** Convenience wrapper reading process.env — called by next.config at build time. */
export function assertSupabaseEnvFromProcess(env: Record<string, string | undefined> = process.env): void {
  assertSupabaseEnv({ supabaseUrl: env.NEXT_PUBLIC_SUPABASE_URL });
}
