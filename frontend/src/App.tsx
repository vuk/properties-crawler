import { Outlet } from 'react-router-dom'

import { useAuth } from './AuthContext'
import { AppHeader } from './components/AppHeader'

export default function App() {
  const { bootstrapping } = useAuth()

  if (bootstrapping) {
    return (
      <div className="layout">
        <AppHeader />
        <div className="layout__body">
          <div className="auth-shell auth-shell--compact">
            <div className="state state--loading">
              <div className="spinner" aria-hidden />
              <p>Učitavanje…</p>
            </div>
          </div>
        </div>
        <footer className="footer">
          <p>Podaci se učitavaju sa API-ja /properties/</p>
        </footer>
      </div>
    )
  }

  return (
    <div className="layout">
      <AppHeader />
      <div className="layout__body">
        <Outlet />
      </div>
      <footer className="footer">
        <p>Podaci se učitavaju sa API-ja /properties/</p>
      </footer>
    </div>
  )
}
