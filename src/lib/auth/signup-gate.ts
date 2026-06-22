// src/lib/auth/signup-gate.ts — public signup is CLOSED until launch gate C3. This is a CODE-level gate,
// independent of Supabase's "Allow new users to sign up" dashboard toggle (which defaults ON) — so public
// registration stays shut even if the toggle is on, until we deliberately open it. Server-only (NOT a
// NEXT_PUBLIC_ var) so the client can't flip it. At C3: set SIGNUP_OPEN=true in the server env AND flip the
// Supabase toggle on. Default (unset / anything but "true") = closed.
export function isSignupOpen(env: Record<string, string | undefined> = process.env): boolean {
  return (env.SIGNUP_OPEN ?? '').trim().toLowerCase() === 'true';
}
