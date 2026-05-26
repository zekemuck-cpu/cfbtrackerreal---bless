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
  // ─── Shared helpers ────────────────────────────────────────────────────────
  // Describe a team's primary logo for AI rendering. Prefers an explicit
  // logoDescription field; falls back to the helmet.logoMark; otherwise null.
  const describeLogo = (profile) => {
    if (!profile) return null
    if (profile.logoDescription) return profile.logoDescription
    if (profile.helmet?.logoMark) return profile.helmet.logoMark
    return null
  }

  // Build a compact opponent brand block — colors + logo description, with
  // graceful degradation when the profile is missing (teambuilder/FCS teams).
  const buildBrandSummary = (name, profile, fallbackColors, label = 'OPPONENT') => {
    const primary = profile?.primaryHex || fallbackColors?.primary
    const primaryPMS = profile?.primaryPMS
    const secondary = profile?.secondaryHex || fallbackColors?.secondary
    const logo = describeLogo(profile)
    const lines = [`${label} — ${name}`]
    if (primary) {
      lines.push(`Colors: primary ${primaryPMS ? `${primaryPMS} / ` : ''}${primary}${secondary ? `, secondary ${secondary}` : ''}.`)
    }
    if (logo) {
      lines.push(`Logo: ${logo}`)
    }
    return lines.length > 1 ? lines.join('\n') : null
  }

  // homeTeam = 1 → team1 is home, 2 → team2 is home, null → neutral site
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
    const logo1 = describeLogo(p1)
    const logo2 = describeLogo(p2)

    // Home/away as prose context, not inline labels
    const neutralSiteNote = homeTeam === null
      ? 'Neutral site.'
      : homeTeam === 1
      ? `${team1Name} was the home team. ${team2Name} was the visiting team.`
      : `${team2Name} was the home team. ${team1Name} was the visiting team.`

    const photoLine = `If you have a photo attached, use it as the hero visual — keep it natural and do not color-grade, tint, duotone, or overlay color washes on it. If no photo is attached, build a pure design graphic using color, typography, team logos, and geometry only — no generated or simulated photographs, player images, crowd scenes, or stadium shots of any kind.`

    const lines = [
      `Design a post-game score graphic (1080×1080) in the style of a neutral sports media outlet — think ESPN, Fox Sports, or The Athletic — not either team's own branded post.`,
      ``,
      `You are a senior graphic designer at a major sports network. This graphic covers the final score for a national audience, so neither team gets visual priority. Both programs are represented equally in color, logo placement, and type weight. The design should feel authoritative, clean, and broadcast-quality.`,
      ``,
      `RESULT`,
      `${rank1Label}${team1Name}${team1Record ? ` (${team1Record})` : ''}:  ${s1}`,
      `${rank2Label}${team2Name}${team2Record ? ` (${team2Record})` : ''}:  ${s2}`,
      neutralSiteNote,
      ``,
      `TEAM 1 — ${team1Name}`,
      `Colors: primary ${p1?.primaryPMS ? `${p1.primaryPMS} / ` : ''}${color1}${(p1?.secondaryHex || team1Colors?.secondary) ? `, secondary ${p1?.secondaryHex || team1Colors?.secondary}` : ''}.`,
      logo1 ? `Logo: ${logo1}` : null,
      ``,
      `TEAM 2 — ${team2Name}`,
      `Colors: primary ${p2?.primaryPMS ? `${p2.primaryPMS} / ` : ''}${color2}${(p2?.secondaryHex || team2Colors?.secondary) ? `, secondary ${p2?.secondaryHex || team2Colors?.secondary}` : ''}.`,
      logo2 ? `Logo: ${logo2}` : null,
      ``,
      `Use both color palettes balanced — neither team dominates the canvas. Each team should appear near their score as either their logo (using the description above) or their wordmark/name in their primary color — whichever you can reproduce most accurately. If you cannot render a team's logo confidently, use a clean wordmark of the team name instead. Do not approximate or invent a logo.`,
      ``,
      photoLine,
      ``,
      `The score numbers should be the largest typographic element. Both score numbers must be identical in size, weight, and visual prominence — neither score is de-emphasized regardless of result. The two scores must read as a clear comparison — side by side or in an obvious visual relationship.`,
      homeTeam !== null ? `Layout convention: the AWAY team goes on the LEFT (or TOP if stacked vertically); the HOME team goes on the RIGHT (or BOTTOM). This applies to the main score comparison, any box score, and the team-name/logo lockups.` : null,
      ``,
      `A small "FINAL" label is appropriate and expected. What to avoid: a giant WIN / VICTORY / FINAL word that dominates the canvas and overshadows the scores.`,
      `Do not place either logo in a plain white or gray box — both teams should feel integrated into the design.`,
      `Do not invent sponsor logos, broadcast/network bugs, hashtags, or social media handles. Only the two teams' marks appear.`,
    ]

    return lines.filter(l => l !== null && l !== undefined).join('\n')
  }

  // ─── TEAM-BRANDED GRAPHIC ────────────────────────────────────────────────────
  const featuredName   = featuredTeam === 2 ? team2Name   : team1Name
  const featuredScore  = featuredTeam === 2 ? team2Score  : team1Score
  const featuredRank   = featuredTeam === 2 ? team2Rank   : team1Rank
  const featuredRecord = featuredTeam === 2 ? team2Record : team1Record
  const featuredColors = featuredTeam === 2 ? team2Colors : team1Colors

  const oppName    = featuredTeam === 2 ? team1Name   : team2Name
  const oppScore   = featuredTeam === 2 ? team1Score  : team2Score
  const oppRank    = featuredTeam === 2 ? team1Rank   : team2Rank
  const oppRecord  = featuredTeam === 2 ? team1Record : team2Record
  const oppColors  = featuredTeam === 2 ? team1Colors : team2Colors

  const sf = featuredScore ?? ''
  const so = oppScore ?? ''
  const won  = Number(sf) > Number(so)
  const tied = Number(sf) === Number(so)

  const rankLabel    = featuredRank ? `#${featuredRank} ` : ''
  const oppRankLabel = oppRank ? `#${oppRank} ` : ''

  const profile    = getTeamBrandProfile(featuredName)
  const oppProfile = getTeamBrandProfile(oppName)
  const primary    = profile?.primaryHex   || featuredColors?.primary   || '#1a1a1a'
  const secondary  = profile?.secondaryHex || featuredColors?.secondary || '#ffffff'
  const tertiary   = profile?.tertiaryHex  || null
  const primaryPMS = profile?.primaryPMS   || null
  const featuredLogo = describeLogo(profile)

  const resultMood = won  ? 'This is a WIN — the graphic should feel confident, energized, and celebratory without being over the top.'
                  : tied ? 'This ended in a TIE — factual and composed.'
                  :        'This is a LOSS — clean and factual, not dramatic.'

  const motifLine = profile?.motifs?.length
    ? `The program is known for these design motifs (use abstractly if you incorporate texture or geometry): ${profile.motifs.join(', ')}.`
    : ''

  const photoLine = `If you have a photo attached, use it as the hero visual — keep it natural, do not color-grade, tint, duotone, or overlay color washes on it, and let the design elements frame it. If no photo is attached, build a pure design graphic using color, typography, team logos, and geometry only — no generated or simulated photographs, player images, crowd scenes, or stadium shots of any kind.`

  // Opponent brand block — gives the AI colors + logo description so it can
  // render the opponent's mark accurately rather than guessing from the name.
  const opponentBlock = buildBrandSummary(oppName, oppProfile, oppColors, 'OPPONENT')

  // Home/away context — used for box score ordering and game framing only,
  // not rendered as literal labels in the graphic.
  const featuredIsHome = (featuredTeam === 1 && homeTeam === 1) || (featuredTeam === 2 && homeTeam === 2)
  const featuredIsAway = (featuredTeam === 1 && homeTeam === 2) || (featuredTeam === 2 && homeTeam === 1)
  const siteContext = featuredIsHome
    ? `${featuredName} hosted this game. ${oppName} was the visiting team.`
    : featuredIsAway
    ? `${featuredName} played this game on the road. ${oppName} was the home team.`
    : null

  const lines = [
    `Design a post-game social media graphic (1080×1080) for ${featuredName}'s official account.`,
    ``,
    `You are the creative director employed by ${featuredName} — you work for this program, you know this brand inside and out, and this graphic goes live on the official ${featuredName} Instagram and Twitter within minutes of the final whistle. Make it feel like it came from this program's actual creative staff — not a template, not a generic sports graphic generator. Every layout and type choice should feel intentional and ownable by ${featuredName} specifically.`,
    ``,
    `RESULT`,
    `${rankLabel}${featuredName}${featuredRecord ? ` (${featuredRecord})` : ''}:  ${sf}`,
    `${oppRankLabel}${oppName}${oppRecord ? ` (${oppRecord})` : ''}:  ${so}`,
    homeTeam === null ? 'Neutral site.' : siteContext,
    ``,
    resultMood,
    ``,
    `BRAND — ${featuredName}`,
    `Primary color: ${primaryPMS ? `${primaryPMS} / ` : ''}${primary}`,
    `Secondary color: ${secondary}${tertiary ? ` · Accent: ${tertiary}` : ''}`,
    profile?.wordmarkStyle ? `Wordmark style: ${profile.wordmarkStyle}` : null,
    featuredLogo ? `Logo: ${featuredLogo}` : null,
    profile?.graphicNotes  ? `Art direction: ${profile.graphicNotes}` : null,
    motifLine || null,
    ``,
    opponentBlock,
    opponentBlock ? `` : null,
    `The opponent appears via their score and either their logo or their wordmark — your choice. Use the opponent description above so their colors and logo are rendered accurately; if you cannot reproduce their logo confidently, fall back to a clean wordmark of the opponent's team name in their primary color. Do not invent or approximate an unfamiliar logo.`,
    ``,
    photoLine,
    ``,
    `The score numbers should be the largest typographic element. Both score numbers must be identical in size, weight, and visual prominence — do NOT de-emphasize ${featuredName}'s score because this is a loss, and do NOT shrink the opponent's score because this is a win. The two scores must read as a clear comparison at a glance — side by side, or in an obvious visual relationship. Everything else — layout, texture, composition, hierarchy — is your creative call.`,
    homeTeam !== null ? `Layout convention: the AWAY team goes on the LEFT (or TOP if stacked vertically); the HOME team goes on the RIGHT (or BOTTOM). This applies to the main score comparison, any box score, and the team-name/logo lockups — so for this game, ${featuredIsHome ? `${oppName} (away) is on the left/top and ${featuredName} (home) is on the right/bottom` : `${featuredName} (away) is on the left/top and ${oppName} (home) is on the right/bottom`}.` : null,
    ``,
    `A small "FINAL" label is appropriate and expected — real score graphics use it. What to avoid: a giant WIN / VICTORY / FINAL word that visually dominates the canvas and overshadows the scores.`,
    ``,
    `Do not place the opponent's logo in a plain white or gray box — both teams should feel integrated into the design, not pasted in.`,
    ``,
    `Do not invent sponsor logos, broadcast or network bugs, hashtags, or social media handles. Only the two teams' marks appear on the graphic.`,
    ``,
    `Do not add university addresses, city names, or location footers (e.g. "Austin, Texas" or "The University of Texas") — the team name and logo carry the identity.`,
    ``,
    `Background textures, patterns, and decorative geometry should reflect ${featuredName}'s visual identity only. The opponent appears through their logo/wordmark and score — do not incorporate their signature patterns or textures into the background or composition.`,
  ]

  return lines.filter(l => l !== null && l !== undefined).join('\n')
}
