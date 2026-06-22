// src/lib/env/supabase-env.ts — D-014 build-time invariant: a deployment must point at the Supabase
// project that matches its environment. PRODUCTION must NOT use the demo project; PREVIEW/DEVELOPMENT
// MUST use the demo project. This converts D-014 separation from operator discipline (set the right
// Vercel env var) into an enforced invariant (a misconfigured deploy fails the build instead of silently
// crossing real and demo data). Pure + dependency-free so next.config can call it at build time and the
// test can exercise it directly.
//
// DEMO_REF is duplicated from scripts/_env.mjs on purpose: that file is .mjs (excluded from tsc) and app
// code can't import it. It is a public project ref, not a secret (it's also in .env.example).

export const DEMO_REF = 'rsaztdwxrzgyxkvxrqrt';

export type EnvKind = 'production' | 'preview' | 'development';

/** Parse the project ref from a Supabase URL (https://<ref>.supabase.co). null if absent/malformed. */
export function parseSupabaseRef(url: string | undefined | null): string | null {
  if (!url) return null;
  const m = /^https:\/\/([a-z0-9-]+)\.supabase\.co\/?$/i.exec(url.trim());
  return m ? m[1] : null;
}

/** Map the runtime environment to a kind. Vercel sets VERCEL_ENV; locally it is unset → development. */
export function resolveEnvKind(env: Record<string, string | undefined> = process.env): EnvKind {
  const v = (env.VERCEL_ENV || '').toLowerCase();
  if (v === 'production') return 'production';
  if (v === 'preview') return 'preview';
  return 'development';
}

export type AssertInput = {
  kind: EnvKind;
  supabaseUrl: string | undefined | null;
  demoRef?: string;
  /** Optional exact-pin for prod (set NEXT_PUBLIC_EXPECTED_PROD_REF once the prod ref is known). */
  expectedProdRef?: string | null;
};

/** Throws if the configured Supabase ref is wrong for the environment. */
export function assertSupabaseEnv({ kind, supabaseUrl, demoRef = DEMO_REF, expectedProdRef = null }: AssertInput): void {
  const ref = parseSupabaseRef(supabaseUrl);
  if (!ref) {
    throw new Error(`[D-014 env invariant] NEXT_PUBLIC_SUPABASE_URL is missing or not a https://<ref>.supabase.co URL (env=${kind}).`);
  }
  if (kind === 'production') {
    if (ref === demoRef) {
      throw new Error(`[D-014 env invariant] PRODUCTION is pointed at the DEMO project (${demoRef}). Prod must use the separate prod project — refusing the build.`);
    }
    if (expectedProdRef && ref !== expectedProdRef) {
      throw new Error(`[D-014 env invariant] PRODUCTION ref "${ref}" != expected prod ref "${expectedProdRef}" — refusing the build.`);
    }
  } else if (ref !== demoRef) {
    // preview + development must be the demo project — never real client data on a preview/local build.
    throw new Error(`[D-014 env invariant] ${kind.toUpperCase()} is pointed at "${ref}", not the demo project (${demoRef}). Previews/dev must use demo — refusing the build.`);
  }
}

/** Convenience wrapper reading process.env — called by next.config at build time. */
export function assertSupabaseEnvFromProcess(env: Record<string, string | undefined> = process.env): void {
  assertSupabaseEnv({
    kind: resolveEnvKind(env),
    supabaseUrl: env.NEXT_PUBLIC_SUPABASE_URL,
    expectedProdRef: env.NEXT_PUBLIC_EXPECTED_PROD_REF || null,
  });
}
