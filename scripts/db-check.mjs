// scripts/db-check.mjs — read-only M1 verification: counts + identity checks
// against the live capeasy-vcfo DB. Does not mutate. (Build Plan §3 guardrail via _env.)
import { loadEnv } from './_env.mjs';

const env = loadEnv();
const { default: pg } = await import('pg');
const client = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  const tables = (await client.query(`
    select table_name from information_schema.tables
    where table_schema='public' and table_type='BASE TABLE' order by table_name
  `)).rows.map((r) => r.table_name);
  console.log('public tables (' + tables.length + '): ' + tables.join(', '));

  const rls = (await client.query(`
    select relname, relrowsecurity from pg_class c
    join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='r' and relrowsecurity=false
    order by relname
  `)).rows.map((r) => r.relname);
  console.log('tables WITHOUT row-level security: ' + (rls.length ? rls.join(', ') : '(none — all RLS-enabled)'));

  const cat = (await client.query('select count(*) n from public.account_categories')).rows[0].n;
  console.log('account_categories seeded: ' + cat);

  const org = (await client.query(`select id, legal_name from public.orgs where legal_name=$1`, ['Acme Foods Pvt Ltd'])).rows[0];
  if (!org) { console.log('DEMO ORG: not seeded yet'); process.exit(0); }
  console.log('demo org: ' + org.legal_name + ' (' + org.id + ')');

  const periods = (await client.query(
    `select id, label, period_month, prior_period_id, status from public.periods where org_id=$1 order by period_month`, [org.id]
  )).rows;
  console.log('periods (' + periods.length + '):');
  for (const p of periods) {
    const chained = p.prior_period_id ? '← chained' : '(first, no prior)';
    console.log('  ' + p.label + '  ' + p.status + '  ' + chained);
  }

  // Per-period TB balance check (Σdebit == Σcredit) straight from the DB.
  for (const p of periods) {
    const r = (await client.query(
      `select coalesce(sum(debit_amount),0) dr, coalesce(sum(credit_amount),0) cr, count(*) n
       from public.trial_balance_lines where period_id=$1`, [p.id]
    )).rows[0];
    const ok = r.dr === r.cr ? 'BALANCES' : 'OUT OF BALANCE';
    console.log('  TB ' + p.label + ': ' + r.n + ' lines, Σdr=' + r.dr + ' Σcr=' + r.cr + ' → ' + ok);
  }

  const counts = (await client.query(`
    select
      (select count(*) from public.account_mappings where org_id=$1) mappings,
      (select count(*) from public.trial_balance_lines where org_id=$1) tb_lines,
      (select count(*) from public.schedule_ar_aging where org_id=$1) ar,
      (select count(*) from public.schedule_ap_aging where org_id=$1) ap,
      (select count(*) from public.schedule_cash_balances where org_id=$1) cash,
      (select count(*) from public.schedule_revenue_detail where org_id=$1) rev,
      (select count(*) from public.schedule_debt where org_id=$1) debt,
      (select count(*) from public.schedule_headcount where org_id=$1) hc
  `, [org.id])).rows[0];
  console.log('counts: ' + JSON.stringify(counts));
} finally {
  await client.end();
}
