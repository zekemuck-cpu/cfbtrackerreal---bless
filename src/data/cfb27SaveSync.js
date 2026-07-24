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
  mapPreseasonTop25,
  mapScheduleForTeam,
  mapSeasonInfo,
  mapPosition,
  mapClass,
  mapHeight,
  mapWeight,
  mapState,
  mapPortraitUrl,
  mapAttributes,
  mapStars,
} from './cfb27SaveImport'
import { attributeNamesFor } from '../utils/recruitAttributes'

function normalizedNameTeamKey(name, tid) {
  const n = (name || '').toLowerCase().trim()
  if (!n || tid == null) return null
  return `${n}::${tid}`
}

function isValidRow(row) {
  return Boolean(row && row.stars !== 'Invalid' && row.height && row.first_name && row.last_name)
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
  const fields = ['name', 'firstName', 'lastName', 'position', 'jerseyNumber', 'archetype', 'height', 'weight', 'hometown', 'state', 'team', 'cfb27AssetName', 'year', 'overall', 'devTrait', 'pictureUrl', 'isCaptain']
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
export function reconcilePlayers(rows, existingPlayers, { year, dynastyTeams }) {
  const { byTid, unresolvedTeamNames } = groupExtractedRowsByTid(rows, dynastyTeams)

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

      if (existing) {
        matchedPids.add(existing.pid)
        const mapped = mapExtractedRowToAppPlayer(row, { year, pid: existing.pid, tid })
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
          pictureUrl: mapped.pictureUrl || existing.pictureUrl,
          isCaptain: mapped.isCaptain,
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
        const mapped = mapExtractedRowToAppPlayer(row, { year, pid: null, tid })
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
  for (const p of existingPlayers) {
    if (!p.cfb27AssetName || matchedPids.has(p.pid)) continue
    if (alreadyHasMoreSpecificDeparture(p, year)) continue
    const lastStint = getLastKnownStint(p, year + 1) // include the sync year itself
    const lastClass = lastStint?.klass || p.classByYear?.[year] || ''
    const departure = /Sr$/.test(lastClass) ? 'graduated' : 'pro_draft'
    departures.push({
      pid: p.pid,
      name: p.name,
      patch: {
        movementByYear: {
          ...(p.movementByYear || {}),
          [year]: { type: 'departure', departure, toTid: null },
        },
      },
    })
  }

  return {
    toUpdate,
    toCreate,
    departures,
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
// label (HardCommitted/Signed) vs. still-deciding (Top10/Top5/Top3/Battle/
// SoftCommitted). SoftCommitted is treated as still-open/pursuing, not
// committed — it's a verbal lean the recruit can still walk back before
// HardCommitted, and the in-game UI doesn't move it to the Commitments list
// either.
function classifyRecruitStage(raw) {
  return raw === 'HardCommitted' || raw === 'Signed' ? 'committed' : 'open'
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
 */
export function reconcileRecruitingBoard(rawTargets, existingPlayers, { userTid, year, rawTeamIdMap }) {
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
    // progressively (scouting hours) as a deliberate mechanic, not because
    // the data doesn't exist yet. Reading the save directly bypasses that
    // on its own, so this mirrors the reveal gate here rather than exposing
    // spoilers (confirmed with the user this matters):
    //   - Dev trait: only once truly signed — even HardCommitted is still
    //     hidden in-game.
    //   - Attributes: gated on UnlockedIntelBitfield (only ONE calibration
    //     point exists — a confirmed 100%-scouted recruit at value 12 — so
    //     this is a binary "fully scouted or nothing" gate, not graduated),
    //     AND even when fully scouted, only the game's own "key 10"
    //     attributes for this position/archetype are shown — reusing
    //     attributeNamesFor (src/utils/recruitAttributes.js), the SAME list
    //     already used everywhere else scouted attributes are displayed —
    //     never the full ~53-attribute set, which the game never reveals
    //     pre-signing regardless of scouting completion.
    const fullyScouted = (row.unlocked_intel_bitfield || 0) >= 12
    const isSigned = row.recruit_stage === 'Signed'
    let attributes
    if (fullyScouted) {
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
        if (k === 'teamsByYear' || k === 'attributes') return JSON.stringify(existing[k] || null) === JSON.stringify(v || null)
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
        name, class: fields.position ? row.recruit_class : undefined, position,
        archetype, stars: fields.stars, devTrait: fields.devTrait,
        nationalRank: fields.nationalRank, stateRank: fields.stateRank, positionRank: fields.positionRank,
        height: fields.height, weight: fields.weight, hometown: fields.hometown, state: fields.state,
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
    if (!p.isTarget || p.boardRemoved) continue
    if (p.targetYear !== year) continue
    if (p.cfb27AssetName === undefined) continue
    const stillOnBoard = (p.cfb27AssetName && seenKeys.has(`a:${p.cfb27AssetName}`))
      || (p.name && seenKeys.has(`n:${p.name.toLowerCase().trim()}`))
    if (!stillOnBoard) {
      toUpdate.push({ pid: p.pid, patch: { boardRemoved: true }, name: p.name })
    }
  }

  return { toUpdate, toCreate, committedRecords, stats: { targets: toUpdate.length + toCreate.length } }
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
  const existingByMatchup = new Map()
  for (const g of existingGames || []) {
    if (g.gameType !== 'regular' || Number(g.year) !== year) continue
    if (g.team1Tid == null || g.team2Tid == null) continue
    existingByMatchup.set(`${g.week}:${cpuGameId(year, g.week, g.team1Tid, g.team2Tid)}`, g)
  }

  const toWrite = []
  let boxScoresAdded = 0

  for (const g of parsed.games || []) {
    if (g.weekType !== 'RegularSeason') continue
    const homeAppTid = rawTeamIdMap.get(g.homeTeamId)
    const awayAppTid = rawTeamIdMap.get(g.awayTeamId)
    if (homeAppTid == null || awayAppTid == null) continue
    if (homeAppTid === userTid || awayAppTid === userTid) continue // handled by the user-team pipeline instead

    const week = g.week
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
          team1Score,
          team2Score,
          isPlayed: played,
          ...(quarters ? { quarters } : {}),
          ...(overtimes ? { overtimes } : {}),
          ...(box ? { boxScore: box } : {}),
        }
      : {
          id: cpuGameId(year, week, homeAppTid, awayAppTid),
          week,
          year,
          gameType: 'regular',
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
        }

    // Minimal-diff: skip writing if nothing actually changed vs. what's tracked.
    if (existing) {
      const unchanged =
        existing.team1Score === record.team1Score &&
        existing.team2Score === record.team2Score &&
        Boolean(existing.isPlayed) === Boolean(record.isPlayed) &&
        JSON.stringify(existing.boxScore || null) === JSON.stringify(record.boxScore || null) &&
        JSON.stringify(existing.quarters || null) === JSON.stringify(record.quarters || null)
      if (unchanged) continue
    }

    if (box) boxScoresAdded += 1
    toWrite.push(record)
  }

  return { toWrite, stats: { gamesTouched: toWrite.length, boxScoresAdded } }
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

  const playerDiff = reconcilePlayers(parsed.players || [], existingPlayers, { year, dynastyTeams })
  const recruitDiff = reconcileRecruitingBoard(parsed.recruitingBoard || [], existingPlayers, {
    userTid,
    year, // the recruiting CLASS year — see reconcileRecruitingBoard's param comment for why NOT +1
    rawTeamIdMap,
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
    const patchedYear = { ...yearData }
    if (ratings) {
      patchedYear.teamRatings = ratings
      teamsRatingsUpdated += 1
    }
    if (staff) {
      patchedYear.coachingStaff = staff
      teamsCoachingUpdated += 1
    }
    mergedTeams[tidKey] = { ...team, byYear: { ...team.byYear, [year]: patchedYear } }
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
  for (const entry of rankings) {
    const tidKey = String(entry.tid)
    const team = mergedTeams[tidKey]
    if (!team) continue
    const yearData = team.byYear[year] || {}
    mergedTeams[tidKey] = {
      ...team,
      byYear: {
        ...team.byYear,
        [year]: { ...yearData, rankByWeek: { ...(yearData.rankByWeek || {}), [week]: entry.rank } },
      },
    }
  }

  // Schedule/scores for the user's own team — raw material for the caller's
  // computeScheduleDiff/applyScheduleDiff + isGamePlayed pass.
  const scheduleForUserTeam = mapScheduleForTeam(parsed.games, rawTeamIdMap, userTid, dynastyTeams)
  const gameScoresForUserTeam = (parsed.games || [])
    .filter((g) => g.weekType === 'RegularSeason' && g.status !== 'Unplayed')
    .map((g) => {
      const homeTid = rawTeamIdMap.get(g.homeTeamId)
      const awayTid = rawTeamIdMap.get(g.awayTeamId)
      if (homeTid !== userTid && awayTid !== userTid) return null
      return {
        week: g.week, homeTid, awayTid, homeScore: g.homeScore, awayScore: g.awayScore,
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

  return {
    toCreatePlayers,
    toUpdatePatches,
    departurePatches,
    mergedTeams,
    scheduleForUserTeam,
    gameScoresForUserTeam,
    boxScoresByWeek,
    cpuGamesToWrite: cpuGames.toWrite,
    depthChartUpdates,
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
      rankingsUpdated: rankings.length,
      boxScoresAdded: Object.keys(boxScoresByWeek).length + cpuGames.stats.boxScoresAdded,
      cpuGamesUpdated: cpuGames.stats.gamesTouched,
      depthChartsUpdated: Object.keys(depthChartUpdates).length,
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

  for (const g of parsed.games || []) {
    if (g.weekType !== 'RegularSeason' || g.status === 'Unplayed') continue
    const homeAppTid = rawTeamIdMap.get(g.homeTeamId)
    const awayAppTid = rawTeamIdMap.get(g.awayTeamId)
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

    boxScoresByWeek[week] = { byTid, teamStatsByTid }
  }

  return boxScoresByWeek
}
