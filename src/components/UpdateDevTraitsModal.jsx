import { useState, useMemo } from 'react'

const DEV_TRAIT_OPTIONS = ['Hidden', 'Normal', 'Impact', 'Star', 'Elite']

// All-local checklist for filling in now-revealed dev traits at National Signing
// Day / Early National Signing Day (Bowl Week 1) — deliberately no AI/Sheets
// involved, just a dropdown per recruit. `players` is this dynasty's own targets
// for the signing class in question (see Dashboard.jsx), each carrying the exact
// same `recentRank` shown in the Database table (computed via the shared
// computeRecentRanks — see Dashboard.jsx) and their current `devTrait`
// (Hidden/blank for anyone not yet revealed). Saving writes the changed values
// straight back onto the real Target records — Thresholds/History pick them up
// automatically on their next read, since both now read the live pool filtered
// to known dev traits only.
export default function UpdateDevTraitsModal({ isOpen, onClose, players = [], onSave, saving = false }) {
  const sorted = useMemo(
    () => [...players].sort((a, b) => (a.recentRank ?? 0) - (b.recentRank ?? 0)),
    [players]
  )
  const [values, setValues] = useState(() => Object.fromEntries(sorted.map(p => [p.pid, p.devTrait || 'Hidden'])))

  if (!isOpen) return null

  const knownCount = Object.values(values).filter(v => v && v !== 'Hidden').length
  const totalCount = sorted.length

  const handleSave = () => {
    const updates = sorted
      .filter(p => (values[p.pid] || 'Hidden') !== (p.devTrait || 'Hidden'))
      .map(p => ({ pid: p.pid, devTrait: values[p.pid] }))
    onSave(updates)
  }

  return (
    <div
      className="fixed inset-0 top-0 left-0 right-0 bottom-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999] p-4"
      style={{ margin: 0 }}
      onClick={onClose}
    >
      <div
        className="bg-surface-2 border border-surface-4 rounded-xl w-full max-w-xl max-h-[85vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-surface-4 flex-shrink-0">
          <div>
            <h2 className="text-sm font-display font-bold uppercase text-txt-primary">Update Dev Traits</h2>
            <p className="text-[10px] text-txt-tertiary mt-0.5">
              {knownCount} of {totalCount} known
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-xs font-display font-bold uppercase text-txt-secondary hover:text-txt-primary transition px-3 py-1.5 rounded-lg border border-surface-4 hover:bg-surface-3"
          >
            Cancel
          </button>
        </div>

        <div className="px-5 py-3 border-b border-surface-4 flex-shrink-0 bg-surface-3">
          <p className="text-xs text-txt-secondary leading-relaxed">
            Set each recruit's now-revealed dev trait below. Anyone left on "Hidden" just
            stays that way in the Database — nothing is lost, and they'll count toward
            Thresholds/History the moment you do fill theirs in, whenever that is.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-1.5">
          {sorted.length === 0 ? (
            <p className="text-xs text-txt-tertiary italic text-center py-10">
              No targets found for this signing class.
            </p>
          ) : (
            sorted.map(p => (
              <div key={p.pid} className="flex items-center gap-3 bg-surface-3 border border-surface-4 rounded-lg px-3 py-2">
                <span className="text-[10px] tabular-nums text-txt-tertiary w-6 flex-shrink-0 text-right">
                  {p.recentRank ?? '—'}
                </span>
                <span className="flex-1 min-w-0 text-xs font-semibold text-txt-primary truncate">{p.name}</span>
                <select
                  value={values[p.pid] || 'Hidden'}
                  onChange={e => setValues(v => ({ ...v, [p.pid]: e.target.value }))}
                  className="text-xs bg-surface-2 border border-surface-4 rounded-lg px-2 py-1 text-txt-primary focus:outline-none flex-shrink-0"
                >
                  {DEV_TRAIT_OPTIONS.map(opt => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>
            ))
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-surface-4 flex-shrink-0">
          <button
            onClick={handleSave}
            disabled={saving || sorted.length === 0}
            className="text-xs font-display font-bold uppercase transition px-4 py-2 rounded-lg disabled:opacity-50"
            style={{ backgroundColor: 'var(--text-primary)', color: 'var(--surface-1)' }}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
