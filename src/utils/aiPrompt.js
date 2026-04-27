export const TEAM_ABBR_MAPPING = `AFA = Air Force
AKR = Akron
BAMA = Alabama
APP = Appalachian State
ARIZ = Arizona
ASU = Arizona State
ARK = Arkansas
ARST = Arkansas State
ARMY = Army
AUB = Auburn
BALL = Ball State
BU = Baylor
BOIS = Boise State
BC = Boston College
BGSU = Bowling Green
BUFF = Buffalo
BYU = BYU
CAL = California
CMU = Central Michigan
CHAR = Charlotte
UC = Cincinnati
CLEM = Clemson
CCU = Coastal Carolina
COLO = Colorado
CSU = Colorado State
DEL = Delaware
DUKE = Duke
ECU = East Carolina
EMU = Eastern Michigan
FAU = Florida Atlantic
FIU = Florida International
FLA = Florida
FSU = Florida State
FRES = Fresno State
UGA = Georgia
GASO = Georgia Southern
GSU = Georgia State
GT = Georgia Tech
HAW = Hawaii
UH = Houston
ILL = Illinois
IU = Indiana
IOWA = Iowa
ISU = Iowa State
JKST = Jacksonville State
JMU = James Madison
KU = Kansas
KSU = Kansas State
KENN = Kennesaw State
KENT = Kent State
UK = Kentucky
LIB = Liberty
UL = Louisiana
ULM = Louisiana-Monroe
LT = Louisiana Tech
LOU = Louisville
LSU = LSU
MRSH = Marshall
UMD = Maryland
MASS = UMass
MEM = Memphis
MIA = Miami (FL)
M-OH = Miami (OH)
MICH = Michigan
MSU = Michigan State
MINN = Minnesota
MSST = Mississippi State
MIZ = Missouri
MZST = Missouri State
MTSU = Middle Tennessee
NAVY = Navy
NEB = Nebraska
NEV = Nevada
UNM = New Mexico
NMSU = New Mexico State
UNC = North Carolina
NCST = NC State
UNT = North Texas
NIU = Northern Illinois
NU = Northwestern
ND = Notre Dame
MISS = Ole Miss
ORE = Oregon
ORST = Oregon State
OSU = Ohio State
OU = Oklahoma
OKST = Oklahoma State
ODU = Old Dominion
OHIO = Ohio
PSU = Penn State
PITT = Pittsburgh
PUR = Purdue
RICE = Rice
RUTG = Rutgers
SHSU = Sam Houston
SDSU = San Diego State
SJSU = San Jose State
SMU = SMU
USA = South Alabama
SCAR = South Carolina
USF = South Florida
USM = Southern Miss
STAN = Stanford
SYR = Syracuse
TCU = TCU
TEM = Temple
UT = Tennessee
TEX = Texas
TAMU = Texas A&M
TXST = Texas State
TTU = Texas Tech
TOL = Toledo
TROY = Troy
TLSA = Tulsa
TULN = Tulane
UAB = UAB
UCF = UCF
UCLA = UCLA
CONN = UConn
UNLV = UNLV
USC = USC
UTEP = UTEP
UTSA = UTSA
UTAH = Utah
USU = Utah State
VAN = Vanderbilt
UVA = Virginia
VT = Virginia Tech
WAKE = Wake Forest
WASH = Washington
WSU = Washington State
WVU = West Virginia
WKU = Western Kentucky
WMU = Western Michigan
WIS = Wisconsin
WYO = Wyoming`

/**
 * Normalize a single player descriptor into a one-line roster entry.
 * Accepts either a plain string or a `{name, jerseyNumber, position, class}`
 * object. Swallows bad input so one malformed record can't break the prompt.
 */
function formatRosterEntry(p) {
  if (typeof p === 'string') return p.trim()
  if (!p || typeof p !== 'object') return ''
  const name = (p.name || '').trim()
  if (!name) return ''
  const jersey = p.jerseyNumber ?? p.jersey
  const jerseyStr = jersey !== undefined && jersey !== null && jersey !== '' ? `#${jersey}` : ''
  const pos = p.position ? ` (${p.position}${p.class ? `, ${p.class}` : ''})` : ''
  return `${jerseyStr ? jerseyStr + ' ' : ''}${name}${pos}`.trim()
}

