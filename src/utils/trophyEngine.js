// Retroactive trophy-detection engine.
//
// Given a dynasty and a coach's stints (the per-team coaching periods from
// CoachCareer's `coachingHistory`), figure out which catalog trophies the coach
// has won and in which season(s), by scanning their games + the dynasty awards.
//
// Detection by category:
//   national    — won a CFP championship game
//   conference  — won a conference championship game (matched by game.conference)
//   bowl        — won a bowl game (matched by game.bowlName)
//   rivalry     — beat a rival (coach's tid + opponent tid both in a rivalry trophy)
//   award       — a player on the coach's team that year won the award (dynasty.awardsByYear)
//
// Returns { [trophyId]: [{ year, ...detail }, ...] } — only EARNED trophies.

import { TROPHIES, TROPHY_BY_ID } from '../data/trophies'
import { TEAMS, getTidFromTeamName, getTidFromAbbr } from '../data/teamRegistry'
import { stripMascotFromName } from '../data/teams'
import { normalizeAwardName } from './playerHeal'

// game.conference string → conference trophy id
const CONFERENCE_TROPHY = {
  SEC: 'sec-championship',
  'Big Ten': 'big-ten-championship',
  ACC: 'acc-championship',
  'Big 12': 'big-12-championship',
  American: 'american-championship',
  'Conference USA': 'cusa-championship',
  MAC: 'mac-championship',
  'Mountain West': 'mwc-championship',
  'Pac-12': 'pac-12-championship',
  'Sun Belt': 'sun-belt-championship',
}

// canonical award key (post-normalizeAwardName) → award trophy id
const AWARD_TROPHY = {
  heisman: 'heisman', maxwell: 'maxwell-award', walterCamp: 'walter-camp',
  chuckBednarik: 'chuck-bednarik', broncoNagurski: 'bronco-nagurski', outland: 'outland-trophy',
  lombardi: 'lombardi-award', bearBryantCoachOfTheYear: 'bear-bryant-coy', daveyObrien: 'davey-obrien',
  doakWalker: 'doak-walker', johnMackey: 'john-mackey', fredBiletnikoff: 'biletnikoff-award',
  jimThorpe: 'jim-thorpe', unitasGoldenArm: 'unitas-golden-arm', dickButkus: 'butkus-award',
  edgeRusherOfTheYear: 'edge-rusher-of-the-year', tedHendricksAward: 'edge-rusher-of-the-year',
  rimington: 'rimington-trophy', louGroza: 'lou-groza', rayGuy: 'ray-guy',
  broyles: 'broyles-award', returnerOfTheYear: 'returner-of-the-year',
}

// ── Bowl name matching ─────────────────────────────────────────────────────
// game.bowlName is a free-ish display string ('Sugar Bowl', 'Cheez-It Citrus
// Bowl'); trophy names are '<Bowl> Trophy'. Normalize both and match, with a
// suffix fallback so a sponsor prefix ('Cheez-It Citrus Bowl' → 'citrus bowl')
// still resolves.
const normBowl = (s) => String(s || '').toLowerCase()
  .replace(/[^a-z0-9 ]/g, ' ')
  .replace(/\b(the|trophy|classic|presented|by|hosted)\b/g, ' ')
  .replace(/\s+/g, ' ').trim()

const BOWL_INDEX = (() => {
  const idx = {}
  for (const t of TROPHIES) if (t.category === 'bowl') idx[normBowl(t.name)] = t.id
  return idx
})()

function matchBowlTrophy(bowlName) {
  const key = normBowl(bowlName)
  if (!key) return null
  if (BOWL_INDEX[key]) return BOWL_INDEX[key]
  // sponsor-prefix fallback: 'cheezit citrus bowl' endsWith ' citrus bowl'
  for (const [k, id] of Object.entries(BOWL_INDEX)) {
    if (key.endsWith(' ' + k)) return id
  }
  return null
}

