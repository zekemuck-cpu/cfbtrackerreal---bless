import { useState, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useDynasty } from '../context/DynastyContext'
import { useToast } from './ui/Toast'
import SheetModalHeader from './ui/SheetModalHeader'
import LocalDataEntry from './ui/LocalDataEntry'
import { RECRUIT_POSITIONS } from '../services/sheetsService'
import { buildAIPrompt } from '../utils/aiPrompt'
import { ATTRIBUTE_COLUMNS, ATTRIBUTE_ABBR } from '../utils/recruitAttributes'
import { splitTsv } from '../utils/tsvParse'
import { parseRecruitingDatabaseRows } from '../utils/recruitingDatabaseSheetFormat'
import { mergeRecruitingDatabaseRows } from '../utils/recruitingDatabaseSync'
import { findDuplicateClusters, applyDuplicateResolution } from '../utils/recruitingDatabasePool'
import DuplicateReviewModal from './DuplicateReviewModal'

// Header labels for the local-paste grid — the Recruiting Database is HS
// recruits only (real Targets feeding it are pre-filtered to !isPortal
// upstream in ScoutStaff.jsx), so a "Previous Team" field never applies here
// and is deliberately not shown or asked for. This matches the column order
// recruitingDatabaseSheetFormat.js's parser expects (still used here to parse
// a pasted TSV reply into recruit objects — no live Google Sheet involved).
const RECRUITING_DB_PASTE_COLUMNS = [
  'Name', 'Class', 'Pos', 'Arch', 'Stars', 'Natl Rk', 'St Rk', 'Pos Rk',
  'Height', 'Weight', 'Hometown', 'State', 'Gem/Bust', 'Dev', 'Attributes',
]

// Number of core fields (Name through Dev Trait) before the trailing,
// optional Attributes cell.
const CORE_FIELD_COUNT = RECRUITING_DB_PASTE_COLUMNS.length - 1

// The AI occasionally still emits an extra blank field before Attributes
// (old habit from when "Prev Team" sat there) even though the prompt no
// longer asks for it — when that happens the grid was showing Attributes
// one column short of where it actually landed, i.e. blank. Attributes is
// always meant to be the trailing cell regardless of how many fields came
// before it, so keep the first 14 core fields and whatever the LAST cell
// is, dropping any stray cell(s) in between — this is robust to extra
// blanks appearing anywhere before Attributes, not just at one exact index.
function normalizeRecruitingDbRows(rows) {
  return rows.map(row => (
    row.length > CORE_FIELD_COUNT + 1
      ? [...row.slice(0, CORE_FIELD_COUNT), row[row.length - 1]]
      : row
  ))
}

// Dropdown options for the paste grid's enumerated columns — same idea as
// the Sheet's own data-validation dropdowns, so a pasted/typed value snaps
// onto the canonical casing on the way in.
const RECRUITING_DB_COLUMN_OPTIONS = {
  'Pos': RECRUIT_POSITIONS,
  'Gem/Bust': ['Gem', 'Bust'],
  'Dev': ['Hidden', 'Normal', 'Impact', 'Star', 'Elite'],
}

