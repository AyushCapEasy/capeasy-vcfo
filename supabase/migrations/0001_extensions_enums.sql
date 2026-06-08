-- 0001_extensions_enums.sql — vCFO MIS Engine · M1 schema (1/6)
-- Enums + shared trigger helpers. Applied via DATABASE_URL (Build Plan §5; no supabase link).
-- Money is ALWAYS integer paise (bigint) downstream — never float (Build Plan §5).

-- gen_random_uuid() is built into PostgreSQL 13+ (server is 17.x) — no extension needed.

-- --- Domain enums ---------------------------------------------------------
do $$ begin
  create type entity_type as enum
    ('pvt_ltd', 'llp', 'proprietorship', 'partnership', 'opc', 'other');
exception when duplicate_object then null; end $$;

do $$ begin
  create type org_role as enum ('admin', 'analyst');
exception when duplicate_object then null; end $$;

do $$ begin
  create type period_status as enum ('draft', 'reviewed', 'locked');
exception when duplicate_object then null; end $$;

-- Canonical Account Category taxonomy groups (Bible §3.2).
do $$ begin
  create type account_group as enum (
    'income',
    'direct_costs',
    'operating_expenses',
    'below_the_line',
    'current_assets',
    'non_current_assets',
    'current_liabilities',
    'non_current_liabilities',
    'equity'
  );
exception when duplicate_object then null; end $$;

-- Which statement a category lands on, and its normal (sign-sane) balance side.
do $$ begin
  create type statement_kind as enum ('pl', 'bs');
exception when duplicate_object then null; end $$;

do $$ begin
  create type normal_balance as enum ('debit', 'credit');
exception when duplicate_object then null; end $$;

-- --- Shared trigger helpers ----------------------------------------------
-- Generic updated_at stamper.
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- Append-only guard: block UPDATE/DELETE entirely (used by the audit log).
create or replace function public.prevent_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'table %.% is append-only; % is not permitted',
    tg_table_schema, tg_table_name, tg_op;
end $$;
