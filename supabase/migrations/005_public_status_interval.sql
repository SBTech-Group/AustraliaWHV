-- 005 — Expõe check_interval_minutes na view pública p/ o painel do usuário (/monitor)
-- calcular "próxima verificação" e saber se a automação está ativa.

create or replace view australia_whv_public_status as
  select last_detected_status, last_detected_raw, last_checked_at, opened_at,
         country_name, official_url, enabled, check_interval_minutes
  from australia_whv_monitor_config
  where singleton_key = 'main';

grant select on australia_whv_public_status to anon;
