'use strict';
/**
 * CFB 27 save extraction — server-side core.
 *
 * Vendored from the standalone cfb27-extract tool's extract.js (verified
 * end-to-end against a real DYNASTY-* save: 16,257 players, Jeremiah Smith
 * 99 OVR / Contested Specialist matching the in-game card exactly). This
 * module keeps only the read-a-save-and-return-rows logic — no CLI parsing,
 * no TSV writing — so a Vercel function can call it directly against an
 * uploaded save file.
 *
 * Fixes applied vs. the original standalone tool (found while vendoring):
 *   - Hometown never resolved: the real save field is `PLYR_HOME_TOWN`
 *     (with underscore), not `PLYR_HOMETOWN`.
 *   - Home state wasn't read at all (`PLYR_HOME_STATE`).
 *   - Redshirt status wasn't read at all (`RedshirtStatus`) — needed to
 *     derive the app's "RS Fr"/"RS So"/etc. class labels.
 *
 * Extended beyond players (still verified against the same real save) to
 * cover everything else the app's preseason checklist tracks:
 *   - Team ratings (TEAM_RATINGOVR/OFF/DEF — direct fields on Team).
 *   - Coaching staff (Coach table: FirstName/LastName/Position/TeamIndex —
 *     direct fields, no reference resolution needed).
 *   - Conference alignment (Conference.TeamSlots is a REFERENCE field
 *     pointing at a "Team[]" array-table row, whose TeamN sub-fields are
 *     themselves references to Team rows — resolved via `resolveRef`,
 *     verified to reproduce the real Big Ten's 18 members exactly).
 *   - Current season year/week/phase (SeasonInfo — single-row table).
 *   - Full schedule (SeasonGame — one row per league game; HomeTeam/AwayTeam
 *     are the same kind of reference field as Conference.TeamSlots).
 */

const { create: createFranchiseFile } = require('madden-franchise');
const schema = require('./lib/schema.cjs');

function openSave(file) {
  return createFranchiseFile(file, { autoParse: true, autoUnempty: true });
}

/** Heuristic: the player table is the one carrying the rating columns. */
function findPlayerTable(save, forced) {
  const tables = save.tables || [];

  if (forced) {
    const hit = tables.find((t) => t.name === forced);
    if (!hit) throw new Error(`No table named "${forced}"`);
    return hit;
  }

  let best = null;
  for (const table of tables) {
    const fields = (table.schema && table.schema.attributes) || [];
    const names = new Set(fields.map((f) => f.name));
    const score = schema.RATING_FIELDS.filter((r) => names.has(r)).length;
    if (score > (best ? best.score : 0)) best = { table, score };
  }

  if (!best || best.score < 10) {
    throw new Error(
      'Could not identify the player table in this save (rating-field match too low).'
    );
  }

  return best.table;
}

/** The save carries several same-named tables (per-slot scratch instances);
 * only one is actually populated. Used for Team/Coach/Conference/SeasonInfo/
 * SeasonGame — all follow this same "many instances, one real one" shape. */
async function getBestTable(save, name) {
  let candidates = [];
  if (typeof save.getAllTablesByName === 'function') {
    candidates = save.getAllTablesByName(name) || [];
  }
  if (!candidates.length) {
    candidates = (save.tables || []).filter((t) => t.name === name);
  }
  if (!candidates.length) return null;

  let best = null;
  let bestCount = -1;
  for (const t of candidates) {
    try {
      await t.readRecords();
      const count = t.records.filter((r) => r && !r.isEmpty).length;
      if (count > bestCount) {
        bestCount = count;
        best = t;
      }
    } catch (err) {
      /* skip unreadable instance */
    }
  }
  return best;
}

function readCell(record, field) {
  try {
    const v = record[field];
    return v === undefined ? null : v;
  } catch (err) {
    return null;
  }
}

/**
 * Decode a raw reference-field binary string (as returned by fields like
 * Conference.TeamSlots, Team.HeadCoach, SeasonGame.HomeTeam/AwayTeam) into
 * the table + row it points at, and return that row.
 *
 * Format (verified against schema attribute type "Team[]" / reference
 * fields generally, matching madden-franchise's own internal
 * utilService.getReferenceData): first 15 bits = tableId, remaining bits =
 * row number within that table (by array POSITION, not any id field).
 */
async function resolveRef(save, refString) {
  if (!refString || typeof refString !== 'string' || refString.length < 16) return null;
  const tableId = parseInt(refString.slice(0, 15), 2);
  const rowNumber = parseInt(refString.slice(15), 2);
  if (!Number.isFinite(tableId) || !Number.isFinite(rowNumber)) return null;
  const table = save.getTableById(tableId);
  if (!table) return null;
  // Tables are lazy — the referenced table (often shared across many rows,
  // e.g. every conference's TeamSlots points into the same "Team[]" table at
  // a different row) may not have had readRecords() called on it yet.
  if (!table.records || table.records.length === 0) {
    await table.readRecords();
  }
  return table.records[rowNumber] || null;
}

/**
 * Same decode as resolveRef, but also returns which table the reference
 * pointed into — needed by buildGameStats, where a weekly stat-line
 * reference can resolve into any of three different tables
 * (GameOffensiveStats/GameDefensiveStats/GameKickingStats) and the table it
 * landed in IS the signal for which stat category the row holds.
 */
async function resolveRefWithTable(save, refString) {
  if (!refString || typeof refString !== 'string' || refString.length < 16) return null;
  const tableId = parseInt(refString.slice(0, 15), 2);
  const rowNumber = parseInt(refString.slice(15), 2);
  if (!Number.isFinite(tableId) || tableId === 0 || !Number.isFinite(rowNumber)) return null;
  const table = save.getTableById(tableId);
  if (!table) return null;
  if (!table.records || table.records.length === 0) {
    await table.readRecords();
  }
  const rec = table.records[rowNumber];
  if (!rec || rec.isEmpty) return null;
  return { table, rec };
}

