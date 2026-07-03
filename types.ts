export type AustraliaWhvDetectedStatus = 'Open' | 'Closed' | 'Paused' | 'Unknown'

export type AustraliaWhvWhatsappStatus =
  | 'unknown'
  | 'created'
  | 'connecting'
  | 'open'
  | 'close'
  | 'disconnected'
  | 'error'

export type AustraliaWhvLogLevel = 'info' | 'success' | 'warning' | 'error'

export interface AustraliaWhvMonitorConfig {
  id: string
  singleton_key: 'main'
  enabled: boolean
  official_url: string
  country_name: string
  check_interval_minutes: number
  whatsapp_instance_name: string
  whatsapp_target_number: string | null
  whatsapp_target_numbers: string[]
  whatsapp_status: AustraliaWhvWhatsappStatus
  whatsapp_last_checked_at: string | null
  last_detected_status: AustraliaWhvDetectedStatus
  last_detected_raw: string | null
  last_checked_at: string | null
  opened_at: string | null
  notified_at: string | null
  auto_pause_after_open: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface AustraliaWhvMonitorLog {
  id: string
  level: AustraliaWhvLogLevel
  action: string
  detected_status: string | null
  message: string
  http_status: number | null
  details: Record<string, unknown>
  created_at: string
}
