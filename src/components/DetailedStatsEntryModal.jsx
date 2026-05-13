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
import AIPromptModal from './AIPromptModal'
import SheetToolbar from './SheetToolbar'
import {
  createDetailedStatsSheet,
  readDetailedStatsFromSheet,
  deleteGoogleSheet,
  getSheetEmbedUrl
} from '../services/sheetsService'
import { buildAIPrompt } from '../utils/aiPrompt'
import SheetLoadingHint from './SheetLoadingHint'

// Mapping from internal stat keys (player.statsByYear) to box score format
// (used by sheet). MUST stay in lock-step with SHEET_TO_INTERNAL in
// Dashboard.jsx — every internal key the sheet round-trips needs an entry
// here so write-back to the sheet doesn't drop fields.
const INTERNAL_TO_BOXSCORE = {
  passing: {
    cmp: 'comp', att: 'attempts', yds: 'yards', td: 'tD', int: 'iNT',
    lng: 'long', sacks: 'sacks', rating: 'qBRating',
    nyPerAtt: 'netYardsPerAttempt', adjNyPerAtt: 'adjNetYardsPerAttempt'
  },
  rushing: {
    car: 'carries', yds: 'yards', td: 'tD', lng: 'long', fum: 'fumbles',
    bt: 'brokenTackles', yac: 'yAC', twentyPlus: '20+'
  },
  receiving: { rec: 'receptions', yds: 'yards', td: 'tD', lng: 'long', drops: 'drops', rac: 'rAC' },
  blocking: { sacksAllowed: 'sacksAllowed', pancakes: 'pancakes' },
  defense: {
    soloTkl: 'solo', solo: 'solo', astTkl: 'assists', assists: 'assists',
    tfl: 'tFL', sacks: 'sack', sack: 'sack', int: 'iNT',
    intYds: 'iNTYards', intLng: 'iNTLong',
    pd: 'deflections', deflections: 'deflections',
    catchesAllowed: 'catchesAllowed',
    ff: 'fF', fr: 'fR', fumbleYds: 'fumbleYards',
    blocks: 'blocks', safeties: 'safeties', td: 'tD'
  },
  kicking: {
    fgm: 'fGM', fga: 'fGA', xpm: 'xPM', xpa: 'xPA', lng: 'fGLong',
    kickoffs: 'kickoffs', touchbacks: 'touchbacks',
    fgb: 'fGBlock', xpb: 'xPB',
    fgm29: 'fGM29', fga29: 'fGA29',
    fgm39: 'fGM39', fga39: 'fGA39',
    fgm49: 'fGM49', fga49: 'fGA49',
    fgm50: 'fGM50+', fga50: 'fGA50+'
  },
  punting: {
    punts: 'punts', yds: 'yards', netYds: 'netYards', in20: 'in20', lng: 'long',
    tb: 'tB', block: 'block'
  },
  kickReturn: { ret: 'kR', kR: 'kR', yds: 'yards', td: 'tD', lng: 'long' },
  puntReturn: { ret: 'pR', pR: 'pR', yds: 'yards', td: 'tD', lng: 'long' }
}

// Convert internal stat format to box score format
const convertToBoxScoreFormat = (categoryStats, categoryName) => {
  if (!categoryStats) return null
  const mapping = INTERNAL_TO_BOXSCORE[categoryName] || {}
  const converted = {}
  Object.entries(categoryStats).forEach(([key, value]) => {
    const boxScoreKey = mapping[key] || key
    converted[boxScoreKey] = value
  })
  return converted
}

const isMobileDevice = () => {
  if (typeof window === 'undefined') return false
  return window.innerWidth < 768 || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
}

