import { useState, useMemo, useEffect, useRef, useLayoutEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useDynasty } from '../context/DynastyContext'
import { usePathPrefix } from '../hooks/usePathPrefix'
import { Card, Badge, Tabs, Select, EmptyState } from './ui'
import { proxyImageUrl } from '../utils/imageProxy'
import { projectRoster, projectDepartures, projectNflCandidates } from '../utils/rosterProjection'
import { buildBoard, SIDE_OPTIONS, ST_ROLE_SLOTS } from '../utils/outlookBoard'

const EMPTY_ARR = []
const EMPTY_OBJ = {}
const DEV_TRAIT_COLORS = {
  Elite: { bg: '#fbbf24', text: '#000' },
  Star: { bg: '#a855f7', text: '#fff' },
  Impact: { bg: '#3b82f6', text: '#fff' },
  Normal: { bg: '#6b7280', text: '#fff' },
}

export default function TeamOutlook({ tid }) {
  const { id: dynastyId } = useParams()
  const pathPrefix = usePathPrefix()
  const { currentDynasty, isViewOnly, saveTeamFuture } = useDynasty()
  const currentYear = Number(currentDynasty?.currentYear)

  const [side, setSide] = useState('offense')
  const [year, setYear] = useState(currentYear + 1)
  const [selectedKey, setSelectedKey] = useState(null)
  const [noteEditKey, setNoteEditKey] = useState(null)
  const [showGrades, setShowGrades] = useState(false)
  useEffect(() => {
    setYear(currentYear + 1); setSide('offense'); setSelectedKey(null)
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [tid])

  const tidData = currentDynasty?.teamFuture?.[tid] || EMPTY_OBJ
  const placements = tidData.placements || EMPTY_OBJ
  const order = tidData.order || EMPTY_OBJ
  const notes = tidData.notes || EMPTY_OBJ
  const stRoles = tidData.stRoles || EMPTY_OBJ
  const leaveFlags = tidData.leaveFlags || EMPTY_ARR
  const nflDismissArr = tidData.nflDismissFlags || EMPTY_ARR
  const fbEnabled = !!tidData.fbEnabled

  const isFuture = year > currentYear
  const canEdit = !isViewOnly && tid != null

  const leaveSet = useMemo(() => new Set(leaveFlags), [leaveFlags])
  const nflDismissSet = useMemo(() => new Set(nflDismissArr), [nflDismissArr])

  const years = useMemo(() => {
    if (!Number.isFinite(currentYear)) return []
    const out = []
    for (let y = currentYear; y <= currentYear + 4; y++) out.push(y)
    return out
  }, [currentYear])

  const players = useMemo(() => {
    if (!currentDynasty || tid == null || !Number.isFinite(year)) return []
    return projectRoster(currentDynasty, tid, year, { leaveFlags: leaveSet })
  }, [currentDynasty, tid, year, leaveSet])

  const nflPids = useMemo(() => {
    if (!isFuture) return new Set()
    const cands = projectNflCandidates(currentDynasty, tid, year, { leaveFlags: leaveSet, nflDismissFlags: nflDismissSet })
    return new Set(cands.map(c => c.pid))
  }, [currentDynasty, tid, year, isFuture, leaveSet, nflDismissSet])

  const board = useMemo(
    () => buildBoard(players, side, { placements, order, notes, stRoles, nflPids, fbEnabled, lastYear: currentYear }),
    [players, side, placements, order, notes, stRoles, nflPids, fbEnabled, currentYear],
  )

  const departures = useMemo(
    () => (isFuture ? projectDepartures(currentDynasty, tid, year, { leaveFlags: leaveSet }) : []),
    [currentDynasty, tid, year, isFuture, leaveSet],
  )

  const teamLogo = currentDynasty?.teams?.[tid]?.logo || null
  const selectedPlayer = useMemo(
    () => (selectedKey ? players.find(p => p.key === selectedKey) : null),
    [selectedKey, players],
  )

  // ── Mutations ──────────────────────────────────────────────────────────────
  const save = (patch) => saveTeamFuture(dynastyId, tid, { ...tidData, ...patch })

  const placeSelected = (slotId) => {
    if (!canEdit || !selectedKey) return
    if (ST_ROLE_SLOTS.includes(slotId)) {
      const cur = stRoles[slotId] || []
      if (!cur.includes(selectedKey)) save({ stRoles: { ...stRoles, [slotId]: [...cur, selectedKey] } })
      setSelectedKey(null)
      return
    }
    const newOrder = { ...order }
    for (const k of Object.keys(newOrder)) newOrder[k] = (newOrder[k] || []).filter(id => id !== selectedKey)
    newOrder[slotId] = [...(newOrder[slotId] || []), selectedKey]
    save({ placements: { ...placements, [selectedKey]: slotId }, order: newOrder })
    setSelectedKey(null)
  }

  const sendToPen = () => {
    if (!canEdit || !selectedKey) return
    const np = { ...placements }; delete np[selectedKey]
    save({ placements: np })
    setSelectedKey(null)
  }

  const moveTile = (slotId, key, dir) => {
    if (!canEdit) return
    const slot = board.slots.find(s => s.id === slotId)
    if (!slot) return
    const ids = slot.tiles.map(t => t.key)
    const i = ids.indexOf(key)
    const j = dir === 'up' ? i - 1 : i + 1
    if (i < 0 || j < 0 || j >= ids.length) return
    ;[ids[i], ids[j]] = [ids[j], ids[i]]
    save({ order: { ...order, [slotId]: ids } })
  }

  const removeStRole = (slotId, key) => {
    if (!canEdit) return
    save({ stRoles: { ...stRoles, [slotId]: (stRoles[slotId] || []).filter(id => id !== key) } })
  }

  const addStRole = (slotId, key) => {
    if (!canEdit || !key) return
    const cur = stRoles[slotId] || []
    if (!cur.includes(key)) save({ stRoles: { ...stRoles, [slotId]: [...cur, key] } })
  }

  const toggleLeave = (pid) => {
    if (!canEdit || !pid) return
    const set = new Set(leaveFlags)
    set.has(pid) ? set.delete(pid) : set.add(pid)
    save({ leaveFlags: [...set] })
    setSelectedKey(null)
  }

  const toggleNflDismiss = (pid) => {
    if (!canEdit || !pid) return
    const set = new Set(nflDismissArr)
    set.has(pid) ? set.delete(pid) : set.add(pid)
    save({ nflDismissFlags: [...set] })
  }

  const setNote = (key, text) => {
    const next = { ...notes }
    if (text && text.trim()) next[key] = text.trim(); else delete next[key]
    save({ notes: next })
    setNoteEditKey(null)
  }

  if (!currentDynasty || tid == null) {
    return <EmptyState title="No team" message="No team to project." />
  }

  const tileProps = {
    selectedKey, canEdit, pathPrefix, teamLogo, isFuture,
    onSelect: (k) => setSelectedKey(prev => (prev === k ? null : k)),
    onPick: (k) => setSelectedKey(k),
    onMove: moveTile,
    onToggleLeave: toggleLeave,
    onToggleNfl: toggleNflDismiss,
    noteEditKey, onEditNote: setNoteEditKey, onSaveNote: setNote,
    leaveSet,
  }

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Tabs variant="pill" value={side} onChange={(v) => { setSide(v); setSelectedKey(null) }} options={SIDE_OPTIONS} />
        <div className="flex items-center gap-3 flex-wrap">
          {side === 'offense' && (
            <label className="flex items-center gap-1.5 text-xs text-txt-tertiary cursor-pointer">
              <input type="checkbox" checked={fbEnabled} disabled={!canEdit}
                onChange={(e) => save({ fbEnabled: e.target.checked })} />
              FB slot
            </label>
          )}
          <label className="flex items-center gap-1.5 text-xs text-txt-tertiary cursor-pointer">
            <input type="checkbox" checked={showGrades} onChange={(e) => setShowGrades(e.target.checked)} />
            Grades
          </label>
          <label className="flex items-center gap-2 text-xs text-txt-tertiary">Season
            <Select size="sm" value={String(year)} onChange={(e) => { setYear(Number(e.target.value)); setSelectedKey(null) }}>
              {years.map(y => <option key={y} value={String(y)}>{y === currentYear ? `${y} — Now` : y}</option>)}
            </Select>
          </label>
        </div>
      </div>

      {/* Summary */}
      <SummaryStrip summary={board.summary} side={side} />

      {/* Holding pen */}
      {isFuture && (
        <HoldingPen pen={board.pen} {...tileProps}
          onPenDrop={sendToPen}
          dropActive={!!selectedKey} />
      )}

      {/* Board */}
      <div className="space-y-3" onClick={() => selectedKey && setSelectedKey(null)}>
        {board.rows.map((rowIds, ri) => (
          <div key={ri} className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
            {rowIds.map(id => {
              const slot = board.slots.find(s => s.id === id)
              if (!slot) return null
              return (
                <SlotColumn key={id} slot={slot} {...tileProps}
                  isRole={ST_ROLE_SLOTS.includes(id)}
                  showGrades={showGrades}
                  dropActive={!!selectedKey}
                  onPlace={() => placeSelected(id)}
                  onRemoveRole={(k) => removeStRole(id, k)}
                  rolePicker={ST_ROLE_SLOTS.includes(id)
                    ? { players, current: stRoles[id] || [], onAdd: (k) => addStRole(id, k) }
                    : null}
                />
              )
            })}
          </div>
        ))}
      </div>

      {/* Marked leaving */}
      {isFuture && departures.length > 0 && (
        <Card padding="sm">
          <div className="label-sm text-txt-tertiary mb-2">Marked leaving ({departures.length})</div>
          <div className="flex flex-wrap gap-2">
            {departures.map(d => (
              <span key={d.pid} className="inline-flex items-center gap-2 text-xs bg-surface-3 rounded px-2 py-1">
                <span className="text-txt-secondary">{d.name}</span>
                <span className="text-txt-muted">{d.position} · {d.projectedClass}</span>
                {canEdit && (
                  <button onClick={() => toggleLeave(d.pid)} className="text-txt-tertiary hover:text-txt-primary font-semibold">Undo</button>
                )}
              </span>
            ))}
          </div>
        </Card>
      )}

      {/* Moving banner */}
      {selectedKey && selectedPlayer && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[9998] bg-surface-4 border border-surface-5 rounded-full px-4 py-2 text-sm shadow-lg flex items-center gap-3"
          style={{ margin: 0 }}>
          <span className="text-txt-primary font-semibold">Moving {selectedPlayer.name}</span>
          <span className="text-txt-tertiary hidden sm:inline">— tap a position to place</span>
          <button onClick={() => setSelectedKey(null)} className="text-txt-secondary hover:text-txt-primary font-semibold">Cancel</button>
        </div>
      )}
    </div>
  )
}

