import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Activity, CheckCircle2, CreditCard, ExternalLink, LogOut, RefreshCw, Users } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../../../core/auth/AuthContext'
import { countdown, cronStatus, fmtDateTime, relTime } from '../../../lib/cron'
import type { DetectedStatus, MonitorStatus } from '../../../types'

const STATUS_META: Record<DetectedStatus, { label: string; color: string; bg: string }> = {
  Open:    { label: 'Aberto',      color: '#4FCB8E', bg: 'rgba(79,203,142,0.12)' },
  Closed:  { label: 'Fechado',     color: '#F26D70', bg: 'rgba(242,109,112,0.12)' },
  Paused:  { label: 'Pausado',     color: '#E2BE6A', bg: 'rgba(226,190,106,0.12)' },
  Unknown: { label: 'Verificando', color: '#888',    bg: 'rgba(136,136,136,0.10)' },
}

function useMonitorStatus() {
  return useQuery<MonitorStatus | null>({
    queryKey: ['monitor_status'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('australia_whv_public_status')
        .select('enabled, last_detected_status, last_detected_raw, last_checked_at, opened_at, country_name, official_url, check_interval_minutes')
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
  const cron = cronStatus(status?.last_checked_at, status?.check_interval_minutes, status?.enabled, now)

  const nome = subscriber?.full_name?.trim() || subscriber?.phone || 'Assinante'
  const expira = subscriber?.access_expires_at
  const groupInvite = userConfig?.whatsapp_group_invite_url?.trim() || ''

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <div className="monitor-shell">
      <header className="monitor-topbar">
        <div className="monitor-topbar-left">
          <span className="logo-flag">🇦🇺</span>
          <span className="monitor-title">Monitor WHV</span>
        </div>
        <div className="monitor-topbar-right">
          <span className="monitor-user">{nome}</span>
          <button className="btn-icon" onClick={handleLogout} title="Sair">
            <LogOut size={16} strokeWidth={1.75} />
          </button>
        </div>
      </header>

      <main className="monitor-main">
        <div className="status-card">
          {isLoading ? (
            <div className="loading-row"><RefreshCw size={16} className="spin" /> Carregando...</div>
          ) : (
            <>
              <div className="status-card-header">
                <div>
                  <div className="status-label">Status atual - {status?.country_name ?? 'Brazil'}</div>
                  <div className="status-badge" style={{ color: meta.color, background: meta.bg }}>
                    <span className="status-dot-live" style={{ background: meta.color }} />
                    {meta.label}
                  </div>
                </div>
              </div>
              {status?.official_url && (
                <a href={status.official_url} target="_blank" rel="noopener noreferrer" className="btn-outline-sm">
                  <ExternalLink size={13} /> Ver site oficial
                </a>
              )}
            </>
          )}
        </div>

        <div className="status-card">
          <div className="status-label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Activity size={14} /> Automação
          </div>
          <div className="status-badge" style={{
            marginTop: 8,
            color: cron.healthy ? '#4FCB8E' : '#E2BE6A',
            background: cron.healthy ? 'rgba(79,203,142,0.12)' : 'rgba(226,190,106,0.12)',
          }}>
            <span className="status-dot-live" style={{ background: cron.healthy ? '#4FCB8E' : '#E2BE6A' }} />
            {cron.healthy ? 'Funcionando' : cron.label}
          </div>
          <div className="status-card-meta" style={{ marginTop: 12 }}>
            <div className="meta-row"><RefreshCw size={12} /> Última verificação: {fmtDateTime(cron.lastAt)} ({relTime(cron.lastAt, now)})</div>
            {cron.nextAt && (
              <div className="cron-next">
                <span>Próxima verificação</span>
                <strong>{countdown(cron.nextAt, now)}</strong>
                <small>{relTime(cron.nextAt, now)}</small>
              </div>
            )}
            <div className="meta-row muted">Verificação a cada {status?.check_interval_minutes ?? 1} min - 24h</div>
          </div>
        </div>

        <div className="status-card">
          <div className="access-card-row">
            <div>
              <div className="status-label">Seu acesso</div>
              <div className="sub-v" style={{ color: '#4FCB8E', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <CheckCircle2 size={14} /> Ativo
              </div>
              <div className="meta-row muted" style={{ justifyContent: 'flex-start', marginTop: 6 }}>
                {expira ? `Renova/expira em ${fmtDateTime(expira)}` : 'Acesso vitalício'}
              </div>
              <div className="meta-row muted" style={{ justifyContent: 'flex-start', marginTop: 4 }}>
                <Users size={12} /> Grupo: {subscriber?.in_group ? 'adicionado' : 'pendente'}
              </div>
            </div>
            <div className="access-actions">
              {!subscriber?.in_group && groupInvite && (
                <a className="btn-outline-sm" href={groupInvite} target="_blank" rel="noopener noreferrer">
                  <Users size={13} /> Entrar no grupo
                </a>
              )}
              <button className="btn-outline-sm" onClick={() => navigate('/monitor/plano')}>
                <CreditCard size={13} /> Gerenciar assinatura
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
