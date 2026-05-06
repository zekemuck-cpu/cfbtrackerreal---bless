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

// Format one game line: "AUB 31, GA 24 (OT)  ·  Rank 8 vs Rank 4  ·  Week 6 @ Athens"
function fmtGameLine(game, dynasty) {
  const t1 = teamDisplay(game.team1Tid, game.team1, dynasty)
  const t2 = teamDisplay(game.team2Tid, game.team2, dynasty)
  const s1 = game.team1Score, s2 = game.team2Score
  const r1 = typeof game.team1Rank === 'number' ? `#${game.team1Rank} ` : ''
  const r2 = typeof game.team2Rank === 'number' ? `#${game.team2Rank} ` : ''
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

  // ----- Section: Weekly entering-rank snapshots -----
  // The team1Rank/team2Rank fields on a game record are the ranks teams
  // CARRIED INTO that game — i.e. the poll AS OF the start of that week.
  // So a snapshot built from games where week == W tells us the poll
  // entering Week W (= post-Week W-1 rankings).
  //
  // For the recap of Week N just finished, the most useful "current" poll
  // is the post-Week N poll — which is observable ONLY in the entering
  // ranks of Week N+1 games (if the user has entered them already, e.g.
  // by drafting next week's schedule with ranks before generating the
  // recap). If Week N+1 data doesn't exist yet, we fall back to the most
  // recent week with data.
  //
  // The two-pass fill (matches Rankings.jsx) guarantees each rank slot
  // 1-25 belongs to exactly one team — no fake ties from teams sharing a
  // slot across different weeks.
  const isRankedRow = (n) => isRanked(n)
  const buildSnapshotForEnteringWeek = (enteringWeek) => {
    // "Entering week W" snapshot uses observations from week W games
    // (their team1Rank/team2Rank are the entering ranks for that week)
    // PLUS any earlier weeks for teams that didn't play this week.
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
      if (!Number.isFinite(gw) || gw > enteringWeek) continue
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

  // Weekly evolution: for each week W from 1..weekNum, the poll teams
  // entered W with. Each row is a snapshot AS OF the START of Week W.
  const top25ByWeek = []
  for (let w = 1; w <= weekNum; w++) {
    const snap = buildSnapshotForEnteringWeek(w)
    if (snap.rows.length > 0) top25ByWeek.push({ week: w, rows: snap.rows })
  }

  // Latest derivable poll — peek at Week N+1 games. If the user has
  // entered next week's schedule with ranks already, those entering
  // ranks ARE the post-Week N poll. Otherwise fall back to the most
  // recent week with data and explicitly note the staleness.
  const peekSnapshot = buildSnapshotForEnteringWeek(weekNum + 1)
  const hasFreshPostWeekPoll = peekSnapshot.latestWeek === weekNum + 1
  const rankSnapshot = peekSnapshot.rows
  const rankSnapshotLabel = hasFreshPostWeekPoll
    ? `POST-WEEK ${weekNum} TOP 25 (the poll teams are entering Week ${weekNum + 1} with — i.e. the rankings AFTER Week ${weekNum} games)`
    : `MOST RECENT TOP 25 SNAPSHOT (the poll teams entered their most recent observed games with — Week ${peekSnapshot.latestWeek ?? weekNum}. Post-Week ${weekNum} rankings are NOT yet observable; use this snapshot only as a baseline and INFER movement from this week's results.)`

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
    const finalMedia = dynasty?.finalPolls?.[y]?.media
    if (Array.isArray(finalMedia) && finalMedia.length > 0) {
      const top5 = finalMedia.slice(0, 5).map(e => `#${e.rank} ${teamDisplay(e.tid, e.team, dynasty)}`).join(', ')
      priorYearLines.push(`${y} final poll top 5: ${top5}.`)
    }
    const aw = dynasty?.awardsByYear?.[y] || {}
    if (aw.heisman?.player || aw.heisman?.name) priorYearLines.push(`${y} Heisman: ${aw.heisman.player || aw.heisman.name}.`)
  }

  // ----- Section: Saved preseason poll for current year (if any) -----
  const presPolls = dynasty?.preseasonRankingsByYear?.[yearNum]
    || dynasty?.finalPolls?.[yearNum]?.preseason
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

  // Headline games — top 25 vs top 25
  // Each game line shows ranks ENTERING the game (the rank the team carried
  // INTO Week N — not the post-week rank).
  if (top25vTop25.length > 0) {
    sections.push(`HEADLINE GAMES — RANKED vs RANKED (Week ${weekNum})`)
    sections.push(`(Ranks shown are the ranks entering Week ${weekNum}, not post-week ranks. Use these when describing matchups.)`)
    for (const g of top25vTop25) sections.push(fmtGameLine(g, dynasty))
    sections.push('')
  }

  // Top-25 results vs unranked teams
  if (top25vUnranked.length > 0) {
    sections.push(`TOP-25 vs UNRANKED RESULTS (Week ${weekNum})`)
    sections.push(`(Ranks shown are the ranks entering Week ${weekNum}.)`)
    for (const g of top25vUnranked) sections.push(fmtGameLine(g, dynasty))
    sections.push('')
  }

  // Other FBS games — unranked-vs-unranked. The two ranked sections
  // above already cover every game involving a top-25 team, so this
  // bucket has no overlap with them.
  if (everyGameLine.length > 0) {
    sections.push(`OTHER FBS GAMES — UNRANKED MATCHUPS (Week ${weekNum})`)
    sections.push(`(Ranks not applicable — both teams entered the week unranked.)`)
    for (const g of everyGameLine) sections.push(fmtGameLine(g, dynasty))
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
    `Tone: ESPN / The Athletic / 247Sports beat-writing — informed, slightly dramatic, but never breathless. Lead with the biggest games and biggest moves. Save individual performances and poll movement for the back half.`,
    ``,
    FACTUAL_GUARDRAIL.trim(),
    ``,
    CONFERENCE_GUARDRAIL.trim(),
    ``,
    `═══════════════════════════════════════════════════════════`,
    `RANK USAGE — READ CAREFULLY`,
    `═══════════════════════════════════════════════════════════`,
    `Every team1Rank/team2Rank in the data is the rank the team CARRIED INTO that game (the "pre-game" or "entering" rank). Two distinct kinds of rank values appear in the data block:`,
    ``,
    `  • ENTERING-WEEK-${weekNum} RANK — the rank teams brought INTO Week ${weekNum}. Shown next to each team in the game lines (HEADLINE / TOP-25 vs UNRANKED / ALL ENTERED FBS GAMES sections). Use when describing the matchup itself ("the #4 team faced the #11 team in the game").`,
    `  • LATEST-AVAILABLE TOP 25 — the most recent poll snapshot we can derive. Read the section's exact label below — it'll either say "POST-WEEK ${weekNum} TOP 25" (if Week ${weekNum + 1} game data was already entered, giving us the actual post-Week ${weekNum} poll) OR "MOST RECENT TOP 25 SNAPSHOT" (if not, in which case it's stale and represents the poll teams entered Week ${weekNum} with, NOT the post-Week ${weekNum} poll).`,
    ``,
    `WRITING RULES:`,
    `- Describe matchups using ENTERING ranks ("the #4 team beat the #11 team", not the post-week ranks).`,
    `- When the latest snapshot is labeled "POST-WEEK ${weekNum}", you may say "Team X is now #N" for the current poll.`,
    `- When the latest snapshot is labeled "MOST RECENT" (i.e. Week ${weekNum + 1} data isn't available), DO NOT claim definitive post-Week ${weekNum} rankings. Instead infer ("after the loss, Tennessee should fall in next week's poll") or describe the trajectory using the EVOLUTION section.`,
    `- Mixing these up is a common error: don't write "the #1 team beat #21 Duke" if Duke entered Week ${weekNum} at #14 — use the entering rank #14. Track post-week movement separately via the EVOLUTION rows.`,
    ``,
    `═══════════════════════════════════════════════════════════`,
    `WHAT TO COVER`,
    `═══════════════════════════════════════════════════════════`,
    `Aim for 500-800 words across 3-5 H2 sections. Quality over volume. Pick the structure that fits the week, but a typical strong week looks like:`,
    ``,
    `  1. HEADLINES & UPSETS — the biggest games of the week, including ranked-vs-ranked, top-10 losses, and any upset (ranked team falling to unranked). Lead with the loudest result. Group every consequential ranked game here so they're not split across multiple sections.`,
    `  2. AROUND THE TOP 25 — the rest of the ranked teams' results, briefly. Mostly a single paragraph that name-checks what each ranked team did.`,
    `  3. POLL MOVEMENT — if (and only if) the EVOLUTION section shows a clear trajectory across recent weeks. Compare consecutive "Entering Week W" rows. Each slot 1-25 has exactly one team — never describe ties.`,
    `  4. AROUND THE COUNTRY — selected unranked-vs-unranked storylines. Be selective: lopsided blowouts (≥30 pts), upsets, conference rivalries, and one-score thrillers. Skip games that are just middle-of-the-road results.`,
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
    const finalMedia = dynasty?.finalPolls?.[y]?.media
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
    const finalMedia = dynasty?.finalPolls?.[y]?.media
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
    || dynasty?.finalPolls?.[yearNum]?.preseason
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
    const finalMedia = dynasty?.finalPolls?.[y]?.media
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
