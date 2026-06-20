# vCFO — Development Doc: Decision Engine Phase (M-verify → M11)
**Version 3.0** · Build instructions + living backlog · Pairs with `vCFO-Long-Term-Vision.md` (the why) and the existing `vCFO-Build-Plan.md` (prior milestones M0–M8)

> This file governs the next phase. Same rules as before: this file is the backlog, tick boxes as you go, commit at each milestone, append the Handoff Log, never override the operator or the plan without flagging and waiting. The Long-Term-Vision doc governs direction and the verification philosophy (§5 there is non-negotiable). Where this file and the vision conflict on *direction*, the vision wins; on *build process*, this file wins.

---

## CONTEXT (read before building)

State today: engine (M0–M6) built; insight layer Tiers 1–3 (M7–M8) built — all flagged UNVERIFIED, watermark ON, nothing client-facing shipped. **Pivot:** product is now **self-serve MIS for startups/MSMEs**, no per-client human verification. This changes the verification model (see M-verify below) and makes the **decision engine** the new centerpiece.

Standing rules (unchanged): foreground; announce each sub-step as you begin it; status emojis (✅ ⏳ ❌ 🔴) as state markers, prose plain; never override the operator/plan/vision without flagging and waiting; use ONLY this project's credentials (capeasy-vcfo, ref rsaztdwxrzgyxkvxrqrt); secrets only in gitignored env (D-009); dev/demo data only (D-007) — no real client data until a separate production project is deliberately stood up.

---

## BACKLOG / MILESTONES

- [~] **M-verify — Engine correctness (the gate; runs FIRST).** STATUS: _build complete 2026-06-10; the one-time human rule-review is DEFERRED (it is the VERIFIED gate, not removed)._ (a) identity battery **PASS** — 16 adversarial cases, all four §4.5 identities + perturbation (`src/lib/engine/identity-battery.test.ts`). (b) multi-AI **bug-finder** harness built (`src/lib/verify/cross-check.ts`; export `fixtures/cross-check-acme.json`) — consistency-check only, never a correctness certificate. (c) **`RULE-REVIEW.md`** populated, CA-usable (each rule: assumption + worked Acme example + verdict field) covering engine conventions, observation thresholds, and every diagnosis & recommendation rule. Labelling flipped UNVERIFIED→CONSISTENCY-CHECKED for engine output; VERIFIED reserved for + rule-review; watermark ON. **Still open:** the one-time CA rule-review itself.
  Per Vision §5, verification = identity battery (pass/fail) + multi-AI cross-check (bug-finder) + deferred one-time human rule review. Concretely:
  - (a) **Identity battery.** Build a broad, ADVERSARIAL set of synthetic trial balances (≥15 cases): healthy growth, decline, loss periods, negative equity, high leverage, zero-revenue, large working-capital swings, missing-schedule cases. For each, assert ALL §4.5 identities hold (assets=L+E; CF closing cash = BS closing cash; RE roll = NP − dividends; debits=credits) and the perturbation test (corrupt a non-cash line by a known amount → cash tie breaks by exactly that amount). These identities are true by definition — they are the real pass/fail.
  - (b) **Multi-AI cross-check (bug-finder, NOT verifier).** For the seeded cases, prepare the engine's computed statements in a clean comparable format and produce a diff harness so outputs can be cross-checked against other models' computations. Surface DISAGREEMENTS as items to investigate. Do NOT label anything "verified" because models agree — agreement reduces variance, not bias (Vision §5). Record this as a consistency check only.
  - (c) **Rule-review register.** Collect every genuine judgment-call rule (tax placement in CF, capex derivation, sign conventions, other-income placement, the diagnosis/recommendation rules, the materiality floor) into one `RULE-REVIEW.md` for a one-time human (CA) review. This is deferred but tracked — it is the part AI consensus CANNOT replace.
  - **Labelling:** flip language from "UNVERIFIED" to "CONSISTENCY-CHECKED" only for what clears (a). Reserve "VERIFIED" for what also clears (c). Never overstate. Update watermark logic accordingly (still ON by default; the off-switch stays deliberate).
  - STOP and report: battery results (every identity, every case), the disagreement list from (b), and the populated RULE-REVIEW.md.

