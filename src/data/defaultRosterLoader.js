// Lazy-loads the bundled per-team default rosters
// (src/data/defaultRosters/{tid}.json) and shapes each player into an app
// player object (teamsByYear / classByYear / overallByYear / devTraitByYear,
// entryReason: 'created'). It mirrors saveRoster()'s new-player shape with one
// deliberate exception: it does NOT stamp a `transfer_in` arrival movement —
// these are the dynasty's STARTING roster, not portal transfers, so the player
// page must not badge them all "Portal Transfer".
//
// import.meta.glob keeps every team file in its own lazy chunk. The
// single-team path (buildDefaultRosterPlayers) fetches only the user's team
// JSON at dynasty-creation time; the whole-country path
// (buildAllDefaultRosterPlayers, cfb27 only) fetches every team's chunk in
// parallel so a CFB 27 dynasty is fully rostered from day one.
const rosterFiles = import.meta.glob('./defaultRosters/*.json')
// CFB 27 launch rosters carry the full per-player attribute set (parsed from the
// CFB27 Player Ratings workbook). Selected only for cfb27 dynasties; every team
// is its own lazy chunk.
const cfb27RosterFiles = import.meta.glob('./cfb27Rosters/*.json')

// Pick the right glob + path prefix for an edition. cfb27 dynasties read the
// attribute-rich launch rosters; everything else reads the base set.
const filesForEdition = (edition) =>
  edition === 'cfb27'
    ? { files: cfb27RosterFiles, prefix: './cfb27Rosters/' }
    : { files: rosterFiles, prefix: './defaultRosters/' }

// Fetch one team's raw bundled roster ({ players: [...] }) or null when no file
// exists for that tid (teambuilder/custom team, or an unrostered team). For
// cfb27 it prefers the launch roster but falls back to the base file so a team
// that only exists in the base set still seeds.
async function loadRosterData(numTid, edition) {
  const cfb27Loader = edition === 'cfb27' ? cfb27RosterFiles[`./cfb27Rosters/${numTid}.json`] : null
  const loader = cfb27Loader || rosterFiles[`./defaultRosters/${numTid}.json`]
  if (!loader) return null
  try {
    const mod = await loader()
    return mod?.default || mod
  } catch {
    return null
  }
}

// Shape one raw bundled player record into an app player object. `pid` is the
// already-resolved unique id (callers own pid allocation so a single team and a
// whole-country seed can share this mapping without re-deriving ids).
function shapeRosterPlayer(p, numTid, year, pid) {
  // The sheet flow stores the player's class in `year`; mirror that.
  const klass = p.class || p.year || 'Fr'
  // readRosterFromRosterSheet defaults a blank dev trait to 'Normal'.
  const devTrait = p.devTrait || 'Normal'
  const overall = Number.isFinite(Number(p.overall)) ? Number(p.overall) : 0
  const name = (p.name || `${p.firstName || ''} ${p.lastName || ''}`).trim()
  // CFB 27 launch rosters ship a per-player attribute map. Seed it into the
  // starting season so the player page / editor Attributes tabs show ratings
  // from day one. Other editions have no attributes here (left empty).
  const attrs = p.attributes && typeof p.attributes === 'object' && Object.keys(p.attributes).length
    ? p.attributes
    : null

  return {
    // --- editable fields (mirror readRosterFromRosterSheet row shape) ---
    name,
    firstName: p.firstName || '',
    lastName: p.lastName || '',
    position: p.position || 'QB',
    year: klass,
    devTrait,
    jerseyNumber: p.jerseyNumber || '',
    archetype: p.archetype || '',
    overall,
    height: p.height || '',
    weight: p.weight != null ? p.weight : null,
    hometown: p.hometown || '',
    state: p.state || '',
    pictureUrl: '',
    // abilities are bonus data the sheet flow doesn't capture — keep them.
    ...(Array.isArray(p.abilities) && p.abilities.length ? { abilities: p.abilities } : {}),

    // --- identity + immutable history (mirror saveRoster new-player path) ---
    pid,
    id: `player-${pid}`,
    team: numTid,
    yearStarted: year,
    entryReason: 'created',
    teamsByYear: { [year]: numTid },
    classByYear: { [year]: klass },
    overallByYear: overall ? { [year]: overall } : {},
    devTraitByYear: devTrait ? { [year]: devTrait } : {},
    ...(attrs ? { attributesByYear: { [year]: attrs } } : {}),
    // No arrival movement. These are the dynasty's STARTING roster, not
    // portal transfers — stamping a `transfer_in` arrival (as saveRoster's
    // sheet path does for newly-typed players) made the player page badge
    // EVERY seeded player "Portal Transfer". `entryReason: 'created'` +
    // a single starting-year team entry is all an initial-roster player
    // needs; the player page shows no arrival badge for it.
  }
}

