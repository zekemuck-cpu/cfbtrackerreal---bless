import { useState, useEffect } from 'react'
import { useDynasty, GAME_TYPES, detectGameType } from '../context/DynastyContext'
import { getContrastTextColor } from '../utils/colorUtils'
import { bowlLogos, getAllBowlNames } from '../data/bowlLogos'
import { getTidFromAbbr } from '../data/teamRegistry'

export default function BowlHistoryEditModal({ isOpen, onClose, teamColors }) {
  const { currentDynasty, updateDynasty } = useDynasty()
  const [selectedYear, setSelectedYear] = useState(null)
  const [bowlGames, setBowlGames] = useState({}) // { year: { bowlName: gameData } }
  const [saving, setSaving] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)

  const primaryText = getContrastTextColor(teamColors?.primary || '#1f2937')
  const secondaryText = getContrastTextColor(teamColors?.secondary || '#f3f4f6')

  // Get all years from dynasty
  const startYear = currentDynasty?.startYear || currentDynasty?.currentYear
  const currentYear = currentDynasty?.currentYear
  const allYears = []
  for (let year = currentYear; year >= startYear; year--) {
    allYears.push(year)
  }

  // Reset and load all bowl game data when modal opens
  useEffect(() => {
    if (isOpen && currentDynasty) {
      loadAllBowlGames()
      setSelectedYear(currentYear)
      setHasChanges(false)
    }
  }, [isOpen, currentDynasty?.id])

  const loadAllBowlGames = () => {
    const games = currentDynasty?.games || []
    const bowlData = {}

    // Initialize all years
    for (let year = startYear; year <= currentYear; year++) {
      bowlData[year] = {}
    }

    // Load bowl games from games[] array
    games.forEach(game => {
      const gameType = detectGameType(game)
      const isBowlType = gameType === GAME_TYPES.BOWL ||
                         gameType === GAME_TYPES.CFP_QUARTERFINAL ||
                         gameType === GAME_TYPES.CFP_SEMIFINAL ||
                         gameType === GAME_TYPES.CFP_CHAMPIONSHIP

      if (isBowlType && game.bowlName && game.year) {
        const year = Number(game.year)
        if (!bowlData[year]) bowlData[year] = {}

        bowlData[year][game.bowlName] = {
          id: game.id,
          bowlName: game.bowlName,
          team1: game.team1 || game.userTeam || '',
          team2: game.team2 || game.opponent || '',
          team1Score: game.team1Score ?? '',
          team2Score: game.team2Score ?? '',
          gameType: gameType,
          bowlWeek: game.bowlWeek || 'week1',
          userTeam: game.userTeam,
          opponent: game.opponent
        }
      }
    })

    setBowlGames(bowlData)
  }

  const handleGameChange = (year, bowlName, field, value) => {
    setBowlGames(prev => ({
      ...prev,
      [year]: {
        ...prev[year],
        [bowlName]: {
          ...prev[year]?.[bowlName],
          bowlName,
          [field]: value
        }
      }
    }))
    setHasChanges(true)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const existingGames = [...(currentDynasty.games || [])]
      const updatedGames = []
      const processedIds = new Set()

      // First, keep all non-bowl games
      existingGames.forEach(game => {
        const gameType = detectGameType(game)
        const isBowlType = gameType === GAME_TYPES.BOWL ||
                           gameType === GAME_TYPES.CFP_QUARTERFINAL ||
                           gameType === GAME_TYPES.CFP_SEMIFINAL ||
                           gameType === GAME_TYPES.CFP_CHAMPIONSHIP

        if (!isBowlType) {
          updatedGames.push(game)
        }
      })

      // Process bowl games from our edit state
      Object.entries(bowlGames).forEach(([year, yearBowls]) => {
        Object.entries(yearBowls).forEach(([bowlName, gameData]) => {
          // Only include games that have both teams and at least one score
          if (!gameData.team1 || !gameData.team2) return
          if (gameData.team1Score === '' && gameData.team2Score === '') return

          const team1Score = gameData.team1Score === '' ? null : Number(gameData.team1Score)
          const team2Score = gameData.team2Score === '' ? null : Number(gameData.team2Score)

          // Determine winner
          let winner = null
          if (team1Score !== null && team2Score !== null) {
            winner = team1Score > team2Score ? gameData.team1 : gameData.team2
          }

          // Find existing game to preserve its ID and other data
          const existingGame = existingGames.find(g => {
            const gType = detectGameType(g)
            const isBowl = gType === GAME_TYPES.BOWL ||
                           gType === GAME_TYPES.CFP_QUARTERFINAL ||
                           gType === GAME_TYPES.CFP_SEMIFINAL ||
                           gType === GAME_TYPES.CFP_CHAMPIONSHIP
            return isBowl && g.bowlName === bowlName && Number(g.year) === Number(year)
          })

          const gameId = existingGame?.id || gameData.id || `bowl-${year}-${bowlName.toLowerCase().replace(/\s+/g, '-')}`

          // Determine game type
          let gameType = GAME_TYPES.BOWL
          if (bowlName === 'National Championship') {
            gameType = GAME_TYPES.CFP_CHAMPIONSHIP
          } else if (['Peach Bowl', 'Fiesta Bowl'].includes(bowlName) && existingGame?.gameType === GAME_TYPES.CFP_SEMIFINAL) {
            gameType = GAME_TYPES.CFP_SEMIFINAL
          } else if (['Rose Bowl', 'Sugar Bowl', 'Orange Bowl', 'Cotton Bowl'].includes(bowlName) && existingGame?.gameType === GAME_TYPES.CFP_QUARTERFINAL) {
            gameType = GAME_TYPES.CFP_QUARTERFINAL
          } else if (existingGame?.gameType) {
            gameType = existingGame.gameType
          }

          // UNIFIED FORMAT: Use tids, not abbreviations
          const team1Tid = getTidFromAbbr(gameData.team1)
          const team2Tid = getTidFromAbbr(gameData.team2)
          const winnerTid = winner ? getTidFromAbbr(winner) : null

          updatedGames.push({
            ...(existingGame || {}),
            id: gameId,
            year: Number(year),
            bowlName,
            // UNIFIED: tid-based team identification
            team1Tid,
            team2Tid,
            team1Score,
            team2Score,
            // Bowl games are neutral site
            homeTeamTid: null,
            winnerTid,
            gameType,
            bowlWeek: gameData.bowlWeek || 'week1',
            isBowlGame: gameType === GAME_TYPES.BOWL
          })

          processedIds.add(gameId)
        })
      })

      await updateDynasty(currentDynasty.id, { games: updatedGames })
      setHasChanges(false)
      onClose()
    } catch (error) {
      console.error('Error saving bowl games:', error)
      alert('Failed to save bowl games. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  if (!isOpen) return null

  const yearGames = bowlGames[selectedYear] || {}
  const allBowlNames = getAllBowlNames()

  // Get bowl games that have data for the selected year
  const bowlsWithData = Object.keys(yearGames).filter(name => {
    const game = yearGames[name]
    return game.team1 || game.team2 || game.team1Score !== '' || game.team2Score !== ''
  })

  // Sort: bowls with data first, then alphabetically
  const sortedBowls = [...allBowlNames].sort((a, b) => {
    const aHasData = bowlsWithData.includes(a)
    const bHasData = bowlsWithData.includes(b)
    if (aHasData && !bHasData) return -1
    if (!aHasData && bHasData) return 1
    return a.localeCompare(b)
  })

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999] p-4"
      style={{ margin: 0 }}
      onMouseDown={onClose}
    >
      <div
        className="rounded-xl w-full max-w-4xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col"
        style={{ backgroundColor: teamColors?.secondary || '#f3f4f6' }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 flex items-center justify-between" style={{ backgroundColor: teamColors?.primary || '#1f2937' }}>
          <h2 className="text-xl font-bold" style={{ color: primaryText }}>
            Edit Bowl History
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-white/10 transition-colors"
            style={{ color: primaryText }}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Year Tabs */}
        <div className="flex overflow-x-auto border-b-2" style={{ borderColor: teamColors?.primary || '#1f2937', backgroundColor: `${teamColors?.primary}15` }}>
          {allYears.map(year => {
            const yearHasGames = Object.keys(bowlGames[year] || {}).some(name => {
              const game = bowlGames[year][name]
              return game.team1 || game.team2
            })
            return (
              <button
                key={year}
                onClick={() => setSelectedYear(year)}
                className={`px-4 py-3 font-semibold whitespace-nowrap transition-colors relative ${
                  selectedYear === year ? 'text-white' : 'hover:bg-white/50'
                }`}
                style={{
                  backgroundColor: selectedYear === year ? teamColors?.primary : 'transparent',
                  color: selectedYear === year ? primaryText : secondaryText
                }}
              >
                {year}
                {yearHasGames && selectedYear !== year && (
                  <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-green-500" />
                )}
              </button>
            )
          })}
        </div>

        {/* Bowl Games List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {sortedBowls.map(bowlName => {
            const game = yearGames[bowlName] || { team1: '', team2: '', team1Score: '', team2Score: '' }
            const logo = bowlLogos[bowlName]
            const hasData = game.team1 || game.team2 || game.team1Score !== '' || game.team2Score !== ''

            return (
              <div
                key={bowlName}
                className={`rounded-lg border-2 p-3 ${hasData ? 'bg-white' : 'bg-gray-50'}`}
                style={{ borderColor: hasData ? teamColors?.primary : '#d1d5db' }}
              >
                <div className="flex items-center gap-3">
                  {/* Bowl Logo */}
                  <div className="w-10 h-10 rounded-lg flex-shrink-0 flex items-center justify-center bg-white border border-gray-300" style={{ padding: '2px' }}>
                    {logo ? (
                      <img src={logo} alt="" className="w-full h-full object-contain" />
                    ) : (
                      <span className="text-lg">🏈</span>
                    )}
                  </div>

                  {/* Bowl Name */}
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-gray-800 text-sm truncate">{bowlName}</div>
                  </div>

                  {/* Team 1 */}
                  <input
                    type="text"
                    value={game.team1}
                    onChange={(e) => handleGameChange(selectedYear, bowlName, 'team1', e.target.value.toUpperCase())}
                    placeholder="Team 1"
                    className="w-20 px-2 py-1.5 text-sm font-semibold border-2 rounded text-center uppercase"
                    style={{ borderColor: '#d1d5db' }}
                  />

                  {/* Score 1 */}
                  <input
                    type="number"
                    value={game.team1Score}
                    onChange={(e) => handleGameChange(selectedYear, bowlName, 'team1Score', e.target.value)}
                    placeholder="0"
                    className="w-14 px-2 py-1.5 text-sm font-bold border-2 rounded text-center"
                    style={{ borderColor: '#d1d5db' }}
                  />

                  <span className="text-gray-400 font-bold">-</span>

                  {/* Score 2 */}
                  <input
                    type="number"
                    value={game.team2Score}
                    onChange={(e) => handleGameChange(selectedYear, bowlName, 'team2Score', e.target.value)}
                    placeholder="0"
                    className="w-14 px-2 py-1.5 text-sm font-bold border-2 rounded text-center"
                    style={{ borderColor: '#d1d5db' }}
                  />

                  {/* Team 2 */}
                  <input
                    type="text"
                    value={game.team2}
                    onChange={(e) => handleGameChange(selectedYear, bowlName, 'team2', e.target.value.toUpperCase())}
                    placeholder="Team 2"
                    className="w-20 px-2 py-1.5 text-sm font-semibold border-2 rounded text-center uppercase"
                    style={{ borderColor: '#d1d5db' }}
                  />
                </div>
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <div className="p-4 border-t-2 flex items-center justify-between gap-4" style={{ borderColor: teamColors?.primary || '#1f2937' }}>
          <div className="text-sm" style={{ color: secondaryText }}>
            {bowlsWithData.length} bowl game{bowlsWithData.length !== 1 ? 's' : ''} for {selectedYear}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg font-semibold border-2 hover:bg-gray-100 transition-colors"
              style={{ borderColor: '#d1d5db', color: '#4b5563' }}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !hasChanges}
              className="px-6 py-2 rounded-lg font-semibold transition-colors disabled:opacity-50"
              style={{
                backgroundColor: teamColors?.primary || '#1f2937',
                color: primaryText
              }}
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
