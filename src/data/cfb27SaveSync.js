// Reconciliation logic for syncing an ALREADY-IN-PROGRESS dynasty against a
// newer CFB27 save snapshot (as opposed to cfb27SaveImport.js, which only
// ever creates a brand-new dynasty). Pure, side-effect-free — the actual
// Firestore/IndexedDB writes live in DynastyContext.jsx's
// syncDynastyFromCFB27Save, which calls into these functions and then writes
// only what actually changed.
//
// Conflict rule (decided with the user): the save always wins. Any field the
// save has a value for overwrites the tracked value unconditionally. The only
// real "smart" logic needed is IDENTITY MATCHING (which save row is which
// already-tracked player) and computing a MINIMAL diff so a sync stays fast.
//
// Match key: `asset_name` (PLYR_ASSETNAME/AssetName), persisted onto matched
// players as `cfb27AssetName` so every sync after the first is a cheap map
// lookup. Verified structurally stable (it's literally embedded in the
// player's own portrait asset name — see extractPlayers.cjs's
// buildRecruitingBoard comment) but NOT yet verified across two real saves
// separated by actual gameplay — the first sync against a given dynasty
// should be treated as the trial run for that assumption. Players with no
// `cfb27AssetName` yet (console-created, or pre-dating this feature) fall
// back to the same normalized-name+team match `saveRoster` already uses.
//
// Known limitation, verified (not hypothetical) against a real 16,257-player
// save: `asset_name` is very-nearly-but-not-quite globally unique — that
// save had exactly one collision (two different players on two different
// teams sharing an identical asset_name, evidently a save-side id-recycling
// glitch, not a real transfer). A collision means both rows match the same
// tracked pid and whichever's patch is applied last wins — a ~1-in-16,000
// event in the one save this has been checked against, not worth a
// disambiguation pass for.
//
// Second verified limitation: ~25% of a real save's player rows (4,101 of
// 16,257) have no asset_name at all — but every one of them, in the save
// checked, belonged to "FCS West", a single placeholder bucket the game uses
// for simulated-only non-tracked programs, not a real roster. Those rows
// fall back to name+team matching, where a duplicate name WITHIN that one
// giant bucket can double-match. No such gap or name collision was found on
// any real FBS team (spot-checked Ohio State: 0 missing asset_names, 0
// duplicate names) — this is a placeholder-team quirk, not a real-roster one.
import {
  mapExtractedRowToAppPlayer,
  groupExtractedRowsByTid,
  buildRawTeamIdMap,
  mapTeamRatings,
  mapCoachingStaff,
  mapTeamRecruitingClass,
  mapPlayerOfWeekEntry,
  mapHeismanEntry,
  mapPreseasonTop25,
  mapScheduleForTeam,
  APP_CCG_WEEK,
  mapSeasonInfo,
  mapPosition,
  mapClass,
  mapHeight,
  mapWeight,
  mapState,
  mapPortraitUrl,
  mapAttributes,
  mapStars,
  mapLeagueRivalries,
  mapRecruitClassLabel,
  mapDraftRound,
  mapSchoolGrades,
  mapTeamStatRecords,
  mapHonorEntry,
  mapAwardEntry,
  mapCoachOffer,
  FCS_FILLER_NAME_TO_TID,
} from './cfb27SaveImport'
import { attributeNamesFor } from '../utils/recruitAttributes'
import { getCFPGameId, CFP_BRACKET_SLOTS } from './cfpConstants'

function normalizedNameTeamKey(name, tid) {
  const n = (name || '').toLowerCase().trim()
  if (!n || tid == null) return null
  return `${n}::${tid}`
}

function isValidRow(row) {
  return Boolean(row && row.stars !== 'Invalid' && row.height && row.first_name && row.last_name)
}

// Parses the app's "6'2\"" height string into total inches for comparison.
function parseHeightInches(heightStr) {
  const m = /^(\d+)'(\d+)"$/.exec(heightStr || '')
  return m ? Number(m[1]) * 12 + Number(m[2]) : null
}

// A same-named dangling recruit record is only ever a LAST-resort candidate
// (see the call site) — before trusting a pure name match, corroborate it
// against everything else this dynasty already knows about that recruit:
// their expected enrollment year, height, hometown, weight, and any
// attributes the recruiting board revealed pre-signing. Each check only
// applies when BOTH sides actually have the data (a recruit who was never
// scouted has no attributes to compare, and that's fine — it just means
// one less signal, not an automatic fail) but ANY hard contradiction on a
// check that DOES have data on both sides rejects the match outright.
//  1. Year: a HS/JUCO signee's very first real roster row appears the
//     season right after their signing class year (targetYear + 1) — a
//     small +1-year grace window covers a skipped sync, but a name match a
//     decade later is almost certainly a different, unrelated real person.
//  2. Height: doesn't change after signing — an exact match once both sides
//     have one.
//  3. Hometown: doesn't change either — exact match on both city and state
//     once both sides have them (state included specifically because two
//     unrelated recruits can share a common city name in different
//     states, e.g. two "Columbus" hometowns).
//  4. Weight: allowed to fluctuate a real amount (an offseason of
//     training) without failing the match, but a wild swing suggests a
//     different body.
//  5. Attributes: recruiting-board attributes are the SAME "key 10" the
//     in-game scouting screen reveals — real development growth between
//     signing and arrival is expected, so this tolerates normal drift and
//     only rejects a match where the numbers are simply incompatible.
function isPlausibleRecruitLink(recruitRecord, mappedRow, syncYear) {
  const targetYear = Number(recruitRecord.targetYear)
  if (!Number.isFinite(targetYear)) return false
  const yearsSinceTarget = syncYear - targetYear
  if (yearsSinceTarget < 1 || yearsSinceTarget > 2) return false

  const recruitInches = parseHeightInches(recruitRecord.height)
  const rowInches = parseHeightInches(mappedRow.height)
  if (recruitInches != null && rowInches != null && recruitInches !== rowInches) return false

  const recruitHometown = (recruitRecord.hometown || '').trim().toLowerCase()
  const rowHometown = (mappedRow.hometown || '').trim().toLowerCase()
  if (recruitHometown && rowHometown && recruitHometown !== rowHometown) return false
  const recruitState = (recruitRecord.state || '').trim().toUpperCase()
  const rowState = (mappedRow.state || '').trim().toUpperCase()
  if (recruitState && rowState && recruitState !== rowState) return false

  if (recruitRecord.weight != null && mappedRow.weight != null) {
    if (Math.abs(recruitRecord.weight - mappedRow.weight) > 25) return false
  }

  const recruitAttrs = recruitRecord.attributes
  const rowAttrs = mappedRow.attributesByYear?.[syncYear]
  if (recruitAttrs && rowAttrs) {
    const keys = Object.keys(recruitAttrs).filter((k) => rowAttrs[k] != null)
    if (keys.length) {
      const avgDiff = keys.reduce((sum, k) => sum + Math.abs(recruitAttrs[k] - rowAttrs[k]), 0) / keys.length
      if (avgDiff > 12) return false
    }
  }

  return true
}

// Most recent teamsByYear entry strictly before `beforeYear` — a player's
// last known team/year before this sync, used to detect transfers and to
// classify a departure (graduated vs. still-eligible) off their last known
// class rather than assuming the sync year's (nonexistent) one.
function getLastKnownStint(player, beforeYear) {
  const years = Object.keys(player.teamsByYear || {})
    .map(Number)
    .filter((y) => Number.isFinite(y) && y < beforeYear)
    .sort((a, b) => b - a)
  if (!years.length) return null
  const year = years[0]
  return { year, tid: player.teamsByYear[year], klass: player.classByYear?.[year] || null }
}

function alreadyHasMoreSpecificDeparture(player, year) {
  const entry = player.movementByYear?.[year]
  return Boolean(entry && entry.type === 'departure')
}

// A repeat sync against an unchanged save would otherwise re-patch every
// single tracked player every time (each patch recomputes the SAME values) —
// exactly the "full re-seed every time" cost the whole point of diffing was
// to avoid. Skip queuing a write when nothing in the patch actually differs
// from what's already there.
function isNoOpPlayerPatch(existing, patch, year) {
  // year/overall/devTrait included so a top-level mirror already left stale
  // by a pre-fix sync (drifted from its own byYear[year] entry, even though
  // that byYear entry itself isn't changing THIS sync) still gets corrected
  // on the very next sync, rather than only self-healing whenever that
  // player's byYear value next happens to change for an unrelated reason.
  // pictureUrl included so a player whose photo was empty/wrong on an
  // earlier, less-complete sync (e.g. before a portrait-resolution fix
  // landed) still gets it corrected on the next sync — without this, a
  // player whose OTHER fields are stable (no name/team/OVR change, common
  // for a bench/CPU player) has its ENTIRE patch — pictureUrl included —
  // thrown away as a no-op, so a fixed-but-never-applied photo can never
  // self-heal no matter how many times you re-sync.
  const fields = ['name', 'firstName', 'lastName', 'position', 'jerseyNumber', 'archetype', 'height', 'weight', 'hometown', 'state', 'team', 'cfb27AssetName', 'year', 'overall', 'devTrait', 'pictureUrl', 'isCaptain', 'isInjured', 'injuryType', 'injuryLength']
  for (const f of fields) {
    if ((existing[f] ?? null) !== (patch[f] ?? null)) return false
  }
  if ((existing.teamsByYear?.[year] ?? null) !== (patch.teamsByYear?.[year] ?? null)) return false
  if ((existing.classByYear?.[year] ?? null) !== (patch.classByYear?.[year] ?? null)) return false
  if ((existing.overallByYear?.[year] ?? null) !== (patch.overallByYear?.[year] ?? null)) return false
  if ((existing.devTraitByYear?.[year] ?? null) !== (patch.devTraitByYear?.[year] ?? null)) return false
  if (patch.attributesByYear) {
    const before = JSON.stringify(existing.attributesByYear?.[year] || null)
    const after = JSON.stringify(patch.attributesByYear[year] || null)
    if (before !== after) return false
  }
  if (patch.movementByYear) return false // a transfer stamp is never a no-op
  return true
}

/**
 * Decides a departed player's movementByYear departure reason. Pulled out of
 * reconcilePlayers' departures loop as its own pure function so it can be
 * unit-tested directly — the loop's surrounding state (team resolution,
 * dangling-recruit matching, etc.) isn't needed to exercise this one
 * decision. Precedence: a real draft round from the save (definitive) beats
 * the save's own LeavingPlayer projection (real transfer reason / real
 * graduation flag) beats the Sr-vs-not heuristic (last resort, only reached
 * when LeavingPlayer has no resolvable entry for this player — e.g. its
 * LeaveType was an enum value this schema has no name for; see
 * extractPlayers.cjs's LEAVE_TYPE_MAP comment).
 *
 * @param {object} params
 * @param {number|null} params.draftRound
 * @param {{category:'transfer'|'draft'|'graduate', reason:string|null}|null|undefined} params.leaving
 * @param {string} params.lastClass
 * @returns {{departure: 'pro_draft'|'transfer_out'|'graduated', departureReason: string|null}}
 */
export function resolveDepartureReason({ draftRound, leaving, lastClass }) {
  const departure = draftRound
    ? 'pro_draft'
    : leaving?.category === 'transfer' ? 'transfer_out'
    : leaving?.category === 'graduate' ? 'graduated'
    : (/Sr$/.test(lastClass || '') ? 'graduated' : 'pro_draft')
  const departureReason = !draftRound && leaving?.category === 'transfer' ? leaving.reason : null
  return { departure, departureReason }
}

/**
 * Reconcile one save's whole-league player rows against the dynasty's
 * currently-tracked players.
 *
 * @param {object[]} rows - raw `players` array from the save parse
 * @param {object[]} existingPlayers - dynasty.players (or the loaded subcollection)
 * @param {object} opts
 * @param {number} opts.year - the dynasty's current year (sync always targets "now")
 * @param {object} opts.dynastyTeams - dynasty.teams (tid -> team), for name resolution
 * @returns {{
 *   toUpdate: Array<{pid:number, patch:object, name:string}>,
 *   toCreate: object[],
 *   departures: Array<{pid:number, patch:object, name:string}>,
 *   unresolvedTeamNames: string[],
 *   stats: {updated:number, arrivals:number, departures:number, transfers:number}
 * }}
 */
