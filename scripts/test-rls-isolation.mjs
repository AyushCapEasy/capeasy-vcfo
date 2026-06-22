// scripts/test-rls-isolation.mjs — D-014 launch-gate adversarial cross-tenant isolation proof against
// LIVE authenticated sessions (not a schema assertion). This is the HARD GATE: exit 0 ⇔ every client-data
// table isolates org A from org B, bidirectionally, through the real app data path (ANON key + RLS).
//
// Setup (service_role / direct DB — bypasses RLS): a second client org "Globex" (B), two analyst users
// each scoped to exactly ONE client (analyst.a → Acme A, analyst.b → Globex B), and at least one row in
// EVERY client-data table for BOTH orgs (the seed doesn't populate schedule_capex / tb_upload_staging, so
// we add them) plus an org-scoped audit row and a system login row (org_id NULL, detail.email) per analyst.
//
// Test (ANON key + real sign-in = the app data path): for every table, each analyst
//   • reads OWN-org rows            → must be > 0   (positive control: the probe CAN see data when allowed)
//   • reads OTHER-org rows by org_id → must be 0    (isolation)
//   • reads the OTHER org's row by id → must be 0   (isolation — no leak via a known id)
//   • inserts into the OTHER org      → must be DENIED
//   • updates the OTHER org's row     → must touch 0 rows (append-only audit_log is exempt from update)
// Plus the two regression catches: profiles returns ONLY self (GAP-1); audit_log exposes NO other
// tenant's rows and NO other user's email, incl. system login rows (GAP-2).
//
// Passwords are random per run and never printed. Idempotent. Run: npm run test:rls
import { randomBytes } from 'node:crypto';
import { loadEnv } from './_env.mjs';

// Runs against DEMO by default, or PROD with `--prod` (loads .env.production.local). The expected project
// ref comes from the loaded+validated env, so this launch gate can be proven on PROD (gate B3) too.
const env = loadEnv();
const ref = env.SUPABASE_PROJECT_REF;
if (env.NEXT_PUBLIC_SUPABASE_URL !== 'https://' + ref + '.supabase.co') throw new Error('BLOCKED — NEXT_PUBLIC_SUPABASE_URL does not match the loaded project ref ' + ref + '.');
if (!env.SUPABASE_SERVICE_ROLE_KEY || /REPLACE_/.test(env.SUPABASE_SERVICE_ROLE_KEY)) throw new Error('BLOCKED — service_role missing.');

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const { createClient } = await import('@supabase/supabase-js');
const { default: pg } = await import('pg');

const admin = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const db = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await db.connect();

const pw = () => 'Cap' + randomBytes(9).toString('base64url') + '!9';
const tag = () => randomBytes(4).toString('hex');

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

// --- Org-scoped table specs: how to build a minimal row (mk) + a benign update patch. -----------------
// periodScoped tables get org_id auto-set from the period by a trigger; we pass it explicitly anyway.
function orgTableSpecs(catId) {
  return [
    { t: 'periods', periodScoped: false, mk: (o) => ({ org_id: o, tax_year: 'TY2099-00', period_month: '2099-01-01', label: 'probe', status: 'draft' }), patch: { label: 'hacked' } },
    { t: 'trial_balance_lines', periodScoped: true, mk: (o, p) => ({ period_id: p, org_id: o, source_account_code: 'PROBE-' + tag(), debit_amount: 0, credit_amount: 0 }), patch: { source_account_name: 'hacked' } },
    { t: 'account_mappings', periodScoped: false, mk: (o) => ({ org_id: o, source_account_code: 'PROBE-' + tag(), source_account_name: 'probe', category_id: catId }), patch: { source_account_name: 'hacked' } },
    { t: 'schedule_ar_aging', periodScoped: true, mk: (o, p) => ({ period_id: p, org_id: o, customer_name: 'probe', current_0_30: 1 }), patch: { customer_name: 'hacked' } },
    { t: 'schedule_ap_aging', periodScoped: true, mk: (o, p) => ({ period_id: p, org_id: o, vendor_name: 'probe', current_0_30: 1 }), patch: { vendor_name: 'hacked' } },
    { t: 'schedule_cash_balances', periodScoped: true, mk: (o, p) => ({ period_id: p, org_id: o, bank_name: 'probe', balance: 1 }), patch: { bank_name: 'hacked' } },
    { t: 'schedule_headcount', periodScoped: true, mk: (o, p) => ({ period_id: p, org_id: o, department: 'probe', headcount: 1 }), patch: { department: 'hacked' } },
    { t: 'schedule_revenue_detail', periodScoped: true, mk: (o, p) => ({ period_id: p, org_id: o, segment: 'probe', amount: 1, is_recurring: false }), patch: { segment: 'hacked' } },
    { t: 'schedule_capex', periodScoped: true, mk: (o, p) => ({ period_id: p, org_id: o, description: 'probe', amount: 1 }), patch: { description: 'hacked' } },
    { t: 'schedule_debt', periodScoped: true, mk: (o, p) => ({ period_id: p, org_id: o, lender: 'probe', kind: 'short_term', principal_outstanding: 1 }), patch: { lender: 'hacked' } },
    { t: 'tb_upload_staging', periodScoped: true, mk: (o, p) => ({ period_id: p, org_id: o, filename: 'probe.csv', raw_grid: [['x']] }), patch: { filename: 'hacked.csv' } },
  ];
}

