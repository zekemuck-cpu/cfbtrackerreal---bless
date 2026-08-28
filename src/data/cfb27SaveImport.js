// Maps rows extracted from a CFB 27 PC save (via api/_handlers/cfb27/save-parse.js,
// vendored from the verified cfb27-extract tool) into the app's player
// object shape. Mirrors defaultRosterLoader.js's per-player shaping — same
// teamsByYear/classByYear/overallByYear/devTraitByYear/attributesByYear
// convention, entryReason: 'created', and deliberately NO movementByYear
// arrival stamp (these are a dynasty's STARTING roster, not portal
// transfers — see defaultRosterLoader.js's header comment for why that
// matters to the player page's arrival badge).
//
// All conversions below were verified against a real DYNASTY-* save
// (16,257 players) — see the CFB27 PC Save Import plan for the specifics
// (Jeremiah Smith: 99 OVR / Contested Specialist / 6'3" / 223 lb, matching
// the in-game card).
import { getTidFromTeamName } from './teamRegistry'
import UNIQUE_PORTRAIT_IDS from './cfb27UniquePortraitIds.json'
import GENERIC_PORTRAIT_KEYS from './cfb27GenericPortraitKeys.json'
import UNIQUE_COACH_PORTRAIT_IDS from './cfb27UniqueCoachPortraitIds.json'
import GENERIC_COACH_PORTRAIT_KEYS from './cfb27GenericCoachPortraitKeys.json'
import { calculateRecruitingClassScore } from '../utils/recruitingScore'
// Portrait host resolution lives in imageProxy.js (dependency-free) so the
// render-time rebase doesn't have to pull this module's portrait-manifest
// JSONs into every bundle that renders an image. Re-exported here because
// this is where portrait URLs are BUILT, so it's the natural import site.
import { portraitBase, resolvePortraitUrl } from '../utils/imageProxy'
export { portraitBase, resolvePortraitUrl }

// Static manifests of what actually has a file in public/cfb27-portraits/ —
// generated from that folder's own listing (regenerate by re-running the
// migration script if the bundled portrait library is ever re-scraped/
// updated). Used by mapPortraitUrl/mapCoachPortraitUrl so a missing file
// returns '' (Player.jsx already hides a broken/missing image gracefully)
// instead of a URL that 404s.
const UNIQUE_PORTRAIT_ID_SET = new Set(UNIQUE_PORTRAIT_IDS)
const GENERIC_PORTRAIT_KEY_SET = new Set(GENERIC_PORTRAIT_KEYS)
const UNIQUE_COACH_PORTRAIT_ID_SET = new Set(UNIQUE_COACH_PORTRAIT_IDS)
const GENERIC_COACH_PORTRAIT_KEY_SET = new Set(GENERIC_COACH_PORTRAIT_KEYS)

// Save uses side-specific/alternate codes where the app's roster vocabulary
// (RosterEntryModal.jsx's AI-prompt spec) uses a slightly different set.
// Everything not listed here already matches (C, CB, DT, FB, FS, HB, K, LG,
// LT, P, QB, RG, RT, SS, TE, WR).
const POSITION_MAP = {
  LE: 'LEDG',
  RE: 'REDG',
  MLB: 'MIKE',
  // OLB side isn't recoverable from the save alone — best-effort convention.
  LOLB: 'WILL',
  ROLB: 'SAM',
}

export function mapPosition(position) {
  if (!position) return 'QB'
  const up = String(position).toUpperCase()
  return POSITION_MAP[up] || up
}

// Extractor rating field (Rating suffix already stripped) -> the app's
// canonical attribute name (src/utils/recruitAttributes.js's
// ATTRIBUTE_COLUMNS). Verified complete: covers all 53 of the 56 raw fields
// that have an app-side counterpart. Confidence/LongSnap/ThrowAccuracy
// (generic) are intentionally absent — the app doesn't track them.
const RATING_FIELD_TO_ATTRIBUTE = {
  DeepRouteRunning: 'Deep Route',
  Agility: 'Agility',
  PlayAction: 'Play Action',
  Acceleration: 'Acceleration',
  PassBlockPower: 'Pass Block Power',
  Awareness: 'Awareness',
  PassBlock: 'Pass Block',
  PassBlockFinesse: 'Pass Block Finesse',
  BCVision: 'BC Vision',
  BreakTackle: 'Break Tackle',
  FinesseMoves: 'Finesse Moves',
  BreakSack: 'Break Sack',
  BlockShedding: 'Block Shedding',
  ManCoverage: 'Man Coverage',
  MediumRouteRunning: 'Medium Route',
  ChangeOfDirection: 'Change of Direction',
  Catching: 'Catching',
  CatchInTraffic: 'Catch In Traffic',
  KickReturn: 'Kick Return',
  HitPower: 'Hit Power',
  Carrying: 'Carrying',
  LeadBlock: 'Lead Block',
  JukeMove: 'Juke Move',
  Jumping: 'Jumping',
  KickAccuracy: 'Kick Accuracy',
  KickPower: 'Kick Power',
  Injury: 'Injury',
  ImpactBlocking: 'Impact Blocking',
  ThrowAccuracyDeep: 'Deep Accuracy',
  ThrowAccuracyMid: 'Medium Accuracy',
  ThrowAccuracyShort: 'Short Accuracy',
  ThrowOnTheRun: 'Throw On Run',
  StiffArm: 'Stiff Arm',
  Strength: 'Strength',
  Tackle: 'Tackle',
  SpectacularCatch: 'Spectacular Catch',
  Speed: 'Speed',
  SpinMove: 'Spin Move',
  Stamina: 'Stamina',
  Toughness: 'Toughness',
  ThrowUnderPressure: 'Under Pressure',
  ThrowPower: 'Throw Power',
  ShortRouteRunning: 'Short Route',
  RunBlockFinesse: 'Run Block Finesse',
  RunBlockPower: 'Run Block Power',
  RunBlock: 'Run Block',
  Trucking: 'Trucking',
  PowerMoves: 'Power Moves',
  Press: 'Press',
  Pursuit: 'Pursuit',
  Release: 'Release',
  PlayRecognition: 'Play Recognition',
  ZoneCoverage: 'Zone Coverage',
}

export function mapAttributes(ratings) {
  if (!ratings) return null
  const out = {}
  for (const [field, value] of Object.entries(ratings)) {
    const name = RATING_FIELD_TO_ATTRIBUTE[field]
    if (!name || value == null) continue
    out[name] = value
  }
  return Object.keys(out).length ? out : null
}

