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
  serializeRosterToTsv,
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
  // Local paste is the DEFAULT; the Google Sheet flow is the opt-in fallback.
  const [useLocal, setUseLocal] = useState(true)

  const [useEmbedded, setUseEmbedded] = useState(() => {
    // Load preference from localStorage
    return localStorage.getItem('sheetEmbedPreference') === 'true'
  })
  const [highlightSave, setHighlightSave] = useState(false)
  const [regenerating, setRegenerating] = useState(false)

  // Include the Attributes column (O) only when full-attribute entry is on for
  // this dynasty — the edition supports attributes AND "Hide all ratings" is
  // off (arePlayerAttributesEnabled). When it's off, the roster sheet drops to
  // a clean A–N (14 cols) so it matches Edit Roster and the other entry flows.
  const attributesEnabled = arePlayerAttributesEnabled(currentDynasty)
  // Pre-fill the local grid with the current roster (when one exists) so the
  // grid opens on the team for easy mass-editing instead of a blank table.
  const rosterPlayers = useMemo(() => {
    const teamAbbr = getCurrentTeamAbbr(currentDynasty)
    const teamTid = getCurrentTeamTid(currentDynasty)
    // Overall for THIS year (per-year map wins, else the flat field).
    const ovrFor = (p) =>
      Number(p?.overallByYear?.[currentYear] ?? p?.overallByYear?.[String(currentYear)] ?? p?.overall ?? 0)
    return (currentDynasty?.players || [])
      .filter(p => isPlayerOnRoster(p, teamTid ?? teamAbbr, currentYear, currentDynasty))
      // Highest overall first so the grid opens sorted like the in-game roster —
      // edits don't mean hunting for a player.
      .sort((a, b) => ovrFor(b) - ovrFor(a))
  }, [currentDynasty, currentYear])
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
every rating you can see for the player ACROSS ALL screenshots — merge the list
view, the attribute table, and any highlighted card into one combined set, so a
player captured in more than one view gets the UNION of every rating shown. Leave
the WHOLE cell blank only if you have no ratings for them anywhere. The cell uses COMMAS between pairs (never tabs) so it stays one
cell. Ratings are integers 0–99, no "+/-" gain deltas — if a screenshot shows
"84 (+1)", record 84. Example cell: "AWR 84, SPD 91, ACC 92, STR 70, AGI 90, COD 88".

Attribute codes (CODE=Name):
${ATTRIBUTE_PROMPT_LEGEND}
`
    : ''
  const attrOutputCol = attributesEnabled ? '\t<Attributes>' : ''

  // Known-data block: when a roster already exists, embed it (same column
  // order as the output) so the AI can complete players it sees in the
  // screenshots without every one having to be highlighted. Reference data
  // only — output stays driven by the screenshots.
  const knownDataSection = rosterPlayers.length > 0
    ? `\n═══════════════════════════════════════════════════════════
KNOWN ROSTER DATA — a gap-filler applied AFTER screenshot extraction
═══════════════════════════════════════════════════════════
Do this in TWO ordered steps. Do NOT skip or shortcut step 1.

STEP 1 — EXTRACT EVERYTHING FROM EVERY SCREENSHOT, FOR EVERY PLAYER.
Read EVERY uploaded screenshot, start to finish — do not skip any, do not sample,
do not stop early. Pull EVERY field and EVERY attribute you can see for EVERY
player shown, the same exhaustive effort for all of them. Screenshots come in
different views: the roster LIST view shows ~6 attributes per row (SPD, ACC, AGI,
COD, STR, AWR); the ATTRIBUTE-TABLE view shows 16+ per row; a highlighted/selected
player shows their FULL card. Capture everything visible in every one of them.

MERGE EACH PLAYER ACROSS SCREENSHOTS — ESPECIALLY HORIZONTALLY-SCROLLED TABLES.
The attribute table is WIDER than the screen, so it is almost always captured as
SEVERAL screenshots scrolled sideways. The FIRST shows the NAME column plus the
first few attributes (SPD, ACC, AGI, COD, STR, AWR, ...). Each LATER screenshot is
the SAME list scrolled RIGHT to reveal MORE attribute columns (THP, SAC, MAC, DAC,
RUN, TUP, BSK, PAC, CAR, BCV, JKM, SPM, BTK, SFA, TRK, IBL, STA, TGH, INJ, ...) —
and those later shots usually DO NOT repeat the name column; they are just grids
of numbers. You MUST still tie every one of those number rows back to the right
player.

