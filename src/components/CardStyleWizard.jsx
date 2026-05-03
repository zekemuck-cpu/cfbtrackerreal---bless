/**
 * CardStyleWizard — the new prompt-driven card creation/editing UI.
 *
 * Replaces the old PNG-template + zone-overlay flow. Users no longer
 * upload a single screenshot and watch the app composite it inside a
 * frame; instead they:
 *
 *   1. Pick a CARD STYLE (real-world brand+year, e.g. "1989 Topps")
 *   2. Pick a CONTEXT (rookie / season / specific game / championship /
 *      award / custom) — the variable surface that fills the prompt
 *   3. Copy the populated FRONT prompt → generate externally → paste URL
 *   4. Copy the populated BACK prompt → generate externally → paste URL
 *
 * The card record stores `styleId`, `contextType`, `contextDetails`,
 * `frontImageUrl`, `backImageUrl` plus a couple of metadata fields.
 *
 * Backward compatibility: cards still saved under the old `templateId`
 * scheme keep rendering through the legacy CardComposer in the parent
 * editor — this wizard never touches them.
 */

import { useMemo, useState } from 'react'
import ImageUpload from './ImageUpload'
import {
  CARD_STYLES,
  CARD_CONTEXTS,
  getCardStyle,
  listCardStylesByEra,
} from '../data/cardStyles'
import {
  buildCardPromptVariables,
  interpolatePrompt,
} from '../utils/cardPromptVariables'
import { listPlayerGames } from '../utils/playerCards'

// Era labels + ordering — covers every era key emitted by the brand-
// research catalog. Add new keys here when extending the catalog into
// new decades or specialty sub-eras (e.g. 'modern_topps_now').
const ERA_LABELS = {
  vintage_1950s: 'Vintage · 1950s',
  vintage_1960s: 'Vintage · 1960s',
  vintage_1970s: 'Vintage · 1970s',
  early_80s: 'Early 80s',
  mid_80s: 'Mid 80s',
  late_80s: 'Late 80s',
  early_modern: 'Early Modern',
  early_90s: 'Early 90s',
  early_90s_premium: 'Early 90s · Premium',
  mid_90s: 'Mid 90s',
  mid_90s_premium: 'Mid 90s · Premium',
  late_90s_premium: 'Late 90s · Premium',
  early_2000s: 'Early 2000s',
  early_2000s_premium: 'Early 2000s · Premium',
  mid_2000s: 'Mid 2000s',
  mid_2000s_premium: 'Mid 2000s · Premium',
  late_2000s_premium: 'Late 2000s · Premium',
  early_2010s: 'Early 2010s',
  modern_panini: 'Modern · Panini Era',
  college: 'College-Specific',
  misc: 'Misc',
}
const ERA_ORDER = [
  'vintage_1950s', 'vintage_1960s', 'vintage_1970s',
  'early_80s', 'mid_80s', 'late_80s',
  'early_modern', 'early_90s', 'early_90s_premium',
  'mid_90s', 'mid_90s_premium', 'late_90s_premium',
  'early_2000s', 'early_2000s_premium',
  'mid_2000s', 'mid_2000s_premium', 'late_2000s_premium',
  'early_2010s', 'modern_panini',
  'college', 'misc',
]

