// migrateDynastyV2.js — Phase 2 in-app migration.
//
// Pure transform: input dynasty object goes in, new dynasty object comes out.
// Matches scripts/migrate-dynasty-v2.mjs exactly. Use this from DangerZone
// or from the auto-prompt modal.

import { legacyMovementToCanonical } from './rosterModel'

const toNum = (y) => {
  const n = Number(y)
  return Number.isFinite(n) ? n : null
}

function normalizeYearKeyedObject(obj, valueCoercer) {
  if (!obj || typeof obj !== 'object') return {}
  const out = {}
  for (const [k, v] of Object.entries(obj)) {
    const n = Number(k)
    if (!Number.isFinite(n)) continue
    const coerced = valueCoercer ? valueCoercer(v) : v
    if (coerced !== undefined && coerced !== null && coerced !== '') {
      out[n] = coerced
    }
  }
  return out
}

// Return true if the dynasty has any legacy debt the user should migrate.
// The detector is intentionally broad: it's better to prompt a user to
// migrate once too often than to leave a dynasty with drifting state
// that can reintroduce roster bugs.
//
// Triggers migration when ANY player has:
//   - legacy movements[] array with entries
//   - teamHistory[] array (stint-based)
//   - _legacy_teamsByYear object
//   - entryYear / entryClass legacy fields
//   - leftTeam / leavingYear / transferredTo / pendingDeparture
//   - legacy top-level teams[] abbr array
//   - string-keyed year maps (not Number)
//   - empty-string team values in teamsByYear
//   - honor-only ghost records (no position, no overall, no stats)
//   - top-level player.year / .team / .overall / .devTrait out of sync
//     with the canonical per-year map for the dynasty's current year
export function needsV2Migration(dynasty) {
  if (!dynasty) return false
  const players = dynasty.players || []
  const currentYear = Number(dynasty.currentYear)
  const hasCurrentYear = Number.isFinite(currentYear)

  for (const p of players) {
    // Legacy arrays / objects that v2 doesn't use.
    if (Array.isArray(p.movements) && p.movements.length) return true
    if (Array.isArray(p.teamHistory) && p.teamHistory.length) return true
    if (Array.isArray(p.teams) && p.teams.length) return true
    if (p._legacy_teamsByYear && Object.keys(p._legacy_teamsByYear).length) return true

    // Legacy scalar fields that v2 replaces entirely.
    if (p.entryYear != null) return true
    if (p.entryClass) return true
    if (p.leftTeam || p.leftYear || p.leftReason) return true
    if (p.leavingYear || p.leavingReason) return true
    if (p.transferredTo) return true
    if (p.pendingDeparture) return true

    // Malformed per-year maps.
    if (p.teamsByYear) {
      for (const [k, v] of Object.entries(p.teamsByYear)) {
        if (isNaN(Number(k))) return true
        if (v === '') return true
      }
    }
    if (p.classByYear) {
      for (const k of Object.keys(p.classByYear)) {
        if (isNaN(Number(k))) return true
      }
    }
    if (p.overallByYear) {
      for (const k of Object.keys(p.overallByYear)) {
        if (isNaN(Number(k))) return true
      }
    }
    if (p.devTraitByYear) {
      for (const k of Object.keys(p.devTraitByYear)) {
        if (isNaN(Number(k))) return true
      }
    }
    if (p.movementByYear) {
      for (const k of Object.keys(p.movementByYear)) {
        if (isNaN(Number(k))) return true
      }
    }

    // Honor-only ghost pattern — worth migrating to clean up.
    const hasStats = p.statsByYear && Object.keys(p.statsByYear).length > 0
    const hasAccolades = p.accolades && Object.keys(p.accolades).length > 0
    if (!p.position && p.overall == null && !hasStats && hasAccolades) return true

    // Drift between top-level mirrors and canonical per-year maps.
    // If the player has a value for the current year in classByYear and
    // player.year disagrees, they're out of sync and need resyncing.
    if (hasCurrentYear) {
      const curClass = p.classByYear?.[currentYear] ?? p.classByYear?.[String(currentYear)]
      if (curClass && p.year && String(curClass) !== String(p.year)) return true
      const curTid = p.teamsByYear?.[currentYear] ?? p.teamsByYear?.[String(currentYear)]
      if (curTid != null && p.team != null && Number(curTid) !== Number(p.team)) return true
      const curOvr = p.overallByYear?.[currentYear] ?? p.overallByYear?.[String(currentYear)]
      if (curOvr != null && p.overall != null && Number(curOvr) !== Number(p.overall)) return true
      const curDev = p.devTraitByYear?.[currentYear] ?? p.devTraitByYear?.[String(currentYear)]
      if (curDev && p.devTrait && String(curDev) !== String(p.devTrait)) return true
    }
  }
  return false
}

