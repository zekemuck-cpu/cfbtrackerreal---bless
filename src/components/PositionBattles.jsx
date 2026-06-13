import { useState, useMemo, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useDynasty, isPlayerOnRoster, getPlayerClassForYear, getPlayerOverallForYear } from '../context/DynastyContext'
import { getCurrentTeamTid } from '../data/teamRegistry'
import { usePathPrefix } from '../hooks/usePathPrefix'
import { getPresetAttrs, PRESET_OPTIONS } from '../data/schemes'
import { Card, EmptyState } from './ui'

const EXPANDABLE_ATTRS = {
  'Throw Accuracy': ['Short Acc', 'Med Acc', 'Deep Acc'],
  'Route Running':  ['Short Route', 'Med Route', 'Deep Route'],
}

const BATTLE_POSITIONS = [
  'QB', 'HB', 'FB', 'WR', 'TE',
  'LT', 'LG', 'C', 'RG', 'RT',
  'LEDG', 'REDG', 'DT',
  'SAM', 'MIKE', 'WILL',
  'CB', 'FS', 'SS',
  'K', 'P',
]

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

function emptyBattle(position = 'QB') {
  return { id: genId(), position, preset: 'Default', keyAttributes: [], candidates: [], winnerId: null }
}

// PBS = (OVR × 0.4) + (avg(attrScores) × 0.3) + (scrimmage × 3)
// Attr scores 0–100 (game values); ×0.3 → max 30. Scrimmage 1–10; ×3 → max 30. Max PBS = 100.
function calcPBS(ovr, attrScores, scrimmageScore) {
  const o = Number(ovr)
  const s = Number(scrimmageScore)
  if (!isFinite(o) || !isFinite(s) || s < 1 || s > 10) return null
  const validScores = (attrScores || []).map(Number).filter(n => isFinite(n) && n >= 0 && n <= 100)
  if (validScores.length === 0) return null
  const avgAttr = validScores.reduce((a, b) => a + b, 0) / validScores.length
  return Math.round(((o * 0.4) + (avgAttr * 0.3) + (s * 3)) * 10) / 10
}

function getPBSLeader(candidates) {
  const scored = candidates
    .map((c, i) => ({ key: c.pid || String(i), pbs: calcPBS(c.ovr, c.attrScores, c.scrimmageScore) }))
    .filter(x => x.pbs !== null)
  if (scored.length < 2) return null
  scored.sort((a, b) => b.pbs - a.pbs)
  return scored[0].key
}

// ─── RosterSearch ─────────────────────────────────────────────────────────────

function RosterSearch({ rosterPlayers, alreadyPids, position, onSelect, disabled }) {
  const [query, setQuery] = useState('')
  const [focused, setFocused] = useState(false)
  const inputRef = useRef(null)

  const atPosition = useMemo(() => {
    const taken = new Set(alreadyPids)
    return rosterPlayers.filter(p => p.position === position && !taken.has(p.pid))
  }, [rosterPlayers, alreadyPids, position])

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? atPosition.filter(p => p.name.toLowerCase().includes(q)) : atPosition
  }, [query, atPosition])

  const open = focused && !disabled && results.length > 0

  const handleArrowClick = () => {
    if (disabled) return
    if (focused) { setFocused(false); inputRef.current?.blur() }
    else { setFocused(true); inputRef.current?.focus() }
  }

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={e => setQuery(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 150)}
        placeholder={disabled ? 'Max 3 players' : `Select ${position}...`}
        disabled={disabled}
        className="w-full pl-3 pr-8 py-1.5 text-sm rounded border text-txt-primary placeholder-txt-tertiary disabled:opacity-40"
        style={{ backgroundColor: 'var(--surface-2)', borderColor: 'var(--surface-4)' }}
      />
      <button
        type="button"
        tabIndex={-1}
        disabled={disabled}
        onMouseDown={e => e.preventDefault()}
        onClick={handleArrowClick}
        style={{
          position: 'absolute', right: 0, top: 0, bottom: 0, width: '32px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'none', border: 'none', cursor: 'pointer', padding: 0,
        }}
      >
        <span style={{
          display: 'block', width: 0, height: 0,
          borderLeft: '4px solid transparent', borderRight: '4px solid transparent',
          borderTop: '5px solid var(--text-tertiary)',
          transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 150ms ease',
          opacity: disabled ? 0.4 : 1,
        }} />
      </button>
      {open && (
        <div
          className="absolute z-50 top-full left-0 right-0 mt-1 rounded border shadow-lg overflow-hidden"
          style={{ backgroundColor: 'var(--surface-2)', borderColor: 'var(--surface-4)', maxHeight: '220px', overflowY: 'auto' }}
        >
          {results.map(p => (
            <button
              key={p.pid}
              type="button"
              onMouseDown={e => e.preventDefault()}
              onClick={() => { onSelect(p); setQuery(''); setFocused(false) }}
              className="w-full text-left px-3 py-2 text-sm flex items-center justify-between hover:bg-surface-3 transition-colors"
            >
              <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{p.name}</span>
              <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
                {p.classLabel} · OVR {p.overall ?? '—'}
              </span>
            </button>
          ))}
        </div>
      )}
      {focused && !disabled && atPosition.length === 0 && (
        <div
          className="absolute z-50 top-full left-0 right-0 mt-1 rounded border px-3 py-2 text-sm"
          style={{ backgroundColor: 'var(--surface-2)', borderColor: 'var(--surface-4)', color: 'var(--text-tertiary)' }}
        >
          No {position}s on roster
        </div>
      )}
    </div>
  )
}

