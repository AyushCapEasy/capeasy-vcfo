# RULE-REVIEW — vCFO engine & insight conventions (for a one-time CA review)

> **Why this exists (Vision §5):** accounting identities and multi-AI cross-checks can prove the engine is
> *internally consistent*, but the **judgment calls below are conventions, not math** — no identity test or
> model consensus can confirm them. A human who knows Indian accounting must review them **once** (on the
> rules, not per client). **Until that review, nothing is "VERIFIED"** — the engine output is at best
> "CONSISTENCY-CHECKED" (it clears the identity battery). The watermark stays ON regardless.
>
> **How to use this:** for each rule, read *what it assumes*, check the *worked Acme example*, and tick a
> **Verdict** — `ok` / `needs-change` / `note` — with a comment. `needs-change` items become engine fixes;
> they are not shipped as VERIFIED until corrected and re-checked.
>
> All ₹ figures are Acme demo data (D-007), UNVERIFIED. Engine fields are dot-paths into `PeriodResult`.

---

## A. Engine conventions (the statement-construction judgment calls)

### A1 · Tax placement in cash flow
- **Assumes:** income tax is treated **within operating activities** — net profit (already net of tax) flows into CFO via the indirect method; tax is not pulled out as a separate financing/investing line.
- **Worked (Acme, May):** CFO ₹2,54,500 = net profit ₹2,97,000 + D&A ₹1,00,000 + working-capital change −₹1,42,500. The ₹1,13,000 tax sits *inside* net profit, not on its own line.
- **Verdict:** ☐ ok ☐ needs-change ☐ note — ____________________________________________

### A2 · Capex derivation (no disposals assumed)
- **Assumes:** gross capex = **Δ(net depreciable assets) + depreciation for the period**, i.e. **no asset disposals** (`engine.ts computeCashFlow`).
- **Worked (Acme, Jun):** capex ₹1,00,000 = (PPE ₹3,29,50,000 − ₹3,30,00,000) + D&A ₹1,05,000 = −₹50,000 + ₹1,05,000. If Acme actually sold an asset in Jun, this would overstate/understate capex.
- **Verdict:** ☐ ok ☐ needs-change ☐ note — ____________________________________________

### A3 · Sign convention on intake (parenthesis / leading-minus)
- **Assumes:** a value is imported **as written in its original debit/credit column**; a `(x)` or leading-minus is a **per-row opt-in flip** the analyst accepts, never auto-moved between sides (D-006).
- **Worked:** a "Bank Charges Refund (10,000)" in the debit column stays a debit unless the analyst flips it to credit; the TB gate flags the resulting imbalance either way.
- **Verdict:** ☐ ok ☐ needs-change ☐ note — ____________________________________________

### A4 · Other-income placement
- **Assumes:** other (non-operating) income sits **below EBIT, before tax** — EBT = EBIT + other income − finance costs.
- **Worked (Acme):** other income = ₹0 in all periods → no effect here; the convention only bites when a client has non-operating income.
- **Verdict:** ☐ ok ☐ needs-change ☐ note — ____________________________________________

### A5 · RE roll & cash as articulating residual (seed/demo only)
- **Assumes (engine):** closing retained earnings = opening RE + net profit (dividends assumed 0 — no distribution data in v1). **Assumes (demo seed only):** cash is the balancing residual so the demo books articulate — this is seed data, NOT an engine rule.
- **Worked (Acme):** Jun opening RE ₹21,19,500 = May opening ₹18,22,500 + May NP ₹2,97,000.
- **Verdict (dividends=0 convention):** ☐ ok ☐ needs-change ☐ note — __________________________

