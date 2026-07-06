// australia-validate-session — valida o session_token do painel via service role.
// Substitui o SELECT anon em australia_whv_subscribers (que vazava session_token
// de todos os assinantes = takeover). O frontend chama isto no boot/login.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { session_token } = await req.json() as { session_token?: string }
    if (!session_token) return json({ subscriber: null }, 200)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { data } = await supabase
      .from('australia_whv_subscribers')
      .select('id, phone, active, paid_at, session_expires_at, access_expires_at, full_name')
      .eq('session_token', session_token)
      .eq('active', true)
      .or('access_expires_at.is.null,access_expires_at.gt.' + new Date().toISOString())
      .gt('session_expires_at', new Date().toISOString())
      .maybeSingle()

    // Só devolve campos seguros; nunca session_token/payment_id.
    return json({ subscriber: data ?? null })
  } catch {
    return json({ subscriber: null }, 200)
  }
})
