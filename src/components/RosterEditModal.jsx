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
import SheetToolbar from './SheetToolbar'
import SheetModalAIHero from './ui/SheetModalAIHero'
import SheetManualEntry from './ui/SheetManualEntry'
import SheetModalFooter from './ui/SheetModalFooter'
import {
  createRosterSheet,
  readRosterFromRosterSheet,
  serializeRosterToTsv,
  deleteGoogleSheet,
  getSingleSheetEmbedUrl,
  prefillRosterSheet
} from '../services/sheetsService'
import { buildAIPrompt } from '../utils/aiPrompt'
import { arePlayerAttributesEnabled } from '../editions'
import { ATTRIBUTE_PROMPT_LEGEND } from '../utils/attributeEntry'
import { POSITIONS, CLASSES, DEV_TRAITS, archetypesForPosition } from '../data/rosterOptions'
import SheetLoadingHint from './SheetLoadingHint'
import LocalDataEntry from './ui/LocalDataEntry'
import { splitTsv } from '../utils/tsvParse'
import { normalizeRosterRows } from '../utils/rosterRealign'

// Dropdown values for the roster grid's constrained columns. Archetype depends
// on the row's Position, so it's a function of the row.
const ROSTER_COLUMN_OPTIONS = {
  Position: POSITIONS,
  Class: CLASSES,
  'Dev Trait': DEV_TRAITS,
  Archetype: (row, cols) => archetypesForPosition(row[cols.indexOf('Position')]),
}

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
  // Local paste is the DEFAULT; the Google Sheet flow is the opt-in fallback.
  const [useLocal, setUseLocal] = useState(true)

  const [useEmbedded, setUseEmbedded] = useState(() => {
    // Load preference from localStorage
    return localStorage.getItem('sheetEmbedPreference') === 'true'
  })
  const [highlightSave, setHighlightSave] = useState(false)

  const rosterPlayers = useMemo(() => {
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
  }, [currentDynasty?.players, currentDynasty?.teams, currentDynasty?.currentTid, currentDynasty?.teamName, teamAbbr, currentYear, currentDynasty])

  // Minimal shape for the AI prompt's roster block.
  const userRoster = useMemo(
    () => rosterPlayers.map(p => ({ name: p.name, jerseyNumber: p.jerseyNumber, position: p.position })),
    [rosterPlayers],
  )

  // Include the Attributes column (O) only when full-attribute entry is on for
  // this dynasty — the edition supports attributes AND "Hide all ratings" is
  // off (arePlayerAttributesEnabled). When it's off, the roster sheet drops to
  // a clean A–N (14 cols): otherwise the current-roster pre-fill dumps every
  // player's stored ratings into col O, which reads as messy on an
  // attributes-off dynasty.
  const attributesEnabled = arePlayerAttributesEnabled(currentDynasty)
  // Pre-fill the local grid with the current roster so Edit Roster opens on the
  // existing team (easy mass-edit) instead of a blank table.
  const initialRosterText = useMemo(
    () => serializeRosterToTsv(rosterPlayers, { year: currentYear, includeAttributes: attributesEnabled }),
    [rosterPlayers, currentYear, attributesEnabled],
  )
  const attrColRange = attributesEnabled ? 'A–O' : 'A–N'
  const attrColCount = attributesEnabled ? 15 : 14
  const attrTabChars = attributesEnabled ? 14 : 13
  const attrColListSuffix = attributesEnabled ? ', Attributes' : ''
  const attrTableRow = attributesEnabled
    ? `\n O  | Attributes                | All ratings (one cell)         | "CODE value" pairs, comma-separated (CFB 27) — see the ATTRIBUTES section below; blank if no ratings visible`
    : ''
  const attrSection = attributesEnabled
    ? `\n───────────────────────────────────────────────────────────
COLUMN O — Attributes (CFB 27) — the player's ENTIRE rating set as ONE cell:
comma-separated "CODE value" pairs using the codes below, IN THIS ORDER. Include
every rating you can see for the player; leave the WHOLE cell blank if you have no
ratings for them. The cell uses COMMAS between pairs (never tabs) so it stays one
cell. Ratings are integers 0–99, no "+/-" gain deltas — if a screenshot shows
"84 (+1)", record 84. Example cell: "AWR 84, SPD 91, ACC 92, STR 70, AGI 90, COD 88".

Attribute codes (CODE=Name):
${ATTRIBUTE_PROMPT_LEGEND}
`
    : ''
  const attrOutputCol = attributesEnabled ? '\t<Attributes>' : ''

  const aiPrompt = useMemo(() => buildAIPrompt({
    title: `${currentYear} ${teamAbbr ? `${teamAbbr} ` : ''}Roster Edit`,
    roster: userRoster,
    structure: `This sheet has ONE tab: "Roster". It has ${attrColCount} columns (${attrColRange}) and up to 85 data rows (rows 2–86). Row 1 is the protected header row. The sheet may already be pre-filled with current roster rows — your output will REPLACE all data rows, so include every player on the roster (edits + unchanged players).

═══════════════════════════════════════════════════════════
CRITICAL RULES — read before anything else
═══════════════════════════════════════════════════════════
1. Output ONLY the data rows (rows 2+). NEVER output the header row.
2. Output EXACTLY ${attrColCount} tab-separated columns per line in this order: First Name, Last Name, Position, Class, Dev Trait, Jersey #, Archetype, Overall, Height, Weight, Hometown, State, Image URL, NIL${attrColListSuffix}.
3. One player per line. Maximum 85 lines total (rows 2 through 86).
4. NO COMMAS anywhere — not in numbers, not in names. Weight "215" never "2,015".
5. INTEGERS have no decimal point. Jersey # "7" not "7.0", Overall "88" not "88.0", Weight "210" not "210.0".
6. BLANK CELL for unknowns — leave the cell empty (two tabs in a row). NEVER guess, NEVER use "N/A", "-", "0", or "unknown".
7. Use ONLY the exact literal values listed for each dropdown column below. Wrong casing, extra spaces, or aliases (e.g. "FR" instead of "Fr") will be rejected by the dropdown.
8. Full Name: split into First Name (column A) and Last Name (column B). Hyphens and apostrophes stay intact. Suffixes like "Jr." or "II" go on the Last Name with a space (e.g. Last Name = "Smith Jr.").
9. No header row, no totals, no commentary INSIDE the data, no blank separator rows.

═══════════════════════════════════════════════════════════
SECTION: "Roster"
═══════════════════════════════════════════════════════════

Column layout (${attrColRange}), one player per line, tab-separated:

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
 N  | NIL                       | Player's NIL amount (CFB 27)   | integer, no commas — blank if not shown (e.g. CFB 26)${attrTableRow}

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
${attrSection}
═══════════════════════════════════════════════════════════
REQUIRED OUTPUT FORMAT
═══════════════════════════════════════════════════════════
=== ROSTER ===
<FirstName>\t<LastName>\t<Position>\t<Class>\t<DevTrait>\t<Jersey#>\t<Archetype>\t<Overall>\t<Height>\t<Weight>\t<Hometown>\t<State>\t<ImageURL>\t<NIL>${attrOutputCol}
<FirstName>\t<LastName>\t<Position>\t<Class>\t<DevTrait>\t<Jersey#>\t<Archetype>\t<Overall>\t<Height>\t<Weight>\t<Hometown>\t<State>\t<ImageURL>\t<NIL>${attrOutputCol}
…one line per player, up to 85 total

═══════════════════════════════════════════════════════════
FINAL CHECK before you send
═══════════════════════════════════════════════════════════
[ ] Every line has exactly ${attrColCount} tab-separated columns (${attrTabChars} tab characters)
[ ] No header row, no totals row, no commentary INSIDE the data
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
  }), [currentYear, teamAbbr, userRoster, attributesEnabled, attrColRange, attrColCount, attrTabChars, attrColListSuffix, attrTableRow, attrSection, attrOutputCol])

  // Ref to prevent concurrent sheet creation (state updates are async, refs are immediate)
  const creatingSheetRef = useRef(false)
  // Single-attempt guard: a FAILED creation must not silently re-fire (the
  // runaway loop that spam-created sheets). One attempt per modal-open; an
  // explicit retry bumps auth.retryCount and re-arms exactly one more.
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

  // Create roster sheet when modal opens - ALWAYS create fresh with current data
  useEffect(() => {
    // An explicit retry re-arms one fresh attempt by bumping auth.retryCount.
    if (auth.retryCount !== lastRetryCountRef.current) {
      lastRetryCountRef.current = auth.retryCount
      creationAttemptedRef.current = false
    }

    const createSheet = async () => {
      // Don't create a Google Sheet while the local paste path is active.
      if (isOpen && !useLocal && user && !sheetId && !creatingSheet && !creatingSheetRef.current && !showDeletedNote && !creationAttemptedRef.current) {
        // Mark attempted BEFORE any await so a rejection can't loop back in
        creationAttemptedRef.current = true
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
            await prefillRosterSheet(sheetInfo.spreadsheetId, existingPlayers, currentYear)
          }

          setSheetId(sheetInfo.spreadsheetId)

          // Save new sheet ID to dynasty
          await updateDynasty(currentDynasty.id, {
            rosterEditSheetId: sheetInfo.spreadsheetId
          })
        } catch (error) {
          console.error('Failed to create roster sheet:', error)
          if (!auth.handleError(error)) toast.error(auth.describeError(error, 'create the roster sheet'))
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
      creatingSheetRef.current = false
      creationAttemptedRef.current = false
      setUseLocal(true)
    }
  }, [isOpen])

  // Local paste import: the AI emits the full 14-column roster, one player per
  // line — exactly the columns the parser reads as row[0..13]. Each line is
  // self-identified by player name, so no pre-filled columns and no
  // normalization. Routes through the same onSave the sheet sync uses.
  const handleLocalImport = async (text) => {
    const roster = await readRosterFromRosterSheet(null, { rows: splitTsv(text) })
    await onSave(roster)
    onClose()
  }

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

  const embedUrl = sheetId ? getSingleSheetEmbedUrl(sheetId) : null
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
        <SheetModalHeader title={`${currentYear}${teamAbbr ? ` ${teamAbbr}` : ''} Roster Edit`} onClose={handleClose} />

        <div className="flex-1 flex flex-col overflow-y-auto min-h-0 p-4 sm:p-6">
        {useLocal && !showDeletedNote ? (
          <LocalDataEntry
            aiPrompt={aiPrompt}
            onImport={handleLocalImport}
            onUseGoogle={() => setUseLocal(false)}
            onCancel={handleClose}
            importLabel="Import Roster"
            initialText={initialRosterText}
            imageColumn="Image"
            normalizeRows={normalizeRosterRows}
            columnOptions={ROSTER_COLUMN_OPTIONS}
            columns={attributesEnabled
              ? ['First Name', 'Last Name', 'Position', 'Class', 'Dev Trait', 'Jersey #', 'Archetype', 'Overall', 'Height', 'Weight', 'Hometown', 'State', 'Image', 'NIL', 'Attributes']
              : ['First Name', 'Last Name', 'Position', 'Class', 'Dev Trait', 'Jersey #', 'Archetype', 'Overall', 'Height', 'Weight', 'Hometown', 'State', 'Image', 'NIL']}
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
            <div className="card p-8 text-center max-w-sm">
              <p className="label-xs text-txt-tertiary mb-2">Status</p>
              <p className="text-xl font-bold text-txt-primary mb-2">Saved &amp; Moved to Trash</p>
              <p className="text-sm text-txt-secondary">Roster saved to your dynasty.</p>
            </div>
          </div>
        ) : sheetId ? (
          <div className="flex-1 flex flex-col overflow-hidden gap-3">
            <SheetModalAIHero
              tagline="Skip the typing. Let AI fill the roster edits."
              buttons={[{ label: 'Copy AI Prompt', prompt: aiPrompt }]}
            />
            {isMobile || !useEmbedded ? (
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
