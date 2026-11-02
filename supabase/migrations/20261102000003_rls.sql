-- Row Level Security + explicit grants.
-- Strategy: revoke everything from anon/authenticated, then grant back the
-- minimum. RLS is enabled on EVERY table; tables with no policy for a role are
-- inaccessible to it. service_role bypasses RLS and is used only on the server.

-- ---------------------------------------------------------------------------
-- Reset table privileges
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;
revoke all on all functions in schema private from public, anon, authenticated;

-- New objects created later in public should not be auto-exposed either.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on functions from public, anon, authenticated;

alter table public.profiles           enable row level security;
alter table public.reports            enable row level security;
alter table public.identifiers        enable row level security;
alter table public.report_identifiers enable row level security;
alter table public.evidence           enable row level security;
alter table public.ai_analyses        enable row level security;
alter table public.flags              enable row level security;
alter table public.r2_deletion_queue  enable row level security;

-- Policies call private.is_admin(); the evaluating role needs schema usage.
grant usage on schema private to anon, authenticated;
grant execute on function private.is_admin() to authenticated;
grant execute on function private.public_reporter_threshold() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- profiles: read own (admins read all); update only name + language.
-- Inserts happen via the auth.users trigger; role changes only via SQL/service.
-- ---------------------------------------------------------------------------
grant select on public.profiles to authenticated;
grant update (name, language) on public.profiles to authenticated;

create policy profiles_select_own on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or (select private.is_admin()));

create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- reports: owner reads/updates status/deletes. Inserts only via the
-- service_role-only submit_report RPC (after Turnstile + rate limiting).
-- Admins may read reports (moderation context) but not change them.
-- ---------------------------------------------------------------------------
grant select, delete on public.reports to authenticated;
grant update (status, description) on public.reports to authenticated;

create policy reports_select_own on public.reports
  for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_admin()));

create policy reports_update_own on public.reports
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy reports_delete_own on public.reports
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- identifiers: NO direct access for anon or regular users (public reads go
-- through lookup_identifier / search_identifiers). Admins read + hide.
-- ---------------------------------------------------------------------------
grant select on public.identifiers to authenticated;
grant update (hidden) on public.identifiers to authenticated;

create policy identifiers_admin_select on public.identifiers
  for select to authenticated
  using ((select private.is_admin()));

create policy identifiers_admin_update on public.identifiers
  for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

-- ---------------------------------------------------------------------------
-- report_identifiers: owner sees the links on their own reports.
-- ---------------------------------------------------------------------------
grant select, delete on public.report_identifiers to authenticated;

create policy report_identifiers_select_own on public.report_identifiers
  for select to authenticated
  using (
    exists (
      select 1 from public.reports r
      where r.id = report_id
        and (r.user_id = (select auth.uid()) or (select private.is_admin()))
    )
  );

create policy report_identifiers_delete_own on public.report_identifiers
  for delete to authenticated
  using (
    exists (
      select 1 from public.reports r
      where r.id = report_id and r.user_id = (select auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- evidence: owner-only. Rows are inserted by the server after it has issued
-- the presigned R2 upload and verified the object, so no INSERT grant here.
-- Admins never see evidence.
-- ---------------------------------------------------------------------------
grant select, delete on public.evidence to authenticated;

create policy evidence_select_own on public.evidence
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy evidence_delete_own on public.evidence
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- ai_analyses: owner reads/deletes own. Written by the server.
-- ---------------------------------------------------------------------------
grant select, delete on public.ai_analyses to authenticated;

create policy ai_analyses_select_own on public.ai_analyses
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy ai_analyses_delete_own on public.ai_analyses
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- flags: created via the service_role-only flag_identifier RPC.
-- Flaggers can see their own flags; admins see and resolve all.
-- ---------------------------------------------------------------------------
grant select on public.flags to authenticated;
grant update (status, resolved_by, resolved_at) on public.flags to authenticated;

create policy flags_select on public.flags
  for select to authenticated
  using (flagged_by = (select auth.uid()) or (select private.is_admin()));

create policy flags_admin_update on public.flags
  for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

-- r2_deletion_queue: no policies, no grants -> service_role only.

-- ---------------------------------------------------------------------------
-- Function grants
-- ---------------------------------------------------------------------------
grant execute on function public.lookup_identifier(public.identifier_type, text) to anon, authenticated;
grant execute on function public.search_identifiers(text, public.identifier_type, integer) to anon, authenticated;
grant execute on function public.admin_merge_identifiers(uuid, uuid) to authenticated; -- checks is_admin()

grant execute on function public.submit_report(uuid, jsonb, jsonb) to service_role;
grant execute on function public.flag_identifier(public.identifier_type, text, public.flag_reason, text, uuid) to service_role;
grant execute on function public.cron_heartbeat() to service_role;
