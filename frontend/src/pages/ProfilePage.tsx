import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { useAuth } from '../AuthContext'
import { useFavorites } from '../FavoritesContext'
import { fetchFavoritesList } from '../favoritesApi'
import { PropertyCard } from '../components/PropertyCard'
import type { PropertyItem } from '../types'

export function ProfilePage() {
  const { user } = useAuth()
  const { removeFavoriteById, isBusy } = useFavorites()
  const [items, setItems] = useState<PropertyItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!user) {
      setItems([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const list = await fetchFavoritesList()
      setItems(list)
    } catch (e) {
      setItems([])
      setError(e instanceof Error ? e.message : 'Greška pri učitavanju')
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    void load()
  }, [load])

  const handleRemove = useCallback(
    async (property: PropertyItem) => {
      try {
        await removeFavoriteById(property.id)
        setItems((prev) => prev.filter((p) => p.id !== property.id))
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Brisanje nije uspelo')
      }
    },
    [removeFavoriteById],
  )

  if (!user) {
    return (
      <div className="shell profile-shell">
        <main className="main">
          <div className="auth-shell">
            <h1 className="profile__title">Moj profil</h1>
            <p className="profile__lead">
              Prijavite se da biste videli sačuvane oglase.
            </p>
            <p>
              <Link to="/login" className="profile__inline-link">
                Prijava
              </Link>
              {' · '}
              <Link to="/register" className="profile__inline-link">
                Registracija
              </Link>
            </p>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="shell profile-shell">
      <main className="main profile-main" aria-busy={loading}>
        <header className="profile__header">
          <h1 className="profile__title">Moj profil</h1>
          <p className="profile__email" title={user.email}>
            {user.email}
          </p>
          <p className="profile__lead">Sačuvani oglasi</p>
        </header>

        {error ? (
          <div className="banner banner--error" role="alert">
            {error}
          </div>
        ) : null}

        {loading ? (
          <div className="state state--loading">
            <div className="spinner" aria-hidden />
            <p>Učitavanje sačuvanih oglasa…</p>
          </div>
        ) : items.length === 0 ? (
          <div className="state state--empty">
            <p>Još nema sačuvanih oglasa.</p>
            <p className="profile__hint">
              Na početnoj strani kliknite srce na oglasu da ga dodate ovde.
            </p>
            <Link to="/" className="btn btn--primary profile__back">
              Na listu oglasa
            </Link>
          </div>
        ) : (
          <div className="grid">
            {items.map((p) => (
              <PropertyCard
                key={p.id}
                property={p}
                favorite={{
                  mode: 'remove',
                  busy: isBusy(p.id),
                  onRemove: () => void handleRemove(p),
                }}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
