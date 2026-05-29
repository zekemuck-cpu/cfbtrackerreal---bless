/**
 * CardStylePicker — searchable, brand-organized picker for the card
 * catalog (200+ styles).
 *
 * UX:
 *   • Brand-first. A row of manufacturer chips (Panini, Topps, Bowman…)
 *     filters the list to one brand so you're not scrolling the whole
 *     catalog. Defaults to the largest brand.
 *   • Search is global — when you type, the brand filter is ignored and
 *     results from every brand match by label / brand / year.
 *   • Neutral, uniform cells (no decorative per-era color rails); the
 *     only chromatic state is the selected ring.
 *
 * Props:
 *   value     — selected style id
 *   onChange  — fn(styleId)
 *   styles    — registry array (defaults to CARD_STYLES)
 */

import { useMemo, useState } from 'react'
import { CARD_STYLES } from '../data/cardStyles'

const FICTIONAL = 'Fictional'

// Collapse the catalog's ~70 set-names ("Panini Prizm", "Topps Chrome")
// into the parent manufacturer the user actually thinks in.
function manufacturer(style) {
  if (style?.id && String(style.id).startsWith('fictional_')) return FICTIONAL
  const b = (style?.brand || '').trim()
  if (/^Panini/i.test(b)) return 'Panini'
  if (/^Topps/i.test(b)) return 'Topps'
  if (/^Bowman/i.test(b)) return 'Bowman'
  if (/^Donruss/i.test(b)) return 'Donruss'
  if (/^Upper Deck/i.test(b)) return 'Upper Deck'
  if (/^Pinnacle/i.test(b)) return 'Pinnacle'
  if (/^Pro Set/i.test(b)) return 'Pro Set'
  if (/^Pro Line/i.test(b)) return 'Pro Line'
  if (/^Press Pass/i.test(b)) return 'Press Pass'
  if (/^Wild Card/i.test(b)) return 'Wild Card'
  if (/Fleer|SkyBox/i.test(b)) return 'Fleer'
  if (/^SAGE/i.test(b)) return 'SAGE'
  if (/^Leaf/i.test(b)) return 'Leaf'
  if (/^Score/i.test(b)) return 'Score'
  return b || 'Other'
}

function firstSentence(text) {
  if (!text) return ''
  const trimmed = text.trim()
  const m = trimmed.match(/^[^.!?]+[.!?]/)
  if (m) return m[0].trim()
  const words = trimmed.split(/\s+/)
  return words.length > 16 ? words.slice(0, 16).join(' ') + '…' : trimmed
}