// Ensure org has >=1 row in every org-scoped table (service_role / owner — RLS bypassed). Idempotent. */
async function ensureOrgData(org, periodId, specs, analyst) {
  for (const s of specs) {
    if (s.t === 'periods' || s.t === 'trial_balance_lines') continue; // both orgs already have these
    const has = await db.query(`select 1 from public.${s.t} where org_id=$1 limit 1`, [org]);
    if (has.rows.length) continue;
    const row = s.mk(org, periodId);
    const cols = Object.keys(row);
    const vals = cols.map((_, i) => `$${i + 1}`);
    const params = cols.map((c) => (Array.isArray(row[c]) ? JSON.stringify(row[c]) : row[c]));
    await db.query(`insert into public.${s.t} (${cols.join(',')}) values (${vals.join(',')})`, params);
  }
  // audit_log: an org-scoped row (positive control) + a system login row carrying the email (GAP-2 surface).
  await db.query(
    `insert into public.audit_log (org_id, actor_id, action, detail)
     select $1,$2,'test.seed.org','{}'::jsonb
     where not exists (select 1 from public.audit_log where org_id=$1 and action='test.seed.org')`,
    [org, analyst.id]
  );
  await db.query(
    `insert into public.audit_log (org_id, actor_id, action, detail)
     select null,$1,'auth.login', jsonb_build_object('email',$2::text)
     where not exists (select 1 from public.audit_log where org_id is null and actor_id=$1 and action='auth.login')`,
    [analyst.id, analyst.email]
  );
}

// One known row id per table for an org (service_role) — the "read other org's row by id" probe target.
async function collectIds(org, specs) {
  const byTable = {};
  for (const s of specs) byTable[s.t] = (await db.query(`select id from public.${s.t} where org_id=$1 limit 1`, [org])).rows[0]?.id ?? null;
  byTable.audit_org = (await db.query(`select id from public.audit_log where org_id=$1 limit 1`, [org])).rows[0]?.id ?? null;
  return byTable;
}

const OK = (b) => (b ? '✓' : '✗ LEAK');
let failures = 0;
const note = (cond, label) => { if (!cond) { failures++; console.log(`     ↳ FAIL: ${label}`); } return cond; };

// Generic org-scoped probe for one table, one direction.
async function probeOrgScoped(c, spec, ownOrg, otherOrg, otherPeriodId, otherId) {
  const own = await c.from(spec.t).select('id').eq('org_id', ownOrg);
  const byOrg = await c.from(spec.t).select('id').eq('org_id', otherOrg);
  const byId = otherId ? await c.from(spec.t).select('id').eq('id', otherId) : { data: [] };
  const ins = await c.from(spec.t).insert(spec.mk(otherOrg, otherPeriodId));
  const upd = otherId ? await c.from(spec.t).update(spec.patch).eq('id', otherId).select('id') : { data: [] };
  return {
    ownVisible: (own.data?.length ?? 0) > 0,
    isoOrg: (byOrg.data?.length ?? 0) === 0,
    isoId: (byId.data?.length ?? 0) === 0,
    insDenied: !!ins.error,
    updDenied: (upd.data?.length ?? 0) === 0,
  };
}

