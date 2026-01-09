import { useState, useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useDynasty, getCurrentRoster } from '../../context/DynastyContext'
import { usePathPrefix } from '../../hooks/usePathPrefix'
import { useTeamColors } from '../../hooks/useTeamColors'
import { getContrastTextColor } from '../../utils/colorUtils'
import RosterEditModal from '../../components/RosterEditModal'

// Helper to get last name for sorting (outside component for stability)
function getLastName(player) {
  // Use lastName field if available
  if (player.lastName) return player.lastName.toLowerCase()
  // Fall back to extracting from full name (take last word)
  const name = player.name || ''
  const parts = name.trim().split(/\s+/)
  if (parts.length > 1) {
    return parts[parts.length - 1].toLowerCase()
  }
  return (parts[0] || '').toLowerCase()
}

// Position groups for tabs
const positionTabs = [
  'All',
  'QB',
  'HB',
  'FB',
  'WR',
  'TE',
  'LT',
  'LG',
  'C',
  'RG',
  'RT',
  'LEDG',
  'REDG',
  'DT',
  'SAM',
  'MIKE',
  'WILL',
  'CB',
  'FS',
  'SS',
  'K',
  'P'
]

export default function Roster() {
  const { currentDynasty, saveRoster, isViewOnly } = useDynasty()
  const pathPrefix = usePathPrefix()
  const [showRosterModal, setShowRosterModal] = useState(false)
  const [selectedPosition, setSelectedPosition] = useState('All')

  // Get team colors - call hook before any conditional returns
  const teamColors = useTeamColors(currentDynasty?.teamName, currentDynasty?.customTeams)

  // Memoize the sorted and filtered players list
  const filteredPlayers = useMemo(() => {
    if (!currentDynasty) return []

    const rosterPlayers = getCurrentRoster(currentDynasty)
    const filtered = selectedPosition === 'All'
      ? rosterPlayers
      : rosterPlayers.filter(player => player.position === selectedPosition)

    // Create a new sorted array (don't mutate the original)
    return [...filtered].sort((a, b) => {
      const lastA = getLastName(a)
      const lastB = getLastName(b)
      return lastA.localeCompare(lastB)
    })
  }, [currentDynasty, selectedPosition])

  if (!currentDynasty) return null

  const secondaryBgText = getContrastTextColor(teamColors.secondary)
  const primaryBgText = getContrastTextColor(teamColors.primary)

  const handleRosterSave = async (players) => {
    await saveRoster(currentDynasty.id, players)
    setShowRosterModal(false)
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Page Header */}
      <div
        className="rounded-lg shadow-lg p-4 sm:p-6"
        style={{
          backgroundColor: teamColors.secondary,
          border: `3px solid ${teamColors.primary}`
        }}
      >
        <div className="flex items-center gap-2 sm:gap-3">
          <h2 className="text-xl sm:text-2xl font-bold" style={{ color: secondaryBgText }}>
            {currentDynasty.currentYear} Roster
          </h2>
          {!isViewOnly && (
            <button
              onClick={() => setShowRosterModal(true)}
              className="p-1.5 sm:p-2 rounded-lg hover:opacity-70 transition-opacity"
              style={{ color: secondaryBgText }}
              title="Edit Roster"
            >
              <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Position Filter - Dropdown on mobile, buttons on desktop */}
      <div
        className="rounded-lg shadow-lg p-3 sm:p-4"
        style={{
          backgroundColor: teamColors.secondary,
          border: `3px solid ${teamColors.primary}`
        }}
      >
        {/* Mobile: Dropdown */}
        <div className="sm:hidden">
          <select
            value={selectedPosition}
            onChange={(e) => setSelectedPosition(e.target.value)}
            className="w-full px-3 py-2 rounded-lg font-semibold cursor-pointer"
            style={{
              backgroundColor: teamColors.primary,
              color: primaryBgText
            }}
          >
            {positionTabs.map((position) => (
              <option key={position} value={position}>
                {position === 'All' ? 'All Positions' : position}
              </option>
            ))}
          </select>
        </div>

        {/* Desktop: Buttons */}
        <div className="hidden sm:flex flex-wrap gap-2">
          {positionTabs.map((position) => (
            <button
              key={position}
              onClick={() => setSelectedPosition(position)}
              className="px-4 py-2 rounded-lg font-semibold transition-all"
              style={{
                backgroundColor: selectedPosition === position ? teamColors.primary : 'transparent',
                color: selectedPosition === position ? primaryBgText : secondaryBgText,
                border: selectedPosition === position ? 'none' : `2px solid ${teamColors.primary}`,
                opacity: selectedPosition === position ? 1 : 0.7
              }}
            >
              {position}
            </button>
          ))}
        </div>
      </div>

      {/* Roster Table */}
      <div
        className="rounded-lg shadow-lg p-3 sm:p-6"
        style={{
          backgroundColor: teamColors.secondary,
          border: `3px solid ${teamColors.primary}`
        }}
      >
        {filteredPlayers.length > 0 ? (
          <>
            {/* Mobile: Card Layout */}
            <div className="sm:hidden space-y-2">
              {filteredPlayers.map((player) => (
                <Link
                  key={player.id}
                  to={`${pathPrefix}/player/${player.pid}`}
                  className="block p-3 rounded-lg border-2 hover:opacity-90 transition-opacity"
                  style={{
                    borderColor: `${teamColors.primary}40`,
                    backgroundColor: `${teamColors.primary}10`
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div
                        className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0"
                        style={{
                          backgroundColor: teamColors.primary,
                          color: primaryBgText
                        }}
                      >
                        {player.jerseyNumber || '-'}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold truncate" style={{ color: teamColors.primary }}>
                          {player.name}
                        </div>
                        <div className="text-xs flex items-center gap-2 flex-wrap" style={{ color: secondaryBgText, opacity: 0.8 }}>
                          <span>{player.position}</span>
                          <span>•</span>
                          <span>{player.classByYear?.[currentDynasty.currentYear] || player.year}</span>
                          {player.devTrait && player.devTrait !== 'Normal' && (
                            <>
                              <span>•</span>
                              <span>{player.devTrait}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    <div
                      className="text-xl font-bold flex-shrink-0 ml-2"
                      style={{ color: secondaryBgText }}
                    >
                      {player.overall}
                    </div>
                  </div>
                </Link>
              ))}
            </div>

            {/* Desktop: Table Layout */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b-2" style={{ borderColor: teamColors.primary }}>
                    <th className="text-center py-2 px-3 w-16" style={{ color: secondaryBgText }}>#</th>
                    <th className="text-left py-2 px-3" style={{ color: secondaryBgText }}>Name</th>
                    <th className="text-left py-2 px-3" style={{ color: secondaryBgText }}>Position</th>
                    <th className="text-left py-2 px-3" style={{ color: secondaryBgText }}>Class</th>
                    <th className="text-left py-2 px-3" style={{ color: secondaryBgText }}>Dev Trait</th>
                    <th className="text-left py-2 px-3" style={{ color: secondaryBgText }}>Overall</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPlayers.map((player) => (
                    <tr key={player.id} className="border-b border-gray-200 hover:bg-black hover:bg-opacity-5 transition-colors">
                      <td className="py-2 px-3 text-center font-bold" style={{ color: secondaryBgText }}>
                        {player.jerseyNumber || '-'}
                      </td>
                      <td className="py-2 px-3 font-semibold" style={{ color: secondaryBgText }}>
                        <Link
                          to={`${pathPrefix}/player/${player.pid}`}
                          className="hover:underline"
                          style={{ color: teamColors.primary }}
                        >
                          {player.name}
                        </Link>
                      </td>
                      <td className="py-2 px-3" style={{ color: secondaryBgText, opacity: 0.8 }}>
                        {player.position}
                      </td>
                      <td className="py-2 px-3" style={{ color: secondaryBgText, opacity: 0.8 }}>
                        {player.classByYear?.[currentDynasty.currentYear] || player.year}
                      </td>
                      <td className="py-2 px-3" style={{ color: secondaryBgText, opacity: 0.8 }}>
                        {player.devTrait || 'Normal'}
                      </td>
                      <td className="py-2 px-3 font-bold" style={{ color: secondaryBgText }}>
                        {player.overall}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="text-center py-12">
            <div style={{ color: secondaryBgText, opacity: 0.5 }} className="mb-4">
              <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <h3 className="text-lg font-medium mb-2" style={{ color: secondaryBgText }}>
              {selectedPosition === 'All' ? 'No Players Yet' : `No ${selectedPosition} Players`}
            </h3>
            <p style={{ color: secondaryBgText, opacity: 0.8 }}>
              {selectedPosition === 'All'
                ? 'Add players to your roster to track them throughout the season.'
                : `No players at the ${selectedPosition} position.`
              }
            </p>
          </div>
        )}
      </div>

      {/* Roster Edit Modal */}
      <RosterEditModal
        isOpen={showRosterModal}
        onClose={() => setShowRosterModal(false)}
        onSave={handleRosterSave}
        currentYear={currentDynasty.currentYear}
        teamColors={teamColors}
      />
    </div>
  )
}
