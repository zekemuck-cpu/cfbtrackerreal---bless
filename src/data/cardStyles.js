/**
 * Card style registry — describes the AI-image-generation prompts the user
 * runs through Midjourney / Nano Banana / DALL-E / etc. to produce a real-
 * looking trading card front + back for a player.
 *
 * Architecture (replaces the old PNG-template + zone-overlay system):
 *   • Each style entry below carries a FRONT prompt + BACK prompt.
 *   • The user picks a style + a "context" (rookie year, specific game,
 *     championship, award, custom). The app fills the prompt's {{template}}
 *     variables with the player's actual data via cardPromptVariables.js.
 *   • The user copies the populated prompt, generates the image externally,
 *     and uploads the front + back images. The card record stores those
 *     URLs and renders as two flippable images — no live composition.
 *
 * Data source:
 *   `cardStylesRaw.json` is the brand-research catalog (40+ entries
 *   covering the iconic real-world football card sets from 1952 to
 *   present). The transform below maps the research field shape onto
 *   the registry shape the wizard expects. To add a new style, append
 *   to the JSON — no code changes needed here.
 *
 * Style entry shape:
 *   {
 *     id: string                   // unique slug, e.g. '1989_topps_football'
 *     label: string                // human label for dropdown
 *     brand: string                // 'Topps' | 'Panini' | etc.
 *     year: number                 // year of the real-world set
 *     era: string                  // era key (see ERA_LABELS in the wizard)
 *     description: string          // one-paragraph overview
 *     iconicExamples?: string      // famous cards from the set
 *     notes?: string               // prompt-writer guidance
 *     frontPrompt: string          // template with {{vars}}
 *     backPrompt: string           // template with {{vars}}
 *     samplePreviewUrl?: string    // optional thumbnail for the picker
 *   }
 */

import rawStyles from './cardStylesRaw.json'

/**
 * Transform a research-shape entry into the registry shape. Drops the
 * front/back description blocks (those are human-reference, not used at
 * runtime) and renames snake_case keys to camelCase.
 */
function transformRawStyle(s) {
  return {
    id: s.id,
    label: s.label,
    brand: s.brand,
    year: s.year,
    era: s.era,
    description: s.description,
    iconicExamples: s.iconic_examples,
    notes: s.ai_generation_notes,
    frontPrompt: s.front_prompt_template,
    backPrompt: s.back_prompt_template,
  }
}

export const CARD_STYLES = Array.isArray(rawStyles)
  ? rawStyles.filter(Boolean).map(transformRawStyle)
  : []

/** Lookup helper. */
export function getCardStyle(styleId) {
  if (!styleId) return null
  return CARD_STYLES.find(s => s.id === styleId) || null
}

/** Used by the picker. */
export function listCardStyles() {
  return CARD_STYLES.slice()
}

/** Group styles by era for the picker UI. */
export function listCardStylesByEra() {
  const grouped = {}
  for (const s of CARD_STYLES) {
    const era = s.era || 'misc'
    if (!grouped[era]) grouped[era] = []
    grouped[era].push(s)
  }
  // Sort each era group by year ascending so 1952 → 2023 reads naturally.
  for (const era of Object.keys(grouped)) {
    grouped[era].sort((a, b) => (a.year || 0) - (b.year || 0))
  }
  return grouped
}

/**
 * Card "context" — what the card commemorates. Drives which template
 * variables are populated and how the prompt reads.
 *
 *   season         — generic season card (year + stats line)
 *   rookie         — first-year card (RC indicator)
 *   game           — specific game memento (vs. opponent + result)
 *   championship   — won the natty or conference title
 *   award          — won an individual award (Heisman, Maxwell, etc.)
 *   custom         — user-supplied free-form label
 */
export const CARD_CONTEXTS = [
  { id: 'season',       label: 'Season',          hint: 'Generic season card with that year\'s stats.' },
  { id: 'rookie',       label: 'Rookie / Debut',  hint: 'First year on campus — RC stamp, freshman vibes.' },
  { id: 'game',         label: 'Specific Game',   hint: 'Commemorates one game (rivalry win, big upset, etc.).' },
  { id: 'championship', label: 'Championship',    hint: 'CFP / conference title commemorative.' },
  { id: 'award',        label: 'Individual Award', hint: 'Heisman, Maxwell, etc.' },
  { id: 'custom',       label: 'Custom',          hint: 'Free-form context — type the storyline yourself.' },
]

/**
 * Weekly awards a player can win for a specific game. Optional add-on
 * to a 'game' context card — when set, the card becomes a "Player of
 * the Week" commemorative and the back (write-up) reflects the honor.
 * Stored as `card.contextDetails.weeklyAward` (id) on game-context cards.
 */
export const WEEKLY_AWARDS = [
  { id: 'national_offensive',   label: 'National Offensive Player of the Week' },
  { id: 'national_defensive',   label: 'National Defensive Player of the Week' },
  { id: 'conference_offensive', label: 'Conference Offensive Player of the Week' },
  { id: 'conference_defensive', label: 'Conference Defensive Player of the Week' },
]
