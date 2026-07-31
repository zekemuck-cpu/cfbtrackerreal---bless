import { getTeamStatsForTid } from './boxScoreHelpers'
import { resolveTid } from '../data/teamRegistry'
import { getPlayerTid } from '../data/rosterModel'
import { recalculateStatsFromBoxScores } from '../context/DynastyContext'

function num(v) {
  return parseInt(v) || 0
}

function ensureTeam(map, tid) {
  if (!map.has(tid)) {
    map.set(tid, {
      tid,
      gamesPlayed: 0, wins: 0, losses: 0,
      pointsFor: 0, pointsAgainst: 0,
      // Offense
      passYards: 0, rushYards: 0, totalOffense: 0, totalPlays: 0,
      completions: 0, passAttempts: 0, passTds: 0,
      rushAttempts: 0, rushTds: 0, firstDowns: 0,
      thirdDownConv: 0, thirdDownAtt: 0,
      fourthDownConv: 0, fourthDownAtt: 0,
      redZoneTd: 0, redZoneFg: 0,
      turnovers: 0, fumblesLost: 0, interceptions: 0,
      puntRetYards: 0, kickRetYards: 0, punts: 0,
      penalties: 0, penaltyYards: 0,
      possMinutes: 0, possSeconds: 0,
      // Defense — production allowed, aggregated from the opponent's own
      // offensive box score in each game (same convention TeamYear.jsx's
      // teamStatsData useMemo already uses for a single team).
      oppPassYards: 0, oppRushYards: 0, oppTotalYards: 0, oppFirstDowns: 0,
      oppThirdDownConv: 0, oppThirdDownAtt: 0, oppTurnovers: 0,
      defGames: 0,
      // Player-sourced defensive playmaking (from each roster player's own
      // statsByYear[year].defense — see the loop below).
      sacks: 0, ints: 0, tfl: 0, ff: 0,
    })
  }
  return map.get(tid)
}

/**
 * League-wide per-team season totals for a given year. Same accumulation
 * TeamYear.jsx's own `teamStatsData` / `teamDefensePlaymaking` useMemos
 * compute for one team at a time — generalized here to loop every game
 * (and every roster player) once and bucket into whichever team(s) it
 * touches, instead of re-running the whole scan per team.
 *
 * Returns a Map<tid, statsObject>.
 */
export function computeLeagueTeamStats(dynasty, year) {
  const teamsSource = dynasty?.teams || dynasty?.customTeams || {}
  const acc = new Map()
  const yearNum = Number(year)

  for (const game of dynasty?.games || []) {
    if (Number(game.year) !== yearNum) continue
    const team1Tid = game.team1Tid != null ? Number(game.team1Tid) : resolveTid(game.team1, teamsSource)
    const team2Tid = game.team2Tid != null ? Number(game.team2Tid) : resolveTid(game.team2, teamsSource)
    if (!Number.isFinite(team1Tid) || !Number.isFinite(team2Tid)) continue

    const hasScores = game.team1Score != null && game.team2Score != null &&
      (game.team1Score > 0 || game.team2Score > 0 || game.isPlayed)
    if (hasScores) {
      const t1 = ensureTeam(acc, team1Tid)
      const t2 = ensureTeam(acc, team2Tid)
      t1.pointsFor += num(game.team1Score); t1.pointsAgainst += num(game.team2Score)
      t2.pointsFor += num(game.team2Score); t2.pointsAgainst += num(game.team1Score)
      if (game.team1Score > game.team2Score) { t1.wins++; t2.losses++ }
      else if (game.team2Score > game.team1Score) { t2.wins++; t1.losses++ }
      t1.gamesPlayed++; t2.gamesPlayed++
    }

    if (!game.boxScore) continue
    for (const [tid, oppTid] of [[team1Tid, team2Tid], [team2Tid, team1Tid]]) {
      const t = ensureTeam(acc, tid)
      const ts = getTeamStatsForTid(game, tid, teamsSource)
      if (ts) {
        t.passYards += num(ts.passYards ?? ts.passingYards)
        t.rushYards += num(ts.rushYards)
        t.totalOffense += num(ts.totalOffense ?? ts.totalYards)
        t.totalPlays += num(ts.totalPlays)
        t.completions += num(ts.completions)
        t.passAttempts += num(ts.passAttempts)
        t.passTds += num(ts.passTds)
        t.rushAttempts += num(ts.rushAttempts)
        t.rushTds += num(ts.rushTds)
        t.firstDowns += num(ts.firstDowns)
        t.thirdDownConv += num(ts['3rdDownConv'])
        t.thirdDownAtt += num(ts['3rdDownAtt'])
        t.fourthDownConv += num(ts['4thDownConv'])
        t.fourthDownAtt += num(ts['4thDownAtt'])
        t.redZoneTd += num(ts.redZoneTd ?? ts.redZoneTD)
        t.redZoneFg += num(ts.redZoneFg ?? ts.redZoneFG)
        t.turnovers += num(ts.turnovers)
        t.fumblesLost += num(ts.fumblesLost)
        t.interceptions += num(ts.interceptions)
        t.puntRetYards += num(ts.puntRetYards)
        t.kickRetYards += num(ts.kickRetYards)
        t.punts += num(ts.punts)
        t.penalties += num(ts.penalties)
        t.penaltyYards += num(ts.penaltyYards)
        t.possMinutes += num(ts.possMinutes)
        t.possSeconds += num(ts.possSeconds)
      }
      const oppTs = getTeamStatsForTid(game, oppTid, teamsSource)
      if (oppTs) {
        t.defGames++
        const oPass = num(oppTs.passYards ?? oppTs.passingYards)
        const oRush = num(oppTs.rushYards)
        t.oppPassYards += oPass
        t.oppRushYards += oRush
        t.oppTotalYards += num(oppTs.totalOffense ?? oppTs.totalYards) || (oPass + oRush)
        t.oppFirstDowns += num(oppTs.firstDowns)
        t.oppThirdDownConv += num(oppTs['3rdDownConv'])
        t.oppThirdDownAtt += num(oppTs['3rdDownAtt'])
        t.oppTurnovers += num(oppTs.turnovers)
      }
    }
  }

  // player.statsByYear is only recomputed from game.boxScore on a few
  // narrow triggers (revert week, a manual Danger Zone "Sync Stats") — not
  // automatically after every CFB27 "Sync from Save" — so it can lag well
  // behind the games actually on record. Recomputing it live here (the
  // same pure aggregator the app's own recovery paths use) keeps Sacks/
  // INT/TFL/FF accurate instead of reading a stale partial-season total.
  const freshPlayers = recalculateStatsFromBoxScores(dynasty?.players || [], dynasty?.games || [], yearNum)
  for (const player of freshPlayers) {
    if (player?.isHonorOnly) continue
    const yearStats = player.statsByYear?.[yearNum] ?? player.statsByYear?.[String(yearNum)]
    const d = yearStats?.defense
    if (!d) continue
    const rawTid = getPlayerTid(player, yearNum, { currentYear: dynasty?.currentYear })
    const tid = rawTid != null && rawTid !== '' && Number.isFinite(Number(rawTid)) ? Number(rawTid) : null
    if (tid == null) continue
    const t = ensureTeam(acc, tid)
    t.sacks += num(d.sacks)
    t.ints += num(d.int)
    t.tfl += num(d.tfl)
    t.ff += num(d.ff)
  }

  return acc
}
