-- 0007_tb_upload_staging.sql — vCFO MIS Engine · M3 (intake confirmation)
-- Holds an uploaded TB's RAW grid between parse and commit, so NOTHING becomes intake data
-- (trial_balance_lines) until the analyst approves how the file was read (Bible §8.5 traceability).
-- One staging row per period. Org-scoped + RLS, org_id auto-set from the period.

create table if not exists public.tb_upload_staging (
  id              uuid not null default gen_random_uuid() primary key,
  period_id       uuid not null unique references public.periods(id) on delete cascade,
  org_id          uuid not null references public.orgs(id) on delete cascade,
  filename        text,
  raw_grid        jsonb not null default '[]'::jsonb,  -- string[][] as read from the file
  column_override jsonb,                                -- analyst role→column reassignment (nullable)
  created_at      timestamptz not null default now()
);
create index if not exists tb_upload_staging_org_idx on public.tb_upload_staging(org_id);

drop trigger if exists tb_upload_staging_set_org on public.tb_upload_staging;
create trigger tb_upload_staging_set_org before insert or update on public.tb_upload_staging
  for each row execute function public.set_org_from_period();

grant select, insert, update, delete on public.tb_upload_staging to authenticated;

alter table public.tb_upload_staging enable row level security;
drop policy if exists tb_upload_staging_rw on public.tb_upload_staging;
create policy tb_upload_staging_rw on public.tb_upload_staging
  for all to authenticated
  using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));
