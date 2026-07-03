import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  BellRing,
  Globe2,
  Plane,
  Plug,
  QrCode,
  RefreshCw,
  Save,
  Send,
  Trash2,
  Unplug,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { ConfirmModal } from './ConfirmModal'
import { pollWhatsappState, useAustraliaWhvAction, useAustraliaWhvConfig, useAustraliaWhvLogs } from './hooks'
import type { AustraliaWhvDetectedStatus, AustraliaWhvLogLevel } from './types'

const OFFICIAL_URL = 'https://immi.homeaffairs.gov.au/what-we-do/whm-program/status-of-country-caps#'

const DETECTED_META: Record<AustraliaWhvDetectedStatus, { label: string; fg: string; tint: string }> = {
  Open:    { label: 'Open',    fg: '#4FCB8E', tint: 'rgba(61,214,140,0.14)' },
  Closed:  { label: 'Closed',  fg: '#F26D70', tint: 'rgba(242,109,112,0.14)' },
  Paused:  { label: 'Paused',  fg: '#F5A623', tint: 'rgba(245,166,35,0.14)' },
  Unknown: { label: 'Unknown', fg: '#7D8590', tint: 'rgba(125,133,144,0.12)' },
}

const LOG_META: Record<AustraliaWhvLogLevel, { fg: string; cls: string }> = {
  info:    { fg: '#7DA0E8', cls: 'b-info' },
  success: { fg: '#4FCB8E', cls: 'b-success' },
  warning: { fg: '#F5A623', cls: 'b-warning' },
  error:   { fg: '#F26D70', cls: 'b-danger' },
}

