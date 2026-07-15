import { supabase } from './supabase'

export interface GroupAccessResult {
  ok?: boolean
  in_group?: boolean
  group_access_status?: string
  invite_url?: string | null
  rate_limited?: boolean
  message?: string
  error?: string
}

async function serverErrMsg(error: unknown, fallback: string): Promise<string> {
  const ctx = (error as { context?: Response })?.context
  if (ctx && typeof ctx.json === 'function') {
    try {
      const body = await ctx.json()
      if (body?.error) return String(body.error)
    } catch { /* corpo nao-JSON */ }
  }
  return (error as { message?: string })?.message ?? fallback
}

export async function requestGroupAccess(sessionToken: string): Promise<GroupAccessResult> {
  const { data, error } = await supabase.functions.invoke('australia-group-access', {
    body: { session_token: sessionToken },
  })
  if (error) throw new Error(await serverErrMsg(error, 'Nao foi possivel preparar o convite.'))
  if ((data as GroupAccessResult | null)?.error) throw new Error(String((data as GroupAccessResult).error))
  return data as GroupAccessResult
}
