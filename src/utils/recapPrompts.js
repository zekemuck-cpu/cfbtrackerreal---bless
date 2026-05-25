/**
 * Prompt builders for the Week Recap feature.
 *
 * Three flavors share the same "NEVER invent data" guardrail:
 *
 *   1. buildWeekRecapPrompt(dynasty, year, week)
 *      — Recap of the week that JUST FINISHED (so callers pass week = currentWeek - 1).
 *
 *   2. buildPreseasonRecapPrompt(dynasty, year)
 *      — Forward-looking preseason narrative built on past seasons + a saved
 *        preseason Top 25 (if one was entered). Used at week 0.
 *
 *   3. buildPreseasonTop25Prompt(dynasty, year)
 *      — The user is filling a Top-25 entry sheet for the upcoming season; this
 *        prompt asks the AI to suggest a Top 25 from the prior-season data the
 *        dynasty actually contains (no real-world rosters, no transfers we
 *        don't track).
 *
 * All prompt outputs are plain text with explicit guidance to wrap the
 * narrative in a fenced markdown block (matches the FormattedRecap renderer's
 * existing unwrap behavior).
 */

import { getMascotName } from '../data/teams'
import { ambiguousNamingRules } from './recapTeamNames'
import { conferenceTeams as DEFAULT_CONFERENCES } from '../data/conferenceTeams'
import {
  getPriorYearPostseason,
  getTeamFinalRank,
  getHeadToHeadHistory,
  getCoachContext,
  getIncomingClassRank,
  getQualityWinsAndBadLosses,
  getRivalryName,
  getSeasonPOWTrail,
} from '../services/geminiService'
import { buildCFPProjection } from './cfpProjection'

const TWO_DIGIT = (y) => String(y).slice(-2)

// ---------------------------------------------------------------------------
// Data helpers — shared by all three builders. Kept inline here so the prompt
// utility has no React/context dependency and can be unit-imported anywhere.
// ---------------------------------------------------------------------------

// Best-effort full name for a team — uses dynasty.teams when available, falls
// back to mascot lookup, then to the abbreviation.
function teamDisplay(tid, abbr, dynasty) {
  if (tid != null && dynasty?.teams?.[tid]) {
    const t = dynasty.teams[tid]
    return t.name || t.fullName || t.abbr || abbr || 'Unknown'
  }
  if (abbr) {
    const mascot = getMascotName(abbr, dynasty?.teams)
    return mascot || abbr
  }
  return 'Unknown'
}

function isUserTeam(game, userTid) {
  if (userTid == null) return false
  return Number(game.team1Tid) === Number(userTid) || Number(game.team2Tid) === Number(userTid)
}

// Returns { won, score, oppScore, isHome, oppTid, oppAbbr, rank, oppRank, ot } from
// the user's perspective for a single game, or null when the user wasn't involved.
function userPerspective(game, userTid) {
  const t1 = Number(game.team1Tid)
  const t2 = Number(game.team2Tid)
  const u = Number(userTid)
  if (t1 !== u && t2 !== u) return null
  const userIsTeam1 = t1 === u
  const userScore = userIsTeam1 ? game.team1Score : game.team2Score
  const oppScore = userIsTeam1 ? game.team2Score : game.team1Score
  const oppTid = userIsTeam1 ? t2 : t1
  const oppAbbr = userIsTeam1 ? game.team2 : game.team1
  const rank = userIsTeam1 ? game.team1Rank : game.team2Rank
  const oppRank = userIsTeam1 ? game.team2Rank : game.team1Rank
  // homeTeamTid being null means neutral site
  const isHome = game.homeTeamTid == null ? null : Number(game.homeTeamTid) === u
  const won = userScore != null && oppScore != null ? userScore > oppScore : null
  return { won, userScore, oppScore, oppTid, oppAbbr, rank, oppRank, isHome, ot: !!game.ot }
}

function recordFromGames(games, year, tid, upToWeek = null) {
  let w = 0, l = 0
  const cap = upToWeek != null ? Number(upToWeek) : null
  for (const g of (games || [])) {
    if (Number(g?.year) !== Number(year)) continue
    // When called for an in-season weekly recap, only count games at or
    // before the recap week — otherwise a recap regenerated mid-season
    // surfaces every team's full-season record (including future weeks
    // the user has already entered) instead of the through-Week-N record.
    // NaN week values (postseason strings like "Bowl 1") fail the < cap
    // check naturally so they're excluded from regular-season caps.
    if (cap != null && !(Number(g?.week) <= cap)) continue
    const persp = userPerspective(g, tid)
    if (!persp || persp.won == null) continue
    if (persp.won) w++; else l++
  }
  return { wins: w, losses: l }
}

// Format one game line. game.team1Rank / team2Rank is the team's
// ENTERING rank for this game (rank during the matchup) — the EA
// shift is handled at write time so by read time the stored value
// IS what we want to display.
// Build per-team conference annotations for inline use in game lines.
// Memoized via the alignment block so we don't re-scan the dynasty
// once per game. Returns a function (tidOrAbbr) => 'Pac-12' | null.
function makeConferenceLookup(dynasty, year) {
  const alignment = getConferenceAlignmentForYear(dynasty, year)
  const byAbbr = new Map() // abbr UPPER → conference name
  for (const [conf, abbrs] of Object.entries(alignment || {})) {
    if (!Array.isArray(abbrs)) continue
    for (const a of abbrs) {
      if (!a) continue
      byAbbr.set(String(a).toUpperCase(), conf)
    }
  }
  return (tidOrAbbr, fallbackAbbr) => {
    let abbr = null
    if (typeof tidOrAbbr === 'number' || (typeof tidOrAbbr === 'string' && /^\d+$/.test(tidOrAbbr))) {
      const team = dynasty?.teams?.[String(tidOrAbbr)] || dynasty?.teams?.[Number(tidOrAbbr)]
      abbr = team?.abbr || null
    } else if (typeof tidOrAbbr === 'string') {
      abbr = tidOrAbbr
    }
    if (!abbr && fallbackAbbr) abbr = fallbackAbbr
    if (!abbr) return null
    return byAbbr.get(String(abbr).toUpperCase()) || null
  }
}

function fmtGameLine(game, dynasty, confLookup) {
  const t1 = teamDisplay(game.team1Tid, game.team1, dynasty)
  const t2 = teamDisplay(game.team2Tid, game.team2, dynasty)
  const s1 = game.team1Score, s2 = game.team2Score
  const r1 = typeof game.team1Rank === 'number' ? `#${game.team1Rank} ` : ''
  const r2 = typeof game.team2Rank === 'number' ? `#${game.team2Rank} ` : ''
  // Inline conference annotation. The AI was writing things like
  // "the Mountain West produced…" for games whose teams the user has
  // moved into the Pac-12. Putting each team's CURRENT dynasty
  // conference right next to the name makes the misattribution
  // impossible — the AI sees "Hawaii (Pac-12) 35, Boise State
  // (Pac-12) 14" and can't pretend they're MWC games.
  const c1 = confLookup ? confLookup(game.team1Tid, game.team1) : null
  const c2 = confLookup ? confLookup(game.team2Tid, game.team2) : null
  const t1Full = c1 ? `${t1} (${c1})` : t1
  const t2Full = c2 ? `${t2} (${c2})` : t2
  const home = game.homeTeamTid == null
    ? 'neutral site'
    : Number(game.homeTeamTid) === Number(game.team1Tid)
      ? `at ${t1}`
      : `at ${t2}`
  const ot = game.ot ? ' (OT)' : ''
  if (s1 == null || s2 == null) {
    return `${r1}${t1Full} vs ${r2}${t2Full}${ot} — score not entered (${home})`
  }
  return `${r1}${t1Full} ${s1}, ${r2}${t2Full} ${s2}${ot} (${home})`
}

// ---------------------------------------------------------------------------
// Conference alignment for a given year. Dynasty users frequently realign
// teams (FSU/Miami/Clemson moving to the SEC, custom conferences, etc.),
// so we MUST hand the AI the dynasty's actual alignment and forbid it from
// falling back on real-world knowledge — otherwise the recap will say
// "ACC's Florida State" when the user has FSU in the SEC.
//
// SINGLE SOURCE OF TRUTH: dynasty.teams[tid].byYear[year].conference
//
// Builds the conference map from each team's canonical per-season field.
// Teams missing current-year data carry forward from the nearest prior year.
// Falls back to legacy bulk stores only for old unmigrated dynasties.
//
// Mirrors DynastyContext.getCustomConferencesForYear — inlined here because
// the prompt utility deliberately has no React/context dependency.
// ---------------------------------------------------------------------------

function getConferenceAlignmentForYear(dynasty, year) {
  if (!dynasty) return DEFAULT_CONFERENCES
  const yearNum = Number(year)
  if (!Number.isFinite(yearNum)) return DEFAULT_CONFERENCES

  const teams = dynasty.teams || {}
  const startYear = Number(dynasty.startYear) || 2024

  // ── PRIMARY PATH ────────────────────────────────────────────────────────────
  // Build from teams[tid].byYear[year].conference (canonical source of truth).
  const result = {}
  let hasPrimaryData = false

  for (const team of Object.values(teams)) {
    const abbr = team?.abbr
    if (!abbr) continue

    // Try current year first.
    let conf = team?.byYear?.[yearNum]?.conference
      ?? team?.byYear?.[String(yearNum)]?.conference

    // Carry forward from nearest prior year (up to 10 years back).
    if (!conf) {
      const minYear = Math.max(startYear, yearNum - 10)
      for (let y = yearNum - 1; y >= minYear; y--) {
        const c = team?.byYear?.[y]?.conference ?? team?.byYear?.[String(y)]?.conference
        if (c) { conf = c; break }
      }
    }

    if (!conf) continue

    hasPrimaryData = true
    if (!Array.isArray(result[conf])) result[conf] = []
    const upperAbbr = abbr.toUpperCase()
    if (!result[conf].some(t => (t || '').toUpperCase() === upperAbbr)) {
      result[conf].push(abbr)
    }
  }

  if (hasPrimaryData) return result

  // ── LEGACY FALLBACK ─────────────────────────────────────────────────────────
  // Reached only for old unmigrated dynasties. Run admin "Migrate Conferences"
  // to backfill per-team data and retire this path.
  let baseMap = null
  const byYear = dynasty.customConferencesByYear?.[yearNum]
    || dynasty.customConferencesByYear?.[String(yearNum)]
  if (byYear && typeof byYear === 'object' && Object.keys(byYear).length > 0) {
    baseMap = byYear
  } else if (dynasty.customConferencesByYear && typeof dynasty.customConferencesByYear === 'object') {
    const minYear = Math.max(startYear, yearNum - 10)
    for (let y = yearNum - 1; y >= minYear; y--) {
      const prev = dynasty.customConferencesByYear[y] || dynasty.customConferencesByYear[String(y)]
      if (prev && typeof prev === 'object' && Object.keys(prev).length > 0) {
        baseMap = prev
        break
      }
    }
  }
  if (!baseMap && dynasty.customConferences && typeof dynasty.customConferences === 'object'
      && Object.keys(dynasty.customConferences).length > 0) {
    baseMap = dynasty.customConferences
  }

  const sourceMap = baseMap || DEFAULT_CONFERENCES

  // Deep clone so we don't mutate stored data.
  const legacyResult = {}
  for (const [conf, confTeams] of Object.entries(sourceMap)) {
    legacyResult[conf] = Array.isArray(confTeams) ? [...confTeams] : []
  }

  // Overlay conferenceByTeamYear legacy overrides.
  const legacy = dynasty.conferenceByTeamYear || {}
  for (const [abbr, byYearMap] of Object.entries(legacy)) {
    if (!abbr || !byYearMap || typeof byYearMap !== 'object') continue
    const conf = byYearMap[yearNum] ?? byYearMap[String(yearNum)]
    if (!conf) continue
    const upperAbbr = abbr.toUpperCase()
    for (const list of Object.values(legacyResult)) {
      const idx = list.findIndex(t => (t || '').toUpperCase() === upperAbbr)
      if (idx !== -1) list.splice(idx, 1)
    }
    if (!Array.isArray(legacyResult[conf])) legacyResult[conf] = []
    if (!legacyResult[conf].some(t => (t || '').toUpperCase() === upperAbbr)) {
      legacyResult[conf].push(abbr)
    }
  }

  return legacyResult
}

