// One-off transform: take the freshly uploaded `football_card_styles (1).json`
// (213 entries) and emit `src/data/cardStylesRaw.json` with prompts tuned
// for the actual workflow — the user uploads a screenshot of the player as
// the card photo, and the AI applies only the card *design* on top of it.
//
// Per front prompt:
//   1. Replace photo-noun openers ("Color action photo of {{name}}...") with
//      a neutral phrase that points at the uploaded image.
//   2. Strip language that directs the AI on what the player is doing
//      (pose, camera angle, helmet on/off, mid-play, looking off-camera,
//      "the photo is crisp and well-lit", etc.) and the obsolete
//      `{{photoDescription}}` placeholder.
//   3. Final pass cleans up dangling punctuation and orphan connectors
//      ("in,", "with.", trailing ", and") left behind by the strips.
//   4. Prepend a PHOTO INSTRUCTION block that locks the uploaded image as
//      the photographic content.
//
// Backs are mostly design + stat layouts, so they only get the
// `{{photoDescription}}` strip + whitespace cleanup (no preamble).

import fs from 'node:fs'

const SRC = '/workspaces/cfbtrackerreal/football_card_styles (1).json'
const DST = '/workspaces/cfbtrackerreal/src/data/cardStylesRaw.json'

const PREAMBLE = [
  'PHOTO INSTRUCTION (this overrides any photo direction below):',
  "I am attaching a screenshot of the player — that uploaded image IS the card's photo.",
  'Use it AS-IS. Do not generate a new player, do not change the pose, expression, face, body, hair, helmet, eyewear, jersey, number, or uniform, and do not replace it with a stock or AI-rendered player.',
  'Treat the uploaded image as a locked photographic asset placed inside the card.',
  'Apply ONLY the card design described below — frame, borders, color treatment / tint / grain, typography, name plate, team panel, badges, logos, finish (matte / gloss / foil / chrome / refractor), halftone, print artifacts, etc.',
  'Crop and position the uploaded photo to fit the card layout, but do not redraw the player.',
  '',
  'CARD DESIGN:',
  '',
].join('\n')

// Photo-noun openers — replace "Color action photo of {{name}}..." style
// leads with a neutral phrasing that points at the uploaded image.
//
// The lookbehind `(?<!uploaded player )` on the generic catch-all keeps it
// from re-matching its own output after the specific patterns have run.
const NOUN_REPLACEMENTS = [
  [/\bHand-colou?ri[sz]ed painted-photograph portrait of \{\{name\}\}/gi,
   'The uploaded player photograph of {{name}}, rendered with a hand-colorized painted-photograph treatment'],
  [/\bHand-colou?ri[sz]ed black[- ]and[- ]white photograph of \{\{name\}\}/gi,
   'The uploaded player photograph of {{name}}, rendered as a hand-colorized black-and-white photograph'],
  [/\bBlack[- ]and[- ]white photograph of \{\{name\}\}/gi,
   'The uploaded player photograph of {{name}}, rendered in black-and-white'],
  [/\bSepia[- ]tinted photograph of \{\{name\}\}/gi,
   'The uploaded player photograph of {{name}}, rendered in sepia tones'],
  [/\bOn-card-style color action photo of \{\{name\}\}/gi,
   'The uploaded player photograph of {{name}}'],
  [/(?<!uploaded player )\b(?:A |An )?(?:Color |Full[- ]color |Vibrant |Saturated |Crisp |Glossy |Sharp |Crystal[- ]clear )?(?:in[- ]game |action |posed |studio |portrait )?(?:color )?(?:photograph|photo|shot|portrait|image)(?: of)? \{\{name\}\}/gi,
   'The uploaded player photograph of {{name}}'],
]