// ── Rivalry resolution (team NAMES → tids, once per dynasty) ────────────────
// Trophy `teams` use short school names ('Kentucky', 'Arizona State') but the
// registry stores full mascot names ('Kentucky Wildcats'). Build a mascot-
// stripped school index so 'Kentucky' → tid 109. Dynasty (custom) names override
// the static registry.
function buildSchoolIndex(dynasty) {
  const idx = {}
  const put = (tid, name) => {
    if (!name) return
    const full = String(name).trim().toLowerCase()
    if (full) idx[full] = Number(tid)
    const school = (stripMascotFromName(name) || '').trim().toLowerCase()
    if (school) idx[school] = Number(tid)
  }
  for (const [tid, t] of Object.entries(TEAMS)) put(tid, t?.name)
  for (const [tid, t] of Object.entries(dynasty?.teams || {})) put(tid, t?.name)
  return idx
}

function resolveTeamNameToTid(name, schoolIdx, dynasty) {
  if (!name) return null
  const lc = String(name).trim().toLowerCase()
  if (schoolIdx[lc] != null) return schoolIdx[lc]
  let tid = getTidFromAbbr(name, dynasty?.teams || dynasty)
  if (tid != null) return Number(tid)
  tid = getTidFromTeamName(name, dynasty?.teams)
  if (tid != null) return Number(tid)
  return null
}

function resolveRivalryTidSets(dynasty) {
  const schoolIdx = buildSchoolIndex(dynasty)
  const out = []
  for (const t of TROPHIES) {
    if (t.category !== 'rivalry' || !Array.isArray(t.teams)) continue
    const tids = new Set()
    for (const nm of t.teams) {
      const tid = resolveTeamNameToTid(nm, schoolIdx, dynasty)
      if (tid != null) tids.add(tid)
    }
    if (tids.size >= 2) out.push({ id: t.id, tids })
  }
  return out
}

// Resolve an award winner's pid for the player-page link. awardsByYear stores
// the player NAME only, so match against dynasty.players: prefer name + on the
// award team that year, then name + an accolade that year, then a unique name.
function findAwardPlayerPid(dynasty, name, year, tid) {
  if (!name) return null
  const players = dynasty?.players || []
  const norm = String(name).toLowerCase().trim()
  const named = players.filter((p) => (p.name || '').toLowerCase().trim() === norm)
  if (!named.length) return null
  for (const p of named) {
    const ty = p.teamsByYear?.[year] ?? p.teamsByYear?.[String(year)]
    if (ty != null && Number(ty) === Number(tid)) return p.pid
  }
  for (const p of named) {
    if ((p.accolades || []).some((a) => Number(a.year) === Number(year))) return p.pid
  }
  return named.length === 1 ? named[0].pid : null
}

function coachWon(game, tid) {
  if (game?.winnerTid != null && game.winnerTid !== '') return Number(game.winnerTid) === tid
  const t1 = Number(game?.team1Tid), t2 = Number(game?.team2Tid)
  const s1 = game?.team1Score, s2 = game?.team2Score
  if ((t1 === tid || t2 === tid) && s1 != null && s1 !== '' && s2 != null && s2 !== '') {
    const my = t1 === tid ? Number(s1) : Number(s2)
    const opp = t1 === tid ? Number(s2) : Number(s1)
    return my > opp
  }
  return false
}

/**
 * @param {Object} dynasty
 * @param {Array}  stints  CoachCareer `coachingHistory` — each { teamTid, startYear, endYear, games }
 * @returns {Object} { [trophyId]: [{ year, ...detail }] }
 */