// Save's PLYR_HOME_STATE values are full state names with NO spaces between
// words (e.g. "NewYork", "NorthCarolina") — verified against the real save.
// "NonUS" (international hometowns) maps to blank, matching the app's dropdown
// which only offers US state codes.
const STATE_NAME_TO_CODE = {
  Alabama: 'AL', Alaska: 'AK', Arizona: 'AZ', Arkansas: 'AR', California: 'CA',
  Colorado: 'CO', Connecticut: 'CT', Delaware: 'DE', Florida: 'FL', Georgia: 'GA',
  Hawaii: 'HI', Idaho: 'ID', Illinois: 'IL', Indiana: 'IN', Iowa: 'IA',
  Kansas: 'KS', Kentucky: 'KY', Louisiana: 'LA', Maine: 'ME', Maryland: 'MD',
  Massachusetts: 'MA', Michigan: 'MI', Minnesota: 'MN', Mississippi: 'MS',
  Missouri: 'MO', Montana: 'MT', Nebraska: 'NE', Nevada: 'NV',
  NewHampshire: 'NH', NewJersey: 'NJ', NewMexico: 'NM', NewYork: 'NY',
  NorthCarolina: 'NC', NorthDakota: 'ND', Ohio: 'OH', Oklahoma: 'OK',
  Oregon: 'OR', Pennsylvania: 'PA', RhodeIsland: 'RI', SouthCarolina: 'SC',
  SouthDakota: 'SD', Tennessee: 'TN', Texas: 'TX', Utah: 'UT', Vermont: 'VT',
  Virginia: 'VA', Washington: 'WA', WestVirginia: 'WV', Wisconsin: 'WI',
  Wyoming: 'WY', DistrictOfColumbia: 'DC',
}

export function mapState(homeState) {
  if (!homeState || homeState === 'NonUS') return ''
  return STATE_NAME_TO_CODE[homeState] || ''
}

// The save's star rating is an enum name ("FIVE_STAR"), not a number — the
// app's recruiting UI does `Number(stars)` everywhere (sorting, star-icon
// rendering, filter chips), so an unmapped enum string silently evaluates to
// 0/NaN and renders as no stars at all.
const STARS_NAME_TO_NUMBER = {
  ONE_STAR: 1, TWO_STAR: 2, THREE_STAR: 3, FOUR_STAR: 4, FIVE_STAR: 5,
}

export function mapStars(rawStars) {
  return STARS_NAME_TO_NUMBER[rawStars] || 0
}

// SchoolYear ("Freshman"/"Sophomore"/"Junior"/"Senior") + RedshirtStatus
// ("Eligible"/"Previous"/"Ineligible") -> the app's Fr/So/Jr/Sr (+ "RS "
// prefix). "Previous" means the player already burned a redshirt year in an
// earlier season — exactly the app's "RS " semantics.
const SCHOOL_YEAR_TO_CLASS = {
  Freshman: 'Fr',
  Sophomore: 'So',
  Junior: 'Jr',
  Senior: 'Sr',
}

export function mapClass(schoolYear, redshirtStatus) {
  const base = SCHOOL_YEAR_TO_CLASS[schoolYear] || 'Fr'
  return redshirtStatus === 'Previous' ? `RS ${base}` : base
}

// Recruit.Class (a raw save field on the Recruit row, not the same as a
// signed Player's SchoolYear) — verified against a real save: exactly 4
// distinct values exist, 'HighSchool' (the overwhelming majority) plus 3
// junior-college variants. Matches the in-game recruit detail screen's own
// "JC (JR)"/"JC (SO)"/"JC (SR)" class label exactly (JuniorCollege_Senior is
// a rare case — 1 of 4,101 recruits in the save checked — but still mapped
// for completeness). Returns null for 'HighSchool' or any unrecognized
// value — callers treat null as "not a JUCO recruit".
const JUCO_CLASS_LABELS = {
  JuniorCollege_Sophomore: 'JC (SO)',
  JuniorCollege_Junior: 'JC (JR)',
  JuniorCollege_Senior: 'JC (SR)',
}
export function mapRecruitClassLabel(rawRecruitClass) {
  return JUCO_CLASS_LABELS[rawRecruitClass] || null
}

// Raw height is total inches (verified exact, e.g. 75 -> 6'3").
export function mapHeight(rawInches) {
  if (!rawInches || !Number.isFinite(rawInches)) return ''
  const feet = Math.floor(rawInches / 12)
  const inches = rawInches % 12
  return `${feet}'${inches}"`
}

// Raw weight is offset from actual lbs by -160 (verified across positions:
// OL raw 132-160 -> 292-320 lbs; kickers raw 26-37 -> 186-197 lbs;
// Jeremiah Smith raw 63 -> 223 lbs, close to his real ~215 lb listing).
const WEIGHT_OFFSET = 160

export function mapWeight(rawWeight) {
  if (rawWeight == null || !Number.isFinite(rawWeight)) return null
  return rawWeight + WEIGHT_OFFSET
}

// Real in-game headshots, resolved from GenericHeadAssetName against the
// bundled portrait library (public/cfb27-portraits/ — a community image
// pack, "CFB Dynasty Hub Image Data", covering both real (Unique_) and
// procedurally-generated (Generic_) players; refreshed 2026-07-27, replacing
// an earlier, smaller scrape). Two naming conventions, verified directly
// against real save values:
//   "Unique_SmithJeremiah_8726"   -> portraits/unique/8726.webp (trailing
//     number only — the save occasionally truncates a long name with a
//     literal trailing "-" the bundled files don't carry, so matching by
//     name would miss real hits; the number alone is exact and sufficient).
//   "Generic_0877_P_T0042_H_6_3"  -> portraits/generic/0877_P_T0042_H_6_3.webp
//     (the FULL string after "Generic_", verbatim — this is a specific
//     look, not just a template id; matching only the leading id would
//     silently ignore the team/tone/variation detail baked into the rest
//     of the name).
//
// Must be an ABSOLUTE url: player photos are displayed through wsrv.nl (an
// external resize proxy, see src/utils/imageProxy.js), which fetches the
// URL itself and can't resolve a path relative to this app's origin.
//
// GenericHeadAssetName's own trailing number is missing from the bundled
// library for a small fraction of Unique_ (real-player) rows. A second,
// independent numeric head id also exists on the save (PLYR_PORTRAIT) and
// checking it against the library resolves most of those misses — but
// verified concretely on a real player (Kayden Dixon-Wyatt, USC WR) that
// this fallback id is NOT reliably "the same portrait": it resolved to a
// real file, but a different person's face. Deliberately NOT used here —
// showing no photo (Player.jsx already hides a broken/missing image
// gracefully, falling back to a monogram) is preferable to risking a
// confidently-wrong face for a real player. Generic_ (procedurally-
// generated) rows hit 100% on the exact key alone regardless.
export function mapPortraitUrl(genericHeadAssetName, portraitId) {
  if (!genericHeadAssetName) return ''
  if (typeof window === 'undefined') return ''

  let relPath = null
  if (genericHeadAssetName.startsWith('Unique_')) {
    const parts = genericHeadAssetName.split('_')
    const n = parts[parts.length - 1]
    if (/^[0-9]+$/.test(n) && UNIQUE_PORTRAIT_ID_SET.has(Number(n))) {
      relPath = `/cfb27-portraits/unique/${n}.webp`
    }
  } else if (genericHeadAssetName.startsWith('Generic_')) {
    const key = genericHeadAssetName.slice('Generic_'.length)
    if (GENERIC_PORTRAIT_KEY_SET.has(key)) {
      relPath = `/cfb27-portraits/generic/${key}.webp`
    }
  }
  if (!relPath) return ''
  // The ~800MB portrait library is NOT committed to this repo (see
  // .gitignore) — it's served from a CDN so the repo stays clonable and the
  // bandwidth is free. VITE_CFB27_PORTRAIT_BASE points at that host (e.g. an
  // R2/CDN origin, no trailing slash). Falls back to this app's own origin,
  // which is what a local dev copy of public/cfb27-portraits/ uses. This
  // used to unconditionally use window.location.origin, which is correct
  // locally (Vite serves the local copy directly) but 404s in production,
  // where the portrait pack was never deployed — every player photo fell
  // back to the team-logo/silhouette placeholder. mapCoachPortraitUrl below
  // already had this fix; this one just never got it applied.
  return `${portraitBase()}${relPath}`
}

