/**
 * Social Media prompt builder.
 *
 * Produces the copy/paste prompt for the "Generate Social Feed" flow. The AI
 * returns a `cfb-social` fenced block of one-post-per-line records that the
 * parser (socialModel.resolveSocialPosts) turns into stored posts.
 *
 * Scoping matters: the character universe can be 1700+, far too many to list.
 * So the roster section is scoped per week to (a) a sample of national voices
 * and (b) the accounts of the teams actually playing this week. Any team
 * without a listed account is referenced via the beat:<ABBR> / fan:<ABBR>
 * convention and auto-instantiated by the parser.
 */

import { buildGameTagMap, getEffectiveCharacters, DEFAULT_SOCIAL_SETTINGS, DEFAULT_SOCIAL_PLATFORM, isOfficialTeamAccount, isRealAccount } from '../data/socialModel'
import { canonicalBoxScore } from './boxScoreHelpers'
import { collapsePatRowsIntoTDs, sortPlaysChronologically } from './scoringPlayOrder'
import { getRecordAsOfGame } from '../context/DynastyContext'

const NATIONAL_SAMPLE_SIZE = 40

function teamLabel(dynasty, tid, fallbackAbbr) {
  const slot = dynasty?.teams?.[tid] || dynasty?.teams?.[String(tid)]
  const abbr = slot?.abbr || fallbackAbbr || ''
  const name = slot?.name || fallbackAbbr || `Team ${tid}`
  return { abbr, name }
}

function rankPrefix(rank) {
  const r = Number(rank)
  return Number.isFinite(r) && r > 0 && r <= 25 ? `#${r} ` : ''
}

// One human-readable, G-tagged line per game for the data block.
function gameLine(tag, game, dynasty) {
  const t1 = teamLabel(dynasty, game.team1Tid, game.team1)
  const t2 = teamLabel(dynasty, game.team2Tid, game.team2)
  const s1 = Number(game.team1Score)
  const s2 = Number(game.team2Score)
  const winner = s1 === s2 ? null : (s1 > s2 ? t1 : t2)
  let site = ''
  if (game.homeTeamTid == null) site = ' (neutral site)'
  else if (game.homeTeamTid === game.team2Tid) site = ` (at ${t2.abbr})`
  else site = ` (at ${t1.abbr})`
  const ot = game.ot ? ' OT' : ''
  const result = winner ? ` — ${winner.name} win` : ''
  return `${tag}: ${rankPrefix(game.team1Rank)}${t1.name} (${t1.abbr}) ${s1}, ${rankPrefix(game.team2Rank)}${t2.name} (${t2.abbr}) ${s2}${ot}${site}${result}`
}

function charsForTeam(charactersById, tid) {
  return Object.values(charactersById || {}).filter(c => c && c.teamTid === tid)
}

function nationalSample(charactersById, n) {
  return Object.values(charactersById || {})
    .filter(c => c && c.kind === 'national')
    .sort((a, b) => (Number(b.followerCount) || 0) - (Number(a.followerCount) || 0))
    .slice(0, n)
}

// Posting-priority tier: official team account first, then any real-world
// person/brand account, then fictional universe accounts. Drives the order the
// AI is asked to emit posts in (official → real → fictional).
function accountTier(c) {
  if (isOfficialTeamAccount(c)) return 0
  if (isRealAccount(c)) return 1
  return 2
}
const TIER_LABEL = ['Official', 'Real', 'Fictional']

function byPostPriority(a, b) {
  const t = accountTier(a) - accountTier(b)
  if (t) return t
  return (Number(b.followerCount) || 0) - (Number(a.followerCount) || 0)
}

function rosterLine(c) {
  const p = (c.personality || '').trim() || c.role || c.category || 'a college football account'
  return `${c.handle} [${TIER_LABEL[accountTier(c)]}] — ${p}`
}

