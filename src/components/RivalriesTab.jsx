import { useState, useMemo, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { getContrastTextColor } from '../utils/colorUtils'
import { getTeamLogoByTid } from '../data/teams'
import { getTeamBrandProfile } from '../data/teamBrandProfiles'
import { getNameFromTid } from '../data/teamRegistry'
import { getTidFromAbbr, getAbbrFromTid } from '../data/teamRegistry'
import ImageUpload from './ImageUpload'
import {
  computeRivalryScores,
  computeSeriesRecord,
  groupRivalryEvents,
  rivalryEventLabel,
  getKnownRivalsForAbbr,
  TEAM_STATE,
  RIVALRY_FORM_THRESHOLD,
  RIVALRY_DORMANT_YEARS,
  RIVALRY_NAME_YEARS,
  RIVALRY_TROPHY_YEARS,
  RIVALRY_TRANSFER_LOOKBACK,
  RIVALRY_COACH_LOOKBACK,
} from '../utils/rivalryEngine'

function genId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

// ─── Trophy prompt builder ──────────────────────────────────────────────────

function hexToColorDesc(hex) {
  if (!hex) return null
  try {
    const r = parseInt(hex.slice(1, 3), 16)
    const g = parseInt(hex.slice(3, 5), 16)
    const b = parseInt(hex.slice(5, 7), 16)
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    const brightness = (r * 299 + g * 587 + b * 114) / 1000
    if (brightness < 40)  return 'black'
    if (brightness > 220) return 'white/silver'
    if (r > 180 && g > 160 && b < 80)  return 'gold/yellow'
    if (r > 200 && g > 100 && b < 60)  return 'orange'
    if (r > 160 && g < 80  && b < 80)  return 'crimson/red'
    if (r > 120 && g < 60  && b > 120) return 'purple'
    if (r < 80  && g < 80  && b > 160) return 'royal blue'
    if (r < 100 && g > 140 && b < 100) return 'green'
    if (r > 140 && g > 100 && b > 100) return 'maroon/dark red'
    if (r > 100 && g > 130 && b > 160) return 'light blue/silver'
    return 'dark metallic'
  } catch { return null }
}

function gameTypeLabel(game) {
  switch (game.gameType) {
    case 'conference_championship': return 'Conference Championship Game'
    case 'cfp_first_round':         return 'CFP First Round'
    case 'cfp_quarterfinal':        return 'CFP Quarterfinal'
    case 'cfp_semifinal':           return 'CFP Semifinal'
    case 'cfp_championship':        return 'CFP National Championship'
    case 'bowl':                    return game.bowlName || 'Bowl Game'
    default:                        return 'Postseason Game'
  }
}

function buildTrophyPrompt(dynasty, rivalry, myTid) {
  const myTidNum    = Number(myTid)
  const rivalTidNum = Number(rivalry.rivalTid)
  const curYear     = dynasty.currentYear || 2025

  const myTeam    = dynasty.teams?.[myTidNum]
  const rivalTeam = dynasty.teams?.[rivalTidNum]
  // The actual hosted logo image for each team — a text description alone
  // (even a good one) still leaves the model inventing its own generic
  // interpretation of "an eagle" or "a horse." Giving the user the real
  // image URLs to download and attach as reference images alongside this
  // text prompt is the only way a multimodal image generator can draw the
  // ACTUAL logo instead of a lookalike.
  const myLogoUrl    = getTeamLogoByTid(myTidNum, dynasty.teams)
  const rivalLogoUrl = getTeamLogoByTid(rivalTidNum, dynasty.teams)

  const myName    = myTeam?.name    || `Team ${myTidNum}`
  const rivalName = rivalTeam?.name || `Team ${rivalTidNum}`
  const myAbbr    = myTeam?.abbr    || ''
  const rivalAbbr = rivalTeam?.abbr || ''
  const myState   = TEAM_STATE[myAbbr]    || null
  const rivalState = TEAM_STATE[rivalAbbr] || null
  const sameState  = myState && myState === rivalState

  // Real mascot/visual identity — pulled from the researched brand-profile
  // database, NOT inferred from the team name string. A team name alone
  // ("Mean Green") gives an AI image generator nothing to anchor on and it
  // will invent a creature (a dragon has actually happened for North Texas,
  // whose real mascot is Scrappy the Eagle) — motifs/logoDescription give it
  // the real, specific creature/symbol so it can't substitute one.
  const myBrand    = getTeamBrandProfile(myName)
  const rivalBrand = getTeamBrandProfile(rivalName)
  const mascotLine = (name, brand) => {
    if (!brand) {
      return `${name}: no verified mascot on file — do NOT invent or guess an animal/creature for this program. Keep the design anchored to the team name, colors, and region only.`
    }
    const parts = [`${name}: real mascot/visual identity is ${brand.motifs?.length ? brand.motifs.join(', ') : brand.shortNickname || 'unspecified'}.`]
    if (brand.logoDescription) parts.push(`Real logo: ${brand.logoDescription}`)
    if (brand.graphicNotes) parts.push(`Brand notes: ${brand.graphicNotes}`)
    return parts.join(' ')
  }
  const myMascotLine = mascotLine(myName, myBrand)
  const rivalMascotLine = mascotLine(rivalName, rivalBrand)

  const myColor1   = hexToColorDesc(myTeam?.primaryColor)
  const myColor2   = hexToColorDesc(myTeam?.secondaryColor)
  const rivColor1  = hexToColorDesc(rivalTeam?.primaryColor)
  const rivColor2  = hexToColorDesc(rivalTeam?.secondaryColor)

  const colorLine = [myColor1, myColor2].filter(Boolean).join(' and ')
  const rivColorLine = [rivColor1, rivColor2].filter(Boolean).join(' and ')

  const regionList   = [...new Set([myState, rivalState].filter(Boolean))]
  const regionPhrase = regionList.length === 2
    ? `${regionList[0]} and ${regionList[1]}`
    : regionList[0] || 'the region'

  // ── Series record ──────────────────────────────────────────────────────────
  const series = computeSeriesRecord(dynasty, myTidNum, rivalTidNum)
  const { wins, losses, streak, lastResult, gamesPlayed } = series
  const leader = wins > losses ? myName : wins < losses ? rivalName : null
  const seriesLine = leader
    ? `${leader} leads the all-time series ${Math.max(wins, losses)}–${Math.min(wins, losses)} (${gamesPlayed} games played)`
    : `The all-time series is tied ${wins}–${wins} (${gamesPlayed} games played)`
  const streakLine = streak >= 2
    ? `${lastResult === 'W' ? myName : rivalName} has won ${streak} straight.`
    : ''

  // ── Actual big games between the two teams ─────────────────────────────────
  const bigGamesPlayed = (dynasty.games || [])
    .filter(g => {
      const t1 = Number(g.team1Tid), t2 = Number(g.team2Tid)
      return ((t1 === myTidNum && t2 === rivalTidNum) || (t1 === rivalTidNum && t2 === myTidNum))
        && g.gameType && g.gameType !== 'regular'
        && g.team1Score != null && g.team2Score != null
    })
    .sort((a, b) => Number(a.year) - Number(b.year))
    .map(g => {
      const t1 = Number(g.team1Tid)
      const myScore  = t1 === myTidNum ? g.team1Score : g.team2Score
      const rivScore = t1 === myTidNum ? g.team2Score : g.team1Score
      const winner   = myScore > rivScore ? myName : rivalName
      return `${g.year} ${gameTypeLabel(g)} — ${winner} won ${Math.max(myScore, rivScore)}–${Math.min(myScore, rivScore)}`
    })

  // ── Star players who transferred to the rival ─────────────────────────────
  const transferCutoff = curYear - 12
  const starTransfers = (dynasty.players || [])
    .flatMap(player => {
      if (!player?.movements) return []
      return player.movements
        .filter(m => {
          const year = Number(m.year)
          if (year < transferCutoff) return false
          const fromTid = Number(m.fromTid ?? m.fromTeamTid)
          const toTid   = Number(m.toTid   ?? m.toTeamTid)
          if (fromTid !== myTidNum || toTid !== rivalTidNum) return false
          const ovr = player.overallByYear?.[year] ?? player.overallByYear?.[year - 1] ?? player.overall ?? 0
          return Number(ovr) >= 80
        })
        .map(m => ({
          year: m.year,
          name: player.name || 'unnamed player',
          pos:  player.position || '',
          ovr:  player.overallByYear?.[m.year] ?? player.overall ?? '',
        }))
    })
    .sort((a, b) => Number(a.year) - Number(b.year))

  // ── Coach who left for the rival ──────────────────────────────────────────
  const coachHistory  = dynasty.coachTeamByYear || {}
  const coachDepartures = Object.keys(coachHistory).map(Number).sort()
    .filter(year => {
      if (year < curYear - 10) return false
      const entry = coachHistory[year]
      if (!entry || Number(entry.tid) !== myTidNum) return false
      const next = coachHistory[year + 1]
      return next && Number(next.tid) === rivalTidNum
    })
    .map(year => {
      const staffEntry = dynasty.teams?.[myTidNum]?.byYear?.[year]?.lockedCoachingStaff
        || dynasty.coachingStaff
      const coachName = staffEntry?.hcName || 'the head coach'
      return `${year + 1}: ${coachName} left ${myName} to become head coach at ${rivalName}`
    })

  // ── Assemble the origin narrative ─────────────────────────────────────────
  const originEvents = []
  if (sameState) originEvents.push(`Both programs share the same state — ${myState} — which means every game between them is a local war.`)
  starTransfers.forEach(t =>
    originEvents.push(`${t.year}: ${t.name}${t.pos ? ` (${t.pos})` : ''}${t.ovr ? `, rated ${t.ovr} overall,` : ''} transferred from ${myName} to ${rivalName}.`)
  )
  coachDepartures.forEach(d => originEvents.push(d))
  bigGamesPlayed.forEach(bg => originEvents.push(bg))

  // ── Trophy identity ────────────────────────────────────────────────────────
  // trophyDescription (when saved) is the single most important input to this
  // whole prompt — it's the user's OWN already-written spec for what this
  // object physically is. Once one exists, it's the ground truth to render,
  // not flavor text alongside the AI's own invention.
  const hasTrophyDesc = !!(rivalry.trophyDescription || '').trim()
  const rivalryNameLine = rivalry.name
    ? `This rivalry is known as "${rivalry.name}".`
    : ''

  // Off by default (no text at all). When on, the ONLY text allowed is the
  // trophy/rivalry name — never a record, score, or date, which would be
  // permanently wrong pixels the moment another game is played.
  const includeText = !!rivalry.trophyIncludeText
  const allowedNames = [
    rivalry.trophyName ? `The trophy name: "${rivalry.trophyName}"` : null,
    rivalry.name ? `The rivalry name: "${rivalry.name}"` : null,
  ].filter(Boolean)

  const textRuleShort = includeText && allowedNames.length > 0
    ? `The trophy may be engraved with ${[rivalry.trophyName && `"${rivalry.trophyName}"`, rivalry.name && `"${rivalry.name}"`].filter(Boolean).join(' and ')} — no other words, dates, or records.`
    : `No text, letters, or numbers anywhere on the trophy — communicate identity entirely through imagery, not writing.`

  return `COMMISSION: One-of-a-kind rivalry trophy — ${myName} vs. ${rivalName}
This trophy must be impossible to mistake for any other rivalry. It exists for these two programs and no one else.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
THE PROGRAMS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${myName}
  Colors: ${colorLine || 'unknown'}
  State: ${myState || 'unknown'}
  ${myMascotLine}${myLogoUrl ? `
  Real logo image (download this and attach it to your message as a reference image before sending): ${myLogoUrl}
  This attached image is the COMPLETE and ONLY mascot representation to use for ${myName} — reproduce exactly what is in that image (the same shapes, the same crop) and stop there. Do NOT add a head, face, body, or any other creature part that isn't already drawn in that reference image, even if the mascot description above mentions an animal. If the logo is a wing, a paw, an abstract mark, or any partial/stylized shape, the trophy uses that exact partial shape — it does NOT get "completed" into a full animal.` : ''}

${rivalName}
  Colors: ${rivColorLine || 'unknown'}
  State: ${rivalState || 'unknown'}
  ${rivalMascotLine}${rivalLogoUrl ? `
  Real logo image (download this and attach it to your message as a reference image before sending): ${rivalLogoUrl}
  This attached image is the COMPLETE and ONLY mascot representation to use for ${rivalName} — reproduce exactly what is in that image (the same shapes, the same crop) and stop there. Do NOT add a head, face, body, or any other creature part that isn't already drawn in that reference image, even if the mascot description above mentions an animal. If the logo is a wing, a paw, an abstract mark, or any partial/stylized shape, the trophy uses that exact partial shape — it does NOT get "completed" into a full animal.` : ''}

${rivalryNameLine}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
HOW THIS RIVALRY WAS BORN
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${originEvents.length > 0
  ? originEvents.map(e => `• ${e}`).join('\n')
  : `• These teams have met ${gamesPlayed} time${gamesPlayed !== 1 ? 's' : ''}, building tension quietly over the years.`}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
THE SERIES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${seriesLine}. ${streakLine}
${bigGamesPlayed.length > 0 ? `\nBig game history:\n${bigGamesPlayed.map(g => `  ${g}`).join('\n')}` : ''}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
THE TROPHY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${rivalry.trophyName ? `The trophy is officially called the "${rivalry.trophyName}." Every design choice should feel like it earned that name.` : 'The trophy has not yet been named — its design should be so specific that the name becomes obvious once you see it.'}

${hasTrophyDesc
    ? `This exact object has already been designed — render it as written, don't redesign it:
"${rivalry.trophyDescription.trim()}"
Every detail named there (materials, shapes, figures, textures) should appear in the image. Materials still render in metal (see below) even if the description mentions something else.`
    : `No design has been written yet — invent one from the real mascots above, the ${regionPhrase} region, both teams' colors, and the origin story above.`}

REAL CFB TROPHY DESIGN PRECEDENTS — the logic and spirit to draw from, not the literal materials (this trophy is metal only):
• Floyd of Rosedale (Iowa–Minnesota): Bronze pig from a real gubernatorial wager over prize livestock. The trophy IS the story.
• The Golden Boot (LSU–Arkansas): A gold football cleat. One object. Immediately understood.
• Paul Bunyan's Axe (Minnesota–Wisconsin): An actual axe, with every year's score painted on the handle.
• Old Oaken Bucket (Indiana–Purdue): A found object made sacred by what teams went through to win it.
• Cy-Hawk (Iowa–Iowa State): One figure blending both real mascots. Two identities, no hierarchy.

DESIGN REQUIREMENTS:
1. Use the REAL mascots/logos referenced above exactly as they appear in the attached reference images, and ONLY what appears in those images — never an invented or generic-lookalike creature, and never extra parts (heads, faces, bodies, limbs) bolted onto a logo that doesn't already contain them
2. Crafted entirely from metal — gold, silver, bronze, brass, aluminum, and/or stainless steel — no wood, stone, glass, fabric, or plastic anywhere
3. Large and substantial, the scale and weight of a real championship trophy (the kind that takes two or three people to lift onto a stage) — not a small desktop or shelf trophy. If the design has any lattice, frame, or tower structure, its beams/struts must be drawn THICK like real structural steel I-beams, not thin rods or wire — thin lattice reads as a small delicate model no matter how the shot is framed
4. The ${regionPhrase} identity should be physically present — landscape, industry, culture
5. The colors — ${[colorLine, rivColorLine].filter(Boolean).join(' / ')} — should appear in the metal finishes
6. ${textRuleShort} This also rules out engraved coordinates, dates, or map grid numbers dressed up as a "design detail" — those are still text.
7. Impossible to mistake for any other trophy on earth

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
IMAGE GENERATION PROMPT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Photorealistic 8K HDR photograph of ONLY the trophy described above, sitting on a plain white or soft light-gray seamless backdrop (not a colored screen — a saturated backdrop bounces color onto reflective metal and causes an ugly tinted edge). Neutral studio lighting, true metallic reflections. One single image, one trophy — not a collage, not multiple variants.

CAMERA & COMPOSITION — this is the difference between "monumental trophy" and "tabletop knickknack," so follow it exactly: shoot from a slightly LOW angle, as if you were standing on the floor looking slightly UP at the trophy — the same angle you'd use photographing a life-size monument or statue, never a straight-on or downward angle (those flatten scale and make anything look small). The single most important rule, which overrides everything else in this section: the ENTIRE trophy — including its very top and every edge — must be fully inside the frame with a visible margin of backdrop on all four sides (top, bottom, left, right). Nothing may touch or cross the edge of the image. Within that hard constraint, make the trophy as large as possible so it still feels imposing rather than small and distant — but never so large that any part (especially the top of a tall design) gets pushed out of frame or cropped. When in doubt, zoom out slightly and leave more margin rather than risk cutting off any part of the trophy.

Deliver the result as a PNG so it can be uploaded here directly.`
}

// ─── Names & Description prompt builder ────────────────────────────────────
// Text prompt for Claude/ChatGPT to generate rivalry name, trophy name,
// and narrative descriptions. Run this first, then paste results into the
// fields, then use the image prompt to generate the trophy photo.

function buildNamesPrompt(dynasty, rivalry, myTid) {
  const myTidNum    = Number(myTid)
  const rivalTidNum = Number(rivalry.rivalTid)
  const curYear     = dynasty.currentYear || 2025

  const myTeam    = dynasty.teams?.[myTidNum]
  const rivalTeam = dynasty.teams?.[rivalTidNum]
  const myName    = myTeam?.name    || `Team ${myTidNum}`
  const rivalName = rivalTeam?.name || `Team ${rivalTidNum}`
  const myAbbr    = myTeam?.abbr    || ''
  const rivalAbbr = rivalTeam?.abbr || ''
  const myState   = TEAM_STATE[myAbbr]    || null
  const rivalState = TEAM_STATE[rivalAbbr] || null
  const sameState  = myState && myState === rivalState
  const regionList = [...new Set([myState, rivalState].filter(Boolean))]
  const regionPhrase = regionList.length === 2 ? `${regionList[0]} and ${regionList[1]}` : regionList[0] || 'the region'

  const series = computeSeriesRecord(dynasty, myTidNum, rivalTidNum)
  const { wins, losses, gamesPlayed, streak, lastResult } = series
  const leader = wins > losses ? myName : wins < losses ? rivalName : null
  const seriesLine = leader
    ? `${leader} leads ${Math.max(wins, losses)}–${Math.min(wins, losses)} in ${gamesPlayed} games`
    : `Tied ${wins}–${wins} in ${gamesPlayed} games`
  const streakLine = streak >= 2 ? `${lastResult === 'W' ? myName : rivalName} has won ${streak} straight.` : ''

  // Big games
  const bigGamesPlayed = (dynasty.games || [])
    .filter(g => {
      const t1 = Number(g.team1Tid), t2 = Number(g.team2Tid)
      return ((t1 === myTidNum && t2 === rivalTidNum) || (t1 === rivalTidNum && t2 === myTidNum))
        && g.gameType && g.gameType !== 'regular'
        && g.team1Score != null && g.team2Score != null
    })
    .sort((a, b) => Number(a.year) - Number(b.year))
    .map(g => {
      const t1 = Number(g.team1Tid)
      const myScore  = t1 === myTidNum ? g.team1Score : g.team2Score
      const rivScore = t1 === myTidNum ? g.team2Score : g.team1Score
      const winner   = myScore > rivScore ? myName : rivalName
      const label    = g.gameType === 'conference_championship' ? 'Conference Championship'
        : g.gameType === 'cfp_championship' ? 'CFP National Championship'
        : g.gameType?.startsWith('cfp') ? 'CFP Playoff'
        : g.bowlName || 'Bowl Game'
      return `${g.year} ${label} — ${winner} won ${Math.max(myScore, rivScore)}–${Math.min(myScore, rivScore)}`
    })

  // Star transfers
  const starTransfers = (dynasty.players || [])
    .flatMap(player => {
      if (!player?.movements) return []
      return player.movements
        .filter(m => {
          const fromTid = Number(m.fromTid ?? m.fromTeamTid)
          const toTid   = Number(m.toTid   ?? m.toTeamTid)
          if (fromTid !== myTidNum || toTid !== rivalTidNum) return false
          const ovr = player.overallByYear?.[m.year] ?? player.overall ?? 0
          return Number(ovr) >= 80
        })
        .map(m => `${m.year}: ${player.name || 'Star player'}${player.position ? ` (${player.position})` : ''} transferred to ${rivalName}`)
    })

  // Coach departures
  const coachHistory = dynasty.coachTeamByYear || {}
  const coachDepartures = Object.keys(coachHistory).map(Number).sort()
    .filter(year => {
      const entry = coachHistory[year]
      if (!entry || Number(entry.tid) !== myTidNum) return false
      const next = coachHistory[year + 1]
      return next && Number(next.tid) === rivalTidNum
    })
    .map(year => {
      const coachName = dynasty.coachingStaff?.hcName || 'the head coach'
      return `${year + 1}: ${coachName} left ${myName} for ${rivalName}`
    })

  const originEvents = [
    ...(sameState ? [`Both programs are from ${myState} — every game is an in-state war`] : []),
    ...starTransfers,
    ...coachDepartures,
    ...bigGamesPlayed,
  ]

  const existingName   = rivalry.name       ? `Current rivalry name: "${rivalry.name}" (keep or improve it)` : 'No rivalry name yet — suggest one.'
  const existingTrophy = rivalry.trophyName ? `Current trophy name: "${rivalry.trophyName}" (keep or improve it)` : 'No trophy name yet — suggest one.'

  return `You are a college football historian, creative director, and storyteller. Your job is to name and describe an emerging rivalry — one that grew organically inside a dynasty, not one copied from real life.

THE RIVALRY
${myName} vs. ${rivalName}
${sameState ? `Both from ${myState}.` : regionList.filter(Boolean).map((s, i) => `${[myName, rivalName][i]} from ${s}`).join('; ') + '.'}

HOW IT DEVELOPED
${originEvents.length > 0 ? originEvents.map(e => `• ${e}`).join('\n') : `• ${gamesPlayed} meetings, tension built slowly`}

THE SERIES
${seriesLine}. ${streakLine}

WHAT TO NAME AND DESCRIBE
${existingName}
${existingTrophy}

NAMING RULES
• The rivalry name should feel earned, not generic. It should say something true about these two programs, their region, or the story of how this rivalry formed. "The Border War", "Clean, Old-Fashioned Hate", "Bedlam", "The Iron Bowl" — names that mean something beyond football.
• The trophy name should be a physical object or concept that could actually exist. "The Golden Boot", "Floyd of Rosedale", "Paul Bunyan's Axe" — specific, visual, rooted in place or story.
• Both names must be specific to these two teams. They could not belong to any other rivalry.

DESCRIPTION RULES
• The rivalry description should read like the opening paragraph of a great sports column — 2-3 sentences that explain why this rivalry matters, what it feels like to play in it, and what's at stake beyond a win or a loss.
• The trophy description should describe the physical object in vivid, specific terms — what it's made of, what it looks like, what it represents, why it fits these two teams. 2-3 sentences. Write it as if describing a real object to someone who has never seen it.

OUTPUT — return exactly this format, nothing else:
RIVALRY NAME: [name]
TROPHY NAME: [name]
RIVALRY DESCRIPTION: [2-3 sentences]
TROPHY DESCRIPTION: [2-3 sentences describing the physical object]`
}

// ─── AI output parser ───────────────────────────────────────────────────────
// Parses buildNamesPrompt's exact output format:
//   RIVALRY NAME: ...
//   TROPHY NAME: ...
//   RIVALRY DESCRIPTION: ... (can span multiple lines/paragraphs)
//   TROPHY DESCRIPTION: ... (can span multiple lines/paragraphs)
// Order-independent, tolerant of stray markdown bold markers (**LABEL:**)
// around a label and blank lines between sections. Returns '' for any
// field that isn't found rather than throwing, so a partial/malformed
// paste still fills whatever it can.

const AI_OUTPUT_LABELS = ['RIVALRY NAME', 'TROPHY NAME', 'RIVALRY DESCRIPTION', 'TROPHY DESCRIPTION']

function extractLabeledField(text, label) {
  const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const others = AI_OUTPUT_LABELS.filter((l) => l !== label).map(escape).join('|')
  const re = new RegExp(
    `\\**${escape(label)}\\**\\s*:\\s*([\\s\\S]*?)(?=\\**(?:${others})\\**\\s*:|$)`,
    'i'
  )
  const m = text.match(re)
  return m ? m[1].trim() : ''
}

function parseAiNamesOutput(text) {
  if (!text || !text.trim()) return null
  const result = {
    name: extractLabeledField(text, 'RIVALRY NAME'),
    trophyName: extractLabeledField(text, 'TROPHY NAME'),
    description: extractLabeledField(text, 'RIVALRY DESCRIPTION'),
    trophyDescription: extractLabeledField(text, 'TROPHY DESCRIPTION'),
  }
  // Nothing recognizable at all — treat as a failed parse so the caller
  // can fall back to showing the raw text for the user to sort out.
  if (!result.name && !result.trophyName && !result.description && !result.trophyDescription) return null
  return result
}

// ─── Edit Rivalry Modal ─────────────────────────────────────────────────────

function EditRivalryModal({ rivalry, dynasty, myTid, currentYear, onSave, onDelete, onClose }) {
  // Synced-from-save rivalries (cfb27SaveSync.js's `cfb27-rival-*` ids) are
  // already confirmed real rivalries by the game itself — no reason to make
  // the user wait 5/10 years to name something that's already official.
  const isSynced = typeof rivalry.id === 'string' && rivalry.id.startsWith('cfb27-rival-')

  const [name,             setName]             = useState(rivalry.name             || '')
  const [description,      setDescription]      = useState(rivalry.description      || '')
  const [formedYear,       setFormedYear]       = useState(rivalry.formedYear != null ? String(rivalry.formedYear) : '')
  const [trophy,           setTrophy]           = useState(rivalry.trophyName       || '')
  const [trophyDesc,       setTrophyDesc]       = useState(rivalry.trophyDescription || '')
  const [trophyImageUrl,   setTrophyImageUrl]   = useState(rivalry.trophyImageUrl   || '')
  // Off by default — the trophy image generator otherwise stays engraving-
  // free. When on, the ONLY text it's allowed to add is the trophy/rivalry
  // name (never a record, score, or date — those go stale the moment a game
  // is played, and would be permanently wrong pixels baked into the image).
  const [includeText,      setIncludeText]      = useState(!!rivalry.trophyIncludeText)
  const [active,           setActive]           = useState(rivalry.active !== false)
  // Manual escape hatch for any rivalry the user doesn't want to wait on —
  // read live off state (not the saved prop) so flipping the toggle
  // unlocks the fields in this same render, not after the autosave
  // round-trip finishes.
  const [forceUnlocked,    setForceUnlocked]    = useState(!!rivalry.forceUnlocked)
  // Read live off the formedYear field itself (not the saved prop) so
  // editing it updates the Name/Trophy unlock timers in this same render.
  const formedYearNum = formedYear.trim() ? Number(formedYear.trim()) : null
  const yearsFormed = formedYearNum ? currentYear - formedYearNum : 0
  const canName   = rivalry.manuallyAdded || isSynced || forceUnlocked || yearsFormed >= RIVALRY_NAME_YEARS
  const canTrophy = rivalry.manuallyAdded || isSynced || forceUnlocked || yearsFormed >= RIVALRY_TROPHY_YEARS
  const [confirmDelete,    setConfirmDelete]    = useState(false)
  const [namesCopied,      setNamesCopied]      = useState(false)
  const [imageCopied,      setImageCopied]      = useState(false)
  const [viewingPrompt,    setViewingPrompt]    = useState(null) // 'names' | 'image' | null
  const [savedIndicator,   setSavedIndicator]   = useState(false)
  const [showPasteBox,     setShowPasteBox]     = useState(false)
  const [pasteText,        setPasteText]        = useState('')
  const [pasteFilled,      setPasteFilled]      = useState(false)
  const [pasteFailed,      setPasteFailed]      = useState(false)
  const isFirstRender = useRef(true)

  // Applies a parsed AI-output object onto the four text fields — only
  // overwriting a field the AI actually returned, so a partial paste
  // (e.g. trophy fields only) never blanks out fields you already had.
  function applyParsedFields(parsed) {
    if (!parsed) return false
    if (parsed.name) setName(parsed.name)
    if (parsed.trophyName) setTrophy(parsed.trophyName)
    if (parsed.description) setDescription(parsed.description)
    if (parsed.trophyDescription) setTrophyDesc(parsed.trophyDescription)
    return true
  }

  async function handlePasteAiOutput() {
    setPasteFailed(false)
    if (navigator.clipboard?.readText) {
      try {
        const text = await navigator.clipboard.readText()
        const parsed = parseAiNamesOutput(text)
        if (applyParsedFields(parsed)) {
          setPasteFilled(true)
          setTimeout(() => setPasteFilled(false), 2000)
          setShowPasteBox(false)
          return
        }
      } catch {
        // Clipboard read blocked (permissions/browser) — fall through to
        // the manual paste box below.
      }
    }
    setShowPasteBox(true)
  }

  function handleFillFromPasteBox() {
    const parsed = parseAiNamesOutput(pasteText)
    if (applyParsedFields(parsed)) {
      setPasteFilled(true)
      setTimeout(() => setPasteFilled(false), 2000)
      setShowPasteBox(false)
      setPasteText('')
    } else {
      setPasteFailed(true)
    }
  }

  // Auto-save 600ms after any field stops changing
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return }
    const t = setTimeout(() => {
      onSave({
        ...rivalry,
        name:              name.trim()        || null,
        description:       description.trim() || null,
        formedYear:        formedYearNum,
        trophyName:        trophy.trim()      || null,
        trophyDescription: trophyDesc.trim()  || null,
        trophyImageUrl:    trophyImageUrl.trim() || null,
        trophyIncludeText: includeText,
        forceUnlocked,
        active,
      })
      setSavedIndicator(true)
      setTimeout(() => setSavedIndicator(false), 1500)
    }, 600)
    return () => clearTimeout(t)
  }, [name, description, formedYear, trophy, trophyDesc, trophyImageUrl, includeText, active, forceUnlocked]) // eslint-disable-line

  function copyText(text, setFlag, promptKey) {
    const finish = (ok) => {
      if (ok) {
        setFlag(true)
        setTimeout(() => setFlag(false), 2500)
      } else {
        setViewingPrompt(promptKey)
      }
    }
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(() => finish(true)).catch(() => execCopy(text, finish))
    } else {
      execCopy(text, finish)
    }
  }

  function execCopy(text, onResult) {
    const ta = document.createElement('textarea')
    ta.value = text
    // Must sit in viewport (not opacity:0 / off-screen) for execCommand to work in all browsers
    ta.style.cssText = 'position:fixed;top:0;left:0;width:2px;height:2px;padding:0;border:none;outline:none;box-shadow:none;background:transparent'
    document.body.appendChild(ta)
    ta.focus()
    ta.select()
    let ok = false
    try { ok = document.execCommand('copy') } catch { ok = false }
    document.body.removeChild(ta)
    onResult(ok)
  }

  function handleSave() {
    onSave({
      ...rivalry,
      name:             name.trim()        || null,
      description:      description.trim() || null,
      formedYear:       formedYearNum,
      trophyName:       trophy.trim()      || null,
      trophyDescription: trophyDesc.trim() || null,
      trophyImageUrl:   trophyImageUrl.trim() || null,
      trophyIncludeText: includeText,
      active,
    })
  }

  const team     = dynasty.teams?.[Number(rivalry.rivalTid)]
  const teamName = team?.name || `Team ${rivalry.rivalTid}`
  const bg       = team?.primaryColor || '#374151'
  const bgText   = getContrastTextColor(bg)

  // Portaled straight to document.body — mounted inline (like every other
  // modal in this file previously was), this modal's "fixed" positioning was
  // being resolved relative to some ancestor deep in TeamYear.jsx's tree
  // instead of the true viewport, so it rendered pinned to a fixed DOCUMENT
  // position rather than tracking the current scroll — after scrolling down
  // the page, it appeared far above the visible area. Every other modal in
  // this app already portals to document.body (AwardsModal, AIPromptModal,
  // etc.) specifically to avoid this class of bug.
  return createPortal(
    <div
      className="fixed inset-0 top-0 left-0 right-0 bottom-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999] p-4"
      style={{ margin: 0 }}
      onClick={onClose}
    >
      <div
        className="card w-full max-w-4xl overflow-hidden flex flex-col"
        style={{ maxHeight: '90vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 flex items-center gap-3 flex-shrink-0" style={{ backgroundColor: bg }}>
          {getTeamLogoByTid(rivalry.rivalTid, dynasty.teams) && (
            <img src={getTeamLogoByTid(rivalry.rivalTid, dynasty.teams)} alt={teamName} className="w-8 h-8 object-contain" />
          )}
          <span className="font-bold text-base flex-1" style={{ color: bgText }}>{teamName}</span>
          {savedIndicator && <span className="text-xs opacity-70 mr-1" style={{ color: bgText }}>Saved</span>}
          <button onClick={onClose} className="text-lg leading-none opacity-60 hover:opacity-100" style={{ color: bgText }}>×</button>
        </div>

        {/* Scrollable body. min-h-0 is required here — without it, a flex
            child defaults to min-height:auto (its content's natural height),
            which stops it from ever shrinking to fit maxHeight/overflow-y-
            auto on the parent. The modal was growing to its full un-clipped
            content height and centering around THAT, pushing the visible top
            edge down the page and cutting the bottom off the viewport. */}
        <div className="overflow-y-auto flex-1 min-h-0">
          <div className="p-5 space-y-5">

            {/* ── AI Prompts ── */}
            <div>
              <p className="label-xs text-txt-tertiary mb-2" style={{ letterSpacing: '1px' }}>AI TOOLS</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => copyText(buildNamesPrompt(dynasty, rivalry, myTid), setNamesCopied, 'names')}
                  className="flex-1 py-2 px-3 rounded border border-border-subtle text-xs font-medium text-txt-secondary hover:text-txt-primary hover:bg-bg-hover transition-colors text-center"
                >
                  {namesCopied ? 'Copied!' : 'Copy Rivalry & Trophy Name & Description Prompt'}
                </button>
                <button
                  type="button"
                  onClick={() => copyText(buildTrophyPrompt(dynasty, rivalry, myTid), setImageCopied, 'image')}
                  className="flex-1 py-2 px-3 rounded border border-border-subtle text-xs font-medium text-txt-secondary hover:text-txt-primary hover:bg-bg-hover transition-colors text-center"
                >
                  {imageCopied ? 'Copied!' : 'Copy Trophy Generator Prompt'}
                </button>
              </div>
              <p className="text-xs text-txt-muted mt-1.5">
                Run the Rivalry & Trophy prompt first in ChatGPT/Claude, copy its reply, then use Paste AI Output below to fill everything in at once. Then run the Trophy Generator prompt in an image generator → upload photo.
              </p>

              <button
                type="button"
                onClick={handlePasteAiOutput}
                className="w-full mt-2 py-2 px-3 rounded border border-border-subtle text-xs font-bold text-txt-primary hover:bg-bg-hover transition-colors text-center"
              >
                {pasteFilled ? 'Filled in!' : 'Paste AI Output'}
              </button>

              {/* Manual fallback — shown when clipboard read is blocked/unsupported */}
              {showPasteBox && (
                <div className="mt-2">
                  <textarea
                    autoFocus
                    className="w-full bg-bg-input border border-border-subtle rounded px-3 py-2 text-xs text-txt-primary font-mono resize-none"
                    rows={6}
                    placeholder="Click here, then Ctrl+V / Cmd+V to paste the AI's reply, then Fill Fields..."
                    value={pasteText}
                    onChange={e => { setPasteText(e.target.value); setPasteFailed(false) }}
                  />
                  {pasteFailed && (
                    <p className="text-xs text-red-500 mt-1">Couldn't find RIVALRY NAME / TROPHY NAME / RIVALRY DESCRIPTION / TROPHY DESCRIPTION labels in that text — check it matches the prompt's output format.</p>
                  )}
                  <div className="flex gap-2 mt-1.5">
                    <button
                      type="button"
                      onClick={handleFillFromPasteBox}
                      disabled={!pasteText.trim()}
                      className="flex-1 py-1.5 rounded text-xs font-bold bg-[var(--team-primary)] text-[var(--team-primary-text)] disabled:opacity-40"
                    >
                      Fill Fields
                    </button>
                    <button
                      type="button"
                      onClick={() => { setShowPasteBox(false); setPasteText(''); setPasteFailed(false) }}
                      className="flex-1 py-1.5 rounded text-xs text-txt-secondary border border-border-subtle hover:bg-bg-hover"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Fallback textarea — shown when clipboard is blocked */}
              {viewingPrompt && (
                <div className="mt-3">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs font-medium text-txt-secondary">
                      {viewingPrompt === 'names' ? 'Rivalry & Trophy Name & Description Prompt' : 'Trophy Generator Prompt'} — select all and copy
                    </p>
                    <button onClick={() => setViewingPrompt(null)} className="text-xs text-txt-muted hover:text-txt-secondary">Hide</button>
                  </div>
                  <textarea
                    readOnly
                    className="w-full bg-bg-input border border-border-subtle rounded px-3 py-2 text-xs text-txt-primary font-mono resize-none"
                    rows={8}
                    value={viewingPrompt === 'names'
                      ? buildNamesPrompt(dynasty, rivalry, myTid)
                      : buildTrophyPrompt(dynasty, rivalry, myTid)}
                    onFocus={e => e.target.select()}
                    onClick={e => e.target.select()}
                  />
                  <p className="text-xs text-txt-muted mt-1">Click the box → Ctrl+A → Ctrl+C (or Cmd+A → Cmd+C)</p>
                </div>
              )}
            </div>

            <div className="border-t border-border-subtle" />

            {/* Rivalry + Trophy side-by-side on wide screens so the whole
                form fits without scrolling — stacks back to one column on
                mobile/narrow viewports. */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

            {/* ── Rivalry section ── */}
            <div className="space-y-3">
              <p className="label-xs text-txt-tertiary" style={{ letterSpacing: '1px' }}>RIVALRY</p>

              <div>
                <label className="label-xs text-txt-tertiary block mb-1">
                  Name
                  {!canName && <span className="ml-2 text-txt-muted">(unlocks in {RIVALRY_NAME_YEARS - yearsFormed} yr{RIVALRY_NAME_YEARS - yearsFormed !== 1 ? 's' : ''})</span>}
                </label>
                <input
                  type="text"
                  className="w-full bg-bg-input border border-border-subtle rounded px-3 py-2 text-sm text-txt-primary placeholder-txt-muted"
                  placeholder={canName ? 'e.g. The Battle for the Border' : 'Locked'}
                  value={name}
                  onChange={e => setName(e.target.value)}
                  disabled={!canName}
                />
              </div>

              <div>
                <label className="label-xs text-txt-tertiary block mb-1">Description</label>
                <textarea
                  className="w-full bg-bg-input border border-border-subtle rounded px-3 py-2 text-sm text-txt-primary placeholder-txt-muted resize-none"
                  placeholder="Paste the rivalry description from AI here, or write your own..."
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  rows={3}
                />
              </div>

              <div>
                <label className="label-xs text-txt-tertiary block mb-1">Formed Year</label>
                <input
                  type="number"
                  className="w-full bg-bg-input border border-border-subtle rounded px-3 py-2 text-sm text-txt-primary placeholder-txt-muted"
                  placeholder={`e.g. ${currentYear} — leave blank if unknown`}
                  value={formedYear}
                  onChange={e => setFormedYear(e.target.value)}
                />
                <p className="text-xs text-txt-muted mt-1">Drives the "Since {'{'}year{'}'}" display and the Name/Trophy unlock timers above. Leave blank to show the current year with 0 yrs until you know the real one.</p>
              </div>
            </div>

            {/* ── Trophy section ── */}
            <div className="space-y-3 border-t border-border-subtle pt-5 lg:border-t-0 lg:pt-0 lg:border-l lg:pl-5 lg:border-border-subtle">
              <p className="label-xs text-txt-tertiary" style={{ letterSpacing: '1px' }}>
                TROPHY
                {!canTrophy && <span className="ml-2 text-txt-muted font-normal normal-case">(unlocks in {RIVALRY_TROPHY_YEARS - yearsFormed} yr{RIVALRY_TROPHY_YEARS - yearsFormed !== 1 ? 's' : ''})</span>}
              </p>

              <div>
                <label className="label-xs text-txt-tertiary block mb-1">Name</label>
                <input
                  type="text"
                  className="w-full bg-bg-input border border-border-subtle rounded px-3 py-2 text-sm text-txt-primary placeholder-txt-muted"
                  placeholder={canTrophy ? 'e.g. The Golden Helmet Trophy' : 'Locked'}
                  value={trophy}
                  onChange={e => setTrophy(e.target.value)}
                  disabled={!canTrophy}
                />
              </div>

              <div>
                <label className="label-xs text-txt-tertiary block mb-1">Description</label>
                <textarea
                  className="w-full bg-bg-input border border-border-subtle rounded px-3 py-2 text-sm text-txt-primary placeholder-txt-muted resize-none disabled:opacity-40"
                  placeholder={canTrophy ? 'Paste the trophy description from AI here, or describe it yourself...' : 'Locked'}
                  value={trophyDesc}
                  onChange={e => setTrophyDesc(e.target.value)}
                  rows={3}
                  disabled={!canTrophy}
                />
              </div>

              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-txt-primary">Engrave name on trophy</p>
                  <p className="text-xs text-txt-muted">Lets the generator add the trophy/rivalry name as text. Never a record, score, or date — those go stale. Off = no text at all.</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={includeText}
                  onClick={() => setIncludeText(v => !v)}
                  disabled={!canTrophy}
                  className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 disabled:opacity-40 ${includeText ? 'bg-green-500' : 'bg-bg-subtle'}`}
                >
                  <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${includeText ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </button>
              </div>

              <div>
                <label className="label-xs text-txt-tertiary block mb-1">Photo</label>
                {canTrophy ? (
                  <>
                    <p className="text-xs text-txt-muted mb-2">
                      To paste an image: click inside the URL field below, then press Ctrl+V / Cmd+V.
                    </p>
                    <ImageUpload
                      value={trophyImageUrl}
                      onChange={setTrophyImageUrl}
                      placeholder="Click here, then Ctrl+V/Cmd+V to paste image, or enter URL..."
                      teamColors={{ primary: bg, secondary: bg }}
                      showPreview={false}
                      hidePasteButton={true}
                      preserveTransparency={true}
                    />
                  </>
                ) : (
                  <div className="h-10 bg-bg-subtle rounded flex items-center px-3">
                    <span className="text-xs text-txt-muted">Locked</span>
                  </div>
                )}
              </div>
            </div>

            </div>

            <div className="border-t border-border-subtle" />

            {/* ── Settings ── */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-txt-primary">Active</p>
                <p className="text-xs text-txt-muted">Goes dormant if no game in {RIVALRY_DORMANT_YEARS}+ years</p>
              </div>
              <button
                onClick={() => setActive(v => !v)}
                className={`relative w-10 h-5 rounded-full transition-colors ${active ? 'bg-green-500' : 'bg-bg-subtle'}`}
              >
                <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${active ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </button>
            </div>

            {/* Manual override for the 5/10-yr name/trophy wait — only worth
                showing when something would otherwise still be locked and
                isn't already exempt (synced/manually-added rivalries). */}
            {!rivalry.manuallyAdded && !isSynced && (!canName || !canTrophy) && (
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-txt-primary">Unlock Now</p>
                  <p className="text-xs text-txt-muted">Skip the {RIVALRY_NAME_YEARS}/{RIVALRY_TROPHY_YEARS}-yr wait for naming and the trophy</p>
                </div>
                <button
                  onClick={() => setForceUnlocked(v => !v)}
                  className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ${forceUnlocked ? 'bg-green-500' : 'bg-bg-subtle'}`}
                >
                  <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${forceUnlocked ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </button>
              </div>
            )}

            {/* ── Done button ── auto-save handles saves; this just closes */}
            <button
              onClick={onClose}
              className="w-full py-2 rounded text-sm font-bold bg-[var(--team-primary)] text-[var(--team-primary-text)] hover:opacity-90"
            >
              Done
            </button>

            {/* ── Delete ── */}
            {!confirmDelete ? (
              <button onClick={() => setConfirmDelete(true)} className="w-full text-xs text-red-500 hover:text-red-400 text-center">
                Remove Rivalry
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <p className="text-xs text-txt-muted flex-1">Are you sure?</p>
                <button onClick={onDelete} className="text-xs text-red-500 font-bold">Yes, remove</button>
                <button onClick={() => setConfirmDelete(false)} className="text-xs text-txt-secondary">Cancel</button>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}

// ─── Brewing Rivalry Modal ──────────────────────────────────────────────────
// Detail view for a not-yet-formed rivalry candidate — the same point
// breakdown shown inline on the Brewing Rivalries row, plus an explicit
// override to promote it to a real rivalry immediately (skipping the score
// threshold). Read-only otherwise: there's nothing to edit until it's formed.

function BrewingRivalryModal({ rivalTid, dynasty, teamName, logo, points, events, onOverride, onClose }) {
  const grouped = groupRivalryEvents(events)
  const pct = Math.min(100, Math.round((points / RIVALRY_FORM_THRESHOLD) * 100))
  const barColor = pct >= 100 ? '#22c55e' : pct >= 60 ? '#f59e0b' : '#6b7280'
  const team = dynasty.teams?.[rivalTid]
  const bg = team?.primaryColor || '#374151'
  const bgText = getContrastTextColor(bg)

  // Portaled to document.body — see EditRivalryModal for why.
  return createPortal(
    <div
      className="fixed inset-0 top-0 left-0 right-0 bottom-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999] p-4"
      style={{ margin: 0 }}
      onClick={onClose}
    >
      <div
        className="card w-full max-w-md overflow-hidden flex flex-col"
        style={{ maxHeight: '90vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 flex items-center gap-3 flex-shrink-0" style={{ backgroundColor: bg }}>
          {logo && <img src={logo} alt={teamName} className="w-8 h-8 object-contain" />}
          <span className="font-bold text-base flex-1" style={{ color: bgText }}>{teamName}</span>
          <button onClick={onClose} className="text-lg leading-none opacity-60 hover:opacity-100" style={{ color: bgText }}>×</button>
        </div>

        <div className="overflow-y-auto flex-1 min-h-0">
          <div className="p-5 space-y-5">
            <div>
              <p className="text-xs text-txt-muted mb-2">
                Not a rivalry yet — this team hasn't crossed the {RIVALRY_FORM_THRESHOLD}-point threshold. Override below to make it official right now.
              </p>
              <button
                type="button"
                onClick={onOverride}
                className="w-full py-2.5 rounded text-sm font-bold hover:opacity-90"
                style={{ backgroundColor: 'var(--text-primary)', color: 'var(--surface-1)' }}
              >
                Override — Make This a Real Rivalry
              </button>
            </div>

            <div className="border-t border-border-subtle" />

            <div>
              <p className="label-xs text-txt-tertiary mb-2" style={{ letterSpacing: '1px' }}>RIVALRY SCORE</p>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm font-black tabular text-txt-primary">
                  {points}<span className="text-txt-muted font-normal text-xs"> / {RIVALRY_FORM_THRESHOLD} pts</span>
                </span>
                <span className="text-xs text-txt-muted">{pct}%</span>
              </div>
              <div className="relative">
                <div className="h-5 bg-bg-subtle rounded overflow-hidden">
                  <div
                    className="h-full transition-all duration-500"
                    style={{ width: `${pct}%`, backgroundColor: barColor, opacity: 0.85 }}
                  />
                </div>
                {[25, 50, 75].map(tick => (
                  <div
                    key={tick}
                    className="absolute top-0 h-5 w-px bg-bg-base opacity-40"
                    style={{ left: `${tick}%` }}
                  />
                ))}
              </div>
              <div className="flex justify-between text-xs text-txt-muted mt-1">
                <span>0</span>
                <span>Rivalry at {RIVALRY_FORM_THRESHOLD}</span>
              </div>
            </div>

            <div>
              <p className="label-xs text-txt-tertiary mb-2" style={{ letterSpacing: '1px' }}>BREAKDOWN</p>
              <div className="flex flex-wrap gap-1.5">
                {grouped.map(g => (
                  <span
                    key={g.type}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-bg-subtle text-txt-secondary"
                  >
                    <span className="font-bold text-txt-primary">+{g.points}</span>
                    {rivalryEventLabel(g.type)}{g.count > 1 ? ` ×${g.count}` : ''}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}

// ─── Add Rivalry Modal ──────────────────────────────────────────────────────

function AddRivalryModal({ dynasty, myTid, existingRivalTids, onAdd, onClose }) {
  const [search,      setSearch]      = useState('')
  const [selectedTid, setSelectedTid] = useState(null)

  const teams = Object.values(dynasty.teams || {})
    .filter(t => {
      if (!t?.tid || Number(t.tid) === Number(myTid)) return false
      if (existingRivalTids.has(Number(t.tid))) return false
      if (!search.trim()) return true
      const q = search.toLowerCase()
      return t.name?.toLowerCase().includes(q) || t.abbr?.toLowerCase().includes(q)
    })
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''))

  // Portaled to document.body — see EditRivalryModal for why.
  return createPortal(
    <div
      className="fixed inset-0 top-0 left-0 right-0 bottom-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999] p-4"
      style={{ margin: 0 }}
      onClick={onClose}
    >
      <div className="card w-full max-w-sm overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-border-subtle">
          <p className="font-bold text-txt-primary">Add Rival</p>
          <p className="text-xs text-txt-muted mt-0.5">Pick any team to add as a rival</p>
        </div>
        <div className="p-4 space-y-3">
          <input
            type="text"
            autoFocus
            className="w-full bg-bg-input border border-border-subtle rounded px-3 py-2 text-sm text-txt-primary placeholder-txt-muted"
            placeholder="Search teams..."
            value={search}
            onChange={e => { setSearch(e.target.value); setSelectedTid(null) }}
          />
          <div className="max-h-60 overflow-y-auto space-y-1">
            {teams.slice(0, 30).map(team => {
              const logo       = getTeamLogoByTid(team.tid, dynasty.teams)
              const isSelected = Number(selectedTid) === Number(team.tid)
              return (
                <button
                  key={team.tid}
                  onClick={() => setSelectedTid(team.tid)}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded text-left text-sm transition-colors ${
                    isSelected ? 'bg-[var(--team-primary)] text-[var(--team-primary-text)]' : 'hover:bg-bg-hover text-txt-primary'
                  }`}
                >
                  {logo && <img src={logo} alt={team.name} className="w-5 h-5 object-contain flex-shrink-0" />}
                  <span>{team.name}</span>
                </button>
              )
            })}
            {teams.length === 0 && <p className="text-xs text-txt-muted text-center py-4">No teams found</p>}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => { if (selectedTid) onAdd(Number(selectedTid)) }}
              disabled={!selectedTid}
              className="flex-1 py-2 rounded text-sm font-bold bg-[var(--team-primary)] text-[var(--team-primary-text)] disabled:opacity-40"
            >
              Add Rival
            </button>
            <button onClick={onClose} className="flex-1 py-2 rounded text-sm text-txt-secondary border border-border-subtle hover:bg-bg-hover">
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}

