# MORNING REVIEW — vCFO MIS Engine

> 🔴 **#1 OPEN BLOCKER — M7.5: CA GOLDEN-FIXTURE DIFF (pending CA figures).** The CA hand-computed Acme's
> 3-period P&L/BS/CF and (per operator) they matched the engine — but it is **NOT recorded yet**. Enter her
> figures into `fixtures/golden-client.json` (vessel created, null slots), diff field-by-field vs the engine,
> and flip the fixture to **VERIFIED only on a full exact match** (mismatches are engine bugs). **Until this
> gate is green, NOTHING client-facing proceeds:** `VCFO_WATERMARK_OFF` stays unset, the watermark stays ON,
> no client-facing surface ships.
>
> ⛔ **GOLDEN FIXTURE PENDING CA SIGN-OFF.** Every computed number is **UNVERIFIED** — `fixtures/PROPOSED-golden.json`
> (all values UNVERIFIED) + the demo `database` numbers are **exercise data**, not CA-checked. **No statement
> number is "correct" or client-visible until the CA signs off** (Bible §10.6). CA-VALIDATE list in §5 (now also
> includes the M7 observation thresholds, mirrored into `ca_validate`).

_Build state: M0 → M8 green (Tiers 1–3 insight layer, built on the UNVERIFIED engine). 🔴 M-verify (CA golden-fixture diff) is the #1 open blocker. ⚠️ Tiers 2 & 3 (diagnoses / recommendations / goals) are interpretation & advice computed on UNVERIFIED numbers — re-validate every one against the engine after the CA diff. Watermark ON._

---

## 1. Boot

```bash
npm install
npm run dev            # http://localhost:3000  (redirects to /login)
```
- **Login:** `ayush@capeasy.in` — password is in the gitignored `.admin-credentials.local` (reset with `node scripts/seed-user.mjs ayush@capeasy.in --role admin --org all`; see D-011). Change it on first login.
- **Demo client:** **Acme Foods Pvt Ltd** → 3 chained periods **Apr (locked) → May (reviewed) → Jun (draft)**. Open a period to exercise intake.
- **Engine / correctness (headless):**
  ```bash
  npm test          # 14 unit tests incl. §4.5 invariants + the perturbation test
  npm run fixture   # regenerate fixtures/PROPOSED-golden.json + print invariants & perturbation
  npm run test:rls  # cross-tenant isolation against live sessions
  ```

## 2. What's working (per module)

| Module | State | Click-path / command |
|---|---|---|
| **Auth + multi-tenant + roles** (M2) | ✅ | `/login` → shell lists only the client orgs you're a member of (RLS) |
| **Intake** (M3) | ✅ | client → period → upload CSV/XLSX → **confirm how it was read** (column mapping, sign-flip proposals, skips) → map accounts (fuzzy, persisted) → §3.3 validation gate → finalise |
| **Computation engine** (M5) | ✅ (UNVERIFIED) | `src/lib/engine` — P&L, BS, Cash Flow (2-period), ratios, working capital, startup metrics + §4.5 invariants |
| **MIS pack + PDF** (M6) | ✅ (demo-grade, UNVERIFIED) | client → **View MIS pack** → period pills · click a P&L/BS line to drill into mapped accounts · **Export PDF** · **Download workbook** · edit + save commentary |

**upload → map → compute → MIS → PDF across 3 periods:** the full thread is exercisable. The MIS pack renders
all statements from the engine, with PDF export and a source-workbook download. **Every screen and PDF carries
the SAMPLE watermark; every number is UNVERIFIED.**

> **Watermark removal (after CA sign-off Thursday):** set env `VCFO_WATERMARK_OFF=1` (or flip `WATERMARK_ENABLED`
> in `src/lib/watermark.ts`). ONE change clears the watermark from every screen and PDF. It does NOT make any
> number "correct" — that still needs the CA-checked golden fixture replacing `PROPOSED-golden.json`.

## 3. Correctness status — PENDING (UNVERIFIED)

