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
  createDetailedStatsSheet,
  readDetailedStatsFromSheet,
  parseDetailedStatsLocal,
  deleteGoogleSheet,
  getSheetEmbedUrl
} from '../services/sheetsService'
import { buildAIPrompt } from '../utils/aiPrompt'
import SheetLoadingHint from './SheetLoadingHint'
import LocalDataEntry from './ui/LocalDataEntry'
import { splitTsv } from '../utils/tsvParse'

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

// Pre-fill support for the local grid. These mirror the (non-exported)
// tables in sheetsService.js used by createDetailedStatsSheet's pre-fill:
//  - DETAILED_STATS_TAB_COLUMNS: each category's display columns IN ORDER
//    (the exact positional order parseDetailedStatsLocal reads after
//    Category + PlayerName).
//  - LOCAL_TAB_TO_BOXSCORE_CATEGORY / LOCAL_COLUMN_TO_BOXSCORE_FIELD: map a
//    display column to the box-score field key used inside `aggregatedStats`
//    (the same aggregatedStats shape convertToBoxScoreFormat produces above).
// Together they let us round-trip existing player.statsByYear detailed stats
// back into the SAME Category<TAB>Player<TAB>values rows the AI emits, in the
// SAME per-category column order the parser consumes.
const DETAILED_STATS_TAB_COLUMNS = {
  'Passing': ['Completions', 'Attempts', 'Yards', 'Touchdowns', 'Interceptions', 'Net Yards/Attempt', 'Adjusted Net Yards/Attempt', 'Passing Long', 'Sacks Taken'],
  'Rushing': ['Carries', 'Yards', 'Touchdowns', '20+ Yard Runs', 'Broken Tackles', 'Yards After Contact', 'Rushing Long', 'Fumbles'],
  'Receiving': ['Receptions', 'Yards', 'Touchdowns', 'Receiving Long', 'Yards After Catch', 'Drops'],
  'Blocking': ['Pancakes', 'Sacks Allowed'],
  'Defensive': ['Solo Tackles', 'Assisted Tackles', 'Tackles for Loss', 'Sacks', 'Interceptions', 'INT Return Yards', 'INT Long', 'Defensive TDs', 'Deflections', 'Catches Allowed', 'Forced Fumbles', 'Fumble Recoveries', 'Fumble Return Yards', 'Blocks', 'Safeties'],
  'Kicking': ['FG Made', 'FG Attempted', 'FG Long', 'XP Made', 'XP Attempted', 'FG Made (0-29)', 'FG Att (0-29)', 'FG Made (30-39)', 'FG Att (30-39)', 'FG Made (40-49)', 'FG Att (40-49)', 'FG Made (50+)', 'FG Att (50+)', 'Kickoffs', 'Touchbacks', 'FG Blocked', 'XP Blocked'],
  'Punting': ['Punts', 'Punting Yards', 'Net Punting Yards', 'Punts Inside 20', 'Touchbacks', 'Punt Long', 'Punts Blocked'],
  'Kick Return': ['Kickoff Returns', 'KR Yardage', 'KR Touchdowns', 'KR Long'],
  'Punt Return': ['Punt Returns', 'PR Yardage', 'PR Long', 'PR Touchdowns'],
}

const LOCAL_TAB_TO_BOXSCORE_CATEGORY = {
  'Passing': 'passing', 'Rushing': 'rushing', 'Receiving': 'receiving',
  'Blocking': 'blocking', 'Defensive': 'defense', 'Kicking': 'kicking',
  'Punting': 'punting', 'Kick Return': 'kickReturn', 'Punt Return': 'puntReturn',
}

