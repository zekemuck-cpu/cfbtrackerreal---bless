#!/usr/bin/env node
// Converts a pull from EA's public ratings API into per-team roster JSON under
// src/data/cfb27Rosters/{tid}.json — the attribute-rich set the CFB 27 edition
// seeds new dynasties from.
//
// Get the input by pasting scripts/ea-ratings-console-scrape.js into the
// browser console on https://www.ea.com/games/ea-sports-college-football/ratings
// (the API only answers requests with an ea.com Origin). That downloads
// ea-cfb-ratings.json — a flat array of every rated player.
//
// Usage:
//   node scripts/convertEaRatings.mjs --input ~/Downloads/ea-cfb-ratings.json --dry-run
//   node scripts/convertEaRatings.mjs --input ~/Downloads/ea-cfb-ratings.json
//
// Nothing is written without an explicit run (no --dry-run). Team mapping is
// all-or-nothing: an EA team label we can't resolve to a tid aborts the run
// rather than silently dropping that team's roster.
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const OUT_DIR = 'src/data/cfb27Rosters'

const args = (() => {
  const out = {}
  const a = process.argv.slice(2)
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--dry-run') { out.dryRun = true; continue }
    if (a[i].startsWith('--')) { out[a[i].slice(2)] = a[i + 1]; i++ }
  }
  return out
})()

if (!args.input) {
  console.error('Usage: node scripts/convertEaRatings.mjs --input <ea-cfb-ratings.json> [--dry-run]')
  process.exit(1)
}

// EA's defensive-line and linebacker labels differ from the ones the roster
// sheet (and therefore the whole app) uses. Mapping confirmed by cross-tabbing
// EA's position against ours for the ~8,900 players present in both sets.
const POSITION_MAP = {
  LE: 'LEDG',
  RE: 'REDG',
  MLB: 'MIKE',
  LOLB: 'SAM',
  ROLB: 'WILL',
}

const CLASS_MAP = {
  Freshman: 'Fr',
  Sophomore: 'So',
  Junior: 'Jr',
  Senior: 'Sr',
}

// EA reports redshirt state as Eligible / Previous / InEligible; the roster
// sheet spells the middle one "Redshirted".
const REDSHIRT_MAP = {
  Eligible: 'Eligible',
  Previous: 'Redshirted',
  InEligible: 'InEligible',
}

// EA's camelCase stat keys -> the display names our attribute maps are keyed
// by. Covers all 52 attributes we store; EA's extra `overall` (duplicate of
// overallRating) and `runningStyle` (cosmetic, always 0) are intentionally
// absent so they don't leak into the attribute map.
const ATTRIBUTE_MAP = {
  acceleration: 'Acceleration',
  agility: 'Agility',
  awareness: 'Awareness',
  bCVision: 'BC Vision',
  blockShedding: 'Block Shedding',
  breakSack: 'Break Sack',
  breakTackle: 'Break Tackle',
  carrying: 'Carrying',
  catchInTraffic: 'Catch In Traffic',
  catching: 'Catching',
  changeOfDirection: 'Change of Direction',
  deepRouteRunning: 'Deep Route',
  finesseMoves: 'Finesse Moves',
  hitPower: 'Hit Power',
  impactBlocking: 'Impact Blocking',
  injury: 'Injury',
  jukeMove: 'Juke Move',
  jumping: 'Jumping',
  kickAccuracy: 'Kick Accuracy',
  kickPower: 'Kick Power',
  kickReturn: 'Kick Return',
  leadBlock: 'Lead Block',
  manCoverage: 'Man Coverage',
  mediumRouteRunning: 'Medium Route',
  passBlock: 'Pass Block',
  passBlockFinesse: 'Pass Block Finesse',
  passBlockPower: 'Pass Block Power',
  playAction: 'Play Action',
  playRecognition: 'Play Recognition',
  powerMoves: 'Power Moves',
  press: 'Press',
  pursuit: 'Pursuit',
  runBlock: 'Run Block',
  runBlockFinesse: 'Run Block Finesse',
  runBlockPower: 'Run Block Power',
  shortRouteRunning: 'Short Route',
  spectacularCatch: 'Spectacular Catch',
  speed: 'Speed',
  spinMove: 'Spin Move',
  stamina: 'Stamina',
  stiffArm: 'Stiff Arm',
  strength: 'Strength',
  tackle: 'Tackle',
  throwAccuracyDeep: 'Deep Accuracy',
  throwAccuracyMid: 'Medium Accuracy',
  throwAccuracyShort: 'Short Accuracy',
  throwOnTheRun: 'Throw On Run',
  throwPower: 'Throw Power',
  throwUnderPressure: 'Under Pressure',
  toughness: 'Toughness',
  trucking: 'Trucking',
  zoneCoverage: 'Zone Coverage',
}

