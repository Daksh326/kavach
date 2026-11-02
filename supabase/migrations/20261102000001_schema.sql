-- Kavach core schema: types, tables, indexes, integrity triggers.
-- RLS policies and grants live in ..._0003_rls.sql. RPCs in ..._0002_functions.sql.

create extension if not exists pg_trgm with schema extensions;

-- Internal helpers live in a schema that PostgREST does not expose.
create schema if not exists private;
revoke all on schema private from public;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.user_role as enum ('user', 'admin');
create type public.app_language as enum ('en', 'hi');

create type public.report_status as enum (
  'draft',            -- saved in Kavach, not yet filed anywhere
  'filed_1930',       -- called the 1930 helpline
  'filed_portal',     -- filed on cybercrime.gov.in
  'bank_contacted',
  'resolved'
);

create type public.scam_category as enum (
  'upi_collect_request',
  'fake_customer_care',
  'kyc_bank_impersonation',
  'digital_arrest',        -- fake police / CBI / customs / courier "case"
  'investment_trading',
  'task_job_scam',
  'loan_app',
  'sextortion',
  'online_shopping',
  'lottery_prize',
  'romance',
  'utility_bill',
  'otp_sim_swap',
  'phishing_link',
  'other'
);

create type public.report_channel as enum (
  'phone_call', 'sms', 'whatsapp', 'telegram', 'email',
  'social_media', 'website', 'app', 'in_person', 'other'
);

create type public.payment_method as enum (
  'upi', 'bank_transfer', 'debit_card', 'credit_card', 'wallet',
  'net_banking', 'cash', 'crypto', 'gift_card', 'other', 'none'
);

create type public.identifier_type as enum (
  'phone', 'upi', 'url', 'domain', 'email', 'social', 'bank_ifsc'
);

create type public.flag_reason as enum (
  'wrong_number', 'my_identifier', 'abusive', 'duplicate', 'other'
);

create type public.flag_status as enum ('open', 'dismissed', 'actioned');

-- ---------------------------------------------------------------------------
-- Generic updated_at trigger
-- ---------------------------------------------------------------------------
create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles (1:1 with auth.users, created by trigger)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  name        text check (char_length(name) <= 100),
  role        public.user_role not null default 'user',
  language    public.app_language not null default 'en',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function private.set_updated_at();