export default function CardStyleWizard({
  card,
  onChange,
  player,
  dynasty,
  teamColors,
  onCancel,
}) {
  // Local working copy so the user can stage edits without committing
  // until they click Save (parent handles the actual save flow).
  const [working, setWorking] = useState(() => normalizeNewCard(card))

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

  const update = (patch) => {
    const next = { ...working, ...patch }
    setWorking(next)
    onChange?.(next)
  }
  const updateContextDetails = (patch) => {
    update({ contextDetails: { ...(working.contextDetails || {}), ...patch } })
  }

  const playerGames = useMemo(() => listPlayerGames(player, dynasty), [player, dynasty])
  const availableYears = useMemo(() => collectAvailableYears(player, dynasty), [player, dynasty])
  const availableAwards = useMemo(() => collectAvailableAwards(player), [player])
  const stylesByEra = useMemo(() => listCardStylesByEra(), [])

  const noStyles = CARD_STYLES.length === 0

  return (
    <div className="space-y-5">
      {/* === Step 1: pick a style === */}
      <Section
        step={1}
        title="Card style"
        hint="Real-world brand + year. The prompt that fills in below is what you'll feed to your AI image generator."
      >
        {noStyles ? (
          <EmptyStateNoStyles />
        ) : (
          <StylePicker
            value={working.styleId}
            stylesByEra={stylesByEra}
            onChange={(styleId) => update({ styleId })}
          />
        )}
      </Section>

      {/* === Step 2: context === */}
      <Section
        step={2}
        title="What does this card commemorate?"
        hint="Sets the storyline. Picks the variables that fill the prompt — opponent, score, award, etc."
      >
        <ContextPicker
          value={working.contextType}
          year={working.year}
          contextDetails={working.contextDetails}
          onChangeContext={(contextType) => update({ contextType })}
          onChangeYear={(year) => update({ year: Number(year) || null })}
          onChangeDetails={updateContextDetails}
          availableYears={availableYears}
          availableGames={playerGames}
          availableAwards={availableAwards}
        />
      </Section>

      {/* === Step 3 & 4: prompts + uploads === */}
      <Section
        step={3}
        title="Generate front + back"
        hint="Copy each prompt, paste it into your AI image gen, save the result, paste the URL below. Same flow as the player photo upload."
      >
        {style ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <PromptUploadColumn
              label="Front"
              prompt={filledFrontPrompt}
              imageUrl={working.frontImageUrl}
              onChangeImage={(url) => update({ frontImageUrl: url })}
              teamColors={teamColors}
            />
            <PromptUploadColumn
              label="Back"
              prompt={filledBackPrompt}
              imageUrl={working.backImageUrl}
              onChangeImage={(url) => update({ backImageUrl: url })}
              teamColors={teamColors}
            />
          </div>
        ) : (
          <p className="text-xs text-txt-tertiary">Pick a style above to see the prompts.</p>
        )}
      </Section>

      {/* === Optional metadata === */}
      <Section step={4} title="Label (optional)" hint="A short note for the card list — appears under the front image.">
        <input
          type="text"
          value={working.label || ''}
          onChange={(e) => update({ label: e.target.value })}
          placeholder="e.g. Heisman Trophy, Iron Bowl Win, Senior Day"
          className="w-full px-3 py-2.5 rounded-lg bg-surface-3 border border-surface-4 text-txt-primary text-sm focus:border-blue-500 focus:outline-none"
        />
      </Section>

      {onCancel && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1.5 rounded-md text-xs font-medium bg-surface-3 border border-surface-5 text-txt-secondary hover:text-txt-primary hover:bg-surface-4 transition-colors"
          >
            Done
          </button>
        </div>
      )}
    </div>
  )
}

/* ----- Sub-components ----- */

function Section({ step, title, hint, children }) {
  return (
    <section
      className="rounded-xl"
      style={{ backgroundColor: 'var(--surface-2)', border: '1px solid var(--surface-4)' }}
    >
      <header className="px-4 py-3 flex items-baseline justify-between gap-3 border-b" style={{ borderColor: 'var(--surface-4)' }}>
        <div>
          <div
            className="label-xs text-txt-tertiary"
            style={{ letterSpacing: '1.5px', fontSize: '10px' }}
          >
            STEP {step}
          </div>
          <h3 className="text-sm font-bold text-txt-primary leading-tight">{title}</h3>
        </div>
        {hint && (
          <p className="text-[11px] text-txt-tertiary text-right max-w-sm leading-snug">{hint}</p>
        )}
      </header>
      <div className="p-4">{children}</div>
    </section>
  )
}

