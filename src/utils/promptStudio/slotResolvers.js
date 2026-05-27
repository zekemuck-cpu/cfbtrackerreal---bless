/**
 * Slot resolvers — turn the user's picked slot values into structured
 * markdown blocks that get embedded in the composed prompt.
 *
 * Each resolver reads ONLY from the supplied dynasty object (no API
 * calls, no Firestore). Resolvers degrade gracefully on missing data —
 * if a player has no stats for the chosen year, the markdown says so
 * rather than throwing.
 *
 * Resolver signatures are intentionally small: (dynasty, primaryId,
 * options?) → string of markdown. Templates compose these into the
 * final prompt's DATA block.
 */

import {
  calculateTeamRecordFromGames,
  getTeamRecord,
  getTeamRankForWeek,
  getPlayerBoxScoreTotals,
  getAllPlayers,
  getPlayerOverallForYear,
  getPlayerClassForYear,
  getPlayerPositionForYear,
  isPlayerOnRoster,
} from '../../context/DynastyContext'
import { TEAMS } from '../../data/teamRegistry'
import { getMascotName } from '../../data/teams'

// ─── Helpers ───────────────────────────────────────────────────────────────

function teamLabel(dynasty, tid) {
  if (tid == null) return 'Unknown team'
  const teams = dynasty?.teams || TEAMS
  return getMascotName(tid, teams) || `Team ${tid}`
}

function teamAbbr(dynasty, tid) {
  if (tid == null) return ''
  const teams = dynasty?.teams || {}
  return teams[tid]?.abbr || ''
}

function normName(s) {
  return (s || '').toLowerCase().trim().replace(/\s+/g, ' ')
}

// Extract a single player's stats from a raw boxScore object for one game.
// Returns an object keyed by category (passing/rushing/etc.) with raw field values,
// or null if the player doesn't appear.
function extractPlayerFromBoxScore(boxScore, playerName) {
  if (!boxScore || !playerName) return null
  const target = normName(playerName)
  const sides = []
  if (boxScore.byTid && typeof boxScore.byTid === 'object') {
    for (const side of Object.values(boxScore.byTid)) { if (side) sides.push(side) }
  }
  if (boxScore.home) sides.push(boxScore.home)
  if (boxScore.away) sides.push(boxScore.away)

  const cats = ['passing', 'rushing', 'receiving', 'defense', 'kicking', 'punting', 'kickReturn', 'puntReturn', 'blocking']
  const result = {}
  for (const side of sides) {
    for (const cat of cats) {
      if (!Array.isArray(side[cat])) continue
      const row = side[cat].find(r => normName(r.playerName) === target)
      if (row) result[cat] = row
    }
  }
  return Object.keys(result).length ? result : null
}

// Format raw box score stats (box score field names, not internal) for a single game line.
function formatRawGameStats(stats) {
  const parts = []
  if (stats.passing) {
    const p = stats.passing
    const att = Number(p.attempts ?? p.att ?? 0)
    if (att > 0) {
      const cmp = Number(p.comp ?? p.cmp ?? 0)
      parts.push(`${cmp}/${att}, ${p.yards ?? 0} yds, ${p.tD ?? p.td ?? 0} TD, ${p.iNT ?? p.int ?? 0} INT`)
    }
  }
  if (stats.rushing) {
    const r = stats.rushing
    const car = Number(r.carries ?? 0)
    if (car > 0) parts.push(`Rush: ${car} car, ${r.yards ?? 0} yds, ${r.tD ?? r.td ?? 0} TD`)
  }
  if (stats.receiving) {
    const r = stats.receiving
    const rec = Number(r.receptions ?? r.rec ?? 0)
    if (rec > 0) parts.push(`Rec: ${rec} rec, ${r.yards ?? 0} yds, ${r.tD ?? r.td ?? 0} TD`)
  }
  if (stats.defense) {
    const d = stats.defense
    const tkl = (Number(d.solo ?? 0)) + (Number(d.assists ?? 0))
    const dbits = []
    if (tkl) dbits.push(`${tkl} tkl`)
    if (d.tFL) dbits.push(`${d.tFL} TFL`)
    if (d.sack) dbits.push(`${d.sack} sk`)
    if (d.iNT) dbits.push(`${d.iNT} INT`)
    if (d.deflections) dbits.push(`${d.deflections} PD`)
    if (d.fF) dbits.push(`${d.fF} FF`)
    if (dbits.length) parts.push(`Def: ${dbits.join(', ')}`)
  }
  if (stats.kicking) {
    const k = stats.kicking
    if (k.fGA) parts.push(`Kicking: ${k.fGM ?? 0}/${k.fGA} FG, ${k.xPM ?? 0}/${k.xPA ?? 0} XP`)
  }
  if (stats.punting) {
    const p = stats.punting
    if (p.punts) parts.push(`Punting: ${p.punts} punts, ${p.yards ?? 0} yds`)
  }
  if (stats.blocking) {
    const b = stats.blocking
    const bbits = []
    if (b.pancakes) bbits.push(`${b.pancakes} pancakes`)
    if (b.sacksAllowed) bbits.push(`${b.sacksAllowed} sacks allowed`)
    if (bbits.length) parts.push(`Block: ${bbits.join(', ')}`)
  }
  return parts.join(' | ')
}