async function probeAll(label, email, password, own, other) {
  const c = createClient(url, anonKey, { auth: { persistSession: false } });
  const si = await c.auth.signInWithPassword({ email, password });
  if (si.error) throw new Error(`${label} sign-in failed: ${si.error.message}`);
  console.log(`\n${label}  (own=${own.name}, other=${other.name})`);

  // Org-scoped tables (generic probe).
  for (const s of own.specs) {
    const r = await probeOrgScoped(c, s, own.id, other.id, other.periodId, other.ids[s.t]);
    const append = s.t === 'tb_upload_staging' ? '  ← raw uploaded file' : '';
    note(r.ownVisible, `${s.t} own`); note(r.isoOrg, `${s.t} org`); note(r.isoId, `${s.t} id`);
    note(r.insDenied, `${s.t} insert`); note(r.updDenied, `${s.t} update`);
    console.log(`  ${s.t.padEnd(24)} own:${r.ownVisible ? '✓' : '✗ (no data!)'}  byOrg:${OK(r.isoOrg)}  byId:${OK(r.isoId)}  insert:${r.insDenied ? '✓ denied' : '✗ LEAK'}  update:${r.updDenied ? '✓ blocked' : '✗ LEAK'}${append}`);
  }

  // profiles — GAP-1: must return ONLY self.
  const pAll = await c.from('profiles').select('id,email');
  const pOther = await c.from('profiles').select('id').eq('id', other.userId);
  const pIns = await c.from('profiles').insert({ id: other.userId, email: 'evil-' + tag() + '@x.com' });
  const pUpd = await c.from('profiles').update({ full_name: 'hacked' }).eq('id', other.userId).select('id');
  const onlySelf = (pAll.data?.length ?? 0) === 1 && pAll.data[0].id === own.userId;
  const noOtherEmailInProfiles = !(pAll.data ?? []).some((r) => r.email === other.email);
  note((pAll.data?.length ?? 0) > 0, 'profiles own'); note(onlySelf, 'profiles only-self');
  note((pOther.data?.length ?? 0) === 0, 'profiles other-id'); note(noOtherEmailInProfiles, 'profiles no-other-email');
  note(!!pIns.error, 'profiles insert'); note((pUpd.data?.length ?? 0) === 0, 'profiles update');
  console.log(`  ${'profiles'.padEnd(24)} own:${(pAll.data?.length ?? 0) > 0 ? '✓' : '✗'}  ONLY-self:${onlySelf ? '✓' : '✗ LEAK'}  byId:${OK((pOther.data?.length ?? 0) === 0)}  no-other-email:${OK(noOtherEmailInProfiles)}  insert:${!!pIns.error ? '✓ denied' : '✗ LEAK'}  update:${(pUpd.data?.length ?? 0) === 0 ? '✓ blocked' : '✗ LEAK'}  [GAP-1]`);

  // org_members — must see only own membership; cannot read/join/insert into the other org.
  const mAll = await c.from('org_members').select('org_id,user_id,role');
  const mByOrg = await c.from('org_members').select('user_id').eq('org_id', other.id);
  const mByUser = await c.from('org_members').select('org_id').eq('user_id', other.userId);
  const mIns = await c.from('org_members').insert({ org_id: other.id, user_id: own.userId, role: 'analyst' });
  const mUpd = await c.from('org_members').update({ role: 'admin' }).eq('org_id', other.id).select('user_id');
  const onlyOwnMembers = (mAll.data ?? []).every((r) => r.user_id === own.userId);
  note((mAll.data?.length ?? 0) > 0, 'org_members own'); note(onlyOwnMembers, 'org_members only-own');
  note((mByOrg.data?.length ?? 0) === 0, 'org_members other-org'); note((mByUser.data?.length ?? 0) === 0, 'org_members other-user');
  note(!!mIns.error, 'org_members insert'); note((mUpd.data?.length ?? 0) === 0, 'org_members update');
  console.log(`  ${'org_members'.padEnd(24)} own:${(mAll.data?.length ?? 0) > 0 ? '✓' : '✗'}  only-own:${onlyOwnMembers ? '✓' : '✗ LEAK'}  byOrg:${OK((mByOrg.data?.length ?? 0) === 0)}  byUser:${OK((mByUser.data?.length ?? 0) === 0)}  insert:${!!mIns.error ? '✓ denied' : '✗ LEAK'}  update:${(mUpd.data?.length ?? 0) === 0 ? '✓ blocked' : '✗ LEAK'}`);

  // audit_log — GAP-2: no other tenant's rows, no other user's email, incl. system login rows. Append-only → no update probe.
  const aOwn = await c.from('audit_log').select('id').eq('org_id', own.id);
  const aByOrg = await c.from('audit_log').select('id').eq('org_id', other.id);
  const aById = other.ids.audit_org ? await c.from('audit_log').select('id').eq('id', other.ids.audit_org) : { data: [] };
  const aByActor = await c.from('audit_log').select('id').eq('actor_id', other.userId); // other's system login rows
  const aVisible = await c.from('audit_log').select('detail');
  const aIns = await c.from('audit_log').insert({ org_id: other.id, action: 'evil-' + tag() });
  const noOtherEmail = !(aVisible.data ?? []).some((r) => r?.detail?.email === other.email);
  note((aOwn.data?.length ?? 0) > 0, 'audit own'); note((aByOrg.data?.length ?? 0) === 0, 'audit other-org');
  note((aById.data?.length ?? 0) === 0, 'audit other-id'); note((aByActor.data?.length ?? 0) === 0, 'audit other-actor');
  note(noOtherEmail, 'audit no-other-email'); note(!!aIns.error, 'audit insert');
  console.log(`  ${'audit_log'.padEnd(24)} own:${(aOwn.data?.length ?? 0) > 0 ? '✓' : '✗'}  byOrg:${OK((aByOrg.data?.length ?? 0) === 0)}  byId:${OK((aById.data?.length ?? 0) === 0)}  byActor:${OK((aByActor.data?.length ?? 0) === 0)}  no-other-email:${OK(noOtherEmail)}  insert:${!!aIns.error ? '✓ denied' : '✗ LEAK'}  [GAP-2]`);

  await c.auth.signOut();
}

