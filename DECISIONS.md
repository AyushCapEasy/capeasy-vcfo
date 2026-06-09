# DECISIONS — vCFO MIS Engine

> Append-only log of every decision needing **Ayush** or the **CA**: each `CA-VALIDATE`, `[ADD DETAIL]`,
> `[VALIDATE]`, and `[INPUT REQUIRED]` raised during the build, plus build-time calls the agent made that
> the operator should be able to review/override (Build Plan §0, §10; Bible §11). Newest at bottom.

---

## Decisions already taken (agent, operator-authorized)

### D-001 · Project folder name = `D:\AyushProjects\vcfo` (dropped "Saas")
- **Date:** 2026-06-08 · **Milestone:** M0.
- **Context:** Build Plan §2 specifies the root as `D:\AyushProjects\vcfo Saas`, but the Bible's
  load-bearing v1.1 change (changelog, §0, §1) is *"this is an internal MIS engine, **not 'SaaS'** —
  drop the word."* The two disagreed.
- **Decision:** Operator instructed "keep the folder name mentioned in the Bible," so the banned word
  was removed → root is **`D:\AyushProjects\vcfo`**. Side benefit: removes the space that caused
  Windows/git quoting friction. Repo remote unchanged (`capeasy-vcfo`).
- **Reversible?** Yes — trivial folder rename at this stage. Flag if `vcfo Saas` verbatim was intended.

### D-002 · `.env.local` scaffolded with placeholder secrets (no fabrication)
- **Date:** 2026-06-08 · **Milestone:** M0.
- **Context:** Operator said "if there's no .env.local, create one." The agent must not fabricate or
  hunt for credentials (§3).
- **Decision:** Created `.env.local` with the **known non-secret** values from §2 (Supabase URL, ref,
  region) and explicit `REPLACE_*` **placeholders** for the three secrets. Real values are an operator
  input. See BLOCKERS.md B-001.

### D-003 · M1 seed numbers corrected so the demo ledger articulates (exercise data, not golden)
- **Date:** 2026-06-08 · **Milestone:** M1.
- **Context:** `scripts/seed.mjs` self-asserts the accounting identities before writing to the DB
  (TB balances, Assets = Liab + Equity + NetProfit, retained-earnings roll). The first-draft figures
  failed the gate: every period was out by **exactly that month's electricity** (Apr 40,000 · May 42,000 ·
  Jun 45,000), and each retained-earnings opening was short by the **prior** month's electricity. Root
  cause: electricity correctly reduced P&L profit but had been omitted from the cash balance and the RE roll.
- **Decision:** Kept every P&L line (electricity stays a real mapped expense — it still demonstrates the
  6100+6110 → `rent_utilities` many-to-one mapping) and made the books articulate by (a) rolling
  `re_opening` on the prior month's **true** net profit, and (b) letting **cash** be the balancing residual.
  New values — cash: Apr 5,135,000 · May 4,989,500 · Jun 5,369,750; re_opening: May 1,822,500 · Jun 2,119,500.
  All three identity assertions now pass; TBs verified balanced straight from Postgres.
- **Scope note:** These are **exercise numbers only** (Build Plan §8 / Bible §3.5) — they make delta
  metrics (cash flow, burn, MoM) exercisable. They are **NOT** the CA-checked golden fixture (Bible §10.6),
  which remains an external `[INPUT REQUIRED]` and will be emitted UNVERIFIED at M5.
- **Reversible?** Yes — seed-only; rerun `npm run db:seed` (idempotent, wipes + re-inserts the demo org).
- **Forward guard (verified 2026-06-08, for M5):** because the seed's `cash` is the balancing
  residual, the demo books balance *by construction*. That does NOT make the §4.5 "CF closing cash =
  BS closing cash" invariant circular — the plug lives in the **seed (data generator)** only; there is
  no residual/plug logic in any engine or shared module (the engine doesn't exist yet, and grep finds
  "residual/balancing" only in the seed + these docs). Verified by a runnable harness against the live
  DB: the BS side reads only the stored `cash_bank` line, the CF side reads only opening cash + NP +
  Δ(non-cash accounts) and **never** the period's closing cash; they tie on real data, and overstating
  one non-cash line by ₹10,000 broke the tie by exactly ₹10,000 (the invariant FAILED, proving it is
  live). The engine at M5 MUST preserve this independence (BS cash from TB `cash_bank`, never from the
  CF statement) and ship the perturbation test. The invariant checks **engine arithmetic**, not number
  correctness — correctness stays the CA golden fixture (PENDING, Bible §10.6).

