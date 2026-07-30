import { getMascotName } from '../data/teams'
import { getTeamConference } from '../data/conferenceTeams'
import { getTeamRecord, getCustomConferencesForYear, isPlayerOnRoster } from '../context/DynastyContext'
import {
  FACTUAL_GUARDRAIL, CONFERENCE_GUARDRAIL, conferenceAlignmentBlock, teamDisplay,
} from './recapPrompts'
import { nationalSample, charsForTeam, rosterLine } from './socialPrompt'

// Standard 12-team CFP first round: seeds 1-4 get a bye straight to the
// quarterfinals; the other 8 teams play 5v12, 6v11, 7v10, 8v9 (same pairing
// CFPBracket.jsx renders — see its cfpfr1-4 slots).
const FIRST_ROUND_PAIRS = [[5, 12], [6, 11], [7, 10], [8, 9]]

// Length/depth tiers for the WHOLE preview (8 matchups + 4 bye teams) — the
// SAME 10 keys/labels/word targets as RECAP_DEPTH_OPTIONS (geminiService.js),
// per the user's explicit request to reuse that exact slider — just with
// directives rewritten for a 12-team bracket preview instead of one game.
export const PLAYOFF_PREVIEW_DEPTH_OPTIONS = [
  {
    key: 'scoreline',
    label: 'Scoreline',
    wordTarget: null,
    directive: 'For each of the 8 first-round matchups, write EXACTLY ONE sentence naming both teams and your pick. Then one final sentence naming the four bye teams. Nothing else — no analysis, no player names, no storyline section.',
  },
  {
    key: 'flash',
    label: 'Flash',
    wordTarget: '40–70',
    directive: 'Write 40-70 words total. Call out only the single most interesting first-round matchup with a one-line pick, then name the four bye teams in one sentence. This is a quick-hit teaser, not a full preview of every game.',
  },
  {
    key: 'brief',
    label: 'Brief',
    wordTarget: '80–120',
    directive: 'Write 80-120 words total. Give a one-line pick for each of the 8 first-round matchups, then one sentence naming the four bye teams.',
  },
  {
    key: 'short',
    label: 'Short',
    wordTarget: '150–220',
    directive: 'Write 150-220 words total. Cover each first-round matchup in one sentence (matchup + pick), then one shared sentence covering the four bye teams.',
  },
  {
    key: 'compact',
    label: 'Compact',
    wordTarget: '250–320',
    directive: 'Write 250-320 words total. Give each first-round matchup 1-2 sentences (the story + a pick), then one shared paragraph on the four bye teams.',
  },
  {
    key: 'standard',
    label: 'Standard',
    wordTarget: '350–450',
    directive: 'Write 350-450 words total. Give each first-round matchup a short paragraph (the story of the game, one player to watch from the roster data provided, and a prediction), then one shared paragraph covering all four bye teams.',
  },
  {
    key: 'developed',
    label: 'Developed',
    wordTarget: '500–650',
    directive: 'Write 500-650 words total. Give each first-round matchup a fuller paragraph (story, path to get here using the record/conference data provided, a player to watch, and a prediction with reasoning), then a shared section on the four bye teams\' cases as contenders.',
  },
  {
    key: 'full',
    label: 'Full story',
    wordTarget: '700–900',
    directive: 'Write 700-900 words total. Cover each first-round matchup with the story of the game, each team\'s path to get here, a player to watch, and a prediction with reasoning. Give each bye team 1-2 sentences on their contender case. Close with a short section on field-wide storylines.',
  },
  {
    key: 'longform',
    label: 'Long form',
    wordTarget: '1000–1300',
    directive: 'Write 1000-1300 words total. Give each first-round matchup a full breakdown (story, path to get here, players to watch, prediction with reasoning) and each bye team its own short paragraph on their case as a contender. Close with a section on field-wide storylines (best games, biggest sleepers, trendy pick to win it all).',
  },
  {
    key: 'epic',
    label: 'Epic',
    wordTarget: '1500+',
    directive: 'Write at least 1500 words, no upper limit. Give every first-round matchup and every bye team the full treatment: story of the game, path to get here, players to watch (from the roster data provided), and a prediction with reasoning — plus a full closing section on field-wide storylines. Use every piece of data provided.',
  },
]

