// scripts/seed-user.mjs — provision an internal user (admin-provisioned model; no public signup,
// DECISIONS D-004). Renamed/generalized from seed-admin.mjs (2026-06-10, D-011): provisions ANY
// role (admin|analyst, the only two roles — migration 0001) to a specific org or all orgs.
//
// Roles: 'admin' or 'analyst' ONLY. There is no "client" role — "clients" are the orgs/tenants
// (Acme, Globex). For a demo/showing account use --role analyst.
//
// The password is set via a HIDDEN interactive prompt (default) OR generated with --generate
// (strong random, no prompt). Either way it is recorded ONLY in the gitignored
// .admin-credentials.local (D-009) — never stdout, .env.local, chat, or a commit.
//
// Guardrail (Build Plan §3): operates ONLY on project rsaztdwxrzgyxkvxrqrt (dev/demo, D-007) —
// both DATABASE_URL (via _env) and NEXT_PUBLIC_SUPABASE_URL are checked against the one ref.
//
// Usage:
//   node scripts/seed-user.mjs <email> --role <admin|analyst> --org <"Legal Name"|all> [--name "Full Name"] [--generate]
//   - default     : HIDDEN prompt for the password (needs a TTY — run in your own terminal)
//   - --generate  : strong random password, no prompt (recorded in .admin-credentials.local)
// Examples:
//   node scripts/seed-user.mjs demo@capeasy.in  --role analyst --org "Acme Foods Pvt Ltd"
//   node scripts/seed-user.mjs demo@capeasy.in  --role analyst --org "Acme Foods Pvt Ltd" --generate
//   node scripts/seed-user.mjs admin@capeasy.in --role admin   --org all
// Idempotent: re-running an existing email updates its password + role/membership.
import { randomBytes } from 'node:crypto';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import readline from 'node:readline';
import { loadEnv, REF } from './_env.mjs';

const CRED_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '..', '.admin-credentials.local');
const USAGE = 'Usage: node scripts/seed-user.mjs <email> --role <admin|analyst> --org <"Legal Name"|all> [--name "Full Name"] [--generate]';

// --- arg parsing ----------------------------------------------------------
const argv = process.argv.slice(2);
let email, role = 'analyst', org, name, generate = false;
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--role') role = (argv[++i] || '').toLowerCase();
  else if (a === '--org') org = argv[++i];
  else if (a === '--name') name = argv[++i];
  else if (a === '--generate') generate = true;
  else if (!a.startsWith('--') && !email) email = a.toLowerCase();
  else { console.error('Unexpected arg: ' + a + '\n' + USAGE); process.exit(2); }
}
if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { console.error('Missing/invalid <email>.\n' + USAGE); process.exit(2); }
if (role !== 'admin' && role !== 'analyst') { console.error(`--role must be admin or analyst (got "${role}"). No other roles exist.`); process.exit(2); }
if (!org) { console.error('--org is required: a client org legal_name (e.g. "Acme Foods Pvt Ltd") or "all".'); process.exit(2); }
if (!name) name = email.split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

const env = loadEnv();
const EXPECTED_URL = 'https://' + REF + '.supabase.co';
if (env.NEXT_PUBLIC_SUPABASE_URL !== EXPECTED_URL) throw new Error(`BLOCKED — NEXT_PUBLIC_SUPABASE_URL (${env.NEXT_PUBLIC_SUPABASE_URL}) != ${EXPECTED_URL}. Refusing.`);
if (!env.SUPABASE_SERVICE_ROLE_KEY || /REPLACE_/.test(env.SUPABASE_SERVICE_ROLE_KEY)) throw new Error('BLOCKED — SUPABASE_SERVICE_ROLE_KEY missing/placeholder.');

