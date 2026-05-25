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

  // ─── SCORE BAR / LAYOUT OPTIONS ───────────────────────────────────────────
  // Multiple professional layout patterns — AI picks the one that best fits
  // the photo composition and team brand. All use the same score element:
  //   [featured logo]  SF  ·  FINAL  ·  SO  [opp logo]

  const scoreBarSection = `LAYOUT — choose ONE of the following six production-proven options. Pick the one that best flatters the photo and feels authentic to ${featuredName}'s brand. All six look incredible when executed cleanly.

────────────────────────────────────────
OPTION A — Narrow bottom strip  (Alabama / Oregon style)
────────────────────────────────────────
Full-bleed photo edge-to-edge. A single horizontal bar pinned to the very bottom of the canvas, roughly 130–160 px tall. Bar background: ${primary} or a very dark near-black.
Centered inside the bar:
  [${featuredName} logo]  ${sf}  ·  FINAL  ·  ${so}  [${oppName} logo]
Team names in tiny all-caps directly below each logo. Thin ${secondary} hairline rules above and below the score row. "FINAL" or "${finalLabel}" is small, centered, restrained. Featured team's logo is 1.2× the opponent's.

────────────────────────────────────────
OPTION B — Solid color panel  (Arizona / split-field style)
────────────────────────────────────────
Photo occupies the top 58–65% of the canvas. A flat solid ${primary} panel anchors the bottom 35–42%. No fade — a crisp horizon line between photo and panel.
Centered in the panel:
  [${featuredName} logo]  ${sf}  ·  FINAL  ·  ${so}  [${oppName} logo]
Team names and optional record in small all-caps below each logo. ${secondary} rule lines and wordmark or slogan at very bottom edge of panel.

────────────────────────────────────────
OPTION C — Gradient fade into team color  (modern Nike-era style)
────────────────────────────────────────
Full-bleed photo. Starting about 55% down the canvas, the photo smoothly fades into a deep solid ${primary} field at the bottom — like the image is dissolving into the brand color. The score bar lives in this ${primary} zone, roughly 200–240 px tall.
  [${featuredName} logo]  ${sf}  ·  FINAL  ·  ${so}  [${oppName} logo]
No hard edge between photo and score zone — the fade IS the design. Thin ${secondary} rule lines. Featured team logo is dominant.

────────────────────────────────────────
OPTION D — Frosted glass score card  (Louisville / premium overlay style)
────────────────────────────────────────
Full-bleed photo. A frosted-glass or semi-transparent panel (${primary} at ~75–80% opacity, with a soft gaussian blur effect so the photo behind it is hazy but visible) is anchored to the bottom third. The panel has slightly rounded top corners — feels premium, editorial, modern.
Inside the frosted panel, centered:
  [${featuredName} logo]  ${sf}  ·  FINAL  ·  ${so}  [${oppName} logo]
Thin white or ${secondary} inner border on the panel. Team names below logos. "${finalLabel}" above the score row in small all-caps.

────────────────────────────────────────
OPTION E — Diagonal color sweep  (dynamic / action style)
────────────────────────────────────────
Full-bleed photo. A bold diagonal band of ${primary} sweeps across the lower-left to lower-right, covering roughly the bottom 30% of the canvas but with a sharp 8–12° angled top edge rather than a horizontal cut. The score lives in this diagonal band.
  [${featuredName} logo]  ${sf}  ·  FINAL  ·  ${so}  [${oppName} logo]
The diagonal edge is crisp and decisive — not feathered. ${secondary} thin rule lines follow the angle. Featured team's logo sits above and slightly outside the band on the left. Feels like motion and energy.

────────────────────────────────────────
OPTION F — Oversized watermark logo + minimal score corner  (clean minimalist style)
────────────────────────────────────────
Full-bleed photo. A very large ${featuredName} primary logo or wordmark is placed center or center-left, at 25–35% opacity — a ghost/watermark layer that sits between the photo and any overlaid text. It reads as texture, not a solid logo.
Score lives in a narrow bottom strip (Option A style) or a small floating pill/badge centered in the lower third:
  ${sf}  ·  FINAL  ·  ${so}
with small team abbreviations or logos flanking the numbers. Sparse, editorial, high-fashion-sports aesthetic. Thin ${secondary} rules. "${finalLabel}" in very small tracking-heavy caps above the pill.

────────────────────────────────────────
Whichever option you choose: execute it with precision. Align everything to a grid. Keep the score zone uncluttered. The photo does the emotional work — the score bar/panel does the information work. They should not compete.`

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
