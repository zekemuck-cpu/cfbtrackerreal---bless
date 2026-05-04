/**
 * CFP projection — pure snapshot of where the 12-team field would
 * land if the regular season ended today.
 *
 * Selection rules (intentionally simple — no Monte Carlo, no
 * future-game simulation):
 *
 *   1. P4 champions (4) — for each of ACC, Big Ten, Big 12, SEC,
 *      pick the team currently leading the conference standings
 *      (best conf record, falling back to overall record, point diff,
 *      and finally national rank). When no conference game has been
 *      played yet, the highest-ranked team in the conference becomes
 *      the projected champion.
 *   2. G6 auto-bid (1) — the highest-ranked team across the American,
 *      Conference USA, MAC, Mountain West, Pac-12, and Sun Belt.
 *   3. At-large bids (7) — the next 7 highest-ranked teams not
 *      already in.
 *   4. Seed 1-12 strictly by national ranking.
 *
 * No Notre Dame auto-bid in this projection (per the simplified
 * rules the user wants surfaced in the dynasty tracker).
 */

import {
  buildLiveTop25FromGames,
  getCustomConferencesForYear,
  calculateTeamRecordFromGames,
} from '../context/DynastyContext'
import { conferenceTeams as DEFAULT_CONFERENCE_TEAMS } from '../data/conferenceTeams'
import { resolveTid } from '../data/teamRegistry'

const P4_CONFERENCES = ['ACC', 'Big Ten', 'Big 12', 'SEC']
const G6_CONFERENCES = ['American', 'Conference USA', 'MAC', 'Mountain West', 'Pac-12', 'Sun Belt']

const BID_LABELS = {
  'p4-champ': 'Projected Conf. Champion',
  'g6-champ': 'Projected G6 Auto-Bid',
  'at-large': 'At-Large',
}

/**
 * Build the projected 12-team field for a given year.
 *
 * Returns:
 *   { available: false, reason }                       — when no rankings exist
 *   { available: true, week, seeds: [...], notes }     — when projection produced
 *
 * Each seed entry: { seed, rank, team, tid, conference, bid, bidLabel }
 */
