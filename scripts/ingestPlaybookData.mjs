#!/usr/bin/env node
// Ingests public CFB27 formation/play/scheme data from civil.gg's public
// Supabase REST API (the same "anon" key their own client bundle ships,
// gated server-side by RLS on public tables — not authenticated/paywalled
// data) into static files under src/data/playbookData/.
//
// This is a one-time / manually-rerun script, NOT part of the app build —
// the Scheme Builder feature reads the static output only, so the app never
// depends on civil.gg's API at runtime.
//
// Usage:
//   node scripts/ingestPlaybookData.mjs
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = join(__dirname, '../src/data/playbookData')

const SUPABASE_URL = 'https://fatgvrcdozmbkxcwpwsc.supabase.co/rest/v1'
const APIKEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZhdGd2cmNkb3ptYmt4Y3dwd3NjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk3NjQxNzMsImV4cCI6MjA3NTM0MDE3M30.1LC8jIhJ15ckSgVv66Dzi6YD88Nwc7htOLPhor9Q1LY'
const GAME_YEAR = 27

const PLAY_TYPE_SIDE = {
  RUN: 'offense', PASS: 'offense', RPO: 'offense',
  MAN: 'defense', ZONE: 'defense', BLITZ: 'defense', MATCH: 'defense',
}

// A few scheme-name spellings differ between civil.gg's ratings table and
// the canonical in-game scheme list; normalize on ingest so downstream code
// only ever sees the canonical names.
const NORMALIZE_SCHEME = { 'Multiple O': 'Multiple' }

// The canonical scheme lists (mirrors src/data/archetypeSchemeFit.js — kept
// duplicated here since this script runs standalone under plain Node, not
// through Vite's ESM/JSX pipeline).
const OFFENSE_SCHEMES = [
  'Air Raid', 'Go Go', 'Multiple', 'Option', 'Pistol', 'Power Spread',
  'Pro Style', 'Run & Shoot', 'Spread', 'Spread Option', 'Veer & Shoot',
]
const DEFENSE_SCHEMES = [
  '3-2-6',
  '3-3-5', '3-3-5 Man', '3-3-5 Man Pressure', '3-3-5 Shell', '3-3-5 Three High', '3-3-5 Tite', '3-3-5 Zone', '3-3-5 Zone Pressure',
  '3-4', '3-4 Man', '3-4 Man Pressure', '3-4 Multiple', '3-4 Shell', '3-4 Zone', '3-4 Zone Pressure',
  '4-2-5', '4-2-5 Man', '4-2-5 Man Pressure', '4-2-5 Shell', '4-2-5 Zone', '4-2-5 Zone Pressure',
  '4-3', '4-3 Man', '4-3 Man Pressure', '4-3 Multiple', '4-3 Press Quarters', '4-3 Shell', '4-3 Zone', '4-3 Zone Pressure',
  'Multiple', 'Multiple D',
]
const SCHEME_NAME_SET = new Set([...OFFENSE_SCHEMES, ...DEFENSE_SCHEMES])

async function fetchAll(table, params, { pageSize = 1000 } = {}) {
  const rows = []
  let offset = 0
  for (;;) {
    const url = `${SUPABASE_URL}/${table}?${params}&limit=${pageSize}&offset=${offset}`
    const res = await fetch(url, {
      headers: {
        accept: 'application/json',
        'accept-profile': 'public',
        apikey: APIKEY,
        authorization: `Bearer ${APIKEY}`,
        origin: 'https://www.civil.gg',
      },
    })
    if (!res.ok) throw new Error(`${table} fetch failed: ${res.status} ${await res.text()}`)
    const batch = await res.json()
    rows.push(...batch)
    if (batch.length < pageSize) break
    offset += pageSize
  }
  return rows
}

