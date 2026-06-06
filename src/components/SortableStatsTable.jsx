import { useMemo, useState } from 'react'
import { proxyImageUrl } from '../utils/imageProxy'
import { Link } from 'react-router-dom'

/**
 * SortableStatsTable — table used by the team-year Stats tab to render
 * each stat category (Passing / Rushing / Receiving / Defense /
 * Kicking / Punting / Kick Return / Punt Return). Pass a `columns`
 * array describing each stat column. Columns with a `sortValue`
 * function become clickable headers that toggle between ascending and
 * descending; clicking a different column sorts by it (using the
 * column's `defaultDir` if provided, otherwise descending).
 *
 * column shape:
 *   {
 *     key:        unique id,
 *     label:      header text,
 *     align?:     'left' | 'center' (default: 'center'),
 *     bold?:      boolean — render the cell value in the accent color,
 *     tabular?:   boolean — apply tabular-nums to align digits,
 *     defaultDir? 'asc' | 'desc' (default: 'desc'),
 *     sortValue?: (row) => number|string — omit for non-sortable
 *                  columns (e.g. the Player name column),
 *     render:     (row) => ReactNode,
 *   }
 *
 * Props:
 *   title           — section header above the table
 *   rows            — array of player stat rows
 *   columns         — column descriptors (above)
 *   defaultSortKey  — initial sort column key
 *   defaultSortDir  — initial sort direction ('desc' default)
 *   accentColor     — primary accent color (for sortable headers + bold cells)
 *   accentColorMuted — muted text color for non-bold cells
 *   teamBgColor     — team background color (left rail + header tint)
 *   teamBgText      — text color contrasting with teamBgColor
 */
export default function SortableStatsTable({
  title,
  rows,
  columns,
  defaultSortKey,
  defaultSortDir = 'desc',
  accentColor,
  accentColorMuted,
  teamBgColor,
  teamBgText,
}) {
  const [sortKey, setSortKey] = useState(defaultSortKey || null)
  const [sortDir, setSortDir] = useState(defaultSortDir)

  const sorted = useMemo(() => {
    if (!sortKey || !rows?.length) return rows || []
    const col = columns.find(c => c.key === sortKey)
    if (!col || !col.sortValue) return rows
    const dir = sortDir === 'asc' ? 1 : -1
    return [...rows].sort((a, b) => {
      const av = col.sortValue(a)
      const bv = col.sortValue(b)
      if (typeof av === 'string' && typeof bv === 'string') {
        return av.localeCompare(bv) * dir
      }
      const an = Number.isFinite(Number(av)) ? Number(av) : 0
      const bn = Number.isFinite(Number(bv)) ? Number(bv) : 0
      return (an - bn) * dir
    })
  }, [rows, sortKey, sortDir, columns])

  const onHeaderClick = (col) => {
    if (!col.sortValue) return
    if (sortKey === col.key) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(col.key)
      setSortDir(col.defaultDir || 'desc')
    }
  }

  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-2.5 bg-surface-2 border-b border-surface-4">
        <h4 className="font-display font-bold text-txt-primary" style={{ fontSize: '1.05rem', letterSpacing: '0.03em', textTransform: 'uppercase' }}>{title}</h4>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ backgroundColor: `${teamBgColor}15` }}>
              {columns.map(col => {
                const sortable = !!col.sortValue
                const isActive = sortable && sortKey === col.key
                const align = col.align === 'left' ? 'text-left' : 'text-center'
                const padX = col.align === 'left' ? 'px-3' : 'px-2'
                return (
                  <th
                    key={col.key}
                    onClick={() => onHeaderClick(col)}
                    className={`${align} ${padX} py-2 font-bold uppercase tracking-wider text-xs whitespace-nowrap ${sortable ? 'cursor-pointer select-none' : ''}`}
                    style={{
                      color: accentColor,
                      // Subtle hover affordance for sortable cols only.
                      transition: 'background-color 120ms ease',
                    }}
                    onMouseEnter={(e) => {
                      if (sortable) e.currentTarget.style.backgroundColor = `${accentColor}22`
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent'
                    }}
                  >
                    <span className="inline-flex items-center gap-1.5">
                      {col.label}
                      {sortable && (
                        <span
                          aria-hidden="true"
                          className="text-[9px] leading-none"
                          style={{
                            opacity: isActive ? 1 : 0.32,
                            transform: 'translateY(-1px)',
                          }}
                        >
                          {isActive ? (sortDir === 'asc' ? '▲' : '▼') : '▾'}
                        </span>
                      )}
                    </span>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, i) => (
              <tr
                key={row.pid || i}
                className="border-t transition-colors hover:bg-white/[0.03]"
                style={{ borderColor: `${accentColor}20` }}
              >
                {columns.map(col => {
                  const align = col.align === 'left' ? '' : 'text-center'
                  const padX = col.align === 'left' ? 'px-3' : 'px-2'
                  const tabular = col.tabular ? 'tabular-nums' : ''
                  const bold = col.bold ? 'font-semibold' : ''
                  return (
                    <td
                      key={col.key}
                      className={`${align} ${padX} py-2 ${tabular} ${bold}`}
                      style={{ color: col.bold ? accentColor : accentColorMuted }}
                    >
                      {col.render(row)}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/**
 * Helper for the (always non-sortable) leftmost Player column —
 * matches the avatar + name link the inline tables rendered before
 * we extracted this component.
 */
export function PlayerCell({ player, accentColor, pathPrefix }) {
  if (!player) return null
  return (
    <Link
      to={`${pathPrefix}/player/${player.pid}`}
      className="flex items-center gap-2 font-medium hover:underline"
      style={{ color: accentColor }}
    >
      {player.pictureUrl ? (
        <img
          src={proxyImageUrl(player.pictureUrl, 300)}
          alt=""
          className="w-6 h-6 rounded-full object-cover flex-shrink-0"
        />
      ) : (
        <div
          className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: `${accentColor}15` }}
        >
          <span className="text-[10px] font-bold" style={{ color: accentColor }}>
            {player.name?.charAt(0)}
          </span>
        </div>
      )}
      {player.name}
    </Link>
  )
}
