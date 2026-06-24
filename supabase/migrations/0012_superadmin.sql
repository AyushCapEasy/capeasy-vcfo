-- 0012_superadmin.sql — superadmin allowlist + in-app /admin approval RPCs
-- A superadmin (ayush@capeasy.in) approves pending orgs from the deployed app — no service_role in the
-- browser. The cross-tenant admin reads/writes go through SECURITY DEFINER functions that each check
-- is_superadmin() internally, so normal RLS (tenant isolation, orgs_select = membership) is UNCHANGED —
-- a non-superadmin gets nothing from these functions and tenant data stays isolated (test:rls).
--
-- Idempotent + transactional (scripts/db-migrate.mjs). Superadmin status is stored in app_admins and is
-- INDEPENDENT of any org membership — removing an org never affects who is a superadmin.

-- --- Superadmin allowlist -------------------------------------------------
-- RLS on, NO policies + NO grant to authenticated => the app cannot read or write this table directly.
-- It is read only via is_superadmin() (SECURITY DEFINER) and managed via migration / service_role.
create table if not exists public.app_admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.app_admins enable row level security;
revoke all on public.app_admins from authenticated, anon;

-- THE superadmin: ayush@capeasy.in (seeded by email lookup; idempotent; no-op if the user doesn't exist).
insert into public.app_admins (user_id)
  select id from auth.users where lower(email) = 'ayush@capeasy.in'
  on conflict (user_id) do nothing;

-- --- is_superadmin() — the caller is a superadmin? (definer → bypasses app_admins RLS, no recursion) ---
create or replace function public.is_superadmin()
returns boolean language sql stable security definer
set search_path = public, pg_catalog as $$
  select exists (select 1 from public.app_admins a where a.user_id = auth.uid());
$$;
grant execute on function public.is_superadmin() to authenticated;

-- --- admin_list_pending_orgs() — every pending org + owner email, cross-tenant. SUPERADMIN ONLY -------
-- (definer bypasses RLS to read orgs + profiles; the WHERE is_superadmin() makes it return NOTHING to a
-- non-superadmin, so it can never be used to enumerate tenants.)
create or replace function public.admin_list_pending_orgs()
returns table (id uuid, legal_name text, entity_type text, state text, created_at timestamptz, owner_email text)
language sql stable security definer
set search_path = public, pg_catalog as $$
  select o.id, o.legal_name, o.entity_type::text, o.state, o.created_at, p.email
  from public.orgs o
  left join public.profiles p on p.id = o.created_by
  where public.is_superadmin() and o.status = 'pending_approval'
  order by o.created_at asc;
$$;
grant execute on function public.admin_list_pending_orgs() to authenticated;

-- --- approve_org(p_org) — flip a pending org to active. SUPERADMIN ONLY (raises otherwise) ------------
-- Runs as definer so it can set status despite the authenticated column-revoke from 0011. Returns the
-- org id + name + owner email so the caller can send the approval email; returns no row if not found.
create or replace function public.approve_org(p_org uuid)
returns table (org_id uuid, org_name text, owner_email text)
language plpgsql security definer
set search_path = public, pg_catalog as $$
begin
  if not public.is_superadmin() then
    raise exception 'not authorized: superadmin only' using errcode = '42501';
  end if;
  update public.orgs set status = 'active' where id = p_org and status = 'pending_approval';
  return query
    select o.id, o.legal_name, p.email
    from public.orgs o
    left join public.profiles p on p.id = o.created_by
    where o.id = p_org;
end $$;
grant execute on function public.approve_org(uuid) to authenticated;
