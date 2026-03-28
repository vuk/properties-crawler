import { useState } from 'react'
import type { PropertyItem } from '../types'
import { formatArea, formatPrice, formatRooms, formatUnitPrice } from '../format'

const placeholder =
  'data:image/svg+xml,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400" viewBox="0 0 640 400"><rect fill="#e8e4df" width="640" height="400"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#9a948c" font-family="system-ui,sans-serif" font-size="18">No photo</text></svg>`,
  )

interface Props {
  property: PropertyItem
}

export function PropertyCard({ property }: Props) {
  const [imgSrc, setImgSrc] = useState(
    property.image?.trim() ? property.image : placeholder,
  )

  const locationLabel =
    property.rawLocation?.trim() ||
    (property.location ? `Lokacija #${property.location}` : 'Lokacija nepoznata')

  const description = property.description.trim()
  const showReadMore = description.length > 100

  const typeLabel =
    property.propertyType === 0 ? 'Stan' : property.propertyType === 1 ? 'Kuća' : null
  const typeBadgeClass =
    property.propertyType === 0
      ? 'card__badge card__badge--apt'
      : property.propertyType === 1
        ? 'card__badge card__badge--house'
        : ''

  return (
    <article className="card">
      <a
        className="card__media"
        href={property.propertyUrl}
        target="_blank"
        rel="noopener noreferrer"
      >
        {typeLabel ? <span className={typeBadgeClass}>{typeLabel}</span> : null}
        <img
          src={imgSrc}
          alt=""
          loading="lazy"
          onError={() => setImgSrc(placeholder)}
        />
      </a>
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
            <p className="card__excerpt">{property.description}</p>
            {showReadMore ? (
              <div className="card__desc-more-host">
                <button type="button" className="card__desc-more-btn">
                  Pročitaj više
                </button>
                <div className="card__desc-popover" role="tooltip">
                  <div className="card__desc-popover-inner">{property.description}</div>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  )
}
