// Input de telefone com seletor de DDI (código do país). Default Brasil (+55).
// Controlado: o pai guarda `country` (Country) e `phone` (string mascarada).
// Use toE164(country.code, phone) para obter o número final em E.164.
import { COUNTRIES, maskPhone, type Country } from '../lib/countries'

interface PhoneInputProps {
  country: Country
  onCountryChange: (c: Country) => void
  phone: string
  onPhoneChange: (masked: string) => void
  variant?: 'auth' | 'card'
  id?: string
  autoFocus?: boolean
  placeholder?: string
}

export function PhoneInput({
  country,
  onCountryChange,
  phone,
  onPhoneChange,
  variant = 'auth',
  id,
  autoFocus,
  placeholder = '(11) 99999-8888',
}: PhoneInputProps) {
  const wrapClass = variant === 'card' ? 'lp-card-input-wrap' : 'phone-input-wrap'

  return (
    <div className={wrapClass}>
      <select
        className="phone-ddi"
        value={country.iso}
        onChange={e => {
          const next = COUNTRIES.find(c => c.iso === e.target.value) ?? country
          onCountryChange(next)
          // re-mascara os dígitos atuais na regra do novo país
          onPhoneChange(maskPhone(phone, next.mask))
        }}
        aria-label="Código do país"
      >
        {COUNTRIES.map(c => (
          <option key={c.iso} value={c.iso}>
            {c.flag} {c.code}
          </option>
        ))}
      </select>
      <input
        id={id}
        type="tel"
        value={phone}
        onChange={e => onPhoneChange(maskPhone(e.target.value, country.mask))}
        placeholder={placeholder}
        autoFocus={autoFocus}
        required
      />
    </div>
  )
}
