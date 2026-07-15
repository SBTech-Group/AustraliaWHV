// australia-access — webhook Hub → produto p/ controle de vencimento da assinatura.
// O Hub (hub-check-vencimentos, cron) chama isto p/ avisar, cortar ou renovar acesso.
//
// Auth: Authorization: Bearer <token> deve bater com HUB_PROVISIONING_TOKEN
// (mesmo segredo compartilhado com o Hub — inbound shared secret).
//
// Deploy: supabase functions deploy australia-access --no-verify-jwt
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { addParticipants, removeParticipants } from '../_shared/evolution.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    // ── Auth: Bearer == HUB_PROVISIONING_TOKEN ────────────────────────────────
    const expected = Deno.env.get('HUB_PROVISIONING_TOKEN')
    if (!expected) return json({ error: 'Servidor sem token configurado' }, 401)
    const auth = req.headers.get('authorization') ?? ''
    const token = auth.replace(/^Bearer\s+/i, '').trim()
    if (!token) return json({ error: 'Não autenticado' }, 401)
    if (token !== expected) return json({ error: 'Sem permissão' }, 403)

    const { phone, op, days_left, access_expires_at } = await req.json() as {
      phone?: string
      op?: 'warn' | 'cut' | 'extend'
      days_left?: number
      access_expires_at?: string
    }

    if (!phone) return json({ error: 'phone obrigatório' }, 400)
    if (op !== 'warn' && op !== 'cut' && op !== 'extend') return json({ error: 'op inválido' }, 400)
    // 'extend' SEM data → gravaria NULL = vitalício (grandfather). Rejeita p/ não
    // liberar acesso permanente por engano numa renovação.
    if (op === 'extend' && !access_expires_at) return json({ error: 'access_expires_at obrigatório p/ extend' }, 400)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const appUrl = Deno.env.get('APP_URL')

    // Config (instância + grupo) — usada tanto p/ gestão do grupo quanto p/ o DM.
    const { data: cfg } = await supabase
      .from('australia_whv_monitor_config')
      .select('whatsapp_instance_name, whatsapp_group_jid')
      .eq('singleton_key', 'main')
      .maybeSingle()

    const instance = cfg?.whatsapp_instance_name
    const groupJid = cfg?.whatsapp_group_jid ? String(cfg.whatsapp_group_jid) : ''
    const nowISO = new Date().toISOString()

    // ── DB + gestão do GRUPO (op cut/extend) ─────────────────────────────────
    // cut → remove do grupo + in_group=false. extend → re-add + in_group=add.ok.
    if (op === 'cut') {
      if (groupJid && instance) await removeParticipants(instance, groupJid, [phone])   // best-effort
      await supabase
        .from('australia_whv_subscribers')
        .update({
          active: false,
          in_group: false,
          group_access_status: 'removed',
          group_access_method: 'admin',
          group_access_error: null,
        })
        .eq('phone', phone)
    } else if (op === 'extend') {
      const upd: Record<string, unknown> = { active: true, access_expires_at: access_expires_at ?? null }
      if (groupJid && instance) {
        const add = await addParticipants(instance, groupJid, [phone])
        upd.in_group = add.ok
        upd.group_added_at = add.ok ? nowISO : null
        upd.group_joined_at = add.ok ? nowISO : null
        upd.group_access_status = add.ok ? 'active' : 'invite_pending'
        upd.group_access_method = 'auto_add'
        upd.group_access_error = add.ok ? null : JSON.stringify(add.data).slice(0, 500)
        upd.group_last_checked_at = nowISO
      }
      await supabase
        .from('australia_whv_subscribers')
        .update(upd)
        .eq('phone', phone)
    }

    // ── WhatsApp DM (best-effort — não falha a operação se a Evolution cair) ──
    const evolutionUrl = Deno.env.get('EVOLUTION_API_URL')
    const evolutionKey = Deno.env.get('EVOLUTION_API_KEY')

    if (evolutionUrl && evolutionKey && instance) {
      const numberClean = phone.replace('+', '').replace(/\D/g, '')
      let text = ''
      if (op === 'warn') {
        text = `⏳ Sua assinatura do Monitor WHV vence em ${days_left ?? '?'} dia(s). Renove para não perder os alertas: ${appUrl}/comprar`
      } else if (op === 'cut') {
        text = `🔒 Seu acesso ao Monitor WHV expirou. Renove: ${appUrl}/comprar`
      } else {
        const date = access_expires_at ? new Date(access_expires_at).toLocaleDateString('pt-BR') : ''
        text = `✅ Assinatura renovada! Acesso liberado até ${date}.`
      }
      await fetch(`${evolutionUrl}/message/sendText/${instance}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: evolutionKey },
        body: JSON.stringify({ number: numberClean, text, delay: 500 }),
      }).catch(console.error)
    }

    return json({ ok: true })
  } catch (err) {
    console.error(err)
    return json({ error: 'Erro interno' }, 500)
  }
})
