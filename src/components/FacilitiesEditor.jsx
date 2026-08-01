import { useState } from 'react'
import { Button } from './ui'
import pointsIcon from '../assets/blueprint/points.png'

const fmt = (n) => (n == null || n === '' || isNaN(n) ? '—' : Number(n).toLocaleString())

// Shared facilities editor — facility tier picker (with the tier's attributes),
// the equipment slots, a current-grade dropdown (bounded by the tier's range),
// and the Facility Tiers reference table (the game's right-hand panel).
// Presentational + local form state only; the parent owns persistence
// (onSelectTier / onSetGrade / onAddEquipment / onRemoveEquipment).
//
//   facilities = { tier?, grade?, equipment?: [{ effect, name, tier, boost, weeks }] }
//   tiers = catalog: [{ key, label, slots, maxGrade, annualCost, progression, grades }]
//   equipmentEffects = [{ key, label }]   equipmentTiers = ['Bronze',…]
//
// `carriedTier` is the tier inherited from a prior season (facilities persist
// until an upgrade/downgrade) — shown as the effective tier when none is set
// for this year yet, so the user doesn't re-pick it annually.
export default function FacilitiesEditor({
  facilities = {},
  tiers = [],
  equipmentEffects = [],
  equipmentTiers = [],
  carriedTier = null,
  onSelectTier,
  onSetGrade,
  onAddEquipment,
  onUpdateEquipment,
  onRemoveEquipment,
  isViewOnly = false,
  busy = false,
}) {
  const [form, setForm] = useState({ effect: '', tier: '', name: '', boost: '', weeks: '' })
  // null = the form is adding a new item; a number = editing that slot in place.
  const [editingIdx, setEditingIdx] = useState(null)

  const tierKey = facilities.tier || carriedTier || ''
  const tier = tiers.find((t) => t.key === tierKey) || null
  const equipment = facilities.equipment ?? []
  const slots = tier?.slots ?? 0
  const gradeOptions = tier?.grades ?? []
  const usingCarried = !facilities.tier && !!carriedTier
  const effectLabel = (key) => equipmentEffects.find((e) => e.key === key)?.label || key

  const inputClass = 'w-full bg-surface-2 border border-surface-4 rounded-md px-2.5 h-9 text-sm text-txt-primary'
  const selectClass = `${inputClass} appearance-none`

  const resetForm = () => {
    setForm({ effect: '', tier: '', name: '', boost: '', weeks: '' })
    setEditingIdx(null)
  }

  const submitEquip = () => {
    if (!form.effect) return
    const payload = {
      effect: form.effect,
      tier: form.tier || null,
      name: form.name.trim() || null,
      boost: form.boost.trim() || null,
      weeks: form.weeks === '' ? null : Number(form.weeks),
    }
    if (editingIdx !== null) {
      if (!onUpdateEquipment) return
      onUpdateEquipment(editingIdx, payload)
    } else {
      if (!onAddEquipment) return
      onAddEquipment(payload)
    }
    resetForm()
  }

  // Load an existing item into the form for in-place editing (instead of
  // forcing a remove + re-add).
  const startEdit = (idx) => {
    const eq = equipment[idx]
    if (!eq || isViewOnly) return
    setForm({
      effect: eq.effect || '',
      tier: eq.tier || '',
      name: eq.name || '',
      boost: eq.boost || '',
      weeks: eq.weeks == null ? '' : String(eq.weeks),
    })
    setEditingIdx(idx)
  }

  const Attr = ({ label, value, tone }) => (
    <div className="flex-1 min-w-0 text-center">
      <div className="label-xs text-txt-tertiary mb-0.5">{label}</div>
      <div className="text-sm font-bold tabular-nums" style={tone ? { color: tone } : undefined}>{value}</div>
    </div>
  )

  return (
    <div className="space-y-5">
      {/* Tier selector + attributes */}
      <div>
        <label className="label-xs text-txt-tertiary block mb-1.5">Facility Tier</label>
        {isViewOnly ? (
          <div className="text-sm font-semibold text-txt-primary">{tier?.label || '—'}</div>
        ) : (
          <select
            value={facilities.tier || ''}
            onChange={(e) => onSelectTier?.(e.target.value || null)}
            disabled={busy}
            className={selectClass}
          >
            <option value="">{carriedTier ? `${tiers.find((t) => t.key === carriedTier)?.label} (carried)` : 'Select…'}</option>
            {tiers.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
        )}
        {usingCarried && !isViewOnly && (
          <p className="text-[11px] text-txt-tertiary mt-1">Carried from a prior season — re-select only if you upgraded or downgraded.</p>
        )}

        {tier && (
          <div className="flex items-stretch gap-2 mt-3 p-3 rounded-md" style={{ backgroundColor: 'var(--surface-2)', border: '1px solid var(--surface-4)' }}>
            <Attr label="Max Grade" value={tier.maxGrade} />
            <div style={{ width: 1, backgroundColor: 'var(--surface-4)' }} />
            <Attr label="Slots" value={tier.slots} />
            <div style={{ width: 1, backgroundColor: 'var(--surface-4)' }} />
            <Attr label="Annual Cost" value={fmt(tier.annualCost)} />
            <div style={{ width: 1, backgroundColor: 'var(--surface-4)' }} />
            <Attr label="Progression" value={`+${tier.progression}%`} tone="var(--accent-success)" />
          </div>
        )}
      </div>

      {/* Current grade — dropdown bounded by the tier's grade range */}
      <div>
        <label className="label-xs text-txt-tertiary block mb-1.5">Current Facility Grade</label>
        {isViewOnly ? (
          <div className="text-sm font-semibold text-txt-primary">{facilities.grade || '—'}</div>
        ) : (
          <select
            value={facilities.grade || ''}
            onChange={(e) => onSetGrade?.(e.target.value || null)}
            disabled={busy || !tier}
            className={`${selectClass} w-32`}
          >
            <option value="">{tier ? 'Select…' : 'Pick a tier first'}</option>
            {gradeOptions.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        )}
      </div>

      {/* Equipment slots */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="label-xs text-txt-tertiary">Equipment</span>
          {tier && <span className="text-[11px] text-txt-tertiary tabular-nums">{equipment.length}/{slots} slots</span>}
        </div>

        {equipment.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
            {equipment.map((eq, idx) => {
              const title = eq.name || effectLabel(eq.effect)
              const sub = eq.name ? effectLabel(eq.effect) : '' // avoid repeating when no name
              const editing = editingIdx === idx
              return (
                <div
                  key={idx}
                  onClick={!isViewOnly ? () => startEdit(idx) : undefined}
                  className={`rounded-lg p-3 relative transition-colors ${!isViewOnly ? 'cursor-pointer hover:bg-surface-3' : ''}`}
                  style={{ backgroundColor: 'var(--surface-2)', border: `1px solid ${editing ? 'var(--accent-success)' : 'var(--surface-4)'}` }}
                  title={!isViewOnly ? 'Click to edit' : undefined}
                >
                  {!isViewOnly && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onRemoveEquipment?.(idx); if (editingIdx !== null) resetForm() }}
                      disabled={busy}
                      aria-label="Remove"
                      className="absolute top-2 right-2 w-6 h-6 flex items-center justify-center rounded text-txt-tertiary hover:text-[color:var(--accent-error)] hover:bg-surface-3 transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  )}
                  <div className="text-sm font-bold text-txt-primary truncate pr-6">
                    {title}{eq.tier ? <span className="text-txt-tertiary font-semibold"> · {eq.tier}</span> : null}
                  </div>
                  <div className="text-xs mt-0.5 truncate">
                    {eq.boost && <span className="font-bold" style={{ color: 'var(--accent-success)' }}>{eq.boost}</span>}
                    {eq.boost && sub ? ' ' : ''}
                    {sub && <span className="text-txt-secondary">{sub}</span>}
                  </div>
                  {eq.weeks != null && <div className="text-[11px] text-txt-tertiary tabular-nums mt-1.5">{eq.weeks} weeks remaining</div>}
                </div>
              )
            })}
          </div>
        )}

        {/* Add / edit row — Effect (dropdown) is required; the rest are optional.
            Shown when there's a free slot OR when editing an existing item. */}
        {!isViewOnly && (editingIdx !== null || slots === 0 || equipment.length < slots) && (
          <div className="rounded-md p-3" style={{ backgroundColor: 'var(--surface-2)', border: `1px solid ${editingIdx !== null ? 'var(--accent-success)' : 'var(--surface-4)'}` }}>
            {editingIdx !== null && (
              <div className="flex items-center justify-between mb-2">
                <span className="label-xs" style={{ color: 'var(--accent-success)' }}>Editing equipment</span>
              </div>
            )}
            <div className="flex flex-wrap items-end gap-2">
              <div className="flex-1 min-w-[150px]">
                <label className="label-xs text-txt-tertiary block mb-1.5">Effect</label>
                <select value={form.effect} onChange={(e) => setForm({ ...form, effect: e.target.value })} className={selectClass}>
                  <option value="">Select…</option>
                  {equipmentEffects.map((eff) => <option key={eff.key} value={eff.key}>{eff.label}</option>)}
                </select>
              </div>
              <div className="w-28">
                <label className="label-xs text-txt-tertiary block mb-1.5">Tier</label>
                <select value={form.tier} onChange={(e) => setForm({ ...form, tier: e.target.value })} className={selectClass}>
                  <option value="">—</option>
                  {equipmentTiers.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="w-32">
                <label className="label-xs text-txt-tertiary block mb-1.5">Name</label>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="optional" className={inputClass} />
              </div>
              <div className="w-20">
                <label className="label-xs text-txt-tertiary block mb-1.5">Boost</label>
                <input value={form.boost} onChange={(e) => setForm({ ...form, boost: e.target.value })} placeholder="+150" className={inputClass} />
              </div>
              <div className="w-20">
                <label className="label-xs text-txt-tertiary block mb-1.5">Weeks</label>
                <input
                  type="number"
                  min="0"
                  value={form.weeks}
                  onChange={(e) => setForm({ ...form, weeks: e.target.value })}
                  onKeyDown={(e) => { if (e.key === 'Enter' && form.effect) submitEquip() }}
                  placeholder="∞"
                  className={`${inputClass} text-right tabular-nums`}
                />
              </div>
              <Button variant="primary" onClick={submitEquip} disabled={busy || !form.effect}>{editingIdx !== null ? 'Save' : 'Add'}</Button>
              {editingIdx !== null && (
                <Button variant="secondary" onClick={resetForm} disabled={busy}>Cancel</Button>
              )}
            </div>
          </div>
        )}
        {!isViewOnly && editingIdx === null && slots > 0 && equipment.length >= slots && (
          <p className="text-[11px] text-txt-tertiary">All {slots} equipment slots filled. Click an item to edit it, or upgrade your facility for more.</p>
        )}
      </div>

      {/* Facility Tiers reference (the game's right-hand panel) */}
      <div>
        <p className="label-xs text-txt-tertiary mb-2" style={{ letterSpacing: '1px' }}>Facility Tiers</p>
        <div className="rounded-md overflow-hidden" style={{ border: '1px solid var(--surface-3)' }}>
          <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-x-3 px-3 py-1.5 text-[10px] uppercase tracking-wide text-txt-tertiary" style={{ backgroundColor: 'var(--surface-2)' }}>
            <span>Tier</span><span className="text-center">Slots</span><span className="text-center">Grade</span><span className="text-right">Cost</span><span className="text-right">Prog</span>
          </div>
          {tiers.map((t) => {
            const active = t.key === tierKey
            return (
              <div
                key={t.key}
                className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-x-3 px-3 py-2 items-center text-xs"
                style={{ borderTop: '1px solid var(--surface-3)', backgroundColor: active ? 'var(--surface-2)' : 'transparent' }}
              >
                <span className={`truncate ${active ? 'font-bold text-txt-primary' : 'text-txt-secondary'}`}>{t.label}</span>
                <span className="text-center tabular-nums text-txt-tertiary">{t.slots}</span>
                <span className="text-center tabular-nums text-txt-secondary">{t.maxGrade}</span>
                <span className="flex items-center justify-end gap-1 tabular-nums text-txt-secondary"><img src={pointsIcon} alt="" className="w-3.5 h-3.5 object-contain" />{fmt(t.annualCost)}</span>
                <span className="text-right tabular-nums" style={{ color: t.progression > 0 ? 'var(--accent-success)' : 'var(--text-tertiary)' }}>+{t.progression}%</span>
              </div>
            )
          })}
        </div>
        <p className="text-[11px] text-txt-tertiary mt-2">Upgrades & downgrades happen at End of Season Recap (once per year); an upgrade completes the following preseason.</p>
      </div>
    </div>
  )
}
