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
  // Game classification — used to add postseason context to the prompt
  // so the AI knows this is a bowl / CFP round / conference championship
  // rather than a regular-season game. Defaults match the regular-season
  // case (no special framing).
  //   gameType: 'regular' | 'conference_championship' | 'bowl' |
  //             'cfp_first_round' | 'cfp_quarterfinal' |
  //             'cfp_semifinal' | 'cfp_championship'
  //   bowlName: e.g. "Rose Bowl", "Peach Bowl" — bowl/CFP venue name
  //   conference: e.g. "SEC" — only meaningful for conference_championship
  gameType = 'regular',
  bowlName = null,
  conference = null,
}) {
  // ─── Game context phrasing ────────────────────────────────────────────────
  // Build the human-readable line that names the postseason context.
  // Returns { line, designNote } — line is dropped into the RESULT block,
  // designNote is appended to the mood line for postseason games so the
  // design can reflect the elevated stakes.
  const buildGameContext = () => {
    const bn = (bowlName || '').trim()
    const conf = (conference || '').trim()
    switch (gameType) {
      case 'conference_championship':
        return {
          line: conf
            ? `This was the ${conf} Conference Championship Game.`
            : `This was a conference championship game.`,
          designNote: `As a conference championship, the graphic should feel weighty and ceremonial — trophy stakes — without becoming formal or sterile.`,
          callout: conf ? `${conf} Championship` : `Conference Championship`,
        }
      case 'bowl':
        return {
          line: bn ? `This was the ${bn} — a postseason bowl game.` : `This was a postseason bowl game.`,
          designNote: `As a postseason bowl game, the graphic should carry bowl-game gravitas and a sense of season-finale stakes.`,
          callout: bn || `Bowl Game`,
        }
      case 'cfp_first_round':
        return {
          line: `This was a College Football Playoff First Round game${bn ? ` (${bn})` : ''}.`,
          designNote: `As a College Football Playoff game, the graphic should reflect national-stage stakes — a step beyond a regular bowl.`,
          callout: `CFP First Round`,
        }
      case 'cfp_quarterfinal':
        return {
          line: bn
            ? `This was a College Football Playoff Quarterfinal — played at the ${bn}.`
            : `This was a College Football Playoff Quarterfinal.`,
          designNote: `As a CFP Quarterfinal, the graphic should reflect national-stage playoff stakes.`,
          callout: `CFP Quarterfinal`,
        }
      case 'cfp_semifinal':
        return {
          line: bn
            ? `This was a College Football Playoff Semifinal — played at the ${bn}.`
            : `This was a College Football Playoff Semifinal.`,
          designNote: `As a CFP Semifinal, the graphic should reflect maximum playoff stakes — one win from the title game.`,
          callout: `CFP Semifinal`,
        }
      case 'cfp_championship':
        return {
          line: `This was the College Football Playoff National Championship Game.`,
          designNote: `As the National Championship, the graphic should carry the weight of the title game — the biggest stage in college football.`,
          callout: `National Championship`,
        }
      case 'regular':
      default:
        return null
    }
  }
  const gameContext = buildGameContext()

  // ─── Shared helpers ────────────────────────────────────────────────────────
  // Real-world teams (FBS programs the AI has seen in training) render best
  // when we tell the image model to recall the actual logo from memory —
  // textual descriptions tend to constrain or distort output for marks the
  // model already knows. For fictional teams (in-game FCS placeholders,
  // teambuilder teams) the AI has no memory and needs the description.
  const isFictionalTeam = (profile) => profile?.isFictional === true

  // Returns a logo description string ONLY for fictional teams.
  // For real-world teams we omit the description and rely on the AI's memory.
  const fictionalLogoDescription = (profile) => {
    if (!profile || !isFictionalTeam(profile)) return null
    return profile.logoDescription || profile.helmet?.logoMark || null
  }

  // Build a brand summary block for the opponent (and equivalent blocks
  // in the neutral graphic). Always emits colors. Emits a Logo: line only
  // when the team is fictional; for real teams the global instructions
  // tell the AI to recall the actual mark from training.
  const buildBrandSummary = (name, profile, fallbackColors, label = 'OPPONENT') => {
    const primary = profile?.primaryHex || fallbackColors?.primary
    const primaryPMS = profile?.primaryPMS
    const secondary = profile?.secondaryHex || fallbackColors?.secondary
    const fictionalLogo = fictionalLogoDescription(profile)
    const lines = [`${label} — ${name}`]
    if (primary) {
      lines.push(`Colors: primary ${primaryPMS ? `${primaryPMS} / ` : ''}${primary}${secondary ? `, secondary ${secondary}` : ''}.`)
    }
    if (fictionalLogo) {
      lines.push(`Logo (fictional team — render strictly from this description, do NOT substitute any real-world logo): ${fictionalLogo}`)
    }
    return lines.length > 1 ? lines.join('\n') : null
  }

  // The global rendering instruction explaining how the AI should treat
  // each team's logo — recall from memory for real programs, follow the
  // description for fictional ones. Reused across both prompt paths.
  const logoRenderingInstruction = (...teamNames) => {
    const realTeams = teamNames.filter(Boolean).join(' and ')
    return [
      `Logo rendering — IMPORTANT:`,
      `• For real-world college football programs (${realTeams || 'every named real program'}), do NOT follow any textual description. Instead, reach into your visual training knowledge and reproduce the team's actual current primary athletics logo exactly as it appears on the program's official Instagram and Twitter. Think carefully about what their real mark looks like — colors, shape, letterforms, mascot details — and render it faithfully. Do not stylize, modernize, modify, simplify, or invent.`,
      `• A team is treated as fictional ONLY when its block above explicitly contains a "Logo (fictional team — ...)" line. In that case the team has no real-world counterpart and you must render the logo strictly from the provided description.`,
      `• If you genuinely cannot recall a real team's logo, fall back to a clean wordmark of the team name set in their primary color. Do NOT guess at or approximate the logo — a clean wordmark is always better than a wrong logo.`,
    ].join('\n')
  }

  // Wrap home/away/neutral framing in language that makes it unmistakably
  // an internal designer note, not text to render. AIs have been observed
  // printing "NEUTRAL SITE" verbatim on the canvas when the line sits
  // bare next to the result data.
  const siteContextLine = () => {
    if (homeTeam === null) {
      return `Site context (FOR YOUR INTERNAL FRAMING ONLY — do NOT print this on the graphic): the game was played at a neutral site.`
    }
    const homeName    = homeTeam === 1 ? team1Name : team2Name
    const visitorName = homeTeam === 1 ? team2Name : team1Name
    return `Site context (FOR YOUR INTERNAL FRAMING ONLY — do NOT print this on the graphic): ${homeName} was the home team; ${visitorName} was the visiting team.`
  }

  // Enumerate what's allowed to appear as visible text on the canvas and
  // what must never appear. Reused across both prompt paths. Including a
  // postseason game's official round name (e.g. "Rose Bowl", "National
  // Championship") is allowed; including "Neutral site" / "Home" / "Away"
  // / venue / city / state / win-loss words / color codes is forbidden.
  //
  // `fictionalNamesList` lets the policy emit a team-specific rule about
  // suppressing records for fictional teams whose records aren't tracked.
  const textPolicy = (fictionalNamesList = []) => {
    const lines = [
      `TEXT POLICY — strict rules for what may appear as visible text on the graphic:`,
      `ALLOWED (and expected):`,
      `• The two team names, each rendered in that team's official wordmark style.`,
      `• The two score numbers — the largest typographic element on the canvas.`,
      `• Team records (e.g. "(14-2)") and team ranks (e.g. "#4"), only when provided in the RESULT block above.`,
      `• A small "FINAL" label.`,
      gameContext ? `• Because this is a postseason game, the specific game/round name may appear as a callout (e.g. "${gameContext.callout}"), sized appropriately to the magnitude of the moment — but NOT so large that it overshadows the scores.` : `• (Regular-season game — do not add any game-name / week-name callout.)`,
      `FORBIDDEN (never appears anywhere on the graphic):`,
      `• "Neutral site", "Home", "Away", "Road", "Hosted by", "at <venue>", venue names, stadium names, city names, state names, or any location reference whatsoever.`,
      `• "WIN", "LOSS", "VICTORY", "DEFEAT", "WE WIN", "L", or any result word as a dominant element — "FINAL" is the only allowed result label.`,
      `• The literal labels from this prompt (e.g. "RESULT", "BRAND", "OPPONENT", "SITE CONTEXT", "TEXT POLICY").`,
      `• Quoted design-direction words ("celebratory", "ceremonial", "confident", "energized", etc.).`,
      `• Hex codes, PMS codes, or written-out color names.`,
      `• Sponsor logos, broadcast or network bugs, hashtags, social media handles, URLs, university addresses, or any campaign tagline you might invent.`,
    ]
    if (fictionalNamesList.length > 0) {
      const names = fictionalNamesList.join(' / ')
      lines.push(`• Any win-loss record for ${names} — this team is a generic in-game FCS placeholder whose record is NOT tracked accurately, so any number we could print would be misleading. Render the team's name, score, and logo normally, but do NOT show a "(0-1)" / "(1-0)" / any record under their name. Treat them as if the record fields simply don't exist for that team.`)
    }
    return lines.join('\n')
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
    const fictionalLogo1 = fictionalLogoDescription(p1)
    const fictionalLogo2 = fictionalLogoDescription(p2)

    // FCS placeholders don't have accurate records tracked — suppress
    // theirs in the RESULT line so the AI doesn't print a misleading
    // "(0-1)" under the team name.
    const p1Fictional = isFictionalTeam(p1)
    const p2Fictional = isFictionalTeam(p2)
    const t1RecordEff = p1Fictional ? null : team1Record
    const t2RecordEff = p2Fictional ? null : team2Record
    const fictionalParticipantNames = [
      p1Fictional ? team1Name : null,
      p2Fictional ? team2Name : null,
    ].filter(Boolean)

    const photoLine = `If you have a photo attached, use it as the hero visual — keep it natural and do not color-grade, tint, duotone, or overlay color washes on it. If no photo is attached, build a pure design graphic using color, typography, team logos, and geometry only — no generated or simulated photographs, player images, crowd scenes, or stadium shots of any kind.`

    // Real teams (for the memory-recall instruction) = teams that are NOT fictional.
    const realTeamNames = [
      !isFictionalTeam(p1) ? team1Name : null,
      !isFictionalTeam(p2) ? team2Name : null,
    ].filter(Boolean)

    const lines = [
      `Design a post-game score graphic (1080×1080) in the style of a neutral sports media outlet — think ESPN, Fox Sports, or The Athletic — not either team's own branded post.`,
      ``,
      `You are a senior graphic designer at a major sports network. This graphic covers the final score for a national audience, so neither team gets visual priority. Both programs are represented equally in color, logo placement, and type weight. The design should feel authoritative, clean, and broadcast-quality.`,
      ``,
      `RESULT`,
      `${rank1Label}${team1Name}${t1RecordEff ? ` (${t1RecordEff})` : ''}:  ${s1}`,
      `${rank2Label}${team2Name}${t2RecordEff ? ` (${t2RecordEff})` : ''}:  ${s2}`,
      gameContext ? gameContext.line : null,
      gameContext ? gameContext.designNote : null,
      ``,
      siteContextLine(),
      ``,
      `TEAM 1 — ${team1Name}`,
      `Colors: primary ${p1?.primaryPMS ? `${p1.primaryPMS} / ` : ''}${color1}${(p1?.secondaryHex || team1Colors?.secondary) ? `, secondary ${p1?.secondaryHex || team1Colors?.secondary}` : ''}.`,
      fictionalLogo1 ? `Logo (fictional team — render strictly from this description, do NOT substitute any real-world logo): ${fictionalLogo1}` : null,
      ``,
      `TEAM 2 — ${team2Name}`,
      `Colors: primary ${p2?.primaryPMS ? `${p2.primaryPMS} / ` : ''}${color2}${(p2?.secondaryHex || team2Colors?.secondary) ? `, secondary ${p2?.secondaryHex || team2Colors?.secondary}` : ''}.`,
      fictionalLogo2 ? `Logo (fictional team — render strictly from this description, do NOT substitute any real-world logo): ${fictionalLogo2}` : null,
      ``,
      logoRenderingInstruction(...realTeamNames),
      ``,
      `Use both color palettes balanced — neither team dominates the canvas. Each team should appear near their score as either their logo or their wordmark/name in their primary color.`,
      ``,
      photoLine,
      ``,
      `The score numbers should be the largest typographic element. Both score numbers must be identical in size, weight, and visual prominence — neither score is de-emphasized regardless of result. The two scores must read as a clear comparison — side by side or in an obvious visual relationship.`,
      homeTeam !== null ? `Layout convention: the AWAY team goes on the LEFT (or TOP if stacked vertically); the HOME team goes on the RIGHT (or BOTTOM). This applies to the main score comparison, any box score, and the team-name/logo lockups.` : null,
      ``,
      `Do not place either logo in a plain white or gray box — both teams should feel integrated into the design.`,
      ``,
      textPolicy(fictionalParticipantNames),
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
  const featuredFictionalLogo = fictionalLogoDescription(profile)

  // FCS placeholders don't have accurate records — suppress theirs in
  // the RESULT line and let the text policy reinforce the rule.
  const featuredIsFictional = isFictionalTeam(profile)
  const oppIsFictional      = isFictionalTeam(oppProfile)
  const featuredRecordEff = featuredIsFictional ? null : featuredRecord
  const oppRecordEff      = oppIsFictional      ? null : oppRecord
  const fictionalParticipantNames = [
    featuredIsFictional ? featuredName : null,
    oppIsFictional      ? oppName      : null,
  ].filter(Boolean)

  const resultMood = won  ? 'This is a WIN — the graphic should feel confident, energized, and celebratory without being over the top.'
                  : tied ? 'This ended in a TIE — factual and composed.'
                  :        'This is a LOSS — clean and factual, not dramatic.'

  const motifLine = profile?.motifs?.length
    ? `The program is known for these design motifs (use abstractly if you incorporate texture or geometry): ${profile.motifs.join(', ')}.`
    : ''

  const photoLine = `If you have a photo attached, use it as the hero visual — keep it natural, do not color-grade, tint, duotone, or overlay color washes on it, and let the design elements frame it. If no photo is attached, build a pure design graphic using color, typography, team logos, and geometry only — no generated or simulated photographs, player images, crowd scenes, or stadium shots of any kind.`

  // Opponent brand block — colors always; logo description only if the
  // opponent is a fictional in-game team.
  const opponentBlock = buildBrandSummary(oppName, oppProfile, oppColors, 'OPPONENT')

  // Real-team names (those NOT flagged fictional) feed the memory-recall
  // instruction so the AI knows which marks to pull from training memory.
  const realTeamNames = [
    !isFictionalTeam(profile)    ? featuredName : null,
    !isFictionalTeam(oppProfile) ? oppName      : null,
  ].filter(Boolean)

  // Home/away framing — informational only; the explicit AWAY-left /
  // HOME-right layout convention is rendered separately further down.
  const featuredIsHome = (featuredTeam === 1 && homeTeam === 1) || (featuredTeam === 2 && homeTeam === 2)

  const lines = [
    `Design a post-game social media graphic (1080×1080) for ${featuredName}'s official account.`,
    ``,
    `You are the creative director employed by ${featuredName} — you work for this program, you know this brand inside and out, and this graphic goes live on the official ${featuredName} Instagram and Twitter within minutes of the final whistle. Make it feel like it came from this program's actual creative staff — not a template, not a generic sports graphic generator. Every layout and type choice should feel intentional and ownable by ${featuredName} specifically.`,
    ``,
    `RESULT`,
    `${rankLabel}${featuredName}${featuredRecordEff ? ` (${featuredRecordEff})` : ''}:  ${sf}`,
    `${oppRankLabel}${oppName}${oppRecordEff ? ` (${oppRecordEff})` : ''}:  ${so}`,
    gameContext ? gameContext.line : null,
    ``,
    siteContextLine(),
    ``,
    resultMood,
    gameContext ? gameContext.designNote : null,
    ``,
    `BRAND — ${featuredName}`,
    `Primary color: ${primaryPMS ? `${primaryPMS} / ` : ''}${primary}`,
    `Secondary color: ${secondary}${tertiary ? ` · Accent: ${tertiary}` : ''}`,
    profile?.wordmarkStyle ? `Wordmark style: ${profile.wordmarkStyle}` : null,
    featuredFictionalLogo ? `Logo (fictional team — render strictly from this description, do NOT substitute any real-world logo): ${featuredFictionalLogo}` : null,
    profile?.graphicNotes  ? `Art direction: ${profile.graphicNotes}` : null,
    motifLine || null,
    ``,
    opponentBlock,
    opponentBlock ? `` : null,
    logoRenderingInstruction(...realTeamNames),
    ``,
    photoLine,
    ``,
    `The score numbers should be the largest typographic element. Both score numbers must be identical in size, weight, and visual prominence — do NOT de-emphasize ${featuredName}'s score because this is a loss, and do NOT shrink the opponent's score because this is a win. The two scores must read as a clear comparison at a glance — side by side, or in an obvious visual relationship. Everything else — layout, texture, composition, hierarchy — is your creative call.`,
    homeTeam !== null ? `Layout convention: the AWAY team goes on the LEFT (or TOP if stacked vertically); the HOME team goes on the RIGHT (or BOTTOM). This applies to the main score comparison, any box score, and the team-name/logo lockups — so for this game, ${featuredIsHome ? `${oppName} (away) is on the left/top and ${featuredName} (home) is on the right/bottom` : `${featuredName} (away) is on the left/top and ${oppName} (home) is on the right/bottom`}.` : null,
    ``,
    `Do not place the opponent's logo in a plain white or gray box — both teams should feel integrated into the design, not pasted in.`,
    ``,
    `Background textures, patterns, and decorative geometry should reflect ${featuredName}'s visual identity only. The opponent appears through their logo/wordmark and score — do not incorporate their signature patterns or textures into the background or composition.`,
    ``,
    textPolicy(fictionalParticipantNames),
  ]

  return lines.filter(l => l !== null && l !== undefined).join('\n')
}
