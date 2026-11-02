-- RLS + privilege tests. Run with: pnpm db:test  (supabase test db)
-- Depends on supabase/seed.sql. Everything runs in a transaction and rolls back.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(31);

-- Helpers to impersonate a role the way PostgREST does.
create function pg_temp.as_user(p_id uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
  set local role authenticated;
$$;
create function pg_temp.as_anon() returns void language sql as $$
  select set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;
$$;

-- ---------------------------------------------------------------- anon
select pg_temp.as_anon();

select throws_ok($$ select * from public.reports $$, '42501', null, 'anon cannot read reports');
select throws_ok($$ select * from public.identifiers $$, '42501', null, 'anon cannot read identifiers table directly');
select throws_ok($$ select * from public.evidence $$, '42501', null, 'anon cannot read evidence');
select throws_ok($$ select * from public.profiles $$, '42501', null, 'anon cannot read profiles');
select throws_ok($$ select * from public.r2_deletion_queue $$, '42501', null, 'anon cannot read deletion queue');
select throws_ok(
  $$ select public.submit_report('a0000000-0000-4000-8000-000000000002', '{}', '[]') $$,
  '42501', null, 'anon cannot call submit_report');
select throws_ok(
  $$ select public.flag_identifier('phone', '+916000000101', 'other', 'x', null) $$,
  '42501', null, 'anon cannot call flag_identifier directly (server verifies Turnstile)');

select is((select is_reported from public.lookup_identifier('phone', '+916000000101')), true,
  'anon lookup: 3 distinct reporters -> reported');
select is((select reporter_count from public.lookup_identifier('phone', '+916000000202')), 0,
  'anon lookup: one user reporting twice stays below threshold and leaks no count');
select is((select is_reported from public.lookup_identifier('domain', 'super-returns-trading.test')), false,
  'anon lookup: hidden identifier is not reported');
select is((select count(*)::int from public.search_identifiers('6000000202')), 0,
  'fuzzy search never returns below-threshold identifiers');

reset role;

-- ---------------------------------------------------------------- user: Asha
select pg_temp.as_user('a0000000-0000-4000-8000-000000000002');

select is((select count(*)::int from public.reports), 3, 'Asha sees only her own 3 reports');
select is((select count(*)::int from public.reports where user_id <> 'a0000000-0000-4000-8000-000000000002'), 0,
  'Asha sees no one else''s reports');
select is((select count(*)::int from public.profiles), 1, 'Asha sees only her own profile');
select is((select count(*)::int from public.evidence), 0, 'Asha cannot see Meera''s evidence');
select is((select count(*)::int from public.identifiers), 0, 'regular user cannot read identifiers table');

select throws_ok(
  $$ update public.profiles set role = 'admin' where id = 'a0000000-0000-4000-8000-000000000002' $$,
  '42501', null, 'user cannot escalate own role');
select throws_ok(
  $$ insert into public.reports (user_id, category, channel, consent_at, consent_version)
     values ('a0000000-0000-4000-8000-000000000002', 'other', 'other', now(), 'v1') $$,
  '42501', null, 'user cannot insert reports directly (must go through server)');
select throws_ok(
  $$ select public.admin_merge_identifiers(gen_random_uuid(), gen_random_uuid()) $$,
  '42501', 'admin only', 'non-admin cannot merge identifiers');

-- Updating someone else's report silently affects 0 rows under RLS.
update public.reports set status = 'resolved' where user_id = 'a0000000-0000-4000-8000-000000000004';
select pass('update on others'' reports did not error');
reset role;
select is((select count(*)::int from public.reports
           where user_id = 'a0000000-0000-4000-8000-000000000004' and status = 'resolved'), 0,
  'Asha could not change Meera''s report status');

-- ---------------------------------------------------------------- get_report_identifiers
select pg_temp.as_user('a0000000-0000-4000-8000-000000000002');
select is((select count(*)::int from public.get_report_identifiers(
  (select id from public.reports where user_id = 'a0000000-0000-4000-8000-000000000002' order by created_at limit 1))), 3,
  'owner sees identifiers on own report via get_report_identifiers');
reset role;
select pg_temp.as_user('a0000000-0000-4000-8000-000000000003');
select is((select count(*)::int from public.get_report_identifiers(
  (select id from public.reports where user_id = 'a0000000-0000-4000-8000-000000000002' order by created_at limit 1))), 0,
  'get_report_identifiers returns nothing for someone else''s report');
reset role;
select pg_temp.as_anon();
select throws_ok($$ select * from public.get_report_identifiers(gen_random_uuid()) $$, '42501', null,
  'anon cannot call get_report_identifiers');
reset role;

-- Evidence limit backstop: 10 per report.
select throws_ok($$
  insert into public.evidence (report_id, user_id, r2_key, mime_type, size_bytes, sha256)
  select r.id, r.user_id, 'evidence/limit-test/' || g, 'image/png', 1, repeat('a', 64)
  from (select id, user_id from public.reports
        where user_id = 'a0000000-0000-4000-8000-000000000005' order by created_at limit 1) r,
       generate_series(1, 11) g $$,
  'P0413', null, 'more than 10 evidence files per report is rejected');
select throws_ok($$
  update public.reports set transaction_ref = 'bad ref!' where user_id = 'a0000000-0000-4000-8000-000000000005' $$,
  '23514', null, 'transaction_ref format is enforced');

-- ---------------------------------------------------------------- user: Meera
select pg_temp.as_user('a0000000-0000-4000-8000-000000000004');
select is((select count(*)::int from public.evidence), 1, 'Meera sees her own evidence');
reset role;

-- ---------------------------------------------------------------- admin
select pg_temp.as_user('a0000000-0000-4000-8000-000000000001');
select ok((select count(*) from public.identifiers) > 0, 'admin can read identifiers');
select is((select count(*)::int from public.flags where status = 'open'), 1, 'admin sees open flags');
select is((select count(*)::int from public.evidence), 0, 'admin cannot see evidence files');
reset role;

-- ---------------------------------------------------------------- deletion cascade
-- Deleting Meera's account removes her reports, recomputes counts, queues R2 cleanup.
delete from auth.users where id = 'a0000000-0000-4000-8000-000000000004';
select is(
  (select count(*)::int from public.r2_deletion_queue where r2_key like 'evidence/a0000000-0000-4000-8000-000000000004/%'),
  1, 'account deletion queues R2 evidence for purge');

select * from finish();
rollback;
