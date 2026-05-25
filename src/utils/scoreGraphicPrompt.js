import { getTeamBrandProfile } from '../data/teamBrandProfiles'

/**
 * Build a professional-grade AI image prompt for a post-game social media graphic.
 *
 * Design model: real FBS athletic department Instagram/Twitter post-game graphics —
 * full-bleed natural game photo + clean score bar/panel at bottom with both team logos.
 * Reference examples: Alabama, Oregon, Arizona, Louisville post-game social graphics.
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

  // Brand profile — featured team only
  const profile    = getTeamBrandProfile(featuredName)
  const primary    = profile?.primaryHex   || featuredColors?.primary   || '#1a1a1a'
  const secondary  = profile?.secondaryHex || featuredColors?.secondary || '#ffffff'
  const tertiary   = profile?.tertiaryHex  || null
  const primaryPMS = profile?.primaryPMS   || null

  const shortName = profile?.shortNickname || featuredName.split(' ').pop()
  const winText   = won ? `${shortName.toUpperCase()} WIN` : tied ? 'FINAL — TIE' : 'FINAL'

  // Score bar label
  const finalLabel = won ? `${shortName.toUpperCase()} WIN!` : tied ? 'FINAL — TIE' : 'FINAL'

  // Stats / rank lines
  const featuredStatLine = [rankLabel.trim() || null, featuredRecord || null].filter(Boolean).join(' ')
  const oppStatLine      = [oppRankLabel.trim() || null, oppRecord || null].filter(Boolean).join(' ')

  // Motifs — abstract use only
  const motifLine = profile?.motifs?.length
    ? `Abstract design motifs for the score panel or background texture (geometric shapes/line work only — not literal illustrations): ${profile.motifs.join(', ')}.`
    : ''

  // ─── PHOTO / BACKGROUND LAYER ──────────────────────────────────────────────
  const photoSection = `BACKGROUND / PHOTO LAYER:
If game action images are attached to this prompt:
  - Use the most dramatic single frame as the full-bleed background photo (mid-play, a celebration, or a key moment).
  - Keep the photo NATURAL — do NOT apply a heavy color grade or tinted overlay across the whole image.
  - The photo should feel like a real sports photograph, rich and cinematic on its own.
  - The score bar at the bottom sits on top of the photo; the photo bleeds to all four edges.

If no images are attached:
  - Do NOT generate any photorealistic imagery or athlete illustrations.
  - Use a clean solid ${primary} background with subtle texture (slight grain or linen feel).
  - The composition is pure graphic and typographic design — the ${primary} field IS the background.`

  // ─── SCORE BAR LAYOUT ──────────────────────────────────────────────────────
  // Real examples use one of two patterns:
  // A) Narrow dark/team-color strip pinned to the very bottom (Alabama, Oregon style)
  // B) Solid color panel occupying the bottom 30–40% (Arizona style)
  // Both use: [logo] score · FINAL · score [logo] with team names below logos

  const scoreBarSection = `SCORE BAR (bottom of the graphic):
Pin a horizontal score bar to the very bottom of the 1080×1080 canvas. Use one of these two production-proven layouts:

OPTION A — Narrow strip (Alabama / Oregon style):
  A dark (${primary} or near-black) horizontal bar, roughly 130–160px tall, spanning the full width.
  Inside the bar, centered horizontally:
    [${featuredName} logo]  ${sf}  ·  FINAL  ·  ${so}  [${oppName} logo]
  Team names in small all-caps text directly below each logo.
  Thin ${secondary} rule lines above and below the score numbers. "FINAL" is small and centered between the two scores.
  The featured team's logo is slightly larger (1.15–1.3×) than the opponent's.

OPTION B — Solid color panel (Arizona style):
  A solid ${primary} panel occupying the bottom 35–40% of the canvas.
  Score layout centered in the panel:
    [${featuredName} logo]  ${sf}  ·  FINAL  ·  ${so}  [${oppName} logo]
  Team names and optional record in small all-caps below each logo.
  The photo fills only the top 60–65% of the canvas above this panel.

Choose whichever layout feels more natural for the photo composition.`

  // ─── TYPOGRAPHY ────────────────────────────────────────────────────────────
  const typographySection = `TYPOGRAPHY:
  - Score numbers (${sf} and ${so}) are the largest text elements — bold, all-caps, high contrast.
  - "FINAL" (or "${finalLabel}" if a win) is much smaller than the scores — secondary text, clean.
  - Team names below logos: small, all-caps, light weight.
  - Optional: "${rankLabel.trim() ? rankLabel.trim() + ' ' : ''}${featuredName}" or "${featuredStatLine}" as a small caption line in the score bar or at the very top edge.
  - Brand typeface: ${profile?.wordmarkStyle ? profile.wordmarkStyle.split('.')[0] : 'bold collegiate block, heaviest weight available'}.
  - No script fonts. No decorative display fonts. No drop shadows on body text.`

  // ─── BRAND ─────────────────────────────────────────────────────────────────
  const brandSection = `${featuredName.toUpperCase()} BRAND:
  Primary: ${primaryPMS ? `${primaryPMS} / ` : ''}${primary}
  Secondary: ${secondary}${tertiary ? ` · Accent: ${tertiary}` : ''}
  ${profile?.wordmarkStyle ? `Wordmark style: ${profile.wordmarkStyle}` : ''}
  ${motifLine}
  ${profile?.graphicNotes ? `Critical art direction: ${profile.graphicNotes}` : ''}`

  // ─── DO NOT ────────────────────────────────────────────────────────────────
  const doNotSection = `DO NOT:
  • Do NOT apply a heavy team-color tint or overlay across the entire photo — keep it natural
  • Do NOT place "WIN" text as a giant hero overlay spanning the middle of the image
  • Do NOT create a split matchup card with both teams sharing equal halves
  • Do NOT draw helmet illustrations or clip-art athlete silhouettes
  • Do NOT generate photorealistic imagery if no images are attached
  • Do NOT use generic template layouts — this should look hand-crafted by a professional sports design team`

  const lines = [
    `Create a post-game social media graphic for ${featuredName}'s official Instagram/Twitter account.`,
    ``,
    `TARGET AESTHETIC: Study how Alabama, Oregon, Arizona, and Louisville post their post-game score graphics — a real game action photograph with the score info in a clean panel or strip at the bottom. The photo is the hero. The score bar is precise and restrained. Both team logos appear small and functional next to their score. "FINAL" sits centered between the two scores. This is not a template. This is not a split-card. This is professional sports design.`,
    ``,
    `═══ RESULT ═══`,
    `${rankLabel}${featuredName}${featuredRecord ? ` (${featuredRecord})` : ''}:  ${sf}`,
    `${oppRankLabel}${oppName}${oppRecord ? ` (${oppRecord})` : ''}:  ${so}`,
    `${gameLabel}${year ? ` · ${year} season` : ''}`,
    ``,
    `═══ PHOTO / BACKGROUND ═══`,
    photoSection,
    ``,
    `═══ SCORE BAR ═══`,
    scoreBarSection,
    ``,
    `═══ TYPOGRAPHY ═══`,
    typographySection,
    ``,
    `═══ BRAND ═══`,
    brandSection,
    ``,
    doNotSection,
    ``,
    `Output: 1080×1080 square. Should be indistinguishable from what ${featuredName}'s official social media team posts within minutes of the final whistle.`,
  ]

  return lines.filter(l => l !== null).join('\n')
}
