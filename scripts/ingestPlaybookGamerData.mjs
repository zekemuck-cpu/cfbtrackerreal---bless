#!/usr/bin/env node
// Ingests https://playbookgamer.com/college-football-27-playbooks/ — a static
// WordPress page (Ninja Tables plugin, real HTML tables, no API needed) that
// carries data civil.gg doesn't:
//   - A more accurate/current real-team -> scheme mapping (confirmed against
//     civil.gg's college_team_ratings: several teams disagreed, e.g. Arkansas
//     State civil.gg="Spread" vs here="Power Spread").
//   - Real per-team offense play-type tendency (run/pass/RPO/motion/option/
//     QB run counts) and personnel-grouping counts (00/01/10/11/12/21/... by
//     the standard 2-digit codes) — nothing else we have gives this.
//   - Defense tendency/personnel only exists for the 30 generic scheme
//     templates (same limitation as civil.gg — real teams don't have
//     customized defensive playbooks in the underlying game data).
//
// Output:
//   - Patches src/data/playbookData/teams.json's offensiveScheme/
//     defensiveScheme in place (this becomes the corrected source of truth).
//   - Writes src/data/playbookData/playbookTendency.json, keyed by the same
//     teamId used everywhere else in playbookData (real team id from
//     teams.json, or the scheme-template id from schemeTeamIds.json).
//
// One-time / manually-rerun script, not part of the app build.
//
// Usage:
//   node scripts/ingestPlaybookGamerData.mjs
import { writeFileSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = join(__dirname, '../src/data/playbookData')
const URL = 'https://playbookgamer.com/college-football-27-playbooks/'

// A few school names differ between playbookgamer.com and our civil.gg-
// sourced teams.json (long_name style vs display style).
const NAME_ALIASES = {
  California: 'Cal',
  'Florida International': 'FIU',
  'Miami FL': 'Miami',
  'Miami OH': 'Miami (OH)',
  'UL Monroe': 'Louisiana-Monroe',
  USF: 'South Florida',
}

const TABLE_HEADERS = {
  // TEAM | CONFERENCE | OFFENSE | DEFENSE
  team: ['team', 'conference', 'offense', 'defense'],
  // PLAYBOOK | STYLE | 00 | 01 | 02 | 10 | 11 | 12 | 13 | 20 | 21 | 22 | 23 | 30 | 31 | 32 | VAR
  personnel: ['playbook', 'style', 'p00', 'p01', 'p02', 'p10', 'p11', 'p12', 'p13', 'p20', 'p21', 'p22', 'p23', 'p30', 'p31', 'p32', 'pvar'],
  // PLAYBOOK | STYLE | TOTAL | RUN | PASS | RPO | MOTION | OPTION | QB RUN
  offenseTendency: ['playbook', 'style', 'total', 'run', 'pass', 'rpo', 'motion', 'option', 'qbrun'],
  // PLAYBOOK | STYLE | ZONE | BLITZ | MAN | MATCH | TOTAL
  defenseTendency: ['playbook', 'style', 'zone', 'blitz', 'man', 'match', 'total'],
}

// Which <table foo_table_NNNNN> element (in document order) is which. These
// WordPress-internal ids are fragile (they can shift if the page is re-
// edited), so every table is re-validated against its own rendered header
// text below before use — a ROLE_FINGERPRINTS mismatch aborts the run
// instead of silently ingesting the wrong table under the wrong label.
const TABLE_ROLES = {
  '41912': 'team',
  '41901': 'personnel',
  '41895': 'offenseTendency',
  '41903': 'defenseTendency',
}

// First two rendered <th> labels expected for each role — enough to catch a
// swapped/renumbered table without hardcoding every column.
const ROLE_FINGERPRINTS = {
  team: ['TEAM', 'CONFERENCE'],
  personnel: ['PLAYBOOK', 'STYLE'], // distinguished from the others by column count (17) instead, checked separately
  offenseTendency: ['PLAYBOOK', 'STYLE'],
  defenseTendency: ['PLAYBOOK', 'STYLE'],
}
const ROLE_COLUMN_COUNTS = {
  team: 4, personnel: 17, offenseTendency: 9, defenseTendency: 7,
}

function extractHeaderLabels(tableHtml) {
  const thRe = /ninja_clmn_nm_[a-z0-9_]+\s*"[^>]*>([^<]*)<\/th>/gi
  const labels = []
  let m
  while ((m = thRe.exec(tableHtml))) labels.push(m[1].trim())
  return labels
}

function toNumber(str) {
  const n = parseInt(String(str).trim(), 10)
  return Number.isFinite(n) ? n : 0
}

function extractRows(tableHtml, headers) {
  const rowRe = /<tr[^>]*class="[^"]*nt_row_id_\d+[^"]*"[^>]*>([\s\S]*?)<\/tr>/g
  const cellRe = /<td[^>]*>([\s\S]*?)<\/td>/g
  const rows = []
  let m
  while ((m = rowRe.exec(tableHtml))) {
    const cells = []
    let cm
    cellRe.lastIndex = 0
    while ((cm = cellRe.exec(m[1]))) cells.push(cm[1].replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').trim())
    if (cells.length) rows.push(Object.fromEntries(headers.map((h, i) => [h, cells[i] ?? ''])))
  }
  return rows
}

async function main() {
  console.log('Fetching playbookgamer.com...')
  const res = await fetch(URL, {
    headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
  })
  if (!res.ok) throw new Error(`fetch failed: ${res.status}`)
  const html = await res.text()
  console.log(`  ${html.length} bytes`)

  // Locate each real <table foo_table_NNNNN> element (there are other
  // incidental mentions of the id string elsewhere on the page, e.g. nav —
  // only match the actual opening <table> tag) and slice each table's HTML
  // from its own open tag to the next table's open tag.
  const openRe = /<table[^>]*foo_table_(\d+)[^>]*>/g
  const opens = []
  let m
  while ((m = openRe.exec(html))) opens.push({ id: m[1], idx: m.index })
  console.log(`  found ${opens.length} tables`)

  const tables = {}
  for (let i = 0; i < opens.length; i++) {
    const role = TABLE_ROLES[opens[i].id]
    if (!role) continue
    const start = opens[i].idx
    const end = i + 1 < opens.length ? opens[i + 1].idx : html.length
    const tableHtml = html.slice(start, end)

    const labels = extractHeaderLabels(tableHtml)
    const [expect1, expect2] = ROLE_FINGERPRINTS[role]
    const expectedCols = ROLE_COLUMN_COUNTS[role]
    if (labels[0] !== expect1 || labels[1] !== expect2 || labels.length !== expectedCols) {
      throw new Error(
        `Table foo_table_${opens[i].id} was expected to be "${role}" (headers starting `
        + `${expect1}/${expect2}, ${expectedCols} columns) but actually has headers `
        + `[${labels.join(', ')}] — the site's table ids have likely changed; update `
        + `TABLE_ROLES by re-checking each table's real headers before re-running.`,
      )
    }

    tables[role] = extractRows(tableHtml, TABLE_HEADERS[role])
    console.log(`  table ${opens[i].id} (${role}): ${tables[role].length} rows [validated]`)
  }
  for (const role of Object.keys(TABLE_HEADERS)) {
    if (!tables[role]) throw new Error(`Could not locate the "${role}" table — site layout may have changed.`)
  }

  // ── Patch teams.json's scheme assignments ──────────────────────────────
  const teamsPath = join(OUT_DIR, 'teams.json')
  const teams = JSON.parse(readFileSync(teamsPath, 'utf8'))
  const teamByName = new Map(teams.map((t) => [t.name, t]))
  const resolveTeam = (rawName) => teamByName.get(NAME_ALIASES[rawName] || rawName) || null

  let corrected = 0
  const unmatched = []
  for (const row of tables.team) {
    const team = resolveTeam(row.team)
    if (!team) { unmatched.push(row.team); continue }
    if (team.offensiveScheme !== row.offense || team.defensiveScheme !== row.defense) corrected++
    team.offensiveScheme = row.offense || null
    team.defensiveScheme = row.defense || null
  }
  console.log(`  corrected ${corrected} teams' scheme assignments`)
  if (unmatched.length) console.log('  UNMATCHED team names (not written):', unmatched)
  writeFileSync(teamsPath, JSON.stringify(teams))
  console.log('  wrote teams.json')

  // ── Build playbookTendency.json ─────────────────────────────────────────
  const schemeTeamIds = JSON.parse(readFileSync(join(OUT_DIR, 'schemeTeamIds.json'), 'utf8'))
  const resolvePlaybookId = (rawName, side) => {
    const team = resolveTeam(rawName)
    if (team) return team.id
    return schemeTeamIds[side]?.[rawName] || null
  }

  const personnelByKey = new Map(tables.personnel.map((r) => [`${r.playbook}::${r.style}`, r]))

  const tendency = { offense: {}, defense: {} }
  for (const row of tables.offenseTendency) {
    const id = resolvePlaybookId(row.playbook, 'offense')
    if (id == null) continue
    const p = personnelByKey.get(`${row.playbook}::${row.style}`)
    tendency.offense[id] = {
      total: toNumber(row.total), run: toNumber(row.run), pass: toNumber(row.pass),
      rpo: toNumber(row.rpo), motion: toNumber(row.motion), option: toNumber(row.option), qbRun: toNumber(row.qbrun),
      personnel: p ? {
        '00': toNumber(p.p00), '01': toNumber(p.p01), '02': toNumber(p.p02),
        '10': toNumber(p.p10), '11': toNumber(p.p11), '12': toNumber(p.p12), '13': toNumber(p.p13),
        '20': toNumber(p.p20), '21': toNumber(p.p21), '22': toNumber(p.p22), '23': toNumber(p.p23),
        '30': toNumber(p.p30), '31': toNumber(p.p31), '32': toNumber(p.p32), var: toNumber(p.pvar),
      } : null,
    }
  }
  for (const row of tables.defenseTendency) {
    const id = resolvePlaybookId(row.playbook, 'defense')
    if (id == null) continue
    tendency.defense[id] = {
      total: toNumber(row.total), zone: toNumber(row.zone), blitz: toNumber(row.blitz),
      man: toNumber(row.man), match: toNumber(row.match),
    }
  }
  writeFileSync(join(OUT_DIR, 'playbookTendency.json'), JSON.stringify(tendency))
  console.log(`  wrote playbookTendency.json (${Object.keys(tendency.offense).length} offense, ${Object.keys(tendency.defense).length} defense playbooks)`)

  console.log('Done.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
