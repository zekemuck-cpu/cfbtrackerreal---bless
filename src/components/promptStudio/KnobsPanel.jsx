/**
 * KnobsPanel — the customization tray.
 *
 * UI pattern:
 *   - Compact checkbox row at the top: one checkbox per knob the
 *     template exposes ("Customize: ☐ Voice  ☐ Perspective  ☑ Tone …")
 *   - Bottom area populates with the controls for ONLY the knobs
 *     the user checks. Order matches the checkbox order.
 *   - Unchecked knobs silently use the template's default value.
 *
 * State shape passed up to the parent:
 *   enabledKnobs:    { [knobId]: bool }
 *   userKnobValues:  { [knobId]: optionId }
 */

import { KNOB_DEFS, KNOB_ORDER, CUSTOM_OPTION_ID } from '../../utils/promptStudio/knobs'
import { Select, Input } from '../ui'

export default function KnobsPanel({
  template,
  enabledKnobs,
  onEnabledChange,
  userKnobValues,
  onValueChange,
  userKnobCustom,
  onCustomChange,
}) {
  if (!template) return null

  const exposed = template.knobWhitelist || []
  const orderedExposed = KNOB_ORDER.filter(k => exposed.includes(k))

  if (orderedExposed.length === 0) {
    return (
      <div className="text-xs text-txt-tertiary italic">
        This template has no customizable knobs — all defaults are used.
      </div>
    )
  }

  const toggleKnob = (knobId) => {
    onEnabledChange({ ...enabledKnobs, [knobId]: !enabledKnobs[knobId] })
  }

  const setValue = (knobId, value) => {
    onValueChange({ ...userKnobValues, [knobId]: value })
  }

  const setCustomText = (knobId, text) => {
    onCustomChange({ ...(userKnobCustom || {}), [knobId]: text })
  }

  const enabledList = orderedExposed.filter(k => enabledKnobs[k])

  return (
    <div className="space-y-3">
      {/* Compact checkbox tray */}
      <div>
        <div className="text-[11px] text-txt-tertiary mb-2">
          Check what you want to fine-tune. Anything unchecked uses smart defaults for this template.
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
          {orderedExposed.map(knobId => {
            const knob = KNOB_DEFS[knobId]
            if (!knob) return null
            return (
              <label key={knobId} className="inline-flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={!!enabledKnobs[knobId]}
                  onChange={() => toggleKnob(knobId)}
                  className="w-3.5 h-3.5 rounded border-surface-5 cursor-pointer"
                />
                <span className="text-xs text-txt-secondary">{knob.label}</span>
              </label>
            )
          })}
        </div>
      </div>

      {/* Bottom controls — only for enabled knobs */}
      {enabledList.length > 0 ? (
        <div
          className="pt-3 mt-1 grid grid-cols-1 sm:grid-cols-[max-content_1fr] gap-x-4 gap-y-2.5"
          style={{ borderTop: '1px solid var(--surface-4)' }}
        >
          {enabledList.map(knobId => {
            const knob = KNOB_DEFS[knobId]
            const defaultValue = template.knobDefaults[knobId]
            const currentValue = userKnobValues[knobId] ?? defaultValue
            const isCustom = currentValue === CUSTOM_OPTION_ID
            return (
              <Row key={knobId} label={knob.label}>
                <div className="space-y-1.5">
                  <Select
                    value={currentValue || ''}
                    onChange={e => setValue(knobId, e.target.value)}
                    size="sm"
                  >
                    {knob.options.map(opt => (
                      <option key={opt.id} value={opt.id}>{opt.label}</option>
                    ))}
                  </Select>
                  {isCustom && (
                    <Input
                      value={(userKnobCustom || {})[knobId] || ''}
                      onChange={e => setCustomText(knobId, e.target.value)}
                      placeholder={`Describe your custom ${knob.label.toLowerCase()}…`}
                      size="sm"
                    />
                  )}
                </div>
              </Row>
            )
          })}
        </div>
      ) : (
        <div
          className="pt-3 mt-1 text-xs text-txt-tertiary italic"
          style={{ borderTop: '1px solid var(--surface-4)' }}
        >
          Nothing to customize — we'll use smart defaults. Check anything above to override.
        </div>
      )}
    </div>
  )
}

function Row({ label, children }) {
  return (
    <>
      <div className="label-xs text-txt-secondary font-semibold self-center sm:text-right">
        {label}
      </div>
      <div className="min-w-0">{children}</div>
    </>
  )
}
