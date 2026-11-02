-- LOCAL DEVELOPMENT SEED ONLY. Runs on `supabase db reset`; never pushed to
-- production (`supabase db push` does not run seeds). All data is fake:
-- phone numbers use an unallocated +91 6000-00x range, domains use .test,
-- UPI IDs use a fake "@fakepsp" handle.
--
-- Users (sign in with email OTP; codes appear in Mailpit at http://127.0.0.1:54324):
--   admin@kavach.test  (admin)
--   asha@kavach.test, ravi@kavach.test, meera@kavach.test, john@kavach.test, priya@kavach.test

-- ---------------------------------------------------------------------------
-- Users (the auth.users trigger creates profiles)
-- ---------------------------------------------------------------------------
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
select
  '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email,
  '', now(),
  '{"provider":"email","providers":["email"]}', jsonb_build_object('full_name', u.name, 'language', u.lang),
  now() - interval '60 days', now(), '', '', '', ''
from (values
  ('a0000000-0000-4000-8000-000000000001'::uuid, 'admin@kavach.test', 'Kavach Admin', 'en'),
  ('a0000000-0000-4000-8000-000000000002'::uuid, 'asha@kavach.test',  'Asha Verma',   'hi'),
  ('a0000000-0000-4000-8000-000000000003'::uuid, 'ravi@kavach.test',  'Ravi Kumar',   'en'),
  ('a0000000-0000-4000-8000-000000000004'::uuid, 'meera@kavach.test', 'Meera Nair',   'en'),
  ('a0000000-0000-4000-8000-000000000005'::uuid, 'john@kavach.test',  'John Dsouza',  'en'),
  ('a0000000-0000-4000-8000-000000000006'::uuid, 'priya@kavach.test', 'Priya Singh',  'hi')
) as u(id, email, name, lang);

insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id, u.id::text,
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
       'email', now(), now(), now()
from auth.users u
where u.email like '%@kavach.test';

update public.profiles set role = 'admin' where id = 'a0000000-0000-4000-8000-000000000001';

-- ---------------------------------------------------------------------------
-- Reports via the same RPC the app uses.
-- ---------------------------------------------------------------------------
do $$
declare
  asha  constant uuid := 'a0000000-0000-4000-8000-000000000002';
  ravi  constant uuid := 'a0000000-0000-4000-8000-000000000003';
  meera constant uuid := 'a0000000-0000-4000-8000-000000000004';
  john  constant uuid := 'a0000000-0000-4000-8000-000000000005';
  priya constant uuid := 'a0000000-0000-4000-8000-000000000006';
  consent jsonb := jsonb_build_object('consent_at', now(), 'consent_version', 'v1');
  v_id uuid;
begin
  -- 1) Fake "bank KYC" caller: reported by 3 distinct users -> PUBLIC.
  perform public.submit_report(asha, consent || '{
    "category":"kyc_bank_impersonation","channel":"phone_call",
    "description":"Caller said my account would be blocked unless I updated KYC and shared the code sent to my phone.",
    "amount_lost":"24999","incident_date":"2026-10-12","payment_method":"net_banking","bank_account_last4":"4321"}',
    '[{"type":"phone","value":"+916000000101"},{"type":"url","value":"https://kyc-update-portal.test/verify"},{"type":"domain","value":"kyc-update-portal.test"}]');
  perform public.submit_report(ravi, consent || '{
    "category":"kyc_bank_impersonation","channel":"sms",
    "description":"SMS with a link to update PAN, page asked for net banking login.",
    "incident_date":"2026-10-20","payment_method":"none"}',
    '[{"type":"phone","value":"+916000000101"},{"type":"domain","value":"kyc-update-portal.test"}]');
  perform public.submit_report(meera, consent || '{
    "category":"phishing_link","channel":"whatsapp",
    "description":"WhatsApp message with KYC link.","incident_date":"2026-10-28"}',
    '[{"type":"domain","value":"kyc-update-portal.test"}]');
  perform public.submit_report(john, consent || '{
    "category":"kyc_bank_impersonation","channel":"phone_call",
    "description":"Same caller, said he was from the bank head office.","incident_date":"2026-10-30"}',
    '[{"type":"phone","value":"+916000000101"}]');

  -- 2) Task-job scam UPI: 2 distinct users -> PUBLIC (exactly at threshold).
  perform public.submit_report(priya, consent || '{
    "category":"task_job_scam","channel":"telegram",
    "description":"Paid to like videos, then asked to deposit for a VIP task. Paid 3 times.",
    "amount_lost":"58000","incident_date":"2026-09-14","payment_method":"upi"}',
    '[{"type":"upi","value":"earn.daily.tasks@fakepsp"},{"type":"social","value":"telegram:@daily_task_hr_fake"}]');
  perform public.submit_report(ravi, consent || '{
    "category":"task_job_scam","channel":"whatsapp",
    "description":"Part-time job offer, rating hotels, then prepaid tasks.",
    "amount_lost":"12000","incident_date":"2026-10-02","payment_method":"upi"}',
    '[{"type":"upi","value":"earn.daily.tasks@fakepsp"}]');

  -- 3) Same user reports the same number twice -> counts ONCE -> NOT public.
  perform public.submit_report(asha, consent || '{
    "category":"digital_arrest","channel":"phone_call",
    "description":"Caller claimed a parcel in my name had drugs and police would arrest me.",
    "incident_date":"2026-10-05"}',
    '[{"type":"phone","value":"+916000000202"},{"type":"email","value":"cbi.notice.fake@mail.test"}]');
  perform public.submit_report(asha, consent || '{
    "category":"digital_arrest","channel":"whatsapp",
    "description":"Video call from the same number with someone in a police uniform.",
    "incident_date":"2026-10-06"}',
    '[{"type":"phone","value":"+916000000202"}]');

  -- 4) Investment scam domain, 2 users, but HIDDEN by moderation -> NOT public.
  perform public.submit_report(john, consent || '{
    "category":"investment_trading","channel":"social_media",
    "description":"Stock tips group, fake trading app showed profits, withdrawal blocked.",
    "amount_lost":"150000","incident_date":"2026-08-01","payment_method":"bank_transfer"}',
    '[{"type":"domain","value":"super-returns-trading.test"},{"type":"bank_ifsc","value":"FAKE0001234"}]');
  perform public.submit_report(meera, consent || '{
    "category":"investment_trading","channel":"social_media",
    "description":"Instagram ad for IPO allotment app.","incident_date":"2026-08-15"}',
    '[{"type":"domain","value":"super-returns-trading.test"}]');
  update public.identifiers set hidden = true
  where type = 'domain' and value_normalized = 'super-returns-trading.test';

  -- 5) Single report -> NOT public.
  v_id := public.submit_report(meera, consent || '{
    "category":"online_shopping","channel":"website",
    "description":"Ordered a phone on a discount site, never delivered.",
    "amount_lost":"8999","incident_date":"2026-10-25","payment_method":"upi"}',
    '[{"type":"url","value":"https://mega-sale-store.test"},{"type":"domain","value":"mega-sale-store.test"}]');
  update public.reports set status = 'filed_portal' where id = v_id;

  -- Fake evidence metadata (no R2 object exists for these keys locally).
  insert into public.evidence (report_id, user_id, r2_key, file_name, mime_type, size_bytes, sha256)
  values (v_id, meera, 'evidence/' || meera || '/' || v_id || '/seed-screenshot.png', 'order-screenshot.png',
          'image/png', 48213, encode(extensions.digest('seed-evidence', 'sha256'), 'hex'));

  -- An open flag from a user who says a number is theirs.
  perform public.flag_identifier('phone', '+916000000101', 'my_identifier',
    'This is my shop number, I think scammers spoofed it.', priya);
end;
$$;
