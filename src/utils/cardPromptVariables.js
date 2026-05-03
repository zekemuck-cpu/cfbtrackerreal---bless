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
function buildBioText({ player, position, school, year, statsLine, recordLine, contextLabel }) {
  const parts = []
  if (player.classByYear?.[year] || player.year) {
    const cls = player.classByYear?.[year] || player.year
    parts.push(`${cls} ${POSITION_FULL[position] || position}`)
  } else if (position) {
    parts.push(POSITION_FULL[position] || position)
  }
  if (school) parts.push(`at ${school}`)
  if (statsLine) parts.push(`Posted ${statsLine}`)
  if (recordLine) parts.push(`(${recordLine})`)
  if (contextLabel) parts.push(`— ${contextLabel}`)
  return parts.join(' ')
}

/**
 * Build a stats-line one-liner for the year — same kind of summary the
 * Player profile shows on the overview tab. Returns '' when the player
 * has no stat data for that year.
 */
function buildStatsLine(player, year) {
  if (!player?.statsByYear || !year) return ''
  const yearStats = player.statsByYear[year] || player.statsByYear[String(year)]
  if (!yearStats) return ''

  const parts = []
  // Passing
  const p = yearStats.passing
  if (p && (Number(p.yds) > 0 || Number(p.tds) > 0 || Number(p.cmp) > 0)) {
    const cmp = p.cmp ?? p.completions
    const att = p.att ?? p.attempts
    const yds = p.yds ?? p.passingYards ?? p.yards
    const tds = p.tds ?? p.touchdowns
    const ints = p.ints ?? p.interceptions
    parts.push(`${cmp ?? '?'}/${att ?? '?'}, ${yds ?? 0} yds, ${tds ?? 0} TD${ints != null ? `, ${ints} INT` : ''}`)
  }
  // Rushing
  const r = yearStats.rushing
  if (r && (Number(r.yds) > 0 || Number(r.tds) > 0)) {
    const yds = r.yds ?? r.rushingYards ?? r.yards
    const tds = r.tds ?? r.touchdowns
    parts.push(`${yds ?? 0} rush yds, ${tds ?? 0} TD`)
  }
  // Receiving
  const c = yearStats.receiving
  if (c && (Number(c.yds) > 0 || Number(c.tds) > 0 || Number(c.rec) > 0)) {
    const rec = c.rec ?? c.receptions
    const yds = c.yds ?? c.receivingYards ?? c.yards
    const tds = c.tds ?? c.touchdowns
    parts.push(`${rec ?? 0} rec, ${yds ?? 0} yds, ${tds ?? 0} TD`)
  }
  // Defensive — sacks, TFL, INT
  const d = yearStats.defense
  if (d) {
    const subParts = []
    const tot = d.tot ?? d.tackles
    const sacks = d.sacks
    const ints = d.ints ?? d.interceptions
    if (tot) subParts.push(`${tot} tkl`)
    if (sacks) subParts.push(`${sacks} sk`)
    if (ints) subParts.push(`${ints} INT`)
    if (subParts.length > 0) parts.push(subParts.join(', '))
  }

  return parts.join(' • ')
}

/**
 * Build a multi-line year-by-year career stats table for the player.
 * One row per year that has stats, formatted like:
 *   `2028 (Sophomore): 290/410, 3800 yds, 32 TD`
 * Returns '' if the player has no stat data at all.
 */
