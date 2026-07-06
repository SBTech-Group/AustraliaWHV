-- 004 — Cadência de verificação: 2 min → 1 min.
-- Obs: a cadência REAL é o agendamento (cron) da função australia-monitor.
-- Esta coluna reflete a intenção/UX; ajuste o cron para rodar a cada 1 min também.

alter table australia_whv_monitor_config
  alter column check_interval_minutes set default 1;

update australia_whv_monitor_config
  set check_interval_minutes = 1
  where singleton_key = 'main';