// Phrases that direct the AI to render a specific pose / action / camera
// angle / equipment state. These are now obsolete because the user is
// supplying the photo. Each pattern absorbs an optional leading comma /
// whitespace so we don't leave dangling punctuation behind.
//
// Patterns are ordered: most specific first, generic catch-alls last.
const STRIP_PATTERNS = [
  // Whole "Player is ..." / "He is ..." sentences (pose + dress description)
  /\s*Player is (?:in |shown |depicted |posed |captured )[^.]*\./gi,
  /\s*(?:He |The player )(?:is |appears |looks )(?:posed|standing|holding|cradling|looking|shown)[^.]*\./gi,
  /\s*The photo is crisp[^.]*\./gi,
  /\s*Background is [^.]*\./gi,

  // "in mid-play / in mid-action / mid-stride" — keep "in" inside the strip
  /,?\s*(?:in\s+)?mid[- ]?(?:play|action|stride|motion)[^,.]*/gi,

  // Pose / camera direction fragments
  /,?\s*in (?:a |an )?posed three[- ]quarter turn[^,.]*/gi,
  /,?\s*posed three[- ]quarter turn[^,.]*/gi,
  /,?\s*three[- ]quarter turn[^,.]*/gi,
  /,?\s*in (?:a |an )?(?:posed )?(?:portrait|stance|three[- ]quarter)[^,.]*/gi,
  /,?\s*looking off[- ]?camera[^,.]*/gi,
  /,?\s*looking off camera[^,.]*/gi,
  /,?\s*looking (?:forward|directly at the camera|into the camera|down(?: the field)?|upfield)[^,.]*/gi,
  /,?\s*facing (?:the camera|forward|the field)[^,.]*/gi,
  /,?\s*cradling (?:a |the )?[^,.]*football[^,.]*/gi,
  /,?\s*ball cradled[^,.]*/gi,
  /,?\s*arm cocked[^,.]*/gi,
  /,?\s*arms? (?:extended|raised|crossed)[^,.]*/gi,
  /,?\s*in (?:a )?posed or in[- ]game pose[^,.]*/gi,
  /,?\s*in (?:posed|in[- ]game|action) pose[^,.]*/gi,
  /,?\s*in (?:a )?(?:running|throwing|catching|tackling) (?:pose|stance|motion)[^,.]*/gi,
  /,?\s*posed or (?:in[- ]?\w+|action|in[- ]game)[^,.]*/gi,
  /,?\s*posed and (?:in[- ]?\w+|action|in[- ]game)[^,.]*/gi,
  /,?\s*frozen motion[^,.]*/gi,
  /,?\s*captured (?:in |during )[^,.]*/gi,

  // Camera angles / shot framing
  /,?\s*shot from (?:the )?sideline(?: angle)?[^,.]*/gi,
  /,?\s*shot from (?:the )?end zone[^,.]*/gi,
  /,?\s*shot from (?:above|below|ground level)[^,.]*/gi,
  /,?\s*sideline angle[^,.]*/gi,
  /,?\s*from (?:the )?sideline[^,.]*/gi,
  /,?\s*on[- ]field or sideline action[^,.]*/gi,
  /,?\s*sideline (?:photo|action|shot)[^,.]*/gi,
  /,?\s*on[- ]field action[^,.]*/gi,

  // Photo quality descriptors
  /,?\s*(?:crisp and )?well[- ]lit[^,.]*/gi,
  /,?\s*(?:tack[- ]?)?sharp focus[^,.]*/gi,
  /,?\s*shallow depth of field[^,.]*/gi,
  /,?\s*high[- ]contrast (?:lighting|photo|portrait)[^,.]*/gi,

  // Helmet state
  /,?\s*helmet held under (?:arm|chin)[^,.]*/gi,
  /,?\s*helmet held in (?:hand|hands)[^,.]*/gi,
  /,?\s*helmet under (?:arm|chin)[^,.]*/gi,
  /,?\s*holding (?:his )?helmet[^,.]*/gi,
  /,?\s*often helmet (?:on|off)[^,.]*/gi,
  /,?\s*without (?:a )?helmet[^,.]*/gi,
  /,?\s*helmet off[^,.]*/gi,
  /,?\s*helmet on(?:ly)?[^,.]*/gi,
  /,?\s*(?:full )?helmet visible[^,.]*/gi,
  /,?\s*with helmet on[^,.]*/gi,
  /,?\s*with (?:a )?helmet[^,.]*/gi,
  /,?\s*helmet logo visible[^,.]*/gi,
  /,?\s*helmet logo airbrushed off[^,.]*/gi,
  /\s*\(helmet logo airbrushed off[^)]*\)/gi,
  /\s*\(logo airbrushed off[^)]*\)/gi,
  /\s*\(helmet logo visible\)/gi,
  /\s*\(helmets? on\)/gi,

  // Background / wardrobe direction
  /,?\s*against (?:a |the )?(?:painted|softly painted|stadium|grass|field|sky|neutral|solid color|blurred)[^,.]*background[^,.]*/gi,
  /,?\s*painted (?:stadium|sky|background|backdrop)[^,.]*/gi,
  /,?\s*set against [^,.]*/gi,
  /,?\s*set on (?:a |an |the )?[^,.]*background[^,.]*/gi,
  /,?\s*in[- ]?stadium with [^,.]*/gi,
  /,?\s*with (?:the )?crowd (?:visible |blurred )?[^,.]*/gi,
  /,?\s*with (?:the )?sideline (?:visible |blurred )?[^,.]*/gi,
  /,?\s*stadium (?:lights |crowd |background )(?:visible |behind )?[^,.]*/gi,
  /,?\s*blurred (?:crowd|stadium|sideline|field|background)[^,.]*/gi,
  /,?\s*(?:in |wearing )(?:a )?(?:vintage |period |throwback )?(?:1950s|1960s|1970s|1980s|1990s|2000s)?[ -]?uniform[^,.]*/gi,
  /,?\s*period(?:-correct)? uniform[^,.]*/gi,
  /,?\s*era[- ]appropriate uniform[^,.]*/gi,
  /,?\s*team uniform[^,.]*/gi,
  /,?\s*in (?:his )?(?:rookie[- ]year |throwback )?(?:team )?(?:uniform|jersey|kit)[^,.]*/gi,
  /,?\s*shot in (?:the player's |his )?[^,.]*uniform[^,.]*/gi,

  // Photo-direction adjective clusters that follow the noun replacement
  /,?\s*cut out at the silhouette[^,.]*/gi,
  /,?\s*knockout silhouette[^,.]*/gi,
  /,?\s*superimposed on [^,.]*/gi,

  // Parentheticals containing pose / moment / camera direction (used in
  // fictional ultra-premium concept entries). Strip the whole parenthetical
  // when any of these pose keywords appear inside.
  /\s*\([^)]*(?:helmet held|pre[- ]game|post[- ]game|tunnel walk|powerful posture|regal lighting|regal pose|emperor[- ]?like|static pose|heroic pose|action pose|in motion|locker room moment|behind[- ]the[- ]scenes|studio portrait)[^)]*\)/gi,

  // ALL-CAPS pose lead-ins (e.g. "in REGAL EMPEROR-LIKE STATIC POSE")
  /,?\s*in [A-Z][A-Z\s-]{2,}(?:STATIC POSE|REGAL POSE|EMPEROR[- ]LIKE POSE|EMPEROR[- ]LIKE STATIC POSE|HEROIC POSE|ACTION POSE)[^,.]*/g,

  // "BEHIND-THE-SCENES" / "Behind-the-scenes" descriptor that often
  // prefaces the photo noun in fictional concept cards.
  /\bBEHIND[- ]THE[- ]SCENES\s+(?=(?:The uploaded |photo|photograph|image))/gi,

  // Obsolete placeholder — there's no `photoDescription` variable in the
  // resolver, and the user is providing the actual photo.
  /[\s,]*\{\{\s*photoDescription\s*\}\}[\s,]*/gi,
]

