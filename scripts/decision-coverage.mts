// scripts/decision-coverage.mts — M9 classification-coverage report. PURE read of the decision
// engine; writes nothing. Prints % auto / % founder-confirm / % flagged (by row count) plus the
// dirty-rupee residue for: the seeded Acme chart, a deliberately messy TB, and each of the 16
// adversarial battery charts. Run: `npx tsx scripts/decision-coverage.mts`.
import { classify } from '../src/lib/decision/index';
import { SEEDED_ACME_TB, MESSY_TB, rowsFromNaturals } from '../src/lib/decision/sample-charts';
import { CASES, buildInput, computeChainNp } from '../src/lib/engine/battery-charts';
import type { ParsedTbRow } from '../src/lib/intake/types';

const inr = (paise: number) => `₹${(Math.round(paise) / 100).toLocaleString('en-IN')}`;
const pad = (s: string, n: number) => s.length >= n ? s : s + ' '.repeat(n - s.length);
const padL = (s: string, n: number) => s.length >= n ? s : ' '.repeat(n - s.length) + s;

function line(label: string, rows: ParsedTbRow[]) {
  const { coverage: c } = classify(rows);
  console.log(
    pad(label, 30) + ' │ ' +
    padL(`${c.totalRows}`, 4) + ' │ ' +
    padL(`${c.auto.pct}%`, 7) + ' │ ' +
    padL(`${c.confirm.pct}%`, 9) + ' │ ' +
    padL(`${c.flag.pct}%`, 7) + ' │ ' +
    padL(inr(c.dirtyRupeesPaise), 16),
  );
}

function header() {
  console.log(pad('chart', 30) + ' │ ' + 'rows' + ' │ ' + ' % auto' + ' │ ' + '% confirm' + ' │ ' + ' % flag' + ' │ ' + '   dirty-rupees');
  console.log('─'.repeat(30) + '─┼─' + '────' + '─┼─' + '───────' + '─┼─' + '─────────' + '─┼─' + '───────' + '─┼─' + '────────────────');
}

console.log('\n=== M9 Decision Engine — classification coverage (Stage 1 rules → Stage 3 gate) ===');
console.log(`thresholds: auto ≥ ${0.9}, founder-confirm ≥ ${0.5}, else flagged (config constants, conservative)\n`);

console.log('REAL / SEEDED DATA');
header();
line('Acme seeded chart (25 lines)', SEEDED_ACME_TB);
line('Messy real-world TB (11 lines)', MESSY_TB);

console.log('\n16 ADVERSARIAL BATTERY CHARTS (P2; named via NAME_BANK)');
header();
for (const cse of CASES) {
  const p1 = buildInput('p1', 'P1', '2026-04-01', cse.openingRE, cse.p1);
  const p2 = buildInput('p2', 'P2', '2026-05-01', cse.openingRE + computeChainNp(p1), cse.p2);
  line(cse.name, rowsFromNaturals(p2.naturals));
}

// A worked sample of the per-row transparency the engine carries.
console.log('\nSAMPLE PER-ROW TRANSPARENCY (messy TB):');
for (const r of classify(MESSY_TB).rows) {
  console.log(
    `  ${pad(r.accountName, 28)} ${pad(r.bucket, 8)} conf=${r.confidence.toFixed(2)}  ${r.reasoning}`,
  );
}
console.log('');
