import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import { Copy, Link2, LogOut, Plug, QrCode, RefreshCw, Save, Send, Trash2, Unplug, UserPlus, Users, X } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '../../../lib/supabase'
import { pollWhatsappState, useAdminAction, useAdminConfig, useAdminLogs, useGroups, useSubscribers } from '../hooks/adminMonitor'
import { countdown, cronStatus, relTime, fmtDateTime } from '../../../lib/cron'
import type { DetectedStatus } from '../../../types'

const S: Record<string, CSSProperties> = {
  page: { minHeight: '100vh', background: '#0a0a0a', color: '#e8e8e8', fontFamily: 'system-ui, sans-serif' },
  bar: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 24px', borderBottom: '1px solid #222', background: '#111' },
  main: { maxWidth: 1100, margin: '0 auto', padding: 24 },
  card: { background: '#131313', border: '1px solid #242424', borderRadius: 10, padding: 20 },
  label: { fontSize: 12, color: '#9a9a9a', display: 'block', marginBottom: 4 },
  input: { width: '100%', height: 38, background: '#0d0d0d', border: '1px solid #2a2a2a', borderRadius: 8, color: '#e8e8e8', padding: '0 12px', fontSize: 14 },
  btn: { display: 'inline-flex', alignItems: 'center', gap: 6, height: 38, padding: '0 14px', borderRadius: 8, border: '1px solid #2a2a2a', background: '#1b1b1b', color: '#e8e8e8', cursor: 'pointer', fontSize: 13 },
  btnPrimary: { background: '#2e7d52', borderColor: '#2e7d52', color: '#fff' },
}

