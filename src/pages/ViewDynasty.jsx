import { useState, useEffect, Suspense } from 'react'
import { useParams, Outlet, Link } from 'react-router-dom'
import RouteFallback from '../components/RouteFallback'
import { ViewDynastyProvider, useViewDynasty } from '../context/ViewDynastyContext'
import { useTeamColors } from '../hooks/useTeamColors'
import { getTeamLogo } from '../data/teams'
import Sidebar from '../components/Sidebar'
import NewsTicker from '../components/NewsTicker/NewsTicker'
import logo from '../assets/logo.png'
import { Card, Button, Badge, LoadingState } from '../components/ui'

const isDesktop = () => typeof window !== 'undefined' && window.innerWidth >= 1024

// On mobile/tablet always start closed — desktop's saved "open" preference
// shouldn't leak onto small viewports where the overlay would block the page.
const getInitialSidebarState = () => {
  if (!isDesktop()) return false
  const saved = localStorage.getItem('sidebarOpen')
  if (saved !== null) return saved === 'true'
  return true
}

function ViewDynastyContent() {
  const { shareCode } = useParams()
  const { currentDynasty, loading, error } = useViewDynasty()
  const [sidebarOpen, setSidebarOpen] = useState(getInitialSidebarState)
  const teamColors = useTeamColors(currentDynasty?.teamName, currentDynasty?.teams || currentDynasty?.customTeams)

  useEffect(() => {
    localStorage.setItem('sidebarOpen', String(sidebarOpen))
  }, [sidebarOpen])

  useEffect(() => {
    window.toggleDynastySidebar = () => setSidebarOpen(prev => !prev)
    return () => {
      delete window.toggleDynastySidebar
    }
  }, [])

  if (loading) {
    return (
      <div className="min-h-dvh bg-surface-1 flex items-center justify-center">
        <LoadingState message="Loading dynasty..." />
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-dvh bg-surface-1 flex items-center justify-center p-4">
        <Card className="max-w-md text-center">
          <h1 className="display-md text-txt-primary mb-2">Dynasty Not Available</h1>
          <p className="text-txt-secondary mb-6">{error}</p>
          <Link to="/">
            <Button variant="primary">Go to Home</Button>
          </Link>
        </Card>
      </div>
    )
  }

  if (!currentDynasty) {
    return null
  }

  const teamLogo = getTeamLogo(currentDynasty.teamName, currentDynasty?.teams || currentDynasty?.customTeams)

  const phaseLong =
    currentDynasty.currentPhase === 'postseason'
      ? (currentDynasty.currentWeek === 5 ? 'End of Season Recap' : (currentDynasty.currentWeek === 4 ? 'National Championship' : `Bowl Week ${currentDynasty.currentWeek}`))
      : currentDynasty.currentPhase === 'offseason'
      ? (currentDynasty.currentWeek === 1 ? 'Players Leaving' : (currentDynasty.currentWeek === 5 ? 'National Signing Day' : (currentDynasty.currentWeek >= 2 && currentDynasty.currentWeek <= 4 ? `Recruiting Week ${currentDynasty.currentWeek - 1} of 4` : 'Off-Season')))
      : currentDynasty.currentPhase === 'preseason' ? 'Pre-Season'
      : currentDynasty.currentPhase === 'regular_season' ? 'Regular Season'
      : currentDynasty.currentPhase === 'conference_championship' ? 'Conference Championships'
      : currentDynasty.currentPhase

  const phaseShort =
    currentDynasty.currentPhase === 'conference_championship' ? 'CC' :
    currentDynasty.currentPhase === 'regular_season' ? `Wk ${currentDynasty.currentWeek}` :
    currentDynasty.currentPhase === 'postseason' ? (currentDynasty.currentWeek === 5 ? 'Recap' : (currentDynasty.currentWeek === 4 ? 'Champ' : `Bowl ${currentDynasty.currentWeek}`)) :
    currentDynasty.currentPhase === 'preseason' ? 'Pre' :
    currentDynasty.currentPhase === 'offseason' ? (currentDynasty.currentWeek === 1 ? 'Leaving' : `Rec ${currentDynasty.currentWeek - 1}`) : ''

  return (
    <div className="min-h-dvh bg-surface-1">
      <header
        className="sticky top-0 z-50"
        style={{
          backgroundColor: 'var(--surface-1)',
          borderBottom: '1px solid var(--surface-4)',
        }}
      >
        <div
          className="h-[3px] w-full"
          style={{ backgroundColor: 'var(--team-primary)' }}
          aria-hidden="true"
        />
        <div className="w-full px-2 sm:px-4">
          <div className="flex items-center justify-between py-3 gap-4">
            <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
              <button
                onClick={() => setSidebarOpen(prev => !prev)}
                className="p-2 rounded-lg hover:bg-surface-3 transition-colors text-txt-primary"
                aria-label="Toggle sidebar"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              <Link to="/" className="flex-shrink-0">
                <img src={logo} alt="Dynasty Tracker" className="h-10 sm:h-12 object-contain" />
              </Link>
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2 md:gap-4 flex-1 justify-center min-w-0">
              <div className="flex items-center gap-1.5 sm:gap-2 md:gap-3 flex-shrink-0">
                {teamLogo && (
                  <img
                    src={teamLogo}
                    alt={`${currentDynasty.teamName} logo`}
                    className="w-7 h-7 sm:w-9 sm:h-9 md:w-10 md:h-10 object-contain flex-shrink-0"
                  />
                )}
                <span className="font-bold text-lg hidden xl:inline text-txt-primary">
                  {currentDynasty.teamName}
                </span>
              </div>

              <span className="hidden xl:inline text-txt-tertiary">•</span>

              <span className="font-semibold text-xs sm:text-sm md:text-base text-txt-primary tabular">
                {currentDynasty.currentYear}
              </span>

              <span className="text-xs sm:text-sm text-txt-tertiary">•</span>

              <div className="flex items-center gap-1 md:gap-2 min-w-0">
                <span className="font-medium text-xs sm:text-sm md:text-base truncate text-txt-secondary">
                  <span className="sm:hidden">{phaseShort}</span>
                  <span className="hidden sm:inline">{phaseLong}</span>
                </span>
                {currentDynasty.currentPhase !== 'postseason' && currentDynasty.currentPhase !== 'offseason' && currentDynasty.currentPhase !== 'conference_championship' && (
                  <span className="text-xs md:text-sm hidden sm:inline text-txt-tertiary tabular">
                    Week {currentDynasty.currentWeek}
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Link
                to={`/view/${shareCode}`}
                className="p-2 rounded-lg hover:bg-surface-3 transition-colors text-txt-primary"
                title="Dashboard"
              >
                <svg className="w-4 h-4 md:w-5 md:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                </svg>
              </Link>

              <Badge variant="outline" size="sm">View Only</Badge>
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

      <main
        className={`min-w-0 flex-1 px-4 py-6 transition-[margin] duration-300 ${sidebarOpen ? 'lg:ml-56' : ''}`}
        style={{ paddingBottom: 'calc(56px + env(safe-area-inset-bottom, 0px))' }}
      >
        <Suspense fallback={<RouteFallback />}>
          <Outlet />
        </Suspense>
      </main>

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