create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lang public.app_language := 'en';
begin
  if new.raw_user_meta_data ->> 'language' = 'hi' then
    v_lang := 'hi';
  end if;

  insert into public.profiles (id, name, language)
  values (
    new.id,
    left(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'), 100),
    v_lang
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- ---------------------------------------------------------------------------
-- reports (private to the owner)
-- A row only exists after explicit consent (DPDP Act 2023). Unconsented wizard
-- drafts stay on the user's device.
-- ---------------------------------------------------------------------------
create table public.reports (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references public.profiles (id) on delete cascade,
  category            public.scam_category not null,
  channel             public.report_channel not null,
  description         text not null default '' check (char_length(description) <= 5000),
  amount_lost         numeric(14, 2) check (amount_lost >= 0 and amount_lost < 1000000000000),
  incident_date       date check (incident_date > date '2000-01-01'),
  payment_method      public.payment_method,
  -- Only the last 4 digits of the victim's/payee's bank account, never the full number.
  bank_account_last4  text check (bank_account_last4 ~ '^[0-9]{4}$'),
  status              public.report_status not null default 'draft',
  consent_at          timestamptz not null,
  consent_version     text not null check (char_length(consent_version) <= 20),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index reports_user_created_idx on public.reports (user_id, created_at desc);

create trigger reports_set_updated_at
  before update on public.reports
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- identifiers (shared, aggregated scam identifiers)
-- Never readable directly by anon/authenticated; public reads go through
-- public.lookup_identifier / public.search_identifiers.
-- ---------------------------------------------------------------------------
create table public.identifiers (
  id                       uuid primary key default gen_random_uuid(),
  type                     public.identifier_type not null,
  value_normalized         text not null,
  report_count             integer not null default 0 check (report_count >= 0),
  distinct_reporter_count  integer not null default 0 check (distinct_reporter_count >= 0),
  first_seen               timestamptz not null default now(),
  last_seen                timestamptz not null default now(),
  hidden                   boolean not null default false,
  -- Set when an admin merges this identifier into another; lookups follow it.
  merged_into_id           uuid references public.identifiers (id) on delete set null,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),

  constraint identifiers_type_value_key unique (type, value_normalized),
  constraint identifiers_not_self_merged check (merged_into_id is distinct from id),
  -- Defence in depth: the app normalises, the DB rejects anything malformed.
  constraint identifiers_value_format check (
    char_length(value_normalized) between 3 and 512
    and case type
      when 'phone'     then value_normalized ~ '^\+[1-9][0-9]{7,14}$'
      when 'upi'       then value_normalized ~ '^[a-z0-9._-]{2,64}@[a-z0-9.-]{2,64}$'
      when 'email'     then value_normalized ~ '^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z0-9-]{2,}$'
      when 'domain'    then value_normalized ~ '^([a-z0-9-]{1,63}\.)+[a-z0-9-]{2,63}$'
      when 'url'       then value_normalized ~ '^https?://[^\s]+$'
      when 'bank_ifsc' then value_normalized ~ '^[A-Z]{4}0[A-Z0-9]{6}$'
      when 'social'    then value_normalized ~ '^[a-z]+:[^\s]{1,100}$'
    end
  )
);

create index identifiers_value_trgm_idx
  on public.identifiers using gin (value_normalized extensions.gin_trgm_ops);
create index identifiers_public_idx
  on public.identifiers (type, distinct_reporter_count)
  where hidden = false and merged_into_id is null;
create index identifiers_merged_into_idx on public.identifiers (merged_into_id)
  where merged_into_id is not null;

create trigger identifiers_set_updated_at
  before update on public.identifiers
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- report_identifiers (link table)
-- ---------------------------------------------------------------------------
create table public.report_identifiers (
  report_id      uuid not null references public.reports (id) on delete cascade,
  identifier_id  uuid not null references public.identifiers (id) on delete cascade,
  created_at     timestamptz not null default now(),
  primary key (report_id, identifier_id)
);

create index report_identifiers_identifier_idx on public.report_identifiers (identifier_id);

-- Keep identifier aggregates exact. report_count counts reports; distinct_reporter_count
-- counts users, so one user's repeated reports count once toward the public threshold.
create function private.refresh_identifier_stats(p_identifier_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reports  integer;
  v_users    integer;
  v_first    timestamptz;
  v_last     timestamptz;
begin
  select count(*), count(distinct r.user_id), min(r.created_at), max(r.created_at)
    into v_reports, v_users, v_first, v_last
  from public.report_identifiers ri
  join public.reports r on r.id = ri.report_id
  where ri.identifier_id = p_identifier_id;

  if v_reports = 0 then
    -- No reports left (e.g. the reporter deleted their data): drop the identifier
    -- entirely, unless it is a merge tombstone that lookups still need to follow.
    delete from public.identifiers
    where id = p_identifier_id and merged_into_id is null;

    update public.identifiers
       set report_count = 0, distinct_reporter_count = 0
     where id = p_identifier_id;
  else
    update public.identifiers
       set report_count = v_reports,
           distinct_reporter_count = v_users,
           first_seen = v_first,
           last_seen = v_last
     where id = p_identifier_id;
  end if;
end;
$$;

create function private.report_identifiers_after_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform private.refresh_identifier_stats(new.identifier_id);
  else
    perform private.refresh_identifier_stats(old.identifier_id);
  end if;
  return null;
end;
$$;

create trigger report_identifiers_refresh_stats
  after insert or delete on public.report_identifiers
  for each row execute function private.report_identifiers_after_change();

-- ---------------------------------------------------------------------------
-- evidence (metadata only; files live in a private Cloudflare R2 bucket)
-- ---------------------------------------------------------------------------
create table public.evidence (
  id           uuid primary key default gen_random_uuid(),
  report_id    uuid not null references public.reports (id) on delete cascade,
  -- Denormalised owner for simple RLS and for bulk export/delete.
  user_id      uuid not null references public.profiles (id) on delete cascade,
  r2_key       text not null unique check (char_length(r2_key) <= 300),
  file_name    text check (char_length(file_name) <= 200),
  mime_type    text not null check (mime_type in (
                 'image/jpeg', 'image/png', 'image/webp', 'image/heic',
                 'application/pdf', 'audio/mpeg', 'audio/mp4', 'audio/ogg',
                 'audio/aac', 'video/mp4', 'text/plain')),
  size_bytes   integer not null check (size_bytes > 0 and size_bytes <= 10485760),
  sha256       text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  uploaded_at  timestamptz not null default now()
);

create index evidence_report_idx on public.evidence (report_id);
create index evidence_user_idx on public.evidence (user_id);

-- Guarantee R2 cleanup: any evidence row deletion (direct, via report delete, or via
-- account deletion cascade) queues the object key. The daily cron purges the queue.
create table public.r2_deletion_queue (
  r2_key     text primary key,
  queued_at  timestamptz not null default now(),
  attempts   integer not null default 0,
  last_error text
);

create function private.queue_evidence_deletion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.r2_deletion_queue (r2_key)
  values (old.r2_key)
  on conflict (r2_key) do nothing;
  return null;
end;
$$;

create trigger evidence_queue_r2_deletion
  after delete on public.evidence
  for each row execute function private.queue_evidence_deletion();

-- ---------------------------------------------------------------------------
-- ai_analyses (results only; the raw input is never stored, only its hash)
-- ---------------------------------------------------------------------------
create table public.ai_analyses (
  id           uuid primary key default gen_random_uuid(),
  -- Nullable: signed-out visitors can analyse a message too.
  user_id      uuid references public.profiles (id) on delete cascade,
  input_hash   text not null check (input_hash ~ '^[0-9a-f]{64}$'),
  input_kind   text not null default 'text' check (input_kind in ('text', 'image')),
  model        text not null check (char_length(model) <= 100),
  result_json  jsonb not null,
  created_at   timestamptz not null default now()
);

create index ai_analyses_input_hash_idx on public.ai_analyses (input_hash, created_at desc);
create index ai_analyses_user_idx on public.ai_analyses (user_id, created_at desc)
  where user_id is not null;

-- ---------------------------------------------------------------------------
-- flags (anyone can flag a public identifier; admins resolve)
-- ---------------------------------------------------------------------------
create table public.flags (
  id             uuid primary key default gen_random_uuid(),
  identifier_id  uuid not null references public.identifiers (id) on delete cascade,
  reason         public.flag_reason not null,
  details        text check (char_length(details) <= 1000),
  flagged_by     uuid references public.profiles (id) on delete set null,
  status         public.flag_status not null default 'open',
  resolved_by    uuid references public.profiles (id) on delete set null,
  resolved_at    timestamptz,
  created_at     timestamptz not null default now()
);

create index flags_status_created_idx on public.flags (status, created_at);
create index flags_identifier_idx on public.flags (identifier_id);
-- One open flag per identifier per signed-in user.
create unique index flags_one_open_per_user_idx
  on public.flags (identifier_id, flagged_by)
  where status = 'open' and flagged_by is not null;
