// Plano exibido no front (landing + checkout). Fonte: Edge Function australia-plan
// (que espelha o Hub Admin). Fallback p/ env se a função falhar — UI nunca fica vazia.
import { useQuery } from '@tanstack/react-query'
import { supabase } from './supabase'

export interface PlanInfo {
  name: string
  price: number
  priceLabel: string   // 'R$ 49,90'
  ciclo: string        // 'anual' | ...
}

const FALLBACK: PlanInfo = {
  name: 'Monitor WHV Austrália',
  price: Number(import.meta.env.VITE_PRODUCT_PRICE_NUM ?? '49.90'),
  priceLabel: (import.meta.env.VITE_PRODUCT_PRICE as string) ?? 'R$ 49,90',
  ciclo: 'anual',
}

export function formatBRL(n: number): string {
  return `R$ ${n.toFixed(2).replace('.', ',')}`
}

// 'anual' → 'por ano' ; 'mensal' → 'por mês' etc.
export function cicloLabel(ciclo: string): string {
  switch (ciclo) {
    case 'anual': return 'por ano'
    case 'semestral': return 'por semestre'
    case 'trimestral': return 'por trimestre'
    case 'mensal': return 'por mês'
    default: return ''
  }
}

export async function fetchPlan(): Promise<PlanInfo> {
  try {
    const { data, error } = await supabase.functions.invoke('australia-plan', { body: {} })
    if (error || !data || (data as { error?: string }).error) return FALLBACK
    const price = Number((data as { price?: number }).price)
    if (!Number.isFinite(price)) return FALLBACK
    return {
      name: (data as { name?: string }).name ?? FALLBACK.name,
      price,
      priceLabel: formatBRL(price),
      ciclo: (data as { ciclo?: string }).ciclo ?? 'anual',
    }
  } catch {
    return FALLBACK
  }
}

export function usePlan() {
  return useQuery({
    queryKey: ['plan'],
    queryFn: fetchPlan,
    staleTime: 5 * 60_000,
    initialData: FALLBACK,
  })
}
