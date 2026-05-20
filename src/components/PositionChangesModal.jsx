import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { getContrastTextColor } from '../utils/colorUtils'
import { useToast } from './ui/Toast'

const POSITIONS = [
  'QB', 'HB', 'FB', 'WR', 'TE',
  'LT', 'LG', 'C', 'RG', 'RT',
  'LEDG', 'REDG', 'DT',
  'SAM', 'MIKE', 'WILL',
  'CB', 'FS', 'SS',
  'K', 'P'
]

// Position selector — custom dropdown with viewport-aware positioning
function PositionSelector({ value, onChange, disabled, excludePosition, primaryColor }) {
  const [isOpen, setIsOpen] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const [dropdownPos, setDropdownPos] = useState(null)
  const containerRef = useRef(null)
  const dropdownId = useRef(`pos-dropdown-${Math.random().toString(36).substr(2, 9)}`).current

  const availablePositions = POSITIONS.filter(p => p !== excludePosition)

  const updatePosition = () => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect()
      const viewportHeight = window.innerHeight
      const dropdownHeight = Math.min(256, availablePositions.length * 40)
      const spaceBelow = viewportHeight - rect.bottom - 8
      const spaceAbove = rect.top - 8
      const openUpward = spaceBelow < dropdownHeight && spaceAbove > spaceBelow

      setDropdownPos({
        left: rect.left,
        width: rect.width,
        ...(openUpward
          ? { bottom: viewportHeight - rect.top + 4, maxHeight: Math.min(dropdownHeight, spaceAbove) }
          : { top: rect.bottom + 4, maxHeight: Math.min(dropdownHeight, spaceBelow) }
        )
      })
    }
  }

  useEffect(() => {
    if (isOpen) {
      updatePosition()
      const currentIdx = availablePositions.indexOf(value)
      setHighlightedIndex(currentIdx >= 0 ? currentIdx : 0)
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return

    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        const dropdown = document.getElementById(dropdownId)
        if (dropdown && dropdown.contains(e.target)) return
        setIsOpen(false)
      }
    }

    const handleScroll = () => updatePosition()

    document.addEventListener('mousedown', handleClickOutside)
    window.addEventListener('scroll', handleScroll, true)
    window.addEventListener('resize', handleScroll)

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      window.removeEventListener('scroll', handleScroll, true)
      window.removeEventListener('resize', handleScroll)
    }
  }, [isOpen])

  useEffect(() => {
    if (isOpen && highlightedIndex >= 0) {
      const dropdown = document.getElementById(dropdownId)
      const highlighted = dropdown?.querySelector(`[data-index="${highlightedIndex}"]`)
      if (highlighted) {
        highlighted.scrollIntoView({ block: 'nearest' })
      }
    }
  }, [highlightedIndex, isOpen])

  const handleKeyDown = (e) => {
    if (disabled) return

    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        setIsOpen(true)
      }
      return
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setHighlightedIndex(prev => Math.min(prev + 1, availablePositions.length - 1))
        break
      case 'ArrowUp':
        e.preventDefault()
        setHighlightedIndex(prev => Math.max(prev - 1, 0))
        break
      case 'Enter':
      case ' ':
        e.preventDefault()
        if (availablePositions[highlightedIndex]) {
          onChange(availablePositions[highlightedIndex])
          setIsOpen(false)
        }
        break
      case 'Tab':
        if (availablePositions[highlightedIndex]) {
          onChange(availablePositions[highlightedIndex])
        }
        setIsOpen(false)
        break
      case 'Escape':
        setIsOpen(false)
        break
    }
  }

  const handleSelect = (pos) => {
    onChange(pos)
    setIsOpen(false)
  }

  const renderDropdown = () => {
    if (!isOpen || !dropdownPos) return null

    return createPortal(
      <div
        id={dropdownId}
        className="fixed z-[10000] bg-surface-2 border border-surface-5 rounded-lg shadow-2xl overflow-y-auto"
        style={dropdownPos}
      >
        {availablePositions.map((pos, idx) => {
          const isSelected = pos === value
          const isHighlighted = idx === highlightedIndex
          return (
            <div
              key={pos}
              data-index={idx}
              onClick={() => handleSelect(pos)}
              className={`px-3 py-2 cursor-pointer text-center font-semibold transition-colors text-txt-primary ${
                isHighlighted ? 'bg-surface-4' : 'hover:bg-surface-3'
              }`}
              style={isSelected ? { backgroundColor: primaryColor, color: getContrastTextColor(primaryColor) } : undefined}
            >
              {pos}
            </div>
          )
        })}
      </div>,
      document.body
    )
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        className={`w-full px-3 py-2 rounded-lg border font-semibold text-center flex items-center justify-center gap-1 transition-colors ${
          disabled
            ? 'bg-surface-3 border-surface-4 text-txt-tertiary cursor-not-allowed'
            : 'bg-surface-2 border-surface-5 text-txt-primary hover:bg-surface-3'
        }`}
      >
        <span>{value || 'Select…'}</span>
        <svg className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {renderDropdown()}
    </div>
  )
}

