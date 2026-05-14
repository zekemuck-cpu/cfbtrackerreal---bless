import { useState, useMemo, useEffect, useRef } from 'react'
import { Link, useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useDynasty, GAME_TYPES, getCustomConferencesForYear } from '../../context/DynastyContext'
import { usePathPrefix } from '../../hooks/usePathPrefix'
import { TEAMS, getCurrentTeamTid, isFCSPlaceholderAbbr } from '../../data/teamRegistry'
import { getMascotName as getMascotNameFromTeams, stripMascotFromName } from '../../data/teams'
import { conferenceTeams as DEFAULT_CONFERENCES, getTeamConference } from '../../data/conferenceTeams'
import { PageHero, Card, EmptyState, TeamLogo } from '../../components/ui'
import InlineYearSelect from '../../components/ui/InlineYearSelect'
import WeeklyScoresModal from '../../components/WeeklyScoresModal'
import WeekRecapModal from '../../components/WeekRecapModal'
import FormattedRecap from '../../components/FormattedRecap'
import buildRecapLinks from '../../utils/buildRecapLinks'
import { useTeamColors } from '../../hooks/useTeamColors'

const REGULAR_SEASON_WEEKS = Array.from({ length: 15 }, (_, i) => i)  // 0-14 (Week 14 is the last regular-season week; CCG / bowls are separate phases)

// Delegate to the shared mascot-strip helper so this page stays in
// sync with the canonical list (FCS placeholders + 2/3-word mascots).
const getSchoolName = (m) => stripMascotFromName(m) || ''

function formatRecord(rec) {
  if (!rec) return null
  const { w = 0, l = 0, t = 0 } = rec
  return t > 0 ? `${w}-${l}-${t}` : `${w}-${l}`
}

