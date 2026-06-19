import { useState, useMemo, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { usePathPrefix } from '../../hooks/usePathPrefix'
import { useDynasty } from '../../context/DynastyContext'
import { useAuth } from '../../context/AuthContext'
import { getCoachNameForUid } from '../../data/leagueModel'
import { getMascotName } from '../../data/teams'
import { getTeamLogoRobust } from '../../utils/teamLogo'
import { ARCHETYPES, PACKAGES, PREMIUM, computeBudget } from '../../data/coachBuildData'

// ─── PACKAGE ICONS ───────────────────────────────────────────────────────────
// All paths use viewBox "0 0 24 24", stroke-based, no fill.

const ICON_PATHS = {
  // Position icons (shared across all archetypes)
  // QB: Football (pointed oval) with laces
  qb: 'M12 2 Q22 7 22 12 Q22 17 12 22 Q2 17 2 12 Q2 7 12 2 Z M12 2 L12 22 M9 9 L15 9 M9 12 L15 12 M9 15 L15 15',
  // RB: Shoe/cleat profile with spikes on sole
  rb: 'M3 16 Q3 10 8 8 L17 5 Q21 4 21 8 Q22 13 18 15 L11 17 Z M3 16 L3 19 L20 19 L20 15 M6 19 L6 22 M11 19 L11 22 M16 19 L16 22',
  // WR: Spider web — 6 radial spokes + 4 concentric arc rows
  wr: 'M12 12 L12 2 M12 12 L20.6 7 M12 12 L20.6 17 M12 12 L12 22 M12 12 L3.4 17 M12 12 L3.4 7 M9.4 4.5 Q12 3.5 14.6 4.5 M7.1 8.2 Q12 6 16.9 8.2 M4.8 13.5 Q12 10 19.2 13.5 M7.1 19 Q12 17 16.9 19',
  // OL: Bulldozer — rectangular cab body, front blade notch, two track wheels
  ol: 'M3 8 L3 17 L19 17 L22 14 L22 9 L19 7 L9 7 L9 4 L7 4 L7 7 L3 7 Z M3 12 L9 12 M6 17 A2 2 0 1 0 10 17 A2 2 0 1 0 6 17 M14 17 A2 2 0 1 0 18 17 A2 2 0 1 0 14 17',
  // DL: Bull head with curved horns, nostrils, and snout
  dl: 'M6 13 Q6 7 12 6 Q18 7 18 13 Q18 18 12 19 Q6 18 6 13 Z M6 13 Q4 10 3 6 M18 13 Q20 10 21 6 M9 12 A1 1 0 1 0 11 12 A1 1 0 1 0 9 12 M13 12 A1 1 0 1 0 15 12 A1 1 0 1 0 13 12 M10 16 Q12 18 14 16',
  // LB: Human figure in wide defensive stance, arms spread
  lb: 'M12 1 A2.5 2.5 0 1 0 12 6 A2.5 2.5 0 1 0 12 1 M10 6.5 L4 10 L2 10 M14 6.5 L20 10 L22 10 M10 6.5 L14 6.5 M12 6.5 L12 16 M12 16 L9 22 M12 16 L15 22',
  // DB: Prohibition / no-entry circle with diagonal slash
  db: 'M12 2 A10 10 0 1 0 12 22 A10 10 0 1 0 12 2 M19.1 4.9 L4.9 19.1',
  // KP: Football goalpost — vertical stem + crossbar + two uprights
  kp: 'M12 22 L12 13 M7 13 L17 13 M7 13 L7 4 M17 13 L17 4',
  // CT: Two curved arrows forming a rotation cycle (crosstraining)
  ct: 'M17 4 Q22 5 22 12 Q22 18 17 20 M17 20 L13 18.5 M17 20 L16 16 M7 20 Q2 19 2 12 Q2 6 7 4 M7 4 L11 5.5 M7 4 L8 8',
  // Scheme Guru icons
  // sg_fto: Radiator/pipe grid — 4 vertical bars + top/bottom/mid rails
  sg_fto: 'M5 3 L5 21 M10 3 L10 21 M15 3 L15 21 M20 3 L20 21 M5 3 L20 3 M5 21 L20 21 M5 9 L20 9 M5 15 L20 15',
  // sg_pgo: Football with satellite signal arcs
  sg_pgo: 'M3 13 Q12 2 21 13 Q12 24 3 13 Z M10 8 L13 8 M21 13 Q23 9 23 5 M23 5 L20 5 M23 5 L23 8 M21 13 Q24 11 24 8',
  // sg_gpo: Two figures grappling — heads, bodies, arms locked
  sg_gpo: 'M7 1 A2 2 0 1 0 7 5 A2 2 0 1 0 7 1 M17 1 A2 2 0 1 0 17 5 A2 2 0 1 0 17 1 M5 7 L5 12 M5 9 L9 9 L12 7 L15 9 L19 7 M19 7 L19 12 M5 12 L4 18 M5 12 L7 18 M19 12 L18 18 M19 12 L21 18',
  // sg_disco: Person in wide stance with motion lines (Disruptor Offense)
  sg_disco: 'M12 2 A2.5 2.5 0 1 0 12 7 A2.5 2.5 0 1 0 12 2 M12 7 L12 16 M7 10 L17 10 M12 16 L8 22 M12 16 L16 22 M3 6 Q1 8 2 10 M21 6 Q23 8 22 10',
  // sg_ftd: Gas/oxygen canister — cylinder body, top cap, valve nub, two bands
  sg_ftd: 'M7 8 L7 21 Q7 23 12 23 Q17 23 17 21 L17 8 Q17 5 12 5 Q7 5 7 8 Z M7 8 Q7 4 12 4 Q17 4 17 8 M11 3 L11 1 L13 1 L13 3 M9 13 L15 13 M9 17 L15 17',
  // sg_pgd: Two bowling-pin figures side by side
  sg_pgd: 'M8 2 A2.5 2.5 0 1 0 8 7 A2.5 2.5 0 1 0 8 2 M7.5 9 Q6 11 7 12 L6 20 Q6 22 8 22 Q10 22 10 20 L9 12 Q10 11 8.5 9 M16 2 A2.5 2.5 0 1 0 16 7 A2.5 2.5 0 1 0 16 2 M15.5 9 Q14 11 15 12 L14 20 Q14 22 16 22 Q18 22 18 20 L17 12 Q18 11 16.5 9',
  // sg_gpd: Energy can with lightning bolt inside
  sg_gpd: 'M7 4 L7 20 Q7 22 12 22 Q17 22 17 20 L17 4 Q17 2 12 2 Q7 2 7 4 Z M7 4 L17 4 M13 7 L10 13 L13 13 L10 20 L16 12 L13 12 Z',
  // sg_discd: Eagle — wide wings spread + tail + body lightning bolt
  sg_discd: 'M12 10 L2 5 L5 11 L1 13 L5 15 L2 21 L12 15 L22 21 L19 15 L23 13 L19 11 L22 5 Z M12 10 L12 22',

  // CEO icons
  // ceo_gg: Gainz Getter — NFL-style shield with star dots and center bar
  ceo_gg: 'M4 3 L20 3 L20 15 Q20 21 12 23 Q4 21 4 15 Z M6 9 L18 9 M8 6.5 A0.8 0.8 0 1 0 8 8.1 M12 6.5 A0.8 0.8 0 1 0 12 8.1 M16 6.5 A0.8 0.8 0 1 0 16 8.1 M8 13 Q12 17 16 13',
  // ceo_sck: Second Chance Keeper — hourglass with rotation arrow circling it
  ceo_sck: 'M8 3 L16 3 L12 11 L16 21 L8 21 L12 11 Z M7 3 L17 3 M7 21 L17 21 M20 11 Q20 5 14 3 M20 11 L17 9 M20 11 L18 14',
  // ceo_li: Lasting Impression — double right-facing chevrons >>
  ceo_li: 'M5 5 L13 12 L5 19 M11 5 L19 12 L11 19',
  // ceo_mtm: More The Merrier — flame / fire shape
  ceo_mtm: 'M12 3 Q14 7 17 8 Q21 9 21 14 Q21 21 12 22 Q3 21 3 14 Q3 8 7 7 Q8 11 12 12 Q10 7 12 3 Z M9 18 Q12 21 15 18',
  // ceo_gas: Gasoline — padlock with pen/key sticking out diagonally
  ceo_gas: 'M8 11 L8 20 L16 20 L16 11 Q16 8 12 8 Q8 8 8 11 Z M10 11 Q10 10 12 10 Q14 10 14 11 M12 14 L12 17 M17 18 L21 13 L19 11 L15 16',
  // ceo_ld: Last Dance — filled circle outline with bold checkmark inside
  ceo_ld: 'M12 2 A10 10 0 1 0 12 22 A10 10 0 1 0 12 2 M7 12 L10 16 L17 8',
  // ceo_ds: Dream School — person silhouette + 4 outward directional arrows
  ceo_ds: 'M12 5 A2.5 2.5 0 1 0 12 10 A2.5 2.5 0 1 0 12 5 M12 10 L12 16 M9 13 L15 13 M12 2 L10 4 L14 4 M12 22 L10 20 L14 20 M2 12 L4 10 L4 14 M22 12 L20 10 L20 14',
  // ceo_bd: Bundle Discount — diamond-grid net in a square
  ceo_bd: 'M4 4 L20 4 L20 20 L4 20 Z M4 12 L20 12 M12 4 L12 20 M4 4 L20 20 M20 4 L4 20 M8 4 L4 8 M4 16 L8 20 M16 4 L20 8 M20 16 L16 20',
  // ceo_ss: Senior Superlatives — price-tag shape with % inside
  ceo_ss: 'M5 2 L17 2 Q19 2 20 4 L20 14 L12 22 L4 14 L4 4 Q4 2 5 2 Z M12 2 L12 5 M8.5 9.5 A1.5 1.5 0 1 0 11.5 9.5 A1.5 1.5 0 1 0 8.5 9.5 M13.5 12 A1.5 1.5 0 1 0 16.5 12 A1.5 1.5 0 1 0 13.5 12 M9 14 L15 8',

  // Program Builder icons
  // pb_si: Stability Improvements — speedometer/gauge dial with needle
  pb_si: 'M4 18 Q4 10 12 7 Q20 10 20 18 M6 16 L8 14 M10 10 L11 13 M16 10 L15 13 M18 16 L16 14 M12 18 L15 11',
  // pb_stt: Set The Tone — aerial stadium view (concentric oval rings + crossbars)
  pb_stt: 'M12 2 A10 10 0 1 0 12 22 A10 10 0 1 0 12 2 M12 6 A6 6 0 1 0 12 18 A6 6 0 1 0 12 6 M12 10 A2 2 0 1 0 12 14 A2 2 0 1 0 12 10 M2 12 L6 12 M18 12 L22 12 M12 2 L12 6 M12 18 L12 22',
  // pb_rr: Roster Retention — warning triangle with exclamation mark
  pb_rr: 'M12 2 L22 20 L2 20 Z M12 8 L12 14 M11 17 A1 1 0 1 0 13 17 A1 1 0 1 0 11 17',
  // pb_hi: High Integrity — side head profile with speech/sound waves
  pb_hi: 'M9 4 Q8 2 12 2 Q16 2 15 6 Q14 9 11 9 Q7 9 8 6 Q8 4 9 4 Z M11 9 L9 14 Q8 17 10 18 L15 18 M17 15 L20 14 M17 17 L21 17 M17 19 L20 20',
  // pb_fp: Faster Progression — gear wheel with inner target + arrow
  pb_fp: 'M12 3 L14 5 L17 4 L18 7 L21 8 L20 11 L22 12 L20 13 L21 16 L18 17 L17 20 L14 19 L12 21 L10 19 L7 20 L6 17 L3 16 L4 13 L2 12 L4 11 L3 8 L6 7 L7 4 L10 5 Z M12 9 A3 3 0 1 0 12 15 A3 3 0 1 0 12 9 M17 7 L13 11',
  // pb_rb: Relationship Builder — calculator with $ on display
  pb_rb: 'M5 3 L19 3 L19 21 L5 21 Z M7 5 L17 5 L17 9 L7 9 Z M12 5 L12 9 M10 7 Q12 4.5 14 7 Q14 9 12 9 Q10 9 10 11 Q12 13.5 14 11 M8 13 L10 13 M13 13 L16 13 M8 16 L10 16 M8 19 L10 19 M13 16 L16 19',
  // pb_sr: Strong Roots — graduation mortarboard cap with circular medal/coin below
  pb_sr: 'M12 3 L21 8 L12 13 L3 8 Z M12 13 L12 16 M8 11 L8 15 Q8 18 12 18 Q16 18 16 15 L16 11 M21 8 L21 11 M22 9 L23 11 M9 18 A3 3 0 1 0 15 18 A3 3 0 1 0 9 18 M12 17 L12 19',

  // Visionary icons
  vis_pp: 'M12 3 L12 17 M7 8 L12 3 L17 8 M3 19 L21 19 M3 22 L21 22',
  vis_pmp: 'M12 2 A10 10 0 1 0 12 22 A10 10 0 1 0 12 2 M12 7 A5 5 0 1 0 12 17 A5 5 0 1 0 12 7 M12 11 A1 1 0 1 0 12 13 A1 1 0 1 0 12 11',
  vis_hs: 'M12 22 Q5 16 7 9 Q9 5 12 4 Q10 8 13 10 Q12 6 15 3 Q19 7 17 13 Q16 18 12 22 Z',
  vis_sb: 'M12 2 L12 22 M7 6 L16 6 Q19 6 19 9 Q19 12 12 12 Q5 12 5 16 Q5 20 8 20 L17 20',

  // Rainmaker icons
  rm_dm: 'M3 14 Q3 11 6 11 L10 10 L13 8 Q16 7 17 10 L20 8 Q23 8 22 11 L22 13 Q22 15 20 15 L16 15 L10 18 Q7 19 6 17 Z',
  rm_bb: 'M3 20 L21 20 M5 20 L5 14 L9 14 L9 20 M11 20 L11 10 L15 10 L15 20 M17 20 L17 6 L21 6 L21 20',
  rm_sp: 'M8 11 L8 7 A4 4 0 1 1 16 7 L16 11 M5 11 L19 11 Q21 11 21 13 L21 19 Q21 21 19 21 L5 21 Q3 21 3 19 L3 13 Q3 11 5 11 Z M12 15 L12 18',
  rm_ci: 'M4 3 L20 3 Q21 3 21 5 L21 19 Q21 21 19 21 L5 21 Q3 21 3 19 L3 5 Q3 3 4 3 Z M7 8 L17 8 M7 12 L17 12 M7 16 L12 16 M15 14 L17 16 L20 11',
}

// Renders an icon into an existing SVG (pass cx/cy as the center point)
function SvgIcon({ iconKey, cx, cy, size = 22, color }) {
  const d = ICON_PATHS[iconKey]
  if (!d) return null
  const s = size / 24
  return (
    <g transform={`translate(${cx - size / 2}, ${cy - size / 2}) scale(${s})`}>
      <path d={d} fill="none" stroke={color} strokeWidth={1.8 / s}
        strokeLinecap="round" strokeLinejoin="round" />
    </g>
  )
}

// Renders an icon as a standalone HTML SVG element
function InlineIcon({ iconKey, size = 22, color }) {
  const d = ICON_PATHS[iconKey]
  if (!d) return null
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none"
      stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  )
}