// Coach counterpart to mapPortraitUrl — same two-branch scheme, same bundled
// pack, separate manifests/folders (coach-unique/coach-generic) since coach
// asset ids are a completely separate id space from player ones. Not yet
// wired into any UI (ScoutStaffFrontPage currently uses AI-generated coach
// art instead) — this just makes the real headshot resolvable from
// Coach.GenericHeadAssetName (already extracted, see extractPlayers.cjs's
// buildCoachingStaff) whenever/wherever it's wanted.
export function mapCoachPortraitUrl(genericHeadAssetName) {
  if (!genericHeadAssetName) return ''
  if (typeof window === 'undefined') return ''

  let relPath = null
  if (genericHeadAssetName.startsWith('Unique_')) {
    const parts = genericHeadAssetName.split('_')
    const n = parts[parts.length - 1]
    if (/^[0-9]+$/.test(n) && UNIQUE_COACH_PORTRAIT_ID_SET.has(Number(n))) {
      relPath = `/cfb27-portraits/coach-unique/${n}.webp`
    }
  } else if (genericHeadAssetName.startsWith('Generic_')) {
    const key = genericHeadAssetName.slice('Generic_'.length)
    if (GENERIC_COACH_PORTRAIT_KEY_SET.has(key)) {
      relPath = `/cfb27-portraits/coach-generic/${key}.webp`
    }
  }
  if (!relPath) return ''
  // The ~800MB portrait library is NOT committed to this repo (see
  // .gitignore) — it's served from a CDN so the repo stays clonable and the
  // bandwidth is free. VITE_CFB27_PORTRAIT_BASE points at that host (e.g. an
  // R2/CDN origin, no trailing slash). Falls back to this app's own origin,
  // which is what a local dev copy of public/cfb27-portraits/ uses.
  return `${portraitBase()}${relPath}`
}

// A handful of save rows are junk/placeholder records, not real players.
// team_id 255 is the save's internal "no team assigned" sentinel for the
// uncommitted prospect pool — it shares the display name "FCS West" with a
// real, unrelated generic FCS filler team, so it must be excluded explicitly
// rather than relying on name resolution to fail.
function isValidRow(row) {
  return Boolean(
    row && row.stars !== 'Invalid' && row.height && row.first_name && row.last_name && row.team_id !== 255
  )
}

/**
 * Map one extracted save row into the app's player object shape.
 *
 * @param {object} row - one row from api/_handlers/cfb27/save-parse.js's `players` array
 * @param {object} opts
 * @param {number} opts.year - the dynasty's starting year (immutable history key)
 * @param {number} opts.pid - the pid to assign this player
 * @param {number} opts.tid - the resolved team id this player belongs to
 * @returns {object} app-schema player object
 */
// Best-effort humanizer for the save's PascalCase injury-type enum (e.g.
// 'LegQuadTear' -> 'Quad Tear', 'AnkleDislocatedSeveralGames' -> 'Ankle
// Dislocated'). Verified end-to-end against exactly one real example
// (LegQuadTear -> the in-game "Quad Tear" label, John Walker/Ohio State) —
// the leading "Leg" is dropped there because it's redundant with the more
// specific "Quad" that follows; other body-part prefixes (Hip/Shoulder/
// Ankle/Hand/Foot/Rib/Knee) are NOT verified to behave the same way and are
// left in place, so this may not match EA's exact curated text for every
// injury type. Trailing severity-tier words are stripped since they
// duplicate the separate InjurySeverity field, not the injury's name.
const INJURY_SEVERITY_SUFFIXES = ['SeveralGames', 'CoupleGames']
export function mapInjuryType(rawType) {
  if (!rawType || rawType === 'Invalid_') return null
  let s = String(rawType)
  for (const suffix of INJURY_SEVERITY_SUFFIXES) {
    if (s.endsWith(suffix)) { s = s.slice(0, -suffix.length); break }
  }
  if (s.startsWith('Leg') && s.length > 3) s = s.slice(3)
  return s.replace(/([a-z])([A-Z])/g, '$1 $2').trim()
}

export function mapExtractedRowToAppPlayer(row, { year, pid, tid }) {
  const position = mapPosition(row.position)
  const devTrait = row.dev_trait || 'Normal'
  const overall = Number.isFinite(Number(row.ovr)) ? Number(row.ovr) : 0
  const klass = mapClass(row.year, row.redshirt)
  const name = `${row.first_name || ''} ${row.last_name || ''}`.trim()
  const attrs = mapAttributes(row.ratings)

  return {
    name,
    firstName: row.first_name || '',
    lastName: row.last_name || '',
    position,
    year: klass,
    devTrait,
    jerseyNumber: row.jersey != null ? String(row.jersey) : '',
    archetype: row.archetype_name || '',
    overall,
    height: mapHeight(row.height),
    weight: mapWeight(row.weight),
    hometown: row.hometown || '',
    state: mapState(row.home_state),
    pictureUrl: mapPortraitUrl(row.generic_head_asset_name, Number(row.portrait_id)),
    isCaptain: Boolean(row.is_captain),
    isInjured: Boolean(row.is_injured),
    injuryType: row.is_injured ? mapInjuryType(row.injury_type) : null,
    injuryLength: row.is_injured && Number.isFinite(row.injury_length) ? row.injury_length : null,
    ...(Array.isArray(row.abilities) && row.abilities.length ? { abilities: row.abilities } : {}),

    pid,
    id: `player-${pid}`,
    team: tid,
    yearStarted: year,
    entryReason: 'created',
    teamsByYear: { [year]: tid },
    classByYear: { [year]: klass },
    overallByYear: overall ? { [year]: overall } : {},
    devTraitByYear: devTrait ? { [year]: devTrait } : {},
    ...(attrs ? { attributesByYear: { [year]: attrs } } : {}),
  }
}

