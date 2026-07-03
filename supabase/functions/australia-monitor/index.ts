// australia-monitor — motor do produto (scrape + notificação por assinante) e
// ações de ADMIN (config + instância WhatsApp).
//
// Auth:
//   - Cron: header x-cron-secret == AUSTRALIA_SAAS_CRON_SECRET → só check_now.
//   - Admin: Supabase Auth JWT (email/senha). Assinantes usam OTP custom, NÃO têm
//     conta Supabase Auth → qualquer getUser() válido = admin. ADMIN_EMAILS (csv)
//     opcional restringe ainda mais.
//
// Notificação: ao detectar Open, envia 1 msg para CADA assinante ativo com
// notified_at nulo (throttle) e marca notified_at NA LINHA DO ASSINANTE. Sem
// rajada, sem single-fire global — quem entra depois também é avisado.
//
// Deploy: supabase functions deploy australia-monitor --no-verify-jwt

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
}
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const NOTIFY_THROTTLE_MS = 1200   // intervalo entre envios (anti-ban básico)

type DetectedStatus = 'Open' | 'Closed' | 'Paused' | 'Unknown'

function alertMessage(url: string) {
  return `🚨 *AUSTRÁLIA WHV ABRIU PARA O BRASIL!*

O status do Work and Holiday (subclass 462) mudou para *Aberto*.

Entre AGORA no ImmiAccount e tente submeter/pagar a sua aplicação — as vagas são limitadas e podem fechar rápido.

Página oficial: ${url}`
}
const TEST_MESSAGE = `✅ Teste do Monitor WHV Austrália. Se você recebeu isto, os alertas estão funcionando.`

