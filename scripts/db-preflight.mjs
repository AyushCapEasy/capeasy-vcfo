// scripts/db-preflight.mjs — M0.5 DB pre-flight gate for project `capeasy-vcfo`.
//
// Reads .env.local, REFUSES to proceed on placeholder/missing secrets, refuses any
// Supabase project ref other than capeasy-vcfo, and otherwise attempts a REAL Postgres
// connection via `pg` (`select version()`).
//
// NEVER falls back to SQLite or any local store — a fake DB can't test RLS, which is the
// entire point of this gate (Build Plan M0.5 / §3).
//
// Exit codes: 0 connected · 1 connect failed · 2 blocked (missing/placeholder creds)
//             3 pg driver not installed · 4 wrong project ref (guardrail trip)

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const REF = 'rsaztdwxrzgyxkvxrqrt'; // the ONE authorized project (Build Plan §2/§3)
const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, '..', '.env.local');

function parseEnv(text) {
  const out = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

let env;
try {
  env = parseEnv(readFileSync(envPath, 'utf8'));
} catch {
  console.error('M0.5 DB PRE-FLIGHT: BLOCKED — .env.local not found at ' + envPath);
  console.error('  Action: copy .env.example -> .env.local and fill real capeasy-vcfo credentials.');
  process.exit(2);
}

const required = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'DATABASE_URL',
];
const missing = required.filter((k) => !env[k]);
const placeholder = required.filter((k) => /REPLACE_/.test(env[k] || ''));

// Hard guardrail: never operate against any other project.
for (const [k, v] of [['NEXT_PUBLIC_SUPABASE_URL', env.NEXT_PUBLIC_SUPABASE_URL], ['DATABASE_URL', env.DATABASE_URL]]) {
  if (v && !/REPLACE_/.test(v) && !v.includes(REF)) {
    console.error(`M0.5 DB PRE-FLIGHT: BLOCKED — ${k} points to a project other than ${REF}.`);
    console.error('  Refusing (Build Plan §3 hard key guardrail). Operate on exactly one project.');
    process.exit(4);
  }
}

if (missing.length || placeholder.length) {
  console.error('M0.5 DB PRE-FLIGHT: BLOCKED — real credentials not provided.');
  if (missing.length) console.error('  Missing keys     : ' + missing.join(', '));
  if (placeholder.length) console.error('  Placeholder keys : ' + placeholder.join(', '));
  console.error('  Action: fill the REPLACE_* values in .env.local for project ' + REF + ', then re-run:');
  console.error('          node scripts/db-preflight.mjs');
  console.error('  Do NOT substitute SQLite/local — gate exists to test real RLS (Build Plan M0.5).');
  process.exit(2);
}

let pg;
try {
  pg = await import('pg');
} catch {
  console.error('M0.5: credentials look real, but the `pg` driver is not installed yet.');
  console.error('  Action: npm install pg  (then re-run). Connectivity NOT yet verified.');
  process.exit(3);
}

const { Client } = pg.default ?? pg;
const client = new Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
try {
  await client.connect();
  const r = await client.query('select version() as version, current_database() as db, now() as ts');
  console.log('M0.5 DB PRE-FLIGHT: CONNECTED to capeasy-vcfo (' + REF + ')');
  console.log('  database : ' + r.rows[0].db);
  console.log('  server   : ' + r.rows[0].version);
  console.log('  time     : ' + r.rows[0].ts);
  await client.end();
  process.exit(0);
} catch (e) {
  console.error('M0.5 DB PRE-FLIGHT: COULD NOT CONNECT');
  console.error('  ' + (e && e.message ? e.message : String(e)));
  console.error('  STOP per gate. Log to BLOCKERS.md. No SQLite/local fallback.');
  try { await client.end(); } catch {}
  process.exit(1);
}
