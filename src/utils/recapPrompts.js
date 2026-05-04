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

function teamLabel(tid, abbrFallback, dynasty) {
  if (tid != null && dynasty?.teams?.[tid]) {
    const t = dynasty.teams[tid]
    const name = t.name || t.fullName || t.abbr || abbrFallback
    return name
  }
  return abbrFallback || 'Unknown'
}

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

function sumRecord(records) {
  let w = 0, l = 0
  for (const r of records) { w += r.wins || 0; l += r.losses || 0 }
  return { wins: w, losses: l }
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

// Pull the latest available rank for `tid` in `year` (highest week with a rank
// recorded). null if the team was never ranked.
function latestRankForTeam(games, year, tid) {
  let bestWeek = -1
  let bestRank = null
  const u = Number(tid)
  for (const g of (games || [])) {
    if (Number(g?.year) !== Number(year)) continue
    const wk = Number(g.week)
    if (!Number.isFinite(wk)) continue
    const t1 = Number(g.team1Tid), t2 = Number(g.team2Tid)
    const r1 = g.team1Rank, r2 = g.team2Rank
    let r = null
    if (t1 === u && typeof r1 === 'number') r = r1
    else if (t2 === u && typeof r2 === 'number') r = r2
    if (r == null) continue
    if (wk > bestWeek) { bestWeek = wk; bestRank = r }
  }
  return bestRank
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

// Top-N from a per-player stat array, comparing on `keyFn`.
function topPlayers(players, keyFn, year, n = 5) {
  const rows = []
  for (const p of (players || [])) {
    const yr = p?.statsByYear?.[year]
    if (!yr) continue
    const value = keyFn(yr)
    if (!Number.isFinite(value) || value <= 0) continue
    rows.push({ name: p.name, position: p.position, team: p.team, value })
  }
  rows.sort((a, b) => b.value - a.value)
  return rows.slice(0, n)
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
- Open with an H1 title (e.g., "# Week 6 Recap — 2034" or "# 2034 Season Preview").
- Use H2/H3 for sections.
- Keep paragraphs tight. Two to four short paragraphs per section is plenty.
- Bold standout names and scores.
- No tables, no bullet-point lists longer than ~5 items.
- No emoji.
`

// ---------------------------------------------------------------------------
// 1) WEEK RECAP — recapping a week that already finished.
// ---------------------------------------------------------------------------

export function buildWeekRecapPrompt(dynasty, year, week) {
  const yearNum = Number(year)
  const weekNum = Number(week)
  const games = (dynasty?.games || []).filter(g => g && Number(g.year) === yearNum)
  const weekGames = games.filter(g => Number(g.week) === weekNum)
  const userTid = dynasty?.currentTid != null ? Number(dynasty.currentTid) : null
  const userTeam = userTid != null ? teamDisplay(userTid, null, dynasty) : null
  const userConference = dynasty?.conference || null

  // ----- Section: User team focus (their game this week + season arc) -----
  const userWeekGame = userTid != null ? weekGames.find(g => isUserTeam(g, userTid)) : null
  const userYearGames = userTid != null ? games.filter(g => isUserTeam(g, userTid)) : []
  const userYearSorted = [...userYearGames].sort((a, b) => Number(a.week) - Number(b.week))
  const userRecord = recordFromGames(games, yearNum, userTid)
  const userLatestRank = userTid != null ? latestRankForTeam(games, yearNum, userTid) : null

  // ----- Section: Top-25 results that week (anyone with a rank) -----
  const rankedGames = weekGames.filter(g => {
    const r1 = g.team1Rank, r2 = g.team2Rank
    return (typeof r1 === 'number' && r1 <= 25) || (typeof r2 === 'number' && r2 <= 25)
  })
  const otherRankedGames = rankedGames.filter(g => !isUserTeam(g, userTid))

  // ----- Section: Conference results that week (user's conference, ex-user) -----
  const userConfGames = userConference
    ? weekGames.filter(g => g.conference === userConference && !isUserTeam(g, userTid))
    : []

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

  // ----- Section: Current top 25 (latest known) -----
  // Live snapshot derived from games up to and including this week — same
  // logic as Rankings.jsx but inlined here so there's no context coupling.
  const rankSnapshot = (() => {
    const byTid = {}
    for (const g of games) {
      if (Number(g.week) > weekNum) continue
      const wk = Number(g.week)
      if (!Number.isFinite(wk)) continue
      const t1 = Number(g.team1Tid), t2 = Number(g.team2Tid)
      const r1 = g.team1Rank, r2 = g.team2Rank
      const apply = (tid, abbr, rank) => {
        if (tid == null || typeof rank !== 'number' || rank < 1 || rank > 25) return
        const cur = byTid[tid]
        if (!cur || wk > cur.week) byTid[tid] = { rank, week: wk, abbr }
      }
      apply(t1, g.team1, r1)
      apply(t2, g.team2, r2)
    }
    const rows = Object.entries(byTid)
      .map(([tid, v]) => ({ tid: Number(tid), rank: v.rank, abbr: v.abbr, name: teamDisplay(Number(tid), v.abbr, dynasty) }))
      .sort((a, b) => a.rank - b.rank)
    return rows
  })()

  // ----- Section: Conference standings (saved snapshot, if any) -----
  const standingsByConf = dynasty?.conferenceStandingsByYear?.[yearNum] || {}

  // Now assemble the data block as plain text the AI consumes verbatim.
  const sections = []

  sections.push(`SEASON CONTEXT`)
  sections.push(`Year: ${yearNum}`)
  sections.push(`Week being recapped: ${weekNum}`)
  if (userTeam) sections.push(`User's team: ${userTeam}${userConference ? ` (${userConference})` : ''}`)
  if (userTeam) sections.push(`User's record after Week ${weekNum}: ${userRecord.wins}-${userRecord.losses}${userLatestRank != null ? ` (ranked #${userLatestRank})` : ' (unranked)'}`)
  sections.push('')

  // User game this week
  if (userWeekGame) {
    const persp = userPerspective(userWeekGame, userTid)
    const oppName = teamDisplay(persp.oppTid, persp.oppAbbr, dynasty)
    const headline = persp.won == null
      ? `${userTeam} vs ${oppName} — score not entered`
      : `${userTeam} ${persp.userScore}, ${oppName} ${persp.oppScore}${persp.ot ? ' (OT)' : ''} — ${persp.won ? 'WIN' : 'LOSS'}`
    sections.push(`USER'S WEEK ${weekNum} GAME`)
    sections.push(headline)
    if (persp.rank != null) sections.push(`${userTeam} entered ranked #${persp.rank}.`)
    if (persp.oppRank != null) sections.push(`${oppName} entered ranked #${persp.oppRank}.`)
    sections.push('')
  } else if (userTeam) {
    sections.push(`USER'S WEEK ${weekNum} GAME`)
    sections.push(`No game this week (bye or unentered).`)
    sections.push('')
  }

  // User team season arc to date
  if (userYearSorted.length > 0) {
    sections.push(`USER'S SEASON GAME LOG (Weeks 1–${weekNum})`)
    for (const g of userYearSorted) {
      if (Number(g.week) > weekNum) continue
      const persp = userPerspective(g, userTid)
      if (!persp) continue
      const oppName = teamDisplay(persp.oppTid, persp.oppAbbr, dynasty)
      const wl = persp.won == null ? '—' : persp.won ? 'W' : 'L'
      const score = persp.userScore != null ? `${persp.userScore}-${persp.oppScore}` : 'no score'
      const tag = persp.oppRank != null ? `#${persp.oppRank} ` : ''
      sections.push(`Week ${g.week}: ${wl} ${score} vs ${tag}${oppName}${persp.ot ? ' (OT)' : ''}`)
    }
    sections.push('')
  }

  // Top-25 results across the country
  if (otherRankedGames.length > 0) {
    sections.push(`OTHER TOP-25 RESULTS — WEEK ${weekNum}`)
    for (const g of otherRankedGames) sections.push(fmtGameLine(g, dynasty))
    sections.push('')
  }

  // Conference results (user's conference)
  if (userConfGames.length > 0) {
    sections.push(`OTHER ${userConference.toUpperCase()} RESULTS — WEEK ${weekNum}`)
    for (const g of userConfGames) sections.push(fmtGameLine(g, dynasty))
    sections.push('')
  }

  // POW honorees
  if (powLines.length > 0) {
    sections.push(`PLAYER-OF-THE-WEEK HONOREES`)
    for (const line of powLines) sections.push(line)
    sections.push('')
  }

  // Box-score stat leaders this week
  if (weekBoxLeaders.length > 0) {
    sections.push(`STAT LINES FROM WEEK ${weekNum} BOX SCORES`)
    for (const line of weekBoxLeaders) sections.push(line)
    sections.push('')
  }

  // Current Top 25
  if (rankSnapshot.length > 0) {
    sections.push(`CURRENT TOP 25 (after Week ${weekNum})`)
    for (const r of rankSnapshot) sections.push(`#${r.rank} ${r.name}`)
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

  const dataBlock = sections.join('\n')

  return [
    `You are writing a Week ${weekNum} recap for a College Football dynasty save (year ${yearNum}).`,
    ``,
    `The user is the head coach of ${userTeam || '(team not set)'}${userConference ? `, in the ${userConference}` : ''}. Their season-to-date record is ${userRecord.wins}-${userRecord.losses}.`,
    ``,
    `Audience: the user themselves. Tone: ESPN-style college football beat writing — informed, slightly dramatic, but never breathless. Center the narrative on what actually happened in the data.`,
    ``,
    FACTUAL_GUARDRAIL.trim(),
    ``,
    `═══════════════════════════════════════════════════════════`,
    `WHAT TO COVER`,
    `═══════════════════════════════════════════════════════════`,
    `1. The user's Week ${weekNum} game (lead with this) — what happened, what it means for their season.`,
    `2. Other top-25 results from the same week, brief.`,
    `3. The user's conference around the league, brief.`,
    `4. Standout individual performances from the data (POWs and any box-score stat lines included below).`,
    `5. A short forward look — next week's challenge for the user, top-of-poll storylines. Only mention what is in the data; if the next opponent isn't in the data block, skip the forward look.`,
    ``,
    `If a section's data block is empty (e.g. there are no other ranked games), skip the section entirely — do not write filler.`,
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
  const userTid = dynasty?.currentTid != null ? Number(dynasty.currentTid) : null
  const userTeam = userTid != null ? teamDisplay(userTid, null, dynasty) : null
  const userConference = dynasty?.conference || null
  const allGames = dynasty?.games || []

  // ----- Past-season recap of the user's recent results (last 3 years) -----
  const seenYears = new Set()
  for (const g of allGames) {
    const y = Number(g?.year)
    if (Number.isFinite(y) && y < yearNum) seenYears.add(y)
  }
  const pastYears = [...seenYears].sort((a, b) => b - a).slice(0, 3)

  const pastSeasonLines = []
  for (const y of pastYears) {
    if (userTid != null) {
      const rec = recordFromGames(allGames, y, userTid)
      const finalRank = latestRankForTeam(allGames, y, userTid)
      pastSeasonLines.push(`${y}: ${userTeam} finished ${rec.wins}-${rec.losses}${finalRank != null ? `, ranked #${finalRank} at season end` : ', unranked'}.`)
    }
    // Also list final-poll top 5 if we saved one
    const finalMedia = dynasty?.finalPolls?.[y]?.media
    if (Array.isArray(finalMedia) && finalMedia.length > 0) {
      const top5 = finalMedia.slice(0, 5).map(e => `#${e.rank} ${teamDisplay(e.tid, e.team, dynasty)}`).join(', ')
      pastSeasonLines.push(`${y} final poll top 5: ${top5}.`)
    }
  }

  // ----- Awards from past seasons (if saved) -----
  const recentAwardLines = []
  for (const y of pastYears) {
    const aw = dynasty?.awardsByYear?.[y] || {}
    const heisman = aw.heisman?.player || aw.heisman?.name
    if (heisman) recentAwardLines.push(`${y} Heisman: ${heisman}`)
  }

  // ----- Saved preseason rankings, if any -----
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
  if (userTeam) sections.push(`User's team: ${userTeam}${userConference ? ` (${userConference})` : ''}`)
  sections.push('')

  if (pastSeasonLines.length > 0) {
    sections.push(`RECENT HISTORY`)
    for (const line of pastSeasonLines) sections.push(line)
    sections.push('')
  }

  if (recentAwardLines.length > 0) {
    sections.push(`RECENT AWARDS`)
    for (const line of recentAwardLines) sections.push(line)
    sections.push('')
  }

  if (preseasonTop25Lines.length > 0) {
    sections.push(`PRESEASON TOP 25 — ${yearNum}`)
    for (const line of preseasonTop25Lines) sections.push(line)
    sections.push('')
  } else {
    sections.push(`PRESEASON TOP 25 — ${yearNum}`)
    sections.push(`(no preseason poll has been entered for ${yearNum} yet — do not invent one)`)
    sections.push('')
  }

  const dataBlock = sections.join('\n')

  return [
    `You are writing a ${yearNum} College Football season preview for a dynasty save.`,
    ``,
    `The user is the head coach of ${userTeam || '(team not set)'}${userConference ? `, in the ${userConference}` : ''}.`,
    ``,
    `Audience: the user themselves. Tone: a season-preview column — confident, scene-setting, but tightly bounded by the data below.`,
    ``,
    FACTUAL_GUARDRAIL.trim(),
    ``,
    `═══════════════════════════════════════════════════════════`,
    `WHAT TO COVER`,
    `═══════════════════════════════════════════════════════════`,
    `1. Where the user's program stands coming into ${yearNum} — what their last season says about expectations.`,
    `2. The national landscape from the preseason Top 25 (if one is in the data).`,
    `3. The user's conference — the rivals to watch, based ONLY on what the past-season records and Top 25 tell you.`,
    `4. One brief forward-look paragraph for the user's program.`,
    ``,
    `If the data block is sparse (early dynasty, no prior history), keep the recap SHORT. Three or four paragraphs is plenty.`,
    `If a section's data block is empty, skip the section entirely.`,
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
