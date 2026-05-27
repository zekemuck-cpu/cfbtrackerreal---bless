/**
 * Player Spotlight — writeup of a single player's performance.
 *
 * Slots:
 *   - player (player)
 *
 * The Time horizon knob controls what data window the player resolver
 * uses (this season / career / last 3 games).
 */

import { resolvePlayerSlot } from '../slotResolvers'

export const playerSpotlight = {
  id: 'player-spotlight',
  name: 'Player Spotlight',
  description: 'A writeup of a single player — performance, context, narrative.',
  category: 'player',

  slots: [
    {
      id: 'player',
      kind: 'player',
      label: 'Player',
      required: true,
      helper: 'The player to write about.',
    },
  ],

  knobWhitelist: ['voice', 'audience', 'tone', 'length', 'format', 'timeHorizon', 'stance'],

  knobDefaults: {
    voice: 'athletic-feature',
    audience: 'hardcore-fan',
    tone: 'conversational',
    length: 'standard',
    format: 'prose',
    timeHorizon: 'this-season',
    stance: 'lay-out-facts',
  },

  render: ({ slots, knobs, ctx }) => {
    const { dynasty } = ctx
    const pid = slots.player
    if (pid == null) {
      return { data: '_(no player selected)_', task: 'Cannot proceed.' }
    }

    const player = (dynasty?.players || []).find(p => Number(p.pid) === Number(pid))
    const playerName = player?.name || 'the player'
    const horizon = knobs.timeHorizon || 'this-season'

    const data = resolvePlayerSlot(dynasty, pid, {
      year: dynasty?.currentYear,
      horizon,
      focus: knobs.focus,
    })

    const horizonLabel = {
      'this-season': "this season",
      'career': "their career",
      'last-3-games': "their last 3 games",
      'this-game': "the selected game",
    }[horizon] || 'the available data'

    const task = [
      `Write a player spotlight on ${playerName} based on ${horizonLabel}. The piece should:`,
      '',
      `1. **Open with a hook** — what makes this player worth writing about right now.`,
      `2. **Walk through the stats** — translate the numbers into what they mean on the field.`,
      `3. **Place them in context** — how their performance compares to expectations, position group, team needs.`,
      `4. **End with a forward look** — what to watch next, or what their performance suggests about the future.`,
    ].join('\n')

    return {
      data,
      task,
      constraints: "Center the piece on this one player. Other players can be mentioned as context but should not become the subject.",
    }
  },

  getTeamContext: (slots, ctx) => {
    const { dynasty } = ctx
    const player = (dynasty?.players || []).find(p => Number(p.pid) === Number(slots.player))
    return { teamA: player?.name || 'this player', teamB: '' }
  },
}
