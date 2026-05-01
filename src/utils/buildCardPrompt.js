// Composes the AI image-gen prompt for a single player trading card.
//
// The prompt is split into five labeled blocks so the model can parse
// them as discrete instructions. Order matters: the STYLE block is
// last because image models tend to weight the final clause heaviest.
//
//   STYLE / CARD DESIGN  (verbatim from the chosen preset)
//   PLAYER               (name, jersey, position, class, height/weight, honors)
//   SCENE                (game opponent, home/away, stadium colors, weather)
//   ACTION               (verbatim from the chosen pose preset)
//   FRAMING              (per-style derived nameplate / banner directives)
//
// Brand names (Topps, Panini, etc.) never appear in the prompt body —
// only in the user-facing UI label. Some image models refuse trademarks
// and we want the cards to be ours, not knockoffs.

import { CARD_BRANDS, getCardStyle } from '../data/cardStyles'
import { isPlayerOnRoster, getPlayerClassForYear, getPlayerOverallForYear } from '../context/DynastyContext'

/**
 * @param {Object} args
 * @param {Object} args.player - Full player record from dynasty.players
 * @param {Object} args.dynasty - currentDynasty
 * @param {number} args.year - The season the card represents
 * @param {string} args.brandKey - e.g. 'topps'
 * @param {string} args.styleKey - e.g. 'stadium_club_1991'
 * @param {Object} [args.poseEntry] - Resolved pose object { label, prompt }
 * @param {Object} [args.gameContext] - { game, opponentName, location, year, week }
 * @param {Object} [args.awardContext] - { name, year }
 * @param {string} [args.customStylePrompt] - Used when brandKey === 'custom'
 * @param {'front'|'back'|'both'} [args.mode] - Which face(s) to emit (default 'both')
 * @param {string} [args.referenceImageUrl] - URL of a headshot for likeness
 * @returns {string} The final prompt to copy into Midjourney/DALL-E/etc.
 */
export function buildCardPrompt(args) {
  const {
    player, dynasty, year, brandKey, styleKey, poseEntry,
    gameContext, awardContext, customStylePrompt,
    mode = 'both', referenceImageUrl,
  } = args || {}

  if (!player || !year || !brandKey || !styleKey) return ''

  const style = getCardStyle(brandKey, styleKey)
  if (!style) return ''

  // ── Resolve player + team data once, share between front and back ──
  const teamTid = resolveTeamForYear(player, dynasty, year)
  const team = teamTid ? dynasty?.teams?.[teamTid] : null
  const teamName = team?.name || ''
  const teamPrimary = team?.primaryColor || ''
  const teamSecondary = team?.secondaryColor || ''

  const cls = getPlayerClassForYear ? getPlayerClassForYear(player, year) : (player.classByYear?.[year] || player.class || '')
  const positionForYear = player.positionByYear?.[year] || player.position || ''
  const jersey = player.jerseyNumber || player.jersey || ''
  const heightStr = player.height || ''
  const weightStr = player.weight ? `${player.weight} lbs` : ''
  const hometown = player.hometown || (player.homeCity ? `${player.homeCity}${player.homeState ? `, ${player.homeState}` : ''}` : '')
  const honorTag = inferHonorTag(player, dynasty, year)

  const playerCtx = {
    player, dynasty, year, team, teamName, teamPrimary, teamSecondary,
    cls, positionForYear, jersey, heightStr, weightStr, hometown,
    honorTag, poseEntry,
    gameContext, awardContext,
    style, brandKey, customStylePrompt,
    referenceImageUrl,
  }

  const blocks = []
  if (mode === 'front' || mode === 'both') blocks.push(buildFrontPrompt(playerCtx))
  if (mode === 'back' || mode === 'both') blocks.push(buildBackPrompt(playerCtx))

  if (mode === 'both') {
    return blocks.join('\n\n\n=========================================================\n=== PROMPT 2 OF 2 — generate this as a SECOND, SEPARATE image\n=========================================================\n\n')
  }
  return blocks[0] || ''
}

/**
 * Compose the front-of-card prompt. CFB 26 in-game capture style —
 * looks like a high-end console football game render, not a photo.
 */
