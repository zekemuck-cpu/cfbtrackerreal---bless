import { getTeamBrandProfile } from '../data/teamBrandProfiles'

/**
 * Build a prompt for an AI image model to generate a post-game score graphic.
 * featuredTeam = 0 → neutral media-company style
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
  gameType = 'regular',
  bowlName = null,
  conference = null,
}) {
  // ─── Game context ─────────────────────────────────────────────────────────
  const buildGameContext = () => {
    const bn = (bowlName || '').trim()
    const conf = (conference || '').trim()
    switch (gameType) {
      case 'conference_championship':
        return {
          line: conf ? `This was the ${conf} Conference Championship Game.` : `This was a conference championship game.`,
          designNote: `Conference championship — weighty, ceremonial stakes.`,
          callout: conf ? `${conf} Championship` : `Conference Championship`,
        }
      case 'bowl':
        return {
          line: bn ? `This was the ${bn}.` : `This was a postseason bowl game.`,
          designNote: `Bowl game — season-finale stakes.`,
          callout: bn || `Bowl Game`,
        }
      case 'cfp_first_round':
        return {
          line: `This was a College Football Playoff First Round game${bn ? ` (${bn})` : ''}.`,
          designNote: `College Football Playoff — national-stage stakes.`,
          callout: `CFP First Round`,
        }
      case 'cfp_quarterfinal':
        return {
          line: bn ? `This was a College Football Playoff Quarterfinal at the ${bn}.` : `This was a College Football Playoff Quarterfinal.`,
          designNote: `CFP Quarterfinal — national playoff stakes.`,
          callout: `CFP Quarterfinal`,
        }
      case 'cfp_semifinal':
        return {
          line: bn ? `This was a College Football Playoff Semifinal at the ${bn}.` : `This was a College Football Playoff Semifinal.`,
          designNote: `CFP Semifinal — one win from the championship.`,
          callout: `CFP Semifinal`,
        }
      case 'cfp_championship':
        return {
          line: `This was the College Football Playoff National Championship.`,
          designNote: `The National Championship — the biggest stage in college football.`,
          callout: `National Championship`,
        }
      default:
        return null
    }
  }
  const gameContext = buildGameContext()

  // ─── Helpers ──────────────────────────────────────────────────────────────
  const isFictionalTeam = (profile) => profile?.isFictional === true

  const fictionalLogoDescription = (profile) => {
    if (!profile || !isFictionalTeam(profile)) return null
    return profile.logoDescription || profile.helmet?.logoMark || null
  }

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
      lines.push(`Logo (fictional — render from this description only, do NOT substitute a real logo): ${fictionalLogo}`)
    }
    return lines.length > 1 ? lines.join('\n') : null
  }

  const logoInstruction = (...teamNames) => {
    const realTeams = teamNames.filter(Boolean).join(' and ')
    return `Logos — ${realTeams || 'real programs'}: recall each team's actual current athletics mark from training and render it faithfully. If you can't recall it confidently, use a clean wordmark in their primary color. Any team with a "Logo (fictional)" line: render from that description only.`
  }

  // Wrapped so the AI doesn't print "NEUTRAL SITE" / "HOME" verbatim on the canvas.
  const siteContext = () => {
    if (homeTeam === null) return `[Internal context — do NOT print on graphic]: neutral site.`
    const homeName    = homeTeam === 1 ? team1Name : team2Name
    const visitorName = homeTeam === 1 ? team2Name : team1Name
    return `[Internal context — do NOT print on graphic]: ${homeName} home, ${visitorName} away.`
  }

  // Only the rules that address real observed AI problems.
  const designRules = (mode = 'branded') => [
    `DESIGN RULES:`,
    `• If a photo is attached, let it fill or bleed across the canvas — lay the design over it rather than framing it inside a panel.`,
    `• No distressed, scratchy, or grungy letterforms. Clean, bold typography only.`,
    mode === 'branded'
      ? `• This is ${featuredName}'s post — their palette dominates. Opponent colors are accents only.`
      : `• Both teams represented equally — neither palette dominates.`,
  ].join('\n')

  const textRules = (fictionalNamesList = []) => {
    const lines = [
      `TEXT RULES: Logos are sufficient to identify each team — written team names are optional. If a rank (#N) appears in the RESULT block for either team, it must be shown on the graphic next to that team's logo or score. Do not include:`,
      `• "FINAL SCORE" as a large hero headline. "FINAL" may appear as a label.`,
      `• "AWAY", "HOME", "ROAD", or "VISITOR" as visible canvas text.`,
      `• Outcome declarations — "CATS WIN!", "[TEAM] WIN.", "VICTORY!", or equivalent hype banners.`,
      `• Sentence captions — "STATEMENT WIN IN ATHENS" or any explanatory subtitle.`,
      `• Slogans as the dominant element. A program slogan (small, corner or footer) is fine if it's authentic to this school — never invented.`,
      `• Location text — venue, stadium, city, or state names.`,
      `• Hex codes, color names, hashtags, handles, or URLs.`,
    ]
    if (fictionalNamesList.length > 0) {
      const names = fictionalNamesList.join(' / ')
      lines.push(`• Win-loss record for ${names} — placeholder team, record not tracked. Render name/score/logo normally; omit the record.`)
    }
    return lines.join('\n')
  }

  // ─── NEUTRAL PATH ─────────────────────────────────────────────────────────
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

    const p1Fictional = isFictionalTeam(p1)
    const p2Fictional = isFictionalTeam(p2)
    const t1RecordEff = p1Fictional ? null : team1Record
    const t2RecordEff = p2Fictional ? null : team2Record
    const fictionalParticipantNames = [
      p1Fictional ? team1Name : null,
      p2Fictional ? team2Name : null,
    ].filter(Boolean)

    const realTeamNames = [
      !p1Fictional ? team1Name : null,
      !p2Fictional ? team2Name : null,
    ].filter(Boolean)

    const awayName  = homeTeam === 1 ? team2Name : homeTeam === 2 ? team1Name : null
    const awayScore = homeTeam === 1 ? s2        : homeTeam === 2 ? s1        : null
    const homeName  = homeTeam === 1 ? team1Name : homeTeam === 2 ? team2Name : null
    const homeScore = homeTeam === 1 ? s1        : homeTeam === 2 ? s2        : null

    const lines = [
      `Post-game score graphic (1080×1080) for a neutral sports media outlet — not either team's branded post.`,
      ``,
      `You are a senior designer at a major sports network. Both teams are represented equally in color, logo placement, and type weight.`,
      ``,
      `RESULT`,
      `${rank1Label}${team1Name}${t1RecordEff ? ` (${t1RecordEff})` : ''}:  ${s1}`,
      `${rank2Label}${team2Name}${t2RecordEff ? ` (${t2RecordEff})` : ''}:  ${s2}`,
      gameContext ? gameContext.line : null,
      gameContext ? gameContext.designNote : null,
      ``,
      siteContext(),
      ``,
      `TEAM 1 — ${team1Name}`,
      `Colors: primary ${p1?.primaryPMS ? `${p1.primaryPMS} / ` : ''}${color1}${(p1?.secondaryHex || team1Colors?.secondary) ? `, secondary ${p1?.secondaryHex || team1Colors?.secondary}` : ''}.`,
      fictionalLogo1 ? `Logo (fictional — render from this description only): ${fictionalLogo1}` : null,
      ``,
      `TEAM 2 — ${team2Name}`,
      `Colors: primary ${p2?.primaryPMS ? `${p2.primaryPMS} / ` : ''}${color2}${(p2?.secondaryHex || team2Colors?.secondary) ? `, secondary ${p2?.secondaryHex || team2Colors?.secondary}` : ''}.`,
      fictionalLogo2 ? `Logo (fictional — render from this description only): ${fictionalLogo2}` : null,
      ``,
      logoInstruction(...realTeamNames),
      ``,
      `Score pairing — verify before drawing:`,
      `• ${team1Name} = ${s1}. Pair the number ${s1} with the ${team1Name} logo.`,
      `• ${team2Name} = ${s2}. Pair the number ${s2} with the ${team2Name} logo. Never swap.`,
      `Both scores equally prominent — neither de-emphasized regardless of result.`,
      homeTeam !== null
        ? `Layout: ${awayName} (${awayScore}) left/top, ${homeName} (${homeScore}) right/bottom.`
        : `Neutral site — layout is your call.`,
      ``,
      `Do not invent or generate photo-realistic content — no fabricated players, crowds, or stadiums. If a photo is attached, use it. If not, the graphic is photo-free.`,
      ``,
      designRules('neutral'),
      ``,
      textRules(fictionalParticipantNames),
    ]

    return lines.filter(l => l !== null && l !== undefined).join('\n')
  }

  // ─── BRANDED PATH ─────────────────────────────────────────────────────────
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

  const rankLabel    = featuredRank ? `#${featuredRank} ` : ''
  const oppRankLabel = oppRank ? `#${oppRank} ` : ''

  const profile    = getTeamBrandProfile(featuredName)
  const oppProfile = getTeamBrandProfile(oppName)
  const primary    = profile?.primaryHex   || featuredColors?.primary   || '#1a1a1a'
  const secondary  = profile?.secondaryHex || featuredColors?.secondary || '#ffffff'
  const tertiary   = profile?.tertiaryHex  || null
  const primaryPMS = profile?.primaryPMS   || null
  const featuredFictionalLogo = fictionalLogoDescription(profile)

  const featuredIsFictional = isFictionalTeam(profile)
  const oppIsFictional      = isFictionalTeam(oppProfile)
  const featuredRecordEff = featuredIsFictional ? null : featuredRecord
  const oppRecordEff      = oppIsFictional      ? null : oppRecord
  const fictionalParticipantNames = [
    featuredIsFictional ? featuredName : null,
    oppIsFictional      ? oppName      : null,
  ].filter(Boolean)

  // Fictional teams: emit motifs/notes (AI has no training memory for them).
  // Real programs: AI already knows — don't re-describe what it has in training.
  const motifLine = (profile?.motifs?.length && featuredIsFictional)
    ? `Design motifs: ${profile.motifs.join(', ')}.`
    : ''

  const brandIdentitySection = featuredIsFictional
    ? `BRAND IDENTITY: The graphic must be immediately recognizable as a ${featuredName} graphic. Use the program's colors and visual language — design as their graphics department would.`
    : [
        `BRAND IDENTITY:`,
        `Picture what ${featuredName} football's official social media graphics actually look like — the posts their athletics department pushes to Instagram and Twitter right after a game. Not the uniforms. Not the stadium. The graphic design itself: how they use color, how they structure a layout, what typographic choices they make, what visual details make their posts instantly recognizable even before you read the school name.`,
        ``,
        `That is what you are designing right now.`,
        ``,
        `The graphic must feel like it came from ${featuredName}'s own graphics team — not just because a logo is present, but because the design language itself speaks that specific school.`,
      ].join('\n')

  const opponentBlock = buildBrandSummary(oppName, oppProfile, oppColors, 'OPPONENT')

  const realTeamNames = [
    !featuredIsFictional              ? featuredName : null,
    !isFictionalTeam(oppProfile)      ? oppName      : null,
  ].filter(Boolean)

  const featuredIsHome = (featuredTeam === 1 && homeTeam === 1) || (featuredTeam === 2 && homeTeam === 2)
  const awayName  = featuredIsHome ? oppName      : featuredName
  const awayScore = featuredIsHome ? so           : sf
  const homeName  = featuredIsHome ? featuredName : oppName
  const homeScore = featuredIsHome ? sf           : so

  const lines = [
    `Post-game social media score graphic (1080×1080) for ${featuredName}'s official account.`,
    ``,
    `You are the creative director for ${featuredName} football's social media. This goes out on Instagram and Twitter within minutes of the final whistle.`,
    ``,
    gameContext ? gameContext.line : null,
    gameContext ? gameContext.designNote : null,
    ``,
    `RESULT`,
    `${rankLabel}${featuredName}${featuredRecordEff ? ` (${featuredRecordEff})` : ''}:  ${sf}`,
    `${oppRankLabel}${oppName}${oppRecordEff ? ` (${oppRecordEff})` : ''}:  ${so}`,
    ``,
    `BRAND — ${featuredName}`,
    `Primary: ${primaryPMS ? `${primaryPMS} / ` : ''}${primary}  Secondary: ${secondary}${tertiary ? `  Accent: ${tertiary}` : ''}`,
    profile?.wordmarkStyle ? `Wordmark: ${profile.wordmarkStyle}` : null,
    (featuredIsFictional && profile?.graphicNotes) ? `${profile.graphicNotes}` : null,
    motifLine || null,
    featuredFictionalLogo ? `Logo (fictional — render from this description only): ${featuredFictionalLogo}` : null,
    ``,
    brandIdentitySection,
    ``,
    opponentBlock,
    opponentBlock ? `` : null,
    logoInstruction(...realTeamNames),
    ``,
    `Score accuracy: ${featuredName} = ${sf}, ${oppName} = ${so}. Pair each score with the correct logo. Never swap. Both teams' scores in the same visual format — equal type size and layout treatment.`,
    ``,
    homeTeam !== null
      ? `Layout: ${awayName} (${awayScore}) left/top, ${homeName} (${homeScore}) right/bottom.`
      : `Neutral site — layout is your call.`,
    ``,
    `Do not invent or generate photo-realistic content — no fabricated players, crowds, or stadiums. If a photo is attached, use it. If not, the graphic is photo-free.`,
    ``,
    designRules('branded'),
    ``,
    textRules(fictionalParticipantNames),
  ]

  return lines.filter(l => l !== null && l !== undefined).join('\n')
}
