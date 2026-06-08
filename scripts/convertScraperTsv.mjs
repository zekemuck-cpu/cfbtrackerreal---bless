#!/usr/bin/env node
// Converts the TeamCrafters scraper TSV output into per-team default-roster
// JSON files under src/data/defaultRosters/{tid}.json — same shape produced by
// scripts/parseTeamCraftersRoster.mjs (no individual ratings, just OVR).
//
// Usage:
//   node scripts/convertScraperTsv.mjs --input /tmp/all_players.tsv
//
// Existing rosters are NOT overwritten unless --force is passed.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname } from 'node:path'
import * as registry from '../src/data/teamRegistry.js'

const args = (() => {
  const out = {}
  const a = process.argv.slice(2)
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--force') { out.force = true; continue }
    if (a[i].startsWith('--')) { out[a[i].slice(2)] = a[i + 1]; i++ }
  }
  return out
})()
const { input, force = false, updated = '2026-02-17' } = args
if (!input) {
  console.error('Usage: --input <tsv> [--force] [--updated YYYY-MM-DD]')
  process.exit(1)
}

const TEAMS = registry.TEAMS || registry.default
const teamList = Array.isArray(TEAMS) ? TEAMS : Object.values(TEAMS)
const fbs = teamList.filter(t => t && t.tid >= 1 && t.tid <= 136)

// Build name → tid index. Strip the mascot suffix from our registry names so
// "Air Force Falcons" matches the scraper's "Air Force". A few teams need
// explicit overrides because the scraper's H1 text doesn't share a prefix
// with our full name (e.g. "BYU" vs "Brigham Young Cougars").
const MASCOT_WORDS = new Set([
  'falcons','zips','mountaineers','wildcats','razorbacks','knights','wolves',
  'devils','tigers','cardinals','tide','eagles','bears','broncos','hens',
  'red','sun','black','crimson','golden','blue','green','rainbow','warriors',
  'fightin\'','fighting','illini','hawkeyes','cyclones','hoosiers','gamecocks',
  'dukes','owls','flashes','jayhawks','flames','bulldogs','redhawks','minutemen',
  'hurricanes','wolverines','gophers','rebels','thundering','herd','spartans',
  'state','bobcats','wolfpack','irish','cornhuskers','pack','huskies','aggies',
  'panthers','catamounts','volunteers','utes','miners','roadrunners','cavaliers',
  'commodores','hokies','demon','deacons','badgers','hilltoppers','seminoles',
  'mean','jackets','cougars','chanticleers','buffaloes','rams','pirates','owls',
  'monarchs','cowboys','ducks','beavers','buckeyes','sooners','boilermakers',
  'bearkats','scarlet','mustangs','cardinal','orange','horned','frogs','longhorns',
  'hurricane','rockets','trojans','raiders','red wave','wave','bobcats','blazers',
  'bearcats','bruins','dawgs','dawgs','jaguars','lobos','mean green',
  'mean','rebels','aztecs','redbirds','toppers','lopes','runnin',
  'gators','seminoles','demon deacons','red wolves','red raiders','crimson tide',
  'thundering herd','green wave','mountain hawks','blue devils','blue hens',
  'fighting illini','fighting irish','hokies','warriors','wolverines',
  'volunteers','vols','black knights','golden flashes','golden bears',
  'golden eagles','golden hurricane','golden gophers','sun devils',
  'fightin\' blue hens','blue raiders','49ers','chippewas',
])

