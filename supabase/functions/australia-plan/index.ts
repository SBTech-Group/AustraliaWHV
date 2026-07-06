// australia-plan — proxy do plano p/ o front (nome, preço, ciclo).
// Fonte de verdade é o Hub (hub-public-plans), com fallback p/ env — ver _shared/plan.ts.
// Front chama isto com JWT anon (default ok, não precisa --no-verify-jwt).
import { fetchPlan } from '../_shared/plan.ts'

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
    const { name, price, ciclo } = await fetchPlan()
    return json({ name, price, ciclo })
  } catch (err) {
    console.error(err)
    return json({ error: 'Erro interno' }, 500)
  }
})
