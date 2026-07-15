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
    if (!session_token) return json({ subscriber: null, user_config: null }, 200)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { data } = await supabase
      .from('australia_whv_subscribers')
      .select('id, phone, active, paid_at, session_expires_at, access_expires_at, full_name, in_group, group_added_at, group_access_status, group_access_method, group_access_error, group_joined_at, group_invite_sent_at, group_invite_attempts')
      .eq('session_token', session_token)
      .eq('active', true)
      .or('access_expires_at.is.null,access_expires_at.gt.' + new Date().toISOString())
      .gt('session_expires_at', new Date().toISOString())
      .maybeSingle()

    // Só devolve campos seguros; nunca session_token/payment_id.
    if (!data) return json({ subscriber: null, user_config: null })

    const { data: cfg } = await supabase
      .from('australia_whv_monitor_config')
      .select('support_whatsapp_number, support_default_message, contact_text, instagram_url, whatsapp_group_name')
      .eq('singleton_key', 'main')
      .maybeSingle()

    return json({ subscriber: data, user_config: cfg ?? null })
  } catch {
    return json({ subscriber: null, user_config: null }, 200)
  }
})
