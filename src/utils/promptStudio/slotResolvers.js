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
 *
 * Knob options supported:
 *   focus      — 'offense' | 'defense' | 'special-teams' | 'both-sides' | 'all-three-phases' | ...
 *   timeHorizon — 'this-season' | 'career' | 'last-3-games' | 'this-game' |
 *                 'vs-ranked' | 'vs-conference' | 'vs-noncon'
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

// The position picker offers umbrella groups (OL/DL/LB/DB) alongside
// specific positions, but players are stored under their specific slot
// (LT/LG/C/RG/RT, LE/RE/DT, LOLB/MLB/ROLB, CB/FS/SS, …). Map each picker
// value to the stored positions that belong to it so "OL" actually
// matches the offensive line (the position-group prompt was returning
// "no OLs" because it did an exact-string compare).
const POSITION_ALIASES = {
  QB: ['QB'],
  RB: ['RB', 'HB'],
  FB: ['FB'],
  WR: ['WR'],
  TE: ['TE'],
  OL: ['OL', 'LT', 'LG', 'C', 'RG', 'RT', 'OT', 'OG', 'G', 'T'],
  DL: ['DL', 'DE', 'LE', 'RE', 'DT', 'NT'],
  DE: ['DE', 'LE', 'RE'],
  DT: ['DT', 'NT'],
  LB: ['LB', 'OLB', 'ILB', 'MLB', 'LOLB', 'ROLB', 'SAM', 'MIKE', 'WILL'],
  OLB: ['OLB', 'LOLB', 'ROLB', 'SAM', 'WILL'],
  MLB: ['MLB', 'ILB', 'MIKE'],
  CB: ['CB'],
  S: ['S', 'FS', 'SS'],
  FS: ['FS'],
  SS: ['SS'],
  DB: ['DB', 'CB', 'S', 'FS', 'SS'],
  K: ['K'],
  P: ['P'],
  LS: ['LS'],
  KR: ['KR'],
  PR: ['PR'],
}

function positionMatches(playerPos, selected) {
  if (!playerPos || !selected) return false
  const pp = String(playerPos).toUpperCase().trim()
  const sel = String(selected).toUpperCase().trim()
  if (pp === sel) return true
  const members = POSITION_ALIASES[sel]
  return !!members && members.includes(pp)
}

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

// Game sort order that places postseason games after regular season weeks.
export function gameOrderKey(g) {
  const type = g.gameType || 'regular'
  if (type === 'conference_championship') return 200
  if (type === 'bowl')                    return 210
  if (type === 'cfp_first_round')         return 220
  if (type === 'cfp_quarterfinal')        return 230
  if (type === 'cfp_semifinal')           return 240
  if (type === 'cfp_championship')        return 250
  return Number(g.week) || 0
}

/**
 * Returns the set of stat categories to show for a given focus knob value.
 * null = show all categories (no filtering).
 */
function focusCats(focus) {
  switch (focus) {
    case 'offense':
      return new Set(['passing', 'rushing', 'receiving', 'blocking'])
    case 'defense':
      return new Set(['defense'])
    case 'special-teams':
      return new Set(['kicking', 'punting', 'kickReturn', 'puntReturn'])
    // both-sides, all-three-phases, personnel, scheme, game-plan → no category filtering
    default:
      return null
  }
}

/**
 * Filter a sorted game list by timeHorizon against a specific team (tid).
 * Handles vs-ranked, vs-conference, vs-noncon. All other horizons pass through.
 */
function filterGamesByHorizon(games, horizon, tid) {
  const tNum = Number(tid)
  switch (horizon) {
    case 'vs-ranked':
      return games.filter(g => {
        const isT1 = Number(g.team1Tid) === tNum
        const oppRank = isT1 ? g.team2Rank : g.team1Rank
        return oppRank != null && Number(oppRank) > 0
      })
    case 'vs-conference':
      return games.filter(g => g.isConferenceGame)
    case 'vs-noncon':
      return games.filter(g => {
        const type = g.gameType || 'regular'
        return !g.isConferenceGame && type === 'regular'
      })
    case 'last-3-games':
      return games.slice(-3)
    default:
      return games
  }
}

