/**
 * Rematch Strategy — the Ezekiel template.
 *
 * "I've already played this opponent. I'm playing them again. What
 * needs to change?"
 *
 * Slots:
 *   - previousGame (game)
 * Auto-derived in render:
 *   - opponent identity (from previousGame's non-user team)
 *   - both teams' games since previousGame (recent form)
 */

import { resolveGameSlot, resolveTeamSlot } from '../slotResolvers'
import { TEAMS } from '../../../data/teamRegistry'
import { getMascotName } from '../../../data/teams'

export const rematchStrategy = {
  id: 'rematch-strategy',
  name: 'Rematch Strategy',
  description: "You've played this opponent. You're playing them again. Build a strategy memo with what's changed since the last meeting and how to adjust.",
  category: 'gameplan',

  slots: [
    {
      id: 'previousGame',
      kind: 'game',
      label: 'Previous meeting',
      required: true,
      helper: 'The game you already played against this opponent.',
    },
  ],

  knobWhitelist: ['voice', 'perspective', 'audience', 'tone', 'length', 'format', 'focus', 'stance'],

  knobDefaults: {
    voice: 'position-coach',
    perspective: 'team-a',
    audience: 'coach',
    tone: 'analytical',
    length: 'deep',
    format: 'memo',
    focus: 'both-sides',
    stance: 'take-a-position',
  },

  render: ({ slots, ctx }) => {
    const { dynasty } = ctx
    const gameId = slots.previousGame
    const game = (dynasty?.games || []).find(g => g.id === gameId)
    if (!game) {
      return {
        data: '_(Previous game not selected — pick one in the data block above.)_',
        task: 'Cannot proceed without a previous game.',
      }
    }

    const userTid = Number(dynasty?.currentTid)
    const t1Tid = Number(game.team1Tid)
    const t2Tid = Number(game.team2Tid)
    const oppTid = t1Tid === userTid ? t2Tid : t1Tid
    const teams = dynasty?.teams || TEAMS
    const userName = getMascotName(userTid, teams) || 'Your team'
    const oppName  = getMascotName(oppTid,  teams) || 'Opponent'

    // Recent form for both sides since the previous meeting.
    const sinceGames = (dynasty?.games || [])
      .filter(g => g.id !== gameId)
      .filter(g => Number(g.year) === Number(game.year))
      .filter(g => {
        const wA = typeof game.week === 'number' ? game.week : parseInt(game.week, 10) || 0
        const wB = typeof g.week === 'number' ? g.week : parseInt(g.week, 10) || 0
        return wB > wA
      })
      .filter(g => g.team1Score != null && g.team2Score != null && (g.team1Score > 0 || g.team2Score > 0 || g.isPlayed))

    const userSince = sinceGames.filter(g => Number(g.team1Tid) === userTid || Number(g.team2Tid) === userTid)
    const oppSince  = sinceGames.filter(g => Number(g.team1Tid) === oppTid  || Number(g.team2Tid) === oppTid)

    const recentLines = (label, tid, gs) => {
      const out = [`\n**${label} since the previous meeting**`]
      if (!gs.length) {
        out.push('  _(no completed games since)_')
        return out.join('\n')
      }
      gs.forEach(g => {
        const isTeam1 = Number(g.team1Tid) === tid
        const oTid = isTeam1 ? Number(g.team2Tid) : Number(g.team1Tid)
        const oName = getMascotName(oTid, teams) || `Team ${oTid}`
        const us = isTeam1 ? g.team1Score : g.team2Score
        const them = isTeam1 ? g.team2Score : g.team1Score
        const result = us > them ? 'W' : us < them ? 'L' : 'T'
        out.push(`  - Wk ${g.week ?? '?'} ${result} ${us}–${them} ${result === 'W' ? 'vs' : 'to'} ${oName}`)
      })
      return out.join('\n')
    }

    const data = [
      resolveGameSlot(dynasty, gameId),
      '',
      resolveTeamSlot(dynasty, userTid, { year: dynasty?.currentYear, recentGames: 0 }),
      recentLines(userName, userTid, userSince),
      '',
      resolveTeamSlot(dynasty, oppTid, { year: dynasty?.currentYear, recentGames: 0 }),
      recentLines(oppName, oppTid, oppSince),
    ].join('\n')

    const task = [
      `${userName} is preparing to play ${oppName} again. Use the previous meeting (above) and both teams' games since (above) to produce a strategy memo for the rematch:`,
      '',
      `1. **What worked** for ${userName} in the previous meeting that's still likely to work.`,
      `2. **What didn't work** and needs to change.`,
      `3. **How ${oppName} has evolved** since the meeting — schemes, personnel, tendencies.`,
      `4. **How ${userName} has evolved** since the meeting — same.`,
      `5. **Key matchups** to watch in the rematch (specific position groups, specific players if the data supports it).`,
      `6. **Recommended adjustments** for ${userName} — concrete, actionable, ranked by impact.`,
    ].join('\n')

    const constraints = [
      "Lead each numbered point with the observation, then the recommendation. Don't bury the recommendation in prose.",
      "If the data doesn't support a strong observation for a section, say so — don't pad with speculation.",
    ].join(' ')

    return { data, task, constraints }
  },

  // Used by the page to auto-resolve team A / team B for fragment
  // substitution. Returns { teamA, teamB } strings.
  getTeamContext: (slots, ctx) => {
    const { dynasty } = ctx
    const game = (dynasty?.games || []).find(g => g.id === slots.previousGame)
    if (!game) return { teamA: '', teamB: '' }
    const userTid = Number(dynasty?.currentTid)
    const t1 = Number(game.team1Tid)
    const t2 = Number(game.team2Tid)
    const oppTid = t1 === userTid ? t2 : t1
    const teams = dynasty?.teams || TEAMS
    return {
      teamA: getMascotName(userTid, teams) || 'Your team',
      teamB: getMascotName(oppTid,  teams) || 'Opponent',
    }
  },
}
