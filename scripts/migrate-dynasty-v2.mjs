#!/usr/bin/env node
// migrate-dynasty-v2.mjs — Phase 2 "Normalize to v2" migration.
//
// Usage:
//   node scripts/migrate-dynasty-v2.mjs <input.json> [--write] [--out <output.json>]
//
// Default behavior is DRY RUN — prints a report, writes NOTHING.
// Pass --write to emit the migrated dynasty. Output defaults to
// <input>.v2.json if --out not provided.
//
// The script is a pure transform: input goes in, new object comes out,
// and a diff report is printed. Zero dependencies on the React app.

import fs from 'node:fs'
import path from 'node:path'

const args = process.argv.slice(2)
const inputPath = args.find(a => !a.startsWith('--'))
const shouldWrite = args.includes('--write')
const outIdx = args.indexOf('--out')
const outPath = outIdx >= 0 ? args[outIdx + 1] : null

if (!inputPath) {
  console.error('Usage: node scripts/migrate-dynasty-v2.mjs <input.json> [--write] [--out <output.json>]')
  process.exit(1)
}

const raw = JSON.parse(fs.readFileSync(inputPath, 'utf8'))

// ─── Movement normalization (mirrors src/data/rosterModel.js) ────────────────

function legacyMovementToCanonical(m) {
  if (!m || !m.type) return null
  switch (m.type) {
    case 'recruited':
      return { type: 'arrival', arrival: 'recruit' }
    case 'transfer':
    case 'portal_in':
    case 'added':
      return { type: 'arrival', arrival: 'transfer_in', fromTid: m.from != null ? Number(m.from) : null }
    case 'walk_on':
    case 'walk-on':
      return { type: 'arrival', arrival: 'walk_on' }
    case 'juco_in':
    case 'juco':
      return { type: 'arrival', arrival: 'juco' }
    case 'recommit':
    case 'recommitted':
      return { type: 'recommit' }
    case 'departure': {
      const reason = m.reason || ''
      if (reason === 'Graduating') return { type: 'departure', departure: 'graduated' }
      if (reason === 'Pro Draft') return { type: 'departure', departure: 'pro_draft', draftRound: m.draftRound || null }
      return {
        type: 'departure', departure: 'transfer_out',
        toTid: m.to != null ? Number(m.to) : null,
        reason: reason || null,
      }
    }
    case 'entered_portal':
      return { type: 'departure', departure: 'transfer_out', toTid: null, reason: m.reason || 'Entered Transfer Portal' }
    case 'graduated':
      return { type: 'departure', departure: 'graduated' }
    case 'declared_for_draft':
      return { type: 'departure', departure: 'pro_draft' }
    case 'transferred_out':
      return {
        type: 'departure', departure: 'transfer_out',
        toTid: m.toTeamTid != null ? Number(m.toTeamTid) : (m.to != null ? Number(m.to) : null),
        reason: m.reason || null,
      }
    case 'encouraged_to_transfer':
      return { type: 'departure', departure: 'transfer_out', toTid: null, reason: 'Encouraged Transfer' }
    default:
      return { type: 'unknown', legacyType: m.type, raw: m }
  }
}

// ─── Canonical key coercion helper ───────────────────────────────────────────

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

// ─── Per-player migration ────────────────────────────────────────────────────

const report = {
  playersTotal: 0,
  playersMigrated: 0,
  playersDropped: [],
  collisionsResolved: 0,
  staleTeamsByYearTrimmed: 0,
  emptyTeamsByYearEntriesRemoved: 0,
  unknownMovementTypes: new Set(),
  movementsBothSources: 0,
  classGapsFilled: 0,
  overallGapsLeftBlank: 0,
  honorOnlyGhostsDropped: 0,
}