function StylePicker({ value, stylesByEra, onChange }) {
  return (
    <div className="space-y-4">
      {ERA_ORDER.filter(era => stylesByEra[era]?.length).map(era => (
        <div key={era}>
          <div
            className="label-xs text-txt-tertiary mb-2"
            style={{ letterSpacing: '1.5px', fontSize: '10px' }}
          >
            {ERA_LABELS[era] || era.toUpperCase()}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {stylesByEra[era].map(s => (
              <button
                key={s.id}
                type="button"
                onClick={() => onChange(s.id)}
                className={`text-left rounded-lg overflow-hidden transition-all ${
                  value === s.id ? 'ring-2 ring-blue-500' : ''
                }`}
                style={{
                  backgroundColor: 'var(--surface-3)',
                  border: '1px solid var(--surface-4)',
                }}
              >
                {s.samplePreviewUrl ? (
                  <img
                    src={s.samplePreviewUrl}
                    alt={s.label}
                    className="w-full aspect-[5/7] object-cover"
                  />
                ) : (
                  <div
                    className="w-full aspect-[5/7] flex items-center justify-center text-xs text-txt-tertiary"
                    style={{ backgroundColor: 'var(--surface-2)' }}
                  >
                    No preview
                  </div>
                )}
                <div className="px-2 py-1.5">
                  <div className="text-xs font-bold text-txt-primary truncate">{s.label}</div>
                  <div className="text-[10px] text-txt-tertiary truncate">{s.brand} · {s.year}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function ContextPicker({
  value, year, contextDetails,
  onChangeContext, onChangeYear, onChangeDetails,
  availableYears, availableGames, availableAwards,
}) {
  return (
    <div className="space-y-3">
      {/* Context type chips */}
      <div className="flex flex-wrap gap-2">
        {CARD_CONTEXTS.map(ctx => (
          <button
            key={ctx.id}
            type="button"
            onClick={() => onChangeContext(ctx.id)}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
              value === ctx.id ? 'text-white' : 'text-txt-secondary hover:text-txt-primary'
            }`}
            style={{
              backgroundColor: value === ctx.id ? 'var(--accent-info, #3b82f6)' : 'var(--surface-3)',
              border: '1px solid ' + (value === ctx.id ? 'var(--accent-info, #3b82f6)' : 'var(--surface-4)'),
            }}
          >
            {ctx.label}
          </button>
        ))}
      </div>

      {/* Year selector — present for every context */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
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

      {/* Per-context detail inputs */}
      {value === 'game' && (
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

      {value === 'championship' && (
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

      {value === 'award' && (
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
            {availableAwards.length === 0 && (
              <option disabled>No awards on this player</option>
            )}
          </select>
        </label>
      )}

      {value === 'custom' && (
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

function PromptUploadColumn({ label, prompt, imageUrl, onChangeImage, teamColors }) {
  const [copied, setCopied] = useState(false)
  const onCopy = async () => {
    try {
      await navigator.clipboard?.writeText(prompt)
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    } catch {}
  }
  return (
    <div className="space-y-3">
      <div
        className="label-xs text-txt-tertiary"
        style={{ letterSpacing: '1.5px', fontSize: '10px' }}
      >
        {label.toUpperCase()} OF CARD
      </div>

      {/* Filled prompt — read-only textarea + copy */}
      <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--surface-4)' }}>
        <div className="flex items-center justify-between px-2.5 py-1.5" style={{ backgroundColor: 'var(--surface-1)' }}>
          <span className="text-[10px] uppercase tracking-wider text-txt-tertiary">Prompt</span>
          <button
            type="button"
            onClick={onCopy}
            disabled={!prompt}
            className="text-[11px] font-semibold px-2 py-0.5 rounded bg-surface-3 border border-surface-4 text-txt-secondary hover:text-txt-primary disabled:opacity-50 transition-colors"
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
        <textarea
          value={prompt}
          readOnly
          rows={6}
          placeholder={prompt ? '' : 'Pick a style above to see the prompt here.'}
          className="w-full px-2.5 py-2 text-[11px] font-mono leading-snug bg-surface-2 text-txt-primary resize-vertical focus:outline-none"
        />
      </div>

      {/* Preview + upload */}
      <div>
        <div className="text-[10px] uppercase tracking-wider text-txt-tertiary mb-1">Generated image</div>
        {imageUrl ? (
          <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--surface-4)' }}>
            <img src={imageUrl} alt="" className="w-full aspect-[5/7] object-cover" />
          </div>
        ) : (
          <div
            className="w-full aspect-[5/7] rounded-lg flex items-center justify-center text-[11px] text-txt-tertiary"
            style={{ backgroundColor: 'var(--surface-1)', border: '1px dashed var(--surface-4)' }}
          >
            No image yet
          </div>
        )}
        <div className="mt-2">
          <ImageUpload
            value={imageUrl || ''}
            onChange={onChangeImage}
            teamColors={teamColors}
            placeholder={`Paste, drop, or URL — ${label.toLowerCase()} image`}
          />
        </div>
      </div>
    </div>
  )
}

function EmptyStateNoStyles() {
  return (
    <div
      className="rounded-lg p-5 text-center text-txt-tertiary"
      style={{ backgroundColor: 'var(--surface-3)', border: '1px dashed var(--surface-4)' }}
    >
      <div className="text-sm font-bold text-txt-secondary">No card styles configured yet</div>
      <p className="mt-2 text-xs leading-relaxed max-w-md mx-auto">
        Style descriptions + prompts get added to{' '}
        <code className="font-mono text-txt-secondary">src/data/cardStyles.js</code>{' '}
        once the brand-research pass produces them. The wizard is wired up
        and ready — drop the styles in and they'll appear here automatically.
      </p>
    </div>
  )
}

/* ----- Helpers ----- */

function normalizeNewCard(card) {
  return {
    id: card?.id || newId(),
    styleId: card?.styleId || (CARD_STYLES[0]?.id || ''),
    contextType: card?.contextType || 'season',
    contextDetails: card?.contextDetails || {},
    year: card?.year || null,
    frontImageUrl: card?.frontImageUrl || '',
    backImageUrl: card?.backImageUrl || '',
    label: card?.label || '',
    createdAt: card?.createdAt || new Date().toISOString(),
  }
}

function newId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `crd_${crypto.randomUUID().slice(0, 12)}`
  }
  return `crd_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function collectAvailableYears(player, dynasty) {
  const years = new Set()
  if (player?.classByYear) {
    Object.keys(player.classByYear).forEach(y => {
      const n = Number(y)
      if (Number.isFinite(n)) years.add(n)
    })
  }
  if (player?.statsByYear) {
    Object.keys(player.statsByYear).forEach(y => {
      const n = Number(y)
      if (Number.isFinite(n)) years.add(n)
    })
  }
  if (player?.teamsByYear) {
    Object.keys(player.teamsByYear).forEach(y => {
      const n = Number(y)
      if (Number.isFinite(n)) years.add(n)
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
