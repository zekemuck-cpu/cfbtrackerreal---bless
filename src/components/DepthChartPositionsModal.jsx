import { useState } from 'react'
import { createPortal } from 'react-dom'
import { DEPTH_CHART_CATALOG, DEFAULT_DEPTH_POSITIONS } from '../utils/outlookBoard'

const SIDE_LABELS = { offense: 'Offense', defense: 'Defense', st: 'Special Teams' }

/**
 * DepthChartPositionsModal — per-dynasty settings for which depth-chart columns
 * appear on each unit. Base columns are on by default; extras (WR2, Slot WR,
 * DT2, Nickel, Dime, …) are opt-in. Saving writes the full enabled-id set per
 * side; an empty side falls back to its base columns at render time.
 */
export default function DepthChartPositionsModal({ enabled, onSave, onClose }) {
  const [sel, setSel] = useState(() => {
    const out = {}
    for (const side of Object.keys(DEPTH_CHART_CATALOG)) {
      out[side] = new Set(enabled?.[side]?.length ? enabled[side] : DEFAULT_DEPTH_POSITIONS[side])
    }
    return out
  })

  const toggle = (side, id) => setSel(prev => {
    const next = new Set(prev[side])
    if (next.has(id)) next.delete(id); else next.add(id)
    return { ...prev, [side]: next }
  })

  const resetSide = (side) => setSel(prev => ({ ...prev, [side]: new Set(DEFAULT_DEPTH_POSITIONS[side]) }))

  const save = () => {
    const out = {}
    for (const side of Object.keys(DEPTH_CHART_CATALOG)) {
      // Keep catalog order so saved rows render in formation order.
      out[side] = DEPTH_CHART_CATALOG[side].filter(sl => sel[side].has(sl.id)).map(sl => sl.id)
    }
    onSave(out)
  }

  if (typeof document === 'undefined') return null

  return createPortal(
    <div
      className="fixed inset-0 top-0 left-0 right-0 bottom-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999] p-4"
      style={{ margin: 0 }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg max-h-[85vh] flex flex-col rounded-xl overflow-hidden"
        style={{ backgroundColor: 'var(--surface-1)', border: '1px solid var(--surface-4)', boxShadow: '0 28px 80px rgba(0,0,0,0.7)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <header
          className="px-5 py-3 flex-shrink-0"
          style={{ backgroundColor: 'var(--surface-2)', borderBottom: '1px solid var(--surface-4)' }}
        >
          <h2 className="text-base font-bold text-txt-primary leading-tight" style={{ fontFamily: 'var(--font-display)' }}>
            Depth Chart Positions
          </h2>
          <div className="text-[11px] text-txt-tertiary mt-0.5">
            Choose which columns show on each unit. Applies to every team.
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {Object.keys(DEPTH_CHART_CATALOG).map(side => (
            <section key={side}>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-bold uppercase tracking-wide text-txt-secondary">{SIDE_LABELS[side]}</h3>
                <button
                  type="button"
                  onClick={() => resetSide(side)}
                  className="text-[11px] font-semibold text-txt-tertiary hover:text-txt-primary transition-colors"
                >
                  Reset to default
                </button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                {DEPTH_CHART_CATALOG[side].map(sl => {
                  const checked = sel[side].has(sl.id)
                  return (
                    <label
                      key={sl.id}
                      className="flex items-center gap-2 px-2.5 py-1.5 rounded cursor-pointer text-sm transition-colors"
                      style={{
                        backgroundColor: checked ? 'var(--surface-3)' : 'var(--surface-2)',
                        color: checked ? 'var(--text-primary)' : 'var(--text-tertiary)',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggle(side, sl.id)}
                        style={{ accentColor: 'var(--accent-info)' }}
                      />
                      <span className="truncate">{sl.label}</span>
                      {!sl.base && (
                        <span className="ml-auto text-[9px] font-semibold uppercase tracking-wide text-txt-tertiary">extra</span>
                      )}
                    </label>
                  )
                })}
              </div>
            </section>
          ))}
        </div>

        <footer
          className="flex items-center justify-end gap-2 px-5 py-3 flex-shrink-0"
          style={{ backgroundColor: 'var(--surface-2)', borderTop: '1px solid var(--surface-4)' }}
        >
          <button
            type="button"
            onClick={onClose}
            className="text-xs font-semibold px-3 py-1.5 rounded border border-surface-5 text-txt-secondary hover:text-txt-primary hover:bg-surface-3 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            className="text-xs font-bold px-4 py-1.5 rounded text-white transition-colors"
            style={{ backgroundColor: 'var(--accent-info)' }}
          >
            Save
          </button>
        </footer>
      </div>
    </div>,
    document.body
  )
}
