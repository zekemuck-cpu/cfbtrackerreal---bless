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

  // Strict no-generated-imagery rule. Without this front-and-center,
  // image models infer that "this is a sports graphic, sports graphics
  // have player photos" and hallucinate a player/crowd/stadium shot —
  // e.g. inventing a Kentucky #1 celebrating with the home crowd when
  // the user didn't attach any photo. The rule needs to be unconditional
  // and prominently placed near the end of the prompt (LLMs and image
  // models weight final instructions strongly).
  const imageryPolicy = () => [
    `IMAGERY POLICY — STRICTLY ENFORCED:`,
    `This is a PURE GRAPHIC DESIGN. Do NOT generate, simulate, hallucinate, or invent ANY photographic or photo-realistic imagery anywhere on the canvas. The entire graphic is built from graphic-design elements only.`,
    ``,
    `Specifically forbidden — no exceptions, regardless of how natural it would feel for a "sports graphic":`,
    `• Player faces, bodies, hands, arms, or any depiction of athletes (real or invented)`,
    `• Photo-real jerseys, helmets, pads, gloves, cleats, or equipment shown on a body`,
    `• Crowd shots, fans, sideline scenes, coaches, staff, referees, cheerleaders`,
    `• Stadium photos, field/turf photos, sky, weather, scoreboard photography, stadium lighting`,
    `• Mascots rendered photo-realistically (a costumed person, a lifelike animal, a rendered 3D figure). A flat vector illustration or stylized graphic of a mascot character — clearly not photo-real — is acceptable as a design element.`,
    `• Any "photo-real" rendering of any element, including decorative photo-like washes behind text`,
    ``,
    `What the canvas IS made of:`,
    `• Solid color fields, gradients, and graphic textures (halftones, paper grain, geometric noise — never photographic)`,
    `• Typography (team names in each team's wordmark style, score numbers, "FINAL" label, postseason callout if applicable)`,
    `• Official vector team logos (recalled from your memory of the actual mark — see the Logo rendering section above)`,
    `• Geometric shapes (chevrons, stripes, frames, borders, dividers, brush strokes)`,
    ``,
    `MANDATORY: If ANY photo, image, or screenshot is attached to this request, you MUST use it as the hero visual element of the graphic. NEVER ignore an attached image. NEVER generate the graphic without it. How you integrate it is your creative call — full bleed, framed, layered, cropped, whatever serves the design best. If NO image is attached at all, build a pure design graphic with zero photographic content of any kind.`,
  ].join('\n')

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
      `• "FINAL SCORE" as a large display headline. The word "FINAL" may appear once as a small supporting label (e.g., above or between the scores). Never make it the dominant typographic element.`,
      `• "AWAY", "HOME", "ROAD", "VISITOR", or "HOST" as visible text anywhere on the canvas. These are layout notes, not design elements.`,
      `• Hype headlines or result banners — "CATS WIN!", "GO BLUE!", "VICTORY!", "WE WIN!", "BIG WIN!", "TAKEDOWN!", "DOMINANT!", "[TEAM] WIN.", or any equivalent outcome declaration.`,
      `• Subhead taglines and location subtitles — "BIG BLUE TAKES THE WIN IN FAYETTEVILLE!", "STATEMENT WIN IN ATHENS", "TIGERS ROAR IN BATON ROUGE", or any sentence-style descriptor. The scores + names + FINAL tell the story; no caption needed.`,
      `• Fan-identity slogans or program mottos used as the dominant typographic element. A slogan may appear as a small, subordinate element (corner badge, footer) if you know it is genuinely associated with this program — but the score is the story, not the slogan. Never invent one.`,
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

  // Restraint guidance — targets the specific AI clichés that make
  // graphics look generated. Kept intentionally narrow: only rules
  // that address real observed problems, not general design taste.
  const visualRestraint = (mode = 'branded') => [
    `VISUAL RESTRAINT:`,
    `• If a photo is attached to this request, it is the primary visual element — frame the scoreboard around it. Do NOT omit the attached photo to make the design feel cleaner; that makes it incomplete.`,
    `• Restrained does NOT mean plain white backgrounds. A design rooted in the team's palette is restrained; white is just lifeless.`,
    `• The score numbers are the largest typographic element on the canvas — larger than the team name, larger than the logo, larger than everything. If the logo is bigger than the score in your layout, fix it before sending.`,
    `• No grunge frames, torn-paper edges, or gritty brush borders.`,
    `• NO distressed, grunge, or brush-stroke letterforms — especially not for the "FINAL" label or any headline text. Clean, bold typography only.`,
    `• Each team's logo appears ONCE at a single consistent scale. Never repeat the same logo at multiple sizes (e.g., small in a score box AND large floating in the background).`,
    mode === 'branded'
      ? `• Do NOT split the canvas 50/50 between both teams' colors. Your team's palette dominates (roughly 70–80% visual weight) — the opponent's colors appear as secondary accents only.`
      : `• Do NOT split the canvas 50/50 between both teams' colors. Use both palettes as accent colors against a neutral field — neither team's colors should overpower the other.`,
  ].join('\n')

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

    // Real teams (for the memory-recall instruction) = teams that are NOT fictional.
    const realTeamNames = [
      !isFictionalTeam(p1) ? team1Name : null,
      !isFictionalTeam(p2) ? team2Name : null,
    ].filter(Boolean)

    const lines = [
      `Design a post-game score graphic (1080×1080) in the style of a neutral sports media outlet — think ESPN, Fox Sports, or The Athletic — not either team's own branded post.`,
      ``,
      `BEFORE YOU GO ANY FURTHER — read both of these once:`,
      `  (1) DO NOT GENERATE any photographic content yourself — no invented players, crowds, stadiums, jerseys-on-a-body, helmets-on-a-head, or any other AI-fabricated photo-real imagery. The graphic itself is built from typography, color, vector logos, and geometry only.`,
      `  (2) BUT — if the user has attached an image/photo/screenshot with this request, you MUST use that attached image as the hero visual element of the graphic. Do not omit it. Do not skip it to make the design feel cleaner. The attached image IS the primary visual block of this design, and the scores/names/logos/FINAL frame it. If you find yourself building a layout without the attached image, STOP and start over with the image included.`,
      `The "IMAGERY POLICY" section at the bottom of this prompt restates this in detail — read it now before committing to a layout.`,
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
      `The score numbers should be the largest typographic element. Both score numbers must be identical in size, weight, and visual prominence — neither score is de-emphasized regardless of result. The two scores must read as a clear comparison — side by side or in an obvious visual relationship.`,
      ``,
      `╔══════════════════════════════════════════════════════════╗`,
      `║  SCORE → TEAM PAIRING — NON-NEGOTIABLE, VERIFY BEFORE     ║`,
      `║  YOU DRAW                                                  ║`,
      `╚══════════════════════════════════════════════════════════╝`,
      `These pairings come from the actual game result. The score next to a team's logo MUST be that team's score. Common failure: the AI swaps the logos so the wrong team gets the wrong score. Before you commit to a layout, confirm:`,
      `• ${team1Name} scored ${s1}. The number ${s1} must appear with the ${team1Name} logo / wordmark. Never the other team's logo.`,
      `• ${team2Name} scored ${s2}. The number ${s2} must appear with the ${team2Name} logo / wordmark. Never the other team's logo.`,
      homeTeam !== null ? (() => {
        // Spell out the layout positions in concrete team+score language
        // so the AI doesn't have to apply the away-left/home-right rule
        // abstractly. Combined with the score→team pairing above this
        // gives the AI a fully bound assignment with nothing left to
        // infer.
        const awayName  = homeTeam === 1 ? team2Name : team1Name
        const awayScore = homeTeam === 1 ? s2 : s1
        const homeName  = homeTeam === 1 ? team1Name : team2Name
        const homeScore = homeTeam === 1 ? s1 : s2
        return `Layout for this specific game (away on left/top, home on right/bottom):\n• LEFT (or TOP if stacked vertically): ${awayName} logo + score ${awayScore} — the AWAY team.\n• RIGHT (or BOTTOM if stacked vertically): ${homeName} logo + score ${homeScore} — the HOME team.\nIf your draft has the ${awayName} logo paired with anything other than ${awayScore}, or the ${homeName} logo paired with anything other than ${homeScore}, the score-team pairing is broken — start over.`
      })() : `Layout for this neutral-site game: either team can sit on the left or top; pick whichever reads better. But the score → team pairing above is fixed regardless of side: ${team1Name} = ${s1}, ${team2Name} = ${s2}. Never swap.`,
      ``,
      `Do not place either logo in a plain white or gray box — both teams should feel integrated into the design.`,
      ``,
      visualRestraint('neutral'),
      ``,
      imageryPolicy(),
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

  const resultMood = `The graphic should feel confident, energized, and on-brand without being over the top.`

  // For fictional in-game teams the AI has no training memory — emit
  // motifs/notes so it has something to work from. For real programs,
  // this data would just be a redundant cheat sheet; the AI already
  // knows what Auburn or Tennessee or Michigan graphics look like.
  const motifLine = (profile?.motifs?.length && isFictionalTeam(profile))
    ? `Design motifs for this program: ${profile.motifs.join(', ')}.`
    : ''

  // Brand identity block — different for real vs. fictional teams.
  // Real programs: the AI's training data already contains this school's
  //   visual identity. Tell it to USE that knowledge rather than
  //   re-describing what it already knows.
  // Fictional programs: no training memory exists, so give concrete guidance.
  const brandIdentitySection = isFictionalTeam(profile)
    ? [
        `BRAND IDENTITY — NON-NEGOTIABLE:`,
        `The finished graphic must be immediately recognizable as a ${featuredName} graphic. Use the program's colors and visual language as the foundation — the design should feel like it came from this specific team's graphics department.`,
      ].join('\n')
    : [
        `BRAND IDENTITY — NON-NEGOTIABLE:`,
        `Picture what ${featuredName} football's official social media graphics actually look like — the posts their athletics department pushes to Instagram and Twitter right after a game. Not the uniforms. Not the stadium. The graphic design itself: how they use color, how they structure a layout, what typographic choices they make, what visual details make their posts instantly recognizable even before you read the school name.`,
        ``,
        `That is what you are designing right now.`,
        ``,
        `The finished graphic must feel like it came from ${featuredName}'s own graphics team — not because a logo is present, but because the design language itself speaks that specific school. Do not fall back on a generic sports-broadcast template.`,
      ].join('\n')

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
    `Design a post-game social media score graphic (1080×1080) for ${featuredName}'s official account.`,
    ``,
    `You are the creative director solely responsible for ${featuredName} football's social media graphics. This posts to the official ${featuredName} Instagram and Twitter within minutes of the final whistle. Your standard: clean, confident, on-brand. The best score graphics earn attention through clarity — a layout that looks intentional and assured, not one packed with competing elements. Restraint is the craft. The score is the story. Everything else is support.`,
    ``,
    resultMood,
    gameContext ? gameContext.line : null,
    ``,
    `RESULT`,
    `${rankLabel}${featuredName}${featuredRecordEff ? ` (${featuredRecordEff})` : ''}:  ${sf}`,
    `${oppRankLabel}${oppName}${oppRecordEff ? ` (${oppRecordEff})` : ''}:  ${so}`,
    ``,
    `BRAND — ${featuredName}`,
    // Hex codes are a precision anchor even for real teams (exact shade matters).
    // graphicNotes and motifLine are only emitted for fictional programs —
    // for real schools the AI already carries this knowledge from training.
    `Primary: ${primaryPMS ? `${primaryPMS} / ` : ''}${primary}  Secondary: ${secondary}${tertiary ? `  Accent: ${tertiary}` : ''}`,
    profile?.wordmarkStyle ? `Wordmark: ${profile.wordmarkStyle}` : null,
    (isFictionalTeam(profile) && profile?.graphicNotes) ? `${profile.graphicNotes}` : null,
    motifLine || null,
    featuredFictionalLogo ? `Logo (fictional team — render from this description only, do not substitute a real logo): ${featuredFictionalLogo}` : null,
    ``,
    brandIdentitySection,
    ``,
    opponentBlock,
    opponentBlock ? `` : null,
    logoRenderingInstruction(...realTeamNames),
    ``,
    `SCORE ACCURACY (non-negotiable): ${featuredName} scored ${sf} — that number must appear with the ${featuredName} logo. ${oppName} scored ${so} — that number must appear with the ${oppName} logo. Never swap.`,
    ``,
    homeTeam !== null ? (() => {
      const awayName  = featuredIsHome ? oppName    : featuredName
      const awayScore = featuredIsHome ? so         : sf
      const homeName  = featuredIsHome ? featuredName : oppName
      const homeScore = featuredIsHome ? sf         : so
      return `LAYOUT: away team on left/top, home team on right/bottom. Away = ${awayName} (${awayScore}), Home = ${homeName} (${homeScore}).`
    })() : `Neutral site — layout is your call.`,
    ``,
    ``,
    visualRestraint('branded'),
    ``,
    imageryPolicy(),
    ``,
    textPolicy(fictionalParticipantNames),
  ]

  return lines.filter(l => l !== null && l !== undefined).join('\n')
}
