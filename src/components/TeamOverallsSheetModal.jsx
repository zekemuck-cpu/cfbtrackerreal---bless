import { useState, useMemo } from 'react'
import { useDynasty, getTeamRatingsForYear, getCurrentCustomConferences } from '../context/DynastyContext'
import { TEAMS } from '../data/teamRegistry'
import { getTeamConference } from '../data/conferenceTeams'
import { useToast } from './ui/Toast'

/**
 * TeamOverallsSheetModal — a single sheet for entering EVERY team's
 * OVR / OFF / DEF for one season, instead of opening each school from
 * All Teams one at a time. Preseason to-do "Enter All Team Overalls"
 * opens this. Grouped by conference (largest first, matching the All
 * Teams directory), with a search filter and one bulk save: only rows
 * the user actually changed are written, in a single updateDynasty call.
 */
export default function TeamOverallsSheetModal({ isOpen, onClose, year }) {
  const { currentDynasty, saveAllTeamRatings, isViewOnly } = useDynasty()
  const { toast } = useToast()
  const [search, setSearch] = useState('')
  const [drafts, setDrafts] = useState({}) // { [tid]: { overall, offense, defense } } — strings while editing
  const [saving, setSaving] = useState(false)

  const teamsSource = currentDynasty?.teams || TEAMS
  const customConferences = currentDynasty ? getCurrentCustomConferences(currentDynasty) : null

  // All FBS teams with their existing ratings for the year, grouped by
  // conference — same filter + ordering the All Teams directory uses.
  const grouped = useMemo(() => {
    if (!currentDynasty || !isOpen) return []
    const rows = Object.values(teamsSource)
      .filter(t => t && t.name && !t.isFCS)
      .map(t => {
        const existing = getTeamRatingsForYear(currentDynasty, t.tid, year) || {}
        return {
          tid: t.tid,
          abbr: t.abbr,
          name: t.name,
          existing: {
            overall: existing.overall ?? null,
            offense: existing.offense ?? null,
            defense: existing.defense ?? null,
          },
        }
      })
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
    const groups = new Map()
    rows.forEach(row => {
      const conf = getTeamConference(row.abbr, customConferences, teamsSource) || 'Other'
      if (!groups.has(conf)) groups.set(conf, [])
      groups.get(conf).push(row)
    })
    return Array.from(groups.entries()).sort(([a, ax], [b, bx]) => {
      if (a === 'Other') return 1
      if (b === 'Other') return -1
      return bx.length - ax.length
    })
  }, [currentDynasty, teamsSource, customConferences, year, isOpen])

  if (!isOpen || !currentDynasty) return null

  const filterMatch = (row) => {
    if (!search) return true
    const q = search.toLowerCase()
    return row.name.toLowerCase().includes(q) || (row.abbr || '').toLowerCase().includes(q)
  }

  const draftFor = (row) => drafts[row.tid] || {
    overall: row.existing.overall ?? '',
    offense: row.existing.offense ?? '',
    defense: row.existing.defense ?? '',
  }

  const setField = (row, field, value) => {
    setDrafts(prev => ({
      ...prev,
      [row.tid]: { ...draftFor(row), [field]: value },
    }))
  }

  const parseVal = (v) => {
    if (v === '' || v == null) return null
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }

  // Only rows whose parsed values differ from what's stored get saved.
  const collectChanged = () => {
    const changed = {}
    for (const [, rows] of grouped) {
      for (const row of rows) {
        const d = drafts[row.tid]
        if (!d) continue
        const next = {
          overall: parseVal(d.overall),
          offense: parseVal(d.offense),
          defense: parseVal(d.defense),
        }
        if (next.overall == null && next.offense == null && next.defense == null) continue
        if (next.overall === row.existing.overall
            && next.offense === row.existing.offense
            && next.defense === row.existing.defense) continue
        changed[row.tid] = next
      }
    }
    return changed
  }

  const changedCount = Object.keys(collectChanged()).length

  const handleSave = async () => {
    const changed = collectChanged()
    if (Object.keys(changed).length === 0) {
      onClose()
      return
    }
    setSaving(true)
    try {
      const result = await saveAllTeamRatings(currentDynasty.id, year, changed)
      toast.success(`Saved ratings for ${result?.saved ?? Object.keys(changed).length} team(s).`)
      setDrafts({})
      onClose()
    } catch (err) {
      console.error('[TeamOverallsSheet] save failed:', err)
      toast.error('Failed to save team ratings — try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 top-0 left-0 right-0 bottom-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999] p-4"
      style={{ margin: 0 }}
      onClick={onClose}
    >
      <div
        className="bg-surface-2 rounded-xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col border border-surface-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-surface-4">
          <h2 className="text-lg font-bold text-txt-primary m-0">Team Overalls — {year}</h2>
          <p className="text-xs text-txt-secondary m-0 mt-1">
            Enter OVR (and optionally OFF / DEF) for every school in one place. Only
            rows you change are saved.
          </p>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search teams…"
            className="mt-3 w-full px-3 py-2 rounded-lg text-sm bg-surface-3 text-txt-primary border border-surface-5"
          />
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="grid grid-cols-[1fr_3.5rem_3.5rem_3.5rem] gap-2 items-center text-[11px] uppercase tracking-wide text-txt-muted px-1">
            <span>Team</span><span className="text-center">OVR</span><span className="text-center">OFF</span><span className="text-center">DEF</span>
          </div>
          {grouped.map(([conf, rows]) => {
            const visible = rows.filter(filterMatch)
            if (visible.length === 0) return null
            return (
              <div key={conf}>
                <h3 className="text-xs font-semibold text-txt-secondary uppercase tracking-wide m-0 mb-1 px-1">{conf}</h3>
                <div className="space-y-1">
                  {visible.map(row => {
                    const d = draftFor(row)
                    return (
                      <div key={row.tid} className="grid grid-cols-[1fr_3.5rem_3.5rem_3.5rem] gap-2 items-center">
                        <span className="text-sm text-txt-primary truncate">{row.name}</span>
                        {['overall', 'offense', 'defense'].map(field => (
                          <input
                            key={field}
                            type="number"
                            min="0"
                            max="99"
                            inputMode="numeric"
                            value={d[field]}
                            disabled={isViewOnly}
                            onChange={(e) => setField(row, field, e.target.value)}
                            className="px-1 py-1.5 rounded text-sm text-center bg-surface-3 text-txt-primary border border-surface-5"
                          />
                        ))}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>

        <div className="p-4 border-t border-surface-4 flex items-center justify-between gap-3">
          <span className="text-xs text-txt-secondary">
            {changedCount > 0 ? `${changedCount} team(s) changed` : 'No changes yet'}
          </span>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 rounded-lg text-sm bg-surface-3 hover:bg-surface-4 text-txt-primary disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || isViewOnly || changedCount === 0}
              className="px-4 py-2 rounded-lg text-sm bg-sky-600 hover:bg-sky-500 text-white disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save All'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
