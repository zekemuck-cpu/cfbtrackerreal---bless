import { useState, useMemo, useEffect, useRef, useLayoutEffect } from 'react'
import { Link, useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useDynasty, GAME_TYPES, detectGameType, getCustomConferencesForYear, getTeamRankForWeek } from '../../context/DynastyContext'
import { usePathPrefix } from '../../hooks/usePathPrefix'
import { TEAMS, getCurrentTeamTid, getCurrentTeamAbbr, isFCSPlaceholderAbbr } from '../../data/teamRegistry'
import { getMascotName as getMascotNameFromTeams, stripMascotFromName, getTeamLogoByTid } from '../../data/teams'
import { getTeamColors } from '../../data/teamColors'
import { getContrastTextColor } from '../../utils/colorUtils'
import { conferenceTeams as DEFAULT_CONFERENCES, getTeamConference } from '../../data/conferenceTeams'
import { Card, EmptyState, TeamLogo } from '../../components/ui'
import InlineYearSelect from '../../components/ui/InlineYearSelect'
import WeeklyScoresModal from '../../components/WeeklyScoresModal'
import WeekRecapModal from '../../components/WeekRecapModal'
import BowlWeek1Modal from '../../components/BowlWeek1Modal'
import BowlWeek2Modal from '../../components/BowlWeek2Modal'
import ConferenceChampionshipModal from '../../components/ConferenceChampionshipModal'
import FormattedRecap from '../../components/FormattedRecap'
import GenerateSocialModal from '../../components/GenerateSocialModal'
import SocialFeed from '../../components/SocialFeed'
import { DEFAULT_SOCIAL_PLATFORM, getEffectiveCharacters } from '../../data/socialModel'
import buildRecapLinks from '../../utils/buildRecapLinks'
import { getRivalryTrophyForTeams } from '../../utils/trophyEngine'
import { useTeamColors } from '../../hooks/useTeamColors'
import PositionBattles from '../../components/PositionBattles'
import { TabBar } from '../../components/CfbUI'

const REGULAR_SEASON_WEEKS = Array.from({ length: 16 }, (_, i) => i)  // 0-15

// -1 = preseason preview (before week 0 games). Post-season: 16 = Conference
// Championship, 17-20 = Bowl Weeks 1-4 (incl. CFP bracket).
const ALL_WEEKS = [-1, ...REGULAR_SEASON_WEEKS, 16, 17, 18, 19, 20]

const WEEK_LABELS = {
  [-1]: 'Preseason',
  16: 'Conf Champ',
  17: 'Bowl Week 1',
  18: 'Bowl Week 2',
  19: 'Bowl Week 3',
  20: 'Natl Champ',
}

// Returns a human-readable label; regular weeks stay as "Week N".
const weekLabelFor = (wk) => WEEK_LABELS[wk] ?? `Week ${wk}`

// Maps a game to the numeric week slot used as the key in gamesByWeek.
// Regular weeks 0-14 come from game.week. Post-season slots:
//   16 = Conference Championship
//   17 = Bowl Week 1 + CFP First Round
//   18 = Bowl Week 2 + CFP Quarterfinal
//   19 = Bowl Week 3 / CFP Semifinal
//   20 = National Championship
const weekBucketFor = (g) => {
  const type = detectGameType(g)
  if (type === GAME_TYPES.CONFERENCE_CHAMPIONSHIP) return 16
  if (type === GAME_TYPES.CFP_FIRST_ROUND) return 17
  if (type === GAME_TYPES.CFP_QUARTERFINAL) return 18
  if (type === GAME_TYPES.CFP_SEMIFINAL) return 19
  if (type === GAME_TYPES.CFP_CHAMPIONSHIP) return 20
  if (type === GAME_TYPES.BOWL) {
    return g.bowlWeek === 'week2' ? 18 : 17
  }
  const wk = Number(g.week)
  return Number.isFinite(wk) ? wk : null
}

// The latest week slot that has a *played* game (both scores entered) for a
// given year. Used to default the recap to the most recent results once the
// season is fully over — so it keeps advancing through the bowl weeks and the
// Playoff instead of getting stuck on Conf Champ.
const latestPlayedWeekForYear = (games, year) => {
  let max = null
  for (const g of games || []) {
    if (!g || Number(g.year) !== year) continue
    if (typeof g.team1Score !== 'number' || typeof g.team2Score !== 'number') continue
    const wk = weekBucketFor(g)
    if (wk == null) continue
    if (max == null || wk > max) max = wk
  }
  return max
}

// Delegate to the shared mascot-strip helper so this page stays in
// sync with the canonical list (FCS placeholders + 2/3-word mascots).
const getSchoolName = (m) => stripMascotFromName(m) || ''

function formatRecord(rec) {
  if (!rec) return null
  const { w = 0, l = 0, t = 0 } = rec
  return t > 0 ? `${w}-${l}-${t}` : `${w}-${l}`
}

// Single-line label that shrinks its own font-size until it fits the available
// width (never wraps to a second line). Used for long bowl names like
// "FAMOUS IDAHO POTATO BOWL" in the card header strip.
function FitText({ children, max = 10, min = 6.5, className = '', style }) {
  const ref = useRef(null)
  const [fontSize, setFontSize] = useState(max)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const fit = () => {
      let s = max
      el.style.fontSize = `${s}px`
      let guard = 0
      // nowrap + overflow-hidden → scrollWidth is the full one-line text width.
      while (s > min && el.scrollWidth > el.clientWidth + 0.5 && guard < 40) {
        s -= 0.5
        el.style.fontSize = `${s}px`
        guard++
      }
      setFontSize(s)
    }
    fit()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(fit) : null
    if (ro && el.parentElement) ro.observe(el.parentElement)
    return () => ro?.disconnect()
  }, [children, max, min])
  return (
    <span ref={ref} className={`block whitespace-nowrap overflow-hidden ${className}`} style={{ ...style, fontSize: `${fontSize}px` }}>
      {children}
    </span>
  )
}

