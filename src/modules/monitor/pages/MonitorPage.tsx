import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Activity, CheckCircle2, ExternalLink, LogOut, RefreshCw, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../../../core/auth/AuthContext'
import { useNavigate } from 'react-router-dom'
import { usePlan, cicloLabel } from '../../../lib/plan'
import { cronStatus, fmtDateTime, relTime } from '../../../lib/cron'
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
  const { subscriber, token, logout } = useAuth()
  const navigate = useNavigate()
  const { data: status, isLoading } = useMonitorStatus()
  const { data: plan } = usePlan()
  const [canceling, setCanceling] = useState(false)

  const detected = (status?.last_detected_status ?? 'Unknown') as DetectedStatus
  const meta = STATUS_META[detected]
  const cron = cronStatus(status?.last_checked_at, status?.check_interval_minutes, status?.enabled)

  const nome = subscriber?.full_name?.trim() || subscriber?.phone || 'Assinante'
  const expira = subscriber?.access_expires_at

  const handleLogout = () => { logout(); navigate('/login') }

  async function handleCancel() {
    if (!confirm('Cancelar sua assinatura? Você perderá o acesso ao painel e sairá do grupo de alertas.')) return
    setCanceling(true)
    try {
      const { data, error } = await supabase.functions.invoke('australia-cancel', { body: { session_token: token } })
      if (error || (data as { error?: string })?.error) throw new Error((data as { error?: string })?.error ?? 'Erro ao cancelar')
      toast.success('Assinatura cancelada.')
      logout(); navigate('/login')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao cancelar.')
    } finally {
      setCanceling(false)
    }
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
        {/* STATUS AUSTRÁLIA */}
        <div className="status-card">
          {isLoading ? (
            <div className="loading-row"><RefreshCw size={16} className="spin" /> Carregando...</div>
          ) : (
            <>
              <div className="status-card-header">
                <div>
                  <div className="status-label">Status atual — {status?.country_name ?? 'Brazil'}</div>
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

        {/* AUTOMAÇÃO (CRON) */}
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
            <div className="meta-row"><RefreshCw size={12} /> Última verificação: {fmtDateTime(cron.lastAt)} ({relTime(cron.lastAt)})</div>
            {cron.healthy && cron.nextAt && <div className="meta-row muted">Próxima verificação: {relTime(cron.nextAt)}</div>}
            <div className="meta-row muted">Verificação a cada {status?.check_interval_minutes ?? 1} min · 24h</div>
          </div>
        </div>

        {/* MINHA ASSINATURA */}
        <div className="status-card">
          <div className="status-label">Minha assinatura</div>
          <div className="sub-grid">
            <div><span className="sub-k">Plano</span><span className="sub-v">{plan.name}</span></div>
            <div><span className="sub-k">Valor</span><span className="sub-v">{plan.priceLabel} <small>{cicloLabel(plan.ciclo)}</small></span></div>
            <div>
              <span className="sub-k">Situação</span>
              <span className="sub-v" style={{ color: '#4FCB8E', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <CheckCircle2 size={14} /> Ativo
              </span>
            </div>
            <div>
              <span className="sub-k">{expira ? 'Renova/expira em' : 'Acesso'}</span>
              <span className="sub-v">{expira ? fmtDateTime(expira) : 'Vitalício'}</span>
            </div>
          </div>
          <button className="btn-outline-sm cancel-link" onClick={handleCancel} disabled={canceling}>
            <XCircle size={13} /> {canceling ? 'Cancelando...' : 'Cancelar assinatura'}
          </button>
        </div>
      </main>
    </div>
  )
}
