import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useDynasty, getCurrentCustomConferences } from '../context/DynastyContext'
import { getTeamConference } from '../data/conferenceTeams'
import { TEAMS, getTidFromTeamName } from '../data/teamRegistry'
import { isEditor } from '../data/leagueModel'
import ShareDynastyModal from './ShareDynastyModal'
import { useToast } from './ui'
import { preloadByNavName } from '../routes/lazyPages'
import { useAuth } from '../context/AuthContext'

export default function Sidebar({ isOpen, onClose, dynastyId, teamColors, currentYear, isViewOnly, shareCode, dynasty: dynastyProp }) {
  const location = useLocation()
  const navigate = useNavigate()
  const { toast } = useToast()
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
  const { isPremium, user } = useAuth()
  const [showShareModal, setShowShareModal] = useState(false)
  const [copying, setCopying] = useState(false)

  // Get current team tid - prefer currentTid (new), fallback to lookup (old)
  const teamsSource = currentDynasty?.teams || TEAMS
  const teamTid = currentDynasty?.currentTid || getTidFromTeamName(currentDynasty?.teamName, teamsSource)

  // Get team abbreviation from tid - this will be the custom abbr for teambuilder teams
  const team = teamsSource[teamTid]
  const teamAbbr = team?.abbr || ''

  // For conference lookup, use the ORIGINAL team's abbreviation (from static TEAMS)
  const originalTeamAbbr = TEAMS[teamTid]?.abbr || teamAbbr

  const customConferences = getCurrentCustomConferences(currentDynasty)
  const userConference = getTeamConference(originalTeamAbbr, customConferences) || 'SEC'
  const conferenceUrlParam = encodeURIComponent(userConference.replace(/\s+/g, '-'))

  const handleExport = () => {
    if (!exportDynasty) return
    try {
      exportDynasty(dynastyId)
    } catch (error) {
      console.error('Error exporting dynasty:', error)
      toast.error('Failed to export dynasty. Please try again.')
    }
  }

  const handleCopyDynasty = () => {
    if (!currentDynasty || copying) return
    setCopying(true)

    const dynastyCopy = { ...currentDynasty }
    delete dynastyCopy.id
    delete dynastyCopy.shareCode
    delete dynastyCopy.isPublic
    delete dynastyCopy.userId
    delete dynastyCopy.createdAt
    delete dynastyCopy.lastModified

    localStorage.setItem('dynastyCopyData', JSON.stringify(dynastyCopy))
    navigate('/?importCopy=true')
    setCopying(false)
  }

  const pathPrefix = isViewOnly ? `/view/${shareCode}` : `/dynasty/${dynastyId}`

  // Members link: visible to anyone with edit access (commish + members).
  // Action buttons inside the page are gated separately by role.
  const userCanSeeMembers = !isViewOnly && user && isEditor(currentDynasty, user.uid)

  // Coaches leaderboard appears only when the dynasty has more than one
  // member. For solo dynasties it's redundant with the Coach Career page.
  const totalEditors = (currentDynasty?.editors?.length || 0)
    + (currentDynasty?.userId && !(currentDynasty.editors || []).includes(currentDynasty.userId) ? 1 : 0)
  const showCoachesLink = totalEditors > 1

  const navItems = [
    { name: 'Dashboard', path: pathPrefix },
    { name: 'Weekly Recap', path: `${pathPrefix}/weekly-scores` },
    { name: 'Top 25', path: `${pathPrefix}/rankings` },
    { name: 'CFP Bracket', path: `${pathPrefix}/cfp-bracket` },
    { name: 'Conf. Standings', path: `${pathPrefix}/conference-standings` },
    { name: 'Recruiting', path: `${pathPrefix}/recruiting/${teamTid}/${currentYear}` },
    { name: 'Scout Staff', path: `${pathPrefix}/scout-staff` },
    { name: 'Coach Career', path: `${pathPrefix}/coach-career` },
    { name: 'Leaderboard', path: `${pathPrefix}/dynasty-records` },
    { name: 'Bowl History', path: `${pathPrefix}/bowl-history` },
    { name: 'CC History', path: `${pathPrefix}/conference-championship-history` },
    { name: 'Awards', path: `${pathPrefix}/awards` },
    { name: 'All-Americans', path: `${pathPrefix}/all-americans` },
    { name: 'All-Conference', path: `${pathPrefix}/all-conference/${currentYear}/${conferenceUrlParam}` },
    { name: 'All-Time Team', path: `${pathPrefix}/all-time-lineup` },
    { name: 'All Teams', path: `${pathPrefix}/teams` },
    { name: 'All Players', path: `${pathPrefix}/players` },
    { name: 'Card Collection', path: `${pathPrefix}/cards` },
    ...(showCoachesLink ? [{ name: 'Coaches', path: `${pathPrefix}/coaches` }] : []),
    ...(!isViewOnly ? [{ name: 'AI Prompts', path: `${pathPrefix}/ai-prompts` }] : []),
    ...(userCanSeeMembers ? [{ name: 'Members', path: `${pathPrefix}/league`, isAdmin: true }] : []),
    { name: 'Danger Zone', path: `${pathPrefix}/admin`, isAdmin: true }
  ]

  const isActive = (path) => {
    if (path === pathPrefix) {
      return location.pathname === path || location.pathname === `${path}/`
    }
    // Match on the route's first segment after pathPrefix, ignoring params baked
    // into the link href (e.g. Recruiting and All-Conference embed teamTid /
    // currentYear / conference). A pure exact-or-startsWith check would either
    // miss those pages when the user is on a different team/year, or wrongly
    // light up multiple links sharing a prefix (e.g. "/teams" vs "/team-year").
    const baseSegments = pathPrefix.split('/').length
    const segmentRoot = path.split('/').slice(0, baseSegments + 1).join('/')
    return location.pathname === segmentRoot || location.pathname.startsWith(`${segmentRoot}/`)
  }

  // Media query matching Tailwind's `lg` breakpoint. matchMedia is more
  // reliable than inline window.innerWidth on mobile Safari, which can report
  // stale widths during orientation/keyboard changes. Falls back to false on
  // SSR to be safe.
  const isMobileLayout = () => {
    if (typeof window === 'undefined' || !window.matchMedia) return false
    return window.matchMedia('(max-width: 1023.98px)').matches
  }

  const handleNavClick = () => {
    if (isMobileLayout()) {
      onClose()
    }
  }

  // Belt-and-suspenders: auto-close on mobile whenever the route changes —
  // catches programmatic navigate(), back-button, and anything else that
  // bypasses the Link onClick above. Skips the first render so a user who
  // intentionally opened the sidebar doesn't have it snap shut on arrival.
  const prevPathRef = useRef(location.pathname)
  useEffect(() => {
    if (prevPathRef.current === location.pathname) return
    prevPathRef.current = location.pathname
    if (isMobileLayout()) {
      onClose()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname])

  // Warm the chunk on hover/focus so navigation feels instant.
  const handleNavPrefetch = (name) => {
    try { preloadByNavName[name]?.() } catch {}
  }

  // Nav item styling — active uses 3px left team-accent stripe + subtle tint background.
  // Inactive uses a flat neutral hover. See docs/DESIGN.md "Team color as accent only".
  const navItemClass = (active) =>
    `relative block pl-4 pr-3 py-2 font-medium transition-colors text-sm ${
      active ? 'text-txt-primary' : 'text-txt-secondary hover:text-txt-primary hover:bg-surface-3'
    }`

  const navItemStyle = (active) =>
    active
      ? {
          backgroundColor: 'var(--surface-3)',
          borderLeft: '3px solid var(--text-primary)',
          paddingLeft: 'calc(1rem - 3px)',
        }
      : undefined

  return (
    <>
      {/* Overlay - mobile/tablet only */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
          onMouseDown={onClose}
        />
      )}

      {/* Sidebar — neutral surface with right border, no heavy shadow */}
      <aside
        className={`fixed left-0 z-40 transition-transform duration-300 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        } w-56 overflow-y-auto top-[64px] h-[calc(100dvh-64px)]`}
        style={{
          backgroundColor: 'var(--surface-1)',
          borderRight: '1px solid var(--surface-4)',
        }}
      >
        <nav className="px-2 pt-4 pb-24 lg:pb-16">
          <div className="flex flex-col">
            {navItems.filter(item => !item.isAdmin).map((item) => {
              const active = isActive(item.path)
              return (
                <Link
                  key={item.name}
                  to={item.path}
                  onClick={handleNavClick}
                  onMouseEnter={() => handleNavPrefetch(item.name)}
                  onFocus={() => handleNavPrefetch(item.name)}
                  onTouchStart={() => handleNavPrefetch(item.name)}
                  className={navItemClass(active)}
                  style={navItemStyle(active)}
                >
                  {item.name}
                </Link>
              )
            })}
          </div>

          {/* Admin Section */}
          {!isViewOnly && (
            <div className="mt-6 pt-4" style={{ borderTop: '1px solid var(--surface-4)' }}>
              <div className="px-4 mb-2">
                <span className="label-xs text-txt-tertiary">Settings</span>
              </div>
              <div className="flex flex-col">
                {navItems.filter(item => item.isAdmin).map((item) => {
                  const active = isActive(item.path)
                  return (
                    <Link
                      key={item.name}
                      to={item.path}
                      onClick={handleNavClick}
                      className={navItemClass(active)}
                      style={navItemStyle(active)}
                    >
                      {item.name}
                    </Link>
                  )
                })}
              </div>
            </div>
          )}

          {/* Bottom CTA section */}
          <div className="mt-6 pt-4 px-1 space-y-2" style={{ borderTop: '1px solid var(--surface-4)' }}>
            {isViewOnly ? (
              <>
                <button
                  onClick={handleCopyDynasty}
                  disabled={copying}
                  className="w-full flex items-center justify-center px-3 py-2.5 rounded-md text-sm font-semibold transition-colors disabled:opacity-70 hover:opacity-90"
                  style={{
                    backgroundColor: 'var(--text-primary)',
                    color: 'var(--surface-1)',
                  }}
                >
                  {copying ? 'Copying…' : 'Copy Dynasty'}
                </button>

                <Link
                  to="/"
                  className="w-full flex items-center justify-center px-3 py-2.5 rounded-md text-sm font-medium transition-colors text-txt-primary hover:bg-surface-3"
                  style={{ border: '1px solid var(--surface-4)' }}
                >
                  Create My Dynasty
                </Link>
              </>
            ) : (
              <>
                <button
                  onClick={() => {
                    if (!isPremium) {
                      toast.info('Sharing dynasties is a Premium feature. Upgrade in Account.')
                      return
                    }
                    setShowShareModal(true)
                  }}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-md text-sm font-semibold transition-colors hover:opacity-90"
                  style={{
                    backgroundColor: isPremium ? 'var(--text-primary)' : 'var(--surface-3)',
                    color: isPremium ? 'var(--surface-1)' : 'var(--text-secondary)',
                    border: isPremium ? 'none' : '1px solid var(--surface-5)',
                    cursor: isPremium ? 'pointer' : 'not-allowed',
                  }}
                  title={isPremium ? 'Share this dynasty' : 'Premium required'}
                >
                  Share Dynasty
                  {!isPremium && (
                    <span className="text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--surface-4)', color: 'var(--accent-warning)' }}>
                      Premium
                    </span>
                  )}
                </button>

                <button
                  onClick={handleExport}
                  className="w-full flex items-center justify-center px-3 py-2.5 rounded-md text-sm font-medium transition-colors text-txt-primary hover:bg-surface-3"
                  style={{ border: '1px solid var(--surface-4)' }}
                >
                  Download Backup
                </button>
              </>
            )}

            {/* Contact — loud & proud so bug reports and feature requests get through */}
            <Link
              to="/contact"
              onClick={handleNavClick}
              className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-md text-sm font-semibold transition-colors text-txt-primary hover:opacity-90"
              style={{
                backgroundColor: 'var(--surface-3)',
                border: '1px solid var(--surface-5)',
              }}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              Contact Me
            </Link>
          </div>
        </nav>
      </aside>

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