// Final-pass cleanups for orphan fragments left behind by strips. These
// mostly target connectors that got stranded when their object was removed.
const ORPHAN_CLEANUPS = [
  // Duplicate "The uploaded player" left by overlapping noun replacements
  [/\bThe uploaded player\s+The uploaded player photograph\b/gi, 'The uploaded player photograph'],

  // ", in," / ", in." / ", in <sentence-end>"
  [/,\s*in\s*,/gi, ','],
  [/,\s*in\s*\./gi, '.'],
  [/,\s*in\s+(?=[A-Z])/g, '. '],

  // ", with," / ", with." / "with ,"
  [/,\s*with\s*,/gi, ','],
  [/,\s*with\s*\./gi, '.'],
  [/\bwith\s+,/gi, ','],
  [/\bwith\s+\./gi, '.'],

  // ", and," / ", and." (orphan and after a strip)
  [/,\s*and\s*,/gi, ','],
  [/,\s*and\s*\./gi, '.'],

  // ", or," / ", or."
  [/,\s*or\s*,/gi, ','],
  [/,\s*or\s*\./gi, '.'],

  // ", the," / ", the." (orphan article)
  [/,\s*the\s*,/gi, ','],
  [/,\s*the\s*\./gi, '.'],

  // Empty parens / orphan opening or closing
  [/\(\s*\)/g, ''],
  [/\(\s*([,.])/g, '$1'],
  [/([,.])\s*\)/g, '$1'],

  // Doubled commas / periods
  [/,\s*,+/g, ','],
  [/\.\s*\.+/g, '.'],
  [/,\s*\./g, '.'],

  // Whitespace cleanup
  [/\s+,/g, ','],
  [/\s+\./g, '.'],
  [/[ \t]{2,}/g, ' '],
  [/\n[ \t]+/g, '\n'],

  // Stray ", takes up" / ", sits inside" with empty subject before a period
  [/,\s*sits inside ([^,.]+),\s*\./gi, ', sits inside $1.'],

  // Trailing connector before period: "{{school}}, ." → "{{school}}."
  [/,\s*\./g, '.'],

  // Trailing connectors at the end of a sentence after a strip
  [/,\s*set\s*\./gi, '.'],
  [/,\s*set\s*,/gi, ','],
  [/,\s*posed\s*\./gi, '.'],
  [/,\s*posed\s*,/gi, ','],
  [/,\s*action\s*\./gi, '.'],
  [/,\s*action\s*,/gi, ','],
  [/,\s*shown\s*\./gi, '.'],
  [/,\s*shown\s*,/gi, ','],

  // "posed or", "posed and" stranded by previous strips
  [/,?\s*posed\s+or\s*\./gi, '.'],
  [/,?\s*posed\s+or\s*,/gi, ','],
  [/,?\s*posed\s+and\s*\./gi, '.'],
  [/,?\s*posed\s+and\s*,/gi, ','],

  // "often." / "often," stranded
  [/,?\s*often\s*\./gi, '.'],
  [/,?\s*often\s*,/gi, ','],

  // Trailing "and." / "or." / "but." at end of sentence (orphan connector
  // left behind when its object was stripped). The trailing-period
  // requirement keeps legitimate "and white" / "or red" in place.
  [/\s+and\s*\./g, '.'],
  [/\s+or\s*\./g, '.'],
  [/\s+but\s*\./g, '.'],
  [/\s+with\s*\./g, '.'],
  [/\s+for\s*\./g, '.'],
]