export function reconcilePlayers(rows, existingPlayers, { year, dynastyTeams, leavingPlayers }) {
  // Keyed by cfb27AssetName — the save's own real "why is this player
  // projected to leave" data (extractPlayers.cjs's buildLeavingPlayers,
  // reading the LeavingPlayer table), used below to replace the departures
  // loop's Sr-vs-not guess with the save's real transfer sub-reason
  // ("Pro Potential", "Brand Exposure", etc.) or graduation flag wherever
  // it's available. Verified against a real save: matches the in-game
  // "Players Leaving" screen's Reason column exactly for transfers.
  const leavingByAssetName = new Map((leavingPlayers || []).map((lp) => [lp.assetName, lp]))

  const { byTid, unresolvedTeamNames } = groupExtractedRowsByTid(rows, dynastyTeams)

  // Whole, UNFILTERED row list keyed by asset_name — a player who left the
  // active roster this sync (drafted/graduated) no longer appears in `byTid`
  // (grouped by CURRENT team), but PLYR_DRAFTROUND lives on the player row
  // regardless of current team assignment, so a departed player's real draft
  // round can still be looked up here.
  const rowsByAssetName = new Map()
  for (const row of rows) {
    if (row.asset_name) rowsByAssetName.set(row.asset_name, row)
  }

  // existingByAssetName keeps every candidate per asset_name, not just the
  // last one written — asset_name is verified NOT globally unique (a real
  // save had an exact cross-team collision: two different real players, two
  // different real teams, same asset_name — see this file's header comment).
  // A flat map would let whichever candidate is iterated last in
  // existingPlayers silently steal the OTHER player's identity on every
  // subsequent sync (confirmed: this is what made a real tracked player
  // vanish from their team — their pid got overwritten with the OTHER
  // colliding player's data, and their own pid then read as unmatched and
  // got flagged as a departure). Resolved per-row below by preferring the
  // candidate whose own tracked team matches the row's team.
  const existingByAssetName = new Map()
  const existingByNameTeam = new Map()
  for (const p of existingPlayers) {
    if (p.cfb27AssetName) {
      const arr = existingByAssetName.get(p.cfb27AssetName) || []
      arr.push(p)
      existingByAssetName.set(p.cfb27AssetName, arr)
    } else {
      const key = normalizedNameTeamKey(p.name, p.team)
      if (key) existingByNameTeam.set(key, p)
    }
  }

  const matchedPids = new Set()
  const toUpdate = []
  const toCreate = []
  let transferCount = 0

  for (const [tid, teamRows] of byTid) {
    for (const row of teamRows) {
      const assetName = row.asset_name || null
      const name = `${row.first_name || ''} ${row.last_name || ''}`.trim()
      // Computed once up front (pid filled in below once `existing` is
      // resolved) so the dangling-recruit plausibility check below and the
      // patch-building further down never risk mapping the same row twice
      // with different results.
      const mapped = mapExtractedRowToAppPlayer(row, { year, pid: null, tid })
      let existing = null
      const assetCandidates = assetName ? existingByAssetName.get(assetName) : null
      if (assetCandidates?.length) {
        // Genuine save-side collision (verified, not hypothetical — see this
        // file's header comment: two different real players on two
        // different real teams sharing one asset_name). Name is the
        // strongest available signal — the row's own real name — checked
        // BEFORE team, since team can legitimately differ for a real
        // transfer. Deliberately NO "just take candidates[0]" fallback: a
        // single-candidate list does NOT mean this row is that candidate —
        // confirmed this exact gap in production: when only ONE side of a
        // two-player collision had ever been tracked, a blind single-
        // candidate match assigned BOTH save rows to that one pid, and
        // whichever row was processed last (map iteration order, not
        // anything meaningful) permanently overwrote the tracked player's
        // identity with the OTHER real person's data — repeatedly, on every
        // sync. Falling through to unmatched (below) when name/team both
        // disagree is strictly safer than guessing: it risks an extra
        // create/departure pair for a genuine rename, never a silent
        // identity swap of an unrelated real player.
        const normName = name.toLowerCase().trim()
        existing = assetCandidates.find((c) => (c.name || '').toLowerCase().trim() === normName)
          || assetCandidates.find((c) => Number(c.teamsByYear?.[year] ?? c.team) === Number(tid))
          || null
      }
      if (!existing) existing = existingByNameTeam.get(normalizedNameTeamKey(name, tid))
      // A recruit this dynasty's own team once scouted/offered, who ended up
      // signing with someone else, has no cfb27AssetName yet (a Recruit row
      // very commonly has an empty asset_name — see reconcileRecruitingBoard's
      // header comment — it only gets a real one once truly "created" as a
      // signed character) and sits with team:-1 forever, since only a signee
      // of THIS dynasty's own team ever gets team/teamsByYear set (again see
      // reconcileRecruitingBoard). Without this fallback, that exact same
      // real person shows up here as a brand-new arrival on their new team,
      // leaving the original recruit-board profile frozen forever at
      // team:-1 while an entirely separate, unlinked pid tracks their real
      // career — so clicking through from an old recruiting class to "see
      // where they ended up" finds nothing. Matching by name alone against
      // ONLY a still-dangling (team:-1, isTarget) record is safe here
      // specifically because it's the LAST resort, after both stronger
      // matches (asset name, name+team) already failed — it can only ever
      // upgrade an inert placeholder into a real tracked player, never steal
      // identity from an already-matched real one. A name match alone is
      // still too weak on its own though (this dynasty's own real save data
      // has 25+ confirmed same-name pairs among unrelated players), so it
      // additionally has to survive isPlausibleRecruitLink's year/height/
      // weight/attribute corroboration before it's trusted.
      if (!existing) {
        const danglingRecruit = existingByNameTeam.get(normalizedNameTeamKey(name, -1))
        if (danglingRecruit?.isTarget && isPlausibleRecruitLink(danglingRecruit, mapped, year)) {
          existing = danglingRecruit
        }
      }

      if (existing) {
        matchedPids.add(existing.pid)
        mapped.pid = existing.pid
        mapped.id = `player-${existing.pid}`
        const lastStint = getLastKnownStint(existing, year)
        const isTransfer = lastStint && Number(lastStint.tid) !== Number(tid)

        const patch = {
          cfb27AssetName: assetName || existing.cfb27AssetName || null,
          name: mapped.name,
          firstName: mapped.firstName,
          lastName: mapped.lastName,
          position: mapped.position,
          jerseyNumber: mapped.jerseyNumber,
          archetype: mapped.archetype,
          height: mapped.height,
          weight: mapped.weight,
          hometown: mapped.hometown,
          state: mapped.state,
          // Always take the freshly-mapped value, even when it's empty —
          // falling back to existing.pictureUrl here would silently keep a
          // stale, previously-wrong photo (e.g. one sourced from a since-
          // removed fallback) forever, since a corrected "no reliable match"
          // result could never overwrite it.
          pictureUrl: mapped.pictureUrl,
          isCaptain: mapped.isCaptain,
          isInjured: mapped.isInjured,
          injuryType: mapped.injuryType,
          injuryLength: mapped.injuryLength,
          team: tid,
          // Top-level mirrors, kept in lockstep with the per-year maps below
          // for the CURRENT year specifically. migrateDynastyV2.js's
          // needsV2Migration() explicitly checks these against
          // classByYear/overallByYear/devTraitByYear[currentYear] and flags
          // any disagreement as migration debt — leaving these out here
          // meant a normal OVR/class change from a routine sync (near-
          // guaranteed for SOME player across a whole league every week)
          // silently reintroduced that exact drift, so the migration
          // prompt kept coming back even right after migrating.
          year: mapped.year,
          overall: mapped.overall,
          devTrait: mapped.devTrait,
          teamsByYear: { ...(existing.teamsByYear || {}), [year]: tid },
          classByYear: { ...(existing.classByYear || {}), [year]: mapped.year },
          overallByYear: { ...(existing.overallByYear || {}), [year]: mapped.overall },
          devTraitByYear: { ...(existing.devTraitByYear || {}), [year]: mapped.devTrait },
          ...(mapped.attributesByYear
            ? { attributesByYear: { ...(existing.attributesByYear || {}), [year]: mapped.attributesByYear[year] } }
            : {}),
        }

        if (isTransfer) {
          transferCount += 1
          const movementByYear = { ...(existing.movementByYear || {}) }
          // Backdate a departure onto their last tracked year at the old
          // team, unless that year already has something more specific
          // (e.g. a manually-recorded draft/graduation) — never downgrade.
          if (!alreadyHasMoreSpecificDeparture(existing, lastStint.year)) {
            movementByYear[lastStint.year] = { type: 'departure', departure: 'transfer_out', toTid: tid }
          }
          movementByYear[year] = { type: 'arrival', arrival: 'transfer_in', fromTid: lastStint.tid }
          patch.movementByYear = movementByYear
        } else if (alreadyHasMoreSpecificDeparture(existing, year)) {
          // This row is definitive, contradicting proof the player is on a
          // real roster THIS year — clear a stale departure stamp for this
          // exact year rather than leaving it (rosterProjection.js's
          // departedBy() excludes anyone with a departure stamp for the
          // year, which is exactly how a player can keep vanishing from
          // roster/depth-chart views even after correctly re-matching: the
          // match itself was never the problem on a later sync, an old
          // wrong stamp from an earlier one was). Save always wins — an
          // in-season stamp this contradicted is never "more specific" than
          // the save's own current, direct proof of presence.
          const movementByYear = { ...(existing.movementByYear || {}) }
          delete movementByYear[year]
          delete movementByYear[String(year)]
          patch.movementByYear = movementByYear
        }

        if (!isNoOpPlayerPatch(existing, patch, year)) {
          toUpdate.push({ pid: existing.pid, patch, name: mapped.name, transfer: isTransfer })
        }
      } else {
        const isRecruitClass = mapped.year === 'Fr' || mapped.year === 'RS Fr'
        toCreate.push({
          ...mapped,
          cfb27AssetName: assetName,
          movementByYear: {
            [year]: isRecruitClass
              ? { type: 'arrival', arrival: 'recruit' }
              : { type: 'arrival', arrival: 'transfer_in', fromTid: null },
          },
        })
      }
    }
  }

  // Departures: a CFB27-tracked player (has cfb27AssetName) who isn't
  // matched to ANY row this sync, anywhere in the league. Scoped to
  // CFB27-tracked players only — a console-tracked player with no
  // cfb27AssetName was never something this sync could see in the first
  // place, so its absence proves nothing.
  const departures = []
  const draftedPlayers = []
  for (const p of existingPlayers) {
    if (!p.cfb27AssetName || matchedPids.has(p.pid)) continue
    if (alreadyHasMoreSpecificDeparture(p, year)) continue
    const lastStint = getLastKnownStint(p, year + 1) // include the sync year itself
    const lastClass = lastStint?.klass || p.classByYear?.[year] || ''
    // A real draft round from the save is definitive proof over the
    // Sr-vs-not heuristic below — e.g. an underclassman who declared early
    // would otherwise be misclassified 'graduated' had no draft data existed.
    const rawRow = rowsByAssetName.get(p.cfb27AssetName)
    const draftRound = rawRow ? mapDraftRound(rawRow.draft_round) : null
    const leaving = !draftRound ? leavingByAssetName.get(p.cfb27AssetName) : null
    const { departure, departureReason } = resolveDepartureReason({ draftRound, leaving, lastClass })
    departures.push({
      pid: p.pid,
      name: p.name,
      patch: {
        ...(draftRound ? { draftYear: year, draftRound } : {}),
        movementByYear: {
          ...(p.movementByYear || {}),
          [year]: {
            type: 'departure', departure, toTid: null,
            ...(draftRound ? { draftRound } : {}),
            ...(departureReason ? { departureReason } : {}),
          },
        },
      },
    })
    if (draftRound) {
      draftedPlayers.push({
        tid: lastStint?.tid ?? null,
        pid: p.pid,
        playerName: p.name,
        position: p.position,
        overall: p.overall,
        draftRound,
      })
    }
  }

  return {
    toUpdate,
    toCreate,
    departures,
    draftedPlayers,
    unresolvedTeamNames,
    stats: {
      updated: toUpdate.length,
      arrivals: toCreate.length,
      departures: departures.length,
      transfers: transferCount,
    },
  }
}

// Classifies off `recruit_stage` (the Recruit row's RecruitStage field), NOT
// `scholarship_status` — verified against a real 6-recruit board that
// ScholarshipStatus reads 'None' for every row regardless of actual
// commitment, while RecruitStage correctly matches the in-game "Committed"
// label. SoftCommitted (a verbal commitment) DOES count as committed here —
// an earlier version of this function treated it as still-open/pursuing,
// on the unverified assumption that the in-game Commitments list doesn't
// include it until HardCommitted. That assumption was wrong: directly
// verified against a real save's Top Classes screen (a team's own commit
// count/total NIL only matched the in-game number once SoftCommitted rows
// were included — see buildLeagueRecruitingClasses in extractPlayers.cjs
// for the same fix on the whole-league side). A verbal commit really is a
// commitment in-game, just a more reversible one than Hard/Signed — see
// `commitmentTier` on the returned fields below for telling the two apart
// in the UI (e.g. a "Verbal" tag for SoftCommitted specifically).
function classifyRecruitStage(raw) {
  return raw === 'SoftCommitted' || raw === 'HardCommitted' || raw === 'Signed' ? 'committed' : 'open'
}

// Picks the best-corroborated candidate for a name-collision-prone lookup
// (recruit names collide across ~4870 rows) against an existing target's own
// recorded height/hometown/state/weight — same corroborating fields
// isPlausibleRecruitLink uses, minus the year-gap check (not applicable
// here: this is a same-cycle "refresh this recruit's photo" lookup, not a
// recruit-to-signed-player identity link). A hard mismatch on any field
// both sides actually have disqualifies the candidate; among the survivors,
// the one matching the most fields wins. When nothing distinguishes several
// same-named candidates (no corroborating data on file for this recruit
// yet), falls back to the first one — a same-name guess for a cosmetic
// photo refresh is an acceptable risk here, never touches anything else.
function bestDirectoryMatch(candidates, target) {
  if (!candidates || !candidates.length) return null
  let best = null
  let bestScore = -1
  for (const c of candidates) {
    const cHeight = mapHeight(c.height)
    if (target.height && cHeight && target.height !== cHeight) continue
    const cState = mapState(c.home_state)
    if (target.state && cState && target.state !== cState) continue
    const cHometown = (c.hometown || '').trim().toLowerCase()
    const targetHometown = (target.hometown || '').trim().toLowerCase()
    if (targetHometown && cHometown && targetHometown !== cHometown) continue
    if (target.weight != null && c.weight != null && Math.abs(target.weight - mapWeight(c.weight)) > 25) continue

    let score = 0
    if (target.height && cHeight && target.height === cHeight) score++
    if (target.state && cState && target.state === cState) score++
    if (targetHometown && cHometown && targetHometown === cHometown) score++
    if (score > bestScore) { bestScore = score; best = c }
  }
  return best
}

/**
 * Reconcile the save's recruiting-board rows (your tracked targets/commits —
 * UserRecruitTarget rows are inherently scoped to the human-controlled team,
 * no team disambiguation needed) against existing target/commit player
 * records. Mirrors the shape Recruiting.jsx's players already use
 * (isTarget/isRecruit/commitmentTid) rather than routing through
 * recruitingTargets.js's sheet-cell-shaped reconciler, since these rows
 * aren't sheet cells.
 *
 * @param {object[]} rawTargets - `recruitingBoard` array from the save parse
 * @param {object[]} existingPlayers
 * @param {object} opts
 * @param {number} opts.userTid
 * @param {number} opts.year - the recruiting CLASS year (dynasty.currentYear) — NOT the
 *   enrollment year. ScoutBoard.jsx's board filters on `p.targetYear === selectedYear`,
 *   which defaults to `dynasty.currentYear` with no offset (verified: an earlier version
 *   of this function passed currentYear+1 here, which silently made every synced target
 *   invisible on the board — right count in the sync summary, nothing rendered). The
 *   enrollment-year offset belongs on `teamsByYear[year+1]` instead, mirroring
 *   recruitingTargets.js's `applyStatus`.
 * @param {Map<number, number>} opts.rawTeamIdMap - from buildRawTeamIdMap. A row's
 *   `committed_team_id` is the save's OWN raw team id space, resolved through this
 *   the same way every other cross-team reference in this file is.
 * @param {Object<string, object[]>} [opts.leagueRecruitDirectory] - from
 *   extractPlayers.cjs's buildLeagueRecruitDirectory. Whole-league (not just
 *   the user's board) name -> candidate array, used to refresh pictureUrl for
 *   a target that's fallen off the user's own board — see the prune step
 *   below for why that's otherwise a permanently-stale photo.
 */
