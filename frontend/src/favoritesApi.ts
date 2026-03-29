import { getStoredToken } from './authStorage'
import type { PropertyItem } from './types'

function authHeaders(): HeadersInit {
  const t = getStoredToken()
  return t ? { Authorization: `Bearer ${t}` } : {}
}

async function readErrorMessage(res: Response, fallback: string): Promise<string> {
  const text = await res.text()
  if (!text) return fallback
  try {
    const data = JSON.parse(text) as unknown
    if (
      typeof data === 'object' &&
      data !== null &&
      'message' in data &&
      typeof (data as { message: unknown }).message === 'string'
    ) {
      return (data as { message: string }).message
    }
  } catch {
    /* ignore */
  }
  return fallback
}

export async function fetchFavoriteIds(): Promise<string[]> {
  const res = await fetch('/api/favorites/ids/', { headers: authHeaders() })
  if (res.status === 401) {
    return []
  }
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, `Request failed (${res.status})`))
  }
  const data = (await res.json()) as unknown
  if (
    typeof data === 'object' &&
    data !== null &&
    'ids' in data &&
    Array.isArray((data as { ids: unknown }).ids)
  ) {
    return (data as { ids: string[] }).ids.filter((x) => typeof x === 'string')
  }
  return []
}

export async function fetchFavoritesList(): Promise<PropertyItem[]> {
  const res = await fetch('/api/favorites/', { headers: authHeaders() })
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, `Request failed (${res.status})`))
  }
  const data = (await res.json()) as unknown
  if (
    typeof data === 'object' &&
    data !== null &&
    'items' in data &&
    Array.isArray((data as { items: unknown }).items)
  ) {
    return (data as { items: PropertyItem[] }).items
  }
  return []
}

export async function addFavoriteProperty(propertyId: string): Promise<void> {
  const res = await fetch(`/api/favorites/${encodeURIComponent(propertyId)}/`, {
    method: 'POST',
    headers: authHeaders(),
  })
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, `Request failed (${res.status})`))
  }
}

export async function removeFavoriteProperty(propertyId: string): Promise<void> {
  const res = await fetch(`/api/favorites/${encodeURIComponent(propertyId)}/`, {
    method: 'DELETE',
    headers: authHeaders(),
  })
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, `Request failed (${res.status})`))
  }
}