### A6 · Capitalisation vs expensing of intangibles / preliminary costs (group-authoritative override)
- **Assumes:** the Tally **group is authoritative**, so a ledger the client filed under "Indirect Expenses" is **expensed to P&L** even when its *name* reads like a capital asset — the name-classifier's "this is an intangible/asset" guess loses to the group (correct per source-type-dominates-name). The engine does **not** second-guess the client's capitalise-vs-expense decision.
- **Worked (Orafor Route-C reality-check, real client, UNVERIFIED):** `TRADEMARK EXP` (₹13,060) and `STARTUP EXP` (₹9,340) sit under group "Indirect Expenses" → expensed. The name-classifier wanted `intangibles` / preliminary-expense asset; the conflict detector flagged both (group won). An auditor **may legitimately capitalise** trademark registration / preliminary incorporation costs (Ind AS / Sch III) and amortise — in which case books-vs-audited will differ on these lines. **This is a judgment call, not an engine bug:** is "trust the client's group placement, surface the conflict" the right default, or should named-intangible-under-expense rows be routed to founder-confirm?
- **Verdict:** ☐ ok ☐ needs-change ☐ note — ____________________________________________

---

## B. Observation thresholds (Tier 1 — what counts as "notable")

### B1 · `OBSERVATION_THRESHOLDS`
- **Assumes:** a period-over-period move surfaces as an Observation only if it clears: margin **1.0pp** (gross/EBITDA/net, ROE, ROCE, expense ratios) · ratio **10%** (current/quick, D/E, interest coverage) · revenue & net profit **10%** · working capital **2 days** (DSO/DPO/DIO/CCC) · burn & runway **10%**.
- **Worked (Acme):** gross margin flat at 60% → not surfaced; EBITDA margin +1.6pp → surfaced; current ratio −2.4% → not surfaced.
- **Verdict (are these the right "notable" cut-offs for a founder?):** ☐ ok ☐ needs-change ☐ note — ______________

---

## C. Tier-2 diagnosis rules (interpretation — "why" a move happened)

> Each decomposes a move into drivers computed from engine fields. The *figures* are exact; the *interpretation* (which decomposition, which driver "dominates") is the judgment call.

### C1 · `DIAG.margin_bridge`
- **Assumes:** Δmargin (pp) splits additively — gross = COGS-effect + revenue-effect; EBITDA = gross-margin change + opex/revenue change; net = EBITDA-margin change + D&A/finance/tax/other-income ratio changes.
- **Worked (Acme, EBITDA margin May→Jun +2.2pp):** "Operating-expense ratio change dominates (+2.2pp)"; gross-margin contribution +0.0pp.
- **Verdict:** ☐ ok ☐ needs-change ☐ note — ____________________________________________

### C2 · `DIAG.net_profit_bridge`
- **Assumes:** ΔNP = ΔRevenue − ΔCOGS − Δopex − ΔD&A − Δfinance − Δtax + Δother-income (P&L waterfall; drivers sum to ΔNP).
- **Worked (Acme May→Jun, +₹98,250):** "Revenue is the largest driver (+₹3,30,000)" partly offset by COGS −₹1,32,000 and tax −₹33,750.
- **Verdict:** ☐ ok ☐ needs-change ☐ note — ____________________________________________

### C3 · `DIAG.ratio_nd_bridge`
- **Assumes:** a ratio change splits into an exact numerator-effect + denominator-effect (current ratio, interest coverage, ROE, ROCE — both N and D are engine fields).
- **Worked (Acme, interest coverage May→Jun):** "EBIT change dominates" (EBIT ₹4,58,000 → ₹5,88,000 vs finance costs ₹48,000 → ₹46,000).
- **Verdict:** ☐ ok ☐ needs-change ☐ note — ____________________________________________

### C4 · `DIAG.working_capital_factors`
- **Assumes:** DSO/DPO/DIO move = ceteris-paribus single-factor effects of the underlying balance (implied = metric × flow ÷ days), the flow (revenue/COGS), and days-in-month — **not additive** (multiplicative metric), so we report the dominant single-factor effect.
- **Worked (Acme, DPO May→Jun −2.3 days):** "COGS change is the largest single-factor effect (−3.0 days)"; days-in-month (31→30) contributes −1.1.
- **Verdict (is single-factor the right framing vs a full multiplicative bridge?):** ☐ ok ☐ needs-change ☐ note — ______

