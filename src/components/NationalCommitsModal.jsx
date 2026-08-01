import { useState, useEffect } from 'react'
import { getContrastTextColor } from '../utils/colorUtils'
import { useToast } from './ui/Toast'

// National Commits — a free-form "247 Top 100" style tracker: record notable
// recruits from around the country and where they committed, regardless of
// whether they were ever your target. No fixed count — add as many as you want.
//
// Stored on the dynasty as nationalCommitsByYear[year] = [{ name, position,
// stars, committedTo }]. It is intentionally NOT tied to a team or to the
// user's own recruiting board — it's a league-wide watch list.

const STARS = ['', '5', '4', '3', '2', '1']

// pid links a row to the real recruit player created for it, so re-saving
// updates that player instead of making a duplicate. null = not created yet.
const emptyRow = () => ({ pid: null, name: '', position: '', stars: '', committedTo: '' })

export default function NationalCommitsModal({
  isOpen,
  onClose,
  onSave,
  existingCommits = [],
  teamColors,
}) {
  const { toast } = useToast()
  const [rows, setRows] = useState([emptyRow()])
  const [saving, setSaving] = useState(false)

  const primaryColor = teamColors?.primary || 'var(--text-primary)'
  const primaryBgText = getContrastTextColor(primaryColor)

  useEffect(() => {
    if (isOpen) {
      const mapped = (existingCommits || []).map(c => ({
        pid: c.pid ?? null,
        name: c.name || '',
        position: c.position || '',
        stars: c.stars != null ? String(c.stars) : '',
        committedTo: c.committedTo || '',
      }))
      // Always leave one blank row at the bottom to type into.
      setRows(mapped.length ? [...mapped, emptyRow()] : [emptyRow()])
    }
  }, [isOpen, existingCommits])

  if (!isOpen) return null

  const updateRow = (index, field, value) => {
    setRows(prev => {
      const next = prev.map((r, i) => (i === index ? { ...r, [field]: value } : r))
      // Auto-append a fresh row when the user starts filling the last one.
      if (index === prev.length - 1 && value && next[index].name.trim()) {
        next.push(emptyRow())
      }
      return next
    })
  }

  const removeRow = (index) => {
    setRows(prev => (prev.length === 1 ? [emptyRow()] : prev.filter((_, i) => i !== index)))
  }

  const addRow = () => setRows(prev => [...prev, emptyRow()])

  // A row counts if it has at least a name (the only required field).
  const validRows = rows
    .filter(r => r.name.trim())
    .map(r => ({
      pid: r.pid ?? null,
      name: r.name.trim(),
      position: r.position.trim(),
      stars: r.stars ? Number(r.stars) : null,
      committedTo: r.committedTo.trim(),
    }))

  const handleSave = async () => {
    setSaving(true)
    try {
      // Saving an empty list is allowed — it marks the task confirmed/done.
      await onSave(validRows)
      onClose()
    } catch (err) {
      console.error('Failed to save national commits:', err)
      toast.error('Failed to save national commits. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 top-0 left-0 right-0 bottom-0 bg-black bg-opacity-70 flex items-center justify-center z-[9999] p-4"
      style={{ margin: 0 }}
      onMouseDown={onClose}
    >
      <div
        className="bg-surface-1 rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col border border-surface-4"
        style={{ maxHeight: '85vh' }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="rounded-t-2xl flex-shrink-0 overflow-hidden">
          <div className="h-1" style={{ backgroundColor: primaryColor }} aria-hidden />
          <div className="px-5 py-4 bg-surface-2 flex justify-between items-start">
            <div>
              <h2 className="text-xl font-bold text-txt-primary">National Commits</h2>
              <p className="text-sm mt-1 text-txt-tertiary">
                Track notable recruits from around the country and where they committed — add as many as you want.
              </p>
            </div>
            <button
              aria-label="Close"
              onClick={onClose}
              className="p-2 -mr-2 -mt-1 rounded-lg hover:bg-surface-3 text-txt-tertiary hover:text-txt-primary transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-2">
          {/* Column labels (desktop) */}
          <div className="hidden sm:grid gap-2 px-1" style={{ gridTemplateColumns: '1fr 5rem 4.5rem 1fr 2rem' }}>
            <span className="text-[11px] font-semibold text-txt-tertiary uppercase tracking-wider">Recruit</span>
            <span className="text-[11px] font-semibold text-txt-tertiary uppercase tracking-wider">Pos</span>
            <span className="text-[11px] font-semibold text-txt-tertiary uppercase tracking-wider">Stars</span>
            <span className="text-[11px] font-semibold text-txt-tertiary uppercase tracking-wider">Committed to</span>
            <span />
          </div>

          {rows.map((row, index) => (
            <div
              key={index}
              className="grid gap-2 items-center"
              style={{ gridTemplateColumns: 'minmax(0,1fr) 5rem 4.5rem minmax(0,1fr) 2rem' }}
            >
              <input
                type="text"
                value={row.name}
                onChange={(e) => updateRow(index, 'name', e.target.value)}
                placeholder="Player name"
                className="w-full px-3 py-2 bg-surface-2 rounded-lg border border-surface-5 text-txt-primary text-sm focus:outline-none focus:border-surface-5"
              />
              <input
                type="text"
                value={row.position}
                onChange={(e) => updateRow(index, 'position', e.target.value.toUpperCase())}
                placeholder="Pos"
                className="w-full px-2 py-2 bg-surface-2 rounded-lg border border-surface-5 text-txt-primary text-sm text-center focus:outline-none focus:border-surface-5"
              />
              <select
                value={row.stars}
                onChange={(e) => updateRow(index, 'stars', e.target.value)}
                className="w-full px-1 py-2 bg-surface-2 rounded-lg border border-surface-5 text-txt-primary text-sm text-center focus:outline-none appearance-none"
                aria-label="Stars"
              >
                {STARS.map(s => (
                  <option key={s || 'none'} value={s}>{s ? `${s}★` : '—'}</option>
                ))}
              </select>
              <input
                type="text"
                value={row.committedTo}
                onChange={(e) => updateRow(index, 'committedTo', e.target.value)}
                placeholder="School"
                className="w-full px-3 py-2 bg-surface-2 rounded-lg border border-surface-5 text-txt-primary text-sm focus:outline-none focus:border-surface-5"
              />
              <button
                onClick={() => removeRow(index)}
                className="p-1.5 rounded-lg text-txt-tertiary hover:bg-surface-3 hover:text-red-400 transition-colors flex items-center justify-center"
                title="Remove"
                aria-label="Remove row"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}

          <button
            onClick={addRow}
            className="w-full py-2.5 rounded-xl border-2 border-dashed border-surface-4 text-txt-tertiary hover:border-surface-5 hover:text-txt-secondary hover:bg-surface-2 transition-all flex items-center justify-center gap-2 mt-1"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            <span className="font-semibold">Add recruit</span>
          </button>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-surface-4 flex-shrink-0 bg-surface-2 rounded-b-2xl">
          <div className="flex flex-col sm:flex-row justify-between items-center gap-3">
            <span className="text-sm text-txt-tertiary">
              {validRows.length > 0
                ? <><span className="font-bold text-txt-primary">{validRows.length}</span> recruit{validRows.length !== 1 ? 's' : ''} ready</>
                : 'Add recruits, or save empty to mark done'}
            </span>
            <div className="flex gap-2">
              <button
                onClick={onClose}
                disabled={saving}
                className="px-4 py-2 rounded-lg font-semibold bg-surface-3 text-txt-secondary hover:bg-surface-4 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 rounded-lg font-semibold transition-all disabled:opacity-50"
                style={{ backgroundColor: primaryColor, color: primaryBgText }}
              >
                {saving ? 'Saving…' : (validRows.length > 0 ? 'Save' : 'Done')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
