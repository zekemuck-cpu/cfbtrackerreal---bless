import { useState, useEffect, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import AuthErrorModal from './AuthErrorModal'
import { useAuthErrorHandler } from '../hooks/useAuthErrorHandler'
import SheetToolbar from './SheetToolbar'
import SheetModalAIHero from './ui/SheetModalAIHero'
import SheetManualEntry from './ui/SheetManualEntry'
import SheetModalFooter from './ui/SheetModalFooter'
import {
  createRosterSheet,
  readRosterFromRosterSheet,
  deleteGoogleSheet,
  getSingleSheetEmbedUrl,
  prefillRosterSheet
} from '../services/sheetsService'
import { useDynasty, isPlayerOnRoster } from '../context/DynastyContext'
import { getCurrentTeamAbbr, getCurrentTeamTid } from '../data/teamRegistry'
import { useAuth } from '../context/AuthContext'
import { useToast } from './ui/Toast'
import { useConfirm } from './ui/ConfirmDialog'
import SheetModalHeader from './ui/SheetModalHeader'
import { buildAIPrompt } from '../utils/aiPrompt'
import SheetLoadingHint from './SheetLoadingHint'

export default function RosterEntryModal({ isOpen, onClose, onSave, currentYear, teamColors }) {
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

  const [useEmbedded, setUseEmbedded] = useState(() => {
    // Load preference from localStorage
    return localStorage.getItem('sheetEmbedPreference') === 'true'
  })
  const [highlightSave, setHighlightSave] = useState(false)
  const [regenerating, setRegenerating] = useState(false)

  const aiPrompt = useMemo(() => buildAIPrompt({
    title: `${currentYear} Roster Entry`,
    structure: `This sheet has ONE tab: "Roster". It has 13 columns (A–M) and up to 85 data rows (rows 2–86). Row 1 is the protected header row.

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
9. No header row, no totals, no commentary INSIDE the data, no blank separator rows. The paste-target label above the fence is required (see Method A/B rules above).

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
[ ] No header row, no totals row, no commentary INSIDE the data (the paste-target label above the fence is required, see Method A/B rules above)
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
  }), [currentYear])

  // Ref to prevent concurrent sheet creation (state updates are async, refs are immediate)
  const creatingSheetRef = useRef(false)

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

  // Create roster sheet when modal opens - always create fresh with current data
  useEffect(() => {
    const createSheet = async () => {
      if (isOpen && user && !sheetId && !creatingSheet && !creatingSheetRef.current && !showDeletedNote) {
        // Set ref immediately to prevent concurrent calls (state updates are async)
        creatingSheetRef.current = true
        setCreatingSheet(true)
        try {
          // Always create a fresh sheet
          const sheetInfo = await createRosterSheet(
            currentDynasty?.teamName || 'Dynasty',
            currentYear
          )
          setSheetId(sheetInfo.spreadsheetId)

          // Get current roster for this team and pre-fill the sheet.
          // Teambuilder-safe: use tid + dynasty so renamed teams resolve.
          const teamAbbr = getCurrentTeamAbbr(currentDynasty)
          const teamTid = getCurrentTeamTid(currentDynasty)
          const currentRoster = (currentDynasty?.players || []).filter(p =>
            isPlayerOnRoster(p, teamTid ?? teamAbbr, currentYear, currentDynasty)
          )

          if (currentRoster.length > 0) {
            await prefillRosterSheet(sheetInfo.spreadsheetId, currentRoster)
          }

          // Save sheet ID to dynasty
          await updateDynasty(currentDynasty.id, {
            rosterSheetId: sheetInfo.spreadsheetId
          })
        } catch (error) {
          console.error('Failed to create roster sheet:', error)
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

  const handleSave = async (players) => {
    try {
      await onSave(players)
      onClose()
    } catch (error) {
      toast.error('Failed to save roster.')
      console.error(error)
    }
  }

  const handleSyncFromSheet = async () => {
    if (!sheetId) return

    setSyncing(true)
    try {
      const players = await readRosterFromRosterSheet(sheetId)
      // Empty sheet → no-op save. Tell the user instead of silently
      // succeeding (the backend's data-loss guard would skip the write
      // anyway, leaving the user wondering what happened).
      if (!players || players.length === 0) {
        toast.warning('No players found in the sheet. Fill in player data (first name + overall rating required) before saving.')
        return
      }
      await onSave(players)
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
      const players = await readRosterFromRosterSheet(sheetId)
      if (!players || players.length === 0) {
        toast.warning('No players found in the sheet. Fill in player data (first name + overall rating required) before saving.')
        return
      }
      await onSave(players)

      await deleteGoogleSheet(sheetId)
      await updateDynasty(currentDynasty.id, { rosterSheetId: null })

      setSheetId(null)
      setShowDeletedNote(true)
      setTimeout(() => {
        onClose()
      }, 2500)
    } catch (error) {
      console.error('Error in handleSyncAndDelete:', error)
      if (!auth.handleError(error)) {
        toast.error(`Failed to sync/move to trash: ${error.message || 'Unknown error'}`)
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
      await updateDynasty(currentDynasty.id, { rosterSheetId: null })
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
      title: 'Delete this roster entry sheet?',
      message: 'This deletes the Google Sheet without applying any edits. Your dynasty roster stays as-is.',
      confirmLabel: 'Delete',
      variant: 'danger',
    })
    if (!ok) return
    setDeletingSheet(true)
    try {
      await deleteGoogleSheet(sheetId)
      await updateDynasty(currentDynasty.id, { rosterSheetId: null })
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
        <SheetModalHeader eyebrow="Roster" title="Roster Entry" onClose={handleClose} />

        <div className="flex-1 flex flex-col overflow-hidden p-4 sm:p-6">
        {/* First-time roster note */}
        <div
          className="mb-4 p-3 rounded-lg text-sm border-l-[3px] bg-surface-3"
          style={{ borderLeftColor: 'var(--surface-5)' }}
        >
          <p className="text-txt-secondary">
            <strong className="text-txt-primary">Note:</strong> This is the only time you'll need to enter your roster. In future seasons, your roster will carry over automatically based on players graduating/leaving and your recruiting class additions. All fields are optional - fill in whatever columns you want.
          </p>
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
                Creating Roster Sheet...
              </p>
              <p className="text-sm mt-2 text-txt-secondary">
                Setting up roster sheet
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
              tagline="Skip the typing. Let AI fill the roster."
              buttons={[{ label: 'Copy AI Prompt', prompt: aiPrompt }]}
            />
            {!useEmbedded ? (
              <SheetManualEntry sheetId={sheetId} />
            ) : (
              <div className="flex-1 flex flex-col overflow-hidden min-h-0 border border-surface-4 rounded-lg">
                <SheetToolbar sheetId={sheetId} embedUrl={embedUrl} teamColors={teamColors} title="Roster" />
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
              showEmbeddedToggle
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