// ── Summary ───────────────────────────────────────────────────────────────────
function SummaryStrip({ summary, side }) {
  const label = side === 'st' ? 'Special teams' : side === 'defense' ? 'Defense' : 'Offense'
  return (
    <div className="flex items-center gap-4 text-xs">
      <span className="text-txt-tertiary uppercase tracking-wider font-semibold">{label}</span>
      <span className="text-txt-secondary">Unit OVR <b className="text-txt-primary tabular-nums">{summary.unitOvr ?? '—'}</b></span>
      <span className="text-txt-secondary">Holes <b className={`tabular-nums ${summary.holes ? 'text-[color:var(--accent-error)]' : 'text-txt-primary'}`}>{summary.holes}</b></span>
      {summary.toPlace > 0 && <span className="text-txt-secondary">To place <b className="text-[color:var(--accent-warning)] tabular-nums">{summary.toPlace}</b></span>}
    </div>
  )
}

// ── Holding pen ─────────────────────────────────────────────────────────────
function HoldingPen({ pen, dropActive, onPenDrop, ...tileProps }) {
  return (
    <Card padding="sm"
      onClick={(e) => { e.stopPropagation(); if (tileProps.selectedKey) onPenDrop() }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => { e.preventDefault(); onPenDrop() }}
      className={dropActive ? 'border-dashed border-surface-5' : ''}>
      <div className="label-sm text-txt-tertiary mb-2">
        Incoming to place ({pen.length}){dropActive ? ' — tap here to send back' : ''}
      </div>
      {pen.length === 0
        ? <div className="text-xs text-txt-tertiary italic">All incoming players placed.</div>
        : (
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
            {pen.map(t => (
              <div key={t.key} className="w-40 shrink-0">
                <PlayerTile tile={t} {...tileProps} inPen />
              </div>
            ))}
          </div>
        )}
    </Card>
  )
}