/**
 * Build a roster block to append to a prompt. Sorts by last-name initial so
 * the AI can scan alphabetically — that's how EA CFB displays abbreviated
 * names like "A. Guess", so alphabetical grouping makes the lookup fast.
 */
function buildRosterBlock(roster, heading) {
  if (!Array.isArray(roster) || roster.length === 0) return null
  const lines = roster
    .map(formatRosterEntry)
    .filter(Boolean)
  if (lines.length === 0) return null
  // Sort by last name so abbreviated "A. Guess" maps alphabetically. Falls
  // back to the whole string if no space (e.g. a raw string without parse).
  lines.sort((a, b) => {
    const lastA = (a.split(/\s+/).slice(-1)[0] || a).toLowerCase()
    const lastB = (b.split(/\s+/).slice(-1)[0] || b).toLowerCase()
    return lastA.localeCompare(lastB)
  })
  return [heading, ...lines].join('\n')
}

/**
 * Build an AI prompt describing the structure of a Google Sheet so a user
 * can feed screenshots to an AI chat tool and paste the output back into
 * the sheet cell-for-cell.
 *
 * @param {object} config
 * @param {string} config.title      — Human-friendly sheet name (e.g. "Team Statistics")
 * @param {string} config.structure  — Multi-line string describing tabs, headers, row count, formats
 * @param {boolean} [config.includeTeamMap=false] — Append the team-abbreviation mapping
 * @param {string}  [config.notes]   — Optional extra guidance (e.g. "opponent abbreviations…")
 * @param {Array<object|string>} [config.roster] — Optional user-team roster
 *   so the AI can resolve "A. Guess" → "Alex Guess". Accepts objects
 *   ({ name, jerseyNumber, position, class }) or plain strings.
 * @param {string}  [config.rosterLabel] — Optional label for the roster
 *   block (default "YOUR TEAM ROSTER"). Use e.g. "OPPONENT ROSTER" for
 *   the away team in a box-score prompt.
 * @param {Array<object|string>} [config.opponentRoster] — Optional
 *   opponent roster appended after the user roster (used in box-score).
 * @param {string}  [config.opponentRosterLabel]
 * @param {boolean} [config.multiBlock=false] — Sheet has MULTIPLE tabs and the
 *   structure asks the AI to emit one labeled block per tab. Switches METHOD
 *   A/B language to allow per-tab files / per-tab fences with paste-target
 *   labels living OUTSIDE the fence (resolves the "single fence ONLY" vs.
 *   "9 labeled blocks" contradiction that was confusing the AI).
 */
