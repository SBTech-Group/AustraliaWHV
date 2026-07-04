import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Loader2, MessageCircle } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '../../../lib/supabase'

function formatPhone(raw: string) {
  return raw.replace(/\D/g, '')
}

function maskPhone(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 11)
  if (digits.length <= 2) return digits
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
}

export function CheckoutPage() {
  const navigate = useNavigate()
  const [phone, setPhone] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const digits = formatPhone(phone)
    if (digits.length < 10) {
      toast.error('Número inválido. Use DDD + número (ex: 11999998888)')
      return
    }

    setLoading(true)
    try {
      const fullPhone = `+55${digits}`
      const { data, error } = await supabase.functions.invoke('australia-create-payment', {
        body: { phone: fullPhone },
      })
      if (error || !data?.checkout_url) throw new Error(error?.message ?? 'Erro ao criar pagamento')
      window.location.href = data.checkout_url as string
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao processar. Tente novamente.')
      setLoading(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <button className="btn-back" onClick={() => navigate('/')}>
          <ArrowLeft size={16} /> Voltar
        </button>

        <div className="auth-icon">
          <MessageCircle size={32} strokeWidth={1.5} />
        </div>

        <h1>Qual é o seu WhatsApp?</h1>
        <p className="auth-sub">
          Enviamos o alerta diretamente para este número quando a Austrália abrir vagas.
        </p>

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="field">
            <label htmlFor="phone">Número com DDD</label>
            <div className="phone-input-wrap">
              <span className="phone-prefix">🇧🇷 +55</span>
              <input
                id="phone"
                type="tel"
                value={phone}
                onChange={e => setPhone(maskPhone(e.target.value))}
                placeholder="(11) 99999-8888"
                autoFocus
                required
              />
            </div>
          </div>

          <button type="submit" className="btn-primary-lg" disabled={loading}>
            {loading ? <><Loader2 size={16} className="spin" /> Aguarde...</> : 'Ir para o pagamento →'}
          </button>
        </form>

        <p className="auth-disclaimer">
          Ao prosseguir você concorda que enviaremos mensagens de alerta WHV para este número via WhatsApp.
        </p>
      </div>
    </div>
  )
}
