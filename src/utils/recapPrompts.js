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

// Pull POW/award names from a game — each field can be a player name string.
function powLinesForGame(game, dynasty) {
  const t1 = teamDisplay(game.team1Tid, game.team1, dynasty)
  const t2 = teamDisplay(game.team2Tid, game.team2, dynasty)
  const ctx = `${t1} vs ${t2}`
  const out = []
  if (game.conferencePOW) out.push(`${game.conferencePOW} — Conference Offensive POW (${ctx})`)
  if (game.confDefensePOW) out.push(`${game.confDefensePOW} — Conference Defensive POW (${ctx})`)
  if (game.nationalPOW) out.push(`${game.nationalPOW} — National Offensive POW (${ctx})`)
  if (game.natlDefensePOW) out.push(`${game.natlDefensePOW} — National Defensive POW (${ctx})`)
  return out
}

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
    everyGameLine.push(g)
  }

  // ----- Section: Player-of-the-week honorees across the whole week -----
  const powLines = []
  for (const g of weekGames) powLines.push(...powLinesForGame(g, dynasty))

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

  // ----- Section: Top 25 evolution by week (lets the AI see trends) -----
  // For each week W (1..weekNum), build a deduped Top 25 snapshot using
  // the same two-pass fill that powers Rankings.jsx — each rank slot
  // belongs to exactly one team (no fake ties from teams sharing a slot
  // across different weeks). The teamNewestRank pass evicts a team from
  // an old rank when they're seen at a different rank later.
  const buildSnapshotThroughWeek = (throughWeek) => {
    const weekBuckets = new Map() // wk -> Map(rank -> { tid, abbr })
    const observe = (wk, rank, tid, abbr) => {
      if (!isRanked(rank)) return
      if (!weekBuckets.has(wk)) weekBuckets.set(wk, new Map())
      const bucket = weekBuckets.get(wk)
      if (bucket.has(rank)) return
      bucket.set(rank, { tid: tid != null ? Number(tid) : null, abbr: abbr || null })
    }
    for (const g of games) {
      const gw = Number(g.week)
      if (!Number.isFinite(gw) || gw > throughWeek) continue
      observe(gw, g.team1Rank, g.team1Tid, g.team1)
      observe(gw, g.team2Rank, g.team2Tid, g.team2)
    }
    if (weekBuckets.size === 0) return []
    const sortedWeeks = [...weekBuckets.keys()].sort((a, b) => b - a)
    // Pass 1: register each team's NEWEST rank so a team that moved
    // from #1 last week to #3 this week appears only at #3.
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
    // Pass 2: write to slot map newest → oldest. Skip stale duplicates
    // (a team's newest rank disagrees with the slot we're considering).
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
    return [...slotMap.values()].sort((a, b) => a.rank - b.rank)
  }
  const top25ByWeek = []
  for (let w = 1; w <= weekNum; w++) {
    const rows = buildSnapshotThroughWeek(w)
    if (rows.length > 0) top25ByWeek.push({ week: w, rows })
  }
  const rankSnapshot = top25ByWeek.length > 0 ? top25ByWeek[top25ByWeek.length - 1].rows : []

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

  // ----- Section: Cumulative POW leaderboard (season to date) -----
  // Counts how many Player-of-the-Week honors each player has earned
  // across all categories (offense + defense, conference + national)
  // through this week. Useful for surfacing Heisman-tier storylines.
  const powCounts = {}
  for (const g of games) {
    const gw = Number(g.week)
    if (!Number.isFinite(gw) || gw > weekNum) continue
    const fields = ['conferencePOW', 'confDefensePOW', 'nationalPOW', 'natlDefensePOW']
    for (const f of fields) {
      const name = g[f]
      if (!name) continue
      if (!powCounts[name]) powCounts[name] = { name, conf: 0, confDef: 0, nat: 0, natDef: 0, total: 0 }
      const row = powCounts[name]
      if (f === 'conferencePOW') row.conf += 1
      else if (f === 'confDefensePOW') row.confDef += 1
      else if (f === 'nationalPOW') row.nat += 1
      else if (f === 'natlDefensePOW') row.natDef += 1
      row.total += 1
    }
  }
  const powLeaderboard = Object.values(powCounts)
    .filter(r => r.total >= 1)
    .sort((a, b) => b.total - a.total)
    .slice(0, 12)

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

  // Every game played this week — comprehensive list
  if (everyGameLine.length > 0) {
    sections.push(`ALL ENTERED FBS GAMES (Week ${weekNum})`)
    sections.push(`(Ranks shown are the ranks entering Week ${weekNum}.)`)
    for (const g of everyGameLine) sections.push(fmtGameLine(g, dynasty))
    sections.push('')
  }

  // POW honorees
  if (powLines.length > 0) {
    sections.push(`PLAYER-OF-THE-WEEK HONOREES (Week ${weekNum})`)
    for (const line of powLines) sections.push(line)
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

  // POW leaderboard — who's been collecting honors all season
  if (powLeaderboard.length > 0) {
    sections.push(`SEASON POW LEADERBOARD (through Week ${weekNum})`)
    for (const r of powLeaderboard) {
      const parts = []
      if (r.conf) parts.push(`${r.conf} Conf Off`)
      if (r.confDef) parts.push(`${r.confDef} Conf Def`)
      if (r.nat) parts.push(`${r.nat} Nat'l Off`)
      if (r.natDef) parts.push(`${r.natDef} Nat'l Def`)
      sections.push(`${r.name} — ${r.total} total POW (${parts.join(', ')})`)
    }
    sections.push('')
  }

  // Current Top 25 (post-week snapshot — use for describing rankings AFTER Week N)
  if (rankSnapshot.length > 0) {
    sections.push(`POST-WEEK ${weekNum} TOP 25 (current rankings AFTER Week ${weekNum})`)
    sections.push(`(Use these ranks when describing where teams stand NOW. Each rank slot 1-25 belongs to exactly one team — there are no ties.)`)
    for (const r of rankSnapshot) sections.push(`#${r.rank} ${r.name}`)
    sections.push('')
  }

  // Records for each currently-ranked team
  if (rankedRecordLines.length > 0) {
    sections.push(`RECORDS OF CURRENTLY-RANKED TEAMS (season to date)`)
    for (const line of rankedRecordLines) sections.push(line)
    sections.push('')
  }

  // Top 25 EVOLUTION week-by-week (so AI can describe poll movement)
  if (top25ByWeek.length > 1) {
    sections.push(`TOP 25 EVOLUTION (post-week snapshot for each week, oldest to newest)`)
    sections.push(`(Use this section ONLY for describing poll movement — "rose from #X to #Y" / "fell from #X to #Y". Each row is the post-week poll for that week.)`)
    for (const snap of top25ByWeek) {
      const compact = snap.rows.slice(0, 25).map(r => `#${r.rank} ${r.name}`).join(' · ')
      sections.push(`After Week ${snap.week}: ${compact}`)
    }
    sections.push('')
  }

  // Saved preseason poll
  if (preseasonTop25Lines.length > 0) {
    sections.push(`PRESEASON TOP 25 (${yearNum}, as the user entered it)`)
    for (const line of preseasonTop25Lines) sections.push(line)
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

  return [
    `You are writing a Week ${weekNum} College Football recap for the ${yearNum} season.`,
    ``,
    `This is a NATIONAL recap covering the entire FBS landscape — every notable game, every storyline, every standout performance the data shows. Treat all teams equally. Do NOT center the narrative on any single program. The reader is a college football fan who wants the week's whole picture.`,
    ``,
    `Tone: ESPN / The Athletic / 247Sports beat-writing — informed, slightly dramatic, but never breathless. Lead with the biggest games and biggest moves. Save individual performances and poll movement for the back half.`,
    ``,
    FACTUAL_GUARDRAIL.trim(),
    ``,
    `═══════════════════════════════════════════════════════════`,
    `RANK USAGE — READ CAREFULLY`,
    `═══════════════════════════════════════════════════════════`,
    `The data below has TWO different rank values for each team and you must keep them straight:`,
    ``,
    `  • PRE-GAME RANK = the rank the team CARRIED INTO Week ${weekNum}. Shown next to each team in the game lines (HEADLINE / TOP-25 vs UNRANKED / ALL ENTERED FBS GAMES sections). Use when describing the matchup itself ("the #4 team faced the #11 team").`,
    `  • POST-WEEK RANK = the rank the team holds NOW, AFTER Week ${weekNum}. Shown in the "POST-WEEK ${weekNum} TOP 25" section. Use when describing where teams currently stand or how the poll shifted.`,
    ``,
    `Mixing these is a common error: do NOT write "the #1 team beat #21 Duke" if Duke entered Week ${weekNum} ranked #14 and only fell to #21 AFTER losing. Write "the #1 team beat #14 Duke" (using the entering rank) and separately note "Duke fell from #14 to #21" using the post-week section.`,
    ``,
    `═══════════════════════════════════════════════════════════`,
    `WHAT TO COVER (suggested order — adapt based on what's in the data)`,
    `═══════════════════════════════════════════════════════════`,
    `1. HEADLINE GAMES — lead with the biggest result(s) of the week. Top 25 vs Top 25 always headlines if any happened. Otherwise the most consequential ranked-vs-unranked game (e.g. a top-10 team falling to an unranked one is the lead).`,
    `2. UPSETS & SURPRISES — call out any losses by ranked teams, especially top-10 teams. Quantify the gap when possible ("the #4 team fell to a team that came in 2-3").`,
    `3. NATIONAL TOP-25 ROUND-UP — quick walk through other ranked teams' results.`,
    `4. POLL MOVEMENT — if the Top 25 evolution shows a clear trajectory (a team rising or falling several spots over recent weeks), call it out. Use the EVOLUTION section, not invention. Do not describe "ties" or "shared ranks" — every rank slot 1-25 has exactly one team.`,
    `5. AWARDS / HEISMAN PICTURE — name the season's stat leaders and POW leaderboard front-runners. Frame as Heisman watch / All-American watch ONLY if the cumulative numbers warrant it.`,
    `6. CONFERENCE RACES — when standings data is present, describe who's ahead in each major conference race. If standings aren't entered, skip this entirely.`,
    `7. LOOK-AHEAD — only if multiple ranked teams have notable matchups remaining and the data block makes that clear. If not, skip.`,
    ``,
    `If a section's data block is empty, skip the section entirely — do not write filler. Better a tight 4-paragraph recap than a padded one.`,
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

  const dataBlock = [
    `Year about to start: ${yearNum}`,
    ``,
    histLines.length > 0 ? `RECENT FINAL POLLS:\n${histLines.join('\n')}` : `(no prior final-poll data has been saved in this dynasty)`,
    ``,
    awardLines.length > 0 ? `RECENT AWARDS:\n${awardLines.join('\n')}` : ``,
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