// The save's own Team table uses a different display name than the app's
// registry for a handful of real programs (verified against a real save —
// 10 of 139 team names needed this; everything else resolves directly via
// `${team} ${team_nick}`, including Louisiana/UL Monroe now that the
// registry names match the save's own text exactly). Keyed by the save's
// exact `${team} ${team_nick}` string, valued by the app's registry name.
const TEAM_NAME_ALIASES = {
  'UConn Huskies': 'Connecticut Huskies',
  'Sam Houston Bearkats': 'Sam Houston State Bearkats',
  'NC State Wolfpack': 'North Carolina State Wolfpack',
  'UMass Minutemen': 'Massachusetts Minutemen',
  'USF Bulls': 'South Florida Bulls',
  'Miami University RedHawks': 'Miami Redhawks',
  "Hawai'i Rainbow Warriors": 'Hawaii Rainbow Warriors',
  'BYU Cougars': 'Brigham Young Cougars',
  'Delaware Blue Hens': "Delaware Fightin' Blue Hens",
  'Middle Tennessee Blue Raiders': 'Middle Tennessee State Blue Raiders',
}

// Shared by groupExtractedRowsByTid and buildRawTeamIdMap — both resolve a
// save-side team name to an app tid the same way.
function resolveTeamTid(team, teamNick, dynastyTeams) {
  const fullName = teamNick ? `${team} ${teamNick}`.trim() : team
  let tid = fullName ? getTidFromTeamName(fullName, dynastyTeams) : null
  if (tid == null && team) tid = getTidFromTeamName(team, dynastyTeams)
  if (tid == null && fullName && TEAM_NAME_ALIASES[fullName]) {
    tid = getTidFromTeamName(TEAM_NAME_ALIASES[fullName], dynastyTeams)
  }
  return tid
}

/**
 * Group extracted save rows by resolved dynasty team id, filtering out
 * invalid/junk rows and rows whose team name doesn't resolve to a known tid
 * (e.g. the save's "FCS West" placeholder entry).
 *
 * @param {object[]} rows - raw `players` array from api/_handlers/cfb27/save-parse.js
 * @param {object} dynastyTeams - the dynasty's teams object (tid -> team)
 * @returns {{ byTid: Map<number, object[]>, unresolvedTeamNames: string[] }}
 */
export function groupExtractedRowsByTid(rows, dynastyTeams) {
  const byTid = new Map()
  const unresolvedTeamNames = new Set()

  for (const row of rows) {
    if (!isValidRow(row)) continue

    const tid = resolveTeamTid(row.team, row.team_nick, dynastyTeams)

    if (tid == null) {
      if (row.team) unresolvedTeamNames.add(row.team)
      continue
    }

    if (!byTid.has(tid)) byTid.set(tid, [])
    byTid.get(tid).push(row)
  }

  return { byTid, unresolvedTeamNames: [...unresolvedTeamNames] }
}

/**
 * Build raw save team_id -> resolved app tid, from the extracted player
 * rows (each already carries team_id + team + team_nick). Team ratings,
 * coaching staff, conferences, and the schedule all key off this same raw
 * save team_id space, so this map is the single source of truth for
 * resolving them to app tids without re-deriving team names per row.
 *
 * @param {object[]} rows - raw `players` array from api/_handlers/cfb27/save-parse.js
 * @param {object} dynastyTeams - the dynasty's teams object (tid -> team)
 * @returns {Map<number, number>} raw team_id -> app tid
 */
export function buildRawTeamIdMap(rows, dynastyTeams) {
  const map = new Map()
  for (const row of rows) {
    if (row.team_id == null || row.team_id === 255 || map.has(row.team_id)) continue
    const tid = resolveTeamTid(row.team, row.team_nick, dynastyTeams)
    if (tid != null) map.set(row.team_id, tid)
  }
  return map
}

/**
 * A team's overall/offense/defense ratings, matching the app's existing
 * manual-entry `dynasty.teamRatings` shape — only ever tracked for the
 * user's own team, not opponents (verified: no per-opponent rating field
 * exists anywhere in the app today).
 *
 * @param {object} rawTeamRatings - the parse endpoint's `teamRatings` map (raw team_id -> {overall,offense,defense})
 * @param {number} rawTeamId - the save's own team_id for the team to look up
 */
export function mapTeamRatings(rawTeamRatings, rawTeamId) {
  const r = rawTeamRatings && rawTeamRatings[rawTeamId]
  if (!r) return null
  return { overall: r.overall ?? null, offense: r.offense ?? null, defense: r.defense ?? null }
}

/**
 * A team's coaching staff, matching the app's existing manual-entry
 * `dynasty.coachingStaff` shape (hcName/ocName/dcName) — same user-team-only
 * scope as mapTeamRatings.
 *
 * Deliberately does NOT resolve a headshot for any role. An earlier version
 * pulled the "Generic_" procedural coach's head through the same bundled
 * portrait library used for player photos (reasoning that the 5040-face
 * generic template pool is shared across all procedural characters
 * regardless of role) — but in practice this produced a wrong-looking face
 * for real users often enough that it was pulled entirely (user report,
 * 2026-07-25: "the coach heads we currently use... are all incorrect").
 * No photo (falls back to the team logo / Add Photo prompt) beats a
 * confidently-wrong one; users can upload their own via Coach Career.
 *
 * @param {object} rawCoachingStaff - the parse endpoint's `coachingStaff` map
 * @param {number} rawTeamId
 */
export function mapCoachingStaff(rawCoachingStaff, rawTeamId) {
  const c = rawCoachingStaff && rawCoachingStaff[rawTeamId]
  if (!c) return null
  return {
    hcName: c.headCoach?.name || null,
    hcPictureUrl: '',
    ocName: c.offensiveCoordinator?.name || null,
    ocPictureUrl: '',
    dcName: c.defensiveCoordinator?.name || null,
    dcPictureUrl: '',
  }
}

/**
 * A team's whole-league recruiting-class stats, for the "Top Classes"
 * national leaderboard — AND, since pass N, the actual named roster behind
 * those stats (recruitingClassRoster), so a team you're not coaching still
 * gets a real Commitments list instead of just the aggregate numbers. The
 * user's own detailed per-recruit BOARD (targets, interest tracking, etc.)
 * stays exactly as-is via reconcileRecruitingBoard in cfb27SaveSync.js —
 * this is separate, simpler data: who ended up committed where, for every
 * team, with no board/interest history attached. Reuses
 * calculateRecruitingClassScore (src/utils/recruitingScore.js) verbatim —
 * that function is team-agnostic and already proven (used for the user's
 * own class today) to reproduce the in-game class score, so no new formula
 * is introduced here.
 *
 * @param {object[]|undefined} recruits - parsed.leagueRecruitingClasses[rawTeamId],
 *   each a raw extractPlayers.cjs buildLeagueRecruitingClasses entry
 *   ({stars, nationalRank, nilCompensation, first_name, last_name, position,
 *   state_rank, position_rank, hometown, home_state, recruit_class,
 *   recruit_stage, generic_head_asset_name, portrait_id, height, weight,
 *   archetype_name, dev_trait})
 * @param {{national:number|null, conference:number|null}|undefined} topClassRank - parsed.topClassRanks[rawTeamId]
 */
