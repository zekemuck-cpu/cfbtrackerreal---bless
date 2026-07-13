// Scheme Builder — replaces the old Play Sheet tool. Three modes:
//   Build mode: recommend an offense/defense scheme from the roster's real
//     archetypes, then assemble a base package of real CFB27 formations.
//   Archetypes mode: view/edit this team's players' real play-style
//     archetypes (writes the same player.archetype field used app-wide).
//   Game View mode: a plain (no scoring) reference of the real plays inside
//     whatever formations were chosen — meant to be glanced at mid-game.
// CFB27-only: gated off for any other game edition.
import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useDynasty } from '../../context/DynastyContext'
import { getEditionKey } from '../../editions'
import { TEAMS, getColorsFromTid } from '../../data/teamRegistry'
import { getContrastTextColor } from '../../utils/colorUtils'
import { PageHero, Card, Badge, Button, EmptyState } from '../../components/ui'
import { Input, Select } from '../../components/ui/FormField'
import { projectRoster } from '../../utils/rosterProjection'
import { buildBoard, DEPTH_CHART_CATALOG } from '../../utils/outlookBoard'
import { scoreSchemeFit, scoreFormationFit, parseFormationPersonnel } from '../../utils/schemeFit'
import { archetypesForPosition } from '../../data/archetypeSchemeFit'
import formationsData from '../../data/playbookData/formations.json'
import teamsData from '../../data/playbookData/teams.json'
import schemeFormationsData from '../../data/playbookData/schemeFormations.json'
import schemeTeamIdsData from '../../data/playbookData/schemeTeamIds.json'

// Vite-native lazy loaders for the large per-set play files and per-team
// playbook files — only the sets/teams actually opened get fetched.
const playsLoaders = import.meta.glob('../../data/playbookData/plays/*/*.json')
const teamPlaybookLoaders = import.meta.glob('../../data/playbookData/teamPlaybooks/*.json')

const PLAY_TYPE_GROUPS = {
  offense: [['RUN', 'Run'], ['PASS', 'Pass'], ['RPO', 'RPO']],
  defense: [['BLITZ', 'Blitz'], ['MAN', 'Man'], ['ZONE', 'Zone'], ['MATCH', 'Match']],
}

