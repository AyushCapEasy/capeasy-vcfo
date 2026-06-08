# vCFO Dashboard Knowledge Bible
### Domain source-of-truth + build spec for CapEasy's virtual-CFO / MIS engine
**Compiled:** June 2026 · **Version:** 1.1 (post build-readiness audit) · **Owner:** CapEasy
**Status:** Build spec. Financial logic must be CA-reviewed before any output reaches a client.

> **v1.1 changelog:** (1) **Naming corrected — this is an internal MIS engine, not "SaaS."** Analyst-operated; client login stays deferred (§8). Internal ≠ single-tenant: multi-tenancy is retained. (2) **Period-over-period is now a first-class data-model concept** — cash flow, burn, runway, and MoM trend are all *deltas* and cannot be computed from one trial balance; seed **three** consecutive periods. (3) **Dual correctness layer** added: an externally-authored (CA-checked) **golden fixture** + agent-safe **accounting-identity invariants** — self-authored tests prove consistency, not correctness. (4) Strategic decision input sharpened: the engine kills the **pack-rebuild**, not the **TB-extraction**; the number that matters is the *split* (§0.1).

---

## 0. Read this first — what de-risks this build

The hard problem is **not** "what should a vCFO dashboard show" (that's §4–5). It's that client books are **all over the place** (Tally, Zoho Books, Busy, raw Excel, sometimes nothing standardised). A pretty dashboard that can't ingest a real client's export is worthless.

So the spine — and what you build first — is:

> **One canonical intake schema (§3) → one computation engine (§4) → many output views (§5).**

The worst mistake the build can make is to start writing **integrations** (a Tally connector, then Zoho, then…). That's N fragile pieces for N clients, forever. **v1 is manual: a standard upload + a one-time per-client account mapping.** Integrations come only after the engine is proven and one source dominates (§8).

`[ADD DETAIL]` = a decision only Ayush can make. `[VALIDATE]` = must be CA-checked before client launch.

### 0.1 The decision input that actually matters (read before committing the 14-hour run)
This engine is **not** justified on the current sub-10 India clients alone — it is the **production-line prototype** for the Australia/US offshore bookkeeping play and the fundraising-client funnel (decided in prior sessions; still holds).

But size the bet correctly. The tool **kills the monthly pack-rebuild**. It does **not** kill the **monthly extraction of a clean, balanced, account-level trial balance** from messy books. The per-client account mapping is **one-time, reused every period** (§3.2) — so it amortizes, it doesn't relocate the work. The number to know is the **split of monthly hours per client**: how much is *rebuild* (tool removes it) vs *TB extraction/cleaning* (tool doesn't touch it). If rebuild dominates → build. If extraction dominates → a templated Excel + a junior analyst wins until offshore volume changes the math. `[ADD DETAIL: rebuild-vs-extraction hours split]`.

---

## 1. The product, in one model

An **internal MIS engine** that turns a client's raw books into investor- and management-ready financials automatically, so one analyst serves many clients instead of rebuilding every pack by hand. **Not SaaS** — say "internal MIS engine," because "SaaS" smuggles back the client-login/self-serve/subscription assumptions the spec deliberately deferred (§8). The word would bend later decisions; drop it.

**Three layers, built in this order:**
1. **Intake** — heterogeneous books → one canonical shape (§3).
2. **Compute** — statements + metrics, deterministically, **across periods** (§4).
3. **Present** — the right view for the audience (§5): management MIS, investor/fundraising, cash & runway.

Plus a **compliance calendar** (§6) — adjacent, valuable, but a *separate* subsystem (and arguably white-labelled, not built).

**Internal-first, but multi-tenant.** Analyst-operated (no client login in v1). "Internal" is about *who operates it*, not *how it's structured*: keep **multi-tenancy** (org = client; one analyst spans many client-orgs). Dropping "SaaS" does not cost you multi-tenancy — that's an architecture choice, retained.

---

## 2. The vCFO function (domain grounding)

A virtual CFO delivers, on retainer, what a full-time CFO would: management reporting (MIS), cash-flow & runway, budgeting/forecasting, fundraising/investor reporting, unit economics, controls/compliance oversight. The engine automates the **reporting & analysis** core; the human vCFO keeps judgement, commentary, and the relationship.

