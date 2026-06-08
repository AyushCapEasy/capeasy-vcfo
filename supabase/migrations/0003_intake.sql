-- 0003_intake.sql — vCFO MIS Engine · M1 schema (3/6)
-- The intake spine (Bible §3): canonical Account Category taxonomy (reference),
-- per-client Account Mapping, the Period chain (prior_period_id first-class),
-- and the atomic Trial Balance lines (debit/credit in paise).

-- --- Canonical Account Category taxonomy (Bible §3.2 — the fixed target) ----
-- Reference data, NOT org-scoped: every source account maps INTO one of these.
create table if not exists public.account_categories (
  id             uuid           primary key default gen_random_uuid(),
  code           text           not null unique,        -- stable slug
  name           text           not null,
  "group"        account_group  not null,
  statement      statement_kind not null,               -- pl | bs
  normal_balance normal_balance not null,               -- debit | credit (sign sanity §3.3)
  sort_order     int            not null default 0
);

-- Seed the taxonomy exactly as Bible §3.2 (idempotent on code).
insert into public.account_categories (code, name, "group", statement, normal_balance, sort_order) values
  ('operating_revenue',                  'Operating revenue',                    'income',                  'pl', 'credit',  10),
  ('other_income',                       'Other income',                         'income',                  'pl', 'credit',  20),
  ('cogs',                               'COGS / cost of services',              'direct_costs',            'pl', 'debit',   30),
  ('employee_benefits',                  'Employee benefits',                    'operating_expenses',      'pl', 'debit',   40),
  ('rent_utilities',                     'Rent & utilities',                     'operating_expenses',      'pl', 'debit',   50),
  ('sales_marketing',                    'Sales & marketing',                    'operating_expenses',      'pl', 'debit',   60),
  ('technology_software',                'Technology/software',                  'operating_expenses',      'pl', 'debit',   70),
  ('professional_fees',                  'Professional fees',                    'operating_expenses',      'pl', 'debit',   80),
  ('admin_other_opex',                   'Admin & other opex',                   'operating_expenses',      'pl', 'debit',   90),
  ('depreciation_amortisation',          'Depreciation & amortisation',          'below_the_line',          'pl', 'debit',  100),
  ('finance_costs',                      'Finance costs',                        'below_the_line',          'pl', 'debit',  110),
  ('tax_expense',                        'Tax expense',                          'below_the_line',          'pl', 'debit',  120),
  ('cash_bank',                          'Cash & bank',                          'current_assets',          'bs', 'debit',  130),
  ('trade_receivables',                  'Trade receivables (AR)',               'current_assets',          'bs', 'debit',  140),
  ('inventory',                          'Inventory',                            'current_assets',          'bs', 'debit',  150),
  ('prepaid_advances',                   'Prepaid & advances',                   'current_assets',          'bs', 'debit',  160),
  ('other_current_assets',               'Other current assets',                 'current_assets',          'bs', 'debit',  170),
  ('ppe',                                'PP&E',                                 'non_current_assets',      'bs', 'debit',  180),
  ('intangibles',                        'Intangibles',                          'non_current_assets',      'bs', 'debit',  190),
  ('investments',                        'Investments',                          'non_current_assets',      'bs', 'debit',  200),
  ('other_non_current_assets',           'Other non-current assets',             'non_current_assets',      'bs', 'debit',  210),
  ('trade_payables',                     'Trade payables (AP)',                  'current_liabilities',     'bs', 'credit', 220),
  ('short_term_borrowings',              'Short-term borrowings',                'current_liabilities',     'bs', 'credit', 230),
  ('statutory_dues',                     'Statutory dues',                       'current_liabilities',     'bs', 'credit', 240),
  ('accrued_other_current_liabilities',  'Accrued/other current liabilities',    'current_liabilities',     'bs', 'credit', 250),
  ('long_term_borrowings',               'Long-term borrowings',                 'non_current_liabilities', 'bs', 'credit', 260),
  ('provisions',                         'Provisions',                           'non_current_liabilities', 'bs', 'credit', 270),
  ('other_non_current_liabilities',      'Other non-current liabilities',        'non_current_liabilities', 'bs', 'credit', 280),
  ('share_capital',                      'Share capital',                        'equity',                  'bs', 'credit', 290),
  ('reserves_surplus',                   'Reserves & surplus / retained earnings','equity',                 'bs', 'credit', 300),
  ('other_equity',                       'Other equity',                         'equity',                  'bs', 'credit', 310)
on conflict (code) do nothing;

