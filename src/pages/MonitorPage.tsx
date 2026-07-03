import { useQuery } from '@tanstack/react-query'
import { Bell, ExternalLink, LogOut, RefreshCw } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'
import type { DetectedStatus, MonitorLog, MonitorStatus } from '../types'

const STATUS_META: Record<DetectedStatus, { label: string; color: string; bg: string }> = {
  Open:    { label: 'Aberto',     color: '#4FCB8E', bg: 'rgba(79,203,142,0.12)' },
  Closed:  { label: 'Fechado',    color: '#F26D70', bg: 'rgba(242,109,112,0.12)' },
  Paused:  { label: 'Pausado',    color: '#E2BE6A', bg: 'rgba(226,190,106,0.12)' },
  Unknown: { label: 'Verificando', color: '#888',   bg: 'rgba(136,136,136,0.10)' },
}

const LOG_COLORS: Record<string, string> = {
  success: '#4FCB8E',
  warning: '#E2BE6A',
  error:   '#F26D70',
  info:    '#6B8EFF',
}

function useMonitorStatus() {
  return useQuery<MonitorStatus | null>({
    queryKey: ['monitor_status'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('australia_whv_monitor_config')
        .select('enabled, last_detected_status, last_detected_raw, last_checked_at, opened_at, country_name, official_url')
        .eq('singleton_key', 'main')
        .maybeSingle()
      if (error) throw error
      return data as MonitorStatus | null
    },
    refetchInterval: 30_000,
  })
}

function useMonitorLogs() {
  return useQuery<MonitorLog[]>({
    queryKey: ['monitor_logs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('australia_whv_monitor_logs')
        .select('id, level, action, detected_status, message, created_at')
        .order('created_at', { ascending: false })
        .limit(50)
      if (error) throw error
      return (data ?? []) as MonitorLog[]
    },
    refetchInterval: 30_000,
  })
}

function fmtDate(iso: string | null) {
  if (!iso) return '—'
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Sao_Paulo',
  }).format(new Date(iso))
}

export function MonitorPage() {
  const { subscriber, logout } = useAuth()
  const navigate = useNavigate()
  const { data: status, isLoading: loadingStatus, dataUpdatedAt } = useMonitorStatus()
  const { data: logs, isLoading: loadingLogs } = useMonitorLogs()

  const detected = (status?.last_detected_status ?? 'Unknown') as DetectedStatus
  const meta = STATUS_META[detected]

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <div className="monitor-shell">
      {/* TOPBAR */}
      <header className="monitor-topbar">
        <div className="monitor-topbar-left">
          <span className="logo-flag">🇦🇺</span>
          <span className="monitor-title">Monitor WHV</span>
        </div>
        <div className="monitor-topbar-right">
          <span className="monitor-phone">{subscriber?.phone}</span>
          <button className="btn-icon" onClick={handleLogout} title="Sair">
            <LogOut size={16} strokeWidth={1.75} />
          </button>
        </div>
      </header>

      <main className="monitor-main">
        {/* STATUS CARD */}
        <div className="status-card">
          {loadingStatus ? (
            <div className="loading-row"><RefreshCw size={16} className="spin" /> Carregando...</div>
          ) : (
            <>
              <div className="status-card-header">
                <div>
                  <div className="status-label">Status atual — {status?.country_name ?? 'Brasil'}</div>
                  <div className="status-badge" style={{ color: meta.color, background: meta.bg }}>
                    <span className="status-dot-live" style={{ background: meta.color }} />
                    {meta.label}
                  </div>
                </div>
                <div className="status-card-meta">
                  <div className="meta-row">
                    <RefreshCw size={12} />
                    <span>Verificado em {fmtDate(status?.last_checked_at ?? null)}</span>
                  </div>
                  {status?.opened_at && (
                    <div className="meta-row" style={{ color: '#4FCB8E' }}>
                      <Bell size={12} />
                      <span>Aberto desde {fmtDate(status.opened_at)}</span>
                    </div>
                  )}
                  {dataUpdatedAt > 0 && (
                    <div className="meta-row muted">
                      Painel atualizado em {fmtDate(new Date(dataUpdatedAt).toISOString())}
                    </div>
                  )}
                </div>
              </div>

              {status?.last_detected_raw && (
                <div className="status-raw">
                  <span className="status-raw-label">Texto detectado:</span>
                  <span className="status-raw-value">"{status.last_detected_raw}"</span>
                </div>
              )}

              {status?.official_url && (
                <a
                  href={status.official_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-outline-sm"
                >
                  <ExternalLink size={13} />
                  Ver site oficial
                </a>
              )}
            </>
          )}
        </div>

        {/* LOGS */}
        <div className="logs-card">
          <div className="logs-header">
            <h2>Histórico de verificações</h2>
            <span className="logs-count">{logs?.length ?? 0} registros</span>
          </div>

          {loadingLogs ? (
            <div className="loading-row"><RefreshCw size={16} className="spin" /> Carregando logs...</div>
          ) : !logs?.length ? (
            <div className="logs-empty">Nenhum registro ainda.</div>
          ) : (
            <div className="logs-list">
              {logs.map(log => (
                <div key={log.id} className="log-row">
                  <div
                    className="log-level"
                    style={{ color: LOG_COLORS[log.level] ?? '#888' }}
                  >
                    {log.level}
                  </div>
                  <div className="log-body">
                    <div className="log-message">{log.message}</div>
                    {log.detected_status && (
                      <div className="log-status">Status: {log.detected_status}</div>
                    )}
                  </div>
                  <div className="log-time">{fmtDate(log.created_at)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
