import { useState, useMemo, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useDynasty } from '../../context/DynastyContext'
import { usePathPrefix } from '../../hooks/usePathPrefix'
import { useAuth } from '../../context/AuthContext'
import { normalizeAwardName } from '../../utils/playerHeal'
import { getTeamLogoByTid } from '../../data/teams'
import { getColorsFromTid, getTidFromAbbr } from '../../data/teamRegistry'
import { proxyImageUrl } from '../../utils/imageProxy'
import { getContrastTextColor } from '../../utils/colorUtils'
import { computeCareerAV } from '../../utils/approximateValue'

// ─── Slot definitions ─────────────────────────────────────────────────────────

const ALL_OFFENSE_SLOTS = [
  { key: 'LT1',    label: 'LT',   group: ['LT', 'OT'] },
  { key: 'LG1',    label: 'LG',   group: ['LG', 'OG'] },
  { key: 'C1',     label: 'C',    group: ['C'] },
  { key: 'RG1',    label: 'RG',   group: ['RG', 'OG'] },
  { key: 'RT1',    label: 'RT',   group: ['RT', 'OT'] },
  { key: 'QB1',    label: 'QB',   group: ['QB'] },
  { key: 'HB1',    label: 'HB',   group: ['HB', 'RB', 'FB'] },
  { key: 'HB2',    label: 'HB',   group: ['HB', 'RB', 'FB'] },
  { key: 'WR1',    label: 'WR',   group: ['WR'] },
  { key: 'WR2',    label: 'WR',   group: ['WR'] },
  { key: 'TE1',    label: 'TE',   group: ['TE'] },
  { key: 'SLOTWR', label: 'SLWR', group: ['WR'] },
]

const ALL_DEFENSE_SLOTS = [
  { key: 'EDGE1',  label: 'LEDG', tileLabel: 'LEDG', group: ['LEDG', 'DE', 'LE', 'EDGE'] },
  { key: 'DT1',    label: 'DT',                       group: ['DT', 'NT'] },
  { key: 'DT2',    label: 'DT',                       group: ['DT', 'NT'] },
  { key: 'EDGE2',  label: 'REDG', tileLabel: 'REDG', group: ['REDG', 'DE', 'RE', 'EDGE'] },
  { key: 'OLB1',   label: 'SAM',  tileLabel: 'SAM',  group: ['SAM', 'LOLB'] },
  { key: 'MLB1',   label: 'MLB',                      group: ['MLB', 'MIKE', 'ILB'] },
  { key: 'OLB2',   label: 'WILL', tileLabel: 'WILL', group: ['WILL', 'ROLB'] },
  { key: 'CB1',      label: 'CB',  group: ['CB'] },
  { key: 'CB2',      label: 'CB',  group: ['CB'] },
  { key: 'FS1',      label: 'FS',  group: ['FS'] },
  { key: 'SS1',      label: 'SS',  group: ['SS'] },
  { key: 'SLOTCB',   label: 'SLCB', group: ['CB'] },
  { key: 'GENOLB1',  label: 'OLB',  group: ['SAM', 'WILL', 'OLB', 'LOLB', 'ROLB'] },
  { key: 'GENOLB2',  label: 'OLB',  group: ['SAM', 'WILL', 'OLB', 'LOLB', 'ROLB'] },
]

const ALL_ST_SLOTS = [
  { key: 'K1',  label: 'K',  group: ['K'] },
  { key: 'P1',  label: 'P',  group: ['P'] },
  { key: 'KR1', label: 'KR', group: [], returnType: 'kickReturn' },
  { key: 'PR1', label: 'PR', group: [], returnType: 'puntReturn' },
]

const ALL_POSSIBLE_SLOTS = [...ALL_OFFENSE_SLOTS, ...ALL_DEFENSE_SLOTS, ...ALL_ST_SLOTS]
const slotByKey = Object.fromEntries(ALL_POSSIBLE_SLOTS.map(s => [s.key, s]))

const ALL_SECTION_SLOT_KEYS = {
  offense: ALL_OFFENSE_SLOTS.map(s => s.key),
  defense: ALL_DEFENSE_SLOTS.map(s => s.key),
  st: ALL_ST_SLOTS.map(s => s.key),
}

const DEFAULT_LAYOUT = {
  offense: [
    ['LT1', 'LG1', 'C1', 'RG1', 'RT1'],
    ['WR1', 'QB1', 'HB1', 'TE1', 'WR2'],
  ],
  defense: [
    ['EDGE1', 'DT1', 'DT2', 'EDGE2'],
    ['OLB1', 'MLB1', 'OLB2'],
    ['CB1', 'FS1', 'SS1', 'CB2'],
  ],
  st: [['K1', 'P1', 'KR1', 'PR1']],
}

function getTileLabel(key) {
  const slot = slotByKey[key]
  if (!slot) return key
  if (slot.tileLabel) return slot.tileLabel
  const match = key.match(/^(.+?)(\d+)$/)
  if (!match) return slot.label
  return match[2] === '1' ? slot.label : slot.label + match[2]
}

// Firestore can't store nested arrays, and the layout is rows-of-keys
// (`{ offense: [['LT1',…], …] }`) — a nested array. Writing it straight to the
// dynasty doc throws ("Nested arrays are not supported"), so a cloud user's
// custom Positions layout silently failed to save and reverted to default on
// reload. The fix: persist the layout as a JSON string (allTimeTeam.layoutJSON)
// and decode it here. Falls back to a legacy nested-array `layout` field (old
// local-only saves) and finally DEFAULT_LAYOUT.
function readLayout(att) {
  if (att?.layoutJSON) {
    try {
      const p = JSON.parse(att.layoutJSON)
      if (p && (p.offense || p.defense || p.st)) {
        return {
          offense: p.offense || DEFAULT_LAYOUT.offense,
          defense: p.defense || DEFAULT_LAYOUT.defense,
          st:      p.st      || DEFAULT_LAYOUT.st,
        }
      }
    } catch { /* fall through */ }
  }
  if (att?.layout?.offense) return att.layout
  return DEFAULT_LAYOUT
}

// ─── Award helpers ────────────────────────────────────────────────────────────

const AWARD_PRIORITY = [
  'heisman', 'heismanFinalist', 'maxwell', 'walterCamp', 'chuckBednarik',
  'daveyObrien', 'cfpChampMVP', 'bowlMVP',
  'broncoNagurski', 'dickButkus', 'lombardi', 'outland', 'jimThorpe',
  'fredBiletnikoff', 'doakWalker', 'johnMackey', 'unitasGoldenArm',
  'edgeRusherOfTheYear', 'rimington', 'rayGuy', 'louGroza',
  'returnerOfTheYear', 'shaunAlexander', 'paulHornungAward', 'tedHendricksAward',
]

const AWARD_LABELS = {
  heisman: 'Heisman', heismanFinalist: 'Heisman Finalist', maxwell: 'Maxwell',
  walterCamp: 'Walter Camp', daveyObrien: "Davey O'Brien", chuckBednarik: 'Bednarik',
  broncoNagurski: 'Nagurski', dickButkus: 'Butkus', lombardi: 'Lombardi',
  outland: 'Outland', jimThorpe: 'Thorpe', fredBiletnikoff: 'Biletnikoff',
  johnMackey: 'Mackey', rimington: 'Rimington', rayGuy: 'Ray Guy',
  louGroza: 'Lou Groza', doakWalker: 'Doak Walker', unitasGoldenArm: 'Unitas Golden Arm',
  edgeRusherOfTheYear: 'Edge Rusher of the Year', returnerOfTheYear: 'Returner of the Year',
  shaunAlexander: 'Shaun Alexander', tedHendricksAward: 'Hendricks',
  paulHornungAward: 'Paul Hornung', bowlMVP: 'Bowl MVP', cfpChampMVP: 'CFP Title MVP',
}

// ─── Color util ───────────────────────────────────────────────────────────────

