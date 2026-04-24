import { useState, useRef, useEffect } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useDynasty, getPlayersNeedingClassConfirmation, getUserGamePerspective, getCurrentSchedule, getConferenceChampionshipData } from '../context/DynastyContext'
import { useAuth } from '../context/AuthContext'
import { useCurrentTeamColors } from '../hooks/useTeamColors'
import { getTeamLogoByTid } from '../data/teams'
import { getContrastTextColor } from '../utils/colorUtils'
import { teamAbbreviations } from '../data/teamAbbreviations'
import { TEAMS, getCurrentTeamAbbr, getCurrentTeamTid, getCurrentTeamName } from '../data/teamRegistry'
import ClassAdvancementModal from './ClassAdvancementModal'
import DynastyMigrationModal from './DynastyMigrationModal'
import { needsV2Migration, isCleanButUnstamped } from '../data/migrateDynastyV2'
import { useToast, useConfirm } from './ui'
import logo from '../assets/logo.png'
import { preloadCommonDynastyPages } from '../routes/lazyPages'

// Version format: YYYY.MM.DD.build
const APP_VERSION = '2026.04.24.0013'

export default function Layout({ children }) {
  const location = useLocation()
  const navigate = useNavigate()
  const { currentDynasty, advanceWeek, advanceToNewSeason, revertWeek, updateDynasty } = useDynasty()
  const [showV2Migration, setShowV2Migration] = useState(false)
  const [v2MigrationDismissed, setV2MigrationDismissed] = useState(false)
  const { user, signOut } = useAuth()
  const { toast } = useToast()
  const { confirm } = useConfirm()
  const [showWeekDropdown, setShowWeekDropdown] = useState(false)
  const [showClassAdvancementModal, setShowClassAdvancementModal] = useState(false)
  const [playersNeedingConfirmation, setPlayersNeedingConfirmation] = useState([])
  const [showUserMenu, setShowUserMenu] = useState(false)
  const userMenuRef = useRef(null)

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
    if (isCleanButUnstamped(currentDynasty)) {
      // Silent stamp — no modal, no forceOverwrite needed (no keys to delete).
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

  // Check if we're on a player profile page and get the player's team colors
  const playerPageMatch = location.pathname.match(/\/dynasty\/[^/]+\/player\/(\d+)/)
  const viewedPlayerPid = playerPageMatch ? parseInt(playerPageMatch[1]) : null
  const viewedPlayer = viewedPlayerPid && currentDynasty?.players
    ? currentDynasty.players.find(p => p.pid === viewedPlayerPid)
    : null
  // For honor-only players or players with a different team, use their team
  // Player's team field is always kept current (updated on transfer)
  const playerTeamAbbr = viewedPlayer
    ? (viewedPlayer.isHonorOnly ? (viewedPlayer.team || viewedPlayer.teams?.[0]) : viewedPlayer.team)
    : null
  const playerTeamInfo = playerTeamAbbr ? teamAbbreviations[playerTeamAbbr] : null
  const isPlayerPageWithDifferentTeam = !!playerTeamInfo

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
      if (week === 6) return 'National Signing Day'
      if (week === 7) return 'Training Camp'
      if (week >= 2 && week <= 5) return `Recruiting Week ${week - 1} of 4`
      return 'Off-Season'
    }
    const phases = {
      preseason: 'Pre-Season',
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
    // This happens when advancing from postseason to offseason
    if (currentDynasty.currentPhase === 'postseason') {
      const newJobData = currentDynasty.newJobData
      if (newJobData?.takingNewJob === true && (!newJobData.team || !newJobData.position)) {
        toast.warning('Complete your new job selection (team and position) before advancing to the offseason.')
        return
      }
    }

    // Check if advancing from offseason week 5 to week 6 (Signing Day - year flip and class progression)
    if (currentDynasty.currentPhase === 'offseason' && currentDynasty.currentWeek === 5) {
      console.log('[Layout:handleAdvanceWeek] At offseason week 5 - checking for class confirmations')
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
      await advanceToNewSeason(currentDynasty.id)
      await advanceWeek(currentDynasty.id)
      setShowWeekDropdown(false)
      return
    }

    console.log('[Layout:handleAdvanceWeek] Calling advanceWeek for dynasty:', currentDynasty.id)
    try {
      await advanceWeek(currentDynasty.id)
      console.log('[Layout:handleAdvanceWeek] advanceWeek completed successfully')
    } catch (err) {
      console.error('[Layout:handleAdvanceWeek] advanceWeek threw error:', err)
    }
    setShowWeekDropdown(false)
  }

  // Handle class advancement confirmation from modal
  const handleClassAdvancementConfirm = async (confirmations) => {
    if (!currentDynasty) return

    // Advance week with class confirmations (class progression happens at week 5→6)
    await advanceWeek(currentDynasty.id, confirmations)
  }

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


  // Page background - dark theme for all pages
  const getPageBg = () => {
    // All pages use the dark surface background
    return '#111113' // surface-1 - main dark background
  }
  const pageBg = getPageBg()

  return (
    <div
      className="min-h-dvh flex flex-col [overflow-x:clip]"
      style={{ backgroundColor: pageBg }}
    >
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[10002] focus:px-4 focus:py-2 focus:rounded-md focus:font-semibold focus:outline-none focus:ring-2"
        style={{
          backgroundColor: 'var(--surface-3)',
          color: 'var(--text-primary)',
          borderColor: 'var(--team-primary)',
        }}
      >
        Skip to main content
      </a>
      <header
        className="sticky top-0 z-50"
        style={{
          backgroundColor: 'var(--surface-1)',
          borderBottom: '1px solid var(--surface-4)',
        }}
      >
        {/* Thin team-color accent stripe (only on dynasty pages) */}
        {useTeamTheme && (
          <div
            className="h-[3px] w-full"
            style={{ backgroundColor: 'var(--team-primary)' }}
            aria-hidden="true"
          />
        )}
        <div className="w-full px-2 sm:px-4">
          <div className="flex items-center justify-between py-3">
            {/* Left: Burger menu + Home button (dynasty pages only) */}
            <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
              {useTeamTheme && (
                <>
                  <button
                    onClick={() => window.toggleDynastySidebar?.()}
                    className="p-2 rounded-lg hover:opacity-70 transition-opacity"
                    style={{ color: headerText }}
                    aria-label="Toggle sidebar"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                    </svg>
                  </button>
                  {/* Home Button */}
                  <Link
                    to={`/dynasty/${currentDynasty.id}`}
                    className="p-2 rounded-lg hover:opacity-70 transition-opacity"
                    style={{ color: headerText }}
                    title="Dashboard"
                    aria-label="Dashboard"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                    </svg>
                  </Link>
                </>
              )}
            </div>

            {/* Center: Logo + Team info - centered */}
            <div className="flex-1 flex items-center justify-center gap-2 sm:gap-3 min-w-0">
              <Link
                to="/"
                className="flex-shrink-0 relative inline-block"
                aria-label="Dynasty Tracker — beta"
              >
                <img src={logo} alt="Dynasty Tracker" className="h-8 sm:h-10 object-contain" />
                {/* BETA tag — sits on top of the logo's upper-right corner
                    like a sticker. Slight rotation gives it "tag" energy. */}
                <span
                  aria-hidden="true"
                  className="absolute -top-1 -right-2 sm:-top-1.5 sm:-right-3 px-1.5 py-[1px] sm:px-2 sm:py-[2px] rounded-[3px] text-[8px] sm:text-[9px] font-black uppercase tracking-[0.15em] text-white shadow-md pointer-events-none select-none"
                  style={{
                    fontFamily: "'Inter', system-ui, sans-serif",
                    background: 'linear-gradient(135deg, #f59e0b 0%, #f97316 55%, #ef4444 100%)',
                    textShadow: '0 1px 1px rgba(0,0,0,0.35)',
                    boxShadow: '0 2px 6px rgba(239, 68, 68, 0.35), inset 0 1px 0 rgba(255,255,255,0.25)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    transform: 'rotate(8deg)',
                    animation: 'beta-pulse-wiggle 3.2s ease-in-out infinite',
                  }}
                >
                  Beta
                </span>
              </Link>

              {useTeamTheme && (() => {
                // tid-based team info - THE source of truth
                const currentTid = getCurrentTeamTid(currentDynasty)
                const currentTeamName = getCurrentTeamName(currentDynasty)
                const currentTeamLogo = getTeamLogoByTid(currentTid, currentDynasty.teams)
                return (
                <>
                  {/* Separator */}
                  <span className="text-sm" style={{ color: headerText, opacity: 0.3 }}>|</span>

                  {/* Team Logo */}
                  {currentTeamLogo && (
                    <div
                      className="w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{
                        backgroundColor: '#FFFFFF',
                        border: `2px solid ${teamColors.secondary}`,
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
                    <span className="text-xs" style={{ color: headerText, opacity: 0.5 }}>•</span>
                    <span className="font-medium text-xs sm:text-sm truncate" style={{ color: headerText }}>
                      <span className="sm:hidden">
                        {currentDynasty.currentPhase === 'conference_championship' ? 'CC' :
                         currentDynasty.currentPhase === 'regular_season' ? `Wk ${currentDynasty.currentWeek}` :
                         currentDynasty.currentPhase === 'postseason' ? (currentDynasty.currentWeek === 5 ? 'Recap' : (currentDynasty.currentWeek === 4 ? 'Champ' : `Bowl ${currentDynasty.currentWeek}`)) :
                         currentDynasty.currentPhase === 'preseason' ? `Pre ${currentDynasty.currentWeek}` :
                         currentDynasty.currentPhase === 'offseason' ? (
                           currentDynasty.currentWeek === 1 ? 'Leaving' :
                           currentDynasty.currentWeek === 6 ? 'Signing' :
                           currentDynasty.currentWeek === 7 ? 'Training' :
                           currentDynasty.currentWeek === 8 ? 'Transfers' :
                           currentDynasty.currentWeek >= 2 && currentDynasty.currentWeek <= 5 ? `Recruit ${currentDynasty.currentWeek - 1}` :
                           `Off ${currentDynasty.currentWeek}`
                         ) : ''}
                      </span>
                      <span className="hidden sm:inline">
                        {getPhaseDisplay(currentDynasty.currentPhase, currentDynasty.currentWeek)}
                        {currentDynasty.currentPhase !== 'postseason' && currentDynasty.currentPhase !== 'offseason' && currentDynasty.currentPhase !== 'conference_championship' && ` Wk ${currentDynasty.currentWeek}`}
                      </span>
                    </span>
                  </div>
                </>
              )})()}
            </div>

            {useTeamTheme ? (
              <>
                {/* Right: Contact + Advance Week - hugging right edge */}
                <div className="relative flex items-center flex-shrink-0 gap-1">
                  {/* Contact button — quick access to bug reports / feature requests */}
                  <Link
                    to="/contact"
                    className="p-2 rounded-lg hover:opacity-70 transition-opacity"
                    style={{ color: headerText }}
                    title="Contact / Feedback"
                    aria-label="Contact"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                  </Link>

                  {/* Advance Week Button with Dropdown */}
                  <div className="flex items-center">
                    <button
                      onClick={handleAdvanceWeek}
                      className="p-2 rounded-lg hover:opacity-70 transition-opacity"
                      style={{ color: headerText }}
                      title="Advance Week"
                      aria-label="Advance week"
                    >
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                      </svg>
                    </button>
                    <button
                      onClick={() => setShowWeekDropdown(!showWeekDropdown)}
                      className="p-1 rounded-lg hover:opacity-70 transition-opacity -ml-1"
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

      <main id="main" tabIndex={-1} className={`flex-1 ${isHomePage || isAccountPage ? '' : 'px-4 py-6'} ${isDynastyPage || isHomePage || isAccountPage ? '' : 'container mx-auto'}`}>
        {isDynastyPage ? (
          <div key={location.pathname} className="max-w-[1280px] mx-auto w-full page-enter">
            {children}
          </div>
        ) : (
          <div key={location.pathname} className="page-enter">
            {children}
          </div>
        )}
      </main>

      {/* Version Footer - positioned above ticker */}
      <footer className="pb-10 pt-2 px-4 flex items-center justify-end gap-3 text-[10px] sm:text-xs text-txt-tertiary">
        <Link to="/contact" className="hover:text-txt-secondary transition-colors">Contact</Link>
        <span aria-hidden="true">·</span>
        <Link to="/privacy" className="hover:text-txt-secondary transition-colors">Privacy</Link>
        <span aria-hidden="true">·</span>
        <Link to="/terms" className="hover:text-txt-secondary transition-colors">Terms</Link>
        <span aria-hidden="true">·</span>
        <span>v{APP_VERSION}</span>
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
