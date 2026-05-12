import { useState, useEffect, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useDynasty, getCurrentRoster, isPlayerOnRoster } from '../context/DynastyContext'
import { getCurrentTeamTid, getTidFromAbbr } from '../data/teamRegistry'
import { useAuth } from '../context/AuthContext'
import { useToast } from './ui/Toast'
import { useConfirm } from './ui/ConfirmDialog'
import SheetModalHeader from './ui/SheetModalHeader'
import AuthErrorModal from './AuthErrorModal'
import { useAuthErrorHandler } from '../hooks/useAuthErrorHandler'
import AIPromptModal from './AIPromptModal'
import SheetToolbar from './SheetToolbar'
import SheetModalAIHero from './ui/SheetModalAIHero'
import {
  createRosterSheet,
  readRosterFromRosterSheet,
  deleteGoogleSheet,
  getSingleSheetEmbedUrl,
  prefillRosterSheet
} from '../services/sheetsService'
import { buildAIPrompt } from '../utils/aiPrompt'
import SheetLoadingHint from './SheetLoadingHint'

const isMobileDevice = () => {
  if (typeof window === 'undefined') return false
  return window.innerWidth < 768 || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
}

export default function RosterEditModal({ isOpen, onClose, onSave, currentYear, teamColors, teamAbbr, teamName }) {
  const { currentDynasty, updateDynasty } = useDynasty()

  // Use provided team info or fall back to user's team
  const editingTeamName = teamName || currentDynasty?.teamName || 'Dynasty'
  const { user, signOut } = useAuth()
  const { toast } = useToast()
  const { confirm } = useConfirm()
  const [syncing, setSyncing] = useState(false)
  const [deletingSheet, setDeletingSheet] = useState(false)
  const [creatingSheet, setCreatingSheet] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const [sheetId, setSheetId] = useState(null)
  const [showDeletedNote, setShowDeletedNote] = useState(false)
  const auth = useAuthErrorHandler()
  const [isMobile, setIsMobile] = useState(false)

  const [useEmbedded, setUseEmbedded] = useState(() => {
    // Load preference from localStorage
    return localStorage.getItem('sheetEmbedPreference') === 'true'
  })
  const [highlightSave, setHighlightSave] = useState(false)
  const [showAIPrompt, setShowAIPrompt] = useState(false)

  const userRoster = useMemo(() => {
    // Filter by TID (teambuilder-safe) and pass currentDynasty so the
    // legacy abbr fallback inside isPlayerOnRoster resolves teambuilder-
    // renamed teams. Previously this passed an abbr string with no
    // dynasty arg, which silently failed for teambuilder teams whose
    // custom abbr isn't in static TEAMS — the roster sheet rendered
    // only the rare graduate whose teamsByYear stored the matching abbr
    // STRING instead of a TID number. Reported by Jay (Stony Brook)
    // 2026-05-12: Edit Roster sheet showed Jalen Holoway alone.
    const teamTid = teamAbbr
      ? getTidFromAbbr(teamAbbr, currentDynasty)
      : getCurrentTeamTid(currentDynasty)
    const teamAbbrForRoster = teamAbbr ||
      currentDynasty?.teams?.[currentDynasty?.currentTid]?.abbr ||
      currentDynasty?.teamName
    const all = currentDynasty?.players || []
    return all
      .filter(p => isPlayerOnRoster(p, teamTid ?? teamAbbrForRoster, currentYear, currentDynasty))
      .map(p => ({ name: p.name, jerseyNumber: p.jerseyNumber, position: p.position }))
  }, [currentDynasty?.players, currentDynasty?.teams, currentDynasty?.currentTid, currentDynasty?.teamName, teamAbbr, currentYear, currentDynasty])

  const aiPrompt = useMemo(() => buildAIPrompt({
    title: `${currentYear} ${teamAbbr ? `${teamAbbr} ` : ''}Roster Edit`,
    roster: userRoster,
    structure: `This sheet has ONE tab: "Roster". It has 13 columns (A–M) and up to 85 data rows (rows 2–86). Row 1 is the protected header row. The sheet may already be pre-filled with current roster rows — your output will REPLACE all data rows, so include every player on the roster (edits + unchanged players).

═══════════════════════════════════════════════════════════
CRITICAL RULES — read before anything else
═══════════════════════════════════════════════════════════
1. Output ONLY the data rows (rows 2+). NEVER output the header row.
2. Output EXACTLY 13 tab-separated columns per line in this order: First Name, Last Name, Position, Class, Dev Trait, Jersey #, Archetype, Overall, Height, Weight, Hometown, State, Image URL.
3. One player per line. Maximum 85 lines total (rows 2 through 86).
4. NO COMMAS anywhere — not in numbers, not in names. Weight "215" never "2,015".
5. INTEGERS have no decimal point. Jersey # "7" not "7.0", Overall "88" not "88.0", Weight "210" not "210.0".
6. BLANK CELL for unknowns — leave the cell empty (two tabs in a row). NEVER guess, NEVER use "N/A", "-", "0", or "unknown".
7. Use ONLY the exact literal values listed for each dropdown column below. Wrong casing, extra spaces, or aliases (e.g. "FR" instead of "Fr") will be rejected by the dropdown.
8. Full Name: split into First Name (column A) and Last Name (column B). Hyphens and apostrophes stay intact. Suffixes like "Jr." or "II" go on the Last Name with a space (e.g. Last Name = "Smith Jr.").
9. No header row, no totals, no commentary, no blank separator rows.

═══════════════════════════════════════════════════════════
TAB: "Roster" — paste at cell A2 of the "Roster" tab
═══════════════════════════════════════════════════════════

Column layout (A→M), one player per line, tab-separated:

Col | Header (row 1, protected) | Your value                     | Format / allowed values
----+---------------------------+--------------------------------+---------------------------------------------------
 A  | First Name                | Player's first name            | text — no commas
 B  | Last Name                 | Player's last name             | text — no commas, suffixes ok (Jr., II, III)
 C  | Position                  | Position code                  | DROPDOWN (see list below) — exact literal
 D  | Class                     | Academic class                 | DROPDOWN (see list below) — exact literal
 E  | Dev Trait                 | Development trait              | DROPDOWN (see list below) — exact literal
 F  | Jersey #                  | Uniform number                 | integer 0–99, no decimals, no leading zero pad
 G  | Archetype                 | Position archetype             | DROPDOWN (see list below) — exact literal
 H  | Overall                   | OVR rating                     | integer 40–99, no decimals
 I  | Height                    | Height feet'inches"            | DROPDOWN (see list below) — exact literal, straight quotes
 J  | Weight                    | Weight in pounds               | integer (lbs), no "lbs" suffix, no commas
 K  | Hometown                  | City name                      | text
 L  | State                     | US state 2-letter code         | DROPDOWN (see list below) — exact literal
 M  | Image URL                 | Photo URL                      | blank unless a real URL is visible; never invent

───────────────────────────────────────────────────────────
COLUMN C — Position — MUST be one of these 21 values EXACTLY:
QB | HB | FB | WR | TE | LT | LG | C | RG | RT | LEDG | REDG | DT | SAM | MIKE | WILL | CB | FS | SS | K | P
(Note: "LEDG"/"REDG" are left/right edge; "SAM"/"MIKE"/"WILL" are strongside/middle/weakside linebackers. Do NOT output "LE", "RE", "EDGE", "LB", "OLB", "MLB", "ROLB", "LOLB", "OT", "OG", or "S".)

───────────────────────────────────────────────────────────
COLUMN D — Class — MUST be one of these 8 values EXACTLY (case + spacing matter):
Fr | RS Fr | So | RS So | Jr | RS Jr | Sr | RS Sr
(Write "RS Fr" with ONE space — NOT "RSFr", not "Rs Fr", not "RS-Fr".)

───────────────────────────────────────────────────────────
COLUMN E — Dev Trait — MUST be one of these 4 values EXACTLY:
Normal | Impact | Star | Elite

───────────────────────────────────────────────────────────
COLUMN G — Archetype — MUST be one of these EXACT values (pick one that fits the player's position):
QB: Backfield Creator | Dual Threat | Pocket Passer | Pure Runner
HB: Backfield Threat | Contact Seeker | East/West Playmaker | Elusive Bruiser | North/South Receiver | North/South Blocker
FB: Blocking | Utility
WR: Contested Specialist | Elusive Route Runner | Gadget | Gritty Possession | Physical Route Runner | Route Artist | Speedster
TE: Possession | Pure Blocker | Pure Possession | Vertical Threat
OL (LT/LG/C/RG/RT): Agile | Pass Protector | Raw Strength | Ground and Pound | Well Rounded
DL (LEDG/REDG/DT): Edge Setter | Gap Specialist | Power Rusher | Pure Power | Speed Rusher
LB (SAM/MIKE/WILL): Lurker | Signal Caller | Thumper
CB: Boundary | Bump and Run | Field | Zone
S (FS/SS): Box Specialist | Coverage Specialist | Hybrid
K/P: Accurate | Power
(Use forward slashes in "East/West Playmaker" and "North/South Receiver" — do NOT replace with hyphens.)

───────────────────────────────────────────────────────────
COLUMN I — Height — MUST be one of these 20 values EXACTLY (straight apostrophe, straight double-quote):
5'5" | 5'6" | 5'7" | 5'8" | 5'9" | 5'10" | 5'11" | 6'0" | 6'1" | 6'2" | 6'3" | 6'4" | 6'5" | 6'6" | 6'7" | 6'8" | 6'9" | 6'10" | 6'11" | 7'0"
(Do NOT output inches like "74" or feet-only like "6'". Use the exact feet'inches" format shown.)

───────────────────────────────────────────────────────────
COLUMN L — State — MUST be one of these 51 2-letter codes EXACTLY (uppercase):
AL | AK | AZ | AR | CA | CO | CT | DE | FL | GA | HI | ID | IL | IN | IA | KS | KY | LA | ME | MD | MA | MI | MN | MS | MO | MT | NE | NV | NH | NJ | NM | NY | NC | ND | OH | OK | OR | PA | RI | SC | SD | TN | TX | UT | VT | VA | WA | WV | WI | WY | DC
(No country codes. No full state names. Blank if unknown — never guess.)

═══════════════════════════════════════════════════════════
REQUIRED OUTPUT FORMAT
═══════════════════════════════════════════════════════════
=== ROSTER — paste at cell A2 of "Roster" tab ===
<FirstName>\t<LastName>\t<Position>\t<Class>\t<DevTrait>\t<Jersey#>\t<Archetype>\t<Overall>\t<Height>\t<Weight>\t<Hometown>\t<State>\t<ImageURL>
<FirstName>\t<LastName>\t<Position>\t<Class>\t<DevTrait>\t<Jersey#>\t<Archetype>\t<Overall>\t<Height>\t<Weight>\t<Hometown>\t<State>\t<ImageURL>
…one line per player, up to 85 total

═══════════════════════════════════════════════════════════
FINAL CHECK before you send
═══════════════════════════════════════════════════════════
[ ] Every line has exactly 13 tab-separated columns (12 tab characters)
[ ] No header row, no totals row, no commentary
[ ] No commas in any number (Jersey, Overall, Weight)
[ ] No decimals on integers (Jersey / Overall / Weight)
[ ] Position is one of the 21 listed codes (NOT "LE" / "RE" / "EDGE" / "LB" / "OLB" / "OT" / "OG" / "S")
[ ] Class uses exact spacing ("RS Fr" with one space)
[ ] Dev Trait is one of: Normal, Impact, Star, Elite
[ ] Archetype matches the position group allowed list
[ ] Height uses "feet'inches"" format (e.g. 6'2")
[ ] State is a 2-letter uppercase US code
[ ] Blank cells used for every unknown — nothing was invented
[ ] At most 85 data lines`,
    includeTeamMap: false,
  }), [currentYear, teamAbbr, userRoster])

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

  // Create roster sheet when modal opens - ALWAYS create fresh with current data
  useEffect(() => {
    const createSheet = async () => {
      if (isOpen && user && !sheetId && !creatingSheet && !creatingSheetRef.current && !showDeletedNote) {
        // Set ref immediately to prevent concurrent calls (state updates are async)
        creatingSheetRef.current = true
        setCreatingSheet(true)
        try {
          // Delete any existing roster edit sheet first (don't try to reuse old data)
          const existingSheetId = currentDynasty?.rosterEditSheetId
          if (existingSheetId) {
            try {
              await deleteGoogleSheet(existingSheetId)
            } catch {
              // Ignore errors if sheet doesn't exist or already deleted
            }
          }

          // Create a fresh roster sheet
          const sheetInfo = await createRosterSheet(
            editingTeamName,
            currentYear
          )

          // Pre-fill with the CURRENT roster using unified isPlayerOnRoster
          // helper. Filter by TID (teambuilder-safe) with abbr fallback;
          // pass currentDynasty so the legacy abbr path resolves correctly.
          const targetTid = teamAbbr
            ? getTidFromAbbr(teamAbbr, currentDynasty)
            : getCurrentTeamTid(currentDynasty)
          const targetTeam = targetTid ?? (teamAbbr || getCurrentRoster(currentDynasty)[0]?.team)
          const selectedYear = currentYear

          // Use unified isPlayerOnRoster for consistent filtering
          let existingPlayers = (currentDynasty?.players || []).filter(p =>
            isPlayerOnRoster(p, targetTeam, selectedYear, currentDynasty)
          )
          if (existingPlayers.length > 0) {
            await prefillRosterSheet(sheetInfo.spreadsheetId, existingPlayers)
          }

          setSheetId(sheetInfo.spreadsheetId)

          // Save new sheet ID to dynasty
          await updateDynasty(currentDynasty.id, {
            rosterEditSheetId: sheetInfo.spreadsheetId
          })
        } catch (error) {
          console.error('Failed to create roster sheet:', error)
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
    }
  }, [isOpen])

  const handleSyncFromSheet = async () => {
    if (!sheetId) return

    setSyncing(true)
    try {
      const roster = await readRosterFromRosterSheet(sheetId)
      await onSave(roster)
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
      const roster = await readRosterFromRosterSheet(sheetId)
      await onSave(roster)

      await deleteGoogleSheet(sheetId)
      await updateDynasty(currentDynasty.id, { rosterEditSheetId: null })

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
      await updateDynasty(currentDynasty.id, { rosterEditSheetId: null })
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
      title: 'Delete this roster edit sheet?',
      message: 'This deletes the Google Sheet without applying any edits. Your dynasty roster stays as-is.',
      confirmLabel: 'Delete',
      variant: 'danger',
    })
    if (!ok) return
    setDeletingSheet(true)
    try {
      await deleteGoogleSheet(sheetId)
      await updateDynasty(currentDynasty.id, { rosterEditSheetId: null })
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

  const embedUrl = sheetId ? getSingleSheetEmbedUrl(sheetId) : null
  const isLoading = creatingSheet

  return createPortal(
    <div
      className="fixed inset-0 top-0 left-0 right-0 bottom-0 bg-black bg-opacity-70 flex items-center justify-center z-[9999] p-3 sm:p-4"
      style={{ margin: 0 }}
      onMouseDown={handleClose}
    >
      <div
        className="card-elevated w-full sm:w-[95vw] max-h-[calc(100dvh-1.5rem)] sm:max-h-[95dvh] flex flex-col overflow-hidden"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <SheetModalHeader eyebrow="Roster" title={`${currentYear}${teamAbbr ? ` · ${teamAbbr}` : ''} Roster Edit`} onClose={handleClose} />

        <div className="flex-1 flex flex-col overflow-y-auto min-h-0 p-4 sm:p-6">
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
                Creating Roster Sheet...
              </p>
              <p className="text-sm mt-2 text-txt-secondary">
                Pre-filling current roster data
              </p>
              <SheetLoadingHint active={isLoading} />
            </div>
          </div>
        ) : showDeletedNote ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="card p-8 border-l-[3px] text-center max-w-sm" style={{ borderLeftColor: 'var(--surface-5)' }}>
              <p className="label-xs text-txt-tertiary mb-2">Status</p>
              <p className="text-xl font-bold text-txt-primary mb-2">Saved &amp; Moved to Trash</p>
              <p className="text-sm text-txt-secondary">Roster saved to your dynasty.</p>
            </div>
          </div>
        ) : sheetId ? (
          <div className="flex-1 flex flex-col overflow-hidden gap-3">
            <SheetModalAIHero
              tagline="Skip the typing. Let AI fill the roster edits."
              buttons={[{ label: 'Copy AI Prompt', onClick: () => setShowAIPrompt(true) }]}
            />
            {isMobile || !useEmbedded ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-4">
                <h3 className="label-xs text-txt-tertiary mb-2">Data Entry</h3>
                <p className="text-2xl font-bold text-txt-primary mb-6">Edit in Google Sheets</p>
                <div className="text-left mb-6 max-w-sm w-full card p-4 border-l-[3px]" style={{ borderLeftColor: 'var(--surface-5)' }}>
                  <p className="label-xs text-txt-tertiary mb-3">Instructions</p>
                  <ol className="text-sm space-y-2 text-txt-secondary">
                    <li className="flex gap-3"><span className="font-bold text-txt-primary tabular-nums">1.</span><span>Tap the button below to open Google Sheets</span></li>
                    <li className="flex gap-3"><span className="font-bold text-txt-primary tabular-nums">2.</span><span>Edit player info (Name, Position, Class, Dev Trait, etc.)</span></li>
                    <li className="flex gap-3"><span className="font-bold text-txt-primary tabular-nums">3.</span><span>Return to this app when done</span></li>
                    <li className="flex gap-3"><span className="font-bold text-txt-primary tabular-nums">4.</span><span>Tap "Save" below to sync your roster</span></li>
                  </ol>
                </div>
                <div className="flex flex-col sm:flex-row items-center gap-3 mb-6">
                  <a href={`https://docs.google.com/spreadsheets/d/${sheetId}/edit`} target="_blank" rel="noopener noreferrer" className="px-6 py-3 rounded-lg font-bold text-lg hover:opacity-90 transition-colors flex items-center gap-2" style={{ backgroundColor: '#0F9D58', color: '#FFFFFF' }}>
                    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14z"/><path d="M7 7h2v2H7zm0 4h2v2H7zm0 4h2v2H7zm4-8h6v2h-6zm0 4h6v2h-6zm0 4h6v2h-6z"/></svg>
                    Open Google Sheets
                  </a>
                </div>

                {/* Centered Save Buttons */}
                <div className="flex flex-col sm:flex-row gap-3 items-center justify-center mb-4">
                  <button
                    onClick={handleSyncAndDelete}
                    disabled={syncing || deletingSheet}
                    className={`px-6 py-3 rounded-lg font-semibold hover:opacity-90 transition-all text-sm ${highlightSave ? 'animate-pulse ring-4 ring-offset-2 scale-105' : ''}`}
                    style={{
                      backgroundColor: 'var(--text-primary)',
                      color: 'var(--surface-1)'
                    }}
                  >
                    {deletingSheet ? 'Saving...' : 'Save & Move to Trash'}
                  </button>
                  <button
                    onClick={handleSyncFromSheet}
                    disabled={syncing || deletingSheet}
                    className="btn btn-secondary px-6 py-3 text-sm"
                  >
                    {syncing ? 'Syncing...' : 'Save & Keep Sheet'}
                  </button>
                </div>
                {highlightSave && (
                  <span className="text-sm font-medium animate-bounce mb-4" style={{ color: 'var(--text-primary)' }}>

                  </span>
                )}

                <div className="flex flex-col sm:flex-row gap-3 items-center justify-center mb-4">
                  <button
                    onClick={handleDeleteSheetOnly}
                    disabled={syncing || deletingSheet || regenerating}
                    className="text-xs px-4 py-2 rounded-lg font-medium transition-colors border border-surface-4 hover:bg-surface-2 text-txt-secondary disabled:opacity-60"
                  >
                    {deletingSheet ? 'Deleting…' : 'Delete Sheet (No Save)'}
                  </button>
                  <button
                    onClick={handleRegenerateSheet}
                    disabled={syncing || deletingSheet || regenerating}
                    className="text-xs px-4 py-2 rounded-lg font-medium hover:opacity-90 transition-colors border"
                    style={{
                      backgroundColor: 'transparent',
                      borderColor: '#EF4444',
                      color: '#EF4444'
                    }}
                  >
                    {regenerating ? 'Regenerating...' : 'Messed up? Regenerate sheet'}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex-1 flex flex-col overflow-hidden min-h-0">
                  <SheetToolbar sheetId={sheetId} embedUrl={embedUrl} teamColors={teamColors} title="Roster" />
                </div>
                <div className="flex flex-wrap gap-2 items-center pt-1">
                  <button onClick={handleSyncAndDelete} disabled={syncing || deletingSheet} className={`px-4 py-2 rounded-lg font-semibold text-sm hover:opacity-90 transition-all disabled:opacity-60 ${highlightSave ? 'animate-pulse ring-4 ring-offset-2 scale-105' : ''}`} style={{ backgroundColor: 'var(--text-primary)', color: 'var(--surface-1)' }}>{deletingSheet ? 'Saving…' : 'Save & Move to Trash'}</button>
                  <button onClick={handleSyncFromSheet} disabled={syncing || deletingSheet} className="px-4 py-2 rounded-lg font-semibold text-sm border border-surface-4 hover:bg-surface-2 text-txt-primary disabled:opacity-60 transition-colors">{syncing ? 'Syncing…' : 'Save & Keep Sheet'}</button>
                  <button onClick={handleDeleteSheetOnly} disabled={syncing || deletingSheet || regenerating} className="px-4 py-2 rounded-lg font-semibold text-sm border border-surface-4 hover:bg-surface-2 text-txt-secondary disabled:opacity-60 transition-colors ml-auto">{deletingSheet ? 'Deleting…' : 'Delete Sheet (No Save)'}</button>
                  <button onClick={handleRegenerateSheet} disabled={syncing || deletingSheet || regenerating} className="px-4 py-2 rounded-lg font-semibold text-sm border hover:bg-surface-2 transition-colors disabled:opacity-60" style={{ backgroundColor: 'transparent', borderColor: 'var(--accent-error)', color: 'var(--accent-error)' }}>{regenerating ? 'Regenerating…' : 'Regenerate'}</button>
                </div>
              </>
            )}
            {!isMobile && (
              <div className="flex items-center justify-end">
                <button onClick={() => { const newValue = !useEmbedded; setUseEmbedded(newValue); localStorage.setItem('sheetEmbedPreference', newValue.toString()); }} className="text-[11px] px-2.5 py-1 rounded-full border border-surface-4 text-txt-tertiary hover:text-txt-secondary hover:border-surface-5 transition-colors bg-transparent">{useEmbedded ? '← Back to default view' : 'Try embedded view (beta)'}</button>
              </div>
            )}
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
      <AIPromptModal isOpen={showAIPrompt} onClose={() => setShowAIPrompt(false)} title={`${currentYear} ${teamAbbr ? `${teamAbbr} ` : ''}Roster Edit`} prompt={aiPrompt} pasteTarget={`Cell A2 of the "Roster" tab`} />
    </div>,
    document.body
  )
}
