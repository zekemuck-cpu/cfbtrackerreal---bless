import { useEffect, useState, useCallback, useRef, useDeferredValue } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePathPrefix } from '../../hooks/usePathPrefix'
import { useTickerSections } from './useTickerSections'
import { getTeamLogo } from '../../data/teams'
import { teamAbbreviations } from '../../data/teamAbbreviations'

function getLogoUrl(teamIdentifier, teams = null) {
  if (teamIdentifier == null || teamIdentifier === '') return null
  // tid input → direct registry lookup (drift-safe)
  if (teams) {
    if (typeof teamIdentifier === 'number' || (typeof teamIdentifier === 'string' && /^\d+$/.test(teamIdentifier))) {
      const t = teams[teamIdentifier] || teams[Number(teamIdentifier)]
      if (t?.logo) return t.logo
    }
    // abbr or name match
    const customEntry = Object.values(teams).find(t => t.abbr === teamIdentifier || t.name === teamIdentifier)
    if (customEntry?.logo) return customEntry.logo
  }
  const teamData = teamAbbreviations[teamIdentifier]
  if (teamData) {
    if (teamData.logo) return teamData.logo
    return getTeamLogo(teamData.name, teams)
  }
  return getTeamLogo(teamIdentifier, teams)
}

const HOLD_TIME = 4000
const SCROLL_SPEED = 0.06

