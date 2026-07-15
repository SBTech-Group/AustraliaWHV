import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Loader2, MessageCircle } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../../../core/auth/AuthContext'
import { PhoneInput } from '../../../components/PhoneInput'
import { DEFAULT_COUNTRY, toE164, type Country } from '../../../lib/countries'

type Step = 'phone' | 'otp'

async function serverErrMsg(error: unknown, fallback: string): Promise<string> {
  const ctx = (error as { context?: Response })?.context
  if (ctx && typeof ctx.json === 'function') {
    try {
      const body = await ctx.json()
      if (body?.error) return String(body.error)
    } catch { /* corpo nao-JSON */ }
  }
  return (error as { message?: string })?.message ?? fallback
}

export function LoginPage() {
  const navigate = useNavigate()
  const { login } = useAuth()
  const [step, setStep] = useState<Step>('phone')
  const [country, setCountry] = useState<Country>(DEFAULT_COUNTRY)
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [loading, setLoading] = useState(false)

  const fullPhone = toE164(country.code, phone)

  const sendOtp = async (e: React.FormEvent) => {
    e.preventDefault()
    const digits = phone.replace(/\D/g, '')
    if (digits.length < 10) {
      toast.error('Número inválido. Use DDD + número.')
      return
    }
    setLoading(true)
    try {
      const { data, error } = await supabase.functions.invoke('australia-send-otp', {
        body: { phone: fullPhone },
      })
      if (error) throw new Error(await serverErrMsg(error, 'Erro ao enviar código'))
      if (data?.error) throw new Error(data.error)
      toast.success('Código enviado! Verifique seu WhatsApp.')
      setStep('otp')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao enviar código.')
    } finally {
      setLoading(false)
    }
  }

  const verifyOtp = async (e: React.FormEvent) => {
    e.preventDefault()
    if (otp.length !== 6) {
      toast.error('Digite o código de 6 dígitos.')
      return
    }
    setLoading(true)
    try {
      const { data, error } = await supabase.functions.invoke('australia-verify-otp', {
        body: { phone: fullPhone, code: otp },
      })
      if (error) throw new Error(await serverErrMsg(error, 'Código inválido ou expirado'))
      if (data?.error) throw new Error(data.error)
      await login(data.session_token as string)
      navigate('/monitor')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Código inválido.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <button className="btn-back" onClick={() => step === 'otp' ? setStep('phone') : navigate('/')}>
          <ArrowLeft size={16} /> Voltar
        </button>

        <div className="auth-icon">
          <MessageCircle size={32} strokeWidth={1.5} />
        </div>

        {step === 'phone' ? (
          <>
            <h1>Entrar no painel</h1>
            <p className="auth-sub">Digite o número de WhatsApp cadastrado no pagamento.</p>
            <form onSubmit={sendOtp} className="auth-form">
              <div className="field">
                <label htmlFor="phone">Número com DDD</label>
                <PhoneInput
                  id="phone"
                  country={country}
                  onCountryChange={setCountry}
                  phone={phone}
                  onPhoneChange={setPhone}
                  variant="auth"
                  autoFocus
                />
              </div>
              <button type="submit" className="btn-primary-lg" disabled={loading}>
                {loading ? <><Loader2 size={16} className="spin" /> Enviando...</> : 'Receber código via WhatsApp'}
              </button>
            </form>
          </>
        ) : (
          <>
            <h1>Código enviado!</h1>
            <p className="auth-sub">
              Enviamos um código de 6 dígitos para <strong>{fullPhone}</strong> via WhatsApp.
            </p>
            <form onSubmit={verifyOtp} className="auth-form">
              <div className="field">
                <label htmlFor="otp">Código de verificação</label>
                <input
                  id="otp"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={otp}
                  onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  autoFocus
                  required
                  className="otp-input"
                />
              </div>
              <button type="submit" className="btn-primary-lg" disabled={loading}>
                {loading ? <><Loader2 size={16} className="spin" /> Verificando...</> : 'Entrar'}
              </button>
              <button type="button" className="btn-text" onClick={() => { setStep('phone'); setOtp('') }}>
                Usar outro número
              </button>
            </form>
          </>
        )}

        <p className="auth-disclaimer">
          Não tem acesso ainda?{' '}
          <button className="link" onClick={() => navigate('/comprar')}>Adquira aqui</button>
        </p>
      </div>
    </div>
  )
}
