import { useEffect, useRef, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { ArrowLeft, Loader2, MessageCircle, Copy, Check, CreditCard, QrCode, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '../../../lib/supabase'
import { loadMercadoPago, type MercadoPagoInstance } from '../../../lib/mercadopago'
import { PhoneInput } from '../../../components/PhoneInput'
import { COUNTRIES, DEFAULT_COUNTRY, maskPhone, toE164, type Country } from '../../../lib/countries'
import { usePlan } from '../../../lib/plan'

type Step = 'contact' | 'confirm' | 'method' | 'card' | 'pix'

interface PixData {
  qr_code: string
  qr_code_base64: string
  ticket_url: string
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// supabase-js v2: em resposta não-2xx (ex: 409 "já possui acesso"), o corpo vem
// em error.context (Response), NÃO em data. Lê a mensagem específica do backend.
async function serverErrMsg(error: unknown, fallback: string): Promise<string> {
  const ctx = (error as { context?: Response })?.context
  if (ctx && typeof ctx.json === 'function') {
    try {
      const b = await ctx.json()
      if (b?.error) return b.error as string
    } catch { /* corpo não-JSON */ }
  }
  return (error as { message?: string })?.message ?? fallback
}

export function CheckoutPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { data: plan } = usePlan()

  // Prefill opcional vindo da landing ({ phoneDigits, countryIso }).
  const navState = location.state as { phone?: string; phoneDigits?: string; countryIso?: string } | null
  const initialCountry = COUNTRIES.find(c => c.iso === navState?.countryIso) ?? DEFAULT_COUNTRY

  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [country, setCountry] = useState<Country>(initialCountry)
  const [phone, setPhone] = useState<string>(navState?.phoneDigits ? maskPhone(navState.phoneDigits, initialCountry.mask) : '')
  const [fullPhone, setFullPhone] = useState('')

  const [step, setStep] = useState<Step>('contact')
  const [pix, setPix] = useState<PixData | null>(null)
  const [copied, setCopied] = useState(false)
  const [pixLoading, setPixLoading] = useState(false)
  const [contactConfirmed, setContactConfirmed] = useState(false)
  const [otpSent, setOtpSent] = useState(false)
  const [otp, setOtp] = useState('')
  const [otpLoading, setOtpLoading] = useState(false)
  const [checkoutVerificationToken, setCheckoutVerificationToken] = useState('')

  // Pré-checagem de acesso ao entrar no passo 'method'.
  const [checkingAccess, setCheckingAccess] = useState(false)
  const [hasActiveAccess, setHasActiveAccess] = useState(false)
  const [accessExpiresAt, setAccessExpiresAt] = useState<string | null>(null)

  const brickRef = useRef<{ unmount(): void } | null>(null)
  const mountedRef = useRef(false)
  const pollRef = useRef<number | null>(null)

  const handleContactSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (fullName.trim().length < 3) {
      toast.error('Informe seu nome completo.')
      return
    }
    if (!EMAIL_RE.test(email)) {
      toast.error('E-mail inválido.')
      return
    }
    const digits = phone.replace(/\D/g, '')
    if (digits.length < 8) {
      toast.error('Número de telefone inválido.')
      return
    }
    setFullPhone(toE164(country.code, digits))
    setContactConfirmed(false)
    setOtpSent(false)
    setOtp('')
    setCheckoutVerificationToken('')
    setHasActiveAccess(false)
    setAccessExpiresAt(null)
    setStep('confirm')
  }

  // ── Pré-checagem: já possui acesso ativo? ──────────────────────────────────
  const sendCheckoutOtp = async () => {
    if (!contactConfirmed) {
      toast.error('Confirme que os dados estao corretos antes de receber o codigo.')
      return
    }
    setOtpLoading(true)
    try {
      const { data, error } = await supabase.functions.invoke('australia-send-otp', {
        body: { phone: fullPhone, purpose: 'checkout' },
      })
      if (error) throw new Error(await serverErrMsg(error, 'Erro ao enviar código'))
      if (data?.error) throw new Error(data.error)
      setOtpSent(true)
      setOtp('')
      toast.success('Codigo enviado no WhatsApp.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao enviar codigo.')
    } finally {
      setOtpLoading(false)
    }
  }

  const verifyCheckoutOtp = async () => {
    if (otp.length !== 6) {
      toast.error('Digite o codigo de 6 digitos.')
      return
    }
    setOtpLoading(true)
    try {
      const { data, error } = await supabase.functions.invoke('australia-verify-otp', {
        body: { phone: fullPhone, code: otp, purpose: 'checkout' },
      })
      if (error) throw new Error(await serverErrMsg(error, 'Código inválido ou expirado'))
      if (data?.error) throw new Error(data.error)
      const token = data?.checkout_verification_token as string | undefined
      if (!token) throw new Error('Nao foi possivel confirmar o WhatsApp.')
      setCheckoutVerificationToken(token)
      toast.success('WhatsApp confirmado.')
      setStep('method')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Codigo invalido.')
    } finally {
      setOtpLoading(false)
    }
  }

  useEffect(() => {
    if (step !== 'method' || !fullPhone) return
    let cancelled = false
    setCheckingAccess(true)
    supabase.functions
      .invoke('australia-payment-status', { body: { phone: fullPhone } })
      .then(({ data }) => {
        if (cancelled) return
        if (data?.has_active_access) {
          setHasActiveAccess(true)
          setAccessExpiresAt((data.access_expires_at as string | null) ?? null)
        }
      })
      .finally(() => { if (!cancelled) setCheckingAccess(false) })
    return () => { cancelled = true }
  }, [step, fullPhone])

  // ── PIX direto: gera QR na hora usando os dados de contato ─────────────────
  const handlePix = async () => {
    if (!checkoutVerificationToken) {
      toast.error('Confirme seu WhatsApp antes de pagar.')
      setStep('confirm')
      return
    }
    setPixLoading(true)
    try {
      const { data, error } = await supabase.functions.invoke('australia-process-payment', {
        body: {
          phone: fullPhone,
          full_name: fullName,
          email,
          selectedPaymentMethod: 'pix',
          formData: { payer: { email } },
          checkout_verification_token: checkoutVerificationToken,
        },
      })
      if (error) throw new Error(await serverErrMsg(error, 'Erro ao gerar PIX'))
      if (data?.error || !data?.pix?.qr_code) throw new Error(data?.error ?? 'Erro ao gerar PIX')
      setPix(data.pix as PixData)
      setStep('pix')
      startPolling()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao gerar PIX. Tente novamente.')
    } finally {
      setPixLoading(false)
    }
  }

  // ── Cartão: monta o cardPayment Brick (só formulário de cartão) ────────────
  useEffect(() => {
    if (step !== 'card' || mountedRef.current) return
    mountedRef.current = true
    let cancelled = false

    loadMercadoPago()
      .then((mp: MercadoPagoInstance) => {
        if (cancelled) return
        return mp.bricks().create('cardPayment', 'mp-brick-container', {
          initialization: { amount: plan.price },
          customization: { paymentMethods: { maxInstallments: 1 } },
          callbacks: {
            onReady: () => {},
            onError: (error: unknown) => {
              console.error('brick error', error)
              toast.error('Erro no formulário de cartão.')
            },
            onSubmit: (formData: Record<string, unknown>) => {
              return new Promise<void>((resolve, reject) => {
                void (async () => {
                  try {
                    const { data, error } = await supabase.functions.invoke('australia-process-payment', {
                      body: { phone: fullPhone, full_name: fullName, email, selectedPaymentMethod: 'credit_card', formData, checkout_verification_token: checkoutVerificationToken },
                    })
                    if (error) {
                      const m = await serverErrMsg(error, 'Erro ao processar pagamento.')
                      toast.error(m); reject(new Error(m)); return
                    }
                    if (data?.error) {
                      toast.error(data.error); reject(new Error(data.error)); return
                    }
                    if (data.status === 'rejected') {
                      toast.error('Pagamento recusado. Verifique os dados do cartão.')
                      reject(new Error('rejected')); return
                    }
                    resolve()
                    navigate(data.status === 'approved' ? '/sucesso?status=approved' : '/sucesso?status=pending')
                  } catch (err) {
                    toast.error('Falha na conexão. Tente novamente.')
                    reject(err)
                  }
                })()
              })
            },
          },
        })
      })
      .then(controller => { if (controller) brickRef.current = controller })
      .catch((err: Error) => {
        const message = /invalid credentials/i.test(err.message)
          ? 'Pagamento temporariamente indisponível. Fale com o suporte para finalizar a assinatura.'
          : err.message
        toast.error(message)
        mountedRef.current = false
      })

    return () => {
      cancelled = true
      brickRef.current?.unmount()
      brickRef.current = null
      mountedRef.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

  // Polling do status enquanto o cliente paga via PIX.
  const startPolling = () => {
    const started = Date.now()
    pollRef.current = window.setInterval(async () => {
      if (Date.now() - started > 10 * 60 * 1000) {
        if (pollRef.current) clearInterval(pollRef.current)
        return
      }
      const { data } = await supabase.functions.invoke('australia-payment-status', {
        body: { phone: fullPhone },
      })
      if (data?.status === 'approved') {
        if (pollRef.current) clearInterval(pollRef.current)
        navigate('/sucesso?status=approved')
      }
    }, 4000)
  }

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current) }, [])

  const copyPix = async () => {
    if (!pix?.qr_code) return
    await navigator.clipboard.writeText(pix.qr_code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const goBack = () => {
    if (step === 'contact') return navigate('/')
    if (step === 'confirm') return setStep('contact')
    if (step === 'method') return setStep('confirm')
    if (step === 'card' || step === 'pix') return setStep('method')
    return setStep('contact')
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <button className="btn-back" onClick={goBack}>
          <ArrowLeft size={16} /> Voltar
        </button>

        {step === 'contact' && (
          <>
            <div className="auth-icon">
              <MessageCircle size={32} strokeWidth={1.5} />
            </div>
            <h1>Seus dados</h1>
            <p className="auth-sub">
              Enviamos os alertas de vagas WHV para o seu WhatsApp e liberamos o acesso ao painel.
            </p>
            <form onSubmit={handleContactSubmit} className="auth-form">
              <div className="field">
                <label htmlFor="fullName">Nome completo</label>
                <input
                  id="fullName"
                  type="text"
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  placeholder="Seu nome completo"
                  autoFocus
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="email">E-mail</label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="voce@email.com"
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="phone">WhatsApp</label>
                <PhoneInput
                  country={country}
                  onCountryChange={setCountry}
                  phone={phone}
                  onPhoneChange={setPhone}
                  variant="auth"
                  id="phone"
                />
              </div>
              <button type="submit" className="btn-primary-lg">
                Continuar e confirmar WhatsApp →
              </button>
            </form>
            <p className="auth-disclaimer">
              Ao prosseguir você concorda com os{' '}
              <button type="button" className="link" onClick={() => navigate('/termos')}>
                Termos e Política de Privacidade
              </button>{' '}
              e que enviaremos mensagens de alerta WHV para este número via WhatsApp.
            </p>
          </>
        )}

        {step === 'confirm' && (
          <>
            <div className="auth-icon">
              <ShieldCheck size={32} strokeWidth={1.5} />
            </div>
            <h1>Confirme seus dados</h1>
            <p className="auth-sub">
              O acesso ao painel, o código de login e os alertas serão enviados para estes contatos.
            </p>
            <div className="confirm-summary">
              <div><span>Nome</span><strong>{fullName.trim()}</strong></div>
              <div><span>E-mail</span><strong>{email}</strong></div>
              <div><span>WhatsApp</span><strong>{fullPhone}</strong></div>
              <div><span>País</span><strong>{country.name}</strong></div>
            </div>
            <label className="confirm-check">
              <input
                type="checkbox"
                checked={contactConfirmed}
                onChange={(e) => setContactConfirmed(e.target.checked)}
              />
              <span>Confirmo que os dados estão corretos e que consigo receber mensagens neste WhatsApp.</span>
            </label>
            {!otpSent ? (
              <button className="btn-primary-lg" disabled={!contactConfirmed || otpLoading} onClick={sendCheckoutOtp}>
                {otpLoading ? <><Loader2 size={16} className="spin" /> Enviando codigo...</> : 'Receber codigo no WhatsApp'}
              </button>
            ) : (
              <div className="auth-form">
                <div className="field">
                  <label htmlFor="checkout-otp">Codigo enviado para {fullPhone}</label>
                  <input
                    id="checkout-otp"
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
                <button className="btn-primary-lg" disabled={otpLoading || otp.length !== 6} onClick={verifyCheckoutOtp}>
                  {otpLoading ? <><Loader2 size={16} className="spin" /> Confirmando...</> : 'Confirmar WhatsApp e pagar'}
                </button>
                <button type="button" className="btn-text" onClick={sendCheckoutOtp} disabled={otpLoading}>
                  Reenviar codigo
                </button>
              </div>
            )}
            <button type="button" className="btn-text" onClick={() => setStep('contact')}>
              Corrigir dados
            </button>
            <p className="auth-disclaimer">
              Dados incorretos podem liberar o pagamento sem permitir acesso ao painel ou recebimento dos alertas.
            </p>
          </>
        )}

        {step === 'method' && (
          <>
            <h1>Pagamento</h1>
            {checkingAccess ? (
              <div className="pix-waiting">
                <Loader2 size={16} className="spin" /> Verificando acesso...
              </div>
            ) : hasActiveAccess ? (
              <div style={{ textAlign: 'center' }}>
                <p className="auth-sub">
                  ✅ Você já possui um acesso ativo
                  {accessExpiresAt ? ` até ${new Date(accessExpiresAt).toLocaleDateString('pt-BR')}` : ''}.
                </p>
                <button className="btn-primary-lg" onClick={() => navigate('/login')}>
                  Entrar no painel →
                </button>
              </div>
            ) : (
              <>
                <p className="auth-sub">
                  {plan.name} — <strong>{plan.priceLabel}</strong> · Assinatura anual · Cancele quando quiser
                </p>
                <div className="pay-methods">
                  <button className="pay-method" onClick={handlePix} disabled={pixLoading}>
                    {pixLoading ? <Loader2 size={22} className="spin" /> : <QrCode size={22} />}
                    <div>
                      <strong>PIX</strong>
                      <span>Aprovação na hora</span>
                    </div>
                  </button>
                  <button className="pay-method" onClick={() => setStep('card')}>
                    <CreditCard size={22} />
                    <div>
                      <strong>Cartão de crédito</strong>
                      <span>À vista</span>
                    </div>
                  </button>
                </div>
              </>
            )}
          </>
        )}

        {step === 'card' && (
          <>
            <h1>Cartão de crédito</h1>
            <p className="auth-sub">Assinatura anual · {plan.priceLabel}</p>
            <div id="mp-brick-container" className="mp-brick" />
          </>
        )}

        {step === 'pix' && pix && (
          <div style={{ textAlign: 'center' }}>
            <h1>Pague com PIX</h1>
            <p className="auth-sub">
              Escaneie o QR Code ou copie o código. A confirmação é automática.
            </p>
            {pix.qr_code_base64 && (
              <img
                className="pix-qr"
                src={`data:image/png;base64,${pix.qr_code_base64}`}
                alt="QR Code PIX"
              />
            )}
            <button className="btn-outline pix-copy" onClick={copyPix}>
              {copied ? <><Check size={16} /> Copiado!</> : <><Copy size={16} /> Copiar código PIX</>}
            </button>
            <div className="pix-waiting">
              <Loader2 size={16} className="spin" /> Aguardando pagamento...
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
