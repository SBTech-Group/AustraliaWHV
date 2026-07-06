-- 002 — Perfil do assinante + controle de vencimento (assinatura anual).
-- Produto passou de "pagamento único / vitalício" para ASSINATURA ANUAL com
-- cancelamento a qualquer momento. Assinantes ANTIGOS (compraram vitalício) são
-- preservados: access_expires_at = NULL significa "nunca expira" (grandfathered).
-- Somente novas compras recebem access_expires_at = paid_at + 1 ano.

alter table australia_whv_subscribers
  add column if not exists full_name         text,
  add column if not exists email             text,
  add column if not exists access_expires_at timestamptz;   -- NULL = vitalício (legado)

-- Índice p/ o cron/gate de acesso encontrar rápido quem está por vencer/vencido.
create index if not exists idx_whv_subscribers_access_expires
  on australia_whv_subscribers (access_expires_at)
  where access_expires_at is not null;

comment on column australia_whv_subscribers.full_name is 'Nome completo informado no checkout';
comment on column australia_whv_subscribers.email is 'E-mail informado no checkout';
comment on column australia_whv_subscribers.access_expires_at is 'Fim do acesso (assinatura anual). NULL = vitalício (assinantes legados).';