const NICKNAME_OVERRIDES = {
  // teamcrafters H1 → our exact registry abbr (case-insensitive)
  'byu': 'BYU',
  'brigham young': 'BYU',
  'ole miss': 'MISS',
  'pitt': 'PITT',
  'pittsburgh': 'PITT',
  'lsu': 'LSU',
  'tcu': 'TCU',
  'smu': 'SMU',
  'ucf': 'UCF',
  'ucla': 'UCLA',
  'usc': 'USC',
  'usf': 'USF',
  'south florida': 'USF',
  'unlv': 'UNLV',
  'utsa': 'UTSA',
  'utep': 'UTEP',
  'uab': 'UAB',
  'fau': 'FAU',
  'fiu': 'FIU',
  'connecticut': 'CONN',
  'uconn': 'CONN',
  'miami': 'MIA',
  'miami (oh)': 'M-OH',
  'miami ohio': 'M-OH',
  'usm': 'USM',
  'southern miss': 'USM',
  'southern mississippi': 'USM',
  'ulm': 'ULM',
  'louisiana-monroe': 'ULM',
  'monroe': 'ULM',
  'louisiana': 'UL',
  'louisiana-lafayette': 'UL',
  'lafayette': 'UL',
  'mass': 'MASS',
  'umass': 'MASS',
  'massachusetts': 'MASS',
  'jacksonville state': 'JKST',
  'jacksonville st.': 'JKST',
  'sam houston': 'SHSU',
  'sam houston state': 'SHSU',
  'middle tennessee': 'MTSU',
  'middle tennessee state': 'MTSU',
  'mtsu': 'MTSU',
  'missouri state': 'MZST',
  'james madison': 'JMU',
  'jmu': 'JMU',
  'kennesaw state': 'KENN',
  'kennesaw': 'KENN',
  'app state': 'APP',
  'appalachian state': 'APP',
  'kent state': 'KENT',
  'kent st.': 'KENT',
  'sjsu': 'SJSU',
  'san jose state': 'SJSU',
  'san jose st.': 'SJSU',
  'sdsu': 'SDSU',
  'san diego state': 'SDSU',
  'georgia southern': 'GASO',
  'georgia state': 'GSU',
  'georgia tech': 'GT',
  'old dominion': 'ODU',
  'mass.': 'MASS',
  'lib': 'LIB',
  'liberty': 'LIB',
  'texas a&m': 'TAMU',
  'tamu': 'TAMU',
  'tennessee': 'UT',
  'utah state': 'USU',
  'utah st.': 'USU',
  'wake forest': 'WAKE',
  'west virginia': 'WVU',
  'wisconsin': 'WIS',
  'western kentucky': 'WKU',
  'western michigan': 'WMU',
  'washington state': 'WSU',
  'washington st.': 'WSU',
  'wyoming': 'WYO',
  'cincinnati': 'UC',
  'houston': 'UH',
  'kentucky': 'UK',
  'maryland': 'UMD',
  'tulsa': 'TLSA',
  'tulane': 'TULN',
  'temple': 'TEM',
  'memphis': 'MEM',
  'rice': 'RICE',
  'navy': 'NAVY',
  'notre dame': 'ND',
  'army': 'ARMY',
  'air force': 'AFA',
  'troy': 'TROY',
  'south alabama': 'USA',
  'georgia': 'UGA',
  'north carolina': 'UNC',
  'unc charlotte': 'CHAR',
  'charlotte': 'CHAR',
  'nc state': 'NCST',
  'north carolina state': 'NCST',
  'mississippi state': 'MSST',
  'mississippi': 'MISS',
  'michigan state': 'MSU',
  'michigan st.': 'MSU',
  'florida state': 'FSU',
  'florida st.': 'FSU',
  'iowa state': 'ISU',
  'iowa st.': 'ISU',
  'kansas state': 'KSU',
  'kansas st.': 'KSU',
  'oklahoma state': 'OKST',
  'oklahoma st.': 'OKST',
  'oregon state': 'ORST',
  'oregon st.': 'ORST',
  'penn state': 'PSU',
  'penn st.': 'PSU',
  'ohio state': 'OSU',
  'ohio st.': 'OSU',
  'arizona state': 'ASU',
  'arizona st.': 'ASU',
  'arkansas state': 'ARST',
  'arkansas st.': 'ARST',
  'boise state': 'BOIS',
  'boise st.': 'BOIS',
  'colorado state': 'CSU',
  'colorado st.': 'CSU',
  'fresno state': 'FRES',
  'fresno st.': 'FRES',
  'florida international': 'FIU',
  'florida atlantic': 'FAU',
  'eastern michigan': 'EMU',
  'east carolina': 'ECU',
  'central michigan': 'CMU',
  'coastal carolina': 'CCU',
  'bowling green': 'BGSU',
  'boston college': 'BC',
  'baylor': 'BU',
  'ball state': 'BALL',
  'buffalo': 'BUFF',
  'akron': 'AKR',
  'auburn': 'AUB',
  'arizona': 'ARIZ',
  'arkansas': 'ARK',
  'alabama': 'BAMA',
  'california': 'CAL',
  'colorado': 'COLO',
  'clemson': 'CLEM',
  'delaware': 'DEL',
  'duke': 'DUKE',
  'florida': 'FLA',
  'hawaii': 'HAW',
  'hawai\'i': 'HAW',
  'illinois': 'ILL',
  'iowa': 'IOWA',
  'indiana': 'IU',
  'louisville': 'LOU',
  'louisiana tech': 'LT',
  'kansas': 'KU',
  'marshall': 'MRSH',
  'minnesota': 'MINN',
  'missouri': 'MIZ',
  'michigan': 'MICH',
  'nevada': 'NEV',
  'nebraska': 'NEB',
  'new mexico': 'UNM',
  'new mexico state': 'NMSU',
  'nmsu': 'NMSU',
  'northwestern': 'NU',
  'northern illinois': 'NIU',
  'north texas': 'UNT',
  'ohio': 'OHIO',
  'oklahoma': 'OU',
  'oregon': 'ORE',
  'purdue': 'PUR',
  'rutgers': 'RUTG',
  'stanford': 'STAN',
  'south carolina': 'SCAR',
  'syracuse': 'SYR',
  'texas': 'TEX',
  'texas tech': 'TTU',
  'texas state': 'TXST',
  'toledo': 'TOL',
  'utah': 'UTAH',
  'virginia': 'UVA',
  'virginia tech': 'VT',
  'vanderbilt': 'VAN',
  'washington': 'WASH',
}