function buildFrontPrompt(ctx) {
  const {
    player, year, team, teamName, teamPrimary, teamSecondary,
    cls, positionForYear, jersey, heightStr, weightStr, hometown,
    honorTag, poseEntry, gameContext, awardContext,
    style, brandKey, customStylePrompt, referenceImageUrl,
  } = ctx

  const sceneBlock = buildSceneBlock({ gameContext, awardContext, teamName, teamPrimary, teamSecondary })

  const styleBlock = brandKey === 'custom'
    ? (customStylePrompt || '').trim()
    : (style.visualPrompt || '').trim()

  const playerNameUpper = (player.name || '').toUpperCase()
  const lastName = (player.name || '').split(' ').slice(-1)[0]?.toUpperCase() || ''
  const styleBlockResolved = styleBlock
    .replace(/\[PLAYER\]/g, player.name || '')
    .replace(/\[PLAYER_UPPER\]/g, playerNameUpper)
    .replace(/\[LAST_NAME\]/g, lastName)
    .replace(/\[CLASS\]/g, cls || '')
    .replace(/\[POSITION\]/g, positionForYear || '')
    .replace(/\[JERSEY\]/g, jersey || '')
    .replace(/\[HEIGHT\]/g, heightStr || '')
    .replace(/\[WEIGHT\]/g, weightStr || '')
    .replace(/\[TEAM\]/g, teamName || '')

  // The school name is what appears on the school nameplate / banner
  // on the card front. We strip the mascot off ("Kentucky Wildcats" →
  // "Kentucky") so the banner reads cleanly.
  const schoolNameForBanner = (() => {
    if (!teamName) return ''
    // Cheap inline strip — match the canonical helper but keep this
    // file dependency-free (no extra imports for one helper).
    const parts = teamName.split(' ')
    if (parts.length <= 1) return teamName
    return parts.slice(0, Math.max(1, parts.length - 1)).join(' ')
  })()

  const lines = []
  lines.push('=== FRONT OF CARD ===')
  lines.push('')
  lines.push(`Output: ONE rectangular college football trading card filling the entire image. Aspect roughly 5:7 (standard trading-card portrait). No surrounding table, no other cards, no annotations outside the card edges.`)
  lines.push('')

  lines.push('═══ WHAT A REAL TRADING CARD FRONT IS — READ FIRST ═══')
  lines.push(`The front of a real football trading card is DOMINATED by a single, large action photograph of the player on the field, mid-play. The card front does NOT contain a bio panel, does NOT contain a stats table, does NOT contain a floating headshot inset, does NOT contain career notes or paragraphs of explanatory text. The ONLY text on the front is a small nameplate (player name + a position/jersey/class tag) plus a school name banner — typography only, no data tables. Think 1991 Topps Stadium Club, 1989 Topps, Panini Prizm — they are photo-driven cards, not info sheets.`)
  lines.push('')

  lines.push('═══ THE PHOTO INSIDE THE CARD ═══')
  lines.push(`The photograph inside the card frame is a cinematic in-game capture from EA Sports College Football 26 (the latest-generation console football video game) — slightly stylized realism, crisp polygonal player models, realistic-but-clean stadium textures, ambient lighting and subtle post-process bloom typical of modern AAA sports games. Framed by a virtual professional in-game cinematographer: cinematic depth of field, broadcast-style camera angle, dramatic action-line composition. The look is unmistakably a high-end sports video game — NOT a real-life photograph — but composed with the eye of a professional sideline photographer.`)
  lines.push('')

  lines.push('═══ THE PLAYER IN THE PHOTO ═══')
  lines.push(`The rendered player is MID-ACTION on the football field, wearing a HELMET and the full ${teamName || 'team'} uniform with jersey number #${jersey || '?'} clearly visible. Body in athletic motion. The player is NOT a static portrait, NOT a posed studio shot, NOT a headshot. They are doing the action described below, on the field, during a game.`)
  if (referenceImageUrl) {
    lines.push('')
    lines.push(`A reference headshot is attached with this prompt — USE IT FOR FACE LIKENESS ONLY (jaw shape, skin tone, ethnicity, facial features visible under/around the helmet). The body, pose, uniform, and stadium setting in the rendered card must be NEW — do NOT copy the headshot's pose or composition into the card. The headshot is a face source; the card is an action scene.`)
    lines.push(`(If your tool didn't auto-receive the image, URL: ${referenceImageUrl})`)
  } else {
    lines.push('')
    lines.push('(No reference headshot supplied — invent a plausible face for the demographic.)')
  }
  lines.push('')

  if (poseEntry?.prompt) {
    lines.push('═══ ACTION ═══')
    lines.push(poseEntry.prompt)
    lines.push('')
  }

  if (sceneBlock) {
    lines.push('═══ SCENE / SETTING ═══')
    lines.push(sceneBlock)
    lines.push('')
  }

  // Only the on-card-text we actually want to appear is in this block.
  // Bio / stats / hometown stay out of the front entirely.
  lines.push('═══ ON-CARD TEXT — render ONLY what is listed here ═══')
  lines.push(`Player name (for the nameplate / banner copy): "${player.name || 'Unknown'}"`)
  if (schoolNameForBanner) lines.push(`School name (for the school banner copy): "${schoolNameForBanner}"`)
  lines.push(`Position / jersey / class tag: "${positionForYear || '?'} · #${jersey || '?'} · ${cls || '?'}"`)
  if (honorTag) lines.push(`Honor ribbon (small overlay): "${honorTag}" — render only if it fits naturally in the design`)
  lines.push(`Team colors (use as design accents): primary ${teamPrimary || 'unknown'}${teamSecondary ? `, secondary ${teamSecondary}` : ''}.`)
  lines.push('No other text appears on the card front. No height, no weight, no hometown, no stats, no biography.')
  lines.push('')

  lines.push('═══ CARD DESIGN / FRAME — render the border + nameplate exactly like this ═══')
  lines.push(styleBlockResolved || '(custom style not provided)')
  lines.push('')

  lines.push('═══ HARD CONSTRAINTS — DO NOT VIOLATE ═══')
  lines.push('- The card front is PHOTO-DRIVEN. The action photograph is the dominant element.')
  lines.push('- ABSOLUTELY NO bio panel (no height / weight / hometown / class table on the front).')
  lines.push('- ABSOLUTELY NO stats table on the front.')
  lines.push('- ABSOLUTELY NO floating headshot inset, portrait box, or separate face cutout on the front.')
  lines.push('- ABSOLUTELY NO career-summary or descriptive paragraph text on the front.')
  lines.push(`- The jersey number on the player MUST be #${jersey || '?'}; the player wears a helmet.`)
  lines.push('- The player is in mid-action on the field, in uniform — not standing still, not posed, not a portrait.')
  lines.push('- No professional NFL team logos. No real conference or league marks.')
  lines.push('- The card fills the entire image; no background table, no other cards, no surrounding objects.')
  lines.push('- The photograph inside the card is a video-game in-engine render (CFB 26 style), NOT a real-life photograph.')

  return lines.join('\n')
}

