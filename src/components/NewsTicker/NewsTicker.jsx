import { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePathPrefix } from '../../hooks/usePathPrefix'
import { useTickerSections } from './useTickerSections'
import { getTeamLogo } from '../../data/teams'
import { teamAbbreviations } from '../../data/teamAbbreviations'

function getLogoUrl(teamIdentifier) {
  if (!teamIdentifier) return null
  const teamData = teamAbbreviations[teamIdentifier]
  if (teamData) {
    if (teamData.logo) return teamData.logo
    return getTeamLogo(teamData.name)
  }
  return getTeamLogo(teamIdentifier)
}

const HOLD_TIME = 4000
const SCROLL_SPEED = 0.06

export default function NewsTicker({ dynasty }) {
  const pathPrefix = usePathPrefix()
  const navigate = useNavigate()
  const sections = useTickerSections(dynasty)

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
          .ticker-header { max-width: 90px; min-width: 70px; }
          .ticker-content-area { min-width: 0; flex: 1 1 0%; }
        }
      `}</style>

      <div
        className="ticker-wrapper fixed bottom-0 left-0 right-0 z-50"
        style={{
          background: 'linear-gradient(180deg, #0f172a 0%, #020617 100%)',
          borderTop: '1px solid rgba(71, 85, 105, 0.3)',
          height: '36px'
        }}
      >
        <div className="flex items-center h-full">
          <div className={`flex items-center h-full overflow-hidden transition-opacity duration-250 w-full ${isTransitioning ? 'opacity-0' : 'opacity-100'}`}>

            {/* Header */}
            <div
              className={`h-full flex items-center gap-1.5 px-2 sm:px-3 flex-shrink-0 ticker-header ${currentSection.headerLink ? 'cursor-pointer hover:bg-white/5' : ''}`}
              style={{ borderRight: '1px solid rgba(71, 85, 105, 0.3)' }}
              onClick={() => handleHeaderClick(currentSection)}
            >
              {currentSection.teamLogo && (
                <div className="w-5 h-5 rounded-full bg-white p-0.5 flex-shrink-0">
                  <img
                    src={getLogoUrl(currentSection.teamLogo)}
                    alt=""
                    className="w-full h-full object-contain"
                    onError={(e) => { e.target.style.display = 'none' }}
                  />
                </div>
              )}
              {currentSection.opponentLogo ? (
                <>
                  <span className="text-[9px] text-slate-500">vs</span>
                  <div className="w-5 h-5 rounded-full bg-white p-0.5 flex-shrink-0">
                    <img
                      src={getLogoUrl(currentSection.opponentLogo)}
                      alt=""
                      className="w-full h-full object-contain"
                      onError={(e) => { e.target.style.display = 'none' }}
                    />
                  </div>
                </>
              ) : (
                <span className="text-[10px] sm:text-xs font-semibold text-slate-300 uppercase tracking-wide truncate">
                  {currentSection.label}
                </span>
              )}
            </div>

            {/* Content */}
            <div ref={containerRef} className="ticker-container ticker-content-area flex-1 overflow-hidden min-w-0">
              <div
                ref={contentRef}
                className="flex items-center gap-3 sm:gap-4 px-2 sm:px-3 whitespace-nowrap h-full"
                style={{ willChange: 'transform' }}
              >
                {currentSection.items.map((item, idx) => (
                  <div key={item.id || idx} className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
                    {idx > 0 && <span className="text-slate-700">|</span>}

                    <div
                      className={`flex items-center gap-1 sm:gap-1.5 whitespace-nowrap ${item.link ? 'cursor-pointer hover:opacity-70' : ''}`}
                      onClick={() => handleItemClick(item)}
                    >
                      {item.label && (
                        <span
                          className={`font-medium text-[10px] sm:text-xs ${item.team2 ? 'hidden sm:inline' : ''}`}
                          style={{ color: item.labelColor || '#94a3b8' }}
                        >
                          {item.label}
                        </span>
                      )}

                      {item.team && !item.team2 && getLogoUrl(item.team) && (
                        <div className="w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-white p-0.5 flex-shrink-0">
                          <img
                            src={getLogoUrl(item.team)}
                            alt=""
                            className="w-full h-full object-contain"
                            onError={(e) => { e.target.style.display = 'none' }}
                          />
                        </div>
                      )}

                      {item.team && item.team2 && (
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <div className="w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-white p-0.5 flex-shrink-0">
                            <img
                              src={getLogoUrl(item.team)}
                              alt=""
                              className="w-full h-full object-contain"
                              onError={(e) => { e.target.style.display = 'none' }}
                            />
                          </div>
                          <span
                            className="text-[10px] sm:text-xs tabular-nums"
                            style={{
                              color: item.winner === item.team ? '#4ade80' : '#e2e8f0',
                              fontWeight: item.winner === item.team ? '600' : '400'
                            }}
                          >
                            {item.score1}
                          </span>
                          <span className="text-[10px] text-slate-600">-</span>
                          <span
                            className="text-[10px] sm:text-xs tabular-nums"
                            style={{
                              color: item.winner === item.team2 ? '#4ade80' : '#e2e8f0',
                              fontWeight: item.winner === item.team2 ? '600' : '400'
                            }}
                          >
                            {item.score2}
                          </span>
                          <div className="w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-white p-0.5 flex-shrink-0">
                            <img
                              src={getLogoUrl(item.team2)}
                              alt=""
                              className="w-full h-full object-contain"
                              onError={(e) => { e.target.style.display = 'none' }}
                            />
                          </div>
                        </div>
                      )}

                      {item.text && !item.team2 && (
                        <span className="text-[10px] sm:text-xs text-slate-300">{item.text}</span>
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
