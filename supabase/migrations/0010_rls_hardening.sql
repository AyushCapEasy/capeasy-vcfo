-- 0010_rls_hardening.sql — vCFO MIS Engine · D-014 Phase 1 (launch-gate RLS hardening)
-- Two PII leaks that are harmless under the internal-staff model but break the moment public signup
-- opens (a signed-up stranger could read other tenants' PII). Both are tightened here BEFORE any signup.
-- SELECT-only changes — no events dropped, no data touched, no write path altered.
--
-- GAP-1 — profiles were world-readable: profiles_select USING (true) let ANY authenticated user read
--   every user's email + full_name. Audit of readers (src/): the ONLY reader is the home screen
--   (src/app/page.tsx), which reads the caller's OWN row (.eq('id', user.id)); no screen shows teammate
--   names and there are no embedded profiles() joins. So: restrict SELECT to SELF. (If a future team
--   screen needs teammate names, add an is_org_member co-member clause then — not needed today.)
--
-- GAP-2 — audit_log system events (org_id IS NULL — e.g. auth.login carrying detail->>'email') were
--   readable by ANY authenticated user via the `org_id is null` arm of audit_log_select. Scope system
--   rows to their ACTOR; org rows stay readable by org members. The events are preserved (auth.login /
--   auth.logout still recorded, email still stored) — they are simply no longer globally readable.
--   The app never SELECTs audit_log (insert-only), so tightening read visibility breaks no screen.

-- --- GAP-1: profiles SELECT = self only -----------------------------------
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (id = (select auth.uid()));

-- --- GAP-2: audit_log SELECT = org members (org rows) OR the actor (system rows) ---
drop policy if exists audit_log_select on public.audit_log;
create policy audit_log_select on public.audit_log
  for select to authenticated
  using (
    (org_id is not null and public.is_org_member(org_id))
    or (org_id is null and actor_id = (select auth.uid()))
  );