/**
 * Build teamIndex -> display name from the save's own Team table.
 * Static id catalogs are unreliable for CFB27's added schools. Also
 * collects each team's overall/offense/defense ratings while it's already
 * iterating every row, so callers don't need a second full table scan.
 */
function buildTeamMaps(teamTable) {
  const names = new Map();
  const ratings = new Map();
  const rankings = new Map();
  if (!teamTable) return { names, ratings, rankings };

  const fields = new Set(teamTable.schema.attributes.map((f) => f.name));
  const nameField = ['LongName', 'DisplayName', 'TeamName'].find((n) => fields.has(n));
  const nickField = ['NickName', 'Mascot'].find((n) => fields.has(n));
  const idField = ['TeamIndex', 'TEAM_ORIGID', 'TeamId'].find((n) => fields.has(n));
  if (!nameField) return { names, ratings, rankings };

  teamTable.records.forEach((rec, i) => {
    if (!rec || rec.isEmpty) return;
    const id = idField ? Number(readCell(rec, idField)) : i;
    const name = readCell(rec, nameField);
    if (name && String(name).trim() !== '') {
      const nick = nickField ? readCell(rec, nickField) : null;
      names.set(id, { name: String(name), nick: nick ? String(nick) : null });
    }

    const overall = Number(readCell(rec, 'TEAM_RATINGOVR'));
    const offense = Number(readCell(rec, 'TEAM_RATINGOFF'));
    const defense = Number(readCell(rec, 'TEAM_RATINGDEF'));
    if (Number.isFinite(overall) || Number.isFinite(offense) || Number.isFinite(defense)) {
      ratings.set(id, {
        overall: Number.isFinite(overall) ? overall : null,
        offense: Number.isFinite(offense) ? offense : null,
        defense: Number.isFinite(defense) ? defense : null,
      });
    }

    // Media Poll — the game's default/primary Top 25 ranking (verified
    // against a real save: preseason ranks 1-25 populated and sane, e.g.
    // Ohio State #1 the year after winning it all in the simulation).
    const mediaRank = Number(readCell(rec, 'MediaPoll_CurrentRank'));
    if (Number.isFinite(mediaRank) && mediaRank >= 1 && mediaRank <= 25) {
      rankings.set(id, mediaRank);
    }
  });

  return { names, ratings, rankings };
}

const COACH_POSITIONS = {
  HeadCoach: 'headCoach',
  OffensiveCoordinator: 'offensiveCoordinator',
  DefensiveCoordinator: 'defensiveCoordinator',
};

function buildCoachingStaff(coachTable) {
  const staff = new Map();
  if (!coachTable) return staff;

  for (const rec of coachTable.records) {
    if (!rec || rec.isEmpty) continue;
    const position = COACH_POSITIONS[readCell(rec, 'Position')];
    if (!position) continue;
    const tid = Number(readCell(rec, 'TeamIndex'));
    if (!Number.isFinite(tid)) continue;
    const first = readCell(rec, 'FirstName') || '';
    const last = readCell(rec, 'LastName') || '';
    const name = `${first} ${last}`.trim();
    if (!name) continue;
    if (!staff.has(tid)) staff.set(tid, {});
    staff.get(tid)[position] = {
      name,
      // Same GenericHeadAssetName/Portrait pair used for player portraits
      // (mapPortraitUrl's primary id + fallback id) — the Coach table carries
      // its own independent value for each, verified against a real save.
      generic_head_asset_name: readCell(rec, 'GenericHeadAssetName') || null,
      portrait_id: Number(readCell(rec, 'Portrait')) || null,
    };
  }

  return staff;
}

// Save-side DepthChart slot field -> confidently-matching app catalog slot
// id (src/utils/outlookBoard.js's OFFENSE_CATALOG/DEFENSE_CATALOG/ST_CATALOG).
// Deliberately a SUBSET of the save's real slot fields (skips 3DRB, GAD,
// KOS, KR, LOLB, LS, MLB, NT, PR, PWHB, RDT, RLE, ROLB, SLCB, SLWR, SUBLB) —
// either no clean 1:1 app slot exists, or the mapping would be a guess
// (e.g. LOLB/ROLB -> WILL/SAM depends on formation strength, not a fixed
// left/right convention) — better to leave a slot's order untouched than
// write a confidently-wrong one.
const DEPTH_CHART_SLOT_FIELDS = [
  'LT', 'LG', 'C', 'RG', 'RT', 'WR', 'TE', 'HB', 'QB', 'FB',
  'DT', 'CB', 'FS', 'SS', 'LE', 'RE', 'K', 'P',
];

/**
 * Whole-league in-game depth chart order: Team.DepthChart -> a DepthChart
 * row with one field per position slot -> each resolves to a "Player[]"
 * array row (Player0..PlayerN, ordered = depth order) -> each resolves to
 * a real Player row. Verified against a real save: Ohio State's WR order
 * comes back Jeremiah Smith, Chris Henry Jr., Brandon Inniss, ... — an
 * exact match to the in-game "Chris Henry Jr. is my #2 WR" report that
 * motivated this (the tracker's own depth chart only had OVR to sort by,
 * so it ranked him lower).
 *
 * @returns {Object<number, Object<string, {asset_name,first_name,last_name}[]>>}
 *   rawTeamId -> { slotField: [player, ...] } — same rawTeamId space as
 *   buildTeamMaps'/buildRawTeamIdMap's TeamIndex, so the client can resolve
 *   it with the SAME rawTeamIdMap already built from player rows.
 */
