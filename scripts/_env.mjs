// scripts/_env.mjs — shared env loader + hard data-isolation guardrail (Build Plan §3, DECISIONS D-007/D-014).
//
// TWO-VALUE ALLOWLIST (D-014 prod separation):
//   • DEMO target (default): reads .env.local, accepts ONLY the demo ref rsaztdwxrzgyxkvxrqrt.
//   • PROD target (explicit `--prod` flag): reads a SEPARATE gitignored .env.production.local, accepts ONLY
//     a ref that is NOT the demo ref. Prod tooling can never run without the explicit flag + the prod file.
// The two paths are firewalled: the demo path refuses any non-demo ref, and the prod path refuses the demo
// ref — so "demo tooling can never accidentally hit prod" (and vice-versa) is enforced, not just intended.
// Standing up the prod project = creating .env.production.local; nothing here ever invents prod creds.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

export const DEMO_REF = 'rsaztdwxrzgyxkvxrqrt';
// Back-compat: existing demo-only scripts (seed-user, db-migrate, gen-types, …) import REF as "the demo ref".
export const REF = DEMO_REF;
export const DEV_DEMO_REF = DEMO_REF;

const __dirname = dirname(fileURLToPath(import.meta.url));
export const ENV_PATH = resolve(__dirname, '..', '.env.local'); // demo env file (back-compat; used by zoho scripts)
const PROD_ENV_PATH = resolve(__dirname, '..', '.env.production.local'); // prod env file — gitignored, operator-created

export function parseEnv(text) {
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

// Resolve which database a run targets: explicit opt > `--prod` flag > demo default.
export function resolveTarget(opts = {}) {
  if (opts.target) return opts.target;
  return process.argv.includes('--prod') ? 'prod' : 'demo';
}

function validateConnection(env, expectedRef, label) {
  const url = env.DATABASE_URL || '';
  if (!url || /REPLACE_/.test(url)) {
    throw new Error(`BLOCKED — ${label} DATABASE_URL missing or still a placeholder.`);
  }
  let u;
  try { u = new URL(url); } catch { throw new Error(`BLOCKED — ${label} DATABASE_URL is not a valid URL.`); }
  if (!u.hostname.includes(expectedRef)) {
    throw new Error(`BLOCKED — ${label} DATABASE_URL host (${u.hostname}) is not for project ${expectedRef}. Refusing.`);
  }
  const port = u.port || '5432';
  if (port === '6543') throw new Error('BLOCKED — port 6543 is the transaction pooler; use direct 5432 (rule 7).');
  if (port !== '5432') throw new Error('BLOCKED — port ' + port + ' unexpected; use direct 5432.');
}

function loadDemo() {
  let env;
  try { env = parseEnv(readFileSync(ENV_PATH, 'utf8')); }
  catch { throw new Error('BLOCKED — .env.local not found at ' + ENV_PATH); }
  const declared = env.SUPABASE_PROJECT_REF || DEMO_REF;
  if (declared !== DEMO_REF) {
    throw new Error('BLOCKED — SUPABASE_PROJECT_REF (' + declared + ') != demo ref ' + DEMO_REF + ' in .env.local. Refusing (demo path).');
  }
  env.SUPABASE_PROJECT_REF = DEMO_REF; // normalize so callers can always read the resolved ref
  validateConnection(env, DEMO_REF, 'DEV/DEMO');
  console.warn(`⚠️  DEV/DEMO DATABASE (capeasy-vcfo · ${DEMO_REF}) — fake demo data only. NEVER load real client trial balances here (DECISIONS.md D-007).`);
  return env;
}

function loadProd() {
  let env;
  try { env = parseEnv(readFileSync(PROD_ENV_PATH, 'utf8')); }
  catch { throw new Error('BLOCKED — .env.production.local not found at ' + PROD_ENV_PATH + ' (create it after standing up the prod Supabase project — STOP/AYUSH gate B2).'); }
  const ref = env.SUPABASE_PROJECT_REF || '';
  if (!ref || /REPLACE_/.test(ref)) throw new Error('BLOCKED — SUPABASE_PROJECT_REF missing/placeholder in .env.production.local.');
  if (ref === DEMO_REF) {
    throw new Error('BLOCKED — .env.production.local points at the DEMO ref ' + DEMO_REF + '. Prod tooling must NEVER target demo. Refusing.');
  }
  validateConnection(env, ref, 'PRODUCTION');
  console.warn(`⚠️  PRODUCTION DATABASE (capeasy-vcfo · ${ref}) — REAL client data. Migrations only; NEVER run db:seed here (D-014).`);
  return env;
}

/** Load + validate env for the resolved target. Default (no flag) = demo, preserving prior behaviour.
 *  Pass { target: 'prod' } or run with `--prod` to load the separate prod env file. */
export function loadEnv(opts = {}) {
  return resolveTarget(opts) === 'prod' ? loadProd() : loadDemo();
}
