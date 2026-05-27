/**
 * Quick-start chips for the Prompt Studio page.
 *
 * Each chip is a lightweight "seed" — clicking one fills the task
 * textarea with a starter sentence and reveals the data-slot rows the
 * AI will need to do that job. Knobs are NOT touched (smart defaults
 * apply unless the user opens Style options and tweaks them).
 *
 * Slot ids must match the slot ids in the customSandbox template
 * (see templates/customSandbox.js) — that's how the page knows which
 * picker to reveal.
 */

export const QUICK_STARTS = [
  {
    id: 'game-recap',
    label: 'Game Recap',
    seed: 'Write a recap of this game — key plays, turning points, and what it meant.',
    slotsToReveal: ['game'],
  },
  {
    id: 'pre-game-scout',
    label: 'Pre-Game Scout',
    seed: "Build a pre-game scouting report on this opponent — strengths, weaknesses, and how to attack them.",
    slotsToReveal: ['team'],
  },
  {
    id: 'rematch-strategy',
    label: 'Rematch Strategy',
    seed: "I've played this opponent before. Build a strategy memo for the rematch — what worked, what didn't, what to change.",
    slotsToReveal: ['game'],
  },
  {
    id: 'player-spotlight',
    label: 'Player Spotlight',
    seed: 'Write a profile of this player — what they bring, where they are trending, and what they mean to the program.',
    slotsToReveal: ['player'],
  },
  {
    id: 'position-group',
    label: 'Position Group',
    seed: 'Check in on this position group — depth, development, who is emerging, and who is a concern.',
    slotsToReveal: ['position', 'team'],
  },
  {
    id: 'season-review',
    label: 'Season Review',
    seed: 'Write a season-in-review — signature wins, low points, and what the whole year added up to.',
    slotsToReveal: ['team', 'year'],
  },
  {
    id: 'hype-piece',
    label: 'Hype Piece',
    seed: "Write a hype piece. Lean in. Don't hedge. Pick the most exciting angle and run with it.",
    slotsToReveal: [],
  },
  {
    id: 'blank',
    label: 'Start Blank',
    seed: '',
    slotsToReveal: [],
  },
]
