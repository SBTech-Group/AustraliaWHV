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
  group_member_count?: number | null
  active_subscriber_count?: number | null
}

export interface MonitorLog {
  id: string
  level: LogLevel
  action: string
  detected_status: string | null
  message: string
  http_status: number | null
  details: Record<string, unknown> | null
  created_at: string
}

export interface Subscriber {
  id: string
  phone: string
  full_name: string | null
  active: boolean
  in_group: boolean
  group_added_at: string | null
  group_access_status: 'not_requested' | 'auto_added' | 'invite_pending' | 'invite_sent' | 'active' | 'removed' | 'error'
  group_access_method: string | null
  group_access_error: string | null
  group_joined_at: string | null
  group_invite_sent_at: string | null
  group_invite_attempts: number
  paid_at: string
  access_expires_at: string | null   // NULL = vitalício (assinantes legados)
  session_expires_at: string
}

export interface UserRuntimeConfig {
  support_whatsapp_number: string | null
  support_default_message: string | null
  contact_text: string | null
  instagram_url: string | null
  whatsapp_group_name: string | null
}

export interface PublicConfig {
  support_whatsapp_number: string | null
  support_default_message: string | null
  contact_text: string
  about_body: string
  landing_trust_text: string
  instagram_url: string | null
  show_landing_subscriber_count?: boolean | null
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
  support_whatsapp_number: string | null
  support_default_message: string | null
  contact_email: string | null
  contact_text: string | null
  about_title: string | null
  about_body: string | null
  landing_trust_text: string | null
  instagram_url: string | null
  show_landing_subscriber_count: boolean
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
  email: string | null
  status: string
  plan_name: string | null
  provision_status: string | null
  active: boolean
  in_group: boolean
  group_added_at: string | null
  group_access_status: string | null
  group_access_method: string | null
  group_access_error: string | null
  group_joined_at: string | null
  group_invite_sent_at: string | null
  group_invite_attempts: number
  access_expires_at: string | null
  overdue: boolean            // access_expires_at < now
}
