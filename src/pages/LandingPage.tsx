import { useNavigate } from 'react-router-dom'
import { Bell, CheckCircle2, Globe, MessageCircle, RefreshCw, Shield } from 'lucide-react'

const PRICE = import.meta.env.VITE_PRODUCT_PRICE ?? 'R$ 49,90'

export function LandingPage() {
  const navigate = useNavigate()

  return (
    <div className="landing">
      {/* NAV */}
      <nav className="landing-nav">
        <span className="landing-logo">
          <span className="logo-flag">🇦🇺</span>
          <span>Monitor WHV</span>
        </span>
        <button className="btn-outline" onClick={() => navigate('/login')}>
          Já sou assinante
        </button>
      </nav>

      {/* HERO */}
      <section className="hero">
        <div className="hero-badge">
          <span className="pulse-dot" />
          Monitoramento em tempo real
        </div>
        <h1 className="hero-title">
          Seja notificado no WhatsApp quando a Austrália abrir vagas WHV
        </h1>
        <p className="hero-subtitle">
          Nosso sistema verifica o site oficial australiano a cada 5 minutos e te avisa na hora que surgir uma vaga para o seu país.
          Você não precisa ficar acompanhando manualmente.
        </p>
        <div className="hero-cta">
          <button className="btn-primary-lg" onClick={() => navigate('/comprar')}>
            Quero ser notificado — {PRICE}
          </button>
          <span className="hero-cta-sub">Pagamento único · Sem mensalidade · Cancele quando quiser</span>
        </div>

        {/* STATUS CARD */}
        <div className="status-preview">
          <div className="status-preview-header">
            <RefreshCw size={14} strokeWidth={2} />
            <span>Última verificação: agora há pouco</span>
          </div>
          <div className="status-row">
            <div className="status-indicator closed">
              <span className="status-dot" />
              Fechado
            </div>
            <span className="status-country">🇧🇷 Brasil</span>
          </div>
          <p className="status-preview-note">
            Assim que mudar para <strong style={{ color: '#4FCB8E' }}>Aberto</strong>, você recebe no WhatsApp em segundos.
          </p>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="section">
        <h2 className="section-title">Como funciona</h2>
        <div className="steps">
          <div className="step">
            <div className="step-icon"><Globe size={24} strokeWidth={1.75} /></div>
            <h3>Monitoramento automático</h3>
            <p>Verificamos o site oficial do governo australiano a cada 5 minutos, 24 horas por dia.</p>
          </div>
          <div className="step-arrow">→</div>
          <div className="step">
            <div className="step-icon"><Bell size={24} strokeWidth={1.75} /></div>
            <h3>Detecção instantânea</h3>
            <p>Assim que uma vaga abre, nosso sistema identifica a mudança em segundos.</p>
          </div>
          <div className="step-arrow">→</div>
          <div className="step">
            <div className="step-icon"><MessageCircle size={24} strokeWidth={1.75} /></div>
            <h3>Alerta no WhatsApp</h3>
            <p>Você recebe uma mensagem direta no seu WhatsApp com o link oficial para aplicar.</p>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section className="section section-dark">
        <h2 className="section-title">Por que escolher o Monitor WHV?</h2>
        <div className="features">
          {[
            { icon: <RefreshCw size={20} strokeWidth={1.75} />, title: 'Verificação a cada 5 min', desc: 'Mais rápido que qualquer monitoramento manual.' },
            { icon: <MessageCircle size={20} strokeWidth={1.75} />, title: 'WhatsApp direto', desc: 'Sem aplicativo novo. Notificação no app que você já usa.' },
            { icon: <Globe size={20} strokeWidth={1.75} />, title: 'Site oficial', desc: 'Monitoramos direto o immi.homeaffairs.gov.au — fonte confiável.' },
            { icon: <CheckCircle2 size={20} strokeWidth={1.75} />, title: 'Pagamento único', desc: 'Pague uma vez e fique na lista até o visto abrir.' },
            { icon: <Shield size={20} strokeWidth={1.75} />, title: 'Sem complicação', desc: 'Só o seu número. Sem cadastro longo, sem dados sensíveis.' },
            { icon: <Bell size={20} strokeWidth={1.75} />, title: 'Painel online', desc: 'Acompanhe o status atual e histórico de verificações.' },
          ].map(f => (
            <div key={f.title} className="feature-card">
              <div className="feature-icon">{f.icon}</div>
              <h4>{f.title}</h4>
              <p>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* PRICING */}
      <section className="section">
        <h2 className="section-title">Simples e direto</h2>
        <div className="pricing-card">
          <div className="pricing-badge">Pagamento único</div>
          <div className="pricing-price">{PRICE}</div>
          <p className="pricing-desc">Uma vez. Para sempre. Até o visto abrir.</p>
          <ul className="pricing-list">
            <li><CheckCircle2 size={16} /> Alertas WhatsApp ilimitados</li>
            <li><CheckCircle2 size={16} /> Acesso ao painel de status</li>
            <li><CheckCircle2 size={16} /> Verificações a cada 5 minutos</li>
            <li><CheckCircle2 size={16} /> Monitoramento 24h por dia</li>
          </ul>
          <button className="btn-primary-lg" onClick={() => navigate('/comprar')}>
            Começar agora
          </button>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="landing-footer">
        <p>Monitor WHV Austrália · Não somos afiliados ao governo australiano</p>
        <button className="btn-text" onClick={() => navigate('/login')}>Já sou assinante</button>
      </footer>
    </div>
  )
}