### C5 · `DIAG.expense_ratio_bridge`
- **Assumes:** Δ(expense/revenue) splits into expense-effect + revenue-effect (exact N/D bridge).
- **Worked (Acme, opex/revenue May→Jun −2.2pp):** "Revenue change dominates (−3.9pp)" partly offset by expense +1.7pp.
- **Verdict:** ☐ ok ☐ needs-change ☐ note — ____________________________________________

### C6 · `DIAG.burn_bridge`
- **Assumes:** net burn = −(CFO + CFI); Δnet-burn splits additively across net profit, D&A, working-capital change, capex, other-investing.
- **Worked (Acme May→Jun):** "Capex is the largest driver of the net-burn change (−₹2,00,000)" (capex fell ₹3,00,000 → ₹1,00,000).
- **Verdict:** ☐ ok ☐ needs-change ☐ note — ____________________________________________

### C7 · `DIAG.ccc_components`
- **Assumes:** CCC = DSO + DIO − DPO (additive; DPO subtracts).
- **Worked:** not surfaced for Acme (CCC moved < 2 days) — rule still applies when CCC clears the threshold.
- **Verdict:** ☐ ok ☐ needs-change ☐ note — ____________________________________________

### C8 · `DIAG.revenue_line` & `DIAG.ratio_unavailable` (honest n/a rules)
- **Assumes:** revenue gets **no** volume/price/mix split (engine has no unit data — reported as n/a, not guessed); quick-ratio / D-E get **no** driver split because the numerator (quick assets / total borrowings) isn't a `PeriodResult` field.
- **Worked (Acme):** revenue Apr→May "+₹3,00,000, volume/price/mix n/a"; quick ratio not surfaced.
- **Verdict (is honest-n/a acceptable, or must we expose those fields?):** ☐ ok ☐ needs-change ☐ note — ____________

### C9 · `DIAG.runway_bridge`
- **Assumes:** runway = cash ÷ net-burn; change splits into cash-effect + burn-effect.
- **Worked:** not surfaced for Acme (Jun runway n/a — net burn went negative). Rule applies when burn is positive across both periods.
- **Verdict:** ☐ ok ☐ needs-change ☐ note — ____________________________________________

---

## D. Tier-3 recommendation rules (advice — the riskiest layer)

> These convert a diagnosis into an action with a quantified counterfactual impact. The arithmetic is exact;
> whether the **advice is sound** (not mechanically-correct-but-naive) is the judgment call.

### D1 · `REC.dpo_cash_defer`
- **Assumes:** if DPO fell, restoring it to prior defers cash = (DPO_from − DPO_to) × COGS_to ÷ days_to.
- **Worked (Acme May→Jun):** "Restore DPO to 32.9 days (fell to 30.6) → ₹1,11,333 of outflow deferrable."
- **⚠ Known naivety to judge:** advising a founder to *stretch payables* can damage supplier relationships / breach terms. Is this sound as stated, or does it need a caveat / removal?
- **Verdict:** ☐ ok ☐ needs-change ☐ note — ____________________________________________

### D2 · `REC.dso_cash_release`
- **Assumes:** if DSO rose, returning to prior frees cash = (DSO_to − DSO_from) × revenue_to ÷ days_to.
- **Worked:** not triggered for Acme (DSO fell). Fires on receivables blowout.
- **Verdict:** ☐ ok ☐ needs-change ☐ note — ____________________________________________

### D3 · `REC.dio_cash_release`
- **Assumes:** if DIO rose, returning to prior frees cash = (DIO_to − DIO_from) × COGS_to ÷ days_to.
- **Worked:** not triggered for Acme (DIO fell).
- **Verdict:** ☐ ok ☐ needs-change ☐ note — ____________________________________________

### D4 · `REC.opex_ratio_savings`
- **Assumes:** if opex/revenue rose, returning to prior saves = (opexRatio_to − opexRatio_from) × revenue_to.
- **Worked:** not triggered for Acme (opex ratio fell). Fires on opex creep.
- **Verdict:** ☐ ok ☐ needs-change ☐ note — ____________________________________________