// ── Slot column ─────────────────────────────────────────────────────────────
function SlotColumn({ slot, dropActive, onPlace, showGrades, isRole, rolePicker, onRemoveRole, ...tileProps }) {
  const hole = slot.isHole && !isRole
  return (
    <div className="w-40 shrink-0">
      <Card padding="none"
        onClick={(e) => { e.stopPropagation(); if (tileProps.selectedKey) onPlace() }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); onPlace() }}
        className={`h-full ${dropActive ? 'border-dashed border-surface-5 cursor-pointer' : ''} ${hole ? 'border-[color:var(--accent-error)]' : ''}`}>
        <div className="flex items-center justify-between gap-1 px-2 py-1.5 border-b border-surface-4">
          <span className="font-bold text-txt-primary text-sm">{slot.label}</span>
          <div className="flex items-center gap-1">
            {showGrades && !isRole && <Badge variant="outline">{slot.grade}</Badge>}
            <span className="text-[10px] text-txt-muted tabular-nums">{slot.tiles.length}</span>
          </div>
        </div>
        <div className="p-1.5 space-y-1.5 min-h-[3rem]">
          {slot.tiles.length === 0
            ? <div className="text-[11px] text-txt-tertiary italic px-1 py-2 text-center">{hole ? 'Hole' : '—'}</div>
            : slot.tiles.map((t, idx) => (
              <PlayerTile key={t.key} tile={t} {...tileProps}
                slotId={slot.id} indexInSlot={idx} slotCount={slot.tiles.length}
                isRole={isRole} onRemoveRole={onRemoveRole} />
            ))}
          {rolePicker && tileProps.canEdit && (
            <Select size="sm" value=""
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => { rolePicker.onAdd(e.target.value); e.target.value = '' }}>
              <option value="">+ add…</option>
              {rolePicker.players
                .filter(p => !rolePicker.current.includes(p.key))
                .map(p => <option key={p.key} value={p.key}>{p.name} ({p.position})</option>)}
            </Select>
          )}
        </div>
      </Card>
    </div>
  )
}

