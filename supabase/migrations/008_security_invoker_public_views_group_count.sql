-- 008 - Public views without SECURITY DEFINER and public group count.

drop view if exists public.australia_whv_public_status;
drop view if exists public.australia_whv_public_config;

update public.australia_whv_monitor_config
set
  contact_text = 'Fale com o suporte se tiver qualquer problema com pagamento, acesso ao painel ou entrada no grupo de alertas.',
  about_body = 'O Monitor WHV Austrália acompanha o status oficial do Work and Holiday Visa para brasileiros e envia avisos pelo WhatsApp quando houver mudança relevante.',
  landing_trust_text = 'Você confirma o WhatsApp antes de pagar. Com o pagamento aprovado, o acesso ao painel e ao grupo de alertas fica disponível no mesmo número.'
where singleton_key = 'main';

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
  instagram_url
) on table public.australia_whv_monitor_config to anon;

grant select (active, in_group)
  on table public.australia_whv_subscribers to anon;

drop policy if exists "anon read public monitor config" on public.australia_whv_monitor_config;
create policy "anon read public monitor config"
  on public.australia_whv_monitor_config
  for select to anon
  using (singleton_key = 'main');

drop policy if exists "anon read public group stats" on public.australia_whv_subscribers;
create policy "anon read public group stats"
  on public.australia_whv_subscribers
  for select to anon
  using (active is true and in_group is true);

create view public.australia_whv_public_status
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
      select count(s.active)::int
      from public.australia_whv_subscribers s
      where s.active is true
        and s.in_group is true
    ) as group_member_count
  from public.australia_whv_monitor_config c
  where c.singleton_key = 'main';

grant select on public.australia_whv_public_status to anon;

create view public.australia_whv_public_config
with (security_invoker = true) as
  select
    support_whatsapp_number,
    support_default_message,
    contact_text,
    about_body,
    landing_trust_text,
    instagram_url
  from public.australia_whv_monitor_config
  where singleton_key = 'main';

grant select on public.australia_whv_public_config to anon;

comment on view public.australia_whv_public_status is 'Safe public monitor status view. Uses security_invoker and column grants.';
comment on view public.australia_whv_public_config is 'Safe public landing contact/config view. Uses security_invoker and column grants.';