-- --- Account Mapping: the one-time-per-client bridge (Bible §3.2) ----------
create table if not exists public.account_mappings (
  id                  uuid not null default gen_random_uuid() primary key,
  org_id              uuid not null references public.orgs(id) on delete cascade,
  source_account_code text not null,
  source_account_name text,
  category_id         uuid not null references public.account_categories(id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (org_id, source_account_code)
);
create index if not exists account_mappings_org_idx on public.account_mappings(org_id);

drop trigger if exists account_mappings_set_updated_at on public.account_mappings;
create trigger account_mappings_set_updated_at before update on public.account_mappings
  for each row execute function public.set_updated_at();

-- --- Period: the period chain. prior_period_id is mandatory & first-class --
-- (Bible §3.5). Nullable only for an entity's first period; never fabricate one.
create table if not exists public.periods (
  id              uuid          not null default gen_random_uuid() primary key,
  org_id          uuid          not null references public.orgs(id) on delete cascade,
  tax_year        text          not null,                 -- e.g. 'TY2026-27'
  period_month    date          not null,                 -- first day of the month
  label           text,
  prior_period_id uuid          references public.periods(id),
  status          period_status not null default 'draft',
  created_at      timestamptz   not null default now(),
  updated_at      timestamptz   not null default now(),
  unique (org_id, period_month)
);
create index if not exists periods_org_month_idx on public.periods(org_id, period_month);

drop trigger if exists periods_set_updated_at on public.periods;
create trigger periods_set_updated_at before update on public.periods
  for each row execute function public.set_updated_at();

-- A period's prior must belong to the same org (cross-tenant chains are invalid).
create or replace function public.periods_prior_same_org()
returns trigger language plpgsql as $$
declare v_org uuid;
begin
  if new.prior_period_id is not null then
    if new.prior_period_id = new.id then
      raise exception 'period % cannot be its own prior', new.id;
    end if;
    select org_id into v_org from public.periods where id = new.prior_period_id;
    if v_org is null then
      raise exception 'prior_period_id % does not exist', new.prior_period_id;
    elsif v_org <> new.org_id then
      raise exception 'prior_period_id % belongs to a different org', new.prior_period_id;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists periods_prior_same_org on public.periods;
create trigger periods_prior_same_org before insert or update on public.periods
  for each row execute function public.periods_prior_same_org();

-- --- set org_id from period (denormalize for simple, non-recursive RLS) ----
create or replace function public.set_org_from_period()
returns trigger language plpgsql as $$
declare v_org uuid;
begin
  select org_id into v_org from public.periods where id = new.period_id;
  if v_org is null then
    raise exception 'period % not found', new.period_id;
  end if;
  if new.org_id is null then
    new.org_id := v_org;
  elsif new.org_id <> v_org then
    raise exception 'org_id % does not match period''s org %', new.org_id, v_org;
  end if;
  return new;
end $$;

-- --- Trial Balance line: the atomic input (Bible §3.2). paise, never float -
create table if not exists public.trial_balance_lines (
  id                  uuid  not null default gen_random_uuid() primary key,
  period_id           uuid  not null references public.periods(id) on delete cascade,
  org_id              uuid  not null references public.orgs(id) on delete cascade,
  source_account_code text  not null,
  source_account_name text,
  debit_amount        bigint not null default 0 check (debit_amount  >= 0),  -- paise
  credit_amount       bigint not null default 0 check (credit_amount >= 0),  -- paise
  created_at          timestamptz not null default now()
);
create index if not exists tb_lines_period_idx on public.trial_balance_lines(period_id);
create index if not exists tb_lines_org_idx    on public.trial_balance_lines(org_id);

drop trigger if exists tb_lines_set_org on public.trial_balance_lines;
create trigger tb_lines_set_org before insert or update on public.trial_balance_lines
  for each row execute function public.set_org_from_period();

-- --- Grants ----------------------------------------------------------------
grant select on public.account_categories to authenticated;
grant select, insert, update, delete on public.account_mappings     to authenticated;
grant select, insert, update, delete on public.periods              to authenticated;
grant select, insert, update, delete on public.trial_balance_lines  to authenticated;

-- --- RLS: account_categories (shared reference — read-only to staff) -------
alter table public.account_categories enable row level security;
drop policy if exists account_categories_select on public.account_categories;
create policy account_categories_select on public.account_categories
  for select to authenticated using (true);

-- --- RLS: account_mappings / periods / trial_balance_lines (org-scoped) ----
alter table public.account_mappings enable row level security;
drop policy if exists account_mappings_rw on public.account_mappings;
create policy account_mappings_rw on public.account_mappings
  for all to authenticated
  using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));

alter table public.periods enable row level security;
drop policy if exists periods_rw on public.periods;
create policy periods_rw on public.periods
  for all to authenticated
  using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));

alter table public.trial_balance_lines enable row level security;
drop policy if exists tb_lines_rw on public.trial_balance_lines;
create policy tb_lines_rw on public.trial_balance_lines
  for all to authenticated
  using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));
