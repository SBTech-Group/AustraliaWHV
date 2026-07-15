import { Route, Routes } from 'react-router-dom'
import { ProtectedRoute } from '../core/auth/ProtectedRoute'
import { AdminRoute } from '../core/auth/AdminRoute'
import {
  LandingPage,
  CheckoutPage,
  SuccessPage,
  LoginPage,
  MonitorPage,
  PlanPage,
  AdminLoginPage,
  AdminPage,
  TermosPage,
  NotFoundPage,
} from '../modules/monitor'

export function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/comprar" element={<CheckoutPage />} />
      <Route path="/sucesso" element={<SuccessPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/termos" element={<TermosPage />} />
      <Route
        path="/monitor"
        element={
          <ProtectedRoute>
            <MonitorPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/monitor/plano"
        element={
          <ProtectedRoute>
            <PlanPage />
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
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}
