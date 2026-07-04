import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { CheckCircle2, Loader2, MessageCircle } from 'lucide-react'

export function SuccessPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [status, setStatus] = useState<'loading' | 'ok' | 'pending'>('loading')

  useEffect(() => {
    const paymentStatus = params.get('status')
    // MP redireciona com ?status=approved | pending | failure
    if (paymentStatus === 'approved') {
      setStatus('ok')
    } else if (paymentStatus === 'pending') {
      setStatus('pending')
    } else {
      // Sem parâmetro ou failure → aguarda webhook processar
      setStatus('ok')
    }
  }, [params])

  if (status === 'loading') {
    return (
      <div className="auth-page">
        <Loader2 size={32} className="spin" style={{ color: '#4FCB8E' }} />
      </div>
    )
  }

  return (
    <div className="auth-page">
      <div className="auth-card" style={{ textAlign: 'center' }}>
        {status === 'ok' ? (
          <>
            <div className="success-icon">
              <CheckCircle2 size={48} strokeWidth={1.5} style={{ color: '#4FCB8E' }} />
            </div>
            <h1>Tudo certo! 🎉</h1>
            <p className="auth-sub">
              Pagamento confirmado. Você receberá uma mensagem de boas-vindas no WhatsApp em breve.
              <br /><br />
              Assim que a Austrália abrir vagas WHV, você será um dos primeiros a saber.
            </p>
            <div className="success-steps">
              <div className="success-step">
                <MessageCircle size={18} style={{ color: '#4FCB8E' }} />
                <span>Aguarde a mensagem de confirmação no WhatsApp</span>
              </div>
              <div className="success-step">
                <CheckCircle2 size={18} style={{ color: '#E2BE6A' }} />
                <span>Acesse o painel para acompanhar o status em tempo real</span>
              </div>
            </div>
            <button className="btn-primary-lg" onClick={() => navigate('/login')}>
              Acessar o painel →
            </button>
          </>
        ) : (
          <>
            <h1>Pagamento em análise</h1>
            <p className="auth-sub">
              Seu pagamento está sendo processado. Assim que confirmado, você receberá um WhatsApp.
              <br /><br />
              Isso pode levar alguns minutos dependendo do método de pagamento.
            </p>
            <button className="btn-outline" onClick={() => navigate('/')}>
              Voltar ao início
            </button>
          </>
        )}
      </div>
    </div>
  )
}
