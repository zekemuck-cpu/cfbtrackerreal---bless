import { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePathPrefix } from '../../hooks/usePathPrefix'
import { useTickerSections } from './useTickerSections'
import { getTeamLogo } from '../../data/teams'
import { teamAbbreviations } from '../../data/teamAbbreviations'

// Get logo URL - handles both abbreviations and full team names
function getLogoUrl(teamIdentifier) {
  if (!teamIdentifier) return null

  // If it's an abbreviation, get the full name first
  const teamData = teamAbbreviations[teamIdentifier]
  if (teamData) {
    // Check for custom logo (FCS teams)
    if (teamData.logo) return teamData.logo
    // Use the full name to get logo
    return getTeamLogo(teamData.name)
  }

  // Otherwise try as full name
  return getTeamLogo(teamIdentifier)
}

// Timing constants
const BASE_HOLD_TIME = 3000 // 3 seconds to hold at start/end of scroll
const SCROLL_PIXELS_PER_MS = 0.08 // Scroll speed (pixels per millisecond)
const DESKTOP_BREAKPOINT = 768 // px - screens wider than this are "desktop"

export default function NewsTicker({ dynasty }) {
  const pathPrefix = usePathPrefix()
  const navigate = useNavigate()
  const [currentSectionIndex, setCurrentSectionIndex] = useState(0)
  const [isTransitioning, setIsTransitioning] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const pendingIndexRef = useRef(null) // For manual navigation target
  const hasInitializedRef = useRef(false) // Track if we've set random start

  // Scroll state
  const itemsContainerRef = useRef(null)
  const scrollContentRef = useRef(null)
  const [overflowAmount, setOverflowAmount] = useState(0)
  const [scrollPhase, setScrollPhase] = useState('hold-start') // 'hold-start', 'scrolling-right', 'hold-end', 'scrolling-left', 'done'
  const scrollAnimationRef = useRef(null)
  const phaseTimerRef = useRef(null)

  // Desktop detection
  const [isDesktop, setIsDesktop] = useState(window.innerWidth >= DESKTOP_BREAKPOINT)

  const sections = useTickerSections(dynasty)
  const currentSection = sections[currentSectionIndex] || { label: '', items: [] }

  // Initialize with random section on first load
  useEffect(() => {
    if (sections.length > 0 && !hasInitializedRef.current) {
      const randomIndex = Math.floor(Math.random() * sections.length)
      setCurrentSectionIndex(randomIndex)
      hasInitializedRef.current = true
    }
  }, [sections.length])

  // Handle window resize for desktop detection
  useEffect(() => {
    const handleResize = () => {
      setIsDesktop(window.innerWidth >= DESKTOP_BREAKPOINT)
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])


  // Measure overflow when section changes
  useEffect(() => {
    setScrollPhase('hold-start')
    if (scrollContentRef.current) {
      scrollContentRef.current.style.transform = 'translateX(0)'
    }

    const measureOverflow = () => {
      const container = itemsContainerRef.current
      if (container) {
        const overflow = Math.max(0, container.scrollWidth - container.clientWidth)
        setOverflowAmount(overflow)
      }
    }

    const timeoutId = setTimeout(measureOverflow, 50)
    return () => clearTimeout(timeoutId)
  }, [currentSectionIndex, currentSection.items?.length])

  // JavaScript-based scroll animation - completion-based, not timer-based
  useEffect(() => {
    if (sections.length === 0 || isPaused || isTransitioning) return

    // Clear any existing timers/animations
    if (phaseTimerRef.current) clearTimeout(phaseTimerRef.current)
    if (scrollAnimationRef.current) cancelAnimationFrame(scrollAnimationRef.current)

    const content = scrollContentRef.current
    if (!content) return

    // No overflow - just hold then advance
    if (overflowAmount === 0) {
      phaseTimerRef.current = setTimeout(() => {
        advanceToNextSection()
      }, BASE_HOLD_TIME * 2)
      return
    }

    // DESKTOP: Scroll once to end, hold, then advance (no scroll back)
    if (isDesktop) {
      let startTime = null

      const animateDesktop = (timestamp) => {
        if (!startTime) startTime = timestamp
        const elapsed = timestamp - startTime

        if (scrollPhase === 'hold-start') {
          // Brief hold at start
          if (elapsed >= 1500) {
            setScrollPhase('scrolling-right')
            startTime = null
          }
        } else if (scrollPhase === 'scrolling-right') {
          // Scroll to show all content
          const scrollProgress = Math.min(1, elapsed * SCROLL_PIXELS_PER_MS / overflowAmount)
          const currentScroll = scrollProgress * overflowAmount
          content.style.transform = `translateX(-${currentScroll}px)`

          if (scrollProgress >= 1) {
            setScrollPhase('hold-end')
            startTime = null
          }
        } else if (scrollPhase === 'hold-end') {
          // Hold at end showing all content, then advance
          if (elapsed >= BASE_HOLD_TIME) {
            advanceToNextSection()
            return
          }
        } else if (scrollPhase === 'done') {
          advanceToNextSection()
          return
        }

        scrollAnimationRef.current = requestAnimationFrame(animateDesktop)
      }

      scrollAnimationRef.current = requestAnimationFrame(animateDesktop)
      return () => {
        if (scrollAnimationRef.current) cancelAnimationFrame(scrollAnimationRef.current)
      }
    }

    // MOBILE: Full scroll dance (scroll right, hold, scroll left, advance)
    let currentScroll = 0
    let startTime = null

    const animateScroll = (timestamp) => {
      if (!startTime) startTime = timestamp
      const elapsed = timestamp - startTime

      if (scrollPhase === 'hold-start') {
        // Hold at start position
        if (elapsed >= BASE_HOLD_TIME) {
          setScrollPhase('scrolling-right')
          startTime = null
        }
      } else if (scrollPhase === 'scrolling-right') {
        // Scroll to show hidden content
        const scrollProgress = Math.min(1, elapsed * SCROLL_PIXELS_PER_MS / overflowAmount)
        currentScroll = scrollProgress * overflowAmount
        content.style.transform = `translateX(-${currentScroll}px)`

        if (scrollProgress >= 1) {
          setScrollPhase('hold-end')
          startTime = null
        }
      } else if (scrollPhase === 'hold-end') {
        // Hold at end position
        if (elapsed >= BASE_HOLD_TIME) {
          setScrollPhase('scrolling-left')
          startTime = null
          currentScroll = overflowAmount
        }
      } else if (scrollPhase === 'scrolling-left') {
        // Scroll back to start
        const scrollProgress = Math.min(1, elapsed * SCROLL_PIXELS_PER_MS / overflowAmount)
        currentScroll = overflowAmount * (1 - scrollProgress)
        content.style.transform = `translateX(-${currentScroll}px)`

        if (scrollProgress >= 1) {
          setScrollPhase('done')
          startTime = null
        }
      } else if (scrollPhase === 'done') {
        // Scroll cycle complete - advance to next section
        advanceToNextSection()
        return
      }

      scrollAnimationRef.current = requestAnimationFrame(animateScroll)
    }

    scrollAnimationRef.current = requestAnimationFrame(animateScroll)

    return () => {
      if (scrollAnimationRef.current) cancelAnimationFrame(scrollAnimationRef.current)
      if (phaseTimerRef.current) clearTimeout(phaseTimerRef.current)
    }
  }, [scrollPhase, overflowAmount, isPaused, isTransitioning, sections.length, isDesktop])

  // Advance to next section with fade transition
  const advanceToNextSection = useCallback(() => {
    setIsTransitioning(true)
  }, [])

  // Handle the transition sequence: fade out -> change section -> fade in
  useEffect(() => {
    if (!isTransitioning) return

    // Wait for fade out to complete (300ms), then change section
    const changeTimer = setTimeout(() => {
      if (pendingIndexRef.current !== null) {
        // Manual navigation - go to specific index
        setCurrentSectionIndex(pendingIndexRef.current)
        pendingIndexRef.current = null
      } else {
        // Auto-advance to next section
        setCurrentSectionIndex(prevIdx => (prevIdx + 1) % sections.length)
      }
    }, 300)

    // After section changes and new content renders, fade in (add small buffer)
    const fadeInTimer = setTimeout(() => {
      setIsTransitioning(false)
    }, 350)

    return () => {
      clearTimeout(changeTimer)
      clearTimeout(fadeInTimer)
    }
  }, [isTransitioning, sections.length])

  // Handle pause/unpause
  const togglePause = useCallback(() => {
    setIsPaused(prev => !prev)
  }, [])

  // Handle item click
  const handleItemClick = useCallback((item) => {
    if (item?.link) {
      navigate(`${pathPrefix}${item.link}`)
    }
  }, [navigate, pathPrefix])

  // Handle header click
  const handleHeaderClick = useCallback((section) => {
    if (section?.headerLink) {
      navigate(`${pathPrefix}${section.headerLink}`)
    }
  }, [navigate, pathPrefix])

  // Handle manual navigation (resets scroll)
  const goToSection = useCallback((index) => {
    if (isTransitioning) return // Prevent double-clicks during transition
    pendingIndexRef.current = index
    setIsTransitioning(true)
  }, [isTransitioning])

  const goToPrev = useCallback(() => {
    goToSection(currentSectionIndex === 0 ? sections.length - 1 : currentSectionIndex - 1)
  }, [currentSectionIndex, sections.length, goToSection])

  const goToNext = useCallback(() => {
    goToSection((currentSectionIndex + 1) % sections.length)
  }, [currentSectionIndex, sections.length, goToSection])

  // Don't render if no dynasty or no sections
  if (!dynasty || sections.length === 0) return null

  // Neutral dark color scheme
  const bgColor = '#111827' // gray-900
  const borderColor = '#374151' // gray-700
  const textColor = '#f3f4f6' // gray-100
  const headerBg = '#1f2937' // gray-800

  return (
    <>
      {/* Ticker CSS */}
      <style>{`
        .ticker-items::-webkit-scrollbar {
          display: none;
        }
        .ticker-items {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
      <div
        className="fixed bottom-0 left-0 right-0 z-40 overflow-hidden"
        style={{
          backgroundColor: bgColor,
          borderTop: `2px solid ${borderColor}`,
          height: '48px'
        }}
      >
      <div className="h-full flex items-center">
        {/* Current section content */}
        <div
          className={`flex-1 flex items-center h-full overflow-hidden transition-opacity duration-300 ${
            isTransitioning ? 'opacity-0' : 'opacity-100'
          }`}
        >
          {/* Section header/label */}
          <div
            className={`h-full flex items-center gap-2 px-3 sm:px-4 font-bold text-xs sm:text-sm uppercase tracking-wider whitespace-nowrap ${
              currentSection.headerLink ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''
            }`}
            style={{
              backgroundColor: headerBg,
              color: textColor
            }}
            onClick={() => handleHeaderClick(currentSection)}
          >
            {/* Team logo with record underneath */}
            {currentSection.teamLogo ? (
              <div className="flex flex-col items-center flex-shrink-0">
                <img
                  src={getLogoUrl(currentSection.teamLogo)}
                  alt=""
                  className="w-6 h-6 rounded-full bg-white p-0.5"
                  onError={(e) => { e.target.style.display = 'none' }}
                />
                {currentSection.teamRecord && (
                  <span className="text-[8px] text-gray-400 leading-none mt-0.5">{currentSection.teamRecord}</span>
                )}
              </div>
            ) : currentSection.imageUrl ? (
              <img
                src={currentSection.imageUrl}
                alt=""
                className="w-6 h-6 object-contain flex-shrink-0"
                onError={(e) => { e.target.style.display = 'none' }}
              />
            ) : currentSection.icon ? (
              <span>{currentSection.icon}</span>
            ) : null}

            {/* Opponent logo for matchup display (Team vs Opponent) */}
            {currentSection.opponentLogo && (
              <>
                <span className="text-gray-400 text-[10px] sm:text-xs">vs</span>
                <div className="flex flex-col items-center flex-shrink-0">
                  <img
                    src={getLogoUrl(currentSection.opponentLogo)}
                    alt=""
                    className="w-6 h-6 rounded-full bg-white p-0.5"
                    onError={(e) => { e.target.style.display = 'none' }}
                  />
                  {currentSection.opponentRecord && (
                    <span className="text-[8px] text-gray-400 leading-none mt-0.5">{currentSection.opponentRecord}</span>
                  )}
                </div>
              </>
            )}

            {/* Hide label text when showing matchup logos - the logos speak for themselves */}
            {!currentSection.opponentLogo && currentSection.label}
          </div>

          {/* Section items - JavaScript-controlled scroll */}
          <div
            ref={itemsContainerRef}
            className="ticker-items flex-1 overflow-hidden"
          >
            <div
              ref={scrollContentRef}
              className="flex items-center gap-2 sm:gap-4 px-3 sm:px-4 whitespace-nowrap"
              style={{ willChange: 'transform' }}
            >
            {currentSection.items.map((item, idx) => (
              <div
                key={item.id || idx}
                className={`flex items-center gap-1.5 sm:gap-2 whitespace-nowrap ${item.link ? 'cursor-pointer hover:opacity-70 transition-opacity' : ''}`}
                onClick={() => handleItemClick(item)}
              >
                  {item.team && getLogoUrl(item.team) && (
                    <img
                      src={getLogoUrl(item.team)}
                      alt=""
                      className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-white p-0.5 flex-shrink-0"
                      onError={(e) => { e.target.style.display = 'none' }}
                    />
                  )}

                  {item.label && (
                    <span
                      className="font-semibold text-xs sm:text-sm"
                      style={{ color: item.labelColor || textColor }}
                    >
                      {item.label}
                    </span>
                  )}

                  <span
                    className="text-xs sm:text-sm"
                    style={{ color: item.textColor || textColor, opacity: item.label ? 0.9 : 1 }}
                  >
                    {item.text}
                  </span>
              </div>
            ))}
            </div>
          </div>
        </div>

        {/* Pause/Play and Navigation arrows */}
        <div className="flex items-center gap-1 px-2 h-full border-l border-white/20">
          <button
            onClick={togglePause}
            className="p-1 rounded hover:bg-white/10 transition-colors"
            style={{ color: textColor }}
            title={isPaused ? 'Play' : 'Pause'}
          >
            {isPaused ? (
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
              </svg>
            )}
          </button>
          <button
            onClick={goToPrev}
            className="p-1 rounded hover:bg-white/10 transition-colors"
            style={{ color: textColor }}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button
            onClick={goToNext}
            className="p-1 rounded hover:bg-white/10 transition-colors"
            style={{ color: textColor }}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>
    </div>
    </>
  )
}