const hexA = (hex, a) => {
  if (!hex || typeof hex !== 'string') return `rgba(120,120,120,${a})`
  let h = hex.replace('#', '')
  if (h.length === 3) h = h.split('').map(c => c + c).join('')
  const n = parseInt(h, 16)
  if (Number.isNaN(n)) return `rgba(120,120,120,${a})`
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`
}

// ─── Data helpers ─────────────────────────────────────────────────────────────

function getPeakOverall(player) {
  const byYear = player.overallByYear || {}
  const vals = Object.values(byYear).map(Number).filter(Number.isFinite)
  const base = typeof player.overall === 'number' ? player.overall : 0
  return vals.length ? Math.max(base, ...vals) : base
}

function getTopAward(accolades) {
  if (!accolades?.length) return null
  let bestKey = null, bestPriority = Infinity
  for (const a of accolades) {
    const key = normalizeAwardName(a.award)
    const p = AWARD_PRIORITY.indexOf(key)
    if (p !== -1 && p < bestPriority) { bestPriority = p; bestKey = key }
  }
  return bestKey ? (AWARD_LABELS[bestKey] || null) : null
}

// Top 3 distinct awards by priority
function getTop3Awards(player) {
  const accolades = player.accolades || []
  const result = []
  const seen = new Set()
  for (const priorityKey of AWARD_PRIORITY) {
    if (seen.has(priorityKey)) continue
    if (accolades.some(a => normalizeAwardName(a.award) === priorityKey)) {
      const label = AWARD_LABELS[priorityKey]
      if (label) { result.push(label); seen.add(priorityKey) }
      if (result.length >= 3) break
    }
  }
  return result
}

// Top 3 stats from the player's peak OVR season
function getBestSeasonStats(player) {
  const overallByYear = player.overallByYear || {}
  const statsByYear = player.statsByYear || {}

  let bestYear = null, bestOvr = -1
  for (const [year, ovr] of Object.entries(overallByYear)) {
    if (Number(ovr) > bestOvr) { bestOvr = Number(ovr); bestYear = String(year) }
  }

  const ys = bestYear
    ? (statsByYear[bestYear] ?? statsByYear[Number(bestYear)])
    : null
  if (!ys) return { stats: [], year: null }

  const pos = (player.position || '').toUpperCase()
  const stats = []

  if (pos === 'QB') {
    const yds = ys.passing?.yds ?? ys.passing?.yards ?? 0
    const tds = ys.passing?.td ?? ys.passing?.tds ?? 0
    const ints = ys.passing?.int ?? ys.passing?.ints ?? null
    if (yds > 0) stats.push(`${yds} Yds`)
    if (tds > 0) stats.push(`${tds} TD`)
    if (ints != null) stats.push(`${ints} INT`)
  } else if (['HB', 'RB', 'FB'].includes(pos)) {
    const rushYds = ys.rushing?.yds ?? ys.rushing?.yards ?? 0
    const rushTd  = ys.rushing?.td  ?? ys.rushing?.tds   ?? 0
    const recYds  = ys.receiving?.yds ?? ys.receiving?.yards ?? 0
    if (rushYds > 0) stats.push(`${rushYds} Rush Yds`)
    if (rushTd  > 0) stats.push(`${rushTd} Rush TD`)
    if (recYds  > 0) stats.push(`${recYds} Rec Yds`)
  } else if (['WR', 'TE'].includes(pos)) {
    const rec  = ys.receiving?.rec  ?? ys.receiving?.receptions ?? 0
    const yds  = ys.receiving?.yds  ?? ys.receiving?.yards      ?? 0
    const tds  = ys.receiving?.td   ?? ys.receiving?.tds        ?? 0
    if (rec  > 0) stats.push(`${rec} Rec`)
    if (yds  > 0) stats.push(`${yds} Yds`)
    if (tds  > 0) stats.push(`${tds} TD`)
  } else if (['LT','LG','C','RG','RT','OT','OG','OL'].includes(pos)) {
    const pancakes = ys.blocking?.pancakes ?? ys.blocking?.pcks ?? 0
    if (pancakes > 0) stats.push(`${pancakes} Pancakes`)
  } else if (['DT','NT','DL','DE','LEDG','REDG','EDGE','LE','RE'].includes(pos)) {
    const sacks = ys.defense?.sacks ?? 0
    const tck   = ys.defense?.tck   ?? ys.defense?.tackles ?? 0
    const tfl   = ys.defense?.tfl   ?? ys.defense?.tacklesForLoss ?? 0
    if (sacks > 0) stats.push(`${sacks} Sacks`)
    if (tck   > 0) stats.push(`${tck} Tckl`)
    if (tfl   > 0) stats.push(`${tfl} TFL`)
  } else if (['LB','OLB','MLB','ILB','SAM','WILL','MIKE','LOLB','ROLB'].includes(pos)) {
    const tck   = ys.defense?.tck   ?? ys.defense?.tackles ?? 0
    const sacks = ys.defense?.sacks ?? 0
    const ints  = ys.defense?.int   ?? ys.defense?.interceptions ?? 0
    if (tck   > 0) stats.push(`${tck} Tckl`)
    if (sacks > 0) stats.push(`${sacks} Sacks`)
    if (ints  > 0) stats.push(`${ints} INT`)
  } else if (['CB', 'FS', 'SS', 'S', 'DB'].includes(pos)) {
    const ints = ys.defense?.int ?? ys.defense?.interceptions ?? 0
    const tck  = ys.defense?.tck ?? ys.defense?.tackles       ?? 0
    const pd   = ys.defense?.pd  ?? ys.defense?.passDeflections ?? 0
    if (ints > 0) stats.push(`${ints} INT`)
    if (tck  > 0) stats.push(`${tck} Tckl`)
    if (pd   > 0) stats.push(`${pd} PD`)
  } else if (pos === 'K') {
    const fgm = ys.kicking?.fgm ?? 0
    const fga = ys.kicking?.fga ?? 0
    const pts = ys.kicking?.pts ?? ys.kicking?.points ?? 0
    if (fgm > 0) stats.push(`${fgm}${fga ? `/${fga}` : ''} FG`)
    if (pts > 0) stats.push(`${pts} Pts`)
  } else if (pos === 'P') {
    const avg      = ys.punting?.avg      ?? 0
    const inside20 = ys.punting?.inside20 ?? 0
    if (avg      > 0) stats.push(`${Number(avg).toFixed(1)} Avg`)
    if (inside20 > 0) stats.push(`${inside20} Inside 20`)
  }

  return { stats: stats.slice(0, 3), year: bestYear }
}

function getBestReturnStats(player, returnType) {
  const statsByYear = player.statsByYear || {}
  let bestYear = null, bestYds = -1
  for (const [year, ys] of Object.entries(statsByYear)) {
    const ret = ys?.[returnType]
    const yds = Number(ret?.yds ?? ret?.yards ?? 0)
    if (yds > bestYds) { bestYds = yds; bestYear = String(year) }
  }
  if (!bestYear) return { stats: [], year: null }
  const ys = statsByYear[bestYear] ?? statsByYear[Number(bestYear)]
  const ret = ys?.[returnType]
  if (!ret) return { stats: [], year: null }
  const label = returnType === 'kickReturn' ? 'KR' : 'PR'
  const stats = []
  const att = ret.att ?? ret.returns ?? 0
  const yds = ret.yds ?? ret.yards ?? 0
  const avg = ret.avg ?? 0
  const td  = ret.td  ?? ret.tds  ?? 0
  if (att > 0) stats.push(`${att} ${label}`)
  if (yds > 0) stats.push(`${yds} ${label} Yds`)
  if (avg > 0) stats.push(`${Number(avg).toFixed(1)} ${label} Avg`)
  if (td  > 0) stats.push(`${td} ${label} TD`)
  return { stats: stats.slice(0, 3), year: bestYear }
}

// Career totals across every season (counting stats summed), top 3 for the
// player's position. Powers the stat line on the All-Time Team cards.
function getCareerStats(player) {
  const seasons = Object.values(player.statsByYear || {}).filter(Boolean)
  const pos = (player.position || '').toUpperCase()
  const sum = (fn) => seasons.reduce((t, ys) => t + Number(fn(ys) || 0), 0)
  const n = (v) => v.toLocaleString()
  const stats = []
  if (pos === 'QB') {
    const yds = sum(ys => ys.passing?.yds ?? ys.passing?.yards)
    const td = sum(ys => ys.passing?.td ?? ys.passing?.tds)
    const int = sum(ys => ys.passing?.int ?? ys.passing?.ints)
    if (yds) stats.push(`${n(yds)} Yds`)
    if (td) stats.push(`${td} TD`)
    if (int) stats.push(`${int} INT`)
  } else if (['HB', 'RB', 'FB'].includes(pos)) {
    const ry = sum(ys => ys.rushing?.yds ?? ys.rushing?.yards)
    const rt = sum(ys => ys.rushing?.td ?? ys.rushing?.tds)
    const recy = sum(ys => ys.receiving?.yds ?? ys.receiving?.yards)
    if (ry) stats.push(`${n(ry)} Rush Yds`)
    if (rt) stats.push(`${rt} Rush TD`)
    if (recy) stats.push(`${n(recy)} Rec Yds`)
  } else if (['WR', 'TE'].includes(pos)) {
    const rec = sum(ys => ys.receiving?.rec ?? ys.receiving?.receptions)
    const yds = sum(ys => ys.receiving?.yds ?? ys.receiving?.yards)
    const td = sum(ys => ys.receiving?.td ?? ys.receiving?.tds)
    if (rec) stats.push(`${rec} Rec`)
    if (yds) stats.push(`${n(yds)} Yds`)
    if (td) stats.push(`${td} TD`)
  } else if (['LT', 'LG', 'C', 'RG', 'RT', 'OT', 'OG', 'OL'].includes(pos)) {
    const p = sum(ys => ys.blocking?.pancakes ?? ys.blocking?.pcks)
    if (p) stats.push(`${n(p)} Pancakes`)
  } else if (['DT', 'NT', 'DL', 'DE', 'LEDG', 'REDG', 'EDGE', 'LE', 'RE'].includes(pos)) {
    const s = sum(ys => ys.defense?.sacks)
    const t = sum(ys => ys.defense?.tck ?? ys.defense?.tackles)
    const tfl = sum(ys => ys.defense?.tfl ?? ys.defense?.tacklesForLoss)
    if (s) stats.push(`${s} Sacks`)
    if (t) stats.push(`${n(t)} Tckl`)
    if (tfl) stats.push(`${tfl} TFL`)
  } else if (['LB', 'OLB', 'MLB', 'ILB', 'SAM', 'WILL', 'MIKE', 'LOLB', 'ROLB'].includes(pos)) {
    const t = sum(ys => ys.defense?.tck ?? ys.defense?.tackles)
    const s = sum(ys => ys.defense?.sacks)
    const i = sum(ys => ys.defense?.int ?? ys.defense?.interceptions)
    if (t) stats.push(`${n(t)} Tckl`)
    if (s) stats.push(`${s} Sacks`)
    if (i) stats.push(`${i} INT`)
  } else if (['CB', 'FS', 'SS', 'S', 'DB'].includes(pos)) {
    const i = sum(ys => ys.defense?.int ?? ys.defense?.interceptions)
    const t = sum(ys => ys.defense?.tck ?? ys.defense?.tackles)
    const pd = sum(ys => ys.defense?.pd ?? ys.defense?.passDeflections)
    if (i) stats.push(`${i} INT`)
    if (t) stats.push(`${n(t)} Tckl`)
    if (pd) stats.push(`${pd} PD`)
  } else if (pos === 'K') {
    const fgm = sum(ys => ys.kicking?.fgm)
    const fga = sum(ys => ys.kicking?.fga)
    const pts = sum(ys => ys.kicking?.pts ?? ys.kicking?.points)
    if (fgm) stats.push(`${fgm}${fga ? `/${fga}` : ''} FG`)
    if (pts) stats.push(`${n(pts)} Pts`)
  } else if (pos === 'P') {
    const i20 = sum(ys => ys.punting?.inside20)
    const avgs = seasons.map(ys => Number(ys.punting?.avg || 0)).filter(v => v > 0)
    const avg = avgs.length ? avgs.reduce((a, b) => a + b, 0) / avgs.length : 0
    if (avg) stats.push(`${avg.toFixed(1)} Avg`)
    if (i20) stats.push(`${i20} In 20`)
  }
  return stats.slice(0, 3)
}

function getCareerReturnStats(player, returnType) {
  const seasons = Object.values(player.statsByYear || {}).filter(Boolean)
  const label = returnType === 'kickReturn' ? 'KR' : 'PR'
  const sum = (fn) => seasons.reduce((t, ys) => t + Number(fn(ys?.[returnType]) || 0), 0)
  const att = sum(r => r?.att ?? r?.returns)
  const yds = sum(r => r?.yds ?? r?.yards)
  const td = sum(r => r?.td ?? r?.tds)
  const stats = []
  if (yds) stats.push(`${yds.toLocaleString()} ${label} Yds`)
  if (td) stats.push(`${td} ${label} TD`)
  if (att) stats.push(`${att} ${label}`)
  return stats.slice(0, 3)
}

// Career AV from ONE return type only (kick OR punt returns), using the same
// weights as the AV util's returnValue(). Used to rank the KR / PR slots so a
// returner is chosen on return production, not their main-position AV.
function getCareerReturnAV(player, returnType) {
  const seasons = Object.values(player.statsByYear || {}).filter(Boolean)
  const yardMult = returnType === 'kickReturn' ? 0.005 : 0.008
  let av = 0
  for (const ys of seasons) {
    const r = ys?.[returnType]
    if (!r) continue
    av += (Number(r.yds ?? r.yards ?? 0)) * yardMult
    av += (Number(r.td ?? r.tds ?? 0)) * 1.5
  }
  return av
}

// Career span, e.g. "2031–35" (or a single year).
function getSeasonSpan(player) {
  const years = Object.keys(player.statsByYear || {}).map(Number).filter(Number.isFinite).sort((a, b) => a - b)
  if (!years.length) return null
  const a = years[0], b = years[years.length - 1]
  return a === b ? String(a) : `${a}–${String(b).slice(-2)}`
}

function getTopStat(player) {
  const pos = (player.position || '').toUpperCase()
  const statsByYear = player.statsByYear || {}
  let best = null, bestVal = 0
  for (const ys of Object.values(statsByYear)) {
    if (!ys) continue
    let val, label
    if (pos === 'QB') {
      val = ys.passing?.yds ?? ys.passing?.yards ?? 0; label = `${val} pass yds`
    } else if (['HB','FB','RB'].includes(pos)) {
      val = ys.rushing?.yds ?? ys.rushing?.yards ?? 0; label = `${val} rush yds`
    } else if (['WR','TE'].includes(pos)) {
      val = ys.receiving?.yds ?? ys.receiving?.yards ?? 0; label = `${val} rec yds`
    } else if (['DT','NT','DL','DE','LEDG','REDG','EDGE','LE','RE'].includes(pos)) {
      const s = ys.defense?.sacks ?? 0, t = ys.defense?.tck ?? ys.defense?.tackles ?? 0
      val = s > 0 ? s : t; label = s > 0 ? `${s} sacks` : `${t} tckls`
    } else if (['LB','OLB','MLB','ILB','SAM','WILL','MIKE','LOLB','ROLB'].includes(pos)) {
      const t = ys.defense?.tck ?? ys.defense?.tackles ?? 0, s = ys.defense?.sacks ?? 0
      val = t > 0 ? t : s; label = t > 0 ? `${t} tckls` : `${s} sacks`
    } else if (['CB','FS','SS','S','DB'].includes(pos)) {
      const i = ys.defense?.int ?? ys.defense?.interceptions ?? 0, t = ys.defense?.tck ?? ys.defense?.tackles ?? 0
      val = i > 0 ? i : t; label = i > 0 ? `${i} INTs` : `${t} tckls`
    } else if (pos === 'K') {
      val = ys.kicking?.fgm ?? 0; label = `${val} FGM`
    } else if (pos === 'P') {
      val = ys.punting?.avg ?? 0; label = val > 0 ? `${Number(val).toFixed(1)} avg` : null
    }
    if (val && val > bestVal) { bestVal = val; best = label }
  }
  return best
}

function getPlayerPeakTid(player) {
  const overallByYear = player.overallByYear || {}
  const teamsByYear = player.teamsByYear || {}
  let peakYear = null, peakOvr = -1
  for (const [year, ovr] of Object.entries(overallByYear)) {
    const o = Number(ovr)
    if (o > peakOvr) { peakOvr = o; peakYear = Number(year) }
  }
  if (peakYear != null) {
    const tid = teamsByYear[peakYear] ?? teamsByYear[String(peakYear)]
    if (tid != null) return Number(tid)
  }
  const years = Object.keys(teamsByYear).map(Number).filter(Number.isFinite).sort((a, b) => b - a)
  for (const y of years) {
    const tid = teamsByYear[y] ?? teamsByYear[String(y)]
    if (tid != null) return Number(tid)
  }
  if (player.teamHistory?.length) {
    const last = [...player.teamHistory].sort((a, b) => (b.toYear ?? 9999) - (a.toYear ?? 9999))[0]
    if (last?.teamTid != null) return Number(last.teamTid)
  }
  return null
}

function getAllCoachedTids(dynasty) {
  const tids = new Set()

  // coachTeamByYear is the authoritative record: one coached team per year.
  // memberTeamHistory is deliberately excluded — it accumulates residual tids from
  // job-flip artifacts at index 1+ and causes false positives.
  if (dynasty.coachTeamByYear) {
    for (const entry of Object.values(dynasty.coachTeamByYear)) {
      if (!entry) continue
      if (entry.tid != null) {
        tids.add(Number(entry.tid))
      } else if (entry.team) {
        // Older records stored only the abbr; derive the tid
        const derived = getTidFromAbbr(entry.team, dynasty)
        if (derived != null) tids.add(Number(derived))
      }
    }
  }

  if (dynasty.currentTid != null) tids.add(Number(dynasty.currentTid))
  return [...tids].filter(t => Number.isFinite(t) && t > 0)
}

// Single source of truth: is this player eligible for any coached-team selection?
// Rule: the player's PEAK OVR year must have been at a coached team.
// This matches the logo shown on the card and prevents players who peaked at
// non-coached schools from appearing even if they later transferred to a coached team.
function isEligiblePlayer(player, coachedSet) {
  if (!player) return false
  // Must have stats
  if (!player.statsByYear || Object.keys(player.statsByYear).length === 0) return false
  const teamsByYear = player.teamsByYear || {}
  // Determine peak year team
  const overallByYear = player.overallByYear || {}
  let peakYear = null, peakOvr = -1
  for (const [year, ovr] of Object.entries(overallByYear)) {
    if (Number(ovr) > peakOvr) { peakOvr = Number(ovr); peakYear = String(year) }
  }
  if (peakYear != null) {
    const peakTid = teamsByYear[peakYear] ?? teamsByYear[Number(peakYear)]
    if (peakTid != null) {
      // Peak year team must be a coached team
      return coachedSet.has(Number(peakTid))
    }
  }
  // Fallback when no overallByYear: any coached team in teamsByYear
  return Object.values(teamsByYear).some(tid => tid != null && coachedSet.has(Number(tid)))
}

// Filter to coached teams only, exact position group, top 15 by peak OVR
function playersForSlot(players, slot, coachedTids) {
  if (!coachedTids?.length) return []
  const coachedSet = new Set(coachedTids.map(Number))

  // Returner slots: filter by having actual return stats; sort by best return yards
  if (slot.returnType) {
    const rt = slot.returnType
    const getBestRetYds = p => Math.max(0,
      ...Object.values(p.statsByYear || {}).map(ys => Number(ys?.[rt]?.yds ?? ys?.[rt]?.yards ?? 0))
    )
    return players
      .filter(p => {
        if (!isEligiblePlayer(p, coachedSet)) return false
        return getBestRetYds(p) > 0
      })
      .map(p => ({ ...p, _peakOvr: getPeakOverall(p) }))
      .sort((a, b) => getBestRetYds(b) - getBestRetYds(a))
      .slice(0, 15)
  }

  const group = new Set(slot.group.map(p => p.toUpperCase()))
  return players
    .filter(p => {
      if (!p.position || !group.has(p.position.toUpperCase())) return false
      return isEligiblePlayer(p, coachedSet)
    })
    .map(p => ({ ...p, _peakOvr: getPeakOverall(p) }))
    .sort((a, b) => b._peakOvr - a._peakOvr)
    .slice(0, 15)
}

// ─── Layout editor modal ──────────────────────────────────────────────────────

const TAB_LABELS = { offense: 'Offense', defense: 'Defense', st: 'Special Teams' }

function LayoutEditorModal({ layout, onSave, onClose }) {
  const [activeTab, setActiveTab] = useState('offense')
  const [editLayout, setEditLayout] = useState({
    offense: (layout.offense || DEFAULT_LAYOUT.offense).map(r => [...r]),
    defense: (layout.defense || DEFAULT_LAYOUT.defense).map(r => [...r]),
    st:      (layout.st      || DEFAULT_LAYOUT.st     ).map(r => [...r]),
  })
  const dragItem = useRef(null)
  const [dropTarget, setDropTarget] = useState(null)

  const section = activeTab
  const rows = editLayout[section] || []
  const usedKeys = new Set(rows.flat())
  const available = (ALL_SECTION_SLOT_KEYS[section] || []).filter(k => !usedKeys.has(k))

  function startDrag(info) { dragItem.current = info }
  function endDrag() { dragItem.current = null; setDropTarget(null) }

  function handleDragOver(e, target) {
    e.preventDefault()
    e.stopPropagation()
    setDropTarget(target)
  }

  function handleDrop(e, target) {
    e.preventDefault()
    e.stopPropagation()
    const drag = dragItem.current
    if (!drag) { endDrag(); return }

    const key = drag.key
    let newRows = editLayout[section].map(r => [...r])

    if (drag.from === 'row') {
      newRows[drag.rowIdx] = newRows[drag.rowIdx].filter((_, i) => i !== drag.slotIdx)
    }

    let tgt = { ...target }
    if (drag.from === 'row' && newRows[drag.rowIdx].length === 0 && tgt.rowIdx != null && tgt.rowIdx > drag.rowIdx) {
      tgt.rowIdx -= 1
    }

    newRows = newRows.filter(r => r.length > 0)

    if (tgt.type === 'slot' && newRows[tgt.rowIdx]) {
      newRows[tgt.rowIdx].splice(tgt.slotIdx, 0, key)
    } else if (tgt.type === 'row-end' && newRows[tgt.rowIdx]) {
      newRows[tgt.rowIdx].push(key)
    } else if (tgt.type === 'new-row') {
      newRows.push([key])
    }

    setEditLayout(prev => ({ ...prev, [section]: newRows }))
    endDrag()
  }

  function resetSection() {
    setEditLayout(prev => ({ ...prev, [section]: DEFAULT_LAYOUT[section].map(r => [...r]) }))
  }

  return (
    <div
      className="fixed inset-0 top-0 left-0 right-0 bottom-0 bg-black bg-opacity-60 flex items-center justify-center z-[9999] p-4"
      style={{ margin: 0 }}
      onClick={onClose}
    >
      <div
        className="rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col"
        style={{ backgroundColor: 'var(--surface-1)', border: '1px solid var(--surface-4)', maxHeight: '90vh' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 flex-shrink-0" style={{ borderBottom: '1px solid var(--surface-3)' }}>
          <span className="font-bold text-txt-primary" style={{ fontSize: '16px' }}>All-Time Team Positions</span>
          <button
            onClick={resetSection}
            className="text-sm transition-colors"
            style={{ color: 'var(--text-secondary)' }}
            onMouseEnter={e => e.target.style.color = 'var(--text-primary)'}
            onMouseLeave={e => e.target.style.color = 'var(--text-secondary)'}
          >
            Reset {TAB_LABELS[section]} to default
          </button>
        </div>

        <div className="px-5 pt-4 pb-3 flex gap-1 flex-shrink-0">
          {['offense', 'defense', 'st'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className="px-4 py-1.5 rounded-md text-sm font-medium transition-colors"
              style={{
                backgroundColor: activeTab === tab ? 'var(--text-primary)' : 'transparent',
                color: activeTab === tab ? 'var(--surface-1)' : 'var(--text-secondary)',
                border: `1px solid ${activeTab === tab ? 'transparent' : 'var(--surface-4)'}`,
              }}
            >
              {TAB_LABELS[tab]}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-4 space-y-2">
          {rows.map((row, rowIdx) => (
            <div
              key={rowIdx}
              className="rounded-lg p-3 flex flex-wrap gap-2 items-center"
              style={{
                backgroundColor: 'var(--surface-2)',
                border: `1px solid ${dropTarget?.type === 'row-end' && dropTarget.rowIdx === rowIdx ? 'var(--text-primary)' : 'var(--surface-4)'}`,
                minHeight: '52px',
                transition: 'border-color 0.1s',
              }}
              onDragOver={e => handleDragOver(e, { type: 'row-end', rowIdx })}
              onDrop={e => handleDrop(e, { type: 'row-end', rowIdx })}
            >
              {row.map((key, slotIdx) => {
                const isInsertBefore = dropTarget?.type === 'slot' && dropTarget.rowIdx === rowIdx && dropTarget.slotIdx === slotIdx
                return (
                  <div key={key} className="flex items-center">
                    {isInsertBefore && (
                      <div className="w-0.5 h-7 rounded mr-1.5 flex-shrink-0" style={{ backgroundColor: 'var(--text-primary)' }} />
                    )}
                    <div
                      draggable
                      onDragStart={() => startDrag({ from: 'row', rowIdx, slotIdx, key })}
                      onDragEnd={endDrag}
                      onDragOver={e => handleDragOver(e, { type: 'slot', rowIdx, slotIdx })}
                      onDrop={e => handleDrop(e, { type: 'slot', rowIdx, slotIdx })}
                      className="px-3 py-1.5 rounded select-none font-bold text-txt-primary"
                      style={{ border: '1px solid var(--surface-5)', backgroundColor: 'var(--surface-3)', fontSize: '13px', letterSpacing: '0.5px', cursor: 'grab' }}
                    >
                      {getTileLabel(key)}
                    </div>
                  </div>
                )
              })}
            </div>
          ))}

          <div
            className="rounded-lg flex items-center justify-center"
            style={{
              height: '48px',
              border: `2px dashed ${dropTarget?.type === 'new-row' ? 'var(--text-primary)' : 'var(--surface-5)'}`,
              transition: 'border-color 0.1s',
            }}
            onDragOver={e => handleDragOver(e, { type: 'new-row' })}
            onDrop={e => handleDrop(e, { type: 'new-row' })}
          >
            <span className="italic" style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>Drag a tile here to add a row</span>
          </div>

          <div className="pt-1">
            <div className="font-bold mb-2" style={{ fontSize: '11px', letterSpacing: '1px', color: 'var(--text-tertiary)' }}>
              AVAILABLE — DRAG HERE TO HIDE
            </div>
            <div
              className="rounded-lg p-3 flex flex-wrap gap-2 items-center"
              style={{
                backgroundColor: 'var(--surface-2)',
                border: `1px solid ${dropTarget?.type === 'available' ? 'var(--text-primary)' : 'var(--surface-4)'}`,
                minHeight: '52px',
                transition: 'border-color 0.1s',
              }}
              onDragOver={e => handleDragOver(e, { type: 'available' })}
              onDrop={e => handleDrop(e, { type: 'available' })}
            >
              {available.length === 0 ? (
                <span className="italic" style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>All positions in use</span>
              ) : available.map(key => (
                <div
                  key={key}
                  draggable
                  onDragStart={() => startDrag({ from: 'available', key })}
                  onDragEnd={endDrag}
                  className="px-3 py-1.5 rounded select-none font-bold"
                  style={{ border: '1px solid var(--surface-5)', backgroundColor: 'var(--surface-3)', fontSize: '13px', letterSpacing: '0.5px', color: 'var(--text-secondary)', cursor: 'grab' }}
                >
                  {getTileLabel(key)}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 px-5 py-4 flex-shrink-0" style={{ borderTop: '1px solid var(--surface-3)' }}>
          <button onClick={onClose} className="px-4 py-2 rounded-md text-sm font-medium transition-colors" style={{ border: '1px solid var(--surface-4)', color: 'var(--text-secondary)' }}>
            Cancel
          </button>
          <button onClick={() => onSave(editLayout)} className="px-4 py-2 rounded-md text-sm font-medium" style={{ backgroundColor: '#2563eb', color: 'white' }}>
            Save
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Player select dropdown ───────────────────────────────────────────────────

function PlayerSelectDropdown({ slotKey, pid, onSelect, eligible, isChange }) {
  // Native <select> so the device's own picker is used — far better on
  // mobile/touch and zero custom positioning to break. Options are text-only
  // ("Name · OVR"). The select keeps a fixed "Change…/Select…" prompt (value
  // stays empty) since the card already shows who's in the slot; picking an
  // option fires onSelect, and "Remove player" clears it.
  const handleChange = (e) => {
    const v = e.target.value
    if (!v) return
    onSelect(slotKey, v === '__remove__' ? null : v)
  }
  return (
    <div className="relative w-full">
      <select
        value=""
        onChange={handleChange}
        onClick={(e) => e.stopPropagation()}
        aria-label={isChange ? 'Change player' : 'Select player'}
        className="w-full appearance-none rounded bg-surface-3 border border-surface-5 text-txt-secondary hover:text-txt-primary hover:border-surface-4 focus:border-[color:var(--text-primary)] focus:outline-none transition-colors cursor-pointer text-[10px] sm:text-xs font-medium pl-1.5 pr-5 py-1"
      >
        <option value="" disabled hidden>{isChange ? 'Change…' : 'Select…'}</option>
        {pid && <option value="__remove__">Remove player</option>}
        {eligible.length === 0
          ? <option value="" disabled>No eligible players</option>
          : eligible.map(p => (
              <option key={p.pid} value={p.pid}>{p.name} · {p._peakOvr} OVR</option>
            ))}
      </select>
      <svg
        className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2"
        width="8" height="8" viewBox="0 0 8 8" fill="none" style={{ color: 'var(--text-tertiary)' }}
      >
        <path d="M1 2.5L4 5.5L7 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  )
}

// ─── Position column ──────────────────────────────────────────────────────────


function PositionCol({ slot, pid, onSelect, eligible, pathPrefix, playerMap, placeholderImages, dynastyTeams, isViewOnly, activeTeam, allTimeTeam, coachedTids }) {
  const coachedSet = useMemo(() => new Set((coachedTids || []).map(Number)), [coachedTids])

  // Validate saved player against the same eligibility rules as the selection pool.
  // Stale saves from before filter fixes are silently treated as empty.
  const rawPlayer = pid ? playerMap[pid] : null
  const player = useMemo(() => {
    if (!rawPlayer) return null
    return isEligiblePlayer(rawPlayer, coachedSet) ? rawPlayer : null
  }, [rawPlayer, coachedSet])
  const playerTid  = player ? getPlayerPeakTid(player) : null
  const teamColors = playerTid ? getColorsFromTid(dynastyTeams, playerTid) : null
  const teamLogo   = playerTid ? getTeamLogoByTid(playerTid, dynastyTeams)  : null
  const primary    = teamColors?.primary  || '#374151'
  const secondary  = teamColors?.secondary || '#ffffff'

  const returnType = slot.returnType || null

  const photoUrl = player?.pictureUrl && !placeholderImages.has(player.pictureUrl) ? player.pictureUrl : null
  const initial  = player ? (player.name || '?').trim().charAt(0).toUpperCase() : null
  const peakOvr  = player ? getPeakOverall(player) : null
  const awards   = (player && !returnType) ? getTop3Awards(player) : []
  const stats = player ? (returnType ? getCareerReturnStats(player, returnType) : getCareerStats(player)) : []
  const span  = player ? getSeasonSpan(player) : null

  // Card text color picked for contrast against the player's team color.
  const txt = getContrastTextColor(primary)

  // Pids already used across both teams (excluding this slot so current player remains selectable)
  const excludePids = useMemo(() => {
    const used = new Set()
    for (const teamKey of ['first', 'second']) {
      const data = allTimeTeam?.[teamKey] || {}
      for (const [k, v] of Object.entries(data)) {
        if (v && !(teamKey === activeTeam && k === slot.key)) used.add(v)
      }
    }
    return used
  }, [allTimeTeam, activeTeam, slot.key])

  const filteredEligible = useMemo(
    () => eligible.filter(p => !excludePids.has(p.pid)),
    [eligible, excludePids]
  )

  return (
    <div className="flex flex-col min-w-0">
      {/* Position label — compact broadcast chip (shows WR2 / HB2, not bare WR) */}
      <div className="mb-1.5 sm:mb-2">
        <span
          className="inline-flex items-center font-display font-bold uppercase rounded text-[8px] sm:text-[10px] px-1.5 py-0.5"
          style={{ letterSpacing: '1px', color: 'var(--text-secondary)', backgroundColor: 'var(--surface-3)', border: '1px solid var(--surface-4)' }}
        >
          {getTileLabel(slot.key)}
        </span>
      </div>

      {player ? (
        // Dark media-card with a team-colored photo header + name band. The
        // team color anchors the identity (header wash, name band, logo chip)
        // while the body stays on the app's standard dark surface — so a roster
        // of mixed teams reads as a cohesive set, not a wall of saturation.
        <div className="media-card relative overflow-hidden">
          {/* Whole-card link to the player page (transparent overlay). The only
              interactive bit on top of it is the Change dropdown (z-[2] below). */}
          <Link to={`${pathPrefix}/player/${player.pid}`} aria-label={player.name} className="absolute inset-0 z-[1]" />
          {/* Photo header — DESKTOP/TABLET only. On phones the cards are too
              narrow for a photo + readable text, so the photo is dropped and the
              team-color name block (below) carries the OVR + logo + name. */}
          <div className="hidden sm:block relative aspect-square" style={{ backgroundColor: hexA(primary, 0.92) }}>
            {photoUrl ? (
              <img
                src={proxyImageUrl(photoUrl, 300)} alt=""
                className="absolute inset-0 w-full h-full object-cover"
                style={{ objectPosition: '50% 4%' }}
              />
            ) : teamLogo ? (
              <img
                src={teamLogo} alt=""
                className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 object-contain"
                style={{ width: '48px', height: '48px', opacity: 0.5, filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.5))' }}
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center">
                <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '44px', color: hexA(txt, 0.85) }}>{initial}</span>
              </div>
            )}
            <div className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.14) 0%, transparent 32%, rgba(0,0,0,0.20) 100%)' }} />
            <div
              className="absolute top-1.5 right-1.5 rounded tabular-nums text-[16px]"
              style={{ backgroundColor: 'rgba(0,0,0,0.78)', padding: '0 5px', fontFamily: "'Bebas Neue', sans-serif", fontWeight: 700, color: '#fff', letterSpacing: '0.5px', lineHeight: 1.6 }}
            >
              {peakOvr}
            </div>
            {photoUrl && teamLogo && (
              <div
                className="absolute bottom-1.5 left-1.5 rounded-full flex items-center justify-center"
                style={{ width: '22px', height: '22px', backgroundColor: 'rgba(255,255,255,0.94)', boxShadow: '0 1px 3px rgba(0,0,0,0.45)' }}
              >
                <img src={teamLogo} alt="" style={{ width: '15px', height: '15px', objectFit: 'contain' }} />
              </div>
            )}
          </div>

          {/* Name block — team color. On phones it carries the logo + OVR (no
              photo there) and the name WRAPS to 2 lines so it's fully readable;
              on desktop it's the slim single-line name band under the photo. */}
          <div className="px-1.5 sm:px-2 py-1 sm:py-1.5" style={{ backgroundColor: primary }}>
            <div className="sm:hidden flex items-center justify-between mb-0.5">
              {teamLogo ? (
                <img src={teamLogo} alt="" className="w-3.5 h-3.5 object-contain flex-shrink-0" style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.6))' }} />
              ) : <span />}
              <span className="tabular-nums font-bold flex-shrink-0" style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '12px', color: txt, letterSpacing: '0.5px', lineHeight: 1 }}>{peakOvr}</span>
            </div>
            <div
              className="font-display font-bold block leading-tight text-[10px] sm:text-[13px] break-words whitespace-normal sm:whitespace-nowrap sm:truncate"
              style={{ color: txt, letterSpacing: '0.01em' }}
            >
              {player.name}
            </div>
          </div>

          {/* Info shelf — dark surface */}
          <div className="px-1.5 pt-1 pb-1.5 sm:px-2 sm:pt-1.5 sm:pb-2">
            {awards.length > 0 && (
              <div className="truncate font-bold uppercase text-[7px] sm:text-[9px]" style={{ letterSpacing: '0.4px', color: 'var(--accent-warning)' }}>
                {awards.join(' · ')}
              </div>
            )}
            {(stats.length > 0 || span) && (
              <div className="text-txt-tertiary text-[8px] sm:text-[10px] break-words leading-snug" style={{ marginTop: awards.length > 0 ? '2px' : 0 }}>
                {span && <span className="hidden sm:inline text-txt-muted" style={{ marginRight: '4px' }}>{span}</span>}
                {stats.join(' · ')}
              </div>
            )}
            {!isViewOnly && (
              <div className="relative z-[2]" style={{ marginTop: (awards.length > 0 || stats.length > 0) ? '7px' : 0 }}>
                <PlayerSelectDropdown
                  slotKey={slot.key}
                  pid={pid}
                  onSelect={onSelect}
                  eligible={filteredEligible}
                  placeholderImages={placeholderImages}
                  isChange
                  returnType={returnType}
                />
              </div>
            )}
          </div>
        </div>
      ) : (
        // Empty slot — dark dashed placeholder (stretches to the row height)
        <div
          className="rounded-lg flex flex-col items-center justify-center gap-2 px-2 py-4"
          style={{ background: 'var(--surface-2)', border: '1px dashed var(--surface-4)', minHeight: '120px' }}
        >
          <span className="text-txt-tertiary" style={{ fontSize: '11px' }}>—</span>
          {!isViewOnly && (
            <div className="w-full">
              <PlayerSelectDropdown
                slotKey={slot.key}
                pid={null}
                onSelect={onSelect}
                eligible={filteredEligible}
                placeholderImages={placeholderImages}
                returnType={returnType}
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Docked tab bar — matches the leaderboard header tab style so the team /
// section tabs read as an extension of it. ─────────────────────────────────────

function DockedTabs({ tabs, active, onChange }) {
  return (
    <div className="flex overflow-x-auto no-scrollbar -mb-px">
      {tabs.map(t => {
        const isActive = active === t.key
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => onChange(t.key)}
            className="relative flex-shrink-0 px-3 sm:px-4 lg:px-5 py-2.5 font-display font-bold uppercase whitespace-nowrap transition-opacity hover:opacity-100"
            style={{ fontSize: '0.8rem', letterSpacing: '0.06em', color: 'var(--text-primary)', opacity: isActive ? 1 : 0.5 }}
          >
            {t.label}
            {isActive && (
              <span aria-hidden="true" className="absolute left-2 right-2 bottom-0 h-[2px] rounded-t-sm" style={{ backgroundColor: 'var(--text-primary)' }} />
            )}
          </button>
        )
      })}
    </div>
  )
}

// ─── Section grid ─────────────────────────────────────────────────────────────

function SectionGrid({ rows, hideTitle, title, teamData, onSelect, eligibleBySlot, pathPrefix, playerMap, placeholderImages, dynastyTeams, isViewOnly, activeTeam, allTimeTeam, coachedTids }) {
  return (
    <div>
      {!hideTitle && title && (
        <div className="flex items-center gap-4 mb-5">
          <div style={{ flex: 1, height: '1px', background: 'linear-gradient(90deg, transparent, var(--surface-4))' }} />
          <span className="font-black uppercase text-txt-secondary" style={{ fontSize: '12px', letterSpacing: '3px' }}>
            {title.toUpperCase()}
          </span>
          <div style={{ flex: 1, height: '1px', background: 'linear-gradient(90deg, var(--surface-4), transparent)' }} />
        </div>
      )}
      <div className="space-y-6">
        {rows.map((rowKeys, rowIdx) => {
          const slots = rowKeys.map(key => slotByKey[key]).filter(Boolean)
          if (!slots.length) return null
          return (
            <div key={rowIdx}>
              {/* Cards cap at 188px on wide screens (short rows stay centered,
                  not giant) but shrink to fit on narrow ones — so every row
                  fits the screen with no horizontal scroll on any size. */}
              <div className="grid gap-1.5 sm:gap-3 justify-center" style={{ gridTemplateColumns: `repeat(${slots.length}, minmax(0, 188px))` }}>
                {slots.map(slot => (
                  <PositionCol
                    key={slot.key}
                    slot={slot}
                    pid={teamData[slot.key] || null}
                    onSelect={onSelect}
                    eligible={eligibleBySlot[slot.key] || []}
                    pathPrefix={pathPrefix}
                    playerMap={playerMap}
                    placeholderImages={placeholderImages}
                    dynastyTeams={dynastyTeams}
                    isViewOnly={isViewOnly}
                    activeTeam={activeTeam}
                    allTimeTeam={allTimeTeam}
                    coachedTids={coachedTids}
                  />
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AllTimeLineup({ embedded = false }) {
  const { currentDynasty, updateDynasty, isViewOnly } = useDynasty()
  const pathPrefix = usePathPrefix()
  const { user } = useAuth()
  const [activeTeam, setActiveTeam] = useState('first')
  const [saving, setSaving] = useState(false)
  const [showLayoutEditor, setShowLayoutEditor] = useState(false)
  const [activeSection, setActiveSection] = useState('offense')
  const [confirmReset, setConfirmReset] = useState(false)

  // Optimistic local copy of the saved lineup. Mirrors how the depth chart
  // (TeamOutlook) keeps a draft: edits apply here instantly so the UI updates
  // without waiting on the persist round-trip, then re-sync whenever the saved
  // value actually changes (our own save landing, a cloud push, or a dynasty
  // switch). This is what fixes "had to refresh to see the change."
  const persistedAllTimeStr = useMemo(
    () => JSON.stringify(currentDynasty?.allTimeTeam || {}),
    [currentDynasty?.allTimeTeam]
  )
  const [allTimeTeam, setAllTimeTeam] = useState(() => currentDynasty?.allTimeTeam || {})
  useEffect(() => {
    setAllTimeTeam(currentDynasty?.allTimeTeam || {})
  }, [persistedAllTimeStr])

  if (!currentDynasty) return null

  const uid = user?.uid || currentDynasty.userId || ''
  const players = currentDynasty.players || []
  const dynastyTeams = currentDynasty.teams || {}
  const layout = readLayout(allTimeTeam)

  const coachedTids = useMemo(() => getAllCoachedTids(currentDynasty), [currentDynasty])

  const coachedTeamInfo = useMemo(() => (
    coachedTids.map(tid => ({
      tid,
      logo: getTeamLogoByTid(tid, dynastyTeams),
      colors: getColorsFromTid(dynastyTeams, tid),
    }))
  ), [coachedTids, dynastyTeams])

  const heroGradient = useMemo(() => {
    const primaries = coachedTeamInfo.map(t => t.colors.primary).filter(Boolean)
    if (!primaries.length) return 'var(--surface-1)'
    if (primaries.length === 1) {
      return `linear-gradient(120deg, ${hexA(primaries[0], 0.6)} 0%, ${hexA(primaries[0], 0.15)} 60%, transparent 100%), var(--surface-1)`
    }
    const stops = primaries.map((c, i) => `${hexA(c, 0.5)} ${Math.round((i / (primaries.length - 1)) * 100)}%`)
    return `linear-gradient(120deg, ${stops.join(', ')}), var(--surface-1)`
  }, [coachedTeamInfo])

  const heroBorderColor = coachedTeamInfo[0]?.colors.primary || '#374151'

  const placeholderImages = useMemo(() => {
    const counts = new Map()
    for (const p of players) {
      if (p.pictureUrl) counts.set(p.pictureUrl, (counts.get(p.pictureUrl) || 0) + 1)
    }
    return new Set([...counts].filter(([, n]) => n >= 3).map(([u]) => u))
  }, [players])

  const playerMap = useMemo(() => {
    const map = {}
    for (const p of players) if (p.pid) map[p.pid] = p
    return map
  }, [players])

  // Top 15 per slot, coached teams only
  const eligibleBySlot = useMemo(() => {
    const result = {}
    for (const slot of ALL_POSSIBLE_SLOTS) {
      result[slot.key] = playersForSlot(players, slot, coachedTids)
    }
    return result
  }, [players, coachedTids])

  // Is the active team in live "auto-fill by AV" mode?
  const autoAV = allTimeTeam.autoAV || {}
  const isAuto = !!autoAV[activeTeam]

  // Effective lineup per team. A team with auto-AV on is computed LIVE from
  // career AV (best eligible per slot, no dupes) so it stays current as
  // production changes; a manual team uses its saved picks. Manual picks are
  // reserved first so auto never steals them; teams fill in order (1st, 2nd).
  const effectiveTeams = useMemo(() => {
    const flags = allTimeTeam.autoAV || {}
    const lay = readLayout(allTimeTeam)
    const slotKeys = [...(lay.offense || []), ...(lay.defense || []), ...(lay.st || [])].flat()
    const used = new Set()
    for (const teamKey of ['first', 'second']) {
      if (!flags[teamKey]) for (const v of Object.values(allTimeTeam[teamKey] || {})) if (v) used.add(v)
    }
    const avCache = new Map()
    const avOf = (p) => {
      if (!avCache.has(p.pid)) avCache.set(p.pid, computeCareerAV(p))
      return avCache.get(p.pid)
    }
    const retCache = new Map()
    const retAvOf = (p, rt) => {
      const k = `${p.pid}:${rt}`
      if (!retCache.has(k)) retCache.set(k, getCareerReturnAV(p, rt))
      return retCache.get(k)
    }
    const out = {}
    for (const teamKey of ['first', 'second']) {
      if (!flags[teamKey]) { out[teamKey] = allTimeTeam[teamKey] || {}; continue }
      const filled = {}
      for (const key of slotKeys) {
        const slot = slotByKey[key]
        if (!slot) continue
        const pool = (eligibleBySlot[key] || []).filter(p => !used.has(p.pid))
        if (!pool.length) continue
        // KR / PR are ranked by that return type's AV only; everyone else by
        // overall career AV.
        const pick = slot.returnType
          ? pool.reduce((best, p) => (retAvOf(p, slot.returnType) > retAvOf(best, slot.returnType) ? p : best), pool[0])
          : pool.reduce((best, p) => (avOf(p) > avOf(best) ? p : best), pool[0])
        filled[key] = pick.pid
        used.add(pick.pid)
      }
      out[teamKey] = filled
    }
    return out
  }, [allTimeTeam, eligibleBySlot])

  // What the grid renders from: effective (live-AV or saved) picks for both teams.
  const displayAllTime = useMemo(() => ({ ...allTimeTeam, ...effectiveTeams }), [allTimeTeam, effectiveTeams])
  const teamData = displayAllTime[activeTeam] || {}

  // Single persistence path: optimistically update the local draft so the UI
  // reflects the change immediately, then persist in the background.
  const commit = async (updated) => {
    // Firestore rejects nested arrays — the rows-of-keys `layout` must never be
    // written raw. Carry it as a JSON string and strip the nested-array form so
    // EVERY save (picks, auto-fill, layout) is a clean, persistable write.
    const safe = { ...updated }
    if (safe.layout && !safe.layoutJSON) {
      try { safe.layoutJSON = JSON.stringify(safe.layout) } catch { /* drop it */ }
    }
    delete safe.layout
    setAllTimeTeam(safe)
    setSaving(true)
    try { await updateDynasty(currentDynasty.id, { allTimeTeam: safe }) }
    finally { setSaving(false) }
  }

  const handleSelect = (slotKey, pid) => {
    if (isViewOnly || isAuto || saving) return
    commit({ ...allTimeTeam, [activeTeam]: { ...(allTimeTeam[activeTeam] || {}), [slotKey]: pid || null } })
  }

  const handleReset = () => {
    if (isViewOnly || saving) return
    setConfirmReset(false)
    commit({ ...allTimeTeam, [activeTeam]: {} })
  }

  // Toggle live "auto-fill by AV" for the active team. When on, the lineup is
  // computed from AV on every render (above) and stays filled automatically;
  // saved manual picks are preserved underneath for when it's switched off.
  const toggleAutoAV = () => {
    if (isViewOnly || saving) return
    commit({ ...allTimeTeam, autoAV: { ...(allTimeTeam.autoAV || {}), [activeTeam]: !isAuto } })
  }

  const handleSaveLayout = (newLayout) => {
    if (isViewOnly || saving) return
    setShowLayoutEditor(false)
    commit({ ...allTimeTeam, layoutJSON: JSON.stringify(newLayout) })
  }

  const sharedProps = {
    teamData, onSelect: handleSelect, eligibleBySlot,
    pathPrefix, playerMap, placeholderImages, dynastyTeams,
    // Auto mode is read-only per slot (no Change dropdowns).
    isViewOnly: isViewOnly || isAuto,
    activeTeam, allTimeTeam: displayAllTime, coachedTids,
  }

  return (
    <div className="space-y-6">
      {/* Hero — skipped when embedded (the Leaderboards tab supplies its own page header). */}
      {!embedded && (
      <section
        className="card overflow-hidden relative reveal"
        style={{ background: heroGradient, borderTop: `3px solid ${heroBorderColor}` }}
      >
        {coachedTeamInfo[0]?.logo && (
          <div className="absolute right-0 top-0 bottom-0 flex items-center pointer-events-none" style={{ opacity: 0.1, padding: '0 12px' }}>
            <img src={coachedTeamInfo[0].logo} alt="" style={{ width: '180px', height: '180px', objectFit: 'contain' }} />
          </div>
        )}
        <div className="relative px-6 py-5 sm:px-8 sm:py-6">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="label-sm mb-1.5 text-txt-tertiary">Dynasty</div>
              <h1 className="font-display font-black leading-none uppercase break-words text-txt-primary" style={{ fontSize: 'clamp(28px,5vw,48px)', letterSpacing: '-0.02em' }}>
                All-Time Team
              </h1>
            </div>
            <div className="flex-shrink-0 flex items-center gap-3">
              {coachedTeamInfo.map(({ tid, logo, colors }) => logo ? (
                <div key={tid} className="flex items-center justify-center rounded-full p-1" style={{ backgroundColor: hexA(colors.primary, 0.25), border: `2px solid ${hexA(colors.primary, 0.5)}` }}>
                  <img src={logo} alt="" style={{ width: '52px', height: '52px', objectFit: 'contain', filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.5))' }} />
                </div>
              ) : null)}
            </div>
          </div>
        </div>
      </section>
      )}

      <div className="space-y-2">
      {/* Team tabs (1st / 2nd) + controls — docked-tab style, reads as an
          extension of the leaderboard header tabs. */}
      <div className="flex items-end justify-between gap-3 flex-wrap border-b pl-3 sm:pl-5" style={{ borderColor: 'var(--surface-4)' }}>
        <DockedTabs
          tabs={[{ key: 'first', label: '1st Team' }, { key: 'second', label: '2nd Team' }]}
          active={activeTeam}
          onChange={(k) => { setActiveTeam(k); setConfirmReset(false) }}
        />
        {!isViewOnly && (
          <div className="flex items-center gap-2 pb-2">
            {confirmReset ? (
              <>
                <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  Clear {activeTeam === 'first' ? '1st' : '2nd'} Team?
                </span>
                <button
                  onClick={handleReset}
                  disabled={saving}
                  className="px-3 py-1.5 rounded-md text-sm font-medium"
                  style={{ backgroundColor: '#dc2626', color: 'white', border: 'none' }}
                >
                  Yes, clear
                </button>
                <button
                  onClick={() => setConfirmReset(false)}
                  className="px-3 py-1.5 rounded-md text-sm font-medium"
                  style={{ border: '1px solid var(--surface-4)', color: 'var(--text-secondary)' }}
                >
                  Cancel
                </button>
              </>
            ) : (
              <>
                {/* Live toggle — when checked, this team stays auto-filled by AV */}
                <button
                  onClick={toggleAutoAV}
                  disabled={saving}
                  className="flex items-center gap-1 sm:gap-2 px-1.5 sm:px-3 py-0.5 sm:py-1.5 rounded-md text-[10px] sm:text-sm font-medium transition-colors disabled:opacity-50 hover:bg-surface-3"
                  style={{ backgroundColor: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--surface-4)' }}
                  title="Keep this team automatically filled with the best players by Approximate Value (updates live)"
                >
                  <span
                    className="flex items-center justify-center rounded-sm flex-shrink-0 w-3 h-3 sm:w-[15px] sm:h-[15px]"
                    style={{ border: `1.5px solid ${isAuto ? 'var(--text-secondary)' : 'var(--surface-5)'}`, backgroundColor: isAuto ? 'var(--text-secondary)' : 'transparent' }}
                  >
                    {isAuto && (
                      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="var(--surface-1)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </span>
                  Auto-fill by AV
                </button>
                {!isAuto && (
                  <button
                    onClick={() => setConfirmReset(true)}
                    className="px-1.5 sm:px-3 py-0.5 sm:py-1.5 rounded-md text-[10px] sm:text-sm font-medium transition-colors"
                    style={{ border: '1px solid var(--surface-4)', color: 'var(--text-secondary)' }}
                  >
                    Reset Team
                  </button>
                )}
                <button
                  onClick={() => setShowLayoutEditor(true)}
                  className="px-1.5 sm:px-3 py-0.5 sm:py-1.5 rounded-md text-[10px] sm:text-sm font-medium transition-colors"
                  style={{ border: '1px solid var(--surface-4)', color: 'var(--text-secondary)' }}
                >
                  Positions
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Section tabs (Offense / Defense / Special Teams) */}
      <div className="border-b pl-3 sm:pl-5" style={{ borderColor: 'var(--surface-4)' }}>
        <DockedTabs
          tabs={[
            { key: 'offense', label: 'Offense' },
            { key: 'defense', label: 'Defense' },
            { key: 'st', label: 'Special Teams' },
          ]}
          active={activeSection}
          onChange={setActiveSection}
        />
      </div>
      </div>

      {/* Cards render straight onto the page background — no surface box. */}
      <div className="pt-2">
        <SectionGrid
          rows={layout[activeSection] || DEFAULT_LAYOUT[activeSection]}
          hideTitle
          {...sharedProps}
        />
      </div>

      {showLayoutEditor && (
        <LayoutEditorModal
          layout={layout}
          onSave={handleSaveLayout}
          onClose={() => setShowLayoutEditor(false)}
        />
      )}
    </div>
  )
}