export function reconcileRecruitingBoard(rawTargets, existingPlayers, { userTid, year, rawTeamIdMap, leagueRecruitDirectory }) {
  const existingByAssetName = new Map()
  const existingByName = new Map()
  for (const p of existingPlayers) {
    if (p.cfb27AssetName) existingByAssetName.set(p.cfb27AssetName, p)
    // Recruit Player rows very commonly have an EMPTY asset_name (not yet a
    // fully "created" signed character) — without this fallback, every sync
    // would fail to match a previously-synced target and pile up duplicates.
    // Scoped to isTarget records only, so this never accidentally matches a
    // same-named ROSTERED player.
    else if (p.isTarget && p.name) existingByName.set(p.name.toLowerCase().trim(), p)
  }

  const toUpdate = []
  const toCreate = []
  const committedRecords = []

  for (const row of rawTargets || []) {
    const assetName = row.asset_name || null
    const name = `${row.first_name || ''} ${row.last_name || ''}`.trim()
    if (!name) continue

    const status = classifyRecruitStage(row.recruit_stage)

    // Where the user's own team currently ranks in this recruit's interest
    // list (the in-game "Int: 6th" label). row.top_schools is already
    // sorted by TeamInfluence descending by the extractor (see
    // extractPlayers.cjs's buildRecruitingBoard), so once each raw team_id
    // is resolved to a dynasty tid the same way committed_team_id already
    // is above, the array index (1-based) IS the rank.
    let interestRank = null
    if (Array.isArray(row.top_schools) && row.top_schools.length > 0) {
      for (let i = 0; i < row.top_schools.length; i++) {
        const tid = rawTeamIdMap.get(Number(row.top_schools[i].team_id))
        if (tid === userTid) { interestRank = i + 1; break }
      }
      // Not found among the tracked schools at all — verified against a
      // real save this is NOT "unknown," it's the game's own displayed
      // floor: Jimmy Macpherson showed "Int: 10th" in-game despite North
      // Texas not literally being one of his 10 tracked schools (same root
      // cause already confirmed for Dwayne Flinn's lockedOut bug — falling
      // out of the tracked list is, at best, tied for its last slot, not
      // some unrelated unknown). Floors to the list's actual length rather
      // than a hardcoded 10 so a still-early recruit with fewer than 10
      // schools tracked so far floors to that smaller count instead.
      if (interestRank == null) interestRank = row.top_schools.length
    }

    // The recruit's own narrowing tier, the same funnel the in-game
    // recruiting board's progress bar shows — distinct from `status` above
    // (committed vs. not) and purely additive for display; never touches
    // commitmentTid/team/etc. Full raw funnel confirmed from the save
    // format's own RecruitStage enum (its real, non-sentinel members, in
    // order): Top10 -> Top5 -> Top3 -> Battle -> SoftCommitted ->
    // HardCommitted -> Signed. `Top10` carries no visible meaning in-game
    // though — verified against a real save, the progress bar itself only
    // ever labels OPEN / TOP 5 / TOP 3 (no "Top 10" checkpoint at all), and
    // a recruit the save read as 'Top10' displayed as plain "Open" with no
    // tier tag on the in-game board (Jimmy Macpherson) — so it maps to the
    // 'Open' label here rather than showing "Top 10". `Signed` isn't in
    // this map at all; it's handled separately below via `isSigned`
    // (dev trait/attribute reveal, roster arrival), not as a display tier.
    // Only Top5/Top3 have a confirmed numeric cutoff to compare
    // interestRank against — Battle/SoftCommitted/HardCommitted don't (a
    // recruit that far along isn't meaningfully "locked out" by a rank
    // number), so they're tagged for display but never drive lockedOut.
    const RECRUIT_STAGE_TIER = {
      Top10: 'Open',
      Top5: 'Top5',
      Top3: 'Top3',
      Battle: 'Battle',
      SoftCommitted: 'SoftCommitted',
      HardCommitted: 'HardCommitted',
    }
    const TIER_CUTOFF = { Top5: 5, Top3: 3 }
    const commitmentTier = RECRUIT_STAGE_TIER[row.recruit_stage] || null
    // Locked out: the recruit has narrowed to a tier smaller than the user's
    // own current interest rank — i.e. the user's team didn't make the cut.
    // Only meaningful pre-commitment; a still-Open recruit (no tier yet) or
    // one already committed elsewhere/to us isn't "locked out," just
    // undecided/done.
    // `interestRank` is already floored to the bottom of the tracked list
    // (see above) whenever the user's team fell out of a recruit's real
    // top 10 entirely — verified against a real save: a recruit the game
    // showed fully "LOCKED OUT" (red lock, in-game detail screen) had
    // narrowed to Top 5 with the user's own team completely absent from his
    // TopSchoolsList, not merely ranked below the Top 5 cutoff — so that
    // floored value alone correctly exceeds the cutoff below without any
    // special-casing here. The `interestRank == null` half of this check is
    // just defensive fallback for the (rarer) case of a completely empty
    // top_schools list, which the floor above can't apply to.
    const lockedOut = !!(commitmentTier && TIER_CUTOFF[commitmentTier] != null && (interestRank == null || interestRank > TIER_CUTOFF[commitmentTier]))
    // A recruit stays on YOUR board (still showing "Committed" in-game)
    // even after hard-committing to a DIFFERENT school you'd simply
    // offered at some point — verified against a real save (a recruit
    // shown Committed on the user's board had actually hard-committed to
    // another team entirely, per Recruit.TopSchoolsList's highest-influence
    // slot, extracted as committed_team_id). Only ever credit OUR team's
    // commitmentTid/ledger when the resolved team really is userTid;
    // otherwise they're gone from OUR board (no longer pursuable) but not
    // one of our commitments.
    const resolvedCommittedTid = status === 'committed' && row.committed_team_id != null
      ? rawTeamIdMap.get(Number(row.committed_team_id)) ?? null
      : null
    const committedToUser = status === 'committed' && resolvedCommittedTid === userTid
    const commitmentTid = committedToUser ? userTid : null
    const position = mapPosition(row.position)
    const archetype = row.archetype_name || ''

    // The save generates a recruit's TRUE dev trait and full ratings the
    // instant it creates them — the game reveals them to the human player
    // progressively as a deliberate mechanic, not because the data doesn't
    // exist yet. Reading the save directly bypasses that on its own, so
    // this mirrors the reveal gate here rather than exposing spoilers
    // (confirmed with the user this matters):
    //   - Dev trait: only once truly signed (Early/Regular National Signing
    //     Day in-game) — even HardCommitted is still hidden.
    //   - Attributes: revealed once truly signed (same as dev trait), OR
    //     once enough scouting hours are invested pre-signing. The hours
    //     threshold (30) is calibrated against a real save: a still-Open,
    //     unsigned recruit the user directly confirmed as "100% scouted"
    //     in-game (all 10 key attributes visible, matching exactly) read
    //     ProspectHoursSpentCurrent === 30. UnlockedIntelBitfield was tried
    //     first and fully disproven — it read 0 for that same 100%-scouted
    //     recruit, and also 0 for every signed recruit checked regardless of
    //     scouting — it carries no signal for this at all.
    //   - Junior College transfers are ALWAYS fully revealed, regardless of
    //     hours spent — confirmed against a real save: a still-Open JC (JR)
    //     recruit showing "100% SCOUTED" in-game (all 10 attributes visible)
    //     read ProspectHoursSpentCurrent === 0. Unlike a true HS prospect, a
    //     JUCO player already has a public college track record, so the game
    //     never hides their ratings behind the scouting-hours mechanic at all.
    //   - Even once revealed, only the game's own "key 10" attributes for
    //     this position/archetype are shown — reusing attributeNamesFor
    //     (src/utils/recruitAttributes.js), the SAME list already used
    //     everywhere else scouted attributes are displayed — never the
    //     full ~53-attribute set, which the game never reveals pre-signing
    //     regardless of scouting completion.
    const isSigned = row.recruit_stage === 'Signed'
    // Recruit.Class distinguishes a true High School recruit from a Junior
    // College transfer — the save's OWN class label for JUCO recruits (e.g.
    // "JC (JR)") is a completely different track from a normal HS recruit's
    // Fr/So/Jr/Sr progression, and must be preserved as-is rather than
    // translated into one (see mapRecruitClassLabel). Persisted onto the
    // player record (not just used locally) so it survives into
    // dynasty.players once signed, and so downstream consumers (Scout
    // Staff's Database eligibility, Targets/Commitments display) can gate on
    // it without re-deriving it.
    const isHighSchoolRecruit = row.recruit_class === 'HighSchool'
    const jucoClassLabel = mapRecruitClassLabel(row.recruit_class)
    const attributesRevealed = isSigned || !isHighSchoolRecruit || (row.prospect_hours_spent || 0) >= 30
    // The Gem/Bust scouting read (the green/red gem badge on the in-game
    // Scouting screen) is gated behind the SAME full-scouting reveal as
    // attributes/dev trait, confirmed by the user against a real save — it
    // does not show in-game until the prospect is 100% scouted. Matches the
    // app's existing gemBust convention ('Gem'/'Bust'/'' — see
    // PlayerEditModal.jsx).
    const gemBust = attributesRevealed
      ? (row.quality_modifier === 'GEM' ? 'Gem' : row.quality_modifier === 'BUST' ? 'Bust' : '')
      : ''
    let attributes
    if (attributesRevealed) {
      const allAttrs = mapAttributes(row.ratings)
      const keyNames = attributeNamesFor(position, archetype)
      attributes = allAttrs && keyNames
        ? Object.fromEntries(keyNames.filter((k) => k in allAttrs).map((k) => [k, allAttrs[k]]))
        : undefined
    }

    const fields = {
      name,
      firstName: row.first_name || '',
      lastName: row.last_name || '',
      position,
      archetype,
      devTrait: isSigned ? (row.dev_trait || null) : null,
      attributes,
      stars: mapStars(row.stars),
      height: mapHeight(row.height),
      weight: mapWeight(row.weight),
      hometown: row.hometown || '',
      state: mapState(row.home_state),
      pictureUrl: mapPortraitUrl(row.generic_head_asset_name, Number(row.portrait_id)),
      cfb27AssetName: assetName,
      nationalRank: row.national_rank ?? null,
      stateRank: row.state_rank ?? null,
      positionRank: row.position_rank ?? null,
      isTarget: true,
      targetYear: year,
      isFavorite: Boolean(row.is_favorite),
      isHighSchoolRecruit,
      recruitClass: row.recruit_class || null,
      jucoClassLabel,
      scoutedFully: attributesRevealed,
      gemBust,
      // Where the user's own team ranks in this recruit's interest list
      // ("Int: 6th" in-game), the recruit's own narrowing tier, whether
      // that tier has locked the user out, and current NIL points offered —
      // see the computation above this block for how each is derived.
      interestRank,
      commitmentTier,
      lockedOut,
      nilOffered: row.current_nil_offer ?? null,
      // Mirrors recruitingTargets.js's applyStatus() exactly — the same
      // fields the in-app "resolve a target" flow writes — so a
      // save-detected commitment lands in the identical state a manual
      // resolution would produce (team/teamsByYear/isRecruit/recruitYear).
      // boardRemoved: true is a deliberate ADDITION beyond what that flow
      // does today (it normally leaves a resolved target visible on the Big
      // Board with a "Committed" badge) — done because the user specifically
      // asked for committed recruits to stop cluttering the open board, not
      // because it's how the existing manual flow behaves. boardRemoved is
      // the same "Remove from board" field the UI's own remove button uses,
      // so it lands in the existing "Removed" bucket (restorable), not gone.
      //
      // Three cases: committed to US (credit our team + ledger, pull off
      // the active board into Commitments), committed to someone ELSE
      // (recruitingTargets.js's getTargetStatus() already has a whole
      // built-in "committed_elsewhere" status + "· Lost" board treatment
      // for exactly this — setting commitmentTid to the REAL other team
      // instead of null is all that's needed to plug into it; stays
      // visible on the active board, dimmed, rather than hidden — matching
      // how a manually-entered lost recruit already behaves, never
      // touching our own team/teamsByYear/ledger), or still open (leave
      // visible, untouched).
      ...(committedToUser
        ? {
            commitmentTid,
            commitWeekKey: null,
            team: commitmentTid,
            teamsByYear: { [year + 1]: commitmentTid },
            isRecruit: true,
            recruitYear: year,
            boardRemoved: true,
            // A JUCO signee's class is NOT a normal Fr/So/Jr/Sr progression —
            // it has to keep reading "JC (JR)" (etc.) once on the roster, not
            // get treated as a true freshman like every other signee. A plain
            // HS recruit gets no year/classByYear here at all (unchanged
            // behavior — the normal whole-roster sync fills that in once
            // they actually appear as a rostered Player).
            ...(jucoClassLabel
              ? { year: jucoClassLabel, classByYear: { [year + 1]: jucoClassLabel }, isJucoTransfer: true }
              : {}),
          }
        : status === 'committed'
        ? {
            commitmentTid: resolvedCommittedTid,
            commitWeekKey: null,
            team: -1,
            teamsByYear: {},
            isRecruit: false,
            boardRemoved: false,
          }
        : {
            commitmentTid: null,
            commitWeekKey: null,
            team: -1,
            teamsByYear: {},
            isRecruit: false,
            boardRemoved: false,
          }),
    }

    const existing = (assetName && existingByAssetName.get(assetName)) || existingByName.get(name.toLowerCase().trim())
    if (existing) {
      // teamsByYear/attributes are object-valued — compare by content, not
      // reference, or a freshly-built {} would never equal an existing {}
      // and every synced target would show as "changed" forever.
      const unchanged = Object.entries(fields).every(([k, v]) => {
        if (k === 'teamsByYear' || k === 'attributes' || k === 'classByYear') return JSON.stringify(existing[k] || null) === JSON.stringify(v || null)
        return (existing[k] ?? null) === (v ?? null)
      })
      if (!unchanged) toUpdate.push({ pid: existing.pid, patch: fields, name })
    } else {
      toCreate.push(fields)
    }

    // Committed-to-YOU rows also need an entry in the recruitingCommitments
    // ledger — that's what the Commitments tab actually reads (confirmed:
    // it does NOT read commitmentTid off the player record at all). Shape
    // matches recruitingTargets.js's toCommitmentRecord() exactly. pid gets
    // filled in by the caller once assigned (new arrivals don't have one yet
    // at this point).
    if (committedToUser) {
      committedRecords.push({
        cfb27AssetName: assetName,
        // RecruitCard.jsx (Commitments tab) reads this exact field, falling
        // back to the literal string 'HS' when absent — matches that
        // convention directly instead of leaking the raw save enum
        // ("HighSchool"/"JuniorCollege_Junior") into the UI.
        name, class: jucoClassLabel || 'HS', position,
        isHighSchoolRecruit,
        archetype, stars: fields.stars, devTrait: fields.devTrait, gemBust: fields.gemBust,
        nationalRank: fields.nationalRank, stateRank: fields.stateRank, positionRank: fields.positionRank,
        height: fields.height, weight: fields.weight, hometown: fields.hometown, state: fields.state,
        // SoftCommitted vs. HardCommitted/Signed — lets the Commitments tab
        // show a "Verbal" tag for the still-reversible SoftCommitted stage.
        commitmentTier: fields.commitmentTier,
      })
    }
  }

  // Prune targets the user removed from their in-game board entirely (not
  // committed anywhere, just deleted the UserRecruitTarget row) — verified,
  // not hypothetical: reported after removing two recruits from the board
  // in-game and re-syncing, and the tracker kept showing both as active
  // targets. The loop above only ever adds/updates rows present in
  // `rawTargets` this sync; a target that's simply gone (no commitment, no
  // row at all) never gets touched, so it sat there forever. `cfb27AssetName
  // !== undefined` (not falsy — recruits commonly have '' as a real value)
  // scopes this to CFB27-synced targets only, so a manually-added target
  // never gets swept just because this sync doesn't know about it.
  const seenKeys = new Set()
  for (const row of rawTargets || []) {
    const assetName = row.asset_name || null
    const name = `${row.first_name || ''} ${row.last_name || ''}`.trim()
    if (assetName) seenKeys.add(`a:${assetName}`)
    if (name) seenKeys.add(`n:${name.toLowerCase().trim()}`)
  }
  for (const p of existingPlayers) {
    if (!p.isTarget) continue
    if (p.targetYear !== year) continue
    if (p.cfb27AssetName === undefined) continue
    const stillOnBoard = (p.cfb27AssetName && seenKeys.has(`a:${p.cfb27AssetName}`))
      || (p.name && seenKeys.has(`n:${p.name.toLowerCase().trim()}`))
    // Still on the user's own board this sync — already got a fresh
    // pictureUrl (and everything else) from the main row loop above.
    if (stillOnBoard) continue

    const patch = {}
    if (!p.boardRemoved) patch.boardRemoved = true

    // Off the user's own board doesn't mean gone from the save — they're
    // very likely still a live Recruit row (committed elsewhere, or just
    // still being recruited by other schools), so their photo can still be
    // refreshed from the whole-league directory even though the per-row
    // board loop above never sees them anymore. Without this, a target's
    // pictureUrl (cached once, whenever it was first tracked) can never be
    // corrected again once it falls off the board — including recovering
    // from a stale link left by a portrait-asset rename/migration.
    if (p.name && leagueRecruitDirectory) {
      const candidates = leagueRecruitDirectory[p.name.toLowerCase().trim()]
      const match = bestDirectoryMatch(candidates, p)
      if (match) {
        const freshUrl = mapPortraitUrl(match.generic_head_asset_name, Number(match.portrait_id))
        if (freshUrl && freshUrl !== p.pictureUrl) patch.pictureUrl = freshUrl

        // Dev trait reveal, same "don't spoil it before signing" gate the
        // user's own board rows use (isSigned above) — just no longer
        // scoped to only the user's own signees. A target that signed with
        // ANOTHER school falls off the user's board and never gets touched
        // by the per-row loop above, so without this its dev trait stays
        // frozen at whatever it was (usually still Hidden/null) forever,
        // even once the save itself has long since revealed it. Deliberately
        // does NOT touch scoutedFully/attributes — the directory only ever
        // carries dev_trait, never the 10 scouted ratings, so this recruit
        // still correctly stays out of the Database/Scouting Needs pools
        // (which require real attribute data) until actually scouted.
        const hiddenNow = !p.devTrait || p.devTrait === 'Hidden'
        if (hiddenNow && match.is_signed && match.dev_trait) {
          patch.devTrait = match.dev_trait
        }
      }
    }

    if (Object.keys(patch).length > 0) {
      toUpdate.push({ pid: p.pid, patch, name: p.name })
    }
  }

  return { toUpdate, toCreate, committedRecords, stats: { targets: toUpdate.length + toCreate.length } }
}

// Real kickoff date/time, straight off the save's own SeasonGame fields —
// GameDateMonth/GameDateDay (no year on the field itself; the game's own
// SeasonYear/dynasty year covers that) and TimeOfDay (minutes since
// midnight — verified exact against a real save: 1065 -> "5:45 PM", matching
// that same game's in-game schedule screen). Returns null fields when the
// save doesn't have them rather than guessing.
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
// Bundles all four raw/derived date-time fields for a raw save game row `g`
// (the shape buildSchedule/extractPlayers.cjs produces) into one spreadable
// object, so every game-record builder below stays a one-line addition.
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

// Stable, deterministic id for a CPU-vs-CPU game — same matchup always
// resolves to the same id across syncs (order-independent on the two tids),
// so re-syncing never creates a duplicate record for a game already tracked.
function cpuGameId(year, week, tidA, tidB) {
  const [lo, hi] = tidA < tidB ? [tidA, tidB] : [tidB, tidA]
  return `cfb27-cpu-${year}-wk${week}-${lo}-${hi}`
}

/**
 * Whole-league schedule + score + box score sync for every game NOT
 * involving the user's own team (the user's own games already go through
 * computeScheduleDiff/applyScheduleDiff/applyCfb27GameScores in
 * DynastyContext.jsx's orchestrator — this covers everyone else, so the two
 * paths never fight over the same game record).
 *
 * Minimal-diff by design: an existing CPU game record is only included in
 * the result if something about it actually changed (score/played status/
 * box score) — otherwise a sync of an 891-game league would rewrite all 891
 * every time even when only that week's ~60-70 games are new.
 *
 * @param {object} parsed - raw save-parse result
 * @param {Map<number,number>} rawTeamIdMap - from buildRawTeamIdMap
 * @param {object} dynastyTeams
 * @param {object[]} existingGames - dynasty's current games (fresh, not stale — caller's responsibility)
 * @param {number} userTid
 * @param {number} year
 * @returns {{toWrite: object[], stats: {gamesTouched: number, boxScoresAdded: number}}}
 */
