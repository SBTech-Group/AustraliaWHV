import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { activateSubscriber } from '../_shared/activate.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-signature, x-request-id',
}

// Valida a origem da notificação MP (Webhooks v2): HMAC-SHA256 do manifest
// `id:<data.id>;request-id:<x-request-id>;ts:<ts>;` com o MP_WEBHOOK_SECRET.
async function validSignature(req: Request, dataId: string, secret: string): Promise<boolean> {
  const xSignature = req.headers.get('x-signature') ?? ''
  const xRequestId = req.headers.get('x-request-id') ?? ''
  const parts: Record<string, string> = {}
  for (const kv of xSignature.split(',')) {
    const [k, v] = kv.split('=')
    if (k && v) parts[k.trim()] = v.trim()
  }
  const ts = parts['ts']
  const v1 = parts['v1']
  if (!ts || !v1) return false

  const manifest = `id:${dataId.toLowerCase()};request-id:${xRequestId};ts:${ts};`
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  )
  const sigBuf = await crypto.subtle.sign('HMAC', key, enc.encode(manifest))
  const hex = [...new Uint8Array(sigBuf)].map(b => b.toString(16).padStart(2, '0')).join('')
  return hex === v1
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )
  // Log de diagnóstico do webhook (aparece em /admin → Logs, action=webhook).
  const wlog = (level: string, message: string, details: Record<string, unknown> = {}) =>
    supabase.from('australia_whv_monitor_logs').insert({ level, action: 'webhook', message, details }).then(() => {}, () => {})

  try {
    const url = new URL(req.url)
    const rawBody = await req.text()
    let body: { type?: string; data?: { id?: string }; action?: string } = {}
    try { body = rawBody ? JSON.parse(rawBody) : {} } catch { /* IPN pode não ter body JSON */ }

    // paymentId: body (Webhooks v2) OU query (?type=payment&data.id= | ?topic=payment&id=)
    const type = body.type ?? url.searchParams.get('type') ?? url.searchParams.get('topic')
    const paymentId = String(body.data?.id ?? url.searchParams.get('data.id') ?? url.searchParams.get('id') ?? '')

    if (type !== 'payment' || !paymentId) {
      return new Response('ok', { headers: corsHeaders })   // evento irrelevante — ignora
    }

    // Assinatura HMAC: só exige quando o MP realmente envia o header x-signature.
    // Notificações por-pagamento (sem webhook no dashboard MP) NÃO são assinadas —
    // a re-consulta na API do MP abaixo já garante autenticidade.
    const webhookSecret = Deno.env.get('MP_WEBHOOK_SECRET')
    if (webhookSecret && req.headers.get('x-signature')) {
      const dataId = url.searchParams.get('data.id') ?? paymentId
      if (!(await validSignature(req, dataId, webhookSecret))) {
        await wlog('warning', `Webhook rejeitado: assinatura inválida (payment ${paymentId}).`)
        return new Response('invalid signature', { status: 401, headers: corsHeaders })
      }
    }

    // Consulta o pagamento no MP para verificar status e obter phone
    const res = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${Deno.env.get('MP_ACCESS_TOKEN')!}` },
    })
    if (!res.ok) {
      await wlog('error', `Falha ao consultar pagamento ${paymentId} no MP.`, { http_status: res.status })
      return new Response('MP fetch failed', { status: 502 })
    }

    const payment = await res.json() as {
      status: string
      external_reference: string
      payer?: { email?: string; first_name?: string; last_name?: string }
    }

    if (payment.status !== 'approved') {
      await wlog('info', `Webhook ${paymentId}: status "${payment.status}" (ignorado — não aprovado).`)
      return new Response('payment not approved', { headers: corsHeaders })
    }

    const phone = payment.external_reference
    if (!phone) { await wlog('error', `Webhook ${paymentId}: sem phone.`); return new Response('no phone', { status: 400 }) }

    // Ativação idempotente (DB + grupo + WhatsApp + e-mail + Hub) — fonte única.
    const r = await activateSubscriber(supabase, {
      phone,
      paymentId,
      nome: [payment.payer?.first_name, payment.payer?.last_name].filter(Boolean).join(' '),
      email: payment.payer?.email,
    })
    await wlog(r.activated ? 'success' : 'info',
      r.alreadyActive
        ? `Webhook ${paymentId}: ${phone} já estava ativo — ignorado.`
        : `Assinante ativado via webhook (${phone}). Grupo: ${r.in_group ? 'ok' : 'não'} · Hub: ${r.hub?.ok ? 'ok' : 'falha'}.`,
      { hub: r.hub },
    )

    return new Response('ok', { headers: corsHeaders })
  } catch (err) {
    console.error(err)
    await wlog('error', `Erro no webhook: ${String(err)}`)
    return new Response('error', { status: 500 })
  }
})
