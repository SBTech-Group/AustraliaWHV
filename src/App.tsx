import { Route, Routes } from 'react-router-dom'
import { ProtectedRoute } from './components/ProtectedRoute'
import { AdminRoute } from './components/AdminRoute'
import { LandingPage } from './pages/LandingPage'
import { CheckoutPage } from './pages/CheckoutPage'
import { SuccessPage } from './pages/SuccessPage'
import { LoginPage } from './pages/LoginPage'
import { MonitorPage } from './pages/MonitorPage'
import { AdminLoginPage } from './pages/AdminLoginPage'
import { AdminPage } from './pages/AdminPage'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/comprar" element={<CheckoutPage />} />
      <Route path="/sucesso" element={<SuccessPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/monitor"
        element={
          <ProtectedRoute>
            <MonitorPage />
          </ProtectedRoute>
        }
      />
      {/* Admin (Supabase Auth email/senha — separado do assinante) */}
      <Route path="/admin/login" element={<AdminLoginPage />} />
      <Route
        path="/admin"
        element={
          <AdminRoute>
            <AdminPage />
          </AdminRoute>
        }
      />
    </Routes>
  )
}