/**
 * Human-readable label for a timeHorizon value, used in headings.
 */
function horizonLabel(horizon) {
  switch (horizon) {
    case 'career':         return 'Career'
    case 'last-3-games':   return 'Last 3 games'
    case 'vs-ranked':      return 'Vs ranked opponents'
    case 'vs-conference':  return 'Conference games'
    case 'vs-noncon':      return 'Non-conference games'
    default:               return null // this-season: let caller use the year
  }
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
// Pass `focus` to suppress stat categories outside the knob's scope.
function formatRawGameStats(stats, focus) {
  const allowed = focusCats(focus)
  const parts = []

  if ((!allowed || allowed.has('passing')) && stats.passing) {
    const p = stats.passing
    const att = Number(p.attempts ?? p.att ?? 0)
    if (att > 0) {
      const cmp = Number(p.comp ?? p.cmp ?? 0)
      parts.push(`${cmp}/${att}, ${p.yards ?? 0} yds, ${p.tD ?? p.td ?? 0} TD, ${p.iNT ?? p.int ?? 0} INT`)
    }
  }
  if ((!allowed || allowed.has('rushing')) && stats.rushing) {
    const r = stats.rushing
    const car = Number(r.carries ?? 0)
    if (car > 0) parts.push(`Rush: ${car} car, ${r.yards ?? 0} yds, ${r.tD ?? r.td ?? 0} TD`)
  }
  if ((!allowed || allowed.has('receiving')) && stats.receiving) {
    const r = stats.receiving
    const rec = Number(r.receptions ?? r.rec ?? 0)
    if (rec > 0) parts.push(`Rec: ${rec} rec, ${r.yards ?? 0} yds, ${r.tD ?? r.td ?? 0} TD`)
  }
  if ((!allowed || allowed.has('defense')) && stats.defense) {
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
  if ((!allowed || allowed.has('kicking')) && stats.kicking) {
    const k = stats.kicking
    if (k.fGA) parts.push(`Kicking: ${k.fGM ?? 0}/${k.fGA} FG, ${k.xPM ?? 0}/${k.xPA ?? 0} XP`)
  }
  if ((!allowed || allowed.has('punting')) && stats.punting) {
    const p = stats.punting
    if (p.punts) parts.push(`Punting: ${p.punts} punts, ${p.yards ?? 0} yds`)
  }
  if ((!allowed || allowed.has('blocking')) && stats.blocking) {
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

// Format a stats object as bullet lines per category.
// Handles both internal field names (yds, car, soloTkl…) and raw box-score
// names (yards, carries, solo…) so it works for statsByYear and one-off blocks.
// Pass `focus` to suppress categories outside the knob's scope.
function formatStatBlock(stats, focus) {
  const allowed = focusCats(focus)
  const lines = []
  const cats = ['passing', 'rushing', 'receiving', 'defense', 'kicking', 'punting', 'kickReturn', 'puntReturn', 'blocking']
  for (const c of cats) {
    if (allowed && !allowed.has(c)) continue
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
      if (v.xpm != null) bits.push(`${v.xpm}/${v.xpa ?? 0} XP`)
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
      const yds = v.yds ?? v.yards; if (yds) bits.push(`${yds} yds`)
      if (v.td) bits.push(`${v.td} TD`)
    } else if (c === 'blocking') {
      if (v.pancakes) bits.push(`${v.pancakes} pancakes`)
      if (v.sacksAllowed) bits.push(`${v.sacksAllowed} sacks allowed`)
    }
    if (bits.length) lines.push(`  - ${c[0].toUpperCase()}${c.slice(1)}: ${bits.join(', ')}`)
  }
  return lines.length ? lines.join('\n') : '  _(no countable categories)_'
}

// ─── Game slot ──────────────────────────────────────────────────────────────

/**
 * Resolve a single game by id into a markdown block describing:
 *   - matchup line, scores, ranks, records entering, location
 *   - top box-score totals per team (passing / rushing / receiving leaders + key defense)
 *   - scoring summary (compressed)
 *   - aiRecap if present
 *
 * options.focus — suppresses box-score categories outside the focus knob's scope
 */
export function resolveGameSlot(dynasty, gameId, options = {}) {
  if (!gameId) return '_(no game selected)_'
  const game = safeArr(dynasty?.games).find(g => g.id === gameId)
  if (!game) return `_(game ${gameId} not found)_`

  const focus = options.focus
  const allowed = focusCats(focus)

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

  const homeTid = game.homeTeamTid != null ? Number(game.homeTeamTid) : null
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

  // Box score leaders — per team per category, filtered by focus
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
        const scored = arr.map(r => ({ r, s: fmt.score(r) }))
        scored.sort((a, b) => b.s - a.s)
        return scored[0]?.r
      }
      const fmt = {
        passing:   { score: r => Number(r.yards || r.yds || 0),   line: r => `${r.playerName || '?'} — ${r.comp || r.cmp || 0}/${r.attempts || r.att || 0}, ${r.yards || r.yds || 0} yds, ${r.tD || r.td || 0} TD, ${r.iNT || r.int || 0} INT` },
        rushing:   { score: r => Number(r.yards || r.yds || 0),   line: r => `${r.playerName || '?'} — ${r.carries || r.car || 0} car, ${r.yards || r.yds || 0} yds, ${r.tD || r.td || 0} TD` },
        receiving: { score: r => Number(r.yards || r.yds || 0),   line: r => `${r.playerName || '?'} — ${r.receptions || r.rec || 0} rec, ${r.yards || r.yds || 0} yds, ${r.tD || r.td || 0} TD` },
        defense:   { score: r => (Number(r.solo || 0) + Number(r.assists || 0)) + Number(r.sacks || 0) * 2 + Number(r.iNT || r.int || 0) * 2,
                     line: r => `${r.playerName || '?'} — ${(Number(r.solo) || 0) + (Number(r.assists) || 0)} tkl${r.sacks ? `, ${r.sacks} sk` : ''}${(r.iNT || r.int) ? `, ${r.iNT || r.int} INT` : ''}${r.tfl ? `, ${r.tfl} TFL` : ''}` },
        kicking:   { score: r => Number(r.fGM || 0) * 3 + Number(r.xPM || 0), line: r => `${r.playerName || '?'} — ${r.fGM ?? 0}/${r.fGA ?? 0} FG, ${r.xPM ?? 0}/${r.xPA ?? 0} XP` },
        punting:   { score: r => Number(r.yards || r.yds || 0),   line: r => `${r.playerName || '?'} — ${r.punts ?? 0} punts, ${r.yards || r.yds || 0} yds` },
      }
      if (!allowed || allowed.has('passing'))   { const t = topRow(teamBox.passing,   fmt.passing);   if (t) lines.push(`  - Passing: ${fmt.passing.line(t)}`) }
      if (!allowed || allowed.has('rushing'))   { const t = topRow(teamBox.rushing,   fmt.rushing);   if (t) lines.push(`  - Rushing: ${fmt.rushing.line(t)}`) }
      if (!allowed || allowed.has('receiving')) { const t = topRow(teamBox.receiving, fmt.receiving); if (t) lines.push(`  - Receiving: ${fmt.receiving.line(t)}`) }
      if (!allowed || allowed.has('defense'))   { const t = topRow(teamBox.defense,   fmt.defense);   if (t) lines.push(`  - Defense: ${fmt.defense.line(t)}`) }
      if (!allowed || allowed.has('kicking'))   { const t = topRow(teamBox.kicking,   fmt.kicking);   if (t) lines.push(`  - Kicking: ${fmt.kicking.line(t)}`) }
      if (!allowed || allowed.has('punting'))   { const t = topRow(teamBox.punting,   fmt.punting);   if (t) lines.push(`  - Punting: ${fmt.punting.line(t)}`) }
      if (lines.length > 1) out.push(lines.join('\n'))
    }
    renderTeamBox(t1Tid, t1)
    renderTeamBox(t2Tid, t2)
  }

  // Team-stat totals — filtered by focus
  if (game.team1Stats || game.team2Stats) {
    const offenseOnly = allowed && !allowed.has('passing') && !allowed.has('rushing')
    if (!offenseOnly) {
      out.push('\n**Team totals**')
      const teamRow = (label, stats) => {
        if (!stats) return null
        const bits = []
        if ((!allowed || allowed.has('rushing') || allowed.has('passing')) && stats.totalYards != null) bits.push(`${stats.totalYards} total yd`)
        if ((!allowed || allowed.has('rushing')) && stats.rushingYards != null) bits.push(`${stats.rushingYards} rush yd`)
        if ((!allowed || allowed.has('passing')) && stats.passingYards != null) bits.push(`${stats.passingYards} pass yd`)
        if (stats.turnovers != null) bits.push(`${stats.turnovers} TO`)
        if (stats.firstDowns != null) bits.push(`${stats.firstDowns} 1st downs`)
        return bits.length ? `  - ${label}: ${bits.join(', ')}` : null
      }
      const a = teamRow(t1, game.team1Stats)
      const b = teamRow(t2, game.team2Stats)
      if (a) out.push(a)
      if (b) out.push(b)
    }
  }

  // Scoring summary — compressed (only show if offense or all in scope)
  const showScoring = !allowed || allowed.has('passing') || allowed.has('rushing') || allowed.has('kicking')
  const scoring = safeArr(game.scoringSummary || game.boxScore?.scoringSummary)
  if (showScoring && scoring.length) {
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
 *
 * options.focus — suppresses categories that don't apply (minimal effect here)
 * options.horizon — 'vs-ranked' | 'vs-conference' | 'vs-noncon' filter recent games
 */
export function resolveTeamSlot(dynasty, tid, options = {}) {
  if (tid == null) return '_(no team selected)_'
  const tNum = Number(tid)
  const year = options.year ?? dynasty?.currentYear
  const horizon = options.horizon
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

  // Games for this year, filtered by horizon if specified
  const yearGames = safeArr(dynasty?.games)
    .filter(g => Number(g.team1Tid) === tNum || Number(g.team2Tid) === tNum)
    .filter(g => Number(g.year) === Number(year))
    .filter(g => g.team1Score != null && g.team2Score != null && (g.team1Score > 0 || g.team2Score > 0 || g.isPlayed))
    .sort((a, b) => gameOrderKey(a) - gameOrderKey(b))

  const filteredGames = filterGamesByHorizon(yearGames, horizon, tNum)
  const recent = recentN > 0 ? filteredGames.slice(-recentN) : []
  const horizonSuffix = horizonLabel(horizon) ? ` (${horizonLabel(horizon)})` : ` (year ${year})`

  if (recent.length) {
    out.push(`\n**Last ${recent.length} game(s)**${horizonSuffix}`)
    recent.forEach(g => {
      const isTeam1 = Number(g.team1Tid) === tNum
      const oppTid = isTeam1 ? Number(g.team2Tid) : Number(g.team1Tid)
      const oppName = teamLabel(dynasty, oppTid)
      const oppRank = isTeam1 ? g.team2Rank : g.team1Rank
      const oppLabel = oppRank ? `#${oppRank} ${oppName}` : oppName
      const us = isTeam1 ? g.team1Score : g.team2Score
      const them = isTeam1 ? g.team2Score : g.team1Score
      const result = us > them ? 'W' : us < them ? 'L' : 'T'
      const weekStr = g.week ? `Wk ${g.week} ` : ''
      out.push(`  - ${weekStr}${result} ${us}–${them} ${result === 'W' ? 'vs' : 'to'} ${oppLabel}`)
    })
  } else {
    out.push(`\n_(no completed games${horizonLabel(horizon) ? ` (${horizonLabel(horizon)})` : ''} in ${year})_`)
  }

  return out.join('\n')
}

// ─── Player slot ────────────────────────────────────────────────────────────

/**
 * Resolve a player by pid into a markdown block describing identity + stats.
 *
 * options.horizon controls which games/stat window to use:
 *   'this-season'   (default) — current year statsByYear entry
 *   'career'        — sum of all statsByYear entries across years
 *   'last-3-games'  — last 3 completed games this season
 *   'this-game'     — single game (options.gameId required)
 *   'vs-ranked'     — aggregate box-score stats from games vs ranked opponents
 *   'vs-conference' — aggregate box-score stats from conference games only
 *   'vs-noncon'     — aggregate box-score stats from non-conference games only
 *
 * options.focus controls which stat categories to display (see focusCats).
 */
export function resolvePlayerSlot(dynasty, pid, options = {}) {
  if (pid == null) return '_(no player selected)_'
  const player = safeArr(dynasty?.players).find(p => Number(p.pid) === Number(pid))
  if (!player) return `_(player ${pid} not found)_`

  const year = options.year ?? dynasty?.currentYear
  const horizon = options.horizon || 'this-season'
  const focus = options.focus

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

  // Base game list for box-score horizons (all year games with scores)
  const allYearGames = safeArr(dynasty?.games)
    .filter(g => Number(g.year) === Number(year))
    .filter(g => g.team1Score != null && g.team2Score != null)
    .sort((a, b) => gameOrderKey(a) - gameOrderKey(b))

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
      out.push(formatStatBlock(totals, focus))
    }

  } else if (horizon === 'this-game' && options.gameId) {
    const game = safeArr(dynasty?.games).find(g => g.id === options.gameId)
    if (!game) {
      out.push(`\n_(game ${options.gameId} not found)_`)
    } else {
      out.push(`\n**Stats in this game** (Wk ${game.week ?? '?'}, ${game.year ?? '?'})`)
      const totals = getPlayerBoxScoreTotals(player.name, [game], year, null)
      if (totals && Object.keys(totals).length) {
        out.push(formatStatBlock(totals, focus))
      } else {
        out.push('_(no stats recorded for this player in that game)_')
      }
    }

  } else if (horizon === 'last-3-games' || horizon === 'vs-ranked' || horizon === 'vs-conference' || horizon === 'vs-noncon') {
    const filteredGames = filterGamesByHorizon(allYearGames, horizon, teamTid)
    const label = horizonLabel(horizon) || 'filtered games'
    const totals = getPlayerBoxScoreTotals(player.name, filteredGames, year, null)
    out.push(`\n**Stats — ${label}** (${filteredGames.length} game(s), ${year})`)
    if (totals && Object.keys(totals).length) {
      out.push(formatStatBlock(totals, focus))
    } else {
      out.push(`_(no box-score stats in ${filteredGames.length} matched game(s))_`)
    }

  } else {
    // this-season (default)
    const stats = player.statsByYear?.[year] || player.statsByYear?.[String(year)] || null
    out.push(`\n**Stats (${year})**`)
    if (stats && Object.keys(stats).length) {
      out.push(formatStatBlock(stats, focus))
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

// ─── Year slot ──────────────────────────────────────────────────────────────

/**
 * Resolve a year into a markdown block describing dynasty state in that year.
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
 * Resolve a position+team+year combo into a markdown block with full player
 * detail: career arc, season totals, per-game log.
 *
 * options.horizon — filters the game log:
 *   'last-3-games'  — only the last 3 games
 *   'vs-ranked'     — only games vs ranked opponents
 *   'vs-conference' — only conference games
 *   'vs-noncon'     — only non-conference regular season games
 *   (default / 'this-season') — full season game log
 *
 * options.focus — suppresses stat categories outside the focus scope
 */
export function resolvePositionSlot(dynasty, position, options = {}) {
  if (!position) return '_(no position selected)_'
  const year = options.year ?? dynasty?.currentYear
  const tid = options.tid ?? dynasty?.currentTid
  const horizon = options.horizon
  const focus = options.focus
  if (tid == null) return '_(no team context)_'

  const yearNum = Number(year)
  const teamName = teamLabel(dynasty, tid)
  const hLabel = horizonLabel(horizon)
  const out = []
  out.push(`### Position group: ${position} — ${teamName} (${year})${hLabel ? ` [${hLabel}]` : ''}`)

  const players = getAllPlayers(dynasty) || []
  const groupPlayers = players
    .filter(p => isPlayerOnRoster(p, tid, year))
    .filter(p => positionMatches(getPlayerPositionForYear(p, year) || p.position, position))
    .sort((a, b) => (getPlayerOverallForYear(b, year) || 0) - (getPlayerOverallForYear(a, year) || 0))

  if (!groupPlayers.length) {
    out.push(`\n_(no ${position}s on the ${teamName} roster for ${year})_`)
    return out.join('\n')
  }

  // All played games for this year in chronological order, then filtered by horizon
  const yearGames = (dynasty?.games || [])
    .filter(g => Number(g.year) === yearNum)
    .filter(g => g.team1Score != null && g.team2Score != null && (g.team1Score > 0 || g.team2Score > 0 || g.isPlayed))
    .sort((a, b) => gameOrderKey(a) - gameOrderKey(b))

  const filteredGames = filterGamesByHorizon(yearGames, horizon, tid)

  // Split into active producers (have data in the filtered window) and depth reserves.
  const hasCurrentData = (p) => {
    const ss = p.statsByYear?.[year] || p.statsByYear?.[String(year)]
    if (ss && Object.keys(ss).length) return true
    return filteredGames.some(g => g.boxScore && !!extractPlayerFromBoxScore(g.boxScore, p.name))
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

    // Prior-year season totals (career arc) — up to 3 previous seasons
    const allStatYears = Object.keys(p.statsByYear || {})
      .map(Number).filter(Number.isFinite)
      .filter(y => y < yearNum)
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
          out.push(formatStatBlock(ps, focus))
        }
      })
    }

    // Current-year season totals (always from full season, regardless of horizon)
    const seasonStats = p.statsByYear?.[year] || p.statsByYear?.[String(year)]
    if (seasonStats && Object.keys(seasonStats).length) {
      out.push(`**${year} season totals:**`)
      out.push(formatStatBlock(seasonStats, focus))
    } else {
      out.push(`_(no ${year} season stats recorded)_`)
    }

    // Game log filtered by horizon
    const gameLogLines = []
    filteredGames.forEach(g => {
      if (!g.boxScore) return
      const gameStats = extractPlayerFromBoxScore(g.boxScore, p.name)
      if (!gameStats) return

      const isT1 = Number(g.team1Tid) === Number(tid)
      const oppTid = isT1 ? g.team2Tid : g.team1Tid
      const oppName = teamLabel(dynasty, oppTid)
      const oppRank = isT1 ? g.team2Rank : g.team1Rank
      const oppLabel = oppRank ? `#${oppRank} ${oppName}` : oppName
      const myScore = isT1 ? g.team1Score : g.team2Score
      const oppScore = isT1 ? g.team2Score : g.team1Score
      const isHome = Number(g.homeTeamTid) === Number(tid)
      const neutral = g.homeTeamTid == null
      const loc = neutral ? 'vs' : isHome ? 'vs' : '@'
      const wl = Number(myScore) > Number(oppScore) ? 'W' : Number(myScore) < Number(oppScore) ? 'L' : 'T'
      const weekStr = g.week ? `Wk ${g.week} ` : ''
      const statsStr = formatRawGameStats(gameStats, focus)
      gameLogLines.push(`  - ${weekStr}${loc} ${oppLabel} (${wl} ${myScore}-${oppScore}): ${statsStr || '_(no countable stats)_'}`)
    })

    const logLabel = hLabel ? `Game log (${hLabel}):` : 'Game log:'
    if (gameLogLines.length) {
      out.push(`**${logLabel}**`)
      gameLogLines.forEach(l => out.push(l))
    } else {
      out.push(`_(no box score data${hLabel ? ` for ${hLabel}` : ''})_`)
    }
  })

  // Depth reserves — compact single-line summary
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
