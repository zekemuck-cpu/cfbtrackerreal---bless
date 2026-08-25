// Scheme Builder — replaces the old Play Sheet tool. Three modes:
//   Build mode: recommend an offense/defense scheme from the roster's real
//     archetypes, then assemble a base package of real CFB27 formations.
//   Archetypes mode: view/edit this team's players' real play-style
//     archetypes (writes the same player.archetype field used app-wide).
//   Gameplan mode: a reference of the real plays inside every formation in
//     the chosen playbook — meant to be glanced at mid-game.
// CFB27-only: gated off for any other game edition.
import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  DndContext, MouseSensor, TouchSensor, KeyboardSensor,
  useSensor, useSensors, closestCenter, useDroppable,
} from '@dnd-kit/core'
import { SortableContext, useSortable, arrayMove, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useDynasty } from '../../context/DynastyContext'
import { getEditionKey, isPcAutoDynasty } from '../../editions'
import { TEAMS, getColorsFromTid } from '../../data/teamRegistry'
import { getContrastTextColor } from '../../utils/colorUtils'
import { PageHero, Card, Badge, Button, EmptyState } from '../../components/ui'
import { Input, Select } from '../../components/ui/FormField'
import { projectRoster } from '../../utils/rosterProjection'
import { buildBoard, DEPTH_CHART_CATALOG } from '../../utils/outlookBoard'
import { scoreSchemeFit, scoreFormationFit, scorePlaybookFit, parseFormationPersonnel } from '../../utils/schemeFit'
import { archetypesForPosition } from '../../data/archetypeSchemeFit'
import formationsData from '../../data/playbookData/formations.json'
import teamsData from '../../data/playbookData/teams.json'
import schemeTeamIdsData from '../../data/playbookData/schemeTeamIds.json'
import playbookTendencyData from '../../data/playbookData/playbookTendency.json'

// Vite-native lazy loaders for the large per-set play files and per-team
// playbook files — only the sets/teams actually opened get fetched.
const playsLoaders = import.meta.glob('../../data/playbookData/plays/*/*.json')
const teamPlaybookLoaders = import.meta.glob('../../data/playbookData/teamPlaybooks/*.json')

const PLAY_TYPE_GROUPS = {
  offense: [['RUN', 'Run'], ['PASS', 'Pass'], ['RPO', 'RPO']],
  defense: [['BLITZ', 'Blitz'], ['MAN', 'Man'], ['ZONE', 'Zone'], ['MATCH', 'Match']],
}

// Situational categories start with these three out of the box (removable,
// and more can be added with custom titles) — stable ids so a category
// that's never been touched still resolves to the same key once the user
// does add/remove/star something in it and it gets persisted for real.
const DEFAULT_SITUATIONAL_CATEGORIES = [
  { id: 'redzone', name: 'Redzone', formationIds: [], playIds: [] },
  { id: 'goalline', name: 'Goal Line', formationIds: [], playIds: [] },
  { id: 'twomin', name: '2 Min Drill', formationIds: [], playIds: [] },
]

// Header bands (situational categories AND base-package formations) are
// colored by what's actually inside them — the majority play type — so the
// color carries real information (glance at a band, know if it's a run
// look or a pass look) instead of being an arbitrary per-id hash. Separate
// from team color entirely, matching the "team color is an accent, never a
// fill" rule — these bands are a state/content indicator, not branding.
const PLAY_TYPE_COLORS = {
  offense: { RUN: '#dd9440', PASS: '#4090dd', RPO: '#9e6bdd' },
  defense: { BLITZ: '#ef4444', MAN: '#9e6bdd', ZONE: '#4090dd', MATCH: '#22c55e' },
}
const EMPTY_BAND_COLOR = '#4e515c' // surface-5 — "nothing in here yet", not a type

// A few category identities carry their own fixed color regardless of
// content — Redzone reads as danger-red and 2 Min Drill as go-green the
// same way a real sideline card would, so those two override the
// computed dominant-play-type color. Any other category (including
// Goal Line and custom ones) still gets colored by what's inside it.
const CATEGORY_FIXED_COLORS = { redzone: '#ef4444', twomin: '#22c55e' }

// Base package cards get a single fixed "highlighter" yellow regardless of
// content — these are the formations you actually built your gameplan
// around, so they should visually pop above everything else on the page.
const BASE_PACKAGE_BAND_COLOR = '#f4ff3d'

function dominantTypeColor(plays, side) {
  if (!plays || !plays.length) return EMPTY_BAND_COLOR
  const counts = {}
  for (const p of plays) counts[p.type] = (counts[p.type] || 0) + 1
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]
  return PLAY_TYPE_COLORS[side]?.[top] || EMPTY_BAND_COLOR
}

const slugSet = (name) => String(name).trim().replace(/[^a-zA-Z0-9-]+/g, '_')
const formationId = (f) => `${f.set_name}::${f.formation_name}`

// The SELECTED playbook's own formation list (with play counts) — a Map of
// formationId ("set::formation") -> how many plays this specific playbook
// carries out of it. Playbook-level SCORING (Stage 2) doesn't need this —
// see scorePlaybookFit, which reads the already-loaded tendency data
// instead — this is only for narrowing/labeling Stage 3's formation list
// once a playbook is actually picked.
function loadPlaybookFormationCounts(teamId, side) {
  const path = `../../data/playbookData/teamPlaybooks/${teamId}.json`
  const loader = teamPlaybookLoaders[path]
  if (!loader) return Promise.resolve(new Map())
  return loader().then((mod) => {
    const data = mod.default || mod
    const plays = data[side] || []
    const counts = new Map()
    for (const p of plays) {
      const key = `${p.set}::${p.formation}`
      counts.set(key, (counts.get(key) || 0) + 1)
    }
    return counts
  })
}

// Same score-color convention as the scheme cards and formation cards —
// success/default/outline by score band. `null`/undefined (not loaded yet)
// renders nothing rather than a placeholder, so the list doesn't flicker.
// Shown to one decimal place so genuinely different (if close) playbook
// scores read as different, not just rounded to the same whole number.
function PlaybookScoreBadge({ score }) {
  if (score == null) return null
  return <Badge variant={score >= 70 ? 'success' : score >= 40 ? 'default' : 'outline'}>{score.toFixed(1)}</Badge>
}

// Shared, consistently-structured breakdown for every score in Scheme
// Builder (scheme rankings, playbook scores, formation scores) — same
// columns everywhere (position, archetype/OVR, that slot's own 0-100
// value, and its weight share of the total) so two scores of the SAME
// type — two schemes, two playbooks, two formations — can be lined up
// factor-by-factor instead of just comparing the final number.
function ScoreBreakdownTable({ breakdown }) {
  if (!breakdown || !breakdown.length) {
    return <p className="mt-1.5 text-xs text-txt-tertiary">No archetypes are set yet for the positions this score is based on.</p>
  }
  return (
    <div className="mt-1.5 rounded-sm border border-surface-5 overflow-hidden text-xs">
      <div className="grid grid-cols-[2.5rem_1fr_3rem_3.5rem] gap-x-2 px-2 py-1 bg-surface-3 text-txt-tertiary font-semibold uppercase tracking-wide text-[10px]">
        <span>Pos</span>
        <span>Archetype</span>
        <span className="text-right">Value</span>
        <span className="text-right">Weight</span>
      </div>
      {breakdown.map((b, i) => (
        <div key={`${b.position}-${i}`} className="grid grid-cols-[2.5rem_1fr_3rem_3.5rem] gap-x-2 px-2 py-1 border-t border-surface-5">
          <span className="text-txt-primary font-semibold truncate">{b.position}</span>
          <span className="text-txt-secondary truncate">
            {b.archetype || 'Not set'}{b.ovr != null ? ` (${b.ovr} OVR)` : ''}
          </span>
          <span className="text-txt-primary tabular-nums text-right">{b.value.toFixed(1)}</span>
          <span className="text-txt-tertiary tabular-nums text-right">{b.weightPct.toFixed(0)}%</span>
        </div>
      ))}
    </div>
  )
}

// A plain text toggle (no decorative icon, per CLAUDE.md) that reveals the
// breakdown table on demand — collapsed by default so cards/pills stay
// compact. `stop` stops the click from bubbling to a parent onClick,
// needed when this sits inside a selectable Card.
function BreakdownToggle({ breakdown, stop }) {
  const [open, setOpen] = useState(false)
  return (
    <div onClick={stop ? (e) => e.stopPropagation() : undefined}>
      <button
        type="button"
        className="text-[11px] font-semibold text-txt-tertiary hover:text-txt-primary underline decoration-dotted underline-offset-2"
        onClick={(e) => { if (stop) e.stopPropagation(); setOpen((v) => !v) }}
      >
        {open ? 'Hide breakdown' : 'Show breakdown'}
      </button>
      {open && <ScoreBreakdownTable breakdown={breakdown} />}
    </div>
  )
}

function personnelLabel(f) {
  if (f.personnel) return { text: f.personnel, isEstimate: false }
  const p = parseFormationPersonnel(f)
  const parts = []
  if (p.rb) parts.push(`${p.rb} RB`)
  if (p.te) parts.push(`${p.te} TE`)
  if (p.wr) parts.push(`${p.wr} WR`)
  return { text: parts.join(' / ') || '—', isEstimate: true }
}