// Renders a Link with smart text fitting: shows `full` when it fits, swaps
// to `abbr` when it would overflow the available width. Uses a hidden
// measurement span so the swap doesn't oscillate after layout shifts.
function FittedNameLink({ to, onClick, full, abbr, className, style, children }) {
  const linkRef = useRef(null)
  const measureRef = useRef(null)
  const [useAbbr, setUseAbbr] = useState(false)

  useLayoutEffect(() => {
    if (!abbr || abbr === full) return undefined
    const link = linkRef.current
    const m = measureRef.current
    if (!link || !m) return undefined
    const recompute = () => {
      const fits = m.scrollWidth <= link.clientWidth
      setUseAbbr(prev => (prev === !fits ? prev : !fits))
    }
    const ro = new ResizeObserver(recompute)
    ro.observe(link)
    recompute()
    return () => ro.disconnect()
  }, [full, abbr])

  return (
    <Link
      ref={linkRef}
      to={to}
      onClick={onClick}
      className={className}
      style={{ ...(style || {}), position: 'relative' }}
    >
      <span
        ref={measureRef}
        aria-hidden="true"
        style={{
          position: 'absolute',
          visibility: 'hidden',
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
          left: -9999,
          top: 0,
        }}
      >
        {full}
      </span>
      {useAbbr && abbr ? abbr : full}
      {children}
    </Link>
  )
}

