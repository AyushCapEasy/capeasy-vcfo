// scripts/clean-prod.mjs — prepare the single shared project for PRODUCTION by removing the DEMO/SEED orgs
// and all their dependent data, leaving the schema + reference taxonomy (account_categories) + migrations
// intact. Tenant isolation for real clients is enforced by RLS (proven by `npm run test:rls`).
//
//   node scripts/clean-prod.mjs                  DRY-RUN — report inventory + exact delete list, delete NOTHING
//   node scripts/clean-prod.mjs --execute        delete the demo orgs + their dependent data (after approval)
//   node scripts/clean-prod.mjs --execute --purge-test-users   also remove the test analyst auth users
//
// REVERSIBLE: the seed scripts still exist — `npm run db:seed` re-creates Acme, `npm run test:rls` re-creates
// Globex + the two analysts, `npm run db:seed-user` re-creates a login. Cleaning does NOT lose demo/testing
// ability; a demo org can be re-seeded on demand, isolated (by RLS) from any real client org.
import { loadEnv } from './_env.mjs';

const env = loadEnv(); // the single shared project (.env.local)
const EXECUTE = process.argv.includes('--execute');
const PURGE_USERS = process.argv.includes('--purge-test-users');

// Known demo/seed artifacts (created by db:seed and test:rls). Anything NOT listed here is left ALONE and
// flagged for human review — clean-prod NEVER auto-deletes an unrecognised org or user.
const DEMO_ORG_NAMES = ['Acme Foods Pvt Ltd', 'Globex Trading Pvt Ltd'];
const TEST_USER_EMAILS = ['analyst.a@capeasy.in', 'analyst.b@capeasy.in'];

const ORG_TABLES = [
  'periods', 'trial_balance_lines', 'account_mappings',
  'schedule_ar_aging', 'schedule_ap_aging', 'schedule_cash_balances', 'schedule_headcount',
  'schedule_revenue_detail', 'schedule_capex', 'schedule_debt',
  'tb_upload_staging', 'org_members', 'audit_log',
];

const { createClient } = await import('@supabase/supabase-js');
const { default: pg } = await import('pg');
const admin = env.SUPABASE_SERVICE_ROLE_KEY && !/REPLACE_/.test(env.SUPABASE_SERVICE_ROLE_KEY)
  ? createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
  : null;

const db = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await db.connect();

const n = async (sql, params = []) => Number((await db.query(sql, params)).rows[0].n);

