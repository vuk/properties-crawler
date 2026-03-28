import { useId, useState } from 'react'
import type { FilterState, PropertyKind, ServiceKind } from '../types'

interface Props {
  filters: FilterState
  onChange: (next: FilterState) => void
  onApply: () => void
  onReset: () => void
}

type RangeKey =
  | 'minRooms'
  | 'maxRooms'
  | 'minArea'
  | 'maxArea'
  | 'minPrice'
  | 'maxPrice'
  | 'minUnitPrice'
  | 'maxUnitPrice'

function rangeField(
  key: RangeKey,
  label: string,
  filters: FilterState,
  onChange: (next: FilterState) => void,
) {
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      <input
        type="text"
        inputMode="decimal"
        className="field__input"
        value={filters[key]}
        onChange={(e) => onChange({ ...filters, [key]: e.target.value })}
        placeholder="—"
      />
    </label>
  )
}

const KIND_OPTIONS: { value: PropertyKind; label: string }[] = [
  { value: 'all', label: 'Sve' },
  { value: 'apartment', label: 'Stanovi' },
  { value: 'house', label: 'Kuće' },
]

const SERVICE_OPTIONS: { value: ServiceKind; label: string }[] = [
  { value: 'all', label: 'Sve' },
  { value: 'sale', label: 'Prodaja' },
  { value: 'rent', label: 'Izdavanje' },
]

export function FilterPanel({ filters, onChange, onApply, onReset }: Props) {
  const [filtersOpen, setFiltersOpen] = useState(true)
  const collapsibleId = useId()

  return (
    <section className="filters" aria-labelledby="filters-heading">
      <div className="filters__top">
        <div className="filters__intro">
          <div className="filters__title-row">
            <h2 id="filters-heading" className="filters__title">
              Pretraga
            </h2>
            <button
              type="button"
              className="filters__collapse-toggle"
              aria-expanded={filtersOpen}
              aria-controls={collapsibleId}
              onClick={() => setFiltersOpen((o) => !o)}
            >
              <span className="filters__collapse-icon" aria-hidden>
                {filtersOpen ? '▾' : '▸'}
              </span>
              {filtersOpen ? 'Sakrij filtere' : 'Prikaži filtere'}
            </button>
          </div>
          <p className="filters__hint">Izaberite tip i opsege, zatim primenite.</p>
        </div>
        <div className="filters__actions-top">
          <button type="button" className="btn btn--ghost" onClick={onReset}>
            Resetuj
          </button>
          <button type="button" className="btn btn--primary" onClick={onApply}>
            Prikaži rezultate
          </button>
        </div>
      </div>

      <div id={collapsibleId} className="filters__collapsible" hidden={!filtersOpen}>
        <div className="filters__kinds">
          <div
            className="filters__kind filters__kind--property"
            role="group"
            aria-label="Tip nekretnine"
          >
            {KIND_OPTIONS.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                className={
                  filters.propertyKind === value
                    ? 'filters__kind-btn filters__kind-btn--property filters__kind-btn--active'
                    : 'filters__kind-btn filters__kind-btn--property'
                }
                onClick={() => onChange({ ...filters, propertyKind: value })}
              >
                {label}
              </button>
            ))}
          </div>
          <div
            className="filters__kind filters__kind--service"
            role="group"
            aria-label="Vrsta ponude"
          >
            {SERVICE_OPTIONS.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                className={
                  filters.serviceKind === value
                    ? 'filters__kind-btn filters__kind-btn--service filters__kind-btn--active'
                    : 'filters__kind-btn filters__kind-btn--service'
                }
                onClick={() => onChange({ ...filters, serviceKind: value })}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="filters__ranges">
          <fieldset className="filters__fieldset">
            <legend>Sobe</legend>
            <div className="filters__pair">
              {rangeField('minRooms', 'Min', filters, onChange)}
              {rangeField('maxRooms', 'Max', filters, onChange)}
            </div>
          </fieldset>

          <fieldset className="filters__fieldset">
            <legend>Površina (m²)</legend>
            <div className="filters__pair">
              {rangeField('minArea', 'Min', filters, onChange)}
              {rangeField('maxArea', 'Max', filters, onChange)}
            </div>
          </fieldset>

          <fieldset className="filters__fieldset">
            <legend>Cena (€)</legend>
            <div className="filters__pair">
              {rangeField('minPrice', 'Min', filters, onChange)}
              {rangeField('maxPrice', 'Max', filters, onChange)}
            </div>
          </fieldset>

          <fieldset className="filters__fieldset filters__fieldset--unit-price">
            <legend>Cena po m² (€)</legend>
            <div className="filters__pair">
              {rangeField('minUnitPrice', 'Min', filters, onChange)}
              {rangeField('maxUnitPrice', 'Max', filters, onChange)}
            </div>
          </fieldset>
        </div>
      </div>
    </section>
  )
}
