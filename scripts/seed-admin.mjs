// scripts/seed-admin.mjs — M2: bootstrap the FIRST admin (admin-provisioned model; no public
// signup). Creates the auth user via the Supabase Auth Admin API (service_role, server-side
// only), lets the 0006 trigger create the profile, and adds the admin as a member of the demo
// org so RLS lets them see it. Idempotent: re-running resets the temp password.
//
// Guardrail (Build Plan §3): operates ONLY on project rsaztdwxrzgyxkvxrqrt — both DATABASE_URL
// (via _env) and NEXT_PUBLIC_SUPABASE_URL are checked against the one authorized ref.
//
//   node scripts/seed-admin.mjs                 # defaults to ayush@capeasy.in
//   node scripts/seed-admin.mjs other@email     # override the admin email
import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { loadEnv, REF } from './_env.mjs';

// The bootstrap credential is written ONLY to this gitignored local file — never to stdout,
// so it can never leak into a terminal transcript, log, or commit.
const CRED_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '..', '.admin-credentials.local');

const env = loadEnv();
const EXPECTED_URL = 'https://' + REF + '.supabase.co';
if (env.NEXT_PUBLIC_SUPABASE_URL !== EXPECTED_URL) {
  throw new Error(`BLOCKED — NEXT_PUBLIC_SUPABASE_URL (${env.NEXT_PUBLIC_SUPABASE_URL}) != ${EXPECTED_URL}. Refusing.`);
}
if (!env.SUPABASE_SERVICE_ROLE_KEY || /REPLACE_/.test(env.SUPABASE_SERVICE_ROLE_KEY)) {
  throw new Error('BLOCKED — SUPABASE_SERVICE_ROLE_KEY missing/placeholder.');
}

const email = (process.argv[2] || 'ayush@capeasy.in').toLowerCase();
const fullName = 'Ayush';
// Strong temp password (disclosed once; change on first login).
const tempPassword = 'Cap' + randomBytes(9).toString('base64url') + '!2';

const { createClient } = await import('@supabase/supabase-js');
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// --- 1) Create (or find + reset) the auth user --------------------------------
let userId;
const created = await admin.auth.admin.createUser({
  email,
  password: tempPassword,
  email_confirm: true, // no real email in v1 (mocked); confirm immediately so login works
  user_metadata: { full_name: fullName },
});
if (created.error) {
  if (/registered|already|exists/i.test(created.error.message)) {
    const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (error) throw error;
    const u = data.users.find((x) => (x.email || '').toLowerCase() === email);
    if (!u) throw created.error;
    userId = u.id;
    const upd = await admin.auth.admin.updateUserById(userId, { password: tempPassword });
    if (upd.error) throw upd.error;
    console.log('  = existing auth user found — temp password reset');
  } else {
    throw created.error;
  }
} else {
  userId = created.data.user.id;
  console.log('  + auth user created');
}

// --- 2) Profile (trigger handles new users; upsert defends pre-trigger users) + org membership.
const { default: pg } = await import('pg');
const client = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  await client.query(
    `insert into public.profiles (id, email, full_name) values ($1,$2,$3)
     on conflict (id) do update set email = excluded.email, full_name = excluded.full_name`,
    [userId, email, fullName]
  );

  // Make the admin a member (role=admin) of every existing client org (the demo org today),
  // so RLS grants them visibility. In-app org creation auto-adds its creator as admin (0002).
  const orgs = (await client.query('select id, legal_name from public.orgs')).rows;
  for (const o of orgs) {
    await client.query(
      `insert into public.org_members (org_id, user_id, role) values ($1,$2,'admin')
       on conflict (org_id, user_id) do update set role = 'admin'`,
      [o.id, userId]
    );
  }
  console.log(`  ✓ admin ${email} is member(admin) of ${orgs.length} org(s): ${orgs.map((o) => o.legal_name).join(', ') || '(none)'}`);
} finally {
  await client.end();
}

// Write the credential to the gitignored local file ONLY (never stdout). 0o600 where supported.
writeFileSync(
  CRED_PATH,
  `# vCFO admin bootstrap credential — LOCAL ONLY, gitignored. Rotate after first login.\n` +
    `# Re-run \`npm run db:seed-admin\` any time to reset (overwrites this file).\n` +
    `ADMIN_EMAIL=${email}\n` +
    `ADMIN_TEMP_PASSWORD=${tempPassword}\n`,
  { mode: 0o600 }
);
console.log('\n  FIRST-ADMIN READY (admin-provisioned, no public signup).');
console.log('    email    : ' + email);
console.log('    password : written to .admin-credentials.local (gitignored) — open it locally.');
console.log('  The previous credential is now invalid. Rotate again any time by re-running this script.');
