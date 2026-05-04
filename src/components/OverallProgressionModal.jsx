import { useState } from 'react'

/**
 * OverallProgressionModal — clean, monochrome view of a player's
 * year-over-year overall rating. Green is the only accent color, used
 * exclusively for positive year-over-year changes; everything else
 * (ratings, decreases, deltas of zero) renders as neutral text so the
 * eye locks onto the upgrades.
 */
export default function OverallProgressionModal({
  isOpen,
  onClose,
  player,
  currentYear,
  onSave,
}) {
  const [editingYear, setEditingYear] = useState(null)
  const [editValue, setEditValue] = useState('')
  const [saving, setSaving] = useState(false)

  if (!isOpen || !player) return null

  // Build progression history from teamsByYear / classByYear / overallByYear.
  const buildProgressionHistory = () => {
    const yearsSet = new Set()
    Object.keys(player.teamsByYear || {}).forEach(y => {
      const year = Number(y); if (!isNaN(year)) yearsSet.add(year)
    })
    Object.keys(player.classByYear || {}).forEach(y => {
      const year = Number(y); if (!isNaN(year)) yearsSet.add(year)
    })
    Object.keys(player.overallByYear || {}).forEach(y => {
      const year = Number(y); if (!isNaN(year)) yearsSet.add(year)
    })

    const rosterYears = Array.from(yearsSet).sort((a, b) => a - b)
    if (rosterYears.length === 0) {
      if (currentYear) {
        return [{
          year: currentYear,
          overall: player.overall ? parseInt(player.overall) : null,
          playerClass: player.year || '—',
        }]
      }
      return []
    }

    return rosterYears.map(year => {
      const playerClass =
        player.classByYear?.[year] ||
        player.classByYear?.[String(year)] ||
        player.year ||
        '—'
      let overall = player.overallByYear?.[year] || player.overallByYear?.[String(year)]
      if (overall == null && year === rosterYears[rosterYears.length - 1]) {
        overall = player.overall
      }
      return {
        year,
        overall: overall != null ? parseInt(overall) : null,
        playerClass,
      }
    })
  }

  const progression = buildProgressionHistory()
  const entriesWithOveralls = progression.filter(p => p.overall !== null)

  const startOverall = entriesWithOveralls.length > 0 ? entriesWithOveralls[0].overall : null
  const endOverall =
    entriesWithOveralls.length > 0
      ? entriesWithOveralls[entriesWithOveralls.length - 1].overall
      : (player.overall ? parseInt(player.overall) : null)
  const careerChange =
    entriesWithOveralls.length >= 2
      ? entriesWithOveralls[entriesWithOveralls.length - 1].overall - entriesWithOveralls[0].overall
      : null

  const handleEdit = (year, overall) => {
    setEditingYear(year)
    setEditValue(overall ? String(overall) : '')
  }

  const handleSave = async () => {
    if (!onSave || editingYear === null) return
    const newOverall = parseInt(editValue)
    if (isNaN(newOverall) || newOverall < 1 || newOverall > 99) return
    setSaving(true)
    try {
      const newOverallByYear = { ...(player.overallByYear || {}) }
      newOverallByYear[editingYear] = newOverall
      const updates = { overallByYear: newOverallByYear }
      if (editingYear === currentYear) updates.overall = newOverall
      await onSave(player, updates)
      setEditingYear(null)
      setEditValue('')
    } catch (err) {
      console.error('Failed to save overall:', err)
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = () => {
    setEditingYear(null)
    setEditValue('')
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleSave()
    else if (e.key === 'Escape') handleCancel()
  }

  // Tiny pill for a +N year-over-year jump. Neutral pill for 0 / negative
  // so the eye only catches actual upgrades.
  const ChangePill = ({ delta }) => {
    if (delta == null || delta === 0) return null
    const positive = delta > 0
    return (
      <span
        className="text-xs font-semibold px-1.5 py-0.5 rounded tabular-nums"
        style={{
          backgroundColor: positive ? 'rgba(34, 197, 94, 0.15)' : 'rgba(255, 255, 255, 0.06)',
          color: positive ? '#4ade80' : 'var(--text-tertiary)',
        }}
      >
        {positive ? '+' : ''}{delta}
      </span>
    )
  }

  return (
    <div
      className="fixed inset-0 top-0 left-0 right-0 bottom-0 bg-black/60 flex items-center justify-center z-[9999] p-4"
      style={{ margin: 0 }}
      onClick={onClose}
    >
      <div
        className="rounded-xl shadow-2xl w-full max-w-sm overflow-hidden"
        style={{
          backgroundColor: 'var(--surface-2)',
          border: '1px solid var(--surface-4)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header — title + close. No colored tile, no chrome. */}
        <header
          className="px-5 py-4 flex items-start justify-between gap-3"
          style={{ borderBottom: '1px solid var(--surface-4)' }}
        >
          <div className="min-w-0">
            <h2 className="text-base font-bold text-txt-primary leading-tight truncate">
              {player.name} Overall Progression
            </h2>
            <div className="text-xs text-txt-tertiary mt-1 truncate">
              {[player.position, player.year].filter(Boolean).join(' · ')}
            </div>
          </div>
          <button
            aria-label="Close"
            onClick={onClose}
            className="w-7 h-7 flex-shrink-0 flex items-center justify-center rounded-md text-txt-tertiary hover:text-txt-primary hover:bg-surface-3 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </header>

        {/* Career change summary — only shown when we have ≥2 anchored years */}
        {careerChange !== null && (
          <div
            className="px-5 py-3 flex items-center justify-between"
            style={{ borderBottom: '1px solid var(--surface-4)' }}
          >
            <span className="text-xs uppercase tracking-wider text-txt-tertiary" style={{ letterSpacing: '1.5px' }}>
              Career Change
            </span>
            <div className="flex items-center gap-2 tabular-nums">
              <span className="text-txt-tertiary">{startOverall}</span>
              <span className="text-txt-tertiary text-xs">→</span>
              <span className="text-txt-primary font-semibold">{endOverall}</span>
              <ChangePill delta={careerChange} />
            </div>
          </div>
        )}

        {/* Year-by-year list */}
        <div className="max-h-72 overflow-y-auto">
          {progression.length > 0 ? (
            progression.map((entry, idx) => {
              const prevEntry = progression.slice(0, idx).reverse().find(p => p.overall != null)
              const change =
                prevEntry?.overall != null && entry.overall != null
                  ? entry.overall - prevEntry.overall
                  : null
              const isEditing = editingYear === entry.year

              return (
                <div
                  key={entry.year}
                  className={`px-5 py-3 flex items-center justify-between gap-3 ${
                    onSave && !isEditing ? 'hover:bg-surface-3 cursor-pointer' : ''
                  }`}
                  style={{
                    borderBottom: idx < progression.length - 1 ? '1px solid var(--surface-4)' : 'none',
                  }}
                  onClick={() => onSave && !isEditing && handleEdit(entry.year, entry.overall)}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-sm font-semibold text-txt-primary tabular-nums w-12">
                      {entry.year}
                    </span>
                    <span className="text-xs text-txt-tertiary truncate">
                      {entry.playerClass}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    {isEditing ? (
                      <>
                        <input
                          type="number"
                          min="1"
                          max="99"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onKeyDown={handleKeyDown}
                          className="w-14 px-2 py-1 text-center font-bold rounded text-txt-primary focus:outline-none tabular-nums"
                          style={{
                            backgroundColor: 'var(--surface-3)',
                            border: '1px solid var(--surface-5)',
                          }}
                          autoFocus
                          onClick={(e) => e.stopPropagation()}
                        />
                        <button
                          onClick={(e) => { e.stopPropagation(); handleSave() }}
                          disabled={saving}
                          className="p-1.5 rounded text-txt-primary hover:bg-surface-3 disabled:opacity-50"
                          aria-label="Save"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        </button>
                        <button
                          aria-label="Cancel"
                          onClick={(e) => { e.stopPropagation(); handleCancel() }}
                          className="p-1.5 rounded text-txt-tertiary hover:bg-surface-3 hover:text-txt-primary"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </>
                    ) : (
                      <>
                        <ChangePill delta={change} />
                        <span className="text-lg font-bold tabular-nums text-txt-primary min-w-[2ch] text-right">
                          {entry.overall ?? '—'}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              )
            })
          ) : (
            <div className="p-8 text-center text-txt-tertiary text-sm">
              No roster history available
            </div>
          )}
        </div>

        {onSave && progression.length > 0 && !editingYear && (
          <div
            className="px-5 py-2 text-center"
            style={{ borderTop: '1px solid var(--surface-4)' }}
          >
            <span className="text-xs text-txt-tertiary">Click any year to edit</span>
          </div>
        )}
      </div>
    </div>
  )
}
