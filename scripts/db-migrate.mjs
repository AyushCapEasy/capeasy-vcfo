// scripts/db-migrate.mjs — apply plain-SQL migrations to capeasy-vcfo via DATABASE_URL.
// No `supabase link`, no account token (Build Plan §5). Each file runs once, in a
// transaction, tracked in public.schema_migrations. Re-runnable (idempotent).
//
//   node scripts/db-migrate.mjs           apply pending migrations
//   node scripts/db-migrate.mjs --status  show applied vs pending, don't change anything
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, basename } from 'node:path';
import { createHash } from 'node:crypto';
import { loadEnv, REF } from './_env.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIG_DIR = resolve(__dirname, '..', 'supabase', 'migrations');
const STATUS_ONLY = process.argv.includes('--status');

const env = loadEnv();
const { default: pg } = await import('pg');
const client = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();

try {
  await client.query(`
    create table if not exists public.schema_migrations (
      filename   text primary key,
      checksum   text not null,
      applied_at timestamptz not null default now()
    );
  `);

  const files = readdirSync(MIG_DIR).filter((f) => f.endsWith('.sql')).sort();
  const applied = new Map(
    (await client.query('select filename, checksum from public.schema_migrations')).rows.map((r) => [r.filename, r.checksum])
  );

  let pending = 0, ran = 0;
  for (const file of files) {
    const sql = readFileSync(resolve(MIG_DIR, file), 'utf8');
    const checksum = createHash('sha256').update(sql).digest('hex').slice(0, 16);
    const name = basename(file);

    if (applied.has(name)) {
      if (applied.get(name) !== checksum) {
        console.warn(`  ! ${name} already applied but checksum changed (was ${applied.get(name)}, now ${checksum}) — NOT re-running.`);
      } else {
        console.log(`  = ${name} (applied)`);
      }
      continue;
    }

    pending++;
    if (STATUS_ONLY) { console.log(`  + ${name} (pending)`); continue; }

    process.stdout.write(`  → ${name} ... `);
    try {
      await client.query('begin');
      await client.query(sql);
      await client.query('insert into public.schema_migrations (filename, checksum) values ($1, $2)', [name, checksum]);
      await client.query('commit');
      console.log('ok');
      ran++;
    } catch (e) {
      await client.query('rollback');
      console.log('FAILED');
      console.error('    ' + (e?.message || String(e)));
      process.exitCode = 1;
      break;
    }
  }

  console.log(`\nMigrations @ ${REF}: ${files.length} total, ${STATUS_ONLY ? pending + ' pending' : ran + ' applied this run'}.`);
} finally {
  await client.end();
}
