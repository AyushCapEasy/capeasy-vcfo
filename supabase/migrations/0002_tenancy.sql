-- 0002_tenancy.sql — vCFO MIS Engine · M1 schema (2/6)
-- Multi-tenant foundation: profiles, orgs (= client entities), org_members (membership
-- + role), RLS helper functions, and the policies that make org = tenant boundary.
-- "Internal" = who operates it; the system stays multi-tenant (Bible §1, §8.3).

-- --- profiles: app-side mirror of auth.users (internal staff) --------------
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  full_name  text,
  email      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- --- orgs: the client/org = the tenant (Bible §3.2 "Entity") ---------------
create table if not exists public.orgs (
  id            uuid primary key default gen_random_uuid(),
  legal_name    text        not null,
  entity_type   entity_type not null default 'pvt_ltd',
  state         text,
  currency      text        not null default 'INR' check (currency = 'INR'),
  gst_scheme    text        check (gst_scheme in ('monthly', 'qrmp')),
  has_employees boolean      not null default true,
  created_by    uuid        references auth.users(id),
  created_at    timestamptz  not null default now(),
  updated_at    timestamptz  not null default now()
);

drop trigger if exists orgs_set_updated_at on public.orgs;
create trigger orgs_set_updated_at before update on public.orgs
  for each row execute function public.set_updated_at();

-- --- org_members: membership grants tenant access; role = Admin/Analyst ----
create table if not exists public.org_members (
  org_id     uuid     not null references public.orgs(id) on delete cascade,
  user_id    uuid     not null references auth.users(id) on delete cascade,
  role       org_role not null default 'analyst',
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);

-- --- RLS helpers (SECURITY DEFINER → bypass RLS on org_members, no recursion)
create or replace function public.is_org_member(p_org uuid)
returns boolean language sql stable security definer
set search_path = public, pg_catalog as $$
  select exists (
    select 1 from public.org_members m
    where m.org_id = p_org and m.user_id = auth.uid()
  );
$$;

create or replace function public.is_org_admin(p_org uuid)
returns boolean language sql stable security definer
set search_path = public, pg_catalog as $$
  select exists (
    select 1 from public.org_members m
    where m.org_id = p_org and m.user_id = auth.uid() and m.role = 'admin'
  );
$$;

-- Org creator becomes its first admin (runs as definer so RLS on org_members
-- doesn't block the bootstrap insert). Keyed on created_by so it also works
-- for service_role-driven seeding/onboarding.
create or replace function public.add_org_creator_as_admin()
returns trigger language plpgsql security definer
set search_path = public, pg_catalog as $$
begin
  insert into public.org_members (org_id, user_id, role)
  values (new.id, new.created_by, 'admin')
  on conflict do nothing;
  return new;
end $$;

drop trigger if exists orgs_add_creator on public.orgs;
create trigger orgs_add_creator after insert on public.orgs
  for each row when (new.created_by is not null)
  execute function public.add_org_creator_as_admin();

-- --- Grants (RLS still gates rows; without table grants RLS never evaluates)
grant select, insert, update, delete on public.profiles    to authenticated;
grant select, insert, update, delete on public.orgs        to authenticated;
grant select, insert, update, delete on public.org_members to authenticated;

-- --- RLS: profiles (internal staff can see each other; edit only own) ------
alter table public.profiles enable row level security;
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated using (true);
drop policy if exists profiles_insert_self on public.profiles;
create policy profiles_insert_self on public.profiles
  for insert to authenticated with check (id = (select auth.uid()));
drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update to authenticated using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- --- RLS: orgs (members read; admins write; creator must be self) ----------
alter table public.orgs enable row level security;
drop policy if exists orgs_select on public.orgs;
create policy orgs_select on public.orgs
  for select to authenticated using (public.is_org_member(id));
drop policy if exists orgs_insert on public.orgs;
create policy orgs_insert on public.orgs
  for insert to authenticated with check (created_by = (select auth.uid()));
drop policy if exists orgs_update on public.orgs;
create policy orgs_update on public.orgs
  for update to authenticated using (public.is_org_admin(id))
  with check (public.is_org_admin(id));
drop policy if exists orgs_delete on public.orgs;
create policy orgs_delete on public.orgs
  for delete to authenticated using (public.is_org_admin(id));

-- --- RLS: org_members (see own membership or any if org admin; admins write)
alter table public.org_members enable row level security;
drop policy if exists org_members_select on public.org_members;
create policy org_members_select on public.org_members
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_org_admin(org_id));
drop policy if exists org_members_insert on public.org_members;
create policy org_members_insert on public.org_members
  for insert to authenticated with check (public.is_org_admin(org_id));
drop policy if exists org_members_update on public.org_members;
create policy org_members_update on public.org_members
  for update to authenticated using (public.is_org_admin(org_id))
  with check (public.is_org_admin(org_id));
drop policy if exists org_members_delete on public.org_members;
create policy org_members_delete on public.org_members
  for delete to authenticated using (public.is_org_admin(org_id));
