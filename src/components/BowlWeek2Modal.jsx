import { useState, useEffect, useRef } from 'react'
import { useDynasty, getUserGamePerspective } from '../context/DynastyContext'
import { useAuth } from '../context/AuthContext'
import AuthErrorModal from './AuthErrorModal'
import SheetToolbar from './SheetToolbar'
import {
  createBowlWeek2Sheet,
  readBowlWeek2GamesFromSheet,
  deleteGoogleSheet,
  getSheetEmbedUrl,
  getCFPQuarterfinalGameName,
  isBowlInWeek2
} from '../services/sheetsService'
import { getCurrentTeamAbbr, getCurrentTeamTid, TEAMS, getGameTeamInfo } from '../data/teamRegistry'

const isMobileDevice = () => {
  if (typeof window === 'undefined') return false
  return window.innerWidth < 768 || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
}

export default function BowlWeek2Modal({ isOpen, onClose, onSave, currentYear, teamColors }) {
  const { currentDynasty } = useDynasty()
  const { user, signOut, refreshSession } = useAuth()
  const [refreshing, setRefreshing] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [deletingSheet, setDeletingSheet] = useState(false)
  const [creatingSheet, setCreatingSheet] = useState(false)
  const [sheetId, setSheetId] = useState(null)
  const [showDeletedNote, setShowDeletedNote] = useState(false)
  const [retryCount, setRetryCount] = useState(0)
  const [isMobile, setIsMobile] = useState(false)
  const [showAuthError, setShowAuthError] = useState(false)
  const [useEmbedded, setUseEmbedded] = useState(() => {
    // Load preference from localStorage
    return localStorage.getItem('sheetEmbedPreference') === 'true'
  })
  const [highlightSave, setHighlightSave] = useState(false)
  const [regenerating, setRegenerating] = useState(false)

  // Ref to prevent concurrent sheet creation (state updates are async, refs are immediate)
  const creatingSheetRef = useRef(false)

  useEffect(() => {
    setIsMobile(isMobileDevice())
    const handleResize = () => setIsMobile(isMobileDevice())
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'unset'
    }

    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [isOpen])

  // Highlight save button when user returns to the window
  useEffect(() => {
    if (!isOpen || !sheetId || useEmbedded) return

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        setHighlightSave(true)
        setTimeout(() => setHighlightSave(false), 5000)
      }
    }

    const handleFocus = () => {
      setHighlightSave(true)
      setTimeout(() => setHighlightSave(false), 5000)
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('focus', handleFocus)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('focus', handleFocus)
    }
  }, [isOpen, sheetId, useEmbedded])

  // Create bowl sheet when modal opens
  useEffect(() => {
    const createSheet = async () => {
      if (isOpen && user && !sheetId && !creatingSheet && !creatingSheetRef.current && !showDeletedNote) {
        // Set ref immediately to prevent concurrent calls (state updates are async)
        creatingSheetRef.current = true
        setCreatingSheet(true)
        try {
          // Get CFP data to pre-fill quarterfinal teams
          const cfpSeeds = currentDynasty?.cfpSeedsByYear?.[currentYear] || []

          // Helper to get seed by tid
          const getSeedByTid = (tid) => cfpSeeds.find(s => s.tid === tid)?.seed

          // Read CFP First Round results from unified games[] array
          // Transform to format expected by the sheet: { seed1, seed2, team1, team2, winner }
          const allGames = currentDynasty?.games || []
          const firstRoundResults = allGames
            .filter(g => g &&
              (g.gameType === 'cfp_first_round' || g.isCFPFirstRound) &&
              Number(g.year) === Number(currentYear))
            .map(g => {
              // For user games, compute team1/team2/winner if not set
              let team1 = g.team1
              let team2 = g.team2
              let winner = g.winner
              let seed1 = g.seed1
              let seed2 = g.seed2

              // Check for unified format with tids
              const teams = currentDynasty?.teams || TEAMS
              if (g.team1Tid && g.team2Tid && !team1) {
                const t1Info = getGameTeamInfo(teams, g.team1Tid)
                const t2Info = getGameTeamInfo(teams, g.team2Tid)
                team1 = t1Info?.abbr || g.team1
                team2 = t2Info?.abbr || g.team2
              }

              // Derive winner from winnerTid if not already set (for CPU games in unified format)
              if (!winner && g.winnerTid) {
                const winnerInfo = getGameTeamInfo(teams, g.winnerTid)
                winner = winnerInfo?.abbr
              }

              // Get perspective for user games
              const perspective = getUserGamePerspective(g, currentDynasty)

              // If this is a user game, derive winner from perspective or result
              if (perspective && !winner) {
                const userTeamInfo = perspective.userTid
                  ? getGameTeamInfo(teams, perspective.userTid)
                  : null
                const oppTeamInfo = perspective.opponentTid
                  ? getGameTeamInfo(teams, perspective.opponentTid)
                  : null
                const userTeam = userTeamInfo?.abbr || g.userTeam || getCurrentTeamAbbr(currentDynasty)
                const oppTeam = oppTeamInfo?.abbr || g.opponent
                winner = perspective.userWon ? userTeam : oppTeam

                // Set team1/team2 if not already set
                if (!team1 || !team2) {
                  team1 = userTeam
                  team2 = oppTeam
                }
              } else if (g.opponent && !winner) {
                // Fallback for legacy user games
                const userTeam = g.userTeam || getCurrentTeamAbbr(currentDynasty)
                const oppTeam = g.opponent
                const userWon = g.result === 'win' || g.result === 'W'
                winner = userWon ? userTeam : oppTeam

                // Set team1/team2 if not already set
                if (!team1 || !team2) {
                  team1 = userTeam
                  team2 = oppTeam
                }
              }

              // Compute seeds from cfpSeeds if not set on the game (use tid for lookup)
              if ((!seed1 || !seed2) && (g.team1Tid || g.team2Tid)) {
                const computedSeed1 = getSeedByTid(g.team1Tid)
                const computedSeed2 = getSeedByTid(g.team2Tid)
                // For first round, seeds are paired: 5v12, 6v11, 7v10, 8v9
                // If we only have one seed, compute the other
                if (computedSeed1 && !computedSeed2) {
                  seed1 = computedSeed1
                  seed2 = 17 - computedSeed1
                } else if (!computedSeed1 && computedSeed2) {
                  seed2 = computedSeed2
                  seed1 = 17 - computedSeed2
                } else {
                  seed1 = computedSeed1
                  seed2 = computedSeed2
                }
              }

              return {
                seed1,
                seed2,
                team1,
                team2,
                team1Score: g.team1Score,
                team2Score: g.team2Score,
                winner
              }
            })

          // Calculate which games to exclude (user's CFP QF game + user's Week 2 bowl game)
          const excludeGames = []

          // Check if user is in CFP (seeds 1-12)
          const userTeamTid = getCurrentTeamTid(currentDynasty)
          const userTeamAbbr = getCurrentTeamAbbr(currentDynasty) // Still need abbr for winner comparison
          const userCFPSeed = cfpSeeds.find(s => s.tid === userTeamTid)?.seed || null

          if (userCFPSeed) {
            // Seeds 1-4 have bye, play in QF
            if (userCFPSeed >= 1 && userCFPSeed <= 4) {
              const qfGameName = getCFPQuarterfinalGameName(userCFPSeed)
              if (qfGameName) {
                excludeGames.push(qfGameName)
              }
            }
            // Seeds 5-12 who won First Round also play in QF
            else if (userCFPSeed >= 5 && userCFPSeed <= 12) {
              // Check if user won their First Round game
              const userFirstRoundGame = firstRoundResults.find(g => g && g.winner === userTeamAbbr)
              if (userFirstRoundGame) {
                const qfGameName = getCFPQuarterfinalGameName(userCFPSeed, firstRoundResults)
                if (qfGameName) {
                  excludeGames.push(qfGameName)
                }
              }
            }
          }

          // Check if user has a Week 2 bowl game
          const userBowlGame = currentDynasty?.bowlEligibilityDataByYear?.[currentYear]?.bowlGame
          if (userBowlGame && isBowlInWeek2(userBowlGame)) {
            excludeGames.push(userBowlGame)
          }

          // Get existing bowl week 2 data for pre-filling
          // First get legacy bowlGamesByYear data
          const legacyBowlWeek2 = currentDynasty?.bowlGamesByYear?.[currentYear]?.week2 || []

          // Also check unified games[] array for bowl games
          const unifiedBowlGames = (currentDynasty?.games || [])
            .filter(g => {
              // Check if it's a bowl game from this year
              if (Number(g.year) !== currentYear) return false
              // Check game type - could be 'bowl' or detected by bowlName
              const isBowl = g.gameType === 'bowl' || (g.bowlName && !g.bowlName.includes('CFP'))
              if (!isBowl) return false
              // Only include week 2 bowls
              return isBowlInWeek2(g.bowlName)
            })
            .map(g => {
              // Handle unified format with tids
              const teams = currentDynasty?.teams || TEAMS
              const t1Info = g.team1Tid ? getGameTeamInfo(teams, g.team1Tid) : null
              const t2Info = g.team2Tid ? getGameTeamInfo(teams, g.team2Tid) : null

              // Convert to the format expected by the sheet (team1/team2 style)
              if (g.opponent) {
                // User game - convert from opponent format
                return {
                  bowlName: g.bowlName,
                  team1: g.userTeam || userTeamAbbr,
                  team2: g.opponent,
                  team1Score: g.teamScore,
                  team2Score: g.opponentScore
                }
              } else {
                // CPU game format - handle both legacy (team1/team2) and unified (team1Tid/team2Tid) formats
                return {
                  bowlName: g.bowlName,
                  team1: g.team1 || t1Info?.abbr,
                  team2: g.team2 || t2Info?.abbr,
                  team1Score: g.team1Score,
                  team2Score: g.team2Score
                }
              }
            })

          // Merge legacy and unified, preferring unified (newer) data
          const existingBowlWeek2 = [...legacyBowlWeek2]
          unifiedBowlGames.forEach(ug => {
            const existingIndex = existingBowlWeek2.findIndex(eb => eb.bowlName === ug.bowlName)
            if (existingIndex >= 0) {
              existingBowlWeek2[existingIndex] = ug // Replace with unified data
            } else {
              existingBowlWeek2.push(ug)
            }
          })

          // Read existing CFP Quarterfinal results from unified games[] array
          const existingCFPQuarterfinals = allGames
            .filter(g => g &&
              (g.gameType === 'cfp_quarterfinal' || g.isCFPQuarterfinal) &&
              Number(g.year) === Number(currentYear))
            .map(g => {
              // Handle unified format with tids
              const teams = currentDynasty?.teams || TEAMS
              const t1Info = g.team1Tid ? getGameTeamInfo(teams, g.team1Tid) : null
              const t2Info = g.team2Tid ? getGameTeamInfo(teams, g.team2Tid) : null
              return {
                bowl: g.bowlName,
                team1: g.team1 || t1Info?.abbr,
                team2: g.team2 || t2Info?.abbr,
                score1: g.team1Score,
                score2: g.team2Score,
                winner: g.winner || (g.winnerTid ? getGameTeamInfo(teams, g.winnerTid)?.abbr : null)
              }
            })

          const sheetInfo = await createBowlWeek2Sheet(
            currentDynasty?.teamName || 'Dynasty',
            currentYear,
            cfpSeeds,
            firstRoundResults,
            excludeGames,
            existingBowlWeek2,
            existingCFPQuarterfinals,
            currentDynasty?.teams || currentDynasty?.customTeams
          )
          setSheetId(sheetInfo.spreadsheetId)
        } catch (error) {
          console.error('Failed to create bowl Week 2 sheet:', error)
        } finally {
          setCreatingSheet(false)
          creatingSheetRef.current = false
        }
      }
    }

    createSheet()
  }, [isOpen, user, sheetId, creatingSheet, currentDynasty?.id, retryCount, showDeletedNote])

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setShowDeletedNote(false)
      creatingSheetRef.current = false
      setSheetId(null)
    }
  }, [isOpen])

  const handleSyncFromSheet = async () => {
    if (!sheetId) return

    setSyncing(true)
    try {
      const bowlGames = await readBowlWeek2GamesFromSheet(sheetId)
      await onSave(bowlGames)
      onClose()
    } catch (error) {
      console.error(error)
      if (error.message?.includes('OAuth') || error.message?.includes('access token')) {
        setShowAuthError(true)
      } else {
        alert('Failed to sync from Google Sheets. Make sure data is properly formatted.')
      }
    } finally {
      setSyncing(false)
    }
  }

  const handleSyncAndDelete = async () => {
    if (!sheetId) return

    setDeletingSheet(true)
    try {
      const bowlGames = await readBowlWeek2GamesFromSheet(sheetId)
      await onSave(bowlGames)

      // Move sheet to trash (keep sheet ID stored so user can restore if needed)
      await deleteGoogleSheet(sheetId)

      setSheetId(null)
      setShowDeletedNote(true)
      setTimeout(() => {
        onClose()
      }, 2500)
    } catch (error) {
      console.error(error)
      if (error.message?.includes('OAuth') || error.message?.includes('access token')) {
        setShowAuthError(true)
      } else {
        alert('Failed to sync from Google Sheets.')
      }
    } finally {
      setDeletingSheet(false)
    }
  }

  const handleRegenerateSheet = async () => {
    if (!sheetId) return

    const confirmed = window.confirm('This will delete your current sheet and create a fresh one. Any unsaved data will be lost. Continue?')
    if (!confirmed) return

    setRegenerating(true)
    try {
      await deleteGoogleSheet(sheetId)
      setSheetId(null)
      setRetryCount(c => c + 1)
    } catch (error) {
      console.error('Failed to regenerate sheet:', error)
      if (error.message?.includes('OAuth') || error.message?.includes('access token')) {
        setShowAuthError(true)
      } else {
        alert('Failed to regenerate sheet. Please try again.')
      }
    } finally {
      setRegenerating(false)
    }
  }

  const handleClose = () => {
    onClose()
  }

  if (!isOpen) return null

  const embedUrl = sheetId ? getSheetEmbedUrl(sheetId, 'Bowl Games') : null
  const isLoading = creatingSheet

  return (
    <div
      className="fixed inset-0 top-0 left-0 right-0 bottom-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999] py-8 px-4 sm:p-4"
      style={{ margin: 0 }}
      onMouseDown={handleClose}
    >
      <div
        className="rounded-lg shadow-xl w-full sm:w-[95vw] max-h-[calc(100vh-4rem)] sm:h-[95vh] flex flex-col p-4 sm:p-6"
        style={{ backgroundColor: teamColors.secondary }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold" style={{ color: teamColors.primary }}>
            Bowl Week 2 Results
          </h2>
          <button
            onClick={handleClose}
            className="hover:opacity-70"
            style={{ color: teamColors.primary }}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div
                className="animate-spin w-12 h-12 border-4 rounded-full mx-auto mb-4"
                style={{
                  borderColor: teamColors.primary,
                  borderTopColor: 'transparent'
                }}
              />
              <p className="text-lg font-semibold" style={{ color: teamColors.primary }}>
                Creating Bowl Week 2 Sheet...
              </p>
              <p className="text-sm mt-2" style={{ color: teamColors.primary, opacity: 0.7 }}>
                Setting up 12 bowl games
              </p>
            </div>
          </div>
        ) : showDeletedNote ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center p-8 rounded-lg" style={{ backgroundColor: teamColors.primary }}>
              <svg className="w-16 h-16 mx-auto mb-4" fill="none" stroke={teamColors.secondary} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <p className="text-xl font-bold mb-2" style={{ color: teamColors.secondary }}>
                Saved & Moved to Trash!
              </p>
              <p className="text-sm" style={{ color: teamColors.secondary, opacity: 0.9 }}>
                Bowl Week 2 data saved to your dynasty.
              </p>
            </div>
          </div>
        ) : sheetId ? (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Action Buttons - only show at top for embedded view */}
            {!isMobile && useEmbedded && (
              <div className="mb-3">
                <div className="flex gap-3 flex-wrap items-center">
                  <button
                    onClick={handleSyncAndDelete}
                    disabled={syncing || deletingSheet}
                    className={`px-4 py-2 rounded-lg font-semibold hover:opacity-90 transition-all text-sm ${highlightSave ? 'animate-pulse ring-4 ring-offset-2 scale-105' : ''}`}
                    style={{
                      backgroundColor: teamColors.primary,
                      color: teamColors.secondary
                    }}
                  >
                    {deletingSheet ? 'Saving...' : '✓ Save & Move to Trash'}
                  </button>
                  <button
                    onClick={handleSyncFromSheet}
                    disabled={syncing || deletingSheet}
                    className="px-4 py-2 rounded-lg font-semibold hover:opacity-90 transition-colors text-sm border-2"
                    style={{
                      backgroundColor: 'transparent',
                      borderColor: teamColors.primary,
                      color: teamColors.primary
                    }}
                  >
                    {syncing ? 'Syncing...' : 'Save & Keep Sheet'}
                  </button>
                  <button
                    onClick={handleRegenerateSheet}
                    disabled={syncing || deletingSheet || regenerating}
                    className="px-4 py-2 rounded-lg font-semibold hover:opacity-90 transition-colors text-sm border-2 ml-auto"
                    style={{
                      backgroundColor: 'transparent',
                      borderColor: '#EF4444',
                      color: '#EF4444'
                    }}
                  >
                    {regenerating ? 'Regenerating...' : 'Regenerate sheet'}
                  </button>
                  {highlightSave && (
                    <span className="text-xs font-medium animate-bounce" style={{ color: teamColors.primary }}>

                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Toggle between embedded and new tab */}
            {!isMobile && (
              <div className="flex items-center justify-end mb-2">
                <button
                  onClick={() => {
                    const newValue = !useEmbedded
                    setUseEmbedded(newValue)
                    localStorage.setItem('sheetEmbedPreference', newValue.toString())
                  }}
                  className="text-xs px-3 py-1 rounded-full border transition-colors"
                  style={{
                    borderColor: teamColors.primary,
                    color: teamColors.primary,
                    backgroundColor: 'transparent'
                  }}
                >
                  {useEmbedded ? '← Back to default view' : 'Try embedded view (beta)'}
                </button>
              </div>
            )}

            {isMobile || !useEmbedded ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-4">
                <div className="w-20 h-20 rounded-full flex items-center justify-center mb-6" style={{ backgroundColor: teamColors.primary }}>
                  <svg className="w-10 h-10" fill="none" stroke={teamColors.secondary} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h3 className="text-xl font-bold mb-3" style={{ color: teamColors.primary }}>Edit in Google Sheets</h3>
                <div className="text-left mb-6 max-w-xs">
                  <p className="text-sm font-semibold mb-2" style={{ color: teamColors.primary }}>Instructions:</p>
                  <ol className="text-sm space-y-1.5" style={{ color: teamColors.primary, opacity: 0.8 }}>
                    <li className="flex gap-2"><span className="font-bold">1.</span><span>Tap the button below to open Google Sheets</span></li>
                    <li className="flex gap-2"><span className="font-bold">2.</span><span>Enter Bowl Week 2 results</span></li>
                    <li className="flex gap-2"><span className="font-bold">3.</span><span>Return to this app when done</span></li>
                    <li className="flex gap-2"><span className="font-bold">4.</span><span>Tap "Save" below to sync results</span></li>
                  </ol>
                </div>
                <a href={`https://docs.google.com/spreadsheets/d/${sheetId}/edit`} target="_blank" rel="noopener noreferrer" className="px-6 py-3 rounded-lg font-bold text-lg hover:opacity-90 transition-colors flex items-center gap-2 mb-6" style={{ backgroundColor: '#0F9D58', color: '#FFFFFF' }}>
                  <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14z"/><path d="M7 7h2v2H7zm0 4h2v2H7zm0 4h2v2H7zm4-8h6v2h-6zm0 4h6v2h-6zm0 4h6v2h-6z"/></svg>
                  Open Google Sheets
                </a>

                {/* Centered Save Buttons */}
                <div className="flex flex-col sm:flex-row gap-3 items-center justify-center mb-4">
                  <button
                    onClick={handleSyncAndDelete}
                    disabled={syncing || deletingSheet}
                    className={`px-6 py-3 rounded-lg font-semibold hover:opacity-90 transition-all text-sm ${highlightSave ? 'animate-pulse ring-4 ring-offset-2 scale-105' : ''}`}
                    style={{
                      backgroundColor: teamColors.primary,
                      color: teamColors.secondary
                    }}
                  >
                    {deletingSheet ? 'Saving...' : '✓ Save & Move to Trash'}
                  </button>
                  <button
                    onClick={handleSyncFromSheet}
                    disabled={syncing || deletingSheet}
                    className="px-6 py-3 rounded-lg font-semibold hover:opacity-90 transition-colors text-sm border-2"
                    style={{
                      backgroundColor: 'transparent',
                      borderColor: teamColors.primary,
                      color: teamColors.primary
                    }}
                  >
                    {syncing ? 'Syncing...' : 'Save & Keep Sheet'}
                  </button>
                </div>
                {/* Start Over Button */}
                <button
                  onClick={handleRegenerateSheet}
                  disabled={syncing || deletingSheet || regenerating}
                  className="text-xs px-4 py-2 rounded-lg font-medium hover:opacity-90 transition-colors border mb-4"
                  style={{
                    backgroundColor: 'transparent',
                    borderColor: '#EF4444',
                    color: '#EF4444'
                  }}
                >
                  {regenerating ? 'Regenerating...' : 'Messed up? Regenerate sheet'}
                </button>
                {highlightSave && (
                  <span className="text-sm font-medium animate-bounce mb-4" style={{ color: teamColors.primary }}>

                  </span>
                )}
              </div>
            ) : (
              <>
                <div className="flex-1 flex flex-col overflow-hidden min-h-0">
                  <SheetToolbar
                    sheetId={sheetId}
                    embedUrl={embedUrl}
                    teamColors={teamColors}
                    title="Bowl Week 2 Games Google Sheet"
                    onSessionError={() => setShowAuthError(true)}
                  />
                </div>
                <div className="text-xs mt-2 space-y-1" style={{ color: teamColors.primary, opacity: 0.6 }}>
                  <p><strong>Columns:</strong> Bowl Game | Team 1 | Team 2 | Team 1 Score | Team 2 Score</p>
                  <p>Enter the teams and scores for each bowl game.</p>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <p className="text-lg mb-4" style={{ color: teamColors.primary }}>
                Your session has expired. Click below to refresh.
              </p>
              <div className="flex gap-3 justify-center">
                <button
                  onClick={async () => {
                    setRefreshing(true)
                    try {
                      const success = await refreshSession()
                      if (success) {
                        // Trigger sheet creation retry
                        setRetryCount(c => c + 1)
                      }
                    } catch (e) {
                      console.error('Refresh failed:', e)
                    }
                    setRefreshing(false)
                  }}
                  disabled={refreshing}
                  className="px-4 py-2 rounded font-semibold transition-colors"
                  style={{
                    backgroundColor: teamColors.primary,
                    color: teamColors.primaryText || '#fff',
                    opacity: refreshing ? 0.7 : 1
                  }}
                >
                  {refreshing ? 'Refreshing...' : 'Refresh Session'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Auth Error Modal */}
      <AuthErrorModal
        isOpen={showAuthError}
        onClose={() => setShowAuthError(false)}
        onRefresh={() => setRetryCount(c => c + 1)}
        teamColors={teamColors}
      />
    </div>
  )
}