// Renders the alignment as a plain-text data block. Each line is
// `Conference: Team1, Team2, ...` — names resolved through dynasty.teams
// when possible so teambuilder renames flow through. Returns '' when the
// dynasty has no alignment data of any kind (extremely rare, since the
// static fallback always returns something).
function conferenceAlignmentBlock(dynasty, year) {
  const alignment = getConferenceAlignmentForYear(dynasty, year)
  if (!alignment || Object.keys(alignment).length === 0) return ''
  const lines = []
  for (const [conf, abbrs] of Object.entries(alignment)) {
    if (!Array.isArray(abbrs) || abbrs.length === 0) continue
    const names = abbrs
      .map(a => teamDisplay(null, a, dynasty))
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b))
    if (names.length === 0) continue
    lines.push(`${conf}: ${names.join(', ')}`)
  }
  return lines.join('\n')
}

const CONFERENCE_GUARDRAIL = `
═══════════════════════════════════════════════════════════
CONFERENCE ALIGNMENT — DYNASTY-SPECIFIC, NOT REAL LIFE
═══════════════════════════════════════════════════════════
THIS IS THE MOST COMMON MISTAKE. READ THIS SECTION BEFORE WRITING A SINGLE WORD.

Every conference assignment in your training data is WRONG for this dynasty. The user controls conference membership completely. Any team can be in any conference. Examples of alignments that are 100% valid in dynasty mode:
- Alabama in the Mountain West
- Notre Dame in the Big Ten (not Independent)
- Ohio State in the SEC
- USC in the Pac-12 (not the Big Ten)
- Clemson in the Big 12
- A completely custom conference with no real-world equivalent

Do NOT treat any team as a "traditional" member of any conference. Do NOT assume Notre Dame is Independent. Do NOT assume Alabama is in the SEC. Do NOT assume anyone is anywhere. The CONFERENCE ALIGNMENT block below is the only truth.

The CONFERENCE ALIGNMENT block in the data below is the ONLY source of truth for which team is in which conference. Before you write the conference name next to ANY team, look it up in that block. Do not skip this step.

Hard rules:
- Look up every team's conference in the alignment block. Use what you find there. PERIOD.
- Do NOT use real-world knowledge to assign a conference to any team. Your prior training about who's in the SEC / ACC / Big Ten / etc. is WRONG for this dynasty.
- If a team is not listed in the alignment block, refer to it WITHOUT a conference label. Do not guess.
- Do not reference real-world conference history ("the former Big 12 program", "the Pac-12's last stand", "joined the SEC last year"). The dynasty has its own history.
- "Conference races" sections must be built from the alignment block, not from memory of real-world divisional structure.

Self-check before you submit: pick five teams you mentioned in the recap and verify each one's conference matches what the CONFERENCE ALIGNMENT block says. If any don't match, fix them before sending.
`

// ---------------------------------------------------------------------------
// Shared guardrail block (used by all three prompts).
// ---------------------------------------------------------------------------

const FACTUAL_GUARDRAIL = `
═══════════════════════════════════════════════════════════
HARD RULE — NEVER MAKE THINGS UP
═══════════════════════════════════════════════════════════
You are writing this recap for a College Football dynasty mode save. The user has provided every fact you are allowed to use below. You must not invent ANY fact that is not in the data.

This includes (but is not limited to):
- Player names, positions, jersey numbers, classes, hometowns, ratings, stat lines
- Team records, scores, ranks, conference standings, schedule items
- Coaching changes, transfers, injuries, recruiting news
- Crowd sizes, weather, quotes, locker-room narratives, fan reactions
- Nicknames, rivalries, traditions, "first time since…" historical claims

If a detail is not present in the data block, do not include it. A SHORT, ACCURATE recap is always better than a LONG one with fabricated details. The user's words: "where it could go wrong and be lame is if it makes stuff up that is just untrue."

When you genuinely don't have enough data to write a section, omit the section. Do not paper over gaps with generic filler ("the team showed great heart", "the crowd was electric") — that is a form of making things up.

You may:
- Quote stats and scores verbatim from the data block
- Paraphrase what the data shows (e.g. "rolled to a 35-point win" if the score gap is 35)
- Use neutral connective tissue ("Meanwhile,", "Elsewhere,", "Looking ahead,")
- Speculate VERY LIGHTLY about implications strictly grounded in the data ("the loss likely drops them out of the top 10" — only if they were in the top 10 and lost)

You must not:
- Quote any player or coach
- Describe any specific play, drive, or moment that isn't in the data
- Reference any external real-world fact about these teams or players
- Pretend to know how a player performed when their stat line is not in the data
`

const OUTPUT_FORMAT = `
═══════════════════════════════════════════════════════════
OUTPUT FORMAT
═══════════════════════════════════════════════════════════
Wrap your ENTIRE response in a single fenced markdown block:

\`\`\`markdown
# (your recap here, using markdown headings, **bold**, and paragraphs)
\`\`\`

The fence preserves markdown when the user copies the text on mobile. Do not include any text before the opening fence or after the closing fence — no preamble, no "Here's your recap:", no follow-up offer.

Inside the fence:
- Open with an H1 title in the form "# YEAR Week N Recap" (e.g., "# 2034 Week 6 Recap") or "# YEAR Season Preview" (e.g., "# 2034 Season Preview"). Year-first, no em-dashes in the title.
- Use H2/H3 for sections.
- Keep paragraphs tight. Two to four short paragraphs per section is plenty.
- Bold standout names and scores.
- No tables, no bullet-point lists longer than ~5 items.
- No emoji.

ABSOLUTELY FORBIDDEN inside the markdown block:
- ChatGPT/Claude citation markers like \`:contentReference[oaicite:0]{index=0}\`, \`[oaicite:N]\`, \`:contentReference\`, \`【...】\`, \`[1]\`, \`[2]\`, footnote-style references.
- Source attributions, "according to the data block", "the data shows", or any meta-commentary about where you got the facts.
- HTML tags of any kind.
- Curly-brace template variables, JSON fragments, or pseudo-code.

These markers contaminate the saved recap and must never appear. The output is pure prose markdown — nothing else.
`

// ---------------------------------------------------------------------------
// 1) WEEK RECAP — recapping a week that already finished.
// ---------------------------------------------------------------------------

