import { useState } from 'react'
import { getContrastTextColor } from '../utils/colorUtils'

export default function OverallProgressionModal({
  isOpen,
  onClose,
  player,
  teamColors,
  currentYear,
  onSave
}) {
  const [editingYear, setEditingYear] = useState(null)
  const [editValue, setEditValue] = useState('')
  const [saving, setSaving] = useState(false)

  if (!isOpen || !player) return null

  const primaryText = getContrastTextColor(teamColors.primary)

  // Build progression history from teamsByYear (source of truth)
  const buildProgressionHistory = () => {
    const history = []
    const yearsSet = new Set()

    // Include years from teamsByYear
    const teamsByYear = player.teamsByYear || {}
    Object.keys(teamsByYear).forEach(y => {
      const year = Number(y)
      if (!isNaN(year)) yearsSet.add(year)
    })

    // Also include years from classByYear (might have years not in teamsByYear)
    const classByYear = player.classByYear || {}
    Object.keys(classByYear).forEach(y => {
      const year = Number(y)
      if (!isNaN(year)) yearsSet.add(year)
    })

    // Also include years from overallByYear
    const overallByYear = player.overallByYear || {}
    Object.keys(overallByYear).forEach(y => {
      const year = Number(y)
      if (!isNaN(year)) yearsSet.add(year)
    })

    const rosterYears = Array.from(yearsSet).sort((a, b) => a - b)

    if (rosterYears.length === 0) {
      // Fallback: if no years found, show current year with current overall
      if (currentYear) {
        history.push({
          year: currentYear,
          overall: player.overall ? parseInt(player.overall) : null,
          playerClass: player.year || '—'
        })
      }
      return history
    }

    // For each year, get their class and overall
    rosterYears.forEach(year => {
      const playerClass = player.classByYear?.[year] || player.classByYear?.[String(year)] || player.year || '—'

      // Get overall from overallByYear (single source of truth)
      let overall = player.overallByYear?.[year] || player.overallByYear?.[String(year)]

      // If no overallByYear entry, use current overall for the most recent year only
      if (overall == null && year === rosterYears[rosterYears.length - 1]) {
        overall = player.overall
      }

      history.push({
        year,
        overall: overall != null ? parseInt(overall) : null,
        playerClass
      })
    })

    return history
  }

  const progression = buildProgressionHistory()
  const entriesWithOveralls = progression.filter(p => p.overall !== null)

  const getOverallChange = () => {
    if (entriesWithOveralls.length < 2) return null
    return entriesWithOveralls[entriesWithOveralls.length - 1].overall - entriesWithOveralls[0].overall
  }

  const overallChange = getOverallChange()
  const startOverall = entriesWithOveralls.length > 0 ? entriesWithOveralls[0].overall : null
  const currentOverall = entriesWithOveralls.length > 0
    ? entriesWithOveralls[entriesWithOveralls.length - 1].overall
    : (player.overall ? parseInt(player.overall) : null)

  const getOverallColor = (ovr) => {
    if (!ovr) return '#9ca3af'
    if (ovr >= 85) return '#22c55e'
    if (ovr >= 75) return '#3b82f6'
    if (ovr >= 65) return '#f59e0b'
    return '#ef4444'
  }

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
      // Build the new overallByYear object
      const newOverallByYear = { ...(player.overallByYear || {}) }
      newOverallByYear[editingYear] = newOverall

      // Also update current overall if editing current/most recent year
      const updates = { overallByYear: newOverallByYear }
      if (editingYear === currentYear) {
        updates.overall = newOverall
      }

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
    if (e.key === 'Enter') {
      handleSave()
    } else if (e.key === 'Escape') {
      handleCancel()
    }
  }

  return (
    <div
      className="fixed inset-0 top-0 left-0 right-0 bottom-0 bg-black/50 flex items-center justify-center z-[9999] p-4"
      style={{ margin: 0 }}
      onClick={onClose}
    >
      <div
        className="rounded-xl shadow-2xl w-full max-w-sm overflow-hidden"
        style={{ backgroundColor: '#1a1a1a' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 border-b border-white/10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className="w-12 h-12 rounded-lg flex items-center justify-center font-bold text-xl text-white"
                style={{ backgroundColor: getOverallColor(currentOverall) }}
              >
                {currentOverall || '—'}
              </div>
              <div>
                <h2 className="text-white font-semibold">{player.name}</h2>
                <div className="text-sm text-txt-muted">
                  {player.position} • {player.year}
                </div>
              </div>
            </div>
            <button aria-label="Close"
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/10 text-txt-muted hover:text-white transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Career Change Summary - only show if multiple years */}
        {overallChange !== null && (
          <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
            <span className="text-sm text-txt-muted">Career Change</span>
            <div className="flex items-center gap-2">
              <span className="text-txt-muted">{startOverall}</span>
              <svg className="w-4 h-4 text-txt-tertiary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
              <span className="text-white font-medium">{currentOverall}</span>
              <span
                className="text-sm font-semibold px-2 py-0.5 rounded"
                style={{
                  backgroundColor: overallChange > 0 ? 'rgba(34, 197, 94, 0.2)' : overallChange < 0 ? 'rgba(239, 68, 68, 0.2)' : 'rgba(156, 163, 175, 0.2)',
                  color: overallChange > 0 ? '#22c55e' : overallChange < 0 ? '#ef4444' : '#9ca3af'
                }}
              >
                {overallChange > 0 ? '+' : ''}{overallChange}
              </span>
            </div>
          </div>
        )}

        {/* Year-by-Year List */}
        <div className="max-h-64 overflow-y-auto">
          {progression.length > 0 ? (
            progression.map((entry, idx) => {
              const prevEntry = progression.slice(0, idx).reverse().find(p => p.overall != null)
              const change = (prevEntry?.overall != null && entry.overall != null)
                ? entry.overall - prevEntry.overall
                : null
              const isEditing = editingYear === entry.year

              return (
                <div
                  key={entry.year}
                  className={`px-4 py-3 flex items-center justify-between border-b border-white/5 last:border-b-0 ${
                    onSave && !isEditing ? 'hover:bg-white/5 cursor-pointer' : ''
                  }`}
                  onClick={() => onSave && !isEditing && handleEdit(entry.year, entry.overall)}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-12 text-center">
                      <div className="text-white font-medium">{entry.year}</div>
                    </div>
                    <div className="text-sm text-txt-muted">{entry.playerClass}</div>
                  </div>

                  <div className="flex items-center gap-2">
                    {isEditing ? (
                      <>
                        <input
                          type="number"
                          min="1"
                          max="99"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onKeyDown={handleKeyDown}
                          className="w-14 px-2 py-1 text-center font-bold rounded bg-white/10 border border-white/20 text-white focus:outline-none focus:border-blue-500"
                          autoFocus
                          onClick={(e) => e.stopPropagation()}
                        />
                        <button
                          onClick={(e) => { e.stopPropagation(); handleSave() }}
                          disabled={saving}
                          className="p-1.5 rounded bg-green-500/20 text-green-400 hover:bg-green-500/30 disabled:opacity-50"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        </button>
                        <button aria-label="Close"
                          onClick={(e) => { e.stopPropagation(); handleCancel() }}
                          className="p-1.5 rounded bg-white/10 text-txt-muted hover:bg-white/20"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </>
                    ) : (
                      <>
                        {change !== null && change !== 0 && (
                          <span
                            className="text-xs font-medium px-1.5 py-0.5 rounded"
                            style={{
                              backgroundColor: change > 0 ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                              color: change > 0 ? '#22c55e' : '#ef4444'
                            }}
                          >
                            {change > 0 ? '+' : ''}{change}
                          </span>
                        )}
                        <span
                          className="text-lg font-bold min-w-[2ch] text-right"
                          style={{ color: getOverallColor(entry.overall) }}
                        >
                          {entry.overall ?? '—'}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              )
            })
          ) : (
            <div className="p-8 text-center text-txt-muted">
              No roster history available
            </div>
          )}
        </div>

        {/* Footer hint */}
        {onSave && progression.length > 0 && !editingYear && (
          <div className="px-4 py-2 border-t border-white/10 text-center">
            <span className="text-xs text-txt-muted">Click any year to edit</span>
          </div>
        )}
      </div>
    </div>
  )
}
