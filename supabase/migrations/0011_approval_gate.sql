-- 0011_approval_gate.sql — vCFO MIS Engine · self-serve approval gate
-- A self-serve org starts pending_approval and sees ZERO data until an admin (ayush@) flips it to
-- 'active'. Enforced in RLS (defense-in-depth alongside the app's /pending redirect): every org-scoped
-- DATA policy now requires ACTIVE membership, while orgs_select stays plain membership so a pending user
-- can still read their OWN org row (name + status) to render the pending screen — and nothing else.
--
-- Idempotent + transactional (run by scripts/db-migrate.mjs, once, tracked by checksum). No data
-- destroyed. Existing orgs are grandfathered ACTIVE (they predate the gate); new self-serve inserts
-- default to pending_approval and cannot set/raise their own status (column privilege, below).

-- --- 1. orgs.status -------------------------------------------------------
alter table public.orgs
  add column if not exists status text not null default 'pending_approval'
  check (status in ('pending_approval', 'active'));

-- Grandfather every org that already exists (the gate is new; all current orgs were already in use).
-- Runs once with this migration: on first apply every existing row is on the just-added default, so this
-- flips them all to active. New signups created AFTER this migration keep the pending_approval default.
update public.orgs set status = 'active' where status = 'pending_approval';

create index if not exists orgs_status_pending_idx on public.orgs(status) where status = 'pending_approval';

-- --- 2. No self-serve approval: authenticated cannot SET status at all -----
-- Postgres column privileges (independent of RLS): an authenticated INSERT may not specify `status`
-- (so the pending_approval default always applies — a crafted insert can't create an active org), and
-- an authenticated UPDATE may not touch `status` (no self-approval). Approval runs via service_role
-- (scripts/approve-org.mts), which is not subject to these grants.
revoke insert (status), update (status) on public.orgs from authenticated;

-- --- 3. Active-membership helper (SECURITY DEFINER, search_path pinned) ----
create or replace function public.is_active_org_member(p_org uuid)
returns boolean language sql stable security definer
set search_path = public, pg_catalog as $$
  select exists (
    select 1
    from public.org_members m
    join public.orgs o on o.id = m.org_id
    where m.org_id = p_org and m.user_id = auth.uid() and o.status = 'active'
  );
$$;

-- --- 4. Re-gate every org-scoped DATA policy on ACTIVE membership ---------
-- orgs_select and org_members_* stay plain membership (a pending user reads their own org row +
-- membership, so the app can render the pending screen); all client DATA is locked until active.

drop policy if exists account_mappings_rw on public.account_mappings;
create policy account_mappings_rw on public.account_mappings
  for all to authenticated
  using (public.is_active_org_member(org_id)) with check (public.is_active_org_member(org_id));

drop policy if exists periods_rw on public.periods;
create policy periods_rw on public.periods
  for all to authenticated
  using (public.is_active_org_member(org_id)) with check (public.is_active_org_member(org_id));

drop policy if exists tb_lines_rw on public.trial_balance_lines;
create policy tb_lines_rw on public.trial_balance_lines
  for all to authenticated
  using (public.is_active_org_member(org_id)) with check (public.is_active_org_member(org_id));

drop policy if exists tb_upload_staging_rw on public.tb_upload_staging;
create policy tb_upload_staging_rw on public.tb_upload_staging
  for all to authenticated
  using (public.is_active_org_member(org_id)) with check (public.is_active_org_member(org_id));

-- Schedule tables (same set as 0004).
do $$
declare t text;
begin
  foreach t in array array[
    'schedule_ar_aging', 'schedule_ap_aging', 'schedule_cash_balances',
    'schedule_headcount', 'schedule_revenue_detail', 'schedule_capex', 'schedule_debt'
  ] loop
    execute format('drop policy if exists %I on public.%I', t || '_rw', t);
    execute format('create policy %I on public.%I for all to authenticated
                    using (public.is_active_org_member(org_id)) with check (public.is_active_org_member(org_id))',
                   t || '_rw', t);
  end loop;
end $$;

-- audit_log SELECT: org rows readable only for ACTIVE orgs; system rows stay scoped to their actor
-- (preserves the GAP-2 hardening from 0010). INSERT policy is unchanged (0005, plain membership) so a
-- pending org still records its own create/login events.
drop policy if exists audit_log_select on public.audit_log;
create policy audit_log_select on public.audit_log
  for select to authenticated
  using (
    (org_id is not null and public.is_active_org_member(org_id))
    or (org_id is null and actor_id = (select auth.uid()))
  );
