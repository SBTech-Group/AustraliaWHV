import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  findGroupParticipants,
  groupInviteUrl,
  isParticipant,
  sendInfo,
  sendGroupInvite,
  sendText,
} from '../_shared/evolution.ts'
import { groupInviteMessage } from '../_shared/onboarding.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const INVITE_COOLDOWN_MS = 10 * 60 * 1000

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function digits(phone: string) {
  return String(phone ?? '').replace(/\D/g, '')
}

function publicEvoError(status: number) {
  if (status === 0 || status >= 500) return 'Servico de WhatsApp indisponivel no momento. Tente novamente em instantes.'
  if (status === 401 || status === 403) return 'Servico de WhatsApp temporariamente indisponivel. Fale com o suporte.'
  return 'Nao foi possivel enviar o convite agora. Tente novamente em instantes.'
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  async function logAttempt(input: {
    subscriber_id?: string | null
    phone: string
    group_jid?: string | null
    method: string
    status: string
    error_message?: string | null
    http_status?: number | null
    details?: Record<string, unknown>
    invite_sent_at?: string | null
    joined_at?: string | null
  }) {
    await supabase.from('australia_whv_group_access_attempts').insert({
      subscriber_id: input.subscriber_id ?? null,
      phone: input.phone,
      group_jid: input.group_jid ?? null,
      method: input.method,
      status: input.status,
      error_message: input.error_message ?? null,
      http_status: input.http_status ?? null,
      details: input.details ?? {},
      invite_sent_at: input.invite_sent_at ?? null,
      joined_at: input.joined_at ?? null,
    }).then(() => {}, () => {})
  }

  try {
    const { session_token } = await req.json() as { session_token?: string }
    if (!session_token) return json({ error: 'Sessao invalida.' }, 401)

    const now = new Date()
    const nowISO = now.toISOString()
    const { data: sub } = await supabase
      .from('australia_whv_subscribers')
      .select('id, phone, active, access_expires_at, session_expires_at, in_group, group_invite_sent_at, group_invite_attempts')
      .eq('session_token', session_token)
      .eq('active', true)
      .or('access_expires_at.is.null,access_expires_at.gt.' + nowISO)
      .gt('session_expires_at', nowISO)
      .maybeSingle()

    if (!sub) return json({ error: 'Assinatura ativa nao encontrada.' }, 403)

    const { data: cfg } = await supabase
      .from('australia_whv_monitor_config')
      .select('whatsapp_instance_name, whatsapp_group_jid, whatsapp_group_name, whatsapp_group_invite_url')
      .eq('singleton_key', 'main')
      .maybeSingle()

    const instance = String(cfg?.whatsapp_instance_name ?? '').trim()
    const groupJid = String(cfg?.whatsapp_group_jid ?? '').trim()
    const groupName = String(cfg?.whatsapp_group_name ?? '').trim()
    const phoneDigits = digits(String(sub.phone))

    if (!instance || !groupJid) {
      await supabase.from('australia_whv_subscribers').update({
        group_access_status: 'invite_pending',
        group_access_method: 'manual_invite',
        group_access_error: 'Grupo de alertas nao configurado.',
        group_last_checked_at: nowISO,
      }).eq('id', sub.id)
      await logAttempt({
        subscriber_id: sub.id,
        phone: sub.phone,
        method: 'manual_invite',
        status: 'not_configured',
        error_message: 'Grupo de alertas nao configurado.',
      })
      return json({ error: 'Grupo de alertas ainda nao configurado. Fale com o suporte.' }, 503)
    }

    const members = await findGroupParticipants(instance, groupJid)
    if (members.ok && isParticipant(members.data, phoneDigits)) {
      await supabase.from('australia_whv_subscribers').update({
        in_group: true,
        group_added_at: nowISO,
        group_joined_at: nowISO,
        group_access_status: 'active',
        group_access_method: 'member_check',
        group_access_error: null,
        group_last_checked_at: nowISO,
      }).eq('id', sub.id)
      await logAttempt({
        subscriber_id: sub.id,
        phone: sub.phone,
        group_jid: groupJid,
        method: 'member_check',
        status: 'already_member',
        joined_at: nowISO,
      })
      return json({
        ok: true,
        in_group: true,
        group_access_status: 'active',
        message: 'Voce ja esta no grupo de alertas.',
      })
    }

    let invite = String(cfg?.whatsapp_group_invite_url ?? '').trim()
    if (!invite) {
      invite = (await groupInviteUrl(instance, groupJid)) ?? ''
      if (invite) {
        await supabase
          .from('australia_whv_monitor_config')
          .update({ whatsapp_group_invite_url: invite })
          .eq('singleton_key', 'main')
      }
    }

    const lastSent = sub.group_invite_sent_at ? new Date(String(sub.group_invite_sent_at)).getTime() : 0
    const rateLimited = lastSent > 0 && now.getTime() - lastSent < INVITE_COOLDOWN_MS

    if (rateLimited) {
      await logAttempt({
        subscriber_id: sub.id,
        phone: sub.phone,
        group_jid: groupJid,
        method: 'manual_invite',
        status: 'rate_limited',
        details: { last_sent_at: sub.group_invite_sent_at },
      })
      return json({
        ok: true,
        in_group: false,
        group_access_status: 'invite_sent',
        rate_limited: true,
        invite_url: invite || null,
        message: invite
          ? 'Convite enviado recentemente. Use o link abaixo ou tente reenviar em alguns minutos.'
          : 'Convite enviado recentemente. Confira seu WhatsApp ou tente reenviar em alguns minutos.',
      })
    }

    let sent = await sendGroupInvite(
      instance,
      groupJid,
      [phoneDigits],
      `Convite para entrar no ${groupName || 'grupo de alertas'} do Monitor WHV Australia:`,
    )

    let method = 'send_group_invite'
    if (!sent.ok && invite) {
      sent = await sendText(instance, phoneDigits, groupInviteMessage({ groupName, inviteUrl: invite }), { delay: 1000, linkPreview: false })
      method = 'send_text_invite'
    }

    if (!sent.ok && !invite) {
      await supabase.from('australia_whv_subscribers').update({
        group_access_status: 'invite_pending',
        group_access_method: 'manual_invite',
        group_access_error: JSON.stringify(sent.data).slice(0, 500),
        group_last_checked_at: nowISO,
      }).eq('id', sub.id)
      await logAttempt({
        subscriber_id: sub.id,
        phone: sub.phone,
        group_jid: groupJid,
        method,
        status: 'failed',
        error_message: 'Falha ao enviar convite e obter link do grupo.',
        http_status: sent.status || null,
        details: { evo: sent.data },
      })
      return json({ error: publicEvoError(sent.status) }, sent.status === 401 || sent.status === 403 ? 503 : 502)
    }

    await supabase.from('australia_whv_subscribers').update({
      in_group: false,
      group_access_status: 'invite_sent',
      group_access_method: 'manual_invite',
      group_access_error: sent.ok ? null : JSON.stringify(sent.data).slice(0, 500),
      group_invite_sent_at: nowISO,
      group_invite_attempts: Number(sub.group_invite_attempts ?? 0) + 1,
      group_last_checked_at: nowISO,
    }).eq('id', sub.id)

    await logAttempt({
      subscriber_id: sub.id,
      phone: sub.phone,
      group_jid: groupJid,
      method,
      status: sent.ok ? 'sent' : 'link_returned',
      error_message: sent.ok ? null : 'Envio via Evolution falhou; link liberado no painel.',
      http_status: sent.status || null,
        details: { send: sendInfo(sent.data), evo: sent.data },
      invite_sent_at: nowISO,
    })

    await supabase.from('australia_whv_monitor_logs').insert({
      level: sent.ok ? 'success' : 'warning',
      action: 'group_invite',
      message: sent.ok ? 'Convite do grupo enviado ao assinante.' : 'Convite exibido no painel apos falha de envio.',
      http_status: sent.status || null,
      details: { method, send: sendInfo(sent.data), evo: sent.data },
    }).then(() => {}, () => {})

    return json({
      ok: true,
      in_group: false,
      group_access_status: 'invite_sent',
      invite_url: invite || null,
      message: sent.ok
        ? (invite ? 'Convite enviado no seu WhatsApp. Voce tambem pode abrir o link abaixo.' : 'Convite enviado no seu WhatsApp.')
        : 'Nao conseguimos enviar no WhatsApp, mas o link seguro esta disponivel abaixo.',
    })
  } catch (err) {
    console.error(err)
    return json({ error: 'Erro interno ao preparar convite.' }, 500)
  }
})
