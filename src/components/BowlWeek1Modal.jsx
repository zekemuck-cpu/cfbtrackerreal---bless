import { useState, useEffect, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useDynasty } from '../context/DynastyContext'
import { useAuth } from '../context/AuthContext'
import { useToast } from './ui/Toast'
import { useConfirm } from './ui/ConfirmDialog'
import SheetToolbar from './SheetToolbar'
import SheetModalAIHero from './ui/SheetModalAIHero'
import SheetManualEntry from './ui/SheetManualEntry'
import SheetModalFooter from './ui/SheetModalFooter'
import AuthErrorModal from './AuthErrorModal'
import { useAuthErrorHandler } from '../hooks/useAuthErrorHandler'
import {
  createBowlWeek1Sheet,
  readBowlGamesFromSheet,
  deleteGoogleSheet,
  getSheetEmbedUrl,
  getCFPFirstRoundGameName,
  isBowlInWeek1,
} from '../services/sheetsService'
import { getCurrentTeamTid, getCurrentTeamAbbr } from '../data/teamRegistry'
import { getModalColors } from '../utils/colorUtils'
import { buildAIPrompt } from '../utils/aiPrompt'
import SheetLoadingHint from './SheetLoadingHint'

const isMobileDevice = () => {
  if (typeof window === 'undefined') return false
  return window.innerWidth < 768 || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
}

// Rankings week slots: 15=CCG, 16=BowlWk1, 17=BowlWk2, 18=NatChamp
const RANK_WEEK_OPTIONS = [
  { value: 15, label: 'Conf Champ Week' },
  { value: 16, label: 'Bowl Week 1' },
  { value: 17, label: 'Bowl Week 2' },
  { value: 18, label: 'National Championship' },
]