const DET: Record<DetectedStatus, { label: string; c: string }> = {
  Open: { label: 'Aberto', c: '#4FCB8E' }, Closed: { label: 'Fechado', c: '#F26D70' },
  Paused: { label: 'Pausado', c: '#E2BE6A' }, Unknown: { label: 'Verificando', c: '#888' },
}
const fmt = (s: string | null | undefined) => (s ? new Date(s).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—')

export function AdminPage() {
  const navigate = useNavigate()
  const { data, isLoading } = useAdminConfig()
  const { data: logs = [], refetch: refetchLogs } = useAdminLogs()
  const { data: subscribers = [] } = useSubscribers()
  const action = useAdminAction()
  const config = data?.config
  const stats = data?.stats

  const [form, setForm] = useState({ enabled: false, check_interval_minutes: 1, whatsapp_instance_name: 'australia_whv_saas', country_name: 'Brazil' })
  const [testNumber, setTestNumber] = useState('')
  const [connectOpen, setConnectOpen] = useState(false)
  // Grupo: só carrega a lista da Evolution quando o admin abre o seletor.
  const [loadGroups, setLoadGroups] = useState(false)
  const [selGroup, setSelGroup] = useState('')
  const { data: groups = [], isFetching: groupsBusy } = useGroups(loadGroups)
  // Novo assinante (E.164 digitado à mão pelo admin).
  const [subName, setSubName] = useState('')
  const [subPhone, setSubPhone] = useState('')
  const [now, setNow] = useState(() => Date.now())
  const seeded = useRef(false)
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])
  useEffect(() => {
    if (config && !seeded.current) {
      seeded.current = true
      setForm({
        enabled: config.enabled,
        check_interval_minutes: config.check_interval_minutes,
        whatsapp_instance_name: config.whatsapp_instance_name,
        country_name: config.country_name,
      })
    }
  }, [config])
  // Re-sincroniza enabled quando o servidor muda (evita salvar valor stale)
  const lastEnabled = useRef<boolean | undefined>(undefined)
  useEffect(() => {
    if (config && config.enabled !== lastEnabled.current) {
      lastEnabled.current = config.enabled
      setForm((f) => ({ ...f, enabled: config.enabled }))
    }
  }, [config])

  async function run(body: Record<string, unknown>, ok: string, busy = 'Processando…') {
    try { toast.info(busy); await action.mutateAsync(body); toast.success(ok) }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Falha') }
  }
  const logout = async () => { await supabase.auth.signOut(); navigate('/admin/login', { replace: true }) }

  // ── Grupo ──
  const saveGroup = () => {
    const g = groups.find((x) => x.jid === selGroup)
    if (!g) { toast.error('Selecione um grupo'); return }
    run({ action: 'set_group', group_jid: g.jid, group_name: g.name }, 'Grupo definido', 'Salvando grupo…')
  }
  const syncGroup = async () => {
    try {
      toast.info('Sincronizando grupo…')
      const res = (await action.mutateAsync({ action: 'sync_group' })) as { added?: number; total?: number }
      toast.success(`Sincronizado: ${res.added ?? 0} de ${res.total ?? 0} adicionados`)
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Falha') }
  }
  const copyInvite = () => {
    if (!config?.whatsapp_group_invite_url) return
    navigator.clipboard.writeText(config.whatsapp_group_invite_url).then(() => toast.success('Convite copiado')).catch(() => toast.error('Não foi possível copiar'))
  }

  // ── Assinantes ──
  const addSub = async () => {
    const phone = subPhone.trim(), full_name = subName.trim()
    if (!phone || !full_name) { toast.error('Informe nome e telefone'); return }
    try {
      toast.info('Adicionando…')
      await action.mutateAsync({ action: 'add_subscriber', phone, full_name })
      toast.success('Assinante adicionado'); setSubName(''); setSubPhone('')
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Falha') }
  }
  const removeSub = (phone: string) => {
    if (confirm(`Remover assinante ${phone}?`)) run({ action: 'remove_subscriber', phone }, 'Assinante removido', 'Removendo…')
  }
  const overdueCount = subscribers.filter((s) => s.active && s.overdue).length

  const detected = (config?.last_detected_status ?? 'Unknown') as DetectedStatus
  const waConnected = config?.whatsapp_status === 'open'
  const cron = cronStatus(config?.last_checked_at, config?.check_interval_minutes, config?.enabled, now)

  return (
    <div style={S.page}>
      <div style={S.bar}>
        <div style={{ fontWeight: 700 }}>Admin — Monitor WHV</div>
        <button style={S.btn} onClick={logout}><LogOut size={15} strokeWidth={1.75} /> Sair</button>
      </div>

      <div style={S.main}>
        {/* KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12, marginBottom: 12 }}>
          {[
            { l: 'Status Brazil', v: DET[detected].label, c: DET[detected].c },
            { l: 'Cron', v: cron.state === 'active' ? 'Ativo' : cron.state === 'off' ? 'Desligado' : cron.state === 'stale' ? 'Parado' : '—', c: cron.healthy ? '#4FCB8E' : cron.state === 'off' ? '#888' : '#F26D70' },
            { l: 'WhatsApp', v: config?.whatsapp_status ?? 'unknown', c: waConnected ? '#4FCB8E' : '#888' },
            { l: 'Assinantes ativos', v: String(stats?.active ?? '—'), c: '#7DA0E8' },
            { l: 'No grupo', v: String(stats?.in_group ?? '—'), c: '#4FCB8E' },
            { l: 'Vencidos', v: String(stats?.overdue ?? '—'), c: (stats?.overdue ?? 0) > 0 ? '#F26D70' : '#888' },
          ].map((k) => (
            <div key={k.l} style={S.card}>
              <div style={{ fontSize: 11.5, color: '#9a9a9a' }}>{k.l}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: k.c, marginTop: 6 }}>{k.v}</div>
            </div>
          ))}
        </div>

        {/* Cron status detalhado */}
        <div style={{ fontSize: 12, color: '#9a9a9a', marginBottom: 16, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <span>Cron: <b style={{ color: cron.healthy ? '#4FCB8E' : '#E2BE6A' }}>{cron.label}</b></span>
          {cron.nextAt && <span>Contagem: <b style={{ color: '#e8e8e8' }}>{countdown(cron.nextAt, now)}</b></span>}
          <span>Última verificação: {fmtDateTime(cron.lastAt)} ({relTime(cron.lastAt)})</span>
          {cron.nextAt && <span>Próxima: {relTime(cron.nextAt)}</span>}
          <span>Aberto desde: {fmt(config?.opened_at)}</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
          {/* Config */}
          <div style={S.card}>
            <h2 style={{ margin: '0 0 16px', fontSize: 15 }}>Configuração</h2>
            <label style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14, fontSize: 13, cursor: 'pointer' }}>
              Monitoramento ativo
              <input type="checkbox" checked={form.enabled} onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))} />
            </label>
            <div style={{ marginBottom: 12 }}>
              <label style={S.label}>Intervalo (min, 1–60) — cadência real = cron</label>
              <input style={S.input} type="number" min={1} max={60} value={form.check_interval_minutes}
                onChange={(e) => setForm((f) => ({ ...f, check_interval_minutes: Math.min(60, Math.max(1, Number(e.target.value) || 1)) }))} />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={S.label}>Nome da instância Evolution</label>
              <input style={S.input} value={form.whatsapp_instance_name} onChange={(e) => setForm((f) => ({ ...f, whatsapp_instance_name: e.target.value }))} />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={S.label}>País (na página oficial)</label>
              <input style={S.input} value={form.country_name} onChange={(e) => setForm((f) => ({ ...f, country_name: e.target.value }))} />
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <button style={{ ...S.btn, ...S.btnPrimary }} disabled={action.isPending}
                onClick={() => run({ action: 'save_config', payload: form }, 'Config salva', 'Salvando…')}>
                <Save size={15} strokeWidth={1.75} /> Salvar
              </button>
              <button style={S.btn} disabled={action.isPending}
                onClick={() => run({ action: 'check_now' }, 'Verificação concluída', 'Verificando…')}>
                <RefreshCw size={15} strokeWidth={1.75} /> Verificar agora
              </button>
            </div>
            <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
              <input style={{ ...S.input, flex: 1 }} placeholder="Número teste (5511...)" value={testNumber}
                onChange={(e) => setTestNumber(e.target.value.replace(/\D/g, ''))} />
              <button style={S.btn} disabled={action.isPending || !testNumber}
                onClick={() => run({ action: 'send_test', number: testNumber }, 'Teste enviado', 'Enviando…')}>
                <Send size={15} strokeWidth={1.75} /> Testar
              </button>
            </div>
          </div>

          {/* WhatsApp */}
          <div style={S.card}>
            <h2 style={{ margin: '0 0 16px', fontSize: 15 }}><Plug size={15} strokeWidth={1.75} style={{ verticalAlign: 'middle', marginRight: 6, color: '#4FCB8E' }} />WhatsApp (instância)</h2>
            <div style={{ fontSize: 13, lineHeight: 2 }}>
              <div>Instância: <code>{config?.whatsapp_instance_name ?? '—'}</code></div>
              <div>Conexão: <span style={{ color: waConnected ? '#4FCB8E' : '#888', fontWeight: 600 }}>{config?.whatsapp_status ?? 'unknown'}</span></div>
              <div style={{ color: '#9a9a9a' }}>Última checagem: {fmt(config?.whatsapp_last_checked_at)}</div>
            </div>
            <div style={{ marginTop: 16, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <button style={S.btn} disabled={action.isPending} onClick={() => run({ action: 'create_instance' }, 'Instância criada/reconciliada', 'Criando…')}><Plug size={15} strokeWidth={1.75} /> Criar / reconciliar</button>
              <button style={S.btn} disabled={action.isPending} onClick={() => run({ action: 'state_instance' }, 'Status atualizado', 'Atualizando…')}><RefreshCw size={15} strokeWidth={1.75} /> Atualizar status</button>
              <button style={{ ...S.btn, ...S.btnPrimary }} onClick={() => setConnectOpen(true)}><QrCode size={15} strokeWidth={1.75} /> Conectar</button>
              <button style={S.btn} disabled={action.isPending} onClick={() => run({ action: 'logout_instance' }, 'Desconectada', 'Desconectando…')}><Unplug size={15} strokeWidth={1.75} /> Desconectar</button>
              <button style={{ ...S.btn, color: '#F26D70' }} disabled={action.isPending}
                onClick={() => { if (confirm('Excluir a instância da Evolution?')) run({ action: 'delete_instance' }, 'Instância excluída', 'Excluindo…') }}>
                <Trash2 size={15} strokeWidth={1.75} /> Excluir
              </button>
            </div>
            <div style={{ marginTop: 14, padding: '8px 12px', background: 'rgba(125,160,232,0.10)', borderRadius: 6, fontSize: 11.5, color: '#9a9a9a', display: 'flex', gap: 8 }}>
              <Users size={14} strokeWidth={1.75} /> Ao detectar <b style={{ color: '#e8e8e8' }}>Open</b>, um único alerta é postado no <b style={{ color: '#e8e8e8' }}>grupo</b> (não em DMs).
            </div>
          </div>
        </div>

        {/* Grupo de alertas */}
        <div style={{ ...S.card, marginBottom: 16 }}>
          <h2 style={{ margin: '0 0 16px', fontSize: 15 }}><Users size={15} strokeWidth={1.75} style={{ verticalAlign: 'middle', marginRight: 6, color: '#4FCB8E' }} />Grupo de alertas (WhatsApp)</h2>
          <div style={{ fontSize: 13, marginBottom: 12 }}>
            Grupo atual: <b style={{ color: '#e8e8e8' }}>{config?.whatsapp_group_name || '(nenhum)'}</b>
          </div>
          {config?.whatsapp_group_invite_url && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
              <input style={{ ...S.input, flex: 1, fontSize: 12 }} readOnly value={config.whatsapp_group_invite_url} />
              <button style={S.btn} onClick={copyInvite}><Copy size={15} strokeWidth={1.75} /> Copiar</button>
            </div>
          )}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            {!loadGroups ? (
              <button style={S.btn} onClick={() => setLoadGroups(true)}><Users size={15} strokeWidth={1.75} /> Carregar grupos</button>
            ) : groupsBusy ? (
              <span style={{ color: '#888', fontSize: 13 }}>Carregando grupos…</span>
            ) : (
              <>
                <select style={{ ...S.input, flex: 1, minWidth: 220 }} value={selGroup} onChange={(e) => setSelGroup(e.target.value)}>
                  <option value="">Selecione um grupo…</option>
                  {groups.map((g) => (<option key={g.jid} value={g.jid}>{g.name} — {g.size}</option>))}
                </select>
                <button style={{ ...S.btn, ...S.btnPrimary }} disabled={action.isPending || !selGroup} onClick={saveGroup}><Save size={15} strokeWidth={1.75} /> Salvar grupo</button>
              </>
            )}
            <button style={S.btn} disabled={action.isPending} onClick={() => run({ action: 'refresh_invite' }, 'Convite atualizado', 'Atualizando…')}><Link2 size={15} strokeWidth={1.75} /> Atualizar convite</button>
            <button style={S.btn} disabled={action.isPending} onClick={syncGroup}><RefreshCw size={15} strokeWidth={1.75} /> Sincronizar grupo</button>
          </div>
        </div>

        {/* Assinantes */}
        <div style={{ ...S.card, marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h2 style={{ margin: 0, fontSize: 15 }}>Assinantes ({subscribers.length})</h2>
            {overdueCount > 0 && <span style={{ fontSize: 12, color: '#F26D70' }}>{overdueCount} vencido(s)</span>}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
            <input style={{ ...S.input, flex: 2, minWidth: 160 }} placeholder="Nome completo" value={subName} onChange={(e) => setSubName(e.target.value)} />
            <input style={{ ...S.input, flex: 1, minWidth: 140 }} placeholder="+5511999999999" value={subPhone} onChange={(e) => setSubPhone(e.target.value)} />
            <button style={{ ...S.btn, ...S.btnPrimary }} disabled={action.isPending || !subName.trim() || !subPhone.trim()} onClick={addSub}><UserPlus size={15} strokeWidth={1.75} /> Adicionar</button>
          </div>
          {subscribers.length === 0 ? <div style={{ color: '#888' }}>Nenhum assinante.</div> : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', fontSize: 12.5, borderCollapse: 'collapse' }}>
                <thead><tr style={{ color: '#888', textAlign: 'left' }}>
                  <th style={{ padding: '6px 8px' }}>Nome</th><th style={{ padding: '6px 8px' }}>Telefone</th>
                  <th style={{ padding: '6px 8px' }}>Status</th><th style={{ padding: '6px 8px' }}>Acesso</th>
                  <th style={{ padding: '6px 8px' }}>Grupo</th><th style={{ padding: '6px 8px' }}>Ação</th>
                </tr></thead>
                <tbody>
                  {subscribers.map((s) => (
                    <tr key={s.id} style={{ borderTop: '1px solid #222', background: s.overdue ? 'rgba(242,109,112,0.07)' : undefined }}>
                      <td style={{ padding: '6px 8px' }}>{s.full_name ?? '—'}</td>
                      <td style={{ padding: '6px 8px', fontFamily: 'monospace' }}>{s.phone}</td>
                      <td style={{ padding: '6px 8px', color: s.active ? '#4FCB8E' : '#888' }}>{s.active ? 'Ativo' : 'Inativo'}</td>
                      <td style={{ padding: '6px 8px', color: s.overdue ? '#F26D70' : '#9a9a9a' }}>
                        {s.overdue ? 'Vencido' : s.access_expires_at ? `ok até ${fmt(s.access_expires_at)}` : 'vitalício'}
                      </td>
                      <td style={{ padding: '6px 8px' }}>{s.in_group ? '✓' : '—'}</td>
                      <td style={{ padding: '6px 8px' }}>
                        <button style={{ ...S.btn, height: 30, padding: '0 8px', color: '#F26D70' }} disabled={action.isPending} onClick={() => removeSub(s.phone)}><Trash2 size={14} strokeWidth={1.75} /> Remover</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Logs */}
        <div style={S.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h2 style={{ margin: 0, fontSize: 15 }}>Logs (últimos 100)</h2>
            <button style={S.btn} onClick={() => refetchLogs()}><RefreshCw size={15} strokeWidth={1.75} /> Atualizar</button>
          </div>
          {isLoading ? <div style={{ color: '#888' }}>Carregando…</div> : logs.length === 0 ? <div style={{ color: '#888' }}>Nenhum log.</div> : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', fontSize: 12.5, borderCollapse: 'collapse' }}>
                <thead><tr style={{ color: '#888', textAlign: 'left' }}>
                  <th style={{ padding: '6px 8px' }}>Data/hora</th><th style={{ padding: '6px 8px' }}>Nível</th>
                  <th style={{ padding: '6px 8px' }}>Ação</th><th style={{ padding: '6px 8px' }}>Status</th><th style={{ padding: '6px 8px' }}>Mensagem</th>
                </tr></thead>
                <tbody>
                  {logs.map((l) => (
                    <tr key={l.id} style={{ borderTop: '1px solid #222' }}>
                      <td style={{ padding: '6px 8px', whiteSpace: 'nowrap', color: '#9a9a9a' }}>{fmt(l.created_at)}</td>
                      <td style={{ padding: '6px 8px', color: { success: '#4FCB8E', warning: '#E2BE6A', error: '#F26D70', info: '#7DA0E8' }[l.level] ?? '#888' }}>{l.level}</td>
                      <td style={{ padding: '6px 8px', fontFamily: 'monospace' }}>{l.action}</td>
                      <td style={{ padding: '6px 8px' }}>{l.detected_status ?? '—'}</td>
                      <td style={{ padding: '6px 8px' }}>{l.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {connectOpen && <ConnectOverlay onClose={() => setConnectOpen(false)} />}
    </div>
  )
}

// ── Overlay QR / pairing ──────────────────────────────────────────────────────
type QrState = 'idle' | 'loading' | 'ready' | 'expired' | 'connected' | 'error'
function ConnectOverlay({ onClose }: { onClose: () => void }) {
  const action = useAdminAction()
  const [qrState, setQrState] = useState<QrState>('idle')
  const [qr, setQr] = useState<string | null>(null)
  const [pairing, setPairing] = useState<string | null>(null)
  const [usePairing, setUsePairing] = useState(false)
  const [phone, setPhone] = useState('')
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const stop = useCallback(() => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null } }, [])
  const startPoll = useCallback(() => {
    stop()
    pollRef.current = setInterval(async () => {
      try { if ((await pollWhatsappState()) === 'open') { stop(); setQrState('connected'); setTimeout(onClose, 1200) } } catch { /* ignora */ }
    }, 3000)
  }, [onClose, stop])
  const request = useCallback(async () => {
    setQrState('loading'); setQr(null); setPairing(null); stop()
    try {
      const body: Record<string, unknown> = { action: 'connect_instance', mode: usePairing ? 'pairing' : 'qr' }
      if (usePairing) body.number = phone.replace(/\D/g, '')
      const res = (await action.mutateAsync(body)) as Record<string, unknown>
      const base64 = res?.base64 as string | undefined
      const pcode = res?.pairingCode as string | undefined
      if (pcode) { setPairing(pcode); setQrState('ready'); startPoll() }
      else if (base64) { setQr(base64); setQrState('ready'); startPoll() }
      else { const st = (res as { instance?: { state?: string } })?.instance?.state; if (st === 'open') { setQrState('connected'); setTimeout(onClose, 800) } else { setQrState('error'); toast.error('QR/pairing não retornado') } }
    } catch (e) { setQrState('error'); toast.error(e instanceof Error ? e.message : 'Falha') }
  }, [action, usePairing, phone, startPoll, stop, onClose])
  useEffect(() => () => stop(), [stop])

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.7)' }} onClick={onClose} />
      <div style={{ position: 'relative', width: 380, maxWidth: '90%', background: '#131313', border: '1px solid #2a2a2a', borderRadius: 10, padding: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <b style={{ display: 'flex', gap: 8, alignItems: 'center' }}><QrCode size={18} strokeWidth={1.75} color="#4FCB8E" /> Conectar WhatsApp</b>
          <button style={{ ...S.btn, height: 30, padding: '0 8px' }} onClick={onClose}><X size={14} strokeWidth={1.75} /></button>
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <button style={{ ...S.btn, flex: 1, ...(usePairing ? {} : S.btnPrimary) }} onClick={() => setUsePairing(false)}>QR Code</button>
          <button style={{ ...S.btn, flex: 1, ...(usePairing ? S.btnPrimary : {}) }} onClick={() => setUsePairing(true)}>Pairing</button>
        </div>
        {usePairing && <input style={{ ...S.input, marginBottom: 12 }} placeholder="Número com DDI (5511...)" value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))} />}
        <div style={{ minHeight: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0d0d0d', borderRadius: 8, padding: 20, textAlign: 'center' }}>
          {qrState === 'idle' && <button style={{ ...S.btn, ...S.btnPrimary }} onClick={request}><QrCode size={15} strokeWidth={1.75} /> {usePairing ? 'Gerar pairing' : 'Gerar QR'}</button>}
          {qrState === 'loading' && <div style={{ color: '#888' }}><RefreshCw size={28} strokeWidth={1.75} className="spin" /><div>Solicitando…</div></div>}
          {qrState === 'ready' && qr && <img src={qr} alt="QR" style={{ width: 200, height: 200, borderRadius: 4 }} />}
          {qrState === 'ready' && pairing && <div><div style={{ fontFamily: 'monospace', fontSize: 26, fontWeight: 700, letterSpacing: '0.15em' }}>{pairing}</div><p style={{ fontSize: 12, color: '#9a9a9a' }}>WhatsApp → Dispositivos vinculados → Vincular com número</p></div>}
          {qrState === 'expired' && <button style={{ ...S.btn, ...S.btnPrimary }} onClick={request}><RefreshCw size={15} strokeWidth={1.75} /> Gerar novo</button>}
          {qrState === 'error' && <button style={S.btn} onClick={request}><RefreshCw size={15} strokeWidth={1.75} /> Tentar de novo</button>}
          {qrState === 'connected' && <div style={{ color: '#4FCB8E', fontWeight: 700 }}>Conectado!</div>}
        </div>
        <div style={{ marginTop: 14, textAlign: 'right' }}><button style={S.btn} onClick={onClose}>Fechar</button></div>
      </div>
    </div>
  )
}
