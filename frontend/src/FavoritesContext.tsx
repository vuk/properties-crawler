import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

import { useAuth } from './AuthContext'
import {
  addFavoriteProperty,
  fetchFavoriteIds,
  removeFavoriteProperty,
} from './favoritesApi'

type FavoritesContextValue = {
  favoriteIds: ReadonlySet<string>
  isFavorite: (propertyId: string) => boolean
  isBusy: (propertyId: string) => boolean
  toggleFavorite: (propertyId: string) => Promise<void>
  removeFavoriteById: (propertyId: string) => Promise<void>
  refreshFavoriteIds: () => Promise<void>
}

const FavoritesContext = createContext<FavoritesContextValue | null>(null)

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [ids, setIds] = useState<string[]>([])
  const [busyIds, setBusyIds] = useState<Record<string, boolean>>({})

  const refreshFavoriteIds = useCallback(async () => {
    if (!user) {
      setIds([])
      return
    }
    try {
      const next = await fetchFavoriteIds()
      setIds(next)
    } catch {
      setIds([])
    }
  }, [user])

  useEffect(() => {
    void refreshFavoriteIds()
  }, [refreshFavoriteIds])

  const favoriteIds = useMemo(() => new Set(ids), [ids])

  const isFavorite = useCallback(
    (propertyId: string) => favoriteIds.has(propertyId),
    [favoriteIds],
  )

  const isBusy = useCallback(
    (propertyId: string) => Boolean(busyIds[propertyId]),
    [busyIds],
  )

  const toggleFavorite = useCallback(
    async (propertyId: string) => {
      if (!user) return
      const currently = ids.includes(propertyId)
      setBusyIds((b) => ({ ...b, [propertyId]: true }))
      setIds((prev) =>
        currently ? prev.filter((x) => x !== propertyId) : [...prev, propertyId],
      )
      try {
        if (currently) {
          await removeFavoriteProperty(propertyId)
        } else {
          await addFavoriteProperty(propertyId)
        }
      } catch {
        setIds((prev) =>
          currently ? [...prev, propertyId] : prev.filter((x) => x !== propertyId),
        )
      } finally {
        setBusyIds((b) => {
          const next = { ...b }
          delete next[propertyId]
          return next
        })
      }
    },
    [user, ids],
  )

  const removeFavoriteById = useCallback(async (propertyId: string) => {
    if (!user) return
    setBusyIds((b) => ({ ...b, [propertyId]: true }))
    try {
      await removeFavoriteProperty(propertyId)
      setIds((prev) => prev.filter((x) => x !== propertyId))
    } finally {
      setBusyIds((b) => {
        const next = { ...b }
        delete next[propertyId]
        return next
      })
    }
  }, [user])

  const value = useMemo(
    () => ({
      favoriteIds,
      isFavorite,
      isBusy,
      toggleFavorite,
      removeFavoriteById,
      refreshFavoriteIds,
    }),
    [
      favoriteIds,
      isFavorite,
      isBusy,
      toggleFavorite,
      removeFavoriteById,
      refreshFavoriteIds,
    ],
  )

  return (
    <FavoritesContext.Provider value={value}>{children}</FavoritesContext.Provider>
  )
}

export function useFavorites(): FavoritesContextValue {
  const ctx = useContext(FavoritesContext)
  if (!ctx) {
    throw new Error('useFavorites must be used within FavoritesProvider')
  }
  return ctx
}
