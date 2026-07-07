// Ativação do assinante — fonte ÚNICA de verdade (idempotente).
// Chamado por: australia-mp-webhook (quando o MP notifica) E australia-payment-status
// (polling do PIX consulta o MP direto e ativa — não depende do webhook chegar).
// Faz: marca pago/ativo + expiração anual, add ao GRUPO, DM de boas-vindas,
// e-mail de boas-vindas (Resend) e registro no Hub SB Tech. Best-effort nos envios.

import { addCiclo, fetchPlan } from './plan.ts'
import { addParticipants, groupInviteUrl, sendText } from './evolution.ts'

// deno-lint-ignore no-explicit-any
type DB = any

interface ActivateOpts {
  phone: string
  paymentId?: string
  nome?: string
  email?: string
}

async function sendWelcomeEmail(to: string, nome: string, appUrl: string, phoneDigits: string) {
  const key = Deno.env.get('RESEND_API_KEY')
  if (!key || !to) return
  const from = Deno.env.get('EMAIL_FROM') ?? 'Monitor WHV <noreply@sbtech-group.com>'
  const primeiro = (nome || '').split(' ')[0] || 'Olá'
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a">
      <h2 style="color:#2e7d52">✅ Assinatura confirmada — bem-vindo(a)!</h2>
      <p>${primeiro}, seu acesso ao <strong>Monitor WHV Austrália</strong> está liberado.</p>
      <p><strong>Como acessar o painel:</strong></p>
      <ol>
        <li>Acesse <a href="${appUrl}/login">${appUrl}/login</a></li>
        <li>Informe este mesmo WhatsApp: <strong>${phoneDigits}</strong></li>
        <li>Você recebe um código por WhatsApp e entra no painel.</li>
      </ol>
      <p style="margin:24px 0">
        <a href="${appUrl}/login" style="background:#2e7d52;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:bold">Acessar o painel →</a>
      </p>
      <p>👥 Você também foi adicionado ao nosso <strong>grupo de alertas no WhatsApp</strong> — é lá que avisamos assim que a Austrália abrir vagas WHV para o Brasil.</p>
      <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
      <p style="font-size:12px;color:#888">Monitor WHV Austrália · Não somos afiliados ao governo australiano.</p>
    </div>`
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to, subject: 'Acesso liberado — Monitor WHV Austrália', html }),
  }).then(() => {}, (e) => console.error('resend', e))
}

async function registerHub(phone: string, nome: string, email: string, numberClean: string) {
  const hubUrl = Deno.env.get('HUB_FUNCTIONS_URL')
  const hubToken = Deno.env.get('HUB_PROVISIONING_TOKEN')
  if (!hubUrl || !hubToken) return { ok: false, reason: 'hub-not-configured' }
  try {
    const res = await fetch(`${hubUrl}/hub-register-account`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${hubToken}` },
      body: JSON.stringify({
        produto_slug: 'australiawhv',
        nome: nome || numberClean,
        email: email || `${numberClean}@australiawhv.sbtech-group.com`,
        telefone: phone,
        conta_ref: phone,
        conta_url: `${Deno.env.get('APP_URL')}/monitor`,
      }),
    })
    return { ok: res.ok, status: res.status, body: res.ok ? '' : (await res.text()).slice(0, 300) }
  } catch (err) {
    return { ok: false, reason: String(err) }
  }
}

export interface ActivateResult {
  activated: boolean
  alreadyActive: boolean
  in_group?: boolean
  hub?: { ok: boolean; status?: number; reason?: string; body?: string }
}