export function buildWholeLeagueGames(parsed, rawTeamIdMap, dynastyTeams, existingGames, userTid, year) {
  // The save's own Conference Championship week (SeasonInfo's
  // RegularSeasonWeekConferenceChampionship, e.g. 16) — CCG matchups arrive
  // in this SAME weekType==='RegularSeason' pool (verified against a real
  // save: no separate weekType exists for them), so they're only
  // distinguishable by week number. Used to tag them isConferenceChampionship/
  // gameType:'conference_championship' instead of a plain 'regular' game —
  // without this, Dashboard.jsx's hasCCData (and CC History) never see them,
  // since both key off that flag, not just game.year/week.
  const ccgWeek = parsed.season?.conferenceChampionshipWeek ?? null

  const existingByMatchup = new Map()
  for (const g of existingGames || []) {
    if ((g.gameType !== 'regular' && g.gameType !== 'conference_championship') || Number(g.year) !== year) continue
    if (g.team1Tid == null || g.team2Tid == null) continue
    existingByMatchup.set(`${g.week}:${cpuGameId(year, g.week, g.team1Tid, g.team2Tid)}`, g)
  }

  const toWrite = []
  let boxScoresAdded = 0

  for (const g of parsed.games || []) {
    if (g.weekType !== 'RegularSeason') continue
    // The save's generic schedule-filler opponent (TeamIndex 255 — "FCS
    // West" etc) carries no real players, so it never lands in
    // rawTeamIdMap (built from player rows) and used to make this whole
    // game vanish from BOTH teams' schedules — the exact "Indiana only has
    // 11 games" bug reported against a real save (Indiana's Week 2/10 FCS
    // opponents silently dropped). mapScheduleForTeam already resolves this
    // sentinel to the app's 5 real placeholder tids (137-141) for the
    // user's OWN schedule; mirrored here for every other team's CPU games.
    let homeAppTid = g.homeTeamId === 255 ? FCS_FILLER_NAME_TO_TID[g.homeTeam] ?? null : rawTeamIdMap.get(g.homeTeamId)
    let awayAppTid = g.awayTeamId === 255 ? FCS_FILLER_NAME_TO_TID[g.awayTeam] ?? null : rawTeamIdMap.get(g.awayTeamId)
    if (homeAppTid == null || awayAppTid == null) continue
    if (homeAppTid === userTid || awayAppTid === userTid) continue // handled by the user-team pipeline instead

    const isCCG = ccgWeek != null && g.week === ccgWeek
    // File the CCG under the app's canonical Conference Championship week
    // rather than whatever number this save used. The save's CCG week is not
    // fixed (15 and 16 both observed), so carrying it through raw put
    // conference championships on a regular-season week in some saves —
    // and, worse, made them invisible to the prune's week-keyed matching
    // below, which then deleted them as phantom byes on the next sync
    // ("redid it and now none of the conference games are there").
    const week = isCCG ? APP_CCG_WEEK : g.week
    const matchKey = `${week}:${cpuGameId(year, week, homeAppTid, awayAppTid)}`
    const existing = existingByMatchup.get(matchKey)
    const played = g.status !== 'Unplayed'

    // Preserve whichever team already occupies team1/team2 on an existing
    // record — flipping the slots on every sync would be a cosmetic-only
    // change that still counts as a "diff" and defeats minimal-diff.
    const team1Tid = existing ? existing.team1Tid : homeAppTid
    const team2Tid = existing ? existing.team2Tid : awayAppTid
    const team1IsHome = team1Tid === homeAppTid
    const team1Score = played ? (team1IsHome ? g.homeScore : g.awayScore) : 0
    const team2Score = played ? (team1IsHome ? g.awayScore : g.homeScore) : 0
    const homeQuarters = [g.home_score_q1, g.home_score_q2, g.home_score_q3, g.home_score_q4]
    const awayQuarters = [g.away_score_q1, g.away_score_q2, g.away_score_q3, g.away_score_q4]
    const team1Quarters = team1IsHome ? homeQuarters : awayQuarters
    const team2Quarters = team1IsHome ? awayQuarters : homeQuarters
    const team1OT = team1IsHome ? g.home_score_ot : g.away_score_ot
    const team2OT = team1IsHome ? g.away_score_ot : g.home_score_ot
    const quarters = played
      ? {
          team1: { Q1: team1Quarters[0], Q2: team1Quarters[1], Q3: team1Quarters[2], Q4: team1Quarters[3] },
          team2: { Q1: team2Quarters[0], Q2: team2Quarters[1], Q3: team2Quarters[2], Q4: team2Quarters[3] },
        }
      : null
    const overtimes = played && (team1OT || team2OT) ? [{ team1: team1OT, team2: team2OT }] : null

    let box = null
    if (played && parsed.gameStats) {
      const teamStatsRaw = parsed.gameStats.teamStatsByWeek?.[week] || {}
      const playerStatsRaw = parsed.gameStats.playerStatsByWeek?.[week] || []
      const byTid = {}
      const teamStatsByTid = {}
      for (const [rawTid, appTid] of [[g.homeTeamId, homeAppTid], [g.awayTeamId, awayAppTid]]) {
        const abbr = dynastyTeams?.[appTid]?.abbr
        const rawTeamStats = teamStatsRaw[rawTid]
        if (rawTeamStats) teamStatsByTid[appTid] = mapTeamGameStats(rawTeamStats, abbr)
        const categories = EMPTY_CATEGORIES()
        for (const entry of playerStatsRaw) {
          if (entry.team_id !== rawTid) continue
          for (const { category, stat } of mapPlayerGameStatEntries(entry)) {
            categories[category]?.push(stat)
          }
        }
        byTid[appTid] = sortBoxScoreCategories(categories)
      }
      box = { byTid, teamStatsByTid }
    }

    const record = existing
      ? {
          ...existing,
          // Self-heals a record synced before this fix existed (still
          // 'regular' with no isConferenceChampionship flag) the next time
          // it's touched, same "save always wins" rule as every other field.
          gameType: isCCG ? 'conference_championship' : (existing.gameType || 'regular'),
          ...(isCCG ? { isConferenceChampionship: true } : {}),
          team1Score,
          team2Score,
          isPlayed: played,
          ...(quarters ? { quarters } : {}),
          ...(overtimes ? { overtimes } : {}),
          ...(box ? { boxScore: box } : {}),
          ...gameDateTimeFields(g),
        }
      : {
          id: cpuGameId(year, week, homeAppTid, awayAppTid),
          week,
          year,
          gameType: isCCG ? 'conference_championship' : 'regular',
          ...(isCCG ? { isConferenceChampionship: true } : {}),
          team1Tid,
          team2Tid,
          team1Score,
          team2Score,
          homeTeamTid: homeAppTid,
          isPlayed: played,
          isCPUGame: true,
          ...(quarters ? { quarters } : {}),
          ...(overtimes ? { overtimes } : {}),
          ...(box ? { boxScore: box } : {}),
          ...gameDateTimeFields(g),
        }

    // Minimal-diff: skip writing if nothing actually changed vs. what's tracked.
    if (existing) {
      const unchanged =
        existing.team1Score === record.team1Score &&
        existing.team2Score === record.team2Score &&
        Boolean(existing.isPlayed) === Boolean(record.isPlayed) &&
        Boolean(existing.isConferenceChampionship) === Boolean(isCCG) &&
        JSON.stringify(existing.boxScore || null) === JSON.stringify(record.boxScore || null) &&
        JSON.stringify(existing.quarters || null) === JSON.stringify(record.quarters || null) &&
        // One-time backfill: a game synced before date/time was tracked
        // would otherwise never get it written, since nothing else about
        // it "changes" once it's already played.
        existing.dateLabel === record.dateLabel &&
        existing.kickoffTimeLabel === record.kickoffTimeLabel
      if (unchanged) continue
    }

    if (box) boxScoresAdded += 1
    toWrite.push(record)
  }

  // Prune stale CPU games that no longer match the CURRENT save. The loop
  // above is upsert-only by design (minimal-diff) and never removes a
  // record — so a game written by an earlier, incomplete/wrong sync (e.g.
  // a schedule that hadn't fully resolved yet) can survive forever even
  // after a later sync's real data disagrees with it. Confirmed against a
  // real dynasty: Notre Dame ended up with a phantom "BYU, Week 7" game
  // (a week that's actually a BYE) and a phantom duplicate "Miami, Week 10"
  // entry (Miami's real matchup was Week 0) — both leftover records this
  // function had never had a way to clean up.
  //
  // Two distinct signals, both treated as definite (never prunes on mere
  // absence of THIS team/week from the parse, which just means "unknown"):
  //   1. This team+week DOES appear in the current parse, but with a
  //      different opponent than what's stored — a wrong-opponent record.
  //   2. This week is a real week in the season (some OTHER team has a game
  //      that week, so it's not just "outside this sync's range"), but THIS
  //      team has no game at all that week per the current parse — a bye,
  //      so any stored game for this team at that week is a phantom.
  const currentOpponentByTidWeek = new Map() // `${tid}:${week}` -> opponent tid
  const knownWeeks = new Set() // every week that's a real (non-bye-only) week this season
  for (const g of parsed.games || []) {
    if (g.weekType !== 'RegularSeason') continue
    // MUST use the same raw->app week mapping the write path above uses, or
    // conference championships get indexed under the save's raw week while
    // the stored records live at APP_CCG_WEEK. That mismatch made every CCG
    // look like "no game for either team that week" — i.e. a phantom bye —
    // so the prune deleted them all on the next sync.
    const gWeek = ccgWeek != null && g.week === ccgWeek ? APP_CCG_WEEK : g.week
    knownWeeks.add(gWeek)
    const homeAppTid = g.homeTeamId === 255 ? FCS_FILLER_NAME_TO_TID[g.homeTeam] ?? null : rawTeamIdMap.get(g.homeTeamId)
    const awayAppTid = g.awayTeamId === 255 ? FCS_FILLER_NAME_TO_TID[g.awayTeam] ?? null : rawTeamIdMap.get(g.awayTeamId)
    if (homeAppTid == null || awayAppTid == null) continue
    currentOpponentByTidWeek.set(`${homeAppTid}:${gWeek}`, awayAppTid)
    currentOpponentByTidWeek.set(`${awayAppTid}:${gWeek}`, homeAppTid)
  }

  const toDelete = []
  for (const g of existingGames || []) {
    if ((g.gameType !== 'regular' && g.gameType !== 'conference_championship') || Number(g.year) !== year) continue
    if (g.team1Tid == null || g.team2Tid == null) continue
    if (g.team1Tid === userTid || g.team2Tid === userTid) continue // user games handled by the other pipeline
    // Resolve the STORED game to the same canonical week the index above is
    // keyed by. A conference championship can be stored as week 16, as the
    // save's raw CCG week, or with a non-numeric week ('CCG') if it was
    // entered by hand — all three mean the same slot, and comparing the raw
    // value made a CCG match nothing and read as a phantom bye.
    const storedWeek = (g.gameType === 'conference_championship' || g.isConferenceChampionship)
      ? APP_CCG_WEEK
      : g.week
    const expected1 = currentOpponentByTidWeek.get(`${g.team1Tid}:${storedWeek}`)
    const expected2 = currentOpponentByTidWeek.get(`${g.team2Tid}:${storedWeek}`)
    const wrongOpponent =
      (expected1 != null && expected1 !== g.team2Tid) ||
      (expected2 != null && expected2 !== g.team1Tid)
    const bothSidesNowByes = expected1 == null && expected2 == null && knownWeeks.has(g.week)
    if (wrongOpponent || bothSidesNowByes) toDelete.push(g.id)
  }

  return { toWrite, toDelete, stats: { gamesTouched: toWrite.length, boxScoresAdded, gamesPruned: toDelete.length } }
}

// PlayoffBracketSlot -> cfpSlot, a FIXED index into the real bracket
// structure — verified directly against a real save's actual locked
// bracket: slot3(Virginia home/Nebraska away)=5v12=cfpfr1, slot2(Georgia/
// Tennessee)=6v11=cfpfr3, slot1(UNLV/Ole Miss)=7v10=cfpfr4, slot0(Michigan/
// Texas A&M)=8v9=cfpfr2; quarterfinal bye hosts slot4(Miami)=cfpqf1(bye
// seed1), slot7(SMU)=cfpqf2(bye seed4), slot6(Houston)=cfpqf3(bye seed3),
// slot5(Pittsburgh)=cfpqf4(bye seed2) — consistent with each cfpqf's
// feedsFrom chain back to its first-round slot. slot10 is always the
// National Championship. This REPLACES two earlier, now-disproven
// approaches: seed-ranking-based first-round labeling (buildCFPProjection's
// computed seeds don't match EA's real seeding) and bowl-name-based
// quarterfinal/semifinal labeling (BowlGame.Name for those is only ever a
// generic category label like "CFP Quarterfinal", never the specific bowl).
const PLAYOFF_SLOT_TO_CFP_SLOT = {
  0: 'cfpfr2', 1: 'cfpfr4', 2: 'cfpfr3', 3: 'cfpfr1',
  4: 'cfpqf1', 5: 'cfpqf4', 6: 'cfpqf3', 7: 'cfpqf2',
  10: 'cfpnc',
}
const CFP_SLOT_GAME_TYPE = {
  cfpfr1: 'cfp_first_round', cfpfr2: 'cfp_first_round', cfpfr3: 'cfp_first_round', cfpfr4: 'cfp_first_round',
  cfpqf1: 'cfp_quarterfinal', cfpqf2: 'cfp_quarterfinal', cfpqf3: 'cfp_quarterfinal', cfpqf4: 'cfp_quarterfinal',
  cfpsf1: 'cfp_semifinal', cfpsf2: 'cfp_semifinal',
  cfpnc: 'cfp_championship',
}
// The manual CFP-shell flow (DynastyContext.jsx's createOrUpdateCFPGameShells)
// and every consumer of a CFP game record (CFPBracket.jsx, Dashboard.jsx's
// userCFPFirstRoundGame/findUserCFPGameShell, GameEdit.jsx) key off these
// legacy boolean flags + cfpRound — NOT cfpSlot/gameType alone. Missing them
// here meant an auto-synced CFP game was invisible to all of that code even
// though cfpSlot/gameType were already correct.
const CFP_SLOT_LEGACY_FLAG = {
  cfp_first_round: 'isCFPFirstRound',
  cfp_quarterfinal: 'isCFPQuarterfinal',
  cfp_semifinal: 'isCFPSemifinal',
  cfp_championship: 'isCFPChampionship',
}

// Semifinals are a 4-into-2 merge (cfpsf1 receives BOTH cfpqf1 AND cfpqf2's
// winners), so there's no fixed 1:1 slot index the way first-round ->
// quarterfinal has. Resolved instead by checking which quarterfinal(s) a
// semifinal's own two participants actually came from.
function resolveSemifinalCfpSlot(slotTeams, team1Tid, team2Tid) {
  const sf1Feeders = new Set([...(slotTeams.get(4) || []), ...(slotTeams.get(7) || [])])
  if (sf1Feeders.has(team1Tid) || sf1Feeders.has(team2Tid)) return 'cfpsf1'
  return 'cfpsf2'
}

// Every playoff game's participants by PlayoffBracketSlot, regardless of
// played status — needed for resolveSemifinalCfpSlot, and shared by
// deriveCFPSeeds below so the two stay self-consistent by construction.
function buildPlayoffSlotTeams(parsed, rawTeamIdMap) {
  const slotTeams = new Map()
  for (const g of parsed.games || []) {
    if (!g.isPlayoffBowl || g.playoffBracketSlot == null) continue
    const t1 = rawTeamIdMap.get(g.homeTeamId)
    const t2 = rawTeamIdMap.get(g.awayTeamId)
    slotTeams.set(g.playoffBracketSlot, [t1, t2].filter((t) => t != null))
  }
  return slotTeams
}

/**
 * Bowl + full CFP bracket results, EVERY team including the user's own
 * (unlike buildWholeLeagueGames above, which is CPU-only and regular-season-
 * only) — the goal is zero manual entry for any postseason game.
 *
 * Writes a game the moment its matchup is real (both teams known) — NOT
 * gated on `status !== 'Unplayed'`. A regular bowl's two teams are locked in
 * (announced) well before the game is actually played, which is the whole
 * premise of "Bowl Week 1 of 4" existing as a multi-week window; only the
 * SCORE is genuinely provisional pre-kickoff, not the matchup. The
 * `team1Tid == null || team2Tid == null` check just below is what actually
 * excludes still-provisional slots (a CFP quarterfinal/semifinal bye with no
 * opponent decided yet) — confirmed against a real save: skipping ALL
 * Unplayed games meant the user's own already-assigned, not-yet-played bowl
 * (Reliaquest Bowl vs a real, named opponent) silently never synced, so the
 * Dashboard kept asking the manual "Did you make a bowl?" wizard instead of
 * showing the real matchup.
 *
 * Also stamps the same fields the manual shell-creation flows
 * (DynastyContext.jsx's createOrUpdateBowlGameShell / createOrUpdateCFPGameShells)
 * already use — isBowlGame/bowlWeek for regular bowls, cfpRound + the legacy
 * isCFPFirstRound/isCFPQuarterfinal/isCFPSemifinal/isCFPChampionship flags for
 * CFP games — since Dashboard.jsx, CFPBracket.jsx, and GameEdit.jsx all key
 * off THOSE fields, not cfpSlot/gameType alone.
 *
 * @param {object} parsed - raw save-parse result
 * @param {Map<number,number>} rawTeamIdMap - from buildRawTeamIdMap
 * @param {object[]} existingGames - dynasty's current games
 * @param {number} year
 * @returns {object[]} games to upsert into dynasty.games
 */