// ─── SVG WHEEL ───────────────────────────────────────────────────────────────

const SVG_W = 800
const SVG_H = 720
const CX = SVG_W / 2
const CY = SVG_H / 2 - 10
const RING_R = 170
const NODE_R = 40
const CENTER_R = 54

function packageNodePositions(count) {
  return Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * 2 * Math.PI - Math.PI / 2
    return {
      x: CX + RING_R * Math.cos(angle),
      y: CY + RING_R * Math.sin(angle),
    }
  })
}

function PackageWheel({ archetype, packages, purchased, selected, onSelect }) {
  const positions = packageNodePositions(packages.length)

  return (
    <svg viewBox={`0 0 ${SVG_W} ${SVG_H}`} width="100%" height="100%" style={{ overflow: 'visible' }}>
      {/* Lines from center to each package */}
      {positions.map((pos, i) => {
        const pkg = packages[i]
        const tiersOwned = pkg.tiers.filter((_, ti) => purchased.has(`${pkg.id}_${ti}`)).length
        const active = tiersOwned > 0
        return (
          <line
            key={pkg.id + '_line'}
            x1={CX} y1={CY}
            x2={pos.x} y2={pos.y}
            stroke={active ? archetype.color : '#2f313b'}
            strokeWidth={active ? 2.5 : 1.5}
            strokeOpacity={active ? 0.8 : 0.5}
          />
        )
      })}

      {/* Center archetype node */}
      <circle cx={CX} cy={CY} r={CENTER_R + 6} fill={archetype.glowColor} />
      <circle cx={CX} cy={CY} r={CENTER_R} fill="#191b22" stroke={archetype.color} strokeWidth={2.5} />
      <text x={CX} y={CY - 8} textAnchor="middle" fill={archetype.color}
        style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 13, letterSpacing: 1 }}>
        {archetype.name.toUpperCase()}
      </text>
      <text x={CX} y={CY + 8} textAnchor="middle" fill="#6e6e78"
        style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 10, letterSpacing: 1 }}>
        ARCHETYPE
      </text>

      {/* Package nodes */}
      {positions.map((pos, i) => {
        const pkg = packages[i]
        const tiersOwned = pkg.tiers.filter((_, ti) => purchased.has(`${pkg.id}_${ti}`)).length
        const total = pkg.tiers.length
        const isSelected = selected === pkg.id
        const active = tiersOwned > 0

        return (
          <g key={pkg.id} onClick={() => onSelect(pkg.id)} style={{ cursor: 'pointer' }}>
            {/* Glow ring when selected */}
            {isSelected && (
              <circle cx={pos.x} cy={pos.y} r={NODE_R + 7} fill={archetype.glowColor} />
            )}
            {/* Active pulse ring */}
            {active && !isSelected && (
              <circle cx={pos.x} cy={pos.y} r={NODE_R + 4} fill="none"
                stroke={archetype.color} strokeWidth={1} strokeOpacity={0.3} />
            )}
            {/* Main node circle */}
            <circle cx={pos.x} cy={pos.y} r={NODE_R}
              fill={active ? '#0f1e30' : '#191b22'}
              stroke={isSelected ? archetype.color : active ? archetype.color : '#2f313b'}
              strokeWidth={isSelected ? 2.5 : active ? 2 : 1.5}
              strokeOpacity={isSelected ? 1 : active ? 0.8 : 0.5}
            />
            {/* Package icon */}
            <SvgIcon
              iconKey={pkg.icon}
              cx={pos.x}
              cy={pos.y - 6}
              size={22}
              color={active ? archetype.color : isSelected ? archetype.color : '#4a4a52'}
            />
            {/* Tier count */}
            <text x={pos.x} y={pos.y + 17} textAnchor="middle"
              fill={active ? '#f5f5f7' : '#4a4a52'}
              style={{ fontSize: 10, fontWeight: 600, pointerEvents: 'none' }}>
              {tiersOwned}/{total}
            </text>
            {/* Package name below node */}
            <text x={pos.x} y={pos.y + NODE_R + 14} textAnchor="middle"
              fill={active ? '#a8a8b0' : '#4a4a52'}
              style={{ fontSize: 10, letterSpacing: 0.5, pointerEvents: 'none' }}>
              {pkg.name.toUpperCase()}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

// ─── ARCHETYPE SELECTION WHEEL ────────────────────────────────────────────────

function ArchetypeWheel({ onSelect, selected, starterArchId }) {
  const [hovered, setHovered] = useState(null)

  // Positions ordered by ARCHETYPES index — matches game's exact vertical diamond layout
  const positions = [
    { x: 100, y: 370 },  // 0: Recruiter        (far left, free)
    { x: 565, y: 255 },  // 1: Motivator         (upper-right, free)
    { x: 560, y: 500 },  // 2: Tactician         (lower-right, free)
    { x: 400, y:  65 },  // 3: CEO               (top center)
    { x: 400, y: 165 },  // 4: Program Builder   (upper center)
    { x: 235, y: 255 },  // 5: Talent Developer  (upper left)
    { x: 700, y: 370 },  // 6: Architect         (far right)
    { x: 240, y: 500 },  // 7: Strategist        (lower left)
    { x: 330, y: 605 },  // 8: Visionary         (lower center-left)
    { x: 470, y: 605 },  // 9: Rainmaker         (lower center-right)
  ]

  // Edges following the game's hex-grid connectivity
  const edges = [
    [3, 4],  // CEO → Program Builder
    [3, 1],  // CEO → Motivator
    [4, 5],  // Program Builder → Talent Developer
    [1, 6],  // Motivator → Architect
    [5, 0],  // Talent Developer → Recruiter
    [5, 7],  // Talent Developer → Strategist
    [6, 2],  // Architect → Tactician
    [0, 7],  // Recruiter → Strategist
    [7, 8],  // Strategist → Visionary
    [2, 9],  // Tactician → Rainmaker
    [8, 9],  // Visionary → Rainmaker
  ]

  return (
    <svg viewBox={`0 0 ${SVG_W} ${SVG_H}`} width="100%" height="100%" style={{ overflow: 'visible' }}>
      {/* Decorative center hexagon (matches game's large center hex piece) */}
      <polygon points="490,370 445,293 355,293 310,370 355,447 445,447"
        fill="#191b22" stroke="#f59e0b" strokeWidth={1.5} strokeOpacity={0.25} />
      <polygon points="460,370 423,306 377,306 340,370 377,434 423,434"
        fill="#0b0c11" stroke="#f59e0b" strokeWidth={1} strokeOpacity={0.15} />

      {/* Direct edges between connected archetypes */}
      {edges.map(([a, b], i) => {
        const pa = positions[a]
        const pb = positions[b]
        const isHovA = hovered === ARCHETYPES[a].id
        const isHovB = hovered === ARCHETYPES[b].id
        const highlight = isHovA || isHovB
        return (
          <line key={`edge_${i}`}
            x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y}
            stroke={highlight ? (isHovA ? ARCHETYPES[a].color : ARCHETYPES[b].color) : '#2f313b'}
            strokeWidth={highlight ? 2 : 1.5}
            strokeOpacity={highlight ? 0.7 : 0.4}
          />
        )
      })}

      {/* Archetype nodes */}
      {ARCHETYPES.map((arch, i) => {
        const pos = positions[i]
        const isHovered = hovered === arch.id
        const isSelected = selected === arch.id
        const highlight = isHovered || isSelected
        const isPremium = !!arch.unlockReqs
        const isFreeStarter = FREE_STARTERS.includes(arch.id)
        // Before ANY starter is chosen: highlight all 3 free starters
        const isPreSelection = isFreeStarter && !starterArchId
        // After a starter is chosen: the other 2 free starters become level-10 locked
        const isLevel10Locked = isFreeStarter && starterArchId && arch.id !== starterArchId

        const wheelLabel = isSelected ? 'SELECTED'
          : isPreSelection ? 'FREE STARTER'
          : isLevel10Locked ? 'UNLOCK 50 CP'
          : !isPremium ? 'FREE STARTER'
          : arch.unlockCost === 0 ? 'SPECIAL UNLOCK'
          : `UNLOCK ${arch.unlockCost} CP`

        // Free starters pulse with a brighter glow ring before selection
        const glowR = highlight ? 62 : isPreSelection ? 58 : 54
        const strokeW = isSelected ? 3.5 : isPreSelection ? 2.5 : highlight ? 3 : 2
        const strokeOpacity = (isPremium || isLevel10Locked) && !highlight ? 0.6 : 1
        const labelColor = isSelected ? arch.color : isPreSelection ? arch.color : '#6e6e78'

        return (
          <g key={arch.id}
            onClick={() => onSelect(arch.id)}
            onMouseEnter={() => setHovered(arch.id)}
            onMouseLeave={() => setHovered(null)}
            style={{ cursor: 'pointer' }}>
            {/* Extra pulse ring for un-chosen free starters */}
            {isPreSelection && (
              <circle cx={pos.x} cy={pos.y} r={64}
                fill="none" stroke={arch.color} strokeWidth={1} strokeOpacity={0.3}
                strokeDasharray="4 4" />
            )}
            {/* Outer glow */}
            <circle cx={pos.x} cy={pos.y} r={glowR} fill={arch.glowColor} />
            {/* Main circle */}
            <circle cx={pos.x} cy={pos.y} r={48}
              fill={highlight ? '#23252e' : '#191b22'}
              stroke={arch.color} strokeWidth={strokeW}
              strokeOpacity={strokeOpacity} />
            {/* Archetype name */}
            <text x={pos.x} y={pos.y - 4} textAnchor="middle"
              fill={arch.color}
              style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 15, letterSpacing: 2, pointerEvents: 'none' }}>
              {arch.name.toUpperCase()}
            </text>
            <text x={pos.x} y={pos.y + 12} textAnchor="middle"
              fill={labelColor}
              style={{ fontSize: 9, letterSpacing: 1, pointerEvents: 'none' }}>
              {wheelLabel}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

// ─── DETAIL PANEL ─────────────────────────────────────────────────────────────

function DetailPanel({ archetype, pkg, purchased, cpRemaining, cpSpentByArchId, starterArchId, checkedReqs, archReqsMet, onToggleTier, onSelectArchetype, onUnlockArchetype, onToggleReqCheck, onPreview, isElitePkg, isPreview }) {
  if (!archetype && !pkg) {
    return (
      <div style={styles.detailEmpty}>
        <div style={{ color: '#4a4a52', fontSize: 13, textAlign: 'center', lineHeight: 1.7 }}>
          Select an archetype<br />to begin building
        </div>
      </div>
    )
  }

  if (archetype && !pkg) {
    const isPremium = !!archetype.unlockReqs
    return (
      <div style={styles.detailPanel}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: archetype.color }} />
          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 20, letterSpacing: 3, color: archetype.color }}>
            {archetype.name.toUpperCase()}
          </div>
          {isPremium && (
            <span style={{ fontSize: 9, color: archetype.color, border: `1px solid ${archetype.color}`, borderRadius: 3, padding: '1px 5px', letterSpacing: 1 }}>
              PREMIUM
            </span>
          )}
        </div>
        {archetype.subtitle && (
          <div style={{ fontSize: 11, color: '#6e6e78', marginBottom: 12 }}>{archetype.subtitle}</div>
        )}
        <div style={styles.detailSection}>
          <div style={styles.detailLabel}>ARCHETYPE PERK</div>
          {archetype.perk ? (
            <>
              <div style={styles.detailPerkName}>{archetype.perk.name}</div>
              <div style={styles.detailPerkDesc}>{archetype.perk.desc}</div>
            </>
          ) : (
            <div style={styles.detailPerkDesc}>—</div>
          )}
        </div>
        <div style={{ height: 1, background: '#2f313b', margin: '14px 0' }} />
        {!isPremium && archetype.premiumName && (
          <>
            <div style={styles.detailSection}>
              <div style={styles.detailLabel}>PREMIUM UPGRADE</div>
              <div style={{ ...styles.detailPerkName, color: '#d97706' }}>{archetype.premiumName}</div>
              <div style={styles.detailPerkName}>{archetype.premiumPerk.name}</div>
              <div style={styles.detailPerkDesc}>{archetype.premiumPerk.desc}</div>
            </div>
            <div style={{ height: 1, background: '#2f313b', margin: '14px 0' }} />
          </>
        )}
        <div style={styles.detailSection}>
          <div style={styles.detailLabel}>UNLOCK REQUIREMENTS</div>
          {isPremium ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 6 }}>
              {archetype.unlockReqs.map((req, i) => {
                // Compute current progress for spend-based requirements
                let current = 0
                if (req.type === 'progress' && req.archId) {
                  if (req.archId.startsWith('__starter_')) {
                    // "Unlock X first" — check if that archetype is the chosen starter or unlocked
                    const targetId = req.archId.replace('__starter_', '')
                    current = (starterArchId === targetId || purchased?.has?.(`__unlock_${targetId}`)) ? 1 : 0
                  } else {
                    current = cpSpentByArchId?.[req.archId] ?? 0
                  }
                }
                const pct = req.total ? Math.min(100, (current / req.total) * 100) : (current ? 100 : 0)
                const met = req.total ? current >= req.total : current > 0

                const isChecked = req.type === 'checkbox' && checkedReqs?.has(`${archetype.id}::${req.label}`)
                return (
                  <div key={i}>
                    {req.type === 'checkbox' ? (
                      <div
                        style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none' }}
                        onClick={() => onToggleReqCheck?.(archetype.id, req.label)}
                      >
                        <div style={{
                          width: 13, height: 13,
                          border: `2px solid ${isChecked ? archetype.color : '#4a4a52'}`,
                          borderRadius: 3, background: isChecked ? archetype.color : '#0b0c11', flexShrink: 0,
                        }} />
                        <span style={{ fontSize: 11, color: isChecked ? archetype.color : '#6e6e78' }}>{req.label}</span>
                      </div>
                    ) : req.type === 'plain' ? (
                      <div style={{ fontSize: 11, color: '#6e6e78' }}>{req.label}</div>
                    ) : (
                      <>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                          <span style={{ fontSize: 11, color: met ? archetype.color : '#6e6e78' }}>{req.label}</span>
                          {req.total && (
                            <span style={{ fontSize: 10, color: met ? archetype.color : '#4a4a52' }}>
                              {Math.min(current, req.total)}/{req.total}
                            </span>
                          )}
                        </div>
                        <div style={{ height: 3, background: '#2f313b', borderRadius: 2 }}>
                          <div style={{ height: '100%', width: `${pct}%`, background: archetype.color, borderRadius: 2, opacity: met ? 1 : 0.6, transition: 'width 0.3s' }} />
                        </div>
                      </>
                    )}
                  </div>
                )
              })}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                <span style={{ fontSize: 11, color: '#f59e0b' }}>&#9679;</span>
                <span style={{ fontSize: 11, color: '#6e6e78' }}>Purchase Price: <strong style={{ color: archetype.color }}>{archetype.unlockCost > 0 ? `${archetype.unlockCost} CP` : 'Free'}</strong></span>
              </div>
            </div>
          ) : (
            <div style={styles.detailPerkDesc}>Choose this as your free starter archetype</div>
          )}
        </div>
        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {!archetype._isChosenStarter && (() => {
            const needsUnlock = isPremium || archetype._isLevel10Unlock
            const alreadyUnlocked = needsUnlock && purchased?.has?.(`__unlock_${archetype.id}`)
            const canEnter = !needsUnlock || archReqsMet
            const label = alreadyUnlocked
              ? 'UNLOCKED'
              : needsUnlock
              ? `UNLOCK ${archetype.name.toUpperCase()}`
              : `START AS ${archetype.name.toUpperCase()}`
            return (
              <>
                <button
                  disabled={alreadyUnlocked || (!canEnter)}
                  onClick={() => canEnter && !alreadyUnlocked ? (needsUnlock ? onUnlockArchetype?.(archetype.id) : onSelectArchetype(archetype.id)) : null}
                  style={{
                    ...styles.btnPrimary,
                    background: alreadyUnlocked ? '#0d2010' : canEnter ? archetype.color : '#23252e',
                    color: alreadyUnlocked ? '#22c55e' : canEnter ? '#fff' : '#4a4a52',
                    border: alreadyUnlocked ? '1px solid #16a34a' : canEnter ? 'none' : '1px solid #2f313b',
                    cursor: alreadyUnlocked ? 'default' : canEnter ? 'pointer' : 'not-allowed',
                    width: '100%',
                  }}
                >
                  {label}
                </button>
                {needsUnlock && !canEnter && !alreadyUnlocked && (
                  <div style={{ fontSize: 10, color: '#6e6e78', textAlign: 'center', letterSpacing: 0.5 }}>
                    Complete unlock requirements above
                  </div>
                )}
              </>
            )
          })()}
          {archetype._isChosenStarter ? (
            <button onClick={() => onSelectArchetype(archetype.id)} style={{
              ...styles.btnPrimary,
              background: archetype.color,
              width: '100%',
            }}>
              ENTER TREE
            </button>
          ) : onPreview && (() => {
            const isUnlocked = (isPremium || archetype._isLevel10Unlock) && purchased?.has?.(`__unlock_${archetype.id}`)
            return (
              <button
                onClick={() => isUnlocked ? onSelectArchetype(archetype.id) : onPreview(archetype.id)}
                style={{
                  ...styles.btnPrimary,
                  background: isUnlocked ? archetype.color : 'transparent',
                  border: isUnlocked ? 'none' : '1px solid #2f313b',
                  color: isUnlocked ? '#fff' : '#a8a8b0',
                  width: '100%',
                }}
              >
                {isUnlocked ? 'ENTER TREE' : 'PREVIEW TREE'}
              </button>
            )
          })()}
        </div>
      </div>
    )
  }

  if (pkg) {
    const tiersOwned = pkg.tiers.filter((_, ti) => purchased.has(`${pkg.id}_${ti}`)).length
    return (
      <div style={styles.detailPanel}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <div style={{
            background: '#23252e', borderRadius: 4, padding: '3px 8px',
            fontFamily: "'Bebas Neue', sans-serif", fontSize: 13, color: archetype.color, letterSpacing: 2,
          }}>
            {tiersOwned}/{pkg.tiers.length}
          </div>
          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 18, letterSpacing: 2, color: '#f5f5f7' }}>
            {pkg.name.toUpperCase()}
          </div>
        </div>
        <div style={{ fontSize: 11, color: '#6e6e78', marginBottom: 16 }}>
          {pkg.desc || `Purchase upgrades for your ${pkg.sub}`}
        </div>

        {(isElitePkg || isPreview) && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12,
            padding: '6px 10px', background: '#0b0c11', border: '1px solid #1e2d40', borderRadius: 5,
          }}>
            <span style={{ fontSize: 10, color: '#f59e0b' }}>&#128274;</span>
            <span style={{ fontSize: 10, color: '#6e6e78' }}>
              {isPreview
                ? `Start as ${archetype.name} to purchase these tiers`
                : `Unlock ${archetype.name} first to purchase these tiers`}
            </span>
          </div>
        )}

        {pkg.tiers.map((tier, ti) => {
          const key = `${pkg.id}_${ti}`
          const owned = purchased.has(key)
          const prevOwned = ti === 0 || purchased.has(`${pkg.id}_${ti - 1}`)
          const canAfford = cpRemaining >= tier.cp
          const canBuy = !isElitePkg && !isPreview && prevOwned && !owned && canAfford
          const locked = !prevOwned && !owned

          return (
            <div key={key} style={{
              ...styles.tierRow,
              opacity: locked ? 0.4 : isElitePkg && !owned ? 0.7 : 1,
              borderColor: owned ? archetype.color : '#2f313b',
              background: owned ? 'rgba(15,30,50,0.8)' : '#191b22',
            }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, color: '#6e6e78', letterSpacing: 1, marginBottom: 2 }}>
                  TIER {ti + 1}
                </div>
                <div style={{ fontSize: 12, fontWeight: 700, color: owned ? archetype.color : '#a8a8b0', marginBottom: 2 }}>
                  {tier.name}
                </div>
                <div style={{ fontSize: 11, color: '#6e6e78' }}>{tier.desc}</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                <div style={{ fontSize: 11, color: '#f59e0b', fontWeight: 700 }}>
                  {tier.cp} CP
                </div>
                {!locked && !isElitePkg && !isPreview && (
                  <button
                    onClick={() => onToggleTier(key, tier.cp)}
                    disabled={!owned && !canBuy}
                    style={{
                      ...styles.tierBtn,
                      background: owned ? '#23252e' : canBuy ? archetype.color : '#191b22',
                      color: owned ? '#a8a8b0' : canBuy ? '#fff' : '#4a4a52',
                      cursor: owned || canBuy ? 'pointer' : 'not-allowed',
                    }}
                  >
                    {owned ? 'Refund' : canAfford ? 'Buy' : 'Cost'}
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    )
  }
}

// ─── SUMMARY VIEW ─────────────────────────────────────────────────────────────

function SummaryView({ dynamicArchetype, purchased, totalCpSpent, budget }) {
  // Collect all purchased tiers across every archetype, grouped by archetype
  const groups = []
  let totalPerks = 0
  for (const arch of ARCHETYPES) {
    const pkgList = [...(PACKAGES[arch.id] || []), ...(PREMIUM[arch.id]?.packages || [])]
    const items = []
    for (const pkg of pkgList) {
      for (let ti = 0; ti < pkg.tiers.length; ti++) {
        if (purchased.has(`${pkg.id}_${ti}`)) {
          items.push({ pkg, tier: pkg.tiers[ti], ti })
          totalPerks++
        }
      }
    }
    if (items.length > 0) groups.push({ arch, items })
  }

  const cpRemaining = budget - totalCpSpent

  return (
    <div style={{ padding: '24px 32px', maxWidth: 700 }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, letterSpacing: 3, color: dynamicArchetype?.color || '#f59e0b', marginBottom: 4 }}>
          {dynamicArchetype ? dynamicArchetype.name.toUpperCase() : 'NO ARCHETYPE'}
        </div>
        <div style={{ fontSize: 12, color: '#6e6e78' }}>
          {dynamicArchetype?.perk ? `${dynamicArchetype.perk.name} — ${dynamicArchetype.perk.desc}` : '—'}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 24, marginBottom: 28 }}>
        <div style={styles.summaryStatBox}>
          <div style={styles.summaryStatVal}>{totalCpSpent}</div>
          <div style={styles.summaryStatLabel}>CP SPENT</div>
        </div>
        <div style={styles.summaryStatBox}>
          <div style={{ ...styles.summaryStatVal, color: cpRemaining < 0 ? '#ef4444' : '#22c55e' }}>{cpRemaining}</div>
          <div style={styles.summaryStatLabel}>CP REMAINING</div>
        </div>
        <div style={styles.summaryStatBox}>
          <div style={styles.summaryStatVal}>{totalPerks}</div>
          <div style={styles.summaryStatLabel}>PERKS OWNED</div>
        </div>
      </div>

      {groups.length === 0 ? (
        <div style={{ color: '#4a4a52', fontSize: 13 }}>No perks purchased yet.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {groups.map(({ arch, items }) => {
            const treeTotal = items.reduce((sum, { tier }) => sum + tier.cp, 0)
            return (
            <div key={arch.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div style={{ fontSize: 10, color: arch.color, letterSpacing: 2, fontWeight: 700, textTransform: 'uppercase' }}>
                  {arch.name}
                </div>
                <div style={{ fontSize: 11, color: arch.color, fontWeight: 700 }}>{treeTotal} CP</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {items.map(({ pkg, tier, ti }) => (
                  <div key={`${pkg.id}_${ti}`} style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '10px 14px', background: '#191b22',
                    border: `1px solid ${arch.color}22`, borderRadius: 6,
                  }}>
                    <div style={{
                      minWidth: 36, fontSize: 10, fontWeight: 700, color: arch.color,
                      background: '#191b22', padding: '2px 6px', borderRadius: 3, textAlign: 'center',
                    }}>
                      {pkg.sub}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#f5f5f7' }}>{tier.name}</div>
                      <div style={{ fontSize: 11, color: '#6e6e78' }}>{tier.desc}</div>
                    </div>
                    <div style={{ fontSize: 11, color: arch.color, fontWeight: 700 }}>{tier.cp} CP</div>
                  </div>
                ))}
              </div>
            </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── ELITE SECTION ───────────────────────────────────────────────────────────

function EliteSection({ archetype, premium, purchased, baseOnlyCpSpent, selected, onSelect }) {
  if (!premium) return null

  const spendReq = premium.unlockReqs.find(r => r.type === 'progress' && r.total)?.total || 200
  const spendProgress = Math.min(baseOnlyCpSpent, spendReq)
  const checkboxReq = premium.unlockReqs.find(r => r.type === 'checkbox')

  return (
    <div style={{ padding: '16px 20px 24px', borderTop: '1px solid #2f313b', marginTop: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <span style={{ fontSize: 12, color: '#f59e0b' }}>&#128274;</span>
        <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 15, letterSpacing: 3, color: '#6e6e78' }}>
          {premium.name.toUpperCase()}
        </span>
      </div>

      {/* 4x2 icon grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 16 }}>
        {premium.packages.map((pkg) => {
          const tiersOwned = pkg.tiers.filter((_, ti) => purchased.has(`${pkg.id}_${ti}`)).length
          const isSelected = selected === pkg.id
          return (
            <div key={pkg.id}
              onClick={() => onSelect(pkg.id)}
              title={pkg.name + (pkg.sub ? ` (${pkg.sub})` : '')}
              style={{
                background: '#0b0c11',
                border: `2px solid ${isSelected ? '#a8a8b0' : '#1e2d40'}`,
                borderRadius: 8,
                padding: '10px 6px 6px',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 5,
                opacity: 0.55,
                transition: 'opacity 0.15s, border-color 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.opacity = 0.75 }}
              onMouseLeave={e => { e.currentTarget.style.opacity = isSelected ? 0.75 : 0.55 }}
            >
              <div style={{
                width: 34, height: 34, background: '#23252e', borderRadius: 4,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <InlineIcon
                  iconKey={pkg.icon}
                  size={20}
                  color={tiersOwned > 0 ? '#6e6e78' : '#4a4a52'}
                />
              </div>
              <div style={{ fontSize: 10, color: tiersOwned > 0 ? '#6e6e78' : '#4a4a52' }}>
                {tiersOwned}/{pkg.tiers.length}
              </div>
            </div>
          )
        })}
      </div>

      {/* Unlock requirements */}
      <div>
        <div style={{ fontSize: 9, color: '#4a4a52', letterSpacing: 2, marginBottom: 10 }}>UNLOCK REQUIREMENTS</div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 160 }}>
            <div style={{ fontSize: 11, color: '#6e6e78', marginBottom: 4 }}>Unlock {archetype.name} first</div>
            <div style={{ height: 3, background: '#2f313b', borderRadius: 2 }}>
              <div style={{ height: '100%', width: '100%', background: archetype.color, borderRadius: 2, opacity: 0.4 }} />
            </div>
            <div style={{ fontSize: 11, color: '#6e6e78', marginTop: 8, marginBottom: 4 }}>
              Spend {spendReq} In {archetype.name}{' '}
              <span style={{ color: spendProgress >= spendReq ? '#22c55e' : '#6e6e78', fontWeight: 700 }}>
                {spendProgress}/{spendReq}
              </span>
            </div>
            <div style={{ height: 3, background: '#2f313b', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: `${(spendProgress / spendReq) * 100}%`,
                background: spendProgress >= spendReq ? '#22c55e' : archetype.color,
                borderRadius: 2,
                transition: 'width 0.3s',
              }} />
            </div>
          </div>
          {checkboxReq && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 180 }}>
              <div style={{
                width: 14, height: 14, border: '2px solid #4a4a52', borderRadius: 3,
                background: '#0b0c11', flexShrink: 0,
              }} />
              <span style={{ fontSize: 11, color: '#6e6e78' }}>{checkboxReq.label}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// The three archetypes available for free at coach creation
const FREE_STARTERS = ['recruiter', 'motivator', 'tactician']

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────

export default function CoachBuild() {
  const navigate = useNavigate()
  const pathPrefix = usePathPrefix()
  const { id: dynastyId } = useParams()
  const storageKey = `coachBuild_${dynastyId}`
  const { currentDynasty } = useDynasty()
  const { user } = useAuth()

  const coachName = useMemo(() => {
    if (!currentDynasty || !user?.uid) return 'Your Coach'
    return getCoachNameForUid(currentDynasty, user.uid, 'Your Coach') || 'Your Coach'
  }, [currentDynasty, user?.uid])

  const currentTeamName = useMemo(() => {
    if (!currentDynasty) return null
    const tid = currentDynasty.currentTid
    if (tid == null) return null
    return getMascotName(tid, currentDynasty.teams) || null
  }, [currentDynasty])

  const currentTeamLogoUrl = useMemo(() => {
    if (!currentDynasty) return null
    const tid = currentDynasty.currentTid
    if (tid == null) return null
    return getTeamLogoRobust(tid, currentDynasty.teams) || null
  }, [currentDynasty])

  // Load persisted state once on mount
  const saved = useMemo(() => {
    try { return JSON.parse(localStorage.getItem(storageKey)) || {} } catch { return {} }
  }, [storageKey])

  const [activeTab, setActiveTab] = useState('builder')
  const [levelInput, setLevelInput] = useState(String(saved.coachLevel ?? 100))
  const [coachLevel, setCoachLevel] = useState(saved.coachLevel ?? 100)
  const [preorder, setPreorder] = useState(saved.preorder ?? false)
  const [mvp, setMvp] = useState(saved.mvp ?? false)
  const [archetypeId, setArchetypeId] = useState(saved.archetypeId ?? null)
  const [starterArchId, setStarterArchId] = useState(saved.starterArchId ?? null)
  const [purchased, setPurchased] = useState(() => new Set(saved.purchased ?? []))
  const [checkedReqs, setCheckedReqs] = useState(() => new Set(saved.checkedReqs ?? []))
  const [selectedPkg, setSelectedPkg] = useState(null)
  const [hoveredArch, setHoveredArch] = useState(null)
  const [previewArchId, setPreviewArchId] = useState(null)

  // Persist state to localStorage whenever anything changes
  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify({
      archetypeId,
      starterArchId,
      purchased: [...purchased],
      checkedReqs: [...checkedReqs],
      coachLevel,
      preorder,
      mvp,
    }))
  }, [archetypeId, starterArchId, purchased, checkedReqs, coachLevel, preorder, mvp, storageKey])

  const archetype = ARCHETYPES.find(a => a.id === archetypeId) || null
  const previewArch = previewArchId ? ARCHETYPES.find(a => a.id === previewArchId) : null
  const activeArchId = archetypeId || previewArchId // for package display
  const packages = activeArchId ? (PACKAGES[activeArchId] || []) : []
  const premium = activeArchId ? (PREMIUM[activeArchId] || null) : null
  const isPreviewMode = !archetypeId && !!previewArchId
  const allPackages = useMemo(() => [...packages, ...(premium?.packages || [])], [packages, premium])

  const budget = computeBudget(coachLevel, preorder, mvp)

  // All packages across every archetype — used for global budget tracking
  const allArchetypePackages = useMemo(() => {
    const all = []
    for (const pkgList of Object.values(PACKAGES)) all.push(...pkgList)
    for (const prem of Object.values(PREMIUM)) all.push(...(prem?.packages || []))
    return all
  }, [])

  // Total CP spent across ALL archetypes (drives the header budget counter)
  const totalCpSpent = useMemo(() => {
    let total = 0
    for (const pkg of allArchetypePackages) {
      for (let ti = 0; ti < pkg.tiers.length; ti++) {
        if (purchased.has(`${pkg.id}_${ti}`)) total += pkg.tiers[ti].cp
      }
    }
    // Archetype unlock costs (all archetypes that were explicitly unlocked)
    for (const arch of ARCHETYPES) {
      if (!purchased.has(`__unlock_${arch.id}`)) continue
      if (FREE_STARTERS.includes(arch.id) && arch.id !== starterArchId) {
        total += 50 // Level-10 free-starter unlock price
      } else if (arch.unlockCost > 0) {
        total += arch.unlockCost // Premium archetype unlock price
      }
    }
    return total
  }, [purchased, allArchetypePackages, starterArchId])

  // CP spent per archetype — keyed by archId, plus '__total' for global sum
  const cpSpentByArchId = useMemo(() => {
    const map = {}
    for (const arch of ARCHETYPES) {
      const pkgList = PACKAGES[arch.id] || []
      const premPkgs = PREMIUM[arch.id]?.packages || []
      let total = 0
      for (const pkg of [...pkgList, ...premPkgs]) {
        for (let ti = 0; ti < pkg.tiers.length; ti++) {
          if (purchased.has(`${pkg.id}_${ti}`)) total += pkg.tiers[ti].cp
        }
      }
      map[arch.id] = total
    }
    map['__total'] = totalCpSpent
    return map
  }, [purchased, totalCpSpent])

  // CP spent in the currently viewed archetype (for the per-tree summary display)
  const cpSpent = useMemo(() => {
    if (!archetypeId) return 0
    let total = 0
    for (const pkg of allPackages) {
      for (let ti = 0; ti < pkg.tiers.length; ti++) {
        if (purchased.has(`${pkg.id}_${ti}`)) total += pkg.tiers[ti].cp
      }
    }
    return total
  }, [purchased, allPackages, archetypeId])

  // CP spent only in base packages (for premium unlock requirements)
  const baseOnlyCpSpent = useMemo(() => {
    if (!archetypeId) return 0
    let total = 0
    for (const pkg of packages) {
      for (let ti = 0; ti < pkg.tiers.length; ti++) {
        if (purchased.has(`${pkg.id}_${ti}`)) total += pkg.tiers[ti].cp
      }
    }
    return total
  }, [purchased, packages, archetypeId])

  const cpRemaining = budget - totalCpSpent

  // Dynamic archetype label: CEO > Program Builder > Talent Developer > most CP spent
  const dynamicArchetype = useMemo(() => {
    const hierarchy = ['ceo', 'program_builder', 'talent_developer']
    for (const id of hierarchy) {
      if (purchased.has(`__unlock_${id}`)) return ARCHETYPES.find(a => a.id === id) || null
    }
    // Fall back to whichever archetype has the most CP spent
    let bestArch = starterArchId ? ARCHETYPES.find(a => a.id === starterArchId) : null
    let bestCp = cpSpentByArchId[starterArchId] ?? 0
    for (const arch of ARCHETYPES) {
      if (arch.id === starterArchId) continue
      const cp = cpSpentByArchId[arch.id] ?? 0
      if (cp > bestCp) { bestArch = arch; bestCp = cp }
    }
    return bestArch
  }, [purchased, cpSpentByArchId, starterArchId])

  const selectedPackage = allPackages.find(p => p.id === selectedPkg) || null

  function handleToggleTier(key, cp) {
    setPurchased(prev => {
      const next = new Set(prev)
      if (next.has(key)) {
        // Refund — also remove all higher tiers in this package
        const parts = key.split('_')
        const ti = parseInt(parts[parts.length - 1])
        const pkgId = parts.slice(0, -1).join('_')
        const pkg = allPackages.find(p => p.id === pkgId)
        if (pkg) {
          for (let i = ti; i < pkg.tiers.length; i++) {
            next.delete(`${pkgId}_${i}`)
          }
        }
      } else {
        next.add(key)
      }
      return next
    })
  }

  function handleSelectArchetype(id) {
    setSelectedPkg(null)
    setArchetypeId(id)
    // First time choosing a free starter — mark it permanently
    if (FREE_STARTERS.includes(id) && !starterArchId) setStarterArchId(id)
    setPreviewArchId(null)
    setHoveredArch(null)
  }

  // Spend the 50 CP unlock cost for a level-10 free-starter archetype
  function handleUnlockArchetype(id) {
    setPurchased(prev => new Set([...prev, `__unlock_${id}`]))
    setSelectedPkg(null)
    setArchetypeId(id)
    setPreviewArchId(null)
    setHoveredArch(null)
  }

  function handlePreview(id) {
    setPreviewArchId(id)
    setHoveredArch(null)
    setSelectedPkg(null)
  }

  function handleReset() {
    localStorage.removeItem(storageKey)
    setArchetypeId(null)
    setStarterArchId(null)
    setPreviewArchId(null)
    setPurchased(new Set())
    setCheckedReqs(new Set())
    setSelectedPkg(null)
    setHoveredArch(null)
    setCoachLevel(100)
    setLevelInput('100')
    setPreorder(false)
    setMvp(false)
  }

  function handleToggleReqCheck(archId, label) {
    setCheckedReqs(prev => {
      const key = `${archId}::${label}`
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }

  function isReqMet(archId, req) {
    if (req.type === 'plain') return false
    if (req.type === 'checkbox') return checkedReqs.has(`${archId}::${req.label}`)
    if (req.type === 'progress') {
      if (req.archId?.startsWith('__starter_')) {
        const targetId = req.archId.replace('__starter_', '')
        return starterArchId === targetId || purchased.has(`__unlock_${targetId}`)
      }
      const current = cpSpentByArchId[req.archId] ?? 0
      return req.total ? current >= req.total : current > 0
    }
    return false
  }

  function allUnlockReqsMet(arch) {
    if (!arch?.unlockReqs) return true
    return arch.unlockReqs.every(req => isReqMet(arch.id, req))
  }

  // Returns arch with flags injected based on selection state
  function getEffectiveArch(arch) {
    if (!arch) return arch
    if (starterArchId && FREE_STARTERS.includes(arch.id) && arch.id !== starterArchId) {
      return { ...arch, unlockCost: 50, unlockReqs: [{ label: 'Coach level 10', type: 'checkbox' }], _isLevel10Unlock: true }
    }
    if (starterArchId && arch.id === starterArchId) {
      return { ...arch, _isChosenStarter: true }
    }
    return arch
  }

  function handleSetLevel() {
    const n = parseInt(levelInput)
    if (!isNaN(n) && n >= 1 && n <= 100) setCoachLevel(n)
  }

  // Purchased tier count for sidebar list
  const purchasedList = useMemo(() => {
    const out = []
    for (const arch of ARCHETYPES) {
      const pkgList = PACKAGES[arch.id] || []
      const premPkgs = PREMIUM[arch.id]?.packages || []
      for (const pkg of [...pkgList, ...premPkgs]) {
        const count = pkg.tiers.filter((_, ti) => purchased.has(`${pkg.id}_${ti}`)).length
        if (count > 0) out.push({ pkg, count, total: pkg.tiers.length, archId: arch.id, archColor: arch.color, archName: arch.name })
      }
    }
    return out
  }, [purchased])

  return (
    <div style={styles.root}>
      {/* ── TOP BAR ── */}
      <div style={styles.topBar}>
        <button onClick={() => navigate(`${pathPrefix}/coach-career`)} style={styles.backBtn}>
          ← Back
        </button>

        <div style={styles.topTitle}>COACH BUILDER</div>

        <div style={styles.topTabs}>
          {['builder', 'summary'].map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)} style={{
              ...styles.tabBtn,
              color: activeTab === tab ? '#f5f5f7' : '#6e6e78',
              borderBottom: activeTab === tab ? '2px solid #f59e0b' : '2px solid transparent',
            }}>
              {tab.toUpperCase()}
            </button>
          ))}
        </div>

        <div style={styles.topControls}>
          <label style={styles.checkLabel}>
            <input type="checkbox" checked={preorder} onChange={e => setPreorder(e.target.checked)}
              style={{ accentColor: '#f59e0b' }} />
            <span style={{ color: '#f59e0b' }}>Preorder +100</span>
          </label>
          <label style={styles.checkLabel}>
            <input type="checkbox" checked={mvp} onChange={e => setMvp(e.target.checked)}
              style={{ accentColor: '#f59e0b' }} />
            <span style={{ color: '#f59e0b' }}>MVP+ +150</span>
          </label>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 11, color: '#6e6e78', letterSpacing: 1 }}>LEVEL</span>
            <input
              type="number" min={1} max={100} value={levelInput}
              onChange={e => setLevelInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSetLevel()}
              style={styles.levelInput}
            />
            <button onClick={handleSetLevel} style={styles.setBtn}>SET</button>
          </div>

          <div style={styles.cpCounter}>
            <span style={{ color: '#f59e0b', fontWeight: 700 }}>{budget - totalCpSpent}</span>
            <span style={{ color: '#6e6e78' }}> / {budget}</span>
            <span style={{ fontSize: 10, color: '#6e6e78', marginLeft: 4, letterSpacing: 1 }}>CP</span>
          </div>

          <button onClick={handleReset} style={styles.resetBtn}>RESET</button>
        </div>
      </div>

      {activeTab === 'summary' ? (
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <SummaryView
            dynamicArchetype={dynamicArchetype}
            purchased={purchased}
            totalCpSpent={totalCpSpent}
            budget={budget}
          />
        </div>
      ) : (
        <div style={styles.mainContent}>
          {/* ── LEFT SIDEBAR ── */}
          <div style={styles.sidebar}>
            <div style={styles.sideCoachCard}>
              <div style={styles.sideCoachAvatar}>
                {currentTeamLogoUrl && (
                  <img
                    src={currentTeamLogoUrl}
                    alt=""
                    style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: '50%' }}
                  />
                )}
              </div>
              <div>
                <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 18, letterSpacing: 2, color: '#f5f5f7' }}>
                  {coachName}
                </div>
                {currentTeamName && (
                  <div style={{ fontSize: 10, color: '#f59e0b', letterSpacing: 1, marginBottom: 1 }}>
                    {currentTeamName.toUpperCase()}
                  </div>
                )}
                <div style={{ fontSize: 11, color: dynamicArchetype ? dynamicArchetype.color : '#6e6e78', letterSpacing: 1 }}>
                  {dynamicArchetype
                    ? dynamicArchetype.name.toUpperCase()
                    : 'NO ARCHETYPE'}
                </div>
              </div>
            </div>

            <div style={styles.sideSection}>
              <div style={styles.sideSectionLabel}>CP BUDGET</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: 11, color: '#6e6e78' }}>Spent</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#f5f5f7' }}>{totalCpSpent}</span>
              </div>
              {archetypeId && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontSize: 11, color: archetype?.color || '#6e6e78' }}>
                    In {archetype?.name || archetypeId}
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: archetype?.color || '#f5f5f7' }}>
                    {cpSpentByArchId[archetypeId] ?? 0}
                  </span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 11, color: '#6e6e78' }}>Remaining</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: cpRemaining < 0 ? '#ef4444' : '#22c55e' }}>
                  {cpRemaining}
                </span>
              </div>
              {/* Budget bar */}
              <div style={{ height: 4, background: '#2f313b', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{
                  height: '100%',
                  width: `${Math.min(100, (totalCpSpent / budget) * 100)}%`,
                  background: cpRemaining < 0 ? '#ef4444' : archetype?.color || '#f59e0b',
                  transition: 'width 0.3s',
                }} />
              </div>
            </div>

            {(archetype || previewArch) && (
              <div style={styles.sideSection}>
                <div style={styles.sideSectionLabel}>
                  {isPreviewMode ? 'PERK (PREVIEW)' : 'ARCHETYPE PERK'}
                </div>
                <div style={{ fontSize: 11, color: (archetype || previewArch).color, fontWeight: 700, marginBottom: 2 }}>
                  {(archetype || previewArch).perk?.name ?? '—'}
                </div>
                <div style={{ fontSize: 10, color: '#6e6e78', lineHeight: 1.5 }}>
                  {(archetype || previewArch).perk?.desc ?? ''}
                </div>
              </div>
            )}

            {purchasedList.length > 0 && (() => {
              // Group flat list by archetype
              const groups = []
              const seen = new Map()
              for (const item of purchasedList) {
                if (!seen.has(item.archId)) {
                  const g = { archId: item.archId, archName: item.archName, archColor: item.archColor, items: [] }
                  seen.set(item.archId, g)
                  groups.push(g)
                }
                seen.get(item.archId).items.push(item)
              }
              return (
                <div style={styles.sideSection}>
                  <div style={styles.sideSectionLabel}>PURCHASED PACKAGES</div>
                  {groups.map(({ archId, archName, archColor, items }) => (
                    <div key={archId} style={{ marginBottom: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <span style={{ fontSize: 9, color: archColor, letterSpacing: 1, fontWeight: 700 }}>{archName.toUpperCase()}</span>
                        <span style={{ fontSize: 10, color: archColor, fontWeight: 700 }}>{cpSpentByArchId[archId] ?? 0} CP</span>
                      </div>
                      {items.map(({ pkg, count, total, archColor: c }) => (
                        <div key={pkg.id} style={styles.sidePkgRow}>
                          <span style={{ fontSize: 11, color: '#a8a8b0' }}>{pkg.name}</span>
                          <span style={{ fontSize: 11, color: c, fontWeight: 700 }}>{count}/{total}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )
            })()}
          </div>

          {/* ── CENTER CANVAS ── */}
          <div style={styles.canvas}>
            {!archetypeId && !previewArchId ? (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={styles.chooseTitle}>CHOOSE YOUR STARTING ARCHETYPE</div>
                <div style={styles.chooseSubtitle}>
                  Pick one of the three highlighted trees — it's free. The other two unlock at level 10.
                </div>
                <div style={{ flex: 1, width: '100%', maxWidth: 820 }}>
                  <ArchetypeWheel
                    selected={hoveredArch}
                    onSelect={(id) => setHoveredArch(prev => prev === id ? null : id)}
                    starterArchId={starterArchId}
                  />
                </div>
              </div>
            ) : (
              <div style={{ flex: 1, width: '100%', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
                {/* Back button */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexShrink: 0 }}>
                  <button
                    onClick={() => {
                      if (isPreviewMode) { setPreviewArchId(null); setSelectedPkg(null) }
                      else { setArchetypeId(null); setSelectedPkg(null) }
                    }}
                    style={{ ...styles.backBtn, fontSize: 11 }}
                  >
                    ← Back to wheel
                  </button>
                </div>

                {/* Preview banner */}
                {isPreviewMode && previewArch && (
                  <div style={{
                    flexShrink: 0,
                    margin: '0 0 8px',
                    padding: '10px 14px',
                    background: '#0b0c11',
                    border: '1px solid #2f313b',
                    borderRadius: 7,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{
                        fontSize: 9, fontWeight: 700, letterSpacing: 1.5,
                        color: '#f59e0b', background: '#1a1200', border: '1px solid #5a3d00',
                        borderRadius: 3, padding: '2px 6px',
                      }}>
                        PREVIEW
                      </div>
                      <span style={{ fontSize: 12, color: '#6e6e78' }}>
                        <strong style={{ color: '#a8a8b0' }}>{previewArch.name}</strong> isn't unlocked yet — browse what you'd get.
                      </span>
                    </div>
                    {(() => {
                      const isPrevPremium = !!previewArch.unlockReqs
                      const prevAlreadyUnlocked = isPrevPremium && purchased.has(`__unlock_${previewArch.id}`)
                      return (
                        <button
                          disabled={prevAlreadyUnlocked}
                          onClick={() => prevAlreadyUnlocked ? null : isPrevPremium ? handleUnlockArchetype(previewArch.id) : handleSelectArchetype(previewArch.id)}
                          style={{
                            ...styles.btnPrimary,
                            background: prevAlreadyUnlocked ? '#0d2010' : previewArch.color,
                            color: prevAlreadyUnlocked ? '#22c55e' : '#fff',
                            border: prevAlreadyUnlocked ? '1px solid #16a34a' : 'none',
                            cursor: prevAlreadyUnlocked ? 'default' : 'pointer',
                            padding: '6px 14px',
                            fontSize: 10,
                            whiteSpace: 'nowrap',
                            flexShrink: 0,
                          }}
                        >
                          {prevAlreadyUnlocked ? 'UNLOCKED' : isPrevPremium ? `UNLOCK ${previewArch.name.toUpperCase()}` : `START AS ${previewArch.name.toUpperCase()}`}
                        </button>
                      )
                    })()}
                  </div>
                )}

                {/* Base package wheel */}
                <div style={{ flexShrink: 0, width: '100%', maxWidth: 820, alignSelf: 'center' }}>
                  <PackageWheel
                    archetype={archetype || previewArch}
                    packages={packages}
                    purchased={purchased}
                    selected={selectedPkg}
                    onSelect={(id) => setSelectedPkg(prev => prev === id ? null : id)}
                  />
                </div>

                {/* Empty state when archetype has no packages yet */}
                {packages.length === 0 && (
                  <div style={{ textAlign: 'center', color: '#4a4a52', fontSize: 12, marginTop: 24, letterSpacing: 1 }}>
                    PACKAGE DATA COMING SOON
                  </div>
                )}

                {/* Elite / premium section */}
                {premium && (archetype || previewArch) && (
                  <EliteSection
                    archetype={archetype || previewArch}
                    premium={premium}
                    purchased={purchased}
                    baseOnlyCpSpent={baseOnlyCpSpent}
                    selected={selectedPkg}
                    onSelect={(id) => setSelectedPkg(prev => prev === id ? null : id)}
                  />
                )}
              </div>
            )}
          </div>

          {/* ── RIGHT DETAIL PANEL ── */}
          <div style={styles.rightPanel}>
            {/* Archetype selection screen: hovering an archetype node */}
            {!archetypeId && !previewArchId && (() => {
              const effHovered = hoveredArch ? getEffectiveArch(ARCHETYPES.find(a => a.id === hoveredArch)) : null
              return hoveredArch ? (
                <DetailPanel
                  archetype={effHovered}
                  pkg={null}
                  purchased={purchased}
                  cpRemaining={cpRemaining}
                  cpSpentByArchId={cpSpentByArchId}
                  starterArchId={starterArchId}
                  checkedReqs={checkedReqs}
                  archReqsMet={allUnlockReqsMet(effHovered)}
                  onToggleTier={handleToggleTier}
                  onSelectArchetype={handleSelectArchetype}
                  onUnlockArchetype={handleUnlockArchetype}
                  onToggleReqCheck={handleToggleReqCheck}
                  onPreview={handlePreview}
                />
              ) : (
                <div style={styles.detailEmpty}>
                  <div style={{ color: '#4a4a52', fontSize: 12, textAlign: 'center', lineHeight: 1.7, letterSpacing: 0.5 }}>
                    Click an archetype<br />to preview it
                  </div>
                </div>
              )
            })()}

            {/* Preview mode: viewing a package */}
            {isPreviewMode && selectedPackage && (
              <DetailPanel
                archetype={previewArch}
                pkg={selectedPackage}
                purchased={new Set()}
                cpRemaining={0}
                onToggleTier={() => {}}
                onSelectArchetype={handleSelectArchetype}
                isElitePkg={premium?.packages?.some(p => p.id === selectedPkg)}
                isPreview
              />
            )}
            {isPreviewMode && !selectedPackage && (
              <div style={styles.detailEmpty}>
                <div style={{ color: '#4a4a52', fontSize: 12, textAlign: 'center', lineHeight: 1.7, letterSpacing: 0.5 }}>
                  Click a package<br />to see its tiers
                </div>
              </div>
            )}

            {/* Active archetype: viewing a package */}
            {archetypeId && selectedPackage && (
              <DetailPanel
                archetype={getEffectiveArch(archetype)}
                pkg={selectedPackage}
                purchased={purchased}
                cpRemaining={cpRemaining}
                cpSpentByArchId={cpSpentByArchId}
                starterArchId={starterArchId}
                onToggleTier={handleToggleTier}
                onSelectArchetype={handleSelectArchetype}
                onUnlockArchetype={handleUnlockArchetype}
                isElitePkg={premium?.packages?.some(p => p.id === selectedPkg)}
              />
            )}
            {archetypeId && !selectedPackage && (() => {
              const effArch = getEffectiveArch(archetype)
              return (
                <DetailPanel
                  archetype={effArch}
                  pkg={null}
                  purchased={purchased}
                  cpRemaining={cpRemaining}
                  cpSpentByArchId={cpSpentByArchId}
                  starterArchId={starterArchId}
                  checkedReqs={checkedReqs}
                  archReqsMet={allUnlockReqsMet(effArch)}
                  onToggleTier={handleToggleTier}
                  onSelectArchetype={handleSelectArchetype}
                  onUnlockArchetype={handleUnlockArchetype}
                  onToggleReqCheck={handleToggleReqCheck}
                />
              )
            })()}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── STYLES ───────────────────────────────────────────────────────────────────

const styles = {
  root: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    minHeight: 'calc(100vh - 60px)',
    backgroundColor: '#06070b',
    color: '#f5f5f7',
    fontFamily: "'Saira', system-ui, sans-serif",
  },
  topBar: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    padding: '8px 16px',
    borderBottom: '1px solid #2f313b',
    backgroundColor: '#0b0c11',
    flexShrink: 0,
    flexWrap: 'wrap',
  },
  backBtn: {
    color: '#6e6e78',
    fontSize: 13,
    fontWeight: 500,
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: 0,
    flexShrink: 0,
  },
  topTitle: {
    fontFamily: "'Bebas Neue', sans-serif",
    fontSize: '1.1rem',
    letterSpacing: '4px',
    color: '#f5f5f7',
    flexShrink: 0,
  },
  topTabs: {
    display: 'flex',
    gap: 2,
  },
  tabBtn: {
    background: 'none',
    border: 'none',
    borderBottom: '2px solid transparent',
    padding: '4px 12px',
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 2,
    cursor: 'pointer',
    transition: 'color 0.15s',
  },
  topControls: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    marginLeft: 'auto',
    flexWrap: 'wrap',
  },
  checkLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: 0.5,
    cursor: 'pointer',
    color: '#f59e0b',
  },
  levelInput: {
    width: 54,
    background: '#191b22',
    border: '1px solid #2f313b',
    borderRadius: 4,
    color: '#f5f5f7',
    fontSize: 13,
    fontWeight: 700,
    padding: '3px 6px',
    textAlign: 'center',
  },
  setBtn: {
    background: '#23252e',
    border: 'none',
    borderRadius: 4,
    color: '#f5f5f7',
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: 1.5,
    padding: '4px 8px',
    cursor: 'pointer',
  },
  cpCounter: {
    fontSize: 14,
    fontWeight: 700,
    background: '#191b22',
    border: '1px solid #2f313b',
    borderRadius: 6,
    padding: '4px 12px',
  },
  resetBtn: {
    background: 'none',
    border: '1px solid #2f313b',
    borderRadius: 4,
    color: '#6e6e78',
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: 1.5,
    padding: '4px 10px',
    cursor: 'pointer',
  },
  mainContent: {
    flex: 1,
    display: 'flex',
    overflow: 'hidden',
  },
  sidebar: {
    width: 220,
    flexShrink: 0,
    borderRight: '1px solid #2f313b',
    overflowY: 'auto',
    padding: '16px 14px',
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  sideCoachCard: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '10px 12px',
    background: '#191b22',
    border: '1px solid #2f313b',
    borderRadius: 8,
  },
  sideCoachAvatar: {
    width: 38,
    height: 38,
    borderRadius: '50%',
    background: '#23252e',
    flexShrink: 0,
    overflow: 'hidden',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sideSection: {
    padding: '12px 0',
    borderTop: '1px solid #2f313b',
  },
  sideSectionLabel: {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.12em',
    color: '#6e6e78',
    textTransform: 'uppercase',
    fontFamily: "'Saira Semi Condensed', system-ui, sans-serif",
    marginBottom: 8,
  },
  sidePkgRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 5,
  },
  canvas: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    padding: '12px 8px 0',
  },
  rightPanel: {
    width: 280,
    flexShrink: 0,
    borderLeft: '1px solid #2f313b',
    overflowY: 'auto',
  },
  detailEmpty: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    padding: 24,
  },
  detailPanel: {
    padding: '20px 18px',
  },
  detailSection: {
    marginBottom: 4,
  },
  detailLabel: {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.12em',
    color: '#6e6e78',
    textTransform: 'uppercase',
    fontFamily: "'Saira Semi Condensed', system-ui, sans-serif",
    marginBottom: 6,
  },
  detailPerkName: {
    fontSize: 13,
    fontWeight: 700,
    color: '#f5f5f7',
    marginBottom: 3,
  },
  detailPerkDesc: {
    fontSize: 11,
    color: '#6e6e78',
    lineHeight: 1.5,
  },
  tierRow: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 10,
    padding: '10px 12px',
    border: '1px solid #2f313b',
    borderRadius: 6,
    marginBottom: 8,
    transition: 'border-color 0.2s',
  },
  tierBtn: {
    border: 'none',
    borderRadius: 4,
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: 1,
    padding: '3px 8px',
    transition: 'background 0.15s',
  },
  btnPrimary: {
    border: 'none',
    borderRadius: 6,
    color: '#fff',
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 2,
    padding: '10px 16px',
    cursor: 'pointer',
  },
  chooseTitle: {
    fontFamily: "'Bebas Neue', sans-serif",
    fontSize: '1.6rem',
    letterSpacing: '4px',
    color: '#f59e0b',
    textAlign: 'center',
    marginBottom: 6,
  },
  chooseSubtitle: {
    fontSize: 12,
    color: '#6e6e78',
    textAlign: 'center',
    marginBottom: 8,
    maxWidth: 380,
  },
  summaryStatBox: {
    background: '#191b22',
    border: '1px solid #2f313b',
    borderRadius: 8,
    padding: '12px 20px',
    minWidth: 90,
  },
  summaryStatVal: {
    fontFamily: "'Bebas Neue', sans-serif",
    fontSize: 26,
    color: '#f59e0b',
    letterSpacing: 2,
  },
  summaryStatLabel: {
    fontSize: 10,
    color: '#6e6e78',
    letterSpacing: '0.12em',
    fontWeight: 700,
    textTransform: 'uppercase',
    fontFamily: "'Saira Semi Condensed', system-ui, sans-serif",
  },
}
