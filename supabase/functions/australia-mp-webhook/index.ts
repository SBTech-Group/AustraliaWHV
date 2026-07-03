import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const body = await req.json() as { type?: string; data?: { id?: string }; action?: string }

    // MP envia type=payment quando um pagamento ocorre
    if (body.type !== 'payment' || !body.data?.id) {
      return new Response('ok', { headers: corsHeaders })
    }

    const paymentId = String(body.data.id)
    const mpAccessToken = Deno.env.get('MP_ACCESS_TOKEN')!

    // Consulta o pagamento no MP para verificar status e obter phone
    const res = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${mpAccessToken}` },
    })
    if (!res.ok) return new Response('MP fetch failed', { status: 502 })

    const payment = await res.json() as {
      status: string
      external_reference: string   // phone armazenado na preference
    }

    if (payment.status !== 'approved') {
      return new Response('payment not approved', { headers: corsHeaders })
    }

    const phone = payment.external_reference
    if (!phone) return new Response('no phone in external_reference', { status: 400 })

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Ativa assinante
    await supabase
      .from('australia_whv_subscribers')
      .upsert({
        phone,
        payment_id: paymentId,
        payment_status: 'approved',
        active: true,
        paid_at: new Date().toISOString(),
      }, { onConflict: 'phone' })

    // Adiciona phone na lista de notificações WhatsApp do monitor
    const { data: config } = await supabase
      .from('australia_whv_monitor_config')
      .select('whatsapp_target_numbers')
      .eq('singleton_key', 'main')
      .maybeSingle()

    if (config) {
      const numbers: string[] = config.whatsapp_target_numbers ?? []
      if (!numbers.includes(phone)) {
        await supabase
          .from('australia_whv_monitor_config')
          .update({ whatsapp_target_numbers: [...numbers, phone] })
          .eq('singleton_key', 'main')
      }
    }

    // Envia mensagem de boas-vindas via WhatsApp
    const evolutionUrl = Deno.env.get('EVOLUTION_API_URL')
    const evolutionKey = Deno.env.get('EVOLUTION_API_KEY')

    if (evolutionUrl && evolutionKey && config) {
      const { data: configFull } = await supabase
        .from('australia_whv_monitor_config')
        .select('whatsapp_instance_name, last_detected_status')
        .eq('singleton_key', 'main')
        .maybeSingle()

      if (configFull?.whatsapp_instance_name) {
        const numberClean = phone.replace('+', '').replace(/\D/g, '')
        await fetch(`${evolutionUrl}/message/sendText/${configFull.whatsapp_instance_name}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: evolutionKey,
          },
          body: JSON.stringify({
            number: numberClean,
            text: `✅ *Monitor WHV Austrália ativado!*\n\nSeu número foi adicionado à lista de alertas. Assim que o status mudar para *Aberto*, você receberá uma notificação aqui.\n\nStatus atual: *${configFull.last_detected_status ?? 'Verificando'}*\n\nAcesse o painel: ${Deno.env.get('APP_URL')}/login`,
            delay: 1000,
          }),
        }).catch(console.error)
      }
    }

    return new Response('ok', { headers: corsHeaders })
  } catch (err) {
    console.error(err)
    return new Response('error', { status: 500 })
  }
})