// ─── RivalryCard ────────────────────────────────────────────────────────────

function RivalryCard({ rivalry, dynasty, myTid, currentYear, series, score, rank, isFirst, isLast, onEdit, onMoveUp, onMoveDown }) {
  const { wins, losses, streak, lastResult, lastPlayedYear } = series
  const team      = dynasty.teams?.[Number(rivalry.rivalTid)]
  const teamName  = team?.name || `Team ${rivalry.rivalTid}`
  const bg        = team?.primaryColor || '#374151'
  const bgText    = getContrastTextColor(bg)
  const logo      = getTeamLogoByTid(rivalry.rivalTid, dynasty.teams)
  const yearsFormed = rivalry.formedYear ? currentYear - rivalry.formedYear : null
  const isDormant = lastPlayedYear != null && (currentYear - lastPlayedYear) >= RIVALRY_DORMANT_YEARS
  const isActive  = rivalry.active !== false && !isDormant
  // Rivalries synced straight from the CFB27 save (cfb27SaveSync.js's
  // rivalriesToAdd, id: `cfb27-rival-${tid}`) are already confirmed,
  // real in-game rivalries — the organic point heuristic below exists to
  // GUESS whether a rivalry has formed, which is moot once the game
  // itself has told us. Show these at a flat 100% instead of running
  // them through the same score as an undetermined pairing. Synced
  // rivalries and any rivalry the user manually force-unlocked skip the
  // 5/10-yr name/trophy wait too.
  const isSynced  = typeof rivalry.id === 'string' && rivalry.id.startsWith('cfb27-rival-')
  const canName   = rivalry.manuallyAdded || isSynced || rivalry.forceUnlocked || (yearsFormed != null && yearsFormed >= RIVALRY_NAME_YEARS)
  const canTrophy = rivalry.manuallyAdded || isSynced || rivalry.forceUnlocked || (yearsFormed != null && yearsFormed >= RIVALRY_TROPHY_YEARS)
  const hasTrophy = !!rivalry.trophyImageUrl
  const rivalTidNum = Number(rivalry.rivalTid)

  const [showHistory,       setShowHistory]       = useState(false)
  const [showTrophyLightbox, setShowTrophyLightbox] = useState(false)

  const gameHistory = useMemo(() => {
    return (dynasty.games || [])
      .filter(g => {
        const t1 = Number(g.team1Tid), t2 = Number(g.team2Tid)
        return ((t1 === myTid && t2 === rivalTidNum) || (t1 === rivalTidNum && t2 === myTid))
          && g.team1Score != null && g.team2Score != null
      })
      .map(g => {
        const t1 = Number(g.team1Tid)
        const myScore    = t1 === myTid ? g.team1Score : g.team2Score
        const theirScore = t1 === myTid ? g.team2Score : g.team1Score
        const won = Number(myScore) > Number(theirScore)
        const isBig = g.gameType && g.gameType !== 'regular'
        const gameLabel = g.gameType === 'conference_championship' ? 'CCG'
          : g.gameType === 'cfp_championship' ? 'CFP Title'
          : g.gameType === 'cfp_semifinal'    ? 'CFP Semi'
          : g.gameType === 'cfp_quarterfinal' ? 'CFP QF'
          : g.gameType === 'cfp_first_round'  ? 'CFP R1'
          : g.gameType === 'bowl'             ? (g.bowlName || 'Bowl')
          : null
        return { year: Number(g.year), myScore: Number(myScore), theirScore: Number(theirScore), won, isBig, gameLabel }
      })
      .sort((a, b) => a.year - b.year)
  }, [dynasty.games, myTid, rivalTidNum])

  return (
    <>
    {/* Trophy lightbox — portaled to document.body (see EditRivalryModal for
        why the portal matters). */}
    {showTrophyLightbox && createPortal(
      <div
        className="fixed inset-0 top-0 left-0 right-0 bottom-0 bg-black bg-opacity-90 flex items-center justify-center z-[9999] p-4"
        style={{ margin: 0 }}
        onClick={() => setShowTrophyLightbox(false)}
      >
        <div className="relative max-w-2xl w-full" onClick={e => e.stopPropagation()}>
          <img
            src={rivalry.trophyImageUrl}
            alt={rivalry.trophyName || 'Trophy'}
            className="block mx-auto max-w-full object-contain rounded-lg"
            style={{ maxHeight: '85vh' }}
          />
          {rivalry.trophyName && (
            <p className="text-white text-center text-base font-bold mt-3">{rivalry.trophyName}</p>
          )}
          {rivalry.trophyDescription && (
            <p className="text-white text-center text-sm opacity-75 mt-1">{rivalry.trophyDescription}</p>
          )}
          <button
            onClick={() => setShowTrophyLightbox(false)}
            className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black bg-opacity-60 text-white flex items-center justify-center text-lg hover:bg-opacity-90"
          >
            ×
          </button>
        </div>
      </div>,
      document.body
    )}

    <div className={`card overflow-hidden ${!isActive ? 'opacity-60' : ''}`}>

      {/* Team header — large logo, name, rank, controls, trophy thumbnail */}
      <div className="px-4 py-3 flex items-center gap-3" style={{ backgroundColor: bg }}>
        {/* Rank badge */}
        <div
          className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-black flex-shrink-0"
          style={{ backgroundColor: 'rgba(0,0,0,0.3)', color: bgText }}
        >
          {rank}
        </div>
        {/* Large team logo */}
        {logo && (
          <img src={logo} alt={teamName} className="w-14 h-14 object-contain flex-shrink-0 drop-shadow-md" />
        )}
        {/* Team name + rivalry name */}
        <div className="flex-1 min-w-0">
          <p className="font-bold text-base leading-tight" style={{ color: bgText }}>{teamName}</p>
          {rivalry.name && (
            <p className="text-xs mt-0.5" style={{ color: bgText, opacity: 0.75 }}>{rivalry.name}</p>
          )}
        </div>
        {/* Trophy thumbnail — right next to the team name, once generated.
            No background box: a transparent-PNG trophy needs to sit directly
            on the row's own color, not inside a tinted chip (which showed as
            a muddy black-over-team-color square). object-contain (not cover)
            so the whole trophy shows uncropped. Sized bigger than the row's
            other icons on purpose — flex-shrink-0 keeps it from affecting the
            header's own width, it just claims more of the row's existing
            flexible space. */}
        {hasTrophy && (
          <button
            type="button"
            onClick={() => setShowTrophyLightbox(true)}
            className="h-14 w-14 flex-shrink-0 hover:opacity-80 transition-opacity"
            title={rivalry.trophyName ? `View ${rivalry.trophyName}` : 'View trophy'}
          >
            <img src={rivalry.trophyImageUrl} alt={rivalry.trophyName || 'Trophy'} className="w-full h-full object-contain" />
          </button>
        )}
        {isDormant && (
          <span className="text-xs font-medium px-2 py-0.5 rounded" style={{ backgroundColor: 'rgba(0,0,0,0.35)', color: bgText }}>
            Dormant
          </span>
        )}
        {/* Reorder buttons */}
        <div className="flex gap-0.5">
          <button
            onClick={onMoveUp}
            disabled={isFirst}
            className="w-6 h-6 rounded flex items-center justify-center text-xs disabled:opacity-20 hover:bg-black hover:bg-opacity-20 transition-colors"
            style={{ color: bgText }}
            title="Move up"
          >
            ▲
          </button>
          <button
            onClick={onMoveDown}
            disabled={isLast}
            className="w-6 h-6 rounded flex items-center justify-center text-xs disabled:opacity-20 hover:bg-black hover:bg-opacity-20 transition-colors"
            style={{ color: bgText }}
            title="Move down"
          >
            ▼
          </button>
        </div>
        <button
          onClick={onEdit}
          className="text-xs px-2 py-1 rounded hover:bg-black hover:bg-opacity-20 transition-colors"
          style={{ color: bgText }}
        >
          Edit
        </button>
      </div>

      {/* Stats row */}
      <div className="px-4 py-3 flex items-center gap-6">
        <button
          className="text-center hover:opacity-70 transition-opacity"
          onClick={() => setShowHistory(v => !v)}
          title="View game history"
        >
          <p className="text-xl font-black tabular text-txt-primary leading-none">{wins}–{losses}</p>
          <p className="label-xs text-txt-muted mt-0.5">Series {showHistory ? '▲' : '▼'}</p>
        </button>
        {streak > 0 && (
          <div className="text-center">
            <p className={`text-xl font-black tabular leading-none ${lastResult === 'W' ? 'text-green-400' : 'text-red-400'}`}>
              {lastResult}{streak}
            </p>
            <p className="label-xs text-txt-muted mt-0.5">Streak</p>
          </div>
        )}
        <div className="ml-auto text-right">
          {/* Always shown — falls back to the current year / 0 yrs when the
              rivalry's actual formed year isn't known yet (e.g. just added).
              Editable via the "Edit" button above to overwrite this fallback
              with the real year once it's known. */}
          <p className="text-sm font-medium text-txt-primary">Since {rivalry.formedYear || currentYear}</p>
          <p className="label-xs text-txt-muted">{yearsFormed ?? 0} yr{(yearsFormed ?? 0) !== 1 ? 's' : ''}</p>
        </div>
      </div>

      {/* Game history panel */}
      {showHistory && (
        <div className="border-t border-border-subtle">
          {gameHistory.length === 0 ? (
            <p className="px-4 py-3 text-xs text-txt-muted">No games played yet.</p>
          ) : (
            <div className="divide-y divide-border-subtle">
              {gameHistory.map((g, i) => (
                <div key={i} className="px-4 py-2 flex items-center gap-3">
                  <span className="text-xs text-txt-muted w-10 flex-shrink-0">{g.year}</span>
                  <span className={`text-sm font-black w-5 flex-shrink-0 ${g.won ? 'text-green-400' : 'text-red-400'}`}>
                    {g.won ? 'W' : 'L'}
                  </span>
                  <span className="text-sm font-bold tabular text-txt-primary">
                    {g.myScore}–{g.theirScore}
                  </span>
                  {g.gameLabel && (
                    <span
                      className="ml-auto text-xs font-medium px-2 py-0.5 rounded"
                      style={{ backgroundColor: g.isBig ? bg : 'var(--bg-subtle)', color: g.isBig ? bgText : 'var(--txt-muted)' }}
                    >
                      {g.gameLabel}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Rivalry description */}
      {rivalry.description && (
        <div className="border-t border-border-subtle px-4 py-3">
          <p className="label-xs text-txt-muted mb-1.5" style={{ letterSpacing: '1px' }}>ABOUT</p>
          <p className="text-xs text-txt-secondary leading-relaxed">{rivalry.description}</p>
        </div>
      )}

      {/* Trophy showcase — fuller presentation than a bare thumbnail:
          image (clickable to lightbox) alongside the trophy's name and
          description, shown whenever any of the three has been entered. */}
      {(hasTrophy || rivalry.trophyName || rivalry.trophyDescription) && (
        <div className="border-t border-border-subtle px-4 py-3">
          <p className="label-xs text-txt-muted mb-2" style={{ letterSpacing: '1px' }}>TROPHY</p>
          <div className="flex items-start gap-3">
            {hasTrophy && (
              <button
                onClick={() => setShowTrophyLightbox(true)}
                className="flex-shrink-0 hover:opacity-85 transition-opacity"
                title={rivalry.trophyName ? `View ${rivalry.trophyName}` : 'View trophy'}
                style={{ width: 72, height: 72 }}
              >
                <img
                  src={rivalry.trophyImageUrl}
                  alt={rivalry.trophyName || 'Trophy'}
                  className="w-full h-full object-contain"
                  onError={e => { e.target.parentElement.style.display = 'none' }}
                />
              </button>
            )}
            <div className="min-w-0 flex-1">
              {rivalry.trophyName && (
                <p className="font-bold text-sm text-txt-primary leading-tight">{rivalry.trophyName}</p>
              )}
              {rivalry.trophyDescription && (
                <p className={`text-xs text-txt-secondary leading-relaxed ${rivalry.trophyName ? 'mt-1' : ''}`}>{rivalry.trophyDescription}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Unlock hints */}
      {(!rivalry.name || !rivalry.trophyName) && !rivalry.manuallyAdded && (
        <div className="px-4 pb-3 flex gap-4">
          {!rivalry.name && (
            <p className="text-xs text-txt-muted">
              {canName ? 'Name unlocked — edit to add' : `Name in ${RIVALRY_NAME_YEARS - (yearsFormed ?? 0)} yr${RIVALRY_NAME_YEARS - (yearsFormed ?? 0) !== 1 ? 's' : ''}`}
            </p>
          )}
          {!rivalry.trophyName && (
            <p className="text-xs text-txt-muted">
              {canTrophy ? 'Trophy unlocked — edit to add' : `Trophy in ${RIVALRY_TROPHY_YEARS - (yearsFormed ?? 0)} yr${RIVALRY_TROPHY_YEARS - (yearsFormed ?? 0) !== 1 ? 's' : ''}`}
            </p>
          )}
        </div>
      )}

      {/* Rivalry score bar + breakdown — synced-from-save rivalries skip
          the organic point heuristic entirely and just show 100%, since
          the game itself already confirmed this is a real rivalry. */}
      {(() => {
        const points  = isSynced ? RIVALRY_FORM_THRESHOLD : (score.points || 0)
        const grouped = isSynced ? [] : groupRivalryEvents(score.events || [])
        const pct     = isSynced ? 100 : Math.min(100, Math.round((points / RIVALRY_FORM_THRESHOLD) * 100))
        const barColor = isSynced ? '#22c55e' : pct >= 100 ? '#22c55e' : pct >= 60 ? '#f59e0b' : '#6b7280'
        return (
          <div className="border-t border-border-subtle px-4 py-3">
            <div className="flex items-center justify-between mb-2">
              <span className="label-xs text-txt-muted" style={{ letterSpacing: '1px' }}>RIVALRY SCORE</span>
              <span className="text-sm font-black tabular text-txt-primary">
                {isSynced ? 'Official' : (
                  <>{points}<span className="text-txt-muted font-normal text-xs"> / {RIVALRY_FORM_THRESHOLD} pts</span></>
                )}
              </span>
            </div>

            {/* Bar */}
            <div className="relative mb-1">
              <div className="h-5 bg-bg-subtle rounded overflow-hidden">
                <div
                  className="h-full transition-all duration-500"
                  style={{ width: `${pct}%`, backgroundColor: barColor, opacity: 0.85 }}
                />
              </div>
              {[25, 50, 75].map(tick => (
                <div key={tick} className="absolute top-0 h-5 w-px bg-bg-base opacity-40" style={{ left: `${tick}%` }} />
              ))}
              <span
                className="absolute inset-0 flex items-center px-2 text-xs font-bold tabular"
                style={{ color: pct > 20 ? '#fff' : 'var(--color-txt-secondary)' }}
              >
                {pct}%
              </span>
            </div>

            {/* Point breakdown chips */}
            {isSynced ? (
              <div className="flex flex-wrap gap-1.5 mt-2">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-bg-subtle text-txt-secondary">
                  Confirmed in-game rivalry
                </span>
              </div>
            ) : grouped.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {grouped.map(g => (
                  <span
                    key={g.type}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-bg-subtle text-txt-secondary"
                  >
                    <span className="font-bold text-txt-primary">+{g.points}</span>
                    {rivalryEventLabel(g.type)}{g.count > 1 ? ` ×${g.count}` : ''}
                  </span>
                ))}
              </div>
            )}
          </div>
        )
      })()}
    </div>
    </>
  )
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function RivalriesTab({ dynasty, tid, selectedYear, dynastyId, saveRivalries }) {
  const myTid       = Number(tid)
  const currentYear = dynasty.currentYear || selectedYear || 2025
  const myAbbr      = dynasty.teams?.[myTid]?.abbr || getAbbrFromTid(dynasty.teams, myTid)

  const [editingId,    setEditingId]    = useState(null)
  const [editingBrewingTid, setEditingBrewingTid] = useState(null)
  const [showAddModal, setShowAddModal] = useState(false)

  const rawRivalries = dynasty.rivalries || []
  // ManageRivalries.jsx used to store custom rivalries as its own
  // dynasty-wide shape ({ id, name, teamTids: [tid, ...], imageUrl }, no
  // concept of "my team" since that page wasn't team-scoped) — a different
  // shape than this component's own per-team-pair one ({ rivalTid,
  // formedYear, trophyImageUrl, ... }, always relative to myTid). Now that
  // ManageRivalries renders this same component instead of its old CRUD,
  // filter down to entries this shape actually understands (a resolvable
  // rivalTid) so a leftover legacy entry can't render as "Team NaN" —
  // legacy 2-team entries involving THIS team are converted just below
  // instead of only being hidden, so nothing a user already set up (a
  // custom trophy name/image) silently vanishes.
  const rivalries = useMemo(
    () => rawRivalries.filter(r => Number.isFinite(Number(r.rivalTid))),
    [rawRivalries]
  )
  const formedTids   = useMemo(() => new Set(rivalries.map(r => Number(r.rivalTid))), [rivalries])

  // ── One-time migration off ManageRivalries.jsx's old dynasty-wide shape ────
  // A legacy entry has `teamTids` but no `rivalTid`. Only the simple, common
  // case — exactly 2 teams, one of them this team — converts cleanly to a
  // single rivalTid-based entry; anything else (3+ team groups, or a pairing
  // that doesn't involve this team at all) is left exactly as it was, since
  // this component has no "not my team" concept to place it under. Removes
  // the migrated legacy entry so this doesn't re-run every load.
  useEffect(() => {
    if (!dynasty.id || !Number.isFinite(myTid)) return
    const currentRivalries = dynasty.rivalries || []
    const legacy = currentRivalries.filter(r => Array.isArray(r.teamTids) && r.rivalTid == null)
    if (legacy.length === 0) return

    const migratable = legacy.filter(r => r.teamTids.length === 2 && r.teamTids.map(Number).includes(myTid))
    if (migratable.length === 0) return

    const migratedIds = new Set(migratable.map(r => r.id))
    const converted = migratable.map(r => ({
      id: r.id || genId(),
      rivalTid: Number(r.teamTids.find(t => Number(t) !== myTid)),
      formedYear: null,
      active: true,
      name: r.name || null,
      trophyName: null,
      trophyImageUrl: r.imageUrl || null,
      manuallyAdded: true,
      dismissed: false,
    }))

    saveRivalries(dynastyId, [
      ...currentRivalries.filter(r => !migratedIds.has(r.id)),
      ...converted,
    ])
  // Only run when the dynasty loads or the team changes — not on every rivalries change
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dynasty.id, dynastyId, myTid])

  // ── Auto-seed known real-world rivalries on first load ─────────────────────
  useEffect(() => {
    if (!myAbbr || !dynasty.id) return
    const knownRivals = getKnownRivalsForAbbr(myAbbr)
    if (knownRivals.length === 0) return

    const currentRivalries = dynasty.rivalries || []
    const currentTids = new Set(currentRivalries.map(r => Number(r.rivalTid)))

    const toAdd = knownRivals
      .map(({ rivalAbbr, name, trophyName }) => {
        const rivalTid = getTidFromAbbr(rivalAbbr, dynasty)
        return rivalTid ? { rivalTid: Number(rivalTid), name, trophyName } : null
      })
      .filter(Boolean)
      .filter(({ rivalTid }) => !currentTids.has(rivalTid))

    if (toAdd.length === 0) return

    const seeded = toAdd.map(({ rivalTid, name, trophyName }) => ({
      id: genId(),
      rivalTid,
      formedYear: null,
      active: true,
      name,
      trophyName,
      manuallyAdded: false,
      dismissed: false,
    }))

    saveRivalries(dynastyId, [...currentRivalries, ...seeded])
  // Only run when the dynasty loads or the team changes — not on every rivalries change
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myAbbr, dynasty.id, dynastyId])

  // Dynamic point scores for detecting potential NEW rivalries
  const rivalryScores = useMemo(
    () => computeRivalryScores(dynasty, myTid),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dynasty, myTid]
  )

  // Brewing Rivalries — top 3 non-formed teams by rivalry score, always
  // shown (no minimum point threshold): the point of the section is to
  // surface whichever candidates are CLOSEST to becoming a rivalry, even
  // early in a dynasty when nothing has cleared a fixed bar yet.
  const brewingList = useMemo(
    () =>
      Object.entries(rivalryScores)
        .filter(([rivalTid]) => !formedTids.has(Number(rivalTid)))
        .sort((a, b) => b[1].points - a[1].points)
        .slice(0, 3)
        .map(([rivalTid, score]) => ({ rivalTid: Number(rivalTid), ...score })),
    [rivalryScores, formedTids]
  )

  // ── Mutations ──────────────────────────────────────────────────────────────

  function handleSaveEdit(updated) {
    saveRivalries(dynastyId, rivalries.map(r => r.id === updated.id ? updated : r))
    // Don't close — auto-save calls this; the modal stays open until the user clicks Done
  }

  function handleDelete(rivalId) {
    saveRivalries(dynastyId, rivalries.filter(r => r.id !== rivalId))
    setEditingId(null)
  }

  function handleReorder(id, direction) {
    const idx = rivalries.findIndex(r => r.id === id)
    if (idx < 0) return
    const next = idx + direction
    if (next < 0 || next >= rivalries.length) return
    const reordered = [...rivalries]
    ;[reordered[idx], reordered[next]] = [reordered[next], reordered[idx]]
    saveRivalries(dynastyId, reordered)
  }

  function handleAddManual(rivalTid) {
    saveRivalries(dynastyId, [
      ...rivalries,
      {
        id: genId(),
        rivalTid: Number(rivalTid),
        formedYear: currentYear,
        active: true,
        name: null,
        trophyName: null,
        manuallyAdded: true,
        dismissed: false,
      },
    ])
    setShowAddModal(false)
  }

  const editingRivalry = rivalries.find(r => r.id === editingId) || null

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">

      {/* Active Rivalries */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="label-sm text-txt-secondary" style={{ letterSpacing: '1px' }}>
            RIVALRIES ({rivalries.length})
          </h3>
          <button
            onClick={() => setShowAddModal(true)}
            className="text-xs font-medium text-[var(--team-primary)] hover:opacity-80"
          >
            + Add Rival
          </button>
        </div>

        {rivalries.length === 0 ? (
          <div className="card p-6 text-center">
            <p className="text-txt-muted text-sm">No rivalries yet.</p>
            <p className="text-txt-muted text-xs mt-1">Add one manually, or play more games to build rivalry points.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {rivalries.map((rivalry, idx) => {
              const series = computeSeriesRecord(dynasty, myTid, Number(rivalry.rivalTid))
              const score  = rivalryScores[Number(rivalry.rivalTid)] || { points: 0, events: [] }
              return (
                <RivalryCard
                  key={rivalry.id}
                  rivalry={rivalry}
                  dynasty={dynasty}
                  myTid={myTid}
                  currentYear={currentYear}
                  series={series}
                  score={score}
                  rank={idx + 1}
                  isFirst={idx === 0}
                  isLast={idx === rivalries.length - 1}
                  onEdit={() => setEditingId(rivalry.id)}
                  onMoveUp={() => handleReorder(rivalry.id, -1)}
                  onMoveDown={() => handleReorder(rivalry.id, 1)}
                />
              )
            })}
          </div>
        )}
      </section>

      {/* Brewing Rivalries — top 3 candidates by score, always visible */}
      {brewingList.length > 0 && (
        <section>
          <div className="mb-2">
            <h3 className="label-sm text-txt-secondary" style={{ letterSpacing: '1px' }}>
              BREWING RIVALRIES
            </h3>
            <p className="text-xs text-txt-muted mt-0.5">Your top potential rivalries, based on rivalry score</p>
          </div>

          <div className="card overflow-hidden divide-y divide-border-subtle">
              {brewingList.map(({ rivalTid, points, events }) => {
                const team     = dynasty.teams?.[rivalTid]
                const teamName = team?.name || `Team ${rivalTid}`
                const logo     = getTeamLogoByTid(rivalTid, dynasty.teams)
                const grouped  = groupRivalryEvents(events)
                const pct      = Math.min(100, Math.round((points / RIVALRY_FORM_THRESHOLD) * 100))

                const barColor = pct >= 100 ? '#22c55e' : pct >= 60 ? '#f59e0b' : '#6b7280'

                return (
                  <div key={rivalTid} className="px-4 py-4">
                    {/* Team header */}
                    <div className="flex items-center gap-3 mb-3">
                      {logo && <img src={logo} alt={teamName} className="w-7 h-7 object-contain flex-shrink-0" />}
                      <span className="text-sm font-bold text-txt-primary flex-1 min-w-0 truncate">{teamName}</span>
                      <span className="text-sm font-black tabular text-txt-primary whitespace-nowrap">
                        {points}<span className="text-txt-muted font-normal text-xs"> / {RIVALRY_FORM_THRESHOLD} pts</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => setEditingBrewingTid(rivalTid)}
                        className="text-xs px-2 py-1 rounded border border-border-subtle text-txt-secondary hover:text-txt-primary hover:bg-bg-hover transition-colors flex-shrink-0"
                      >
                        Edit
                      </button>
                    </div>

                    {/* Progress bar — chunky with tick marks */}
                    <div className="relative mb-1">
                      {/* Track */}
                      <div className="h-5 bg-bg-subtle rounded overflow-hidden">
                        <div
                          className="h-full transition-all duration-500"
                          style={{ width: `${pct}%`, backgroundColor: barColor, opacity: 0.85 }}
                        />
                      </div>
                      {/* Tick marks at 25%, 50%, 75% */}
                      {[25, 50, 75].map(tick => (
                        <div
                          key={tick}
                          className="absolute top-0 h-5 w-px bg-bg-base opacity-40"
                          style={{ left: `${tick}%` }}
                        />
                      ))}
                      {/* Inline pct label */}
                      <span
                        className="absolute inset-0 flex items-center px-2 text-xs font-bold tabular"
                        style={{ color: pct > 20 ? '#fff' : 'var(--color-txt-secondary)' }}
                      >
                        {pct}%
                      </span>
                    </div>
                    <div className="flex justify-between text-xs text-txt-muted mb-3">
                      <span>0</span>
                      <span>Rivalry at {RIVALRY_FORM_THRESHOLD}</span>
                    </div>

                    {/* Why — point breakdown chips */}
                    <div className="flex flex-wrap gap-1.5">
                      {grouped.map(g => (
                        <span
                          key={g.type}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-bg-subtle text-txt-secondary"
                        >
                          <span className="font-bold text-txt-primary">+{g.points}</span>
                          {rivalryEventLabel(g.type)}{g.count > 1 ? ` ×${g.count}` : ''}
                        </span>
                      ))}
                    </div>
                  </div>
                )
              })}
          </div>
        </section>
      )}

      {/* How points work */}
      <section>
        <details className="group">
          <summary className="cursor-pointer label-xs text-txt-muted hover:text-txt-secondary" style={{ letterSpacing: '1px' }}>
            HOW RIVALRY POINTS WORK
          </summary>
          <div className="mt-2 card p-4 text-xs text-txt-secondary space-y-1">
            <p><span className="font-bold text-txt-primary">+3</span> — Same state (one-time)</p>
            <p><span className="font-bold text-txt-primary">+1/game</span> — Every regular season game, ever</p>
            <p><span className="font-bold text-txt-primary">+4/game</span> — Big games: bowl, CCG, playoff</p>
            <p><span className="font-bold text-txt-primary">+5</span> — Star player (OVR 80+) transferred to them (last {RIVALRY_TRANSFER_LOOKBACK} yrs)</p>
            <p><span className="font-bold text-txt-primary">+8</span> — Head coach left for them (last {RIVALRY_COACH_LOOKBACK} yrs)</p>
            <p className="pt-2 text-txt-muted">
              Points build from your first season and never reset for games — rivalries take years to develop.
              Brewing Rivalries shows your top 3 candidates. Bar fills at {RIVALRY_FORM_THRESHOLD} pts.
            </p>
          </div>
        </details>
      </section>

      {/* Edit modal */}
      {editingRivalry && (
        <EditRivalryModal
          rivalry={editingRivalry}
          dynasty={dynasty}
          myTid={myTid}
          currentYear={currentYear}
          onSave={handleSaveEdit}
          onDelete={() => handleDelete(editingRivalry.id)}
          onClose={() => setEditingId(null)}
        />
      )}

      {/* Brewing rivalry detail modal */}
      {editingBrewingTid != null && (() => {
        const brewingScore = rivalryScores[editingBrewingTid] || { points: 0, events: [] }
        const brewingTeam = dynasty.teams?.[editingBrewingTid]
        const brewingTeamName = brewingTeam?.name || `Team ${editingBrewingTid}`
        const brewingLogo = getTeamLogoByTid(editingBrewingTid, dynasty.teams)
        return (
          <BrewingRivalryModal
            rivalTid={editingBrewingTid}
            dynasty={dynasty}
            teamName={brewingTeamName}
            logo={brewingLogo}
            points={brewingScore.points}
            events={brewingScore.events}
            onOverride={() => { handleAddManual(editingBrewingTid); setEditingBrewingTid(null) }}
            onClose={() => setEditingBrewingTid(null)}
          />
        )
      })()}

      {/* Add modal */}
      {showAddModal && (
        <AddRivalryModal
          dynasty={dynasty}
          myTid={myTid}
          existingRivalTids={formedTids}
          onAdd={handleAddManual}
          onClose={() => setShowAddModal(false)}
        />
      )}
    </div>
  )
}
