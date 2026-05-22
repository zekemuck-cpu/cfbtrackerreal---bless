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
 * Build an abbr → name mapping string from a dynasty teams object.
 * Sorted by abbreviation. Includes ALL teams (FBS + FCS + custom),
 * since callers append this to prompts that need every abbr the
 * AI might see in a screenshot.
 */
function buildTeamMapFromDynasty(dynastyTeams) {
  if (!dynastyTeams || typeof dynastyTeams !== 'object') return null
  const entries = Object.values(dynastyTeams)
    .filter(t => t && t.abbr && t.name)
    .map(t => ({ abbr: String(t.abbr).toUpperCase(), name: t.name }))
  if (entries.length === 0) return null
  entries.sort((a, b) => a.abbr.localeCompare(b.abbr))
  return entries.map(({ abbr, name }) => `${abbr} = ${name}`).join('\n')
}

/**
 * Build an AI prompt describing the structure of a Google Sheet so a user
 * can feed screenshots to an AI chat tool and paste the output back into
 * the sheet cell-for-cell.
 *
 * @param {object} config
 * @param {string} config.title      — Human-friendly sheet name (e.g. "Team Statistics")
 * @param {string} config.structure  — Multi-line string describing tabs, headers, row count, formats
 * @param {boolean} [config.includeTeamMap=false] — Append the team-abbreviation mapping.
 *   If `dynastyTeams` is also provided, the mapping is built from THAT
 *   (covers FCS placeholders and custom/teambuilder teams). Otherwise a
 *   static FBS-only fallback list is used.
 * @param {object} [config.dynastyTeams] — Optional dynasty.teams object used
 *   to dynamically build the abbreviation map. When supplied, the prompt's
 *   team list reflects the user's actual dynasty (so the AI knows about
 *   FCS placeholders, renamed TB teams, etc.).
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
  dynastyTeams = null,
  notes,
  roster,
  rosterLabel = 'YOUR TEAM ROSTER (match abbreviated names like "A. Guess" to full names)',
  opponentRoster,
  opponentRosterLabel = 'OPPONENT ROSTER',
  multiBlock = false,
}) {
  const safeTitle = title.replace(/[^a-zA-Z0-9]+/g, '_')
  const sections = [
    `Your single deliverable is a TSV (tab-separated values) data file for "${title}". Not CSV, not a markdown table, not JSON, not a chat-formatted explanation — TSV. Read this whole instruction block before you start.`,
    ``,
    `═══════════════════════════════════════════════════════════`,
    `OUTPUT DELIVERY FORMAT — READ THIS FIRST, OBEY EXACTLY`,
    `═══════════════════════════════════════════════════════════`,
    multiBlock
      ? `Generate ONE downloadable .tsv file PER TAB and attach all of them to your reply. ".tsv" — tab-separated values. This is the format that pastes cleanly into Google Sheets without any post-processing on the user's end.`
      : `Generate a downloadable .tsv file (tab-separated values) and attach it to your reply. This is the format that pastes cleanly into Google Sheets without any post-processing on the user's end.`,
    ``,
    `WHY TSV (NOT CSV, NOT MARKDOWN): the user is going to paste your output directly into Google Sheets. Tabs split fields into cells in one keystroke. CSV requires escape rules for commas inside numbers; markdown tables don't paste at all. The user has confirmed empirically that TSV files work every time. Anything else creates work for the user. Default to TSV unless you literally cannot.`,
    ``,
    multiBlock
      ? `This sheet has MULTIPLE tabs. The structure below describes one block per tab; each block must land in a DIFFERENT tab at a DIFFERENT cell. Block labels (e.g. "=== PASSING — paste at cell C2 of Passing tab ===") are paste-target markers the user reads by eye — they live OUTSIDE the data and are NOT copied into the sheet.`
      : `This sheet has a SINGLE tab. Your entire output is one block of tab-separated data rows that the user pastes at the cell specified in the structure below.`,
    ``,
    `Deliver via ONE of the two methods below. Method A is strongly preferred — only fall back to Method B if your tool genuinely has no file-attachment capability:`,
    ``,
    multiBlock
      ? `METHOD A (PREFERRED — use this whenever you can attach files):`
      : `METHOD A (PREFERRED — use this whenever you can attach files):`,
    multiBlock
      ? `  • Generate one .tsv file per tab. Name them e.g. "${safeTitle}_Passing.tsv", "${safeTitle}_Rushing.tsv", etc.`
      : `  • Generate a .tsv file named "${safeTitle}.tsv".`,
    multiBlock
      ? `  • Each file's contents = ONLY the tab-separated data rows for that one tab. No header row, no commentary, no labels INSIDE the file.`
      : `  • The file's contents = ONLY tab-separated data rows. No header row, no commentary, no labels inside the file.`,
    multiBlock
      ? `  • Your chat message must include, for each attached file, a one-line paste-target label so the user knows where the file goes. Format exactly: "<filename>.tsv → paste at cell <CELL> of the \"<Tab>\" tab". List one per line, one line per file, and NOTHING ELSE — no greeting, no "Here are the files:", no summary, no follow-up.`
      : `  • Your chat message must include exactly ONE line: "Paste this TSV into cell <CELL> of the \"<Tab>\" tab" — read the structure below for the exact cell + tab. Then the file attachment. NOTHING ELSE — no greeting, no "Here is the file:", no summary, no follow-up.`,
    `  • If your interface lets you generate files via code execution / artifacts / file builder, USE THAT. Don't stop at writing the data inline; finish by attaching it as a .tsv file.`,
    ``,
    multiBlock
      ? `METHOD B (fallback ONLY when your tool literally cannot attach files): Output ONE labeled \`\`\`tsv fence PER TAB. The label line goes ABOVE its fence and tells the user where to paste; the fence contains ONLY data rows for that tab.`
      : `METHOD B (fallback ONLY when your tool literally cannot attach files): Output a single fenced TSV code block, preceded by ONE line that tells the user where to paste it.`,
    multiBlock
      ? `  • Layout — exactly this shape, one repetition per tab:`
      : `  • Layout — exactly this shape:`,
    multiBlock
      ? `      Paste this TSV into cell <CELL> of the "<Tab>" tab`
      : `      Paste this TSV into cell <CELL> of the "<Tab>" tab    ← read the structure below for the exact cell + tab`,
    multiBlock
      ? `      \`\`\`tsv`
      : `      \`\`\`tsv`,
    multiBlock
      ? `      <tab-separated data rows for this tab only>`
      : `      <tab-separated data rows>`,
    multiBlock
      ? `      \`\`\``
      : `      \`\`\``,
    multiBlock
      ? `  • The "Paste this TSV into cell …" line is the ONE allowed non-data line. It lives OUTSIDE the fence, immediately ABOVE the opening backticks.`
      : `  • The "Paste this TSV into cell …" line is the ONE allowed non-data line. It lives OUTSIDE the fence, immediately ABOVE the opening backticks. Use the EXACT cell + tab name from the structure below — don't paraphrase, don't guess. The user reads this line so they know where to click before pasting.`,
    multiBlock ? `  • Each fence contains ONLY tab-separated data rows. No column header row, no commentary, no totals.` : `  • The fence contains ONLY tab-separated data rows. No column header row, no commentary, no totals.`,
    multiBlock
      ? `  • Before the FIRST paste-target line: NOTHING. Between blocks: ONE blank line, nothing else. After the LAST closing fence: NOTHING.`
      : `  • Before the paste-target line: NOTHING — no greeting, no "Here is the output:", no "Sure, ", no preamble. After the closing fence: NOTHING — no "Let me know if you need changes", no summary, no follow-up questions.`,
    multiBlock
      ? `  • If you must flag an ambiguity, do it ONCE at the very top before the first paste-target line, on a single line prefixed with "PRE-NOTE:".`
      : `  • If you must flag an ambiguity, do it ONCE on a single line prefixed with "PRE-NOTE:" placed BEFORE the paste-target line — never after the fence.`,
    ``,
    `Hard rules that apply to BOTH methods:`,
    `  1. 100% accuracy or blank. If you are not certain about a cell, leave it blank. Never guess, never invent a plausible value.`,
    `  2. Preserve the exact column order, row order, and row count described below.`,
    `  3. No column header row, no totals row, no "N/A", no em dashes, no trailing "source: screenshot" annotations. The ONLY allowed non-data lines are the "Paste this TSV into cell …" paste-target label(s) that sit OUTSIDE the fence(s) immediately above the opening backticks, as described in Method A/B above.`,
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
    `  Re-read your draft top-to-bottom. The ONLY allowed non-data lines are: (a) the "Paste this TSV into cell <CELL> of the \"<Tab>\" tab" line(s) that sit directly above each fence, (b) the fence delimiters themselves, and (c) an optional one-line "PRE-NOTE:" if you genuinely must flag an ambiguity. Anything else is contraband: greetings, "Here is the output:", "Let me know if you need changes", "Note:", "I left X blank because…", bullet points, follow-up questions, em dashes used as connector punctuation, summaries of what you did. DELETE.`,
    ``,
    `CHECK 5 — Number/character format scan.`,
    `  Search your data rows for: commas inside numbers ("1,234" → "1234"), percent signs, units ("yds", "%"), placeholder strings ("N/A", "—", "-"), parenthetical asides, smart quotes, em dashes, non-breaking spaces. DELETE or BLANK per the rules.`,
    ``,
    `CHECK 6 — Decimal precision spot-check.`,
    `  For any column the structure marks as a DECIMAL, confirm your value uses a period AND the exact number of decimal places specified (e.g. "7.3" not "7.30" not "7"). Integer columns must have NO decimal point. FIX.`,
    ``,
    `Only after all six checks pass do you send the reply.`,
    ``,
    `═══════════════════════════════════════════════════════════`,
    `MULTI-PART UPLOADS — if the user sends more screenshots next`,
    `═══════════════════════════════════════════════════════════`,
    `The user may hit an attachment limit and send additional screenshots in`,
    `a follow-up message with no new prompt (or only brief text like "more",`,
    `"continue", "here's the rest", or just the screenshots alone). When that`,
    `happens:`,
    ``,
    `  SAME TASK (default assumption): If the new screenshots are clearly`,
    `  more data for this same task — same stat form, same week, same`,
    `  context — append the new rows to your previous TSV and re-deliver`,
    `  the COMPLETE combined output covering every screenshot seen so far.`,
    `  Do NOT restart from scratch. Do NOT repeat rows already output.`,
    `  Just add the new ones and send the full merged TSV.`,
    ``,
    `  DIFFERENT TASK: If the new screenshots are obviously a different`,
    `  category, different week, or completely different layout, say so`,
    `  in one line and treat it as a fresh request.`,
    ``,
    `The default is SAME TASK. Only switch to "different task" if the`,
    `content is clearly unrelated. The re-delivered TSV must pass all`,
    `six verification checks above.`,
    ``,
    `CRITICAL — NEVER INVENT MISSING DATA:`,
    `If the user tells you your output was incomplete or missed something`,
    `but sends NO new screenshots, do NOT attempt to fill in the gaps from`,
    `memory or inference. Instead, reply with ONE line:`,
    `  "Please send the missing screenshots and I will add them."`,
    `Do not re-deliver a "completed" TSV unless you have actual screenshots`,
    `to read the missing data from. Inventing rows that look plausible is`,
    `a data corruption error — the user will paste bad data into their sheet.`,
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
    'PURPOSE: this list is a TIEBREAKER for ABBREVIATED names only.',
    '',
    'When the screenshot shows an abbreviated form (e.g. "A. Guess", "J. Smith",',
    '"D.Hixon"), MATCH it to the full name below by last name + first-initial,',
    'and output the FULL name (Google Sheets dropdowns reject abbreviated forms).',
    'If two players share the same last initial, use jersey number + position to',
    'disambiguate.',
    '',
    'When the screenshot already shows a FULL name (e.g. "Kevin Applewhite",',
    '"Donte Ware"), copy that name VERBATIM — even if it does NOT appear in this',
    'roster list. Real-game rosters can lag the dynasty data (in-season',
    'transfers, walk-ons, depth changes), so this list is NOT a whitelist.',
    'Never blank a cell just because the screenshot name is missing from this',
    'list when the screenshot itself shows the full name clearly.',
    '',
    'Only blank the cell when (a) the screenshot is illegible at that spot, OR',
    '(b) the screenshot shows an abbreviation AND no entry below resolves it',
    'unambiguously.',
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
    const dynamicMap = buildTeamMapFromDynasty(dynastyTeams)
    sections.push(
      '',
      `When a team appears, use the following abbreviations (format: ABBR = Full Name). EVERY team in this list — including any FCS placeholders or custom names — is a VALID, in-scope team for this dynasty:`,
      dynamicMap || TEAM_ABBR_MAPPING,
      '',
      `IMPORTANT — abbreviation handling:`,
      `• The mapping above is the SOURCE OF TRUTH. The Google Sheet's strict dropdown is built from this exact list — anything else is rejected.`,
      `• If the in-game screenshot shows a slightly different short form than what's in the mapping (e.g. screenshot shows "FCSMW" but mapping shows "FCSM", or vice versa), USE THE MAPPING's value. Match by the team's full name and direction (East / Midwest / Northwest / Southeast / West) — not by character-for-character abbreviation match.`,
      `• Never invent an abbreviation that isn't in the mapping. If after a careful re-scan you still can't find a team in the mapping, omit that row — but check carefully first, because abbreviation drift between the in-game UI and the dropdown is a known issue.`,
    )
  }
  return sections.join('\n')
}
