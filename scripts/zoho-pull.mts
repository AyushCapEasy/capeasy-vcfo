// scripts/zoho-pull.mts — THE PROOF (M-Zoho STOP point). Pull the firm's REAL Zoho sales-side data,
// run the pulled account names through the decision engine, and print classification coverage + the
// labelled sales-side picture. Read-only: no DB writes, no secrets printed.
//   Usage: npx tsx scripts/zoho-pull.mts
import { readFileSync } from 'node:fs';
import { parseEnv, ENV_PATH } from './_env.mjs';
import { readZohoConfig } from '../src/lib/zoho/config';
import { pullSalesSide } from '../src/lib/zoho/client';
import { classifyZohoAccounts } from '../src/lib/zoho/classify';
import { summarizeSales } from '../src/lib/zoho/sales';

const cfg = readZohoConfig(parseEnv(readFileSync(ENV_PATH, 'utf8')));

console.log('=== M-Zoho — sales-side pull (own firm, D-014) ===');
const pull = await pullSalesSide(cfg);
const cur = pull.org?.currency_code ?? '';
const money = (n: number) => `${cur} ${Math.round(n).toLocaleString('en-IN')}`;
console.log(`auth: OK · org: ${pull.org?.name ?? '?'} (${cfg.orgId})`);
console.log(`pulled: ${pull.accounts.length} accounts · ${pull.invoices.length} invoices · ${pull.estimates.length} quotes · ${pull.customers.length} customers · ${pull.payments.length} payments`);

// --- classification coverage on REAL Zoho account names (the real test of the classifier) ---
const { rows, coverage: c } = classifyZohoAccounts(pull.accounts);
console.log('\n--- classification coverage: chart-of-accounts names → decision engine (Stage 1 + gate) ---');
console.log(`rows ${c.totalRows} · auto ${c.auto.pct}% (${c.auto.count}) · founder-confirm ${c.confirm.pct}% (${c.confirm.count}) · flagged ${c.flag.pct}% (${c.flag.count})`);
const nonAuto = rows.filter((r) => r.bucket !== 'auto');
console.log(`\nconfirm + flag rows (${nonAuto.length}) — name · confidence · reasoning:`);
for (const r of nonAuto) console.log(`  [${r.bucket}] ${r.accountName}  conf=${r.confidence.toFixed(2)}  ${r.reasoning}`);
console.log('\nauto rows — review for over-confidence misses (a human would dispute the category):');
for (const r of rows.filter((r) => r.bucket === 'auto')) console.log(`  [auto] ${r.accountName} → ${r.proposedCategoryName}  conf=${r.confidence.toFixed(2)}`);

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
console.log('\n(STOP point reached: connector pulled real data + classifier ran. UI surfacing + DB persistence = the next step, after this proof.)');
