import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { fetchPlan } from '../_shared/plan.ts'
import { activateSubscriber } from '../_shared/activate.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type DB = ReturnType<typeof createClient>

async function monitorLog(
  supabase: DB,
  level: 'info' | 'success' | 'warning' | 'error',
  message: string,
  details: Record<string, unknown> = {},
  http_status?: number,
) {
  await supabase
    .from('australia_whv_monitor_logs')
    .insert({ level, action: 'payment', message, details, http_status: http_status ?? null })
    .then(() => {}, () => {})
}

function sanitizeMpError(payment: Record<string, unknown>) {
  const cause = Array.isArray(payment.cause)
    ? payment.cause.map((c) => {
        const item = c as Record<string, unknown>
        return { code: item.code, description: item.description }
      })
    : undefined
  return {
    message: payment.message,
    error: payment.error,
    status: payment.status,
    status_detail: payment.status_detail,
    cause,
  }
}

function publicPaymentError(status: number, payment: Record<string, unknown>) {
  const msg = String(payment.message ?? payment.error ?? '').toLowerCase()
  if (status === 401 || status === 403 || msg.includes('invalid credentials')) {
    return 'Pagamento temporariamente indisponivel. Fale com o suporte para finalizar a assinatura.'
  }
  if (status === 400) {
    return 'Nao foi possivel validar os dados do pagamento. Revise os dados e tente novamente.'
  }
  return 'Erro ao processar pagamento. Tente novamente em instantes.'
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// Recebe o submit do Payment Brick (cartão ou PIX) e cria o pagamento
// direto na Payments API do Mercado Pago — sem redirect (Checkout Transparente).
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { phone, full_name, email, selectedPaymentMethod, formData, checkout_verification_token } = await req.json() as {
      phone?: string
      full_name?: string
      email?: string
      selectedPaymentMethod?: string
      formData?: Record<string, unknown>
      checkout_verification_token?: string
    }

    if (!phone) return json({ error: 'phone obrigatório' }, 400)
    if (!full_name || !full_name.trim()) return json({ error: 'full_name obrigatório' }, 400)
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) return json({ error: 'email inválido' }, 400)
    if (!formData) return json({ error: 'formData obrigatório' }, 400)

    const mpAccessToken = (Deno.env.get('MP_ACCESS_TOKEN') ?? '').trim()
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabase = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    if (!mpAccessToken) {
      await monitorLog(supabase, 'error', 'MP_ACCESS_TOKEN nao configurado.')
      return json({ error: 'Pagamento temporariamente indisponivel. Fale com o suporte para finalizar a assinatura.' }, 503)
    }

    // Bloqueia recompra: quem já tem acesso ativo (e não expirado) não paga de novo.
    const { data: existing } = await supabase
      .from('australia_whv_subscribers')
      .select('active, access_expires_at')
      .eq('phone', phone)
      .maybeSingle()
    if (existing?.active && (existing.access_expires_at == null || new Date(existing.access_expires_at) > new Date())) {
      return json({ error: 'Você já possui um acesso ativo.', already_active: true, access_expires_at: existing.access_expires_at ?? null }, 409)
    }

    // Preço vem do plano (Hub → fallback env). Nunca confia no amount do front.
    const verificationToken = String(checkout_verification_token ?? '').trim()
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(verificationToken)) {
      return json({ error: 'Confirme seu WhatsApp antes de seguir para o pagamento.' }, 401)
    }

    const { data: verifiedOtp } = await supabase
      .from('australia_whv_otps')
      .select('id')
      .eq('phone', phone)
      .eq('purpose', 'checkout')
      .eq('used', true)
      .eq('verification_token', verificationToken)
      .gt('verified_at', new Date(Date.now() - 30 * 60_000).toISOString())
      .maybeSingle()

    if (!verifiedOtp) {
      return json({ error: 'Confirmacao do WhatsApp expirada. Solicite um novo codigo.' }, 401)
    }

    const { price } = await fetchPlan()

    const isPix = selectedPaymentMethod === 'bank_transfer' || selectedPaymentMethod === 'pix'

    const payer = (formData.payer as Record<string, unknown> | undefined) ?? {}

    // Backend é a fonte de verdade do valor — nunca confia no amount vindo do front.
    const mpPayment: Record<string, unknown> = {
      ...formData,
      transaction_amount: price,
      description: 'Monitor WHV Austrália — Alertas WhatsApp',
      external_reference: phone,
      notification_url: `${supabaseUrl}/functions/v1/australia-mp-webhook`,
      metadata: { phone },
      payer: { ...payer, email },
    }

    if (isPix) {
      mpPayment.payment_method_id = 'pix'
    } else {
      mpPayment.installments = 1 // cartão à vista, sem parcelamento
    }

    const res = await fetch('https://api.mercadopago.com/v1/payments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${mpAccessToken}`,
        'X-Idempotency-Key': crypto.randomUUID(),
      },
      body: JSON.stringify(mpPayment),
    })

    const payment = await res.json() as {
      id?: number
      status?: string
      status_detail?: string
      point_of_interaction?: {
        transaction_data?: { qr_code?: string; qr_code_base64?: string; ticket_url?: string }
      }
      message?: string
    }

    if (!res.ok || !payment.id) {
      const safeError = sanitizeMpError(payment as Record<string, unknown>)
      console.error('MP payment error:', JSON.stringify({ http_status: res.status, ...safeError }))
      await monitorLog(supabase, 'error', 'Falha ao criar pagamento no Mercado Pago.', { mp: safeError, method: selectedPaymentMethod }, res.status)
      return json({ error: publicPaymentError(res.status, payment as Record<string, unknown>) }, res.status === 401 || res.status === 403 ? 503 : 502)
    }

    // Rastreia o assinante como pending — a ativação definitiva ocorre no webhook.
    await supabase
      .from('australia_whv_subscribers')
      .upsert(
        { phone, full_name, email, payment_id: String(payment.id), payment_status: 'pending' },
        { onConflict: 'phone' },
      )

    if (isPix) {
      const td = payment.point_of_interaction?.transaction_data
      return json({
        type: 'pix',
        status: payment.status,
        id: payment.id,
        pix: {
          qr_code: td?.qr_code ?? '',
          qr_code_base64: td?.qr_code_base64 ?? '',
          ticket_url: td?.ticket_url ?? '',
        },
      })
    }

    // Cartão: a resposta é SÍNCRONA. Se já aprovou, ativa AQUI (não depende do
    // webhook — que pode falhar/atrasar). Idempotente via activateSubscriber.
    if (payment.status === 'approved') {
      await activateSubscriber(supabase, { phone, paymentId: String(payment.id), nome: full_name, email })
    }

    return json({
      type: 'card',
      status: payment.status,          // approved | in_process | rejected | pending
      status_detail: payment.status_detail,
      id: payment.id,
    })
  } catch (err) {
    console.error(err)
    return json({ error: 'Erro interno' }, 500)
  }
})