/**
 * Compose the back-of-card prompt. The back is a stats / bio panel,
 * graphic-design driven rather than photo-driven. Different rules
 * apply: it should look printed and clean, not a video-game capture.
 */
function buildBackPrompt(ctx) {
  const {
    player, year, team, teamName, teamPrimary, teamSecondary,
    cls, positionForYear, jersey, heightStr, weightStr, hometown,
    honorTag, referenceImageUrl,
  } = ctx

  // Build a simple stats summary from statsByYear so the back has
  // something concrete to render. We pick top categories per
  // position group; if data is sparse the back still works as a
  // bio + headshot panel.
  const statsLines = buildStatsSummary(player, year)
  const careerSummary = buildCareerSummary(player)

  const lines = []
  lines.push('=== BACK OF CARD ===')
  lines.push('')
  lines.push(`The back of a college football trading card — a clean printed stats and bio panel. The card itself fills the entire frame — no background table, no surrounding objects.`)
  lines.push('')
  lines.push('═══ VISUAL STYLE — read first ═══')
  lines.push(`Designed as a printed card back, NOT a photograph and NOT a game capture. Clean graphic design typography, flat color blocks, sharp printed text. Thin team-color border around the entire card matching the front. Cardstock has a slight matte texture visible at edges. Layout is editorial and readable, similar in feel to the back of a 1990s-2000s premium trading card.`)
  lines.push('')

  if (referenceImageUrl) {
    lines.push('═══ PLAYER HEADSHOT ═══')
    lines.push(`In the upper-left corner of the card back: a small square cutout headshot of the player (~22% of card width) with a thin team-color border. A reference headshot is attached with this prompt — use it for facial likeness so the back-of-card headshot looks like the same person.`)
    lines.push(`(If your tool didn't auto-receive it, the image URL is: ${referenceImageUrl})`)
    lines.push('')
  }

  lines.push('═══ HEADER (top of card back) ═══')
  lines.push(`Player name "${player.name || ''}" in large block-letter compressed sans-serif (uppercase) across the top.`)
  lines.push(`Beneath the name, on a thin team-color band: "${positionForYear || '?'} · #${jersey || '?'} · ${cls || '?'}" in white compressed sans-serif.`)
  if (teamName) lines.push(`Team name "${teamName}" appears in a smaller line below the band.`)
  lines.push('')

  lines.push('═══ BIO PANEL ═══')
  if (heightStr) lines.push(`Height: ${heightStr}`)
  if (weightStr) lines.push(`Weight: ${weightStr}`)
  if (hometown) lines.push(`Hometown: ${hometown}`)
  if (cls) lines.push(`Class: ${cls}`)
  if (honorTag) lines.push(`${year} Honor: ${honorTag}`)
  lines.push('Render these as a clean labeled bio table on the left side of the card back.')
  lines.push('')

  if (statsLines.length > 0) {
    lines.push(`═══ ${year} SEASON STATS ═══`)
    lines.push(`Render these as a tidy stats table on the card back, with category labels and aligned numbers:`)
    statsLines.forEach(line => lines.push(line))
    lines.push('')
  }

  if (careerSummary) {
    lines.push('═══ CAREER NOTE ═══')
    lines.push(careerSummary)
    lines.push('')
  }

  lines.push('═══ FOOTER ═══')
  lines.push(`A small school crest or logo space at the bottom right (the team's primary-color circle is fine — do not draw a real conference or league logo).`)
  if (team?.primaryColor) lines.push(`A thin ${team.primaryColor} hairline rule across the bottom edge.`)
  lines.push('')

  lines.push('═══ HARD CONSTRAINTS ═══')
  lines.push('- This is the BACK of the card — flat printed graphic design, NOT a photograph or game capture.')
  lines.push('- All text must be legible and accurate to the data above. Do not invent stat numbers.')
  lines.push('- Card fills the entire image — no background, no other cards.')
  lines.push('- No professional NFL team logos. No real conference/league marks.')

  return lines.join('\n')
}

