/**
 * CFP projection — pure snapshot of where the 12-team field would
 * land if the regular season ended today.
 *
 * Selection rules (mirrors the EA CFB 26 / official CFP logic so the
 * dynasty tracker bracket matches the in-game bracket at all times):
 *
 *   1. P4 champions (4) — for each of ACC, Big Ten, Big 12, SEC,
 *      pick the team currently leading the conference standings
 *      (best conf record, falling back to overall record, point diff,
 *      and finally national rank).
 *   2. G6 auto-bid (1) — pick the leader of each of the six G5
 *      conferences (American, Conference USA, MAC, Mountain West,
 *      Pac-12, Sun Belt) using the same standings logic, then take
 *      the highest-ranked among those six leaders. NOT the highest-
 *      ranked G6 team overall — that variant put Boise State (a
 *      ranked-but-non-champion G6 team) into the bracket while EA
 *      correctly seeded Louisiana (lower-ranked but a Sun Belt
 *      champion).
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
  getTeamRecord,
} from '../context/DynastyContext'
import { conferenceTeams as DEFAULT_CONFERENCE_TEAMS } from '../data/conferenceTeams'
import { resolveTid } from '../data/teamRegistry'

const P4_CONFERENCES = ['ACC', 'Big Ten', 'Big 12', 'SEC']
const G6_CONFERENCES = ['American', 'Conference USA', 'MAC', 'Mountain West', 'Pac-12', 'Sun Belt']

// conferenceStandingsByYear uses different conference keys than
// customConferencesByYear ("MWC" vs "Mountain West", "C-USA" vs
// "Conference USA"). Each canonical name maps to every variant that
// might appear in the standings store; the lookup tries them in
// order so a saved standings row is found regardless of which sheet
// flavor produced it.
const CONF_ALIASES = {
  'Mountain West': ['Mountain West', 'MWC', 'Mtn West'],
  'Conference USA': ['Conference USA', 'C-USA', 'CUSA'],
  'Big Ten': ['Big Ten', 'B1G'],
  'Big 12': ['Big 12', 'Big12'],
  'Pac-12': ['Pac-12', 'PAC-12', 'Pac 12'],
  'Sun Belt': ['Sun Belt', 'SBC'],
  'American': ['American', 'AAC'],
  'MAC': ['MAC'],
  'SEC': ['SEC'],
  'ACC': ['ACC'],
}

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

  // 1. Get the current Top 25.
  //
  // Priority order:
  //   a) End-of-season final poll (finalPollsByYear) — most authoritative,
  //      used once the season's wrapped.
  //   b) rankByWeek[latestWeek] across every team in dynasty.teams —
  //      the canonical per-week poll store the Top 25 Sheet writes to
  //      and the Rankings page reads from. We pick the LATEST week that
  //      has at least ~10 ranked teams (matches Rankings page default).
  //   c) buildLiveTop25FromGames as a last-resort fallback for legacy
  //      saves that never populated rankByWeek.
  //
  // Why we don't use buildLiveTop25FromGames directly: each game record
  // carries team1Rank/team2Rank as a per-game snapshot of the rank
  // AT GAME TIME. Across an entire 13-week season those snapshots are
  // wildly inconsistent — multiple teams claim the same rank in the
  // same week because different game screenshots were parsed at
  // different points in the week. Reconstructing the Top 25 from
  // those collisions makes us pick teams nondeterministically (e.g.
  // BOIS, FAU, IOWA, UNC all claim #22 in Wk 12 in this save). The
  // rankByWeek store is the user's explicit Top 25 entry, free of
  // those collisions.
  const finalPoll = dynasty.finalPollsByYear?.[year]?.media
  let rankings, latestWeek
  if (Array.isArray(finalPoll) && finalPoll.length > 0) {
    rankings = finalPoll
      .filter(r => r && r.rank && (r.team || r.tid != null))
      .map(r => ({ rank: Number(r.rank), team: r.team || null, tid: r.tid != null ? Number(r.tid) : null }))
      .sort((a, b) => a.rank - b.rank)
    latestWeek = 'Final'
  } else {
    // Walk rankByWeek across every team to find the latest fully-
    // populated week (≥10 ranked teams). Build the Top 25 from that
    // week's slots, dropping duplicate rank claims (first team to
    // claim each slot wins — same defense the Rankings page uses).
    const POPULATED_THRESHOLD = 10
    const teams = dynasty.teams || {}
    const weekCounts = new Map() // wk -> count of teams ranked that week
    for (const team of Object.values(teams)) {
      const rbw = team?.byYear?.[year]?.rankByWeek ?? team?.byYear?.[String(year)]?.rankByWeek
      if (!rbw) continue
      for (const [wkKey, v] of Object.entries(rbw)) {
        const wk = Number(wkKey)
        if (!Number.isFinite(wk)) continue
        if (typeof v !== 'number' || v < 1 || v > 25) continue
        weekCounts.set(wk, (weekCounts.get(wk) || 0) + 1)
      }
    }
    let chosenWeek = null
    if (weekCounts.size > 0) {
      const populated = [...weekCounts.entries()]
        .filter(([, c]) => c >= POPULATED_THRESHOLD)
        .map(([w]) => w)
        .sort((a, b) => b - a)
      if (populated.length > 0) {
        chosenWeek = populated[0]
      } else {
        // No fully-populated week — pick latest week with ANY data.
        chosenWeek = [...weekCounts.keys()].sort((a, b) => b - a)[0]
      }
    }
    if (chosenWeek != null) {
      const slotMap = new Map() // rank -> { rank, team, tid }
      for (const [tidKey, team] of Object.entries(teams)) {
        const rbw = team?.byYear?.[year]?.rankByWeek ?? team?.byYear?.[String(year)]?.rankByWeek
        if (!rbw) continue
        const v = rbw[chosenWeek] ?? rbw[String(chosenWeek)]
        if (typeof v !== 'number' || v < 1 || v > 25) continue
        if (slotMap.has(v)) continue
        slotMap.set(v, { rank: v, team: team.abbr || null, tid: Number(tidKey) })
      }
      rankings = [...slotMap.values()].sort((a, b) => a.rank - b.rank)
      latestWeek = chosenWeek
    } else {
      const live = buildLiveTop25FromGames(dynasty, year)
      rankings = live.entries || []
      latestWeek = live.week
    }
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

  // Stored conference standings (the data the Conference Standings
  // sheet writes). Indexed by conference name with aliasing — when
  // present, the row with rank=1 (or the top of the sorted list) is
  // the conference champion. This is the SAME data source the rest
  // of the app already uses to populate per-team confWins/confLosses
  // values; surfacing it here makes the projection match what the
  // user sees on the standings page.
  const standingsByConf = dynasty.conferenceStandingsByYear?.[year]
    || dynasty.conferenceStandingsByYear?.[String(year)]
    || null

  const standingsRowsForConf = (conf) => {
    if (!standingsByConf) return null
    const aliases = CONF_ALIASES[conf] || [conf]
    for (const key of aliases) {
      const rows = standingsByConf[key]
      if (Array.isArray(rows) && rows.length > 0) return rows
    }
    return null
  }

  // For any conference: pull the leader from the live conference
  // standings (best conf record, then overall, then point diff). Fall
  // back to the highest-ranked team in the conference when no
  // conference games have been played yet.
  const pickConfChamp = (conf) => {
    // Highest-priority data source: the saved conference standings
    // store. If the user has entered standings for this year, the
    // top row (by rank, or by wins/losses if rank is missing) is the
    // champion. Without this branch the projection was forced to
    // guess from sparse per-team conf records and ended up picking a
    // ranked-but-not-champion G5 team for the auto-bid (Boise State
    // over Louisiana for the 2034 Sun Belt vs Pac-12 case).
    const rows = standingsRowsForConf(conf)
    if (rows) {
      const sorted = [...rows].sort((a, b) => {
        const ar = Number(a.rank)
        const br = Number(b.rank)
        if (Number.isFinite(ar) && Number.isFinite(br) && ar !== br) return ar - br
        const aw = Number(a.wins) || 0, al = Number(a.losses) || 0
        const bw = Number(b.wins) || 0, bl = Number(b.losses) || 0
        if (bw !== aw) return bw - aw
        if (al !== bl) return al - bl
        return 0
      })
      const top = sorted[0]
      if (top) {
        const abbr = top.team || top.abbr
        const tid = top.tid != null ? Number(top.tid) : (abbr ? resolveTid(abbr, teamsSrc) : null)
        const rank = abbr ? (rankByAbbr.get(abbr) ?? null) : null
        if (abbr) return { team: abbr, tid, rank, conference: conf }
      }
    }

    const teamAbbrs = Array.isArray(confMap[conf]) ? confMap[conf] : []
    if (teamAbbrs.length === 0) return null
    const standings = teamAbbrs.map(abbr => {
      const tid = resolveTid(abbr, teamsSrc)
      // Use the coverage-aware helper instead of raw calc — for
      // non-user teams, dynasty.games[] only has user-vs-them games
      // so raw calc would seed conference champions based on a
      // single bowl game outcome. The helper picks the most-complete
      // record source (stored standings row, byYear teamRecord, or
      // calc, whichever covers the most games).
      const helperRec = tid ? getTeamRecord(dynasty, tid, year) : null
      const calc = tid ? calculateTeamRecordFromGames(dynasty, tid, year) : null
      const wins = helperRec?.wins || 0
      const losses = helperRec?.losses || 0
      const confWins = helperRec?.confWins || 0
      const confLosses = helperRec?.confLosses || 0
      // Point diff isn't on the helper's return shape; use calc's
      // diff but only when calc covers as many games as the helper
      // turned up — otherwise default to 0 so a sparse-game blowout
      // can't tiebreak in favor of a non-user team.
      const calcGames = calc ? (calc.wins || 0) + (calc.losses || 0) : 0
      const helperGames = wins + losses
      const diff = calcGames > 0 && calcGames >= helperGames
        ? (calc.pointsFor || 0) - (calc.pointsAgainst || 0)
        : 0
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
    return { team: leader.abbr, tid: leader.tid, rank, conference: conf }
  }

  const used = new Set()
  const projected = []

  for (const conf of P4_CONFERENCES) {
    const champ = pickConfChamp(conf)
    if (champ && !used.has(champ.team)) {
      projected.push({ ...champ, bid: 'p4-champ' })
      used.add(champ.team)
    }
  }

  // G6 auto-bid — highest-ranked G5 conference *champion*, not the
  // highest-ranked G5 team overall. Compute each G6 conference's
  // leader the same way the P4 champs were picked, then take the
  // top-ranked among those six leaders.
  let g6Champ = null
  for (const conf of G6_CONFERENCES) {
    const leader = pickConfChamp(conf)
    if (!leader || used.has(leader.team)) continue
    if (g6Champ == null) { g6Champ = leader; continue }
    const a = leader.rank ?? Infinity
    const b = g6Champ.rank ?? Infinity
    if (a < b) g6Champ = leader
  }
  if (g6Champ) {
    projected.push({ ...g6Champ, bid: 'g6-champ' })
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
