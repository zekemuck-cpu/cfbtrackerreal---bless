import { useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useDynasty } from '../../context/DynastyContext'
import { usePathPrefix } from '../../hooks/usePathPrefix'
import { getTeamLogoByTid, getMascotName, stripMascotFromName } from '../../data/teams'
import { getTeamColors } from '../../data/teamColors'
import { HonorPlayerTile } from '../../components/HonorsUI'
import { currentPollRank } from '../../utils/teamRanking'
import { PageHero, Card, EmptyState, TitleWithYear, Select } from '../../components/ui'

// Real (auto-synced) CFP games never carry a numeric `week` — buildPostseasonGames
// (cfb27SaveSync.js) stamps them 'Bowl'/'Bowl N' — only these 4 gameType values,
// in bracket-progression order. See findBoxScoreGameSummary's CFP branch below.
const CFP_ROUND_ORDER = ['cfp_first_round', 'cfp_quarterfinal', 'cfp_semifinal', 'cfp_championship']

// Finds this honoree's game result + box-score line for the given week —
// PlayerAward's own AwardScore field is always 0 in the save (see
// extractPlayers.cjs's buildPlayerAwards), so the real stat line has to come
// from that week's already-synced box score instead. Combines every category
// they show up in (a dual-threat QB's passing AND rushing lines together,
// matching the in-game card exactly) rather than stopping at the first
// match. Mirrors Heisman Watch's own findLastGameSummary (HeismanWatch.jsx)
// field-for-field/shape-for-shape so the two pages render the identical
// "Last Game vs X (W/L score-score): stats" line for the same game.
//
// `allWeeksForYear` is every week key playersOfWeekByYear[year] has an
// honoree for (any team) — needed only for the CFP disambiguation branch.
function findBoxScoreGameSummary(dynasty, honoree, week, year, allWeeksForYear) {
  if (!honoree?.tid) return { noGame: true }
  const teamsSource = dynasty.teams || {}
  const games = dynasty.games || []
  const yearNum = Number(year)
  const weekNum = Number(week)
  const forHonoreeTeam = (g) => Number(g.team1Tid) === honoree.tid || Number(g.team2Tid) === honoree.tid
  let game = games.find((g) => Number(g.year) === yearNum && Number(g.week) === weekNum && forHonoreeTeam(g))

  // Postseason games are frequently stored with a non-numeric `week`
  // ('CCG', 'Bowl', 'Bowl N') instead of the save's real week number this
  // honoree is keyed by (see weekLabel.js's isNumericWeek and
  // buildPostseasonGames in cfb27SaveSync.js) — the exact-week match above
  // then comes up empty even though this genuinely IS the right week. Fall
  // back to flags instead, cheapest/least-ambiguous case first.
  // Every fallback below is bounded to late-season weeks. The weeks here are
  // the save's RAW numbers, where the postseason never starts before 15
  // (regular season runs 0-14/15, CCG lands on 15 or 16, bowls 17+). Without
  // the bound, an early-season honoree whose team simply has no game record
  // for that week — a sync gap, not a postseason week — falls straight
  // through and gets shown their conference championship or bowl box score
  // as if it were September.
  const canBePostseason = Number.isFinite(weekNum) && weekNum >= 15
  if (!game && canBePostseason) {
    // Conference championship — a team plays at most one a year, so the
    // flag alone can't grab the wrong game.
    game = games.find((g) => Number(g.year) === yearNum && g.isConferenceChampionship && forHonoreeTeam(g))
  }
  if (!game && canBePostseason) {
    // Regular (non-playoff) bowl — same one-game-per-team-per-year
    // guarantee. Every regular bowl shares the literal week label 'Bowl'
    // with zero per-week distinction, so it doesn't matter which raw week
    // number this honoree's team was actually rewarded for — there's only
    // ever one candidate bowl game to find either way.
    game = games.find((g) => Number(g.year) === yearNum && g.isBowlGame && forHonoreeTeam(g))
  }
  if (!game && canBePostseason) {
    // CFP — a team CAN play up to 4 rounds, so the gameType flag alone is
    // ambiguous when more than one of this team's CFP games exists. Resolve
    // which round THIS week is: a bowl round and its parallel CFP round
    // always land on the same real calendar week (confirmed by
    // WeeklyScores.jsx's own week-bucket mapping — Bowl Week 1 IS CFP First
    // Round's week, Bowl Week 2 IS Quarterfinal's, etc.), so every distinct
    // week number across the WHOLE year's honoree data that ISN'T a plain
    // numeric-matched game sorts into exactly the bracket's real
    // chronological round order, first round first — regardless of which
    // specific teams are in it. This honoree already failed the bowl-flag
    // check above, so if it resolves here at all, it's a CFP team, and its
    // position in that sorted list IS its round.
    const cfpGamesForTeam = games.filter((g) =>
      Number(g.year) === yearNum && CFP_ROUND_ORDER.includes(g.gameType) && forHonoreeTeam(g))
    if (cfpGamesForTeam.length === 1) {
      game = cfpGamesForTeam[0]
    } else if (cfpGamesForTeam.length > 1) {
      const postseasonWeeks = [...new Set(allWeeksForYear || [])]
        .filter((w) => !games.some((g) => Number(g.year) === yearNum && Number(g.week) === Number(w)))
        .sort((a, b) => Number(a) - Number(b))
      const roundIdx = postseasonWeeks.indexOf(weekNum)
      const targetRound = roundIdx >= 0 ? CFP_ROUND_ORDER[Math.min(roundIdx, CFP_ROUND_ORDER.length - 1)] : null
      game = (targetRound && cfpGamesForTeam.find((g) => g.gameType === targetRound)) || cfpGamesForTeam[0]
    }
  }
  if (!game) return { noGame: true }

  const isTeam1 = Number(game.team1Tid) === honoree.tid
  const teamScore = isTeam1 ? game.team1Score : game.team2Score
  const oppScore = isTeam1 ? game.team2Score : game.team1Score
  const oppTid = isTeam1 ? game.team2Tid : game.team1Tid
  const won = teamScore > oppScore
  const oppMascot = getMascotName(oppTid, teamsSource)
  const oppName = stripMascotFromName(oppMascot) || oppMascot || teamsSource?.[oppTid]?.abbr || 'Opponent'

  const categories = game.boxScore?.byTid?.[honoree.tid]
  const target = (honoree.name || '').toLowerCase().trim()
  const findIn = (cat) => categories?.[cat]?.find((s) => (s.playerName || '').toLowerCase().trim() === target)
  const parts = []

  const passing = findIn('passing')
  if (passing) {
    const ypa = passing.attempts ? (passing.yards / passing.attempts).toFixed(1) : '0.0'
    parts.push(`${passing.comp}-${passing.attempts}`, `${passing.yards} PASS YDS`, `${ypa} YPA`, `${passing.tD} PASS TD`)
    if (passing.iNT) parts.push(`${passing.iNT} INT`)
  }
  const rushing = findIn('rushing')
  if (rushing) {
    parts.push(`${rushing.carries} CAR`, `${rushing.yards} RUSH YDS`)
    if (rushing.tD) parts.push(`${rushing.tD} RUSH TD`)
  }
  const receiving = findIn('receiving')
  if (receiving) {
    parts.push(`${receiving.receptions} REC`, `${receiving.yards} REC YDS`)
    if (receiving.tD) parts.push(`${receiving.tD} REC TD`)
  }
  const defense = findIn('defense')
  if (defense) {
    const tkl = (defense.solo || 0) + (defense.assists || 0)
    parts.push(`${tkl} TKL`)
    if (defense.iNT) parts.push(`${defense.iNT} INT`)
    if (defense.deflections) parts.push(`${defense.deflections} PBU`)
    if (defense.sack) parts.push(`${defense.sack} SACK`)
    if (defense.tD) parts.push(`${defense.tD} TD`)
  }
  const kicking = findIn('kicking')
  if (kicking) parts.push(`${kicking.fGM}/${kicking.fGA} FG`, `${kicking.xPM}/${kicking.xPA} XP`)
  const punting = findIn('punting')
  if (punting) parts.push(`${punting.punts} PUNTS`, `${punting.yards} YDS`)

  return { noGame: false, oppName, won, teamScore, oppScore, statLine: parts.length ? parts.join(', ') : null }
}

