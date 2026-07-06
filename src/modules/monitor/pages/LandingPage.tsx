import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, CheckCircle2, Globe, MessageCircle, Shield, Zap, Clock, X, Check } from 'lucide-react'
import { Logo } from '../../../components/Logo'
import { PhoneInput } from '../../../components/PhoneInput'
import { DEFAULT_COUNTRY, toE164, type Country } from '../../../lib/countries'
import { usePlan, cicloLabel } from '../../../lib/plan'

const POOL  = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'

/* ── Flip char ───────────────────────────────────────────────────────────── */
function FlipChar({ char, delay }: { char: string; delay: number }) {
  const [curr, setCurr] = useState('·')
  const [flipping, setFlipping] = useState(false)

  useEffect(() => {
    let n = 0
    const t = setTimeout(() => {
      const iv = setInterval(() => {
        n++
        const next = n >= 10 ? char : POOL[Math.floor(Math.random() * POOL.length)]
        setFlipping(true)
        setTimeout(() => { setCurr(next); setFlipping(false) }, 38)
        if (n >= 10) clearInterval(iv)
      }, 65)
      return () => clearInterval(iv)
    }, delay)
    return () => clearTimeout(t)
  }, [char, delay])

  return <span className={`lp-flip-char${flipping ? ' changing' : ''}`}>{curr}</span>
}

function FlipWord({ word, baseDelay = 240, charDelay = 72 }: {
  word: string; baseDelay?: number; charDelay?: number
}) {
  return (
    <span className="lp-flip-word">
      {word.split('').map((c, i) => (
        <FlipChar key={i} char={c} delay={baseDelay + i * charDelay} />
      ))}
    </span>
  )
}

/* ── Animation state machine: closed → open → notifying → flying → repeat ── */
//  step 0: FECHADO  (3.5s)
//  step 1: ABERTO   (1.2s — flip plays during this)
//  step 2: phone notif visible (2.5s)
//  step 3: airplane flying (1.8s) → resets to step 0
// step 0: FECHADO  (3.5s)
// step 1: ABERTO   (1.4s — flip plays)
// step 2: phone notif visible (3.5s) → back to 0
const STEP_MS = [3500, 1400, 3500]

