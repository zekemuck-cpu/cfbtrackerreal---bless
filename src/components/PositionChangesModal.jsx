import { useState, useEffect, useRef } from 'react'
import { getContrastTextColor } from '../utils/colorUtils'

const POSITIONS = [
  'QB', 'HB', 'FB', 'WR', 'TE',
  'LT', 'LG', 'C', 'RG', 'RT',
  'LEDG', 'REDG', 'DT',
  'SAM', 'MIKE', 'WILL',
  'CB', 'FS', 'SS',
  'K', 'P'
]

// Searchable player input component
function PlayerSearchInput({ value, players, onSelect, teamColors, placeholder = "Search player..." }) {
  const [searchTerm, setSearchTerm] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const inputRef = useRef(null)
  const dropdownRef = useRef(null)

  // Get selected player name for display
  const selectedPlayer = players.find(p => String(p.pid) === String(value))

  // Filter players based on search term
  const filteredPlayers = searchTerm
    ? players.filter(p =>
        p.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.position?.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : players

  // Reset highlighted index when filtered results change
  useEffect(() => {
    setHighlightedIndex(0)
  }, [filteredPlayers.length])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleInputChange = (e) => {
    setSearchTerm(e.target.value)
    setIsOpen(true)
  }

  const handleSelectPlayer = (player) => {
    onSelect(player.pid)
    setSearchTerm('')
    setIsOpen(false)
  }

  const handleClear = () => {
    onSelect('')
    setSearchTerm('')
    setIsOpen(false)
  }

  const handleKeyDown = (e) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        setIsOpen(true)
      }
      return
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setHighlightedIndex(prev => Math.min(prev + 1, filteredPlayers.length - 1))
        break
      case 'ArrowUp':
        e.preventDefault()
        setHighlightedIndex(prev => Math.max(prev - 1, 0))
        break
      case 'Enter':
        e.preventDefault()
        if (filteredPlayers[highlightedIndex]) {
          handleSelectPlayer(filteredPlayers[highlightedIndex])
        }
        break
      case 'Escape':
        setIsOpen(false)
        setSearchTerm('')
        break
    }
  }

  return (
    <div className="relative" ref={dropdownRef}>
      {selectedPlayer ? (
        // Show selected player with clear button
        <div
          className="w-full px-3 py-3 rounded-lg border-2 flex items-center justify-between"
          style={{ borderColor: teamColors.primary, backgroundColor: '#fff' }}
        >
          <span className="font-medium">
            {selectedPlayer.name} <span className="text-gray-500">({selectedPlayer.position})</span>
          </span>
          <button
            onClick={handleClear}
            className="p-1 hover:bg-gray-100 rounded"
            type="button"
          >
            <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      ) : (
        // Show search input
        <input
          ref={inputRef}
          type="text"
          value={searchTerm}
          onChange={handleInputChange}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="w-full px-3 py-3 rounded-lg border-2 focus:outline-none text-base"
          style={{ borderColor: teamColors.primary, backgroundColor: '#fff' }}
        />
      )}

      {/* Dropdown */}
      {isOpen && !selectedPlayer && (
        <div
          className="absolute z-50 w-full mt-1 bg-white border-2 rounded-lg shadow-lg max-h-60 overflow-y-auto"
          style={{ borderColor: teamColors.primary }}
        >
          {filteredPlayers.length > 0 ? (
            filteredPlayers.map((player, idx) => (
              <div
                key={player.pid}
                onClick={() => handleSelectPlayer(player)}
                className={`px-3 py-2 cursor-pointer flex justify-between items-center ${
                  idx === highlightedIndex ? 'bg-gray-100' : 'hover:bg-gray-50'
                }`}
              >
                <span className="font-medium">{player.name}</span>
                <span
                  className="text-xs px-2 py-0.5 rounded font-semibold"
                  style={{ backgroundColor: `${teamColors.primary}20`, color: teamColors.primary }}
                >
                  {player.position}
                </span>
              </div>
            ))
          ) : (
            <div className="px-3 py-2 text-gray-500 text-sm">No players found</div>
          )}
        </div>
      )}
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
  const [positionChanges, setPositionChanges] = useState([{ playerId: '', oldPosition: '', newPosition: '' }])
  const [saving, setSaving] = useState(false)

  const primaryBgText = getContrastTextColor(teamColors.primary)
  const secondaryBgText = getContrastTextColor(teamColors.secondary)

  // Sort players alphabetically by name
  const sortedPlayers = [...players].sort((a, b) =>
    (a.name || '').localeCompare(b.name || '')
  )

  // Initialize with existing changes and auto-fill ATH players when modal opens
  useEffect(() => {
    if (isOpen) {
      // Map existing changes to the format used by the modal
      const mappedChanges = existingChanges.map(change => ({
        playerId: change.pid,
        playerName: change.playerName,
        oldPosition: change.oldPosition,
        newPosition: change.newPosition
      }))

      // Get IDs of players already in existing changes
      const existingPlayerIds = new Set(existingChanges.map(c => String(c.pid)))

      // Find ATH players not already in existing changes
      const athPlayers = players.filter(p =>
        p.position === 'ATH' && !existingPlayerIds.has(String(p.pid))
      )

      // Create entries for ATH players (they must pick a position)
      const athEntries = athPlayers.map(player => ({
        playerId: player.pid,
        playerName: player.name,
        oldPosition: 'ATH',
        newPosition: ''
      }))

      // Combine: existing changes + ATH auto-fills + empty entry for new additions
      const allEntries = [...mappedChanges, ...athEntries]

      // Always add an empty entry at the end for manual additions
      setPositionChanges([...allEntries, { playerId: '', oldPosition: '', newPosition: '' }])
    }
  }, [isOpen, existingChanges, players])

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'unset'
    }
    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [isOpen])

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

    // If this is the last entry and it's complete, add a new empty entry
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

    setSaving(true)
    try {
      await onSave(validChanges)
      onClose()
    } catch (error) {
      console.error('Failed to save position changes:', error)
      alert('Failed to save position changes. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const validChangesCount = positionChanges.filter(
    change => change.playerId && change.newPosition && change.newPosition !== change.oldPosition
  ).length

  // Get players that haven't been selected yet
  const getAvailablePlayers = (currentIndex) => {
    const selectedIds = positionChanges
      .filter((_, i) => i !== currentIndex)
      .map(c => String(c.playerId))
      .filter(Boolean)
    return sortedPlayers.filter(p => !selectedIds.includes(String(p.pid)))
  }

  return (
    <div
      className="fixed inset-0 top-0 left-0 right-0 bottom-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999] p-4"
      style={{ margin: 0 }}
      onMouseDown={onClose}
    >
      <div
        className="rounded-lg shadow-xl w-full max-w-4xl flex flex-col"
        style={{
          backgroundColor: teamColors.secondary,
          height: '90vh',
          maxHeight: '90vh'
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="p-4 rounded-t-lg flex justify-between items-center flex-shrink-0"
          style={{ backgroundColor: teamColors.primary }}
        >
          <h2 className="text-xl font-bold" style={{ color: primaryBgText }}>
            Position Changes
          </h2>
          <button
            onClick={onClose}
            className="text-2xl font-bold hover:opacity-70"
            style={{ color: primaryBgText }}
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <p className="text-sm mb-6" style={{ color: secondaryBgText, opacity: 0.7 }}>
            Select players and assign their new positions. Changes will be saved to the roster.
          </p>

          {/* Position Changes Table */}
          <div className="space-y-4">
            {/* Header Row */}
            <div className="grid grid-cols-12 gap-4 px-4 py-2 font-semibold text-sm" style={{ color: secondaryBgText }}>
              <div className="col-span-5">Player</div>
              <div className="col-span-2 text-center">Current</div>
              <div className="col-span-1"></div>
              <div className="col-span-3 text-center">New Position</div>
              <div className="col-span-1"></div>
            </div>

            {positionChanges.map((change, index) => (
              <div
                key={index}
                className="grid grid-cols-12 gap-4 items-center p-4 rounded-lg border-2"
                style={{
                  borderColor: change.playerId ? `${teamColors.primary}60` : `${teamColors.primary}30`,
                  backgroundColor: change.playerId ? `${teamColors.primary}10` : 'transparent'
                }}
              >
                {/* Player Search */}
                <div className="col-span-5">
                  <PlayerSearchInput
                    value={change.playerId}
                    players={getAvailablePlayers(index)}
                    onSelect={(playerId) => handlePlayerSelect(index, playerId)}
                    teamColors={teamColors}
                    placeholder="Type to search player..."
                  />
                </div>

                {/* Old Position */}
                <div className="col-span-2">
                  {change.oldPosition ? (
                    <div
                      className="px-4 py-3 rounded-lg font-bold text-center text-lg"
                      style={{ backgroundColor: `${teamColors.primary}25`, color: teamColors.primary }}
                    >
                      {change.oldPosition}
                    </div>
                  ) : (
                    <div className="px-4 py-3 rounded-lg text-center text-gray-400 border-2 border-dashed border-gray-300">
                      —
                    </div>
                  )}
                </div>

                {/* Arrow */}
                <div className="col-span-1 flex justify-center">
                  <svg
                    className="w-6 h-6"
                    fill="none"
                    stroke={change.playerId ? teamColors.primary : '#9CA3AF'}
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                  </svg>
                </div>

                {/* New Position Dropdown */}
                <div className="col-span-3">
                  <select
                    value={change.newPosition}
                    onChange={(e) => handleNewPositionSelect(index, e.target.value)}
                    disabled={!change.playerId}
                    className="w-full px-3 py-3 rounded-lg border-2 focus:outline-none font-bold text-center text-lg disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{
                      borderColor: teamColors.primary,
                      color: change.newPosition ? teamColors.primary : '#6B7280',
                      backgroundColor: '#fff'
                    }}
                  >
                    <option value="">Select...</option>
                    {POSITIONS.filter(p => p !== change.oldPosition).map(pos => (
                      <option key={pos} value={pos}>{pos}</option>
                    ))}
                  </select>
                </div>

                {/* Remove Button */}
                <div className="col-span-1 flex justify-center">
                  {(positionChanges.length > 1 || change.playerId) && (
                    <button
                      onClick={() => handleRemoveEntry(index)}
                      className="p-2 rounded-lg hover:bg-red-100 text-red-500 hover:text-red-700 transition-colors"
                      title="Remove"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            ))}

            {/* Add Another Button */}
            <button
              onClick={handleAddEntry}
              className="w-full py-3 rounded-lg border-2 border-dashed font-semibold hover:opacity-80 transition-opacity flex items-center justify-center gap-2"
              style={{
                borderColor: `${teamColors.primary}50`,
                color: teamColors.primary
              }}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Another Position Change
            </button>
          </div>
        </div>

        {/* Footer */}
        <div
          className="p-4 rounded-b-lg flex justify-between items-center flex-shrink-0"
          style={{ borderTop: `2px solid ${teamColors.primary}30` }}
        >
          <span className="text-sm font-medium" style={{ color: secondaryBgText }}>
            {validChangesCount} position change{validChangesCount !== 1 ? 's' : ''} to save
          </span>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-5 py-2 rounded-lg font-semibold hover:opacity-80"
              style={{ backgroundColor: '#e5e7eb', color: '#374151' }}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-5 py-2 rounded-lg font-semibold hover:opacity-90 disabled:opacity-50"
              style={{ backgroundColor: teamColors.primary, color: primaryBgText }}
            >
              {saving ? 'Saving...' : (validChangesCount > 0 ? 'Save Changes' : 'Close')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
