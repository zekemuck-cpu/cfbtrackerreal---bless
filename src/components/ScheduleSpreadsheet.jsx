import { useState, useRef, useEffect } from 'react'
import { getContrastTextColor } from '../utils/colorUtils'
import { teams, getTeamLogo } from '../data/teams'

function TeamDropdown({ value, onChange, onClose, teamColors, onTabSelect, onEnterSelect }) {
  const [search, setSearch] = useState(value || '')
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const [openUpward, setOpenUpward] = useState(false)
  const inputRef = useRef(null)
  const dropdownRef = useRef(null)

  const filteredTeams = teams.filter(team =>
    team.toLowerCase().includes(search.toLowerCase())
  ).slice(0, 50)

  useEffect(() => {
    inputRef.current?.focus()

    // Check if dropdown should open upward
    if (dropdownRef.current) {
      const rect = dropdownRef.current.getBoundingClientRect()
      const spaceBelow = window.innerHeight - rect.bottom
      const spaceAbove = rect.top
      const dropdownHeight = 200 // approximate max height of dropdown

      // Open upward if not enough space below but enough space above
      if (spaceBelow < dropdownHeight && spaceAbove > spaceBelow) {
        setOpenUpward(true)
      }
    }
  }, [])

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [onClose])

  const handleSelect = (team, navigationType = null) => {
    onChange(team)
    onClose()

    // Call appropriate navigation callback after a short delay to ensure state updates
    setTimeout(() => {
      if (navigationType === 'tab' && onTabSelect) {
        onTabSelect()
      } else if (navigationType === 'enter' && onEnterSelect) {
        onEnterSelect()
      }
    }, 0)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightedIndex(prev => Math.min(prev + 1, filteredTeams.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightedIndex(prev => Math.max(prev - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (filteredTeams[highlightedIndex]) {
        handleSelect(filteredTeams[highlightedIndex], 'enter')
      }
    } else if (e.key === 'Escape') {
      onClose()
    } else if (e.key === 'Tab') {
      e.preventDefault()
      if (filteredTeams[highlightedIndex]) {
        handleSelect(filteredTeams[highlightedIndex], 'tab')
      }
    }
  }

  return (
    <div ref={dropdownRef} className="absolute left-0 top-0 w-full z-50">
      {openUpward ? (
        <>
          <div
            className="bg-white border-2 border-b-0 shadow-lg max-h-48 overflow-y-auto mb-0"
            style={{
              borderColor: teamColors.primary,
              position: 'absolute',
              bottom: '100%',
              left: 0,
              right: 0
            }}
          >
            {filteredTeams.length === 0 ? (
              <div className="px-2 py-1 text-gray-500 text-sm">No teams found</div>
            ) : (
              filteredTeams.map((team, index) => {
                const logoUrl = getTeamLogo(team)
                return (
                  <div
                    key={team}
                    onClick={() => handleSelect(team)}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    className={`px-2 py-1 cursor-pointer text-sm flex items-center gap-2 ${
                      index === highlightedIndex ? 'text-white' : 'hover:bg-gray-100'
                    }`}
                    style={index === highlightedIndex ? { backgroundColor: teamColors.primary } : {}}
                  >
                    {logoUrl && (
                      <img
                        src={logoUrl}
                        alt={`${team} logo`}
                        className="w-5 h-5 object-contain flex-shrink-0"
                        onError={(e) => e.target.style.display = 'none'}
                      />
                    )}
                    <span className="truncate">{team}</span>
                  </div>
                )
              })
            )}
          </div>
          <input
            ref={inputRef}
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setHighlightedIndex(0)
            }}
            onKeyDown={handleKeyDown}
            className="w-full px-2 py-1 border-2 outline-none text-sm"
            style={{ borderColor: teamColors.primary }}
            placeholder="Search teams..."
          />
        </>
      ) : (
        <>
          <input
            ref={inputRef}
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setHighlightedIndex(0)
            }}
            onKeyDown={handleKeyDown}
            className="w-full px-2 py-1 border-2 outline-none text-sm"
            style={{ borderColor: teamColors.primary }}
            placeholder="Search teams..."
          />
          <div
            className="bg-white border-2 border-t-0 shadow-lg max-h-48 overflow-y-auto"
            style={{ borderColor: teamColors.primary }}
          >
            {filteredTeams.length === 0 ? (
              <div className="px-2 py-1 text-gray-500 text-sm">No teams found</div>
            ) : (
              filteredTeams.map((team, index) => {
                const logoUrl = getTeamLogo(team)
                return (
                  <div
                    key={team}
                    onClick={() => handleSelect(team)}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    className={`px-2 py-1 cursor-pointer text-sm flex items-center gap-2 ${
                      index === highlightedIndex ? 'text-white' : 'hover:bg-gray-100'
                    }`}
                    style={index === highlightedIndex ? { backgroundColor: teamColors.primary } : {}}
                  >
                    {logoUrl && (
                      <img
                        src={logoUrl}
                        alt={`${team} logo`}
                        className="w-5 h-5 object-contain flex-shrink-0"
                        onError={(e) => e.target.style.display = 'none'}
                      />
                    )}
                    <span className="truncate">{team}</span>
                  </div>
                )
              })
            )}
          </div>
        </>
      )}
    </div>
  )
}

