/**
 * CardEditorModal — focused full-screen editor for a single trading
 * card. Opened from PlayerCards' grid (for both adding new cards and
 * editing existing ones).
 *
 * Wizard layout — three phases, one per screen:
 *
 *   1. STYLE     — pick the brand/year card design (CardStylePicker)
 *   2. CONTEXT   — what does this card commemorate (season / freshman /
 *                  game / championship / award / custom) + year + label
 *   3. GENERATE  — populated front + back prompts to copy into an AI
 *                  image generator, plus upload fields for the result
 *
 * Visual direction — "the slab": dark surfaces, hairline rules,
 * condensed display type for phase numerals, Outfit for headings,
 * DM Sans for body, ui-monospace for prompts. Team color is the only
 * chromatic accent — it lives on the active phase, primary buttons,
 * focus rings, and the completed-phase checks. Card slots in phase 3
 * use a 5:7 aspect ratio and a dashed sleeve border to feel like
 * grading slabs that haven't received their hit yet.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import CardStylePicker from './CardStylePicker'
import ImageUpload from './ImageUpload'
import { CARD_CONTEXTS, WEEKLY_AWARDS, getCardStyle } from '../data/cardStyles'
import {
  buildCardPromptVariables,
  interpolatePrompt,
} from '../utils/cardPromptVariables'
import { listPlayerGames } from '../utils/playerCards'
import { formatScoreHighLow } from '../utils/scoreFormat'

const PHASES = [
  { id: 'style',    label: 'Style',    short: '01' },
  { id: 'context',  label: 'Context',  short: '02' },
  { id: 'generate', label: 'Generate', short: '03' },
]

// Default accent when teamColors prop is missing. Pulls from
// the design system's surface tones instead of system blue.
const FALLBACK_ACCENT = 'var(--surface-5)'

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

  const update = (patch) => setWorking(w => ({ ...w, ...patch }))
  const updateContextDetails = (patch) =>
    setWorking(w => ({ ...w, contextDetails: { ...(w.contextDetails || {}), ...patch } }))

  // Esc to cancel
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onCancel?.() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onCancel])

  const accent = teamColors?.primary || FALLBACK_ACCENT
  // Translucent variants of the accent for subtle backgrounds, glows,
  // and rings. Computed once per render — color-mix would do the same
  // in CSS but inline gives finer control over alpha per use.
  const accentSoft = `${accent}1f`     // ~12%
  const accentTint = `${accent}33`     // ~20%
  const accentRing = `${accent}66`     // ~40%

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
  const phaseTitle =
    phaseIdx === 0 ? 'Pick a card style' :
    phaseIdx === 1 ? 'What does this card commemorate?' :
    (style?.label || 'Generate the card')

  const footerStatus =
    phaseIdx === 0 ? (working.styleId ? `Selected — ${style?.label}` : 'Pick a style to continue.') :
    phaseIdx === 1 ? (canAdvance ? 'Context locked in.' : 'Pick a type, year, and any required detail.') :
    (canSave ? 'Ready to save.' : 'Upload at least the front image to save.')

  return createPortal(
    <div
      className="fixed inset-0 top-0 left-0 right-0 bottom-0 z-[9999] flex items-stretch justify-center"
      style={{
        margin: 0,
        // Atmospheric backdrop — a subtle radial pulse of the team
        // accent fades into a deep near-black, giving depth without
        // competing with the modal contents.
        background: `radial-gradient(ellipse at top, ${accent}1a 0%, rgba(0,0,0,0.85) 60%)`,
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
      }}
      onClick={onCancel}
    >
      <div
        className="w-full max-w-5xl max-h-screen flex flex-col my-4 mx-4 overflow-hidden"
        style={{
          backgroundColor: 'var(--surface-1)',
          border: '1px solid var(--surface-4)',
          borderRadius: 14,
          boxShadow: `
            0 40px 100px rgba(0,0,0,0.7),
            0 8px 24px rgba(0,0,0,0.5),
            inset 0 1px 0 rgba(255,255,255,0.04)
          `,
          fontFamily: "'DM Sans', system-ui, sans-serif",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ─── Header ─────────────────────────────────────────────── */}
        <header
          className="flex items-center justify-between gap-4 px-6 py-4 flex-shrink-0 relative"
          style={{
            backgroundColor: 'var(--surface-2)',
            borderBottom: '1px solid var(--surface-4)',
          }}
        >
          {/* Left rail accent — a 2px team-color stroke that runs the
              full height of the header. Tiny detail, but it's the kind
              of thing premium products do. */}
          <span
            aria-hidden="true"
            className="absolute left-0 top-0 bottom-0 w-[2px]"
            style={{ backgroundColor: accent }}
          />

          <div className="min-w-0 flex items-baseline gap-3">
            <span
              className="font-black tabular-nums leading-none flex-shrink-0"
              style={{
                fontFamily: "'Outfit', system-ui, sans-serif",
                fontSize: 28,
                color: 'var(--text-primary)',
                letterSpacing: '-0.02em',
              }}
            >
              {String(phaseIdx + 1).padStart(2, '0')}
              <span style={{ color: 'var(--text-muted)' }}>/03</span>
            </span>
            <div className="min-w-0">
              <div
                className="leading-none mb-1"
                style={{
                  fontSize: 9.5,
                  letterSpacing: '0.22em',
                  color: 'var(--text-tertiary)',
                  textTransform: 'uppercase',
                  fontWeight: 700,
                }}
              >
                {isNew ? 'New Card' : 'Edit Card'} {phase.label}
              </div>
              <h2
                className="font-bold text-txt-primary leading-tight truncate"
                style={{
                  fontFamily: "'Outfit', system-ui, sans-serif",
                  fontSize: 18,
                  letterSpacing: '-0.01em',
                }}
              >
                {phaseTitle}
              </h2>
            </div>
          </div>

          <button
            type="button"
            onClick={onCancel}
            className="flex items-center justify-center rounded-md text-txt-tertiary hover:text-txt-primary transition-colors flex-shrink-0"
            style={{
              width: 36,
              height: 36,
              backgroundColor: 'transparent',
              border: '1px solid var(--surface-4)',
            }}
            aria-label="Close"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </header>

        {/* ─── Phase tracker — numbered chips on a hairline rail ──── */}
        <PhaseTracker
          phases={PHASES}
          phaseIdx={phaseIdx}
          phaseComplete={phaseComplete}
          onSelect={(i) => setPhaseIdx(i)}
          accent={accent}
          accentTint={accentTint}
        />

        {/* ─── Phase body ─────────────────────────────────────────── */}
        <div
          className="flex-1 overflow-y-auto"
          style={{
            backgroundColor: 'var(--surface-1)',
            // Subtle vertical gradient so the body has depth — darker at
            // the edges, slightly lifted at the top.
            backgroundImage: 'linear-gradient(180deg, rgba(255,255,255,0.012) 0%, rgba(0,0,0,0) 200px)',
          }}
        >
          <div className="px-6 py-7 sm:px-8 sm:py-8">
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
                accent={accent}
                accentSoft={accentSoft}
                accentRing={accentRing}
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
                accent={accent}
                accentSoft={accentSoft}
                accentRing={accentRing}
              />
            )}
          </div>
        </div>

        {/* ─── Footer ─────────────────────────────────────────────── */}
        <footer
          className="flex items-center justify-between gap-4 px-6 py-4 flex-shrink-0 flex-wrap"
          style={{
            backgroundColor: 'var(--surface-2)',
            borderTop: '1px solid var(--surface-4)',
          }}
        >
          <div
            className="text-xs flex items-center gap-2 min-w-0"
            style={{ color: 'var(--text-tertiary)' }}
          >
            <span
              aria-hidden="true"
              className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: canAdvance || canSave ? accent : 'var(--surface-5)' }}
            />
            <span className="truncate">{footerStatus}</span>
          </div>
          <div className="flex items-center gap-2">
            <SecondaryButton onClick={onCancel}>Cancel</SecondaryButton>
            {phaseIdx > 0 && (
              <SecondaryButton onClick={goBack}>← Back</SecondaryButton>
            )}
            {phaseIdx < PHASES.length - 1 && (
              <PrimaryButton
                onClick={goNext}
                disabled={!canAdvance}
                accent={accent}
              >
                Next →
              </PrimaryButton>
            )}
            {phaseIdx === PHASES.length - 1 && (
              <PrimaryButton
                onClick={async () => {
                  if (!canSave || saving) return
                  setSaving(true)
                  try {
                    await onSave(working)
                  } finally {
                    setSaving(false)
                  }
                }}
                disabled={!canSave || saving}
                accent={accent}
              >
                {saving ? 'Saving…' : (isNew ? 'Save card' : 'Save changes')}
              </PrimaryButton>
            )}
          </div>
        </footer>
      </div>
    </div>,
    portalTarget
  )
}

