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
  nowMs = Date.now(),
): CronStatus {
  const interval = Math.max(1, Number(intervalMinutes) || 1)
  const last = lastCheckedAt ? new Date(lastCheckedAt) : null

  if (!enabled) return { state: 'off', label: 'Monitoramento desligado', healthy: false, lastAt: last, nextAt: null }
  if (!last) return { state: 'unknown', label: 'Aguardando primeira verificação', healthy: false, lastAt: null, nextAt: null }

  const ageMin = (nowMs - last.getTime()) / 60_000
  const graceMin = interval * 2 + 1
  const healthy = ageMin <= graceMin
  const nextAt = new Date(last.getTime() + interval * 60_000)

  return {
    state: healthy ? 'active' : 'stale',
    label: healthy ? 'Ativo' : 'Parado - verifique o agendamento (cron)',
    healthy,
    lastAt: last,
    nextAt,
  }
}

export function relTime(d: Date | null, nowMs = Date.now()): string {
  if (!d) return '-'
  const diffMs = d.getTime() - nowMs
  const past = diffMs < 0
  const s = Math.round(Math.abs(diffMs) / 1000)
  const txt = s < 60 ? `${s}s` : s < 3600 ? `${Math.round(s / 60)} min` : `${Math.round(s / 3600)}h`
  return past ? `há ${txt}` : `em ${txt}`
}

export function countdown(d: Date | null, nowMs = Date.now()): string {
  if (!d) return '--:--'
  const total = Math.max(0, Math.ceil((d.getTime() - nowMs) / 1000))
  const min = Math.floor(total / 60)
  const sec = total % 60
  return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

export function fmtDateTime(d: Date | string | null): string {
  if (!d) return '-'
  const date = typeof d === 'string' ? new Date(d) : d
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(date)
}
