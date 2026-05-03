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
