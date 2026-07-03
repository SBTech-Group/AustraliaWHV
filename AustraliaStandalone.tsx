import { LogOut, Plane } from 'lucide-react'
import { supabase } from './supabase'
import { AustraliaWhvPage } from './AustraliaWhvPage'

export function AustraliaStandalone() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'hsl(var(--color-background))' }}>
      <header
        style={{
          height: 56,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 24px',
          borderBottom: '1px solid hsl(var(--color-border))',
          background: 'hsl(var(--color-surface))',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Plane strokeWidth={1.75} style={{ width: 20, height: 20, color: '#E2BE6A' }} />
          <span style={{ fontSize: 15, fontWeight: 600 }}>Austrália WHV</span>
          <span className="badge-pill b-neutral" style={{ fontSize: 10 }}>temporário</span>
        </div>
        <button className="btn btn-secondary" onClick={() => supabase.auth.signOut()}>
          <span className="b-ic"><LogOut strokeWidth={1.75} /></span>Sair
        </button>
      </header>

      <main style={{ flex: 1, overflowY: 'auto' }}>
        <AustraliaWhvPage />
      </main>
    </div>
  )
}