// ── Player tile ─────────────────────────────────────────────────────────────
function PlayerTile({
  tile, selectedKey, canEdit, pathPrefix, teamLogo,
  onSelect, onPick, onMove, onToggleLeave, onToggleNfl, leaveSet,
  noteEditKey, onEditNote, onSaveNote,
  slotId, indexInSlot, slotCount, inPen, isRole, onRemoveRole,
}) {
  const selected = selectedKey === tile.key
  const editingNote = noteEditKey === tile.key
  const isStarter = indexInSlot === 0 && !inPen && !isRole

  return (
    <div
      draggable={canEdit}
      onDragStart={(e) => { e.stopPropagation(); onPick(tile.key) }}
      onClick={(e) => { e.stopPropagation(); if (canEdit) onSelect(tile.key) }}
      className={`rounded border bg-surface-2 px-1.5 py-1 ${canEdit ? 'cursor-pointer' : ''} ${selected ? 'border-[color:var(--accent-info)] ring-1 ring-[color:var(--accent-info)]' : 'border-surface-4'} ${isStarter ? 'bg-surface-3' : ''}`}
    >
      <div className="flex items-center gap-1.5 min-w-0">
        <Avatar url={tile.player?.pictureUrl} fallback={teamLogo} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1 min-w-0">
            <PlayerName pid={tile.pid} name={tile.name} pathPrefix={pathPrefix} />
          </div>
          <div className="flex items-center gap-1 text-[10px] text-txt-tertiary">
            <span>{tile.position}</span>
            <span>·</span>
            <span>{tile.projectedClass}</span>
            <DevChip trait={tile.devTrait} />
          </div>
        </div>
        <div className="text-right shrink-0">
          {inPen
            ? <StarRating stars={tile.stars} isPortal={tile.isPortal} />
            : <span className="tabular-nums font-semibold text-txt-primary text-sm">{tile.projectedOvr ?? '—'}</span>}
        </div>
      </div>

      {/* markers */}
      {(tile.isNfl || tile.portalRisk || tile.isPortal || tile.note) && (
        <div className="flex flex-wrap items-center gap-1 mt-1">
          {tile.isNfl && <Badge variant="info">NFL</Badge>}
          {tile.portalRisk && <Badge variant="warning">Portal risk</Badge>}
          {inPen && tile.isPortal && <Badge variant="info">Transfer</Badge>}
          {tile.note && <span className="text-[10px] text-txt-secondary italic truncate">“{tile.note}”</span>}
        </div>
      )}

      {/* actions (when selected) */}
      {selected && canEdit && (
        <div className="flex flex-wrap items-center gap-2 mt-1.5 pt-1.5 border-t border-surface-4" onClick={(e) => e.stopPropagation()}>
          {!inPen && !isRole && slotCount > 1 && (
            <>
              <TileBtn disabled={indexInSlot === 0} onClick={() => onMove(slotId, tile.key, 'up')}>▲</TileBtn>
              <TileBtn disabled={indexInSlot === slotCount - 1} onClick={() => onMove(slotId, tile.key, 'down')}>▼</TileBtn>
            </>
          )}
          {isRole
            ? <TileBtn onClick={() => onRemoveRole(tile.key)}>Remove</TileBtn>
            : <>
              <TileBtn onClick={() => onEditNote(tile.key)}>Note</TileBtn>
              {tile.pid && tile.isNfl && <TileBtn onClick={() => onToggleNfl(tile.pid)}>Keep</TileBtn>}
              {tile.pid && <TileBtn onClick={() => onToggleLeave(tile.pid)}>{leaveSet.has(tile.pid) ? 'Stay' : 'Out'}</TileBtn>}
            </>}
        </div>
      )}

      {editingNote && (
        <div className="mt-1.5" onClick={(e) => e.stopPropagation()}>
          <input autoFocus defaultValue={tile.note}
            className="w-full text-[11px] bg-surface-1 border border-surface-4 rounded px-1.5 py-1 text-txt-primary"
            placeholder="note…"
            onKeyDown={(e) => { if (e.key === 'Enter') onSaveNote(tile.key, e.currentTarget.value); if (e.key === 'Escape') onEditNote(null) }}
            onBlur={(e) => onSaveNote(tile.key, e.currentTarget.value)} />
        </div>
      )}
    </div>
  )
}

