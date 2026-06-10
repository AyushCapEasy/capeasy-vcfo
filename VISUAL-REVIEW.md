# Visual Revamp — Review (branch `visual-revamp`)

> Autonomous visual-only polish pass. **Not merged** — left for you. Branched from `main` @ `c31cdf2`.
> Eight stage commits (`2a1c7fe` doc → `a2c27e5`). Every commit: typecheck + lint + build green; watermark ON;
> dev/demo data only. **Nothing logical/computational was touched** — see the diff list below.

---

## How to view it (preview URL) — needs your go

The SSO-walled preview URL **does not exist yet**, because generating it requires pushing the `visual-revamp`
branch to GitHub → Vercel auto-builds a (deployment-protected) preview. I did **not** push autonomously, because:

- This branch is based on local `main` (`c31cdf2`), so pushing it would **also publish the still-local
  `M7 / M8 / M-verify / M9` commits** to GitHub — those were deliberately kept local-only until the client-facing
  gate clears. That crosses a standing rule, so it's your call, not mine.
- Pushing/deploying is outward-facing.

**To get the preview, authorize the push** (or run it yourself):

```bash
git push -u origin visual-revamp
```

Vercel will build a preview at a `…-git-visual-revamp-…vercel.app` URL, behind the Vercel Authentication wall
(per-person, as configured). Commit author is `ayushblue945@gmail.com` (your verified identity), so any
commit-author check should pass. Say the word and I'll push and report the URL. **I will not merge to `main`.**

Local review meanwhile: `npm run dev` → http://localhost:3000.

---

## What changed, by screen

| Stage | Screen / area | Before → After | Commit |
|---|---|---|---|
| **V0** | Design system (`globals.css`) | Brand tokens only → full institutional token set (cool-grey neutrals, reserved semantic color, brand tint/hover, two radii), base typography/focus/selection, `.tnum`/`.num` figures, and `@layer components` primitives (`.card`/`.btn`/`.badge`/`.input`/`.select`/`.pill`/`.eyebrow`). Additive — no screen touched. | `ec74ea8` |
| **V1** | **MIS pack (hero)** — P&L / BS / CF / KPIs / ratios / trend | Competent but flat → institutional: stronger total/subtotal hierarchy (primary-tinted total row + top rule), right-aligned tabular-lining figures, more row air, `.card` sections, eyebrow KPI labels with larger ink figures, segmented `.pill` period switcher, `.btn` actions. | `04d7864` |
| **V1** | MIS **PDF** (`print-html.ts`) | → mirrored the on-screen elevation (total rule, larger tabular figures, eyebrow labels) for print parity. | `f6c075d` |
| **V2** | Insight layer (observations / diagnoses / recommendations / goals) | Dashboard-dump rows → calm senior-advisor note: relaxed leading, ink metric names, quiet `.badge` UNVERIFIED flags (kept visible), a thin accent rule + labelled "Impact" on recommendations, `.badge` goal-status, refined D-013 placeholder banner. | `e3e6633` |
| **V3** | Intake & mapping (`page` + `upload-form` + `confirm-panel`) | CRM-remnant neutral/dark → slate system: slate-50 canvas + white cards, guided numbered steps (Upload·Validate·Map·Finalise), semantic validation-gate card, mapping table with **✓mapped / suggested / needs-mapping** cues, design-system controls; full confirm-panel restyle. | `79c3ab9` |
| **V4** | Shell / auth / client list | Body → slate-50 canvas; unified white `max-w-5xl` headers + faint breadcrumbs; login → centered branded card; home client list → `.card` grid w/ hover + empty state; client overview → carded periods list + `.badge` statuses + design-system add-period form. | `2b66ba0` |
| **V5** | Edge states | MIS no-periods → carded empty panel; added styled global **404** (`not-found.tsx`). Other empties normalized across V1–V4. | `a2c27e5` |

Full file diff (`main...visual-revamp`): **15 files, +573 / −296** — all UI/CSS/docs. The logic surface
(`src/lib/engine/*`, `src/lib/decision/*`, `src/lib/insight/*`, `src/lib/intake/parse|validate|server-data`,
`watermark.*`, auth/RLS server actions) is **not in the diff**.

---

## Design decisions I made autonomously (veto any)

1. **Palette = slate (cool grey), not the CRM's `neutral`.** The MIS hero already used slate; I unified the whole app
   onto it and removed the dead `dark:` classes (inert since the V0 dark-variant remap). One coherent light palette.
2. **Card radius kept at 12px** (matches existing `rounded-xl`) — confident, not bubbly; controls at 8px.
3. **Semantic color reserved for meaning only** — emerald/red strictly for financial +/− and pass/fail and goal
   status; brand blue for primary actions/totals; amber for UNVERIFIED / needs-attention. No decorative color.
4. **Recommendations got a thin accent-orange left rule** to read as advisor notes — the one place accent is used in
   content; tell me if you'd rather it stay monochrome.
5. **Intake mapping "state" cues** (✓mapped / suggested / needs-mapping) are derived from the **existing fuzzy
   suggestions**, NOT the M9 decision engine (wiring that in is logic, out of scope) — see uncertainties.
6. **Body canvas = slate-50** globally; every screen now sits on canvas with white card surfaces.

## Flagged for your judgment / uncertainties

- **Decision-engine confidence states (auto/confirm/flag) are not surfaced in the intake UI.** That wiring is a
  feature (logic), explicitly out of a visual-only pass. The mapping cues above are a visual stand-in. Recommend a
  follow-up feature ticket to surface M9's buckets + dirty-rupee total in the mapping screen.
- **No `loading.tsx` / `error.tsx` route states added** — they introduce Suspense fallbacks / a `reset()` handler
  (behavior), out of scope here. Easy, high-polish follow-up if you want skeletons.
- **No `src/components/` extraction.** The app keeps UI inline per route; the "system" is `globals.css` tokens +
  `@layer components` classes applied via className. If you want true shared React components later, the classes
  make that a clean refactor.
- **PDF insight sections** left on the existing statement-table styling (acceptable parity) rather than re-themed.

## Confirmations

- ✅ **Visual only** — no engine, decision engine, insight layer, intake/parse, classification, validation, RLS, or
  auth logic touched (verified by the diff list).
- ✅ **Watermark intact** — `src/lib/watermark.ts` and `mis/watermark.tsx` are **not in the diff**; `VCFO_WATERMARK_OFF`
  untouched; the tiled SAMPLE watermark + StatusRibbon render on every screen and the PDF as before.
- ✅ **Interactions preserved** — every form action, hidden input, `<select>` name/defaultValue, drill-down `<details>`,
  upload/flip/confirm/finalise/save binding is unchanged; only classNames/markup wrappers changed.
- ✅ **Green** — typecheck + lint + build pass after every one of the 8 commits (final build exit 0).
- ✅ **Not merged to `main`** — branch `visual-revamp` only; merge is yours.
