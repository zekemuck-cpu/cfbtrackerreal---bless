import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { createPortal } from 'react-dom'
import { useDynasty, getPlayerClassForYear } from '../../context/DynastyContext'
import { usePathPrefix } from '../../hooks/usePathPrefix'
import { useTeamColors } from '../../hooks/useTeamColors'
import { isOpenTarget } from '../../utils/recruitingTargets'
import { computeSeasonAV } from '../../utils/approximateValue'
import { getColorsFromTid, getNameFromTid } from '../../data/teamRegistry'
import { getTeamLogoByTid, getMascotName, stripMascotFromName } from '../../data/teams'
import { getContrastTextColor } from '../../utils/colorUtils'
import { displayGroups, displayLabel } from '../../utils/recruitAttributes'
import { areRatingsHiddenForDisplay } from '../../editions'

// -------------------------------------------------------------------------
// Stat normalization — mirrors the per-season shape used on the Player page
// (Player.jsx `yearByYearStats`) so the compare table reads identically to
// the rest of the app. Returns a normalized season object or null.
// -------------------------------------------------------------------------
function normalizeSeason(player, year) {
  const raw = player?.statsByYear?.[year] ?? player?.statsByYear?.[String(year)] ?? {}
  const passing = raw?.passing
  const rushing = raw?.rushing
  const receiving = raw?.receiving
  const blocking = raw?.blocking
  const defensive = raw?.defense
  const kicking = raw?.kicking
  const positionForYear = player?.positionByYear?.[year] || player?.positionByYear?.[String(year)] || player?.position
  return {
    gamesPlayed: Number(raw?.gamesPlayed) || 0,
    av: computeSeasonAV(raw, positionForYear) || 0,
    passing: passing ? {
      cmp: passing.cmp ?? passing.comp ?? 0,
      att: passing.att ?? passing.attempts ?? 0,
      yds: passing.yds ?? passing.yards ?? 0,
      td: passing.td ?? passing.touchdowns ?? 0,
      int: passing.int ?? passing.interceptions ?? 0,
      lng: passing.lng ?? passing.long ?? 0,
    } : null,
    rushing: rushing ? {
      car: rushing.car ?? rushing.carries ?? 0,
      yds: rushing.yds ?? rushing.yards ?? 0,
      td: rushing.td ?? rushing.touchdowns ?? 0,
      lng: rushing.lng ?? rushing.long ?? 0,
    } : null,
    receiving: receiving ? {
      rec: receiving.rec ?? receiving.receptions ?? 0,
      yds: receiving.yds ?? receiving.yards ?? 0,
      td: receiving.td ?? receiving.touchdowns ?? 0,
      lng: receiving.lng ?? receiving.long ?? 0,
    } : null,
    defensive: defensive ? {
      tkl: (defensive.soloTkl ?? defensive.solo ?? 0) + (defensive.astTkl ?? defensive.ast ?? defensive.assists ?? 0),
      tfl: defensive.tfl ?? 0,
      sacks: defensive.sacks ?? 0,
      int: defensive.int ?? 0,
      ff: defensive.ff ?? 0,
      td: defensive.td ?? 0,
    } : null,
    kicking: kicking ? {
      fgm: kicking.fgm ?? 0,
      fga: kicking.fga ?? 0,
      xpm: kicking.xpm ?? 0,
      xpa: kicking.xpa ?? 0,
      lng: kicking.lng ?? 0,
    } : null,
    blocking: blocking ? {
      pancakes: blocking.pancakes ?? 0,
      sacksAllowed: blocking.sacksAllowed ?? 0,
    } : null,
  }
}

// Per-season attribute map (CFB 27 launch ratings). Falls back to the flat
// recruit `attributes` map, matching the Player page's Attributes tab.
function seasonAttributes(player, year) {
  const byYear = player?.attributesByYear
  return byYear?.[year] || byYear?.[String(year)] || player?.attributes || {}
}

// Seasons a player was actually on a team, newest first. Combines roster
// membership (teamsByYear) with any season that has recorded stats.
function playerSeasons(player) {
  const set = new Set()
  if (player?.teamsByYear) Object.keys(player.teamsByYear).forEach(y => set.add(parseInt(y)))
  if (player?.statsByYear) Object.keys(player.statsByYear).forEach(y => set.add(parseInt(y)))
  return Array.from(set).filter(y => Number.isFinite(y)).sort((a, b) => b - a)
}