// Real, verified roster data for one team — a QB, a top offensive skill
// player, and a top defender, each pulled straight from dynasty.players via
// isPlayerOnRoster (the same roster-membership check every other page in the
// app uses). This is the ONLY source of player names the prompt provides —
// without it the AI falls back on real-world knowledge (e.g. writing the
// actual real-life Nebraska QB instead of this dynasty's roster).
function topPlayersForTeam(dynasty, tid, year) {
  const yearNum = Number(year)
  const roster = (dynasty?.players || []).filter(p => isPlayerOnRoster(p, tid, yearNum, dynasty))
  const ovrOf = (p) => {
    const o = p.overallByYear?.[yearNum] ?? p.overallByYear?.[String(yearNum)] ?? p.overall
    return typeof o === 'number' ? o : -1
  }
  const classOf = (p) => p.classByYear?.[yearNum] ?? p.classByYear?.[String(yearNum)] ?? p.class ?? ''
  const byOvr = [...roster].sort((a, b) => ovrOf(b) - ovrOf(a))
  const pickBest = (positions) => byOvr.find(p => positions.includes(String(p.position || '').toUpperCase()))

  const qb = pickBest(['QB'])
  const skill = byOvr.find(p => ['HB', 'RB', 'WR', 'TE'].includes(String(p.position || '').toUpperCase()) && p !== qb)
  const defender = byOvr.find(p => ['DE', 'DT', 'EDGE', 'OLB', 'MLB', 'MIKE', 'WILL', 'SAM', 'LB', 'CB', 'FS', 'SS', 'S'].includes(String(p.position || '').toUpperCase()))

  const fmt = (p) => p ? `${p.name} (${p.position}, ${classOf(p)}${ovrOf(p) > 0 ? `, ${ovrOf(p)} OVR` : ''})` : null
  return [fmt(qb), fmt(skill), fmt(defender)].filter(Boolean)
}

function teamBlock(dynasty, tid, seed, year, customConfs) {
  const mascot = getMascotName(tid, dynasty?.teams)
  const name = teamDisplay(tid, mascot, dynasty)
  const record = getTeamRecord(dynasty, tid, year)
  const recordStr = record ? `${record.wins}-${record.losses}${record.confWins != null ? ` (${record.confWins}-${record.confLosses} conf)` : ''}` : 'record unavailable'
  const conf = getTeamConference(tid, customConfs, dynasty?.teams) || 'Independent'
  const players = topPlayersForTeam(dynasty, tid, year)
  const playerLine = players.length > 0 ? `Roster (ONLY players you may name for this team): ${players.join('; ')}` : 'No roster data available for this team — do not invent any player names for them.'
  return `#${seed} ${name} — ${recordStr}, ${conf}\n  ${playerLine}`
}

const PLAYOFF_OUTPUT_FORMAT = `
═══════════════════════════════════════════════════════════
OUTPUT FORMAT
═══════════════════════════════════════════════════════════
Wrap your ENTIRE response in a single fenced markdown block:

\`\`\`markdown
# (your preview here, using markdown headings, **bold**, and paragraphs)
\`\`\`

Do not include any text before the opening fence or after the closing fence — no preamble, no "Here's your preview:", no follow-up offer.

Inside the fence:
- Open with an H1 headline for the whole preview (e.g., "# Playoff Preview: Nebraska hosts a defensive slugfest, four contenders wait on a bye").
- Use H2 for each matchup and each bye team's section. CRITICAL: every heading must be on its own line with a blank line before it AND after it — never run a heading and body text together on the same line.
- Bold standout team and player names.
- No tables, no bullet-point lists longer than ~5 items.
- No emoji.

ABSOLUTELY FORBIDDEN inside the markdown block:
- ChatGPT/Claude citation markers like \`:contentReference[oaicite:0]{index=0}\`, \`[oaicite:N]\`, \`:contentReference\`, \`【...】\`, \`[1]\`, \`[2]\`, footnote-style references.
- Source attributions, "according to the data block", "the data shows", or any meta-commentary about where you got the facts.
- HTML tags of any kind.
- Curly-brace template variables, JSON fragments, or pseudo-code.
`

const PLAYOFF_OUTPUT_FORMAT_SOCIAL = `
═══════════════════════════════════════════════════════════
OUTPUT FORMAT — TWO FENCED BLOCKS REQUIRED
═══════════════════════════════════════════════════════════
Output EXACTLY two fenced blocks in the order below. No text before the first block, no text between the blocks, no text after the second block.

BLOCK 1 — the playoff preview:
\`\`\`markdown
# Your headline here
...preview prose using markdown headings, **bold**, and paragraphs...
\`\`\`

BLOCK 2 — social posts (instructions at the very end of this prompt):
\`\`\`cfb-social
N | @Handle | hype/anticipation post here
\`\`\`

Rules for BLOCK 1 (the preview):
- Open with an H1 headline for the whole preview. Use H2 for each matchup and bye team's section — every heading on its own line, blank line before and after.
- Bold standout team and player names. No tables, no long bullet lists, no emoji.

ABSOLUTELY FORBIDDEN inside BLOCK 1:
- Social-post pipe-separated lines ("N | @handle | text") — those belong ONLY in BLOCK 2.
- ChatGPT/Claude citation markers, source attributions, HTML tags, curly-brace template variables, JSON fragments, or pseudo-code.

BLOCK 1 ends when you write the closing \`\`\` fence. BLOCK 2 begins immediately after — same response, no gap. Every BLOCK 2 line MUST start with "N |" (these are pre-game hype/anticipation posts — there's no game result yet, so there is nothing to react to except the matchups themselves) and use ONLY the @handles listed in the ACCOUNTS section below — never invent a handle.
`