// Keep only raw records that carry a name (mirrors the original filter).
const isNamedPlayer = (p) => p && (p.name || p.firstName || p.lastName)

/**
 * Build app-schema player objects for a SINGLE team's bundled default roster.
 *
 * @param {number|string} tid    - team id whose roster to load
 * @param {number}        year    - the dynasty's start year (immutable history key)
 * @param {number}        startPID - first pid to assign (createDynasty starts at 1)
 * @param {string|null}   edition - edition key; 'cfb27' loads the attribute-rich
 *                                   launch rosters, anything else the base set
 * @returns {Promise<Array>} player objects, or [] if no bundled roster exists
 */
export async function buildDefaultRosterPlayers(tid, year, startPID = 1, edition = null) {
  const numTid = Number(tid)
  if (!Number.isFinite(numTid)) return []

  const data = await loadRosterData(numTid, edition)
  if (!data) return [] // teambuilder/custom team, or no bundled roster

  const src = Array.isArray(data?.players) ? data.players : []
  let pid = startPID
  return src.filter(isNamedPlayer).map((p) => shapeRosterPlayer(p, numTid, year, pid++))
}

/**
 * Build app-schema player objects for EVERY team that ships a bundled roster
 * for this edition — the whole-country seed used when a CFB 27 dynasty is
 * created, so all rosters (not just the user's) are filled in from day one.
 *
 * Rules:
 *  - Only seeds tids that BOTH have a bundled roster file AND exist in this
 *    dynasty's `teams` registry — so we never create orphan players for a team
 *    the dynasty doesn't know about.
 *  - Skips custom/teambuilder slots: their bundled file is the REPLACED team's
 *    roster, not the custom team's, so seeding it would attach the wrong
 *    players (matches the single-team path's isCustom skip).
 *  - pids are globally unique and contiguous, assigned in ascending-tid order
 *    starting at startPID, so createDynasty's `nextPID = length + 1` still holds.
 *
 * Files load in PARALLEL (each is its own lazy chunk); shaping + pid assignment
 * then runs deterministically in tid order, independent of network timing.
 *
 * @param {Object}      teams    - dynasty teams map (tid-keyed); gates which tids seed
 * @param {number}      year     - the dynasty's start year
 * @param {number}      startPID  - first pid to assign
 * @param {string|null} edition   - edition key ('cfb27' for the launch rosters)
 * @returns {Promise<Array>} player objects across all seeded teams
 */
export async function buildAllDefaultRosterPlayers(teams, year, startPID = 1, edition = null) {
  const { files, prefix } = filesForEdition(edition)

  // tids that have a bundled file, ascending, limited to teams present in this
  // dynasty's registry and not custom/teambuilder slots.
  const tids = Object.keys(files)
    .map((path) => Number(path.slice(prefix.length).replace(/\.json$/, '')))
    .filter((t) => Number.isFinite(t) && teams?.[t] && !teams[t].isCustom)
    .sort((a, b) => a - b)

  // Load every team's raw data in parallel; preserve tid order for pid stability.
  const raws = await Promise.all(tids.map((t) => loadRosterData(t, edition)))

  const players = []
  let pid = startPID
  tids.forEach((numTid, i) => {
    const src = Array.isArray(raws[i]?.players) ? raws[i].players : []
    for (const p of src) {
      if (!isNamedPlayer(p)) continue
      players.push(shapeRosterPlayer(p, numTid, year, pid++))
    }
  })
  return players
}
