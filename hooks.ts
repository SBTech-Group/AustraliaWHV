import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from './supabase'
import type { AustraliaWhvMonitorConfig, AustraliaWhvMonitorLog } from './types'

const KEY_CONFIG = 'australia_whv_config'
const KEY_LOGS = 'australia_whv_logs'

export function useAustraliaWhvConfig() {
  return useQuery({
    queryKey: [KEY_CONFIG],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('australia_whv_monitor_config')
        .select('*')
        .eq('singleton_key', 'main')
        .maybeSingle()
      if (error) throw error
      return data as AustraliaWhvMonitorConfig | null
    },
    refetchInterval: 25_000,
  })
}

export function useAustraliaWhvLogs() {
  return useQuery({
    queryKey: [KEY_LOGS],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('australia_whv_monitor_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100)
      if (error) throw error
      return (data ?? []) as AustraliaWhvMonitorLog[]
    },
    refetchInterval: 25_000,
  })
}

export function useAustraliaWhvAction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const { data, error } = await supabase.functions.invoke('hub-australia-whv-monitor', { body })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      return data as Record<string, unknown>
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY_CONFIG] })
      qc.invalidateQueries({ queryKey: [KEY_LOGS] })
    },
  })
}

export async function pollWhatsappState(): Promise<string> {
  const { data, error } = await supabase.functions.invoke('hub-australia-whv-monitor', {
    body: { action: 'state_instance', silent: true },
  })
  if (error) throw error
  return String((data as Record<string, unknown>)?.status ?? 'unknown')
}