function playedGamesForWeek(dynasty, yearN, weekN) {
  return (dynasty?.games || []).filter(g => {
    // Use string comparison so sentinel weeks ('CCG', 'Bowl', 'NatChamp') match correctly
    if (Number(g.year) !== Number(yearN) || String(g.week) !== String(weekN)) return false
    const s1 = Number(g.team1Score)
    const s2 = Number(g.team2Score)
    return Number.isFinite(s1) && Number.isFinite(s2) && (s1 > 0 || s2 > 0)
  })
}

/**
 * Reproduce the deterministic TAG -> gameId map for a week. Both the prompt
 * builder and the parser call this (on the same week's games) so posts attach
 * to the right game with nothing stored.
 */
export function socialGameTagMap(dynasty, year, week) {
  const tags = buildGameTagMap(playedGamesForWeek(dynasty, Number(year), Number(week)))
  return Object.fromEntries(tags.map(t => [t.tag, t.gameId]))
}

/**
 * The reusable social section: tagged GAMES block + scoped character roster +
 * the cfb-social output contract. Embedded into the weekly recap prompt and
 * also used by the standalone Generate Social prompt.
 * Returns { section, gameTagMap, gameCount }.
 */
export function buildSocialSection(dynasty, year, week) {
  const yearN = Number(year)
  const weekN = week  // preserve string sentinels ('CCG', 'Bowl', 'NatChamp')
  const settings = { ...DEFAULT_SOCIAL_SETTINGS, ...(dynasty?.socialSettings || {}) }
  const platform = { ...DEFAULT_SOCIAL_PLATFORM, ...(dynasty?.socialPlatform || {}) }
  const charactersById = getEffectiveCharacters(dynasty)

  const tagMap = buildGameTagMap(playedGamesForWeek(dynasty, yearN, weekN))
  const gameTagMap = Object.fromEntries(tagMap.map(t => [t.tag, t.gameId]))

  // Scope of games to post about.
  let scopedTags = tagMap
  if (settings.scope === 'user' && dynasty?.currentTid != null) {
    const myTid = Number(dynasty.currentTid)
    scopedTags = tagMap.filter(t => t.game.team1Tid === myTid || t.game.team2Tid === myTid)
  } else if (settings.scope === 'ranked') {
    scopedTags = tagMap.filter(t => rankPrefix(t.game.team1Rank) || rankPrefix(t.game.team2Rank)
      || (dynasty?.currentTid != null && (t.game.team1Tid === Number(dynasty.currentTid) || t.game.team2Tid === Number(dynasty.currentTid))))
  }

  const gameLines = scopedTags.map(t => gameLine(t.tag, t.game, dynasty)).join('\n')

  // Teams playing this week -> their accounts (or the beat/fan convention).
  const teamTids = new Set()
  for (const t of scopedTags) {
    if (t.game.team1Tid != null) teamTids.add(Number(t.game.team1Tid))
    if (t.game.team2Tid != null) teamTids.add(Number(t.game.team2Tid))
  }
  const teamRosterLines = []
  for (const tid of teamTids) {
    const accounts = charsForTeam(charactersById, tid).sort(byPostPriority)
    const { abbr, name } = teamLabel(dynasty, tid)
    if (accounts.length > 0) {
      for (const c of accounts) teamRosterLines.push(`${rosterLine(c)} [${abbr}]`)
    } else {
      teamRosterLines.push(`(no listed ${name} accounts — post as beat:${abbr} or fan:${abbr})`)
    }
  }

  const nationalLines = nationalSample(charactersById, NATIONAL_SAMPLE_SIZE).map(rosterLine).join('\n')
  const post = platform.postNoun || 'post'

  const section = `═══════════════════════════════════════════════════════════
SOCIAL POSTS — a SECOND output block
═══════════════════════════════════════════════════════════
These are posts on a mock social media platform similar to X/Twitter. Write in-character as the accounts below.
- For EACH game tag, write ${settings.postsPerGame} ${post}s from accounts that would care (the two teams' beat and fan accounts, plus an occasional national voice for notable results).
- ORDER OF POSTS PER GAME: lead with the team's [Official] account if one is listed, then any [Real] accounts, then [Fictional] accounts. Always emit the official account's ${post} first.
- Then write ${settings.nationalCount} national ${post}s reacting to the week overall (rankings, playoff race, standout performances).
- Match each account's personality. Keep each ${post} realistic (a sentence or two). Only react to the games/scores shown; invent nothing.

Each account below is tagged [Official] (a team's verified athletics account), [Real] (a real-world person/brand), or [Fictional] (a made-up universe account). Post in that priority order: Official, then Real, then Fictional.

GAMES (use the tag exactly as shown, e.g. G1, as the first field in each output line):
${gameLines || '(no games this week)'}

NATIONAL VOICES (reference by @handle; write in their personality):
${nationalLines || '(none provided)'}

TEAM ACCOUNTS (reference by @handle, or beat:<ABBR> / fan:<ABBR> for any team without a listed account):
${teamRosterLines.join('\n') || '(none)'}

SOCIAL OUTPUT — a separate fenced block, one ${post} per line, exactly:
\`\`\`cfb-social
G1 | @SomeHandle | the post text here
G1 | beat:MIZ | another post about that same game
N | @AnotherHandle | a national take about the week
\`\`\`
LINE GRAMMAR: <scope> | <author> | <text>
- scope: the game tag exactly as listed above (G1, G2, ...) — NO brackets, just the tag. Or N for a national post.
- author: an @handle from the lists above, OR beat:<ABBR> / fan:<ABBR> using a team abbreviation from the GAMES block.
- text: the ${post}; everything after the second | is the text, so apostrophes and punctuation are fine.
One ${post} per line. No numbering. No commentary inside the block.`

  return { section, gameTagMap, gameCount: scopedTags.length }
}

