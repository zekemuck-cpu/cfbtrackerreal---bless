import { useState, useRef, useEffect } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useDynasty, getPlayersNeedingClassConfirmation, getUserGamePerspective, getCurrentSchedule, getConferenceChampionshipData } from '../context/DynastyContext'
import { useAuth } from '../context/AuthContext'
import { useCurrentTeamColors } from '../hooks/useTeamColors'
import { getTeamLogoByTid } from '../data/teams'
import { TEAMS, getCurrentTeamAbbr, getCurrentTeamTid, getCurrentTeamName } from '../data/teamRegistry'
import { warmScoutScoresForDynasty } from '../utils/scoutScore'
import ClassAdvancementModal from './ClassAdvancementModal'
import CloudSyncBanner from './CloudSyncBanner'
import DynastyMigrationModal from './DynastyMigrationModal'
import CFB27SyncModal from './CFB27SyncModal'
import { needsV2Migration, isCleanButUnstamped } from '../data/migrateDynastyV2'
import { useToast, useConfirm } from './ui'
import { preloadCommonDynastyPages } from '../routes/lazyPages'
import { isPcAutoDynasty } from '../editions'

// Build-time version stamp injected by vite.config.js. Format is
// "YYYY.MM.DD-<short-sha>" so every commit produces a distinct value —
// the footer string actually moves on each deploy now, instead of being
// the stale hard-coded "2026.05.04.0066" it was for months.
// eslint-disable-next-line no-undef
const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev'

// Real progress bar for the PC dynasty loading gate — percentage and ETA
// both come from actual docs loaded so far (see getPcLoadProgress in
// DynastyContext.jsx), not a simulated/animated fill. Falls back to an
// indeterminate bar with no percentage when the total isn't known yet
// (e.g. the very first tick, or an aggregate-count read failed) rather
// than showing a fabricated number.
function PcLoadProgress({ dynastyId, getPcLoadProgress }) {
  const progress = getPcLoadProgress(dynastyId)
  const pct = progress?.pct
  const etaSeconds = progress?.etaSeconds
  const known = typeof pct === 'number'

  const etaLabel = (seconds) => {
    if (seconds == null) return null
    if (seconds <= 1) return 'less than a second remaining'
    if (seconds < 60) return `~${seconds}s remaining`
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `~${m}m ${s}s remaining`
  }

  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 px-4">
      <div className="text-sm font-medium text-txt-secondary">
        {known ? `Loading… ${pct}%` : 'Loading…'}
      </div>
      <div
        className="w-full max-w-xs h-2 rounded-full overflow-hidden"
        style={{ backgroundColor: 'var(--surface-3)' }}
        role="progressbar"
        aria-valuenow={known ? pct : undefined}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={known ? 'h-full rounded-full transition-[width] duration-300 ease-out' : 'h-full rounded-full pc-load-indeterminate'}
          style={{
            backgroundColor: 'var(--accent-primary, #22c55e)',
            width: known ? `${pct}%` : '40%',
          }}
        />
      </div>
      <div className="text-xs text-txt-tertiary tabular-nums" style={{ minHeight: '1em' }}>
        {etaLabel(etaSeconds) || ' '}
      </div>
      <style>{`
        @keyframes pc-load-indeterminate-slide {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(250%); }
        }
        .pc-load-indeterminate {
          animation: pc-load-indeterminate-slide 1.1s ease-in-out infinite;
        }
      `}</style>
    </div>
  )
}

