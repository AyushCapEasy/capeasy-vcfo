# Visual Revamp — running notes (branch `visual-revamp`)

> Append-only log of what changed per stage + decisions/uncertainties for operator review.
> HARD CONSTRAINTS honored throughout: visual-only (no logic/data/engine/decision/intake/RLS/auth touched);
> watermark stays ON and visible; build+typecheck+lint green after every commit; dev/demo data only.
> North star: investor-grade, credible, precise, institutional — color carries financial meaning, not decoration.

---

## V0 — Foundation (design system) ✅
**Files:** `src/app/globals.css` (only).
**What changed (additive — no screen touched yet, so zero regression risk):**
- **Tokens (`@theme`):** kept brand (`#1e4fa8` primary / `#f08025` accent); added a cool-grey neutral hierarchy
  (`ink`/`body`/`muted`/`faint`/`line`/`hair`/`canvas`), reserved-semantic colors (`positive` emerald-700,
  `negative` red-700, `warning` amber-700 for UNVERIFIED flags), primary tint/hover (`primary-50`/`primary-700`),
  and two radii (`card` 12px, `ctl` 8px — confident, not bubbly).
- **Base:** heading negative tracking (precise, not loud), antialiasing + `optimizeLegibility`, one consistent
  keyboard `:focus-visible` ring app-wide, branded `::selection`.
- **Figures:** `.tnum` now `tabular-nums lining-nums`; added `.num` (right-aligned tabular cell) for statements.
- **Component primitives (`@layer components`, unused until applied downstream):** `.card`, `.panel-head`/`.panel-title`/
  `.panel-sub`, `.eyebrow`, `.btn`+`.btn-primary`/`.btn-secondary`/`.btn-ghost`, `.badge`+5 color variants,
  `.label`/`.input`/`.select`/`.textarea`, `.pill`+`.pill-active`/`.pill-idle`.
