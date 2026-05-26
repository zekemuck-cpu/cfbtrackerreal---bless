import { getTeamBrandProfile } from '../data/teamBrandProfiles'

/**
 * Build a professional-grade AI image prompt for a post-game social media graphic.
 * featuredTeam = 0 → neutral media-company style (both teams equal)
 * featuredTeam = 1 → team1's branded graphic
 * featuredTeam = 2 → team2's branded graphic
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
  homeTeam = null,
  screenshotCount = 0,
}) {
  // homeTeam = 1 → team1 is home, 2 → team2 is home, null → neutral site
  const homeSuffix  = (n) => homeTeam === n ? ' (HOME)' : homeTeam !== null ? ' (AWAY)' : ''
  const siteNote    = homeTeam === null ? 'Neutral site.' : null

  // ─── NEUTRAL / MEDIA-COMPANY GRAPHIC ────────────────────────────────────────
  if (featuredTeam === 0) {
    const rank1Label = team1Rank ? `#${team1Rank} ` : ''
    const rank2Label = team2Rank ? `#${team2Rank} ` : ''
    const s1 = team1Score ?? ''
    const s2 = team2Score ?? ''

    const p1 = getTeamBrandProfile(team1Name)
    const p2 = getTeamBrandProfile(team2Name)
    const color1 = p1?.primaryHex || team1Colors?.primary || '#1a1a1a'
    const color2 = p2?.primaryHex || team2Colors?.primary || '#1a1a1a'

    const photoLine = screenshotCount > 0
      ? `Images are attached — use them as the hero visual. Keep the photo natural; do not color-grade the entire image.`
      : `No images attached — build a pure graphic using color, typography, and shape. No generated photos, no illustrated athletes or helmets.`

    const lines = [
      `Design a post-game score graphic (1080×1080) in the style of a neutral sports media outlet — think ESPN, Fox Sports, or The Athletic — not either team's own branded post.`,
      ``,
      `You are a senior graphic designer at a major sports network. This graphic covers the final score for a national audience, so neither team gets visual priority. Both programs are represented equally in color, logo placement, and type weight. The design should feel authoritative, clean, and broadcast-quality.`,
      ``,
      `RESULT`,
      `${rank1Label}${team1Name}${team1Record ? ` (${team1Record})` : ''}${homeSuffix(1)}:  ${s1}`,
      `${rank2Label}${team2Name}${team2Record ? ` (${team2Record})` : ''}${homeSuffix(2)}:  ${s2}`,
      `${gameLabel}${year ? ` · ${year} Season` : ''}`,
      siteNote || null,
      ``,
      `TEAM COLORS (use both, balanced — neither team dominates)`,
      `${team1Name}: ${color1}`,
      `${team2Name}: ${color2}`,
      ``,
      photoLine,
      ``,
      `The score numbers should be the largest typographic element. Both team logos should appear near their respective scores, equal in size and visual weight. The two scores must read as a clear comparison — side by side or in an obvious visual relationship.`,
      homeTeam !== null ? `If you include a box score or quarter-by-quarter breakdown, list the AWAY team first and the HOME team second — standard sports convention.` : null,
      ``,
      `Do not use large standalone WIN / VICTORY / FINAL text as the dominant visual element.`,
      `Do not place either logo in a plain white or gray box — both teams should feel integrated into the design.`,
    ]

    return lines.filter(l => l !== null && l !== undefined).join('\n')
  }

  // ─── TEAM-BRANDED GRAPHIC ────────────────────────────────────────────────────
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

  const resultMood = won  ? 'This is a WIN — the graphic should feel confident, energized, and celebratory without being over the top.'
                  : tied ? 'This ended in a TIE — factual and composed.'
                  :        'This is a LOSS — clean and factual, not dramatic.'

  const motifLine = profile?.motifs?.length
    ? `The program is known for these design motifs (use abstractly if you incorporate texture or geometry): ${profile.motifs.join(', ')}.`
    : ''

  const photoLine = screenshotCount > 0
    ? `Images are attached — use them as the hero visual. Keep the photo natural; do not color-grade the entire image. The design elements should frame the photo, not fight it.`
    : `No images attached — build a pure graphic using color, typography, and shape. No generated photos, no illustrated athletes or helmets.`

  // Home/away labels for the featured team and opponent
  const featuredIsHome = (featuredTeam === 1 && homeTeam === 1) || (featuredTeam === 2 && homeTeam === 2)
  const featuredIsAway = (featuredTeam === 1 && homeTeam === 2) || (featuredTeam === 2 && homeTeam === 1)
  const featuredSiteTag = featuredIsHome ? ' (HOME)' : featuredIsAway ? ' (AWAY)' : ''
  const oppSiteTag      = featuredIsHome ? ' (AWAY)' : featuredIsAway ? ' (HOME)' : ''

  const lines = [
    `Design a post-game social media graphic (1080×1080) for ${featuredName}'s official account.`,
    ``,
    `You are the creative director employed by ${featuredName} — you work for this program, you know this brand inside and out, and this graphic goes live on the official ${featuredName} Instagram and Twitter within minutes of the final whistle. Make it feel like it came from this program's actual creative staff — not a template, not a generic sports graphic generator. Every layout and type choice should feel intentional and ownable by ${featuredName} specifically.`,
    ``,
    `RESULT`,
    `${rankLabel}${featuredName}${featuredRecord ? ` (${featuredRecord})` : ''}${featuredSiteTag}:  ${sf}`,
    `${oppRankLabel}${oppName}${oppRecord ? ` (${oppRecord})` : ''}${oppSiteTag}:  ${so}`,
    `${gameLabel}${year ? ` · ${year} Season` : ''}`,
    homeTeam === null ? 'Neutral site.' : null,
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
    `The score numbers should be the largest typographic element. Both team logos should appear near their respective scores. The two scores must read as a clear comparison at a glance — side by side, or in an obvious visual relationship. Everything else — layout, texture, composition, hierarchy — is your creative call.`,
    homeTeam !== null ? `If you include a box score or quarter-by-quarter breakdown, list the AWAY team first and the HOME team second — standard sports convention.` : null,
    ``,
    `Do not use large standalone WIN / VICTORY / FINAL text as the dominant visual element — the score and design should carry the result, not a word plastered across the canvas.`,
    ``,
    `Do not place the opponent's logo in a plain white or gray box — both teams should feel integrated into the design, not pasted in.`,
    ``,
    `Do not add university addresses, city names, or location footers (e.g. "Austin, Texas" or "The University of Texas") — the team name and logo carry the identity.`,
    ``,
    `Background textures, patterns, and decorative geometry should reflect ${featuredName}'s visual identity only. The opponent appears through their logo and score — do not incorporate their signature patterns or textures into the background or composition.`,
  ]

  return lines.filter(l => l !== null && l !== undefined).join('\n')
}
