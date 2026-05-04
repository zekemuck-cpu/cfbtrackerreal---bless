/**
 * CardStylePicker — info-dense, searchable picker for the 47-style
 * card brand catalog. Replaces the previous "wall of empty 5:7
 * placeholder rectangles" picker.
 *
 * UX rules driving this design:
 *   1. NO empty preview rectangles. Without real preview imagery,
 *      placeholder boxes are wasted vertical space. We use type
 *      and color hierarchy to differentiate cells instead.
 *   2. Search-first. With 47+ entries, dropdown-style scrolling is
 *      slow; the search input filters by label / brand / year as
 *      the user types.
 *   3. Era group chips collapse the 19 granular era keys into a
 *      handful of broad decade buckets users actually think in.
 *   4. Each cell is a tight info card: brand+year header, label,
 *      a brand-defining one-liner pulled from the description,
 *      and 1-3 iconic-card examples for recognition.
 *   5. A colored left rail per era lets you scan-pick by decade.
 *
 * Props:
 *   value     — currently selected style id
 *   onChange  — fn(styleId) called when the user picks a different one
 *   styles    — full registry array (defaults to CARD_STYLES)
 */

import { useMemo, useState } from 'react'
import { CARD_STYLES } from '../data/cardStyles'

// Synthetic era key for fictional / concept entries. We detect them via
// `id.startsWith('fictional_')` and route them to this bucket regardless
// of what era the source catalog lists, so they never mix with real
// production sets in the "All" / decade chips. Lives in its own chip.
const FICTIONAL_ERA = 'fictional'

// Era group buckets — top-level filter chips. `eras: null` means "every
// REAL era" (fictional always lives in its own chip). Order matters:
// the chip rendered furthest-left is the default, and the user wants to
// open the picker on Modern with everything sorted recent-first.
const ERA_GROUPS = [
  { id: 'modern',     label: 'Modern',     eras: ['early_2010s', 'modern_panini'] },
  { id: 'all',        label: 'All Real',   eras: null },
  { id: '2000s',      label: '2000s',      eras: ['early_2000s', 'early_2000s_premium', 'mid_2000s', 'mid_2000s_premium', 'late_2000s_premium'] },
  { id: '90s',        label: '90s',        eras: ['early_modern', 'early_90s', 'early_90s_premium', 'mid_90s', 'mid_90s_premium', 'late_90s_premium'] },
  { id: '80s',        label: '80s',        eras: ['early_80s', 'mid_80s', 'late_80s'] },
  { id: 'vintage',    label: 'Vintage',    eras: ['vintage_1950s', 'vintage_1960s', 'vintage_1970s'] },
  { id: 'fictional',  label: 'Fictional',  eras: [FICTIONAL_ERA] },
]

// Per-era left-rail color so each card can be scan-picked by era.
const ERA_ACCENT = {
  [FICTIONAL_ERA]: '#c084fc',  // violet — signals "imaginary / concept"
  modern_panini: '#7c8aff',
  early_2010s: '#5dade2',
  late_2000s_premium: '#b48ce0',
  mid_2000s_premium: '#9b7ed4',
  mid_2000s: '#9b7ed4',
  early_2000s_premium: '#7cc26b',
  early_2000s: '#7cc26b',
  late_90s_premium: '#9eb8e5',
  mid_90s_premium: '#c0c0d0',
  mid_90s: '#a3a3b3',
  early_90s_premium: '#5cc4b8',
  early_90s: '#3fb6a8',
  early_modern: '#3fb6a8',
  late_80s: '#d265a8',
  mid_80s: '#e879b3',
  early_80s: '#e879b3',
  vintage_1970s: '#d28547',
  vintage_1960s: '#d4a056',
  vintage_1950s: '#d4a056',
  college: '#e07b3a',
  misc: '#6e6e78',
}

// Era group label for the row header above each cluster of styles.
// Ordered newest → oldest so the section render order matches the user's
// scan expectation when "All Real" is selected.
const ERA_GROUP_LABEL = {
  [FICTIONAL_ERA]: 'Fictional · Concept Sets',
  modern_panini: 'Modern · Panini Era',
  early_2010s: 'Early 2010s',
  late_2000s_premium: 'Late 2000s · Premium',
  mid_2000s_premium: 'Mid 2000s · Premium',
  mid_2000s: 'Mid 2000s',
  early_2000s_premium: 'Early 2000s · Premium',
  early_2000s: 'Early 2000s',
  late_90s_premium: 'Late 90s · Premium',
  mid_90s_premium: 'Mid 90s · Premium',
  mid_90s: 'Mid 90s',
  early_90s_premium: 'Early 90s · Premium',
  early_90s: 'Early 90s',
  early_modern: 'Early Modern',
  late_80s: 'Late 80s',
  mid_80s: 'Mid 80s',
  early_80s: 'Early 80s',
  vintage_1970s: 'Vintage · 1970s',
  vintage_1960s: 'Vintage · 1960s',
  vintage_1950s: 'Vintage · 1950s',
  college: 'College-Specific',
  misc: 'Misc',
}

