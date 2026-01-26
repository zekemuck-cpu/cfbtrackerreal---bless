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

// Reason display names (for leaving a team)
const REASON_LABELS = {
  graduation: 'Graduated',
  pro_draft: 'Pro Draft',
  transfer_out: 'Transferred Out',
  encouraged_transfer: 'Encouraged to Transfer'
}

// Draft round options
const DRAFT_ROUNDS = ['1st Round', '2nd Round', '3rd Round', '4th Round', '5th Round', '6th Round', '7th Round', 'Undrafted FA']

// Entry type labels
const ENTRY_LABELS = {
  recruited: 'Recruited',
  portal_in: 'Portal Transfer',
  juco_in: 'JUCO Transfer',
  added: 'Added to Roster',
  transfer: 'Transferred In',
  recommit: 'Recommitted'  // Legacy - now uses portal_in with recommit detection at display time
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
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400 bg-white text-gray-900 placeholder-gray-400"
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
  overallByYear = {},
  onOverallChange
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
                      onClick={() => setEditData(prev => ({ ...prev, toYear: null, endReason: null }))}
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

          {/* Entry type / How they joined this team */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              {isFirst ? 'How they joined' : 'How they joined this stint'}
            </label>
            <select
              value={editData.reason || editData.entryType || 'recruited'}
              onChange={(e) => setEditData(prev => ({
                ...prev,
                reason: e.target.value,
                entryType: isFirst ? e.target.value : prev.entryType,
                // Clear transferFromTid if not a transfer type
                transferFromTid: ['portal_in', 'transfer', 'juco_in'].includes(e.target.value) ? prev.transferFromTid : null
              }))}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white text-gray-900"
            >
              {Object.entries(ENTRY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>

          {/* Transferred From (when portal_in, transfer, or juco_in) */}
          {['portal_in', 'transfer', 'juco_in'].includes(editData.reason || editData.entryType) && (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Transferred From</label>
              <TeamSelector
                value={editData.transferFromTid}
                onChange={(tid) => setEditData(prev => ({ ...prev, transferFromTid: tid }))}
                teams={teams}
                placeholder="Select previous team..."
              />
            </div>
          )}

          {/* Overall by Year editing */}
          {(() => {
            // Calculate years based on editData (not stint) so it updates as user edits
            const editFromYear = editData.fromYear
            // Fallback to current real year if currentYear prop is not provided
            const effectiveCurrentYear = currentYear || new Date().getFullYear()
            const editToYear = editData.toYear === null || editData.toYear === undefined ? effectiveCurrentYear : editData.toYear
            const editYears = []
            if (editFromYear && editToYear >= editFromYear) {
              for (let y = editFromYear; y <= Math.min(editToYear, editFromYear + 10); y++) {
                editYears.push(y)
              }
            }
            // If no years calculated but we have fromYear, at least show that year
            if (editYears.length === 0 && editFromYear) {
              editYears.push(editFromYear)
            }
            if (editYears.length === 0) return null
            return (
              <div className="bg-blue-50 rounded-lg p-3 border border-blue-200">
                <label className="block text-xs font-semibold text-blue-700 uppercase tracking-wide mb-2">Overall by Season</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {editYears.map(year => {
                    const isCurrentYear = year === effectiveCurrentYear
                    return (
                      <div key={year} className={`flex items-center gap-2 p-1.5 rounded ${isCurrentYear ? 'bg-blue-100' : 'bg-white'}`}>
                        <span className={`text-xs font-medium w-10 ${isCurrentYear ? 'text-blue-700' : 'text-gray-500'}`}>
                          {year}{isCurrentYear ? '*' : ''}
                        </span>
                        <input
                          type="number"
                          min="40"
                          max="99"
                          value={overallByYear[year] || overallByYear[String(year)] || ''}
                          onChange={(e) => onOverallChange && onOverallChange(year, e.target.value ? parseInt(e.target.value) : null)}
                          className={`flex-1 px-2 py-1.5 border rounded text-sm text-center font-bold w-16 ${
                            isCurrentYear
                              ? 'border-blue-300 bg-white text-blue-800 focus:border-blue-500'
                              : 'border-gray-200 bg-white text-gray-900 focus:border-blue-400'
                          } focus:outline-none`}
                          placeholder="--"
                        />
                      </div>
                    )
                  })}
                </div>
                <p className="text-xs text-blue-600 mt-2">* Current season (syncs with Profile)</p>
              </div>
            )
          })()}

          {/* Exit reason (if stint is closed) */}
          {editData.toYear !== null && editData.toYear !== undefined && (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Reason for leaving</label>
                <select
                  value={editData.endReason || ''}
                  onChange={(e) => setEditData(prev => ({
                    ...prev,
                    endReason: e.target.value || null,
                    // Clear related fields when reason changes
                    draftRound: e.target.value === 'pro_draft' ? prev.draftRound : null,
                    transferToTid: e.target.value === 'transfer_out' ? prev.transferToTid : null
                  }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white text-gray-900"
                >
                  <option value="">Select reason...</option>
                  {Object.entries(REASON_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>

              {/* Draft round (when pro_draft selected) */}
              {editData.endReason === 'pro_draft' && (
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Draft Round</label>
                  <select
                    value={editData.draftRound || ''}
                    onChange={(e) => setEditData(prev => ({ ...prev, draftRound: e.target.value || null }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white text-gray-900"
                  >
                    <option value="">Select round...</option>
                    {DRAFT_ROUNDS.map(round => (
                      <option key={round} value={round}>{round}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Transfer destination (when transfer_out selected) */}
              {editData.endReason === 'transfer_out' && (
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Transferred To</label>
                  <TeamSelector
                    value={editData.transferToTid}
                    onChange={(tid) => setEditData(prev => ({ ...prev, transferToTid: tid }))}
                    teams={teams}
                    placeholder="Select destination team..."
                  />
                </div>
              )}
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
                {/* Entry type badge - show reason or entryType (backwards compat) */}
                {(stint.reason || stint.entryType) && (
                  <span className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded-full font-medium">
                    {ENTRY_LABELS[stint.reason] || ENTRY_LABELS[stint.entryType] || stint.reason || stint.entryType}
                  </span>
                )}
                {/* Transferred from badge - show previous team for portal/transfer entries */}
                {stint.transferFromTid && (
                  <span className="text-xs px-2 py-1 bg-indigo-100 text-indigo-700 rounded-full font-medium">
                    ← {getTeamInfo(stint.transferFromTid).abbr}
                  </span>
                )}
                {/* Exit reason badge - only show if stint is closed and has endReason */}
                {!isOpen && stint.endReason && (
                  <span className="text-xs px-2 py-1 bg-amber-100 text-amber-700 rounded-full font-medium">
                    {REASON_LABELS[stint.endReason] || stint.endReason}
                    {stint.endReason === 'pro_draft' && stint.draftRound && ` (${stint.draftRound})`}
                  </span>
                )}
                {!isOpen && stint.endReason === 'transfer_out' && stint.transferToTid && (
                  <span className="text-xs px-2 py-1 bg-purple-100 text-purple-700 rounded-full font-medium">
                    → {getTeamInfo(stint.transferToTid).abbr}
                  </span>
                )}
              </div>

              {/* Class and overall progression for each year - always show for stints with years */}
              {stintYears.length > 0 && (
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <div className="text-xs font-medium text-gray-500 mb-2">Season Stats</div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                    {stintYears.map(year => {
                      const playerClass = classByYear[year] || classByYear[String(year)]
                      const playerOvr = overallByYear[year] || overallByYear[String(year)]
                      return (
                        <div
                          key={year}
                          className="flex items-center gap-2 px-2 py-1.5 bg-gray-50 rounded-lg"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <span className="text-xs font-semibold text-gray-600 min-w-[32px]">{year}</span>
                          <span className="text-xs text-gray-500">{playerClass || '-'}</span>
                          {onOverallChange ? (
                            <input
                              type="number"
                              min="40"
                              max="99"
                              value={playerOvr || ''}
                              onChange={(e) => onOverallChange(year, e.target.value)}
                              onClick={(e) => e.stopPropagation()}
                              className="w-12 px-1 py-0.5 text-xs text-center font-bold border border-gray-200 rounded bg-white focus:border-blue-500 focus:outline-none"
                              placeholder="--"
                            />
                          ) : (
                            <span className="text-xs font-bold text-gray-700">{playerOvr || '--'}</span>
                          )}
                        </div>
                      )
                    })}
                  </div>
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
  overallByYear = {},
  onOverallChange
}) {
  const [showAddForm, setShowAddForm] = useState(false)
  const [newStint, setNewStint] = useState({
    teamTid: null,
    fromYear: currentYear,
    toYear: null,
    reason: 'recruited',
    endReason: null
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
      reason: teamHistory.length === 0 ? 'recruited' : 'portal_in',
      endReason: null
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
      reason: 'portal_in',
      endReason: null
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
              onOverallChange={onOverallChange}
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
              reason: 'portal_in',
              endReason: null
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
                value={newStint.reason || 'recruited'}
                onChange={(e) => setNewStint(prev => ({
                  ...prev,
                  reason: e.target.value,
                  // Clear transferFromTid if not a transfer type
                  transferFromTid: ['portal_in', 'transfer', 'juco_in'].includes(e.target.value) ? prev.transferFromTid : null
                }))}
                className="w-full px-3 py-2 border border-blue-200 rounded-lg text-sm bg-white text-gray-900"
              >
                {Object.entries(ENTRY_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>

            {/* Transferred From (when portal_in, transfer, or juco_in) */}
            {['portal_in', 'transfer', 'juco_in'].includes(newStint.reason) && (
              <div>
                <label className="block text-xs font-medium text-blue-700 mb-1">Transferred From</label>
                <TeamSelector
                  value={newStint.transferFromTid}
                  onChange={(tid) => setNewStint(prev => ({ ...prev, transferFromTid: tid }))}
                  teams={teams}
                  placeholder="Select previous team..."
                />
              </div>
            )}

            {newStint.toYear !== null && (
              <div>
                <label className="block text-xs font-medium text-blue-700 mb-1">Reason for leaving</label>
                <select
                  value={newStint.endReason || ''}
                  onChange={(e) => setNewStint(prev => ({
                    ...prev,
                    endReason: e.target.value || null,
                    draftRound: e.target.value === 'pro_draft' ? prev.draftRound : null,
                    transferToTid: e.target.value === 'transfer_out' ? prev.transferToTid : null
                  }))}
                  className="w-full px-3 py-2 border border-blue-200 rounded-lg text-sm bg-white text-gray-900"
                >
                  <option value="">Select reason...</option>
                  {Object.entries(REASON_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Draft round (when pro_draft selected) */}
            {newStint.toYear !== null && newStint.endReason === 'pro_draft' && (
              <div>
                <label className="block text-xs font-medium text-blue-700 mb-1">Draft Round</label>
                <select
                  value={newStint.draftRound || ''}
                  onChange={(e) => setNewStint(prev => ({ ...prev, draftRound: e.target.value || null }))}
                  className="w-full px-3 py-2 border border-blue-200 rounded-lg text-sm bg-white text-gray-900"
                >
                  <option value="">Select round...</option>
                  {DRAFT_ROUNDS.map(round => (
                    <option key={round} value={round}>{round}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Transfer destination (when transfer_out selected) */}
            {newStint.toYear !== null && newStint.endReason === 'transfer_out' && (
              <div>
                <label className="block text-xs font-medium text-blue-700 mb-1">Transferred To</label>
                <TeamSelector
                  value={newStint.transferToTid}
                  onChange={(tid) => setNewStint(prev => ({ ...prev, transferToTid: tid }))}
                  teams={teams}
                  placeholder="Select destination team..."
                />
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
