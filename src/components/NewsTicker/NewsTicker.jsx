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

const SECTION_DURATION = 5000 // 5 seconds per section

export default function NewsTicker({ dynasty }) {
  const pathPrefix = usePathPrefix()
  const navigate = useNavigate()
  const location = useLocation()
  const [currentSectionIndex, setCurrentSectionIndex] = useState(0)
  const [isTransitioning, setIsTransitioning] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [progress, setProgress] = useState(0)
  const progressRef = useRef(null)
  const lastTimeRef = useRef(Date.now())

  const sections = useTickerSections(dynasty)

  // Reset to first section on route change
  useEffect(() => {
    setCurrentSectionIndex(0)
    setIsTransitioning(false)
    setProgress(0)
    lastTimeRef.current = Date.now()
  }, [location.pathname])

  // Progress bar and auto-advance with pause support
  useEffect(() => {
    if (sections.length === 0) return

    const animate = () => {
      if (!isPaused) {
        const now = Date.now()
        const delta = now - lastTimeRef.current
        lastTimeRef.current = now

        setProgress(prev => {
          const newProgress = prev + (delta / SECTION_DURATION) * 100
          if (newProgress >= 100) {
            // Time to advance
            setIsTransitioning(true)
            setTimeout(() => {
              setCurrentSectionIndex(prevIdx => (prevIdx + 1) % sections.length)
              setIsTransitioning(false)
            }, 300)
            return 0
          }
          return newProgress
        })
      } else {
        lastTimeRef.current = Date.now()
      }

      progressRef.current = requestAnimationFrame(animate)
    }

    progressRef.current = requestAnimationFrame(animate)

    return () => {
      if (progressRef.current) {
        cancelAnimationFrame(progressRef.current)
      }
    }
  }, [sections.length, isPaused])

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
    setIsTransitioning(true)
    setProgress(0)
    lastTimeRef.current = Date.now()
    setTimeout(() => {
      setCurrentSectionIndex(index)
      setIsTransitioning(false)
    }, 150)
  }, [])

  const goToPrev = useCallback(() => {
    goToSection(currentSectionIndex === 0 ? sections.length - 1 : currentSectionIndex - 1)
  }, [currentSectionIndex, sections.length, goToSection])

  const goToNext = useCallback(() => {
    goToSection((currentSectionIndex + 1) % sections.length)
  }, [currentSectionIndex, sections.length, goToSection])

  // Don't render if no dynasty or no sections
  if (!dynasty || sections.length === 0) return null

  const currentSection = sections[currentSectionIndex]

  // Neutral dark color scheme
  const bgColor = '#111827' // gray-900
  const borderColor = '#374151' // gray-700
  const textColor = '#f3f4f6' // gray-100
  const headerBg = '#1f2937' // gray-800
  const progressColor = '#3b82f6' // blue-500

  return (
    <>
      {/* Hide scrollbar CSS */}
      <style>{`
        .ticker-items::-webkit-scrollbar {
          display: none;
        }
      `}</style>
      <div
        className="fixed bottom-0 left-0 right-0 z-40 overflow-hidden"
        style={{
          backgroundColor: bgColor,
          borderTop: `2px solid ${borderColor}`,
          height: '48px'
        }}
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
      >
      <div className="h-full flex items-center">
        {/* Section indicator dots with progress bar */}
        <div className="hidden sm:flex items-center gap-1 px-3 h-full border-r border-white/20 relative">
          {/* Progress bar - contained within dots section */}
          <div
            className="absolute bottom-0 left-0 h-0.5 transition-all duration-100"
            style={{
              width: `${progress}%`,
              backgroundColor: progressColor,
              opacity: isPaused ? 0.5 : 1
            }}
          />
          {sections.map((_, idx) => (
            <button
              key={idx}
              onClick={() => goToSection(idx)}
              className={`w-2 h-2 rounded-full transition-all ${
                idx === currentSectionIndex
                  ? 'scale-125'
                  : 'opacity-40 hover:opacity-70'
              }`}
              style={{ backgroundColor: textColor }}
            />
          ))}
        </div>

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
            {currentSection.label}
          </div>

          {/* Section items */}
          <div
            className="ticker-items flex-1 flex items-center gap-2 sm:gap-4 px-3 sm:px-4 overflow-x-auto"
            style={{
              scrollbarWidth: 'none', /* Firefox */
              msOverflowStyle: 'none', /* IE/Edge */
            }}
          >
            {currentSection.items.map((item, idx) => (
              <div key={item.id || idx} className="flex items-center gap-2 sm:gap-3 whitespace-nowrap">
                {idx > 0 && (
                  <span
                    className="text-lg opacity-30"
                    style={{ color: textColor }}
                  >
                    •
                  </span>
                )}

                <div
                  className={`flex items-center gap-1.5 sm:gap-2 ${item.link ? 'cursor-pointer hover:opacity-70 transition-opacity' : ''}`}
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
              </div>
            ))}
          </div>
        </div>

        {/* Pause indicator and Navigation arrows */}
        <div className="flex items-center gap-1 px-2 h-full border-l border-white/20">
          {isPaused && (
            <div className="px-1 opacity-60" style={{ color: textColor }}>
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
              </svg>
            </div>
          )}
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