function normalize(s) {
  return (s || '').toLowerCase().trim()
    .replace(/[‘’]/g, "'")
    .replace(/[^a-z0-9'.& -]/g, ' ')
    .replace(/\s+/g, ' ')
}

function findTid(scrapedName) {
  const norm = normalize(scrapedName)
  if (NICKNAME_OVERRIDES[norm]) {
    const abbr = NICKNAME_OVERRIDES[norm]
    const hit = fbs.find(t => t.abbr === abbr)
    if (hit) return hit.tid
  }
  // try: scraped name is a prefix of our registry name (stripping mascot suffixes)
  for (const t of fbs) {
    const regNorm = normalize(t.name)
    if (regNorm === norm) return t.tid
    if (regNorm.startsWith(norm + ' ')) return t.tid
  }
  // fallback: scraped name is the abbr itself
  const byAbbr = fbs.find(t => normalize(t.abbr) === norm)
  if (byAbbr) return byAbbr.tid
  return null
}

// --- parsing the scraper's bio cell ---
const POSITION_MAP = {
  LE: 'LEDG', RE: 'REDG',
  LOLB: 'WILL', MLB: 'MIKE', ROLB: 'SAM',
}
const CLASS_MAP = { SR: 'Sr', JR: 'Jr', SO: 'So', FR: 'Fr' }

function fixWeight(w) {
  const n = Number(w)
  if (!Number.isFinite(n)) return { weight: null, fixed: false }
  if (n >= 150) return { weight: n, fixed: false }
  return { weight: 200 + n, fixed: true }
}

function splitName(full) {
  const parts = (full || '').trim().split(/\s+/)
  if (parts.length < 2) return { firstName: '', lastName: full || '' }
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') }
}

// --- read TSV ---
const raw = readFileSync(input, 'utf8')
const lines = raw.split('\n').filter(l => l.length > 0)
const header = lines[0].split('\t')
const colIdx = Object.fromEntries(header.map((h, i) => [h, i]))
const REQUIRED = ['team_id','team','name','pos','num','height','weight','year','redshirt','archetype','abilities','OVR']
for (const r of REQUIRED) {
  if (!(r in colIdx)) {
    console.error(`Missing column "${r}" in TSV header. Got: ${header.join(', ')}`)
    process.exit(1)
  }
}

// group rows by team_id (the scraper's tid, not ours)
const byScraperTid = new Map()
for (const line of lines.slice(1)) {
  const cells = line.split('\t')
  const sid = cells[colIdx.team_id]
  if (!byScraperTid.has(sid)) byScraperTid.set(sid, [])
  byScraperTid.get(sid).push(cells)
}

let writeCount = 0
let skipExisting = 0
const unmapped = []
const wrote = []

for (const [scraperTid, rows] of byScraperTid) {
  const teamName = rows[0][colIdx.team]
  const ourTid = findTid(teamName)
  if (ourTid == null) {
    unmapped.push({ scraperTid, teamName })
    continue
  }
  const outPath = `src/data/defaultRosters/${ourTid}.json`
  if (existsSync(outPath) && !force) {
    skipExisting++
    continue
  }
  const players = []
  let weightFixedCount = 0
  for (const cells of rows) {
    const name = cells[colIdx.name]
    const sourcePos = cells[colIdx.pos]
    const jerseyNumber = cells[colIdx.num]
    const height = cells[colIdx.height]
    const weightRaw = cells[colIdx.weight]
    const yearCode = cells[colIdx.year]
    const isRS = cells[colIdx.redshirt] === 'yes'
    const archetype = cells[colIdx.archetype]
    const abilitiesStr = cells[colIdx.abilities] || ''
    const abilities = abilitiesStr ? abilitiesStr.split('; ').map(s => s.trim()).filter(Boolean) : []
    const overall = Number(cells[colIdx.OVR])
    if (!Number.isFinite(overall)) continue

    const position = POSITION_MAP[sourcePos] || sourcePos
    const baseClass = CLASS_MAP[yearCode] || yearCode
    const playerClass = isRS ? `RS ${baseClass}` : baseClass
    const { firstName, lastName } = splitName(name)
    const { weight, fixed: wf } = fixWeight(weightRaw)
    if (wf) weightFixedCount++

    players.push({
      name, firstName, lastName,
      position, jerseyNumber,
      height: height || '', weight, ...(wf ? { weightFixed: true } : {}),
      class: playerClass,
      archetype: archetype || '',
      devTrait: '',
      overall,
      abilities,
      hometown: '',
      state: '',
    })
  }
  const ourTeam = fbs.find(t => t.tid === ourTid)
  const out = {
    tid: ourTid,
    teamName: ourTeam ? ourTeam.name : teamName,
    source: 'TeamCrafters',
    sourceUpdated: updated,
    parsedAt: new Date().toISOString().slice(0, 10),
    players,
  }
  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, JSON.stringify(out, null, 2) + '\n')
  writeCount++
  wrote.push({ tid: ourTid, name: ourTeam?.name || teamName, players: players.length, weightFixedCount })
}

console.log(`✓ wrote ${writeCount} new roster files`)
console.log(`  skipped ${skipExisting} files that already exist (use --force to overwrite)`)
if (unmapped.length) {
  console.log(`\n⚠ ${unmapped.length} scraper teams did NOT map to a tid — names below need overrides:`)
  for (const u of unmapped) console.log(`  scraper#${u.scraperTid}  "${u.teamName}"`)
}
console.log('\nwrote:')
for (const w of wrote.sort((a,b) => a.tid - b.tid)) {
  const wf = w.weightFixedCount ? `  (${w.weightFixedCount} weight fixes)` : ''
  console.log(`  tid ${w.tid.toString().padStart(3)}  ${w.players.toString().padStart(3)} players  ${w.name}${wf}`)
}