export default function DetailedStatsEntryModal({
  isOpen,
  onClose,
  onSave,
  currentYear,
  teamColors,
  // Optional props for team override (used by TeamStats page)
  teamAbbr: overrideTeamAbbr,
  teamName: overrideTeamName
}) {
  const { currentDynasty } = useDynasty()
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
  const [showAIPrompt, setShowAIPrompt] = useState(false)

  const userRoster = useMemo(() => {
    // Teambuilder-safe: filter by TID + pass dynasty for abbr fallback
    const teamTid = overrideTeamAbbr
      ? getTidFromAbbr(overrideTeamAbbr, currentDynasty)
      : getCurrentTeamTid(currentDynasty)
    const teamAbbrForRoster = overrideTeamAbbr ||
      currentDynasty?.teams?.[currentDynasty?.currentTid]?.abbr ||
      currentDynasty?.teamName
    const all = currentDynasty?.players || []
    return all
      .filter(p => isPlayerOnRoster(p, teamTid ?? teamAbbrForRoster, currentYear, currentDynasty))
      .map(p => ({ name: p.name, jerseyNumber: p.jerseyNumber, position: p.position }))
  }, [currentDynasty?.players, currentDynasty?.teams, currentDynasty?.currentTid, currentDynasty?.teamName, overrideTeamAbbr, currentYear, currentDynasty])

  const aiPrompt = useMemo(() => buildAIPrompt({
    title: `${currentYear} Detailed Stats Entry`,
    roster: userRoster,
    multiBlock: true,
    structure: `This sheet has NINE tabs, one per stat category. Each tab's row 1 (header) and columns A (Name) and B (Snaps) are PRE-FILLED and PROTECTED. Players on each tab are filtered by position and sorted by Snaps DESCENDING. Your output is the stat columns ONLY, starting at column C, with row order matching column A exactly.

═══════════════════════════════════════════════════════════
CRITICAL RULES — read before anything else
═══════════════════════════════════════════════════════════
1. Output stat columns ONLY (column C onward). NEVER output column A (Name) or column B (Snaps). NEVER output the header row.
2. ROW ORDER IS FIXED per tab. Produce exactly one output line per pre-filled player row on that tab, in the SAME ORDER as column A. Do NOT reorder, skip, or add rows.
3. Tab-separated values within a line. Each tab has a FIXED number of stat columns (see spec per tab below); every line must have EXACTLY that many values (that many commas-are-not-allowed; that many values separated by tabs).
4. Return NINE separate blocks, one per tab — each preceded by the required paste-target label line above its fence (e.g. "Paste this TSV into cell C2 of the \"Passing\" tab"), as required by the Method A/B rules above.
5. NO COMMAS in numbers. "1234" never "1,234". No quotes, no units, no "+/-", no percent signs.
6. INTEGERS have no decimal point, with these EXCEPTIONS:
   • Passing columns H (Net Yards/Attempt) and I (Adj Net Yards/Attempt) use 1 decimal place.
   • Defensive Tackles for Loss (column E) and Sacks (column F) accept ".5" half-credits when the screenshot shows a half-credit (e.g. "1.5", "0.5"). Write the half exactly as shown — never round to an integer; never invent a half the screenshot doesn't show.
   Every other column on every tab is an integer.
7. BLANK cell for unknown values — never guess, never use 0, "-", or "N/A". To emit a blank cell between two tab characters, just have nothing between the tabs. To emit a blank line for a player with no visible stats, output the correct number of empty tab-separated cells (that is, N-1 tab characters with nothing between them).
8. Only the positions listed per tab appear on that tab. Do NOT include quarterbacks on Receiving, for example.
9. No commentary, no totals, no header row INSIDE the data. Nine TSV blocks, each preceded by the required paste-target label line above its fence (see Method A/B rules above).

═══════════════════════════════════════════════════════════
TAB 1: "Passing" — positions filtered to QB only
Paste at cell C2 of the "Passing" tab
═══════════════════════════════════════════════════════════
9 stat columns (C–K), in this EXACT order:
  C  Completions                    integer
  D  Attempts                       integer
  E  Yards                          integer (pass yards)
  F  Touchdowns                     integer
  G  Interceptions                  integer
  H  Net Yards/Attempt              DECIMAL — 1 place (e.g. 7.3)
  I  Adjusted Net Yards/Attempt     DECIMAL — 1 place (e.g. 6.8)
  J  Passing Long                   integer
  K  Sacks Taken                    integer
Each line: 9 tab-separated values (8 tab characters).

═══════════════════════════════════════════════════════════
TAB 2: "Rushing" — positions: QB, HB, FB, WR, TE
Paste at cell C2 of the "Rushing" tab
═══════════════════════════════════════════════════════════
8 stat columns (C–J), in this EXACT order:
  C  Carries                        integer
  D  Yards                          integer (rush yards)
  E  Touchdowns                     integer
  F  20+ Yard Runs                  integer
  G  Broken Tackles                 integer
  H  Yards After Contact            integer
  I  Rushing Long                   integer
  J  Fumbles                        integer
Each line: 8 tab-separated values (7 tab characters).

═══════════════════════════════════════════════════════════
TAB 3: "Receiving" — positions: HB, FB, WR, TE
Paste at cell C2 of the "Receiving" tab
═══════════════════════════════════════════════════════════
6 stat columns (C–H), in this EXACT order:
  C  Receptions                     integer
  D  Yards                          integer (receiving yards)
  E  Touchdowns                     integer
  F  Receiving Long                 integer
  G  Yards After Catch              integer
  H  Drops                          integer
Each line: 6 tab-separated values (5 tab characters).

═══════════════════════════════════════════════════════════
TAB 4: "Blocking" — positions: LT, LG, C, RG, RT
Paste at cell C2 of the "Blocking" tab
═══════════════════════════════════════════════════════════
2 stat columns (C–D), in this EXACT order:
  C  Pancakes                       integer
  D  Sacks Allowed                  integer
Each line: 2 tab-separated values (1 tab character).

═══════════════════════════════════════════════════════════
TAB 5: "Defensive" — positions: LEDG, REDG, DT, SAM, MIKE, WILL, CB, FS, SS
Paste at cell C2 of the "Defensive" tab
═══════════════════════════════════════════════════════════
15 stat columns (C–Q), in this EXACT order:
  C  Solo Tackles                   integer
  D  Assisted Tackles               integer
  E  Tackles for Loss               integer or .5 half-credit (e.g. 1.5)
  F  Sacks                          integer or .5 half-credit (e.g. 1.5)
  G  Interceptions                  integer
  H  INT Return Yards               integer
  I  INT Long                       integer
  J  Defensive TDs                  integer
  K  Deflections                    integer
  L  Catches Allowed                integer
  M  Forced Fumbles                 integer
  N  Fumble Recoveries              integer
  O  Fumble Return Yards            integer
  P  Blocks                         integer
  Q  Safeties                       integer
Each line: 15 tab-separated values (14 tab characters).

═══════════════════════════════════════════════════════════
TAB 6: "Kicking" — positions: K, P
Paste at cell C2 of the "Kicking" tab
═══════════════════════════════════════════════════════════
17 stat columns (C–S), in this EXACT order:
  C  FG Made                        integer
  D  FG Attempted                   integer
  E  FG Long                        integer
  F  XP Made                        integer
  G  XP Attempted                   integer
  H  FG Made (0-29)                 integer
  I  FG Att (0-29)                  integer
  J  FG Made (30-39)                integer
  K  FG Att (30-39)                 integer
  L  FG Made (40-49)                integer
  M  FG Att (40-49)                 integer
  N  FG Made (50+)                  integer
  O  FG Att (50+)                   integer
  P  Kickoffs                       integer
  Q  Touchbacks                     integer
  R  FG Blocked                     integer
  S  XP Blocked                     integer
Each line: 17 tab-separated values (16 tab characters).

═══════════════════════════════════════════════════════════
TAB 7: "Punting" — positions: K, P
Paste at cell C2 of the "Punting" tab
═══════════════════════════════════════════════════════════
7 stat columns (C–I), in this EXACT order:
  C  Punts                          integer
  D  Punting Yards                  integer
  E  Net Punting Yards              integer
  F  Punts Inside 20                integer
  G  Touchbacks                     integer
  H  Punt Long                      integer
  I  Punts Blocked                  integer
Each line: 7 tab-separated values (6 tab characters).

═══════════════════════════════════════════════════════════
TAB 8: "Kick Return" — positions: HB, FB, WR, CB, FS, SS
Paste at cell C2 of the "Kick Return" tab
═══════════════════════════════════════════════════════════
4 stat columns (C–F), in this EXACT order:
  C  Kickoff Returns                integer
  D  KR Yardage                     integer
  E  KR Touchdowns                  integer
  F  KR Long                        integer
Each line: 4 tab-separated values (3 tab characters).

═══════════════════════════════════════════════════════════
TAB 9: "Punt Return" — positions: HB, FB, WR, CB, FS, SS
Paste at cell C2 of the "Punt Return" tab
═══════════════════════════════════════════════════════════
4 stat columns (C–F), in this EXACT order:
  C  Punt Returns                   integer
  D  PR Yardage                     integer
  E  PR Long                        integer
  F  PR Touchdowns                  integer
Each line: 4 tab-separated values (3 tab characters).

⚠️ CRITICAL — RETURN TAB COLUMN ORDERS ARE INVERTED FOR TD/LONG.

  Kick Return tab:  [Returns] [Yardage] [TD]   [Long]
  Punt Return tab:  [Returns] [Yardage] [Long] [TD]

  Double-check before pasting each return tab. Copy the columns in the
  literal order shown for each tab. Mixing them silently corrupts stats
  (TDs become Longs and vice versa).

═══════════════════════════════════════════════════════════
REQUIRED OUTPUT FORMAT
═══════════════════════════════════════════════════════════
=== PASSING — paste at cell C2 of "Passing" tab ===
<9 tab-separated values>
<9 tab-separated values>
...

=== RUSHING — paste at cell C2 of "Rushing" tab ===
<8 tab-separated values>
...

=== RECEIVING — paste at cell C2 of "Receiving" tab ===
<6 tab-separated values>
...

=== BLOCKING — paste at cell C2 of "Blocking" tab ===
<2 tab-separated values>
...

=== DEFENSIVE — paste at cell C2 of "Defensive" tab ===
<15 tab-separated values>
...

=== KICKING — paste at cell C2 of "Kicking" tab ===
<17 tab-separated values>
...

=== PUNTING — paste at cell C2 of "Punting" tab ===
<7 tab-separated values>
...

=== KICK RETURN — paste at cell C2 of "Kick Return" tab ===
<4 tab-separated values>
...

=== PUNT RETURN — paste at cell C2 of "Punt Return" tab ===
<4 tab-separated values>
...

═══════════════════════════════════════════════════════════
FINAL CHECK before you send
═══════════════════════════════════════════════════════════
[ ] NINE labeled blocks, one per tab, in the order above
[ ] Each block's line count equals the number of pre-filled player rows on that tab (column A) — including any all-blank lines for players with no data
[ ] Per-tab tab-count per line: Passing 8, Rushing 7, Receiving 5, Blocking 1, Defensive 14, Kicking 16, Punting 6, Kick Return 3, Punt Return 3
[ ] Net Yards/Attempt and Adjusted Net Yards/Attempt (Passing columns H and I) use 1 decimal place; Defensive TFL (E) and Sacks (F) MAY use ".5" half-credits when the screenshot shows them; every other value on every tab is an integer
[ ] No commas in any number
[ ] No player name, no Snaps column, no header row, no commentary INSIDE the data blocks. The paste-target label lines above each fence are required (see Method A/B rules above).
[ ] Row order within each block matches column A on that tab exactly
[ ] Blank cells/lines for unknowns — invented nothing`,
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

  // Create detailed stats sheet when modal opens - ALWAYS create fresh to reflect current player data
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
          // Get current team — prefer TID for teambuilder-safe roster filter
          const { getCurrentTeamAbbr } = await import('../data/teamRegistry')
          const userTeamAbbr = overrideTeamAbbr || getCurrentTeamAbbr(currentDynasty)
          const userTeamTid = overrideTeamAbbr
            ? getTidFromAbbr(overrideTeamAbbr, currentDynasty)
            : getCurrentTeamTid(currentDynasty)
          const dynastyTeamName = overrideTeamName || currentDynasty?.teamName
          const startYear = currentDynasty?.startYear || currentYear

          // Get the full roster for this team and year. Pass tid + dynasty
          // so teambuilder-renamed teams resolve correctly.
          const allPlayers = currentDynasty?.players || []
          const currentRoster = allPlayers.filter(player =>
            isPlayerOnRoster(player, userTeamTid ?? userTeamAbbr, currentYear, currentDynasty)
          )

          // Get existing stats to pre-fill gamesPlayed/snapsPlayed
          // Check player.statsByYear first, then fall back to box score aggregation
          // Use normalized string key for consistency with how stats are saved
          const yearKey = String(currentYear)
          const numKey = Number(currentYear)

          const playersWithSnaps = currentRoster.map(player => {
            // Get stats from player.statsByYear (the only source of truth)
            const playerYearStats = player.statsByYear?.[yearKey]
              ?? player.statsByYear?.[numKey]
              ?? player.statsByYear?.[currentYear]

            return {
              ...player,
              gamesPlayed: playerYearStats?.gamesPlayed ?? null,
              snapsPlayed: playerYearStats?.snapsPlayed ?? null
            }
          })

          // Get existing detailed stats to pre-fill the sheet
          // Stats come ONLY from player.statsByYear (single source of truth)
          let aggregatedStats = {}

          // Categories that could have detailed stats
          const categories = ['passing', 'rushing', 'receiving', 'blocking', 'defense', 'kicking', 'punting', 'kickReturn', 'puntReturn']

          playersWithSnaps.forEach(player => {
            if (!player.name) return

            // Get stats from player.statsByYear (the only source of truth)
            const playerYearStats = player.statsByYear?.[yearKey]
              ?? player.statsByYear?.[numKey]
              ?? player.statsByYear?.[currentYear]

            if (!playerYearStats) return

            const playerStats = {}

            categories.forEach(cat => {
              const categoryStats = playerYearStats[cat]
              if (categoryStats && typeof categoryStats === 'object' && Object.keys(categoryStats).length > 0) {
                // Check if stats are non-zero
                const hasNonZeroStats = Object.values(categoryStats).some(v => v && v !== 0)
                if (hasNonZeroStats) {
                  const converted = convertToBoxScoreFormat(categoryStats, cat)
                  playerStats[cat] = converted
                }
              }
            })

            if (Object.keys(playerStats).length > 0) {
              aggregatedStats[player.name] = playerStats
            }
          })

          const sheetInfo = await createDetailedStatsSheet(
            dynastyTeamName || 'Dynasty',
            currentYear,
            playersWithSnaps,
            aggregatedStats
          )

          setSheetId(sheetInfo.spreadsheetId)
          // NOTE: We do NOT save the sheet ID to dynasty - each open creates a fresh sheet
        } catch (error) {
          console.error('Error creating detailed stats sheet:', error)
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
  }, [isOpen, user, sheetId, creatingSheet, showDeletedNote, currentDynasty?.id, currentDynasty?.players, currentYear, auth.retryCount, overrideTeamAbbr, overrideTeamName, authErrorOccurred, createAttempts])

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
      const detailedStats = await readDetailedStatsFromSheet(sheetId, (currentDynasty?.teams || currentDynasty?.customTeams))
      await onSave(detailedStats)
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
      const detailedStats = await readDetailedStatsFromSheet(sheetId, (currentDynasty?.teams || currentDynasty?.customTeams))
      await onSave(detailedStats)

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
      title: 'Delete this detailed stats sheet?',
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

  const embedUrl = sheetId ? getSheetEmbedUrl(sheetId, 'Passing') : null
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
        <SheetModalHeader eyebrow="Stats" title={`${currentYear} Detailed Stats Entry`} onClose={handleClose} />

        <div className="flex-1 flex flex-col overflow-y-auto min-h-0 p-4 sm:p-6">
        {/* Helper tip */}
        <div className="mb-4 p-3 rounded-lg text-sm bg-surface-2 text-txt-secondary border-l-[3px]" style={{ borderLeftColor: 'var(--surface-5)' }}>
          <span className="font-semibold text-txt-primary">Tip:</span> Make sure you've completed GP/Snaps Entry first. In CFB 26, sort your stats by Snaps Played, then go through each category tab - the order will match and make entry quick!
        </div>

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
              <p className="text-lg font-semibold text-txt-primary">
                Creating Detailed Stats Sheet...
              </p>
              <p className="text-sm mt-2 text-txt-secondary">
                Setting up 9 stat category tabs
              </p>
              <SheetLoadingHint active={isLoading} />
            </div>
          </div>
        ) : showDeletedNote ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="card p-8 border-l-[3px] text-center max-w-sm" style={{ borderLeftColor: 'var(--surface-5)' }}>
              <p className="label-xs text-txt-tertiary mb-2">Status</p>
              <p className="text-xl font-bold text-txt-primary mb-2">Saved &amp; Moved to Trash</p>
              <p className="text-sm text-txt-secondary">Detailed stats saved to your dynasty.</p>
            </div>
          </div>
        ) : sheetId ? (
          <div className="flex-1 flex flex-col overflow-hidden gap-3">
            <SheetModalAIHero
              tagline="Skip the typing. Let AI fill the season stat totals."
              buttons={[{ label: 'Copy AI Prompt', onClick: () => setShowAIPrompt(true) }]}
            />
            {isMobile || !useEmbedded ? (
              <SheetManualEntry sheetId={sheetId} />
            ) : (
              <div className="flex-1 flex flex-col overflow-hidden min-h-0 border border-surface-4 rounded-lg">
                <SheetToolbar sheetId={sheetId} embedUrl={embedUrl} teamColors={teamColors} title="Detailed Stats" />
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
      <AIPromptModal
        isOpen={showAIPrompt}
        onClose={() => setShowAIPrompt(false)}
        title={`${currentYear} Detailed Stats Entry`}
        prompt={aiPrompt}
        pasteTarget={[
          'Cell C2 of the "Passing" tab',
          'Cell C2 of the "Rushing" tab',
          'Cell C2 of the "Receiving" tab',
          'Cell C2 of the "Blocking" tab',
          'Cell C2 of the "Defensive" tab',
          'Cell C2 of the "Kicking" tab',
          'Cell C2 of the "Punting" tab',
          'Cell C2 of the "Kick Return" tab',
          'Cell C2 of the "Punt Return" tab',
        ]}
      />
    </div>,
    document.body
  )
}
