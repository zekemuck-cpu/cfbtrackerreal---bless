/**
 * ManageRivalries — lives at `/dynasty/:id/rivalries`.
 *
 * PC (CFB27 auto-sync) dynasties: renders the exact same RivalriesTab
 * component/UI the Team Dashboard's own "Rivalries" tab uses, scoped to the
 * user's own current team (dynasty.currentTid). Rivalries for a PC dynasty
 * are auto-imported from the save, and RivalriesTab already covers adding/
 * naming/trophying a new one for this team (see its own "+ Add Rival" and
 * per-card edit UI) — this request was explicitly PC-only.
 *
 * Every other dynasty (console/manual): unchanged, original standalone
 * dynasty-wide CRUD — add/edit/remove an arbitrary multi-team rivalry, plus
 * the built-in rivalry trophies listed for reference. Persists to
 * `dynasty.rivalries` as `{ id, name, teamTids: [tid, ...], imageUrl }`,
 * which feeds the same rivalry lookup (getRivalryTrophyForTeams) that
 * powers the "rivalries" game filter, the schedule badge, and the game-page
 * title.
 */

import { useMemo, useState } from 'react'
import { useDynasty } from '../../context/DynastyContext'
import { TROPHIES } from '../../data/trophies'
import { isFCSPlaceholderAbbr } from '../../data/teamRegistry'
import { PageHero, Card, EmptyState } from '../../components/ui'
import RivalriesTab from '../../components/RivalriesTab'
import { isPcAutoDynasty } from '../../editions'

const BUILTIN_RIVALRIES = TROPHIES.filter(t => t.category === 'rivalry' && Array.isArray(t.teams))

