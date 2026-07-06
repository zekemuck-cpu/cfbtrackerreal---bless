import { useState, useEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useToast } from './ui/Toast'
import SheetModalHeader from './ui/SheetModalHeader'
import { RECRUIT_POSITIONS } from '../services/sheetsService'
import { positionBucket, recruitingPosLabel, ATTRIBUTE_ABBR } from '../utils/recruitAttributes'
import { getFormAttrs } from '../utils/devTraitLearning'
import { resolveRecruitGroup } from '../utils/recruitGroup'

const CLASS_OPTIONS = ['HS', 'JUCO Fr', 'JUCO So', 'JUCO Jr', 'Fr', 'RS Fr', 'So', 'RS So', 'Jr', 'RS Jr']
const GEM_BUST_OPTIONS = ['', 'Gem', 'Bust']
const DEV_TRAIT_OPTIONS = ['Hidden', 'Normal', 'Impact', 'Star', 'Elite']

// Every attribute key this row should show an editable box for: the
// position/archetype's own canonical form order first, then any attribute
// that already has a real value but falls outside that set (e.g. leftover
// from a position change) — never silently dropped just because it isn't
// "supposed to" apply. Fixed once at seed time; changing Position mid-batch-
// edit doesn't reshuffle which boxes are showing (a targeted single-row edit
// is the right tool for that).
function attrKeysFor(r) {
  const formOrder = getFormAttrs(r.position, r.archetype) || []
  const extra = Object.keys(r.attributes || {}).filter(k => !formOrder.includes(k) && r.attributes[k] != null)
  return [...formOrder, ...extra]
}

// One editable row's form state, seeded from a recruit object. Every field the
// grid can touch lives here as a plain string/number the <input>/<select> can
// bind to directly — converted back to the recruit's real shape on save (see
// formToRecruitFields below).
function recruitToForm(r, attrKeys) {
  const attrs = {}
  attrKeys.forEach(k => { attrs[k] = r.attributes?.[k] ?? '' })
  return {
    name: r.name || '',
    class: r.class || 'HS',
    rawPosition: r.rawPosition || r.position || '',
    archetype: r.archetype || '',
    stars: r.stars ?? 0,
    nationalRank: r.nationalRank ?? '',
    stateRank: r.stateRank ?? '',
    positionRank: r.positionRank ?? '',
    height: r.height || '',
    weight: r.weight ?? '',
    hometown: r.hometown || '',
    state: r.state || '',
    gemBust: r.gemBust || '',
    devTrait: r.devTrait || '',
    attrs,
  }
}

// Reverses recruitToForm, applying the same field derivations
// parseRecruitingDatabaseRow does for a pasted row (position bucketing) —
// just working directly off form fields since there's no paste/TSV involved
// here. Blank attribute boxes save as 0, matching the single-row EditModal's
// own save behavior (its visibleAttrs -> attributes conversion does the same)
// rather than silently omitting the attribute.
function formToRecruitFields(form, attrKeys) {
  const rawPosition = String(form.rawPosition || '').trim()
  const position = positionBucket(rawPosition) || rawPosition
  const archetype = String(form.archetype || '').trim()
  const attributes = {}
  attrKeys.forEach(k => { attributes[k] = parseInt(form.attrs[k], 10) || 0 })
  return {
    name: String(form.name || '').trim(),
    class: String(form.class || 'HS').trim() || 'HS',
    position,
    rawPosition,
    archetype,
    group: resolveRecruitGroup(position, archetype),
    stars: Math.max(0, Math.min(5, Number(form.stars) || 0)),
    nationalRank: form.nationalRank === '' ? null : parseInt(form.nationalRank, 10),
    stateRank: form.stateRank === '' ? null : parseInt(form.stateRank, 10),
    positionRank: form.positionRank === '' ? null : parseInt(form.positionRank, 10),
    height: String(form.height || '').trim(),
    weight: form.weight === '' ? null : parseInt(form.weight, 10),
    hometown: String(form.hometown || '').trim(),
    state: String(form.state || '').trim(),
    gemBust: form.gemBust || '',
    devTrait: form.devTrait || '',
    attributes,
  }
}

const BASE_FIELD_ORDER = [
  'name', 'class', 'rawPosition', 'archetype', 'stars', 'nationalRank', 'stateRank',
  'positionRank', 'height', 'weight', 'hometown', 'state', 'gemBust', 'devTrait',
]

function formsDiffer(a, b, attrKeys) {
  if (BASE_FIELD_ORDER.some(k => String(a[k] ?? '') !== String(b[k] ?? ''))) return true
  return attrKeys.some(k => String(a.attrs[k] ?? '') !== String(b.attrs[k] ?? ''))
}

