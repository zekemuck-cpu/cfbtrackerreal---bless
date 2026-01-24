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
import logo from '../assets/logo.png'

export default function Layout({ children }) {
  const location = useLocation()
  const navigate = useNavigate()
  const { currentDynasty, advanceWeek, advanceToNewSeason, revertWeek } = useDynasty()
  const { user, signOut } = useAuth()
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
  // Now uses tid-based URLs like /team/7/2027, /recruiting/7/2027, /team-stats/7/2027
  const teamsSource = currentDynasty?.teams || TEAMS

  // Match team page: /team/:tid or /team/:tid/:year
  const teamPageMatch = location.pathname.match(/\/dynasty\/[^/]+\/team\/(\d+)/)
  // Match recruiting page: /recruiting/:tid/:year
  const recruitingPageMatch = location.pathname.match(/\/dynasty\/[^/]+\/recruiting\/(\d+)/)
  // Match team-stats page: /team-stats/:tid/:year
  const teamStatsPageMatch = location.pathname.match(/\/dynasty\/[^/]+\/team-stats\/(\d+)/)

  const viewedTeamTid = teamPageMatch ? parseInt(teamPageMatch[1], 10)
    : recruitingPageMatch ? parseInt(recruitingPageMatch[1], 10)
    : teamStatsPageMatch ? parseInt(teamStatsPageMatch[1], 10)
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

  const headerBg = useTeamTheme ? teamColors.primary : '#1f2937'
  const headerText = useTeamTheme ? getContrastTextColor(teamColors.primary) : '#f9fafb'
  const buttonBg = useTeamTheme ? teamColors.secondary : '#f9fafb'
  const buttonText = useTeamTheme ? getContrastTextColor(teamColors.secondary) : '#1f2937'

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
      alert('Please complete schedule, roster, and team ratings before advancing to the regular season.')
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
          alert(`Please enter the Week ${currentDynasty.currentWeek} game before advancing.`)
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
        alert('Please answer whether you made the conference championship before advancing.')
        return
      }
      // If they made the championship, check if they entered the game
      if (ccData?.madeChampionship === true) {
        const ccGame = currentDynasty.games?.find(
          g => g.isConferenceChampionship && Number(g.year) === Number(currentDynasty.currentYear)
        )
        if (!ccGame) {
          alert('Please enter your conference championship game before advancing.')
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
        const confirmAdvance = window.confirm(
          `You have only entered ${enteredCount}/${expectedCount} Conference Championship results. Are you sure you want to advance?`
        )
        if (!confirmAdvance) {
          return
        }
      }
    }

    // In postseason weeks 2+, check bowl game entries (including CFP games)
    if (currentDynasty.currentPhase === 'postseason' && currentDynasty.currentWeek >= 2) {
      const year = currentDynasty.currentYear
      const allGames = currentDynasty.games || []
      const cfpResults = currentDynasty.cfpResultsByYear?.[year] || {}

      // Count Week 1 bowl games (19 regular bowls + 4 CFP first round = 23)
      // Check games[] first, then legacy bowlGamesByYear
      const bowlWeek1FromGames = allGames.filter(g => g && g.isBowlGame && g.bowlWeek === 'week1' && Number(g.year) === Number(year))
      const bowlWeek1Legacy = currentDynasty.bowlGamesByYear?.[year]?.week1 || []
      const cfpFirstRoundFromGames = allGames.filter(g => g && g.isCFPFirstRound && Number(g.year) === Number(year))
      const cfpFirstRoundLegacy = cfpResults.firstRound || []

      const bowlWeek1Games = bowlWeek1FromGames.length > 0 ? bowlWeek1FromGames : bowlWeek1Legacy
      const cfpFirstRoundGames = cfpFirstRoundFromGames.length > 0 ? cfpFirstRoundFromGames : cfpFirstRoundLegacy

      const enteredBowlWeek1 = bowlWeek1Games.filter(g => g && g.team1Score !== undefined && g.team1Score !== null).length
      const enteredCFPFirstRound = cfpFirstRoundGames.filter(g => g && g.team1Score !== undefined && g.team1Score !== null).length

      // Count Week 2 bowl games (11 regular bowls)
      const bowlWeek2FromGames = allGames.filter(g => g && g.isBowlGame && g.bowlWeek === 'week2' && Number(g.year) === Number(year))
      const bowlWeek2Legacy = currentDynasty.bowlGamesByYear?.[year]?.week2 || []
      const bowlWeek2Games = bowlWeek2FromGames.length > 0 ? bowlWeek2FromGames : bowlWeek2Legacy
      const enteredBowlWeek2 = bowlWeek2Games.filter(g => g && g.team1Score !== undefined && g.team1Score !== null).length

      // Count CFP Quarterfinals (4 games)
      const cfpQuartersFromGames = allGames.filter(g => g && g.isCFPQuarterfinal && Number(g.year) === Number(year))
      const cfpQuartersLegacy = cfpResults.quarterfinals || []
      const cfpQuarterGames = cfpQuartersFromGames.length > 0 ? cfpQuartersFromGames : cfpQuartersLegacy
      const enteredCFPQuarters = cfpQuarterGames.filter(g => g && g.team1Score !== undefined && g.team1Score !== null).length

      // Count CFP Semifinals (2 games)
      const cfpSemisFromGames = allGames.filter(g => g && g.isCFPSemifinal && Number(g.year) === Number(year))
      const cfpSemisLegacy = cfpResults.semifinals || []
      const cfpSemiGames = cfpSemisFromGames.length > 0 ? cfpSemisFromGames : cfpSemisLegacy
      const enteredCFPSemis = cfpSemiGames.filter(g => g && g.team1Score !== undefined && g.team1Score !== null).length

      // Count CFP Championship (1 game)
      const cfpChampFromGames = allGames.filter(g => g && g.isCFPChampionship && Number(g.year) === Number(year))
      const cfpChampLegacy = cfpResults.championship || []
      const cfpChampGames = cfpChampFromGames.length > 0 ? cfpChampFromGames : cfpChampLegacy
      const enteredCFPChamp = cfpChampGames.filter(g => g && g.team1Score !== undefined && g.team1Score !== null).length

      const totalEnteredGames = enteredBowlWeek1 + enteredCFPFirstRound + enteredBowlWeek2 + enteredCFPQuarters + enteredCFPSemis + enteredCFPChamp
      // 19 Week1 bowls + 4 CFP R1 + 11 Week2 bowls + 4 CFP QF + 2 CFP SF + 1 CFP Champ = 41 total
      const expectedBowlGames = 41

      if (totalEnteredGames < expectedBowlGames) {
        const confirmAdvance = window.confirm(
          `You have only entered ${totalEnteredGames}/${expectedBowlGames} bowl games. Are you sure you want to advance?`
        )
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
        alert('Please complete your new job selection (team and position) before advancing to the offseason.')
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

  const handleRevertWeek = () => {
    if (!currentDynasty) return

    // Confirm before reverting
    const confirmMessage = currentDynasty.currentPhase === 'preseason' && currentDynasty.currentWeek === 0
      ? 'This will revert to the previous year\'s offseason. Any data from this preseason will be lost. Continue?'
      : 'This will go back one week and remove any game data from the current week. Continue?'

    if (!window.confirm(confirmMessage)) {
      setShowWeekDropdown(false)
      return
    }

    revertWeek(currentDynasty.id)
    setShowWeekDropdown(false)
  }


  // Page background - dark theme for all pages
  const getPageBg = () => {
    // All pages use the dark surface background
    return '#111113' // surface-1 - main dark background
  }
  const pageBg = getPageBg()

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ backgroundColor: pageBg }}
    >
      <header
        className="sticky top-0 z-50 shadow-sm"
        style={{
          backgroundColor: headerBg,
          borderBottom: useTeamTheme ? `3px solid ${teamColors.secondary}` : '3px solid #374151'
        }}
      >
        <div className="w-full px-2 sm:px-4">
          <div className="flex items-center justify-between py-3">
            {/* Left: Burger menu + Home button (dynasty) OR AI Settings (home page) */}
            <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
              {useTeamTheme ? (
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
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                    </svg>
                  </Link>
                </>
              ) : (
                /* AI Settings on left side of home page header */
                user && (
                  <Link
                    to="/ai-settings"
                    className="text-sm px-3 py-1.5 rounded transition-colors hover:bg-white/20 whitespace-nowrap"
                    style={{ color: headerText }}
                  >
                    AI Settings
                  </Link>
                )
              )}
            </div>

            {/* Center: Logo + Team info - centered */}
            <div className="flex-1 flex items-center justify-center gap-2 sm:gap-3 min-w-0">
              <Link to="/" className="flex-shrink-0">
                <img src={logo} alt="Dynasty Tracker" className="h-8 sm:h-10 object-contain" />
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
                         currentDynasty.currentPhase === 'offseason' ? (currentDynasty.currentWeek === 1 ? 'Leaving' : `Off ${currentDynasty.currentWeek}`) : ''}
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
                {/* Right: Advance Week Button - hugging right edge */}
                <div className="relative flex items-center flex-shrink-0">
                  {/* Advance Week Button with Dropdown */}
                  <div className="flex items-center">
                    <button
                      onClick={handleAdvanceWeek}
                      className="p-2 rounded-lg hover:opacity-70 transition-opacity"
                      style={{ color: headerText }}
                      title="Advance Week"
                    >
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                      </svg>
                    </button>
                    <button
                      onClick={() => setShowWeekDropdown(!showWeekDropdown)}
                      className="p-1 rounded-lg hover:opacity-70 transition-opacity -ml-1"
                      style={{ color: headerText }}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                  </div>

                  {/* Dropdown Menu */}
                  {showWeekDropdown && (
                    <>
                      {/* Backdrop to close dropdown */}
                      <div
                        className="fixed inset-0 z-40"
                        onClick={() => setShowWeekDropdown(false)}
                      />
                      <div
                        className="absolute right-0 top-full mt-1 w-36 rounded-lg shadow-lg z-50 overflow-hidden bg-gray-800"
                      >
                        <button
                          onClick={handleRevertWeek}
                          className="w-full px-4 py-2 text-left text-sm font-medium hover:bg-gray-700 transition-colors flex items-center gap-2 text-gray-100"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                      className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/20 transition-colors"
                    >
                      {user.photoURL ? (
                        <img
                          src={user.photoURL}
                          alt={user.displayName || 'User'}
                          className="w-8 h-8 rounded-full border-2 border-white/30"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-sm font-medium" style={{ color: headerText }}>
                          {(user.displayName || user.email || 'U')[0].toUpperCase()}
                        </div>
                      )}
                      <div className="hidden sm:block text-left">
                        <p className="text-sm font-medium truncate max-w-[120px]" style={{ color: headerText }}>
                          {user.displayName || 'User'}
                        </p>
                      </div>
                      <svg className={`w-4 h-4 transition-transform ${showUserMenu ? 'rotate-180' : ''}`} style={{ color: headerText }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>

                    {/* User dropdown menu */}
                    {showUserMenu && (
                      <div className="absolute right-0 mt-2 w-64 bg-gray-800 rounded-lg shadow-xl border border-gray-700 py-2 z-50">
                        <div className="px-4 py-2 border-b border-gray-700">
                          <p className="text-sm font-medium text-white">{user.displayName || 'User'}</p>
                          <p className="text-xs text-gray-400 truncate">{user.email}</p>
                        </div>
                        <Link
                          to="/account"
                          onClick={() => setShowUserMenu(false)}
                          className="w-full px-4 py-2 text-left text-sm text-gray-300 hover:bg-gray-700 flex items-center gap-2"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                          </svg>
                          Account & Subscription
                        </Link>
                        <button
                          onClick={handleSignOut}
                          className="w-full px-4 py-2 text-left text-sm text-gray-300 hover:bg-gray-700 flex items-center gap-2"
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
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-white/20 text-sm transition-colors"
                    style={{ color: headerText }}
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

      <main className={`flex-1 ${isHomePage || isAccountPage ? '' : 'px-4 py-6'} ${isDynastyPage || isHomePage || isAccountPage ? '' : 'container mx-auto'}`}>
        {/* Dynasty pages get a max-width container for better desktop experience */}
        {isDynastyPage ? (
          <div className="max-w-[1400px] mx-auto w-full">
            {children}
          </div>
        ) : (
          children
        )}
      </main>

      {/* Class Advancement Modal - shown when advancing to new season with players needing confirmation */}
      <ClassAdvancementModal
        isOpen={showClassAdvancementModal}
        onClose={() => setShowClassAdvancementModal(false)}
        onConfirm={handleClassAdvancementConfirm}
        players={playersNeedingConfirmation}
        teamColors={teamColors}
        year={currentDynasty?.currentYear}
      />
    </div>
  )
}
