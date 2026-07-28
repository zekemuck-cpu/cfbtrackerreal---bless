import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useDynasty } from '../../context/DynastyContext'
import { usePathPrefix } from '../../hooks/usePathPrefix'
import { getTeamLogoByTid, getMascotName, stripMascotFromName } from '../../data/teams'
import { getTeamColors } from '../../data/teamColors'
import { AWARD_IMAGES } from '../../data/awardImages'
import { normalizePlayerName } from '../../utils/playerMatching'
import { getPlayerTid } from '../../data/rosterModel'
import { HonorPlayerTile } from '../../components/HonorsUI'
import { PageHero, Card, EmptyState, TitleWithYear, Select } from '../../components/ui'

// This candidate's most recent played game AT OR BEFORE the week being
// viewed (not just "most recent in the whole season" — viewing an older
// week's Heisman Watch should show what was "last week" AT THAT TIME, not
// always the newest game since). Combines every box-score category they
// show up in (a dual-threat QB's passing AND rushing lines together,
// matching the in-game card exactly), since a Heisman-caliber player
// commonly produces in more than one category the same game.
//
// Always returns SOMETHING to render — { noGame: true } when their team
// simply didn't play that week (a bye), so the UI can show "No Game Last
// Week." instead of silently showing nothing, matching the in-game card.
// A found game with no matching box-score line (name mismatch, or a stat
// category gap) still returns the game's result — better to show the real
// score than nothing just because the detailed stat line came up empty.
function findLastGameSummary(dynasty, candidate, year, atOrBeforeWeek) {
  if (!candidate?.tid) return { noGame: true }
  const teamsSource = dynasty.teams || {}
  const games = (dynasty.games || [])
    .filter((g) => Number(g.year) === Number(year) && g.isPlayed
      && (atOrBeforeWeek == null || Number(g.week) <= Number(atOrBeforeWeek))
      && (Number(g.team1Tid) === candidate.tid || Number(g.team2Tid) === candidate.tid))
    .sort((a, b) => Number(b.week) - Number(a.week))
  const game = games[0]
  if (!game) return { noGame: true }

  const isTeam1 = Number(game.team1Tid) === candidate.tid
  const teamScore = isTeam1 ? game.team1Score : game.team2Score
  const oppScore = isTeam1 ? game.team2Score : game.team1Score
  const oppTid = isTeam1 ? game.team2Tid : game.team1Tid
  const won = teamScore > oppScore
  const oppMascot = getMascotName(oppTid, teamsSource)
  const oppName = stripMascotFromName(oppMascot) || oppMascot || teamsSource?.[oppTid]?.abbr || 'Opponent'

  const categories = game.boxScore?.byTid?.[candidate.tid]
  const target = (candidate.name || '').toLowerCase().trim()
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
    if (defense.tD) parts.push(`${defense.tD} TD`)
  }

  return { noGame: false, oppName, won, teamScore, oppScore, statLine: parts.length ? parts.join(', ') : null }
}

// This candidate's CURRENT SEASON totals (not just their last game) —
// matched against dynasty.players by normalized name, preferring a name+team
// match (guards against the same real-world name existing on two different
// teams) and falling back to name-only if that fails. A Heisman Watch entry
// carries no pid of its own (see mapHeismanEntry in cfb27SaveImport.js), so
// this lookup is the only way to reach their statsByYear.
function findSeasonStatLine(dynasty, candidate, year) {
  if (!candidate?.name) return null
  const target = normalizePlayerName(candidate.name)
  const players = dynasty.players || []
  const matchesName = (p) => normalizePlayerName(p.name || '') === target
  let player = candidate.tid != null
    ? players.find((p) => matchesName(p) && Number(getPlayerTid(p, year, { currentYear: dynasty.currentYear })) === Number(candidate.tid))
    : null
  if (!player) player = players.find(matchesName)
  if (!player) return null

  const ys = player.statsByYear?.[year] || player.statsByYear?.[String(year)]
  if (!ys) return null
  const parts = []

  if (ys.passing) {
    const p = ys.passing
    const ypa = p.att ? (p.yds / p.att).toFixed(1) : '0.0'
    parts.push(`${p.yds || 0} PASS YDS`, `${ypa} YPA`, `${p.td || 0} PASS TD`)
    if (p.int) parts.push(`${p.int} INT`)
  }
  if (ys.rushing) {
    const r = ys.rushing
    parts.push(`${r.car || 0} CAR`, `${r.yds || 0} RUSH YDS`)
    if (r.td) parts.push(`${r.td} RUSH TD`)
  }
  if (ys.receiving) {
    const rc = ys.receiving
    parts.push(`${rc.rec || 0} REC`, `${rc.yds || 0} REC YDS`)
    if (rc.td) parts.push(`${rc.td} REC TD`)
  }
  if (ys.defense) {
    const d = ys.defense
    const tkl = (d.soloTkl || 0) + (d.astTkl || 0)
    if (tkl) parts.push(`${tkl} TKL`)
    if (d.sacks) parts.push(`${d.sacks} SACK`)
    if (d.int) parts.push(`${d.int} INT`)
    if (d.pd) parts.push(`${d.pd} PBU`)
  }

  return parts.length ? parts.join(', ') : null
}

