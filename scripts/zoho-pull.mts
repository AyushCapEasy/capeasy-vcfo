// scripts/zoho-pull.mts — THE PROOF (M-Zoho STOP point). Pull the firm's REAL Zoho sales-side data,
// run the pulled account names through the decision engine, and print classification coverage + the
// labelled sales-side picture. Read-only: no DB writes, no secrets printed.
//   Usage: npx tsx scripts/zoho-pull.mts
import { readFileSync } from 'node:fs';
import { parseEnv, ENV_PATH } from './_env.mjs';
import { readZohoConfig } from '../src/lib/zoho/config';
import { pullSalesSide, fetchInvoiceAccountNames } from '../src/lib/zoho/client';
import { classifyZohoAccounts, crossCheckZohoType } from '../src/lib/zoho/classify';
import { summarizeSales } from '../src/lib/zoho/sales';

const cfg = readZohoConfig(parseEnv(readFileSync(ENV_PATH, 'utf8')));

console.log('=== M-Zoho — sales-side pull (own firm, D-014) ===');
const pull = await pullSalesSide(cfg);
const cur = pull.org?.currency_code ?? '';
const money = (n: number) => `${cur} ${Math.round(n).toLocaleString('en-IN')}`;
console.log(`auth: OK · org: ${pull.org?.name ?? '?'} (${cfg.orgId})`);
console.log(`pulled: ${pull.accounts.length} accounts · ${pull.invoices.length} invoices · ${pull.estimates.length} quotes · ${pull.customers.length} customers · ${pull.payments.length} payments`);
const errKeys = Object.keys(pull.errors);
if (errKeys.length) {
  console.log('\n⚠ endpoint errors (resilient pull — others still ran):');
  for (const k of errKeys) console.log(`  ✗ ${k}: ${pull.errors[k]}`);
}

// --- classification coverage on REAL Zoho account names (the real test of the classifier) ---
let accounts = pull.accounts;
let accountSource = 'chart of accounts';
if (!accounts.length && pull.invoices.length) {
  console.log('\n(chart-of-accounts blocked → deriving account names from invoice line items via invoices.READ…)');
  accounts = await fetchInvoiceAccountNames(cfg, pull.invoices.map((i) => i.invoice_id));
  accountSource = 'invoice line items (sales/income accounts actually used; /chartofaccounts was scope-blocked)';
}
if (!accounts.length) {
  console.log('\n--- classification: SKIPPED — no account names available (see endpoint errors above) ---');
} else {
  // full chart, grouped by Zoho's authoritative account_type
  const byType = new Map<string, string[]>();
  for (const a of accounts) {
    const t = (a.account_type || 'unknown').toLowerCase();
    (byType.get(t) ?? byType.set(t, []).get(t)!).push(a.account_name);
  }
  console.log(`\n--- chart of accounts: ${accounts.length} accounts, by Zoho type [source: ${accountSource}] ---`);
  for (const [t, names] of [...byType.entries()].sort()) console.log(`  ${t} (${names.length}): ${names.join(' · ')}`);

  const { rows, coverage: c } = classifyZohoAccounts(accounts);
  const withType = rows.map((r, i) => ({ r, zohoType: accounts[i]?.account_type ?? '' })); // classify preserves order
  console.log(`\n--- classification coverage: every real account name → decision engine (Stage 1 + gate) ---`);
  console.log(`rows ${c.totalRows} · auto ${c.auto.pct}% (${c.auto.count}) · founder-confirm ${c.confirm.pct}% (${c.confirm.count}) · flagged ${c.flag.pct}% (${c.flag.count}) · dirty residue: ₹0 (n/a — chart-of-accounts carries no balances; coverage is name-driven)`);

  const nonAuto = withType.filter((x) => x.r.bucket !== 'auto');
  console.log(`\nconfirm + flag rows (${nonAuto.length}) — name [zoho type] · conf · reasoning:`);
  for (const { r, zohoType } of nonAuto) console.log(`  [${r.bucket}] ${r.accountName} [${zohoType}]  conf=${r.confidence.toFixed(2)}  ${r.reasoning}`);

  // OVER-CONFIDENCE MISSES — auto at high confidence but the proposed group contradicts Zoho's type
  const misses = withType.filter((x) => x.r.bucket === 'auto' && crossCheckZohoType(x.zohoType, x.r.proposedCategory).suspicious);
  console.log(`\n⚠ OVER-CONFIDENCE MISSES (${misses.length}) — auto-classified high-confidence, but Zoho's account_type disagrees:`);
  for (const { r, zohoType } of misses) {
    const cc = crossCheckZohoType(zohoType, r.proposedCategory);
    console.log(`  ✗ "${r.accountName}" [zoho: ${zohoType}] → ${r.proposedCategoryName} (group: ${cc.proposedGroup}); Zoho type implies group: ${cc.expected?.join('/')}  conf=${r.confidence.toFixed(2)}`);
  }
  if (!misses.length) console.log('  none — every auto classification agrees with Zoho\'s account type.');

  console.log(`\nall auto rows (${withType.filter((x) => x.r.bucket === 'auto').length}) — name [zoho type] → category · conf:`);
  for (const { r, zohoType } of withType.filter((x) => x.r.bucket === 'auto')) console.log(`  [auto] ${r.accountName} [${zohoType}] → ${r.proposedCategoryName}  conf=${r.confidence.toFixed(2)}`);
}

// --- labelled sales-side picture (NOT a complete MIS) ---
const asOf = new Date().toISOString().slice(0, 10);
const s = summarizeSales(pull, asOf);
console.log('\n=== SALES-SIDE ONLY — NOT A COMPLETE MIS (Zoho holds invoices/payments only; no cost side → no P&L/BS) ===');
console.log(`as of ${asOf} · currency ${s.currency ?? '?'}`);
console.log(`invoiced (all):       ${money(s.invoices.totalInvoiced)}  over ${s.invoices.count} invoices`);
console.log(`outstanding (invoices): ${money(s.invoices.totalOutstanding)}`);
console.log(`receivables (customers): ${money(s.customers.totalReceivable)}  across ${s.customers.count} customers`);
console.log(`collected (payments):  ${money(s.payments.totalCollected)}  over ${s.payments.count} payments · quotes: ${s.estimatesCount}`);
console.log('receivables ageing:');
for (const b of s.ageing) console.log(`  ${b.bucket.padEnd(18)} ${String(b.count).padStart(4)}  ${money(b.amount)}`);
console.log('top receivables:');
for (const t of s.topReceivables) console.log(`  ${t.customer}  ${money(t.amount)}`);

console.log('\n--- AR figures: where each number ORIGINATES (for you to reconcile vs the books — not resolved here) ---');
console.log(`  invoice-balance AR = Σ invoices[].balance                    = ${money(s.invoices.totalOutstanding)}  (sum of open-invoice balances; equals the ageing total above)`);
console.log(`  customer-stmt AR   = Σ contacts[].outstanding_receivable_amount = ${money(s.customers.totalReceivable)}  (Zoho's per-customer receivable field; may net advances/credit notes/unused payments)`);

console.log('\n(STOP point reached: connector pulled real data + classifier ran. UI surfacing + DB persistence = the next step, after this proof.)');
