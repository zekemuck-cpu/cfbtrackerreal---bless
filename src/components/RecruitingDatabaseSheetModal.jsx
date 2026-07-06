import { useState, useEffect, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useDynasty } from '../context/DynastyContext'
import { useToast } from './ui/Toast'
import SheetModalHeader from './ui/SheetModalHeader'
import SheetModalAIHero from './ui/SheetModalAIHero'
import SheetManualEntry from './ui/SheetManualEntry'
import SheetModalFooter from './ui/SheetModalFooter'
import SheetToolbar from './SheetToolbar'
import SheetLoadingHint from './SheetLoadingHint'
import LocalDataEntry from './ui/LocalDataEntry'
import { getSingleSheetEmbedUrl, RECRUIT_POSITIONS } from '../services/sheetsService'
import { buildAIPrompt } from '../utils/aiPrompt'
import { ATTRIBUTE_COLUMNS, ATTRIBUTE_ABBR } from '../utils/recruitAttributes'
import { splitTsv } from '../utils/tsvParse'
import { parseRecruitingDatabaseRows } from '../utils/recruitingDatabaseSheetFormat'
import { mergeRecruitingDatabaseRows } from '../utils/recruitingDatabaseSync'
import { findDuplicateClusters, applyDuplicateResolution } from '../utils/recruitingDatabasePool'
import DuplicateReviewModal from './DuplicateReviewModal'

const isMobileDevice = () => {
  if (typeof window === 'undefined') return false
  return window.innerWidth < 768 || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
}

// Header labels for the local-paste grid — the Recruiting Database is HS
// recruits only (real Targets feeding it are pre-filtered to !isPortal
// upstream in ScoutStaff.jsx), so a "Previous Team" field never applies here
// and is deliberately not shown or asked for. This now matches the actual
// Sheet/TSV schema exactly (recruitingDatabaseSheetFormat.js) — the column
// was physically removed from both places, so no splice/reinsert workaround
// is needed to keep the two in sync (see removePreviousTeamColumn in
// sheetsService.js for how an already-existing sheet gets migrated).
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