// Rank-change indicator — a brand-new top-4 entry (prevRank null) reads the
// same as an improvement, matching how the in-game screen shows it (see
// buildHeismanWatch's header comment in extractPlayers.cjs).
function RankChange({ rank, prevRank }) {
  if (prevRank == null) {
    return <span className="text-[10px] font-bold" style={{ color: 'var(--accent-success, #22c55e)' }}>▲ NEW</span>
  }
  if (prevRank === rank) {
    return <span className="text-[10px] font-bold text-txt-tertiary">— </span>
  }
  const improved = prevRank > rank
  return (
    <span className="text-[10px] font-bold" style={{ color: improved ? 'var(--accent-success, #22c55e)' : 'var(--accent-error, #ef4444)' }}>
      {improved ? '▲' : '▼'} {Math.abs(prevRank - rank)}
    </span>
  )
}

export default function HeismanWatch() {
  const { year: urlYear } = useParams()
  const navigate = useNavigate()
  const { currentDynasty } = useDynasty()
  const pathPrefix = usePathPrefix()

  if (!currentDynasty) return null

  const startYear = currentDynasty.startYear || currentDynasty.currentYear
  const availableYears = []
  for (let y = currentDynasty.currentYear; y >= startYear; y--) availableYears.push(y)
  const displayYear = urlYear ? parseInt(urlYear, 10) : currentDynasty.currentYear
  const handleYearChange = (y) => navigate(`${pathPrefix}/heisman-watch/${y}`)

  const byYear = currentDynasty.heismanWatchByYear || {}
  const yearData = byYear[displayYear] || {}
  const availableWeeks = Object.keys(yearData).map(Number).sort((a, b) => b - a)
  const [week, setWeek] = useState(availableWeeks[0] ?? null)
  const activeWeek = availableWeeks.includes(week) ? week : (availableWeeks[0] ?? null)
  const candidates = activeWeek != null ? (yearData[activeWeek] || yearData[String(activeWeek)] || []) : []

  const teamsSource = currentDynasty.teams || {}
  const hasWeeks = availableWeeks.length > 0

  // Once the season's real Heisman winner is synced (dynasty.awardsByYear
  // [year].heisman — see cfb27SaveSync.js/Awards.jsx), highlight that same
  // player here too if they're still showing in this week's watch list.
  const heismanWinner = currentDynasty.awardsByYear?.[displayYear]?.heisman
  const winnerName = heismanWinner?.player ? normalizePlayerName(heismanWinner.player) : null
  const isWinner = (c) => winnerName != null && normalizePlayerName(c.name || '') === winnerName

  return (
    <div className="space-y-6">
      <PageHero
        title={
          <div className="flex items-center gap-3">
            {AWARD_IMAGES.heisman && (
              <img
                src={AWARD_IMAGES.heisman}
                alt=""
                className="h-12 sm:h-14 w-auto object-contain flex-shrink-0"
                style={{ filter: 'drop-shadow(0 4px 10px rgba(0,0,0,0.5))' }}
              />
            )}
            <TitleWithYear year={displayYear} years={availableYears} onChange={handleYearChange} label="Heisman Watch" />
          </div>
        }
        right={hasWeeks && (
          <Select value={activeWeek ?? ''} onChange={(e) => setWeek(Number(e.target.value))} size="sm">
            {availableWeeks.map((w) => <option key={w} value={w}>Week {w}</option>)}
          </Select>
        )}
      />

      {!hasWeeks || candidates.length === 0 ? (
        <Card>
          <EmptyState title="No Heisman Watch Data Yet" message="Sync from your CFB27 save to populate the Heisman Watch." />
        </Card>
      ) : (
        <div className="space-y-2">
          {[...candidates].sort((a, b) => a.rank - b.rank).map((c) => {
            const mascotName = getMascotName(c.tid, teamsSource)
            const schoolName = stripMascotFromName(mascotName) || mascotName
            const colors = mascotName ? getTeamColors(mascotName, teamsSource) : null
            const logo = c.tid != null ? getTeamLogoByTid(c.tid, teamsSource) : null
            const lastGame = findLastGameSummary(currentDynasty, c, displayYear, activeWeek)
            const seasonStatLine = findSeasonStatLine(currentDynasty, c, displayYear)
            const won = isWinner(c)
            return (
              <div
                key={c.rank}
                className={`space-y-1 ${won ? 'rounded-lg' : ''}`}
                style={won ? {
                  boxShadow: 'inset 0 0 0 1.5px #d4a44a',
                  background: 'linear-gradient(180deg, rgba(212,164,74,0.12) 0%, rgba(212,164,74,0.03) 100%)',
                } : undefined}
              >
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <HonorPlayerTile
                      rankBadge={c.rank}
                      position={c.position}
                      name={c.name}
                      schoolName={schoolName}
                      schoolAbbr={teamsSource?.[c.tid]?.abbr}
                      teamLogo={logo}
                      primary={colors?.primary || '#3a3d47'}
                      photoUrl={c.pictureUrl}
                      statLine={seasonStatLine ? `SEASON: ${seasonStatLine}` : null}
                      showLogoWatermark
                    />
                  </div>
                  {won && (
                    <span
                      className="text-[10px] font-black uppercase tracking-wider flex-shrink-0 px-2 py-1 rounded"
                      style={{ color: '#d4a44a', border: '1px solid rgba(212,164,74,0.5)' }}
                    >
                      Winner
                    </span>
                  )}
                  <div className="w-14 flex-shrink-0 text-center">
                    <RankChange rank={c.rank} prevRank={c.prevRank} />
                  </div>
                </div>
                <div className="pl-3 text-xs text-txt-tertiary">
                  {lastGame.noGame ? (
                    <span className="italic">No Game Last Week.</span>
                  ) : (
                    <>
                      <span className="font-semibold text-txt-secondary">
                        Last Game vs {lastGame.oppName} ({lastGame.won ? 'W' : 'L'} {lastGame.teamScore}-{lastGame.oppScore}):
                      </span>{' '}
                      {lastGame.statLine || '—'}
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
