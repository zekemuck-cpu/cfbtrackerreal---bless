import { getTeamBrandProfile } from '../data/teamBrandProfiles'

/**
 * Build a professional-grade AI image prompt for a post-game social media graphic.
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
  screenshotCount = 0,
}) {
  const featuredName   = featuredTeam === 2 ? team2Name   : team1Name
  const featuredScore  = featuredTeam === 2 ? team2Score  : team1Score
  const featuredRank   = featuredTeam === 2 ? team2Rank   : team1Rank
  const featuredRecord = featuredTeam === 2 ? team2Record : team1Record
  const featuredColors = featuredTeam === 2 ? team2Colors : team1Colors

  const oppName   = featuredTeam === 2 ? team1Name   : team2Name
  const oppScore  = featuredTeam === 2 ? team1Score  : team2Score
  const oppRank   = featuredTeam === 2 ? team1Rank   : team2Rank
  const oppRecord = featuredTeam === 2 ? team1Record : team2Record

  const sf = featuredScore ?? ''
  const so = oppScore ?? ''
  const won  = Number(sf) > Number(so)
  const tied = Number(sf) === Number(so)

  const rankLabel    = featuredRank ? `#${featuredRank} ` : ''
  const oppRankLabel = oppRank ? `#${oppRank} ` : ''

  const profile    = getTeamBrandProfile(featuredName)
  const primary    = profile?.primaryHex   || featuredColors?.primary   || '#1a1a1a'
  const secondary  = profile?.secondaryHex || featuredColors?.secondary || '#ffffff'
  const tertiary   = profile?.tertiaryHex  || null
  const primaryPMS = profile?.primaryPMS   || null
  const shortName  = profile?.shortNickname || featuredName.split(' ').pop()

  const resultMood = won  ? 'This is a WIN — the graphic should feel confident, energized, and celebratory without being over the top.'
                  : tied ? 'This ended in a TIE — factual and composed.'
                  :        'This is a LOSS — clean and factual, not dramatic.'

  const motifLine = profile?.motifs?.length
    ? `The program is known for these design motifs (use abstractly if you incorporate texture or geometry): ${profile.motifs.join(', ')}.`
    : ''

  const photoLine = screenshotCount > 0
    ? `Images are attached — use them as the hero visual. Keep the photo natural; do not color-grade the entire image. The design elements should frame the photo, not fight it.`
    : `No images attached — build a pure graphic using color, typography, and shape. No generated photos, no illustrated athletes or helmets.`

  const lines = [
    `Design a post-game social media graphic (1080×1080) for ${featuredName}'s official account.`,
    ``,
    `You are the creative director for a top college football program's athletic communications team. This graphic will go live on the program's Instagram and Twitter within minutes of the final whistle. Make it feel like it came from a real D1 creative staff — not a template, not a generic sports graphic generator. Every layout and type choice should feel intentional and ownable by this program.`,
    ``,
    `RESULT`,
    `${rankLabel}${featuredName}${featuredRecord ? ` (${featuredRecord})` : ''}:  ${sf}`,
    `${oppRankLabel}${oppName}${oppRecord ? ` (${oppRecord})` : ''}:  ${so}`,
    `${gameLabel}${year ? ` · ${year} Season` : ''}`,
    ``,
    resultMood,
    ``,
    `BRAND`,
    `Primary color: ${primaryPMS ? `${primaryPMS} / ` : ''}${primary}`,
    `Secondary color: ${secondary}${tertiary ? ` · Accent: ${tertiary}` : ''}`,
    profile?.wordmarkStyle ? `Wordmark style: ${profile.wordmarkStyle}` : null,
    profile?.graphicNotes  ? `Art direction: ${profile.graphicNotes}` : null,
    motifLine || null,
    ``,
    photoLine,
    ``,
    `The score numbers should be the largest typographic element. Both team logos should appear near their respective scores. Everything else — layout, texture, composition, hierarchy — is your creative call.`,
  ]

  return lines.filter(l => l !== null && l !== undefined).join('\n')
}
