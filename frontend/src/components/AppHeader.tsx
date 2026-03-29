import { Link, NavLink } from 'react-router-dom'

import { useAuth } from '../AuthContext'

export function AppHeader() {
  const { user, logout } = useAuth()

  return (
    <header className="header">
      <div className="header__inner header__inner--split">
        <Link to="/" className="brand brand--link">
          <span className="brand__mark" aria-hidden />
          <div>
            <h1 className="brand__title">Pronađi nekretninu</h1>
            <p className="brand__tagline">Lista oglasa iz baze</p>
          </div>
        </Link>

        <nav className="header__nav" aria-label="Glavna navigacija">
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              `header__nav-link${isActive ? ' header__nav-link--active' : ''}`
            }
          >
            Početna
          </NavLink>
          <NavLink
            to="/profile"
            className={({ isActive }) =>
              `header__nav-link${isActive ? ' header__nav-link--active' : ''}`
            }
          >
            Profil
          </NavLink>
          {user ? (
            <>
              <span className="header__user" title={user.email}>
                {user.email}
              </span>
              <button
                type="button"
                className="btn btn--ghost header__nav-btn"
                onClick={() => logout()}
              >
                Odjava
              </button>
            </>
          ) : (
            <>
              <NavLink
                to="/login"
                className={({ isActive }) =>
                  `header__nav-link${isActive ? ' header__nav-link--active' : ''}`
                }
              >
                Prijava
              </NavLink>
              <NavLink
                to="/register"
                className={({ isActive }) =>
                  `header__nav-link header__nav-link--cta${isActive ? ' header__nav-link--active' : ''}`
                }
              >
                Registracija
              </NavLink>
            </>
          )}
        </nav>
      </div>
    </header>
  )
}
