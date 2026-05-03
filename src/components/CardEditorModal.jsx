/**
 * CardEditorModal — focused full-screen editor for a single trading
 * card. Opened from PlayerCards' grid (for both adding new cards and
 * editing existing ones).
 *
 * Wizard layout — three phases, one per screen, to avoid the long
 * scrolling page the original layout produced:
 *
 *   1. STYLE     — pick the brand/year card design (CardStylePicker)
 *   2. CONTEXT   — what does this card commemorate (season / rookie /
 *                  game / championship / award / custom) + year + label
 *   3. GENERATE  — populated front + back prompts to copy into an AI
 *                  image generator, plus upload fields for the result
 *
 * Step pills at the top show progress and let the user jump back to any
 * earlier phase. Footer has Back / Next, with Save only on phase 3.
 *
 * For new cards we start on phase 1 (Style). For edits we start on
 * phase 3 (Generate) since the user most likely wants to replace one
 * of the images.
 *
 * Variables resolve live: as the user picks a different style or
 * changes the context, the phase-3 prompts re-interpolate using
 * cardPromptVariables.js. Copy + paste into the user's AI image-gen
 * tool, generate, paste/upload the result back into either side.
 *
 * No autosave. The user clicks Save to commit; Cancel discards.
 */

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import CardStylePicker from './CardStylePicker'
import ImageUpload from './ImageUpload'
import { CARD_CONTEXTS, WEEKLY_AWARDS, getCardStyle } from '../data/cardStyles'
import {
  buildCardPromptVariables,
  interpolatePrompt,
} from '../utils/cardPromptVariables'
import { listPlayerGames } from '../utils/playerCards'

const PHASES = [
  { id: 'style',    label: 'Style',    short: '1' },
  { id: 'context',  label: 'Context',  short: '2' },
  { id: 'generate', label: 'Generate', short: '3' },
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
  // Local working copy. The parent only sees the final card on Save.
  const [working, setWorking] = useState(() => ({ ...card }))

  // Wizard phase. New cards start at Style; edits start at Generate.
  const [phaseIdx, setPhaseIdx] = useState(isNew ? 0 : 2)

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

  // What does each phase need before the user can move to the next one?
  // (The user can always jump backward.)
  const phaseComplete = (idx) => {
    if (idx === 0) return !!working.styleId
    if (idx === 1) {
      if (!working.contextType || !working.year) return false
      const d = working.contextDetails || {}
      if (working.contextType === 'game'         && !d.gameId) return false
      if (working.contextType === 'award'        && !d.awardKey) return false
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
      className="fixed inset-0 top-0 left-0 right-0 bottom-0 z-[9999] flex items-stretch justify-center"
      style={{ margin: 0, backgroundColor: 'rgba(0,0,0,0.78)' }}
      onClick={onCancel}
    >
      <div
        className="w-full max-w-5xl max-h-screen flex flex-col my-4 mx-4 rounded-xl overflow-hidden"
        style={{ backgroundColor: 'var(--surface-1)', border: '1px solid var(--surface-4)', boxShadow: '0 28px 80px rgba(0,0,0,0.7)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <header
          className="flex items-center justify-between gap-3 px-5 py-3 flex-shrink-0"
          style={{ backgroundColor: 'var(--surface-2)', borderBottom: '1px solid var(--surface-4)' }}
        >
          <div className="min-w-0">
            <div
              className="label-xs text-txt-tertiary"
              style={{ letterSpacing: '2px', fontSize: '10px' }}
            >
              {isNew ? 'NEW CARD' : 'EDIT CARD'} · {phaseIdx + 1} OF {PHASES.length}
            </div>
            <h2 className="text-base font-bold text-txt-primary leading-tight truncate">
              {phaseIdx === 0 && 'Pick a card style'}
              {phaseIdx === 1 && 'What does this card commemorate?'}
              {phaseIdx === 2 && (style?.label || 'Generate the card')}
            </h2>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="p-2 rounded-md hover:bg-surface-4 text-txt-secondary hover:text-txt-primary transition-colors flex-shrink-0"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </header>

        {/* Phase pills — clickable to jump backward; forward only when prior phases complete */}
        <nav
          className="flex items-stretch flex-shrink-0"
          style={{ backgroundColor: 'var(--surface-2)', borderBottom: '1px solid var(--surface-4)' }}
        >
          {PHASES.map((p, i) => {
            const active = i === phaseIdx
            const complete = phaseComplete(i)
            const reachable = i <= phaseIdx || (i > phaseIdx && phaseComplete(i - 1))
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => { if (reachable) setPhaseIdx(i) }}
                disabled={!reachable}
                className="flex-1 px-4 py-2.5 text-xs font-bold border-r last:border-r-0 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                style={{
                  borderRightColor: 'var(--surface-4)',
                  backgroundColor: active ? 'var(--surface-1)' : 'transparent',
                  color: active ? 'var(--text-primary)' : (complete ? '#3b82f6' : 'var(--text-tertiary)'),
                  borderBottom: active ? '2px solid #3b82f6' : '2px solid transparent',
                }}
              >
                <span className="opacity-70 mr-1.5">{p.short}</span>
                {p.label}
                {complete && !active && <span className="ml-2 text-[#22c55e]">✓</span>}
              </button>
            )
          })}
        </nav>

        {/* Phase body */}
        <div className="flex-1 overflow-y-auto p-5">
          {phase.id === 'style' && (
            <PhaseStyle
              styleId={working.styleId}
              onChange={(styleId) => update({ styleId })}
            />
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

        {/* Footer */}
        <footer
          className="flex items-center justify-between gap-3 px-5 py-3 flex-shrink-0 flex-wrap"
          style={{ backgroundColor: 'var(--surface-2)', borderTop: '1px solid var(--surface-4)' }}
        >
          <div className="text-xs text-txt-tertiary">
            {phaseIdx === 0 && (working.styleId ? `Picked: ${style?.label}` : 'Pick a style to continue.')}
            {phaseIdx === 1 && (canAdvance ? 'Context set.' : 'Pick a context type, year, and any required detail.')}
            {phaseIdx === 2 && (canSave ? 'Ready to save.' : 'Upload at least the front image to save.')}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="px-3 py-1.5 rounded-md text-xs font-semibold bg-surface-3 border border-surface-5 text-txt-secondary hover:text-txt-primary transition-colors"
            >
              Cancel
            </button>
            {phaseIdx > 0 && (
              <button
                type="button"
                onClick={goBack}
                className="px-3 py-1.5 rounded-md text-xs font-semibold bg-surface-3 border border-surface-5 text-txt-secondary hover:text-txt-primary transition-colors"
              >
                Back
              </button>
            )}
            {phaseIdx < PHASES.length - 1 && (
              <button
                type="button"
                disabled={!canAdvance}
                onClick={goNext}
                className="px-4 py-1.5 rounded-md text-xs font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                style={{
                  backgroundColor: canAdvance ? '#3b82f6' : 'var(--surface-3)',
                  color: '#fff',
                }}
              >
                Next →
              </button>
            )}
            {phaseIdx === PHASES.length - 1 && (
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
            )}
          </div>
        </footer>
      </div>
    </div>,
    portalTarget
  )
}

