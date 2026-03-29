import type { ListSortState, SortByField, SortDirection } from '../types'

interface Props {
  sort: ListSortState
  onChange: (next: ListSortState) => void
}

type SortOptionValue = `${SortByField}:${SortDirection}`

const OPTIONS: { value: SortOptionValue; label: string }[] = [
  { value: 'lastCrawled:desc', label: 'Datum — najnovije prvo' },
  { value: 'lastCrawled:asc', label: 'Datum — najstarije prvo' },
  { value: 'price:asc', label: 'Cena — od najniže' },
  { value: 'price:desc', label: 'Cena — od najviše' },
  { value: 'unitPrice:asc', label: 'Cena po m² — od najniže' },
  { value: 'unitPrice:desc', label: 'Cena po m² — od najviše' },
]

function toValue(s: ListSortState): SortOptionValue {
  return `${s.sortBy}:${s.sortDir}` as SortOptionValue
}

function parseValue(v: string): ListSortState | null {
  const parts = v.split(':')
  if (parts.length !== 2) return null
  const [by, dir] = parts
  if (by !== 'lastCrawled' && by !== 'price' && by !== 'unitPrice') return null
  if (dir !== 'asc' && dir !== 'desc') return null
  return { sortBy: by, sortDir: dir }
}

export function SortBar({ sort, onChange }: Props) {
  const current = toValue(sort)
  const valid = OPTIONS.some((o) => o.value === current)
    ? current
    : OPTIONS[0].value

  return (
    <div className="sort-bar">
      <label className="sort-bar__label" htmlFor="listing-sort">
        Sortiranje
      </label>
      <select
        id="listing-sort"
        className="sort-bar__select"
        value={valid}
        onChange={(e) => {
          const next = parseValue(e.target.value)
          if (next) onChange(next)
        }}
      >
        {OPTIONS.map(({ value, label }) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
    </div>
  )
}