const slugSet = (name) => String(name).trim().replace(/[^a-zA-Z0-9-]+/g, '_')
const formationId = (f) => `${f.set_name}::${f.formation_name}`

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
  const [setPlaysCache, setSetPlaysCache] = useState({})

  const isCfb27 = getEditionKey(currentDynasty) === 'cfb27'

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
  const roleAssignmentsKey = `${side}RoleAssignments`
  const roleAssignments = builderState[roleAssignmentsKey] || {}

  const selectScheme = (scheme) => {
    if (isViewOnly || !currentDynasty) return
    updateDynasty(currentDynasty.id, { [schemeField]: scheme === selectedScheme ? null : scheme })
  }

  // Multi-level dot-notation keys (e.g. 'schemeBuilder.166.2026.x') only
  // nest correctly against Firestore — local IndexedDB storage does a
  // shallow spread and would save it as one literal dotted-string key
  // instead of a nested object. Build the nested object explicitly and
  // write it under a single top-level key, matching the established
  // pattern for teamFuture (DynastyContext.jsx's saveTeamFuturePlan).
  const writeSchemeBuilderField = (key, value) => {
    if (isViewOnly || !currentDynasty) return
    const sb = currentDynasty?.schemeBuilder || {}
    const forTid = sb[tid] || {}
    const forYear = forTid[year] || {}
    updateDynasty(currentDynasty.id, {
      schemeBuilder: {
        ...sb,
        [tid]: { ...forTid, [year]: { ...forYear, [key]: value } },
      },
    })
  }

  const setPackageIds = (next) => writeSchemeBuilderField(packageKey, next)

  const togglePackage = (fid) => {
    setPackageIds(packageSet.has(fid) ? packageIds.filter((id) => id !== fid) : [...packageIds, fid])
  }

  // Which player is assigned to each Archetypes-mode role slot (LT, HB2,
  // Nickel, ...) — persisted so switching a role to a bench player survives
  // a reload instead of silently reverting to the depth-chart default and
  // looking like the archetype you set on them "didn't save."
  const assignRole = (slotId, pid) => {
    writeSchemeBuilderField(roleAssignmentsKey, { ...roleAssignments, [slotId]: pid || undefined })
  }

  const sideFormations = useMemo(() => formationsData.filter((f) => f.side === side), [side])

  // Exact scheme -> formation membership straight from the game's own
  // default playbook for that scheme (see schemeFormations.json), not a
  // fuzzy real-team aggregate.
  const officialFormations = selectedScheme ? (schemeFormationsData[side]?.[selectedScheme] || []) : []
  const officialPlayCounts = useMemo(() => {
    const m = new Map()
    for (const row of officialFormations) m.set(`${row.set}::${row.formation}`, row.playCount)
    return m
  }, [officialFormations])

  const scoredFormations = useMemo(() => {
    let rows = sideFormations
    if (query.trim()) {
      const q = query.trim().toLowerCase()
      rows = rows.filter((f) => f.formation_name.toLowerCase().includes(q) || f.set_name.toLowerCase().includes(q))
    }
    return rows
      .map((f) => {
        const id = formationId(f)
        const officialPlayCount = officialPlayCounts.get(id) || 0
        return {
          ...f,
          id,
          isSelected: packageSet.has(id),
          isOfficial: officialPlayCount > 0,
          officialPlayCount,
          personnelInfo: personnelLabel(f),
          fit: scoreFormationFit(board, f, side === 'offense' ? selectedScheme : null),
        }
      })
      .sort((a, b) => {
        if (a.isSelected !== b.isSelected) return a.isSelected ? -1 : 1
        if (a.isOfficial !== b.isOfficial) return a.isOfficial ? -1 : 1
        if (b.officialPlayCount !== a.officialPlayCount) return b.officialPlayCount - a.officialPlayCount
        return b.fit.score - a.fit.score
      })
  }, [sideFormations, query, officialPlayCounts, board, side, selectedScheme, packageSet])

  const teamsForScheme = (scheme, forSide) => {
    const field = forSide === 'offense' ? 'offensiveScheme' : 'defensiveScheme'
    return teamsData.filter((t) => t[field] === scheme)
  }

  const selectedFormationObjs = useMemo(
    () => sideFormations.filter((f) => packageSet.has(formationId(f))),
    [sideFormations, packageSet],
  )

  // Game View: lazily fetch each selected formation's set-level play file
  // once, cache the raw set (not per-formation) so multiple formations
  // sharing a set (e.g. two different Gun looks) only fetch it once.
  useEffect(() => {
    if (mode !== 'game') return
    selectedFormationObjs.forEach((f) => {
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
  }, [mode, side, selectedFormationObjs])

  const playsForFormation = (f) => {
    const cacheKey = `${side}/${slugSet(f.set_name)}`
    const rows = setPlaysCache[cacheKey]
    if (!rows) return null
    return rows.filter((p) => p.formation === f.formation_name)
  }

  const usePlaybook = async (teamId) => {
    if (isViewOnly || !teamId) return
    const path = `../../data/playbookData/teamPlaybooks/${teamId}.json`
    const loader = teamPlaybookLoaders[path]
    if (!loader) return
    const mod = await loader()
    const data = mod.default || mod
    const plays = data[side] || []
    const counts = new Map()
    for (const p of plays) {
      const key = `${p.set}::${p.formation}`
      counts.set(key, (counts.get(key) || 0) + 1)
    }
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k]) => k)
    const merged = [...new Set([...packageIds, ...top])]
    setPackageIds(merged)
  }

  const officialTeamId = selectedScheme ? schemeTeamIdsData[side]?.[selectedScheme] : null

  if (!currentDynasty) return null

  if (!isCfb27) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-10">
        <EmptyState
          title="Scheme Builder is CFB 27 only"
          message="This dynasty is on an earlier game edition. Scheme Builder's formation and play data is sourced from CFB 27 and isn't available for other editions."
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
              Game View
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
          teamsForScheme={teamsForScheme}
          officialTeamId={officialTeamId}
          scoredFormations={scoredFormations}
          query={query}
          onQueryChange={setQuery}
          onTogglePackage={togglePackage}
          onUsePlaybook={usePlaybook}
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
          selectedFormationObjs={selectedFormationObjs}
          playsForFormation={playsForFormation}
          onSwitchToBuild={() => setMode('build')}
        />
      )}
    </div>
  )
}

