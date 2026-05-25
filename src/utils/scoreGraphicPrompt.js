import { getTeamBrandProfile } from '../data/teamBrandProfiles'

/**
 * Build a professional-grade AI image prompt for a post-game social media graphic.
 *
 * The design model is: game action photograph (from attached screenshots OR
 * AI-generated) + heavy team-color overlay + bold score typography — exactly
 * the format used by real FBS athletic departments on Instagram/Twitter.
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
  // Resolve featured vs opponent
  const featuredName   = featuredTeam === 2 ? team2Name   : team1Name
  const featuredScore  = featuredTeam === 2 ? team2Score  : team1Score
  const featuredRank   = featuredTeam === 2 ? team2Rank   : team1Rank
  const featuredRecord = featuredTeam === 2 ? team2Record : team1Record
  const featuredColors = featuredTeam === 2 ? team2Colors : team1Colors

  const oppName  = featuredTeam === 2 ? team1Name  : team2Name
  const oppScore = featuredTeam === 2 ? team1Score : team2Score
  const oppRank  = featuredTeam === 2 ? team1Rank  : team2Rank

  const sf = featuredScore ?? ''
  const so = oppScore ?? ''
  const won  = Number(sf) > Number(so)
  const tied = Number(sf) === Number(so)

  const rankLabel    = featuredRank ? `#${featuredRank} ` : ''
  const oppRankLabel = oppRank ? `#${oppRank} ` : ''

  // Brand profile
  const profile    = getTeamBrandProfile(featuredName)
  const primary    = profile?.primaryHex   || featuredColors?.primary   || '#333'
  const secondary  = profile?.secondaryHex || featuredColors?.secondary || '#fff'
  const tertiary   = profile?.tertiaryHex  || null
  const primaryPMS = profile?.primaryPMS   || null

  // Era-specific texture/vignette guidance
  const eraTextureMap = {
    'classic/traditional': 'subtle worn-paper or linen grain — nothing digital or chrome',
    'modern/athletic':     'tight brushed-metal or carbon-fiber grain, deep shadow vignette',
    'flashy/Nike-era':     'sharp diagonal streaks of light, high-energy gradient vignette',
    'military/clean':      'clean matte surface, no texture — disciplined and precise',
    'retro':               'aged film grain, slight warmth, classic print feel',
  }
  const texture = eraTextureMap[profile?.visualEra] || 'subtle grain or noise'

  // Win text
  const shortName = profile?.shortNickname || featuredName.split(' ').pop()
  const winText = won ? `${shortName.toUpperCase()} WIN` : tied ? 'FINAL — TIE' : 'FINAL'

  // Motifs line (abstract use, not literal)
  const motifLine = profile?.motifs?.length
    ? `Signature design elements (use abstractly as geometric shapes, line work, or background texture — not as literal illustrations): ${profile.motifs.join(', ')}.`
    : ''

  // Record / rank subline
  const statsLine = [
    rankLabel ? rankLabel.trim() : 'Unranked',
    featuredRecord || null,
  ].filter(Boolean).join(' · ')

  // Photo layer direction
  const photoSection = screenshotCount > 0
    ? `GAME PHOTOS (${screenshotCount} screenshot${screenshotCount > 1 ? 's' : ''} attached):
The attached screenshots ARE the photographic foundation of this graphic. Select the most dramatic frame — a player mid-action, a key moment, a celebration. Use it as the full-bleed background layer. Apply a heavy ${primary} color grade overlay at roughly 60–70% opacity so the image reads as a deep ${primary} photograph, not a collage. The photo gives the graphic its authenticity and energy.`
    : `BACKGROUND PHOTO:
Generate a photorealistic game action scene: ${featuredName} players in ${profile?.homeJerseyColor || 'team-colored'} uniforms, stadium atmosphere, dramatic broadcast-style lighting. Apply a heavy ${primary} color grade overlay at 60–70% opacity. The result should feel like a cinematic game photograph in team colors — not a flat colored rectangle.`

  const lines = [
    `Create a post-game social media graphic for ${featuredName}'s official Instagram/Twitter.`,
    ``,
    `TARGET AESTHETIC: This should look exactly like what Alabama, Georgia, or Ohio State's social media teams post within minutes of the final whistle — a real game action photograph under a heavy team-color overlay, with bold score typography on top. Premium, polished, immediately shareable. Not a template. Not a split-card. Not clip art.`,
    ``,
    `═══ RESULT ═══`,
    `${rankLabel}${featuredName}${featuredRecord ? ` (${featuredRecord})` : ''}: ${sf}`,
    `${oppRankLabel}${oppName}: ${so}`,
    `${gameLabel}${year ? ` · ${year} season` : ''}`,
    ``,
    `═══ PHOTO LAYER ═══`,
    photoSection,
    ``,
    `═══ ${featuredName.toUpperCase()} BRAND ═══`,
    `Primary: ${primaryPMS ? `${primaryPMS} = ` : ''}${primary}`,
    `Secondary: ${secondary}${tertiary ? ` · Accent: ${tertiary}` : ''}`,
    profile?.wordmarkStyle ? `Wordmark/type: ${profile.wordmarkStyle}` : null,
    motifLine || null,
    profile?.graphicNotes ? `Critical art direction: ${profile.graphicNotes}` : null,
    ``,
    `═══ COMPOSITION (layer by layer) ═══`,
    `1. Full-bleed photo background with ${primary} color grade overlay (${texture})`,
    `2. ${featuredName} primary wordmark or logo — top-center or top-left, white, clean`,
    `3. "${winText}" — large bold all-caps, just above the score`,
    `4. "${sf}" — the biggest text element on the canvas, white or ${secondary}, massive weight`,
    `5. "def. ${oppRankLabel}${oppName} ${so}" — secondary type, smaller, lower contrast`,
    `6. "${gameLabel}${year ? ` · ${year}` : ''}" and "${statsLine}" — small clean caption at bottom`,
    `7. Subtle line work or geometric accent in ${secondary} — thin rules, corner marks, or score dividers`,
    ``,
    `Typography: All caps. Heaviest weights. Locked to ${featuredName}'s brand face — ${profile?.wordmarkStyle ? profile.wordmarkStyle.split('.')[0] : 'bold collegiate block'}. No script, no decorative fonts.`,
    ``,
    `DO NOT:`,
    `  • Do NOT use a flat color background with no photography`,
    `  • Do NOT draw literal helmet illustrations`,
    `  • Do NOT include the opponent's colors, logo, or branding`,
    `  • Do NOT make a split-team matchup card`,
    `  • Do NOT use generic athlete silhouette clip art`,
    ``,
    `Output: 1080×1080 square. Should be indistinguishable from an official ${featuredName} athletic department post.`,
  ]

  return lines.filter(l => l !== null).join('\n')
}
