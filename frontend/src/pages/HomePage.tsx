import { useCallback, useEffect, useState } from 'react'
import { buildSearchParams, fetchProperties } from '../api'
import { FilterPanel } from '../components/FilterPanel'
import { Pagination } from '../components/Pagination'
import { PropertyCard } from '../components/PropertyCard'
import { SortBar } from '../components/SortBar'
import {
  buildListingUrlSearchParams,
  parseListingStateFromSearch,
} from '../listingSearchParams'
import { useAuth } from '../AuthContext'
import { useFavorites } from '../FavoritesContext'
import {
  defaultListSort,
  emptyFilters,
  type FilterState,
  type ListSortState,
  type PropertiesResponse,
  type PropertyItem,
} from '../types'

const PAGE_SIZE = 12

function readInitialFromUrl(): {
  filters: FilterState
  page: number
  sort: ListSortState
} {
  if (typeof window === 'undefined') {
    return { filters: emptyFilters, page: 1, sort: defaultListSort }
  }
  return parseListingStateFromSearch(window.location.search)
}

function syncUrl(
  page: number,
  filters: FilterState,
  sort: ListSortState,
): void {
  const params = buildListingUrlSearchParams(page, filters, sort)
  const qs = params.toString()
  const path = window.location.pathname
  const next = qs ? `${path}?${qs}` : path
  const current = `${path}${window.location.search}`
  if (next !== current) {
    window.history.replaceState(null, '', next)
  }
}

function useListings() {
  const initial = readInitialFromUrl()
  const [appliedFilters, setAppliedFilters] = useState<FilterState>(
    initial.filters,
  )
  const [draftFilters, setDraftFilters] = useState<FilterState>(initial.filters)
  const [sort, setSortState] = useState<ListSortState>(initial.sort)
  const [page, setPage] = useState(initial.page)
  const [data, setData] = useState<PropertiesResponse | null>(null)
  const [items, setItems] = useState<PropertyItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = buildSearchParams(page, PAGE_SIZE, appliedFilters, sort)
      const res = await fetchProperties(params)
      setData(res)
      setItems(res.items)
    } catch (e) {
      setData(null)
      setItems([])
      setError(e instanceof Error ? e.message : 'Greška pri učitavanju')
    } finally {
      setLoading(false)
    }
  }, [page, appliedFilters, sort])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    syncUrl(page, appliedFilters, sort)
  }, [page, appliedFilters, sort])

  useEffect(() => {
    const onPopState = () => {
      const { filters, page: p, sort: s } = parseListingStateFromSearch(
        window.location.search,
      )
      setAppliedFilters(filters)
      setDraftFilters(filters)
      setSortState(s)
      setPage(p)
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  const applyFilters = useCallback(() => {
    setAppliedFilters({ ...draftFilters })
    setPage(1)
  }, [draftFilters])

  const resetFilters = useCallback(() => {
    setDraftFilters(emptyFilters)
    setAppliedFilters(emptyFilters)
    setPage(1)
  }, [])

  const setSortAndResetPage = useCallback((next: ListSortState) => {
    setSortState(next)
    setPage(1)
  }, [])

  return {
    draftFilters,
    setDraftFilters,
    applyFilters,
    resetFilters,
    sort,
    setSort: setSortAndResetPage,
    page,
    setPage,
    data,
    items,
    loading,
    error,
    reload: load,
  }
}

export function HomePage() {
  const { user } = useAuth()
  const { isFavorite, isBusy, toggleFavorite } = useFavorites()
  const {
    draftFilters,
    setDraftFilters,
    applyFilters,
    resetFilters,
    sort,
    setSort,
    setPage,
    data,
    items,
    loading,
    error,
  } = useListings()

  return (
    <div className="shell">
      <FilterPanel
        filters={draftFilters}
        onChange={setDraftFilters}
        onApply={applyFilters}
        onReset={resetFilters}
      />

      <main className="main" aria-busy={loading}>
        {error ? (
          <div className="banner banner--error" role="alert">
            {error}
          </div>
        ) : null}

        <SortBar sort={sort} onChange={setSort} />

        {loading ? (
          <div className="state state--loading">
            <div className="spinner" aria-hidden />
            <p>Učitavanje oglasa…</p>
          </div>
        ) : items.length === 0 ? (
          <div className="state state--empty">
            <p>Nema oglasa koji odgovaraju filterima.</p>
          </div>
        ) : (
          <>
            <div className="grid">
              {items.map((p) => (
                <PropertyCard
                  key={p.id}
                  property={p}
                  favorite={
                    user
                      ? {
                          mode: 'toggle',
                          isFavorite: isFavorite(p.id),
                          busy: isBusy(p.id),
                          onToggle: () => void toggleFavorite(p.id),
                        }
                      : undefined
                  }
                />
              ))}
            </div>
            {data ? (
              <Pagination
                page={data.page}
                totalPages={data.totalPages}
                total={data.total}
                pageSize={data.pageSize}
                onPageChange={setPage}
              />
            ) : null}
          </>
        )}
      </main>
    </div>
  )
}