function BuildMode({
  side, schemeRankings, selectedScheme, onSelectScheme, teamsForScheme, officialTeamId,
  scoredFormations, query, onQueryChange, onTogglePackage, onUsePlaybook,
  packageCount, teamColors, accentText, isViewOnly,
}) {
  const [showAllSchemes, setShowAllSchemes] = useState(false)
  const [showAllTeams, setShowAllTeams] = useState(false)
  const visibleSchemes = showAllSchemes ? schemeRankings : schemeRankings.slice(0, 6)
  const runningTeams = selectedScheme ? teamsForScheme(selectedScheme, side) : []
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
                  <Badge variant={r.score >= 65 ? 'success' : r.score >= 40 ? 'default' : 'outline'}>{r.score}</Badge>
                </div>
                {r.rationale && <div className="mt-1.5 text-xs text-txt-tertiary">{r.rationale}</div>}
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

      {selectedScheme && (
        <section>
          <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
            <h2 className="text-sm font-bold uppercase tracking-wide text-txt-secondary">
              Base Package — {selectedScheme} ({packageCount} selected)
            </h2>
            <Input
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              placeholder="Search all formations..."
              className="max-w-xs"
            />
          </div>

          <div className="mb-3 flex flex-wrap items-center gap-2">
            {officialTeamId && (
              <Button variant="primary" size="sm" accentColor={teamColors.primary} disabled={isViewOnly} onClick={() => onUsePlaybook(officialTeamId)}>
                Use official {selectedScheme} playbook
              </Button>
            )}
            {!officialTeamId && (
              <span className="text-xs text-txt-tertiary">No official default playbook found for {selectedScheme} — browse and add formations manually below.</span>
            )}
          </div>

          {runningTeams.length > 0 && (
            <div className="mb-3">
              <div className="flex flex-wrap items-center gap-2 text-xs text-txt-tertiary mb-1">
                <span>Real teams running {selectedScheme} ({runningTeams.length}):</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {visibleTeams.map((t) => (
                  <Button key={t.id} variant="outline" size="sm" onClick={() => !isViewOnly && onUsePlaybook(t.id)} disabled={isViewOnly}>
                    {t.name}
                  </Button>
                ))}
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {scoredFormations.map((f) => (
              <Card key={f.id} variant={f.isSelected ? 'elevated' : 'bordered'} padding="sm" style={f.isSelected ? { borderColor: teamColors.primary } : undefined}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-txt-primary truncate">{f.formation_name}</div>
                    <div className="text-xs text-txt-tertiary">
                      {f.set_name} · {f.play_count} plays{f.isOfficial ? ' · in official playbook' : ''}
                    </div>
                    <div className="text-xs text-txt-tertiary mt-0.5">
                      {f.personnelInfo.text}{f.personnelInfo.isEstimate ? ' (est.)' : ''}
                      {f.fit.avgOvr != null ? ` · ${f.fit.avgOvr} OVR personnel` : ''}
                    </div>
                  </div>
                  <Badge variant={f.fit.score >= 70 ? 'success' : f.fit.score >= 40 ? 'default' : 'outline'}>{f.fit.score}</Badge>
                </div>
                {f.fit.missingRoles.length > 0 && (
                  <div className="mt-1 text-xs" style={{ color: 'var(--accent-warning)' }}>
                    Thin at: {f.fit.missingRoles.join(', ')}
                  </div>
                )}
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
        </section>
      )}
    </div>
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

const ROLE_SLOTS = {
  offense: [
    { id: 'QB', label: 'QB', positions: ['QB'] },
    { id: 'HB', label: 'HB', positions: ['HB', 'RB'] },
    { id: 'HB2', label: 'HB2', positions: ['HB', 'RB'], groupRank: 1 },
    { id: 'FB', label: 'FB', positions: ['FB'] },
    { id: 'WR', label: 'WR', positions: ['WR'] },
    { id: 'WR2', label: 'WR2', positions: ['WR'], groupRank: 1 },
    { id: 'SLWR', label: 'Slot WR', positions: ['WR'], groupRank: 2 },
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
    { id: 'REDG', label: 'RE', positions: EDGE_POS, groupRank: 1 },
    { id: 'SAM', label: 'SAM', positions: SAM_WILL_POS },
    { id: 'MIKE', label: 'MIKE', positions: ['MIKE'] },
    { id: 'WILL', label: 'WILL', positions: SAM_WILL_POS, groupRank: 1 },
    { id: 'CB', label: 'CB', positions: ['CB'] },
    { id: 'CB2', label: 'CB2', positions: ['CB'], groupRank: 1 },
    { id: 'NB', label: 'Nickel', positions: ['CB'], groupRank: 2 },
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

function GameViewMode({ side, selectedFormationObjs, playsForFormation, onSwitchToBuild }) {
  if (!selectedFormationObjs.length) {
    return (
      <EmptyState
        title="No formations in your package yet"
        message={`Build a base ${side} package first, then come back here for a clean in-game reference.`}
        action={<Button variant="primary" onClick={onSwitchToBuild}>Go to Build mode</Button>}
      />
    )
  }

  const groups = PLAY_TYPE_GROUPS[side]

  return (
    <div className="space-y-4">
      {selectedFormationObjs.map((f) => {
        const plays = playsForFormation(f)
        return (
          <Card key={formationId(f)} variant="bordered">
            <div className="flex items-baseline justify-between gap-2 mb-2">
              <div className="font-semibold text-txt-primary">{f.formation_name}</div>
              <Badge variant="outline">{f.set_name}</Badge>
            </div>
            {!plays ? (
              <div className="text-xs text-txt-tertiary">Loading plays...</div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {groups.map(([type, label]) => {
                  const rows = plays.filter((p) => p.type === type)
                  if (!rows.length) return null
                  return (
                    <div key={type}>
                      <div className="text-xs font-bold uppercase tracking-wide text-txt-tertiary mb-1">{label}</div>
                      <ul className="space-y-0.5">
                        {rows.map((p) => (
                          <li key={p.id} className="text-sm text-txt-primary">{p.name}</li>
                        ))}
                      </ul>
                    </div>
                  )
                })}
              </div>
            )}
          </Card>
        )
      })}
    </div>
  )
}