function teamTidForYear(player, year) {
  const t = player?.teamsByYear?.[year] ?? player?.teamsByYear?.[String(year)]
  return t == null ? null : t
}

// -------------------------------------------------------------------------
// Comparison sections. Each stat row pulls from a normalized season and
// declares whether higher or lower is "better" so the winning cell can be
// tinted green.
// -------------------------------------------------------------------------
const num = v => (typeof v === 'number' ? v : parseFloat(v))
const pct = (n, d) => (d ? ((n / d) * 100).toFixed(1) : null)
const avg = (n, d) => (d ? (n / d).toFixed(1) : null)

const STAT_SECTIONS = [
  {
    key: 'passing', label: 'Passing', present: s => s.passing && s.passing.att > 0,
    rows: [
      { label: 'CMP', better: 'high', get: s => s.passing?.cmp },
      { label: 'ATT', better: 'high', get: s => s.passing?.att },
      { label: 'PCT', better: 'high', get: s => pct(s.passing?.cmp, s.passing?.att), suffix: '%' },
      { label: 'YDS', better: 'high', get: s => s.passing?.yds },
      { label: 'TD', better: 'high', get: s => s.passing?.td },
      { label: 'INT', better: 'low', get: s => s.passing?.int },
      { label: 'LNG', better: 'high', get: s => s.passing?.lng },
    ],
  },
  {
    key: 'rushing', label: 'Rushing', present: s => s.rushing && s.rushing.car > 0,
    rows: [
      { label: 'CAR', better: 'high', get: s => s.rushing?.car },
      { label: 'YDS', better: 'high', get: s => s.rushing?.yds },
      { label: 'AVG', better: 'high', get: s => avg(s.rushing?.yds, s.rushing?.car) },
      { label: 'TD', better: 'high', get: s => s.rushing?.td },
      { label: 'LNG', better: 'high', get: s => s.rushing?.lng },
    ],
  },
  {
    key: 'receiving', label: 'Receiving', present: s => s.receiving && s.receiving.rec > 0,
    rows: [
      { label: 'REC', better: 'high', get: s => s.receiving?.rec },
      { label: 'YDS', better: 'high', get: s => s.receiving?.yds },
      { label: 'AVG', better: 'high', get: s => avg(s.receiving?.yds, s.receiving?.rec) },
      { label: 'TD', better: 'high', get: s => s.receiving?.td },
      { label: 'LNG', better: 'high', get: s => s.receiving?.lng },
    ],
  },
  {
    key: 'defense', label: 'Defense', present: s => s.defensive && s.defensive.tkl > 0,
    rows: [
      { label: 'TKL', better: 'high', get: s => s.defensive?.tkl },
      { label: 'TFL', better: 'high', get: s => s.defensive?.tfl },
      { label: 'SCK', better: 'high', get: s => s.defensive?.sacks },
      { label: 'INT', better: 'high', get: s => s.defensive?.int },
      { label: 'FF', better: 'high', get: s => s.defensive?.ff },
      { label: 'TD', better: 'high', get: s => s.defensive?.td },
    ],
  },
  {
    key: 'kicking', label: 'Kicking', present: s => s.kicking && (s.kicking.fga > 0 || s.kicking.xpa > 0),
    rows: [
      { label: 'FGM', better: 'high', get: s => s.kicking?.fgm },
      { label: 'FGA', better: 'high', get: s => s.kicking?.fga },
      { label: 'FG%', better: 'high', get: s => pct(s.kicking?.fgm, s.kicking?.fga), suffix: '%' },
      { label: 'XPM', better: 'high', get: s => s.kicking?.xpm },
      { label: 'XPA', better: 'high', get: s => s.kicking?.xpa },
      { label: 'LNG', better: 'high', get: s => s.kicking?.lng },
    ],
  },
  {
    key: 'blocking', label: 'Blocking', present: s => s.blocking && (s.blocking.pancakes > 0 || s.blocking.sacksAllowed > 0),
    rows: [
      { label: 'PANCAKES', better: 'high', get: s => s.blocking?.pancakes },
      { label: 'SACKS ALLOWED', better: 'low', get: s => s.blocking?.sacksAllowed },
    ],
  },
]

const MAX_COLUMNS = 6

