import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type OtpPurpose = 'login' | 'checkout'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const input = await req.json() as { phone?: string; purpose?: OtpPurpose }
    const phone = String(input.phone ?? '').trim()
    const purpose: OtpPurpose = input.purpose === 'checkout' ? 'checkout' : 'login'
    if (!phone) return json({ error: 'phone obrigatorio' }, 400)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const nowISO = new Date().toISOString()

    if (purpose === 'login') {
      const { data: subscriber } = await supabase
        .from('australia_whv_subscribers')
        .select('id, active')
        .eq('phone', phone)
        .eq('active', true)
        .or('access_expires_at.is.null,access_expires_at.gt.' + nowISO)
        .maybeSingle()

      if (!subscriber) {
        return json({ error: 'Acesso nao encontrado ou expirado. Verifique o pagamento ou renove.' }, 404)
      }
    }

    const [{ count: lastMinute }, { count: lastHour }] = await Promise.all([
      supabase
        .from('australia_whv_otps')
        .select('id', { count: 'exact', head: true })
        .eq('phone', phone)
        .eq('purpose', purpose)
        .gte('created_at', new Date(Date.now() - 60_000).toISOString()),
      supabase
        .from('australia_whv_otps')
        .select('id', { count: 'exact', head: true })
        .eq('phone', phone)
        .eq('purpose', purpose)
        .gte('created_at', new Date(Date.now() - 60 * 60_000).toISOString()),
    ])

    if ((lastMinute ?? 0) > 0) {
      return json({ error: 'Aguarde 1 minuto antes de solicitar outro codigo.' }, 429)
    }
    if ((lastHour ?? 0) >= 5) {
      return json({ error: 'Muitas tentativas. Tente novamente mais tarde.' }, 429)
    }

    const code = String(Math.floor(100000 + Math.random() * 900000))
    const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString()

    await supabase.from('australia_whv_otps').insert({ phone, code, purpose, expires_at: expiresAt })

    const evolutionUrl = Deno.env.get('EVOLUTION_API_URL')
    const evolutionKey = Deno.env.get('EVOLUTION_API_KEY')

    const { data: config } = await supabase
      .from('australia_whv_monitor_config')
      .select('whatsapp_instance_name')
      .eq('singleton_key', 'main')
      .maybeSingle()

    if (!evolutionUrl || !evolutionKey || !config?.whatsapp_instance_name) {
      console.error('Evolution API not configured')
      return json({ error: 'Servico de mensagens indisponivel.' }, 503)
    }

    const numberClean = phone.replace('+', '').replace(/\D/g, '')
    const title = purpose === 'checkout'
      ? 'Codigo de confirmacao - Australia WHV'
      : 'Codigo de acesso - Monitor WHV'
    const text = `*${title}*\n\n*${code}*\n\nValido por 10 minutos. Nao compartilhe com ninguem.`

    const res = await fetch(`${evolutionUrl}/message/sendText/${config.whatsapp_instance_name}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: evolutionKey,
      },
      body: JSON.stringify({ number: numberClean, text, delay: 500 }),
    })

    if (!res.ok) {
      console.error('Evolution error:', await res.text())
      return json({ error: 'Erro ao enviar mensagem WhatsApp.' }, 502)
    }

    return json({ ok: true })
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
