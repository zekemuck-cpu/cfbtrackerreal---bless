/**
 * CardEditorModal — focused editor for a single trading card. Opened
 * from PlayerCards' grid (both new cards and edits).
 *
 * Three steps: Style → Context → Generate. The chrome follows the app's
 * neutral design language (surface tokens, the shared Button primitive,
 * the standard modal backdrop) — no team-color accents, no decorative
 * slab/terminal styling. The AI prompts are NOT shown by default; each
 * side has a Copy button and an optional "view" disclosure.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import CardStylePicker from './CardStylePicker'
import ImageUpload from './ImageUpload'
import Button from './ui/Button'
import { CARD_CONTEXTS, WEEKLY_AWARDS, getCardStyle } from '../data/cardStyles'
import {
  buildCardPromptVariables,
  interpolatePrompt,
} from '../utils/cardPromptVariables'
import { listPlayerGames } from '../utils/playerCards'
import { proxyImageUrl } from '../utils/imageProxy'

const PHASES = [
  { id: 'style',    label: 'Style' },
  { id: 'context',  label: 'Context' },
  { id: 'generate', label: 'Generate' },
]

export default function CardEditorModal({
  card,
  isNew,
  player,
  dynasty,
  teamColors,
  onSave,
  onCancel,
}) {
  const [working, setWorking] = useState(() => ({ ...card }))
  const [phaseIdx, setPhaseIdx] = useState(isNew ? 0 : 2)
  const [saving, setSaving] = useState(false)

  const update = (patch) => setWorking(w => {
    const next = { ...w, ...patch }
    // Changing the context type drops the previous type's details so a
    // stale gameId / awardKey / championshipKey can't linger.
    if ('contextType' in patch && patch.contextType !== w.contextType) {
      next.contextDetails = {}
    }
    return next
  })
  const updateContextDetails = (patch) =>
    setWorking(w => ({ ...w, contextDetails: { ...(w.contextDetails || {}), ...patch } }))

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onCancel?.() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onCancel])

  const style = useMemo(() => getCardStyle(working.styleId), [working.styleId])
  const variables = useMemo(
    () => buildCardPromptVariables({ player, dynasty, card: working }),
    [player, dynasty, working]
  )
  const filledFrontPrompt = useMemo(
    () => style?.frontPrompt ? interpolatePrompt(style.frontPrompt, variables) : '',
    [style?.frontPrompt, variables]
  )
  const filledBackPrompt = useMemo(
    () => style?.backPrompt ? interpolatePrompt(style.backPrompt, variables) : '',
    [style?.backPrompt, variables]
  )

  const playerGames = useMemo(() => listPlayerGames(player, dynasty), [player, dynasty])
  const availableYears = useMemo(() => collectAvailableYears(player, dynasty), [player, dynasty])
  const availableAwards = useMemo(() => collectAvailableAwards(player), [player])

  const phaseComplete = (idx) => {
    if (idx === 0) return !!working.styleId
    if (idx === 1) {
      if (!working.contextType || !working.year) return false
      const d = working.contextDetails || {}
      if (working.contextType === 'game') {
        if (!d.gameId || !playerGames.some(g => g.gameId === d.gameId)) return false
      }
      if (working.contextType === 'award') {
        if (!d.awardKey || !availableAwards.some(a => a.key === d.awardKey)) return false
      }
      if (working.contextType === 'championship' && !d.championshipKey) return false
      if (working.contextType === 'custom'       && !d.customLabel) return false
      return true
    }
    if (idx === 2) return !!(working.frontImageUrl || working.backImageUrl)
    return true
  }

  const canSave = phaseComplete(2)
  const canAdvance = phaseComplete(phaseIdx)

  const goNext = () => { if (canAdvance && phaseIdx < PHASES.length - 1) setPhaseIdx(phaseIdx + 1) }
  const goBack = () => { if (phaseIdx > 0) setPhaseIdx(phaseIdx - 1) }

  const portalTarget = typeof document !== 'undefined' ? document.body : null
  if (!portalTarget) return null

  const phase = PHASES[phaseIdx]

  return createPortal(
    <div
      className="fixed inset-0 top-0 left-0 right-0 bottom-0 bg-black bg-opacity-60 flex items-center justify-center z-[9999] p-3 sm:p-4 modal-backdrop-in"
      style={{ margin: 0 }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel?.() }}
    >
      <div
        className="w-full max-w-5xl card-elevated flex flex-col max-h-[90dvh] overflow-hidden modal-panel-in"
        role="dialog"
        aria-modal="true"
      >
        {/* ─── Header ─────────────────────────────────────────────── */}
        <header className="px-6 py-4 border-b border-surface-4 flex items-center justify-between flex-shrink-0">
          <div className="min-w-0">
            <div className="label-xs text-txt-tertiary mb-1">
              {isNew ? 'New Card' : 'Edit Card'}
            </div>
            <h2 className="text-display-md text-txt-primary m-0 truncate">
              {phase.id === 'style' ? 'Choose a style'
                : phase.id === 'context' ? 'Set the context'
                : (style?.label || 'Generate')}
            </h2>
          </div>
          <button
            onClick={onCancel}
            className="p-1.5 rounded-md text-txt-tertiary hover:text-txt-primary hover:bg-surface-3 transition-colors flex-shrink-0"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </header>

        {/* ─── Stepper ────────────────────────────────────────────── */}
        <Stepper
          phases={PHASES}
          phaseIdx={phaseIdx}
          phaseComplete={phaseComplete}
          onSelect={(i) => { if (i <= phaseIdx || phaseComplete(i - 1)) setPhaseIdx(i) }}
        />

        {/* ─── Body ───────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {phase.id === 'style' && (
            <CardStylePicker value={working.styleId} onChange={(styleId) => update({ styleId })} />
          )}
          {phase.id === 'context' && (
            <PhaseContext
              working={working}
              onChange={update}
              onChangeContextDetails={updateContextDetails}
              availableYears={availableYears}
              availableGames={playerGames}
              availableAwards={availableAwards}
            />
          )}
          {phase.id === 'generate' && (
            <PhaseGenerate
              style={style}
              filledFrontPrompt={filledFrontPrompt}
              filledBackPrompt={filledBackPrompt}
              working={working}
              onChange={update}
              teamColors={teamColors}
            />
          )}
        </div>

        {/* ─── Footer ─────────────────────────────────────────────── */}
        <footer className="px-6 py-4 border-t border-surface-4 flex items-center justify-between gap-3 flex-shrink-0 bg-surface-2">
          <span className="text-sm text-txt-tertiary truncate hidden sm:block">
            {phaseIdx === 0 ? (working.styleId ? style?.label : 'Pick a style to continue')
              : phaseIdx === 1 ? (canAdvance ? 'Context set' : 'Pick a type, year, and any required detail')
              : (canSave ? 'Ready to save' : 'Upload at least the front image to save')}
          </span>
          <div className="flex items-center gap-2 ml-auto">
            <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
            {phaseIdx > 0 && (
              <Button variant="secondary" size="sm" onClick={goBack}>Back</Button>
            )}
            {phaseIdx < PHASES.length - 1 ? (
              <Button variant="primary" size="sm" onClick={goNext} disabled={!canAdvance}>Next</Button>
            ) : (
              <Button
                variant="primary"
                size="sm"
                onClick={async () => {
                  if (!canSave || saving) return
                  setSaving(true)
                  try { await onSave(working) } finally { setSaving(false) }
                }}
                disabled={!canSave || saving}
              >
                {saving ? 'Saving…' : (isNew ? 'Save card' : 'Save changes')}
              </Button>
            )}
          </div>
        </footer>
      </div>
    </div>,
    portalTarget
  )
}