// Which STAT sections matter most for a given position, in priority order.
// Used to surface the most relevant stat category first when comparing players
// (e.g. two OL → Blocking before Defense; two QBs → Passing first). Keys match
// STAT_SECTIONS[].key. Positions not listed fall back to the default
// STAT_SECTIONS order.
const POS_STAT_PRIORITY = {
  QB: ['passing', 'rushing'],
  HB: ['rushing', 'receiving'], RB: ['rushing', 'receiving'], FB: ['blocking', 'rushing', 'receiving'],
  WR: ['receiving', 'rushing'],
  TE: ['receiving', 'blocking'],
  LT: ['blocking'], LG: ['blocking'], C: ['blocking'], RG: ['blocking'], RT: ['blocking'],
  OL: ['blocking'], OT: ['blocking'], OG: ['blocking'],
  LE: ['defense'], RE: ['defense'], DE: ['defense'], DT: ['defense'], DL: ['defense'], EDGE: ['defense'],
  LOLB: ['defense'], ROLB: ['defense'], MLB: ['defense'], OLB: ['defense'], ILB: ['defense'], LB: ['defense'],
  CB: ['defense'], FS: ['defense'], SS: ['defense'], S: ['defense'], DB: ['defense'],
  K: ['kicking'], P: ['kicking'],
}

// Reorder stat sections so the ones most relevant to the compared players'
// positions come first. Mirrors orderAttrGroupsByPositions: a section's
// relevance is its best (lowest) priority index across the compared positions;
// ties (and unlisted sections) keep the default STAT_SECTIONS order.
function orderStatSectionsByPositions(sections, positions) {
  const relevance = (key) => {
    let best = Infinity
    for (const pos of positions) {
      const pri = POS_STAT_PRIORITY[String(pos || '').toUpperCase()]
      if (!pri) continue
      const idx = pri.indexOf(key)
      if (idx !== -1 && idx < best) best = idx
    }
    return best
  }
  return sections
    .map((s, i) => ({ s, i, r: relevance(s.key) }))
    .sort((a, b) => (a.r - b.r) || (a.i - b.i))
    .map((x) => x.s)
}

// Which attribute display groups matter most for a given position, in priority
// order. Used to surface the most relevant groups first when comparing players
// (e.g. two kickers → Kicking first; two OL → Blocking first). Group labels
// match ATTRIBUTE_DISPLAY_GROUP_DEFS in recruitAttributes.js.
const POS_ATTR_PRIORITY = {
  QB: ['Passing', 'Ballcarrier'],
  HB: ['Ballcarrier', 'Receiving'], RB: ['Ballcarrier', 'Receiving'], FB: ['Blocking', 'Ballcarrier'],
  WR: ['Receiving', 'Ballcarrier'],
  TE: ['Receiving', 'Blocking'],
  LT: ['Blocking'], LG: ['Blocking'], C: ['Blocking'], RG: ['Blocking'], RT: ['Blocking'],
  OL: ['Blocking'], OT: ['Blocking'], OG: ['Blocking'],
  LE: ['Defense'], RE: ['Defense'], DE: ['Defense'], DT: ['Defense'], DL: ['Defense'], EDGE: ['Defense'],
  LOLB: ['Defense'], ROLB: ['Defense'], MLB: ['Defense'], OLB: ['Defense'], ILB: ['Defense'], LB: ['Defense'],
  CB: ['Defense'], FS: ['Defense'], SS: ['Defense'], S: ['Defense'], DB: ['Defense'],
  K: ['Kicking'], P: ['Kicking'],
}

// Reorder attribute groups so the ones most relevant to the compared players'
// positions come first. Ties keep the groups' original (default card) order.
function orderAttrGroupsByPositions(groups, positions) {
  const relevance = (label) => {
    let best = Infinity
    for (const pos of positions) {
      const pri = POS_ATTR_PRIORITY[String(pos || '').toUpperCase()]
      if (!pri) continue
      const idx = pri.indexOf(label)
      if (idx !== -1 && idx < best) best = idx
    }
    return best
  }
  return groups
    .map((g, i) => ({ g, i, r: relevance(g.label) }))
    .sort((a, b) => (a.r - b.r) || (a.i - b.i))
    .map((x) => x.g)
}

// -------------------------------------------------------------------------
// Inline player picker — a text-styled trigger (the player's name) that opens
// a searchable list of every rostered player. The list is portaled to <body>
// so the table's overflow-hidden clipping can't hide it.
// -------------------------------------------------------------------------
const MENU_W = 280