export function mapTeamRecruitingClass(recruits, topClassRank) {
  if (!recruits && !topClassRank) return null
  // stars comes through as the save's raw enum ("FOUR_STAR", etc.), same as
  // every other recruit-star value in this pipeline — mapStars() converts
  // it to a 1-5 number before scoring/counting.
  const list = (recruits || []).map((r) => ({
    stars: mapStars(r?.stars),
    nationalRank: r?.nationalRank ?? null,
    nilCompensation: Number(r?.nilCompensation) || 0,
  }))
  const stats = { total: list.length, fiveStars: 0, fourStars: 0, threeStars: 0, twoStars: 0, oneStars: 0, totalNil: 0, score: calculateRecruitingClassScore(list) }
  for (const r of list) {
    const s = Number(r.stars) || 0
    if (s === 5) stats.fiveStars++
    else if (s === 4) stats.fourStars++
    else if (s === 3) stats.threeStars++
    else if (s === 2) stats.twoStars++
    else if (s === 1) stats.oneStars++
    stats.totalNil += r.nilCompensation
  }
  const roster = (recruits || []).map((r) => {
    const name = `${r?.first_name || ''} ${r?.last_name || ''}`.trim()
    return {
      name: name || null,
      position: mapPosition(r?.position),
      stars: mapStars(r?.stars),
      nationalRank: r?.nationalRank ?? null,
      stateRank: r?.state_rank ?? null,
      positionRank: r?.position_rank ?? null,
      hometown: r?.hometown || '',
      state: mapState(r?.home_state),
      class: mapRecruitClassLabel(r?.recruit_class),
      pictureUrl: mapPortraitUrl(r?.generic_head_asset_name, Number(r?.portrait_id)),
      height: mapHeight(r?.height),
      weight: mapWeight(r?.weight),
      archetype: r?.archetype_name || null,
      // Dev trait stays hidden here until the recruit has actually signed
      // (National Signing Day) — matching the in-game reveal rule, same
      // "don't spoil it before signing" gate buildLeagueRecruitDirectory's
      // is_signed flag exists for. A recruit the user separately scouted on
      // their OWN board can still reveal it early — that happens downstream
      // when this roster entry gets enriched with a matched real player
      // record (Recruiting.jsx/TeamYear.jsx), which carries its own
      // already-revealed devTrait independent of this gate.
      devTrait: r?.recruit_stage === 'Signed' ? (r?.dev_trait || null) : null,
    }
  }).filter((r) => r.name)
  return {
    recruitingClassRank: topClassRank?.national ?? null,
    recruitingClassConferenceRank: topClassRank?.conference ?? null,
    recruitingClassStats: stats,
    recruitingClassRoster: roster,
  }
}

/**
 * One Player of the Week honoree -> app shape. rawEntry is one of
 * parsed.playerAwards.national[week][side] /
 * parsed.playerAwards.conference[week][confName][side].
 */
export function mapPlayerOfWeekEntry(rawEntry, rawTeamIdMap) {
  if (!rawEntry) return null
  const tid = rawEntry.team_id != null ? rawTeamIdMap.get(Number(rawEntry.team_id)) : null
  return {
    firstName: rawEntry.first_name || '',
    lastName: rawEntry.last_name || '',
    name: `${rawEntry.first_name || ''} ${rawEntry.last_name || ''}`.trim(),
    position: mapPosition(rawEntry.position),
    jerseyNumber: Number.isFinite(rawEntry.jersey) ? String(rawEntry.jersey) : '',
    tid: tid ?? null,
    pictureUrl: mapPortraitUrl(rawEntry.generic_head_asset_name, rawEntry.portrait_id),
  }
}

/** One Heisman Watch entry -> app shape. rawEntry is one of parsed.heismanWatch. */
export function mapHeismanEntry(rawEntry, rawTeamIdMap) {
  if (!rawEntry) return null
  const tid = rawEntry.team_id != null ? rawTeamIdMap.get(Number(rawEntry.team_id)) : null
  return {
    rank: rawEntry.rank,
    prevRank: rawEntry.prev_rank ?? null,
    firstName: rawEntry.first_name || '',
    lastName: rawEntry.last_name || '',
    name: `${rawEntry.first_name || ''} ${rawEntry.last_name || ''}`.trim(),
    position: mapPosition(rawEntry.position),
    tid: tid ?? null,
    pictureUrl: mapPortraitUrl(rawEntry.generic_head_asset_name, rawEntry.portrait_id),
  }
}

/**
 * One National All-American / All-Conference entry -> the shape
 * AllAmericans.jsx/AllConference.jsx already read from
 * dynasty.allAmericansByYear[year].allAmericans/.allConference
 * ({player, position, class, school, schoolTid, designation}).
 */
export function mapHonorEntry(rawEntry, rawTeamIdMap, dynastyTeams) {
  if (!rawEntry) return null
  const tid = rawEntry.team_id != null ? rawTeamIdMap.get(Number(rawEntry.team_id)) : null
  const school = tid != null ? (dynastyTeams?.[tid]?.abbr ?? null) : null
  return {
    player: `${rawEntry.first_name || ''} ${rawEntry.last_name || ''}`.trim(),
    position: mapPosition(rawEntry.position),
    class: mapClass(rawEntry.year, rawEntry.redshirt),
    school,
    schoolTid: tid ?? null,
    designation: rawEntry.designation,
  }
}

/**
 * One named season award (Heisman, Maxwell, etc.) -> the per-award entry
 * shape Awards.jsx already reads from dynasty.awardsByYear[year][awardKey]
 * ({player, position, team}).
 */
export function mapAwardEntry(rawEntry, rawTeamIdMap, dynastyTeams) {
  if (!rawEntry) return null
  const tid = rawEntry.team_id != null ? rawTeamIdMap.get(Number(rawEntry.team_id)) : null
  const team = tid != null ? (dynastyTeams?.[tid]?.abbr ?? null) : null
  return {
    player: `${rawEntry.first_name || ''} ${rawEntry.last_name || ''}`.trim(),
    position: mapPosition(rawEntry.position),
    team,
  }
}

const COACH_OFFER_POSITION_LABEL = {
  HeadCoach: 'Head Coach',
  OffensiveCoordinator: 'Offensive Coordinator',
  DefensiveCoordinator: 'Defensive Coordinator',
}

/**
 * One pending job offer from another school for the user's OWN coach
 * (extractPlayers.cjs's buildCoachOffers — JobOpening.ContractOfferList ->
 * StaffPersonContractOffer, filtered to entries whose StaffPerson ref is the
 * user's own coach row). Purely a "what's happening right now" display —
 * never merged/gap-filled against a prior sync's list, since an offer that's
 * gone in the save (declined/expired/resolved) should just disappear here
 * too, not linger.
 */
export function mapCoachOffer(raw, rawTeamIdMap, dynastyTeams) {
  if (!raw) return null
  const tid = raw.rawTid != null ? rawTeamIdMap.get(Number(raw.rawTid)) : null
  const teamAbbr = tid != null ? (dynastyTeams?.[tid]?.abbr ?? null) : null
  return {
    tid: tid ?? null,
    teamAbbr,
    position: COACH_OFFER_POSITION_LABEL[raw.position] || raw.position || null,
    status: raw.status || null,
    offeredPoints: raw.offeredPoints ?? null,
    expectedPoints: raw.expectedPoints ?? null,
    length: raw.length ?? null,
  }
}

