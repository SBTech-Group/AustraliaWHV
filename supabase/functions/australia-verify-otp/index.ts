import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { phone, code } = await req.json() as { phone: string; code: string }
    if (!phone || !code) return json({ error: 'phone e code obrigatórios' }, 400)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Busca OTP válido
    const { data: otp } = await supabase
      .from('australia_whv_otps')
      .select('id, code')
      .eq('phone', phone)
      .eq('used', false)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!otp) {
      return json({ error: 'Código expirado. Solicite um novo.' }, 401)
    }

    if (otp.code !== code) {
      return json({ error: 'Código inválido.' }, 401)
    }

    // Marca OTP como usado
    await supabase.from('australia_whv_otps').update({ used: true }).eq('id', otp.id)

    // Cria sessão (30 dias)
    const sessionToken = crypto.randomUUID()
    const sessionExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()

    const { error } = await supabase
      .from('australia_whv_subscribers')
      .update({ session_token: sessionToken, session_expires_at: sessionExpiresAt })
      .eq('phone', phone)
      .eq('active', true)

    if (error) {
      console.error(error)
      return json({ error: 'Erro ao criar sessão.' }, 500)
    }

    return json({ session_token: sessionToken })
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