export function buildPostseasonGames(parsed, rawTeamIdMap, dynastyTeams, existingGames, year) {
  const toWrite = []
  const existingByKey = new Map()
  for (const g of existingGames || []) {
    if (Number(g.year) !== year) continue
    if (g.cfpSlot) {
      existingByKey.set(`cfp:${g.cfpSlot}`, g)
    } else if (g.gameType === 'bowl' && g.bowlName && g.team1Tid != null && g.team2Tid != null) {
      const [lo, hi] = g.team1Tid < g.team2Tid ? [g.team1Tid, g.team2Tid] : [g.team2Tid, g.team1Tid]
      existingByKey.set(`bowl:${g.bowlName}:${lo}:${hi}`, g)
    }
  }

  const slotTeams = buildPlayoffSlotTeams(parsed, rawTeamIdMap)

  for (const g of parsed.games || []) {
    if (g.weekType === 'RegularSeason') continue
    if (!g.bowlName) continue
    const team1Tid = rawTeamIdMap.get(g.homeTeamId)
    const team2Tid = rawTeamIdMap.get(g.awayTeamId)
    // Still-provisional (e.g. a CFP quarterfinal/semifinal bye whose
    // opponent isn't decided yet) — genuinely nothing real to write yet.
    if (team1Tid == null || team2Tid == null) continue

    const isPlayed = g.status !== 'Unplayed'

    let cfpSlot = null
    if (g.isPlayoffBowl) {
      const slot = g.playoffBracketSlot
      cfpSlot = (slot === 8 || slot === 9)
        ? resolveSemifinalCfpSlot(slotTeams, team1Tid, team2Tid)
        : (PLAYOFF_SLOT_TO_CFP_SLOT[slot] || null)
    }
    const gameType = cfpSlot ? CFP_SLOT_GAME_TYPE[cfpSlot] : 'bowl'
    const cfpConfig = cfpSlot ? CFP_BRACKET_SLOTS[cfpSlot] : null

    const [lo, hi] = team1Tid < team2Tid ? [team1Tid, team2Tid] : [team2Tid, team1Tid]
    const key = cfpSlot ? `cfp:${cfpSlot}` : `bowl:${g.bowlName}:${lo}:${hi}`
    const existing = existingByKey.get(key)
    const team1Score = isPlayed ? (existing && existing.team1Tid === team2Tid ? g.awayScore : g.homeScore) : null
    const team2Score = isPlayed ? (existing && existing.team1Tid === team2Tid ? g.homeScore : g.awayScore) : null

    // Box score (team stats + every category's player stat lines), same
    // shape/derivation buildWholeLeagueGames uses for regular-season games —
    // previously missing entirely for bowl/CFP games (both the user's own
    // and CPU), which only ever got the final score here. Requires the
    // extractor's own playedWeeks to include postseason weeks too (see
    // extractPlayers.cjs) — without that, gameStats.teamStatsByWeek/
    // playerStatsByWeek simply have no entry for a bowl/CFP week to read.
    let box = null
    if (isPlayed && parsed.gameStats) {
      const teamStatsRaw = parsed.gameStats.teamStatsByWeek?.[g.week] || {}
      const playerStatsRaw = parsed.gameStats.playerStatsByWeek?.[g.week] || []
      const byTid = {}
      const teamStatsByTid = {}
      for (const [rawTid, appTid] of [[g.homeTeamId, team1Tid], [g.awayTeamId, team2Tid]]) {
        const abbr = dynastyTeams?.[appTid]?.abbr
        const rawTeamStats = teamStatsRaw[rawTid]
        if (rawTeamStats) teamStatsByTid[appTid] = mapTeamGameStats(rawTeamStats, abbr)
        const categories = EMPTY_CATEGORIES()
        for (const entry of playerStatsRaw) {
          if (entry.team_id !== rawTid) continue
          for (const { category, stat } of mapPlayerGameStatEntries(entry)) {
            categories[category]?.push(stat)
          }
        }
        byTid[appTid] = sortBoxScoreCategories(categories)
      }
      box = { byTid, teamStatsByTid }
    }

    const record = {
      id: cfpSlot ? getCFPGameId(cfpSlot, year) : (existing?.id || `cfb27-bowl-${year}-${g.bowlName.replace(/\s+/g, '-').toLowerCase()}-${lo}-${hi}`),
      year,
      week: cfpConfig ? `Bowl ${cfpConfig.week}` : 'Bowl',
      gameType,
      ...(cfpSlot
        ? { cfpSlot, cfpRound: cfpConfig?.round, [CFP_SLOT_LEGACY_FLAG[gameType]]: true }
        : { isBowlGame: true, bowlWeek: g.weekType === 'BowlSeason2' ? 'week2' : 'week1' }),
      bowlName: g.bowlName,
      team1Tid: existing?.team1Tid ?? team1Tid,
      team2Tid: existing?.team2Tid ?? team2Tid,
      team1Score,
      team2Score,
      // Neutral-site convention — matches both manual shell-creation flows
      // (createOrUpdateBowlGameShell/createOrUpdateCFPGameShells), which
      // never distinguish a real home team for any postseason game.
      homeTeamTid: null,
      isPlayed,
      winnerTid: isPlayed ? (team1Score > team2Score ? team1Tid : team2Tid) : null,
      ...(box ? { boxScore: box } : {}),
      ...gameDateTimeFields(g),
    }

    if (existing) {
      const unchanged = existing.team1Score === record.team1Score
        && existing.team2Score === record.team2Score
        && Boolean(existing.isPlayed) === isPlayed
        && existing.dateLabel === record.dateLabel
        && existing.kickoffTimeLabel === record.kickoffTimeLabel
        && JSON.stringify(existing.boxScore || null) === JSON.stringify(record.boxScore || null)
      if (unchanged) continue
      toWrite.push({ ...existing, ...record })
    } else {
      toWrite.push(record)
    }
  }

  return toWrite
}

/**
 * The real, locked 12-team CFP seed list + real NY6 bowl host assignments —
 * derived from the SAME fixed PLAYOFF_SLOT_TO_CFP_SLOT structure
 * buildPostseasonGames uses, so the two are always self-consistent by
 * construction (never two different sources of truth for the bracket).
 * Mirrors CFPSeedsModal's exact save shape (Dashboard.jsx) so this sync and
 * manual entry stay fully interchangeable.
 *
 * Returns null until the bracket is actually locked in the save — i.e. all 4
 * first-round matchups (seeds 5-12) AND all 4 quarterfinal bye hosts (seeds
 * 1-4) have real, non-null participants. Before that point (mid regular
 * season), these same save fields exist but reflect a still-changing
 * standings projection — cfpProjection.js's buildCFPProjection is the
 * correct (and untouched) tool for that earlier, pre-lock phase.
 *
 * @returns {{ seeds: {seed:number, tid:number}[], bowlConfig: object } | null}
 */
export function deriveCFPSeeds(parsed, rawTeamIdMap) {
  const slotTeams = buildPlayoffSlotTeams(parsed, rawTeamIdMap)
  const bowlNameBySlot = new Map()
  for (const g of parsed.games || []) {
    if (!g.isPlayoffBowl || g.playoffBracketSlot == null || !g.bowlName) continue
    bowlNameBySlot.set(g.playoffBracketSlot, g.bowlName)
  }

  const seeds = []
  const bowlConfig = {}

  // First round: home team is always the higher (lower-numbered) seed —
  // verified against a real save's 4 first-round games matching the app's
  // own CFP_FIRST_ROUND_SLOTS seed pairs exactly for every one of the 4.
  const FR_SEED_PAIRS = { 0: [8, 9], 1: [7, 10], 2: [6, 11], 3: [5, 12] }
  for (const [slot, [hiSeed, loSeed]] of Object.entries(FR_SEED_PAIRS)) {
    const teams = slotTeams.get(Number(slot))
    if (!teams || teams.length !== 2) return null
    seeds.push({ seed: hiSeed, tid: teams[0] })
    seeds.push({ seed: loSeed, tid: teams[1] })
  }

  // Quarterfinal bye slots directly give seeds 1-4, plus the real bowl
  // hosting that seed's quarterfinal once its site is assigned in the save.
  const QF_BYE_SEED = { 4: 1, 7: 4, 6: 3, 5: 2 }
  for (const [slot, seed] of Object.entries(QF_BYE_SEED)) {
    const teams = slotTeams.get(Number(slot))
    if (!teams || teams.length < 1) return null
    seeds.push({ seed, tid: teams[0] })
    const bowlName = bowlNameBySlot.get(Number(slot))
    if (bowlName) bowlConfig[`seed${seed}`] = bowlName
  }

  // Semifinal bowl hosts — best-effort, only once each site is assigned;
  // DEFAULT_BOWL_CONFIG's fallback covers sf1/sf2 until then.
  for (const slot of [8, 9]) {
    const teams = slotTeams.get(slot)
    if (!teams || teams.length !== 2) continue
    const cfpSlot = resolveSemifinalCfpSlot(slotTeams, teams[0], teams[1])
    const bowlName = bowlNameBySlot.get(slot)
    if (bowlName) bowlConfig[cfpSlot === 'cfpsf1' ? 'sf1' : 'sf2'] = bowlName
  }

  seeds.sort((a, b) => a.seed - b.seed)
  return { seeds, bowlConfig }
}

// Save-side DepthChart slot field -> app's outlookBoard.js catalog slot id.
// Mirrors extractPlayers.cjs's DEPTH_CHART_SLOT_FIELDS whitelist exactly —
// identity for most (both sides already use the same short codes), except
// LE/RE which the app's catalog calls LEDG/REDG.
const DEPTH_CHART_SLOT_TO_APP_SLOT = {
  LT: 'LT', LG: 'LG', C: 'C', RG: 'RG', RT: 'RT',
  WR: 'WR', TE: 'TE', HB: 'HB', QB: 'QB', FB: 'FB',
  DT: 'DT', CB: 'CB', FS: 'FS', SS: 'SS',
  LE: 'LEDG', RE: 'REDG',
  K: 'K', P: 'P',
}

/**
 * Whole-league in-game depth chart -> { appTid: { order: {slotId: [tileKey,...]},
 * placements: {tileKey: slotId} } }, ready to merge into dynasty.teamFuture[tid]
 * (src/pages/dynasty/SchemeBuilder.jsx's persisted board state).
 *
 * Writes BOTH `order` (stack order within a column) and `placements` (which
 * column a player is in). `placements` is required, not optional: outlookBoard.js's
 * seedSide() only auto-seeds a player into a slot whose `accepts` list matches
 * their roster `position` field EXACTLY (e.g. RT's accepts is only ['RT']) — a
 * player tagged RT who is actually starting at LT in-game (a real, common
 * O-line-shuffle case, not hypothetical — verified against a real save where
 * an RT-tagged player started at LT while an RT-tagged/LT-tagged pair swapped)
 * NEVER enters the LT column via auto-seed, no matter what `order.LT` says —
 * `order` only reorders tiles that are already in a column, it can't move a
 * player into a different one. Without an explicit `placements` override for
 * every synced slot, the depth chart silently fails to match the save for any
 * player whose actual game-assigned slot differs from their position tag.
 * Entries are the STABLE TILE KEY string `pid:<pid>` — src/utils/outlookBoard.js's
 * orderTiles() ranks by `tile.key`, not the bare pid (confirmed against
 * TeamOutlook.jsx, the manual drag-reorder UI, which writes `sl.tiles.map(t => t.key)`).
 *
 * @param {object} rawDepthCharts - extractFullSave's `depthCharts` (rawTeamId -> slotField -> player[])
 * @param {Map<number, number>} rawTeamIdMap - from buildRawTeamIdMap
 * @param {Map<string, {pid:number, tid:number}[]>} pidByAssetName - candidates per
 *   asset_name, team-disambiguated at lookup time. NOT a 1:1 map: asset_name is
 *   verified NOT globally unique (a real save had one exact cross-team
 *   collision — two different real players, two different real teams, same
 *   asset_name; see this file's header comment). A depth chart resolves one
 *   team at a time, so filtering candidates to the team being resolved fixes
 *   exactly that collision cheaply, unlike the flat asset_name->pid maps used
 *   elsewhere in this file (which accept the ~1-in-16,000 risk instead).
 * @param {Map<string, number>} pidByPlayerName - normalized "first last" -> pid, fallback only
 */
function mapDepthCharts(rawDepthCharts, rawTeamIdMap, pidByAssetName, pidByPlayerName) {
  const out = {}
  for (const [rawTidStr, slots] of Object.entries(rawDepthCharts || {})) {
    const appTid = rawTeamIdMap.get(Number(rawTidStr))
    if (appTid == null) continue

    const mappedOrder = {}
    const mappedPlacements = {}
    for (const [saveSlot, entries] of Object.entries(slots)) {
      const appSlot = DEPTH_CHART_SLOT_TO_APP_SLOT[saveSlot]
      if (!appSlot) continue
      const pids = []
      for (const entry of entries) {
        let pid = null
        const candidates = entry.asset_name ? pidByAssetName.get(entry.asset_name) : null
        if (candidates?.length) {
          pid = (candidates.find((c) => c.tid === appTid) || candidates[0]).pid
        }
        if (pid == null) {
          const name = `${entry.first_name || ''} ${entry.last_name || ''}`.trim().toLowerCase()
          pid = name ? pidByPlayerName.get(name) : null
        }
        if (pid != null) {
          const key = `pid:${pid}`
          pids.push(key)
          // First slot a player appears in wins (a versatile backup can be
          // listed on more than one column's bench) — DEPTH_CHART_SLOT_FIELDS'
          // iteration order is stable, and a player's primary/starting slot is
          // consistently listed before secondary bench appearances elsewhere.
          if (!mappedPlacements[key]) mappedPlacements[key] = appSlot
        }
      }
      if (pids.length) mappedOrder[appSlot] = pids
    }
    if (Object.keys(mappedOrder).length) {
      out[appTid] = { order: mappedOrder, placements: mappedPlacements }
    }
  }
  return out
}

// Merge one team's new entering-week rank into its existing rankByWeek map,
// also stamping the app's dedicated "Final Poll" slot (105) when this sync
// is confirmed to be the season's real final poll — see the isFinalPollSync
// call site's header comment in buildSyncPlan for why. Pulled out as its
// own pure function so this specific merge behavior is unit-testable
// without a full buildSyncPlan fixture.
export function buildRankByWeekPatch(existingRankByWeek, week, rank, isFinalPollSync) {
  return {
    ...(existingRankByWeek || {}),
    [week]: rank,
    ...(isFinalPollSync ? { 105: rank } : {}),
  }
}

// Fallback for the rare save state where NO Coach row has IsUserControlled
// set at all — confirmed real (not just theoretical): a user reported it
// on a save where they were plainly not mid-transition, still head coach
// of their own team, sync after sync. A team+position lookup alone was
// already tried as the PRIMARY signal once and pulled after it showed real
// users a WRONG coach's face (mapCoachingStaff's header comment: a team's
// position slot can hold a different coach than the human, confirmed on a
// real save mid-succession). This fallback is deliberately narrower than
// that: it only fires when the coach in the dynasty's KNOWN team+position
// slot has the EXACT name the last successful IsUserControlled sync
// already confirmed was the user (dynasty.userCoachPortrait.name) — a
// genuinely different coach sitting in that slot, the exact failure mode
// that got the old approach pulled, still won't match and still leaves the
// profile frozen rather than guessing wrong. Needs at least one prior
// successful sync to have a known name to check against; a dynasty that's
// never had one stays frozen same as before. Only recovers name/portrait —
// career stats/job security/prestige need the raw Coach row's CareerStats
// resolution, which only happens inside buildUserCoachInfo server-side, so
// those still freeze on a fallback-recovered sync.
//
// @param {object} dynasty - dynasty.userCoachPortrait/.coachPosition
// @param {object} parsed - the raw result from api/cfb27-save-parse.js (userCoachInfo, coachingStaff)
// @param {number} userTid - dynasty.currentTid, already resolved to a Number
// @param {Map<number,number>} rawTeamIdMap - from buildRawTeamIdMap
// @returns {{name: string, genericHeadAssetName: string|null, portraitId: number|null} | null}
export function findUserCoachPortraitFallback(dynasty, parsed, userTid, rawTeamIdMap) {
  if (parsed.userCoachInfo) return null
  if (!dynasty.userCoachPortrait?.name || !parsed.coachingStaff) return null
  const positionKey = { HC: 'headCoach', OC: 'offensiveCoordinator', DC: 'defensiveCoordinator' }[dynasty.coachPosition]
  if (!positionKey) return null
  let rawUserTid = null
  for (const [rawTid, tid] of rawTeamIdMap) {
    if (Number(tid) === Number(userTid)) { rawUserTid = rawTid; break }
  }
  const candidate = rawUserTid != null ? parsed.coachingStaff[rawUserTid]?.[positionKey] : null
  const knownName = String(dynasty.userCoachPortrait.name).trim().toLowerCase()
  if (!candidate?.name || String(candidate.name).trim().toLowerCase() !== knownName) return null
  return {
    name: candidate.name,
    genericHeadAssetName: candidate.generic_head_asset_name ?? null,
    portraitId: candidate.portrait_id ?? null,
  }
}

