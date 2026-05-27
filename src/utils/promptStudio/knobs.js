/**
 * Knob enumerations for the AI Prompt Studio.
 *
 * Each knob is a UI dial the user can opt into (via the checkbox tray at
 * the top of the page) to override a template's default. The option IDs
 * here are the keys consumers store and pass around. Labels are what
 * the dropdown shows the user. The actual prompt-text snippets that
 * each option contributes to the final prompt live in knobFragments.js
 * — keep this file display-only.
 */

// Every knob ends with this single sentinel option. When chosen, the
// UI reveals a free-text input for the user to type their own direction;
// compose.js routes that text into the prompt in place of a fragment.
const CUSTOM = { id: 'custom', label: 'Custom (type your own)…' }

export const KNOB_DEFS = {
  voice: {
    id: 'voice',
    label: 'Voice',
    helper: 'Who is speaking',
    options: [
      { id: 'espn-beat',         label: 'ESPN beat writer' },
      { id: 'athletic-feature',  label: 'The Athletic feature' },
      { id: 'hometown-reporter', label: 'Hometown beat reporter' },
      { id: 'fan-blog',          label: 'Hometown fan blog' },
      { id: 'color-commentator', label: 'Color commentator' },
      { id: 'position-coach',    label: 'Position coach (internal)' },
      { id: 'scout',             label: 'Scout report' },
      { id: 'recruiting-analyst', label: 'Recruiting analyst' },
      { id: 'plain-narrator',    label: 'Plain narrator' },
      CUSTOM,
    ],
  },

  perspective: {
    id: 'perspective',
    label: 'Perspective',
    helper: 'Whose side the analysis takes',
    options: [
      { id: 'team-a',  label: "Your team's side" },
      { id: 'team-b',  label: "Opponent's side" },
      { id: 'neutral', label: 'Neutral / objective' },
      CUSTOM,
    ],
  },

  audience: {
    id: 'audience',
    label: 'Audience',
    helper: 'Who is reading',
    options: [
      { id: 'general-fan',        label: 'General fan' },
      { id: 'hardcore-fan',       label: 'Hardcore fan' },
      { id: 'coach',              label: 'Coach' },
      { id: 'scout',              label: 'Scout' },
      { id: 'recruit',            label: 'Recruit' },
      { id: 'recruiting-analyst', label: 'Recruiting analyst' },
      { id: 'casual-visitor',     label: 'Casual visitor' },
      CUSTOM,
    ],
  },

  tone: {
    id: 'tone',
    label: 'Tone',
    helper: 'How it sounds',
    options: [
      { id: 'analytical',    label: 'Analytical' },
      { id: 'conversational', label: 'Conversational' },
      { id: 'hype',          label: 'Hype' },
      { id: 'restrained',    label: 'Restrained' },
      { id: 'polemical',     label: 'Polemical' },
      { id: 'humorous',      label: 'Humorous / witty' },
      { id: 'dramatic',      label: 'Dramatic / cinematic' },
      { id: 'urgent',        label: 'Urgent / high-stakes' },
      { id: 'reflective',    label: 'Reflective / retrospective' },
      { id: 'snarky',        label: 'Snarky / sarcastic' },
      { id: 'reverent',      label: 'Reverent / awed' },
      { id: 'blunt',         label: 'Blunt / no-fluff' },
      { id: 'wistful',       label: 'Wistful / mournful' },
      { id: 'celebratory',   label: 'Celebratory / triumphant' },
      { id: 'somber',        label: 'Somber / serious' },
      { id: 'playful',       label: 'Playful / cheeky' },
      CUSTOM,
    ],
  },

  length: {
    id: 'length',
    label: 'Length',
    helper: 'How much',
    options: [
      { id: 'headline',     label: 'Headline (1–2 sentences)' },
      { id: 'brief',        label: 'Brief (~150 words)' },
      { id: 'standard',     label: 'Standard (~500 words)' },
      { id: 'deep',         label: 'Deep (~1000+ words)' },
      { id: 'bullets-only', label: 'Bullets only' },
      CUSTOM,
    ],
  },

  format: {
    id: 'format',
    label: 'Format',
    helper: 'How it is structured',
    options: [
      { id: 'prose',    label: 'Prose paragraphs' },
      { id: 'headers',  label: 'Headers + paragraphs' },
      { id: 'bulleted', label: 'Bulleted list' },
      { id: 'qa',       label: 'Q & A' },
      { id: 'memo',     label: 'Memo / brief' },
      { id: 'thread',   label: 'Twitter thread' },
      CUSTOM,
    ],
  },

  outputStyle: {
    id: 'outputStyle',
    label: 'Output style',
    helper: 'What markup the response should use',
    options: [
      { id: 'plain',    label: 'Plain text (no markup)' },
      { id: 'markdown', label: 'Markdown' },
      { id: 'html',     label: 'HTML' },
      { id: 'richtext', label: 'Rich text (light formatting)' },
      { id: 'bbcode',   label: 'BBCode (forum)' },
      CUSTOM,
    ],
  },

  focus: {
    id: 'focus',
    label: 'Focus',
    helper: 'Which side of the ball',
    options: [
      { id: 'offense',          label: 'Offense' },
      { id: 'defense',          label: 'Defense' },
      { id: 'special-teams',    label: 'Special teams' },
      { id: 'both-sides',       label: 'Both sides (offense + defense)' },
      { id: 'all-three-phases', label: 'All three phases' },
      { id: 'personnel',        label: 'Personnel' },
      { id: 'scheme',           label: "Scheme / X's & O's" },
      { id: 'game-plan',        label: 'Game plan / strategy' },
      CUSTOM,
    ],
  },

  timeHorizon: {
    id: 'timeHorizon',
    label: 'Time horizon',
    helper: 'Which window of data',
    options: [
      { id: 'this-game',      label: 'This game' },
      { id: 'this-season',    label: 'This season' },
      { id: 'career',         label: 'Career' },
      { id: 'last-3-games',   label: 'Last 3 games' },
      { id: 'vs-ranked',      label: 'Vs ranked opponents' },
      { id: 'vs-conference',  label: 'Vs conference opponents' },
      { id: 'vs-noncon',      label: 'Vs non-conference opponents' },
      CUSTOM,
    ],
  },

  stance: {
    id: 'stance',
    label: 'Stance',
    helper: 'How committed',
    options: [
      { id: 'take-a-position', label: 'Take a position' },
      { id: 'lay-out-facts',   label: 'Lay out the facts' },
      { id: 'devils-advocate', label: "Devil's advocate" },
      { id: 'optimistic',      label: 'Optimistic' },
      { id: 'pessimistic',     label: 'Pessimistic / critical' },
      CUSTOM,
    ],
  },
}

// The sentinel option id every knob uses for free-text custom input.
export const CUSTOM_OPTION_ID = 'custom'

// Ordered list — used by the UI to render checkboxes left-to-right,
// top-to-bottom in this order, and to render the bottom controls in
// the same order.
export const KNOB_ORDER = [
  'voice',
  'perspective',
  'audience',
  'tone',
  'length',
  'format',
  'outputStyle',
  'focus',
  'timeHorizon',
  'stance',
]

// Convenience: look up an option's label by knob + option id.
export function getKnobOptionLabel(knobId, optionId) {
  const knob = KNOB_DEFS[knobId]
  if (!knob) return optionId
  const opt = knob.options.find(o => o.id === optionId)
  return opt ? opt.label : optionId
}