// ─── Per-game deep-dive social prompt (game editor) ───────────────────────────

const META_KEYS = new Set(['name', 'playerName', 'position', 'pos', 'pid', 'tid', 'jerseyNumber', 'jersey', 'id', 'team', 'teamTid', 'teamAbbr'])
const num = (v) => Number(v) || 0

function gameTypeLabel(game) {
  if (game.isCFPChampionship) return 'CFP NATIONAL CHAMPIONSHIP'
  if (game.isCFPSemifinal) return 'CFP SEMIFINAL'
  if (game.isCFPQuarterfinal) return 'CFP QUARTERFINAL'
  if (game.isCFPFirstRound) return 'CFP FIRST ROUND'
  if (game.isConferenceChampionship) return `CONFERENCE CHAMPIONSHIP${game.conference ? ` — ${game.conference}` : ''}`
  if (game.isBowlGame) return `BOWL GAME${game.bowlName ? ` — ${game.bowlName}` : ''}`
  if (game.week === 'CCG') return 'CONFERENCE CHAMPIONSHIP'
  if (game.week === 'Bowl') return 'BOWL GAME'
  if (game.week === 'NatChamp') return 'NATIONAL CHAMPIONSHIP'
  if (game.isConferenceGame) return 'CONFERENCE REGULAR SEASON GAME'
  return 'REGULAR SEASON GAME'
}

function weekDisplay(year, week) {
  if (!year) return ''
  const wLabel = week === 'CCG' ? 'Conference Championship'
    : week === 'Bowl' ? 'Bowl Season'
    : week === 'NatChamp' ? 'National Championship'
    : week ? `Week ${week}` : ''
  return wLabel ? `Year ${year}, ${wLabel}` : `Year ${year}`
}

