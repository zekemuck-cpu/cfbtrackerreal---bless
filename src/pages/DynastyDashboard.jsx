import { useEffect, useState, Suspense } from 'react'
import { useParams, useNavigate, Outlet } from 'react-router-dom'
import RouteFallback from '../components/RouteFallback'
import { useDynasty } from '../context/DynastyContext'
import { useTeamColors } from '../hooks/useTeamColors'
import Sidebar from '../components/Sidebar'
import NewsTicker from '../components/NewsTicker/NewsTicker'
import TeamSwitcher from '../components/TeamSwitcher'
import MemberOnboardingModal from '../components/MemberOnboardingModal'
import ScoutStaff from '../components/ScoutStaff';


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

// Delays mounting the NewsTicker until after the rest of the dashboard
// has painted. The ticker's section computation is heavy (per-player
// × per-year × per-stat-category aggregation, plus career leaderboards
// and hot-streak detection) — running it during the initial route
// paint blocked the main thread for hundreds of ms on big rosters.
// Mounting it after a microtask lets the user see and interact with
// the dashboard immediately; the ticker fills in after.
function DeferredNewsTicker({ dynasty }) {
  const [show, setShow] = useState(false)
  useEffect(() => {
    // Use requestIdleCallback when available (Chrome / Firefox) so the
    // ticker mount competes for idle time rather than the next frame.
    // Safari / old browsers fall back to setTimeout(0) which still
    // pushes the work past the initial paint.
    const idle = window.requestIdleCallback
      ? window.requestIdleCallback(() => setShow(true), { timeout: 800 })
      : window.setTimeout(() => setShow(true), 0)
    return () => {
      if (window.requestIdleCallback && window.cancelIdleCallback) {
        window.cancelIdleCallback(idle)
      } else {
        window.clearTimeout(idle)
      }
    }
  }, [])
  if (!show) return null
  return <NewsTicker dynasty={dynasty} />
}

export default function DynastyDashboard() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { dynasties, currentDynasty, selectDynasty, cloudSyncing, loading } = useDynasty()
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
    // Wait for BOTH initial load to settle AND cloud sync to finish
    // before deciding to redirect. Refreshing on /dynasty/:id is the
    // motivating case — without these guards, the effect fires on
    // mount with dynasties=[] and bounces the user home before the
    // listener even subscribes. `loading` covers the first-render
    // window; `cloudSyncing` covers the cloud-snapshot window. Only
    // when both are settled and the dynasty is genuinely absent from
    // every list do we treat this as a real 404.
    if (loading) return
    if (cloudSyncing) return
    if (currentDynasty) return
    const requestedDynastyExists = id && dynasties.some(d => d.id === id)
    if (!requestedDynastyExists) {
      navigate('/')
    }
  }, [loading, cloudSyncing, dynasties, currentDynasty, navigate, id])

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
        <ScoutStaff />
        <Outlet />
      </Suspense>

      {/* Team switcher (visible when user controls 2+ teams) */}
      <TeamSwitcher />

      {/* News ticker at bottom — mounted after the rest of the dashboard
          has painted so the ticker's heavy section computation
          (iterates every player × year × stat category, can be
          100–500ms on a big roster) doesn't block the initial route
          paint. Once mounted, useDeferredValue inside the ticker keeps
          subsequent recomputes off the urgent render path. */}
      <DeferredNewsTicker dynasty={currentDynasty} />

      {/* Onboarding for freshly-joined members. Self-gates on whether
          this user needs it (in editors[], no team, not dismissed). */}
      <MemberOnboardingModal />
    </>
  )
}
