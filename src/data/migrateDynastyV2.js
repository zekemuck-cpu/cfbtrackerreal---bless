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

export function needsV2Migration(dynasty) {
  if (!dynasty) return false
  const players = dynasty.players || []
  // Regardless of the dynasty-level flag, re-run migration if any player
  // still carries legacy debt. An earlier run may have been partially
  // applied (Firestore merge mode can preserve deleted keys).
  for (const p of players) {
    if (Array.isArray(p.movements) && p.movements.length) return true
    if (p.teamsByYear) {
      for (const [k, v] of Object.entries(p.teamsByYear)) {
        if (isNaN(Number(k))) return true
        if (v === '') return true
      }
    }
  }
  return dynasty._schemaVersion !== 2
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
      const v2 = legacyMovementToCanonical(m) || m
      if (v2?.type === 'unknown') unknownTypes.add(m.type)
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
