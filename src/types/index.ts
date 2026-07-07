export type DetectedStatus = 'Open' | 'Closed' | 'Paused' | 'Unknown'
export type LogLevel = 'info' | 'success' | 'warning' | 'error'

export interface MonitorStatus {
  enabled: boolean
  last_detected_status: DetectedStatus
  last_detected_raw: string | null
  last_checked_at: string | null
  opened_at: string | null
  country_name: string
  official_url: string
  check_interval_minutes: number
}

export interface MonitorLog {
  id: string
  level: LogLevel
  action: string
  detected_status: string | null
  message: string
  created_at: string
}

export interface Subscriber {
  id: string
  phone: string
  full_name: string | null
  active: boolean
  paid_at: string
  access_expires_at: string | null   // NULL = vitalício (assinantes legados)
  session_expires_at: string
}

// ── Admin ─────────────────────────────────────────────────────────────────────
export type WhatsappStatus = 'unknown' | 'created' | 'connecting' | 'open' | 'close' | 'disconnected' | 'error'

export interface MonitorConfig {
  singleton_key: string
  enabled: boolean
  official_url: string
  country_name: string
  check_interval_minutes: number
  whatsapp_instance_name: string
  whatsapp_status: WhatsappStatus
  whatsapp_last_checked_at: string | null
  whatsapp_group_jid: string | null
  whatsapp_group_name: string | null
  whatsapp_group_invite_url: string | null
  last_detected_status: DetectedStatus
  last_detected_raw: string | null
  last_checked_at: string | null
  opened_at: string | null
  notified_at: string | null
  created_at: string
  updated_at: string
}

export interface AdminStats {
  active: number
  in_group: number
  overdue: number
}

// Grupo do WhatsApp (Evolution) exibido no seletor do /admin.
export interface WhatsappGroup {
  jid: string
  name: string
  size: number
}

// Assinante na tabela de gestão do /admin.
export interface AdminSubscriber {
  id: string
  phone: string
  full_name: string | null
  active: boolean
  in_group: boolean
  access_expires_at: string | null
  overdue: boolean            // access_expires_at < now
}
