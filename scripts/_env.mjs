// scripts/_env.mjs — shared env loader + project guardrail (DECISIONS D-007/D-014, REVISED for one project).
//
// SINGLE-PROJECT model: there is ONE Supabase project (ref rsaztdwxrzgyxkvxrqrt) and it is now the
// PRODUCTION project — real client data lives here ALONGSIDE re-seedable demo orgs (Acme/Globex), with
// tenant isolation enforced by RLS and proven by `npm run test:rls` (self-cleaning). All tooling loads
// .env.local and refuses any other project, so a stray credential can never point a script at the wrong
// database. (No second prod project — financial constraint; the earlier --prod / .env.production.local /
// allowlist machinery was removed. Isolation is now guaranteed by RLS, not by project separation.)
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

export const PROJECT_REF = 'rsaztdwxrzgyxkvxrqrt';
// Back-compat aliases (older scripts import these names): all refer to the one project.
export const REF = PROJECT_REF;
export const DEV_DEMO_REF = PROJECT_REF;
export const DEMO_REF = PROJECT_REF;

const __dirname = dirname(fileURLToPath(import.meta.url));
export const ENV_PATH = resolve(__dirname, '..', '.env.local');

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

/** Load + validate .env.local for the one project. Refuses any DATABASE_URL / ref that isn't this project. */
export function loadEnv() {
  let env;
  try { env = parseEnv(readFileSync(ENV_PATH, 'utf8')); }
  catch { throw new Error('BLOCKED — .env.local not found at ' + ENV_PATH); }

  const declared = env.SUPABASE_PROJECT_REF || PROJECT_REF;
  if (declared !== PROJECT_REF) throw new Error('BLOCKED — SUPABASE_PROJECT_REF (' + declared + ') != ' + PROJECT_REF + '. Refusing.');
  env.SUPABASE_PROJECT_REF = PROJECT_REF; // normalize so callers can always read the resolved ref

  const url = env.DATABASE_URL || '';
  if (!url || /REPLACE_/.test(url)) throw new Error('BLOCKED — DATABASE_URL missing or still a placeholder.');
  let u;
  try { u = new URL(url); } catch { throw new Error('BLOCKED — DATABASE_URL is not a valid URL.'); }
  if (!u.hostname.includes(PROJECT_REF)) {
    throw new Error(`BLOCKED — DATABASE_URL host (${u.hostname}) is not for project ${PROJECT_REF}. Refusing.`);
  }
  const port = u.port || '5432';
  if (port === '6543') throw new Error('BLOCKED — port 6543 is the transaction pooler; use direct 5432 (rule 7).');
  if (port !== '5432') throw new Error('BLOCKED — port ' + port + ' unexpected; use direct 5432.');

  console.warn(`⚠️  PRODUCTION PROJECT (capeasy-vcfo · ${PROJECT_REF}) — the LIVE project. Real client data lives here alongside re-seedable demo orgs; tenant isolation is enforced by RLS. Handle with care.`);
  return env;
}