function makeId() {
  // App runtime (browser) — crypto.randomUUID when available, else a short
  // time+counter fallback. Uniqueness only needs to hold within one dynasty.
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return `cr_${crypto.randomUUID()}`
  return `cr_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
}

export default function ManageRivalries() {
  const { currentDynasty, updateDynasty, saveRivalries, isViewOnly } = useDynasty()

  if (!currentDynasty) return null

  if (isPcAutoDynasty(currentDynasty)) {
    return (
      <div className="space-y-6 max-w-4xl mx-auto">
        <PageHero
          title="Rivalries"
          subtitle="Synced automatically from your save and your own games. Add one if it's missing, and name a trophy once it's earned one."
        />
        <RivalriesTab
          dynasty={currentDynasty}
          tid={currentDynasty.currentTid}
          selectedYear={currentDynasty.currentYear}
          dynastyId={currentDynasty.id}
          saveRivalries={saveRivalries}
        />
      </div>
    )
  }

  return <ManualManageRivalries currentDynasty={currentDynasty} updateDynasty={updateDynasty} isViewOnly={isViewOnly} />
}

function ManualManageRivalries({ currentDynasty, updateDynasty, isViewOnly }) {
  const canEdit = !isViewOnly

  // Selectable teams for the pickers: real (non-FCS-placeholder) teams in this
  // dynasty, sorted by name. Names/logos resolve live from dynasty.teams by tid.
  const teamOptions = useMemo(() => {
    const teams = currentDynasty?.teams || {}
    return Object.entries(teams)
      .map(([tid, t]) => ({ tid: Number(tid), name: t?.name || t?.abbr || `Team ${tid}`, abbr: t?.abbr || '' }))
      .filter(o => o.abbr && !isFCSPlaceholderAbbr(o.abbr))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [currentDynasty?.teams])

  const teamName = (tid) => {
    const t = currentDynasty?.teams?.[tid]
    return t?.name || t?.abbr || `Team ${tid}`
  }

  const customRivalries = currentDynasty?.rivalries || []

  const persist = async (nextList) => {
    if (!currentDynasty) return
    await updateDynasty(currentDynasty.id, { rivalries: nextList })
  }

  const handleAdd = async (data) => {
    await persist([...customRivalries, { id: makeId(), ...data }])
  }
  const handleSave = async (id, data) => {
    await persist(customRivalries.map(r => (r.id === id ? { ...r, ...data } : r)))
  }
  const handleRemove = async (id) => {
    await persist(customRivalries.filter(r => r.id !== id))
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <PageHero
        title="Manage Rivalries"
        subtitle="Add your own rivalries so games between these teams are flagged as rivalry games (in the rivalries filter, schedule, and game pages). Built-in rivalries are listed for reference."
      />

      {/* Add a rivalry */}
      {canEdit && (
        <Card>
          <h3 className="label-sm text-txt-primary mb-3">Add a rivalry</h3>
          <RivalryEditor
            key={`add-${customRivalries.length}`}
            teamOptions={teamOptions}
            onSubmit={handleAdd}
            submitLabel="Add rivalry"
            resetOnSubmit
          />
        </Card>
      )}

      {/* Custom rivalries */}
      <div className="space-y-2">
        <h3 className="label-sm text-txt-tertiary">Your rivalries {customRivalries.length > 0 && `(${customRivalries.length})`}</h3>
        {customRivalries.length === 0 ? (
          <Card><EmptyState title="No custom rivalries yet" message={canEdit ? 'Add one above.' : undefined} /></Card>
        ) : (
          customRivalries.map(r => (
            <Card key={r.id}>
              {canEdit ? (
                <RivalryEditor
                  teamOptions={teamOptions}
                  initial={{ name: r.name || '', teamTids: r.teamTids || [], imageUrl: r.imageUrl || '' }}
                  onSubmit={(data) => handleSave(r.id, data)}
                  onRemove={() => handleRemove(r.id)}
                  submitLabel="Save"
                />
              ) : (
                <RivalryReadonly name={r.name} teamTids={r.teamTids} imageUrl={r.imageUrl} teamName={teamName} />
              )}
            </Card>
          ))
        )}
      </div>

      {/* Built-in rivalries (reference) */}
      <div className="space-y-2">
        <h3 className="label-sm text-txt-tertiary">Built-in rivalries ({BUILTIN_RIVALRIES.length})</h3>
        <Card>
          <div className="divide-y divide-surface-3">
            {BUILTIN_RIVALRIES.map(t => (
              <div key={t.id} className="flex items-center gap-3 py-2">
                {t.image
                  ? <img src={t.image} alt="" className="w-8 h-8 object-contain flex-shrink-0" />
                  : <span className="w-8 h-8 flex-shrink-0" />}
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-txt-primary truncate">{t.gameName || t.name}</div>
                  <div className="text-xs text-txt-tertiary truncate">{t.teams.join(' · ')}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}

function RivalryReadonly({ name, teamTids, imageUrl, teamName }) {
  return (
    <div className="flex items-center gap-3">
      {imageUrl
        ? <img src={imageUrl} alt="" className="w-8 h-8 object-contain flex-shrink-0" />
        : <span className="w-8 h-8 flex-shrink-0" />}
      <div className="min-w-0">
        <div className="text-sm font-semibold text-txt-primary truncate">{name || 'Rivalry'}</div>
        <div className="text-xs text-txt-tertiary truncate">{(teamTids || []).map(teamName).join(' · ')}</div>
      </div>
    </div>
  )
}

// Shared add/edit form for one rivalry. Holds its own draft state.
function RivalryEditor({ teamOptions, initial = null, onSubmit, onRemove = null, submitLabel = 'Save', resetOnSubmit = false }) {
  const [name, setName] = useState(initial?.name || '')
  const [teamTids, setTeamTids] = useState(initial?.teamTids?.map(Number) || [])
  const [imageUrl, setImageUrl] = useState(initial?.imageUrl || '')
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState(false)

  const selectedSet = new Set(teamTids)
  const q = search.trim().toLowerCase()
  const filtered = useMemo(() => {
    const list = teamOptions.filter(o => !selectedSet.has(o.tid))
    if (!q) return list.slice(0, 8)
    return list.filter(o => o.name.toLowerCase().includes(q) || o.abbr.toLowerCase().includes(q)).slice(0, 8)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamOptions, q, teamTids])

  const nameFor = (tid) => teamOptions.find(o => o.tid === tid)?.name || `Team ${tid}`
  const canSubmit = name.trim().length > 0 && teamTids.length >= 2 && !busy

  const addTeam = (tid) => { setTeamTids(prev => [...prev, tid]); setSearch('') }
  const removeTeam = (tid) => setTeamTids(prev => prev.filter(t => t !== tid))

  const submit = async () => {
    if (!canSubmit) return
    setBusy(true)
    try {
      await onSubmit({ name: name.trim(), teamTids, imageUrl: imageUrl.trim() })
      if (resetOnSubmit) { setName(''); setTeamTids([]); setImageUrl(''); setSearch('') }
    } finally {
      setBusy(false)
    }
  }

  const inputCls = 'w-full px-3 py-2 rounded-lg bg-surface-2 border border-surface-4 text-txt-primary text-sm focus:border-surface-5 focus:outline-none'

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="label-xs text-txt-tertiary block mb-1">Rivalry name</label>
          <input className={inputCls} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. The Backyard Brawl" />
        </div>
        <div>
          <label className="label-xs text-txt-tertiary block mb-1">Trophy image URL (optional)</label>
          <input className={inputCls} value={imageUrl} onChange={e => setImageUrl(e.target.value)} placeholder="https://…/trophy.png" />
        </div>
      </div>

      <div>
        <label className="label-xs text-txt-tertiary block mb-1">Teams (2 or more)</label>
        {teamTids.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {teamTids.map(tid => (
              <span key={tid} className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold" style={{ backgroundColor: 'var(--surface-3)', color: 'var(--text-primary)' }}>
                {nameFor(tid)}
                <button type="button" onClick={() => removeTeam(tid)} aria-label={`Remove ${nameFor(tid)}`} className="ml-0.5 text-txt-tertiary hover:text-txt-primary">×</button>
              </span>
            ))}
          </div>
        )}
        <input className={inputCls} value={search} onChange={e => setSearch(e.target.value)} placeholder="Search teams to add…" />
        {(q || filtered.length > 0) && filtered.length > 0 && (
          <div className="mt-1 rounded-lg border border-surface-4 bg-surface-2 divide-y divide-surface-3 max-h-52 overflow-y-auto">
            {filtered.map(o => (
              <button key={o.tid} type="button" onClick={() => addTeam(o.tid)} className="w-full text-left px-3 py-2 text-sm text-txt-primary hover:bg-surface-3 transition-colors">
                {o.name} <span className="text-txt-tertiary text-xs">{o.abbr}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={!canSubmit}
          className="px-4 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
          style={{ backgroundColor: 'var(--text-primary)', color: 'var(--surface-1)' }}
        >
          {busy ? 'Saving…' : submitLabel}
        </button>
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="px-4 py-2 rounded-lg text-sm font-semibold transition-colors text-white"
            style={{ backgroundColor: 'var(--danger, #b91c1c)' }}
          >
            Remove
          </button>
        )}
      </div>
    </div>
  )
}
