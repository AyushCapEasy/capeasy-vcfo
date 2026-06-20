# vCFO — Tally Integration Design Doc
**Status:** Design / research doc (not a build-now spec). Tally is the **accrual source of truth** the corrected thesis depends on — it holds depreciation, payables, receivables, provisions that bank+GST structurally cannot give (proven by the ABPAUL reconciliation PoC).

## WHY TALLY MATTERS (the corrected thesis)
The PoC proved bank+GST cannot reconstruct accrual financials. The accrual layer lives in the accounting system. Zoho (this firm) is sales-only, so for full accrual books we need Tally. **Tally is the source; bank+GST/Zoho overlays reconcile against it.** This integration's job is to get the *full accrual chart + balances* out of Tally into the engine.

## LEGITIMACY GUARDRAIL (non-negotiable — we are a compliance firm)
- We do NOT build, market, or design anything whose purpose is to **bypass Tally's licence tiers**. Inducing clients to circumvent Tally licensing is a legal and reputational risk wildly disproportionate to what it saves — and self-defeating for a firm whose brand is compliance.
- We use Tally's **own sanctioned interfaces** (native export; the documented local XML/HTTP gateway where the client's licence provides it). Whether a given interface is available on a client's tier is Tally's call, not something we engineer around.
- Exporting one's own data from Tally is always permitted — that's the safe, universal floor (Route C).

## THE THREE ROUTES (not equivalent)

**Route A — Local gateway agent.** Small program on the client's machine reads Tally's local XML/HTTP interface. Richest data (full accrual books), works regardless of cloud setup. Cost: per-client install, Tally must be running, desktop-deployment/support burden, licence-tier dependent. → **v2 automation.**

**Route B — Tally cloud sync.** For clients on TallyPrime server / Tally-on-cloud, data is remotely reachable. No install, but only works for the minority on that setup; access path depends on their config. → **opportunistic, not the primary path.**

**Route C — Export / upload.** Client exports from Tally (native XML/Excel export), uploads; existing intake handles it. Works for 100% of Tally clients, zero install, no licence question (own-data export is always allowed), reuses built intake. Not seamless/live. → **LEAD WITH THIS.**

## RECOMMENDED SEQUENCE (KISS)
1. **Route C first (build-now candidate).** Define the Tally export format (Day Book / Trial Balance / Ledger export — research which Tally export carries the full accrual chart + closing balances). Parse it through existing intake + decision engine. Proves "Tally accrual data → MIS" THIS week, no install, no licence risk. Gets the accrual books bank+GST can't.
2. **Route A second (v2).** Once the thesis is proven on Route C data, build the local agent against Tally's sanctioned local gateway for seamless auto-fetch. This is the "as integrated as possible" end-state — but only after Route C proves the data is usable.
3. **Route B opportunistic.** Support cloud-synced clients where it's easy; don't gate the roadmap on it.

## RESEARCH QUESTIONS (before any build — agent answers these first)
- Which Tally export (TB / Day Book / Ledger / Group Summary) carries the **full accrual chart of accounts WITH closing balances** needed for a P&L + Balance Sheet? Tally exports several formats — identify the one that gives accrual completeness, not just transactions.
- What format does that export produce (XML schema / Excel layout), and how consistent is it across Tally versions (TallyPrime vs older)?
- For Route A later: what is Tally's documented local gateway interface, what licence tiers expose it, and what's the auth/connection model — established legitimately, not as a bypass.

