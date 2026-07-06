import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { addCiclo, fetchPlan } from '../_shared/plan.ts'
import { addParticipants, groupInviteUrl, sendText } from '../_shared/evolution.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-signature, x-request-id',
}

// Valida a origem da notificação MP (Webhooks v2): HMAC-SHA256 do manifest
// `id:<data.id>;request-id:<x-request-id>;ts:<ts>;` com o MP_WEBHOOK_SECRET.
async function validSignature(req: Request, dataId: string, secret: string): Promise<boolean> {
  const xSignature = req.headers.get('x-signature') ?? ''
  const xRequestId = req.headers.get('x-request-id') ?? ''
  const parts: Record<string, string> = {}
  for (const kv of xSignature.split(',')) {
    const [k, v] = kv.split('=')
    if (k && v) parts[k.trim()] = v.trim()
  }
  const ts = parts['ts']
  const v1 = parts['v1']
  if (!ts || !v1) return false

  const manifest = `id:${dataId.toLowerCase()};request-id:${xRequestId};ts:${ts};`
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  )
  const sigBuf = await crypto.subtle.sign('HMAC', key, enc.encode(manifest))
  const hex = [...new Uint8Array(sigBuf)].map(b => b.toString(16).padStart(2, '0')).join('')
  return hex === v1
}

