import { buildTeamStylePrompt } from '../data/teamBrandProfiles'

/**
 * Build an AI image-generation prompt for a college football final score graphic.
 *
 * @param {object} opts
 * @param {string}  opts.team1Name
 * @param {string|number} opts.team1Score
 * @param {string|number} [opts.team1Rank]
 * @param {string} [opts.team1Record]       - e.g. "3-0 (1-0)"
 * @param {{primary:string, secondary:string}} [opts.team1Colors]
 * @param {string}  opts.team2Name
 * @param {string|number} opts.team2Score
 * @param {string|number} [opts.team2Rank]
 * @param {string} [opts.team2Record]
 * @param {{primary:string, secondary:string}} [opts.team2Colors]
 * @param {string}  opts.gameLabel     - e.g. "Week 5", "Rose Bowl", "CFP National Championship"
 * @param {string|number} [opts.year]
 * @param {1|2} [opts.featuredTeam]    - which team's branding leads the design (default 1)
 * @returns {string}
 */
export function buildScoreGraphicPrompt({
  team1Name,
  team1Score,
  team1Rank,
  team1Record,
  team1Colors,
  team2Name,
  team2Score,
  team2Rank,
  team2Record,
  team2Colors,
  gameLabel,
  year,
  featuredTeam = 1,
}) {
  const s1 = team1Score ?? ''
  const s2 = team2Score ?? ''
  const r1 = team1Rank ? `#${team1Rank} ` : ''
  const r2 = team2Rank ? `#${team2Rank} ` : ''

  const winnerName =
    Number(s1) > Number(s2) ? team1Name
    : Number(s2) > Number(s1) ? team2Name
    : null

  const featuredName = featuredTeam === 2 ? team2Name : team1Name

  const style1 = buildTeamStylePrompt(team1Name, team1Colors)
  const style2 = buildTeamStylePrompt(team2Name, team2Colors)

  // Build score lines with rank + record
  const team1Line = `${r1}${team1Name}${team1Record ? ` (${team1Record})` : ''} — ${s1}`
  const team2Line = `${r2}${team2Name}${team2Record ? ` (${team2Record})` : ''} — ${s2}`

  const lines = [
    `College football final score graphic for social media (1080×1080 square or 1080×1350 portrait).`,
    `FEATURED TEAM: ${featuredName} — this team's branding leads the overall design.`,
    ``,
    `FINAL SCORE:`,
    `  ${team1Line}`,
    `  ${team2Line}`,
    `GAME: ${gameLabel}${year ? ` — ${year} season` : ''}`,
    winnerName ? `WINNER: ${winnerName}` : `RESULT: Tie`,
    ``,
    `${team1Name} brand:`,
    style1,
    ``,
    `${team2Name} brand:`,
    style2,
    ``,
    `Design direction: Split layout — each half uses that team's primary color as the dominant background. ${
      winnerName
        ? `${winnerName}'s side is brighter and more prominent; the losing side slightly darker/desaturated. `
        : `Equal split between both sides. `
    }${featuredName}'s branding and colors lead the overall aesthetic. Scores in oversized bold numerals — the dominant typographic element. Show rankings and records as subtext beneath each score. Game label shown as a subheader. Dark, cinematic sports aesthetic — think ESPN or Fox Sports postgame scorebug. No player photos or crowd imagery — pure graphic and typographic design. High contrast, readable at thumbnail size on mobile.`,
  ]

  return lines.join('\n')
}
