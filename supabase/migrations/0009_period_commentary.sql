-- 0009_period_commentary.sql — vCFO MIS Engine · M6 (MIS pack)
-- Editable analyst commentary block per period (Bible §5A). Org-scoped via the period; the existing
-- periods RLS policy already gates read/write to org members, so no new policy is needed.

alter table public.periods add column if not exists commentary text;
