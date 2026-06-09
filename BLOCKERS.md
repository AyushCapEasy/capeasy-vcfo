# BLOCKERS — vCFO MIS Engine

> Append-only. What's stuck + why + recommended fix. **Spine/DB blockers go at the TOP** (Build Plan §7, §8).
> A blocker is cleared by striking it through and dating the resolution, not by deleting it.

---

## 🔴 ACTIVE — TOP PRIORITY (spine / DB)

_(none — B-001 resolved 2026-06-08; see below)_

---

## 🟡 KNOWN ITEMS (non-spine — address before client launch, not blocking the build)

### B-002 · `xlsx` (SheetJS 0.18.5 from npm) carries known advisories
- **Date:** 2026-06-08 · **Milestone:** M3. · **Severity:** moderate · **Not spine-blocking.**
- **What:** the npm `xlsx@0.18.5` build (the one `npm install xlsx` resolves) has published advisories
  (prototype pollution / ReDoS) that affect parsing **untrusted** workbooks.
- **Why acceptable for now:** v1 intake is **internal** — files come from analysts processing a client's
  own export, not arbitrary public uploads. Parsing runs server-side only.
- **Fix before launch:** move to SheetJS's official current build (their CDN/`@sheetjs` distribution) or add
  input hardening, and re-run `npm audit`. Parsing is isolated to `src/lib/intake/parse.ts`, so the swap is
  contained. Revisit when intake widens beyond trusted analysts.

---

## ✅ RESOLVED

### ~~B-001 · M0.5 DB pre-flight cannot pass — real credentials missing~~ ✅ RESOLVED 2026-06-08
- **Resolution (2026-06-08):** Operator saved the real `capeasy-vcfo` secrets into THIS `.env.local`
  (anon key, service_role key, and `DATABASE_URL` password). `npm install pg` →
  `node scripts/db-preflight.mjs` exited **0**: CONNECTED to `capeasy-vcfo` (ref `rsaztdwxrzgyxkvxrqrt`),
  PostgreSQL **17.6**, database `postgres`. Note: the DB password contained a literal `@`
  (`‹redacted 2026-06-09›`); it parsed correctly because the URL spec uses the LAST `@` as the
  user/host delimiter and modern `pg` re-encodes via `new URL` — no edit to the connection string needed.
  M0.5 gate is GREEN; M1 unblocked.
  > ⚠️ **SECURITY (2026-06-09):** the literal DB password had been written here verbatim and was committed
  > in local git history (commit `948f6db`, never pushed to GitHub). **Action required before any deploy:**
  > rotate the Supabase database password (Dashboard → Project Settings → Database → Reset), update
  > `DATABASE_URL` in `.env.local` only. The deployed app does NOT use `DATABASE_URL` (supabase-js + anon
  > key only), so the rotated value never needs to reach Vercel. Optionally purge it from local history
  > before the first push (history has not left this machine).
- **Milestone:** M0.5 (mandatory gate; blocks M1 and the entire spine M1→M3→M5→M6).
- **What's stuck:** `.env.local` was scaffolded at M0 with **placeholder** secrets
  (`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL` password all = `REPLACE_*`).
  No live connection to Supabase project `capeasy-vcfo` (ref `rsaztdwxrzgyxkvxrqrt`) is possible.
- **Why not worked around:** Build Plan §3 (Hard Key Guardrail) forbids hunting for / fabricating any
  other Supabase or GitHub credential. Plan M0.5 forbids falling back to SQLite or any local store —
  a fake DB can't test RLS, which is the whole point of the gate.
- **Recommended fix (operator):** Paste the **real** `capeasy-vcfo` values into
  `D:\AyushProjects\vcfo\.env.local`:
  1. `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase → Project Settings → API → anon/public key.
  2. `SUPABASE_SERVICE_ROLE_KEY` — same page → service_role key (server-only).
  3. `DATABASE_URL` password — Supabase → Project Settings → Database → connection string (URI),
     replace `REPLACE_WITH_DB_PASSWORD`.
  Then tell the agent to **re-run M0.5**. Connection must succeed before M1 begins.
- **2026-06-08 re-check (after operator said creds were filled):** `D:\AyushProjects\vcfo\.env.local`
  is still the M0 scaffold — all three secrets remain literal `REPLACE_*` (anon len 21, service_role len 29,
  DATABASE_URL len 96; URL/ref already correct). No `.env.local` exists in any sibling/alternate path
  (`vcfo Saas\`, Downloads, home). The edit did not land on this file. **Action unchanged:** edit the three
  `REPLACE_*` lines in THIS exact file and save, then `node scripts/db-preflight.mjs`.
- **Status:** ✅ RESOLVED 2026-06-08 — opened at M0, re-confirmed blocked twice 2026-06-08, cleared once the
  operator saved real creds and the live pre-flight connected.
