import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useDynasty, detectGameType, GAME_TYPES, getUserGamePerspective } from '../../context/DynastyContext'
import { usePathPrefix } from '../../hooks/usePathPrefix'
import { TEAMS, resolveTid, getCurrentTeamAbbr, getGameTeamInfo, getAbbrFromTeamName, getTidFromAbbr } from '../../data/teamRegistry'
import { getMascotName as getMascotNameFromTeams } from '../../data/teams'
import {
  PageHero,
  Card,
  EmptyState,
  Modal,
  Badge,
  Stat,
  TeamLogo,
  SectionHeader,
  ScoreRow,
} from '../../components/ui'

const getMascotName = (opponent, teamsData = null) => {
  if (teamsData) {
    const result = getMascotNameFromTeams(opponent, teamsData)
    if (result) return result
  }
  const abbr = getAbbrFromTeamName(opponent)
  if (abbr) return abbr
  return opponent || null
}

const getPositionLabel = (position) => {
  if (position === 'OC') return 'Offensive Coordinator'
  if (position === 'DC') return 'Defensive Coordinator'
  return 'Head Coach'
}

const MODAL_TITLES = {
  favorite: 'Games as Favorite',
  underdog: 'Games as Underdog',
  all: 'All Games',
  bowl: 'Bowl Games',
  confChamp: 'Conference Championship Games',
  cfp: 'CFP Games',
}