try {
  console.log(`\n=== DATABASE INVENTORY — project ${env.SUPABASE_PROJECT_REF} ${EXECUTE ? '(EXECUTE MODE)' : '(DRY-RUN — nothing will be deleted)'} ===\n`);

  // ---- Orgs + per-org dependent-row counts -------------------------------
  const orgs = (await db.query(`select id, legal_name, entity_type, state, created_at from public.orgs order by created_at`)).rows;
  console.log(`ORGS (${orgs.length}):`);
  const orgCounts = new Map();
  for (const o of orgs) {
    const counts = {};
    for (const t of ORG_TABLES) counts[t] = await n(`select count(*)::int n from public.${t} where org_id=$1`, [o.id]);
    orgCounts.set(o.id, counts);
    const tag = DEMO_ORG_NAMES.includes(o.legal_name) ? 'DEMO/SEED → DELETE' : 'OTHER → REVIEW (kept)';
    const summary = ORG_TABLES.map((t) => `${t.replace('schedule_', 'sch_')}=${counts[t]}`).join('  ');
    console.log(`  • ${o.legal_name}  [${o.id}]  ${tag}`);
    console.log(`      ${summary}`);
  }

  // ---- Reference + system + auth (KEPT, reported for visibility) ---------
  const catCount = await n(`select count(*)::int n from public.account_categories`);
  const sysAudit = await n(`select count(*)::int n from public.audit_log where org_id is null`);
  console.log(`\nREFERENCE (KEEP): account_categories = ${catCount} rows (the canonical taxonomy — never deleted)`);
  console.log(`SYSTEM audit rows (org_id IS NULL, e.g. logins): ${sysAudit}`);

  let users = [];
  if (admin) {
    const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    users = data?.users ?? [];
    console.log(`\nAUTH USERS (${users.length}):`);
    for (const u of users) {
      const isTest = TEST_USER_EMAILS.includes((u.email || '').toLowerCase());
      console.log(`  • ${u.email}  [${u.id}]  ${isTest ? 'TEST analyst' + (PURGE_USERS ? ' → DELETE' : ' → kept (use --purge-test-users to remove)') : 'kept'}`);
    }
  } else {
    console.log('\nAUTH USERS: (service_role not available — cannot list users)');
  }

  // ---- Delete plan -------------------------------------------------------
  const demoOrgs = orgs.filter((o) => DEMO_ORG_NAMES.includes(o.legal_name));
  const otherOrgs = orgs.filter((o) => !DEMO_ORG_NAMES.includes(o.legal_name));
  const testUsers = users.filter((u) => TEST_USER_EMAILS.includes((u.email || '').toLowerCase()));

  console.log('\n=== DELETE PLAN ===');
  if (!demoOrgs.length) console.log('  (no demo/seed orgs present — nothing to delete)');
  for (const o of demoOrgs) {
    const c = orgCounts.get(o.id);
    const dependents = ORG_TABLES.reduce((s, t) => s + c[t], 0);
    console.log(`  DELETE org "${o.legal_name}" [${o.id}] + ${dependents} dependent rows (periods/TB/schedules/mappings/staging/org_members cascade; ${c.audit_log} audit rows deleted explicitly).`);
  }
  if (PURGE_USERS && testUsers.length) console.log(`  DELETE ${testUsers.length} test analyst auth user(s) + their profiles/memberships/audit rows: ${testUsers.map((u) => u.email).join(', ')}.`);
  console.log('  KEEP: schema + migrations, account_categories taxonomy, all OTHER orgs, all non-test auth users.');
  if (otherOrgs.length) console.log(`  ⚠️  ${otherOrgs.length} non-demo org(s) present and will be KEPT — review them before go-live: ${otherOrgs.map((o) => o.legal_name).join(', ')}.`);

  if (!EXECUTE) {
    console.log('\nDRY-RUN — nothing was deleted. Re-run with --execute (after approval) to perform the deletions above.');
    process.exitCode = 0;
  } else {
    // ---- Execute (transactional for the public-schema deletions) ---------
    console.log('\nExecuting deletions...');
    await db.query('begin');
    for (const o of demoOrgs) {
      // audit_log.org_id is ON DELETE SET NULL — delete its rows explicitly BEFORE removing the org.
      await db.query(`delete from public.audit_log where org_id=$1`, [o.id]);
      await db.query(`delete from public.orgs where id=$1`, [o.id]); // cascades periods/TB/schedules/staging/mappings/org_members
      console.log(`  ✓ deleted org "${o.legal_name}" and its dependent data`);
    }
    await db.query('commit');

    if (PURGE_USERS && admin) {
      for (const u of testUsers) {
        // audit_log.actor_id has no ON DELETE rule → clear those rows first, then delete the user (cascades profile/memberships).
        await db.query(`delete from public.audit_log where actor_id=$1`, [u.id]);
        const { error } = await admin.auth.admin.deleteUser(u.id);
        console.log(`  ${error ? '✗ failed to delete' : '✓ deleted'} test user ${u.email}${error ? ' — ' + error.message : ''}`);
      }
    }

    const remainingOrgs = await n(`select count(*)::int n from public.orgs`);
    console.log(`\nDONE. Orgs remaining: ${remainingOrgs}. account_categories preserved: ${await n(`select count(*)::int n from public.account_categories`)} rows.`);
    process.exitCode = 0;
  }
} finally {
  await db.end();
}
