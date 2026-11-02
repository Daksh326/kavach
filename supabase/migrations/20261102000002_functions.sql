-- RPCs. Every function pins search_path = '' and fully qualifies names.
-- Postgres grants EXECUTE to PUBLIC by default, so each function's grants are
-- reset explicitly in ..._0003_rls.sql.

-- Minimum number of DISTINCT users who must report an identifier before public
-- lookup says "reported". Single source of truth for the threshold.
create function private.public_reporter_threshold()
returns integer
language sql
immutable
set search_path = ''
as $$ select 2 $$;

create function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin'
  );
$$;

-- ---------------------------------------------------------------------------
-- Public lookup (anon + authenticated)
-- Returns exactly one row. Below the threshold, or for hidden entries, it
-- returns is_reported = false with no counts or dates, so a single report is
-- never observable.
-- ---------------------------------------------------------------------------
create function public.lookup_identifier(p_type public.identifier_type, p_value text)
returns table (
  type              public.identifier_type,
  value_normalized  text,
  is_reported       boolean,
  reporter_count    integer,
  categories        public.scam_category[],
  channels          public.report_channel[],
  first_seen        timestamptz,
  last_seen         timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_ident public.identifiers%rowtype;
begin
  if p_value is null or char_length(p_value) not between 3 and 512 then
    raise exception 'invalid identifier value' using errcode = '22023';
  end if;

  select * into v_ident
  from public.identifiers i
  where i.type = p_type and i.value_normalized = p_value;

  -- Follow one merge hop.
  if found and v_ident.merged_into_id is not null then
    select * into v_ident from public.identifiers i where i.id = v_ident.merged_into_id;
  end if;

  if not found
     or v_ident.hidden
     or v_ident.distinct_reporter_count < private.public_reporter_threshold() then
    return query select p_type, p_value, false, 0,
      '{}'::public.scam_category[], '{}'::public.report_channel[],
      null::timestamptz, null::timestamptz;
    return;
  end if;

  return query
  select
    v_ident.type,
    v_ident.value_normalized,
    true,
    v_ident.distinct_reporter_count,
    coalesce(array(
      select r.category
      from public.report_identifiers ri
      join public.reports r on r.id = ri.report_id
      where ri.identifier_id = v_ident.id
      group by r.category
      order by count(distinct r.user_id) desc, r.category
    ), '{}'),
    coalesce(array(
      select r.channel
      from public.report_identifiers ri
      join public.reports r on r.id = ri.report_id
      where ri.identifier_id = v_ident.id
      group by r.channel
      order by count(distinct r.user_id) desc, r.channel
    ), '{}'),
    v_ident.first_seen,
    v_ident.last_seen;
end;
$$;

-- Fuzzy search (pg_trgm) over PUBLIC identifiers only, for "did you mean".
create function public.search_identifiers(
  p_query text,
  p_type public.identifier_type default null,
  p_limit integer default 5
)
returns table (
  type              public.identifier_type,
  value_normalized  text,
  reporter_count    integer,
  similarity        real
)
language sql
stable
security definer
set search_path = ''
as $$
  select i.type, i.value_normalized, i.distinct_reporter_count,
         extensions.similarity(i.value_normalized, p_query)
  from public.identifiers i
  where char_length(p_query) between 4 and 512
    and i.value_normalized operator(extensions.%) p_query
    and (p_type is null or i.type = p_type)
    and i.hidden = false
    and i.merged_into_id is null
    and i.distinct_reporter_count >= private.public_reporter_threshold()
  order by extensions.similarity(i.value_normalized, p_query) desc, i.distinct_reporter_count desc
  limit least(greatest(coalesce(p_limit, 5), 1), 10);
$$;

-- ---------------------------------------------------------------------------
-- Report submission (service_role only).
-- Called by a Server Action AFTER it has verified the session, Turnstile and
-- rate limits, so it cannot be invoked directly with a user JWT to bypass them.
-- p_identifiers: [{"type": "phone", "value": "+919876543210"}, ...] already normalised.
-- ---------------------------------------------------------------------------
create function public.submit_report(
  p_user_id uuid,
  p_report jsonb,
  p_identifiers jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_report_id   uuid;
  v_ident_id    uuid;
  v_item        jsonb;
  v_recent      integer;
begin
  if p_user_id is null then
    raise exception 'user required' using errcode = '42501';
  end if;

  if jsonb_typeof(coalesce(p_identifiers, '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_identifiers, '[]'::jsonb)) > 20 then
    raise exception 'too many identifiers' using errcode = '22023';
  end if;

  if (p_report ->> 'consent_at') is null then
    raise exception 'consent required' using errcode = '23514';
  end if;

  -- Backstop rate limit (the app enforces a stricter one in Redis).
  select count(*) into v_recent
  from public.reports
  where user_id = p_user_id and created_at > now() - interval '24 hours';
  if v_recent >= 20 then
    raise exception 'daily report limit reached' using errcode = 'P0429';
  end if;

  insert into public.reports (
    user_id, category, channel, description, amount_lost, incident_date,
    payment_method, bank_account_last4, consent_at, consent_version
  ) values (
    p_user_id,
    (p_report ->> 'category')::public.scam_category,
    (p_report ->> 'channel')::public.report_channel,
    coalesce(p_report ->> 'description', ''),
    nullif(p_report ->> 'amount_lost', '')::numeric,
    nullif(p_report ->> 'incident_date', '')::date,
    nullif(p_report ->> 'payment_method', '')::public.payment_method,
    nullif(p_report ->> 'bank_account_last4', ''),
    (p_report ->> 'consent_at')::timestamptz,
    p_report ->> 'consent_version'
  )
  returning id into v_report_id;

  for v_item in select * from jsonb_array_elements(coalesce(p_identifiers, '[]'::jsonb))
  loop
    insert into public.identifiers (type, value_normalized)
    values ((v_item ->> 'type')::public.identifier_type, v_item ->> 'value')
    on conflict (type, value_normalized) do update set updated_at = now()
    returning id into v_ident_id;

    insert into public.report_identifiers (report_id, identifier_id)
    values (v_report_id, v_ident_id)
    on conflict do nothing;
  end loop;

  return v_report_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Flag a public identifier (service_role only; the Server Action verifies
-- Turnstile + rate limit first). flagged_by is null for signed-out visitors.
-- ---------------------------------------------------------------------------
create function public.flag_identifier(
  p_type public.identifier_type,
  p_value text,
  p_reason public.flag_reason,
  p_details text,
  p_flagged_by uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ident_id uuid;
  v_flag_id  uuid;
begin
  select coalesce(i.merged_into_id, i.id) into v_ident_id
  from public.identifiers i
  where i.type = p_type and i.value_normalized = p_value;

  if v_ident_id is null then
    raise exception 'identifier not found' using errcode = 'P0002';
  end if;

  insert into public.flags (identifier_id, reason, details, flagged_by)
  values (v_ident_id, p_reason, left(p_details, 1000), p_flagged_by)
  on conflict (identifier_id, flagged_by) where status = 'open' and flagged_by is not null
  do update set reason = excluded.reason, details = excluded.details
  returning id into v_flag_id;

  return v_flag_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Admin: merge a duplicate identifier into a canonical one.
-- ---------------------------------------------------------------------------
create function public.admin_merge_identifiers(p_source_id uuid, p_target_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  if p_source_id = p_target_id then
    raise exception 'cannot merge an identifier into itself' using errcode = '22023';
  end if;
  if exists (select 1 from public.identifiers where id = p_target_id and merged_into_id is not null) then
    raise exception 'target is itself merged' using errcode = '22023';
  end if;

  -- Mark first so the stats trigger keeps the source row as a tombstone.
  update public.identifiers set merged_into_id = p_target_id where id = p_source_id;
  if not found then
    raise exception 'source not found' using errcode = 'P0002';
  end if;
  -- Re-point anything that was merged into the source.
  update public.identifiers set merged_into_id = p_target_id where merged_into_id = p_source_id;

  insert into public.report_identifiers (report_id, identifier_id)
  select report_id, p_target_id from public.report_identifiers where identifier_id = p_source_id
  on conflict do nothing;
  delete from public.report_identifiers where identifier_id = p_source_id;

  update public.flags set identifier_id = p_target_id where identifier_id = p_source_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Cron keep-alive / health (service_role only). Also returns queue depth so
-- the daily job can decide whether to purge R2.
-- ---------------------------------------------------------------------------
create function public.cron_heartbeat()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'now', now(),
    'r2_deletion_queue', (select count(*) from public.r2_deletion_queue)
  );
$$;
