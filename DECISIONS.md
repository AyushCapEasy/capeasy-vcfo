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

- **[VALIDATE]** Cash-flow indirect construction + tax-line treatment (Bible §4.1, §11).
- **[VALIDATE]** MRR / churn definitions per client model (Bible §4.4, §11).
- **[VALIDATE]** All statutory dates against official portals; TY 2026-27 transitional edge cases (§6).
- _(Engine `CA-VALIDATE:` code comments will be mirrored here as they are written, from M5 onward.)_
