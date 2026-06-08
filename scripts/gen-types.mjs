// scripts/gen-types.mjs — generate database.types.ts from the LIVE capeasy-vcfo schema
// by direct introspection over DATABASE_URL (Build Plan §5: no `supabase link`, no account
// token). The Supabase CLI's `gen types --db-url` requires Docker (postgres-meta); this
// script needs neither Docker nor a token — it reuses the exact guardrailed connection the
// migrator/seeder use, so the emitted types are always in sync with the real schema.
//
// Output shape matches @supabase/supabase-js: `export type Database = { public: { Tables,
// Views, Functions, Enums, CompositeTypes } }` plus the standard Tables<>/Insert/Update helpers.
//
//   node scripts/gen-types.mjs > src/lib/database.types.ts
import { loadEnv } from './_env.mjs';

const env = loadEnv();
const { default: pg } = await import('pg');
const client = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();

// --- Postgres type -> TS type ------------------------------------------------
function tsType(col, enumNames) {
  if (col.data_type === 'USER-DEFINED' && enumNames.has(col.udt_name)) {
    return `Database["public"]["Enums"]["${col.udt_name}"]`;
  }
  switch (col.data_type) {
    case 'uuid': case 'text': case 'character varying': case 'character':
    case 'timestamp with time zone': case 'timestamp without time zone':
    case 'date': case 'time without time zone': case 'inet':
      return 'string';
    case 'bigint': case 'integer': case 'smallint': case 'numeric':
    case 'real': case 'double precision':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'json': case 'jsonb':
      return 'Json';
    default:
      return 'unknown';
  }
}

try {
  // Enums (public schema).
  const enumRows = (await client.query(`
    select t.typname as enum_name, e.enumlabel as label
    from pg_type t
    join pg_enum e on e.enumtypid = t.oid
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
    order by t.typname, e.enumsortorder
  `)).rows;
  const enums = new Map();
  for (const r of enumRows) {
    if (!enums.has(r.enum_name)) enums.set(r.enum_name, []);
    enums.get(r.enum_name).push(r.label);
  }
  const enumNames = new Set(enums.keys());

  // Columns of every public BASE TABLE.
  const cols = (await client.query(`
    select c.table_name, c.column_name, c.is_nullable, c.data_type, c.udt_name, c.column_default
    from information_schema.columns c
    join information_schema.tables t
      on t.table_schema = c.table_schema and t.table_name = c.table_name
    where c.table_schema = 'public' and t.table_type = 'BASE TABLE'
    order by c.table_name, c.ordinal_position
  `)).rows;

  const tables = new Map();
  for (const c of cols) {
    if (!tables.has(c.table_name)) tables.set(c.table_name, []);
    tables.get(c.table_name).push(c);
  }

  const ind = (n) => '  '.repeat(n);
  const out = [];
  out.push('// database.types.ts — GENERATED from the live capeasy-vcfo schema.');
  out.push('// Source of truth: Postgres @ db.rsaztdwxrzgyxkvxrqrt (ref rsaztdwxrzgyxkvxrqrt).');
  out.push('// Regenerate after every migration:  node scripts/gen-types.mjs > src/lib/database.types.ts');
  out.push('// (Direct introspection over DATABASE_URL — no supabase link / token, Build Plan §5.)');
  out.push('// Do not edit by hand.');
  out.push('');
  out.push('export type Json =');
  out.push('  | string');
  out.push('  | number');
  out.push('  | boolean');
  out.push('  | null');
  out.push('  | { [key: string]: Json | undefined }');
  out.push('  | Json[]');
  out.push('');
  out.push('export type Database = {');
  out.push(ind(1) + 'public: {');
  out.push(ind(2) + 'Tables: {');

  for (const [table, columns] of [...tables].sort((a, b) => a[0].localeCompare(b[0]))) {
    out.push(ind(3) + `${table}: {`);
    // Row
    out.push(ind(4) + 'Row: {');
    for (const c of columns) {
      const t = tsType(c, enumNames);
      const nul = c.is_nullable === 'YES' ? ' | null' : '';
      out.push(ind(5) + `${c.column_name}: ${t}${nul}`);
    }
    out.push(ind(4) + '}');
    // Insert — optional if nullable or has a default; nullable adds | null.
    out.push(ind(4) + 'Insert: {');
    for (const c of columns) {
      const t = tsType(c, enumNames);
      const nullable = c.is_nullable === 'YES';
      const optional = nullable || c.column_default !== null;
      out.push(ind(5) + `${c.column_name}${optional ? '?' : ''}: ${t}${nullable ? ' | null' : ''}`);
    }
    out.push(ind(4) + '}');
    // Update — every column optional.
    out.push(ind(4) + 'Update: {');
    for (const c of columns) {
      const t = tsType(c, enumNames);
      const nullable = c.is_nullable === 'YES';
      out.push(ind(5) + `${c.column_name}?: ${t}${nullable ? ' | null' : ''}`);
    }
    out.push(ind(4) + '}');
    out.push(ind(4) + 'Relationships: []');
    out.push(ind(3) + '}');
  }

  out.push(ind(2) + '}');
  out.push(ind(2) + 'Views: { [_ in never]: never }');
  out.push(ind(2) + 'Functions: { [_ in never]: never }');
  // Enums
  out.push(ind(2) + 'Enums: {');
  for (const [name, labels] of [...enums].sort((a, b) => a[0].localeCompare(b[0]))) {
    out.push(ind(3) + `${name}: ${labels.map((l) => JSON.stringify(l)).join(' | ')}`);
  }
  out.push(ind(2) + '}');
  out.push(ind(2) + 'CompositeTypes: { [_ in never]: never }');
  out.push(ind(1) + '}');
  out.push('}');
  out.push('');
  // --- Standard Supabase convenience helpers (subset) ------------------------
  out.push('type PublicSchema = Database["public"]');
  out.push('');
  out.push('export type Tables<T extends keyof PublicSchema["Tables"]> =');
  out.push('  PublicSchema["Tables"][T]["Row"]');
  out.push('export type TablesInsert<T extends keyof PublicSchema["Tables"]> =');
  out.push('  PublicSchema["Tables"][T]["Insert"]');
  out.push('export type TablesUpdate<T extends keyof PublicSchema["Tables"]> =');
  out.push('  PublicSchema["Tables"][T]["Update"]');
  out.push('export type Enums<T extends keyof PublicSchema["Enums"]> =');
  out.push('  PublicSchema["Enums"][T]');
  out.push('');

  process.stdout.write(out.join('\n'));
} finally {
  await client.end();
}