/* ═══════════════════════════════════════════════════════════════════
   Stepper — slim, neutral
   ═══════════════════════════════════════════════════════════════════ */

function Stepper({ phases, phaseIdx, phaseComplete, onSelect }) {
  return (
    <nav className="px-6 py-3 border-b border-surface-4 flex-shrink-0">
      <ol className="flex items-center gap-2">
        {phases.map((p, i) => {
          const active = i === phaseIdx
          const complete = phaseComplete(i) && !active
          const reachable = i <= phaseIdx || phaseComplete(i - 1)
          return (
            <li key={p.id} className="flex items-center gap-2 flex-1 min-w-0">
              <button
                type="button"
                onClick={() => reachable && onSelect(i)}
                disabled={!reachable}
                className="flex items-center gap-2 disabled:cursor-not-allowed group"
              >
                <span
                  className="flex items-center justify-center rounded-full text-xs font-bold tabular-nums flex-shrink-0"
                  style={{
                    width: 22, height: 22,
                    backgroundColor: active ? 'var(--text-primary)' : 'transparent',
                    color: active ? 'var(--surface-1)' : complete ? 'var(--accent-success)' : 'var(--text-tertiary)',
                    border: `1px solid ${active ? 'var(--text-primary)' : complete ? 'var(--accent-success)' : 'var(--surface-5)'}`,
                  }}
                >
                  {complete ? (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
                      <polyline points="20 6 9 17 4 12" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : i + 1}
                </span>
                <span
                  className="text-sm font-semibold whitespace-nowrap"
                  style={{ color: active ? 'var(--text-primary)' : 'var(--text-tertiary)' }}
                >
                  {p.label}
                </span>
              </button>
              {i < phases.length - 1 && (
                <span aria-hidden="true" className="flex-1 h-px bg-surface-4 min-w-[12px]" />
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   Step 2 — Context
   ═══════════════════════════════════════════════════════════════════ */

function PhaseContext({
  working, onChange, onChangeContextDetails,
  availableYears, availableGames, availableAwards,
}) {
  const staleGame = working.contextType === 'game' && working.contextDetails?.gameId &&
    !availableGames.some(g => g.gameId === working.contextDetails.gameId)
  const staleAward = working.contextType === 'award' && working.contextDetails?.awardKey &&
    !availableAwards.some(a => a.key === working.contextDetails.awardKey)

  return (
    <div className="space-y-6 max-w-2xl">
      <Field label="Type" hint="What the card commemorates.">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {CARD_CONTEXTS.map(ctx => {
            const active = working.contextType === ctx.id
            return (
              <button
                key={ctx.id}
                type="button"
                onClick={() => onChange({ contextType: ctx.id })}
                className="text-left px-3 py-2.5 rounded-lg transition-colors"
                style={{
                  backgroundColor: active ? 'var(--surface-3)' : 'var(--surface-2)',
                  border: `1px solid ${active ? 'var(--text-primary)' : 'var(--surface-4)'}`,
                }}
              >
                <div className="text-sm font-semibold text-txt-primary leading-tight">{ctx.label}</div>
                <div className="text-xs text-txt-tertiary mt-0.5 leading-snug">{ctx.hint}</div>
              </button>
            )
          })}
        </div>
      </Field>

      <Field label="Year" hint="Drives stats, class, and team record.">
        <SelectControl
          value={working.year || ''}
          onChange={(e) => onChange({ year: Number(e.target.value) || null })}
        >
          <option value="">Select a season…</option>
          {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
        </SelectControl>
      </Field>

      {working.contextType === 'game' && (
        <>
          <Field label="Game" hint="Only this game appears on the back.">
            <SelectControl
              value={working.contextDetails?.gameId || ''}
              onChange={(e) => onChangeContextDetails({ gameId: e.target.value })}
            >
              <option value="">Select a game…</option>
              {availableGames.map(g => (
                <option key={g.gameId} value={g.gameId}>
                  {g.year} W{g.week} {g.won ? 'W' : 'L'} {(g.playerScore != null && g.oppScore != null) ? `${g.playerScore}-${g.oppScore}` : '—'} {g.location === 'home' ? 'vs' : g.location === 'away' ? '@' : 'vs (N)'} {g.opponentName}
                </option>
              ))}
            </SelectControl>
            {staleGame && (
              <p className="text-xs mt-2 text-danger">
                The game this card pointed to is no longer available. Pick a game above — otherwise the back will have no matchup or stats.
              </p>
            )}
          </Field>

          <Field label="Weekly award" hint="Optional — turns this into a Player-of-the-Week card.">
            <SelectControl
              value={working.contextDetails?.weeklyAward || ''}
              onChange={(e) => onChangeContextDetails({ weeklyAward: e.target.value })}
            >
              <option value="">— None —</option>
              <optgroup label="National">
                {WEEKLY_AWARDS.filter(a => a.id.startsWith('national_')).map(a => (
                  <option key={a.id} value={a.id}>{a.label}</option>
                ))}
              </optgroup>
              <optgroup label="Conference">
                {WEEKLY_AWARDS.filter(a => a.id.startsWith('conference_')).map(a => (
                  <option key={a.id} value={a.id}>{a.label}</option>
                ))}
              </optgroup>
            </SelectControl>
          </Field>
        </>
      )}

      {working.contextType === 'championship' && (
        <Field label="Championship" hint="Title this card commemorates.">
          <SelectControl
            value={working.contextDetails?.championshipKey || ''}
            onChange={(e) => onChangeContextDetails({
              championshipKey: e.target.value,
              championshipName: e.target.options[e.target.selectedIndex].text,
            })}
          >
            <option value="">Select…</option>
            <option value="natty">National Championship</option>
            <option value="cfp_semi">CFP Semifinal Win</option>
            <option value="conf">Conference Championship</option>
            <option value="bowl">Bowl Win</option>
          </SelectControl>
        </Field>
      )}

      {working.contextType === 'award' && (
        <Field label="Award" hint="Becomes the back's headline.">
          <SelectControl
            value={working.contextDetails?.awardKey || ''}
            onChange={(e) => onChangeContextDetails({ awardKey: e.target.value })}
          >
            <option value="">Select…</option>
            {availableAwards.map(a => (
              <option key={a.key} value={a.key}>{a.label} ({a.year})</option>
            ))}
            {availableAwards.length === 0 && <option disabled>No awards on this player</option>}
          </SelectControl>
          {staleAward && (
            <p className="text-xs mt-2 text-danger">
              The award this card pointed to is no longer on the player. Pick an award above.
            </p>
          )}
        </Field>
      )}

      {working.contextType === 'custom' && (
        <Field label="Custom storyline" hint="Type the storyline yourself.">
          <InputControl
            value={working.contextDetails?.customLabel || ''}
            onChange={(e) => onChangeContextDetails({ customLabel: e.target.value })}
            placeholder="e.g. Walk-on to All-American, Bowl MVP, Senior Day farewell…"
          />
        </Field>
      )}

      <Field label="Label" hint="Optional — shown under the card in the collection.">
        <InputControl
          value={working.label || ''}
          onChange={(e) => onChange({ label: e.target.value })}
          placeholder="e.g. Heisman Trophy, Iron Bowl Win, Senior Day"
        />
      </Field>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   Step 3 — Generate
   ═══════════════════════════════════════════════════════════════════ */

function PhaseGenerate({ style, filledFrontPrompt, filledBackPrompt, working, onChange, teamColors }) {
  if (!style) {
    return (
      <div className="text-center py-16 text-sm text-txt-secondary">
        Pick a card style on the first step to populate the prompts.
      </div>
    )
  }
  return (
    <div className="space-y-5">
      <p className="text-sm text-txt-tertiary max-w-2xl">
        Copy each prompt into your AI image generator, then drop the resulting images into the slots below. The back is optional.
      </p>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SidePanel
          side="front"
          prompt={filledFrontPrompt}
          imageUrl={working.frontImageUrl}
          onChangeImage={(url) => onChange({ frontImageUrl: url })}
          teamColors={teamColors}
        />
        <SidePanel
          side="back"
          prompt={filledBackPrompt}
          imageUrl={working.backImageUrl}
          onChangeImage={(url) => onChange({ backImageUrl: url })}
          teamColors={teamColors}
        />
      </div>
    </div>
  )
}

/**
 * SidePanel — one card face. Header with Copy + an optional collapsed
 * "view prompt" disclosure (the prompt is not shown by default), then
 * the image slot / upload.
 */
function SidePanel({ side, prompt, imageUrl, onChangeImage, teamColors }) {
  const [copied, setCopied] = useState(false)
  const [showPrompt, setShowPrompt] = useState(false)
  const imageUploadRef = useRef(null)
  const label = side === 'front' ? 'Front' : 'Back'

  const onCopy = async () => {
    try {
      await navigator.clipboard?.writeText(prompt)
      setCopied(true)
      setTimeout(() => setCopied(false), 1400)
    } catch {}
  }

  return (
    <div className="rounded-lg border border-surface-4 bg-surface-2 overflow-hidden">
      <header className="flex items-center justify-between gap-2 px-4 py-3 border-b border-surface-4">
        <div className="flex items-baseline gap-2 min-w-0">
          <span className="text-sm font-bold text-txt-primary">{label}</span>
          <span className="label-xs text-txt-tertiary">
            {imageUrl ? 'Image loaded' : 'No image yet'}
          </span>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <Button variant="ghost" size="sm" onClick={() => setShowPrompt(s => !s)} disabled={!prompt}>
            {showPrompt ? 'Hide prompt' : 'View prompt'}
          </Button>
          <Button variant="primary" size="sm" onClick={onCopy} disabled={!prompt}>
            {copied ? 'Copied' : 'Copy prompt'}
          </Button>
        </div>
      </header>

      {showPrompt && (
        <div className="px-4 pt-3">
          <textarea
            value={prompt}
            readOnly
            rows={8}
            className="w-full rounded-md bg-surface-0 border border-surface-4 px-3 py-2 text-txt-secondary resize-y focus:outline-none focus:border-surface-5"
            style={{ fontFamily: 'ui-monospace, Menlo, Consolas, monospace', fontSize: 11.5, lineHeight: 1.6 }}
          />
        </div>
      )}

      <div className="p-4">
        <ImageSlot
          imageUrl={imageUrl}
          label={label}
          onClick={() => imageUploadRef.current?.triggerFileSelect()}
          onDragOver={(e) => imageUploadRef.current?.handleDragOver(e)}
          onDragLeave={(e) => imageUploadRef.current?.handleDragLeave(e)}
          onDrop={(e) => imageUploadRef.current?.handleDrop(e)}
        />
        <div className="mt-3">
          <ImageUpload
            ref={imageUploadRef}
            value={imageUrl || ''}
            onChange={onChangeImage}
            teamColors={teamColors}
            placeholder="Click, drag-drop, paste, or paste a URL"
            showPreview={false}
            hideDropzone={true}
          />
        </div>
      </div>
    </div>
  )
}

function ImageSlot({ imageUrl, label, onClick, onDragOver, onDragLeave, onDrop }) {
  return (
    <div
      className="relative overflow-hidden mx-auto rounded-lg cursor-pointer transition-colors"
      style={{
        aspectRatio: '5/7',
        maxWidth: 220,
        width: '100%',
        backgroundColor: imageUrl ? 'transparent' : 'var(--surface-1)',
        border: imageUrl ? '1px solid var(--surface-5)' : '1.5px dashed var(--surface-5)',
      }}
      onClick={onClick}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {imageUrl ? (
        <img src={proxyImageUrl(imageUrl, 800)} alt={label} className="w-full h-full object-cover block" />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="text-txt-muted">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <path d="M21 15l-5-5L5 21" />
          </svg>
          <span className="label-xs text-txt-tertiary">Upload {label}</span>
        </div>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   Shared controls — match the app's neutral form styling
   ═══════════════════════════════════════════════════════════════════ */

function Field({ label, hint, children }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 mb-2">
        <span className="label-xs text-txt-secondary">{label}</span>
        {hint && <span className="text-xs text-txt-tertiary text-right">{hint}</span>}
      </div>
      {children}
    </div>
  )
}

function SelectControl({ value, onChange, children }) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={onChange}
        className="w-full appearance-none rounded-lg bg-surface-2 border border-surface-4 text-txt-primary text-sm focus:outline-none focus:border-surface-5 transition-colors"
        style={{ padding: '10px 36px 10px 12px', cursor: 'pointer' }}
      >
        {children}
      </select>
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-txt-tertiary">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
          <polyline points="6 9 12 15 18 9" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    </div>
  )
}

function InputControl({ value, onChange, placeholder, type = 'text' }) {
  return (
    <input
      type={type}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      className="w-full rounded-lg bg-surface-2 border border-surface-4 text-txt-primary text-sm focus:outline-none focus:border-surface-5 transition-colors"
      style={{ padding: '10px 12px' }}
    />
  )
}

/* ═══════════════════════════════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════════════════════════════ */

function collectAvailableYears(player, dynasty) {
  const years = new Set()
  if (player?.classByYear) Object.keys(player.classByYear).forEach(y => { const n = Number(y); if (Number.isFinite(n)) years.add(n) })
  if (player?.statsByYear) Object.keys(player.statsByYear).forEach(y => { const n = Number(y); if (Number.isFinite(n)) years.add(n) })
  if (player?.teamsByYear) Object.keys(player.teamsByYear).forEach(y => { const n = Number(y); if (Number.isFinite(n)) years.add(n) })
  if (dynasty?.currentYear) years.add(Number(dynasty.currentYear))
  if (dynasty?.startYear) years.add(Number(dynasty.startYear))
  return Array.from(years).sort((a, b) => b - a)
}

function collectAvailableAwards(player) {
  const out = []
  if (Array.isArray(player?.accolades)) {
    player.accolades.forEach(a => {
      if (a?.award && a?.year) {
        const label = a.award
          .replace(/([A-Z])/g, ' $1')
          .replace(/^./, c => c.toUpperCase())
          .trim()
        out.push({ key: a.award, year: a.year, label })
      }
    })
  }
  return out.sort((a, b) => Number(b.year) - Number(a.year))
}
