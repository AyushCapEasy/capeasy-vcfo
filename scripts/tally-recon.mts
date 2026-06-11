// scripts/tally-recon.mts — Route C runner: reconstruct P&L + BS from a real client's Tally TB XML.
// READ-ONLY, in-memory; no DB write, nothing persisted. The TB export lives in the gitignored
// .client-data.local/ path (D-014 posture). Usage: npx tsx scripts/tally-recon.mts [path-to-tb.xml]
import { readFileSync } from 'node:fs';
import { reconstructFromTallyXml } from '../src/lib/tally/index';

const path = process.argv[2] ?? '.client-data.local/tally-tb.xml';
const inr = (p: number) => '₹' + Math.round(p / 100).toLocaleString('en-IN');

let xml: string;
try { xml = readFileSync(path, 'utf8'); }
catch { console.error(`Could not read ${path}. Put the Tally TB XML export in .client-data.local/ (gitignored) and pass its path.`); process.exit(1); }

const { parse, decisions, statements: s } = reconstructFromTallyXml(xml);
console.log('=== Tally Route C — TB → MIS reconstruction (in-memory; no DB; no persistence) ===');
console.log(`parse: format=${parse.format} · ledgers=${parse.ledgers.length} · with parent group=${parse.withGroup}`);
for (const w of parse.warnings) console.log(`  ⚠ ${w}`);

// classification summary
const byHow = new Map<string, number>();
for (const d of decisions) byHow.set(d.decidedBy, (byHow.get(d.decidedBy) ?? 0) + 1);
console.log('\nclassification (group authoritative, name refines):');
console.log('  ' + [...byHow.entries()].map(([k, n]) => `${k}:${n}`).join(' · '));
const conflicts = decisions.filter((d) => d.conflict);
console.log(`\n⚠ name↔group CONFLICTS (${conflicts.length}) — Tally group won; review these:`);
for (const c of conflicts) console.log(`  ✗ ${c.name} [group "${c.parentGroup}" → ${c.categoryName}]  ${c.conflictDetail}`);
const uncl = decisions.filter((d) => !d.category);
if (uncl.length) console.log(`\nunclassified (${uncl.length}): ` + uncl.map((u) => `${u.name} [${u.parentGroup}]`).slice(0, 20).join(' · '));

console.log('\n--- RECONSTRUCTED P&L ---');
for (const l of s.pl.lines) console.log(`  ${l.label.padEnd(34)} ${inr(l.valuePaise).padStart(16)}`);
console.log(`  ${'Revenue'.padEnd(34)} ${inr(s.pl.revenuePaise).padStart(16)}`);
console.log(`  ${'Expenses'.padEnd(34)} ${inr(s.pl.expensesPaise).padStart(16)}`);
console.log(`  ${'Net profit'.padEnd(34)} ${inr(s.pl.netProfitPaise).padStart(16)}`);

console.log('\n--- RECONSTRUCTED BALANCE SHEET ---');
for (const l of s.bs.lines) console.log(`  ${l.label.padEnd(34)} ${inr(l.valuePaise).padStart(16)}`);
console.log(`  ${'Total assets'.padEnd(34)} ${inr(s.bs.assetsPaise).padStart(16)}`);
console.log(`  ${'Total liabilities'.padEnd(34)} ${inr(s.bs.liabilitiesPaise).padStart(16)}`);
console.log(`  ${'Total equity'.padEnd(34)} ${inr(s.bs.equityPaise).padStart(16)}`);

console.log('\n--- internal checks ---');
console.log(`  TB Σdebit ${inr(s.checks.tbDebitPaise)} vs Σcredit ${inr(s.checks.tbCreditPaise)} → balanced: ${s.checks.tbBalanced}`);
console.log(`  Assets − (Liab+Equity) ${inr(s.checks.assetsMinusLEPaise)} vs net profit ${inr(s.checks.netProfitPaise)} → ties: ${s.checks.plTiesToBs}`);
console.log('\n(To reconcile vs audited statements: provide the audited xlsx and I will diff line-by-line, splitting engine gaps from audit-adjustment gaps.)');