function PlayerPicker({ players, teams, value, onChange, placeholder = 'Select a player' }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [hi, setHi] = useState(0)
  const [rect, setRect] = useState(null)
  const btnRef = useRef(null)
  const menuRef = useRef(null)
  const inputRef = useRef(null)

  const selected = value != null ? players.find(p => String(p.pid) === String(value)) : null

  const reposition = useCallback(() => {
    const el = btnRef.current
    if (el) setRect(el.getBoundingClientRect())
  }, [])

  useEffect(() => {
    if (!open) return
    reposition()
    const onDoc = e => {
      if (btnRef.current?.contains(e.target) || menuRef.current?.contains(e.target)) return
      setOpen(false); setSearch('')
    }
    const onScroll = () => reposition()
    document.addEventListener('mousedown', onDoc)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', reposition)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', reposition)
    }
  }, [open, reposition])

  useEffect(() => { setHi(0) }, [search])
  useEffect(() => { if (open) { const t = setTimeout(() => inputRef.current?.focus(), 0); return () => clearTimeout(t) } }, [open])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const list = q
      ? players.filter(p => {
          const seasons = playerSeasons(p)
          const yr = seasons.length ? ` ${seasons[seasons.length - 1]}-${seasons[0]}` : ''
          return `${p.name || ''} ${p.position || ''} ${p.jerseyNumber || ''}${yr}`.toLowerCase().includes(q)
        })
      : players
    return list.slice(0, 200)
  }, [players, search])

  const pick = p => { onChange(String(p.pid)); setOpen(false); setSearch('') }

  const onKey = e => {
    if (!open) { if (e.key === 'Enter' || e.key === 'ArrowDown') { setOpen(true); e.preventDefault() } return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setHi(i => Math.min(i + 1, filtered.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi(i => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); if (filtered[hi]) pick(filtered[hi]) }
    else if (e.key === 'Escape') { setOpen(false); setSearch('') }
  }

  const left = rect ? Math.max(8, Math.min(rect.left + rect.width / 2 - MENU_W / 2, window.innerWidth - MENU_W - 8)) : 0

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen(o => !o)}
        onKeyDown={onKey}
        className="inline-flex items-center gap-1 max-w-full"
      >
        <span
          className={`truncate text-sm font-bold hover:underline ${selected ? '' : 'font-medium'}`}
          style={{ color: selected ? 'var(--text-primary)' : 'var(--text-tertiary)' }}
        >
          {selected ? selected.name : placeholder}
        </span>
        <svg className={`w-3.5 h-3.5 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} style={{ color: 'var(--text-tertiary)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && rect && createPortal(
        <div
          ref={menuRef}
          className="fixed z-[10001] rounded-md shadow-xl"
          style={{ top: rect.bottom + 4, left, width: MENU_W, backgroundColor: 'var(--surface-2)', border: '1px solid var(--surface-4)' }}
        >
          <div className="p-2 border-b" style={{ borderColor: 'var(--surface-4)' }}>
            <input
              ref={inputRef}
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={onKey}
              placeholder="Search players..."
              className="w-full px-3 py-1.5 rounded text-sm focus:outline-none focus:ring-1 focus:ring-white/30"
              style={{ backgroundColor: 'var(--surface-1)', border: '1px solid var(--surface-4)', color: 'var(--text-primary)' }}
              autoComplete="off"
            />
          </div>
          <div className="max-h-72 overflow-auto py-1">
            {filtered.length === 0 && (
              <div className="px-3 py-3 text-sm text-center" style={{ color: 'var(--text-tertiary)' }}>No players found</div>
            )}
            {filtered.map((p, i) => {
              const tid = teamTidForYear(p, playerSeasons(p)[0])
              const logo = tid != null ? getTeamLogoByTid(tid, teams) : null
              const isSel = String(p.pid) === String(value)
              return (
                <div
                  key={p.pid}
                  onClick={() => pick(p)}
                  onMouseEnter={() => setHi(i)}
                  className="px-3 py-2 cursor-pointer flex items-center gap-2.5 text-sm"
                  style={{ backgroundColor: i === hi ? 'var(--surface-3)' : isSel ? 'var(--surface-1)' : 'transparent', color: 'var(--text-primary)' }}
                >
                  {logo ? <img src={logo} alt="" className="w-5 h-5 object-contain flex-shrink-0" /> : <span className="w-5 h-5 flex-shrink-0" />}
                  <span className="truncate flex-1">{p.name}</span>
                  <span className="flex-shrink-0 text-xs" style={{ color: 'var(--text-tertiary)' }}>{p.position}</span>
                </div>
              )
            })}
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}

// -------------------------------------------------------------------------
// Main page
// -------------------------------------------------------------------------
export default function ComparePlayers() {
  const { currentDynasty } = useDynasty()
  const pathPrefix = usePathPrefix()
  const [searchParams, setSearchParams] = useSearchParams()

  const teams = currentDynasty?.teams || currentDynasty?.customTeams
  const teamColors = useTeamColors(currentDynasty?.teamName, teams)
  const accent = teamColors?.primary || '#ea580c'

  // Collapsed section keys (click a section header to fold its rows away).
  const [collapsed, setCollapsed] = useState(() => new Set())
  const toggleSection = (key) => setCollapsed((prev) => {
    const next = new Set(prev)
    next.has(key) ? next.delete(key) : next.add(key)
    return next
  })

  const players = useMemo(
    () => (currentDynasty?.players || []).filter(p => !isOpenTarget(p)),
    [currentDynasty?.players]
  )
  const playerById = useMemo(() => {
    const m = new Map()
    players.forEach(p => m.set(String(p.pid), p))
    return m
  }, [players])

  // Slots come from the URL (?players=pid-year,pid-year) so comparisons are
  // shareable and the "Compare" button on the player page can deep-link in.
  // Only filled slots are tracked; an extra empty "add" column is rendered
  // separately so there's no standalone add button.
  const parseSlots = () => {
    const raw = searchParams.get('players')
    if (!raw) return []
    return raw.split(',').map(tok => {
      const [pid, year] = tok.split('-')
      return { pid: pid || null, year: year ? parseInt(year) : null }
    }).filter(s => s.pid)
  }
  const [slots, setSlots] = useState(parseSlots)

  // Keep the URL in sync with the current slots (filled slots only).
  useEffect(() => {
    const enc = slots.filter(s => s.pid && s.year != null).map(s => `${s.pid}-${s.year}`).join(',')
    const current = searchParams.get('players') || ''
    if (enc !== current) {
      const next = new URLSearchParams(searchParams)
      if (enc) next.set('players', enc); else next.delete('players')
      setSearchParams(next, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slots])

  const setSlot = (idx, patch) => setSlots(prev => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)))
  const removeSlot = idx => setSlots(prev => prev.filter((_, i) => i !== idx))

  // Default a newly picked player to their most RECENT season that actually
  // has recorded stats, not just their newest roster year. Otherwise adding a
  // QB whose newest season is an unplayed/redshirt year (0 games) lands on a
  // season with no passing stats, so the Passing section can't appear and the
  // table looks like it didn't react to the selection. Falls back to the
  // newest roster season, then the dynasty's current year.
  const seasonHasStats = (player, year) => {
    const s = normalizeSeason(player, year)
    return s.gamesPlayed > 0 || !!(s.passing || s.rushing || s.receiving || s.defensive || s.kicking || s.blocking)
  }
  const firstSeason = pid => {
    const p = playerById.get(String(pid))
    const seasons = p ? playerSeasons(p) : [] // newest-first
    const withStats = p ? seasons.find(y => seasonHasStats(p, y)) : null
    return withStats ?? seasons[0] ?? currentDynasty?.currentYear ?? null
  }
  const changePlayer = (idx, pid) => setSlot(idx, { pid, year: firstSeason(pid) })
  const addPlayer = pid => setSlots(prev => (prev.length >= MAX_COLUMNS ? prev : [...prev, { pid, year: firstSeason(pid) }]))

  // Resolve each filled slot into everything the table needs.
  const columns = useMemo(() => {
    return slots.map(slot => {
      const player = slot.pid ? playerById.get(String(slot.pid)) : null
      if (!player || slot.year == null) return null
      const tid = teamTidForYear(player, slot.year)
      const colors = tid != null ? getColorsFromTid(teams, tid) : { primary: accent, secondary: '#fff' }
      return {
        slot,
        player,
        year: slot.year,
        tid,
        teamName: tid != null ? (getMascotName(tid, teams) || getNameFromTid(teams, tid)) : null,
        logo: tid != null ? getTeamLogoByTid(tid, teams) : null,
        colors,
        position: player.positionByYear?.[slot.year] || player.positionByYear?.[String(slot.year)] || player.position,
        cls: getPlayerClassForYear(player, slot.year),
        ovr: player.overallByYear?.[slot.year] ?? player.overallByYear?.[String(slot.year)] ?? player.overall ?? null,
        stats: normalizeSeason(player, slot.year),
        attrs: seasonAttributes(player, slot.year),
      }
    }).filter(Boolean)
  }, [slots, playerById, teams, accent])

  const filledCols = columns
  const showAddCol = slots.length < MAX_COLUMNS

  // Which stat sections have at least one player with meaningful data, ordered
  // so the categories most relevant to the compared players' positions lead
  // (e.g. all OL → Blocking before Defense).
  const visibleSections = useMemo(() => {
    const present = STAT_SECTIONS.filter(sec => filledCols.some(c => sec.present(c.stats)))
    const positions = filledCols.map(c => c.position).filter(Boolean)
    return orderStatSectionsByPositions(present, positions)
  }, [filledCols])

  // Attribute sections (CFB 27 ratings) — grouped like the in-game player card.
  // Only groups/rows with at least one non-empty value across the selected
  // players are shown.
  // PC dynasties can't set "Hide all ratings" at all (League Preferences hides
  // the toggle for them) — areRatingsHiddenForDisplay ignores a stale true.
  const ratingsHidden = areRatingsHiddenForDisplay(currentDynasty)
  const attrSections = useMemo(() => {
    if (ratingsHidden) return [] // "Hide all ratings" league preference
    const has = (c, a) => c.attrs?.[a] != null && c.attrs[a] !== ''
    const groups = displayGroups()
      .map(g => ({ label: g.label, rows: g.attrs.filter(a => filledCols.some(c => has(c, a))) }))
      .filter(g => g.rows.length)
    const positions = filledCols.map(c => c.position).filter(Boolean)
    return orderAttrGroupsByPositions(groups, positions)
  }, [filledCols, ratingsHidden])

  if (!currentDynasty) return null

  // Bio rows (rendered above the stat sections).
  const bioRows = [
    { label: 'Position', get: c => c.position || '-' },
    { label: 'Team', get: c => (c.teamName ? stripMascotFromName(c.teamName) : '-') },
    { label: 'Class', get: c => c.cls || '-' },
    { label: 'Jersey', get: c => (c.player.jerseyNumber ? `#${c.player.jerseyNumber}` : '-') },
    { label: 'Height', get: c => c.player.height || '-' },
    { label: 'Weight', get: c => (c.player.weight ? `${c.player.weight}` : '-') },
    { label: 'OVR', get: c => c.ovr ?? '-', better: 'high', num: c => num(c.ovr) },
    { label: 'Games', get: c => c.stats.gamesPlayed, better: 'high', num: c => c.stats.gamesPlayed },
    { label: 'AV', get: c => (c.stats.av ?? 0).toFixed(1), better: 'high', num: c => c.stats.av },
  ]

  // Determine winning column index/indices for a numeric row.
  const winners = (getNum, better) => {
    if (!better) return new Set()
    const vals = filledCols.map(getNum)
    const valid = vals.filter(v => Number.isFinite(v))
    if (valid.length < 2) return new Set()
    const best = better === 'high' ? Math.max(...valid) : Math.min(...valid)
    const worst = better === 'high' ? Math.min(...valid) : Math.max(...valid)
    if (best === worst) return new Set() // all equal — nothing to highlight
    const set = new Set()
    vals.forEach((v, i) => { if (Number.isFinite(v) && v === best) set.add(i) })
    return set
  }

  const winTint = 'rgba(34,197,94,0.18)'
  const winBorder = 'rgba(34,197,94,0.55)'

  const dataColCount = filledCols.length + (showAddCol ? 1 : 0)
  // Fixed pixel widths for every column instead of flex (`1fr`) tracks. Flex
  // tracks collapse the data columns on a narrow (mobile) screen until the
  // team name, header select + OVR badge, and long labels truncate/overlap.
  // Fixed widths keep each column readable and let the whole table scroll
  // sideways in its container when it can't fit — the page never squeezes it.
  const LABEL_COL_W = 150
  const DATA_COL_W = 176
  const gridCols = { gridTemplateColumns: `${LABEL_COL_W}px repeat(${Math.max(dataColCount, 1)}, ${DATA_COL_W}px)` }
  // Intrinsic table width = label column + every data column. The bordered box
  // is capped at this width (so on a wide screen it's exactly as wide as its
  // content, no dead space) and scrolls horizontally when the viewport is
  // narrower (mobile).
  const tableWidth = LABEL_COL_W + Math.max(dataColCount, 1) * DATA_COL_W

  const StatRow = ({ label, cells, winSet }) => (
    <div className="grid items-center" style={gridCols}>
      {/* Small, no-wrap label so long names (e.g. "Short Route Running") stay
          on one line instead of wrapping and creating uneven row heights. */}
      <div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap leading-tight" style={{ color: 'var(--text-tertiary)' }}>{label}</div>
      {cells.map((cell, i) => (
        <div
          key={i}
          className="px-3 py-2 text-sm text-center tabular-nums"
          style={{
            color: 'var(--text-primary)',
            backgroundColor: winSet?.has(i) ? winTint : 'transparent',
            boxShadow: winSet?.has(i) ? `inset 0 0 0 1px ${winBorder}` : 'none',
            fontWeight: winSet?.has(i) ? 700 : 500,
          }}
        >
          {cell}
        </div>
      ))}
    </div>
  )

  // Collapsible section header — click to fold/unfold the section's rows.
  const SectionTitle = ({ sectionKey, children }) => {
    const isCollapsed = collapsed.has(sectionKey)
    return (
      <div className="grid" style={gridCols}>
        <button
          type="button"
          onClick={() => toggleSection(sectionKey)}
          className="flex items-center gap-1.5 px-3 py-2 text-[11px] font-bold uppercase tracking-widest text-left transition-opacity hover:opacity-90"
          style={{ color: getContrastTextColor(accent), backgroundColor: accent, gridColumn: '1 / -1' }}
          aria-expanded={!isCollapsed}
        >
          <svg className={`w-3 h-3 flex-shrink-0 transition-transform ${isCollapsed ? '-rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 9l-7 7-7-7" />
          </svg>
          {children}
        </button>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header — matched to the table width + mx-auto so its left edge lines
          up with the centered comparison table below. */}
      <div className="mb-5 mx-auto" style={{ maxWidth: `${tableWidth}px` }}>
        <h1 className="font-display font-extrabold uppercase tracking-tight text-2xl sm:text-3xl" style={{ color: 'var(--text-primary)' }}>
          Compare Players
        </h1>
      </div>

      {/* Comparison table — selection lives in the column headers. The outer
          box scrolls horizontally; the inner wrapper is the table's fixed
          intrinsic width so every row aligns and scrolls together. */}
      <div className="rounded-lg overflow-x-auto mx-auto" style={{ backgroundColor: 'var(--surface-1)', border: '1px solid var(--surface-4)', maxWidth: `${tableWidth}px` }}>
        <div style={{ width: `${tableWidth}px` }}>
        {/* Player header cards (each is a selector) */}
        <div className="grid" style={gridCols}>
          <div className="px-3 py-4" />
          {filledCols.map((c, i) => (
            <div key={i} className="relative px-2 sm:px-3 py-4 text-center border-l" style={{ borderColor: 'var(--surface-4)' }}>
              <button
                type="button"
                onClick={() => removeSlot(i)}
                className="absolute top-1.5 right-1.5 w-6 h-6 flex items-center justify-center rounded-md text-base leading-none transition-colors hover:bg-white/10"
                style={{ color: 'var(--text-tertiary)' }}
                title="Remove player"
                aria-label="Remove player"
              >
                ×
              </button>
              {/* Open this player's page (external-link / box-with-arrow). */}
              <Link
                to={`${pathPrefix}/player/${c.player.pid}`}
                className="absolute top-1.5 left-1.5 w-6 h-6 flex items-center justify-center rounded-md transition-colors hover:bg-white/10"
                style={{ color: 'var(--text-tertiary)' }}
                title="Open player page"
                aria-label="Open player page"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                </svg>
              </Link>
              <div className="flex flex-col items-center gap-1.5">
                <div
                  className="w-14 h-14 rounded-full flex items-center justify-center overflow-hidden flex-shrink-0"
                  style={{
                    // No photo but a team logo → team logo on a white circle
                    // (matches the player-page badge treatment). Photo/initials
                    // keep the team-colored circle.
                    backgroundColor: (!c.player.pictureUrl && c.logo) ? '#ffffff' : c.colors.primary,
                    ...((!c.player.pictureUrl && c.logo) ? { boxShadow: '0 0 0 1px rgba(0,0,0,0.1), 0 1px 3px rgba(0,0,0,0.2)' } : {}),
                  }}
                >
                  {c.player.pictureUrl ? (
                    <img src={c.player.pictureUrl} alt={c.player.name} className="w-full h-full object-cover" />
                  ) : c.logo ? (
                    <img src={c.logo} alt="" className="w-9 h-9 object-contain" />
                  ) : (
                    <span className="font-display font-bold text-lg" style={{ color: getContrastTextColor(c.colors.primary) }}>
                      {(c.player.name || '?').split(' ').map(w => w[0]).slice(0, 2).join('')}
                    </span>
                  )}
                </div>
                <PlayerPicker players={players} teams={teams} value={c.slot.pid} onChange={pid => changePlayer(i, pid)} />
                <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                  {c.logo && <img src={c.logo} alt="" className="w-4 h-4 object-contain" />}
                  <select
                    value={c.year ?? ''}
                    onChange={e => setSlot(i, { year: e.target.value ? parseInt(e.target.value) : null })}
                    className="px-1 py-0.5 rounded text-xs focus:outline-none focus:ring-1 focus:ring-white/30"
                    style={{ backgroundColor: 'var(--surface-2)', border: '1px solid var(--surface-4)', color: 'var(--text-secondary)' }}
                  >
                    {playerSeasons(c.player).map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
              </div>
            </div>
          ))}
          {showAddCol && (
            <div className="px-2 sm:px-3 py-4 text-center border-l" style={{ borderColor: 'var(--surface-4)' }}>
              <div className="flex flex-col items-center gap-1.5">
                <div
                  className="w-14 h-14 rounded-full flex-shrink-0"
                  style={{ border: '2px dashed var(--surface-4)' }}
                />
                <PlayerPicker players={players} teams={teams} value={null} onChange={addPlayer} placeholder={filledCols.length ? 'Add player' : 'Select a player'} />
                <div className="h-5" />
              </div>
            </div>
          )}
        </div>

        {filledCols.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm" style={{ color: 'var(--text-tertiary)', borderTop: '1px solid var(--surface-4)' }}>
            Search a player in the column above to start comparing.
          </div>
        ) : (
          <>
            {/* Bio */}
            <SectionTitle sectionKey="bio">Bio</SectionTitle>
            {!collapsed.has('bio') && bioRows.map(row => {
              const winSet = row.better ? winners(c => row.num(c), row.better) : null
              return <StatRow key={row.label} label={row.label} winSet={winSet} cells={filledCols.map(c => row.get(c))} />
            })}

            {/* Stat categories */}
            {visibleSections.map(sec => (
              <React.Fragment key={sec.key}>
                <SectionTitle sectionKey={sec.key}>{sec.label}</SectionTitle>
                {!collapsed.has(sec.key) && sec.rows.map(row => {
                  const rawVals = filledCols.map(c => row.get(c.stats))
                  const winSet = winners(c => num(row.get(c.stats)), row.better)
                  const cells = rawVals.map(v => (v == null ? '-' : `${typeof v === 'number' ? v.toLocaleString() : v}${row.suffix && v !== '-' ? row.suffix : ''}`))
                  return <StatRow key={sec.key + row.label} label={row.label} winSet={winSet} cells={cells} />
                })}
              </React.Fragment>
            ))}

            {/* Attributes (CFB 27 ratings) */}
            {attrSections.map(sec => {
              const key = 'attr-' + sec.label
              return (
              <React.Fragment key={key}>
                <SectionTitle sectionKey={key}>{sec.label}</SectionTitle>
                {!collapsed.has(key) && sec.rows.map(name => {
                  const winSet = winners(c => num(c.attrs?.[name]), 'high')
                  const cells = filledCols.map(c => {
                    const v = c.attrs?.[name]
                    return (v == null || v === '') ? '-' : Number(v)
                  })
                  return <StatRow key={key + name} label={displayLabel(name)} winSet={winSet} cells={cells} />
                })}
              </React.Fragment>
              )
            })}
          </>
        )}
        </div>
      </div>

    </div>
  )
}
