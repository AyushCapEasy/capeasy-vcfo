// scripts/test-rls-isolation.mjs — M3 cross-tenant isolation proof against LIVE authenticated
// sessions (not a schema assertion). Setup (service_role): a second client org "Globex" (B), and
// two analyst users each scoped to exactly one client — analyst.a → Acme (A), analyst.b → Globex (B).
// Test (ANON key + real sign-in = the app data path): each analyst tries to read the OTHER client's
// periods/TB and must get nothing; reading their OWN client must work. Passwords are random per run
// and never printed. Idempotent.  Run:  npm run test:rls
import { randomBytes } from 'node:crypto';
import { loadEnv, REF } from './_env.mjs';

const env = loadEnv();
if (env.NEXT_PUBLIC_SUPABASE_URL !== 'https://' + REF + '.supabase.co') throw new Error('BLOCKED — wrong project URL.');
if (!env.SUPABASE_SERVICE_ROLE_KEY || /REPLACE_/.test(env.SUPABASE_SERVICE_ROLE_KEY)) throw new Error('BLOCKED — service_role missing.');

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const { createClient } = await import('@supabase/supabase-js');
const { default: pg } = await import('pg');

const admin = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const db = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await db.connect();

const pw = () => 'Cap' + randomBytes(9).toString('base64url') + '!9';

async function ensureUser(email) {
  const password = pw();
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: email } });
  if (created.error) {
    if (!/registered|already|exists/i.test(created.error.message)) throw created.error;
    const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const u = data.users.find((x) => (x.email || '').toLowerCase() === email);
    await admin.auth.admin.updateUserById(u.id, { password });
    return { id: u.id, password };
  }
  return { id: created.data.user.id, password };
}

try {
  // --- Setup ---------------------------------------------------------------
  // Client A = the seeded Acme org. Client B = Globex (create if missing).
  const acme = (await db.query(`select id from public.orgs where legal_name=$1`, ['Acme Foods Pvt Ltd'])).rows[0];
  if (!acme) throw new Error('Acme demo org missing — run `npm run db:seed` first.');
  const A = acme.id;

  let globex = (await db.query(`select id from public.orgs where legal_name=$1`, ['Globex Trading Pvt Ltd'])).rows[0];
  if (!globex) {
    globex = (await db.query(
      `insert into public.orgs (legal_name, entity_type, state, gst_scheme, has_employees)
       values ('Globex Trading Pvt Ltd','pvt_ltd','Karnataka','monthly',true) returning id`
    )).rows[0];
  }
  const B = globex.id;

  // Give Globex one period + a tiny balanced TB so there is "B data" to (fail to) read.
  let bPeriod = (await db.query(`select id from public.periods where org_id=$1 order by period_month limit 1`, [B])).rows[0];
  if (!bPeriod) {
    bPeriod = (await db.query(
      `insert into public.periods (org_id, tax_year, period_month, label, status) values ($1,'TY2026-27','2026-04-01','Apr 2026','draft') returning id`,
      [B]
    )).rows[0];
    await db.query(
      `insert into public.trial_balance_lines (period_id, org_id, source_account_code, source_account_name, debit_amount, credit_amount) values
       ($1,$2,'1000','Cash',10000000,0), ($1,$2,'3000','Share Capital',0,10000000)`,
      [bPeriod.id, B]
    );
  }
  const aPeriod = (await db.query(`select id from public.periods where org_id=$1 order by period_month limit 1`, [A])).rows[0];

  // Two analysts, each a member of exactly one client.
  const analystA = await ensureUser('analyst.a@capeasy.in');
  const analystB = await ensureUser('analyst.b@capeasy.in');
  // Reset memberships to the intended single org each (defensive against earlier runs).
  await db.query(`delete from public.org_members where user_id = any($1)`, [[analystA.id, analystB.id]]);
  await db.query(`insert into public.org_members (org_id, user_id, role) values ($1,$2,'analyst')`, [A, analystA.id]);
  await db.query(`insert into public.org_members (org_id, user_id, role) values ($1,$2,'analyst')`, [B, analystB.id]);

  // --- Test (live sessions, ANON key) --------------------------------------
  async function asUser(label, email, password, ownOrg, otherOrg, otherPeriodId) {
    const c = createClient(url, anonKey, { auth: { persistSession: false } });
    const si = await c.auth.signInWithPassword({ email, password });
    if (si.error) throw new Error(`${label} sign-in failed: ${si.error.message}`);

    const own = await c.from('periods').select('id').eq('org_id', ownOrg);
    const otherByOrg = await c.from('periods').select('id').eq('org_id', otherOrg);
    const otherById = await c.from('periods').select('id').eq('id', otherPeriodId);
    const otherTb = await c.from('trial_balance_lines').select('id').eq('period_id', otherPeriodId);
    const allOrgs = await c.from('orgs').select('legal_name');
    await c.auth.signOut();

    console.log(`\n${label}`);
    console.log(`  orgs visible            : ${(allOrgs.data ?? []).map((o) => o.legal_name).join(', ') || '(none)'}`);
    console.log(`  OWN client periods      : ${own.data?.length ?? 0}  ${(own.data?.length ?? 0) > 0 ? '✓ can read own' : '✗'}`);
    console.log(`  OTHER client periods    : ${otherByOrg.data?.length ?? 0}  ${(otherByOrg.data?.length ?? 0) === 0 ? '✓ blocked' : '✗ LEAK'}`);
    console.log(`  OTHER period by id       : ${otherById.data?.length ?? 0}  ${(otherById.data?.length ?? 0) === 0 ? '✓ blocked' : '✗ LEAK'}`);
    console.log(`  OTHER TB lines by period : ${otherTb.data?.length ?? 0}  ${(otherTb.data?.length ?? 0) === 0 ? '✓ blocked' : '✗ LEAK'}`);
    return (otherByOrg.data?.length ?? 0) === 0 && (otherById.data?.length ?? 0) === 0 && (otherTb.data?.length ?? 0) === 0 && (own.data?.length ?? 0) > 0;
  }

  console.log('Cross-tenant isolation — live authenticated sessions (ANON key, RLS-enforced)');
  console.log('  Client A = Acme Foods Pvt Ltd   Client B = Globex Trading Pvt Ltd');
  const okA = await asUser('analyst.a (scoped to A)', 'analyst.a@capeasy.in', analystA.password, A, B, bPeriod.id);
  const okB = await asUser('analyst.b (scoped to B)', 'analyst.b@capeasy.in', analystB.password, B, A, aPeriod.id);

  console.log(`\nRESULT: ${okA && okB ? 'PASS ✓ — tenant isolation holds bidirectionally against live sessions' : 'FAIL ✗ — a cross-tenant read leaked'}`);
  process.exitCode = okA && okB ? 0 : 1;
} finally {
  await db.end();
}