export function buildCFPProjection(dynasty, year) {
  if (!dynasty || !year) {
    return { available: false, reason: 'No dynasty or year supplied.' }
  }

  // 1. Get the current Top 25 — uses end-of-season final poll if
  //    one exists, otherwise rebuilds from per-game rank entries.
  const finalPoll = dynasty.finalPollsByYear?.[year]?.media
  let rankings, latestWeek
  if (Array.isArray(finalPoll) && finalPoll.length > 0) {
    rankings = finalPoll
      .filter(r => r && r.rank && (r.team || r.tid != null))
      .map(r => ({ rank: Number(r.rank), team: r.team || null, tid: r.tid != null ? Number(r.tid) : null }))
      .sort((a, b) => a.rank - b.rank)
    latestWeek = 'Final'
  } else {
    const live = buildLiveTop25FromGames(dynasty, year)
    rankings = live.entries || []
    latestWeek = live.week
  }

  if (!rankings || rankings.length === 0) {
    return {
      available: false,
      reason: 'No rankings available for this year yet — enter weekly scores or a final poll to seed the projection.',
    }
  }

  // Build a fast lookup so we can attach a national rank to teams
  // that lead a P4 conference but happen to sit outside the Top 25.
  const rankByAbbr = new Map()
  rankings.forEach(r => { if (r.team) rankByAbbr.set(r.team, r.rank) })

  // 2. Conference map — custom per-year alignment if the user has
  //    set one (teambuilder dynasty), otherwise the static catalog.
  const customConfs = getCustomConferencesForYear(dynasty, year)
  const confMap = customConfs || DEFAULT_CONFERENCE_TEAMS
  const teamsSrc = dynasty.teams || dynasty.customTeams || null

  const conferenceOf = (abbr) => {
    if (!abbr) return null
    for (const [conf, teamList] of Object.entries(confMap)) {
      if (Array.isArray(teamList) && teamList.includes(abbr)) return conf
    }
    return null
  }

  // For each P4 conference: pull the leader from the live conference
  // standings (best conf record, then overall, then point diff). Fall
  // back to the highest-ranked team in the conference when no
  // conference games have been played yet.
  const pickP4Champ = (conf) => {
    const teamAbbrs = Array.isArray(confMap[conf]) ? confMap[conf] : []
    if (teamAbbrs.length === 0) return null
    const standings = teamAbbrs.map(abbr => {
      const tid = resolveTid(abbr, teamsSrc)
      const calc = tid ? calculateTeamRecordFromGames(dynasty, tid, year) : null
      const wins = calc?.wins || 0
      const losses = calc?.losses || 0
      const confWins = calc?.confWins || 0
      const confLosses = calc?.confLosses || 0
      const diff = (calc?.pointsFor || 0) - (calc?.pointsAgainst || 0)
      const rank = rankByAbbr.get(abbr) ?? Infinity
      return { abbr, tid, wins, losses, confWins, confLosses, diff, rank }
    })
    const anyConfPlayed = standings.some(t => t.confWins > 0 || t.confLosses > 0)
    if (anyConfPlayed) {
      standings.sort((a, b) => {
        if (b.confWins !== a.confWins) return b.confWins - a.confWins
        if (a.confLosses !== b.confLosses) return a.confLosses - b.confLosses
        if (b.wins !== a.wins) return b.wins - a.wins
        if (a.losses !== b.losses) return a.losses - b.losses
        if (b.diff !== a.diff) return b.diff - a.diff
        return a.rank - b.rank
      })
    } else {
      // No conf games played — fall back to highest national rank.
      standings.sort((a, b) => a.rank - b.rank)
    }
    const leader = standings[0]
    if (!leader) return null
    const rank = leader.rank === Infinity ? null : leader.rank
    return { team: leader.abbr, tid: leader.tid, rank, conference: conf, bid: 'p4-champ' }
  }

  const used = new Set()
  const projected = []

  for (const conf of P4_CONFERENCES) {
    const champ = pickP4Champ(conf)
    if (champ && !used.has(champ.team)) {
      projected.push(champ)
      used.add(champ.team)
    }
  }

  // G6 auto-bid — highest-ranked G6 team.
  const g6Champ = rankings.find(r => {
    const c = conferenceOf(r.team)
    return c && G6_CONFERENCES.includes(c) && !used.has(r.team)
  })
  if (g6Champ) {
    projected.push({ ...g6Champ, conference: conferenceOf(g6Champ.team), bid: 'g6-champ' })
    used.add(g6Champ.team)
  }

  // At-large bids — fill remaining slots with the next highest-ranked
  // teams (max 7, capped by the overall 12-team field).
  for (const r of rankings) {
    if (projected.length >= 12) break
    if (used.has(r.team)) continue
    projected.push({ ...r, conference: conferenceOf(r.team), bid: 'at-large' })
    used.add(r.team)
  }

  // Seed 1-12 strictly by national ranking. P4 champs that sit
  // outside the rankings get pushed to the bottom of the projected
  // field but stay in (their auto-bid is intact).
  projected.sort((a, b) => {
    const ar = a.rank ?? 9999
    const br = b.rank ?? 9999
    return ar - br
  })
  const seeds = projected.slice(0, 12).map((p, i) => ({
    ...p,
    seed: i + 1,
    bidLabel: BID_LABELS[p.bid] || p.bid,
  }))

  let notes = null
  if (seeds.length < 12) {
    notes = `Only ${seeds.length} teams placed — projection completes once every P4 conference and the highest G6 team have a ranked entry in the Top 25.`
  }

  return { available: true, week: latestWeek, seeds, notes }
}
