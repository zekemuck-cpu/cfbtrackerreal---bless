// Editor for a player's cards[] array. Each card panel:
//   – pick a template
//   – upload the player photo (CFB 26 screenshot, drop, paste, URL)
//   – adjust how the photo fits — zoom slider + drag-to-pan in the
//     live preview, with a Reset
//   – optional year, label, game tag
// Persistence: receives `cards` and `onChange(newCards)` from the
// parent (PlayerEdit) plus an `onSave` callback wired to the parent's
// handleSave so the user can save without scrolling back to the
// header. A "you have unsaved changes" status hangs in a sticky bar
// at the bottom of the editor when `dirty` is true.

import { useMemo, useEffect, useState } from 'react'
import ImageUpload from './ImageUpload'
import CardComposer from './CardComposer'
import CardZoneEditor from './CardZoneEditor'
import CardStyleWizard from './CardStyleWizard'
import { listCardTemplates, DEFAULT_TEMPLATE_ID } from '../data/cardTemplates'
import { CARD_STYLES, getCardStyle } from '../data/cardStyles'
import { newCardId, listPlayerGames } from '../utils/playerCards'

const DEFAULT_TRANSFORM = { scale: 1, offsetX: 0, offsetY: 0 }

export default function PlayerCardListEditor({
  cards,
  onChange,
  player,
  dynasty,
  teamColors,
  onSave,
  saving,
  dirty,
}) {
  const list = Array.isArray(cards) ? cards : []
  const templates = listCardTemplates()
  const playerGames = useMemo(() => listPlayerGames(player, dynasty), [player, dynasty])
  const accent = teamColors?.primary || '#6b7280'

  const updateAt = (idx, partial) => {
    const next = list.map((c, i) => i === idx ? { ...c, ...partial } : c)
    onChange(next)
  }
  const removeAt = (idx) => {
    if (!confirm('Delete this card? This cannot be undone.')) return
    onChange(list.filter((_, i) => i !== idx))
  }
  // New cards default to the prompt-driven flow (styleId + front/back
  // image URLs). Legacy cards (templateId-based) continue to render via
  // the old CardComposer path for backward compatibility, but no new
  // ones are produced from this button.
  const addCard = () => {
    onChange([
      ...list,
      {
        id: newCardId(),
        styleId: CARD_STYLES[0]?.id || '',
        contextType: 'season',
        contextDetails: {},
        year: dynasty?.currentYear || null,
        frontImageUrl: '',
        backImageUrl: '',
        label: '',
        createdAt: new Date().toISOString(),
      }
    ])
  }

  return (
    <section className="space-y-6">
      {/* Header — no redundant heading text; just a count + clear actions. */}
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div className="min-w-0 flex items-baseline gap-2">
          <span
            className="font-display tabular-nums leading-none"
            style={{
              fontFamily: "'Bebas Neue', sans-serif",
              fontSize: 'clamp(2rem, 4vw, 2.75rem)',
              letterSpacing: '-0.01em',
              color: 'var(--text-primary)',
            }}
          >
            {list.length}
          </span>
          <span className="label-xs text-txt-tertiary" style={{ letterSpacing: '2px' }}>
            {list.length === 1 ? 'CARD' : 'CARDS'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {onSave && (
            <SaveButton
              onSave={onSave}
              saving={saving}
              dirty={dirty}
              accent={accent}
            />
          )}
          <AddButton onClick={addCard} accent={accent} />
        </div>
      </header>

      {list.length === 0 ? (
        <EmptyState accent={accent} onAdd={addCard} />
      ) : (
        <ol className="space-y-6">
          {list.map((card, idx) => {
            // Branch: prompt-driven (new) cards use the wizard row; legacy
            // PNG-template cards keep rendering through CardRow so old
            // saves don't disappear.
            if (card?.styleId !== undefined && card?.templateId === undefined) {
              return (
                <CardRowNew
                  key={card.id || idx}
                  idx={idx}
                  card={card}
                  player={player}
                  dynasty={dynasty}
                  teamColors={teamColors}
                  accent={accent}
                  onChange={(partial) => updateAt(idx, partial)}
                  onDelete={() => removeAt(idx)}
                />
              )
            }
            return (
              <CardRow
                key={card.id || idx}
                idx={idx}
                card={card}
                templates={templates}
                playerGames={playerGames}
                player={player}
                dynasty={dynasty}
                teamColors={teamColors}
                accent={accent}
                onChange={(partial) => updateAt(idx, partial)}
                onDelete={() => removeAt(idx)}
              />
            )
          })}
        </ol>
      )}

      {/* Sticky save bar — appears only when there are unsaved
          changes, so it doesn't bug users with nothing to save. */}
      {onSave && dirty && (
        <StickySaveBar onSave={onSave} saving={saving} accent={accent} count={list.length} />
      )}

      <style>{`
        .card-row {
          transition: transform 200ms ease, box-shadow 200ms ease;
        }
        .card-row:hover { transform: translateY(-1px); }
        .card-row .card-accent { transition: width 200ms ease; }
        .card-row:hover .card-accent { width: 5px; }
        .pcle-input {
          transition: border-color 150ms ease, background-color 150ms ease, box-shadow 150ms ease;
        }
        .pcle-input:focus {
          outline: none;
          border-color: var(--pcle-accent, #6b7280);
          box-shadow: 0 0 0 3px var(--pcle-accent-soft, rgba(107,114,128,.2));
        }
        .pcle-add-btn:active { transform: translateY(1px) scale(.99); }
        .pcle-save-btn:active { transform: translateY(1px) scale(.99); }
        .pcle-delete-btn { color: var(--text-tertiary); transition: color 150ms ease; }
        .pcle-delete-btn:hover { color: #f87171; }
        .pcle-range {
          -webkit-appearance: none;
          appearance: none;
          height: 4px;
          border-radius: 999px;
          background: var(--surface-4);
        }
        .pcle-range::-webkit-slider-thumb {
          -webkit-appearance: none;
          height: 16px;
          width: 16px;
          border-radius: 50%;
          background: var(--pcle-accent, #6b7280);
          border: 2px solid #fff;
          box-shadow: 0 1px 2px rgba(0,0,0,.4);
          cursor: pointer;
        }
        .pcle-range::-moz-range-thumb {
          height: 16px; width: 16px; border-radius: 50%;
          background: var(--pcle-accent, #6b7280);
          border: 2px solid #fff; box-shadow: 0 1px 2px rgba(0,0,0,.4);
          cursor: pointer;
        }
      `}</style>
    </section>
  )
}

/* ─────────────────────────────────────────────────────────────── */

function SaveButton({ onSave, saving, dirty, accent }) {
  // Color states: idle gray, dirty primary, saving disabled.
  const cls = 'pcle-save-btn inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold transition-all disabled:opacity-50'
  const style = dirty
    ? { backgroundColor: accent, color: '#fff', boxShadow: `0 6px 18px -8px ${accent}66` }
    : { backgroundColor: 'var(--surface-3)', color: 'var(--text-tertiary)' }
  return (
    <button
      type="button"
      onClick={onSave}
      disabled={saving || !dirty}
      className={cls}
      style={style}
      title={dirty ? 'Save changes' : 'No changes'}
    >
      {saving ? (
        <SpinnerIcon />
      ) : dirty ? (
        <CheckIcon />
      ) : (
        <CheckIcon muted />
      )}
      <span>{saving ? 'Saving…' : dirty ? 'Save changes' : 'Saved'}</span>
    </button>
  )
}

function AddButton({ onClick, accent }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="pcle-add-btn inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold transition-all hover:opacity-90"
      style={{
        backgroundColor: 'var(--surface-3)',
        color: 'var(--text-primary)',
        border: `1px solid ${accent}55`,
      }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 5v14M5 12h14" />
      </svg>
      <span>Add card</span>
    </button>
  )
}

function StickySaveBar({ onSave, saving, accent, count }) {
  return (
    <div
      className="sticky bottom-4 z-20 mt-6 mx-auto max-w-md rounded-xl shadow-lg flex items-center justify-between gap-3 px-4 py-3"
      style={{
        backgroundColor: 'var(--surface-2)',
        border: `1px solid ${accent}55`,
        boxShadow: `0 16px 32px -16px ${accent}66`,
      }}
    >
      <div className="min-w-0">
        <div className="text-sm font-semibold text-txt-primary">Unsaved changes</div>
        <div className="text-xs text-txt-tertiary truncate">
          {count} {count === 1 ? 'card' : 'cards'} — click save to persist
        </div>
      </div>
      <button
        type="button"
        onClick={onSave}
        disabled={saving}
        className="pcle-save-btn inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold transition-all disabled:opacity-50 hover:opacity-90"
        style={{ backgroundColor: accent, color: '#fff' }}
      >
        {saving ? <SpinnerIcon /> : <CheckIcon />}
        <span>{saving ? 'Saving…' : 'Save'}</span>
      </button>
    </div>
  )
}

function EmptyState({ accent, onAdd }) {
  return (
    <div
      className="relative overflow-hidden rounded-2xl py-12 px-6 sm:py-16 sm:px-10"
      style={{
        backgroundColor: 'var(--surface-2)',
        border: '1px dashed var(--rule-soft, var(--surface-4))',
      }}
    >
      {/* Three offset card silhouettes — communicate "collection". */}
      <div aria-hidden="true" className="absolute inset-0 pointer-events-none flex items-center justify-center">
        <div
          className="hidden sm:block w-32 h-44 rounded-xl opacity-[0.08]"
          style={{
            transform: 'translateX(-90px) rotate(-7deg)',
            backgroundColor: accent,
            boxShadow: `0 24px 48px -16px ${accent}`,
          }}
        />
        <div
          className="hidden sm:block w-32 h-44 rounded-xl opacity-[0.12]"
          style={{
            transform: 'translateX(0) rotate(0deg)',
            backgroundColor: accent,
            boxShadow: `0 24px 48px -16px ${accent}`,
          }}
        />
        <div
          className="hidden sm:block w-32 h-44 rounded-xl opacity-[0.08]"
          style={{
            transform: 'translateX(90px) rotate(7deg)',
            backgroundColor: accent,
            boxShadow: `0 24px 48px -16px ${accent}`,
          }}
        />
      </div>

      <div className="relative text-center max-w-md mx-auto">
        <div className="label-xs text-txt-tertiary mb-3" style={{ letterSpacing: '2.5px' }}>
          NO CARDS YET
        </div>
        <h4
          className="font-display leading-tight mb-2"
          style={{
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: 'clamp(1.6rem, 3vw, 2.25rem)',
            letterSpacing: '-0.01em',
            color: 'var(--text-primary)',
            textWrap: 'balance',
          }}
        >
          Build your first card
        </h4>
        <p className="text-sm text-txt-tertiary mb-6">
          Pick a template, drop in a CFB 26 screenshot, and the player's name, jersey, position, and team logo auto-fit into each zone.
        </p>
        <AddButton onClick={onAdd} accent={accent} />
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────── */

function CardRow({
  idx, card, templates, playerGames, player, dynasty, teamColors, accent,
  onChange, onDelete,
}) {
  const accentSoft = `${accent}33`
  const inlineVars = {
    '--pcle-accent': accent,
    '--pcle-accent-soft': accentSoft,
  }
  const hasPhoto = !!card.photoUrl
  const transform = card.photoTransform || DEFAULT_TRANSFORM

  // Visual layout-editor modal — keyed off the active card's template id.
  const [layoutEditorOpen, setLayoutEditorOpen] = useState(false)

  const setTransform = (next) => onChange({ photoTransform: next })
  const resetTransform = () => onChange({ photoTransform: { ...DEFAULT_TRANSFORM } })
  const setScale = (s) =>
    setTransform({ ...transform, scale: Number(s) })

  // Section index — used in the row badge.
  return (
    <li
      className="card-row relative rounded-2xl overflow-hidden"
      style={{
        backgroundColor: 'var(--surface-2)',
        border: '1px solid var(--rule-soft, var(--surface-4))',
        boxShadow: hasPhoto
          ? `0 1px 0 var(--rule-soft, var(--surface-4)), 0 18px 40px -28px ${accent}55`
          : `0 1px 0 var(--rule-soft, var(--surface-4))`,
        ...inlineVars,
      }}
    >
      <span
        aria-hidden="true"
        className="card-accent absolute left-0 top-0 bottom-0 w-[3px]"
        style={{ backgroundColor: accent }}
      />

      <header className="flex items-center justify-between gap-3 px-5 py-3 border-b border-surface-4">
        <div className="flex items-center gap-3 min-w-0">
          <span
            className="inline-flex items-center justify-center px-2.5 py-1 rounded-md font-display tabular-nums leading-none"
            style={{
              fontFamily: "'Bebas Neue', sans-serif",
              fontSize: '0.95rem',
              letterSpacing: '1px',
              color: accent,
              backgroundColor: `${accent}1A`,
              border: `1px solid ${accent}33`,
            }}
          >
            #{idx + 1}
          </span>
          {card.year && (
            <span className="text-sm font-semibold text-txt-secondary tabular-nums">
              {card.year}
            </span>
          )}
          {card.label && (
            <>
              <span className="text-txt-muted">·</span>
              <span className="text-sm text-txt-secondary truncate">{card.label}</span>
            </>
          )}
        </div>
        <button
          type="button"
          onClick={onDelete}
          className="pcle-delete-btn text-xs font-semibold uppercase"
          style={{ letterSpacing: '1.5px' }}
          aria-label={`Delete card ${idx + 1}`}
        >
          Delete
        </button>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-[340px_minmax(0,1fr)] gap-6 lg:gap-8 p-5">
        {/* Preview + image controls */}
        <div className="flex flex-col items-center md:items-start">
          <div
            className="w-full max-w-[340px] rounded-xl overflow-hidden"
            style={{
              boxShadow: hasPhoto
                ? `0 30px 60px -28px rgba(0,0,0,.6), 0 8px 22px -10px ${accent}66`
                : '0 18px 40px -28px rgba(0,0,0,.5)',
            }}
          >
            <CardComposer
              card={card}
              player={player}
              dynasty={dynasty}
              width="100%"
              editable={hasPhoto}
              onPhotoTransformChange={setTransform}
            />
          </div>

          {/* Photo positioning controls — only shown when there's a
              photo to position. Clear hint about drag, slider for
              zoom, and a small Reset. */}
          {hasPhoto ? (
            <div className="w-full max-w-[340px] mt-4 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] uppercase font-semibold text-txt-tertiary" style={{ letterSpacing: '1.2px' }}>
                  Adjust photo
                </span>
                <button
                  type="button"
                  onClick={resetTransform}
                  className="text-[11px] font-semibold text-txt-tertiary hover:text-txt-secondary uppercase transition-colors"
                  style={{ letterSpacing: '1px' }}
                >
                  Reset
                </button>
              </div>
              <div className="flex items-center gap-3">
                <ZoomOutIcon />
                <input
                  type="range"
                  min="0.5"
                  max="3"
                  step="0.05"
                  value={transform.scale}
                  onChange={(e) => setScale(e.target.value)}
                  className="pcle-range flex-1"
                  aria-label="Zoom"
                />
                <ZoomInIcon />
                <span className="text-xs text-txt-tertiary tabular-nums w-10 text-right">
                  {Math.round((Number(transform.scale) || 1) * 100)}%
                </span>
              </div>
              <p className="text-[11px] text-txt-tertiary">
                Drag the photo in the preview to reposition it.
              </p>
            </div>
          ) : (
            <p className="mt-3 text-[11px] text-txt-tertiary text-center md:text-left">
              Add a photo on the right to see it composed.
            </p>
          )}
        </div>

        {/* Inputs column */}
        <div className="space-y-5 min-w-0">
          <Field label="Template">
            <div className="flex items-center gap-2">
              <select
                value={card.templateId || DEFAULT_TEMPLATE_ID}
                onChange={(e) => onChange({ templateId: e.target.value })}
                className="pcle-input flex-1 px-3 py-2.5 rounded-lg bg-surface-3 border border-surface-4 text-txt-primary text-sm"
              >
                {templates.map(t => (
                  <option key={t.id} value={t.id}>{t.label}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setLayoutEditorOpen(true)}
                className="px-3 py-2.5 rounded-lg bg-surface-3 border border-surface-4 text-txt-secondary hover:text-txt-primary hover:bg-surface-4 transition-colors text-xs font-semibold whitespace-nowrap"
                title="Visually drag zones into place"
              >
                Edit layout
              </button>
            </div>
          </Field>

          <Field label="Player photo" hint="A CFB 26 screenshot, dropped, pasted, or any image URL.">
            <ImageUpload
              value={card.photoUrl || ''}
              onChange={(url) => onChange({ photoUrl: url })}
              teamColors={teamColors}
              placeholder="Paste, drop, or URL"
            />
          </Field>

          <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-3">
            <Field label="Year">
              <input
                type="number"
                value={card.year ?? ''}
                onChange={(e) => onChange({ year: e.target.value === '' ? null : Number(e.target.value) })}
                placeholder="2034"
                className="pcle-input w-full px-3 py-2.5 rounded-lg bg-surface-3 border border-surface-4 text-txt-primary text-sm tabular-nums"
              />
            </Field>
            <Field label="Label">
              <input
                type="text"
                value={card.label || ''}
                onChange={(e) => onChange({ label: e.target.value })}
                placeholder="Heisman Edition · Bowl Game · Rookie"
                className="pcle-input w-full px-3 py-2.5 rounded-lg bg-surface-3 border border-surface-4 text-txt-primary text-sm"
              />
            </Field>
          </div>

          <Field label="Tag to a game">
            <select
              value={card.gameId || ''}
              onChange={(e) => onChange({ gameId: e.target.value })}
              className="pcle-input w-full px-3 py-2.5 rounded-lg bg-surface-3 border border-surface-4 text-txt-primary text-sm"
            >
              <option value="">— No game tagged —</option>
              {playerGames.map(g => {
                const loc = g.location === 'home' ? 'vs' : g.location === 'away' ? '@' : 'vs (neutral)'
                const result = `${g.won ? 'W' : 'L'} ${g.playerScore}–${g.oppScore}`
                return (
                  <option key={g.gameId} value={g.gameId}>
                    {g.year} · Wk {g.week ?? '?'} · {loc} {g.opponentAbbr || g.opponentName} · {result}
                  </option>
                )
              })}
            </select>
          </Field>
        </div>
      </div>

      {/* Visual zone editor modal. Mounts unconditionally so it can manage
          its own open/close state via `isOpen`; the portal renders to
          document.body so it isn't clipped by this row's overflow rules. */}
      <CardZoneEditor
        templateId={card.templateId || DEFAULT_TEMPLATE_ID}
        isOpen={layoutEditorOpen}
        onClose={() => setLayoutEditorOpen(false)}
      />
    </li>
  )
}

/**
 * Row component for prompt-driven (new) cards — the wizard runs inline
 * inside an expandable panel. Top strip shows the front-image preview +
 * style label so the list stays scannable when there are several cards.
 */
function CardRowNew({ idx, card, player, dynasty, teamColors, accent, onChange, onDelete }) {
  const [expanded, setExpanded] = useState(true)
  const accentSoft = `${accent}33`
  const inlineVars = { '--pcle-accent': accent, '--pcle-accent-soft': accentSoft }
  const style = getCardStyle(card.styleId)
  const styleLabel = style?.label || 'Pick a style'
  const subtitle = [styleLabel, card.year ? String(card.year) : null, card.label || null]
    .filter(Boolean)
    .join(' · ')

  return (
    <li
      className="card-row relative rounded-2xl overflow-hidden"
      style={{
        backgroundColor: 'var(--surface-2)',
        border: '1px solid var(--rule-soft, var(--surface-4))',
        boxShadow: card.frontImageUrl
          ? `0 1px 0 var(--rule-soft, var(--surface-4)), 0 18px 40px -28px ${accent}55`
          : `0 1px 0 var(--rule-soft, var(--surface-4))`,
        ...inlineVars,
      }}
    >
      <span
        aria-hidden="true"
        className="card-accent absolute left-0 top-0 bottom-0 w-[3px]"
        style={{ backgroundColor: accent }}
      />

      {/* Header strip — preview + meta + collapse/delete controls */}
      <header className="flex items-center gap-3 px-4 py-3 border-b" style={{ borderColor: 'var(--surface-4)' }}>
        <span
          className="inline-flex items-center justify-center px-2.5 py-1 rounded-md font-display tabular-nums leading-none flex-shrink-0"
          style={{
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: 14,
            backgroundColor: accent,
            color: '#fff',
          }}
        >
          {idx + 1}
        </span>
        <div className="w-10 aspect-[5/7] rounded overflow-hidden flex-shrink-0" style={{ backgroundColor: 'var(--surface-1)' }}>
          {card.frontImageUrl ? (
            <img src={card.frontImageUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-txt-primary truncate">{styleLabel}</div>
          <div className="text-[11px] text-txt-tertiary truncate">{subtitle || '—'}</div>
        </div>
        <button
          type="button"
          onClick={() => setExpanded(e => !e)}
          className="px-2.5 py-1.5 rounded-md text-xs font-medium bg-surface-3 border border-surface-4 text-txt-secondary hover:text-txt-primary transition-colors"
        >
          {expanded ? 'Collapse' : 'Edit'}
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="pcle-delete-btn p-2 rounded-md hover:bg-surface-4 transition-colors"
          title="Delete card"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M5 7h14M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3" />
          </svg>
        </button>
      </header>

      {expanded && (
        <div className="p-4">
          <CardStyleWizard
            card={card}
            onChange={(updated) => onChange(updated)}
            player={player}
            dynasty={dynasty}
            teamColors={teamColors}
          />
        </div>
      )}
    </li>
  )
}

function Field({ label, hint, children }) {
  return (
    <div>
      <label className="block text-[11px] font-semibold text-txt-tertiary mb-1.5 uppercase" style={{ letterSpacing: '1.2px' }}>
        {label}
      </label>
      {children}
      {hint && (
        <p className="text-[11px] text-txt-tertiary mt-1.5">{hint}</p>
      )}
    </div>
  )
}

/* tiny inline icons — keeps the editor self-contained */

function CheckIcon({ muted }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={muted ? { opacity: 0.6 } : undefined}>
      <path d="M5 13l4 4L19 7" />
    </svg>
  )
}
function SpinnerIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden="true" style={{ animation: 'spin 1s linear infinite' }}>
      <path d="M12 3a9 9 0 1 1-6.36 2.64" />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </svg>
  )
}
function ZoomInIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ color: 'var(--text-tertiary)' }}>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3M11 8v6M8 11h6" />
    </svg>
  )
}
function ZoomOutIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ color: 'var(--text-tertiary)' }}>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3M8 11h6" />
    </svg>
  )
}
