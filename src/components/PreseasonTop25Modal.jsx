import { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useDynasty } from '../context/DynastyContext'
import { useToast } from './ui/Toast'
import { teams as TEAM_NAMES, getMascotName } from '../data/teams'
import { getTidFromTeamName, TEAMS } from '../data/teamRegistry'
import SearchableSelect from './SearchableSelect'
import AIPromptModal from './AIPromptModal'
import { buildPreseasonTop25Prompt } from '../utils/recapPrompts'

/**
 * Preseason Top 25 entry modal.
 *
 * Saves to dynasty.preseasonRankingsByYear[year] as an array of
 * { rank, team (abbr), tid } objects — same shape used by the recap prompt
 * builders so the saved poll automatically flows into the preseason recap.
 *
 * The "Suggest with AI" button opens AIPromptModal with a prompt that
 * grounds the AI in the dynasty's prior-season final-poll data; the user
 * pastes the AI's TSV output back into the form rows manually.
 */
export default function PreseasonTop25Modal({ isOpen, onClose, year, teamColors }) {
  const { currentDynasty, updateDynasty, isViewOnly } = useDynasty()
  const { toast } = useToast()
  const yearNum = Number(year)

  // Load existing saved rankings (so re-opening lets the user edit).
  const existing = currentDynasty?.preseasonRankingsByYear?.[yearNum] || []
  const initialRows = useMemo(() => {
    const byRank = {}
    for (const e of existing) {
      if (e?.rank >= 1 && e.rank <= 25) byRank[e.rank] = e
    }
    return Array.from({ length: 25 }, (_, i) => {
      const rank = i + 1
      const e = byRank[rank]
      const teamName = e?.tid != null
        ? (currentDynasty?.teams?.[e.tid]?.name || TEAMS[e.tid]?.name || '')
        : (e?.team ? getMascotName(e.team, currentDynasty?.teams) || '' : '')
      return { rank, teamName }
    })
  }, [existing, currentDynasty?.teams, isOpen])

  const [rows, setRows] = useState(initialRows)
  const [showAIPrompt, setShowAIPrompt] = useState(false)
  const [saving, setSaving] = useState(false)

  // Reset rows ONLY when the modal opens — not on every render. The
  // previous version listed `initialRows` in the dep array, but
  // initialRows is recomputed every render (because `existing` is a
  // fresh `?.[year] || []` array reference each time). That made the
  // effect fire after every keystroke and reset the user's picks
  // immediately — which presented as "the modal won't let me enter
  // anything." isOpen-only ensures we only seed state on the open
  // transition.
  useEffect(() => {
    if (isOpen) setRows(initialRows)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  const aiPrompt = useMemo(() => {
    if (!currentDynasty) return ''
    return buildPreseasonTop25Prompt(currentDynasty, yearNum)
  }, [currentDynasty, yearNum])

  // Build the team option list. Prefer dynasty teams (carries teambuilder
  // names) and fall back to the static mascot list.
  const teamOptions = useMemo(() => {
    const dynastyTeamNames = currentDynasty?.teams
      ? Object.values(currentDynasty.teams).map(t => t.name).filter(Boolean)
      : []
    if (dynastyTeamNames.length > 0) return [...new Set(dynastyTeamNames)].sort()
    return [...TEAM_NAMES].sort()
  }, [currentDynasty?.teams])

  const updateRow = (index, teamName) => {
    setRows(prev => {
      const next = [...prev]
      next[index] = { ...next[index], teamName }
      return next
    })
  }

  const handleClear = () => {
    if (!window.confirm('Clear all 25 ranks?')) return
    setRows(Array.from({ length: 25 }, (_, i) => ({ rank: i + 1, teamName: '' })))
  }

  const handleSave = async () => {
    if (isViewOnly) {
      toast.error('Read-only mode — cannot save.')
      return
    }
    if (!currentDynasty) return
    // Persist only filled rows; rank order preserved.
    const entries = rows
      .filter(r => r.teamName)
      .map(r => {
        const tid = getTidFromTeamName(r.teamName, currentDynasty?.teams)
        // Resolve to an abbreviation when we have one — abbr is what
        // legacy paths expect; tid is the canonical id going forward.
        const team = tid != null
          ? (currentDynasty?.teams?.[tid]?.abbr || TEAMS[tid]?.abbr || r.teamName)
          : r.teamName
        return { rank: r.rank, team, tid: tid != null ? Number(tid) : null }
      })
    if (entries.length === 0) {
      toast.error('Add at least one ranked team.')
      return
    }
    setSaving(true)
    try {
      const cur = currentDynasty.preseasonRankingsByYear || {}
      const next = { ...cur, [yearNum]: entries }
      await updateDynasty(currentDynasty.id, { preseasonRankingsByYear: next })
      toast.success(`Preseason Top ${entries.length} saved.`)
      onClose?.()
    } catch (err) {
      console.error('[PreseasonTop25Modal] save failed:', err)
      toast.error('Could not save preseason rankings.')
    } finally {
      setSaving(false)
    }
  }

  if (!isOpen) return null

  return createPortal(
    <div
      className="fixed inset-0 top-0 left-0 right-0 bottom-0 bg-black bg-opacity-60 flex items-center justify-center z-[9999] py-8 px-4 sm:p-4 modal-backdrop-in"
      style={{ margin: 0 }}
      onMouseDown={onClose}
    >
      <div
        className="card-elevated w-full sm:w-[min(880px,95vw)] max-h-[calc(100dvh-4rem)] sm:max-h-[88vh] flex flex-col overflow-hidden"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="h-[3px] w-full" style={{ backgroundColor: teamColors?.primary || 'var(--surface-5)' }} aria-hidden="true" />

        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-surface-4">
          <div className="min-w-0">
            <h2 className="text-xl sm:text-2xl font-bold text-txt-primary truncate">
              {yearNum} Preseason Top 25
            </h2>
            <p className="text-xs text-txt-tertiary mt-0.5">
              Saved per-year. Powers the preseason recap and is referenced by week-1 ranks.
            </p>
          </div>
          <button
            aria-label="Close"
            onClick={onClose}
            className="text-txt-tertiary hover:text-txt-primary transition-colors flex-shrink-0 ml-3"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-2">
            {rows.map((row, index) => (
              <div key={row.rank} className="flex items-center gap-3">
                <div className="w-9 text-right tabular-nums font-display font-bold text-txt-secondary text-sm flex-shrink-0">
                  #{row.rank}
                </div>
                <div className="flex-1 min-w-0">
                  <SearchableSelect
                    options={teamOptions}
                    value={row.teamName}
                    onChange={(v) => updateRow(index, v)}
                    placeholder="Pick team…"
                    teamColors={teamColors}
                    dynastyTeams={currentDynasty?.teams}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="border-t border-surface-4 px-5 sm:px-6 py-4 flex flex-col-reverse sm:flex-row gap-2 sm:items-center sm:justify-between">
          <div className="flex gap-2">
            <button
              onClick={handleClear}
              disabled={saving || isViewOnly}
              className="text-xs text-txt-tertiary hover:text-red-400 transition-colors disabled:opacity-50"
            >
              Clear all
            </button>
          </div>
          <div className="flex gap-2 items-stretch sm:items-center sm:justify-end flex-wrap">
            <button
              onClick={() => setShowAIPrompt(true)}
              className="px-4 py-2 rounded-lg text-sm font-medium border border-surface-4 text-txt-secondary hover:text-txt-primary hover:border-surface-5 transition-colors bg-transparent"
            >
              AI Prompt
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm font-medium border border-surface-4 text-txt-secondary hover:text-txt-primary hover:border-surface-5 transition-colors bg-transparent"
            >
              Close
            </button>
            <button
              onClick={handleSave}
              disabled={saving || isViewOnly}
              className="px-4 py-2 rounded-lg text-sm font-semibold transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-50"
              style={{ backgroundColor: teamColors?.primary || 'var(--text-primary)', color: '#fff' }}
            >
              {saving ? 'Saving…' : 'Save Top 25'}
            </button>
          </div>
        </div>
      </div>

      <AIPromptModal
        isOpen={showAIPrompt}
        onClose={() => setShowAIPrompt(false)}
        title={`${yearNum} Preseason Top 25`}
        prompt={aiPrompt}
        pasteTarget="Paste rank/team pairs back into the rows above"
      />
    </div>,
    document.body,
  )
}