export function buildWeekRecapPrompt(dynasty, year, week) {
  const yearNum = Number(year)
  const weekNum = Number(week)

  // Human-readable label for postseason weeks (weeks 15-19 map to bowl/CFP rounds)
  const weekLabel = weekNum === 15 ? 'Conference Championship Week'
    : weekNum === 16 ? 'Bowl Week 1'
    : weekNum === 17 ? 'Bowl Week 2'
    : weekNum === 18 ? 'Bowl Week 3 / CFP Semifinals'
    : weekNum === 19 ? 'National Championship'
    : `Week ${weekNum}`
  const isBowlWeek = weekNum >= 15
  const cfpRoundLabel = weekNum === 16 ? 'CFP First Round'
    : weekNum === 17 ? 'CFP Quarterfinals'
    : weekNum === 18 ? 'CFP Semifinals'
    : weekNum === 19 ? 'National Championship' : null

  const games = (dynasty?.games || []).filter(g => g && Number(g.year) === yearNum)
  const weekGames = games.filter(g => {
    if (Number(g.week) === weekNum) return true
    if (!isBowlWeek) return false
    // Bowl/CFP games store week as 'Bowl' — include them based on bowlWeek/gameType
    if (weekNum === 16 && (g.isCFPFirstRound || g.gameType === 'cfp_first_round' || (g.isBowlGame && g.bowlWeek === 'week1'))) return true
    if (weekNum === 17 && (g.isCFPQuarterfinal || g.gameType === 'cfp_quarterfinal' || (g.isBowlGame && g.bowlWeek === 'week2'))) return true
    if (weekNum === 18 && (g.isCFPSemifinal || g.gameType === 'cfp_semifinal' || (g.isBowlGame && g.bowlWeek === 'week3'))) return true
    if (weekNum === 19 && (g.isCFPChampionship || g.gameType === 'cfp_championship')) return true
    return false
  })

  // ----- Buckets: Top 25 head-to-head, ranked-vs-unranked, all games -----
  // Same week-game list partitioned for readability so the AI can scan
  // ranked-on-ranked drama before sifting the long tail of FBS results.
  // The user's team's game is just one of these — no special treatment.
  const isRanked = (n) => typeof n === 'number' && n >= 1 && n <= 25
  const top25vTop25 = []
  const top25vUnranked = []
  const everyGameLine = []
  for (const g of weekGames) {
    const r1 = g.team1Rank, r2 = g.team2Rank
    if (isRanked(r1) && isRanked(r2)) top25vTop25.push(g)
    else if (isRanked(r1) || isRanked(r2)) top25vUnranked.push(g)
    else everyGameLine.push(g) // unranked-vs-unranked only — no duplication with the buckets above
  }

  // For bowl weeks: separate CFP playoff games from regular bowl games
  const cfpWeekGames = isBowlWeek ? weekGames.filter(g =>
    g.isCFPFirstRound || g.isCFPQuarterfinal || g.isCFPSemifinal || g.isCFPChampionship ||
    g.gameType === 'cfp_first_round' || g.gameType === 'cfp_quarterfinal' ||
    g.gameType === 'cfp_semifinal' || g.gameType === 'cfp_championship'
  ) : []
  const regularBowlGames = isBowlWeek ? weekGames.filter(g =>
    g.isBowlGame && !cfpWeekGames.some(c => c.id === g.id)
  ) : []


  // ----- Section: Stat leaders THIS WEEK from box-score -----
  // Box scores live on the game itself; aggregate the user-game's box plus any
  // other game with a box score we have. We skip stats we don't have.
  const weekBoxLeaders = []
  for (const g of weekGames) {
    if (!g.boxScore) continue
    const t1Name = teamDisplay(g.team1Tid, g.team1, dynasty)
    const t2Name = teamDisplay(g.team2Tid, g.team2, dynasty)
    const sides = [
      { side: 'home', team: Number(g.homeTeamTid) === Number(g.team1Tid) ? t1Name : t2Name },
      { side: 'away', team: Number(g.homeTeamTid) === Number(g.team1Tid) ? t2Name : t1Name },
    ]
    for (const { side, team } of sides) {
      const bs = g.boxScore[side]
      if (!bs) continue
      const passing = (bs.passing || []).slice(0, 2)
      const rushing = (bs.rushing || []).slice(0, 2)
      const receiving = (bs.receiving || []).slice(0, 2)
      const defense = (bs.defense || []).slice(0, 2)
      for (const p of passing) {
        if (p?.passYds) weekBoxLeaders.push(`${p.name} (${team}) — ${p.passYds} pass yds, ${p.passTD || 0} TD, ${p.passInt || 0} INT`)
      }
      for (const p of rushing) {
        if (p?.rushYds) weekBoxLeaders.push(`${p.name} (${team}) — ${p.rushYds} rush yds, ${p.rushTD || 0} TD on ${p.rushAtt || 0} carries`)
      }
      for (const p of receiving) {
        if (p?.recYds) weekBoxLeaders.push(`${p.name} (${team}) — ${p.recYds} rec yds, ${p.rec || 0} catches, ${p.recTD || 0} TD`)
      }
      for (const p of defense) {
        if (p?.tackles || p?.sacks || p?.intsMade) {
          const parts = []
          if (p.tackles) parts.push(`${p.tackles} tackles`)
          if (p.sacks) parts.push(`${p.sacks} sacks`)
          if (p.intsMade) parts.push(`${p.intsMade} INT`)
          weekBoxLeaders.push(`${p.name} (${team}) — ${parts.join(', ')}`)
        }
      }
    }
  }

  // ----- Section: Weekly poll snapshots -----
  // Read from dynasty.teams[*].byYear[year].rankByWeek — the canonical
  // poll store the Rankings page also reads from. Each team's
  // rankByWeek[W] is its rank ENTERING Week W (= post-Week-(W-1)
  // poll). After PR #117, saveWeeklyScores writes the user-entered
  // weekly-scores ranks straight into rankByWeek[currentWeek]; before
  // that change, this code reconstructed the snapshot from the
  // game-record team1Rank/team2Rank fields, which were only populated
  // for games played that week and went stale (or empty) when those
  // game records were wiped on a re-save. The rankByWeek read survives
  // those gaps, so a Week 9 recap pulls Wk 9's actual poll instead of
  // falling all the way back to Wk 6 just because the Wk 7-9 game
  // records lost their rank fields. The Rankings page does the same
  // first-claim-wins per slot 1-25 to rule out stale duplicates.
  const buildSnapshotEnteringWeek = (week) => {
    const slotMap = new Map()
    for (const [tidStr, team] of Object.entries(dynasty?.teams || {})) {
      const rbw = team?.byYear?.[yearNum]?.rankByWeek ?? team?.byYear?.[String(yearNum)]?.rankByWeek
      if (!rbw || typeof rbw !== 'object') continue
      const v = rbw[week] ?? rbw[String(week)]
      if (!isRanked(v)) continue
      if (slotMap.has(v)) continue
      slotMap.set(v, {
        rank: v,
        tid: Number(tidStr),
        name: teamDisplay(Number(tidStr), team.abbr, dynasty),
      })
    }
    return [...slotMap.values()].sort((a, b) => a.rank - b.rank)
  }

  // Find the most recent populated poll, preferring `preferredWeek`
  // and walking back to fill in if recent weeks are sparse. ≥10
  // entries is the threshold for "substantial enough to anchor the
  // recap on" — under that the snapshot is more misleading than
  // useful.
  const buildPeekSnapshot = (preferredWeek) => {
    for (let w = preferredWeek; w >= 0; w--) {
      const rows = buildSnapshotEnteringWeek(w)
      if (rows.length >= 10) return { rows, latestWeek: w }
    }
    return { rows: [], latestWeek: null }
  }

  // Per-week evolution: for each week W from 0 → weekNum+1, the
  // snapshot of teams that ENTERED Week W ranked. Sparse weeks (data
  // loss, partial entry) just get omitted from the evolution block
  // rather than feeding the AI a one-row "Top 25" that misrepresents
  // the state of the dynasty.
  const top25ByWeek = []
  for (let w = 0; w <= weekNum + 1; w++) {
    const rows = buildSnapshotEnteringWeek(w)
    if (rows.length >= 10) top25ByWeek.push({ week: w, rows })
  }

  // Latest derivable poll — entering-Week-(N+1) = post-Week-N. Fresh
  // when the user has just entered Week N's scores during their
  // current Week-N+1 session (the typical recap flow).
  const peekSnapshot = buildPeekSnapshot(weekNum + 1)
  const hasFreshPostWeekPoll = peekSnapshot.latestWeek === weekNum + 1
  const rankSnapshot = peekSnapshot.rows
  const nextWeekLabel = weekNum + 1 === 15 ? 'Conference Championship Week'
    : weekNum + 1 === 16 ? 'Bowl Week 1'
    : weekNum + 1 === 17 ? 'Bowl Week 2'
    : weekNum + 1 === 18 ? 'Bowl Week 3 / CFP Semifinals'
    : weekNum + 1 === 19 ? 'National Championship'
    : `Week ${weekNum + 1}`
  const rankSnapshotLabel = hasFreshPostWeekPoll
    ? `POST-${weekLabel.toUpperCase()} TOP 25 (= the rankings teams ENTERED ${nextWeekLabel} with)`
    : `MOST RECENT TOP 25 SNAPSHOT (the post-${weekLabel} poll isn't populated yet — use as baseline and infer movement from this week's results.)`

  // ----- Section: Cumulative stat leaders (season-to-date) -----
  // Aggregates every box score we have through this week into a per-player
  // total per stat category. The AI uses these to call out award
  // front-runners ("through Week N, X leads the country in ..."). We only
  // emit values we computed from data; absence = no claim available.
  const seasonStatTotals = {} // key = `${name}|${team}` → { passYds, passTD, ... }
  for (const g of games) {
    const gw = Number(g.week)
    if (!Number.isFinite(gw) || gw > weekNum) continue
    if (!g.boxScore) continue
    const t1Name = teamDisplay(g.team1Tid, g.team1, dynasty)
    const t2Name = teamDisplay(g.team2Tid, g.team2, dynasty)
    const sides = [
      { side: 'home', team: Number(g.homeTeamTid) === Number(g.team1Tid) ? t1Name : t2Name },
      { side: 'away', team: Number(g.homeTeamTid) === Number(g.team1Tid) ? t2Name : t1Name },
    ]
    for (const { side, team } of sides) {
      const bs = g.boxScore[side]
      if (!bs) continue
      const bump = (name, fields) => {
        if (!name) return
        const key = `${name}|${team}`
        if (!seasonStatTotals[key]) seasonStatTotals[key] = { name, team, games: 0 }
        seasonStatTotals[key].games += 1
        for (const [k, v] of Object.entries(fields)) {
          if (typeof v !== 'number') continue
          seasonStatTotals[key][k] = (seasonStatTotals[key][k] || 0) + v
        }
      }
      for (const p of (bs.passing || [])) {
        if (!p) continue
        bump(p.name, { passYds: p.passYds, passTD: p.passTD, passInt: p.passInt, passComp: p.passComp, passAtt: p.passAtt })
      }
      for (const p of (bs.rushing || [])) {
        if (!p) continue
        bump(p.name, { rushYds: p.rushYds, rushTD: p.rushTD, rushAtt: p.rushAtt })
      }
      for (const p of (bs.receiving || [])) {
        if (!p) continue
        bump(p.name, { recYds: p.recYds, rec: p.rec, recTD: p.recTD })
      }
      for (const p of (bs.defense || [])) {
        if (!p) continue
        bump(p.name, { tackles: p.tackles, sacks: p.sacks, intsMade: p.intsMade, ff: p.ff, fr: p.fr })
      }
    }
  }
  const leaderRows = Object.values(seasonStatTotals)
  const topByField = (field, n = 5) => leaderRows
    .filter(r => (r[field] || 0) > 0)
    .sort((a, b) => (b[field] || 0) - (a[field] || 0))
    .slice(0, n)

  // ----- Section: Conference standings (saved snapshot, if any) -----
  const standingsByConf = dynasty?.conferenceStandingsByYear?.[yearNum] || {}

  // ----- Section: Prior season(s) league-wide context — no user centering -----
  // Just last 1-2 years of national headlines (final poll top 5, Heisman)
  // so the AI can frame "year-over-year" storylines without going off into
  // history we don't have data for.
  const allDynastyGames = dynasty?.games || []
  const priorYears = (() => {
    const set = new Set()
    for (const g of allDynastyGames) {
      const y = Number(g?.year)
      if (Number.isFinite(y) && y < yearNum) set.add(y)
    }
    return [...set].sort((a, b) => b - a).slice(0, 2)
  })()
  const priorYearLines = []
  for (const y of priorYears) {
    // Canonical key is `finalPollsByYear` — DynastyContext, Rankings page,
    // Dashboard all read from there. The previous read from `finalPolls`
    // (no `ByYear` suffix) silently returned undefined every time, so this
    // section emitted nothing in practice and the AI never had the
    // prior-year national poll to draw from.
    const finalMedia = dynasty?.finalPollsByYear?.[y]?.media
    if (Array.isArray(finalMedia) && finalMedia.length > 0) {
      const top10 = finalMedia.slice(0, 10).map(e => `#${e.rank} ${teamDisplay(e.tid, e.team, dynasty)}`).join(', ')
      priorYearLines.push(`${y} final poll top 10: ${top10}.`)
    }
    const aw = dynasty?.awardsByYear?.[y] || {}
    if (aw.heisman?.player || aw.heisman?.name) priorYearLines.push(`${y} Heisman: ${aw.heisman.player || aw.heisman.name}.`)
  }

  // ----- Per-team prior-year context for every team that played this week -----
  // The user's note: weekly recaps mentioned a team's preseason rank but
  // never their actual prior-year postseason finish, so it had no way to
  // write "after nearly winning the natty last season..." for any
  // individual team. The fix is to bundle, for every team in the dynasty,
  // the per-team data the per-game recap already gets:
  //   - current-season record
  //   - prior-year final poll rank
  //   - prior-year deepest postseason result (with a one-line narrative cue)
  //   - coaching tenure + at-school stint record
  //   - recruiting class context (arrived + in-progress)
  //   - quality wins / bad losses tally
  //
  // The user explicitly asked for ALL teams (not just teams in this week's
  // games) — the AI doesn't have room to use everything, but having the
  // data available lets it pull whatever fits each storyline. Format is
  // compact one-line-per-team to keep the prompt size manageable.
  const priorYear = yearNum - 1

  // Enumerate every team in the dynasty (FBS + custom + teambuilder).
  // dynasty.teams is keyed by tid and contains the canonical roster of
  // teams the AI should know about. Each entry: { tid, abbr, name, ... }.
  const allTeams = []
  if (dynasty?.teams && typeof dynasty.teams === 'object') {
    for (const [tidKey, t] of Object.entries(dynasty.teams)) {
      if (!t || !t.abbr) continue
      const tid = Number(tidKey)
      if (!Number.isFinite(tid)) continue
      allTeams.push({
        tid,
        abbr: t.abbr,
        name: teamDisplay(tid, t.abbr, dynasty),
      })
    }
  }
  // Sort alphabetically by display name so the AI can scan deterministically.
  allTeams.sort((a, b) => a.name.localeCompare(b.name))

  // Per-team aggregates. Each line is compact (<120 chars typically) so
  // all ~134 FBS teams plus customs fit without ballooning the prompt
  // beyond reason. Empty bits are omitted to keep lines tight.
  const allTeamRecordLines = []
  const allTeamPriorContextLines = []
  const allTeamCoachLines = []
  const allTeamRecruitingLines = []
  const allTeamQualityLines = []
  for (const t of allTeams) {
    // CURRENT-SEASON RECORD — every team gets this line, capped at
    // the recap week so future-week games already in the dataset don't
    // leak into "as of Week N" framing.
    const rec = recordFromGames(games, yearNum, t.tid, weekNum)
    if (rec.wins > 0 || rec.losses > 0) {
      allTeamRecordLines.push(`${t.name}: ${rec.wins}-${rec.losses}`)
    }

    // PRIOR-YEAR FINISH (rank + deepest postseason).
    const finalRank = getTeamFinalRank(dynasty, t.abbr, priorYear)
    const prior = getPriorYearPostseason(allDynastyGames, t.abbr, yearNum, dynasty)
    if (finalRank || prior) {
      const bits = []
      if (finalRank) bits.push(`finished ${priorYear} #${finalRank}`)
      if (prior?.narrativeCue) bits.push(prior.narrativeCue)
      else if (prior) bits.push(`${prior.result === 'W' ? 'won' : 'lost'} ${prior.gameName} ${prior.score}`)
      if (prior?.wonNationalChampionship) bits.push('— DEFENDING NATIONAL CHAMPIONS')
      else if (prior?.lostNationalChampionship) bits.push('— came one game short of the title')
      allTeamPriorContextLines.push(`${t.name}: ${bits.join('; ')}`)
    }

    // COACHING TENURE — only emit when we have meaningful tenure data.
    const coach = getCoachContext(dynasty, t.abbr, yearNum)
    if (coach && coach.yearAtSchool >= 1) {
      const stintBit = `${coach.stintWins}-${coach.stintLosses} since ${coach.stintStartYear}`
      const cueBit = coach.framingCue ? ` (${coach.framingCue})` : ''
      allTeamCoachLines.push(`${t.name}: ${coach.name}, yr ${coach.yearAtSchool}, ${stintBit}${cueBit}.`)
    }

    // RECRUITING CLASS.
    const incoming = getIncomingClassRank(dynasty, t.abbr, yearNum)
    const nextCycle = getIncomingClassRank(dynasty, t.abbr, yearNum + 1)
    if (incoming || nextCycle) {
      const bits = []
      if (incoming) bits.push(`#${incoming} ${yearNum} class arrived`)
      if (nextCycle) bits.push(`signing #${nextCycle} ${yearNum + 1} class`)
      allTeamRecruitingLines.push(`${t.name}: ${bits.join('; ')}`)
    }

    // QUALITY WINS / BAD LOSSES tally.
    const qwl = getQualityWinsAndBadLosses(allDynastyGames, t.abbr, yearNum, dynasty)
    if (qwl && (qwl.qualityWins.length > 0 || qwl.badLosses.length > 0)) {
      const bits = []
      if (qwl.qualityWins.length > 0) bits.push(`${qwl.qualityWins.length} qual win${qwl.qualityWins.length === 1 ? '' : 's'}`)
      if (qwl.badLosses.length > 0) bits.push(`${qwl.badLosses.length} bad loss${qwl.badLosses.length === 1 ? '' : 'es'}`)
      allTeamQualityLines.push(`${t.name}: ${bits.join(', ')}.`)
    }
  }

  // For each game this week, include the most-recent prior matchup between
  // the same two teams + the rivalry/trophy name when applicable. Powers
  // per-game revenge/rematch framing AND lets the recap call rivalry games
  // by name ("the Iron Bowl"). Only the LAST meeting (we'd blow up the
  // prompt otherwise — there are dozens of weekly games).
  const lastMeetingLines = []
  const rivalryLines = []
  for (const g of weekGames) {
    const team1Abbr = g.team1
    const team2Abbr = g.team2
    if (!team1Abbr || !team2Abbr) continue
    const t1Name = teamDisplay(g.team1Tid, g.team1, dynasty)
    const t2Name = teamDisplay(g.team2Tid, g.team2, dynasty)

    const rivalry = getRivalryName(team1Abbr, team2Abbr)
    if (rivalry) rivalryLines.push(`${t1Name} vs ${t2Name} — ${rivalry}.`)

    const history = getHeadToHeadHistory(allDynastyGames, team1Abbr, team2Abbr, yearNum, 1, dynasty)
    if (!Array.isArray(history) || history.length === 0) continue
    const last = history[0]
    lastMeetingLines.push(
      `${t1Name} vs ${t2Name} — last met ${last.year}: ${last.winner} def. ${last.loser} ${last.winnerScore}-${last.loserScore} (${last.gameType}). Revenge angle live for ${last.loser} this week.`
    )
  }

  // CFP projection — where the 12-team field would land if the season
  // ended today. Lets the recap write "Tennessee has played its way
  // into a Sugar Bowl projection" / "the Big Ten still has a path with
  // both Iowa and Wisconsin in the projected field."
  const cfpProjection = (() => {
    try {
      return buildCFPProjection(dynasty, yearNum)
    } catch {
      return { available: false }
    }
  })()
  const cfpProjectionLines = []
  if (cfpProjection?.available && Array.isArray(cfpProjection.seeds) && cfpProjection.seeds.length > 0) {
    for (const s of cfpProjection.seeds) {
      const teamLabel = teamDisplay(s.tid, s.team, dynasty)
      cfpProjectionLines.push(`#${s.seed} ${teamLabel} (${s.bidLabel || s.bid || ''})`)
    }
  }

  // Heisman watch — derived from the existing season stat leaders we
  // already compute for the data block. Adds the "front-runner"
  // framing the AI was missing without us pre-baking opinions.
  // Computed below after `topByField` / `passLeaders` etc. are defined,
  // so we just declare the array here and fill it later in this function.
  const heismanWatchLines = []

  // Season-long POW trail across the whole league. Distinct from the
  // per-game `seasonPOWTrail` field (same data, but here scoped to the
  // weekly recap so we can flag multi-time award winners across the
  // entire FBS, not just the two teams in one game).
  const seasonPOWLeaders = getSeasonPOWTrail(allDynastyGames, yearNum)
    .filter(p => p.total >= 2)
    .slice(0, 12)

  // ----- Section: Saved preseason poll for current year (if any) -----
  const presPolls = dynasty?.preseasonRankingsByYear?.[yearNum]
    || dynasty?.finalPollsByYear?.[yearNum]?.preseason
    || null
  const preseasonTop25Lines = []
  if (Array.isArray(presPolls) && presPolls.length > 0) {
    for (const r of presPolls) preseasonTop25Lines.push(`#${r.rank} ${teamDisplay(r.tid, r.team, dynasty)}`)
  }

  // ----- Section: Records of every currently-ranked team (season to date) -----
  // Lets the AI describe a team's broader season arc when discussing their
  // Week N result without inventing it. Tied to rankSnapshot above.
  const rankedRecordLines = []
  for (const r of rankSnapshot) {
    if (r.tid == null) continue
    const rec = recordFromGames(games, yearNum, r.tid, weekNum)
    rankedRecordLines.push(`#${r.rank} ${r.name}: ${rec.wins}-${rec.losses}`)
  }

  // ===================================================================
  // Assemble the data block as plain text. National scope — no user-team
  // framing. The user's team's data appears here only as one of the many
  // games / teams in the league.
  // ===================================================================
  const sections = []

  sections.push(`SEASON CONTEXT`)
  sections.push(`Year: ${yearNum}`)
  sections.push(`Week being recapped: ${weekLabel}`)
  sections.push('')

  // Conference lookup for inline annotation in every game line.
  // Built once per recap so we don't rescan the alignment per game.
  const confLookup = makeConferenceLookup(dynasty, yearNum)

  // For bowl weeks: show CFP playoff games first, prominently labeled
  if (isBowlWeek && cfpWeekGames.length > 0) {
    sections.push(`CFP — ${cfpRoundLabel} RESULTS  ← LEAD THE RECAP WITH THESE`)
    sections.push(`(These are the College Football Playoff games this week. They are the PRIORITY story — lead the recap with them. Who advanced? Who was upset? Frame what comes next in the bracket.)`)
    sections.push(`(Ranks shown are each team's entering rank. Conferences in parens are the dynasty's CURRENT alignment, not real life.)`)
    for (const g of cfpWeekGames) sections.push(fmtGameLine(g, dynasty, confLookup))
    sections.push('')
  }

  // For bowl weeks: show regular (non-CFP) bowl games as secondary stories
  if (isBowlWeek) {
    const rankedBowls = [...top25vTop25, ...top25vUnranked].filter(g => regularBowlGames.some(b => b.id === g.id))
    const unrankedBowls = everyGameLine.filter(g => regularBowlGames.some(b => b.id === g.id))
    if (rankedBowls.length > 0) {
      sections.push(`RANKED BOWL MATCHUPS (non-CFP) — ${weekLabel}`)
      sections.push(`(Secondary stories after the CFP. Cover notable ranked matchups and upsets.)`)
      for (const g of rankedBowls) sections.push(fmtGameLine(g, dynasty, confLookup))
      sections.push('')
    }
    if (unrankedBowls.length > 0) {
      sections.push(`OTHER BOWL GAMES — ${weekLabel}`)
      for (const g of unrankedBowls) sections.push(fmtGameLine(g, dynasty, confLookup))
      sections.push('')
    }
  } else {
    // Regular season: standard three-bucket structure
    if (top25vTop25.length > 0) {
      sections.push(`HEADLINE GAMES — RANKED vs RANKED (${weekLabel})`)
      sections.push(`(Ranks shown are each team's entering rank — the rank they were ranked DURING the game. Conferences in parens are the dynasty's CURRENT alignment, not real life.)`)
      for (const g of top25vTop25) sections.push(fmtGameLine(g, dynasty, confLookup))
      sections.push('')
    }
    if (top25vUnranked.length > 0) {
      sections.push(`TOP-25 vs UNRANKED RESULTS (${weekLabel})`)
      for (const g of top25vUnranked) sections.push(fmtGameLine(g, dynasty, confLookup))
      sections.push('')
    }
    if (everyGameLine.length > 0) {
      sections.push(`OTHER FBS GAMES — UNRANKED MATCHUPS (${weekLabel})`)
      for (const g of everyGameLine) sections.push(fmtGameLine(g, dynasty, confLookup))
      sections.push('')
    }
  }

  // Stat lines from this week's box scores (top 2 per category per side)
  if (weekBoxLeaders.length > 0) {
    sections.push(`STAT LINES FROM ${weekLabel.toUpperCase()} BOX SCORES`)
    for (const line of weekBoxLeaders) sections.push(line)
    sections.push('')
  }

  // Cumulative season stat leaders — drives award/Heisman narratives
  const seasonStatBlocks = []
  const passLeaders = topByField('passYds')
  const rushLeaders = topByField('rushYds')
  const recLeaders  = topByField('recYds')
  const sackLeaders = topByField('sacks')
  const tackleLeaders = topByField('tackles')
  if (passLeaders.length > 0) {
    seasonStatBlocks.push(`Passing yards leaders:\n${passLeaders.map(p => `  ${p.name} (${p.team}) — ${p.passYds} yds, ${p.passTD || 0} TD, ${p.passInt || 0} INT in ${p.games} games`).join('\n')}`)
  }
  if (rushLeaders.length > 0) {
    seasonStatBlocks.push(`Rushing yards leaders:\n${rushLeaders.map(p => `  ${p.name} (${p.team}) — ${p.rushYds} yds, ${p.rushTD || 0} TD on ${p.rushAtt || 0} carries (${p.games} g)`).join('\n')}`)
  }
  if (recLeaders.length > 0) {
    seasonStatBlocks.push(`Receiving yards leaders:\n${recLeaders.map(p => `  ${p.name} (${p.team}) — ${p.recYds} yds, ${p.rec || 0} catches, ${p.recTD || 0} TD (${p.games} g)`).join('\n')}`)
  }
  if (sackLeaders.length > 0) {
    seasonStatBlocks.push(`Sack leaders:\n${sackLeaders.map(p => `  ${p.name} (${p.team}) — ${p.sacks} sacks (${p.games} g)`).join('\n')}`)
  }
  if (tackleLeaders.length > 0) {
    seasonStatBlocks.push(`Tackle leaders:\n${tackleLeaders.map(p => `  ${p.name} (${p.team}) — ${p.tackles} tackles (${p.games} g)`).join('\n')}`)
  }

  // Heisman watch — front-runners across the three offensive yardage
  // categories. Just naming them as "current Heisman front-runners"
  // unlocks a beat the AI was previously missing — without this framing
  // the stat leaders read as encyclopedia entries, not award storylines.
  const heismanCandidates = []
  if (passLeaders[0]) heismanCandidates.push({ ...passLeaders[0], lane: 'passing' })
  if (rushLeaders[0]) heismanCandidates.push({ ...rushLeaders[0], lane: 'rushing' })
  if (recLeaders[0]) heismanCandidates.push({ ...recLeaders[0], lane: 'receiving' })
  // Also include the #2 in each lane if their stats are within ~10% of #1
  // — close races deserve to be noted, blowouts don't.
  const closeChase = (l1, l2, key) => l1 && l2 && l2[key] >= l1[key] * 0.9
  if (closeChase(passLeaders[0], passLeaders[1], 'passYds')) heismanCandidates.push({ ...passLeaders[1], lane: 'passing (chasing)' })
  if (closeChase(rushLeaders[0], rushLeaders[1], 'rushYds')) heismanCandidates.push({ ...rushLeaders[1], lane: 'rushing (chasing)' })
  if (closeChase(recLeaders[0], recLeaders[1], 'recYds')) heismanCandidates.push({ ...recLeaders[1], lane: 'receiving (chasing)' })
  for (const h of heismanCandidates) {
    let line
    if (h.lane.startsWith('passing')) line = `${h.name} (${h.team}) — passing leader: ${h.passYds || 0} yds, ${h.passTD || 0} TD, ${h.passInt || 0} INT`
    else if (h.lane.startsWith('rushing')) line = `${h.name} (${h.team}) — rushing leader: ${h.rushYds || 0} yds, ${h.rushTD || 0} TD`
    else line = `${h.name} (${h.team}) — receiving leader: ${h.recYds || 0} yds, ${h.recTD || 0} TD`
    if (h.lane.includes('chasing')) line += ' [chasing the leader]'
    heismanWatchLines.push(line)
  }

  if (seasonStatBlocks.length > 0) {
    sections.push(`CUMULATIVE SEASON STAT LEADERS (through ${weekLabel}, derived from box scores we have)`)
    sections.push(seasonStatBlocks.join('\n'))
    sections.push('')
  }

  // Latest derivable Top 25 — labeled differently based on whether we
  // have Week N+1 data (= true post-Week N poll) or only have Week N
  // entering ranks (= post-Week N-1 poll, somewhat stale).
  if (rankSnapshot.length > 0) {
    sections.push(rankSnapshotLabel)
    sections.push(`(Each rank slot 1-25 belongs to exactly one team — there are no ties.)`)
    for (const r of rankSnapshot) sections.push(`#${r.rank} ${r.name}`)
    sections.push('')
  }

  // Records for each currently-ranked team
  if (rankedRecordLines.length > 0) {
    sections.push(`RECORDS OF CURRENTLY-RANKED TEAMS (season to date)`)
    for (const line of rankedRecordLines) sections.push(line)
    sections.push('')
  }

  // Top 25 EVOLUTION week-by-week — each row is the poll teams ENTERED
  // that week with (i.e. the post-previous-week poll).
  if (top25ByWeek.length > 1) {
    sections.push(`TOP 25 EVOLUTION (poll teams ENTERED each week with — oldest to newest)`)
    sections.push(`(Each row is the poll AT THE START of that week. Use this section ONLY for describing poll movement — "rose from #X to #Y" / "fell from #X to #Y" — by comparing consecutive rows.)`)
    for (const snap of top25ByWeek) {
      const compact = snap.rows.slice(0, 25).map(r => `#${r.rank} ${r.name}`).join(' · ')
      sections.push(`Entering Week ${snap.week}: ${compact}`)
    }
    sections.push('')
  }

  // Saved preseason poll
  if (preseasonTop25Lines.length > 0) {
    sections.push(`PRESEASON TOP 25 (${yearNum}, as the user entered it)`)
    for (const line of preseasonTop25Lines) sections.push(line)
    sections.push('')
  }

  // Conference alignment for THIS dynasty THIS year — the AI MUST treat
  // this as the only source of truth (see CONFERENCE_GUARDRAIL).
  const alignmentBlock = conferenceAlignmentBlock(dynasty, yearNum)
  if (alignmentBlock) {
    sections.push(`CONFERENCE ALIGNMENT (${yearNum}) — THIS OVERRIDES YOUR REAL-WORLD KNOWLEDGE`)
    sections.push(`(Use these conference assignments verbatim. Do not assign any team to a conference based on real life — only what's listed below counts.)`)
    sections.push(alignmentBlock)
    sections.push('')
  }

  // Conference standings
  const confKeys = Object.keys(standingsByConf)
  if (confKeys.length > 0) {
    sections.push(`CONFERENCE STANDINGS (saved snapshot, may be partial)`)
    for (const conf of confKeys) {
      const list = standingsByConf[conf]
      if (!Array.isArray(list) || list.length === 0) continue
      sections.push(`-- ${conf} --`)
      for (const t of list) {
        if (!t) continue
        sections.push(`${t.team}: ${t.wins || 0}-${t.losses || 0} (conf ${t.confWins || 0}-${t.confLosses || 0})`)
      }
    }
    sections.push('')
  }

  // Prior-year national headlines
  if (priorYearLines.length > 0) {
    sections.push(`PRIOR SEASON NATIONAL HEADLINES`)
    for (const line of priorYearLines) sections.push(line)
    sections.push('')
  }

  // Per-team prior-year context for every team in this week's games.
  // Lets the recap write lines like "After their CFP semifinal run last
  // season, Ole Miss has limped to 3-5 through the first half of the
  // year." Without this, the weekly recap had ZERO per-team historical
  // data — just last year's national top 5 — and the AI couldn't frame
  // any individual program's arc.
  // CURRENT-SEASON RECORDS — every team in the dynasty with at least one
  // played game this year. Reference data: the AI doesn't have to use
  // every line, but having every record in front of it means it can
  // anchor any team it mentions ("Tennessee, now 7-2, ...") instead of
  // having to derive the record from a long schedule.
  if (allTeamRecordLines.length > 0) {
    sections.push(`CURRENT-SEASON RECORDS — ALL TEAMS (${yearNum})`)
    sections.push(`Reference data — every team in the dynasty with a game played this year. You don't need to mention every team. When a team appears in your recap, this is its authoritative record; never invent a different one.`)
    for (const line of allTeamRecordLines) sections.push(line)
    sections.push('')
  }

  if (allTeamPriorContextLines.length > 0) {
    sections.push(`PRIOR-YEAR CONTEXT — ALL TEAMS (${priorYear} season finish)`)
    sections.push(`Reference data covering every team with a notable prior-year finish (top-25 final ranking, bowl, or CFP appearance). Use to set up year-over-year storylines: "after [last year's finish], Team X is now [this year's record]." Required: if a team you're discussing finished top-10 last year OR played in the CFP, reference their prior-year finish at least once. You don't need to mention every team here; pull what fits the storylines you're already writing.`)
    for (const line of allTeamPriorContextLines) sections.push(line)
    sections.push('')
  }

  // Coaching tenure for every team in the dynasty. Unlocks hot-seat /
  // first-year / era-builder beats anywhere in the recap.
  if (allTeamCoachLines.length > 0) {
    sections.push(`COACHING TENURE & STINT RECORDS — ALL TEAMS`)
    sections.push(`Reference data — head coach + tenure year + stint record for every team where coaching-staff data exists. When a coach's tenure or stint is dramatic (first year, sub-.500 multi-year stint, dominant 3+ year stint), let it carry the framing — "in his fourth year, Coach X is feeling the seat heat up", "first-year head coach already 6-0", "year three of Saban with a 22-7 stint — building a real era." Skip teams where the data is unremarkable.`)
    for (const line of allTeamCoachLines) sections.push(line)
    sections.push('')
  }

  // Recruiting class context — every team with class-rank data.
  if (allTeamRecruitingLines.length > 0) {
    sections.push(`RECRUITING CLASS CONTEXT — ALL TEAMS`)
    sections.push(`Reference data — recruiting class ranks for every team where they exist. Frame the gap between recruiting hype and on-field results when wide enough to be a story: "after signing the #3 class last cycle, Texas was supposed to be loaded — instead they're 4-4." Or the inverse: "the talent infusion is real — a top-15 class on top of last year's #4." Skip teams where the data is unremarkable.`)
    for (const line of allTeamRecruitingLines) sections.push(line)
    sections.push('')
  }

  // Quality wins / bad losses — concrete record-quality anchors for every
  // team that has at least one quality win or bad loss this year.
  if (allTeamQualityLines.length > 0) {
    sections.push(`QUALITY WINS & BAD LOSSES TALLY — ALL TEAMS (current season)`)
    sections.push(`Reference data. A 7-3 team with 2 ranked wins and 0 bad losses is "playing themselves into the at-large picture." A 7-3 team with 0 ranked wins and 1 bad loss "has the record but not the resume." Pull these to anchor any record claim you make.`)
    for (const line of allTeamQualityLines) sections.push(line)
    sections.push('')
  }

  // Per-game last-meeting context — the revenge / rematch / extends-streak hook.
  if (lastMeetingLines.length > 0) {
    sections.push(`LAST MEETINGS (most recent prior matchup for each game this week)`)
    sections.push(`When describing a game where the loser-of-last-time won this time, frame it as "got revenge" / "avenged last year's loss" / "exorcised last season's ghosts." When the same team wins again, frame it as "swept again" / "extended their hold on the series." Don't force this — only use it when the data here applies to a game you're already writing about.`)
    for (const line of lastMeetingLines) sections.push(line)
    sections.push('')
  }

  // Rivalry / trophy game flags. Lets the recap call rivalry games by
  // name ("the Iron Bowl") rather than "the Alabama-Auburn game."
  if (rivalryLines.length > 0) {
    sections.push(`RIVALRY / TROPHY GAMES THIS WEEK`)
    sections.push(`Refer to each of these games by its trophy/rivalry name at least once. Rivalry framing carries weight on its own — winning a rivalry game when you're 4-6 is a real story; losing one when you're 9-1 is a real wound.`)
    for (const line of rivalryLines) sections.push(line)
    sections.push('')
  }

  // CFP projection — the 12-team field if the season ended today.
  if (cfpProjectionLines.length > 0) {
    sections.push(`CFP PROJECTION (where the 12-team field would land if the season ended after Week ${weekNum})`)
    sections.push(`Use sparingly — one line per team you mention by name. "Tennessee has played its way into a Sugar Bowl projection." / "the Big Ten still has a path with both Iowa and Wisconsin in the projected field." Don't list the entire bracket; thread it through the prose.`)
    for (const line of cfpProjectionLines) sections.push(line)
    sections.push('')
  }

  // Heisman watch list — front-runners and chasers across the three
  // offensive yardage categories.
  if (heismanWatchLines.length > 0) {
    sections.push(`HEISMAN WATCH (current statistical front-runners)`)
    sections.push(`Use this framing when one of these players had a big game this week. "His third 300-yard game cements him as the Heisman front-runner." / "the Heisman race tightened: now within 50 yards of the leader." Don't crown anyone — describe the race.`)
    for (const line of heismanWatchLines) sections.push(line)
    sections.push('')
  }

  // Season-long POW trail — multi-time award winners across the season.
  if (seasonPOWLeaders.length > 0) {
    sections.push(`SEASON-LONG POW TRAIL (players with 2+ POW awards this season)`)
    sections.push(`Use to thread through stat lines from this week — "his fourth conference POW of the year." / "now a three-time national defensive POW." Don't enumerate the list; surface relevant entries when the player appears in this week's box scores.`)
    for (const p of seasonPOWLeaders) {
      const parts = []
      if (p.confOffense) parts.push(`${p.confOffense} conf off`)
      if (p.confDefense) parts.push(`${p.confDefense} conf def`)
      if (p.natlOffense) parts.push(`${p.natlOffense} natl off`)
      if (p.natlDefense) parts.push(`${p.natlDefense} natl def`)
      sections.push(`${p.name}: ${parts.join(', ')} POW (total ${p.total})`)
    }
    sections.push('')
  }

  const dataBlock = sections.join('\n')

  // Build naming-rule lines for ambiguous schools (e.g. "Miami" → two
  // teams). The recap link auto-detector recognizes EXACTLY these names,
  // so the AI must use them verbatim or the resulting recap will link
  // the wrong team. Empty array = no ambiguous teams played this year,
  // section omitted entirely.
  const ambig = ambiguousNamingRules(dynasty, yearNum)
  const namingRuleLines = []
  if (ambig.length > 0) {
    namingRuleLines.push('═══════════════════════════════════════════════════════════')
    namingRuleLines.push('TEAM NAMING — CRITICAL')
    namingRuleLines.push('═══════════════════════════════════════════════════════════')
    namingRuleLines.push('Some schools share a name (e.g. two "Miami"s play in FBS). To avoid linking the wrong team, you MUST refer to each ambiguous team using the exact label below. The recap auto-linker only routes links correctly when these labels are used verbatim.')
    namingRuleLines.push('')
    for (const group of ambig) {
      namingRuleLines.push(`Schools sharing the name "${group.school}":`)
      for (const t of group.teams) {
        namingRuleLines.push(`  - ${t.fullName} → write as "${t.display}" in prose`)
      }
    }
    namingRuleLines.push('')
  }

  return [
    isBowlWeek
      ? `You are an ESPN.com college football writer filing the ${yearNum} ${weekLabel} recap. Voice: straight, news-forward, fact-driven. NOT a columnist. NOT The Athletic. NOT opinion-driven.`
      : `You are an ESPN.com college football writer filing the ${weekLabel} national recap for the ${yearNum} season. Voice: straight, news-forward, fact-driven. NOT a columnist. NOT The Athletic. NOT opinion-driven. Think the kind of weekly wrap a fan reads on the ESPN.com front page Sunday morning to find out what happened across the country.`,
    ``,
    isBowlWeek && cfpRoundLabel
      ? `This is a BOWL SEASON recap. The College Football Playoff (${cfpRoundLabel}) is the DOMINANT story — lead with every CFP game, frame who advanced and what it sets up. Regular bowl games are secondary coverage. Cover the most notable bowl results after the CFP section.`
      : `This is a NATIONAL recap covering the entire FBS landscape — every notable game, every storyline, every standout performance the data shows. Treat all teams equally. Do NOT center the narrative on any single program. The reader is a college football fan who wants the week's whole picture.`,
    ``,
    `═══════════════════════════════════════════════════════════`,
    `VOICE — ESPN WEEKEND WRAP, NOT COLUMNIST`,
    `═══════════════════════════════════════════════════════════`,
    `You are REPORTING the week, not arguing about it. Read your draft and ask: does this sound like the front page of ESPN.com on a Sunday morning, or like a 1,500-word column on The Athletic? You want the first.`,
    ``,
    `- Lead with the biggest result — what happened, who beat whom, score — not a clever thesis.`,
    `- Active voice, past tense. After first reference, last names for players.`,
    `- Cut clichés: hard-fought, statement game, signature win (unless the data clearly earns it), title hopes.`,
    `- Skip throwaway transitions: "Meanwhile," "Elsewhere," (as a paragraph opener — fine mid-paragraph), "On the other hand," "All in all."`,
    `- One precise verb beats two adverbs.`,
    ``,
    `BANNED VERBS — use any AT MOST TWICE across the recap (they're AI tells): rolled, drilled, flattened, crushed, edged, topped, hammered, handled, dropped (as in "dropped 52 on"). Vary by what the data shows — "controlled from the opening drive", "pulled away late", "survived in [city]", "upset [team] on the road", etc.`,
    ``,
    `BANNED CLICHÉS / COLUMNIST-MODE PHRASES — do NOT write or close-paraphrase any of these. These are the AI tells that turn an ESPN wrap into a try-hard column:`,
    `   ✗ "did not X so much as Y" — column thesis lede ("did not settle anything in Week 13 so much as expose the difference between surviving November and controlling it")`,
    `   ✗ "[Team] survives but does not separate" — clever subhead thesis`,
    `   ✗ "the cleanest version of [their/its] case" / "the cleanest possible response to last year's ceiling"`,
    `   ✗ "made the poll from outside it" — over-clever construction`,
    `   ✗ "perfection and momentum are not always the same thing"`,
    `   ✗ "the difference was not just who won — it was who won in a way that..."`,
    `   ✗ "makes it harder to argue [X] more than [Y]" / "makes that field look more like an argument than a list"`,
    `   ✗ "[Month] punishes teams that..." / "[Month] rewards teams that..." — month/season personification`,
    `   ✗ "stop leaking games" / "the team needs to stop leaking"`,
    `   ✗ "the bracket drew itself" / "the bracket argued itself"`,
    `   ✗ "[the committee just inherited Y]" / "[the committee will notice]"`,
    `   ✗ "[Team]'s [thing] is starting to look like [Y]"`,
    `   ✗ "[Team]'s season died in [city]" / "[Team]'s playoff path closed in [city]"`,
    `   ✗ "set the tone", "imposed their will", "couldn't get anything going", "found their rhythm", "made the plays when it mattered", "dialed up", "got cooking", "sealed it" / "closed it out", "all the momentum", "answered the call", "leaves no doubt", "made it look easy"`,
    `   ✗ "the cleanest demolition" / "the cleanest possible response"`,
    `   ✗ Any sentence whose only job is to be the clever final line of a section. ESPN wraps end paragraphs on FACTS, not kickers.`,
    ``,
    `═══════════════════════════════════════════════════════════`,
    `RULE A — LEDE NAMES THE STORY`,
    `═══════════════════════════════════════════════════════════`,
    `First 1-2 sentences: name the biggest result of the week, the score, and what it changed (record, ranking, conference race, streak). Inverted pyramid. The lede REPORTS — it does not argue.`,
    ``,
    `✅ "Washington beat Oregon 43-36 in Eugene on Saturday, sending the Huskies to No. 2 in the country and dropping the Ducks from the top five."`,
    `✅ "Washington's win at Oregon headlined a Week 13 that scrambled the playoff race, with Notre Dame, Clemson and Miami all picking up wins and Oklahoma State falling to Colorado."`,
    `✅ "South Carolina upset No. 6 Tennessee 38-35 on Saturday, the Gamecocks' second top-10 win of the season."`,
    ``,
    `FORBIDDEN LEDE PATTERNS:`,
    `   ✗ "The Big Ten did not settle anything in Week 13 so much as expose the difference between surviving November and controlling it." (column thesis)`,
    `   ✗ "The SEC's six-week chaos finally toppled a top-five team..." (column thesis)`,
    `   ✗ "The week's loudest result came in..." (announce-style)`,
    `   ✗ "Saturday saw a slate of..." / "Saturday produced..." (passive announce)`,
    `   ✗ "Clemson's #1 ranking is starting to look like a clerical error." (column oracle)`,
    `   ✗ Any opening that argues an abstract claim about the week instead of naming a result.`,
    ``,
    `═══════════════════════════════════════════════════════════`,
    `RULE B — NO SCORE DUMP. VARY THE LENS.`,
    `═══════════════════════════════════════════════════════════`,
    `Score-dump = three or more game results in a row with nothing but team names + verbs + scores. The most common AI failure here.`,
    ``,
    `When you list 3+ games in a row, each team named gets ONE distinguishing detail beyond the score — and vary the source (current record, ranking movement, conference standing, prior-year finish, coaching note, recruiting class, etc.). If every callout reaches for the same lens, rotate. If a team has no distinguishing detail worth a sentence, drop them.`,
    ``,
    `Sections covering 4+ games either split across paragraphs grouped by theme (conference races, ranked-vs-ranked, upsets) OR pick fewer games. A 6-game wall-of-blurbs is the score-dump in disguise — every blurb individually fine, the rhythm flattens.`,
    ``,
    `═══════════════════════════════════════════════════════════`,
    `RULE C — PRIOR-YEAR / COACHING CONTEXT (USE LIGHTLY)`,
    `═══════════════════════════════════════════════════════════`,
    `If a featured team finished top-10 last year or played in the CFP, you can reference that ONCE — usually as a record-after-context note, not as a lede or section theme. "A year after losing the title game, Georgia is back to 9-1."`,
    ``,
    `Cap: at most 2-3 prior-year references across the entire recap. Do NOT make prior-year context the lede. Do NOT thread "a year removed from..." through every paragraph — it becomes the AI's hedge. Trust the reader.`,
    ``,
    `═══════════════════════════════════════════════════════════`,
    `RULE D — POLL MOVEMENT IS A STAT, NOT A SAGA`,
    `═══════════════════════════════════════════════════════════`,
    `Characterize trajectory plainly. Don't dramatize.`,
    ``,
    `✅ "Tennessee dropped from No. 2 to No. 6 after losing to South Carolina."`,
    `✅ "Oregon fell from No. 5 to No. 9 with the loss; Washington jumped from No. 4 to No. 2."`,
    `✗ "Tennessee's six-week descent — from #2 to outside the Top 25 in 42 days — is the worst rolling collapse in college football this season."`,
    `✗ "[Team]'s national title hopes died in [City]."`,
    ``,
    `═══════════════════════════════════════════════════════════`,
    `RULE E — HEADLINE & SUBHEAD DISCIPLINE`,
    `═══════════════════════════════════════════════════════════`,
    `HEADLINE — write an ESPN.com news headline. Sentence case (capitalize the first word and proper nouns; leave the rest lowercase). 6-12 words. Reports the week's biggest result or framing. No clever-with-period twist, no thesis, no oracle.`,
    ``,
    `GOOD HEADLINE PATTERNS:`,
    `   ✅ "Washington beats Oregon 43-36 to reshuffle the CFP picture"`,
    `   ✅ "Week 13: Washington upsets Oregon; Clemson, Notre Dame stay perfect"`,
    `   ✅ "${weekLabel} college football recap: top-five Oregon falls, Washington jumps to No. 2"`,
    `   ✅ "Five takeaways from ${weekLabel} in college football"`,
    ``,
    `FORBIDDEN HEADLINE PATTERNS:`,
    `   ✗ "The X did not Y in Week N so much as Z" (column thesis)`,
    `   ✗ "[Team]'s six-week chaos finally toppled a top-five team" (column-y)`,
    `   ✗ Any headline that argues a thesis instead of reporting a result.`,
    `   ✗ Any headline ending on a contradiction or twist.`,
    ``,
    `SUBHEADS — default to short FACTUAL NEWS LABELS. Use the section labels from "WHAT TO COVER" below (Top games, Around the Top 25, Around the country, Poll movement, etc.) or near-variants. NEVER rewrite section labels as column theses.`,
    ``,
    `GOOD SUBHEAD PATTERNS (short, declarative, label form):`,
    `   ✅ "Game of the week: Washington 43, Oregon 36"`,
    `   ✅ "Top 25 results"`,
    `   ✅ "Around the country"`,
    `   ✅ "Poll movement"`,
    `   ✅ "Big Ten reshuffle"   (a conference angle, factually framed)`,
    `   ✅ "Heisman watch"`,
    `   ✅ "What's next"`,
    ``,
    `FORBIDDEN SUBHEAD PATTERNS — these are column-mode and break the voice:`,
    `   ✗ "Washington Takes the Week, Oregon Pays for It" (clever-with-comma thesis)`,
    `   ✗ "The SEC Survives, but It Does Not Separate" (column thesis with comma+twist)`,
    `   ✗ "Clemson and Miami Keep Splitting the ACC Argument" (column theme)`,
    `   ✗ "The Top 25 Got Rearranged, Not Rebuilt" (clever twist)`,
    `   ✗ "Elsewhere, the Blowouts Said More Than the Close Games" (column theme)`,
    `   ✗ Anything with a verb + thesis structure`,
    `   ✗ Anything with a comma splitting two clauses into a contrast`,
    `   ✗ "The X that Y" / "How X Y" thesis subheads`,
    ``,
    `═══════════════════════════════════════════════════════════`,
    `MANDATORY SELF-CHECK BEFORE YOU SEND`,
    `═══════════════════════════════════════════════════════════`,
    `Re-read top to bottom. Honest answers. If any is no, REWRITE before sending.`,
    ``,
    `   1. LEDE: does it report the biggest result of the week in 1-2 sentences (who beat whom, score, what it changed)? Or does it argue a thesis / open with "did not X so much as Y" / open with abstract chaos / open with a clever oracle?`,
    `   2. HEADLINE: ESPN news-style — sentence case, 6-12 words, reports a result? Test: would this headline read at home on ESPN.com Sunday morning?`,
    `   3. SUBHEADS: each is a short FACTUAL LABEL (no verbs, no comma-twist contrast, no thesis)? If they sound like article-section titles in a column, rewrite as labels.`,
    `   4. Did I avoid the COLUMNIST PHRASES? ("did not X so much as Y", "the cleanest version of their case", "made the poll from outside it", "perfection and momentum are not always the same thing", "the difference was not just X — it was X in a way that Y", "makes it harder to argue [thing]", "[month] punishes teams that...", "the bracket drew itself", "stop leaking games", "[team]'s season died in [city]")`,
    `   5. Did I avoid the standard CLICHÉS? ("set the tone", "imposed their will", "found their rhythm", "made plays when it mattered", "dialed up", "got cooking", "sealed it", "shifted the momentum", "answered the call", "leaves no doubt", "made it look easy")`,
    `   6. BANNED VERBS — any of "rolled, drilled, flattened, crushed, edged, topped, hammered, handled, dropped" used more than twice?`,
    `   7. CLOSING: does the recap end on a FACT (top games next week, polls finalized, conference race standings) — NOT a column-y kicker about months personified, "perfection vs momentum", or "the bracket looking like an argument"?`,
    `   8. STREAK / MOMENTUM check: any "snapped a __-game losing streak" / "third straight" / "back-to-back" / "bouncing back" claim? If so, the data must explicitly support it.`,
    `   9. PRIOR-YEAR context: used at most 2-3 times across the entire recap, lands naturally, NOT in the lede?`,
    `  10. POLL MOVEMENT: characterized plainly, not dramatized into a "saga" / "collapse" / "freefall"?`,
    ``,
    `If any check fails, rewrite the offending paragraph before sending.`,
    ``,
    `If a shared nickname ("Tigers", "Bulldogs", "Wildcats", "Cardinals", "Cougars") refers to two different teams in the recap, disambiguate the second one (program name, city, or full team name).`,
    ``,
    FACTUAL_GUARDRAIL.trim(),
    ``,
    CONFERENCE_GUARDRAIL.trim(),
    ``,
    `═══════════════════════════════════════════════════════════`,
    `RANK USAGE — READ THIS CAREFULLY`,
    `═══════════════════════════════════════════════════════════`,
    `Every "#N TeamName" you see in a game line is the team's ENTERING rank — the rank they carried INTO that matchup. There is only one number per team per game, and it is always the matchup-framing (pre-game) rank.`,
    ``,
    `Example: "South Carolina Gamecocks 38, #6 Tennessee Volunteers 35" means Tennessee was #6 BEFORE the game (and lost). The #6 is NOT a post-game rank.`,
    ``,
    `Two distinct rank surfaces in the data block:`,
    ``,
    `  • GAME-LINE RANK (the "#N" next to a team in each game line) — the entering rank that team carried INTO that game. Use this when describing matchups and what each team WAS at kickoff.`,
    `  • TOP 25 EVOLUTION ROWS — labeled "Entering Week W". Each row is the snapshot of teams that entered that week ranked. Compare consecutive rows to characterize rank movement ("Tennessee held #2 from Week 9 through Week 11" / "South Carolina jumped from unranked into the Top 25").`,
    ``,
    `WRITING RULES:`,
    `- Describe matchups using the entering rank shown in the game line ("#6 Tennessee fell to South Carolina"). That number IS the entering rank already — no derivation needed.`,
    `- Describe rank movement by comparing consecutive Evolution rows ("Tennessee entered Week 11 ranked #2; the post-Week-11 poll has them at #6" — pull the post-Week-11 snapshot from the LATEST-AVAILABLE TOP 25 section labeled "POST-${weekLabel.toUpperCase()} TOP 25").`,
    `- When the latest snapshot is labeled "POST-${weekLabel.toUpperCase()} TOP 25", you may say "Team X is now #N" for the current poll.`,
    `- When the latest snapshot is labeled "MOST RECENT" (${weekLabel} data isn't available), describe the result and infer movement ("after the loss, Tennessee should fall in next week's poll") rather than asserting definitive post-${weekLabel} rankings.`,
    `- DO NOT invent a "post-game rank" for a team in a particular game from the game-line number. The game-line number is ENTERING rank only. The team's post-game rank for week W is the team's entering rank for week W+1, which lives in the next Evolution row (or the LATEST-AVAILABLE snapshot if W is the recap week).`,
    ``,
    `═══════════════════════════════════════════════════════════`,
    `ADAPT TO THE WEEK'S GAME VOLUME`,
    `═══════════════════════════════════════════════════════════`,
    `The recap's length and section count MUST match how many games the week actually had. Do not force the standard 5-section structure when the data can't fill it.`,
    ``,
    `• NORMAL WEEK (10+ games, multiple ranked teams played): use the full structure below — TOP GAMES, AROUND THE TOP 25, POLL MOVEMENT (when applicable), AROUND THE COUNTRY, optional extras. 500-800 words across 3-5 sections.`,
    ``,
    `• LIGHT WEEK (3-9 games, few or no ranked teams played): drop section labels for buckets with no content. If NO ranked teams played, SKIP "Around the Top 25" — do not fill it by re-describing the current standings as if they're news. If poll movement happened only in EARLIER weeks (not this week), SKIP "Poll movement" — old shifts are not this week's story. 300-500 words is plenty.`,
    ``,
    `• SINGLE-GAME WEEK (Army-Navy week, off-week / bye week, Week 0 in some calendars): write 2-4 short paragraphs about the one game that was played. State the result, the records that are now final, the context the data provides (rivalry name, both teams' season-arc framing, prior-year postseason if relevant), and stop. Do NOT pad with "the rest of the top 25 hasn't changed" or "here are last week's poll shifts" — those are not this week's story. The week IS the one game.`,
    ``,
    `NO REPEAT-MENTIONS BETWEEN SECTIONS. Each game appears in EXACTLY ONE section. If Army-Navy is the only game of the week, write it ONCE in TOP GAMES. Do NOT come back to it under AROUND THE COUNTRY — that's filler.`,
    ``,
    `NO META-COMMENTARY ABOUT THE DATA. Never write filler like "the only new on-field data point entering the postseason picture" or "the most recent Top 25 remained the baseline for the national race" — that's plumbing the user should not see. Either you have a fact to report or you don't.`,
    ``,
    `═══════════════════════════════════════════════════════════`,
    `WHAT TO COVER`,
    `═══════════════════════════════════════════════════════════`,
    ...(isBowlWeek ? [
      `This is a BOWL SEASON recap. Use the section structure below. Section labels are your H2 subheads — DO NOT rewrite them into clever theses. Skip any section whose data is empty.`,
      ``,
      `  1. ${cfpRoundLabel ? cfpRoundLabel.toUpperCase() : 'CFP GAMES'} — MANDATORY LEAD SECTION. Cover every CFP playoff game with full detail: result, both teams' records, key performers, what the win means (who advances, seeding implications, what round is next). This is the most important section of the recap. Do NOT bury CFP results inside a catch-all bowl section.`,
      `  2. BOWL RESULTS — the regular (non-CFP) bowl games. Group by notability: lead with ranked teams, upsets, or blowouts (≥21 pts). A single paragraph per notable cluster is fine. Do NOT spend equal words on every game — prioritize ranked matchups and surprises. CRITICAL: any conference label MUST come from the data line, not real-world memory.`,
      `  3. POLL MOVEMENT — if (and only if) the EVOLUTION section shows a clear trajectory across recent weeks. Plain-language characterization per RULE D — no "saga", no "collapse", no "freefall". Each slot 1-25 has exactly one team; never describe ties.`,
      ``,
      `Optional extras (only when warranted by the data):`,
      `  - HEISMAN WATCH — only if a player leads a major stat category by a noticeable margin. If nobody clears that bar, SKIP.`,
      `  - WHAT'S NEXT — only if the snapshot is labeled "POST-${weekLabel.toUpperCase()}" (not "MOST RECENT"). Skip otherwise. For bowl weeks, "what's next" means the next CFP round or bowl week, not a regular-season schedule.`,
    ] : [
      `Use these section labels as your H2 subheads (or near-variants — "Top games" / "Top games of the week" are both fine for #1; "Around the country" / "Across the country" both fine for #4). DO NOT rewrite them into clever-with-comma theses (see RULE E above). The labels ARE the section names. Skip any section whose data is empty per ADAPT TO THE WEEK above.`,
      ``,
      `  1. TOP GAMES — the biggest games of the week, including ranked-vs-ranked, top-10 losses, and any upset (ranked team falling to unranked). Lead with the loudest result. Group every consequential ranked game here so they're not split across multiple sections. When a featured team has notable prior-year context (top-10 finish, CFP appearance, defending champs) — visible in the PRIOR-YEAR CONTEXT section — weave it in ONCE per team if it lands naturally. When a featured game appears in LAST MEETINGS, name it as a rematch and use revenge / repeat-domination framing.`,
      `  2. AROUND THE TOP 25 — the rest of the ranked teams' results. Mostly a single paragraph that name-checks what each ranked team did. Where prior-year context tightens the story (a top-5 finisher now scuffling, an unranked finisher now ranked), USE IT — but sparingly per RULE C.`,
      `  3. POLL MOVEMENT — if (and only if) the EVOLUTION section shows a clear trajectory across recent weeks. Plain-language characterization per RULE D — no "saga", no "collapse", no "freefall". Each slot 1-25 has exactly one team; never describe ties.`,
      `  4. AROUND THE COUNTRY — selected unranked-vs-unranked storylines. Be selective: lopsided blowouts (≥30 pts), upsets, conference rivalries, one-score thrillers. Skip middle-of-the-road games. Rivalry rematches with revenge/streak data attached (LAST MEETINGS) are good candidates even if otherwise unremarkable. CRITICAL: any conference label you write in this section MUST be the conference shown in parens next to the team in that game's data line — NEVER pull a conference label from real-world memory. If a game says "Hawaii (Pac-12) 35, Boise State (Pac-12) 14", you write "Pac-12", NOT "Mountain West".`,
      ``,
      `Optional extras (only when warranted by the data, and using the literal label as a subhead):`,
      `  - HEISMAN WATCH — only if a player is leading a major stat category (passing/rushing/receiving yds, sacks) by a noticeable margin. If nobody clears that bar, SKIP.`,
      `  - CONFERENCE RACES — only if conference standings data is present.`,
      `  - WHAT'S NEXT — only if the snapshot is labeled "POST-${weekLabel.toUpperCase()}" (not "MOST RECENT"). Skip otherwise.`,
    ]),
    ``,
    `STRUCTURAL RULES:`,
    `- Each game appears in EXACTLY ONE section. If you mention Washington-Oregon in TOP GAMES, do not mention it again in AROUND THE TOP 25.`,
    `- Skip empty sections entirely. No hedging language ("the picture remains a watch list..."), no filler ("showed great heart"), no restating the same scoreline more than once.`,
    `- DO NOT explain data limitations to the reader. Never write things like "the latest snapshot is not the post-week poll" or "the next ranking isn't yet set" — that's plumbing the user shouldn't see. Just don't claim post-week rankings; describe what happened.`,
    `- Every sentence must add a fact from the data. If you can't, cut the sentence.`,
    `- The CLOSING sentence of the recap is a FACT, not a kicker. Do NOT end on column-y oracles ("November punishes teams that..." / "the bracket looks more like an argument than a list"). End on an actual fact: top games next week, polls finalized, conference race standings, or just stop after the last section's reporting.`,
    ``,
    ...namingRuleLines,
    OUTPUT_FORMAT.trim(),
    ``,
    `═══════════════════════════════════════════════════════════`,
    `DATA — every fact you may use`,
    `═══════════════════════════════════════════════════════════`,
    dataBlock,
  ].join('\n')
}

