/**
 * Card prompt variable resolver.
 *
 * Given (player, dynasty, card), produce a flat key → string map that's
 * substituted into every {{variable}} placeholder in the style's front /
 * back prompt before the user copies it. This is what makes one prompt
 * template work for any player, in any year, in any context.
 *
 * Variable surface:
 *
 *   Identity              — name, firstName, lastName, position, positionFull,
 *                           jersey, number, class, height, weight, hometown,
 *                           state, archetype, devTrait, stars, recruitingRank
 *
 *   Team                  — school, teamFull, teamColor, teamSecondaryColor,
 *                           teamLogoUrl, teamMascot
 *
 *   Season                — year, statsLine, recordLine, ranking
 *
 *   Context (varies)      — contextLabel, opponent, opponentLogoUrl, score,
 *                           result, week, awardName, championshipName,
 *                           customLabel
 *
 *   Bio                   — bioText (auto-built one-liner pulling the most
 *                           noteworthy data points for that year)
 *
 * If a variable is not resolvable for the given context, it falls back to
 * an empty string. The interpolator collapses any `{{var}}` that lands on
 * an empty value so prompts don't end up with literal "{{score}}" text.
 */

import { stripMascotFromName } from '../data/teams'
import { TEAMS } from '../data/teamRegistry'
import { detectGameType, GAME_TYPES, getTeamRanking, calculateTeamRecordFromGames } from '../context/DynastyContext'
import { WEEKLY_AWARDS } from '../data/cardStyles'
import { formatScoreHighLow } from './scoreFormat'

// Award keys → human display name. Mirrors the labels the player profile
// surfaces so the prompt language reads consistently across the app.
const AWARD_NAMES = {
  heisman: 'Heisman Trophy',
  maxwell: 'Maxwell Award',
  walterCamp: 'Walter Camp Award',
  daveyObrien: "Davey O'Brien Award",
  chuckBednarik: 'Chuck Bednarik Award',
  broncoNagurski: 'Bronko Nagurski Trophy',
  jimThorpe: 'Jim Thorpe Award',
  doakWalker: 'Doak Walker Award',
  fredBiletnikoff: 'Fred Biletnikoff Award',
  lombardi: 'Lombardi Award',
  unitasGoldenArm: 'Unitas Golden Arm Award',
  edgeRusherOfTheYear: 'Edge Rusher of the Year',
  outland: 'Outland Trophy',
  johnMackey: 'John Mackey Award',
  dickButkus: 'Dick Butkus Award',
  rimington: 'Rimington Trophy',
  louGroza: 'Lou Groza Award',
  rayGuy: 'Ray Guy Award',
  returnerOfTheYear: 'Returner of the Year',
}

const POSITION_FULL = {
  QB: 'Quarterback',
  HB: 'Running Back', RB: 'Running Back', FB: 'Fullback',
  WR: 'Wide Receiver', TE: 'Tight End',
  LT: 'Left Tackle', LG: 'Left Guard', C: 'Center', RG: 'Right Guard', RT: 'Right Tackle',
  LEDG: 'Edge Rusher', REDG: 'Edge Rusher', EDGE: 'Edge Rusher', DT: 'Defensive Tackle',
  SAM: 'Outside Linebacker', MIKE: 'Middle Linebacker', WILL: 'Outside Linebacker', LB: 'Linebacker',
  CB: 'Cornerback', FS: 'Free Safety', SS: 'Strong Safety', S: 'Safety',
  K: 'Kicker', P: 'Punter',
}

function emptyToBlank(v) {
  return v == null || v === '' ? '' : String(v)
}

/**
 * Same name normalization the box-score aggregator uses — case-insensitive,
 * collapses whitespace. Player names in box scores often look slightly
 * different from `player.name` (e.g. "T. Smith" vs "Tyler Smith"), so we
 * also expose a fallback that matches on last name + first initial.
 */
function normalizeName(name) {
  if (!name) return ''
  return String(name).toLowerCase().trim().replace(/\s+/g, ' ')
}

function namesMatch(boxName, playerName) {
  if (!boxName || !playerName) return false
  const a = normalizeName(boxName)
  const b = normalizeName(playerName)
  if (a === b) return true
  // "T. Smith" / "T Smith" → match against "Tyler Smith"
  const aParts = a.split(' ')
  const bParts = b.split(' ')
  if (aParts.length >= 2 && bParts.length >= 2) {
    const aLast = aParts[aParts.length - 1]
    const bLast = bParts[bParts.length - 1]
    if (aLast === bLast) {
      const aFirst = aParts[0].replace('.', '')
      const bFirst = bParts[0].replace('.', '')
      // First-initial match when one side is abbreviated.
      if (aFirst[0] === bFirst[0]) return true
    }
  }
  return false
}

/**
 * Find the player's per-game stats inside a game's box score and format
 * them as a single human-readable line ("Passing: 28/40, 312 yds, 4 TD •
 * Rushing: 6 car, 24 yds, 1 TD"). Returns '' when the player isn't found
 * in the box score (older games without box-score data, walk-on with no
 * recorded stats, etc.).
 */
