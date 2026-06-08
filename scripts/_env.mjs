// scripts/_env.mjs — shared .env.local loader + hard guardrail (Build Plan §3).
// Only ever yields the connection string for project ref rsaztdwxrzgyxkvxrqrt and
// refuses anything else. Reused by db-migrate / seed / rls-test so the guardrail
// lives in exactly one place.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

export const REF = 'rsaztdwxrzgyxkvxrqrt';
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

export function loadEnv() {
  let env;
  try {
    env = parseEnv(readFileSync(ENV_PATH, 'utf8'));
  } catch {
    throw new Error('BLOCKED — .env.local not found at ' + ENV_PATH);
  }
  const url = env.DATABASE_URL || '';
  if (!url || /REPLACE_/.test(url)) {
    throw new Error('BLOCKED — DATABASE_URL missing or still a placeholder. Run M0.5 first.');
  }
  // Guardrail: operate on exactly one project (Build Plan §3, rules 2-3).
  let u;
  try { u = new URL(url); } catch { throw new Error('BLOCKED — DATABASE_URL is not a valid URL.'); }
  if (!u.hostname.includes(REF)) {
    throw new Error(`BLOCKED — DATABASE_URL host (${u.hostname}) is not for project ${REF}. Refusing.`);
  }
  if ((env.SUPABASE_PROJECT_REF || REF) !== REF) {
    throw new Error('BLOCKED — SUPABASE_PROJECT_REF != ' + REF + '. Refusing.');
  }
  const port = u.port || '5432';
  if (port === '6543') throw new Error('BLOCKED — port 6543 is the transaction pooler; use direct 5432 (rule 7).');
  if (port !== '5432') throw new Error('BLOCKED — port ' + port + ' unexpected; use direct 5432.');
  return env;
}