const inputCls = 'w-full bg-transparent text-txt-primary px-2 py-1 text-xs focus:outline-none focus:bg-surface-3 border border-transparent focus:border-surface-5 rounded'

function Cell({ children, className = '' }) {
  return <td className={`border border-surface-4 p-0 ${className}`}>{children}</td>
}

function TextCell({ value, onChange, placeholder, className = '', numeric = false }) {
  return (
    <Cell>
      <input
        type={numeric ? 'number' : 'text'}
        value={value}
        placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        className={`${inputCls} ${className}`}
      />
    </Cell>
  )
}

function SelectCell({ value, options, onChange, labelFor = (o) => o }) {
  return (
    <Cell>
      <select value={value} onChange={e => onChange(e.target.value)} className={inputCls}>
        {options.map(o => <option key={o} value={o}>{labelFor(o) || '—'}</option>)}
      </select>
    </Cell>
  )
}

// Every attribute this recruit has, as its own small labeled box — never a
// single cramped text cell you have to click into to see what's there. Wraps
// onto multiple lines within the cell instead of running one unbroken row, so
// a 20-attribute lineman doesn't blow the column out past what's readable.
function AttributesCell({ attrKeys, attrs, onChange }) {
  if (!attrKeys.length) {
    return <Cell className="text-center text-txt-muted text-[10px] py-2">No attributes yet</Cell>
  }
  return (
    <Cell>
      <div className="flex flex-wrap gap-1 p-1 max-w-[560px]">
        {attrKeys.map(k => (
          <label key={k} title={k} className="flex items-center gap-1 bg-surface-3 border border-surface-4 rounded px-1 py-0.5">
            <span className="text-[9px] font-semibold text-txt-tertiary">{ATTRIBUTE_ABBR[k] || k}</span>
            <input
              type="number"
              min="0"
              max="99"
              value={attrs[k]}
              onChange={e => onChange(k, e.target.value)}
              className="w-9 bg-transparent text-txt-primary text-xs text-center focus:outline-none"
            />
          </label>
        ))}
      </div>
    </Cell>
  )
}

