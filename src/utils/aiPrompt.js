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
 * Build an AI prompt describing the structure of a Google Sheet so a user
 * can feed screenshots to an AI chat tool and paste the output back into
 * the sheet cell-for-cell.
 *
 * @param {object} config
 * @param {string} config.title      — Human-friendly sheet name (e.g. "Team Statistics")
 * @param {string} config.structure  — Multi-line string describing tabs, headers, row count, formats
 * @param {boolean} [config.includeTeamMap=false] — Append the team-abbreviation mapping
 * @param {string}  [config.notes]   — Optional extra guidance (e.g. "opponent abbreviations…")
 */
export function buildAIPrompt({ title, structure, includeTeamMap = false, notes }) {
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
  if (includeTeamMap) {
    sections.push(
      '',
      `When a team appears, use the following abbreviations (format: ABBR = Full Name):`,
      TEAM_ABBR_MAPPING,
    )
  }
  return sections.join('\n')
}