What it replaces: the monthly manual rebuild of a P&L/BS/cash pack in Excel from a fresh TB. What it does **not** replace: the analyst's review, the commentary, the client conversation, **or the monthly extraction of a clean TB from messy books** (§0.1). Human-in-the-loop is a feature — the analyst signs off before the client sees anything.

---

## 3. THE INTAKE LAYER — canonical schema (build this first)

### 3.1 The principle
Every client's books, whatever the source, reduce to **one canonical object: a period Trial Balance + supporting schedules.** Everything downstream computes from this and never touches the source system directly.

### 3.2 Canonical objects

**Entity** — the client/org: { id, legal name, entity type (Pvt Ltd / LLP / proprietorship), state, currency = INR }.

**Period** — { entity_id, tax_year (TY 2026-27 = 01-Apr-2026→31-Mar-2027; §6.1), month, **prior_period_id**, status (draft/reviewed/locked) }. **`prior_period_id` is mandatory and first-class** — period-over-period is core, not a bolt-on (see §3.5).

**Trial Balance line** — the atomic input: { period_id, source_account_code, source_account_name, debit_amount, credit_amount }. Uploaded as CSV/XLSX.

**Canonical Account Category** — the fixed taxonomy every source account maps INTO:

| Group | Canonical categories |
|---|---|
| **Income** | Operating revenue · Other income |
| **Direct costs** | COGS / cost of services |
| **Operating expenses** | Employee benefits · Rent & utilities · Sales & marketing · Technology/software · Professional fees · Admin & other opex |
| **Below-the-line** | Depreciation & amortisation · Finance costs · Tax expense |
| **Current assets** | Cash & bank · Trade receivables (AR) · Inventory · Prepaid & advances · Other current assets |
| **Non-current assets** | PP&E · Intangibles · Investments · Other non-current assets |
| **Current liabilities** | Trade payables (AP) · Short-term borrowings · Statutory dues · Accrued/other current liabilities |
| **Non-current liabilities** | Long-term borrowings · Provisions · Other non-current liabilities |
| **Equity** | Share capital · Reserves & surplus / retained earnings · Other equity |

**Account Mapping** — the one-time-per-client bridge: { entity_id, source_account_code → canonical_category_id }. Built once at onboarding, **reused every period.** This single table converts "all over the place" into "one shape." The heart of the system — and the reason intake cost **amortizes** (§0.1).

**Supporting schedules** (per period, unlock specific metrics): AR aging · AP aging · cash balances by bank · headcount · revenue detail (by product/segment, recurring-vs-one-time, for MRR) · capex · debt.

### 3.3 Validation rules (gate before compute)
- **TB must balance:** Σ debits = Σ credits (within rounding). Hard-fail + flag.
- **No unmapped accounts:** every source account maps to a canonical category, or the period can't finalise. Surface unmapped lines (remembered once mapped).
- **Period continuity:** closing balances roll forward as opening; flag discontinuities.
- **Sign sanity:** revenue credit-normal, expenses debit-normal — flag inversions.

### 3.4 Onboarding flow (per client, once)
1. Analyst exports the client's TB (Tally/Zoho/Excel). 2. Uploads CSV/XLSX in the standard column format `[ADD DETAIL: lock exact columns]`. 3. Maps each source account → canonical category (fuzzy-match assisted; remembered). 4. Adds supporting schedules. 5. Engine validates → computes → renders. Month 2+: upload + auto-map + review.

### 3.5 Period-over-period is first-class (NEW)
Cash flow (§4.1), burn/runway (§4.4), and MoM trend (§7) are all **deltas** — they require an **opening and a closing** balance, i.e. **≥2 consecutive periods**. A single TB cannot produce any of them. The data model therefore links each period to its prior (`prior_period_id`), and the engine computes comparatives by walking that chain. **Seed three consecutive periods** for the demo client so comparatives are exercised past the first hop. If fewer than two periods exist for an entity, the engine returns **"n/a — needs prior period"** for all delta metrics — it must **never fabricate a prior period** (that violates the no-black-box rule, §8.5).

---

## 4. THE COMPUTATION LAYER — statements & metric formulas

All computed deterministically from the canonical TB + schedules + the prior period. Definitions below are the formula contract.

