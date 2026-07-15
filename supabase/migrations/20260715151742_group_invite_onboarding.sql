-- 009 - Controlled group invite onboarding.
-- Adds explicit group access state, audit attempts and safe public active count.

alter table public.australia_whv_subscribers
  add column if not exists group_access_status text not null default 'not_requested',
  add column if not exists group_access_method text,
  add column if not exists group_access_error text,
  add column if not exists group_joined_at timestamptz,
  add column if not exists group_invite_sent_at timestamptz,
  add column if not exists group_invite_attempts int not null default 0,
  add column if not exists group_last_checked_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'australia_whv_subscribers_group_access_status_check'
      and conrelid = 'public.australia_whv_subscribers'::regclass
  ) then
    alter table public.australia_whv_subscribers
      add constraint australia_whv_subscribers_group_access_status_check
      check (group_access_status in (
        'not_requested',
        'auto_added',
        'invite_pending',
        'invite_sent',
        'active',
        'removed',
        'error'
      ));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'australia_whv_subscribers_group_access_method_check'
      and conrelid = 'public.australia_whv_subscribers'::regclass
  ) then
    alter table public.australia_whv_subscribers
      add constraint australia_whv_subscribers_group_access_method_check
      check (
        group_access_method is null
        or group_access_method in ('auto_add', 'manual_invite', 'admin', 'sync', 'cancel', 'member_check')
      );
  end if;
end $$;

update public.australia_whv_subscribers
set
  group_access_status = case
    when in_group is true then 'active'
    when active is true then 'invite_pending'
    else 'not_requested'
  end,
  group_access_method = case
    when in_group is true then coalesce(group_access_method, 'auto_add')
    else group_access_method
  end,
  group_joined_at = coalesce(group_joined_at, group_added_at)
where group_access_status = 'not_requested'
   or group_joined_at is null;

create index if not exists idx_whv_subscribers_group_access_status
  on public.australia_whv_subscribers (group_access_status)
  where active is true;

create index if not exists idx_whv_subscribers_group_invite_sent
  on public.australia_whv_subscribers (group_invite_sent_at)
  where group_invite_sent_at is not null;

create table if not exists public.australia_whv_group_access_attempts (
  id uuid primary key default gen_random_uuid(),
  subscriber_id uuid references public.australia_whv_subscribers(id) on delete set null,
  phone text not null,
  group_jid text,
  method text not null,
  status text not null,
  error_message text,
  http_status int,
  details jsonb not null default '{}'::jsonb,
  invite_sent_at timestamptz,
  expires_at timestamptz,
  joined_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_whv_group_attempts_phone_created
  on public.australia_whv_group_access_attempts (phone, created_at desc);

create index if not exists idx_whv_group_attempts_subscriber_created
  on public.australia_whv_group_access_attempts (subscriber_id, created_at desc)
  where subscriber_id is not null;

alter table public.australia_whv_group_access_attempts enable row level security;

alter table public.australia_whv_monitor_config
  add column if not exists show_landing_subscriber_count boolean not null default true;

grant select (
  active,
  in_group,
  access_expires_at,
  payment_status
) on table public.australia_whv_subscribers to anon;

drop policy if exists "anon read public group stats" on public.australia_whv_subscribers;
create policy "anon read public group stats"
  on public.australia_whv_subscribers
  for select to anon
  using (
    active is true
    and (access_expires_at is null or access_expires_at > now())
    and coalesce(payment_status, '') in ('approved', 'hub')
  );

grant select (
  singleton_key,
  last_detected_status,
  last_detected_raw,
  last_checked_at,
  opened_at,
  country_name,
  official_url,
  enabled,
  check_interval_minutes,
  support_whatsapp_number,
  support_default_message,
  contact_text,
  about_body,
  landing_trust_text,
  instagram_url,
  show_landing_subscriber_count
) on table public.australia_whv_monitor_config to anon;

create or replace view public.australia_whv_public_status
with (security_invoker = true) as
  select
    c.last_detected_status,
    c.last_detected_raw,
    c.last_checked_at,
    c.opened_at,
    c.country_name,
    c.official_url,
    c.enabled,
    c.check_interval_minutes,
    (
      select count(*)::int
      from public.australia_whv_subscribers s
      where s.active is true
        and s.in_group is true
        and (s.access_expires_at is null or s.access_expires_at > now())
        and coalesce(s.payment_status, '') in ('approved', 'hub')
    ) as group_member_count,
    (
      select count(*)::int
      from public.australia_whv_subscribers s
      where s.active is true
        and (s.access_expires_at is null or s.access_expires_at > now())
        and coalesce(s.payment_status, '') in ('approved', 'hub')
    ) as active_subscriber_count
  from public.australia_whv_monitor_config c
  where c.singleton_key = 'main';

grant select on public.australia_whv_public_status to anon;

create or replace view public.australia_whv_public_config
with (security_invoker = true) as
  select
    support_whatsapp_number,
    support_default_message,
    contact_text,
    about_body,
    landing_trust_text,
    instagram_url,
    show_landing_subscriber_count
  from public.australia_whv_monitor_config
  where singleton_key = 'main';

grant select on public.australia_whv_public_config to anon;

comment on column public.australia_whv_subscribers.group_access_status is 'Controlled WhatsApp group onboarding state for the subscriber.';
comment on column public.australia_whv_subscribers.group_invite_sent_at is 'Last controlled invite send time for rate limiting.';
comment on table public.australia_whv_group_access_attempts is 'Audit trail for automatic group add and controlled invite attempts.';
comment on column public.australia_whv_monitor_config.show_landing_subscriber_count is 'Controls whether the landing page shows safe aggregate active subscriber count.';
