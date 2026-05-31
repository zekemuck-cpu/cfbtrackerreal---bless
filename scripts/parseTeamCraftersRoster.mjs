#!/usr/bin/env node
// Parses a TeamCrafters team page paste (the All Players section) into a
// year-agnostic default-roster JSON the app can load when a user starts a new
// dynasty with a "Default Roster" toggle.
//
// Usage:
//   node scripts/parseTeamCraftersRoster.mjs \
//     --input /tmp/AFA.txt --output src/data/defaultRosters/1.json \
//     --tid 1 --team "Air Force Falcons" --updated 2026-02-17
//
// Source block per player (paste shape):
//   Name
//   [0..N ability tag lines]
//   Position (single token: QB/HB/.../P)
//   #Jersey
//   •
//   Height Weight (e.g. 6'2" 215lbs)
//   •
//   CLASS (SR/JR/SO/FR)
//   [RS]
//   •
//   Archetype
//   OVR  SPD  STR  AGI  ACC  COD  INJ  STA  AWR   (tab-separated, wide view)
//
// Narrow / mobile view replaces the single stats line with:
//   OVR
//   SPD\nNUM\nSTR\nNUM\n…AWR\nNUM   (label/number pairs, may omit ACC/STA)
// We only keep OVR; individual ratings are intentionally dropped.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

const args = (() => {
  const out = {}
  const a = process.argv.slice(2)
  for (let i = 0; i < a.length; i++) {
    if (a[i].startsWith('--')) { out[a[i].slice(2)] = a[i + 1]; i++ }
  }
  return out
})()
const { input, output, tid, team = '', updated = '' } = args
if (!input || !output || !tid) {
  console.error('Usage: --input <file> --output <file> --tid <n> [--team <name>] [--updated <date>]')
  process.exit(1)
}

// Source → app position codes (the app uses LEDG/REDG and SAM/MIKE/WILL).
const POSITION_MAP = {
  LE: 'LEDG', RE: 'REDG',
  LOLB: 'WILL', MLB: 'MIKE', ROLB: 'SAM',
}
const SOURCE_POS = new Set([
  'QB', 'HB', 'FB', 'WR', 'TE',
  'LT', 'LG', 'C', 'RG', 'RT',
  'LE', 'RE', 'DT', 'NT',
  'LOLB', 'MLB', 'ROLB', 'SAM', 'MIKE', 'WILL',
  'CB', 'FS', 'SS',
  'K', 'P', 'LS',
])
const CLASS_MAP = { SR: 'Sr', JR: 'Jr', SO: 'So', FR: 'Fr' }
const STAT_LABELS = new Set(['SPD', 'STR', 'AGI', 'ACC', 'COD', 'INJ', 'STA', 'AWR'])

// Dev trait is NOT in the TeamCrafters source — leave blank rather than guess.
// (The page does list each player's equipped ability tags, which we capture in
// `abilities`, but the ability count doesn't reliably map to a dev-trait tier
// and we don't want to fabricate one.)

// Some pastes lose the leading digit on lineman weights ("283lbs" → "83lbs").
// A real college player isn't under ~150 lbs, so a sub-150 value is a paste
// truncation — add 200 back. Flagged with weightFixed: true so it's auditable.
function fixWeight(w) {
  if (!Number.isFinite(w)) return { weight: null, fixed: false }
  if (w >= 150) return { weight: w, fixed: false }
  return { weight: 200 + w, fixed: true }
}

function splitName(full) {
  const parts = full.trim().split(/\s+/)
  if (parts.length < 2) return { firstName: '', lastName: full }
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') }
}

