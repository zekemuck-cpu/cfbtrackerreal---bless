import { useEffect, useState } from 'react'
import { useParams, useNavigate, Outlet } from 'react-router-dom'
import { useDynasty } from '../context/DynastyContext'
import { useTeamColors } from '../hooks/useTeamColors'
import Sidebar from '../components/Sidebar'
import NewsTicker from '../components/NewsTicker/NewsTicker'

export default function DynastyDashboard() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { dynasties, currentDynasty, selectDynasty } = useDynasty()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const teamColors = useTeamColors(currentDynasty?.teamName, currentDynasty?.teams || currentDynasty?.customTeams)

  useEffect(() => {
    if (id && (!currentDynasty || currentDynasty.id !== id)) {
      selectDynasty(id)
    }
  }, [id, currentDynasty, selectDynasty])

  useEffect(() => {
    // Only redirect if:
    // 1. Dynasties are loaded
    // 2. No currentDynasty is set
    // 3. The requested dynasty ID doesn't exist in the dynasties list (invalid ID)
    // This prevents redirecting during the brief moment between selectDynasty call and state update
    if (dynasties.length > 0 && !currentDynasty) {
      const requestedDynastyExists = id && dynasties.some(d => d.id === id)
      if (!requestedDynastyExists) {
        navigate('/')
      }
    }
  }, [dynasties, currentDynasty, navigate, id])

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
      <div className={`min-w-0 pb-14 transition-[margin] duration-300 ${sidebarOpen ? 'lg:ml-56' : ''}`}>
        <Outlet />
      </div>

      {/* News ticker at bottom */}
      <NewsTicker dynasty={currentDynasty} />
    </>
  )
}
