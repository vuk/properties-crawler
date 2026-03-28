import type { FilterState, PropertiesResponse } from './types'

function appendIfPresent(
  params: URLSearchParams,
  key: string,
  value: string,
): void {
  const t = value.trim()
  if (t !== '') params.set(key, t)
}

export function buildSearchParams(
  page: number,
  pageSize: number,
  filters: FilterState,
): URLSearchParams {
  const params = new URLSearchParams()
  params.set('page', String(page))
  params.set('pageSize', String(pageSize))
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
  appendIfPresent(params, 'minRooms', filters.minRooms)
  appendIfPresent(params, 'maxRooms', filters.maxRooms)
  appendIfPresent(params, 'minArea', filters.minArea)
  appendIfPresent(params, 'maxArea', filters.maxArea)
  appendIfPresent(params, 'minPrice', filters.minPrice)
  appendIfPresent(params, 'maxPrice', filters.maxPrice)
  appendIfPresent(params, 'minUnitPrice', filters.minUnitPrice)
  appendIfPresent(params, 'maxUnitPrice', filters.maxUnitPrice)
  if (filters.locationIds.length > 0) {
    const sorted = [...filters.locationIds].sort((a, b) => a - b)
    params.set('locationIds', sorted.join(','))
  }
  return params
}

export async function fetchProperties(
  params: URLSearchParams,
): Promise<PropertiesResponse> {
  const res = await fetch(`/api/properties/?${params.toString()}`)
  const text = await res.text()
  let data: unknown
  try {
    data = JSON.parse(text) as unknown
  } catch {
    throw new Error('Invalid JSON from server')
  }
  if (!res.ok) {
    const msg =
      typeof data === 'object' &&
      data !== null &&
      'message' in data &&
      typeof (data as { message: unknown }).message === 'string'
        ? (data as { message: string }).message
        : `Request failed (${res.status})`
    throw new Error(msg)
  }
  return data as PropertiesResponse
}
