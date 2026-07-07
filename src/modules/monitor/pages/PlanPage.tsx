import { useState } from 'react'
import { ArrowLeft, CheckCircle2, LifeBuoy, Loader2, XCircle } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../../../core/auth/AuthContext'
import { usePlan, cicloLabel } from '../../../lib/plan'
import { fmtDateTime } from '../../../lib/cron'

export function PlanPage() {
  const navigate = useNavigate()
  const { subscriber, token, logout } = useAuth()
  const { data: plan } = usePlan()
  const [canceling, setCanceling] = useState(false)

  const expira = subscriber?.access_expires_at

  async function handleCancel() {
    if (!confirm('Cancelar sua assinatura? Você perderá o acesso ao painel e sairá do grupo de alertas.')) return
    setCanceling(true)
    try {
      const { data, error } = await supabase.functions.invoke('australia-cancel', { body: { session_token: token } })
      if (error || (data as { error?: string })?.error) throw new Error((data as { error?: string })?.error ?? 'Erro ao cancelar')
      toast.success('Assinatura cancelada.')
      logout()
      navigate('/login')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao cancelar.')
    } finally {
      setCanceling(false)
    }
  }

  return (
    <div className="monitor-shell">
      <header className="monitor-topbar">
        <div className="monitor-topbar-left">
          <span className="logo-flag">🇦🇺</span>
          <span className="monitor-title">Plano e assinatura</span>
        </div>
        <button className="btn-outline-sm" onClick={() => navigate('/monitor')}>
          <ArrowLeft size={13} /> Voltar ao monitor
        </button>
      </header>

      <main className="monitor-main">
        <div className="status-card">
          <div className="status-label">Assinatura</div>
          <div className="sub-grid">
            <div><span className="sub-k">Plano</span><span className="sub-v">{plan.name}</span></div>
            <div><span className="sub-k">Valor</span><span className="sub-v">{plan.priceLabel} <small>{cicloLabel(plan.ciclo)}</small></span></div>
            <div>
              <span className="sub-k">Situação</span>
              <span className="sub-v" style={{ color: '#4FCB8E', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <CheckCircle2 size={14} /> Ativo
              </span>
            </div>
            <div>
              <span className="sub-k">{expira ? 'Renova/expira em' : 'Acesso'}</span>
              <span className="sub-v">{expira ? fmtDateTime(expira) : 'Vitalício'}</span>
            </div>
            <div><span className="sub-k">WhatsApp</span><span className="sub-v">{subscriber?.phone ?? '-'}</span></div>
            <div><span className="sub-k">Nome</span><span className="sub-v">{subscriber?.full_name ?? '-'}</span></div>
          </div>
        </div>

        <div className="status-card">
          <div className="status-label">Suporte e cancelamento</div>
          <p className="plan-copy">
            O cancelamento fica separado do monitor para evitar cliques acidentais. Ao cancelar, seu acesso é encerrado e você sai do grupo de alertas.
          </p>
          <div className="plan-actions">
            <a className="btn-outline-sm" href="mailto:suporte@sbtech-group.com">
              <LifeBuoy size={13} /> Falar com suporte
            </a>
            <button className="btn-outline-sm cancel-link" onClick={handleCancel} disabled={canceling}>
              {canceling ? <Loader2 size={13} className="spin" /> : <XCircle size={13} />}
              {canceling ? 'Cancelando...' : 'Cancelar assinatura'}
            </button>
          </div>
        </div>
      </main>
    </div>
  )
}
