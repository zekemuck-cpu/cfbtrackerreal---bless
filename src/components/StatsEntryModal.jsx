import { useState, useEffect, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useDynasty, isPlayerOnRoster } from '../context/DynastyContext'
import { getCurrentTeamTid, getTidFromAbbr } from '../data/teamRegistry'
import { useAuth } from '../context/AuthContext'
import { useToast } from './ui/Toast'
import { useConfirm } from './ui/ConfirmDialog'
import SheetModalHeader from './ui/SheetModalHeader'
import SheetModalAIHero from './ui/SheetModalAIHero'
import SheetManualEntry from './ui/SheetManualEntry'
import SheetModalFooter from './ui/SheetModalFooter'
import AuthErrorModal from './AuthErrorModal'
import { useAuthErrorHandler } from '../hooks/useAuthErrorHandler'
import SheetToolbar from './SheetToolbar'
import {
  createStatsEntrySheet,
  readStatsFromSheet,
  deleteGoogleSheet,
  getSheetEmbedUrl
} from '../services/sheetsService'
import { buildAIPrompt } from '../utils/aiPrompt'
import SheetLoadingHint from './SheetLoadingHint'
// Stats are read directly from player.statsByYear (single source of truth)

const isMobileDevice = () => {
  if (typeof window === 'undefined') return false
  return window.innerWidth < 768 || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
}

