import { useCallback, useEffect, useState } from 'react'
import { buildSearchParams, fetchProperties } from './api'
import { FilterPanel } from './components/FilterPanel'
import { Pagination } from './components/Pagination'
import { PropertyCard } from './components/PropertyCard'
import {
  emptyFilters,
  type FilterState,
  type PropertiesResponse,
  type PropertyItem,
} from './types'

const PAGE_SIZE = 12

function useListings() {
  const [appliedFilters, setAppliedFilters] = useState<FilterState>(emptyFilters)
  const [draftFilters, setDraftFilters] = useState<FilterState>(emptyFilters)
  const [page, setPage] = useState(1)
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
