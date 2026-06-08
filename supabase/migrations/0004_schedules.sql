-- 0004_schedules.sql — vCFO MIS Engine · M1 schema (4/6)
-- Supporting schedules (Bible §3.2): each unlocks specific metrics (AR/AP aging,
-- cash by bank, headcount, recurring-revenue split for MRR, capex, debt).
-- All amounts in paise. All org-scoped + period-linked; org_id auto-set from period.

-- AR aging — buckets must reconcile to the period's Trade receivables total.
create table if not exists public.schedule_ar_aging (
  id            uuid not null default gen_random_uuid() primary key,
  period_id     uuid not null references public.periods(id) on delete cascade,
  org_id        uuid not null references public.orgs(id) on delete cascade,
  customer_name text not null,
  current_0_30  bigint not null default 0,
  days_31_60    bigint not null default 0,
  days_61_90    bigint not null default 0,
  days_90_plus  bigint not null default 0,
  created_at    timestamptz not null default now()
);

-- AP aging — reconciles to Trade payables.
create table if not exists public.schedule_ap_aging (
  id           uuid not null default gen_random_uuid() primary key,
  period_id    uuid not null references public.periods(id) on delete cascade,
  org_id       uuid not null references public.orgs(id) on delete cascade,
  vendor_name  text not null,
  current_0_30 bigint not null default 0,
  days_31_60   bigint not null default 0,
  days_61_90   bigint not null default 0,
  days_90_plus bigint not null default 0,
  created_at   timestamptz not null default now()
);

-- Cash balances by bank — reconciles to Cash & bank.
create table if not exists public.schedule_cash_balances (
  id         uuid not null default gen_random_uuid() primary key,
  period_id  uuid not null references public.periods(id) on delete cascade,
  org_id     uuid not null references public.orgs(id) on delete cascade,
  bank_name  text not null,
  balance    bigint not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.schedule_headcount (
  id         uuid not null default gen_random_uuid() primary key,
  period_id  uuid not null references public.periods(id) on delete cascade,
  org_id     uuid not null references public.orgs(id) on delete cascade,
  department text,
  headcount  int not null default 0,
  created_at timestamptz not null default now()
);

-- Revenue detail — recurring flag powers MRR/ARR (Bible §4.4).
create table if not exists public.schedule_revenue_detail (
  id            uuid not null default gen_random_uuid() primary key,
  period_id     uuid not null references public.periods(id) on delete cascade,
  org_id        uuid not null references public.orgs(id) on delete cascade,
  segment       text,
  customer_name text,
  amount        bigint not null default 0,
  is_recurring  boolean not null default false,
  created_at    timestamptz not null default now()
);

create table if not exists public.schedule_capex (
  id          uuid not null default gen_random_uuid() primary key,
  period_id   uuid not null references public.periods(id) on delete cascade,
  org_id      uuid not null references public.orgs(id) on delete cascade,
  description text,
  amount      bigint not null default 0,
  created_at  timestamptz not null default now()
);

create table if not exists public.schedule_debt (
  id                   uuid not null default gen_random_uuid() primary key,
  period_id            uuid not null references public.periods(id) on delete cascade,
  org_id               uuid not null references public.orgs(id) on delete cascade,
  lender               text,
  kind                 text check (kind in ('short_term', 'long_term')),
  principal_outstanding bigint not null default 0,
  interest_rate        numeric(6,3),
  created_at           timestamptz not null default now()
);

-- Wire org_id auto-set + org-member RLS + grants for every schedule table.
do $$
declare t text;
begin
  foreach t in array array[
    'schedule_ar_aging', 'schedule_ap_aging', 'schedule_cash_balances',
    'schedule_headcount', 'schedule_revenue_detail', 'schedule_capex', 'schedule_debt'
  ] loop
    execute format('create index if not exists %I on public.%I(period_id)', t || '_period_idx', t);
    execute format('drop trigger if exists %I on public.%I', t || '_set_org', t);
    execute format('create trigger %I before insert or update on public.%I
                    for each row execute function public.set_org_from_period()',
                   t || '_set_org', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_rw', t);
    execute format('create policy %I on public.%I for all to authenticated
                    using (public.is_org_member(org_id)) with check (public.is_org_member(org_id))',
                   t || '_rw', t);
  end loop;
end $$;