// Idempotente: se já estiver ativo (e não expirado), não refaz nada (evita
// reenviar DM/e-mail a cada poll). Retorna o que aconteceu p/ logging.
export async function activateSubscriber(supabase: DB, opts: ActivateOpts): Promise<ActivateResult> {
  const { phone } = opts
  const { data: cur } = await supabase
    .from('australia_whv_subscribers')
    .select('active, access_expires_at, full_name, email, payment_id')
    .eq('phone', phone)
    .maybeSingle()

  const nowISO = new Date().toISOString()
  const { ciclo } = await fetchPlan()
  const accessExpiresAt = addCiclo(nowISO, ciclo)
  const nome = opts.nome || cur?.full_name || ''
  const email = opts.email || cur?.email || ''
  const setFields = {
    payment_status: 'approved',
    active: true,
    paid_at: nowISO,
    access_expires_at: accessExpiresAt,
    payment_id: opts.paymentId ?? cur?.payment_id ?? null,
    ...(nome ? { full_name: nome } : {}),
    ...(email ? { email } : {}),
  }

  // Claim ATÔMICO: só ativa se ainda NÃO está válido (active=false OU expirado).
  // Vence a corrida entre webhook + polling do PIX → só 1 processo dispara
  // DM/e-mail/Hub (os demais recebem 0 linhas e retornam alreadyActive).
  if (cur) {
    const { data: claimed } = await supabase
      .from('australia_whv_subscribers')
      .update(setFields)
      .eq('phone', phone)
      .or(`active.eq.false,access_expires_at.lte.${nowISO}`)
      .select('id')
    if (!claimed || claimed.length === 0) return { activated: false, alreadyActive: true }
  } else {
    // Sem linha prévia (não deveria ocorrer — process-payment cria pending): cria.
    await supabase.from('australia_whv_subscribers').insert({ phone, ...setFields })
  }

  const { data: cfg } = await supabase
    .from('australia_whv_monitor_config')
    .select('whatsapp_instance_name, last_detected_status, official_url, whatsapp_group_jid, whatsapp_group_name, whatsapp_group_invite_url')
    .eq('singleton_key', 'main')
    .maybeSingle()

  const instance = cfg?.whatsapp_instance_name as string | undefined
  const numberClean = phone.replace('+', '').replace(/\D/g, '')
  const appUrl = Deno.env.get('APP_URL') ?? ''

  // ── Add ao GRUPO ────────────────────────────────────────────────────────────
  let added = false
  if (instance && cfg?.whatsapp_group_jid) {
    const add = await addParticipants(instance, String(cfg.whatsapp_group_jid), [numberClean])
    added = add.ok
    await supabase.from('australia_whv_subscribers')
      .update({ in_group: add.ok, group_added_at: add.ok ? nowISO : null })
      .eq('phone', phone)
  }

  // ── DM de boas-vindas (WhatsApp) ────────────────────────────────────────────
  const evoOk = !!(Deno.env.get('EVOLUTION_API_URL') && Deno.env.get('EVOLUTION_API_KEY') && instance)
  if (evoOk) {
    const groupName = String(cfg?.whatsapp_group_name ?? '')
    let invite = cfg?.whatsapp_group_invite_url ? String(cfg.whatsapp_group_invite_url) : ''
    if (!added && !invite && cfg?.whatsapp_group_jid) {
      invite = (await groupInviteUrl(instance!, String(cfg.whatsapp_group_jid))) ?? ''
    }
    const groupLine = added
      ? `👥 Você foi adicionado ao nosso *grupo de alertas* (${groupName}). É lá que avisamos quando a Austrália abrir.`
      : invite
        ? `👥 Entre no nosso *grupo de alertas*: ${invite}\n(não consegui te adicionar automaticamente — toque no link).`
        : `👥 Em breve você será adicionado ao nosso *grupo de alertas*.`
    await sendText(instance!, numberClean,
      `✅ *Pagamento confirmado — acesso liberado!*\n\n` +
      `Você agora é assinante do *Monitor WHV Austrália*.\n\n` +
      `${groupLine}\n\n` +
      `📊 *Painel:* ${appUrl}/login\n` +
      `🔑 *Como entrar:* use este mesmo número (${numberClean}) — enviamos um código por aqui.`,
    )
    if (cfg?.last_detected_status === 'Open') {
      await sendText(instance!, numberClean,
        `🚨 *AUSTRÁLIA WHV JÁ ESTÁ ABERTO PARA O BRASIL!*\n\nEntre AGORA no ImmiAccount.\n\nOficial: ${cfg?.official_url ?? ''}`,
      )
      await supabase.from('australia_whv_subscribers').update({ notified_at: nowISO }).eq('phone', phone)
    }
  }

  // ── E-mail de boas-vindas (Resend) ──────────────────────────────────────────
  await sendWelcomeEmail(email, nome, appUrl, numberClean)

  // ── Registro no Hub (cliente + assinatura + saas) ───────────────────────────
  const hub = await registerHub(phone, nome, email, numberClean)

  return { activated: true, alreadyActive: false, in_group: added, hub }
}
