import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { activateSubscriber } from '../_shared/activate.ts'

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

// Consultado pelo front (polling) enquanto o cliente paga via PIX.
// NÃO depende do webhook do MP chegar: consulta o pagamento direto no MP e, se
// aprovado, ATIVA o assinante aqui mesmo (self-heal). O webhook vira só um atalho.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { phone } = await req.json() as { phone?: string }
    if (!phone) return json({ error: 'phone obrigatório' }, 400)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { data } = await supabase
      .from('australia_whv_subscribers')
      .select('payment_status, active, access_expires_at, payment_id, full_name, email')
      .eq('phone', phone)
      .maybeSingle()

    let paymentStatus = data?.payment_status ?? 'pending'
    let active = data?.active ?? false
    let accessExpiresAt = data?.access_expires_at ?? null

    // Ainda não aprovado localmente? Pergunta ao MP e ativa se já pagou.
    // (cobre o caso do webhook do MP não chegar / falhar.)
    const notYetActive = !active || (accessExpiresAt != null && new Date(accessExpiresAt) <= new Date())
    if (notYetActive && data?.payment_id) {
      const token = (Deno.env.get('MP_ACCESS_TOKEN') ?? '').trim()
      if (token) {
        try {
          const mp = await fetch(`https://api.mercadopago.com/v1/payments/${data.payment_id}`, {
            headers: { Authorization: `Bearer ${token}` },
          })
          if (mp.ok) {
            const pay = await mp.json() as { status?: string; payer?: { email?: string; first_name?: string; last_name?: string } }
            if (pay.status === 'approved') {
              await activateSubscriber(supabase, {
                phone,
                paymentId: String(data.payment_id),
                nome: data.full_name || [pay.payer?.first_name, pay.payer?.last_name].filter(Boolean).join(' '),
                email: data.email || pay.payer?.email,
              })
              paymentStatus = 'approved'
              active = true
              // relê expiração recém-gravada
              const { data: fresh } = await supabase
                .from('australia_whv_subscribers')
                .select('access_expires_at')
                .eq('phone', phone)
                .maybeSingle()
              accessExpiresAt = fresh?.access_expires_at ?? accessExpiresAt
            }
          } else {
            await supabase.from('australia_whv_monitor_logs').insert({
              level: 'error',
              action: 'payment_status',
              message: 'Falha ao consultar pagamento no Mercado Pago.',
              details: { payment_id: data.payment_id },
              http_status: mp.status,
            }).then(() => {}, () => {})
          }
        } catch (e) {
          console.error('payment-status MP check', e)
        }
      }
    }

    const hasActiveAccess = active && (accessExpiresAt == null || new Date(accessExpiresAt) > new Date())

    return json({
      status: paymentStatus,
      active,
      access_expires_at: accessExpiresAt,
      has_active_access: hasActiveAccess,
    })
  } catch (err) {
    console.error(err)
    return json({ error: 'Erro interno' }, 500)
  }
})