const LOCAL_COLUMN_TO_BOXSCORE_FIELD = {
  passing: { 'Completions': 'comp', 'Attempts': 'attempts', 'Yards': 'yards', 'Touchdowns': 'tD', 'Interceptions': 'iNT', 'Passing Long': 'long', 'Sacks Taken': 'sacks', 'Net Yards/Attempt': 'netYardsPerAttempt', 'Adjusted Net Yards/Attempt': 'adjNetYardsPerAttempt' },
  rushing: { 'Carries': 'carries', 'Yards': 'yards', 'Touchdowns': 'tD', 'Rushing Long': 'long', 'Fumbles': 'fumbles', '20+ Yard Runs': '20+', 'Broken Tackles': 'brokenTackles', 'Yards After Contact': 'yAC' },
  receiving: { 'Receptions': 'receptions', 'Yards': 'yards', 'Touchdowns': 'tD', 'Receiving Long': 'long', 'Yards After Catch': 'rAC', 'Drops': 'drops' },
  blocking: { 'Sacks Allowed': 'sacksAllowed', 'Pancakes': 'pancakes' },
  defense: { 'Solo Tackles': 'solo', 'Assisted Tackles': 'assists', 'Tackles for Loss': 'tFL', 'Sacks': 'sack', 'Interceptions': 'iNT', 'INT Return Yards': 'iNTYards', 'INT Long': 'iNTLong', 'Defensive TDs': 'tD', 'Deflections': 'deflections', 'Catches Allowed': 'catchesAllowed', 'Forced Fumbles': 'fF', 'Fumble Recoveries': 'fR', 'Fumble Return Yards': 'fumbleYards', 'Blocks': 'blocks', 'Safeties': 'safeties' },
  kicking: { 'FG Made': 'fGM', 'FG Attempted': 'fGA', 'FG Long': 'fGLong', 'XP Made': 'xPM', 'XP Attempted': 'xPA', 'Kickoffs': 'kickoffs', 'Touchbacks': 'touchbacks', 'FG Blocked': 'fGBlock', 'XP Blocked': 'xPB', 'FG Made (0-29)': 'fGM29', 'FG Att (0-29)': 'fGA29', 'FG Made (30-39)': 'fGM39', 'FG Att (30-39)': 'fGA39', 'FG Made (40-49)': 'fGM49', 'FG Att (40-49)': 'fGA49', 'FG Made (50+)': 'fGM50+', 'FG Att (50+)': 'fGA50+' },
  punting: { 'Punts': 'punts', 'Punting Yards': 'yards', 'Net Punting Yards': 'netYards', 'Punts Inside 20': 'in20', 'Touchbacks': 'tB', 'Punt Long': 'long', 'Punts Blocked': 'block' },
  kickReturn: { 'Kickoff Returns': 'kR', 'KR Yardage': 'yards', 'KR Touchdowns': 'tD', 'KR Long': 'long' },
  puntReturn: { 'Punt Returns': 'pR', 'PR Yardage': 'yards', 'PR Touchdowns': 'tD', 'PR Long': 'long' },
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
  // Local paste is the DEFAULT; the Google Sheet flow is the opt-in fallback.
  const [useLocal, setUseLocal] = useState(true)

  const [authErrorOccurred, setAuthErrorOccurred] = useState(false) // Prevents retry loops on auth errors
  const [createAttempts, setCreateAttempts] = useState(0) // Tracks creation attempts
  // Single attempt per open. A FAILED creation must NOT auto-retry — the old
  // value of 2 let a non-auth failure re-fire (creatingSheet is in the effect
  // deps) and spawn a second orphan Google Sheet. An explicit retry (the
  // AuthErrorModal Refresh, which resets createAttempts) re-arms one more.
  const MAX_CREATE_ATTEMPTS = 1
  const [useEmbedded, setUseEmbedded] = useState(() => {
    // Load preference from localStorage
    return localStorage.getItem('sheetEmbedPreference') === 'true'
  })
  const [highlightSave, setHighlightSave] = useState(false)
  const [regenerating, setRegenerating] = useState(false)

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

  // Pre-fill the local grid with the roster's EXISTING detailed season stats so
  // the modal opens ready to edit. The local format is self-describing per row —
  // Category<TAB>PlayerName<TAB><stat values in that category's fixed column
  // order> — exactly what parseDetailedStatsLocal reads (row[0]=category,
  // row[1]=name, row[i+2]=stat i). Because each row self-identifies (no fixed
  // positional layout), omitting a player/category with no data is safe and
  // blank-line dropping in splitTsv can't misalign anything. We rebuild the same
  // box-score-format aggregatedStats the Google create path builds (via
  // convertToBoxScoreFormat), then walk each category's display columns in order
  // and map them back to box-score field keys with LOCAL_COLUMN_TO_BOXSCORE_FIELD
  // — the inverse of createDetailedStatsSheet's pre-fill, so it round-trips.
  const initialDetailedStatsText = useMemo(() => {
    const teamTid = overrideTeamAbbr
      ? getTidFromAbbr(overrideTeamAbbr, currentDynasty)
      : getCurrentTeamTid(currentDynasty)
    const teamAbbrForRoster = overrideTeamAbbr ||
      currentDynasty?.teams?.[currentDynasty?.currentTid]?.abbr ||
      currentDynasty?.teamName
    const yearKey = String(currentYear)
    const numKey = Number(currentYear)
    const categories = ['passing', 'rushing', 'receiving', 'blocking', 'defense', 'kicking', 'punting', 'kickReturn', 'puntReturn']
    const all = currentDynasty?.players || []
    const roster = all.filter(p => isPlayerOnRoster(p, teamTid ?? teamAbbrForRoster, currentYear, currentDynasty))

    // Rebuild aggregatedStats[name][boxScoreCategory] = { boxScoreKey: value }
    const aggregatedStats = {}
    roster.forEach(player => {
      if (!player.name) return
      const s = player.statsByYear?.[yearKey] ?? player.statsByYear?.[numKey] ?? player.statsByYear?.[currentYear]
      if (!s) return
      const playerStats = {}
      categories.forEach(cat => {
        const categoryStats = s[cat]
        if (categoryStats && typeof categoryStats === 'object' && Object.keys(categoryStats).length > 0) {
          const hasNonZero = Object.values(categoryStats).some(v => v && v !== 0)
          if (hasNonZero) playerStats[cat] = convertToBoxScoreFormat(categoryStats, cat)
        }
      })
      if (Object.keys(playerStats).length > 0) aggregatedStats[player.name] = playerStats
    })

    // Emit one self-describing row per player per category that has data, in the
    // fixed roster order and canonical tab order. Skip a category row entirely
    // if none of its columns resolve to a non-empty value (matches "omit unknowns").
    const lines = []
    const cellVal = (v) => (v === undefined || v === null ? '' : v)
    roster.forEach(player => {
      const agg = aggregatedStats[player.name]
      if (!agg) return
      Object.keys(DETAILED_STATS_TAB_COLUMNS).forEach(tabName => {
        const boxCat = LOCAL_TAB_TO_BOXSCORE_CATEGORY[tabName]
        const catStats = agg[boxCat]
        if (!catStats) return
        const cols = DETAILED_STATS_TAB_COLUMNS[tabName]
        const fieldMap = LOCAL_COLUMN_TO_BOXSCORE_FIELD[boxCat] || {}
        const values = cols.map(col => {
          const field = fieldMap[col]
          return field ? cellVal(catStats[field]) : ''
        })
        // Only include the row if at least one stat value is present.
        if (values.some(v => v !== '')) {
          lines.push([tabName, player.name, ...values].join('\t'))
        }
      })
    })
    return lines.join('\n')
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
4. Return NINE separate blocks, one per tab — each preceded by its "=== <SECTION> ===" label line above its fence.
5. NO COMMAS in numbers. "1234" never "1,234". No quotes, no units, no "+/-", no percent signs.
6. INTEGERS have no decimal point, with these EXCEPTIONS:
   • Passing columns H (Net Yards/Attempt) and I (Adj Net Yards/Attempt) use 1 decimal place.
   • Defensive Tackles for Loss (column E) and Sacks (column F) accept ".5" half-credits when the screenshot shows a half-credit (e.g. "1.5", "0.5"). Write the half exactly as shown — never round to an integer; never invent a half the screenshot doesn't show.
   Every other column on every tab is an integer.
7. BLANK cell for unknown values — never guess, never use 0, "-", or "N/A". To emit a blank cell between two tab characters, just have nothing between the tabs. To emit a blank line for a player with no visible stats, output the correct number of empty tab-separated cells (that is, N-1 tab characters with nothing between them).
8. Only the positions listed per tab appear on that tab. Do NOT include quarterbacks on Receiving, for example.
9. No commentary, no totals, no header row INSIDE the data. Nine TSV blocks, each preceded by its "=== <SECTION> ===" label line above its fence.

═══════════════════════════════════════════════════════════
TAB 1: "Passing" — positions filtered to QB only
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
═══════════════════════════════════════════════════════════
2 stat columns (C–D), in this EXACT order:
  C  Pancakes                       integer
  D  Sacks Allowed                  integer
Each line: 2 tab-separated values (1 tab character).

═══════════════════════════════════════════════════════════
TAB 5: "Defensive" — positions: LEDG, REDG, DT, SAM, MIKE, WILL, CB, FS, SS
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
═══════════════════════════════════════════════════════════
4 stat columns (C–F), in this EXACT order:
  C  Kickoff Returns                integer
  D  KR Yardage                     integer
  E  KR Touchdowns                  integer
  F  KR Long                        integer
Each line: 4 tab-separated values (3 tab characters).

═══════════════════════════════════════════════════════════
TAB 9: "Punt Return" — positions: HB, FB, WR, CB, FS, SS
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
=== PASSING ===
<9 tab-separated values>
<9 tab-separated values>
...

=== RUSHING ===
<8 tab-separated values>
...

=== RECEIVING ===
<6 tab-separated values>
...

=== BLOCKING ===
<2 tab-separated values>
...

=== DEFENSIVE ===
<15 tab-separated values>
...

=== KICKING ===
<17 tab-separated values>
...

=== PUNTING ===
<7 tab-separated values>
...

=== KICK RETURN ===
<4 tab-separated values>
...

=== PUNT RETURN ===
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
[ ] No player name, no Snaps column, no header row, no commentary INSIDE the data blocks.
[ ] Row order within each block matches column A on that tab exactly
[ ] Blank cells/lines for unknowns — invented nothing`,
    includeTeamMap: false,
  }), [currentYear, userRoster])

  // LOCAL-PASTE prompt: self-describing rows. Each line LEADS with the category
  // (tab name) and the player's full name, so there is NO nine-tab layout and NO
  // pre-filled Name/Snaps columns to line up against. parseDetailedStatsLocal
  // groups by the per-row category (col 0) and maps the remaining cells
  // positionally into that category's fixed column order — the SAME positional
  // read the Google path does. Line order does not matter; a player/stat that
  // is not seen is simply omitted.
  const localAiPrompt = useMemo(() => buildAIPrompt({
    title: `${currentYear} Detailed Stats Entry`,
    roster: userRoster,
    structure: `Output ONE line per player per stat category you can see. Each line is SELF-DESCRIBING — it LEADS with the category name, then the player's full name, then that category's stat values in the exact order listed below.

═══════════════════════════════════════════════════════════
CRITICAL RULES — read before anything else
═══════════════════════════════════════════════════════════
1. Line shape: Category<TAB>PlayerName<TAB><stat values in the exact order for that category>.
2. The FIRST field is the exact category name (see list). The SECOND field is the player's full name. Then come that category's stat columns — no Name column, no Snaps column, no header.
3. Tab-separated. Each category has a FIXED number of stat values (listed below); every line for that category must have EXACTLY: 2 leading fields + that many stat values.
4. NO COMMAS in numbers. "1234" never "1,234". No quotes, units, "+/-", or percent signs.
5. INTEGERS have no decimal point, with these EXCEPTIONS:
   • Passing "Net Yards/Attempt" and "Adjusted Net Yards/Attempt" use 1 decimal place.
   • Defensive "Tackles for Loss" and "Sacks" accept ".5" half-credits when the screenshot shows them (e.g. "1.5"). Never round; never invent a half.
   Every other value is an integer.
6. BLANK cell for an unknown value — just have nothing between the two tabs. Never guess, never use 0/"-"/"N/A".
7. OMIT a player entirely from a category if they have no stats there. OMIT a category entirely if you cannot see it. Do NOT pad, do NOT invent players.
8. A player can appear in MULTIPLE categories — one line each (e.g. a QB on both Passing and Rushing). Use the player's FULL name identically on every line (match the roster list at the bottom).

═══════════════════════════════════════════════════════════
CATEGORY COLUMN ORDERS (the stat values after Category + PlayerName)
═══════════════════════════════════════════════════════════
Passing (9 values): Completions, Attempts, Yards, Touchdowns, Interceptions, Net Yards/Attempt (1 decimal), Adjusted Net Yards/Attempt (1 decimal), Passing Long, Sacks Taken
Rushing (8 values): Carries, Yards, Touchdowns, 20+ Yard Runs, Broken Tackles, Yards After Contact, Rushing Long, Fumbles
Receiving (6 values): Receptions, Yards, Touchdowns, Receiving Long, Yards After Catch, Drops
Blocking (2 values): Pancakes, Sacks Allowed
Defensive (15 values): Solo Tackles, Assisted Tackles, Tackles for Loss (may be .5), Sacks (may be .5), Interceptions, INT Return Yards, INT Long, Defensive TDs, Deflections, Catches Allowed, Forced Fumbles, Fumble Recoveries, Fumble Return Yards, Blocks, Safeties
Kicking (17 values): FG Made, FG Attempted, FG Long, XP Made, XP Attempted, FG Made (0-29), FG Att (0-29), FG Made (30-39), FG Att (30-39), FG Made (40-49), FG Att (40-49), FG Made (50+), FG Att (50+), Kickoffs, Touchbacks, FG Blocked, XP Blocked
Punting (7 values): Punts, Punting Yards, Net Punting Yards, Punts Inside 20, Touchbacks, Punt Long, Punts Blocked
Kick Return (4 values): Kickoff Returns, KR Yardage, KR Touchdowns, KR Long
Punt Return (4 values): Punt Returns, PR Yardage, PR Long, PR Touchdowns

⚠️ CRITICAL — RETURN CATEGORY COLUMN ORDERS ARE INVERTED FOR TD/LONG:
  Kick Return: … KR Touchdowns THEN KR Long
  Punt Return: … PR Long THEN PR Touchdowns
  Copy each in the literal order shown. Mixing them silently corrupts stats.

Category name spellings (first field, use EXACTLY one of):
  Passing | Rushing | Receiving | Blocking | Defensive | Kicking | Punting | Kick Return | Punt Return

═══════════════════════════════════════════════════════════
REQUIRED OUTPUT FORMAT
═══════════════════════════════════════════════════════════
=== DETAILED STATS ===
Passing\\t<Player>\\t<Completions>\\t<Attempts>\\t<Yards>\\t<Touchdowns>\\t<Interceptions>\\t<NetYds/Att>\\t<AdjNetYds/Att>\\t<Long>\\t<Sacks Taken>
Rushing\\t<Player>\\t<Carries>\\t<Yards>\\t<Touchdowns>\\t<20+ Runs>\\t<Broken Tackles>\\t<YAC>\\t<Long>\\t<Fumbles>
…one line per player per category you can see; omit unknowns entirely

═══════════════════════════════════════════════════════════
FINAL CHECK before you send
═══════════════════════════════════════════════════════════
[ ] Every line = Category, then PlayerName, then that category's stat values in the exact order above
[ ] Stat-value count per line matches the category (Passing 9, Rushing 8, Receiving 6, Blocking 2, Defensive 15, Kicking 17, Punting 7, Kick Return 4, Punt Return 4)
[ ] Return categories: Kick Return is …TD,Long; Punt Return is …Long,TD — not mixed up
[ ] Passing Net/Adj-Net Yards per Attempt are 1-decimal; Defensive TFL/Sacks may be .5; everything else integer
[ ] No commas in any number; blank cells for unknowns; nothing invented
[ ] Player full names match the roster list; a player used in several categories has one line per category`,
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

  // Create detailed stats sheet when modal opens - ALWAYS create fresh to reflect current player data
  useEffect(() => {
    const createSheet = async () => {
      // Don't retry if auth error occurred or max attempts reached
      if (authErrorOccurred || createAttempts >= MAX_CREATE_ATTEMPTS) return

      // Don't create a Google Sheet while the local paste path is active.
      if (isOpen && !useLocal && user && !sheetId && !creatingSheet && !creatingSheetRef.current && !showDeletedNote) {
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

          // Auth errors open the re-auth modal. Anything else gets surfaced as
          // a toast so the user isn't left staring at a blank modal — and the
          // effect does NOT loop back to create another sheet.
          if (auth.handleError(error)) {
            setAuthErrorOccurred(true)
          } else {
            toast.error(auth.describeError(error, 'create the detailed stats sheet'))
          }
        } finally {
          setCreatingSheet(false)
          creatingSheetRef.current = false
        }
      }
    }
    createSheet()
  }, [isOpen, useLocal, user, sheetId, creatingSheet, showDeletedNote, currentDynasty?.id, currentDynasty?.players, currentYear, auth.retryCount, overrideTeamAbbr, overrideTeamName, authErrorOccurred, createAttempts])

  // Reset state when modal closes - clear sheetId so a fresh sheet is created next time
  useEffect(() => {
    if (!isOpen) {
      setSheetId(null)
      setShowDeletedNote(false)
      creatingSheetRef.current = false
      setAuthErrorOccurred(false)
      setCreateAttempts(0)
      setUseLocal(true)
      auth.setShowAuthError(false)
    }
  }, [isOpen])

  // Local paste import: the AI emits Category<TAB>PlayerName<TAB><stat values in
  // category order> rows. parseDetailedStatsLocal groups by the per-row category
  // and maps the trailing cells positionally into that category's fixed column
  // order, returning the SAME { tabName: [ { name, <col>: value } ] } shape the
  // Google reader returns. onSave keys by category + player NAME + column name,
  // so the existing save path applies unchanged.
  const handleLocalImport = async (text) => {
    const detailedStats = parseDetailedStatsLocal(splitTsv(text))
    await onSave(detailedStats)
    onClose()
  }

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
        {/* One compact tip — end-of-season catch-up only; per-game box scores already fill these. */}
        <div className="mb-3 px-3 py-2 rounded-md bg-surface-2 text-xs text-txt-tertiary leading-snug" role="note">
          <span className="font-semibold text-txt-secondary">Tip:</span> Only needed for end-of-season catch-up — if every game already has a box score, your detailed stats are in the app. Do GP/Snaps first, then in CFB 26 sort by Snaps Played and go category by category.
        </div>

        {useLocal && !showDeletedNote ? (
          <div className="flex-1 flex flex-col overflow-hidden gap-3">
            <LocalDataEntry
              aiPrompt={localAiPrompt}
              onImport={handleLocalImport}
              onUseGoogle={() => setUseLocal(false)}
              onCancel={handleClose}
              importLabel="Import Detailed Stats"
              initialText={initialDetailedStatsText}
            />
          </div>
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
            <div
              className="rounded-lg border border-surface-4 bg-surface-2 px-4 py-3 text-xs sm:text-sm text-txt-secondary"
              role="note"
            >
              <span className="text-txt-primary font-semibold">Skip this if you've been entering box scores game-by-game.</span>
              {' '}This sheet is only for end-of-season catch-up. If every game already has a box score, your detailed stats are already in the app.
            </div>
            <SheetModalAIHero
              tagline="Skip the typing. Let AI fill the season stat totals."
              buttons={[{ label: 'Copy AI Prompt', prompt: aiPrompt }]}
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
    </div>,
    document.body
  )
}