function parseBlock(L, start) {
  if (start >= L.length) return null
  const name = L[start].trim()
  if (!name || name === '•') return null
  let i = start + 1
  // Ability tags accumulate until we hit a single-token position code.
  const abilities = []
  while (i < L.length && !SOURCE_POS.has(L[i].trim())) {
    if (i - start > 30) return null
    abilities.push(L[i].trim())
    i++
  }
  if (i >= L.length) return null
  const sourcePos = L[i].trim(); i++
  // Jersey ("#NN")
  const jerseyMatch = (L[i] || '').trim().match(/^#?(\d{1,3})$/)
  if (!jerseyMatch) return null
  const jerseyNumber = jerseyMatch[1]; i++
  if (L[i] && L[i].trim() === '•') i++
  // Height/weight (e.g. 6'0" 83lbs)
  const hwM = (L[i] || '').trim().match(/^(\d+'\d*"?)\s+(\d+)\s*lbs?$/i)
  let height = '', weight = null
  if (hwM) { height = hwM[1]; weight = Number(hwM[2]) }
  i++
  if (L[i] && L[i].trim() === '•') i++
  const classCode = (L[i] || '').trim(); i++
  let isRS = false
  if (L[i] && L[i].trim() === 'RS') { isRS = true; i++ }
  if (L[i] && L[i].trim() === '•') i++
  const archetype = (L[i] || '').trim(); i++
  // Stats — wide view is a single tab/space line; narrow view is OVR alone
  // followed by LABEL\nNUMBER pairs. We only keep OVR either way.
  const statsLine = (L[i] || '').trim()
  const nums = statsLine.split(/\s+/).map(Number)
  let overall
  if (nums.length >= 9 && nums.every(n => Number.isFinite(n))) {
    overall = nums[0]
    i++
  } else if (nums.length === 1 && Number.isFinite(nums[0])) {
    overall = nums[0]
    i++
    while (i < L.length && STAT_LABELS.has((L[i] || '').trim())) {
      i++
      if (i < L.length && /^\d+$/.test((L[i] || '').trim())) i++
    }
  } else {
    return null
  }

  const position = POSITION_MAP[sourcePos] || sourcePos
  const baseClass = CLASS_MAP[classCode] || classCode
  const playerClass = isRS ? `RS ${baseClass}` : baseClass
  const { firstName, lastName } = splitName(name)
  const { weight: fixedWeight, fixed: weightFixed } = fixWeight(weight)

  return {
    next: i,
    player: {
      name, firstName, lastName,
      position, jerseyNumber,
      height, weight: fixedWeight, weightFixed: weightFixed || undefined,
      class: playerClass,
      archetype,
      devTrait: '',
      overall,
      abilities,
      hometown: '',
      state: '',
    },
  }
}

function parseRoster(text) {
  const allIdx = text.indexOf('All Players')
  const body = allIdx >= 0 ? text.slice(allIdx) : text
  const lines = body.split('\n').map(l => l.replace(/ /g, ' ').trimEnd())
  const compact = lines.filter(l => l.trim() !== '')
  let i = 0
  while (i < compact.length && compact[i].trim() !== 'All Players' && !/^Player\b/i.test(compact[i].trim())) i++
  if (compact[i] && compact[i].trim() === 'All Players') i++
  if (compact[i] && /^Player\b/i.test(compact[i].trim())) i++
  const players = []
  while (i < compact.length) {
    const r = parseBlock(compact, i)
    if (!r) { i++; continue }
    players.push(r.player)
    i = r.next
  }
  return players
}

const raw = readFileSync(input, 'utf8')
const players = parseRoster(raw)

const out = {
  tid: Number(tid),
  teamName: team,
  source: 'TeamCrafters',
  sourceUpdated: updated,
  parsedAt: new Date().toISOString().slice(0, 10),
  players,
}
mkdirSync(dirname(output), { recursive: true })
writeFileSync(output, JSON.stringify(out, null, 2) + '\n')

// brief summary on stderr
const byPos = {}
let weightFixCount = 0
let withAbilities = 0
for (const p of players) {
  byPos[p.position] = (byPos[p.position] || 0) + 1
  if (p.weightFixed) weightFixCount++
  if (p.abilities?.length) withAbilities++
}
console.error(`✓ ${players.length} players → ${output}`)
console.error(`  by position: ${Object.entries(byPos).sort().map(([k, v]) => `${k}=${v}`).join(' ')}`)
console.error(`  players with ability tags listed: ${withAbilities} (devTrait left blank — not in source)`)
if (weightFixCount) console.error(`  weights auto-fixed (sub-150 → +200, paste truncation): ${weightFixCount}`)