function GameCard({ game, teams, pathPrefix, recordsByTid, domId, compact = false }) {
  const navigate = useNavigate()
  const { currentDynasty } = useDynasty()
  const t1 = Number(game.team1Tid)
  const t2 = Number(game.team2Tid)
  const team1Score = typeof game.team1Score === 'number' ? game.team1Score : null
  const team2Score = typeof game.team2Score === 'number' ? game.team2Score : null
  // Schedule entries pre-create games with both scores set to 0 before
  // kickoff. CFB games can't end 0-0, so a 0-0 row is a placeholder, not
  // a played tie — gate isPlayed on isPlayed flag or at least one team
  // having scored. Same heuristic as the dashboard's isGameActuallyPlayed.
  const hasScores = team1Score !== null && team2Score !== null
  const isPlayed = hasScores && (game.isPlayed || team1Score > 0 || team2Score > 0)
  const isTie = isPlayed && team1Score === team2Score
  const isNeutral = game.homeTeamTid == null

  // Always render away on top, home on bottom (ordering by visual convention).
  // For neutral games — no real home — keep team1/team2 source order.
  let topTid, bottomTid
  if (isNeutral) {
    topTid = t1
    bottomTid = t2
  } else {
    const homeTid = Number(game.homeTeamTid)
    topTid = homeTid === t1 ? t2 : t1
    bottomTid = homeTid
  }

  const scoreFor = (tid) => (tid === t1 ? team1Score : team2Score)
  // Prefer the rank stored directly on the game (set by GameEdit /
  // WeeklyScores entry post-rank-migration). Fall back to rankByWeek
  // for games that pre-date the migration or were saved without ranks
  // — without this fallback, tiles silently lose the rank pip while
  // the matching detail page still shows it (e.g. Duke #23 visible on
  // the Wake @ Duke detail page but missing from the tile).
  const rankFor = (tid) => {
    const raw = tid === t1 ? game.team1Rank : game.team2Rank
    if (raw != null && raw !== '') {
      const n = parseInt(raw, 10)
      if (Number.isFinite(n) && n >= 1 && n <= 25) return n
    }
    return getTeamRankForWeek(currentDynasty, tid, game.year, game.week) ?? null
  }

  const topScore = scoreFor(topTid)
  const bottomScore = scoreFor(bottomTid)
  const topWon = isPlayed && !isTie && topScore > bottomScore
  const bottomWon = isPlayed && !isTie && bottomScore > topScore
  const topTeam = teams[topTid] || TEAMS[topTid] || null
  const bottomTeam = teams[bottomTid] || TEAMS[bottomTid] || null

  const wk = Number(game.week)
  const topRecord = formatRecord(recordsByTid?.[topTid]?.[wk])
  const bottomRecord = formatRecord(recordsByTid?.[bottomTid]?.[wk])
  const topRank = rankFor(topTid)
  const bottomRank = rankFor(bottomTid)

  const handleCardClick = () => navigate(`${pathPrefix}/game/${game.id}`)
  const handleCardKey = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      navigate(`${pathPrefix}/game/${game.id}`)
    }
  }

  // Only surface a header strip for non-default states (tie, scheduled).
  // "Final" is implied by a played game's score, so we don't repeat it.
  const statusLabel = !isPlayed ? 'Scheduled' : isTie ? 'Tie' : null
  const showStatusStrip = statusLabel != null || isNeutral

  // For neutral-site games, prefer a meaningful game label over "Neutral".
  const venueLabel = (() => {
    const type = detectGameType(game)
    if (type === GAME_TYPES.CFP_CHAMPIONSHIP) return 'National Championship'
    if (type === GAME_TYPES.CFP_SEMIFINAL) return game.bowlName || 'CFP Semifinal'
    if (type === GAME_TYPES.CFP_QUARTERFINAL) return game.bowlName || 'CFP Quarterfinal'
    if (type === GAME_TYPES.CFP_FIRST_ROUND) return 'CFP First Round'
    if (type === GAME_TYPES.BOWL) return game.bowlName || 'Bowl Game'
    if (type === GAME_TYPES.CONFERENCE_CHAMPIONSHIP) return game.conference ? `${game.conference} Championship` : 'Conf Championship'
    return 'Neutral'
  })()

  const TeamRow = ({ tid, team, score, won, lost, record, rank }) => {
    const mascot = getMascotNameFromTeams(tid, teams) || team?.name || ''
    const school = getSchoolName(mascot) || team?.abbr || `TID ${tid}`
    const teamColors = mascot ? getTeamColors(mascot, teams) : null
    const teamPrimary = teamColors?.primary || '#3a3d47'
    // Full broadcast team-color band (matches the box-score / game-result rows):
    // the team's color washes the whole row, with the shared highlight + vignette
    // and grain. The loser's row darkens slightly + dims so the winner reads at a
    // glance, without losing the team color.
    const txt = getContrastTextColor(teamPrimary, teamColors?.secondary)
    const logoUrl = getTeamLogoByTid(tid, teams)
    return (
      <div
        className={`cfb-texture relative flex items-center ${compact ? 'gap-2 pl-2 pr-2.5 py-2' : 'gap-2.5 pl-2.5 pr-4 py-2.5'}`}
        style={{
          backgroundColor: teamPrimary,
          backgroundImage: lost
            ? 'linear-gradient(120deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0) 42%), linear-gradient(180deg, rgba(0,0,0,0.28) 0%, rgba(0,0,0,0.5) 100%)'
            : 'linear-gradient(120deg, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0) 42%), linear-gradient(180deg, rgba(0,0,0,0.04) 0%, rgba(0,0,0,0.3) 100%)',
        }}
      >
        {logoUrl ? (
          <div className={`${compact ? 'w-6 h-6' : 'w-7 h-7'} rounded-full bg-white flex items-center justify-center p-1 flex-shrink-0 shadow-sm`}>
            <img src={logoUrl} alt="" className="w-full h-full object-contain" />
          </div>
        ) : (
          <TeamLogo tid={tid} teams={teams} size={compact ? 'xs' : 'sm'} className="flex-shrink-0" />
        )}
        <div className="flex-1 min-w-0 flex items-baseline gap-1">
          {rank != null && (
            <span className="tabular-nums flex-shrink-0" style={{ fontSize: '10px', color: txt, opacity: 0.7, fontWeight: 700 }}>
              {rank}
            </span>
          )}
          <FittedNameLink
            to={`${pathPrefix}/team/${tid}/${game.year}`}
            onClick={(e) => e.stopPropagation()}
            full={school}
            abbr={team?.abbr || ''}
            className={`${compact ? 'text-[12px]' : 'text-[15px]'} truncate hover:underline transition-colors`}
            style={{ fontWeight: won ? 800 : 600, color: txt, opacity: lost ? 0.85 : 1, textShadow: '0 1px 2px rgba(0,0,0,0.3)' }}
          />
          {record && !compact && (
            <span className="tabular-nums flex-shrink-0" style={{ fontSize: '11px', color: txt, opacity: 0.65 }}>
              {record}
            </span>
          )}
        </div>
        <span
          className="font-display tabular-nums leading-none flex-shrink-0"
          style={{
            fontSize: compact ? '18px' : '22px',
            fontWeight: won ? 800 : 600,
            color: txt,
            opacity: lost ? 0.78 : 1,
            minWidth: compact ? '1.75rem' : '2.25rem',
            textAlign: 'right',
            letterSpacing: '-0.02em',
            textShadow: '0 1px 2px rgba(0,0,0,0.35)',
          }}
        >
          {score ?? '—'}
        </span>
      </div>
    )
  }

  return (
    <div
      role="button"
      tabIndex={0}
      id={domId}
      onClick={handleCardClick}
      onKeyDown={handleCardKey}
      className="game-card relative rounded-lg overflow-hidden bg-surface-2 transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-surface-5"
      style={{ border: '1px solid rgba(255,255,255,0.55)', boxShadow: '0 4px 12px rgba(0,0,0,0.5)' }}
    >
      {/* Header strip only renders for non-default states (tie, scheduled, neutral) */}
      {showStatusStrip && (
        <div
          className="flex items-center justify-between px-3 py-1.5"
          style={{
            backgroundColor: 'var(--surface-1)',
            borderBottom: '1px solid var(--surface-4)',
          }}
        >
          {statusLabel && (
            <span
              className="flex-shrink-0"
              style={{
                fontSize: '10px',
                fontWeight: 700,
                color: 'var(--text-secondary)',
                letterSpacing: '1.6px',
                textTransform: 'uppercase',
              }}
            >
              {statusLabel}
            </span>
          )}
          {isNeutral && (
            <FitText
              className="flex-1 min-w-0 text-right"
              max={10}
              min={6.5}
              style={{
                fontWeight: 600,
                color: 'var(--text-tertiary)',
                letterSpacing: '1.4px',
                textTransform: 'uppercase',
              }}
            >
              {venueLabel}
            </FitText>
          )}
        </div>
      )}
      <TeamRow
        tid={topTid}
        team={topTeam}
        score={topScore}
        won={topWon}
        lost={bottomWon}
        record={topRecord}
        rank={topRank}
      />
      <div style={{ borderTop: '1px solid rgba(0,0,0,0.45)' }}>
        <TeamRow
          tid={bottomTid}
          team={bottomTeam}
          score={bottomScore}
          won={bottomWon}
          lost={topWon}
          record={bottomRecord}
          rank={bottomRank}
        />
      </div>
    </div>
  )
}