export default function CoachCareer() {
  const { currentDynasty } = useDynasty()
  const pathPrefix = usePathPrefix()
  const navigate = useNavigate()
  const [showGamesModal, setShowGamesModal] = useState(false)
  const [gamesModalType, setGamesModalType] = useState(null)
  const [selectedTeamForModal, setSelectedTeamForModal] = useState(null)

  if (!currentDynasty) return null

  const currentTeamAbbr = getCurrentTeamAbbr(currentDynasty)
  const teamsData = currentDynasty?.teams || currentDynasty?.customTeams

  const isGamePlayed = (g) => {
    if (g.isPlayed) return true
    const team1Score = g.team1Score ?? g.teamScore ?? 0
    const team2Score = g.team2Score ?? g.opponentScore ?? 0
    return team1Score > 0 || team2Score > 0
  }

  const computeFavoriteStatus = (g, userTid) => {
    if (g.favoriteStatus) return g.favoriteStatus
    if (!g.team1Tid || !g.team2Tid) return null

    const team1Tid = g.team1Tid
    const team2Tid = g.team2Tid
    const homeTeamTid = g.homeTeamTid

    const team1Rank = g.team1Rank ? parseInt(g.team1Rank) : null
    const team2Rank = g.team2Rank ? parseInt(g.team2Rank) : null

    let team1Overall = g.team1Overall ? parseInt(g.team1Overall) : null
    let team2Overall = g.team2Overall ? parseInt(g.team2Overall) : null

    if (!team1Overall || !team2Overall) {
      const gameUserTid = g.userTid
      if (g.userOverall || g.opponentOverall) {
        if (gameUserTid === team1Tid) {
          if (!team1Overall && g.userOverall) team1Overall = parseInt(g.userOverall)
          if (!team2Overall && g.opponentOverall) team2Overall = parseInt(g.opponentOverall)
        } else if (gameUserTid === team2Tid) {
          if (!team1Overall && g.opponentOverall) team1Overall = parseInt(g.opponentOverall)
          if (!team2Overall && g.userOverall) team2Overall = parseInt(g.userOverall)
        }
      }
    }

    const gameYear = g.year
    if (!team1Overall) {
      const team1Ratings = currentDynasty.teams?.[team1Tid]?.byYear?.[gameYear]?.teamRatings
      team1Overall = team1Ratings?.overall ? parseInt(team1Ratings.overall) : null
    }
    if (!team2Overall) {
      const team2Ratings = currentDynasty.teams?.[team2Tid]?.byYear?.[gameYear]?.teamRatings
      team2Overall = team2Ratings?.overall ? parseInt(team2Ratings.overall) : null
    }

    const homeAdvantageOverall = homeTeamTid === null ? 0 : 3
    const homeAdvantageRanking = homeTeamTid === null ? 0 : 5

    let team1IsFavorite = null

    if (team1Rank && !team2Rank) {
      team1IsFavorite = true
    } else if (!team1Rank && team2Rank) {
      team1IsFavorite = false
    } else if (team1Rank && team2Rank) {
      const team1IsHome = homeTeamTid === team1Tid
      const adjustedTeam1Rank = team1IsHome ? team1Rank - homeAdvantageRanking : team1Rank
      const adjustedTeam2Rank = homeTeamTid === team2Tid ? team2Rank - homeAdvantageRanking : team2Rank
      team1IsFavorite = adjustedTeam1Rank < adjustedTeam2Rank
    } else if (team1Overall && team2Overall) {
      const team1IsHome = homeTeamTid === team1Tid
      const adjustedTeam1Overall = team1IsHome ? team1Overall + homeAdvantageOverall : team1Overall
      const adjustedTeam2Overall = homeTeamTid === team2Tid ? team2Overall + homeAdvantageOverall : team2Overall
      if (adjustedTeam1Overall > adjustedTeam2Overall) {
        team1IsFavorite = true
      } else if (adjustedTeam1Overall < adjustedTeam2Overall) {
        team1IsFavorite = false
      } else {
        team1IsFavorite = homeTeamTid === team1Tid
      }
    }

    if (team1IsFavorite !== null) {
      const userTeamIsTeam1 = userTid === team1Tid
      return (userTeamIsTeam1 === team1IsFavorite) ? 'favorite' : 'underdog'
    }

    return null
  }

  const isWin = (g) => g.perspective?.userWon === true
  const isLoss = (g) => g.perspective && !g.perspective.userWon

  const buildCoachingHistory = () => {
    const history = []
    const userGames = (currentDynasty.games || [])
      .filter(g => isGamePlayed(g) && getUserGamePerspective(g, currentDynasty, { useHistorical: true }) !== null)
      .map(g => ({
        ...g,
        perspective: getUserGamePerspective(g, currentDynasty, { useHistorical: true })
      }))

    const gamesByTeam = {}
    userGames.forEach(game => {
      let teamKey = null
      if (game.perspective?.userTid) {
        const teamData = currentDynasty.teams?.[game.perspective.userTid]
        teamKey = teamData?.abbr || getAbbrFromTeamName(teamData?.name)
      }

      if (!teamKey) {
        const gameYear = Number(game.year)
        const coachTeamEntry = currentDynasty.coachTeamByYear?.[gameYear]
        teamKey = coachTeamEntry?.team
      }

      if (!teamKey) {
        teamKey = currentTeamAbbr
      }

      if (!gamesByTeam[teamKey]) {
        gamesByTeam[teamKey] = []
      }
      gamesByTeam[teamKey].push(game)
    })

    const getTeamFullName = (abbr) => {
      const mascot = getMascotName(abbr, teamsData)
      if (mascot) return mascot
      return abbr
    }

    const teamStints = Object.entries(gamesByTeam).map(([teamAbbr, games]) => {
      const years = games.map(g => Number(g.year)).filter(y => !isNaN(y) && y > 1900 && y < 3000)
      const startYear = years.length > 0 ? Math.min(...years) : (currentDynasty.startYear || 2024)
      const endYear = years.length > 0 ? Math.max(...years) : (currentDynasty.currentYear || 2024)

      const gamesWithStatus = games.map(g => ({
        ...g,
        computedFavoriteStatus: computeFavoriteStatus(g, g.perspective?.userTid)
      }))

      const wins = gamesWithStatus.filter(isWin).length
      const losses = gamesWithStatus.filter(isLoss).length

      const favoriteGames = gamesWithStatus.filter(g => g.computedFavoriteStatus === 'favorite')
      const favoriteWins = favoriteGames.filter(isWin).length
      const favoriteLosses = favoriteGames.filter(isLoss).length
      const underdogGames = gamesWithStatus.filter(g => g.computedFavoriteStatus === 'underdog')
      const underdogWins = underdogGames.filter(isWin).length
      const underdogLosses = underdogGames.filter(isLoss).length

      const bowlGames = gamesWithStatus.filter(g => detectGameType(g) === GAME_TYPES.BOWL)
      const bowlWins = bowlGames.filter(isWin).length
      const bowlLosses = bowlGames.filter(isLoss).length

      const cfpGames = gamesWithStatus.filter(g => {
        const gameType = detectGameType(g)
        return gameType === GAME_TYPES.CFP_FIRST_ROUND ||
               gameType === GAME_TYPES.CFP_QUARTERFINAL ||
               gameType === GAME_TYPES.CFP_SEMIFINAL ||
               gameType === GAME_TYPES.CFP_CHAMPIONSHIP
      })
      const cfpWins = cfpGames.filter(isWin).length
      const cfpLosses = cfpGames.filter(isLoss).length

      const confChampGames = gamesWithStatus.filter(g => detectGameType(g) === GAME_TYPES.CONFERENCE_CHAMPIONSHIP)
      const confChampWins = confChampGames.filter(isWin).length

      const cfpYears = new Set(cfpGames.map(g => g.year)).size

      const teamTid = getTidFromAbbr(teamAbbr)

      return {
        teamAbbr,
        teamTid,
        teamName: getTeamFullName(teamAbbr),
        startYear,
        endYear,
        wins,
        losses,
        overallRecord: `${wins}-${losses}`,
        favoriteRecord: `${favoriteWins}-${favoriteLosses}`,
        underdogRecord: `${underdogWins}-${underdogLosses}`,
        bowlRecord: `${bowlWins}-${bowlLosses}`,
        cfpRecord: `${cfpWins}-${cfpLosses}`,
        favoriteGames,
        underdogGames,
        bowlGames,
        cfpGames,
        confChampGames,
        confChampionships: confChampWins,
        playoffAppearances: cfpYears,
        games: gamesWithStatus
      }
    }).sort((a, b) => a.startYear - b.startYear)

    const currentTeamFullName = currentDynasty.teamName
    const currentTid = currentDynasty.currentTid != null ? Number(currentDynasty.currentTid) : null
    teamStints.forEach(stint => {
      // Tid match wins; abbr/name only as fallback for legacy stints that
      // predate tid storage.
      const isCurrentTeam = (currentTid != null && stint.teamTid != null && Number(stint.teamTid) === currentTid)
        || stint.teamAbbr === currentTeamAbbr
        || stint.teamName === currentTeamFullName
      stint.isCurrent = isCurrentTeam
      stint.isPast = !isCurrentTeam
      stint.position = currentDynasty.coachPosition || 'HC'
      stint.conference = isCurrentTeam ? currentDynasty.conference : ''
      // National-championship count: use winnerTid (tid-based, drift-safe)
      // when available; fall back to perspective.userWon (which can fail
      // if coachTeamByYear is missing for the year) only if tid isn't on
      // the game record at all.
      stint.nationalChampionships = (stint.cfpGames || []).filter(g => {
        if (detectGameType(g) !== GAME_TYPES.CFP_CHAMPIONSHIP) return false
        if (g.winnerTid != null && stint.teamTid != null) {
          return Number(g.winnerTid) === Number(stint.teamTid)
        }
        return isWin(g)
      }).length
    })

    const hasCurrentTeam = teamStints.some(s => s.isCurrent)
    if (!hasCurrentTeam) {
      const lastStint = teamStints[teamStints.length - 1]
      const isInOffseason = currentDynasty.currentPhase === 'offseason'
      const currentStartYear = lastStint
        ? lastStint.endYear + 1
        : (isInOffseason ? currentDynasty.currentYear + 1 : currentDynasty.startYear)
      const currentEndYear = Math.max(currentStartYear, currentDynasty.currentYear)

      history.push(...teamStints.map(s => ({ ...s, isPast: true, isCurrent: false })))
      history.push({
        teamAbbr: currentTeamAbbr,
        teamTid: getTidFromAbbr(currentTeamAbbr),
        teamName: currentTeamFullName,
        conference: currentDynasty.conference,
        position: currentDynasty.coachPosition || 'HC',
        startYear: currentStartYear,
        endYear: currentEndYear,
        wins: 0,
        losses: 0,
        overallRecord: '0-0',
        favoriteRecord: '0-0',
        underdogRecord: '0-0',
        bowlRecord: '0-0',
        cfpRecord: '0-0',
        favoriteGames: [],
        underdogGames: [],
        bowlGames: [],
        cfpGames: [],
        confChampGames: [],
        games: [],
        confChampionships: 0,
        playoffAppearances: 0,
        nationalChampionships: 0,
        isCurrent: true,
        isPast: false
      })
    } else {
      history.push(...teamStints)
    }

    return history
  }

  const coachingHistory = buildCoachingHistory()

  const awardsByYear = currentDynasty.awardsByYear || {}
  const coachName = currentDynasty.coachName || ''

  coachingHistory.forEach(stint => {
    const stintAwards = []

    for (let year = stint.startYear; year <= stint.endYear; year++) {
      const yearAwards = awardsByYear[year] || {}

      // Awards are stored with team as an abbr string (Google-Sheets-driven
      // shape). Resolve to tid against the current registry, then compare to
      // the stint's tid — survives teambuilder renames since tid is stable.
      // Falls back to abbr compare when either side can't be resolved.
      const dynastyTeams = currentDynasty?.teams || currentDynasty?.customTeams
      const matchesAwardTeamToStint = (awardTeam) => {
        if (!awardTeam) return false
        const awardTid = getTidFromAbbr(awardTeam, dynastyTeams)
        if (awardTid != null && stint.teamTid != null) {
          return Number(awardTid) === Number(stint.teamTid)
        }
        return awardTeam === stint.teamAbbr
      }

      const bryantAward = yearAwards.bearBryantCoachOfTheYear
      if (bryantAward) {
        const matchesTeam = matchesAwardTeamToStint(bryantAward.team)
        const matchesName = coachName && bryantAward.player?.toLowerCase().includes(coachName.toLowerCase())
        if (matchesTeam || matchesName) {
          stintAwards.push({
            year,
            award: 'Bear Bryant Coach of the Year',
            shortName: 'Bear Bryant',
            recipient: bryantAward.player
          })
        }
      }

      const broylesAward = yearAwards.broyles
      if (broylesAward) {
        if (matchesAwardTeamToStint(broylesAward.team)) {
          stintAwards.push({
            year,
            award: 'Broyles Award',
            shortName: 'Broyles',
            recipient: broylesAward.player
          })
        }
      }
    }

    stint.coachAwards = stintAwards
  })

  const careerTotals = coachingHistory.reduce((totals, stint) => {
    return {
      wins: totals.wins + stint.wins,
      losses: totals.losses + stint.losses,
      teams: totals.teams + 1,
      coachOfYearAwards: totals.coachOfYearAwards + (stint.coachAwards?.filter(a => a.shortName === 'Bear Bryant').length || 0)
    }
  }, { wins: 0, losses: 0, teams: 0, coachOfYearAwards: 0 })

  const getGamesForModal = () => {
    if (!selectedTeamForModal) return []
    const stint = coachingHistory.find(s => s.teamName === selectedTeamForModal)
    if (!stint) return []
    if (gamesModalType === 'favorite') return stint.favoriteGames || []
    if (gamesModalType === 'underdog') return stint.underdogGames || []
    if (gamesModalType === 'all') return stint.games || []
    if (gamesModalType === 'bowl') return stint.bowlGames || []
    if (gamesModalType === 'confChamp') return stint.confChampGames || []
    if (gamesModalType === 'cfp') return stint.cfpGames || []
    return []
  }

  const sortedGames = getGamesForModal().sort((a, b) => {
    if (b.year !== a.year) return b.year - a.year
    return (b.week || 0) - (a.week || 0)
  })

  const gamesByYear = sortedGames.reduce((acc, game) => {
    const year = game.year || 'Unknown'
    if (!acc[year]) acc[year] = []
    acc[year].push(game)
    return acc
  }, {})

  const openGamesModal = (type, teamName) => {
    setGamesModalType(type)
    setSelectedTeamForModal(teamName)
    setShowGamesModal(true)
  }

  const careerRange = `${currentDynasty.startYear} – Present`

  return (
    <div className="space-y-4">
      <PageHero
        eyebrow="Career"
        title={currentDynasty.coachName || 'Coach'}
        meta={
          <>
            <span className="tabular font-semibold">
              {careerTotals.wins}-{careerTotals.losses}
            </span>
            <span>·</span>
            <span>{coachingHistory.length} {coachingHistory.length === 1 ? 'team' : 'teams'}</span>
            <span>·</span>
            <span className="tabular">{careerRange}</span>
            {careerTotals.coachOfYearAwards > 0 && (
              <>
                <span>·</span>
                <Badge variant="warning" size="sm">
                  {careerTotals.coachOfYearAwards}× Coach of the Year
                </Badge>
              </>
            )}
          </>
        }
      />

      {(Array.isArray(coachingHistory) ? [...coachingHistory].reverse() : []).map((stint) => {
        if (!stint) return null
        const yearRange = stint.isCurrent
          ? (stint.startYear === stint.endYear ? `${stint.startYear}` : `${stint.startYear} – Present`)
          : (stint.startYear === stint.endYear ? `${stint.startYear}` : `${stint.startYear}–${stint.endYear}`)

        const numSeasons = stint.endYear - stint.startYear + 1
        const winPct = (stint.wins + stint.losses) > 0
          ? ((stint.wins / (stint.wins + stint.losses)) * 100).toFixed(1)
          : '0.0'
        const bowlParts = (stint.bowlRecord || '0-0').split('-')
        const bowlWins = parseInt(bowlParts[0]) || 0
        const bowlLosses = parseInt(bowlParts[1]) || 0

        return (
          <Card key={`${stint.teamName}-${stint.startYear}`} padding="none" accent="left">
            <div className="p-5">
              <div className="flex items-center gap-4 mb-5">
                {stint.teamTid && (
                  <TeamLogo tid={stint.teamTid} teams={teamsData} size="lg" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link
                      to={`${pathPrefix}/team/${resolveTid(stint.teamAbbr, currentDynasty?.teams || TEAMS)}/${stint.endYear}`}
                      className="text-display-md text-txt-primary hover:underline m-0"
                    >
                      {stint.teamName}
                    </Link>
                    {stint.isCurrent && <Badge variant="accent" size="md">Current</Badge>}
                  </div>
                  <div className="flex items-center gap-2 label-sm text-txt-tertiary mt-1 flex-wrap">
                    <span className="font-semibold text-txt-secondary">{getPositionLabel(stint.position)}</span>
                    <span>·</span>
                    <span className="tabular">{yearRange}</span>
                    {stint.conference && (
                      <>
                        <span>·</span>
                        <span>{stint.conference}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div
                className="flex flex-wrap items-center gap-x-5 gap-y-2 px-3 py-2.5 mb-4 rounded-md"
                style={{
                  backgroundColor: 'var(--surface-2)',
                  border: '1px solid var(--surface-4)',
                }}
              >
                <span className="text-sm text-txt-secondary">
                  <span className="font-bold tabular text-txt-primary">{numSeasons}</span>
                  <span className="text-txt-tertiary"> Season{numSeasons !== 1 ? 's' : ''}</span>
                </span>
                <button
                  onClick={() => openGamesModal('all', stint.teamName)}
                  className="text-sm text-txt-secondary hover:text-txt-primary transition-colors"
                >
                  <span className="font-bold tabular text-txt-primary">{stint.overallRecord}</span>
                  <span className="text-txt-tertiary tabular"> ({winPct}%)</span>
                </button>
                {stint.nationalChampionships > 0 && (
                  <button
                    onClick={() => openGamesModal('cfp', stint.teamName)}
                    className="text-sm hover:underline"
                    style={{ color: 'var(--accent-warning)' }}
                  >
                    <span className="font-bold tabular">{stint.nationalChampionships}</span>
                    <span> Natl Champ{stint.nationalChampionships !== 1 ? 's' : ''}</span>
                  </button>
                )}
                {stint.confChampionships > 0 && (
                  <button
                    onClick={() => openGamesModal('confChamp', stint.teamName)}
                    className="text-sm text-txt-secondary hover:text-txt-primary transition-colors"
                  >
                    <span className="font-bold tabular text-txt-primary">{stint.confChampionships}</span>
                    <span> Conf Champ{stint.confChampionships !== 1 ? 's' : ''}</span>
                  </button>
                )}
                {stint.playoffAppearances > 0 && (
                  <button
                    onClick={() => openGamesModal('cfp', stint.teamName)}
                    className="text-sm text-txt-secondary hover:text-txt-primary transition-colors"
                  >
                    <span className="font-bold tabular text-txt-primary">{stint.playoffAppearances}</span>
                    <span> CFP App{stint.playoffAppearances !== 1 ? 's' : ''}</span>
                  </button>
                )}
                {(bowlWins > 0 || bowlLosses > 0) && (
                  <button
                    onClick={() => openGamesModal('bowl', stint.teamName)}
                    className="text-sm text-txt-secondary hover:text-txt-primary transition-colors"
                  >
                    <span className="font-bold tabular text-txt-primary">{bowlWins}-{bowlLosses}</span>
                    <span> Bowls</span>
                  </button>
                )}
              </div>

              <YearByYearTable
                stint={stint}
                currentDynasty={currentDynasty}
                pathPrefix={pathPrefix}
                navigate={navigate}
              />

              {stint.coachAwards && stint.coachAwards.length > 0 && (
                <div className="mt-4">
                  <div className="label-xs text-txt-tertiary mb-2">Coaching Awards</div>
                  <div className="flex flex-wrap gap-2">
                    {stint.coachAwards.map((award, idx) => (
                      <Badge key={idx} variant="warning" size="md">
                        {award.year} {award.shortName}
                        {award.shortName === 'Broyles' && award.recipient && ` · ${award.recipient}`}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </Card>
        )
      })}

      <Modal
        isOpen={showGamesModal}
        onClose={() => setShowGamesModal(false)}
        title={MODAL_TITLES[gamesModalType] || 'Games'}
        size="lg"
      >
        <div className="mb-4 label-xs text-txt-tertiary tabular">
          {sortedGames.length} game{sortedGames.length !== 1 ? 's' : ''}
        </div>

        {sortedGames.length === 0 ? (
          <EmptyState
            title="No games yet"
            message="Games will appear here as you play them."
          />
        ) : (
          <div className="space-y-5">
            {Object.entries(gamesByYear).sort((a, b) => Number(b[0]) - Number(a[0])).map(([year, yearGames]) => (
              <div key={year}>
                <h4 className="text-sm font-semibold text-txt-primary mb-2">{year} Season</h4>
                <Card padding="none">
                  {yearGames.map((game, index) => {
                    const opponentInfo = game.perspective?.opponentTid
                      ? getGameTeamInfo(teamsData || TEAMS, game.perspective.opponentTid)
                      : null
                    const opponentAbbr = opponentInfo?.abbr || ''
                    const opponentName = opponentInfo?.name || getMascotName(opponentAbbr, teamsData) || 'Unknown'
                    const gameType = detectGameType(game)
                    const weekLabel = gameType === GAME_TYPES.CONFERENCE_CHAMPIONSHIP ? 'CC'
                      : gameType === GAME_TYPES.BOWL ? 'Bowl'
                      : gameType.startsWith('cfp_') ? 'CFP'
                      : `W${game.week || '?'}`
                    const gameIsWin = isWin(game)
                    const userScore = game.perspective?.userScore || 0
                    const oppScore = game.perspective?.opponentScore || 0
                    const site = game.perspective?.isHome ? 'HOME'
                      : game.perspective?.isAway ? 'AWAY' : 'NEUTRAL'

                    return (
                      <ScoreRow
                        key={`${year}-${game.week}-${index}`}
                        prefix={weekLabel}
                        tid={game.perspective?.opponentTid}
                        teams={teamsData}
                        teamName={opponentName}
                        teamRank={game.perspective?.opponentRank}
                        result={gameIsWin ? 'W' : 'L'}
                        score={`${Math.max(userScore, oppScore)}-${Math.min(userScore, oppScore)}`}
                        site={site}
                        to={`${pathPrefix}/game/${game.id}`}
                      />
                    )
                  })}
                </Card>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  )
}

function YearByYearTable({ stint, currentDynasty, pathPrefix, navigate }) {
  const startYear = parseInt(stint.startYear) || currentDynasty.startYear
  const endYear = parseInt(stint.endYear) || currentDynasty.currentYear

  if (isNaN(startYear) || isNaN(endYear) || endYear < startYear || endYear - startYear > 50) {
    return null
  }

  const isStintTeamInGame = (g) => g && (g.team1Tid === stint.teamTid || g.team2Tid === stint.teamTid || g.team1 === stint.teamAbbr || g.team2 === stint.teamAbbr)
  const didStintTeamWin = (g) => g && (g.winnerTid === stint.teamTid || g.winner === stint.teamAbbr)

  const years = []
  for (let year = startYear; year <= endYear; year++) {
    const yearGames = stint.games?.filter(g => Number(g.year) === year) || []
    const wins = yearGames.filter(g => g.perspective?.userWon).length
    const losses = yearGames.filter(g => g.perspective && !g.perspective.userWon).length
    const hasRecord = yearGames.length > 0

    const ccWins = currentDynasty.conferenceChampionshipsByYear?.[year] || []
    const wonCC = ccWins.some(cc => cc.winnerTid === stint.teamTid || cc.winner === stint.teamAbbr)

    let finalRank = null
    const rankings = currentDynasty.rankingsByYear?.[year]
    if (rankings?.final) {
      const teamRank = rankings.final.find(r => {
        const rankTid = r.tid || resolveTid(r.team || r.abbr, currentDynasty?.teams || TEAMS)
        return rankTid === stint.teamTid || r.team === stint.teamAbbr
      })
      if (teamRank) finalRank = teamRank.rank
    }

    const cfpResults = currentDynasty.cfpResultsByYear?.[year]
    let cfpResult = null
    if (cfpResults) {
      const rounds = ['firstRound', 'quarterfinals', 'semifinals', 'championship']
      const roundLabels = { firstRound: 'First Round', quarterfinals: 'Quarterfinals', semifinals: 'Semifinals', championship: 'Championship' }
      for (const round of rounds) {
        const roundGames = cfpResults[round] || []
        for (const game of roundGames) {
          if (!game) continue
          if (isStintTeamInGame(game)) {
            if (didStintTeamWin(game)) {
              if (round === 'championship') {
                cfpResult = { type: 'champion' }
              }
            } else if (game.winner || game.winnerTid) {
              cfpResult = { type: 'lost', round: roundLabels[round] }
            }
          }
        }
      }
    }
    const isNationalChamp = cfpResult?.type === 'champion'

    let bowlResult = null
    if (!cfpResult) {
      const bowlGamesData = currentDynasty.bowlGamesByYear?.[year]
      const bowlGames = Array.isArray(bowlGamesData) ? bowlGamesData : []
      const teamBowl = bowlGames.find(b => isStintTeamInGame(b))
      if (teamBowl && (teamBowl.winner || teamBowl.winnerTid)) {
        bowlResult = {
          bowlName: teamBowl.bowlName?.replace(' Bowl', '') || 'Bowl',
          won: didStintTeamWin(teamBowl)
        }
      }
    }

    let postseasonText = '—'
    if (cfpResult?.type === 'champion') {
      postseasonText = 'Won the National Championship'
    } else if (cfpResult?.type === 'lost') {
      postseasonText = `Lost in ${cfpResult.round}`
    } else if (bowlResult) {
      postseasonText = bowlResult.won ? `Won the ${bowlResult.bowlName}` : `Lost the ${bowlResult.bowlName}`
    }

    years.push({ year, wins, losses, hasRecord, wonCC, cfpResult, bowlResult, isNationalChamp, finalRank, postseasonText })
  }

  if (years.length === 0) return null
  years.sort((a, b) => b.year - a.year)

  return (
    <Card padding="none">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: '1px solid var(--surface-4)' }}>
              <th className="px-4 py-2 text-left label-xs text-txt-tertiary">Year</th>
              <th className="px-4 py-2 text-left label-xs text-txt-tertiary">Record</th>
              <th className="px-4 py-2 text-left label-xs text-txt-tertiary">Final Rank</th>
              <th className="px-4 py-2 text-left label-xs text-txt-tertiary">Postseason</th>
            </tr>
          </thead>
          <tbody>
            {years.map((yr, idx) => (
              <tr
                key={yr.year}
                onClick={() => navigate(`${pathPrefix}/team/${resolveTid(stint.teamAbbr, currentDynasty?.teams || TEAMS)}/${yr.year}`)}
                className="cursor-pointer hover:bg-surface-3 transition-colors"
                style={{
                  borderBottom: idx < years.length - 1 ? '1px solid var(--surface-4)' : 'none',
                  borderLeft: yr.isNationalChamp ? '3px solid var(--accent-warning)' : '3px solid transparent',
                }}
              >
                <td className="px-4 py-2.5 font-semibold tabular text-txt-primary">
                  {yr.year}
                </td>
                <td
                  className="px-4 py-2.5 font-semibold tabular"
                  style={{ color: yr.hasRecord ? 'var(--text-primary)' : 'var(--text-tertiary)' }}
                >
                  {yr.hasRecord ? `${yr.wins}-${yr.losses}` : '—'}
                </td>
                <td
                  className="px-4 py-2.5 tabular"
                  style={{ color: yr.finalRank ? 'var(--accent-warning)' : 'var(--text-tertiary)' }}
                >
                  {yr.finalRank ? `#${yr.finalRank}` : 'N/R'}
                </td>
                <td
                  className="px-4 py-2.5"
                  style={{ color: yr.isNationalChamp ? 'var(--accent-warning)' : 'var(--text-secondary)' }}
                >
                  {yr.isNationalChamp ? (
                    <span className="font-semibold">{yr.postseasonText}</span>
                  ) : yr.postseasonText}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