function fmt(dt: string | null | undefined) {
  if (!dt) return '—'
  return new Date(dt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

const WA_CONNECTED = 'open'

export function AustraliaWhvPage() {
  const { data: config, isLoading } = useAustraliaWhvConfig()
  const { data: logs = [], refetch: refetchLogs, isFetching: logsFetching } = useAustraliaWhvLogs()
  const action = useAustraliaWhvAction()

  const [form, setForm] = useState({
    enabled: false,
    numbersText: '',
    check_interval_minutes: 5,
    auto_pause_after_open: true,
    whatsapp_instance_name: 'australia_whv_monitor',
  })
  const seeded = useRef(false)
  useEffect(() => {
    if (config && !seeded.current) {
      seeded.current = true
      const seedNumbers = config.whatsapp_target_numbers?.length
        ? config.whatsapp_target_numbers
        : config.whatsapp_target_number
          ? [config.whatsapp_target_number]
          : []
      setForm({
        enabled: config.enabled,
        numbersText: seedNumbers.join('\n'),
        check_interval_minutes: config.check_interval_minutes,
        auto_pause_after_open: config.auto_pause_after_open,
        whatsapp_instance_name: config.whatsapp_instance_name,
      })
    }
  }, [config])

  const lastServerEnabled = useRef<boolean | undefined>(undefined)
  useEffect(() => {
    if (config && config.enabled !== lastServerEnabled.current) {
      lastServerEnabled.current = config.enabled
      setForm((f) => ({ ...f, enabled: config.enabled }))
    }
  }, [config])

  const [connectOpen, setConnectOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const waConnected = config?.whatsapp_status === WA_CONNECTED

  async function run(body: Record<string, unknown>, okMsg: string, busy = 'Processando…') {
    try {
      toast.info(busy)
      await action.mutateAsync(body)
      toast.success(okMsg)
    } catch (err: unknown) {
      toast.error((err as Error).message ?? 'Falha na operação')
    }
  }

  function parseNumbers(text: string): string[] {
    const nums = text.split(/[\n,;]+/).map((s) => s.replace(/\D/g, '')).filter(Boolean)
    return Array.from(new Set(nums))
  }

  async function handleSave() {
    await run(
      {
        action: 'save_config',
        payload: {
          enabled: form.enabled,
          whatsapp_target_numbers: parseNumbers(form.numbersText),
          auto_pause_after_open: form.auto_pause_after_open,
          whatsapp_instance_name: form.whatsapp_instance_name.trim() || 'australia_whv_monitor',
        },
      },
      'Configuração salva',
      'Salvando…',
    )
  }

  const detected = (config?.last_detected_status ?? 'Unknown') as AustraliaWhvDetectedStatus
  const detMeta = DETECTED_META[detected] ?? DETECTED_META.Unknown
  const totalChecks = logs.filter((l) => l.action === 'check' && (l.level === 'success' || l.level === 'warning')).length
  const totalErrors = logs.filter((l) => l.level === 'error').length

  const kpis = [
    { label: 'Status Brazil', value: detMeta.label, fg: detMeta.fg, tint: detMeta.tint },
    {
      label: 'Monitor',
      value: config?.enabled ? 'Ativo' : 'Inativo',
      fg: config?.enabled ? '#4FCB8E' : '#7D8590',
      tint: config?.enabled ? 'rgba(61,214,140,0.14)' : 'rgba(125,133,144,0.12)',
    },
    { label: 'Última verificação', value: fmt(config?.last_checked_at), fg: '#E2BE6A', tint: 'rgba(212,168,74,0.12)', small: true },
    { label: 'Último alerta', value: fmt(config?.notified_at), fg: '#F5A623', tint: 'rgba(245,166,35,0.12)', small: true },
    { label: 'Verificações (100 logs)', value: String(totalChecks), fg: '#7DA0E8', tint: 'rgba(125,160,232,0.12)' },
    { label: 'Erros (100 logs)', value: String(totalErrors), fg: '#F26D70', tint: 'rgba(242,109,112,0.12)' },
  ]

  return (
    <div className="page">
      <div className="page-head" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Plane strokeWidth={1.75} style={{ width: 22, height: 22, color: '#E2BE6A' }} />
            Austrália WHV
          </h1>
          <p>Monitor temporário da abertura do Work and Holiday Visa (Austrália) para o Brasil. Descartável.</p>
        </div>
      </div>

      <div className="card" style={{ padding: '10px 14px', marginBottom: 12, background: 'rgba(245,166,35,0.10)', border: '1px solid rgba(245,166,35,0.35)', fontSize: 12.5, color: 'hsl(var(--sb-fg-2))' }}>
        Dois gatilhos ativos: <strong>scrape da página oficial</strong> (cron a cada 2min → dispara ao marcar Open) <strong>e</strong> o <strong>bot Playwright</strong> (<code style={{ fontFamily: 'var(--sb-font-mono)' }}>C:\Projetos\WHV</code>, valida no formulário). Atenção: a página pode marcar Open com o formulário ainda travado — o scrape pode dar alerta antecipado/falso.
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12, marginBottom: 12 }}>
        {kpis.map((k) => (
          <div key={k.label} className="card" style={{ padding: '14px 16px', background: k.tint }}>
            <div style={{ fontSize: 11.5, color: 'hsl(var(--sb-fg-3))', fontWeight: 500 }}>{k.label}</div>
            <div style={{ fontSize: k.small ? 13 : 22, fontWeight: 700, color: k.fg, fontVariantNumeric: 'tabular-nums', marginTop: 6, lineHeight: 1.2 }}>
              {k.value}
            </div>
          </div>
        ))}
      </div>

      {detected === 'Open' && (
        <div className="card" style={{ padding: '12px 16px', marginBottom: 12, background: 'rgba(61,214,140,0.12)', border: '1px solid rgba(61,214,140,0.4)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <BellRing strokeWidth={1.75} style={{ width: 18, height: 18, color: '#4FCB8E' }} />
          <span style={{ fontSize: 13.5, fontWeight: 600, color: '#4FCB8E' }}>
            Status detectado: OPEN. {config?.notified_at ? `Alerta enviado em ${fmt(config.notified_at)}.` : 'Alerta ainda não enviado.'}
          </span>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <div className="card" style={{ padding: 20 }}>
          <h2 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Globe2 strokeWidth={1.75} style={{ width: 16, height: 16, color: '#E2BE6A' }} />
            Configuração
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, cursor: 'pointer' }}>
              <span style={{ fontSize: 13 }}>Monitoramento ativo</span>
              <input type="checkbox" checked={form.enabled} onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))} />
            </label>

            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, cursor: 'pointer' }}>
              <span style={{ fontSize: 13 }}>Auto-pausar ao detectar <strong>Open</strong></span>
              <input type="checkbox" checked={form.auto_pause_after_open} onChange={(e) => setForm((f) => ({ ...f, auto_pause_after_open: e.target.checked }))} />
            </label>

            <div>
              <label style={{ fontSize: 12, color: 'hsl(var(--sb-fg-2))', display: 'block', marginBottom: 4 }}>
                Números WhatsApp destino — 1 por linha, com DDI
              </label>
              <textarea
                className="input"
                rows={3}
                style={{ width: '100%', fontFamily: 'var(--sb-font-mono)', resize: 'vertical', padding: '8px 12px' }}
                placeholder={'5511999999999\n5521988887777'}
                value={form.numbersText}
                onChange={(e) => setForm((f) => ({ ...f, numbersText: e.target.value }))}
              />
              <p style={{ margin: '4px 0 0', fontSize: 11, color: 'hsl(var(--sb-fg-3))' }}>
                {parseNumbers(form.numbersText).length} número(s). Alerta (ligação + 20 msgs) dispara para todos.
              </p>
            </div>

            <div>
              <label style={{ fontSize: 12, color: 'hsl(var(--sb-fg-2))', display: 'block', marginBottom: 4 }}>Nome da instância Evolution</label>
              <input
                className="input"
                style={{ width: '100%', height: 38, fontFamily: 'var(--sb-font-mono)' }}
                value={form.whatsapp_instance_name}
                onChange={(e) => setForm((f) => ({ ...f, whatsapp_instance_name: e.target.value }))}
              />
            </div>

            <div>
              <label style={{ fontSize: 12, color: 'hsl(var(--sb-fg-2))', display: 'block', marginBottom: 4 }}>URL oficial (bloqueada)</label>
              <input className="input" style={{ width: '100%', height: 38, fontSize: 11.5, color: 'hsl(var(--sb-fg-3))' }} value={OFFICIAL_URL} readOnly disabled />
            </div>
          </div>

          <div style={{ marginTop: 18, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <button className="btn btn-primary" onClick={handleSave} disabled={action.isPending}>
              <span className="b-ic"><Save strokeWidth={1.75} /></span>Salvar configuração
            </button>
            <button className="btn btn-secondary" onClick={() => run({ action: 'check_now' }, 'Verificação concluída', 'Verificando página oficial…')} disabled={action.isPending}>
              <span className="b-ic"><RefreshCw strokeWidth={1.75} /></span>Verificar agora
            </button>
            <button className="btn btn-secondary" onClick={() => run({ action: 'send_test' }, 'Mensagem de teste enviada', 'Enviando teste…')} disabled={action.isPending}>
              <span className="b-ic"><Send strokeWidth={1.75} /></span>Enviar teste
            </button>
          </div>
        </div>

        <div className="card" style={{ padding: 20 }}>
          <h2 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Plug strokeWidth={1.75} style={{ width: 16, height: 16, color: '#4FCB8E' }} />
            WhatsApp (instância temporária)
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13 }}>
            <Row label="Instância">
              <code style={{ fontFamily: 'var(--sb-font-mono)', fontSize: 12.5 }}>{config?.whatsapp_instance_name ?? '—'}</code>
            </Row>
            <Row label="Conexão">
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: waConnected ? '#4FCB8E' : '#7D8590', flexShrink: 0 }} />
                <span className="badge-pill" style={{ color: waConnected ? '#4FCB8E' : 'hsl(var(--sb-fg-2))' }}>{config?.whatsapp_status ?? 'unknown'}</span>
              </span>
            </Row>
            <Row label="Última checagem">{fmt(config?.whatsapp_last_checked_at)}</Row>
          </div>

          <div style={{ marginTop: 18, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <button className="btn btn-secondary" onClick={() => run({ action: 'create_instance' }, 'Instância criada/reconciliada', 'Criando instância…')} disabled={action.isPending}>
              <span className="b-ic"><Plug strokeWidth={1.75} /></span>Criar / reconciliar
            </button>
            <button className="btn btn-secondary" onClick={() => run({ action: 'state_instance' }, 'Status atualizado', 'Atualizando…')} disabled={action.isPending}>
              <span className="b-ic"><RefreshCw strokeWidth={1.75} /></span>Atualizar status
            </button>
            <button className="btn btn-primary" style={{ background: '#2e7d52', borderColor: '#2e7d52' }} onClick={() => setConnectOpen(true)}>
              <span className="b-ic"><QrCode strokeWidth={1.75} /></span>Conectar
            </button>
            <button className="btn btn-secondary" onClick={() => run({ action: 'logout_instance' }, 'Instância desconectada', 'Desconectando…')} disabled={action.isPending}>
              <span className="b-ic"><Unplug strokeWidth={1.75} /></span>Desconectar
            </button>
            <button className="btn btn-secondary" style={{ color: '#F26D70' }} onClick={() => setConfirmDelete(true)} disabled={action.isPending}>
              <span className="b-ic"><Trash2 strokeWidth={1.75} /></span>Excluir instância
            </button>
          </div>

          <div style={{ marginTop: 14, padding: '8px 12px', background: 'rgba(212,168,74,0.08)', borderRadius: 6, fontSize: 11.5, color: 'hsl(var(--sb-fg-3))' }}>
            QR Code e pairing code existem apenas na resposta da Edge Function e nesta tela — nunca são gravados no banco.
          </div>
        </div>
      </div>

      <div className="card">
        <div style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid hsl(var(--color-border))' }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Logs (últimos 100)</h2>
          <button className="btn btn-secondary" onClick={() => refetchLogs()} disabled={logsFetching}>
            <span className="b-ic"><RefreshCw strokeWidth={1.75} /></span>Atualizar logs
          </button>
        </div>

        {isLoading ? (
          <div style={{ padding: '40px 0', textAlign: 'center', color: 'hsl(var(--sb-fg-3))' }}>Carregando…</div>
        ) : logs.length === 0 ? (
          <div style={{ padding: '48px 0', textAlign: 'center', color: 'hsl(var(--sb-fg-3))', fontSize: 13 }}>Nenhum log ainda.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th style={{ width: 140 }}>Data/hora</th>
                  <th style={{ width: 90 }}>Nível</th>
                  <th style={{ width: 130 }}>Ação</th>
                  <th style={{ width: 90 }}>Status</th>
                  <th style={{ width: 70 }}>HTTP</th>
                  <th>Mensagem</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((l) => (
                  <tr key={l.id}>
                    <td className="fg2" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{fmt(l.created_at)}</td>
                    <td>
                      <span className={`badge-pill ${LOG_META[l.level]?.cls ?? ''}`} style={{ color: LOG_META[l.level]?.fg }}>{l.level}</span>
                    </td>
                    <td style={{ fontFamily: 'var(--sb-font-mono)', fontSize: 12 }}>{l.action}</td>
                    <td style={{ fontSize: 12.5 }}>{l.detected_status ?? '—'}</td>
                    <td style={{ fontSize: 12.5 }}>{l.http_status ?? '—'}</td>
                    <td style={{ fontSize: 12.5 }}>{l.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {connectOpen && config && (
        <ConnectOverlay
          instanceName={config.whatsapp_instance_name}
          targetNumber={config.whatsapp_target_numbers?.[0] ?? config.whatsapp_target_number ?? ''}
          onClose={() => setConnectOpen(false)}
        />
      )}

      <ConfirmModal
        open={confirmDelete}
        title="Excluir instância temporária"
        description={`A instância "${config?.whatsapp_instance_name}" será excluída da Evolution API. Você poderá recriá-la depois.`}
        confirmLabel="Excluir"
        destructive
        onConfirm={async () => {
          setConfirmDelete(false)
          await run({ action: 'delete_instance' }, 'Instância excluída', 'Excluindo…')
        }}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
      <span style={{ color: 'hsl(var(--sb-fg-3))' }}>{label}</span>
      <span>{children}</span>
    </div>
  )
}

type QrState = 'idle' | 'loading' | 'ready' | 'expired' | 'connected' | 'error'

function ConnectOverlay({
  instanceName,
  targetNumber,
  onClose,
}: {
  instanceName: string
  targetNumber: string
  onClose: () => void
}) {
  const action = useAustraliaWhvAction()
  const [qrState, setQrState] = useState<QrState>('idle')
  const [qrCode, setQrCode] = useState<string | null>(null)
  const [pairingCode, setPairingCode] = useState<string | null>(null)
  const [countdown, setCountdown] = useState(0)
  const [usePairing, setUsePairing] = useState(false)
  const [phone, setPhone] = useState(targetNumber)

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const countRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const stop = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
    if (countRef.current) { clearInterval(countRef.current); countRef.current = null }
  }, [])

  const startPolling = useCallback(() => {
    stop()
    pollRef.current = setInterval(async () => {
      try {
        const status = await pollWhatsappState()
        if (status === 'open') {
          stop()
          setQrState('connected')
          setTimeout(onClose, 1200)
        }
      } catch { /* ignora */ }
    }, 3000)
  }, [onClose, stop])

  const startCountdown = useCallback((seconds: number) => {
    setCountdown(seconds)
    countRef.current = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) { clearInterval(countRef.current!); setQrState('expired'); stop(); return 0 }
        return c - 1
      })
    }, 1000)
  }, [stop])

  const request = useCallback(async () => {
    setQrState('loading')
    setQrCode(null)
    setPairingCode(null)
    stop()
    try {
      const body: Record<string, unknown> = { action: 'connect_instance', mode: usePairing ? 'pairing' : 'qr' }
      if (usePairing) body.number = phone.replace(/\D/g, '')
      const res = (await action.mutateAsync(body)) as Record<string, unknown>
      const base64 = res?.base64 as string | undefined
      const pCode = res?.pairingCode as string | undefined
      if (pCode) {
        setPairingCode(pCode); setQrState('ready'); startCountdown(60); startPolling()
      } else if (base64) {
        setQrCode(base64); setQrState('ready'); startCountdown(40); startPolling()
      } else {
        const state = (res as { instance?: { state?: string }; state?: string })?.instance?.state ?? (res as { state?: string })?.state
        if (state === 'open') { setQrState('connected'); setTimeout(onClose, 800) }
        else { setQrState('error'); toast.error('QR/pairing não retornado pela Evolution') }
      }
    } catch (err: unknown) {
      setQrState('error')
      toast.error((err as Error).message ?? 'Falha ao solicitar conexão')
    }
  }, [action, usePairing, phone, startCountdown, startPolling, stop, onClose])

  useEffect(() => () => stop(), [stop])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative rounded-lg border border-border bg-surface shadow-lg" style={{ width: 380, maxWidth: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px 16px', borderBottom: '1px solid hsl(var(--color-border))' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <QrCode style={{ width: 18, height: 18, color: '#4FCB8E' }} strokeWidth={1.75} />
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Conectar WhatsApp</h2>
          </div>
          <button className="icon-btn" style={{ width: 30, height: 30 }} onClick={onClose}>
            <X style={{ width: 14, height: 14 }} strokeWidth={1.75} />
          </button>
        </div>

        <div style={{ padding: '20px 24px 24px' }}>
          <p style={{ margin: '0 0 12px', fontSize: 12.5, color: 'hsl(var(--sb-fg-2))' }}>
            Instância: <code style={{ fontFamily: 'var(--sb-font-mono)', fontSize: 12 }}>{instanceName}</code>
          </p>

          <div style={{ marginBottom: 12, display: 'flex', gap: 8 }}>
            <button type="button" className={!usePairing ? 'btn-primary' : 'btn-secondary'} style={{ flex: 1, height: 32, fontSize: 12 }} onClick={() => setUsePairing(false)}>QR Code</button>
            <button type="button" className={usePairing ? 'btn-primary' : 'btn-secondary'} style={{ flex: 1, height: 32, fontSize: 12 }} onClick={() => setUsePairing(true)}>Pairing Code</button>
          </div>

          {usePairing && (
            <input className="input" style={{ width: '100%', height: 38, marginBottom: 12, fontFamily: 'var(--sb-font-mono)' }} placeholder="Número com DDI (5511999998888)" value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))} />
          )}

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 220, background: 'hsl(var(--color-surface-2))', borderRadius: 8, padding: 24 }}>
            {qrState === 'idle' && (
              <button className="btn btn-primary" onClick={request}>
                <span className="b-ic"><QrCode strokeWidth={1.75} /></span>{usePairing ? 'Gerar pairing code' : 'Gerar QR Code'}
              </button>
            )}
            {qrState === 'loading' && (
              <div style={{ textAlign: 'center', color: 'hsl(var(--sb-fg-3))' }}>
                <RefreshCw style={{ width: 32, height: 32, margin: '0 auto 12px', animation: 'spin 1s linear infinite' }} strokeWidth={1.25} />
                <p style={{ margin: 0, fontSize: 13 }}>Solicitando…</p>
              </div>
            )}
            {qrState === 'ready' && qrCode && (
              <>
                <img src={qrCode} alt="QR Code WhatsApp" style={{ width: 180, height: 180, borderRadius: 4 }} />
                <p style={{ margin: '12px 0 0', fontSize: 12, color: 'hsl(var(--sb-fg-3))' }}>Expira em <strong style={{ color: countdown < 10 ? '#F26D70' : '#E2BE6A' }}>{countdown}s</strong></p>
              </>
            )}
            {qrState === 'ready' && pairingCode && (
              <>
                <div style={{ fontFamily: 'var(--sb-font-mono)', fontSize: 28, fontWeight: 700, letterSpacing: '0.15em', background: 'hsl(var(--color-surface))', padding: '16px 24px', borderRadius: 8, border: '1px solid hsl(var(--color-border))' }}>{pairingCode}</div>
                <p style={{ margin: '12px 0 0', fontSize: 12.5, color: 'hsl(var(--sb-fg-3))', textAlign: 'center' }}>No WhatsApp do número informado: <strong>Dispositivos vinculados → Vincular com número</strong></p>
                <p style={{ margin: '8px 0 0', fontSize: 12, color: countdown < 10 ? '#F26D70' : 'hsl(var(--sb-fg-3))' }}>Expira em {countdown}s</p>
              </>
            )}
            {qrState === 'expired' && (
              <div style={{ textAlign: 'center' }}>
                <p style={{ margin: '0 0 16px', fontSize: 13, color: 'hsl(var(--sb-fg-3))' }}>Expirado.</p>
                <button className="btn btn-primary" onClick={request}><span className="b-ic"><RefreshCw strokeWidth={1.75} /></span>Gerar novo</button>
              </div>
            )}
            {qrState === 'error' && (
              <div style={{ textAlign: 'center' }}>
                <p style={{ margin: '0 0 16px', fontSize: 13, color: '#F26D70' }}>Falha ao obter conexão.</p>
                <button className="btn btn-secondary" onClick={request}><span className="b-ic"><RefreshCw strokeWidth={1.75} /></span>Tentar novamente</button>
              </div>
            )}
            {qrState === 'connected' && (
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 40, marginBottom: 8 }}>✅</div>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#4FCB8E' }}>Conectado!</p>
              </div>
            )}
          </div>

          <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button className="btn btn-secondary" onClick={onClose}>Fechar</button>
          </div>
        </div>
      </div>
    </div>
  )
}
