import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { fetchPlan } from '../_shared/plan.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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
    const { phone, full_name, email, selectedPaymentMethod, formData } = await req.json() as {
      phone?: string
      full_name?: string
      email?: string
      selectedPaymentMethod?: string
      formData?: Record<string, unknown>
    }

    if (!phone) return json({ error: 'phone obrigatório' }, 400)
    if (!full_name || !full_name.trim()) return json({ error: 'full_name obrigatório' }, 400)
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) return json({ error: 'email inválido' }, 400)
    if (!formData) return json({ error: 'formData obrigatório' }, 400)

    const mpAccessToken = Deno.env.get('MP_ACCESS_TOKEN')!
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabase = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

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
    const { price } = await fetchPlan()

    const isPix = selectedPaymentMethod === 'bank_transfer' || selectedPaymentMethod === 'pix'

    const payer = (formData.payer as Record<string, unknown> | undefined) ?? {}

    // Backend é a fonte de verdade do valor — nunca confia no amount vindo do front.
    const mpPayment: Record<string, unknown> = {
      ...formData,
      transaction_amount: price,
      description: 'Monitor WHV Austrália — Alertas WhatsApp',
      statement_descriptor: Deno.env.get('MP_STATEMENT_DESCRIPTOR') ?? 'SBTECH',  // texto na fatura do cartão
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
      console.error('MP payment error:', JSON.stringify(payment))
      return json({ error: payment.message ?? 'Erro ao processar pagamento' }, 502)
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
