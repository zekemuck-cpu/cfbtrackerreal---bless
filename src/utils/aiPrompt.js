import { getTeamNameOptions, getTeamInGameNames } from '../data/teamRegistry'

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
NDSU = North Dakota State
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
SAC = Sacramento State
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
  const sections = [
    `You're helping a user fill in "${title}" for their college-football dynasty tracker app. The task is simple data entry: read the data they give you (usually a screenshot of an in-game screen) and hand it back as a tab-separated (TSV) code block they can paste straight into the app. This block spells out the exact columns and layout — have a read through, then reply with the data.`,
    ``,
    `═══════════════════════════════════════════════════════════`,
    `HOW TO HAND THE DATA BACK`,
    `═══════════════════════════════════════════════════════════`,
    `Please put the data in an inline fenced TSV code block right in your reply${multiBlock ? ' (one per section)' : ''} — an ordinary code block in the chat, not a downloadable file, artifact, or code-execution output. The user copies the block out of the chat and pastes it into the app's import box, and tab-separated values are what paste cleanly there with no cleanup on their end.`,
    ``,
    `WHY TSV (NOT CSV, NOT MARKDOWN): the user is going to paste your output directly into the app. Tabs split fields into cells in one keystroke. CSV requires escape rules for commas inside numbers; markdown tables don't paste at all. The user has confirmed empirically that pasting TSV works every time. Anything else creates work for the user. Default to TSV unless you literally cannot.`,
    ``,
    multiBlock
      ? `This data has MULTIPLE sections. The structure below describes one block per section. Output one block per section, each in its OWN fenced tsv code block. Section labels (e.g. "=== PASSING ===") are markers the user reads by eye — they live OUTSIDE the data and are NOT copied into the app.`
      : `Your entire output is ONE block of tab-separated data rows that the user copies straight into the app's import box.`,
    ``,
    multiBlock
      ? `Output ONE fenced \`\`\`tsv block PER SECTION. Immediately ABOVE each fence, put a plain label line of the form "=== <SECTION NAME> ===" so the user can tell the blocks apart; the fence contains ONLY data rows for that section. Layout — exactly this shape, one repetition per section:`
      : `Output a single fenced \`\`\`tsv code block — nothing else. Layout — exactly this shape:`,
    multiBlock
      ? `      === <SECTION NAME> ===`
      : null,
    `      \`\`\`tsv`,
    multiBlock
      ? `      <tab-separated data rows for this section only>`
      : `      <tab-separated data rows>`,
    `      \`\`\``,
    multiBlock
      ? `  • The "=== <SECTION NAME> ===" label is the ONLY allowed non-data line and it lives OUTSIDE the fence, immediately ABOVE the opening backticks. It just tells the user which block is which — it is NOT copied into the app.`
      : `  • The fenced tsv block is your ENTIRE deliverable. Do NOT add a paste-target line, a cell reference, or a tab name — the user pastes the block straight into the app's import box.`,
    multiBlock ? `  • Each fence contains ONLY tab-separated data rows. No column header row, no commentary, no totals.` : `  • The fence contains ONLY tab-separated data rows. No column header row, no commentary, no totals.`,
    multiBlock
      ? `  • Keep the inside of each fence pure data — the app reads only what's between the backticks, so a stray sentence in there would get pasted in as if it were data. Separate blocks with a single blank line.`
      : `  • Keep the inside of the fence pure data — the app reads only what's between the backticks, so a stray sentence in there would get pasted in as if it were data.`,
    `  • Anything you want to say — notes, caveats, an ambiguity you had to judge, a question — is welcome OUTSIDE the fence (before or after the block). The importer ignores everything outside the code block, so feel free to add whatever context is helpful; it won't interfere with the paste.`,
    ``,
    `Formatting requirements (these keep the paste clean):`,
    `  1. Accuracy over completeness. If you're not certain about a cell, leave it blank rather than guessing — a blank is easy for the user to fill in, a wrong value is hard to catch.`,
    `  2. Preserve the exact column order, row order, and row count described below.`,
    `  3. No column header row, no totals row, no "N/A", no em dashes, no trailing "source: screenshot" annotations. The ONLY allowed non-data lines are the fence delimiters${multiBlock ? ' and the "=== <SECTION> ===" label(s) that sit OUTSIDE the fences immediately above the opening backticks' : ''}, as described above.`,
    `  4. Numbers with no thousands separators: "1234" not "1,234".`,
    `  5. Decimals use a period and match the decimal precision specified per-column (e.g. "5.8" not "5.80" not "5,8").`,
    `  6. Tab character (U+0009) between fields when producing TSV — not multiple spaces, not a pipe, not a semicolon. ASCII only inside data: no smart quotes (" "), no en/em dashes (– —), no non-breaking spaces (U+00A0), no zero-width characters (U+200B/U+FEFF).`,
    `  7. One line per data row. Do NOT introduce extra blank lines inside a data block unless the structure below explicitly calls for placeholder rows (e.g., a fixed-position layout where blank lines hold a row slot so subsequent banners stay on their exact rows).`,
    `  8. Row count: follow the structure's instructions exactly. If the structure specifies a fixed total line count or a fixed row capacity per section, emit EXACTLY that many lines — using truly empty lines (just \\n, no spaces or tabs) for unused slots so every fixed-position element lands on its correct row. If the structure doesn't specify a fixed count, output only the rows you have data for.`,
    ``,
    `═══════════════════════════════════════════════════════════`,
    `QUICK CHECKS BEFORE YOU SEND`,
    `═══════════════════════════════════════════════════════════`,
    `Once you've drafted the block, it's worth running these checks against it — they catch the small mistakes that make a paste fail. If one turns up a problem, fix it and re-check before you reply.`,
    ``,
    `CHECK 1 — Delimiter count per row.`,
    multiBlock
      ? `  For each block, look up the required column count for that tab in the structure below. Pick the FIRST line, a MIDDLE line, and the LAST line of the block. Count tab characters in each. Required tab count = (column count − 1). If any sampled line has a wrong count, a value contains a stray tab/comma OR you skipped/added a column. FIX, then re-sample.`
      : `  Look up the required column count in the structure below. Pick the FIRST, MIDDLE, and LAST data line. Count tab characters in each. Required tab count = (column count − 1). If any sampled line has a wrong count, a value contains a stray tab/comma OR you skipped/added a column. FIX, then re-sample.`,
    ``,
    `CHECK 2 — Row count per block.`,
    multiBlock
      ? `  For each block, count the data lines you produced. Confirm it matches what the structure requires for that tab. If the structure specifies a fixed line count (e.g. "exactly 20 lines"), every line must be present — data rows OR truly empty placeholder lines. If short, you skipped a row. If long, you invented one. FIX.`
      : `  Count the data lines you produced. Confirm it matches what the structure requires. If the structure specifies a fixed total line count, every row must be present — data rows OR truly empty placeholder lines for unused slots. FIX any mismatch.`,
    ``,
    `CHECK 3 — Column-to-value walk.`,
    `  Pick TWO data rows at random. For each, walk left-to-right through the columns named in the structure and confirm the value at that position matches the spec for that column (integer vs decimal vs blank, sensible magnitude, correct stat). Watch for column-order traps: if the structure flags an inverted-order tab (e.g. "TD vs Long order is swapped"), re-read those tab specs character-by-character before signing off. FIX any swap.`,
    ``,
    `CHECK 4 — Keep the data block clean.`,
    `  Look INSIDE the fence: every line between the backticks should be a data row of tab-separated values${multiBlock ? ' (or a "=== <SECTION> ===" label sitting directly above a fence)' : ''} — nothing else. The app pastes everything between the backticks in as data, so if a greeting, a "Note:", an "I left X blank because…", a bullet, a totals line, or a summary ended up INSIDE the block, move it outside the fence or drop it. Prose OUTSIDE the block is fine — leave it be.`,
    ``,
    `CHECK 5 — Number/character format scan.`,
    `  Search your data rows for: commas inside numbers ("1,234" → "1234"), percent signs, units ("yds", "%"), placeholder strings ("N/A", "—", "-"), parenthetical asides, smart quotes, em dashes, non-breaking spaces. DELETE or BLANK per the rules.`,
    ``,
    `CHECK 6 — Decimal precision spot-check.`,
    `  For any column the structure marks as a DECIMAL, confirm your value uses a period AND the exact number of decimal places specified (e.g. "7.3" not "7.30" not "7"). Integer columns must have NO decimal point. FIX.`,
    ``,
    `CHECK 7 — Source-traceability (no carried-over rows).`,
    `  For EVERY data row, confirm you can point to that exact item in a screenshot attached to THIS request. Delete any row you are reconstructing from memory, from earlier in the conversation, or from a previous week. If it is not in a screenshot in front of you right now, it does not belong in the output — this is the most common corruption, a stale row bleeding in from a prior week.`,
    ``,
    `Only after all checks pass do you send the reply.`,
    ``,
    `═══════════════════════════════════════════════════════════`,
    `SCOPE — ONLY THE SCREENSHOTS IN THIS REQUEST`,
    `═══════════════════════════════════════════════════════════`,
    `Every reply covers ONLY the screenshots attached to the CURRENT request.`,
    `Do NOT carry over, repeat, or re-derive rows from earlier in the`,
    `conversation, from a previous week, or from memory. If a value is not`,
    `visible in a screenshot attached to THIS request, it does not go in the`,
    `output — even if you "remember" that player from before. Each weekly run`,
    `is independent: the only correct rows are the ones you can see right now.`,
    ``,
    `MULTI-PART UPLOADS — if the user sends more screenshots next:`,
    `The user may hit an attachment limit and send additional screenshots in`,
    `a follow-up message with no new prompt (or only brief text like "more",`,
    `"continue", "here's the rest", or just the screenshots alone). When that`,
    `happens:`,
    ``,
    `  CONTINUATION (default ONLY when no new prompt block is pasted): treat`,
    `  the new screenshots as the rest of the SAME upload. Re-deliver the`,
    `  complete output for THIS request — the original screenshots PLUS the`,
    `  new ones. Do NOT repeat a row already output; just add the new ones.`,
    `  "Combined output" means combined across the screenshots of THIS one`,
    `  request only — never across earlier weeks/requests in the chat.`,
    ``,
    `  NEW REQUEST: if a fresh instruction/prompt block is pasted (it names a`,
    `  new title or week), OR the screenshots are clearly a different`,
    `  category/week/layout, START OVER. Discard every row from earlier in the`,
    `  conversation and output ONLY what is visible in the new request's`,
    `  screenshots. NEVER merge a new week's data into a prior week's rows.`,
    ``,
    `For every row ask: "can I see this exact player in a screenshot attached`,
    `to the current request?" If no, drop it.`,
    ``,
    `CRITICAL — NEVER INVENT OR CARRY OVER MISSING DATA:`,
    `If the user tells you your output was incomplete or missed something`,
    `but sends NO new screenshots, do NOT fill in the gaps from memory or`,
    `inference, and do NOT pad the output with half-remembered rows from`,
    `earlier in the chat. Instead, reply with ONE line:`,
    `  "Please send the missing screenshots and I will add them."`,
    `Do not re-deliver a "completed" TSV unless you have actual screenshots`,
    `to read the missing data from. Inventing or carrying over rows that look`,
    `plausible is a data corruption error — the user pastes bad data.`,
    ``,
    `Sheet structure:`,
    structure.trim(),
  ].filter(line => line !== null)
  if (notes) {
    sections.push('', `Additional notes:`, notes.trim())
  }
  // Roster blocks — the AI uses these to expand abbreviated names (e.g.
  // EA CFB menus display "A. Guess" but the app matches on full names;
  // the roster map lets the AI write "Alex Guess" instead.
  const rosterBlock = buildRosterBlock(roster, [
    '═══════════════════════════════════════════════════════════',
    rosterLabel,
    '═══════════════════════════════════════════════════════════',
    'PURPOSE: this list is a TIEBREAKER for ABBREVIATED names only.',
    '',
    'When the screenshot shows an abbreviated form (e.g. "A. Guess", "J. Smith",',
    '"D.Hixon"), MATCH it to the full name below by last name + first-initial,',
    'and output the FULL name (the app may not resolve abbreviated forms).',
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
    const nameList = getTeamNameOptions(dynastyTeams, { includeFCS: true })
    // Some teams appear in EA CFB under a different name than the app's list
    // label (e.g. EA shows the Ragin' Cajuns as "Louisiana"; the list has
    // "Lafayette Ragin' Cajuns"). Annotate those so the AI can bridge the
    // in-game name to the exact list entry it must output.
    const aliasMap = getTeamInGameNames(dynastyTeams)  // { label: primaryInGameName }
    const annotatedList = nameList.map((name) => {
      const ign = aliasMap[name]
      return ign ? `${name}  (in-game name: ${ign})` : name
    })
    const hasAliases = Object.keys(aliasMap).length > 0
    sections.push(
      '',
      `TEAM NAMES — whenever a team appears, output its EXACT name from the list below. Use the team NAME, never an abbreviation and never the mascot/nickname (write "Kentucky", not "UK" and not "Kentucky Wildcats"). EVERY team in this list — including any FCS placeholders or custom teams — is a VALID, in-scope team for this dynasty:`,
      annotatedList.join('\n'),
      '',
      `IMPORTANT — team name handling:`,
      `• This list is the SOURCE OF TRUTH. The chart's dropdown accepts EXACTLY these strings — anything else (an abbreviation, a nickname, a misspelling) is rejected.`,
      `• Copy the name character-for-character as written above. Match the team in the screenshot to this list by school; output that list entry verbatim.`,
      `• The two Miami schools are disambiguated: output "Miami (FL)" for the Hurricanes and "Miami (OH)" for the RedHawks. Use the logo/colors/conference in the screenshot to tell them apart.`,
      ...(hasAliases ? [
        `• Some teams show a DIFFERENT name in EA CFB, marked above as "(in-game name: …)". When a screenshot shows that in-game name, output the LIST NAME (the part BEFORE the parenthesis), never the in-game name. Example: a screenshot showing "Louisiana" → output "Lafayette Ragin' Cajuns" (NOT "Louisiana", and NOT the similarly-named "Louisiana Tech" or "LSU").`,
      ] : []),
      `• Never invent a name that isn't in the list. If after a careful re-scan you still can't match a team, omit that row rather than guessing.`,
    )
  }
  return sections.join('\n')
}