### D5 · `REC.cogs_ratio_savings`
- **Assumes:** if COGS/revenue rose, returning to prior recovers gross profit = (cogsRatio_to − cogsRatio_from) × revenue_to.
- **Worked:** not triggered for Acme (COGS ratio flat).
- **Verdict:** ☐ ok ☐ needs-change ☐ note — ____________________________________________

### D6 · `REC.runway_watch`
- **Assumes:** when net burn > 0, restate runway = cash ÷ net-burn as a watch item — no projection beyond the engine figure.
- **Worked:** not triggered for Acme (cash-generative in Jun). Fires when burning.
- **Verdict:** ☐ ok ☐ needs-change ☐ note — ____________________________________________

### D7 · Recommendation confidence labels
- **Assumes:** quantified counterfactuals are labelled `mechanical`; the runway watch is `directional`. Favourable moves generate **no** recommendation (no manufactured advice).
- **Verdict (are these the right confidence semantics for founder-facing advice?):** ☐ ok ☐ needs-change ☐ note — ______

---

## E. Materiality floor (decision engine) — still deferred

### E1 · Dirty-rupee BAND floor
- **Assumes:** a configurable threshold decides when an MIS carries a visible "contains ₹X unclassified" band on the page. The decision engine now *surfaces the dirty-rupee residue as a number* (M9, §F9), but the threshold at which that number triggers a banner is **NOT yet set; NOT to be guessed** — to be tuned from real data (Vision §4). The CA should pre-agree the *method* for setting it. (Distinct from the §F8 gate thresholds, which are conservative config constants and ARE set.)
- **Verdict:** ☐ ok ☐ needs-change ☐ note — ____________________________________________

---

## F. Decision engine — Stage 1 rules + Stage 3 gate (M9)

> `src/lib/decision/` — classifies each parsed TB row into the canonical taxonomy with an **honest
> confidence score**, then a gate routes each row by that score. The score is the heart: it reports how
> *sure* Stage 1 is, not just what it guessed. Built on the same intake fuzzy matcher (`suggestCategories`)
> the analyst sees, so the engine and the manual mapper agree by construction. Confidence is a relative
> 0–1 signal, **NOT a calibrated probability** — the CA is asked to confirm the *bands and routing*, not
> the decimals. Stage 0 (bank reconciliation) and Stage 2 (LLM) are stubbed, not built. Worked figures
> below are from `scripts/decision-coverage.mts`.

### F1 · `STAGE1.confirmed_mapping` — confidence 0.99
- **Assumes:** a mapping a human approved before (per-org code→category or name→category memory) is near-certain and beats all name matching. Default: no prior mappings (nothing is "confirmed" until actually confirmed). This is the learning-loop hook M10 will persist.
- **Worked:** code `SUS01` previously confirmed → `admin_other_opex` ⇒ confidence 0.99 → auto, regardless of the name.
- **Verdict:** ☐ ok ☐ needs-change ☐ note — ____________________________________________

### F2 · `STAGE1.name_exact` — confidence 0.95
- **Assumes:** the source name contains (or is contained by) a canonical name or known synonym phrase ⇒ treat as an exact/known match at 0.95 (high, but never a literal 1.0 — names can still mislead).
- **Worked:** "Salaries & Wages" → `employee_benefits` 0.95 → auto. "Trade Receivables" → AR 0.95 → auto.
- **Verdict:** ☐ ok ☐ needs-change ☐ note — ____________________________________________

### F3 · `STAGE1.name_keyword` — confidence = match strength, capped 0.88
- **Assumes:** a strong, clear-margin keyword/synonym match short of an exact phrase ⇒ medium-high confidence, never claiming certainty from a keyword alone.
- **Worked:** "Software Subscriptions" → `technology_software`.
- **Verdict:** ☐ ok ☐ needs-change ☐ note — ____________________________________________

