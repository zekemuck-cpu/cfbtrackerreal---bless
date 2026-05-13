import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { getContrastTextColor } from '../utils/colorUtils'

/**
 * Confirmation modal shown before saving a schedule that would update or
 * remove existing game records. Renders the diff broken into Adding /
 * Changing / Removing sections so the user knows exactly what's about to
 * happen, and surfaces any played-game data that's about to be discarded.
 *
 * Props:
 *   isOpen     bool
 *   onClose    () => void          // cancel
 *   onConfirm  () => void          // proceed with save
 *   diff       output of computeScheduleDiff
 *   primaryColor team primary color (string)
 */
const fmtLocation = (loc) => {
  if (loc === 'home') return 'Home'
  if (loc === 'away') return 'Road'
  if (loc === 'neutral') return 'Neutral'
  return loc || '—'
}

export default function ScheduleSaveConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  diff,
  primaryColor = 'var(--text-primary)',
}) {
  if (!isOpen || !diff) return null

  const { toAdd = [], toUpdate = [], toRemove = [], toKeep = [], playedAffected = [] } = diff
  const totalAffected = toAdd.length + toUpdate.length + toRemove.length
  const hasPlayedImpact = playedAffected.length > 0

  const primaryText = getContrastTextColor(primaryColor)

  // Sort each list by week so the user reads top-down
  const addSorted = [...toAdd].sort((a, b) => a.week - b.week)
  const updateSorted = [...toUpdate].sort((a, b) => a.week - b.week)
  const removeSorted = [...toRemove].sort((a, b) => a.week - b.week)

  const primaryButtonLabel = hasPlayedImpact
    ? `Delete ${playedAffected.length} game${playedAffected.length === 1 ? '' : 's'} and save`
    : 'Update schedule'

  const primaryButtonStyle = hasPlayedImpact
    ? { backgroundColor: 'var(--accent-danger, #dc2626)', color: '#ffffff' }
    : { backgroundColor: primaryColor, color: primaryText }

  return createPortal(
    <div
      className="fixed inset-0 top-0 left-0 right-0 bottom-0 bg-black bg-opacity-70 flex items-center justify-center z-[10000] p-4"
      style={{ margin: 0 }}
      onMouseDown={(e) => {
        e.stopPropagation()
        onClose()
      }}
    >
      <div
        className="bg-surface-1 border border-surface-4 rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col"
        style={{ maxHeight: '85vh' }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="rounded-t-2xl overflow-hidden flex-shrink-0">
          <div className="h-1" style={{ backgroundColor: hasPlayedImpact ? '#dc2626' : primaryColor }} aria-hidden />
          <div className="px-5 py-4 bg-surface-2">
            <h2 className="text-xl font-bold text-txt-primary">Update schedule?</h2>
            <p className="text-sm mt-1 text-txt-tertiary">
              {totalAffected} game record{totalAffected === 1 ? '' : 's'} will be affected
              {toKeep.length > 0 ? ` · ${toKeep.length} unchanged` : ''}
            </p>
          </div>
        </div>

        {/* Played-game warning */}
        {hasPlayedImpact && (
          <div className="px-5 pt-4">
            <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3">
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 mt-0.5 flex-shrink-0 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div className="text-sm text-txt-primary">
                  <div className="font-semibold text-red-300 mb-1">
                    {playedAffected.length} played game{playedAffected.length === 1 ? '' : 's'} will lose data
                  </div>
                  <div className="text-txt-secondary">
                    Scores, results, and any box-score data will be deleted for:
                  </div>
                  <ul className="mt-1.5 space-y-0.5 text-txt-secondary">
                    {playedAffected.map(p => (
                      <li key={p.gameId} className="tabular-nums">
                        Week {p.week} — {p.opponent || p.oldOpponent || '—'}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {addSorted.length > 0 && (
            <Section
              title="Adding"
              count={addSorted.length}
              accent={primaryColor}
              items={addSorted.map(a => ({
                key: `add-${a.week}`,
                left: `Week ${a.week}`,
                right: `${a.opponent} · ${fmtLocation(a.location)}`,
              }))}
            />
          )}

          {updateSorted.length > 0 && (
            <Section
              title="Changing"
              count={updateSorted.length}
              accent={primaryColor}
              items={updateSorted.map(u => ({
                key: `upd-${u.gameId}`,
                left: `Week ${u.week}`,
                right: (
                  <span className="text-sm">
                    <span className="text-txt-tertiary">{u.oldOpponent || '—'} ({fmtLocation(u.oldLocation)})</span>
                    <span className="mx-2 text-txt-tertiary">→</span>
                    <span className="text-txt-primary font-semibold">{u.newOpponent} ({fmtLocation(u.newLocation)})</span>
                    {(u.isPlayed || u.hasBoxScore) && (
                      <span className="ml-2 text-[10px] uppercase tracking-wider text-red-400 font-bold">played</span>
                    )}
                  </span>
                ),
              }))}
            />
          )}

          {removeSorted.length > 0 && (
            <Section
              title="Removing"
              count={removeSorted.length}
              accent="#dc2626"
              items={removeSorted.map(r => ({
                key: `rem-${r.gameId}`,
                left: `Week ${r.week}`,
                right: (
                  <span className="text-sm">
                    <span className="text-txt-secondary">{r.opponent || '—'}</span>
                    {(r.isPlayed || r.hasBoxScore) && (
                      <span className="ml-2 text-[10px] uppercase tracking-wider text-red-400 font-bold">played</span>
                    )}
                  </span>
                ),
              }))}
            />
          )}

          {totalAffected === 0 && (
            <div className="text-sm text-txt-tertiary">No changes detected.</div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-surface-4 bg-surface-2 rounded-b-2xl flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg font-semibold bg-surface-3 text-txt-secondary hover:bg-surface-4 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 rounded-lg font-semibold transition-opacity hover:opacity-90"
            style={primaryButtonStyle}
          >
            {primaryButtonLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

function Section({ title, count, accent, items }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span
          className="inline-block w-2 h-2 rounded-full"
          style={{ backgroundColor: accent }}
          aria-hidden
        />
        <h3 className="text-[11px] font-bold uppercase tracking-wider text-txt-tertiary">
          {title} <span className="text-txt-secondary">({count})</span>
        </h3>
      </div>
      <ul className="rounded-lg border border-surface-4 divide-y divide-surface-4 overflow-hidden">
        {items.map(it => (
          <li key={it.key} className="px-3 py-2 flex items-center justify-between gap-3 bg-surface-2">
            <span className="text-sm font-semibold tabular-nums text-txt-primary flex-shrink-0">{it.left}</span>
            <span className="text-sm text-txt-secondary text-right">{it.right}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
