/**
 * CardCollection — dynasty-wide grid of every card the user has made.
 * Lives at `/dynasty/:id/cards`. Reachable from the sidebar (only shown
 * when the dynasty actually has at least one card).
 *
 * Same render path as the Game page's Cards tab:
 *   • Legacy template-based cards → composited via CardComposer.
 *   • Prompt-driven cards         → static <img> of the saved
 *                                    frontImageUrl.
 */

import { useMemo, useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { createPortal } from 'react-dom'
import { useDynasty } from '../../context/DynastyContext'
import { usePathPrefix } from '../../hooks/usePathPrefix'
import { getAllDynastyCards } from '../../utils/playerCards'
import CardComposer from '../../components/CardComposer'
import FlippableCard from '../../components/FlippableCard'
import { PageHero, EmptyState } from '../../components/ui'

export default function CardCollection() {
  const { currentDynasty, isViewOnly } = useDynasty()
  const pathPrefix = usePathPrefix()
  const navigate = useNavigate()

  const allCards = useMemo(() => getAllDynastyCards(currentDynasty), [currentDynasty])
  const [showPlayerPicker, setShowPlayerPicker] = useState(false)

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <PageHero
        title="Card Collection"
        subtitle={
          allCards.length === 0
            ? 'No cards have been made yet for this dynasty.'
            : `${allCards.length} card${allCards.length === 1 ? '' : 's'} across the dynasty. Newest first.`
        }
        actions={
          !isViewOnly && (
            <button
              type="button"
              onClick={() => setShowPlayerPicker(true)}
              className="btn-refined btn-refined--solid"
            >
              + Add new card
            </button>
          )
        }
      />

      {showPlayerPicker && (
        <PlayerPickerModal
          dynasty={currentDynasty}
          onClose={() => setShowPlayerPicker(false)}
          onPick={(player) => {
            setShowPlayerPicker(false)
            navigate(`${pathPrefix}/player/${player.pid}/edit?tab=card&newCard=1`)
          }}
        />
      )}

      {allCards.length === 0 ? (
        <EmptyState
          title="No cards yet"
          message={
            <>
              {isViewOnly
                ? 'Cards will show up here once any are added to this dynasty.'
                : 'Click "Add new card" above to walk through the card creator. You\'ll search for a player, pick a card style, choose what the card commemorates, and upload the AI-generated images.'}
            </>
          }
        />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-5 sm:gap-6">
          {allCards.map(({ player, card }) => {
            const isLegacy = card.styleId === undefined && card.templateId !== undefined
            // Outer wrapper is a plain div (not a Link) so clicking
            // the card flips it via FlippableCard. The player name
            // beneath is its own Link — that's the navigation target.
            return (
              <div
                key={`${player.pid}-${card.id}`}
                className="flex flex-col items-center"
              >
                <div className="w-full">
                  {isLegacy ? (
                    <CardComposer
                      card={card}
                      player={player}
                      dynasty={currentDynasty}
                      width="100%"
                      className="rounded-xl shadow-2xl overflow-hidden"
                    />
                  ) : (
                    <FlippableCard
                      frontImageUrl={card.frontImageUrl}
                      backImageUrl={card.backImageUrl}
                    />
                  )}
                </div>
                <Link
                  to={`${pathPrefix}/player/${player.pid}?tab=card`}
                  className="mt-2 px-1 text-center w-full group block"
                >
                  <div className="text-xs font-bold text-txt-primary truncate group-hover:underline">
                    {player.name}
                  </div>
                  <div className="text-[10px] text-txt-tertiary truncate tabular-nums">
                    {card.year ? <span>{card.year}</span> : null}
                    {card.year && card.label ? <span className="mx-1">·</span> : null}
                    {card.label}
                    {!card.year && !card.label && (player.position || '—')}
                  </div>
                </Link>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/**
 * PlayerPickerModal — first phase of the "Add new card" flow on the
 * collection page. Search the dynasty's players by name (or jersey
 * number) and pick the one this card is for. Selecting a player
 * navigates to that player's edit page with `?tab=card&newCard=1`,
 * which auto-opens the card editor wizard.
 */
function PlayerPickerModal({ dynasty, onPick, onClose }) {
  const [query, setQuery] = useState('')

  // Esc-to-close (body scroll lock handled globally by Layout)
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose?.() }
    document.addEventListener('keydown', handler)
    return () => {
      document.removeEventListener('keydown', handler)
    }
  }, [onClose])

  const players = useMemo(() => {
    const all = dynasty?.players || []
    const q = query.trim().toLowerCase()
    const teams = dynasty?.teams || {}
    const currentYear = Number(dynasty?.currentYear)

    // Score: name match > jersey match > school match. Active players
    // (on a current-year roster) get a small boost so they sort first.
    const scored = []
    for (const p of all) {
      if (!p?.name) continue
      const name = String(p.name).toLowerCase()
      const jersey = String(p.jerseyNumber || p.jersey || '')
      const teamTid = p.teamsByYear?.[currentYear] ?? p.teamHistory?.find(s => {
        const from = Number(s?.fromYear)
        const to = s?.toYear == null ? Infinity : Number(s.toYear)
        return Number.isFinite(currentYear) && currentYear >= from && currentYear <= to
      })?.teamTid
      const teamName = teamTid != null ? (teams[teamTid]?.name || '') : ''
      const isActive = teamTid != null

      let score = 0
      if (!q) {
        score = isActive ? 1 : 0
      } else {
        if (name.startsWith(q)) score += 100
        else if (name.includes(q)) score += 50
        if (jersey === q) score += 80
        else if (jersey && jersey.startsWith(q)) score += 30
        if (teamName.toLowerCase().includes(q)) score += 10
      }
      if (score > 0 || !q) {
        scored.push({ player: p, score: score + (isActive ? 0.5 : 0), teamName })
      }
    }
    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      return (a.player.name || '').localeCompare(b.player.name || '')
    })
    return scored.slice(0, 50)
  }, [dynasty, query])

  if (typeof document === 'undefined') return null

  return createPortal(
    <div
      className="fixed inset-0 top-0 left-0 right-0 bottom-0 z-[9999] flex items-stretch justify-center"
      style={{ margin: 0, backgroundColor: 'rgba(0,0,0,0.78)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl max-h-screen flex flex-col my-4 mx-4 rounded-xl overflow-hidden"
        style={{ backgroundColor: 'var(--surface-1)', border: '1px solid var(--surface-4)', boxShadow: '0 28px 80px rgba(0,0,0,0.7)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <header
          className="flex items-center justify-between gap-3 px-5 py-3 flex-shrink-0"
          style={{ backgroundColor: 'var(--surface-2)', borderBottom: '1px solid var(--surface-4)' }}
        >
          <div>
            <div className="label-xs text-txt-tertiary" style={{ letterSpacing: '2px', fontSize: '10px' }}>
              ADD NEW CARD · 1 OF 4
            </div>
            <h2 className="text-base font-bold text-txt-primary leading-tight">
              Pick the player
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-md hover:bg-surface-4 text-txt-secondary hover:text-txt-primary transition-colors"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </header>

        <div className="p-5 flex-shrink-0">
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, jersey number, or school…"
            className="w-full px-4 py-2.5 rounded-md bg-surface-3 border border-surface-4 text-txt-primary text-sm focus:border-surface-5 focus:outline-none"
          />
        </div>

        <div className="flex-1 overflow-y-auto px-2 pb-4">
          {players.length === 0 ? (
            <div className="text-center py-12 text-sm text-txt-tertiary">
              No players match.
            </div>
          ) : (
            <ul className="divide-y divide-surface-4">
              {players.map(({ player: p, teamName }) => (
                <li key={p.pid}>
                  <button
                    type="button"
                    onClick={() => onPick(p)}
                    className="w-full flex items-center justify-between gap-3 px-3 py-2.5 hover:bg-surface-3 transition-colors text-left"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-txt-primary truncate">{p.name}</div>
                      <div className="text-[11px] text-txt-tertiary truncate">
                        {p.position ? <span>{p.position}</span> : null}
                        {p.position && (p.jerseyNumber || p.jersey) ? <span className="mx-1">·</span> : null}
                        {(p.jerseyNumber || p.jersey) ? <span>#{p.jerseyNumber || p.jersey}</span> : null}
                        {teamName ? <span className="ml-1">· {teamName}</span> : null}
                      </div>
                    </div>
                    <span className="text-[11px] font-semibold text-txt-primary flex-shrink-0">
                      Pick →
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
