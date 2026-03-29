import { appendListingFilters, appendSortParams } from './listingSearchParams'
import type {
  FilterState,
  ListSortState,
  PropertiesResponse,
  PropertyItem,
} from './types'

export function buildSearchParams(
  page: number,
  pageSize: number,
  filters: FilterState,
  sort: ListSortState,
): URLSearchParams {
  const params = new URLSearchParams()
  params.set('page', String(page))
  params.set('pageSize', String(pageSize))
  appendListingFilters(params, filters)
  appendSortParams(params, sort)
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

export async function fetchPropertyById(id: string): Promise<PropertyItem> {
  const res = await fetch(
    `/api/properties/${encodeURIComponent(id.trim())}`,
  )
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
  if (
    typeof data !== 'object' ||
    data === null ||
    !('item' in data) ||
    typeof (data as { item: unknown }).item !== 'object' ||
    (data as { item: unknown }).item === null
  ) {
    throw new Error('Invalid response shape')
  }
  return (data as { item: PropertyItem }).item
}
