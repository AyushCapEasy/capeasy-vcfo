# BLOCKERS — vCFO MIS Engine

> Append-only. What's stuck + why + recommended fix. **Spine/DB blockers go at the TOP** (Build Plan §7, §8).
> A blocker is cleared by striking it through and dating the resolution, not by deleting it.

---

## 🔴 ACTIVE — TOP PRIORITY (spine / DB)

### B-001 · M0.5 DB pre-flight cannot pass — real credentials missing
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
- **Status:** OPEN — opened at M0; re-confirmed blocked 2026-06-08.

---

## ✅ RESOLVED

_(none yet)_