export default function SchemeBuilder() {
  const { currentDynasty, updateDynasty, updatePlayer, isViewOnly } = useDynasty()
  const { tid: tidParam, year: yearParam } = useParams()

  const tid = tidParam ? parseInt(tidParam, 10) : currentDynasty?.currentTid
  const year = yearParam ? parseInt(yearParam, 10) : Number(currentDynasty?.currentYear)
  const currentYear = Number(currentDynasty?.currentYear)

  const [side, setSide] = useState('offense')
  const [mode, setMode] = useState('build')
  const [query, setQuery] = useState('')
  const [playbookSearch, setPlaybookSearch] = useState('')
  const [setPlaysCache, setSetPlaysCache] = useState({})

  const isCfb27 = getEditionKey(currentDynasty) === 'cfb27' && !isPcAutoDynasty(currentDynasty)

  const team = TEAMS[tid]
  const teamColors = getColorsFromTid(currentDynasty?.teams, tid) || { primary: '#1f2937', secondary: '#f3f4f6' }
  const accentText = getContrastTextColor(teamColors.primary)

  const isPastYear = Number.isFinite(year) && Number.isFinite(currentYear) && year < currentYear
  const persisted = isPastYear
    ? (currentDynasty?.depthChartByYear?.[tid]?.[year] || {})
    : (currentDynasty?.teamFuture?.[tid] || {})
  const leaveSet = useMemo(() => new Set(persisted.leaveFlags || []), [persisted.leaveFlags])

  const players = useMemo(() => {
    if (!currentDynasty || tid == null || !Number.isFinite(year)) return []
    return projectRoster(currentDynasty, tid, year, { leaveFlags: leaveSet })
  }, [currentDynasty, tid, year, leaveSet])

  // Always resolve the FULL catalog (base + extras like WR2/HB2/TE2/SLWR,
  // DT2/CB2/NB) regardless of what the dynasty's Depth Chart page currently
  // has enabled in Positions settings — Scheme Builder needs those extra
  // roles populated so both the Archetypes editor and scheme scoring can see
  // them, independent of the depth chart's own display preferences.
  const layoutRows = useMemo(() => [DEPTH_CHART_CATALOG[side].map((sl) => sl.id)], [side])

  const board = useMemo(
    () => buildBoard(players, side, {
      placements: persisted.placements || {}, order: persisted.order || {}, layoutRows,
    }),
    [players, side, persisted.placements, persisted.order, layoutRows],
  )

  const schemeRankings = useMemo(() => scoreSchemeFit(board, side), [board, side])

  const schemeField = side === 'offense' ? 'offenseScheme' : 'defenseScheme'
  const selectedScheme = currentDynasty?.[schemeField] || null

  const builderState = currentDynasty?.schemeBuilder?.[tid]?.[year] || {}
  const packageKey = `${side}PackageIds`
  const packageIds = builderState[packageKey] || []
  const packageSet = useMemo(() => new Set(packageIds), [packageIds])
  // Per-formation color overrides for base package cards — keyed by
  // formation id, absent/undefined means "use the default highlighter
  // yellow". Same override/reset shape as situational category colors.
  const packageColorsKey = `${side}PackageColors`
  const packageColors = builderState[packageColorsKey] || {}
  const roleAssignmentsKey = `${side}RoleAssignments`
  const roleAssignments = builderState[roleAssignmentsKey] || {}
  const playbookKey = `${side}PlaybookTeamId`
  const selectedPlaybookTeamId = builderState[playbookKey] || null
  // Game View "starred" plays — pinned outside their formation's collapsed
  // play list for quick in-game glance access. Keyed by the play's own id
  // (already unique per real play in the ingested data), not per-formation,
  // since a play only ever appears under the one formation it belongs to.
  const favoritePlayIdsKey = `${side}FavoritePlayIds`
  const favoritePlayIds = builderState[favoritePlayIdsKey] || []
  const favoritePlaySet = useMemo(() => new Set(favoritePlayIds), [favoritePlayIds])

  // Multi-level dot-notation keys (e.g. 'schemeBuilder.166.2026.x') only
  // nest correctly against Firestore — local IndexedDB storage does a
  // shallow spread and would save it as one literal dotted-string key
  // instead of a nested object. Build the nested object explicitly and
  // write it under a single top-level key, matching the established
  // pattern for teamFuture (DynastyContext.jsx's saveTeamFuturePlan).
  //
  // Pure builder (no updateDynasty call) so callers that need to change
  // several schemeBuilder fields *and* a top-level field (e.g.
  // offenseScheme) in the same click can merge everything into ONE
  // updateDynasty call — two separate fire-and-forget calls race on the
  // same read-modify-write cycle (each reads the dynasty before the
  // other's write lands), and the second call silently clobbers the
  // first's change instead of composing with it. Takes an object of
  // key -> value so a single call can set multiple fields at once.
  const buildSchemeBuilderPatch = (updates) => {
    const sb = currentDynasty?.schemeBuilder || {}
    const forTid = sb[tid] || {}
    const forYear = forTid[year] || {}
    return { schemeBuilder: { ...sb, [tid]: { ...forTid, [year]: { ...forYear, ...updates } } } }
  }

  const writeSchemeBuilderField = (key, value) => {
    if (isViewOnly || !currentDynasty) return
    updateDynasty(currentDynasty.id, buildSchemeBuilderPatch({ [key]: value }))
  }

  const selectScheme = (scheme) => {
    if (isViewOnly || !currentDynasty) return
    const next = scheme === selectedScheme ? null : scheme
    // A playbook only makes sense within the scheme it was picked under —
    // changing schemes clears it (and the package built under it — see
    // selectPlaybook's comment) so the formation list doesn't stay narrowed
    // to a playbook that no longer matches what's selected.
    const updates = selectedPlaybookTeamId
      ? { [schemeField]: next, ...buildSchemeBuilderPatch({ [playbookKey]: undefined, [packageKey]: undefined }) }
      : { [schemeField]: next }
    updateDynasty(currentDynasty.id, updates)
  }

  const setPackageIds = (next) => writeSchemeBuilderField(packageKey, next)

  const setPackageColor = (fid, color) => writeSchemeBuilderField(packageColorsKey, { ...packageColors, [fid]: color })
  const resetPackageColor = (fid) => writeSchemeBuilderField(packageColorsKey, { ...packageColors, [fid]: undefined })

  // Which player is assigned to each Archetypes-mode role slot (LT, HB2,
  // Nickel, ...) — persisted so switching a role to a bench player survives
  // a reload instead of silently reverting to the depth-chart default and
  // looking like the archetype you set on them "didn't save."
  const assignRole = (slotId, pid) => {
    writeSchemeBuilderField(roleAssignmentsKey, { ...roleAssignments, [slotId]: pid || undefined })
  }

  // Star/unstar a real play for quick in-game glance access in Game View —
  // starred plays surface above the collapsed play list instead of being
  // buried inside it.
  const toggleFavoritePlay = (playId) => {
    const next = favoritePlaySet.has(playId)
      ? favoritePlayIds.filter((id) => id !== playId)
      : [...favoritePlayIds, playId]
    writeSchemeBuilderField(favoritePlayIdsKey, next)
  }

  // Situational categories (Redzone, Goal Line, 2 Min Drill by default, plus
  // any custom ones) — each holds its own formationIds/playIds; starring
  // still goes through the single shared favoritePlaySet above ("the same
  // star ability"), not a separate per-category favorites list.
  const situationalCategoriesKey = `${side}SituationalCategories`
  const situationalCategories = builderState[situationalCategoriesKey] || DEFAULT_SITUATIONAL_CATEGORIES
  const setSituationalCategories = (next) => writeSchemeBuilderField(situationalCategoriesKey, next)
  const updateCategory = (catId, updater) => {
    setSituationalCategories(situationalCategories.map((c) => (c.id === catId ? updater(c) : c)))
  }
  const addFormationToCategory = (catId, fid) => updateCategory(catId, (c) => (
    c.formationIds.includes(fid) ? c : { ...c, formationIds: [...c.formationIds, fid] }
  ))
  const removeFormationFromCategory = (catId, fid) => updateCategory(catId, (c) => (
    { ...c, formationIds: c.formationIds.filter((id) => id !== fid) }
  ))
  const addPlayToCategory = (catId, playId) => updateCategory(catId, (c) => (
    c.playIds.includes(playId) ? c : { ...c, playIds: [...c.playIds, playId] }
  ))
  const removePlayFromCategory = (catId, playId) => updateCategory(catId, (c) => (
    { ...c, playIds: c.playIds.filter((id) => id !== playId) }
  ))
  // A user-picked color overrides the computed/identity default entirely;
  // clearing it (color: undefined) reverts to that automatic behavior.
  const setCategoryColor = (catId, color) => updateCategory(catId, (c) => ({ ...c, color }))
  const resetCategoryColor = (catId) => updateCategory(catId, (c) => ({ ...c, color: undefined }))
  const renameCategory = (catId, name) => {
    const trimmed = name.trim()
    if (!trimmed) return
    updateCategory(catId, (c) => ({ ...c, name: trimmed }))
  }

  // Dividers — a free-floating title/section-break the user can drop
  // anywhere in "Your Gameplan" (via the same drag reorder as
  // formations/categories), or just as a blank rule if left untitled.
  // Now that "Your Gameplan" is a true multi-column board (each column an
  // independent stack, see gameplanColumns below), a divider is just a
  // normal item that lives in whichever column it's dragged into — there's
  // no more "spans the full board" orientation, since that's fundamentally
  // at odds with columns being allowed to differ in length. Purely
  // presentational: no plays/formations of their own, just an id + title.
  const gameplanDividersKey = `${side}GameplanDividers`
  const gameplanDividers = builderState[gameplanDividersKey] || []
  const setGameplanDividers = (next) => writeSchemeBuilderField(gameplanDividersKey, next)
  const renameDivider = (divId, title) => {
    setGameplanDividers(gameplanDividers.map((d) => (d.id === divId ? { ...d, title } : d)))
  }
  // Same override/reset shape as category colors — a user-picked color is
  // optional (plain/transparent by default) and "Auto" clears it.
  const setDividerColor = (divId, color) => {
    setGameplanDividers(gameplanDividers.map((d) => (d.id === divId ? { ...d, color } : d)))
  }
  const resetDividerColor = (divId) => {
    setGameplanDividers(gameplanDividers.map((d) => (d.id === divId ? { ...d, color: undefined } : d)))
  }

  const GAMEPLAN_COLUMN_COUNT = 3

  // "Your Gameplan" board — 3 independent columns, each its own ordered
  // list of tags (formations/categories/dividers mixed freely within a
  // column). Columns are allowed to hold different numbers of items; there
  // is no forced row alignment across them. Falls back to a round-robin
  // distribution of "package formations, then categories" (matching the
  // old auto-flowed-grid's default appearance) until the user actually
  // drags something, at which point that snapshot becomes the real
  // persisted layout. Every add/remove of a formation, category, or
  // divider below also has to touch this list — an item that exists in its
  // own source array but not here would just never render.
  //
  // Persisted shape is an OBJECT keyed by column index ({ "0": [...],
  // "1": [...], "2": [...] }), not an array of arrays — Firestore's
  // updateDoc rejects nested arrays outright ("Nested arrays are not
  // supported"), and an array-of-arrays is exactly that. A map whose
  // values are arrays is fine, so columns are converted to/from that shape
  // right at the persistence boundary; everywhere else in this component
  // still works with a plain array of 3 arrays.
  const gameplanColumnsKey = `${side}GameplanColumns`
  const columnsFromDoc = (doc) => Array.from(
    { length: GAMEPLAN_COLUMN_COUNT },
    (_, i) => doc?.[String(i)] || [],
  )
  const columnsToDoc = (cols) => Object.fromEntries(cols.map((col, i) => [String(i), col]))
  const gameplanColumns = builderState[gameplanColumnsKey]
    ? columnsFromDoc(builderState[gameplanColumnsKey])
    : (() => {
      const flat = [
        ...packageIds.map((id) => `formation:${id}`),
        ...situationalCategories.map((c) => `category:${c.id}`),
      ]
      const cols = Array.from({ length: GAMEPLAN_COLUMN_COUNT }, () => [])
      flat.forEach((tag, i) => cols[i % GAMEPLAN_COLUMN_COUNT].push(tag))
      return cols
    })()
  const reorderGameplanColumns = (nextColumns) => writeSchemeBuilderField(gameplanColumnsKey, columnsToDoc(nextColumns))
  // Always materializes off the CURRENT effective columns (already
  // fallback-or-explicit) rather than only touching an already-persisted
  // value — same reasoning as before: a divider has no fallback entry at
  // all, so this must work even on the very first add. New items go into
  // whichever column currently has the fewest items, keeping columns
  // roughly balanced by default.
  const addToGameplanColumns = (tag) => {
    const cols = gameplanColumns.map((col) => [...col])
    let shortest = 0
    for (let i = 1; i < cols.length; i++) {
      if (cols[i].length < cols[shortest].length) shortest = i
    }
    cols[shortest].push(tag)
    return { [gameplanColumnsKey]: columnsToDoc(cols) }
  }
  const removeFromGameplanColumns = (tag) => ({
    [gameplanColumnsKey]: columnsToDoc(gameplanColumns.map((col) => col.filter((t) => t !== tag))),
  })

  const togglePackage = (fid) => {
    if (isViewOnly || !currentDynasty) return
    const adding = !packageSet.has(fid)
    const nextPackageIds = adding ? [...packageIds, fid] : packageIds.filter((id) => id !== fid)
    const tag = `formation:${fid}`
    updateDynasty(currentDynasty.id, buildSchemeBuilderPatch({
      [packageKey]: nextPackageIds,
      ...(adding ? addToGameplanColumns(tag) : removeFromGameplanColumns(tag)),
    }))
  }

  // Blank template, same as addDivider — dropped straight onto the board
  // with an empty name, edited in place from there (typed into the
  // always-on name field, formations/plays added via its own search).
  const addCategory = () => {
    if (isViewOnly || !currentDynasty) return
    const newCat = { id: crypto.randomUUID(), name: '', formationIds: [], playIds: [] }
    updateDynasty(currentDynasty.id, buildSchemeBuilderPatch({
      [situationalCategoriesKey]: [...situationalCategories, newCat],
      ...addToGameplanColumns(`category:${newCat.id}`),
    }))
  }
  const removeCategory = (catId) => {
    if (isViewOnly || !currentDynasty) return
    updateDynasty(currentDynasty.id, buildSchemeBuilderPatch({
      [situationalCategoriesKey]: situationalCategories.filter((c) => c.id !== catId),
      ...removeFromGameplanColumns(`category:${catId}`),
    }))
  }

  const addDivider = () => {
    if (isViewOnly || !currentDynasty) return
    const newDiv = { id: crypto.randomUUID(), title: '' }
    updateDynasty(currentDynasty.id, buildSchemeBuilderPatch({
      [gameplanDividersKey]: [...gameplanDividers, newDiv],
      ...addToGameplanColumns(`divider:${newDiv.id}`),
    }))
  }
  const removeDivider = (divId) => {
    if (isViewOnly || !currentDynasty) return
    updateDynasty(currentDynasty.id, buildSchemeBuilderPatch({
      [gameplanDividersKey]: gameplanDividers.filter((d) => d.id !== divId),
      ...removeFromGameplanColumns(`divider:${divId}`),
    }))
  }

  // Deselects when re-picking the current playbook (toggle), used by the
  // scheme-scoped picker buttons where the scheme is already known to match.
  // Clearing the package alongside the playbook is deliberate: a package is
  // "the formations I built out of THIS playbook" — carrying it over to a
  // deselected (or different) playbook made the next pick look like it
  // already had formations selected, when really it was leftover from the
  // old one (formation ids can collide across playbooks since they're just
  // set_name::formation_name, not playbook-scoped).
  const selectPlaybook = (teamId) => {
    if (isViewOnly || !currentDynasty) return
    const next = teamId === selectedPlaybookTeamId ? undefined : teamId
    updateDynasty(currentDynasty.id, buildSchemeBuilderPatch({ [playbookKey]: next, [packageKey]: undefined }))
    setQuery('')
    setPlaybookSearch('')
  }

  // Jumps straight to a specific playbook found via search, regardless of
  // which scheme (if any) is currently selected — syncing the scheme to
  // match so the rest of the page (rationale, fit scoring) stays consistent.
  const selectPlaybookDirect = (teamId, scheme) => {
    if (isViewOnly || !currentDynasty) return
    const updates = buildSchemeBuilderPatch({ [playbookKey]: teamId, [packageKey]: undefined })
    if (scheme && scheme !== selectedScheme) updates[schemeField] = scheme
    updateDynasty(currentDynasty.id, updates)
    setPlaybookSearch('')
    setQuery('')
  }

  const deselectPlaybook = () => selectPlaybook(selectedPlaybookTeamId)

  const sideFormations = useMemo(() => formationsData.filter((f) => f.side === side), [side])

  const officialTeamId = selectedScheme ? schemeTeamIdsData[side]?.[selectedScheme] : null
  const runningTeams = useMemo(
    () => (selectedScheme
      ? teamsData.filter((t) => t[side === 'offense' ? 'offensiveScheme' : 'defensiveScheme'] === selectedScheme)
      : []),
    [selectedScheme, side],
  )
  const playbookLabel = !selectedPlaybookTeamId ? null
    : selectedPlaybookTeamId === officialTeamId ? `Official ${selectedScheme} playbook`
    : (teamsData.find((t) => t.id === selectedPlaybookTeamId)?.name || 'Selected playbook')

  // Every playbook for this side (real teams + scheme templates), for the
  // "search for a specific playbook" shortcut — not scoped to whichever
  // scheme happens to be selected, so you can jump straight to a team you
  // already know regardless of what's currently picked.
  const allPlaybooksForSide = useMemo(() => {
    const field = side === 'offense' ? 'offensiveScheme' : 'defensiveScheme'
    const real = teamsData
      .filter((t) => t[field])
      .map((t) => ({ id: t.id, name: t.name, scheme: t[field] }))
    const templates = Object.entries(schemeTeamIdsData[side] || {})
      .map(([scheme, id]) => ({ id, name: `Official ${scheme} playbook`, scheme }))
    return [...real, ...templates].sort((a, b) => a.name.localeCompare(b.name))
  }, [side])

  const playbookSearchResults = useMemo(() => {
    const q = playbookSearch.trim().toLowerCase()
    if (!q) return []
    return allPlaybooksForSide.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 15)
  }, [allPlaybooksForSide, playbookSearch])

  // Real per-playbook run/pass/RPO/motion/option/personnel tendency, sourced
  // from playbookgamer.com. Defense tendency only exists for the 30 generic
  // scheme templates (real teams don't have customized defensive playbooks
  // in the underlying game data), so this is null for most defense picks.
  const playbookTendency = selectedPlaybookTeamId ? (playbookTendencyData[side]?.[selectedPlaybookTeamId] || null) : null

  // The chosen playbook's own formation list (with how many plays it runs
  // out of each) — loaded once per playbook selection. This is the pool
  // scoredFormations below narrows to: you build your 4-8 base formations
  // from what's actually IN the playbook you picked, not the full 554-
  // formation catalog. `null` = no playbook selected yet or still loading.
  const [playbookFormationCounts, setPlaybookFormationCounts] = useState(null)
  useEffect(() => {
    if (!selectedPlaybookTeamId) { setPlaybookFormationCounts(null); return undefined }
    let cancelled = false
    setPlaybookFormationCounts(null)
    loadPlaybookFormationCounts(selectedPlaybookTeamId, side).then((counts) => {
      if (!cancelled) setPlaybookFormationCounts(counts)
    })
    return () => { cancelled = true }
  }, [selectedPlaybookTeamId, side])

  // Playbook-level fit scores for every candidate shown in "Choose a
  // Playbook" (Official + real teams running this scheme) — a real team's
  // specific personnel usage can differ from a generic scheme template even
  // though they share a scheme, so this scores each candidate individually
  // rather than reusing the scheme-level score. Driven entirely by the
  // already-loaded playbookTendencyData (no per-candidate formation-file
  // fetch needed — see scorePlaybookFit), so this is synchronous.
  const playbookScores = useMemo(() => {
    if (!selectedScheme) return {}
    const candidateIds = [officialTeamId, ...runningTeams.map((t) => t.id)].filter((id) => id != null)
    const out = {}
    for (const id of candidateIds) {
      const tendency = playbookTendencyData[side]?.[id] || null
      out[id] = scorePlaybookFit(board, side, selectedScheme, tendency)
    }
    return out
  }, [selectedScheme, side, officialTeamId, runningTeams, board])

  // Best-fitting playbooks first; a candidate scorePlaybookFit couldn't
  // score at all (null — no starters at any of its slots) sinks to the
  // bottom rather than sorting arbitrarily.
  const rankedRunningTeams = useMemo(
    () => [...runningTeams].sort((a, b) => (playbookScores[b.id]?.score ?? -1) - (playbookScores[a.id]?.score ?? -1)),
    [runningTeams, playbookScores],
  )

  const scoredFormations = useMemo(() => {
    if (!playbookFormationCounts) return []
    let rows = sideFormations.filter((f) => playbookFormationCounts.has(formationId(f)))
    if (query.trim()) {
      const q = query.trim().toLowerCase()
      rows = rows.filter((f) => f.formation_name.toLowerCase().includes(q) || f.set_name.toLowerCase().includes(q))
    }
    return rows
      .map((f) => {
        const id = formationId(f)
        const cacheKey = `${side}/${slugSet(f.set_name)}`
        const setPlays = setPlaysCache[cacheKey]
        const plays = setPlays ? setPlays.filter((p) => p.formation === f.formation_name) : undefined
        return {
          ...f,
          id,
          isSelected: packageSet.has(id),
          playbookPlayCount: playbookFormationCounts.get(id) || 0,
          personnelInfo: personnelLabel(f),
          fit: scoreFormationFit(board, f, side, selectedScheme, plays),
        }
      })
      .sort((a, b) => {
        if (a.isSelected !== b.isSelected) return a.isSelected ? -1 : 1
        return b.fit.score - a.fit.score
      })
  }, [sideFormations, query, playbookFormationCounts, board, side, selectedScheme, packageSet, setPlaysCache])

  // One-click convenience: fill the package with the top N formations from
  // the currently narrowed (playbook-scoped) list, ranked by fit — the
  // "build around fit recommendations" shortcut. Manual add/remove below
  // still works the same for hand-picking instead.
  const quickFillTopByFit = (count = 6) => {
    if (isViewOnly) return
    const top = scoredFormations.filter((f) => !f.isSelected).slice(0, count).map((f) => f.id)
    setPackageIds([...new Set([...packageIds, ...top])])
  }

  const selectedFormationObjs = useMemo(
    () => sideFormations.filter((f) => packageSet.has(formationId(f))),
    [sideFormations, packageSet],
  )

  // Game View's full list: every formation in the SELECTED PLAYBOOK (not
  // narrowed by the Stage 3 search box, unlike scoredFormations). Order here
  // is just catalog order — Game View itself derives "Your Base Package"'s
  // order from packageIds (user-reorderable) and treats everything else as
  // "Rest of the Playbook". Carries the same scoreFormationFit score shown
  // in Build mode's Stage 3, plus (once loaded) that formation's own real
  // play list, so its score reflects real play-library depth/variety
  // instead of tying with every other formation that shares its personnel
  // grouping — depends on setPlaysCache so scores recompute the moment
  // each set's plays finish loading (see the fetch effect just below).
  const gameViewFormations = useMemo(() => {
    if (!playbookFormationCounts) return []
    return sideFormations
      .filter((f) => playbookFormationCounts.has(formationId(f)))
      .map((f) => {
        const id = formationId(f)
        const cacheKey = `${side}/${slugSet(f.set_name)}`
        const setPlays = setPlaysCache[cacheKey]
        const plays = setPlays ? setPlays.filter((p) => p.formation === f.formation_name) : undefined
        return {
          ...f,
          id,
          isSelected: packageSet.has(id),
          playbookPlayCount: playbookFormationCounts.get(id) || 0,
          fit: scoreFormationFit(board, f, side, selectedScheme, plays),
          personnelInfo: personnelLabel(f),
        }
      })
  }, [sideFormations, playbookFormationCounts, packageSet, board, side, selectedScheme, setPlaysCache])

  // Lazily fetch every formation-in-playbook's set-level play file once a
  // playbook is selected, regardless of mode — Build mode's Stage 3 scores
  // and Game View both fold real play-library data into scoreFormationFit,
  // so both need it loaded, not just Game View. Cache the raw set (not
  // per-formation) so multiple formations sharing a set (e.g. two
  // different Gun looks) only fetch it once.
  useEffect(() => {
    gameViewFormations.forEach((f) => {
      const cacheKey = `${side}/${slugSet(f.set_name)}`
      if (setPlaysCache[cacheKey]) return
      const path = `../../data/playbookData/plays/${side}/${slugSet(f.set_name)}.json`
      const loader = playsLoaders[path]
      if (!loader) return
      loader().then((mod) => {
        setSetPlaysCache((prev) => (prev[cacheKey] ? prev : { ...prev, [cacheKey]: mod.default || mod }))
      })
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, side, gameViewFormations])

  const playsForFormation = (f) => {
    const cacheKey = `${side}/${slugSet(f.set_name)}`
    const rows = setPlaysCache[cacheKey]
    if (!rows) return null
    return rows.filter((p) => p.formation === f.formation_name)
  }

  // Flat playId -> {play, formation} index over every formation in the
  // current playbook — lets a situational category store bare play ids
  // (added directly via its search box, independent of the play's own
  // formation being in the package) and still render/look them up.
  const playIndex = useMemo(() => {
    const map = new Map()
    for (const f of gameViewFormations) {
      const plays = playsForFormation(f)
      if (!plays) continue
      for (const p of plays) map.set(p.id, { play: p, formation: f })
    }
    return map
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameViewFormations, setPlaysCache])

  if (!currentDynasty) return null

  if (!isCfb27) {
    const isPc = isPcAutoDynasty(currentDynasty)
    return (
      <div className="max-w-3xl mx-auto px-4 py-10">
        <EmptyState
          title={isPc ? 'Scheme Builder has been retired' : 'Scheme Builder is CFB 27 only'}
          message={isPc
            ? 'Scheme Builder is no longer available for PC dynasties.'
            : "This dynasty is on an earlier game edition. Scheme Builder's formation and play data is sourced from CFB 27 and isn't available for other editions."}
        />
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <PageHero
        title="Scheme Builder"
        eyebrow={team?.name ? `${team.name} — ${year}` : String(year)}
        tabs={[{ key: 'offense', label: 'Offense' }, { key: 'defense', label: 'Defense' }]}
        activeTab={side}
        onTabChange={setSide}
        right={
          <div className="flex gap-2">
            <Button variant={mode === 'build' ? 'primary' : 'outline'} accentColor={teamColors.primary} size="sm" onClick={() => setMode('build')}>
              Build
            </Button>
            <Button variant={mode === 'archetypes' ? 'primary' : 'outline'} accentColor={teamColors.primary} size="sm" onClick={() => setMode('archetypes')}>
              Archetypes
            </Button>
            <Button variant={mode === 'game' ? 'primary' : 'outline'} accentColor={teamColors.primary} size="sm" onClick={() => setMode('game')}>
              Gameplan
            </Button>
          </div>
        }
      />

      {mode === 'build' && (
        <BuildMode
          side={side}
          schemeRankings={schemeRankings}
          selectedScheme={selectedScheme}
          onSelectScheme={selectScheme}
          runningTeams={rankedRunningTeams}
          officialTeamId={officialTeamId}
          playbookScores={playbookScores}
          selectedPlaybookTeamId={selectedPlaybookTeamId}
          playbookLabel={playbookLabel}
          playbookTendency={playbookTendency}
          onSelectPlaybook={selectPlaybook}
          onDeselectPlaybook={deselectPlaybook}
          playbookSearch={playbookSearch}
          onPlaybookSearchChange={setPlaybookSearch}
          playbookSearchResults={playbookSearchResults}
          onSelectPlaybookDirect={selectPlaybookDirect}
          playbookLoaded={!!playbookFormationCounts}
          scoredFormations={scoredFormations}
          query={query}
          onQueryChange={setQuery}
          onTogglePackage={togglePackage}
          onQuickFill={quickFillTopByFit}
          packageCount={packageIds.length}
          teamColors={teamColors}
          accentText={accentText}
          isViewOnly={isViewOnly}
        />
      )}

      {mode === 'archetypes' && (
        <ArchetypesMode
          side={side}
          players={players}
          board={board}
          currentDynasty={currentDynasty}
          updatePlayer={updatePlayer}
          isViewOnly={isViewOnly}
          roleAssignments={roleAssignments}
          onAssignRole={assignRole}
        />
      )}

      {mode === 'game' && (
        <GameViewMode
          side={side}
          gameViewFormations={gameViewFormations}
          playsForFormation={playsForFormation}
          playIndex={playIndex}
          packageIds={packageIds}
          onTogglePackage={togglePackage}
          packageColors={packageColors}
          onSetPackageColor={setPackageColor}
          onResetPackageColor={resetPackageColor}
          favoritePlaySet={favoritePlaySet}
          onToggleFavoritePlay={toggleFavoritePlay}
          situationalCategories={situationalCategories}
          onAddCategory={addCategory}
          onRemoveCategory={removeCategory}
          gameplanColumns={gameplanColumns}
          onReorderGameplanColumns={reorderGameplanColumns}
          onAddFormationToCategory={addFormationToCategory}
          onRemoveFormationFromCategory={removeFormationFromCategory}
          onAddPlayToCategory={addPlayToCategory}
          onRemovePlayFromCategory={removePlayFromCategory}
          onSetCategoryColor={setCategoryColor}
          onResetCategoryColor={resetCategoryColor}
          onRenameCategory={renameCategory}
          gameplanDividers={gameplanDividers}
          onAddDivider={addDivider}
          onRemoveDivider={removeDivider}
          onRenameDivider={renameDivider}
          onSetDividerColor={setDividerColor}
          onResetDividerColor={resetDividerColor}
          teamColors={teamColors}
          isViewOnly={isViewOnly}
          onSwitchToBuild={() => setMode('build')}
        />
      )}
    </div>
  )
}

function BuildMode({
  side, schemeRankings, selectedScheme, onSelectScheme, runningTeams, officialTeamId, playbookScores,
  selectedPlaybookTeamId, playbookLabel, playbookTendency, onSelectPlaybook, onDeselectPlaybook,
  playbookSearch, onPlaybookSearchChange, playbookSearchResults, onSelectPlaybookDirect, playbookLoaded,
  scoredFormations, query, onQueryChange, onTogglePackage, onQuickFill,
  packageCount, teamColors, accentText, isViewOnly,
}) {
  const [showAllSchemes, setShowAllSchemes] = useState(false)
  const [showAllTeams, setShowAllTeams] = useState(false)
  const visibleSchemes = showAllSchemes ? schemeRankings : schemeRankings.slice(0, 6)
  const visibleTeams = showAllTeams ? runningTeams : runningTeams.slice(0, 8)

  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-sm font-bold uppercase tracking-wide text-txt-secondary mb-3">
          Recommended {side === 'offense' ? 'Offense' : 'Defense'} Schemes
        </h2>
        {schemeRankings[0]?.sampleSize === 0 && (
          <p className="text-xs text-txt-tertiary mb-3">
            No archetypes are set for your starters yet, so schemes can't be ranked by fit. Set player archetypes on the roster to unlock recommendations, or just pick a scheme below.
          </p>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {visibleSchemes.map((r) => {
            const active = r.scheme === selectedScheme
            return (
              <Card
                key={r.scheme}
                variant={active ? 'elevated' : 'bordered'}
                interactive
                onClick={() => !isViewOnly && onSelectScheme(r.scheme)}
                style={active ? { borderColor: teamColors.primary } : undefined}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="font-semibold text-sm text-txt-primary">{r.scheme}</div>
                  <Badge variant={r.score >= 65 ? 'success' : r.score >= 40 ? 'default' : 'outline'}>{r.score.toFixed(1)}</Badge>
                </div>
                {r.rationale && <div className="mt-1.5 text-xs text-txt-tertiary">{r.rationale}</div>}
                <div className="mt-2">
                  <BreakdownToggle breakdown={r.breakdown} stop />
                </div>
              </Card>
            )
          })}
        </div>
        {schemeRankings.length > 6 && (
          <button
            type="button"
            className="mt-3 text-xs font-semibold text-txt-secondary hover:text-txt-primary"
            onClick={() => setShowAllSchemes((v) => !v)}
          >
            {showAllSchemes ? 'Show top 6 only' : `Show all ${schemeRankings.length} schemes`}
          </button>
        )}
      </section>

      <section>
        <h2 className="text-sm font-bold uppercase tracking-wide text-txt-secondary mb-1">
          Search for a Specific Playbook
        </h2>
        <p className="text-xs text-txt-tertiary mb-3">
          Already know who you want to build from? Search any real team or official scheme playbook directly — picking one here sets the matching scheme automatically.
        </p>
        <Input
          value={playbookSearch}
          onChange={(e) => onPlaybookSearchChange(e.target.value)}
          placeholder="Search playbooks (e.g. Alabama, Air Raid)..."
          className="max-w-sm mb-2"
        />
        {playbookSearch.trim() && (
          playbookSearchResults.length ? (
            <div className="flex flex-wrap gap-2">
              {playbookSearchResults.map((p) => {
                const active = p.id === selectedPlaybookTeamId
                return (
                  <Button
                    key={p.id}
                    variant={active ? 'primary' : 'outline'}
                    accentColor={active ? teamColors.primary : undefined}
                    size="sm"
                    disabled={isViewOnly}
                    onClick={() => (active ? onDeselectPlaybook() : onSelectPlaybookDirect(p.id, p.scheme))}
                  >
                    {p.name} <span className={active ? 'ml-1' : 'text-txt-tertiary ml-1'}>({p.scheme})</span>
                  </Button>
                )
              })}
            </div>
          ) : (
            <p className="text-xs text-txt-tertiary">No playbooks match "{playbookSearch}".</p>
          )
        )}
      </section>

      {selectedScheme && (
        <section>
          <h2 className="text-sm font-bold uppercase tracking-wide text-txt-secondary mb-1">
            Choose a {selectedScheme} Playbook
          </h2>
          <p className="text-xs text-txt-tertiary mb-3">
            Pick one real playbook to build from — your base package comes from that playbook's actual formations, scored against your roster. The one you're on is highlighted in your team color; click it again to deselect. Each playbook's own score reflects how well your personnel fits ITS specific formation mix, not just the scheme in general.
          </p>

          <div className="flex flex-wrap items-start gap-2 mb-3">
            {officialTeamId ? (
              <div className="flex flex-col items-start gap-1">
                <Button
                  variant={selectedPlaybookTeamId === officialTeamId ? 'primary' : 'outline'}
                  size="sm"
                  accentColor={selectedPlaybookTeamId === officialTeamId ? teamColors.primary : undefined}
                  disabled={isViewOnly}
                  onClick={() => onSelectPlaybook(officialTeamId)}
                >
                  Official {selectedScheme} playbook
                  <PlaybookScoreBadge score={playbookScores[officialTeamId]?.score} />
                </Button>
                {playbookScores[officialTeamId] && <BreakdownToggle breakdown={playbookScores[officialTeamId].breakdown} />}
              </div>
            ) : (
              <span className="text-xs text-txt-tertiary">No official default playbook found for {selectedScheme}.</span>
            )}
          </div>

          {runningTeams.length > 0 && (
            <div>
              <div className="text-xs text-txt-tertiary mb-1">Real teams running {selectedScheme} ({runningTeams.length}), best fit first:</div>
              <div className="flex flex-wrap items-start gap-2">
                {visibleTeams.map((t) => {
                  const active = t.id === selectedPlaybookTeamId
                  return (
                    <div key={t.id} className="flex flex-col items-start gap-1">
                      <Button
                        variant={active ? 'primary' : 'outline'}
                        accentColor={active ? teamColors.primary : undefined}
                        size="sm"
                        onClick={() => !isViewOnly && onSelectPlaybook(t.id)}
                        disabled={isViewOnly}
                      >
                        {t.name}
                        <PlaybookScoreBadge score={playbookScores[t.id]?.score} />
                      </Button>
                      {playbookScores[t.id] && <BreakdownToggle breakdown={playbookScores[t.id].breakdown} />}
                    </div>
                  )
                })}
                {runningTeams.length > 8 && (
                  <button
                    type="button"
                    className="text-xs font-semibold text-txt-secondary hover:text-txt-primary px-2"
                    onClick={() => setShowAllTeams((v) => !v)}
                  >
                    {showAllTeams ? 'Show fewer' : `+${runningTeams.length - 8} more`}
                  </button>
                )}
              </div>
            </div>
          )}
        </section>
      )}

      {selectedScheme && selectedPlaybookTeamId && (
        <section>
          <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
            <h2 className="text-sm font-bold uppercase tracking-wide text-txt-secondary">
              Base Package — {playbookLabel} ({packageCount} selected)
            </h2>
            <div className="flex items-center gap-2">
              <Input
                value={query}
                onChange={(e) => onQueryChange(e.target.value)}
                placeholder="Search this playbook..."
                className="max-w-xs"
              />
              <Button variant="outline" size="sm" disabled={isViewOnly} onClick={onDeselectPlaybook}>
                Deselect playbook
              </Button>
            </div>
          </div>

          <PlaybookIdentityPanel side={side} tendency={playbookTendency} playbookLabel={playbookLabel} />

          {!playbookLoaded ? (
            <p className="text-xs text-txt-tertiary">Loading playbook...</p>
          ) : !scoredFormations.length ? (
            <EmptyState variant="compact" title="No formations found" message="This playbook doesn't carry any formations for this side, or your search didn't match anything." />
          ) : (
            <>
              <div className="mb-3">
                <Button variant="outline" size="sm" disabled={isViewOnly} onClick={() => onQuickFill(6)}>
                  Quick-fill top 6 by fit
                </Button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {scoredFormations.map((f) => (
                  <Card key={f.id} variant={f.isSelected ? 'elevated' : 'bordered'} padding="sm" style={f.isSelected ? { borderColor: teamColors.primary } : undefined}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-txt-primary truncate">{f.formation_name}</div>
                        <div className="text-xs text-txt-tertiary">
                          {f.set_name} · {f.playbookPlayCount} plays in this playbook
                        </div>
                        <div className="text-xs text-txt-tertiary mt-0.5">
                          {f.personnelInfo.text}{f.personnelInfo.isEstimate ? ' (est.)' : ''}
                          {f.fit.avgOvr != null ? ` · ${f.fit.avgOvr} OVR personnel` : ''}
                        </div>
                      </div>
                      <Badge variant={f.fit.score >= 70 ? 'success' : f.fit.score >= 40 ? 'default' : 'outline'}>{f.fit.score.toFixed(2)}</Badge>
                    </div>
                    <BreakdownToggle breakdown={f.fit.breakdown} />
                    <Button
                      className="mt-2 w-full"
                      size="sm"
                      variant={f.isSelected ? 'primary' : 'outline'}
                      accentColor={f.isSelected ? teamColors.primary : undefined}
                      disabled={isViewOnly}
                      onClick={() => onTogglePackage(f.id)}
                    >
                      {f.isSelected ? 'Remove from package' : 'Add to package'}
                    </Button>
                  </Card>
                ))}
              </div>
            </>
          )}
        </section>
      )}
    </div>
  )
}

// "var" is playbookgamer.com's own catch-all bucket for formations whose
// personnel doesn't fit a clean 2-digit code — shown as "Multiple" rather
// than the raw label since it isn't a real personnel grouping.
const PERSONNEL_CODE_LABELS = { var: 'Multiple' }

// Real run/pass/RPO/motion/option/personnel-mix identity for the selected
// playbook (sourced from playbookgamer.com). Defense tendency only exists
// for the 30 generic scheme templates — real teams don't have customized
// defensive playbooks in the underlying game data — so this renders a short
// note instead of stats when picking a real team's defense.
function PlaybookIdentityPanel({ side, tendency, playbookLabel }) {
  if (!tendency) {
    if (side === 'offense') return null
    return (
      <p className="text-xs text-txt-tertiary mb-3">
        No tendency data available for {playbookLabel}'s defense — only the official scheme playbooks have tendency stats.
      </p>
    )
  }

  const pct = (n) => (tendency.total ? Math.round((n / tendency.total) * 100) : 0)

  if (side === 'offense') {
    const topPersonnel = tendency.personnel
      ? Object.entries(tendency.personnel).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 4)
      : []
    return (
      <Card variant="bordered" padding="sm" className="mb-3">
        <div className="text-xs font-bold uppercase tracking-wide text-txt-tertiary mb-2">Playbook Identity</div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-txt-secondary">
          <span>{pct(tendency.run)}% Run</span>
          <span>{pct(tendency.pass)}% Pass</span>
          <span>{pct(tendency.rpo)}% RPO</span>
          <span>{pct(tendency.motion)}% Motion</span>
          <span>{pct(tendency.option)}% Option</span>
          <span>{pct(tendency.qbRun)}% QB Run</span>
        </div>
        {topPersonnel.length > 0 && (
          <div className="mt-1.5 text-xs text-txt-tertiary">
            Most-used personnel: {topPersonnel.map(([code, count]) => `${PERSONNEL_CODE_LABELS[code] || code} (${count})`).join(', ')}
          </div>
        )}
      </Card>
    )
  }

  return (
    <Card variant="bordered" padding="sm" className="mb-3">
      <div className="text-xs font-bold uppercase tracking-wide text-txt-tertiary mb-2">Playbook Identity</div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-txt-secondary">
        <span>{pct(tendency.zone)}% Zone</span>
        <span>{pct(tendency.blitz)}% Blitz</span>
        <span>{pct(tendency.man)}% Man</span>
        <span>{pct(tendency.match)}% Match</span>
      </div>
    </Card>
  )
}

// Default rows for the Archetypes editor: starters at each base position,
// plus the "necessary extra" roles that carry a genuinely different job on
// the field (change-of-pace back, slot receiver, 2nd TE, rotational DT,
// nickel corner) — not full 2-deep depth at every spot. `groupRank` picks
// which player within the position pool defaults into that row (0 = best by
// OVR, 1 = next-best, 2 = third-best); the picker lets the user swap in
// anyone else in that pool regardless. Mirrored L/R pairs (LT/RT, LG/RG,
// LE/RE, SAM/WILL, FS/SS) intentionally share one combined pool — same
// `positions` array — since either side's player is a reasonable fit for
// either spot; give both entries the identical array so they hit the same
// pooled/cached list.
const LT_RT_POS = ['LT', 'RT']
const LG_RG_POS = ['LG', 'RG']
const EDGE_POS = ['LEDG', 'LE', 'REDG', 'RE', 'EDGE', 'DE']
const SAM_WILL_POS = ['SAM', 'WILL', 'OLB']
const FS_SS_POS = ['FS', 'SS']
// Nickel is a real hybrid role — plenty of real defenses play a safety
// there instead of a true 3rd corner — so the switch pool includes both,
// not just CB.
const NICKEL_POS = ['CB', 'FS', 'SS']

const ROLE_SLOTS = {
  offense: [
    { id: 'QB', label: 'QB', positions: ['QB'] },
    { id: 'HB', label: 'HB', positions: ['HB', 'RB'] },
    { id: 'HB2', label: 'HB2', positions: ['HB', 'RB'], groupRank: 1 },
    { id: 'FB', label: 'FB', positions: ['FB'] },
    { id: 'WR', label: 'WR', positions: ['WR'] },
    { id: 'WR2', label: 'WR2', positions: ['WR'], groupRank: 1 },
    { id: 'WR3', label: 'WR3', positions: ['WR'], groupRank: 2 },
    { id: 'SLWR', label: 'Slot WR', positions: ['WR'], groupRank: 3 },
    { id: 'TE', label: 'TE', positions: ['TE'] },
    { id: 'TE2', label: 'TE2', positions: ['TE'], groupRank: 1 },
    { id: 'LT', label: 'LT', positions: LT_RT_POS },
    { id: 'LG', label: 'LG', positions: LG_RG_POS },
    { id: 'C', label: 'C', positions: ['C'] },
    { id: 'RG', label: 'RG', positions: LG_RG_POS, groupRank: 1 },
    { id: 'RT', label: 'RT', positions: LT_RT_POS, groupRank: 1 },
  ],
  defense: [
    { id: 'LEDG', label: 'LE', positions: EDGE_POS },
    { id: 'DT', label: 'DT', positions: ['DT', 'NT'] },
    { id: 'DT2', label: 'DT2', positions: ['DT', 'NT'], groupRank: 1 },
    { id: 'DT3', label: 'DT3', positions: ['DT', 'NT'], groupRank: 2 },
    { id: 'REDG', label: 'RE', positions: EDGE_POS, groupRank: 1 },
    { id: 'SAM', label: 'SAM', positions: SAM_WILL_POS },
    { id: 'MIKE', label: 'MIKE', positions: ['MIKE'] },
    { id: 'WILL', label: 'WILL', positions: SAM_WILL_POS, groupRank: 1 },
    { id: 'CB', label: 'CB', positions: ['CB'] },
    { id: 'CB2', label: 'CB2', positions: ['CB'], groupRank: 1 },
    { id: 'NB', label: 'Nickel', positions: NICKEL_POS, groupRank: 2 },
    { id: 'FS', label: 'FS', positions: FS_SS_POS },
    { id: 'SS', label: 'SS', positions: FS_SS_POS, groupRank: 1 },
  ],
}

function ArchetypesMode({ side, players, board, currentDynasty, updatePlayer, isViewOnly, roleAssignments, onAssignRole }) {
  const roleSlots = ROLE_SLOTS[side]

  // The board (same one Build mode scores against) knows the real depth
  // chart's starter for every slot id, including the extras (HB2, TE2,
  // DT2, NB, ...). Prefer that as each row's default so the player shown/
  // edited here is the exact one whose archetype feeds the scheme
  // recommendation, falling back to the OVR-ranked pool only when the board
  // has a hole (no rostered player) at that slot.
  const boardStarterFor = (slotId) => (board?.slots || []).find((sl) => sl.id === slotId)?.starter || null

  // Real rostered players only (not incoming-recruit projections, which have
  // no stable player record yet), pooled once per distinct position group
  // and ranked by OVR so every row for that group shares the same list.
  const pools = useMemo(() => {
    const byKey = new Map()
    for (const slot of roleSlots) {
      const key = slot.positions.join(',')
      if (byKey.has(key)) continue
      byKey.set(key, players
        .filter((p) => p.player && p.pid != null && slot.positions.includes(p.position))
        .sort((a, b) => (b.projectedOvr ?? -1) - (a.projectedOvr ?? -1)))
    }
    return byKey
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [players, side])

  const setArchetype = (entry, archetype) => {
    if (isViewOnly || !currentDynasty || !entry) return
    updatePlayer(currentDynasty.id, { ...entry.player, archetype })
  }

  // Which player is assigned to each row comes straight from the dynasty
  // (roleAssignments), not local component state — a switch away from the
  // depth-chart default is a real, persisted decision, so it survives a
  // reload instead of silently reverting (which looked like the archetype
  // you'd just set on that player "didn't save").
  const rows = roleSlots.map((slot) => {
    const pool = pools.get(slot.positions.join(',')) || []
    const defaultIdx = Math.min(slot.groupRank || 0, Math.max(pool.length - 1, 0))
    const defaultEntry = boardStarterFor(slot.id) || pool[defaultIdx] || null
    const assignedPid = roleAssignments?.[slot.id]
    // pid is a number on the player record but always a string coming back
    // from a <select>'s onChange — compare as strings so a switch actually
    // matches.
    const entry = (assignedPid && pool.find((p) => String(p.pid) === String(assignedPid))) || defaultEntry
    return { slot, pool, entry }
  })

  if (!rows.some((r) => r.entry)) {
    return <EmptyState title="No players found" message={`No rostered ${side} players for this team/year.`} />
  }

  return (
    <section>
      <h2 className="text-sm font-bold uppercase tracking-wide text-txt-secondary mb-1">
        {side === 'offense' ? 'Offense' : 'Defense'} Player Archetypes
      </h2>
      <p className="text-xs text-txt-tertiary mb-3">
        Starters plus the key extra roles ({side === 'offense' ? 'WR2, HB2, Slot WR, TE2' : 'DT2, CB2, Nickel'}) by default — pick a different player from the dropdown if you'd rather set someone else's archetype. Writes the same <code>archetype</code> field used everywhere else in the app.
      </p>
      <div className="space-y-1">
        {rows.map(({ slot, pool, entry }) => {
          const options = entry ? archetypesForPosition(entry.position) : []
          const current = entry?.player?.archetype || ''
          return (
            <Card key={slot.id} variant="bordered" padding="sm">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0 flex items-center gap-2">
                  <Badge variant="outline">{slot.label}</Badge>
                  {pool.length > 1 ? (
                    <Select
                      size="sm"
                      value={entry?.pid || ''}
                      disabled={isViewOnly}
                      onChange={(e) => onAssignRole(slot.id, e.target.value)}
                      className="max-w-[240px]"
                    >
                      {pool.map((p) => (
                        <option key={p.pid} value={p.pid}>
                          {p.name} ({Number.isFinite(p.projectedOvr) ? `${p.projectedOvr} OVR` : '?'})
                        </option>
                      ))}
                    </Select>
                  ) : entry ? (
                    <span className="text-sm font-semibold text-txt-primary truncate">
                      {entry.name}{Number.isFinite(entry.projectedOvr) ? ` (${entry.projectedOvr} OVR)` : ''}
                    </span>
                  ) : (
                    <span className="text-xs text-txt-tertiary">No {slot.label} on roster</span>
                  )}
                </div>
                {entry && (options.length ? (
                  <Select
                    size="sm"
                    value={current}
                    disabled={isViewOnly}
                    onChange={(e) => setArchetype(entry, e.target.value)}
                    className="max-w-[220px]"
                  >
                    <option value="">No archetype set</option>
                    {options.map((a) => (
                      <option key={a} value={a}>{a}</option>
                    ))}
                  </Select>
                ) : (
                  <span className="text-xs text-txt-tertiary">No archetype options for {entry.position}</span>
                ))}
              </div>
            </Card>
          )
        })}
      </div>
    </section>
  )
}

// The star toggle itself — an actual star icon (filled + team-colored when
// on, outlined otherwise), shared by in-formation play rows and the flat
// play rows situational categories render for bare (formation-less-looking)
// added plays.
function StarToggle({ isFavorite, onClick, teamColors, disabled }) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-label={isFavorite ? 'Unstar play' : 'Star play'}
      aria-pressed={isFavorite}
      className={`shrink-0 p-0.5 ${isFavorite ? '' : 'text-txt-tertiary hover:text-txt-primary'} ${disabled ? 'cursor-default' : ''}`}
      style={isFavorite ? { color: teamColors.primary } : undefined}
      onClick={onClick}
    >
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill={isFavorite ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={1.5}>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 3.5l2.6 5.6 6.1.7-4.5 4.2 1.2 6-5.4-3-5.4 3 1.2-6-4.5-4.2 6.1-.7z"
        />
      </svg>
    </button>
  )
}

// A single play row with a star toggle for Game View's favorite-play
// mechanism.
function PlayRow({ play, isFavorite, onToggleFavorite, teamColors, disabled }) {
  return (
    <li className="flex items-center justify-between gap-2">
      <span className="text-sm text-txt-primary truncate">{play.name}</span>
      <StarToggle isFavorite={isFavorite} teamColors={teamColors} disabled={disabled} onClick={() => !disabled && onToggleFavorite(play.id)} />
    </li>
  )
}

// The drag handle (three stacked bars, matching Sidebar's reorder-mode
// convention) for base-package cards — only rendered when a card is inside
// the reorderable "Your Base Package" grid.
function DragHandle({ attributes, listeners, colorStyle }) {
  return (
    <button
      type="button"
      {...attributes}
      {...listeners}
      aria-label="Drag to reorder"
      className="flex flex-col justify-center gap-[3px] shrink-0 px-1 py-1 -ml-1 rounded text-txt-tertiary hover:text-txt-primary cursor-grab active:cursor-grabbing"
      style={{ touchAction: 'none', ...colorStyle }}
    >
      <span className="block w-3.5 h-px bg-current" />
      <span className="block w-3.5 h-px bg-current" />
      <span className="block w-3.5 h-px bg-current" />
    </button>
  )
}

// One small pencil-icon toggle, shared by situational category and base
// package headers — clicking it reveals that box's rename input (if any)
// and color picker, keeping the header uncluttered until the user actually
// wants to edit something.
function EditIconButton({ onClick, active, colorStyle, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      className="shrink-0 p-0.5"
      style={colorStyle}
    >
      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path strokeLinecap="round" strokeLinejoin="round" d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5Z" />
      </svg>
    </button>
  )
}

// One formation's Game View card — starred plays surface directly under the
// header (visible without expanding anything), and the full play list
// (grouped by run/pass/rpo or blitz/man/zone/match) sits behind a collapsed
// text toggle so a formation with few stars stays compact. `headerActions`
// lets callers attach context-specific controls (add/remove package,
// remove from category) without this card needing to know which context
// it's in; `dragHandleProps` is only passed for reorderable base-package
// cards.
function FormationGameCard({
  f, plays, favoritePlaySet, onToggleFavoritePlay, groups, teamColors, isViewOnly, headerActions, dragHandleProps,
}) {
  const [expanded, setExpanded] = useState(false)
  const favorited = plays ? plays.filter((p) => favoritePlaySet.has(p.id)) : []
  return (
    <Card variant={f.isSelected ? 'elevated' : 'bordered'} padding="sm" style={f.isSelected ? { borderColor: teamColors.primary } : undefined}>
      <div className="mb-1.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            {dragHandleProps && <DragHandle {...dragHandleProps} />}
            <div className="display-md truncate" style={{ fontSize: '0.9375rem' }}>{f.set_name} - {f.formation_name}</div>
          </div>
          {f.fit && (
            <Badge variant={f.fit.score >= 70 ? 'success' : f.fit.score >= 40 ? 'default' : 'outline'} className="shrink-0">
              {f.fit.score.toFixed(2)}
            </Badge>
          )}
        </div>
        {f.personnelInfo && (
          <div className="text-xs text-txt-tertiary mt-0.5">
            {f.personnelInfo.text}{f.personnelInfo.isEstimate ? ' (est.)' : ''}
          </div>
        )}
        {headerActions?.length > 0 && (
          <div className="flex items-center gap-2.5 mt-1">
            {headerActions.map((a) => (
              <button
                key={a.key}
                type="button"
                disabled={isViewOnly}
                onClick={a.onClick}
                className="text-[10px] font-semibold uppercase tracking-wide text-txt-tertiary hover:text-txt-primary underline decoration-dotted underline-offset-2 disabled:cursor-default"
              >
                {a.label}
              </button>
            ))}
          </div>
        )}
        {f.fit && <BreakdownToggle breakdown={f.fit.breakdown} />}
      </div>
      {!plays ? (
        <div className="text-xs text-txt-tertiary">Loading plays...</div>
      ) : (
        <>
          {favorited.length > 0 && (
            <ul className="space-y-1 mb-2">
              {favorited.map((p) => (
                <PlayRow key={p.id} play={p} isFavorite teamColors={teamColors} onToggleFavorite={onToggleFavoritePlay} disabled={isViewOnly} />
              ))}
            </ul>
          )}
          <button
            type="button"
            className="text-[11px] font-semibold text-txt-tertiary hover:text-txt-primary underline decoration-dotted underline-offset-2"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? 'Hide plays' : `Show all plays (${plays.length})`}
          </button>
          {expanded && (
            <div className="space-y-3 mt-2">
              {groups.map(([type, label]) => {
                const rows = plays.filter((p) => p.type === type)
                if (!rows.length) return null
                return (
                  <div key={type}>
                    <div className="text-xs font-bold uppercase tracking-wide text-txt-tertiary mb-1">{label}</div>
                    <ul className="space-y-1">
                      {rows.map((p) => (
                        <PlayRow
                          key={p.id}
                          play={p}
                          isFavorite={favoritePlaySet.has(p.id)}
                          teamColors={teamColors}
                          onToggleFavorite={onToggleFavoritePlay}
                          disabled={isViewOnly}
                        />
                      ))}
                    </ul>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}
    </Card>
  )
}

// A base-package formation, styled to match the situational categories —
// a colored header band (same per-id color cycle as categoryColor) over a
// dense, always-expanded two-column play list — so "Your Base Package"
// reads as the same call-sheet language instead of a boxed-in card style
// with a collapsed play list. No per-play remove here (nothing to remove
// from a formation's own play list); the header's action is the
// add/remove-from-package toggle instead.
function PackageFormationCard({
  f, plays, favoritePlaySet, onToggleFavoritePlay, teamColors, isViewOnly, dragHandleProps, onTogglePackage, side,
  color, onSetColor, onResetColor,
}) {
  const [expanded, setExpanded] = useState(false)
  const [editing, setEditing] = useState(false)
  const rows = plays || []
  const favorited = rows.filter((p) => favoritePlaySet.has(p.id))
  const half = Math.ceil(rows.length / 2)
  const col1 = rows.slice(0, half)
  const col2 = rows.slice(half)
  const bandColor = color || BASE_PACKAGE_BAND_COLOR
  const bandText = getContrastTextColor(bandColor)

  return (
    <div className="rounded-sm overflow-hidden border border-surface-4">
      <div className="flex items-center justify-between gap-2 px-3 py-1.5" style={{ backgroundColor: bandColor }}>
        <div className="flex items-center gap-1.5 min-w-0">
          {dragHandleProps && <DragHandle {...dragHandleProps} colorStyle={{ color: bandText }} />}
          <div className="label-sm truncate" style={{ color: bandText }}>{f.set_name} - {f.formation_name}</div>
        </div>
        <div className="flex items-center gap-2.5 shrink-0">
          <span className="text-[11px] font-semibold tabular" style={{ color: bandText, opacity: 0.8 }}>{rows.length} plays</span>
          {!isViewOnly && editing && (
            <>
              <input
                type="color"
                value={bandColor}
                onChange={(e) => onSetColor(f.id, e.target.value)}
                aria-label={`${f.formation_name} color`}
                title="Pick a color for this formation"
                className="w-5 h-5 shrink-0 rounded border-0 bg-transparent p-0 cursor-pointer"
              />
              {color && (
                <button
                  type="button"
                  onClick={() => onResetColor(f.id)}
                  className="text-[10px] font-semibold uppercase tracking-wide underline decoration-dotted underline-offset-2"
                  style={{ color: bandText, opacity: 0.8 }}
                >
                  Auto
                </button>
              )}
            </>
          )}
          {!isViewOnly && (
            <EditIconButton
              onClick={() => setEditing((v) => !v)}
              active={editing}
              label={editing ? 'Done editing color' : 'Edit color'}
              colorStyle={{ color: bandText }}
            />
          )}
          {!isViewOnly && (
            <button
              type="button"
              onClick={onTogglePackage}
              className="text-[10px] font-semibold uppercase tracking-wide underline decoration-dotted underline-offset-2"
              style={{ color: bandText, opacity: 0.8 }}
            >
              Remove
            </button>
          )}
        </div>
      </div>
      <div className="bg-surface-2">
        {f.personnelInfo && (
          <div className="text-xs text-txt-tertiary px-4 pt-2">
            {f.personnelInfo.text}{f.personnelInfo.isEstimate ? ' (est.)' : ''}
          </div>
        )}
        {!plays ? (
          <div className="text-xs text-txt-tertiary px-4 py-3">Loading plays...</div>
        ) : (
          <>
            {favorited.length > 0 && (
              <div className="pt-1">
                {favorited.map((p) => (
                  <CategoryPlayRow key={p.id} play={p} isFavorite teamColors={teamColors} isViewOnly={isViewOnly} onToggleFavorite={onToggleFavoritePlay} side={side} />
                ))}
              </div>
            )}
            <div className="px-4 py-2">
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="text-[11px] font-semibold text-txt-tertiary hover:text-txt-primary underline decoration-dotted underline-offset-2"
              >
                {expanded ? 'Hide plays' : `Show all plays (${rows.length})`}
              </button>
            </div>
            {expanded && (
              rows.length === 0 ? (
                <p className="text-xs text-txt-tertiary px-4 pb-3">No plays found for this formation.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2">
                  <div className="sm:border-r sm:border-surface-4 pb-1">
                    {col1.map((p) => (
                      <CategoryPlayRow key={p.id} play={p} isFavorite={favoritePlaySet.has(p.id)} onToggleFavorite={onToggleFavoritePlay} teamColors={teamColors} isViewOnly={isViewOnly} side={side} />
                    ))}
                  </div>
                  <div className="pb-1">
                    {col2.map((p) => (
                      <CategoryPlayRow key={p.id} play={p} isFavorite={favoritePlaySet.has(p.id)} onToggleFavorite={onToggleFavoritePlay} teamColors={teamColors} isViewOnly={isViewOnly} side={side} />
                    ))}
                  </div>
                </div>
              )
            )}
          </>
        )}
      </div>
    </div>
  )
}

// A freely-repositionable title/break for "Your Gameplan" — drag it
// anywhere (via the same handle as formations and categories) to group the
// boxes around it, or leave the title blank for a plain rule. Two shapes:
//   row    — spans the full grid width and forces a line break, so it
//            reads as a section title over whatever's below it.
// Every column in "Your Gameplan" is an independent stack, so a divider is
// just a normal item that lives inside whichever column it's dragged into
// — there's no more "spans the whole board" mode. The title is always an
// inline input rather than hiding behind an edit toggle — a divider has
// nothing else to edit there. Color, like categories and package cards,
// hides behind the same pencil-icon toggle so the default view stays
// uncluttered; unlike those, an uncolored divider has no computed
// fallback — it just stays plain/transparent until the user picks
// something.
function GameplanDivider({ divider, dragHandleProps, onRename, onRemove, onSetColor, onResetColor, isViewOnly }) {
  const [title, setTitle] = useState(divider.title || '')
  const [editing, setEditing] = useState(false)
  const commit = () => { if (title !== divider.title) onRename(divider.id, title) }
  const bandColor = divider.color || null
  const bandText = bandColor ? getContrastTextColor(bandColor) : undefined
  const textStyle = bandText ? { color: bandText } : undefined

  const titleInput = (
    <input
      value={title}
      onChange={(e) => setTitle(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { commit(); e.currentTarget.blur() }
        if (e.key === 'Escape') { setTitle(divider.title || ''); e.currentTarget.blur() }
      }}
      placeholder="Divider title (optional)"
      disabled={isViewOnly}
      className="label-sm border-0 outline-none min-w-0 flex-1 placeholder:text-txt-muted placeholder:normal-case placeholder:tracking-normal placeholder:font-normal"
      style={{ backgroundColor: 'transparent', ...textStyle }}
    />
  )

  const controls = !isViewOnly && (
    <div className="flex items-center gap-2.5 shrink-0">
      {editing && (
        <>
          <input
            type="color"
            value={bandColor || '#4e515c'}
            onChange={(e) => onSetColor(divider.id, e.target.value)}
            aria-label="Divider color"
            title="Pick a color for this divider"
            className="w-5 h-5 shrink-0 rounded border-0 bg-transparent p-0 cursor-pointer"
          />
          {bandColor && (
            <button
              type="button"
              onClick={() => onResetColor(divider.id)}
              className="text-[10px] font-semibold uppercase tracking-wide underline decoration-dotted underline-offset-2"
              style={textStyle ? { ...textStyle, opacity: 0.8 } : undefined}
            >
              Auto
            </button>
          )}
        </>
      )}
      <EditIconButton
        onClick={() => setEditing((v) => !v)}
        active={editing}
        label={editing ? 'Done editing' : 'Edit Divider'}
        colorStyle={textStyle}
      />
      <button
        type="button"
        onClick={() => onRemove(divider.id)}
        className="shrink-0 text-txt-tertiary hover:text-txt-primary"
        aria-label="Remove Divider"
        style={textStyle}
      >
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  )

  // Same single-line height as a category/formation box's header band
  // (px-3 py-1.5) — a divider is a title/rule, not a card, so it should
  // never grow to match the taller boxes around it. flex-wrap (not a
  // hardcoded second row) means the normal, non-editing state — just the
  // title plus the pencil/remove controls — stays on one line exactly like
  // every other header; it only reflows if editing mode's extra
  // color-swatch/Auto controls genuinely don't fit.
  return (
    <div
      className="rounded-sm border border-surface-4 flex items-center gap-2 px-3 py-1.5 flex-wrap"
      style={{ backgroundColor: bandColor || 'var(--surface-2)' }}
    >
      {dragHandleProps && <DragHandle {...dragHandleProps} colorStyle={textStyle} />}
      {titleInput}
      {controls}
    </div>
  )
}

// One column of the "Your Gameplan" board — an independent vertical stack
// with its own SortableContext, so columns can hold different numbers of
// items and reordering never has to reason about the other two columns'
// geometry. Also a useDroppable zone in its own right (id `column:<n>`) so
// an empty column, or a drop past the last item, still has somewhere valid
// to receive a drag — without it, dnd-kit has no droppable target inside a
// column with too few (or zero) items for the pointer to land on.
function GameplanColumn({
  colIndex, items, packageCardProps, categorySectionProps, onRenameDivider, onRemoveDivider,
  onSetDividerColor, onResetDividerColor, isViewOnly,
}) {
  const { setNodeRef } = useDroppable({ id: `column:${colIndex}` })
  return (
    <div ref={setNodeRef} className="min-h-[2.5rem]">
      <SortableContext items={items.map((item) => item.tag)} strategy={verticalListSortingStrategy}>
        {items.map((item) => (
          <GameplanSortableItem
            key={item.tag}
            item={item}
            packageCardProps={packageCardProps}
            categorySectionProps={categorySectionProps}
            onRenameDivider={onRenameDivider}
            onRemoveDivider={onRemoveDivider}
            onSetDividerColor={onSetDividerColor}
            onResetDividerColor={onResetDividerColor}
            isViewOnly={isViewOnly}
          />
        ))}
      </SortableContext>
    </div>
  )
}

// Wraps a base-package PackageFormationCard, a SituationalCategorySection,
// OR a GameplanDivider as a single dnd-kit sortable item inside its
// column's own vertical SortableContext — so all three kinds of box can be
// dragged into any position within a column, or across into a different
// column entirely (handled at the board level). Same
// handle-carries-the-listeners pattern as Sidebar's SortableNavRow;
// verticalListSortingStrategy (a plain vertical stack, not a 2D grid) is
// what makes reordering feel like it just "sticks" wherever it's dropped
// instead of the whole board doing an unpredictable reflow animation —
// items of very different heights (a thin divider next to a tall
// formation card) don't fight the sorting strategy's geometry the way they
// did under rectSortingStrategy.
function GameplanSortableItem({
  item, packageCardProps, categorySectionProps, onRenameDivider, onRemoveDivider,
  onSetDividerColor, onResetDividerColor, isViewOnly,
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.tag })
  const isDivider = item.type === 'divider'
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    zIndex: isDragging ? 20 : undefined,
    position: 'relative',
    // A divider can zero out its own bottom margin to sit fused directly
    // against whatever's below it in the same column — a "double header"
    // look — while every other item keeps the normal gap.
    marginBottom: isDivider ? 0 : '0.5rem',
  }
  return (
    <div ref={setNodeRef} style={style}>
      {item.type === 'formation' && (
        <PackageFormationCard f={item.data} dragHandleProps={{ attributes, listeners }} {...packageCardProps(item.data)} />
      )}
      {item.type === 'category' && (
        <SituationalCategorySection category={item.data} dragHandleProps={{ attributes, listeners }} {...categorySectionProps} />
      )}
      {item.type === 'divider' && (
        <GameplanDivider
          divider={item.data}
          dragHandleProps={{ attributes, listeners }}
          onRename={onRenameDivider}
          onRemove={onRemoveDivider}
          onSetColor={onSetDividerColor}
          onResetColor={onResetDividerColor}
          isViewOnly={isViewOnly}
        />
      )}
    </div>
  )
}

// One row inside a situational category's dense play list — a team-color
// tick marks starred plays (matching the hero/chip accent language instead
// of a second, competing accent color), a plain-text type label stands in
// for a colored pill, and remove is a plain close glyph so the row stays
// as narrow as a real call sheet's.
function CategoryPlayRow({ play, onToggleFavorite, isFavorite, onRemove, teamColors, isViewOnly, side }) {
  const typeColor = PLAY_TYPE_COLORS[side]?.[play.type]
  return (
    <div className="flex items-center gap-1.5 px-2.5 h-7 border-t border-surface-3 first:border-t-0 hover:bg-surface-3">
      <span
        className="w-[3px] h-3 rounded-sm shrink-0"
        style={{ backgroundColor: isFavorite ? teamColors.primary : 'transparent' }}
      />
      <span className={`text-[12px] truncate flex-1 ${isFavorite ? 'text-txt-primary font-semibold' : 'text-txt-secondary'}`}>
        {play.name}
      </span>
      <span className="label-xs shrink-0" style={typeColor ? { color: typeColor } : undefined}>{play.type}</span>
      <StarToggle isFavorite={isFavorite} teamColors={teamColors} disabled={isViewOnly} onClick={() => onToggleFavorite(play.id)} />
      {!isViewOnly && onRemove && (
        <button type="button" onClick={onRemove} aria-label="Remove from category" className="shrink-0 text-txt-tertiary hover:text-txt-primary">
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  )
}

// One situational category — a colored header band (per docs/DESIGN.md's
// semantic-color system, never team color) over a dense, plain-text,
// two-column play list — the structure of a real coach's call sheet.
// Formations added via the search box get flattened into their individual
// plays here rather than rendered as nested formation cards, so the list
// reads as one flat set of calls for this situation, matching the
// reference call sheet exactly.
function SituationalCategorySection({
  category, gameViewFormations, formationsById, playIndex, playsForFormation, side,
  favoritePlaySet, onToggleFavoritePlay, teamColors, isViewOnly, dragHandleProps,
  onAddFormation, onRemoveFormation, onAddPlay, onRemovePlay, onRemoveCategory,
  onSetColor, onResetColor, onRename,
}) {
  const [search, setSearch] = useState('')
  const [searchVisible, setSearchVisible] = useState(true)
  const [editing, setEditing] = useState(false)
  const [nameDraft, setNameDraft] = useState(category.name)
  const q = search.trim().toLowerCase()
  const matchedFormations = q
    ? gameViewFormations.filter((f) => `${f.set_name} ${f.formation_name}`.toLowerCase().includes(q)).slice(0, 6)
    : []
  const matchedPlays = q
    ? [...playIndex.values()].filter(({ play }) => play.name.toLowerCase().includes(q)).slice(0, 6)
    : []

  const rows = [
    ...category.playIds.map((id) => playIndex.get(id)).filter(Boolean).map(({ play, formation }) => ({
      key: `play:${play.id}`, play, formation, onRemove: () => onRemovePlay(category.id, play.id),
    })),
    ...category.formationIds.flatMap((fid) => {
      const f = formationsById.get(fid)
      const plays = f && playsForFormation(f)
      if (!plays) return []
      return plays.map((play) => ({
        key: `formation:${fid}:${play.id}`, play, formation: f, onRemove: () => onRemoveFormation(category.id, fid),
      }))
    }),
  ]
  const half = Math.ceil(rows.length / 2)
  const col1 = rows.slice(0, half)
  const col2 = rows.slice(half)

  const bandColor = category.color || CATEGORY_FIXED_COLORS[category.id] || dominantTypeColor(rows.map((r) => r.play), side)
  const bandText = getContrastTextColor(bandColor)

  const commitRename = () => {
    const trimmed = nameDraft.trim()
    if (trimmed && trimmed !== category.name) onRename(category.id, trimmed)
    else setNameDraft(category.name)
  }

  return (
    <div className="rounded-sm overflow-hidden border border-surface-4">
      <div className="flex items-center justify-between gap-2 px-3 py-1.5" style={{ backgroundColor: bandColor }}>
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          {dragHandleProps && <DragHandle {...dragHandleProps} colorStyle={{ color: bandText }} />}
          <input
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { commitRename(); e.currentTarget.blur() }
              if (e.key === 'Escape') { setNameDraft(category.name); e.currentTarget.blur() }
            }}
            placeholder="Category name"
            disabled={isViewOnly}
            className="label-sm border-0 outline-none min-w-0 flex-1 placeholder:text-txt-muted placeholder:normal-case placeholder:tracking-normal placeholder:font-normal"
            style={{ backgroundColor: 'transparent', color: bandText }}
          />
        </div>
        <div className="flex items-center gap-2.5 shrink-0">
          <span className="text-[11px] font-semibold tabular" style={{ color: bandText, opacity: 0.8 }}>{rows.length} plays</span>
          {!isViewOnly && editing && (
            <>
              <input
                type="color"
                value={bandColor}
                onChange={(e) => onSetColor(category.id, e.target.value)}
                aria-label={`${category.name} color`}
                title="Pick a color for this category"
                className="w-5 h-5 shrink-0 rounded border-0 bg-transparent p-0 cursor-pointer"
              />
              {category.color && (
                <button
                  type="button"
                  onClick={() => onResetColor(category.id)}
                  className="text-[10px] font-semibold uppercase tracking-wide underline decoration-dotted underline-offset-2"
                  style={{ color: bandText, opacity: 0.8 }}
                >
                  Auto
                </button>
              )}
            </>
          )}
          {!isViewOnly && (
            <EditIconButton
              onClick={() => setEditing((v) => !v)}
              active={editing}
              label={editing ? 'Done editing' : 'Edit category'}
              colorStyle={{ color: bandText }}
            />
          )}
          {!isViewOnly && (
            <>
              <button
                type="button"
                onClick={() => setSearchVisible((v) => !v)}
                className="text-[10px] font-semibold uppercase tracking-wide underline decoration-dotted underline-offset-2"
                style={{ color: bandText, opacity: 0.8 }}
              >
                {searchVisible ? 'Hide search' : 'Show search'}
              </button>
              <button
                type="button"
                onClick={() => onRemoveCategory(category.id)}
                className="text-[10px] font-semibold uppercase tracking-wide underline decoration-dotted underline-offset-2"
                style={{ color: bandText, opacity: 0.8 }}
              >
                Remove
              </button>
            </>
          )}
        </div>
      </div>

      <div className="bg-surface-2">
        {!isViewOnly && searchVisible && (
          <div className="p-3 border-b border-surface-4">
            <Input
              placeholder="Search formations or plays to add..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {q && (
              <div className="mt-1 rounded-md border border-surface-4 max-h-56 overflow-y-auto text-xs">
                {matchedFormations.length === 0 && matchedPlays.length === 0 && (
                  <div className="px-2 py-1.5 text-txt-tertiary">No matches.</div>
                )}
                {matchedFormations.map((f) => (
                  <div key={f.id} className="flex items-center justify-between gap-2 px-2 py-1.5 border-t border-surface-4 first:border-t-0 bg-surface-3">
                    <span className="truncate text-txt-primary">
                      {f.set_name} - {f.formation_name} <span className="text-txt-tertiary">(formation)</span>
                    </span>
                    <button
                      type="button"
                      className="shrink-0 font-semibold text-txt-tertiary hover:text-txt-primary underline decoration-dotted underline-offset-2"
                      onClick={() => onAddFormation(category.id, f.id)}
                    >
                      Add
                    </button>
                  </div>
                ))}
                {matchedPlays.map(({ play, formation }) => (
                  <div key={play.id} className="flex items-center justify-between gap-2 px-2 py-1.5 border-t border-surface-4 first:border-t-0 bg-surface-3">
                    <span className="truncate text-txt-primary">
                      {play.name} <span className="text-txt-tertiary">({formation.set_name} - {formation.formation_name})</span>
                    </span>
                    <button
                      type="button"
                      className="shrink-0 font-semibold text-txt-tertiary hover:text-txt-primary underline decoration-dotted underline-offset-2"
                      onClick={() => onAddPlay(category.id, play.id)}
                    >
                      Add
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {rows.length === 0 ? (
          <p className="text-xs text-txt-tertiary px-4 py-3">No plays added yet — search above to add some.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2">
            <div className="sm:border-r sm:border-surface-4 pb-1">
              {col1.map((row) => (
                <CategoryPlayRow
                  key={row.key}
                  play={row.play}
                  isFavorite={favoritePlaySet.has(row.play.id)}
                  onToggleFavorite={onToggleFavoritePlay}
                  onRemove={row.onRemove}
                  teamColors={teamColors}
                  isViewOnly={isViewOnly}
                  side={side}
                />
              ))}
            </div>
            <div className="pb-1">
              {col2.map((row) => (
                <CategoryPlayRow
                  key={row.key}
                  play={row.play}
                  isFavorite={favoritePlaySet.has(row.play.id)}
                  onToggleFavorite={onToggleFavoritePlay}
                  onRemove={row.onRemove}
                  teamColors={teamColors}
                  isViewOnly={isViewOnly}
                  side={side}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function GameViewMode({
  side, gameViewFormations, playsForFormation, playIndex, packageIds, onTogglePackage,
  packageColors, onSetPackageColor, onResetPackageColor,
  favoritePlaySet, onToggleFavoritePlay, situationalCategories, onAddCategory, onRemoveCategory,
  gameplanColumns, onReorderGameplanColumns,
  onAddFormationToCategory, onRemoveFormationFromCategory, onAddPlayToCategory, onRemovePlayFromCategory,
  onSetCategoryColor, onResetCategoryColor, onRenameCategory,
  gameplanDividers, onAddDivider, onRemoveDivider, onRenameDivider,
  onSetDividerColor, onResetDividerColor,
  teamColors, isViewOnly, onSwitchToBuild,
}) {
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  )

  if (!gameViewFormations.length) {
    return (
      <EmptyState
        title="No playbook selected yet"
        message={`Pick a ${side} playbook in Build mode, then come back here for a clean in-game reference of every formation in it.`}
        action={<Button variant="primary" onClick={onSwitchToBuild}>Go to Build mode</Button>}
      />
    )
  }

  const groups = PLAY_TYPE_GROUPS[side]
  const formationsById = new Map(gameViewFormations.map((f) => [f.id, f]))
  const packageSet = new Set(packageIds)
  const rest = gameViewFormations
    .filter((f) => !f.isSelected)
    .sort((a, b) => (b.fit?.score ?? -1) - (a.fit?.score ?? -1))

  const cardProps = (f) => ({
    plays: playsForFormation(f),
    favoritePlaySet,
    onToggleFavoritePlay,
    groups,
    teamColors,
    isViewOnly,
    headerActions: isViewOnly ? [] : [{
      key: 'package',
      label: f.isSelected ? 'Remove from package' : 'Add to package',
      onClick: () => onTogglePackage(f.id),
    }],
  })

  const packageCardProps = (f) => ({
    plays: playsForFormation(f),
    favoritePlaySet,
    onToggleFavoritePlay,
    teamColors,
    isViewOnly,
    side,
    onTogglePackage: () => onTogglePackage(f.id),
    color: packageColors[f.id],
    onSetColor: onSetPackageColor,
    onResetColor: onResetPackageColor,
  })

  const categorySectionProps = {
    gameViewFormations,
    formationsById,
    playIndex,
    playsForFormation,
    groups,
    side,
    favoritePlaySet,
    onToggleFavoritePlay,
    teamColors,
    isViewOnly,
    onAddFormation: onAddFormationToCategory,
    onRemoveFormation: onRemoveFormationFromCategory,
    onAddPlay: onAddPlayToCategory,
    onRemovePlay: onRemovePlayFromCategory,
    onRemoveCategory,
    onSetColor: onSetCategoryColor,
    onResetColor: onResetCategoryColor,
    onRename: onRenameCategory,
  }

  // "Your Gameplan" — formations (from the base package), situational
  // categories, and dividers, resolved from gameplanColumns (3 independent
  // per-column tag lists) so any of them can sit anywhere in any column,
  // and columns are free to hold different numbers of items. Any tag whose
  // target no longer exists (a formation removed from the package
  // elsewhere, a deleted category/divider) just drops.
  const categoriesById = new Map(situationalCategories.map((c) => [c.id, c]))
  const dividersById = new Map(gameplanDividers.map((d) => [d.id, d]))
  const resolveTag = (tag) => {
    if (tag.startsWith('formation:')) {
      const f = formationsById.get(tag.slice('formation:'.length))
      return f && packageSet.has(f.id) ? { tag, type: 'formation', data: f } : null
    }
    if (tag.startsWith('category:')) {
      const cat = categoriesById.get(tag.slice('category:'.length))
      return cat ? { tag, type: 'category', data: cat } : null
    }
    if (tag.startsWith('divider:')) {
      const div = dividersById.get(tag.slice('divider:'.length))
      return div ? { tag, type: 'divider', data: div } : null
    }
    return null
  }
  const gameplanColumnItems = gameplanColumns.map((col) => col.map(resolveTag).filter(Boolean))
  const gameplanItemCount = gameplanColumnItems.reduce((n, col) => n + col.length, 0)

  const findColumnOf = (tag) => gameplanColumns.findIndex((col) => col.includes(tag))

  const handleGameplanDragEnd = ({ active, over }) => {
    if (!over) return
    const activeTag = String(active.id)
    const overId = String(over.id)
    const fromCol = findColumnOf(activeTag)
    if (fromCol < 0) return

    let toCol
    let toIndex
    if (overId.startsWith('column:')) {
      toCol = Number(overId.slice('column:'.length))
      toIndex = gameplanColumns[toCol].length
    } else {
      toCol = findColumnOf(overId)
      if (toCol < 0) return
      toIndex = gameplanColumns[toCol].indexOf(overId)
    }

    if (fromCol === toCol) {
      const oldIndex = gameplanColumns[fromCol].indexOf(activeTag)
      if (oldIndex === toIndex) return
      const next = gameplanColumns.map((col) => [...col])
      next[fromCol] = arrayMove(next[fromCol], oldIndex, toIndex)
      onReorderGameplanColumns(next)
    } else {
      const next = gameplanColumns.map((col) => [...col])
      next[fromCol] = next[fromCol].filter((t) => t !== activeTag)
      next[toCol].splice(toIndex, 0, activeTag)
      onReorderGameplanColumns(next)
    }
  }

  return (
    <div className="space-y-6">
      <section>
        <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
          <div className="label-sm">Your Gameplan</div>
          <div className="flex items-center gap-2 flex-wrap">
            {!isViewOnly && (
              <>
                <Button variant="outline" size="sm" onClick={onAddDivider}>Add Divider</Button>
                <Button variant="outline" size="sm" onClick={onAddCategory}>Add Call</Button>
              </>
            )}
          </div>
        </div>
        {gameplanItemCount === 0 ? (
          <p className="text-xs text-txt-tertiary">
            Nothing here yet — add formations to your base package in Build mode (or below), or add a situational category above.
          </p>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleGameplanDragEnd}>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-2 items-start">
              {gameplanColumnItems.map((items, colIndex) => (
                <GameplanColumn
                  key={colIndex}
                  colIndex={colIndex}
                  items={items}
                  packageCardProps={packageCardProps}
                  categorySectionProps={categorySectionProps}
                  onRenameDivider={onRenameDivider}
                  onRemoveDivider={onRemoveDivider}
                  onSetDividerColor={onSetDividerColor}
                  onResetDividerColor={onResetDividerColor}
                  isViewOnly={isViewOnly}
                />
              ))}
            </div>
          </DndContext>
        )}
      </section>

      {rest.length > 0 && (
        <section>
          <div className="label-sm mb-2">
            Rest of the Playbook ({rest.length})
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 items-start">
            {rest.map((f) => <FormationGameCard key={f.id} f={f} {...cardProps(f)} />)}
          </div>
        </section>
      )}
    </div>
  )
}
