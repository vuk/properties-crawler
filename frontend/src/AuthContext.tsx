import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

import {
  fetchMe,
  loginRequest,
  registerRequest,
  type AuthUser,
} from './authApi'
import {
  clearStoredToken,
  getStoredToken,
  setStoredToken,
} from './authStorage'

type AuthContextValue = {
  user: AuthUser | null
  bootstrapping: boolean
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [bootstrapping, setBootstrapping] = useState(true)

  useEffect(() => {
    const token = getStoredToken()
    if (!token) {
      setBootstrapping(false)
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const u = await fetchMe(token)
        if (cancelled) return
        if (u) {
          setUser(u)
        } else {
          clearStoredToken()
        }
      } catch {
        if (!cancelled) clearStoredToken()
      } finally {
        if (!cancelled) setBootstrapping(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const body = await loginRequest(email, password)
    setStoredToken(body.token)
    setUser(body.user)
  }, [])

  const register = useCallback(async (email: string, password: string) => {
    const body = await registerRequest(email, password)
    setStoredToken(body.token)
    setUser(body.user)
  }, [])

  const logout = useCallback(() => {
    clearStoredToken()
    setUser(null)
  }, [])

  const value = useMemo(
    () => ({
      user,
      bootstrapping,
      login,
      register,
      logout,
    }),
    [user, bootstrapping, login, register, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return ctx
}