export function getEarnedTrophies(dynasty, stints) {
  const earned = {}
  const add = (id, year, detail = {}) => {
    if (!id || !TROPHY_BY_ID[id]) return
    ;(earned[id] = earned[id] || []).push({ year, ...detail })
  }
  if (!dynasty) return earned
  const stintList = Array.isArray(stints) ? stints : []

  // year → Set(tid) the coach led
  const coachYearTids = new Map()
  for (const st of stintList) {
    if (st?.teamTid == null) continue
    for (let y = Number(st.startYear); y <= Number(st.endYear); y++) {
      if (!coachYearTids.has(y)) coachYearTids.set(y, new Set())
      coachYearTids.get(y).add(Number(st.teamTid))
    }
  }

  const rivalrySets = resolveRivalryTidSets(dynasty)

  // Games → national / conference / bowl / rivalry
  for (const st of stintList) {
    const tid = Number(st?.teamTid)
    if (!Number.isFinite(tid)) continue
    for (const g of st.games || []) {
      if (!coachWon(g, tid)) continue
      const year = Number(g.year)
      const gt = g.gameType
      // CFP quarterfinals & semifinals are played at — and named after — New
      // Year's Six bowl sites (Rose, Sugar, Fiesta…), so winning one IS winning
      // that bowl: credit its bowl trophy. The on-campus first round carries no
      // bowlName (matchBowlTrophy no-ops), and the championship grants the
      // national title below — neither should award a bowl trophy.
      const isCfpQuarterOrSemi = g.isCFPSemifinal || g.isCFPQuarterfinal ||
        gt === 'cfp_semifinal' || gt === 'cfp_quarterfinal'
      if (g.isCFPChampionship || gt === 'cfp_championship') {
        add('national-championship', year, { game: g, tid })
      } else if (g.isConferenceChampionship || gt === 'conference_championship') {
        add(CONFERENCE_TROPHY[g.conference], year, { game: g, tid, conference: g.conference })
      } else if (g.isBowlGame || gt === 'bowl' || isCfpQuarterOrSemi) {
        add(matchBowlTrophy(g.bowlName), year, { game: g, tid, bowl: g.bowlName })
      }
      // rivalry — orthogonal: any win over a rival counts
      const oppTid = Number(g.team1Tid) === tid ? Number(g.team2Tid) : Number(g.team1Tid)
      if (Number.isFinite(oppTid)) {
        for (const r of rivalrySets) {
          if (r.tids.has(tid) && r.tids.has(oppTid)) { add(r.id, year, { game: g, tid, opponent: oppTid }); break }
        }
      }
    }
  }

  // Awards → credit the coach when a player on their team that year won
  const awardsByYear = dynasty.awardsByYear || {}
  for (const [yk, awards] of Object.entries(awardsByYear)) {
    const year = Number(yk)
    const coachTids = coachYearTids.get(year)
    if (!coachTids || !coachTids.size || !awards) continue
    for (const [rawKey, data] of Object.entries(awards)) {
      if (!data || !data.team) continue
      const key = normalizeAwardName(rawKey)
      const trophyId = AWARD_TROPHY[key] || AWARD_TROPHY[rawKey]
      if (!trophyId) continue
      const awardTid = getTidFromAbbr(data.team, dynasty?.teams || dynasty)
      if (awardTid != null && coachTids.has(Number(awardTid))) {
        const pid = findAwardPlayerPid(dynasty, data.player, year, Number(awardTid))
        add(trophyId, year, { player: data.player, position: data.position, team: data.team, awardTid: Number(awardTid), pid })
      }
    }
  }

  return earned
}

// The conference-championship trophy for a conference name (game.conference) —
// used to badge the conference champion in the standings.
export function getConferenceTrophy(conference) {
  const id = CONFERENCE_TROPHY[conference]
  return id ? TROPHY_BY_ID[id] : null
}

// The rivalry trophy (if any) contested when these two teams meet — used to
// badge a game with its rivalry trophy.
export function getRivalryTrophyForTeams(dynasty, tidA, tidB) {
  const a = Number(tidA), b = Number(tidB)
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null
  for (const r of resolveRivalryTidSets(dynasty)) {
    if (r.tids.has(a) && r.tids.has(b)) return TROPHY_BY_ID[r.id]
  }
  return null
}

// The user's own AI-generated custom rivalry trophy (name/image/description
// entered via RivalriesTab.jsx and saved onto dynasty.rivalries) — separate
// from the static real-world TROPHIES catalog above. Each dynasty.rivalries
// entry is scoped to the user's own program (rivalTid = the OTHER team in
// the matchup), so this only resolves when one of the two tids is the
// user's own team.
export function getCustomRivalryTrophy(dynasty, myTid, otherTid) {
  const my = Number(myTid), other = Number(otherTid)
  if (!Number.isFinite(my) || !Number.isFinite(other)) return null
  const rivalries = dynasty?.rivalries || []
  return rivalries.find(r => Number(r.rivalTid) === other && r.trophyImageUrl) || null
}

// Distinct, sorted years a trophy was earned.
export function earnedYears(instances) {
  return [...new Set((instances || []).map((e) => Number(e.year)).filter(Number.isFinite))].sort((a, b) => a - b)
}
