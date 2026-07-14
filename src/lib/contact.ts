export function whatsappUrl(number?: string | null, message?: string | null) {
  const digits = String(number ?? '').replace(/\D/g, '')
  if (!digits) return null
  const text = String(message ?? '').trim()
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ''}`
}

export function mailtoUrl(email?: string | null, subject?: string) {
  const clean = String(email ?? '').trim()
  if (!clean) return null
  return `mailto:${clean}${subject ? `?subject=${encodeURIComponent(subject)}` : ''}`
}
