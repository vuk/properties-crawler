import { useCallback, useEffect, useState } from 'react'
import { buildSearchParams, fetchProperties } from './api'
import { FilterPanel } from './components/FilterPanel'
import { Pagination } from './components/Pagination'
import { PropertyCard } from './components/PropertyCard'
import {
  buildListingUrlSearchParams,
  parseListingStateFromSearch,
} from './listingSearchParams'
import {
  emptyFilters,
  type FilterState,
  type PropertiesResponse,
  type PropertyItem,
} from './types'

const PAGE_SIZE = 12

function readInitialFromUrl(): {
  filters: FilterState
  page: number
} {
  if (typeof window === 'undefined') {
    return { filters: emptyFilters, page: 1 }
  }
  return parseListingStateFromSearch(window.location.search)
}

function syncUrl(page: number, filters: FilterState): void {
  const params = buildListingUrlSearchParams(page, filters)
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
  const [page, setPage] = useState(initial.page)
  const [data, setData] = useState<PropertiesResponse | null>(null)
  const [items, setItems] = useState<PropertyItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = buildSearchParams(page, PAGE_SIZE, appliedFilters)
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
  }, [page, appliedFilters])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    syncUrl(page, appliedFilters)
  }, [page, appliedFilters])

  useEffect(() => {
    const onPopState = () => {
      const { filters, page: p } = parseListingStateFromSearch(
        window.location.search,
      )
      setAppliedFilters(filters)
      setDraftFilters(filters)
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

  return {
    draftFilters,
    setDraftFilters,
    applyFilters,
    resetFilters,
    page,
    setPage,
    data,
    items,
    loading,
    error,
    reload: load,
  }
}

export default function App() {
  const {
    draftFilters,
    setDraftFilters,
    applyFilters,
    resetFilters,
    setPage,
    data,
    items,
    loading,
    error,
  } = useListings()

  return (
    <div className="layout">
      <header className="header">
        <div className="header__inner">
          <div className="brand">
            <span className="brand__mark" aria-hidden />
            <div>
              <h1 className="brand__title">Pronađi nekretninu</h1>
              <p className="brand__tagline">Lista oglasa iz baze</p>
            </div>
          </div>
        </div>
      </header>

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
                  <PropertyCard key={p.id} property={p} />
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

      <footer className="footer">
        <p>Podaci se učitavaju sa API-ja /properties/</p>
      </footer>
    </div>
  )
}