Match a nameless number row to its player BY ROW POSITION: the rows stay in the
SAME ORDER in every screenshot (same sort, e.g. OVR descending), so the Nth row is
the SAME player in every shot. Verify the alignment two ways before trusting it:
  (a) the HIGHLIGHTED row — the lighter/selected row, which is the same player as
      the right-side detail card — is the same player in each screenshot; and
  (b) consecutive scrolled shots share OVERLAPPING columns (e.g. THP sits at the
      right edge of one shot and the left edge of the next; DAC/RUN/TUP/BSK repeat
      between shots). Line those overlapping columns up — the values must match for
      the same row. That confirms the rows are aligned.

Then ASSEMBLE each player's FULL attribute set by concatenating that row's columns
from EVERY scrolled screenshot, left to right, into column O (list them once, no
duplicates from the overlap). A starter captured across three scrolls should come
out with ~20-25+ attributes, NOT 6. Take the UNION — never stop at the six from the
first shot. Do the same for non-attribute fields (height, weight, hometown,
archetype, dev trait, jersey): if it's visible in ANY screenshot, it goes in the
row.

A player is NOT lower priority because they appear in the KNOWN DATA list below,
and NOT lower priority because they don't. The known data below must NEVER cause
you to record fewer attributes for anyone — your job is to read the screenshots to
the fullest for the entire roster.

STEP 2 — FILL REMAINING GAPS FROM KNOWN DATA.
Only after step 1, for each player, take EVERY field STILL blank (not visible in
any screenshot) and fill it from that player's row in the KNOWN DATA below — every
missing attribute in column O, plus hometown, height/weight, archetype, dev trait,
and any other empty field — so a player who wasn't highlighted still comes out as
complete as possible. Match by name (or initial + position + jersey). Fill every
gap you have known data for; only leave a field blank when it's missing from BOTH
the screenshots and the known data.

RULES:
- Output stays driven by the SCREENSHOTS: one row per player VISIBLE in a
  screenshot. Do NOT add a row for a known-data player who is not in the
  screenshots. The known data is reference only, not rows to emit.
- Produce ONE unified TSV — never a second table.
- The SCREENSHOT always wins on any field it shows; known data only fills the
  blanks the screenshots leave. This applies per-attribute inside column O too:
  a rating visible in a screenshot overrides the known-data value.
- A player with no match in the known data is still output in full from the
  screenshots — extract everything visible for them.
- Never invent: if a field is blank in the screenshots AND blank/absent in the
  known data, leave it blank.