/**
 * Pull a compact stat summary for the year out of player.statsByYear.
 * Returns a list of strings ready to drop into the prompt — keeps
 * only categories that actually have data so we don't tell the AI to
 * render an empty rushing line for a kicker.
 */
function buildStatsSummary(player, year) {
  const yr = Number(year)
  const stats = player?.statsByYear?.[yr] || player?.statsByYear?.[String(yr)]
  if (!stats || typeof stats !== 'object') return []

  const out = []
  const fmt = (label, val) => {
    if (val == null || val === '' || val === 0) return null
    return `  ${label}: ${val}`
  }

  const passing = stats.passing
  if (passing && (passing.yards || passing.tds || passing.cmp)) {
    out.push('PASSING')
    const cmp = passing.cmp ?? passing.completions
    const att = passing.att ?? passing.attempts
    if (cmp != null && att != null) out.push(`  ${cmp}/${att}${passing.pct ? ` (${passing.pct}%)` : ''}`)
    ;[
      fmt('Yards', passing.yards),
      fmt('TDs', passing.tds ?? passing.td),
      fmt('INTs', passing.ints ?? passing.int),
    ].filter(Boolean).forEach(l => out.push(l))
  }

  const rushing = stats.rushing
  if (rushing && (rushing.yards || rushing.tds || rushing.car)) {
    out.push('RUSHING')
    ;[
      fmt('Carries', rushing.car ?? rushing.attempts ?? rushing.att),
      fmt('Yards', rushing.yards ?? rushing.yds),
      fmt('TDs', rushing.tds ?? rushing.td),
    ].filter(Boolean).forEach(l => out.push(l))
  }

  const receiving = stats.receiving
  if (receiving && (receiving.yards || receiving.tds || receiving.rec)) {
    out.push('RECEIVING')
    ;[
      fmt('Receptions', receiving.rec ?? receiving.receptions),
      fmt('Yards', receiving.yards ?? receiving.yds),
      fmt('TDs', receiving.tds ?? receiving.td),
    ].filter(Boolean).forEach(l => out.push(l))
  }

  const defense = stats.defense
  if (defense && (defense.tackles || defense.sacks || defense.ints)) {
    out.push('DEFENSE')
    ;[
      fmt('Tackles', defense.tackles ?? defense.tot),
      fmt('Sacks', defense.sacks),
      fmt('TFL', defense.tfl),
      fmt('INTs', defense.ints ?? defense.int),
      fmt('PDs', defense.pds ?? defense.pd),
      fmt('FFs', defense.ffs ?? defense.ff),
    ].filter(Boolean).forEach(l => out.push(l))
  }

  const kicking = stats.kicking
  if (kicking && (kicking.fgm || kicking.xpm)) {
    out.push('KICKING')
    ;[
      fmt('FG', kicking.fgm != null && kicking.fga != null ? `${kicking.fgm}/${kicking.fga}` : null),
      fmt('XP', kicking.xpm != null && kicking.xpa != null ? `${kicking.xpm}/${kicking.xpa}` : null),
      fmt('Long', kicking.long),
    ].filter(Boolean).forEach(l => out.push(l))
  }

  return out
}