function AnimBoard({ lastCheck }: { lastCheck: string }) {
  const [step, setStep] = useState(0)
  const [flipKey, setFlipKey] = useState(0)

  useEffect(() => {
    const t = setTimeout(() => {
      const next = (step + 1) % 3
      if (step === 0 || step === 2) setFlipKey(k => k + 1)
      setStep(next)
    }, STEP_MS[step])
    return () => clearTimeout(t)
  }, [step])

  const isOpen    = step >= 1
  const showPhone = step === 2

  return (
    <div className="lp-anim-stage">

      {/* Departure board */}
      <div className="lp-board">
        <div className="lp-board-header">
          <span>PAÍS</span>
          <span>VISTO</span>
          <span>STATUS</span>
          <span>ALERTA</span>
        </div>

        <div className="lp-board-row lp-board-row--active">
          <span className="lp-board-country">🇧🇷 BRASIL</span>
          <span className="lp-board-type">WHV</span>
          <span className={`lp-board-status ${isOpen ? 'lp-board-status--open' : 'lp-board-status--closed'}`}>
            <span className="lp-board-status-dot" />
            {/* key forces remount → re-runs flip animation */}
            <FlipWord
              key={`w-${flipKey}`}
              word={isOpen ? 'ABERTO' : 'FECHADO'}
              baseDelay={flipKey === 0 ? 300 : 0}
              charDelay={flipKey === 0 ? 80 : 55}
            />
          </span>
          <span className="lp-board-alert">● MONIT.</span>
        </div>

        <div className="lp-board-divider" />

        <div className="lp-board-note">
          <span className="lp-board-check">
            <span className="lp-board-check-dot" />
            Verificado {lastCheck}
          </span>
          <span>·</span>
          <span>ABERTO → <span className="lp-board-open-word">WhatsApp em segundos</span></span>
        </div>
      </div>

      {/* Phone — full lock screen */}
      <div className={`lp-anim-phone${showPhone ? ' visible' : ''}`}>
        <div className="lp-ph">
          {/* Dynamic island */}
          <div className="lp-ph-di" />

          {/* Status bar */}
          <div className="lp-ph-status">
            <span>09:41</span>
            <span className="lp-ph-status-icons">
              <span>▲</span><span>●</span><span>▮▮▮</span>
            </span>
          </div>

          {/* Clock area — center of screen */}
          <div className="lp-ph-lock">
            <div className="lp-ph-ls-time">09:41</div>
            <div className="lp-ph-ls-date">Quinta-feira, 4 de julho</div>
          </div>

          {/* Notification at bottom — iOS lock screen style */}
          <div className="lp-ph-notifs">
            <div className="lp-ph-notif" key={`ph-${flipKey}`}>
              <div className="lp-ph-ni-left">
                <div className="lp-ph-wa-ico">💬</div>
              </div>
              <div className="lp-ph-ni-body">
                <div className="lp-ph-ni-head">
                  <span className="lp-ph-ni-app">WhatsApp</span>
                  <span className="lp-ph-ni-now">agora</span>
                </div>
                <div className="lp-ph-ni-from">Monitor WHV Austrália</div>
                <div className="lp-ph-ni-msg">
                  🔔 Vaga <strong>ABERTA!</strong> Brasil — toque para aplicar
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Last-check counter (resets at 120s = 2 min interval) ───────────────── */
function useLastCheck() {
  const [s, setS] = useState(23)
  useEffect(() => {
    const iv = setInterval(() => setS(x => (x >= 119 ? 0 : x + 1)), 1000)
    return () => clearInterval(iv)
  }, [])
  return s < 60 ? `${s}s atrás` : `${Math.floor(s / 60)}m ${s % 60}s atrás`
}

/* ── Scroll reveal ───────────────────────────────────────────────────────── */
function useScrollReveal() {
  useEffect(() => {
    const obs = new IntersectionObserver(
      es => es.forEach(e => { if (e.isIntersecting) e.target.classList.add('revealed') }),
      { threshold: 0.1, rootMargin: '0px 0px -30px 0px' },
    )
    document.querySelectorAll('[data-reveal]').forEach(el => obs.observe(el))
    return () => obs.disconnect()
  }, [])
}

/* ── Page ────────────────────────────────────────────────────────────────── */
export function LandingPage() {
  const navigate   = useNavigate()
  const { data: plan } = usePlan()
  const periodo    = cicloLabel(plan.ciclo).replace(/^por\s+/, '/ ')  // 'anual' → '/ ano'
  const [country, setCountry] = useState<Country>(DEFAULT_COUNTRY)
  const [phone, setPhone] = useState('')
  const lastCheck  = useLastCheck()
  useScrollReveal()

  return (
    <div className="lp">
      {/* NAV */}
      <nav className="lp-nav">
        <span className="lp-logo">
          <Logo size={32} />
          <span>Monitor WHV</span>
        </span>
        <div className="lp-nav-links">
          <button className="lp-nav-link"
            onClick={() => document.getElementById('como-funciona')?.scrollIntoView({ behavior: 'smooth' })}>
            Como funciona
          </button>
          <button className="lp-nav-link"
            onClick={() => document.getElementById('preco')?.scrollIntoView({ behavior: 'smooth' })}>
            Preço
          </button>
          <button className="btn-outline" onClick={() => navigate('/login')}>
            Já sou assinante
          </button>
        </div>
      </nav>

      {/* HERO */}
      <section className="lp-hero">
        <div className="lp-hero-badge">
          <span className="pulse-dot" />
          Monitoramento ativo agora
        </div>
        <h1 className="lp-hero-title">
          Não perca a vaga WHV<br />
          <span className="lp-accent">por estar dormindo.</span>
        </h1>
        <p className="lp-hero-sub">
          As vagas surgem sem aviso e somem em minutos. O Monitor WHV te avisa
          no WhatsApp assim que aparecer uma vaga para o Brasil — a qualquer hora.
        </p>
      </section>

      {/* VISUAL UNIT */}
      <div className="lp-unit">
        <div className="lp-visual">
          <div className="lp-visual-center">
            <AnimBoard lastCheck={lastCheck} />
          </div>
        </div>

        {/* CONVERSION CARD */}
        <div className="lp-card">
          <div className="lp-card-form">
            <div className="lp-card-field">
              <label className="lp-card-label">🇧🇷 Número WhatsApp Brasil</label>
              <PhoneInput
                country={country}
                onCountryChange={setCountry}
                phone={phone}
                onPhoneChange={setPhone}
                variant="card"
              />
            </div>
            <button className="lp-card-btn"
              onClick={() => {
                const digits = phone.replace(/\D/g, '')
                navigate('/comprar', digits
                  ? { state: { phone: toE164(country.code, digits), phoneDigits: digits, countryIso: country.iso } }
                  : undefined)
              }}>
              Quero ser notificado — {plan.priceLabel}
            </button>
          </div>
          <p className="lp-card-fine">Assinatura anual · Cancele quando quiser</p>
        </div>
      </div>

      {/* URGENCY */}
      <section className="lp-urgency">
        <div className="lp-urgency-wrap">
          <div className="lp-section-label" data-reveal>O que está em jogo</div>
          <h2 data-reveal style={{ transitionDelay: '80ms' }}>Vagas esgotam em menos de 2 horas</h2>
          <p className="lp-urgency-p" data-reveal style={{ transitionDelay: '160ms' }}>
            Em 2023, as vagas WHV do Brasil foram preenchidas em 1h47min.
            Quem não recebeu alerta perdeu a chance — e esperou mais um ano inteiro.
          </p>
          <div className="lp-compare">
            <div className="lp-cmp bad" data-reveal style={{ transitionDelay: '240ms' }}>
              <div className="lp-cmp-head">❌ Sem o Monitor WHV</div>
              <div className="lp-cmp-list">
                {[
                  'Acorda sem saber que as vagas já abriram e fecharam',
                  'Acessa o site e vê "no places available"',
                  'Mais 12 meses esperando a próxima abertura',
                  'Fica monitorando manualmente o tempo todo, sem garantia',
                ].map(t => (
                  <div key={t} className="lp-cmp-item">
                    <X size={14} style={{ color: 'var(--red)', flexShrink: 0, marginTop: 2 }} />
                    {t}
                  </div>
                ))}
              </div>
            </div>
            <div className="lp-cmp good" data-reveal style={{ transitionDelay: '340ms' }}>
              <div className="lp-cmp-head">✅ Com o Monitor WHV</div>
              <div className="lp-cmp-list">
                {[
                  'Notificação no WhatsApp em segundos após a abertura',
                  'Link direto para o site oficial — sem precisar pesquisar',
                  'Aplica entre os primeiros — antes das vagas acabarem',
                  'Dorme tranquilo. Sistema trabalha 24h no seu lugar',
                ].map(t => (
                  <div key={t} className="lp-cmp-item">
                    <Check size={14} style={{ color: 'var(--green)', flexShrink: 0, marginTop: 2 }} />
                    {t}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="section" id="como-funciona">
        <h2 className="section-title" data-reveal>Como funciona</h2>
        <div className="steps">
          {[
            { icon: <Globe size={24} strokeWidth={1.75} />,        title: 'Monitoramento automático', desc: 'Verificamos o site oficial australiano a cada 2 minutos, 24h por dia.', d: '0ms' },
            { icon: <Zap size={24} strokeWidth={1.75} />,          title: 'Detecção em segundos',    desc: 'Assim que a vaga aparece, nosso sistema identifica e dispara o alerta.', d: '120ms' },
            { icon: <MessageCircle size={24} strokeWidth={1.75} />, title: 'WhatsApp na hora',        desc: 'Link direto para o site oficial. Você aplica antes de todo mundo.', d: '240ms' },
          ].map((s, i) => (
            <>
              {i > 0 && <div key={`a${i}`} className="step-arrow" data-reveal style={{ transitionDelay: `${i * 120 - 60}ms` }}>→</div>}
              <div key={s.title} className="step" data-reveal style={{ transitionDelay: s.d }}>
                <div className="step-icon">{s.icon}</div>
                <h3>{s.title}</h3>
                <p>{s.desc}</p>
              </div>
            </>
          ))}
        </div>
      </section>

      {/* FEATURES */}
      <section className="section section-dark">
        <h2 className="section-title" data-reveal>Por que o Monitor WHV?</h2>
        <div className="features">
          {[
            { icon: <Clock size={20} strokeWidth={1.75} />,        title: 'A cada 2 minutos',  desc: 'Mais rápido que qualquer monitoramento manual. Nunca para.' },
            { icon: <MessageCircle size={20} strokeWidth={1.75} />, title: 'WhatsApp direto',   desc: 'Sem app novo. Alerta no mesmo app que você já usa todo dia.' },
            { icon: <Globe size={20} strokeWidth={1.75} />,         title: 'Fonte oficial',     desc: 'Monitoramos direto o immi.homeaffairs.gov.au — nada de intermediários.' },
            { icon: <CheckCircle2 size={20} strokeWidth={1.75} />,  title: 'Assinatura anual',  desc: 'Um ano de alertas. Cancele quando quiser, sem multa.' },
            { icon: <Shield size={20} strokeWidth={1.75} />,        title: 'Só o número',       desc: 'Sem cadastro longo. Sem dados bancários armazenados.' },
            { icon: <Bell size={20} strokeWidth={1.75} />,          title: 'Painel online',     desc: 'Acompanhe o status atual e histórico de verificações em tempo real.' },
          ].map((f, i) => (
            <div key={f.title} className="feature-card" data-reveal style={{ transitionDelay: `${(i % 3) * 100}ms` }}>
              <div className="feature-icon">{f.icon}</div>
              <h4>{f.title}</h4>
              <p>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* PRICING */}
      <section className="section" id="preco">
        <h2 className="section-title" data-reveal>Simples e direto</h2>
        <div className="pricing-card" data-reveal style={{ transitionDelay: '80ms' }}>
          <div className="pricing-badge">Assinatura anual</div>
          <div className="pricing-price">{plan.priceLabel} <span className="pricing-per">{periodo}</span></div>
          <p className="pricing-desc">Um ano de monitoramento. Cancele quando quiser.</p>
          <ul className="pricing-list">
            <li><CheckCircle2 size={16} /> Alertas WhatsApp ilimitados</li>
            <li><CheckCircle2 size={16} /> Acesso ao painel de status</li>
            <li><CheckCircle2 size={16} /> Verificações a cada 2 minutos</li>
            <li><CheckCircle2 size={16} /> Monitoramento 24h por dia</li>
          </ul>
          <button className="btn-primary-lg" onClick={() => navigate('/comprar')}>Começar agora</button>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="landing-footer">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Logo size={20} />
          <span>Monitor WHV Austrália · Não somos afiliados ao governo australiano</span>
        </div>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          <button className="btn-text" onClick={() => navigate('/termos')}>Termos e Privacidade</button>
          <button className="btn-text" onClick={() => navigate('/login')}>Já sou assinante</button>
        </div>
      </footer>
    </div>
  )
}
