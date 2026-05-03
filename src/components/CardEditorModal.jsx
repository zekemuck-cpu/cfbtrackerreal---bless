/**
 * CardEditorModal — focused full-screen editor for a single trading
 * card. Opened from PlayerCards' grid (for both adding new cards and
 * editing existing ones).
 *
 * Layout:
 *   • Header — "Add card" / "Edit card" + close button
 *   • Body  — two-pane on wide viewports, stacked on narrow:
 *               LEFT  — CardStylePicker + ContextPanel
 *               RIGHT — Front prompt + Front upload
 *                       Back prompt  + Back upload
 *   • Footer — Cancel + Save card
 *
 * Variables resolve live: as the user picks a different style or
 * changes the context, the prompts on the right re-interpolate using
 * cardPromptVariables.js. Copy + paste into the user's AI image-gen
 * tool, generate, paste/upload the result back into either side.
 *
 * No autosave. The user clicks Save to commit; Cancel discards.
 */

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import CardStylePicker from './CardStylePicker'
import ImageUpload from './ImageUpload'
import { CARD_CONTEXTS, getCardStyle } from '../data/cardStyles'
import {
  buildCardPromptVariables,
  interpolatePrompt,
} from '../utils/cardPromptVariables'
import { listPlayerGames } from '../utils/playerCards'

