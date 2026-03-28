import {
  emptyFilters,
  type FilterState,
  type PropertyKind,
  type ServiceKind,
} from './types'

/** Appends listing filter query keys (same names as GET /properties/). */
export function appendListingFilters(
  params: URLSearchParams,
  filters: FilterState,
): void {
  if (filters.propertyKind === 'apartment') {
    params.set('propertyType', 'apartment')
  } else if (filters.propertyKind === 'house') {
    params.set('propertyType', 'house')
  }
  if (filters.serviceKind === 'sale') {
    params.set('serviceType', 'sale')
  } else if (filters.serviceKind === 'rent') {
    params.set('serviceType', 'rent')
  }
  const appendIfPresent = (key: string, value: string) => {
    const t = value.trim()
    if (t !== '') params.set(key, t)
  }
  appendIfPresent('minRooms', filters.minRooms)
  appendIfPresent('maxRooms', filters.maxRooms)
  appendIfPresent('minArea', filters.minArea)
  appendIfPresent('maxArea', filters.maxArea)
  appendIfPresent('minPrice', filters.minPrice)
  appendIfPresent('maxPrice', filters.maxPrice)
  appendIfPresent('minUnitPrice', filters.minUnitPrice)
  appendIfPresent('maxUnitPrice', filters.maxUnitPrice)
  if (filters.locationIds.length > 0) {
    const sorted = [...filters.locationIds].sort((a, b) => a - b)
    params.set('locationIds', sorted.join(','))
  }
}

/** Query string for the browser bar (no pageSize; page only when > 1). */
export function buildListingUrlSearchParams(
  page: number,
  filters: FilterState,
): URLSearchParams {
  const params = new URLSearchParams()
  if (page > 1) params.set('page', String(page))
  appendListingFilters(params, filters)
  return params
}

function parsePropertyKind(raw: string | null): PropertyKind {
  if (raw === 'apartment' || raw === 'house') return raw
  return 'all'
}

function parseServiceKind(raw: string | null): ServiceKind {
  if (raw === 'sale' || raw === 'rent') return raw
  return 'all'
}

function parseLocationIds(raw: string | null): number[] {
  if (raw == null || raw.trim() === '') return []
  const ids = raw
    .split(',')
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n))
  return [...new Set(ids)].sort((a, b) => a - b)
}

function parsePage(raw: string | null): number {
  const n = parseInt(raw ?? '', 10)
  if (!Number.isFinite(n) || n < 1) return 1
  return n
}

export function parseListingStateFromSearch(search: string): {
  filters: FilterState
  page: number
} {
  const q = search.startsWith('?') ? search.slice(1) : search
  const sp = new URLSearchParams(q)
  const getStr = (key: string) => sp.get(key)?.trim() ?? ''

  return {
    filters: {
      ...emptyFilters,
      propertyKind: parsePropertyKind(sp.get('propertyType')),
      serviceKind: parseServiceKind(sp.get('serviceType')),
      locationIds: parseLocationIds(sp.get('locationIds')),
      minRooms: getStr('minRooms'),
      maxRooms: getStr('maxRooms'),
      minArea: getStr('minArea'),
      maxArea: getStr('maxArea'),
      minPrice: getStr('minPrice'),
      maxPrice: getStr('maxPrice'),
      minUnitPrice: getStr('minUnitPrice'),
      maxUnitPrice: getStr('maxUnitPrice'),
    },
    page: parsePage(sp.get('page')),
  }
}
