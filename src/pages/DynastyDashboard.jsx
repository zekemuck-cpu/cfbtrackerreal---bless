import { useEffect, useState, Suspense } from 'react'
import { useParams, useNavigate, Outlet } from 'react-router-dom'
import RouteFallback from '../components/RouteFallback'
import { useDynasty } from '../context/DynastyContext'
import { useTeamColors } from '../hooks/useTeamColors'
import Sidebar from '../components/Sidebar'
import NewsTicker from '../components/NewsTicker/NewsTicker'
import TeamSwitcher from '../components/TeamSwitcher'

// Check if we're on a desktop-sized screen
const isDesktop = () => typeof window !== 'undefined' && window.innerWidth >= 1024

// Get initial sidebar state. On mobile/tablet ALWAYS start closed — the
// sidebar is an overlay that would block the page, and the desktop-saved
// "open" preference shouldn't leak onto small viewports where a bursting
// overlay on arrival is hostile.
const getInitialSidebarState = () => {
  if (!isDesktop()) return false
  const saved = localStorage.getItem('sidebarOpen')
  if (saved !== null) return saved === 'true'
  return true
}

export default function DynastyDashboard() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { dynasties, currentDynasty, selectDynasty, loading } = useDynasty()
  const [sidebarOpen, setSidebarOpen] = useState(getInitialSidebarState)

  const teamColors = useTeamColors(currentDynasty?.teamName, currentDynasty?.teams || currentDynasty?.customTeams)

  // Save sidebar preference to localStorage when it changes
  useEffect(() => {
    localStorage.setItem('sidebarOpen', String(sidebarOpen))
  }, [sidebarOpen])

  useEffect(() => {
    if (id && (!currentDynasty || currentDynasty.id !== id)) {
      selectDynasty(id)
    }
  }, [id, currentDynasty, selectDynasty, dynasties])

  useEffect(() => {
    // Only redirect if dynasties have FULLY loaded (loading=false flips after
    // both local + cloud have resolved) AND the requested ID isn't in the
    // list. The previous check fired the moment local-only dynasties loaded,
    // racing the cloud subscription — refresh on a cloud dynasty page would
    // briefly see [local-only], not find the cloud ID, and bounce home.
    if (loading) return
    if (currentDynasty) return
    const requestedDynastyExists = id && dynasties.some(d => d.id === id)
    if (!requestedDynastyExists) {
      navigate('/')
    }
  }, [loading, dynasties, currentDynasty, navigate, id])

  // Expose sidebar toggle to parent (Layout)
  useEffect(() => {
    window.toggleDynastySidebar = () => setSidebarOpen(prev => !prev)
    return () => {
      delete window.toggleDynastySidebar
    }
  }, [])

  if (!currentDynasty) {
    return null
  }

  return (
    <>
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        dynastyId={currentDynasty.id}
        teamColors={teamColors}
        currentYear={currentDynasty.currentYear}
      />

      {/* Main content - on desktop (lg+), add left margin when sidebar is open to push content */}
      {/* On mobile/tablet, sidebar overlays so no margin needed */}
      {/* Bottom padding accounts for ticker height (48px) + safe area for phones with home indicators */}
      <div
        className={`min-w-0 transition-[margin] duration-300 ${sidebarOpen ? 'lg:ml-56' : ''}`}
        style={{ paddingBottom: 'calc(56px + env(safe-area-inset-bottom, 0px))' }}
      >
        <Suspense fallback={<RouteFallback />}>
          <Outlet />
        </Suspense>
      </div>

      {/* Team switcher (visible when user controls 2+ teams) */}
      <TeamSwitcher />

      {/* News ticker at bottom */}
      <NewsTicker dynasty={currentDynasty} />
    </>
  )
}
