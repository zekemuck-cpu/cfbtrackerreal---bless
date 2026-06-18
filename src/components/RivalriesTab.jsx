import { useState, useMemo, useEffect, useRef } from 'react'
import { getContrastTextColor } from '../utils/colorUtils'
import { getTeamLogoByTid } from '../data/teams'
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
  RIVALRY_WATCH_THRESHOLD,
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

  const myName    = myTeam?.name    || `Team ${myTidNum}`
  const rivalName = rivalTeam?.name || `Team ${rivalTidNum}`
  const myAbbr    = myTeam?.abbr    || ''
  const rivalAbbr = rivalTeam?.abbr || ''
  const myState   = TEAM_STATE[myAbbr]    || null
  const rivalState = TEAM_STATE[rivalAbbr] || null
  const sameState  = myState && myState === rivalState

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
  const trophyNameLine = rivalry.trophyName
    ? `The trophy is officially called the "${rivalry.trophyName}." Every design choice should feel like it earned that name.`
    : 'The trophy has not yet been named — its design should be so specific that the name becomes obvious once you see it.'
  const rivalryNameLine = rivalry.name
    ? `This rivalry is known as "${rivalry.name}".`
    : ''

  return `COMMISSION: One-of-a-kind rivalry trophy — ${myName} vs. ${rivalName}
This trophy must be impossible to mistake for any other rivalry. It exists for these two programs and no one else.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
THE PROGRAMS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${myName}
  Colors: ${colorLine || 'unknown'}
  State: ${myState || 'unknown'}

${rivalName}
  Colors: ${rivColorLine || 'unknown'}
  State: ${rivalState || 'unknown'}

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
${trophyNameLine}

REAL CFB TROPHY DESIGN PRECEDENTS — understand the logic, don't copy the objects:
• Floyd of Rosedale (Iowa–Minnesota): Bronze pig from a real gubernatorial wager over prize livestock. The trophy IS the story.
• The Golden Boot (LSU–Arkansas): A gold football cleat. One object. Immediately understood.
• Paul Bunyan's Axe (Minnesota–Wisconsin): An actual axe, with every year's score painted on the handle. The trophy grows with the rivalry.
• Old Oaken Bucket (Indiana–Purdue): A wooden bucket pulled from a well — a found object made sacred by what teams went through to win it.
• Cy-Hawk (Iowa–Iowa State): One figure blending both mascots. Two identities, no hierarchy.
• Apple Cup (Washington–WSU): Apple-shaped, because that's what Washington actually is.
• Victory Bell (USC–UCLA): A real bell. The winner rings it. Scale and ritual.

DESIGN REQUIREMENTS:
1. Incorporate imagery from BOTH mascots/programs — neither is a guest
2. The ${regionPhrase} identity must be physically present — landscape, wildlife, industry, culture
3. The colors — ${[colorLine, rivColorLine].filter(Boolean).join(' / ')} — should appear in the materials or finish
4. The origin story above must inform the design — if a coach left, if a star transferred, if they met in a championship, those moments deserve to live in the object
5. It must have physical weight and presence — something worth fighting 10 years for
6. It must be impossible to mistake for any other trophy on earth

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
IMAGE GENERATION PROMPT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Photorealistic 8K HDR photograph of the official ${myName} vs. ${rivalName} rivalry trophy, displayed in a prestigious college athletics trophy room. The trophy is a unique sculptural object that incorporates elements of both programs and the ${regionPhrase} region. It sits on a dark mahogany display shelf, dramatically lit by a single overhead spotlight that catches the texture and weight of its materials. Behind it: blurred warm wood paneling, glass display cases, and other championship hardware softly out of focus. The trophy commands the frame. Studio-sharp foreground, cinematic depth. Ultra-realistic materials — metal, wood, stone, or bronze as appropriate. No text, no nameplates, no words visible anywhere in the image. Shot as if for a Sports Illustrated feature or a Hall of Fame display.`
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

// ─── Edit Rivalry Modal ─────────────────────────────────────────────────────