try {
  // --- Setup (service_role / owner) ----------------------------------------
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

  // Globex needs a period + a tiny balanced TB so there is "B data" to (fail to) read.
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
  const analystA = await ensureUser('analyst.a@capeasy.in'); analystA.email = 'analyst.a@capeasy.in';
  const analystB = await ensureUser('analyst.b@capeasy.in'); analystB.email = 'analyst.b@capeasy.in';
  await db.query(`delete from public.org_members where user_id = any($1)`, [[analystA.id, analystB.id]]);
  await db.query(`insert into public.org_members (org_id, user_id, role) values ($1,$2,'analyst')`, [A, analystA.id]);
  await db.query(`insert into public.org_members (org_id, user_id, role) values ($1,$2,'analyst')`, [B, analystB.id]);

  // Ensure every client-data table has data for BOTH orgs (capex/staging/audit the seed lacks).
  const catId = (await db.query(`select id from public.account_categories limit 1`)).rows[0].id;
  const specs = orgTableSpecs(catId);
  await ensureOrgData(A, aPeriod.id, specs, analystA);
  await ensureOrgData(B, bPeriod.id, specs, analystB);

  const idsA = await collectIds(A, specs);
  const idsB = await collectIds(B, specs);

  const orgA = { name: 'Acme (A)', id: A, periodId: aPeriod.id, userId: analystA.id, email: analystA.email, ids: idsA, specs };
  const orgB = { name: 'Globex (B)', id: B, periodId: bPeriod.id, userId: analystB.id, email: analystB.email, ids: idsB, specs };

  // --- Test (live sessions, ANON key, RLS-enforced), bidirectional ---------
  console.log('Cross-tenant isolation — live authenticated sessions (ANON key, RLS) across ALL client-data tables');
  await probeAll('analyst.a (scoped to A)', analystA.email, analystA.password, orgA, orgB);
  await probeAll('analyst.b (scoped to B)', analystB.email, analystB.password, orgB, orgA);

  console.log(`\nRESULT: ${failures === 0 ? 'PASS ✓ — tenant isolation holds across every table, bidirectionally' : `FAIL ✗ — ${failures} isolation check(s) leaked`}`);
  process.exitCode = failures === 0 ? 0 : 1;
} finally {
  await db.end();
}