function formatRecord(rec) {
  if (!rec) return '—'
  const { wins = 0, losses = 0, ties = 0 } = rec
  return ties > 0 ? `${wins}-${losses}-${ties}` : `${wins}-${losses}`
}

function fmtPctOrDash(n, d) {
  if (!d || !Number.isFinite(n)) return '—'
  return `${Math.round((n / d) * 1000) / 10}%`
}

function safeArr(v) {
  return Array.isArray(v) ? v : []
}

// ─── Game slot ──────────────────────────────────────────────────────────────

/**
 * Resolve a single game by id into a markdown block describing:
 *   - matchup line, scores, ranks, records entering, location
 *   - top box-score totals per team (passing / rushing / receiving leaders + key defense)
 *   - scoring summary (compressed)
 *   - aiRecap if present
 */
export function resolveGameSlot(dynasty, gameId, options = {}) {
  if (!gameId) return '_(no game selected)_'
  const game = safeArr(dynasty?.games).find(g => g.id === gameId)
  if (!game) return `_(game ${gameId} not found)_`

  const t1Tid = Number(game.team1Tid)
  const t2Tid = Number(game.team2Tid)
  const t1 = teamLabel(dynasty, t1Tid)
  const t2 = teamLabel(dynasty, t2Tid)
  const t1Abbr = teamAbbr(dynasty, t1Tid)
  const t2Abbr = teamAbbr(dynasty, t2Tid)
  const s1 = game.team1Score ?? '—'
  const s2 = game.team2Score ?? '—'
  const r1 = game.team1Rank ? ` (#${game.team1Rank})` : ''
  const r2 = game.team2Rank ? ` (#${game.team2Rank})` : ''
  // Use stored per-game record fields; getTeamRecord() would return the full-season
  // total (including this game) which overstates the "entering" record.
  const rec1 = game.team1Record || null
  const rec2 = game.team2Record || null

  const homeTid = game.homeTeamTid
  let site = 'neutral site'
  if (homeTid === t1Tid) site = `at ${t1}`
  else if (homeTid === t2Tid) site = `at ${t2}`

  const gameTypeLabel = ({
    regular: 'Regular Season',
    conference_championship: 'Conference Championship',
    bowl: 'Bowl Game',
    cfp_first_round: 'CFP First Round',
    cfp_quarterfinal: 'CFP Quarterfinal',
    cfp_semifinal: 'CFP Semifinal',
    cfp_championship: 'CFP National Championship',
  })[game.gameType] || (game.isBowlGame ? 'Bowl Game' : 'Regular Season')

  const out = []
  out.push(`### Game: ${t1}${r1} ${s1} — ${s2} ${t2}${r2}`)
  out.push(`- **Year/Week**: ${game.year || '—'} ${game.week ? `Wk ${game.week}` : ''}${game.bowlName ? ` (${game.bowlName})` : ''}`)
  out.push(`- **Type**: ${gameTypeLabel}`)
  out.push(`- **Site**: ${site}`)
  if (rec1 || rec2) out.push(`- **Records entering**: ${t1Abbr || t1} ${rec1 ?? '—'}, ${t2Abbr || t2} ${rec2 ?? '—'}`)

  // Box score leaders — per team per category
  const bs = game.boxScore
  if (bs && typeof bs === 'object') {
    const byTid = bs.byTid || null
    const renderTeamBox = (tid, name) => {
      const teamBox = byTid?.[tid] || null
      if (!teamBox) return
      const lines = [`\n**${name} box-score leaders**`]
      const topRow = (rows, fmt) => {
        const arr = safeArr(rows)
        if (!arr.length) return null
        // Sort by `fmt`'s score function descending; take top 1.
        const scored = arr.map(r => ({ r, s: fmt.score(r) }))
        scored.sort((a, b) => b.s - a.s)
        return scored[0]?.r
      }
      const fmt = {
        passing: { score: r => Number(r.yards || r.yds || 0), line: r => `${r.playerName || '?'} — ${r.comp || r.cmp || 0}/${r.attempts || r.att || 0}, ${r.yards || r.yds || 0} yds, ${r.tD || r.td || 0} TD, ${r.iNT || r.int || 0} INT` },
        rushing: { score: r => Number(r.yards || r.yds || 0), line: r => `${r.playerName || '?'} — ${r.carries || r.car || 0} car, ${r.yards || r.yds || 0} yds, ${r.tD || r.td || 0} TD` },
        receiving: { score: r => Number(r.yards || r.yds || 0), line: r => `${r.playerName || '?'} — ${r.receptions || r.rec || 0} rec, ${r.yards || r.yds || 0} yds, ${r.tD || r.td || 0} TD` },
        defense: { score: r => Number(r.solo || 0) + Number(r.assists || 0) + Number(r.tackles || 0) + Number(r.sacks || 0) * 2 + Number(r.iNT || r.int || 0) * 2, line: r => `${r.playerName || '?'} — ${(Number(r.solo) || 0) + (Number(r.assists) || 0) + (Number(r.tackles) || 0)} tkl${r.sacks ? `, ${r.sacks} sk` : ''}${(r.iNT || r.int) ? `, ${r.iNT || r.int} INT` : ''}${r.tfl ? `, ${r.tfl} TFL` : ''}` },
      }
      const passTop = topRow(teamBox.passing, fmt.passing)
      if (passTop) lines.push(`  - Passing: ${fmt.passing.line(passTop)}`)
      const rushTop = topRow(teamBox.rushing, fmt.rushing)
      if (rushTop) lines.push(`  - Rushing: ${fmt.rushing.line(rushTop)}`)
      const recTop = topRow(teamBox.receiving, fmt.receiving)
      if (recTop) lines.push(`  - Receiving: ${fmt.receiving.line(recTop)}`)
      const defTop = topRow(teamBox.defense, fmt.defense)
      if (defTop) lines.push(`  - Defense: ${fmt.defense.line(defTop)}`)
      if (lines.length > 1) out.push(lines.join('\n'))
    }
    renderTeamBox(t1Tid, t1)
    renderTeamBox(t2Tid, t2)
  }

  // Team-stat totals
  if (game.team1Stats || game.team2Stats) {
    out.push('\n**Team totals**')
    const teamRow = (label, stats) => {
      if (!stats) return null
      const bits = []
      if (stats.totalYards != null) bits.push(`${stats.totalYards} total yd`)
      if (stats.rushingYards != null) bits.push(`${stats.rushingYards} rush yd`)
      if (stats.passingYards != null) bits.push(`${stats.passingYards} pass yd`)
      if (stats.turnovers != null) bits.push(`${stats.turnovers} TO`)
      if (stats.firstDowns != null) bits.push(`${stats.firstDowns} 1st downs`)
      return bits.length ? `  - ${label}: ${bits.join(', ')}` : null
    }
    const a = teamRow(t1, game.team1Stats)
    const b = teamRow(t2, game.team2Stats)
    if (a) out.push(a)
    if (b) out.push(b)
  }

  // Scoring summary — compressed
  const scoring = safeArr(game.scoringSummary || game.boxScore?.scoringSummary)
  if (scoring.length) {
    out.push('\n**Scoring**')
    scoring.slice(0, 20).forEach(p => {
      const q = p.quarter ? `Q${p.quarter}` : ''
      const t = p.timeLeft || ''
      const team = p.team || ''
      const what = p.scoreType || p.playType || ''
      const who = p.scorer || ''
      const yds = p.yards ? `${p.yards} yd` : ''
      const passer = p.passer ? ` (from ${p.passer})` : ''
      out.push(`  - ${q} ${t} — ${team}: ${what} ${yds} ${who}${passer}`.replace(/\s+/g, ' ').trim())
    })
    if (scoring.length > 20) out.push(`  - … (${scoring.length - 20} more scoring plays)`)
  }

  if (game.aiRecap) {
    out.push('\n**Saved recap**')
    out.push(game.aiRecap.length > 1200 ? game.aiRecap.slice(0, 1200) + '…' : game.aiRecap)
  }

  return out.join('\n')
}