export default function StatsEntryModal({
  isOpen,
  onClose,
  onSave,
  currentYear,
  teamColors,
  // Optional props for team override (used by TeamStats page)
  teamAbbr: overrideTeamAbbr,
  teamName: overrideTeamName
}) {
  const { currentDynasty, updateDynasty } = useDynasty()
  const { user, signOut } = useAuth()
  const { toast } = useToast()
  const { confirm } = useConfirm()
  const [syncing, setSyncing] = useState(false)
  const [deletingSheet, setDeletingSheet] = useState(false)
  const [creatingSheet, setCreatingSheet] = useState(false)
  const [sheetId, setSheetId] = useState(null)
  const [showDeletedNote, setShowDeletedNote] = useState(false)
  const auth = useAuthErrorHandler()
  const [isMobile, setIsMobile] = useState(false)

  const [authErrorOccurred, setAuthErrorOccurred] = useState(false) // Prevents retry loops on auth errors
  const [createAttempts, setCreateAttempts] = useState(0) // Tracks creation attempts
  const MAX_CREATE_ATTEMPTS = 2 // Maximum retries for sheet creation
  const [useEmbedded, setUseEmbedded] = useState(() => {
    // Load preference from localStorage
    return localStorage.getItem('sheetEmbedPreference') === 'true'
  })
  const [highlightSave, setHighlightSave] = useState(false)
  const [regenerating, setRegenerating] = useState(false)

  // Current-team roster, used to give the AI a "A. Guess → Alex Guess"
  // lookup so EA-CFB screenshots with initial-abbreviated names can be
  // resolved to the full names the strict Google Sheets dropdown expects.
  const userRoster = useMemo(() => {
    // Filter by TID + pass dynasty so teambuilder-renamed teams resolve.
    // Previously this passed an abbr string with no dynasty arg, which
    // failed for teambuilder teams whose custom abbr isn't in static TEAMS.
    const teamTid = overrideTeamAbbr
      ? getTidFromAbbr(overrideTeamAbbr, currentDynasty)
      : getCurrentTeamTid(currentDynasty)
    const teamAbbrForRoster = overrideTeamAbbr ||
      currentDynasty?.teams?.[currentDynasty?.currentTid]?.abbr ||
      currentDynasty?.teamName
    const all = currentDynasty?.players || []
    return all
      .filter(p => isPlayerOnRoster(p, teamTid ?? teamAbbrForRoster, currentYear, currentDynasty))
      .map(p => ({
        name: p.name,
        jerseyNumber: p.jerseyNumber,
        position: p.position,
      }))
  }, [currentDynasty?.players, currentDynasty?.teams, currentDynasty?.currentTid, currentDynasty?.teamName, overrideTeamAbbr, currentYear, currentDynasty])

  const aiPrompt = useMemo(() => buildAIPrompt({
    title: `${currentYear} GP/Snaps Entry`,
    roster: userRoster,
    structure: `This sheet has ONE tab: "GP/Snaps".
Row 1 (header: Player | Games Played | Snaps Played) is pre-filled and PROTECTED. Data rows start at row 2. Column A uses a STRICT DROPDOWN containing every roster player's name — any value that doesn't exactly match a roster name will be rejected by the sheet.

═══════════════════════════════════════════════════════════
ABOUT THE SCREENSHOTS — CFB 26 stats UI, this is what you're reading
═══════════════════════════════════════════════════════════
The screenshots come from EA Sports College Football 26's team stats
screen. The user navigates between CATEGORY tabs (Passing, Rushing,
Receiving, Defense, Blocking, Kicking, Punting, Returns) and can
press a button to toggle between the default stats view and a
"Snap Count" view that adds a SNAPS column to whichever category is
active. So a single category produces TWO possible views:

  • Default view  — category-specific stats, ALWAYS includes GP (games played).
  • Snap Count view — same player list, header reads "Snap Count" at top,
                      and the rightmost column is SNAPS (per-category snap
                      counts). GP may or may not be visible depending on
                      column layout.

The user will upload SOME subset of these views — sometimes one
category, sometimes many, sometimes only the Snap Count flavor. Your
job: combine every screenshot into ONE row per player and emit
Games Played + Snaps Played for each.

Column-to-category map you should recognize from CFB 26:

  DEFENSE      — POS column shows MIKE, WILL, SAM, CB, SS, FS, LEDG, REDG, DT, etc.
                 Default columns include SOLO, ASSISTS, TAK, TFL, SACK, INT…
                 Snap Count flavor adds DEFL, CTHA, FFUMB, FMBREC, FMBYDS, BLOCK, SFTY, SNAPS.
                 SNAPS here = total defensive snaps for that player.
  BLOCKING     — POS column shows LT, LG, C, RG, RT (offensive linemen).
                 Default columns are sparse (NAME, POS, GP, SACK).
                 Snap Count flavor adds SNAPS.
                 SNAPS here = total offensive blocking snaps (LT/LG/C/RG/RT play every offensive snap).
  RUSHING      — POS column shows HB, QB, WR, TE (anyone with a carry).
                 Default columns include CAR, YARDS, AVG, TD, AVG G, 20+, BTK, YAC, LONG.
                 Snap Count flavor adds FUMB, FUM %, SNAPS.
                 SNAPS here is RUSHING snaps, which for HBs typically equals their offensive snaps.
  PASSING      — QB-only screen. Snap Count adds total pass snaps.
  RECEIVING    — POS column shows WR, TE, HB. SNAPS here = receiving snaps.
  KICKING / PUNTING / RETURNS — special-teams views, smaller rosters.

═══════════════════════════════════════════════════════════
HOW TO PICK SNAPS PLAYED PER PLAYER (this is the #1 source of mistakes)
═══════════════════════════════════════════════════════════
Take Snaps Played from the category that matches the player's POSITION:

  Offensive linemen (LT, LG, C, RG, RT)        →  BLOCKING — Snap Count → SNAPS
  Defensive players (DT, LEDG, REDG, MIKE,
    WILL, SAM, CB, SS, FS)                     →  DEFENSE  — Snap Count → SNAPS
  Quarterbacks (QB)                            →  PASSING  — Snap Count → SNAPS
                                                  (or RUSHING SNAPS for scrambling QBs if no PASSING view provided)
  Running backs (HB, RB, FB)                   →  RUSHING  — Snap Count → SNAPS
  Wide receivers (WR)                          →  RECEIVING — Snap Count → SNAPS
                                                  (fall back to RUSHING SNAPS if no RECEIVING view provided)
  Tight ends (TE)                              →  RECEIVING SNAPS if shown, else BLOCKING SNAPS
  Kickers / Punters (K, P)                     →  KICKING or PUNTING SNAPS
  Defensive backs / LBs on special teams       →  use DEFENSE SNAPS — special-teams snaps overcounting is
                                                  worse than undercounting; stick to primary position.

NEVER add snap counts across categories for the same player. The
categories overlap conceptually (e.g. a WR is on the field for both
PASSING and RECEIVING screens) — summing would double-count their
offensive snaps. Pick ONE category per player.

If a player appears in screenshots from MULTIPLE views and you can
see SNAPS in both, use the LARGER value when both views describe the
same role (e.g. a HB shown in both Rushing Snap Count and Receiving
Snap Count — pick whichever is larger; that's their true offensive
volume).

═══════════════════════════════════════════════════════════
HOW TO PICK GAMES PLAYED PER PLAYER
═══════════════════════════════════════════════════════════
The GP column is the SAME for a given player across every category
view (it's per-player, not per-category). Read it from any view that
shows GP. If the player appears in multiple screenshots, the GP
values should agree — if they don't, use the LARGER value.

GP range: 0–17. Typical values during the season are 0 to ~14
(regular season), and 15+ for postseason teams. Read the literal
number shown in the GP column; do not guess or round.

═══════════════════════════════════════════════════════════
CRITICAL OUTPUT RULES
═══════════════════════════════════════════════════════════
1. Output data rows ONLY (starting at row 2). NEVER output the header row.
2. One line per UNIQUE player who appears in any screenshot. Even if a
   player is shown in five different category views, emit ONE row.
3. EXACTLY 3 tab-separated values per row: <Player>\\t<Games Played>\\t<Snaps Played>.
4. Column A (Player) is a STRICT DROPDOWN of roster names. Use the
   EXACT player name as shown in the screenshot — case-sensitive,
   including spaces, hyphens, apostrophes, "Jr.", "III", etc. EA
   sometimes abbreviates first names ("R. Gideon" instead of
   "Raekwon Gideon") — the user-team roster section below maps
   abbreviated forms to full names so you can resolve them.
5. Only include players who actually appear in the screenshots. Do
   NOT invent rows for other roster players.
6. Games Played: integer 0–17. NO commas, NO decimals.
7. Snaps Played: integer. NO commas, NO decimals, NO "snaps" suffix.
8. BLANK cell for unknown values (just leave the cell empty between
   tabs). Never guess. Never use 0 as "unknown" — 0 means "the player
   genuinely had zero snaps / zero games played".
9. NO COMMAS in numbers: "1234" not "1,234".
10. No header row, no totals, no commentary INSIDE the data. ONE TSV
    block, preceded by the required paste-target label line above the
    fence (see Method A/B rules above).

═══════════════════════════════════════════════════════════
TAB: "GP/Snaps"
Paste at cell A2 of the "GP/Snaps" tab
═══════════════════════════════════════════════════════════

Col | Header (protected)  | Your output                                                                 | Format
----+---------------------+-----------------------------------------------------------------------------+------------------------
 A  | Player              | Player name — MUST exactly match a roster dropdown entry (see screenshots) | strict dropdown, text
 B  | Games Played        | Integer 0–17                                                                | integer, no commas
 C  | Snaps Played        | Integer (total snaps for the player's primary category — see rules above)  | integer, no commas

═══════════════════════════════════════════════════════════
REQUIRED OUTPUT FORMAT
═══════════════════════════════════════════════════════════
=== GP/SNAPS — paste at cell A2 of "GP/Snaps" tab ===
<Player>\\t<Games Played>\\t<Snaps Played>
<Player>\\t<Games Played>\\t<Snaps Played>
...

═══════════════════════════════════════════════════════════
FINAL CHECK before you send
═══════════════════════════════════════════════════════════
[ ] One line per UNIQUE player from the screenshots — players who appear
    in multiple category views still get ONE row, not several.
[ ] Every line has EXACTLY 2 tab characters (3 values)
[ ] Player name is copied character-for-character from the screenshot
    (case, punctuation, suffix), and matches a roster dropdown entry
[ ] Snaps Played is taken from the ONE correct category for that
    player's position (OL → Blocking, defenders → Defense, HB → Rushing,
    WR → Receiving, QB → Passing, K/P → Kicking/Punting)
[ ] Games Played is the literal value from the GP column (any view)
[ ] No snap counts SUMMED across categories — would double-count
[ ] No commas in any number; no decimals; no "snaps"/"games" suffix
[ ] No header row, no totals, no commentary INSIDE the data (the paste-target label above the fence is required, see Method A/B rules above)`,
    includeTeamMap: false,
  }), [currentYear, userRoster])

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

  // Create stats sheet when modal opens - ALWAYS create fresh to reflect current player data
  useEffect(() => {
    const createSheet = async () => {
      // Don't retry if auth error occurred or max attempts reached
      if (authErrorOccurred || createAttempts >= MAX_CREATE_ATTEMPTS) return

      if (isOpen && user && !sheetId && !creatingSheet && !creatingSheetRef.current && !showDeletedNote) {
        // ALWAYS create a fresh sheet - never reuse old sheets
        // This ensures the sheet reflects current player data (user may have edited players directly)

        // Set ref immediately to prevent concurrent calls (state updates are async)
        creatingSheetRef.current = true
        setCreatingSheet(true)
        try {
          // Get current team — prefer the TID (canonical, teambuilder-safe)
          // for roster filtering. The abbr-based path silently fails for
          // teambuilder-renamed teams whose custom abbr isn't in static
          // TEAMS, which produced the bug Jay reported (2026-05-12): the
          // Player dropdown showed only one stale graduate because every
          // current-roster player's teamsByYear entry is a TID number that
          // can't be matched against an unresolvable abbr.
          const { getCurrentTeamAbbr, getCurrentTeamTid, getTidFromAbbr } = await import('../data/teamRegistry')
          const userTeamAbbr = overrideTeamAbbr || getCurrentTeamAbbr(currentDynasty)
          const userTeamTid = overrideTeamAbbr
            ? getTidFromAbbr(overrideTeamAbbr, currentDynasty)
            : getCurrentTeamTid(currentDynasty)
          const dynastyTeamName = overrideTeamName || currentDynasty?.teamName
          const startYear = currentDynasty?.startYear || currentYear

          // Get the full roster for this team and year. Pass tid + dynasty
          // so teambuilder-renamed teams resolve correctly; fall back to
          // abbr lookup for the rare legacy case where tid resolution fails.
          const allPlayers = currentDynasty?.players || []
          const players = allPlayers.filter(player =>
            isPlayerOnRoster(player, userTeamTid ?? userTeamAbbr, currentYear, currentDynasty)
          )

          // Get existing stats to pre-fill gamesPlayed/snapsPlayed
          // Prioritize box scores (most accurate count of games played), then fall back to saved stats
          // Use normalized string key for consistency with how stats are saved
          const yearKey = String(currentYear)
          const numKey = Number(currentYear)

          const playersWithStats = players.map(player => {
            // Check player's own statsByYear - try all possible key types (SINGLE SOURCE OF TRUTH)
            const playerYearStats = player.statsByYear?.[yearKey]
              ?? player.statsByYear?.[numKey]
              ?? player.statsByYear?.[currentYear]

            // Read games/snaps directly from player.statsByYear
            // Box scores already update this via delta tracking
            const gamesPlayed = playerYearStats?.gamesPlayed ?? null
            const snapsPlayed = playerYearStats?.snapsPlayed ?? null

            return {
              ...player,
              gamesPlayed,
              snapsPlayed
            }
          })

          const sheetInfo = await createStatsEntrySheet(
            dynastyTeamName || 'Dynasty',
            currentYear,
            playersWithStats
          )

          setSheetId(sheetInfo.spreadsheetId)
          // NOTE: We do NOT save the sheet ID to dynasty - each open creates a fresh sheet
        } catch (error) {
          console.error('Failed to create stats sheet:', error)
          setCreateAttempts(prev => prev + 1)

          // Check for OAuth/auth errors - stop retrying and show error modal
          if (auth.handleError(error)) {
            setAuthErrorOccurred(true)
          }
        } finally {
          setCreatingSheet(false)
          creatingSheetRef.current = false
        }
      }
    }

    createSheet()
  }, [isOpen, user, sheetId, creatingSheet, currentDynasty?.id, auth.retryCount, showDeletedNote, overrideTeamAbbr, overrideTeamName, currentYear, authErrorOccurred, createAttempts])

  // Reset state when modal closes - clear sheetId so a fresh sheet is created next time
  useEffect(() => {
    if (!isOpen) {
      setSheetId(null)
      setShowDeletedNote(false)
      creatingSheetRef.current = false
      setAuthErrorOccurred(false)
      setCreateAttempts(0)
      auth.setShowAuthError(false)
    }
  }, [isOpen])

  const handleSyncFromSheet = async () => {
    if (!sheetId) return

    setSyncing(true)
    try {
      const stats = await readStatsFromSheet(sheetId, (currentDynasty?.teams || currentDynasty?.customTeams))
      await onSave(stats)
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
      const stats = await readStatsFromSheet(sheetId, (currentDynasty?.teams || currentDynasty?.customTeams))
      await onSave(stats)

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
      title: 'Delete this GP/Snaps sheet?',
      message: 'This deletes the Google Sheet without applying any edits. Your dynasty player stats stay as-is.',
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

  const embedUrl = sheetId ? getSheetEmbedUrl(sheetId, 'GP/Snaps') : null
  const isLoading = creatingSheet

  return createPortal(
    <div
      className="fixed inset-0 top-0 left-0 right-0 bottom-0 bg-black bg-opacity-70 flex items-center justify-center z-[9999] p-3 sm:p-4"
      style={{ margin: 0 }}
      onMouseDown={handleClose}
    >
      <div
        className={`card-elevated w-full max-h-[calc(100dvh-1.5rem)] flex flex-col overflow-hidden ${
          useEmbedded
            ? 'sm:w-[95vw] sm:max-h-[95dvh]'
            : 'sm:max-w-[680px] sm:h-auto'
        }`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <SheetModalHeader eyebrow="Stats" title={`${currentYear} GP / Snaps`} onClose={handleClose} />

        <div className="flex-1 flex flex-col overflow-y-auto min-h-0 p-4 sm:p-6">
        <p className="text-sm mb-3 text-txt-secondary">
          Enter this first! Detailed Stats entry sorts players by snaps, so entering snaps here lets you quickly go down the list when entering passing, rushing, and other stats.
        </p>

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
              tagline="Skip the typing. Let AI fill the player stats."
              buttons={[{ label: 'Copy AI Prompt', prompt: aiPrompt }]}
            />
            {isMobile || !useEmbedded ? (
              <SheetManualEntry sheetId={sheetId} />
            ) : (
              <div className="flex-1 flex flex-col overflow-hidden min-h-0 border border-surface-4 rounded-lg">
                <SheetToolbar sheetId={sheetId} embedUrl={embedUrl} teamColors={teamColors} title="GP/Snaps" />
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
        onRefresh={() => {
          // Reset error states to allow sheet creation retry
          setAuthErrorOccurred(false)
          setCreateAttempts(0)
          // Trigger sheet creation retry
          auth.retry()
        }}
        teamColors={teamColors}
      />
    </div>,
    document.body
  )
}