- [x] **M9 — Decision Engine: Stage 1 (rules) + Stage 3 (confidence gate), accounting-structured inputs only.** STATUS: _build complete 2026-06-10. Pure module `src/lib/decision/` (taxonomy, rules, gate, orchestration + stubs); 13 unit tests (56 total green); typecheck/lint/build clean. Stage 0 (bank) + Stage 2 (LLM) are LOUD stubs (throw), not built. New rules + thresholds added to `RULE-REVIEW.md §F` (the deferred human gate). Coverage report: `scripts/decision-coverage.mts`._
  - Pure module `src/lib/decision/` — input = parsed TB/Tally/Zoho rows; output = each row with { proposedCategory, confidence, decidedBy:'rule', ruleId, reasoning }.
  - Rules: account-name patterns, codes, Tally/Zoho group mappings, counterparty signatures. Each carries a confidence score.
  - Stage 3 gate: high-confidence → auto-apply (shown, non-blocking); low/medium → founder-confirm; unclassifiable → flagged with a dirty-rupee total. Configurable thresholds (NOT a guessed materiality floor — make it a config constant, default conservative, logged for later tuning).
  - Transparency: every row shows decidedBy + confidence; residue surfaced as a number.
  - Tests against the existing seeded data + the M-verify battery's varied charts. STOP and report classification coverage (% auto / % founder-confirm / % flagged) per test chart.

- [ ] **M10 — Decision Engine: Stage 2 (LLM proposes).** STATUS: _not started_
  - For rows Stage 1 can't confidently place, an LLM proposes a category WITH reasoning + confidence. Output is a proposal routed through the SAME Stage 3 gate — never auto-committed on LLM say-so alone.
  - Must be deterministic-enough to test: cache/fixture the LLM responses for the test set so tests are reproducible.
  - Learning loop: founder confirmations persist (rule or per-org memory) so the same account is Stage 1 next time.
  - Hard scope line: ACCOUNTING-STRUCTURED INPUTS ONLY. Do NOT build bank-statement ingestion or Stage 0 reconciliation in this milestone — that is a later, separately-gated module (Vision §4). Stub the interface, do not implement.
  - STOP and report: how the residue from M9 is now handled, coverage improvement, and the reproducible-test approach.

