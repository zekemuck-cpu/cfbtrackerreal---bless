import { useState, useEffect } from 'react'
import { useParams, Outlet, Link } from 'react-router-dom'
import { ViewDynastyProvider, useViewDynasty } from '../context/ViewDynastyContext'
import { useTeamColors } from '../hooks/useTeamColors'
import { getContrastTextColor } from '../utils/colorUtils'
import { getMascotName, getTeamLogo } from '../data/teams'
import Sidebar from '../components/Sidebar'
import NewsTicker from '../components/NewsTicker/NewsTicker'
import logo from '../assets/logo.png'

// Check if we're on a desktop-sized screen
const isDesktop = () => typeof window !== 'undefined' && window.innerWidth >= 1024

// Get initial sidebar state from localStorage or default based on screen size
const getInitialSidebarState = () => {
  const saved = localStorage.getItem('sidebarOpen')
  if (saved !== null) {
    return saved === 'true'
  }
  // Default: open on desktop, closed on mobile
  return isDesktop()
}

function ViewDynastyContent() {
  const { shareCode } = useParams()
  const { currentDynasty, loading, error } = useViewDynasty()
  const [sidebarOpen, setSidebarOpen] = useState(getInitialSidebarState)
  const teamColors = useTeamColors(currentDynasty?.teamName, currentDynasty?.teams || currentDynasty?.customTeams)

  // Save sidebar preference to localStorage when it changes
  useEffect(() => {
    localStorage.setItem('sidebarOpen', String(sidebarOpen))
  }, [sidebarOpen])

  // Expose sidebar toggle (similar to DynastyDashboard)
  useEffect(() => {
    window.toggleDynastySidebar = () => setSidebarOpen(prev => !prev)
    return () => {
      delete window.toggleDynastySidebar
    }
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-white text-lg">Loading dynasty...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Dynasty Not Available</h1>
          <p className="text-gray-400 mb-6">{error}</p>
          <Link
            to="/"
            className="inline-block px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-500 transition-colors"
          >
            Go to Home
          </Link>
        </div>
      </div>
    )
  }

  if (!currentDynasty) {
    return null
  }

  const primaryBgText = getContrastTextColor(teamColors.primary)

  return (
    <div className="min-h-screen bg-gray-900">
      {/* Header bar - matches Layout header style */}
      <header
        className="sticky top-0 z-50 shadow-sm"
        style={{
          backgroundColor: teamColors.primary,
          borderBottom: `3px solid ${teamColors.secondary}`
        }}
      >
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between py-3 gap-4">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setSidebarOpen(prev => !prev)}
                className="p-2 rounded-lg hover:opacity-70 transition-opacity"
                style={{ color: primaryBgText }}
                aria-label="Toggle sidebar"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>

              <Link to="/">
                <img src={logo} alt="Dynasty Tracker" className="h-10 sm:h-12 object-contain" />
              </Link>
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2 md:gap-4 flex-1 justify-center min-w-0">
              {/* Team Logo and Name */}
              <div className="flex items-center gap-1.5 sm:gap-2 md:gap-3 flex-shrink-0">
                {getTeamLogo(currentDynasty.teamName) && (
                  <div
                    className="w-7 h-7 sm:w-9 sm:h-9 md:w-10 md:h-10 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{
                      backgroundColor: '#FFFFFF',
                      border: `2px solid ${teamColors.secondary}`,
                      padding: '2px'
                    }}
                  >
                    <img
                      src={getTeamLogo(currentDynasty.teamName)}
                      alt={`${currentDynasty.teamName} logo`}
                      className="w-full h-full object-contain"
                    />
                  </div>
                )}
                <span className="font-bold text-lg hidden xl:inline" style={{ color: primaryBgText }}>
                  {currentDynasty.teamName}
                </span>
              </div>

              {/* Separator - only show when team name is visible */}
              <span className="hidden xl:inline" style={{ color: primaryBgText, opacity: 0.5 }}>•</span>

              {/* Year */}
              <div className="flex items-center">
                <span className="font-semibold text-xs sm:text-sm md:text-base" style={{ color: primaryBgText }}>
                  {currentDynasty.currentYear}
                </span>
              </div>

              {/* Separator */}
              <span className="text-xs sm:text-sm" style={{ color: primaryBgText, opacity: 0.5 }}>•</span>

              {/* Phase and Week - abbreviated on mobile */}
              <div className="flex items-center gap-1 md:gap-2 min-w-0">
                <span className="font-medium text-xs sm:text-sm md:text-base truncate" style={{ color: primaryBgText }}>
                  <span className="sm:hidden">
                    {currentDynasty.currentPhase === 'conference_championship' ? 'CC' :
                     currentDynasty.currentPhase === 'regular_season' ? 'Wk' :
                     currentDynasty.currentPhase === 'postseason' ? (currentDynasty.currentWeek === 5 ? 'Recap' : (currentDynasty.currentWeek === 4 ? 'Champ' : 'Bowl')) :
                     currentDynasty.currentPhase === 'preseason' ? 'Pre' :
                     currentDynasty.currentPhase === 'offseason' ? (currentDynasty.currentWeek === 1 ? 'Leaving' : `Rec ${currentDynasty.currentWeek - 1}`) : ''}
                    {currentDynasty.currentPhase !== 'conference_championship' && currentDynasty.currentPhase !== 'postseason' && currentDynasty.currentPhase !== 'offseason' && ` ${currentDynasty.currentWeek}`}
                    {currentDynasty.currentPhase === 'postseason' && currentDynasty.currentWeek < 4 && ` ${currentDynasty.currentWeek}`}
                  </span>
                  <span className="hidden sm:inline">
                    {currentDynasty.currentPhase === 'postseason'
                      ? (currentDynasty.currentWeek === 5 ? 'End of Season Recap' : (currentDynasty.currentWeek === 4 ? 'National Championship' : `Bowl Week ${currentDynasty.currentWeek}`))
                      : currentDynasty.currentPhase === 'offseason'
                      ? (currentDynasty.currentWeek === 1 ? 'Players Leaving' : (currentDynasty.currentWeek === 5 ? 'National Signing Day' : (currentDynasty.currentWeek >= 2 && currentDynasty.currentWeek <= 4 ? `Recruiting Week ${currentDynasty.currentWeek - 1} of 4` : 'Off-Season')))
                      : currentDynasty.currentPhase === 'preseason' ? 'Pre-Season'
                      : currentDynasty.currentPhase === 'regular_season' ? 'Regular Season'
                      : currentDynasty.currentPhase === 'conference_championship' ? 'Conference Championships'
                      : currentDynasty.currentPhase}
                  </span>
                </span>
                {currentDynasty.currentPhase !== 'postseason' && currentDynasty.currentPhase !== 'offseason' && currentDynasty.currentPhase !== 'conference_championship' && (
                  <span className="text-xs md:text-sm hidden sm:inline" style={{ color: primaryBgText, opacity: 0.8 }}>
                    Week {currentDynasty.currentWeek}
                  </span>
                )}
              </div>
            </div>

            {/* Right side - Home button and View Only badge */}
            <div className="flex items-center gap-2">
              {/* Home Button */}
              <Link
                to={`/view/${shareCode}`}
                className="p-1.5 md:p-2 rounded-lg font-semibold hover:opacity-90 transition-colors shadow-sm"
                style={{
                  backgroundColor: teamColors.secondary,
                  color: getContrastTextColor(teamColors.secondary)
                }}
                title="Dashboard"
              >
                <svg className="w-4 h-4 md:w-5 md:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                </svg>
              </Link>

              {/* View Only badge */}
              <div
                className="px-2 md:px-3 py-1 md:py-1.5 rounded-full text-xs md:text-sm font-medium"
                style={{ backgroundColor: 'rgba(0,0,0,0.2)', color: primaryBgText }}
              >
                View Only
              </div>
            </div>
          </div>
        </div>
      </header>

      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        teamColors={teamColors}
        currentYear={currentDynasty.currentYear}
        isViewOnly={true}
        shareCode={shareCode}
        dynasty={currentDynasty}
      />

      {/* Main content - on desktop (lg+), add left margin when sidebar is open to push content */}
      {/* On mobile/tablet, sidebar overlays so no margin needed */}
      {/* Bottom padding accounts for ticker height (48px) + safe area for phones with home indicators */}
      <main
        className={`min-w-0 flex-1 px-4 py-6 transition-[margin] duration-300 ${sidebarOpen ? 'lg:ml-56' : ''}`}
        style={{ paddingBottom: 'calc(56px + env(safe-area-inset-bottom, 0px))' }}
      >
        <Outlet />
      </main>

      {/* News ticker at bottom */}
      <NewsTicker dynasty={currentDynasty} />
    </div>
  )
}

export default function ViewDynasty() {
  const { shareCode } = useParams()

  return (
    <ViewDynastyProvider shareCode={shareCode}>
      <ViewDynastyContent />
    </ViewDynastyProvider>
  )
}
