import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { activateSubscriber } from '../_shared/activate.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-signature, x-request-id',
}

// AUTENTICIDADE: NÃO validamos mais o HMAC (x-signature) do MP — ele quebrava
// notificações reais (secret/manifest divergentes) e não é necessário: abaixo
// re-consultamos o pagamento na API do MP com o NOSSO access token, então só um
// payment_id real e aprovado DA NOSSA conta é processado (forja impossível).

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
      transaction_amount?: number
      description?: string
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

    if (r.activated && !r.alreadyActive) {
      const nomeCliente = [payment.payer?.first_name, payment.payer?.last_name].filter(Boolean).join(' ') || phone
      const nomePlano = payment.description ?? 'Plano'
      const valor = payment.transaction_amount?.toFixed(2) ?? '?'
      try {
        await fetch('https://ntfy.sh/saas-vendas-k9x3mq7z', {
          method: 'POST',
          headers: {
            'Title': 'Nova assinatura!',
            'Priority': 'high',
            'Tags': 'moneybag',
          },
          body: `${nomeCliente} assinou o plano ${nomePlano} - R$${valor}`,
        })
      } catch { /* falha no ntfy nunca quebra o webhook */ }
    }

    return new Response('ok', { headers: corsHeaders })
  } catch (err) {
    console.error(err)
    await wlog('error', `Erro no webhook: ${String(err)}`)
    return new Response('error', { status: 500 })
  }
})