/**
 * Optional career-spanning sentence pulled from teamHistory.
 */
function buildCareerSummary(player) {
  if (!Array.isArray(player?.teamHistory) || player.teamHistory.length === 0) return null
  const stints = player.teamHistory
    .map(s => `${s.fromYear}${s.toYear == null ? '–present' : (s.toYear === s.fromYear ? '' : `–${s.toYear}`)}`)
    .join(', ')
  return `Career: active ${stints}.`
}

/**
 * Pick the team this player was on for the given year. Stint-based
 * teamHistory is preferred (handles transfers cleanly); falls back to
 * the older teamsByYear map.
 */
function resolveTeamForYear(player, dynasty, year) {
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
    if (t) return Number(t)
  }
  if (player.team && dynasty) {
    // Last-ditch abbr lookup
    for (const [tid, team] of Object.entries(dynasty.teams || {})) {
      if (team?.abbr === player.team) return Number(tid)
    }
  }
  return null
}

/**
 * Default season picker used by the page: most recent year the player
 * appears on a roster (via teamHistory or teamsByYear).
 */
export function getDefaultCardSeason(player, dynasty) {
  if (!player) return null
  const candidates = new Set()
  if (Array.isArray(player.teamHistory)) {
    for (const stint of player.teamHistory) {
      const from = Number(stint.fromYear)
      const to = stint.toYear == null ? Number(dynasty?.currentYear) : Number(stint.toYear)
      for (let y = from; y <= to; y++) {
        if (Number.isFinite(y)) candidates.add(y)
      }
    }
  }
  if (player.teamsByYear) {
    for (const k of Object.keys(player.teamsByYear)) {
      const y = Number(k)
      if (Number.isFinite(y)) candidates.add(y)
    }
  }
  if (player.statsByYear) {
    for (const k of Object.keys(player.statsByYear)) {
      const y = Number(k)
      if (Number.isFinite(y)) candidates.add(y)
    }
  }
  if (candidates.size === 0) return Number(dynasty?.currentYear) || null
  return Math.max(...candidates)
}

/**
 * Available seasons for the season dropdown. Sorted newest first.
 */
export function getAvailableCardSeasons(player, dynasty) {
  if (!player) return []
  const set = new Set()
  if (Array.isArray(player.teamHistory)) {
    for (const stint of player.teamHistory) {
      const from = Number(stint.fromYear)
      const to = stint.toYear == null ? Number(dynasty?.currentYear) : Number(stint.toYear)
      for (let y = from; y <= to; y++) {
        if (Number.isFinite(y)) set.add(y)
      }
    }
  }
  if (player.teamsByYear) {
    for (const k of Object.keys(player.teamsByYear)) {
      const y = Number(k)
      if (Number.isFinite(y)) set.add(y)
    }
  }
  if (player.statsByYear) {
    for (const k of Object.keys(player.statsByYear)) {
      const y = Number(k)
      if (Number.isFinite(y)) set.add(y)
    }
  }
  return Array.from(set).sort((a, b) => b - a)
}

/**
 * Find games the player participated in for a given season — the
 * source for the "select a past game" dropdown. Filters the dynasty's
 * games[] to those where the player's team played that year.
 */