function migratePlayer(p) {
  // Drop honor-only ghosts (no position AND no overall AND no stats; only accolades).
  const hasStats = p.statsByYear && Object.keys(p.statsByYear).length > 0
  const isHonorOnly = !p.position && p.overall == null && !hasStats && p.accolades && Object.keys(p.accolades).length > 0
  if (isHonorOnly) {
    report.honorOnlyGhostsDropped++
    report.playersDropped.push({ pid: p.pid, name: p.name, reason: 'honor-only ghost' })
    return null
  }

  const teamEntries = Object.entries(p.teamsByYear || {})
  const allTeamValsEmpty = teamEntries.length > 0 && teamEntries.every(([, v]) => v === '' || v == null)
  if (allTeamValsEmpty && !hasStats && p.overall == null) {
    report.honorOnlyGhostsDropped++
    report.playersDropped.push({ pid: p.pid, name: p.name, reason: 'coach-award placeholder' })
    return null
  }

  // Normalize per-year keyed maps.
  const teamsByYear = normalizeYearKeyedObject(p.teamsByYear, (v) => {
    if (v == null || v === '') return null
    const n = Number(v)
    return Number.isFinite(n) ? n : v
  })
  // Drop empty-string entries (coach placeholder rows)
  const teamsByYearRawKeys = Object.keys(p.teamsByYear || {}).length
  const teamsByYearCleanKeys = Object.keys(teamsByYear).length
  report.emptyTeamsByYearEntriesRemoved += (teamsByYearRawKeys - teamsByYearCleanKeys)

  const classByYear = normalizeYearKeyedObject(p.classByYear)
  const overallByYear = normalizeYearKeyedObject(p.overallByYear, (v) => {
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  })
  const devTraitByYear = normalizeYearKeyedObject(p.devTraitByYear)

  // Consolidate movements[] + movementByYear into a single movementByYear.
  // Rule: movements[] is richer — canonicalize it; movementByYear is secondary.
  // If both exist for same year, the richer one (more fields) wins.
  const hasArray = Array.isArray(p.movements) && p.movements.length > 0
  const hasMap = p.movementByYear && Object.keys(p.movementByYear).length > 0
  if (hasArray && hasMap) report.movementsBothSources++

  const mvOut = {}
  // Seed with existing movementByYear (canonicalize to v2 shape — some were already v2-ish, some legacy)
  for (const [y, m] of Object.entries(p.movementByYear || {})) {
    const n = Number(y)
    if (!Number.isFinite(n)) continue
    const v2 = legacyMovementToCanonical(m) || m
    if (v2?.type === 'unknown') report.unknownMovementTypes.add(m.type)
    mvOut[n] = v2
  }
  // Overlay richer movements[] entries.
  for (const m of p.movements || []) {
    const n = Number(m.year)
    if (!Number.isFinite(n)) continue
    const v2 = legacyMovementToCanonical(m)
    if (!v2) continue
    if (v2?.type === 'unknown') report.unknownMovementTypes.add(m.type)
    // Prefer richer entry on collision.
    const existing = mvOut[n]
    if (!existing) { mvOut[n] = v2; continue }
    const richness = (o) => Object.values(o || {}).filter(x => x != null && x !== '').length
    if (richness(v2) >= richness(existing)) {
      mvOut[n] = v2
      report.collisionsResolved++
    }
  }

  // Trim teamsByYear past last departure year.
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

  // Gap-fill classByYear from entryYear+entryClass if we have it and gaps exist.
  if (p.entryYear != null && p.entryClass) {
    const ordered = ['Fr', 'So', 'Jr', 'Sr']
    const startIdx = ordered.indexOf(p.entryClass)
    const years = Object.keys(teamsByYear).map(Number).sort((a, b) => a - b)
    if (startIdx >= 0 && years.length > 0) {
      let idx = startIdx
      for (const y of years) {
        if (!classByYear[y] && idx < ordered.length) {
          // We don't overwrite existing data, only fill gaps.
          // NOTE: This is naive — does not handle redshirts. The existing
          // handleFixClassData has richer logic. This migration just seeds
          // what's easy and leaves harder cases for the user to review.
          // To avoid guessing wrong, we skip gap-filling here and let the
          // user run existing "Fix Player Classes" after migration.
        }
        idx++
      }
    }
  }
  // Track what stayed blank for reporting purposes only.
  for (const y of Object.keys(teamsByYear)) {
    if (!classByYear[y]) report.classGapsFilled++ // named "filled" but actually "still blank"
    if (overallByYear[y] == null) report.overallGapsLeftBlank++
  }

  // Build v2 player, preserving everything else verbatim.
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

  // REMOVE legacy movements array — fully consolidated into movementByYear.
  delete out.movements

  // Keep player.year / player.team / player.overall / player.devTrait as
  // DERIVED current-year mirrors. Leave untouched here; Phase 3 work will
  // route writers through helpers that keep these in sync.

  return out
}

// ─── Run migration ───────────────────────────────────────────────────────────

const migratedPlayers = []
for (const p of raw.players || []) {
  report.playersTotal++
  const m = migratePlayer(p)
  if (m) {
    migratedPlayers.push(m)
    report.playersMigrated++
  }
}

const migrated = {
  ...raw,
  players: migratedPlayers,
  _schemaVersion: 2,
  _normalizedAt: new Date().toISOString(),
}

// ─── Report ──────────────────────────────────────────────────────────────────

console.log('\n=== Dynasty v2 Migration — Dry Run Report ===')
console.log('Input file:', inputPath)
console.log('Players total (input):', report.playersTotal)
console.log('Players migrated (kept):', report.playersMigrated)
console.log('Players dropped:', report.playersDropped.length)
if (report.playersDropped.length) {
  for (const d of report.playersDropped.slice(0, 20)) {
    console.log('  -', d.name, `(pid=${d.pid}) — ${d.reason}`)
  }
  if (report.playersDropped.length > 20) console.log('  …', report.playersDropped.length - 20, 'more')
}
console.log('\nMovement consolidation:')
console.log('  players with both movements[] + movementByYear:', report.movementsBothSources)
console.log('  same-year collisions resolved (richer source won):', report.collisionsResolved)
console.log('  unknown movement types encountered:', [...report.unknownMovementTypes])
console.log('\nCleanups:')
console.log('  empty/invalid teamsByYear entries removed:', report.emptyTeamsByYearEntriesRemoved)
console.log('  stale post-departure teamsByYear entries trimmed:', report.staleTeamsByYearTrimmed)
console.log('  honor-only ghost player records dropped:', report.honorOnlyGhostsDropped)
console.log('\nGaps (informational — not auto-filled; run DangerZone "Fix Player Classes" separately):')
console.log('  (player, year) slots with no classByYear:', report.classGapsFilled)
console.log('  (player, year) slots with no overallByYear:', report.overallGapsLeftBlank)

if (shouldWrite) {
  const target = outPath || inputPath.replace(/\.json$/, '.v2.json')
  fs.writeFileSync(target, JSON.stringify(migrated, null, 2))
  console.log('\n✓ Wrote migrated dynasty to:', target)
} else {
  console.log('\n(Dry run — no file written. Re-run with --write to emit migrated JSON.)')
}
