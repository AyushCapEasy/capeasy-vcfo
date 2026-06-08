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

---

## OPEN — needs Ayush ([ADD DETAIL]) — carried from Bible §11

- **[ADD DETAIL]** Exact standard TB upload template columns. Plan default to implement unless told
  otherwise: `account_code, account_name, debit, credit` (Plan §6). _(due before M3)_
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
