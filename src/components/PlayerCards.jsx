/**
 * PlayerCards — the body of the Player Editor's "Card" tab.
 *
 * Pattern: collection-grid + focused-editor. The default view is a grid of
 * saved cards (front-image thumbnails). Click + Add Card or click any
 * existing card to open `CardEditorModal`, which handles all the wizard
 * mechanics in a contained, focused space. The collection view itself
 * never shows editor controls.
 *
 * Replaces the older inline-wizard + collapsible-row pattern, which mixed
 * the editor and the collection in one scroll and got crowded fast as the
 * card count grew.
 *
 * Props:
 *   cards       — array of card records (legacy templateId or new styleId)
 *   onChange    — fn(nextCards) — receives full new array
 *   player, dynasty, teamColors — passed through to the editor modal
 *   onSave, saving, dirty — outer save flow controls (sticky save bar)
 */

import { useState, useMemo } from 'react'
import CardEditorModal from './CardEditorModal'
import { newCardId } from '../utils/playerCards'
import { CARD_STYLES, getCardStyle } from '../data/cardStyles'

export default function PlayerCards({
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
  const accent = teamColors?.primary || '#6b7280'

  // editingIdx: null = browsing the collection, -1 = adding a brand-new
  // card (no row exists yet), >=0 = editing an existing card by its index
  // in the cards array.
  const [editingIdx, setEditingIdx] = useState(null)

  const editingCard = useMemo(() => {
    if (editingIdx === -1) {
      return {
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
    }
    if (editingIdx != null && list[editingIdx]) return list[editingIdx]
    return null
  }, [editingIdx, list, dynasty?.currentYear])

  const handleSaveCard = (card) => {
    if (editingIdx === -1) {
      onChange([...list, card])
    } else {
      onChange(list.map((c, i) => i === editingIdx ? card : c))
    }
    setEditingIdx(null)
  }

  const handleDelete = (idx) => {
    if (!confirm('Delete this card? This cannot be undone.')) return
    onChange(list.filter((_, i) => i !== idx))
  }

  return (
    <section className="space-y-5">
      {/* Header — count + add button, no editor controls visible */}
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
            <SaveButton onSave={onSave} saving={saving} dirty={dirty} accent={accent} />
          )}
          <AddCardButton accent={accent} onClick={() => setEditingIdx(-1)} />
        </div>
      </header>

      {/* Collection — empty state OR grid of cards */}
      {list.length === 0 ? (
        <EmptyState accent={accent} onAdd={() => setEditingIdx(-1)} />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {list.map((card, idx) => (
            <CardThumbnail
              key={card.id || idx}
              card={card}
              idx={idx}
              onEdit={() => setEditingIdx(idx)}
              onDelete={() => handleDelete(idx)}
            />
          ))}
        </div>
      )}

      {editingCard && (
        <CardEditorModal
          card={editingCard}
          isNew={editingIdx === -1}
          player={player}
          dynasty={dynasty}
          teamColors={teamColors}
          onSave={handleSaveCard}
          onCancel={() => setEditingIdx(null)}
        />
      )}
    </section>
  )
}

/* ---------- Sub-components ---------- */

/**
 * CardThumbnail — single saved card in the collection grid. Shows the
 * front image (or a placeholder for unfinished/legacy cards) plus a
 * compact label strip beneath. Click anywhere to edit; the trash icon
 * deletes after confirmation.
 */
