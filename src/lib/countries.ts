// Lista de códigos de país (DDI) para o seletor do input de telefone.
// Default = Brasil (+55). Mantida curta e focada nos países relevantes p/ WHV.

export interface Country {
  code: string      // DDI com "+" (ex: '+55')
  iso: string       // ISO-3166 alpha-2 (ex: 'BR')
  flag: string      // emoji bandeira
  name: string      // nome exibido
  mask?: 'br'       // máscara específica (só BR por enquanto)
}

export const COUNTRIES: Country[] = [
  { code: '+55', iso: 'BR', flag: '🇧🇷', name: 'Brasil', mask: 'br' },
  { code: '+61', iso: 'AU', flag: '🇦🇺', name: 'Austrália' },
  { code: '+351', iso: 'PT', flag: '🇵🇹', name: 'Portugal' },
  { code: '+1',  iso: 'US', flag: '🇺🇸', name: 'EUA/Canadá' },
  { code: '+44', iso: 'GB', flag: '🇬🇧', name: 'Reino Unido' },
  { code: '+353', iso: 'IE', flag: '🇮🇪', name: 'Irlanda' },
  { code: '+64', iso: 'NZ', flag: '🇳🇿', name: 'Nova Zelândia' },
  { code: '+34', iso: 'ES', flag: '🇪🇸', name: 'Espanha' },
  { code: '+39', iso: 'IT', flag: '🇮🇹', name: 'Itália' },
  { code: '+49', iso: 'DE', flag: '🇩🇪', name: 'Alemanha' },
  { code: '+33', iso: 'FR', flag: '🇫🇷', name: 'França' },
]

export const DEFAULT_COUNTRY = COUNTRIES[0]  // Brasil

// Máscara BR: (11) 99999-8888. Outros países: só dígitos, agrupados leves.
export function maskPhone(digits: string, mask?: Country['mask']): string {
  const d = digits.replace(/\D/g, '')
  if (mask === 'br') {
    const b = d.slice(0, 11)
    if (b.length <= 2) return b
    if (b.length <= 7) return `(${b.slice(0, 2)}) ${b.slice(2)}`
    return `(${b.slice(0, 2)}) ${b.slice(2, 7)}-${b.slice(7)}`
  }
  return d.slice(0, 15)
}

// Monta o E.164 final: DDI + dígitos (ex: '+5511999998888').
export function toE164(countryCode: string, rawDigits: string): string {
  return `${countryCode}${rawDigits.replace(/\D/g, '')}`
}