// ---------------------------------------------------------------------------
// 2) PRESEASON RECAP — week 0, looking forward.
// ---------------------------------------------------------------------------

export function buildPreseasonRecapPrompt(dynasty, year) {
  const yearNum = Number(year)
  const allGames = dynasty?.games || []

  // ----- Past three years' national headlines -----
  const seenYears = new Set()
  for (const g of allGames) {
    const y = Number(g?.year)
    if (Number.isFinite(y) && y < yearNum) seenYears.add(y)
  }
  const pastYears = [...seenYears].sort((a, b) => b - a).slice(0, 3)

  // ----- Final-poll top 25 from each prior year -----
  const finalPollLines = []
  for (const y of pastYears) {
    const finalMedia = dynasty?.finalPollsByYear?.[y]?.media
    if (Array.isArray(finalMedia) && finalMedia.length > 0) {
      finalPollLines.push(`-- ${y} final poll --`)
      for (const r of finalMedia) {
        finalPollLines.push(`#${r.rank} ${teamDisplay(r.tid, r.team, dynasty)}`)
      }
    }
  }

  // ----- Awards from past seasons (if saved) -----
  // Include team + position so the AI can ground awards in program
  // context. Without team, the name is decorative and the AI fills
  // the gap with fourth-wall commentary ("not enough data to know…").
  const recentAwardLines = []
  for (const y of pastYears) {
    const aw = dynasty?.awardsByYear?.[y] || {}
    const fmtAward = (entry, label) => {
      if (!entry) return null
      const name = entry.player || entry.name
      if (!name) return null
      const team = entry.tid != null
        ? teamDisplay(entry.tid, entry.team, dynasty)
        : entry.team || null
      const pos = entry.position || null
      const parts = [name, pos, team].filter(Boolean)
      return `${y} ${label}: ${parts.join(', ')}`
    }
    const h = fmtAward(aw.heisman, 'Heisman')
    if (h) recentAwardLines.push(h)
    const m = fmtAward(aw.maxwell, 'Maxwell')
    if (m) recentAwardLines.push(m)
    const o = fmtAward(aw.daveyObrien, "Davey O'Brien")
    if (o) recentAwardLines.push(o)
  }

  // ----- National-trend lines: which programs were consistently top-tier? -----
  // Counts how often each team finished in the prior years' top 5/top 10.
  const top5Tally = {}
  const top10Tally = {}
  for (const y of pastYears) {
    const finalMedia = dynasty?.finalPollsByYear?.[y]?.media
    if (!Array.isArray(finalMedia)) continue
    for (const r of finalMedia) {
      const name = teamDisplay(r.tid, r.team, dynasty)
      if (r.rank <= 5) top5Tally[name] = (top5Tally[name] || 0) + 1
      if (r.rank <= 10) top10Tally[name] = (top10Tally[name] || 0) + 1
    }
  }
  const repeatTop5 = Object.entries(top5Tally)
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1])
    .map(([name, n]) => `${name} — ${n}× top-5 finish`)
  const repeatTop10 = Object.entries(top10Tally)
    .filter(([, n]) => n >= 2 && !top5Tally[Object.keys(top5Tally).find(k => k === Object.keys(top10Tally)[0])])
    .sort((a, b) => b[1] - a[1])
    .map(([name, n]) => `${name} — ${n}× top-10 finish`)

  // ----- Saved preseason rankings for the upcoming year, if any -----
  const presPolls = dynasty?.preseasonRankingsByYear?.[yearNum]
    || dynasty?.finalPollsByYear?.[yearNum]?.preseason
    || null
  const preseasonTop25Lines = []
  if (Array.isArray(presPolls) && presPolls.length > 0) {
    for (const r of presPolls) {
      preseasonTop25Lines.push(`#${r.rank} ${teamDisplay(r.tid, r.team, dynasty)}`)
    }
  }

  const sections = []
  sections.push(`SEASON ABOUT TO START`)
  sections.push(`Year: ${yearNum}`)
  if (pastYears.length > 0) {
    sections.push(`Prior seasons in this dynasty: ${pastYears.join(', ')}`)
  } else {
    sections.push(`First season of this dynasty (no prior data).`)
  }
  sections.push('')

  if (preseasonTop25Lines.length > 0) {
    sections.push(`PRESEASON TOP 25 — ${yearNum}`)
    for (const line of preseasonTop25Lines) sections.push(line)
    sections.push('')
  } else {
    sections.push(`PRESEASON TOP 25 — ${yearNum}`)
    sections.push(`(no preseason poll has been entered for ${yearNum} yet — do not invent one)`)
    sections.push('')
  }

  if (finalPollLines.length > 0) {
    sections.push(`PRIOR-SEASON FINAL POLLS`)
    for (const line of finalPollLines) sections.push(line)
    sections.push('')
  }

  if (repeatTop5.length > 0 || repeatTop10.length > 0) {
    sections.push(`PROGRAMS WITH RECENT TOP-FINISH HISTORY`)
    for (const line of repeatTop5) sections.push(line)
    for (const line of repeatTop10) sections.push(line)
    sections.push('')
  }

  if (recentAwardLines.length > 0) {
    sections.push(`RECENT INDIVIDUAL AWARDS`)
    for (const line of recentAwardLines) sections.push(line)
    sections.push('')
  }

  // Dynasty-specific conference alignment for the upcoming season —
  // referenced by CONFERENCE_GUARDRAIL above.
  const alignmentBlock = conferenceAlignmentBlock(dynasty, yearNum)
  if (alignmentBlock) {
    sections.push(`CONFERENCE ALIGNMENT (${yearNum}) — THIS OVERRIDES YOUR REAL-WORLD KNOWLEDGE`)
    sections.push(`(Use these conference assignments verbatim. Do not assign any team to a conference based on real life — only what's listed below counts.)`)
    sections.push(alignmentBlock)
    sections.push('')
  }

  const dataBlock = sections.join('\n')

  return [
    `You are writing a ${yearNum} College Football season preview.`,
    ``,
    `This is a NATIONAL preview covering the entire FBS landscape — every storyline a fan should know heading into the season. Treat all teams equally. Do NOT center the narrative on any single program. The reader is a college football fan who wants the season's whole picture.`,
    ``,
    `Tone: a season-preview column from a major outlet — confident, scene-setting, but tightly bounded by the data below.`,
    ``,
    FACTUAL_GUARDRAIL.trim(),
    ``,
    CONFERENCE_GUARDRAIL.trim(),
    ``,
    `═══════════════════════════════════════════════════════════`,
    `PROSE DISCIPLINE — keep this short list in mind while drafting`,
    `═══════════════════════════════════════════════════════════`,
    `The preview is short and the AI tells are easy to slip into. Hold these limits:`,
    ``,
    `• Em-dashes: max 5 in the whole preview. AI defaults to em-dashes for every secondary clause; real writers vary punctuation.`,
    `• Sentence rhythm: within every paragraph, at least one sentence ≤ 8 words AND at least one sentence ≥ 25 words. The 15-25 word band is AI's metronome.`,
    `• Banned verbs (max twice each): rolled, drilled, flattened, crushed, edged, topped, hammered, handled. Vary by what the data shows.`,
    `• Banned phrases (do NOT write or close-paraphrase):`,
    `    ✗ "the storylines write themselves"`,
    `    ✗ "all eyes are on..." / "everyone is watching..."`,
    `    ✗ "it has all the makings of..."`,
    `    ✗ "buckle up" / "strap in"`,
    `    ✗ "the conversation around X"`,
    `    ✗ "make some noise" / "turn heads"`,
    `    ✗ "X is for real" / "X is back"`,
    `    ✗ "the team to beat" (unless data explicitly supports that framing)`,
    `• NO FOURTH-WALL COMMENTARY. You are a sports journalist writing a published column — not an AI summarizing a data file. Never acknowledge what data you do or don't have. Banned constructions: "there is not enough here to know…", "this snapshot shows…", "the data doesn't tell us…", "we can't know yet…", "it remains to be seen…", "that question is unanswered entering the season". If you don't have enough information to write a section with real facts, skip the section entirely and silently. A missing section is invisible to the reader. A fourth-wall comment ruins the piece.`,
    `• Stats do work: every number you cite must connect to a take in the same sentence or the next. Decorative numbers ("Team X had three top-10 finishes") need a "why it matters" clause or get cut.`,
    `• Voiced uncertainty: pick one place in the preview where the data leaves a question contested and let the writing acknowledge it. AI's wall-to-wall confidence is what makes a column read as generated; hedging once makes the confident takes feel earned.`,
    `• Lede: argue something. Not "the season is here" / "kickoff is around the corner". Pick the season's central tension and lead with that.`,
    ``,
    `═══════════════════════════════════════════════════════════`,
    `WHAT TO COVER (suggested order — adapt based on what's in the data)`,
    `═══════════════════════════════════════════════════════════`,
    `1. The preseason Top 25 — who's at the top, who's notable for being there.`,
    `2. Prior-season storylines — what happened last year that matters going into this one (champions, near-misses, late surges, drop-offs).`,
    `3. Programs with recurring top finishes — which teams have built sustained excellence over the last 2-3 dynasty years.`,
    `4. Recent award winners — only if the RECENT INDIVIDUAL AWARDS block includes team and position for the winners. If those fields are missing, skip this section entirely. Do not write a vague paragraph about award winners without knowing their team.`,
    `5. Conferences to watch — only if the standings/poll data clearly suggests a competitive race.`,
    ``,
    `If the data block is sparse (early dynasty, no prior history), keep the preview SHORT. Three or four paragraphs is plenty.`,
    `If a section's data block is empty, skip it entirely. Do not write filler.`,
    ``,
    OUTPUT_FORMAT.trim(),
    ``,
    `═══════════════════════════════════════════════════════════`,
    `DATA — every fact you may use`,
    `═══════════════════════════════════════════════════════════`,
    dataBlock,
  ].join('\n')
}