// ── Evolution ─────────────────────────────────────────────────────────────────
function evoUrl(path: string) {
  return `${(Deno.env.get('EVOLUTION_API_URL') ?? '').replace(/\/$/, '')}${path}`
}
async function evoFetch(path: string, options: RequestInit = {}) {
  const apiKey = Deno.env.get('EVOLUTION_API_KEY') ?? ''
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 15000)
  try {
    const res = await fetch(evoUrl(path), {
      ...options,
      signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', apikey: apiKey, ...(options.headers ?? {}) },
    })
    const text = await res.text()
    let data: unknown
    try { data = JSON.parse(text) } catch { data = { raw: text } }
    return { ok: res.ok, status: res.status, data }
  } catch (err) {
    return { ok: false, status: 0, data: { error: String(err) } }
  } finally {
    clearTimeout(timer)
  }
}
function mapEvoStatus(s: string) {
  switch (s.toLowerCase()) {
    case 'open': return 'open'
    case 'connecting': return 'connecting'
    case 'close': return 'close'
    case 'qr': return 'connecting'
    default: return 'disconnected'
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  async function log(level: string, action: string, opts: { detected_status?: string | null; message: string; http_status?: number | null; details?: Record<string, unknown> }) {
    try {
      await supabase.from('australia_whv_monitor_logs').insert({
        level, action,
        detected_status: opts.detected_status ?? null,
        message: opts.message,
        http_status: opts.http_status ?? null,
        details: opts.details ?? {},
      })
    } catch { /* nunca derruba a ação */ }
  }

  async function getConfig() {
    const { data } = await supabase.from('australia_whv_monitor_config').select('*').eq('singleton_key', 'main').maybeSingle()
    if (data) return data as Record<string, unknown>
    const { data: created } = await supabase.from('australia_whv_monitor_config').insert({ singleton_key: 'main' }).select().single()
    return (created ?? {}) as Record<string, unknown>
  }
  async function patchConfig(patch: Record<string, unknown>) {
    const { data } = await supabase.from('australia_whv_monitor_config').update(patch).eq('singleton_key', 'main').select().single()
    return (data ?? {}) as Record<string, unknown>
  }

  async function sendText(instance: string, number: string, text: string) {
    return await evoFetch(`/message/sendText/${instance}`, { method: 'POST', body: JSON.stringify({ number, text }) })
  }
  async function connectionState(instance: string) {
    const res = await evoFetch(`/instance/connectionState/${instance}`)
    const raw = res.data as Record<string, any>
    return { ok: res.ok, status: mapEvoStatus(String(raw?.instance?.state ?? raw?.state ?? 'unknown')), rawState: String(raw?.instance?.state ?? raw?.state ?? 'unknown') }
  }

  // Notifica 1× cada assinante ativo ainda não notificado (throttle). Idempotente.
  async function notifyOpenSubscribers(instance: string, url: string) {
    const { data: subs } = await supabase
      .from('australia_whv_subscribers')
      .select('id, phone')
      .eq('active', true)
      .is('notified_at', null)
    const list = subs ?? []
    if (list.length === 0) { await log('info', 'notify', { detected_status: 'Open', message: 'Open detectado — nenhum assinante pendente de notificação.' }); return }
    let ok = 0
    for (const s of list) {
      const number = String(s.phone).replace(/\D/g, '')
      const sent = await sendText(instance, number, alertMessage(url))
      if (sent.ok) {
        await supabase.from('australia_whv_subscribers').update({ notified_at: new Date().toISOString() }).eq('id', s.id)
        ok++
      } else {
        await log('error', 'notify', { detected_status: 'Open', message: `Falha ao alertar ${s.phone}.`, http_status: sent.status, details: { evo: sent.data } })
      }
      await sleep(NOTIFY_THROTTLE_MS)
    }
    await log('success', 'notify', { detected_status: 'Open', message: `Alertas enviados: ${ok}/${list.length} assinante(s).` })
  }
  function runInBackground(p: Promise<unknown>) {
    const g = p.catch((e) => log('error', 'notify', { message: `Erro na notificação: ${String(e)}` }))
    if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime?.waitUntil) EdgeRuntime.waitUntil(g); else void g
  }

  async function runCheck(cfg: Record<string, unknown>, trigger: string) {
    const url = String(cfg.official_url ?? '')
    const country = String(cfg.country_name ?? 'Brazil')
    const instance = String(cfg.whatsapp_instance_name ?? 'australia_whv_saas')
    const now = new Date().toISOString()
    await patchConfig({ last_checked_at: now })
    await log('info', 'check', { message: `Verificação iniciada (${trigger})`, details: { url, country } })

    let res: Response
    try {
      res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; WHVMonitor/1.0)', Accept: 'text/html,application/xhtml+xml' } })
    } catch (err) {
      await log('error', 'check', { message: `Falha de rede: ${(err as Error).message}` }); return { detected: 'Unknown' as DetectedStatus }
    }
    if (!res.ok) { await log('error', 'check', { message: `HTTP ${res.status} na página oficial`, http_status: res.status }); return { detected: 'Unknown' as DetectedStatus, http_status: res.status } }

    const { detected, snippet } = detectStatus(await res.text(), country)
    const patch: Record<string, unknown> = { last_detected_status: detected, last_detected_raw: snippet }
    if (detected === 'Unknown') {
      await patchConfig(patch)
      await log('warning', 'check', { detected_status: 'Unknown', message: `Não detectou status de "${country}" — página pode ter mudado.`, http_status: res.status, details: { snippet } })
      return { detected }
    }
    await log('success', 'check', { detected_status: detected, message: `Status de "${country}": ${detected}`, http_status: res.status, details: { snippet } })

    if (detected === 'Open') {
      if (!cfg.opened_at) patch.opened_at = now
      if (!cfg.notified_at) patch.notified_at = now   // marca 1º Open (exibição); notificação é por assinante
      await patchConfig(patch)
      runInBackground(notifyOpenSubscribers(instance, url))
      return { detected, notifying: true }
    }
    await patchConfig(patch)
    return { detected }
  }

  // ── Auth ──────────────────────────────────────────────────────────────────
  const cronSecret = Deno.env.get('AUSTRALIA_SAAS_CRON_SECRET') ?? ''
  const isCron = !!cronSecret && (req.headers.get('x-cron-secret') ?? '') === cronSecret

  const body = await req.json().catch(() => ({} as Record<string, unknown>))
  let action = String(body.action ?? '')
  if (action === 'scheduled_check') action = 'check_now'

  if (!isCron) {
    const anon = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('authorization') ?? '' } },
    })
    const { data: { user } } = await anon.auth.getUser()
    if (!user) return json({ error: 'Não autenticado' }, 401)
    const allow = (Deno.env.get('ADMIN_EMAILS') ?? '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean)
    if (allow.length > 0 && !allow.includes(String(user.email ?? '').toLowerCase())) {
      return json({ error: 'Sem permissão de admin' }, 403)
    }
  } else if (action !== 'check_now') {
    return json({ error: 'Cron só executa check_now' }, 403)
  }

  try {
    if (action === 'check_now') {
      const cfg = await getConfig()
      if (isCron && !cfg.enabled) return json({ skipped: true, reason: 'disabled' })
      return json(await runCheck(cfg, isCron ? 'cron' : 'manual'))
    }

    // ── Admin ────────────────────────────────────────────────────────────────
    if (action === 'get_config') {
      const cfg = await getConfig()
      const [{ count: activeCount }, { count: notifiedCount }] = await Promise.all([
        supabase.from('australia_whv_subscribers').select('id', { count: 'exact', head: true }).eq('active', true),
        supabase.from('australia_whv_subscribers').select('id', { count: 'exact', head: true }).eq('active', true).not('notified_at', 'is', null),
      ])
      return json({ config: cfg, stats: { active: activeCount ?? 0, notified: notifiedCount ?? 0 } })
    }

    if (action === 'save_config') {
      const p = (body.payload ?? {}) as Record<string, unknown>
      const patch: Record<string, unknown> = {}
      for (const k of ['enabled', 'country_name', 'check_interval_minutes', 'whatsapp_instance_name', 'auto_pause_after_open'] as const) {
        if (k in p) patch[k] = p[k]
      }
      if ('check_interval_minutes' in patch) {
        const n = Number(patch.check_interval_minutes)
        patch.check_interval_minutes = Number.isFinite(n) ? Math.min(60, Math.max(1, Math.round(n))) : 2
      }
      if ('whatsapp_instance_name' in patch) patch.whatsapp_instance_name = String(patch.whatsapp_instance_name).trim() || 'australia_whv_saas'
      const cfg = await patchConfig(patch)
      await log('info', 'config_update', { message: 'Config salva (admin).', details: { fields: Object.keys(patch) } })
      return json({ config: cfg })
    }

    if (action === 'logs') {
      const { data } = await supabase.from('australia_whv_monitor_logs').select('*').order('created_at', { ascending: false }).limit(100)
      return json({ logs: data ?? [] })
    }

    if (action === 'create_instance') {
      const cfg = await getConfig(); const instance = String(cfg.whatsapp_instance_name ?? 'australia_whv_saas')
      const conn = await connectionState(instance)
      if (conn.ok) { await patchConfig({ whatsapp_status: conn.status, whatsapp_last_checked_at: new Date().toISOString() }); await log('info', 'whatsapp_create', { message: `Instância "${instance}" já existe — reconciliada.`, details: { status: conn.status } }); return json({ instance_name: instance, status: conn.status, reconciled: true }) }
      const evo = await evoFetch('/instance/create', { method: 'POST', body: JSON.stringify({ instanceName: instance, integration: 'WHATSAPP-BAILEYS', qrcode: false }) })
      if (!evo.ok) { await log('error', 'whatsapp_create', { message: 'Falha ao criar instância.', http_status: evo.status, details: { evo: evo.data } }); return json({ error: `Evolution: ${JSON.stringify(evo.data)}` }, 502) }
      await patchConfig({ whatsapp_status: 'created', whatsapp_last_checked_at: new Date().toISOString() })
      await log('success', 'whatsapp_create', { message: `Instância "${instance}" criada.` })
      return json({ instance_name: instance, status: 'created' })
    }

    if (action === 'connect_instance') {
      const cfg = await getConfig(); const instance = String(cfg.whatsapp_instance_name ?? 'australia_whv_saas')
      const mode = String(body.mode ?? 'qr')
      let path = `/instance/connect/${instance}`
      if (mode === 'pairing') { const n = String(body.number ?? '').replace(/\D/g, ''); if (!n) return json({ error: 'Número obrigatório p/ pairing' }, 400); path += `?number=${encodeURIComponent(n)}` }
      const evo = await evoFetch(path)
      await patchConfig({ whatsapp_status: 'connecting', whatsapp_last_checked_at: new Date().toISOString() })
      await log('info', 'whatsapp_connect', { message: `Solicitado ${mode === 'pairing' ? 'pairing code' : 'QR'} para "${instance}".` })
      return json(evo.data)
    }

    if (action === 'state_instance') {
      const cfg = await getConfig(); const instance = String(cfg.whatsapp_instance_name ?? 'australia_whv_saas')
      const conn = await connectionState(instance)
      await patchConfig({ whatsapp_status: conn.status, whatsapp_last_checked_at: new Date().toISOString() })
      if (!body.silent) await log('info', 'whatsapp_state', { message: `Estado da instância: ${conn.status}`, details: { rawState: conn.rawState } })
      return json({ status: conn.status })
    }

    if (action === 'logout_instance') {
      const cfg = await getConfig(); const instance = String(cfg.whatsapp_instance_name ?? 'australia_whv_saas')
      await evoFetch(`/instance/logout/${instance}`, { method: 'DELETE' })
      await patchConfig({ whatsapp_status: 'disconnected', whatsapp_last_checked_at: new Date().toISOString() })
      await log('info', 'whatsapp_logout', { message: `Instância "${instance}" desconectada.` })
      return json({ success: true })
    }

    if (action === 'delete_instance') {
      const cfg = await getConfig(); const instance = String(cfg.whatsapp_instance_name ?? 'australia_whv_saas')
      await evoFetch(`/instance/delete/${instance}`, { method: 'DELETE' })
      await patchConfig({ whatsapp_status: 'unknown', whatsapp_last_checked_at: new Date().toISOString() })
      await log('warning', 'whatsapp_delete', { message: `Instância "${instance}" excluída.` })
      return json({ success: true })
    }

    if (action === 'send_test') {
      const cfg = await getConfig(); const instance = String(cfg.whatsapp_instance_name ?? 'australia_whv_saas')
      const number = String(body.number ?? '').replace(/\D/g, '')
      if (!number) return json({ error: 'Informe um número para o teste' }, 400)
      const conn = await connectionState(instance)
      if (conn.status !== 'open') { await log('warning', 'whatsapp_test', { message: `Teste não enviado — WhatsApp ${conn.status}.` }); return json({ error: `WhatsApp não conectado (${conn.status})` }, 409) }
      const sent = await sendText(instance, number, TEST_MESSAGE)
      if (!sent.ok) { await log('error', 'whatsapp_test', { message: 'Falha no teste.', http_status: sent.status, details: { evo: sent.data } }); return json({ error: `Evolution: ${JSON.stringify(sent.data)}` }, 502) }
      await log('success', 'whatsapp_test', { message: `Teste enviado para ${number}.` })
      return json({ success: true })
    }

    return json({ error: `Ação desconhecida: ${action}` }, 400)
  } catch (err) {
    await log('error', action || 'unknown', { message: `Erro inesperado: ${(err as Error).message}` })
    return json({ error: (err as Error).message }, 500)
  }
})

