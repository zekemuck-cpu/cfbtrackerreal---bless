import { useState, useEffect } from 'react'
import { useDynasty, getUserGamePerspective } from '../../context/DynastyContext'
import { useTeamColors } from '../../hooks/useTeamColors'
import { getContrastTextColor } from '../../utils/colorUtils'
import { getCurrentTeamAbbr, TEAMS, getGameTeamInfo } from '../../data/teamRegistry'
import { Link } from 'react-router-dom'

export default function TeamHistory() {
  const { currentDynasty } = useDynasty()
  const [showGamesModal, setShowGamesModal] = useState(false)
  const [gamesModalType, setGamesModalType] = useState(null) // 'favorite' or 'underdog'
  const [showFavoriteTooltip, setShowFavoriteTooltip] = useState(false)

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (showGamesModal) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'unset'
    }
    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [showGamesModal])

  if (!currentDynasty) return null

  // Get team colors for styling
  const teamColors = useTeamColors(currentDynasty.teamName, currentDynasty?.teams || currentDynasty?.customTeams)
  const primaryText = getContrastTextColor(teamColors.primary)
  const secondaryText = getContrastTextColor(teamColors.secondary)

  // Get current team abbreviation and teams reference
  const currentTeamAbbr = getCurrentTeamAbbr(currentDynasty)
  const teams = currentDynasty?.teams || TEAMS

  // Helper functions for win/loss detection - use perspective
  const isWin = (game) => game.perspective?.userWon === true
  const isLoss = (game) => game.perspective && !game.perspective.userWon

  // Get all games for the current team - attach perspective
  const allTeamGames = (currentDynasty.games || [])
    .map(game => {
      const perspective = getUserGamePerspective(game, currentDynasty)
      return perspective ? { ...game, perspective } : null
    })
    .filter(Boolean)

  // Calculate overall record
  const totalWins = allTeamGames.filter(isWin).length
  const totalLosses = allTeamGames.filter(isLoss).length
  const overallRecord = `${totalWins}-${totalLosses}`

  // Calculate favorite/underdog records
  const favoriteGames = allTeamGames.filter(g => g.favoriteStatus === 'favorite')
  const favoriteWins = favoriteGames.filter(isWin).length
  const favoriteLosses = favoriteGames.filter(isLoss).length
  const favoriteRecord = `${favoriteWins}-${favoriteLosses}`

  const underdogGames = allTeamGames.filter(g => g.favoriteStatus === 'underdog')
  const underdogWins = underdogGames.filter(isWin).length
  const underdogLosses = underdogGames.filter(isLoss).length
  const underdogRecord = `${underdogWins}-${underdogLosses}`

  // Open games modal
  const openGamesModal = (type) => {
    setGamesModalType(type)
    setShowGamesModal(true)
  }

  // Get games for the modal
  const getGamesForModal = () => {
    if (gamesModalType === 'favorite') {
      return favoriteGames
    } else if (gamesModalType === 'underdog') {
      return underdogGames
    }
    return []
  }

  // Sort games by year (descending) then week (ascending)
  const sortedModalGames = getGamesForModal().sort((a, b) => {
    if (b.year !== a.year) return b.year - a.year
    return (a.week || 0) - (b.week || 0)
  })

  // Group games by year for display
  const gamesByYear = sortedModalGames.reduce((acc, game) => {
    const year = game.year || 'Unknown'
    if (!acc[year]) acc[year] = []
    acc[year].push(game)
    return acc
  }, {})

  // Generate seasons from start year to current year
  const seasons = []
  for (let year = currentDynasty.startYear; year <= currentDynasty.currentYear; year++) {
    // Calculate season stats from games - only include games where user's team played
    const seasonGames = (currentDynasty.games || [])
      .filter(g => Number(g.year) === year)
      .map(g => {
        const gPerspective = getUserGamePerspective(g, currentDynasty)
        return gPerspective ? { ...g, perspective: gPerspective } : null
      })
      .filter(Boolean)
    const wins = seasonGames.filter(g => g.perspective?.userWon).length
    const losses = seasonGames.filter(g => g.perspective && !g.perspective.userWon).length

    const roleDisplay = currentDynasty.coachPosition === 'HC' ? 'Head Coach'
      : currentDynasty.coachPosition === 'OC' ? 'Offensive Coordinator'
      : currentDynasty.coachPosition === 'DC' ? 'Defensive Coordinator'
      : 'Head Coach'

    seasons.push({
      year,
      role: roleDisplay,
      school: currentDynasty.teamName,
      conference: currentDynasty.conference,
      wins,
      losses,
      confRank: 'N/A',
      cfpBerth: 'N/A',
      natlChamp: 'N/A',

      // Team statistics (placeholders)
      firstDowns: 0,
      firstDownsPerGame: 0,
      offensiveYardsPerGame: 0,
      thirdDownPct: 0,
      fourthDownPct: 0,
      penaltyYardsPerGame: 0,
      redzoneTDPct: 0,
      defRedzoneTDPct: 0,
      pointsPerGame: 0,
      pointsAllowedPerGame: 0,
      marginOfVictory: 0,

      // Leaders (placeholders)
      passingLeader: { name: 'N/A', yards: 0, teamPassYPG: 0 },
      rushingLeader: { name: 'N/A', yards: 0, teamRushYPG: 0 },
      receivingLeader: { name: 'N/A', yards: 0 },
      tackleLeader: { name: 'N/A', tackles: 0 },
      tflLeader: { name: 'N/A', tfls: 0, teamTFLsPerGame: 0 },
      sackLeader: { name: 'N/A', sacks: 0, teamSacksPerGame: 0 },
      intLeader: { name: 'N/A', ints: 0, teamIntsPerGame: 0 }
    })
  }

  // Reverse to show most recent first
  seasons.reverse()

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div
        className="rounded-lg shadow-lg p-6"
        style={{
          backgroundColor: teamColors.primary,
          border: `3px solid ${teamColors.secondary}`
        }}
      >
        <h2 className="text-2xl font-bold mb-4" style={{ color: primaryText }}>
          {currentDynasty.teamName} - Team History
        </h2>

        {/* Overall Record Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Overall Record */}
          <div
            className="text-center p-4 rounded-lg border-2"
            style={{
              backgroundColor: teamColors.secondary,
              borderColor: primaryText
            }}
          >
            <div className="text-xs font-semibold mb-1" style={{ color: secondaryText, opacity: 0.7 }}>
              Overall Record
            </div>
            <div className="text-2xl font-bold" style={{ color: secondaryText }}>
              {overallRecord}
            </div>
          </div>

          {/* As Favorite - Clickable */}
          <div
            className="text-center p-4 rounded-lg border-2 relative cursor-pointer hover:scale-105 transition-transform"
            style={{
              backgroundColor: teamColors.secondary,
              borderColor: primaryText
            }}
            onClick={() => openGamesModal('favorite')}
          >
            <div className="text-xs font-semibold mb-1 flex items-center justify-center gap-1" style={{ color: secondaryText, opacity: 0.7 }}>
              As Favorite
              <button
                className="w-4 h-4 rounded-full text-xs font-bold flex items-center justify-center hover:opacity-80 cursor-help"
                style={{ backgroundColor: secondaryText, color: teamColors.secondary }}
                onMouseEnter={(e) => { e.stopPropagation(); setShowFavoriteTooltip(true) }}
                onMouseLeave={(e) => { e.stopPropagation(); setShowFavoriteTooltip(false) }}
                onClick={(e) => { e.stopPropagation(); setShowFavoriteTooltip(!showFavoriteTooltip) }}
              >
                ?
              </button>
            </div>
            <div className="text-2xl font-bold" style={{ color: secondaryText }}>
              {favoriteRecord}
            </div>
            <div className="text-xs mt-1 opacity-60" style={{ color: secondaryText }}>
              Click to view games
            </div>
            {/* Tooltip */}
            {showFavoriteTooltip && (
              <div
                className="absolute z-50 p-3 rounded-lg shadow-lg text-left text-xs w-64 -translate-x-1/2 left-1/2"
                style={{
                  backgroundColor: teamColors.primary,
                  color: primaryText,
                  top: '100%',
                  marginTop: '8px'
                }}
              >
                <div className="font-bold mb-1">How is this calculated?</div>
                <ul className="space-y-1 list-disc list-inside">
                  <li>Ranked vs unranked: ranked team is favorite</li>
                  <li>Both ranked: lower rank is favorite</li>
                  <li>Both unranked: higher overall rating is favorite</li>
                  <li>Home team gets +5 ranking or +3 overall boost</li>
                </ul>
              </div>
            )}
          </div>

          {/* As Underdog - Clickable */}
          <div
            className="text-center p-4 rounded-lg border-2 cursor-pointer hover:scale-105 transition-transform"
            style={{
              backgroundColor: teamColors.secondary,
              borderColor: primaryText
            }}
            onClick={() => openGamesModal('underdog')}
          >
            <div className="text-xs font-semibold mb-1" style={{ color: secondaryText, opacity: 0.7 }}>
              As Underdog
            </div>
            <div className="text-2xl font-bold" style={{ color: secondaryText }}>
              {underdogRecord}
            </div>
            <div className="text-xs mt-1 opacity-60" style={{ color: secondaryText }}>
              Click to view games
            </div>
          </div>
        </div>
      </div>

      {/* Season Cards */}
      {seasons.map((season) => (
        <div
          key={season.year}
          className="rounded-lg shadow-lg p-6"
          style={{
            backgroundColor: teamColors.primary,
            border: `3px solid ${teamColors.secondary}`
          }}
        >
          {/* Season Header */}
          <div className="mb-6 pb-4 border-b-2" style={{ borderColor: secondaryText + '40' }}>
            <div className="flex flex-wrap items-center gap-4">
              <h3 className="text-3xl font-bold" style={{ color: primaryText }}>
                {season.year}
              </h3>
              <div className="flex items-center gap-4 text-sm" style={{ color: primaryText, opacity: 0.9 }}>
                <span className="font-semibold">{season.role}</span>
                <span>•</span>
                <span>{season.conference}</span>
                <span>•</span>
                <span className="text-xl font-bold">{season.wins}-{season.losses}</span>
              </div>
            </div>
          </div>

          {/* Season Overview */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-6">
            <div
              className="text-center p-3 rounded-lg border-2"
              style={{
                backgroundColor: teamColors.secondary,
                borderColor: primaryText
              }}
            >
              <div className="text-xs font-semibold mb-1" style={{ color: secondaryText, opacity: 0.7 }}>
                Conf. Rank
              </div>
              <div className="text-lg font-bold" style={{ color: secondaryText }}>
                {season.confRank}
              </div>
            </div>

            <div
              className="text-center p-3 rounded-lg border-2"
              style={{
                backgroundColor: teamColors.secondary,
                borderColor: primaryText
              }}
            >
              <div className="text-xs font-semibold mb-1" style={{ color: secondaryText, opacity: 0.7 }}>
                CFP Berth
              </div>
              <div className="text-lg font-bold" style={{ color: secondaryText }}>
                {season.cfpBerth}
              </div>
            </div>

            <div
              className="text-center p-3 rounded-lg border-2"
              style={{
                backgroundColor: teamColors.secondary,
                borderColor: primaryText
              }}
            >
              <div className="text-xs font-semibold mb-1" style={{ color: secondaryText, opacity: 0.7 }}>
                Nat'l Champ
              </div>
              <div className="text-lg font-bold" style={{ color: secondaryText }}>
                {season.natlChamp}
              </div>
            </div>

            <div
              className="text-center p-3 rounded-lg border-2"
              style={{
                backgroundColor: teamColors.secondary,
                borderColor: primaryText
              }}
            >
              <div className="text-xs font-semibold mb-1" style={{ color: secondaryText, opacity: 0.7 }}>
                Points/Game
              </div>
              <div className="text-lg font-bold" style={{ color: secondaryText }}>
                {season.pointsPerGame || '-'}
              </div>
            </div>

            <div
              className="text-center p-3 rounded-lg border-2"
              style={{
                backgroundColor: teamColors.secondary,
                borderColor: primaryText
              }}
            >
              <div className="text-xs font-semibold mb-1" style={{ color: secondaryText, opacity: 0.7 }}>
                Points Allowed
              </div>
              <div className="text-lg font-bold" style={{ color: secondaryText }}>
                {season.pointsAllowedPerGame || '-'}
              </div>
            </div>

            <div
              className="text-center p-3 rounded-lg border-2"
              style={{
                backgroundColor: teamColors.secondary,
                borderColor: primaryText
              }}
            >
              <div className="text-xs font-semibold mb-1" style={{ color: secondaryText, opacity: 0.7 }}>
                Margin
              </div>
              <div className="text-lg font-bold" style={{ color: secondaryText }}>
                {season.marginOfVictory > 0 ? `+${season.marginOfVictory}` : season.marginOfVictory || '-'}
              </div>
            </div>
          </div>

          {/* Stats Grid - Two columns on desktop */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {/* Offensive Stats */}
            <div>
              <h4 className="text-lg font-bold mb-3" style={{ color: primaryText }}>
                Offensive Statistics
              </h4>
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-2 gap-3">
              <div
                className="p-3 rounded-lg border"
                style={{
                  backgroundColor: teamColors.secondary,
                  borderColor: primaryText + '60'
                }}
              >
                <div className="text-xs mb-1" style={{ color: secondaryText, opacity: 0.7 }}>
                  First Downs
                </div>
                <div className="font-bold" style={{ color: secondaryText }}>
                  {season.firstDowns || '-'}
                </div>
              </div>

              <div
                className="p-3 rounded-lg border"
                style={{
                  backgroundColor: teamColors.secondary,
                  borderColor: primaryText + '60'
                }}
              >
                <div className="text-xs mb-1" style={{ color: secondaryText, opacity: 0.7 }}>
                  First Downs/Game
                </div>
                <div className="font-bold" style={{ color: secondaryText }}>
                  {season.firstDownsPerGame || '-'}
                </div>
              </div>

              <div
                className="p-3 rounded-lg border"
                style={{
                  backgroundColor: teamColors.secondary,
                  borderColor: primaryText + '60'
                }}
              >
                <div className="text-xs mb-1" style={{ color: secondaryText, opacity: 0.7 }}>
                  Offensive Yards/Game
                </div>
                <div className="font-bold" style={{ color: secondaryText }}>
                  {season.offensiveYardsPerGame || '-'}
                </div>
              </div>

              <div
                className="p-3 rounded-lg border"
                style={{
                  backgroundColor: teamColors.secondary,
                  borderColor: primaryText + '60'
                }}
              >
                <div className="text-xs mb-1" style={{ color: secondaryText, opacity: 0.7 }}>
                  3rd Down %
                </div>
                <div className="font-bold" style={{ color: secondaryText }}>
                  {season.thirdDownPct ? `${season.thirdDownPct}%` : '-'}
                </div>
              </div>

              <div
                className="p-3 rounded-lg border"
                style={{
                  backgroundColor: teamColors.secondary,
                  borderColor: primaryText + '60'
                }}
              >
                <div className="text-xs mb-1" style={{ color: secondaryText, opacity: 0.7 }}>
                  4th Down %
                </div>
                <div className="font-bold" style={{ color: secondaryText }}>
                  {season.fourthDownPct ? `${season.fourthDownPct}%` : '-'}
                </div>
              </div>

              <div
                className="p-3 rounded-lg border"
                style={{
                  backgroundColor: teamColors.secondary,
                  borderColor: primaryText + '60'
                }}
              >
                <div className="text-xs mb-1" style={{ color: secondaryText, opacity: 0.7 }}>
                  Penalty Yds/Game
                </div>
                <div className="font-bold" style={{ color: secondaryText }}>
                  {season.penaltyYardsPerGame || '-'}
                </div>
              </div>

              <div
                className="p-3 rounded-lg border"
                style={{
                  backgroundColor: teamColors.secondary,
                  borderColor: primaryText + '60'
                }}
              >
                <div className="text-xs mb-1" style={{ color: secondaryText, opacity: 0.7 }}>
                  Redzone TD %
                </div>
                <div className="font-bold" style={{ color: secondaryText }}>
                  {season.redzoneTDPct ? `${season.redzoneTDPct}%` : '-'}
                </div>
              </div>

              <div
                className="p-3 rounded-lg border"
                style={{
                  backgroundColor: teamColors.secondary,
                  borderColor: primaryText + '60'
                }}
              >
                <div className="text-xs mb-1" style={{ color: secondaryText, opacity: 0.7 }}>
                  DEF Redzone TD %
                </div>
                <div className="font-bold" style={{ color: secondaryText }}>
                  {season.defRedzoneTDPct ? `${season.defRedzoneTDPct}%` : '-'}
                </div>
              </div>
              </div>
            </div>

            {/* Statistical Leaders */}
            <div>
              <h4 className="text-lg font-bold mb-3" style={{ color: primaryText }}>
                Statistical Leaders
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Passing Leader */}
              <div
                className="p-4 rounded-lg border-2"
                style={{
                  backgroundColor: teamColors.secondary,
                  borderColor: primaryText
                }}
              >
                <div className="text-sm font-semibold mb-2" style={{ color: secondaryText }}>
                  Passing Leader
                </div>
                <div className="flex justify-between items-center">
                  <span className="font-bold" style={{ color: secondaryText }}>
                    {season.passingLeader.name}
                  </span>
                  <span className="font-bold" style={{ color: secondaryText }}>
                    {season.passingLeader.yards > 0 ? `${season.passingLeader.yards} yds` : '-'}
                  </span>
                </div>
                <div className="text-xs mt-1" style={{ color: secondaryText, opacity: 0.7 }}>
                  Team Pass YPG: {season.passingLeader.teamPassYPG || '-'}
                </div>
              </div>

              {/* Rushing Leader */}
              <div
                className="p-4 rounded-lg border-2"
                style={{
                  backgroundColor: teamColors.secondary,
                  borderColor: primaryText
                }}
              >
                <div className="text-sm font-semibold mb-2" style={{ color: secondaryText }}>
                  Rushing Leader
                </div>
                <div className="flex justify-between items-center">
                  <span className="font-bold" style={{ color: secondaryText }}>
                    {season.rushingLeader.name}
                  </span>
                  <span className="font-bold" style={{ color: secondaryText }}>
                    {season.rushingLeader.yards > 0 ? `${season.rushingLeader.yards} yds` : '-'}
                  </span>
                </div>
                <div className="text-xs mt-1" style={{ color: secondaryText, opacity: 0.7 }}>
                  Team Rush YPG: {season.rushingLeader.teamRushYPG || '-'}
                </div>
              </div>

              {/* Receiving Leader */}
              <div
                className="p-4 rounded-lg border-2"
                style={{
                  backgroundColor: teamColors.secondary,
                  borderColor: primaryText
                }}
              >
                <div className="text-sm font-semibold mb-2" style={{ color: secondaryText }}>
                  Receiving Leader
                </div>
                <div className="flex justify-between items-center">
                  <span className="font-bold" style={{ color: secondaryText }}>
                    {season.receivingLeader.name}
                  </span>
                  <span className="font-bold" style={{ color: secondaryText }}>
                    {season.receivingLeader.yards > 0 ? `${season.receivingLeader.yards} yds` : '-'}
                  </span>
                </div>
              </div>

              {/* Tackle Leader */}
              <div
                className="p-4 rounded-lg border-2"
                style={{
                  backgroundColor: teamColors.secondary,
                  borderColor: primaryText
                }}
              >
                <div className="text-sm font-semibold mb-2" style={{ color: secondaryText }}>
                  Tackle Leader
                </div>
                <div className="flex justify-between items-center">
                  <span className="font-bold" style={{ color: secondaryText }}>
                    {season.tackleLeader.name}
                  </span>
                  <span className="font-bold" style={{ color: secondaryText }}>
                    {season.tackleLeader.tackles > 0 ? season.tackleLeader.tackles : '-'}
                  </span>
                </div>
              </div>

              {/* TFL Leader */}
              <div
                className="p-4 rounded-lg border-2"
                style={{
                  backgroundColor: teamColors.secondary,
                  borderColor: primaryText
                }}
              >
                <div className="text-sm font-semibold mb-2" style={{ color: secondaryText }}>
                  TFL Leader
                </div>
                <div className="flex justify-between items-center">
                  <span className="font-bold" style={{ color: secondaryText }}>
                    {season.tflLeader.name}
                  </span>
                  <span className="font-bold" style={{ color: secondaryText }}>
                    {season.tflLeader.tfls > 0 ? season.tflLeader.tfls : '-'}
                  </span>
                </div>
                <div className="text-xs mt-1" style={{ color: secondaryText, opacity: 0.7 }}>
                  Team TFLs/Game: {season.tflLeader.teamTFLsPerGame || '-'}
                </div>
              </div>

              {/* Sack Leader */}
              <div
                className="p-4 rounded-lg border-2"
                style={{
                  backgroundColor: teamColors.secondary,
                  borderColor: primaryText
                }}
              >
                <div className="text-sm font-semibold mb-2" style={{ color: secondaryText }}>
                  Sack Leader
                </div>
                <div className="flex justify-between items-center">
                  <span className="font-bold" style={{ color: secondaryText }}>
                    {season.sackLeader.name}
                  </span>
                  <span className="font-bold" style={{ color: secondaryText }}>
                    {season.sackLeader.sacks > 0 ? season.sackLeader.sacks : '-'}
                  </span>
                </div>
                <div className="text-xs mt-1" style={{ color: secondaryText, opacity: 0.7 }}>
                  Team Sacks/Game: {season.sackLeader.teamSacksPerGame || '-'}
                </div>
              </div>

              {/* INT Leader */}
              <div
                className="p-4 rounded-lg border-2"
                style={{
                  backgroundColor: teamColors.secondary,
                  borderColor: primaryText
                }}
              >
                <div className="text-sm font-semibold mb-2" style={{ color: secondaryText }}>
                  INT Leader
                </div>
                <div className="flex justify-between items-center">
                  <span className="font-bold" style={{ color: secondaryText }}>
                    {season.intLeader.name}
                  </span>
                  <span className="font-bold" style={{ color: secondaryText }}>
                    {season.intLeader.ints > 0 ? season.intLeader.ints : '-'}
                  </span>
                </div>
                <div className="text-xs mt-1" style={{ color: secondaryText, opacity: 0.7 }}>
                  Team INTs/Game: {season.intLeader.teamIntsPerGame || '-'}
                </div>
              </div>
              </div>
            </div>
          </div>

          {/* Note about incomplete data */}
          {season.year === currentDynasty.currentYear && (
            <div className="mt-4 text-xs opacity-60" style={{ color: primaryText }}>
              <p>* Season in progress - statistics will update as data is tracked</p>
            </div>
          )}
        </div>
      ))}

      {seasons.length === 0 && (
        <div
          className="rounded-lg shadow-lg p-12 text-center"
          style={{
            backgroundColor: teamColors.primary,
            border: `3px solid ${teamColors.secondary}`
          }}
        >
          <p style={{ color: primaryText, opacity: 0.7 }}>
            No seasons to display yet. Start playing to build your team history!
          </p>
        </div>
      )}

      {/* Games Modal */}
      {showGamesModal && (
        <div
          className="fixed inset-0 top-0 left-0 right-0 bottom-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999] p-4"
          style={{ margin: 0 }}
          onClick={() => setShowGamesModal(false)}
        >
          <div
            className="rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col"
            style={{ backgroundColor: teamColors.secondary }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div
              className="px-6 py-4 flex items-center justify-between flex-shrink-0"
              style={{ backgroundColor: teamColors.primary }}
            >
              <div>
                <h3 className="text-xl font-bold" style={{ color: primaryText }}>
                  Games as {gamesModalType === 'favorite' ? 'Favorite' : 'Underdog'}
                </h3>
                <p className="text-sm mt-0.5 opacity-80" style={{ color: primaryText }}>
                  {sortedModalGames.length} game{sortedModalGames.length !== 1 ? 's' : ''}
                </p>
              </div>
              <button
                onClick={() => setShowGamesModal(false)}
                className="p-2 rounded-full hover:bg-white/20 transition-colors"
                style={{ color: primaryText }}
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto p-6">
              {sortedModalGames.length === 0 ? (
                <p className="text-center py-8" style={{ color: secondaryText, opacity: 0.7 }}>
                  No games found as {gamesModalType === 'favorite' ? 'favorite' : 'underdog'}.
                </p>
              ) : (
                <div className="space-y-6">
                  {Object.entries(gamesByYear).sort((a, b) => Number(b[0]) - Number(a[0])).map(([year, games]) => (
                    <div key={year}>
                      <h4 className="text-lg font-bold mb-3" style={{ color: secondaryText }}>
                        {year} Season
                      </h4>
                      <div className="space-y-2">
                        {games.map((game, idx) => {
                          const won = isWin(game)
                          const weekLabel = game.phase === 'postseason' ? `Bowl` :
                                           game.phase === 'conf_championship' ? 'CCG' :
                                           `Week ${game.week || '?'}`
                          return (
                            <Link
                              key={idx}
                              to={`/dynasty/${currentDynasty.id}/game/${game.id || idx}`}
                              className="block p-3 rounded-lg border-2 hover:scale-[1.02] transition-transform"
                              style={{
                                backgroundColor: won ? '#dcfce7' : '#fee2e2',
                                borderColor: won ? '#16a34a' : '#dc2626'
                              }}
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                  <span
                                    className="text-xs font-semibold px-2 py-1 rounded"
                                    style={{
                                      backgroundColor: won ? '#16a34a' : '#dc2626',
                                      color: 'white'
                                    }}
                                  >
                                    {won ? 'W' : 'L'}
                                  </span>
                                  <div>
                                    <div className="font-semibold" style={{ color: '#1f2937' }}>
                                      vs {(() => {
                                        const oppInfo = game.perspective?.opponentTid
                                          ? getGameTeamInfo(teams, game.perspective.opponentTid)
                                          : null
                                        return oppInfo?.abbr || game.opponent || 'Unknown'
                                      })()}
                                    </div>
                                    <div className="text-xs" style={{ color: '#6b7280' }}>
                                      {weekLabel} • {game.perspective?.isHome ? 'Home' : game.perspective?.isAway ? 'Away' : 'Neutral'}
                                    </div>
                                  </div>
                                </div>
                                <div className="text-right">
                                  <div className="font-bold" style={{ color: '#1f2937' }}>
                                    {game.perspective?.userScore ?? '-'} - {game.perspective?.opponentScore ?? '-'}
                                  </div>
                                </div>
                              </div>
                            </Link>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
