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
  createCFPQuarterfinalsSheet,
  readCFPQuarterfinalsFromSheet,
  deleteGoogleSheet,
  getSheetEmbedUrl
} from '../services/sheetsService'
import { getModalColors } from '../utils/colorUtils'
import { buildAIPrompt } from '../utils/aiPrompt'
import SheetLoadingHint from './SheetLoadingHint'
import LocalDataEntry from './ui/LocalDataEntry'
import { splitTsv } from '../utils/tsvParse'
import { getTeamNameOptions, getTeamNameAliases } from '../data/teamRegistry'

// The QF bracket's fixed bye-seed display order. The reader keys slot
// determination off this order (rowToByeSeed in
// readCFPQuarterfinalsFromSheet), so the local-import path must place each
// game at THIS index for that array to assign the right seed1/cfpSlot.
const CFP_QF_ROW_TO_BYE_SEED = [4, 1, 3, 2]
// Default CFP bowl names per bye seed — mirrors DEFAULT_BOWL_CONFIG used by
// the seeds/semifinal modals. Only used when the dynasty hasn't configured
// custom bowl names for the year.
const DEFAULT_QF_BOWL_CONFIG = {
  seed1: 'Sugar Bowl',
  seed2: 'Cotton Bowl',
  seed3: 'Rose Bowl',
  seed4: 'Orange Bowl',
}
// Which First Round matchup feeds each bye seed's quarterfinal (the bye seed
// plays the winner of these two seeds). Mirrors the createCFPQuarterfinalsSheet
// matchup table.
const CFP_QF_OPPONENT_GAME = {
  1: '8 vs 9',
  2: '7 vs 10',
  3: '6 vs 11',
  4: '5 vs 12',
}

const isMobileDevice = () => {
  if (typeof window === 'undefined') return false
  return window.innerWidth < 768 || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
}

