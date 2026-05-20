import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useDynasty, detectGameType, GAME_TYPES, getTeamGamePerspective, getTeamRanking } from '../../context/DynastyContext'
import { weekSortKey } from '../../utils/compareUtils'
import { useAuth } from '../../context/AuthContext'
import { usePathPrefix } from '../../hooks/usePathPrefix'
import { TEAMS, resolveTid, getCurrentTeamAbbr, getGameTeamInfo, getAbbrFromTeamName, getTidFromAbbr } from '../../data/teamRegistry'
import { getMascotName as getMascotNameFromTeams } from '../../data/teams'
import {
  getEditors,
  getMemberLabel,
  getMemberTeamsForYear,
  getCoachNameForUid,
  getRole,
  ROLE_COMMISH,
  ROLE_COCOMMISH,
} from '../../data/leagueModel'
import {
  PageHero,
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
  careerAll: 'All Career Games',
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
  // member's career instead. ?uid=... in the URL deep-links into a
  // specific coach's career (used by the Coaches leaderboard).
  const [searchParams, setSearchParams] = useSearchParams()
  const uidFromUrl = searchParams.get('uid')
  const [selectedUid, setSelectedUid] = useState(
    () => uidFromUrl || user?.uid || currentDynasty?.userId || null,
  )
  // Sync state when the URL param changes (e.g. when navigating from the
  // Coaches leaderboard while already on this page).
  useEffect(() => {
    if (uidFromUrl && uidFromUrl !== selectedUid) {
      setSelectedUid(uidFromUrl)
    }
  }, [uidFromUrl]) // eslint-disable-line react-hooks/exhaustive-deps

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
    return {
      uid,
      role,
      // Single source of truth — same name everywhere.
      label: getCoachNameForUid(currentDynasty, uid),
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

  // Resolve a uid's tids for a given year. memberTeamHistory[uid] is
  // the SINGLE SOURCE OF TRUTH whenever it exists at all — even if a
  // specific year is absent from it (the user explicitly removed that
  // year via the Members timeline editor and meant for it to be empty).
  // Only fall back to the legacy owner-only coachTeamByYear when the
  // user has NEVER been touched by the timeline editor.
  const getUserTeamsForYear = (uid, year) => {
    const yearNum = Number(year)
    if (!Number.isFinite(yearNum) || !uid) return []
    // If the user has ANY entry in memberTeamHistory, trust it exclusively.
    const hasHistory = currentDynasty.memberTeamHistory?.[uid] != null
    if (hasHistory) {
      return getMemberTeamsForYear(currentDynasty, uid, yearNum)
    }
    // Pre-migration owner-only fallback: read legacy coachTeamByYear.
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
  // Awards-by-name match: use the selected coach's display label so
  // that any member whose name happens to match the awards data gets
  // attributed. memberLabels[uid] is the canonical source; fallback
  // chain handled by getCoachNameForUid.
  const coachName = getCoachNameForUid(currentDynasty, effectiveSelectedUid, '')

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
    if (gamesModalType === 'careerAll') {
      // Flatten games across every stint for the lifetime view.
      return coachingHistory.flatMap(s => s.games || [])
    }
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
    // weekSortKey handles CCG (sorts at 14.5, after Week 14) and other
    // non-numeric week sentinels — plain `b.week - a.week` produces NaN
    // for CCG games and leaves them at arbitrary positions.
    return weekSortKey(b.week) - weekSortKey(a.week)
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
      {/* Career hero — editorial split. Identity (eyebrow + name + range)
          stacks on the left; lifetime totals sit in a unified broadcast
          stat strip below the name, full-width on mobile. The strip
          replaces the previous comma-list meta + side stat cluster so
          the page leads with one cohesive lockup instead of two. */}
      <section className="media-card overflow-hidden reveal">
        <div className="px-3 py-3 sm:px-6 sm:py-5">
          <div className="label-xs text-txt-tertiary mb-2 flex items-center gap-2 flex-wrap" style={{ letterSpacing: '2.5px', fontSize: '10px' }}>
            <span>CAREER</span>
            {userOptions.length > 1 && (
              <>
                
                <span className="text-txt-tertiary normal-case" style={{ letterSpacing: '0' }}>Viewing</span>
                <select
                  value={effectiveSelectedUid || ''}
                  onChange={e => setSelectedUid(e.target.value)}
                  aria-label="Switch career view"
                  className="text-xs font-semibold px-2 py-1 rounded-md bg-surface-2 border border-surface-4 text-txt-primary cursor-pointer focus:outline-none focus:border-surface-5 normal-case"
                  style={{ letterSpacing: '0' }}
                >
                  {userOptions.map(opt => (
                    <option key={opt.uid} value={opt.uid}>
                      {opt.label}{opt.isYou ? ' (you)' : ''}
                      {opt.role === ROLE_COMMISH ? ' Commish' : opt.role === ROLE_COCOMMISH ? ' Co-Commish' : ''}
                    </option>
                  ))}
                </select>
              </>
            )}
          </div>
          {/* Identity + stat strip — single row on desktop (stats push
              right of the name), wraps below on mobile. Saves a full
              row of vertical space vs the prior stacked layout, and the
              stats no longer feel orphaned from the headline. */}
          <div className="flex items-end gap-x-6 sm:gap-x-10 gap-y-3 flex-wrap">
            <div className="min-w-0">
              <h1
                className="m-0 text-txt-primary leading-[0.9] uppercase break-words"
                style={{
                  fontFamily: "'Bebas Neue', sans-serif",
                  fontSize: 'clamp(2rem, 4.5vw, 3.25rem)',
                  letterSpacing: '0.5px',
                }}
              >
                {selectedDisplayName}
              </h1>
              <div
                className="label-xs text-txt-tertiary mt-1.5 tabular-nums"
                style={{ letterSpacing: '1.8px', fontSize: '10px' }}
              >
                {careerRange}
              </div>
            </div>

            {/* Broadcast-style stat strip — sits inline with the name on
                desktop via ml-auto, wraps below on mobile. Hairline
                vertical separators, tabular numerals. Number scale is
                slightly trimmed (1.4-2rem vs the headline's 2-3.25rem)
                so the name keeps top billing in the lockup. */}
            <div className="flex items-end gap-4 sm:gap-7 flex-wrap sm:ml-auto">
              <button
                type="button"
                onClick={() => {
                  setGamesModalType('careerAll')
                  setSelectedTeamForModal(null)
                  setShowGamesModal(true)
                }}
                className="career-stat-btn group text-left rounded-md focus:outline-none focus-visible:ring-1 focus-visible:ring-text-primary"
                title="View every game of this career"
              >
                <div
                  className="font-display font-black tabular-nums text-txt-primary leading-none transition-colors group-hover:text-txt-primary"
                  style={{ fontSize: 'clamp(1.4rem, 2.6vw, 2rem)', letterSpacing: '-0.03em' }}
                >
                  {careerTotals.wins}–{careerTotals.losses}
                </div>
                <div
                  className="label-xs mt-1.5 flex items-center gap-1.5 text-txt-tertiary group-hover:text-txt-secondary transition-colors"
                  style={{ letterSpacing: '2px', fontSize: '10px' }}
                >
                  <span>RECORD</span>
                  <span
                    aria-hidden="true"
                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ fontSize: '9px', letterSpacing: '1.5px' }}
                  >
                    VIEW ALL
                  </span>
                </div>
              </button>
              <div className="hidden sm:block w-px self-stretch" style={{ backgroundColor: 'var(--surface-4)' }} />
              <div>
                <div
                  className="font-display font-black tabular-nums text-txt-primary leading-none"
                  style={{ fontSize: 'clamp(1.4rem, 2.6vw, 2rem)', letterSpacing: '-0.03em' }}
                >
                  {careerWinPct}<span className="text-txt-tertiary" style={{ fontSize: '0.55em' }}>%</span>
                </div>
                <div className="label-xs text-txt-tertiary mt-1.5" style={{ letterSpacing: '2px', fontSize: '10px' }}>WIN PCT</div>
              </div>
              <div className="hidden sm:block w-px self-stretch" style={{ backgroundColor: 'var(--surface-4)' }} />
              <div>
                <div
                  className="font-display font-black tabular-nums text-txt-primary leading-none"
                  style={{ fontSize: 'clamp(1.4rem, 2.6vw, 2rem)', letterSpacing: '-0.03em' }}
                >
                  {coachingHistory.length}
                </div>
                <div className="label-xs text-txt-tertiary mt-1.5" style={{ letterSpacing: '2px', fontSize: '10px' }}>
                  {coachingHistory.length === 1 ? 'TEAM' : 'TEAMS'}
                </div>
              </div>
              {careerTotals.coachOfYearAwards > 0 && (
                <>
                  <div className="hidden sm:block w-px self-stretch" style={{ backgroundColor: 'var(--surface-4)' }} />
                  <div>
                    <div
                      className="font-display font-black tabular-nums leading-none"
                      style={{
                        fontSize: 'clamp(1.4rem, 2.6vw, 2rem)',
                        letterSpacing: '-0.03em',
                        color: 'var(--accent-warning, #f59e0b)',
                      }}
                    >
                      {careerTotals.coachOfYearAwards}
                    </div>
                    <div className="label-xs text-txt-tertiary mt-1.5" style={{ letterSpacing: '2px', fontSize: '10px' }}>COTY</div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Career Arc Strip — segmented horizontal bar showing the
              chronology of stints. Each segment is proportional to years
              on the team. Shows team logo + abbr + year-range label per
              segment. The single distinctive sport-coach visual on the
              page; tells the whole story at a glance. */}
          {coachingHistory.length > 0 && (() => {
            const sortedStints = [...coachingHistory].sort((a, b) => a.startYear - b.startYear)
            const totalYears = sortedStints.reduce((acc, s) => acc + (s.endYear - s.startYear + 1), 0)
            if (totalYears <= 0) return null
            return (
              <div className="mt-5 sm:mt-6">
                <div className="label-xs text-txt-tertiary mb-2" style={{ letterSpacing: '2px', fontSize: '10px' }}>
                  CAREER ARC
                </div>
                <div className="flex items-stretch w-full overflow-hidden rounded-md border border-surface-4">
                  {sortedStints.map((stint, idx) => {
                    const years = stint.endYear - stint.startYear + 1
                    const widthPct = (years / totalYears) * 100
                    const yearLabel = stint.startYear === stint.endYear
                      ? `${stint.startYear}`
                      : `${stint.startYear}–${stint.isCurrent ? 'NOW' : stint.endYear}`
                    const stintAnchorId = `stint-${stint.teamAbbr}-${stint.startYear}`
                    return (
                      <button
                        type="button"
                        key={`arc-${stint.teamAbbr}-${stint.startYear}`}
                        onClick={() => {
                          document.getElementById(stintAnchorId)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                        }}
                        className="relative flex items-center gap-2 sm:gap-2.5 px-2.5 sm:px-3 py-2.5 min-w-0 flex-shrink-0 text-left transition-colors hover:bg-surface-4 focus:outline-none focus:ring-1 focus:ring-text-primary"
                        style={{
                          width: `${widthPct}%`,
                          backgroundColor: stint.isCurrent ? 'var(--surface-3)' : 'var(--surface-2)',
                          borderRight: idx < sortedStints.length - 1 ? '1px solid var(--surface-4)' : 'none',
                        }}
                      >
                        {stint.teamTid && (
                          <div className="flex-shrink-0">
                            <TeamLogo tid={stint.teamTid} teams={teamsData} size="sm" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <div
                            className="font-display leading-none truncate"
                            style={{
                              fontFamily: "'Bebas Neue', sans-serif",
                              fontSize: 'clamp(0.875rem, 1.4vw, 1.0625rem)',
                              letterSpacing: '0.5px',
                              color: stint.isCurrent ? 'var(--text-primary)' : 'var(--text-secondary)',
                            }}
                          >
                            {stint.teamAbbr}
                          </div>
                          <div
                            className="label-xs text-txt-tertiary tabular-nums mt-1 truncate"
                            style={{ letterSpacing: '1px', fontSize: '9px' }}
                          >
                            {yearLabel}
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })()}
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

        // Stint stat strip — broadcast-bar style. Each cell is a big
        // tabular numeral over a tracked label. Cells share a single
        // hairline-bordered frame with vertical dividers between them
        // (no more individual tile borders fighting each other).
        const StatCell = ({ value, label, accent = false, onClick, last = false }) => {
          const inner = (
            <div className={`px-3.5 py-2 ${last ? '' : 'border-r'}`} style={!last ? { borderRight: '1px solid var(--surface-4)' } : {}}>
              <div
                className="font-display font-black tabular-nums leading-none"
                style={{
                  fontSize: 'clamp(1.25rem, 2vw, 1.6rem)',
                  color: accent ? 'var(--accent-warning, #f59e0b)' : 'var(--text-primary)',
                  letterSpacing: '-0.02em',
                }}
              >
                {value}
              </div>
              <div
                className="label-xs text-txt-tertiary mt-1"
                style={{ letterSpacing: '1.5px', fontSize: '9px' }}
              >
                {label}
              </div>
            </div>
          )
          if (!onClick) return inner
          return (
            <button
              onClick={onClick}
              className="text-left transition-colors hover:bg-surface-3"
              style={{ flex: '1 1 auto' }}
            >
              {inner}
            </button>
          )
        }

        // Compute the BEST SEASON for this stint — most wins, tie-broken
        // by deepest postseason (champion > CFP > bowl win).
        const bestSeason = (() => {
          const yearsList = stint.games?.length ? Object.values(
            stint.games.reduce((acc, g) => {
              const y = Number(g.year)
              if (!Number.isFinite(y)) return acc
              if (!acc[y]) acc[y] = { year: y, wins: 0, losses: 0, games: [] }
              acc[y].games.push(g)
              if (g.perspective?.userWon) acc[y].wins++
              else if (g.perspective) acc[y].losses++
              return acc
            }, {})
          ) : []
          if (!yearsList.length) return null
          // Score each year: wins * 100 + postseason bonus.
          const score = (y) => {
            let s = y.wins * 100
            const cfpGames = y.games.filter(g => {
              const t = detectGameType(g)
              return t === GAME_TYPES.CFP_FIRST_ROUND || t === GAME_TYPES.CFP_QUARTERFINAL ||
                     t === GAME_TYPES.CFP_SEMIFINAL || t === GAME_TYPES.CFP_CHAMPIONSHIP
            })
            const wonChamp = cfpGames.some(g => detectGameType(g) === GAME_TYPES.CFP_CHAMPIONSHIP && g.perspective?.userWon)
            if (wonChamp) s += 50
            else if (cfpGames.length) s += 20
            const bowlWin = y.games.some(g => detectGameType(g) === GAME_TYPES.BOWL && g.perspective?.userWon)
            if (bowlWin) s += 10
            return s
          }
          const best = yearsList.sort((a, b) => score(b) - score(a))[0]
          if (!best || (best.wins === 0 && best.losses === 0)) return null
          // Build descriptor.
          const cfpGames = best.games.filter(g => {
            const t = detectGameType(g)
            return t === GAME_TYPES.CFP_FIRST_ROUND || t === GAME_TYPES.CFP_QUARTERFINAL ||
                   t === GAME_TYPES.CFP_SEMIFINAL || t === GAME_TYPES.CFP_CHAMPIONSHIP
          })
          let postseason = null
          if (cfpGames.length) {
            const order = [GAME_TYPES.CFP_FIRST_ROUND, GAME_TYPES.CFP_QUARTERFINAL, GAME_TYPES.CFP_SEMIFINAL, GAME_TYPES.CFP_CHAMPIONSHIP]
            const sorted = [...cfpGames].sort((a, b) => order.indexOf(detectGameType(a)) - order.indexOf(detectGameType(b)))
            const last = sorted[sorted.length - 1]
            const lastType = detectGameType(last)
            const labels = {
              [GAME_TYPES.CFP_FIRST_ROUND]: 'First Round',
              [GAME_TYPES.CFP_QUARTERFINAL]: 'Quarterfinal',
              [GAME_TYPES.CFP_SEMIFINAL]: 'Semifinal',
              [GAME_TYPES.CFP_CHAMPIONSHIP]: 'National Championship',
            }
            if (lastType === GAME_TYPES.CFP_CHAMPIONSHIP && last.perspective?.userWon) {
              postseason = 'Won National Championship'
            } else if (last.perspective?.userWon) {
              postseason = `Advanced past ${labels[lastType]}`
            } else {
              postseason = `Lost in ${labels[lastType] || 'CFP'}`
            }
          } else {
            const bowl = best.games.find(g => detectGameType(g) === GAME_TYPES.BOWL)
            if (bowl) {
              const stripped = bowl.bowlName ? bowl.bowlName.replace(/\s+Bowl$/i, '') : 'Bowl'
              postseason = bowl.perspective?.userWon ? `Won ${stripped} Bowl` : `Lost ${stripped} Bowl`
            }
          }
          let finalRank = null
          if (stint.teamTid != null) {
            const r = getTeamRanking(currentDynasty, Number(stint.teamTid), best.year)
            if (r?.rank) finalRank = r.rank
          }
          return { year: best.year, wins: best.wins, losses: best.losses, postseason, finalRank }
        })()

        return (
          <div
            key={`${stint.teamName}-${stint.startYear}`}
            id={`stint-${stint.teamAbbr}-${stint.startYear}`}
            className={`media-card relative ${stint.isCurrent ? '' : 'opacity-90'}`}
            style={{
              scrollMarginTop: '88px',
              ...(stint.isCurrent ? {} : { backgroundColor: 'var(--surface-1)' }),
            }}
          >
            {/* Current-stint top accent — 1px text-primary hairline.
                Subtle but distinctive; no team color used in chrome. */}
            {stint.isCurrent && (
              <div
                aria-hidden="true"
                className="absolute top-0 left-0 right-0 h-px rounded-t-lg"
                style={{ backgroundColor: 'var(--text-primary)' }}
              />
            )}
            <div className={stint.isCurrent ? 'p-3 sm:p-5' : 'p-3 sm:p-4'}>
              {/* Stint header — Bebas Neue team name. Past stints get a
                  smaller logo + name treatment to read as compressed
                  history vs the current chapter. */}
              <div className={`flex items-center gap-3 sm:gap-4 ${stint.isCurrent ? 'mb-4' : 'mb-3'}`}>
                {stint.teamTid && (
                  <div className="flex-shrink-0">
                    <TeamLogo tid={stint.teamTid} teams={teamsData} size={stint.isCurrent ? 'xl' : 'lg'} />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <Link
                      to={`${pathPrefix}/team/${resolveTid(stint.teamAbbr, currentDynasty?.teams || TEAMS)}/${stint.endYear}`}
                      className="text-txt-primary hover:opacity-80 transition-opacity m-0 leading-[0.95] uppercase break-words"
                      style={{
                        fontFamily: "'Bebas Neue', sans-serif",
                        fontSize: stint.isCurrent
                          ? 'clamp(1.5rem, 2.8vw, 2.1rem)'
                          : 'clamp(1.15rem, 2vw, 1.5rem)',
                        letterSpacing: '0.5px',
                      }}
                    >
                      {stint.teamName}
                    </Link>
                    {stint.isCurrent && (
                      <span
                        className="inline-flex items-center gap-1.5 px-2 py-0.5 text-[10px] font-bold uppercase tabular-nums"
                        style={{
                          letterSpacing: '1.5px',
                          color: 'var(--accent-success)',
                          backgroundColor: 'color-mix(in srgb, var(--accent-success) 14%, transparent)',
                          border: '1px solid color-mix(in srgb, var(--accent-success) 30%, transparent)',
                          borderRadius: '999px',
                          lineHeight: 1.4,
                        }}
                      >
                        <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: 'var(--accent-success)' }} />
                        Now
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 label-sm text-txt-tertiary mt-1 flex-wrap">
                    <span className="font-semibold text-txt-secondary uppercase" style={{ letterSpacing: '1px', fontSize: '11px' }}>
                      {getPositionLabel(stint.position)}
                    </span>
                    
                    <span className="tabular">{yearRange}</span>
                    {stint.conference && (
                      <>
                        
                        <span>{stint.conference}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Unified broadcast stat strip — single bordered card with
                  vertical hairline dividers between cells. Clickable
                  cells open the games modal for that subset. Cells flow
                  to a second row on narrow viewports. */}
              {(() => {
                const cells = []
                cells.push({ key: 'seasons', value: numSeasons, label: numSeasons === 1 ? 'SEASON' : 'SEASONS' })
                cells.push({
                  key: 'record',
                  value: stint.overallRecord,
                  label: `RECORD ${winPct}%`,
                  onClick: () => openGamesModal('all', stint.teamName),
                })
                if (stint.nationalChampionships > 0) {
                  cells.push({
                    key: 'natl',
                    value: stint.nationalChampionships,
                    label: stint.nationalChampionships === 1 ? 'NATL TITLE' : 'NATL TITLES',
                    accent: true,
                    onClick: () => openGamesModal('cfp', stint.teamName),
                  })
                }
                if (stint.confChampionships > 0) {
                  cells.push({
                    key: 'conf',
                    value: stint.confChampionships,
                    label: stint.confChampionships === 1 ? 'CONF TITLE' : 'CONF TITLES',
                    onClick: () => openGamesModal('confChamp', stint.teamName),
                  })
                }
                if (stint.playoffAppearances > 0) {
                  cells.push({
                    key: 'cfp',
                    value: stint.playoffAppearances,
                    label: stint.playoffAppearances === 1 ? 'CFP APP' : 'CFP APPS',
                    onClick: () => openGamesModal('cfp', stint.teamName),
                  })
                }
                if (showsBowls) {
                  cells.push({
                    key: 'bowls',
                    value: `${bowlWins}-${bowlLosses}`,
                    label: 'BOWLS',
                    onClick: () => openGamesModal('bowl', stint.teamName),
                  })
                }
                return (
                  <div
                    className="mb-3 flex flex-wrap rounded-lg overflow-hidden"
                    style={{
                      border: '1px solid var(--surface-4)',
                      backgroundColor: 'var(--surface-2)',
                    }}
                  >
                    {cells.map((c, idx) => (
                      <StatCell
                        key={c.key}
                        value={c.value}
                        label={c.label}
                        accent={c.accent}
                        onClick={c.onClick}
                        last={idx === cells.length - 1}
                      />
                    ))}
                  </div>
                )
              })()}

              {/* Best Season callout — single editorial line above the
                  year-by-year table. Pulls from each stint's actual data
                  to surface the headline moment (most wins, deepest run). */}
              {bestSeason && (
                <div className="mb-3 flex items-baseline gap-3 sm:gap-4 flex-wrap">
                  <span className="label-xs text-txt-tertiary flex-shrink-0" style={{ letterSpacing: '2px', fontSize: '10px' }}>
                    BEST SEASON
                  </span>
                  <div className="flex items-baseline gap-2 sm:gap-3 flex-wrap text-sm">
                    <span className="font-display font-bold tabular-nums text-txt-primary" style={{ letterSpacing: '-0.01em' }}>
                      {bestSeason.year}
                    </span>
                    
                    <span className="tabular-nums font-semibold text-txt-primary">
                      {bestSeason.wins}–{bestSeason.losses}
                    </span>
                    {bestSeason.finalRank && (
                      <>
                        
                        <span
                          className="font-bold tabular-nums"
                          style={{ color: bestSeason.finalRank <= 4 ? 'var(--accent-warning)' : 'var(--text-secondary)' }}
                        >
                          #{bestSeason.finalRank}
                        </span>
                      </>
                    )}
                    {bestSeason.postseason && (
                      <>
                        
                        <span className="text-txt-secondary">{bestSeason.postseason}</span>
                      </>
                    )}
                  </div>
                </div>
              )}

              <YearByYearTable
                stint={stint}
                currentDynasty={currentDynasty}
                pathPrefix={pathPrefix}
                navigate={navigate}
              />

              {stint.coachAwards && stint.coachAwards.length > 0 && (
                <div className="mt-3">
                  <div className="label-xs text-txt-tertiary mb-1.5" style={{ letterSpacing: '1.5px' }}>Coaching Awards</div>
                  <div className="flex flex-wrap gap-2">
                    {stint.coachAwards.map((award, idx) => (
                      <Badge key={idx} variant="warning" size="md">
                        {award.year} {award.shortName}
                        {award.shortName === 'Broyles' && award.recipient && ` ${award.recipient}`}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
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
                <h4 className="font-display font-bold text-txt-primary mb-2 tabular-nums" style={{ fontSize: '0.9375rem', letterSpacing: '-0.01em' }}>
                  <span>{year}</span>
                  <span className="ml-2 text-txt-tertiary font-normal">Season</span>
                </h4>
                <div className="media-card overflow-hidden">
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
                    // Suppress NEUTRAL for postseason games — bowl / CFP
                    // games are always neutral, so saying so is just
                    // noise. Keep HOME / AWAY for regular-season games.
                    const isPostseason = gameType === GAME_TYPES.BOWL ||
                      gameType === GAME_TYPES.CONFERENCE_CHAMPIONSHIP ||
                      gameType.startsWith('cfp_')
                    const site = game.perspective?.isHome ? 'HOME'
                      : game.perspective?.isAway ? 'AWAY'
                      : isPostseason ? null
                      : 'NEUTRAL'
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
                </div>
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

  // Round labels for the postseason cell. Indexed by GAME_TYPES.* so we
  // can derive directly from each game's resolved gameType.
  const ROUND_LABELS = {
    [GAME_TYPES.CFP_FIRST_ROUND]: 'First Round',
    [GAME_TYPES.CFP_QUARTERFINAL]: 'Quarterfinal',
    [GAME_TYPES.CFP_SEMIFINAL]: 'Semifinal',
    [GAME_TYPES.CFP_CHAMPIONSHIP]: 'National Championship',
  }

  const years = []
  for (let year = startYear; year <= endYear; year++) {
    const yearGames = stint.games?.filter(g => Number(g.year) === year) || []
    const wins = yearGames.filter(g => g.perspective?.userWon).length
    const losses = yearGames.filter(g => g.perspective && !g.perspective.userWon).length
    const hasRecord = yearGames.length > 0

    // Source-of-truth final rank: getTeamRanking reads finalPollsByYear
    // first (end-of-season authoritative), then falls back to the most
    // recent game's poll position. Same helper Rankings.jsx uses.
    let finalRank = null
    if (stint.teamTid != null) {
      const ranking = getTeamRanking(currentDynasty, Number(stint.teamTid), year)
      if (ranking?.rank) finalRank = ranking.rank
    }

    // Postseason: derive from the stint's CFP/bowl games (already
    // pre-filtered to this team). Walk the CFP rounds in order and
    // record the deepest the team reached. The legacy
    // cfpResultsByYear/bowlGamesByYear maps are no longer the source
    // of truth — games[] is.
    const yearStintGames = stint.games?.filter(g => Number(g.year) === year) || []
    const cfpYearGames = yearStintGames
      .map(g => ({ g, type: detectGameType(g) }))
      .filter(({ type }) =>
        type === GAME_TYPES.CFP_FIRST_ROUND ||
        type === GAME_TYPES.CFP_QUARTERFINAL ||
        type === GAME_TYPES.CFP_SEMIFINAL ||
        type === GAME_TYPES.CFP_CHAMPIONSHIP
      )

    let cfpResult = null
    if (cfpYearGames.length > 0) {
      // Order rounds shallow → deep so the deepest entry wins.
      const order = [
        GAME_TYPES.CFP_FIRST_ROUND,
        GAME_TYPES.CFP_QUARTERFINAL,
        GAME_TYPES.CFP_SEMIFINAL,
        GAME_TYPES.CFP_CHAMPIONSHIP,
      ]
      const sorted = [...cfpYearGames].sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type))
      const lastGame = sorted[sorted.length - 1]
      const lastWon = lastGame.g.perspective?.userWon === true
      if (lastGame.type === GAME_TYPES.CFP_CHAMPIONSHIP && lastWon) {
        cfpResult = { type: 'champion' }
      } else if (!lastWon) {
        cfpResult = { type: 'lost', round: ROUND_LABELS[lastGame.type] || 'CFP' }
      } else {
        // Won their last game but it wasn't the final — they advanced
        // but the next round game isn't recorded yet.
        cfpResult = { type: 'advanced', round: ROUND_LABELS[lastGame.type] || 'CFP' }
      }
    }
    const isNationalChamp = cfpResult?.type === 'champion'

    let bowlResult = null
    if (!cfpResult) {
      const bowlGame = yearStintGames.find(g => detectGameType(g) === GAME_TYPES.BOWL)
      if (bowlGame && bowlGame.perspective) {
        const stripped = bowlGame.bowlName ? bowlGame.bowlName.replace(/\s+Bowl$/i, '') : 'Bowl'
        bowlResult = {
          bowlName: stripped || 'Bowl',
          won: bowlGame.perspective.userWon === true,
        }
      }
    }

    let postseasonText = '—'
    if (cfpResult?.type === 'champion') {
      postseasonText = 'Won the National Championship'
    } else if (cfpResult?.type === 'lost') {
      postseasonText = `Lost in ${cfpResult.round}`
    } else if (cfpResult?.type === 'advanced') {
      postseasonText = `Advanced past ${cfpResult.round}`
    } else if (bowlResult) {
      postseasonText = bowlResult.won
        ? `Won the ${bowlResult.bowlName} Bowl`
        : `Lost the ${bowlResult.bowlName} Bowl`
    }

    years.push({ year, wins, losses, hasRecord, cfpResult, bowlResult, isNationalChamp, finalRank, postseasonText })
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

  // Champion years get a subtle full-width gold tint; bowl wins get a
  // dot in the postseason cell. NO side-rail accents (impeccable's
  // BAN 1: side-stripe borders > 1px on list items).
  const rowTint = (yr) => {
    if (yr.isNationalChamp) return 'color-mix(in srgb, var(--accent-warning) 8%, transparent)'
    return 'transparent'
  }

  return (
    <div className="media-card overflow-hidden">
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
              return (
                <tr
                  key={yr.year}
                  onClick={() => navigate(`${pathPrefix}/team/${resolveTid(stint.teamAbbr, currentDynasty?.teams || TEAMS)}/${yr.year}`)}
                  className="cursor-pointer hover:bg-surface-3 transition-colors"
                  style={{
                    borderBottom: idx < years.length - 1 ? '1px solid var(--surface-4)' : 'none',
                    backgroundColor: rowTint(yr),
                  }}
                >
                  {/* Year cell — champion years get a star prefix in
                      gold; standard years just show the number. */}
                  <td className="px-4 py-3 font-semibold tabular text-txt-primary">
                    {yr.isNationalChamp && (
                      <span
                        aria-hidden="true"
                        className="inline-block mr-2 align-middle"
                        style={{ color: 'var(--accent-warning)', fontSize: '0.95em' }}
                      >
                        ★
                      </span>
                    )}
                    <span className="align-middle">{yr.year}</span>
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
                  {/* Postseason cell — champion years stay gold; everything
                      else is text-secondary. */}
                  <td
                    className="px-4 py-3"
                    style={{ color: yr.isNationalChamp ? 'var(--accent-warning)' : 'var(--text-secondary)' }}
                  >
                    <span className="align-middle">
                      {yr.isNationalChamp ? (
                        <span className="font-semibold">{yr.postseasonText}</span>
                      ) : yr.postseasonText}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