async function buildDepthCharts(save, teamTable, playerFieldPicker) {
  const depthCharts = {};
  if (!teamTable) return depthCharts;
  const fields = new Set(teamTable.schema.attributes.map((f) => f.name));
  const idField = ['TeamIndex', 'TEAM_ORIGID', 'TeamId'].find((n) => fields.has(n));
  if (!idField || !fields.has('DepthChart')) return depthCharts;

  for (const rec of teamTable.records) {
    if (!rec || rec.isEmpty) continue;
    const rawTid = Number(readCell(rec, idField));
    if (!Number.isFinite(rawTid)) continue;

    const dcRow = await resolveRef(save, readCell(rec, 'DepthChart'));
    if (!dcRow || dcRow.isEmpty) continue;

    const teamChart = {};
    for (const slotField of DEPTH_CHART_SLOT_FIELDS) {
      const slotRow = await resolveRef(save, readCell(dcRow, slotField));
      if (!slotRow) continue;
      const maxSlots = Number.isFinite(slotRow.arraySize) ? slotRow.arraySize : 15;
      const list = [];
      for (let i = 0; i < maxSlots; i += 1) {
        const playerRef = readCell(slotRow, `Player${i}`);
        if (!playerRef) continue;
        const playerRec = await resolveRef(save, playerRef);
        if (!playerRec || playerRec.isEmpty) continue;
        list.push({
          asset_name: playerFieldPicker.assetName ? readCell(playerRec, playerFieldPicker.assetName) : null,
          first_name: playerFieldPicker.first ? readCell(playerRec, playerFieldPicker.first) : null,
          last_name: playerFieldPicker.last ? readCell(playerRec, playerFieldPicker.last) : null,
        });
      }
      if (list.length) teamChart[slotField] = list;
    }
    if (Object.keys(teamChart).length) depthCharts[rawTid] = teamChart;
  }

  return depthCharts;
}

/**
 * Conference name -> member team ids, resolved via the reference chain
 * Conference.TeamSlots -> "Team[]" array-table row -> that row's TeamN
 * sub-fields (each itself a reference to a Team row). Verified against a
 * real save: Big Ten resolves to its real 18 current members.
 */
async function buildConferences(save, confTable) {
  const conferences = [];
  if (!confTable) return conferences;

  for (const rec of confTable.records) {
    if (!rec || rec.isEmpty) continue;
    const name = readCell(rec, 'Name');
    if (!name) continue;

    const slotsRef = readCell(rec, 'TeamSlots');
    const arrRow = await resolveRef(save, slotsRef);
    const teamIds = [];
    if (arrRow) {
      // Array-table rows expose a fixed set of TeamN sub-fields rather than
      // a discoverable length; 24 covers the largest real conference with
      // headroom (Team fields beyond the real membership simply read null).
      for (let i = 0; i < 24; i += 1) {
        let slotRef;
        try {
          slotRef = arrRow[`Team${i}`];
        } catch (err) {
          continue;
        }
        if (slotRef == null) continue;
        const teamRec = await resolveRef(save, slotRef);
        if (!teamRec || teamRec.isEmpty) continue;
        const tid = Number(readCell(teamRec, 'TeamIndex'));
        if (Number.isFinite(tid)) teamIds.push(tid);
      }
    }

    if (teamIds.length) conferences.push({ name: String(name), teamIds });
  }

  return conferences;
}

function buildSeasonInfo(seasonTable) {
  if (!seasonTable) return null;
  const rec = seasonTable.records.find((r) => r && !r.isEmpty);
  if (!rec) return null;
  return {
    year: Number(readCell(rec, 'CurrentSeasonYear')),
    week: Number(readCell(rec, 'CurrentWeek')),
    weekType: readCell(rec, 'CurrentWeekType'),
    stage: readCell(rec, 'CurrentStage'),
  };
}

/**
 * Every league game (current season — the save only exposes SeasonYear 0,
 * i.e. "this season"; there's no separate historical-schedule table to pull
 * prior seasons from). Callers filter down to whichever team(s) they care
 * about. HomeTeam/AwayTeam resolve the same reference-chain way as
 * Conference.TeamSlots.
 */
