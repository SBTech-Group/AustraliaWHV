export function panelUrl() {
  return `${(Deno.env.get('APP_URL') ?? 'https://australiawhv.sbtech-group.com').replace(/\/$/, '')}/login`
}

export function otpMessage(code: string, purpose: 'login' | 'checkout') {
  const title = purpose === 'checkout'
    ? 'Codigo de confirmacao - Monitor WHV'
    : 'Codigo de acesso - Monitor WHV'
  return `🔐 *${title}*

Codigo: *${code}*

Valido por 10 minutos.
Nao compartilhe com ninguem.`
}

export function welcomeMessage(opts: { addedToGroup: boolean; groupName?: string | null }) {
  const groupName = opts.groupName?.trim() || 'grupo de alertas'
  const groupBlock = opts.addedToGroup
    ? `👥 Voce ja foi adicionado ao *${groupName}*.
E la que avisamos quando a Australia abrir.`
    : `⚠️ Nao conseguimos adicionar voce automaticamente ao grupo.
Isso pode acontecer por causa das configuracoes de privacidade do WhatsApp.

Acesse o painel e toque em *Entrar no grupo de alertas*.`

  return `✅ *Pagamento confirmado!*

Seu acesso ao *Monitor WHV Australia* esta liberado.

🔗 Painel: ${panelUrl()}
🔐 Login: use seu WhatsApp cadastrado

${groupBlock}

Se precisar de ajuda, fale com o suporte pelo painel.`
}

export function groupInviteMessage(opts: { groupName?: string | null; inviteUrl: string }) {
  const groupName = opts.groupName?.trim() || 'grupo de alertas'
  return `👥 *Convite do ${groupName}*

Use este link para entrar no grupo de alertas:
${opts.inviteUrl}

Se o link nao abrir, fale com o suporte pelo painel.`
}

export function openNowMessage(url: string) {
  return `🚨 *AUSTRALIA WHV ABERTO PARA O BRASIL!*

O status do Work and Holiday Visa mudou para *Aberto*.

Confira no site oficial e tente aplicar o quanto antes:
${url}`
}
