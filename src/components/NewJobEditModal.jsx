import { useState, useEffect, useRef, useMemo } from 'react'
import { getContrastTextColor } from '../utils/colorUtils'
import { teamAbbreviations } from '../data/teamAbbreviations'
import { getTeamLogo } from '../data/teams'
import { getTeamColors } from '../data/teamColors'
import { useDynasty } from '../context/DynastyContext'

// Get static base teams for dropdown (teambuilder teams added dynamically below)
const staticTeams = Object.entries(teamAbbreviations)
  .map(([abbr, data]) => ({
    abbr,
    name: data.name,
    displayName: data.name
  }))
  .sort((a, b) => a.name.localeCompare(b.name))

export default function NewJobEditModal({ isOpen, onClose, onSave, teamColors, currentJobData }) {
  const { currentDynasty } = useDynasty()
  const dynastyTeams = currentDynasty?.teams || null

  // Build team list from dynasty.teams — it's the single source of truth.
  // Custom teambuilder teams have already replaced their slot at the correct tid,
  // so iterating dynasty.teams gives the correct full list with no special-casing needed.
  const allTeams = useMemo(() => {
    if (!dynastyTeams) return staticTeams
    return Object.values(dynastyTeams)
      .filter(t => !t.isFCS && t.name && t.abbr)
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [dynastyTeams])
  const [takingNewJob, setTakingNewJob] = useState(null)
  const [selectedTeam, setSelectedTeam] = useState('')
  const [selectedPosition, setSelectedPosition] = useState('')
  const [teamSearch, setTeamSearch] = useState('')
  const [showTeamDropdown, setShowTeamDropdown] = useState(false)
  const dropdownRef = useRef(null)

  // Load current data when modal opens
  useEffect(() => {
    if (isOpen) {
      if (currentJobData) {
        setTakingNewJob(currentJobData.takingNewJob ?? null)
        setSelectedTeam(currentJobData.team || '')
        setSelectedPosition(currentJobData.position || '')
      } else {
        // Reset if no data
        setTakingNewJob(null)
        setSelectedTeam('')
        setSelectedPosition('')
      }
      setTeamSearch('')
      setShowTeamDropdown(false)
    }
  }, [isOpen, currentJobData])

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

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowTeamDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleSave = () => {
    if (takingNewJob === true && !selectedTeam) {
      alert('Please select a team')
      return
    }
    if (takingNewJob === true && !selectedPosition) {
      alert('Please select a position')
      return
    }

    onSave({
      takingNewJob,
      team: takingNewJob ? selectedTeam : null,
      position: takingNewJob ? selectedPosition : null
    })
    onClose()
  }

  const handleTeamSelect = (teamName) => {
    setSelectedTeam(teamName)
    setTeamSearch('')
    setShowTeamDropdown(false)
  }

  const filteredTeams = allTeams.filter(team =>
    team.name.toLowerCase().includes(teamSearch.toLowerCase()) ||
    team.abbr.toLowerCase().includes(teamSearch.toLowerCase())
  )

  // Get colors for the selected new team (for preview)
  const newTeamColors = selectedTeam ? (getTeamColors(selectedTeam, dynastyTeams) || { primary: '#333', secondary: '#fff' }) : null
  const newTeamLogo = selectedTeam ? getTeamLogo(selectedTeam, dynastyTeams) : null

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 top-0 left-0 right-0 bottom-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999] py-8 px-4 sm:p-4"
      style={{ margin: 0 }}
      onMouseDown={onClose}
    >
      <div
        className="rounded-lg shadow-xl w-full max-w-md max-h-[calc(100vh-4rem)] sm:max-h-[90vh] overflow-y-auto p-4 sm:p-6"
        style={{ backgroundColor: teamColors.secondary }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold" style={{ color: teamColors.primary }}>
            Edit New Job
          </h2>
          <button
            onClick={onClose}
            className="hover:opacity-70"
            style={{ color: teamColors.primary }}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <p className="text-sm mb-6" style={{ color: teamColors.primary, opacity: 0.8 }}>
          Update your job decision for the upcoming season.
        </p>

        {/* Taking New Job Toggle */}
        <div className="mb-6">
          <label className="block text-sm font-semibold mb-3" style={{ color: teamColors.primary }}>
            Are you taking a new job?
          </label>
          <div className="flex gap-3">
            <button
              onClick={() => {
                setTakingNewJob(true)
                if (!selectedTeam) setSelectedTeam('')
                if (!selectedPosition) setSelectedPosition('')
              }}
              className={`flex-1 px-4 py-3 rounded-lg font-semibold transition-all ${
                takingNewJob === true ? 'ring-2 ring-offset-2' : ''
              }`}
              style={{
                backgroundColor: takingNewJob === true ? teamColors.primary : `${teamColors.primary}20`,
                color: takingNewJob === true ? getContrastTextColor(teamColors.primary) : teamColors.primary,
                ringColor: teamColors.primary
              }}
            >
              Yes
            </button>
            <button
              onClick={() => {
                setTakingNewJob(false)
                setSelectedTeam('')
                setSelectedPosition('')
              }}
              className={`flex-1 px-4 py-3 rounded-lg font-semibold transition-all ${
                takingNewJob === false ? 'ring-2 ring-offset-2' : ''
              }`}
              style={{
                backgroundColor: takingNewJob === false ? teamColors.primary : `${teamColors.primary}20`,
                color: takingNewJob === false ? getContrastTextColor(teamColors.primary) : teamColors.primary,
                ringColor: teamColors.primary
              }}
            >
              No
            </button>
          </div>
        </div>

        {/* Team Selection - only show if taking new job */}
        {takingNewJob === true && (
          <div className="mb-6">
            <label className="block text-sm font-semibold mb-2" style={{ color: teamColors.primary }}>
              Which team?
            </label>
            <div className="relative" ref={dropdownRef}>
              <input
                type="text"
                value={teamSearch || (selectedTeam ? (teamAbbreviations[selectedTeam]?.name || selectedTeam) : '')}
                onChange={(e) => {
                  setTeamSearch(e.target.value)
                  setShowTeamDropdown(true)
                  if (!e.target.value) setSelectedTeam('')
                }}
                onFocus={() => setShowTeamDropdown(true)}
                className="w-full px-4 py-3 rounded-lg border-2 text-txt-primary placeholder-gray-400"
                style={{
                  borderColor: teamColors.primary,
                  backgroundColor: '#ffffff'
                }}
                placeholder="Search for a team..."
              />
              {showTeamDropdown && (
                <div
                  className="absolute z-50 w-full mt-1 max-h-48 overflow-y-auto rounded-lg shadow-lg border-2"
                  style={{
                    backgroundColor: '#ffffff',
                    borderColor: teamColors.primary
                  }}
                >
                  {filteredTeams.length === 0 ? (
                    <div className="px-4 py-3 text-txt-muted">No teams found</div>
                  ) : (
                    filteredTeams.map((team) => {
                      const logo = getTeamLogo(team.name, dynastyTeams)
                      return (
                        <button
                          key={team.abbr}
                          onClick={() => handleTeamSelect(team.name)}
                          className="w-full px-4 py-2 text-left hover:bg-surface-3 flex items-center gap-2"
                        >
                          {logo && (
                            <img src={logo} alt="" className="w-6 h-6 object-contain" />
                          )}
                          <span>{team.name}</span>
                        </button>
                      )
                    })
                  )}
                </div>
              )}
            </div>

            {/* Selected team preview */}
            {selectedTeam && newTeamColors && (
              <div
                className="mt-3 p-3 rounded-lg flex items-center gap-3"
                style={{
                  backgroundColor: newTeamColors.primary,
                  border: `2px solid ${newTeamColors.secondary}`
                }}
              >
                {newTeamLogo && (
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{
                      backgroundColor: '#FFFFFF',
                      border: `2px solid ${newTeamColors.secondary}`,
                      padding: '2px'
                    }}
                  >
                    <img src={newTeamLogo} alt="" className="w-full h-full object-contain" />
                  </div>
                )}
                <span className="font-semibold" style={{ color: getContrastTextColor(newTeamColors.primary) }}>
                  {teamAbbreviations[selectedTeam]?.name || selectedTeam}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Position Selection - only show if taking new job and team selected */}
        {takingNewJob === true && selectedTeam && (
          <div className="mb-6">
            <label className="block text-sm font-semibold mb-2" style={{ color: teamColors.primary }}>
              What position?
            </label>
            <div className="flex gap-2 flex-wrap">
              {[
                { value: 'HC', label: 'Head Coach' },
                { value: 'OC', label: 'Offensive Coordinator' },
                { value: 'DC', label: 'Defensive Coordinator' }
              ].map((pos) => (
                <button
                  key={pos.value}
                  onClick={() => setSelectedPosition(pos.value)}
                  className={`px-4 py-2 rounded-lg font-semibold transition-all ${
                    selectedPosition === pos.value ? 'ring-2 ring-offset-2' : ''
                  }`}
                  style={{
                    backgroundColor: selectedPosition === pos.value ? teamColors.primary : `${teamColors.primary}20`,
                    color: selectedPosition === pos.value ? getContrastTextColor(teamColors.primary) : teamColors.primary,
                    ringColor: teamColors.primary
                  }}
                >
                  {pos.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Summary */}
        {takingNewJob !== null && (
          <div
            className="mb-6 p-4 rounded-lg"
            style={{ backgroundColor: `${teamColors.primary}10`, border: `1px solid ${teamColors.primary}30` }}
          >
            <div className="text-sm font-semibold mb-1" style={{ color: teamColors.primary, opacity: 0.7 }}>
              Summary
            </div>
            <div className="font-semibold" style={{ color: teamColors.primary }}>
              {takingNewJob === false ? (
                'Staying with current team'
              ) : selectedTeam && selectedPosition ? (
                `${selectedPosition === 'HC' ? 'Head Coach' : selectedPosition === 'OC' ? 'Offensive Coordinator' : 'Defensive Coordinator'} at ${teamAbbreviations[selectedTeam]?.name || selectedTeam}`
              ) : (
                'Select team and position above'
              )}
            </div>
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 rounded-lg font-semibold border-2 hover:opacity-90 transition-colors"
            style={{
              borderColor: teamColors.primary,
              color: teamColors.primary,
              backgroundColor: teamColors.secondary
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={takingNewJob === null}
            className="flex-1 px-4 py-2 rounded-lg font-semibold hover:opacity-90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              backgroundColor: teamColors.primary,
              color: getContrastTextColor(teamColors.primary)
            }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
