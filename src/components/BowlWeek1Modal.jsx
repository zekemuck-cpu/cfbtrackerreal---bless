import { useState, useEffect, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useDynasty } from '../context/DynastyContext'
import { useAuth } from '../context/AuthContext'
import { useToast } from './ui/Toast'
import { useConfirm } from './ui/ConfirmDialog'
import SheetModalHeader from './ui/SheetModalHeader'
import SheetModalAIHero from './ui/SheetModalAIHero'
import SheetModalFooter from './ui/SheetModalFooter'
import SheetManualEntry from './ui/SheetManualEntry'
import AuthErrorModal from './AuthErrorModal'
import { useAuthErrorHandler } from '../hooks/useAuthErrorHandler'
import SheetToolbar from './SheetToolbar'
import {
  createBowlWeek1Sheet,
  readBowlGamesFromSheet,
  deleteGoogleSheet,
  getSheetEmbedUrl,
  getCFPFirstRoundGameName,
  isBowlInWeek1
} from '../services/sheetsService'
import { getCurrentTeamTid, getCurrentTeamAbbr } from '../data/teamRegistry'
import { getModalColors } from '../utils/colorUtils'
import { buildAIPrompt } from '../utils/aiPrompt'
import SheetLoadingHint from './SheetLoadingHint'

const isMobileDevice = () => {
  if (typeof window === 'undefined') return false
  return window.innerWidth < 768 || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
}

