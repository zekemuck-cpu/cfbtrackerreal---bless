/**
 * Game Preview — pre-game analysis for an upcoming opponent.
 *
 * Slots:
 *   - opponent (team)
 *
 * Auto-derived in render:
 *   - both teams' recent form (last 3 each)
 */

import { resolveTeamSlot } from '../slotResolvers'
import { TEAMS } from '../../../data/teamRegistry'
import { getMascotName } from '../../../data/teams'

export const gamePreview = {
  id: 'game-preview',
  name: 'Game Preview',
  description: 'Pre-game analysis for an upcoming opponent. Pulls in both sides’ recent form.',
  category: 'gameplan',

  slots: [
    {
      id: 'opponent',
      kind: 'team',
      label: 'Upcoming opponent',
      required: true,
      helper: 'The team you’re about to play.',
    },
  ],

  knobWhitelist: ['voice', 'perspective', 'audience', 'tone', 'length', 'format', 'focus', 'stance'],

  knobDefaults: {
    voice: 'espn-beat',
    perspective: 'neutral',
    audience: 'hardcore-fan',
    tone: 'analytical',
    length: 'standard',
    format: 'headers',
    focus: 'both-sides',
    stance: 'take-a-position',
  },

  render: ({ slots, knobs, ctx }) => {
    const { dynasty } = ctx
    const oppTid = slots.opponent
    if (oppTid == null) {
      return { data: '_(no opponent selected)_', task: 'Cannot proceed.' }
    }

    const userTid = Number(dynasty?.currentTid)
    const teams = dynasty?.teams || TEAMS
    const userName = getMascotName(userTid, teams) || 'Your team'
    const oppName = getMascotName(oppTid, teams) || 'Opponent'

    const data = [
      `## Your team`,
      resolveTeamSlot(dynasty, userTid, { year: dynasty?.currentYear, recentGames: 3, focus: knobs.focus }),
      '',
      `## Opponent`,
      resolveTeamSlot(dynasty, oppTid, { year: dynasty?.currentYear, recentGames: 3, focus: knobs.focus }),
    ].join('\n')

    const task = [
      `${userName} is about to play ${oppName}. Build a game preview that covers:`,
      '',
      `1. **Both teams' form** — what each has done in their last 3 games.`,
      `2. **Strengths** on each side that should show up in this matchup.`,
      `3. **Vulnerabilities** on each side that the other can attack.`,
      `4. **Key matchups** to watch.`,
      `5. **A pick** — your read of how this plays out, with reasoning.`,
    ].join('\n')

    const constraints = "Cover both teams in roughly equal depth; don't make this a one-sided breakdown unless the data clearly justifies it."

    return { data, task, constraints }
  },

  getTeamContext: (slots, ctx) => {
    const { dynasty } = ctx
    const teams = dynasty?.teams || TEAMS
    return {
      teamA: getMascotName(dynasty?.currentTid, teams) || 'Your team',
      teamB: getMascotName(slots.opponent, teams) || 'Opponent',
    }
  },
}
