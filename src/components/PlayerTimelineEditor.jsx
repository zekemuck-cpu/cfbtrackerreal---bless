import { useState, useMemo } from 'react'
import { getTidFromAbbr, getAbbrFromTid, TEAMS } from '../data/teamRegistry'

/**
 * PlayerTimelineEditor - A visual, intuitive timeline editor for player careers
 *
 * This component unifies the old "Career Timeline" and "Team History (Stints)"
 * into a single, easy-to-understand interface.
 *
 * Key principles:
 * - Visual timeline that users can understand at a glance
 * - Direct manipulation (click to edit)
 * - Clear status indicators
 * - Single source of truth (teamHistory/stints)
 */

// Reason display names
const REASON_LABELS = {
  graduation: 'Graduated',
  transfer: 'Transferred Out',
  encouraged_transfer: 'Encouraged Transfer',
  draft: 'Declared for Draft',
  departure: 'Left Team',
  cut: 'Cut from Roster',
  entered_portal: 'Entered Portal',
  other: 'Other'
}

// Entry type labels
const ENTRY_LABELS = {
  recruited: 'Recruited',
  portal_in: 'Portal Transfer',
  juco_in: 'JUCO Transfer',
  added: 'Added to Roster',
  transfer: 'Transferred In'
}

// Class progression
const CLASSES = ['Fr', 'RS Fr', 'So', 'RS So', 'Jr', 'RS Jr', 'Sr', 'RS Sr']