async function buildSchedule(save, gameTable, teamNames) {
  const games = [];
  if (!gameTable) return games;

  for (const rec of gameTable.records) {
    if (!rec || rec.isEmpty) continue;
    const homeRec = await resolveRef(save, readCell(rec, 'HomeTeam'));
    const awayRec = await resolveRef(save, readCell(rec, 'AwayTeam'));
    if (!homeRec || !awayRec) continue;
    const homeTid = Number(readCell(homeRec, 'TeamIndex'));
    const awayTid = Number(readCell(awayRec, 'TeamIndex'));
    if (!Number.isFinite(homeTid) || !Number.isFinite(awayTid)) continue;

    const homeInfo = teamNames.get(homeTid);
    const awayInfo = teamNames.get(awayTid);

    games.push({
      week: Number(readCell(rec, 'SeasonWeek')),
      weekType: readCell(rec, 'SeasonWeekType'),
      year: Number(readCell(rec, 'SeasonYear')),
      gameNum: Number(readCell(rec, 'SeasonGameNum')),
      status: readCell(rec, 'GameStatus'),
      homeTeamId: homeTid,
      awayTeamId: awayTid,
      homeTeam: homeInfo ? homeInfo.name : null,
      homeTeamNick: homeInfo ? homeInfo.nick : null,
      awayTeam: awayInfo ? awayInfo.name : null,
      awayTeamNick: awayInfo ? awayInfo.nick : null,
      homeScore: Number(readCell(rec, 'HomeScore')),
      awayScore: Number(readCell(rec, 'AwayScore')),
      // Quarter-by-quarter breakdown — verified exact against a real
      // in-game box score (14-14-6-14 home / 10-0-0-8 away). ScoringSummaries
      // (a reference field, same pattern as GameStats[]/TeamStats[]) was
      // also checked but resolves to an empty/unset reference on every real
      // played game tried — the save does not appear to retain a scoring
      // play-by-play log after a game ends, only final quarter totals.
      home_score_q1: Number(readCell(rec, 'HomeScoreQuarter1')) || 0,
      home_score_q2: Number(readCell(rec, 'HomeScoreQuarter2')) || 0,
      home_score_q3: Number(readCell(rec, 'HomeScoreQuarter3')) || 0,
      home_score_q4: Number(readCell(rec, 'HomeScoreQuarter4')) || 0,
      home_score_ot: Number(readCell(rec, 'HomeScoreOT')) || 0,
      away_score_q1: Number(readCell(rec, 'AwayScoreQuarter1')) || 0,
      away_score_q2: Number(readCell(rec, 'AwayScoreQuarter2')) || 0,
      away_score_q3: Number(readCell(rec, 'AwayScoreQuarter3')) || 0,
      away_score_q4: Number(readCell(rec, 'AwayScoreQuarter4')) || 0,
      away_score_ot: Number(readCell(rec, 'AwayScoreOT')) || 0,
    });
  }

  return games;
}

/**
 * Your recruiting board — targets you're actively tracking, not the whole
 * national prospect pool. `UserRecruitTarget` rows only exist for schools the
 * human-controlled team is pursuing, so unlike everything else in this file
 * (which is whole-league), no team filter is needed here.
 *
 * Chain: UserRecruitTarget.Recruit -> Recruit row (rank/class/commit stage)
 * -> Recruit.Player -> Player row (name/position/stars/hometown, same table
 * `buildPlayerRows` reads). A prospect's Player row carries TeamIndex 255
 * ("uncommitted"/no roster slot yet) until they actually enroll — verified
 * against a real save: a `HardCommitted` recruit still shows TeamIndex 255,
 * so this table (not the roster) is the only place a still-uncommitted or
 * recently-committed prospect is visible before signing day.
 *
 * NOTE ON STATUS FIELDS — corrected after verifying against a real
 * non-empty board (6 tracked recruits, 5 HardCommitted + 1 Top5):
 * `ScholarshipStatus` (on the UserRecruitTarget row) was 'None' for EVERY
 * row regardless of actual commitment — it tracks something else (perhaps a
 * separate scholarship-offer workflow) and is NOT a reliable commitment
 * signal despite having a 'Committed' enum member. `RecruitStage` (on the
 * Recruit row — values seen: Top10/Top5/Top3/Battle/SoftCommitted/
 * HardCommitted/Signed) is what actually matches the in-game "Committed"
 * label and the funnel shown in the UI's Open→Top5→Top3 progress bar — use
 * THIS field for commitment classification, not ScholarshipStatus.
 *
 * Also note: a recruit's Player row commonly has an EMPTY asset_name (""),
 * unlike rostered players — they haven't been fully "created" as a signed
 * character yet. Callers matching recruits across syncs need a name-based
 * fallback; don't rely on cfb27AssetName alone here.
 */
