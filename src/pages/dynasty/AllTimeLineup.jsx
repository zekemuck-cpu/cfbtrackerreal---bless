import { useState, useMemo, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useDynasty } from '../../context/DynastyContext'
import { usePathPrefix } from '../../hooks/usePathPrefix'
import { useAuth } from '../../context/AuthContext'
import { Card, Tabs } from '../../components/ui'
import { normalizeAwardName } from '../../utils/playerHeal'
import { getTeamLogoByTid } from '../../data/teams'
import { getColorsFromTid, getTidFromAbbr } from '../../data/teamRegistry'
import { proxyImageUrl } from '../../utils/imageProxy'

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
    ['FS1', 'SS1'],
    ['CB1', 'OLB1', 'MLB1', 'OLB2', 'CB2'],
    ['EDGE1', 'DT1', 'DT2', 'EDGE2'],
  ],
  st: [['K1', 'P1']],
}

function getTileLabel(key) {
  const slot = slotByKey[key]
  if (!slot) return key
  if (slot.tileLabel) return slot.tileLabel
  const match = key.match(/^(.+?)(\d+)$/)
  if (!match) return slot.label
  return match[2] === '1' ? slot.label : slot.label + match[2]
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

function PlayerSelectOption({ player, isSelected, onSelect, placeholderImages, returnType }) {
  const photoUrl = player.pictureUrl && !placeholderImages.has(player.pictureUrl) ? player.pictureUrl : null
  const initial  = (player.name || '?').trim().charAt(0).toUpperCase()
  const awards           = returnType ? [] : getTop3Awards(player)
  const { stats, year } = returnType
    ? getBestReturnStats(player, returnType)
    : getBestSeasonStats(player)
  const [hovered, setHovered] = useState(false)

  return (
    <div
      onClick={onSelect}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="flex items-start gap-2.5 px-3 py-2 cursor-pointer"
      style={{
        borderBottom: '1px solid var(--surface-3)',
        backgroundColor: isSelected ? 'var(--surface-4)' : hovered ? 'var(--surface-2)' : 'transparent',
      }}
    >
      {/* Photo */}
      <div className="flex-shrink-0 w-9 h-12 rounded overflow-hidden" style={{ backgroundColor: 'var(--surface-4)' }}>
        {photoUrl ? (
          <img src={proxyImageUrl(photoUrl, 80)} alt="" className="w-full h-full object-cover object-top" />
        ) : (
          <div className="w-full h-full flex items-center justify-center font-black" style={{ fontSize: '16px', color: 'var(--text-secondary)' }}>
            {initial}
          </div>
        )}
      </div>
      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="font-bold text-txt-primary leading-tight" style={{ fontSize: '13px' }}>{player.name}</span>
          <span className="font-black rounded px-1 py-0.5" style={{ fontSize: '9px', backgroundColor: 'var(--surface-4)', color: 'var(--text-secondary)', letterSpacing: '0.5px' }}>
            {player.position}
          </span>
          <span className="font-black" style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}>{player._peakOvr} OVR</span>
        </div>
        {awards.length > 0 && (
          <div className="truncate mt-0.5" style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}>
            {awards.join(' · ')}
          </div>
        )}
        {stats.length > 0 && (
          <div className="truncate mt-0.5 flex items-center gap-1.5" style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>
            {year && (
              <span className="flex-shrink-0 font-bold" style={{ color: 'var(--text-tertiary)' }}>{year}</span>
            )}
            <span className="truncate">{stats.join(' · ')}</span>
          </div>
        )}
      </div>
    </div>
  )
}