// Batch-edit every currently-visible recruit (real Targets AND actual
// recruitingDatabasePlayers entries — the same combined set the Database
// table shows) in one big scrollable grid, all rows/columns visible at once
// (no pagination — you scroll, you never page). The Name column is sticky
// (stays pinned to the left edge while scrolling right) so you always know
// whose row you're on, even out at the Attributes columns on the far right.
//
// Delete works for every row, but means two different things depending on
// where the recruit lives: a recruitingDatabasePlayers entry is deleted
// outright (gone for good). A real Target has no delete path anywhere in the
// app today (deleting one is a bigger action than this reference view should
// trigger) — so "deleting" one here instead adds it to
// recruitingDatabaseExcludedPids, hiding it from this Database view only. The
// actual Target/roster record, and everything downstream of it (Targets
// board, Commitments, stats), is completely untouched.
//
// Saving is deliberately NOT "call the single-row save handler once per
// changed row": recruitingDatabasePlayers edits/deletes are applied as ONE
// combined array + ONE updateDynasty call (onSaveBatch below), because the
// single-row handler closes over a snapshot of recruitingDatabasePlayers from
// this render — calling it N times in a loop would have each call compute
// its own "next array" from that SAME stale snapshot, so only the LAST of N
// changes would actually survive. Real-Target edits (dynasty.players, routed
// through onEdit -> updatePlayer) don't have that problem — updatePlayer
// re-reads the dynasty fresh on every call — so those are simply looped.
export default function RecruitingDatabaseBatchEditModal({ isOpen, onClose, players = [], isFromRecruitingDatabase, onSaveBatch }) {
  const { toast } = useToast()
  const [rows, setRows] = useState([])
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const seededRef = useRef(false)

  // Re-seed from the live player list every time the modal is (re)opened —
  // never mid-session, so in-progress edits are never clobbered by an
  // unrelated background refresh.
  useEffect(() => {
    if (isOpen && !seededRef.current) {
      seededRef.current = true
      setRows(players.map(p => {
        const attrKeys = attrKeysFor(p)
        return { pid: p.pid, original: p, attrKeys, form: recruitToForm(p, attrKeys), deleted: false }
      }))
      setSearch('')
    }
    if (!isOpen) seededRef.current = false
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  const updateField = (pid, field, value) => {
    setRows(prev => prev.map(r => (r.pid === pid ? { ...r, form: { ...r.form, [field]: value } } : r)))
  }
  const updateAttr = (pid, key, value) => {
    setRows(prev => prev.map(r => (r.pid === pid ? { ...r, form: { ...r.form, attrs: { ...r.form.attrs, [key]: value } } } : r)))
  }
  const markDeleted = (pid) => {
    setRows(prev => prev.map(r => (r.pid === pid ? { ...r, deleted: true } : r)))
  }
  const undoDelete = (pid) => {
    setRows(prev => prev.map(r => (r.pid === pid ? { ...r, deleted: false } : r)))
  }

  const visibleRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(r => r.form.name.toLowerCase().includes(q) || r.form.rawPosition.toLowerCase().includes(q))
  }, [rows, search])

  const pendingDeleteCount = rows.filter(r => r.deleted).length
  const changedCount = rows.filter(r => !r.deleted && formsDiffer(r.form, recruitToForm(r.original, r.attrKeys), r.attrKeys)).length

  const handleSave = async () => {
    setSaving(true)
    try {
      const changedRows = rows
        .filter(r => !r.deleted && formsDiffer(r.form, recruitToForm(r.original, r.attrKeys), r.attrKeys))
        .map(r => ({ original: r.original, updated: { ...r.original, ...formToRecruitFields(r.form, r.attrKeys) } }))
      const deletedPids = rows.filter(r => r.deleted).map(r => r.pid)
      await onSaveBatch({ changedRows, deletedPids })
      const parts = []
      if (changedRows.length) parts.push(`${changedRows.length} updated`)
      if (deletedPids.length) parts.push(`${deletedPids.length} removed`)
      toast.success(parts.length ? `Batch edit saved — ${parts.join(', ')}.` : 'No changes to save.')
      onClose?.()
    } catch (error) {
      console.error('Batch edit save error:', error)
      toast.error('Failed to save some changes. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  if (!isOpen) return null

  // Sticky-left styling shared by the Name column's header + body cells —
  // needs an opaque background (not the table's own transparent cell bg) so
  // scrolled-past columns don't show through underneath it.
  const stickyNameTh = 'sticky left-0 z-20 bg-surface-3 border border-surface-4 px-2 py-2 text-left min-w-[160px]'
  const stickyNameTd = 'sticky left-0 z-[5] bg-surface-2 border border-surface-4 p-0'

  return createPortal(
    <div
      className="fixed inset-0 top-0 left-0 right-0 bottom-0 bg-black bg-opacity-70 flex items-center justify-center z-[9999] py-8 px-4 sm:p-4"
      style={{ margin: 0 }}
      onMouseDown={onClose}
    >
      <div
        className="card-elevated w-full sm:w-[95vw] sm:h-[90dvh] flex flex-col overflow-hidden"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <SheetModalHeader title="Batch Edit Recruiting Database" onClose={onClose} />

        <div className="flex-1 flex flex-col overflow-hidden p-4 sm:p-6 gap-3">
          <div className="flex items-center gap-3 flex-shrink-0">
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Filter by name or position…"
              className="flex-1 max-w-xs bg-surface-3 border border-surface-4 rounded-lg px-3 py-1.5 text-sm text-txt-primary focus:outline-none focus:border-surface-5"
            />
            <span className="text-xs text-txt-tertiary">
              {visibleRows.filter(r => !r.deleted).length} of {rows.length} shown
              {pendingDeleteCount > 0 && ` · ${pendingDeleteCount} marked for removal`}
            </span>
          </div>

          {/* Scrolls both ways so every column stays reachable without paging —
              nothing here is hidden behind a "next page" click. Name stays
              pinned to the left edge (see stickyNameTh/Td) so scrolling right
              to the Attributes columns never loses track of whose row it is. */}
          <div className="flex-1 overflow-auto rounded-lg border border-surface-4">
            <table className="text-xs border-collapse w-full">
              <thead className="sticky top-0 z-10 bg-surface-3">
                <tr className="text-[10px] font-semibold uppercase tracking-wide text-txt-tertiary">
                  <th className={stickyNameTh} style={{ boxShadow: '2px 0 0 var(--surface-4)' }}>Name</th>
                  <th className="border border-surface-4 px-2 py-2 text-left min-w-[90px]">Class</th>
                  <th className="border border-surface-4 px-2 py-2 text-left min-w-[80px]">Pos</th>
                  <th className="border border-surface-4 px-2 py-2 text-left min-w-[160px]">Archetype</th>
                  <th className="border border-surface-4 px-2 py-2 text-left min-w-[60px]">Stars</th>
                  <th className="border border-surface-4 px-2 py-2 text-left min-w-[70px]">Natl Rk</th>
                  <th className="border border-surface-4 px-2 py-2 text-left min-w-[70px]">St Rk</th>
                  <th className="border border-surface-4 px-2 py-2 text-left min-w-[70px]">Pos Rk</th>
                  <th className="border border-surface-4 px-2 py-2 text-left min-w-[80px]">Height</th>
                  <th className="border border-surface-4 px-2 py-2 text-left min-w-[70px]">Weight</th>
                  <th className="border border-surface-4 px-2 py-2 text-left min-w-[120px]">Hometown</th>
                  <th className="border border-surface-4 px-2 py-2 text-left min-w-[60px]">State</th>
                  <th className="border border-surface-4 px-2 py-2 text-left min-w-[90px]">Gem/Bust</th>
                  <th className="border border-surface-4 px-2 py-2 text-left min-w-[90px]">Dev</th>
                  <th className="border border-surface-4 px-2 py-2 text-left min-w-[300px]">Attributes</th>
                  <th className="border border-surface-4 px-2 py-2 text-center min-w-[70px]">Delete</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map(r => {
                  const isDbOnly = isFromRecruitingDatabase?.(r.original)
                  return (
                    <tr key={r.pid} className={r.deleted ? 'opacity-40' : undefined}>
                      <td className={stickyNameTd} style={{ boxShadow: '2px 0 0 var(--surface-4)' }}>
                        <input
                          type="text"
                          value={r.form.name}
                          onChange={e => updateField(r.pid, 'name', e.target.value)}
                          className={inputCls}
                        />
                      </td>
                      <SelectCell value={r.form.class} options={CLASS_OPTIONS} onChange={v => updateField(r.pid, 'class', v)} />
                      <SelectCell
                        value={r.form.rawPosition}
                        options={RECRUIT_POSITIONS}
                        labelFor={recruitingPosLabel}
                        onChange={v => updateField(r.pid, 'rawPosition', v)}
                      />
                      <TextCell value={r.form.archetype} onChange={v => updateField(r.pid, 'archetype', v)} />
                      <TextCell numeric value={r.form.stars} onChange={v => updateField(r.pid, 'stars', v)} />
                      <TextCell numeric value={r.form.nationalRank} onChange={v => updateField(r.pid, 'nationalRank', v)} />
                      <TextCell numeric value={r.form.stateRank} onChange={v => updateField(r.pid, 'stateRank', v)} />
                      <TextCell numeric value={r.form.positionRank} onChange={v => updateField(r.pid, 'positionRank', v)} />
                      <TextCell value={r.form.height} onChange={v => updateField(r.pid, 'height', v)} placeholder={'6\'2"'} />
                      <TextCell numeric value={r.form.weight} onChange={v => updateField(r.pid, 'weight', v)} />
                      <TextCell value={r.form.hometown} onChange={v => updateField(r.pid, 'hometown', v)} />
                      <TextCell value={r.form.state} onChange={v => updateField(r.pid, 'state', v)} />
                      <SelectCell value={r.form.gemBust} options={GEM_BUST_OPTIONS} onChange={v => updateField(r.pid, 'gemBust', v)} />
                      <SelectCell value={r.form.devTrait} options={['', ...DEV_TRAIT_OPTIONS]} onChange={v => updateField(r.pid, 'devTrait', v)} />
                      <AttributesCell attrKeys={r.attrKeys} attrs={r.form.attrs} onChange={(k, v) => updateAttr(r.pid, k, v)} />
                      <td className="border border-surface-4 text-center">
                        {r.deleted ? (
                          <button onClick={() => undoDelete(r.pid)} className="text-[10px] font-semibold text-txt-secondary hover:text-txt-primary underline decoration-dotted px-2 py-1">
                            Undo
                          </button>
                        ) : (
                          <button
                            onClick={() => markDeleted(r.pid)}
                            title={isDbOnly ? 'Delete this prospect' : 'Remove from the Recruiting Database view — your real Target/roster record is untouched'}
                            className="text-red-400 hover:text-red-300 px-2 py-1"
                          >
                            ×
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
                {visibleRows.length === 0 && (
                  <tr>
                    <td colSpan={16} className="p-8 text-center text-txt-tertiary">No recruits match that filter.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between gap-3 pt-1 flex-shrink-0">
            <span className="text-xs text-txt-tertiary">
              {changedCount > 0 && `${changedCount} row${changedCount === 1 ? '' : 's'} edited`}
              {changedCount > 0 && pendingDeleteCount > 0 && ' · '}
              {pendingDeleteCount > 0 && `${pendingDeleteCount} to remove`}
            </span>
            <div className="flex gap-2">
              <button onClick={onClose} disabled={saving} className="px-4 py-2 rounded-md font-semibold text-sm border border-surface-4 hover:bg-surface-3 text-txt-primary disabled:opacity-60">
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || (changedCount === 0 && pendingDeleteCount === 0)}
                className="px-4 py-2 rounded-md font-semibold text-sm disabled:opacity-60"
                style={{ backgroundColor: 'var(--text-primary)', color: 'var(--surface-1)' }}
              >
                {saving ? 'Saving…' : 'Save All Changes'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