async function buildRecruitingBoard(save, playerFieldPicker, presentRatings) {
  const targets = [];
  const targetTable = await getBestTable(save, 'UserRecruitTarget');
  if (!targetTable) return targets;

  for (const rec of targetTable.records) {
    if (!rec || rec.isEmpty) continue;

    const recruitRec = await resolveRef(save, readCell(rec, 'Recruit'));
    if (!recruitRec || recruitRec.isEmpty) continue;
    const playerRec = await resolveRef(save, readCell(recruitRec, 'Player'));
    if (!playerRec || playerRec.isEmpty) continue;

    // The committed team — NOT necessarily the user's own. Verified against
    // a real save this matters: a recruit stays on YOUR board (still shows
    // "Committed") even after hard-committing to a DIFFERENT school you'd
    // simply offered at some point (confirmed: Jake Vretman shown on Ohio
    // State's board, HardCommitted, but Recruit.TopSchoolsList slot 0 =
    // Penn State at Influence 684 — the highest of his 10 tracked schools —
    // matching the in-game "Hard Commit ... Penn State" detail exactly).
    // Slot 0 (index 0, highest TeamInfluence) is the destination once
    // committed; for a still-open recruit it's just their current lean, not
    // a real commitment, so callers must gate use of this on recruit_stage.
    let committedTeamId = null;
    const topSchoolsRow = await resolveRef(save, readCell(recruitRec, 'TopSchoolsList'));
    if (topSchoolsRow) {
      const topSchoolRef = readCell(topSchoolsRow, 'ProspectTargetSchool0');
      const topSchoolRow = await resolveRef(save, topSchoolRef);
      if (topSchoolRow && !topSchoolRow.isEmpty) {
        const tid = Number(readCell(topSchoolRow, 'TeamId'));
        if (Number.isFinite(tid)) committedTeamId = tid;
      }
    }

    const F = playerFieldPicker;
    const core = buildPlayerCoreFields(playerRec, F, presentRatings) || {};
    targets.push({
      first_name: F.first ? readCell(playerRec, F.first) : null,
      last_name: F.last ? readCell(playerRec, F.last) : null,
      position: F.position ? String(readCell(playerRec, F.position)) : null,
      stars: F.stars ? readCell(playerRec, F.stars) : null,
      height: F.height ? Number(readCell(playerRec, F.height)) : null,
      weight: F.weight ? Number(readCell(playerRec, F.weight)) : null,
      hometown: F.home ? readCell(playerRec, F.home) : null,
      home_state: F.homeState ? readCell(playerRec, F.homeState) : null,
      asset_name: F.assetName ? readCell(playerRec, F.assetName) : null,
      generic_head_asset_name: F.genericHeadAssetName ? readCell(playerRec, F.genericHeadAssetName) : null,
      portrait_id: F.portraitId ? Number(readCell(playerRec, F.portraitId)) : null,
      archetype_name: core.archetype_name || null,
      dev_trait: core.dev_trait || null,
      abilities: core.abilities || [],
      ratings: core.ratings || {},
      national_rank: Number(readCell(recruitRec, 'NationalRank')) || null,
      state_rank: Number(readCell(recruitRec, 'StateRank')) || null,
      position_rank: Number(readCell(recruitRec, 'PositionRank')) || null,
      recruit_class: readCell(recruitRec, 'Class'),
      recruit_stage: readCell(recruitRec, 'RecruitStage'),
      committed_team_id: committedTeamId,
      scholarship_status: readCell(rec, 'ScholarshipStatus'),
      committed_week: Number(readCell(rec, 'CommittedWeekNumber')) || null,
      is_favorite: Boolean(readCell(rec, 'IsFavorite')),
      current_nil_offer: Number(readCell(rec, 'CurrentNILOffer')) || null,
      // Real attributes/dev-trait are always present in the save (the game
      // generates them immediately, before any scouting happens) — the
      // reveal-to-the-user timing is a UI-layer mechanic on top, tracked
      // here via UnlockedIntelBitfield. Only ONE calibration point exists
      // right now (a confirmed 100%-scouted recruit, bitfield value 12) —
      // every OTHER real recruit checked was already committed, where this
      // field reads 0 regardless of prior scouting. There's no known
      // partially-scouted sample yet to decode intermediate percentages or
      // which bit maps to which attribute, so the mapper (cfb27SaveSync.js)
      // treats this as a binary gate (>=12 = fully scouted) rather than a
      // graduated one — under-reveal on uncertainty, never over-reveal.
      unlocked_intel_bitfield: Number(readCell(rec, 'UnlockedIntelBitfield')) || 0,
    });
  }

  return targets;
}

// A player/team's own stat row (GameOffensiveStats/GameDefensiveStats/
// GameKickingStats/GameOLineStats/TeamStats) doesn't say which table it's
// IN — the table itself is the category signal. Whitelisting fields per
// table here (rather than dumping every field indiscriminately) keeps the
// extracted payload to just what's actually used downstream.
// GAMESSTARTED included (unlike the other category field lists) because
// blocking is gated on "did this lineman start" rather than "did any stat
// come back non-zero" — a clean 0-pancake, 0-sack-allowed game is still real
// data for a starter, not a junk/no-show row.
const GAME_OLINE_STAT_FIELDS = ['OLINEPANCAKES', 'OLINESACKSALLOWED', 'GAMESSTARTED'];
// Kick/punt-return fields live BUNDLED into a return specialist's normal
// offensive or defensive stat row (GameOffensiveKPReturnStats/
// GameDefensiveKPReturnStats — confirmed real tables, a strict superset of
// GameOffensiveStats/GameDefensiveStats' own fields plus these), not a
// separate category table the way blocking/kicking are. Requesting these
// field names on a plain GameOffensiveStats/GameDefensiveStats row (which
// doesn't have them) just reads back null per readCell's own contract — safe
// to always include rather than branch per exact table name.
const GAME_KP_RETURN_FIELDS = ['KRETATTEMPTS', 'KRETLONGEST', 'KRETTDS', 'KRETYARDS', 'PRETATTEMPTS', 'PRETLONGEST', 'PRETTDS', 'PRETYARDS'];
const GAME_OFFENSIVE_STAT_FIELDS = [
  'PASSATTEMPTS', 'PASSCOMPLETED', 'PASSINTS', 'PASSLONGEST', 'PASSSACKED', 'PASSTDS', 'PASSYARDS',
  'RECEIVECATCHES', 'RECEIVEDROPS', 'RECEIVELONGEST', 'RECEIVETDS', 'RECEIVEYARDS', 'RECEIVEYARDSAFTER',
  'RUSH20YARDRUNS', 'RUSHATTEMPTS', 'RUSHBROKENTACKLES', 'RUSHFUMBLES', 'RUSHLONGEST', 'RUSHTDS', 'RUSHYARDS', 'RUSHYARDSAFTER1STHIT',
  'DOWNSPLAYED',
  ...GAME_KP_RETURN_FIELDS,
];
const GAME_DEFENSIVE_STAT_FIELDS = [
  'ASSDEFTACKLES', 'DEFPASSDEFLECTIONS', 'DEFTACKLES', 'DEFTACKLESFORLOSS',
  'DLINEFORCEDFUMBLES', 'DLINEFUMBLERECOVERIES', 'DLINEFUMBLERECOVERYYARDS', 'DLINEFUMBLETDS',
  'DLINEHALFSACK', 'DLINESACKS', 'DLINESAFETIES',
  'DSECINTLONGESTRETURN', 'DSECINTRETURNYARDS', 'DSECINTS', 'DSECINTTDS',
  // Whether the player appeared in this game AT ALL — a real, distinct
  // field from every counting stat above (verified: a real save had a
  // defender with a genuine 1-snap appearance and every counting stat at
  // 0 — that game was previously invisible in the extracted box score
  // entirely, since nothing else here would ever go non-zero for it).
  'DOWNSPLAYED',
  ...GAME_KP_RETURN_FIELDS,
];
const GAME_KICKING_STAT_FIELDS = [
  'KICKEPATTEMPTS', 'KICKEPBLOCKED', 'KICKEPMADE',
  'KICKFGATTEMPTS', 'KICKFGATTEMPTS29ORLESS', 'KICKFGATTEMPTS30TO39', 'KICKFGATTEMPTS40TO49', 'KICKFGATTEMPTS50ORMORE',
  'KICKFGBLOCKED', 'KICKFGLONGEST', 'KICKFGMADE', 'KICKFGMADE29ORLESS', 'KICKFGMADE30TO39', 'KICKFGMADE40TO49', 'KICKFGMADE50ORMORE',
  'KICKNUMKICKOFFS', 'KICKTOUCHBACKS',
  'PUNTATTEMPTS', 'PUNTBLOCKED', 'PUNTIN20', 'PUNTLONGEST', 'PUNTNETYARDS', 'PUNTTOUCHBACKS', 'PUNTYARDS',
  'DOWNSPLAYED',
];
const TEAM_GAME_STAT_FIELDS = [
  'FIRSTDOWNS', 'OFFYARDS', 'OFFPASSYARDS', 'OFFRUSHYARDS', 'TOTALYARDS',
  'RUSHATTEMPTS', 'RUSHTDS', 'PASSATTEMPTS', 'PASSCOMPLETIONS', 'PASSTDS', 'PASSINTS',
  'THIRDDOWNS', 'THIRDDOWNCONV', 'FOURTHDOWNS', 'FOURTHDOWNCONV', 'TWOPOINTCONVATTEMPTS', 'TWOPOINTCONVMADE',
  'OFFREDZONES', 'OFFREDZONETDS', 'OFFREDZONEFGS',
  'GIVEAWAYS', 'FUMBLESLOST', 'PUNTRETURNYARDS', 'KICKRETURNYARDS',
  'PUNTS', 'PUNTYARDS', 'PENALTIES', 'PENALTYYARDS', 'POSSESSIONTIME',
];

