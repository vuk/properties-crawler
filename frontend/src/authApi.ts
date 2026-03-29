export type AuthUser = { id: string; email: string }

export type AuthSuccessBody = {
  token: string
  user: AuthUser
}

async function parseJsonResponse(res: Response): Promise<unknown> {
  const text = await res.text()
  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new Error('Invalid JSON from server')
  }
}

function messageFromBody(data: unknown, fallback: string): string {
  if (
    typeof data === 'object' &&
    data !== null &&
    'message' in data &&
    typeof (data as { message: unknown }).message === 'string'
  ) {
    return (data as { message: string }).message
  }
  return fallback
}

export async function registerRequest(
  email: string,
  password: string,
): Promise<AuthSuccessBody> {
  const res = await fetch('/api/auth/register/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const data = await parseJsonResponse(res)
  if (!res.ok) {
    throw new Error(messageFromBody(data, `Request failed (${res.status})`))
  }
  return data as AuthSuccessBody
}

export async function loginRequest(
  email: string,
  password: string,
): Promise<AuthSuccessBody> {
  const res = await fetch('/api/auth/login/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const data = await parseJsonResponse(res)
  if (!res.ok) {
    throw new Error(messageFromBody(data, `Request failed (${res.status})`))
  }
  return data as AuthSuccessBody
}

export async function fetchMe(token: string): Promise<AuthUser | null> {
  const res = await fetch('/api/auth/me/', {
    headers: { Authorization: `Bearer ${token}` },
  })
  const data = await parseJsonResponse(res)
  if (res.status === 401) {
    return null
  }
  if (!res.ok) {
    throw new Error(messageFromBody(data, `Request failed (${res.status})`))
  }
  if (
    typeof data === 'object' &&
    data !== null &&
    'user' in data &&
    typeof (data as { user: unknown }).user === 'object' &&
    (data as { user: { id?: unknown; email?: unknown } }).user !== null
  ) {
    const u = (data as { user: { id: string; email: string } }).user
    if (typeof u.id === 'string' && typeof u.email === 'string') {
      return u
    }
  }
  return null
}