/**
 * Assemble everything a sync needs to write, from one parsed save and the
 * dynasty's current state. Ties reconcilePlayers/reconcileRecruitingBoard
 * together with the whole-league team ratings/coaching staff/rankings
 * reuse of cfb27SaveImport.js's per-team mappers (same functions
 * createDynasty's CFB27 path already uses, just for update-in-place instead
 * of first-write) and pid assignment for new arrivals.
 *
 * Deliberately does NOT touch `dynasty.games` itself — schedule/score
 * diffing needs `computeScheduleDiff`/`applyScheduleDiff`/`isGamePlayed`
 * (DynastyContext.jsx-only, to avoid a circular import from this pure data
 * module) — the caller feeds `scheduleForUserTeam` + `gameScoresForUserTeam`
 * into those itself.
 *
 * @param {object} dynasty - dynasty.players/.teams/.currentYear/.currentTid
 * @param {object} parsed - the raw result from api/cfb27-save-parse.js
 */
export function buildSyncPlan(dynasty, parsed) {
  const year = Number(dynasty.currentYear)
  const userTid = Number(dynasty.currentTid)
  const existingPlayers = dynasty.players || []
  const dynastyTeams = dynasty.teams || {}

  // Built early (normally computed further down alongside team ratings/
  // coaching staff) — reconcileRecruitingBoard needs it to resolve which
  // team a committed recruit actually landed at, which is not always the
  // user's own team (see that function's header comment).
  const rawTeamIdMap = buildRawTeamIdMap(parsed.players || [], dynastyTeams)

  const playerDiff = reconcilePlayers(parsed.players || [], existingPlayers, { year, dynastyTeams, leavingPlayers: parsed.leavingPlayers })
  const recruitDiff = reconcileRecruitingBoard(parsed.recruitingBoard || [], existingPlayers, {
    userTid,
    year, // the recruiting CLASS year — see reconcileRecruitingBoard's param comment for why NOT +1
    rawTeamIdMap,
    leagueRecruitDirectory: parsed.leagueRecruitDirectory,
  })

  // Assign sequential pids to every brand-new record (roster arrivals +
  // recruiting board creates) — mirrors saveRoster's startPID/nextPIDCounter
  // pattern.
  const maxExistingPid = existingPlayers.reduce((max, p) => Math.max(max, p.pid || 0), 0)
  let nextPid = Math.max(maxExistingPid + 1, dynasty.nextPID || 1)
  const toCreatePlayers = [...playerDiff.toCreate, ...recruitDiff.toCreate].map((p) => ({
    ...p,
    pid: nextPid,
    id: `player-${nextPid++}`,
  }))

  const toUpdatePatches = [...playerDiff.toUpdate, ...recruitDiff.toUpdate].map(({ pid, patch }) => ({ pid, patch }))
  const departurePatches = playerDiff.departures.map(({ pid, patch }) => ({ pid, patch }))

  // Resolve each committed-to-you record's real pid — either a brand-new
  // arrival just assigned one above, or an already-tracked target that's
  // newly committing this sync (matched via reconcileRecruitingBoard's own
  // existingByAssetName/existingByName lookup, so re-use the same lookup
  // here rather than re-deriving it).
  const pidByName = new Map()
  for (const p of toCreatePlayers) pidByName.set(p.name.toLowerCase().trim(), p.pid)
  for (const p of existingPlayers) if (p.isTarget && p.name) pidByName.set(p.name.toLowerCase().trim(), p.pid)
  const resolvedCommittedRecords = recruitDiff.committedRecords
    .map((r) => ({ ...r, pid: pidByName.get(r.name.toLowerCase().trim()) }))
    .filter((r) => r.pid != null)

  // Whole-league team ratings / coaching staff / rankings — direct
  // overwrite (save always wins), same multi-team write shape
  // createDynasty's CFB27 path already uses for first-write.
  const week = Number.isFinite(parsed.season?.week) ? parsed.season.week : 0
  const mergedTeams = { ...dynastyTeams }
  let teamsRatingsUpdated = 0
  let teamsCoachingUpdated = 0
  let recruitingClassesUpdated = 0
  let schoolGradesUpdated = 0
  let statRecordsUpdated = 0

  // Whole-roster pid lookup for depth chart resolution (broader than
  // pidByName above, which is scoped to recruiting targets only — depth
  // chart entries are established roster players). pidByAssetName keeps
  // every candidate per asset_name (not just the last one written) so
  // mapDepthCharts can disambiguate the rare real cross-team collision by
  // the team it's actually resolving.
  const pidByAssetName = new Map()
  const pidByPlayerName = new Map()
  const addAssetNameCandidate = (assetName, pid, tid) => {
    if (!assetName) return
    const arr = pidByAssetName.get(assetName) || []
    arr.push({ pid, tid: tid != null ? Number(tid) : null })
    pidByAssetName.set(assetName, arr)
  }
  for (const p of existingPlayers) {
    addAssetNameCandidate(p.cfb27AssetName, p.pid, p.teamsByYear?.[year] ?? p.team)
    if (p.name) pidByPlayerName.set(p.name.toLowerCase().trim(), p.pid)
  }
  for (const p of toCreatePlayers) {
    addAssetNameCandidate(p.cfb27AssetName, p.pid, p.teamsByYear?.[year] ?? p.team)
    if (p.name) pidByPlayerName.set(p.name.toLowerCase().trim(), p.pid)
  }
  const depthChartUpdates = mapDepthCharts(parsed.depthCharts, rawTeamIdMap, pidByAssetName, pidByPlayerName)

  for (const [, tid] of rawTeamIdMap) {
    const tidKey = String(tid)
    if (mergedTeams[tidKey] === undefined && mergedTeams[tid] === undefined) continue
    const existingTeam = mergedTeams[tidKey] || mergedTeams[tid] || {}
    const byYear = existingTeam.byYear || {}
    const yearData = byYear[year] || {}
    mergedTeams[tidKey] = { ...existingTeam, byYear: { ...byYear, [year]: yearData } }
  }
  for (const [rawTid, tid] of rawTeamIdMap) {
    const tidKey = String(tid)
    const team = mergedTeams[tidKey]
    if (!team) continue
    const yearData = team.byYear[year]
    const ratings = mapTeamRatings(parsed.teamRatings, rawTid)
    const staff = mapCoachingStaff(parsed.coachingStaff, rawTid)
    const recruitingClass = mapTeamRecruitingClass(parsed.leagueRecruitingClasses?.[rawTid], parsed.topClassRanks?.[rawTid])
    const schoolGrades = mapSchoolGrades(parsed.leagueSchoolGrades?.[rawTid])
    const statRecords = mapTeamStatRecords(parsed.leagueStatRecords, rawTid)
    const patchedYear = { ...yearData }
    if (ratings) {
      patchedYear.teamRatings = ratings
      teamsRatingsUpdated += 1
    }
    if (staff) {
      patchedYear.coachingStaff = staff
      teamsCoachingUpdated += 1
    }
    if (recruitingClass) {
      patchedYear.recruitingClassRank = recruitingClass.recruitingClassRank
      patchedYear.recruitingClassConferenceRank = recruitingClass.recruitingClassConferenceRank
      patchedYear.recruitingClassStats = recruitingClass.recruitingClassStats
      // The named roster behind the stats above — every committed recruit
      // league-wide, not just the user's own board (see mapTeamRecruitingClass).
      // This is what lets another team's Commitments tab show real names
      // instead of just the aggregate star-tier counts.
      patchedYear.recruitingClassRoster = recruitingClass.recruitingClassRoster
      recruitingClassesUpdated += 1
    }
    if (schoolGrades) {
      patchedYear.schoolGrades = schoolGrades
      schoolGradesUpdated += 1
    }
    if (statRecords) statRecordsUpdated += 1
    mergedTeams[tidKey] = {
      ...team,
      // statRecords is deliberately NOT nested under byYear[year] like the
      // fields above it — it's the save's CURRENT record book state (same
      // as leagueStatRecords at the dynasty level), not a fact that differs
      // per season. Writing it into byYear on every sync would duplicate
      // ~3.5 KB/team into every single year's slot forever — for a 130+
      // team dynasty that's already ~450 KB added per season of syncing,
      // well on its way to tripping Firestore's 1 MiB per-doc cap within a
      // couple seasons (the exact failure mode documented in
      // seasonSubcollection.js for weekRecapsByYear/allAmericansByYear,
      // except `teams` isn't covered by that subcollection system at all).
      // A flat, overwritten-every-sync field keeps this at a constant size
      // regardless of how many seasons the dynasty has played.
      ...(statRecords ? { statRecords } : {}),
      byYear: { ...team.byYear, [year]: patchedYear },
    }
  }

  // The main loop above keys ratings by raw TeamIndex, but all 5 FCS filler
  // teams (East/Midwest/Northwest/Southeast/West) share TeamIndex 255 — so
  // at most one of them got real ratings there, and whichever one did may
  // have gotten a DIFFERENT filler's ratings misattributed to it. Apply each
  // filler's own correctly-named rating directly via FCS_FILLER_NAME_TO_TID
  // (parsed.fcsFillerRatings is keyed by name, not raw id, specifically to
  // dodge this collision) — same fix pattern already used for their names.
  for (const [fcsName, fcsTid] of Object.entries(FCS_FILLER_NAME_TO_TID)) {
    const tidKey = String(fcsTid)
    const team = mergedTeams[tidKey] || mergedTeams[fcsTid]
    if (!team) continue
    const ratings = mapTeamRatings(parsed.fcsFillerRatings, fcsName)
    if (!ratings) continue
    const yearData = team.byYear?.[year] || {}
    const patchedYear = { ...yearData, teamRatings: ratings }
    mergedTeams[tidKey] = { ...team, byYear: { ...team.byYear, [year]: patchedYear } }
    teamsRatingsUpdated += 1
  }

  // A sync writes real ratings/coaching-staff/schedule data for the user's
  // own team just like creation does — flip the same preseasonSetup flags
  // creation sets (DynastyContext.jsx's createDynasty CFB27 path), or the
  // Dashboard checklist and the Advance-Week gate keep treating this as
  // never-entered even though the data is now there.
  {
    const tidKey = String(userTid)
    const team = mergedTeams[tidKey]
    if (team) {
      const yearData = team.byYear[year] || {}
      mergedTeams[tidKey] = {
        ...team,
        byYear: {
          ...team.byYear,
          [year]: {
            ...yearData,
            preseasonSetup: {
              ...(yearData.preseasonSetup || {}),
              rosterEntered: true,
              teamRatingsEntered: true,
              coachingStaffEntered: true,
              scheduleEntered: true,
              conferencesEntered: true,
            },
          },
        },
      }
    }
  }

  // Commitments tab reads teams[tid].byYear[year].recruitingCommitments.edit
  // — NOT commitmentTid off the player record — so a newly-committed target
  // needs an entry written here too, or it'll never show up there even
  // though the player record itself is fully correct.
  //
  // Runs every sync (not gated on resolvedCommittedRecords.length) because
  // this also has to PRUNE, not just add: a CFB27-tracked ledger entry
  // (cfb27AssetName set) that ISN'T reconfirmed this sync is stale — most
  // concretely, a recruit a past sync wrongly credited as committed to us
  // (fixed in reconcileRecruitingBoard, but that fix only stops NEW bad
  // entries — it does nothing about one already sitting in the ledger from
  // before, since nothing else here ever removes an entry). "Save always
  // wins" for the slice this sync owns. Manually-added entries (no
  // cfb27AssetName) are never touched — this sync doesn't own those.
  {
    const tidKey = String(userTid)
    const team = mergedTeams[tidKey]
    if (team) {
      const yearData = team.byYear[year] || {}
      const existingCommitments = yearData.recruitingCommitments?.edit || []
      // Presence of the KEY, not truthiness of its value — a CFB27-synced
      // recruit commonly has cfb27AssetName === '' (empty string, still a
      // real key this sync wrote), which a truthiness check would wrongly
      // read as "manually added" and protect from pruning forever. A
      // manually-added entry (recruitingTargets.js's toCommitmentRecord)
      // never has this key at all.
      const manualEntries = existingCommitments.filter((r) => r.cfb27AssetName === undefined)
      const byPid = new Map(manualEntries.map((r) => [r.pid, r]))
      for (const r of resolvedCommittedRecords) byPid.set(r.pid, r)
      const nextEdit = [...byPid.values()]
      if (JSON.stringify(nextEdit) !== JSON.stringify(existingCommitments)) {
        mergedTeams[tidKey] = {
          ...team,
          byYear: {
            ...team.byYear,
            [year]: {
              ...yearData,
              recruitingCommitments: { ...(yearData.recruitingCommitments || {}), edit: nextEdit },
            },
          },
        }
      }
    }
  }

  const rankings = mapPreseasonTop25(parsed.teamRankings, rawTeamIdMap, dynastyTeams) // {rank, team, tid}[]; name is generic despite the "preseason" framing
  // Once the save itself reports 'offseason', the season is genuinely over
  // and there is no next poll coming — parsed.teamRankings at this exact
  // moment IS the season's real Final Top 25 (the same media poll shown on
  // the save's own "End of Season Recap > Final Top 25" screen), not just
  // this week's snapshot. Also stamped into the app's dedicated Final Poll
  // slot (week 105 — see Rankings.jsx's weekLabel/hasFinalInRankByWeek) so
  // it shows up as a real, selectable "Final Poll" entry there and lights
  // up the Dashboard's Final Top 25 task, instead of being reachable only
  // by manually finding whatever ordinary week number the save happened to
  // report — which is where a PC dynasty's Final Top 25 was invisible
  // before this, even though the sync had been capturing the data all
  // along under a plain numbered week nothing recognized as "final."
  const isFinalPollSync = parsed.season?.phase === 'offseason'
  for (const entry of rankings) {
    const tidKey = String(entry.tid)
    const team = mergedTeams[tidKey]
    if (!team) continue
    const yearData = team.byYear[year] || {}
    mergedTeams[tidKey] = {
      ...team,
      byYear: {
        ...team.byYear,
        [year]: { ...yearData, rankByWeek: buildRankByWeekPatch(yearData.rankByWeek, week, entry.rank, isFinalPollSync) },
      },
    }
  }

  // Conference alignment — refreshed from the save's own Conference table
  // (parsed.conferences, the same authoritative source CreateDynasty.jsx
  // uses) on EVERY sync, not just once at dynasty creation. Before this,
  // teams[tid].byYear[year].conference — the single source of truth
  // getCustomConferencesForYear reads for CC History / Conf. Standings /
  // isConferenceGame — was captured ONE TIME at creation and never touched
  // again by the regular sync. Any team wrong or missing in that initial
  // snapshot (or moved by in-season realignment afterward) stayed wrong
  // forever with no self-correction — confirmed as the actual cause of CC
  // History misattributing games between conferences that share teams over
  // time (e.g. Conference USA <-> Sun Belt realignment). Writing it here
  // every sync makes conference membership fully self-healing, same as
  // every other synced field.
  for (const conf of parsed.conferences || []) {
    for (const rawTid of conf.teamIds || []) {
      const tid = rawTeamIdMap.get(rawTid)
      if (tid == null) continue
      const tidKey = String(tid)
      const team = mergedTeams[tidKey]
      if (!team) continue
      const yearData = team.byYear[year] || {}
      if (yearData.conference === conf.name) continue
      mergedTeams[tidKey] = {
        ...team,
        byYear: {
          ...team.byYear,
          [year]: { ...yearData, conference: conf.name },
        },
      }
    }
  }

  // CFP Committee Poll — a SEPARATE ranking from the Media Poll above (see
  // extractPlayers.cjs's buildTeamMaps for why: verified against a real
  // save that the two genuinely disagree, e.g. Media Poll had Georgia #1/
  // Miami #2 while CFP Poll had Miami #1/Georgia #2). The real in-game CFP
  // Bracket screen seeds off THIS poll, not rankByWeek — stored under its
  // own cfpRankByWeek field so Rankings.jsx's Top 25 (which is legitimately
  // about the Media Poll) is never affected.
  const cfpPollRankings = mapPreseasonTop25(parsed.cfpRankings, rawTeamIdMap, dynastyTeams)
  for (const entry of cfpPollRankings) {
    const tidKey = String(entry.tid)
    const team = mergedTeams[tidKey]
    if (!team) continue
    const yearData = team.byYear[year] || {}
    mergedTeams[tidKey] = {
      ...team,
      byYear: {
        ...team.byYear,
        [year]: { ...yearData, cfpRankByWeek: { ...(yearData.cfpRankByWeek || {}), [week]: entry.rank } },
      },
    }
  }

  // Schedule/scores for the user's own team — raw material for the caller's
  // computeScheduleDiff/applyScheduleDiff + isGamePlayed pass.
  const userCcgWeek = parsed.season?.conferenceChampionshipWeek ?? null
  const ccgUserWeek = (w) => (userCcgWeek != null && w === userCcgWeek ? APP_CCG_WEEK : w)
  const scheduleForUserTeam = mapScheduleForTeam(parsed.games, rawTeamIdMap, userTid, dynastyTeams, userCcgWeek)
  const gameScoresForUserTeam = (parsed.games || [])
    .filter((g) => g.weekType === 'RegularSeason' && g.status !== 'Unplayed')
    .map((g) => {
      // TeamIndex 255 is the FCS-filler sentinel (see FCS_FILLER_NAME_TO_TID's
      // comment) — rawTeamIdMap has no entry for it, so without this resolved
      // through the name instead, homeTid/awayTid comes back null for the FCS
      // side and the game never matches applyCfb27GameScores' tid check below,
      // silently leaving the user's OWN played FCS games stuck at "Upcoming"
      // with no score ever applied.
      const homeTid = g.homeTeamId === 255 ? FCS_FILLER_NAME_TO_TID[g.homeTeam] ?? null : rawTeamIdMap.get(g.homeTeamId)
      const awayTid = g.awayTeamId === 255 ? FCS_FILLER_NAME_TO_TID[g.awayTeam] ?? null : rawTeamIdMap.get(g.awayTeamId)
      if (homeTid !== userTid && awayTid !== userTid) return null
      return {
        // Same raw->app week mapping the schedule above uses. These scores are
        // matched to schedule entries BY WEEK, so a CCG normalized on one side
        // and left raw on the other would leave the conference championship
        // permanently scoreless ("Upcoming") even once it had been played.
        week: ccgUserWeek(g.week), homeTid, awayTid, homeScore: g.homeScore, awayScore: g.awayScore,
        homeQuarters: [g.home_score_q1, g.home_score_q2, g.home_score_q3, g.home_score_q4],
        awayQuarters: [g.away_score_q1, g.away_score_q2, g.away_score_q3, g.away_score_q4],
        homeOT: g.home_score_ot, awayOT: g.away_score_ot,
      }
    })
    .filter(Boolean)

  const seasonInfo = mapSeasonInfo(parsed.season)

  // Box scores (team + player stat lines) for the user's own played games —
  // separate from the whole-league pass below since it shares the existing,
  // already-verified computeScheduleDiff/applyScheduleDiff pipeline in
  // DynastyContext.jsx rather than the standalone upsert path CPU games use.
  const boxScoresByWeek = buildBoxScoresForUserGames(parsed, rawTeamIdMap, dynastyTeams, userTid)

  // Every OTHER team's games (whole-league, per the user's ask) — minimal-
  // diff by construction, so a routine weekly sync only touches that week's
  // ~60-70 new results, not the full 891-game season every time.
  const cpuGames = buildWholeLeagueGames(parsed, rawTeamIdMap, dynastyTeams, dynasty.games || [], userTid, year)

  // Whole-league weekly Players of the Week (national + per-conference) —
  // pure identity (name/position/team/photo) only. The actual stat line
  // ("3 TKL, 1 INT, 2 PBU, 1 TD") is deliberately NOT computed here — it's
  // derived at render time from that week's already-synced box score
  // (PlayerAward.AwardScore is always 0 in the save, not usable), so it can
  // never go stale relative to a later box-score fix.
  const playersOfWeekUpdate = {}
  for (const [weekStr, sides] of Object.entries(parsed.playerAwards?.national || {})) {
    const w = Number(weekStr)
    if (!playersOfWeekUpdate[w]) playersOfWeekUpdate[w] = {}
    playersOfWeekUpdate[w].national = {
      ...(sides.offensive ? { offensive: mapPlayerOfWeekEntry(sides.offensive, rawTeamIdMap) } : {}),
      ...(sides.defensive ? { defensive: mapPlayerOfWeekEntry(sides.defensive, rawTeamIdMap) } : {}),
    }
  }
  for (const [weekStr, byConf] of Object.entries(parsed.playerAwards?.conference || {})) {
    const w = Number(weekStr)
    if (!playersOfWeekUpdate[w]) playersOfWeekUpdate[w] = {}
    playersOfWeekUpdate[w].byConference = {}
    for (const [confName, sides] of Object.entries(byConf)) {
      playersOfWeekUpdate[w].byConference[confName] = {
        ...(sides.offensive ? { offensive: mapPlayerOfWeekEntry(sides.offensive, rawTeamIdMap) } : {}),
        ...(sides.defensive ? { defensive: mapPlayerOfWeekEntry(sides.defensive, rawTeamIdMap) } : {}),
      }
    }
  }

  // Heisman Watch — the save only ever carries ONE live top-4 ranking (not
  // a per-week history table like PlayerAward), so this sync's snapshot
  // lands under the save's own current week; syncing week after week
  // naturally builds a week-by-week history in dynasty.heismanWatchByYear.
  const heismanWatchUpdate = { [week]: (parsed.heismanWatch || []).map((h) => mapHeismanEntry(h, rawTeamIdMap)) }

  // Rivalries — auto-seed/gap-fill dynasty.rivalries[] (a flat array, not
  // nested per-team-per-year like everything else above) with the user's
  // OWN team's real rivals from the save. Never overwrites an existing
  // name/formedYear — the user's own creative trophy naming/description/
  // image system is a completely separate, untouched concern — only fills
  // gaps and adds brand-new entries for real rivalries not yet tracked.
  let rawUserTid = null
  for (const [raw, tid] of rawTeamIdMap) {
    if (tid === userTid) { rawUserTid = raw; break }
  }
  const mappedRivalries = rawUserTid != null
    ? mapLeagueRivalries(parsed.leagueRivalries?.[rawUserTid], rawTeamIdMap)
    : []
  const existingRivalries = dynasty.rivalries || []
  const existingRivalryByTid = new Map(existingRivalries.map((r) => [Number(r.rivalTid), r]))
  const rivalriesToAdd = []
  const rivalriesToPatch = []
  for (const mr of mappedRivalries) {
    const existing = existingRivalryByTid.get(mr.rivalTid)
    if (!existing) {
      rivalriesToAdd.push({
        id: `cfb27-rival-${mr.rivalTid}`,
        rivalTid: mr.rivalTid,
        formedYear: mr.formedYear,
        active: true,
        name: mr.name,
        trophyName: null,
        manuallyAdded: false,
        dismissed: false,
      })
    } else {
      const patch = {}
      if (existing.name == null && mr.name != null) patch.name = mr.name
      if (existing.formedYear == null && mr.formedYear != null) patch.formedYear = mr.formedYear
      if (Object.keys(patch).length) rivalriesToPatch.push({ id: existing.id, patch })
    }
  }

  // NFL Draft Results — mirrors handleDraftResultsSave's (Dashboard.jsx)
  // exact write shape so the manual Google-Sheet flow and this sync stay
  // fully interchangeable. playerDiff.draftedPlayers already carries only
  // departures with a real, non-sentinel PLYR_DRAFTROUND value.
  const draftResultsByTid = new Map()
  for (const d of playerDiff.draftedPlayers) {
    if (d.tid == null) continue
    const list = draftResultsByTid.get(d.tid) || []
    list.push({ playerName: d.playerName, pid: d.pid, position: d.position, overall: d.overall, draftRound: d.draftRound })
    draftResultsByTid.set(d.tid, list)
  }
  const draftResultsUpdate = Object.fromEntries(
    [...draftResultsByTid.entries()].map(([tid, results]) => [tid, results])
  )

  // Bowl + full CFP bracket results — EVERY team including the user's own
  // (unlike buildWholeLeagueGames above, which is CPU-only regular-season).
  // cfpSlot identification now comes directly from the save's own fixed
  // bracket structure (see buildPostseasonGames/PLAYOFF_SLOT_TO_CFP_SLOT) —
  // no ranking-based guessing involved.
  const postseasonGames = buildPostseasonGames(parsed, rawTeamIdMap, dynastyTeams, dynasty.games || [], year)

  // Real CFP seed list + bowl-host config, mirroring CFPSeedsModal's exact
  // save shape — null until the bracket is actually locked (see
  // deriveCFPSeeds's header comment), in which case cfpSeedsUpdate below
  // stays null and the existing dynasty.cfpSeedsByYear (if any) is untouched.
  const cfpSeeds = deriveCFPSeeds(parsed, rawTeamIdMap)

  // Season-end honors — National All-Americans, All-Conference teams, and
  // named individual awards (Heisman, Maxwell, etc.), all sourced from the
  // save's real PlayerAward table (extractPlayers.cjs's buildLeagueHonors)
  // instead of manual AI-assisted entry. Null (untouched) until the save
  // actually has real honorees — an early-season sync shouldn't wipe
  // last year's still-displayed awards with an empty set.
  //
  // Preseason 1st/2nd Team predictions (allAmericansPreseason, same table,
  // see ALL_AM_PRESEASON_AWARD_TYPES) are gap-filled the same way but into
  // separate allAmericansPreseason/allConferencePreseason keys — never
  // written over the final list, purely a fallback the UI shows only when
  // the final list for that year is still empty. Included in the same
  // update object (and same non-null gate, extended to also fire on
  // preseason-only data) so a dynasty synced before the season's regular
  // games start still gets SOMETHING to show instead of "No All-Americans
  // Yet".
  const rawHonors = parsed.leagueHonors?.allAmericans
  const rawHonorsPreseason = parsed.leagueHonors?.allAmericansPreseason
  const hasFinalHonors = rawHonors?.national?.length || rawHonors?.conference?.length
  const hasPreseasonHonors = rawHonorsPreseason?.national?.length || rawHonorsPreseason?.conference?.length
  const allAmericansUpdate = (hasFinalHonors || hasPreseasonHonors)
    ? {
        ...(hasFinalHonors ? {
          allAmericans: (rawHonors.national || []).map((e) => mapHonorEntry(e, rawTeamIdMap, dynastyTeams)),
          allConference: (rawHonors.conference || []).map((e) => mapHonorEntry(e, rawTeamIdMap, dynastyTeams)),
        } : {}),
        ...(hasPreseasonHonors ? {
          allAmericansPreseason: (rawHonorsPreseason.national || []).map((e) => mapHonorEntry(e, rawTeamIdMap, dynastyTeams)),
          allConferencePreseason: (rawHonorsPreseason.conference || []).map((e) => mapHonorEntry(e, rawTeamIdMap, dynastyTeams)),
        } : {}),
      }
    : null

  // Record book (Career/Game/Season x National/Conference) — team-scoped
  // records are folded into each team's own byYear.statRecords above; this
  // is just the National + Conference portion, small and flat (not
  // year-keyed — always overwritten wholesale with the save's CURRENT
  // record-book state, same as the in-game screen always showing current
  // records rather than a history). See extractPlayers.cjs's
  // buildLeagueStatRecords for the save shape / verification.
  const rawStatRecords = parsed.leagueStatRecords
  const hasStatRecords = rawStatRecords && ['career', 'game', 'season'].some(
    (tf) => rawStatRecords[tf]?.national?.length || Object.keys(rawStatRecords[tf]?.conference || {}).length
  )
  const leagueStatRecordsUpdate = hasStatRecords
    ? Object.fromEntries(['career', 'game', 'season'].map((tf) => [
        tf,
        { national: rawStatRecords[tf]?.national || [], conference: rawStatRecords[tf]?.conference || {} },
      ]))
    : null

  const rawNamedAwards = parsed.leagueHonors?.namedAwards
  const awardsUpdate = rawNamedAwards && Object.keys(rawNamedAwards).length
    ? Object.fromEntries(
        Object.entries(rawNamedAwards).map(([key, raw]) => [key, mapAwardEntry(raw, rawTeamIdMap, dynastyTeams)])
      )
    : null

  // User job-change detection — Coach.IsUserControlled (extractPlayers.cjs's
  // buildUserCoachInfo) tells us definitively which team/position the human
  // is ACTUALLY coaching in the save right now. If that differs from what
  // this dynasty has tracked, the user took a real in-game job — no
  // "Taking a New Job?" prompt needed. Mirrors handleNewJobSave's exact
  // write shape (Dashboard.jsx) so the rest of that existing flow
  // (pendingUserId, etc.) keeps working unchanged regardless of whether the
  // job change was detected here or answered manually.
  let userJobChange = null
  // Set when this sync's coach identity now correctly matches the dynasty's
  // OWN tracked team again — the counterpart to userJobChange above, for
  // clearing a stale newJobData flag a PREVIOUS sync left behind (e.g. the
  // user accidentally synced a different save/dynasty's file once, saw an
  // incorrect "Taking a New Job" banner, then re-synced with the correct
  // file). Without this, userJobChange only ever WRITES newJobData, never
  // clears it — a wrong-file sync's flag would stick around forever even
  // after a correct re-sync, since "no mismatch this time" and "never had
  // one" produce the exact same (null) userJobChange otherwise.
  let userJobChangeResolved = false
  const userCoachPortraitFallback = findUserCoachPortraitFallback(dynasty, parsed, userTid, rawTeamIdMap)
  // The human's own real headshot — read directly off the SAME
  // IsUserControlled row used for job-change detection above, not
  // cross-referenced through mergedTeams' byTeam+position coaching staff
  // map. Verified against a real save those two can disagree (a team's
  // "headCoach" position slot held a different coach than the row actually
  // flagged as the human) — IsUserControlled is the only reliable way to
  // identify the specific coach that's really the user, EXCEPT for the
  // narrow name-matched fallback above.
  const userCoachPortrait = parsed.userCoachInfo
    ? {
        name: parsed.userCoachInfo.name ?? null,
        genericHeadAssetName: parsed.userCoachInfo.generic_head_asset_name ?? null,
        portraitId: parsed.userCoachInfo.portrait_id ?? null,
      }
    : userCoachPortraitFallback

  // Real, save-authoritative career win/loss totals for the human coach — a
  // full overwrite every sync (lifetime counters the save itself maintains,
  // so last-synced value is always correct; no merge logic needed).
  // CoachCareer.jsx uses these to cover seasons before this dynasty started
  // tracking games, preferring its own game-derived record whenever this
  // saved total is behind. Job security/prestige/bowl-and-title counters
  // used to be synced here too; trimmed since nothing in the app displays
  // them — see buildUserCoachInfo's header comment in extractPlayers.cjs.
  const userCoachCareerStats = parsed.userCoachInfo
    ? { ...(parsed.userCoachInfo.careerStats || {}) }
    : null
  // Diagnostic for "my own coach profile isn't updating" reports —
  // userCoachCareerStats/userCoachPortrait are merge-only writes (only set
  // below "when present"), so a null userCoachInfo here means THIS sync
  // wrote neither, and whatever profile is showing is frozen on an earlier
  // sync's data, not actually refreshed.
  if (!parsed.userCoachInfo) {
    const d = parsed.userCoachInfoDiagnostics
    const diagText = d ? `${d.nonEmptyRows} Coach row(s) read, ${d.userControlledRows} had IsUserControlled set.` : '(no diagnostics returned)'
    if (userCoachPortraitFallback) {
      console.warn(`[cfb27Sync] userCoachInfo: came back null, but the team+name fallback matched — name/portrait refreshed anyway this sync (career stats/job security still frozen). ${diagText}`)
    } else {
      console.warn(`[cfb27Sync] userCoachInfo: came back null — your own coach profile was NOT updated by this sync (frozen on old data). ${diagText}`)
    }
  }
  if (parsed.userCoachInfo) {
    const newTid = rawTeamIdMap.get(parsed.userCoachInfo.rawTid)
    const newPosition = parsed.userCoachInfo.position
    if (newTid != null) {
      if (Number(newTid) !== Number(userTid) || newPosition !== dynasty.coachPosition) {
        userJobChange = { tid: newTid, position: newPosition }
      } else if (dynasty.newJobData?.takingNewJob) {
        userJobChangeResolved = true
      }
    }
  }

  // Coach Carousel — pending job offers from OTHER schools for the user's
  // OWN coach (extractPlayers.cjs's buildCoachOffers). Always a full
  // replace, never merged with a prior sync's list — these only exist
  // while genuinely live in the save (bowl season, hot-seat/poaching
  // window), and an offer that's since disappeared from the save (declined,
  // expired, or the carousel resolved) should disappear here too.
  const coachOffersUpdate = (parsed.coachOffers || [])
    .map((o) => mapCoachOffer(o, rawTeamIdMap, dynastyTeams))
    .filter(Boolean)

  return {
    toCreatePlayers,
    toUpdatePatches,
    departurePatches,
    mergedTeams,
    scheduleForUserTeam,
    gameScoresForUserTeam,
    boxScoresByWeek,
    cpuGamesToWrite: cpuGames.toWrite,
    cpuGamesToDelete: cpuGames.toDelete,
    postseasonGamesToWrite: postseasonGames,
    depthChartUpdates,
    playersOfWeekUpdate,
    heismanWatchUpdate,
    rivalriesToAdd,
    rivalriesToPatch,
    draftResultsUpdate,
    cfpSeedsUpdate: cfpSeeds,
    allAmericansUpdate,
    awardsUpdate,
    leagueStatRecordsUpdate,
    userJobChange,
    userJobChangeResolved,
    userCoachPortrait,
    userCoachCareerStats,
    coachOffersUpdate,
    seasonInfo,
    unresolvedTeamNames: playerDiff.unresolvedTeamNames,
    summary: {
      playersUpdated: playerDiff.stats.updated,
      arrivals: playerDiff.stats.arrivals,
      departures: playerDiff.stats.departures,
      transfers: playerDiff.stats.transfers,
      recruitingTargets: recruitDiff.stats.targets,
      teamsRatingsUpdated,
      teamsCoachingUpdated,
      recruitingClassesUpdated,
      schoolGradesUpdated,
      statRecordsUpdated,
      rankingsUpdated: rankings.length,
      boxScoresAdded: Object.keys(boxScoresByWeek).length + cpuGames.stats.boxScoresAdded,
      cpuGamesUpdated: cpuGames.stats.gamesTouched,
      postseasonGamesUpdated: postseasonGames.length,
      depthChartsUpdated: Object.keys(depthChartUpdates).length,
      rivalriesAdded: rivalriesToAdd.length,
      rivalriesPatched: rivalriesToPatch.length,
      draftResultsTeams: Object.keys(draftResultsUpdate).length,
      cfpSeedsLocked: cfpSeeds != null,
      allAmericansUpdated: allAmericansUpdate != null,
      awardsUpdated: awardsUpdate ? Object.keys(awardsUpdate).length : 0,
      leagueStatRecordsUpdated: leagueStatRecordsUpdate != null,
      userJobChangeDetected: userJobChange != null,
      userJobChangeResolved,
      coachOffersFound: coachOffersUpdate.length,
    },
  }
}

