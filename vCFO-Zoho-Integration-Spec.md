# vCFO — Zoho Books Integration (M-Zoho)
**Scope:** First real integration. Sales-side connector. KISS — prove it works, defer hardening.

## DECISION RECORD (log as D-014)
- **D-007 reverted:** real data is now permitted in `capeasy-vcfo`. Data-separation (separate production project + RLS audit) is DEFERRED but MANDATORY before any client-facing launch. Keep this as an explicit, un-droppable launch blocker — it is deferred, not gone.
- Real data = **own firm's Zoho first**, not multiple clients'. Client data comes later, after separation exists.
- Philosophy: KISS, build/test/prove, then secure.

## NON-NEGOTIABLE (survives KISS — irreversible-harm only)
- Vercel auth wall stays ON (no real data on a public URL).
- Secrets only in gitignored env. OAuth client ID/secret + tokens NEVER in chat/tracked files/commits.
- Watermark stays ON.
- Everything else: defer freely.

## REALITY OF THE SOURCE (scope honestly)
Firm uses Zoho Books for **invoices, quotes, payments only — NOT purchases/expenses.** So Zoho holds the **sales / receivables** side, not a complete ledger. This connector pulls the **revenue picture**, and CANNOT produce a complete P&L/BS alone. It is **input one** of a future multi-source system (Zoho sales + bank + GST). Do not present Zoho output as a full MIS — label it "sales-side / partial."

## YOU DO (manual, 5 min — credentials are account-level)
Register an OAuth app in the Zoho API console (Zoho Books scope), get client ID + secret, drop them in gitignored `.env.local`. Agent points you to exact clicks if needed.

## M-Zoho — BUILD
1. **OAuth connect.** Self-client/OAuth flow against the firm's real Zoho Books org. Tokens to gitignored env. Confirm auth works end-to-end before pulling anything.
2. **Pull (v1, tight):** chart of accounts; invoices; customers/receivables; payments. Sales-GST where present. NOT a forced P&L/BS — Zoho lacks the cost side.
3. **Map** pulled accounts → existing canonical taxonomy via the existing decision engine (Stage 1 + gate). Real account names = real test of the classifier. Report coverage (auto/confirm/flag).
4. **Surface** the sales-side picture in the app (revenue, receivables, collection/ageing, sales trend), clearly labelled **"sales-side only — not a complete MIS."** Watermark stays.
5. **Tokens/secrets** gitignored. Auth wall on.

## TEST = the proof
Pull the firm's real Zoho data, run it through the engine + decision engine, and check: does the classifier handle real Zoho account names? Does the receivables/sales picture match what the firm knows to be true? Report coverage + any classification the firm would dispute (over-confidence misses).

## OUT OF SCOPE (don't build now)
Tally (separate design doc, research cloud routes first); bank + GST classification (build when that data lands); full P&L/BS (needs the cost side); client data (own firm first); data separation (deferred, tracked as launch blocker).

STOP after the connector pulls real data and the classifier runs on it. Report auth status, what was pulled, classification coverage on real names, and the labelled sales-side view.