export default function CardStylePicker({ value, onChange, styles = CARD_STYLES }) {
  const [search, setSearch] = useState('')

  // Manufacturer list ordered by how many styles each has (biggest first),
  // with Fictional pinned to the end.
  const brands = useMemo(() => {
    const counts = new Map()
    for (const s of styles) {
      const m = manufacturer(s)
      counts.set(m, (counts.get(m) || 0) + 1)
    }
    const list = Array.from(counts.entries())
    list.sort((a, b) => {
      if (a[0] === FICTIONAL) return 1
      if (b[0] === FICTIONAL) return -1
      return b[1] - a[1] || a[0].localeCompare(b[0])
    })
    return list.map(([name, count]) => ({ name, count }))
  }, [styles])

  const [brand, setBrand] = useState(() => brands[0]?.name || 'Panini')

  const q = search.trim().toLowerCase()
  const searching = q.length > 0

  // When searching, ignore the brand chip and match across everything.
  // Otherwise show just the selected brand. Always newest-first.
  const results = useMemo(() => {
    const list = styles.filter(s => {
      if (searching) {
        const hay = `${s.label || ''} ${s.brand || ''} ${s.year || ''}`.toLowerCase()
        return hay.includes(q)
      }
      return manufacturer(s) === brand
    })
    return list.sort((a, b) => (b.year || 0) - (a.year || 0))
  }, [styles, brand, q, searching])

  // When searching across brands, group results under brand headers.
  const grouped = useMemo(() => {
    if (!searching) return null
    const out = new Map()
    for (const s of results) {
      const m = manufacturer(s)
      if (!out.has(m)) out.set(m, [])
      out.get(m).push(s)
    }
    return Array.from(out.entries())
  }, [results, searching])

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative">
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-txt-tertiary pointer-events-none"
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M21 21l-4.35-4.35M11 18a7 7 0 100-14 7 7 0 000 14z" />
        </svg>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search every brand, set, or year…"
          className="w-full pl-10 pr-3 py-2.5 rounded-lg bg-surface-2 border border-surface-4 text-txt-primary text-sm focus:border-surface-5 focus:outline-none"
        />
      </div>

      {/* Brand chips — hidden while searching (search is global) */}
      {!searching && (
        <div className="flex items-center gap-2 flex-wrap">
          {brands.map(b => {
            const active = b.name === brand
            return (
              <button
                key={b.name}
                type="button"
                onClick={() => setBrand(b.name)}
                className="px-3 py-1.5 rounded-md text-xs font-semibold transition-colors"
                style={{
                  backgroundColor: active ? 'var(--text-primary)' : 'var(--surface-3)',
                  color: active ? 'var(--surface-1)' : 'var(--text-secondary)',
                  border: `1px solid ${active ? 'var(--text-primary)' : 'var(--surface-4)'}`,
                }}
              >
                {b.name}
                <span className="ml-1.5 tabular-nums opacity-60">{b.count}</span>
              </button>
            )
          })}
        </div>
      )}

      {/* Results */}
      {results.length === 0 ? (
        <div className="rounded-lg p-6 text-center bg-surface-2 border border-dashed border-surface-4">
          <div className="text-sm font-semibold text-txt-secondary">No matches</div>
          <p className="mt-1 text-xs text-txt-tertiary">Try a different search term.</p>
        </div>
      ) : searching ? (
        <div className="space-y-5">
          {grouped.map(([brandName, list]) => (
            <section key={brandName}>
              <SectionHeader title={brandName} count={list.length} />
              <CellGrid styles={list} value={value} onChange={onChange} />
            </section>
          ))}
        </div>
      ) : (
        <CellGrid styles={results} value={value} onChange={onChange} />
      )}
    </div>
  )
}

function SectionHeader({ title, count }) {
  return (
    <header className="flex items-baseline gap-3 mb-2">
      <h4 className="label-xs text-txt-secondary">{title}</h4>
      <div className="flex-1 h-px bg-surface-4" />
      <span className="label-xs tabular-nums text-txt-tertiary">{count}</span>
    </header>
  )
}

function CellGrid({ styles, value, onChange }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
      {styles.map(style => (
        <StyleCell
          key={style.id}
          style={style}
          selected={style.id === value}
          onClick={() => onChange(style.id)}
        />
      ))}
    </div>
  )
}

/**
 * StyleCell — neutral, info-dense entry. Brand+year header, label,
 * one-line description, iconic examples. Selected = text-primary ring +
 * corner check.
 */
function StyleCell({ style, selected, onClick }) {
  const isFictional = manufacturer(style) === FICTIONAL
  const yearTag = isFictional ? 'CONCEPT' : style.year
  const oneLiner = firstSentence(style.description)
  return (
    <button
      type="button"
      onClick={onClick}
      className="relative text-left rounded-lg overflow-hidden transition-colors"
      style={{
        backgroundColor: selected ? 'var(--surface-3)' : 'var(--surface-2)',
        border: `1px solid ${selected ? 'var(--text-primary)' : 'var(--surface-4)'}`,
        boxShadow: selected ? '0 0 0 1px var(--text-primary)' : 'none',
      }}
    >
      {selected && (
        <span
          aria-hidden="true"
          className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full flex items-center justify-center"
          style={{ backgroundColor: 'var(--text-primary)' }}
        >
          <svg className="w-3 h-3" style={{ color: 'var(--surface-1)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        </span>
      )}

      <div className="px-3.5 py-3 space-y-1.5">
        <div className="label-xs text-txt-tertiary">
          {(style.brand || '').toUpperCase()} · {yearTag}
        </div>
        <div className="text-sm font-bold text-txt-primary leading-tight pr-5">
          {style.label}
        </div>
        {oneLiner && (
          <p className="text-[11px] leading-snug text-txt-secondary line-clamp-2">
            {oneLiner}
          </p>
        )}
        {style.iconicExamples && (
          <div className="flex items-baseline gap-1.5 pt-0.5">
            <span className="label-xs text-txt-tertiary flex-shrink-0">ICONIC</span>
            <span className="text-[10px] text-txt-tertiary line-clamp-1 flex-1 min-w-0">
              {style.iconicExamples}
            </span>
          </div>
        )}
      </div>
    </button>
  )
}