// The Recruiting Database's only ingest path: paste an AI reply (or type/
// upload a TSV) straight into a local editable grid — no Google account, no
// OAuth, no live sheet to keep in sync. This used to also offer a "Use Google
// Sheet instead" escape hatch with a persistent, two-way-synced spreadsheet,
// but that path was the source of most of this feature's bugs (silent
// data-loss on hand-typed rows with no pid, stale reads, cascading background
// syncs) for a workflow (live-editing in a spreadsheet tab) nobody was
// actually relying on — removed entirely in favor of this simpler, fully
// local flow. Export JSON / Restore from JSON (PlayerDatabase.jsx) cover the
// account-independent backup need the Sheet used to double as.
export default function RecruitingDatabaseImportModal({ isOpen, onClose, dynasty }) {
  const { currentDynasty, updateDynasty } = useDynasty()
  const { toast } = useToast()

  // Pending local-paste import awaiting duplicate review — { mergedRecruits,
  // addedCount, clusters } | null.
  const [pendingLocalImport, setPendingLocalImport] = useState(null)
  const [confirmingLocalImport, setConfirmingLocalImport] = useState(false)

  const finalizeLocalImport = async (mergedRecruits, addedCount, deletedPids = new Set()) => {
    const finalRecruits = applyDuplicateResolution(mergedRecruits, deletedPids)
    await updateDynasty(dynasty.id, { recruitingDatabasePlayers: finalRecruits })
    toast.success(`Imported ${addedCount} recruit${addedCount === 1 ? '' : 's'}.`)
    setPendingLocalImport(null)
    onClose?.()
  }

  // Local paste import: parse the AI's (or hand-typed/uploaded) TSV reply into
  // recruit objects via the SAME column layout a Sheet-based read used to, then
  // merge them onto whatever's already in this dynasty's Recruiting Database
  // (pid-based, so re-importing an already-known recruit updates it instead of
  // duplicating it — see mergeRecruitingDatabaseRows). Newly-incoming recruits
  // are checked against the existing database for possible duplicates before
  // finalizing — conservative name+position+archetype+stars match (see
  // findDuplicateClusters).
  const handleLocalImport = async (text) => {
    if (!dynasty) throw new Error('No Recruiting Database to import into yet.')
    const rows = splitTsv(text)
    const parsed = parseRecruitingDatabaseRows(rows).filter(r => r.name)
    if (!parsed.length) throw new Error('No recruits found in the pasted text.')
    const { mergedRecruits } = mergeRecruitingDatabaseRows({
      incomingRows: parsed,
      localRecruits: dynasty.recruitingDatabasePlayers || [],
    })
    const clusters = findDuplicateClusters(mergedRecruits)
    if (clusters.length > 0) {
      setPendingLocalImport({ mergedRecruits, addedCount: parsed.length, clusters })
    } else {
      await finalizeLocalImport(mergedRecruits, parsed.length)
    }
  }

  // Recognized attribute names + short codes, same reference list the
  // Recruiting Commitments prompt uses — the Database sheet's single
  // Attributes cell is parsed the same way (recruitingDatabaseSheetFormat.js).
  const attrNameRef = useMemo(
    () => ATTRIBUTE_COLUMNS.map(n => `${n} (${ATTRIBUTE_ABBR[n] || n})`).join(', '),
    []
  )

  const prompt = useMemo(() => buildAIPrompt({
    title: 'Recruiting Database',
    structure: `Output ONLY the NEW recruits visible in THIS request's screenshots as tab-separated rows — I'll paste your reply straight into the app, one row per recruit.

You may get any of these screenshots. Handle each:
  • A RECRUITING BOARD (any list of recruits): output each recruit's columns A–N. Leave the Attributes cell (O) blank.
  • A recruit's PLAYER PAGE "Attributes" tab: output that ONE recruit's row, columns A–N PLUS the single Attributes cell (O) filled from the tab.
Attributes appear ONLY on the player-page Attributes tab, never on the board. If you only have the board, the Attributes cell stays blank (not every recruit is scouted, and that is expected).

This is a personal scouting reference, independent of any team's actual Targets board — recruits entered here are never added as real recruiting targets, so there is no Commitment column to fill. These are HS recruits only — no Previous Team column either.

═══════════════════════════════════════════════════════════
CRITICAL RULES
═══════════════════════════════════════════════════════════
1. Output ONLY data rows for NEW recruits. NEVER output the header row or re-output existing rows.
2. Tab-separated. Columns in EXACT order A→N (then the single Attributes cell O when scouted).
3. One row per recruit; keep screenshot order.
4. NO COMMAS in numbers ("1234", not "1,234"). Integers have no decimal point. No quotes around numbers.
5. BLANK for unknown — never guess, never 0/"-"/"N/A". Blank ≠ zero.
6. Dropdown columns (B, C, D, E, I, L, M, N) MUST be EXACTLY one of the listed values.
7. Column E (Stars) uses ☆ symbols, NOT digits.
8. Do NOT output the hidden "pid" column, nor the trailing "Updated" column after it — the app fills both.
9. Player names use normal title case (e.g. "Tyron Funk"), even if the screenshot shows the name in ALL CAPS. NEVER output a name in all caps.

═══════════════════════════════════════════════════════════
COLUMNS A–N (in this exact order, tab-separated)
═══════════════════════════════════════════════════════════
 A Player     | Full name, normal title case (e.g. "Tyron Funk", NOT "TYRON FUNK") — re-case it yourself even if the screenshot shows it in all caps
 B Class      | Dropdown: HS, JUCO Fr, JUCO So, JUCO Jr, Fr, RS Fr, So, RS So, Jr, RS Jr
 C Position   | Dropdown: QB, HB, FB, WR, TE, LT, LG, C, RG, RT, LEDG, REDG, DT, SAM, MIKE, WILL, CB, FS, SS, K, P, ATH
 D Archetype  | Dropdown — exact archetype name (e.g. Pocket Passer, Speedster, Raw Strength, Power Rusher, Man Coverage…)
 E Stars      | Shown as a row of 5 star icons next to the recruit's name. Every star in
   the row is the SAME star shape — the only difference is color: some are
   WHITE (bright, lit up) and some are BLACK/dark (dimmed). COUNT ONLY THE
   WHITE STARS. Completely ignore the black/dark ones — they are NOT part of
   the count even though they're still visible as stars. Do this by direct
   visual count every time; never infer the star count from national rank,
   archetype, or anything else. Example: 3 white stars + 2 black stars = a
   3-star recruit → output ☆☆☆. Blank only if no star row is visible at all.
 F Nat. Rank  | integer — national rank
 G State Rank | integer — labeled "STA:" on the recruit's card/header in the screenshot (right next to "NAT:"). ALWAYS check for this label specifically — it's easy to miss since it's small and sits right after the national rank. Only leave blank if genuinely not shown anywhere.
 H Pos. Rank  | integer — position rank
 I Height     | Dropdown: 5'5" … 7'0" (straight quotes)      J Weight | integer lbs
 K Hometown   | text           L State | 2-letter code
 M Gem/Bust   | Gem, Bust, or blank. Check the FAR LEFT edge of the recruit's portrait
   photo, right at the edge of the picture, in the spot just BELOW the small
   grey handshake/interest icon that sits at the portrait's top-left corner:
     - A small circular badge with a RED "X" mark inside it, sitting in that
       spot = Bust
     - A small SOLID GREEN diamond/gem shape in that same spot = Gem
     - Nothing in that spot at all = blank
   This badge is easy to miss — it's small and sits right at the picture's
   edge. Always check that exact spot before defaulting to blank; don't guess
   from the recruit's overall interest level or anything else. The grey
   handshake icon ABOVE this badge is a completely different indicator
   (recruiting interest) — never read that icon as Gem or Bust, and never
   skip checking below it just because it's present.
 N Dev Trait  | Elite, Star, Impact, Normal, Hidden (Hidden = trait not yet revealed; do not guess — use Hidden when trait is unknown)

═══════════════════════════════════════════════════════════
ENUMERATED DROPDOWN VALUES (use EXACTLY — case-sensitive)
═══════════════════════════════════════════════════════════
Archetype (D) — 44 values:
  Backfield Creator, Dual Threat, Pocket Passer, Pure Runner, Backfield Threat, Contact Seeker, East/West Playmaker, Elusive Bruiser, North/South Receiver, North/South Blocker, Blocking, Utility, Contested Specialist, Elusive Route Runner, Gadget, Gritty Possession, Physical Route Runner, Route Artist, Speedster, Possession, Pure Blocker, Pure Possession, Vertical Threat, Agile, Pass Protector, Raw Strength, Ground and Pound, Well Rounded, Edge Setter, Gap Specialist, Power Rusher, Pure Power, Speed Rusher, Lurker, Signal Caller, Thumper, Boundary, Bump and Run, Field, Zone, Box Specialist, Coverage Specialist, Hybrid, Accurate, Power
Height (I) — use a straight ASCII quote " (not curly):
  5'5", 5'6", 5'7", 5'8", 5'9", 5'10", 5'11", 6'0", 6'1", 6'2", 6'3", 6'4", 6'5", 6'6", 6'7", 6'8", 6'9", 6'10", 6'11", 7'0"
State (L) — 2-letter US codes:
  AK, AL, AR, AZ, CA, CO, CT, DC, DE, FL, GA, HI, IA, ID, IL, IN, KS, KY, LA, MA, MD, ME, MI, MN, MO, MS, MT, NC, ND, NE, NH, NJ, NM, NV, NY, OH, OK, OR, PA, RI, SC, SD, TN, TX, UT, VA, VT, WA, WI, WV, WY

═══════════════════════════════════════════════════════════
ATTRIBUTES — column O, a SINGLE cell. Fill ONLY from a player-page "Attributes" tab. OPTIONAL.
═══════════════════════════════════════════════════════════
Attributes go in ONE cell (column O), NOT in separate columns. Use the SHORT CODE for each attribute (not the full name) so all values fit in one readable cell.

  EXAMPLE (an ATH whose tab shows Awareness 76, Speed 67, Acceleration 90, Strength 78, Play Recognition 74, Tackle 80, Hit Power 74, Pursuit 80, Man Coverage 76, Zone Coverage 74) →
  the O cell is:  AWR 76, SPD 67, ACC 90, STR 78, PREC 74, TAK 80, HIT 74, PUR 80, MCV 76, ZCV 74

Rules for the O cell:
  - Use the SHORT CODE for every attribute (see reference below). Short codes keep the cell compact so all values are visible in the sheet.
  - Order does not matter; the app places each value by its code. List only what the tab shows — no blanks for missing attributes.
  - Recognized codes: ${attrNameRef}
  - One O cell per scouted player. Leave it blank for un-scouted recruits.

═══════════════════════════════════════════════════════════
OUTPUT FORMAT (TSV)
═══════════════════════════════════════════════════════════
Board row (14 fields, A→N) — blank fields are EMPTY TABS, never omitted:
<Player>\\t<Class>\\t<Position>\\t<Archetype>\\t<Stars>\\t<Nat>\\t<StateRank>\\t<PosRank>\\t<Height>\\t<Weight>\\t<Hometown>\\t<State>\\t<Gem/Bust>\\t<Dev>

CONCRETE EXAMPLE (State Rank read from the "STA:" label, unknown pos rank, no gem, Hidden dev, scouted):
John Smith\\tHS\\tQB\\tPocket Passer\\t☆☆☆☆\\t15\\t4\\t\\t6'3"\\t215\\tAustin\\tTX\\t\\tHidden\\tTPW 87, SAC 82, MAC 79, DAC 74, AWR 71

Notice: State Rank (4) came from the card's "STA:" label — check for it every time, don't default to blank. The unknown Pos Rank is still an EMPTY TAB, not omitted. All 14 A→N fields are present even when blank.

Scouted row (15 fields — the 14 A→N fields, then the single Attributes cell O using SHORT CODES):
<...A→N...>\\t<AWR 76, SPD 67, TAK 80, ...>

═══════════════════════════════════════════════════════════
FINAL CHECK
═══════════════════════════════════════════════════════════
[ ] Board rows have exactly 14 tab-separated fields (13 tabs); scouted rows have 15 (the O Attributes cell added)
[ ] NEVER skip a column even if it is blank — output an empty tab placeholder so the column count is always correct. A blank Dev Trait (N) is still a field.
[ ] No header row; no commas in numbers; Stars use ☆ symbols
[ ] B/C/D/E/I/L/M/N are literal dropdown values
[ ] Player names (A) are normal title case, never ALL CAPS, even if the screenshot shows them that way
[ ] State Rank (G) checked for the card's "STA:" label every time — not defaulted to blank
[ ] Stars (E) counted by color (white = counted, black/dark = ignored), never inferred from rank/archetype
[ ] Gem/Bust (M) checked at the exact spot below the handshake icon on the portrait's left edge (red X badge = Bust, green diamond = Gem), not the handshake icon itself, not guessed
[ ] The O cell uses SHORT CODES (AWR, SPD, etc.) for compactness; blank when not scouted; pid/Updated never output`,
    includeTeamMap: false,
    dynastyTeams: currentDynasty?.teams,
    notes: 'This is the Recruiting Database only — a personal scouting reference. Recruits entered here are never added as real recruiting Targets. The single Attributes cell (P) is filled ONLY from a recruit\'s player-page "Attributes" tab, never from a board screenshot — leave it blank if the recruit has not been scouted.',
  }), [currentDynasty?.teams, attrNameRef])

  if (!isOpen) return null

  return createPortal(
    <div
      className="fixed inset-0 top-0 left-0 right-0 bottom-0 bg-black bg-opacity-70 flex items-center justify-center z-[9999] py-8 px-4 sm:p-4"
      style={{ margin: 0 }}
      onMouseDown={onClose}
    >
      {/* Wide (not the old fixed 680px) so the paste grid's 15 columns — Name
          through Attributes — fit on screen without needing to scroll
          sideways to see a cell. */}
      <div
        className="card-elevated w-full sm:w-[95vw] sm:h-[90dvh] flex flex-col overflow-hidden"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <SheetModalHeader title="Recruiting Database" onClose={onClose} />

        <div className="flex-1 flex flex-col overflow-hidden p-4 sm:p-6">
          <div className="mb-4 p-3 rounded-lg text-sm text-txt-primary" style={{ backgroundColor: 'var(--surface-3)' }}>
            <strong>Note:</strong> Recruits added here go into your Recruiting Database only — they will NOT show up as real Targets.
          </div>

          <LocalDataEntry
            aiPrompt={prompt}
            onImport={handleLocalImport}
            onCancel={onClose}
            importLabel="Import Recruits"
            columns={RECRUITING_DB_PASTE_COLUMNS}
            columnOptions={RECRUITING_DB_COLUMN_OPTIONS}
            normalizeRows={normalizeRecruitingDbRows}
            allowFileUpload
            fileUploadAccept=".tsv,.txt"
          />
        </div>
      </div>

      {pendingLocalImport && (
        <DuplicateReviewModal
          isOpen
          onClose={() => setPendingLocalImport(null)}
          duplicateClusters={pendingLocalImport.clusters}
          confirming={confirmingLocalImport}
          onConfirm={async (deletedPids) => {
            setConfirmingLocalImport(true)
            try {
              await finalizeLocalImport(pendingLocalImport.mergedRecruits, pendingLocalImport.addedCount, deletedPids)
            } finally {
              setConfirmingLocalImport(false)
            }
          }}
        />
      )}
    </div>,
    document.body,
  )
}
