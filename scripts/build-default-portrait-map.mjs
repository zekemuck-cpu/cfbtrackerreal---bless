// Build the console dynasty-creation portrait map from a CFB 27 save.
//
// WHY THIS EXISTS: a console dynasty seeds its rosters from the bundled files
// in src/data/cfb27Rosters/ (and defaultRosters/). Those carry name, position,
// jersey, ratings — but NOT the portrait id, because they were generated
// without it. The link between a player and their face lives only inside a
// save file, so it has to be extracted once and committed.
//
// At dynasty start the console and PC rosters are the same players, so every
// seeded player can get their real face for free. After that first season it's
// on the user as usual — this only covers the initial seed.
//
// Run on a machine that has BOTH a base (week-zero, unedited) CFB 27 save and
// this repo:
//
//   node scripts/build-default-portrait-map.mjs /path/to/SAVEFILE
//
// Writes one small JSON per team into src/data/cfb27Portraits/<tid>.json:
//   { "<normalized name>": "<GenericHeadAssetName>", ... }
//
// Per-team files on purpose — defaultRosterLoader lazy-loads rosters the same
// way, so a dynasty only ever downloads the teams it actually seeds instead of
// one ~300KB blob on every app start.
//
// USE A BASE SAVE. A save from deep into someone's dynasty has transferred,
// graduated and recruited players who don't match the bundled rosters, so the
// map would be wrong for exactly the players it's meant to cover.

import { writeFileSync, mkdirSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const SAVE = process.argv[2]
if (!SAVE) {
  console.error('Usage: node scripts/build-default-portrait-map.mjs /path/to/SAVEFILE')
  process.exit(1)
}

const { extractFullSave } = require('../api/_lib/cfb27Extract/extractPlayers.cjs')
const { TEAMS, getTidFromTeamName } = require('../src/data/teamRegistry.js')

// MUST match normalizeName in src/data/defaultRosterLoader.js — the lookup key
// is built there at dynasty creation and here at generation time, so any drift
// between the two silently produces zero matches.
const normalizeName = (s) => String(s || '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '')

const OUT_DIR = path.join(process.cwd(), 'src/data/cfb27Portraits')

console.log('Parsing save (this takes a minute)…')
const parsed = await extractFullSave(SAVE, {})
const rows = parsed?.players || []
console.log(`Read ${rows.length} player rows.`)

// raw save team id -> app tid, resolved through the team NAME the save carries.
const tidByRaw = new Map()
for (const r of rows) {
  if (r?.team_id == null || tidByRaw.has(r.team_id)) continue
  const nm = r.team_name || r.school || null
  const tid = nm ? getTidFromTeamName(nm) : null
  if (tid != null) tidByRaw.set(r.team_id, tid)
}

const byTid = new Map()
let skippedNoAsset = 0
let skippedNoTeam = 0
for (const r of rows) {
  const asset = r?.generic_head_asset_name
  if (!asset) { skippedNoAsset++; continue }
  const tid = tidByRaw.get(r.team_id)
  if (tid == null) { skippedNoTeam++; continue }
  const name = normalizeName(`${r.first_name || ''} ${r.last_name || ''}`)
  if (!name) continue
  if (!byTid.has(tid)) byTid.set(tid, {})
  byTid.get(tid)[name] = asset
}

mkdirSync(OUT_DIR, { recursive: true })
for (const f of readdirSync(OUT_DIR)) {
  if (f.endsWith('.json')) writeFileSync(path.join(OUT_DIR, f), '{}')
}
let written = 0
let entries = 0
for (const [tid, map] of byTid) {
  const n = Object.keys(map).length
  if (n === 0) continue
  writeFileSync(path.join(OUT_DIR, `${tid}.json`), JSON.stringify(map))
  written++
  entries += n
}

console.log(`\nWrote ${written} team file(s), ${entries} player portraits.`)
console.log(`Skipped: ${skippedNoAsset} with no portrait asset, ${skippedNoTeam} whose team didn't resolve.`)
const known = Object.keys(TEAMS).length
if (written < known * 0.5) {
  console.warn(`\nWARNING: only ${written} of ~${known} teams got a file. Expected most of FBS —`)
  console.warn('check that this is a full base save and that team names resolved.')
}
