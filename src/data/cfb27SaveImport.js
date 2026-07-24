// Maps rows extracted from a CFB 27 PC save (via api/cfb27-save-parse.js,
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

// Static manifest of the numeric ids that actually have a file in
// public/cfb27-portraits/unique/ (generated from that folder's own listing —
// regenerate by re-running the script that built cfb27UniquePortraitIds.json
// if the bundled portrait library is ever re-scraped). Used by mapPortraitUrl
// to fall back to PLYR_PORTRAIT when GenericHeadAssetName's own number has no
// file — see that function's comment for why both ids exist.
const UNIQUE_PORTRAIT_ID_SET = new Set(UNIQUE_PORTRAIT_IDS)

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

// Real in-game headshots, resolved from GenericHeadAssetName (falling back to
// PLYR_PORTRAIT) against the bundled portrait library (public/cfb27-portraits/
// — extracted from the game's own assets by the CFB27 Recruit Class Generator
// mod tool; verified 98.8%+ hit rate across the full real roster (16,257
// players), both real-player and procedurally-generated heads. The residual
// gap is a genuine, isolated hole in the third-party library itself (a
// handful of specific ids missing a file even in otherwise-dense id ranges,
// confirmed against the tool's own original source folder) — those players
// simply get no photo (same as any player without one; Player.jsx already
// hides a broken/missing image gracefully). Two naming conventions:
//   "Unique_SmithJeremiah_8726"        -> portraits/unique/8726.webp
//   "Generic_0001_P_T0000_D_1_1"       -> portraits/generic/1.webp
//
// Must be an ABSOLUTE url: player photos are displayed through wsrv.nl (an
// external resize proxy, see src/utils/imageProxy.js), which fetches the
// URL itself and can't resolve a path relative to this app's origin.
// GenericHeadAssetName's own trailing number is missing from the bundled
// library for ~9% of Unique_ (real-player) rows — the save separately stores
// a second, independent numeric head id (PLYR_PORTRAIT) for the same
// portrait, and checking it against the library resolves ~90% of those
// misses (verified against a real 16.5k-player save: 90.9% -> 98.8%
// coverage). Generic_ (procedurally-generated) rows already hit 100% on the
// primary id alone, so no fallback is needed there.
export function mapPortraitUrl(genericHeadAssetName, portraitId) {
  if (!genericHeadAssetName) return ''
  if (typeof window === 'undefined') return ''

  let relPath = null
  if (genericHeadAssetName.startsWith('Unique_')) {
    const parts = genericHeadAssetName.split('_')
    const n = parts[parts.length - 1]
    if (/^[0-9]+$/.test(n) && UNIQUE_PORTRAIT_ID_SET.has(Number(n))) {
      relPath = `/cfb27-portraits/unique/${n}.webp`
    } else if (Number.isFinite(portraitId) && UNIQUE_PORTRAIT_ID_SET.has(portraitId)) {
      relPath = `/cfb27-portraits/unique/${portraitId}.webp`
    }
  } else if (genericHeadAssetName.startsWith('Generic_')) {
    const parts = genericHeadAssetName.split('_')
    const n = parseInt(parts[1], 10)
    if (Number.isFinite(n)) relPath = `/cfb27-portraits/generic/${n}.webp`
  }
  return relPath ? `${window.location.origin}${relPath}` : ''
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
 * @param {object} row - one row from api/cfb27-save-parse.js's `players` array
 * @param {object} opts
 * @param {number} opts.year - the dynasty's starting year (immutable history key)
 * @param {number} opts.pid - the pid to assign this player
 * @param {number} opts.tid - the resolved team id this player belongs to
 * @returns {object} app-schema player object
 */
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
// 12 of 139 team names needed this; everything else resolves directly via
// `${team} ${team_nick}`). Keyed by the save's exact `${team} ${team_nick}`
// string, valued by the app's registry name.
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
  "Louisiana Ragin' Cajuns": "Lafayette Ragin' Cajuns",
  'Middle Tennessee Blue Raiders': 'Middle Tennessee State Blue Raiders',
  'UL Monroe Warhawks': 'Monroe Warhawks',
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
 * @param {object[]} rows - raw `players` array from api/cfb27-save-parse.js
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
 * @param {object[]} rows - raw `players` array from api/cfb27-save-parse.js
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
 * Also resolves each role's headshot via the same GenericHeadAssetName/
 * Portrait pair used for player portraits — but ONLY for "Generic_"
 * (procedural, non-named) coaches. Generic heads are a small fixed template
 * pool (5040 faces) the game reuses for ANY procedural character regardless
 * of role, so the bundled library covers them fully (verified against a real
 * save: 132/132 Generic_ coaches resolve to a real file). "Unique_"
 * (real-likeness, e.g. an actual named HC) coaches are deliberately left
 * without a photo instead — the bundled library was built exclusively from
 * player save data (verified: its 8,907-name source list has zero coach
 * entries), so a real coach's id just happens to collide with an unrelated
 * player's face rather than resolving to their own. Showing nothing (falls
 * back to the team logo / Add Photo prompt) beats confidently showing the
 * wrong person.
 *
 * @param {object} rawCoachingStaff - the parse endpoint's `coachingStaff` map
 * @param {number} rawTeamId
 */