// ---------------------------------------------------------------------------
// 3) PRESEASON TOP 25 ENTRY — the user wants help generating a Top 25 from
//    the data their dynasty has accumulated. AI returns a TSV-style list.
// ---------------------------------------------------------------------------

export function buildPreseasonTop25Prompt(dynasty, year) {
  const yearNum = Number(year)
  const allGames = dynasty?.games || []
  const seenYears = new Set()
  for (const g of allGames) {
    const y = Number(g?.year)
    if (Number.isFinite(y) && y < yearNum) seenYears.add(y)
  }
  const pastYears = [...seenYears].sort((a, b) => b - a).slice(0, 3)

  // Final-poll snapshots from prior seasons inform a defensible preseason Top 25.
  const histLines = []
  for (const y of pastYears) {
    const finalMedia = dynasty?.finalPollsByYear?.[y]?.media
    if (Array.isArray(finalMedia) && finalMedia.length > 0) {
      histLines.push(`-- ${y} final poll --`)
      for (const r of finalMedia) {
        histLines.push(`#${r.rank} ${teamDisplay(r.tid, r.team, dynasty)}`)
      }
    }
  }

  // Past awards / Heisman winners are signal too.
  const awardLines = []
  for (const y of pastYears) {
    const aw = dynasty?.awardsByYear?.[y] || {}
    if (aw.heisman?.player || aw.heisman?.name) awardLines.push(`${y} Heisman: ${aw.heisman.player || aw.heisman.name}`)
  }

  const alignmentBlock = conferenceAlignmentBlock(dynasty, yearNum)

  const dataBlock = [
    `Year about to start: ${yearNum}`,
    ``,
    histLines.length > 0 ? `RECENT FINAL POLLS:\n${histLines.join('\n')}` : `(no prior final-poll data has been saved in this dynasty)`,
    ``,
    awardLines.length > 0 ? `RECENT AWARDS:\n${awardLines.join('\n')}` : ``,
    ``,
    alignmentBlock ? `CONFERENCE ALIGNMENT (${yearNum}) — THIS OVERRIDES YOUR REAL-WORLD KNOWLEDGE:\n${alignmentBlock}` : ``,
  ].filter(Boolean).join('\n')

  // Build an abbr → display-name list for THIS dynasty so the AI uses
  // the user's actual team naming (FCS placeholders, teambuilder
  // takeovers, custom teams) — not real-world abbreviations.
  const teamAbbrLines = []
  if (dynasty?.teams && typeof dynasty.teams === 'object') {
    const entries = Object.values(dynasty.teams)
      .filter(t => t && t.abbr && t.name)
      .map(t => ({ abbr: String(t.abbr).toUpperCase(), name: t.name }))
    entries.sort((a, b) => a.abbr.localeCompare(b.abbr))
    for (const { abbr, name } of entries) teamAbbrLines.push(`${abbr} = ${name}`)
  }

  return [
    `You are helping a CFB dynasty mode user populate the ${yearNum} Preseason Top 25.`,
    ``,
    `═══════════════════════════════════════════════════════════`,
    `MODE A — SCREENSHOT TRANSCRIPTION (preferred when the user attaches an image)`,
    `═══════════════════════════════════════════════════════════`,
    `If the user has attached a screenshot of EA CFB's Preseason Top 25 page (the in-game poll, the Pre-Season Top 25 standings page, or a media outlet's poll), TRANSCRIBE it into the output format below. Treat the screenshot as the source of truth and ignore your own opinions about who "should" be ranked. Read the rank order verbatim. If the screenshot shows fewer than 25 teams, pad the missing slots as blank lines (just the rank, no team) — do NOT invent teams to fill the bottom of the poll.`,
    ``,
    `If multiple screenshots are attached (e.g. the user split the page into two images), stitch them together in rank order — duplicates between screenshots are confirmation, not separate ranks.`,
    ``,
    `═══════════════════════════════════════════════════════════`,
    `MODE B — INFER FROM DYNASTY HISTORY (when no screenshot is attached)`,
    `═══════════════════════════════════════════════════════════`,
    `Build a defensible Top 25 from the prior-season data block at the bottom of this prompt. Anchor your picks in the dynasty's actual history — recent final polls, Heisman winners, conference alignment. If the dynasty has no prior history saved (first season or fresh dynasty), default to a reasonable real-world preseason consensus and surface a single line at the very top prefixed exactly "PRE-NOTE: …" explaining the assumption. The user will read and delete the PRE-NOTE before pasting.`,
    ``,
    `═══════════════════════════════════════════════════════════`,
    `OUTPUT FORMAT — read carefully, the user pastes this directly into a Google Sheet`,
    `═══════════════════════════════════════════════════════════`,
    `Output EXACTLY 25 lines. Each line is ONE team abbreviation in UPPERCASE. Lines are in rank order — line 1 is #1, line 2 is #2, ..., line 25 is #25.`,
    ``,
    `   Example (made-up values, not your output):`,
    `       BAMA`,
    `       UGA`,
    `       OSU`,
    `       ...`,
    ``,
    `STRICT RULES:`,
    `   1. ONE team abbreviation per line. No rank numbers, no full names, no mascots, no city names, no "Tied with…" notes.`,
    `   2. Abbreviations MUST come from the TEAM ABBREVIATIONS list at the bottom of this prompt — these are the only abbrs the user's strict-dropdown sheet will accept. Anything else is rejected on paste.`,
    `   3. EXACTLY 25 lines (or 24 lines + 1 blank line, etc., if the screenshot only had partial data — leave the missing slot blank, don't pad with a guess).`,
    `   4. No header row, no commentary, no closing remarks. The user pastes your output starting at cell B2 of the sheet (or copies into the tracker's row form). Anything other than 25 lines of team abbreviations breaks both flows.`,
    `   5. Wrap your output in a single \`\`\`tsv ... \`\`\` fenced block so the user can copy-paste cleanly without selecting any prose.`,
    ``,
    `If you generated a PRE-NOTE (Mode B only, no prior data), put it on a single line ABOVE the fenced block — never inside it.`,
    ``,
    FACTUAL_GUARDRAIL.trim(),
    ``,
    CONFERENCE_GUARDRAIL.trim(),
    ``,
    `═══════════════════════════════════════════════════════════`,
    `TEAM ABBREVIATIONS (every team your output must use one of)`,
    `═══════════════════════════════════════════════════════════`,
    `These are the ONLY valid values for the strict-dropdown sheet. Includes every team in this dynasty — FBS, FCS placeholders, and any custom / teambuilder teams. If a screenshot shows a team not on this list, omit that line (leave blank) rather than substituting a similar-name team.`,
    teamAbbrLines.length > 0 ? teamAbbrLines.join('\n') : '(no team abbreviations available — dynasty teams data is empty)',
    ``,
    `═══════════════════════════════════════════════════════════`,
    `DATA — prior-season context (for Mode B, ignored in Mode A)`,
    `═══════════════════════════════════════════════════════════`,
    dataBlock,
  ].join('\n')
}
