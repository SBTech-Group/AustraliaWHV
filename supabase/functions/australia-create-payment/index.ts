import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { phone } = await req.json() as { phone: string }
    if (!phone) return json({ error: 'phone obrigatório' }, 400)

    const mpAccessToken = Deno.env.get('MP_ACCESS_TOKEN')!
    const appUrl = Deno.env.get('APP_URL')!
    const price = parseFloat(Deno.env.get('PRODUCT_PRICE') ?? '49.90')

    // Cria preference no Mercado Pago
    const res = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${mpAccessToken}`,
      },
      body: JSON.stringify({
        items: [{
          title: 'Monitor WHV Austrália — Alertas WhatsApp',
          quantity: 1,
          currency_id: 'BRL',
          unit_price: price,
        }],
        payer: { phone: { number: phone } },
        external_reference: phone,           // usado no webhook para identificar o assinante
        back_urls: {
          success: `${appUrl}/sucesso?status=approved`,
          failure: `${appUrl}/comprar`,
          pending: `${appUrl}/sucesso?status=pending`,
        },
        auto_return: 'approved',
        notification_url: `${Deno.env.get('SUPABASE_URL')}/functions/v1/australia-mp-webhook`,
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      console.error('MP error:', err)
      return json({ error: 'Erro ao criar pagamento' }, 502)
    }

    const preference = await res.json() as { init_point: string; id: string }

    // Garante que o assinante existe (pending) para rastrear
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )
    await supabase
      .from('australia_whv_subscribers')
      .upsert({ phone, payment_status: 'pending' }, { onConflict: 'phone' })

    return json({ checkout_url: preference.init_point, preference_id: preference.id })
  } catch (err) {
    console.error(err)
    return json({ error: 'Erro interno' }, 500)
  }
})

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