### 4.1 Financial statements
**P&L (period):** Operating revenue − COGS = **Gross profit**; − Operating expenses = **EBITDA**; − D&A = **EBIT**; − Finance costs = **EBT**; − Tax = **Net profit**.

**Balance Sheet (point-in-time):** Assets (current + non-current) = Liabilities (current + non-current) + Equity. Must tie to TB.

**Cash Flow (indirect — REQUIRES TWO PERIODS):** Net profit + D&A (and other non-cash) ± Δ working capital (**ΔAR, ΔInventory, ΔAP, Δother WC** — each a closing-minus-opening delta) = **CFO**; − capex ± investments = **CFI**; ± borrowings ± equity ± interest/dividends = **CFF**; sum = net change in cash; **closing cash must tie to the balance-sheet closing cash** (identity invariant, §4.5). With <2 periods → "n/a — needs prior period."

### 4.2 Core ratios
Current ratio = CA ÷ CL · Quick ratio = (CA − Inventory) ÷ CL · Gross margin = Gross profit ÷ Revenue · EBITDA margin = EBITDA ÷ Revenue · Net margin = Net profit ÷ Revenue · ROE = Net profit ÷ Equity · ROCE = EBIT ÷ (Total assets − CL) · Debt-to-equity = Total debt ÷ Equity · Interest coverage = EBIT ÷ Finance costs.

### 4.3 Working-capital metrics
DSO = (AR ÷ Revenue) × days · DPO = (AP ÷ COGS) × days · DIO = (Inventory ÷ COGS) × days · Cash conversion cycle = DSO + DIO − DPO.

### 4.4 Startup / SaaS metrics (the fundraising view's core — most need ≥2 periods)
Gross burn = total operating cash outflow (month) · Net burn = cash out − cash in (**= opening cash − closing cash ex-financing → needs 2 periods**) · Runway = current cash ÷ avg monthly net burn · MRR = Σ recurring revenue (needs recurring tag) · ARR = MRR × 12 · Revenue growth % = (current − prior) ÷ prior (**needs 2 periods**) · CAC = S&M spend ÷ new customers · ARPA = recurring revenue ÷ active accounts · LTV = (ARPA × gross margin) ÷ revenue churn · LTV:CAC (>3 healthy) · CAC payback = CAC ÷ (ARPA × gross margin) · Logo churn % = lost ÷ start · NRR % = (start MRR + expansion − contraction − churn) ÷ start MRR · Rule of 40 = revenue growth % + EBITDA (or FCF) margin %.

`[VALIDATE]` churn/MRR definitions vary by model — confirm the client's recurring-revenue definition. Where inputs can't support a metric, show "n/a — needs <input>", never a fabricated number.

### 4.5 Accounting-identity invariants (NEW — the agent-safe test layer)
These are **identities, not restatements of a formula**, so they catch errors even when the agent authors them (unlike circular self-tests, §10.6). The engine must assert, every period:
- **Balance-sheet identity:** Assets = Liabilities + Equity (within rounding).
- **Cash tie-out:** closing cash from the Cash Flow statement = closing cash on the Balance Sheet.
- **P&L → equity:** net profit for the period flows to the movement in retained earnings/reserves (opening RE + net profit − distributions = closing RE).
- **TB integrity:** Σ debits = Σ credits (also §3.3).
Any violation = hard fail surfaced to the analyst, not a silent pass.

---

## 5. OUTPUT VIEWS (templates on one engine)

**A. Management MIS pack (operating SME) — default monthly deliverable:** P&L (actual, MoM trend), BS summary, cash-flow summary, ratios (§4.2–4.3), AR/AP aging, budget-vs-actual `[ADD DETAIL]`, analyst commentary block. Export: PDF + source workbook.

**B. Fundraising / investor-readiness view (startups raising) — first scoped use case:** burn, runway, MRR/ARR, growth curves, unit economics (§4.4), cash position, investor one-pager. Bundled (free, 3 months) with fundraising clients / CapBlue pipeline. Same engine — template B, not a second product.

**C. Cash & runway view:** daily/weekly cash, burn trend, runway countdown, scenario toggle `[ADD DETAIL]`.

**D. Board deck export** `[P2]`.

---