export default function WeeklyScores() {
  const { year: urlYear, week: urlWeek } = useParams()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { currentDynasty, isViewOnly, saveCPUBowlGames, saveCFPGames, saveRankings, saveCPUConferenceChampionships, updateDynasty, loadSocial, replaceSocialWeek } = useDynasty()
  const pathPrefix = usePathPrefix()
  const [editing, setEditing] = useState(false)
  const [ccModalOpen, setCcModalOpen] = useState(false)
  const [bowlWeek1Open, setBowlWeek1Open] = useState(false)
  const [bowlWeek2Open, setBowlWeek2Open] = useState(false)
  // Recap modal opens locally on this page too — no need to round-trip to
  // the dashboard. Same component handles preseason + in-season.
  const [recapModalOpen, setRecapModalOpen] = useState(false)
  const [socialModalOpen, setSocialModalOpen] = useState(false)

  // Resolve display year/week BEFORE consumers like `tabParam` reference
  // them — both feed off URL params plus dynasty phase fallbacks.
  const fallbackCurrentYear = Number(currentDynasty?.currentYear) || Number(currentDynasty?.startYear) || new Date().getFullYear()
  const displayYear = urlYear ? parseInt(urlYear, 10) : fallbackCurrentYear
  const displayWeek = urlWeek != null ? parseInt(urlWeek, 10) : (() => {
    const phase = currentDynasty?.currentPhase
    const week = Number(currentDynasty?.currentWeek)
    if (phase === 'preseason') return -1
    if (phase === 'regular_season') return Math.max(0, week - 1)
    if (phase === 'conference_championship') return 16
    // postseason week 1 → show CCG (16), week 2 → BW1 (17), week 3 → BW2 (18), etc.
    // mirrors regular season "show the last completed week" pattern
    if (phase === 'postseason') return Math.max(16, 15 + week)
    // offseason / anything past the postseason: the season is fully played, so
    // land on the most recent week that has results — the final bowl/CFP week,
    // not Conf Champ. Falls back to 16 if somehow nothing's been played.
    return latestPlayedWeekForYear(currentDynasty?.games, displayYear) ?? 16
  })()

  // Tab state lives in the URL (?tab=scores|recap|podcast) so deep-links from the
  // dashboard's recap to-do land directly on the recap view, and so the
  // user's choice survives navigating into a game and back.
  const rawTab = searchParams.get('tab')
  const isPreseasonWeek = displayWeek === -1 || displayWeek === 0 || displayWeek === 1
  const tabParam = (rawTab === 'battles' && isPreseasonWeek) ? 'battles'
    : (rawTab === 'recap' || displayWeek === -1) ? 'recap'
    : 'scores'
  const setTab = (next) => {
    setSearchParams(prev => {
      const params = new URLSearchParams(prev)
      if (next === 'scores') params.delete('tab')
      else params.set('tab', next)
      return params
    }, { replace: true })
  }

  // Lazy-load social data (characters + week feed) the first time the Social
  // tab is opened for a dynasty — it's opt-in, so kept off the hot load path.
  const socialLoadedRef = useRef(null)
  useEffect(() => {
    if (tabParam !== 'social' || !currentDynasty?.id) return
    if (socialLoadedRef.current === currentDynasty.id) return
    socialLoadedRef.current = currentDynasty.id
    loadSocial(currentDynasty.id).catch(() => {})
  }, [tabParam, currentDynasty?.id, loadSocial])

  // ESPN-style filter (?filter=all | top25 | <Conference Name>). Lives in
  // search params so the user's selection survives navigating into a game
  // and back.
  const filter = searchParams.get('filter') || 'all'
  const setFilter = (value) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      if (!value || value === 'all') next.delete('filter')
      else next.set('filter', value)
      return next
    }, { replace: true })
  }

  // ?game=<gameId> — when present, scroll that card into view and
  // briefly flash its border so the user lands on the matchup they
  // clicked through from the Game page header.
  const scrollGameId = searchParams.get('game')
  const scrollHandledRef = useRef(false)

  const userTeamName = currentDynasty
    ? (currentDynasty.teams?.[getCurrentTeamTid(currentDynasty)]?.name || currentDynasty.teamName)
    : null
  const teamColors = useTeamColors(userTeamName, currentDynasty?.teams)

  if (!currentDynasty) return null

  const teams = currentDynasty.teams || TEAMS
  const allGames = currentDynasty.games || []

  // Years that have at least one regular-season game OR are within dynasty range
  const allYearsSet = new Set()
  const startYear = Number(currentDynasty.startYear) || Number(currentDynasty.currentYear) || new Date().getFullYear()
  const currentYear = Number(currentDynasty.currentYear) || startYear
  for (let y = startYear; y <= currentYear; y++) allYearsSet.add(y)
  for (const g of allGames) {
    if (g?.year) allYearsSet.add(Number(g.year))
  }
  const availableYears = Array.from(allYearsSet).sort((a, b) => b - a)
  // Memoize the recap link patterns — buildRecapLinks builds hundreds of
  // patterns from dynasty.games + .teams. Gated on tab + recap presence:
  // skip the build entirely when the user is on the Scores tab or the
  // week has no recap. Otherwise every dynasty.games / .teams reference
  // change (any Firestore write) rebuilds the full pattern set even
  // though it wouldn't be rendered.
  const recapLinks = useMemo(() => {
    if (tabParam !== 'recap') return null
    const recapText = currentDynasty?.weekRecapsByYear?.[displayYear]?.[displayWeek]?.text
    if (!recapText) return null
    return buildRecapLinks(currentDynasty, displayYear, pathPrefix, recapText)
  }, [
    tabParam,
    currentDynasty?.id,
    displayYear,
    displayWeek,
    currentDynasty?.games,
    currentDynasty?.teams,
    currentDynasty?.weekRecapsByYear,
    pathPrefix,
  ])

  const handleYearChange = (y) => navigate(`${pathPrefix}/weekly-scores/${y}/${displayWeek}`)
  const handleWeekChange = (w) => navigate(`${pathPrefix}/weekly-scores/${displayYear}/${w}`)

  const handleCCModalSave = async (championships) => {
    const year = displayYear
    const existingByYear = currentDynasty.conferenceChampionshipsByYear || {}
    await updateDynasty(currentDynasty.id, {
      conferenceChampionships: championships,
      conferenceChampionshipsByYear: { ...existingByYear, [year]: championships },
    })
    await saveCPUConferenceChampionships(currentDynasty.id, championships, year)
    setCcModalOpen(false)
  }

  const handleBowlWeek1Save = async (bowlGames) => {
    try {
      const year = displayYear
      const pollEntries = bowlGames.pollEntries || []
      if (pollEntries.length > 0) {
        const rankSlot = (() => {
          const phase = currentDynasty?.currentPhase
          const wk = Number(currentDynasty?.currentWeek)
          return phase === 'postseason' && Number.isFinite(wk) ? 16 + wk : 17
        })()
        await saveRankings(currentDynasty.id, pollEntries, year, rankSlot)
      }
      const gamesWithScores = bowlGames.filter(g =>
        g.team1Score !== null && g.team1Score !== undefined &&
        g.team2Score !== null && g.team2Score !== undefined
      )
      const sanitize = (g) => ({
        bowlName: g.bowlName || '', team1: g.team1 || '', team2: g.team2 || '',
        team1Score: typeof g.team1Score === 'number' ? g.team1Score : null,
        team2Score: typeof g.team2Score === 'number' ? g.team2Score : null,
        winner: g.winner || null,
      })
      const cfpFR = gamesWithScores.filter(g => g.bowlName?.startsWith('CFP First Round')).map(g => {
        const m = g.bowlName?.match(/#(\d+) vs #(\d+)/)
        return { seed1: m ? parseInt(m[1]) : null, seed2: m ? parseInt(m[2]) : null, ...sanitize(g) }
      })
      const regularBowls = gamesWithScores.filter(g => !g.bowlName?.startsWith('CFP First Round')).map(sanitize)
      await saveCPUBowlGames(currentDynasty.id, regularBowls, year, 'week1')
      if (cfpFR.length > 0) await saveCFPGames(currentDynasty.id, cfpFR, year, GAME_TYPES.CFP_FIRST_ROUND)
      setBowlWeek1Open(false)
    } catch (err) {
      console.error('[WeeklyScores] Bowl Week 1 save error:', err)
    }
  }

  const handleBowlWeek2Save = async (bowlGames) => {
    try {
      const year = displayYear
      const pollEntries = bowlGames.pollEntries || []
      if (pollEntries.length > 0) {
        const rankSlot = (() => {
          const phase = currentDynasty?.currentPhase
          const wk = Number(currentDynasty?.currentWeek)
          return phase === 'postseason' && Number.isFinite(wk) ? 16 + wk : 18
        })()
        await saveRankings(currentDynasty.id, pollEntries, year, rankSlot)
      }
      const gamesWithScores = bowlGames.filter(g =>
        g.team1Score !== null && g.team1Score !== undefined &&
        g.team2Score !== null && g.team2Score !== undefined
      )
      const sanitize = (g) => ({
        bowlName: g.bowlName || '', team1: g.team1 || '', team2: g.team2 || '',
        team1Score: typeof g.team1Score === 'number' ? g.team1Score : null,
        team2Score: typeof g.team2Score === 'number' ? g.team2Score : null,
        winner: g.winner || null,
      })
      const cfpQF = gamesWithScores.filter(g => g.bowlName?.includes('(CFP QF)')).map(g => {
        const m = g.bowlName?.match(/#(\d+) vs #(\d+)/)
        return { seed1: m ? parseInt(m[1]) : null, seed2: m ? parseInt(m[2]) : null, ...sanitize(g) }
      })
      const regularBowls = gamesWithScores.filter(g => !g.bowlName?.includes('(CFP QF)')).map(sanitize)
      await saveCPUBowlGames(currentDynasty.id, regularBowls, year, 'week2')
      if (cfpQF.length > 0) await saveCFPGames(currentDynasty.id, cfpQF, year, GAME_TYPES.CFP_QUARTERFINAL)
      setBowlWeek2Open(false)
    } catch (err) {
      console.error('[WeeklyScores] Bowl Week 2 save error:', err)
    }
  }

  // All games for the selected year, grouped by week slot (regular season
  // through post-season). Records computation below still limits to
  // REGULAR + CCG so season records stay accurate.
  const gamesByWeek = useMemo(() => {
    const map = new Map()
    for (const g of allGames) {
      if (!g) continue
      if (Number(g.year) !== displayYear) continue
      if (!g.team1Tid || !g.team2Tid) continue
      const wk = weekBucketFor(g)
      if (wk == null) continue
      if (!map.has(wk)) map.set(wk, [])
      map.get(wk).push(g)
    }
    return map
  }, [allGames, displayYear])

  // Cumulative team records keyed by tid → week → { w, l, t } (record after that week's game)
  const recordsByTidByWeek = useMemo(() => {
    // Schedule entries pre-create games with team1Score=team2Score=0 well
    // before kickoff, so `typeof === 'number'` alone would treat every
    // unplayed placeholder as a real 0-0 tie. CFB games can't end 0-0,
    // so require at least one team to have scored OR the explicit
    // isPlayed flag — mirrors the isGameActuallyPlayed heuristic used
    // on the dashboard.
    const yearGames = allGames.filter(g => (
      g && Number(g.year) === displayYear &&
      (g.gameType === GAME_TYPES.REGULAR || g.gameType === GAME_TYPES.CONFERENCE_CHAMPIONSHIP) &&
      g.team1Tid && g.team2Tid &&
      typeof g.team1Score === 'number' && typeof g.team2Score === 'number' &&
      (g.isPlayed || g.team1Score > 0 || g.team2Score > 0)
    )).sort((a, b) => {
      // CCG games sort after Week 14. Plain Number(a.week) - Number(b.week)
      // returns NaN for any CCG and ruins the running-record cumulative
      // walk below.
      const aw = weekBucketFor(a) ?? Number.POSITIVE_INFINITY
      const bw = weekBucketFor(b) ?? Number.POSITIVE_INFINITY
      return aw - bw
    })

    const running = {}
    const result = {}
    // Skip FCS placeholders (FCSE/FCSM/FCSN/FCSW) entirely. They're
    // anonymous regional buckets that play multiple games in the
    // same week — accumulating them produces a meaningless record
    // (the same placeholder appearing as 0-1, 1-1, 1-2 across the
    // page in successive cards).
    const isPlaceholder = (tid) => {
      const abbr = teams[tid]?.abbr
      return isFCSPlaceholderAbbr(abbr)
    }
    for (const g of yearGames) {
      const t1 = Number(g.team1Tid)
      const t2 = Number(g.team2Tid)
      const wk = weekBucketFor(g)
      if (wk == null) continue
      const t1IsPlaceholder = isPlaceholder(t1)
      const t2IsPlaceholder = isPlaceholder(t2)
      if (!t1IsPlaceholder) running[t1] = running[t1] || { w: 0, l: 0, t: 0 }
      if (!t2IsPlaceholder) running[t2] = running[t2] || { w: 0, l: 0, t: 0 }
      if (g.team1Score > g.team2Score) {
        if (!t1IsPlaceholder) running[t1].w++
        if (!t2IsPlaceholder) running[t2].l++
      } else if (g.team2Score > g.team1Score) {
        if (!t2IsPlaceholder) running[t2].w++
        if (!t1IsPlaceholder) running[t1].l++
      } else {
        if (!t1IsPlaceholder) running[t1].t++
        if (!t2IsPlaceholder) running[t2].t++
      }
      if (!t1IsPlaceholder) {
        result[t1] = result[t1] || {}
        result[t1][wk] = { ...running[t1] }
      }
      if (!t2IsPlaceholder) {
        result[t2] = result[t2] || {}
        result[t2][wk] = { ...running[t2] }
      }
    }
    return result
  }, [allGames, displayYear, teams])

  const weeksWithData = Array.from(gamesByWeek.keys()).sort((a, b) => a - b)
  const gamesThisWeek = gamesByWeek.get(displayWeek) || []
  const playedThisWeek = gamesThisWeek.filter(g => typeof g.team1Score === 'number' && typeof g.team2Score === 'number')

  // Conference list for the filter dropdown. Prefer the dynasty's custom
  // conferences for this year (handles realignment, custom names, etc.);
  // fall back to the static FBS defaults so the dropdown still has options
  // before any custom alignment is saved.
  const conferenceList = useMemo(() => {
    const customConfs = getCustomConferencesForYear(currentDynasty, displayYear)
    const source = customConfs && Object.keys(customConfs).length > 0
      ? customConfs
      : DEFAULT_CONFERENCES
    return Object.keys(source).sort((a, b) => a.localeCompare(b))
  }, [currentDynasty, displayYear])

  // Apply ESPN-style filter (all / top25 / conference) to this week's games.
  const filteredGames = useMemo(() => {
    if (filter === 'all') return playedThisWeek
    const customConfs = getCustomConferencesForYear(currentDynasty, displayYear)
    if (filter === 'top25') {
      return playedThisWeek.filter(g => {
        const isRanked = (r) => Number.isFinite(r) && r >= 1 && r <= 25
        // First try the rank stored directly on the game object (set via GameEdit).
        // Fall back to the rankByWeek store (set via Weekly Scores entry) — this
        // covers games entered before rank-saving was added to GameEdit, or games
        // where the user entered ranks via the weekly scores sheet instead.
        const r1 = (() => {
          const direct = parseInt(g.team1Rank, 10)
          if (isRanked(direct)) return direct
          return getTeamRankForWeek(currentDynasty, g.team1Tid, displayYear, displayWeek)
        })()
        const r2 = (() => {
          const direct = parseInt(g.team2Rank, 10)
          if (isRanked(direct)) return direct
          return getTeamRankForWeek(currentDynasty, g.team2Tid, displayYear, displayWeek)
        })()
        return isRanked(r1) || isRanked(r2)
      })
    }
    if (filter === 'rivalries') {
      // Games whose two teams contest a rivalry trophy (same detection the
      // game header uses to badge a rivalry).
      return playedThisWeek.filter(g => !!getRivalryTrophyForTeams(currentDynasty, g.team1Tid, g.team2Tid))
    }
    // Conference filter: include games where AT LEAST one team is in the
    // selected conference (matches ESPN's behavior — conf games + non-conf
    // games involving a team from that conference).
    return playedThisWeek.filter(g => {
      const t1Conf = getTeamConference(g.team1Tid, customConfs, teams)
      const t2Conf = getTeamConference(g.team2Tid, customConfs, teams)
      return t1Conf === filter || t2Conf === filter
    })
  }, [playedThisWeek, filter, currentDynasty, displayYear, teams])

  // Sort: ranked games first, then alphabetical by team1 name
  const sortedGames = [...filteredGames].sort((a, b) => {
    const nameA = teams[a.team1Tid]?.name || ''
    const nameB = teams[b.team1Tid]?.name || ''
    return nameA.localeCompare(nameB)
  })

  // Scroll the targeted game card into view and flash a brief glow.
  // The grid uses .stagger-reveal which sets every child to opacity:0
  // and fades them in with a per-index delay (up to 500ms+). Without
  // intervention, scrolling at t=60ms lands the user on a card that
  // hasn't been revealed yet — visually it looks like the page jumps
  // to an empty spot for ~1s before the card materialises.
  // Fix: stamp the target card with a class that overrides the
  // stagger-reveal opacity so it's visible immediately, then scroll.
  // Half-second glow is enough to draw the eye without lingering.
  useEffect(() => {
    if (!scrollGameId) return
    if (scrollHandledRef.current === scrollGameId) return
    // Two RAFs ensures the grid has actually laid out the rows so
    // getBoundingClientRect / scrollIntoView land on the right offset.
    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const el = document.getElementById(`weekly-game-${scrollGameId}`)
        if (!el) return
        el.classList.add('weekly-game-target')
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        el.classList.add('weekly-game-flash')
        setTimeout(() => el.classList.remove('weekly-game-flash'), 700)
        scrollHandledRef.current = scrollGameId
      })
    })
    return () => cancelAnimationFrame(raf)
  }, [scrollGameId, sortedGames.length])

  const filterLabel = filter === 'all'
    ? 'All FBS'
    : filter === 'top25'
      ? 'Top 25'
      : filter === 'rivalries'
        ? 'Rivalries'
        : filter

  return (
    <div className="space-y-6 page-enter">
      {/* Hero — CFB 27 broadcast panel. NEUTRAL (no team color): this is a
          league-wide page, not about the user's team. */}
      {(() => {
        const btnStyle = {
          backgroundColor: 'var(--surface-3)',
          borderColor: 'var(--surface-4)',
          color: 'var(--text-secondary)',
          letterSpacing: '1.4px',
        }
        return (
        <div
          className="card overflow-hidden relative reveal"
          style={{
            backgroundImage: 'linear-gradient(120deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0) 42%), linear-gradient(180deg, rgba(255,255,255,0.03) 0%, transparent 32%, rgba(0,0,0,0.25) 100%)',
          }}
        >
          <div className="relative p-4 sm:p-5 pb-2 sm:pb-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <h1
              className="group font-display font-extrabold uppercase tracking-tight leading-none m-0 break-words inline-flex items-baseline flex-wrap gap-x-3 text-txt-primary"
              style={{ fontSize: 'clamp(1.6rem, 3.4vw, 2.6rem)' }}
            >
              <InlineYearSelect
                value={displayYear}
                years={availableYears}
                onChange={handleYearChange}
                ariaLabel="Select year"
              />
              {displayWeek >= 0 && displayWeek < 16 && <span>Week</span>}
              <InlineYearSelect
                value={displayWeek}
                years={ALL_WEEKS}
                labels={WEEK_LABELS}
                onChange={handleWeekChange}
                ariaLabel="Select week"
              />
              <span>Recap</span>
            </h1>
            <div className="flex items-center gap-2 flex-wrap flex-shrink-0">
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="text-sm px-2 py-2 rounded border focus:outline-none transition-colors cursor-pointer text-txt-primary"
                style={{ minWidth: '9rem', backgroundColor: 'var(--surface-3)', borderColor: 'var(--surface-4)' }}
                aria-label="Filter games"
              >
                <option value="all">All FBS</option>
                <option value="top25">Top 25</option>
                <option value="rivalries">Rivalries</option>
                <optgroup label="Conferences">
                  {conferenceList.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </optgroup>
              </select>
              {!isViewOnly && (
                <>
                  {displayWeek <= 15 && (
                    <button type="button" onClick={() => setEditing(true)} className="px-2.5 py-1.5 text-[11px] font-semibold uppercase rounded border transition-colors flex-shrink-0 hover:bg-surface-4" style={btnStyle} title={`Edit ${weekLabelFor(displayWeek)} scores`}>
                      Edit Scores
                    </button>
                  )}
                  {displayWeek === 16 && (
                    <button type="button" onClick={() => setCcModalOpen(true)} className="px-2.5 py-1.5 text-[11px] font-semibold uppercase rounded border transition-colors flex-shrink-0 hover:bg-surface-4" style={btnStyle} title="Enter Conference Championship scores">
                      Enter Scores
                    </button>
                  )}
                  {displayWeek === 17 && (
                    <button type="button" onClick={() => setBowlWeek1Open(true)} className="px-2.5 py-1.5 text-[11px] font-semibold uppercase rounded border transition-colors flex-shrink-0 hover:bg-surface-4" style={btnStyle} title="Enter Bowl Week 1 scores">
                      Enter Scores
                    </button>
                  )}
                  {displayWeek === 18 && (
                    <button type="button" onClick={() => setBowlWeek2Open(true)} className="px-2.5 py-1.5 text-[11px] font-semibold uppercase rounded border transition-colors flex-shrink-0 hover:bg-surface-4" style={btnStyle} title="Enter Bowl Week 2 scores">
                      Enter Scores
                    </button>
                  )}
                  <button type="button" onClick={() => setRecapModalOpen(true)} className="px-2.5 py-1.5 text-[11px] font-semibold uppercase rounded border transition-colors flex-shrink-0 hover:bg-surface-4" style={btnStyle} title={`Edit ${weekLabelFor(displayWeek)} recap`}>
                    Edit Recap
                  </button>
                  {displayWeek !== -1 && (
                    <button type="button" onClick={() => setSocialModalOpen(true)} className="px-2.5 py-1.5 text-[11px] font-semibold uppercase rounded border transition-colors flex-shrink-0 hover:bg-surface-4" style={btnStyle} title="Generate and edit social posts">
                      Edit Social
                    </button>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Tab nav docked to the bottom edge of the hero panel — Scores /
              Recap — so it reads as part of the header, like the team and
              player pages. Neutral (light) accent; this is a league-wide page. */}
          <div className="relative mt-1 border-t" style={{ borderColor: 'rgba(255,255,255,0.14)' }}>
            <div className="flex overflow-x-auto no-scrollbar px-4 sm:px-5">
              {[
                ...(displayWeek !== -1 ? [{ key: 'scores', label: 'Scores' }] : []),
                { key: 'recap', label: displayWeek === -1 ? 'Preseason Recap' : 'Recap' },
                ...(displayWeek !== -1 ? [{ key: 'social', label: 'Social' }] : []),
              ].map(tab => {
                const isActive = tabParam === tab.key
                return (
                  <button
                    key={tab.key}
                    onClick={() => setTab(tab.key)}
                    className="relative flex-shrink-0 px-3 sm:px-4 lg:px-5 py-3 font-bold uppercase whitespace-nowrap transition-opacity hover:opacity-100"
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontSize: '0.85rem',
                      letterSpacing: '0.06em',
                      color: 'var(--text-primary)',
                      opacity: isActive ? 1 : 0.5,
                    }}
                  >
                    {tab.label}
                    {isActive && (
                      <span
                        aria-hidden="true"
                        className="absolute left-2 right-2 bottom-0 h-[3px] rounded-t-sm"
                        style={{ backgroundColor: 'var(--text-primary)' }}
                      />
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
        )
      })()}


      {/* Tab bar — Scores / Recap, shared sliding-underline bar. Neutral
          accent (light), since this page is not about the user's team. */}
      <TabBar
        tabs={[
          ...(displayWeek !== -1 ? [{ key: 'scores', label: 'Scores' }] : []),
          { key: 'recap', label: displayWeek === -1 ? 'Preseason Recap' : 'Recap' },
...(isPreseasonWeek ? [{ key: 'battles', label: 'Position Battles' }] : []),
        ]}
        activeKey={tabParam}
        onSelect={setTab}
        accentColor="#e2e8f0"
      />


      {/* Tab content — keyed so it fades up on each switch */}
      <div key={tabParam} className="reveal">

      {tabParam === 'scores' && (
        sortedGames.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-2 stagger-reveal">
            {sortedGames.map(game => (
              <GameCard
                key={game.id}
                domId={`weekly-game-${game.id}`}
                game={game}
                teams={teams}
                pathPrefix={pathPrefix}
                recordsByTid={recordsByTidByWeek}
                compact
              />
            ))}
          </div>
        ) : playedThisWeek.length > 0 ? (
          <Card>
            <EmptyState
              title={`No ${filterLabel} games in ${weekLabelFor(displayWeek)}`}
              message={
                filter === 'top25'
                  ? `No ranked teams played in ${weekLabelFor(displayWeek)}, ${displayYear}.`
                  : filter === 'rivalries'
                    ? `No rivalry games were played in ${weekLabelFor(displayWeek)}, ${displayYear}.`
                    : `No games involving ${filterLabel} were played in ${weekLabelFor(displayWeek)}, ${displayYear}.`
              }
            />
          </Card>
        ) : (
          <Card>
            <EmptyState
              title={`No scores entered for ${weekLabelFor(displayWeek)}`}
              message={
                isViewOnly
                  ? `The dynasty owner hasn't entered ${weekLabelFor(displayWeek)} scores for ${displayYear} yet.`
                  : displayWeek <= 15
                    ? `Click "Edit Scores" to enter results from across the country.`
                    : `Click "Enter Scores" to add ${weekLabelFor(displayWeek)} results.`
              }
            />
          </Card>
        )
      )}

{tabParam === 'battles' && isPreseasonWeek && (
        <PositionBattles year={displayYear} week={displayWeek} />
      )}

      {tabParam === 'recap' && (() => {
        const recap = currentDynasty.weekRecapsByYear?.[displayYear]?.[displayWeek]
        const recapText = recap?.text
        if (recapText) {
          return (
            <Card padding="lg">
              <FormattedRecap text={recapText} playerLinks={recapLinks} />
            </Card>
          )
        }
        return (
          <Card>
            <EmptyState
              title={displayWeek === -1 ? `No preseason recap for ${displayYear} yet` : `No recap for Week ${displayWeek} yet`}
              message={
                isViewOnly
                  ? 'Read-only. The dynasty owner can generate one.'
                  : 'Generates a prompt bundling every season fact we have for the AI to turn into a narrative recap.'
              }
              action={!isViewOnly && (
                <button
                  type="button"
                  onClick={() => setRecapModalOpen(true)}
                  className="px-4 py-2 text-sm font-semibold rounded-lg transition-colors hover:opacity-90"
                  style={{ backgroundColor: 'var(--text-primary)', color: 'var(--surface-1)' }}
                >
                  Generate recap
                </button>
              )}
            />
          </Card>
        )
      })()}

      {tabParam === 'social' && (() => {
        const platform = { ...DEFAULT_SOCIAL_PLATFORM, ...(currentDynasty.socialPlatform || {}) }
        const weekPosts = currentDynasty.socialFeedByYear?.[displayYear]?.[displayWeek] || []
        const charactersById = getEffectiveCharacters(currentDynasty)
        const gamesById = {}
        for (const g of (currentDynasty.games || [])) { if (g?.id) gamesById[g.id] = g }
        return (
          <div className="max-w-2xl mx-auto">
            <SocialFeed posts={weekPosts} charactersById={charactersById} platform={platform} gamesById={gamesById} teams={teams} dynasty={currentDynasty} year={displayYear} />
          </div>
        )
      })()}
      </div>

      {editing && (
        <WeeklyScoresModal
          isOpen={editing}
          onClose={() => setEditing(false)}
          year={displayYear}
          week={displayWeek}
          teamColors={teamColors}
        />
      )}

      {ccModalOpen && (
        <ConferenceChampionshipModal
          isOpen={ccModalOpen}
          onClose={() => setCcModalOpen(false)}
          onSave={handleCCModalSave}
          currentYear={displayYear}
          teamColors={teamColors}
        />
      )}

      {bowlWeek1Open && (
        <BowlWeek1Modal
          isOpen={bowlWeek1Open}
          onClose={() => setBowlWeek1Open(false)}
          onSave={handleBowlWeek1Save}
          currentYear={displayYear}
          teamColors={teamColors}
        />
      )}

      {bowlWeek2Open && (
        <BowlWeek2Modal
          isOpen={bowlWeek2Open}
          onClose={() => setBowlWeek2Open(false)}
          onSave={handleBowlWeek2Save}
          currentYear={displayYear}
          teamColors={teamColors}
        />
      )}

      {recapModalOpen && (
        <WeekRecapModal
          isOpen={recapModalOpen}
          onClose={() => setRecapModalOpen(false)}
          year={displayYear}
          week={displayWeek}
        />
      )}

      {socialModalOpen && (
        <GenerateSocialModal
          isOpen={socialModalOpen}
          onClose={() => setSocialModalOpen(false)}
          year={displayYear}
          week={displayWeek}
        />
      )}

      <style>{`
        .game-card {
          transition: background-color 200ms ease, border-color 200ms ease, transform 200ms ease, box-shadow 200ms ease;
        }
        .game-card:hover {
          background-color: var(--surface-3);
          transform: translateY(-1px);
          border-color: color-mix(in srgb, var(--surface-5) 60%, transparent);
        }
        .game-card:active {
          transform: translateY(0);
        }
        /* When the user clicks the title text on a Game page and lands
           here via ?game=…, the targeted card opts out of the stagger
           reveal so it's visible the moment we scroll to it (otherwise
           the user lands on an opacity:0 spot for ~1s). */
        .game-card.weekly-game-target {
          opacity: 1 !important;
          animation: none !important;
        }
        /* Soft half-second glow to draw the eye to the targeted card. */
        .game-card.weekly-game-flash {
          animation: weekly-game-flash-anim 700ms ease-out !important;
        }
        @keyframes weekly-game-flash-anim {
          0%   { box-shadow: 0 0 0 0 color-mix(in srgb, var(--text-secondary) 50%, transparent); }
          40%  { box-shadow: 0 0 0 5px color-mix(in srgb, var(--text-secondary) 30%, transparent); }
          100% { box-shadow: 0 0 0 0 rgba(0,0,0,0); }
        }
      `}</style>
    </div>
  )
}