- **§4.5 identity invariants — all PASS on the seeded data** (every period):
  - TB integrity, Balance-sheet identity — pass Apr/May/Jun.
  - Cash tie-out (CF closing = BS closing) — pass May & Jun (n/a Apr, first period). The two sides are
    **independently sourced** (BS cash = stored `cash_bank`; CF closing = opening cash + Δ non-cash accounts).
  - P&L → equity (opening RE rolls by prior NP) — pass May & Jun.
- **Perturbation / independence test — PASS:** corrupting Jun `trade_receivables` by +₹50,000 (a non-cash
  line) breaks the cash tie-out by **exactly ₹50,000** — proving the invariant is live, not a tautology.
- **Golden fixture — PENDING.** `fixtures/PROPOSED-golden.json` holds the engine's output with **every value
  UNVERIFIED**. These are **self-authored** numbers; per Bible §10.6 they are NOT correct until a CA reviews
  them. The CA-checked three-period fixture is an `[INPUT REQUIRED]` (cannot be auto-generated).

## 4. What's stubbed / not done

- **P0 is complete** (foundation → intake → engine → MIS pack + PDF). All numbers remain UNVERIFIED.
- **Investor view (B), Cash & runway (C), AR/AP aging UI, compliance calendar** — P1, not started.
- **In-app analyst provisioning UI / audit-log viewer** — deferred (D-004); admins use `scripts/seed-user.mjs` (D-011).
- **Startup metrics needing customer/churn data** (CAC, LTV, NRR, churn, ARPA) — return n/a (no inputs).
- **`xlsx` dependency advisory** — B-002, swap to SheetJS official build before client launch.

## 5. Decisions for Ayush / CA — the CA-VALIDATE list (for Thursday)

> Everything below is a self-authored assumption that needs **CA sign-off** before any real client file.
> Each `*Paise` value in the fixture is integer paise (÷100 for ₹).

1. **CA-VALIDATE — Cash-flow indirect construction:** capex is reconstructed as `Δ(net depreciable assets) + D&A`
   — i.e. **no disposals** assumed; **dividends/distributions assumed 0** (no data in v1); tax sits in operating CF.
2. **CA-VALIDATE — Parenthesis / sign-handling rules (D-006):** a parenthesised/negative value in a debit/credit
   column is **never auto-moved** between sides; it raises an opt-in proposal. The default reading and the
   proposal wording need CA sign-off; accepted flips are provisional.
3. **CA-VALIDATE — P&L other-income placement:** other income placed below EBIT (non-operating), before tax.
   (Seed = 0 → no effect on these numbers.)
4. **CA-VALIDATE — Startup metric definitions (Bible §4.4):** burn / MRR / churn definitions vary by model;
   confirm the client's recurring-revenue definition (MRR currently = `schedule_revenue_detail.is_recurring`).
5. **D-003 (exercise data) — RE roll & cash residual:** the demo seed's retained-earnings roll and cash-as-balancing-
   residual make the books articulate; these are exercise numbers, not a fixture.
6. **`[INPUT REQUIRED]` — The three-period golden-fixture numbers, CA-checked.** This is the blocker for green-
   lighting correctness: cannot be auto-generated. `PROPOSED-golden.json` is the placeholder until provided.
7. **`[ADD DETAIL]` — TB upload column format (D-005):** built to `account_code, account_name, debit, credit`
   (₹, CSV/XLSX) with header-synonym tolerance — confirm against a real client export before locking.
8. Other open `[ADD DETAIL]` items carried in `DECISIONS.md` (fee model, budgets format, integration priority).

## 6. Blockers

- **Spine / DB:** none. (`BLOCKERS.md` top section clear; B-001 DB pre-flight resolved.)
- **Known non-spine:** B-002 — `xlsx` advisory (internal/trusted uploads only for now).

## 7. Suggested next-session scope

- **After CA sign-off (Thursday):** (a) replace `PROPOSED-golden.json` with the CA-checked `golden-client.json`
  and assert the engine against it (closes the correctness loop, Bible §10.6); (b) clear the watermark
  (`VCFO_WATERMARK_OFF=1`); (c) resolve the CA-VALIDATE list (§5).
- **P1 (when ready):** Investor view (B), Cash & runway (C), AR/AP aging + schedule intake, compliance
  calendar. Same engine, more templates.