function pickFields(rec, fieldList) {
  const out = {};
  for (const f of fieldList) out[f] = readCell(rec, f);
  return out;
}

/**
 * Per-game player and team stat lines, whole-league, for every week the
 * save reports as actually played. Verified end-to-end against a real save
 * with a played game: Player.GameStats -> a row in the GameStats[] array
 * table (23 weekly slots, `GameStats1`..`GameStats22` — slot NUMBER equals
 * the save's own SeasonWeek value 1:1, confirmed via SeasonGame on the
 * resolved row) -> that slot resolves into ONE of GameOffensiveStats /
 * GameDefensiveStats / GameKickingStats depending on the player's
 * involvement that game; whichever table it resolves into IS the stat
 * category (a single GameOffensiveStats row covers passing+rushing+
 * receiving together for that player-game, not one row per category).
 * Team.TeamGameStatsRegSeason follows the identical array-of-weekly-slots
 * pattern one level up, resolving into TeamStats rows.
 *
 * @param {object} save
 * @param {object} playerTable - already had readRecords() called (buildPlayerRows already needs this)
 * @param {object} teamTable - already had readRecords() called (buildTeamMaps already needs this)
 * @param {object} F - buildPlayerFieldPicker(playerTable) output
 * @param {number[]} playedWeeks - week numbers (SeasonWeek convention) with at least one played game
 */
async function buildGameStats(save, playerTable, teamTable, F, playedWeeks) {
  const teamStatsByWeek = {};
  const playerStatsByWeek = {};
  for (const week of playedWeeks) {
    teamStatsByWeek[week] = {};
    playerStatsByWeek[week] = [];
  }
  if (!playedWeeks.length) return { teamStatsByWeek, playerStatsByWeek };

  if (teamTable) {
    for (const teamRec of teamTable.records) {
      if (!teamRec || teamRec.isEmpty) continue;
      const rawTid = Number(readCell(teamRec, 'TeamIndex'));
      if (!Number.isFinite(rawTid)) continue;
      const ref = readCell(teamRec, 'TeamGameStatsRegSeason');
      const arrRow = ref ? (await resolveRefWithTable(save, ref))?.rec : null;
      if (!arrRow) continue;
      for (const week of playedWeeks) {
        let slotRef;
        try { slotRef = arrRow[`TeamStats${week}`]; } catch (err) { continue; }
        const resolved = await resolveRefWithTable(save, slotRef);
        if (!resolved) continue;
        teamStatsByWeek[week][rawTid] = pickFields(resolved.rec, TEAM_GAME_STAT_FIELDS);
      }
    }
  }

  if (F.gameStats) {
    for (const rec of playerTable.records) {
      if (!rec || rec.isEmpty) continue;
      const ref = readCell(rec, F.gameStats);
      if (!ref) continue;
      const arrRow = (await resolveRefWithTable(save, ref))?.rec;
      if (!arrRow) continue;

      for (const week of playedWeeks) {
        let slotRef;
        try { slotRef = arrRow[`GameStats${week}`]; } catch (err) { continue; }
        const resolved = await resolveRefWithTable(save, slotRef);
        if (!resolved) continue;

        const tableName = resolved.table.name;
        let source = null;
        let fields = null;
        if (tableName === 'GameOffensiveStats' || tableName === 'GameOffensiveKPReturnStats') { source = 'offensive'; fields = GAME_OFFENSIVE_STAT_FIELDS; }
        else if (tableName === 'GameDefensiveStats' || tableName === 'GameDefensiveKPReturnStats') { source = 'defensive'; fields = GAME_DEFENSIVE_STAT_FIELDS; }
        else if (tableName === 'GameKickingStats') { source = 'kicking'; fields = GAME_KICKING_STAT_FIELDS; }
        else if (tableName === 'GameOLineStats') { source = 'oline'; fields = GAME_OLINE_STAT_FIELDS; }
        else continue;

        playerStatsByWeek[week].push({
          asset_name: F.assetName ? readCell(rec, F.assetName) : null,
          first_name: F.first ? readCell(rec, F.first) : null,
          last_name: F.last ? readCell(rec, F.last) : null,
          team_id: F.team ? Number(readCell(rec, F.team)) : null,
          source,
          raw: pickFields(resolved.rec, fields),
        });
      }
    }
  }

  return { teamStatsByWeek, playerStatsByWeek };
}

