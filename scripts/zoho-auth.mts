// scripts/zoho-auth.mts — exchange a Zoho Self-Client GRANT CODE (short-lived) for a durable refresh
// token, discover the Books organization, and write ZOHO_REFRESH_TOKEN + ZOHO_ORG_ID into the
// gitignored .env.local. SECRETS ARE NEVER PRINTED. Reads ZOHO_CLIENT_ID/SECRET/DC from .env.local.
//   Usage: npx tsx scripts/zoho-auth.mts <grant_code> [orgIndex]
import { readFileSync, writeFileSync } from 'node:fs';
import { parseEnv, ENV_PATH } from './_env.mjs';
import { readZohoConfig } from '../src/lib/zoho/config';
import { exchangeGrantCode } from '../src/lib/zoho/auth';
import { listOrganizations } from '../src/lib/zoho/client';

const code = process.argv[2];
if (!code) {
  console.error('Usage: npx tsx scripts/zoho-auth.mts <grant_code> [orgIndex]');
  process.exit(1);
}

const raw = readFileSync(ENV_PATH, 'utf8');
const cfg = readZohoConfig(parseEnv(raw));

const { refreshToken, accessToken } = await exchangeGrantCode(cfg, code);
console.log('✅ Grant code exchanged — refresh token obtained (not printed).');

const orgs = await listOrganizations({ ...cfg, refreshToken }, accessToken);
if (!orgs.length) {
  console.error('❌ No Zoho Books organizations visible to this token. Check ZOHO_DC and the granted scopes.');
  process.exit(1);
}
console.log('Organizations visible to this token:');
orgs.forEach((o, i) => console.log(`  [${i}] ${o.name} — org ${o.organization_id}${o.currency_code ? ` (${o.currency_code})` : ''}`));
const idx = Number(process.argv[3] ?? 0);
const org = orgs[idx] ?? orgs[0];
console.log(`→ selecting [${orgs.indexOf(org)}] ${org.name} (org ${org.organization_id})`);

function upsert(text: string, key: string, value: string): string {
  const line = `${key}=${value}`;
  const re = new RegExp(`^${key}=.*$`, 'm');
  return re.test(text) ? text.replace(re, line) : `${text.replace(/\s*$/, '')}\n${line}\n`;
}
let next = upsert(raw, 'ZOHO_REFRESH_TOKEN', refreshToken);
next = upsert(next, 'ZOHO_ORG_ID', org.organization_id);
writeFileSync(ENV_PATH, next);
console.log('✅ Wrote ZOHO_REFRESH_TOKEN + ZOHO_ORG_ID to .env.local (gitignored; token value not shown).');
console.log('Next: npx tsx scripts/zoho-pull.mts');