### F4 · `STAGE1.name_fuzzy` — confidence = match strength, capped 0.60
- **Assumes:** a weak partial match is low-confidence; routed to founder-confirm (≥0.50) or, if weaker, flagged. Carries its best-guess category as a hint either way.
- **Worked:** "HDFC Bank Current Account" → `cash_bank` at 67% match ⇒ 0.60 → founder-confirm.
- **Verdict:** ☐ ok ☐ needs-change ☐ note — ____________________________________________

### F5 · Ambiguity dampening — margin 0.12, cap to founder-confirm (0.55)
- **Assumes:** if the top two candidates are within 0.12 of each other, the call is AMBIGUOUS ⇒ confidence is capped into the founder-confirm band so a human disambiguates (the row keeps both candidates as alternatives). A near-tie is never auto-applied.
- **Worked:** "Sales – Services" ties `operating_revenue` vs `sales & marketing` (both ≈0.50) ⇒ confidence 0.50, reasoning flags AMBIGUOUS → founder-confirm.
- **Verdict:** ☐ ok ☐ needs-change ☐ note — ____________________________________________

### F6 · Low-information stub guard — cap to founder-confirm (0.55)
- **Assumes:** a name composed ENTIRELY of contentless ledger words (misc, sundry, suspense, other, general, adjustment, round-off, control, opening/closing, clearing, transfer, settlement, …) carries no real signal and must never auto-apply — even when the fuzzy matcher finds a substring hit. **This guards a known matcher over-confidence:** "Misc" is a substring of the synonym "misc income", which would otherwise score it 0.95 → auto into `other_income`. The guard caps it to founder-confirm with a "low-information name" note. (Implemented in the decision layer; the shared intake matcher is untouched.)
- **Worked:** "Misc" ⇒ would-be 0.95 `other_income` → capped to 0.55 → founder-confirm, reasoning "generic/low-information name — not auto-applied, needs confirmation".
- **Verdict (is this the right stub list + routing?):** ☐ ok ☐ needs-change ☐ note — ____________________________________________

### F7 · Classify floor — 0.30
- **Assumes:** if the best match is below 0.30 the engine declines to propose at all (confidence 0, `decidedBy: 'unclassified'`) rather than guess. These rows are the genuine unclassifiable residue.
- **Worked:** "Suspense A/c", "Round Off", "Inter-company Settlement" (best guess "Finance costs" only 28%) ⇒ unclassified → flagged.
- **Verdict:** ☐ ok ☐ needs-change ☐ note — ____________________________________________

### F8 · Stage 3 gate thresholds — auto ≥ 0.90, founder-confirm ≥ 0.50, else flagged
- **Assumes:** **config constants, conservative by design** (a HIGH auto bar so the engine errs toward asking the founder rather than silently auto-applying). `auto` = shown but non-blocking; `confirm` = founder approves before it counts; `flag` = unclassifiable residue. These are NOT the materiality floor (§E1).
- **Worked coverage** (% by row count): Acme seeded chart (25 lines) **84% auto / 16% confirm / 0% flagged** (₹0 dirty); a deliberately messy 11-line TB **45.5% / 18.2% / 36.4%** (₹48,512 dirty); the 16 adversarial battery charts ≈ **82% / 18% / 0%** each (clean names → no residue).
- **Verdict (are 0.90 / 0.50 the right conservative bands?):** ☐ ok ☐ needs-change ☐ note — ____________________________________________

### F9 · Dirty-rupee residue surfaced as a number
- **Assumes:** the rupees riding on flagged rows are summed and surfaced (= flagged rupees), so a founder always sees how much ₹ is un-auto-classified. Transparency: every row carries `decidedBy` + `confidence` + plain-language `reasoning` + runner-up alternatives. The **band threshold** that turns this number into a visible banner is still deferred (§E1).
- **Verdict:** ☐ ok ☐ needs-change ☐ note — ____________________________________________

---

_Review owner: ___________________ · Date: ___________________ · Overall: ☐ rules cleared (engine may be labelled VERIFIED for cleared items) ☐ changes required (list above)_