export default function ScheduleSpreadsheet({ teamColors, currentYear, onSave, onCancel }) {
  const secondaryBgText = getContrastTextColor(teamColors.secondary)
  const primaryBgText = getContrastTextColor(teamColors.primary)

  const [rows, setRows] = useState(() =>
    Array.from({ length: 12 }, (_, i) => ({
      id: i + 1,
      week: i + 1,
      opponent: '',
      location: 'home'
    }))
  )

  const [editingCell, setEditingCell] = useState(null)
  const [selectedRow, setSelectedRow] = useState(null)
  const locationRefs = useRef({})
  const opponentRefs = useRef({})
  const tableRef = useRef(null)

  const updateRow = (id, field, value) => {
    setRows(rows.map(row =>
      row.id === id ? { ...row, [field]: value } : row
    ))
  }

  const handleTabNavigation = (currentRowId) => {
    // Move to location dropdown in the same row
    const locationSelect = locationRefs.current[currentRowId]
    if (locationSelect) {
      locationSelect.focus()
    }
  }

  const handleEnterNavigation = (currentRowId) => {
    // Move to next opponent cell
    const currentIndex = rows.findIndex(row => row.id === currentRowId)
    if (currentIndex < rows.length - 1) {
      const nextRow = rows[currentIndex + 1]
      setEditingCell(`opponent-${nextRow.id}`)
    }
  }

  const handleLocationKeyDown = (e, rowId) => {
    if (e.key === 'Tab' || e.key === 'Enter') {
      e.preventDefault()
      // Move to next row's opponent cell (down and left)
      const currentIndex = rows.findIndex(row => row.id === rowId)
      if (currentIndex < rows.length - 1) {
        const nextRow = rows[currentIndex + 1]
        setEditingCell(`opponent-${nextRow.id}`)
      }
    }
  }

  const handleAddRow = () => {
    const newId = Math.max(...rows.map(r => r.id)) + 1
    setRows([...rows, { id: newId, week: rows.length + 1, opponent: '', location: 'home' }])
  }

  const handleRemoveLastRow = () => {
    if (rows.length > 1) {
      setRows(rows.slice(0, -1))
    }
  }

  const handlePaste = (e) => {
    e.preventDefault()
    const pastedData = e.clipboardData.getData('text')
    const pastedRows = pastedData.split('\n').filter(row => row.trim())

    // Find starting row index
    const startIndex = selectedRow !== null ? rows.findIndex(r => r.id === selectedRow) : 0

    const updatedRows = [...rows]

    pastedRows.forEach((pastedRow, index) => {
      const rowIndex = startIndex + index
      if (rowIndex >= updatedRows.length) {
        // Add new row if needed
        const newId = Math.max(...updatedRows.map(r => r.id)) + 1
        updatedRows.push({ id: newId, week: updatedRows.length + 1, opponent: '', location: 'home' })
      }

      const cells = pastedRow.split('\t')

      // cells[0] might be week number, cells[1] is opponent, cells[2] is location
      if (cells.length >= 1) {
        const opponent = cells.length >= 2 ? cells[1].trim() : cells[0].trim()
        const location = cells.length >= 3 ? cells[2].toLowerCase().trim() : 'home'

        updatedRows[rowIndex] = {
          ...updatedRows[rowIndex],
          opponent: opponent,
          location: ['home', 'away', 'neutral'].includes(location) ? location : 'home'
        }
      }
    })

    setRows(updatedRows)
  }

  const handleSave = () => {
    const validGames = rows.filter(row => row.opponent && row.opponent.trim() !== '')

    if (validGames.length === 0) {
      alert('Please add at least one opponent')
      return
    }

    const schedule = validGames.map(row => ({
      week: row.week,
      opponent: row.opponent.trim(),
      location: row.location
    }))

    onSave(schedule)
  }

  return (
    <div className="flex flex-col">
      <div className="mb-4">
        <h3 className="text-lg font-semibold mb-1" style={{ color: secondaryBgText }}>
          {currentYear} Season Schedule
        </h3>
        <p className="text-sm" style={{ color: secondaryBgText, opacity: 0.7 }}>
          Click on opponent cells to select a team, or paste data from Excel/Sheets (Ctrl+V).
        </p>
      </div>

      <div
        ref={tableRef}
        className="border overflow-hidden mb-4 bg-white"
        style={{ borderColor: '#d1d5db' }}
        onPaste={handlePaste}
        tabIndex={0}
      >
        <table className="w-full border-collapse">
          <thead>
            <tr style={{ backgroundColor: teamColors.primary }}>
              <th className="px-3 py-2 text-left text-sm font-semibold w-16 border-r border-white/20" style={{ color: primaryBgText }}>Week</th>
              <th className="px-3 py-2 text-left text-sm font-semibold border-r border-white/20" style={{ color: primaryBgText }}>Opponent</th>
              <th className="px-3 py-2 text-left text-sm font-semibold w-32" style={{ color: primaryBgText }}>Location</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr
                key={row.id}
                className={`border-b border-gray-200 hover:bg-gray-50 ${selectedRow === row.id ? 'bg-blue-50' : ''}`}
                onClick={() => setSelectedRow(row.id)}
              >
                <td className="px-3 py-1 text-sm text-gray-600 border-r border-gray-200 text-center bg-gray-50">
                  {row.week}
                </td>
                <td className="px-0 py-0 relative border-r border-gray-200">
                  {editingCell === `opponent-${row.id}` ? (
                    <TeamDropdown
                      value={row.opponent}
                      onChange={(team) => updateRow(row.id, 'opponent', team)}
                      onClose={() => setEditingCell(null)}
                      teamColors={teamColors}
                      onTabSelect={() => handleTabNavigation(row.id)}
                      onEnterSelect={() => handleEnterNavigation(row.id)}
                    />
                  ) : (
                    <div
                      ref={(el) => opponentRefs.current[row.id] = el}
                      onClick={() => setEditingCell(`opponent-${row.id}`)}
                      className="px-2 py-1 cursor-pointer hover:bg-blue-50 h-full flex items-center gap-2 text-sm"
                    >
                      {row.opponent ? (
                        <>
                          {getTeamLogo(row.opponent) && (
                            <img
                              src={getTeamLogo(row.opponent)}
                              alt={`${row.opponent} logo`}
                              className="w-5 h-5 object-contain flex-shrink-0"
                              onError={(e) => e.target.style.display = 'none'}
                            />
                          )}
                          <span>{row.opponent}</span>
                        </>
                      ) : (
                        <span className="text-gray-400 text-xs">Click to select...</span>
                      )}
                    </div>
                  )}
                </td>
                <td className="px-0 py-0">
                  <select
                    ref={(el) => locationRefs.current[row.id] = el}
                    value={row.location}
                    onChange={(e) => updateRow(row.id, 'location', e.target.value)}
                    onKeyDown={(e) => handleLocationKeyDown(e, row.id)}
                    className="w-full h-full px-2 py-1 border-0 cursor-pointer bg-white text-gray-900 text-sm focus:bg-blue-50 focus:outline-none"
                  >
                    <option value="home">Home</option>
                    <option value="away">Away</option>
                    <option value="neutral">Neutral</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={handleAddRow}
          className="px-4 py-2 rounded-lg font-semibold hover:opacity-90 transition-colors text-sm"
          style={{
            backgroundColor: `${teamColors.primary}20`,
            color: teamColors.primary
          }}
        >
          + Add Week
        </button>
        <button
          onClick={handleRemoveLastRow}
          className="px-4 py-2 rounded-lg font-semibold hover:opacity-90 transition-colors text-sm"
          style={{
            backgroundColor: `${secondaryBgText}10`,
            color: secondaryBgText
          }}
          disabled={rows.length <= 1}
        >
          - Remove Week
        </button>
      </div>

      <div className="flex justify-end gap-3">
        <button
          onClick={onCancel}
          className="px-6 py-2 rounded-lg font-semibold hover:opacity-90 transition-colors"
          style={{
            backgroundColor: `${secondaryBgText}20`,
            color: secondaryBgText
          }}
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          className="px-6 py-2 rounded-lg font-semibold hover:opacity-90 transition-colors"
          style={{
            backgroundColor: teamColors.primary,
            color: primaryBgText
          }}
        >
          Save Schedule
        </button>
      </div>
    </div>
  )
}
