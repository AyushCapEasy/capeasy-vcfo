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
