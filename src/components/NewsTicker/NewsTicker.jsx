import { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePathPrefix } from '../../hooks/usePathPrefix'
import { useTickerSections } from './useTickerSections'
import { getTeamLogo } from '../../data/teams'
import { teamAbbreviations } from '../../data/teamAbbreviations'

// Get logo URL - handles both abbreviations and full team names
function getLogoUrl(teamIdentifier) {
  if (!teamIdentifier) return null
  const teamData = teamAbbreviations[teamIdentifier]
  if (teamData) {
    if (teamData.logo) return teamData.logo
    return getTeamLogo(teamData.name)
  }
  return getTeamLogo(teamIdentifier)
}

// Timing constants
const HOLD_TIME = 4000 // Time to display before scrolling or advancing
const SCROLL_SPEED = 0.06 // pixels per ms

export default function NewsTicker({ dynasty }) {
  const pathPrefix = usePathPrefix()
  const navigate = useNavigate()
  const sections = useTickerSections(dynasty)

  const [currentIndex, setCurrentIndex] = useState(0)
  const [isTransitioning, setIsTransitioning] = useState(false)

  // Scroll state
  const containerRef = useRef(null)
  const contentRef = useRef(null)
  const [overflow, setOverflow] = useState(0)
  const [scrollPos, setScrollPos] = useState(0)
  const timerRef = useRef(null)
  const animationRef = useRef(null)

  const currentSection = sections[currentIndex] || null

  // Measure overflow when section changes
  useEffect(() => {
    setScrollPos(0)
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

  // Advance to next section
  const advance = useCallback(() => {
    setIsTransitioning(true)
    setTimeout(() => {
      setCurrentIndex(prev => (prev + 1) % sections.length)
      setIsTransitioning(false)
    }, 300)
  }, [sections.length])

  // Main animation/timing loop
  useEffect(() => {
    if (sections.length === 0 || isTransitioning || !currentSection) return

    // Clear any existing timers
    if (timerRef.current) clearTimeout(timerRef.current)
    if (animationRef.current) cancelAnimationFrame(animationRef.current)

    // No overflow - just hold then advance
    if (overflow === 0) {
      timerRef.current = setTimeout(advance, HOLD_TIME)
      return () => clearTimeout(timerRef.current)
    }

    // Has overflow - hold, scroll, hold, advance
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
        setScrollPos(currentScroll)
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

  // Don't render if no data
  if (!dynasty || sections.length === 0 || !currentSection) {
    return null
  }

  return (
    <>
      <style>{`
        .ticker-container::-webkit-scrollbar { display: none; }
        .ticker-container { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
      <div
        className="fixed bottom-0 left-0 right-0 z-40 overflow-hidden"
        style={{ backgroundColor: '#111827', borderTop: '2px solid #374151', height: '48px' }}
      >
        <div className="h-full flex items-center">
          {/* Main content with fade transition */}
          <div className={`flex-1 flex items-center h-full overflow-hidden transition-opacity duration-300 ${isTransitioning ? 'opacity-0' : 'opacity-100'}`}>

            {/* Header */}
            <div
              className={`h-full flex items-center gap-2 px-3 sm:px-4 font-bold text-xs sm:text-sm uppercase tracking-wider whitespace-nowrap ${currentSection.headerLink ? 'cursor-pointer hover:opacity-80' : ''}`}
              style={{ backgroundColor: '#1f2937', color: '#f3f4f6' }}
              onClick={() => handleHeaderClick(currentSection)}
            >
              {currentSection.teamLogo && (
                <div className="flex flex-col items-center flex-shrink-0">
                  <img
                    src={getLogoUrl(currentSection.teamLogo)}
                    alt=""
                    className="w-6 h-6 rounded-full bg-white p-0.5"
                    onError={(e) => { e.target.style.display = 'none' }}
                  />
                  {currentSection.teamRecord && (
                    <span className="text-[8px] text-gray-400 leading-none mt-0.5">
                      {currentSection.teamRecord}
                    </span>
                  )}
                </div>
              )}
              {currentSection.opponentLogo ? (
                <>
                  <span className="text-gray-400 text-[10px] sm:text-xs">vs</span>
                  <img
                    src={getLogoUrl(currentSection.opponentLogo)}
                    alt=""
                    className="w-6 h-6 rounded-full bg-white p-0.5"
                    onError={(e) => { e.target.style.display = 'none' }}
                  />
                </>
              ) : (
                currentSection.label
              )}
            </div>

            {/* Scrolling items */}
            <div ref={containerRef} className="ticker-container flex-1 overflow-hidden">
              <div
                ref={contentRef}
                className="flex items-center gap-2 sm:gap-4 px-3 sm:px-4 whitespace-nowrap"
                style={{ willChange: 'transform' }}
              >
                {currentSection.items.map((item, idx) => (
                  <div key={item.id || idx} className="flex items-center gap-1.5 sm:gap-2">
                    {/* Separator between items */}
                    {idx > 0 && (
                      <span className="text-gray-500 text-sm mx-1">|</span>
                    )}
                    <div
                      className={`flex items-center gap-1.5 sm:gap-2 whitespace-nowrap ${item.link ? 'cursor-pointer hover:opacity-70' : ''}`}
                      onClick={() => handleItemClick(item)}
                    >
                      {/* Label (e.g., year, W/L) */}
                      {item.label && (
                        <span
                          className="font-semibold text-xs sm:text-sm"
                          style={{ color: item.labelColor || '#f3f4f6' }}
                        >
                          {item.label}
                        </span>
                      )}
                      {/* Single team logo (standard format) */}
                      {item.team && !item.team2 && getLogoUrl(item.team) && (
                        <img
                          src={getLogoUrl(item.team)}
                          alt=""
                          className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-white p-0.5 flex-shrink-0"
                          onError={(e) => { e.target.style.display = 'none' }}
                        />
                      )}
                      {/* Two-team format (CFP games): Logo1 Score1 - Logo2 Score2 */}
                      {item.team && item.team2 && (
                        <>
                          <img
                            src={getLogoUrl(item.team)}
                            alt=""
                            className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-white p-0.5 flex-shrink-0"
                            onError={(e) => { e.target.style.display = 'none' }}
                          />
                          <span
                            className="text-xs sm:text-sm"
                            style={{ color: '#f3f4f6', fontWeight: item.winner === item.team ? 'bold' : 'normal' }}
                          >
                            {item.score1}
                          </span>
                          <span className="text-xs sm:text-sm text-gray-400">-</span>
                          <span
                            className="text-xs sm:text-sm"
                            style={{ color: '#f3f4f6', fontWeight: item.winner === item.team2 ? 'bold' : 'normal' }}
                          >
                            {item.score2}
                          </span>
                          <img
                            src={getLogoUrl(item.team2)}
                            alt=""
                            className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-white p-0.5 flex-shrink-0"
                            onError={(e) => { e.target.style.display = 'none' }}
                          />
                        </>
                      )}
                      {/* Standard text (only if not two-team format) */}
                      {item.text && !item.team2 && (
                        <span
                          className="text-xs sm:text-sm"
                          style={{ color: '#f3f4f6', opacity: item.label ? 0.9 : 1 }}
                        >
                          {item.text}
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
