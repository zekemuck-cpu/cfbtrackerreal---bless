// Lazy-loads the bundled per-team default rosters
// (src/data/defaultRosters/{tid}.json) and shapes each player into the
// SAME object a manually-entered roster produces via saveRoster() — so an
// auto-seeded roster is indistinguishable from one entered through the
// Google-Sheet flow (same teamsByYear / classByYear / overallByYear /
// devTraitByYear / movementByYear, same entryReason).
//
// import.meta.glob keeps every team file in its own lazy chunk, so only
// the user's team JSON is fetched at dynasty-creation time — not the full
// 4.3 MB of all 136 teams.
const rosterFiles = import.meta.glob('./defaultRosters/*.json')

/**
 * Build app-schema player objects for a team's bundled default roster.
 *
 * @param {number|string} tid    - team id whose roster to load
 * @param {number}        year    - the dynasty's start year (immutable history key)
 * @param {number}        startPID - first pid to assign (createDynasty starts at 1)
 * @returns {Promise<Array>} player objects, or [] if no bundled roster exists
 */
export async function buildDefaultRosterPlayers(tid, year, startPID = 1) {
  const numTid = Number(tid)
  if (!Number.isFinite(numTid)) return []

  const loader = rosterFiles[`./defaultRosters/${numTid}.json`]
  if (!loader) return [] // teambuilder/custom team, or no bundled roster

  let data
  try {
    const mod = await loader()
    data = mod?.default || mod
  } catch {
    return []
  }

  const src = Array.isArray(data?.players) ? data.players : []
  let pid = startPID

  return src
    .filter(p => p && (p.name || p.firstName || p.lastName))
    .map((p) => {
      const thisPid = pid++
      // The sheet flow stores the player's class in `year`; mirror that.
      const klass = p.class || p.year || 'Fr'
      // readRosterFromRosterSheet defaults a blank dev trait to 'Normal'.
      const devTrait = p.devTrait || 'Normal'
      const overall = Number.isFinite(Number(p.overall)) ? Number(p.overall) : 0
      const name = (p.name || `${p.firstName || ''} ${p.lastName || ''}`).trim()

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
        pid: thisPid,
        id: `player-${thisPid}`,
        team: numTid,
        yearStarted: year,
        entryReason: 'created',
        teamsByYear: { [year]: numTid },
        classByYear: { [year]: klass },
        overallByYear: overall ? { [year]: overall } : {},
        devTraitByYear: devTrait ? { [year]: devTrait } : {},
        movementByYear: {
          [year]: { type: 'arrival', arrival: 'transfer_in', fromTid: null },
        },
      }
    })
}