export function mapCoachingStaff(rawCoachingStaff, rawTeamId) {
  const c = rawCoachingStaff && rawCoachingStaff[rawTeamId]
  if (!c) return null
  const pic = (role) => {
    if (!role?.generic_head_asset_name?.startsWith('Generic_')) return ''
    return mapPortraitUrl(role.generic_head_asset_name, role.portrait_id)
  }
  return {
    hcName: c.headCoach?.name || null,
    hcPictureUrl: pic(c.headCoach),
    ocName: c.offensiveCoordinator?.name || null,
    ocPictureUrl: pic(c.offensiveCoordinator),
    dcName: c.defensiveCoordinator?.name || null,
    dcPictureUrl: pic(c.defensiveCoordinator),
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
export function mapScheduleForTeam(rawGames, rawTeamIdMap, userAppTid, dynastyTeams) {
  const userAbbr = dynastyTeams?.[userAppTid]?.abbr
  const out = []

  for (const g of rawGames || []) {
    if (g.weekType !== 'RegularSeason') continue
    const homeAppTid = rawTeamIdMap.get(g.homeTeamId)
    const awayAppTid = rawTeamIdMap.get(g.awayTeamId)
    if (homeAppTid !== userAppTid && awayAppTid !== userAppTid) continue

    const isHome = homeAppTid === userAppTid
    const opponentAppTid = isHome ? awayAppTid : homeAppTid
    if (opponentAppTid == null) continue
    const opponentAbbr = dynastyTeams?.[opponentAppTid]?.abbr
    if (!opponentAbbr) continue

    out.push({
      week: g.week,
      userTeam: userAbbr,
      userTeamTid: userAppTid,
      opponent: opponentAbbr,
      opponentTid: opponentAppTid,
      location: isHome ? 'home' : 'away',
    })
  }

  return out
    .filter((entry) => entry.week >= 0 && entry.week <= 15)
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
// weekType this hasn't been checked against yet (conference championship/
// bowl/CFP/offseason — only PreSeason and RegularSeason are confirmed).
const PHASE_MAP = {
  PreSeason: 'preseason',
  RegularSeason: 'regular_season',
  ConferenceChampionship: 'conference_championship',
  PostSeason: 'postseason',
  BowlSeason: 'postseason',
  NationalChampionship: 'postseason',
  OffSeason: 'offseason',
}

/**
 * The save's current year/week/phase, for auto-detecting a PC-imported
 * dynasty's Starting Year/currentWeek/currentPhase instead of asking the
 * user to pick them.
 *
 * @param {object} rawSeason - `season` from the parse endpoint ({year, week, weekType, stage})
 */
export function mapSeasonInfo(rawSeason) {
  if (!rawSeason || !Number.isFinite(rawSeason.year)) return null
  return {
    year: rawSeason.year,
    week: Number.isFinite(rawSeason.week) ? rawSeason.week : 0,
    phase: PHASE_MAP[rawSeason.weekType] || 'preseason',
  }
}