// Searchable team dropdown component
function TeamSelector({ value, onChange, teams, placeholder = "Select team..." }) {
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState('')

  // Get all teams for dropdown
  const allTeams = useMemo(() => {
    const teamList = []
    // Add dynasty teams first (includes teambuilder replacements)
    if (teams) {
      Object.entries(teams).forEach(([tid, team]) => {
        if (team && team.abbr) {
          teamList.push({
            tid: Number(tid),
            abbr: team.abbr,
            name: team.name || team.school,
            logo: team.logo || team.logoUrl
          })
        }
      })
    }
    // Add standard teams not in dynasty (TEAMS is an object keyed by tid)
    Object.entries(TEAMS).forEach(([tid, team]) => {
      const tidNum = Number(tid)
      if (!teamList.some(t => t.tid === tidNum) && team && team.abbr) {
        teamList.push({
          tid: tidNum,
          abbr: team.abbr || team.abbreviation,
          name: team.name || team.school,
          logo: team.logo || team.logoUrl
        })
      }
    })
    return teamList.sort((a, b) => (a.name || '').localeCompare(b.name || ''))
  }, [teams])

  // Filter teams based on search
  const filteredTeams = useMemo(() => {
    if (!search) return allTeams.slice(0, 20)
    const searchLower = search.toLowerCase()
    return allTeams.filter(t =>
      t.name?.toLowerCase().includes(searchLower) ||
      t.abbr?.toLowerCase().includes(searchLower)
    ).slice(0, 20)
  }, [allTeams, search])

  // Get current team display
  const currentTeam = useMemo(() => {
    if (!value) return null
    const tid = typeof value === 'number' ? value : getTidFromAbbr(value)
    return allTeams.find(t => t.tid === tid)
  }, [value, allTeams])

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-lg text-left hover:border-gray-300 transition-colors"
      >
        {currentTeam ? (
          <>
            {currentTeam.logo && (
              <img src={currentTeam.logo} alt="" className="w-5 h-5 object-contain" />
            )}
            <span className="text-sm font-medium text-gray-900">{currentTeam.abbr}</span>
            <span className="text-xs text-gray-500 truncate">{currentTeam.name}</span>
          </>
        ) : (
          <span className="text-sm text-gray-400">{placeholder}</span>
        )}
        <svg className="w-4 h-4 ml-auto text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-64 overflow-hidden">
            <div className="p-2 border-b border-gray-100">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search teams..."
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400"
                autoFocus
              />
            </div>
            <div className="max-h-48 overflow-y-auto">
              {filteredTeams.map(team => (
                <button
                  key={team.tid}
                  type="button"
                  onClick={() => {
                    onChange(team.tid)
                    setIsOpen(false)
                    setSearch('')
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 transition-colors"
                >
                  {team.logo && (
                    <img src={team.logo} alt="" className="w-5 h-5 object-contain" />
                  )}
                  <span className="text-sm font-medium text-gray-900">{team.abbr}</span>
                  <span className="text-xs text-gray-500 truncate">{team.name}</span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// Single stint card component
function StintCard({
  stint,
  index,
  isFirst,
  isLast,
  teams,
  currentYear,
  onUpdate,
  onDelete,
  primaryColor,
  onAddStintAfter,
  classByYear = {},
  overallByYear = {}
}) {
  const [isEditing, setIsEditing] = useState(false)
  const [editData, setEditData] = useState(stint)

  const isOpen = stint.toYear === null || stint.toYear === undefined
  const isCurrent = isOpen || stint.toYear >= currentYear

  // Get team info - robust lookup with multiple fallbacks
  const getTeamInfo = (tid) => {
    if (!tid && tid !== 0) {
      return { name: 'Unknown', abbr: '???', logo: null }
    }

    // Try multiple lookup methods for maximum compatibility
    const tidNum = Number(tid)
    const tidStr = String(tid)

    // Helper to check if team object has actual data
    const isValidTeam = (t) => t && (t.name || t.school || t.abbr)

    // Try from dynasty teams prop (handles teambuilder replacements)
    let team = teams?.[tidNum] || teams?.[tidStr]

    // If dynasty team is empty/invalid, fall back to TEAMS registry
    if (!isValidTeam(team) && TEAMS) {
      team = TEAMS[tidNum] || TEAMS[tidStr]
    }

    if (isValidTeam(team)) {
      return {
        name: team.name || team.school || 'Unknown',
        abbr: team.abbr || team.abbreviation || '???',
        logo: team.logo || team.logoUrl
      }
    }

    // Last resort: show the tid number so user knows something is there
    return { name: `Team ${tid}`, abbr: String(tid), logo: null }
  }

  const teamInfo = getTeamInfo(stint.teamTid)

  // Calculate years at team
  const yearsAtTeam = isOpen
    ? currentYear - stint.fromYear + 1
    : stint.toYear - stint.fromYear + 1

  // Get all years for this stint
  const stintYears = []
  const endYear = isOpen ? currentYear : stint.toYear
  for (let y = stint.fromYear; y <= endYear; y++) {
    stintYears.push(y)
  }

  const handleSave = () => {
    onUpdate(index, editData)
    setIsEditing(false)
  }

  const handleCancel = () => {
    setEditData(stint)
    setIsEditing(false)
  }

  if (isEditing) {
    return (
      <div className="relative">
        {/* Edit mode */}
        <div className="bg-white rounded-xl border-2 border-blue-400 shadow-lg p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-gray-700">Edit Stint</h4>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleCancel}
                className="px-3 py-1 text-sm text-gray-600 hover:text-gray-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                className="px-3 py-1 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600"
              >
                Save
              </button>
            </div>
          </div>

          {/* Team selector */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Team</label>
            <TeamSelector
              value={editData.teamTid}
              onChange={(tid) => setEditData(prev => ({ ...prev, teamTid: tid }))}
              teams={teams}
            />
          </div>

          {/* Year range */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">From Year</label>
              <input
                type="number"
                value={editData.fromYear || ''}
                onChange={(e) => setEditData(prev => ({ ...prev, fromYear: parseInt(e.target.value) || null }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white text-gray-900"
                placeholder="2024"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">To Year</label>
              <div className="flex items-center gap-2">
                {editData.toYear === null || editData.toYear === undefined ? (
                  <button
                    type="button"
                    onClick={() => setEditData(prev => ({ ...prev, toYear: currentYear }))}
                    className="flex-1 px-3 py-2 bg-green-100 text-green-700 rounded-lg text-sm font-medium"
                  >
                    Present (Active)
                  </button>
                ) : (
                  <>
                    <input
                      type="number"
                      value={editData.toYear || ''}
                      onChange={(e) => setEditData(prev => ({ ...prev, toYear: parseInt(e.target.value) || null }))}
                      className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white text-gray-900"
                      placeholder="2026"
                    />
                    <button
                      type="button"
                      onClick={() => setEditData(prev => ({ ...prev, toYear: null, reason: null }))}
                      className="px-2 py-2 text-green-600 hover:bg-green-50 rounded-lg"
                      title="Mark as active (present)"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Entry type (for first stint) */}
          {isFirst && (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">How they joined</label>
              <select
                value={editData.entryType || 'recruited'}
                onChange={(e) => setEditData(prev => ({ ...prev, entryType: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white text-gray-900"
              >
                {Object.entries(ENTRY_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
          )}

          {/* Exit reason (if stint is closed) */}
          {editData.toYear !== null && editData.toYear !== undefined && (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Reason for leaving</label>
              <select
                value={editData.reason || ''}
                onChange={(e) => setEditData(prev => ({ ...prev, reason: e.target.value || null }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white text-gray-900"
              >
                <option value="">Select reason...</option>
                {Object.entries(REASON_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
          )}

          {/* Delete button */}
          <div className="pt-2 border-t border-gray-100">
            <button
              type="button"
              onClick={() => onDelete(index)}
              className="w-full px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Delete this stint
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="relative">
      {/* Timeline connector */}
      {!isFirst && (
        <div className="absolute -top-4 left-6 w-0.5 h-4 bg-gray-300" />
      )}

      {/* Stint card */}
      <div
        className={`relative rounded-xl border-2 transition-all cursor-pointer hover:shadow-md ${
          isCurrent
            ? 'bg-gradient-to-r from-green-50 to-emerald-50 border-green-300'
            : 'bg-white border-gray-200 hover:border-gray-300'
        }`}
        onClick={() => setIsEditing(true)}
      >
        {/* Current indicator */}
        {isCurrent && isOpen && (
          <div className="absolute -top-2 -right-2 px-2 py-0.5 bg-green-500 text-white text-xs font-bold rounded-full shadow">
            ACTIVE
          </div>
        )}

        <div className="p-4">
          <div className="flex items-start gap-4">
            {/* Team logo */}
            <div className="flex-shrink-0 w-14 h-14 rounded-xl bg-white shadow-sm border border-gray-100 flex items-center justify-center overflow-hidden">
              {teamInfo.logo ? (
                <img src={teamInfo.logo} alt={teamInfo.abbr} className="w-10 h-10 object-contain" />
              ) : (
                <span className="text-lg font-bold text-gray-400">{teamInfo.abbr?.substring(0, 2)}</span>
              )}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-gray-900">{teamInfo.name}</h3>
                <span className="text-sm text-gray-500">({teamInfo.abbr})</span>
              </div>

              {/* Years */}
              <div className="flex items-center gap-2 mt-1">
                <span className="text-sm text-gray-600">
                  {stint.fromYear} {isOpen ? '- Present' : `- ${stint.toYear}`}
                </span>
                <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">
                  {yearsAtTeam} {yearsAtTeam === 1 ? 'year' : 'years'}
                </span>
              </div>

              {/* Entry/Exit badges */}
              <div className="flex flex-wrap items-center gap-2 mt-2">
                {isFirst && stint.entryType && (
                  <span className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded-full font-medium">
                    {ENTRY_LABELS[stint.entryType] || stint.entryType}
                  </span>
                )}
                {!isOpen && stint.reason && (
                  <span className="text-xs px-2 py-1 bg-amber-100 text-amber-700 rounded-full font-medium">
                    {REASON_LABELS[stint.reason] || stint.reason}
                  </span>
                )}
              </div>

              {/* Class and overall progression for each year */}
              {stintYears.length > 0 && (Object.keys(classByYear).length > 0 || Object.keys(overallByYear).length > 0) && (
                <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-gray-100">
                  {stintYears.map(year => {
                    const playerClass = classByYear[year] || classByYear[String(year)]
                    const playerOvr = overallByYear[year] || overallByYear[String(year)]
                    if (!playerClass && !playerOvr) return null
                    return (
                      <span
                        key={year}
                        className="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded font-medium"
                      >
                        {year}: {playerClass || '-'}{playerOvr ? ` (${playerOvr})` : ''}
                      </span>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Edit indicator */}
            <div className="flex-shrink-0 text-gray-400">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* Add stint button between cards */}
      {!isLast && (
        <div className="flex justify-center py-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onAddStintAfter(index)
            }}
            className="px-3 py-1 text-xs text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-full transition-colors flex items-center gap-1"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add stint here
          </button>
        </div>
      )}

      {/* Bottom connector */}
      {!isLast && (
        <div className="absolute -bottom-4 left-6 w-0.5 h-4 bg-gray-300" />
      )}
    </div>
  )
}

export default function PlayerTimelineEditor({
  teamHistory = [],
  onChange,
  teams,
  currentYear,
  primaryColor = '#3b82f6',
  playerName,
  classByYear = {},
  overallByYear = {}
}) {
  const [showAddForm, setShowAddForm] = useState(false)
  const [newStint, setNewStint] = useState({
    teamTid: null,
    fromYear: currentYear,
    toYear: null,
    entryType: 'recruited',
    reason: null
  })

  // Sort stints by fromYear
  const sortedStints = useMemo(() => {
    return [...teamHistory].sort((a, b) => (a.fromYear || 0) - (b.fromYear || 0))
  }, [teamHistory])

  const handleUpdateStint = (index, updatedStint) => {
    // Find the actual index in the original array
    const originalIndex = teamHistory.findIndex(s =>
      s.teamTid === sortedStints[index].teamTid &&
      s.fromYear === sortedStints[index].fromYear
    )
    if (originalIndex === -1) return

    const newHistory = [...teamHistory]
    newHistory[originalIndex] = updatedStint
    onChange(newHistory)
  }

  const handleDeleteStint = (index) => {
    const originalIndex = teamHistory.findIndex(s =>
      s.teamTid === sortedStints[index].teamTid &&
      s.fromYear === sortedStints[index].fromYear
    )
    if (originalIndex === -1) return

    const newHistory = teamHistory.filter((_, i) => i !== originalIndex)
    onChange(newHistory)
  }

  const handleAddStint = () => {
    if (!newStint.teamTid || !newStint.fromYear) return

    const stintToAdd = {
      ...newStint,
      teamTid: Number(newStint.teamTid)
    }

    onChange([...teamHistory, stintToAdd])
    setNewStint({
      teamTid: null,
      fromYear: currentYear,
      toYear: null,
      entryType: teamHistory.length === 0 ? 'recruited' : 'transfer',
      reason: null
    })
    setShowAddForm(false)
  }

  const handleAddStintAfter = (afterIndex) => {
    const afterStint = sortedStints[afterIndex]
    const nextStint = sortedStints[afterIndex + 1]

    // Calculate default years for new stint
    const fromYear = afterStint.toYear ? afterStint.toYear + 1 : currentYear
    const toYear = nextStint ? nextStint.fromYear - 1 : null

    setNewStint({
      teamTid: null,
      fromYear,
      toYear,
      entryType: 'transfer',
      reason: null
    })
    setShowAddForm(true)
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-gray-900">Career Timeline</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Click any stint to edit. Each stint represents time at a team.
          </p>
        </div>
      </div>

      {/* Timeline */}
      {sortedStints.length === 0 ? (
        <div className="text-center py-8 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">
          <svg className="w-12 h-12 mx-auto text-gray-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
          <p className="text-sm text-gray-500 mb-3">No career history yet</p>
          <button
            type="button"
            onClick={() => setShowAddForm(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add First Team
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {sortedStints.map((stint, index) => (
            <StintCard
              key={`${stint.teamTid}-${stint.fromYear}-${index}`}
              stint={stint}
              index={index}
              isFirst={index === 0}
              isLast={index === sortedStints.length - 1}
              teams={teams}
              currentYear={currentYear}
              onUpdate={handleUpdateStint}
              onDelete={handleDeleteStint}
              primaryColor={primaryColor}
              onAddStintAfter={handleAddStintAfter}
              classByYear={classByYear}
              overallByYear={overallByYear}
            />
          ))}
        </div>
      )}

      {/* Add new stint button (at bottom) */}
      {sortedStints.length > 0 && !showAddForm && (
        <button
          type="button"
          onClick={() => {
            const lastStint = sortedStints[sortedStints.length - 1]
            setNewStint({
              teamTid: null,
              fromYear: lastStint.toYear ? lastStint.toYear + 1 : currentYear,
              toYear: null,
              entryType: 'transfer',
              reason: null
            })
            setShowAddForm(true)
          }}
          className="w-full py-3 border-2 border-dashed border-gray-300 rounded-xl text-gray-500 hover:border-blue-400 hover:text-blue-500 hover:bg-blue-50 transition-all flex items-center justify-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          <span className="font-medium">Add New Stint</span>
        </button>
      )}

      {/* Add stint form */}
      {showAddForm && (
        <div className="bg-blue-50 rounded-xl border-2 border-blue-200 p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-blue-800">Add New Stint</h4>
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="text-blue-400 hover:text-blue-600"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-blue-700 mb-1">Team</label>
              <TeamSelector
                value={newStint.teamTid}
                onChange={(tid) => setNewStint(prev => ({ ...prev, teamTid: tid }))}
                teams={teams}
                placeholder="Select team..."
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-blue-700 mb-1">From Year</label>
              <input
                type="number"
                value={newStint.fromYear || ''}
                onChange={(e) => setNewStint(prev => ({ ...prev, fromYear: parseInt(e.target.value) || null }))}
                className="w-full px-3 py-2 border border-blue-200 rounded-lg text-sm bg-white text-gray-900"
                placeholder="2024"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-blue-700 mb-1">To Year</label>
              <div className="flex items-center gap-2">
                {newStint.toYear === null ? (
                  <button
                    type="button"
                    onClick={() => setNewStint(prev => ({ ...prev, toYear: currentYear }))}
                    className="flex-1 px-3 py-2 bg-green-100 text-green-700 rounded-lg text-sm font-medium border border-green-200"
                  >
                    Present (Active)
                  </button>
                ) : (
                  <>
                    <input
                      type="number"
                      value={newStint.toYear || ''}
                      onChange={(e) => setNewStint(prev => ({ ...prev, toYear: parseInt(e.target.value) || null }))}
                      className="flex-1 px-3 py-2 border border-blue-200 rounded-lg text-sm bg-white text-gray-900"
                      placeholder="2026"
                    />
                    <button
                      type="button"
                      onClick={() => setNewStint(prev => ({ ...prev, toYear: null }))}
                      className="px-2 py-2 text-green-600 hover:bg-green-100 rounded-lg border border-green-200"
                      title="Mark as active"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </button>
                  </>
                )}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-blue-700 mb-1">How they joined</label>
              <select
                value={newStint.entryType || 'recruited'}
                onChange={(e) => setNewStint(prev => ({ ...prev, entryType: e.target.value }))}
                className="w-full px-3 py-2 border border-blue-200 rounded-lg text-sm bg-white text-gray-900"
              >
                {Object.entries(ENTRY_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>

            {newStint.toYear !== null && (
              <div>
                <label className="block text-xs font-medium text-blue-700 mb-1">Reason for leaving</label>
                <select
                  value={newStint.reason || ''}
                  onChange={(e) => setNewStint(prev => ({ ...prev, reason: e.target.value || null }))}
                  className="w-full px-3 py-2 border border-blue-200 rounded-lg text-sm bg-white text-gray-900"
                >
                  <option value="">Select reason...</option>
                  {Object.entries(REASON_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleAddStint}
              disabled={!newStint.teamTid || !newStint.fromYear}
              className="px-4 py-2 text-sm bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Add Stint
            </button>
          </div>
        </div>
      )}

      {/* Help text */}
      <div className="text-xs text-gray-400 bg-gray-50 rounded-lg p-3">
        <p className="font-medium text-gray-500 mb-1">Quick Tips:</p>
        <ul className="space-y-0.5 list-disc list-inside">
          <li>Each stint = time at one team</li>
          <li>"Active" = currently on roster</li>
          <li>Click a stint card to edit details</li>
          <li>Use "Add stint here" between cards for transfers</li>
        </ul>
      </div>
    </div>
  )
}
