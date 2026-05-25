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

  // ─── LAYOUT OPTIONS ────────────────────────────────────────────────────────
  // Split into two tracks: WITH photo attached, and WITHOUT photo.
  // Each track has multiple production-grade options.

  const layoutSection = `═══════════════════════════════════════════════
IF IMAGES ARE ATTACHED TO THIS PROMPT — use one of these photo-based layouts:
═══════════════════════════════════════════════
Use the most dramatic single frame as the background. Keep the photo NATURAL — do NOT apply a heavy color tint across the whole image. The photo is the hero. Choose ONE layout:

────────────────────────────────────────
PHOTO OPTION A — Narrow bottom strip
────────────────────────────────────────
Full-bleed photo edge-to-edge. A single horizontal bar pinned to the very bottom, roughly 140–170 px tall. Bar fill: ${primary} or near-black.
Centered inside:  [${featuredName} logo]  ${sf}  ·  FINAL  ·  ${so}  [${oppName} logo]
Team names in tiny all-caps below each logo. Thin ${secondary} hairline rules above and below the score row. "${finalLabel}" centered and restrained. Featured team logo 1.2× the opponent's.

────────────────────────────────────────
PHOTO OPTION B — Solid color panel
────────────────────────────────────────
Photo fills the top 58–65%. A flat solid ${primary} panel anchors the bottom 35–42% — crisp horizon line, no fade.
In the panel:  [${featuredName} logo]  ${sf}  ·  FINAL  ·  ${so}  [${oppName} logo]
Team names + optional record in small all-caps below logos. ${secondary} rule lines. Wordmark or slogan at the very bottom edge.

────────────────────────────────────────
PHOTO OPTION C — Gradient fade into team color
────────────────────────────────────────
Full-bleed photo. From ~55% down, the photo dissolves into solid ${primary} at the bottom. Score lives in the ${primary} zone (~220 px tall).
  [${featuredName} logo]  ${sf}  ·  FINAL  ·  ${so}  [${oppName} logo]
No hard edge — the gradient IS the design. Thin ${secondary} rule lines.

────────────────────────────────────────
PHOTO OPTION D — Frosted glass score card
────────────────────────────────────────
Full-bleed photo. A frosted-glass panel (${primary} at ~78% opacity, backdrop blur so the photo behind is hazy) anchored to the bottom third. Slightly rounded top corners — premium, editorial.
Inside the frosted panel:  [${featuredName} logo]  ${sf}  ·  FINAL  ·  ${so}  [${oppName} logo]
Thin ${secondary} inner border. "${finalLabel}" above the score in small all-caps.

────────────────────────────────────────
PHOTO OPTION E — Diagonal color sweep
────────────────────────────────────────
Full-bleed photo. A bold ${primary} diagonal band covers the lower ~30% of the canvas, with a sharp 8–12° angled top edge (not a horizontal cut). Score lives in the band.
  [${featuredName} logo]  ${sf}  ·  FINAL  ·  ${so}  [${oppName} logo]
Crisp diagonal edge — not feathered. ${secondary} rule lines follow the angle. Feels like motion.

────────────────────────────────────────
PHOTO OPTION F — Ghost watermark + minimal score
────────────────────────────────────────
Full-bleed photo. A very large ${featuredName} logo/wordmark centered at 25–30% opacity — a ghost watermark between photo and text layers.
Score in a narrow bottom strip:  ${sf}  ·  FINAL  ·  ${so}  with small logos flanking. Sparse, editorial. "${finalLabel}" in tiny tracking-heavy caps above the pill.

═══════════════════════════════════════════════
IF NO IMAGES ARE ATTACHED — use one of these graphic-design-only layouts:
═══════════════════════════════════════════════
Do NOT generate photorealistic imagery or athlete illustrations. The design is pure typography, color, and geometry — and should look intentional and premium, not like a fallback. Choose ONE layout:

────────────────────────────────────────
GRAPHIC OPTION G — Bold type on team color
────────────────────────────────────────
Full canvas: flat ${primary} background with subtle grain texture.
The score numbers ARE the hero — ${sf} and ${so} set massive (400–500 px), bold, stacked vertically or side-by-side in the center of the canvas in ${secondary}. Between them, a thin ${secondary} rule and small "FINAL" or "${finalLabel}" text.
Below the scores: [${featuredName} logo] and [${oppName} logo] flanking their respective numbers, small and precise.
Top of canvas: "${rankLabel.trim() ? rankLabel.trim() + ' ' : ''}${featuredName}" in small all-caps tracking-heavy caps.
Bottom of canvas: "${gameLabel}" and "${featuredStatLine}" in tiny caption text. ${secondary} hairline rules top and bottom.
This is pure type-and-color design — bold, confident, no photography needed.

────────────────────────────────────────
GRAPHIC OPTION H — Dual color field split
────────────────────────────────────────
Canvas split diagonally or horizontally: ${primary} on the dominant portion (about 65%), ${secondary} on the smaller portion (35%). Crisp edge between the two fields.
The ${featuredName} primary logo sits large (300–350 px) at the center-top of the ${primary} zone.
Score bar horizontally centered near the bottom, crossing the color boundary:
  [${featuredName} logo]  ${sf}  ·  FINAL  ·  ${so}  [${oppName} logo]
The split color field creates natural contrast for the score. "${finalLabel}" in small all-caps above the score. Feels like a premium printed poster.

────────────────────────────────────────
GRAPHIC OPTION I — Centered logo hero
────────────────────────────────────────
Full canvas: flat ${primary}. The ${featuredName} primary logo or wordmark is placed large and centered (500–600 px), positioned in the upper 55% of the canvas. Below it, a thin ${secondary} rule, then the score block:
  [${featuredName} logo — small]  ${sf}  ·  FINAL  ·  ${so}  [${oppName} logo — small]
The big centered logo IS the visual, the scores sit subordinate below it. Bottom strip: "${gameLabel}" and "${featuredStatLine}" in caption text. This layout is confident and brand-forward.

────────────────────────────────────────
GRAPHIC OPTION J — Geometric pattern field
────────────────────────────────────────
Full canvas: ${primary} background with a bold geometric repeating pattern in ${secondary} at 8–15% opacity — think angular stripes, chevrons, or subtle grid lines (nothing literal or illustrative). The pattern fills the entire background as texture.
The ${featuredName} wordmark sits large at top center in ${secondary}.
Score centered in a clean ${primary} band (no pattern, slightly darker than background) across the lower third:
  [${featuredName} logo]  ${sf}  ·  FINAL  ·  ${so}  [${oppName} logo]
${secondary} hairline rules border the score band. Feels modern and designed with intention.

────────────────────────────────────────
GRAPHIC OPTION K — Dark atmosphere gradient
────────────────────────────────────────
Full canvas: deep rich gradient from near-black at the top to ${primary} in the middle to slightly lighter ${primary} at the bottom — like stadium lights in the dark.${tertiary ? ` A subtle ${tertiary} accent glow radiates from center.` : ''}
The ${featuredName} logo sits centered, upper half, large and luminous in ${secondary}.
Score block centered in the lower third:
  [${featuredName} logo]  ${sf}  ·  FINAL  ·  ${so}  [${oppName} logo]
Thin ${secondary} rules. "${finalLabel}" above the score in small glowing all-caps. Dramatic and cinematic without any photography.

────────────────────────────────────────
Whichever option you choose: execute it with precision. Align everything to a grid. Keep the score zone uncluttered. This should look hand-crafted by a professional sports design team, not auto-generated.`

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
    `TARGET AESTHETIC: Real FBS athletic department post-game graphics — not a template, not a matchup card. Clean, precise, on-brand. The score info lives in a dedicated zone (strip, panel, or band). Both team logos appear small and functional next to their score numbers. "FINAL" is restrained and centered. This is professional sports design.`,
    ``,
    `═══ RESULT ═══`,
    `${rankLabel}${featuredName}${featuredRecord ? ` (${featuredRecord})` : ''}:  ${sf}`,
    `${oppRankLabel}${oppName}${oppRecord ? ` (${oppRecord})` : ''}:  ${so}`,
    `${gameLabel}${year ? ` · ${year} season` : ''}`,
    ``,
    layoutSection,
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
