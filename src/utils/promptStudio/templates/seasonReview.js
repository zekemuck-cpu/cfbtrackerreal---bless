/**
 * Season-in-Review — long-form narrative for a team's season.
 *
 * Slots:
 *   - team (team)
 *   - year (year)
 */

import { resolveTeamSlot, resolveYearSlot } from '../slotResolvers'
import { calculateTeamRecordFromGames } from '../../../context/DynastyContext'
import { TEAMS } from '../../../data/teamRegistry'
import { getMascotName } from '../../../data/teams'

export const seasonReview = {
  id: 'season-review',
  name: 'Season-in-Review',
  description: "A long-form recap of a team's season — record, signature wins, low points, what it all meant.",
  category: 'season',

  slots: [
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
      label: 'Season',
      required: true,
      defaultToCurrentYear: true,
    },
  ],

  knobWhitelist: ['voice', 'audience', 'tone', 'length', 'format', 'focus', 'stance'],

  knobDefaults: {
    voice: 'athletic-feature',
    audience: 'hardcore-fan',
    tone: 'conversational',
    length: 'deep',
    format: 'headers',
    focus: 'all-three-phases',
    stance: 'take-a-position',
  },

  render: ({ slots, knobs, ctx }) => {
    const { dynasty } = ctx
    const tid = slots.team
    const year = slots.year ?? dynasty?.currentYear
    if (tid == null) {
      return { data: '_(team not selected)_', task: 'Cannot proceed.' }
    }

    const teams = dynasty?.teams || TEAMS
    const teamName = getMascotName(tid, teams) || `Team ${tid}`

    // Full season game log for this team, this year
    const allGames = (dynasty?.games || [])
      .filter(g => Number(g.team1Tid) === Number(tid) || Number(g.team2Tid) === Number(tid))
      .filter(g => Number(g.year) === Number(year))
      .filter(g => g.team1Score != null && g.team2Score != null && (g.team1Score > 0 || g.team2Score > 0 || g.isPlayed))
      .sort((a, b) => {
        const wa = typeof a.week === 'number' ? a.week : parseInt(a.week, 10) || 99
        const wb = typeof b.week === 'number' ? b.week : parseInt(b.week, 10) || 99
        return wa - wb
      })

    const gameLog = allGames.map(g => {
      const isTeam1 = Number(g.team1Tid) === Number(tid)
      const oppTid = isTeam1 ? Number(g.team2Tid) : Number(g.team1Tid)
      const oppName = getMascotName(oppTid, teams) || `Team ${oppTid}`
      const us = isTeam1 ? g.team1Score : g.team2Score
      const them = isTeam1 ? g.team2Score : g.team1Score
      const result = us > them ? 'W' : us < them ? 'L' : 'T'
      const week = g.bowlName ? g.bowlName : `Wk ${g.week ?? '?'}`
      return `  - ${week}: ${result} ${us}–${them} ${result === 'W' ? 'vs' : 'to'} ${oppName}`
    }).join('\n')

    const rec = calculateTeamRecordFromGames(dynasty, tid, year) || { wins: 0, losses: 0, ties: 0 }
    const recStr = rec.ties > 0 ? `${rec.wins}-${rec.losses}-${rec.ties}` : `${rec.wins}-${rec.losses}`

    const data = [
      resolveTeamSlot(dynasty, tid, { year, recentGames: 0, focus: knobs.focus }),
      '',
      `### Full season game log (${recStr})`,
      gameLog || '  _(no games)_',
      '',
      resolveYearSlot(dynasty, year),
    ].join('\n')

    const task = [
      `Write a season-in-review of ${teamName}'s ${year} season. The piece should:`,
      '',
      `1. **Open with the season's defining quality** — what was this team, in one line?`,
      `2. **Walk through the arc** — early season, mid-season turn, late stretch, postseason if applicable.`,
      `3. **Signature wins** — 1–3 games that defined the high points.`,
      `4. **Low points** — losses or stretches that hurt.`,
      `5. **MVPs** — name the players who carried the team. Use names from the data only.`,
      `6. **Verdict** — was the season a success relative to expectations? Argue the position.`,
    ].join('\n')

    return {
      data,
      task,
      constraints: "Build from the game log above. Don't reference games that aren't listed.",
    }
  },

  getTeamContext: (slots, ctx) => {
    const { dynasty } = ctx
    const teams = dynasty?.teams || TEAMS
    return { teamA: getMascotName(slots.team, teams) || 'This team', teamB: '' }
  },
}
