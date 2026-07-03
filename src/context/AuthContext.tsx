import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import type { Subscriber } from '../types'

const SESSION_KEY = 'whv_session'

interface AuthState {
  subscriber: Subscriber | null
  token: string | null
  loading: boolean
}

interface AuthContextValue extends AuthState {
  login: (token: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ subscriber: null, token: null, loading: true })

  const validate = useCallback(async (token: string) => {
    // Valida via Edge Function (service role) — NUNCA por SELECT anon, senão o
    // session_token de qualquer assinante ficaria legível publicamente (takeover).
    const { data, error } = await supabase.functions.invoke('australia-validate-session', {
      body: { session_token: token },
    })

    const subscriber = (data as { subscriber?: Subscriber } | null)?.subscriber ?? null
    if (error || !subscriber) {
      localStorage.removeItem(SESSION_KEY)
      setState({ subscriber: null, token: null, loading: false })
      return
    }

    setState({ subscriber, token, loading: false })
  }, [])

  useEffect(() => {
    const stored = localStorage.getItem(SESSION_KEY)
    if (stored) {
      validate(stored)
    } else {
      setState(s => ({ ...s, loading: false }))
    }
  }, [validate])

  const login = async (token: string) => {
    localStorage.setItem(SESSION_KEY, token)
    await validate(token)
  }

  const logout = () => {
    localStorage.removeItem(SESSION_KEY)
    setState({ subscriber: null, token: null, loading: false })
  }

  return (
    <AuthContext.Provider value={{ ...state, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be inside AuthProvider')
  return ctx
}
