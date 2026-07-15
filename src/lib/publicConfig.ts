import { useQuery } from '@tanstack/react-query'
import { supabase } from './supabase'
import type { PublicConfig } from '../types'

export const DEFAULT_PUBLIC_CONFIG: PublicConfig = {
  support_whatsapp_number: null,
  support_default_message: 'Ola, preciso de ajuda com meu acesso ao Australia WHV.',
  contact_text: 'Fale com o suporte se tiver qualquer problema com pagamento, acesso ao painel ou entrada no grupo de alertas.',
  about_body: 'O Monitor WHV Austrália acompanha o status oficial do Work and Holiday Visa para brasileiros e envia avisos pelo WhatsApp quando houver mudança relevante.',
  landing_trust_text: 'Você confirma o WhatsApp antes de pagar. Com o pagamento aprovado, o acesso ao painel e ao grupo de alertas fica disponível no mesmo número.',
  instagram_url: null,
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
