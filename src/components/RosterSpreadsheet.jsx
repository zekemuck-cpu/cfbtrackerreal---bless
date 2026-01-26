import { useState, useRef } from 'react'
import { getContrastTextColor } from '../utils/colorUtils'

const positions = ['QB', 'HB', 'FB', 'WR', 'TE', 'LT', 'LG', 'C', 'RG', 'RT', 'LEDG', 'REDG', 'DT', 'SAM', 'MIKE', 'WILL', 'CB', 'FS', 'SS', 'K', 'P']
const years = ['Fr', 'RS Fr', 'So', 'RS So', 'Jr', 'RS Jr', 'Sr', 'RS Sr']

export default function RosterSpreadsheet({ teamColors, onSave, onCancel }) {
  const secondaryBgText = getContrastTextColor(teamColors.secondary)
  const primaryBgText = getContrastTextColor(teamColors.primary)

  const [rows, setRows] = useState(() =>
    Array.from({ length: 25 }, (_, i) => ({
      id: i + 1,
      name: '',
      position: 'QB',
      year: 'Fr',
      jerseyNumber: '',
      overall: ''
    }))
  )

  const [editingCell, setEditingCell] = useState(null)
  const [selectedRow, setSelectedRow] = useState(null)
  const inputRefs = useRef({})
  const tableRef = useRef(null)

  const updateRow = (id, field, value) => {
    setRows(rows.map(row =>
      row.id === id ? { ...row, [field]: value } : row
    ))
  }

  const handleCellClick = (rowId, field) => {
    setEditingCell(`${field}-${rowId}`)
  }

  const handleKeyDown = (e, rowId, field) => {
    const currentIndex = rows.findIndex(row => row.id === rowId)

    if (e.key === 'Enter') {
      e.preventDefault()
      // Move down to the same field in the next row
      if (currentIndex < rows.length - 1) {
        const nextRow = rows[currentIndex + 1]
        setEditingCell(`${field}-${nextRow.id}`)
      }
    } else if (e.key === 'Tab' && !e.shiftKey) {
      e.preventDefault()
      // Move to next field in same row
      const fields = ['name', 'position', 'year', 'jerseyNumber', 'overall']
      const currentFieldIndex = fields.indexOf(field)
      if (currentFieldIndex < fields.length - 1) {
        setEditingCell(`${fields[currentFieldIndex + 1]}-${rowId}`)
      } else if (currentIndex < rows.length - 1) {
        // Move to first field of next row
        const nextRow = rows[currentIndex + 1]
        setEditingCell(`name-${nextRow.id}`)
      }
    } else if (e.key === 'Tab' && e.shiftKey) {
      e.preventDefault()
      // Move to previous field
      const fields = ['name', 'position', 'year', 'jerseyNumber', 'overall']
      const currentFieldIndex = fields.indexOf(field)
      if (currentFieldIndex > 0) {
        setEditingCell(`${fields[currentFieldIndex - 1]}-${rowId}`)
      } else if (currentIndex > 0) {
        // Move to last field of previous row
        const prevRow = rows[currentIndex - 1]
        setEditingCell(`overall-${prevRow.id}`)
      }
    }
  }

  const handleAddRow = () => {
    const newId = Math.max(...rows.map(r => r.id)) + 1
    setRows([...rows, { id: newId, name: '', position: 'QB', year: 'Fr', jerseyNumber: '', overall: '' }])
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
        updatedRows.push({ id: newId, name: '', position: 'QB', year: 'Fr', jerseyNumber: '', overall: '' })
      }

      const cells = pastedRow.split('\t')

      // Simple approach: just map columns directly
      // Assume format is: Name, Position, Year, Jersey #, Overall (or with row # at start)
      let nameIdx = 0
      let posIdx = 1
      let yearIdx = 2
      let jerseyIdx = 3
      let overallIdx = 4

      // If we have 6 columns and first looks like a number (row number), skip it
      if (cells.length >= 6 && !isNaN(cells[0])) {
        nameIdx = 1
        posIdx = 2
        yearIdx = 3
        jerseyIdx = 4
        overallIdx = 5
      }
      // If we have 5 columns (no jersey), handle that case
      else if (cells.length === 4) {
        overallIdx = 3
        jerseyIdx = -1 // No jersey column
      }

      const name = cells[nameIdx]?.trim() || ''
      const position = cells[posIdx]?.trim().toUpperCase() || 'QB'
      const year = cells[yearIdx]?.trim() || 'Fr'
      const jerseyNumber = jerseyIdx >= 0 ? (cells[jerseyIdx]?.trim() || '') : ''
      const overall = cells[overallIdx]?.trim() || ''


      updatedRows[rowIndex] = {
        ...updatedRows[rowIndex],
        name: name,
        position: positions.includes(position) ? position : 'QB',
        year: years.includes(year) ? year : 'Fr',
        jerseyNumber: jerseyNumber,
        overall: overall
      }
    })

    setRows(updatedRows)
  }

  const handleSave = () => {
    const validPlayers = rows.filter(row =>
      row.name && row.name.trim() !== '' && row.overall && row.overall.trim() !== ''
    )

    if (validPlayers.length === 0) {
      alert('Please add at least one player with name and overall rating')
      return
    }

    const players = validPlayers.map(row => ({
      id: `${Date.now()}-${row.id}`,
      name: row.name.trim(),
      position: row.position,
      year: row.year,
      jerseyNumber: row.jerseyNumber ? row.jerseyNumber.trim() : '',
      overall: row.overall
    }))

    onSave(players)
  }

  // Auto-focus when editing cell changes
  const cellKey = editingCell
  if (cellKey && inputRefs.current[cellKey]) {
    setTimeout(() => {
      inputRefs.current[cellKey]?.focus()
    }, 0)
  }

  return (
    <div className="flex flex-col">
      <div className="mb-4">
        <h3 className="text-lg font-semibold mb-1" style={{ color: secondaryBgText }}>
          Roster Entry
        </h3>
        <p className="text-sm" style={{ color: secondaryBgText, opacity: 0.7 }}>
          Click on cells to edit, or paste data from Excel/Sheets (Ctrl+V). Use Tab to move right, Enter to move down.
        </p>
      </div>

      <div
        ref={tableRef}
        className="border overflow-hidden mb-4 bg-white outline-none"
        style={{ borderColor: '#d1d5db' }}
        onPaste={handlePaste}
        tabIndex={0}
        onClick={() => tableRef.current?.focus()}
      >
        <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
          <table className="w-full border-collapse">
            <thead className="sticky top-0 z-10">
              <tr style={{ backgroundColor: teamColors.primary }}>
                <th className="px-3 py-2 text-left text-sm font-semibold w-12 border-r border-white/20" style={{ color: primaryBgText }}>#</th>
                <th className="px-3 py-2 text-left text-sm font-semibold border-r border-white/20" style={{ color: primaryBgText }}>Player Name</th>
                <th className="px-3 py-2 text-left text-sm font-semibold w-24 border-r border-white/20" style={{ color: primaryBgText }}>Position</th>
                <th className="px-3 py-2 text-left text-sm font-semibold w-20 border-r border-white/20" style={{ color: primaryBgText }}>Year</th>
                <th className="px-3 py-2 text-left text-sm font-semibold w-20 border-r border-white/20" style={{ color: primaryBgText }}>Jersey #</th>
                <th className="px-3 py-2 text-left text-sm font-semibold w-24" style={{ color: primaryBgText }}>Overall</th>
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
                    {idx + 1}
                  </td>
                  <td className="px-0 py-0 border-r border-gray-200">
                    {editingCell === `name-${row.id}` ? (
                      <input
                        ref={(el) => inputRefs.current[`name-${row.id}`] = el}
                        type="text"
                        value={row.name}
                        onChange={(e) => updateRow(row.id, 'name', e.target.value)}
                        onKeyDown={(e) => handleKeyDown(e, row.id, 'name')}
                        onBlur={() => setEditingCell(null)}
                        className="w-full px-2 py-1 border-2 outline-none text-sm"
                        style={{ borderColor: teamColors.primary }}
                      />
                    ) : (
                      <div
                        onClick={() => handleCellClick(row.id, 'name')}
                        className="px-2 py-1 cursor-pointer hover:bg-blue-50 h-full min-h-[32px] flex items-center text-sm"
                      >
                        {row.name || <span className="text-gray-400 text-xs">Click to edit...</span>}
                      </div>
                    )}
                  </td>
                  <td className="px-0 py-0 border-r border-gray-200">
                    {editingCell === `position-${row.id}` ? (
                      <select
                        ref={(el) => inputRefs.current[`position-${row.id}`] = el}
                        value={row.position}
                        onChange={(e) => updateRow(row.id, 'position', e.target.value)}
                        onKeyDown={(e) => handleKeyDown(e, row.id, 'position')}
                        onBlur={() => setEditingCell(null)}
                        className="w-full px-2 py-1 border-2 outline-none text-sm bg-white text-gray-900"
                        style={{ borderColor: teamColors.primary }}
                      >
                        {positions.map(pos => (
                          <option key={pos} value={pos}>{pos}</option>
                        ))}
                      </select>
                    ) : (
                      <div
                        onClick={() => handleCellClick(row.id, 'position')}
                        className="px-2 py-1 cursor-pointer hover:bg-blue-50 h-full min-h-[32px] flex items-center text-sm"
                      >
                        {row.position}
                      </div>
                    )}
                  </td>
                  <td className="px-0 py-0 border-r border-gray-200">
                    {editingCell === `year-${row.id}` ? (
                      <select
                        ref={(el) => inputRefs.current[`year-${row.id}`] = el}
                        value={row.year}
                        onChange={(e) => updateRow(row.id, 'year', e.target.value)}
                        onKeyDown={(e) => handleKeyDown(e, row.id, 'year')}
                        onBlur={() => setEditingCell(null)}
                        className="w-full px-2 py-1 border-2 outline-none text-sm bg-white text-gray-900"
                        style={{ borderColor: teamColors.primary }}
                      >
                        {years.map(yr => (
                          <option key={yr} value={yr}>{yr}</option>
                        ))}
                      </select>
                    ) : (
                      <div
                        onClick={() => handleCellClick(row.id, 'year')}
                        className="px-2 py-1 cursor-pointer hover:bg-blue-50 h-full min-h-[32px] flex items-center text-sm"
                      >
                        {row.year}
                      </div>
                    )}
                  </td>
                  <td className="px-0 py-0 border-r border-gray-200">
                    {editingCell === `jerseyNumber-${row.id}` ? (
                      <input
                        ref={(el) => inputRefs.current[`jerseyNumber-${row.id}`] = el}
                        type="text"
                        value={row.jerseyNumber}
                        onChange={(e) => updateRow(row.id, 'jerseyNumber', e.target.value)}
                        onKeyDown={(e) => handleKeyDown(e, row.id, 'jerseyNumber')}
                        onBlur={() => setEditingCell(null)}
                        className="w-full px-2 py-1 border-2 outline-none text-sm"
                        style={{ borderColor: teamColors.primary }}
                        maxLength="2"
                      />
                    ) : (
                      <div
                        onClick={() => handleCellClick(row.id, 'jerseyNumber')}
                        className="px-2 py-1 cursor-pointer hover:bg-blue-50 h-full min-h-[32px] flex items-center text-sm"
                      >
                        {row.jerseyNumber || <span className="text-gray-400 text-xs">--</span>}
                      </div>
                    )}
                  </td>
                  <td className="px-0 py-0">
                    {editingCell === `overall-${row.id}` ? (
                      <input
                        ref={(el) => inputRefs.current[`overall-${row.id}`] = el}
                        type="number"
                        min="40"
                        max="99"
                        value={row.overall}
                        onChange={(e) => updateRow(row.id, 'overall', e.target.value)}
                        onKeyDown={(e) => handleKeyDown(e, row.id, 'overall')}
                        onBlur={() => setEditingCell(null)}
                        className="w-full px-2 py-1 border-2 outline-none text-sm"
                        style={{ borderColor: teamColors.primary }}
                      />
                    ) : (
                      <div
                        onClick={() => handleCellClick(row.id, 'overall')}
                        className="px-2 py-1 cursor-pointer hover:bg-blue-50 h-full min-h-[32px] flex items-center text-sm"
                      >
                        {row.overall || <span className="text-gray-400 text-xs">--</span>}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
          + Add Row
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
          - Remove Row
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
          Save Roster
        </button>
      </div>
    </div>
  )
}
