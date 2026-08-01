// Full-attribute entry for Training Results and Recruit Overalls (CFB 27).
//
// The Overall-only flows ask the AI for one number per player. This adds an
// "all ratings" variant: the AI emits the player's COMPLETE attribute set in a
// single compact cell ("AWR 88, SPD 90, ACC 91, …"), alongside Position + OVR.
// One cell per player (rather than ~50 columns) keeps the paste grid and the
// AI output manageable, and reuses parseAttributes() — which already accepts
// both the short codes below and full attribute names.
//
// Shape produced per row: Player<TAB>Position<TAB>OVR<TAB>Attributes
//   parseAttributeRows(splitTsv(text)) -> [{ playerName, position, overall, attributes }]
import { ATTRIBUTE_ABBR, GAME_ATTRIBUTE_ORDER } from './recruitAttributes'
import { parseAttributes } from './recruitSheetParse'

// "SPD=Speed, ACC=Acceleration, …" legend in the game's roster-table order, so
// the AI knows which code maps to which rating AND emits them in the same order
// the user reads off-screen (easier to cross-check against the roster).
export const ATTRIBUTE_PROMPT_LEGEND = GAME_ATTRIBUTE_ORDER
  .map((name) => `${ATTRIBUTE_ABBR[name] || name}=${name}`)
  .join(', ')

const coerceNum = (v) => {
  const s = (v ?? '').toString().trim()
  if (s === '') return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

// The shared "Sheet structure" block for buildAIPrompt's all-attributes variant.
// `kind` tailors the wording: 'training' (post-training roster ratings) or
// 'recruits' (signed recruits' ratings). The AI outputs 4 columns; column 4 is
// the whole rating set as one comma-separated cell of "CODE value" pairs.
export function buildAttributesStructure(kind = 'training') {
  const who = kind === 'recruits'
    ? 'every recruit in the SIGNED RECRUITS block below'
    : 'every player on the YOUR TEAM ROSTER block below'
  const ovrSource = kind === 'recruits'
    ? "the recruit's projected/known Overall"
    : "the player's CURRENT overall AFTER training (the OVR shown in the screenshot)"
  return `The user pastes your output straight into the app; it matches rows by PLAYER NAME, so row order does not matter. Output ONE row for ${who}.

OUTPUT 4 TAB-SEPARATED COLUMNS per row:
  Player<TAB>Position<TAB>OVR<TAB>Attributes

• Player    — FULL name from the roster block (never abbreviated). Match EA's
              abbreviated screenshot names (e.g. "A. Guess") to the full name.
• Position  — the roster's position string exactly (QB, HB, WR, TE, LT, …).
• OVR       — ${ovrSource}. Integer 40–99. Blank only if not visible anywhere.
• Attributes — the player's ENTIRE rating set as ONE cell: comma-separated
              "CODE value" pairs using the codes below, in this order. Include
              EVERY rating the player has a value for in the screenshots; skip a
              rating only when it is genuinely not shown. Example cell:
              "AWR 84, SPD 91, ACC 92, STR 70, AGI 90, COD 88, CTH 95, …"

Attribute codes (CODE=Name):
${ATTRIBUTE_PROMPT_LEGEND}

RULES:
1. Exactly 3 tab characters per row (4 columns). The Attributes cell itself uses
   COMMAS between pairs — never tabs — so it stays one cell.
2. Inside the Attributes cell: "CODE value" pairs, ratings are integers 0–99, no
   "+/-" gain deltas, no parentheses, no units. If a screenshot shows "84 (+1)",
   record 84.
3. One row per roster/recruit player. Use the FULL name from the block below.
4. NEVER GUESS. Omit a rating (or leave OVR blank) when it isn't visible.

REQUIRED OUTPUT FORMAT — one fenced \`\`\`tsv block, nothing else (see TSV delivery rules above):
\`\`\`tsv
Alex Guess	QB	90	AWR 92, SPD 84, ACC 86, STR 78, THP 95, SAC 90, MAC 88, DAC 86
Jaylen Miller	HB	82	AWR 80, SPD 93, ACC 94, CAR 90, BTK 85, JKM 88, BCV 84, CTH 70
...
\`\`\``
}

// Parse splitTsv() rows from an all-attributes paste into entry objects.
// Keeps only rows that look like real data (a name plus an OVR or parseable
// attributes), so a stray prose/label line can't become a junk player.
export function parseAttributeRows(rows) {
  const out = []
  for (const row of rows || []) {
    const playerName = (row?.[0] ?? '').toString().trim()
    if (!playerName) continue
    const position = (row?.[1] ?? '').toString().trim()
    const overall = coerceNum(row?.[2])
    // Attributes live in ONE cell (col 3, comma-separated pairs). If the AI used
    // TABS between pairs instead of commas, splitTsv scatters them into cols 4+;
    // rejoin everything from col 3 on so no trailing ratings are silently lost.
    const attrCell = Array.isArray(row)
      ? row.slice(3).map((c) => String(c ?? '').trim()).filter(Boolean).join(', ')
      : row?.[3]
    const attributes = parseAttributes(attrCell)
    if (overall == null && !attributes) continue // not a data row
    out.push({ playerName, position, overall, attributes: attributes || {} })
  }
  return out
}

// Serialize an entry list back to the 4-column TSV (for the paste grid's raw
// textarea round-trip). Attributes render as "CODE value" pairs in canonical order.
export function serializeAttributeRows(entries) {
  return (entries || [])
    .map((e) => {
      const attrs = e.attributes || {}
      const cell = GAME_ATTRIBUTE_ORDER
        .filter((name) => attrs[name] != null && attrs[name] !== '')
        .map((name) => `${ATTRIBUTE_ABBR[name] || name} ${attrs[name]}`)
        .join(', ')
      return [e.playerName || '', e.position || '', e.overall == null ? '' : e.overall, cell].join('\t')
    })
    .join('\n')
}