/* ---------- Phase panels ---------- */

function PhaseStyle({ styleId, onChange }) {
  return (
    <div className="space-y-3 max-w-3xl mx-auto">
      <p className="text-xs text-txt-tertiary leading-snug">
        Pick a real-world brand and year. Each style controls how the front and back of
        the card look. The prompt populates with this player's data on the next step.
      </p>
      <CardStylePicker value={styleId} onChange={onChange} />
    </div>
  )
}

/**
 * Context phase — six type chips, year select, per-context detail
 * input, plus the optional thumbnail label. All consolidated here so
 * the user fills out the entire storyline before moving to Generate.
 */
function PhaseContext({
  working, onChange, onChangeContextDetails,
  availableYears, availableGames, availableAwards,
}) {
  return (
    <div className="space-y-5 max-w-3xl mx-auto">
      <Section title="Type" hint="Tells the prompt what storyline to build — season, specific game, award, etc.">
        <div className="flex flex-wrap gap-1.5">
          {CARD_CONTEXTS.map(ctx => {
            const active = working.contextType === ctx.id
            return (
              <button
                key={ctx.id}
                type="button"
                onClick={() => onChange({ contextType: ctx.id })}
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
        {working.contextType && (
          <p className="text-[11px] text-txt-tertiary leading-snug mt-2">
            {CARD_CONTEXTS.find(c => c.id === working.contextType)?.hint}
          </p>
        )}
      </Section>

      <Section title="Year" hint="Drives stats, team, classification, and team record on the card.">
        <select
          value={working.year || ''}
          onChange={(e) => onChange({ year: Number(e.target.value) || null })}
          className="w-full px-3 py-2 rounded bg-surface-3 border border-surface-4 text-txt-primary text-sm focus:border-blue-500 focus:outline-none"
        >
          <option value="">Select a season…</option>
          {availableYears.map(y => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </Section>

      {working.contextType === 'game' && (
        <>
          <Section title="Game" hint="Specific game memento. Back of card will show only this game.">
            <select
              value={working.contextDetails?.gameId || ''}
              onChange={(e) => onChangeContextDetails({ gameId: e.target.value })}
              className="w-full px-3 py-2 rounded bg-surface-3 border border-surface-4 text-txt-primary text-sm focus:border-blue-500 focus:outline-none"
            >
              <option value="">Select a game…</option>
              {availableGames.map(g => (
                <option key={g.gameId} value={g.gameId}>
                  {g.year} W{g.week} · {g.won ? 'W' : 'L'} {g.playerScore}-{g.oppScore} {g.location === 'home' ? 'vs' : g.location === 'away' ? '@' : 'vs (N)'} {g.opponentName}
                </option>
              ))}
            </select>
          </Section>

          <Section title="Weekly award (optional)" hint="If the player won a Player-of-the-Week honor for this game, the card becomes a POTW commemorative — front gets a banner, back features the honor.">
            <select
              value={working.contextDetails?.weeklyAward || ''}
              onChange={(e) => onChangeContextDetails({ weeklyAward: e.target.value })}
              className="w-full px-3 py-2 rounded bg-surface-3 border border-surface-4 text-txt-primary text-sm focus:border-blue-500 focus:outline-none"
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
            </select>
          </Section>
        </>
      )}

      {working.contextType === 'championship' && (
        <Section title="Championship" hint="Title or trophy this card commemorates.">
          <select
            value={working.contextDetails?.championshipKey || ''}
            onChange={(e) => onChangeContextDetails({
              championshipKey: e.target.value,
              championshipName: e.target.options[e.target.selectedIndex].text,
            })}
            className="w-full px-3 py-2 rounded bg-surface-3 border border-surface-4 text-txt-primary text-sm focus:border-blue-500 focus:outline-none"
          >
            <option value="">Select…</option>
            <option value="natty">National Championship</option>
            <option value="cfp_semi">CFP Semifinal Win</option>
            <option value="conf">Conference Championship</option>
            <option value="bowl">Bowl Win</option>
          </select>
        </Section>
      )}

      {working.contextType === 'award' && (
        <Section title="Award" hint="Heisman, Maxwell, etc. Back of card features the award.">
          <select
            value={working.contextDetails?.awardKey || ''}
            onChange={(e) => onChangeContextDetails({ awardKey: e.target.value })}
            className="w-full px-3 py-2 rounded bg-surface-3 border border-surface-4 text-txt-primary text-sm focus:border-blue-500 focus:outline-none"
          >
            <option value="">Select…</option>
            {availableAwards.map(a => (
              <option key={a.key} value={a.key}>{a.label} ({a.year})</option>
            ))}
            {availableAwards.length === 0 && <option disabled>No awards on this player</option>}
          </select>
        </Section>
      )}

      {working.contextType === 'custom' && (
        <Section title="Custom storyline" hint="Type the storyline yourself.">
          <input
            type="text"
            value={working.contextDetails?.customLabel || ''}
            onChange={(e) => onChangeContextDetails({ customLabel: e.target.value })}
            placeholder="e.g. Walk-on to All-American, Bowl MVP, etc."
            className="w-full px-3 py-2 rounded bg-surface-3 border border-surface-4 text-txt-primary text-sm focus:border-blue-500 focus:outline-none"
          />
        </Section>
      )}

      <Section title="Label (optional)" hint="A short tag shown under the card thumbnail in the collection grid.">
        <input
          type="text"
          value={working.label || ''}
          onChange={(e) => onChange({ label: e.target.value })}
          placeholder="e.g. Heisman Trophy, Iron Bowl Win, Senior Day"
          className="w-full px-3 py-2 rounded-md bg-surface-3 border border-surface-4 text-txt-primary text-sm focus:border-blue-500 focus:outline-none"
        />
      </Section>
    </div>
  )
}

/**
 * Generate phase — show the populated front + back prompts side-by-
 * side (or stacked on narrow viewports), each paired with an upload
 * field for the AI-generated result.
 */
function PhaseGenerate({ style, filledFrontPrompt, filledBackPrompt, working, onChange, teamColors }) {
  if (!style) {
    return (
      <div className="max-w-3xl mx-auto text-center text-sm text-txt-tertiary py-12">
        Pick a card style first to see the prompts.
      </div>
    )
  }
  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
      <PromptColumn
        side="front"
        prompt={filledFrontPrompt}
        imageUrl={working.frontImageUrl}
        onChangeImage={(url) => onChange({ frontImageUrl: url })}
        teamColors={teamColors}
      />
      <PromptColumn
        side="back"
        prompt={filledBackPrompt}
        imageUrl={working.backImageUrl}
        onChangeImage={(url) => onChange({ backImageUrl: url })}
        teamColors={teamColors}
      />
    </div>
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
 * PromptColumn — single side (front or back) of the card editor.
 * Shows the populated prompt with a copy button, and an upload field
 * for the resulting image.
 */
function PromptColumn({ side, prompt, imageUrl, onChangeImage, teamColors }) {
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

      {/* Body — prompt textarea + image preview/upload */}
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 p-3">
        <div className="min-w-0">
          <textarea
            value={prompt}
            readOnly
            rows={6}
            className="w-full px-2.5 py-2 text-[11px] font-mono leading-snug bg-surface-1 text-txt-primary rounded border border-surface-4 resize-vertical focus:outline-none"
            style={{ minHeight: 140 }}
          />
        </div>
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
