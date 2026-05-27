/**
 * Custom Sandbox — power-user template. Mix and match any slots, all
 * knobs exposed, free-text task description.
 *
 * Slots are all optional. The user picks which to include via their
 * data resolutions. The task is whatever the user types into custom
 * notes — there's no built-in task here.
 */

import {
  resolveGameSlot,
  resolveTeamSlot,
  resolvePlayerSlot,
  resolveYearSlot,
  resolvePositionSlot,
} from '../slotResolvers'

export const customSandbox = {
  id: 'custom-sandbox',
  name: 'Custom Sandbox',
  description: 'Power-user mode. Mix any data slots, expose every knob, write your own task in custom notes.',
  category: 'custom',

  slots: [
    { id: 'game',     kind: 'game',     label: 'Game (optional)',     required: false },
    { id: 'team',     kind: 'team',     label: 'Team (optional)',     required: false },
    { id: 'player',   kind: 'player',   label: 'Player (optional)',   required: false },
    { id: 'year',     kind: 'year',     label: 'Year (optional)',     required: false },
    { id: 'position', kind: 'position', label: 'Position (optional)', required: false },
  ],

  knobWhitelist: ['voice', 'perspective', 'audience', 'tone', 'length', 'format', 'outputStyle', 'focus', 'timeHorizon', 'stance'],

  knobDefaults: {
    voice: 'plain-narrator',
    perspective: 'neutral',
    audience: 'general-fan',
    tone: 'analytical',
    length: 'standard',
    format: 'prose',
    outputStyle: 'plain',
    focus: 'both-sides',
    timeHorizon: 'this-season',
    stance: 'lay-out-facts',
  },

  render: ({ slots, knobs, customNotes, ctx }) => {
    const { dynasty } = ctx
    const blocks = []

    if (slots.game)     blocks.push(resolveGameSlot(dynasty, slots.game))
    if (slots.team)     blocks.push(resolveTeamSlot(dynasty, slots.team, { year: slots.year ?? dynasty?.currentYear, recentGames: 3 }))
    if (slots.player)   blocks.push(resolvePlayerSlot(dynasty, slots.player, { year: slots.year ?? dynasty?.currentYear, horizon: knobs.timeHorizon || 'this-season' }))
    if (slots.year)     blocks.push(resolveYearSlot(dynasty, slots.year))
    if (slots.position) blocks.push(resolvePositionSlot(dynasty, slots.position, { tid: slots.team ?? dynasty?.currentTid, year: slots.year ?? dynasty?.currentYear }))

    const data = blocks.length
      ? blocks.join('\n\n')
      : '_(No data slots filled. Use the Custom Notes field below to write the entire prompt yourself.)_'

    const task = customNotes && customNotes.trim()
      ? customNotes.trim()
      : '_(No task specified. Use the Custom Notes field to tell the AI what you want.)_'

    return { data, task }
  },

  getTeamContext: () => ({ teamA: '', teamB: '' }),
}
