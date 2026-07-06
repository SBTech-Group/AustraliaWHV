// Helpers Evolution API (v2) — mensagens + gestão de GRUPO.
// Compartilhado por: australia-monitor (alerta no grupo + ações admin),
// australia-mp-webhook (add pagante ao grupo), australia-access (add/remove no cut/extend).

const base = () => (Deno.env.get('EVOLUTION_API_URL') ?? '').replace(/\/$/, '')
const apiKey = () => Deno.env.get('EVOLUTION_API_KEY') ?? ''

export interface EvoRes<T = unknown> { ok: boolean; status: number; data: T }

export async function evoFetch<T = unknown>(path: string, options: RequestInit = {}): Promise<EvoRes<T>> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 20000)
  try {
    const res = await fetch(`${base()}${path}`, {
      ...options,
      signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', apikey: apiKey(), ...(options.headers ?? {}) },
    })
    const text = await res.text()
    let data: unknown
    try { data = JSON.parse(text) } catch { data = { raw: text } }
    return { ok: res.ok, status: res.status, data: data as T }
  } catch (err) {
    return { ok: false, status: 0, data: { error: String(err) } as T }
  } finally {
    clearTimeout(timer)
  }
}

export function isEvoConfigured(): boolean {
  return !!base() && !!apiKey()
}

// Só dígitos → JID de contato. Ex: '+55 11 9...' → '5511...@s.whatsapp.net'.
export function numberToJid(phone: string): string {
  const n = phone.replace(/\D/g, '')
  return `${n}@s.whatsapp.net`
}

// Envia texto p/ um contato OU grupo (aceita number = '55..' ou '<jid>@g.us').
export async function sendText(instance: string, numberOrJid: string, text: string) {
  return await evoFetch(`/message/sendText/${instance}`, {
    method: 'POST',
    body: JSON.stringify({ number: numberOrJid, text }),
  })
}

export interface EvoGroup { jid: string; name: string; size: number }

// Lista todos os grupos da instância (sem participantes — mais leve).
export async function fetchGroups(instance: string): Promise<{ ok: boolean; groups: EvoGroup[]; status: number; data: unknown }> {
  const res = await evoFetch<unknown>(`/group/fetchAllGroups/${instance}?getParticipants=false`)
  const arr = Array.isArray(res.data) ? res.data as Record<string, unknown>[] : []
  const groups: EvoGroup[] = arr.map((g) => ({
    jid: String(g.id ?? g.jid ?? ''),
    name: String(g.subject ?? g.name ?? '(sem nome)'),
    size: Number(g.size ?? (Array.isArray(g.participants) ? g.participants.length : 0)) || 0,
  })).filter((g) => g.jid)
  return { ok: res.ok, groups, status: res.status, data: res.data }
}

// Adiciona/remove participantes. numbers = telefones (só dígitos) ou jids.
async function updateParticipants(instance: string, groupJid: string, action: 'add' | 'remove', numbers: string[]) {
  const participants = numbers.map((n) => (n.includes('@') ? n : numberToJid(n)))
  return await evoFetch(`/group/updateParticipant/${instance}?groupJid=${encodeURIComponent(groupJid)}`, {
    method: 'POST',
    body: JSON.stringify({ action, participants }),
  })
}

export async function addParticipants(instance: string, groupJid: string, numbers: string[]) {
  return await updateParticipants(instance, groupJid, 'add', numbers)
}
export async function removeParticipants(instance: string, groupJid: string, numbers: string[]) {
  return await updateParticipants(instance, groupJid, 'remove', numbers)
}

// Link de convite do grupo (fallback quando o add automático falha por privacidade).
export async function groupInviteUrl(instance: string, groupJid: string): Promise<string | null> {
  const res = await evoFetch<Record<string, unknown>>(`/group/inviteCode/${instance}?groupJid=${encodeURIComponent(groupJid)}`)
  if (!res.ok) return null
  const url = res.data?.inviteUrl ?? (res.data?.inviteCode ? `https://chat.whatsapp.com/${res.data.inviteCode}` : null)
  return url ? String(url) : null
}
