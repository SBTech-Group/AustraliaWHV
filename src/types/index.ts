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
  active: boolean
  paid_at: string
  session_expires_at: string
}
