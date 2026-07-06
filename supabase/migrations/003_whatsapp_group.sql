-- 003 — Modelo de GRUPO WhatsApp (anti-ban).
-- Em vez de enviar 1 DM por assinante no Open (rajada → risco de ban da instância
-- Evolution), todos os assinantes ficam num GRUPO e o alerta é 1 única mensagem
-- postada no grupo. Novos pagantes são adicionados ao grupo automaticamente.

-- ── Config: grupo escolhido ────────────────────────────────────────────────────
alter table australia_whv_monitor_config
  add column if not exists whatsapp_group_jid        text,   -- ex: 12036304@g.us
  add column if not exists whatsapp_group_name       text,
  add column if not exists whatsapp_group_invite_url text;   -- link de convite (fallback)

-- ── Assinante: está no grupo? ──────────────────────────────────────────────────
alter table australia_whv_subscribers
  add column if not exists in_group       boolean not null default false,
  add column if not exists group_added_at timestamptz;

-- ── Limpeza de legado (modelo antigo de DM por lista) ──────────────────────────
alter table australia_whv_monitor_config
  drop column if exists whatsapp_target_number,
  drop column if exists whatsapp_target_numbers,
  drop column if exists auto_pause_after_open;

comment on column australia_whv_monitor_config.whatsapp_group_jid is 'JID do grupo WhatsApp onde os alertas são postados (Evolution).';
comment on column australia_whv_subscribers.in_group is 'Assinante já adicionado ao grupo WhatsApp.';