/**
 * Resolve conference membership into the `{ conferenceName: [abbr, ...] }`
 * shape createDynasty already knows how to fan out into every member team's
 * `teams[tid].byYear[year].conference` (see getConferencesWithCustomTeams's
 * usage in DynastyContext.jsx's createDynasty) — covers every team, not
 * just the user's.
 *
 * @param {object[]} rawConferences - [{ name, teamIds: number[] }] from the parse endpoint
 * @param {Map<number, number>} rawTeamIdMap - from buildRawTeamIdMap
 * @param {object} dynastyTeams
 * @returns {Object<string, string[]>}
 */
export function mapConferences(rawConferences, rawTeamIdMap, dynastyTeams) {
  const out = {}
  for (const conf of rawConferences || []) {
    const abbrs = []
    for (const rawTid of conf.teamIds || []) {
      const tid = rawTeamIdMap.get(rawTid)
      const abbr = tid != null ? dynastyTeams?.[tid]?.abbr : null
      if (abbr) abbrs.push(abbr)
    }
    if (abbrs.length) out[conf.name] = abbrs
  }
  return out
}

/**
 * Filter the full league schedule down to one team's regular-season games,
 * shaped like readScheduleFromScheduleSheet's output (sheetsService.js) so
 * it slots into the same `dynasty.schedule[]` the manual Schedule Entry flow
 * produces. CCG/bowls/CFP are entered through dedicated flows, same as that
 * function — non-regular-season weeks are dropped here too.
 *
 * @param {object[]} rawGames - `games` array from the parse endpoint
 * @param {Map<number, number>} rawTeamIdMap - from buildRawTeamIdMap
 * @param {number} userAppTid - the app tid the user is playing as
 * @param {object} dynastyTeams
 */
// The save's own generic-schedule-filler opponents (TeamIndex 255, see
// mapScheduleForTeam below) — EA's 5 real directional placeholder schools.
// The app ALREADY tracks these as real teams at fixed tids 137-141 (see
// TEAMS in teamRegistry.js / migrateFCSFiveTeams in DynastyContext.jsx),
// each with its own abbr/name/logo, and dynasty.teams is seeded with all
// 5 by default. Resolving to that real tid (instead of leaving
// opponentTid null, the previous approach) is what's REQUIRED for the
// game to render at all in tid-based views (Team View schedule,
// Dashboard schedule widget) — those do a tid lookup against
// dynasty.teams and silently drop the whole row when the tid is null,
// not just the logo. Confirmed against a real save: North Texas's Week 4
// FCS opponent was missing entirely from both schedule views until this
// tid mapping was added.
export const FCS_FILLER_NAME_TO_TID = {
  'FCS East': 137,
  'FCS Midwest': 138,
  'FCS Northwest': 139,
  'FCS West': 140,
  'FCS Southeast': 141,
}

// Real kickoff date/time off the save's own SeasonGame fields. Duplicated
// from cfb27SaveSync.js (which already imports FROM this file, so importing
// back would cycle) — verified exact against a real save: TimeOfDay 1065 ->
// "5:45 PM", matching that same game's in-game schedule screen.
function kickoffLabel(month, day) {
  if (!month || !day) return null
  const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const name = MONTH_ABBR[month - 1]
  return name ? `${name} ${day}` : null
}
function timeOfDayLabel(minutes) {
  if (!Number.isFinite(minutes)) return null
  const totalMinutes = ((minutes % 1440) + 1440) % 1440
  const h24 = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  const period = h24 >= 12 ? 'PM' : 'AM'
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12
  return `${h12}:${String(m).padStart(2, '0')} ${period}`
}
function gameDateTimeFields(g) {
  return {
    gameDateMonth: g.gameDateMonth ?? null,
    gameDateDay: g.gameDateDay ?? null,
    dayOfWeek: g.dayOfWeek || null,
    kickoffTimeMinutes: g.timeOfDayMinutes ?? null,
    dateLabel: kickoffLabel(g.gameDateMonth, g.gameDateDay),
    kickoffTimeLabel: timeOfDayLabel(g.timeOfDayMinutes),
  }
}

// The app's canonical Conference Championship slot. gameSlot() in
// DynastyContext returns 16 for a conference championship, and WeeklyScores
// navigates to week 16 for that phase — but the SAVE's own CCG week is not a
// fixed number (SeasonInfo.RegularSeasonWeekConferenceChampionship has been
// observed as both 15 and 16 across real saves). Anything that carries a raw
// save week straight through therefore lands the CCG on whatever number that
// save happened to use, which is why it has to be normalized here.
export const APP_CCG_WEEK = 16

// TeamIndex 255 is the save's "not a real opponent" sentinel. It covers EA's
// 5 directional FCS filler schools (kept — they're real schedule slots, see
// FCS_FILLER_NAME_TO_TID) but ALSO non-game calendar entries that share the
// sentinel. "Practice" is the preseason practice slot: it has no opponent, no
// score, and never resolves to a team, but it was being imported as a real
// Week 0 schedule entry with a blank logo. Beyond looking wrong, it created a
// 0-0 game record that the recap prompt's record math counted as a LOSS
// (reported from a real 12-0 dynasty whose write-up prompt read 11-1).
const NON_TEAM_SENTINEL_NAMES = new Set(['practice', 'bye', 'open', 'open date', 'off', 'none'])

/**
 * @param {number|null} [ccgWeek] - the save's own conference-championship
 *   week (SeasonInfo.conferenceChampionshipWeek). Games at this week are
 *   remapped to APP_CCG_WEEK and tagged isConferenceChampionship so they
 *   land in the app's Conf Champ slot instead of a regular-season week.
 *   Omitted (null) → no CCG normalization, previous behavior.
 */
