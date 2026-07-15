import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Activity, CheckCircle2, CreditCard, ExternalLink, LogOut, MessageCircle, RefreshCw, Users } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../../../core/auth/AuthContext'
import { countdown, cronStatus, fmtDateTime, relTime } from '../../../lib/cron'
import { whatsappUrl } from '../../../lib/contact'
import type { DetectedStatus, MonitorStatus } from '../../../types'

const STATUS_META: Record<DetectedStatus, { label: string; color: string; bg: string }> = {
  Open: { label: 'Aberto', color: '#4FCB8E', bg: 'rgba(79,203,142,0.12)' },
  Closed: { label: 'Fechado', color: '#F26D70', bg: 'rgba(242,109,112,0.12)' },
  Paused: { label: 'Pausado', color: '#E2BE6A', bg: 'rgba(226,190,106,0.12)' },
  Unknown: { label: 'Verificando', color: '#888', bg: 'rgba(136,136,136,0.10)' },
}

const STATUS_COPY: Record<DetectedStatus, { title: string; text: string }> = {
  Open: {
    title: 'A cota pode estar aberta agora',
    text: 'Entre no site oficial e confira imediatamente. O alerta também foi enviado no grupo.',
  },
  Closed: {
    title: 'Nenhuma vaga disponível no momento',
    text: 'Você continua coberto: o monitor segue verificando e avisa quando houver mudança.',
  },
  Paused: {
    title: 'Monitoramento pausado pela equipe',
    text: 'Quando a checagem voltar, o painel e o grupo continuam sendo os canais principais.',
  },
  Unknown: {
    title: 'Estamos conferindo o status',
    text: 'Se a fonte oficial oscilar, o sistema tenta novamente no próximo ciclo.',
  },
}

function useMonitorStatus() {
  return useQuery<MonitorStatus | null>({
    queryKey: ['monitor_status'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('australia_whv_public_status')
        .select('enabled, last_detected_status, last_detected_raw, last_checked_at, opened_at, country_name, official_url, check_interval_minutes, group_member_count')
        .maybeSingle()
      if (error) throw error
      return data as MonitorStatus | null
    },
    refetchInterval: 20_000,
  })
}

