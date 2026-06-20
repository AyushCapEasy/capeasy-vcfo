# vCFO — Autonomous Dev Cycle (2-3 hr unattended)
**Context:** The Orafor Route-C reconciliation is validated — engine reconstructs a real audited company from raw Tally data, 0 genuine engine gaps, diff tool hardened (GAP-2/4/5 fixed). This cycle hardens the two STRUCTURAL items that remain (GAP-3, GAP-1) so the engine runs in production — not via a scratch harness — and handles inventory businesses end-to-end.

> This is a self-validating cycle. Both tasks have a HARD success criterion: reproduce the already-proven Orafor result through PRODUCTION code. If the production path doesn't match the validated numbers, the task isn't done. The Orafor reconciliation is the answer key.

---

## HARD CONSTRAINTS (a long unattended run lives or dies on these)
1. **Work on branch `m-tally`** (where GAP-2/4/5 already live). Commit per task with clear messages so any step is reversible. Do NOT merge to main — that's Ayush's explicit call (see §FENCED).
2. **Build/typecheck/lint green after every commit.** 63 tests currently pass. Never leave the branch red; if a change breaks tests, fix or revert before moving on.
3. **The Orafor data is the validation harness, not a code dependency.** Real client data stays in `.client-data.local/` (gitignored), in-memory, no DB writes, nothing committed from it. The PRODUCTION code must not hardcode Orafor anything — it's tested against Orafor but works for any Tally export.
4. **Self-validate or stop.** Each task has a success criterion below. If you can't meet it, STOP that task, write what's blocking to VISUAL-NOTES-style log (`DEV-CYCLE-LOG.md`), and move to the next. Do NOT guess past a real blocker.
5. **Standing rules:** capeasy-vcfo only, secrets gitignored only, watermark ON, auth wall ON. KISS — prove it works, don't gold-plate.
6. **Do not touch the FENCED items (§FENCED).** Those need Ayush.

---

## TASK 1 — GAP-3: Productionize the Tally parser (do FIRST — everything depends on it)
**Problem:** The logic that actually reconstructed Orafor lives in a throwaway script (`.client-data.local/_recon.mts`), NOT in the production `src/lib/tally/parse.ts`. The shipped parser reads UTF-8 and expects `<CLOSINGBALANCE>`; the real "All Masters" export is UTF-16 with the closing balance carried in the `<OPENINGBALANCE>` field, plus a separate Day Book of vouchers. The production parser can't currently do what the harness did.

**Build:** Fold the proven harness logic into `src/lib/tally/`:
- UTF-16 LE/BE decode (BOM detection) before parsing — fall back to UTF-8.
- Handle the two-file "All Masters" + "Day Book" shape: master `<LEDGER>` carries `<PARENT>` group + the balance field (which is the period CLOSING balance, debit-negative convention — proven); Day Book carries `<VOUCHER>`/entry postings.
- Closing balance derivation: closing = master field where present, else Σ day-book postings (per the proven rule — no ledger has both). Preserve the sign conventions exactly as the harness established (debit = negative in both AMOUNT and the master field → dr-positive = −value).
- Keep the existing single-file DATA-format and DISPLAY-format paths working (don't regress).

**SUCCESS CRITERION (hard, self-validating):** running the PRODUCTION parser on the two Orafor XMLs in `.client-data.local/` reproduces the exact reconstruction the harness produced — same TB, same classification coverage (84.8%→ now higher post-GAP-2), same reconstructed P&L/BS line items to the rupee. Write a test fixture from a SMALL synthetic UTF-16 two-file sample (not Orafor data — synthetic, committable) so the capability is covered by a committed test. Report: does production output == harness output for Orafor? Yes/no, with any diffs.

---

## TASK 2 — GAP-1: Inventory-subsystem closing stock (the market-coverage item)
**Problem:** Tally holds inventory (closing stock) in its inventory subsystem, NOT as a ledger posting. The ledger-only reconstruction therefore omits closing stock, overstating COGS and producing a fake loss — for Orafor, COGS was ₹94.8L instead of the correct ₹50.9L until the ₹43.86L closing-stock credit was applied BY HAND. Every stock-holding business (retail, manufacturing — a huge share of the market) hits this.

**Build:** Make the engine obtain closing stock automatically instead of by hand:
- First, research/inspect: where in the Tally export does closing stock live? Check the Day Book for inventory entries (`<ALLINVENTORYENTRIES.LIST>`), stock-item masters, or a Stock Summary export. Determine the reliable source. (The Orafor Transactions XML had 177 `<ALLINVENTORYENTRIES.LIST>` — inspect whether closing stock is derivable from these, or whether a separate Stock Summary XML export is needed.)
- If derivable from the existing exports: pull closing stock and apply it to COGS automatically (Purchases − Δinventory), so the reconstructed P&L is correct WITHOUT a manual credit.
- If it requires a separate export (Stock Summary XML): build the parser for it and document the extra export step the user must provide; the engine consumes it when present, and clearly flags "closing stock not provided — COGS may be overstated for inventory businesses" when absent (honest degradation, never a silent wrong number).

**SUCCESS CRITERION (hard, self-validating):** the PRODUCTION engine, run on the Orafor exports, produces COGS ≈ ₹50.9L and net result −₹2,53,864 AUTOMATICALLY — without the manual ₹43.86L credit the harness applied by hand. If closing stock needs a separate export Orafor doesn't have, then instead: build the capability, prove it on a synthetic inventory fixture, and report exactly what export the user must supply for real inventory clients. Report which path applied and whether Orafor auto-reconciles.

---

## TASK 3 — Prepare (DO NOT EXECUTE) branch consolidation
Several branches hold proven work not on main: `m-tally` (engine + GAP fixes), `m-zoho` (Zoho connector + D-014 decision record), `visual-revamp` (UI). 
**Do ONLY this — preparation, not merging:**
- Produce a clean report (`MERGE-PLAN.md`): what's on each branch vs main, what would conflict, and a recommended merge order. 
- Specifically flag: D-014 (real-data-permitted decision) currently lives on m-zoho, not main — note that it must land on main when branches merge.
- Do NOT merge, do NOT push, do NOT touch main. This is a plan for Ayush to execute deliberately.

---

## §FENCED — DO NOT TOUCH (these need Ayush, not an autonomous agent)
- **Merging anything to main** — strategic + irreversible-ish; Ayush's explicit call.
- **Pushing branches / deploying** — no deploys this cycle.
- **RULE-REVIEW §A6/A7/A8** (capitalization, director-remuneration line, loan current/non-current) — CA judgment calls, not buildable.
- **GAP-5 retuning** — it's correct as built (fails safe, surfaces entangled bugs); don't "optimize" it toward fewer flags.
- **Anything requiring real client data beyond the Orafor files already in .client-data.local/** — don't go looking for more client data.

---

## OUTPUT (write `DEV-CYCLE-LOG.md`, committed)
Per task: what was built, did it meet the hard success criterion (yes/no + the actual numbers), tests green, commit SHA. Plus the `MERGE-PLAN.md` from Task 3. End with: what's done, what's blocked and why, and the recommended next move — so Ayush can decide in 5 minutes.
