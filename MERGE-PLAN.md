# MERGE-PLAN.md — branch consolidation (PREPARED, NOT EXECUTED)
**Prepared 2026-06-20 by the autonomous Tally-hardening cycle (Task 3). This is a plan for Ayush to execute deliberately — nothing here has been merged, pushed, or deployed. Merging to main is FENCED (Ayush's call).**

## Branch inventory (vs `main`)
| Branch | Ahead of main | Scope | Touches |
|---|---|---|---|
| **m-tally** | 6 commits | Tally Route-C engine + GAP-2/3/4/5 (this cycle) | `src/lib/tally/*`, `src/lib/intake/categories.ts`, `RULE-REVIEW.md`, `scripts/tally-recon.mts`, `package.json` (1 script), Tally/DevDoc `.md`s |
| **m-zoho** | 4 commits | Zoho sales connector + **D-014 decision record** | `src/lib/zoho/*`, `scripts/zoho-*.mts`, `.env.example`, `DECISIONS.md`, `package.json` (2 scripts), `vCFO-Zoho-Integration-Spec.md` |
| **visual-revamp** | 9 commits | UI/design-system revamp | `src/app/*`, `src/lib/mis/print-html.ts`, `src/app/globals.css`, `VISUAL-*.md`, instruction `.md` |
| `production` | 0 ahead, **11 behind main** | deployed snapshot, lagging | — (deploy concern, not a merge source) |

## Conflict matrix
The three feature branches are **disjoint in `src/`** (tally vs zoho vs app/UI — no shared source file). The **only** overlapping file is:

- **`package.json`** — `m-tally` and `m-zoho` BOTH append a script immediately after the `db:types` line, so whichever merges **second** produces a one-hunk conflict at that exact spot. `visual-revamp` does **not** touch `package.json` → conflict-free with both.
  - `m-tally` adds: `"tally:recon": "tsx scripts/tally-recon.mts"`
  - `m-zoho` adds: `"zoho:auth": "..."`, `"zoho:pull": "..."`
  - **Resolution (trivial, keep all):**
    ```json
    "db:types": "node scripts/gen-types.mjs > src/lib/database.types.ts",
    "tally:recon": "tsx scripts/tally-recon.mts",
    "zoho:auth": "tsx scripts/zoho-auth.mts",
    "zoho:pull": "tsx scripts/zoho-pull.mts"
    ```
- `DECISIONS.md` — only `m-zoho` modifies it. `RULE-REVIEW.md` / `vCFO-DevDoc-DecisionEngine.md` — only `m-tally`. No doc conflicts.

## 🔴 D-014 must land on main (flagged per the task)
**D-014** (real data permitted in `capeasy-vcfo`; D-007 reverted) lives **only on `m-zoho`** (`DECISIONS.md`), not on main. The whole Tally/Orafor effort on `m-tally` already **operates under D-014's permission**, yet the decision record isn't on main. **D-014 must be on main before/as the branches consolidate** — merging `m-zoho` first achieves this.

D-014's key terms (carry to main intact): real data allowed in this dev project; **scoped to the firm's OWN Zoho org first, NOT multiple clients' data**; 🔴 **un-droppable launch blocker** = real client data must move to a SEPARATE, RLS-security-reviewed production project before any client-facing launch (deferred, not removed); **auth wall + watermark stay ON; secrets gitignored only**.

> **Scope nuance to reconcile (Ayush's call):** D-014 as written scopes "real" to own-firm-Zoho-first, *not* client data. The `m-tally` Orafor validation used a **client's** export — but strictly in-memory, in gitignored `.client-data.local/`, never persisted or committed (operator-directed). Either D-014's wording already covers "in-memory validation against a single gitignored client export," or it deserves a one-line amendment noting that allowance. Worth a decision when D-014 lands on main.

## Recommended merge order
1. **`m-zoho` → main** — CLEAN (no overlap with main beyond its own additive files). Lands **D-014** + DECISIONS.md + `.env.example` first, so the decision record the rest operates under is the foundation.
2. **`m-tally` → main** — one trivial `package.json` conflict (resolve as above, keep all scripts). Everything else additive (`src/lib/tally/*` is new). 65 tests green on the branch.
3. **`visual-revamp` → main** — conflict-free; land the UI last so the lib layers stabilize before UI sits on top.

## Pre-merge checklist (for Ayush, per branch)
- [ ] Branch's own gate green before merge: `npm run typecheck && npm run lint && npm test && npm run build` (m-tally verified green this cycle: typecheck/lint/build clean, 65 tests).
- [ ] After `m-zoho`: confirm D-014 is on main; reconcile the scope nuance above.
- [ ] After `m-tally`: apply the `package.json` 4-script resolution; re-run tests.
- [ ] `.env.example` (from m-zoho) — ensure no real secrets; confirm `.env`/tokens stay gitignored (D-009).
- [ ] `production` is 11 commits behind main — a deploy/promote is a SEPARATE, deliberate step (FENCED this cycle). Decide after consolidation.

## NOT done (fenced)
No merge, no push, no deploy, no touch to `main`/`production`. This file is the plan only.
