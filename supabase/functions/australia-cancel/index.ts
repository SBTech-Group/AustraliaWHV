// australia-cancel — o ASSINANTE cancela a própria assinatura pelo painel.
// Auth: session_token (mesmo do painel). Desativa acesso + remove do grupo.
// Deploy: default (chamado pelo front com anon key).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { removeParticipants } from '../_shared/evolution.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { session_token } = await req.json() as { session_token?: string }
    if (!session_token) return json({ error: 'Sessão inválida' }, 401)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Identifica o assinante pela sessão (não confia em phone vindo do front).
    const { data: sub } = await supabase
      .from('australia_whv_subscribers')
      .select('id, phone')
      .eq('session_token', session_token)
      .maybeSingle()
    if (!sub) return json({ error: 'Sessão inválida' }, 401)

    // Config do grupo (p/ remover)
    const { data: cfg } = await supabase
      .from('australia_whv_monitor_config')
      .select('whatsapp_instance_name, whatsapp_group_jid')
      .eq('singleton_key', 'main')
      .maybeSingle()

    if (cfg?.whatsapp_instance_name && cfg?.whatsapp_group_jid) {
      await removeParticipants(String(cfg.whatsapp_instance_name), String(cfg.whatsapp_group_jid), [String(sub.phone)])
    }

    // Desativa + encerra sessão (logout no servidor).
    await supabase
      .from('australia_whv_subscribers')
      .update({ active: false, in_group: false, session_token: null, session_expires_at: null })
      .eq('id', sub.id)

    await supabase.from('australia_whv_monitor_logs').insert({
      level: 'warning', action: 'cancel', message: `Assinatura cancelada pelo assinante: ${sub.phone}.`,
    }).then(() => {}, () => {})

    return json({ ok: true })
  } catch (err) {
    console.error(err)
    return json({ error: 'Erro interno' }, 500)
  }
})
