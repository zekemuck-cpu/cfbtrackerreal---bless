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
}) {
  const sections = [
    `Using the data from these screenshots, please generate a spreadsheet for "${title}".`,
    ``,
    `═══════════════════════════════════════════════════════════`,
    `OUTPUT DELIVERY FORMAT — READ THIS FIRST, OBEY EXACTLY`,
    `═══════════════════════════════════════════════════════════`,
    `I am going to paste your output directly into Google Sheets. Any stray character — a heading, a "Here you go:", a trailing "Note:", a bullet, a blank explanatory line — WILL land in a cell and break the sheet. Treat this like generating a data file, not a chat reply.`,
    ``,
    `Deliver the data using ONE of the two methods below, in this order of preference:`,
    ``,
    `METHOD A (preferred): Generate a downloadable file.`,
    `  • A .tsv (tab-separated) file — BEST for Google Sheets paste.`,
    `  • Or a .csv file with proper comma-escaping (quote any field that contains a comma).`,
    `  • Or an .xlsx Excel file.`,
    `  • Name the file after the sheet, e.g. "${title.replace(/[^a-zA-Z0-9]+/g, '_')}.tsv".`,
    `  • Your chat message should contain the file attachment and NOTHING ELSE — no text, no commentary, no summary.`,
    ``,
    `METHOD B (fallback, if your tool cannot attach files): Output a single fenced TSV code block.`,
    `  • Wrap the entire output in one \`\`\`tsv ... \`\`\` fence.`,
    `  • The fenced block must contain ONLY tab-separated data rows — nothing else.`,
    `  • Before the fence: NOTHING. No "Here is the output:", no introduction.`,
    `  • After the fence: NOTHING. No "Let me know if you need changes", no "Note:", no "I left X blank because…", no follow-up questions, no summary.`,
    `  • If you must flag an ambiguity, do it BEFORE the fence opens — never after — and keep it to one short line prefixed with "PRE-NOTE:". The user will read it, delete it, and paste only the fenced block.`,
    ``,
    `Hard rules that apply to BOTH methods:`,
    `  1. 100% accuracy or blank. If you are not certain about a cell, leave it blank. Never guess, never invent a plausible value.`,
    `  2. Preserve the exact column order, row order, and row count described below.`,
    `  3. No header row, no totals row, no "N/A", no em dashes, no trailing "source: screenshot" annotations.`,
    `  4. Numbers with no thousands separators: "1234" not "1,234".`,
    `  5. Decimals use a period and match the decimal precision specified per-column (e.g. "5.8" not "5.80" not "5,8").`,
    `  6. Tab character (U+0009) between fields when producing TSV — not multiple spaces, not a pipe, not a semicolon.`,
    `  7. One line per data row. Do NOT introduce extra blank lines inside the block unless the sheet structure below explicitly calls for a spacer row.`,
    `  8. Row count must match what the sheet expects. Unknown rows stay in place as all-blank lines — they are not skipped.`,
    ``,
    `Sheet structure:`,
    structure.trim(),
  ]
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