### D-004 · Auth = admin-provisioned, no public signup; first admin = ayush@capeasy.in
- **Date:** 2026-06-08 · **Milestone:** M2. · **Operator-confirmed** (chose "Admin-provisioned, no
  public signup" + "Seed ayush@capeasy.in, temp password I disclose").
- **Context:** v1 is internal, not self-serve (Build Plan §1, §6). Real email is mocked in v1, so
  magic-link / email-invite flows can't actually send. Internal staff still need accounts.
- **Decision:** No public `/signup` route. Accounts are admin-provisioned. The **first admin**
  (`ayush@capeasy.in`) is bootstrapped by `scripts/seed-admin.mjs` (Supabase Auth Admin API via the
  service_role key, server-side only) with a **random temp password disclosed once** in the script
  output — change on first login. Migration `0006_profile_on_signup.sql` auto-creates a `public.profiles`
  row for every `auth.users` insert, so seeded and future in-app users are uniform. The admin is added
  as an admin-member of every existing client org so RLS grants visibility.
- **Deferred:** the in-app UI for an admin to create/invite analysts and assign roles. Until it exists,
  add analysts by running `node scripts/seed-admin.mjs <email>` (then grant org membership). Also deferred:
  an audit-log viewer (writes already happen on login/logout).
- **Reversible?** Yes — auth model is app-level; switching to open signup later is a route + policy change.

### D-005 · TB upload column format built to the default guess (still `[ADD DETAIL]` — confirm vs a real export)
- **Date:** 2026-06-08 · **Milestone:** M3. · The exact lock-format is an Ayush input (Bible §3.4, Plan §6).
- **What I assumed & built (the default):** a header row with four columns — **`account_code`, `account_name`,
  `debit`, `credit`** — with values in **₹** (rupees), CSV or XLSX (first sheet).
- **Tolerances I added so a real Tally/Zoho/Excel export is more likely to load without hand-editing:**
  header synonyms (e.g. `code`/`ledger code`/`gl code`; `particulars`/`ledger`/`name`; `dr`/`debit amount`;
  `cr`/`credit amount`); a header row that isn't the first row (scans the first 15); ₹/Rs/INR symbols and
  comma grouping stripped; parentheses/leading-minus = negative; a row is **net-normalized** (debit−credit)
  to a single side; obvious `Total`/`Grand Total` rows skipped; blank rows ignored. A non-numeric amount or
  a layout missing any of the four roles **fails the upload** with an analyst-facing message.
- **Still open:** confirm these columns/headers against a **real client TB export** before we lock the format.
  If the real export differs (single signed `amount` column, multi-currency, sub-ledger columns, etc.), the
  header-synonym table + parser are the only things that change.
- **Reversible?** Yes — parsing is isolated in `src/lib/intake/parse.ts`; the lock is a config-level change.

### D-006 · Parse-confirmation step — tolerances are shown and approved, never silent (traceability)
- **Date:** 2026-06-08 · **Milestone:** M3. · **Operator-directed** (M3 review): silent parser tolerances
  violate Bible §8.5 — a misread column can produce a **balanced-but-wrong** TB the gate cannot catch
  (it still balances).
- **Decision:** upload no longer writes intake data directly. The raw file grid is **staged**
  (`tb_upload_staging`, migration 0007); the analyst is shown a **"here's how I read your file"** screen —
  the column→role mapping (reassignable), **every** row where a sign was flipped / `(x)` converted / a side
  moved (with the original vs read value + reason), **every** skipped row (e.g. `Total`) with its original
  text, and the resulting Σdebits/Σcredits — and must **Confirm** before anything is written to
  `trial_balance_lines`. Reject → reassign columns and re-read, or cancel. Tolerances are kept (so real
  exports still load) but are now **visible and approved**, not automatic. Confirm re-parses the staged grid
  server-side (never trusts client numbers) and records the approved adjustment/skip counts in the audit log.
- **Reversible?** Yes — staging + confirm is additive; the parser/gate are unchanged underneath.

### D-007 · Data isolation — `capeasy-vcfo` (ref `rsaztdwxrzgyxkvxrqrt`) is PERMANENTLY the dev/demo DB
- **Date:** 2026-06-09 · **Milestone:** deploy prep. · **Operator-directed** · **PERMANENT — do not revisit
  casually.**
- **Decision:** The Supabase project `capeasy-vcfo` (ref `rsaztdwxrzgyxkvxrqrt`) is the **dev/demo database
  forever** — **fake Acme/Globex demo data only**. Local development **and every Vercel environment**
  (Preview **and** Production) point at this one project. **No real client trial balance is ever loaded into
  this project.**
- **When real client data is needed (later):** it goes into a **SEPARATE, deliberately-provisioned Supabase
  project**, stood up **after a security review** — not reusing this one, and not tonight. Provisioning that
  project is the deliberate act of pointing tooling at a new ref (see guard below).
- **Why this is written down:** so **no future instance or teammate reasons _"it's the only DB, so the real
  client file goes here."_** It is the only DB *on purpose*; that does not make it the right home for real data.
- **Guards in place (cheap):**
  - **Runtime:** the `SAMPLE — UNVERIFIED · NOT FOR CLIENT USE` watermark (`src/lib/watermark.ts`) stays **ON**
    in all environments — `VCFO_WATERMARK_OFF` is **never** set in any Vercel environment. Every screen and
    export is visibly marked as non-client demo output.
  - **Tooling:** `scripts/_env.mjs` pins **all** DB tooling (migrate/seed/preflight/rls-test) to this exact
    ref and refuses any other (Build Plan §3), and now prints a loud `DEV/DEMO DATABASE` banner on every run.
    Pointing tooling at a different project requires a deliberate code change to `REF` — the natural gate for
    the security-reviewed real-client project.
- **Reversible?** The dev/demo designation is **permanent**. The real-client project is **additive** (a new,
  separate project), never a migration of this one.

### D-008 · Deploy & protection posture (Vercel) + pre-deploy security gate
- **Date:** 2026-06-09 · **Milestone:** deploy prep. · **Operator-directed.**
- **Security gate (must complete BEFORE the first push/connect):** the Supabase DB password is **rotated**
  (dashboard), the new value goes into `.env.local` **only** (never Vercel — see env vars below), and the old
  value is **purged from local git history** as belt-and-suspenders (history never left this machine — remote
  is empty). See BLOCKERS.md B-001. Standing rule: **no secret in any tracked file, commit, or chat — ever.**
- **Protection:** **Vercel Authentication** (per-person, revocable SSO), enabled on **both Preview and
  Production**. **Not** a shared password.
- **Branches:** Vercel **Production Branch = `production`** (manual-promote). **`main` = Preview only.**
  `production` is created **deliberately/empty**, and the production-branch setting is applied **before** `main`
  is ever pushed, so connecting the repo does **not** trigger an accidental first production deploy.
- **Env vars in Vercel (Production + Preview):** **ONLY** `NEXT_PUBLIC_SUPABASE_URL` and
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`. `SUPABASE_SERVICE_ROLE_KEY` and `DATABASE_URL` are **NOT** added to Vercel.
  Verified: the deployed app (`src/`) reads only those two public vars (+ platform-set `VERCEL`/
  `AWS_LAMBDA_FUNCTION_NAME` and the local-only `PUPPETEER_EXECUTABLE_PATH`); `service_role`/`DATABASE_URL`
  appear in `src/` only inside comments, and are used at runtime by `scripts/` (never deployed) alone.
- **Watermark:** stays **ON everywhere** — `VCFO_WATERMARK_OFF` is **never** set in any Vercel environment
  (ties to D-007). `src/lib/watermark.ts` defaults ON unless `VCFO_WATERMARK_OFF=1`.
- **PDF route (`/clients/[orgId]/mis/pdf`):** uses `puppeteer-core` + `@sparticuz/chromium`, which needs
  raised limits — `maxDuration = 60` (route-segment export) and `memory = 1536` MB (`vercel.json` `functions`,
  glob `src/app/**/mis/pdf/route.ts` to avoid `[orgId]` being read as a glob char class). **Known caveat:**
  serverless cold starts for chromium are flaky — **acceptable for now, flag if it fails** in production.
- **Reversible?** Yes — all of this is Vercel project config + a small `vercel.json`; nothing here is a
  one-way door.

### D-009 · Standing rule — no secret in any tracked file, commit, or chat (ever)
- **Date:** 2026-06-09 · **Operator-directed** · **PERMANENT standing rule.**
- **Rule:** No secret of any kind ever goes in a **tracked file** (not `BLOCKERS.md`, not `DECISIONS.md`, not
  any doc), a **commit message**, a **code comment**, or **chat**. Secrets live **only** in gitignored env
  files (`.env.local`, `.admin-credentials.local`). Reference secrets in docs by name/placeholder
  (e.g. `REPLACE_WITH_DB_PASSWORD`), never by value.
- **Why:** A DB password was written verbatim into `BLOCKERS.md` and committed (`948f6db`) — the same class of
  error as an admin password pasted into chat earlier. Both leak credentials into durable, reviewable places.
- **How to apply:** If a secret is heading toward any tracked file or chat, STOP and flag it; put it in a
  gitignored env file. If a secret already landed in a tracked file/history, **rotate first, then purge** the
  old value from history.
- **Source of truth:** This file (DECISIONS.md). Governance for this build lives **only** in tracked,
  auditable files — never in an external/agent-private store. (A prior copy of this rule mistakenly written to
  Claude Code's out-of-repo memory store has been deleted; this entry replaces it.)

### D-010 · Vercel CLI/API access uses a project-scoped token only (never account-wide)
- **Date:** 2026-06-09 · **Operator-directed** · **PERMANENT standing rule.**
- **Rule:** If/when Vercel CLI or API access is ever needed for automation, create an access token
  **scoped to the `capeasy-vcfo` project only** — **never** an account-wide or team-wide token. Such a token
  is a secret → it lives only in a gitignored env file, never committed, printed, or pasted in chat (D-009).
- **Context:** The first Preview deploy used **no token** — the two `NEXT_PUBLIC_*` env vars were added via
  the Vercel dashboard (Path A), and `main` is pushed via the existing GitHub credentials.
- **Live deploy posture confirmed (2026-06-09):** Vercel Authentication = **All Deployments** (verified in
  incognito → redirects to Vercel login), Production Branch = **`production`** (so `main` = Preview only),
  Vercel env = **only** `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` on Production + Preview;
  `VCFO_WATERMARK_OFF` unset (watermark on). See D-008.

---

## OPEN — needs Ayush ([ADD DETAIL]) — carried from Bible §11

- **[ADD DETAIL]** Exact standard TB upload template columns. **Built to the default at M3** —
  `account_code, account_name, debit, credit` (₹, CSV/XLSX) with header-synonym tolerance (see **D-005**).
  Still needs Ayush to confirm the lock against a **real client export** before we freeze the format.
- **[ADD DETAIL]** Rebuild-vs-extraction monthly-hours split (Bible §0.1) — the real build/no-build input.
- **[ADD DETAIL]** Which accounting system to prioritise for *eventual* integration.
- **[ADD DETAIL]** Fee model + prep TAT (recurring placeholders).
- **[ADD DETAIL]** Budgets/forecasts captured? In what format? (gates budget-vs-actual, P2)
- **[INPUT REQUIRED]** The **three-period golden-fixture numbers, CA-checked** (Bible §10.6) — blocks the
  M5 correctness green-light; **cannot be auto-generated**. M5 will emit `PROPOSED-golden.json`
  (all values `UNVERIFIED`) until provided.

## OPEN — needs CA ([VALIDATE] / CA-VALIDATE)

- **CA-VALIDATE** Parenthesis / leading-minus sign-handling rules in TB intake (`src/lib/intake/parse.ts`).
  These are **accounting rules, not parsing rules** — a parenthesised/negative value in a debit or credit
  column *might* mean it belongs on the opposite side (a refund booked as a negative, a contra entry, etc.),
  and that changes the statements. The engine therefore **never** moves a value between debit/credit
  automatically: it imports as written in the original column and offers an opt-in per-row flip the analyst
  accepts (M3 add-on, D-006). **The default interpretation and the wording of the proposal need CA sign-off
  before any real client file is processed.** Until then, treat accepted flips as provisional.
- **CA-VALIDATE (M5 engine)** Computation assumptions in `src/lib/engine` (mirrored in `fixtures/PROPOSED-golden.json` → `ca_validate`): **capex reconstructed as Δ(net depreciable assets) + D&A (no disposals)**; **dividends/distributions assumed 0** (no data in v1); **other income placed below EBIT, before tax** (seed = 0). All engine output is **UNVERIFIED** until CA sign-off (§10.6).
- **[VALIDATE]** Cash-flow indirect construction + tax-line treatment (Bible §4.1, §11).
- **[VALIDATE]** MRR / churn definitions per client model (Bible §4.4, §11).
- **[VALIDATE]** All statutory dates against official portals; TY 2026-27 transitional edge cases (§6).
- _(Engine `CA-VALIDATE:` code comments will be mirrored here as they are written, from M5 onward.)_