export function getCardGameOptions(player, dynasty, year) {
  if (!player || !dynasty || !year) return []
  const yr = Number(year)
  const teamTid = resolveTeamForYear(player, dynasty, yr)
  if (!teamTid) return []

  const games = (dynasty.games || []).filter(g => {
    if (!g) return false
    if (Number(g.year) !== yr) return false
    if (typeof g.team1Score !== 'number' || typeof g.team2Score !== 'number') return false
    const t1 = Number(g.team1Tid)
    const t2 = Number(g.team2Tid)
    return t1 === teamTid || t2 === teamTid
  })

  // Optional: only show games where the player was actually on the
  // active roster (handles mid-season transfers).
  const filtered = isPlayerOnRoster
    ? games.filter(g => isPlayerOnRoster(player, teamTid, yr))
    : games

  return filtered
    .sort((a, b) => Number(a.week ?? 0) - Number(b.week ?? 0))
    .map(g => {
      const t1 = Number(g.team1Tid)
      const playerTeamIsT1 = t1 === teamTid
      const oppTid = playerTeamIsT1 ? Number(g.team2Tid) : Number(g.team1Tid)
      const opp = dynasty.teams?.[oppTid]
      const playerScore = playerTeamIsT1 ? g.team1Score : g.team2Score
      const oppScore = playerTeamIsT1 ? g.team2Score : g.team1Score
      const won = playerScore > oppScore
      const isHome = g.homeTeamTid != null && Number(g.homeTeamTid) === teamTid
      const isNeutral = g.homeTeamTid == null
      const location = isNeutral ? 'neutral' : (isHome ? 'home' : 'away')
      return {
        gameId: g.id,
        week: g.week,
        opponentTid: oppTid,
        opponentName: opp?.name || g.team2 || '',
        opponentAbbr: opp?.abbr || '',
        opponentColors: { primary: opp?.primaryColor, secondary: opp?.secondaryColor },
        playerScore, oppScore, won, location, raw: g,
      }
    })
}

/**
 * Compose the SCENE paragraph from a selected game or award. Image
 * models render stadium scenes much better when the crowd colors,
 * stadium home, and home/away framing are explicit.
 */
function buildSceneBlock({ gameContext, awardContext, dynasty, teamName, teamPrimary, teamSecondary }) {
  if (awardContext?.name) {
    return `Award presentation context — render in a formal trophy / award setting appropriate for the ${awardContext.name} (${awardContext.year}). Backdrop: a tasteful neutral stage rather than a stadium. The player wears their college uniform.`
  }
  if (gameContext) {
    const { opponentName, location, opponentColors, week, year } = gameContext
    const isHome = location === 'home'
    const isAway = location === 'away'
    const isNeutral = location === 'neutral'
    const stadiumHome = isHome ? teamName : (isAway ? opponentName : null)

    const lines = []
    lines.push(`Game-day setting from Week ${week ?? '?'} of the ${year ?? '?'} season vs ${opponentName || 'opponent'}.`)
    if (isHome) {
      lines.push(`Player's HOME stadium — the crowd in the background wears mostly ${teamPrimary || 'team primary color'} and ${teamSecondary || 'team secondary color'}.`)
      lines.push(`Player wears the home uniform (typically the team's primary-color jersey).`)
    } else if (isAway) {
      lines.push(`AWAY game at ${opponentName || 'the opponent'}'s stadium — the crowd in the background wears the opponent's colors (${opponentColors?.primary || 'opponent primary'} and ${opponentColors?.secondary || 'opponent secondary'}).`)
      lines.push(`Player wears the away uniform (typically a white or alternate jersey).`)
    } else if (isNeutral) {
      lines.push(`NEUTRAL-SITE game — the crowd is split between both fan bases (${teamPrimary || 'team primary'} on one side, ${opponentColors?.primary || 'opponent primary'} on the other).`)
      lines.push(`Player wears their primary uniform.`)
    }
    lines.push(`Stadium lighting and weather are realistic for a college football Saturday in season.`)
    return lines.join(' ')
  }
  return ''
}

/**
 * Look at the player's awards data and produce a short honor-banner
 * string for the chosen year, or null. Only injects on real awards.
 */
function inferHonorTag(player, dynasty, year) {
  const yr = Number(year)
  // 1. Player-level awards array (may exist on enriched player records)
  const awardsForYear = (player.awards || []).filter(a => Number(a.year) === yr)
  if (awardsForYear.length > 0) {
    // Prefer Heisman / national awards over conference honors.
    const ranked = ['Heisman', 'National Player of the Year', 'All-American', 'All-Conference', 'Player of the Year', 'POW']
    for (const tag of ranked) {
      const match = awardsForYear.find(a => (a.name || '').includes(tag))
      if (match) return match.name
    }
    return awardsForYear[0].name
  }
  // 2. Fall through to dynasty-level awards by year/player
  const yrAwards = dynasty?.awardsByYear?.[yr]
  if (yrAwards) {
    for (const [name, recipients] of Object.entries(yrAwards)) {
      const arr = Array.isArray(recipients) ? recipients : [recipients]
      if (arr.some(r => r?.pid === player.pid)) return name
    }
  }
  return null
}
