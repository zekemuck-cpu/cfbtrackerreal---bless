import { useState, useMemo } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { useDynasty, GAME_TYPES } from '../../context/DynastyContext'
import { usePathPrefix } from '../../hooks/usePathPrefix'
import { TEAMS, getCurrentTeamTid } from '../../data/teamRegistry'
import { getMascotName as getMascotNameFromTeams } from '../../data/teams'
import { PageHero, Card, EmptyState, TeamLogo } from '../../components/ui'
import InlineYearSelect from '../../components/ui/InlineYearSelect'
import WeeklyScoresModal from '../../components/WeeklyScoresModal'
import { useTeamColors } from '../../hooks/useTeamColors'

const REGULAR_SEASON_WEEKS = Array.from({ length: 16 }, (_, i) => i)  // 0-15

function getSchoolName(mascotName) {
  if (!mascotName) return ''
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
  const team1 = teams[game.team1Tid] || TEAMS[game.team1Tid] || null
  const team2 = teams[game.team2Tid] || TEAMS[game.team2Tid] || null
  const team1Score = typeof game.team1Score === 'number' ? game.team1Score : null
  const team2Score = typeof game.team2Score === 'number' ? game.team2Score : null
  const isPlayed = team1Score !== null && team2Score !== null
  const team1Won = isPlayed && team1Score > team2Score
  const team2Won = isPlayed && team2Score > team1Score
  const isTie = isPlayed && team1Score === team2Score
  const isNeutral = game.homeTeamTid == null
  const team1IsHome = !isNeutral && Number(game.homeTeamTid) === Number(game.team1Tid)
  const team2IsHome = !isNeutral && Number(game.homeTeamTid) === Number(game.team2Tid)

  const winnerColor = team1Won ? team1?.primaryColor : team2Won ? team2?.primaryColor : null

  const team1Record = formatRecord(recordsByTid?.[game.team1Tid]?.[Number(game.week)])
  const team2Record = formatRecord(recordsByTid?.[game.team2Tid]?.[Number(game.week)])
  const team1Rank = game.team1Rank ? parseInt(game.team1Rank, 10) : null
  const team2Rank = game.team2Rank ? parseInt(game.team2Rank, 10) : null

  const handleCardClick = () => navigate(`${pathPrefix}/game/${game.id}`)
  const handleCardKey = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      navigate(`${pathPrefix}/game/${game.id}`)
    }
  }

  const TeamRow = ({ team, tid, score, won, isHome, lost, record, rank }) => {
    const mascot = getMascotNameFromTeams(tid, teams) || team?.name || ''
    const school = getSchoolName(mascot) || team?.abbr || `TID ${tid}`
    return (
      <div className="flex items-center gap-2.5 sm:gap-3 px-3 sm:px-4 py-2.5">
        <TeamLogo tid={tid} teams={teams} size="sm" className="flex-shrink-0" />
        <div className="flex-1 min-w-0 flex items-baseline gap-1.5">
          {rank ? (
            <span
              className="tabular-nums font-semibold flex-shrink-0"
              style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}
            >
              #{rank}
            </span>
          ) : null}
          <Link
            to={`${pathPrefix}/team/${tid}/${game.year}`}
            onClick={(e) => e.stopPropagation()}
            className={`font-semibold text-sm truncate hover:underline ${won ? 'text-txt-primary' : lost ? 'text-txt-tertiary' : 'text-txt-secondary'}`}
            style={won ? { color: '#fafafa' } : undefined}
          >
            {school}
          </Link>
          {record && (
            <span
              className="tabular-nums flex-shrink-0"
              style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}
            >
              ({record})
            </span>
          )}
          {isHome && (
            <span className="label-xs text-txt-tertiary flex-shrink-0" style={{ fontSize: '9px', letterSpacing: '1px' }}>
              HOME
            </span>
          )}
        </div>
        <span
          className={`font-display tabular-nums text-base sm:text-lg flex-shrink-0 ${won ? 'font-black' : 'font-bold'}`}
          style={{
            color: won ? '#fafafa' : lost ? 'var(--text-tertiary)' : 'var(--text-secondary)',
            minWidth: '2.25rem',
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
      className="rounded-lg overflow-hidden bg-surface-2 transition-all hover:translate-y-[-1px] hover:bg-surface-3 cursor-pointer focus:outline-none focus:ring-2 focus:ring-surface-5"
      style={{ border: '1px solid var(--rule-soft, var(--surface-4))' }}
    >
      {winnerColor && (
        <div
          aria-hidden="true"
          className="h-[2px] w-full"
          style={{ backgroundColor: winnerColor }}
        />
      )}
      <TeamRow
        team={team1}
        tid={game.team1Tid}
        score={team1Score}
        won={team1Won}
        lost={team2Won}
        isHome={team1IsHome}
        record={team1Record}
        rank={team1Rank}
      />
      <div style={{ borderTop: '1px solid var(--surface-4)' }}>
        <TeamRow
          team={team2}
          tid={game.team2Tid}
          score={team2Score}
          won={team2Won}
          lost={team1Won}
          isHome={team2IsHome}
          record={team2Record}
          rank={team2Rank}
        />
      </div>
      {(isNeutral || isTie || !isPlayed) && (
        <div className="px-4 py-1.5 flex items-center gap-2 text-[10px] uppercase tracking-wider text-txt-tertiary" style={{ borderTop: '1px solid var(--surface-4)', backgroundColor: 'var(--surface-1)' }}>
          {isNeutral && <span style={{ letterSpacing: '1.5px' }}>Neutral Site</span>}
          {isTie && <span style={{ letterSpacing: '1.5px' }}>Tie</span>}
          {!isPlayed && <span style={{ letterSpacing: '1.5px' }}>Not yet played</span>}
        </div>
      )}
    </div>
  )
}

export default function WeeklyScores() {
  const { year: urlYear, week: urlWeek } = useParams()
  const navigate = useNavigate()
  const { currentDynasty, isViewOnly } = useDynasty()
  const pathPrefix = usePathPrefix()
  const [editing, setEditing] = useState(false)

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

  // Sort: ranked games first, then alphabetical by team1 name
  const sortedGames = [...playedThisWeek].sort((a, b) => {
    const nameA = teams[a.team1Tid]?.name || ''
    const nameB = teams[b.team1Tid]?.name || ''
    return nameA.localeCompare(nameB)
  })

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
          !isViewOnly && (
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
          )
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
    </div>
  )
}