export default function Layout({ children }) {
  const location = useLocation()
  const navigate = useNavigate()
  const { currentDynasty, advanceWeek, advanceToNewSeason, revertWeek, updateDynasty, phaseOverride, setPhaseOverride, advanceReadyInfo, toggleAdvanceReady, isViewOnly, migrateToSubcollections, isPcDynastyDataConfirmed, getPcLoadProgress } = useDynasty()
  const [showCfb27SyncModal, setShowCfb27SyncModal] = useState(false)
  // PC (CFB27) dynasties get their state from "Sync from Save," not manual
  // week advancement — the header's Advance Week control is replaced with a
  // direct shortcut to that same modal Dashboard.jsx's action tile opens.
  const isCfb27Auto = isPcAutoDynasty(currentDynasty)
  // PC dynasties are synced from an external save and can be opened on a
  // device whose local Firestore cache hasn't caught up yet — a cache-first
  // read paints instantly but can be stale/incomplete right after a Sync
  // from Save (or any cross-device open), and a full roster's worth of
  // subcollections can take several seconds to reconcile. Rather than flash
  // wrong numbers and silently correct them, block the page content on a
  // plain "Loading..." until the server read has confirmed both players and
  // games for this dynasty this session. Local (non-cloud) PC dynasties have
  // no cache-staleness risk — everything's already in memory — so this only
  // applies to cloud storage.
  const pcDataWaiting = isCfb27Auto
    && currentDynasty?.storageType === 'cloud'
    && !isPcDynastyDataConfirmed(currentDynasty.id)
  // Safety valve: if confirmation never lands (offline, a permission error,
  // a genuinely wedged connection), don't leave the user staring at
  // "Loading..." forever — show whatever we have after a generous timeout.
  // Mirrors the boot watchdogs already used for cloud sync in
  // DynastyContext.jsx (same reasoning: a stuck loading screen is worse
  // than briefly-stale data).
  const [pcDataWatchdogExpired, setPcDataWatchdogExpired] = useState(false)
  useEffect(() => {
    if (!pcDataWaiting) {
      setPcDataWatchdogExpired(false)
      return
    }
    const timer = setTimeout(() => setPcDataWatchdogExpired(true), 20000)
    return () => clearTimeout(timer)
  }, [pcDataWaiting, currentDynasty?.id])
  const pcDataPending = pcDataWaiting && !pcDataWatchdogExpired
  const [showV2Migration, setShowV2Migration] = useState(false)
  const [v2MigrationDismissed, setV2MigrationDismissed] = useState(false)
  const { user, signOut, isAdmin } = useAuth()
  const { toast } = useToast()
  const { confirm } = useConfirm()
  const [showWeekDropdown, setShowWeekDropdown] = useState(false)
  const [showClassAdvancementModal, setShowClassAdvancementModal] = useState(false)
  const [playersNeedingConfirmation, setPlayersNeedingConfirmation] = useState([])
  const [showUserMenu, setShowUserMenu] = useState(false)
  // isAdvancing — gates the Advance Week button while advanceWeek /
  // advanceToNewSeason is in flight. The end-of-season → next-season
  // transition processes the entire player roster (class progression,
  // year flip, etc.), which is fast on desktop but can take 5-15s on
  // a phone. Without feedback the button looks frozen and users tap
  // it repeatedly; the gate prevents duplicate calls and the spinner
  // makes it obvious work is happening.
  const [isAdvancing, setIsAdvancing] = useState(false)
  const [readyBusy, setReadyBusy] = useState(false)
  // Auto-advance fires once per advance stamp on the owner's client when every
  // editor is ready. Guarding on the stamp prevents a re-fire loop if the
  // advance pipeline returns early on a validation (the owner can then fix it
  // and use Force Advance manually).
  const autoAdvanceFiredStamp = useRef(null)
  const userMenuRef = useRef(null)
  // The header is `fixed` (not `sticky`) so it survives the modal scroll-lock
  // below: a `position: sticky` element breaks when an ancestor gets
  // `overflow: hidden`, which made the header vanish whenever a modal opened
  // while the page was scrolled. A measured spacer reserves its (responsive)
  // height so page content sits exactly where it did when the header was sticky.
  const headerRef = useRef(null)
  const [headerHeight, setHeaderHeight] = useState(0)
  useEffect(() => {
    const el = headerRef.current
    if (!el) return
    const measure = () => {
      const h = el.offsetHeight
      setHeaderHeight(h)
      // Publish the real header height so fixed-position chrome (e.g. the
      // dynasty sidebar) can sit flush under it instead of guessing a value.
      document.documentElement.style.setProperty('--app-header-height', `${h}px`)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const handleSignOut = async () => {
    try {
      setShowUserMenu(false)
      await signOut()
      navigate('/')
    } catch (error) {
      console.error('Sign out failed:', error)
    }
  }

  // Close user menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) {
        setShowUserMenu(false)
      }
    }
    if (showUserMenu) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showUserMenu])

  // Warm up the most common route chunks during browser idle time so
  // navigating between pages feels instant (not a click → spinner → render).
  useEffect(() => {
    preloadCommonDynastyPages()
  }, [])

  // Global modal-scroll-lock: whenever any portal-mounted modal is open
  // (i.e. a direct child of <body> with both `fixed` and `z-[9999]` classes
  // applied by Tailwind), lock body scroll. Unlocks automatically when the
  // last such element is removed. Refcounted so stacked modals behave.
  useEffect(() => {
    const isModalNode = (node) => {
      if (!(node instanceof HTMLElement)) return false
      const cls = node.className
      if (typeof cls !== 'string') return false
      // Match Tailwind compiled classes for fixed inset-0 + high z-index.
      return cls.includes('fixed') && cls.includes('z-[9999]')
    }
    const countModals = () => {
      let n = 0
      for (const child of document.body.children) {
        if (isModalNode(child)) n++
        // Some modals wrap in an extra div — walk one level deep for safety.
        else if (child instanceof HTMLElement) {
          for (const g of child.children) {
            if (isModalNode(g)) { n++; break }
          }
        }
      }
      return n
    }
    let savedOverflow = ''
    let savedPaddingRight = ''
    let locked = false
    const apply = () => {
      const n = countModals()
      if (n > 0 && !locked) {
        savedOverflow = document.body.style.overflow
        savedPaddingRight = document.body.style.paddingRight
        const sbw = window.innerWidth - document.documentElement.clientWidth
        if (sbw > 0) document.body.style.paddingRight = `${sbw}px`
        document.body.style.overflow = 'hidden'
        locked = true
      } else if (n === 0 && locked) {
        document.body.style.overflow = savedOverflow
        document.body.style.paddingRight = savedPaddingRight
        locked = false
      }
    }
    apply()
    const obs = new MutationObserver(apply)
    obs.observe(document.body, { childList: true, subtree: false })
    return () => {
      obs.disconnect()
      if (locked) {
        document.body.style.overflow = savedOverflow
        document.body.style.paddingRight = savedPaddingRight
      }
    }
  }, [])

  // ── Auto-migrate un-migrated CLOUD dynasties to subcollections ──────────
  //
  // WHY THIS RUNS BY ITSELF: a legacy cloud dynasty keeps players/games ON the
  // main document. As it grows, the main doc approaches Firestore's 1 MiB cap,
  // and once there the server starts REJECTING writes. Every save batches a
  // main-doc lastModified bump atomically, so games, rankings, recruiting —
  // everything — fails at once, while the optimistic local state keeps showing
  // the data. Users experienced that as "it freezes", "batch edit doesn't
  // work", and "it says it saved but on reload a whole season is gone". The
  // remedy already existed (Danger Zone -> Migrate to Subcollections) but it
  // required knowing the button was there and what it was for, so people only
  // found it AFTER losing data. Nothing about that is discoverable, hence this.
  //
  // Safe to run unattended, by construction:
  //   • migrateDynastyToSubcollections re-reads the MAIN DOC from Firestore
  //     itself — it never trusts React state, so a partially-hydrated client
  //     can't cause it to migrate (and then delete) an incomplete roster.
  //   • It writes players + games into their subcollections FIRST and only
  //     then deletes the arrays from the main doc. A failure part-way leaves
  //     both copies — the safe direction — and re-running is idempotent.
  //   • It no-ops on an already-migrated dynasty.
  //
  // Deliberately gated: cloud only (local storage has no doc cap), never in
  // view-only mode (a read-only viewer has no write permission and it isn't
  // their dynasty to restructure), and ONE attempt per dynasty per session —
  // same reasoning as the v2 stamp above, so a write that doesn't stick can't
  // turn every listener snapshot into another migration attempt. Scheduled at
  // idle so it never competes with the initial load.
  const subcollectionMigrationAttemptedRef = useRef(new Set())
  useEffect(() => {
    const dyn = currentDynasty
    if (!dyn?.id || isViewOnly) return
    if (dyn._subcollectionsMigrated) return
    // Cloud only. A firebase-style id is the same signal updateDynasty uses.
    const looksLikeFirebaseId = typeof dyn.id === 'string' && dyn.id.length >= 20 && !/^\d+$/.test(dyn.id)
    const isCloud = dyn.storageType === 'cloud' || looksLikeFirebaseId
    if (!isCloud) return
    if (subcollectionMigrationAttemptedRef.current.has(dyn.id)) return
    subcollectionMigrationAttemptedRef.current.add(dyn.id)

    const dynastyId = dyn.id
    const run = async () => {
      try {
        const result = await migrateToSubcollections(dynastyId)
        // No `cancelled` guard here on purpose: a SUCCESSFUL migration flips
        // _subcollectionsMigrated, which re-runs this effect and fires the
        // cleanup — so a cancel-check after the await would suppress the toast
        // in exactly the case it's meant for.
        if (!result?.success || result.alreadyMigrated) return
        const moved = (result.playerCount || 0) + (result.gameCount || 0)
        if (moved > 0) {
          toast.success('Cloud storage optimized — your dynasty is set up to keep saving as it grows.')
        }
      } catch (err) {
        // Never surface this to the user: it's a background optimization, the
        // dynasty still works un-migrated, and it retries next session.
        console.error('[auto-migrate] subcollection migration failed:', err)
      }
    }

    let idleId = null
    let timerId = null
    if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
      idleId = window.requestIdleCallback(run, { timeout: 8000 })
    } else {
      timerId = setTimeout(run, 3000)
    }
    return () => {
      if (idleId != null && typeof window.cancelIdleCallback === 'function') window.cancelIdleCallback(idleId)
      if (timerId != null) clearTimeout(timerId)
    }
    // Deps are NARROW on purpose. currentDynasty is a fresh object on every
    // real-time listener snapshot; depending on it would re-run this effect
    // constantly, and each re-run's cleanup cancels the still-pending idle
    // callback while the once-per-session ref guard stops the new run from
    // rescheduling it — the migration would be cancelled forever and never
    // actually fire. Every field read above is listed here, so the closure
    // cannot go stale. migrateToSubcollections/toast are omitted deliberately:
    // their identities change per render, their behavior does not.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentDynasty?.id, currentDynasty?._subcollectionsMigrated, currentDynasty?.storageType, isViewOnly])

  // Warm the ScoutScore cache for this dynasty's current-year recruiting targets
  // so the Scout Board is already populated when the user opens Recruiting
  // (instead of a few-second fetch on first click). Scheduled during browser
  // IDLE time so it never competes with the initial load — the first few seconds
  // stay smooth. Runs once per dynasty; the shared cache dedupes the rest.
  const warmedDynastyRef = useRef(null)
  // Dynasty ids we've already fired the silent v2 schema-stamp write for this
  // session. Without this, a dynasty that's clean-but-unstamped whose stamp
  // write doesn't stick (a wedged Firestore connection, so the write never
  // persists server-side) re-triggers this effect on every real-time listener
  // snapshot — the listener keeps re-delivering the still-unstamped dynasty, so
  // the effect keeps firing updateDynasty. That produced thousands of duplicate
  // "updateDynasty" writes (a self-inflicted write storm that also clogs the
  // very connection it's waiting on). One attempt per dynasty per session.
  const v2StampAttemptedRef = useRef(new Set())
  useEffect(() => {
    const dyn = currentDynasty
    if (!dyn?.id || !(dyn.players?.length > 0)) return
    // Scout Staff mode replaces the MaxPlaysCFB ScoutScore surfaces, so don't
    // warm (or hit) the ScoutScore cache for those dynasties.
    if (dyn.scoutStaffEnabled && isPcAutoDynasty(dyn)) return
    if (warmedDynastyRef.current === dyn.id) return
    warmedDynastyRef.current = dyn.id

    const run = () => warmScoutScoresForDynasty(dyn)
    if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(run, { timeout: 5000 })
      return () => window.cancelIdleCallback?.(id)
    }
    const t = setTimeout(run, 3000)
    return () => clearTimeout(t)
  }, [currentDynasty?.id, currentDynasty?.players?.length])

  // Detect dynasties that need the v2 roster-data migration and prompt.
  // New / already-clean dynasties are silently stamped with _schemaVersion: 2
  // so the user never sees a modal for a dynasty with nothing to migrate.
  useEffect(() => {
    if (!currentDynasty) { setShowV2Migration(false); return }
    if (v2MigrationDismissed) return
    if (needsV2Migration(currentDynasty)) {
      setShowV2Migration(true)
      return
    }
    setShowV2Migration(false)
    if (isCleanButUnstamped(currentDynasty) && !v2StampAttemptedRef.current.has(currentDynasty.id)) {
      // Silent stamp — no modal, no forceOverwrite needed (no keys to delete).
      // Guarded to ONE attempt per dynasty per session: if the write can't
      // reach the server the dynasty stays unstamped and the listener would
      // otherwise re-fire this effect into an unbounded write storm.
      v2StampAttemptedRef.current.add(currentDynasty.id)
      updateDynasty(currentDynasty.id, {
        _schemaVersion: 2,
        _normalizedAt: new Date().toISOString(),
      }).catch(err => console.error('[v2 silent stamp] failed:', err))
    }
  }, [currentDynasty?.id, currentDynasty?._schemaVersion, v2MigrationDismissed])

  const handleV2Migrate = async (migrated) => {
    const { _schemaVersion, _normalizedAt, players } = migrated
    // forceOverwrite: required so Firestore does a full set() per player
    // (default merge mode preserves keys we're trying to delete, e.g. legacy
    // movements[] arrays that migration consolidates into movementByYear).
    await updateDynasty(
      currentDynasty.id,
      { _schemaVersion, _normalizedAt, players },
      { forceOverwrite: true }
    )
  }

  // Use tid-based team colors lookup - this is THE source of truth
  const teamColors = useCurrentTeamColors(currentDynasty)

  const isDynastyPage = location.pathname.startsWith('/dynasty/')
  const isHomePage = location.pathname === '/' || location.pathname === '/home'
  const isAccountPage = location.pathname === '/account'
  const useTeamTheme = isDynastyPage && currentDynasty
  const isSocialPage = location.pathname.includes('/social/')
  const isCFPBracketPage = location.pathname.includes('/cfp-bracket')
  const isGamePage = location.pathname.includes('/game/')
  const isCoachCareerPage = location.pathname.includes('/coach-career')

  // Check if we're on a team-related page and get the viewed team's colors
  // Now uses tid-based URLs like /team/7/2027, /recruiting/7/2027
  const teamsSource = currentDynasty?.teams || TEAMS

  // Match team page: /team/:tid or /team/:tid/:year
  const teamPageMatch = location.pathname.match(/\/dynasty\/[^/]+\/team\/(\d+)/)
  // Match recruiting page: /recruiting/:tid/:year
  const recruitingPageMatch = location.pathname.match(/\/dynasty\/[^/]+\/recruiting\/(\d+)/)

  const viewedTeamTid = teamPageMatch ? parseInt(teamPageMatch[1], 10)
    : recruitingPageMatch ? parseInt(recruitingPageMatch[1], 10)
    : null
  const viewedTeamData = viewedTeamTid ? teamsSource[viewedTeamTid] : null
  const viewedTeamInfo = viewedTeamData ? {
    backgroundColor: viewedTeamData.primaryColor,
    textColor: viewedTeamData.secondaryColor,
    name: viewedTeamData.name
  } : null
  const isTeamPage = !!viewedTeamInfo

  // Pages that should use neutral gray styling instead of team colors
  const isNeutralPage =
    location.pathname.includes('/dynasty-records') ||
    location.pathname.includes('/awards') ||
    location.pathname.includes('/all-americans') ||
    location.pathname.includes('/all-conference') ||
    location.pathname.includes('/bowl-history') ||
    location.pathname.includes('/conference-championship-history') ||
    location.pathname.includes('/conference-standings') ||
    location.pathname.includes('/rankings') ||
    location.pathname.includes('/teams') ||
    location.pathname.includes('/players')

  // Header is ALWAYS neutral (surface-1). Team color shows only as a thin
  // top stripe + accents on dynasty pages. See docs/DESIGN.md.
  const headerText = 'var(--text-primary)'
  const headerMetaText = 'var(--text-secondary)'

  const getPhaseDisplay = (phase, week) => {
    if (phase === 'postseason') {
      if (week === 5) return 'End of Season Recap'
      return week === 4 ? 'National Championship' : `Bowl Week ${week}`
    }
    if (phase === 'offseason') {
      if (week === 1) return 'Players Leaving'
      if (week >= 2 && week <= 4) return isCfb27Auto ? `Offseason Recruiting Week ${week - 1} of 4` : `Recruiting Week ${week - 1} of 4`
      if (week === 5) return 'National Signing Day'
      if (week === 6) return 'Training Results'
      if (week === 7) return 'Offseason'
      return 'Off-Season'
    }
    const phases = {
      preseason: 'Preseason',
      regular_season: 'Regular Season',
      conference_championship: 'Conference Championships'
    }
    return phases[phase] || phase
  }

  const canAdvanceFromPreseason = () => {
    if (!currentDynasty) return false
    return (
      currentDynasty.preseasonSetup?.scheduleEntered &&
      currentDynasty.preseasonSetup?.rosterEntered &&
      currentDynasty.preseasonSetup?.teamRatingsEntered
    )
  }

  const handleAdvanceWeek = async () => {
    console.log('[Layout:handleAdvanceWeek] ========== BUTTON CLICKED ==========')
    if (!currentDynasty) {
      console.log('[Layout:handleAdvanceWeek] No currentDynasty, returning')
      return
    }
    // Guard against double-taps while a prior advance is still in flight.
    // Cheap and easy: the gate is the same state that drives the button
    // spinner, so users can't (a) see a frozen UI and (b) re-fire the
    // (slow) advance pipeline by tapping repeatedly.
    if (isAdvancing) {
      console.log('[Layout:handleAdvanceWeek] Already advancing, ignoring duplicate tap')
      return
    }

    console.log('[Layout:handleAdvanceWeek] Current state:', {
      phase: currentDynasty.currentPhase,
      week: currentDynasty.currentWeek,
      year: currentDynasty.currentYear,
      id: currentDynasty.id
    })

    if (currentDynasty.currentPhase === 'preseason' && !canAdvanceFromPreseason()) {
      console.log('[Layout:handleAdvanceWeek] Blocked: preseason not complete')
      toast.warning('Complete schedule, roster, and team ratings before advancing to the regular season.')
      return
    }

    // In regular season, check if current week's game has been entered (unless it's a bye week)
    if (currentDynasty.currentPhase === 'regular_season') {
      // Check if this week is a bye week
      const teamSchedule = getCurrentSchedule(currentDynasty)
      const scheduledGame = teamSchedule?.find(g => Number(g.week) === Number(currentDynasty.currentWeek))
      const isByeWeek = scheduledGame?.isBye ||
        scheduledGame?.opponent?.toUpperCase() === 'BYE' ||
        (scheduledGame && !scheduledGame.opponent) ||
        (!scheduledGame && teamSchedule?.length > 0) // Has schedule but no entry for this week = bye

      // Skip game check for bye weeks
      if (!isByeWeek) {
        // Find a user game for this week using getUserGamePerspective (handles all game formats)
        const currentWeekGame = currentDynasty.games?.find(g => {
          // Type-safe comparisons (handle string vs number)
          if (Number(g.week) !== Number(currentDynasty.currentWeek)) return false
          if (Number(g.year) !== Number(currentDynasty.currentYear)) return false
          // Must be a user game (not a CPU-only game)
          const perspective = getUserGamePerspective(g, currentDynasty)
          return perspective !== null
        })

        if (!currentWeekGame) {
          toast.warning(`Enter the Week ${currentDynasty.currentWeek} game before advancing.`)
          return
        }
      }
    }

    // In conference championship phase, check if user has answered the question
    if (currentDynasty.currentPhase === 'conference_championship') {
      // Use tid-based getter (handles all fallbacks)
      const userTid = getCurrentTeamTid(currentDynasty)
      const ccData = getConferenceChampionshipData(currentDynasty, userTid, currentDynasty.currentYear)

      // If they haven't answered whether they made the championship yet
      if (ccData?.madeChampionship === undefined || ccData?.madeChampionship === null) {
        toast.warning('Answer whether you made the conference championship before advancing.')
        return
      }
      // If they made the championship, check if they entered the game
      if (ccData?.madeChampionship === true) {
        const ccGame = currentDynasty.games?.find(
          g => g.isConferenceChampionship && Number(g.year) === Number(currentDynasty.currentYear)
        )
        if (!ccGame) {
          toast.warning('Enter your conference championship game before advancing.')
          return
        }
      }
    }

    // In postseason week 1, check if all CC results have been entered
    // If user made their own CC, they only need to enter 9 others (their own is in games)
    if (currentDynasty.currentPhase === 'postseason' && currentDynasty.currentWeek === 1) {
      const ccResults = currentDynasty.conferenceChampionships?.filter(cc => cc.team1 && cc.team2) || []
      const enteredCount = ccResults.length

      // Use tid-based getter (handles all fallbacks)
      const postUserTid = getCurrentTeamTid(currentDynasty)
      const postCCData = getConferenceChampionshipData(currentDynasty, postUserTid, currentDynasty.currentYear)
      const userMadeCC = postCCData?.madeChampionship === true
      const expectedCount = userMadeCC ? 9 : 10

      if (enteredCount < expectedCount) {
        const confirmAdvance = await confirm({
          title: 'Advance With Incomplete CC Results?',
          message: `You have only entered ${enteredCount}/${expectedCount} Conference Championship results. Are you sure you want to advance?`,
          confirmLabel: 'Advance anyway',
        })
        if (!confirmAdvance) {
          return
        }
      }
    }

    // In postseason, check that CFP games expected for the current week have been entered
    // Only warn about CFP games - regular bowl games are optional
    if (currentDynasty.currentPhase === 'postseason') {
      const year = currentDynasty.currentYear
      const week = currentDynasty.currentWeek
      const allGames = currentDynasty.games || []
      const cfpResults = currentDynasty.cfpResultsByYear?.[year] || {}

      // Build list of missing CFP games based on current week
      // Note: Games are played WHEN you advance, so warnings should be for the PREVIOUS phase's games
      // - Week 1 → 2: CFP First Round plays (entered during week 2)
      // - Week 2 → 3: CFP Quarterfinals play (entered during week 3)
      // So we warn about games that should have been entered by now, not games about to be played
      const missingCFPGames = []

      // Week 2+: CFP First Round should be entered (4 games)
      // (Games were played when advancing from week 1 to week 2)
      if (week >= 2) {
        const cfpFirstRoundFromGames = allGames.filter(g => g && (g.isCFPFirstRound || g.gameType === 'cfp_first_round') && Number(g.year) === Number(year))
        const cfpFirstRoundLegacy = cfpResults.firstRound || []
        const cfpFirstRoundGames = cfpFirstRoundFromGames.length > 0 ? cfpFirstRoundFromGames : cfpFirstRoundLegacy
        const enteredCFPFirstRound = cfpFirstRoundGames.filter(g => g && g.team1Score !== undefined && g.team1Score !== null).length
        if (enteredCFPFirstRound < 4) {
          missingCFPGames.push(`CFP First Round: ${enteredCFPFirstRound}/4`)
        }
      }

      // Week 3+: CFP Quarterfinals should be entered (4 games)
      // (Games were played when advancing from week 2 to week 3)
      if (week >= 3) {
        const cfpQuartersFromGames = allGames.filter(g => g && (g.isCFPQuarterfinal || g.gameType === 'cfp_quarterfinal') && Number(g.year) === Number(year))
        const cfpQuartersLegacy = cfpResults.quarterfinals || []
        const cfpQuarterGames = cfpQuartersFromGames.length > 0 ? cfpQuartersFromGames : cfpQuartersLegacy
        const enteredCFPQuarters = cfpQuarterGames.filter(g => g && g.team1Score !== undefined && g.team1Score !== null).length
        if (enteredCFPQuarters < 4) {
          missingCFPGames.push(`CFP Quarterfinals: ${enteredCFPQuarters}/4`)
        }
      }

      // Week 4+: CFP Semifinals should be entered (2 games)
      // Note: User enters their SF in Week 3, but the other SF is entered in Week 4
      // So we only check for both semifinals when leaving Week 4
      if (week >= 4) {
        const cfpSemisFromGames = allGames.filter(g => g && (g.isCFPSemifinal || g.gameType === 'cfp_semifinal') && Number(g.year) === Number(year))
        const cfpSemisLegacy = cfpResults.semifinals || []
        const cfpSemiGames = cfpSemisFromGames.length > 0 ? cfpSemisFromGames : cfpSemisLegacy
        const enteredCFPSemis = cfpSemiGames.filter(g => g && g.team1Score !== undefined && g.team1Score !== null).length
        if (enteredCFPSemis < 2) {
          missingCFPGames.push(`CFP Semifinals: ${enteredCFPSemis}/2`)
        }
      }

      // Week 5+: CFP Championship should be entered (1 game)
      // Note: User enters their championship in Week 4 if they're in it,
      // but users NOT in the championship enter it in Week 5 (End of Season Recap)
      if (week >= 5) {
        const cfpChampFromGames = allGames.filter(g => g && (g.isCFPChampionship || g.gameType === 'cfp_championship') && Number(g.year) === Number(year))
        const cfpChampLegacy = cfpResults.championship || []
        const cfpChampGames = cfpChampFromGames.length > 0 ? cfpChampFromGames : cfpChampLegacy
        const enteredCFPChamp = cfpChampGames.filter(g => g && g.team1Score !== undefined && g.team1Score !== null).length
        if (enteredCFPChamp < 1) {
          missingCFPGames.push(`CFP Championship: ${enteredCFPChamp}/1`)
        }
      }

      // Only warn if CFP games are missing
      if (missingCFPGames.length > 0) {
        const confirmAdvance = await confirm({
          title: 'Advance With Missing CFP Games?',
          message: `The following CFP games have not been fully entered:\n\n${missingCFPGames.join('\n')}\n\nAre you sure you want to advance?`,
          confirmLabel: 'Advance anyway',
        })
        if (!confirmAdvance) {
          return
        }
      }
    }

    // In postseason, validate new job form is complete if user selected "Yes" to taking a new job
    // This happens when advancing from postseason to offseason.
    // Per-user scoped: validate MY answer only — the dynasty-level field is
    // the owner's; members' answers live uid-keyed in newJobDataByUser.
    if (currentDynasty.currentPhase === 'postseason') {
      const legacy = currentDynasty.newJobData
      const legacyIsMine = legacy && (legacy.uid == null || legacy.uid === user?.uid)
        && (!currentDynasty.userId || !user?.uid || currentDynasty.userId === user.uid)
      const myJob = legacyIsMine ? legacy : currentDynasty.newJobDataByUser?.[user?.uid]
      if (myJob?.takingNewJob === true && (!myJob.team || !myJob.position)) {
        toast.warning('Complete your new job selection (team and position) before advancing to the offseason.')
        return
      }
    }

    // The year flip + class progression now happen ENTERING National Signing Day
    // (wk4→5), so Signing Day is the first week of the new season. Confirm class
    // advancement BEFORE the flip — i.e. at week 4.
    if (currentDynasty.currentPhase === 'offseason' && currentDynasty.currentWeek === 4) {
      console.log('[Layout:handleAdvanceWeek] At offseason week 4 - checking for class confirmations')
      // Check for players needing class confirmation BEFORE class progression happens
      const playersNeeding = getPlayersNeedingClassConfirmation(currentDynasty)
      console.log('[Layout:handleAdvanceWeek] Players needing confirmation:', playersNeeding.length)

      if (playersNeeding.length > 0) {
        console.log('[Layout:handleAdvanceWeek] Showing class confirmation modal')
        // Show modal to confirm class advancement
        setPlayersNeedingConfirmation(playersNeeding)
        setShowClassAdvancementModal(true)
        setShowWeekDropdown(false)
        return
      }
      console.log('[Layout:handleAdvanceWeek] No confirmations needed, proceeding to advanceWeek')
    }

    // Check if advancing from offseason week 7 (season advancement)
    if (currentDynasty.currentPhase === 'offseason' && currentDynasty.currentWeek === 7) {
      console.log('[Layout:handleAdvanceWeek] At offseason week 7 - advancing to new season')
      // No more class confirmation needed here - it happens at Signing Day (week 5→6)
      // CRITICAL: Must await both to ensure players are processed before week advances
      setIsAdvancing(true)
      try {
        await advanceToNewSeason(currentDynasty.id)
        await advanceWeek(currentDynasty.id)
      } catch (err) {
        console.error('[Layout:handleAdvanceWeek] season advance threw error:', err)
      } finally {
        setIsAdvancing(false)
      }
      setShowWeekDropdown(false)
      return
    }

    console.log('[Layout:handleAdvanceWeek] Calling advanceWeek for dynasty:', currentDynasty.id)
    setIsAdvancing(true)
    try {
      await advanceWeek(currentDynasty.id)
      console.log('[Layout:handleAdvanceWeek] advanceWeek completed successfully')
    } catch (err) {
      console.error('[Layout:handleAdvanceWeek] advanceWeek threw error:', err)
    } finally {
      setIsAdvancing(false)
    }
    setShowWeekDropdown(false)
  }

  // Handle class advancement confirmation from modal
  const handleClassAdvancementConfirm = async (confirmations) => {
    if (!currentDynasty) return

    // Advance week with class confirmations (class progression happens at week 5→6)
    setIsAdvancing(true)
    try {
      await advanceWeek(currentDynasty.id, confirmations)
    } catch (err) {
      console.error('[Layout:handleClassAdvancementConfirm] advanceWeek threw error:', err)
    } finally {
      setIsAdvancing(false)
    }
  }

  // Toggle the current user's "ready to advance" flag.
  const handleToggleReady = async () => {
    if (!currentDynasty || readyBusy) return
    setReadyBusy(true)
    try {
      await toggleAdvanceReady(currentDynasty.id, !advanceReadyInfo?.iAmReady)
    } catch (err) {
      console.error('[Layout:handleToggleReady] failed:', err)
    } finally {
      setReadyBusy(false)
    }
  }

  // Owner auto-advance: once every editor is ready, the owner's client runs the
  // normal advance pipeline. Owner-only so two force-advance users don't both
  // fire; co-commishes can still advance manually via the button.
  useEffect(() => {
    if (!advanceReadyInfo?.isShared || !advanceReadyInfo?.allReady || !advanceReadyInfo?.isOwner) return
    if (isAdvancing) return
    if (autoAdvanceFiredStamp.current === advanceReadyInfo.stamp) return
    autoAdvanceFiredStamp.current = advanceReadyInfo.stamp
    handleAdvanceWeek()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [advanceReadyInfo?.isShared, advanceReadyInfo?.allReady, advanceReadyInfo?.isOwner, advanceReadyInfo?.stamp, isAdvancing])

  const handleRevertWeek = async () => {
    if (!currentDynasty) return

    const confirmMessage = currentDynasty.currentPhase === 'preseason' && currentDynasty.currentWeek === 0
      ? 'This will revert to the previous year\'s offseason. Any data from this preseason will be lost. Continue?'
      : 'This will go back one week and remove any game data from the current week. Continue?'

    setShowWeekDropdown(false)
    const ok = await confirm({
      title: 'Revert Week',
      message: confirmMessage,
      confirmLabel: 'Revert',
      variant: 'danger',
    })
    if (!ok) return

    revertWeek(currentDynasty.id)
  }


  return (
    <div
      className="min-h-dvh flex flex-col surface-1 isolate"
    >
      {/* Calendar-preview badge — app-wide banner so it's always obvious the
          displayed phase/week is a non-destructive preview, with quick exit. */}
      {phaseOverride && (
        <button
          type="button"
          onClick={() => setPhaseOverride?.(null)}
          className="fixed bottom-3 left-1/2 -translate-x-1/2 z-[9998] flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold shadow-lg"
          style={{ backgroundColor: 'var(--accent-warning)', color: '#1a1a1a' }}
          title="Exit calendar preview"
        >
          PREVIEW · {phaseOverride.year} · {String(phaseOverride.phase).replace(/_/g, ' ')} · wk {phaseOverride.week}
          <span className="underline">Exit</span>
        </button>
      )}

      {/* App-wide paper grain — a fixed layer that textures the background
          BEHIND content (z-index:-1 inside this isolated wrapper) so it never
          fuzzes images, cards, or player photos. */}
      <div className="cfb-grain-overlay" aria-hidden="true" />
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[10002] focus:px-4 focus:py-2 focus:rounded-md focus:font-semibold focus:outline-none focus:ring-2"
        style={{
          backgroundColor: 'var(--surface-3)',
          color: 'var(--text-primary)',
          borderColor: 'var(--surface-5)',
        }}
      >
        Skip to main content
      </a>
      <header
        ref={headerRef}
        className="fixed top-0 left-0 right-0 z-50"
        style={{
          backgroundColor: 'var(--surface-1)',
          borderBottom: '1px solid var(--surface-4)',
        }}
      >
        {/* Header is always neutral — no team-color accent stripe. */}
        <div className="w-full px-2 sm:px-4">
          <div className="flex items-center justify-between py-2 relative">
            {/* Left: Burger menu + Home button (dynasty pages only) */}
            <div className="flex items-center gap-0.5 sm:gap-2 flex-shrink-0">
              {useTeamTheme && (
                <>
                  <button
                    onClick={() => window.toggleDynastySidebar?.()}
                    className="p-1.5 sm:p-2 rounded-lg hover:opacity-70 transition-opacity"
                    style={{ color: headerText }}
                    aria-label="Toggle sidebar"
                  >
                    <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                    </svg>
                  </button>
                  {/* Home Button */}
                  <Link
                    to={`/dynasty/${currentDynasty.id}`}
                    className="p-1.5 sm:p-2 rounded-lg hover:opacity-70 transition-opacity"
                    style={{ color: headerText }}
                    title="Dashboard"
                    aria-label="Dashboard"
                  >
                    <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                    </svg>
                  </Link>
                </>
              )}
            </div>

            {/* Center: Logo + Team info - centered.
                On dynasty pages both sides carry content, so flex-1/justify-center
                lands the logo in the middle. On the dynasty-LIST page the left
                slot is empty (no burger/home), which would pull a flex-centered
                logo left of true center — so there we absolutely center it to the
                header instead. */}
            <div className={useTeamTheme
              ? "flex-1 flex items-center justify-center gap-1.5 sm:gap-3 min-w-0"
              : "absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center"}>
              <Link
                to="/"
                className="flex-shrink-0 relative inline-block"
                aria-label="CFB Dynasty Tracker"
              >
                <img
                  src="/header-logo.png"
                  alt="CFB Dynasty Tracker"
                  className="h-7 sm:h-11 object-contain"
                  onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = 'https://i.imgur.com/e1iYDSZ.png' }}
                />
              </Link>

              {useTeamTheme && (() => {
                // tid-based team info - THE source of truth
                const currentTid = getCurrentTeamTid(currentDynasty)
                const currentTeamName = getCurrentTeamName(currentDynasty)
                const currentTeamLogo = getTeamLogoByTid(currentTid, currentDynasty.teams)
                return (
                <>
                  {/* Separator */}
                  <span className="hidden sm:inline text-sm" style={{ color: headerText, opacity: 0.3 }}>|</span>

                  {/* Team Logo */}
                  {currentTeamLogo && (
                    <div
                      className="w-6 h-6 sm:w-8 sm:h-8 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{
                        backgroundColor: '#FFFFFF',
                        border: '2px solid var(--surface-5)',
                        padding: '2px'
                      }}
                    >
                      <img
                        src={currentTeamLogo}
                        alt={`${currentTeamName} logo`}
                        className="w-full h-full object-contain"
                      />
                    </div>
                  )}

                  {/* Year and Phase */}
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="font-semibold text-xs sm:text-sm" style={{ color: headerText }}>
                      {currentDynasty.currentYear}
                    </span>
                    <span className="font-medium text-xs sm:text-sm truncate" style={{ color: headerText }}>
                      <span className="sm:hidden">
                        {currentDynasty.currentPhase === 'conference_championship' ? 'CC' :
                         currentDynasty.currentPhase === 'regular_season' ? `Wk ${currentDynasty.currentWeek}` :
                         currentDynasty.currentPhase === 'postseason' ? (currentDynasty.currentWeek === 5 ? 'Recap' : (currentDynasty.currentWeek === 4 ? 'Champ' : `Bowl ${currentDynasty.currentWeek}`)) :
                         currentDynasty.currentPhase === 'preseason' ? 'Preseason' :
                         currentDynasty.currentPhase === 'offseason' ? (
                           currentDynasty.currentWeek === 1 ? 'Leaving' :
                           currentDynasty.currentWeek === 5 ? 'Signing' :
                           currentDynasty.currentWeek === 6 ? 'Training' :
                           currentDynasty.currentWeek === 7 ? 'Transfers' :
                           currentDynasty.currentWeek >= 2 && currentDynasty.currentWeek <= 4 ? `Recruit ${currentDynasty.currentWeek - 1}` :
                           `Off ${currentDynasty.currentWeek}`
                         ) : ''}
                      </span>
                      <span className="hidden sm:inline">
                        {getPhaseDisplay(currentDynasty.currentPhase, currentDynasty.currentWeek)}
                        {currentDynasty.currentPhase !== 'postseason' && currentDynasty.currentPhase !== 'offseason' && currentDynasty.currentPhase !== 'conference_championship' && currentDynasty.currentPhase !== 'preseason' && ` Wk ${currentDynasty.currentWeek}`}
                      </span>
                    </span>
                  </div>
                </>
              )})()}
            </div>

            {useTeamTheme ? (
              <>
                {/* Right: Contact + Advance Week - hugging right edge */}
                <div className="relative flex items-center flex-shrink-0 gap-0.5 sm:gap-1">
                  {/* Contact button — quick access to bug reports / feature requests */}
                  <Link
                    to="/contact"
                    className="p-1.5 sm:p-2 rounded-lg hover:opacity-70 transition-opacity"
                    style={{ color: headerText }}
                    title="Contact / Feedback"
                    aria-label="Contact"
                  >
                    <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                  </Link>

                  {/* Ready-up pill (shared dynasties only). Every editor can
                      mark ready; once all are ready the owner's client
                      auto-advances. Members see only this control. */}
                  {advanceReadyInfo?.isShared && (
                    <button
                      onClick={handleToggleReady}
                      disabled={readyBusy}
                      className="flex items-center gap-1 sm:gap-1.5 px-1.5 sm:px-2.5 py-1 sm:py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-opacity hover:opacity-80 disabled:opacity-50"
                      style={{
                        color: advanceReadyInfo.iAmReady ? '#fff' : headerText,
                        background: advanceReadyInfo.iAmReady ? '#16a34a' : 'transparent',
                        border: `1px solid ${advanceReadyInfo.iAmReady ? '#16a34a' : 'currentColor'}`,
                      }}
                      title={advanceReadyInfo.iAmReady ? 'Ready to advance (tap to undo)' : 'Mark ready to advance'}
                      aria-pressed={advanceReadyInfo.iAmReady}
                    >
                      <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      <span className="tabular-nums">{advanceReadyInfo.readyCount}/{advanceReadyInfo.total}</span>
                    </button>
                  )}

                  {/* PC (CFB27) dynasties: labeled "Advance Week" like the
                      manual button below, but it opens the CFB27 sync modal
                      instead — for PC, uploading an updated save IS how the
                      week advances, so this is the PC equivalent, not a
                      separate action. */}
                  {isCfb27Auto && !isViewOnly && (
                    <button
                      type="button"
                      onClick={() => setShowCfb27SyncModal(true)}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm font-semibold hover:opacity-70 transition-opacity"
                      style={{ color: headerText, border: '1px solid currentColor' }}
                      title="Advance Week"
                      aria-label="Advance Week"
                    >
                      <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      <span className="hidden sm:inline">Advance Week</span>
                    </button>
                  )}

                  {/* Advance Week Button with Dropdown — force-advance users
                      (commish + co-commishes) only in a shared dynasty. */}
                  {!isCfb27Auto && (!advanceReadyInfo?.isShared || advanceReadyInfo?.canForceAdvance) && (<>
                  <div className="flex items-center">
                    <button
                      onClick={handleAdvanceWeek}
                      disabled={isAdvancing}
                      className="p-1.5 sm:p-2 rounded-lg hover:opacity-70 transition-opacity disabled:opacity-60 disabled:cursor-wait"
                      style={{ color: headerText }}
                      title={isAdvancing ? 'Advancing…' : (advanceReadyInfo?.isShared ? 'Force Advance' : 'Advance Week')}
                      aria-label={isAdvancing ? 'Advancing week' : 'Advance week'}
                      aria-busy={isAdvancing}
                    >
                      {isAdvancing ? (
                        // Spinner — gives mobile users feedback during the
                        // slow end-of-season → next-season transition that
                        // used to look frozen.
                        <svg className="w-5 h-5 sm:w-6 sm:h-6 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2.5" />
                          <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                        </svg>
                      ) : (
                        <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                        </svg>
                      )}
                    </button>
                    <button
                      onClick={() => setShowWeekDropdown(!showWeekDropdown)}
                      disabled={isAdvancing}
                      className="p-1 rounded-lg hover:opacity-70 transition-opacity -ml-1 disabled:opacity-60 disabled:cursor-wait"
                      style={{ color: headerText }}
                      aria-label="Week menu"
                      aria-expanded={showWeekDropdown}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                  </div>

                  {/* Dropdown Menu */}
                  {showWeekDropdown && (
                    <>
                      <div
                        className="fixed inset-0 z-40"
                        onClick={() => setShowWeekDropdown(false)}
                      />
                      <div className="absolute right-0 top-full mt-1 w-40 card-elevated z-50 overflow-hidden">
                        <button
                          onClick={handleRevertWeek}
                          className="w-full px-4 py-2.5 text-left text-sm font-medium text-txt-primary hover:bg-surface-4 transition-colors flex items-center gap-2"
                        >
                          <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 17l-5-5m0 0l5-5m-5 5h12" />
                          </svg>
                          Revert Week
                        </button>
                      </div>
                    </>
                  )}
                  </>)}
                </div>
              </>
            ) : (
              /* User Account / Sign In on home page header */
              <div className="flex items-center gap-1 sm:gap-2">
                {user ? (
                  <div className="relative" ref={userMenuRef}>
                    <button
                      onClick={() => setShowUserMenu(!showUserMenu)}
                      className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-surface-3 transition-colors"
                    >
                      {user.photoURL ? (
                        <img
                          src={user.photoURL}
                          alt={user.displayName || 'User'}
                          className="w-8 h-8 rounded-full"
                          style={{ border: '2px solid var(--surface-4)' }}
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-surface-3 flex items-center justify-center text-sm font-medium text-txt-primary">
                          {(user.displayName || user.email || 'U')[0].toUpperCase()}
                        </div>
                      )}
                      <div className="hidden sm:block text-left">
                        <p className="text-sm font-medium truncate max-w-[120px] text-txt-primary">
                          {user.displayName || 'User'}
                        </p>
                      </div>
                      <svg className={`w-4 h-4 transition-transform text-txt-secondary ${showUserMenu ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>

                    {/* User dropdown menu */}
                    {showUserMenu && (
                      <div className="absolute right-0 mt-2 w-64 card-elevated py-2 z-50 overflow-hidden">
                        <div className="px-4 py-2" style={{ borderBottom: '1px solid var(--surface-4)' }}>
                          <p className="text-sm font-medium text-txt-primary">{user.displayName || 'User'}</p>
                          <p className="text-xs text-txt-tertiary truncate">{user.email}</p>
                        </div>
                        <Link
                          to="/account"
                          onClick={() => setShowUserMenu(false)}
                          className="w-full px-4 py-2 text-left text-sm text-txt-secondary hover:bg-surface-4 hover:text-txt-primary flex items-center gap-2 transition-colors"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                          </svg>
                          Account & Subscription
                        </Link>
                        {isAdmin && (
                          <Link
                            to="/admin/images"
                            onClick={() => setShowUserMenu(false)}
                            className="w-full px-4 py-2 text-left text-sm text-txt-secondary hover:bg-surface-4 hover:text-txt-primary flex items-center gap-2 transition-colors"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            Image Gallery
                          </Link>
                        )}
                        <button
                          onClick={handleSignOut}
                          className="w-full px-4 py-2 text-left text-sm text-txt-secondary hover:bg-surface-4 hover:text-txt-primary flex items-center gap-2 transition-colors"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                          </svg>
                          Sign out
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <Link
                    to="/login"
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-surface-3 text-sm text-txt-primary transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                    </svg>
                    Sign in
                  </Link>
                )}
              </div>
            )}
          </div>
        </div>
      </header>
      {/* Spacer reserving the fixed header's height (keeps content in place). */}
      <div aria-hidden="true" style={{ height: headerHeight }} />

      <main id="main" tabIndex={-1} className={`flex-1 [overflow-x:clip] ${isHomePage || isAccountPage || isSocialPage ? '' : 'px-4 py-6'} ${isDynastyPage || isHomePage || isAccountPage ? '' : 'container mx-auto'}`}>
        {isDynastyPage ? (
          <div key={location.pathname} className="max-w-[1440px] mx-auto w-full page-enter">
            {pcDataPending ? (
              <PcLoadProgress dynastyId={currentDynasty?.id} getPcLoadProgress={getPcLoadProgress} />
            ) : (
              children
            )}
          </div>
        ) : (
          <div key={location.pathname} className="page-enter">
            {children}
          </div>
        )}
      </main>

      {/* Cloud sync health — a fixed banner that appears only when a write
          hasn't reached the server, so a wedged connection is visible instead
          of silently diverging. Renders nothing when synced. */}
      <CloudSyncBanner />

      {/* Version Footer - tracked editorial treatment, hairline rule above. */}
      <footer
        className="pb-10 pt-4 px-4 sm:px-6 flex items-center justify-between gap-4 text-txt-tertiary"
        style={{ borderTop: '1px solid var(--surface-4)' }}
      >
        <span
          className="font-display tabular-nums uppercase"
          style={{ fontSize: '0.625rem', fontWeight: 600, letterSpacing: '0.18em' }}
        >
          v{APP_VERSION}
        </span>
        <nav className="flex items-center gap-5 sm:gap-6">
          <Link
            to="/contact"
            className="font-display uppercase hover:text-txt-secondary transition-colors"
            style={{ fontSize: '0.625rem', fontWeight: 600, letterSpacing: '0.18em' }}
          >
            Contact
          </Link>
          <Link
            to="/privacy"
            className="font-display uppercase hover:text-txt-secondary transition-colors"
            style={{ fontSize: '0.625rem', fontWeight: 600, letterSpacing: '0.18em' }}
          >
            Privacy
          </Link>
          <Link
            to="/terms"
            className="font-display uppercase hover:text-txt-secondary transition-colors"
            style={{ fontSize: '0.625rem', fontWeight: 600, letterSpacing: '0.18em' }}
          >
            Terms
          </Link>
        </nav>
      </footer>

      {/* Class Advancement Modal - shown when advancing to new season with players needing confirmation */}
      <ClassAdvancementModal
        isOpen={showClassAdvancementModal}
        onClose={() => setShowClassAdvancementModal(false)}
        onConfirm={handleClassAdvancementConfirm}
        players={playersNeedingConfirmation}
        teamColors={teamColors}
        year={currentDynasty?.currentYear}
      />

      {/* PC (CFB27) header shortcut, opened in place of Advance Week above */}
      <CFB27SyncModal
        isOpen={showCfb27SyncModal}
        onClose={() => setShowCfb27SyncModal(false)}
      />

      {/* v2 roster data migration prompt — shows once per dynasty load until accepted */}
      <DynastyMigrationModal
        dynasty={currentDynasty}
        isOpen={showV2Migration}
        onMigrate={handleV2Migrate}
        onDismiss={() => { setShowV2Migration(false); setV2MigrationDismissed(true) }}
      />
    </div>
  )
}
