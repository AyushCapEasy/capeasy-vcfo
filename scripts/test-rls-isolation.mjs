// scripts/test-rls-isolation.mjs — D-014 launch-gate adversarial cross-tenant isolation proof against
// LIVE authenticated sessions (not a schema assertion). This is the HARD GATE: exit 0 ⇔ every client-data
// table isolates org A from org B, bidirectionally, through the real app data path (ANON key + RLS).
//
// SELF-CLEANING (single-project / prod-safe): this gate creates its OWN ephemeral probe orgs + analyst
// users + data (it does NOT depend on the demo seed and never touches Acme/real orgs), runs the checks,
// then TEARS DOWN everything it created in a finally block — pass OR fail — and verifies the org/user
// counts return to the pre-run baseline. So it can be run against the live production project anytime and
// leaves it exactly as clean as it found it (zero residual rows).
//
// Setup (service_role / direct DB — bypasses RLS): two ephemeral orgs A + B, two ephemeral analyst users
// each scoped to exactly ONE org, and at least one row in EVERY client-data table for BOTH orgs, plus an
// org-scoped audit row and a system login row (org_id NULL, detail.email) per analyst.
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
// Passwords + emails + org names are random per run and never printed. Run: npm run test:rls
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

// --- Self-cleaning harness: create EPHEMERAL probe orgs/users, run the checks, then sweep them away. ----
// audit_log is hard append-only (a trigger blocks UPDATE/DELETE for ALL roles), and an org can't be deleted
// while audit rows reference it (ON DELETE SET NULL fires the blocked UPDATE). So administrative teardown
// briefly disables that guard (owner-only), removes the probe artifacts by name pattern, then re-enables it.
// The sweep is pattern-based (not just this run's ids), so a prior crashed run also leaves no residue.
const RUN = tag();
const ORG_PREFIX = 'RLS-PROBE-';   // ephemeral org legal_name prefix
const USER_PREFIX = 'rls-probe-';  // ephemeral analyst email prefix
const orgCount = async () => Number((await db.query(`select count(*)::int n from public.orgs`)).rows[0].n);
const userCount = async () => ((await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })).data?.users ?? []).length;

// Run fn with the audit_log append-only guard temporarily disabled (owner-only), ALWAYS restoring it.
async function withAuditMutable(fn) {
  await db.query(`alter table public.audit_log disable trigger audit_log_no_update`);
  await db.query(`alter table public.audit_log disable trigger audit_log_no_delete`);
  try { return await fn(); }
  finally {
    await db.query(`alter table public.audit_log enable trigger audit_log_no_update`);
    await db.query(`alter table public.audit_log enable trigger audit_log_no_delete`);
  }
}

// Remove ALL probe artifacts (this run + any prior crashed run); returns counts swept.
async function sweepProbes() {
  const orgIds = (await db.query(`select id from public.orgs where legal_name ~* 'rls.?probe'`)).rows.map((r) => r.id);
  const probeUsers = ((await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })).data?.users ?? []).filter((u) => (u.email || '').startsWith(USER_PREFIX));
  await withAuditMutable(async () => {
    for (const oid of orgIds) {
      await db.query(`delete from public.audit_log where org_id=$1`, [oid]);
      await db.query(`delete from public.orgs where id=$1`, [oid]); // cascades periods/TB/schedules/staging/mappings/org_members
    }
    if (probeUsers.length) await db.query(`delete from public.audit_log where actor_id = any($1)`, [probeUsers.map((u) => u.id)]);
  });
  for (const u of probeUsers) await admin.auth.admin.deleteUser(u.id); // cascades profiles
  return { orgs: orgIds.length, users: probeUsers.length };
}

async function makeAnalyst(slug) {
  const email = `${USER_PREFIX}${slug}-${RUN}@capeasy.in`; // unique per run; swept in teardown
  const u = await ensureUser(email);
  u.email = email;
  return u;
}