// Maps a raw TeamStats row (see extractPlayers.cjs's TEAM_GAME_STAT_FIELDS)
// into the exact field names Game.jsx/boxScoreHelpers.js expect on
// `game.boxScore.teamStatsByTid[tid]` — see that file's header comment for
// the canonical shape. POSSESSIONTIME's exact unit hasn't been confirmed
// against a labeled reference (only cross-checked indirectly via a
// plausible mm:ss split) — best-effort, not verified like the other fields.
function mapTeamGameStats(raw, teamAbbr) {
  if (!raw) return null
  const possSecondsTotal = Number(raw.POSSESSIONTIME) || 0
  const punts = Number(raw.PUNTS) || 0
  const redZones = Number(raw.OFFREDZONES) || 0
  return {
    teamAbbr,
    firstDowns: raw.FIRSTDOWNS ?? null,
    totalOffense: raw.OFFYARDS ?? null,
    rushAttempts: raw.RUSHATTEMPTS ?? null,
    rushYards: raw.OFFRUSHYARDS ?? null,
    rushTds: raw.RUSHTDS ?? null,
    // No dedicated "total plays" field exists on the save's TeamStats table
    // (checked directly — 58 fields, none play-related) — derived the same
    // way Dashboard.jsx's manual-entry stats already compute it: rush + pass
    // attempts, no sacks.
    totalPlays: (Number(raw.RUSHATTEMPTS) || 0) + (Number(raw.PASSATTEMPTS) || 0),
    completions: raw.PASSCOMPLETIONS ?? null,
    passAttempts: raw.PASSATTEMPTS ?? null,
    passTds: raw.PASSTDS ?? null,
    passingYards: raw.OFFPASSYARDS ?? null,
    '3rdDownConv': raw.THIRDDOWNCONV ?? null,
    '3rdDownAtt': raw.THIRDDOWNS ?? null,
    '4thDownConv': raw.FOURTHDOWNCONV ?? null,
    '4thDownAtt': raw.FOURTHDOWNS ?? null,
    '2ptConv': raw.TWOPOINTCONVMADE ?? null,
    '2ptAtt': raw.TWOPOINTCONVATTEMPTS ?? null,
    redZoneTd: raw.OFFREDZONETDS ?? null,
    redZoneFg: raw.OFFREDZONEFGS ?? null,
    redZonePct: redZones ? Math.round(((raw.OFFREDZONETDS || 0) + (raw.OFFREDZONEFGS || 0)) / redZones * 100) : null,
    turnovers: raw.GIVEAWAYS ?? null,
    fumblesLost: raw.FUMBLESLOST ?? null,
    interceptions: raw.PASSINTS ?? null,
    puntRetYards: raw.PUNTRETURNYARDS ?? null,
    kickRetYards: raw.KICKRETURNYARDS ?? null,
    totalYards: raw.TOTALYARDS ?? null,
    puntAvg: punts ? Math.round((raw.PUNTYARDS / punts) * 10) / 10 : null,
    penalties: raw.PENALTIES ?? null,
    penaltyYards: raw.PENALTYYARDS ?? null,
    possMinutes: Math.floor(possSecondsTotal / 60),
    possSeconds: possSecondsTotal % 60,
  }
}