// EA stores weight as an offset from 160 lbs (so 20 -> 180). A 0 is a real
// 160-pounder, not missing data — verified against the launch workbook, where
// every one of these players is listed at exactly 160.
const WEIGHT_OFFSET = 160

function formatHeight(inches) {
  if (!Number.isFinite(inches) || inches <= 0) return ''
  return `${Math.floor(inches / 12)}'${inches % 12}"`
}

// Read the current rosters up front, before anything is overwritten. They give
// us both the team-label -> tid index and the archetype / dev trait / abilities
// that EA's feed doesn't carry, so a re-run never wipes hand-added data.
// Names differ in punctuation between the launch workbook and EA's site
// ("R.J. Jackson Jr." vs "RJ Jackson Jr."), so identity is compared on letters
// only. Otherwise the same player shows up as both a rename and a carry-over.
const nameKey = (s) => String(s || '').toLowerCase().replace(/[^a-z]/g, '')

function loadExisting() {
  const byTid = new Map()
  const labelToTid = new Map()
  if (!existsSync(OUT_DIR)) return { byTid, labelToTid }
  for (const f of readdirSync(OUT_DIR).filter((f) => f.endsWith('.json'))) {
    const j = JSON.parse(readFileSync(join(OUT_DIR, f), 'utf8'))
    byTid.set(j.tid, new Map((j.players || []).map((p) => [nameKey(p.name), p])))
    labelToTid.set(String(j.teamName).toLowerCase().trim(), j.tid)
  }
  return { byTid, labelToTid }
}

const raw = JSON.parse(readFileSync(args.input, 'utf8'))
if (!Array.isArray(raw)) {
  console.error('Input must be the flat array the console puller downloads.')
  process.exit(1)
}

// Paging overlap can repeat a record; EA's `id` is the stable player key.
const seen = new Set()
const players = []
for (const p of raw) {
  if (p?.id == null || seen.has(p.id)) continue
  seen.add(p.id)
  players.push(p)
}

const iterations = [...new Set(players.map((p) => p.iteration?.id).filter(Boolean))]
if (iterations.length !== 1) {
  console.warn(`WARNING: input mixes ${iterations.length} iterations (${iterations.join(', ')}).`)
}
const iterationId = iterations[0] || 'unknown'
const iterationLabel = players.find((p) => p.iteration?.id === iterationId)?.iteration?.label || iterationId

const { byTid, labelToTid } = loadExisting()

const unmatched = new Set()
const grouped = new Map()
for (const p of players) {
  const label = p.team?.label
  const tid = label ? labelToTid.get(label.toLowerCase().trim()) : undefined
  if (tid == null) { if (label) unmatched.add(label); continue }
  if (!grouped.has(tid)) grouped.set(tid, { teamName: label, players: [] })
  grouped.get(tid).players.push(p)
}

if (unmatched.size) {
  console.error('Aborting - these EA team labels have no tid:')
  for (const u of [...unmatched].sort()) console.error('  ' + u)
  console.error('Add the team to src/data/cfb27Rosters or extend the label index, then re-run.')
  process.exit(1)
}