// --- hidden password prompt (no echo; never printed) ----------------------
function promptHidden(query) {
  return new Promise((res) => {
    process.stdout.write(query);
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = () => {}; // suppress echo of typed characters
    rl.question('', (ans) => { rl.close(); process.stdout.write('\n'); res(ans); });
  });
}
let pw1;
if (generate) {
  // Strong random password. base64url is [A-Za-z0-9_-]; the Cap- prefix / -7! suffix guarantee
  // upper+lower+digit+symbol. Recorded ONLY in .admin-credentials.local — its value is never echoed.
  pw1 = 'Cap-' + randomBytes(18).toString('base64url') + '-7!';
  console.log('  (--generate) strong random password created — recorded only in .admin-credentials.local, not shown.');
} else {
  if (!process.stdin.isTTY) {
    console.error('BLOCKED — type the password interactively, or pass --generate. Run this in your terminal (not piped/CI).');
    process.exit(2);
  }
  pw1 = await promptHidden(`Set password for ${email} (${role}) — hidden: `);
  const pw2 = await promptHidden('Confirm password — hidden: ');
  if (pw1 !== pw2) { console.error('Passwords do not match. Aborted — nothing changed.'); process.exit(1); }
  if (pw1.length < 10) { console.error('Password too short (min 10 chars). Aborted — nothing changed.'); process.exit(1); }
}

// --- create (or find + reset) the auth user -------------------------------
const { createClient } = await import('@supabase/supabase-js');
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
let userId;
const created = await admin.auth.admin.createUser({
  email, password: pw1, email_confirm: true, user_metadata: { full_name: name },
});
if (created.error) {
  if (/registered|already|exists/i.test(created.error.message)) {
    const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (error) throw error;
    const u = data.users.find((x) => (x.email || '').toLowerCase() === email);
    if (!u) throw created.error;
    userId = u.id;
    const upd = await admin.auth.admin.updateUserById(userId, { password: pw1 });
    if (upd.error) throw upd.error;
    console.log('  = existing user found — password updated');
  } else { throw created.error; }
} else { userId = created.data.user.id; console.log('  + auth user created'); }

// --- profile (0006 trigger handles new users; upsert defends) + membership -
const { default: pg } = await import('pg');
const client = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
let targets;
try {
  await client.query(
    `insert into public.profiles (id, email, full_name) values ($1,$2,$3)
     on conflict (id) do update set email = excluded.email, full_name = excluded.full_name`,
    [userId, email, name]
  );
  const allOrgs = (await client.query('select id, legal_name from public.orgs order by legal_name')).rows;
  if (org.toLowerCase() === 'all') targets = allOrgs;
  else {
    targets = allOrgs.filter((o) => o.legal_name.toLowerCase() === org.toLowerCase());
    if (!targets.length) {
      console.error(`BLOCKED — no org named "${org}". Available: ${allOrgs.map((o) => `"${o.legal_name}"`).join(', ') || '(none)'}`);
      process.exit(1);
    }
  }
  for (const o of targets) {
    await client.query(
      `insert into public.org_members (org_id, user_id, role) values ($1,$2,$3)
       on conflict (org_id, user_id) do update set role = excluded.role`,
      [o.id, userId, role]
    );
  }
  console.log(`  ✓ ${email} is ${role} of ${targets.length} org(s): ${targets.map((o) => o.legal_name).join(', ')}`);
} finally { await client.end(); }

// --- record credential ONLY in .admin-credentials.local (D-009); upsert per-email block -------
const HEADER = '# vCFO user credentials — LOCAL ONLY, gitignored (D-009). Set via scripts/seed-user.mjs.\n# Rotate any time by re-running the script. Never commit; never copy elsewhere.\n';
const esc = email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const begin = `# >>> ${email}`, end = `# <<< ${email}`;
const block =
  `${begin}  (${role} @ ${targets.map((o) => o.legal_name).join(', ')})\n` +
  `EMAIL=${email}\n` +
  `PASSWORD=${pw1}\n` +
  `${end}\n`;
let prev = existsSync(CRED_PATH) ? readFileSync(CRED_PATH, 'utf8') : HEADER;
if (!prev.includes('LOCAL ONLY, gitignored')) prev = HEADER + prev; // keep a header
prev = prev.replace(new RegExp(`# >>> ${esc}[\\s\\S]*?# <<< ${esc}\\n`, 'g'), ''); // drop old block for this email
writeFileSync(CRED_PATH, prev.replace(/\n{3,}/g, '\n\n').trimEnd() + '\n\n' + block, { mode: 0o600 });

console.log('\n  USER READY (admin-provisioned, no public signup — D-004).');
console.log('    email : ' + email + '    role : ' + role);
console.log('    password: recorded in .admin-credentials.local (gitignored) — never printed here.');
console.log('  Log in at /login (local dev or the SSO-walled deploy URL).');
