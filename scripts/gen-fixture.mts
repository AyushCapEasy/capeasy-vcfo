// scripts/gen-fixture.mts — run the pure engine + §4.5 invariants against the LIVE seeded demo data
// and write fixtures/PROPOSED-golden.json. EVERY value is marked UNVERIFIED: this is self-authored
// exercise output, NOT a CA fixture (Bible §10.6). No number is "correct" until CA sign-off.
//   npm run fixture
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { loadEnv } from './_env.mjs';
import { computeChain, computePeriod } from '../src/lib/engine/engine';
import { checkInvariants, perturbNatural } from '../src/lib/engine/invariants';
import type { PeriodEngineInput } from '../src/lib/engine/types';

const env = loadEnv();
const { default: pg } = await import('pg');
const db = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await db.connect();

const CA_VALIDATE = [
  'RE roll: seed retained-earnings opening rolls on prior-period net profit (DECISIONS D-003) — exercise data.',
  'Cash residual: seed cash is the balancing plug so the demo books articulate (DECISIONS D-003) — exercise data.',
  'Parenthesis / sign-handling rules in TB intake are accounting rules, not parsing rules (DECISIONS D-006) — opt-in flips need CA sign-off.',
  'Cash-flow indirect construction: capex reconstructed as Δ(net depreciable assets) + D&A, i.e. NO DISPOSALS assumed.',
  'Cash-flow: dividends/distributions assumed 0 (no distribution data in v1); tax-line treatment within operating CF.',
  'P&L: other-income placed below EBIT (non-operating), before tax (seed has 0 → no effect here).',
  'Startup metrics: burn / MRR / churn definitions vary by model (Bible §4.4 [VALIDATE]) — confirm per client.',
  '[INPUT REQUIRED] The three-period golden-fixture numbers, CA-checked — cannot be auto-generated; this file is the PROPOSED placeholder until provided.',
];

try {
  const org = (await db.query(`select id from public.orgs where legal_name=$1`, ['Acme Foods Pvt Ltd'])).rows[0];
  const periods = (await db.query(
    `select id, label, period_month::text as month, prior_period_id from public.periods where org_id=$1 order by period_month`, [org.id]
  )).rows;

  const inputs: PeriodEngineInput[] = [];
  for (const period of periods) {
    const catRows = (await db.query(
      `select ac.code, ac.normal_balance, sum(tbl.debit_amount) dr, sum(tbl.credit_amount) cr
       from public.trial_balance_lines tbl
       join public.account_mappings am on am.org_id=tbl.org_id and am.source_account_code=tbl.source_account_code
       join public.account_categories ac on ac.id=am.category_id
       where tbl.period_id=$1 group by ac.code, ac.normal_balance`, [period.id]
    )).rows;
    const naturals: Record<string, number> = {};
    for (const c of catRows) {
      const net = Number(c.dr) - Number(c.cr);
      naturals[c.code] = c.normal_balance === 'debit' ? net : -net;
    }
    const tb = (await db.query(`select coalesce(sum(debit_amount),0) dr, coalesce(sum(credit_amount),0) cr from public.trial_balance_lines where period_id=$1`, [period.id])).rows[0];
    const rec = (await db.query(`select coalesce(sum(amount),0) amt from public.schedule_revenue_detail where period_id=$1 and is_recurring=true`, [period.id])).rows[0];
    inputs.push({
      periodId: period.id, label: period.label, periodMonth: period.month,
      naturals, tb: { debitPaise: Number(tb.dr), creditPaise: Number(tb.cr) },
      recurringRevenuePaise: Number(rec.amt) || null,
    });
  }

  const results = computeChain(inputs);
  const periodsOut = results.map((r, idx) => {
    const prior = idx > 0 ? { input: inputs[idx - 1], result: results[idx - 1] } : null;
    const invariants = checkInvariants(inputs[idx], r, prior);
    return { _verification: 'UNVERIFIED — pending CA sign-off', label: r.label, periodMonth: r.periodMonth, pnl: r.pnl, balance_sheet: r.balanceSheet, cash_flow: r.cashFlow, ratios: r.ratios, working_capital: r.workingCapital, startup_metrics: r.startupMetrics, invariants };
  });

  // Perturbation against REAL data: corrupt the last period's AR by a known amount → cash tie must break by exactly it.
  const X = 5000000; // ₹50,000 in paise
  const lastIdx = inputs.length - 1;
  const corrupted = perturbNatural(inputs[lastIdx], 'trade_receivables', X, 'debit');
  const corruptedResult = computePeriod(corrupted, inputs[lastIdx - 1]);
  const corruptedInv = checkInvariants(corrupted, corruptedResult, { input: inputs[lastIdx - 1], result: results[lastIdx - 1] });
  const cashTie = corruptedInv.find((x) => x.id === 'cash_tie_out')!;
  const perturbation = {
    description: `Corrupt ${inputs[lastIdx].label} trade_receivables by +₹${(X / 100).toLocaleString('en-IN')} (a non-cash line). The cash tie-out must break by exactly that amount.`,
    corruptionPaise: X,
    cash_tie_status: cashTie.status,
    cash_tie_break_paise: Math.abs(cashTie.deltaPaise ?? 0),
    breaks_by_exactly_corruption: Math.abs(cashTie.deltaPaise ?? 0) === X,
  };

  const fixture = {
    _meta: {
      VERIFICATION: 'UNVERIFIED — PENDING CA SIGN-OFF. No value in this file is correct until a CA reviews it.',
      client: 'Acme Foods Pvt Ltd',
      nature: 'exercise / demo data (DECISIONS D-003), NOT a CA-authored golden fixture (Bible §10.6)',
      units: 'all *Paise amounts are integer PAISE — divide by 100 for ₹',
      engine: 'src/lib/engine (Bible §4)',
      generated_by: 'scripts/gen-fixture.mts',
      periods: results.map((r) => r.label),
    },
    integrity: {
      all_invariants_pass: periodsOut.every((p) => p.invariants.every((i) => i.status !== 'fail')),
      perturbation_test: perturbation,
    },
    ca_validate: CA_VALIDATE,
    periods: periodsOut,
  };

  const outDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');
  mkdirSync(outDir, { recursive: true });
  const outPath = resolve(outDir, 'PROPOSED-golden.json');
  writeFileSync(outPath, JSON.stringify(fixture, null, 2) + '\n');

  // Console summary
  console.log('PROPOSED-golden.json written →', outPath);
  for (const pOut of periodsOut) {
    console.log(`\n${pOut.label}  (UNVERIFIED)`);
    for (const inv of pOut.invariants) console.log(`  [${inv.status.toUpperCase()}] ${inv.label}: ${inv.detail}`);
  }
  console.log(`\nPERTURBATION (real data): corrupt ${inputs[lastIdx].label} AR by +₹${(X / 100).toLocaleString('en-IN')}`);
  console.log(`  cash tie-out → ${cashTie.status.toUpperCase()}, breaks by ₹${(Math.abs(cashTie.deltaPaise ?? 0) / 100).toLocaleString('en-IN')} ` +
    (perturbation.breaks_by_exactly_corruption ? '✓ exactly the corruption' : '✗ NOT exact'));
  console.log(`\nall invariants pass (clean): ${fixture.integrity.all_invariants_pass}`);
  console.log('REMINDER: every number is UNVERIFIED until CA sign-off.');
} finally {
  await db.end();
}
