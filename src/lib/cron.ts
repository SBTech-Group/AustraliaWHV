// Estado da automação (cron) inferido a partir da última verificação.
// Usado em /admin e /monitor p/ mostrar "Ativo · última X · próxima ~Y".

export type CronState = 'active' | 'stale' | 'off' | 'unknown'

export interface CronStatus {
  state: CronState
  label: string
  healthy: boolean
  lastAt: Date | null
  nextAt: Date | null
}

export function cronStatus(
  lastCheckedAt: string | null | undefined,
  intervalMinutes: number | null | undefined,
  enabled: boolean | null | undefined,
): CronStatus {
  const interval = Math.max(1, Number(intervalMinutes) || 1)
  const last = lastCheckedAt ? new Date(lastCheckedAt) : null

  if (!enabled) return { state: 'off', label: 'Monitoramento desligado', healthy: false, lastAt: last, nextAt: null }
  if (!last) return { state: 'unknown', label: 'Aguardando primeira verificação', healthy: false, lastAt: null, nextAt: null }

  const ageMin = (Date.now() - last.getTime()) / 60_000
  const graceMin = interval * 2 + 1
  const healthy = ageMin <= graceMin
  const nextAt = new Date(last.getTime() + interval * 60_000)

  return {
    state: healthy ? 'active' : 'stale',
    label: healthy ? 'Ativo' : 'Parado — verifique o agendamento (cron)',
    healthy,
    lastAt: last,
    nextAt,
  }
}

// "há 12s" / "há 3 min" / "em 45s" (negativo = passado).
export function relTime(d: Date | null): string {
  if (!d) return '—'
  const diffMs = d.getTime() - Date.now()
  const past = diffMs < 0
  const s = Math.round(Math.abs(diffMs) / 1000)
  const txt = s < 60 ? `${s}s` : s < 3600 ? `${Math.round(s / 60)} min` : `${Math.round(s / 3600)}h`
  return past ? `há ${txt}` : `em ${txt}`
}

export function fmtDateTime(d: Date | string | null): string {
  if (!d) return '—'
  const date = typeof d === 'string' ? new Date(d) : d
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(date)
}