// ── Parser (mesmo do hub, já corrigido: strip U+200B + label-primary=Paused) ──
function detectStatus(html: string, country: string): { detected: DetectedStatus; snippet: string } {
  const src = html.replace(/​/g, '')
  const lower = src.toLowerCase()
  const c = country.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const cellRe = new RegExp(`<td[^>]*>\\s*${c}\\s*(?:<br\\s*/?>)?\\s*</td>`, 'g')
  const clip = (s: number, e: number) => src.slice(s, e).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300)
  let firstSnippet = ''
  let m: RegExpExecArray | null
  while ((m = cellRe.exec(lower)) !== null) {
    const winStart = m.index + m[0].length
    let end = lower.indexOf('</tr>', winStart)
    if (end === -1 || end - winStart > 400) end = Math.min(lower.length, winStart + 400)
    const win = lower.slice(winStart, end)
    if (!firstSnippet) firstSnippet = clip(m.index, end)
    const lm = /label-(success|danger|warning|primary)/.exec(win)
    if (lm) {
      const status: DetectedStatus = lm[1] === 'success' ? 'Open' : lm[1] === 'danger' ? 'Closed' : 'Paused'
      return { detected: status, snippet: clip(m.index, end) }
    }
  }
  if (!firstSnippet) {
    const stripped = src.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    const idx = stripped.toLowerCase().indexOf(country.toLowerCase())
    firstSnippet = idx === -1 ? stripped.slice(0, 200) : stripped.slice(Math.max(0, idx - 40), idx + 160)
  }
  return { detected: 'Unknown', snippet: firstSnippet }
}