// ─── BattleForm ───────────────────────────────────────────────────────────────

function BattleForm({ initial, offenseScheme, defenseScheme, rosterPlayers, onSave, onCancel }) {
  const [draft, setDraft] = useState(() => ({
    ...initial,
    preset: initial.preset || 'Default',
    candidates: initial.candidates.map(c => ({
      ...c,
      // Pad existing attrScores to 5 slots (backward compat with older 3-slot data)
      attrScores: Array(5).fill('').map((_, i) => c.attrScores?.[i] ?? ''),
      attrSubScores: c.attrSubScores || {},
    })),
  }))

  // Recompute live whenever position or preset changes
  const keyAttributes = getPresetAttrs(draft.preset, draft.position, offenseScheme, defenseScheme) || []

  const setPosition = (pos) => setDraft(d => ({ ...d, position: pos, candidates: [] }))
  const setPreset = (p) => setDraft(d => ({ ...d, preset: p }))

  const addCandidate = (player) => setDraft(d => ({
    ...d,
    candidates: [...d.candidates, {
      pid: player.pid, name: player.name, ovr: player.overall,
      attrScores: ['', '', '', '', ''], attrSubScores: {}, scrimmageScore: '',
      notes: '', hasEdge: false,
    }],
  }))

  const removeCandidate = (idx) => setDraft(d => ({
    ...d, candidates: d.candidates.filter((_, i) => i !== idx),
  }))

  const updateCandidate = (idx, patch) => setDraft(d => ({
    ...d, candidates: d.candidates.map((c, i) => i === idx ? { ...c, ...patch } : c),
  }))

  const updateAttrScore = (candidateIdx, attrIdx, raw) => {
    const val = raw === '' ? '' : Math.min(100, Math.max(0, Number(raw)))
    setDraft(d => ({
      ...d,
      candidates: d.candidates.map((c, i) => {
        if (i !== candidateIdx) return c
        const next = Array(5).fill('').map((_, j) => c.attrScores?.[j] ?? '')
        next[attrIdx] = val
        return { ...c, attrScores: next }
      }),
    }))
  }

  const updateSubScore = (candidateIdx, attrIdx, subIdx, raw) => {
    const val = raw === '' ? '' : Math.min(100, Math.max(0, Number(raw)))
    setDraft(d => ({
      ...d,
      candidates: d.candidates.map((c, i) => {
        if (i !== candidateIdx) return c
        const prevSubs = (c.attrSubScores?.[attrIdx]) || ['', '', '']
        const newSubs = [...prevSubs]
        newSubs[subIdx] = val
        const valid = newSubs.map(Number).filter(n => isFinite(n) && n >= 0 && n <= 100)
        const avg = valid.length > 0 ? Math.round(valid.reduce((a, b) => a + b, 0) / valid.length) : ''
        const newAttrScores = Array(5).fill('').map((_, j) => c.attrScores?.[j] ?? '')
        newAttrScores[attrIdx] = avg
        return { ...c, attrSubScores: { ...c.attrSubScores, [attrIdx]: newSubs }, attrScores: newAttrScores }
      }),
    }))
  }

  const alreadyPids = draft.candidates.map(c => c.pid).filter(Boolean)
  const canSave = draft.candidates.length >= 2

  return (
    <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--surface-4)', backgroundColor: 'var(--surface-2)' }}>
      {/* Header */}
      <div className="px-4 py-3 space-y-2" style={{ borderBottom: '1px solid var(--surface-3)', backgroundColor: 'var(--surface-1)' }}>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--text-tertiary)' }}>Position</span>
            <select
              value={draft.position}
              onChange={e => setPosition(e.target.value)}
              className="text-sm font-bold px-2 py-1 rounded border"
              style={{ backgroundColor: 'var(--surface-3)', borderColor: 'var(--surface-4)', color: 'var(--text-primary)', cursor: 'pointer' }}
            >
              {BATTLE_POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--text-tertiary)' }}>Focus</span>
            <select
              value={draft.preset}
              onChange={e => setPreset(e.target.value)}
              className="text-sm px-2 py-1 rounded border"
              style={{ backgroundColor: 'var(--surface-3)', borderColor: 'var(--surface-4)', color: 'var(--text-primary)', cursor: 'pointer' }}
            >
              {PRESET_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
        </div>
        {keyAttributes.length > 0 ? (
          <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
            Grading: {keyAttributes.join(' · ')}
          </div>
        ) : draft.preset === 'Default' && (
          <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
            No scheme set — pick a non-Default focus or set your scheme in the Depth Chart tab.
          </div>
        )}
      </div>

      {/* Candidates */}
      <div className="px-4 py-3 space-y-3">
        {draft.candidates.map((candidate, idx) => {
          const pbs = calcPBS(candidate.ovr, candidate.attrScores, candidate.scrimmageScore)
          return (
            <div
              key={candidate.pid || idx}
              className="rounded-md overflow-hidden"
              style={{ border: '1px solid var(--surface-4)', backgroundColor: 'var(--surface-1)' }}
            >
              <div className="px-3 py-2 flex items-center gap-2" style={{ borderBottom: '1px solid var(--surface-3)' }}>
                <span className="font-semibold text-sm flex-1" style={{ color: 'var(--text-primary)' }}>
                  {candidate.name}
                  <span className="ml-2 font-normal text-xs" style={{ color: 'var(--text-tertiary)' }}>OVR {candidate.ovr ?? '—'}</span>
                </span>
                {pbs !== null && (
                  <span className="text-xs font-bold tabular-nums flex-shrink-0" style={{ color: 'var(--text-secondary)' }}>PBS {pbs}</span>
                )}
                <button
                  type="button"
                  onClick={() => removeCandidate(idx)}
                  className="text-xs px-2 py-0.5 rounded border flex-shrink-0"
                  style={{ borderColor: 'var(--surface-4)', color: 'var(--text-tertiary)' }}
                >
                  Remove
                </button>
              </div>
              <div className="px-3 py-2 space-y-1.5">
                {/* Attribute scores */}
                {(keyAttributes || []).map((attr, ai) => {
                  if (EXPANDABLE_ATTRS[attr]) {
                    const subLabels = EXPANDABLE_ATTRS[attr]
                    const subs = (candidate.attrSubScores || {})[ai] || ['', '', '']
                    const avg = (candidate.attrScores || [])[ai]
                    return (
                      <div key={ai} className="space-y-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-medium flex-1" style={{ color: 'var(--text-tertiary)' }}>{attr}</span>
                          {avg !== '' && avg != null && (
                            <span className="text-xs tabular-nums flex-shrink-0" style={{ color: 'var(--text-tertiary)' }}>avg {avg}</span>
                          )}
                        </div>
                        {subLabels.map((sub, si) => (
                          <div key={si} className="flex items-center gap-1.5 pl-3">
                            <span className="text-xs flex-1" style={{ color: 'var(--text-tertiary)' }}>{sub}</span>
                            <input
                              type="number" min="0" max="100" step="1"
                              value={subs[si] ?? ''}
                              onChange={e => updateSubScore(idx, ai, si, e.target.value)}
                              placeholder="—"
                              className="w-14 text-center text-xs rounded border py-0.5 flex-shrink-0"
                              style={{ backgroundColor: 'var(--surface-2)', borderColor: 'var(--surface-4)', color: 'var(--text-primary)' }}
                            />
                          </div>
                        ))}
                      </div>
                    )
                  }
                  return (
                    <div key={ai} className="flex items-center gap-1.5">
                      <span className="text-xs flex-1 truncate" style={{ color: 'var(--text-tertiary)' }} title={attr}>{attr}</span>
                      <input
                        type="number" min="0" max="100" step="1"
                        value={(candidate.attrScores || [])[ai] ?? ''}
                        onChange={e => updateAttrScore(idx, ai, e.target.value)}
                        placeholder="—"
                        className="w-14 text-center text-xs rounded border py-0.5 flex-shrink-0"
                        style={{ backgroundColor: 'var(--surface-2)', borderColor: 'var(--surface-4)', color: 'var(--text-primary)' }}
                      />
                    </div>
                  )
                })}
                {/* Scrimmage score */}
                <div
                  className="flex items-center gap-1.5 pt-1"
                  style={{ borderTop: keyAttributes?.length ? '1px solid var(--surface-3)' : 'none', marginTop: keyAttributes?.length ? '4px' : 0 }}
                >
                  <span className="text-xs flex-1" style={{ color: 'var(--text-tertiary)' }}>On-Field Scrimmage</span>
                  <input
                    type="number" min="1" max="10" step="1"
                    value={candidate.scrimmageScore}
                    onChange={e => updateCandidate(idx, { scrimmageScore: e.target.value === '' ? '' : Math.min(10, Math.max(1, Number(e.target.value))) })}
                    placeholder="—"
                    className="w-10 text-center text-xs rounded border py-0.5 flex-shrink-0"
                    style={{ backgroundColor: 'var(--surface-2)', borderColor: 'var(--surface-4)', color: 'var(--text-primary)' }}
                  />
                  <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-tertiary)' }}>/10</span>
                </div>
                <textarea
                  value={candidate.notes}
                  onChange={e => updateCandidate(idx, { notes: e.target.value })}
                  placeholder="Notes (optional)..."
                  rows={2}
                  className="w-full text-sm resize-none rounded px-2 py-1.5"
                  style={{ backgroundColor: 'var(--surface-2)', border: '1px solid var(--surface-3)', color: 'var(--text-primary)', lineHeight: 1.5 }}
                />
              </div>
            </div>
          )
        })}

        {draft.candidates.length < 3 && (
          <div>
            {draft.candidates.length === 0 && (
              <p className="text-xs mb-1.5" style={{ color: 'var(--text-tertiary)' }}>Select players competing for this spot</p>
            )}
            <RosterSearch
              rosterPlayers={rosterPlayers}
              alreadyPids={alreadyPids}
              position={draft.position}
              onSelect={addCandidate}
              disabled={false}
            />
          </div>
        )}
      </div>

      <div className="px-4 py-3 flex items-center justify-end gap-2" style={{ borderTop: '1px solid var(--surface-3)', backgroundColor: 'var(--surface-1)' }}>
        <button type="button" onClick={onCancel} className="px-3 py-1.5 text-sm rounded border" style={{ borderColor: 'var(--surface-4)', color: 'var(--text-secondary)' }}>Cancel</button>
        <button
          type="button"
          onClick={() => onSave(draft)}
          disabled={!canSave}
          className="px-4 py-1.5 text-sm font-semibold rounded disabled:opacity-40"
          style={{ backgroundColor: 'var(--text-primary)', color: 'var(--surface-1)' }}
        >
          Save Battle
        </button>
      </div>
    </div>
  )
}