/**
 * Builds the copy/paste AI prompt for the "Generate Playoff Preview" task —
 * takes the 12 real seeded teams from this year's locked CFP bracket
 * (dynasty.cfpSeedsByYear[year]) plus each team's actual roster (so the AI
 * can only name real players from THIS dynasty, never real-world players),
 * and asks for a full playoff preview at the requested depth. Reuses the
 * same factual/conference guardrails as the Week Recap prompts verbatim.
 *
 * @param {object} dynasty
 * @param {number} year
 * @param {object} [opts]
 * @param {string} [opts.depth] - one of PLAYOFF_PREVIEW_DEPTH_OPTIONS keys (default 'standard')
 * @param {boolean} [opts.includeSocial] - also ask for a cfb-social block of hype posts
 * @param {object} [opts.charactersById] - dynasty's social universe (only needed when includeSocial)
 * @returns {string|null} null if the bracket isn't locked yet
 */
export function buildPlayoffPreviewPrompt(dynasty, year, opts = {}) {
  if (!dynasty) return null
  const yearNum = Number(year)
  const seeds = dynasty.cfpSeedsByYear?.[yearNum]
  if (!Array.isArray(seeds) || seeds.length < 12) return null

  const depthOpt = PLAYOFF_PREVIEW_DEPTH_OPTIONS.find(d => d.key === opts.depth) || PLAYOFF_PREVIEW_DEPTH_OPTIONS.find(d => d.key === 'standard')
  const customConfs = getCustomConferencesForYear(dynasty, yearNum)
  const bySeed = new Map(seeds.map(s => [Number(s.seed), Number(s.tid)]))

  const byes = [1, 2, 3, 4]
    .map(seed => bySeed.has(seed) ? teamBlock(dynasty, bySeed.get(seed), seed, yearNum, customConfs) : null)
    .filter(Boolean)

  const firstRound = FIRST_ROUND_PAIRS
    .map(([hi, lo]) => {
      if (!bySeed.has(hi) || !bySeed.has(lo)) return null
      const hiBlock = teamBlock(dynasty, bySeed.get(hi), hi, yearNum, customConfs)
      const loBlock = teamBlock(dynasty, bySeed.get(lo), lo, yearNum, customConfs)
      return `${hiBlock}\n  vs\n${loBlock}`
    })
    .filter(Boolean)

  const leagueName = dynasty.leagueName || 'the league'
  const confBlock = conferenceAlignmentBlock(dynasty, yearNum)

  let socialSection = ''
  if (opts.includeSocial && opts.charactersById) {
    const allTids = [...bySeed.values()]
    const teamAccounts = allTids.flatMap(tid => charsForTeam(opts.charactersById, tid)).slice(0, 24)
    const nationalAccounts = nationalSample(opts.charactersById, 20)
    const accountLines = [...teamAccounts, ...nationalAccounts].map(rosterLine).join('\n')
    const count = Number(opts.socialCount) > 0 ? Number(opts.socialCount) : 8
    socialSection = `

═══════════════════════════════════════════════════════════
SOCIAL POSTS — BLOCK 2 instructions
═══════════════════════════════════════════════════════════
Write exactly ${count} short pre-game hype/anticipation posts reacting to the bracket as a whole and to individual matchups — NOT to any result (nothing has been played yet). Use ONLY these accounts (never invent a handle):

ACCOUNTS:
${accountLines || '(no accounts available — write 0 posts)'}`
  }

  return `You are previewing the ${yearNum} College Football Playoff for ${leagueName} — a 12-team bracket. Write a complete playoff preview covering every first-round matchup and the four teams on a bye, using ONLY the real dynasty data below.
${FACTUAL_GUARDRAIL}
PLAYER NAMES — EXTRA HARD RULE FOR THIS PREVIEW:
Each team below lists its ONLY real players you may name (pulled straight from this dynasty's actual roster). Do NOT name any player who is not explicitly listed for that team, even if you recognize the name from real life or a prior season. A team playing in this dynasty may have a completely different roster than you'd expect — trust ONLY the Roster line under each team.
${CONFERENCE_GUARDRAIL}
${confBlock ? `CONFERENCE ALIGNMENT:\n${confBlock}\n` : ''}
═══════════════════════════════════════════════════════════
LENGTH / DEPTH DIRECTIVE — follow precisely
═══════════════════════════════════════════════════════════
${depthOpt.directive}
${opts.includeSocial ? PLAYOFF_OUTPUT_FORMAT_SOCIAL : PLAYOFF_OUTPUT_FORMAT}
${socialSection}

FIRST-ROUND MATCHUPS:
${firstRound.join('\n\n')}

FIRST-ROUND BYES (playing in the Quarterfinals):
${byes.join('\n')}
`
}
