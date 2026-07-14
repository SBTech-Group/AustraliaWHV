import { useQuery } from '@tanstack/react-query'
import { supabase } from './supabase'
import type { PublicConfig } from '../types'

export const DEFAULT_PUBLIC_CONFIG: PublicConfig = {
  support_whatsapp_number: null,
  support_default_message: 'Ola, preciso de ajuda com meu acesso ao Australia WHV.',
  contact_email: null,
  contact_text: 'Fale com o suporte se tiver qualquer problema com pagamento, acesso ao painel ou entrada no grupo.',
  about_title: 'Sobre nos',
  about_body: 'O Monitor WHV Australia acompanha a pagina oficial australiana e avisa assinantes pelo WhatsApp quando houver mudanca de status.',
  landing_trust_text: 'Depois do pagamento, seu acesso ao painel e liberado e voce recebe orientacao para entrar no grupo de alertas.',
}

export function usePublicConfig() {
  return useQuery({
    queryKey: ['public_config'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('australia_whv_public_config')
        .select('*')
        .maybeSingle()
      if (error) throw error
      return { ...DEFAULT_PUBLIC_CONFIG, ...(data ?? {}) } as PublicConfig
    },
    staleTime: 60_000,
  })
}
