-- Monitor WHV Austrália — schema STANDALONE do produto comercial.
-- Projeto Supabase PRÓPRIO (hzaaqnbhhdpwfvtmuwkc) — NÃO depende mais do Admin Hub.
-- Rodar no SQL Editor do projeto novo. Cria as 4 tabelas próprias do produto.

-- ── Função updated_at ─────────────────────────────────────────────────────────
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ── Monitor: config singleton (própria — antes era compartilhada com o Hub) ────
create table if not exists australia_whv_monitor_config (
  id uuid primary key default gen_random_uuid(),
  singleton_key text not null default 'main' unique check (singleton_key = 'main'),

  enabled boolean not null default false,

  official_url text not null default 'https://immi.homeaffairs.gov.au/what-we-do/whm-program/status-of-country-caps#',
  country_name text not null default 'Brazil',
  check_interval_minutes int not null default 2 check (check_interval_minutes between 1 and 60),

  whatsapp_instance_name text not null default 'australia_whv_saas',
  whatsapp_target_number text,
  whatsapp_target_numbers text[] not null default '{}',
  whatsapp_status text not null default 'unknown',
  whatsapp_last_checked_at timestamptz,

  last_detected_status text not null default 'Unknown',
  last_detected_raw text,
  last_checked_at timestamptz,
  opened_at timestamptz,
  notified_at timestamptz,

  auto_pause_after_open boolean not null default false,   -- SaaS: NÃO auto-pausar (vários assinantes)

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists australia_whv_monitor_logs (
  id uuid primary key default gen_random_uuid(),
  level text not null check (level in ('info', 'success', 'warning', 'error')),
  action text not null,
  detected_status text,
  message text not null,
  http_status int,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_whv_logs_created_at on australia_whv_monitor_logs (created_at desc);
create index if not exists idx_whv_logs_action on australia_whv_monitor_logs (action);

-- ── Assinantes (pagantes) ─────────────────────────────────────────────────────
create table if not exists australia_whv_subscribers (
  id                  uuid primary key default gen_random_uuid(),
  phone               text not null unique,           -- +5511999998888
  payment_id          text,                           -- ID do pagamento Mercado Pago
  payment_status      text default 'pending',         -- pending | approved | rejected
  active              boolean not null default false,
  paid_at             timestamptz,
  notified_at         timestamptz,                    -- alerta de abertura enviado a ESTE assinante
  session_token       uuid,
  session_expires_at  timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- ── OTPs de login (WhatsApp) ──────────────────────────────────────────────────
create table if not exists australia_whv_otps (
  id          uuid primary key default gen_random_uuid(),
  phone       text not null,
  code        text not null,
  attempts    int not null default 0,
  expires_at  timestamptz not null,
  used        boolean not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists idx_whv_otps_phone on australia_whv_otps (phone, used, expires_at);
create index if not exists idx_whv_subscribers_session on australia_whv_subscribers (session_token) where session_token is not null;

-- ── Triggers updated_at ───────────────────────────────────────────────────────
drop trigger if exists whv_config_updated_at on australia_whv_monitor_config;
create trigger whv_config_updated_at
  before update on australia_whv_monitor_config
  for each row execute function set_updated_at();

drop trigger if exists whv_subscribers_updated_at on australia_whv_subscribers;
create trigger whv_subscribers_updated_at
  before update on australia_whv_subscribers
  for each row execute function set_updated_at();

-- ── Seed do singleton ─────────────────────────────────────────────────────────
insert into australia_whv_monitor_config (singleton_key)
values ('main') on conflict (singleton_key) do nothing;

-- ── RLS ───────────────────────────────────────────────────────────────────────
alter table australia_whv_monitor_config  enable row level security;
alter table australia_whv_monitor_logs    enable row level security;
alter table australia_whv_subscribers     enable row level security;
alter table australia_whv_otps            enable row level security;

-- Logs: leitura pública (histórico de verificações — dado público)
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'australia_whv_monitor_logs'
      and policyname = 'anon read monitor logs'
  ) then
    execute $policy$
      create policy "anon read monitor logs"
        on public.australia_whv_monitor_logs for select to anon using (true)
    $policy$;
  end if;
end $$;

-- Config: NÃO expor a tabela ao anon (contém whatsapp_target_numbers = telefones
-- dos assinantes). O status público é servido por uma VIEW só com colunas seguras.
create or replace view australia_whv_public_status as
  select last_detected_status, last_detected_raw, last_checked_at, opened_at,
         country_name, official_url, enabled
  from australia_whv_monitor_config
  where singleton_key = 'main';

grant select on australia_whv_public_status to anon;

-- Subscribers/OTPs: SEM acesso anon/authenticated. Todo acesso via Edge Function
-- (service role). Validação de sessão do painel também via Edge Function
-- (validate-session) — nunca por SELECT anon (senão vaza session_token de todos).
