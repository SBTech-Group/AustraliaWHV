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

// Consultado pelo front (polling) enquanto o cliente paga via PIX.
// Retorna o payment_status gravado pelo webhook — não expõe o MP.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { phone } = await req.json() as { phone?: string }
    if (!phone) return json({ error: 'phone obrigatório' }, 400)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { data } = await supabase
      .from('australia_whv_subscribers')
      .select('payment_status, active, access_expires_at')
      .eq('phone', phone)
      .maybeSingle()

    const active = data?.active ?? false
    const accessExpiresAt = data?.access_expires_at ?? null
    const hasActiveAccess = active && (accessExpiresAt == null || new Date(accessExpiresAt) > new Date())

    return json({
      status: data?.payment_status ?? 'pending',
      active,
      access_expires_at: accessExpiresAt,
      has_active_access: hasActiveAccess,
    })
  } catch (err) {
    console.error(err)
    return json({ error: 'Erro interno' }, 500)
  }
})