function getHCName(dynasty, tid, year) {
  if (dynasty?.coaches) {
    const yearN = Number(year)
    const coach = Object.values(dynasty.coaches).find(c =>
      c.status !== 'departed' && c.byYear?.[yearN]?.teamTid === Number(tid) && c.byYear?.[yearN]?.role === 'HC'
    )
    if (coach?.name) return coach.name
  }
  const slot = dynasty?.teams?.[tid] ?? dynasty?.teams?.[String(tid)]
  return slot?.byYear?.[year]?.coachingStaff?.hcName || null
}

function formatQuarterScores(game, t1abbr, t2abbr) {
  const q = game.quarters
  if (!q?.team1 || !q?.team2) return null
  const t1q = q.team1; const t2q = q.team2
  let r1 = `  ${t1abbr}: Q1 ${t1q.Q1 ?? 0} | Q2 ${t1q.Q2 ?? 0} | Q3 ${t1q.Q3 ?? 0} | Q4 ${t1q.Q4 ?? 0}`
  let r2 = `  ${t2abbr}: Q1 ${t2q.Q1 ?? 0} | Q2 ${t2q.Q2 ?? 0} | Q3 ${t2q.Q3 ?? 0} | Q4 ${t2q.Q4 ?? 0}`
  if (Array.isArray(game.overtimes) && game.overtimes.length) {
    game.overtimes.forEach((ot, i) => {
      const label = i === 0 ? 'OT' : `OT${i + 1}`
      r1 += ` | ${label} ${ot.team1 ?? 0}`
      r2 += ` | ${label} ${ot.team2 ?? 0}`
    })
  }
  return [r1, r2]
}

// Player rows are grouped { passing, rushing, receiving, defense, kicking },
// each an array whose rows use `playerName` + the sheet's camelCase stat keys.
function formatPlayerRows(boxSide) {
  const lines = []
  if (!boxSide || typeof boxSide !== 'object') return lines
  for (const p of (boxSide.passing || [])) {
    const att = num(p.attempts ?? p.att); const yds = num(p.yards ?? p.yds)
    if (!att && !yds) continue
    const int = num(p.iNT ?? p.int)
    lines.push(`  ${p.playerName} (QB): ${num(p.comp ?? p.completions)}/${att} for ${yds} yds, ${num(p.tD ?? p.td)} TD${int ? `, ${int} INT` : ''}`)
  }
  for (const p of (boxSide.rushing || [])) {
    const car = num(p.carries ?? p.car); const yds = num(p.yards ?? p.yds)
    if (!car && !yds) continue
    const td = num(p.tD ?? p.td)
    lines.push(`  ${p.playerName} (RB): ${car} car, ${yds} yds${td ? `, ${td} TD` : ''}`)
  }
  for (const p of (boxSide.receiving || [])) {
    const rec = num(p.receptions ?? p.rec); const yds = num(p.yards ?? p.yds)
    if (!rec && !yds) continue
    const td = num(p.tD ?? p.td)
    lines.push(`  ${p.playerName} (WR/TE): ${rec} rec, ${yds} yds${td ? `, ${td} TD` : ''}`)
  }
  for (const p of (boxSide.defense || [])) {
    const tkl = num(p.solo) + num(p.assists) + num(p.tackles)
    const sk = num(p.sack); const int = num(p.iNT ?? p.int); const tfl = num(p.tFL ?? p.tfl); const ff = num(p.fF ?? p.ff)
    if (!tkl && !sk && !int && !tfl && !ff) continue
    const parts = []
    if (tkl) parts.push(`${tkl} tkl`)
    if (tfl) parts.push(`${tfl} TFL`)
    if (sk) parts.push(`${sk} sack`)
    if (int) parts.push(`${int} INT`)
    if (ff) parts.push(`${ff} FF`)
    lines.push(`  ${p.playerName} (DEF): ${parts.join(', ')}`)
  }
  for (const p of (boxSide.kicking || [])) {
    const fgm = num(p.fgMade ?? p.fgm); const fga = num(p.fgAtt ?? p.fga)
    if (!fgm && !fga) continue
    lines.push(`  ${p.playerName} (K): ${fgm}/${fga} FG`)
  }
  return lines
}

