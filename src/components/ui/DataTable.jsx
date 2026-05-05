import { useMemo, useState } from 'react'
import EmptyState from './EmptyState'

/**
 * DataTable primitive — editorial styling per docs/DESIGN.md:
 *   - no zebra, tight rows, no per-row borders except bottom separator
 *   - tabular-nums on numeric cells (via align: 'right' by default)
 *   - subtle surface-3 hover
 *   - sticky header with label-xs in text-tertiary
 *   - no drop shadows, no rounded rows
 *
 * Columns:
 *   { key, header, align?, width?, className?, render?(row), sortable?, accessor?(row) }
 *
 * Sort: client-side if `sortable` is set on at least one column.
 * Empty: renders a full-width <EmptyState> when rows is empty.
 */
export default function DataTable({
  columns,
  rows,
  rowKey = 'id',
  onRowClick,
  stickyHeader = false,
  dense = true,
  emptyTitle = 'No data',
  emptyMessage,
  className = '',
  ...rest
}) {
  const [sort, setSort] = useState(null) // { key, direction: 'asc'|'desc' }

  const sorted = useMemo(() => {
    if (!sort) return rows
    const col = columns.find((c) => c.key === sort.key)
    if (!col) return rows
    const accessor = col.accessor || ((r) => r[sort.key])
    const dir = sort.direction === 'asc' ? 1 : -1
    return [...rows].sort((a, b) => {
      const av = accessor(a)
      const bv = accessor(b)
      if (av == null && bv == null) return 0
      if (av == null) return 1
      if (bv == null) return -1
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir
      return String(av).localeCompare(String(bv)) * dir
    })
  }, [rows, sort, columns])

  const rowHeight = dense ? 'py-2' : 'py-3'

  const handleSort = (key) => {
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, direction: 'asc' }
      if (prev.direction === 'asc') return { key, direction: 'desc' }
      return null
    })
  }

  if (!rows || rows.length === 0) {
    return <EmptyState title={emptyTitle} message={emptyMessage} />
  }

  return (
    <div className={`overflow-x-auto ${className}`.trim()} {...rest}>
      <table className="w-full">
        <thead className={stickyHeader ? 'sticky top-0 bg-surface-2 z-10' : ''}>
          <tr style={{ borderBottom: '1px solid var(--surface-5)' }}>
            {columns.map((col) => {
              const isActive = sort?.key === col.key
              const alignClass =
                col.align === 'right' ? 'text-right' :
                col.align === 'center' ? 'text-center' :
                'text-left'
              return (
                <th
                  key={col.key}
                  className={`py-2 px-3 label-xs text-txt-tertiary font-semibold ${alignClass} ${col.sortable ? 'cursor-pointer select-none hover:text-txt-secondary' : ''}`}
                  style={col.width ? { width: col.width } : undefined}
                  onClick={col.sortable ? () => handleSort(col.key) : undefined}
                >
                  <span className="inline-flex items-center gap-1">
                    {col.header}
                    {col.sortable && (
                      <span
                        aria-hidden="true"
                        className="text-[0.625rem] leading-none"
                        style={{
                          color: isActive ? 'var(--text-primary)' : 'var(--text-muted)',
                        }}
                      >
                        {isActive ? (sort.direction === 'asc' ? '▲' : '▼') : '↕'}
                      </span>
                    )}
                  </span>
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr
              key={row[rowKey]}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={`hover:bg-surface-3 transition-colors ${onRowClick ? 'cursor-pointer' : ''}`}
              style={{ borderBottom: '1px solid var(--surface-4)' }}
            >
              {columns.map((col) => {
                const alignClass =
                  col.align === 'right' ? 'text-right tabular' :
                  col.align === 'center' ? 'text-center' :
                  'text-left'
                const content = col.render ? col.render(row) : row[col.key]
                return (
                  <td
                    key={col.key}
                    className={`${rowHeight} px-3 text-sm text-txt-primary ${alignClass} ${col.className || ''}`.trim()}
                  >
                    {content}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
