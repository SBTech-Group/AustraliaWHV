// Módulo único do produto — AustraliaWHV é modelo SaaS (Hub Admin: modelo='saas'),
// não modelo tenant. Não há subscriptions/gating dinâmico por módulo (ARCHITECTURE.md
// > Módulos é para produtos multi-tenant); aqui existe 1 site com N assinantes.
// Mantido como módulo único (landing, checkout, login, monitor, admin) por
// simplicidade — igual à convenção de pastas da casa (core/ + modules/<x>/ + app/).
export { LandingPage } from './pages/LandingPage'
export { CheckoutPage } from './pages/CheckoutPage'
export { SuccessPage } from './pages/SuccessPage'
export { LoginPage } from './pages/LoginPage'
export { MonitorPage } from './pages/MonitorPage'
export { PlanPage } from './pages/PlanPage'
export { AdminLoginPage } from './pages/AdminLoginPage'
export { AdminPage } from './pages/AdminPage'
export { TermosPage } from './pages/TermosPage'
