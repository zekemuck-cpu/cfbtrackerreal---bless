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
import { getTeamRankForWeek } from '../context/DynastyContext'
import {
  getPriorYearPostseason,
  getTeamFinalRank,
  getHeadToHeadHistory,
  getCoachContext,
  getIncomingClassRank,
  getQualityWinsAndBadLosses,
  getRivalryName,
  getSeasonPOWTrail,
  getTeamEnteringRank,
  getGameOrder,
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

function recordFromGames(games, year, tid) {
  let w = 0, l = 0
  for (const g of (games || [])) {
    if (Number(g?.year) !== Number(year)) continue
    const persp = userPerspective(g, tid)
    if (!persp || persp.won == null) continue
    if (persp.won) w++; else l++
  }
  return { wins: w, losses: l }
}

// Format one game line. Each team's rank appears as "[entering → post-game]"
// where entering = rank carried INTO the matchup (looked up from the
// team's prior game's stored rank — EA's stored rank is post-game) and
// post-game = the rank stored on this game (the AFTER rank EA shows on
// the schedule). Showing both lets the AI write "the #4 team faced
// the #11 team" (entering) and "Tennessee fell to #15" (post-game)
// without confusing the two.
function fmtGameLine(game, dynasty, ranks) {
  const t1 = teamDisplay(game.team1Tid, game.team1, dynasty)
  const t2 = teamDisplay(game.team2Tid, game.team2, dynasty)
  const s1 = game.team1Score, s2 = game.team2Score
  // ranks: { team1Entering, team1Post, team2Entering, team2Post } —
  // computed by the caller from dynasty.teams[tid].byYear[year].rankByWeek
  // for both [gameWeek] (entering) and [gameWeek+1] (post-game).
  // Legacy fallback to game.team1Rank / game.team2Rank covers
  // dynasties where rankByWeek hasn't been populated for the
  // post-game slot yet.
  const e1 = ranks?.team1Entering ?? null
  const e2 = ranks?.team2Entering ?? null
  const p1 = ranks?.team1Post ?? (typeof game.team1Rank === 'number' ? game.team1Rank : null)
  const p2 = ranks?.team2Post ?? (typeof game.team2Rank === 'number' ? game.team2Rank : null)
  const fmtRank = (entering, post) => {
    if (entering == null && post == null) return ''
    if (entering != null && post != null && entering === post) return `[#${entering}] `
    const ent = entering != null ? `#${entering}` : 'UR'
    const pst = post != null ? `#${post}` : 'UR'
    return `[${ent}→${pst}] `
  }
  const r1 = fmtRank(e1, p1)
  const r2 = fmtRank(e2, p2)
  const home = game.homeTeamTid == null
    ? 'neutral site'
    : Number(game.homeTeamTid) === Number(game.team1Tid)
      ? `at ${t1}`
      : `at ${t2}`
  const ot = game.ot ? ' (OT)' : ''
  if (s1 == null || s2 == null) {
    return `${r1}${t1} vs ${r2}${t2}${ot} — score not entered (${home})`
  }
  return `${r1}${t1} ${s1}, ${r2}${t2} ${s2}${ot} (${home})`
}

// ---------------------------------------------------------------------------
// Conference alignment for a given year. Dynasty users frequently realign
// teams (FSU/Miami/Clemson moving to the SEC, custom conferences, etc.),
// so we MUST hand the AI the dynasty's actual alignment and forbid it from
// falling back on real-world knowledge — otherwise the recap will say
// "ACC's Florida State" when the user has FSU in the SEC.
//
// Lookup order MUST mirror DynastyContext.getCustomConferencesForYear,
// which is what every other consumer (Conference Standings, geminiService)
// uses. The shape is:
//   1. dynasty.customConferencesByYear[year]  (per-year bulk realignment)
//   2. nearest earlier year in customConferencesByYear (carried forward)
//   3. dynasty.customConferences              (legacy single-snapshot)
//   4. static DEFAULT_CONFERENCES             (real-world current alignment)
// then overlay single-team overrides from:
//   - dynasty.teams[tid].byYear[year].conference  (canonical)
//   - dynasty.conferenceByTeamYear[abbr][year]    (legacy)
//
// Inlined here (rather than imported from DynastyContext) because the prompt
// utility deliberately has no React/context dependency.
// ---------------------------------------------------------------------------

function getConferenceAlignmentForYear(dynasty, year) {
  if (!dynasty) return DEFAULT_CONFERENCES
  const yearNum = Number(year)
  if (!Number.isFinite(yearNum)) return DEFAULT_CONFERENCES

  // Step 1-3: pick a base map.
  let baseMap = null
  const byYear = dynasty.customConferencesByYear?.[yearNum]
    || dynasty.customConferencesByYear?.[String(yearNum)]
  if (byYear && typeof byYear === 'object' && Object.keys(byYear).length > 0) {
    baseMap = byYear
  } else if (dynasty.customConferencesByYear && typeof dynasty.customConferencesByYear === 'object') {
    const startYear = Number(dynasty.startYear) || 2024
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

  // Collect per-team overrides (single-team modal edits, e.g. moving
  // Notre Dame to the Big Ten). These MUST win over the bulk snapshot,
  // otherwise the prompt would still show ND as Independent.
  const overrides = new Map() // abbr UPPERCASE → conferenceName
  for (const team of Object.values(dynasty.teams || {})) {
    const yd = team?.byYear?.[yearNum] || team?.byYear?.[String(yearNum)]
    const conf = yd?.conference
    const abbr = team?.abbr
    if (conf && abbr) overrides.set(abbr.toUpperCase(), conf)
  }
  const legacy = dynasty.conferenceByTeamYear || {}
  for (const [abbr, byYearMap] of Object.entries(legacy)) {
    if (!abbr || !byYearMap || typeof byYearMap !== 'object') continue
    const conf = byYearMap[yearNum] ?? byYearMap[String(yearNum)]
    if (conf) overrides.set(abbr.toUpperCase(), conf)
  }

  // Deep clone so we don't mutate stored data.
  const result = {}
  for (const [conf, teams] of Object.entries(sourceMap)) {
    result[conf] = Array.isArray(teams) ? [...teams] : []
  }
  if (overrides.size > 0) {
    for (const [abbr, newConf] of overrides) {
      for (const list of Object.values(result)) {
        const idx = list.findIndex(t => (t || '').toUpperCase() === abbr)
        if (idx !== -1) list.splice(idx, 1)
      }
      if (!Array.isArray(result[newConf])) result[newConf] = []
      if (!result[newConf].some(t => (t || '').toUpperCase() === abbr)) {
        result[newConf].push(abbr)
      }
    }
  }
  return result
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
THIS IS THE MOST COMMON MISTAKE. READ TWICE.

Conferences in this dynasty ARE NOT the same as real life. The user can move any team into any conference at any time. Examples of valid dynasty alignments:
- Florida State, Miami, and Clemson in the SEC (not the ACC)
- Texas in the Big 12 (not the SEC)
- USC in the Pac-12 (not the Big Ten)
- Alabama in the Pac-12
- A custom conference with no real-world counterpart

The CONFERENCE ALIGNMENT block in the data below is the ONLY source of truth for which team is in which conference. Before you write the conference name next to ANY team, look it up in that block. Do not skip this step.

Hard rules:
- Look up every team's conference in the alignment block. Use what you find there. PERIOD.
- Do NOT use real-world knowledge to assign a conference to any team. Your prior training about who's in the SEC / ACC / Big Ten / etc. is WRONG for this dynasty.
- If a team is not listed in the alignment block, refer to it WITHOUT a conference label. Do not guess.
- Do not reference real-world conference history ("the former Big 12 program", "the Pac-12's last stand", "joined the SEC last year"). The dynasty has its own history.
- "Conference races" sections must be built from the alignment block, not from memory of real-world divisional structure.

Self-check before you submit: pick three teams you mentioned in the recap and verify each one's conference matches what the CONFERENCE ALIGNMENT block says. If any don't match, fix them.
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
  const games = (dynasty?.games || []).filter(g => g && Number(g.year) === yearNum)
  const weekGames = games.filter(g => Number(g.week) === weekNum)

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

  // ----- Section: Weekly post-week-rank snapshots -----
  // The team1Rank/team2Rank fields on a game record are the ranks teams
  // hold AFTER playing that game (EA's schedule UI shows post-game
  // ranks; storing what the user sees gives us post-game). So a snapshot
  // built from games where week == W tells us the post-Week-W poll
  // (= the poll teams enter Week W+1 with).
  //
  // To get the "poll entering Week W" snapshot, we read week W-1 games
  // (their stored ranks are post-Week-W-1 = entering Week W).
  //
  // For the recap of Week N just finished, the most useful "current" poll
  // is the post-Week N poll — observable directly from Week N games'
  // stored ranks. We retain the buildSnapshot helper here for both
  // entering-week and post-week reads.
  //
  // The two-pass fill (matches Rankings.jsx) guarantees each rank slot
  // 1-25 belongs to exactly one team — no fake ties from teams sharing a
  // slot across different weeks.
  const isRankedRow = (n) => isRanked(n)
  // "Poll AFTER week W" — observations come from week W games (whose
  // stored ranks are post-game / post-week ranks for those teams).
  // For older teams that didn't play this week, we fall back to their
  // most recent prior post-game rank.
  const buildSnapshotPostWeek = (postWeek) => {
    const weekBuckets = new Map()
    const observe = (wk, rank, tid, abbr) => {
      if (!isRankedRow(rank)) return
      if (!weekBuckets.has(wk)) weekBuckets.set(wk, new Map())
      const bucket = weekBuckets.get(wk)
      if (bucket.has(rank)) return
      bucket.set(rank, { tid: tid != null ? Number(tid) : null, abbr: abbr || null })
    }
    for (const g of games) {
      const gw = Number(g.week)
      if (!Number.isFinite(gw) || gw > postWeek) continue
      observe(gw, g.team1Rank, g.team1Tid, g.team1)
      observe(gw, g.team2Rank, g.team2Tid, g.team2)
    }
    if (weekBuckets.size === 0) return { rows: [], latestWeek: null }
    const sortedWeeks = [...weekBuckets.keys()].sort((a, b) => b - a)
    const teamNewestRank = new Map()
    const teamKeyOf = (tid, abbr) => tid != null ? `tid:${tid}` : `abbr:${abbr || ''}`
    for (const wk of sortedWeeks) {
      const bucket = weekBuckets.get(wk)
      for (const [rank, info] of bucket.entries()) {
        const key = teamKeyOf(info.tid, info.abbr)
        if (!key) continue
        if (!teamNewestRank.has(key)) teamNewestRank.set(key, { rank, tid: info.tid, abbr: info.abbr })
      }
    }
    const slotMap = new Map()
    for (const wk of sortedWeeks) {
      const bucket = weekBuckets.get(wk)
      for (const [rank, info] of bucket.entries()) {
        if (slotMap.has(rank)) continue
        const key = teamKeyOf(info.tid, info.abbr)
        const newest = teamNewestRank.get(key)
        if (!newest || newest.rank !== rank) continue
        slotMap.set(rank, {
          rank,
          tid: info.tid,
          name: teamDisplay(info.tid, info.abbr, dynasty),
        })
      }
      if (slotMap.size === 25) break
    }
    return {
      rows: [...slotMap.values()].sort((a, b) => a.rank - b.rank),
      latestWeek: sortedWeeks[0] ?? null,
    }
  }

  // Weekly evolution: for each week W from 0..weekNum-1, the poll teams
  // FINISHED week W with (= the poll teams ENTERED week W+1 with).
  // We label the row by what teams ENTERED with so the AI can read it
  // as a chronological progression. Each row labeled "Entering Week
  // W+1" is built from week W stored ranks (which are post-week W).
  const top25ByWeek = []
  for (let w = 0; w <= weekNum; w++) {
    // postWeek=w means "the poll AFTER week w" = "the poll entering
    // week w+1." We display labeled by entering-week.
    const snap = buildSnapshotPostWeek(w)
    if (snap.rows.length > 0) top25ByWeek.push({ week: w + 1, rows: snap.rows })
  }

  // Latest derivable poll — the post-Week N poll, observable directly
  // from Week N games' stored ranks (storage convention is post-game).
  // If Week N has no entered games yet, we fall back to the most
  // recent prior week with data and note the staleness.
  const peekSnapshot = buildSnapshotPostWeek(weekNum)
  const hasFreshPostWeekPoll = peekSnapshot.latestWeek === weekNum
  const rankSnapshot = peekSnapshot.rows
  const rankSnapshotLabel = hasFreshPostWeekPoll
    ? `POST-WEEK ${weekNum} TOP 25 (the rankings AFTER Week ${weekNum} games — built directly from each team's stored post-game rank in Week ${weekNum})`
    : `MOST RECENT TOP 25 SNAPSHOT (post-Week ${peekSnapshot.latestWeek ?? Math.max(0, weekNum - 1)} — Week ${weekNum} stored ranks were not all available yet, so the post-Week ${weekNum} poll is not directly observable. Use this as a baseline and infer movement from this week's results.)`

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
    // CURRENT-SEASON RECORD — every team gets this line.
    const rec = recordFromGames(games, yearNum, t.tid)
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
    const rec = recordFromGames(games, yearNum, r.tid)
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
  sections.push(`Week being recapped: ${weekNum}`)
  sections.push('')

  // Precompute entering ranks for every weekGame. Stored team1Rank /
  // team2Rank are POST-game ranks (EA's schedule UI shows the rank
  // each team holds AFTER playing). The entering rank — the rank
  // each team CARRIED INTO this game — is the team's rank from its
  // most recent prior game (whose stored rank is post-game from THAT
  // game = entering rank for the next one). Computed once here so
  // fmtGameLine can render "[entering→post]" cleanly.
  const enteringRanksByGame = new Map()
  const ranksFor = (g) => {
    const order = getGameOrder(g)
    // Entering rank = team's rank at week == order. Post-game rank =
    // team's rank at week == order+1 (= entering next week). Both
    // come from dynasty.teams[tid].byYear[year].rankByWeek now that
    // the migration populates it. getTeamEnteringRank pulls from
    // rankByWeek with a legacy fallback for unmigrated dynasties.
    const t1Tid = g.team1Tid
    const t2Tid = g.team2Tid
    return {
      team1Entering: getTeamEnteringRank(allDynastyGames, g.team1, yearNum, order, dynasty),
      team2Entering: getTeamEnteringRank(allDynastyGames, g.team2, yearNum, order, dynasty),
      team1Post: t1Tid != null
        ? (getTeamRankForWeek(dynasty, t1Tid, yearNum, order + 1) ?? (typeof g.team1Rank === 'number' ? g.team1Rank : null))
        : (typeof g.team1Rank === 'number' ? g.team1Rank : null),
      team2Post: t2Tid != null
        ? (getTeamRankForWeek(dynasty, t2Tid, yearNum, order + 1) ?? (typeof g.team2Rank === 'number' ? g.team2Rank : null))
        : (typeof g.team2Rank === 'number' ? g.team2Rank : null),
    }
  }
  for (const g of weekGames) {
    enteringRanksByGame.set(g, ranksFor(g))
  }

  // RANK SEMANTICS — emit a single explainer once at the top of the
  // ranked-game sections. EA's quirk is the #1 source of confusion in
  // historical recaps so we name it explicitly.
  const rankSemanticsBlurb = `Rank notation: "[#X→#Y] Team" means the team CARRIED #X into this game and FINISHED at #Y after the game. EA's schedule UI shows only the post-game rank (the #Y), so the entering rank (#X) is derived from each team's previous game's stored rank — which IS that team's post-game rank from last week, i.e. the rank they entered THIS week with. Use [entering] to describe the matchup itself ("the #X team faced the #Z team"). Use [post-game] to describe rank movement after the result ("Tennessee fell to #15 after the loss"). [UR] = unranked.`

  // Headline games — top 25 vs top 25
  if (top25vTop25.length > 0) {
    sections.push(`HEADLINE GAMES — RANKED vs RANKED (Week ${weekNum})`)
    sections.push(rankSemanticsBlurb)
    for (const g of top25vTop25) sections.push(fmtGameLine(g, dynasty, enteringRanksByGame.get(g)))
    sections.push('')
  }

  // Top-25 results vs unranked teams
  if (top25vUnranked.length > 0) {
    sections.push(`TOP-25 vs UNRANKED RESULTS (Week ${weekNum})`)
    for (const g of top25vUnranked) sections.push(fmtGameLine(g, dynasty, enteringRanksByGame.get(g)))
    sections.push('')
  }

  // Other FBS games — unranked-vs-unranked. The two ranked sections
  // above already cover every game involving a top-25 team, so this
  // bucket has no overlap with them.
  if (everyGameLine.length > 0) {
    sections.push(`OTHER FBS GAMES — UNRANKED MATCHUPS (Week ${weekNum})`)
    for (const g of everyGameLine) sections.push(fmtGameLine(g, dynasty, enteringRanksByGame.get(g)))
    sections.push('')
  }

  // Stat lines from this week's box scores (top 2 per category per side)
  if (weekBoxLeaders.length > 0) {
    sections.push(`STAT LINES FROM WEEK ${weekNum} BOX SCORES`)
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
    if (h.lane.startsWith('passing')) line = `${h.name} (${h.team}) — passing leader: ${h.passYds} yds, ${h.passTD || 0} TD, ${h.passInt || 0} INT`
    else if (h.lane.startsWith('rushing')) line = `${h.name} (${h.team}) — rushing leader: ${h.rushYds} yds, ${h.rushTD || 0} TD`
    else line = `${h.name} (${h.team}) — receiving leader: ${h.recYds} yds, ${h.recTD || 0} TD`
    if (h.lane.includes('chasing')) line += ' [chasing the leader]'
    heismanWatchLines.push(line)
  }

  if (seasonStatBlocks.length > 0) {
    sections.push(`CUMULATIVE SEASON STAT LEADERS (through Week ${weekNum}, derived from box scores we have)`)
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
    `You are writing a Week ${weekNum} College Football recap for the ${yearNum} season.`,
    ``,
    `This is a NATIONAL recap covering the entire FBS landscape — every notable game, every storyline, every standout performance the data shows. Treat all teams equally. Do NOT center the narrative on any single program. The reader is a college football fan who wants the week's whole picture.`,
    ``,
    `═══════════════════════════════════════════════════════════`,
    `VOICE & WRITING QUALITY — DO NOT SKIP, THESE ARE THE BAR`,
    `═══════════════════════════════════════════════════════════`,
    `Write like Stewart Mandel, Andy Staples, Pat Forde, or Heather Dinich at The Athletic / Yahoo Sports — confident, opinionated, willing to advance theses, conversational without being sloppy. NOT AP wire copy. NOT a list of scores stitched with verbs. Top reporters argue something. So do you.`,
    ``,
    `THESIS-DRIVEN, NOT EVENT-DRIVEN. The recap is an argument, not a report. Pick the week's central story FIRST, then organize every section to support, complicate, or extend it. If the week's central story is "the SEC is in free-fall," every section should orbit that thesis: Tennessee's collapse is the headline, the SEC's other Top-25 results either confirm or challenge it, the rest of the league benefits in the playoff picture, etc.`,
    ``,
    `═══════════════════════════════════════════════════════════`,
    `RULE A — THE LEDE MUST ARGUE SOMETHING`,
    `═══════════════════════════════════════════════════════════`,
    `Your first sentence is a CLAIM about the week, not a description of the loudest score.`,
    ``,
    `❌ ANTI-PATTERN (forbidden, this is what AP wire writes):`,
    `   "The week's loudest result came in the SEC, where unranked South Carolina stunned #15 Tennessee 38-35."`,
    `   "Saturday saw a slate of top-25 blowouts and one major upset."`,
    `   "Week 11 produced fireworks across the country."`,
    ``,
    `✅ PRO-PATTERN (this is what The Athletic writes):`,
    `   "The SEC's six-week chaos finally toppled a top-five team — and the College Football Playoff committee just inherited the headache."`,
    `   "Tennessee's title hopes died in Columbia, but the obituary started writing itself a month ago."`,
    `   "Clemson's #1 ranking is starting to look like a clerical error."`,
    `   "Three top-five teams flirted with disaster Saturday. Only one of them paid the bill."`,
    `   "If you've watched the SEC for the last 42 days, you know how Tennessee's loss to South Carolina ended before it started."`,
    ``,
    `Notice what these openings have in common: they advance a CLAIM, name the week's tension, and force the reader forward. The anti-patterns just announce that football was played. NEVER open with "The week's loudest result..." or any variant of "the biggest news / the loudest game / the headline result."`,
    ``,
    `═══════════════════════════════════════════════════════════`,
    `RULE B — NO SCORE-DUMP CONSTRUCTION. ONE DETAIL PER TEAM, MINIMUM.`,
    `═══════════════════════════════════════════════════════════`,
    `Score-dump = stitching three or more game results in a row with nothing but team names + verbs + scores. This is the most common AI failure mode in sports recaps and it makes the writing feel like a CSV with adverbs.`,
    ``,
    `❌ ANTI-PATTERN (six blowouts in a row, no analysis, no detail):`,
    `   "#3 Notre Dame flattened North Carolina 55-10. #5 Oregon rolled into Bloomington and dropped 52-16 on Indiana. #6 Ohio State beat Illinois 49-13, and #7 USC put 56-28 on Penn State."`,
    ``,
    `✅ PRO-PATTERN (every team gets one distinguishing detail beyond the score):`,
    `   "Notre Dame's machine kept humming — 55-10 over North Carolina was their fourth 50-burger of the season, and the playoff committee is running out of reasons not to slot the Irish in the top two. Oregon's 52-16 in Bloomington was less a statement game than a maintenance check, but Will Stein's offense extended its scoreless-quarter streak to 11. Ohio State's 49-13 over Illinois delivered exactly the result preseason #4 was supposed to deliver — first-year head coach Ryan Day is now 7-1, but his 'quality wins' column reads zero."`,
    ``,
    `Required when listing more than two consecutive games: each team named must get ONE distinguishing detail from the data the prompt provides. Approved sources for that detail (rotate so it doesn't feel mechanical):`,
    `   • Prior-year finish or postseason narrative cue ("a year removed from the title game", "after last season's CFP first-round exit")`,
    `   • Coaching tenure or framing cue ("first-year head coach", "year four with a sub-.500 stint", "in his seventh year")`,
    `   • Recruiting class context ("riding a top-10 class arrival", "the talent the #4 class promised showed up")`,
    `   • Quality-wins / bad-losses tally ("now with two ranked wins on the résumé", "still searching for a quality win")`,
    `   • Current-season streak or record-quality angle ("now 8-1, but on a four-game cover-the-spread tear", "back-to-back blowout wins")`,
    `   • Rivalry/trophy game name when applicable ("the Iron Bowl", "the Egg Bowl")`,
    `   • Prior-year final ranking ("preseason #4 finally looking like the team that finished #4 last year")`,
    `   • Last-meeting / revenge framing from the LAST MEETINGS section`,
    ``,
    `If the data doesn't support ANY distinguishing detail for a team, that team probably doesn't merit being in the recap. Drop them.`,
    ``,
    `═══════════════════════════════════════════════════════════`,
    `RULE C — VERB DIVERSITY. NO BANNED VERB MORE THAN TWICE.`,
    `═══════════════════════════════════════════════════════════`,
    `These verbs are AI-tells: "rolled", "drilled", "flattened", "crushed", "edged", "topped", "hammered", "handled", "dropped" (as in "dropped 52 on"). Use any of them at most TWICE per recap. Top writers vary their result language by what the data actually shows:`,
    `   • Lopsided + early dominance: "embarrassed Maryland from the opening drive", "made an example of Indiana on the road", "ran out of patience with Penn State by halftime"`,
    `   • Lopsided + late: "buried late after a coin-flip first half", "pulled away in the third quarter and never looked back"`,
    `   • One-score: "survived NC State", "outlasted Pittsburgh in a track meet", "stole one in Lubbock", "needed a fourth-quarter touchdown to put Wake Forest away"`,
    `   • Upset: "stunned", "took down", "knocked off", "ambushed", "ended Tennessee's playoff dream"`,
    `   • Maintenance win over inferior opponent: "kept the lights on against UMass", "did the required work against Vanderbilt", "took care of business"`,
    `If you find yourself reaching for the same verb a third time, it means you're in score-dump mode. Stop, pick a different angle, rewrite the sentence.`,
    ``,
    `═══════════════════════════════════════════════════════════`,
    `RULE D — EVERY MAJOR SECTION ENDS WITH AN EARNED CLAIM`,
    `═══════════════════════════════════════════════════════════`,
    `A "major section" is any H2-headed section in your recap (HEADLINES, AROUND THE TOP 25, POLL MOVEMENT, AROUND THE COUNTRY, etc.). The last sentence of each must be a CLAIM that goes beyond reporting facts — a take the data here supports. If you can't defend a take with the data, drop the section entirely.`,
    ``,
    `Examples of earned claims (each one has data behind it):`,
    `   • "The Tigers' seven-point margin was the closest call any top-five team produced this week, and Clemson's playoff résumé is starting to look softer than its ranking."`,
    `   • "Two of the top five played one-score games. The committee will notice."`,
    `   • "Texas just hammered the team that played for the title last January. The Longhorns' 4-loss season is suddenly the most interesting at-large pitch in the country."`,
    `   • "Ohio State is 9-1, ranked #6, and has not yet beaten a top-25 team. That's a problem."`,
    ``,
    `These are CLAIMS, not summaries. They argue something. The data block supports each one (margins, prior-year context, quality-wins tally, etc.).`,
    ``,
    `═══════════════════════════════════════════════════════════`,
    `RULE E — PRIOR-YEAR CONTEXT IS HARD-REQUIRED, NOT SUGGESTED`,
    `═══════════════════════════════════════════════════════════`,
    `If a team that finished TOP-10 LAST YEAR or PLAYED IN THE CFP appears in your recap, their prior-year finish must be referenced when you describe them. This is a hard rule.`,
    ``,
    `THE FAILURE MODE: in a previous recap you generated, Texas blew out Ole Miss 52-20. Ole Miss had finished #4 the prior year and made the CFP semifinal — a fact in the data block. The recap mentioned the score and dropped Ole Miss. The Texas-Ole Miss line was wasted because the prior-year context that gives the result its weight ("a year removed from playing for the title, Ole Miss took a 52-20 beating") was never written.`,
    ``,
    `SELF-CHECK before sending: list every team you NAMED in the recap. For each, look at the PRIOR-YEAR CONTEXT block. If a team you named finished top-10 last year or played in the CFP and your recap doesn't reference that, REWRITE the relevant sentence. Output is incomplete without this.`,
    ``,
    `═══════════════════════════════════════════════════════════`,
    `RULE F — SECTIONS MUST CONNECT, NOT SILO`,
    `═══════════════════════════════════════════════════════════`,
    `Every section after the first must open with a sentence that references the previous section's thesis or extends it. Sections cannot read as independent reports of separate topics.`,
    ``,
    `❌ ANTI-PATTERN (silos):`,
    `   "## Tennessee Falls in Columbia [...]`,
    `    ## Top of the Poll Pours It On [...]`,
    `    ## Around the Top 25 [...]"`,
    `   Each section is its own little article. The reader bounces between unrelated topics.`,
    ``,
    `✅ PRO-PATTERN (connective tissue, the recap reads as ONE argument):`,
    `   "## Tennessee Falls in Columbia [...]"`,
    `   "## Who Profits From Tennessee's Collapse — While the SEC's title contender turned into bowl-eligibility worry, three other top-10 teams used their off week to do the basics. [...]"`,
    `   "## The Playoff Picture Just Reshuffled — That redistribution flows straight into the projected 12-team field. [...]"`,
    ``,
    `Each opening sentence picks up the prior section's thread. The recap is one argument made in stages, not five mini-articles glued together.`,
    ``,
    `═══════════════════════════════════════════════════════════`,
    `RULE G — POLL MOVEMENT IS A STORY, NOT A LADDER`,
    `═══════════════════════════════════════════════════════════`,
    `When describing rank movement across multiple weeks, do not just narrate the numbers. Characterize the trajectory. The data is a fact; the story is what the data MEANS.`,
    ``,
    `❌ "Tennessee rose to #2 entering Week 9, fell to #6 the next week, and was at #15 by Saturday."`,
    `✅ "Tennessee's six-week descent — from #2 to outside the Top 25 in 42 days — is the worst rolling collapse in college football this season. Title contender to bowl-eligibility worry, in less than half a season."`,
    ``,
    `═══════════════════════════════════════════════════════════`,
    `MANDATORY SELF-CRITIQUE PASS BEFORE YOU SEND`,
    `═══════════════════════════════════════════════════════════`,
    `Read your draft top to bottom and answer each of these questions HONESTLY. If any answer is no, REWRITE before sending. Do not skip this. Do not paraphrase the questions to make the answer easier.`,
    ``,
    `   1. Does my lede ARGUE something? (Not "describe", not "announce" — argue.)`,
    `   2. Is there a single THESIS the whole piece is organized around? Could I name it in one sentence?`,
    `   3. Did I use prior-year context for EVERY team I named that finished top-10 last year or played in the CFP?`,
    `   4. Did I use any banned verb (rolled, drilled, flattened, crushed, edged, topped, hammered, handled) more than twice?`,
    `   5. When I listed three or more games consecutively, did each team get one distinguishing detail beyond the score?`,
    `   6. Does each major section's last sentence make a CLAIM, not just summarize?`,
    `   7. Does each section after the first open with a sentence that connects back to the prior section?`,
    `   8. If I describe rank movement across weeks, did I CHARACTERIZE it (collapse / surge / freefall) or just narrate numbers?`,
    ``,
    `Eight checks. If any fails, rewrite the offending paragraph. Do not send a draft that hasn't passed every one.`,
    ``,
    FACTUAL_GUARDRAIL.trim(),
    ``,
    CONFERENCE_GUARDRAIL.trim(),
    ``,
    `═══════════════════════════════════════════════════════════`,
    `RANK USAGE — READ THIS CAREFULLY (the #1 historical confusion source)`,
    `═══════════════════════════════════════════════════════════`,
    `EA's schedule UI shows the rank each team holds AFTER playing that week's game (the post-game rank). The rank a team CARRIED INTO the game (the entering rank, the matchup-framing rank) is what they finished the PREVIOUS week with.`,
    ``,
    `In the game lines below, each team appears as "[entering→post-game] Team Score" — e.g. "[#2→#6] Tennessee 35, [UR→#15] South Carolina 38" means Tennessee entered the game at #2 and finished at #6, while South Carolina was unranked entering and rose to #15.`,
    ``,
    `Two distinct rank surfaces in the data block:`,
    ``,
    `  • ENTERING RANK (the [#X] left of the arrow) — the rank a team CARRIED INTO the matchup. Use when describing the matchup itself ("the #2 team faced the unranked South Carolina"). This is the matchup-framing rank.`,
    `  • POST-GAME RANK (the [#X] right of the arrow) — the rank a team finished with AFTER the game. Use when describing rank movement ("Tennessee fell to #15 after the loss", "South Carolina entered the Top 25 at #15"). This is the after-the-result rank.`,
    `  • LATEST-AVAILABLE TOP 25 — the most recent poll snapshot we can derive. Labeled either "POST-WEEK ${weekNum} TOP 25" (if Week ${weekNum + 1} games were entered already, so we know the actual post-week poll) or "MOST RECENT TOP 25 SNAPSHOT" (if not, in which case it's stale).`,
    ``,
    `WRITING RULES — get these right or the recap is wrong:`,
    `- Describe matchups using the ENTERING rank ("the #4 team beat the #11 team" — these are the [#X→...] left numbers).`,
    `- Describe rank movement using the POST-GAME rank ("Tennessee fell from #2 to #15 over three weeks" — these are the [...→#X] right numbers across consecutive weeks).`,
    `- DO NOT use a team's post-game rank as its matchup rank. Saying "the #15 Tennessee team" when describing the South Carolina loss is wrong — Tennessee was #6 entering the game, not #15. #15 is where they LANDED.`,
    `- DO NOT use a team's entering rank to describe the result. "Tennessee held its #2 ranking after the loss" is wrong — #2 was their entering rank; the post-game rank is what shifts.`,
    `- The historical recap output you produced previously had this exact bug: "Tennessee climbed to #2 entering Week 9, fell to #6 the next week, were already at #15 heading into Saturday" — every one of those was off by one week. The correct phrasing: "Tennessee was #2 AFTER Week 9, #6 AFTER Week 10, and #15 AFTER Week 11." Track post-week movement using the AFTER-GAME ([→#X]) numbers in consecutive weeks of the same team's data.`,
    `- When the latest snapshot is labeled "POST-WEEK ${weekNum}", you may say "Team X is now #N" for the current poll.`,
    `- When the latest snapshot is labeled "MOST RECENT" (Week ${weekNum + 1} data isn't available), describe the result and infer movement ("after the loss, Tennessee should fall in next week's poll") rather than asserting definitive post-Week ${weekNum} rankings.`,
    ``,
    `═══════════════════════════════════════════════════════════`,
    `WHAT TO COVER`,
    `═══════════════════════════════════════════════════════════`,
    `Aim for 500-800 words across 3-5 H2 sections. Quality over volume. Pick the structure that fits the week, but a typical strong week looks like:`,
    ``,
    `  1. HEADLINES & UPSETS — the biggest games of the week, including ranked-vs-ranked, top-10 losses, and any upset (ranked team falling to unranked). Lead with the loudest result. Group every consequential ranked game here so they're not split across multiple sections. When a featured team has notable prior-year context (top-10 finish, CFP appearance, defending champs) — visible in the PRIOR-YEAR CONTEXT section — weave it in: "a year removed from the title game...", "after last season's CFP semifinal run...", etc. When a featured game appears in LAST MEETINGS, name it as a rematch and use revenge / repeat-domination framing.`,
    `  2. AROUND THE TOP 25 — the rest of the ranked teams' results, briefly. Mostly a single paragraph that name-checks what each ranked team did. Where prior-year context tightens the story (a top-5 finisher now scuffling, an unranked finisher now ranked), USE IT.`,
    `  3. POLL MOVEMENT — if (and only if) the EVOLUTION section shows a clear trajectory across recent weeks. Compare consecutive "Entering Week W" rows. Each slot 1-25 has exactly one team — never describe ties.`,
    `  4. AROUND THE COUNTRY — selected unranked-vs-unranked storylines. Be selective: lopsided blowouts (≥30 pts), upsets, conference rivalries, and one-score thrillers. Skip games that are just middle-of-the-road results. Rivalry rematches with revenge/streak data attached (LAST MEETINGS) are good candidates here even if otherwise unremarkable.`,
    ``,
    `Optional extras (only when warranted by the data):`,
    `  - AWARDS / HEISMAN PICTURE — only if a player is leading a major stat category (passing/rushing/receiving yds, sacks) by a noticeable margin. If nobody clears that bar, SKIP.`,
    `  - CONFERENCE RACES — only if conference standings data is present.`,
    `  - LOOK-AHEAD — only if the snapshot is labeled "POST-WEEK ${weekNum}" (not "MOST RECENT"). Skip otherwise.`,
    ``,
    `STRUCTURAL RULES:`,
    `- Each game appears in EXACTLY ONE section. If you mention Alabama-Tennessee in HEADLINES, do not mention it again in AROUND THE TOP 25.`,
    `- Skip empty sections entirely. No hedging language ("the picture remains a watch list..."), no filler ("showed great heart"), no restating the same scoreline more than once.`,
    `- DO NOT explain data limitations to the reader. Never write things like "the latest snapshot is not the post-week poll" or "the next ranking isn't yet set" — that's plumbing the user shouldn't see. Just don't claim post-week rankings; describe what happened.`,
    `- Every sentence must add a fact from the data. If you can't, cut the sentence.`,
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
  const recentAwardLines = []
  for (const y of pastYears) {
    const aw = dynasty?.awardsByYear?.[y] || {}
    const heisman = aw.heisman?.player || aw.heisman?.name
    if (heisman) recentAwardLines.push(`${y} Heisman: ${heisman}`)
    const maxwell = aw.maxwell?.player || aw.maxwell?.name
    if (maxwell) recentAwardLines.push(`${y} Maxwell: ${maxwell}`)
    const obrien = aw.daveyObrien?.player || aw.daveyObrien?.name
    if (obrien) recentAwardLines.push(`${y} Davey O'Brien: ${obrien}`)
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
    `WHAT TO COVER (suggested order — adapt based on what's in the data)`,
    `═══════════════════════════════════════════════════════════`,
    `1. The preseason Top 25 — who's at the top, who's notable for being there.`,
    `2. Prior-season storylines — what happened last year that matters going into this one (champions, near-misses, late surges, drop-offs).`,
    `3. Programs with recurring top finishes — which teams have built sustained excellence over the last 2-3 dynasty years.`,
    `4. Award winners returning to school (only if the data hints at it — most often you can't tell, so skip).`,
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

  return [
    `You are helping a CFB dynasty mode user fill in a Preseason Top 25 for ${yearNum}.`,
    ``,
    `Output exactly 25 lines, one team per line, ranked #1 to #25. Each line is two tab-separated fields:`,
    ``,
    `<rank>\\t<team abbreviation>`,
    ``,
    `Use UPPERCASE FBS abbreviations the user will type into a strict-dropdown sheet (BAMA, OSU, UGA, MICH, etc.). Do NOT use full names, mascots, or city names.`,
    ``,
    FACTUAL_GUARDRAIL.trim(),
    ``,
    CONFERENCE_GUARDRAIL.trim(),
    ``,
    `Apply the guardrail to ranking choices: ground your Top 25 in the past-season data below. If the dynasty has no prior history, default to a reasonable real-world preseason consensus and SAY SO in a single PRE-NOTE line above the data, prefixed exactly with "PRE-NOTE:". The user will read and delete that note before pasting.`,
    ``,
    `Output ONLY the 25 ranked lines (and an optional PRE-NOTE line above). No headers, no commentary, no closing remarks.`,
    ``,
    `═══════════════════════════════════════════════════════════`,
    `DATA`,
    `═══════════════════════════════════════════════════════════`,
    dataBlock,
  ].join('\n')
}