function dumpTeamStats(ts) {
  if (!ts || typeof ts !== 'object') return ''
  return Object.entries(ts)
    .filter(([k, v]) => !META_KEYS.has(k) && v != null && v !== '')
    .map(([k, v]) => `${k} ${v}`).join(', ')
}

// Scoring summary may be a full play log; keep only actual scoring plays and
// format them (PAT rows collapsed into their TD).
function formatScoringPlays(summary) {
  if (!Array.isArray(summary) || !summary.length) return []
  let plays
  try { plays = sortPlaysChronologically(collapsePatRowsIntoTDs(summary)) } catch { plays = summary }
  const lines = []
  for (const p of plays) {
    const st = (p?.scoreType || '').trim()
    if (!st) continue
    const q = p.quarter ? `Q${p.quarter}` : ''
    const time = p.timeLeft ? ` ${p.timeLeft}` : ''
    const team = (p.team || '').toUpperCase()
    const yds = p.yards ? ` ${p.yards} yd` : ''
    const scorer = p.scorer ? ` ${p.scorer}` : ''
    const from = p.passer ? ` from ${p.passer}` : ''
    const pat = p.patResult ? ` (${p.patResult})` : ''
    lines.push(`  ${q}${time} ${team}:${scorer}${yds} ${st}${from}${pat}`.replace(/\s+/g, ' ').trim())
  }
  return lines
}