function EditRivalryModal({ rivalry, dynasty, myTid, currentYear, onSave, onDelete, onClose }) {
  const yearsFormed = rivalry.formedYear ? currentYear - rivalry.formedYear : 0
  const canName     = rivalry.manuallyAdded || yearsFormed >= RIVALRY_NAME_YEARS
  const canTrophy   = rivalry.manuallyAdded || yearsFormed >= RIVALRY_TROPHY_YEARS

  const [name,             setName]             = useState(rivalry.name             || '')
  const [description,      setDescription]      = useState(rivalry.description      || '')
  const [trophy,           setTrophy]           = useState(rivalry.trophyName       || '')
  const [trophyDesc,       setTrophyDesc]       = useState(rivalry.trophyDescription || '')
  const [trophyImageUrl,   setTrophyImageUrl]   = useState(rivalry.trophyImageUrl   || '')
  const [active,           setActive]           = useState(rivalry.active !== false)
  const [confirmDelete,    setConfirmDelete]    = useState(false)
  const [namesCopied,      setNamesCopied]      = useState(false)
  const [imageCopied,      setImageCopied]      = useState(false)
  const [viewingPrompt,    setViewingPrompt]    = useState(null) // 'names' | 'image' | null
  const [savedIndicator,   setSavedIndicator]   = useState(false)
  const isFirstRender = useRef(true)

  // Auto-save 600ms after any field stops changing
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return }
    const t = setTimeout(() => {
      onSave({
        ...rivalry,
        name:              name.trim()        || null,
        description:       description.trim() || null,
        trophyName:        trophy.trim()      || null,
        trophyDescription: trophyDesc.trim()  || null,
        trophyImageUrl:    trophyImageUrl.trim() || null,
        active,
      })
      setSavedIndicator(true)
      setTimeout(() => setSavedIndicator(false), 1500)
    }, 600)
    return () => clearTimeout(t)
  }, [name, description, trophy, trophyDesc, trophyImageUrl, active]) // eslint-disable-line

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
      trophyName:       trophy.trim()      || null,
      trophyDescription: trophyDesc.trim() || null,
      trophyImageUrl:   trophyImageUrl.trim() || null,
      active,
    })
  }

  const team     = dynasty.teams?.[Number(rivalry.rivalTid)]
  const teamName = team?.name || `Team ${rivalry.rivalTid}`
  const bg       = team?.primaryColor || '#374151'
  const bgText   = getContrastTextColor(bg)

  return (
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
          {getTeamLogoByTid(rivalry.rivalTid, dynasty.teams) && (
            <img src={getTeamLogoByTid(rivalry.rivalTid, dynasty.teams)} alt={teamName} className="w-8 h-8 object-contain" />
          )}
          <span className="font-bold text-base flex-1" style={{ color: bgText }}>{teamName}</span>
          {savedIndicator && <span className="text-xs opacity-70 mr-1" style={{ color: bgText }}>Saved</span>}
          <button onClick={onClose} className="text-lg leading-none opacity-60 hover:opacity-100" style={{ color: bgText }}>×</button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1">
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
                  {namesCopied ? 'Copied!' : 'Copy Names & Description Prompt'}
                </button>
                <button
                  type="button"
                  onClick={() => copyText(buildTrophyPrompt(dynasty, rivalry, myTid), setImageCopied, 'image')}
                  className="flex-1 py-2 px-3 rounded border border-border-subtle text-xs font-medium text-txt-secondary hover:text-txt-primary hover:bg-bg-hover transition-colors text-center"
                >
                  {imageCopied ? 'Copied!' : 'Copy Image Prompt'}
                </button>
              </div>
              <p className="text-xs text-txt-muted mt-1.5">
                Run Names prompt first in ChatGPT/Claude → paste results below. Then run Image prompt in an image generator → upload photo.
              </p>

              {/* Fallback textarea — shown when clipboard is blocked */}
              {viewingPrompt && (
                <div className="mt-3">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs font-medium text-txt-secondary">
                      {viewingPrompt === 'names' ? 'Names & Description Prompt' : 'Image Prompt'} — select all and copy
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
            </div>

            <div className="border-t border-border-subtle" />

            {/* ── Trophy section ── */}
            <div className="space-y-3">
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
                    />
                  </>
                ) : (
                  <div className="h-10 bg-bg-subtle rounded flex items-center px-3">
                    <span className="text-xs text-txt-muted">Locked</span>
                  </div>
                )}
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
    </div>
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

  return (
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
    </div>
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
  const canName   = rivalry.manuallyAdded || (yearsFormed != null && yearsFormed >= RIVALRY_NAME_YEARS)
  const canTrophy = rivalry.manuallyAdded || (yearsFormed != null && yearsFormed >= RIVALRY_TROPHY_YEARS)
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
    {/* Trophy lightbox */}
    {showTrophyLightbox && (
      <div
        className="fixed inset-0 top-0 left-0 right-0 bottom-0 bg-black bg-opacity-90 flex items-center justify-center z-[9999] p-4"
        style={{ margin: 0 }}
        onClick={() => setShowTrophyLightbox(false)}
      >
        <div className="relative max-w-2xl w-full" onClick={e => e.stopPropagation()}>
          <img
            src={rivalry.trophyImageUrl}
            alt={rivalry.trophyName || 'Trophy'}
            className="w-full object-contain rounded-lg"
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
      </div>
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
        {isDormant && (
          <span className="text-xs font-medium px-2 py-0.5 rounded" style={{ backgroundColor: 'rgba(0,0,0,0.35)', color: bgText }}>
            Dormant
          </span>
        )}
        {/* Trophy thumbnail — small, clickable to lightbox */}
        {hasTrophy && (
          <button
            onClick={() => setShowTrophyLightbox(true)}
            className="flex-shrink-0 rounded overflow-hidden hover:opacity-80 transition-opacity"
            title={rivalry.trophyName ? `View ${rivalry.trophyName}` : 'View trophy'}
            style={{ width: 48, height: 48, backgroundColor: '#0a0a0a' }}
          >
            <img
              src={rivalry.trophyImageUrl}
              alt="Trophy"
              className="w-full h-full object-contain"
              onError={e => { e.target.parentElement.style.display = 'none' }}
            />
          </button>
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
          {rivalry.formedYear ? (
            <>
              <p className="text-sm font-medium text-txt-primary">Since {rivalry.formedYear}</p>
              {yearsFormed != null && <p className="label-xs text-txt-muted">{yearsFormed} yr{yearsFormed !== 1 ? 's' : ''}</p>}
            </>
          ) : rivalry.trophyName && !hasTrophy ? (
            <>
              <p className="text-sm font-medium text-txt-primary">{rivalry.trophyName}</p>
              <p className="label-xs text-txt-muted">Trophy</p>
            </>
          ) : null}
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
        <div className="px-4 pb-3">
          <p className="text-xs text-txt-secondary leading-relaxed">{rivalry.description}</p>
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

      {/* Rivalry score bar + breakdown */}
      {(() => {
        const points  = score.points || 0
        const grouped = groupRivalryEvents(score.events || [])
        const pct     = Math.min(100, Math.round((points / RIVALRY_FORM_THRESHOLD) * 100))
        const barColor = pct >= 100 ? '#22c55e' : pct >= 60 ? '#f59e0b' : '#6b7280'
        return (
          <div className="border-t border-border-subtle px-4 py-3">
            <div className="flex items-center justify-between mb-2">
              <span className="label-xs text-txt-muted" style={{ letterSpacing: '1px' }}>RIVALRY SCORE</span>
              <span className="text-sm font-black tabular text-txt-primary">
                {points}<span className="text-txt-muted font-normal text-xs"> / {RIVALRY_FORM_THRESHOLD} pts</span>
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
            {grouped.length > 0 && (
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
  const [showAddModal, setShowAddModal] = useState(false)
  const [showWatch,    setShowWatch]    = useState(false)

  const rivalries    = dynasty.rivalries || []
  const formedTids   = useMemo(() => new Set(rivalries.map(r => Number(r.rivalTid))), [rivalries])

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

  // Rivalry Watch: teams with 5+ pts that are NOT already in the rivalries list
  const watchList = useMemo(
    () =>
      Object.entries(rivalryScores)
        .filter(([rivalTid, score]) =>
          score.points >= RIVALRY_WATCH_THRESHOLD &&
          !formedTids.has(Number(rivalTid))
        )
        .sort((a, b) => b[1].points - a[1].points)
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

      {/* Rivalry Watch — developing potential new rivalries */}
      {watchList.length > 0 && (
        <section>
          <button
            onClick={() => setShowWatch(v => !v)}
            className="flex items-center gap-2 mb-2 w-full text-left group"
          >
            <h3 className="label-sm text-txt-muted group-hover:text-txt-secondary transition-colors" style={{ letterSpacing: '1px' }}>
              RIVALRY WATCH ({watchList.length})
            </h3>
            <span className="text-xs text-txt-muted">{showWatch ? '▲' : '▼'}</span>
            <p className="text-xs text-txt-muted ml-1">Potential new rivalries developing in your dynasty</p>
          </button>

          {showWatch && (
            <div className="card overflow-hidden divide-y divide-border-subtle">
              {watchList.map(({ rivalTid, points, events }) => {
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
          )}
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
              Watch list shows at {RIVALRY_WATCH_THRESHOLD}+ pts. Bar fills at {RIVALRY_FORM_THRESHOLD} pts.
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