function buildPlayerGameStatsLine(player, game) {
  if (!player?.name || !game?.boxScore) return ''

  const categories = ['passing', 'rushing', 'receiving', 'blocking', 'defense', 'kicking', 'punting', 'kickReturn', 'puntReturn']
  let found = null

  for (const side of ['home', 'away']) {
    const sideBoxScore = game.boxScore[side]
    if (!sideBoxScore) continue
    const collected = {}
    for (const cat of categories) {
      const list = sideBoxScore[cat]
      if (!Array.isArray(list)) continue
      const row = list.find(r => namesMatch(r?.playerName, player.name))
      if (row) collected[cat] = row
    }
    if (Object.keys(collected).length > 0) {
      found = collected
      break
    }
  }

  if (!found) return ''

  const num = (v) => Number(v) || 0
  const has = (v) => Number(v) > 0
  const parts = []

  if (found.passing) {
    const p = found.passing
    if (has(p.attempts) || has(p.yards) || has(p.tD) || has(p.comp)) {
      const sub = [`${num(p.comp)}/${num(p.attempts)}`, `${num(p.yards)} yds`, `${num(p.tD)} TD`]
      if (p.iNT != null) sub.push(`${num(p.iNT)} INT`)
      if (has(p.long)) sub.push(`${num(p.long)} long`)
      if (has(p.sacks)) sub.push(`${num(p.sacks)} sacks taken`)
      parts.push(`Passing: ${sub.join(', ')}`)
    }
  }
  if (found.rushing) {
    const r = found.rushing
    if (has(r.carries) || has(r.yards) || has(r.tD)) {
      const sub = [`${num(r.carries)} car`, `${num(r.yards)} yds`, `${num(r.tD)} TD`]
      if (has(r.long)) sub.push(`${num(r.long)} long`)
      if (has(r['20+'])) sub.push(`${num(r['20+'])} 20+`)
      if (has(r.brokenTackles)) sub.push(`${num(r.brokenTackles)} BT`)
      if (has(r.yAC)) sub.push(`${num(r.yAC)} YAC`)
      if (has(r.fumbles)) sub.push(`${num(r.fumbles)} fum`)
      parts.push(`Rushing: ${sub.join(', ')}`)
    }
  }
  if (found.receiving) {
    const c = found.receiving
    if (has(c.receptions) || has(c.yards) || has(c.tD)) {
      const sub = [`${num(c.receptions)} rec`, `${num(c.yards)} yds`, `${num(c.tD)} TD`]
      if (has(c.long)) sub.push(`${num(c.long)} long`)
      if (has(c.rAC)) sub.push(`${num(c.rAC)} RAC`)
      if (has(c.drops)) sub.push(`${num(c.drops)} drops`)
      parts.push(`Receiving: ${sub.join(', ')}`)
    }
  }
  if (found.blocking) {
    const b = found.blocking
    if (has(b.pancakes) || has(b.sacksAllowed)) {
      const sub = []
      if (has(b.pancakes)) sub.push(`${num(b.pancakes)} pancakes`)
      if (has(b.sacksAllowed)) sub.push(`${num(b.sacksAllowed)} sacks allowed`)
      parts.push(`Blocking: ${sub.join(', ')}`)
    }
  }
  if (found.defense) {
    const d = found.defense
    const tackles = num(d.solo) + num(d.assists)
    const sub = []
    if (tackles > 0) sub.push(`${tackles} tkl (${num(d.solo)} solo, ${num(d.assists)} ast)`)
    if (has(d.tFL)) sub.push(`${num(d.tFL)} TFL`)
    if (has(d.sack)) sub.push(`${num(d.sack)} sk`)
    if (has(d.iNT)) sub.push(`${num(d.iNT)} INT`)
    if (has(d.iNTYards)) sub.push(`${num(d.iNTYards)} INT yds`)
    if (has(d.tD)) sub.push(`${num(d.tD)} def TD`)
    if (has(d.deflections)) sub.push(`${num(d.deflections)} PD`)
    if (has(d.fF)) sub.push(`${num(d.fF)} FF`)
    if (has(d.fR)) sub.push(`${num(d.fR)} FR`)
    if (sub.length) parts.push(`Defense: ${sub.join(', ')}`)
  }
  if (found.kicking) {
    const k = found.kicking
    const sub = []
    if (has(k.fGA)) sub.push(`${num(k.fGM)}/${num(k.fGA)} FG`)
    if (has(k.xPA)) sub.push(`${num(k.xPM)}/${num(k.xPA)} XP`)
    if (has(k.fGLong)) sub.push(`${num(k.fGLong)} long`)
    if (has(k.fGBlock) || has(k.xPB)) sub.push(`${num(k.fGBlock) + num(k.xPB)} blocked`)
    if (sub.length) parts.push(`Kicking: ${sub.join(', ')}`)
  }
  if (found.punting) {
    const pu = found.punting
    if (has(pu.punts)) {
      const sub = [`${num(pu.punts)} punts`, `${num(pu.yards)} yds`]
      if (num(pu.punts) > 0) sub.push(`${(num(pu.yards) / num(pu.punts)).toFixed(1)} avg`)
      if (has(pu.long)) sub.push(`${num(pu.long)} long`)
      if (has(pu.in20)) sub.push(`${num(pu.in20)} IN20`)
      if (has(pu.tB)) sub.push(`${num(pu.tB)} TB`)
      parts.push(`Punting: ${sub.join(', ')}`)
    }
  }
  if (found.kickReturn) {
    const kr = found.kickReturn
    if (has(kr.kR)) {
      const sub = [`${num(kr.kR)} ret`, `${num(kr.yards)} yds`]
      if (has(kr.tD)) sub.push(`${num(kr.tD)} TD`)
      if (has(kr.long)) sub.push(`${num(kr.long)} long`)
      parts.push(`KR: ${sub.join(', ')}`)
    }
  }
  if (found.puntReturn) {
    const pr = found.puntReturn
    if (has(pr.pR)) {
      const sub = [`${num(pr.pR)} ret`, `${num(pr.yards)} yds`]
      if (has(pr.tD)) sub.push(`${num(pr.tD)} TD`)
      if (has(pr.long)) sub.push(`${num(pr.long)} long`)
      parts.push(`PR: ${sub.join(', ')}`)
    }
  }

  return parts.join(' • ')
}

/**
 * Determine which team a player was on for a given year — same resolution
 * the rest of the app uses (stint-based teamHistory[] first, then
 * teamsByYear[] fallback).
 */
