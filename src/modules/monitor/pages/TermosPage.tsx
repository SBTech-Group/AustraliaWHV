import { useNavigate } from 'react-router-dom'
import { ArrowLeft, ShieldCheck } from 'lucide-react'

// Página pública /termos — Política de Privacidade + Termos de Uso (PT-BR).
// Conteúdo real, apto à revisão do Meta WhatsApp Business API (dados coletados,
// finalidade, base legal LGPD, uso do WhatsApp/Meta, compartilhamento com
// Mercado Pago/Supabase, retenção, direitos do titular, opt-out, exclusão).
// Controlador: SB Tech Group. Não afiliado ao governo australiano.

const CONTROLADOR = 'SB Tech Group'
const EMAIL_PRIVACIDADE = 'privacidade@sbtech-group.com'
const EMAIL_CONTATO = 'contato@sbtech-group.com'
const VIGENCIA = '06 de julho de 2026'

export function TermosPage() {
  const navigate = useNavigate()

  return (
    <div className="legal">
      <div className="legal-card">
        <button className="btn-back" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))}>
          <ArrowLeft size={16} /> Voltar
        </button>

        <div className="legal-icon">
          <ShieldCheck size={28} strokeWidth={1.5} />
        </div>

        <h1>Política de Privacidade e Termos de Uso</h1>
        <p className="legal-meta">
          Monitor WHV Austrália · Última atualização e vigência: {VIGENCIA}
        </p>

        <p className="legal-lead">
          O Monitor WHV Austrália é um serviço independente de monitoramento e
          notificação de vagas do programa Working Holiday Visa (WHV) da
          Austrália. <strong>Não somos afiliados, associados, autorizados,
          endossados ou de qualquer forma oficialmente ligados ao Governo da
          Austrália</strong> nem ao Department of Home Affairs. Apenas monitoramos
          fontes públicas oficiais e avisamos você quando novas vagas são
          detectadas.
        </p>

        {/* ── 1. Quem somos ── */}
        <h2>1. Quem somos (Controlador dos dados)</h2>
        <p>
          Este serviço é operado pela {CONTROLADOR} ("nós", "nosso" ou "Monitor
          WHV"), responsável pelo tratamento dos dados pessoais descritos nesta
          política, na qualidade de controladora nos termos da Lei nº 13.709/2018
          (Lei Geral de Proteção de Dados Pessoais — LGPD).
        </p>
        <p>
          Contato do encarregado / privacidade:{' '}
          <a className="link" href={`mailto:${EMAIL_PRIVACIDADE}`}>{EMAIL_PRIVACIDADE}</a>.
        </p>

        {/* ── 2. Dados que coletamos ── */}
        <h2>2. Quais dados coletamos</h2>
        <p>Coletamos apenas os dados necessários para prestar o serviço:</p>
        <ul>
          <li><strong>Nome completo</strong> — para identificar sua conta e emitir a cobrança.</li>
          <li><strong>E-mail</strong> — para envio de recibo, comunicações essenciais e recuperação de acesso.</li>
          <li><strong>Número de telefone / WhatsApp</strong> — é o canal principal do serviço: por ele enviamos os alertas de vagas e o código de acesso ao painel.</li>
          <li><strong>Dados de pagamento</strong> — processados diretamente pelo Mercado Pago. Não armazenamos números completos de cartão em nossos servidores.</li>
          <li><strong>Dados técnicos mínimos</strong> — status da assinatura, data de expiração de acesso e registros de envio das mensagens, para fins de operação e segurança.</li>
        </ul>

        {/* ── 3. Finalidade ── */}
        <h2>3. Para que usamos seus dados (finalidade)</h2>
        <ul>
          <li>Enviar <strong>alertas de vagas WHV via WhatsApp</strong> assim que forem detectadas.</li>
          <li>Fornecer <strong>acesso ao painel</strong> de monitoramento por meio de código de verificação enviado ao seu WhatsApp.</li>
          <li>Processar o pagamento da assinatura anual e enviar confirmações.</li>
          <li>Prestar suporte e comunicar informações essenciais sobre o serviço (ex.: aviso de vencimento e renovação).</li>
        </ul>

        {/* ── 4. Base legal ── */}
        <h2>4. Base legal do tratamento</h2>
        <p>
          Tratamos seus dados com base no <strong>seu consentimento</strong> e na
          <strong> execução do contrato</strong> de prestação do serviço que você
          contrata ao adquirir a assinatura (art. 7º, I e V, da LGPD). Ao informar
          seu número de WhatsApp e concluir a compra, você consente em receber as
          mensagens descritas nesta política. O consentimento pode ser retirado a
          qualquer momento (ver seção 8 — Opt-out).
        </p>

        {/* ── 5. WhatsApp / Meta ── */}
        <h2>5. Como usamos o WhatsApp e a plataforma Meta</h2>
        <p>
          As mensagens são enviadas por meio da <strong>WhatsApp Business
          Platform</strong>, fornecida pela Meta Platforms, Inc. Utilizamos o
          WhatsApp exclusivamente para: (a) enviar o <strong>código de verificação
          </strong> de acesso ao painel; (b) enviar <strong>alertas de novas vagas
          </strong> WHV; e (c) enviar <strong>avisos operacionais</strong> da
          assinatura (ex.: confirmação de pagamento, aviso de vencimento). Não
          enviamos spam nem publicidade de terceiros. O uso do WhatsApp está
          sujeito também às políticas da Meta/WhatsApp.
        </p>

        {/* ── 6. Compartilhamento ── */}
        <h2>6. Com quem compartilhamos seus dados</h2>
        <p>
          Não vendemos seus dados. Compartilhamos apenas com os operadores
          estritamente necessários para o funcionamento do serviço:
        </p>
        <ul>
          <li><strong>Mercado Pago</strong> — processamento de pagamentos (nome, e-mail e dados da transação).</li>
          <li><strong>Meta / WhatsApp</strong> — envio das mensagens e códigos de acesso (número de telefone e conteúdo da mensagem).</li>
          <li><strong>Supabase</strong> — hospedagem da aplicação e banco de dados onde seus dados ficam armazenados de forma segura.</li>
        </ul>
        <p>
          Esses parceiros tratam os dados conforme suas próprias políticas de
          privacidade e apenas para as finalidades acima. Podemos ainda
          compartilhar dados quando exigido por lei ou ordem de autoridade
          competente.
        </p>

        {/* ── 7. Retenção ── */}
        <h2>7. Por quanto tempo guardamos seus dados</h2>
        <p>
          Mantemos seus dados enquanto sua conta estiver ativa e pelo período
          necessário para cumprir as finalidades desta política e obrigações
          legais (por exemplo, fiscais e contábeis). Encerrada a relação, os dados
          são eliminados ou anonimizados, salvo quando a lei exigir a guarda por
          prazo superior. Você pode solicitar a exclusão antecipada a qualquer
          momento (ver seção 9).
        </p>

        {/* ── 8. Opt-out ── */}
        <h2>8. Como parar de receber mensagens (opt-out)</h2>
        <p>
          Você pode interromper o recebimento das mensagens a qualquer momento
          respondendo <strong>SAIR</strong> ou <strong>PARAR</strong> na própria
          conversa do WhatsApp, ou solicitando o cancelamento pelo e-mail{' '}
          <a className="link" href={`mailto:${EMAIL_CONTATO}`}>{EMAIL_CONTATO}</a>.
          O cancelamento dos alertas pode encerrar a utilidade do serviço, pois o
          WhatsApp é o canal principal de notificação.
        </p>

        {/* ── 9. Direitos do titular ── */}
        <h2>9. Seus direitos (LGPD)</h2>
        <p>Nos termos da LGPD, você pode, a qualquer momento:</p>
        <ul>
          <li>Confirmar a existência de tratamento e <strong>acessar</strong> seus dados;</li>
          <li><strong>Corrigir</strong> dados incompletos, inexatos ou desatualizados;</li>
          <li>Solicitar a <strong>anonimização, bloqueio ou exclusão</strong> de dados desnecessários ou tratados em desconformidade;</li>
          <li>Solicitar a <strong>portabilidade</strong> dos dados;</li>
          <li><strong>Revogar o consentimento</strong> e opor-se ao tratamento.</li>
        </ul>

        {/* ── 10. Exclusão ── */}
        <h2>10. Como solicitar a exclusão dos seus dados</h2>
        <p>
          Para pedir a exclusão da sua conta e dos dados pessoais, envie um e-mail
          para{' '}
          <a className="link" href={`mailto:${EMAIL_PRIVACIDADE}`}>{EMAIL_PRIVACIDADE}</a>{' '}
          com o assunto "Exclusão de dados" informando o número de WhatsApp
          cadastrado. Concluiremos a solicitação no menor prazo possível,
          respeitados os prazos legais de guarda obrigatória.
        </p>

        {/* ── 11. Cookies ── */}
        <h2>11. Cookies</h2>
        <p>
          Utilizamos apenas cookies e armazenamento local <strong>estritamente
          necessários</strong> ao funcionamento (por exemplo, para manter sua
          sessão de acesso ao painel). Não utilizamos cookies de publicidade ou de
          rastreamento de terceiros.
        </p>

        {/* ── TERMOS DE USO ── */}
        <h2>12. Termos de Uso do serviço</h2>
        <p>
          Ao contratar o Monitor WHV Austrália você concorda com estas condições:
        </p>
        <ul>
          <li>O serviço é uma <strong>assinatura anual</strong> que pode ser cancelada quando você quiser, sem multa; o acesso permanece válido até o fim do período contratado.</li>
          <li>O serviço monitora fontes públicas e envia <strong>alertas informativos</strong>. Não garantimos a obtenção de visto, vaga ou vínculo empregatício — a decisão e o processo dependem exclusivamente do governo australiano.</li>
          <li>Os alertas são enviados em regime de melhor esforço; eventuais indisponibilidades de terceiros (Meta/WhatsApp, provedores, fonte oficial) podem afetar a entrega.</li>
          <li>Você é responsável por manter seus dados de contato corretos e por não compartilhar seu acesso.</li>
          <li>É vedado usar o serviço para fins ilícitos ou para revenda não autorizada das informações.</li>
        </ul>

        {/* ── 13. Alterações ── */}
        <h2>13. Alterações desta política</h2>
        <p>
          Podemos atualizar esta política para refletir mudanças legais ou do
          serviço. A versão vigente estará sempre disponível nesta página, com a
          data de atualização indicada no topo.
        </p>

        {/* ── 14. Contato ── */}
        <h2>14. Contato</h2>
        <p>
          Dúvidas sobre privacidade ou sobre estes termos podem ser enviadas para{' '}
          <a className="link" href={`mailto:${EMAIL_CONTATO}`}>{EMAIL_CONTATO}</a>.
          Controlador dos dados: {CONTROLADOR}.
        </p>

        <button className="btn-outline legal-back-btn" onClick={() => navigate(-1)}>
          <ArrowLeft size={16} /> Voltar
        </button>
      </div>
    </div>
  )
}
