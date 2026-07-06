import { useState, useMemo } from 'react'
import DuplicateReviewList from './DuplicateReviewList'

// Lightweight duplicate-review prompt for the local-paste import — no "here's
// what's about to happen" explanation needed, just the review list itself
// when findDuplicateClusters() flags something.
export default function DuplicateReviewModal({ isOpen, onClose, duplicateClusters = [], onConfirm, confirming = false }) {
  const [kept, setKept] = useState(() => new Set())
  const allPids = useMemo(() => duplicateClusters.flat().map(p => p.pid), [duplicateClusters])
  const isKept = (pid) => !kept.has(`deleted:${pid}`)
  const toggle = (pid) => setKept(prev => {
    const next = new Set(prev)
    const key = `deleted:${pid}`
    if (next.has(key)) next.delete(key)
    else next.add(key)
    return next
  })

  if (!isOpen) return null

  const handleConfirm = () => {
    const deletedPids = new Set(allPids.filter(pid => kept.has(`deleted:${pid}`)))
    onConfirm(deletedPids)
  }

  return (
    <div
      className="fixed inset-0 top-0 left-0 right-0 bottom-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999] p-4"
      style={{ margin: 0 }}
      onClick={onClose}
    >
      <div
        className="bg-surface-2 border border-surface-4 rounded-xl w-full max-w-2xl max-h-[85vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-surface-4 flex-shrink-0">
          <h2 className="text-sm font-display font-bold uppercase text-txt-primary">Possible Duplicates</h2>
          <button
            onClick={onClose}
            className="text-xs font-display font-bold uppercase text-txt-secondary hover:text-txt-primary transition px-3 py-1.5 rounded-lg border border-surface-4 hover:bg-surface-3"
          >
            Cancel Import
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <DuplicateReviewList duplicateClusters={duplicateClusters} isKept={isKept} onToggle={toggle} />
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-surface-4 flex-shrink-0">
          <button
            onClick={handleConfirm}
            disabled={confirming}
            className="text-xs font-display font-bold uppercase transition px-4 py-2 rounded-lg disabled:opacity-50"
            style={{ backgroundColor: 'var(--text-primary)', color: 'var(--surface-1)' }}
          >
            {confirming ? 'Importing…' : 'Confirm Import'}
          </button>
        </div>
      </div>
    </div>
  )
}
