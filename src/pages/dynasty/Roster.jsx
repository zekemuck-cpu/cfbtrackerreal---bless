import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useDynasty, getCurrentRoster } from '../../context/DynastyContext'
import { usePathPrefix } from '../../hooks/usePathPrefix'
import { useTeamColors } from '../../hooks/useTeamColors'
import RosterEditModal from '../../components/RosterEditModal'
import { Button, Card, EmptyState, PageHero } from '../../components/ui'

function getLastName(player) {
  if (player.lastName) return player.lastName.toLowerCase()
  const name = player.name || ''
  const parts = name.trim().split(/\s+/)
  if (parts.length > 1) {
    return parts[parts.length - 1].toLowerCase()
  }
  return (parts[0] || '').toLowerCase()
}

const positionTabs = [
  'All', 'QB', 'HB', 'FB', 'WR', 'TE',
  'LT', 'LG', 'C', 'RG', 'RT',
  'LEDG', 'REDG', 'DT',
  'SAM', 'MIKE', 'WILL',
  'CB', 'FS', 'SS',
  'K', 'P'
]

export default function Roster() {
  const { currentDynasty, saveRoster, isViewOnly } = useDynasty()
  const pathPrefix = usePathPrefix()
  const [showRosterModal, setShowRosterModal] = useState(false)
  const [selectedPosition, setSelectedPosition] = useState('All')
  const teamColors = useTeamColors(currentDynasty?.teamName, currentDynasty?.teams || currentDynasty?.customTeams)

  const filteredPlayers = useMemo(() => {
    if (!currentDynasty) return []

    const rosterPlayers = getCurrentRoster(currentDynasty)
    const filtered = selectedPosition === 'All'
      ? rosterPlayers
      : rosterPlayers.filter(player => player.position === selectedPosition)

    return [...filtered].sort((a, b) => {
      const lastA = getLastName(a)
      const lastB = getLastName(b)
      return lastA.localeCompare(lastB)
    })
  }, [currentDynasty, selectedPosition])

  if (!currentDynasty) return null

  const handleRosterSave = async (players) => {
    await saveRoster(currentDynasty.id, players)
    setShowRosterModal(false)
  }

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow="Roster"
        title={`${currentDynasty.currentYear} Roster`}
        meta={<span>{filteredPlayers.length} {selectedPosition === 'All' ? 'players' : `at ${selectedPosition}`}</span>}
        actions={!isViewOnly && (
          <Button variant="primary" size="sm" onClick={() => setShowRosterModal(true)}>
            Edit Roster
          </Button>
        )}
      />

      {/* Position filter */}
      <div className="sm:hidden">
        <select
          value={selectedPosition}
          onChange={(e) => setSelectedPosition(e.target.value)}
          className="w-full px-3 py-2 rounded-md bg-surface-2 text-txt-primary text-sm font-medium"
          style={{ border: '1px solid var(--surface-4)' }}
        >
          {positionTabs.map((position) => (
            <option key={position} value={position}>
              {position === 'All' ? 'All Positions' : position}
            </option>
          ))}
        </select>
      </div>
      <div className="hidden sm:flex flex-wrap gap-1.5">
        {positionTabs.map((position) => {
          const active = selectedPosition === position
          return (
            <button
              key={position}
              onClick={() => setSelectedPosition(position)}
              className={`px-3 py-1 rounded-sm text-xs font-semibold uppercase tracking-wider transition-colors ${
                active
                  ? 'text-txt-primary'
                  : 'text-txt-secondary hover:text-txt-primary hover:bg-surface-3'
              }`}
              style={active
                ? { backgroundColor: 'var(--surface-3)', boxShadow: 'inset 0 -2px 0 0 var(--text-primary)' }
                : undefined
              }
            >
              {position}
            </button>
          )
        })}
      </div>

      {/* Roster list */}
      {filteredPlayers.length > 0 ? (
        <Card padding="none" variant="bordered">
          {/* Mobile: compact rows */}
          <div className="sm:hidden divide-y divide-surface-4">
            {filteredPlayers.map((player) => (
              <Link
                key={player.id}
                to={`${pathPrefix}/player/${player.pid}`}
                className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-surface-3 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <span className="text-xs font-semibold tabular text-txt-tertiary w-8 text-right">
                    {player.jerseyNumber || '—'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-txt-primary truncate">
                      {player.name}
                    </div>
                    <div className="text-xs text-txt-tertiary flex items-center gap-2">
                      <span>{player.position}</span>
                      
                      <span>{player.classByYear?.[currentDynasty.currentYear] || player.year}</span>
                      {player.devTrait && (
                        <>
                          
                          <span>{player.devTrait}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <span className="stat-md text-txt-primary tabular flex-shrink-0">
                  {player.overall}
                </span>
              </Link>
            ))}
          </div>

          {/* Desktop: editorial table */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--surface-5)' }}>
                  <th className="text-right py-2 px-3 w-16 label-xs text-txt-tertiary">#</th>
                  <th className="text-left py-2 px-3 label-xs text-txt-tertiary">Name</th>
                  <th className="text-left py-2 px-3 label-xs text-txt-tertiary">Pos</th>
                  <th className="text-left py-2 px-3 label-xs text-txt-tertiary">Class</th>
                  <th className="text-left py-2 px-3 label-xs text-txt-tertiary">Dev</th>
                  <th className="text-right py-2 px-3 label-xs text-txt-tertiary">OVR</th>
                </tr>
              </thead>
              <tbody>
                {filteredPlayers.map((player) => (
                  <tr
                    key={player.id}
                    className="hover:bg-surface-3 transition-colors"
                    style={{ borderBottom: '1px solid var(--surface-4)' }}
                  >
                    <td className="py-2 px-3 text-right text-sm tabular text-txt-secondary">
                      {player.jerseyNumber || '—'}
                    </td>
                    <td className="py-2 px-3">
                      <Link
                        to={`${pathPrefix}/player/${player.pid}`}
                        className="text-sm font-semibold text-txt-primary hover:text-team-primary transition-colors"
                      >
                        {player.name}
                      </Link>
                    </td>
                    <td className="py-2 px-3 text-sm text-txt-secondary">
                      {player.position}
                    </td>
                    <td className="py-2 px-3 text-sm text-txt-secondary">
                      {player.classByYear?.[currentDynasty.currentYear] || player.year}
                    </td>
                    <td className="py-2 px-3 text-sm text-txt-secondary">
                      {player.devTrait || 'Normal'}
                    </td>
                    <td className="py-2 px-3 text-right stat-md text-txt-primary">
                      {player.overall}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <Card>
          <EmptyState
            title={selectedPosition === 'All' ? 'No Players Yet' : `No ${selectedPosition} Players`}
            message={selectedPosition === 'All'
              ? 'Add players to your roster to track them throughout the season.'
              : `No players at the ${selectedPosition} position.`}
            action={selectedPosition === 'All' && !isViewOnly && (
              <Button variant="primary" onClick={() => setShowRosterModal(true)}>
                Add Players
              </Button>
            )}
          />
        </Card>
      )}

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
