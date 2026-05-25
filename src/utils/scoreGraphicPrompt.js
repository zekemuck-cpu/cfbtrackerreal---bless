import { buildTeamStylePrompt } from '../data/teamBrandProfiles'

/**
 * Build an AI image-generation prompt for a college football final score graphic.
 *
 * @param {object} opts
 * @param {string}  opts.team1Name     - Full team name, e.g. "Alabama Crimson Tide"
 * @param {string|number} opts.team1Score
 * @param {string|number} [opts.team1Rank]
 * @param {{primary:string, secondary:string}} [opts.team1Colors]
 * @param {string}  opts.team2Name
 * @param {string|number} opts.team2Score
 * @param {string|number} [opts.team2Rank]
 * @param {{primary:string, secondary:string}} [opts.team2Colors]
 * @param {string}  opts.gameLabel     - e.g. "Week 5", "Rose Bowl", "CFP National Championship"
 * @param {string|number} [opts.year]
 * @returns {string}
 */
export function buildScoreGraphicPrompt({
  team1Name,
  team1Score,
  team1Rank,
  team1Colors,
  team2Name,
  team2Score,
  team2Rank,
  team2Colors,
  gameLabel,
  year,
}) {
  const s1 = team1Score ?? ''
  const s2 = team2Score ?? ''
  const r1 = team1Rank ? `#${team1Rank} ` : ''
  const r2 = team2Rank ? `#${team2Rank} ` : ''

  const winnerName =
    Number(s1) > Number(s2) ? team1Name
    : Number(s2) > Number(s1) ? team2Name
    : null

  const style1 = buildTeamStylePrompt(team1Name, team1Colors)
  const style2 = buildTeamStylePrompt(team2Name, team2Colors)

  const lines = [
    `College football final score graphic for social media (1080×1080 square or 1080×1350 portrait).`,
    ``,
    `SCORE: ${r1}${team1Name} ${s1}, ${r2}${team2Name} ${s2}`,
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
      winnerName ? `${winnerName}'s side is brighter and more prominent; the losing side slightly darker/desaturated. ` : `Equal split between both sides. `
    }Scores displayed in oversized bold numerals — the most dominant typographic element. Team names rendered in each team's official style (described above). Game label shown as a subheader. Dark, cinematic sports aesthetic — think ESPN or Fox Sports postgame scorebug. No player photos or crowd imagery — pure graphic and typographic design. High contrast, readable at thumbnail size on mobile.`,
  ]

  return lines.join('\n')
}
