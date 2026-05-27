/**
 * Position Group Check-In — how a position group is performing for a
 * team in a year.
 *
 * Slots:
 *   - position (position)
 *   - year (year)
 *   - team (team)
 */

import { resolvePositionSlot } from '../slotResolvers'
import { TEAMS } from '../../../data/teamRegistry'
import { getMascotName } from '../../../data/teams'

export const positionGroup = {
  id: 'position-group',
  name: 'Position Group Check-In',
  description: 'How a position group is doing for a team in a year — depth, development, concerns.',
  category: 'season',

  slots: [
    {
      id: 'position',
      kind: 'position',
      label: 'Position',
      required: true,
    },
    {
      id: 'team',
      kind: 'team',
      label: 'Team',
      required: true,
      defaultToUserTeam: true,
    },
    {
      id: 'year',
      kind: 'year',
      label: 'Year',
      required: true,
      defaultToCurrentYear: true,
    },
  ],

  knobWhitelist: ['voice', 'audience', 'tone', 'length', 'format', 'focus', 'timeHorizon', 'stance'],

  knobDefaults: {
    voice: 'position-coach',
    audience: 'hardcore-fan',
    tone: 'analytical',
    length: 'standard',
    format: 'headers',
    focus: 'all-three-phases',
    timeHorizon: 'this-season',
    stance: 'lay-out-facts',
  },

  render: ({ slots, knobs, ctx }) => {
    const { dynasty } = ctx
    const position = slots.position
    const tid = slots.team
    const year = slots.year ?? dynasty?.currentYear

    if (!position || tid == null) {
      return { data: '_(position or team not selected)_', task: 'Cannot proceed.' }
    }

    const teams = dynasty?.teams || TEAMS
    const teamName = getMascotName(tid, teams) || `Team ${tid}`

    const data = resolvePositionSlot(dynasty, position, {
      tid,
      year,
      horizon: knobs.timeHorizon,
      focus: knobs.focus,
    })

    const task = [
      `Write a check-in on ${teamName}'s ${position} group for the ${year} season. The piece should:`,
      '',
      `1. **Depth chart status** — who's the starter, who's the backup, what's the rotation.`,
      `2. **Production** — what the group's stat totals say about output vs. expectations.`,
      `3. **Who's emerging** — players trending up.`,
      `4. **Concerns** — players trending down, depth gaps, injury exposure.`,
      `5. **Forward look** — what this group needs (recruiting, development, scheme).`,
    ].join('\n')

    return {
      data,
      task,
      constraints: `Stay focused on the ${position} group. Don't drift into other positions unless the comparison is unavoidable.`,
    }
  },

  getTeamContext: (slots, ctx) => {
    const { dynasty } = ctx
    const teams = dynasty?.teams || TEAMS
    return { teamA: getMascotName(slots.team, teams) || 'This team', teamB: '' }
  },
}
