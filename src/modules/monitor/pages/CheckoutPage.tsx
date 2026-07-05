import { useEffect, useRef, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { ArrowLeft, Loader2, MessageCircle, Copy, Check } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '../../../lib/supabase'
import { loadMercadoPago, MP_AMOUNT, type MercadoPagoInstance } from '../../../lib/mercadopago'

type Step = 'phone' | 'pay' | 'pix'

interface PixData {
  qr_code: string
  qr_code_base64: string
  ticket_url: string
}

function maskPhone(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 11)
  if (digits.length <= 2) return digits
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
}

export function CheckoutPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [phone, setPhone] = useState<string>((location.state as { phone?: string } | null)?.phone ?? '')
  const [fullPhone, setFullPhone] = useState('')
  const [step, setStep] = useState<Step>('phone')
  const [pix, setPix] = useState<PixData | null>(null)
  const [copied, setCopied] = useState(false)

  const brickRef = useRef<{ unmount(): void } | null>(null)
  const mountedRef = useRef(false)

  const handlePhoneSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const digits = phone.replace(/\D/g, '')
    if (digits.length < 10) {
      toast.error('Número inválido. Use DDD + número (ex: 11999998888)')
      return
    }
    setFullPhone(`+55${digits}`)
    setStep('pay')
  }

  // Monta o Payment Brick quando entra na etapa de pagamento.
  useEffect(() => {
    if (step !== 'pay' || mountedRef.current) return
    mountedRef.current = true

    let cancelled = false

    loadMercadoPago()
      .then((mp: MercadoPagoInstance) => {
        if (cancelled) return
        return mp.bricks().create('payment', 'mp-brick-container', {
          initialization: {
            amount: MP_AMOUNT,
            payer: { email: '' },
          },
          customization: {
            paymentMethods: {
              creditCard: 'all',
              bankTransfer: ['pix'],
              maxInstallments: 1,
            },
            visual: { style: { theme: 'default' } },
          },
          callbacks: {
            onReady: () => {},
            onError: (error: unknown) => {
              console.error('brick error', error)
              toast.error('Erro no formulário de pagamento.')
            },
            onSubmit: ({ selectedPaymentMethod, formData }: {
              selectedPaymentMethod: string
              formData: Record<string, unknown>
            }) => {
              return new Promise<void>((resolve, reject) => {
                supabase.functions
                  .invoke('australia-process-payment', {
                    body: { phone: fullPhone, selectedPaymentMethod, formData },
                  })
                  .then(({ data, error }) => {
                    if (error || data?.error) {
                      toast.error(data?.error ?? 'Erro ao processar pagamento.')
                      reject(new Error(data?.error ?? 'erro'))
                      return
                    }

                    if (data.status === 'rejected') {
                      toast.error('Pagamento recusado. Verifique os dados do cartão.')
                      reject(new Error('rejected'))
                      return
                    }

                    resolve()

                    if (data.type === 'pix') {
                      setPix(data.pix as PixData)
                      setStep('pix')
                      startPolling()
                    } else if (data.status === 'approved') {
                      navigate('/sucesso?status=approved')
                    } else {
                      navigate('/sucesso?status=pending')
                    }
                  })
                  .catch(err => {
                    toast.error('Falha na conexão. Tente novamente.')
                    reject(err)
                  })
              })
            },
          },
        })
      })
      .then(controller => {
        if (controller) brickRef.current = controller
      })
      .catch((err: Error) => {
        toast.error(err.message)
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
    const timer = setInterval(async () => {
      if (Date.now() - started > 10 * 60 * 1000) { clearInterval(timer); return }
      const { data } = await supabase.functions.invoke('australia-payment-status', {
        body: { phone: fullPhone },
      })
      if (data?.status === 'approved') {
        clearInterval(timer)
        navigate('/sucesso?status=approved')
      }
    }, 4000)
  }

  const copyPix = async () => {
    if (!pix?.qr_code) return
    await navigator.clipboard.writeText(pix.qr_code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <button
          className="btn-back"
          onClick={() => (step === 'phone' ? navigate('/') : setStep('phone'))}
        >
          <ArrowLeft size={16} /> Voltar
        </button>

        {step === 'phone' && (
          <>
            <div className="auth-icon">
              <MessageCircle size={32} strokeWidth={1.5} />
            </div>
            <h1>Qual é o seu WhatsApp?</h1>
            <p className="auth-sub">
              Enviamos o alerta diretamente para este número quando a Austrália abrir vagas.
            </p>
            <form onSubmit={handlePhoneSubmit} className="auth-form">
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
              <button type="submit" className="btn-primary-lg">
                Continuar para o pagamento →
              </button>
            </form>
            <p className="auth-disclaimer">
              Ao prosseguir você concorda que enviaremos mensagens de alerta WHV para este número via WhatsApp.
            </p>
          </>
        )}

        {step === 'pay' && (
          <>
            <h1>Pagamento</h1>
            <p className="auth-sub">
              Monitor WHV Austrália — <strong>R$ {MP_AMOUNT.toFixed(2).replace('.', ',')}</strong> · acesso vitalício.
            </p>
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
