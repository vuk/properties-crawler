import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { useAuth } from '../AuthContext'

export function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await login(email, password)
      navigate('/', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Prijava nije uspela')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <h1 className="auth-card__title">Prijava</h1>
        <p className="auth-card__lead">
          Nemate nalog?{' '}
          <Link className="auth-card__link" to="/register">
            Registrujte se
          </Link>
        </p>

        {error ? (
          <div className="banner banner--error auth-card__banner" role="alert">
            {error}
          </div>
        ) : null}

        <form className="auth-form" onSubmit={(e) => void onSubmit(e)}>
          <div className="field">
            <label className="field__label" htmlFor="login-email">
              Email
            </label>
            <input
              id="login-email"
              className="field__input"
              type="email"
              name="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label className="field__label" htmlFor="login-password">
              Lozinka
            </label>
            <input
              id="login-password"
              className="field__input"
              type="password"
              name="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <button
            className="btn btn--primary auth-form__submit"
            type="submit"
            disabled={submitting}
          >
            {submitting ? 'Prijava…' : 'Prijavi se'}
          </button>
        </form>
      </div>
    </div>
  )
}