function resolveTeamForYear(player, year) {
  if (!player || !year) return null
  const yr = Number(year)
  if (Array.isArray(player.teamHistory) && player.teamHistory.length > 0) {
    for (const stint of player.teamHistory) {
      const from = Number(stint.fromYear)
      const to = stint.toYear == null ? Infinity : Number(stint.toYear)
      if (yr >= from && yr <= to) return Number(stint.teamTid)
    }
  }
  if (player.teamsByYear) {
    const t = player.teamsByYear[yr] ?? player.teamsByYear[String(yr)]
    if (t != null) return Number(t)
  }
  return null
}

/**
 * Build a one-line bio sentence for a player + year — used as {{bioText}}
 * when the prompt template wants prose rather than a stat dump. Keeps it
 * short (one sentence) so it slots naturally into a card-back layout.
 */
function buildBioText({ player, position, school, year, statsLine, recordLine, contextLabel, seasonInProgress }) {
  const parts = []
  if (player.classByYear?.[year] || player.year) {
    const cls = player.classByYear?.[year] || player.year
    parts.push(`${cls} ${POSITION_FULL[position] || position}`)
  } else if (position) {
    parts.push(POSITION_FULL[position] || position)
  }
  if (school) parts.push(`at ${school}`)
  if (statsLine) parts.push(seasonInProgress ? `Through this point: ${statsLine}` : `Posted ${statsLine}`)
  if (recordLine) parts.push(`(${recordLine})`)
  if (contextLabel) parts.push(`— ${contextLabel}`)
  return parts.join(' ')
}

/**
 * Build a comprehensive stats-line for the year. Pulls EVERY stat we
 * actually store on player.statsByYear so the model has the full
 * picture instead of one cherry-picked number. Field names match the
 * INTERNAL format written by BOXSCORE_TO_INTERNAL_MAP in DynastyContext
 * (e.g. defense uses soloTkl/astTkl/tfl/sacks/int/intYds/pd/td/ff/fr).
 * Returns '' when the player has no stat data for that year.
 */
function buildStatsLine(player, year) {
  if (!player?.statsByYear || !year) return ''
  const yearStats = player.statsByYear[year] || player.statsByYear[String(year)]
  if (!yearStats) return ''

  const num = (v) => Number(v) || 0
  const has = (v) => Number(v) > 0
  const parts = []

  // Passing
  const p = yearStats.passing
  if (p && (has(p.yds) || has(p.td) || has(p.cmp) || has(p.att))) {
    const sub = []
    sub.push(`${num(p.cmp)}/${num(p.att)}`)
    sub.push(`${num(p.yds)} yds`)
    sub.push(`${num(p.td)} TD`)
    if (p.int != null) sub.push(`${num(p.int)} INT`)
    if (has(p.lng)) sub.push(`${num(p.lng)} long`)
    if (has(p.sacks)) sub.push(`${num(p.sacks)} sacks taken`)
    parts.push(`Passing: ${sub.join(', ')}`)
  }

  // Rushing
  const r = yearStats.rushing
  if (r && (has(r.yds) || has(r.td) || has(r.car))) {
    const sub = []
    sub.push(`${num(r.car)} car`)
    sub.push(`${num(r.yds)} yds`)
    sub.push(`${num(r.td)} TD`)
    if (has(r.lng)) sub.push(`${num(r.lng)} long`)
    if (has(r.twentyPlus)) sub.push(`${num(r.twentyPlus)} 20+`)
    if (has(r.bt)) sub.push(`${num(r.bt)} BT`)
    if (has(r.yac)) sub.push(`${num(r.yac)} YAC`)
    if (has(r.fum)) sub.push(`${num(r.fum)} fum`)
    parts.push(`Rushing: ${sub.join(', ')}`)
  }

  // Receiving
  const c = yearStats.receiving
  if (c && (has(c.yds) || has(c.td) || has(c.rec))) {
    const sub = []
    sub.push(`${num(c.rec)} rec`)
    sub.push(`${num(c.yds)} yds`)
    sub.push(`${num(c.td)} TD`)
    if (has(c.lng)) sub.push(`${num(c.lng)} long`)
    if (has(c.rac)) sub.push(`${num(c.rac)} RAC`)
    if (has(c.drops)) sub.push(`${num(c.drops)} drops`)
    parts.push(`Receiving: ${sub.join(', ')}`)
  }

  // Defense
  const d = yearStats.defense
  if (d) {
    const tot = num(d.soloTkl) + num(d.astTkl)
    const sub = []
    if (tot > 0) sub.push(`${tot} tkl (${num(d.soloTkl)} solo, ${num(d.astTkl)} ast)`)
    if (has(d.tfl)) sub.push(`${num(d.tfl)} TFL`)
    if (has(d.sacks)) sub.push(`${num(d.sacks)} sk`)
    if (has(d.int)) sub.push(`${num(d.int)} INT`)
    if (has(d.intYds)) sub.push(`${num(d.intYds)} INT yds`)
    if (has(d.td)) sub.push(`${num(d.td)} def TD`)
    if (has(d.pd)) sub.push(`${num(d.pd)} PD`)
    if (has(d.ff)) sub.push(`${num(d.ff)} FF`)
    if (has(d.fr)) sub.push(`${num(d.fr)} FR`)
    if (sub.length) parts.push(`Defense: ${sub.join(', ')}`)
  }

  // Blocking (OL)
  const b = yearStats.blocking
  if (b && (has(b.pancakes) || has(b.sacksAllowed))) {
    const sub = []
    if (has(b.pancakes)) sub.push(`${num(b.pancakes)} pancakes`)
    if (has(b.sacksAllowed)) sub.push(`${num(b.sacksAllowed)} sacks allowed`)
    parts.push(`Blocking: ${sub.join(', ')}`)
  }

  // Kicking
  const k = yearStats.kicking
  if (k && (has(k.fga) || has(k.xpa))) {
    const sub = []
    if (has(k.fga)) sub.push(`${num(k.fgm)}/${num(k.fga)} FG`)
    if (has(k.xpa)) sub.push(`${num(k.xpm)}/${num(k.xpa)} XP`)
    if (has(k.lng)) sub.push(`${num(k.lng)} long`)
    if (has(k.fgb) || has(k.xpb)) sub.push(`${num(k.fgb) + num(k.xpb)} blocked`)
    parts.push(`Kicking: ${sub.join(', ')}`)
  }

  // Punting
  const pu = yearStats.punting
  if (pu && has(pu.punts)) {
    const sub = [`${num(pu.punts)} punts`, `${num(pu.yds)} yds`]
    if (num(pu.punts) > 0) sub.push(`${(num(pu.yds) / num(pu.punts)).toFixed(1)} avg`)
    if (has(pu.lng)) sub.push(`${num(pu.lng)} long`)
    if (has(pu.in20)) sub.push(`${num(pu.in20)} IN20`)
    if (has(pu.tb)) sub.push(`${num(pu.tb)} TB`)
    parts.push(`Punting: ${sub.join(', ')}`)
  }

  // Returns
  const kr = yearStats.kickReturn
  if (kr && has(kr.ret)) {
    const sub = [`${num(kr.ret)} ret`, `${num(kr.yds)} yds`]
    if (has(kr.td)) sub.push(`${num(kr.td)} TD`)
    if (has(kr.lng)) sub.push(`${num(kr.lng)} long`)
    parts.push(`KR: ${sub.join(', ')}`)
  }
  const pr = yearStats.puntReturn
  if (pr && has(pr.ret)) {
    const sub = [`${num(pr.ret)} ret`, `${num(pr.yds)} yds`]
    if (has(pr.td)) sub.push(`${num(pr.td)} TD`)
    if (has(pr.lng)) sub.push(`${num(pr.lng)} long`)
    parts.push(`PR: ${sub.join(', ')}`)
  }

  return parts.join(' • ')
}