## 6. COMPLIANCE CALENDAR LAYER (current as of June 2026)

Per-entity statutory due-date tracker. **Strategic note:** overlaps commodity tools — **white-label or build thin**, don't sink the best engineering here.

### 6.1 Tax Year change
From **01-Apr-2026**, the **Income Tax Act, 2025** replaces "Financial Year/Assessment Year" with **"Tax Year" (TY)**. TY 2026-27 = 01-Apr-2026→31-Mar-2027. Label periods as TY going forward (keep FY/AY as aliases for older data). `[VALIDATE]` transitional edge cases.

### 6.2 Recurring statutory calendar (rule-driven, not a flat list)
**Monthly:** 7th TDS/TCS deposit (March → 30 Apr) · 10th GSTR-7/8 · 11th GSTR-1 (monthly) · 13th GSTR-1 IFF (QRMP), GSTR-6 · 15th EPF + ESI deposit · 20th GSTR-3B (monthly), GSTR-5A · 22/24th GSTR-3B (QRMP, state-staggered) · 25th PMT-06 (QRMP).
**Quarterly:** TDS returns (24Q/26Q) Q1 31 Jul / Q2 31 Oct / Q3 31 Jan / Q4 31 May · Advance tax (cumulative) 15 Jun 15% / 15 Sep 45% / 15 Dec 75% / 15 Mar 100%.
**Annual:** ITR non-audit 31 Jul; audit cases 31 Oct (tax-audit report 30 Sep; TP 30 Nov) · GSTR-9/9C 31 Dec · ROC: DPT-3 30 Jun, DIR-3 KYC 30 Sep, AGM within 6 months of FY-end (first AGM 9 months), ADT-1 within 15 days of AGM, AOC-4 within 30 days of AGM, MGT-7/7A within 60 days of AGM, MSME-1 half-yearly (30 Apr & 31 Oct).

### 6.3 Penalty notes
ROC late filing ₹100/day per form, **uncapped** · TDS return late ₹200/day (§234E) · GSTR-9 late ₹200/day capped at 0.5% turnover · GST thresholds ₹40L goods / ₹20L services.

### 6.4 Build rule
Model as **recurrence rules + per-entity applicability flags** (entity type, GST scheme monthly/QRMP, has-employees → PF/ESI, AGM date → ROC dates), NOT static dates. Make government-extension overrides a config action, not a code change. `[VALIDATE]` all dates against official portals at build time.

---

## 7. Dashboard UX / structure

Per-client workspace → period selector (TY-aware) → view switcher (MIS / Investor / Cash) → commentary → export. **Analyst review state** on every period (draft → reviewed → locked); nothing exports as "final" without review. **Trend-first** (every headline carries MoM/YoY — needs the period chain, §3.5). **Drill-down**: headline → statement line → mapped accounts. Honest empties ("needs <schedule>" / "needs prior period"), never a guess.

---

## 8. Architecture principles (hard guardrails)

1. **Engine once, views many.** Compute in one place; views only render.
2. **No accounting-software integrations in v1.** Manual standard upload + one-time per-client mapping only. Integrations are a later optimisation, not a v1 feature.
3. **Internal-first, multi-tenant.** Analyst-operated; client login is `[P2]`/deferred. "Internal" ≠ single-tenant — keep org=client multi-tenancy.
4. **Human-in-the-loop.** Analyst review gates every client-visible output.
5. **Deterministic & traceable.** Every number traces to mapped TB lines (or a named prior period). No black-box figures; **never fabricate a prior period** (§3.5).
6. **Period-over-period is first-class** (§3.5) — not bolted on at render time.
7. **TY-aware** periods; **INR**, single currency v1.

---

## 9. Product translation — feature map

