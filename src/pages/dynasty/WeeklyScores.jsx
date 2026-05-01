import { useState, useMemo } from 'react'
import { Link, useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useDynasty, GAME_TYPES, getCustomConferencesForYear } from '../../context/DynastyContext'
import { usePathPrefix } from '../../hooks/usePathPrefix'
import { TEAMS, getCurrentTeamTid } from '../../data/teamRegistry'
import { getMascotName as getMascotNameFromTeams } from '../../data/teams'
import { conferenceTeams as DEFAULT_CONFERENCES, getTeamConference } from '../../data/conferenceTeams'
import { PageHero, Card, EmptyState, TeamLogo } from '../../components/ui'
import InlineYearSelect from '../../components/ui/InlineYearSelect'
import WeeklyScoresModal from '../../components/WeeklyScoresModal'
import { useTeamColors } from '../../hooks/useTeamColors'

const REGULAR_SEASON_WEEKS = Array.from({ length: 16 }, (_, i) => i)  // 0-15

function getSchoolName(mascotName) {
  if (!mascotName) return ''
  // FCS placeholders use "FCS <Direction>" — the directional word is part of
  // the school name, not a mascot. Return as-is so we don't render plain "FCS".
  if (/^FCS\s+/i.test(mascotName)) return mascotName
  const specialMascots = [
    'Crimson Tide', 'Blue Hens', "Fightin' Blue Hens", 'Golden Flashes', 'Mean Green',
    "Ragin' Cajuns", 'Thundering Herd', 'Golden Hurricane', 'Fighting Irish',
    'Demon Deacons', 'Yellow Jackets', 'Horned Frogs', 'Scarlet Knights',
    'Blue Raiders', 'Red Raiders', 'Golden Bears', 'Nittany Lions', 'Green Wave',
    'Sun Devils', 'Wolf Pack', 'Black Knights', 'Tar Heels', 'Red Storm'
  ]
  for (const mascot of specialMascots) {
    if (mascotName.endsWith(mascot)) return mascotName.slice(0, -mascot.length).trim()
  }
  const parts = mascotName.split(' ')
  return parts.length > 1 ? parts.slice(0, -1).join(' ') : mascotName
}

function formatRecord(rec) {
  if (!rec) return null
  const { w = 0, l = 0, t = 0 } = rec
  return t > 0 ? `${w}-${l}-${t}` : `${w}-${l}`
}