function TileBtn({ children, onClick, disabled }) {
  return (
    <button onClick={onClick} disabled={disabled}
      className="text-[11px] font-semibold px-1.5 py-0.5 rounded text-txt-tertiary hover:text-txt-primary hover:bg-surface-3 disabled:opacity-30 disabled:cursor-not-allowed">
      {children}
    </button>
  )
}

function StarRating({ stars, isPortal }) {
  if (stars) return <span className="tabular-nums text-txt-secondary font-semibold text-sm">{stars}★</span>
  return <span className="text-txt-tertiary text-[10px]">{isPortal ? '—' : 'HS'}</span>
}

function DevChip({ trait }) {
  if (!trait) return null
  const t = String(trait).trim()
  const key = t.charAt(0).toUpperCase() + t.slice(1).toLowerCase()
  const c = DEV_TRAIT_COLORS[key]
  if (!c) return null
  return <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: c.bg }} title={key} />
}

function Avatar({ url, fallback }) {
  const [errored, setErrored] = useState(false)
  const hasUrl = url && !errored
  const src = hasUrl ? proxyImageUrl(url, 80) : fallback || null
  return (
    <div className="w-6 h-6 rounded-full bg-surface-4 overflow-hidden flex-shrink-0 flex items-center justify-center">
      {src ? <img src={src} alt="" onError={() => setErrored(true)} className={`w-full h-full ${hasUrl ? 'object-cover' : 'object-contain p-0.5'}`} /> : null}
    </div>
  )
}

function shortName(name) {
  if (!name) return name
  const parts = String(name).trim().split(/\s+/)
  if (parts.length < 2) return name
  return `${parts[0][0].toUpperCase()}. ${parts.slice(1).join(' ')}`
}

function PlayerName({ pid, name, pathPrefix }) {
  const ref = useRef(null)
  const measureRef = useRef(null)
  const [abbrev, setAbbrev] = useState(false)
  useLayoutEffect(() => {
    const c = ref.current, m = measureRef.current
    if (!c || !m) return
    const check = () => setAbbrev(m.offsetWidth > c.clientWidth + 1)
    check()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(check) : null
    ro?.observe(c)
    return () => ro?.disconnect()
  }, [name])
  const content = (
    <>
      {abbrev ? shortName(name) : name}
      <span ref={measureRef} aria-hidden="true" className="invisible absolute left-0 top-0 whitespace-nowrap">{name}</span>
    </>
  )
  const cls = 'relative block min-w-0 truncate font-medium text-txt-primary text-xs'
  if (pid) return <Link ref={ref} to={`${pathPrefix}/player/${pid}`} onClick={(e) => e.stopPropagation()} title={name} className={`${cls} hover:underline`}>{content}</Link>
  return <span ref={ref} title={name} className={cls}>{content}</span>
}
