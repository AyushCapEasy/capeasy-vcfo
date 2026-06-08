-- 0005_audit_log.sql — vCFO MIS Engine · M1 schema (5/6)
-- Append-only audit log (Build Plan §6 P0 foundation; Bible §10.3 access logs).
-- Inserts only — UPDATE/DELETE blocked by trigger for ALL roles (true append-only).

create table if not exists public.audit_log (
  id           uuid not null default gen_random_uuid() primary key,
  org_id       uuid references public.orgs(id) on delete set null,  -- null = system event
  actor_id     uuid references auth.users(id),
  action       text not null,                  -- e.g. 'period.lock', 'tb.upload'
  target_table text,
  target_id    uuid,
  detail       jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);
create index if not exists audit_log_org_idx     on public.audit_log(org_id, created_at desc);
create index if not exists audit_log_actor_idx   on public.audit_log(actor_id, created_at desc);

-- Hard append-only: no UPDATE/DELETE, even for the table owner / service_role.
drop trigger if exists audit_log_no_update on public.audit_log;
create trigger audit_log_no_update before update on public.audit_log
  for each row execute function public.prevent_mutation();
drop trigger if exists audit_log_no_delete on public.audit_log;
create trigger audit_log_no_delete before delete on public.audit_log
  for each row execute function public.prevent_mutation();

grant select, insert on public.audit_log to authenticated;  -- no update/delete grant

alter table public.audit_log enable row level security;
-- Read: system events (org_id null) or events for an org you belong to.
drop policy if exists audit_log_select on public.audit_log;
create policy audit_log_select on public.audit_log
  for select to authenticated
  using (org_id is null or public.is_org_member(org_id));
-- Write: append events for your own orgs, stamped as yourself.
drop policy if exists audit_log_insert on public.audit_log;
create policy audit_log_insert on public.audit_log
  for insert to authenticated
  with check (
    (org_id is null or public.is_org_member(org_id))
    and (actor_id = (select auth.uid()) or actor_id is null)
  );
