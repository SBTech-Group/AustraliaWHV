-- Monitor WHV Austrália — tabelas do produto comercial
-- Rodar no Supabase SQL Editor (mesmo projeto do Admin Hub)

-- Assinantes (pagantes)
create table if not exists australia_whv_subscribers (
  id                  uuid primary key default gen_random_uuid(),
  phone               text not null unique,           -- +5511999998888
  payment_id          text,                           -- ID do pagamento Mercado Pago
  payment_status      text default 'pending',         -- pending | approved | rejected
  active              boolean not null default false,
  paid_at             timestamptz,
  session_token       uuid,                           -- token de sessão do painel
  session_expires_at  timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- OTPs de login (WhatsApp)
create table if not exists australia_whv_otps (
  id          uuid primary key default gen_random_uuid(),
  phone       text not null,
  code        text not null,
  expires_at  timestamptz not null,
  used        boolean not null default false,
  created_at  timestamptz not null default now()
);

-- Índice para lookup rápido por phone
create index if not exists idx_whv_otps_phone on australia_whv_otps (phone, used, expires_at);
create index if not exists idx_whv_subscribers_session on australia_whv_subscribers (session_token) where session_token is not null;

-- RLS
alter table australia_whv_subscribers enable row level security;
alter table australia_whv_otps enable row level security;

-- Subscribers: anon pode SELECT por session_token (login check do frontend)
create policy "anon select subscriber by session token"
  on australia_whv_subscribers for select
  to anon
  using (session_token is not null);

-- OTPs: sem acesso direto (apenas via Edge Functions com service_role)
-- Nenhuma policy anon ou authenticated → acesso bloqueado

-- Monitor config: anon pode ler status (dado público — site oficial australiano)
-- Adicionar policy se ainda não existir:
do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'australia_whv_monitor_config'
      and policyname = 'anon read monitor config'
  ) then
    execute $policy$
      create policy "anon read monitor config"
        on australia_whv_monitor_config for select
        to anon
        using (true)
    $policy$;
  end if;
end $$;

-- Monitor logs: anon pode ler
do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'australia_whv_monitor_logs'
      and policyname = 'anon read monitor logs'
  ) then
    execute $policy$
      create policy "anon read monitor logs"
        on australia_whv_monitor_logs for select
        to anon
        using (true)
    $policy$;
  end if;
end $$;

-- Trigger para updated_at
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger whv_subscribers_updated_at
  before update on australia_whv_subscribers
  for each row execute function set_updated_at();