/**
 * Build a multi-line year-by-year career stats table for the player.
 * One row per year that has stats, formatted like:
 *   `2028 (Sophomore): 13 GP, 290/410, 3800 yds, 32 TD`
 * Returns '' if the player has no stat data at all.
 * @param {object} player
 * @param {Record<number,number>} gpByYear - games played per year (optional)
 */
function buildCareerStatsTable(player, gpByYear = {}) {
  if (!player?.statsByYear) return ''
  const years = Object.keys(player.statsByYear)
    .map(Number)
    .filter(n => Number.isFinite(n) && n > 0)
    .sort((a, b) => a - b)
  if (years.length === 0) return ''

  const rows = []
  for (const yr of years) {
    const line = buildStatsLine(player, yr)
    if (!line) continue
    const cls = player.classByYear?.[yr] || player.classByYear?.[String(yr)] || ''
    const gp = gpByYear[yr] != null ? `${gpByYear[yr]} GP, ` : ''
    rows.push(cls ? `${yr} (${cls}): ${gp}${line}` : `${yr}: ${gp}${line}`)
  }
  return rows.join('\n')
}

/**
 * "2027–2030" style label of the career span. Single year if only one.
 */
function buildCareerYearsLine(player) {
  if (!player?.statsByYear) return ''
  const years = Object.keys(player.statsByYear)
    .map(Number)
    .filter(n => Number.isFinite(n) && n > 0)
    .sort((a, b) => a - b)
  if (years.length === 0) return ''
  if (years.length === 1) return String(years[0])
  return `${years[0]}–${years[years.length - 1]}`
}

/**
 * Build the context-aware data block that drives back-of-card content.
 * The interpolator drops this whole multi-line block in wherever the
 * back template references {{contextStatBlock}}. The block itself
 * contains an INSTRUCTION line so the AI knows how to render it
 * relative to the design language elsewhere in the prompt.
 *
 * - season       → highlight year + full year-by-year career table
 * - game         → strict single-game line, no season/career content
 * - rookie       → recruiting profile + rookie-year stats only
 * - championship → title-year stats + championship name
 * - award        → award-year stats + award name
 * - custom       → user theme + selected-year stats
 */