export default function BowlWeek1Modal({ isOpen, onClose, onSave, currentYear, teamColors }) {
  const { currentDynasty, saveRankings } = useDynasty()
  const { user } = useAuth()
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
  const [useEmbedded, setUseEmbedded] = useState(() => localStorage.getItem('sheetEmbedPreference') === 'true')
  const [highlightSave, setHighlightSave] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const creatingSheetRef = useRef(false)

  // Rankings week — which poll slot this bowl-week screenshot targets.
  // Default: Bowl Week 1 (slot 16). User can override if backfilling.
  const [rankWeek, setRankWeek] = useState(16)
  useEffect(() => {
    if (isOpen) setRankWeek(16)
  }, [isOpen])

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
POST-BOWL POLL — paste BELOW the game rows (same tab, same paste)
═══════════════════════════════════════════════════════════
After ALL bowl game rows, leave ONE blank row, then list every team in
the NEW post-Bowl-Week-1 AP Poll (Top 25). This is the poll released
AFTER these games were played.

For each ranked team, output ONE row:
  • Leave Col A BLANK (no bowl name)
  • Col B = team abbreviation (from the TEAM ABBREVIATIONS mapping)
  • Col C = their rank (1–25)
  • Cols D, E = leave blank

Format: \\t<TeamAbbr>\\t<Rank>\\t\\t
(tab, team, tab, rank, tab, tab — Col A blank = no bowl name)

List all 25 ranked teams in rank order (#1 first). If you cannot determine the post-bowl poll from the screenshots (no poll visible), skip this section entirely — do NOT invent rankings.

Example (3 ranked teams, after one blank separator row):
\\tALA\\t1\\t\\t
\\tOHIO\\t2\\t\\t
\\tGA\\t3\\t\\t

═══════════════════════════════════════════════════════════
REQUIRED OUTPUT FORMAT
═══════════════════════════════════════════════════════════
=== BOWL GAMES — paste at cell B2 of "Bowl Games" tab ===
<row1 Team1>\\t<row1 Team2>\\t<row1 T1Score>\\t<row1 T2Score>
<row2 Team1>\\t<row2 Team2>\\t<row2 T1Score>\\t<row2 T2Score>
... (one row per bowl in the screenshot, in the screenshot's order)
\\t\\t\\t\\t           ← blank separator row
\\t<rank1Team>\\t<rank1>\\t\\t
\\t<rank2Team>\\t<rank2>\\t\\t
... (up to 25 poll rows)

(Each \\t above represents a LITERAL TAB character — use actual tab characters in your output, not the text "\\t".)

═══════════════════════════════════════════════════════════
FINAL CHECK before you send the answer
═══════════════════════════════════════════════════════════
[ ] Row count matches the number of bowl rows shown in the screenshot exactly (up to 30)
[ ] Row order matches the screenshot's pre-filled Bowl Game column top-to-bottom
[ ] Exactly 4 tab-separated values per game row (3 tab characters per line)
[ ] Columns B and C are team ABBREVIATIONS only, from the TEAM ABBREVIATIONS mapping
[ ] Scores are INTEGERS only — no commas, no decimals, no "pts"
[ ] For CFP First Round rows: Team 1 is the higher seed, Team 2 is the lower seed
[ ] Blank cells for any unknown scores or unplayed bowls — invented nothing
[ ] Post-bowl poll block present after a blank separator (or omitted if not visible in screenshots)
[ ] Poll rows have blank Col A, team abbr in Col B, rank in Col C
[ ] No header row, no bowl name text, no winner column INSIDE the data. The paste-target label above the fence is required (see Method A/B rules above).`,
    includeTeamMap: true,
    dynastyTeams: currentDynasty?.teams,
  }), [currentYear, currentDynasty?.teams])

  useEffect(() => {
    setIsMobile(isMobileDevice())
    const handleResize = () => setIsMobile(isMobileDevice())
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

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

  useEffect(() => {
    const createSheet = async () => {
      if (isOpen && user && !sheetId && !creatingSheet && !creatingSheetRef.current && !showDeletedNote) {
        creatingSheetRef.current = true
        setCreatingSheet(true)
        try {
          const cfpSeeds = currentDynasty?.cfpSeedsByYear?.[currentYear] || []
          const excludeGames = []

          const userTeamTid = getCurrentTeamTid(currentDynasty)
          const userTeamAbbr = getCurrentTeamAbbr(currentDynasty) || ''
          const userCFPSeed = cfpSeeds.find(s => s.tid === userTeamTid)?.seed || null
          if (userCFPSeed >= 5 && userCFPSeed <= 12) {
            const cfpGameName = getCFPFirstRoundGameName(userCFPSeed)
            if (cfpGameName) excludeGames.push(cfpGameName)
          }

          const userBowlGame = currentDynasty?.bowlEligibilityDataByYear?.[currentYear]?.bowlGame
          if (userBowlGame && isBowlInWeek1(userBowlGame)) {
            excludeGames.push(userBowlGame)
          }

          const legacyBowlWeek1 = currentDynasty?.bowlGamesByYear?.[currentYear]?.week1 || []
          const unifiedBowlGames = (currentDynasty?.games || [])
            .filter(g => {
              if (Number(g.year) !== currentYear) return false
              const isBowl = g.gameType === 'bowl' || (g.bowlName && !g.bowlName.includes('CFP'))
              if (!isBowl) return false
              return isBowlInWeek1(g.bowlName)
            })
            .map(g => {
              if (g.opponent) {
                return { bowlName: g.bowlName, team1: g.userTeam || userTeamAbbr, team2: g.opponent, team1Score: g.teamScore, team2Score: g.opponentScore }
              }
              return { bowlName: g.bowlName, team1: g.team1, team2: g.team2, team1Score: g.team1Score, team2Score: g.team2Score }
            })

          const existingBowlWeek1 = [...legacyBowlWeek1]
          unifiedBowlGames.forEach(ug => {
            const idx = existingBowlWeek1.findIndex(eb => eb.bowlName === ug.bowlName)
            if (idx >= 0) existingBowlWeek1[idx] = ug
            else existingBowlWeek1.push(ug)
          })

          const allGames = currentDynasty?.games || []
          const existingCFPFirstRound = allGames
            .filter(g => g && (g.gameType === 'cfp_first_round' || g.isCFPFirstRound) && Number(g.year) === Number(currentYear))
            .map(g => ({ seed1: g.seed1, seed2: g.seed2, team1: g.team1, team2: g.team2, team1Score: g.team1Score, team2Score: g.team2Score, winner: g.winner }))

          const sheetInfo = await createBowlWeek1Sheet(
            currentDynasty?.teamName || 'Dynasty',
            currentYear,
            cfpSeeds,
            excludeGames,
            existingBowlWeek1,
            existingCFPFirstRound,
            currentDynasty?.teams || currentDynasty?.customTeams,
          )
          setSheetId(sheetInfo.spreadsheetId)
        } catch (error) {
          console.error('Failed to create bowl sheet:', error)
          auth.handleError(error)
        } finally {
          setCreatingSheet(false)
          creatingSheetRef.current = false
        }
      }
    }
    createSheet()
  }, [isOpen, user, sheetId, creatingSheet, currentDynasty?.id, auth.retryCount, showDeletedNote])

  useEffect(() => {
    if (!isOpen) {
      setShowDeletedNote(false)
      creatingSheetRef.current = false
      setSheetId(null)
    }
  }, [isOpen])

  const handleSave = async (alsoDelete) => {
    if (!sheetId) return
    if (alsoDelete) setDeletingSheet(true); else setSyncing(true)
    try {
      const bowlGames = await readBowlGamesFromSheet(sheetId, currentDynasty?.teams || currentDynasty?.customTeams)

      // Save post-bowl poll rankings if the AI included them
      const pollEntries = bowlGames.pollEntries || []
      if (pollEntries.length > 0 && currentDynasty?.id) {
        try {
          await saveRankings(currentDynasty.id, pollEntries, currentYear, rankWeek)
        } catch (e) {
          console.error('Failed to save bowl week 1 rankings:', e)
        }
      }

      await onSave(bowlGames)

      if (alsoDelete) {
        try { await deleteGoogleSheet(sheetId) } catch (e) { console.error('Failed to delete sheet:', e) }
        setSheetId(null)
        setShowDeletedNote(true)
        setTimeout(() => onClose(), 2500)
      } else {
        onClose()
      }
    } catch (error) {
      console.error('Error saving bowl week 1:', error)
      if (!auth.handleError(error)) {
        toast.error(`Failed to sync: ${error.message || 'Unknown error'}`)
      }
    } finally {
      setDeletingSheet(false)
      setSyncing(false)
    }
  }

  const handleRegenerateSheet = async () => {
    if (!sheetId) return
    const confirmed = await confirm({
      title: 'Regenerate sheet?',
      message: 'This will delete your current sheet and create a fresh one. Any unsaved data will be lost.',
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

  if (!isOpen) return null

  const embedUrl = sheetId ? getSheetEmbedUrl(sheetId, 'Bowl Games') : null
  const isLoading = creatingSheet

  const rankWeekSelect = (
    <select
      id="bw1-rank-week"
      value={rankWeek}
      onChange={(e) => setRankWeek(Number(e.target.value))}
      disabled={syncing || deletingSheet}
      className="px-3 py-2 rounded-md bg-surface-2 border border-surface-4 hover:border-surface-5 text-txt-primary text-sm font-medium tabular-nums focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-3 disabled:opacity-60 transition-colors"
    >
      {RANK_WEEK_OPTIONS.map(({ value, label }) => (
        <option key={value} value={value}>{label}</option>
      ))}
    </select>
  )

  return createPortal(
    <div
      className="fixed inset-0 top-0 left-0 right-0 bottom-0 bg-black bg-opacity-70 flex items-center justify-center z-[9999] py-8 px-4 sm:p-4"
      style={{ margin: 0 }}
      onMouseDown={onClose}
    >
      <div
        className={`card-elevated relative w-full max-h-[calc(100dvh-4rem)] flex flex-col overflow-hidden ${
          useEmbedded ? 'sm:w-[95vw] sm:h-[95dvh]' : 'sm:max-w-[680px] sm:h-auto'
        }`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 sm:px-7 py-4 border-b border-surface-4">
          <div className="flex flex-col">
            <span className="text-[11px] font-semibold uppercase tracking-widest text-txt-tertiary mb-0.5">Postseason</span>
            <h2 className="text-xl sm:text-2xl font-bold text-txt-primary tracking-tight tabular-nums">
              {currentYear} Bowl Week 1
            </h2>
          </div>
          <button
            aria-label="Close"
            onClick={onClose}
            className="text-txt-tertiary hover:text-txt-primary transition-colors -mr-1 p-1.5 rounded-md hover:bg-surface-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 flex flex-col overflow-hidden">
          {isLoading ? (
            <div className="flex-1 flex items-center justify-center p-6">
              <div className="text-center">
                <div
                  className="animate-spin w-10 h-10 border-2 rounded-full mx-auto mb-4"
                  style={{ borderColor: 'var(--text-primary)', borderTopColor: 'transparent' }}
                />
                <SheetLoadingHint active={isLoading} />
              </div>
            </div>
          ) : showDeletedNote ? (
            <div className="flex-1 flex items-center justify-center p-6">
              <p className="text-xl font-bold text-txt-primary">Saved</p>
            </div>
          ) : sheetId ? (
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="px-5 sm:px-7 pt-4 pb-3">
                <SheetModalAIHero
                  tagline="Skip the typing. Let AI fill the bowl results."
                  buttons={[{ label: 'Copy AI Prompt', prompt: aiPrompt }]}
                />
              </div>

              {!isMobile && useEmbedded ? (
                <>
                  <div className="px-5 sm:px-7 py-3 border-b border-surface-4 flex flex-wrap gap-2 items-center">
                    <button
                      onClick={() => handleSave(true)}
                      disabled={syncing || deletingSheet}
                      className={`btn-refined btn-refined--solid ${highlightSave ? 'animate-pulse-subtle' : ''}`}
                    >
                      {deletingSheet ? 'Saving…' : 'Save & move to trash'}
                    </button>
                    <button
                      onClick={() => handleSave(false)}
                      disabled={syncing || deletingSheet}
                      className="btn-refined"
                    >
                      {syncing ? 'Saving…' : 'Save & keep sheet'}
                    </button>

                    <span className="mx-1 h-6 w-px bg-surface-4" aria-hidden="true" />

                    <label htmlFor="bw1-rank-week" className="label-xs text-txt-tertiary">
                      Rankings week
                    </label>
                    {rankWeekSelect}

                    <div className="ml-auto flex items-center gap-2">
                      <button
                        onClick={handleDeleteSheetOnly}
                        disabled={syncing || deletingSheet || regenerating}
                        className="btn-refined"
                      >
                        {deletingSheet ? 'Deleting…' : 'Delete sheet'}
                      </button>
                      <button
                        onClick={handleRegenerateSheet}
                        disabled={syncing || deletingSheet || regenerating}
                        className="btn-refined btn-refined--danger"
                      >
                        {regenerating ? 'Regenerating…' : 'Regenerate'}
                      </button>
                    </div>
                  </div>

                  <div className="flex-1 flex flex-col overflow-hidden min-h-0 border border-surface-4 rounded-lg mx-5 sm:mx-7 my-3">
                    <SheetToolbar sheetId={sheetId} embedUrl={embedUrl} teamColors={teamColors} title="Bowl Week 1" />
                  </div>

                  <div className="px-5 sm:px-7 py-2 flex items-center justify-end">
                    <button
                      onClick={() => {
                        const v = !useEmbedded
                        setUseEmbedded(v)
                        localStorage.setItem('sheetEmbedPreference', v.toString())
                      }}
                      className="text-xs text-txt-tertiary hover:text-txt-primary transition-colors underline decoration-dotted underline-offset-4"
                    >
                      ← Back to default view
                    </button>
                  </div>
                </>
              ) : (
                <div className="flex-1 overflow-y-auto">
                  <div className="max-w-md mx-auto px-5 sm:px-7 py-6 flex flex-col gap-5">
                    <SheetManualEntry sheetId={sheetId} />

                    <section className="text-center">
                      <label htmlFor="bw1-rank-week" className="label-xs text-txt-tertiary block mb-2">
                        Rankings week
                      </label>
                      <div className="flex justify-center">
                        {rankWeekSelect}
                      </div>
                      <p className="text-xs text-txt-tertiary mt-2 leading-relaxed">
                        The Top 25 the AI extracts from your screenshot lands in this week's poll slot.
                      </p>
                    </section>

                    <SheetModalFooter
                      syncing={syncing}
                      deletingSheet={deletingSheet}
                      regenerating={regenerating}
                      highlightSave={highlightSave}
                      onSaveAndDelete={() => handleSave(true)}
                      onSaveAndKeep={() => handleSave(false)}
                      onDeleteSheetOnly={handleDeleteSheetOnly}
                      onRegenerate={handleRegenerateSheet}
                      showEmbeddedToggle={!isMobile}
                      useEmbedded={useEmbedded}
                      onToggleEmbedded={() => {
                        const v = !useEmbedded
                        setUseEmbedded(v)
                        localStorage.setItem('sheetEmbedPreference', v.toString())
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>

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
