/**
 * Slot picker components for the AI Prompt Studio.
 *
 * Each picker is a small controlled component:
 *   props: { value, onChange, dynasty, slot, ... }
 *   renders: a labeled dropdown / textarea appropriate to the slot kind.
 *
 * Slot kinds: game | team | player | year | position | freeText
 *
 * One file because the components are short and they share helpers
 * (sorting, label formatting). If they grow we'll split them.
 */

import { useMemo, useState, useEffect } from 'react'
import { Select, Input, Textarea } from '../ui'
import { TEAMS } from '../../data/teamRegistry'
import { getMascotName } from '../../data/teams'

// ─── Game picker ────────────────────────────────────────────────────────────
//
// Three cascading dropdowns: Year → Team → Game. We only emit the
// final gameId up to the parent; the year/team selections are local
// filters that don't survive a page reload (but the gameId does, and
// we hydrate the filters from it on mount).

export function GameSlotPicker({ value, onChange, dynasty, slot }) {
  const teams = dynasty?.teams || TEAMS

  // Filter to "played" games once — same predicate the old single-dropdown used.
  const playedGames = useMemo(() => {
    return (dynasty?.games || []).filter(g =>
      g.team1Score != null && g.team2Score != null && (g.team1Score > 0 || g.team2Score > 0 || g.isPlayed)
    )
  }, [dynasty])

  // Local filter state — not lifted to parent because gameId alone is
  // enough for compose to resolve everything.
  const [year, setYear] = useState(null)
  const [tid, setTid] = useState(null)

  // If `value` already points at a known game, hydrate the filters from it.
  // Runs on mount and whenever value changes from outside (template switch).
  useEffect(() => {
    if (!value) return
    const g = playedGames.find(x => x.id === value)
    if (!g) return
    if (year == null) setYear(Number(g.year))
    if (tid == null) {
      // Default to team1Tid — user can flip via the team dropdown.
      setTid(Number(g.team1Tid))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, playedGames])

  // Year options: distinct years from played games, newest first.
  const yearOptions = useMemo(() => {
    const yrs = new Set(playedGames.map(g => Number(g.year)).filter(Number.isFinite))
    return Array.from(yrs).sort((a, b) => b - a)
  }, [playedGames])

  // Team options: distinct tids appearing in the selected year's games.
  const teamOptions = useMemo(() => {
    if (year == null) return []
    const tids = new Set()
    playedGames
      .filter(g => Number(g.year) === Number(year))
      .forEach(g => { tids.add(Number(g.team1Tid)); tids.add(Number(g.team2Tid)) })
    return Array.from(tids)
      .map(t => ({ tid: t, name: getMascotName(t, teams) || `Team ${t}` }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [playedGames, year, teams])

  // Game options: games in the year that include the team.
  const gameOptions = useMemo(() => {
    if (year == null || tid == null) return []
    return playedGames
      .filter(g => Number(g.year) === Number(year))
      .filter(g => Number(g.team1Tid) === Number(tid) || Number(g.team2Tid) === Number(tid))
      .sort((a, b) => {
        const wA = typeof a.week === 'number' ? a.week : parseInt(a.week, 10) || 0
        const wB = typeof b.week === 'number' ? b.week : parseInt(b.week, 10) || 0
        return wA - wB
      })
      .map(g => {
        const oppTid = Number(g.team1Tid) === Number(tid) ? Number(g.team2Tid) : Number(g.team1Tid)
        const oppName = getMascotName(oppTid, teams) || `Team ${oppTid}`
        const wk = g.bowlName ? g.bowlName : `Wk ${g.week ?? '?'}`
        const isHome = g.homeTeamTid == null
          ? null
          : Number(g.homeTeamTid) === Number(tid)
        const prep = isHome === true ? 'vs' : isHome === false ? 'at' : 'vs'
        const us = Number(g.team1Tid) === Number(tid) ? g.team1Score : g.team2Score
        const them = Number(g.team1Tid) === Number(tid) ? g.team2Score : g.team1Score
        const result = us > them ? 'W' : us < them ? 'L' : 'T'
        return {
          id: g.id,
          label: `${wk}: ${prep} ${oppName} — ${result} ${us}–${them}`,
        }
      })
  }, [playedGames, year, tid, teams])

  const handleYearChange = (v) => {
    const next = v === '' ? null : Number(v)
    setYear(next)
    setTid(null)
    if (value) onChange(null)
  }
  const handleTeamChange = (v) => {
    const next = v === '' ? null : Number(v)
    setTid(next)
    if (value) onChange(null)
  }
  const handleGameChange = (v) => {
    onChange(v || null)
  }

  return (
    <SlotShell label={slot.label} helper={slot.helper}>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <Select value={year ?? ''} onChange={e => handleYearChange(e.target.value)}>
          <option value="">— Year —</option>
          {yearOptions.map(y => (
            <option key={y} value={y}>{y}</option>
          ))}
        </Select>
        <Select
          value={tid ?? ''}
          onChange={e => handleTeamChange(e.target.value)}
          disabled={year == null}
        >
          <option value="">{year == null ? '— Pick a year first —' : '— Team —'}</option>
          {teamOptions.map(o => (
            <option key={o.tid} value={o.tid}>{o.name}</option>
          ))}
        </Select>
        <Select
          value={value || ''}
          onChange={e => handleGameChange(e.target.value)}
          disabled={tid == null}
        >
          <option value="">{tid == null ? '— Pick a team first —' : '— Game —'}</option>
          {gameOptions.map(o => (
            <option key={o.id} value={o.id}>{o.label}</option>
          ))}
        </Select>
      </div>
    </SlotShell>
  )
}

// ─── Team picker ────────────────────────────────────────────────────────────

export function TeamSlotPicker({ value, onChange, dynasty, slot }) {
  const options = useMemo(() => {
    const teams = dynasty?.teams || TEAMS
    return Object.keys(teams)
      .map(tid => ({
        tid: Number(tid),
        name: getMascotName(tid, teams) || `Team ${tid}`,
      }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [dynasty])

  return (
    <SlotShell label={slot.label} helper={slot.helper}>
      <Select value={value ?? ''} onChange={e => onChange(e.target.value ? Number(e.target.value) : null)}>
        <option value="">— Select a team —</option>
        {options.map(o => (
          <option key={o.tid} value={o.tid}>{o.name}</option>
        ))}
      </Select>
    </SlotShell>
  )
}

// ─── Player picker ──────────────────────────────────────────────────────────

export function PlayerSlotPicker({ value, onChange, dynasty, slot }) {
  const options = useMemo(() => {
    const teams = dynasty?.teams || TEAMS
    const year = dynasty?.currentYear
    return (dynasty?.players || [])
      .filter(p => !p.isHonorOnly)
      .map(p => {
        const tid = p.teamsByYear?.[year] ?? p.team
        const teamName = tid != null ? (getMascotName(tid, teams) || `Team ${tid}`) : '—'
        const pos = p.positionByYear?.[year] || p.position || '?'
        const ovr = p.overallByYear?.[year] || p.overall || ''
        return {
          pid: Number(p.pid),
          label: `${p.name} (${pos}, ${teamName}${ovr ? ` · ${ovr} OVR` : ''})`,
        }
      })
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [dynasty])

  return (
    <SlotShell label={slot.label} helper={slot.helper}>
      <Select value={value ?? ''} onChange={e => onChange(e.target.value ? Number(e.target.value) : null)}>
        <option value="">— Select a player —</option>
        {options.map(o => (
          <option key={o.pid} value={o.pid}>{o.label}</option>
        ))}
      </Select>
    </SlotShell>
  )
}

// ─── Year picker ────────────────────────────────────────────────────────────

export function YearSlotPicker({ value, onChange, dynasty, slot }) {
  const options = useMemo(() => {
    const years = new Set()
    if (dynasty?.currentYear) years.add(Number(dynasty.currentYear))
    if (dynasty?.startYear) {
      for (let y = Number(dynasty.startYear); y <= Number(dynasty.currentYear || dynasty.startYear); y++) {
        years.add(y)
      }
    }
    ;(dynasty?.games || []).forEach(g => {
      if (g.year != null) years.add(Number(g.year))
    })
    return Array.from(years).sort((a, b) => b - a)
  }, [dynasty])

  return (
    <SlotShell label={slot.label} helper={slot.helper}>
      <Select value={value ?? ''} onChange={e => onChange(e.target.value ? Number(e.target.value) : null)}>
        <option value="">— Select a year —</option>
        {options.map(y => (
          <option key={y} value={y}>{y}</option>
        ))}
      </Select>
    </SlotShell>
  )
}

// ─── Position picker ────────────────────────────────────────────────────────

const POSITIONS = ['QB', 'RB', 'FB', 'WR', 'TE', 'OL', 'DL', 'DE', 'DT', 'LB', 'OLB', 'MLB', 'CB', 'S', 'FS', 'SS', 'K', 'P', 'LS', 'KR', 'PR']

export function PositionSlotPicker({ value, onChange, slot }) {
  return (
    <SlotShell label={slot.label} helper={slot.helper}>
      <Select value={value || ''} onChange={e => onChange(e.target.value || null)}>
        <option value="">— Select a position —</option>
        {POSITIONS.map(p => (
          <option key={p} value={p}>{p}</option>
        ))}
      </Select>
    </SlotShell>
  )
}

// ─── Free text ──────────────────────────────────────────────────────────────

export function FreeTextSlotPicker({ value, onChange, slot }) {
  return (
    <SlotShell label={slot.label} helper={slot.helper}>
      <Textarea
        value={value || ''}
        onChange={e => onChange(e.target.value)}
        rows={3}
        placeholder={slot.placeholder || 'Anything you want included…'}
      />
    </SlotShell>
  )
}

// ─── Shell ──────────────────────────────────────────────────────────────────

function SlotShell({ label, helper, children }) {
  return (
    <div>
      <div className="mb-1">
        <span className="label-xs text-txt-secondary font-semibold">{label}</span>
        {helper && <span className="text-xs text-txt-tertiary ml-2">{helper}</span>}
      </div>
      {children}
    </div>
  )
}

// ─── Dispatcher ─────────────────────────────────────────────────────────────

export function SlotPicker({ slot, value, onChange, dynasty }) {
  switch (slot.kind) {
    case 'game':     return <GameSlotPicker     slot={slot} value={value} onChange={onChange} dynasty={dynasty} />
    case 'team':     return <TeamSlotPicker     slot={slot} value={value} onChange={onChange} dynasty={dynasty} />
    case 'player':   return <PlayerSlotPicker   slot={slot} value={value} onChange={onChange} dynasty={dynasty} />
    case 'year':     return <YearSlotPicker     slot={slot} value={value} onChange={onChange} dynasty={dynasty} />
    case 'position': return <PositionSlotPicker slot={slot} value={value} onChange={onChange} />
    case 'freeText': return <FreeTextSlotPicker slot={slot} value={value} onChange={onChange} />
    default:
      return (
        <SlotShell label={slot.label}>
          <div className="text-xs text-txt-tertiary italic">Unknown slot kind: {slot.kind}</div>
        </SlotShell>
      )
  }
}
