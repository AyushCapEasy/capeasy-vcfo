# DEV-CYCLE-LOG.md — Autonomous Tally-hardening cycle (2026-06-20)
**Branch:** `m-tally` · **Scope:** GAP-3 (productionize parser), GAP-1 (closing stock), prepare merge plan. **Self-validating against the proven Orafor numbers.** No merge/push/deploy; Orafor data stayed in-memory/gitignored/uncommitted.

## Verdict at a glance
| Task | Hard criterion | Result | Commit |
|---|---|---|---|
| **1 — GAP-3 parser** | production path reproduces harness Orafor reconstruction to the rupee | ✅ **PASS** — 33/33 checks match | `e61071d` |
| **2 — GAP-1 closing stock** | production auto-produces COGS ≈ ₹50.9L + net −₹2,53,864 without the manual credit | ✅ **PASS** — exact | `dbb41fa` |
| **3 — merge plan (prepare only)** | `MERGE-PLAN.md` produced, nothing merged | ✅ **DONE** — see `MERGE-PLAN.md` | (this commit) |

**Gate after every commit:** typecheck ✓ · lint ✓ (0 errors) · build ✓ · **tests 65/65 ✓** (was 63 at cycle start; +2 committed tests).

---

## Task 1 — GAP-3: productionize the two-file UTF-16 parser ✅ PASS
**Built (in `src/lib/tally/`, hardcodes nothing):** `decodeTallyXml` (BOM-aware UTF-16 LE/BE + UTF-8 fallback) · `parseTallyMasters` (LEDGER → PARENT group + `<OPENINGBALANCE>`-as-closing, debit-negative → dr-positive) · `parseTallyDayBook` (live-voucher Σ(−AMOUNT)/ledger; skips cancelled/deleted/optional) · `reconstructFromTallyExports(masters, dayBook)` (closing = master field where present, else postings). Single-file DATA/DISPLAY paths untouched.

**Self-validation (Orafor, production path vs validated answer key) — all to the rupee:**
- parse.format=`masters_daybook`, 660 ledgers, 659 with group
- TB Σdebit ₹2,22,82,420 · Σcredit ₹1,60,43,351 ✓
- classification coverage 174/191 auto (91.1%) ✓
- every reconstructed P&L + BS line (revenue ₹87,02,534, raw COGS ₹94,80,469, AR ₹21,75,924, inventory ₹43,85,970, director loan ₹49,79,756, …) ✓
- **33/33 checks PASS.** Committed test: `tally.test.ts` "GAP-3 two-file masters+daybook (UTF-16)" on a synthetic sample (no client data).

## Task 2 — GAP-1: closing-stock auto-credit ✅ PASS
**Research finding:** Orafor's closing stock lives as the **Stock-in-Hand group ledger balance** ("Opening Stock" ledger, `<OPENINGBALANCE>` −43,85,970 → dr ₹43,85,970). STOCKITEM masters are empty; `<ALLINVENTORYENTRIES.LIST>` carry no usable values → **no separate Stock Summary export needed** — closing stock is derivable from the masters export.

**Built:** `buildStatements(decisions, { creditClosingStock, openingStockPaise })` credits the closing inventory balance to COGS (cost of materials **consumed** = gross purchases − ΔStock); `reconstructFromTallyExports` enables it by default. Honest degradation: warns when credited ("assumes nil opening stock") and when an inventory/COGS book has **no** Stock-in-Hand balance ("COGS may be overstated").

**Self-validation (Orafor, production, automatic — no manual credit):**
- closing-stock credit **₹43,85,970** ✓
- COGS (consumed) **₹50,94,499** (≈ ₹50.9L) ✓
- net result **−₹2,53,864** ✓ (matches audited; ties to Tally's own P&L A/c ledger)
- Committed test: `tally.test.ts` "GAP-1 closing-stock credit" (synthetic; off→gross COGS, on→consumed + statements articulate).

**Limitation (logged):** assumes **nil opening stock** unless `openingStockPaise` is supplied — correct for first-year/new-inventory books (Orafor); a continuing inventory business (year 2+) must supply opening stock. Not a silent wrong number — it's warned.

## Task 3 — branch consolidation: PREPARED, NOT EXECUTED ✅
See **`MERGE-PLAN.md`**. Summary:
- Branches are near-orthogonal; **only `package.json` conflicts** (m-tally ↔ m-zoho, both append a script after `db:types`; trivial — keep all 4 scripts). `visual-revamp` is conflict-free.
- 🔴 **D-014 (real-data-permitted) lives only on `m-zoho` — must land on main.** Plus a scope nuance for Ayush: D-014 scopes "real" to own-firm Zoho first, but the Orafor validation used a client's gitignored/in-memory export — confirm wording or amend.
- **Recommended order: `m-zoho` (lands D-014, clean) → `m-tally` (resolve 1 package.json conflict) → `visual-revamp` (clean).**
- `production` is 11 commits behind main — deploy is a separate, deliberate step (fenced).

---

## What's done / blocked / next
- **Done:** GAP-3 + GAP-1 built, productionized, self-validated against Orafor to the rupee, committed on `m-tally`; merge plan prepared. The engine now reconstructs an inventory business end-to-end from raw two-file Tally exports through PRODUCTION code (no scratch harness) — 0 manual steps.
- **Blocked:** nothing. Both hard criteria met.
- **Recommended next move (Ayush, 5-min decision):**
  1. Execute `MERGE-PLAN.md` (m-zoho → m-tally → visual-revamp), ensuring **D-014 lands on main** and the scope nuance is reconciled.
  2. Decide the GAP-1 **opening-stock** input path for continuing inventory clients (UI field / second export) — only gap remaining for full inventory coverage.
  3. RULE-REVIEW §A6/A7/A8 (capitalization, director remuneration, loan current/non-current) still await the one-time CA review (fenced — needs you).
  4. `production` is 11 behind main — schedule a deliberate promote/deploy after consolidation.

**Commits this cycle (on `m-tally`):** `e61071d` (GAP-3) · `dbb41fa` (GAP-1) · this commit (MERGE-PLAN + log). Prior Orafor commits: `e533a16` (GAP-2) · `5dd032b` (GAP-4) · `694f860` (GAP-5).