export default function PositionChangesModal({
  isOpen,
  onClose,
  onSave,
  players = [],
  existingChanges = [],
  teamColors
}) {
  const { toast } = useToast()
  const [positionChanges, setPositionChanges] = useState([{ playerId: '', oldPosition: '', newPosition: '' }])
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)

  const primaryColor = teamColors?.primary || 'var(--text-primary)'
  const primaryBgText = getContrastTextColor(primaryColor)

  const sortedPlayers = [...players].sort((a, b) =>
    (a.name || '').localeCompare(b.name || '')
  )

  useEffect(() => {
    if (isOpen && !savingRef.current) {
      const mappedChanges = existingChanges.map(change => ({
        playerId: change.pid,
        playerName: change.playerName,
        oldPosition: change.oldPosition,
        newPosition: change.newPosition
      }))

      const existingPlayerIds = new Set(existingChanges.map(c => String(c.pid)))

      const athPlayers = players.filter(p =>
        p.position === 'ATH' && !existingPlayerIds.has(String(p.pid))
      )

      const athEntries = athPlayers.map(player => ({
        playerId: player.pid,
        playerName: player.name,
        oldPosition: 'ATH',
        newPosition: ''
      }))

      const allEntries = [...mappedChanges, ...athEntries]
      setPositionChanges([...allEntries, { playerId: '', oldPosition: '', newPosition: '' }])
    }
  }, [isOpen, existingChanges, players])

  if (!isOpen) return null

  const handlePlayerSelect = (index, playerId) => {
    const player = players.find(p => String(p.pid) === String(playerId))
    const newChanges = [...positionChanges]

    if (player) {
      newChanges[index] = {
        playerId: player.pid,
        playerName: player.name,
        oldPosition: player.position,
        newPosition: ''
      }
    } else {
      newChanges[index] = { playerId: '', oldPosition: '', newPosition: '' }
    }

    setPositionChanges(newChanges)
  }

  const handleNewPositionSelect = (index, position) => {
    const newChanges = [...positionChanges]
    newChanges[index].newPosition = position
    setPositionChanges(newChanges)

    if (index === positionChanges.length - 1 && position && newChanges[index].playerId) {
      setPositionChanges([...newChanges, { playerId: '', oldPosition: '', newPosition: '' }])
    }
  }

  const handleRemoveEntry = (index) => {
    if (positionChanges.length === 1) {
      setPositionChanges([{ playerId: '', oldPosition: '', newPosition: '' }])
    } else {
      setPositionChanges(positionChanges.filter((_, i) => i !== index))
    }
  }

  const handleAddEntry = () => {
    setPositionChanges([...positionChanges, { playerId: '', oldPosition: '', newPosition: '' }])
  }

  const handleSave = async () => {
    const validChanges = positionChanges.filter(
      change => change.playerId && change.newPosition && change.newPosition !== change.oldPosition
    )

    if (validChanges.length === 0) {
      onClose()
      return
    }

    savingRef.current = true
    setSaving(true)
    try {
      await onSave(validChanges)
      onClose()
    } catch (error) {
      console.error('Failed to save position changes:', error)
      toast.error('Failed to save position changes. Please try again.')
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  const validChangesCount = positionChanges.filter(
    change => change.playerId && change.newPosition && change.newPosition !== change.oldPosition
  ).length

  const getAvailablePlayers = (currentIndex) => {
    const selectedIds = positionChanges
      .filter((_, i) => i !== currentIndex)
      .map(c => String(c.playerId))
      .filter(Boolean)
    return sortedPlayers.filter(p => !selectedIds.includes(String(p.pid)))
  }

  return (
    <div
      className="fixed inset-0 top-0 left-0 right-0 bottom-0 bg-black bg-opacity-70 flex items-center justify-center z-[9999] p-4"
      style={{ margin: 0 }}
      onMouseDown={onClose}
    >
      <div
        className="bg-surface-1 rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col border border-surface-4"
        style={{ maxHeight: '85vh' }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header — accent bar in team color, dark surface body */}
        <div className="rounded-t-2xl flex-shrink-0 overflow-hidden">
          <div className="h-1" style={{ backgroundColor: primaryColor }} aria-hidden />
          <div className="px-5 py-4 bg-surface-2 flex justify-between items-start">
            <div>
              <h2 className="text-xl font-bold text-txt-primary">Position Changes</h2>
              <p className="text-sm mt-1 text-txt-tertiary">Update player positions for your roster</p>
            </div>
            <button
              aria-label="Close"
              onClick={onClose}
              className="p-2 -mr-2 -mt-1 rounded-lg hover:bg-surface-3 text-txt-tertiary hover:text-txt-primary transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {positionChanges.map((change, index) => (
            <div
              key={index}
              className={`rounded-xl p-4 transition-colors ${
                change.playerId
                  ? 'bg-surface-2 border border-surface-4'
                  : 'bg-transparent border border-dashed border-surface-4'
              }`}
            >
              <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-end">
                {/* Player Select */}
                <div className="flex-1 min-w-0">
                  <label className="block text-[11px] font-semibold text-txt-tertiary mb-1.5 uppercase tracking-wider">Player</label>
                  <select
                    value={change.playerId || ''}
                    onChange={(e) => handlePlayerSelect(index, e.target.value)}
                    className="w-full px-3 py-2 bg-surface-2 rounded-lg border border-surface-5 text-txt-primary focus:outline-none appearance-none"
                  >
                    <option value="">Select player…</option>
                    {getAvailablePlayers(index).map(p => (
                      <option key={p.pid} value={p.pid}>
                        {p.name} ({p.position})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Position Change Display */}
                <div className="flex items-end gap-2">
                  {/* Old Position */}
                  <div className="w-20">
                    <label className="block text-[11px] font-semibold text-txt-tertiary mb-1.5 text-center uppercase tracking-wider">From</label>
                    <div
                      className={`px-2 py-2 rounded-lg font-bold text-center text-sm border ${
                        change.oldPosition
                          ? 'bg-surface-3 border-surface-4 text-txt-secondary'
                          : 'bg-transparent border-dashed border-surface-4 text-txt-tertiary'
                      }`}
                    >
                      {change.oldPosition || '—'}
                    </div>
                  </div>

                  {/* Arrow */}
                  <div className="flex items-center justify-center pb-2">
                    <svg
                      className="w-5 h-5 text-txt-tertiary"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                    </svg>
                  </div>

                  {/* New Position */}
                  <div className="w-28">
                    <label className="block text-[11px] font-semibold text-txt-tertiary mb-1.5 text-center uppercase tracking-wider">To</label>
                    <PositionSelector
                      value={change.newPosition}
                      onChange={(pos) => handleNewPositionSelect(index, pos)}
                      disabled={!change.playerId}
                      excludePosition={change.oldPosition}
                      primaryColor={primaryColor}
                    />
                  </div>

                  {/* Remove Button */}
                  <div className="pb-1">
                    {(positionChanges.length > 1 || change.playerId) && (
                      <button
                        onClick={() => handleRemoveEntry(index)}
                        className="p-2 rounded-lg text-txt-tertiary hover:bg-surface-3 hover:text-danger transition-colors"
                        title="Remove"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}

          {/* Add Another Button */}
          <button
            onClick={handleAddEntry}
            className="w-full py-3 rounded-xl border-2 border-dashed border-surface-4 text-txt-tertiary hover:border-surface-5 hover:text-txt-secondary hover:bg-surface-2 transition-all flex items-center justify-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            <span className="font-semibold">Add Another Player</span>
          </button>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-surface-4 flex-shrink-0 bg-surface-2 rounded-b-2xl">
          <div className="flex flex-col sm:flex-row justify-between items-center gap-3">
            <div className="flex items-center gap-2">
              {validChangesCount > 0 ? (
                <>
                  <div
                    className="w-2 h-2 rounded-full animate-pulse"
                    style={{ backgroundColor: primaryColor }}
                    aria-hidden
                  />
                  <span className="text-sm text-txt-secondary">
                    <span className="font-bold text-txt-primary">{validChangesCount}</span> change{validChangesCount !== 1 ? 's' : ''} ready
                  </span>
                </>
              ) : (
                <span className="text-sm text-txt-tertiary">No changes to save</span>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-lg font-semibold bg-surface-3 text-txt-secondary hover:bg-surface-4 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 rounded-lg font-semibold transition-all disabled:opacity-50"
                style={{
                  backgroundColor: primaryColor,
                  color: primaryBgText
                }}
              >
                {saving ? 'Saving…' : (validChangesCount > 0 ? 'Save Changes' : 'Done')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
