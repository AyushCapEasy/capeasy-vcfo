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

## E. Forthcoming (set during M9 — flagged here so it isn't forgotten)

### E1 · Materiality floor (decision engine, M9)
- **Assumes:** a configurable "dirty-rupee" threshold decides when an MIS carries a visible "contains ₹X unclassified" band. **NOT yet built; NOT to be guessed** — to be tuned from real data (Vision §4). The CA should pre-agree the *method* for setting it.
- **Verdict:** ☐ ok ☐ needs-change ☐ note — ____________________________________________

---

_Review owner: ___________________ · Date: ___________________ · Overall: ☐ rules cleared (engine may be labelled VERIFIED for cleared items) ☐ changes required (list above)_