function buildContextStatBlock({
  ctx, year, name, school, position, positionFull, cls,
  height, weight, hometown, stars, recruitingRank,
  statsLine, recordLine, ranking,
  careerYearsLine, careerStatsTable,
  opponent, score, result, week, contextLabel,
  awardName, championshipName, customLabel,
  weeklyAwardName, gameStatsLine,
  seasonInProgress, seasonProgressNote,
}) {
  const lines = []
  const push = (s) => { if (s != null) lines.push(s) }

  // Wording instruction added to every non-game context when the card's
  // year is the in-progress season. Tells the AI to phrase numbers as
  // "through this point" rather than as completed-season totals.
  const throughLabel = seasonProgressNote && seasonProgressNote.includes('Week')
    ? seasonProgressNote.replace(/^IN PROGRESS — through /i, '').replace(/ of \d+$/, '')
    : 'this point in the season'
  const inProgressGuidance = seasonInProgress
    ? `  • SEASON-IN-PROGRESS — the ${year} season is currently being played${seasonProgressNote ? ` (${seasonProgressNote.toLowerCase()})` : ''}. Word the bio and any narrative as ONGOING, not completed. Use phrasing like "through ${throughLabel}", "currently leads the team in…", ${recordLine ? `"the team is currently ${recordLine}"` : '"the team is in the middle of its season"'}. DO NOT say "${school || 'the team'} went ${recordLine || 'X-Y'}", "posted N yards", "finished with…", "${year} totals", or anything that frames the season as complete.`
    : ''

  // Shared "vitals strip" — height/weight/hometown/class — so each
  // context can include the same condensed identity line a real card
  // header carries.
  const vitalsParts = []
  if (height) vitalsParts.push(height)
  if (weight) vitalsParts.push(`${weight} lbs`)
  if (cls) vitalsParts.push(cls)
  if (hometown) vitalsParts.push(hometown)
  const vitals = vitalsParts.join(' · ')

  // Identity header used at the top of every context block.
  const idLine = `${name}${positionFull ? `  ·  ${positionFull}` : (position ? `  ·  ${position}` : '')}${school ? `  ·  ${school}` : ''}${year ? `  ·  ${year}` : ''}`

  if (ctx === 'game') {
    push(weeklyAwardName
      ? `CARD TYPE: Player of the Week commemorative (${weeklyAwardName})`
      : `CARD TYPE: Single-game memento — strict, this one game only`)
    push('')
    push('PLAYER:')
    push(`  ${idLine}`)
    if (vitals) push(`  ${vitals}`)
    push('')
    push('THE GAME:')
    if (week) push(`  Week ${week}`)
    if (contextLabel) push(`  ${contextLabel}`)
    if (score) push(`  Final: ${school || 'Team'} ${score.split('-')[0]}, ${opponent || 'Opponent'} ${score.split('-')[1] || ''}${result ? ` (${result === 'W' ? 'Win' : 'Loss'})` : ''}`)
    if (gameStatsLine) {
      push('')
      push(`${name}'s box-score line:`)
      // Each "category: stats" pair is already pipe-separated (" • ");
      // expose them as discrete data points so the AI lays them out as a
      // tight stat strip rather than copying the bulleted list verbatim.
      for (const part of gameStatsLine.split(' • ')) {
        push(`  ${part}`)
      }
    }
    push('')
    push('HOW TO RENDER THIS DATA ON THE BACK:')
    if (weeklyAwardName) {
      push(`  • The "${weeklyAwardName}" honor is the headline of the back — render it large and prominent (era-appropriate badge/seal/banner styling).`)
    }
    push('  • Render the box-score line as a TIGHT STAT PANEL the way real cards do — a small tabular block (column headers across the top, one row of numbers beneath), or a single inline ribbon ("33/37 · 431 YDS · 7 TD"). NOT a vertical list of "Passing: X / Rushing: Y" labeled rows.')
    push('  • The matchup goes in a small game-info ribbon or strip, NOT as a stack of separate "WEEK / GAME / FINAL / RESULT" labeled rows.')
    push(`  • A 1-2 sentence factual recap is fine; longer is not. Do NOT pad with phrases like "carved up", "controlled the game throughout", "dominant performance".`)
    push('  • DO NOT include season totals, career stats, year-by-year tables, or any other game.')
    if (!gameStatsLine) {
      push('  • No box-score data is on file for this game — render only the matchup ribbon. Do NOT invent statistics.')
    }
    return lines.join('\n')
  }

  if (ctx === 'rookie') {
    push('CARD TYPE: Rookie / debut card — first season at the school')
    push('')
    push('PLAYER:')
    push(`  ${idLine}`)
    if (vitals) push(`  ${vitals}`)
    if (stars) push(`  Recruiting: ${stars}-star${recruitingRank ? `, national ${recruitingRank}` : ''}`)
    push('')
    push(`${year} ROOKIE SEASON${seasonInProgress ? ' (in progress)' : ''}:`)
    if (seasonProgressNote) push(`  ${seasonProgressNote}`)
    if (statsLine) push(`  Stat line: ${statsLine}`)
    if (recordLine) push(`  Team record: ${recordLine}`)
    if (ranking) push(`  Team ranking: ${ranking}`)
    push('')
    push('HOW TO RENDER THIS DATA ON THE BACK:')
    push('  • This is a debut/rookie card — content is the recruiting profile + the rookie-year stats only. No later years exist from this card\'s perspective.')
    push('  • Render the rookie-season stats as a small tabular block (column headers + one row of numbers), the way the brand\'s actual rookie cards from this era did.')
    push('  • A short scouting-style bio (2-3 sentences) is appropriate. Keep it factual; do NOT pad with generic AI prose.')
    if (inProgressGuidance) push(inProgressGuidance)
    return lines.join('\n')
  }

  if (ctx === 'championship') {
    push(`CARD TYPE: ${championshipName || 'Championship'} commemorative`)
    push('')
    push('PLAYER:')
    push(`  ${idLine}`)
    if (vitals) push(`  ${vitals}`)
    push('')
    push(`${year} SEASON${seasonInProgress ? ' (in progress)' : ''}:`)
    if (seasonProgressNote) push(`  ${seasonProgressNote}`)
    if (statsLine) push(`  Stat line: ${statsLine}`)
    if (recordLine) push(`  Team record: ${recordLine}`)
    if (ranking) push(`  Team ranking: ${ranking}`)
    push('')
    push('HOW TO RENDER THIS DATA ON THE BACK:')
    push(`  • The "${championshipName || 'championship'}" title is the visual headline of the back — render it large/prominent in era-appropriate styling.`)
    push(`  • Render the ${year} season stats as a small tabular block (column headers + one row of numbers).`)
    push(`  • A 2-3 sentence factual narrative tying the player to the title run is appropriate.`)
    push('  • Do NOT include other-year stats.')
    if (inProgressGuidance) push(inProgressGuidance)
    return lines.join('\n')
  }

  if (ctx === 'award') {
    push(`CARD TYPE: ${awardName || 'Award'} commemorative`)
    push('')
    push('PLAYER:')
    push(`  ${idLine}`)
    if (vitals) push(`  ${vitals}`)
    push('')
    push(`${year} (AWARD-WINNING) SEASON${seasonInProgress ? ' (in progress)' : ''}:`)
    if (seasonProgressNote) push(`  ${seasonProgressNote}`)
    if (statsLine) push(`  Stat line: ${statsLine}`)
    if (recordLine) push(`  Team record: ${recordLine}`)
    push('')
    push('HOW TO RENDER THIS DATA ON THE BACK:')
    push(`  • The "${awardName || 'award'}" name is the visual headline — render it large/prominent in era-appropriate styling (trophy, seal, ribbon).`)
    push(`  • Render the ${year} season stats as a small tabular block — these are the numbers that earned the honor.`)
    push('  • A 2-3 sentence factual narrative on the case for the award is appropriate.')
    push('  • Do NOT include other-year stats.')
    if (inProgressGuidance) push(inProgressGuidance)
    return lines.join('\n')
  }

  if (ctx === 'custom') {
    push(`CARD TYPE: Custom — "${customLabel || 'Custom'}"`)
    push('')
    push('PLAYER:')
    push(`  ${idLine}`)
    if (vitals) push(`  ${vitals}`)
    push('')
    push(`${year} STATS${seasonInProgress ? ' (in progress)' : ''}:`)
    if (seasonProgressNote) push(`  ${seasonProgressNote}`)
    if (statsLine) push(`  Stat line: ${statsLine}`)
    if (recordLine) push(`  Team record: ${recordLine}`)
    push('')
    push('HOW TO RENDER THIS DATA ON THE BACK:')
    push(`  • Render the back around the user-supplied theme: "${customLabel || ''}".`)
    push('  • Use only the data above — do NOT invent additional achievements.')
    if (inProgressGuidance) push(inProgressGuidance)
    return lines.join('\n')
  }

  // ── Default: 'season' — highlight selected year, render full career
  // table the way the brand's real backs did.
  push('CARD TYPE: Season card — highlight one year, show the full career')
  push('')
  push('PLAYER:')
  push(`  ${idLine}`)
  if (vitals) push(`  ${vitals}`)
  push('')
  push(`HIGHLIGHT SEASON — ${year}${seasonInProgress ? ' (in progress)' : ''}:`)
  if (seasonProgressNote) push(`  ${seasonProgressNote}`)
  if (statsLine) push(`  Stat line: ${statsLine}`)
  if (recordLine) push(`  Team record: ${recordLine}`)
  if (ranking) push(`  Team ranking: ${ranking}`)
  if (careerStatsTable) {
    push('')
    push(`CAREER (${careerYearsLine || ''}) — render as a multi-row stat TABLE on the back${seasonInProgress ? ` (the ${year} row is partial — through this point in the season)` : ''}:`)
    push('')
    push('  Year   Class   Stat line')
    push('  ────   ─────   ──────────────────────────────────────────────')
    for (const row of careerStatsTable.split('\n')) {
      // careerStatsTable rows look like "2028 (SO): 290/410, 3800 yds, 32 TD, 9 INT".
      // Re-emit them in column-aligned form so the AI sees an actual table.
      const m = row.match(/^(\d{4})\s*(?:\(([^)]+)\))?\s*:\s*(.*)$/)
      if (m) {
        const [, yr, classToken = '', statLine = ''] = m
        const partialMarker = seasonInProgress && yr === String(year) ? ' *' : ''
        push(`  ${yr.padEnd(6)} ${(classToken || '').padEnd(7)} ${statLine}${partialMarker}`)
      } else {
        push(`  ${row}`)
      }
    }
    if (seasonInProgress) push('  (* = season still in progress; numbers are through-this-point partials, not final season totals)')
  }
  push('')
  push('HOW TO RENDER THIS DATA ON THE BACK:')
  push(`  • Render the career data as a multi-column STAT TABLE the way ${school ? school + "'s era of " : ''}real production cards did — column headers across the top (Year, GP, and the position-specific stat columns), one row per season, totals row in bold at the bottom.`)
  push(`  • Visually EMPHASIZE the ${year} highlight row — bold type, accent color, asterisk, or whatever device the era's actual cards used to call out a featured season.`)
  push('  • A 2-3 sentence career-arc bio in the era\'s typical tone is appropriate. Keep it factual; no AI-recap clichés.')
  push('  • Do NOT invent years, totals, or stats not listed above. The career years are exactly what is shown.')
  if (inProgressGuidance) push(inProgressGuidance)
  return lines.join('\n')
}

