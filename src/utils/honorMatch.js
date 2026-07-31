// Shared All-American / All-Conference honor matching.
//
// dynasty.allAmericansByYear[year] = { allAmericans: [...], allConference: [...] }
// stores each honor as a name+school entry (no pid) — this is the sheet-style
// entry shape used by both the manual entry modals AND cfb27SaveSync.js's
// auto-import. Resolving WHICH roster player a given entry belongs to only
// happens at render time via fuzzy name+school matching — the same matcher
// AllAmericans.jsx/AllConference.jsx each keep a local copy of, duplicated
// here so those two (already working) pages don't need to change to pick up
// the new consumers below.
//
// Manually-entered honors additionally get copied onto the player record
// itself (player.allAmericans / player.allConference) by processHonorPlayers
// (DynastyContext.jsx) when saved through the AllAmericans/AllConference
// modals. cfb27 auto-sync (cfb27SaveSync.js) writes straight into
// dynasty.allAmericansByYear and never calls processHonorPlayers, so for
// synced dynasties those per-player arrays stay empty. computeLiveHonorsByPid
// below re-derives the same per-player honor list at render time so pages
// like Player.jsx's Awards tab and TeamYear.jsx's franchise stats show synced
// honors too, without requiring a data migration.

import { isOpenTarget } from './recruitingTargets'
import { normalizePlayerName } from './playerMatching'
import { TEAMS } from '../data/teamRegistry'

const cleanPlayerName = (name) => {
  if (!name) return ''
  return name.replace(/^[\s★⭐✦•*·●◆♦▪■\-–—]+/, '').trim()
}

export function matchHonorToPlayer(dynasty, playerName, school, schoolTid = null) {
  if (!playerName || !dynasty?.players) return null

  const normalizedName = normalizePlayerName(cleanPlayerName(playerName))
  const normalizedSchool = school?.toUpperCase()
  const tidNum = schoolTid != null ? Number(schoolTid) : null

  const playerMatchesTid = (p) => {
    if (tidNum == null) return false
    if (typeof p.team === 'number' && Number(p.team) === tidNum) return true
    if (p.teamsByYear) {
      for (const v of Object.values(p.teamsByYear)) {
        if (v != null && Number(v) === tidNum) return true
      }
    }
    if (p.allAmericans?.some(aa => aa.schoolTid != null && Number(aa.schoolTid) === tidNum)) return true
    if (p.allConference?.some(ac => ac.schoolTid != null && Number(ac.schoolTid) === tidNum)) return true
    return false
  }

  const playerMatchesSchool = (p) => {
    if (!normalizedSchool) return false
    if (p.allAmericans?.some(aa => aa.school?.toUpperCase() === normalizedSchool)) return true
    if (p.allConference?.some(ac => ac.school?.toUpperCase() === normalizedSchool)) return true
    const resolveAbbrForTid = (tid) => {
      const t = dynasty?.teams?.[tid] || dynasty?.customTeams?.[tid] || TEAMS[tid]
      return t?.abbr?.toUpperCase() || null
    }
    if (p.team) {
      const playerTeamAbbr = typeof p.team === 'number' ? resolveAbbrForTid(p.team) : p.team.toUpperCase()
      if (playerTeamAbbr === normalizedSchool) return true
    }
    if (p.teamsByYear) {
      for (const tid of Object.values(p.teamsByYear)) {
        if (typeof tid === 'number' && resolveAbbrForTid(tid) === normalizedSchool) return true
        if (typeof tid === 'string' && tid.toUpperCase() === normalizedSchool) return true
      }
    }
    return false
  }

  const nameMatches = dynasty.players.filter(p =>
    !isOpenTarget(p) && normalizePlayerName(p.name) === normalizedName
  )

  if (nameMatches.length === 0) return null
  if (nameMatches.length === 1) return nameMatches[0]

  const tidMatch = nameMatches.find(p => playerMatchesTid(p))
  if (tidMatch) return tidMatch
  const schoolMatch = nameMatches.find(p => playerMatchesSchool(p))
  if (schoolMatch) return schoolMatch

  return nameMatches[0]
}

/**
 * Re-derive every player's All-American / All-Conference honors straight from
 * dynasty.allAmericansByYear, keyed by pid. Computed in one pass (each honor
 * entry matched once) so it's cheap to call once per page and reuse across a
 * whole roster, rather than re-matching per player.
 *
 * @returns {Map<string, {allAmericans: Array, allConference: Array}>}
 */
export function computeLiveHonorsByPid(dynasty) {
  const byPid = new Map()
  const byYear = dynasty?.allAmericansByYear
  if (!byYear) return byPid

  const addHonor = (pid, type, year, entry) => {
    if (!byPid.has(pid)) byPid.set(pid, { allAmericans: [], allConference: [] })
    byPid.get(pid)[type].push({
      year: Number(year),
      designation: entry.designation,
      position: entry.position,
      school: entry.school,
      class: entry.class,
    })
  }

  for (const [year, data] of Object.entries(byYear)) {
    for (const entry of (data?.allAmericans || [])) {
      const matched = matchHonorToPlayer(dynasty, entry.player, entry.school, entry.schoolTid)
      if (matched?.pid) addHonor(matched.pid, 'allAmericans', year, entry)
    }
    for (const entry of (data?.allConference || [])) {
      const matched = matchHonorToPlayer(dynasty, entry.player, entry.school, entry.schoolTid)
      if (matched?.pid) addHonor(matched.pid, 'allConference', year, entry)
    }
  }

  return byPid
}

// Merge a player's own stored honor array (populated by the manual-entry
// modal flow via processHonorPlayers) with the live-derived one (covers
// cfb27 auto-sync, which never writes to the player record) — deduped by
// year+designation+position so a player edited through both paths doesn't
// show a doubled-up row.
export function mergeHonorLists(stored = [], live = []) {
  const key = (h) => `${h.year}-${h.designation}-${h.position}`
  const seen = new Set(stored.map(key))
  const merged = [...stored]
  for (const h of live) {
    const k = key(h)
    if (!seen.has(k)) {
      seen.add(k)
      merged.push(h)
    }
  }
  return merged
}