// ─── Team slot ──────────────────────────────────────────────────────────────

/**
 * Resolve a team by tid into a markdown block describing:
 *   - identity, conference, current record + rank
 *   - last N games' results
 */
export function resolveTeamSlot(dynasty, tid, options = {}) {
  if (tid == null) return '_(no team selected)_'
  const tNum = Number(tid)
  const year = options.year ?? dynasty?.currentYear
  const recentN = options.recentGames ?? 3

  const name = teamLabel(dynasty, tNum)
  const abbr = teamAbbr(dynasty, tNum)
  const teamData = dynasty?.teams?.[tNum] || {}
  const conf = teamData.byYear?.[year]?.conference || teamData.conference || '—'
  const rec = formatRecord(getTeamRecord(dynasty, tNum, year)) || '—'
  const rank = getTeamRankForWeek(dynasty, tNum, year, dynasty?.currentWeek ?? 15)

  const out = []
  out.push(`### Team: ${name}${rank ? ` (#${rank})` : ''}`)
  out.push(`- **Abbr**: ${abbr || '—'}`)
  out.push(`- **Conference (${year})**: ${conf}`)
  out.push(`- **Record (${year})**: ${rec}`)

  // Recent games
  const allGames = safeArr(dynasty?.games)
    .filter(g => Number(g.team1Tid) === tNum || Number(g.team2Tid) === tNum)
    .filter(g => Number(g.year) === Number(year))
    .filter(g => g.team1Score != null && g.team2Score != null && (g.team1Score > 0 || g.team2Score > 0 || g.isPlayed))
    .sort((a, b) => gameOrderKey(a) - gameOrderKey(b))

  const recent = allGames.slice(-recentN)
  if (recent.length) {
    out.push(`\n**Last ${recent.length} game(s)** (year ${year})`)
    recent.forEach(g => {
      const isTeam1 = Number(g.team1Tid) === tNum
      const oppTid = isTeam1 ? Number(g.team2Tid) : Number(g.team1Tid)
      const oppName = teamLabel(dynasty, oppTid)
      const us = isTeam1 ? g.team1Score : g.team2Score
      const them = isTeam1 ? g.team2Score : g.team1Score
      const result = us > them ? 'W' : us < them ? 'L' : 'T'
      out.push(`  - Wk ${g.week ?? '?'} ${result} ${us}–${them} ${result === 'W' ? 'vs' : 'to'} ${oppName}`)
    })
  } else {
    out.push(`\n_(no completed games in ${year})_`)
  }

  return out.join('\n')
}

// ─── Player slot ────────────────────────────────────────────────────────────

/**
 * Resolve a player by pid into a markdown block describing identity +
 * stats. Stats scope is controlled by options.horizon:
 *   'this-season' (default) — current year statsByYear entry
 *   'career' — sum of all statsByYear entries
 *   'last-3-games' — last 3 games this season
 *   'this-game' — single game (options.gameId required)
 */
export function resolvePlayerSlot(dynasty, pid, options = {}) {
  if (pid == null) return '_(no player selected)_'
  const player = safeArr(dynasty?.players).find(p => Number(p.pid) === Number(pid))
  if (!player) return `_(player ${pid} not found)_`

  const year = options.year ?? dynasty?.currentYear
  const horizon = options.horizon || 'this-season'

  const pos = getPlayerPositionForYear(player, year) || player.position || '—'
  const cls = getPlayerClassForYear(player, year) || player.year || '—'
  const ovr = getPlayerOverallForYear(player, year) || player.overall || '—'
  const dev = player.devTraitByYear?.[year] || player.devTraitByYear?.[String(year)] || player.devTrait || '—'
  const teamTid = player.teamsByYear?.[year] ?? player.teamsByYear?.[String(year)] ?? null
  const teamName = teamTid != null ? teamLabel(dynasty, teamTid) : '—'

  const out = []
  out.push(`### Player: ${player.name}`)
  out.push(`- **Position**: ${pos}`)
  out.push(`- **Class (${year})**: ${cls}`)
  out.push(`- **Overall (${year})**: ${ovr}`)
  out.push(`- **Dev trait (${year})**: ${dev}`)
  out.push(`- **Team (${year})**: ${teamName}`)

  // Stats per horizon
  if (horizon === 'career') {
    const allYears = Object.keys(player.statsByYear || {}).sort()
    if (!allYears.length) {
      out.push('\n_(no career stats recorded)_')
    } else {
      out.push(`\n**Career stats** (${allYears[0]}–${allYears[allYears.length - 1]})`)
      const totals = {}
      allYears.forEach(y => {
        const s = player.statsByYear[y] || {}
        for (const cat of Object.keys(s)) {
          if (typeof s[cat] !== 'object') continue
          totals[cat] = totals[cat] || {}
          for (const k of Object.keys(s[cat] || {})) {
            const v = Number(s[cat][k]) || 0
            totals[cat][k] = (totals[cat][k] || 0) + v
          }
        }
      })
      out.push(formatStatBlock(totals))
    }
  } else if (horizon === 'this-game' && options.gameId) {
    const game = safeArr(dynasty?.games).find(g => g.id === options.gameId)
    if (!game) {
      out.push(`\n_(game ${options.gameId} not found)_`)
    } else {
      out.push(`\n**Stats in this game** (Wk ${game.week ?? '?'}, ${game.year ?? '?'})`)
      const totals = getPlayerBoxScoreTotals(player.name, [game], year, null)
      if (totals && Object.keys(totals).length) {
        out.push(formatStatBlock(totals))
      } else {
        out.push('_(no stats recorded for this player in that game)_')
      }
    }
  } else if (horizon === 'last-3-games') {
    const games = safeArr(dynasty?.games)
      .filter(g => Number(g.year) === Number(year))
      .filter(g => g.team1Score != null && g.team2Score != null)
      .sort((a, b) => {
        const wa = typeof a.week === 'number' ? a.week : parseInt(a.week, 10) || 99
        const wb = typeof b.week === 'number' ? b.week : parseInt(b.week, 10) || 99
        return wa - wb
      })
      .slice(-3)
    const totals = getPlayerBoxScoreTotals(player.name, games, year, null)
    out.push(`\n**Stats last ${games.length} game(s)** (${year})`)
    if (totals && Object.keys(totals).length) {
      out.push(formatStatBlock(totals))
    } else {
      out.push('_(no stats recorded across recent games)_')
    }
  } else {
    // this-season (default)
    const stats = player.statsByYear?.[year] || player.statsByYear?.[String(year)] || null
    out.push(`\n**Stats (${year})**`)
    if (stats && Object.keys(stats).length) {
      out.push(formatStatBlock(stats))
    } else {
      out.push('_(no stats recorded for this season)_')
    }
  }

  // Awards
  const awards = safeArr(player.accolades)
  if (awards.length) {
    out.push('\n**Awards**')
    awards.slice(0, 10).forEach(a => {
      out.push(`  - ${a.year}: ${a.award}`)
    })
  }

  return out.join('\n')
}

// Game sort order that places postseason games after regular season weeks.
function gameOrderKey(g) {
  const type = g.gameType || 'regular'
  if (type === 'conference_championship') return 200
  if (type === 'bowl')                    return 210
  if (type === 'cfp_first_round')         return 220
  if (type === 'cfp_quarterfinal')        return 230
  if (type === 'cfp_semifinal')           return 240
  if (type === 'cfp_championship')        return 250
  return Number(g.week) || 0
}

// Format a stats object as bullet lines per category.
// Handles both internal field names (yds, car, soloTkl…) and raw box-score
// names (yards, carries, solo…) so it works for statsByYear and one-off blocks.
function formatStatBlock(stats) {
  const lines = []
  const cats = ['passing', 'rushing', 'receiving', 'defense', 'kicking', 'punting', 'kickReturn', 'puntReturn', 'blocking']
  for (const c of cats) {
    const v = stats[c]
    if (!v || typeof v !== 'object') continue
    const bits = []
    if (c === 'passing') {
      if (v.cmp || v.comp) bits.push(`${v.cmp ?? v.comp}/${v.att ?? v.attempts ?? 0}`)
      const yds = v.yds ?? v.yards; if (yds) bits.push(`${yds} yds`)
      if (v.td) bits.push(`${v.td} TD`)
      if (v.int) bits.push(`${v.int} INT`)
      if (v.rating) bits.push(`${v.rating} rtg`)
    } else if (c === 'rushing') {
      const car = v.car ?? v.carries; if (car) bits.push(`${car} car`)
      const yds = v.yds ?? v.yards; if (yds) bits.push(`${yds} yds`)
      if (v.td) bits.push(`${v.td} TD`)
    } else if (c === 'receiving') {
      if (v.rec) bits.push(`${v.rec} rec`)
      const yds = v.yds ?? v.yards; if (yds) bits.push(`${yds} yds`)
      if (v.td) bits.push(`${v.td} TD`)
    } else if (c === 'defense') {
      const tkl = (Number(v.soloTkl || v.solo) || 0) + (Number(v.astTkl || v.assists) || 0)
      if (tkl) bits.push(`${tkl} tkl`)
      if (v.tfl) bits.push(`${v.tfl} TFL`)
      if (v.sacks) bits.push(`${v.sacks} sk`)
      if (v.int) bits.push(`${v.int} INT`)
      const pd = v.pd ?? v.deflections; if (pd) bits.push(`${pd} PD`)
      if (v.ff) bits.push(`${v.ff} FF`)
      if (v.fr) bits.push(`${v.fr} FR`)
    } else if (c === 'kicking') {
      if (v.fgm != null) bits.push(`${v.fgm}/${v.fga ?? 0} FG`)
    } else if (c === 'punting') {
      if (v.punts) bits.push(`${v.punts} punts`)
      const yds = v.yds ?? v.yards; if (yds) bits.push(`${yds} yds`)
    } else if (c === 'kickReturn') {
      // internal: ret  raw: kR
      const ret = v.ret ?? v.kr; if (ret) bits.push(`${ret} KR`)
      const yds = v.yds ?? v.yards; if (yds) bits.push(`${yds} yds`)
      if (v.td) bits.push(`${v.td} TD`)
    } else if (c === 'puntReturn') {
      // internal: ret  raw: pR
      const ret = v.ret ?? v.pr; if (ret) bits.push(`${ret} PR`)
      const yds2 = v.yds ?? v.yards; if (yds2) bits.push(`${yds2} yds`)
      if (v.td) bits.push(`${v.td} TD`)
    } else if (c === 'blocking') {
      if (v.pancakes) bits.push(`${v.pancakes} pancakes`)
      if (v.sacksAllowed) bits.push(`${v.sacksAllowed} sacks allowed`)
    }
    if (bits.length) lines.push(`  - ${c[0].toUpperCase()}${c.slice(1)}: ${bits.join(', ')}`)
  }
  return lines.length ? lines.join('\n') : '  _(no countable categories)_'
}

// ─── Year slot ──────────────────────────────────────────────────────────────

/**
 * Resolve a year into a markdown block describing dynasty state in that
 * year: standings snapshot, the user's team's record and rank.
 */
export function resolveYearSlot(dynasty, year, options = {}) {
  if (year == null) return '_(no year selected)_'
  const userTid = dynasty?.currentTid
  const userName = userTid != null ? teamLabel(dynasty, userTid) : '—'
  const userRec = userTid != null ? formatRecord(getTeamRecord(dynasty, userTid, year)) : '—'
  const userRank = userTid != null ? getTeamRankForWeek(dynasty, userTid, year, 15) : null

  const out = []
  out.push(`### Year: ${year}`)
  out.push(`- **Your team**: ${userName}${userRank ? ` (#${userRank})` : ''} — ${userRec}`)

  // Final poll if present
  const finalPoll = dynasty?.finalPollsByYear?.[year]
  if (finalPoll && typeof finalPoll === 'object') {
    const top10 = Object.entries(finalPoll)
      .map(([tid, rank]) => ({ tid: Number(tid), rank: Number(rank) }))
      .filter(e => Number.isFinite(e.rank) && e.rank <= 10)
      .sort((a, b) => a.rank - b.rank)
    if (top10.length) {
      out.push(`\n**Final Top 10 (${year})**`)
      top10.forEach(e => {
        out.push(`  - #${e.rank} ${teamLabel(dynasty, e.tid)}`)
      })
    }
  }

  return out.join('\n')
}

// ─── Position slot ──────────────────────────────────────────────────────────

/**
 * Resolve a position+team+year combo into a markdown block describing
 * the top players at that position group for that team in that year.
 */
export function resolvePositionSlot(dynasty, position, options = {}) {
  if (!position) return '_(no position selected)_'
  const year = options.year ?? dynasty?.currentYear
  const tid = options.tid ?? dynasty?.currentTid
  if (tid == null) return '_(no team context)_'

  const yearNum = Number(year)
  const teamName = teamLabel(dynasty, tid)
  const out = []
  out.push(`### Position group: ${position} — ${teamName} (${year})`)

  const players = getAllPlayers(dynasty) || []
  const groupPlayers = players
    .filter(p => isPlayerOnRoster(p, tid, year))
    .filter(p => (getPlayerPositionForYear(p, year) || p.position) === position)
    .sort((a, b) => (getPlayerOverallForYear(b, year) || 0) - (getPlayerOverallForYear(a, year) || 0))

  if (!groupPlayers.length) {
    out.push(`\n_(no ${position}s on the ${teamName} roster for ${year})_`)
    return out.join('\n')
  }

  // All games for this year in chronological order (postseason after reg-season weeks)
  const yearGames = (dynasty?.games || [])
    .filter(g => Number(g.year) === yearNum)
    .sort((a, b) => gameOrderKey(a) - gameOrderKey(b))

  // Split into active producers (have current-year stats or game log entries) and
  // depth reserves (no recorded data this year). Reserves get one compact line
  // instead of full entries — they don't need token budget.
  const hasCurrentData = (p) => {
    const ss = p.statsByYear?.[year] || p.statsByYear?.[String(year)]
    if (ss && Object.keys(ss).length) return true
    return yearGames.some(g => g.boxScore && !!extractPlayerFromBoxScore(g.boxScore, p.name))
  }
  const activePlayers  = groupPlayers.filter(p => hasCurrentData(p))
  const reservePlayers = groupPlayers.filter(p => !hasCurrentData(p))

  activePlayers.forEach(p => {
    const ovr = getPlayerOverallForYear(p, year) || '—'
    const cls = getPlayerClassForYear(p, year) || '—'
    const dev = p.devTraitByYear?.[year] || p.devTraitByYear?.[String(year)] || p.devTrait || '—'
    const jersey = p.jerseyNumber ? `#${p.jerseyNumber} ` : ''

    out.push(`\n---`)
    out.push(`#### ${jersey}${p.name} — ${cls}, OVR ${ovr}, ${dev}`)

    // Prior-year season totals (career arc context) — up to 3 previous seasons
    const allStatYears = Object.keys(p.statsByYear || {})
      .map(Number).filter(Number.isFinite)
      .filter(y => y < Number(year))
      .sort((a, b) => b - a)
      .slice(0, 3)
      .reverse()

    if (allStatYears.length) {
      out.push(`**Prior seasons:**`)
      allStatYears.forEach(py => {
        const ps = p.statsByYear?.[py] || p.statsByYear?.[String(py)]
        const pyOvr = getPlayerOverallForYear(p, py) || '—'
        if (ps && Object.keys(ps).length) {
          out.push(`  _${py} (OVR ${pyOvr}):_`)
          out.push(formatStatBlock(ps))
        }
      })
    }

    // Current-year season totals
    const seasonStats = p.statsByYear?.[year] || p.statsByYear?.[String(year)]
    if (seasonStats && Object.keys(seasonStats).length) {
      out.push(`**${year} season totals:**`)
      out.push(formatStatBlock(seasonStats))
    } else {
      out.push(`_(no ${year} season stats recorded)_`)
    }

    // Game log — one line per game where the player appeared in the box score
    const gameLogLines = []
    yearGames.forEach(g => {
      if (!g.boxScore) return
      const gameStats = extractPlayerFromBoxScore(g.boxScore, p.name)
      if (!gameStats) return

      const isT1 = Number(g.team1Tid) === Number(tid)
      const oppTid = isT1 ? g.team2Tid : g.team1Tid
      const oppName = teamLabel(dynasty, oppTid)
      const myScore = isT1 ? g.team1Score : g.team2Score
      const oppScore = isT1 ? g.team2Score : g.team1Score
      const isHome = Number(g.homeTeamTid) === Number(tid)
      const neutral = g.homeTeamTid == null
      const loc = neutral ? 'vs' : isHome ? 'vs' : '@'
      const wl = Number(myScore) > Number(oppScore) ? 'W' : Number(myScore) < Number(oppScore) ? 'L' : 'T'
      const weekStr = g.week ? `Wk ${g.week} ` : ''
      const statsStr = formatRawGameStats(gameStats)
      gameLogLines.push(`  - ${weekStr}${loc} ${oppName} (${wl} ${myScore}-${oppScore}): ${statsStr || '_(no countable stats)_'}`)
    })

    if (gameLogLines.length) {
      out.push(`**Game log:**`)
      gameLogLines.forEach(l => out.push(l))
    } else {
      out.push(`_(no box score data recorded)_`)
    }
  })

  // Depth reserves — compact single-line summary, no wasted token budget
  if (reservePlayers.length) {
    out.push(`\n---`)
    out.push(`**Reserve depth (no ${year} stats recorded):** ` +
      reservePlayers.map(p => {
        const ovr = getPlayerOverallForYear(p, year) || '—'
        const cls = getPlayerClassForYear(p, year) || '—'
        const dev = p.devTraitByYear?.[year] || p.devTraitByYear?.[String(year)] || p.devTrait || '—'
        const jersey = p.jerseyNumber ? `#${p.jerseyNumber} ` : ''
        return `${jersey}${p.name} (${cls}, OVR ${ovr}, ${dev})`
      }).join(' · ')
    )
  }

  return out.join('\n')
}

// ─── Free text ──────────────────────────────────────────────────────────────

export function resolveFreeText(value) {
  if (!value || !String(value).trim()) return null
  return `### Additional context from the dynasty owner\n${String(value).trim()}`
}