/**
 * Main entry. Returns a flat string-keyed map of every variable the
 * prompt templates may reference. Empty strings for anything that can't
 * be resolved — the interpolator handles those gracefully.
 */
export function buildCardPromptVariables({ player, dynasty, card }) {
  if (!player || !card) return {}

  const year = Number(card.year) || dynasty?.currentYear || new Date().getFullYear()

  // Team resolution for the card's season.
  const teamTid = resolveTeamForYear(player, year)
  const teamsSrc = dynasty?.teams || dynasty?.customTeams || TEAMS
  const team = teamTid != null ? teamsSrc[teamTid] : null
  const teamFull = team?.name || ''
  const school = teamFull ? (stripMascotFromName(teamFull) || teamFull) : ''
  const teamMascot = teamFull && school ? teamFull.replace(school, '').trim() : ''
  const colors = team?.colors || {}
  const teamColor = colors.primary || team?.primaryColor || ''
  const teamSecondaryColor = colors.secondary || team?.secondaryColor || ''
  const teamLogoUrl = team?.logo || ''

  // Identity bits.
  const firstName = (player.firstName || (player.name || '').split(' ')[0] || '').trim()
  const lastName = (player.lastName || (player.name || '').split(' ').slice(-1)[0] || '').trim()
  const fullName = (player.name || `${firstName} ${lastName}`).trim()
  const position = player.positionByYear?.[year] || player.position || ''
  const positionFull = POSITION_FULL[position] || position
  const jersey = emptyToBlank(player.jerseyNumber || player.jersey)
  const cls = player.classByYear?.[year] || player.year || ''

  // Season data.
  const statsLine = buildStatsLine(player, year)
  const ranking = teamTid != null
    ? (getTeamRanking(dynasty, teamTid, year)?.rank || '')
    : ''
  let recordLine = ''
  if (teamTid != null && dynasty) {
    const rec = calculateTeamRecordFromGames(dynasty, teamTid, year)
    if (rec && (rec.wins > 0 || rec.losses > 0)) {
      recordLine = `${rec.wins}-${rec.losses}`
    }
  }

  // Context resolution — the variable bundle here changes per context type.
  let contextLabel = ''
  let opponent = ''
  let opponentLogoUrl = ''
  let score = ''
  let result = ''
  let week = ''
  let awardName = ''
  let championshipName = ''
  let customLabel = card.contextDetails?.customLabel || ''

  const ctx = card.contextType || 'season'
  const details = card.contextDetails || {}

  // Resolve the per-game record once up-front so the per-game stat-line
  // extraction below has access to it (and we don't re-find it twice).
  let gameRecord = null
  if (ctx === 'game' && details.gameId && dynasty?.games) {
    gameRecord = dynasty.games.find(x => x?.id === details.gameId) || null
  }

  if (ctx === 'rookie') {
    contextLabel = 'Rookie Year'
  } else if (ctx === 'season') {
    contextLabel = `${year} Season`
  } else if (ctx === 'game' && gameRecord) {
    const g = gameRecord
    const t1 = Number(g.team1Tid)
    const t2 = Number(g.team2Tid)
    const playerIsT1 = t1 === teamTid
    const oppTid = playerIsT1 ? t2 : t1
    const opp = teamsSrc[oppTid]
    opponent = (opp?.name && stripMascotFromName(opp.name)) || opp?.abbr || ''
    opponentLogoUrl = opp?.logo || ''
    const myScore = playerIsT1 ? g.team1Score : g.team2Score
    const oppScore = playerIsT1 ? g.team2Score : g.team1Score
    if (myScore != null && oppScore != null) {
      score = formatScoreHighLow(myScore, oppScore)
      result = myScore > oppScore ? 'W' : 'L'
    }
    week = emptyToBlank(g.week)
    const gType = detectGameType(g)
    const gameLabel = gType === GAME_TYPES.BOWL ? (g.bowlName || 'Bowl') :
      gType === GAME_TYPES.CONFERENCE_CHAMPIONSHIP ? `${g.conference || ''} Championship` :
      gType === GAME_TYPES.CFP_CHAMPIONSHIP ? 'National Championship' :
      gType === GAME_TYPES.CFP_SEMIFINAL ? 'CFP Semifinal' :
      gType === GAME_TYPES.CFP_QUARTERFINAL ? 'CFP Quarterfinal' :
      gType === GAME_TYPES.CFP_FIRST_ROUND ? 'CFP First Round' :
      week ? `Week ${week}` : 'Game'
    contextLabel = opponent ? `${gameLabel} vs ${opponent} (${score} ${result})` : gameLabel
  } else if (ctx === 'championship') {
    championshipName = details.championshipName || details.championshipKey || 'Championship'
    contextLabel = `${year} ${championshipName}`
  } else if (ctx === 'award') {
    const key = details.awardKey || ''
    awardName = AWARD_NAMES[key] || key.replace(/([A-Z])/g, ' $1').trim() || 'Award'
    contextLabel = `${year} ${awardName}`
  } else if (ctx === 'custom') {
    contextLabel = customLabel || `${year} Season`
  }

  // Weekly award (optional, currently scoped to game-context cards).
  // Stored as { weeklyAward: id } in contextDetails; we resolve to a
  // human-readable name from the WEEKLY_AWARDS catalog.
  const weeklyAwardId = details.weeklyAward || ''
  const weeklyAwardName = weeklyAwardId
    ? (WEEKLY_AWARDS.find(a => a.id === weeklyAwardId)?.label || '')
    : ''

  // Detect "season in progress" — if the card's year is the dynasty's
  // current active year and the season hasn't yet concluded for the
  // player's team. Stops cards from talking about an ongoing season as
  // if it had already finished.
  const dynastyYearNum = Number(dynasty?.currentYear)
  const dynastyPhase = dynasty?.currentPhase || ''
  const dynastyWeek = Number(dynasty?.currentWeek)

  // During postseason, mark complete as soon as the player's team has a
  // played bowl/CFP game — they're done regardless of other games still
  // being played around the league.
  const teamPostseasonDone = (() => {
    if (dynastyPhase !== 'postseason') return false
    if (teamTid == null || !dynasty?.games) return false
    return dynasty.games.some(g => {
      if (!g || Number(g.year) !== dynastyYearNum) return false
      if (Number(g.team1Tid) !== teamTid && Number(g.team2Tid) !== teamTid) return false
      const isPostseason = g.isBowlGame || g.isCFPFirstRound || g.isCFPQuarterfinal || g.isCFPSemifinal || g.isCFPChampionship
      return isPostseason && (g.isPlayed || (g.team1Score != null && g.team2Score != null))
    })
  })()

  const seasonInProgress =
    Number.isFinite(dynastyYearNum) &&
    Number(year) === dynastyYearNum &&
    dynastyPhase !== 'offseason' &&
    !teamPostseasonDone

  const seasonProgressNote = seasonInProgress
    ? (() => {
        if (dynastyPhase === 'conference_championship') {
          return `IN PROGRESS — through the Conference Championship of ${year}`
        }
        if (dynastyPhase === 'postseason') {
          const bowlWk = Number.isFinite(dynastyWeek) && dynastyWeek > 0 ? dynastyWeek : 1
          return `IN PROGRESS — Bowl Week ${bowlWk} of ${year}`
        }
        return Number.isFinite(dynastyWeek) && dynastyWeek > 0
          ? `IN PROGRESS — through Week ${dynastyWeek} of ${year}`
          : `IN PROGRESS — ${year} season is still being played`
      })()
    : ''

  const bioText = buildBioText({
    player, position, school, year, statsLine, recordLine, contextLabel,
    seasonInProgress,
  })

  // Games-played count per year for the career table. For each year in
  // the player's career, count played games where their team was involved.
  const gpByYear = (() => {
    const result = {}
    if (!player?.statsByYear || !dynasty?.games) return result
    const years = Object.keys(player.statsByYear).map(Number).filter(n => Number.isFinite(n) && n > 0)
    for (const yr of years) {
      const tidForYear = resolveTeamForYear(player, yr)
      if (tidForYear == null) continue
      result[yr] = dynasty.games.filter(g => {
        if (!g || Number(g.year) !== yr) return false
        if (Number(g.team1Tid) !== tidForYear && Number(g.team2Tid) !== tidForYear) return false
        return g.isPlayed || (g.team1Score != null && g.team2Score != null)
      }).length
    }
    return result
  })()

  // Career-wide stats (used by season-context cards on the back).
  const careerStatsTable = buildCareerStatsTable(player, gpByYear)
  const careerYearsLine = buildCareerYearsLine(player)

  // For game-context cards, pull the player's per-game stat line from
  // the box score so the back of the card can show what they actually
  // did in that single game (instead of repeating season totals).
  const gameStatsLine = gameRecord ? buildPlayerGameStatsLine(player, gameRecord) : ''

  // Build "City, ST" when both city and state are known, "City" if
  // only city, "ST" if only state, "" otherwise. The AI was guessing
  // states from city names because the prompt only carried the city
  // (Dallas → Texas? Could also be Georgia, Pennsylvania, etc.).
  const hometownCity = emptyToBlank(player.hometown)
  const hometownState = emptyToBlank(player.state || player.homeState)
  const hometownFull = (hometownCity && hometownState)
    ? `${hometownCity}, ${hometownState}`
    : (hometownCity || hometownState || '')

  // Context-aware data block — drives the back of the card.
  const contextStatBlock = buildContextStatBlock({
    ctx, year: String(year), name: fullName, school,
    position, positionFull, cls,
    height: emptyToBlank(player.height),
    weight: emptyToBlank(player.weight),
    hometown: hometownFull,
    stars: emptyToBlank(player.stars),
    recruitingRank: player.nationalRank ? `#${player.nationalRank}` : '',
    statsLine, recordLine,
    ranking: ranking ? `#${ranking}` : '',
    careerYearsLine, careerStatsTable,
    opponent, score, result, week, contextLabel,
    awardName, championshipName, customLabel,
    weeklyAwardName, gameStatsLine,
    seasonInProgress, seasonProgressNote,
  })

  // Optional front-of-card overlay instruction. Only populated when a
  // weekly award is attached — adds a small POTW banner / badge to the
  // front design. Empty otherwise so the front prompt collapses cleanly.
  const frontOverlay = weeklyAwardName
    ? `OPTIONAL FRONT OVERLAY: Add a small "${weeklyAwardName}" banner or badge to the card front, sized so it does not obscure the player photo. Place it across the top edge or in an upper corner. Match the era's visual language — gold-foil ribbon for modern premium sets, plain printed banner for vintage sets, etched/embossed seal for ultra-premium sets. The banner reads "${weeklyAwardName}" in era-appropriate typography.`
    : ''

  return {
    // Identity
    name: fullName,
    firstName,
    lastName,
    position,
    positionFull,
    jersey,
    number: jersey,
    class: cls,
    height: emptyToBlank(player.height),
    weight: emptyToBlank(player.weight),
    // {{hometown}} now carries "City, ST" when both are on the player
    // record (the AI was guessing states from ambiguous city names
    // like "Dallas" or "Springfield" before). {{hometownCity}} keeps
    // the city-only form for templates that already include state
    // separately, and {{state}} stays unchanged for explicit usage.
    hometown: hometownFull,
    hometownCity: hometownCity,
    state: hometownState,
    archetype: emptyToBlank(player.archetype),
    devTrait: emptyToBlank(player.devTrait),
    stars: emptyToBlank(player.stars),
    recruitingRank: player.nationalRank ? `#${player.nationalRank}` : '',

    // Team
    school,
    teamFull,
    teamMascot,
    teamColor,
    teamSecondaryColor,
    teamLogoUrl,

    // Season
    year: String(year),
    statsLine,
    recordLine,
    ranking: ranking ? `#${ranking}` : '',

    // Context
    contextLabel,
    opponent,
    opponentLogoUrl,
    score,
    result,
    week: emptyToBlank(week),
    awardName,
    championshipName,
    customLabel,

    // Bio
    bioText,

    // Career & context-aware back content
    careerStatsTable,
    careerYearsLine,
    contextStatBlock,

    // Weekly award (game-context add-on)
    weeklyAward: weeklyAwardId,
    weeklyAwardName,
    frontOverlay,

    // Per-game player stats (populated for game-context cards when the
    // game's box score has a row for this player — empty otherwise).
    gameStatsLine,

    // Dynasty
    dynastyName: dynasty?.name || '',
    dynastyYear: String(dynasty?.currentYear || ''),
  }
}

/**
 * Apply a variable map to a prompt template. Removes any leftover
 * {{var}} placeholders for values that resolved to empty so the user
 * never copies a half-baked prompt with literal `{{score}}` text.
 *
 * Also collapses any double spaces / orphaned punctuation left behind
 * after a blank substitution so the result reads cleanly.
 */
export function interpolatePrompt(template, variables) {
  if (!template || typeof template !== 'string') return ''
  let out = template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => {
    const v = variables[key]
    return v == null ? '' : String(v)
  })
  // Collapse double-spaces left by empty substitutions
  out = out.replace(/[ \t]{2,}/g, ' ')
  // Clean up orphan separators like " ,", " .", "()", "( )" etc.
  out = out.replace(/\s+,/g, ',')
  out = out.replace(/\(\s*\)/g, '')
  out = out.replace(/\s+\)/g, ')')
  out = out.replace(/\(\s+/g, '(')
  out = out.replace(/[ \t]+\n/g, '\n')
  out = out.replace(/\n{3,}/g, '\n\n')
  return out.trim()
}
