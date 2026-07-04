import { useState, useMemo } from 'react'
import DuplicateReviewList from './DuplicateReviewList'

// One-time "set up your shared Recruiting Database" flow — shown when a dynasty's
// Recruiting Database has never been pooled with its siblings (or a sibling pool
// already exists and this dynasty has its own leftover data to fold in). Two steps:
//   1. Confirm — explains what's about to happen, offers a JSON-download safety net.
//   2. Review — only shown if findDuplicateClusters() found possible duplicates;
//      one row per cluster, Keep/Delete checkbox per member.
export default function RecruitingDatabaseMigrationModal({
  isOpen,
  onClose,
  hostDynastyName,
  foldingInDynastyNames = [],
  mergedCount,
  duplicateClusters = [],
  onBackupNow,
  onConfirm,
  confirming = false,
}) {
  const [step, setStep] = useState('confirm')
  const [kept, setKept] = useState(() => new Set())

  // Every member starts "kept" — nothing is ever auto-deleted without the user
  // explicitly unchecking it.
  const allPids = useMemo(() => duplicateClusters.flat().map(p => p.pid), [duplicateClusters])
  const isKept = (pid) => !kept.has(`deleted:${pid}`) // inverted storage below reads cleaner; see toggle
  const toggle = (pid) => setKept(prev => {
    const next = new Set(prev)
    const key = `deleted:${pid}`
    if (next.has(key)) next.delete(key)
    else next.add(key)
    return next
  })

  if (!isOpen) return null

  const hasDuplicates = duplicateClusters.length > 0

  const handleContinue = () => {
    if (hasDuplicates) setStep('review')
    else onConfirm(new Set())
  }

  const handleFinalConfirm = () => {
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
          <h2 className="text-sm font-display font-bold uppercase text-txt-primary">
            {step === 'confirm' ? 'Set Up Your Shared Recruiting Database' : 'Possible Duplicates'}
          </h2>
          <button
            onClick={onClose}
            className="text-xs font-display font-bold uppercase text-txt-secondary hover:text-txt-primary transition px-3 py-1.5 rounded-lg border border-surface-4 hover:bg-surface-3"
          >
            Cancel
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {step === 'confirm' ? (
            <>
              <p className="text-sm text-txt-secondary leading-relaxed">
                Every dynasty on your account is about to share one Recruiting Database
                instead of each keeping its own. <strong className="text-txt-primary">{hostDynastyName}</strong>'s
                sheet becomes the one shared sheet going forward.
              </p>
              {foldingInDynastyNames.length > 0 && (
                <p className="text-sm text-txt-secondary leading-relaxed">
                  Folding in recruits from: <strong className="text-txt-primary">{foldingInDynastyNames.join(', ')}</strong>
                  {' '}— {mergedCount} recruit{mergedCount !== 1 ? 's' : ''} total once merged.
                </p>
              )}
              <div className="bg-surface-3 border border-surface-4 rounded-lg p-3">
                <p className="text-xs text-txt-secondary leading-relaxed mb-2">
                  This can't destroy any data — every dynasty's own sheet stays in your
                  Google Drive untouched. But as a safety net, you can download everything
                  about to be merged as a JSON backup file before continuing.
                </p>
                <button
                  onClick={onBackupNow}
                  className="text-xs font-display font-bold uppercase text-txt-secondary hover:text-txt-primary transition px-3 py-1.5 rounded-lg border border-surface-4 hover:bg-surface-3"
                >
                  Download Backup
                </button>
              </div>
              {hasDuplicates && (
                <p className="text-xs text-txt-tertiary italic">
                  {duplicateClusters.length} possible duplicate{duplicateClusters.length !== 1 ? 's' : ''} found —
                  you'll get a chance to review {duplicateClusters.length !== 1 ? 'them' : 'it'} next.
                </p>
              )}
            </>
          ) : (
            <DuplicateReviewList duplicateClusters={duplicateClusters} isKept={isKept} onToggle={toggle} />
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-surface-4 flex-shrink-0">
          {step === 'review' && (
            <button
              onClick={() => setStep('confirm')}
              className="text-xs font-display font-bold uppercase text-txt-secondary hover:text-txt-primary transition px-3 py-1.5 rounded-lg border border-surface-4 hover:bg-surface-3"
            >
              Back
            </button>
          )}
          <button
            onClick={step === 'confirm' ? handleContinue : handleFinalConfirm}
            disabled={confirming}
            className="text-xs font-display font-bold uppercase transition px-4 py-2 rounded-lg disabled:opacity-50"
            style={{ backgroundColor: 'var(--text-primary)', color: 'var(--surface-1)' }}
          >
            {confirming ? 'Setting up…' : step === 'confirm' ? (hasDuplicates ? 'Continue' : 'Confirm') : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  )
}