function gameDataBlock(dynasty, game) {
  const t1 = teamLabel(dynasty, game.team1Tid, game.team1)
  const t2 = teamLabel(dynasty, game.team2Tid, game.team2)
  const s1 = Number(game.team1Score)
  const s2 = Number(game.team2Score)
  const winner = s1 === s2 ? null : (s1 > s2 ? t1 : t2)
  let site = ''
  if (game.homeTeamTid == null) site = ' (neutral site)'
  else if (game.homeTeamTid === game.team2Tid) site = ` (at ${t2.abbr})`
  else site = ` (at ${t1.abbr})`
  const ot = game.ot ? ' (OT)' : ''
  const wkDisp = weekDisplay(game.year, game.week)

  const lines = [
    wkDisp ? `${wkDisp} — ${gameTypeLabel(game)}` : gameTypeLabel(game),
    `FINAL: ${rankPrefix(game.team1Rank)}${t1.name} (${t1.abbr}) ${s1}, ${rankPrefix(game.team2Rank)}${t2.name} (${t2.abbr}) ${s2}${ot}${site}${winner ? ` — ${winner.name} win` : ''}`,
  ]

  // CFP seeds
  if (game.seed1 || game.seed2) {
    lines.push(`CFP Seeds: ${t1.abbr} #${game.seed1 ?? '?'} vs ${t2.abbr} #${game.seed2 ?? '?'}`)
  }

  // Records — use getRecordAsOfGame so it matches the game page header exactly
  const r1 = getRecordAsOfGame(dynasty, game, game.team1Tid)
  const r2 = getRecordAsOfGame(dynasty, game, game.team2Tid)
  const recStr1 = [r1.overall, r1.conference && r1.conference !== '0-0' ? `(${r1.conference} conf)` : ''].filter(Boolean).join(' ')
  const recStr2 = [r2.overall, r2.conference && r2.conference !== '0-0' ? `(${r2.conference} conf)` : ''].filter(Boolean).join(' ')
  if (recStr1 || recStr2) {
    lines.push(`RECORDS: ${t1.abbr} ${recStr1 || '—'} | ${t2.abbr} ${recStr2 || '—'}`)
  }

  // Team ratings
  if (game.team1Overall || game.team2Overall) {
    const r1 = [`${game.team1Overall ?? '?'} OVR`, game.team1Offense && `${game.team1Offense} OFF`, game.team1Defense && `${game.team1Defense} DEF`].filter(Boolean).join(' / ')
    const r2 = [`${game.team2Overall ?? '?'} OVR`, game.team2Offense && `${game.team2Offense} OFF`, game.team2Defense && `${game.team2Defense} DEF`].filter(Boolean).join(' / ')
    lines.push(`TEAM RATINGS: ${t1.abbr} ${r1} | ${t2.abbr} ${r2}`)
  }

  // Head coaches
  const hc1 = getHCName(dynasty, game.team1Tid, game.year)
  const hc2 = getHCName(dynasty, game.team2Tid, game.year)
  if (hc1 || hc2) {
    lines.push(`HEAD COACHES: ${t1.abbr} — ${hc1 || 'Unknown'} | ${t2.abbr} — ${hc2 || 'Unknown'}`)
  }

  // Quarter scores
  const qLines = formatQuarterScores(game, t1.abbr, t2.abbr)
  if (qLines) {
    lines.push('', 'SCORING BY QUARTER:', ...qLines)
  }

  // Players of the week
  const pows = [
    game.conferencePOW && `Conference Offense: ${game.conferencePOW}`,
    game.confDefensePOW && `Conference Defense: ${game.confDefensePOW}`,
    game.nationalPOW && `National Offense: ${game.nationalPOW}`,
    game.natlDefensePOW && `National Defense: ${game.natlDefensePOW}`,
  ].filter(Boolean)
  if (pows.length) {
    lines.push('', 'PLAYERS OF THE WEEK:', ...pows.map(p => `  ${p}`))
  }

  // AI recap and user notes — give the AI narrative context
  if (game.aiRecap?.trim()) {
    lines.push('', 'GAME RECAP:', game.aiRecap.trim())
  }
  if (game.gameNote?.trim()) {
    lines.push('', 'GAME NOTES:', game.gameNote.trim())
  }

  // Box score: player stats, team totals, scoring plays
  const bs = canonicalBoxScore(game, dynasty?.teams)
  if (bs) {
    for (const [tid, label] of [[game.team1Tid, t1.name], [game.team2Tid, t2.name]]) {
      const entry = bs.byTid?.[tid] ?? bs.byTid?.[String(tid)]
      const players = formatPlayerRows(entry)
      if (players.length) lines.push('', `${label} player stats:`, ...players)
      const ts = dumpTeamStats(bs.teamStatsByTid?.[tid] ?? bs.teamStatsByTid?.[String(tid)])
      if (ts) lines.push(`${label} team totals: ${ts}`)
    }
    const scoring = formatScoringPlays(bs.scoringSummary)
    if (scoring.length) lines.push('', 'Scoring:', ...scoring)
  }

  return lines.join('\n')
}

/** Tag map for a single game's posts (parser reproduces this). */
export function gameSocialTagMap(game) {
  return { G1: game?.id ?? null }
}

/**
 * The reusable per-game social section: deep game data + roster + the
 * cfb-social output contract (scope always G1). Embedded into the game recap
 * prompt and used by the standalone game social prompt.
 */