function PlayerSelectDropdown({ slotKey, pid, onSelect, eligible, placeholderImages, isChange, returnType }) {
  const [open, setOpen] = useState(false)
  const [panelStyle, setPanelStyle] = useState({})
  const [hovered, setHovered] = useState(false)
  const [pressed, setPressed] = useState(false)
  const triggerRef = useRef(null)
  const panelRef   = useRef(null)

  useEffect(() => {
    if (!open) return
    function onDown(e) {
      if (
        triggerRef.current && !triggerRef.current.contains(e.target) &&
        panelRef.current   && !panelRef.current.contains(e.target)
      ) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  // Re-anchor the panel to the trigger whenever the page scrolls
  useEffect(() => {
    if (!open) return
    let raf = null
    function reposition() {
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = null
        if (!triggerRef.current) return
        const rect = triggerRef.current.getBoundingClientRect()
        const availableH = window.innerHeight - rect.bottom - 16
        setPanelStyle(prev => ({
          ...prev,
          left: Math.max(4, Math.min(rect.left, window.innerWidth - 300)),
          top: rect.bottom + 4,
          maxHeight: Math.max(200, availableH),
        }))
      })
    }
    // capture:true catches scroll on any ancestor, not just window
    window.addEventListener('scroll', reposition, { capture: true, passive: true })
    return () => {
      window.removeEventListener('scroll', reposition, { capture: true })
      if (raf) cancelAnimationFrame(raf)
    }
  }, [open])

  function handleOpen() {
    if (!triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    const availableH = window.innerHeight - rect.bottom - 16
    setPanelStyle({
      position: 'fixed',
      left: Math.max(4, Math.min(rect.left, window.innerWidth - 300)),
      top: rect.bottom + 4,
      width: Math.max(rect.width, 296),
      maxHeight: Math.max(200, availableH),
      zIndex: 10000,
    })
    setOpen(v => !v)
  }

  return (
    <>
      <button
        ref={triggerRef}
        onClick={handleOpen}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => { setHovered(false); setPressed(false) }}
        onMouseDown={() => setPressed(true)}
        onMouseUp={() => setPressed(false)}
        className="w-full rounded px-2 py-1 text-left"
        style={{
          fontSize: '10px',
          backgroundColor: pressed
            ? 'var(--surface-5)'
            : open || hovered
              ? 'var(--surface-4)'
              : 'var(--surface-3)',
          border: `1px solid ${open ? 'var(--text-primary)' : hovered ? 'var(--surface-6, var(--surface-5))' : 'var(--surface-5)'}`,
          color: open || hovered ? 'var(--text-primary)' : 'var(--text-secondary)',
          cursor: 'pointer',
          transform: pressed ? 'scale(0.97)' : 'scale(1)',
          transition: 'background-color 0.1s, border-color 0.1s, color 0.1s, transform 0.08s',
          fontWeight: open ? 600 : 400,
        }}
      >
        <span className="flex items-center justify-between gap-1">
          <span>{isChange ? 'Change' : 'Select Player'}</span>
          <svg
            width="8" height="8" viewBox="0 0 8 8" fill="none"
            style={{ flexShrink: 0, transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}
          >
            <path d="M1 2.5L4 5.5L7 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </button>

      {open && (
        <div
          ref={panelRef}
          className="rounded-lg shadow-2xl"
          style={{ ...panelStyle, backgroundColor: 'var(--surface-1)', border: '1px solid var(--surface-4)', overflowY: 'auto' }}
          onWheel={e => e.stopPropagation()}
          onTouchMove={e => e.stopPropagation()}
        >
          {pid && (
            <button
              onClick={() => { onSelect(slotKey, null); setOpen(false) }}
              className="w-full px-3 py-2 text-left transition-colors"
              style={{ fontSize: '12px', color: 'var(--text-secondary)', borderBottom: '1px solid var(--surface-3)' }}
              onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--surface-2)'}
              onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              Clear player
            </button>
          )}
          {eligible.length === 0 ? (
            <div className="px-3 py-3 italic" style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
              No eligible players from coached teams
            </div>
          ) : eligible.map(p => (
            <PlayerSelectOption
              key={p.pid}
              player={p}
              isSelected={p.pid === pid}
              onSelect={() => { onSelect(slotKey, p.pid); setOpen(false) }}
              placeholderImages={placeholderImages}
              returnType={returnType}
            />
          ))}
        </div>
      )}
    </>
  )
}

// ─── Panel ceiling background ─────────────────────────────────────────────────

// Recessed can-light positions (x/y as 0-100 viewBox units)
const PANEL_LIGHTS = [
  { x:  7, y:  8, s: 1.0  },
  { x: 20, y:  6, s: 0.88 },
  { x: 34, y:  9, s: 1.1  },
  { x: 48, y:  6, s: 0.95 },
  { x: 61, y:  9, s: 1.05 },
  { x: 75, y:  6, s: 0.85 },
  { x: 89, y:  8, s: 0.9  },
  { x: 13, y: 22, s: 0.72 },
  { x: 27, y: 24, s: 0.78 },
  { x: 41, y: 21, s: 0.68 },
  { x: 55, y: 24, s: 0.75 },
  { x: 68, y: 21, s: 0.7  },
  { x: 82, y: 23, s: 0.65 },
]

// Absolute-fill overlay — place inside a `position: relative overflow-hidden` parent
function CeilingLights({ team = 'first' }) {
  const isGold   = team === 'first'
  // Panel stripe: subtle horizontal slat lines
  const panelBg  = isGold
    ? 'repeating-linear-gradient(180deg,#1e1a10 0px,#1e1a10 26px,#161308 26px,#161308 28px)'
    : 'repeating-linear-gradient(180deg,#14161e 0px,#14161e 26px,#0e1018 26px,#0e1018 28px)'
  // Glow color per team
  const bloom    = isGold ? [210, 155, 25]  : [175, 185, 210]
  const coreClr  = isGold ? '#f0d060'       : '#dde2f5'
  const fid      = `pl-${team}`

  const gc = (a) => `rgba(${bloom[0]},${bloom[1]},${bloom[2]},${a.toFixed(2)})`

  return (
    <div style={{
      position: 'absolute', inset: 0,
      background: panelBg,
      opacity: 0.38,
      pointerEvents: 'none',
      zIndex: 0,
      overflow: 'hidden',
    }}>
      {/* SVG lights — viewBox 0-100 so x/y positions are already percentages */}
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="xMidYMin slice"
        width="100%" height="100%"
        style={{ position: 'absolute', inset: 0 }}
      >
        <defs>
          <filter id={`${fid}-bloom`} x="-300%" y="-300%" width="700%" height="700%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="4.5"/>
          </filter>
          <filter id={`${fid}-mid`} x="-150%" y="-150%" width="400%" height="400%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="1.8" result="b"/>
            <feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>

        {PANEL_LIGHTS.map((l, i) => (
          <g key={i}>
            {/* Outer ambient bloom */}
            <circle cx={l.x} cy={l.y} r={7 * l.s}
              fill={gc(0.28 * l.s)} filter={`url(#${fid}-bloom)`} />
            {/* Mid glow halo */}
            <circle cx={l.x} cy={l.y} r={2.2 * l.s}
              fill={gc(0.7 * l.s)} filter={`url(#${fid}-mid)`} />
            {/* Bright core (the bulb) */}
            <circle cx={l.x} cy={l.y} r={0.55 * l.s} fill={coreClr} />
            {/* Housing ring — recessed trim */}
            <circle cx={l.x} cy={l.y} r={0.9 * l.s}
              fill="none" stroke="rgba(90,85,75,0.7)" strokeWidth="0.18" />
          </g>
        ))}
      </svg>
    </div>
  )
}

// ─── Position column ──────────────────────────────────────────────────────────

const PRESTIGE_STYLES = {
  first: {
    border:    '#c8972a',
    lineColor: '#d4a030',
    boxShadow: [
      'inset 0 1px 0 rgba(255,235,120,0.22)',
      '0 0 0 1px rgba(175,125,18,0.75)',
      '0 0 10px 3px rgba(218,162,22,0.9)',
      '0 0 24px 8px rgba(188,132,8,0.65)',
      '0 0 52px 16px rgba(158,105,0,0.42)',
      '0 0 90px 30px rgba(120,78,0,0.22)',
    ].join(', '),
    cardBg: (primary) => [
      // Strong overhead spotlight beam
      'radial-gradient(ellipse 115% 80% at 50% -18%, rgba(255,210,55,0.42) 0%, rgba(205,155,12,0.18) 38%, transparent 65%)',
      // Secondary fill light mid-card
      'radial-gradient(ellipse 75% 55% at 50% 35%, rgba(195,145,10,0.1) 0%, transparent 72%)',
      // Floor glow at bottom
      'radial-gradient(ellipse 55% 18% at 50% 118%, rgba(185,132,8,0.22) 0%, transparent 100%)',
      `linear-gradient(180deg, ${hexA(primary, 0.22)} 0%, ${hexA(primary, 0.06)} 100%)`,
      '#050402',
    ].join(', '),
    // Overlay applied on top of the player photo
    photoSpotlight: [
      'radial-gradient(ellipse 100% 75% at 50% -10%, rgba(255,220,70,0.32) 0%, rgba(200,148,15,0.1) 45%, transparent 70%)',
      'linear-gradient(0deg, rgba(0,0,0,0.55) 0%, transparent 22%)',
    ].join(', '),
    awardColor: '#ffd740',
  },
  second: {
    border:    '#a8aaae',
    lineColor: '#b8babe',
    boxShadow: [
      'inset 0 1px 0 rgba(255,255,255,0.18)',
      '0 0 0 1px rgba(148,152,165,0.75)',
      '0 0 10px 3px rgba(192,196,212,0.88)',
      '0 0 24px 8px rgba(162,166,182,0.62)',
      '0 0 52px 16px rgba(130,134,148,0.38)',
      '0 0 90px 30px rgba(98,102,115,0.2)',
    ].join(', '),
    cardBg: (primary) => [
      'radial-gradient(ellipse 115% 80% at 50% -18%, rgba(225,230,248,0.38) 0%, rgba(178,183,205,0.15) 38%, transparent 65%)',
      'radial-gradient(ellipse 75% 55% at 50% 35%, rgba(168,172,192,0.08) 0%, transparent 72%)',
      'radial-gradient(ellipse 55% 18% at 50% 118%, rgba(158,163,185,0.2) 0%, transparent 100%)',
      `linear-gradient(180deg, ${hexA(primary, 0.18)} 0%, ${hexA(primary, 0.05)} 100%)`,
      '#060708',
    ].join(', '),
    photoSpotlight: [
      'radial-gradient(ellipse 100% 75% at 50% -10%, rgba(215,220,245,0.28) 0%, rgba(170,175,200,0.08) 45%, transparent 70%)',
      'linear-gradient(0deg, rgba(0,0,0,0.55) 0%, transparent 22%)',
    ].join(', '),
    awardColor: '#e8eaed',
  },
}

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
  const { stats, year } = player
    ? (returnType ? getBestReturnStats(player, returnType) : getBestSeasonStats(player))
    : { stats: [], year: null }

  const prestige = PRESTIGE_STYLES[activeTeam] || PRESTIGE_STYLES.first

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
    <div className="flex flex-col min-w-0" style={{ minWidth: '130px' }}>
      {/* Position label with prestige-colored glow line */}
      <div className="mb-1.5">
        <span className="font-black" style={{ fontSize: '11px', letterSpacing: '2.5px', color: prestige.lineColor, textShadow: `0 0 8px ${hexA(prestige.border, 0.5)}` }}>
          {slot.tileLabel || slot.label}
        </span>
      </div>
      <div style={{
        height: '1px',
        background: `linear-gradient(90deg, transparent 0%, ${prestige.lineColor} 25%, ${prestige.lineColor} 75%, transparent 100%)`,
        boxShadow: `0 0 5px ${hexA(prestige.border, 0.55)}`,
        marginBottom: '8px',
      }} />

      {player ? (
        <div
          className="rounded flex flex-col"
          style={{
            background: prestige.cardBg(primary),
            border: `2px solid ${prestige.border}`,
            boxShadow: prestige.boxShadow,
            overflow: 'hidden',
            position: 'relative',
          }}
        >
          {/* Portrait photo — full width, dramatically lit */}
          <div style={{ position: 'relative', height: '105px', overflow: 'hidden', flexShrink: 0 }}>
            {photoUrl ? (
              <img
                src={proxyImageUrl(photoUrl, 300)} alt=""
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: '50% 22%' }}
              />
            ) : (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: hexA(primary, 0.22) }}>
                <span style={{ fontSize: '46px', fontWeight: 900, color: hexA(secondary, 0.88), textShadow: `0 2px 12px rgba(0,0,0,0.7)` }}>{initial}</span>
              </div>
            )}
            {/* Dramatic spotlight + bottom nameplate fade */}
            <div style={{ position: 'absolute', inset: 0, background: prestige.photoSpotlight, pointerEvents: 'none' }} />
            {/* OVR badge — top right */}
            <div style={{
              position: 'absolute', top: '6px', right: '6px',
              background: 'rgba(0,0,0,0.72)',
              border: `1px solid ${hexA(prestige.border, 0.75)}`,
              borderRadius: '3px',
              padding: '1px 5px',
              fontSize: '11px', fontWeight: 900,
              color: prestige.awardColor,
              letterSpacing: '0.3px',
              boxShadow: `0 0 6px ${hexA(prestige.border, 0.4)}`,
            }}>
              {peakOvr}
            </div>
            {/* Team logo — bottom left */}
            {teamLogo && (
              <img src={teamLogo} alt="" style={{
                position: 'absolute', bottom: '7px', left: '7px',
                width: '18px', height: '18px', objectFit: 'contain',
                filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.9))',
              }} />
            )}
          </div>

          {/* Nameplate */}
          <div style={{ padding: '6px 8px 5px', background: 'rgba(0,0,0,0.55)' }}>
            <Link
              to={`${pathPrefix}/player/${player.pid}`}
              className="font-bold hover:underline leading-tight"
              style={{ fontSize: '11.5px', color: '#fff', display: 'block', lineHeight: '1.3', marginBottom: '3px' }}
            >
              {player.name}
            </Link>
            {awards.length > 0 && (
              <div style={{ fontSize: '9px', color: prestige.awardColor, fontWeight: 700, lineHeight: '1.4' }}>
                {awards.map((a, i) => <div key={i} className="truncate">{a}</div>)}
              </div>
            )}
            {stats.length > 0 && (
              <div style={{ fontSize: '9px', color: 'rgba(195,195,195,0.55)', lineHeight: '1.3', marginTop: '2px' }}>
                {year && <span style={{ color: 'rgba(195,195,195,0.35)', marginRight: '3px' }}>{year}</span>}
                {stats.join(' · ')}
              </div>
            )}
          </div>

          {!isViewOnly && (
            <div style={{ borderTop: `1px solid ${hexA(prestige.border, 0.22)}`, padding: '4px 6px' }}>
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
      ) : (
        <div
          className="rounded flex flex-col items-center justify-center py-3 px-2 gap-2"
          style={{
            background: 'rgba(0,0,0,0.35)',
            border: `1px dashed ${hexA(prestige.border, 0.3)}`,
            minHeight: '105px',
          }}
        >
          <span className="italic" style={{ fontSize: '11px', color: hexA(prestige.border, 0.4) }}>—</span>
          {!isViewOnly && (
            <PlayerSelectDropdown
              slotKey={slot.key}
              pid={null}
              onSelect={onSelect}
              eligible={filteredEligible}
              placeholderImages={placeholderImages}
              returnType={returnType}
            />
          )}
        </div>
      )}
    </div>
  )
}

