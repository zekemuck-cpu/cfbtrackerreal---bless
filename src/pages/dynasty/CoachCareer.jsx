import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useDynasty, detectGameType, GAME_TYPES, getTeamGamePerspective } from '../../context/DynastyContext'
import { useAuth } from '../../context/AuthContext'
import { usePathPrefix } from '../../hooks/usePathPrefix'
import { TEAMS, resolveTid, getCurrentTeamAbbr, getGameTeamInfo, getAbbrFromTeamName, getTidFromAbbr } from '../../data/teamRegistry'
import { getMascotName as getMascotNameFromTeams } from '../../data/teams'
import {
  getEditors,
  getMemberLabel,
  getMemberTeamsForYear,
  getRole,
  ROLE_COMMISH,
  ROLE_COCOMMISH,
} from '../../data/leagueModel'
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
  const { user } = useAuth()
  const pathPrefix = usePathPrefix()
  const navigate = useNavigate()
  const [showGamesModal, setShowGamesModal] = useState(false)
  const [gamesModalType, setGamesModalType] = useState(null)
  const [selectedTeamForModal, setSelectedTeamForModal] = useState(null)

  // The career being viewed. Defaults to the logged-in user; the
  // inline picker below lets any signed-in viewer flip to another
  // member's career instead.
  const [selectedUid, setSelectedUid] = useState(() => user?.uid || currentDynasty?.userId || null)

  if (!currentDynasty) return null

  const currentTeamAbbr = getCurrentTeamAbbr(currentDynasty)
  const teamsData = currentDynasty?.teams || currentDynasty?.customTeams

  // Build the user picker options: commish first, then co-commishes,
  // then members. Each entry shows the member label (or a sensible
  // default) so the dropdown is human-readable.
  const allEditors = (() => {
    const ownerUid = currentDynasty.userId
    const editors = getEditors(currentDynasty)
    const ordered = ownerUid ? [ownerUid, ...editors.filter(u => u !== ownerUid)] : [...editors]
    // Stable sort: commish → cocommish → member.
    return ordered.sort((a, b) => {
      const order = { [ROLE_COMMISH]: 0, [ROLE_COCOMMISH]: 1 }
      const ra = order[getRole(currentDynasty, a)] ?? 2
      const rb = order[getRole(currentDynasty, b)] ?? 2
      return ra - rb
    })
  })()

  const userOptions = allEditors.map(uid => {
    const role = getRole(currentDynasty, uid)
    const label = getMemberLabel(currentDynasty, uid)
    const fallback = uid === currentDynasty.userId
      ? (currentDynasty.coachName || 'Commish')
      : (role === ROLE_COCOMMISH ? 'Co-Commish' : 'Member')
    return {
      uid,
      role,
      label: label || fallback,
      isYou: user?.uid === uid,
    }
  })

  // If the saved selection no longer applies (member was removed,
  // for example), fall back to the logged-in user.
  const effectiveSelectedUid = userOptions.some(o => o.uid === selectedUid)
    ? selectedUid
    : (user?.uid || currentDynasty.userId)

  const selectedOption = userOptions.find(o => o.uid === effectiveSelectedUid) || null
  const selectedDisplayName = selectedOption?.label || 'Coach'

  // Resolve a uid's tids for a given year — preferred source is the
  // per-year history snapshot; falls back to legacy coachTeamByYear
  // for the dynasty owner (so existing solo dynasties still render).
  const getUserTeamsForYear = (uid, year) => {
    const yearNum = Number(year)
    if (!Number.isFinite(yearNum) || !uid) return []
    const fromHistory = getMemberTeamsForYear(currentDynasty, uid, yearNum)
    if (fromHistory.length > 0) return fromHistory
    if (uid === currentDynasty.userId) {
      const cty = currentDynasty.coachTeamByYear?.[yearNum] || currentDynasty.coachTeamByYear?.[String(yearNum)]
      if (cty?.tid != null) return [Number(cty.tid)]
      if (cty?.team) {
        const tid = getTidFromAbbr(cty.team, currentDynasty)
        if (tid) return [tid]
      }
    }
    return []
  }

  // Project a game into the existing perspective shape from the angle
  // of one of `uid`'s teams that played in it. Returns null when
  // none of the user's teams participated that year.
  const buildPerspectiveForUid = (game, uid) => {
    const yearNum = Number(game.year)
    if (!Number.isFinite(yearNum)) return null
    const userTids = getUserTeamsForYear(uid, yearNum)
    if (userTids.length === 0) return null
    const matchedTid = userTids.find(tid =>
      Number(game.team1Tid) === Number(tid) || Number(game.team2Tid) === Number(tid)
    )
    if (matchedTid == null) return null
    const tp = getTeamGamePerspective(game, Number(matchedTid))
    if (!tp) return null
    const isTeam1 = Number(game.team1Tid) === Number(matchedTid)
    return {
      userTid: tp.teamTid,
      opponentTid: tp.opponentTid,
      userScore: tp.teamScore,
      opponentScore: tp.opponentScore,
      userWon: tp.won,
      userRank: tp.teamRank,
      opponentRank: tp.opponentRank,
      userOverall: isTeam1 ? game.team1Overall : game.team2Overall,
      opponentOverall: isTeam1 ? game.team2Overall : game.team1Overall,
      isHome: tp.isHome,
      isAway: tp.isAway,
      isNeutral: tp.isNeutral,
    }
  }

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
    const uid = effectiveSelectedUid
    if (!uid) return history

    const userGames = (currentDynasty.games || [])
      .map(g => {
        if (!isGamePlayed(g)) return null
        const perspective = buildPerspectiveForUid(g, uid)
        if (!perspective) return null
        return { ...g, perspective }
      })
      .filter(Boolean)

    const gamesByTeam = {}
    userGames.forEach(game => {
      let teamKey = null
      if (game.perspective?.userTid) {
        const teamData = currentDynasty.teams?.[game.perspective.userTid]
        teamKey = teamData?.abbr || getAbbrFromTeamName(teamData?.name)
      }
      // Owner-only legacy fallback — older dynasties may not have
      // tids on every game record.
      if (!teamKey && uid === currentDynasty.userId) {
        const gameYear = Number(game.year)
        const coachTeamEntry = currentDynasty.coachTeamByYear?.[gameYear]
        teamKey = coachTeamEntry?.team
      }
      if (!teamKey && uid === currentDynasty.userId) {
        teamKey = currentTeamAbbr
      }
      if (!teamKey) return // skip games we can't attribute to a team

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

      // Pass dynasty so TB abbrs (not in static FBS map) resolve via
      // dynasty.teams[tid].abbr. Without this, tid for STONY/etc. is
      // null, the stint is never flagged isCurrent, and the placeholder
      // current-stint code path injects a duplicate "2030" card.
      const teamTid = getTidFromAbbr(teamAbbr, currentDynasty)

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
    // "Current" team for the selected user is whichever team(s) they
    // hold for the dynasty's current year — not the dynasty-doc-level
    // currentTid (which the override layer may have already remapped
    // to the viewer's own team).
    const myCurrentTids = new Set(
      getUserTeamsForYear(uid, currentDynasty.currentYear).map(Number)
    )
    teamStints.forEach(stint => {
      const isCurrentTeam = stint.teamTid != null && myCurrentTids.has(Number(stint.teamTid))
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

      // Pick the user's primary "current team" for an empty-stint card.
      // Prefer their actual assigned team for the current year; for the
      // owner with no assignment, fall back to the dynasty-level team.
      const myFirstCurrentTid = [...myCurrentTids][0]
      const fallbackTid = uid === currentDynasty.userId
        ? getTidFromAbbr(currentTeamAbbr, currentDynasty)
        : null
      const placeholderTid = myFirstCurrentTid != null ? myFirstCurrentTid : fallbackTid
      const placeholderTeam = placeholderTid != null ? currentDynasty.teams?.[placeholderTid] : null
      const placeholderAbbr = placeholderTeam?.abbr || (placeholderTid == null ? '' : currentTeamAbbr)
      const placeholderName = placeholderTeam?.name || (uid === currentDynasty.userId ? currentTeamFullName : '')

      history.push(...teamStints.map(s => ({ ...s, isPast: true, isCurrent: false })))
      // Only inject a placeholder current-stint if we actually have a
      // team to attribute it to — otherwise the user genuinely has no
      // current team in the dynasty (e.g., not yet assigned).
      if (placeholderTid != null) history.push({
        teamAbbr: placeholderAbbr,
        teamTid: placeholderTid,
        teamName: placeholderName,
        conference: uid === currentDynasty.userId ? currentDynasty.conference : '',
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
  // Coach-name match for awards is meaningful only for the dynasty
  // owner (who provides their name via dynasty.coachName). For other
  // members, awards still match by team — the name path is just
  // skipped.
  const coachName = effectiveSelectedUid === currentDynasty.userId
    ? (currentDynasty.coachName || '')
    : ''

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

  // Career range for the selected user — earliest stint year through
  // present. Falls back to the dynasty's start year for users who have
  // no recorded stints yet (e.g., a member who hasn't played a game).
  const careerStartYear = coachingHistory.length > 0
    ? Math.min(...coachingHistory.map(s => s.startYear).filter(Number.isFinite))
    : currentDynasty.startYear
  const careerRange = Number.isFinite(careerStartYear)
    ? `${careerStartYear} – Present`
    : '—'
  const careerWinPct = (careerTotals.wins + careerTotals.losses) > 0
    ? ((careerTotals.wins / (careerTotals.wins + careerTotals.losses)) * 100).toFixed(1)
    : '0.0'

  return (
    <div className="space-y-5">
      {/* Career hero — name as a heavy display headline with the win
          record as a separate emphatic stat cluster on the right. The
          old PageHero collapsed everything into a comma-separated
          meta line which buried the most important number on the page
          (the lifetime W-L). Now the headline carries the identity
          and the stat block carries the math. */}
      <section className="card overflow-hidden reveal">
        <div className="px-6 py-7 sm:px-8 sm:py-8 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6">
          <div className="min-w-0 flex-1">
            <div className="label-xs text-txt-tertiary mb-2 flex items-center gap-2 flex-wrap" style={{ letterSpacing: '2px' }}>
              <span>Career</span>
              {userOptions.length > 1 && (
                <>
                  <span className="text-txt-muted">·</span>
                  <span className="text-txt-tertiary normal-case" style={{ letterSpacing: '0' }}>Viewing</span>
                  <select
                    value={effectiveSelectedUid || ''}
                    onChange={e => setSelectedUid(e.target.value)}
                    aria-label="Switch career view"
                    className="text-xs font-semibold px-2 py-1 rounded-md bg-surface-2 border border-surface-4 text-txt-primary cursor-pointer focus:outline-none focus:border-blue-500 normal-case"
                    style={{ letterSpacing: '0' }}
                  >
                    {userOptions.map(opt => (
                      <option key={opt.uid} value={opt.uid}>
                        {opt.label}{opt.isYou ? ' (you)' : ''}
                        {opt.role === ROLE_COMMISH ? ' · Commish' : opt.role === ROLE_COCOMMISH ? ' · Co-Commish' : ''}
                      </option>
                    ))}
                  </select>
                </>
              )}
            </div>
            <h1
              className="m-0 text-txt-primary leading-[0.95] uppercase break-words"
              style={{
                fontFamily: "'Bebas Neue', sans-serif",
                fontSize: 'clamp(2.5rem, 6vw, 4.5rem)',
                letterSpacing: '0.5px',
              }}
            >
              {selectedDisplayName}
            </h1>
            <div className="flex items-center gap-2 mt-3 label-sm text-txt-tertiary flex-wrap">
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
            </div>
          </div>
          <div className="flex items-baseline gap-5 flex-shrink-0">
            <div className="text-right">
              <div
                className="text-txt-primary leading-none tabular"
                style={{
                  fontFamily: "'Bebas Neue', sans-serif",
                  fontSize: 'clamp(2.25rem, 4.5vw, 3.5rem)',
                  letterSpacing: '-0.01em',
                }}
              >
                {careerTotals.wins}–{careerTotals.losses}
              </div>
              <div className="label-xs text-txt-tertiary mt-1" style={{ letterSpacing: '1.5px' }}>Record</div>
            </div>
            <div className="text-right">
              <div
                className="text-txt-secondary leading-none tabular"
                style={{
                  fontFamily: "'Bebas Neue', sans-serif",
                  fontSize: 'clamp(1.75rem, 3vw, 2.5rem)',
                }}
              >
                {careerWinPct}%
              </div>
              <div className="label-xs text-txt-tertiary mt-1" style={{ letterSpacing: '1.5px' }}>Win&nbsp;pct</div>
            </div>
          </div>
        </div>
      </section>

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

        const showsBowls = bowlWins > 0 || bowlLosses > 0

        // Mini stat-tile presentation. Each tile is value + label; the
        // value is the eye magnet and the label sits below in small
        // tracking. Replaces the previous comma-separated row of
        // "<n> Seasons · <record> (<pct>%) · <bowls>". The previous
        // version was scannable but generic; this version gives the
        // page a signature.
        const StatTile = ({ value, label, accent = false, onClick }) => {
          const inner = (
            <>
              <div
                className="leading-none tabular"
                style={{
                  fontFamily: "'Bebas Neue', sans-serif",
                  fontSize: 'clamp(1.5rem, 2.5vw, 2rem)',
                  color: accent ? 'var(--accent-warning)' : 'var(--text-primary)',
                }}
              >
                {value}
              </div>
              <div
                className="label-xs text-txt-tertiary mt-1"
                style={{ letterSpacing: '1.5px' }}
              >
                {label}
              </div>
            </>
          )
          if (!onClick) {
            return (
              <div className="px-3 py-2 rounded-md" style={{ backgroundColor: 'var(--surface-2)', border: '1px solid var(--surface-4)' }}>
                {inner}
              </div>
            )
          }
          return (
            <button
              onClick={onClick}
              className="px-3 py-2 rounded-md text-left transition-colors hover:bg-surface-3"
              style={{ backgroundColor: 'var(--surface-2)', border: '1px solid var(--surface-4)' }}
            >
              {inner}
            </button>
          )
        }

        return (
          <Card
            key={`${stint.teamName}-${stint.startYear}`}
            padding="none"
            className={stint.isCurrent ? '' : 'opacity-[0.94]'}
          >
            <div className="p-5 sm:p-6">
              {/* Stint header — wider logo, Bebas Neue display name,
                  meta below with semantic separators. Current vs past
                  distinguished by the parent Card's accent + a more
                  prominent "Current" badge here. Past stints stay
                  visually muted (parent card is at 96% opacity). */}
              <div className="flex items-center gap-4 sm:gap-5 mb-5">
                {stint.teamTid && (
                  <div className="flex-shrink-0">
                    <TeamLogo tid={stint.teamTid} teams={teamsData} size="xl" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <Link
                      to={`${pathPrefix}/team/${resolveTid(stint.teamAbbr, currentDynasty?.teams || TEAMS)}/${stint.endYear}`}
                      className="text-txt-primary hover:opacity-80 transition-opacity m-0 leading-[0.95] uppercase break-words"
                      style={{
                        fontFamily: "'Bebas Neue', sans-serif",
                        fontSize: 'clamp(1.75rem, 3.5vw, 2.5rem)',
                        letterSpacing: '0.5px',
                      }}
                    >
                      {stint.teamName}
                    </Link>
                    {stint.isCurrent && <Badge variant="accent" size="md">Current</Badge>}
                    {!stint.isCurrent && <Badge variant="outline" size="sm">Past</Badge>}
                  </div>
                  <div className="flex items-center gap-2 label-sm text-txt-tertiary mt-2 flex-wrap">
                    <span className="font-semibold text-txt-secondary uppercase" style={{ letterSpacing: '1px', fontSize: '11px' }}>
                      {getPositionLabel(stint.position)}
                    </span>
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

              {/* Stat tiles — wrap on narrow viewports, stay on one row
                  on tablet+. Clickable tiles open the games modal for
                  that subset; informational tiles (Seasons) just
                  display. National-championship tile gets the warning
                  accent. */}
              <div className="flex flex-wrap gap-2 mb-5">
                <StatTile value={numSeasons} label={numSeasons === 1 ? 'Season' : 'Seasons'} />
                <StatTile
                  value={stint.overallRecord}
                  label={`Record · ${winPct}%`}
                  onClick={() => openGamesModal('all', stint.teamName)}
                />
                {stint.nationalChampionships > 0 && (
                  <StatTile
                    value={stint.nationalChampionships}
                    label={stint.nationalChampionships === 1 ? 'Natl Title' : 'Natl Titles'}
                    accent
                    onClick={() => openGamesModal('cfp', stint.teamName)}
                  />
                )}
                {stint.confChampionships > 0 && (
                  <StatTile
                    value={stint.confChampionships}
                    label={stint.confChampionships === 1 ? 'Conf Title' : 'Conf Titles'}
                    onClick={() => openGamesModal('confChamp', stint.teamName)}
                  />
                )}
                {stint.playoffAppearances > 0 && (
                  <StatTile
                    value={stint.playoffAppearances}
                    label={stint.playoffAppearances === 1 ? 'CFP App' : 'CFP Apps'}
                    onClick={() => openGamesModal('cfp', stint.teamName)}
                  />
                )}
                {showsBowls && (
                  <StatTile
                    value={`${bowlWins}-${bowlLosses}`}
                    label="Bowls"
                    onClick={() => openGamesModal('bowl', stint.teamName)}
                  />
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
                  <div className="label-xs text-txt-tertiary mb-2" style={{ letterSpacing: '1.5px' }}>Coaching Awards</div>
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
                      : gameType === GAME_TYPES.CFP_FIRST_ROUND ? '1R'
                      : gameType === GAME_TYPES.CFP_QUARTERFINAL ? 'QF'
                      : gameType === GAME_TYPES.CFP_SEMIFINAL ? 'SF'
                      : gameType === GAME_TYPES.CFP_CHAMPIONSHIP ? 'Natty'
                      : `W${game.week || '?'}`
                    const roundLabel = gameType === GAME_TYPES.CFP_FIRST_ROUND ? 'First Round'
                      : gameType === GAME_TYPES.CFP_QUARTERFINAL ? 'Quarterfinal'
                      : gameType === GAME_TYPES.CFP_SEMIFINAL ? 'Semifinal'
                      : gameType === GAME_TYPES.CFP_CHAMPIONSHIP ? 'National Championship'
                      : null
                    const gameIsWin = isWin(game)
                    const userScore = game.perspective?.userScore || 0
                    const oppScore = game.perspective?.opponentScore || 0
                    const site = game.perspective?.isHome ? 'HOME'
                      : game.perspective?.isAway ? 'AWAY' : 'NEUTRAL'
                    const isNatty = gameType === GAME_TYPES.CFP_CHAMPIONSHIP

                    const row = (
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
                        notes={roundLabel ? [roundLabel] : []}
                        to={`${pathPrefix}/game/${game.id}`}
                      />
                    )
                    if (isNatty) {
                      return (
                        <div
                          key={`${year}-${game.week}-${index}-wrap`}
                          className="natty-glow"
                          style={{
                            border: '1.5px solid #fbbf24',
                            borderRadius: '8px',
                            background: 'linear-gradient(180deg, rgba(251,191,36,0.07), rgba(251,191,36,0.02))',
                            boxShadow: '0 0 14px rgba(251,191,36,0.45), 0 0 28px rgba(251,191,36,0.18)',
                            margin: '6px 4px',
                            overflow: 'hidden',
                          }}
                        >
                          {row}
                        </div>
                      )
                    }
                    return row
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

  // Visual treatment per row:
  // - Champion years: gold left rail + subtle gold tint background
  // - CFP appearance (lost): team accent left rail
  // - Bowl win: subtle success tint (left rail only)
  // - Top-4 final rank: gold rank chip
  // - Top-25 final rank: muted-warning rank text
  // - Unranked: an em-dash in a faded color (not "N/R" — a code-y abbreviation
  //   that broke the editorial feel of the rest of the page)
  const rankTreatment = (rank) => {
    if (!rank) return { text: '—', color: 'var(--text-tertiary)', bold: false }
    if (rank <= 4)  return { text: `#${rank}`, color: 'var(--accent-warning)', bold: true }
    if (rank <= 10) return { text: `#${rank}`, color: 'var(--accent-warning)', bold: false }
    if (rank <= 25) return { text: `#${rank}`, color: 'var(--text-primary)', bold: false }
    return { text: `#${rank}`, color: 'var(--text-secondary)', bold: false }
  }

  const rowAccent = (yr) => {
    if (yr.isNationalChamp) return { rail: 'var(--accent-warning)', tint: 'rgba(234, 179, 8, 0.06)' }
    if (yr.cfpResult?.type === 'lost') return { rail: 'var(--team-primary, var(--surface-5))', tint: 'transparent' }
    if (yr.bowlResult?.won) return { rail: 'rgba(34, 197, 94, 0.45)', tint: 'transparent' }
    return { rail: 'transparent', tint: 'transparent' }
  }

  return (
    <Card padding="none">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: '1px solid var(--surface-4)', backgroundColor: 'var(--surface-1)' }}>
              <th className="px-4 py-2.5 text-left label-xs text-txt-tertiary" style={{ letterSpacing: '1.5px' }}>Year</th>
              <th className="px-4 py-2.5 text-left label-xs text-txt-tertiary" style={{ letterSpacing: '1.5px' }}>Record</th>
              <th className="px-4 py-2.5 text-left label-xs text-txt-tertiary" style={{ letterSpacing: '1.5px' }}>Final Rank</th>
              <th className="px-4 py-2.5 text-left label-xs text-txt-tertiary" style={{ letterSpacing: '1.5px' }}>Postseason</th>
            </tr>
          </thead>
          <tbody>
            {years.map((yr, idx) => {
              const rank = rankTreatment(yr.finalRank)
              const accent = rowAccent(yr)
              return (
                <tr
                  key={yr.year}
                  onClick={() => navigate(`${pathPrefix}/team/${resolveTid(stint.teamAbbr, currentDynasty?.teams || TEAMS)}/${yr.year}`)}
                  className="cursor-pointer hover:bg-surface-3 transition-colors"
                  style={{
                    borderBottom: idx < years.length - 1 ? '1px solid var(--surface-4)' : 'none',
                    borderLeft: `3px solid ${accent.rail}`,
                    backgroundColor: accent.tint,
                  }}
                >
                  <td className="px-4 py-3 font-semibold tabular text-txt-primary">
                    {yr.year}
                  </td>
                  <td
                    className="px-4 py-3 tabular"
                    style={{
                      color: yr.hasRecord ? 'var(--text-primary)' : 'var(--text-tertiary)',
                      fontWeight: yr.hasRecord ? 600 : 400,
                    }}
                  >
                    {yr.hasRecord ? `${yr.wins}-${yr.losses}` : '—'}
                  </td>
                  <td
                    className="px-4 py-3 tabular"
                    style={{ color: rank.color, fontWeight: rank.bold ? 700 : 500 }}
                  >
                    {rank.text}
                  </td>
                  <td
                    className="px-4 py-3"
                    style={{ color: yr.isNationalChamp ? 'var(--accent-warning)' : 'var(--text-secondary)' }}
                  >
                    {yr.isNationalChamp ? (
                      <span className="font-semibold">{yr.postseasonText}</span>
                    ) : yr.postseasonText}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