export function mapScheduleForTeam(rawGames, rawTeamIdMap, userAppTid, dynastyTeams, ccgWeek = null) {
  const userAbbr = dynastyTeams?.[userAppTid]?.abbr
  const out = []
  // Raw save week -> the week the app actually files this game under.
  const appWeek = (w) => (ccgWeek != null && w === ccgWeek ? APP_CCG_WEEK : w)

  for (const g of rawGames || []) {
    if (g.weekType !== 'RegularSeason') continue
    const homeAppTid = rawTeamIdMap.get(g.homeTeamId)
    const awayAppTid = rawTeamIdMap.get(g.awayTeamId)
    if (homeAppTid !== userAppTid && awayAppTid !== userAppTid) continue

    const isHome = homeAppTid === userAppTid
    const opponentAppTid = isHome ? awayAppTid : homeAppTid
    const rawOpponentId = isHome ? g.awayTeamId : g.homeTeamId

    // A generic, permanently-untracked opponent (e.g. "FCS West"/"FCS
    // East") — the save's own TeamIndex 255 sentinel, but a REAL, fixed
    // schedule slot, not a still-resolving placeholder like a postseason
    // bye slot. Dropping it (the old behavior) silently undercounted a
    // real team's full season — confirmed against a real save: North
    // Texas's Week 4 game is exactly this case, and got excluded entirely,
    // showing 11/12 games instead of 12/12. Kept with a plain name and no
    // real tid (nothing to link/show a logo for) rather than dropped.
    if (rawOpponentId === 255) {
      const rawOpponentName = isHome ? g.awayTeam : g.homeTeam
      if (!rawOpponentName) continue
      // Drop the sentinel's non-game entries (practice/bye slots) while
      // keeping the real FCS filler schools — see NON_TEAM_SENTINEL_NAMES.
      if (NON_TEAM_SENTINEL_NAMES.has(String(rawOpponentName).trim().toLowerCase())) continue
      const fcsTid = FCS_FILLER_NAME_TO_TID[rawOpponentName] || null
      const fcsAbbr = fcsTid != null ? (dynastyTeams?.[fcsTid]?.abbr || null) : null
      out.push({
        week: appWeek(g.week),
        userTeam: userAbbr,
        userTeamTid: userAppTid,
        opponent: fcsAbbr || rawOpponentName,
        opponentTid: fcsTid,
        location: isHome ? 'home' : 'away',
        ...gameDateTimeFields(g),
      })
      continue
    }

    if (opponentAppTid == null) continue
    const opponentAbbr = dynastyTeams?.[opponentAppTid]?.abbr
    if (!opponentAbbr) continue

    const isCCG = ccgWeek != null && g.week === ccgWeek
    out.push({
      week: appWeek(g.week),
      userTeam: userAbbr,
      userTeamTid: userAppTid,
      opponent: opponentAbbr,
      opponentTid: opponentAppTid,
      location: isHome ? 'home' : 'away',
      // Tagged so the schedule diff files this as the app's Conference
      // Championship rather than a plain regular-season game. Without it the
      // user's own CCG either vanished (raw week 16, outside the old 0-15
      // filter) or silently became a regular Week 15 game (raw week 15) —
      // both reported as "sync didn't save the SEC Championship".
      ...(isCCG ? { isConferenceChampionship: true, gameType: 'conference_championship' } : {}),
      ...gameDateTimeFields(g),
    })
  }

  return out
    .filter((entry) => entry.week >= 0 && entry.week <= APP_CCG_WEEK)
    .sort((a, b) => a.week - b.week)
}

/**
 * Preseason Top 25 (Media Poll), shaped to match PreseasonTop25Modal's
 * saved entries ({ rank, team: abbr, tid }) exactly so it slots into
 * dynasty.preseasonRankingsByYear the same way manual entry does.
 *
 * @param {object} rawTeamRankings - the parse endpoint's `teamRankings` map (raw team_id -> rank 1-25)
 * @param {Map<number, number>} rawTeamIdMap - from buildRawTeamIdMap
 * @param {object} dynastyTeams
 */
export function mapPreseasonTop25(rawTeamRankings, rawTeamIdMap, dynastyTeams) {
  const entries = []
  for (const [rawTeamId, rank] of Object.entries(rawTeamRankings || {})) {
    const tid = rawTeamIdMap.get(Number(rawTeamId))
    const abbr = tid != null ? dynastyTeams?.[tid]?.abbr : null
    if (!abbr) continue
    entries.push({ rank: Number(rank), team: abbr, tid })
  }
  return entries.sort((a, b) => a.rank - b.rank)
}

// SeasonInfo.CurrentWeekType values -> the app's currentPhase enum. Keyed
// off `weekType`, NOT `stage` — verified against two real saves that
// `stage` is NOT a reliable phase indicator: a preseason save had
// stage==='PreSeason' (matching weekType, which is why this bug went
// unnoticed for a while), but a regular-season save had stage==='NFLSeason'
// — a value with no sensible mapping at all — while weekType correctly read
// 'RegularSeason' in both. `stage` looks like a different, unrelated
// concept (possibly reused from the game's own NFL-mode naming), not a
// second copy of the phase. 'preseason' remains the safe fallback for any
// weekType this hasn't been checked against yet.
const PHASE_MAP = {
  PreSeason: 'preseason',
  RegularSeason: 'regular_season',
  ConferenceChampionship: 'conference_championship',
  PostSeason: 'postseason',
  BowlSeason: 'postseason',
  NationalChampionship: 'postseason',
  OffSeason: 'offseason',
}

// Prefix fallback for numbered variants of a known category — CONFIRMED
// against a real save that CurrentWeekType is "BowlSeason1"/"BowlSeason2"/
// "BowlSeason3" (NOT a bare "BowlSeason"), which the exact-match PHASE_MAP
// above silently missed, falling back to 'preseason' — the exact bug that
// left a synced dynasty frozen at its last regular-season week/phase even
// after the save had moved into bowl season (the sync logic saw "preseason"
// as EARLIER than its last known phase and refused to move backwards).
// Ordered longest-prefix-first so "NationalChampionship" (which itself
// starts with nothing else here) and "ConferenceChampionship" never
// collide. Any future numbered variant of a known category self-heals
// through this instead of needing another one-off exact-match fix.
const PHASE_PREFIXES = [
  ['NationalChampionship', 'postseason'],
  ['ConferenceChampionship', 'conference_championship'],
  ['BowlSeason', 'postseason'],
  ['PostSeason', 'postseason'],
  ['RegularSeason', 'regular_season'],
  ['PreSeason', 'preseason'],
  ['OffSeason', 'offseason'],
]

function mapWeekTypeToPhase(weekType) {
  if (!weekType) return 'preseason'
  if (PHASE_MAP[weekType]) return PHASE_MAP[weekType]
  const match = PHASE_PREFIXES.find(([prefix]) => weekType.startsWith(prefix))
  return match ? match[1] : 'preseason'
}

/**
 * The save's current year/week/phase, for auto-detecting a PC-imported
 * dynasty's Starting Year/currentWeek/currentPhase instead of asking the
 * user to pick them.
 *
 * @param {object} rawSeason - `season` from the parse endpoint ({year, week,
 *   weekType, stage, regularSeasonLastWeek, conferenceChampionshipWeek})
 */
