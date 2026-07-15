import { Home, LogIn } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Logo } from '../../../components/Logo'

export function NotFoundPage() {
  const navigate = useNavigate()

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-icon">
          <Logo size={30} />
        </div>
        <h1>Página não encontrada</h1>
        <p className="auth-sub">
          O endereço acessado não existe ou foi movido. Volte para a landing page
          ou entre no painel se você já é assinante.
        </p>
        <div className="plan-actions">
          <button className="btn-primary-lg" onClick={() => navigate('/')}>
            <Home size={16} /> Ir para a landing
          </button>
          <button className="btn-outline" onClick={() => navigate('/login')}>
            <LogIn size={16} /> Sou assinante
          </button>
        </div>
      </div>
    </div>
  )
}