export default function BowlWeek1Modal({ isOpen, onClose, onSave, currentYear, teamColors }) {
  const { currentDynasty } = useDynasty()
  const { user, signOut } = useAuth()
  const { toast } = useToast()
  const { confirm } = useConfirm()
  const modalColors = useMemo(() => getModalColors(teamColors), [teamColors])
  const [syncing, setSyncing] = useState(false)
  const [deletingSheet, setDeletingSheet] = useState(false)
  const [creatingSheet, setCreatingSheet] = useState(false)
  const [sheetId, setSheetId] = useState(null)
  const [showDeletedNote, setShowDeletedNote] = useState(false)
  const auth = useAuthErrorHandler()
  const [isMobile, setIsMobile] = useState(false)

  const [useEmbedded, setUseEmbedded] = useState(() => {
    // Load preference from localStorage
    return localStorage.getItem('sheetEmbedPreference') === 'true'
  })
  const [highlightSave, setHighlightSave] = useState(false)
  const [regenerating, setRegenerating] = useState(false)

  const aiPrompt = useMemo(() => buildAIPrompt({
    title: `${currentYear} Bowl Week 1 Results`,
    structure: `This sheet has ONE tab: "Bowl Games". It contains up to 30 Week 1 bowl games (26 regular bowls + 4 CFP First Round games). If the user plays in a bowl themselves, that row may be omitted — so the screenshot's actual pre-filled rows are the SOURCE OF TRUTH for how many rows you output.

═══════════════════════════════════════════════════════════
CRITICAL RULES — read before anything else
═══════════════════════════════════════════════════════════
1. OUTPUT COLUMNS B, C, D, E ONLY (4 values per row). Column A (Bowl Game) is PROTECTED and pre-filled.
2. ROW ORDER IS FIXED — match the screenshot EXACTLY. Each row is keyed to the pre-filled Bowl Game name in column A. Never reorder, never rename, never add rows, never remove rows.
3. Output ONE row per bowl shown in the screenshot, with EXACTLY 4 tab-separated values per row.
4. NO COMMAS in numbers. "24" never "1,234".
5. INTEGERS ONLY for scores — no decimals, no "pts".
6. TEAM ABBREVIATIONS ONLY (columns B and C) — use the abbreviation mapping below. Columns B and C are strict dropdowns — wrong text is rejected by the sheet.
7. BLANK CELLS if unknown. Never guess, never use "N/A", "TBD", dash. Zero is only valid if the team truly scored zero.
   - Bowl not yet played: leave all 4 cells blank (4 empty tab-separated fields).
   - Teams known, scores not: fill B and C only; leave D and E blank.
8. No header row, no Bowl Game text, no winner column, no commentary INSIDE the data. The paste-target label above the fence is required (see Method A/B rules above).
9. ONE TSV block — preceded by the paste-target label line as required by the Method A/B rules above.

═══════════════════════════════════════════════════════════
TAB: "Bowl Games" — up to 30 rows × 4 editable columns
Paste your block at cell B2 of the "Bowl Games" tab
═══════════════════════════════════════════════════════════

Column A (Bowl Game) is pre-filled with the bowl game name — match the screenshot. The full pool of possible pre-filled bowl names is listed below so you can recognize each row; the actual sheet contains ONLY those that appear in the screenshot (the user's own bowl may be excluded).

Pre-filled Bowl Game names (possible values in column A, in sheet order):
  1. 68 Ventures Bowl
  2. Alamo Bowl
  3. Arizona Bowl
  4. Armed Forces Bowl
  5. Birmingham Bowl
  6. Boca Raton Bowl
  7. CFP First Round (#8 vs #9)
  8. CFP First Round (#7 vs #10)
  9. CFP First Round (#6 vs #11)
 10. CFP First Round (#5 vs #12)
 11. Cure Bowl
 12. Famous Idaho Potato Bowl
 13. Fenway Bowl
 14. Frisco Bowl
 15. GameAbove Sports Bowl
 16. Gasparilla Bowl
 17. Hawaii Bowl
 18. Holiday Bowl
 19. Independence Bowl
 20. LA Bowl
 21. Las Vegas Bowl
 22. Liberty Bowl
 23. Military Bowl
 24. Music City Bowl
 25. Myrtle Beach Bowl
 26. New Mexico Bowl
 27. New Orleans Bowl
 28. Pop-Tarts Bowl
 29. Rate Bowl
 30. Salute to Veterans Bowl

For each row, in the same top-to-bottom order shown in the screenshot, output these 4 columns:

Col A (PROTECTED)         | Col B (Team 1)   | Col C (Team 2)   | Col D (Team 1 Score) | Col E (Team 2 Score)
--------------------------+------------------+------------------+----------------------+---------------------
pre-filled bowl name      | team abbr        | team abbr        | integer              | integer

Column B, Column C: STRICT dropdown of team abbreviations — use ONLY values from the TEAM ABBREVIATIONS mapping at the bottom of this prompt.
Column D, Column E: integer score (0 or higher), no commas, no decimal point.

CFP First Round rows: For the rows whose Bowl Game name starts with "CFP First Round", Team 1 is the HIGHER seed (the lower seed number: e.g. #5 in "5 vs 12") and Team 2 is the LOWER seed (#12). Do NOT swap them.

═══════════════════════════════════════════════════════════
REQUIRED OUTPUT FORMAT
═══════════════════════════════════════════════════════════
=== BOWL GAMES — paste at cell B2 of "Bowl Games" tab ===
<row1 Team1>\\t<row1 Team2>\\t<row1 T1Score>\\t<row1 T2Score>
<row2 Team1>\\t<row2 Team2>\\t<row2 T1Score>\\t<row2 T2Score>
... (one row per bowl in the screenshot, in the screenshot's order)

(Each \\t above represents a LITERAL TAB character — use actual tab characters in your output, not the text "\\t".)

═══════════════════════════════════════════════════════════
FINAL CHECK before you send the answer
═══════════════════════════════════════════════════════════
[ ] Row count matches the number of bowl rows shown in the screenshot exactly (up to 30)
[ ] Row order matches the screenshot's pre-filled Bowl Game column top-to-bottom
[ ] Exactly 4 tab-separated values per row (3 tab characters per line)
[ ] Columns B and C are team ABBREVIATIONS only, from the TEAM ABBREVIATIONS mapping
[ ] Scores are INTEGERS only — no commas, no decimals, no "pts"
[ ] For CFP First Round rows: Team 1 is the higher seed, Team 2 is the lower seed
[ ] Blank cells for any unknown scores or unplayed bowls — invented nothing
[ ] No header row, no bowl name text, no winner column INSIDE the data. The paste-target label above the fence is required (see Method A/B rules above).`,
    includeTeamMap: true,
    dynastyTeams: currentDynasty?.teams,
  }), [currentYear, currentDynasty?.teams])

  // Ref to prevent concurrent sheet creation (state updates are async, refs are immediate)
  const creatingSheetRef = useRef(false)

  useEffect(() => {
    setIsMobile(isMobileDevice())
    const handleResize = () => setIsMobile(isMobileDevice())
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

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
          // Get CFP seeds to pre-fill First Round teams
          const cfpSeeds = currentDynasty?.cfpSeedsByYear?.[currentYear] || []

          // Calculate which games to exclude (user's CFP First Round game + user's bowl game)
          const excludeGames = []

          // Check if user is in CFP First Round (seeds 5-12)
          const userTeamTid = getCurrentTeamTid(currentDynasty)
          const userTeamAbbr = getCurrentTeamAbbr(currentDynasty) || ''
          const userCFPSeed = cfpSeeds.find(s => s.tid === userTeamTid)?.seed || null
          if (userCFPSeed >= 5 && userCFPSeed <= 12) {
            const cfpGameName = getCFPFirstRoundGameName(userCFPSeed)
            if (cfpGameName) {
              excludeGames.push(cfpGameName)
            }
          }

          // Check if user has a Week 1 bowl game
          const userBowlGame = currentDynasty?.bowlEligibilityDataByYear?.[currentYear]?.bowlGame
          if (userBowlGame && isBowlInWeek1(userBowlGame)) {
            excludeGames.push(userBowlGame)
          }

          // Get existing bowl week 1 data for pre-filling
          // First get legacy bowlGamesByYear data
          const legacyBowlWeek1 = currentDynasty?.bowlGamesByYear?.[currentYear]?.week1 || []

          // Also check unified games[] array for bowl games
          const unifiedBowlGames = (currentDynasty?.games || [])
            .filter(g => {
              // Check if it's a bowl game from this year
              if (Number(g.year) !== currentYear) return false
              // Check game type - could be 'bowl' or detected by bowlName
              const isBowl = g.gameType === 'bowl' || (g.bowlName && !g.bowlName.includes('CFP'))
              if (!isBowl) return false
              // Only include week 1 bowls
              return isBowlInWeek1(g.bowlName)
            })
            .map(g => {
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
                // CPU game format
                return {
                  bowlName: g.bowlName,
                  team1: g.team1,
                  team2: g.team2,
                  team1Score: g.team1Score,
                  team2Score: g.team2Score
                }
              }
            })

          // Merge legacy and unified, preferring unified (newer) data
          const existingBowlWeek1 = [...legacyBowlWeek1]
          unifiedBowlGames.forEach(ug => {
            const existingIndex = existingBowlWeek1.findIndex(eb => eb.bowlName === ug.bowlName)
            if (existingIndex >= 0) {
              existingBowlWeek1[existingIndex] = ug // Replace with unified data
            } else {
              existingBowlWeek1.push(ug)
            }
          })

          // Read existing CFP First Round results from unified games[] array
          const allGames = currentDynasty?.games || []
          const existingCFPFirstRound = allGames
            .filter(g => g &&
              (g.gameType === 'cfp_first_round' || g.isCFPFirstRound) &&
              Number(g.year) === Number(currentYear))
            .map(g => ({
              seed1: g.seed1,
              seed2: g.seed2,
              team1: g.team1,
              team2: g.team2,
              team1Score: g.team1Score,
              team2Score: g.team2Score,
              winner: g.winner
            }))

          const sheetInfo = await createBowlWeek1Sheet(
            currentDynasty?.teamName || 'Dynasty',
            currentYear,
            cfpSeeds,
            excludeGames,
            existingBowlWeek1,
            existingCFPFirstRound,
            currentDynasty?.teams || currentDynasty?.customTeams
          )
          setSheetId(sheetInfo.spreadsheetId)
        } catch (error) {
          console.error('Failed to create bowl sheet:', error)
          // Route OAuth/auth errors through the auth-error modal so the
          // user sees an actionable prompt instead of a silent failure.
          // Other catches in this modal already use this pattern; the
          // sheet-creation catch was missed and just console.error-d
          // ("Try refreshing your session or sign out and sign back in"
          //  was never surfaced to the user).
          auth.handleError(error)
        } finally {
          setCreatingSheet(false)
          creatingSheetRef.current = false
        }
      }
    }

    createSheet()
  }, [isOpen, user, sheetId, creatingSheet, currentDynasty?.id, auth.retryCount, showDeletedNote])

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
      const bowlGames = await readBowlGamesFromSheet(sheetId, (currentDynasty?.teams || currentDynasty?.customTeams))
      await onSave(bowlGames)
      onClose()
    } catch (error) {
      console.error(error)
      if (!auth.handleError(error)) {
        toast.error('Failed to sync from Google Sheets. Make sure data is properly formatted.')
      }
    } finally {
      setSyncing(false)
    }
  }

  const handleSyncAndDelete = async () => {
    if (!sheetId) return

    setDeletingSheet(true)
    try {
      const bowlGames = await readBowlGamesFromSheet(sheetId, (currentDynasty?.teams || currentDynasty?.customTeams))
      await onSave(bowlGames)

      // Move sheet to trash (keep sheet ID stored so user can restore if needed)
      await deleteGoogleSheet(sheetId)

      setSheetId(null)
      setShowDeletedNote(true)
      setTimeout(() => {
        onClose()
      }, 2500)
    } catch (error) {
      console.error('Error in handleSyncAndDelete:', error)
      if (!auth.handleError(error)) {
        toast.error(`Failed to sync/delete: ${error.message || 'Unknown error'}`)
      }
    } finally {
      setDeletingSheet(false)
    }
  }

  const handleRegenerateSheet = async () => {
    if (!sheetId) return

    const confirmed = await confirm({
      title: 'Regenerate sheet?',
      message: "This will delete your current sheet and create a fresh one. Any unsaved data will be lost.",
      confirmLabel: 'Regenerate',
      variant: 'danger',
    })
    if (!confirmed) return

    setRegenerating(true)
    try {
      await deleteGoogleSheet(sheetId)
      setSheetId(null)
      auth.retry()
    } catch (error) {
      console.error('Failed to regenerate sheet:', error)
      if (!auth.handleError(error)) {
        toast.error('Failed to regenerate sheet. Please try again.')
      }
    } finally {
      setRegenerating(false)
    }
  }

  const handleDeleteSheetOnly = async () => {
    if (!sheetId || !currentDynasty) return
    const ok = await confirm({
      title: 'Delete this bowl week 1 sheet?',
      message: 'This deletes the Google Sheet without applying any edits. Your dynasty bowl game results stay as-is.',
      confirmLabel: 'Delete',
      variant: 'danger',
    })
    if (!ok) return
    setDeletingSheet(true)
    try {
      await deleteGoogleSheet(sheetId)
      setSheetId(null)
      setShowDeletedNote(true)
      setTimeout(() => onClose(), 1800)
    } catch (error) {
      console.error('Failed to delete sheet:', error)
      if (!auth.handleError(error)) {
        toast.error('Failed to delete the sheet — try again.')
      }
    } finally {
      setDeletingSheet(false)
    }
  }

  const handleClose = () => {
    onClose()
  }

  if (!isOpen) return null

  const embedUrl = sheetId ? getSheetEmbedUrl(sheetId, 'Bowl Games') : null
  const isLoading = creatingSheet

  return createPortal(
    <div
      className="fixed inset-0 top-0 left-0 right-0 bottom-0 bg-black bg-opacity-70 flex items-center justify-center z-[9999] py-8 px-4 sm:p-4"
      style={{ margin: 0 }}
      onMouseDown={handleClose}
    >
      <div
        className={`card-elevated w-full max-h-[calc(100dvh-4rem)] flex flex-col overflow-hidden ${
          useEmbedded
            ? 'sm:w-[95vw] sm:h-[95dvh]'
            : 'sm:max-w-[680px] sm:h-auto'
        }`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <SheetModalHeader eyebrow="Postseason" title={`${currentYear} Bowl Week 1`} onClose={handleClose} />

        <div className="flex-1 flex flex-col overflow-hidden p-4 sm:p-6">
        {isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div
                className="animate-spin w-12 h-12 border-4 rounded-full mx-auto mb-4"
                style={{
                  borderColor: 'var(--text-primary)',
                  borderTopColor: 'transparent'
                }}
              />
              <SheetLoadingHint active={isLoading} />
            </div>
          </div>
        ) : showDeletedNote ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-xl font-bold text-txt-primary">Saved</p>
          </div>
        ) : sheetId ? (
          <div className="flex-1 flex flex-col overflow-hidden gap-3">
            <SheetModalAIHero
              tagline="Skip the typing. Let AI fill the bowl results."
              buttons={[{ label: 'Copy AI Prompt', prompt: aiPrompt }]}
            />
            {isMobile || !useEmbedded ? (
              <SheetManualEntry sheetId={sheetId} />
            ) : (
              <div className="flex-1 flex flex-col overflow-hidden min-h-0 border border-surface-4 rounded-lg">
                <SheetToolbar sheetId={sheetId} embedUrl={embedUrl} teamColors={teamColors} title="Bowl Week 1" />
              </div>
            )}
            <SheetModalFooter
              syncing={syncing}
              deletingSheet={deletingSheet}
              regenerating={regenerating}
              highlightSave={highlightSave}
              onSaveAndDelete={handleSyncAndDelete}
              onSaveAndKeep={handleSyncFromSheet}
              onDeleteSheetOnly={handleDeleteSheetOnly}
              onRegenerate={handleRegenerateSheet}
              showEmbeddedToggle={!isMobile}
              useEmbedded={useEmbedded}
              onToggleEmbedded={() => { const newValue = !useEmbedded; setUseEmbedded(newValue); localStorage.setItem('sheetEmbedPreference', newValue.toString()); }}
            />
          </div>
        ) : null}
        </div>
      </div>

      {/* Auth Error Modal */}
      <AuthErrorModal
        isOpen={auth.showAuthError}
        onClose={auth.closeAuthError}
        onRefresh={auth.retry}
        teamColors={teamColors}
      />

    </div>,
    document.body,
  )
}
