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

- [ ] **M9 — Decision Engine: Stage 1 (rules) + Stage 3 (confidence gate), accounting-structured inputs only.** STATUS: _not started_
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
