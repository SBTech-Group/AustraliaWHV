// Hooks admin — chamam a Edge Function australia-monitor.
// supabase.functions.invoke anexa o JWT da sessão Supabase Auth (admin) no
// Authorization automaticamente → a função valida como admin.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../../lib/supabase'
import type { AdminStats, AdminSubscriber, MonitorConfig, MonitorLog, WhatsappGroup } from '../../../types'

const KEY_CFG = 'admin_monitor_config'
const KEY_LOGS = 'admin_monitor_logs'
const KEY_SUBS = 'admin_subscribers'
const KEY_GROUPS = 'admin_groups'

async function invoke<T = Record<string, unknown>>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('australia-monitor', { body })
  if (error) throw error
  if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error)
  return data as T
}

export function useAdminConfig() {
  return useQuery({
    queryKey: [KEY_CFG],
    queryFn: () => invoke<{ config: MonitorConfig; stats: AdminStats }>({ action: 'get_config' }),
    refetchInterval: 20_000,
  })
}

export function useAdminLogs() {
  return useQuery({
    queryKey: [KEY_LOGS],
    queryFn: async () => (await invoke<{ logs: MonitorLog[] }>({ action: 'logs' })).logs ?? [],
    refetchInterval: 20_000,
  })
}

// Assinantes (tabela de gestão) — poll 20s.
export function useSubscribers() {
  return useQuery({
    queryKey: [KEY_SUBS],
    queryFn: async () => (await invoke<{ subscribers: AdminSubscriber[] }>({ action: 'list_subscribers' })).subscribers ?? [],
    refetchInterval: 20_000,
  })
}

// Grupos da Evolution — só busca quando o seletor é aberto (enabled); mudam raramente.
export function useGroups(enabled: boolean) {
  return useQuery({
    queryKey: [KEY_GROUPS],
    queryFn: async () => (await invoke<{ groups: WhatsappGroup[] }>({ action: 'list_groups' })).groups ?? [],
    enabled,
    staleTime: 60_000,
  })
}

export function useAdminAction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => invoke(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY_CFG] })
      qc.invalidateQueries({ queryKey: [KEY_LOGS] })
      qc.invalidateQueries({ queryKey: [KEY_SUBS] })
    },
  })
}

// Poll silencioso do estado da conexão (durante o QR) — sem invalidar/logar.
export async function pollWhatsappState(): Promise<string> {
  const data = await invoke<{ status?: string }>({ action: 'state_instance', silent: true })
  return String(data?.status ?? 'unknown')
}