KNOWN DATA (tab-separated, same ${attrColCount} columns as the output, no header):
${initialRosterText}
`
    : ''

  const aiPrompt = useMemo(() => buildAIPrompt({
    title: `${currentYear} Roster Entry`,
    structure: `This sheet has ONE tab: "Roster". It has ${attrColCount} columns (${attrColRange}) and up to 85 data rows (rows 2–86). Row 1 is the protected header row.

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
8. Full Name: split into First Name (column A) and Last Name (column B). Hyphens and apostrophes stay intact. Suffixes like "Jr." or "II" go on the Last Name with a space (e.g. Last Name = "Smith Jr."). EA's roster screen often abbreviates the first name to an initial ("B. Hubbard"); output the player's FULL first name when you can see it anywhere (a player card, another screenshot). If only the initial is visible, output just that initial for First Name rather than guessing the full name — the app will reconcile it with your existing roster.
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
${attrSection}${knownDataSection}
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
  }), [currentYear, attributesEnabled, attrColRange, attrColCount, attrTabChars, attrColListSuffix, attrTableRow, attrSection, attrOutputCol, knownDataSection])

  // Ref to prevent concurrent sheet creation (state updates are async, refs are immediate)
  const creatingSheetRef = useRef(false)
  // Guards the runaway loop: a FAILED creation must not silently re-fire. The
  // old effect reset its guards on every completion and re-ran, so each failure
  // spawned a brand-new Google Sheet (the dozens of orphaned roster sheets).
  // We attempt creation at most once per modal-open; an explicit retry — the
  // AuthErrorModal's Refresh or the Regenerate button — bumps auth.retryCount,
  // which re-arms exactly one more attempt.
  const creationAttemptedRef = useRef(false)
  const lastRetryCountRef = useRef(auth.retryCount)

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

  // Create the roster sheet ONCE when the modal opens. Single-attempt by
  // design: on failure we surface the error and stop — never auto-retry, which
  // is what spam-created sheets.
  useEffect(() => {
    // An explicit retry (Refresh after re-auth, or Regenerate) re-arms one
    // fresh attempt by bumping auth.retryCount.
    if (auth.retryCount !== lastRetryCountRef.current) {
      lastRetryCountRef.current = auth.retryCount
      creationAttemptedRef.current = false
    }

    const createSheet = async () => {
      // Don't touch Google auth/creation while the local paste path is active.
      if (useLocal) return
      if (!isOpen || sheetId || showDeletedNote) return
      // Not signed in → prompt to authenticate rather than stalling the spinner.
      if (!user) { auth.setShowAuthError(true); return }
      // Already creating, or we've already used this open's one attempt.
      if (creatingSheetRef.current || creationAttemptedRef.current) return

      // Mark attempted BEFORE the first await so a rejection can't loop back in
      // and create another sheet.
      creationAttemptedRef.current = true
      creatingSheetRef.current = true
      setCreatingSheet(true)
      try {
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
          await prefillRosterSheet(sheetInfo.spreadsheetId, currentRoster, currentYear)
        }
        await updateDynasty(currentDynasty.id, { rosterSheetId: sheetInfo.spreadsheetId })
      } catch (error) {
        console.error('Failed to create roster sheet:', error)
        // Auth error → AuthErrorModal lets the user re-auth and retry. Anything
        // else → a toast. Either way the effect does NOT loop.
        if (!auth.handleError(error)) {
          toast.error(auth.describeError(error, 'create the roster sheet'))
        }
      } finally {
        setCreatingSheet(false)
        creatingSheetRef.current = false
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

  const handleSave = async (players) => {
    try {
      await onSave(players)
      onClose()
    } catch (error) {
      toast.error('Failed to save roster.')
      console.error(error)
    }
  }

  // Local paste import: the AI emits the full 14-column roster, one player per
  // line — exactly the columns the parser reads as row[0..13]. Each line is
  // self-identified by player name, so no pre-filled columns and no
  // normalization. Mirrors handleSyncFromSheet's empty-sheet guard + save.
  const handleLocalImport = async (text) => {
    const players = await readRosterFromRosterSheet(null, { rows: splitTsv(text) })
    if (!players || players.length === 0) {
      toast.warning('No players found in the pasted data. Each player needs at least a first name and overall rating.')
      return
    }
    await onSave(players)
    onClose()
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
      className="fixed inset-0 top-0 left-0 right-0 bottom-0 bg-black bg-opacity-70 flex items-center justify-center z-[9999] py-8 px-4 sm:p-4"
      style={{ margin: 0 }}
      onMouseDown={handleClose}
    >
      <div
        className={`card-elevated w-full max-h-[calc(100dvh-4rem)] flex flex-col overflow-hidden ${
          useEmbedded
            ? 'sm:w-[95vw] sm:h-[95dvh]'
            : 'sm:max-w-[min(95vw,1100px)] sm:h-auto'
        }`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <SheetModalHeader eyebrow="Roster" title="Roster Entry" onClose={handleClose} />

        <div className="flex-1 flex flex-col overflow-hidden p-4 sm:p-6">
        {/* First-time roster note */}
        <div
          className="mb-4 p-3 rounded-lg text-sm bg-surface-3"
        >
          <p className="text-txt-secondary">
            <strong className="text-txt-primary">Note:</strong> This is the only time you'll need to enter your roster. In future seasons, your roster will carry over automatically based on players graduating/leaving and your recruiting class additions. All fields are optional - fill in whatever columns you want.
          </p>
          <p className="text-txt-tertiary text-xs mt-2">
            The Attributes column is one cell for bulk AI import. To read or hand-edit a player's individual ratings, open that player's page — its Ratings tab lays every attribute out in the game's order.
          </p>
        </div>

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
                Setting up roster sheet
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
        firstTime={!user}
      />
    </div>,
    document.body,
  )
}
