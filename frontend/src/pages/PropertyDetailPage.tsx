import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { fetchPropertyById } from '../api'
import { useAuth } from '../AuthContext'
import { useFavorites } from '../FavoritesContext'
import { formatArea, formatPrice, formatRooms, formatUnitPrice } from '../format'
import { MUNICIPALITY_OPTIONS } from '../municipalities'
import {
  propertySourceAttribution,
  propertySourceHostname,
} from '../propertyOrigin'
import type { PropertyItem } from '../types'

const placeholder =
  'data:image/svg+xml,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="600" viewBox="0 0 960 600"><rect fill="#e8e4df" width="960" height="600"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#9a948c" font-family="system-ui,sans-serif" font-size="20">Nema fotografije</text></svg>`,
  )

function locationLabel(p: PropertyItem): string {
  if (p.rawLocation?.trim()) return p.rawLocation.trim()
  if (p.location) {
    const m = MUNICIPALITY_OPTIONS.find((o) => o.id === p.location)
    if (m) return m.label
    return `Opština #${p.location}`
  }
  return 'Lokacija nepoznata'
}

export function PropertyDetailPage() {
  const { propertyId } = useParams<{ propertyId: string }>()
  const { user } = useAuth()
  const { isFavorite, isBusy, toggleFavorite } = useFavorites()

  const [property, setProperty] = useState<PropertyItem | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [imgSrc, setImgSrc] = useState(placeholder)

  const load = useCallback(async () => {
    if (!propertyId?.trim()) {
      setProperty(null)
      setError('Nedostaje ID oglasa')
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const item = await fetchPropertyById(propertyId)
      setProperty(item)
      setImgSrc(item.image?.trim() ? item.image : placeholder)
    } catch (e) {
      setProperty(null)
      setError(e instanceof Error ? e.message : 'Greška pri učitavanju')
    } finally {
      setLoading(false)
    }
  }, [propertyId])

  useEffect(() => {
    void load()
  }, [load])

  const attribution = useMemo(
    () => (property ? propertySourceAttribution(property.propertyUrl) : ''),
    [property],
  )
  const sourceHost = useMemo(
    () => (property ? propertySourceHostname(property.propertyUrl) : null),
    [property],
  )

  if (loading) {
    return (
      <div className="shell detail-shell">
        <main className="main">
          <div className="state state--loading">
            <div className="spinner" aria-hidden />
            <p>Učitavanje oglasa…</p>
          </div>
        </main>
      </div>
    )
  }

  if (error || !property) {
    return (
      <div className="shell detail-shell">
        <main className="main">
          <nav className="detail-breadcrumb" aria-label="Navigacija">
            <Link to="/">← Nazad na listu</Link>
          </nav>
          <div className="banner banner--error" role="alert">
            {error ?? 'Oglas nije pronađen.'}
          </div>
        </main>
      </div>
    )
  }

  const typeLabel =
    property.propertyType === 0
      ? 'Stan'
      : property.propertyType === 1
        ? 'Kuća'
        : 'Nekretnina'

  const serviceLabel =
    property.serviceType === 0
      ? 'Prodaja'
      : property.serviceType === 1
        ? 'Izdavanje'
        : property.serviceType === 2
          ? 'Razmena'
          : null

  const description = String(property.description ?? '')
    .replace(/\u00a0/g, ' ')
    .trim()

  const fav = user
    ? {
        isFavorite: isFavorite(property.id),
        busy: isBusy(property.id),
        onToggle: () => void toggleFavorite(property.id),
      }
    : null

  return (
    <div className="shell detail-shell">
      <main className="main detail-main">
        <nav className="detail-breadcrumb" aria-label="Navigacija">
          <Link to="/">← Nazad na listu</Link>
        </nav>

        <article className="detail-layout">
          <div className="detail-hero">
            <div className="detail-media">
              {fav ? (
                <button
                  type="button"
                  className={
                    fav.isFavorite
                      ? 'detail-favorite detail-favorite--on'
                      : 'detail-favorite'
                  }
                  disabled={fav.busy}
                  aria-pressed={fav.isFavorite}
                  aria-label={
                    fav.isFavorite ? 'Ukloni iz sačuvanih' : 'Sačuvaj oglas'
                  }
                  title={
                    fav.isFavorite ? 'Ukloni iz sačuvanih' : 'Sačuvaj oglas'
                  }
                  onClick={fav.onToggle}
                >
                  <span aria-hidden>{fav.isFavorite ? '♥' : '♡'}</span>
                </button>
              ) : null}
              <img
                src={imgSrc}
                alt=""
                onError={() => setImgSrc(placeholder)}
              />
            </div>

            <aside className="detail-source" aria-labelledby="detail-source-heading">
              <h2 id="detail-source-heading" className="detail-source__title">
                Izvorni sajt
              </h2>
              <p className="detail-source__text">
                Ovaj prikaz je agregat podataka sa javnog oglasa. Kompletan
                oglas i kontakt informacije nalaze se isključivo na izvornom
                portalu.
              </p>
              <p className="detail-source__portal">
                <span className="detail-source__label">Portal</span>
                <span className="detail-source__value">{attribution}</span>
              </p>
              {sourceHost ? (
                <p className="detail-source__host">
                  <span className="detail-source__label">Domen</span>
                  <code className="detail-source__code">{sourceHost}</code>
                </p>
              ) : null}
              <a
                className="detail-source__cta btn btn--primary"
                href={property.propertyUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Otvori originalni oglas u novom tabu
              </a>
            </aside>
          </div>

          <div className="detail-content">
            <header className="detail-header">
              <div className="detail-badges">
                <span className="detail-badge detail-badge--type">{typeLabel}</span>
                {serviceLabel ? (
                  <span className="detail-badge detail-badge--service">
                    {serviceLabel}
                  </span>
                ) : null}
              </div>

              <h1 className="detail-title">
                <a
                  href={property.propertyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="detail-title-link"
                >
                  {property.title || 'Bez naslova'}
                  <span className="detail-title-external" aria-hidden>
                    ↗
                  </span>
                </a>
              </h1>
              <p className="detail-title-hint">
                Naslov vodi na originalni oglas ({sourceHost ?? 'izvorni sajt'})
                u novom tabu.
              </p>

              <div className="detail-price-block">
                <span className="detail-price">{formatPrice(property.price)} €</span>
                {property.oldPrice != null &&
                property.oldPrice > property.price ? (
                  <span className="detail-old-price">
                    {formatPrice(property.oldPrice)} €
                  </span>
                ) : null}
              </div>
            </header>

            <dl className="detail-specs">
              <div className="detail-spec">
                <dt>Sobe</dt>
                <dd>{formatRooms(property.rooms)}</dd>
              </div>
              <div className="detail-spec">
                <dt>Površina</dt>
                <dd>{formatArea(property.area)}</dd>
              </div>
              <div className="detail-spec">
                <dt>Cena po m²</dt>
                <dd>{formatUnitPrice(property.unitPrice)}</dd>
              </div>
              <div className="detail-spec">
                <dt>Sprat / spratnost</dt>
                <dd>
                  {property.floor} / {property.floors}
                </dd>
              </div>
              <div className="detail-spec detail-spec--wide">
                <dt>Lokacija</dt>
                <dd>{locationLabel(property)}</dd>
              </div>
              {property.lastCrawled ? (
                <div className="detail-spec detail-spec--wide">
                  <dt>Poslednje ažuriranje</dt>
                  <dd>
                    {new Date(property.lastCrawled).toLocaleString('sr-RS', {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                  </dd>
                </div>
              ) : null}
            </dl>

            {description ? (
              <section className="detail-description" aria-labelledby="desc-heading">
                <h2 id="desc-heading" className="detail-section-title">
                  Opis
                </h2>
                <p className="detail-description-body">{description}</p>
              </section>
            ) : null}
          </div>
        </article>
      </main>
    </div>
  )
}