export function MonitorPage() {
  const { subscriber, userConfig, logout } = useAuth()
  const navigate = useNavigate()
  const { data: status, isLoading } = useMonitorStatus()
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const detected = (status?.last_detected_status ?? 'Unknown') as DetectedStatus
  const meta = STATUS_META[detected]
  const statusCopy = STATUS_COPY[detected]
  const cron = cronStatus(status?.last_checked_at, status?.check_interval_minutes, status?.enabled, now)

  const nome = subscriber?.full_name?.trim() || subscriber?.phone || 'Assinante'
  const expira = subscriber?.access_expires_at
  const inGroup = Boolean(subscriber?.in_group)
  const groupInvite = userConfig?.whatsapp_group_invite_url?.trim() || ''
  const supportHref = whatsappUrl(userConfig?.support_whatsapp_number, userConfig?.support_default_message)
  const groupCount = Number(status?.group_member_count ?? 0)

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <div className="monitor-shell">
      <header className="monitor-topbar">
        <div className="monitor-topbar-left">
          <span className="logo-flag">🇦🇺</span>
          <span className="monitor-title">Monitor WHV Austrália</span>
        </div>
        <div className="monitor-topbar-right">
          <span className="monitor-user">{nome}</span>
          <button className="btn-icon" onClick={handleLogout} title="Sair">
            <LogOut size={16} strokeWidth={1.75} />
          </button>
        </div>
      </header>

      <main className="monitor-main monitor-main-wide">
        {isLoading ? (
          <div className="status-card">
            <div className="loading-row"><RefreshCw size={16} className="spin" /> Carregando painel...</div>
          </div>
        ) : (
          <>
            <section className="status-card monitor-hero-card">
              <div>
                <div className="status-label">Status atual - {status?.country_name ?? 'Brazil'}</div>
                <h1 className="monitor-hero-title">{statusCopy.title}</h1>
                <p className="monitor-hero-copy">{statusCopy.text}</p>
                <div className="monitor-hero-actions">
                  {status?.official_url && (
                    <a href={status.official_url} target="_blank" rel="noopener noreferrer" className="btn-outline-sm">
                      <ExternalLink size={13} /> Abrir site oficial
                    </a>
                  )}
                  <button className="btn-outline-sm" onClick={() => navigate('/monitor/plano')}>
                    <CreditCard size={13} /> Minha assinatura
                  </button>
                </div>
              </div>
              <div className="monitor-hero-status">
                <div className="status-badge" style={{ color: meta.color, background: meta.bg }}>
                  <span className="status-dot-live" style={{ background: meta.color }} />
                  {meta.label}
                </div>
                {status?.opened_at && detected === 'Open' && (
                  <small>Aberto desde {fmtDateTime(status.opened_at)}</small>
                )}
              </div>
            </section>

            <section className="monitor-grid-2">
              <div className="status-card monitor-info-card">
                <div className="status-label"><Activity size={14} /> Monitoramento 24h</div>
                <div className="monitor-info-main" style={{ color: cron.healthy ? '#4FCB8E' : '#E2BE6A' }}>
                  {cron.healthy ? 'Funcionando' : cron.label}
                </div>
                <div className="monitor-info-list">
                  <div><span>Última checagem</span><strong>{fmtDateTime(cron.lastAt)}</strong></div>
                  {cron.nextAt && <div><span>Próxima checagem</span><strong>{countdown(cron.nextAt, now)}</strong></div>}
                  <div><span>Cadência</span><strong>A cada {status?.check_interval_minutes ?? 1} min</strong></div>
                </div>
                <div className="meta-row muted" style={{ justifyContent: 'flex-start', marginTop: 10 }}>
                  {relTime(cron.lastAt, now)}
                </div>
              </div>

              <div className="status-card monitor-info-card">
                <div className="status-label"><Users size={14} /> Grupo de alertas</div>
                <div className="monitor-info-main" style={{ color: inGroup ? '#4FCB8E' : '#E2BE6A' }}>
                  {inGroup ? 'Você está no grupo' : 'Entrada pendente'}
                </div>
                <p className="monitor-hero-copy">
                  {groupCount > 0 ? `${groupCount} assinante(s) participando do grupo.` : 'O grupo é o canal principal dos alertas.'}
                </p>
                {!inGroup && groupInvite && (
                  <a className="btn-outline-sm" href={groupInvite} target="_blank" rel="noopener noreferrer">
                    <Users size={13} /> Entrar no grupo
                  </a>
                )}
              </div>
            </section>

            <section className="status-card">
              <div className="access-card-row">
                <div>
                  <div className="status-label">Seu acesso</div>
                  <div className="sub-v ok-inline">
                    <CheckCircle2 size={14} /> Ativo
                  </div>
                  <div className="meta-row muted" style={{ justifyContent: 'flex-start', marginTop: 8 }}>
                    {expira ? `Válido até ${fmtDateTime(expira)}` : 'Acesso sem vencimento definido'}
                  </div>
                  <div className="meta-row muted" style={{ justifyContent: 'flex-start', marginTop: 4 }}>
                    Login e alertas vinculados ao WhatsApp {subscriber?.phone}
                  </div>
                </div>
                <div className="access-actions">
                  {supportHref && (
                    <a className="btn-outline-sm" href={supportHref} target="_blank" rel="noopener noreferrer">
                      <MessageCircle size={13} /> Suporte
                    </a>
                  )}
                  <button className="btn-outline-sm" onClick={() => navigate('/monitor/plano')}>
                    <CreditCard size={13} /> Plano
                  </button>
                </div>
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  )
}