function writeJson(relPath, data) {
  const full = join(OUT_DIR, relPath)
  mkdirSync(dirname(full), { recursive: true })
  writeFileSync(full, JSON.stringify(data))
  console.log(`  wrote ${relPath} (${Array.isArray(data) ? data.length + ' rows' : 'object'})`)
}

// set_name values contain spaces/slashes ("3-3-5", "I Form") — make them
// filesystem-safe without losing readability.
function slug(name) {
  return String(name).trim().replace(/[^a-zA-Z0-9-]+/g, '_')
}

async function main() {
  console.log('Fetching formation catalog (with personnel groupings)...')
  const formations = await fetchAll(
    'college_formation_play_counts',
    `select=set_name,formation_name,side,play_count,new_play_count,personnel,base_personnel&game_year=eq.${GAME_YEAR}`,
  )
  writeJson('formations.json', formations.map((f) => ({
    set_name: f.set_name, formation_name: f.formation_name, side: f.side,
    play_count: f.play_count, new_play_count: f.new_play_count,
    personnel: f.personnel || null, base_personnel: f.base_personnel || null,
  })))
  const withPersonnel = formations.filter((f) => f.personnel).length
  console.log(`  ${withPersonnel}/${formations.length} formations have real personnel data`)

  console.log('Fetching master play list...')
  const plays = await fetchAll(
    'college_plays',
    `select=id,play_name,set_name,formation_name,play_type&game_year=eq.${GAME_YEAR}`,
  )
  console.log(`  ${plays.length} plays total`)

  console.log('Partitioning plays by side/set for lazy loading...')
  const bySetSide = new Map()
  for (const p of plays) {
    const side = PLAY_TYPE_SIDE[p.play_type] || 'offense'
    const key = `${side}/${slug(p.set_name)}`
    if (!bySetSide.has(key)) bySetSide.set(key, [])
    bySetSide.get(key).push({
      id: p.id, name: p.play_name, set: p.set_name, formation: p.formation_name, type: p.play_type,
    })
  }
  for (const [key, rows] of bySetSide) writeJson(`plays/${key}.json`, rows)

  console.log('Fetching teams + scheme ratings...')
  const rawTeams = await fetchAll('college_teams', 'select=id,long_name,short_name,display_name,primary_color')
  const ratings = await fetchAll(
    'college_team_ratings',
    `select=team_id,conference,overall_stars,offensive_scheme,defensive_scheme&game_year=eq.${GAME_YEAR}`,
  )
  const ratingByTeam = new Map(ratings.map((r) => [r.team_id, r]))

  console.log('Fetching real team + scheme-template playbooks (playbook -> plays join, this is the big one)...')
  const playbooks = await fetchAll('college_playbooks', `select=id,team_id,playbook_type&game_year=eq.${GAME_YEAR}`)
  const playbookPlays = await fetchAll('college_playbook_plays', `select=playbook_id,play_id&game_year=eq.${GAME_YEAR}`)
  console.log(`  ${playbooks.length} playbooks, ${playbookPlays.length} playbook-play links`)

  const playById = new Map(plays.map((p) => [p.id, p]))
  const playbookById = new Map(playbooks.map((pb) => [pb.id, pb]))

  // team_id -> { offense: [{id,name,set,formation,type}], defense: [...] }
  const teamPlaybookPlays = new Map()
  for (const link of playbookPlays) {
    const pb = playbookById.get(link.playbook_id)
    const play = playById.get(link.play_id)
    if (!pb || !play) continue
    const side = pb.playbook_type
    if (side !== 'offense' && side !== 'defense') continue
    if (!teamPlaybookPlays.has(pb.team_id)) teamPlaybookPlays.set(pb.team_id, { offense: [], defense: [] })
    teamPlaybookPlays.get(pb.team_id)[side].push({
      id: play.id, name: play.play_name, set: play.set_name, formation: play.formation_name, type: play.play_type,
    })
  }

  // civil.gg's `college_teams` table mixes real schools with ~42 generic
  // "scheme template" entries whose `long_name` IS the exact scheme name
  // (e.g. id 138 = "Air Raid", id 168 = "4-3 Press Quarters") — these are
  // the game's own official per-scheme default playbooks, not real teams.
  // Detect them by exact name match, then disambiguate side by which side
  // actually has play data (a couple of scheme names collide between the
  // offense and defense lists, e.g. "Multiple").
  const schemeTeamIds = { offense: {}, defense: {} } // schemeName -> teamId
  const realTeams = []
  for (const t of rawTeams) {
    if (SCHEME_NAME_SET.has(t.long_name)) {
      const plays_ = teamPlaybookPlays.get(t.id) || { offense: [], defense: [] }
      const side = plays_.defense.length > plays_.offense.length ? 'defense' : 'offense'
      if ((side === 'offense' && OFFENSE_SCHEMES.includes(t.long_name)) || (side === 'defense' && DEFENSE_SCHEMES.includes(t.long_name))) {
        schemeTeamIds[side][t.long_name] = t.id
        continue
      }
    }
    realTeams.push(t)
  }
  console.log(`  ${Object.keys(schemeTeamIds.offense).length}/${OFFENSE_SCHEMES.length} offense scheme playbooks found`)
  console.log(`  ${Object.keys(schemeTeamIds.defense).length}/${DEFENSE_SCHEMES.length} defense scheme playbooks found`)
  const missingOff = OFFENSE_SCHEMES.filter((s) => !schemeTeamIds.offense[s])
  const missingDef = DEFENSE_SCHEMES.filter((s) => !schemeTeamIds.defense[s])
  if (missingOff.length) console.log('  missing offense scheme playbooks:', missingOff.join(', '))
  if (missingDef.length) console.log('  missing defense scheme playbooks:', missingDef.join(', '))

  const teamsOut = realTeams.map((t) => {
    const r = ratingByTeam.get(t.id)
    return {
      id: t.id,
      name: t.long_name,
      abbr: t.short_name,
      mascot: t.display_name,
      color: t.primary_color,
      conference: r?.conference || null,
      offensiveScheme: r ? (NORMALIZE_SCHEME[r.offensive_scheme] || r.offensive_scheme) : null,
      defensiveScheme: r ? (NORMALIZE_SCHEME[r.defensive_scheme] || r.defensive_scheme) : null,
    }
  })
  writeJson('teams.json', teamsOut)
  writeJson('schemeTeamIds.json', schemeTeamIds)

  mkdirSync(join(OUT_DIR, 'teamPlaybooks'), { recursive: true })
  for (const [teamId, sides] of teamPlaybookPlays) {
    writeFileSync(join(OUT_DIR, 'teamPlaybooks', `${teamId}.json`), JSON.stringify(sides))
  }
  console.log(`  wrote teamPlaybooks/ (${teamPlaybookPlays.size} teams + scheme playbooks)`)

  console.log('Building scheme -> formation membership from official scheme playbooks...')
  // scheme -> [{set, formation, playCount}] — exact, authoritative membership
  // (not a fuzzy affinity guess) straight from the game's own default
  // playbook for that scheme.
  const schemeFormations = { offense: {}, defense: {} }
  for (const side of ['offense', 'defense']) {
    for (const [scheme, teamId] of Object.entries(schemeTeamIds[side])) {
      const plays_ = (teamPlaybookPlays.get(teamId) || {})[side] || []
      const counts = new Map()
      for (const p of plays_) {
        const key = `${p.set}::${p.formation}`
        counts.set(key, (counts.get(key) || 0) + 1)
      }
      schemeFormations[side][scheme] = [...counts.entries()]
        .map(([key, playCount]) => {
          const [set, formation] = key.split('::')
          return { set, formation, playCount }
        })
        .sort((a, b) => b.playCount - a.playCount)
    }
  }
  writeJson('schemeFormations.json', schemeFormations)

  console.log('Done.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
