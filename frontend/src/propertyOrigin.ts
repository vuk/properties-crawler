/** First DNS label of the host, title-cased (fallback when no known portal map). */
function hostnameBrandLabel(host: string): string {
  const segment = (host.split('.')[0] || host).trim()
  if (!segment) return host
  return segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase()
}

/** Public hostname for attribution (no leading `www.`). */
export function propertySourceHostname(propertyUrl: string): string | null {
  const t = propertyUrl?.trim()
  if (!t) return null
  try {
    return new URL(t).hostname.replace(/^www\./i, '').toLowerCase()
  } catch {
    return null
  }
}

/**
 * One line for UI: known portal name + hostname, or hostname only.
 */
export function propertySourceAttribution(propertyUrl: string): string {
  const host = propertySourceHostname(propertyUrl)
  if (!host) return 'Nepoznat izvor oglasa'
  const short = propertyOriginLabel(propertyUrl)
  if (short === 'KP') return `Kupujemprodajem · ${host}`
  if (short) return `${short} · ${host}`
  return host
}

/**
 * Short label for listing portal, derived from stored listing URL (no DB column).
 * Unknown hosts use the first domain label (e.g. `estitor.com` → Estitor).
 */
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
  if (host.includes('realitica')) return 'Realitica'
  if (host.includes('estitor')) return 'Estitor'
  if (host.includes('indomio')) return 'Indomio'
  if (host.endsWith('oglasi.rs')) return 'Oglasi'
  return hostnameBrandLabel(host)
}
