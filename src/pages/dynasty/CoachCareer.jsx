import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useDynasty, detectGameType, GAME_TYPES, getTeamGamePerspective, getTeamRanking, getTeamConferenceForDynasty } from '../../context/DynastyContext'
import { weekSortKey } from '../../utils/compareUtils'
import { useAuth } from '../../context/AuthContext'
import { usePathPrefix } from '../../hooks/usePathPrefix'
import { TEAMS, resolveTid, getCurrentTeamAbbr, getGameTeamInfo, getAbbrFromTeamName, getTidFromAbbr } from '../../data/teamRegistry'
import { getMascotName as getMascotNameFromTeams } from '../../data/teams'
import { getContrastTextColor } from '../../utils/colorUtils'
import CoachTrophyRoom from './CoachTrophyRoom'

// Shared CFB-aesthetic gradient overlay for team-colored panels (matches the
// team page hero / scorebugs).
const CFB_GRADIENT =
  'linear-gradient(120deg, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0) 44%), linear-gradient(180deg, rgba(0,0,0,0.04) 0%, rgba(0,0,0,0.40) 100%)'
import {
  getMemberLabel,
  getCoachNameForUid,
  setMemberLabelValue,
  canManageMembers,
  getRole,
  ROLE_COMMISH,
  ROLE_COCOMMISH,
} from '../../data/leagueModel'
import { getCoaches, getCoachesControlledBy, synthOwnerCoachFromCoachTeamByYear } from '../../data/coachModel'
import ImageUpload from '../../components/ImageUpload'
import { proxyImageUrl, resolvePortraitUrl } from '../../utils/imageProxy'
import { mapCoachPortraitUrl } from '../../data/cfb27SaveImport'
import UNIQUE_COACH_PORTRAIT_IDS from '../../data/cfb27UniqueCoachPortraitIds.json'
import GENERIC_COACH_PORTRAIT_KEYS from '../../data/cfb27GenericCoachPortraitKeys.json'

// Every coach portrait in the bundled library, as plain relative paths —
// lets the user browse/pick ANY headshot (not just the one auto-matched to
// their own in-game coach), same bundled pack the auto-match already uses.
const ALL_COACH_PORTRAITS = [
  ...UNIQUE_COACH_PORTRAIT_IDS.map((id) => `/cfb27-portraits/coach-unique/${id}.webp`),
  ...GENERIC_COACH_PORTRAIT_KEYS.map((key) => `/cfb27-portraits/coach-generic/${key}.webp`),
]

// A bundled portrait-pack path is the app's own controlled, always-online
// static asset (or a dedicated CDN, via VITE_CFB27_PORTRAIT_BASE) — not a
// flaky third-party host like ImgBB, so it skips proxyImageUrl's wsrv.nl
// resize/hotlink-resilience proxy entirely (that exists for arbitrary
// user-uploaded photos, not this). Routing every one of the gallery's
// thousands of thumbnails through a third-party proxy on every render added
// a real failure point (rate limits, proxy downtime, an extra cross-origin
// round trip) with no corresponding benefit for a same-origin/CDN-hosted
// asset — confirmed as the cause of the gallery rendering as all broken
// images. A genuinely user-uploaded coach photo still goes through
// proxyImageUrl as before.
const displayCoachPhotoUrl = (url, width) =>
  (url && url.includes('/cfb27-portraits/')) ? resolvePortraitUrl(url) : proxyImageUrl(url, width)
