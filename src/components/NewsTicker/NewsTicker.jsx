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
const BASE_HOLD_TIME = 3000
const SCROLL_PIXELS_PER_MS = 0.08
const DESKTOP_BREAKPOINT = 768
const MAX_RECENT_HISTORY = 5

export default function NewsTicker({ dynasty }) {
  const pathPrefix = usePathPrefix()
  const navigate = useNavigate()
  const [currentSectionIndex, setCurrentSectionIndex] = useState(0)
  const [isTransitioning, setIsTransitioning] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const recentTypesRef = useRef([]) // Track recently shown types to avoid repetition
  const hasInitializedRef = useRef(false)
  const pendingIndexRef = useRef(null)

  // Scroll state
  const itemsContainerRef = useRef(null)
  const scrollContentRef = useRef(null)
  const [overflowAmount, setOverflowAmount] = useState(0)
  const [scrollPhase, setScrollPhase] = useState('hold-start')
  const scrollAnimationRef = useRef(null)
  const phaseTimerRef = useRef(null)

  // Desktop detection
  const [isDesktop, setIsDesktop] = useState(window.innerWidth >= DESKTOP_BREAKPOINT)

  const sections = useTickerSections(dynasty)
  const currentSection = sections[currentSectionIndex] || null

  // DEBUG: Log current section details
  if (currentSection) {
    console.log('[Ticker] Current section:', currentSection.type, 'label:', currentSection.label, 'items:', JSON.stringify(currentSection.items))
  }

  // Initialize with random section
  useEffect(() => {
    if (sections.length > 0 && !hasInitializedRef.current) {
      const randomIndex = Math.floor(Math.random() * sections.length)
      setCurrentSectionIndex(randomIndex)
      if (sections[randomIndex]?.type) {
        recentTypesRef.current = [sections[randomIndex].type]
      }
      hasInitializedRef.current = true
    }
  }, [sections.length])

  // Handle window resize
  useEffect(() => {
    const handleResize = () => setIsDesktop(window.innerWidth >= DESKTOP_BREAKPOINT)
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
        setOverflowAmount(Math.max(0, container.scrollWidth - container.clientWidth))
      }
    }

    const timeoutId = setTimeout(measureOverflow, 50)
    return () => clearTimeout(timeoutId)
  }, [currentSectionIndex, currentSection?.items?.length])

  // Pick next section with smart selection (avoids recently shown)
  const pickNextSectionIndex = useCallback(() => {
    if (sections.length <= 1) return 0

    // Build candidates excluding recently shown types
    const recentTypes = recentTypesRef.current
    const candidates = sections
      .map((s, idx) => ({ section: s, idx }))
      .filter(({ section }) => !recentTypes.includes(section.type))

    let nextIdx
    if (candidates.length > 0) {
      // Pick random from candidates not recently shown
      const picked = candidates[Math.floor(Math.random() * candidates.length)]
      nextIdx = picked.idx
    } else {
      // All types recently shown, just go to next
      nextIdx = (currentSectionIndex + 1) % sections.length
    }

    // Update recent types
    const nextType = sections[nextIdx]?.type
    if (nextType) {
      recentTypesRef.current = [nextType, ...recentTypes.filter(t => t !== nextType)].slice(0, MAX_RECENT_HISTORY)
    }

    return nextIdx
  }, [sections, currentSectionIndex])

  // Scroll animation
  useEffect(() => {
    if (sections.length === 0 || isPaused || isTransitioning || !currentSection) return

    if (phaseTimerRef.current) clearTimeout(phaseTimerRef.current)
    if (scrollAnimationRef.current) cancelAnimationFrame(scrollAnimationRef.current)

    const content = scrollContentRef.current
    if (!content) return

    // No overflow - just hold then advance
    if (overflowAmount === 0) {
      phaseTimerRef.current = setTimeout(() => advanceToNextSection(), BASE_HOLD_TIME * 2)
      return
    }

    // Desktop: scroll right, hold, advance
    if (isDesktop) {
      let startTime = null
      const animateDesktop = (timestamp) => {
        if (!startTime) startTime = timestamp
        const elapsed = timestamp - startTime

        if (scrollPhase === 'hold-start') {
          if (elapsed >= 1500) { setScrollPhase('scrolling-right'); startTime = null }
        } else if (scrollPhase === 'scrolling-right') {
          const progress = Math.min(1, elapsed * SCROLL_PIXELS_PER_MS / overflowAmount)
          content.style.transform = `translateX(-${progress * overflowAmount}px)`
          if (progress >= 1) { setScrollPhase('hold-end'); startTime = null }
        } else if (scrollPhase === 'hold-end') {
          if (elapsed >= BASE_HOLD_TIME) { advanceToNextSection(); return }
        } else if (scrollPhase === 'done') {
          advanceToNextSection(); return
        }
        scrollAnimationRef.current = requestAnimationFrame(animateDesktop)
      }
      scrollAnimationRef.current = requestAnimationFrame(animateDesktop)
      return () => { if (scrollAnimationRef.current) cancelAnimationFrame(scrollAnimationRef.current) }
    }

    // Mobile: scroll right, hold, scroll left, advance
    let currentScroll = 0
    let startTime = null
    const animateScroll = (timestamp) => {
      if (!startTime) startTime = timestamp
      const elapsed = timestamp - startTime

      if (scrollPhase === 'hold-start') {
        if (elapsed >= BASE_HOLD_TIME) { setScrollPhase('scrolling-right'); startTime = null }
      } else if (scrollPhase === 'scrolling-right') {
        const progress = Math.min(1, elapsed * SCROLL_PIXELS_PER_MS / overflowAmount)
        currentScroll = progress * overflowAmount
        content.style.transform = `translateX(-${currentScroll}px)`
        if (progress >= 1) { setScrollPhase('hold-end'); startTime = null }
      } else if (scrollPhase === 'hold-end') {
        if (elapsed >= BASE_HOLD_TIME) { setScrollPhase('scrolling-left'); startTime = null; currentScroll = overflowAmount }
      } else if (scrollPhase === 'scrolling-left') {
        const progress = Math.min(1, elapsed * SCROLL_PIXELS_PER_MS / overflowAmount)
        currentScroll = overflowAmount * (1 - progress)
        content.style.transform = `translateX(-${currentScroll}px)`
        if (progress >= 1) { setScrollPhase('done'); startTime = null }
      } else if (scrollPhase === 'done') {
        advanceToNextSection(); return
      }
      scrollAnimationRef.current = requestAnimationFrame(animateScroll)
    }
    scrollAnimationRef.current = requestAnimationFrame(animateScroll)
    return () => {
      if (scrollAnimationRef.current) cancelAnimationFrame(scrollAnimationRef.current)
      if (phaseTimerRef.current) clearTimeout(phaseTimerRef.current)
    }
  }, [scrollPhase, overflowAmount, isPaused, isTransitioning, sections.length, isDesktop, currentSection])

  const advanceToNextSection = useCallback(() => {
    setIsTransitioning(true)
  }, [])

  // Handle transition - use refs to avoid dependency issues
  const pickNextSectionIndexRef = useRef(pickNextSectionIndex)
  pickNextSectionIndexRef.current = pickNextSectionIndex

  useEffect(() => {
    if (!isTransitioning) return

    const changeTimer = setTimeout(() => {
      if (pendingIndexRef.current !== null) {
        setCurrentSectionIndex(pendingIndexRef.current)
        pendingIndexRef.current = null
      } else {
        setCurrentSectionIndex(pickNextSectionIndexRef.current())
      }
    }, 300)

    const fadeInTimer = setTimeout(() => setIsTransitioning(false), 350)

    return () => { clearTimeout(changeTimer); clearTimeout(fadeInTimer) }
  }, [isTransitioning]) // Remove pickNextSectionIndex from deps to prevent race condition

  const togglePause = useCallback(() => setIsPaused(prev => !prev), [])

  const handleItemClick = useCallback((item) => {
    if (item?.link) navigate(`${pathPrefix}${item.link}`)
  }, [navigate, pathPrefix])

  const handleHeaderClick = useCallback((section) => {
    if (section?.headerLink) navigate(`${pathPrefix}${section.headerLink}`)
  }, [navigate, pathPrefix])

  const goToSection = useCallback((index) => {
    if (isTransitioning) return
    pendingIndexRef.current = index
    setIsTransitioning(true)
  }, [isTransitioning])

  const goToPrev = useCallback(() => {
    goToSection(currentSectionIndex === 0 ? sections.length - 1 : currentSectionIndex - 1)
  }, [currentSectionIndex, sections.length, goToSection])

  const goToNext = useCallback(() => {
    goToSection((currentSectionIndex + 1) % sections.length)
  }, [currentSectionIndex, sections.length, goToSection])

  // Don't render if no data
  if (!dynasty || sections.length === 0 || !currentSection || !currentSection.items || currentSection.items.length === 0) {
    console.log('[Ticker] NOT RENDERING:', { dynasty: !!dynasty, sectionsLen: sections.length, currentSection: currentSection?.type, items: currentSection?.items?.length })
    return null
  }

  const bgColor = '#111827'
  const borderColor = '#374151'
  const textColor = '#f3f4f6'
  const headerBg = '#1f2937'

  return (
    <>
      <style>{`
        .ticker-items::-webkit-scrollbar { display: none; }
        .ticker-items { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
      <div
        className="fixed bottom-0 left-0 right-0 z-40 overflow-hidden"
        style={{ backgroundColor: bgColor, borderTop: `2px solid ${borderColor}`, height: '48px' }}
      >
        <div className="h-full flex items-center">
          <div className={`flex-1 flex items-center h-full overflow-hidden transition-opacity duration-300 ${isTransitioning ? 'opacity-0' : 'opacity-100'}`}>
            {/* Header */}
            <div
              className={`h-full flex items-center gap-2 px-3 sm:px-4 font-bold text-xs sm:text-sm uppercase tracking-wider whitespace-nowrap ${currentSection.headerLink ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''}`}
              style={{ backgroundColor: headerBg, color: textColor }}
              onClick={() => handleHeaderClick(currentSection)}
            >
              {currentSection.teamLogo && (
                <div className="flex flex-col items-center flex-shrink-0">
                  <img src={getLogoUrl(currentSection.teamLogo)} alt="" className="w-6 h-6 rounded-full bg-white p-0.5" onError={(e) => { e.target.style.display = 'none' }} />
                  {currentSection.teamRecord && <span className="text-[8px] text-gray-400 leading-none mt-0.5">{currentSection.teamRecord}</span>}
                </div>
              )}
              {currentSection.opponentLogo && (
                <>
                  <span className="text-gray-400 text-[10px] sm:text-xs">vs</span>
                  <div className="flex flex-col items-center flex-shrink-0">
                    <img src={getLogoUrl(currentSection.opponentLogo)} alt="" className="w-6 h-6 rounded-full bg-white p-0.5" onError={(e) => { e.target.style.display = 'none' }} />
                    {currentSection.opponentRecord && <span className="text-[8px] text-gray-400 leading-none mt-0.5">{currentSection.opponentRecord}</span>}
                  </div>
                </>
              )}
              {!currentSection.opponentLogo && currentSection.label}
              <span className="ml-2 text-[10px] text-yellow-400">({currentSection.type})</span>
            </div>

            {/* Items */}
            <div ref={itemsContainerRef} className="ticker-items flex-1 overflow-hidden">
              <div ref={scrollContentRef} className="flex items-center gap-2 sm:gap-4 px-3 sm:px-4 whitespace-nowrap" style={{ willChange: 'transform' }}>
                {currentSection.items.map((item, idx) => (
                  <div
                    key={item.id || idx}
                    className={`flex items-center gap-1.5 sm:gap-2 whitespace-nowrap ${item.link ? 'cursor-pointer hover:opacity-70 transition-opacity' : ''}`}
                    onClick={() => handleItemClick(item)}
                  >
                    {item.team && getLogoUrl(item.team) && (
                      <img src={getLogoUrl(item.team)} alt="" className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-white p-0.5 flex-shrink-0" onError={(e) => { e.target.style.display = 'none' }} />
                    )}
                    {item.label && <span className="font-semibold text-xs sm:text-sm" style={{ color: item.labelColor || textColor }}>{item.label}</span>}
                    <span className="text-xs sm:text-sm" style={{ color: item.textColor || textColor, opacity: item.label ? 0.9 : 1 }}>{item.text}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-1 px-2 h-full border-l border-white/20">
            <button onClick={togglePause} className="p-1 rounded hover:bg-white/10 transition-colors" style={{ color: textColor }} title={isPaused ? 'Play' : 'Pause'}>
              {isPaused ? (
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
              ) : (
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" /></svg>
              )}
            </button>
            <button onClick={goToPrev} className="p-1 rounded hover:bg-white/10 transition-colors" style={{ color: textColor }}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            </button>
            <button onClick={goToNext} className="p-1 rounded hover:bg-white/10 transition-colors" style={{ color: textColor }}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