export default function PlayersOfWeek() {
  const { year: urlYear } = useParams()
  const navigate = useNavigate()
  const { currentDynasty } = useDynasty()
  const pathPrefix = usePathPrefix()
  const [scope, setScope] = useState('national')
  const [conference, setConference] = useState(null)

  if (!currentDynasty) return null

  const startYear = currentDynasty.startYear || currentDynasty.currentYear
  const availableYears = []
  for (let y = currentDynasty.currentYear; y >= startYear; y--) availableYears.push(y)
  const displayYear = urlYear ? parseInt(urlYear, 10) : currentDynasty.currentYear
  const handleYearChange = (y) => navigate(`${pathPrefix}/players-of-week/${y}`)

  const byYear = currentDynasty.playersOfWeekByYear || {}
  const yearData = byYear[displayYear] || {}
  // Week 0 is a real, played week (CFB27's kickoff week) with its own
  // Players of the Week honorees — was previously excluded here (`w > 0`),
  // which made this page show a false "No Players of the Week Yet" empty
  // state for the entire year whenever Week 0 was the only week synced so
  // far, even though the save (and dynasty.playersOfWeekByYear) already had
  // real Week 0 data.
  const availableWeeks = Object.keys(yearData).map(Number).filter((w) => Number.isFinite(w) && w >= 0).sort((a, b) => b - a)
  const [week, setWeek] = useState(availableWeeks[0] ?? null)
  const activeWeek = availableWeeks.includes(week) ? week : (availableWeeks[0] ?? null)
  const weekData = activeWeek != null ? yearData[activeWeek] || yearData[String(activeWeek)] : null

  const conferenceNames = weekData?.byConference ? Object.keys(weekData.byConference).sort() : []
  const activeConference = conference && conferenceNames.includes(conference) ? conference : conferenceNames[0]

  const sides = scope === 'national'
    ? weekData?.national
    : (activeConference ? weekData?.byConference?.[activeConference] : null)

  const teamsSource = currentDynasty.teams || {}

  const HonoreeCard = ({ label, honoree }) => {
    if (!honoree) return null
    const mascotName = getMascotName(honoree.tid, teamsSource)
    const schoolName = stripMascotFromName(mascotName) || mascotName
    const colors = mascotName ? getTeamColors(mascotName, teamsSource) : null
    const logo = honoree.tid != null ? getTeamLogoByTid(honoree.tid, teamsSource) : null
    const game = findBoxScoreGameSummary(currentDynasty, honoree, activeWeek, displayYear, availableWeeks)
    const teamRank = honoree.tid != null ? currentPollRank(currentDynasty, honoree.tid, displayYear) : null
    return (
      <div className="space-y-2">
        <div className="text-[10px] font-black uppercase tracking-[0.2em] text-txt-tertiary">{label}</div>
        <HonorPlayerTile
          position={honoree.position}
          name={honoree.name}
          schoolName={schoolName}
          schoolAbbr={teamsSource?.[honoree.tid]?.abbr}
          teamLogo={logo}
          primary={colors?.primary || '#3a3d47'}
          photoUrl={honoree.pictureUrl}
          to={undefined}
          showLogoWatermark
          teamRank={teamRank}
        />
        <div className="pl-3 text-xs text-txt-tertiary">
          {game.noGame ? (
            <span className="italic">No Game This Week.</span>
          ) : (
            <>
              <span className="font-semibold text-txt-secondary">
                Last Game vs {game.oppName} ({game.won ? 'W' : 'L'} {game.teamScore}-{game.oppScore}):
              </span>{' '}
              {game.statLine || '—'}
            </>
          )}
        </div>
      </div>
    )
  }

  const hasWeeks = availableWeeks.length > 0

  return (
    <div className="space-y-6">
      <PageHero
        title={
          <TitleWithYear year={displayYear} years={availableYears} onChange={handleYearChange} label="Players of the Week" />
        }
        right={hasWeeks && (
          <Select value={activeWeek ?? ''} onChange={(e) => setWeek(Number(e.target.value))} size="sm">
            {availableWeeks.map((w) => <option key={w} value={w}>Week {w}</option>)}
          </Select>
        )}
        tabs={[
          { key: 'national', label: 'National' },
          { key: 'conference', label: 'Conference' },
        ]}
        activeTab={scope}
        onTabChange={setScope}
      />

      {!hasWeeks ? (
        <Card>
          <EmptyState title="No Players of the Week Yet" message="Sync from your CFB27 save to populate weekly honorees." />
        </Card>
      ) : (
        <>
          {scope === 'conference' && conferenceNames.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {conferenceNames.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setConference(c)}
                  className={`px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wide transition-colors ${activeConference === c ? 'text-txt-primary' : 'text-txt-tertiary hover:text-txt-secondary'}`}
                  style={activeConference === c ? { backgroundColor: 'var(--surface-3)' } : undefined}
                >
                  {c}
                </button>
              ))}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <HonoreeCard label="Offensive" honoree={sides?.offensive} />
            <HonoreeCard label="Defensive" honoree={sides?.defensive} />
          </div>
          {!sides?.offensive && !sides?.defensive && (
            <Card><EmptyState title="No Honorees for This Selection" /></Card>
          )}
        </>
      )}
    </div>
  )
}
