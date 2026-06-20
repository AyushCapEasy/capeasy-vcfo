# vCFO — Visual Revamp Instruction (Autonomous Run)
**Scope:** Visual / UI polish ONLY. ~4-hour unattended run. Pairs with vCFO-Long-Term-Vision.md (product is self-serve MIS for startups/MSMEs, used for fundraising — credibility is the aesthetic).

> This is a styling pass, not a feature pass. You touch how things LOOK, never what they DO. Read the HARD CONSTRAINTS first; they are the difference between a good morning and a broken build.

---

## DESIGN NORTH STAR

This is **financial software a founder will put in front of an investor.** The visual language must read as **credible, precise, and institutional** — think the restraint of a Bloomberg terminal, a top-tier audit firm's report, or the Financial Times, NOT a consumer SaaS or a trendy startup landing page. Every choice should make a CFO or VC think "this firm is serious," never "this looks like a toy."

Principles, in priority order:
1. **Trust through restraint.** Sober, confident, uncluttered. Generous whitespace. No gradients-for-decoration, no playful illustration, no rounded-bubbly everything. Precision over personality.
2. **Data density done well.** This is a numbers product. Tables, statements, and figures must be beautifully legible — clear hierarchy, aligned numerals (tabular figures), right-aligned amounts, clear positive/negative treatment, scannable rows. The MIS pack is the hero; make financial data a pleasure to read.
3. **Clear information hierarchy.** A founder should know instantly what matters most on each screen. Headlines, then supporting detail. The insight layer (observations/diagnoses) should feel like a senior advisor's note, not a dashboard dump.
4. **Quiet, purposeful color.** A disciplined palette: one primary (CapEasy brand if defined — currently ~#1E4FA8 blue / #F08025 orange accents), neutral greys for structure, and *reserved* semantic color (green/red) used ONLY for financial meaning (favorable/unfavorable, positive/negative), never decoration. Color carries information here; don't spend it on style.
5. **Typography that means business.** A clean, professional typeface (Inter is fine, or a comparable system). Tabular/lining numerals for all financial figures so columns align. Strong, consistent type scale.
6. **Consistency over cleverness.** One coherent system — spacing scale, type scale, component styling, states (hover/focus/disabled/loading/empty/error) — applied everywhere. A team maintains this; readability beats novelty.

Consult the frontend-design skill for the environment's design-token conventions and apply them.

---

## HARD CONSTRAINTS (breaking these wastes the run)

1. **VISUAL ONLY. Do not touch logic, data, computation, or behavior.** No changes to: the engine, the decision engine, the insight layer, intake/parsing, classification, validation, RLS, auth flows, or any calculation. If a styling change would require touching logic, STOP and note it for review — do not refactor logic to achieve a look.
2. **The watermark stays ON and untouched** ("SAMPLE — UNVERIFIED · NOT FOR CLIENT USE"). Do not restyle it into invisibility, do not remove it, do not touch VCFO_WATERMARK_OFF. It must remain clearly visible on every screen and PDF.
3. **Work on a dedicated branch** `visual-revamp`, NOT main. Commit frequently (per screen / per component group) with clear messages, so any step can be reviewed or rolled back individually. Do not merge to main — leave that to me.
4. **Build + typecheck + lint must stay green after every commit.** If a visual change breaks the build, fix or revert it before moving on — never leave the branch red.
5. **No new heavy dependencies** without flagging. Prefer Tailwind + the existing shadcn/ui primitives. A new icon set or font is fine; a new UI framework is not.
6. **Dev/demo data only; capeasy-vcfo creds only; secrets only in gitignored env.** Unchanged.
7. **Preserve all functionality.** Every button, link, drill-down, upload flow, and form must work exactly as before after restyling. Visual polish must not break interaction. Test interactions after restyling each screen.
8. **Don't thrash.** Blocked or uncertain on a screen >20 min → note it in VISUAL-NOTES.md, move to the next screen.

---

## EXECUTION

Work screen-by-screen. After each: verify build/typecheck/lint green, confirm interactions still work, commit on the `visual-revamp` branch, append a line to VISUAL-NOTES.md (what changed + any decisions/uncertainties for my review).

**V0 — Foundation (do first).** Establish the design system before touching screens: finalize the type scale, spacing scale, color tokens (semantic + neutral), tabular-numeral setup for financial figures, and shared component styling (buttons, inputs, selects, tables, cards, badges, states). Everything downstream uses these. Commit. This is the highest-leverage step — get the tokens right and the screens follow.

**V1 — The MIS pack (the hero).** P&L, Balance Sheet, Cash Flow, ratios, working capital. This is what goes in front of investors — make it exceptional: aligned tabular figures, clear statement structure, scannable hierarchy, restrained semantic color for +/−, print/PDF parity. Spend the most time here.

**V2 — The insight layer.** Observations / diagnoses / recommendations / goal-tracking. Make it read like a senior advisor's note — prioritized, calm, clear. Each insight's UNVERIFIED flag and drill-down must stay visible and legible.

**V3 — Intake & mapping flow.** Upload, the parse-confirmation screen, the account-mapping UI, the validation gate report. These are operated by non-experts — clarity is everything. The confidence/flag states from the decision engine must be visually obvious (what's auto, what needs confirmation, what's flagged).

**V4 — Shell, nav, auth, client list.** Login, the app shell, navigation, multi-client list/switcher. Professional, quiet, consistent with V0.

**V5 — Empty / loading / error / edge states.** Often neglected, they're where polish shows. Every screen's empty, loading, and error states styled consistently.

**V-final.** Ensure the whole app is visually coherent end-to-end, build green, all interactions intact, watermark visible everywhere. Write VISUAL-REVIEW.md: per-screen before/after summary, design decisions made, anything you flagged for my judgment, and how to view it (the SSO-walled preview URL).

---

## WHAT I REVIEW

VISUAL-REVIEW.md with: the preview URL, screen-by-screen of what changed, design decisions you made autonomously (so I can veto any), anything you were unsure about, and confirmation that nothing logical/computational was touched, the watermark is intact, and all interactions work.