| # | Module | Layer | Priority |
|---|---|---|---|
| 1 | Foundation — auth, multi-tenant (org=client), roles, app shell, audit log | — | **P0** |
| 2 | **Intake** — TB upload (CSV/XLSX), canonical CoA, per-client mapping UI w/ fuzzy suggest, validation gate, **period chain (prior_period_id)** | §3 | **P0** |
| 3 | **Compute** — P&L, BS, **Cash Flow (2-period)**, ratios, working-capital, startup metrics, **identity invariants** | §4 | **P0** |
| 4 | **MIS view (A)** — monthly pack + MoM trend + commentary + PDF/workbook export | §5A | **P0** |
| 5 | **Investor/fundraising view (B)** — burn, runway, MRR/ARR, unit economics, one-pager | §5B | **P1** |
| 6 | **Cash & runway view (C)** | §5C | **P1** |
| 7 | AR/AP aging + supporting-schedule intake | §3.2 | **P1** |
| 8 | **Compliance calendar** — rule-driven, per-entity (consider white-label) | §6 | **P1** |
| 9 | Budget-vs-actual; scenario/forecast | §5 | **P2** |
| 10 | Board deck export; client-facing login | §5D, §8 | **P2** |

**First overnight MVP = P0 (1–4): an analyst uploads ≥2 consecutive periods of one client's TB, maps accounts once, and gets a correct, identity-checked P&L + Balance Sheet + Cash Flow + ratio set rendered as an MIS pack with PDF export.**

---

## 10. Guardrails (before client launch)

1. **Not financial/investment advice** — outputs are management information; commentary is the analyst's.
2. **CA review of the formula layer (§4)** before any client sees output — esp. cash-flow construction and tax/statutory lines. **Pull this forward to fixture authoring (§10.6).**
3. **Data security** — client financials are sensitive; encrypt at rest/in transit, tenant isolation, access logs. CapEasy is itself a Data Fiduciary under DPDP here — treat as a real requirement.
4. **No fabricated numbers** — missing input → "n/a, needs X," never an estimate. Includes never fabricating a prior period (§3.5).
5. **The compliance calendar is a liability surface** — wrong date = client penalty. Validate against portals; show "verify on portal."

### 10.6 Correctness must be proven by something the engine didn't author (NEW)
Self-authored tests prove **consistency, not correctness**: if the agent misreads a formula, it bakes the same error into the engine *and* the "expected value," the test goes green, and the morning review reports false confidence — more dangerous than a red test. Open the loop with **two layers**:
- **Golden fixture (external, non-circular):** a demo client's P&L/BS/CF computed to the rupee across **three consecutive periods**, authored by a **human who is not the build agent** and **CA-checked**, committed as a **frozen fixture**. The engine asserts against these numbers. *(A fixture you hand-build at midnight can carry your error instead of the agent's — hence the CA check.)*
- **Identity invariants (internal, agent-safe):** §4.5 — assets=liab+equity, CF closing cash = BS closing cash, net profit → retained-earnings movement, TB balances. Identities, not formula restatements, so they catch errors even when agent-written.
Both together open the loop; either alone leaves a hole. **The fixture numbers cannot be auto-generated — they are an Ayush/CA input.**

---

## 11. Open items — Ayush to resolve / CA to validate

- `[ADD DETAIL]` Exact standard upload template columns.
- `[ADD DETAIL]` **Rebuild-vs-extraction monthly-hours split** (§0.1) — the real build/no-build input.
- `[ADD DETAIL]` Which accounting system to prioritise for *eventual* integration (based on actual client mix).
- `[ADD DETAIL]` Fee model + prep TAT (recurring placeholders).
- `[ADD DETAIL]` Budgets/forecasts captured? In what format?
- `[INPUT REQUIRED]` **The three-period golden-fixture numbers, CA-checked** (§10.6) — blocks the correctness milestone; cannot be auto-generated.
- `[VALIDATE]` Cash-flow indirect construction + tax-line treatment (CA).
- `[VALIDATE]` MRR/churn definitions per client model.
- `[VALIDATE]` All statutory dates against portals; TY transitional edge cases.

---

## 12. Sources
Financial-statement structure, ratio & SaaS-metric definitions: standard finance/accounting practice. Indian statutory calendar & thresholds (June 2026): EZTax, TaxGuru, Treelife, Practive, TaxGyani, Radaga and allied compliance calendars, cross-referenced; Income Tax Act 2025 "Tax Year" change noted across FY2026-27 calendars. §3 is what you build first; §8 is the line you don't cross; §10.6 is what makes the numbers trustworthy.

*End of bible. v1.1 load-bearing changes: it's an internal MIS engine (not SaaS); period-over-period is first-class and the demo seeds three periods; correctness = external CA-checked fixture + identity invariants, never self-authored tests alone.*