## SCOPE GUARDRAILS
- Accrual SOURCE only via Tally; bank/GST/Zoho remain RECONCILIATION OVERLAYS, never sources (per the corrected thesis — overlays check against Tally's numbers, never produce statement numbers).
- Real client data → test in-memory, no DB persistence, gitignored paths, until the deferred production-project separation (D-014) exists.
- Decision engine note: Tally account names are real chart-of-account names (like Zoho's), so the existing name-classifier applies — and the source-account-type-dominates-name fix (from the Zoho pull) applies here too if Tally exports carry a type/group.

## DELIVERABLE OF NEXT STEP
Agent answers the research questions (which export, what format) FIRST and reports — before writing any parser. Then Route C parse against one real client's Tally export, classified through the decision engine, compared to that client's audited statements (the reconciliation test, now on the RIGHT source — accrual data, not bank).

---

## EMPIRICAL FINDINGS — Route C on real client data (Orafor Clothing Pvt Ltd, FY 2024-04-09 → 2025-03-31)
**Status:** real-client reality-check (D-007/D-014: in-memory, gitignored `.client-data.local/`, never persisted/committed). All ₹ figures are the **Tally reconstruction, UNVERIFIED** pending the operator's audited answer key. Run via `.client-data.local/_recon.mts` (gitignored).

### What the real export actually is (answers the RESEARCH QUESTIONS above)
- The client gave **two `Import Data / "All Masters"` XML files**, not a single TB:
  - **Masters** (`Master- ORAFOR.xml`): 660 `<LEDGER>` with `<PARENT>` groups + a balance field. **No `<CLOSINGBALANCE>` tag anywhere.**
  - **Day Book** (`Transactions ORAFOR.xml`): 1,752 vouchers / 5,381 postings. Also no closing balances.
- **No Tally export here carries a ready-made closing-balance TB.** The closing TB must be **derived**.
- **The master `<OPENINGBALANCE>` field is the period CLOSING balance, not an opening to add** (proven: `JATIN DIRECTOR LOAN` field ₹49,79,756 == the sum of its 17 day-book receipts that year — an opening cannot equal current-year flows). Of 158 ledgers with a field, 48 are active (field == Σpostings) and 110 are dormant carried balances (postings = ₹0); **no ledger has both**. ⇒ correct rule: **closing = master field where present, else day-book Σpostings.** `opening + postings` double-counts (gave director loan ₹99.6L instead of ₹49.8L).
- Sign convention (confirmed both files): **debit = negative** (`ISDEEMEDPOSITIVE=Yes` ↔ negative `<AMOUNT>`; same for `<OPENINGBALANCE>`). Day-book postings cross-foot to **₹0** (every voucher; parse validated).
- **Encoding/shape reality-check for the parser:** these real exports are **UTF-16 LE**, and the accrual chart arrives as **`All Masters` + `Day Book`**, not the `<LEDGER><PARENT><CLOSINGBALANCE>` DATA shape `src/lib/tally/parse.ts` assumes (it reads `utf8` and expects `<CLOSINGBALANCE>`). The production Route-C parser must (a) detect/decode UTF-16, and (b) support the masters-field-as-closing + day-book derivation, not just a pre-computed TB.

### ⚠ GAP-1 (PRIORITY ENGINE GAP) — closing stock lives in Tally's INVENTORY subsystem, not the ledgers
For a stock-holding business, **closing stock is held as inventory valuation (stock items × rates), with NO ledger posting**. Orafor's `Opening Stock` (Stock-in-Hand) ledger carries **₹43,85,970** but has **zero day-book postings**. Consequence of a ledger-only reconstruction:
- **COGS is overstated** (full purchases ₹94,80,469 with no closing-stock credit) → a **fake ₹46.4L net loss** vs an expected ~₹2.5L.
- The derived closing TB is **off by exactly ₹62,39,070 = ₹18,53,100 (unreconciled opening-balance difference in the masters) + ₹43,85,970 (closing stock with no ledger counter-entry)**.
- **This is structural, not a parse error, and it affects EVERY inventory business (retail / manufacturing / wholesale)** — a large part of the target market. A ledger-only Route-C pipeline cannot produce a correct P&L/BS for them.
- **Required:** before Route C can handle stock-holding companies, the reconstruction must obtain closing stock from **Tally's inventory data** (`<ALLINVENTORYENTRIES.LIST>` / stock summary / Stock-in-Hand ledger value) **or accept it as an explicit operator input**, and apply the closing-stock adjustment (credit COGS / hold as current asset). Until then, flag stock-holders explicitly. → tracked as a DevDoc backlog item.

### GAP-2 (✅ APPLIED 2026-06-20, operator-approved) — "Duties & Taxes" group alias
`src/lib/tally/groups.ts` keyed only `'duties and taxes'`, but Tally's real group **"Duties & Taxes"** normalises (`&`→space) to **`"duties taxes"`** → 12 GST ledgers fell to **unclassified**, dropping net GST from the BS. **Fix applied:** added `'duties taxes': 'statutory_dues'` alias. Result: 62/62 tests green; GST now lands on the BS as **Statutory dues (net −₹46,951 input credit)**; auto-coverage 84.8% → **91.1%**; unclassified 13 → 1 (only "Profit & Loss A/c", which is correct). Still TODO: audit any other default Tally groups containing `&`. (Committed on `m-tally`.)

### Reconstruction snapshot (UNVERIFIED — for the next-turn audited diff)
- Coverage (191 balance-carrying ledgers): **84.8% auto / 15.2% flagged**; 15 group-authoritative name↔group conflicts.
- P&L: Revenue ₹87,02,534 · Expenses ₹1,33,42,368 · **Net −₹46,39,834 (PRE-closing-stock)**.
- BS: Assets ₹79,87,140 · Liabilities ₹63,26,372 · Equity −₹1,53,864; director loan ₹49,79,756; inventory ₹43,85,970.
- **Next-turn diff protocol (operator-set):** apply the **₹43.86L closing-stock credit to COGS first** (moves P&L −₹46L → ~−₹2.5L), then classify diffs as (a) clean match, (b) audit-adjustment gap [closing stock, opening-balance difference, capitalization calls — expected], (c) **engine gap [the real bug signal]**. Only (c) is a fix.