/**
 * Field-name resolution for the player table, computed once from its schema
 * and shared by both `buildPlayerRows` (whole-roster scan) and
 * `buildRecruitingBoard` (individual resolved rows reached via reference
 * chains) — both read the same underlying table, just different subsets of
 * its rows.
 */
function buildPlayerFieldPicker(table) {
  const fieldNames = new Set(table.schema.attributes.map((f) => f.name));
  const pick = (...names) => names.find((n) => fieldNames.has(n)) || null;
  return {
    first: pick('FirstName', 'PLYR_FIRSTNAME'),
    last: pick('LastName', 'PLYR_LASTNAME'),
    assetName: pick('PLYR_ASSETNAME', 'AssetName'),
    position: pick('Position', 'PLYR_POSITION'),
    team: pick('TeamIndex', 'PLYR_TEAM', 'TeamId'),
    jersey: pick('JerseyNum', 'PLYR_JERSEYNUM'),
    height: pick('Height', 'PLYR_HEIGHT'),
    weight: pick('Weight', 'PLYR_WEIGHT'),
    dev: pick('TraitDevelopment', 'PLYR_TRAITDEVELOPMENT', 'DevTrait'),
    year: pick('SchoolYear', 'PLYR_YEAR', 'YearsPro'),
    redshirt: pick('RedshirtStatus'),
    home: pick('PLYR_HOME_TOWN', 'PLYR_HOMETOWN', 'Hometown'),
    homeState: pick('PLYR_HOME_STATE'),
    stars: pick('ProspectStarRating', 'PLYR_STARS', 'StarRating'),
    overall: pick('OverallRating'),
    archetype: pick('PlayerType', 'PLYR_TYPE', 'Archetype'),
    // Whether the game's own coach carousel/team leadership named this
    // player a team captain — a direct boolean field, no derivation needed.
    // Verified against a real save: correctly true for the real Ohio State
    // Jeremiah Smith and false for an unrelated same-named player on a
    // different team (a different row entirely, not a duplicate).
    captain: pick('PLYR_ISCAPTAIN'),
    // Resolves to a real in-game headshot — see src/data/cfb27SaveImport.js's
    // mapPortraitUrl for the Unique_/Generic_ lookup rule. GenericHeadAssetName's
    // trailing number is the primary key; PLYR_PORTRAIT is a second, independent
    // numeric ID for the same portrait that resolves ~90% of the ~9% of Unique_
    // players whose primary number has no file in the bundled library (verified
    // against a real 16.5k-player save: adding it as a fallback took Unique_
    // coverage from 90.9% to 98.8%).
    genericHeadAssetName: pick('GenericHeadAssetName'),
    portraitId: pick('PLYR_PORTRAIT'),
    // Reference into the GameStats[] array table (one row per player, 23
    // weekly slots named GameStats0..GameStats22) — see buildGameStats.
    gameStats: pick('GameStats'),
  };
}

/**
 * The ratings/OVR/archetype/dev-trait/abilities computation shared by every
 * consumer of a raw player-table record — the whole-roster scan
 * (buildPlayerRows) and individual reference-chain lookups
 * (buildRecruitingBoard). Factored out so recruits get the exact same
 * rating/archetype/OVR treatment rostered players do, not a second, drifting
 * copy of the same logic.
 *
 * @returns {null} if the record has no rating fields at all (junk row)
 */
function buildPlayerCoreFields(rec, F, presentRatings) {
  const ratings = {};
  for (const field of presentRatings) {
    const v = readCell(rec, field);
    if (v !== null) ratings[field] = Number(v);
  }
  if (!Object.keys(ratings).length) return null;

  const position = F.position ? String(readCell(rec, F.position)) : null;
  const storedType = F.archetype ? readCell(rec, F.archetype) : null;

  const storedArch = storedType ? schema.ARCHETYPES.get(String(storedType)) : null;
  const inferred = position ? schema.bestArchetype(position, ratings) : null;

  const storedOvr = F.overall ? Number(readCell(rec, F.overall)) : null;

  let ovr = null;
  let archPlayerType = null;
  let archName = null;

  if (storedArch) {
    ovr = schema.computeOvr(storedArch, ratings);
    archPlayerType = storedArch.playerType;
    archName = storedArch.name;
  } else if (inferred) {
    ovr = inferred.ovr;
    archPlayerType = inferred.playerType;
    archName = inferred.name;
  }

  const devCode = F.dev ? readCell(rec, F.dev) : null;
  const abilities = archPlayerType
    ? schema.abilitySlots(archPlayerType).filter(Boolean)
    : [];

  return {
    position,
    archetype: archPlayerType,
    archetype_name: archName,
    ovr: Number.isFinite(storedOvr) ? storedOvr : ovr,
    dev_trait: devCode ? schema.DEV_TRAIT_LABELS.get(String(devCode)) || devCode : null,
    abilities,
    ratings: presentRatings.reduce((acc, field) => {
      acc[field.replace(/Rating$/, '')] = ratings[field] ?? null;
      return acc;
    }, {}),
  };
}