function shape(p, prior) {
  const attributes = {}
  for (const [eaKey, ourKey] of Object.entries(ATTRIBUTE_MAP)) {
    const v = p.stats?.[eaKey]?.value
    if (Number.isFinite(v)) attributes[ourKey] = v
  }
  const name = `${p.firstName || ''} ${p.lastName || ''}`.trim()
  return {
    name,
    firstName: p.firstName || '',
    lastName: p.lastName || '',
    position: POSITION_MAP[p.position?.id] || p.position?.id || '',
    jerseyNumber: p.jerseyNum != null ? String(p.jerseyNum) : '',
    height: formatHeight(p.height),
    weight: Number.isFinite(p.weight) ? p.weight + WEIGHT_OFFSET : null,
    class: CLASS_MAP[p.schoolYear] || '',
    // EA's feed carries none of these three; keep whatever the current file has.
    archetype: prior?.archetype || '',
    devTrait: prior?.devTrait || '',
    overall: Number.isFinite(p.overallRating) ? p.overallRating : 0,
    hometown: p.homeTown || '',
    state: p.homeState || '',
    redshirt: REDSHIRT_MAP[p.redShirtStatus] || '',
    abilities: Array.isArray(prior?.abilities) ? prior.abilities : [],
    attributes,
  }
}

let wrote = 0
const report = []
for (const [tid, { teamName, players: list }] of [...grouped].sort((a, b) => a[0] - b[0])) {
  const prior = byTid.get(tid) || new Map()
  const shaped = list.map((p) => shape(p, prior.get(nameKey(`${p.firstName || ''} ${p.lastName || ''}`))))

  // EA's site is itself short on some teams (Navy lists 29 players), and it
  // omits ~74 players the launch workbook has. Take EA as the base but carry
  // forward anyone it doesn't list, so a run only ever adds depth.
  //
  // The catch: EA prefers the name a player goes by, the workbook the name on
  // the birth certificate ("Nate Tilmon" / "Nathan Tilmon", "Zeke" / "Ezekiel").
  // Carried on name alone those land twice, so a prior player also counts as
  // present when EA lists the same surname at the same position within a few
  // points of overall. Every pair this caught was unambiguous - 21 of the 22
  // matched on overall exactly.
  const fromEa = new Set(shaped.map((p) => nameKey(p.name)))
  const alsoInEa = (p) =>
    shaped.some(
      (e) =>
        nameKey(e.lastName) === nameKey(p.lastName) &&
        e.position === p.position &&
        Math.abs(e.overall - p.overall) <= 3,
    )
  const carried = [...prior.entries()]
    .filter(([k, p]) => !fromEa.has(k) && !alsoInEa(p))
    .map(([, p]) => p)
  const merged = [...shaped, ...carried].sort((a, b) => b.overall - a.overall)

  report.push({ tid, teamName, before: prior.size, after: merged.length, carried: carried.length })

  if (!args.dryRun) {
    const doc = {
      tid,
      teamName,
      source: `EA ratings API (${iterationLabel})`,
      sourceIteration: iterationId,
      players: merged,
    }
    writeFileSync(join(OUT_DIR, `${tid}.json`), JSON.stringify(doc))
    wrote++
  }
}

const before = report.reduce((s, r) => s + r.before, 0)
const after = report.reduce((s, r) => s + r.after, 0)
console.log(`iteration: ${iterationId} (${iterationLabel})`)
const carried = report.reduce((s, r) => s + r.carried, 0)
console.log(`teams: ${report.length}   players: ${before} -> ${after}  (${after - before >= 0 ? '+' : ''}${after - before})`)
console.log(`carried forward (in our rosters, absent from EA): ${carried}`)
const grew = report.filter((r) => r.after !== r.before).sort((a, b) => (b.after - b.before) - (a.after - a.before))
if (grew.length) {
  console.log(`\nbiggest roster-size changes:`)
  for (const r of grew.slice(0, 10)) console.log(`  tid ${r.tid} ${r.teamName}: ${r.before} -> ${r.after}`)
  if (grew.length > 10) console.log(`  ...and ${grew.length - 10} more`)
}
console.log(args.dryRun ? '\nDRY RUN - nothing written.' : `\nwrote ${wrote} files to ${OUT_DIR}`)