export function mapSeasonInfo(rawSeason) {
  if (!rawSeason || !Number.isFinite(rawSeason.year)) return null
  const phase = mapWeekTypeToPhase(rawSeason.weekType)
  const rawWeek = Number.isFinite(rawSeason.week) ? rawSeason.week : 0

  // CurrentWeek is ONE CONTINUOUS COUNT across the whole season (verified
  // up to 21 in a real save — RegularSeason 1-15, ConferenceChampionship at
  // 16, BowlSeason1/2/3 at 17-19+) — but the app's own week/phase engine
  // (DynastyContext.jsx's advanceWeek and the CFB27 sync) expects a
  // PHASE-RELATIVE week instead (conference championship is always week 1;
  // postseason counts 1-4/5 from the start of bowl season), or downstream
  // week/phase comparisons never actually line up. Converted using the
  // save's own boundary markers rather than a hardcoded offset, so this
  // stays correct even if a save's regular-season length ever differs from
  // this year's default (15 weeks + week-16 CCG).
  let week = rawWeek
  if (phase === 'conference_championship' && rawSeason.conferenceChampionshipWeek != null) {
    week = rawWeek - rawSeason.conferenceChampionshipWeek + 1
  } else if (phase === 'postseason') {
    // Read the bowl week directly off the save's own weekType tag
    // ("BowlSeason1"/"BowlSeason2"/...) instead of counting raw weeks
    // since the conference championship — verified against a real save
    // that there's an unaccounted-for gap week between the CCG (raw week
    // 15) and the first bowl week (raw week 17, weekType "BowlSeason1"):
    // the old rawWeek-conferenceChampionshipWeek arithmetic assumed bowls
    // start the week immediately after CCG with no gap, and came out one
    // week too high as a result — the save said "BowlSeason1" (Bowl Week
    // 1) while this produced week 2. Reading the save's own explicit
    // counter sidesteps needing to know the gap size at all, and stays
    // correct even if that gap ever changes. NationalChampionship and the
    // generic post-bowls "PostSeason" tag have no trailing digit — mapped
    // to the app's existing week 4 / week 5 convention (Layout.jsx's
    // getPhaseDisplay) instead. Falls back to the old rawWeek-based
    // formula for any unrecognized postseason weekType, so a save shaped
    // differently than expected degrades to previous behavior rather than
    // breaking outright.
    const weekType = rawSeason.weekType || ''
    const bowlMatch = /^BowlSeason(\d+)$/.exec(weekType)
    if (bowlMatch) {
      week = Number(bowlMatch[1])
    } else if (weekType.startsWith('NationalChampionship')) {
      week = 4
    } else if (weekType.startsWith('PostSeason')) {
      week = 5
    } else if (rawSeason.conferenceChampionshipWeek != null) {
      week = rawWeek - rawSeason.conferenceChampionshipWeek
    }
  }

  return {
    year: rawSeason.year,
    week: week > 0 ? week : rawWeek,
    phase,
  }
}

// Rivalry.FirstYearPlayed is an offset from 1869 (the year of the first-ever
// college football game — a fitting epoch for EA to have picked), NOT a
// literal year. Verified against a real save: Ohio State/Michigan "The Game"
// raw value 28 -> 1897 (the real first meeting's year); Iron Bowl raw 24 ->
// 1893; Clemson/Florida State raw 101 -> 1970 — all exact real-world matches.
const RIVALRY_YEAR_EPOCH = 1869

/**
 * One team's real rivals -> app shape. rawRivals is
 * parsed.leagueRivalries[rawTid] (a list of { rivalRawTid, name, formedYear }
 * for that team, already resolved by buildLeagueRivalries).
 *
 * @returns {{ rivalTid: number, name: string|null, formedYear: number|null }[]}
 */
export function mapLeagueRivalries(rawRivals, rawTeamIdMap) {
  if (!Array.isArray(rawRivals)) return []
  return rawRivals
    .map((r) => {
      const rivalTid = rawTeamIdMap.get(Number(r.rivalRawTid))
      if (rivalTid == null) return null
      return {
        rivalTid,
        name: r.name || null,
        formedYear: Number.isFinite(r.formedYear) ? RIVALRY_YEAR_EPOCH + r.formedYear : null,
      }
    })
    .filter(Boolean)
}

// PLYR_DRAFTROUND is a 6-bit field: 0-6 map to real rounds 1st-7th, 63
// (all-1s) is the "not drafted / not yet drafted this cycle" sentinel — same
// convention as the TeamIndex 255 sentinel used elsewhere in this pipeline.
const DRAFT_ROUND_LABELS = ['1st Round', '2nd Round', '3rd Round', '4th Round', '5th Round', '6th Round', '7th Round']

export function mapDraftRound(rawRound) {
  const n = Number(rawRound)
  if (!Number.isFinite(n) || n < 0 || n > 6) return null
  return DRAFT_ROUND_LABELS[n]
}

// EA's own program/school grade fields, displayed as-is (no invented
// formula) — camelCased from the save's raw field names.
export function mapSchoolGrades(raw) {
  if (!raw) return null
  return {
    academicPrestigeGrade: raw.AcademicPrestigeGrade ?? null,
    athleticFacilitiesGrade: raw.AthleticFacilitiesGrade ?? null,
    athleticFacilitiesScore: raw.AthleticFacilitiesScore ?? null,
    brandExposureGrade: raw.BrandExposureGrade ?? null,
    campusLifestyleGrade: raw.CampusLifestyleGrade ?? null,
    championshipContenderGrade: raw.ChampionshipContenderGrade ?? null,
    championshipContenderCurrentYearRank: raw.ChampionshipContenderCurrentYearRank ?? null,
    championshipContenderYearPlus1Rank: raw.ChampionshipContenderYearPlus1Rank ?? null,
    championshipContenderYearPlus2Rank: raw.ChampionshipContenderYearPlus2Rank ?? null,
    championshipContenderYearPlus3Rank: raw.ChampionshipContenderYearPlus3Rank ?? null,
    coachPrestigeGrade: raw.CoachPrestigeGrade ?? null,
    coachStabilityGrade: raw.CoachStabilityGrade ?? null,
    conferencePrestigeGrade: raw.ConferencePrestigeGrade ?? null,
    programTraditionGrade: raw.ProgramTraditionGrade ?? null,
    stadiumAtmosphereGrade: raw.StadiumAtmosphereGrade ?? null,
    proPotentialGradeDB: raw.ProPotentialGradeDB ?? null,
    proPotentialGradeDL: raw.ProPotentialGradeDL ?? null,
    proPotentialGradeK: raw.ProPotentialGradeK ?? null,
    proPotentialGradeLB: raw.ProPotentialGradeLB ?? null,
    proPotentialGradeOL: raw.ProPotentialGradeOL ?? null,
    proPotentialGradeP: raw.ProPotentialGradeP ?? null,
    proPotentialGradeQB: raw.ProPotentialGradeQB ?? null,
    proPotentialGradeRB: raw.ProPotentialGradeRB ?? null,
    proPotentialGradeTE: raw.ProPotentialGradeTE ?? null,
    proPotentialGradeWR: raw.ProPotentialGradeWR ?? null,
  }
}

// A team's own program record book — this school's Career/Game/Season
// individual-stat leaders, straight off extractPlayers.cjs's
// buildLeagueStatRecords (see that function's header comment for the save
// shape and verification). `raw` here is `leagueStatRecords.team[rawTid]`'s
// keying resolved down to just this one team's { career, game, season }
// entry arrays (each up to 9 entries — one per tracked stat type).
export function mapTeamStatRecords(leagueStatRecords, rawTid) {
  if (!leagueStatRecords || rawTid == null) return null
  const out = {}
  for (const timeframe of ['career', 'game', 'season']) {
    const entries = leagueStatRecords[timeframe]?.team?.[rawTid]
    if (entries && entries.length) out[timeframe] = entries
  }
  return Object.keys(out).length ? out : null
}
