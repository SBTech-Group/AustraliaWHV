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

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Verifica se é assinante ativo
    const { data: subscriber } = await supabase
      .from('australia_whv_subscribers')
      .select('id, active')
      .eq('phone', phone)
      .eq('active', true)
      .maybeSingle()

    if (!subscriber) {
      return json({ error: 'Número não encontrado. Verifique se o pagamento foi realizado.' }, 404)
    }

    // Rate limit: no máximo 1 OTP por minuto
    const { count } = await supabase
      .from('australia_whv_otps')
      .select('id', { count: 'exact', head: true })
      .eq('phone', phone)
      .gte('created_at', new Date(Date.now() - 60_000).toISOString())

    if ((count ?? 0) > 0) {
      return json({ error: 'Aguarde 1 minuto antes de solicitar outro código.' }, 429)
    }

    // Gera OTP de 6 dígitos
    const code = String(Math.floor(100000 + Math.random() * 900000))
    const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString() // 10 min

    await supabase.from('australia_whv_otps').insert({ phone, code, expires_at: expiresAt })

    // Envia via WhatsApp (Evolution API)
    const evolutionUrl = Deno.env.get('EVOLUTION_API_URL')
    const evolutionKey = Deno.env.get('EVOLUTION_API_KEY')

    const { data: config } = await supabase
      .from('australia_whv_monitor_config')
      .select('whatsapp_instance_name')
      .eq('singleton_key', 'main')
      .maybeSingle()

    if (!evolutionUrl || !evolutionKey || !config?.whatsapp_instance_name) {
      console.error('Evolution API not configured')
      return json({ error: 'Serviço de mensagens indisponível.' }, 503)
    }

    const numberClean = phone.replace('+', '').replace(/\D/g, '')
    const res = await fetch(`${evolutionUrl}/message/sendText/${config.whatsapp_instance_name}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: evolutionKey,
      },
      body: JSON.stringify({
        number: numberClean,
        text: `🔐 *Código de acesso — Monitor WHV*\n\n*${code}*\n\nVálido por 10 minutos. Não compartilhe com ninguém.`,
        delay: 500,
      }),
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