export function buildAIPrompt({
  title,
  structure,
  includeTeamMap = false,
  notes,
  roster,
  rosterLabel = 'YOUR TEAM ROSTER (match abbreviated names like "A. Guess" to full names)',
  opponentRoster,
  opponentRosterLabel = 'OPPONENT ROSTER',
  multiBlock = false,
}) {
  const safeTitle = title.replace(/[^a-zA-Z0-9]+/g, '_')
  const sections = [
    `Using the data from these screenshots, please generate a spreadsheet for "${title}".`,
    ``,
    `═══════════════════════════════════════════════════════════`,
    `OUTPUT DELIVERY FORMAT — READ THIS FIRST, OBEY EXACTLY`,
    `═══════════════════════════════════════════════════════════`,
    `I am going to paste your output directly into Google Sheets. Any stray character — a heading, a "Here you go:", a trailing "Note:", a bullet, a blank explanatory line — WILL land in a cell and break the sheet. Treat this like generating a data file, not a chat reply.`,
    ``,
    multiBlock
      ? `This sheet has MULTIPLE tabs. The structure below describes one block per tab; each block must be pasted into a DIFFERENT tab at a DIFFERENT cell. Block labels (e.g. "=== PASSING — paste at cell C2 of Passing tab ===") are paste-target markers I read by eye — they live OUTSIDE the data and are NOT copied into the sheet.`
      : `This sheet has a SINGLE tab. Your entire output is one block of tab-separated data rows that I paste at the cell specified in the structure below.`,
    ``,
    `Deliver the data using ONE of the two methods below, in this order of preference:`,
    ``,
    multiBlock
      ? `METHOD A (preferred): Generate ONE downloadable .tsv file PER TAB.`
      : `METHOD A (preferred): Generate a downloadable file.`,
    multiBlock
      ? `  • One .tsv per tab named after the tab, e.g. "${safeTitle}_Passing.tsv", "${safeTitle}_Rushing.tsv", etc.`
      : `  • A .tsv (tab-separated) file — BEST for Google Sheets paste.`,
    multiBlock
      ? `  • Each file's contents = ONLY the tab-separated data rows for that one tab. No header row, no labels.`
      : `  • Or a .csv file with proper comma-escaping (quote any field that contains a comma).`,
    multiBlock
      ? `  • Your chat message should contain the file attachments and NOTHING ELSE — no text, no commentary, no summary.`
      : `  • Or an .xlsx Excel file.`,
    multiBlock
      ? null
      : `  • Name the file after the sheet, e.g. "${safeTitle}.tsv".`,
    multiBlock
      ? null
      : `  • Your chat message should contain the file attachment and NOTHING ELSE — no text, no commentary, no summary.`,
    ``,
    multiBlock
      ? `METHOD B (fallback, if your tool cannot attach files): Output ONE labeled \`\`\`tsv fence PER TAB. The label line goes ABOVE its fence; the fence contains ONLY data rows for that tab.`
      : `METHOD B (fallback, if your tool cannot attach files): Output a single fenced TSV code block.`,
    multiBlock
      ? `  • Layout — exactly this shape, one repetition per tab:`
      : `  • Wrap the entire output in one \`\`\`tsv ... \`\`\` fence.`,
    multiBlock
      ? `      === TAB NAME — paste at cell <CELL> of "<Tab>" tab ===`
      : `  • The fenced block must contain ONLY tab-separated data rows — nothing else.`,
    multiBlock
      ? `      \`\`\`tsv`
      : `  • Before the fence: NOTHING. No "Here is the output:", no introduction.`,
    multiBlock
      ? `      <tab-separated data rows for this tab only>`
      : `  • After the fence: NOTHING. No "Let me know if you need changes", no "Note:", no "I left X blank because…", no follow-up questions, no summary.`,
    multiBlock
      ? `      \`\`\``
      : `  • If you must flag an ambiguity, do it BEFORE the fence opens — never after — and keep it to one short line prefixed with "PRE-NOTE:". The user will read it, delete it, and paste only the fenced block.`,
    multiBlock ? `  • The label line lives OUTSIDE the fence — never inside it.` : null,
    multiBlock ? `  • Each fence contains ONLY tab-separated data rows. No column header row, no commentary, no totals.` : null,
    multiBlock ? `  • Before the FIRST label: NOTHING. Between blocks: ONE blank line, nothing else. After the LAST closing fence: NOTHING.` : null,
    multiBlock ? `  • If you must flag an ambiguity, do it ONCE at the very top before the first label, on a single line prefixed with "PRE-NOTE:".` : null,
    ``,
    `Hard rules that apply to BOTH methods:`,
    `  1. 100% accuracy or blank. If you are not certain about a cell, leave it blank. Never guess, never invent a plausible value.`,
    `  2. Preserve the exact column order, row order, and row count described below.`,
    `  3. No column header row, no totals row, no "N/A", no em dashes, no trailing "source: screenshot" annotations. (For multi-tab sheets the per-tab "===" paste-target labels are the ONE allowed exception, and ONLY when they live outside the data fence as described above.)`,
    `  4. Numbers with no thousands separators: "1234" not "1,234".`,
    `  5. Decimals use a period and match the decimal precision specified per-column (e.g. "5.8" not "5.80" not "5,8").`,
    `  6. Tab character (U+0009) between fields when producing TSV — not multiple spaces, not a pipe, not a semicolon. ASCII only inside data: no smart quotes (" "), no en/em dashes (– —), no non-breaking spaces (U+00A0), no zero-width characters (U+200B/U+FEFF).`,
    `  7. One line per data row. Do NOT introduce extra blank lines inside a data block unless the sheet structure below explicitly calls for a spacer row.`,
    `  8. Row count must match what the sheet expects. Unknown rows stay in place as all-blank lines (the correct number of empty tab-separated cells) — they are not skipped.`,
    ``,
    `═══════════════════════════════════════════════════════════`,
    `SELF-VERIFICATION PROTOCOL — RUN THIS BEFORE SENDING`,
    `═══════════════════════════════════════════════════════════`,
    `After you draft your output but BEFORE you send your reply, you MUST execute the following checks against YOUR OWN draft. Do not just read them — actually run them on the text you are about to send. If ANY check fails, fix the output and re-run the checks. Do not send output that has not passed every check.`,
    ``,
    `CHECK 1 — Delimiter count per row.`,
    multiBlock
      ? `  For each block, look up the required column count for that tab in the structure below. Pick the FIRST line, a MIDDLE line, and the LAST line of the block. Count tab characters in each. Required tab count = (column count − 1). If any sampled line has a wrong count, a value contains a stray tab/comma OR you skipped/added a column. FIX, then re-sample.`
      : `  Look up the required column count in the structure below. Pick the FIRST, MIDDLE, and LAST data line. Count tab characters in each. Required tab count = (column count − 1). If any sampled line has a wrong count, a value contains a stray tab/comma OR you skipped/added a column. FIX, then re-sample.`,
    ``,
    `CHECK 2 — Row count per block.`,
    multiBlock
      ? `  For each block, count the data lines you produced (including all-blank lines for unknown rows). Confirm it equals the row count the structure specifies for that tab (or matches the pre-filled column A on that tab as described). If short, you skipped a player. If long, you invented one. FIX.`
      : `  Count the data lines you produced (including all-blank lines for unknown rows). Confirm it equals the row count the structure specifies. If short, you skipped a row. If long, you invented one. FIX.`,
    ``,
    `CHECK 3 — Column-to-value walk.`,
    `  Pick TWO data rows at random. For each, walk left-to-right through the columns named in the structure and confirm the value at that position matches the spec for that column (integer vs decimal vs blank, sensible magnitude, correct stat). Watch for column-order traps: if the structure flags an inverted-order tab (e.g. "TD vs Long order is swapped"), re-read those tab specs character-by-character before signing off. FIX any swap.`,
    ``,
    `CHECK 4 — Stray text scan.`,
    `  Re-read your draft top-to-bottom. Anything that is NOT a fence delimiter, an allowed paste-target label (multi-tab only, outside the fence), or a tab-separated data row is contraband. Examples: "Here is", "Let me know", "Note:", "I left X blank because…", bullet points, follow-up questions, em dashes used as connector punctuation, summaries of what you did. DELETE.`,
    ``,
    `CHECK 5 — Number/character format scan.`,
    `  Search your data rows for: commas inside numbers ("1,234" → "1234"), percent signs, units ("yds", "%"), placeholder strings ("N/A", "—", "-"), parenthetical asides, smart quotes, em dashes, non-breaking spaces. DELETE or BLANK per the rules.`,
    ``,
    `CHECK 6 — Decimal precision spot-check.`,
    `  For any column the structure marks as a DECIMAL, confirm your value uses a period AND the exact number of decimal places specified (e.g. "7.3" not "7.30" not "7"). Integer columns must have NO decimal point. FIX.`,
    ``,
    `Only after all six checks pass do you send the reply.`,
    ``,
    `Sheet structure:`,
    structure.trim(),
  ].filter(line => line !== null)
  if (notes) {
    sections.push('', `Additional notes:`, notes.trim())
  }
  // Roster blocks — the AI uses these to expand abbreviated names (e.g.
  // EA CFB menus display "A. Guess" but Google Sheets dropdowns reject
  // that form; the roster map lets the AI write "Alex Guess" instead.
  const rosterBlock = buildRosterBlock(roster, [
    '═══════════════════════════════════════════════════════════',
    rosterLabel,
    '═══════════════════════════════════════════════════════════',
    'When a screenshot shows an abbreviated name (e.g. "A. Guess", "J. Smith",',
    '"D.Hixon"), MATCH it to the full name below by last name + first-initial.',
    'ALWAYS output the full name as it appears here — Google Sheets dropdowns',
    'reject abbreviated forms. If two players share the same last initial, use',
    'jersey number + position to disambiguate. If you cannot disambiguate with',
    'certainty, leave the cell blank per the "100% accuracy or blank" rule.',
    '',
  ].join('\n'))
  if (rosterBlock) {
    sections.push('', rosterBlock)
  }
  const opponentBlock = buildRosterBlock(opponentRoster, [
    '═══════════════════════════════════════════════════════════',
    opponentRosterLabel,
    '═══════════════════════════════════════════════════════════',
    '',
  ].join('\n'))
  if (opponentBlock) {
    sections.push('', opponentBlock)
  }
  if (includeTeamMap) {
    sections.push(
      '',
      `When a team appears, use the following abbreviations (format: ABBR = Full Name):`,
      TEAM_ABBR_MAPPING,
    )
  }
  return sections.join('\n')
}
