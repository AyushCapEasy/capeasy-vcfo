-- 0008_staging_accepted_flips.sql — vCFO MIS Engine · M3 (sign flips as opt-in proposals)
-- Records which per-row debit↔credit flips the analyst has ACCEPTED on a staged upload. Default
-- empty = nothing flipped (values imported as written in their original column). Moving a value
-- between debit and credit is an accounting decision, never automatic (Bible §8.5; CA-VALIDATE).

alter table public.tb_upload_staging
  add column if not exists accepted_flips jsonb not null default '[]'::jsonb;