export default function CFPQuarterfinalsModal({ isOpen, onClose, onSave, currentYear, teamColors }) {
  const { currentDynasty } = useDynasty()
  const { user, signOut } = useAuth()
  const { toast } = useToast()
  const { confirm } = useConfirm()
  const modalColors = useMemo(() => getModalColors(teamColors), [teamColors])
  const [syncing, setSyncing] = useState(false)
  const [deletingSheet, setDeletingSheet] = useState(false)
  const [creatingSheet, setCreatingSheet] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const [sheetId, setSheetId] = useState(null)
  const [showDeletedNote, setShowDeletedNote] = useState(false)
  const auth = useAuthErrorHandler()
  const [isMobile, setIsMobile] = useState(false)
  const teamAbbrs = useMemo(() => getTeamNameOptions(currentDynasty?.teams, { includeFCS: false }), [currentDynasty?.teams])
  // Local paste is the DEFAULT; the Google Sheet flow is the opt-in fallback.
  const [useLocal, setUseLocal] = useState(true)

  const [useEmbedded, setUseEmbedded] = useState(() => {
    // Load preference from localStorage
    return localStorage.getItem('sheetEmbedPreference') === 'true'
  })
  const [highlightSave, setHighlightSave] = useState(false)

  const aiPrompt = useMemo(() => buildAIPrompt({
    title: `${currentYear} CFP Quarterfinals Results`,
    structure: `This sheet has ONE tab: "CFP Quarterfinals". It contains 4 quarterfinal bowl games (each pairing a bye seed 1-4 against a First Round winner from seeds 5-12).

═══════════════════════════════════════════════════════════
CRITICAL RULES — read before anything else
═══════════════════════════════════════════════════════════
1. OUTPUT COLUMNS B, C, D, E, F ONLY (5 values per row). Column A (Bowl Game) is pre-filled and must not be changed.
2. ROW ORDER IS FIXED (bracket display order): row 1 = seed-4 bye bowl, row 2 = seed-1 bye bowl, row 3 = seed-3 bye bowl, row 4 = seed-2 bye bowl. Rows are keyed to the pre-filled Bowl Game column — do not reorder.
3. Output EXACTLY 4 data rows, each with EXACTLY 5 tab-separated values.
4. NO COMMAS in numbers. Output "28" never "1,234".
5. INTEGERS ONLY for scores — no decimals, no "pts", no minus signs.
6. TEAM NAMES ONLY (columns B, C, F) — use the TEAM NAMES list below. Never an abbreviation, nickname, mascot, or city.
7. WINNER (column F) must EXACTLY equal whichever team name in that row's columns B or C has the higher score. If the two scores are tied or blank, leave Winner blank.
8. BLANK CELL if unknown. Never guess, never use "N/A", "TBD", dash. Zero (0) is only valid if the team truly scored zero.
   - If an entire game hasn't been played: leave all 5 cells blank.
   - If teams are known but scores aren't: fill columns B and C only; leave D, E, F blank.
9. Team 1 (column B) is always the bye seed (1, 2, 3, or 4). Team 2 (column C) is always the First Round winner that advanced into that bowl. Do not swap them.
10. No header row, no Bowl Game text, no commentary or explanation INSIDE the data.
11. ONE TSV block — preceded by its "=== CFP QUARTERFINALS ===" label above the fence.

═══════════════════════════════════════════════════════════
SECTION: "CFP Quarterfinals" — 4 rows × 5 editable columns
═══════════════════════════════════════════════════════════

Column A (Bowl Game) shows which CFP bowl game hosts that matchup — the specific bowl names (Sugar, Cotton, Rose, Orange, or whatever the user configured) are already pre-filled and must not be changed. Focus on the 5 editable columns below.

Row | Col A (PROTECTED)    | Col B (Team 1 = bye seed) | Col C (Team 2 = First Round winner) | Col D (Team 1 Score) | Col E (Team 2 Score) | Col F (Winner)
----+----------------------+---------------------------+-------------------------------------+----------------------+----------------------+--------------------------------
  1 | bowl hosting seed-4  | #4 seed team name         | winner of 5-vs-12 First Round game  | integer              | integer              | name matching higher scorer
  2 | bowl hosting seed-1  | #1 seed team name         | winner of 8-vs-9 First Round game   | integer              | integer              | name matching higher scorer
  3 | bowl hosting seed-3  | #3 seed team name         | winner of 6-vs-11 First Round game  | integer              | integer              | name matching higher scorer
  4 | bowl hosting seed-2  | #2 seed team name         | winner of 7-vs-10 First Round game  | integer              | integer              | name matching higher scorer

Columns B, C, F: team name from the TEAM NAMES list below.
Columns D, E: integer score (0 or higher), no commas, no decimal point.
Column F (Winner) rule: Winner === (Team 1 Score > Team 2 Score) ? Team 1 name : Team 2 name. Winner MUST equal whichever of columns B/C has the higher score.

═══════════════════════════════════════════════════════════
REQUIRED OUTPUT FORMAT
═══════════════════════════════════════════════════════════
=== CFP QUARTERFINALS ===
<row1 Team1>\\t<row1 Team2>\\t<row1 T1Score>\\t<row1 T2Score>\\t<row1 Winner>
<row2 Team1>\\t<row2 Team2>\\t<row2 T1Score>\\t<row2 T2Score>\\t<row2 Winner>
<row3 Team1>\\t<row3 Team2>\\t<row3 T1Score>\\t<row3 T2Score>\\t<row3 Winner>
<row4 Team1>\\t<row4 Team2>\\t<row4 T1Score>\\t<row4 T2Score>\\t<row4 Winner>

(Each \\t above represents a LITERAL TAB character — use actual tab characters in your output, not the text "\\t".)

═══════════════════════════════════════════════════════════
FINAL CHECK before you send the answer
═══════════════════════════════════════════════════════════
[ ] Exactly 4 data rows (not 3, not 5)
[ ] Exactly 5 tab-separated values per row (4 tab characters per line)
[ ] Row order: seed-4 bowl, seed-1 bowl, seed-3 bowl, seed-2 bowl (matches the protected Bowl Game column)
[ ] Columns B and C use TEAM NAMES only
[ ] Team 1 is always the bye seed, Team 2 is always the First Round winner (not swapped)
[ ] Scores are INTEGERS only, no commas or decimals
[ ] Winner column matches the team name with the higher score (or blank if tied/unknown)
[ ] Blank cells for any unknowns — I invented nothing`,
    includeTeamMap: true,
    dynastyTeams: currentDynasty?.teams,
  }), [currentYear, currentDynasty?.teams])

  // LOCAL-PASTE prompt: SELF-DESCRIBING rows. Each line LEADS with the bye
  // seed (1-4), which is the identity the bracket needs — so there is NO
  // pre-filled Bowl Game column to align against and NO fixed row order. The
  // import path re-places each game into the bracket slot by its explicit bye
  // seed (not by row position), and looks the configured bowl name up locally.
  const localAiPrompt = useMemo(() => buildAIPrompt({
    title: `${currentYear} CFP Quarterfinals Results`,
    structure: `Output ONE line per CFP Quarterfinal game whose result you can see. Each line is SELF-DESCRIBING — it LEADS with the BYE SEED (1, 2, 3, or 4) — so there is NO pre-filled column to line up against and NO fixed row order.

The CFP Quarterfinals pair each top-4 BYE SEED against the winner of a First Round game:
  • Bye seed 1 hosts the winner of the ${CFP_QF_OPPONENT_GAME[1]} First Round game
  • Bye seed 2 hosts the winner of the ${CFP_QF_OPPONENT_GAME[2]} First Round game
  • Bye seed 3 hosts the winner of the ${CFP_QF_OPPONENT_GAME[3]} First Round game
  • Bye seed 4 hosts the winner of the ${CFP_QF_OPPONENT_GAME[4]} First Round game

═══════════════════════════════════════════════════════════
CRITICAL RULES — read before anything else
═══════════════════════════════════════════════════════════
1. Each line has EXACTLY 6 tab-separated fields: ByeSeed<TAB>ByeTeam<TAB>OpponentTeam<TAB>ByeScore<TAB>OpponentScore<TAB>Winner.
2. NO header row. NO blank lines. NO Bowl Game name. NO commentary, totals, or labels INSIDE the data.
3. OMIT any quarterfinal whose result you cannot see — do NOT pad, do NOT guess, do NOT invent scores. A game with no line is left unchanged.
4. ByeSeed is the FIRST field and MUST be one of: 1, 2, 3, 4 (the top-4 seed that earned the bye). It is the ONLY identifier for the game — never output the bowl name.
5. ByeTeam = the bye seed's team name. OpponentTeam = the First Round winner's team name. Do NOT swap them — the bye seed's team is always the SECOND field.
6. ByeScore = the bye seed team's integer score. OpponentScore = the opponent's integer score. No commas, no decimals, no "pts".
7. Winner = the team name (matching ByeTeam or OpponentTeam) with the HIGHER score. If scores are tied or unknown, leave Winner blank.
8. All team values (ByeTeam, OpponentTeam, Winner) are team names from the list at the bottom — NEVER an abbreviation, nickname, mascot, or city.
9. If teams are known but scores aren't, you may emit ByeSeed, ByeTeam, OpponentTeam and leave the three trailing fields blank (still keep all 6 fields / 5 tabs).

═══════════════════════════════════════════════════════════
PER-LINE OUTPUT (6 tab-separated fields)
═══════════════════════════════════════════════════════════
<ByeSeed 1-4><TAB><ByeTeam Abbr><TAB><OpponentTeam Abbr><TAB><ByeScore><TAB><OpponentScore><TAB><Winner Abbr>

═══════════════════════════════════════════════════════════
REQUIRED OUTPUT FORMAT
═══════════════════════════════════════════════════════════
=== CFP QUARTERFINALS ===
<ByeSeed>\\t<ByeTeam>\\t<OpponentTeam>\\t<ByeScore>\\t<OpponentScore>\\t<Winner>
…one line per quarterfinal you can see; omit unknowns entirely

(Each \\t above represents a LITERAL TAB character — use actual tab characters, not the text "\\t".)

═══════════════════════════════════════════════════════════
FINAL CHECK before you send
═══════════════════════════════════════════════════════════
[ ] Every line has exactly 6 tab-separated fields (five tabs)
[ ] The FIRST field of every line is a bye seed 1, 2, 3, or 4 — no duplicates
[ ] ByeTeam is the bye seed's team; OpponentTeam is the First Round winner (not swapped)
[ ] All team values are uppercase names from the list — no full names
[ ] Scores are integers with no commas or decimals
[ ] Winner matches the higher-scoring team's abbreviation (or blank if tied/unknown)
[ ] No blank lines, no header row, no bowl name, no commentary — only games with a known result`,
    includeTeamMap: true,
    dynastyTeams: currentDynasty?.teams,
  }), [currentYear, currentDynasty?.teams])

  // Ref to prevent concurrent sheet creation (state updates are async, refs are immediate)
  const creatingSheetRef = useRef(false)
  const creationAttemptedRef = useRef(false)
  const lastRetryCountRef = useRef(auth.retryCount)

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

  // Create CFP Quarterfinals sheet when modal opens
  useEffect(() => {
    if (auth.retryCount !== lastRetryCountRef.current) {
      lastRetryCountRef.current = auth.retryCount
      creationAttemptedRef.current = false
    }

    const createSheet = async () => {
      // Don't create a Google Sheet while the local paste path is active.
      if (isOpen && !useLocal && user && !sheetId && !creatingSheet && !creatingSheetRef.current && !showDeletedNote && !creationAttemptedRef.current) {
        // Set ref immediately to prevent concurrent calls (state updates are async)
        creationAttemptedRef.current = true
        creatingSheetRef.current = true
        setCreatingSheet(true)
        try {
          // Get CFP seeds and First Round results for team auto-fill
          const cfpSeeds = currentDynasty?.cfpSeedsByYear?.[currentYear] || []
          const firstRoundResults = currentDynasty?.cfpResultsByYear?.[currentYear]?.firstRound || []
          // Get existing quarterfinals data for pre-filling scores
          const existingQuarterfinals = currentDynasty?.cfpResultsByYear?.[currentYear]?.quarterfinals || []
          // Get bowl configuration for correct bowl name assignments
          const bowlConfig = currentDynasty?.cfpBowlConfigByYear?.[currentYear] || null

          const sheetInfo = await createCFPQuarterfinalsSheet(
            currentDynasty?.teamName || 'Dynasty',
            currentYear,
            cfpSeeds,
            firstRoundResults,
            existingQuarterfinals,
            bowlConfig,
            currentDynasty?.teams || currentDynasty?.customTeams
          )
          setSheetId(sheetInfo.spreadsheetId)
        } catch (error) {
          console.error('Failed to create CFP Quarterfinals sheet:', error)
          auth.handleError(error)
        } finally {
          setCreatingSheet(false)
          creatingSheetRef.current = false
        }
      }
    }

    createSheet()
  }, [isOpen, useLocal, user, sheetId, currentDynasty?.id, auth.retryCount, showDeletedNote])

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setShowDeletedNote(false)
      setSheetId(null)
      creatingSheetRef.current = false
      creationAttemptedRef.current = false
      setUseLocal(true)
    }
  }, [isOpen])

  // Local paste import. The AI emits SELF-DESCRIBING rows that LEAD with the
  // bye seed: ByeSeed<TAB>ByeTeam<TAB>OpponentTeam<TAB>ByeScore<TAB>OpponentScore<TAB>Winner.
  // The parser (readCFPQuarterfinalsFromSheet) determines each game's bracket
  // slot by ROW INDEX via rowToByeSeed=[4,1,3,2], and the downstream save
  // (saveCFPGames) matches the existing shell by BOWL NAME (col A) + bye-seed
  // team. So we build a fixed 4-slot array, place each pasted game at the index
  // its bye seed occupies in rowToByeSeed, and fill col A with the configured
  // bowl name for that bye seed — reconstructing exactly the layout the parser
  // and save expect from identity (the bye seed) rather than paste position.
  const handleLocalImport = async (text) => {
    const splitRows = splitTsv(text)
    const bowlConfig = currentDynasty?.cfpBowlConfigByYear?.[currentYear]
      || currentDynasty?.cfpBowlConfigByYear?.[String(currentYear)]
      || DEFAULT_QF_BOWL_CONFIG

    // Fixed 4-row layout in the parser's expected order (rowToByeSeed). Unused
    // slots stay blank so the parser's positional seed mapping holds; blank
    // rows are dropped later by its `.filter(team1Tid && team2Tid)`.
    const placed = CFP_QF_ROW_TO_BYE_SEED.map(() => ['', '', '', '', '', ''])

    for (const row of splitRows) {
      const byeSeed = parseInt(row[0], 10)
      const slotIndex = CFP_QF_ROW_TO_BYE_SEED.indexOf(byeSeed)
      if (slotIndex === -1) continue // not a 1-4 bye seed; skip malformed line
      const byeTeam = row[1] || ''
      const oppTeam = row[2] || ''
      const byeScore = row[3] || ''
      const oppScore = row[4] || ''
      const winner = row[5] || ''
      // Look up the dynasty-configured bowl name for this bye seed so the
      // downstream save's bowlName match (TERTIARY path) lands on the right shell.
      const bowlName = bowlConfig?.[`seed${byeSeed}`] || DEFAULT_QF_BOWL_CONFIG[`seed${byeSeed}`] || ''
      // Parser column layout: [Bowl, Team1(bye), Team2(opp), T1Score, T2Score, Winner]
      placed[slotIndex] = [bowlName, byeTeam, oppTeam, byeScore, oppScore, winner]
    }

    const games = await readCFPQuarterfinalsFromSheet(null, (currentDynasty?.teams || currentDynasty?.customTeams), { rows: placed })
    await onSave(games)
    onClose()
  }

  const handleSyncFromSheet = async () => {
    if (!sheetId) return

    setSyncing(true)
    try {
      const games = await readCFPQuarterfinalsFromSheet(sheetId, (currentDynasty?.teams || currentDynasty?.customTeams))
      await onSave(games)
      onClose()
    } catch (error) {
      console.error(error)
      if (!auth.handleError(error)) {
        toast.error('Failed to sync from Google Sheets. Make sure all 4 games have scores entered.')
      }
    } finally {
      setSyncing(false)
    }
  }

  const handleSyncAndDelete = async () => {
    if (!sheetId) return

    setDeletingSheet(true)
    try {
      const games = await readCFPQuarterfinalsFromSheet(sheetId, (currentDynasty?.teams || currentDynasty?.customTeams))
      await onSave(games)

      // Move sheet to trash (keep sheet ID stored so user can restore if needed)
      await deleteGoogleSheet(sheetId)

      setSheetId(null)
      setShowDeletedNote(true)
      setTimeout(() => {
        onClose()
      }, 2500)
    } catch (error) {
      console.error(error)
      if (!auth.handleError(error)) {
        toast.error('Failed to sync from Google Sheets.')
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
      title: 'Delete this CFP Quarterfinals sheet?',
      message: 'This deletes the Google Sheet without applying any edits. Your dynasty CFP results stay as-is.',
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
        toast.error('Failed to delete the sheet. Try again.')
      }
    } finally {
      setDeletingSheet(false)
    }
  }

  const handleClose = () => {
    onClose()
  }

  if (!isOpen) return null

  const embedUrl = sheetId ? getSheetEmbedUrl(sheetId, 'CFP Quarterfinals') : null
  const isLoading = creatingSheet

  return createPortal(
    <div
      className="fixed inset-0 top-0 left-0 right-0 bottom-0 bg-black bg-opacity-70 flex items-center justify-center z-[9999] py-8 px-4 sm:p-4 modal-backdrop-in"
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
        <SheetModalHeader eyebrow="College Football Playoff" title={`${currentYear} CFP Quarterfinals`} onClose={handleClose} />

        <div className="flex-1 flex flex-col overflow-hidden p-4 sm:p-6">
        {useLocal && !showDeletedNote ? (
          <LocalDataEntry
            aiPrompt={localAiPrompt}
            onImport={handleLocalImport}
            onUseGoogle={() => setUseLocal(false)}
            onCancel={handleClose}
            importLabel="Import CFP Quarterfinals"
            columns={['Bye Seed', 'Bye Team', 'Opponent', 'Bye Score', 'Opponent Score', 'Winner']}
            comboboxColumns={{ 'Bye Team': teamAbbrs, 'Opponent': teamAbbrs, 'Winner': teamAbbrs }}
            comboboxAliases={getTeamNameAliases(currentDynasty?.teams)}
          />
        ) : isLoading ? (
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
              tagline="Skip the typing. Let AI fill the CFP Quarterfinals."
              buttons={[{ label: 'Copy AI Prompt', prompt: aiPrompt }]}
            />
            {isMobile || !useEmbedded ? (
              <SheetManualEntry sheetId={sheetId} />
            ) : (
              <div className="flex-1 flex flex-col overflow-hidden min-h-0 border border-surface-4 rounded-lg">
                <SheetToolbar sheetId={sheetId} embedUrl={embedUrl} teamColors={teamColors} title="CFP Quarterfinals" />
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
    document.body
  )
}
