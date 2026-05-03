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

function clean(text) {
  if (typeof text !== 'string') return text
  let out = text
  for (const [re, rep] of NOUN_REPLACEMENTS) out = out.replace(re, rep)
  for (const re of STRIP_PATTERNS) out = out.replace(re, '')
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
// resolved by cardPromptVariables.js into a context-aware multi-line data
// block (season → year-by-year career table; game → single-game line;
// rookie → recruiting profile + rookie stats; championship/award → title
// or award detail; custom → user theme). Whatever it expands to is the
// authoritative content for the back; the design language that follows
// only governs visual layout / cardstock / typography.
const BACK_PREAMBLE = [
  'BACK CONTENT (this is the authoritative content for the back of the card — overrides any specific stat reference in the design below):',
  '',
  '{{contextStatBlock}}',
  '',
  'BACK DESIGN: Apply the visual design described below — layout, cardstock, ink colors, typography, panels, cartoons, footers, etc. — and populate every stat panel, biographical paragraph, and content area using the BACK CONTENT block above. Do not fabricate stats, totals, or claims that are not listed there. If the BACK CONTENT block contains a year-by-year career table, render it as a multi-row table even if the design language describes a one-line stats panel. If the BACK CONTENT block describes a single game, render only that game even if the design language describes year-by-year stats.',
  '',
  '---',
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

const tuned = raw.map(entry => ({
  ...entry,
  front_prompt_template: transformFront(entry.front_prompt_template),
  back_prompt_template: transformBack(entry.back_prompt_template),
}))

fs.writeFileSync(DST, JSON.stringify(tuned, null, 2) + '\n')
console.log(`Transformed ${tuned.length} entries → ${DST}`)
