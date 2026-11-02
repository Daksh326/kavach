-- Optional transaction reference (UPI UTR / IMPS / NEFT ref) for complaints.
-- Banks and 1930 always ask for it. Not personal data of the victim.
alter table public.reports
  add column transaction_ref text
    check (transaction_ref ~ '^[A-Za-z0-9-]{6,40}$');

-- Max evidence files per report (enforced in the app; DB backstop).
create function private.enforce_evidence_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.evidence where report_id = new.report_id) >= 10 then
    raise exception 'evidence limit reached' using errcode = 'P0413';
  end if;
  return new;
end;
$$;

create trigger evidence_limit
  before insert on public.evidence
  for each row execute function private.enforce_evidence_limit();

revoke all on function private.enforce_evidence_limit() from public, anon, authenticated;

-- submit_report: same as before plus transaction_ref.
create or replace function public.submit_report(
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

  select count(*) into v_recent
  from public.reports
  where user_id = p_user_id and created_at > now() - interval '24 hours';
  if v_recent >= 20 then
    raise exception 'daily report limit reached' using errcode = 'P0429';
  end if;

  insert into public.reports (
    user_id, category, channel, description, amount_lost, incident_date,
    payment_method, bank_account_last4, transaction_ref, consent_at, consent_version
  ) values (
    p_user_id,
    (p_report ->> 'category')::public.scam_category,
    (p_report ->> 'channel')::public.report_channel,
    coalesce(p_report ->> 'description', ''),
    nullif(p_report ->> 'amount_lost', '')::numeric,
    nullif(p_report ->> 'incident_date', '')::date,
    nullif(p_report ->> 'payment_method', '')::public.payment_method,
    nullif(p_report ->> 'bank_account_last4', ''),
    nullif(p_report ->> 'transaction_ref', ''),
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

revoke all on function public.submit_report(uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.submit_report(uuid, jsonb, jsonb) to service_role;

-- Owners need the identifiers on THEIR report (for complaint text / export),
-- but must not read the identifiers table itself (it holds aggregate counts).
create function public.get_report_identifiers(p_report_id uuid)
returns table (type public.identifier_type, value_normalized text)
language sql
stable
security definer
set search_path = ''
as $$
  select i.type, i.value_normalized
  from public.report_identifiers ri
  join public.reports r on r.id = ri.report_id
  join public.identifiers i on i.id = ri.identifier_id
  where ri.report_id = p_report_id
    and r.user_id = (select auth.uid())
  order by i.type, i.value_normalized;
$$;

revoke all on function public.get_report_identifiers(uuid) from public, anon, authenticated;
grant execute on function public.get_report_identifiers(uuid) to authenticated;
