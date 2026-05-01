// Editor for a player's cards[] array. Lives inside the PlayerEdit
// Card tab. Each card is its own panel with front + back uploads, an
// optional game tag, an optional year + label, and a delete button.
// Pure controlled component — receives `cards` and `onChange(newCards)`.

import { useMemo } from 'react'
import ImageUpload from './ImageUpload'
import { newCardId } from '../utils/playerCards'
import { getCardGameOptions } from '../utils/buildCardPrompt'

export default function PlayerCardListEditor({ cards, onChange, player, dynasty, teamColors }) {
  const list = Array.isArray(cards) ? cards : []

  // Game options (across all of the player's seasons) for the
  // per-card game tag dropdown. We compute once and reuse so each
  // card's dropdown is identical.
  const tagGameOptions = useMemo(() => {
    if (!player || !dynasty) return []
    const out = []
    if (player.statsByYear) {
      for (const yr of Object.keys(player.statsByYear).sort((a, b) => Number(b) - Number(a))) {
        const games = getCardGameOptions(player, dynasty, Number(yr))
        for (const g of games) out.push({ ...g, year: Number(yr) })
      }
    }
    return out
  }, [player, dynasty])

  const updateAt = (idx, partial) => {
    const next = list.map((c, i) => i === idx ? { ...c, ...partial } : c)
    onChange(next)
  }
  const removeAt = (idx) => {
    if (!confirm('Delete this card? This cannot be undone.')) return
    const next = list.filter((_, i) => i !== idx)
    onChange(next)
  }
  const addCard = () => {
    onChange([
      ...list,
      {
        id: newCardId(),
        front: '',
        back: '',
        year: null,
        label: '',
        gameId: '',
        brandLabel: '',
        styleLabel: '',
        createdAt: new Date().toISOString(),
      }
    ])
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="label-xs text-txt-tertiary mb-1" style={{ letterSpacing: '1.5px' }}>
            {list.length} {list.length === 1 ? 'card' : 'cards'}
          </div>
          <h3 className="text-base font-bold text-txt-primary">Card collection</h3>
        </div>
        <button
          type="button"
          onClick={addCard}
          className="px-3 py-1.5 rounded-md text-sm font-semibold transition-colors hover:opacity-90"
          style={{ backgroundColor: teamColors?.primary || 'var(--surface-3)', color: '#fff' }}
        >
          + Add Card
        </button>
      </div>

      {list.length === 0 ? (
        <div className="text-center py-10 px-4 rounded-xl border border-dashed border-surface-4">
          <p className="text-sm text-txt-tertiary">
            No cards yet. Click <span className="font-semibold text-txt-secondary">+ Add Card</span> to upload one.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {list.map((card, idx) => (
            <div
              key={card.id || idx}
              className="rounded-xl border border-surface-4 bg-surface-2 overflow-hidden"
            >
              <div className="px-4 py-2.5 flex items-center justify-between bg-surface-3 border-b border-surface-4">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="label-xs text-txt-tertiary tabular" style={{ letterSpacing: '1.5px' }}>
                    Card {idx + 1}
                  </span>
                  {card.year && (
                    <span className="text-xs font-semibold text-txt-secondary tabular">{card.year}</span>
                  )}
                  {card.label && (
                    <span className="text-xs text-txt-secondary truncate">· {card.label}</span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => removeAt(idx)}
                  className="text-xs font-semibold text-red-400 hover:text-red-300 transition-colors"
                  title="Delete this card"
                >
                  Delete
                </button>
              </div>

              <div className="p-4 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block label-xs text-txt-tertiary mb-1.5" style={{ letterSpacing: '1.5px' }}>
                      Front
                    </label>
                    <ImageUpload
                      value={card.front || ''}
                      onChange={(url) => updateAt(idx, { front: url })}
                      teamColors={teamColors}
                      placeholder="Paste, drop, or URL"
                    />
                  </div>
                  <div>
                    <label className="block label-xs text-txt-tertiary mb-1.5" style={{ letterSpacing: '1.5px' }}>
                      Back
                    </label>
                    <ImageUpload
                      value={card.back || ''}
                      onChange={(url) => updateAt(idx, { back: url })}
                      teamColors={teamColors}
                      placeholder="Paste, drop, or URL"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block label-xs text-txt-tertiary mb-1.5" style={{ letterSpacing: '1.5px' }}>
                      Year (optional)
                    </label>
                    <input
                      type="number"
                      value={card.year ?? ''}
                      onChange={(e) => updateAt(idx, { year: e.target.value === '' ? null : Number(e.target.value) })}
                      placeholder="2034"
                      className="w-full px-3 py-2 rounded-md bg-surface-3 border border-surface-4 text-txt-primary text-sm"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block label-xs text-txt-tertiary mb-1.5" style={{ letterSpacing: '1.5px' }}>
                      Label (optional)
                    </label>
                    <input
                      type="text"
                      value={card.label || ''}
                      onChange={(e) => updateAt(idx, { label: e.target.value })}
                      placeholder="e.g. Heisman Edition · Rookie · Bowl Game"
                      className="w-full px-3 py-2 rounded-md bg-surface-3 border border-surface-4 text-txt-primary text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="block label-xs text-txt-tertiary mb-1.5" style={{ letterSpacing: '1.5px' }}>
                    Tag to a game (optional)
                  </label>
                  <select
                    value={card.gameId || ''}
                    onChange={(e) => updateAt(idx, { gameId: e.target.value })}
                    className="w-full px-3 py-2 rounded-md bg-surface-3 border border-surface-4 text-txt-primary text-sm"
                  >
                    <option value="">— No game tagged —</option>
                    {tagGameOptions.map(g => {
                      const loc = g.location === 'home' ? 'vs' : g.location === 'away' ? '@' : 'vs (neutral)'
                      const result = `${g.won ? 'W' : 'L'} ${g.playerScore}–${g.oppScore}`
                      return (
                        <option key={g.gameId} value={g.gameId}>
                          {g.year} · Wk {g.week ?? '?'} · {loc} {g.opponentAbbr || g.opponentName} · {result}
                        </option>
                      )
                    })}
                  </select>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