export default function NewsTicker({ dynasty }) {
  const pathPrefix = usePathPrefix()
  const navigate = useNavigate()
  // Defer the dynasty snapshot the ticker reads so its 200k+ operation
  // section rebuild drops to low render priority. The ticker section
  // computation iterates every player × every year × every stat
  // category — on a mid-size roster it blocks the main thread for
  // 100–500ms. That blocking was the freeze the user saw on every
  // button click / navigation: any state mutation invalidated the
  // ticker memo, the urgent render then waited on the ticker
  // recompute, and the user's input felt like it took a beat to
  // register. With useDeferredValue, urgent renders see the previous
  // (still-valid) ticker output and React schedules the new section
  // compute as low-priority, in idle time.
  const deferredDynasty = useDeferredValue(dynasty)
  const sections = useTickerSections(deferredDynasty)
  const dynastyTeams = dynasty?.teams || null

  const [currentIndex, setCurrentIndex] = useState(0)
  const [isTransitioning, setIsTransitioning] = useState(false)

  const containerRef = useRef(null)
  const contentRef = useRef(null)
  const [overflow, setOverflow] = useState(0)
  const timerRef = useRef(null)
  const animationRef = useRef(null)

  const currentSection = sections[currentIndex] || null

  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.style.transform = 'translateX(0)'
    }

    const measure = () => {
      if (containerRef.current) {
        const over = containerRef.current.scrollWidth - containerRef.current.clientWidth
        setOverflow(Math.max(0, over))
      }
    }

    const timeout = setTimeout(measure, 50)
    return () => clearTimeout(timeout)
  }, [currentIndex, currentSection?.items?.length])

  const advance = useCallback(() => {
    setIsTransitioning(true)
    setTimeout(() => {
      setCurrentIndex(prev => (prev + 1) % sections.length)
      setIsTransitioning(false)
    }, 250)
  }, [sections.length])

  useEffect(() => {
    if (sections.length === 0 || isTransitioning || !currentSection) return

    if (timerRef.current) clearTimeout(timerRef.current)
    if (animationRef.current) cancelAnimationFrame(animationRef.current)

    if (overflow === 0) {
      timerRef.current = setTimeout(advance, HOLD_TIME)
      return () => clearTimeout(timerRef.current)
    }

    let phase = 'hold-start'
    let startTime = null
    let currentScroll = 0

    const animate = (timestamp) => {
      if (!startTime) startTime = timestamp
      const elapsed = timestamp - startTime

      if (phase === 'hold-start') {
        if (elapsed >= HOLD_TIME / 2) {
          phase = 'scrolling'
          startTime = null
        }
      } else if (phase === 'scrolling') {
        const progress = Math.min(1, elapsed * SCROLL_SPEED / overflow)
        currentScroll = progress * overflow
        if (contentRef.current) {
          contentRef.current.style.transform = `translateX(-${currentScroll}px)`
        }
        if (progress >= 1) {
          phase = 'hold-end'
          startTime = null
        }
      } else if (phase === 'hold-end') {
        if (elapsed >= HOLD_TIME / 2) {
          advance()
          return
        }
      }

      animationRef.current = requestAnimationFrame(animate)
    }

    animationRef.current = requestAnimationFrame(animate)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      if (animationRef.current) cancelAnimationFrame(animationRef.current)
    }
  }, [sections.length, isTransitioning, currentSection, overflow, advance])

  const handleItemClick = useCallback((item) => {
    if (item?.link) navigate(`${pathPrefix}${item.link}`)
  }, [navigate, pathPrefix])

  const handleHeaderClick = useCallback((section) => {
    if (section?.headerLink) navigate(`${pathPrefix}${section.headerLink}`)
  }, [navigate, pathPrefix])

  if (!dynasty || sections.length === 0 || !currentSection) {
    return null
  }

  return (
    <>
      <style>{`
        .ticker-container::-webkit-scrollbar { display: none; }
        .ticker-container { -ms-overflow-style: none; scrollbar-width: none; }
        @supports (padding-bottom: env(safe-area-inset-bottom)) {
          .ticker-wrapper { padding-bottom: env(safe-area-inset-bottom); }
        }
        @media (max-width: 639px) {
          .ticker-header { max-width: 104px; min-width: 80px; }
          .ticker-content-area { min-width: 0; flex: 1 1 0%; }
        }
        .ticker-divider {
          width: 1px;
          height: 14px;
          background: var(--surface-4);
          flex-shrink: 0;
        }
        .ticker-logo {
          background: #f1f5f9;
          box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.04);
        }
        .ticker-header-cell:hover { background: var(--surface-2); }
        .ticker-item-link { transition: opacity 180ms ease; }
        .ticker-item-link:hover { opacity: 0.7; }
      `}</style>

      <div
        className="ticker-wrapper fixed bottom-0 left-0 right-0 z-50"
        style={{
          background: 'var(--surface-0)',
          borderTop: '1px solid var(--surface-4)',
          boxShadow: '0 -6px 16px rgba(4, 6, 16, 0.4)',
          height: '40px',
          fontFamily: "var(--font-display, 'Saira Semi Condensed', system-ui, sans-serif)"
        }}
      >
        <div className="flex items-center h-full">
          <div className={`flex items-center h-full overflow-hidden transition-opacity duration-300 w-full ${isTransitioning ? 'opacity-0' : 'opacity-100'}`}>

            {/* Header */}
            <div
              className={`h-full flex items-center gap-2 px-3 sm:px-4 flex-shrink-0 ticker-header ticker-header-cell ${currentSection.headerLink ? 'cursor-pointer' : ''}`}
              style={{ borderRight: '1px solid var(--surface-4)' }}
              onClick={() => handleHeaderClick(currentSection)}
            >
              {currentSection.teamLogo && (
                <div className="w-5 h-5 rounded-full ticker-logo p-0.5 flex-shrink-0">
                  <img
                    src={getLogoUrl(currentSection.teamLogo, dynastyTeams)}
                    alt=""
                    className="w-full h-full object-contain"
                    onError={(e) => { e.target.style.display = 'none' }}
                  />
                </div>
              )}
              {currentSection.opponentLogo ? (
                <>
                  <span
                    className="text-[9px] uppercase text-txt-tertiary"
                    style={{ letterSpacing: '0.14em', fontWeight: 600 }}
                  >
                    vs
                  </span>
                  <div className="w-5 h-5 rounded-full ticker-logo p-0.5 flex-shrink-0">
                    <img
                      src={getLogoUrl(currentSection.opponentLogo, dynastyTeams)}
                      alt=""
                      className="w-full h-full object-contain"
                      onError={(e) => { e.target.style.display = 'none' }}
                    />
                  </div>
                </>
              ) : (
                <span
                  className="text-[10px] sm:text-[11px] truncate uppercase text-txt-secondary"
                  style={{
                    fontWeight: 600,
                    letterSpacing: '0.14em'
                  }}
                >
                  {currentSection.label}
                </span>
              )}
            </div>

            {/* Content */}
            <div ref={containerRef} className="ticker-container ticker-content-area flex-1 overflow-hidden min-w-0">
              <div
                ref={contentRef}
                className="flex items-center gap-4 sm:gap-5 px-3 sm:px-4 whitespace-nowrap h-full"
                style={{ willChange: 'transform' }}
              >
                {currentSection.items.map((item, idx) => (
                  <div key={item.id || idx} className="flex items-center gap-3 sm:gap-4 flex-shrink-0">
                    {idx > 0 && <span className="ticker-divider" />}

                    <div
                      className={`flex items-center gap-1.5 sm:gap-2 whitespace-nowrap ${item.link ? 'cursor-pointer ticker-item-link' : ''}`}
                      onClick={() => handleItemClick(item)}
                    >
                      {item.label && (
                        <span
                          className={`text-[10px] uppercase text-txt-tertiary ${item.team2 ? 'hidden sm:inline' : ''}`}
                          style={{
                            fontWeight: 600,
                            letterSpacing: '0.12em'
                          }}
                        >
                          {item.label}
                        </span>
                      )}

                      {item.team && !item.team2 && getLogoUrl(item.team, dynastyTeams) && (
                        <div className="w-[18px] h-[18px] sm:w-5 sm:h-5 rounded-full ticker-logo p-0.5 flex-shrink-0">
                          <img
                            src={getLogoUrl(item.team, dynastyTeams)}
                            alt=""
                            className="w-full h-full object-contain"
                            onError={(e) => { e.target.style.display = 'none' }}
                          />
                        </div>
                      )}

                      {item.team && item.team2 && (
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <div className="w-[18px] h-[18px] sm:w-5 sm:h-5 rounded-full ticker-logo p-0.5 flex-shrink-0">
                            <img
                              src={getLogoUrl(item.team, dynastyTeams)}
                              alt=""
                              className="w-full h-full object-contain"
                              onError={(e) => { e.target.style.display = 'none' }}
                            />
                          </div>
                          <span
                            className="text-[11px] sm:text-xs tabular-nums"
                            style={{
                              color: item.winner === item.team ? 'var(--text-primary)' : 'var(--text-tertiary)',
                              fontWeight: item.winner === item.team ? 700 : 500
                            }}
                          >
                            {item.score1}
                          </span>
                          <span className="text-[10px] text-txt-muted">–</span>
                          <span
                            className="text-[11px] sm:text-xs tabular-nums"
                            style={{
                              color: item.winner === item.team2 ? 'var(--text-primary)' : 'var(--text-tertiary)',
                              fontWeight: item.winner === item.team2 ? 700 : 500
                            }}
                          >
                            {item.score2}
                          </span>
                          <div className="w-[18px] h-[18px] sm:w-5 sm:h-5 rounded-full ticker-logo p-0.5 flex-shrink-0">
                            <img
                              src={getLogoUrl(item.team2, dynastyTeams)}
                              alt=""
                              className="w-full h-full object-contain"
                              onError={(e) => { e.target.style.display = 'none' }}
                            />
                          </div>
                        </div>
                      )}

                      {item.text && !item.team2 && (
                        <span
                          className="text-[11px] sm:text-xs tabular-nums text-txt-secondary"
                          style={{ fontWeight: 500 }}
                        >
                          {item.text}
                        </span>
                      )}

                      {item.trailing && (
                        <span
                          className="text-[11px] sm:text-xs uppercase"
                          style={{ fontWeight: 700, letterSpacing: '0.06em', color: item.trailingColor || 'var(--text-secondary)' }}
                        >
                          {item.trailing}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