function GameCard({ game, teams, pathPrefix, recordsByTid, domId }) {
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
  // Stored game.team1Rank / team2Rank IS the entering rank (rank
  // during the game) post-migration. Just read it directly.
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

  const TeamRow = ({ tid, team, score, won, lost, record, rank }) => {
    const mascot = getMascotNameFromTeams(tid, teams) || team?.name || ''
    const school = getSchoolName(mascot) || team?.abbr || `TID ${tid}`
    return (
      <div className="flex items-center gap-2.5 pl-2 pr-4 py-2.5">
        {/* ESPN-style winner indicator: small filled triangle pointing at the row */}
        <span
          aria-hidden="true"
          className="flex-shrink-0 transition-opacity"
          style={{
            width: 0,
            height: 0,
            borderTop: '4px solid transparent',
            borderBottom: '4px solid transparent',
            borderLeft: '5px solid var(--text-primary)',
            opacity: won ? 1 : 0,
          }}
        />
        <TeamLogo tid={tid} teams={teams} size="sm" className="flex-shrink-0" />
        <div className="flex-1 min-w-0 flex items-baseline gap-2">
          {rank != null && (
            <span
              className="tabular-nums flex-shrink-0"
              style={{ fontSize: '11px', color: 'var(--text-tertiary)', fontWeight: 700 }}
            >
              {rank}
            </span>
          )}
          <Link
            to={`${pathPrefix}/team/${tid}/${game.year}`}
            onClick={(e) => e.stopPropagation()}
            className="text-[15px] truncate hover:underline transition-colors"
            style={{
              fontWeight: won ? 700 : 600,
              color: lost ? 'var(--text-tertiary)' : 'var(--text-primary)',
            }}
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
          className="font-display tabular-nums leading-none flex-shrink-0"
          style={{
            fontSize: '22px',
            fontWeight: won ? 800 : 600,
            color: lost ? 'var(--text-tertiary)' : 'var(--text-primary)',
            minWidth: '2.25rem',
            textAlign: 'right',
            letterSpacing: '-0.02em',
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
      className="game-card relative rounded-md overflow-hidden bg-surface-2 transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-surface-5"
      style={{ border: '1px solid var(--surface-4)' }}
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
          <span
            style={{
              fontSize: '10px',
              fontWeight: 700,
              color: 'var(--text-secondary)',
              letterSpacing: '1.6px',
              textTransform: 'uppercase',
            }}
          >
            {statusLabel || ''}
          </span>
          {isNeutral && (
            <span
              style={{
                fontSize: '10px',
                fontWeight: 600,
                color: 'var(--text-tertiary)',
                letterSpacing: '1.4px',
                textTransform: 'uppercase',
              }}
            >
              Neutral
            </span>
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
      <div style={{ borderTop: '1px solid var(--surface-3)' }}>
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
  const { currentDynasty, isViewOnly } = useDynasty()
  const pathPrefix = usePathPrefix()
  const [editing, setEditing] = useState(false)
  // Recap modal opens locally on this page too — no need to round-trip to
  // the dashboard. Same component handles preseason + in-season.
  const [recapModalOpen, setRecapModalOpen] = useState(false)

  // Tab state lives in the URL (?tab=scores|recap) so deep-links from the
  // dashboard's recap to-do land directly on the recap view, and so the
  // user's choice survives navigating into a game and back.
  const tabParam = searchParams.get('tab') === 'recap' ? 'recap' : 'scores'
  const setTab = (next) => {
    setSearchParams(prev => {
      const params = new URLSearchParams(prev)
      if (next === 'scores') params.delete('tab')
      else params.set('tab', next)
      return params
    }, { replace: true })
  }

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

  const displayYear = urlYear ? parseInt(urlYear, 10) : currentYear
  const displayWeek = urlWeek != null ? parseInt(urlWeek, 10) : Math.max(0, (currentDynasty.currentPhase === 'regular_season' ? Number(currentDynasty.currentWeek) - 1 : 15))
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
      const wk = Number(g.week)
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
            <span>Recap</span>
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
              <>
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="px-2.5 py-1.5 text-[11px] font-semibold uppercase rounded border transition-colors flex-shrink-0"
                  style={{
                    backgroundColor: 'var(--surface-3)',
                    borderColor: 'var(--surface-4)',
                    color: 'var(--text-secondary)',
                    letterSpacing: '1.4px',
                  }}
                  title={`Edit Week ${displayWeek} scores`}
                >
                  Edit Scores
                </button>
                <button
                  type="button"
                  onClick={() => setRecapModalOpen(true)}
                  className="px-2.5 py-1.5 text-[11px] font-semibold uppercase rounded border transition-colors flex-shrink-0"
                  style={{
                    backgroundColor: 'var(--surface-3)',
                    borderColor: 'var(--surface-4)',
                    color: 'var(--text-secondary)',
                    letterSpacing: '1.4px',
                  }}
                  title={`Edit Week ${displayWeek} recap`}
                >
                  Edit Recap
                </button>
              </>
            )}
          </div>
        }
      />

      {/* Tab bar — Scores / Recap. The Recap tab houses the AI-narrated
          week-in-review (preseason variant at week 0). */}
      {(() => {
        const Tab = ({ value, label }) => {
          const active = tabParam === value
          return (
            <button
              type="button"
              onClick={() => setTab(value)}
              className="px-4 py-2 -mb-px font-display font-semibold text-sm uppercase tracking-wider transition-colors"
              style={{
                letterSpacing: '1.5px',
                color: active ? 'var(--text-primary)' : 'var(--text-tertiary)',
                borderBottom: active ? `2px solid var(--text-primary)` : '2px solid transparent',
              }}
              aria-pressed={active}
            >
              {label}
            </button>
          )
        }
        return (
          <div className="flex gap-1 border-b border-surface-4 -mt-2">
            <Tab value="scores" label="Scores" />
            <Tab value="recap" label={displayWeek === 0 ? 'Preseason Recap' : 'Recap'} />
          </div>
        )
      })()}

      {tabParam === 'scores' && (
        sortedGames.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 stagger-reveal">
            {sortedGames.map(game => (
              <GameCard
                key={game.id}
                domId={`weekly-game-${game.id}`}
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
        )
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
              title={displayWeek === 0 ? `No preseason recap for ${displayYear} yet` : `No recap for Week ${displayWeek} yet`}
              message={
                isViewOnly
                  ? 'Read-only — the dynasty owner can generate one.'
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

      {editing && (
        <WeeklyScoresModal
          isOpen={editing}
          onClose={() => setEditing(false)}
          year={displayYear}
          week={displayWeek}
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