// ─── Section grid ─────────────────────────────────────────────────────────────

function SectionGrid({ title, rows, teamData, onSelect, eligibleBySlot, pathPrefix, playerMap, placeholderImages, dynastyTeams, isViewOnly, activeTeam, allTimeTeam, coachedTids }) {
  const prestige = PRESTIGE_STYLES[activeTeam] || PRESTIGE_STYLES.first
  return (
    <div>
      <div className="flex items-center gap-4 mb-5">
        <div style={{ flex: 1, height: '1px', background: `linear-gradient(90deg, transparent, ${hexA(prestige.border, 0.5)})` }} />
        <span className="font-black" style={{
          fontSize: '12px', letterSpacing: '3.5px',
          color: prestige.awardColor,
          textShadow: `0 0 12px ${hexA(prestige.border, 0.65)}, 0 0 24px ${hexA(prestige.border, 0.3)}`,
        }}>
          {title.toUpperCase()}
        </span>
        <div style={{ flex: 1, height: '1px', background: `linear-gradient(90deg, ${hexA(prestige.border, 0.5)}, transparent)` }} />
      </div>
      <div className="space-y-6">
        {rows.map((rowKeys, rowIdx) => {
          const slots = rowKeys.map(key => slotByKey[key]).filter(Boolean)
          if (!slots.length) return null
          return (
            <div key={rowIdx} className="overflow-x-auto">
              <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${slots.length}, minmax(120px, 1fr))` }}>
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

export default function AllTimeLineup() {
  const { currentDynasty, updateDynasty, isViewOnly } = useDynasty()
  const pathPrefix = usePathPrefix()
  const { user } = useAuth()
  const [activeTeam, setActiveTeam] = useState('first')
  const [saving, setSaving] = useState(false)
  const [showLayoutEditor, setShowLayoutEditor] = useState(false)

  if (!currentDynasty) return null

  const uid = user?.uid || currentDynasty.userId || ''
  const players = currentDynasty.players || []
  const dynastyTeams = currentDynasty.teams || {}
  const allTimeTeam = currentDynasty.allTimeTeam || {}
  const teamData = allTimeTeam[activeTeam] || {}
  const layout = allTimeTeam.layout || DEFAULT_LAYOUT

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

  const handleSelect = async (slotKey, pid) => {
    if (isViewOnly || saving) return
    const updated = { ...allTimeTeam, [activeTeam]: { ...teamData, [slotKey]: pid || null } }
    setSaving(true)
    try { await updateDynasty(currentDynasty.id, { allTimeTeam: updated }) }
    finally { setSaving(false) }
  }

  const [confirmReset, setConfirmReset] = useState(false)

  const handleReset = async () => {
    if (isViewOnly || saving) return
    const updated = { ...allTimeTeam, [activeTeam]: {} }
    setSaving(true)
    try { await updateDynasty(currentDynasty.id, { allTimeTeam: updated }) }
    finally { setSaving(false); setConfirmReset(false) }
  }

  const handleSaveLayout = async (newLayout) => {
    if (isViewOnly || saving) return
    const updated = { ...allTimeTeam, layout: newLayout }
    setSaving(true)
    try { await updateDynasty(currentDynasty.id, { allTimeTeam: updated }) }
    finally { setSaving(false) }
    setShowLayoutEditor(false)
  }

  const sharedProps = {
    teamData, onSelect: handleSelect, eligibleBySlot,
    pathPrefix, playerMap, placeholderImages, dynastyTeams, isViewOnly, activeTeam, allTimeTeam, coachedTids,
  }

  return (
    <div className="space-y-6">
      {/* Hero */}
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

      {/* Tabs + Positions button */}
      <div className="flex items-center justify-between gap-3">
        <Tabs
          variant="pill"
          value={activeTeam}
          onChange={v => { setActiveTeam(v); setConfirmReset(false) }}
          options={[
            { value: 'first',  label: '1st Team' },
            { value: 'second', label: '2nd Team' },
          ]}
        />
        {!isViewOnly && (
          <div className="flex items-center gap-2">
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
                <button
                  onClick={() => setConfirmReset(true)}
                  className="px-3 py-1.5 rounded-md text-sm font-medium transition-colors"
                  style={{ border: '1px solid var(--surface-4)', color: 'var(--text-secondary)' }}
                >
                  Reset Team
                </button>
                <button
                  onClick={() => setShowLayoutEditor(true)}
                  className="px-3 py-1.5 rounded-md text-sm font-medium transition-colors"
                  style={{ border: '1px solid var(--surface-4)', color: 'var(--text-secondary)' }}
                >
                  Positions
                </button>
              </>
            )}
          </div>
        )}
      </div>

      <Card className="relative overflow-hidden">
        <CeilingLights team={activeTeam} />
        <div className="space-y-8" style={{ position: 'relative', zIndex: 1 }}>
          <SectionGrid title="Offense"       rows={layout.offense || DEFAULT_LAYOUT.offense} {...sharedProps} />
          <SectionGrid title="Defense"       rows={layout.defense || DEFAULT_LAYOUT.defense} {...sharedProps} />
          <SectionGrid title="Special Teams" rows={layout.st      || DEFAULT_LAYOUT.st}      {...sharedProps} />
        </div>
      </Card>

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