// E-mail de boas-vindas (Resend). Best-effort — não derruba a ativação.
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )
  // Log de diagnóstico do webhook (aparece em /admin → Logs, action=webhook).
  const wlog = (level: string, message: string, details: Record<string, unknown> = {}) =>
    supabase.from('australia_whv_monitor_logs').insert({ level, action: 'webhook', message, details }).then(() => {}, () => {})

  try {
    const url = new URL(req.url)
    const rawBody = await req.text()
    let body: { type?: string; data?: { id?: string }; action?: string } = {}
    try { body = rawBody ? JSON.parse(rawBody) : {} } catch { /* IPN pode não ter body JSON */ }

    // paymentId: body (Webhooks v2) OU query (?type=payment&data.id= | ?topic=payment&id=)
    const type = body.type ?? url.searchParams.get('type') ?? url.searchParams.get('topic')
    const paymentId = String(body.data?.id ?? url.searchParams.get('data.id') ?? url.searchParams.get('id') ?? '')

    if (type !== 'payment' || !paymentId) {
      return new Response('ok', { headers: corsHeaders })   // evento irrelevante — ignora
    }

    // Assinatura HMAC: só exige quando o MP realmente envia o header x-signature.
    // Notificações por-pagamento (sem webhook no dashboard MP) NÃO são assinadas —
    // nesse caso a re-consulta na API do MP abaixo já garante autenticidade
    // (só um payment_id real e aprovado DA NOSSA conta passa).
    const webhookSecret = Deno.env.get('MP_WEBHOOK_SECRET')
    if (webhookSecret && req.headers.get('x-signature')) {
      const dataId = url.searchParams.get('data.id') ?? paymentId
      if (!(await validSignature(req, dataId, webhookSecret))) {
        await wlog('warning', `Webhook rejeitado: assinatura inválida (payment ${paymentId}).`)
        return new Response('invalid signature', { status: 401, headers: corsHeaders })
      }
    }
    const mpAccessToken = Deno.env.get('MP_ACCESS_TOKEN')!

    // Consulta o pagamento no MP para verificar status e obter phone
    const res = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${mpAccessToken}` },
    })
    if (!res.ok) {
      await wlog('error', `Falha ao consultar pagamento ${paymentId} no MP.`, { http_status: res.status })
      return new Response('MP fetch failed', { status: 502 })
    }

    const payment = await res.json() as {
      status: string
      external_reference: string   // phone armazenado na preference
      payer?: { email?: string; first_name?: string; last_name?: string }
    }

    if (payment.status !== 'approved') {
      await wlog('info', `Webhook ${paymentId}: status "${payment.status}" (ignorado — não aprovado).`)
      return new Response('payment not approved', { headers: corsHeaders })
    }

    const phone = payment.external_reference
    if (!phone) { await wlog('error', `Webhook ${paymentId}: sem phone (external_reference).`); return new Response('no phone in external_reference', { status: 400 }) }
    await wlog('success', `Pagamento aprovado (${paymentId}) — ativando assinante ${phone}.`)

    // Busca a linha do assinante (full_name/email capturados no checkout).
    const { data: subscriber } = await supabase
      .from('australia_whv_subscribers')
      .select('full_name, email')
      .eq('phone', phone)
      .maybeSingle()

    // Assinatura ANUAL: acesso expira em now + ciclo do plano.
    const { ciclo } = await fetchPlan()
    const nowISO = new Date().toISOString()
    const accessExpiresAt = addCiclo(nowISO, ciclo)

    // Ativa assinante (a notificação de abertura é dirigida pela TABELA subscribers,
    // não mais por uma lista no config — ver australia-monitor).
    await supabase
      .from('australia_whv_subscribers')
      .upsert({
        phone,
        payment_id: paymentId,
        payment_status: 'approved',
        active: true,
        paid_at: nowISO,
        access_expires_at: accessExpiresAt,
      }, { onConflict: 'phone' })

    const evolutionUrl = Deno.env.get('EVOLUTION_API_URL')
    const evolutionKey = Deno.env.get('EVOLUTION_API_KEY')

    const { data: cfg } = await supabase
      .from('australia_whv_monitor_config')
      .select('whatsapp_instance_name, last_detected_status, official_url, whatsapp_group_jid, whatsapp_group_name, whatsapp_group_invite_url')
      .eq('singleton_key', 'main')
      .maybeSingle()

    const numberClean = phone.replace('+', '').replace(/\D/g, '')
    const instance = cfg?.whatsapp_instance_name
    const canSend = !!(evolutionUrl && evolutionKey && instance)

    // Auto-add ao GRUPO de alertas (novo modelo: o alerta de abertura vai p/ o
    // grupo — não mais 1 DM por assinante). Marca in_group conforme o resultado.
    let added = false
    if (instance && cfg?.whatsapp_group_jid) {
      const add = await addParticipants(instance, String(cfg.whatsapp_group_jid), [numberClean])
      added = add.ok
      await supabase
        .from('australia_whv_subscribers')
        .update({ in_group: add.ok, group_added_at: add.ok ? nowISO : null })
        .eq('phone', phone)
    }

    if (canSend) {
      const alreadyOpen = cfg!.last_detected_status === 'Open'
      const appUrl = Deno.env.get('APP_URL')
      // Linha do grupo: adicionado ok / convite (fallback) / genérica.
      const groupName = String(cfg!.whatsapp_group_name ?? '')
      let invite = cfg!.whatsapp_group_invite_url ? String(cfg!.whatsapp_group_invite_url) : ''
      if (!added && !invite && cfg!.whatsapp_group_jid) {
        invite = (await groupInviteUrl(instance!, String(cfg!.whatsapp_group_jid))) ?? ''
      }
      const groupLine = added
        ? `👥 Você foi adicionado ao nosso *grupo de alertas* (${groupName}). É lá que avisamos quando a Austrália abrir — fique de olho no grupo.`
        : invite
          ? `👥 Entre no nosso *grupo de alertas* (onde avisamos a abertura): ${invite}\n(não consegui te adicionar automaticamente — toque no link para entrar).`
          : `👥 Em breve você será adicionado ao nosso *grupo de alertas* — é lá que avisamos quando a Austrália abrir.`
      // Boas-vindas + o que o assinante já pode acessar (o alerta agora é no GRUPO)
      await sendText(instance!, numberClean,
        `✅ *Pagamento confirmado — acesso liberado!*\n\n` +
        `Você agora é assinante do *Monitor WHV Austrália*. Veja o que já pode fazer:\n\n` +
        `${groupLine}\n\n` +
        `📊 *Painel em tempo real:* acompanhe o status oficial e o histórico de verificações.\n${appUrl}/login\n\n` +
        `🔑 *Como entrar:* use este mesmo número (${numberClean}). Enviamos um código por aqui para você acessar.\n\n` +
        `Status atual da Austrália: *${cfg!.last_detected_status ?? 'Verificando'}*`,
      )
      // Se JÁ está aberto, alerta imediato + marca notified_at (não duplica no cron)
      if (alreadyOpen) {
        await sendText(instance!, numberClean,
          `🚨 *AUSTRÁLIA WHV JÁ ESTÁ ABERTO PARA O BRASIL!*\n\nEntre AGORA no ImmiAccount e tente submeter/pagar a aplicação.\n\nPágina oficial: ${cfg!.official_url ?? ''}`,
        )
        await supabase
          .from('australia_whv_subscribers')
          .update({ notified_at: new Date().toISOString() })
          .eq('phone', phone)
      }
    }

    // ── E-mail de boas-vindas (com link + como acessar) ───────────────────────
    const welcomeEmail = subscriber?.email || payment.payer?.email || ''
    const welcomeNome = subscriber?.full_name || [payment.payer?.first_name, payment.payer?.last_name].filter(Boolean).join(' ') || ''
    await sendWelcomeEmail(welcomeEmail, welcomeNome, Deno.env.get('APP_URL') ?? '', numberClean)

    // ── Registro no Hub SB Tech (produto modelo SaaS) ─────────────────────────
    // Best-effort: falha aqui NUNCA deve derrubar a ativação do assinante.
    // Cria/atualiza cliente + assinatura + saas_conta em admin-hlg.sbtech-group.com/saas.
    try {
      const hubUrl = Deno.env.get('HUB_FUNCTIONS_URL')       // https://<hub-ref>.supabase.co/functions/v1
      const hubToken = Deno.env.get('HUB_PROVISIONING_TOKEN') // = AUSTRALIAWHV_PROVISIONING_TOKEN no Hub
      if (hubUrl && hubToken) {
        const nome = subscriber?.full_name || [payment.payer?.first_name, payment.payer?.last_name].filter(Boolean).join(' ') || numberClean
        const email = subscriber?.email || payment.payer?.email || `${numberClean}@australiawhv.sbtech-group.com`
        const hubRes = await fetch(`${hubUrl}/hub-register-account`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${hubToken}` },
          body: JSON.stringify({
            produto_slug: 'australiawhv',
            nome,
            email,
            telefone: phone,
            conta_ref: phone,
            conta_url: `${Deno.env.get('APP_URL')}/monitor`,
          }),
        })
        if (!hubRes.ok) {
          const txt = await hubRes.text()
          console.error('hub-register-account respondeu', hubRes.status, txt)
          await wlog('error', `Hub não registrou assinante (HTTP ${hubRes.status}).`, { body: txt.slice(0, 300) })
        } else {
          await wlog('success', `Assinante registrado no Hub (assinatura + SaaS): ${phone}.`)
        }
      } else {
        await wlog('warning', 'HUB_FUNCTIONS_URL/HUB_PROVISIONING_TOKEN não configurados — assinante NÃO registrado no Hub.')
      }
    } catch (err) {
      await wlog('error', `Falha ao registrar no Hub: ${String(err)}`)
    }

    return new Response('ok', { headers: corsHeaders })
  } catch (err) {
    console.error(err)
    return new Response('error', { status: 500 })
  }
})
