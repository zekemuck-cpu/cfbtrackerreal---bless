/**
 * PromptStudio — the "AI Prompt Studio" page.
 *
 * Task-first layout:
 *   1. "What do you want?" — chip row of quick-starts + big task textarea
 *   2. "Add context" — opt-in slot pickers (+Game / +Team / +Player / +Year / +Position)
 *   3. "Style options" — collapsed knobs panel (Voice / Tone / Length / …)
 *   4. Action bar + optional preview
 *
 * Pinned to the customSandbox template under the hood — the task input
 * IS what was "Custom notes", and every slot/knob the template exposes
 * is reachable from the UI.
 */

import { useState, useMemo } from 'react'
import { useDynasty } from '../../context/DynastyContext'
import { PageHero, Card, Button, SectionHeader, Textarea } from '../../components/ui'
import { useToast } from '../../components/ui/Toast'
import { getTemplate } from '../../utils/promptStudio/templates'
import { composePrompt, getResolvedKnobs } from '../../utils/promptStudio/compose'
import { SlotPicker } from '../../components/promptStudio/SlotPickers'
import KnobsPanel from '../../components/promptStudio/KnobsPanel'
import { QUICK_STARTS } from '../../utils/promptStudio/quickStarts'

export default function PromptStudio() {
  const { currentDynasty } = useDynasty()
  const { toast } = useToast()

  // Single universal template. The page's "What do you want?" textarea
  // maps to the template's customNotes field, and every slot/knob the
  // template declares is reachable from the UI.
  const templateId = 'custom-sandbox'
  const template = getTemplate(templateId)

  // Per-template state, keyed so the data shape stays compatible with
  // the rest of the prompt-studio wiring even though we only have one
  // template active right now.
  const [slotValuesByTemplate, setSlotValuesByTemplate] = useState({})
  const [visibleSlotsByTemplate, setVisibleSlotsByTemplate] = useState({})
  const [enabledKnobsByTemplate, setEnabledKnobsByTemplate] = useState({})
  const [userKnobValuesByTemplate, setUserKnobValuesByTemplate] = useState({})
  const [userKnobCustomByTemplate, setUserKnobCustomByTemplate] = useState({})
  const [customNotesByTemplate, setCustomNotesByTemplate] = useState({})
  const [activeChipByTemplate, setActiveChipByTemplate] = useState({})

  const slotValues = slotValuesByTemplate[templateId] || {}
  const visibleSlots = visibleSlotsByTemplate[templateId] || []
  const enabledKnobs = enabledKnobsByTemplate[templateId] || {}
  const userKnobValues = userKnobValuesByTemplate[templateId] || {}
  const userKnobCustom = userKnobCustomByTemplate[templateId] || {}
  const customNotes = customNotesByTemplate[templateId] || ''
  const activeChip = activeChipByTemplate[templateId] || null

  const setSlotValue = (slotId, v) => {
    setSlotValuesByTemplate(prev => ({
      ...prev,
      [templateId]: { ...(prev[templateId] || {}), [slotId]: v },
    }))
  }
  const setVisibleSlots = (nextArr) => {
    setVisibleSlotsByTemplate(prev => ({ ...prev, [templateId]: nextArr }))
  }
  const setEnabledKnobs = (next) => {
    setEnabledKnobsByTemplate(prev => ({ ...prev, [templateId]: next }))
  }
  const setUserKnobValues = (next) => {
    setUserKnobValuesByTemplate(prev => ({ ...prev, [templateId]: next }))
  }
  const setUserKnobCustom = (next) => {
    setUserKnobCustomByTemplate(prev => ({ ...prev, [templateId]: next }))
  }
  const setCustomNotes = (v) => {
    setCustomNotesByTemplate(prev => ({ ...prev, [templateId]: v }))
  }
  const setActiveChip = (chipId) => {
    setActiveChipByTemplate(prev => ({ ...prev, [templateId]: chipId }))
  }

  // Slot lookups by id so we can render only the visible ones.
  const slotById = useMemo(() => {
    const map = {}
    for (const s of template?.slots || []) map[s.id] = s
    return map
  }, [template])

  const hiddenSlotIds = useMemo(() => {
    const visible = new Set(visibleSlots)
    return (template?.slots || [])
      .map(s => s.id)
      .filter(id => !visible.has(id))
  }, [template, visibleSlots])

  const addSlot = (slotId) => {
    if (visibleSlots.includes(slotId)) return
    setVisibleSlots([...visibleSlots, slotId])
  }
  const removeSlot = (slotId) => {
    setVisibleSlots(visibleSlots.filter(id => id !== slotId))
    setSlotValue(slotId, null)
  }

  const applyQuickStart = (chip) => {
    setActiveChip(chip.id)
    setCustomNotes(chip.seed)
    if (chip.id === 'blank') {
      // "Start Blank" wipes visible slots so the user is truly starting over.
      setVisibleSlots([])
    } else {
      // Union with whatever the user already had visible — don't yank
      // a slot they were filling in just because the chip didn't list it.
      const union = Array.from(new Set([...visibleSlots, ...chip.slotsToReveal]))
      setVisibleSlots(union)
    }
  }

  // Compose the prompt live. Hidden slots are zeroed out at compose time
  // so they don't leak into the prompt's data block even if the user
  // filled them in earlier and then removed the row.
  const composed = useMemo(() => {
    if (!template || !currentDynasty) return ''
    try {
      const visibleSet = new Set(visibleSlots)
      const effectiveSlotValues = {}
      for (const [k, v] of Object.entries(slotValues)) {
        if (visibleSet.has(k)) effectiveSlotValues[k] = v
      }
      const teamCtx = template.getTeamContext
        ? template.getTeamContext(effectiveSlotValues, { dynasty: currentDynasty })
        : { teamA: '', teamB: '' }
      const resolvedKnobs = getResolvedKnobs(template, enabledKnobs, userKnobValues, userKnobCustom)
      return composePrompt(template, effectiveSlotValues, resolvedKnobs, customNotes, {
        dynasty: currentDynasty,
        ...teamCtx,
      })
    } catch (err) {
      return `_(Prompt could not be composed: ${err.message})_`
    }
  }, [template, slotValues, visibleSlots, enabledKnobs, userKnobValues, userKnobCustom, customNotes, currentDynasty])

  const [showPreview, setShowPreview] = useState(false)
  const [copied, setCopied] = useState(false)
  const [styleOpen, setStyleOpen] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(composed)
      setCopied(true)
      toast?.success?.('Prompt copied. Paste into your AI of choice.')
      setTimeout(() => setCopied(false), 1500)
    } catch {
      toast?.error?.('Browser blocked clipboard. Open the preview and copy by hand.')
      setShowPreview(true)
    }
  }

  const canCopy = (customNotes && customNotes.trim().length > 0) || visibleSlots.length > 0

  return (
    <div className="space-y-5">
      <PageHero
        title="Prompt Studio"
        subtitle="Build data-rich AI prompts from your dynasty. Copy and paste into ChatGPT, Claude, or any AI tool."
      />

      {/* 1. What do you want? — quick-start chips + task textarea */}
      <Card>
        <SectionHeader size="sm" title="What do you want?" />
        <div className="space-y-3">
          <div>
            <div className="text-[11px] text-txt-tertiary mb-2">
              Click a quick-start to seed it, or write your own.
            </div>
            <div className="flex flex-wrap gap-2">
              {QUICK_STARTS.map(chip => {
                const isActive = activeChip === chip.id
                return (
                  <button
                    key={chip.id}
                    type="button"
                    onClick={() => applyQuickStart(chip)}
                    className="px-3 py-1.5 rounded-full text-xs font-medium transition-colors"
                    style={{
                      backgroundColor: isActive ? 'var(--surface-4)' : 'var(--surface-2)',
                      border: `1px solid ${isActive ? 'var(--text-primary)' : 'var(--surface-4)'}`,
                      color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                    }}
                  >
                    {chip.label}
                  </button>
                )
              })}
            </div>
          </div>
          <Textarea
            value={customNotes}
            onChange={(e) => setCustomNotes(e.target.value)}
            rows={4}
            placeholder='e.g. "Write a coaching memo about our QB room going into next season." Or click a quick-start above.'
          />
        </div>
      </Card>

      {/* 2. Add context — opt-in slot pickers */}
      <Card>
        <SectionHeader size="sm" title="Add context (optional)" />
        <div className="space-y-3">
          {/* + buttons for slots that aren't yet visible */}
          {hiddenSlotIds.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {hiddenSlotIds.map(id => {
                const slot = slotById[id]
                if (!slot) return null
                const bareLabel = slot.label.replace(/\s*\(optional\)\s*$/i, '')
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => addSlot(id)}
                    className="px-2.5 py-1 rounded-md text-xs font-medium transition-colors hover:bg-surface-3"
                    style={{
                      backgroundColor: 'var(--surface-2)',
                      border: '1px dashed var(--surface-5)',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    + {bareLabel}
                  </button>
                )
              })}
            </div>
          )}

          {/* Active slot rows in user-add order */}
          {visibleSlots.length > 0 && (
            <div className="space-y-3">
              {visibleSlots.map(id => {
                const slot = slotById[id]
                if (!slot) return null
                const bareLabel = slot.label.replace(/\s*\(optional\)\s*$/i, '')
                return (
                  <div
                    key={id}
                    className="p-3 rounded-md"
                    style={{
                      backgroundColor: 'var(--surface-2)',
                      border: '1px solid var(--surface-4)',
                    }}
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <span className="label-xs text-txt-secondary font-semibold">{bareLabel}</span>
                      <button
                        type="button"
                        onClick={() => removeSlot(id)}
                        className="text-[11px] text-txt-tertiary hover:text-txt-primary transition-colors"
                        title="Remove this context"
                      >
                        remove
                      </button>
                    </div>
                    <SlotPicker
                      slot={{ ...slot, label: '', helper: slot.helper }}
                      value={slotValues[id]}
                      onChange={(v) => setSlotValue(id, v)}
                      dynasty={currentDynasty}
                    />
                  </div>
                )
              })}
            </div>
          )}

          {visibleSlots.length === 0 && hiddenSlotIds.length === 0 && (
            <div className="text-xs text-txt-tertiary italic">
              No data slots configured.
            </div>
          )}
        </div>
      </Card>

      {/* 3. Style options — collapsed by default */}
      {template && (
        <Card>
          <button
            type="button"
            onClick={() => setStyleOpen(s => !s)}
            className="w-full flex items-center justify-between gap-3 text-left"
          >
            <div>
              <div className="text-sm font-semibold text-txt-primary">
                {styleOpen ? 'Style options' : 'Style options (smart defaults set — click to customize)'}
              </div>
              {styleOpen && (
                <div className="text-[11px] text-txt-tertiary mt-0.5">
                  Voice, tone, length, format, and more.
                </div>
              )}
            </div>
            <span className="text-xs text-txt-tertiary">{styleOpen ? '▾' : '▸'}</span>
          </button>
          {styleOpen && (
            <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--surface-4)' }}>
              <KnobsPanel
                template={template}
                enabledKnobs={enabledKnobs}
                onEnabledChange={setEnabledKnobs}
                userKnobValues={userKnobValues}
                onValueChange={setUserKnobValues}
                userKnobCustom={userKnobCustom}
                onCustomChange={setUserKnobCustom}
              />
            </div>
          )}
        </Card>
      )}

      {/* 4. Action bar */}
      <Card>
        <div className="flex items-center gap-3 flex-wrap">
          <Button
            variant="primary"
            onClick={handleCopy}
            disabled={!canCopy}
            title={canCopy ? 'Copy the composed prompt to your clipboard' : 'Type a request or add some context first'}
          >
            {copied ? 'Copied!' : 'Copy Prompt'}
          </Button>
          <Button
            variant="outline"
            onClick={() => setShowPreview(s => !s)}
          >
            {showPreview ? 'Hide preview' : 'Show preview'}
          </Button>
          {!canCopy && (
            <span className="text-xs text-txt-tertiary">
              Type a request or add some context to build a prompt.
            </span>
          )}
        </div>
      </Card>

      {/* Preview */}
      {showPreview && (
        <Card>
          <SectionHeader size="sm" title="Preview" />
          <pre
            className="text-xs font-mono whitespace-pre-wrap rounded-md p-3 max-h-[60vh] overflow-y-auto"
            style={{
              backgroundColor: 'var(--surface-1)',
              border: '1px solid var(--surface-4)',
              color: 'var(--text-secondary)',
            }}
          >
            {composed || '_(empty — type a request, or click a quick-start)_'}
          </pre>
        </Card>
      )}
    </div>
  )
}