function buildPlayerRows(table, teamNames, opts, fieldPicker) {
  const fieldNames = new Set(table.schema.attributes.map((f) => f.name));
  const presentRatings = schema.RATING_FIELDS.filter((r) => fieldNames.has(r));
  const F = fieldPicker || buildPlayerFieldPicker(table);

  const rows = [];
  const total = (opts && opts.limit) || table.records.length;

  for (let i = 0; i < total; i += 1) {
    const rec = table.records[i];
    if (!rec || rec.isEmpty) continue;

    const core = buildPlayerCoreFields(rec, F, presentRatings);
    if (!core) continue;

    const teamId = F.team ? Number(readCell(rec, F.team)) : null;
    const teamInfo = teamId !== null ? teamNames.get(teamId) : null;
    const catalogTeam = teamId !== null ? schema.TEAMS_BY_ID.get(teamId) : null;
    const teamName = (teamInfo && teamInfo.name) || (catalogTeam ? catalogTeam.name : null);
    const teamNick = teamInfo ? teamInfo.nick : null;

    rows.push({
      asset_name: F.assetName ? readCell(rec, F.assetName) : null,
      generic_head_asset_name: F.genericHeadAssetName ? readCell(rec, F.genericHeadAssetName) : null,
      portrait_id: F.portraitId ? Number(readCell(rec, F.portraitId)) : null,
      first_name: F.first ? readCell(rec, F.first) : null,
      last_name: F.last ? readCell(rec, F.last) : null,
      position: core.position,
      team_id: teamId,
      team: teamName,
      team_nick: teamNick,
      jersey: F.jersey ? readCell(rec, F.jersey) : null,
      year: F.year ? readCell(rec, F.year) : null,
      redshirt: F.redshirt ? readCell(rec, F.redshirt) : null,
      hometown: F.home ? readCell(rec, F.home) : null,
      home_state: F.homeState ? readCell(rec, F.homeState) : null,
      height: F.height ? Number(readCell(rec, F.height)) : null,
      weight: F.weight ? Number(readCell(rec, F.weight)) : null,
      stars: F.stars ? readCell(rec, F.stars) : null,
      dev_trait: core.dev_trait,
      archetype: core.archetype,
      archetype_name: core.archetype_name,
      ovr: core.ovr,
      abilities: core.abilities,
      ratings: core.ratings,
      is_captain: F.captain ? Boolean(readCell(rec, F.captain)) : false,
    });
  }

  return rows;
}

/**
 * Extract everything the app's onboarding flow needs from a CFB 27 save:
 * players (all teams), team ratings + coaching staff (keyed by the save's
 * own team id, so the client can pick out just the user's chosen team),
 * conference alignment (all teams), current season year/week/phase, and
 * the full schedule (all games; the client filters to whichever team it
 * cares about).
 *
 * @param {string} filePath - path to a readable DYNASTY-* save file
 * @param {object} [opts]
 * @param {number} [opts.limit] - only process the first N player rows (testing)
 */
async function extractFullSave(filePath, opts = {}) {
  const save = await openSave(filePath);

  const playerTable = findPlayerTable(save, null);
  await playerTable.readRecords();
  const playerFieldPicker = buildPlayerFieldPicker(playerTable);
  const playerFieldNames = new Set(playerTable.schema.attributes.map((f) => f.name));
  const presentRatings = schema.RATING_FIELDS.filter((r) => playerFieldNames.has(r));

  const teamTable = await getBestTable(save, 'Team');
  const { names: teamNames, ratings: teamRatings, rankings: teamRankings } = buildTeamMaps(teamTable);

  const players = buildPlayerRows(playerTable, teamNames, opts, playerFieldPicker);
  const recruitingBoard = await buildRecruitingBoard(save, playerFieldPicker, presentRatings);

  const coachTable = await getBestTable(save, 'Coach');
  const coachingStaff = buildCoachingStaff(coachTable);

  const confTable = await getBestTable(save, 'Conference');
  const conferences = await buildConferences(save, confTable);

  const seasonTable = await getBestTable(save, 'SeasonInfo');
  const season = buildSeasonInfo(seasonTable);

  const gameTable = await getBestTable(save, 'SeasonGame');
  const games = await buildSchedule(save, gameTable, teamNames);

  // Only bother resolving weekly stat slots (whole-league, 2 tables' worth
  // of reference-chasing) for weeks that actually have a played game —
  // an early-season sync has 1-2 played weeks, not the full 15+.
  const playedWeeks = [...new Set(
    games.filter((g) => g.weekType === 'RegularSeason' && g.status !== 'Unplayed').map((g) => g.week)
  )];
  const gameStats = await buildGameStats(save, playerTable, teamTable, playerFieldPicker, playedWeeks);
  const depthCharts = await buildDepthCharts(save, teamTable, playerFieldPicker);

  return {
    players,
    teamCount: teamNames.size,
    tableRowCount: playerTable.records.length,
    teamRatings: Object.fromEntries(teamRatings),
    teamRankings: Object.fromEntries(teamRankings),
    coachingStaff: Object.fromEntries(coachingStaff),
    conferences,
    season,
    games,
    recruitingBoard,
    gameStats,
    depthCharts,
  };
}

/** Back-compat entry point: players only (used by the original CLI tool's
 * shape and any caller that only needs the roster). */
async function extractPlayers(filePath, opts = {}) {
  const full = await extractFullSave(filePath, opts);
  return {
    players: full.players,
    teamCount: full.teamCount,
    tableRowCount: full.tableRowCount,
  };
}

module.exports = { extractPlayers, extractFullSave };