import { isPcAutoDynasty } from '../../editions'
import {
  PageHero,
  EmptyState,
  Modal,
  Badge,
  Stat,
  TeamLogo,
  SectionHeader,
  ScoreRow,
  GameResultRow,
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
  const { currentDynasty, updateDynasty } = useDynasty()
  const { user } = useAuth()
  const pathPrefix = usePathPrefix()
  const navigate = useNavigate()
  const [showGamesModal, setShowGamesModal] = useState(false)
  const [gamesModalType, setGamesModalType] = useState(null)
  const [selectedTeamForModal, setSelectedTeamForModal] = useState(null)
  const [showPhotoModal, setShowPhotoModal] = useState(false)
  const [photoDraft, setPhotoDraft] = useState('')
  const [savingPhoto, setSavingPhoto] = useState(false)
  const [showNameModal, setShowNameModal] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const [savingName, setSavingName] = useState(false)
  const [showPortraitGallery, setShowPortraitGallery] = useState(false)

  // The career being viewed. Defaults to the logged-in user; the
  // inline picker below lets any signed-in viewer flip to another
  // member's career instead. ?uid=... in the URL deep-links into a
  // specific coach's career (used by the Coaches leaderboard).
  const [searchParams, setSearchParams] = useSearchParams()
  const coachFromUrl = searchParams.get('coach')
  const uidFromUrl = searchParams.get('uid') // legacy deep-link → primary coach
  const [selectedCid, setSelectedCid] = useState(null)
  // Sync state when the ?coach= URL param changes (e.g. navigating from the
  // Coaches leaderboard while already on this page).
  useEffect(() => {
    if (coachFromUrl) setSelectedCid(coachFromUrl)
  }, [coachFromUrl])

  if (!currentDynasty) return null

  const currentTeamAbbr = getCurrentTeamAbbr(currentDynasty)
  const teamsData = currentDynasty?.teams || currentDynasty?.customTeams

  // Picker options: one row per CONTROLLED coach entity. Owner's coaches
  // first, then co-commish, then members; alphabetical within a tier. Each
  // option carries the controller uid so we can mark "(you)" and still
  // resolve legacy ?uid= deep-links.
  const coachOptions = (() => {
    const ownerUid = currentDynasty.userId
    const coaches = Object.values(getCoaches(currentDynasty)).filter(c => c && c.controlledBy != null)
    const rank = (c) => {
      if (c.controlledBy === ownerUid) return 0
      const r = getRole(currentDynasty, c.controlledBy)
      return r === ROLE_COCOMMISH ? 1 : 2
    }
    coaches.sort((a, b) => rank(a) - rank(b) || (a.name || '').localeCompare(b.name || ''))
    const options = coaches.map(c => ({
      cid: c.cid,
      uid: c.controlledBy,
      coach: c,
      role: getRole(currentDynasty, c.controlledBy),
      label: c.name || getCoachNameForUid(currentDynasty, c.controlledBy) || 'Coach',
      isYou: !!user?.uid && c.controlledBy === user.uid,
    }))
    // If the OWNER has no linked coach entity (carousel dynasties where every
    // coach is controlledBy:null, or a lost owner→coach linkage), synthesize
    // their coach from coachTeamByYear so the Career page + Trophy Room always
    // populate. Only fires when the owner isn't already represented.
    if (ownerUid && !options.some(o => o.uid === ownerUid)) {
      const synth = synthOwnerCoachFromCoachTeamByYear(currentDynasty)
      if (synth) {
        options.unshift({
          cid: synth.cid,
          uid: ownerUid,
          coach: synth,
          role: getRole(currentDynasty, ownerUid),
          label: synth.name || getCoachNameForUid(currentDynasty, ownerUid) || 'Coach',
          isYou: !!user?.uid && ownerUid === user.uid,
        })
      }
    }
    return options
  })()

  // Resolve which coach is being viewed: explicit ?coach=, else legacy
  // ?uid= mapped to that user's first coach, else the saved selection, else
  // the logged-in user's first coach, else the first coach overall.
  const effectiveSelectedCid = (() => {
    if (coachFromUrl && coachOptions.some(o => o.cid === coachFromUrl)) return coachFromUrl
    if (uidFromUrl) {
      const byUid = coachOptions.find(o => o.uid === uidFromUrl)
      if (byUid) return byUid.cid
    }
    if (selectedCid && coachOptions.some(o => o.cid === selectedCid)) return selectedCid
    const mine = coachOptions.find(o => o.uid === user?.uid)
    if (mine) return mine.cid
    return coachOptions[0]?.cid || null
  })()

  const selectedOption = coachOptions.find(o => o.cid === effectiveSelectedCid) || null
  const selectedCoach = selectedOption?.coach || null
  const selectedControllerUid = selectedCoach?.controlledBy ?? null
  // The uid whose league-level record (member label) this career edits. Coach
  // entities carry their own name; the member label is still uid-keyed.
  const effectiveSelectedUid = selectedControllerUid ?? user?.uid ?? currentDynasty.userId
  // Before falling all the way back to the generic "Coach" placeholder, try
  // the real in-game coach name synced from the save (dynasty.userCoachPortrait,
  // see cfb27SaveSync.js) — same scoping as the portrait fallback below (only
  // for your OWN career on a CFB27 PC dynasty; there's no synced signal for
  // which save-file coach corresponds to a teammate's uid in a co-op dynasty).
  const inGameCoachName = (isPcAutoDynasty(currentDynasty) && user?.uid && user.uid === effectiveSelectedUid)
    ? (currentDynasty.userCoachPortrait?.name || null)
    : null
  const selectedDisplayName = selectedOption?.label || inGameCoachName || 'Coach'

  // Teams a COACH ran in a given year — one team per year from byYear (the
  // source of truth). The legacy coachTeamByYear fallback applies ONLY to a
  // coach with NO byYear data at all (a truly un-migrated owner coach). A
  // coach WITH byYear entries is authoritative: an empty year means "not
  // coaching that year", NOT "inherit the owner's legacy career" — otherwise
  // every coach the owner controls would show the owner's whole history.
  const getCoachTeamsForYear = (coach, year) => {
    const yearNum = Number(year)
    if (!Number.isFinite(yearNum) || !coach) return []
    const tid = Number(coach.byYear?.[yearNum]?.teamTid ?? coach.byYear?.[String(yearNum)]?.teamTid)
    if (Number.isFinite(tid)) return [tid]

    // No byYear entry for THIS year. The owner's durable per-year record
    // (coachTeamByYear) still knows the team they coached that season, so consult
    // it as a fallback. This previously only fired when byYear was ENTIRELY empty
    // — but a coach migrated AFTER the offseason year-flip has byYear anchored to
    // the current (post-flip) year and MISSING the just-finished season, so that
    // season's games (and its bowl/conf/national trophies) were dropped and the
    // Trophy Room came up blank. Resolve strictly by tid.
    const isOwnerCoach = coach.controlledBy === currentDynasty.userId || currentDynasty.userId == null
    if (!isOwnerCoach) return []
    const cty = currentDynasty.coachTeamByYear?.[yearNum] || currentDynasty.coachTeamByYear?.[String(yearNum)]
    let ctyTid = null
    if (cty?.tid != null) ctyTid = Number(cty.tid)
    else if (cty?.team) { const t = getTidFromAbbr(cty.team, currentDynasty); if (t != null) ctyTid = Number(t) }
    if (ctyTid == null || !Number.isFinite(ctyTid)) return []

    // Guard: don't attribute the owner's PRIMARY-career team to a SECONDARY coach
    // the owner also controls. Accept the coachTeamByYear team only when this
    // coach has NO byYear at all (un-migrated owner), OR actually coached that
    // same tid in a year it DOES have — i.e. it's this coach's own team.
    const hasByYear = coach.byYear && Object.keys(coach.byYear).length > 0
    if (!hasByYear) return [ctyTid]
    const coachTids = new Set(
      Object.values(coach.byYear).map(e => Number(e?.teamTid)).filter(Number.isFinite)
    )
    return coachTids.has(ctyTid) ? [ctyTid] : []
  }

  // Project a game into the existing perspective shape from the angle of
  // the coach's team that played in it. Returns null when the coach's team
  // that year didn't participate.
  const buildPerspectiveForCoach = (game, coach) => {
    const yearNum = Number(game.year)
    if (!Number.isFinite(yearNum)) return null
    const userTids = getCoachTeamsForYear(coach, yearNum)
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
    const coach = selectedCoach
    if (!coach) return history
    // The controller uid drives the owner-only legacy fallbacks below.
    const uid = coach.controlledBy

    const userGames = (currentDynasty.games || [])
      .map(g => {
        if (!isGamePlayed(g)) return null
        const perspective = buildPerspectiveForCoach(g, coach)
        if (!perspective) return null
        return { ...g, perspective }
      })
      .filter(Boolean)

    // Group games by the coach's team TID — the stable identity. Keying by
    // tid (not an abbr string) means a teambuilder rename can't split one
    // stint into two, nor merge two teams that happen to share an abbr.
    // teamTidByKey carries the numeric tid alongside each bucket so the
    // stint below can resolve its live abbr/name/logo/colors from it.
    const gamesByTeam = {}
    const teamTidByKey = {}
    userGames.forEach(game => {
      let teamKey = null
      let teamTid = null
      if (game.perspective?.userTid != null) {
        teamTid = Number(game.perspective.userTid)
        teamKey = String(teamTid)
      }
      // Owner-only legacy fallback — older dynasties may not have tids on
      // every game record. Gated on the coach having NO byYear data (a truly
      // un-migrated owner coach); a coach WITH byYear is authoritative, so we
      // never attribute the owner's legacy games to a second coach they run.
      // This path has no tid, so the bucket stays keyed by abbr (teamTid null).
      const coachHasByYear = selectedCoach?.byYear && Object.keys(selectedCoach.byYear).length > 0
      const isOwnerOrOwnerless = !coachHasByYear &&
        (uid === currentDynasty.userId || currentDynasty.userId == null)
      if (!teamKey && isOwnerOrOwnerless) {
        const gameYear = Number(game.year)
        const coachTeamEntry = currentDynasty.coachTeamByYear?.[gameYear] || currentDynasty.coachTeamByYear?.[String(gameYear)]
        teamKey = coachTeamEntry?.team
      }
      if (!teamKey && isOwnerOrOwnerless) {
        teamKey = currentTeamAbbr
      }
      if (!teamKey) return // skip games we can't attribute to a team

      if (!gamesByTeam[teamKey]) {
        gamesByTeam[teamKey] = []
        teamTidByKey[teamKey] = teamTid
      }
      gamesByTeam[teamKey].push(game)
    })

    const getTeamFullName = (abbr) => {
      const mascot = getMascotName(abbr, teamsData)
      if (mascot) return mascot
      return abbr
    }

    const teamStints = Object.entries(gamesByTeam).map(([teamKey, games]) => {
      // teamTid is carried from the grouping key; null ONLY on the legacy
      // owner-only abbr fallback path (those games have no tid). Abbr and
      // name resolve LIVE from the tid so a teambuilder rename reflects
      // immediately; the legacy path keeps its abbr key verbatim.
      const teamTid = teamTidByKey[teamKey]
      const teamAbbr = teamTid != null
        ? (teamsData?.[teamTid]?.abbr || teamKey)
        : teamKey
      const teamName = teamTid != null
        ? (teamsData?.[teamTid]?.name || teamAbbr)
        : getTeamFullName(teamKey)

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

      return {
        teamAbbr,
        teamTid,
        teamName,
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
      getCoachTeamsForYear(coach, currentDynasty.currentYear).map(Number)
    )
    teamStints.forEach(stint => {
      const isCurrentTeam = stint.teamTid != null && myCurrentTids.has(Number(stint.teamTid))
      stint.isCurrent = isCurrentTeam
      stint.isPast = !isCurrentTeam
      stint.position = currentDynasty.coachPosition || 'HC'
      // Use the canonical per-season getter rather than the stale
      // root-level dynasty.conference field (which only reflects the
      // conference at dynasty creation time and is never updated).
      stint.conference = isCurrentTeam
        ? (getTeamConferenceForDynasty(currentDynasty, stint.teamAbbr, currentDynasty.currentYear) || '')
        : ''
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
        conference: uid === currentDynasty.userId
          ? (getTeamConferenceForDynasty(currentDynasty, placeholderAbbr, currentDynasty.currentYear) || '')
          : '',
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
  const coachName = selectedCoach?.name || getCoachNameForUid(currentDynasty, selectedControllerUid, '')

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
    // selectedTeamForModal holds the stint's tid (or its name on the legacy
    // no-tid path). Match by tid first so a rename can't break the lookup.
    const stint = coachingHistory.find(s =>
      s.teamTid != null
        ? Number(s.teamTid) === Number(selectedTeamForModal)
        : s.teamName === selectedTeamForModal
    )
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
  // Real, save-authoritative career totals (Job Security, Prestige, career
  // W-L/bowl/conf-title/NC/playoff/rivalry/Top-25 records, draft picks, Top
  // 5 recruiting classes) — synced from the Coach save record's own lifetime
  // counters (cfb27SaveSync.js's userCoachCareerStats). Only applies to your
  // OWN career on a CFB27 PC dynasty — same scoping as the portrait/name
  // fallback above, since there's no synced signal for a teammate's uid.
  // These normally REPLACE the equivalent game-derived numbers below
  // (wins/losses) rather than supplement them: the save's own counters are
  // authoritative and also cover any seasons before this dynasty started
  // tracking games.
  const savedCoachStats = (isPcAutoDynasty(currentDynasty) && user?.uid === effectiveSelectedUid)
    ? currentDynasty.userCoachCareerStats
    : null
  // Self-healing against a stale saved snapshot: userCoachCareerStats is a
  // MERGE-only write (cfb27SaveSync.js only sets it "when present"), so a
  // sync that fails to resolve the coach record (an external save-parser
  // schema gap, not this app) leaves the LAST successful sync's numbers
  // sitting there indefinitely, silently frozen rather than visibly missing.
  // A saved total game count that's LOWER than what this dynasty's own
  // tracked games already prove happened is unambiguous evidence of exactly
  // that — the save's counters can lag behind (rare, already-covered case)
  // but can never legitimately be BEHIND games this app has directly
  // recorded. In that case, prefer the always-current game-derived number
  // over the frozen one instead of silently showing an out-of-date record.
  const savedTotalGames = (savedCoachStats?.wins ?? 0) + (savedCoachStats?.losses ?? 0)
  const computedTotalGames = careerTotals.wins + careerTotals.losses
  const useSavedRecord = !!savedCoachStats && savedTotalGames >= computedTotalGames
  const displayWins = useSavedRecord ? savedCoachStats.wins : careerTotals.wins
  const displayLosses = useSavedRecord ? savedCoachStats.losses : careerTotals.losses
  const careerWinPct = (displayWins + displayLosses) > 0
    ? ((displayWins / (displayWins + displayLosses)) * 100).toFixed(1)
    : '0.0'

  // Coach photo for the career being viewed — now stored ON the coach
  // entity (coach.photo). You can edit a coach you control; commish/
  // co-commish can edit anyone's. A manually-set photo always wins;
  // otherwise, when viewing your OWN career on a CFB27 PC dynasty, fall back
  // to your actual in-game coach's real headshot. Sourced from
  // dynasty.userCoachPortrait (cfb27SaveSync.js), which reads the Coach row
  // flagged IsUserControlled directly — NOT looked up through teams[tid]'s
  // coachingStaff map by team+position, which can point at a different coach
  // entirely (verified against a real save: a team's "headCoach" position slot
  // held someone else, not the row actually flagged as the human). Not
  // attempted for a teammate's career in a co-op dynasty — there's no synced
  // signal for which save-file coach corresponds to which OTHER member's uid,
  // only which one is "the currently-controlling human."
  const manualCoachPhotoUrl = selectedCoach?.photo || ''
  const inGameCoachPhotoUrl = (() => {
    if (manualCoachPhotoUrl) return null
    if (!isPcAutoDynasty(currentDynasty)) return null
    if (!user?.uid || effectiveSelectedUid !== user.uid) return null
    const assetName = currentDynasty.userCoachPortrait?.genericHeadAssetName
    const url = assetName ? (mapCoachPortraitUrl(assetName) || null) : null
    // TEMPORARY diagnostic — see cfb27SaveSync.js's matching [userCoachPortrait]
    // log. Distinguishes "never got an asset name" (sync/resolution problem)
    // from "got one, but it's not in our bundled manifest" (mapCoachPortraitUrl
    // returns '' for an id/key it doesn't recognize) from "resolved fine."
    console.log('[inGameCoachPhotoUrl]', { userCoachPortrait: currentDynasty.userCoachPortrait, assetName, url })
    return url
  })()
  const coachPhotoUrl = manualCoachPhotoUrl || inGameCoachPhotoUrl
  const canEditPhoto = !!user?.uid && !!selectedCoach && (
    user.uid === selectedControllerUid || canManageMembers(currentDynasty, user.uid)
  )

  const openPhotoModal = () => {
    setPhotoDraft(coachPhotoUrl || '')
    setShowPhotoModal(true)
  }

  const savePhoto = async () => {
    if (savingPhoto || !selectedCoach) return
    setSavingPhoto(true)
    try {
      const url = (photoDraft || '').trim()
      const nextCoach = { ...selectedCoach }
      if (url) nextCoach.photo = url
      else delete nextCoach.photo
      const nextCoaches = { ...getCoaches(currentDynasty), [selectedCoach.cid]: nextCoach }
      await updateDynasty(currentDynasty.id, { coaches: nextCoaches })
      setShowPhotoModal(false)
    } catch (err) {
      console.error('Failed to save coach photo', err)
      alert('Could not save the coach photo. Please try again.')
    } finally {
      setSavingPhoto(false)
    }
  }

  const openNameModal = () => {
    // Pre-fill with your real synced in-game name as a starting point when
    // you've never set a manual label — same fallback used for the display
    // name itself, so the edit box isn't just an empty field under a name
    // that's clearly already known.
    setNameDraft(getMemberLabel(currentDynasty, effectiveSelectedUid) || inGameCoachName || '')
    setShowNameModal(true)
  }

  const saveName = async () => {
    if (savingName) return
    setSavingName(true)
    try {
      const next = setMemberLabelValue(currentDynasty, effectiveSelectedUid, nameDraft)
      await updateDynasty(currentDynasty.id, { memberLabels: next })
      setShowNameModal(false)
    } catch (err) {
      console.error('Failed to save coach name', err)
      alert('Could not save the coach name. Please try again.')
    } finally {
      setSavingName(false)
    }
  }

  return (
    <div className="space-y-5">

      {/* Career hero — editorial split. Identity (eyebrow + name + range)
          stacks on the left; lifetime totals sit in a unified broadcast
          stat strip below the name, full-width on mobile. The strip
          replaces the previous comma-list meta + side stat cluster so
          the page leads with one cohesive lockup instead of two. */}
      <section className="media-card overflow-hidden reveal">
        <div className="px-3 py-3 sm:px-6 sm:py-5">
          {/* Identity + stat strip — single row on desktop (stats push
              right of the name), wraps below on mobile. Saves a full
              row of vertical space vs the prior stacked layout, and the
              stats no longer feel orphaned from the headline. */}
          <div className="flex items-end gap-x-6 sm:gap-x-10 gap-y-3 flex-wrap">
            {/* Coach photo — clickable to edit when you own this career
                (or you're commish). Falls back to an Add-photo prompt
                for editors and renders nothing for read-only viewers. */}
            {(coachPhotoUrl || canEditPhoto) && (
              <button
                type="button"
                onClick={canEditPhoto ? openPhotoModal : undefined}
                disabled={!canEditPhoto}
                aria-label={canEditPhoto ? 'Edit coach photo' : undefined}
                className={`group relative shrink-0 self-end overflow-hidden rounded-xl border border-surface-4 bg-surface-2 ${canEditPhoto ? 'cursor-pointer focus:outline-none focus-visible:ring-1 focus-visible:ring-text-primary' : 'cursor-default'}`}
                style={{ width: 'clamp(56px, 9vw, 84px)', height: 'clamp(56px, 9vw, 84px)' }}
              >
                {coachPhotoUrl ? (
                  <>
                    <img
                      src={displayCoachPhotoUrl(coachPhotoUrl, 300)}
                      alt={selectedDisplayName}
                      className="w-full h-full object-cover"
                      onError={(e) => { e.target.style.display = 'none' }}
                    />
                    {canEditPhoto && (
                      <span className="absolute inset-x-0 bottom-0 text-center py-0.5 text-[9px] uppercase tracking-wide bg-black/55 text-white opacity-0 group-hover:opacity-100 transition-opacity">
                        Edit
                      </span>
                    )}
                  </>
                ) : (
                  <span className="flex h-full w-full items-center justify-center px-1 text-center text-txt-tertiary text-[9px] uppercase leading-tight" style={{ letterSpacing: '1px' }}>
                    Add Photo
                  </span>
                )}
              </button>
            )}
            <div className="min-w-0">
              {/* Name doubles as the coach switcher when more than one coach
                  is tracked: a chevron hints it's clickable and an invisible
                  native <select> overlays the whole lockup. */}
              <div className="relative inline-flex items-center gap-2 max-w-full">
                <h1
                  onClick={canEditPhoto ? openNameModal : undefined}
                  role={canEditPhoto ? 'button' : undefined}
                  tabIndex={canEditPhoto ? 0 : undefined}
                  onKeyDown={canEditPhoto ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openNameModal() } } : undefined}
                  aria-label={canEditPhoto ? 'Edit coach name' : undefined}
                  className={`m-0 text-txt-primary leading-[0.9] uppercase break-words ${canEditPhoto ? 'cursor-pointer hover:opacity-80 transition-opacity focus:outline-none focus-visible:ring-1 focus-visible:ring-text-primary rounded' : ''}`}
                  style={{
                    fontFamily: "'Bebas Neue', sans-serif",
                    fontSize: 'clamp(2rem, 4.5vw, 3.25rem)',
                    letterSpacing: '0.5px',
                  }}
                >
                  {selectedDisplayName}
                </h1>
                {coachOptions.length > 1 && (
                  <>
                    <svg
                      className="flex-shrink-0 text-txt-tertiary self-center"
                      style={{ width: 'clamp(20px, 2.6vw, 28px)', height: 'clamp(20px, 2.6vw, 28px)' }}
                      fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                    </svg>
                    <select
                      value={effectiveSelectedCid || ''}
                      onChange={e => setSelectedCid(e.target.value)}
                      aria-label="Switch career view"
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    >
                      {coachOptions.map(opt => (
                        <option key={opt.cid} value={opt.cid}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </>
                )}
              </div>
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
                  {displayWins}–{displayLosses}
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
                    const stintAnchorId = `stint-${stint.teamTid ?? stint.teamAbbr}-${stint.startYear}`
                    const arcPrimary = teamsData?.[stint.teamTid]?.primaryColor || '#3a3d47'
                    const arcTxt = getContrastTextColor(arcPrimary)
                    return (
                      <button
                        type="button"
                        key={`arc-${stint.teamTid ?? stint.teamAbbr}-${stint.startYear}`}
                        onClick={() => {
                          document.getElementById(stintAnchorId)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                        }}
                        className="relative flex items-center gap-2 sm:gap-2.5 px-2.5 sm:px-3 py-2.5 min-w-0 flex-shrink-0 text-left cfb-texture transition-[filter] hover:brightness-110 focus:outline-none focus:ring-1 focus:ring-white/70"
                        style={{
                          width: `${widthPct}%`,
                          backgroundColor: arcPrimary,
                          backgroundImage: CFB_GRADIENT,
                          borderRight: idx < sortedStints.length - 1 ? '1px solid rgba(0,0,0,0.28)' : 'none',
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
                              color: arcTxt,
                              textShadow: '0 1px 2px rgba(0,0,0,0.3)',
                            }}
                          >
                            {stint.teamAbbr}
                          </div>
                          <div
                            className="tabular-nums mt-1 truncate"
                            style={{ letterSpacing: '1px', fontSize: '9px', color: arcTxt, opacity: 0.78 }}
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

      <CoachTrophyRoom dynasty={currentDynasty} stints={coachingHistory} />

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

        // CFB-aesthetic team color for this stint's header band.
        const sectionPrimary = teamsData?.[stint.teamTid]?.primaryColor || '#3a3d47'
        const sectionTxt = getContrastTextColor(sectionPrimary)

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
            key={`${stint.teamTid ?? stint.teamName}-${stint.startYear}`}
            id={`stint-${stint.teamTid ?? stint.teamAbbr}-${stint.startYear}`}
            className={`media-card relative overflow-hidden ${stint.isCurrent ? '' : 'opacity-95'}`}
            style={{ scrollMarginTop: '88px' }}
          >
            {/* Stint header — full-bleed team-color band (CFB aesthetic):
                true team color + gradient wash + faint logo watermark, with
                contrast-aware text. The current stint reads larger. */}
            <div
              className="cfb-texture flex items-center gap-3 sm:gap-4"
              style={{
                backgroundColor: sectionPrimary,
                backgroundImage: CFB_GRADIENT,
                padding: stint.isCurrent ? 'clamp(0.75rem, 2vw, 1.25rem)' : '0.75rem 1rem',
              }}
            >
              {stint.teamTid && (
                <div className="flex-shrink-0">
                  <TeamLogo tid={stint.teamTid} teams={teamsData} size={stint.isCurrent ? 'xl' : 'lg'} />
                </div>
              )}
              <div className="min-w-0 flex-1 relative">
                <Link
                  to={`${pathPrefix}/team/${stint.teamTid != null ? stint.teamTid : resolveTid(stint.teamAbbr, currentDynasty?.teams || TEAMS)}/${stint.endYear}`}
                  className="hover:opacity-90 transition-opacity m-0 leading-[0.95] uppercase break-words block"
                  style={{
                    fontFamily: "'Bebas Neue', sans-serif",
                    fontSize: stint.isCurrent
                      ? 'clamp(1.5rem, 2.8vw, 2.1rem)'
                      : 'clamp(1.15rem, 2vw, 1.5rem)',
                    letterSpacing: '0.5px',
                    color: sectionTxt,
                    textShadow: '0 1px 2px rgba(0,0,0,0.3)',
                  }}
                >
                  {stint.teamName}
                </Link>
                <div
                  className="flex items-center gap-2 mt-1 flex-wrap"
                  style={{ color: sectionTxt, '--text-tertiary': `color-mix(in srgb, ${sectionTxt} 72%, transparent)` }}
                >
                  <span className="font-semibold uppercase" style={{ letterSpacing: '1px', fontSize: '11px', opacity: 0.92 }}>
                    {getPositionLabel(stint.position)}
                  </span>
                  <span className="tabular" style={{ fontSize: '12px', opacity: 0.82 }}>{yearRange}</span>
                  {stint.conference && (
                    <span style={{ fontSize: '12px', opacity: 0.82 }}>{stint.conference}</span>
                  )}
                </div>
              </div>
            </div>

            <div className={stint.isCurrent ? 'p-3 sm:p-5' : 'p-3 sm:p-4'}>
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
                  onClick: () => openGamesModal('all', stint.teamTid ?? stint.teamName),
                })
                if (stint.nationalChampionships > 0) {
                  cells.push({
                    key: 'natl',
                    value: stint.nationalChampionships,
                    label: stint.nationalChampionships === 1 ? 'NATL TITLE' : 'NATL TITLES',
                    accent: true,
                    onClick: () => openGamesModal('cfp', stint.teamTid ?? stint.teamName),
                  })
                }
                if (stint.confChampionships > 0) {
                  cells.push({
                    key: 'conf',
                    value: stint.confChampionships,
                    label: stint.confChampionships === 1 ? 'CONF TITLE' : 'CONF TITLES',
                    onClick: () => openGamesModal('confChamp', stint.teamTid ?? stint.teamName),
                  })
                }
                if (stint.playoffAppearances > 0) {
                  cells.push({
                    key: 'cfp',
                    value: stint.playoffAppearances,
                    label: stint.playoffAppearances === 1 ? 'CFP APP' : 'CFP APPS',
                    onClick: () => openGamesModal('cfp', stint.teamTid ?? stint.teamName),
                  })
                }
                if (showsBowls) {
                  cells.push({
                    key: 'bowls',
                    value: `${bowlWins}-${bowlLosses}`,
                    label: 'BOWLS',
                    onClick: () => openGamesModal('bowl', stint.teamTid ?? stint.teamName),
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

                    const oppColor = (game.perspective?.opponentTid != null && teamsData?.[game.perspective.opponentTid]?.primaryColor) || '#3a3d47'
                    const metaLabel = [weekLabel, site, roundLabel].filter(Boolean).join(' · ')
                    const row = (
                      <GameResultRow
                        key={`${year}-${game.week}-${index}`}
                        tid={game.perspective?.opponentTid}
                        teams={teamsData}
                        color={oppColor}
                        name={`${site === 'AWAY' ? '@' : 'vs'} ${opponentName}`}
                        rank={game.perspective?.opponentRank}
                        result={gameIsWin ? 'W' : 'L'}
                        score={`${Math.max(userScore, oppScore)}-${Math.min(userScore, oppScore)}`}
                        meta={metaLabel}
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

      {/* Coach photo editor — same ImageUpload flow used everywhere else. */}
      <Modal
        isOpen={showPhotoModal}
        onClose={() => setShowPhotoModal(false)}
        title={`${selectedDisplayName} — Coach Photo`}
        size="sm"
        footer={
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => { setPhotoDraft(''); }}
              className="text-xs text-txt-tertiary hover:text-txt-secondary px-2 py-1.5"
              disabled={!photoDraft}
            >
              Remove photo
            </button>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowPhotoModal(false)}
                className="text-sm px-3 py-1.5 rounded-md border border-surface-4 text-txt-secondary hover:bg-surface-2"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={savePhoto}
                disabled={savingPhoto}
                className="text-sm px-3 py-1.5 rounded-md bg-surface-5 text-txt-primary font-semibold disabled:opacity-60"
              >
                {savingPhoto ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        }
      >
        <div className="space-y-3">
          {inGameCoachPhotoUrl && (
            <div>
              <div className="label-xs text-txt-tertiary mb-1.5" style={{ letterSpacing: '1.5px' }}>
                Your CFB27 Coach Portrait
              </div>
              <button
                type="button"
                onClick={() => setPhotoDraft(inGameCoachPhotoUrl)}
                className="flex items-center gap-3 w-full p-2 rounded-lg border text-left transition-colors hover:bg-surface-2"
                style={{ borderColor: photoDraft === inGameCoachPhotoUrl ? 'var(--text-primary)' : 'var(--surface-4)' }}
              >
                <img
                  src={proxyImageUrl(inGameCoachPhotoUrl, 120)}
                  alt="Your CFB27 coach portrait"
                  className="w-12 h-12 rounded-md object-cover flex-shrink-0"
                />
                <span className="text-sm text-txt-secondary">
                  {currentDynasty.userCoachPortrait?.name || 'Use this real in-game headshot'}
                </span>
                {photoDraft === inGameCoachPhotoUrl && (
                  <span className="ml-auto text-xs font-semibold uppercase text-txt-primary flex-shrink-0">Selected</span>
                )}
              </button>
            </div>
          )}
          <button
            type="button"
            onClick={() => setShowPortraitGallery(true)}
            className="w-full text-sm px-3 py-2 rounded-md border border-surface-4 text-txt-secondary hover:bg-surface-2 hover:text-txt-primary transition-colors"
          >
            Browse All Coach Portraits ({ALL_COACH_PORTRAITS.length})
          </button>
          <div className="label-xs text-txt-tertiary text-center my-2" style={{ letterSpacing: '1.5px' }}>
            — or —
          </div>
          <ImageUpload
            value={photoDraft}
            onChange={(url) => setPhotoDraft(url || '')}
            placeholder="Upload or paste a custom coach photo"
          />
        </div>
      </Modal>

      {/* Coach portrait gallery — every headshot in the bundled CFB27
          portrait library (real coaches + generated ones), so you can pick
          any look, not just the one auto-matched to your own save. */}
      <Modal
        isOpen={showPortraitGallery}
        onClose={() => setShowPortraitGallery(false)}
        title="Choose a Coach Portrait"
        size="lg"
      >
        <div
          className="grid gap-2 overflow-y-auto"
          style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(64px, 1fr))', maxHeight: '65vh' }}
        >
          {ALL_COACH_PORTRAITS.map((path) => {
            const isSelected = photoDraft === `${window.location.origin}${path}`
            return (
              <button
                key={path}
                type="button"
                onClick={() => {
                  setPhotoDraft(`${window.location.origin}${path}`)
                  setShowPortraitGallery(false)
                }}
                className="aspect-square rounded-md overflow-hidden border-2 transition-colors"
                style={{ borderColor: isSelected ? 'var(--text-primary)' : 'transparent' }}
              >
                <img
                  src={displayCoachPhotoUrl(`${window.location.origin}${path}`, 120)}
                  alt=""
                  loading="lazy"
                  className="w-full h-full object-cover"
                />
              </button>
            )
          })}
        </div>
      </Modal>

      {/* Coach name editor — sets dynasty.memberLabels[uid] (leagueModel.js),
          the same "your display name" store used everywhere else a member's
          name shows up. */}
      <Modal
        isOpen={showNameModal}
        onClose={() => setShowNameModal(false)}
        title="Edit Coach Name"
        size="sm"
        footer={
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowNameModal(false)}
              className="text-sm px-3 py-1.5 rounded-md border border-surface-4 text-txt-secondary hover:bg-surface-2"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={saveName}
              disabled={savingName}
              className="text-sm px-3 py-1.5 rounded-md bg-surface-5 text-txt-primary font-semibold disabled:opacity-60"
            >
              {savingName ? 'Saving…' : 'Save'}
            </button>
          </div>
        }
      >
        <input
          type="text"
          value={nameDraft}
          onChange={(e) => setNameDraft(e.target.value)}
          placeholder="Coach name"
          maxLength={40}
          autoFocus
          className="w-full px-3 py-2 rounded-md border border-surface-4 bg-surface-1 text-txt-primary text-sm focus:outline-none focus:border-surface-5"
        />
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
                  onClick={() => navigate(`${pathPrefix}/team/${stint.teamTid != null ? stint.teamTid : resolveTid(stint.teamAbbr, currentDynasty?.teams || TEAMS)}/${yr.year}`)}
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
