-- 006 - Public/support settings, checkout OTP verification and ephemeral cleanup.

alter table australia_whv_monitor_config
  add column if not exists support_whatsapp_number text,
  add column if not exists support_default_message text not null default 'Ola, preciso de ajuda com meu acesso ao Australia WHV.',
  add column if not exists contact_email text,
  add column if not exists contact_text text not null default 'Fale com o suporte se tiver qualquer problema com pagamento, acesso ao painel ou entrada no grupo.',
  add column if not exists about_title text not null default 'Sobre nos',
  add column if not exists about_body text not null default 'O Monitor WHV Australia e uma ferramenta da SB Tech para acompanhar a pagina oficial australiana e avisar assinantes pelo WhatsApp quando houver mudanca de status.',
  add column if not exists landing_trust_text text not null default 'Depois do pagamento, seu acesso ao painel e liberado e voce recebe orientacao para entrar no grupo de alertas.';

alter table australia_whv_otps
  add column if not exists purpose text not null default 'login',
  add column if not exists verified_at timestamptz,
  add column if not exists verification_token uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'australia_whv_otps_purpose_check'
      and conrelid = 'public.australia_whv_otps'::regclass
  ) then
    alter table public.australia_whv_otps
      add constraint australia_whv_otps_purpose_check
      check (purpose in ('login', 'checkout'));
  end if;
end $$;

create index if not exists idx_whv_otps_phone_purpose
  on australia_whv_otps (phone, purpose, used, expires_at);

create index if not exists idx_whv_otps_checkout_token
  on australia_whv_otps (phone, verification_token, verified_at desc)
  where purpose = 'checkout' and verification_token is not null;

create or replace function public.australia_whv_cleanup_ephemeral_data()
returns table(logs_deleted integer, otps_deleted integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_logs integer := 0;
  v_started_logs integer := 0;
  v_otps integer := 0;
begin
  delete from public.australia_whv_monitor_logs
  where created_at < now() - interval '2 days';
  get diagnostics v_logs = row_count;

  delete from public.australia_whv_monitor_logs
  where action = 'check'
    and level = 'info'
    and detected_status is null
    and message ilike 'Verifica%iniciada%';
  get diagnostics v_started_logs = row_count;
  v_logs := v_logs + v_started_logs;

  delete from public.australia_whv_otps
  where (used = true and created_at < now() - interval '1 day')
     or expires_at < now() - interval '1 day'
     or created_at < now() - interval '7 days';
  get diagnostics v_otps = row_count;

  logs_deleted := v_logs;
  otps_deleted := v_otps;
  return next;
end $$;

revoke all on function public.australia_whv_cleanup_ephemeral_data() from public;
revoke all on function public.australia_whv_cleanup_ephemeral_data() from anon;
revoke all on function public.australia_whv_cleanup_ephemeral_data() from authenticated;
grant execute on function public.australia_whv_cleanup_ephemeral_data() to service_role;

select * from public.australia_whv_cleanup_ephemeral_data();

drop policy if exists "anon read monitor logs" on public.australia_whv_monitor_logs;
create policy "anon read monitor logs"
  on public.australia_whv_monitor_logs
  for select to anon
  using (created_at >= now() - interval '2 days');

create or replace view australia_whv_public_status as
  select last_detected_status, last_detected_raw, last_checked_at, opened_at,
         country_name, official_url, enabled, check_interval_minutes
  from australia_whv_monitor_config
  where singleton_key = 'main';

grant select on australia_whv_public_status to anon;

create or replace view australia_whv_public_config as
  select support_whatsapp_number,
         support_default_message,
         contact_email,
         contact_text,
         about_title,
         about_body,
         landing_trust_text
  from australia_whv_monitor_config
  where singleton_key = 'main';

grant select on australia_whv_public_config to anon;

comment on column australia_whv_monitor_config.support_whatsapp_number is 'Official public support WhatsApp number. Digits or E.164.';
comment on column australia_whv_monitor_config.whatsapp_group_invite_url is 'Manual or Evolution-generated WhatsApp group invite fallback.';
comment on column australia_whv_otps.purpose is 'login = subscriber login, checkout = phone validation before payment.';
comment on column australia_whv_otps.verification_token is 'Short-lived token returned after checkout OTP validation and required by payment creation.';
