// Plano do produto — fonte de verdade é o Hub Admin (hub-public-plans).
// Usado por: australia-plan (proxy p/ o front) e australia-process-payment
// (amount server-side — nunca confia no front). Fallback p/ env se o Hub cair.

export interface PlanInfo {
  name: string
  price: number
  ciclo: string   // 'mensal' | 'trimestral' | 'semestral' | 'anual'
}

function fallback(): PlanInfo {
  return {
    name: 'Monitor WHV Austrália',
    price: Number(Deno.env.get('PRODUCT_PRICE') ?? '49.90'),
    ciclo: Deno.env.get('PRODUCT_CICLO') ?? 'anual',
  }
}

// Busca o plano ativo do produto no Hub. Retorna fallback em qualquer falha
// (Hub indisponível NÃO deve bloquear venda — o valor de fallback vem do env).
export async function fetchPlan(): Promise<PlanInfo> {
  const hubUrl = Deno.env.get('HUB_FUNCTIONS_URL')
  const hubToken = Deno.env.get('HUB_PROVISIONING_TOKEN')
  const slug = Deno.env.get('HUB_PRODUCT_SLUG') ?? 'australiawhv'
  if (!hubUrl) return fallback()
  try {
    const res = await fetch(`${hubUrl}/hub-public-plans?produto=${encodeURIComponent(slug)}`, {
      headers: hubToken ? { Authorization: `Bearer ${hubToken}` } : {},
    })
    if (!res.ok) return fallback()
    const data = await res.json() as { planos?: Array<{ nome?: string; preco_mensal?: number | string; ciclo?: string }> }
    const p = (data.planos ?? [])[0]
    const price = Number(p?.preco_mensal)
    if (!p || !Number.isFinite(price)) return fallback()
    return { name: p.nome ?? fallback().name, price, ciclo: p.ciclo ?? 'anual' }
  } catch {
    return fallback()
  }
}

// Soma o ciclo a uma data ISO → nova data ISO (fim do acesso).
export function addCiclo(fromISO: string, ciclo: string): string {
  const d = new Date(fromISO)
  const months = ciclo === 'anual' ? 12 : ciclo === 'semestral' ? 6 : ciclo === 'trimestral' ? 3 : 1
  d.setMonth(d.getMonth() + months)
  return d.toISOString()
}
