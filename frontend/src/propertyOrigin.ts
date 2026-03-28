/** Short label for listing portal, derived from stored listing URL (no DB column). */
export function propertyOriginLabel(propertyUrl: string): string | null {
  const t = propertyUrl?.trim()
  if (!t) return null
  let host: string
  try {
    host = new URL(t).hostname.replace(/^www\./i, '').toLowerCase()
  } catch {
    return null
  }
  if (host.includes('kupujemprodajem')) return 'KP'
  if (host.includes('halooglasi')) return 'Halooglasi'
  // Before generic `nekretnine` — kvadratnekretnine.com hostname contains "nekretnine".
  if (host.includes('kvadratnekretnine')) return 'Kvadrat'
  if (host.includes('nekretnine')) return 'Nekretnine'
  if (host.includes('4zida')) return '4zida'
  if (host.includes('novosti')) return 'Novosti'
  return null
}
