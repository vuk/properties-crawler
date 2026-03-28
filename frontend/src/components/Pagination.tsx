interface Props {
  page: number
  totalPages: number
  total: number
  pageSize: number
  onPageChange: (page: number) => void
}

function windowPages(current: number, total: number, width: number): number[] {
  if (total <= 0) return []
  const half = Math.floor(width / 2)
  let start = current - half
  let end = current + half - (width % 2 === 0 ? 1 : 0)
  if (start < 1) {
    end += 1 - start
    start = 1
  }
  if (end > total) {
    start -= end - total
    end = total
  }
  start = Math.max(1, start)
  end = Math.min(total, end)
  const out: number[] = []
  for (let p = start; p <= end; p++) out.push(p)
  return out
}

export function Pagination({
  page,
  totalPages,
  total,
  pageSize,
  onPageChange,
}: Props) {
  if (totalPages <= 0) {
    return (
      <div className="pagination pagination--empty">
        <span className="pagination__summary">Nema rezultata</span>
      </div>
    )
  }

  const pages = windowPages(page, totalPages, 7)
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)

  return (
    <div className="pagination">
      <p className="pagination__summary">
        Prikazano <strong>{from}</strong>–<strong>{to}</strong> od{' '}
        <strong>{total}</strong>
      </p>
      <nav className="pagination__nav" aria-label="Stranice">
        <button
          type="button"
          className="btn btn--ghost pagination__btn"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          ← Prethodna
        </button>
        <div className="pagination__pages">
          {pages.map((p) => (
            <button
              key={p}
              type="button"
              className={
                p === page ? 'pagination__page pagination__page--active' : 'pagination__page'
              }
              onClick={() => onPageChange(p)}
            >
              {p}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="btn btn--ghost pagination__btn"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          Sledeća →
        </button>
      </nav>
    </div>
  )
}