async function makeOrgWithData(name, analyst, specs) {
  const org = (await db.query(
    `insert into public.orgs (legal_name, entity_type, state, gst_scheme, has_employees)
     values ($1,'pvt_ltd','Maharashtra','monthly',true) returning id`, [name]
  )).rows[0].id;
  await db.query(`insert into public.org_members (org_id, user_id, role) values ($1,$2,'analyst')`, [org, analyst.id]);
  const periodId = (await db.query(
    `insert into public.periods (org_id, tax_year, period_month, label, status) values ($1,'TY2099-00','2099-01-01','probe','draft') returning id`, [org]
  )).rows[0].id;
  await db.query(
    `insert into public.trial_balance_lines (period_id, org_id, source_account_code, source_account_name, debit_amount, credit_amount) values
     ($1,$2,'1000','Cash',10000000,0), ($1,$2,'3000','Share Capital',0,10000000)`, [periodId, org]
  );
  await ensureOrgData(org, periodId, specs, analyst);
  return { id: org, periodId };
}

// Clear any leftover probe artifacts from a prior crashed run, THEN snapshot the true baseline.
const swept0 = await sweepProbes();
if (swept0.orgs || swept0.users) console.log(`(pre-clean: swept ${swept0.orgs} stale probe org(s) + ${swept0.users} stale probe user(s) from a prior run)`);
const baseOrgs = await orgCount();
const baseUsers = await userCount();

try {
  // --- Setup: two EPHEMERAL orgs + analysts + a full data set in every client-data table -----
  const catId = (await db.query(`select id from public.account_categories limit 1`)).rows[0].id;
  const specs = orgTableSpecs(catId);
  const analystA = await makeAnalyst('a');
  const analystB = await makeAnalyst('b');
  const a = await makeOrgWithData(`${ORG_PREFIX}A-${RUN}`, analystA, specs);
  const b = await makeOrgWithData(`${ORG_PREFIX}B-${RUN}`, analystB, specs);

  const orgA = { name: 'Probe A', id: a.id, periodId: a.periodId, userId: analystA.id, email: analystA.email, ids: await collectIds(a.id, specs), specs };
  const orgB = { name: 'Probe B', id: b.id, periodId: b.periodId, userId: analystB.id, email: analystB.email, ids: await collectIds(b.id, specs), specs };

  // --- Test (live sessions, ANON key, RLS-enforced), bidirectional ---------
  console.log(`Cross-tenant isolation — live authenticated sessions (ANON key, RLS) across ALL client-data tables  [project ${ref}, run ${RUN}]`);
  await probeAll('analyst A', analystA.email, analystA.password, orgA, orgB);
  await probeAll('analyst B', analystB.email, analystB.password, orgB, orgA);

  console.log(`\nRESULT: ${failures === 0 ? 'PASS ✓ — tenant isolation holds across every table, bidirectionally' : `FAIL ✗ — ${failures} isolation check(s) leaked`}`);
  process.exitCode = failures === 0 ? 0 : 1;
} finally {
  // --- Teardown: sweep every probe artifact (pass OR fail), then prove the baseline is restored. --------
  try {
    const swept = await sweepProbes();
    const endOrgs = await orgCount();
    const endUsers = await userCount();
    console.log(`\nTEARDOWN: swept ${swept.orgs} probe org(s) + ${swept.users} probe user(s) + their data/audit rows.`);
    console.log(`  orgs        ${baseOrgs} → ${endOrgs}   ${endOrgs === baseOrgs ? '✓ baseline restored (zero residue)' : '✗ RESIDUE LEFT'}`);
    console.log(`  auth users  ${baseUsers} → ${endUsers}   ${endUsers === baseUsers ? '✓ baseline restored (zero residue)' : '✗ RESIDUE LEFT'}`);
    if (endOrgs !== baseOrgs || endUsers !== baseUsers) process.exitCode = 1;
  } catch (e) {
    console.error('TEARDOWN ERROR — manual cleanup may be needed: ' + (e?.message || String(e)));
    process.exitCode = 1;
  } finally {
    await db.end();
  }
}