// ─── BattleCard ───────────────────────────────────────────────────────────────

function BattleCard({ battle, rosterPlayers, pathPrefix, onEdit, onDelete, onSetWinner, onClearWinner, onToggleEdge, isViewOnly }) {
  const [winnerSelect, setWinnerSelect] = useState('')
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const resolved = !!battle.winnerId
  const pbsLeaderKey = !resolved ? getPBSLeader(battle.candidates) : null
  const displayCandidates = resolved
    ? battle.candidates
    : [...battle.candidates].sort((a, b) => (b.hasEdge ? 1 : 0) - (a.hasEdge ? 1 : 0))

  return (
    <div
      className="rounded-lg overflow-hidden"
      style={{
        border: `1px solid ${resolved ? 'color-mix(in srgb, var(--text-secondary) 30%, transparent)' : 'var(--surface-4)'}`,
        backgroundColor: 'var(--surface-2)',
      }}
    >
      {/* Header */}
      <div className="px-4 py-2.5 flex items-center justify-between gap-2" style={{ borderBottom: '1px solid var(--surface-3)', backgroundColor: 'var(--surface-1)' }}>
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-display font-extrabold uppercase tracking-widest flex-shrink-0" style={{ fontSize: '13px', color: 'var(--text-primary)', letterSpacing: '2px' }}>
            {battle.position}
          </span>
          {battle.preset && battle.preset !== 'Default' && (
            <span className="text-xs font-semibold flex-shrink-0 px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--surface-3)', color: 'var(--text-secondary)', fontSize: '10px' }}>
              {battle.preset}
            </span>
          )}
          {battle.keyAttributes?.length > 0 && (
            <span className="text-xs truncate" style={{ color: 'var(--text-tertiary)' }}>
              · {battle.keyAttributes.join(', ')}
            </span>
          )}
        </div>
        <span className="text-xs font-medium uppercase tracking-widest flex-shrink-0" style={{ color: resolved ? 'var(--text-secondary)' : 'var(--text-tertiary)', letterSpacing: '1.5px' }}>
          {resolved ? 'Starter Named' : 'Undecided'}
        </span>
      </div>

      {/* Candidates */}
      {displayCandidates.map((candidate, idx) => {
        const player = rosterPlayers.find(p => p.pid === candidate.pid)
        const displayName = player?.name || candidate.name || `Candidate ${idx + 1}`
        const isWinner = resolved && candidate.pid === battle.winnerId
        const isLoser = resolved && !isWinner
        const pbs = calcPBS(candidate.ovr, candidate.attrScores, candidate.scrimmageScore)
        const candidateKey = candidate.pid || String(idx)
        const isLeading = !resolved && pbsLeaderKey === candidateKey

        return (
          <div
            key={candidateKey}
            className="px-4 py-3"
            style={{ borderBottom: idx < battle.candidates.length - 1 ? '1px solid var(--surface-3)' : undefined }}
          >
            <div className="flex items-start gap-2">
              {resolved && (
                <span className="mt-0.5 font-bold flex-shrink-0" style={{ color: isWinner ? 'var(--text-primary)' : 'transparent', userSelect: 'none', width: '10px', fontSize: '12px' }}>›</span>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  {candidate.pid ? (
                    <Link to={`${pathPrefix}/player/${candidate.pid}`} className="text-sm font-semibold hover:underline" style={{ color: isLoser ? 'var(--text-tertiary)' : 'var(--text-primary)' }}>
                      {displayName}
                    </Link>
                  ) : (
                    <span className="text-sm font-semibold" style={{ color: isLoser ? 'var(--text-tertiary)' : 'var(--text-primary)' }}>{displayName}</span>
                  )}
                  <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>OVR {candidate.ovr ?? player?.overall ?? '—'}</span>
                  {pbs !== null && (
                    <span className="text-xs font-bold tabular-nums" style={{ color: isLoser ? 'var(--text-tertiary)' : 'var(--text-secondary)' }}>PBS {pbs}</span>
                  )}
                  {isLeading && (
                    <span className="text-xs font-bold px-1.5 py-0.5 rounded uppercase" style={{ backgroundColor: 'color-mix(in srgb, var(--text-secondary) 20%, transparent)', color: 'var(--text-secondary)', fontSize: '10px', letterSpacing: '1px' }}>
                      Leading
                    </span>
                  )}
                  {!resolved && candidate.hasEdge && (
                    <span className="text-xs font-bold px-1.5 py-0.5 rounded uppercase" style={{ backgroundColor: 'rgba(234,179,8,0.18)', color: '#ca8a04', fontSize: '10px', letterSpacing: '1px' }}>
                      Edge
                    </span>
                  )}
                  {isWinner && (
                    <span className="text-xs font-bold px-1.5 py-0.5 rounded uppercase" style={{ backgroundColor: 'color-mix(in srgb, var(--text-primary) 15%, transparent)', color: 'var(--text-primary)', fontSize: '10px', letterSpacing: '1px' }}>
                      Starter
                    </span>
                  )}
                  {!isViewOnly && !resolved && (
                    <button
                      type="button"
                      onClick={() => onToggleEdge(battle.id, candidate.pid)}
                      className="text-xs px-1.5 py-0.5 rounded border flex-shrink-0"
                      style={candidate.hasEdge
                        ? { borderColor: '#ca8a04', backgroundColor: 'rgba(234,179,8,0.18)', color: '#ca8a04', fontSize: '10px' }
                        : { borderColor: 'var(--surface-4)', color: 'var(--text-tertiary)', fontSize: '10px' }
                      }
                    >
                      Edge
                    </button>
                  )}
                </div>
                {/* Score breakdown — abbreviate attribute names to initials */}
                {(candidate.attrScores || []).some(s => s !== '' && s != null) && (
                  <div className="flex gap-2 mt-0.5 flex-wrap">
                    {(battle.keyAttributes || []).map((attr, ai) => {
                      const score = (candidate.attrScores || [])[ai]
                      if (score === '' || score == null) return null
                      const abbr = attr.split(' ').map(w => w[0]).join('')
                      if (EXPANDABLE_ATTRS[attr]) {
                        const subs = (candidate.attrSubScores || {})[ai] || []
                        const hasAnySub = subs.some(s => s !== '' && s != null)
                        if (hasAnySub) {
                          return (
                            <span key={ai} className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                              {abbr} {subs[0] ?? '—'}/{subs[1] ?? '—'}/{subs[2] ?? '—'}
                            </span>
                          )
                        }
                      }
                      return (
                        <span key={ai} className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                          {abbr} {score}
                        </span>
                      )
                    })}
                    {candidate.scrimmageScore !== '' && candidate.scrimmageScore != null && (
                      <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Scrim {candidate.scrimmageScore}/10</span>
                    )}
                  </div>
                )}
                {candidate.notes && (
                  <p className="mt-1 text-sm leading-snug" style={{ color: isLoser ? 'var(--text-tertiary)' : 'var(--text-secondary)', fontStyle: 'italic' }}>
                    "{candidate.notes}"
                  </p>
                )}
              </div>
            </div>
          </div>
        )
      })}

      {/* Footer */}
      {!isViewOnly && (
        <div className="px-4 py-2.5 flex items-center gap-2 flex-wrap" style={{ borderTop: '1px solid var(--surface-3)', backgroundColor: 'var(--surface-1)' }}>
          {!resolved && (
            <div className="flex items-center gap-1.5 flex-1 min-w-0">
              <select
                value={winnerSelect}
                onChange={e => setWinnerSelect(e.target.value)}
                className="text-xs px-2 py-1 rounded border flex-1"
                style={{ backgroundColor: 'var(--surface-2)', borderColor: 'var(--surface-4)', color: winnerSelect ? 'var(--text-primary)' : 'var(--text-tertiary)', maxWidth: '180px', cursor: 'pointer' }}
              >
                <option value="">Declare starter...</option>
                {battle.candidates.map((c, i) => {
                  const p = rosterPlayers.find(r => r.pid === c.pid)
                  return <option key={c.pid || i} value={c.pid || String(i)}>{p?.name || c.name || `Candidate ${i + 1}`}</option>
                })}
              </select>
              <button
                type="button"
                onClick={() => { if (winnerSelect) { onSetWinner(battle.id, winnerSelect); setWinnerSelect('') } }}
                disabled={!winnerSelect}
                className="text-xs px-3 py-1 rounded font-semibold disabled:opacity-40 flex-shrink-0"
                style={{ backgroundColor: 'var(--text-primary)', color: 'var(--surface-1)' }}
              >
                Confirm
              </button>
            </div>
          )}
          {resolved && (
            <button type="button" onClick={() => onClearWinner(battle.id)} className="text-xs px-2.5 py-1 rounded border" style={{ borderColor: 'var(--surface-4)', color: 'var(--text-secondary)' }}>
              Reopen
            </button>
          )}
          <div className="flex items-center gap-1.5 flex-shrink-0 ml-auto">
            <button type="button" onClick={() => onEdit(battle.id)} className="text-xs px-2.5 py-1 rounded border" style={{ borderColor: 'var(--surface-4)', color: 'var(--text-secondary)' }}>Edit</button>
            {confirmingDelete ? (
              <>
                <button type="button" onClick={() => onDelete(battle.id)} className="text-xs px-2.5 py-1 rounded border" style={{ borderColor: 'var(--surface-4)', color: 'var(--text-primary)' }}>Confirm</button>
                <button type="button" onClick={() => setConfirmingDelete(false)} className="text-xs px-2.5 py-1 rounded border" style={{ borderColor: 'var(--surface-4)', color: 'var(--text-tertiary)' }}>Cancel</button>
              </>
            ) : (
              <button type="button" onClick={() => setConfirmingDelete(true)} className="text-xs px-2.5 py-1 rounded border" style={{ borderColor: 'var(--surface-4)', color: 'var(--text-tertiary)' }}>Remove</button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function PositionBattles({ year, week }) {
  const { currentDynasty, isViewOnly, updateDynasty, saveTeamFuture } = useDynasty()
  const pathPrefix = usePathPrefix()
  const navigate = useNavigate()

  const [addingNew, setAddingNew] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [autoPopulating, setAutoPopulating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [confirmingReset, setConfirmingReset] = useState(false)

  const offenseScheme = currentDynasty?.offenseScheme || ''
  const defenseScheme = currentDynasty?.defenseScheme || ''
  const battles = useMemo(() => {
    const raw = currentDynasty?.positionBattlesByYear?.[year] || []
    return [...raw].sort((a, b) => {
      const ai = BATTLE_POSITIONS.indexOf(a.position)
      const bi = BATTLE_POSITIONS.indexOf(b.position)
      const aIdx = ai === -1 ? 999 : ai
      const bIdx = bi === -1 ? 999 : bi
      return aIdx - bIdx
    })
  }, [currentDynasty, year])

  const rosterPlayers = useMemo(() => {
    if (!currentDynasty) return []
    const tid = getCurrentTeamTid(currentDynasty)
    return (currentDynasty.players || [])
      .filter(p => isPlayerOnRoster(p, tid, year))
      .map(p => ({
        pid: p.pid,
        name: p.name || '',
        position: p.position || '',
        overall: getPlayerOverallForYear(p, year) ?? p.overall ?? null,
        classLabel: getPlayerClassForYear(p, year) || '',
      }))
      .sort((a, b) => (b.overall ?? 0) - (a.overall ?? 0))
  }, [currentDynasty, year])

  const saveBattles = async (newBattles) => {
    setSaving(true)
    try {
      const cur = currentDynasty.positionBattlesByYear || {}
      await updateDynasty(currentDynasty.id, { positionBattlesByYear: { ...cur, [year]: newBattles } })
    } finally {
      setSaving(false)
    }
  }

  const handleAutoPopulate = async () => {
    setAutoPopulating(true)
    try {
      const existingPositions = new Set(battles.map(b => b.position))
      const byPosition = {}
      for (const p of rosterPlayers) {
        if (!byPosition[p.position]) byPosition[p.position] = []
        byPosition[p.position].push(p)
      }
      const newBattles = []
      for (const [pos, players] of Object.entries(byPosition)) {
        if (existingPositions.has(pos) || players.length < 2) continue
        const attrs = getPresetAttrs('Default', pos, offenseScheme, defenseScheme)
        if (!attrs) continue
        const maxOvr = Math.max(...players.map(p => p.overall ?? 0))
        const competitive = players.filter(p => (p.overall ?? 0) >= maxOvr - 5)
        if (competitive.length < 2) continue
        newBattles.push({
          id: genId(),
          position: pos,
          preset: 'Default',
          keyAttributes: attrs,
          candidates: competitive.slice(0, 3).map(p => ({
            pid: p.pid, name: p.name, ovr: p.overall,
            attrScores: ['', '', '', '', ''], attrSubScores: {}, scrimmageScore: '',
            notes: '', hasEdge: false,
          })),
          winnerId: null,
        })
      }
      if (newBattles.length > 0) {
        newBattles.sort((a, b) => BATTLE_POSITIONS.indexOf(a.position) - BATTLE_POSITIONS.indexOf(b.position))
        await saveBattles([...battles, ...newBattles])
      }
    } finally {
      setAutoPopulating(false)
    }
  }

  const handleAddSave = async (draft) => {
    const valid = draft.candidates.filter(c => c.pid || c.name?.trim())
    if (valid.length < 2) return
    const attrs = getPresetAttrs(draft.preset, draft.position, offenseScheme, defenseScheme) || []
    await saveBattles([...battles, { ...draft, keyAttributes: attrs, candidates: valid }])
    setAddingNew(false)
  }

  const handleEditSave = async (draft) => {
    const valid = draft.candidates.filter(c => c.pid || c.name?.trim())
    if (valid.length < 2) return
    const pids = new Set(valid.map(c => c.pid).filter(Boolean))
    const winnerId = draft.winnerId && pids.has(draft.winnerId) ? draft.winnerId : null
    const attrs = getPresetAttrs(draft.preset, draft.position, offenseScheme, defenseScheme) || draft.keyAttributes || []
    await saveBattles(battles.map(b => b.id === draft.id ? { ...draft, keyAttributes: attrs, candidates: valid, winnerId } : b))
    setEditingId(null)
  }

  const handleDelete = (id) => saveBattles(battles.filter(b => b.id !== id))
  const handleSetWinner = async (id, pid) => {
    const battle = battles.find(b => b.id === id)
    await saveBattles(battles.map(b => b.id === id ? { ...b, winnerId: pid } : b))
    if (battle && pid) {
      // Update depth chart — promote winner to starter slot
      const tid = getCurrentTeamTid(currentDynasty)
      const plan = currentDynasty?.teamFuture?.[tid] || {}
      const tileKey = `pid:${pid}`
      const existing = plan.order?.[battle.position] || []
      const newOrder = [tileKey, ...existing.filter(k => k !== tileKey)]
      await saveTeamFuture(currentDynasty.id, tid, {
        ...plan,
        order: { ...(plan.order || {}), [battle.position]: newOrder },
      })
      // Record starter in dynasty-level startersByYear so Player.jsx can
      // read it without a separate updatePlayer call (avoids stale-closure
      // issues with sequential awaits).
      // Shape: dynasty.startersByYear[year][position] = { pid, week }
      const curStarters = currentDynasty?.startersByYear?.[year] || {}
      await updateDynasty(currentDynasty.id, {
        startersByYear: {
          ...(currentDynasty?.startersByYear || {}),
          [year]: { ...curStarters, [battle.position]: { pid, week: week ?? null } },
        },
      })
    }
  }
  const handleClearWinner = async (id) => {
    const battle = battles.find(b => b.id === id)
    await saveBattles(battles.map(b => b.id === id ? { ...b, winnerId: null } : b))
    if (battle?.winnerId != null) {
      const curStarters = { ...(currentDynasty?.startersByYear?.[year] || {}) }
      delete curStarters[battle.position]
      await updateDynasty(currentDynasty.id, {
        startersByYear: {
          ...(currentDynasty?.startersByYear || {}),
          [year]: curStarters,
        },
      })
    }
  }
  const handleToggleEdge = (battleId, pid) => saveBattles(battles.map(b => {
    if (b.id !== battleId) return b
    return { ...b, candidates: b.candidates.map(c => c.pid === pid ? { ...c, hasEdge: !c.hasEdge } : c) }
  }))

  const resolvedCount = battles.filter(b => b.winnerId).length
  const pendingCount = battles.length - resolvedCount
  const canAddBattles = !isViewOnly && (!!offenseScheme || !!defenseScheme)
  const missingOffense = !offenseScheme
  const missingDefense = !defenseScheme

  // Navigate to depth chart to set the missing scheme
  const goToScheme = (side) => {
    const tid = getCurrentTeamTid(currentDynasty)
    const yr = currentDynasty?.currentYear
    navigate(`${pathPrefix}/team/${tid}/${yr}?tab=depthchart&side=${side}`)
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Fall Camp · Position Battles</span>
          {battles.length > 0 && (
            <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
              {resolvedCount} named · {pendingCount} undecided
            </span>
          )}
        </div>
        {!isViewOnly && !addingNew && !editingId && (
          <div className="flex items-center gap-2">
            {battles.length > 0 && (
              confirmingReset ? (
                <>
                  <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Reset all battles?</span>
                  <button
                    type="button"
                    onClick={() => { saveBattles([]); setConfirmingReset(false) }}
                    className="text-sm px-3 py-1.5 rounded border font-semibold"
                    style={{ borderColor: 'var(--surface-4)', backgroundColor: 'var(--surface-3)', color: 'var(--text-primary)' }}
                  >
                    Confirm
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmingReset(false)}
                    className="text-sm px-3 py-1.5 rounded border"
                    style={{ borderColor: 'var(--surface-4)', color: 'var(--text-tertiary)' }}
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmingReset(true)}
                  className="text-sm px-3 py-1.5 rounded border"
                  style={{ borderColor: 'var(--surface-4)', color: 'var(--text-tertiary)' }}
                >
                  Reset
                </button>
              )
            )}
            {canAddBattles && !confirmingReset && (
              <>
                <button
                  type="button"
                  onClick={handleAutoPopulate}
                  disabled={autoPopulating || saving}
                  className="text-sm px-3 py-1.5 rounded border disabled:opacity-40"
                  style={{ borderColor: 'var(--surface-4)', backgroundColor: 'var(--surface-2)', color: 'var(--text-secondary)' }}
                >
                  {autoPopulating ? 'Scanning...' : 'Auto-populate'}
                </button>
                <button
                  type="button"
                  onClick={() => setAddingNew(true)}
                  className="text-sm px-3 py-1.5 rounded border font-semibold"
                  style={{ borderColor: 'var(--surface-4)', backgroundColor: 'var(--surface-3)', color: 'var(--text-primary)' }}
                >
                  Add Battle
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Scheme missing banner */}
      {!isViewOnly && (missingOffense || missingDefense) && (
        <div className="px-4 py-3 rounded-lg flex items-start justify-between gap-4" style={{ backgroundColor: 'var(--surface-2)', border: '1px solid var(--surface-4)' }}>
          <div>
            <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Scheme required for PBS scoring</p>
            <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
              {missingOffense && missingDefense
                ? 'No offense or defense scheme set.'
                : missingOffense ? 'No offense scheme set.'
                : 'No defense scheme set.'}
              {' '}Set your scheme in the Depth Chart tab to unlock attribute-based grading.
            </p>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            {missingOffense && (
              <button type="button" onClick={() => goToScheme('offense')} className="text-xs font-semibold px-3 py-1.5 rounded border" style={{ borderColor: 'var(--surface-4)', backgroundColor: 'var(--surface-3)', color: 'var(--text-primary)' }}>
                Set Offense
              </button>
            )}
            {missingDefense && (
              <button type="button" onClick={() => goToScheme('defense')} className="text-xs font-semibold px-3 py-1.5 rounded border" style={{ borderColor: 'var(--surface-4)', backgroundColor: 'var(--surface-3)', color: 'var(--text-primary)' }}>
                Set Defense
              </button>
            )}
          </div>
        </div>
      )}

      {/* Add form */}
      {addingNew && (
        <BattleForm
          initial={emptyBattle()}
          offenseScheme={offenseScheme}
          defenseScheme={defenseScheme}
          rosterPlayers={rosterPlayers}
          onSave={handleAddSave}
          onCancel={() => setAddingNew(false)}
        />
      )}

      {/* Battle list */}
      {battles.length === 0 && !addingNew ? (
        <Card>
          <EmptyState
            title="No position battles yet"
            message={
              isViewOnly
                ? "The dynasty owner hasn't set up position battles for this offseason."
                : canAddBattles
                  ? 'Use Auto-populate to pull in all competitive position groups, or add battles manually.'
                  : 'Set your offense and defense scheme in the Depth Chart tab first.'
            }
            action={canAddBattles && (
              <div className="flex gap-2 justify-center flex-wrap">
                <button
                  type="button"
                  onClick={handleAutoPopulate}
                  disabled={autoPopulating}
                  className="px-4 py-2 text-sm font-semibold rounded-lg border disabled:opacity-40"
                  style={{ borderColor: 'var(--surface-4)', backgroundColor: 'var(--surface-3)', color: 'var(--text-primary)' }}
                >
                  {autoPopulating ? 'Scanning roster...' : 'Auto-populate from Roster'}
                </button>
                <button
                  type="button"
                  onClick={() => setAddingNew(true)}
                  className="px-4 py-2 text-sm font-semibold rounded-lg"
                  style={{ backgroundColor: 'var(--text-primary)', color: 'var(--surface-1)' }}
                >
                  Add Manually
                </button>
              </div>
            )}
          />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {battles.map(battle =>
            editingId === battle.id ? (
              <BattleForm
                key={battle.id}
                initial={battle}
                offenseScheme={offenseScheme}
                defenseScheme={defenseScheme}
                rosterPlayers={rosterPlayers}
                onSave={handleEditSave}
                onCancel={() => setEditingId(null)}
              />
            ) : (
              <BattleCard
                key={battle.id}
                battle={battle}
                rosterPlayers={rosterPlayers}
                pathPrefix={pathPrefix}
                onEdit={setEditingId}
                onDelete={handleDelete}
                onSetWinner={handleSetWinner}
                onClearWinner={handleClearWinner}
                onToggleEdge={handleToggleEdge}
                isViewOnly={isViewOnly}
              />
            )
          )}
        </div>
      )}
    </div>
  )
}