// Same "AI Workflow Recommended" sheet-modal chrome as Recruiting Commitments/
// Preseason Top 25 (SheetModalHeader/AIHero/ManualEntry/Footer + SheetToolbar),
// pointed at the Recruiting Database's OWN sheet instead of a Targets/
// Commitments one. Deliberately reuses the parent's existing sheet
// create-or-sync logic (`onSync`, passed in as PlayerDatabase's `syncNow`)
// rather than duplicating the Sheets-API create/reconcile calls here — this
// modal is just a richer UI shell around that already-tested flow.
export default function RecruitingDatabaseSheetModal({ isOpen, onClose, combinedPlayers = [], onSync, syncing = false, teamColors, hostDynasty }) {
  const { currentDynasty, updateDynasty } = useDynasty()
  const { toast } = useToast()
  const [isMobile, setIsMobile] = useState(false)
  const [useEmbedded, setUseEmbedded] = useState(() => localStorage.getItem('sheetEmbedPreference') === 'true')
  const [creating, setCreating] = useState(false)
  const creatingRef = useRef(false)
  // Local paste is the DEFAULT ingest path — no Google auth/sheet needed just
  // to type in a few recruits. "Use Google Sheet instead" is the opt-in
  // escape hatch (matches the Recruiting Commitments/Preseason modals).
  const [useLocal, setUseLocal] = useState(true)

  useEffect(() => {
    setIsMobile(isMobileDevice())
    const onResize = () => setIsMobile(isMobileDevice())
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // Reset to the local-paste default every time the modal is reopened, same
  // as Recruiting Commitments — otherwise a prior "Use Google Sheet instead"
  // choice would silently carry over to the next open.
  useEffect(() => {
    if (!isOpen) setUseLocal(true)
  }, [isOpen])

  const sheetId = hostDynasty?.recruitingDatabaseSheetId || null

  // Auto-create the moment the modal opens and nothing is linked yet — the
  // Recruiting Database already lazily creates its sheet on first Save
  // (see PlayerDatabase.jsx's syncNow); triggering that same call here means
  // this modal never opens to a dead end waiting on a manual Save first.
  // Skipped entirely while local paste is active — no reason to force a
  // Google Sheet (and its OAuth) into existence for someone who just wants to
  // paste a few recruits in locally.
  useEffect(() => {
    if (!isOpen || useLocal || sheetId || creating || creatingRef.current) return
    creatingRef.current = true
    setCreating(true)
    Promise.resolve(onSync?.({ silent: false })).finally(() => {
      setCreating(false)
      creatingRef.current = false
    })
  }, [isOpen, useLocal, sheetId])

  // Pending local-paste import awaiting duplicate review — { mergedRecruits,
  // addedCount, clusters } | null.
  const [pendingLocalImport, setPendingLocalImport] = useState(null)
  const [confirmingLocalImport, setConfirmingLocalImport] = useState(false)

  const finalizeLocalImport = async (mergedRecruits, addedCount, deletedPids = new Set()) => {
    const finalRecruits = applyDuplicateResolution(mergedRecruits, deletedPids)
    await updateDynasty(hostDynasty.id, { recruitingDatabasePlayers: finalRecruits })
    toast.success(`Imported ${addedCount} recruit${addedCount === 1 ? '' : 's'}.`)
    // No manual onSync() nudge here on purpose — PlayerDatabase.jsx already
    // has its own debounced auto-push effect that reactively picks up this
    // exact change once combinedPlayers recomputes. Calling onSync() (a
    // prop closure captured at THIS modal's last render, before the
    // updateDynasty above resolved) would run a full sheet reconcile against
    // stale pre-import data — including a stale combinedPlayers snapshot —
    // and could write that stale set straight back over the import we just
    // made. Letting the auto-push effect fire on its own next render avoids
    // that race entirely.
    setPendingLocalImport(null)
    onClose?.()
  }

  // Local paste import: parse the AI's (or hand-typed/uploaded) TSV reply into
  // recruit objects via the SAME parser a real Sheet read uses, then merge them
  // onto whatever's already in the shared Recruiting Database (pid-based, so
  // re-importing an already-known recruit updates it instead of duplicating it
  // — see mergeRecruitingDatabaseRows). Newly-incoming recruits are checked
  // against the existing database for possible duplicates before finalizing —
  // same conservative name+position+archetype+stars match the one-time pool
  // migration uses. The linked sheet (if any) picks up the addition on its own
  // via PlayerDatabase's auto-push effect; nudging a silent sync here just
  // makes that feel immediate instead of waiting on the debounce.
  const handleLocalImport = async (text) => {
    if (!hostDynasty) throw new Error('No Recruiting Database to import into yet.')
    const rows = splitTsv(text)
    const parsed = parseRecruitingDatabaseRows(rows).filter(r => r.name)
    if (!parsed.length) throw new Error('No recruits found in the pasted text.')
    const { mergedRecruits } = mergeRecruitingDatabaseRows({
      sheetRows: parsed,
      localRecruits: hostDynasty.recruitingDatabasePlayers || [],
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
  const startRow = (combinedPlayers?.length || 0) + 2

  const prompt = useMemo(() => buildAIPrompt({
    title: 'Recruiting Database',
    structure: `This sheet has ONE tab: "Recruiting Database". Row 1 is a PROTECTED header. Output ONLY the NEW rows visible in THIS request's screenshots, pasted BELOW the rows already entered; never re-output existing rows.

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
COLUMNS A–N  — paste at cell A${startRow} of the "Recruiting Database" tab (first empty row below the ${combinedPlayers.length} already entered)
═══════════════════════════════════════════════════════════
 A Player     | Full name, normal title case (e.g. "Tyron Funk", NOT "TYRON FUNK") — re-case it yourself even if the screenshot shows it in all caps
 B Class      | Dropdown: HS, JUCO Fr, JUCO So, JUCO Jr, Fr, RS Fr, So, RS So, Jr, RS Jr
 C Position   | Dropdown: QB, HB, FB, WR, TE, LT, LG, C, RG, RT, LEDG, REDG, DT, SAM, MIKE, WILL, CB, FS, SS, K, P, ATH
 D Archetype  | Dropdown — exact archetype name (e.g. Pocket Passer, Speedster, Raw Strength, Power Rusher, Man Coverage…)
 E Stars      | The recruit's star rating is always shown as a row of 5 star icons next to their name — some filled/solid (white), some empty/outline. COUNT ONLY THE FILLED/SOLID stars; ignore the empty outline ones. That count (0–5) is the star rating — output that many ☆ symbols (e.g. 3 filled stars → ☆☆☆). Blank if the star row isn't visible at all.
 F Nat. Rank  | integer — national rank
 G State Rank | integer — labeled "STA:" on the recruit's card/header in the screenshot (right next to "NAT:"). ALWAYS check for this label specifically — it's easy to miss since it's small and sits right after the national rank. Only leave blank if genuinely not shown anywhere.
 H Pos. Rank  | integer — position rank
 I Height     | Dropdown: 5'5" … 7'0" (straight quotes)      J Weight | integer lbs
 K Hometown   | text           L State | 2-letter code
 M Gem/Bust   | Gem, Bust, or blank. Look at the LEFT edge of the recruit's portrait/card for a
   small badge, stacked below the recruiting-interest handshake icon:
     - A solid GREEN GEM badge = Gem
     - A RED X badge (a plain red X, NOT necessarily on a gem) = Bust
     - Neither present = blank
   This badge is SEPARATE from the recruiting-interest heart/handshake icon.
   Do not confuse a red X badge with a "not interested" indicator — on this
   screen the red X in the badge slot means Bust. When in doubt between the
   two, the Gem/Bust badge sits in the same vertical stack as the green gem
   would, on the far left of the card.
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
OUTPUT FORMAT (TSV, paste at A${startRow})
═══════════════════════════════════════════════════════════
=== RECRUITING DATABASE — paste at cell A${startRow} of "Recruiting Database" tab ===
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
[ ] Gem/Bust (M) is read from the badge on the LEFT edge of the card (green gem = Gem, red X = Bust), not the interest handshake icon, not guessed
[ ] The O cell uses SHORT CODES (AWR, SPD, etc.) for compactness; blank when not scouted; pid/Updated never output`,
    includeTeamMap: false,
    dynastyTeams: currentDynasty?.teams,
    notes: 'This sheet is the Recruiting Database only — a personal scouting reference. Recruits entered here are never added as real recruiting Targets. The single Attributes cell (P) is filled ONLY from a recruit\'s player-page "Attributes" tab, never from a board screenshot — leave it blank if the recruit has not been scouted.',
  }), [combinedPlayers.length, currentDynasty?.teams, startRow, attrNameRef])

  if (!isOpen) return null

  const embedUrl = sheetId ? getSingleSheetEmbedUrl(sheetId) : null
  const isLoading = creating || !sheetId

  return createPortal(
    <div
      className="fixed inset-0 top-0 left-0 right-0 bottom-0 bg-black bg-opacity-70 flex items-center justify-center z-[9999] py-8 px-4 sm:p-4"
      style={{ margin: 0 }}
      onMouseDown={onClose}
    >
      <div
        className={`card-elevated w-full max-h-[calc(100dvh-4rem)] flex flex-col overflow-hidden ${
          useEmbedded && !isMobile ? 'sm:w-[95vw] sm:h-[95dvh]' : 'sm:max-w-[680px] sm:h-auto'
        }`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <SheetModalHeader title="Recruiting Database" onClose={onClose} />

        <div className="flex-1 flex flex-col overflow-hidden p-4 sm:p-6">
          <div className="mb-4 p-3 rounded-lg text-sm text-txt-primary" style={{ backgroundColor: 'var(--surface-3)' }}>
            <strong>Note:</strong> Recruits added here go into your Recruiting Database only — they will NOT show up as real Targets.
            {combinedPlayers.length > 0 && (
              <span className="block mt-1">
                Your existing database ({combinedPlayers.length}) is pre-filled in the sheet.
              </span>
            )}
          </div>

          {useLocal ? (
            <LocalDataEntry
              aiPrompt={prompt}
              onImport={handleLocalImport}
              onUseGoogle={() => setUseLocal(false)}
              onCancel={onClose}
              importLabel="Import Recruits"
              columns={RECRUITING_DB_PASTE_COLUMNS}
              columnOptions={RECRUITING_DB_COLUMN_OPTIONS}
              normalizeRows={normalizeRecruitingDbRows}
              allowFileUpload
              fileUploadAccept=".tsv,.txt"
            />
          ) : isLoading ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <div
                  className="animate-spin w-12 h-12 border-4 rounded-full mx-auto mb-4"
                  style={{ borderColor: 'var(--text-primary)', borderTopColor: 'transparent' }}
                />
                <p className="text-lg font-semibold text-txt-primary">Creating Recruiting Database Sheet…</p>
                <SheetLoadingHint active={isLoading} />
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col overflow-hidden gap-3">
              <SheetModalAIHero
                tagline="Skip the typing. Let AI read your recruit screenshots (board or a recruit's Attributes tab) and fill the sheet."
                buttons={[{ label: 'Fill with AI', prompt }]}
              />
              {isMobile || !useEmbedded ? (
                <SheetManualEntry sheetId={sheetId} />
              ) : (
                <div className="flex-1 flex flex-col overflow-hidden min-h-0 border border-surface-4 rounded-lg">
                  <SheetToolbar sheetId={sheetId} embedUrl={embedUrl} teamColors={teamColors} title="Recruiting Database" />
                </div>
              )}
              <SheetModalFooter
                syncing={syncing}
                onSaveAndKeep={() => onSync?.({ silent: false })}
                // This sheet is persistent and continuously auto-synced (unlike
                // Preseason/Commitments' one-shot task sheets) — "Save & close"
                // here means sync + close the modal, never delete the sheet.
                onSaveAndDelete={async () => { await onSync?.({ silent: false }); onClose(); }}
                showEmbeddedToggle={!isMobile}
                useEmbedded={useEmbedded}
                onToggleEmbedded={() => {
                  const next = !useEmbedded
                  setUseEmbedded(next)
                  localStorage.setItem('sheetEmbedPreference', next.toString())
                }}
              />
            </div>
          )}
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