function GameCard({ game, teams, pathPrefix, recordsByTid }) {
  const navigate = useNavigate()
  const t1 = Number(game.team1Tid)
  const t2 = Number(game.team2Tid)
  const team1Score = typeof game.team1Score === 'number' ? game.team1Score : null
  const team2Score = typeof game.team2Score === 'number' ? game.team2Score : null
  const isPlayed = team1Score !== null && team2Score !== null
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
  const rankFor = (tid) => {
    const raw = tid === t1 ? game.team1Rank : game.team2Rank
    if (raw == null || raw === '') return null
    const n = parseInt(raw, 10)
    return Number.isFinite(n) && n >= 1 && n <= 25 ? n : null
  }

  const topScore = scoreFor(topTid)
  const bottomScore = scoreFor(bottomTid)
  const topWon = isPlayed && !isTie && topScore > bottomScore
  const bottomWon = isPlayed && !isTie && bottomScore > topScore
  const topTeam = teams[topTid] || TEAMS[topTid] || null
  const bottomTeam = teams[bottomTid] || TEAMS[bottomTid] || null
  const winnerColor = topWon ? topTeam?.primaryColor : bottomWon ? bottomTeam?.primaryColor : null

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

  const statusLabel = !isPlayed
    ? 'Not yet played'
    : isTie
      ? 'Tie'
      : isNeutral
        ? 'Neutral site'
        : null

  const TeamRow = ({ tid, team, score, won, lost, record, rank }) => {
    const mascot = getMascotNameFromTeams(tid, teams) || team?.name || ''
    const school = getSchoolName(mascot) || team?.abbr || `TID ${tid}`
    return (
      <div className="flex items-center gap-3 px-4 py-3">
        <TeamLogo tid={tid} teams={teams} size="sm" className="flex-shrink-0" />
        <div className="flex-1 min-w-0 flex items-baseline gap-2">
          {rank != null && (
            <span
              className="tabular-nums flex-shrink-0"
              style={{ fontSize: '11px', color: 'var(--text-tertiary)', fontWeight: 600 }}
            >
              #{rank}
            </span>
          )}
          <Link
            to={`${pathPrefix}/team/${tid}/${game.year}`}
            onClick={(e) => e.stopPropagation()}
            className={`text-[15px] truncate hover:underline transition-colors ${
              won ? 'font-bold' : 'font-semibold'
            } ${won ? 'text-txt-primary' : lost ? 'text-txt-tertiary' : 'text-txt-secondary'}`}
            style={won ? { color: '#fafafa' } : undefined}
          >
            {school}
          </Link>
          {record && (
            <span
              className="tabular-nums flex-shrink-0"
              style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}
            >
              {record}
            </span>
          )}
        </div>
        <span
          className={`font-display tabular-nums leading-none flex-shrink-0 ${
            won ? 'font-black' : 'font-bold'
          }`}
          style={{
            fontSize: '22px',
            color: won ? '#fafafa' : lost ? 'var(--text-tertiary)' : 'var(--text-secondary)',
            minWidth: '2.5rem',
            textAlign: 'right',
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
      onClick={handleCardClick}
      onKeyDown={handleCardKey}
      className="game-card relative rounded-xl overflow-hidden bg-surface-2 transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-surface-5"
      style={{ border: '1px solid var(--rule-soft, var(--surface-4))' }}
    >
      {winnerColor && (
        <span
          aria-hidden="true"
          className="absolute left-0 top-0 bottom-0 w-[3px]"
          style={{ backgroundColor: winnerColor }}
        />
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
      <div style={{ borderTop: '1px solid var(--surface-4)' }}>
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
      {statusLabel && (
        <div
          className="px-4 py-1.5 text-[10px] uppercase text-txt-tertiary"
          style={{
            borderTop: '1px solid var(--surface-4)',
            backgroundColor: 'var(--surface-1)',
            letterSpacing: '1.5px',
          }}
        >
          {statusLabel}
        </div>
      )}
    </div>
  )
}

export default function WeeklyScores() {
  const { year: urlYear, week: urlWeek } = useParams()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { currentDynasty, isViewOnly } = useDynasty()
  const pathPrefix = usePathPrefix()
  const [editing, setEditing] = useState(false)

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

  const displayYear = urlYear ? parseInt(urlYear, 10) : currentYear
  const displayWeek = urlWeek != null ? parseInt(urlWeek, 10) : Math.max(0, (currentDynasty.currentPhase === 'regular_season' ? Number(currentDynasty.currentWeek) - 1 : 15))

  const handleYearChange = (y) => navigate(`${pathPrefix}/weekly-scores/${y}/${displayWeek}`)
  const handleWeekChange = (w) => navigate(`${pathPrefix}/weekly-scores/${displayYear}/${w}`)

  // All regular-season + conf-championship games for the selected year, grouped by week
  const gamesByWeek = useMemo(() => {
    const map = new Map()
    for (const g of allGames) {
      if (!g) continue
      if (Number(g.year) !== displayYear) continue
      if (g.gameType !== GAME_TYPES.REGULAR && g.gameType !== GAME_TYPES.CONFERENCE_CHAMPIONSHIP) continue
      if (!g.team1Tid || !g.team2Tid) continue
      const wk = Number(g.week)
      if (!Number.isFinite(wk)) continue
      if (!map.has(wk)) map.set(wk, [])
      map.get(wk).push(g)
    }
    return map
  }, [allGames, displayYear])

  // Cumulative team records keyed by tid → week → { w, l, t } (record after that week's game)
  const recordsByTidByWeek = useMemo(() => {
    const yearGames = allGames.filter(g => (
      g && Number(g.year) === displayYear &&
      (g.gameType === GAME_TYPES.REGULAR || g.gameType === GAME_TYPES.CONFERENCE_CHAMPIONSHIP) &&
      g.team1Tid && g.team2Tid &&
      typeof g.team1Score === 'number' && typeof g.team2Score === 'number'
    )).sort((a, b) => Number(a.week) - Number(b.week))

    const running = {}
    const result = {}
    for (const g of yearGames) {
      const t1 = Number(g.team1Tid)
      const t2 = Number(g.team2Tid)
      const wk = Number(g.week)
      running[t1] = running[t1] || { w: 0, l: 0, t: 0 }
      running[t2] = running[t2] || { w: 0, l: 0, t: 0 }
      if (g.team1Score > g.team2Score) {
        running[t1].w++; running[t2].l++
      } else if (g.team2Score > g.team1Score) {
        running[t2].w++; running[t1].l++
      } else {
        running[t1].t++; running[t2].t++
      }
      result[t1] = result[t1] || {}
      result[t2] = result[t2] || {}
      result[t1][wk] = { ...running[t1] }
      result[t2][wk] = { ...running[t2] }
    }
    return result
  }, [allGames, displayYear])

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
        const r1 = parseInt(g.team1Rank, 10)
        const r2 = parseInt(g.team2Rank, 10)
        const isRanked = (r) => Number.isFinite(r) && r >= 1 && r <= 25
        return isRanked(r1) || isRanked(r2)
      })
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

  const filterLabel = filter === 'all'
    ? 'All FBS'
    : filter === 'top25'
      ? 'Top 25'
      : filter

  return (
    <div className="space-y-6 page-enter">
      <PageHero
        title={
          <h1 className="group display-lg text-txt-primary leading-none m-0 break-words inline-flex items-baseline flex-wrap gap-x-3">
            <InlineYearSelect
              value={displayYear}
              years={availableYears}
              onChange={handleYearChange}
              ariaLabel="Select year"
            />
            <span>Week</span>
            <InlineYearSelect
              value={displayWeek}
              years={REGULAR_SEASON_WEEKS}
              onChange={handleWeekChange}
              ariaLabel="Select week"
            />
            <span>Scores</span>
          </h1>
        }
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="bg-surface-3 text-txt-primary text-sm px-2 py-2 rounded border border-surface-4 hover:border-surface-5 focus:outline-none focus:border-surface-5 transition-colors cursor-pointer"
              style={{ minWidth: '9rem' }}
              aria-label="Filter games"
            >
              <option value="all">All FBS</option>
              <option value="top25">Top 25</option>
              <optgroup label="Conferences">
                {conferenceList.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </optgroup>
            </select>
            {!isViewOnly && (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="px-3 py-2 text-xs font-semibold uppercase tracking-wider rounded transition-colors flex-shrink-0"
                style={{
                  backgroundColor: teamColors.primary,
                  color: '#fff',
                  letterSpacing: '1.5px',
                }}
                title={`Edit Week ${displayWeek} scores`}
              >
                Edit Week {displayWeek}
              </button>
            )}
          </div>
        }
      />

      {sortedGames.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 stagger-reveal">
          {sortedGames.map(game => (
            <GameCard
              key={game.id}
              game={game}
              teams={teams}
              pathPrefix={pathPrefix}
              recordsByTid={recordsByTidByWeek}
            />
          ))}
        </div>
      ) : playedThisWeek.length > 0 ? (
        <Card>
          <EmptyState
            title={`No ${filterLabel} games in Week ${displayWeek}`}
            message={
              filter === 'top25'
                ? `No ranked teams played in Week ${displayWeek}, ${displayYear}.`
                : `No games involving ${filterLabel} were played in Week ${displayWeek}, ${displayYear}.`
            }
          />
        </Card>
      ) : (
        <Card>
          <EmptyState
            title={`No scores entered for Week ${displayWeek}`}
            message={
              isViewOnly
                ? `The dynasty owner hasn't entered Week ${displayWeek} scores for ${displayYear} yet.`
                : `Click "Edit Week ${displayWeek}" to enter results from across the country.`
            }
          />
        </Card>
      )}

      {editing && (
        <WeeklyScoresModal
          isOpen={editing}
          onClose={() => setEditing(false)}
          year={displayYear}
          week={displayWeek}
          teamColors={teamColors}
        />
      )}

      <style>{`
        .game-card {
          transition: background-color 200ms ease, border-color 200ms ease, transform 200ms ease;
        }
        .game-card:hover {
          background-color: var(--surface-3);
          transform: translateY(-1px);
          border-color: color-mix(in srgb, var(--surface-5) 60%, transparent);
        }
        .game-card:active {
          transform: translateY(0);
        }
      `}</style>
    </div>
  )
}
