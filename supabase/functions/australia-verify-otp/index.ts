import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type OtpPurpose = 'login' | 'checkout'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const input = await req.json() as { phone?: string; code?: string; purpose?: OtpPurpose }
    const phone = String(input.phone ?? '').trim()
    const code = String(input.code ?? '').trim()
    const purpose: OtpPurpose = input.purpose === 'checkout' ? 'checkout' : 'login'
    if (!phone || !code) return json({ error: 'phone e code obrigatorios' }, 400)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const nowISO = new Date().toISOString()
    const { data: otp } = await supabase
      .from('australia_whv_otps')
      .select('id, code, attempts')
      .eq('phone', phone)
      .eq('purpose', purpose)
      .eq('used', false)
      .gt('expires_at', nowISO)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!otp) {
      return json({ error: 'Codigo expirado. Solicite um novo.' }, 401)
    }

    if ((otp.attempts ?? 0) >= 5) {
      await supabase.from('australia_whv_otps').update({ used: true }).eq('id', otp.id)
      return json({ error: 'Muitas tentativas. Solicite um novo codigo.' }, 429)
    }

    if (otp.code !== code) {
      await supabase.from('australia_whv_otps').update({ attempts: (otp.attempts ?? 0) + 1 }).eq('id', otp.id)
      return json({ error: 'Codigo invalido.' }, 401)
    }

    if (purpose === 'checkout') {
      const verificationToken = crypto.randomUUID()
      await supabase
        .from('australia_whv_otps')
        .update({ used: true, verified_at: nowISO, verification_token: verificationToken })
        .eq('id', otp.id)

      return json({ verified: true, checkout_verification_token: verificationToken })
    }

    await supabase.from('australia_whv_otps').update({ used: true }).eq('id', otp.id)

    const sessionToken = crypto.randomUUID()
    const sessionExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()

    const { data: updated, error } = await supabase
      .from('australia_whv_subscribers')
      .update({ session_token: sessionToken, session_expires_at: sessionExpiresAt })
      .eq('phone', phone)
      .eq('active', true)
      .or('access_expires_at.is.null,access_expires_at.gt.' + nowISO)
      .select('id')

    if (error) {
      console.error(error)
      return json({ error: 'Erro ao criar sessao.' }, 500)
    }
    if (!updated || updated.length === 0) {
      return json({ error: 'Acesso nao encontrado ou expirado.' }, 404)
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