// Section render order — newest first. Fictional sits at the top so
// when the user explicitly switches to that chip it lands on screen
// immediately.
const ERA_ORDER = Object.keys(ERA_GROUP_LABEL)

// Effective era for a style: fictional entries get routed to the
// synthetic FICTIONAL_ERA bucket regardless of what the catalog set.
function effectiveEra(style) {
  if (style?.id && String(style.id).startsWith('fictional_')) return FICTIONAL_ERA
  return style?.era || 'misc'
}

function firstSentence(text) {
  if (!text) return ''
  const trimmed = text.trim()
  const m = trimmed.match(/^[^.!?]+[.!?]/)
  if (m) return m[0].trim()
  const words = trimmed.split(/\s+/)
  return words.length > 18 ? words.slice(0, 18).join(' ') + '…' : trimmed
}

export default function CardStylePicker({ value, onChange, styles = CARD_STYLES }) {
  const [search, setSearch] = useState('')
  // Open on Modern by default — most users want recent sets, not 1952
  // Bowman, when they create a new card.
  const [eraGroup, setEraGroup] = useState('modern')

  // Combined filter — case-insensitive substring match across label,
  // brand, and year, intersected with the era group filter.
  // Fictional entries only appear when the Fictional chip is active;
  // the "All Real" chip and every decade chip exclude them.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const group = ERA_GROUPS.find(g => g.id === eraGroup)
    const eraSet = group?.eras ? new Set(group.eras) : null
    const onlyFictional = eraGroup === 'fictional'
    return styles.filter(s => {
      const era = effectiveEra(s)
      const isFictional = era === FICTIONAL_ERA
      if (onlyFictional) {
        if (!isFictional) return false
      } else {
        // Real-set chips — never include fictional, even under "All Real".
        if (isFictional) return false
        if (eraSet && !eraSet.has(era)) return false
      }
      if (!q) return true
      const hay = `${s.label || ''} ${s.brand || ''} ${s.year || ''}`.toLowerCase()
      return hay.includes(q)
    })
  }, [styles, search, eraGroup])

  // Group filtered results by era for the section headers. Sort each
  // section newest → oldest so a scrolling user sees recent stuff first.
  const byEra = useMemo(() => {
    const out = {}
    for (const s of filtered) {
      const era = effectiveEra(s)
      if (!out[era]) out[era] = []
      out[era].push(s)
    }
    for (const era of Object.keys(out)) {
      out[era].sort((a, b) => (b.year || 0) - (a.year || 0))
    }
    return out
  }, [filtered])

  return (
    <div className="space-y-4">
      {/* Filter bar — search + era chips */}
      <div className="space-y-2">
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
            placeholder="Search by brand, year, or set name…"
            className="w-full pl-10 pr-3 py-2.5 rounded-lg bg-surface-3 border border-surface-4 text-txt-primary text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {ERA_GROUPS.map(g => {
            const active = g.id === eraGroup
            return (
              <button
                key={g.id}
                type="button"
                onClick={() => setEraGroup(g.id)}
                className="px-3 py-1.5 rounded-md text-xs font-bold uppercase tracking-wider transition-colors"
                style={{
                  letterSpacing: '1.2px',
                  backgroundColor: active ? '#3b82f6' : 'var(--surface-3)',
                  color: active ? '#fff' : 'var(--text-secondary)',
                  border: '1px solid ' + (active ? '#3b82f6' : 'var(--surface-4)'),
                }}
              >
                {g.label}
              </button>
            )
          })}
          <span className="ml-auto label-xs tabular-nums text-txt-tertiary" style={{ letterSpacing: '1.5px', fontSize: '10px' }}>
            {filtered.length} {filtered.length === 1 ? 'STYLE' : 'STYLES'}
          </span>
        </div>
      </div>

      {/* Result list — empty state OR per-era section + dense info cards */}
      {filtered.length === 0 ? (
        <div
          className="rounded-lg p-6 text-center"
          style={{ backgroundColor: 'var(--surface-3)', border: '1px dashed var(--surface-4)' }}
        >
          <div className="text-sm font-bold text-txt-secondary">No matches</div>
          <p className="mt-1 text-xs text-txt-tertiary">
            Try a different search term or change the era filter above.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {ERA_ORDER.filter(era => byEra[era]?.length).map(era => (
            <section key={era}>
              <header className="flex items-baseline gap-3 mb-2">
                <h4
                  className="label-xs text-txt-secondary"
                  style={{ letterSpacing: '2px', fontSize: '10px' }}
                >
                  {ERA_GROUP_LABEL[era] || era}
                </h4>
                <div className="flex-1 h-px bg-surface-4" />
                <span
                  className="label-xs tabular-nums text-txt-tertiary"
                  style={{ letterSpacing: '1.5px', fontSize: '10px' }}
                >
                  {byEra[era].length}
                </span>
              </header>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {byEra[era].map(style => (
                  <StyleCell
                    key={style.id}
                    style={style}
                    selected={style.id === value}
                    onClick={() => onChange(style.id)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * StyleCell — single style entry, info-dense, no preview rectangle.
 * Layout: era-color left rail, brand+year header, label, one-line
 * description, iconic examples. Selected state adds a bright ring,
 * checkmark in the corner, and faint accent fill.
 */
function StyleCell({ style, selected, onClick }) {
  const era = effectiveEra(style)
  const accent = ERA_ACCENT[era] || 'var(--surface-5)'
  const oneLiner = firstSentence(style.description)
  // Fictional entries have a placeholder year (2025) in the catalog
  // metadata, but the rendered card adopts the dynasty's year at
  // generation time. Show a "Concept" tag here instead of misleading
  // anyone with a hardcoded year.
  const isFictional = era === FICTIONAL_ERA
  const yearTag = isFictional ? 'CONCEPT' : style.year
  return (
    <button
      type="button"
      onClick={onClick}
      className="relative text-left rounded-lg overflow-hidden transition-all duration-150"
      style={{
        backgroundColor: selected
          ? 'color-mix(in srgb, ' + accent + ' 12%, var(--surface-2))'
          : 'var(--surface-2)',
        border: '1px solid ' + (selected ? '#3b82f6' : 'var(--surface-4)'),
        boxShadow: selected ? '0 0 0 2px rgba(59, 130, 246, 0.35)' : 'none',
      }}
    >
      {/* Era-color left rail — instant scan-pick by decade. */}
      <span
        aria-hidden="true"
        className="absolute left-0 top-0 bottom-0"
        style={{ width: 3, backgroundColor: accent }}
      />

      {/* Selected checkmark — top-right corner. */}
      {selected && (
        <span
          aria-hidden="true"
          className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full flex items-center justify-center"
          style={{ backgroundColor: '#3b82f6' }}
        >
          <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        </span>
      )}

      <div className="pl-4 pr-3 py-3 space-y-1.5">
        {/* Header: brand + year, the immediate identification line. */}
        <div className="flex items-baseline justify-between gap-2">
          <span
            className="font-display tabular-nums"
            style={{
              fontFamily: "'Bebas Neue', sans-serif",
              fontSize: 14,
              letterSpacing: '0.05em',
              color: accent,
            }}
          >
            {(style.brand || '').toUpperCase()}
            <span className="text-txt-tertiary mx-1">·</span>
            <span className="text-txt-primary">{yearTag}</span>
          </span>
        </div>

        {/* Style label — the user-facing name. */}
        <div className="text-sm font-bold text-txt-primary leading-tight">
          {style.label}
        </div>

        {/* Brand-defining one-liner from the description's first sentence. */}
        {oneLiner && (
          <p className="text-[11px] leading-snug text-txt-secondary line-clamp-2">
            {oneLiner}
          </p>
        )}

        {/* Iconic examples — bottom row in muted text, clearly tagged. */}
        {style.iconicExamples && (
          <div className="flex items-baseline gap-1.5 pt-1">
            <span
              className="label-xs text-txt-tertiary flex-shrink-0"
              style={{ letterSpacing: '1.2px', fontSize: '9px' }}
            >
              ICONIC
            </span>
            <span className="text-[10px] text-txt-tertiary line-clamp-1 flex-1 min-w-0">
              {style.iconicExamples}
            </span>
          </div>
        )}
      </div>
    </button>
  )
}
