import { appendListingFilters } from './listingSearchParams'
import type { FilterState, PropertiesResponse } from './types'

export function buildSearchParams(
  page: number,
  pageSize: number,
  filters: FilterState,
): URLSearchParams {
  const params = new URLSearchParams()
  params.set('page', String(page))
  params.set('pageSize', String(pageSize))
  appendListingFilters(params, filters)
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
