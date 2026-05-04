import { useState } from 'react'
import { createPortal } from 'react-dom'
import { getContrastTextColor } from '../utils/colorUtils'

/**
 * Modal to confirm class advancement for players with unknown games played.
 * Shows when advancing from offseason to preseason if any players have null gamesPlayed.
 */
export default function ClassAdvancementModal({ isOpen, onClose, onConfirm, players, teamColors, year }) {
  // Track which players played 5+ games (true = yes, false = no/redshirt)
  const [playedFiveOrMore, setPlayedFiveOrMore] = useState(() => {
    // Default all to true (assume they played)
    const initial = {}
    players.forEach(p => {
      initial[p.pid] = true
    })
    return initial
  })

  const handleToggle = (pid) => {
    setPlayedFiveOrMore(prev => ({
      ...prev,
      [pid]: !prev[pid]
    }))
  }

  const handleConfirm = () => {
    onConfirm(playedFiveOrMore)
    onClose()
  }

  const handleSetAll = (value) => {
    const updated = {}
    players.forEach(p => {
      updated[p.pid] = value
    })
    setPlayedFiveOrMore(updated)
  }

  if (!isOpen) return null

  return createPortal(
    <div
      className="fixed inset-0 top-0 left-0 right-0 bottom-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999] p-4"
      style={{ margin: 0 }}
    >
      <div
        className="card w-full max-w-2xl max-h-[90dvh] flex flex-col p-6 border-l-[3px]"
        style={{ borderLeftColor: teamColors.primary }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-txt-primary">
            Confirm Class Advancement
          </h2>
        </div>

        <p className="text-sm mb-4 text-txt-secondary">
          The following players don't have games played data recorded. Please confirm if each player played 5 or more games this season.
          Players who played fewer than 5 games (and aren't already redshirted) will receive a redshirt year.
        </p>

        {/* Quick actions */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => handleSetAll(true)}
            className="btn btn-secondary text-sm"
          >
            Set All: Yes (5+ games)
          </button>
          <button
            onClick={() => handleSetAll(false)}
            className="btn btn-secondary text-sm"
          >
            Set All: No (Redshirt)
          </button>
        </div>

        {/* Player list */}
        <div className="flex-1 overflow-y-auto mb-4">
          <table className="w-full">
            <thead>
              <tr className="border-b border-surface-4">
                <th className="text-left py-2 px-2 text-sm font-semibold text-txt-secondary">Player</th>
                <th className="text-center py-2 px-2 text-sm font-semibold text-txt-secondary">Position</th>
                <th className="text-center py-2 px-2 text-sm font-semibold text-txt-secondary">Current Class</th>
                <th className="text-center py-2 px-2 text-sm font-semibold text-txt-secondary">Played 5+ Games?</th>
                <th className="text-center py-2 px-2 text-sm font-semibold text-txt-secondary">Next Class</th>
              </tr>
            </thead>
            <tbody>
              {players.map(player => {
                const played5Plus = playedFiveOrMore[player.pid]
                // Use classByYear as source of truth, with fallback to player.year
                const playerClass = player.classByYear?.[year] || player.classByYear?.[String(year)] || player.year
                const isAlreadyRS = playerClass?.startsWith('RS ')

                // Calculate next class
                let nextClass
                if (played5Plus || isAlreadyRS) {
                  // Normal progression
                  const progression = {
                    'Fr': 'So', 'RS Fr': 'RS So',
                    'So': 'Jr', 'RS So': 'RS Jr',
                    'Jr': 'Sr', 'RS Jr': 'RS Sr',
                    'Sr': 'RS Sr', 'RS Sr': 'RS Sr'
                  }
                  nextClass = progression[playerClass] || playerClass
                } else {
                  // Redshirt - add RS prefix
                  nextClass = 'RS ' + playerClass
                }

                return (
                  <tr key={player.pid} className="border-b border-surface-4/50">
                    <td className="py-2 px-2 text-sm font-medium text-txt-primary">
                      {player.name}
                    </td>
                    <td className="py-2 px-2 text-sm text-center text-txt-secondary">
                      {player.position}
                    </td>
                    <td className="py-2 px-2 text-sm text-center text-txt-secondary">
                      {playerClass}
                    </td>
                    <td className="py-2 px-2 text-center">
                      {isAlreadyRS ? (
                        <span className="text-xs italic text-txt-tertiary">
                          Already RS
                        </span>
                      ) : (
                        <button
                          onClick={() => handleToggle(player.pid)}
                          className={`px-3 py-1 rounded text-xs font-semibold transition-colors ${
                            played5Plus
                              ? 'bg-green-500 text-white'
                              : 'bg-orange-500 text-white'
                          }`}
                        >
                          {played5Plus ? 'Yes' : 'No'}
                        </button>
                      )}
                    </td>
                    <td className="py-2 px-2 text-sm text-center font-semibold text-txt-primary">
                      {nextClass}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Action buttons */}
        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            className="btn btn-secondary text-sm"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            className="px-4 py-2 rounded-lg font-semibold text-sm hover:opacity-90 transition-opacity"
            style={{ backgroundColor: teamColors.primary, color: getContrastTextColor(teamColors.primary) }}
          >
            Confirm & Advance Season
          </button>
        </div>
      </div>
    </div>
  ,
  document.body
  )
}