/* ═══════════════════════════════════════════════════════════════════
   Phase tracker
   ═══════════════════════════════════════════════════════════════════ */

function PhaseTracker({ phases, phaseIdx, phaseComplete, onSelect, accent, accentTint }) {
  return (
    <nav
      className="flex-shrink-0 px-6 py-4 sm:px-8"
      style={{
        backgroundColor: 'var(--surface-2)',
        borderBottom: '1px solid var(--surface-4)',
      }}
    >
      <ol className="flex items-center justify-between gap-2 sm:gap-4 max-w-2xl mx-auto">
        {phases.map((p, i) => {
          const active = i === phaseIdx
          const complete = phaseComplete(i)
          const reachable = i <= phaseIdx || (i > phaseIdx && phaseComplete(i - 1))
          const isLast = i === phases.length - 1

          // Visual state for the chip: active → solid accent fill;
          // complete → outlined accent with check; pending → muted.
          const chipBg = active ? accent : complete ? 'transparent' : 'var(--surface-3)'
          const chipBorder = active
            ? accent
            : complete
              ? accent
              : 'var(--surface-5)'
          const chipColor = active
            ? '#fff'
            : complete
              ? accent
              : 'var(--text-tertiary)'
          const labelColor = active
            ? 'var(--text-primary)'
            : complete
              ? 'var(--text-secondary)'
              : 'var(--text-tertiary)'

          return (
            <li key={p.id} className="flex items-center flex-1 min-w-0">
              <button
                type="button"
                onClick={() => { if (reachable) onSelect(i) }}
                disabled={!reachable}
                className="flex items-center gap-2.5 sm:gap-3 group disabled:cursor-not-allowed flex-shrink-0"
              >
                <span
                  className="relative flex items-center justify-center font-bold tabular-nums transition-all"
                  style={{
                    width: 32,
                    height: 32,
                    fontFamily: "'Outfit', system-ui, sans-serif",
                    fontSize: 12,
                    backgroundColor: chipBg,
                    border: `1.5px solid ${chipBorder}`,
                    color: chipColor,
                    borderRadius: 8,
                    boxShadow: active ? `0 0 0 4px ${accentTint}` : 'none',
                  }}
                >
                  {complete && !active ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
                      <polyline points="20 6 9 17 4 12" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : (
                    p.short
                  )}
                </span>
                <span
                  className="text-xs font-bold uppercase whitespace-nowrap transition-colors"
                  style={{
                    fontFamily: "'Outfit', system-ui, sans-serif",
                    letterSpacing: '0.12em',
                    color: labelColor,
                  }}
                >
                  {p.label}
                </span>
              </button>
              {!isLast && (
                <span
                  aria-hidden="true"
                  className="flex-1 mx-2 sm:mx-3 transition-colors"
                  style={{
                    height: 1,
                    backgroundColor: complete ? accent : 'var(--surface-5)',
                    minWidth: 16,
                    opacity: complete ? 0.5 : 1,
                  }}
                />
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   Phase 1 — Style
   ═══════════════════════════════════════════════════════════════════ */

function PhaseStyle({ styleId, onChange }) {
  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <PhaseLeadIn
        eyebrow="Step 01 — Style"
        title="Pick the brand and year"
        body="Each style locks the front and back design, the era's typography, and the prompt language we'll send to the image generator on the final step. The full catalog runs from 1952 Bowman to today's Panini Prizm parallels."
      />
      <CardStylePicker value={styleId} onChange={onChange} />
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   Phase 2 — Context
   ═══════════════════════════════════════════════════════════════════ */

function PhaseContext({
  working, onChange, onChangeContextDetails,
  availableYears, availableGames, availableAwards,
  accent, accentSoft, accentRing,
}) {
  return (
    <div className="space-y-7 max-w-3xl mx-auto">
      <PhaseLeadIn
        eyebrow="Step 02 — Context"
        title="What does this card commemorate?"
        body="The context controls the back of the card — career table for a season card, single-game line for a game card, trophy detail for awards and championships."
      />

      <Section title="Type" hint="Sets the storyline the card tells.">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {CARD_CONTEXTS.map(ctx => {
            const active = working.contextType === ctx.id
            return (
              <button
                key={ctx.id}
                type="button"
                onClick={() => onChange({ contextType: ctx.id })}
                className="text-left transition-all duration-150"
                style={{
                  padding: '12px 14px',
                  backgroundColor: active ? accentSoft : 'var(--surface-2)',
                  color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                  border: `1px solid ${active ? accent : 'var(--surface-4)'}`,
                  borderRadius: 8,
                  boxShadow: active ? `inset 0 0 0 1px ${accent}` : 'none',
                  cursor: 'pointer',
                }}
              >
                <div
                  className="text-sm font-bold leading-tight"
                  style={{ fontFamily: "'Outfit', system-ui, sans-serif" }}
                >
                  {ctx.label}
                </div>
                <div
                  className="text-[11px] mt-1 leading-snug"
                  style={{ color: active ? 'var(--text-secondary)' : 'var(--text-tertiary)' }}
                >
                  {ctx.hint}
                </div>
              </button>
            )
          })}
        </div>
      </Section>

      <Section title="Year" hint="Drives stats, classification, and team record.">
        <StyledSelect
          value={working.year || ''}
          onChange={(e) => onChange({ year: Number(e.target.value) || null })}
          accentRing={accentRing}
        >
          <option value="">Select a season…</option>
          {availableYears.map(y => (
            <option key={y} value={y}>{y}</option>
          ))}
        </StyledSelect>
      </Section>

      {working.contextType === 'game' && (
        <>
          <Section title="Game" hint="Specific game memento. Only this game appears on the back.">
            <StyledSelect
              value={working.contextDetails?.gameId || ''}
              onChange={(e) => onChangeContextDetails({ gameId: e.target.value })}
              accentRing={accentRing}
            >
              <option value="">Select a game…</option>
              {availableGames.map(g => (
                <option key={g.gameId} value={g.gameId}>
                  {g.year} W{g.week} {g.won ? 'W' : 'L'} {formatScoreHighLow(g.playerScore, g.oppScore) || '—'} {g.location === 'home' ? 'vs' : g.location === 'away' ? '@' : 'vs (N)'} {g.opponentName}
                </option>
              ))}
            </StyledSelect>
          </Section>

          <Section title="Weekly award (optional)" hint="If the player took home a Player-of-the-Week honor for this game, the card becomes a POTW commemorative.">
            <StyledSelect
              value={working.contextDetails?.weeklyAward || ''}
              onChange={(e) => onChangeContextDetails({ weeklyAward: e.target.value })}
              accentRing={accentRing}
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
            </StyledSelect>
          </Section>
        </>
      )}

      {working.contextType === 'championship' && (
        <Section title="Championship" hint="Title or trophy this card commemorates.">
          <StyledSelect
            value={working.contextDetails?.championshipKey || ''}
            onChange={(e) => onChangeContextDetails({
              championshipKey: e.target.value,
              championshipName: e.target.options[e.target.selectedIndex].text,
            })}
            accentRing={accentRing}
          >
            <option value="">Select…</option>
            <option value="natty">National Championship</option>
            <option value="cfp_semi">CFP Semifinal Win</option>
            <option value="conf">Conference Championship</option>
            <option value="bowl">Bowl Win</option>
          </StyledSelect>
        </Section>
      )}

      {working.contextType === 'award' && (
        <Section title="Award" hint="Heisman, Maxwell, etc. The award becomes the back's headline.">
          <StyledSelect
            value={working.contextDetails?.awardKey || ''}
            onChange={(e) => onChangeContextDetails({ awardKey: e.target.value })}
            accentRing={accentRing}
          >
            <option value="">Select…</option>
            {availableAwards.map(a => (
              <option key={a.key} value={a.key}>{a.label} ({a.year})</option>
            ))}
            {availableAwards.length === 0 && <option disabled>No awards on this player</option>}
          </StyledSelect>
        </Section>
      )}

      {working.contextType === 'custom' && (
        <Section title="Custom storyline" hint="Type the storyline yourself.">
          <StyledInput
            type="text"
            value={working.contextDetails?.customLabel || ''}
            onChange={(e) => onChangeContextDetails({ customLabel: e.target.value })}
            placeholder="e.g. Walk-on to All-American, Bowl MVP, Senior Day farewell…"
            accentRing={accentRing}
          />
        </Section>
      )}

      <Section title="Label (optional)" hint="A short tag shown under the card thumbnail in the collection grid.">
        <StyledInput
          type="text"
          value={working.label || ''}
          onChange={(e) => onChange({ label: e.target.value })}
          placeholder="e.g. Heisman Trophy, Iron Bowl Win, Senior Day"
          accentRing={accentRing}
        />
      </Section>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   Phase 3 — Generate
   ═══════════════════════════════════════════════════════════════════ */

function PhaseGenerate({
  style, filledFrontPrompt, filledBackPrompt, working, onChange,
  teamColors, accent, accentSoft, accentRing,
}) {
  if (!style) {
    return (
      <div className="max-w-3xl mx-auto text-center py-16">
        <div
          className="inline-flex items-center justify-center mb-4"
          style={{
            width: 56, height: 56,
            borderRadius: 12,
            backgroundColor: 'var(--surface-2)',
            border: '1px dashed var(--surface-5)',
            color: 'var(--text-tertiary)',
          }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
          </svg>
        </div>
        <p className="text-sm text-txt-secondary">
          Pick a card style on Step 01 to populate the prompts.
        </p>
      </div>
    )
  }
  return (
    <div className="space-y-7">
      <PhaseLeadIn
        eyebrow="Step 03 — Generate"
        title={style.label}
        body="Copy each prompt into your AI image generator. Drop the resulting front and back back into the slots below — the back is optional."
      />
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <PromptCard
          side="front"
          prompt={filledFrontPrompt}
          imageUrl={working.frontImageUrl}
          onChangeImage={(url) => onChange({ frontImageUrl: url })}
          teamColors={teamColors}
          accent={accent}
          accentSoft={accentSoft}
          accentRing={accentRing}
        />
        <PromptCard
          side="back"
          prompt={filledBackPrompt}
          imageUrl={working.backImageUrl}
          onChangeImage={(url) => onChange({ backImageUrl: url })}
          teamColors={teamColors}
          accent={accent}
          accentSoft={accentSoft}
          accentRing={accentRing}
        />
      </div>
    </div>
  )
}

/**
 * PromptCard — one side (front or back). The aesthetic mirrors a card
 * grading slab: a labelled head strip with the side number, a recessed
 * monospace prompt window, and a 5:7 card slot beneath that doubles as
 * the drop zone preview.
 */
function PromptCard({
  side, prompt, imageUrl, onChangeImage, teamColors,
  accent, accentSoft, accentRing,
}) {
  const [copied, setCopied] = useState(false)
  const imageUploadRef = useRef(null)
  const onCopy = async () => {
    try {
      await navigator.clipboard?.writeText(prompt)
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    } catch {}
  }
  const sideLabel = side === 'front' ? 'FRONT' : 'BACK'
  const sideNumeral = side === 'front' ? 'A' : 'B'

  return (
    <div
      className="overflow-hidden"
      style={{
        backgroundColor: 'var(--surface-2)',
        border: '1px solid var(--surface-4)',
        borderRadius: 12,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)',
      }}
    >
      {/* ── Head strip ───────────────────────────────────────────── */}
      <header
        className="flex items-center justify-between gap-3 px-4 py-3"
        style={{
          backgroundColor: 'var(--surface-3)',
          borderBottom: '1px solid var(--surface-4)',
        }}
      >
        <div className="flex items-baseline gap-3 min-w-0">
          <span
            className="font-black leading-none flex-shrink-0 tabular-nums"
            style={{
              fontFamily: "'Outfit', system-ui, sans-serif",
              fontSize: 22,
              color: accent,
              letterSpacing: '-0.03em',
            }}
          >
            {sideNumeral}
          </span>
          <div className="min-w-0">
            <div
              className="leading-none"
              style={{
                fontFamily: "'Outfit', system-ui, sans-serif",
                fontSize: 13,
                fontWeight: 800,
                color: 'var(--text-primary)',
                letterSpacing: '0.04em',
              }}
            >
              {sideLabel} OF CARD
            </div>
            <div
              className="leading-none mt-1"
              style={{
                fontSize: 9,
                letterSpacing: '0.22em',
                color: 'var(--text-tertiary)',
                textTransform: 'uppercase',
                fontWeight: 600,
              }}
            >
              {prompt ? `${prompt.length.toLocaleString()} chars` : 'Awaiting prompt'}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={onCopy}
          disabled={!prompt}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
          style={{
            backgroundColor: copied ? accent : 'var(--surface-2)',
            color: copied ? '#fff' : 'var(--text-secondary)',
            border: `1px solid ${copied ? accent : 'var(--surface-5)'}`,
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.04em',
          }}
        >
          {copied ? (
            <>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
                <polyline points="20 6 9 17 4 12" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Copied
            </>
          ) : (
            <>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
              </svg>
              Copy
            </>
          )}
        </button>
      </header>

      {/* ── Body ─────────────────────────────────────────────────── */}
      <div className="p-4 space-y-4">
        {/* Prompt window — looks like an inset terminal pane */}
        <div
          className="overflow-hidden"
          style={{
            backgroundColor: 'var(--surface-0)',
            border: '1px solid var(--surface-4)',
            borderRadius: 8,
            boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.4)',
          }}
        >
          {/* Tiny title bar with terminal-style dots — sells the
              "this is a real prompt" feel without being kitschy. */}
          <div
            className="flex items-center gap-2 px-3 py-2"
            style={{
              borderBottom: '1px solid var(--surface-4)',
              backgroundColor: 'rgba(255,255,255,0.015)',
            }}
          >
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: '#3a3c45' }} />
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: '#3a3c45' }} />
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: '#3a3c45' }} />
            </span>
            <span
              className="text-[9.5px] font-mono"
              style={{ color: 'var(--text-muted)', letterSpacing: '0.05em' }}
            >
              {sideLabel.toLowerCase()}.prompt
            </span>
          </div>
          <textarea
            value={prompt}
            readOnly
            rows={9}
            className="w-full px-3.5 py-3 leading-relaxed resize-vertical focus:outline-none"
            style={{
              fontFamily: "ui-monospace, 'SF Mono', 'JetBrains Mono', Menlo, Consolas, monospace",
              fontSize: 11.5,
              lineHeight: 1.65,
              backgroundColor: 'transparent',
              color: 'var(--text-secondary)',
              border: 'none',
              minHeight: 200,
            }}
          />
        </div>

        {/* Card slot — 5:7 aspect, dashed border when empty so it
            reads as a sleeve waiting for a card. Sits above the
            upload controls so the visual preview anchors the eye. */}
        <div>
          <div className="flex items-baseline justify-between mb-2.5">
            <div
              className="text-[9.5px] font-bold uppercase"
              style={{
                letterSpacing: '0.22em',
                color: 'var(--text-tertiary)',
                fontFamily: "'Outfit', system-ui, sans-serif",
              }}
            >
              {sideLabel} Slot
            </div>
            <div
              className="text-[9px] font-bold uppercase"
              style={{
                letterSpacing: '0.18em',
                color: imageUrl ? accent : 'var(--text-muted)',
                fontFamily: "'Outfit', system-ui, sans-serif",
              }}
            >
              {imageUrl ? '● Loaded' : '○ Empty'}
            </div>
          </div>
          <CardSlot
            imageUrl={imageUrl}
            sideLabel={sideLabel}
            accent={accent}
            accentSoft={accentSoft}
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
    </div>
  )
}

function CardSlot({ imageUrl, sideLabel, accent, accentSoft, onClick, onDragOver, onDragLeave, onDrop }) {
  return (
    <div
      className="relative overflow-hidden mx-auto"
      style={{
        aspectRatio: '5/7',
        maxWidth: 240,
        width: '100%',
        borderRadius: 10,
        backgroundColor: imageUrl ? 'transparent' : 'var(--surface-1)',
        border: imageUrl ? `1px solid ${accent}` : '1.5px dashed var(--surface-5)',
        boxShadow: imageUrl
          ? `0 12px 32px rgba(0,0,0,0.5), 0 0 0 4px ${accentSoft}`
          : 'inset 0 1px 0 rgba(255,255,255,0.02), 0 4px 16px rgba(0,0,0,0.25)',
        transition: 'all 0.2s ease',
        cursor: onClick ? 'pointer' : undefined,
      }}
      onClick={onClick}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {imageUrl ? (
        <img
          src={imageUrl}
          alt={sideLabel}
          className="w-full h-full object-cover block"
        />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2.5 p-4">
          <CardCorners />
          <span
            className="font-black leading-none tabular-nums"
            style={{
              fontFamily: "'Outfit', system-ui, sans-serif",
              fontSize: 56,
              color: 'var(--text-muted)',
              letterSpacing: '-0.04em',
            }}
          >
            {sideLabel === 'FRONT' ? 'A' : 'B'}
          </span>
          <span
            className="text-[10px] font-bold text-center"
            style={{
              letterSpacing: '0.22em',
              color: 'var(--text-tertiary)',
              textTransform: 'uppercase',
              fontFamily: "'Outfit', system-ui, sans-serif",
            }}
          >
            Upload {sideLabel === 'FRONT' ? 'Front' : 'Back'} Here
          </span>
        </div>
      )}
    </div>
  )
}

function CardCorners() {
  // Four 14px L-shapes in each corner, evoking framing crops on a
  // grading slab.
  const cornerStyle = {
    position: 'absolute',
    width: 14,
    height: 14,
    borderColor: 'var(--surface-5)',
  }
  return (
    <>
      <span aria-hidden="true" style={{ ...cornerStyle, top: 8,    left: 8,    borderTop: '1.5px solid', borderLeft: '1.5px solid' }} />
      <span aria-hidden="true" style={{ ...cornerStyle, top: 8,    right: 8,   borderTop: '1.5px solid', borderRight: '1.5px solid' }} />
      <span aria-hidden="true" style={{ ...cornerStyle, bottom: 8, left: 8,    borderBottom: '1.5px solid', borderLeft: '1.5px solid' }} />
      <span aria-hidden="true" style={{ ...cornerStyle, bottom: 8, right: 8,   borderBottom: '1.5px solid', borderRight: '1.5px solid' }} />
    </>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   Shared building blocks
   ═══════════════════════════════════════════════════════════════════ */

function PhaseLeadIn({ eyebrow, title, body }) {
  return (
    <div className="space-y-2 mb-1">
      <div
        className="leading-none"
        style={{
          fontSize: 9.5,
          letterSpacing: '0.28em',
          color: 'var(--text-tertiary)',
          textTransform: 'uppercase',
          fontWeight: 700,
        }}
      >
        {eyebrow}
      </div>
      <h3
        className="font-bold leading-tight"
        style={{
          fontFamily: "'Outfit', system-ui, sans-serif",
          fontSize: 22,
          color: 'var(--text-primary)',
          letterSpacing: '-0.015em',
        }}
      >
        {title}
      </h3>
      <p
        className="text-sm leading-relaxed max-w-2xl"
        style={{ color: 'var(--text-tertiary)' }}
      >
        {body}
      </p>
    </div>
  )
}

function Section({ title, hint, children }) {
  return (
    <section>
      <header className="mb-2.5 flex items-baseline justify-between gap-3">
        <h4
          className="font-bold leading-none"
          style={{
            fontFamily: "'Outfit', system-ui, sans-serif",
            fontSize: 11,
            letterSpacing: '0.2em',
            color: 'var(--text-secondary)',
            textTransform: 'uppercase',
          }}
        >
          {title}
        </h4>
        {hint && (
          <p
            className="text-[11px] leading-snug text-right"
            style={{ color: 'var(--text-tertiary)' }}
          >
            {hint}
          </p>
        )}
      </header>
      {children}
    </section>
  )
}

function StyledSelect({ value, onChange, children, accentRing }) {
  const [focused, setFocused] = useState(false)
  return (
    <div className="relative">
      <select
        value={value}
        onChange={onChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        className="w-full appearance-none focus:outline-none"
        style={{
          padding: '11px 38px 11px 14px',
          backgroundColor: 'var(--surface-2)',
          color: 'var(--text-primary)',
          fontSize: 14,
          border: `1px solid ${focused ? accentRing : 'var(--surface-4)'}`,
          borderRadius: 8,
          fontFamily: "'DM Sans', system-ui, sans-serif",
          fontWeight: 500,
          transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
          boxShadow: focused ? `0 0 0 4px ${accentRing}33` : 'none',
          cursor: 'pointer',
        }}
      >
        {children}
      </select>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2"
        style={{ color: 'var(--text-tertiary)' }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
          <polyline points="6 9 12 15 18 9" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    </div>
  )
}

function StyledInput({ value, onChange, placeholder, type = 'text', accentRing }) {
  const [focused, setFocused] = useState(false)
  return (
    <input
      type={type}
      value={value}
      onChange={onChange}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      placeholder={placeholder}
      className="w-full focus:outline-none"
      style={{
        padding: '11px 14px',
        backgroundColor: 'var(--surface-2)',
        color: 'var(--text-primary)',
        fontSize: 14,
        border: `1px solid ${focused ? accentRing : 'var(--surface-4)'}`,
        borderRadius: 8,
        fontFamily: "'DM Sans', system-ui, sans-serif",
        fontWeight: 500,
        transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
        boxShadow: focused ? `0 0 0 4px ${accentRing}33` : 'none',
      }}
    />
  )
}

function SecondaryButton({ children, onClick, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
      style={{
        padding: '8px 14px',
        backgroundColor: 'var(--surface-3)',
        color: 'var(--text-secondary)',
        fontSize: 12.5,
        fontWeight: 700,
        border: '1px solid var(--surface-5)',
        borderRadius: 8,
        fontFamily: "'DM Sans', system-ui, sans-serif",
        letterSpacing: '0.02em',
      }}
      onMouseEnter={(e) => {
        if (!disabled) {
          e.currentTarget.style.backgroundColor = 'var(--surface-4)'
          e.currentTarget.style.color = 'var(--text-primary)'
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = 'var(--surface-3)'
        e.currentTarget.style.color = 'var(--text-secondary)'
      }}
    >
      {children}
    </button>
  )
}

function PrimaryButton({ children, onClick, disabled, accent }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="transition-all duration-150 disabled:opacity-30 disabled:cursor-not-allowed"
      style={{
        padding: '9px 18px',
        backgroundColor: disabled ? 'var(--surface-3)' : accent,
        color: disabled ? 'var(--text-muted)' : '#fff',
        fontSize: 12.5,
        fontWeight: 800,
        border: `1px solid ${disabled ? 'var(--surface-5)' : accent}`,
        borderRadius: 8,
        fontFamily: "'DM Sans', system-ui, sans-serif",
        letterSpacing: '0.02em',
        boxShadow: disabled ? 'none' : `0 4px 14px ${accent}55, inset 0 1px 0 rgba(255,255,255,0.18)`,
      }}
      onMouseEnter={(e) => {
        if (!disabled) {
          e.currentTarget.style.transform = 'translateY(-1px)'
          e.currentTarget.style.boxShadow = `0 6px 18px ${accent}66, inset 0 1px 0 rgba(255,255,255,0.22)`
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0)'
        if (!disabled) {
          e.currentTarget.style.boxShadow = `0 4px 14px ${accent}55, inset 0 1px 0 rgba(255,255,255,0.18)`
        }
      }}
    >
      {children}
    </button>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════════════════════════════ */

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
