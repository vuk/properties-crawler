import { useEffect, useRef, useState } from 'react'
import type { PropertyItem } from '../types'

export type PropertyCardFavorite =
  | {
      mode: 'toggle'
      isFavorite: boolean
      busy?: boolean
      onToggle: () => void
    }
  | {
      mode: 'remove'
      busy?: boolean
      onRemove: () => void
    }
import { formatArea, formatPrice, formatRooms, formatUnitPrice } from '../format'
import { propertyOriginLabel } from '../propertyOrigin'

const placeholder =
  'data:image/svg+xml,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400" viewBox="0 0 640 400"><rect fill="#e8e4df" width="640" height="400"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#9a948c" font-family="system-ui,sans-serif" font-size="18">No photo</text></svg>`,
  )

/** Max characters shown before "read more" (including the trailing ellipsis when truncated). */
const DESCRIPTION_PREVIEW_MAX_VISIBLE = 200

function previewDescription(text: string, maxVisible: number): string {
  if (text.length <= maxVisible) return text
  return `${text.slice(0, maxVisible - 1)}…`
}

interface Props {
  property: PropertyItem
  favorite?: PropertyCardFavorite
}

export function PropertyCard({ property, favorite }: Props) {
  const [imgSrc, setImgSrc] = useState(
    property.image?.trim() ? property.image : placeholder,
  )
  const [descriptionExpanded, setDescriptionExpanded] = useState(false)
  const descOverlayRef = useRef<HTMLDivElement>(null)

  const locationLabel =
    property.rawLocation?.trim() ||
    (property.location ? `Lokacija #${property.location}` : 'Lokacija nepoznata')

  const description = String(property.description ?? '')
    .replace(/\u00a0/g, ' ')
    .trim()
  const needsReadMore = description.length > DESCRIPTION_PREVIEW_MAX_VISIBLE
  const descriptionCollapsedPreview = previewDescription(
    description,
    DESCRIPTION_PREVIEW_MAX_VISIBLE,
  )

  useEffect(() => {
    if (!needsReadMore || !descriptionExpanded) return

    function handlePointerDown(event: PointerEvent) {
      const root = descOverlayRef.current
      if (!root?.contains(event.target as Node)) {
        setDescriptionExpanded(false)
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [needsReadMore, descriptionExpanded])

  const typeLabel =
    property.propertyType === 0 ? 'Stan' : property.propertyType === 1 ? 'Kuća' : null
  const typeBadgeClass =
    property.propertyType === 0
      ? 'card__badge card__badge--apt'
      : property.propertyType === 1
        ? 'card__badge card__badge--house'
        : ''

  const serviceLabel =
    property.serviceType === 0
      ? 'Prodaja'
      : property.serviceType === 1
        ? 'Izdavanje'
        : property.serviceType === 2
          ? 'Razmena'
          : null
  const serviceBadgeClass =
    property.serviceType === 0
      ? 'card__badge card__badge--service-sale'
      : property.serviceType === 1
        ? 'card__badge card__badge--service-rent'
        : property.serviceType === 2
          ? 'card__badge card__badge--service-exchange'
          : ''

  const originLabel = propertyOriginLabel(property.propertyUrl)

  function renderFavoriteControl() {
    if (!favorite) return null
    if (favorite.mode === 'toggle') {
      const label = favorite.isFavorite ? 'Ukloni iz sačuvanih' : 'Sačuvaj oglas'
      return (
        <button
          type="button"
          className={
            favorite.isFavorite ? 'card__favorite card__favorite--on' : 'card__favorite'
          }
          disabled={favorite.busy}
          aria-pressed={favorite.isFavorite}
          aria-label={label}
          title={label}
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            favorite.onToggle()
          }}
        >
          <span aria-hidden>{favorite.isFavorite ? '♥' : '♡'}</span>
        </button>
      )
    }
    return (
      <button
        type="button"
        className="card__favorite card__favorite--remove"
        disabled={favorite.busy}
        aria-label="Ukloni iz sačuvanih"
        title="Ukloni iz sačuvanih"
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          favorite.onRemove()
        }}
      >
        <span aria-hidden>×</span>
      </button>
    )
  }

  return (
    <article
      className={
        descriptionExpanded && needsReadMore ? 'card card--desc-expanded' : 'card'
      }
    >
      <div className="card__media">
        {renderFavoriteControl()}
        <a
          className="card__media-link"
          href={property.propertyUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          {typeLabel || serviceLabel || originLabel ? (
            <span className="card__badges">
              {typeLabel ? <span className={typeBadgeClass}>{typeLabel}</span> : null}
              {serviceLabel ? <span className={serviceBadgeClass}>{serviceLabel}</span> : null}
              {originLabel ? (
                <span className="card__badge card__badge--source">{originLabel}</span>
              ) : null}
            </span>
          ) : null}
          <img
            src={imgSrc}
            alt=""
            loading="lazy"
            onError={() => setImgSrc(placeholder)}
          />
        </a>
      </div>
      <div className="card__body">
        <div className="card__price-row">
          <span className="card__price">{formatPrice(property.price)} €</span>
          {property.oldPrice != null && property.oldPrice > property.price && (
            <span className="card__old-price">{formatPrice(property.oldPrice)} €</span>
          )}
        </div>
        <h2 className="card__title">
          <a href={property.propertyUrl} target="_blank" rel="noopener noreferrer">
            {property.title || 'Bez naslova'}
          </a>
        </h2>
        <p className="card__meta">
          <span>{formatRooms(property.rooms)} soba</span>
          <span className="card__dot">·</span>
          <span>{formatArea(property.area)}</span>
          <span className="card__dot">·</span>
          <span>{formatUnitPrice(property.unitPrice)}</span>
        </p>
        <p className="card__location">{locationLabel}</p>
        {description ? (
          <div className="card__desc">
            {needsReadMore && descriptionExpanded ? (
              <>
                <div className="card__desc-measure" aria-hidden>
                  <p className="card__excerpt">{descriptionCollapsedPreview}</p>
                  <button type="button" className="card__desc-toggle" tabIndex={-1}>
                    Pročitaj više
                  </button>
                </div>
                <div className="card__desc-overlay" ref={descOverlayRef}>
                  <p className="card__excerpt">{description}</p>
                  <button
                    type="button"
                    className="card__desc-toggle"
                    onClick={() => setDescriptionExpanded(false)}
                    aria-expanded
                  >
                    Pročitaj manje
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="card__excerpt">
                  {needsReadMore ? descriptionCollapsedPreview : description}
                </p>
                {needsReadMore ? (
                  <button
                    type="button"
                    className="card__desc-toggle"
                    onClick={() => setDescriptionExpanded(true)}
                    aria-expanded={false}
                  >
                    Pročitaj više
                  </button>
                ) : null}
              </>
            )}
          </div>
        ) : null}
      </div>
    </article>
  )
}