**Decisions:** kept card radius at 12px (matches existing `rounded-xl`, avoids churn); did NOT change `body` background
to the canvas grey in V0 (deferred to V4/shell so untested screens don't regress) — V0 is strictly additive.
**Verify:** typecheck + lint + build all green (exit 0).
**Flag for review:** the app has no `src/components/` and no real shadcn install — UI is inline Tailwind per route.
So the "design system" lives in `globals.css` as tokens + `@layer components` classes, applied by swapping classNames
(keeps every change purely presentational). Two screens (`page.tsx` home, `clients/[orgId]` overview, `login-form`)
still use leftover CRM `neutral-*` + dead `dark:` classes — to be unified onto the slate system in V4.

---

## V1 — MIS pack (the hero) ✅
**Files:** `src/app/clients/[orgId]/mis/page.tsx`, `commentary.tsx` (on-screen); `src/lib/mis/print-html.ts` (PDF parity).
**On-screen (commit `04d7864`):**
- Sections → `.card`/`.panel-head`/`.panel-title`/`.panel-sub`.
- **Statement tables (the investor core):** stronger total/subtotal hierarchy — total row gets `primary-50` fill + a
  top rule + bold primary figure; amounts now right-aligned `.num` (tabular + lining); more row air (px-5 py-2.5);
  drill-down detail panels given a top hairline + aligned indent.
- **KPI strip:** `.card` + `.eyebrow` labels + larger `text-2xl` ink figures.
- **Header:** actions → `.btn`/`.btn-secondary`; period switcher → a segmented `.pill` group on a slate tray; period
  status → `.badge`.
- Ratios + MoM trend refined (eyebrow labels, larger tabular values). Sparkline already on-brand — left as-is.
- Commentary textarea/button → `.textarea`/`.btn`.
**PDF parity (commit `f6c075d`):** mirrored in `print-html.ts` — total row top rule, KPI/ratio figures bumped +
tabular-lining nums, eyebrow labels, more row padding. Watermark + ribbon from the single flag untouched.
**Untouched:** all numbers/logic — `present.ts`, `mis-data.ts`, every `compute*`. Watermark + StatusRibbon intact.
**Verify:** typecheck + lint + build green after each commit.

## V2 — Insight layer ✅
**Files:** `src/app/clients/[orgId]/mis/page.tsx` (Observations / Diagnoses / Recommendations / Goals blocks).
**What changed:** calmer "senior-advisor note" rhythm — px-5 py-3 rows, relaxed leading, metric names in ink;
per-row `UNVERIFIED` flags kept fully visible but routed through the quiet `.badge badge-neutral`; recommendations
get a thin `accent` left rule + bold action + labelled "Impact:"; goal track-status → `.badge badge-positive/negative/
neutral`; the D-013 placeholder-targets banner refined (kept clearly visible). Drill-down + traces preserved.
**Untouched:** `computeObservations/Diagnoses/Recommendations/GoalTracking` and all traces — logic intact.
**Decision:** kept the PDF insight sections as-is (they already use the statement table styling → acceptable parity);
did not over-style to avoid thrash.

---

## V3 — Intake & mapping flow ✅
**Files:** `periods/[periodId]/page.tsx`, `upload-form.tsx`, `confirm-panel.tsx`.
**What changed:** these three were heavy with leftover CRM `neutral-*` + dead `dark:` classes — unified onto the slate /
design system. Page now sits on the slate-50 canvas with white cards. Added a guided numbered-step pattern (`StepHead`
1→4: Upload · Validate · Map · Finalise). Validation gate → a card with a semantic left rule (emerald pass / red fail)
+ divided rule rows + `RuleBadge` via `.badge` variants. **Mapping table** made state-obvious: each source account shows
**✓ mapped → X** (emerald) / **suggested: Y — confirm** (amber) / **needs mapping** (amber row tint), using the existing
fuzzy-suggestion data; selects/buttons → design-system controls. Upload form → primary submit + slate file picker +
red error card. Confirm-panel fully restyled (column-mapping selects → `.select`, proposal cards with `.badge`
accepted/as-written states, totals strip, `.btn` actions).
**Untouched:** every form action, hidden input, `select` name/defaultValue, and data binding (uploadTb, saveMapping,
reassignColumns, setFlip, confirmTb, cancelTb, finalizePeriod) — styling only.
**Flag for review:** the **decision engine's** auto/confirm/flag confidence buckets (M9) are NOT surfaced in this UI —
wiring them in is LOGIC (out of visual scope). V3 styles the existing intake fuzzy-suggestion states; the "what's
mapped / suggested / needs mapping" cues above are the visual stand-in until that wiring is built as a feature.

---

## V4 — Shell, nav, auth, client list ✅
**Files:** `layout.tsx`, `login/page.tsx`, `login-form.tsx`, `page.tsx` (home), `clients/[orgId]/page.tsx`.
**What changed:**
- **Shell:** root `body` background → the institutional `slate-50` canvas (white surfaces now read as cards). Headers
  unified: white bar, `border-slate-200`, centered `max-w-5xl`, faint breadcrumbs, sign-out → compact `.btn-secondary`.
- **Login:** centered branded card (`eyebrow` CapEasy wordmark + bold vCFO), form in a `.card` with shadow; inputs →
  `.input`, submit → full-width `.btn-primary`, error in red.
- **Home (client workspaces):** client cards → `.card` with hover lift, role → `.badge badge-neutral`; added a proper
  empty-state card.
- **Client overview:** breadcrumb header + MIS button → `.btn-primary`; periods list → a `.card` with divided rows and
  `.badge` status (draft/reviewed/locked → warning/info/positive); add-period form → `.input`/`.btn-primary`.
**Untouched:** auth flow (signIn/signOut server actions), RLS queries, createPeriod, all data — styling only.
**Decision:** removed the dead CRM `dark:` classes here (inert since V0 remapped the dark variant) and migrated
`neutral-*` → `slate-*` so the whole app shares one palette.

---

## V5 — Empty / loading / error / edge states ✅
**Files:** `clients/[orgId]/mis/page.tsx` (no-periods empty), new `src/app/not-found.tsx`.
**What changed:** most empties were already normalized during V1–V4 (insight-block empties, Cash-Flow "n/a — needs a
prior period", home/overview/intake empties → consistent `.card` muted-text panels). V5 finished the set: the MIS
no-periods state → a centered `.card` empty panel; added a styled global **404** (`not-found.tsx`) — presentational
replacement for Next's default, used by `notFound()` (missing route OR RLS-denied client, deliberately
indistinguishable). Login / upload / validation error states already styled (red cards) in earlier stages.
**Deliberately NOT added (flagged):** route-level `loading.tsx` skeletons and `error.tsx` boundaries — those introduce
Suspense fallbacks / a `reset()` handler, i.e. **behavior**, which the hard constraints put out of scope for a
visual-only pass. Recommended as a small follow-up feature if desired.

---

## V-final — coherence + review ✅
- **End-to-end palette coherence:** grep confirms **zero** `neutral-*`/`dark:` classes remain in any screen (only the
  explanatory comment in `globals.css`). One slate palette + brand + reserved semantic color across the whole app.
- **Watermark verified intact:** `git diff main...visual-revamp` does NOT include `src/lib/watermark.ts` or
  `mis/watermark.tsx` — never touched; watermark + StatusRibbon render everywhere; `VCFO_WATERMARK_OFF` unset.
- **Scope verified:** branch diff = 15 files (+573/−296), all UI/CSS/docs; no engine / decision / insight / intake-logic
  / RLS / auth-logic file in the diff.
- **Final build exit 0.** Wrote `VISUAL-REVIEW.md` (per-screen table, autonomous decisions to veto, uncertainties,
  confirmations, and how to get the preview URL).
- **Preview URL:** held — requires authorizing `git push -u origin visual-revamp`, which would also push the local-only
  M7–M9 commits to GitHub. Flagged for the operator in VISUAL-REVIEW.md; **not merged to main**.
