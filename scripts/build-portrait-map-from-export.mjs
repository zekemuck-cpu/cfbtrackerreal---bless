// Build the console dynasty-creation portrait map from an EXPORTED PC DYNASTY.
//
// Same output as build-default-portrait-map.mjs, from a much easier input.
// That script needs a raw CFB 27 save file and the save parser; this one needs
// only a dynasty backup JSON — the file Danger Zone's "Download Backup" button
// produces. A PC (Sync from Save) dynasty already has every player's portrait
// resolved onto player.pictureUrl, so the name -> face link this whole feature
// needs is sitting right there in plain JSON.
//
// Whoever supplies it needs the PC game; running THIS script does not.
//
//   node scripts/build-portrait-map-from-export.mjs /path/to/dynasty-backup.json
//
// Writes src/data/cfb27Portraits/<tid>.json, keyed by normalized player name.
//
// USE A FRESHLY CREATED PC DYNASTY. The map is applied to console dynasties'
// bundled STARTING rosters, so it should describe those same players. An export
// from deep into a dynasty has transfers, graduations and recruits that no
// longer match — those simply fail to match and are skipped rather than
// mapping a wrong face, but the coverage gets worse the further in it is.

import { writeFileSync, mkdirSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const SRC = process.argv[2]
if (!SRC) {
  console.error('Usage: node scripts/build-portrait-map-from-export.mjs /path/to/dynasty-backup.json')
  process.exit(1)
}

// MUST match normalizePortraitName in src/data/defaultRosterLoader.js — the app
// builds this key at dynasty creation and looks it up in what we write here, so
// any drift between the two silently produces zero matches.
const normalizeName = (s) => String(s || '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '')

// Recover the asset name from a stored portrait URL:
//   .../cfb27-portraits/unique/1234.webp        -> Unique_Player_1234
//   .../cfb27-portraits/generic/KEY.webp        -> Generic_KEY
// Stored as an asset name (not a URL) so the map stays independent of whatever
// host the portraits are served from — mapPortraitUrl rebuilds the URL against
// the CURRENT host at dynasty creation.
function assetFromUrl(url) {
  if (!url || typeof url !== 'string') return null
  const m = url.match(/\/cfb27-portraits\/(unique|generic)\/([^/?#]+)\.webp/i)
  if (!m) return null
  return m[1].toLowerCase() === 'unique' ? `Unique_Player_${m[2]}` : `Generic_${m[2]}`
}

const dynasty = JSON.parse(readFileSync(SRC, 'utf8'))
const players = dynasty?.players || []
const startYear = Number(dynasty?.startYear) || Number(dynasty?.currentYear)
console.log(`Read ${players.length} players (start year ${startYear || 'unknown'}).`)

const byTid = new Map()
let noPortrait = 0
let noTeam = 0
for (const p of players) {
  const asset = assetFromUrl(p?.pictureUrl) || p?.cfb27AssetName || null
  if (!asset) { noPortrait++; continue }
  // The team they were on at the dynasty's START — that's the roster the
  // bundled console files describe.
  const tid = p?.teamsByYear?.[startYear] ?? p?.teamsByYear?.[String(startYear)] ?? p?.team
  if (tid == null) { noTeam++; continue }
  const key = normalizeName(p?.name || `${p?.firstName || ''} ${p?.lastName || ''}`)
  if (!key) continue
  const t = Number(tid)
  if (!byTid.has(t)) byTid.set(t, {})
  byTid.get(t)[key] = asset
}

const OUT_DIR = path.join(process.cwd(), 'src/data/cfb27Portraits')
mkdirSync(OUT_DIR, { recursive: true })
for (const f of readdirSync(OUT_DIR)) {
  if (f.endsWith('.json')) writeFileSync(path.join(OUT_DIR, f), '{}')
}
let written = 0
let entries = 0
for (const [tid, map] of byTid) {
  const n = Object.keys(map).length
  if (!n) continue
  writeFileSync(path.join(OUT_DIR, `${tid}.json`), JSON.stringify(map))
  written++
  entries += n
}

console.log(`\nWrote ${written} team file(s), ${entries} player portraits.`)
console.log(`Skipped: ${noPortrait} with no portrait, ${noTeam} with no start-year team.`)
if (noPortrait === players.length) {
  console.error('\nERROR: not one player had a portrait. This looks like a CONSOLE dynasty export —')
  console.error('it has to come from a PC (Sync from Save) dynasty.')
  process.exit(1)
}
const { TEAMS } = require('../src/data/teamRegistry.js')
const known = Object.keys(TEAMS).length
if (written < known * 0.5) {
  console.warn(`\nWARNING: only ${written} of ~${known} teams got a file — expected most of FBS.`)
  console.warn('A single-team dynasty export only carries that team; use one seeded whole-country.')
}