export default function CardEditorModal({
  card,
  isNew,
  player,
  dynasty,
  teamColors,
  onSave,
  onCancel,
}) {
  // Local working copy. The parent only sees the final card on Save.
  const [working, setWorking] = useState(() => ({ ...card }))

  const update = (patch) => setWorking(w => ({ ...w, ...patch }))
  const updateContextDetails = (patch) =>
    setWorking(w => ({ ...w, contextDetails: { ...(w.contextDetails || {}), ...patch } }))

  // Lock body scroll while modal open
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  // Esc to cancel
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

  const canSave = !!(working.frontImageUrl || working.backImageUrl)

  const portalTarget = typeof document !== 'undefined' ? document.body : null
  if (!portalTarget) return null

  return createPortal(
    <div
      className="fixed inset-0 top-0 left-0 right-0 bottom-0 z-[9999] flex items-stretch justify-center"
      style={{ margin: 0, backgroundColor: 'rgba(0,0,0,0.78)' }}
      onClick={onCancel}
    >
      <div
        className="w-full max-w-6xl max-h-screen flex flex-col my-4 mx-4 rounded-xl overflow-hidden"
        style={{ backgroundColor: 'var(--surface-1)', border: '1px solid var(--surface-4)', boxShadow: '0 28px 80px rgba(0,0,0,0.7)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <header
          className="flex items-center justify-between gap-3 px-5 py-3 flex-shrink-0"
          style={{ backgroundColor: 'var(--surface-2)', borderBottom: '1px solid var(--surface-4)' }}
        >
          <div>
            <div
              className="label-xs text-txt-tertiary"
              style={{ letterSpacing: '2px', fontSize: '10px' }}
            >
              {isNew ? 'NEW CARD' : 'EDIT CARD'}
            </div>
            <h2 className="text-base font-bold text-txt-primary leading-tight">
              {style?.label || 'Pick a style'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="p-2 rounded-md hover:bg-surface-4 text-txt-secondary hover:text-txt-primary transition-colors"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </header>

        {/* Body — two pane on wide, stacked on narrow */}
        <div className="flex-1 overflow-y-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 lg:divide-x divide-surface-4">
            {/* Left pane — style picker + context */}
            <div className="p-5 space-y-5 min-w-0">
              <Section title="Card style" hint="Pick a real-world brand and year. The prompt below auto-fills with this player's data.">
                <CardStylePicker
                  value={working.styleId}
                  onChange={(styleId) => update({ styleId })}
                />
              </Section>

              <Section title="What does this card commemorate?" hint="Sets the storyline that fills the prompt — opponent, score, award, etc.">
                <ContextPanel
                  contextType={working.contextType}
                  contextDetails={working.contextDetails}
                  year={working.year}
                  onChangeContext={(t) => update({ contextType: t })}
                  onChangeYear={(y) => update({ year: Number(y) || null })}
                  onChangeDetails={updateContextDetails}
                  availableYears={availableYears}
                  availableGames={playerGames}
                  availableAwards={availableAwards}
                />
              </Section>

              <Section title="Label (optional)" hint="A short tag shown under the card thumbnail.">
                <input
                  type="text"
                  value={working.label || ''}
                  onChange={(e) => update({ label: e.target.value })}
                  placeholder="e.g. Heisman Trophy, Iron Bowl Win, Senior Day"
                  className="w-full px-3 py-2 rounded-md bg-surface-3 border border-surface-4 text-txt-primary text-sm focus:border-blue-500 focus:outline-none"
                />
              </Section>
            </div>

            {/* Right pane — prompts + uploads */}
            <div className="p-5 space-y-4 min-w-0">
              <PromptColumn
                side="front"
                prompt={filledFrontPrompt}
                imageUrl={working.frontImageUrl}
                onChangeImage={(url) => update({ frontImageUrl: url })}
                teamColors={teamColors}
                styleSelected={!!style}
              />
              <PromptColumn
                side="back"
                prompt={filledBackPrompt}
                imageUrl={working.backImageUrl}
                onChangeImage={(url) => update({ backImageUrl: url })}
                teamColors={teamColors}
                styleSelected={!!style}
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <footer
          className="flex items-center justify-between gap-3 px-5 py-3 flex-shrink-0 flex-wrap"
          style={{ backgroundColor: 'var(--surface-2)', borderTop: '1px solid var(--surface-4)' }}
        >
          <div className="text-xs text-txt-tertiary">
            {canSave ? 'Ready to save.' : 'Upload at least the front image to save.'}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="px-3 py-1.5 rounded-md text-xs font-semibold bg-surface-3 border border-surface-5 text-txt-secondary hover:text-txt-primary transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!canSave}
              onClick={() => onSave(working)}
              className="px-4 py-1.5 rounded-md text-xs font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                backgroundColor: canSave ? '#3b82f6' : 'var(--surface-3)',
                color: '#fff',
              }}
            >
              {isNew ? 'Save card' : 'Save changes'}
            </button>
          </div>
        </footer>
      </div>
    </div>,
    portalTarget
  )
}

/* ---------- Sub-components ---------- */

function Section({ title, hint, children }) {
  return (
    <section>
      <header className="mb-2">
        <h3
          className="label-xs text-txt-secondary"
          style={{ letterSpacing: '2px', fontSize: '10px' }}
        >
          {title.toUpperCase()}
        </h3>
        {hint && (
          <p className="text-[11px] text-txt-tertiary leading-snug mt-1">{hint}</p>
        )}
      </header>
      {children}
    </section>
  )
}

/**
 * ContextPanel — the "what does this commemorate" picker. Six chips +
 * a year selector + per-context detail fields that swap in based on
 * the active chip.
 */
function ContextPanel({
  contextType, contextDetails, year,
  onChangeContext, onChangeYear, onChangeDetails,
  availableYears, availableGames, availableAwards,
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {CARD_CONTEXTS.map(ctx => {
          const active = contextType === ctx.id
          return (
            <button
              key={ctx.id}
              type="button"
              onClick={() => onChangeContext(ctx.id)}
              className="px-3 py-1.5 rounded-md text-xs font-semibold transition-colors"
              style={{
                backgroundColor: active ? '#3b82f6' : 'var(--surface-3)',
                color: active ? '#fff' : 'var(--text-secondary)',
                border: '1px solid ' + (active ? '#3b82f6' : 'var(--surface-4)'),
              }}
            >
              {ctx.label}
            </button>
          )
        })}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="text-[10px] uppercase tracking-wider text-txt-tertiary">Season year</span>
          <select
            value={year || ''}
            onChange={(e) => onChangeYear(e.target.value)}
            className="mt-1 w-full px-2 py-1.5 rounded bg-surface-3 border border-surface-4 text-txt-primary text-xs focus:border-blue-500 focus:outline-none"
          >
            <option value="">Select…</option>
            {availableYears.map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </label>
      </div>

      {/* Per-context detail input */}
      {contextType === 'game' && (
        <label className="block">
          <span className="text-[10px] uppercase tracking-wider text-txt-tertiary">Game</span>
          <select
            value={contextDetails?.gameId || ''}
            onChange={(e) => onChangeDetails({ gameId: e.target.value })}
            className="mt-1 w-full px-2 py-1.5 rounded bg-surface-3 border border-surface-4 text-txt-primary text-xs focus:border-blue-500 focus:outline-none"
          >
            <option value="">Select a game…</option>
            {availableGames.map(g => (
              <option key={g.gameId} value={g.gameId}>
                {g.year} W{g.week} · {g.won ? 'W' : 'L'} {g.playerScore}-{g.oppScore} {g.location === 'home' ? 'vs' : g.location === 'away' ? '@' : 'vs (N)'} {g.opponentName}
              </option>
            ))}
          </select>
        </label>
      )}
      {contextType === 'championship' && (
        <label className="block">
          <span className="text-[10px] uppercase tracking-wider text-txt-tertiary">Championship</span>
          <select
            value={contextDetails?.championshipKey || ''}
            onChange={(e) => onChangeDetails({
              championshipKey: e.target.value,
              championshipName: e.target.options[e.target.selectedIndex].text,
            })}
            className="mt-1 w-full px-2 py-1.5 rounded bg-surface-3 border border-surface-4 text-txt-primary text-xs focus:border-blue-500 focus:outline-none"
          >
            <option value="">Select…</option>
            <option value="natty">National Championship</option>
            <option value="cfp_semi">CFP Semifinal Win</option>
            <option value="conf">Conference Championship</option>
            <option value="bowl">Bowl Win</option>
          </select>
        </label>
      )}
      {contextType === 'award' && (
        <label className="block">
          <span className="text-[10px] uppercase tracking-wider text-txt-tertiary">Award</span>
          <select
            value={contextDetails?.awardKey || ''}
            onChange={(e) => onChangeDetails({ awardKey: e.target.value })}
            className="mt-1 w-full px-2 py-1.5 rounded bg-surface-3 border border-surface-4 text-txt-primary text-xs focus:border-blue-500 focus:outline-none"
          >
            <option value="">Select…</option>
            {availableAwards.map(a => (
              <option key={a.key} value={a.key}>{a.label} ({a.year})</option>
            ))}
            {availableAwards.length === 0 && <option disabled>No awards on this player</option>}
          </select>
        </label>
      )}
      {contextType === 'custom' && (
        <label className="block">
          <span className="text-[10px] uppercase tracking-wider text-txt-tertiary">Custom context</span>
          <input
            type="text"
            value={contextDetails?.customLabel || ''}
            onChange={(e) => onChangeDetails({ customLabel: e.target.value })}
            placeholder="e.g. Walk-on to All-American, Bowl MVP, etc."
            className="mt-1 w-full px-2 py-1.5 rounded bg-surface-3 border border-surface-4 text-txt-primary text-xs focus:border-blue-500 focus:outline-none"
          />
        </label>
      )}
    </div>
  )
}

/**
 * PromptColumn — single side (front or back) of the card editor's
 * right pane. Shows the populated prompt with a copy button, and an
 * upload field for the resulting image.
 */
function PromptColumn({ side, prompt, imageUrl, onChangeImage, teamColors, styleSelected }) {
  const [copied, setCopied] = useState(false)
  const onCopy = async () => {
    try {
      await navigator.clipboard?.writeText(prompt)
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    } catch {}
  }
  const sideLabel = side.toUpperCase()
  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ border: '1px solid var(--surface-4)', backgroundColor: 'var(--surface-2)' }}
    >
      {/* Header strip */}
      <header
        className="flex items-center justify-between gap-3 px-3 py-2"
        style={{ backgroundColor: 'var(--surface-3)', borderBottom: '1px solid var(--surface-4)' }}
      >
        <div
          className="label-xs text-txt-secondary font-bold"
          style={{ letterSpacing: '2px', fontSize: '10px' }}
        >
          {sideLabel} OF CARD
        </div>
        <button
          type="button"
          onClick={onCopy}
          disabled={!prompt}
          className="text-[11px] font-semibold px-2.5 py-1 rounded transition-colors disabled:opacity-50"
          style={{
            backgroundColor: copied ? '#22c55e' : 'var(--surface-2)',
            color: copied ? '#fff' : 'var(--text-secondary)',
            border: '1px solid ' + (copied ? '#22c55e' : 'var(--surface-4)'),
          }}
        >
          {copied ? 'Copied!' : 'Copy prompt'}
        </button>
      </header>

      {/* Body — two columns at sm+: prompt textarea | image preview/upload */}
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 p-3">
        {/* Prompt */}
        <div className="min-w-0">
          <textarea
            value={prompt}
            readOnly
            rows={8}
            placeholder={styleSelected ? '' : `Pick a style on the left to see the ${side} prompt.`}
            className="w-full px-2.5 py-2 text-[11px] font-mono leading-snug bg-surface-1 text-txt-primary rounded border border-surface-4 resize-vertical focus:outline-none"
            style={{ minHeight: 160 }}
          />
        </div>
        {/* Image preview + upload */}
        <div className="space-y-2 sm:w-44">
          {imageUrl ? (
            <div className="rounded-md overflow-hidden" style={{ border: '1px solid var(--surface-4)' }}>
              <img src={imageUrl} alt="" className="w-full aspect-[5/7] object-cover" />
            </div>
          ) : (
            <div
              className="w-full aspect-[5/7] rounded-md flex items-center justify-center text-[10px] text-txt-tertiary text-center"
              style={{ backgroundColor: 'var(--surface-1)', border: '1px dashed var(--surface-4)' }}
            >
              {sideLabel} IMAGE
            </div>
          )}
          <ImageUpload
            value={imageUrl || ''}
            onChange={onChangeImage}
            teamColors={teamColors}
            placeholder={`Paste, drop, or URL`}
          />
        </div>
      </div>
    </div>
  )
}

/* ---------- Helpers ---------- */

function collectAvailableYears(player, dynasty) {
  const years = new Set()
  if (player?.classByYear) {
    Object.keys(player.classByYear).forEach(y => {
      const n = Number(y); if (Number.isFinite(n)) years.add(n)
    })
  }
  if (player?.statsByYear) {
    Object.keys(player.statsByYear).forEach(y => {
      const n = Number(y); if (Number.isFinite(n)) years.add(n)
    })
  }
  if (player?.teamsByYear) {
    Object.keys(player.teamsByYear).forEach(y => {
      const n = Number(y); if (Number.isFinite(n)) years.add(n)
    })
  }
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
