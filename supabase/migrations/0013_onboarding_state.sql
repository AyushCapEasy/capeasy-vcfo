-- 0013_onboarding_state.sql — onboarding/welcome-guide state on the user's own profile.
-- login_count: incremented once per sign-in (login action + email-confirm callback). The welcome guide
-- shows on odd logins (1,3,5…) until setup is complete or the user dismisses it.
-- setup_complete: set true once the user has connected their books and their financials exist.
-- welcome_dismissed: "don't show again".
-- All three live on profiles and are written by the user themselves under the existing
-- profiles_update_self RLS policy (id = auth.uid()); no new policy needed. Additive + idempotent.

alter table public.profiles
  add column if not exists login_count      integer not null default 0,
  add column if not exists setup_complete   boolean not null default false,
  add column if not exists welcome_dismissed boolean not null default false;
