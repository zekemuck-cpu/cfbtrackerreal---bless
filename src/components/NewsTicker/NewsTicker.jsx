import { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
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

// Timing constants - base duration, with extra time for more content
const BASE_DURATION = 6000 // 6 seconds minimum
const PER_ITEM_DURATION = 1500 // 1.5 seconds per item beyond the first 2
const OVERFLOW_SCROLL_SPEED = 50 // pixels per second for overflow scroll time

export default function NewsTicker({ dynasty }) {
  const pathPrefix = usePathPrefix()
  const navigate = useNavigate()
  const location = useLocation()
  const [currentSectionIndex, setCurrentSectionIndex] = useState(0)
  const [isTransitioning, setIsTransitioning] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [progress, setProgress] = useState(0)
  const [sectionDuration, setSectionDuration] = useState(BASE_DURATION)
  const progressRef = useRef(null)
  const startTimeRef = useRef(Date.now())
  const pausedProgressRef = useRef(0)
  const pendingIndexRef = useRef(null) // For manual navigation target

  // Scroll animation state
  const itemsContainerRef = useRef(null)
  const [overflowAmount, setOverflowAmount] = useState(0)

  const sections = useTickerSections(dynasty)
  const currentSection = sections[currentSectionIndex] || { label: '', items: [] }

  // Reset to first section on route change
  useEffect(() => {
    setCurrentSectionIndex(0)
    setIsTransitioning(false)
    setProgress(0)
    startTimeRef.current = Date.now()
    pausedProgressRef.current = 0
  }, [location.pathname])

  // Measure overflow and calculate duration when section changes
  useEffect(() => {
    setProgress(0)
    startTimeRef.current = Date.now()
    pausedProgressRef.current = 0

    const measureAndCalculate = () => {
      const container = itemsContainerRef.current
      let overflow = 0
      if (container) {
        overflow = Math.max(0, container.scrollWidth - container.clientWidth)
        setOverflowAmount(overflow)
      }

      // Calculate dynamic duration based on content
      const itemCount = currentSection.items?.length || 0
      const extraItemTime = Math.max(0, itemCount - 2) * PER_ITEM_DURATION
      const scrollTime = overflow > 0 ? (overflow / OVERFLOW_SCROLL_SPEED) * 1000 * 2 : 0 // *2 for back and forth

      const totalDuration = BASE_DURATION + extraItemTime + scrollTime
      setSectionDuration(Math.min(totalDuration, 20000)) // Cap at 20 seconds max
    }

    const timeoutId = setTimeout(measureAndCalculate, 50)
    return () => clearTimeout(timeoutId)
  }, [currentSectionIndex, currentSection.items?.length])

  // Timer - progress from 0 to 100 over dynamic sectionDuration
  useEffect(() => {
    if (sections.length === 0) return

    const animate = () => {
      if (!isPaused && !isTransitioning) {
        const elapsed = Date.now() - startTimeRef.current
        const newProgress = (elapsed / sectionDuration) * 100

        if (newProgress >= 100) {
          // Start transition - fade out first
          setIsTransitioning(true)
          setProgress(100)
        } else {
          setProgress(newProgress)
        }
      }

      progressRef.current = requestAnimationFrame(animate)
    }

    progressRef.current = requestAnimationFrame(animate)

    return () => {
      if (progressRef.current) {
        cancelAnimationFrame(progressRef.current)
      }
    }
  }, [sections.length, isPaused, isTransitioning, sectionDuration])

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

  // Handle pause/unpause - preserve progress
  const togglePause = useCallback(() => {
    setIsPaused(prev => {
      if (!prev) {
        // Pausing - store current progress
        pausedProgressRef.current = progress
      } else {
        // Unpausing - reset start time based on stored progress
        const elapsed = (pausedProgressRef.current / 100) * SECTION_DURATION
        startTimeRef.current = Date.now() - elapsed
      }
      return !prev
    })
  }, [progress])

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

  // Handle manual navigation (resets progress)
  const goToSection = useCallback((index) => {
    if (isTransitioning) return // Prevent double-clicks during transition
    pendingIndexRef.current = index
    setIsTransitioning(true)
    setProgress(0)
    startTimeRef.current = Date.now()
    pausedProgressRef.current = 0
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
  const progressColor = '#3b82f6' // blue-500

  return (
    <>
      {/* Ticker CSS */}
      <style>{`
        .ticker-items::-webkit-scrollbar {
          display: none;
        }
        @keyframes ticker-scroll {
          0%, 15% { transform: translateX(0); }
          85%, 100% { transform: translateX(calc(-1 * var(--overflow-amount))); }
        }
        .ticker-scroll {
          animation: ticker-scroll var(--scroll-duration) ease-in-out infinite;
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
            {/* Team logo or other icon */}
            {currentSection.teamLogo ? (
              <img
                src={getLogoUrl(currentSection.teamLogo)}
                alt=""
                className="w-6 h-6 rounded-full bg-white p-0.5 flex-shrink-0"
                onError={(e) => { e.target.style.display = 'none' }}
              />
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
                <img
                  src={getLogoUrl(currentSection.opponentLogo)}
                  alt=""
                  className="w-6 h-6 rounded-full bg-white p-0.5 flex-shrink-0"
                  onError={(e) => { e.target.style.display = 'none' }}
                />
              </>
            )}

            {/* Hide label text when showing matchup logos - the logos speak for themselves */}
            {!currentSection.opponentLogo && currentSection.label}
          </div>

          {/* Section items - CSS animation for overflow scroll */}
          <div
            ref={itemsContainerRef}
            className="ticker-items flex-1 overflow-hidden"
          >
            <div
              className={`flex items-center gap-2 sm:gap-4 px-3 sm:px-4 whitespace-nowrap ${
                overflowAmount > 0 && !isPaused ? 'ticker-scroll' : ''
              }`}
              style={{
                '--overflow-amount': `${overflowAmount}px`,
                '--scroll-duration': `${Math.max(3, overflowAmount / 50)}s`
              }}
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