// True if the dynasty has no legacy debt AND no v2 flag yet. Caller should
// silently stamp _schemaVersion: 2 in this case — no modal, no friction.
export function isCleanButUnstamped(dynasty) {
  if (!dynasty) return false
  if (dynasty._schemaVersion === 2) return false
  return !needsV2Migration(dynasty)
}

export function migrateDynastyToV2(dynasty) {
  const report = {
    playersTotal: 0,
    playersMigrated: 0,
    playersDropped: [],
    collisionsResolved: 0,
    staleTeamsByYearTrimmed: 0,
    emptyTeamsByYearEntriesRemoved: 0,
    unknownMovementTypes: [],
    movementsBothSources: 0,
    honorOnlyGhostsDropped: 0,
  }
  const unknownTypes = new Set()

  const migratePlayer = (p) => {
    report.playersTotal++

    const hasStats = p.statsByYear && Object.keys(p.statsByYear).length > 0
    const isHonorOnly = !p.position && p.overall == null && !hasStats && p.accolades && Object.keys(p.accolades).length > 0
    if (isHonorOnly) {
      report.honorOnlyGhostsDropped++
      report.playersDropped.push({ pid: p.pid, name: p.name, reason: 'honor-only ghost' })
      return null
    }

    // Coach-award "player" records (the sheet stuffed a coach name into a
    // player row with empty-string team entries). Drop them — they're not
    // roster players.
    const teamEntries = Object.entries(p.teamsByYear || {})
    const allTeamValsEmpty = teamEntries.length > 0 && teamEntries.every(([, v]) => v === '' || v == null)
    if (allTeamValsEmpty && !hasStats && p.overall == null) {
      report.honorOnlyGhostsDropped++
      report.playersDropped.push({ pid: p.pid, name: p.name, reason: 'coach-award placeholder' })
      return null
    }

    const teamsByYear = normalizeYearKeyedObject(p.teamsByYear, (v) => {
      if (v == null || v === '') return null
      const n = Number(v)
      return Number.isFinite(n) ? n : v
    })
    const rawKeys = Object.keys(p.teamsByYear || {}).length
    const cleanKeys = Object.keys(teamsByYear).length
    report.emptyTeamsByYearEntriesRemoved += (rawKeys - cleanKeys)

    const classByYear = normalizeYearKeyedObject(p.classByYear)
    const overallByYear = normalizeYearKeyedObject(p.overallByYear, (v) => {
      const n = Number(v)
      return Number.isFinite(n) ? n : null
    })
    const devTraitByYear = normalizeYearKeyedObject(p.devTraitByYear)

    const hasArray = Array.isArray(p.movements) && p.movements.length > 0
    const hasMap = p.movementByYear && Object.keys(p.movementByYear).length > 0
    if (hasArray && hasMap) report.movementsBothSources++

    const mvOut = {}
    for (const [y, m] of Object.entries(p.movementByYear || {})) {
      const n = Number(y)
      if (!Number.isFinite(n)) continue
      // Heal poison shapes left by an earlier bug where canonical entries
      // were re-fed through legacyMovementToCanonical: { type: 'unknown',
      // legacyType, raw } — try to recover from `raw`, else drop.
      const source = m?.type === 'unknown' && m?.raw ? m.raw : m
      const v2 = legacyMovementToCanonical(source) || source
      if (v2?.type === 'unknown') {
        unknownTypes.add(m?.type)
        continue
      }
      mvOut[n] = v2
    }
    for (const m of p.movements || []) {
      const n = Number(m.year)
      if (!Number.isFinite(n)) continue
      const v2 = legacyMovementToCanonical(m)
      if (!v2) continue
      if (v2?.type === 'unknown') unknownTypes.add(m.type)
      const existing = mvOut[n]
      if (!existing) { mvOut[n] = v2; continue }
      const richness = (o) => Object.values(o || {}).filter(x => x != null && x !== '').length
      if (richness(v2) >= richness(existing)) {
        mvOut[n] = v2
        report.collisionsResolved++
      }
    }

    const departureYears = Object.entries(mvOut)
      .filter(([, m]) => m?.type === 'departure')
      .map(([y]) => Number(y))
    if (departureYears.length > 0) {
      const lastDep = Math.max(...departureYears)
      for (const y of Object.keys(teamsByYear)) {
        if (Number(y) > lastDep) {
          delete teamsByYear[y]
          report.staleTeamsByYearTrimmed++
        }
      }
    }

    const out = {
      ...p,
      teamsByYear,
      classByYear,
      overallByYear,
      devTraitByYear,
      movementByYear: mvOut,
      _schemaVersion: 2,
      _normalizedAt: new Date().toISOString(),
    }
    delete out.movements
    report.playersMigrated++
    return out
  }

  const migratedPlayers = (dynasty.players || [])
    .map(migratePlayer)
    .filter(Boolean)

  report.unknownMovementTypes = [...unknownTypes]

  const migrated = {
    ...dynasty,
    players: migratedPlayers,
    _schemaVersion: 2,
    _normalizedAt: new Date().toISOString(),
  }

  return { dynasty: migrated, report }
}
