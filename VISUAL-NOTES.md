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
