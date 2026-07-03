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

    // Ativa assinante (a notificação de abertura é dirigida pela TABELA subscribers,
    // não mais por uma lista no config — ver australia-monitor).
    await supabase
      .from('australia_whv_subscribers')
      .upsert({
        phone,
        payment_id: paymentId,
        payment_status: 'approved',
        active: true,
        paid_at: new Date().toISOString(),
      }, { onConflict: 'phone' })

    const evolutionUrl = Deno.env.get('EVOLUTION_API_URL')
    const evolutionKey = Deno.env.get('EVOLUTION_API_KEY')

    const { data: cfg } = await supabase
      .from('australia_whv_monitor_config')
      .select('whatsapp_instance_name, last_detected_status, official_url')
      .eq('singleton_key', 'main')
      .maybeSingle()

    const numberClean = phone.replace('+', '').replace(/\D/g, '')
    const canSend = !!(evolutionUrl && evolutionKey && cfg?.whatsapp_instance_name)
    const send = (text: string) =>
      fetch(`${evolutionUrl}/message/sendText/${cfg!.whatsapp_instance_name}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: evolutionKey! },
        body: JSON.stringify({ number: numberClean, text, delay: 1000 }),
      }).catch(console.error)

    if (canSend) {
      const alreadyOpen = cfg!.last_detected_status === 'Open'
      // Boas-vindas
      await send(
        `✅ *Monitor WHV Austrália ativado!*\n\nVocê será avisado aqui no WhatsApp assim que o status mudar para *Aberto*.\n\nStatus atual: *${cfg!.last_detected_status ?? 'Verificando'}*\n\nPainel: ${Deno.env.get('APP_URL')}/login`,
      )
      // Se JÁ está aberto, alerta imediato + marca notified_at (não duplica no cron)
      if (alreadyOpen) {
        await send(
          `🚨 *AUSTRÁLIA WHV JÁ ESTÁ ABERTO PARA O BRASIL!*\n\nEntre AGORA no ImmiAccount e tente submeter/pagar a aplicação.\n\nPágina oficial: ${cfg!.official_url ?? ''}`,
        )
        await supabase
          .from('australia_whv_subscribers')
          .update({ notified_at: new Date().toISOString() })
          .eq('phone', phone)
      }
    }

    return new Response('ok', { headers: corsHeaders })
  } catch (err) {
    console.error(err)
    return new Response('error', { status: 500 })
  }
})
