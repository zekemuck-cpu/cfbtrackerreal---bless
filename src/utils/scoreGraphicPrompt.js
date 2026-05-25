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

  const resultLabel = won  ? `${shortName.toUpperCase()} WIN!`
                    : tied ? 'FINAL — TIE'
                    :        'FINAL'

  const motifLine = profile?.motifs?.length
    ? `Signature design motifs (geometric/abstract use only): ${profile.motifs.join(', ')}.`
    : ''

  // ─── LAYOUT OPTIONS ──────────────────────────────────────────────────────

  const photoLayouts = `IF IMAGES ARE ATTACHED — use one of these layouts (your choice, pick what looks best):

  A) Full-bleed photo + solid rounded card at bottom (~40% canvas) — card holds the score info
  B) Full-bleed photo + narrow strip at very bottom — compressed score, minimal
  C) Photo top half + solid ${primary} panel bottom half, hard horizon cut
  D) Full-bleed photo that dissolves via gradient into ${primary} at the bottom — score lives in that zone
  E) Full-bleed photo + diagonal ${primary} band cutting across the lower canvas
  F) Full-bleed photo with a large ghost/watermark logo faded into it, minimal score strip at bottom

  Keep the photo NATURAL — no heavy color grade over the whole image. The photo is the hero.`

  const graphicLayouts = `IF NO IMAGES ARE ATTACHED — use one of these pure-graphic layouts (your choice):

  G) Bold team-color field — score numbers set huge in the center, typography IS the design
  H) Two-tone split field — ${primary} and ${secondary} divided diagonally or horizontally
  I) Large centered team logo as the hero, score panel below it
  J) Team-color field with a subtle repeating geometric texture${motifLine ? ` (${profile.motifs.join(', ')})` : ''}
  K) Deep dark-to-${primary} gradient, cinematic and atmospheric${tertiary ? `, with a ${tertiary} accent glow` : ''}
  L) Near-black background, bold ${secondary} accent bar cutting across canvas, score below

  No generated photos, no athletes. Pure color, geometry, and type — but premium and intentional.`

  const lines = [
    `Create a post-game social media graphic for ${featuredName}'s official Instagram/Twitter account.`,
    ``,
    `TARGET: Clean, professional post-game social graphic. Score info in a dedicated zone. Team logos flank their scores. Score numbers are the biggest elements. Feels like it was designed by the real athletic communications staff.`,
    ``,
    `RESULT`,
    `${rankLabel}${featuredName}${featuredRecord ? ` (${featuredRecord})` : ''}:  ${sf}`,
    `${oppRankLabel}${oppName}${oppRecord ? ` (${oppRecord})` : ''}:  ${so}`,
    `${gameLabel}${year ? ` · ${year} Season` : ''}`,
    `"${resultLabel}"`,
    ``,
    `BRAND — ${featuredName.toUpperCase()}`,
    `Primary: ${primaryPMS ? `${primaryPMS} / ` : ''}${primary}`,
    `Secondary: ${secondary}${tertiary ? ` · Accent: ${tertiary}` : ''}`,
    profile?.wordmarkStyle ? `Wordmark: ${profile.wordmarkStyle}` : null,
    profile?.graphicNotes  ? `Art direction: ${profile.graphicNotes}` : null,
    motifLine || null,
    ``,
    photoLayouts,
    ``,
    graphicLayouts,
    ``,
    `DO NOT: split-card matchup layout, helmet illustrations, athlete clip art, heavy color tint over the whole photo, giant "WIN" text dominating the middle of the canvas, generic templates.`,
    ``,
    `Output: 1080×1080 square.`,
  ]

  return lines.filter(l => l !== null && l !== undefined).join('\n')
}
