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
import { getEditionConfig } from '../editions'
import {
  DndContext, MouseSensor, TouchSensor, KeyboardSensor,
  useSensor, useSensors, closestCenter,
} from '@dnd-kit/core'
import { SortableContext, useSortable, arrayMove, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

// Per-device sidebar nav order. Stored as an array of item *names* (stable
// across dynasties / param changes) under a single global key so the user's
// chosen order follows them to every dynasty on this device.
const SIDEBAR_ORDER_KEY = 'sidebarNavOrder'

const loadSidebarOrder = () => {
  try {
    const raw = localStorage.getItem(SIDEBAR_ORDER_KEY)
    const parsed = raw ? JSON.parse(raw) : null
    return Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

// Reorder `items` to match the saved name order. Names not in `order` (new
// nav links shipped after the user last sorted) are appended in their
// default position so nothing ever disappears.
const applySidebarOrder = (items, order) => {
  if (!order || !order.length) return items
  const byName = new Map(items.map((i) => [i.name, i]))
  const result = []
  order.forEach((name) => {
    if (byName.has(name)) {
      result.push(byName.get(name))
      byName.delete(name)
    }
  })
  items.forEach((i) => { if (byName.has(i.name)) result.push(i) })
  return result
}

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

  // Sidebar reordering (per-device). `navOrder` is the saved name order;
  // `reordering` flips the main nav into drag mode; `locking` drives the
  // brief lock-in pulse when entering that mode.
  const [navOrder, setNavOrder] = useState(() => loadSidebarOrder())
  const [reordering, setReordering] = useState(false)
  const [locking, setLocking] = useState(false)
  const lockTimerRef = useRef(null)

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  )

  useEffect(() => () => { if (lockTimerRef.current) clearTimeout(lockTimerRef.current) }, [])

  const enterReorder = () => {
    setReordering(true)
    setLocking(true)
    if (lockTimerRef.current) clearTimeout(lockTimerRef.current)
    lockTimerRef.current = setTimeout(() => setLocking(false), 650)
  }

  const persistOrder = (names) => {
    setNavOrder(names)
    try { localStorage.setItem(SIDEBAR_ORDER_KEY, JSON.stringify(names)) } catch {}
  }

  const resetOrder = () => {
    setNavOrder(null)
    try { localStorage.removeItem(SIDEBAR_ORDER_KEY) } catch {}
  }

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

  // Edition-gated nav: the Dynasty Blueprint hub only exists for editions
  // that enable the Dynasty Points economy (CFB 27+). CFB 26 dynasties
  // never see the link. Reads the resolved edition config off the dynasty.
  const editionConfig = getEditionConfig(currentDynasty)
  const showBlueprint = Boolean(editionConfig?.features?.dynastyPoints) && !isViewOnly

  const navItems = [
    { name: 'Dashboard', path: pathPrefix },
    ...(showBlueprint ? [{ name: 'Dynasty Blueprint', path: `${pathPrefix}/team/${teamTid}/${currentYear}?tab=blueprint` }] : []),
    { name: 'Around the Country', path: `${pathPrefix}/weekly-scores` },
    { name: 'Top 25', path: `${pathPrefix}/rankings` },
    { name: 'CFP Bracket', path: `${pathPrefix}/cfp-bracket` },
    { name: 'Conf. Standings', path: `${pathPrefix}/conference-standings` },
    { name: 'Recruiting', path: `${pathPrefix}/recruiting/${teamTid}/${currentYear}` },
    { name: 'Coach Career', path: `${pathPrefix}/coach-career` },
    { name: 'Leaderboard', path: `${pathPrefix}/dynasty-records` },
    { name: 'Bowl History', path: `${pathPrefix}/bowl-history` },
    { name: 'CC History', path: `${pathPrefix}/conference-championship-history` },
    { name: 'Awards', path: `${pathPrefix}/awards` },
    { name: 'All-Americans', path: `${pathPrefix}/all-americans` },
    { name: 'All-Conference', path: `${pathPrefix}/all-conference/${currentYear}/${conferenceUrlParam}` },
    { name: 'All Teams', path: `${pathPrefix}/teams` },
    { name: 'All Players', path: `${pathPrefix}/players` },
    { name: 'Card Collection', path: `${pathPrefix}/cards` },
    ...(showCoachesLink ? [{ name: 'Coaches', path: `${pathPrefix}/coaches` }] : []),
    ...(!isViewOnly ? [{ name: 'AI Prompts', path: `${pathPrefix}/ai-prompts` }] : []),
    ...(!isViewOnly ? [{ name: 'League Preferences', path: `${pathPrefix}/preferences` }] : []),
    ...(userCanSeeMembers ? [{ name: 'Members', path: `${pathPrefix}/league`, isAdmin: true }] : []),
    { name: 'Danger Zone', path: `${pathPrefix}/admin`, isAdmin: true },
    // Personal dev tools — only ever shown to the dev account.
    ...(!isViewOnly && user?.email === 'alex.guess1999@gmail.com'
      ? [{ name: 'Dev Tools', path: `${pathPrefix}/dev`, isAdmin: true }]
      : []),
  ]

  // Main (non-admin) nav links, reordered to the user's saved preference.
  // Only this primary list is reorderable; the Settings/admin group stays
  // pinned so the reorder controls keep a stable home.
  const mainItems = navItems.filter((item) => !item.isAdmin)
  const orderedMain = applySidebarOrder(mainItems, navOrder)

  const handleDragEnd = ({ active, over }) => {
    if (!over || active.id === over.id) return
    const oldIndex = orderedMain.findIndex((i) => i.name === active.id)
    const newIndex = orderedMain.findIndex((i) => i.name === over.id)
    if (oldIndex < 0 || newIndex < 0) return
    persistOrder(arrayMove(orderedMain, oldIndex, newIndex).map((i) => i.name))
  }

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
        } w-56 overflow-y-auto`}
        style={{
          // Sit flush under the real (measured) header height, not a hardcoded
          // 64px — the header is taller on mobile (logo + padding + safe area).
          top: 'var(--app-header-height, 64px)',
          height: 'calc(100dvh - var(--app-header-height, 64px))',
          backgroundColor: 'var(--surface-1)',
          borderRight: '1px solid var(--surface-4)',
        }}
      >
        <nav className="px-2 pt-4 pb-24 lg:pb-16">
          {reordering ? (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={orderedMain.map((i) => i.name)} strategy={verticalListSortingStrategy}>
                <div className={`flex flex-col ${locking ? 'animate-pulse' : ''}`}>
                  {orderedMain.map((item) => (
                    <SortableNavRow key={item.name} name={item.name} />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          ) : (
            <div className="flex flex-col">
              {orderedMain.map((item) => {
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
          )}

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

              {/* Sidebar Order — per-device drag-to-reorder for the main nav.
                  Sits at the bottom of the Settings group by default. */}
              {reordering ? (
                <div className="px-2 mt-1">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setReordering(false)}
                      className="flex-1 flex items-center justify-center px-3 py-2 rounded-md text-sm font-semibold transition-colors hover:opacity-90"
                      style={{ backgroundColor: 'var(--text-primary)', color: 'var(--surface-1)' }}
                    >
                      Done
                    </button>
                    <button
                      type="button"
                      onClick={resetOrder}
                      className="px-3 py-2 rounded-md text-sm font-medium text-txt-secondary hover:text-txt-primary hover:bg-surface-3 transition-colors"
                      style={{ border: '1px solid var(--surface-4)' }}
                      title="Restore the default order"
                    >
                      Reset
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={enterReorder}
                  className={navItemClass(false)}
                  style={{ width: '100%', textAlign: 'left' }}
                >
                  Sidebar Order
                </button>
              )}
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

// A single draggable nav row shown while reordering. The burger handle (three
// stacked lines) carries the drag listeners; `touch-action: none` on it lets
// the TouchSensor grab without the scroll container stealing the gesture.
function SortableNavRow({ name }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: name })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    zIndex: isDragging ? 20 : undefined,
    position: 'relative',
  }
  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        backgroundColor: 'var(--surface-2)',
        border: '1px dashed var(--surface-4)',
      }}
      className="flex items-center gap-2 my-0.5 pl-2 pr-3 py-2 rounded-md select-none"
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label={`Drag ${name}`}
        className="flex flex-col justify-center gap-[3px] shrink-0 px-1 py-1 -ml-1 rounded text-txt-tertiary hover:text-txt-primary cursor-grab active:cursor-grabbing"
        style={{ touchAction: 'none' }}
      >
        <span className="block w-3.5 h-px bg-current" />
        <span className="block w-3.5 h-px bg-current" />
        <span className="block w-3.5 h-px bg-current" />
      </button>
      <span className="text-sm font-medium text-txt-primary truncate">{name}</span>
    </div>
  )
}