- [ ] **M11 — Troubled-data validation of the full stack.** STATUS: _not started_
  - Run the engine + decision engine + insight layer (Tiers 1–3) against the ADVERSARIAL/declining cases from the M-verify battery — margin collapse, receivables blowout, loss period.
  - Report what the diagnoses and recommendations generate on BAD news (not just Acme's up-only curve). Flag any advice that is mechanically-correct-but-naive (e.g. the existing DPO recommendation) for the rule-review register.
  - This is where the advice layer earns trust or exposes its gaps. STOP and report every recommendation generated on troubled books + flags for human review.

- [ ] **M-Tally-RouteC — Route-C reconstruction hardening (real-client findings, Orafor reality-check 2026-06-20).** STATUS: _not started; gaps logged in `vCFO-Tally-Integration-Design.md` → EMPIRICAL FINDINGS._ Engine gaps surfaced by a real Tally export (two `All Masters` + `Day Book` XMLs, UTF-16, no `<CLOSINGBALANCE>`):
  - 🔴 **GAP-1 (PRIORITY): closing stock is in Tally's INVENTORY subsystem, not the ledgers.** Ledger-only reconstruction overstates COGS and fabricates a loss (Orafor: fake −₹46.4L vs ~−₹2.5L; closing stock ₹43.86L has zero ledger postings). **Structural — breaks every inventory business (retail/mfg/wholesale).** Fix: pull closing stock from inventory data (`<ALLINVENTORYENTRIES.LIST>` / stock summary / Stock-in-Hand value) **or accept as operator input**, apply closing-stock adjustment, until then flag stock-holders. Reconstruction must NOT report a P&L/BS for a stock-holder without it.
  - **GAP-2 ✅ APPLIED 2026-06-20 (operator-approved):** added `'duties taxes': 'statutory_dues'` alias to `groups.ts`. 62/62 tests green; GST now on BS (Statutory dues net −₹46,951); auto-coverage 84.8%→91.1%; unclassified 13→1. Committed on `m-tally`. TODO: audit other `&`-containing default groups.
  - **GAP-3 (parser shape):** `src/lib/tally/parse.ts` reads `utf8` and expects `<CLOSINGBALANCE>`; real `All Masters` export is UTF-16 with the closing balance carried in `<OPENINGBALANCE>`, plus a separate Day Book. Production parser must decode UTF-16 and support masters-field-as-closing + day-book derivation (`closing = field where present, else Σpostings`).
  - Capitalisation judgment call (trademark/startup expensed by group) → logged to `RULE-REVIEW.md §A6` (not a bug).
- [ ] **M12+ — (later, separate)** self-serve front-end + transparency UI; Zoho/Tally pull; THEN bank ingestion + Stage 0 reconciliation; real goal-capture. Not in this phase. Client-facing surface requires a deliberate separate production project + RLS security review before ANY real data (Vision §1, D-007).

---

## FLAGS THAT DO NOT GET DROPPED (even on a fast build)

- Nothing is "VERIFIED" until it clears the identity battery AND the one-time rule review. "Consistency-checked" is the honest interim label.
- Watermark stays ON; off-switch stays deliberate (`VCFO_WATERMARK_OFF`), never a default.
- Dev/demo data only; no real client data without a separate, deliberately-provisioned, security-reviewed production project.
- Multi-AI agreement is a bug-finder, never a correctness certificate.
- Bank ingestion + Stage 0 reconciliation are explicitly OUT of this phase.

---

## HANDOFF LOG (append-only; newest at bottom)

> One dated line per milestone or session boundary. First entry at M-verify start.

- 2026-06-10 · **M-verify built (a/b/c).** Identity battery PASS (16 adversarial cases); multi-AI bug-finder harness + `cross-check-acme.json` export; `RULE-REVIEW.md` populated (CA-usable). Engine labelled CONSISTENCY-CHECKED; per-client golden-diff retired (D-013 — `golden-client.json` deleted, M7.5 superseded); watermark ON. The one-time CA rule-review is the remaining VERIFIED gate (deferred). Governing docs copied into repo. Stopped at M-verify per operator; M9 NOT started.
- 2026-06-10 · **M9 built — Decision Engine Stage 1 + Stage 3.** Pure `src/lib/decision/` (taxonomy mirror, confidence-scored rules, confidence gate, orchestration). Stage 1 rules: confirmed-mapping (0.99, learning-loop hook) · name_exact (0.95) · name_keyword (≤0.88) · name_fuzzy (≤0.60) · ambiguity dampening (near-tie → founder-confirm) · low-info stub guard (caps "Misc"-type over-matches) · classify floor 0.30 → unclassifiable. Stage 3 gate: auto ≥0.90 / confirm ≥0.50 / else flagged (conservative config constants — NOT the materiality band floor, still §E1). Dirty-rupee residue surfaced as a number. Stage 0 (bank) + Stage 2 (LLM) = loud throwing stubs. 16 battery charts now a shared module (`src/lib/engine/battery-charts.ts`) used by both the identity battery and M9 coverage. Coverage (by row count): Acme seeded 84/16/0; messy TB 45.5/18.2/36.4 (₹48,512 dirty); battery charts ≈82/18/0. 56 tests green; typecheck/lint/build clean. New rules + thresholds → `RULE-REVIEW.md §F`. Stopped at M9 per operator; M10 (Stage 2 LLM) NOT started.
- 2026-06-20 · **Route-C reality-check on real client (Orafor Clothing Pvt Ltd).** In-memory only (D-007/D-014, gitignored `.client-data.local/`, nothing persisted/committed). Reconstructed P&L+BS from two real Tally `All Masters`+`Day Book` XMLs. Key catch: master `<OPENINGBALANCE>` field = period CLOSING balance (proven via director loan), so `closing = field where present else Σpostings` (avoided a double-count). Day-book cross-foots to ₹0 (parse validated). Logged THREE engine gaps → new backlog item **M-Tally-RouteC** + `vCFO-Tally-Integration-Design.md` EMPIRICAL FINDINGS: 🔴 GAP-1 closing-stock-in-inventory-subsystem (structural, breaks all stock-holders; fake −₹46.4L loss), GAP-2 `groups.ts` "duties taxes" alias (one-line, awaiting approval — NOT applied), GAP-3 parser UTF-16 + masters-field-as-closing shape. Capitalisation judgment call (trademark/startup) → `RULE-REVIEW.md §A6`. Shared source intentionally untouched. Audited diff deferred to next turn (operator verifying scan); diff protocol = apply ₹43.86L closing-stock credit first, then split matches / audit-adjustment gaps / engine gaps.
- 2026-06-20 · **GAP-2 committed + partial audited diff.** `groups.ts` 'duties taxes' alias committed on `m-tally` (62 tests green). Operator supplied 10 human-verified audited figures from the scan; closing-stock adjustment applied (recon net −₹46.4L → −₹2,53,864, ties to P&L A/c ledger). Diff on provided lines: **9/9 clean match + net result match, 0 audit-adjustment, 0 engine-gap** (operating_revenue, other_income, depreciation, share_capital, reserves, long_term_borrowings/director-loan 49,79,756, inventory, investments/FD 2,03,337, other_current_assets 16,174 — all tie to the rupee). OCR ambiguities resolved in the engine's favour (loss 2,53,864 not 16,174; director loan 49,79,756 not 7,86,941; FD 2,03,337 not 4,03,337). **14 lines still PENDING** (cogs, employee_benefits, finance_costs, admin_other_opex, tax_expense, trade_payables, trade_receivables, cash_bank, ppe + 5 not in key) — operator left them `[real]`; diff incomplete until supplied. Harness: `.client-data.local/_recon.mts` reads `.client-data.local/audited.json` (both gitignored).