export function buildGameSocialSection(dynasty, game, count = 8) {
  const platform = { ...DEFAULT_SOCIAL_PLATFORM, ...(dynasty?.socialPlatform || {}) }
  const charactersById = getEffectiveCharacters(dynasty)
  const post = platform.postNoun || 'post'
  const t1 = teamLabel(dynasty, game.team1Tid, game.team1)
  const t2 = teamLabel(dynasty, game.team2Tid, game.team2)

  const teamRosterLines = []
  for (const [tid, name, abbr] of [[game.team1Tid, t1.name, t1.abbr], [game.team2Tid, t2.name, t2.abbr]]) {
    const accounts = charsForTeam(charactersById, Number(tid)).sort(byPostPriority)
    if (accounts.length) for (const c of accounts) teamRosterLines.push(`${rosterLine(c)} [${abbr}]`)
    else teamRosterLines.push(`(no listed ${name} accounts — post as beat:${abbr} or fan:${abbr})`)
  }
  const nationalLines = nationalSample(charactersById, NATIONAL_SAMPLE_SIZE).map(rosterLine).join('\n')

  return `═══════════════════════════════════════════════════════════
SOCIAL POSTS — a SECOND output block
═══════════════════════════════════════════════════════════
These are posts on a mock social media platform similar to X/Twitter. Write in-character as the accounts below.
- Write ${count} ${post}s about this game. Mix the two teams' beat and fan accounts with a few national voices.
- ORDER OF POSTS: emit the team [Official] account(s) FIRST, then any [Real] accounts, then [Fictional] accounts. The very first ${post} must be from an official team account whenever one is listed below.
- DIG INTO THE DETAIL: pull from every section of GAME DATA — the score, records, team ratings, coaches, quarter-by-quarter flow, player stats, scoring drives, and any recap/notes provided. The richer your references, the better.
- Calibrate tone to the game type and stakes: bowl games / CFP rounds / conference championships warrant urgency and national attention; regular season blowouts produce frustration or swagger; close finishes produce disbelief and drama.
- Match each account's personality. Vary tone and length; keep each ${post} realistic. Invent nothing outside the data provided.

Each account below is tagged [Official] (a team's verified athletics account), [Real] (a real-world person/brand), or [Fictional] (a made-up universe account). Emit posts in that priority order: Official first, then Real, then Fictional.

GAME DATA:
${gameDataBlock(dynasty, game)}

NATIONAL VOICES (reference by @handle; write in their personality):
${nationalLines || '(none provided)'}

TEAM ACCOUNTS (reference by @handle, or beat:<ABBR> / fan:<ABBR>):
${teamRosterLines.join('\n')}

SOCIAL OUTPUT — a separate fenced block, one ${post} per line, exactly:
\`\`\`cfb-social
G1 | @SomeHandle | the post text here
G1 | beat:${t1.abbr} | another post about the game
\`\`\`
LINE GRAMMAR: <scope> | <author> | <text>
- scope: always G1 (every ${post} is about this game).
- author: an @handle from the lists above, OR beat:<ABBR> / fan:<ABBR> using ${t1.abbr} or ${t2.abbr}.
- text: the ${post}; everything after the second | is the text.
One ${post} per line. No numbering, no commentary inside the block.`
}

/**
 * Standalone deep-dive social prompt for ONE game (game social modal).
 * Returns { prompt, gameTagMap }.
 */
export function buildGameSocialPrompt(dynasty, game, { count = 8 } = {}) {
  const wkDisp = weekDisplay(game?.year, game?.week)
  const gtLabel = game ? gameTypeLabel(game) : ''
  const ctx = [wkDisp, gtLabel].filter(Boolean).join(' — ')
  const prompt = `You are generating posts for a mock social media platform (similar to X/Twitter) about ONE college football game${ctx ? ` (${ctx})` : ''}. Use the week number and game type in GAME DATA to calibrate tone — early season is opener energy, late regular season is conference crunch time, bowl/CFP games are high-stakes elimination pressure.

${buildGameSocialSection(dynasty, game, count)}

Output ONLY the cfb-social fenced block. No preamble, no commentary.`
  return { prompt, gameTagMap: gameSocialTagMap(game) }
}

/**
 * Standalone social prompt for the heavy-run fallback button.
 * Returns { prompt, gameTagMap, gameCount }.
 */
export function buildSocialPrompt(dynasty, year, week) {
  const { section, gameTagMap, gameCount } = buildSocialSection(dynasty, year, week)
  const prompt = `You are generating posts for a mock social media platform (similar to X/Twitter) reacting to a week of college football results.

${section}

Output ONLY the cfb-social fenced block above. No preamble, no commentary.`
  return { prompt, gameTagMap, gameCount }
}