// The source catalog mostly describes NFL trading cards, so its prompts
// are full of "Panini, NFL, NFLPA logos" footers, "NFL shield" callouts,
// and "the official NFL card" tagline lines. This app produces COLLEGE
// football cards, so those references would steer the AI to render NFL
// branding on a college player. Replace them with the NCAA / team-
// conference equivalents.
//
// NB: leave alone the prompts that already say "NO NFL/NFLPA logos
// because this is a college-licensed product" — those are correct
// guardrails for the AI and should stay verbatim. The negative
// lookbehinds enforce that.
const NFL_REPLACEMENTS = [
  // "Footer: Panini, NFL, and NFLPA logos" / "Topps, NFL, NFLPA logos" /
  // "<BRAND>, NFL, NFLPA logos" — the most common footer pattern.
  [/(?<!\b[Nn][Oo]\s)([A-Z][A-Za-z]+),\s*NFL,?\s*(?:and\s+)?NFLPA logos\b/g,
   '$1, NCAA, and team-conference logos'],

  // Bare "NFL and NFLPA logos" / "NFL, NFLPA logos" / "NFL/NFLPA logos"
  [/(?<!\b[Nn][Oo]\s)\bNFL\s*(?:,\s*and\s+|,\s*|\s+and\s+|\/)\s*NFLPA logos\b/g,
   'NCAA and team-conference logos'],

  // Misc NFL branding callouts
  [/\bNFL shield(?:\s+logo)?\b/g, 'NCAA logo'],
  [/\bNFL crest\b/g, 'NCAA logo'],
  [/\bNFL wordmark\b/gi, 'NCAA wordmark'],
  [/THE OFFICIAL NFL CARD/g, 'THE OFFICIAL COLLEGE FOOTBALL CARD'],
  [/the official NFL card/gi, 'the official college football card'],
]

function replaceNFLReferences(text) {
  if (typeof text !== 'string') return text
  let out = text
  for (const [re, rep] of NFL_REPLACEMENTS) out = out.replace(re, rep)
  return out
}

