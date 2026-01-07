import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { getContrastTextColor } from '../utils/colorUtils'
import { useDynasty, getCurrentCustomConferences } from '../context/DynastyContext'
import { getAbbreviationFromDisplayName } from '../data/teamAbbreviations'
import { getTeamConference } from '../data/conferenceTeams'
import ShareDynastyModal from './ShareDynastyModal'

export default function Sidebar({ isOpen, onClose, dynastyId, teamColors, currentYear, isViewOnly, shareCode, dynasty: dynastyProp }) {
  const location = useLocation()
  const navigate = useNavigate()
  // Use dynasty from props if provided (view mode), otherwise from context
  let contextDynasty, exportDynasty
  try {
    const dynastyContext = useDynasty()
    contextDynasty = dynastyContext.currentDynasty
    exportDynasty = dynastyContext.exportDynasty
  } catch (e) {
    // Not in DynastyProvider (view mode)
    contextDynasty = null
    exportDynasty = null
  }
  const currentDynasty = dynastyProp || contextDynasty
  const [showShareModal, setShowShareModal] = useState(false)
  const [copying, setCopying] = useState(false)
  const primaryBgText = getContrastTextColor(teamColors.primary)
  const secondaryBgText = getContrastTextColor(teamColors.secondary)

  // Get current team abbreviation for recruiting link
  const teamAbbr = getAbbreviationFromDisplayName(currentDynasty?.teamName) || currentDynasty?.teamName || ''

  // Get user's conference for all-conference link (using custom conferences if available)
  const customConferences = getCurrentCustomConferences(currentDynasty)
  const userConference = getTeamConference(teamAbbr, customConferences) || 'SEC'
  const conferenceUrlParam = encodeURIComponent(userConference.replace(/\s+/g, '-'))

  const handleExport = () => {
    if (!exportDynasty) return
    try {
      exportDynasty(dynastyId)
    } catch (error) {
      console.error('Error exporting dynasty:', error)
      alert('Failed to export dynasty. Please try again.')
    }
  }

  const handleCopyDynasty = () => {
    if (!currentDynasty || copying) return
    setCopying(true)

    // Create a copy of the dynasty data, removing share-specific and ID fields
    const dynastyCopy = { ...currentDynasty }
    delete dynastyCopy.id
    delete dynastyCopy.shareCode
    delete dynastyCopy.isPublic
    delete dynastyCopy.userId
    delete dynastyCopy.createdAt
    delete dynastyCopy.lastModified

    // Store the copy in localStorage for the create page to pick up
    localStorage.setItem('dynastyCopyData', JSON.stringify(dynastyCopy))

    // Navigate to home page with a flag indicating we have a copy
    navigate('/?importCopy=true')
    setCopying(false)
  }

  // Build path prefix based on view mode
  const pathPrefix = isViewOnly ? `/view/${shareCode}` : `/dynasty/${dynastyId}`

  const navItems = [
    { name: 'Dashboard', path: pathPrefix },
    { name: 'Coach Career', path: `${pathPrefix}/coach-career` },
    { name: 'Leaderboard', path: `${pathPrefix}/dynasty-records` },
    { name: 'Recruiting', path: `${pathPrefix}/recruiting/${teamAbbr}/${currentYear}` },
    { name: 'Awards', path: `${pathPrefix}/awards` },
    { name: 'All-Americans', path: `${pathPrefix}/all-americans` },
    { name: 'All-Conference', path: `${pathPrefix}/all-conference/${currentYear}/${conferenceUrlParam}` },
    { name: 'CFP Bracket', path: `${pathPrefix}/cfp-bracket` },
    { name: 'Bowl History', path: `${pathPrefix}/bowl-history` },
    { name: 'CC History', path: `${pathPrefix}/conference-championship-history` },
    { name: 'Conf. Standings', path: `${pathPrefix}/conference-standings` },
    { name: 'Top 25', path: `${pathPrefix}/rankings` },
    { name: 'All Teams', path: `${pathPrefix}/teams` },
    { name: 'All Players', path: `${pathPrefix}/players` },
    { name: 'Danger Zone', path: `${pathPrefix}/admin`, isAdmin: true }
  ]

  const isActive = (path) => {
    if (path === pathPrefix) {
      return location.pathname === path
    }
    return location.pathname.startsWith(path)
  }

  return (
    <>
      {/* Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
          onMouseDown={onClose}
        />
      )}

      {/* Sidebar - Fixed on left edge, full height on mobile, below header on desktop */}
      <aside
        className={`fixed left-0 z-40 transition-transform duration-300 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        } lg:translate-x-0 w-56 shadow-lg overflow-y-auto top-0 h-full lg:top-[64px] lg:h-[calc(100vh-64px)]`}
        style={{ backgroundColor: teamColors.secondary }}
      >
        {/* Close button - mobile only */}
        <div className="lg:hidden flex items-center p-4 border-b" style={{ borderColor: `${secondaryBgText}20` }}>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:opacity-70"
            style={{ color: secondaryBgText }}
            aria-label="Close sidebar"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>

        {/* Navigation - extra bottom padding for ticker (48px) */}
        <nav className="px-4 pt-4 pb-24 lg:pb-16">
          <div className="space-y-1">
            {navItems.filter(item => !item.isAdmin).map((item) => {
              const active = isActive(item.path)
              return (
                <Link
                  key={item.name}
                  to={item.path}
                  onClick={onClose}
                  className={`block px-4 py-2.5 rounded-lg font-medium transition-all ${
                    active ? 'shadow-md' : 'hover:opacity-70'
                  }`}
                  style={
                    active
                      ? {
                          backgroundColor: teamColors.primary,
                          color: primaryBgText
                        }
                      : {
                          color: secondaryBgText,
                          opacity: 0.8
                        }
                  }
                >
                  {item.name}
                </Link>
              )
            })}
          </div>

          {/* Admin Tools Section - separated at bottom */}
          {!isViewOnly && (
            <div className="mt-4 pt-4 border-t" style={{ borderColor: `${secondaryBgText}20` }}>
              {navItems.filter(item => item.isAdmin).map((item) => {
                const active = isActive(item.path)
                return (
                  <Link
                    key={item.name}
                    to={item.path}
                    onClick={onClose}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium transition-all text-sm ${
                      active ? 'shadow-md' : 'hover:opacity-70'
                    }`}
                    style={
                      active
                        ? {
                            backgroundColor: teamColors.primary,
                            color: primaryBgText
                          }
                        : {
                            color: secondaryBgText,
                            opacity: 0.6
                          }
                    }
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    {item.name}
                  </Link>
                )
              })}
            </div>
          )}

          {/* Bottom section - different for view mode vs edit mode */}
          <div className="mt-4 pt-4 border-t" style={{ borderColor: `${secondaryBgText}20` }}>
            {isViewOnly ? (
              /* View mode - show Copy Dynasty button and Create Your Own Dynasty CTA */
              <>
                <button
                  onClick={handleCopyDynasty}
                  disabled={copying}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-semibold transition-all hover:opacity-90"
                  style={{
                    backgroundColor: teamColors.primary,
                    color: primaryBgText,
                    opacity: copying ? 0.7 : 1
                  }}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  <span>{copying ? 'Copying...' : 'Copy to My Dynasties'}</span>
                </button>

                <Link
                  to="/"
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-semibold transition-all hover:opacity-90 mt-2"
                  style={{
                    backgroundColor: teamColors.primary,
                    color: primaryBgText
                  }}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  <span>Create My Own Dynasty</span>
                </Link>
              </>
            ) : (
              /* Edit mode - show Download and Share buttons */
              <>
                <button
                  onClick={handleExport}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-all hover:opacity-70"
                  style={{
                    color: secondaryBgText,
                    opacity: 0.8,
                    backgroundColor: 'transparent',
                    border: `2px solid ${teamColors.primary}`
                  }}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  <span>Download Backup</span>
                </button>

                <button
                  onClick={() => setShowShareModal(true)}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-all hover:opacity-70 mt-2"
                  style={{
                    color: secondaryBgText,
                    opacity: 0.8,
                    backgroundColor: 'transparent',
                    border: `2px solid ${teamColors.primary}`
                  }}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                  </svg>
                  <span>Share Dynasty</span>
                </button>
              </>
            )}
          </div>
        </nav>
      </aside>

      {/* Share Dynasty Modal - only in edit mode */}
      {!isViewOnly && (
        <ShareDynastyModal
          isOpen={showShareModal}
          onClose={() => setShowShareModal(false)}
          teamColors={teamColors}
        />
      )}
    </>
  )
}