// Maps one player's raw weekly stat entry (extractPlayers.cjs's
// buildGameStats output — one row covering passing+rushing+receiving
// together for 'offensive', defense together for 'defensive', kicking+
// punting together for 'kicking') into zero or more app-shaped category
// entries — a QB who also ran the ball emits BOTH a passing and a rushing
// entry from the SAME source row, matching how the app's category arrays
// already work. Gated on actually having done something in that category
// (e.g. RUSHATTEMPTS > 0) so a lineman's all-zero offensive row doesn't
// produce a phantom rushing entry.
function mapPlayerGameStatEntries(entry) {
  const { first_name, last_name, raw, source } = entry
  const playerName = `${first_name || ''} ${last_name || ''}`.trim()
  const out = []

  if (source === 'offensive') {
    if ((raw.PASSATTEMPTS || 0) > 0) {
      out.push({
        category: 'passing',
        stat: {
          playerName,
          comp: raw.PASSCOMPLETED ?? 0,
          attempts: raw.PASSATTEMPTS ?? 0,
          yards: raw.PASSYARDS ?? 0,
          tD: raw.PASSTDS ?? 0,
          iNT: raw.PASSINTS ?? 0,
          long: raw.PASSLONGEST ?? 0,
        },
      })
    }
    if ((raw.RUSHATTEMPTS || 0) > 0) {
      out.push({
        category: 'rushing',
        stat: {
          playerName,
          carries: raw.RUSHATTEMPTS ?? 0,
          yards: raw.RUSHYARDS ?? 0,
          tD: raw.RUSHTDS ?? 0,
          fumbles: raw.RUSHFUMBLES ?? 0,
          brokenTackles: raw.RUSHBROKENTACKLES ?? 0,
          yAC: raw.RUSHYARDSAFTER1STHIT ?? 0,
          long: raw.RUSHLONGEST ?? 0,
          '20+': raw.RUSH20YARDRUNS ?? 0,
        },
      })
    }
    if ((raw.RECEIVECATCHES || 0) > 0 || (raw.RECEIVEDROPS || 0) > 0) {
      out.push({
        category: 'receiving',
        stat: {
          playerName,
          receptions: raw.RECEIVECATCHES ?? 0,
          yards: raw.RECEIVEYARDS ?? 0,
          tD: raw.RECEIVETDS ?? 0,
          rAC: raw.RECEIVEYARDSAFTER ?? 0,
          long: raw.RECEIVELONGEST ?? 0,
          drops: raw.RECEIVEDROPS ?? 0,
        },
      })
    }
  } else if (source === 'defensive') {
    // DOWNSPLAYED (a genuine snaps-played field, distinct from every
    // counting stat below) catches a real appearance with zero recorded
    // production — verified against a real save: a defender with a true
    // 1-snap game and every counting stat at 0 was previously invisible in
    // the extracted box score entirely (no field here would ever go
    // non-zero for that game), which silently undercounted his season
    // gamesPlayed by exactly that game.
    const hasActivity = ['DEFTACKLES', 'ASSDEFTACKLES', 'DLINESACKS', 'DSECINTS', 'DEFPASSDEFLECTIONS', 'DLINEFORCEDFUMBLES', 'DLINEFUMBLERECOVERIES', 'DOWNSPLAYED']
      .some((f) => (raw[f] || 0) > 0)
    if (hasActivity) {
      out.push({
        category: 'defense',
        stat: {
          playerName,
          solo: raw.DEFTACKLES ?? 0,
          assists: raw.ASSDEFTACKLES ?? 0,
          tFL: raw.DEFTACKLESFORLOSS ?? 0,
          sack: (raw.DLINESACKS ?? 0) + (raw.DLINEHALFSACK ?? 0) * 0.5,
          iNT: raw.DSECINTS ?? 0,
          iNTYards: raw.DSECINTRETURNYARDS ?? 0,
          iNTLong: raw.DSECINTLONGESTRETURN ?? 0,
          deflections: raw.DEFPASSDEFLECTIONS ?? 0,
          fF: raw.DLINEFORCEDFUMBLES ?? 0,
          fR: raw.DLINEFUMBLERECOVERIES ?? 0,
          fumbleYards: raw.DLINEFUMBLERECOVERYYARDS ?? 0,
          safeties: raw.DLINESAFETIES ?? 0,
          tD: (raw.DLINEFUMBLETDS ?? 0) + (raw.DSECINTTDS ?? 0),
        },
      })
    }
  } else if (source === 'kicking') {
    if ((raw.KICKFGATTEMPTS || 0) > 0 || (raw.KICKEPATTEMPTS || 0) > 0) {
      out.push({
        category: 'kicking',
        stat: {
          playerName,
          fGM: raw.KICKFGMADE ?? 0,
          fGA: raw.KICKFGATTEMPTS ?? 0,
          fGLong: raw.KICKFGLONGEST ?? 0,
          fGBlock: raw.KICKFGBLOCKED ?? 0,
          xPM: raw.KICKEPMADE ?? 0,
          xPA: raw.KICKEPATTEMPTS ?? 0,
          xPB: raw.KICKEPBLOCKED ?? 0,
          fGM29: raw.KICKFGMADE29ORLESS ?? 0,
          fGA29: raw.KICKFGATTEMPTS29ORLESS ?? 0,
          fGM39: raw.KICKFGMADE30TO39 ?? 0,
          fGA39: raw.KICKFGATTEMPTS30TO39 ?? 0,
          fGM49: raw.KICKFGMADE40TO49 ?? 0,
          fGA49: raw.KICKFGATTEMPTS40TO49 ?? 0,
          'fGM50+': raw.KICKFGMADE50ORMORE ?? 0,
          'fGA50+': raw.KICKFGATTEMPTS50ORMORE ?? 0,
          kickoffs: raw.KICKNUMKICKOFFS ?? 0,
          touchbacks: raw.KICKTOUCHBACKS ?? 0,
        },
      })
    }
    if ((raw.PUNTATTEMPTS || 0) > 0) {
      out.push({
        category: 'punting',
        stat: {
          playerName,
          punts: raw.PUNTATTEMPTS ?? 0,
          yards: raw.PUNTYARDS ?? 0,
          netYards: raw.PUNTNETYARDS ?? 0,
          block: raw.PUNTBLOCKED ?? 0,
          in20: raw.PUNTIN20 ?? 0,
          tB: raw.PUNTTOUCHBACKS ?? 0,
          long: raw.PUNTLONGEST ?? 0,
        },
      })
    }
  } else if (source === 'oline') {
    // Gated on GAMESSTARTED rather than pancakes/sacksAllowed > 0 — unlike
    // the other categories, a starting lineman with a clean 0/0 game is
    // still real, relevant data (confirmed against the real in-game Blocking
    // tab: several starters listed with 0 sacks-allowed and 0 pancakes).
    if ((raw.GAMESSTARTED || 0) > 0) {
      out.push({
        category: 'blocking',
        stat: {
          playerName,
          pancakes: raw.OLINEPANCAKES ?? 0,
          sacksAllowed: raw.OLINESACKSALLOWED ?? 0,
        },
      })
    }
  }

  // Kick/punt-return fields are bundled onto a return specialist's normal
  // offensive or defensive row (GameOffensiveKPReturnStats/
  // GameDefensiveKPReturnStats), not their own category table — checked
  // independently of `source` so a player who's ALSO a return man still
  // gets both their base-category entry above and a return entry here from
  // the same row.
  if ((raw.KRETATTEMPTS || 0) > 0) {
    out.push({
      category: 'kickReturn',
      stat: {
        playerName,
        kR: raw.KRETATTEMPTS ?? 0,
        yards: raw.KRETYARDS ?? 0,
        tD: raw.KRETTDS ?? 0,
        long: raw.KRETLONGEST ?? 0,
      },
    })
  }
  if ((raw.PRETATTEMPTS || 0) > 0) {
    out.push({
      category: 'puntReturn',
      stat: {
        playerName,
        pR: raw.PRETATTEMPTS ?? 0,
        yards: raw.PRETYARDS ?? 0,
        tD: raw.PRETTDS ?? 0,
        long: raw.PRETLONGEST ?? 0,
      },
    })
  }

  return out
}

const EMPTY_CATEGORIES = () => ({
  passing: [], rushing: [], receiving: [], blocking: [],
  defense: [], kicking: [], punting: [], kickReturn: [], puntReturn: [],
})

// Save-row iteration order (the extractor just walks the player table in
// whatever order the save happens to store it — not performance order) is
// not something anyone should have to read box score stats in. Sort each
// category by its own headline stat, descending, matching how the in-game
// Player Stats screen presents them (verified: real Receiving tab sorted by
// Yards descending).
const CATEGORY_SORT_KEY = {
  passing: 'yards',
  rushing: 'yards',
  receiving: 'yards',
  kicking: 'fGM',
  punting: 'yards',
  blocking: 'pancakes',
  kickReturn: 'yards',
  puntReturn: 'yards',
}

function sortBoxScoreCategories(categories) {
  for (const [cat, list] of Object.entries(categories)) {
    if (!Array.isArray(list) || list.length < 2) continue
    if (cat === 'defense') {
      // No single stored field for "total tackles" — solo+assists combined
      // matches the in-game Defense tab's own primary sort.
      list.sort((a, b) => ((b.solo ?? 0) + (b.assists ?? 0)) - ((a.solo ?? 0) + (a.assists ?? 0)))
      continue
    }
    const key = CATEGORY_SORT_KEY[cat]
    if (!key) continue
    list.sort((a, b) => (b[key] ?? 0) - (a[key] ?? 0))
  }
  return categories
}

/**
 * Full box scores (team stats + every category's player stat lines) for
 * every game the user's team has played this sync, in the exact
 * `game.boxScore` shape boxScoreHelpers.js/Game.jsx already read. Scoped to
 * the user's own games only — matches the schedule/score sync's existing
 * boundary; a whole-league version would be ~136x the data for games
 * nothing in the app currently displays.
 *
 * @returns {{[week: number]: {byTid: object, teamStatsByTid: object}}}
 */
export function buildBoxScoresForUserGames(parsed, rawTeamIdMap, dynastyTeams, userTid) {
  const boxScoresByWeek = {}
  const gameStats = parsed.gameStats
  if (!gameStats) return boxScoresByWeek
  // The save's stat tables are keyed by its OWN raw week, but the returned map
  // is consumed by week against games the app files at APP_CCG_WEEK for a
  // conference championship — so the lookup stays raw while the output key is
  // normalized. Getting this backwards silently drops the CCG box score.
  const ccgWeek = parsed.season?.conferenceChampionshipWeek ?? null

  for (const g of parsed.games || []) {
    if (g.weekType !== 'RegularSeason' || g.status === 'Unplayed') continue
    // Same FCS-filler (TeamIndex 255) resolution as gameScoresForUserTeam
    // above — without it, `homeAppTid == null || awayAppTid == null` always
    // skipped the whole game the moment the FCS opponent's tid came back
    // null, so the user's OWN real box-score stats never got attached for
    // any game played against an FCS filler team either.
    const homeAppTid = g.homeTeamId === 255 ? FCS_FILLER_NAME_TO_TID[g.homeTeam] ?? null : rawTeamIdMap.get(g.homeTeamId)
    const awayAppTid = g.awayTeamId === 255 ? FCS_FILLER_NAME_TO_TID[g.awayTeam] ?? null : rawTeamIdMap.get(g.awayTeamId)
    if (homeAppTid == null || awayAppTid == null) continue
    if (homeAppTid !== userTid && awayAppTid !== userTid) continue

    const week = g.week
    const teamStatsRaw = gameStats.teamStatsByWeek?.[week] || {}
    const playerStatsRaw = gameStats.playerStatsByWeek?.[week] || []

    const byTid = {}
    const teamStatsByTid = {}
    for (const [rawTid, appTid] of [[g.homeTeamId, homeAppTid], [g.awayTeamId, awayAppTid]]) {
      const abbr = dynastyTeams?.[appTid]?.abbr
      const rawTeamStats = teamStatsRaw[rawTid]
      if (rawTeamStats) teamStatsByTid[appTid] = mapTeamGameStats(rawTeamStats, abbr)

      const categories = EMPTY_CATEGORIES()
      for (const entry of playerStatsRaw) {
        if (entry.team_id !== rawTid) continue
        for (const { category, stat } of mapPlayerGameStatEntries(entry)) {
          categories[category]?.push(stat)
        }
      }
      byTid[appTid] = sortBoxScoreCategories(categories)
    }

    boxScoresByWeek[ccgWeek != null && week === ccgWeek ? APP_CCG_WEEK : week] = { byTid, teamStatsByTid }
  }

  return boxScoresByWeek
}
