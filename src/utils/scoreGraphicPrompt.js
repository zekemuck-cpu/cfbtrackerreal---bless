import { getTeamBrandProfile } from '../data/teamBrandProfiles'

/**
 * Build a professional-grade AI image prompt for a post-game social media graphic.
 * Designed to produce graphics that match what a real athletic department social
 * media team would post — not a generic "split design."
 *
 * Only the featured team's branding is described in detail. The opponent is
 * score data only.
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
  // Resolve which side is featured vs opponent
  const featuredName   = featuredTeam === 2 ? team2Name   : team1Name
  const featuredScore  = featuredTeam === 2 ? team2Score  : team1Score
  const featuredRank   = featuredTeam === 2 ? team2Rank   : team1Rank
  const featuredRecord = featuredTeam === 2 ? team2Record : team1Record
  const featuredColors = featuredTeam === 2 ? team2Colors : team1Colors

  const oppName   = featuredTeam === 2 ? team1Name   : team2Name
  const oppScore  = featuredTeam === 2 ? team1Score  : team2Score
  const oppRank   = featuredTeam === 2 ? team1Rank   : team2Rank

  const sf = featuredScore ?? ''
  const so = oppScore ?? ''
  const won  = Number(sf) > Number(so)
  const tied = Number(sf) === Number(so)

  const rankLabel    = featuredRank ? `#${featuredRank} ` : 'Unranked '
  const oppRankLabel = oppRank      ? `#${oppRank} `      : ''

  // Brand profile for featured team only
  const profile = getTeamBrandProfile(featuredName)
  const primary    = profile?.primaryHex   || featuredColors?.primary   || '#333'
  const secondary  = profile?.secondaryHex || featuredColors?.secondary || '#fff'
  const tertiary   = profile?.tertiaryHex  || null
  const primaryPMS = profile?.primaryPMS   || null

  // Build visual era direction
  const eraMap = {
    'classic/traditional': 'clean, bold, and timeless — no gimmicks, no gradients, no chrome effects',
    'modern/athletic': 'dynamic, high-energy — strong diagonals or geometric shapes, deep shadows',
    'flashy/Nike-era': 'bold contrast, energetic — swooping shapes, layered textures, intense color',
    'military/clean': 'disciplined, precise — geometric, sharp edges, controlled palette',
    'retro': 'vintage-inspired — aged texture, classic lettering, warm tones',
  }
  const eraDirection = eraMap[profile?.visualEra] || 'bold, professional, and clean'

  // Motifs as abstract design elements (not literal illustrations)
  const motifLine = profile?.motifs?.length
    ? `Abstract design elements drawn from ${featuredName}'s signature motifs: ${profile.motifs.join(', ')} — use as geometry, texture, or pattern, NOT as literal illustrations.`
    : ''

  // Win/loss text
  const resultText = won ? `${profile?.shortNickname || featuredName.split(' ').pop()} WIN` : tied ? 'FINAL — TIE' : 'FINAL'

  // Screenshot reference line
  const screenshotLine = screenshotCount > 0
    ? `\nREFERENCE IMAGES: The user is attaching ${screenshotCount} in-game screenshot${screenshotCount > 1 ? 's' : ''} alongside this prompt. Use them for atmospheric context — field lighting, color mood — but do NOT incorporate player photos into the graphic design.`
    : ''

  const lines = [
    `Create a post-game social media graphic for ${featuredName}'s official accounts. Design it exactly as their athletic department's social media team would post within minutes of the final whistle — polished, on-brand, and immediately shareable. This is a ${featuredName} graphic. Their brand is the entire canvas.`,
    screenshotLine,
    ``,
    `═══ RESULT ═══`,
    `${rankLabel}${featuredName}${featuredRecord ? ` (${featuredRecord})` : ''}: ${sf}`,
    `${oppRankLabel}${oppName}${': '}${so}`,
    `Game: ${gameLabel}${year ? ` — ${year} season` : ''}`,
    ``,
    `═══ ${featuredName.toUpperCase()} BRAND ═══`,
    `Primary: ${primaryPMS ? `${primaryPMS} = ` : ''}${primary}`,
    `Secondary: ${secondary}${tertiary ? ` · Accent: ${tertiary}` : ''}`,
    profile?.wordmarkStyle ? `Wordmark: ${profile.wordmarkStyle}` : null,
    motifLine || null,
    profile?.graphicNotes ? `Art direction: ${profile.graphicNotes}` : null,
    ``,
    `═══ DESIGN BRIEF ═══`,
    `This is ${eraDirection}.`,
    ``,
    `Background: Deep ${primary} — the primary color fills the canvas. Use subtle texture, grain, or a tight vignette that matches the team's visual era. No generic sports backgrounds.`,
    ``,
    `Hero element: The ${featuredName} wordmark or primary logo — dominant, centered or boldly off-center. This is the FIRST thing the eye lands on.`,
    ``,
    `Score presentation:`,
    `  • "${resultText}" — large, bold, highest-contrast element after the logo`,
    `  • "${sf}" in massive numerals (${secondary} or white)`,
    `  • "def. ${oppName} ${so}" in smaller, secondary type`,
    `  • "${gameLabel}${year ? ` · ${year}` : ''}" as a clean subheader`,
    featuredRecord ? `  • "${rankLabel.trim()}${featuredRecord ? ` · ${featuredRecord}` : ''}" as small stat text` : null,
    ``,
    `Typography: Locked to the team's brand fonts (${profile?.wordmarkStyle ? profile.wordmarkStyle.split('.')[0] : 'bold collegiate block'}). All caps where appropriate. No script, no decorative fonts.`,
    ``,
    `Absolute rules:`,
    `  • NO helmet illustrations or equipment`,
    `  • NO player photos or crowd imagery`,
    `  • NO split-team "vs" layout — this is ${featuredName}'s graphic, not a matchup card`,
    `  • NO generic stock-photo athlete silhouettes`,
    `  • NO gradients that don't belong to the team's palette`,
    ``,
    `Output: 1080×1080 square (or 1080×1350 portrait). Ready to post.`,
  ]

  return lines.filter(l => l !== null).join('\n')
}
