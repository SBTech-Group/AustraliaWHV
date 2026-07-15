import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Bell, CheckCircle2, Globe, MessageCircle, Shield, Zap, Clock, X, Check, Instagram, Users } from 'lucide-react'
import { Logo } from '../../../components/Logo'
import { PhoneInput } from '../../../components/PhoneInput'
import { DEFAULT_COUNTRY, toE164, type Country } from '../../../lib/countries'
import { usePlan, cicloLabel } from '../../../lib/plan'
import { usePublicConfig } from '../../../lib/publicConfig'
import { whatsappUrl } from '../../../lib/contact'
import { supabase } from '../../../lib/supabase'

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

/* ── Last-check counter (resets at 60s = 1 min interval) ────────────────── */
function useLastCheck() {
  const [s, setS] = useState(12)
  useEffect(() => {
    const iv = setInterval(() => setS(x => (x >= 59 ? 0 : x + 1)), 1000)
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

function instagramHref(value?: string | null) {
  const clean = String(value ?? '').trim()
  if (!clean) return null
  if (/^https?:\/\//i.test(clean)) return clean
  if (clean.startsWith('@')) return `https://instagram.com/${clean.slice(1)}`
  if (clean.includes('/')) return `https://${clean}`
  return `https://instagram.com/${clean}`
}

function useLandingPublicStatus() {
  return useQuery<{ group_member_count: number | null }>({
    queryKey: ['landing_public_status'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('australia_whv_public_status')
        .select('group_member_count')
        .maybeSingle()
      if (error) throw error
      return data as { group_member_count: number | null }
    },
    refetchInterval: 20_000,
  })
}

/* ── Page ────────────────────────────────────────────────────────────────── */
export function LandingPage() {
  const navigate   = useNavigate()
  const { data: plan } = usePlan()
  const { data: publicConfig } = usePublicConfig()
  const { data: landingStatus } = useLandingPublicStatus()
  const periodo    = cicloLabel(plan.ciclo).replace(/^por\s+/, '/ ')  // 'anual' → '/ ano'
  const [country, setCountry] = useState<Country>(DEFAULT_COUNTRY)
  const [phone, setPhone] = useState('')
  const lastCheck  = useLastCheck()
  const supportHref = whatsappUrl(publicConfig?.support_whatsapp_number, publicConfig?.support_default_message)
  const instagramUrl = instagramHref(publicConfig?.instagram_url)
  const groupCount = Number(landingStatus?.group_member_count ?? 0)
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
          <button className="lp-nav-link"
            onClick={() => document.getElementById('contato')?.scrollIntoView({ behavior: 'smooth' })}>
            Contato
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
          {groupCount > 0 ? `${groupCount} pessoas no grupo de alertas` : 'Grupo de alertas ativo agora'}
        </div>
        <h1 className="lp-hero-title">
          Receba alerta quando o visto<br />
          <span className="lp-accent">Work and Holiday abrir.</span>
        </h1>
        <p className="lp-hero-sub">
          O Work and Holiday Visa da Austrália tem cotas limitadas para brasileiros.
          Acompanhamos o site oficial 24h e avisamos no WhatsApp assim que houver
          mudança de status para o Brasil.
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
              Quero receber alertas - {plan.priceLabel}
            </button>
          </div>
          <p className="lp-card-fine">Assinatura anual · Cancele quando quiser</p>
        </div>
      </div>

      {/* URGENCY */}
      <section className="lp-urgency">
        <div className="lp-urgency-wrap">
          <div className="lp-section-label" data-reveal>O que está em jogo</div>
          <h2 data-reveal style={{ transitionDelay: '80ms' }}>Quando a cota abre, cada minuto conta</h2>
          <p className="lp-urgency-p" data-reveal style={{ transitionDelay: '160ms' }}>
            O Work and Holiday Visa, também chamado de WHV, permite que brasileiros
            viagem e trabalhem legalmente na Austrália por um período limitado.
            Como as vagas são por cota, quem descobre tarde pode perder a janela.
          </p>
          <div className="lp-compare">
            <div className="lp-cmp bad" data-reveal style={{ transitionDelay: '240ms' }}>
              <div className="lp-cmp-head">❌ Sem o Monitor WHV</div>
              <div className="lp-cmp-list">
                {[
                  'Depende de grupos e boatos para saber se a cota abriu',
                  'Precisa entrar no site oficial várias vezes por dia',
                  'Pode descobrir tarde e encontrar "no places available"',
                  'Perde tempo monitorando manualmente, inclusive de madrugada',
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
                  'Alerta no WhatsApp quando houver mudança no site oficial',
                  'Link direto para a página certa, sem precisar pesquisar',
                  'Painel para conferir status, acesso e grupo de alertas',
                  'Monitoramento 24h para você não ficar atualizando página',
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
            { icon: <Globe size={24} strokeWidth={1.75} />,        title: 'Você cadastra seu WhatsApp', desc: 'Confirme o número antes do pagamento para garantir que o alerta chega no canal certo.', d: '0ms' },
            { icon: <Zap size={24} strokeWidth={1.75} />,          title: 'A gente monitora o site oficial', desc: 'O sistema verifica a página do governo australiano em ciclos curtos, dia e noite.', d: '120ms' },
            { icon: <MessageCircle size={24} strokeWidth={1.75} />, title: 'Você recebe o alerta', desc: 'Quando o status mudar, o grupo recebe a mensagem com o caminho para aplicar.', d: '240ms' },
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
            { icon: <Clock size={20} strokeWidth={1.75} />,        title: 'Vigilância 24h', desc: 'Ideal para quem não pode ficar acordado ou atualizando página o dia inteiro.' },
            { icon: <MessageCircle size={20} strokeWidth={1.75} />, title: 'WhatsApp direto', desc: 'Sem app novo. O alerta chega onde você já acompanha suas mensagens.' },
            { icon: <Globe size={20} strokeWidth={1.75} />,         title: 'Fonte oficial', desc: 'Monitoramos a página pública do governo australiano, não rumores de internet.' },
            { icon: <CheckCircle2 size={20} strokeWidth={1.75} />,  title: 'Acesso por um ano', desc: 'Sua assinatura cobre o período contratado e pode ser gerenciada no painel.' },
            { icon: <Shield size={20} strokeWidth={1.75} />,        title: 'Cadastro enxuto', desc: 'Para comprar você informa o essencial: nome, WhatsApp e pagamento.' },
            { icon: <Bell size={20} strokeWidth={1.75} />,          title: 'Painel do assinante', desc: 'Confira status atual, grupo de alertas, validade e suporte em um lugar só.' },
          ].map((f, i) => (
            <div key={f.title} className="feature-card" data-reveal style={{ transitionDelay: `${(i % 3) * 100}ms` }}>
              <div className="feature-icon">{f.icon}</div>
              <h4>{f.title}</h4>
              <p>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* TRUST FLOW */}
      <section className="section lp-trust-section">
        <div className="lp-section-label" data-reveal>Depois do pagamento</div>
        <h2 className="section-title" data-reveal>Acesso claro, sem ficar perdido</h2>
        <p className="lp-trust-lead" data-reveal>
          {publicConfig?.landing_trust_text}
        </p>
        <div className="lp-trust-grid">
          {[
            { icon: <MessageCircle size={20} strokeWidth={1.75} />, title: '1. Confirme seu WhatsApp', desc: 'Você informa o número, recebe um código e valida que consegue receber mensagens.' },
            { icon: <CheckCircle2 size={20} strokeWidth={1.75} />, title: '2. Pague com segurança', desc: 'Depois do pagamento aprovado, o acesso ao painel fica liberado no mesmo número.' },
            { icon: <Users size={20} strokeWidth={1.75} />, title: '3. Entre no grupo', desc: 'O painel mostra sua situação no grupo de alertas e o convite caso precise entrar manualmente.' },
          ].map((item, i) => (
            <div className="feature-card" key={item.title} data-reveal style={{ transitionDelay: `${i * 100}ms` }}>
              <div className="feature-icon">{item.icon}</div>
              <h4>{item.title}</h4>
              <p>{item.desc}</p>
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
          <p className="pricing-desc">Um ano de monitoramento, alerta em grupo e acesso ao painel do assinante.</p>
          <ul className="pricing-list">
            <li><CheckCircle2 size={16} /> Validação do WhatsApp antes do pagamento</li>
            <li><CheckCircle2 size={16} /> Grupo de alertas com status oficial</li>
            <li><CheckCircle2 size={16} /> Painel para acompanhar acesso e suporte</li>
            <li><CheckCircle2 size={16} /> Monitoramento 24h durante a assinatura</li>
          </ul>
          <button className="btn-primary-lg" onClick={() => navigate('/comprar')}>Começar agora</button>
        </div>
      </section>

      {/* CONTACT */}
      <section className="section lp-info-section" id="contato">
        <div className="lp-section-label" data-reveal>Contato</div>
        <h2 className="section-title" data-reveal>Precisa falar com a gente?</h2>
        <p className="lp-info-copy" data-reveal>
          {publicConfig?.contact_text}
        </p>
        <p className="lp-info-copy" data-reveal>
          {publicConfig?.about_body}
        </p>
        <div className="lp-contact-actions" data-reveal>
          {supportHref && (
            <a className="btn-primary-lg lp-contact-btn" href={supportHref} target="_blank" rel="noopener noreferrer">
              <MessageCircle size={16} /> Falar no WhatsApp
            </a>
          )}
          {instagramUrl && (
            <a className="btn-outline lp-contact-btn lp-instagram-btn" href={instagramUrl} target="_blank" rel="noopener noreferrer">
              <Instagram size={16} /> Instagram
            </a>
          )}
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
