import { useMemo, useState } from 'react'
import ConfirmModal from './ConfirmModal'

const STAR = (n) => '★'.repeat(Math.max(0, Math.min(5, Number(n) || 0)))

// Bulk-clear UI for the Targets page. Only open (uncommitted) targets are
// eligible — committed recruits (yours or another team's) are effectively
// next season's roster players, not just board entries, so they're excluded
// entirely rather than risk sweeping one up in a "Clear All". Every eligible
// target is checked by default; unchecking one keeps it exactly as-is.
export default function ClearAllTargetsModal({ targets, onClose, onConfirm }) {
  const openTargets = useMemo(() => targets.filter(t => t.status === 'open'), [targets])
  const committedCount = targets.length - openTargets.length

  const [selected, setSelected] = useState(() => new Set(openTargets.map(t => t.p.pid)))
  const [pendingMode, setPendingMode] = useState(null) // 'keep' | 'full' | null
  const [working, setWorking] = useState(false)

  const toggle = (pid) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(pid)) next.delete(pid)
      else next.add(pid)
      return next
    })
  }

  const selectedCount = selected.size

  const handleConfirm = async () => {
    if (!pendingMode || working) return
    setWorking(true)
    try {
      await onConfirm(Array.from(selected), pendingMode)
      onClose()
    } catch (error) {
      console.error('Clear All Targets failed:', error)
      setPendingMode(null)
    } finally {
      setWorking(false)
    }
  }

  return (
    <>
      <div
        className="fixed inset-0 top-0 left-0 right-0 bottom-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999] p-4"
        style={{ margin: 0 }}
        onClick={onClose}
      >
        <div
          className="bg-surface-1 border border-surface-4 rounded-2xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-5 py-4 border-b border-surface-4 flex items-center justify-between flex-shrink-0">
            <h2 className="font-display font-black uppercase text-txt-primary" style={{ fontSize: '15px', letterSpacing: '0.02em' }}>
              Clear All Targets
            </h2>
            <button onClick={onClose} className="text-txt-tertiary hover:text-txt-primary text-sm">Close</button>
          </div>

          <div className="px-5 py-3 border-b border-surface-4 flex-shrink-0 text-[12px] text-txt-tertiary space-y-1">
            <p>Uncheck anyone you want to keep. Everything else will be cleared from the Big Board and Removed box.</p>
            {committedCount > 0 && (
              <p>{committedCount} committed recruit{committedCount === 1 ? '' : 's'} {committedCount === 1 ? 'is' : 'are'} not shown here and won't be affected.</p>
            )}
          </div>

          <div className="flex items-center gap-3 px-5 py-2 border-b border-surface-4 flex-shrink-0 text-[11px]">
            <button onClick={() => setSelected(new Set(openTargets.map(t => t.p.pid)))} className="text-txt-secondary hover:text-txt-primary underline">
              Select All
            </button>
            <button onClick={() => setSelected(new Set())} className="text-txt-secondary hover:text-txt-primary underline">
              Select None
            </button>
            <span className="text-txt-tertiary ml-auto">{selectedCount} of {openTargets.length} selected</span>
          </div>

          <div className="overflow-y-auto flex-1">
            {openTargets.length === 0 ? (
              <div className="px-5 py-8 text-center text-sm text-txt-tertiary">No open targets to clear.</div>
            ) : openTargets.map(({ p }) => (
              <label
                key={p.pid}
                className="flex items-center gap-3 px-5 py-2.5 border-b border-surface-4 last:border-b-0 hover:bg-surface-2 cursor-pointer"
              >
                <input type="checkbox" checked={selected.has(p.pid)} onChange={() => toggle(p.pid)} className="flex-shrink-0" />
                <span className="flex-1 min-w-0 truncate text-[13px] text-txt-primary font-semibold">{p.name}</span>
                {Number(p.stars) > 0 && (
                  <span className="text-[10px] flex-shrink-0" style={{ color: 'var(--accent-warning)' }}>{STAR(p.stars)}</span>
                )}
                <span className="text-[11px] text-txt-tertiary flex-shrink-0 w-10 text-right">{p.position || ''}</span>
                <span className="text-[10px] text-txt-tertiary flex-shrink-0 w-16 text-right uppercase">
                  {p.boardRemoved ? 'Removed' : 'On Board'}
                </span>
              </label>
            ))}
          </div>

          <div className="px-5 py-4 border-t border-surface-4 flex-shrink-0 flex flex-col gap-2">
            <button
              disabled={selectedCount === 0}
              onClick={() => setPendingMode('keep')}
              className="w-full h-9 rounded-md text-[13px] font-semibold bg-surface-3 border border-surface-5 text-txt-primary hover:bg-surface-4 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Clear Selected — Keep in Database
            </button>
            <button
              disabled={selectedCount === 0}
              onClick={() => setPendingMode('full')}
              className="w-full h-9 rounded-md text-[13px] font-semibold bg-danger text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Clear Selected — Remove From Database Too
            </button>
          </div>
        </div>
      </div>

      <ConfirmModal
        isOpen={!!pendingMode}
        onClose={() => { if (!working) setPendingMode(null) }}
        onConfirm={handleConfirm}
        title="Are you sure?"
        message={
          pendingMode === 'keep'
            ? `Remove ${selectedCount} target${selectedCount === 1 ? '' : 's'} from the Targets page? ${selectedCount === 1 ? 'It' : 'They'} will stay in the Recruiting Database permanently. This cannot be undone.`
            : `Remove ${selectedCount} target${selectedCount === 1 ? '' : 's'} from the Targets page AND the Recruiting Database? This cannot be undone.`
        }
        confirmText="Clear"
        cancelText="Cancel"
        loading={working}
      />
    </>
  )
}
