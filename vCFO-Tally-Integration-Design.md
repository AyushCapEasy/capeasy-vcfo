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
