/**
 * CFP projection — pure snapshot of where the 12-team field would
 * land if the regular season ended today, derived from the current
 * Top 25 plus conference assignments.
 *
 * NO future-game simulation, no momentum weighting, no Monte Carlo.
 * The output is intentionally a snapshot, clearly labeled as such in
 * the UI so it's never confused with the actual bracket.
 *
 * 12-team rules implemented:
 *   • 4 Power-4 auto-bids — the highest-ranked team in each of ACC,
 *     Big Ten, Big 12, SEC. (Champion projection: top-ranked team
 *     in conference.)
 *   • 1 Group-of-6 auto-bid — the highest-ranked team across the
 *     American, Conference USA, MAC, Mountain West, Pac-12, Sun Belt.
 *     (No conference-championship requirement under the 2026+ format.)
 *   • Notre Dame auto-bid IF Notre Dame is ranked in the top 12.
 *   • 7 at-large bids — the next highest-ranked teams to fill 12.
 *   • Seeded 1-12 strictly by ranking.
 *
 * Inputs: only what the dynasty already tracks — rankings (live from
 * games or final polls), and conference assignments (custom for the
 * year, falling back to the static catalog).
 *
 * The function does NOT mutate dynasty data and does NOT touch the
 * actual cfpSeedsByYear / games / cfpResultsByYear stores. It's a
 * read-only derivation for display.
 */

import { buildLiveTop25FromGames, getCustomConferencesForYear } from '../context/DynastyContext'
import { conferenceTeams as DEFAULT_CONFERENCE_TEAMS } from '../data/conferenceTeams'

const P4_CONFERENCES = ['ACC', 'Big Ten', 'Big 12', 'SEC']
const G6_CONFERENCES = ['American', 'Conference USA', 'MAC', 'Mountain West', 'Pac-12', 'Sun Belt']
const NOTRE_DAME_ABBR = 'ND'

const BID_LABELS = {
  'p4-champ': 'Projected Conf. Champion',
  'g6-champ': 'Projected G6 Auto-Bid',
  'nd':       'Notre Dame Auto-Bid',
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

  // 2. Conference map — custom per-year alignment if the user has
  //    set one (teambuilder dynasty), otherwise the static catalog.
  const customConfs = getCustomConferencesForYear(dynasty, year)
  const confMap = customConfs || DEFAULT_CONFERENCE_TEAMS

  // Resolve a team's conference. Compares by abbr against each
  // conference's roster array. Tid-based teambuilder teams are
  // already in confMap once getCustomConferencesForYear is in play.
  const conferenceOf = (abbr) => {
    if (!abbr) return null
    for (const [conf, teamList] of Object.entries(confMap)) {
      if (Array.isArray(teamList) && teamList.includes(abbr)) return conf
    }
    return null
  }

  const used = new Set() // team abbrs that already have a bid
  const projected = []

  // 3. Power-4 auto-bids — highest-ranked team in each P4.
  for (const conf of P4_CONFERENCES) {
    const champ = rankings.find(r => conferenceOf(r.team) === conf && !used.has(r.team))
    if (champ) {
      projected.push({ ...champ, conference: conf, bid: 'p4-champ' })
      used.add(champ.team)
    }
  }

  // 4. Group-of-6 auto-bid — highest-ranked G6 team.
  const g6Champ = rankings.find(r => {
    const c = conferenceOf(r.team)
    return c && G6_CONFERENCES.includes(c) && !used.has(r.team)
  })
  if (g6Champ) {
    projected.push({ ...g6Champ, conference: conferenceOf(g6Champ.team), bid: 'g6-champ' })
    used.add(g6Champ.team)
  }

  // 5. Notre Dame — auto-bid if ranked in the top 12.
  const nd = rankings.find(r => r.team === NOTRE_DAME_ABBR)
  if (nd && nd.rank <= 12 && !used.has(NOTRE_DAME_ABBR)) {
    projected.push({ ...nd, conference: 'Independent', bid: 'nd' })
    used.add(NOTRE_DAME_ABBR)
  }

  // 6. At-large bids — fill to 12 with the next highest-ranked teams.
  for (const r of rankings) {
    if (projected.length >= 12) break
    if (used.has(r.team)) continue
    projected.push({ ...r, conference: conferenceOf(r.team), bid: 'at-large' })
    used.add(r.team)
  }

  // 7. Seed 1-12 strictly by ranking.
  projected.sort((a, b) => a.rank - b.rank)
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