// Source catalog also leans on NFL "Rookie Card" semantics — RC stamps,
// "Rated Rookie" badges, "Rookie Ticket" banners, "for rookies, add a
// foil RC designation". College players aren't rookies (you're a true
// freshman, RS freshman, etc.), so the AI was rendering "RC" badges on
// seniors. Strip the RC/rookie callouts from every prompt; the
// `freshman / debut` context still has its own dedicated framing in
// the back-of-card content block.
const ROOKIE_STRIPS = [
  // Whole conditional sentences — usually look like "For rookies, ADD …."
  /\s*For rookies?,[^.]*\./gi,
  /\s*For Rated Rookies,[^.]*\./gi,
  /\s*For rookie autograph versions,[^.]*\./gi,
  // Inline "with 'RC' shield in upper-right for rookies" / "with an 'RC'
  // designation for rookies" fragments tacked onto a longer sentence.
  /,?\s*with\s+(?:an?\s+)?['"`]RC['"`][^,.]*(?:rookies?|freshmen|first[- ]year)[^,.]*/gi,
  /,?\s*with\s+a\s+['"`]?ROOKIE['"`]?[^,.]*foil[^,.]*/gi,
  // Standalone "RC" / "Rookie Card" callouts inside parens or set off.
  /\s*\(['"`]?RC['"`]?[^)]*\)/gi,
]

const ROOKIE_REPLACEMENTS = [
  // "earliest rookie card or college card image" → "earliest college card image"
  [/earliest rookie card or college card image/gi, 'earliest college card image'],
  [/rookie card or college card/gi, 'college card'],
  // "ROOKIE TICKET / VETERAN TICKET" — neither term applies to college; the
  // ticket-stub motif is fine, just drop the rookie/veteran distinction.
  [/['"`]?ROOKIE TICKET['"`]?\s*\(\s*or\s*['"`]?VETERAN TICKET['"`]?\s*for[^)]*\)/gi, "'GAME TICKET'"],
  [/['"`]?ROOKIE TICKET['"`]?/g, "'GAME TICKET'"],
]

function stripRookieReferences(text) {
  if (typeof text !== 'string') return text
  let out = text
  for (const [re, rep] of ROOKIE_REPLACEMENTS) out = out.replace(re, rep)
  for (const re of ROOKIE_STRIPS) out = out.replace(re, '')
  return out
}

function clean(text) {
  if (typeof text !== 'string') return text
  let out = text
  for (const [re, rep] of NOUN_REPLACEMENTS) out = out.replace(re, rep)
  for (const re of STRIP_PATTERNS) out = out.replace(re, '')
  out = replaceNFLReferences(out)
  out = stripRookieReferences(out)
  // Multiple cleanup passes, since one pass can expose new orphans.
  for (let i = 0; i < 3; i++) {
    for (const [re, rep] of ORPHAN_CLEANUPS) out = out.replace(re, rep)
  }
  return out.trim()
}

// Appended to every front prompt. The {{frontOverlay}} variable resolves
// to an empty string for normal cards, or to a "Player of the Week banner"
// instruction when the user attaches a weekly award to a game-context card.
// Putting it at the end keeps the design language above intact and lets
// the overlay stack on top as a context-aware addendum.
const FRONT_OVERLAY_SUFFIX = '\n\n{{frontOverlay}}'

function transformFront(prompt) {
  if (typeof prompt !== 'string') return prompt
  return PREAMBLE + clean(prompt) + FRONT_OVERLAY_SUFFIX
}

// Prepended to every back template. The {{contextStatBlock}} variable is
// resolved by cardPromptVariables.js into a context-aware data block
// (season → career table; game → single-game line; rookie → recruiting
// profile + rookie stats; championship/award → title or award detail;
// custom → user theme).
//
// CRITICAL: the goal is a back that looks like a real production sports
// card, not a phone-app stat screen. Earlier versions of this preamble
// just said "use this content"; the AI dutifully rendered the labelled
// data block VERBATIM, producing dashboard-style backs with cartoon
// icons next to "WEEK / GAME / FINAL / RESULT / PASSING / RUSHING"
// rows. The anti-pattern list below is the bulk of the fix.
const BACK_PREAMBLE = [
  'BACK CONTENT (data only — translate this into the visual language of the real-world set described in BACK DESIGN below):',
  '',
  '{{contextStatBlock}}',
  '',
  'BACK DESIGN — render the back the way the real-world set actually looked',
  '─────────────────────────────────────────────────────────────────────',
  'The text under "BACK DESIGN" further down describes the era, brand, color palette, layout, typography, and finish. Match it.',
  '',
  'CRITICAL ANTI-PATTERNS — these are the AI mistakes that make the back look fake; do NOT do any of these:',
  '',
  '✗ DO NOT add stock clipart / cartoon icons next to stat rows (calendar icon for week, helmet icon for game, whistle icon for result, football icon for passing, cleat icon for rushing, etc.). REAL production sports cards do not put cartoon icons in front of stat rows. Ever.',
  '',
  '✗ DO NOT lay out the back as a vertical "LABEL : value" dashboard, e.g. "WEEK : Week 8 / GAME : vs UTEP / FINAL : 63-3 / RESULT : Win / PASSING : 33/37 / RUSHING : 4 car". That is a phone-app screen, not a trading card. On real cards, the matchup goes in a small game-info ribbon and the player\'s numbers go in a tight tabular STAT PANEL with column headers across the top.',
  '',
  '✗ DO NOT render the BACK CONTENT block above verbatim. It is REFERENCE DATA. Translate it into the visual language of the era:',
  '    – Multi-year career data → render as a multi-row STAT TABLE with column headers (Year, GP, and position-specific stat columns) and one row per year, the way the brand\'s actual cards did. Bold/accent the highlight row.',
  '    – Single-game data → render as a small TIGHT STAT PANEL: a tabular block (column headers + one row of numbers) or a single inline ribbon ("33/37 · 431 YDS · 7 TD"). Not a vertical labelled list.',
  '    – Bio → render as a flowing 1-3 sentence paragraph in the era\'s typical tone, not as labeled fields.',
  '',
  '✗ DO NOT generate filler AI-recap prose ("carved up", "controlled the game throughout", "dominant performance", "took the field with conviction"). Either keep recap copy short and factual, or omit it.',
  '',
  '✓ DO match the brand\'s actual era — typography, color palette, panel shapes, photo treatment (or absence), card-stock color, finish. A 2017 Donruss Optic back looks different from a 1972 Topps back; respect that difference.',
  '',
  '✓ DO use the data in the BACK CONTENT block as the source of truth for every number, name, and date on the back. Do not invent stats or claims not listed there.',
  '',
  '─────────────────────────────────────────────────────────────────────',
  'BACK DESIGN (the original set\'s visual language — populate it with the data above):',
  '',
].join('\n')

function transformBack(prompt) {
  if (typeof prompt !== 'string') return prompt
  return BACK_PREAMBLE + clean(prompt)
}

const raw = JSON.parse(fs.readFileSync(SRC, 'utf8'))
if (!Array.isArray(raw)) {
  console.error('Source JSON is not an array')
  process.exit(1)
}

// Fictional concept entries are all dated "2025" in the upstream
// catalog (e.g. "2025 Panini Prizm Aurora Borealis Parallel"). Since
// these aren't real production sets, the year is purely a placeholder
// — the user picks a year on the Context step, and the card should
// adopt THAT year, not a hardcoded 2025. Replace `2025` with `{{year}}`
// in the prompts (so cardPromptVariables interpolates the card's
// selected year) and strip the year prefix from the user-facing label
// entirely (the picker has no card-year context, and "Modern Panini
// Prizm Aurora Borealis Parallel (Fictional)" reads cleaner anyway).
function rewriteFictionalYear(entry) {
  if (!entry?.id || !entry.id.startsWith('fictional_')) return entry
  const out = { ...entry }
  if (typeof out.label === 'string') {
    out.label = out.label
      .replace(/^2025\s+/, '')                    // "2025 Panini Prizm…" → "Panini Prizm…"
      .replace(/\b2025\b/g, '')
      .replace(/\s+/g, ' ')
      .trim()
  }
  if (typeof out.set_name === 'string') {
    out.set_name = out.set_name.replace(/^2025\s+/, '').replace(/\b2025\b/g, '').replace(/\s+/g, ' ').trim()
  }
  // Note: leave `entry.year` alone (it's structural, used as a sort
  // key and as a fallback). The interpolated {{year}} in the prompt
  // overrides it for what the AI sees on the card.
  if (typeof out.front_prompt_template === 'string') {
    out.front_prompt_template = out.front_prompt_template.replace(/\b2025\b/g, '{{year}}')
  }
  if (typeof out.back_prompt_template === 'string') {
    out.back_prompt_template = out.back_prompt_template.replace(/\b2025\b/g, '{{year}}')
  }
  return out
}

const tuned = raw.map(entry => {
  const rewritten = rewriteFictionalYear(entry)
  return {
    ...rewritten,
    front_prompt_template: transformFront(rewritten.front_prompt_template),
    back_prompt_template: transformBack(rewritten.back_prompt_template),
  }
})

fs.writeFileSync(DST, JSON.stringify(tuned, null, 2) + '\n')
console.log(`Transformed ${tuned.length} entries → ${DST}`)
