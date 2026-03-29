import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { useAuth } from '../AuthContext'

const MIN_LEN = 8

export function RegisterPage() {
  const { register } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (password !== confirm) {
      setError('Lozinke se ne poklapaju')
      return
    }
    if (password.length < MIN_LEN) {
      setError(`Lozinka mora imati najmanje ${MIN_LEN} karaktera`)
      return
    }
    setSubmitting(true)
    try {
      await register(email, password)
      navigate('/', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registracija nije uspela')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <h1 className="auth-card__title">Registracija</h1>
        <p className="auth-card__lead">
          Već imate nalog?{' '}
          <Link className="auth-card__link" to="/login">
            Prijavite se
          </Link>
        </p>

        {error ? (
          <div className="banner banner--error auth-card__banner" role="alert">
            {error}
          </div>
        ) : null}

        <form className="auth-form" onSubmit={(e) => void onSubmit(e)}>
          <div className="field">
            <label className="field__label" htmlFor="register-email">
              Email
            </label>
            <input
              id="register-email"
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
            <label className="field__label" htmlFor="register-password">
              Lozinka (min. {MIN_LEN})
            </label>
            <input
              id="register-password"
              className="field__input"
              type="password"
              name="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={MIN_LEN}
            />
          </div>
          <div className="field">
            <label className="field__label" htmlFor="register-confirm">
              Potvrdite lozinku
            </label>
            <input
              id="register-confirm"
              className="field__input"
              type="password"
              name="confirm"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              minLength={MIN_LEN}
            />
          </div>
          <button
            className="btn btn--primary auth-form__submit"
            type="submit"
            disabled={submitting}
          >
            {submitting ? 'Registracija…' : 'Registruj se'}
          </button>
        </form>
      </div>
    </div>
  )
}
