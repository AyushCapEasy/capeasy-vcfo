# vCFO MIS Engine — Build Plan & Living Backlog
**Version 2.0** · Internal virtual-CFO / MIS engine for CapEasy · Single source of truth + handoff doc

> This file is BOTH the build instructions AND the backlog. It lives in the project repo. After each milestone, the agent ticks the checkbox, updates the STATUS line, appends to the Handoff Log, and commits. Any Claude Code instance picking this up: read top-to-bottom, then resume at the first unchecked milestone in the Backlog.

---

## 0. HOW TO USE THIS FILE (read first, every instance)

- **Reference spec:** `vCFO-Dashboard-Knowledge-Bible.md` (v1.1) — the domain + formula contract. Read it in full before writing engine code. This plan never overrides the Bible's *formulas*; it governs *process, environment, and stack*.
- **Source of truth for status:** the **Backlog (§9)** below. Checkboxes + STATUS lines are authoritative.
- **Resume rule:** continue from the first milestone whose box is unchecked. If a milestone is `[partial]`, finish it before moving on.
- **Two satellite lists:** `BLOCKERS.md` (what's stuck + why + recommended fix) and `DECISIONS.md` (every `CA-VALIDATE` / `[ADD DETAIL]` for Ayush or the CA). This file is the backlog; those two are append-only logs.

---

## 1. ROLE & MISSION

Build the MVP of an **internal, analyst-operated virtual-CFO / MIS engine** for CapEasy (financial consulting for Indian SMEs/startups). It is **NOT** client-facing SaaS in v1 — no client login, self-serve, or billing (deferred). "Internal" = who operates it. The system is still **multi-tenant** (org = client; one analyst across many client-orgs), so it can grow into client-facing later without replatforming.

**Success for the first build:** an analyst uploads **3 consecutive periods** of one client's trial balance, maps accounts to the canonical chart once, and gets a correct, **identity-checked** P&L + Balance Sheet + Cash Flow + ratio set, rendered as an MIS pack with PDF export — with statement numbers held as **UNVERIFIED / PENDING** until the CA signs off (see §10).

---

## 2. ENVIRONMENT (real, isolated, brand-new — unrelated to any other CapEasy project)

- **OS / location:** Windows. Project root = `D:\AyushProjects\vcfo Saas`
- **GitHub:** https://github.com/AyushCapEasy/capeasy-vcfo.git (private, empty) — work directly on `main` (solo developer; this repo deploys nowhere yet).
- **Supabase project:** `capeasy-vcfo` · URL `https://rsaztdwxrzgyxkvxrqrt.supabase.co` · ref `rsaztdwxrzgyxkvxrqrt` · region Mumbai (ap-south-1)
- **Credentials:** live ONLY in a local `.env.local` the operator provides (Supabase URL, anon key, service_role key, database connection string, project ref). Never commit `.env.local`.

---

## 3. HARD KEY GUARDRAIL (highest priority — breaking this is the worst possible outcome)

1. Use **only** the credentials in `.env.local` for project `capeasy-vcfo`.
2. **Never** read, request, search for, store, or use any other Supabase or GitHub credential from any file, shell history, environment, or config — even if found.
3. **Never** run any command that lists, links, enumerates, or switches Supabase projects/organizations (no `supabase projects list`; no `supabase link` to any ref other than `rsaztdwxrzgyxkvxrqrt`). Operate on exactly one project.
4. The `service_role` key bypasses row-level security — use it **server-side only**. It must NEVER reach the browser/client bundle.
5. Missing credential → **stop and log to `BLOCKERS.md`**. Never hunt for an alternative key.

---

## 4. BUILD GUARDRAILS

1. **NO accounting-software integrations.** v1 ingestion = manual upload + one-time per-client account mapping only (Bible §3, §8.2). The single most important build rule.
2. **Engine once, views many** (§8.1). Compute in ONE pure module; views only render. Never recompute a metric in a view.
3. **Deterministic & traceable** (§8.5). Every number traces to mapped TB lines or a named prior period. **Never fabricate a prior period** — if <2 periods exist, delta metrics (cash flow, burn, runway, growth, MoM) return "n/a — needs prior period."
4. **Period-over-period is first-class** (§3.5). Each Period row carries `prior_period_id`. Model the period chain in the schema, not at render time.
5. **Formulas from Bible §4 only.** Ambiguous / `[VALIDATE]` → implement as written, add `// CA-VALIDATE:` comment, log in `DECISIONS.md`.
6. **Correctness ≠ self-consistency** (§10.6). You may author the §4.5 identity invariants (they're identities, non-circular). You may NOT present self-authored "expected values" as correct (see §10).
7. **Validation gate mandatory** (§3.3): TB balances; no unmapped accounts; sign sanity; period continuity. Block compute on failure with an analyst-facing report.
8. **Don't thrash.** Blocked >~20 min → `BLOCKERS.md`, move to the next *independent* task (but see §8 — the spine has few independent fallbacks).
9. **Commit at every milestone**; tick the backlog; append the Handoff Log.

---

## 5. TECH STACK (Supabase, NOT Prisma)

- **Next.js (App Router) + TypeScript + Tailwind + shadcn/ui.** Deploy target Vercel — keep deploy-ready, do NOT deploy during the build.
- **Database = Supabase Postgres. No Prisma.**
- **Migrations:** plain SQL migration files applied to the project via the **project connection string** (`DATABASE_URL` from `.env.local`). Do NOT require or request a Supabase account access token. If a flow would normally need `supabase link` + an account token and none is present, apply migrations directly against `DATABASE_URL`. Keep `database.types.ts` generated from the project and in sync.
- **Tenant isolation = RLS (database-level), not app-level filtering alone.** Every client/org-scoped table has **RLS enabled** with policies keyed to org membership. Never disable RLS as a shortcut; app-level `orgId` scoping is defense-in-depth on top.
- File parsing: SheetJS (xlsx) + Papaparse (CSV). PDF: server-side HTML→PDF via `puppeteer-core` + `@sparticuz/chromium` (A4, print backgrounds) — **note: Chromium cold-start can be slow/flaky; treat PDF as the highest-risk step.** Charts: recharts/chart.js.
- **Money: integer paise (or Decimal), never float.** INR, single currency, explicit rounding.

---

## 6. SCOPE — build P0 fully before P1

**P0 — must reach working state:** (1) Foundation — auth, multi-tenant org(=client), roles (Admin/Analyst), shell/nav, append-only audit log. (2) Intake — canonical Account Category taxonomy (§3.2); TB upload CSV/XLSX `[ADD DETAIL: lock columns — default account_code, account_name, debit, credit]`; per-client mapping UI (fuzzy suggest, persisted, auto-applied next period); validation gate (§3.3); Period model with mandatory `prior_period_id` (§3.5); TY-aware periods (§6.1). (3) Computation engine (§4) — pure functions returning a typed results object from {mapped TB, prior period, schedules}: P&L, BS, Cash Flow indirect (needs 2 periods; <2 → n/a), core ratios, working-capital, startup metrics; plus §4.5 identity invariants asserted every period. (4) MIS view (template A, §5A) — P&L + BS + cash-flow summary + ratios + MoM trend + editable commentary; PDF export + source-workbook download.

**P1 — scaffold + TODOs after P0 green:** (5) Investor view (B). (6) Cash & runway view (C). (7) AR/AP aging + schedule intake. (8) Compliance calendar (rule-driven, §6.4; consider white-label).

**P2 — stub only:** budget-vs-actual, scenarios, board-deck export, client-facing login.

**Do NOT build:** any accounting-software integration, real email/SMS (mock + log), billing, marketing site.

---

## 7. WORKFLOW & EXECUTION PROTOCOL

Per milestone: do the work → run build + typecheck + tests (no proceeding on red — fix or `BLOCKERS.md`) → **tick the backlog box + update its STATUS** → `git commit -m "Mxx: <what> [green|partial]"` → append one line to the Handoff Log (§12).

**Spine awareness (important):** M0.5 → M1 → M3 → M5 → M6 is a dependency chain — each gates the next. If a spine milestone blocks, the only safe fallback work is the few items that don't depend on the engine: app shell/nav polish, compliance-calendar **rule modeling** (§6.4, pure logic), and P1/P2 schema stubs. Log the spine blocker prominently at the TOP of `BLOCKERS.md` and `MORNING-REVIEW.md` — do NOT bury it.

**Operator morning protocol (for the human + the resuming instance):** Ayush interrupts the run, asks the agent to *finish the current milestone cleanly* (no half-states), then reviews + runs smoke tests, then resumes. So always leave the work at a clean checkpoint when interrupted.

---

## 8. BACKLOG / MILESTONES  ← living status, tick as you go

- [x] **M0 — Project setup & plan.** STATUS: _green · 2026-06-08 — root `D:\AyushProjects\vcfo` (see DECISIONS D-001), both .md moved in, git+remote set, scaffolding + BLOCKERS/DECISIONS written, committed_
  - The build files are in the operator's **Downloads** folder: this plan (`vCFO-Build-Plan.md`) and `vCFO-Dashboard-Knowledge-Bible.md`. Using Claude Code: create `D:\AyushProjects\vcfo Saas`, **move both .md files into it** (this plan becomes the in-repo living backlog), `git init`, set remote to the GitHub repo, first commit.
  - Create `BLOCKERS.md` / `DECISIONS.md`. Re-read the Bible v1.1. Confirm the stack against §5. Write the concrete plan into the Handoff Log. Commit.
- [x] **M0.5 — DB pre-flight gate (mandatory, supervise this one).** STATUS: _green · 2026-06-08 — operator saved real `capeasy-vcfo` creds; `npm i pg` → `node scripts/db-preflight.mjs` exited 0: CONNECTED, PostgreSQL 17.6. B-001 RESOLVED. M1 unblocked._
  - Verify connectivity to `capeasy-vcfo` using `.env.local`. **If you cannot connect, STOP and write `BLOCKERS.md`. Do NOT fall back to SQLite or any local store** — a fake DB can't test RLS, which is the whole point. Must pass before M1.
- [x] **M1 — Schema + seed.** STATUS: _green · 2026-06-08 — 5 SQL migrations applied to capeasy-vcfo (16 public tables, RLS on every org-scoped table; only the internal `schema_migrations` tracker is RLS-exempt). 31-row canonical taxonomy seeded. Demo org **Acme Foods Pvt Ltd** + **3 chained periods** (Apr locked → May reviewed → Jun draft) seeded; all 3 TBs balance read straight from Postgres (75 TB lines, 25 mappings, all schedules). Seed self-asserts TB-balance / Assets=L+E+NP / RE-roll — caught a data defect, fixed (DECISIONS D-003). `database.types.ts` generated by Docker-free direct introspection (`npm run db:types`) and typechecks --strict. npm scripts wired (db:migrate/seed/check/types). Committed._
  - SQL migrations for all P0+P1 models incl. **Period.prior_period_id**; RLS enabled on every org-scoped table. Seed: demo client + **THREE consecutive periods** of trial balance (so cash flow, deltas, MoM are exercisable). Generate `database.types.ts`. Commit.
- [x] **M2 — Auth + multi-tenant + roles + shell + audit log.** STATUS: _green (foundation, verified) · 2026-06-08 — Next.js 16.2.7 + React 19 + Tailwind v4 scaffolded; typed `@supabase/ssr` clients (ANON-key, RLS-gated; **service_role never in a request path**); session refresh + **auth gating** on the Next 16 proxy (unauthenticated → `/login`). **Admin-provisioned model, no public signup** (DECISIONS D-004): first admin `ayush@capeasy.in` bootstrapped via `scripts/seed-admin.mjs` (service_role Auth Admin API + temp password), made admin-member of the demo org; migration `0006` auto-creates a `profiles` row per auth user. Login (server action + `useActionState` form), sign-out, and **append-only audit writes** on login/logout. Minimal analyst shell: header + RLS-scoped client-org list with per-org role. **Verified at runtime via the ANON key:** anon sees 0 orgs (RLS denies); signed-in admin sees ONLY `Acme Foods Pvt Ltd` (role admin) + its 3 periods. `build`/`typecheck`/`lint` GREEN. **Deferred (non-spine, tracked):** in-app analyst-provisioning UI (today admins run `db:seed-admin`), audit-log viewer UI, richer nav. The full cross-tenant A-cannot-see-B isolation test is M3._
- [ ] **M3 — Intake.** STATUS: _not started_
  - Upload + parsing + canonical taxonomy + mapping UI (fuzzy, persisted) + period chain + validation gate (all §3.3 rules) + **tenant-isolation test against real RLS** (client A cannot read client B). Commit.
- [ ] **M5 — CORRECTNESS MILESTONE (§10.6).** STATUS: _not started_
  - Build the pure engine. Then: (a) **identity invariants** (§4.5) asserted every seeded period (non-circular). (b) **Golden fixture** at `/fixtures/golden-client.json` — but the CA fixture is NOT provided yet, so: generate engine output to `/fixtures/PROPOSED-golden.json`, mark every value `UNVERIFIED`, and put "golden fixture pending Ayush/CA sign-off" at the TOP of `MORNING-REVIEW.md`. **Never green-light correctness on self-authored values.** Cash-flow test runs across periods 2→3. Commit.
  - **CASH TIE-OUT INDEPENDENCE GUARD (locked at M1, verified):** the §4.5 "CF closing cash = BS closing cash" invariant is only non-circular if the two sides are sourced independently. The engine MUST read **BS closing cash from the mapped `cash_bank` TB lines** (the stored balance) and compute **CF closing cash from opening cash + NP + Δ(every non-cash account)** — the CF side must NEVER read period-t closing cash, and BS cash must NEVER be derived from the cash-flow statement. To prove the test is live (not a tautology on balanced seed data), include a **perturbation test**: overstate one non-cash TB line, assert the invariant FAILS. (Demonstrated at M1: corrupting non-cash assets by ₹10,000 broke the tie by exactly ₹10,000.) NOTE: this invariant catches **engine arithmetic** errors (sign/dropped line) — it does NOT validate number correctness; that remains the CA golden fixture (PENDING).
- [ ] **M6 — MIS view + PDF.** STATUS: _not started_
  - Render from the engine + MoM trend + commentary + PDF export. (PDF is the flaky step — if it's the only red item, log it, don't block the night.) Commit. ← P0 done.
- [ ] **M7+ — P1 in priority order**, each committed. Stub P2. STATUS: _not started_
- [ ] **M-final — Morning review.** STATUS: _not started_
  - Write `MORNING-REVIEW.md` (§11), final commit, ensure app boots clean with the seeded demo client and the full upload→map→compute→MIS→PDF thread runs across the three periods.

---

## 9. CORRECTNESS = PENDING (CA not available this session)

The reviewing CA is not available now, so no golden fixture is provided. Build the engine, run identity invariants, write `PROPOSED-golden.json` with all values `UNVERIFIED`. **No vCFO statement number is "correct" or client-visible until the CA signs off.** This is the rule from Bible §10 — PENDING means internal eyes only.

---

## 10. `MORNING-REVIEW.md` MUST CONTAIN

1. Boot command + demo login + which demo client/period to open.
2. What's working — per module + click-path; confirm upload→map→compute→MIS→PDF across 3 periods.
3. Correctness status — identity-invariant results (pass/fail) + golden-fixture status: **PENDING (UNVERIFIED, awaiting Ayush/CA)**. Never claim "correct" on self-authored values.
4. What's stubbed/not done + why.
5. Decisions for Ayush / CA — every `CA-VALIDATE` + `[ADD DETAIL]` + the `[INPUT REQUIRED]` golden-fixture numbers, one numbered list.
6. Blockers (top: any spine blocker from §8; any DB issue from M0.5).
7. Suggested next-session scope.

---

## 11. HANDOFF LOG (append-only; newest at bottom)

> One dated line per milestone or session boundary so the next instance knows exactly where things stand. First entry written at M0.

- **2026-06-08 · M0 [green]** — Created repo root `D:\AyushProjects\vcfo` (dropped "Saas" per Bible naming rule, operator-authorized — DECISIONS D-001). MOVED both build files out of `Downloads` into the repo: `vCFO-Build-Plan.md` (now the in-repo living backlog) + `vCFO-Dashboard-Knowledge-Bible.md` (name already correct). `git init -b main`; remote `origin` → https://github.com/AyushCapEasy/capeasy-vcfo.git (set, **not** pushed). Re-read Bible v1.1. Confirmed §5 stack tooling: node v24.15, npm 11.12, git 2.54, gh 2.93. Wrote `.gitignore` (all env secrets excluded), `.env.example`, `.env.local` (placeholder secrets — DECISIONS D-002), `BLOCKERS.md`, `DECISIONS.md`. Committed.
- **2026-06-08 · M0.5 [BLOCKED]** — Added reusable `scripts/db-preflight.mjs` (placeholder/wrong-ref guards + real `pg` connect). Ran it: **exit 2, BLOCKED** — `.env.local` still has placeholder secrets (anon key, service_role, DATABASE_URL password), so no live connection to `capeasy-vcfo` was possible. STOPPED at the gate; **no SQLite/local fallback** (a fake DB can't test RLS). Logged BLOCKERS B-001. **Next instance: do NOT start M1** until the operator fills the three real creds and `node scripts/db-preflight.mjs` exits 0.
- **2026-06-08 · M0.5 [still BLOCKED]** — Hardened `scripts/db-preflight.mjs` per operator rules: prints exact URL/ref + DB host:port before connecting (rule 6), exact-match gate on URL/ref, refuses the 6543 transaction pooler (rule 7, direct/session 5432 only), and a `--check` dry mode. Re-ran after operator said creds were real: `.env.local` is unchanged from the M0 scaffold (placeholders intact) and exists nowhere else. Did NOT connect; did NOT enter M1. Awaiting real creds saved into `D:\AyushProjects\vcfo\.env.local`.
- **2026-06-08 · M0.5 [green]** — Operator saved the **real** `capeasy-vcfo` secrets into `.env.local` (anon, service_role, DATABASE_URL password). `npm init -y` + `npm install pg` (created `package.json`/`package-lock.json`/`node_modules`, all gitignored except the two manifests). Ran `node scripts/db-preflight.mjs` → exit **0**: CONNECTED to `capeasy-vcfo` (ref `rsaztdwxrzgyxkvxrqrt`), **PostgreSQL 17.6**, db `postgres`. Guardrails held (URL/ref exact-match, 5432 direct). The literal `@` in the DB password parsed fine (last-`@` userinfo rule + modern `pg` `new URL`), so the connection string was left untouched. **B-001 RESOLVED.** Spine unblocked → entering M1 (schema + seed).
- **2026-06-08 · M2 [green — foundation]** — Finished the M2 auth foundation on the scaffold below. Operator chose **admin-provisioned auth, no public signup** + seed first admin (DECISIONS **D-004**). Added migration `0006_profile_on_signup.sql` (auto-create `profiles` per auth user; applied — 6/6 migrations now). `scripts/seed-admin.mjs` (service_role Auth Admin API; guardrailed to ref `rsaztdwxrzgyxkvxrqrt` via both DATABASE_URL and NEXT_PUBLIC_SUPABASE_URL) created `ayush@capeasy.in` as admin with a one-time temp password and made them admin-member of the demo org. Built: `/login` (server action + `useActionState` client form), sign-out action, **auth gating in the proxy** (unauthenticated → `/login`), append-only **audit writes** on login/logout, and a minimal analyst shell (`/`) listing RLS-scoped client orgs with per-org role. **Runtime-verified via the ANON key** (a throwaway harness, then deleted): anon → 0 orgs (RLS denies); signed-in admin → only `Acme Foods Pvt Ltd` + its 3 periods. `build`/`typecheck`/`lint` GREEN. Deferred (non-spine): in-app analyst-provisioning UI, audit-log viewer, richer nav. **Next: M3 (Intake)** — TB upload (CSV/XLSX), canonical-CoA mapping UI (fuzzy, persisted), validation gate (all §3.3 rules), period chain, and the **cross-tenant RLS isolation test** (client A cannot read client B).
- **2026-06-08 · M2 [partial→scaffold]** — Before M2, the operator asked for two evidence-backed checks on the D-003 seed fix: (1) "cash as balancing residual" must be seed-only and absent from the engine — **confirmed** (no engine exists yet; grep finds residual/balancing only in the seed + docs; the seed holds cash as a hardcoded input + an independent balance assertion, not a runtime plug); (2) the §4.5 "CF closing = BS closing" invariant must be independent — **confirmed** by a runnable harness vs the live DB (BS side reads only the stored `cash_bank` line; CF side reads only opening cash + NP + Δ non-cash accounts, never period-t closing cash; they tie on real data, and corrupting one non-cash line by ₹10,000 broke the tie by exactly ₹10,000 → the invariant is live). Locked the independence requirement + a perturbation test as an M5 guard (commit 6c2b09a). Both clean → started M2: **scaffolded Next.js 16.2.7 + React 19 + Tailwind v4** (`src/` layout, `@/*` alias) via create-next-app in a temp dir and merged it into the repo (kept my `.gitignore`/DB tooling/migrations/`.env`; dropped the scaffold's `CLAUDE.md`/`README`/svg boilerplate). Added typed `@supabase/ssr` clients (server `lib/supabase/server.ts`, browser `client.ts`) + session refresh on the Next 16 **proxy** convention (`src/proxy.ts` → `lib/supabase/session.ts`), all typed against the generated `Database`; relocated `database.types.ts` → `src/lib/`; merged `package.json` (Next + db scripts + `pg` + Supabase). Removed `"type":"commonjs"` (conflicted with ESM app source). `npm run build`/`typecheck`/`lint` all GREEN. **Next (finish M2):** login + sign-out + auth gating in the proxy, org/role gating, app shell/nav, audit-log writes + viewer — then the cross-tenant RLS isolation test lands at M3.
- **2026-06-08 · M1 [green]** — Resumed after the prior terminal was killed mid-M1 (it had applied the 5 migrations but died before the seed). Added `scripts/_env.mjs` (single guardrailed `.env.local` loader: refuses placeholders, any ref ≠ `rsaztdwxrzgyxkvxrqrt`, and the 6543 pooler — reused by all DB scripts), `scripts/db-migrate.mjs` (plain-SQL runner, checksummed in `public.schema_migrations`, transactional, no `supabase link`/token per §5), `scripts/seed.mjs`, `scripts/db-check.mjs` (read-only verifier), `scripts/gen-types.mjs`. **Schema:** migrations `0001_extensions_enums` → `0005_audit_log` all applied — 16 public tables; RLS enabled on every org-scoped table (only the internal `schema_migrations` tracker is exempt); 31-row canonical Account Category taxonomy; Period chain with first-class `prior_period_id` (+ same-org trigger); append-only `audit_log`; schedules. **Seed:** the seed's own identity assertions (TB balance, Assets=L+E+NP, RE roll) **caught a defect** — first-draft demo numbers were each out by exactly that month's electricity (omitted from cash + the RE roll). Fixed by rolling RE on true net profit and making cash the balancing residual; electricity kept as a real mapped expense (DECISIONS **D-003**). Re-seeded **Acme Foods Pvt Ltd** + 3 chained periods (Apr `locked` → May `reviewed` → Jun `draft`): 75 TB lines, 25 mappings, AR/AP/cash/revenue/debt/headcount schedules; `db-check` confirms all 3 TBs balance straight from Postgres. **Types:** `supabase gen types --db-url` needs Docker (not running here), so generated `database.types.ts` via Docker-free direct introspection (`scripts/gen-types.mjs`, same guardrailed connection) — Supabase-shaped `Database` type, compiles `tsc --noEmit --strict`. Wired npm scripts `db:migrate[:status]`, `db:seed`, `db:check`, `db:types`. No new blockers. **Next: M2** — auth + multi-tenant + roles + shell + audit-log wiring (first code that exercises the RLS policies as a real `authenticated` user; M3 then does the cross-tenant isolation test).

---

*This file is the backlog and the contract. The Bible is the formula spec. Begin at M0; supervise M0.5 and M1; then run unattended through M-final.*
