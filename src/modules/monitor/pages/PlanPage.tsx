import { useState } from 'react'
import { ArrowLeft, CheckCircle2, ExternalLink, LifeBuoy, Loader2, RefreshCw, Users, XCircle } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../../../core/auth/AuthContext'
import { usePlan, cicloLabel } from '../../../lib/plan'
import { fmtDateTime } from '../../../lib/cron'
import { whatsappUrl } from '../../../lib/contact'
import { requestGroupAccess } from '../../../lib/groupAccess'

export function PlanPage() {
  const navigate = useNavigate()
  const { subscriber, userConfig, token, refresh, logout } = useAuth()
  const { data: plan } = usePlan()
  const [canceling, setCanceling] = useState(false)
  const [groupBusy, setGroupBusy] = useState(false)
  const [inviteUrl, setInviteUrl] = useState('')

  const expira = subscriber?.access_expires_at
  const supportHref = whatsappUrl(userConfig?.support_whatsapp_number, userConfig?.support_default_message)
  const groupName = userConfig?.whatsapp_group_name?.trim() || 'grupo de alertas'
  const inGroup = Boolean(subscriber?.in_group)
  const groupStatus = subscriber?.group_access_status ?? (inGroup ? 'active' : 'invite_pending')

  async function handleGroupAccess() {
    if (!token) return
    setGroupBusy(true)
    try {
      const res = await requestGroupAccess(token)
      if (res.invite_url) setInviteUrl(res.invite_url)
      toast.success(res.message ?? 'Convite preparado.')
      await refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Nao foi possivel preparar o convite.')
    } finally {
      setGroupBusy(false)
    }
  }

  async function handleCancel() {
    if (!confirm('Cancelar sua assinatura? Voce perdera o acesso ao painel e saira do grupo de alertas.')) return
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
          <div className="status-label">Seu plano</div>
          <div className="sub-grid">
            <div><span className="sub-k">Plano</span><span className="sub-v">{plan.name}</span></div>
            <div><span className="sub-k">Valor</span><span className="sub-v">{plan.priceLabel} <small>{cicloLabel(plan.ciclo)}</small></span></div>
            <div>
              <span className="sub-k">Status do acesso</span>
              <span className="sub-v ok-inline"><CheckCircle2 size={14} /> Ativo</span>
            </div>
            <div>
              <span className="sub-k">{expira ? 'Valido ate' : 'Validade'}</span>
              <span className="sub-v">{expira ? fmtDateTime(expira) : 'Vitalicio'}</span>
            </div>
            <div><span className="sub-k">WhatsApp cadastrado</span><span className="sub-v">{subscriber?.phone ?? '-'}</span></div>
            <div><span className="sub-k">Nome</span><span className="sub-v">{subscriber?.full_name ?? '-'}</span></div>
          </div>
          <p className="plan-copy">
            Se o pagamento foi aprovado, este painel e o grupo de alertas sao os dois pontos principais para acompanhar o servico.
          </p>
        </div>

        <div className="status-card">
          <div className="status-label">Grupo de alertas</div>
          <div className="plan-state-row">
            <div>
              <div className="sub-v" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Users size={15} /> {inGroup ? 'Voce esta no grupo de alertas' : 'Entrada no grupo pendente'}
              </div>
              <p className="plan-copy">
                {inGroup
                  ? `Os alertas sao enviados no ${groupName}.`
                  : groupStatus === 'invite_sent'
                    ? 'Ja enviamos um convite para o seu WhatsApp. Voce pode solicitar novamente depois de alguns minutos.'
                    : 'Se a adicao automatica nao funcionar, solicite um convite seguro pelo painel.'}
              </p>
            </div>
            {!inGroup && (
              <button className="btn-outline-sm" onClick={handleGroupAccess} disabled={groupBusy}>
                {groupBusy ? <RefreshCw size={13} className="spin" /> : <Users size={13} />}
                {groupStatus === 'invite_sent' ? 'Receber novo convite' : 'Entrar no grupo'}
              </button>
            )}
            {inviteUrl && (
              <a className="btn-outline-sm" href={inviteUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink size={13} /> Abrir convite
              </a>
            )}
          </div>
          {!inGroup && !inviteUrl && (
            <p className="plan-copy muted-copy">
              O convite nao fica publico na landing. Ele e liberado somente para assinantes ativos.
            </p>
          )}
        </div>

        <div className="status-card">
          <div className="status-label">Suporte</div>
          <p className="plan-copy">
            Problema com acesso, pagamento aprovado sem entrada no grupo ou duvida sobre vencimento? Use o canal oficial abaixo.
          </p>
          <div className="plan-actions">
            {supportHref ? (
              <a className="btn-outline-sm" href={supportHref} target="_blank" rel="noopener noreferrer">
                <LifeBuoy size={13} /> Falar no WhatsApp
              </a>
            ) : (
              <button className="btn-outline-sm" disabled>
                <LifeBuoy size={13} /> Suporte nao configurado
              </button>
            )}
          </div>
        </div>

        <div className="status-card">
          <div className="status-label">Cancelamento</div>
          <p className="plan-copy">
            Ao cancelar, seu acesso e encerrado e voce sai do grupo de alertas. Esta acao nao altera pagamentos ja processados no Mercado Pago.
          </p>
          <div className="plan-actions">
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
