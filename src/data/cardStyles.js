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
 * Why empty for now:
 *   The full prompt set is being researched separately (a Claude session
 *   building a 40+ entry catalog of brand-accurate descriptions). Once
 *   the JSON output is in hand, paste the entries into CARD_STYLES below
 *   and they're immediately wired into the wizard.
 *
 * Style entry shape:
 *   {
 *     id: string                   // unique slug, e.g. '1989_topps_football'
 *     label: string                // human label for dropdown
 *     brand: string                // 'Topps' | 'Panini' | etc.
 *     year: number                 // year of the real-world set
 *     era: string                  // 'late_80s' | 'modern_panini' | etc.
 *     description: string          // one-paragraph overview
 *     iconicExamples?: string      // famous cards from the set
 *     notes?: string               // prompt-writer guidance
 *     frontPrompt: string          // template with {{vars}}
 *     backPrompt: string           // template with {{vars}}
 *     // Optional: a sample image URL for the picker preview thumbnail.
 *     // Helps users recognize the style at a glance before committing.
 *     samplePreviewUrl?: string
 *   }
 */

export const CARD_STYLES = [
  // PASTE RESEARCH OUTPUT HERE — the array stays empty until the prompt
  // catalog is generated. The wizard already handles an empty registry
  // gracefully (shows a "no styles yet" empty state).
]

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
