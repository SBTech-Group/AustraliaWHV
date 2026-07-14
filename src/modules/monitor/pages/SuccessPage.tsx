import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { CheckCircle2, Loader2, MessageCircle, Users } from 'lucide-react'

export function SuccessPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [status, setStatus] = useState<'loading' | 'ok' | 'pending'>('loading')

  useEffect(() => {
    const paymentStatus = params.get('status')
    if (paymentStatus === 'approved') {
      setStatus('ok')
    } else if (paymentStatus === 'pending') {
      setStatus('pending')
    } else {
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
            <h1>Pagamento confirmado</h1>
            <p className="auth-sub">
              Seu acesso foi liberado. Acesse o painel com o mesmo WhatsApp confirmado no checkout.
              <br /><br />
              Se a entrada automatica no grupo nao acontecer, o painel mostra o convite disponivel e o canal de suporte.
            </p>
            <div className="success-steps">
              <div className="success-step">
                <MessageCircle size={18} style={{ color: '#4FCB8E' }} />
                <span>Use o mesmo WhatsApp para receber o codigo de login</span>
              </div>
              <div className="success-step">
                <Users size={18} style={{ color: '#E2BE6A' }} />
                <span>Confira no painel se voce ja entrou no grupo de alertas</span>
              </div>
            </div>
            <button className="btn-primary-lg" onClick={() => navigate('/login')}>
              Acessar o painel →
            </button>
          </>
        ) : (
          <>
            <h1>Pagamento em analise</h1>
            <p className="auth-sub">
              Seu pagamento esta sendo processado. Assim que confirmar, o acesso sera liberado automaticamente.
              <br /><br />
              Isso pode levar alguns minutos dependendo do metodo de pagamento.
            </p>
            <button className="btn-outline" onClick={() => navigate('/')}>
              Voltar ao inicio
            </button>
          </>
        )}
      </div>
    </div>
  )
}