function buildCareerStatsTable(player) {
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
    rows.push(cls ? `${yr} (${cls}): ${line}` : `${yr}: ${line}`)
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
}) {
  const lines = []
  // Push a line. null/undefined skip; empty strings are pushed verbatim
  // so callers can use `push('')` to insert a blank-line separator.
  // Optional fields are guarded explicitly with `if (val) push(...)`.
  const push = (s) => { if (s != null) lines.push(s) }

  if (ctx === 'game') {
    push(`=== GAME CARD — STRICTLY THIS GAME ONLY ===`)
    push(`Player: ${name}${positionFull ? ` (${positionFull})` : ''}${school ? `, ${school}` : ''}`)
    if (week) push(`Week: ${week}`)
    if (contextLabel) push(`Game: ${contextLabel}`)
    if (opponent) push(`Opponent: ${opponent}`)
    if (score) push(`Final: ${school || 'Team'} vs ${opponent || 'Opponent'} — ${score}${result ? ` (${result})` : ''}`)
    if (result) push(`Result: ${result === 'W' ? 'Win' : 'Loss'}`)
    push('')
    push(`INSTRUCTION: This card commemorates ONLY this single game. Render only this matchup — week, opponent, final score, result, and a brief 1-2 sentence game narrative. DO NOT include season totals, career stats, year-by-year tables, or content from any other game. Wherever the design below describes a "stat panel" or "year-by-year stats" or "career totals", instead render the single game line above.`)
    return lines.join('\n')
  }

  if (ctx === 'rookie') {
    push(`=== ROOKIE / DEBUT CARD ===`)
    push(`Player: ${name}${positionFull ? ` (${positionFull})` : ''}${school ? `, ${school}` : ''}`)
    push(`First season: ${year}${cls ? ` (${cls})` : ''}`)
    if (height) push(`Height: ${height}`)
    if (weight) push(`Weight: ${weight}`)
    if (hometown) push(`Hometown: ${hometown}`)
    if (stars) push(`Recruiting: ${stars}-star${recruitingRank ? `, national ${recruitingRank}` : ''}`)
    if (statsLine) push(`${year} rookie season stats: ${statsLine}`)
    if (recordLine) push(`${year} team record: ${recordLine}`)
    if (ranking) push(`${year} team ranking: ${ranking}`)
    push('')
    push(`INSTRUCTION: This is a rookie / debut card. Render only the recruiting profile and the ${year} rookie-season stats above. DO NOT include later-year stats or career totals (those years have not happened yet from this card's perspective).`)
    return lines.join('\n')
  }

  if (ctx === 'championship') {
    push(`=== ${year} ${championshipName || 'CHAMPIONSHIP'} ===`)
    push(`Player: ${name}${positionFull ? ` (${positionFull})` : ''}${school ? `, ${school}` : ''}${cls ? `, ${cls}` : ''}`)
    if (statsLine) push(`${year} season stats: ${statsLine}`)
    if (recordLine) push(`${year} team record: ${recordLine}`)
    if (ranking) push(`${year} team ranking: ${ranking}`)
    push('')
    push(`INSTRUCTION: This is a commemorative championship card. The "${championshipName || 'championship'}" should be prominent in the back design. Include the team's record and the player's ${year} season stats. Add a 2-3 sentence narrative tying the player to the title run. Do not include other-year stats.`)
    return lines.join('\n')
  }

  if (ctx === 'award') {
    push(`=== ${year} ${awardName || 'AWARD'} ===`)
    push(`Player: ${name}${positionFull ? ` (${positionFull})` : ''}${school ? `, ${school}` : ''}${cls ? `, ${cls}` : ''}`)
    if (statsLine) push(`${year} season stats: ${statsLine}`)
    if (recordLine) push(`${year} team record: ${recordLine}`)
    push('')
    push(`INSTRUCTION: This is a commemorative ${awardName || 'award'} card. The award name should be prominent. Include the qualifying ${year} season stats and a brief narrative explaining the player's case for the award. Do not include other-year stats.`)
    return lines.join('\n')
  }

  if (ctx === 'custom') {
    push(`=== CUSTOM CARD: ${customLabel || 'Custom'} ===`)
    push(`Player: ${name}${positionFull ? ` (${positionFull})` : ''}${school ? `, ${school}` : ''}${cls ? `, ${cls}` : ''}`)
    if (statsLine) push(`${year} stats: ${statsLine}`)
    if (recordLine) push(`${year} team record: ${recordLine}`)
    push('')
    push(`INSTRUCTION: Render the back around the user-supplied theme: "${customLabel || ''}". Use only the stats listed above. Do not invent additional achievements.`)
    return lines.join('\n')
  }

  // Default: 'season' — highlight selected year, but show full career below.
  push(`=== ${year} SEASON CARD — ${school || 'Team'} ===`)
  push(`Player: ${name}${positionFull ? ` (${positionFull})` : ''}${cls ? `, ${cls}` : ''}`)
  if (height) push(`Height: ${height}`)
  if (weight) push(`Weight: ${weight}`)
  if (hometown) push(`Hometown: ${hometown}`)
  push('')
  push(`HIGHLIGHT YEAR — ${year}:`)
  if (statsLine) push(`  Stats: ${statsLine}`)
  if (recordLine) push(`  Team record: ${recordLine}`)
  if (ranking) push(`  Team ranking: ${ranking}`)
  if (careerStatsTable) {
    push('')
    push(`FULL CAREER YEAR-BY-YEAR (${careerYearsLine || ''}):`)
    for (const row of careerStatsTable.split('\n')) push(`  ${row}`)
  }
  push('')
  push(`INSTRUCTION: This is a season card. Render the FULL year-by-year career table above on the back stat panel. Visually emphasize the ${year} highlight row (bold / color / asterisk per the card-set's era). Where the design below mentions "year-by-year stats", "career totals", or a "stat table", populate it from the career table above. DO NOT invent years, totals, or stats not listed above.`)
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

  if (ctx === 'rookie') {
    contextLabel = 'Rookie Year'
  } else if (ctx === 'season') {
    contextLabel = `${year} Season`
  } else if (ctx === 'game' && details.gameId && dynasty?.games) {
    const g = dynasty.games.find(x => x?.id === details.gameId)
    if (g) {
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
        score = `${myScore}-${oppScore}`
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
    }
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

  const bioText = buildBioText({
    player, position, school, year, statsLine, recordLine, contextLabel,
  })

  // Career-wide stats (used by season-context cards on the back).
  const careerStatsTable = buildCareerStatsTable(player)
  const careerYearsLine = buildCareerYearsLine(player)

  // Context-aware data block — drives the back of the card.
  const contextStatBlock = buildContextStatBlock({
    ctx, year: String(year), name: fullName, school,
    position, positionFull, cls,
    height: emptyToBlank(player.height),
    weight: emptyToBlank(player.weight),
    hometown: emptyToBlank(player.hometown),
    stars: emptyToBlank(player.stars),
    recruitingRank: player.nationalRank ? `#${player.nationalRank}` : '',
    statsLine, recordLine,
    ranking: ranking ? `#${ranking}` : '',
    careerYearsLine, careerStatsTable,
    opponent, score, result, week, contextLabel,
    awardName, championshipName, customLabel,
  })

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
    hometown: emptyToBlank(player.hometown),
    state: emptyToBlank(player.state || player.homeState),
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