function CardThumbnail({ card, idx, onEdit, onDelete }) {
  const isLegacy = card.styleId === undefined && card.templateId !== undefined
  const style = !isLegacy ? getCardStyle(card.styleId) : null
  const label = card.label || (style?.label) || (isLegacy ? 'Legacy card' : 'Untitled card')
  const sub = card.year ? String(card.year) : (isLegacy ? 'PNG template' : '—')

  // Pick the best available preview image. Legacy cards use photoUrl;
  // new cards use frontImageUrl. Either may be missing → show a styled
  // placeholder with the card index.
  const previewUrl = card.frontImageUrl || card.photoUrl || ''

  return (
    <div className="group relative">
      <button
        type="button"
        onClick={onEdit}
        className="w-full block rounded-xl overflow-hidden transition-transform duration-150 group-hover:-translate-y-0.5"
        style={{
          aspectRatio: '5/7',
          backgroundColor: 'var(--surface-2)',
          border: '1px solid var(--surface-4)',
          boxShadow: previewUrl ? '0 8px 24px rgba(0,0,0,0.35)' : 'none',
        }}
      >
        {previewUrl ? (
          <img
            src={previewUrl}
            alt={label}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2 p-4">
            <span
              className="font-display tabular-nums leading-none"
              style={{
                fontFamily: "'Bebas Neue', sans-serif",
                fontSize: '40px',
                color: 'var(--text-tertiary)',
              }}
            >
              #{idx + 1}
            </span>
            <span
              className="label-xs text-txt-tertiary text-center"
              style={{ letterSpacing: '1.5px', fontSize: '10px' }}
            >
              NO IMAGE YET
            </span>
            <span className="text-[10px] text-txt-muted text-center">
              Click to set up
            </span>
          </div>
        )}
      </button>

      {/* Delete corner button — only visible on hover, doesn't compete
          with the card click target. */}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onDelete() }}
        className="absolute top-2 right-2 p-1.5 rounded-md opacity-0 group-hover:opacity-100 transition-opacity"
        style={{
          backgroundColor: 'rgba(15, 23, 42, 0.85)',
          border: '1px solid var(--surface-5)',
          color: '#f87171',
        }}
        title="Delete card"
        aria-label="Delete card"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M5 7h14M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3" />
        </svg>
      </button>

      {/* Label strip — tight, two-line max */}
      <div className="mt-2 px-1 text-center">
        <div className="text-xs font-bold text-txt-primary truncate">{label}</div>
        <div className="text-[10px] text-txt-tertiary truncate tabular-nums">{sub}</div>
      </div>
    </div>
  )
}

/**
 * AddCardButton — the primary CTA in the collection header.
 */
function AddCardButton({ onClick, accent }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-transform active:scale-[0.97]"
      style={{
        backgroundColor: accent,
        color: '#fff',
        boxShadow: `0 6px 18px -8px ${accent}66`,
      }}
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
      </svg>
      Add card
    </button>
  )
}

/**
 * SaveButton — wired to the parent editor's save flow so the user can
 * commit cards changes without scrolling back up to the page header.
 */
function SaveButton({ onSave, saving, dirty, accent }) {
  const cls = 'inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold transition-all disabled:opacity-50'
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
      {saving ? 'Saving…' : dirty ? 'Save' : 'Saved'}
    </button>
  )
}

function EmptyState({ accent, onAdd }) {
  return (
    <div
      className="rounded-xl px-6 py-12 text-center"
      style={{ backgroundColor: 'var(--surface-2)', border: '1px dashed var(--surface-4)' }}
    >
      <div
        className="font-display tabular-nums leading-none mx-auto"
        style={{
          fontFamily: "'Bebas Neue', sans-serif",
          fontSize: 64,
          color: 'var(--text-muted)',
        }}
      >
        0
      </div>
      <div
        className="label-xs text-txt-tertiary mt-2"
        style={{ letterSpacing: '2px' }}
      >
        NO CARDS YET
      </div>
      <p className="mt-3 text-sm text-txt-secondary max-w-md mx-auto leading-relaxed">
        Build a trading-card collection for this player. Pick a real card brand and year, the app fills in your AI-image-gen prompt with the player's data, you generate the front and back, and upload them here.
      </p>
      <button
        type="button"
        onClick={onAdd}
        className="mt-5 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-transform active:scale-[0.97]"
        style={{
          backgroundColor: accent,
          color: '#fff',
          boxShadow: `0 6px 18px -8px ${accent}66`,
        }}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
        </svg>
        Add your first card
      </button>
    </div>
  )
}

function CheckIcon({ muted }) {
  return (
    <svg className="w-4 h-4" fill="none" stroke={muted ? 'currentColor' : 'currentColor'} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
    </svg>
  )
}

function SpinnerIcon() {
  return (
    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
  )
}
