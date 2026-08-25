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

/**
 * Unlike getBestTable's tables (Team/Coach/Conference/SeasonInfo/SeasonGame —
 * a handful of rows, "many instances, one real one, rest are stale scratch
 * copies"), Recruit holds the WHOLE league's prospect pool — ~4100+ rows in
 * a real save, likely at or past a single table instance's row capacity.
 * That's a genuinely different shape: the live data can be split across
 * MULTIPLE simultaneously-real instances (an overflow chunk, not a stale
 * copy), and getBestTable's "keep only the single biggest instance" heuristic
 * would silently drop every recruit sitting in the other instance — with no
 * error, just a partial, seemingly-random per-team undercount (whichever
 * recruits happened to land in the chunk that got read). This merges every
 * instance's non-empty records instead of picking one. Also confirmed to be
 * the real shape (not just a theoretical concern) for PlayerAward, Coach,
 * SeasonGame, and Team — getBestTable's own instance-count warning caught
 * real discarded rows on all of them in one save.
 *
 * The returned array also carries a `.schema` property (from the first
 * instance that had one) for the rare caller that needs field-existence
 * checks (`records.schema.attributes`) the way a single table object would
 * provide — every instance of a given table name shares the same schema,
 * so any one of them is representative.
 */
async function getAllTableRecords(save, name) {
  let candidates = [];
  if (typeof save.getAllTablesByName === 'function') {
    candidates = save.getAllTablesByName(name) || [];
  }
  if (!candidates.length) {
    candidates = (save.tables || []).filter((t) => t.name === name);
  }
  const records = [];
  let schema = null;
  for (const t of candidates) {
    try {
      await t.readRecords();
      if (!schema && t.schema) schema = t.schema;
      for (const r of t.records) {
        if (r && !r.isEmpty) records.push(r);
      }
    } catch (err) {
      /* skip unreadable instance */
    }
  }
  records.schema = schema;
  return records;
}

/** The save carries several same-named tables (per-slot scratch instances);
 * only one is actually populated. Used for Team/Coach/Conference/SeasonInfo/
 * SeasonGame — all follow this same "many instances, one real one" shape.
 *
 * That assumption is NOT always true — PlayerAward was believed to fit it
 * too until a real, already-decided Jet Award winner turned out to be
 * invisible: the table actually shards across multiple simultaneously-
 * populated instances, and this function was silently discarding whichever
 * ones weren't "the biggest." That bug took a long manual investigation to
 * find precisely because getBestTable never said anything when it threw
 * real, non-empty rows away. The warning below exists so any OTHER table
 * with the same shape announces itself in the sync log immediately instead
 * of requiring another one of those investigations. */
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
  let totalCount = 0;
  for (const t of candidates) {
    try {
      await t.readRecords();
      const count = t.records.filter((r) => r && !r.isEmpty).length;
      totalCount += count;
      if (count > bestCount) {
        bestCount = count;
        best = t;
      }
    } catch (err) {
      /* skip unreadable instance */
    }
  }
  const discarded = totalCount - bestCount;
  if (discarded > 0) {
    console.warn(`[getBestTable] "${name}": kept ${bestCount} record(s) from one instance, but ${discarded} more non-empty record(s) exist across its other ${candidates.length - 1} instance(s) and were discarded. If this table is meant to hold whole-league data (not a handful of per-slot scratch rows), switch it to getAllTableRecords — see the PlayerAward/Recruit fix for precedent.`);
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
/**
 * @param {object} [attribsByTableName] - optional map of table name -> field
 *   list. When the resolved reference's table has an entry here, its FIRST
 *   readRecords() call is restricted to exactly those fields instead of
 *   decoding everything the table stores — safe because the table name isn't
 *   known until the reference is decoded, so this can't be decided by the
 *   caller ahead of time the way the player table's read is. Every existing
 *   caller that doesn't pass this keeps today's unrestricted behavior.
 */
async function resolveRefWithTable(save, refString, attribsByTableName) {
  if (!refString || typeof refString !== 'string' || refString.length < 16) return null;
  const tableId = parseInt(refString.slice(0, 15), 2);
  const rowNumber = parseInt(refString.slice(15), 2);
  if (!Number.isFinite(tableId) || tableId === 0 || !Number.isFinite(rowNumber)) return null;
  const table = save.getTableById(tableId);
  if (!table) return null;
  if (!table.records || table.records.length === 0) {
    const attribs = attribsByTableName ? attribsByTableName[table.name] : undefined;
    await table.readRecords(attribs);
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
function buildTeamMaps(teamRecords) {
  const names = new Map();
  const ratings = new Map();
  // TeamIndex 255 is shared by all 5 FCS filler rows (East/Midwest/
  // Northwest/Southeast/West — see buildSchedule's comment on the same
  // sentinel), so `ratings` above can only ever retain ONE of their 5 real,
  // distinct ratings (last one processed silently overwrites the rest).
  // Each row still has its own real name and its own real TEAM_RATING*
  // fields though, so capture ratings keyed by NAME here too — same
  // technique buildSchedule already uses to read each one's correct name
  // straight off its own row instead of through the collision-prone
  // TeamIndex map. cfb27SaveSync.js routes these back to the app's 5 real
  // FCS placeholder tids via FCS_FILLER_NAME_TO_TID.
  const fcsFillerRatings = new Map();
  const rankings = new Map();
  // The save tracks Media Poll and CFP Committee rank as TWO SEPARATE
  // fields that can genuinely disagree (verified against a real save: Media
  // Poll had Georgia #1/Miami #2, CFP Poll had Miami #1/Georgia #2) — the
  // real in-game CFP Bracket screen is seeded off CFPPoll_CurrentRank
  // specifically, not the Media Poll `rankings` above. Conflating the two
  // (this file used to only ever extract Media Poll) silently seeded the
  // tracker's bracket off the wrong poll.
  const cfpRankings = new Map();
  // Raw (id -> {national, conference}) TopClassRank/TopClassConferenceRank
  // values, 0-indexed exactly as the save stores them — renumbered into
  // topClassRanks (below, after the loop) once every team's raw value is
  // known. Excluding id 255 (see below) leaves a gap at the front of the
  // raw sequence that a per-row +1 can't fix; only a second pass that knows
  // every OTHER real team's raw value can close it correctly.
  const rawTopClassRanks = new Map();
  const topClassRanks = new Map();
  if (!teamRecords || !teamRecords.length) return { names, ratings, fcsFillerRatings, rankings, cfpRankings, topClassRanks };

  const fields = new Set((teamRecords.schema?.attributes || []).map((f) => f.name));
  const nameField = ['LongName', 'DisplayName', 'TeamName'].find((n) => fields.has(n));
  const nickField = ['NickName', 'Mascot'].find((n) => fields.has(n));
  const idField = ['TeamIndex', 'TEAM_ORIGID', 'TeamId'].find((n) => fields.has(n));
  if (!nameField) return { names, ratings, fcsFillerRatings, rankings, cfpRankings, topClassRanks };

  teamRecords.forEach((rec, i) => {
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
      const ratingObj = {
        overall: Number.isFinite(overall) ? overall : null,
        offense: Number.isFinite(offense) ? offense : null,
        defense: Number.isFinite(defense) ? defense : null,
      };
      ratings.set(id, ratingObj);
      if (id === 255 && name && String(name).trim() !== '') {
        fcsFillerRatings.set(String(name).trim(), ratingObj);
      }
    }

    // Media Poll — the game's default/primary Top 25 ranking (verified
    // against a real save: preseason ranks 1-25 populated and sane, e.g.
    // Ohio State #1 the year after winning it all in the simulation).
    const mediaRank = Number(readCell(rec, 'MediaPoll_CurrentRank'));
    if (Number.isFinite(mediaRank) && mediaRank >= 1 && mediaRank <= 25) {
      rankings.set(id, mediaRank);
    }

    // CFP Committee Poll — the SEPARATE ranking the real 12-team bracket is
    // actually seeded from (see this function's header comment).
    const cfpRank = Number(readCell(rec, 'CFPPoll_CurrentRank'));
    if (Number.isFinite(cfpRank) && cfpRank >= 1 && cfpRank <= 25) {
      cfpRankings.set(id, cfpRank);
    }

    // EA's own precomputed recruiting-class rank. id 255 is the save's
    // internal "no team assigned" sentinel (same one excluded elsewhere in
    // this file for player rows) — verified it carries a garbage
    // TopClassRank with zero actual recruits. Excluded from rawTopClassRanks
    // entirely (not just filtered at display time) so the renumbering pass
    // below never has to know about it.
    if (id === 255) return;
    const topClassRank = Number(readCell(rec, 'TopClassRank'));
    const topClassConfRank = Number(readCell(rec, 'TopClassConferenceRank'));
    if (Number.isFinite(topClassRank) || Number.isFinite(topClassConfRank)) {
      rawTopClassRanks.set(id, {
        national: Number.isFinite(topClassRank) ? topClassRank : null,
        conference: Number.isFinite(topClassConfRank) ? topClassConfRank : null,
      });
    }
  });

  // Renumber to sequential 1-indexed ranks from the RAW values, now that
  // every real team's value is known — a per-row +1 can't do this correctly
  // once the sentinel is excluded, since a real team's raw value doesn't
  // reliably start at 0 once the sentinel (whatever raw value IT happened to
  // have) is out of the picture.
  const byNational = [...rawTopClassRanks.entries()].filter(([, v]) => v.national != null).sort((a, b) => a[1].national - b[1].national);
  byNational.forEach(([id], i) => {
    topClassRanks.set(id, { ...(topClassRanks.get(id) || {}), national: i + 1 });
  });
  // Conference rank isn't renumbered the same way — buildTeamMaps doesn't
  // have conference-membership data (that's a separate table/function), so
  // there's no confirmed evidence here that the sentinel displaces any real
  // team's conference rank the way it did nationally. Simple +1, unchanged
  // from before this fix.
  for (const [id, v] of rawTopClassRanks) {
    if (v.conference == null) continue;
    topClassRanks.set(id, { ...(topClassRanks.get(id) || {}), conference: v.conference + 1 });
  }

  return { names, ratings, fcsFillerRatings, rankings, cfpRankings, topClassRanks };
}

const COACH_POSITIONS = {
  HeadCoach: 'headCoach',
  OffensiveCoordinator: 'offensiveCoordinator',
  DefensiveCoordinator: 'defensiveCoordinator',
};

function buildCoachingStaff(coachRecords) {
  const staff = new Map();
  if (!coachRecords) return staff;

  for (const rec of coachRecords) {
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
      // NOTE: this is whichever coach the save currently has SLOTTED into
      // this position for this team — not necessarily the human-controlled
      // one (confirmed on a real save these can differ). For "is this coach
      // actually me," use buildUserCoachInfo's IsUserControlled-flagged row
      // instead of cross-referencing this map by team+position.
      generic_head_asset_name: readCell(rec, 'GenericHeadAssetName') || null,
      portrait_id: Number(readCell(rec, 'Portrait')) || null,
    };
  }

  return staff;
}

/**
 * The human-controlled coach's current team/position — Coach.IsUserControlled,
 * verified against a real save: exactly one Coach row across the whole
 * league has this flag set (Ryan Day, HeadCoach, Ohio State), and it's a
 * direct boolean field on the SAME Coach row buildCoachingStaff already
 * reads (TeamIndex/Position both already proven fields there). Lets a sync
 * detect a real in-game job change (the human took a new job, which this
 * flag alone reflects — no separate "did the user accept" confirmation
 * exists in the save) without asking the user to re-confirm it manually.
 *
 * @returns {{ rawTid: number, position: string } | null}
 */
// Distinct from COACH_POSITIONS above (which maps to the coaching-STAFF
// display shape, e.g. 'headCoach') — this maps to the app's own
// dynasty.coachPosition short-code convention ('HC'/'OC'/'DC') instead.
const USER_COACH_POSITION_CODE = {
  HeadCoach: 'HC',
  OffensiveCoordinator: 'OC',
  DefensiveCoordinator: 'DC',
};

// CareerCoachStats sub-record fields → the app's own dynasty.userCoachCareerStats
// shape. Coach.CareerStats is a single (non-array) reference field, resolved
// the same way as other proven reference fields in this file (Team.HeadCoach,
// Conference.TeamSlots) via resolveRef. Verified against a real save's Coach
// schema (Franchise-Schemas/CareerCoachStats.ftx, 26 members) — these are
// LIFETIME totals across the coach's whole career (any school), not scoped to
// the coach's current school, except WinsAtCurrentSchool/LossesAtCurrentSchool
// which are explicitly current-school-only and intentionally not surfaced here
// (the app's own per-stint game-derived numbers already cover that case).
const CAREER_COACH_STATS_FIELDS = {
  wins: 'Wins',
  losses: 'Losses',
  bowlWins: 'BowlWins',
  bowlLosses: 'BowlLosses',
  confChampWins: 'ConfChampWins',
  confChampLosses: 'ConfChampLosses',
  playoffWins: 'PlayoffWins',
  playoffLosses: 'PlayoffLosses',
  ncWins: 'NCWins',
  ncLosses: 'NCLosses',
  rivalWins: 'RivalWins',
  rivalLosses: 'RivalLosses',
  top25Wins: 'Top25Wins',
  top25Losses: 'Top25Losses',
  draftPicks: 'DraftPicks',
  firstRoundDraftPicks: 'FirstRoundDraftPicks',
  top5RecruitClasses: 'Top5RecruitClasses',
  timesFired: 'TimesFired',
  confChampWinStreak: 'ConfChampWinStreak',
  rivalWinStreak: 'RivalWinStreak',
  winsAtCurrentSchool: 'WinsAtCurrentSchool',
  lossesAtCurrentSchool: 'LossesAtCurrentSchool',
};

// Coach.CoachPrestige (LetterGrade enum) decodes to symbol names like
// "Dplus"/"Aminus" (verified against Football-Schemas/LetterGrade.ftx's 17
// members) — not the "D+"/"A-" the in-game coach card actually displays.
// "Incomplete" means the game hasn't assigned a grade yet (e.g. year one).
const LETTER_GRADE_LABELS = {
  Aplus: 'A+', A: 'A', Aminus: 'A-',
  Bplus: 'B+', B: 'B', Bminus: 'B-',
  Cplus: 'C+', C: 'C', Cminus: 'C-',
  Dplus: 'D+', D: 'D', Dminus: 'D-',
  F: 'F', Incomplete: null,
};

// Coach.CurrentJobSecurityStatus (JobSecurityStatus enum) decodes to
// "SafeForNow"/"HotSeat" etc. (Franchise-Schemas/JobSecurityStatus.ftx) —
// spaced out to match the in-game "Safe For Now"/"Hot Seat" label text.
const JOB_SECURITY_STATUS_LABELS = {
  Safe: 'Safe', SafeForNow: 'Safe For Now', Low: 'Low', HotSeat: 'Hot Seat', Invalid: null,
};

async function buildUserCoachInfo(save, coachRecords) {
  if (!coachRecords) return null;
  for (const rec of coachRecords) {
    if (!rec || rec.isEmpty) continue;
    if (!readCell(rec, 'IsUserControlled')) continue;
    const position = USER_COACH_POSITION_CODE[readCell(rec, 'Position')];
    const rawTid = Number(readCell(rec, 'TeamIndex'));
    if (!position || !Number.isFinite(rawTid)) continue;
    // Coach has no separate stable id column, so buildCoachOffers matches
    // StaffPersonContractOffer.StaffPerson refs against this exact record
    // OBJECT (resolveRefWithTable returns the same cached object every time
    // it resolves the same underlying row within one extractFullSave call) —
    // NOT a row-position number. Coach is confirmed sharded across multiple
    // simultaneously-populated table instances (getBestTable's own instance-
    // count warning caught a real save missing 1 of 498 coaches), so a
    // position-within-the-merged-array number would silently stop matching
    // the raw reference's real (table, rowNumber) coordinate for anyone
    // whose own coach lands after the first instance.
    //
    // Portrait fields pulled from THIS specific row (not cross-referenced by
    // team+position through buildCoachingStaff) — verified against a real
    // save that those two lookups can disagree: TeamIndex 79's "headCoach"
    // position slot held a different coach (Sean Lewis) than the row
    // actually flagged IsUserControlled (the real human's own coach,
    // presumably mid-succession or otherwise not the same row). The
    // IsUserControlled flag is the only reliable way to identify the
    // specific coach that's really you.
    const first = readCell(rec, 'FirstName') || '';
    const last = readCell(rec, 'LastName') || '';

    // Live, current-moment program/coach standing — snapshot only (no
    // history), same convention as the in-game coach card.
    const jobSecurityPct = Number(readCell(rec, 'CurrentJobSecurityPercentage'));
    const rawPrestigeGrade = readCell(rec, 'CoachPrestige');
    const prestigeGrade = rawPrestigeGrade != null
      ? (LETTER_GRADE_LABELS[rawPrestigeGrade] ?? null)
      : null;
    const prestigeScore = Number(readCell(rec, 'CoachPrestigeScore'));
    const careerWinSeasons = Number(readCell(rec, 'CareerWinSeasons'));
    const rawJobSecurityStatus = readCell(rec, 'CurrentJobSecurityStatus');
    const jobSecurityStatus = rawJobSecurityStatus != null
      ? (JOB_SECURITY_STATUS_LABELS[rawJobSecurityStatus] ?? null)
      : null;

    let careerStats = null;
    try {
      const careerStatsRec = await resolveRef(save, readCell(rec, 'CareerStats'));
      if (careerStatsRec && !careerStatsRec.isEmpty) {
        careerStats = {};
        for (const [key, field] of Object.entries(CAREER_COACH_STATS_FIELDS)) {
          const v = Number(readCell(careerStatsRec, field));
          careerStats[key] = Number.isFinite(v) ? v : 0;
        }
      }
    } catch (err) {
      // Leave careerStats null — the sync layer treats that as "no data",
      // not a crash reason.
    }

    return {
      rawTid,
      position,
      coachRec: rec,
      name: `${first} ${last}`.trim() || null,
      generic_head_asset_name: readCell(rec, 'GenericHeadAssetName') || null,
      portrait_id: Number(readCell(rec, 'Portrait')) || null,
      jobSecurityPct: Number.isFinite(jobSecurityPct) ? jobSecurityPct : null,
      jobSecurityStatus,
      prestigeGrade,
      prestigeScore: Number.isFinite(prestigeScore) ? prestigeScore : null,
      careerWinSeasons: Number.isFinite(careerWinSeasons) ? careerWinSeasons : null,
      careerStats,
    };
  }
  return null;
}

/**
 * Every current Head Coach in the league (not just the human's own row) —
 * powers the "All Coaches" national leaderboard, same column set as the
 * in-game Coach Stats screen minus "Cost": verified against a real sync
 * that neither ContractSalary nor any other Coach-record numeric field
 * (CoachPoints, ExperiencePoints, LegacyScore, AwardPoints, Level,
 * CoachPrestigeScore — all tried) matches that screen's Cost column, even
 * in relative ranking order, so it's presumed to be a value EA computes
 * for that UI rather than a single stored field. CoachPrestigeScore is
 * used instead as the table's default sort.
 */
async function buildAllHeadCoaches(save, coachRecords) {
  const coaches = [];
  if (!coachRecords) return coaches;
  let nonEmptyRows = 0;
  let headCoachRows = 0;
  for (const rec of coachRecords) {
    if (!rec || rec.isEmpty) continue;
    nonEmptyRows++;
    if (readCell(rec, 'Position') !== 'HeadCoach') continue;
    headCoachRows++;
    const rawTid = Number(readCell(rec, 'TeamIndex'));
    if (!Number.isFinite(rawTid)) continue;
    const first = readCell(rec, 'FirstName') || '';
    const last = readCell(rec, 'LastName') || '';
    const name = `${first} ${last}`.trim();
    if (!name) continue;

    const jobSecurityPct = Number(readCell(rec, 'CurrentJobSecurityPercentage'));
    const rawPrestigeGrade = readCell(rec, 'CoachPrestige');
    const prestigeGrade = rawPrestigeGrade != null ? (LETTER_GRADE_LABELS[rawPrestigeGrade] ?? null) : null;
    const prestigeScore = Number(readCell(rec, 'CoachPrestigeScore'));
    const rawJobSecurityStatus = readCell(rec, 'CurrentJobSecurityStatus');
    const jobSecurityStatus = rawJobSecurityStatus != null ? (JOB_SECURITY_STATUS_LABELS[rawJobSecurityStatus] ?? null) : null;

    let careerStats = null;
    try {
      const careerStatsRec = await resolveRef(save, readCell(rec, 'CareerStats'));
      if (careerStatsRec && !careerStatsRec.isEmpty) {
        careerStats = {};
        for (const [key, field] of Object.entries(CAREER_COACH_STATS_FIELDS)) {
          const v = Number(readCell(careerStatsRec, field));
          careerStats[key] = Number.isFinite(v) ? v : 0;
        }
      }
    } catch (err) {
      // Leave careerStats null for this coach; the rest of the row is
      // still useful.
    }

    coaches.push({
      rawTid,
      name,
      generic_head_asset_name: readCell(rec, 'GenericHeadAssetName') || null,
      portrait_id: Number(readCell(rec, 'Portrait')) || null,
      jobSecurityPct: Number.isFinite(jobSecurityPct) ? jobSecurityPct : null,
      jobSecurityStatus,
      prestigeGrade,
      prestigeScore: Number.isFinite(prestigeScore) ? prestigeScore : null,
      careerStats,
    });
  }
  // Diagnostic for the "All Coaches leaderboard came back empty" report —
  // same "announce it instead of failing silently" spirit as getBestTable's
  // own discarded-record warning above. Pins down whether the problem is
  // HERE (the Coach table read / HeadCoach filter) or downstream (cfb27Sync.js's
  // rawTeamIdMap resolution) by comparing what THIS function actually found
  // against what it returned.
  if (nonEmptyRows === 0) {
    console.warn('[buildAllHeadCoaches] Coach table returned zero non-empty rows.');
  } else if (headCoachRows === 0) {
    console.warn(`[buildAllHeadCoaches] ${nonEmptyRows} Coach row(s) read but none had Position === 'HeadCoach'.`);
  } else if (coaches.length < headCoachRows) {
    console.warn(`[buildAllHeadCoaches] ${headCoachRows} HeadCoach row(s) found but only ${coaches.length} had a resolvable TeamIndex + name.`);
  }
  return coaches;
}

/**
 * Coach-carousel job offers currently pending for the user's own coach.
 * JobOpening.ContractOfferList resolves to a StaffPersonContractOffer[]
 * array record (up to 6 candidate slots — verified arraySize 6 on a real
 * save); each populated slot resolves into the StaffPersonContractOffer
 * table, whose StaffPerson ref is the CANDIDATE coach being courted for that
 * job. Verified against a real save: exactly one match (USC's HeadCoach
 * opening, Status "Pending", 1560 offered vs 1360 expected program points) —
 * and it's the ONLY match in the whole 181-row JobOpening table, exactly
 * matching that same coach's own Coach.NumContractOffers value (1).
 *
 * Matched by resolving StaffPerson through resolveRefWithTable and
 * comparing the resulting record object against userCoachRec (the exact
 * same cached record object buildUserCoachInfo found) — NOT by decoding a
 * raw row-position number and comparing it to a row-position within some
 * separately-read Coach table. Coach is confirmed sharded across multiple
 * simultaneously-populated table instances (getBestTable's own instance-
 * count warning caught a real save missing 1 of 498 coaches), so a
 * position-within-one-instance number is not a safe identity to compare —
 * resolveRefWithTable always finds the coach's TRUE originating instance
 * regardless of how many there are, and table.records[rowNumber] is a
 * stable cached object within one extractFullSave/save session, so object
 * identity is a correct, instance-agnostic comparison.
 *
 * @returns {Array<{rawTid:number, position:string, status:string,
 *   offeredPoints:number, expectedPoints:number, length:number}>}
 */
async function buildCoachOffers(save, jobTable, userCoachRec) {
  const offers = [];
  if (!jobTable || !userCoachRec) return offers;

  for (const jobRec of jobTable.records) {
    if (!jobRec || jobRec.isEmpty) continue;
    const arrResolved = await resolveRefWithTable(save, readCell(jobRec, 'ContractOfferList'));
    if (!arrResolved || !arrResolved.rec) continue;
    const arrRec = arrResolved.rec;
    const size = arrRec.arraySize || 0;
    for (let i = 0; i < size; i++) {
      const offerResolved = await resolveRefWithTable(save, readCell(arrRec, `StaffPersonContractOffer${i}`));
      if (!offerResolved || !offerResolved.rec || offerResolved.rec.isEmpty) continue;
      const offerRec = offerResolved.rec;
      const staffRef = readCell(offerRec, 'StaffPerson');
      if (!staffRef) continue;
      const staffResolved = await resolveRefWithTable(save, staffRef);
      if (!staffResolved || !staffResolved.rec || staffResolved.rec !== userCoachRec) continue;

      const teamRec = await resolveRef(save, readCell(jobRec, 'Team'));
      const rawTid = teamRec ? Number(readCell(teamRec, 'TeamIndex')) : null;
      if (!Number.isFinite(rawTid)) continue;

      offers.push({
        rawTid,
        position: readCell(jobRec, 'Position') || null,
        status: readCell(offerRec, 'Status') || null,
        offeredPoints: Number(readCell(offerRec, 'OfferedContractProgramPoints')) || 0,
        expectedPoints: Number(readCell(offerRec, 'ExpectedContractProgramPoints')) || 0,
        length: Number(readCell(offerRec, 'Length')) || null,
      });
    }
  }
  return offers;
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
async function buildDepthCharts(save, teamRecords, playerFieldPicker) {
  const depthCharts = {};
  if (!teamRecords || !teamRecords.length) return depthCharts;
  const fields = new Set((teamRecords.schema?.attributes || []).map((f) => f.name));
  const idField = ['TeamIndex', 'TEAM_ORIGID', 'TeamId'].find((n) => fields.has(n));
  if (!idField || !fields.has('DepthChart')) return depthCharts;

  for (const rec of teamRecords) {
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
    // Boundary markers needed to convert CurrentWeek (one continuous count
    // across the whole season, verified up to 21 in a real save) into the
    // app's own PHASE-RELATIVE week numbering (conference championship
    // always week 1, postseason weeks 1-4/5) — see cfb27SaveImport.js's
    // mapSeasonInfo for why this conversion is required, not optional.
    regularSeasonLastWeek: Number(readCell(rec, 'RegularSeasonLastWeekScheduled')) || null,
    conferenceChampionshipWeek: Number(readCell(rec, 'RegularSeasonWeekConferenceChampionship')) || null,
  };
}

/**
 * Every league game (current season — the save only exposes SeasonYear 0,
 * i.e. "this season"; there's no separate historical-schedule table to pull
 * prior seasons from). Callers filter down to whichever team(s) they care
 * about. HomeTeam/AwayTeam resolve the same reference-chain way as
 * Conference.TeamSlots.
 */
/**
 * Maps each of the 6 NY6 bowl stadiums (PlayoffBowlsInfo, always exactly 6
 * rows) to its real bowl name. Verified against a real save: a CFP
 * quarterfinal SeasonGame row's own Stadium ref matches one of these 6
 * exactly, revealing THIS year's real site rotation (this save: Peach/
 * Fiesta/Cotton/Rose hosting quarterfinals) — the generic "CFP Quarterfinal"
 * BowlGame.Name alone can't tell you which specific bowl it actually is.
 *
 * @returns {Map<string, string>} raw Stadium ref string -> bowl name
 */
async function buildPlayoffBowlSites(save) {
  const sites = new Map();
  const table = await getBestTable(save, 'PlayoffBowlsInfo');
  if (!table) return sites;
  for (const rec of table.records) {
    if (!rec || rec.isEmpty) continue;
    const stadiumRef = readCell(rec, 'Stadium');
    const name = readCell(rec, 'Name');
    if (stadiumRef && name) sites.set(stadiumRef, name);
  }
  return sites;
}

async function buildSchedule(save, gameRecords, teamNames, playoffBowlSites) {
  const games = [];
  if (!gameRecords) return games;

  for (const rec of gameRecords) {
    if (!rec || rec.isEmpty) continue;
    const homeRec = await resolveRef(save, readCell(rec, 'HomeTeam'));
    const awayRec = await resolveRef(save, readCell(rec, 'AwayTeam'));
    const weekType = readCell(rec, 'SeasonWeekType');
    // Regular-season games always have both sides resolved — but a CFP
    // quarterfinal "bye" shell legitimately has a null AwayTeam (TBD, still
    // waiting on the first-round winner) until that earlier round finishes.
    // Requiring both unconditionally silently dropped every quarterfinal/
    // semifinal/championship row from the whole schedule the moment either
    // side was still unresolved — which is exactly the normal state for a
    // bye slot, not a data problem, so postseason rows only require ONE side.
    const isRegularSeason = weekType === 'RegularSeason';
    if (isRegularSeason && (!homeRec || !awayRec)) continue;
    if (!isRegularSeason && !homeRec && !awayRec) continue;
    const homeTid = homeRec ? Number(readCell(homeRec, 'TeamIndex')) : null;
    const awayTid = awayRec ? Number(readCell(awayRec, 'TeamIndex')) : null;
    if (isRegularSeason && (!Number.isFinite(homeTid) || !Number.isFinite(awayTid))) continue;

    // TeamIndex 255 is shared by FIVE distinct generic-schedule-filler rows
    // (FCS East/Midwest/Northwest/Southeast/West all read TeamIndex 255 —
    // confirmed directly against a real save's own Team table, this is EA's
    // own data, not an extraction bug). teamNames.get(255) can only ever
    // return ONE of the five (whichever buildTeamMaps' scan processed
    // last), silently mislabeling every OTHER generic-FCS opponent with
    // the wrong specific regional name (e.g. a real "FCS Midwest" game
    // showing as "FCS West"). resolveRef already landed on the exact right
    // row for THIS game, so read the name straight off it instead of
    // through the lossy by-TeamIndex map for this one sentinel value.
    const nameFromRec = (rec) => readCell(rec, 'LongName') || readCell(rec, 'DisplayName') || readCell(rec, 'TeamName') || null;
    const nickFromRec = (rec) => readCell(rec, 'NickName') || readCell(rec, 'Mascot') || null;
    const homeInfo = homeTid === 255
      ? { name: nameFromRec(homeRec), nick: nickFromRec(homeRec) }
      : (homeTid != null ? teamNames.get(homeTid) : null);
    const awayInfo = awayTid === 255
      ? { name: nameFromRec(awayRec), nick: nickFromRec(awayRec) }
      : (awayTid != null ? teamNames.get(awayTid) : null);

    // Bowl/CFP resolution — only worth the extra ref-chase for the ~45
    // non-regular-season games per year, not all ~900 regular-season ones.
    // BowlGame.Name resolves to the real bowl (Sugar/Cotton/Rose/Orange/
    // Peach/Fiesta/National Championship/any of the 45 regular bowls).
    // IsPlayoffBowl + PlayoffBracketSlot (0-3 first round, 4-7 quarterfinal,
    // 8-9 semifinal, 10 championship) identify the 11 CFP bracket games,
    // which live in this SAME 45-row BowlGame table alongside the 34 regular
    // bowls — verified directly against a real save's full BowlGame table.
    let bowlName = null;
    let isPlayoffBowl = null;
    let playoffBracketSlot = null;
    if (weekType && weekType !== 'RegularSeason') {
      const bowlRec = await resolveRef(save, readCell(rec, 'BowlGame'));
      if (bowlRec) {
        bowlName = readCell(bowlRec, 'Name') || null;
        isPlayoffBowl = Boolean(readCell(bowlRec, 'IsPlayoffBowl'));
        playoffBracketSlot = Number(readCell(bowlRec, 'PlayoffBracketSlot'));
        if (!Number.isFinite(playoffBracketSlot)) playoffBracketSlot = null;
        // For CFP quarterfinal/semifinal/championship games, BowlGame.Name is
        // only ever a generic category label ("CFP Quarterfinal") — the
        // game's own Stadium ref reveals which real NY6 bowl it actually is,
        // once that site has been assigned in the save.
        if (isPlayoffBowl && playoffBowlSites) {
          const realName = playoffBowlSites.get(readCell(rec, 'Stadium'));
          if (realName) bowlName = realName;
        }
      }
    }

    games.push({
      week: Number(readCell(rec, 'SeasonWeek')),
      weekType,
      bowlName,
      isPlayoffBowl,
      playoffBracketSlot,
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
      // Real kickoff date/time — GameDateMonth/GameDateDay + SeasonYear give
      // the calendar date; TimeOfDay is minutes-since-midnight (verified
      // exact against a real save: 1065 -> 17:45 -> "5:45 PM", matching the
      // in-game schedule screen's own Time(ET) column for that same game).
      // DayOfWeek is the save's own label, kept as-is rather than derived
      // (the dynasty's internal calendar doesn't necessarily line up with
      // any real-world year).
      gameDateMonth: Number(readCell(rec, 'GameDateMonth')) || null,
      gameDateDay: Number(readCell(rec, 'GameDateDay')) || null,
      dayOfWeek: readCell(rec, 'DayOfWeek') || null,
      timeOfDayMinutes: (() => {
        const t = Number(readCell(rec, 'TimeOfDay'));
        return Number.isFinite(t) ? t : null;
      })(),
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
    // All 10 tracked schools (not just slot 0) — lets callers work out where
    // the user's OWN team currently ranks in this recruit's interest list
    // (the in-game "Int: 6th" label), sorted by TeamInfluence descending same
    // as the in-game list itself. Verified technique against the scratch
    // script (scratch_ro27_asar/build-recruiting-table.mjs) which reads the
    // identical TopSchoolsList -> ProspectTargetSchool0..9 chain across all
    // 10 slots and sorts the same way.
    let committedTeamId = null;
    const topSchools = [];
    const topSchoolsRow = await resolveRef(save, readCell(recruitRec, 'TopSchoolsList'));
    if (topSchoolsRow) {
      for (let i = 0; i < 10; i++) {
        const topSchoolRef = readCell(topSchoolsRow, `ProspectTargetSchool${i}`);
        const topSchoolRow = await resolveRef(save, topSchoolRef);
        if (!topSchoolRow || topSchoolRow.isEmpty) continue;
        const tid = Number(readCell(topSchoolRow, 'TeamId'));
        if (!Number.isFinite(tid)) continue;
        const influence = Number(readCell(topSchoolRow, 'TeamInfluence'));
        topSchools.push({ team_id: tid, influence: Number.isFinite(influence) ? influence : 0 });
      }
      topSchools.sort((a, b) => b.influence - a.influence);
      if (topSchools.length) committedTeamId = topSchools[0].team_id;
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
      // The scout's Gem/Bust read on this prospect's TRUE dev-trait
      // ceiling/floor (the green/red gem icon on the in-game Scouting
      // screen) — verified against a real save: 'NORMAL'/'GEM'/'BUST' are
      // the only 3 values (checked all 4,101 rows in the Recruit table).
      // cfb27SaveSync.js maps these to the app's existing gemBust
      // convention ('Gem'/'Bust'/'').
      quality_modifier: readCell(recruitRec, 'QualityModifier'),
      // Sorted by influence descending (highest first) — same order the
      // in-game interest list shows. Callers resolve each team_id through
      // their own raw-team-id map to find where a given team (e.g. the
      // user's own) currently ranks.
      top_schools: topSchools,
      scholarship_status: readCell(rec, 'ScholarshipStatus'),
      committed_week: Number(readCell(rec, 'CommittedWeekNumber')) || null,
      is_favorite: Boolean(readCell(rec, 'IsFavorite')),
      current_nil_offer: Number(readCell(rec, 'CurrentNILOffer')) || null,
      // Real attributes/dev-trait are always present in the save (the game
      // generates them immediately, before any scouting happens) — the
      // reveal-to-the-user timing is a UI-layer mechanic on top. Originally
      // tracked here via UnlockedIntelBitfield, believed (on a single data
      // point) to hit 12 once fully scouted — disproven against a real save:
      // a recruit directly confirmed 100% scouted in-game (attributes
      // visible, matching exactly) still read bitfield 0, same as every
      // signed recruit already found reading 0 regardless of scouting. That
      // field carries no signal at all for this. ProspectHoursSpentCurrent
      // is the real one — an actual per-recruit scouting-hours counter (not
      // a flag), confirmed against that same 100%-scouted recruit at value
      // 30. cfb27SaveSync.js gates attribute reveal on this reaching 30.
      prospect_hours_spent: Number(readCell(rec, 'ProspectHoursSpentCurrent')) || 0,
    });
  }

  return targets;
}

/**
 * Whole national recruiting class, aggregated per team — NOT the same as
 * buildRecruitingBoard above (which is scoped to UserRecruitTarget, the
 * user's own board only). Reads EVERY instance of the Recruit table via
 * getAllTableRecords, not just the single biggest one (~4100 rows in a real
 * save is large enough to spill across more than one live instance — see
 * getAllTableRecords' comment; using getBestTable here silently dropped
 * whichever recruits landed in the instance that didn't get read, producing
 * a partial, seemingly-random per-team undercount), resolving each
 * committed recruit's real destination team via the SAME
 * TopSchoolsList -> ProspectTargetSchool0 -> TeamId chain buildRecruitingBoard
 * already uses above, filtered to RecruitStage SoftCommitted/HardCommitted/
 * Signed (any committed stage — matches the in-game Top Classes screen,
 * which counts a class member from their first verbal commitment onward,
 * not just once they hard-commit or sign). An earlier version of this filter
 * only counted HardCommitted/Signed, which happened to match a real save
 * late in the recruiting cycle (most commits had already progressed past
 * SoftCommitted by then) but badly undercounted early in a season, when most
 * commits are still SoftCommitted.
 *
 * Deliberately aggregate-only (just stars + national rank per recruit, not
 * full player identity) — feeding src/utils/recruitingScore.js's
 * calculateRecruitingClassScore (already used for the user's own class,
 * verified team-agnostic) reproduces the in-game class score with no new
 * formula needed, and there's no product need to create ~4000 tracked
 * player records for recruits committed to OTHER teams.
 */

/**
 * Whole-league real rivalries. Each Team row carries direct
 * Rival1TeamRef/Rival2TeamRef/Rival3TeamRef refs to its real rivals —
 * verified against a real save: Alabama -> Auburn/Tennessee/LSU, Ohio State
 * -> Michigan/Penn State/Illinois, Clemson -> South Carolina/Florida
 * State/Georgia Tech, all exact real-world matches. The separate 233-row
 * Rivalry table (Team1/Team2 refs) is scanned once and cross-referenced
 * against each team's 3 rival refs to pull the human-readable rivalry Name
 * and FirstYearPlayed for that specific pair.
 *
 * @returns {Map<number, {rivalRawTid:number, name:string|null, formedYear:number|null}[]>}
 */
async function buildLeagueRivalries(save, teamRecords) {
  const byTeam = new Map();
  if (!teamRecords || !teamRecords.length) return byTeam;

  const rivalryTable = await getBestTable(save, 'Rivalry');
  const rivalryRows = [];
  if (rivalryTable) {
    for (const rec of rivalryTable.records) {
      if (!rec || rec.isEmpty) continue;
      const team1Rec = await resolveRef(save, readCell(rec, 'Team1'));
      const team2Rec = await resolveRef(save, readCell(rec, 'Team2'));
      if (!team1Rec || !team2Rec) continue;
      const team1RawTid = Number(readCell(team1Rec, 'TeamIndex'));
      const team2RawTid = Number(readCell(team2Rec, 'TeamIndex'));
      if (!Number.isFinite(team1RawTid) || !Number.isFinite(team2RawTid)) continue;
      rivalryRows.push({
        team1RawTid,
        team2RawTid,
        name: readCell(rec, 'Name') || null,
        formedYear: Number(readCell(rec, 'FirstYearPlayed')) || null,
      });
    }
  }

  const findRivalryRow = (tidA, tidB) => rivalryRows.find(
    (r) => (r.team1RawTid === tidA && r.team2RawTid === tidB) || (r.team1RawTid === tidB && r.team2RawTid === tidA)
  );

  for (const rec of teamRecords) {
    if (!rec || rec.isEmpty) continue;
    const rawTid = Number(readCell(rec, 'TeamIndex'));
    if (!Number.isFinite(rawTid) || rawTid === 255) continue;

    const rivals = [];
    for (const field of ['Rival1TeamRef', 'Rival2TeamRef', 'Rival3TeamRef']) {
      const rivalRec = await resolveRef(save, readCell(rec, field));
      if (!rivalRec) continue;
      const rivalRawTid = Number(readCell(rivalRec, 'TeamIndex'));
      if (!Number.isFinite(rivalRawTid)) continue;
      const rivalryRow = findRivalryRow(rawTid, rivalRawTid);
      rivals.push({
        rivalRawTid,
        name: rivalryRow?.name ?? null,
        formedYear: rivalryRow?.formedYear ?? null,
      });
    }
    if (rivals.length) byTeam.set(rawTid, rivals);
  }

  return byTeam;
}

// EA's own program grade fields, read as-is (letter grades displayed
// directly, no invented formula). Verified against a real save via the
// Team.MySchoolTrackingTable ref (a naive positional zip between the two
// tables is WRONG — record counts differ, 143 vs 138 — the ref is the only
// safe join): Ohio State Aplus/Aplus/Aplus, Alabama Aplus/Aminus/Aplus,
// Georgia State C/F/Dminus for conference/coach/tradition grades.
const SCHOOL_GRADE_FIELDS = [
  'AcademicPrestigeGrade', 'AthleticFacilitiesGrade', 'AthleticFacilitiesScore',
  'BrandExposureGrade', 'CampusLifestyleGrade', 'ChampionshipContenderGrade',
  'ChampionshipContenderCurrentYearRank', 'ChampionshipContenderYearPlus1Rank',
  'ChampionshipContenderYearPlus2Rank', 'ChampionshipContenderYearPlus3Rank',
  'CoachPrestigeGrade', 'CoachStabilityGrade', 'ConferencePrestigeGrade',
  'ProgramTraditionGrade', 'StadiumAtmosphereGrade',
  'ProPotentialGradeDB', 'ProPotentialGradeDL', 'ProPotentialGradeK',
  'ProPotentialGradeLB', 'ProPotentialGradeOL', 'ProPotentialGradeP',
  'ProPotentialGradeQB', 'ProPotentialGradeRB', 'ProPotentialGradeTE', 'ProPotentialGradeWR',
];

/**
 * Whole-league program/school grades. `Team.MySchoolTrackingTable` is a
 * genuine reference field (same pattern as Stadium/HeadCoach) — resolving it
 * per team is the only correct join (see SCHOOL_GRADE_FIELDS comment above).
 *
 * @returns {Map<number, object>} rawTeamId -> flat grades object
 */
async function buildLeagueSchoolGrades(save, teamRecords) {
  const byTeam = new Map();
  if (!teamRecords || !teamRecords.length) return byTeam;

  for (const rec of teamRecords) {
    if (!rec || rec.isEmpty) continue;
    const rawTid = Number(readCell(rec, 'TeamIndex'));
    if (!Number.isFinite(rawTid) || rawTid === 255) continue;

    const gradeRec = await resolveRef(save, readCell(rec, 'MySchoolTrackingTable'));
    if (!gradeRec) continue;

    const grades = {};
    for (const field of SCHOOL_GRADE_FIELDS) {
      const value = readCell(gradeRec, field);
      if (value != null) grades[field] = value;
    }
    if (Object.keys(grades).length) byTeam.set(rawTid, grades);
  }

  return byTeam;
}

// ─────────────────────────────────────────────────────────────────────────
// League-wide record book — the in-game "CFB Records" screen (Career/Game/
// Season x National/Conference/Team). Seeded with real NCAA history at save
// creation and overwritten by simulated dynasty performances once they
// surpass it — genuine evolving save state, not static flavor content.
//
// Save shape (verified against a real save, every value cross-checked
// against the actual in-game Career/Game/Season screens for an exact
// match — Case Keenum's 19,217 career pass yards, Connor Halliday's 734
// game pass yards, Bailey Zappe's 5,967 season pass yards, etc.):
//  - PlayerStatRecordScope has exactly 3 rows, in a fixed but UNLABELED
//    order — no field says which is which, so row order 0/1/2 =
//    Career/Game/Season is established purely by matching every resolved
//    value against the real screens, not by any schema hint.
//  - Each row has 3 reference fields — League (national), Conference,
//    Team — each pointing into a "PlayerStatRecord[]" array-table row.
//    Array tables have no schema; slot fields are named
//    `${baseTableName}${index}` (baseTableName = table name minus the
//    trailing "[]"), the same convention buildGameStats already uses for
//    weekly GameStats0../TeamStats1.. slots (confirmed by reading
//    node_modules/madden-franchise's own FranchiseFileTable.readRecords).
//    arraySize on the resolved array-row is how many slots are actually
//    populated (9 for League = 1 national bucket x 9 stat types; 90 for
//    Conference = ~10 conferences x 9; 1242 for Team = ~138 teams x 9).
//  - Each slot resolves into a flat PlayerStatRecord row: calendarYear,
//    ConferenceRef, firstName, lastName, position, statType, statValue,
//    teamName, TeamRef. Conference/team identity for grouping comes
//    straight off each individual record's own ConferenceRef/TeamRef —
//    NOT the outer array's slot position — so no assumption about slot
//    ordering is needed to group correctly.
const RECORD_TIMEFRAMES = ['career', 'game', 'season'];

async function resolveStatRecordArray(save, arrayRefString, onEntry) {
  const resolved = arrayRefString ? await resolveRefWithTable(save, arrayRefString) : null;
  if (!resolved) return;
  const rec = resolved.rec;
  const baseName = resolved.table.name.endsWith('[]')
    ? resolved.table.name.slice(0, -2)
    : resolved.table.name;
  const size = rec.arraySize || 0;
  for (let i = 0; i < size; i++) {
    const slotRaw = rec[`${baseName}${i}`];
    if (!slotRaw) continue;
    const slotResolved = await resolveRefWithTable(save, slotRaw);
    if (!slotResolved || slotResolved.rec.isEmpty) continue;
    await onEntry(slotResolved.rec);
  }
}

async function buildLeagueStatRecords(save) {
  const empty = () => ({ national: [], conference: {}, team: {} });
  const result = { career: empty(), game: empty(), season: empty() };

  let scopeRecords;
  try {
    scopeRecords = await getAllTableRecords(save, 'PlayerStatRecordScope');
  } catch (err) {
    return result;
  }

  const buildEntry = (rec) => ({
    statType: readCell(rec, 'statType'),
    first_name: readCell(rec, 'firstName'),
    last_name: readCell(rec, 'lastName'),
    position: readCell(rec, 'position'),
    team_name: readCell(rec, 'teamName'),
    year: readCell(rec, 'calendarYear'),
    value: readCell(rec, 'statValue'),
  });

  for (let i = 0; i < Math.min(3, scopeRecords.length); i++) {
    const timeframe = RECORD_TIMEFRAMES[i];
    const scopeRec = scopeRecords[i];
    const bucket = result[timeframe];

    await resolveStatRecordArray(save, readCell(scopeRec, 'League'), async (rec) => {
      bucket.national.push(buildEntry(rec));
    });

    await resolveStatRecordArray(save, readCell(scopeRec, 'Conference'), async (rec) => {
      const confRec = await resolveRef(save, readCell(rec, 'ConferenceRef'));
      const confName = confRec && !confRec.isEmpty ? readCell(confRec, 'Name') : null;
      if (!confName) return;
      if (!bucket.conference[confName]) bucket.conference[confName] = [];
      bucket.conference[confName].push(buildEntry(rec));
    });

    await resolveStatRecordArray(save, readCell(scopeRec, 'Team'), async (rec) => {
      const teamRec = await resolveRef(save, readCell(rec, 'TeamRef'));
      const rawTid = teamRec && !teamRec.isEmpty ? Number(readCell(teamRec, 'TeamIndex')) : null;
      if (rawTid == null || !Number.isFinite(rawTid)) return;
      if (!bucket.team[rawTid]) bucket.team[rawTid] = [];
      bucket.team[rawTid].push(buildEntry(rec));
    });
  }

  return result;
}

/**
 * Whole-league recruit NIL offers, keyed by (rawTeamId, recruit's own
 * NationalRank) so buildLeagueRecruitingClasses can look up the specific
 * offer from a recruit's ACTUALLY COMMITTED team — a recruit stays on every
 * OTHER school's board too (see buildRecruitingBoard's header comment),
 * each with its own separate, often-stale offer, so this has to be scoped
 * per-team rather than "the first offer found for this recruit anywhere."
 *
 * Player.CurrentNILCompensation (tried first) is uniformly 0 for every
 * recruit regardless of team/stage — confirmed against a real save, not a
 * mapping bug, that field just isn't what's populated. The real per-team
 * NIL offer lives on Team.RecruitingBoard -> RecruitingBoard.Recruits (a
 * "RecruitTarget[]" array-table row, exposing RecruitTarget0.. sub-fields —
 * same representation as Conference.TeamSlots's Team0.. buildConferences
 * already reads) -> each RecruitTarget's own CurrentNILOffer. Confirmed via
 * a real save: RecruitTarget is a genuine whole-league table (4,272
 * non-empty rows, real values like 20/10/0 varying with ScholarshipStatus),
 * not just the human's own board (UserRecruitTarget is a separate,
 * additionally-fielded variant scoped to the human specifically).
 *
 * @returns {Map<string, number>} `${rawTid}::${nationalRank}` -> CurrentNILOffer
 */
async function buildRecruitTeamNilOffers(save, teamRecords) {
  const offers = new Map();
  if (!teamRecords || !teamRecords.length) return offers;

  for (const teamRec of teamRecords) {
    if (!teamRec || teamRec.isEmpty) continue;
    const rawTid = Number(readCell(teamRec, 'TeamIndex'));
    if (!Number.isFinite(rawTid) || rawTid === 255) continue;

    const boardRow = await resolveRef(save, readCell(teamRec, 'RecruitingBoard'));
    if (!boardRow || boardRow.isEmpty) continue;
    const arrRow = await resolveRef(save, readCell(boardRow, 'Recruits'));
    if (!arrRow) continue;

    // Fixed numbered sub-fields, not a discoverable-length array (same
    // pattern as buildConferences' Team0..23) — 60 gives real boards
    // (per-team target caps seen in-game around 30-35) generous headroom;
    // slots beyond the real count simply read null.
    for (let i = 0; i < 60; i += 1) {
      let targetRef;
      try {
        targetRef = arrRow[`RecruitTarget${i}`];
      } catch (err) {
        continue;
      }
      if (targetRef == null) continue;
      const targetRec = await resolveRef(save, targetRef);
      if (!targetRec || targetRec.isEmpty) continue;

      const nilOffer = Number(readCell(targetRec, 'CurrentNILOffer')) || 0;
      const recruitRow = await resolveRef(save, readCell(targetRec, 'Recruit'));
      if (!recruitRow || recruitRow.isEmpty) continue;
      const nationalRank = Number(readCell(recruitRow, 'NationalRank'));
      if (!Number.isFinite(nationalRank)) continue;

      offers.set(`${rawTid}::${nationalRank}`, nilOffer);
    }
  }

  return offers;
}

/**
 * @returns {Map<number, {stars:number, nationalRank:number|null, nilCompensation:number,
 *   first_name:?string, last_name:?string, position:?string, state_rank:?number,
 *   position_rank:?number, hometown:?string, home_state:?string, recruit_class:?string,
 *   recruit_stage:?string, generic_head_asset_name:?string, portrait_id:?number,
 *   height:?number, weight:?number, archetype_name:?string, dev_trait:?string}[]>} rawTeamId -> recruit list
 *
 * Named per-recruit detail (not just the stats this was originally built
 * for) — every field here was already being read off the SAME resolved
 * playerRec/recruitRec this function walks for every committed recruit
 * league-wide, just discarded after computing stars/nationalRank. Keeping
 * them costs nothing extra (no new resolveRef calls) and is what makes a
 * named Commitments list possible for a team you're not coaching, not just
 * the aggregate class-rank numbers.
 *
 * dev_trait is included RAW (not stage-gated here) — same as
 * buildLeagueRecruitDirectory's own dev_trait field. Gating when it's
 * actually shown (only once recruit_stage is 'Signed', or the recruit was
 * separately scouted on the user's own board) is a caller/UI concern, not
 * this extractor's — it just reports what the save contains.
 */
async function buildLeagueRecruitingClasses(save, recruitRecords, playerFieldPicker, recruitNilOffers, presentRatings) {
  const byTeam = new Map();
  if (!recruitRecords || !recruitRecords.length) return byTeam;

  for (const recruitRec of recruitRecords) {
    if (!recruitRec || recruitRec.isEmpty) continue;
    // Any of the 3 committed stages counts toward a team's class, matching
    // the in-game Top Classes screen — verified this was actually wrong
    // before: restricting to HardCommitted/Signed only happened to match a
    // real save late in the cycle (most commits had already progressed past
    // SoftCommitted by then), but undercounts badly early in a season when
    // most commits are still SoftCommitted (a real verbal commitment that
    // counts toward the class in-game well before it hard-commits or signs).
    const stage = readCell(recruitRec, 'RecruitStage');
    if (stage !== 'SoftCommitted' && stage !== 'HardCommitted' && stage !== 'Signed') continue;

    const topSchoolsRow = await resolveRef(save, readCell(recruitRec, 'TopSchoolsList'));
    if (!topSchoolsRow) continue;
    const topSchoolRow = await resolveRef(save, readCell(topSchoolsRow, 'ProspectTargetSchool0'));
    if (!topSchoolRow || topSchoolRow.isEmpty) continue;
    const rawTid = Number(readCell(topSchoolRow, 'TeamId'));
    if (!Number.isFinite(rawTid)) continue;
    // 255 is the save's internal "no team assigned" sentinel — the same one
    // excluded elsewhere in this file. A committed recruit should never
    // resolve here in practice, but skip defensively rather than let a
    // sentinel "team" accumulate a fake recruiting class.
    if (rawTid === 255) continue;

    // Recruit.Player resolves through the same reference mechanism as
    // buildRecruitingBoard's UserRecruitTarget-scoped rows above (it's the
    // same underlying Recruit table either way, just not filtered to the
    // user's board here) — the outer playerFieldPicker is already proven
    // correct for this exact reference chain.
    //
    // stars is left as the RAW enum string (e.g. "FOUR_STAR"), same as
    // buildRecruitingBoard does above — it is NOT numeric in the save, and
    // converting with Number() here would silently collapse every recruit
    // to 0 stars (verified: this was a real bug during development). The
    // client-side mapStars() (cfb27SaveImport.js) does the real conversion,
    // exactly like it already does for buildRecruitingBoard's rows.
    const playerRec = await resolveRef(save, readCell(recruitRec, 'Player'));
    const F = playerFieldPicker;
    const stars = (playerRec && !playerRec.isEmpty && F.stars) ? readCell(playerRec, F.stars) : null;
    const nationalRank = Number(readCell(recruitRec, 'NationalRank')) || null;
    // Real per-team NIL offer — see buildRecruitTeamNilOffers' header
    // comment for why this, not Player.CurrentNILCompensation (always 0),
    // is the real source. Keyed by this recruit's own committed team
    // (rawTid, already resolved above) + national rank, so a stale offer
    // still sitting on some OTHER team's board for this same recruit is
    // never picked up by mistake.
    const nilCompensation = nationalRank != null
      ? (recruitNilOffers?.get(`${rawTid}::${nationalRank}`) ?? 0)
      : 0;

    const hasPlayer = playerRec && !playerRec.isEmpty;
    // Same core-fields helper buildRecruitingBoard uses for the user's own
    // board rows — derives archetype + dev trait from the rating columns
    // (falls back to schema.bestArchetype when the save has no stored
    // archetype for this recruit yet, same as every other consumer here).
    const core = hasPlayer ? (buildPlayerCoreFields(playerRec, F, presentRatings) || {}) : {};
    if (!byTeam.has(rawTid)) byTeam.set(rawTid, []);
    byTeam.get(rawTid).push({
      stars,
      nationalRank,
      nilCompensation,
      first_name: hasPlayer && F.first ? readCell(playerRec, F.first) : null,
      last_name: hasPlayer && F.last ? readCell(playerRec, F.last) : null,
      position: hasPlayer && F.position ? String(readCell(playerRec, F.position)) : null,
      state_rank: Number(readCell(recruitRec, 'StateRank')) || null,
      position_rank: Number(readCell(recruitRec, 'PositionRank')) || null,
      hometown: hasPlayer && F.home ? readCell(playerRec, F.home) : null,
      home_state: hasPlayer && F.homeState ? readCell(playerRec, F.homeState) : null,
      recruit_class: readCell(recruitRec, 'Class'),
      recruit_stage: stage,
      generic_head_asset_name: hasPlayer && F.genericHeadAssetName ? readCell(playerRec, F.genericHeadAssetName) : null,
      portrait_id: hasPlayer && F.portraitId ? Number(readCell(playerRec, F.portraitId)) : null,
      height: hasPlayer && F.height ? Number(readCell(playerRec, F.height)) : null,
      weight: hasPlayer && F.weight ? Number(readCell(playerRec, F.weight)) : null,
      archetype_name: core.archetype_name || null,
      dev_trait: core.dev_trait || null,
    });
  }

  return byTeam;
}

/**
 * Whole-league recruit "photo directory" — name + portrait fields + a few
 * corroborating fields (height/hometown/state), for EVERY recruit still in
 * the national Recruit table, regardless of whether they're on the user's
 * own UserRecruitTarget board. A recruit dropped from the user's board
 * (removed, no longer among their tracked targets) does NOT mean the recruit
 * stopped existing in the save — they're still a live Recruit row, just no
 * longer one the user is personally tracking. Without this, a target
 * record's cached pictureUrl (resolved once at whatever sync first tracked
 * them) can never be refreshed again once they fall off the user's board,
 * even though the save still has perfectly good, current portrait data for
 * them. Deliberately lightweight (no attributes/ratings/archetype) — this
 * exists purely to let the client re-derive a fresh pictureUrl, not to
 * re-scout the recruit.
 *
 * No RecruitStage filter — an still-open, uncommitted recruit is just as
 * "real" here as a committed one; excluding them would defeat the purpose
 * for a recruit who's simply still being recruited by other schools.
 *
 * Grouped by normalized name (not deduped to one entry) since recruit names
 * collide across ~4870 rows — same collision-safety pattern already used
 * for cfb27AssetName matching elsewhere in this file. Callers disambiguate
 * using the corroborating fields, mirroring cfb27SaveSync.js's own
 * isPlausibleRecruitLink.
 *
 * @param {object} save
 * @param {object[]} recruitRecords - from getAllTableRecords(save, 'Recruit'), already fetched by the caller
 * @param {object} playerFieldPicker
 * @returns {Object<string, object[]>} normalized "first last" name -> candidate array
 */
async function buildLeagueRecruitDirectory(save, recruitRecords, playerFieldPicker) {
  const byName = new Map();
  if (!recruitRecords || !recruitRecords.length) return {};

  const F = playerFieldPicker;
  for (const recruitRec of recruitRecords) {
    if (!recruitRec || recruitRec.isEmpty) continue;
    const playerRec = await resolveRef(save, readCell(recruitRec, 'Player'));
    if (!playerRec || playerRec.isEmpty) continue;

    const firstName = F.first ? readCell(playerRec, F.first) : null;
    const lastName = F.last ? readCell(playerRec, F.last) : null;
    const name = `${firstName || ''} ${lastName || ''}`.trim();
    if (!name) continue;
    const key = name.toLowerCase();

    // dev_trait/is_signed ride along on this same lookup so a target that's
    // fallen off the user's own board (signed with another school, or still
    // just being recruited elsewhere) can have its hidden dev trait revealed
    // once actually signed — same "don't spoil it before signing" gate the
    // user's own board rows already use (isSigned above), just no longer
    // scoped to only the user's own signees. Player.dev is the SAME
    // underlying field buildPlayerCoreFields reads for every rostered
    // player — it's already assigned at recruit generation, just not
    // exposed here until RecruitStage says Signed.
    const devCode = F.dev ? readCell(playerRec, F.dev) : null;
    const entry = {
      first_name: firstName,
      last_name: lastName,
      height: F.height ? Number(readCell(playerRec, F.height)) : null,
      weight: F.weight ? Number(readCell(playerRec, F.weight)) : null,
      hometown: F.home ? readCell(playerRec, F.home) : null,
      home_state: F.homeState ? readCell(playerRec, F.homeState) : null,
      generic_head_asset_name: F.genericHeadAssetName ? readCell(playerRec, F.genericHeadAssetName) : null,
      portrait_id: F.portraitId ? Number(readCell(playerRec, F.portraitId)) : null,
      is_signed: readCell(recruitRec, 'RecruitStage') === 'Signed',
      dev_trait: devCode ? schema.DEV_TRAIT_LABELS.get(String(devCode)) || devCode : null,
    };
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key).push(entry);
  }

  return Object.fromEntries(byName);
}

// AwardType -> { side, scope } for the 4 weekly Player of the Week variants
// found in the save's PlayerAward table (national + per-conference, offense
// + defense). Every other AwardType in that table (All-American ballots,
// etc.) is intentionally ignored here.
const POTW_AWARD_TYPES = {
  Offensive_Player_of_Week: { side: 'offensive', scope: 'national' },
  Defensive_Player_of_Week: { side: 'defensive', scope: 'national' },
  Offensive_Player_of_Week_Conf: { side: 'offensive', scope: 'conference' },
  Defensive_Player_of_Week_Conf: { side: 'defensive', scope: 'conference' },
};

/**
 * Whole-league weekly Offensive/Defensive Player of the Week — national and
 * per-conference. Save table: PlayerAward, `AwardType` in
 * Offensive_Player_of_Week / Defensive_Player_of_Week (national, one row per
 * week, `Period: 'Game'`, `PeriodIndex` = the week number the award is FOR)
 * and the `_Conf` variants (one row per conference per week). Verified
 * against a real save: the periodIndex-7 entries resolve to Jayden Moore
 * (Duke, WR, #8) and DJ Pickett (LSU, CB, #3) — an exact match to the
 * in-game "Players of the Week" screen captioned "Season Week 7".
 * `AwardScore` is always 0 for this award type — NOT usable for a stat
 * line; callers must derive the actual stat line from that player's
 * already-extracted box score for the same week/team instead.
 *
 * IMPORTANT: a `Player` ref resolved from PlayerAward/HeismanAwardRanking
 * can land in a DIFFERENT player-table instance than the main roster table
 * `playerFieldPicker` was built from (this file's own "several same-named
 * tables — per-slot scratch instances" quirk, see the file header comment).
 * Verified directly: field names differ between the two. Never reuse the
 * OUTER playerFieldPicker for these refs — build a fresh one per resolved
 * table instead (memoized below, since in practice only a couple of
 * distinct table instances ever appear across all rows).
 *
 * @returns {{ national: Object<number, {offensive?, defensive?}>,
 *             conference: Object<number, Object<string, {offensive?, defensive?}>> }}
 */
async function buildPlayerAwards(save, awardRecords) {
  const national = {};
  const conference = {};
  if (!awardRecords || !awardRecords.length) return { national, conference };

  const pickerCache = new Map();
  const pickerFor = (table) => {
    if (!pickerCache.has(table)) pickerCache.set(table, buildPlayerFieldPicker(table));
    return pickerCache.get(table);
  };

  for (const rec of awardRecords) {
    if (!rec || rec.isEmpty) continue;
    const meta = POTW_AWARD_TYPES[readCell(rec, 'AwardType')];
    if (!meta) continue;

    const week = Number(readCell(rec, 'PeriodIndex'));
    if (!Number.isFinite(week)) continue;

    const playerResolved = await resolveRefWithTable(save, readCell(rec, 'Player'));
    if (!playerResolved || playerResolved.rec.isEmpty) continue;
    const F = pickerFor(playerResolved.table);

    const teamRec = await resolveRef(save, readCell(rec, 'Team'));
    const rawTid = (teamRec && !teamRec.isEmpty) ? Number(readCell(teamRec, 'TeamIndex')) : null;

    const entry = {
      first_name: F.first ? readCell(playerResolved.rec, F.first) : null,
      last_name: F.last ? readCell(playerResolved.rec, F.last) : null,
      position: F.position ? String(readCell(playerResolved.rec, F.position) || '') : null,
      jersey: F.jersey ? Number(readCell(playerResolved.rec, F.jersey)) : null,
      asset_name: F.assetName ? readCell(playerResolved.rec, F.assetName) : null,
      generic_head_asset_name: F.genericHeadAssetName ? readCell(playerResolved.rec, F.genericHeadAssetName) : null,
      portrait_id: F.portraitId ? Number(readCell(playerResolved.rec, F.portraitId)) : null,
      team_id: rawTid,
    };

    if (meta.scope === 'national') {
      if (!national[week]) national[week] = {};
      national[week][meta.side] = entry;
    } else {
      const confRec = await resolveRef(save, readCell(rec, 'Conference'));
      const confName = (confRec && !confRec.isEmpty) ? readCell(confRec, 'Name') : null;
      if (!confName) continue;
      if (!conference[week]) conference[week] = {};
      if (!conference[week][confName]) conference[week][confName] = {};
      conference[week][confName][meta.side] = entry;
    }
  }

  return { national, conference };
}

// National All-American / All-Conference team designations (final results,
// not preseason predictions — the _PRE variants are intentionally excluded).
// Verified against a real save: ALL_AM_1ST's 25 entries (one per position)
// exactly matched the in-game National All-Americans 1st Team screen for
// every single position (Trinidad Chambliss/Ole Miss QB through Ron Watson/
// Navy P). ALL_AM_1ST_CONF (275 = 25 positions x 11 conferences) is the same
// concept per-conference — this save's real All-Conference teams.
const ALL_AM_AWARD_TYPES = {
  ALL_AM_1ST: { designation: 'first', scope: 'national' },
  ALL_AM_2ND: { designation: 'second', scope: 'national' },
  ALL_AM_FR: { designation: 'freshman', scope: 'national' },
  ALL_AM_1ST_CONF: { designation: 'first', scope: 'conference' },
  ALL_AM_2ND_CONF: { designation: 'second', scope: 'conference' },
  ALL_AM_FR_CONF: { designation: 'freshman', scope: 'conference' },
};

// Preseason 1st/2nd Team predictions — the save's own "PRESEASON 1ST TEAM"/
// "PRESEASON 2ND TEAM" screens. Verified against a real save (a fresh
// preseason dynasty with no final honors yet): PlayerAward held exactly
// ALL_AM_1ST_PRE (25), ALL_AM_1ST_PRE_CONF (275), ALL_AM_2ND_PRE (25),
// ALL_AM_2ND_PRE_CONF (275) — note _PRE comes before _CONF in the type
// string, not after. No freshman preseason variant exists in the save (there
// wouldn't be one to predict before the season starts). These rows are
// expected to coexist with the final ALL_AM_* rows once the season crowns
// real honorees — buildLeagueHonors keeps them in a separate bucket so the
// sync layer can prefer final honors and only fall back to preseason when
// nothing final exists yet for that scope.
const ALL_AM_PRESEASON_AWARD_TYPES = {
  ALL_AM_1ST_PRE: { designation: 'first', scope: 'national' },
  ALL_AM_2ND_PRE: { designation: 'second', scope: 'national' },
  ALL_AM_1ST_PRE_CONF: { designation: 'first', scope: 'conference' },
  ALL_AM_2ND_PRE_CONF: { designation: 'second', scope: 'conference' },
};

// Named individual season awards -> the app's existing Awards.jsx award key
// (see AWARD_DISPLAY in src/pages/dynasty/Awards.jsx). Verified against a
// real save by resolving each winner and cross-checking their actual
// position/team against the real-world award's known scope — e.g. BEST_QB
// resolved to a QB (matches the Davey O'Brien Award), BEST_SR_QB
// specifically to a senior QB (matches the Unitas Golden Arm Award, which is
// senior-QB-specific in real life), BEST_DE to an edge rusher (matches Edge
// Rusher of the Year) while BEST_IL resolved to a center (matches the
// Outland Trophy's true interior-lineman scope).
//
// MOST_VERSATILE/BEST_FRESHMAN_POTY were previously SWAPPED — verified
// against a real save's own "Award Watchlists" screens: MOST_VERSATILE's
// screen is explicitly labeled "Paul Hornung Award... most versatile Player
// of the Year" and BEST_FRESHMAN_POTY's is "Shaun Alexander Award...
// Freshman Player of the Year", the exact opposite of what this table had.
// paulHornungAward (not paulHornung) matches the key already used elsewhere
// in the app (Player.jsx, AllTimeLineup.jsx) — paulHornung was a stray,
// unused alias in PlayerMatchConfirmModal.jsx only.
//
// BEST_DL ('Lombardi Award... Defensive Lineman of the Year') and
// BEST_ACADEMIC ('William V. Campbell Award... Academic Player of the
// Year') are newly verified the same way. williamVCampbell is a brand-new
// key with no prior support elsewhere in the app (unlike the others here,
// which already had display/trophy wiring waiting for real data) — added
// to Awards.jsx/TeamYear.jsx's AWARD_DISPLAY alongside this.
//
// BEST_SR is the Jet Award (Returner of the Year) — verified against a real
// save via the separate LeagueHistoryAward table (a self-contained, no-
// reference-resolution-needed archive of the same season-end named-award
// winners): its BEST_SR row named Tank Hawkins (WR, Washington State),
// exactly matching that save's own in-game "Jet Award" winner screen.
// Previously left unmapped/intentionally unguessed pending that proof.
//
// The two coach awards (Bear Bryant/Broyles) live on a SEPARATE CoachAward
// table, not PlayerAward — see buildCoachAwards.
const NAMED_AWARD_TYPES = {
  HEISMAN: 'heisman',
  BEST_POTY: 'maxwell',
  BEST_PLAYER: 'walterCamp',
  BEST_QB: 'daveyObrien',
  BEST_RB: 'doakWalker',
  BEST_REC: 'fredBiletnikoff',
  BEST_TE: 'johnMackey',
  BEST_SR_QB: 'unitasGoldenArm',
  BEST_DEF_1: 'chuckBednarik',
  BEST_DEF_2: 'broncoNagurski',
  BEST_DB: 'jimThorpe',
  BEST_LB: 'dickButkus',
  BEST_DE: 'edgeRusherOfTheYear',
  BEST_IL: 'outland',
  BEST_C: 'rimington',
  BEST_KICK: 'louGroza',
  BEST_PUNT: 'rayGuy',
  MOST_VERSATILE: 'paulHornungAward',
  BEST_FRESHMAN_POTY: 'shaunAlexander',
  BEST_DL: 'lombardi',
  BEST_ACADEMIC: 'williamVCampbell',
  BEST_SR: 'returnerOfTheYear',
};

/**
 * Whole-league season-end honors: National All-Americans, All-Conference
 * teams, and named individual awards (Heisman, Maxwell, etc.) — all read
 * from the SAME PlayerAward table the weekly Player of the Week honors
 * already come from (see buildPlayerAwards above for the shared Player-ref-
 * can-land-in-a-different-table-instance caveat, handled the same way here).
 *
 * @returns {{
 *   allAmericans: { national: object[], conference: object[] },
 *   allAmericansPreseason: { national: object[], conference: object[] },
 *   namedAwards: Object<string, object>
 * }}
 */
async function buildLeagueHonors(save, awardRecords) {
  const allAmericans = { national: [], conference: [] };
  const allAmericansPreseason = { national: [], conference: [] };
  const namedAwards = {};
  if (!awardRecords || !awardRecords.length) return { allAmericans, allAmericansPreseason, namedAwards };

  const pickerCache = new Map();
  const pickerFor = (table) => {
    if (!pickerCache.has(table)) pickerCache.set(table, buildPlayerFieldPicker(table));
    return pickerCache.get(table);
  };

  // Diagnostic only: surfaces any AwardType enum value on this table that
  // none of ALL_AM_AWARD_TYPES/ALL_AM_PRESEASON_AWARD_TYPES/NAMED_AWARD_TYPES
  // recognize. This is how BEST_SR (the Jet Award) was found and verified.
  // POTW_AWARD_TYPES entries are excluded from the "unmatched" set below —
  // those ARE recognized, just by the sibling buildPlayerAwards function
  // reading this same table for a different purpose (weekly Player of the
  // Week) — without the exclusion they'd show up here every single sync as
  // false-positive noise, burying any genuinely new/unmapped award type a
  // future game update adds.
  const unmatchedAwardTypes = new Set();

  for (const rec of awardRecords) {
    if (!rec || rec.isEmpty) continue;
    const awardType = readCell(rec, 'AwardType');
    const aaMeta = ALL_AM_AWARD_TYPES[awardType];
    const aaPreMeta = ALL_AM_PRESEASON_AWARD_TYPES[awardType];
    const namedKey = NAMED_AWARD_TYPES[awardType];
    if (!aaMeta && !aaPreMeta && !namedKey) {
      if (awardType && !POTW_AWARD_TYPES[awardType]) unmatchedAwardTypes.add(awardType);
      continue;
    }

    const playerResolved = await resolveRefWithTable(save, readCell(rec, 'Player'));
    if (!playerResolved || playerResolved.rec.isEmpty) continue;
    const F = pickerFor(playerResolved.table);

    const teamRec = await resolveRef(save, readCell(rec, 'Team'));
    const rawTid = (teamRec && !teamRec.isEmpty) ? Number(readCell(teamRec, 'TeamIndex')) : null;

    const first_name = F.first ? readCell(playerResolved.rec, F.first) : null;
    const last_name = F.last ? readCell(playerResolved.rec, F.last) : null;
    // The PlayerAward row itself carries Position directly — no need to
    // resolve it off the player row (which can be a different position for
    // a since-converted player anyway).
    const position = readCell(rec, 'Position') || (F.position ? readCell(playerResolved.rec, F.position) : null);
    const year = F.year ? readCell(playerResolved.rec, F.year) : null;
    const redshirt = F.redshirt ? readCell(playerResolved.rec, F.redshirt) : null;

    if (aaMeta) {
      const entry = { first_name, last_name, position, year, redshirt, team_id: rawTid, designation: aaMeta.designation };
      if (aaMeta.scope === 'national') allAmericans.national.push(entry);
      else allAmericans.conference.push(entry);
    }
    if (aaPreMeta) {
      const entry = { first_name, last_name, position, year, redshirt, team_id: rawTid, designation: aaPreMeta.designation };
      if (aaPreMeta.scope === 'national') allAmericansPreseason.national.push(entry);
      else allAmericansPreseason.conference.push(entry);
    }
    if (namedKey) {
      namedAwards[namedKey] = { first_name, last_name, position, team_id: rawTid };
    }
  }

  if (unmatchedAwardTypes.size) {
    console.log('[buildLeagueHonors] Unmatched AwardType values (not yet mapped):', [...unmatchedAwardTypes].join(', '));
  }

  return { allAmericans, allAmericansPreseason, namedAwards };
}

// Bear Bryant Coach of the Year / Broyles Award — these live on their OWN
// CoachAward table (Franchise-Schemas/CoachAward.ftx: AwardType/Coach/Team),
// not PlayerAward, since the winner is a coach, not a player. Coach is a
// direct reference to a Coach row (FirstName/LastName), same resolution
// pattern buildCoachingStaff/buildAllHeadCoaches already use elsewhere.
const COACH_AWARD_TYPES = {
  BEST_HC: 'bearBryantCoachOfTheYear',
  BEST_AC: 'broyles',
};

async function buildCoachAwards(save, coachAwardTable) {
  const namedAwards = {};
  if (!coachAwardTable) return namedAwards;

  for (const rec of coachAwardTable.records) {
    if (!rec || rec.isEmpty) continue;
    const namedKey = COACH_AWARD_TYPES[readCell(rec, 'AwardType')];
    if (!namedKey) continue;

    const coachRec = await resolveRef(save, readCell(rec, 'Coach'));
    if (!coachRec || coachRec.isEmpty) continue;
    const first = readCell(coachRec, 'FirstName') || '';
    const last = readCell(coachRec, 'LastName') || '';

    const teamRec = await resolveRef(save, readCell(rec, 'Team'));
    const rawTid = (teamRec && !teamRec.isEmpty) ? Number(readCell(teamRec, 'TeamIndex')) : null;

    namedAwards[namedKey] = { first_name: first, last_name: last, position: null, team_id: rawTid };
  }

  return namedAwards;
}

/**
 * Top-4 Heisman Watch ranking. Save table: HeismanAwardRanking (exactly 4
 * non-empty rows in a real save). `CurrentRank`/`LastWeekRank` are
 * 0-indexed; `LastWeekRank === -1` means "wasn't in the top 4 last week" (a
 * brand-new entry — shown in-game with the same "improved" up-arrow a
 * numeric rank increase gets, not a neutral/flat indicator). Verified
 * against a real save: resolves to Maiava (USC) / Leavitt (LSU) / Staley
 * (Tennessee) / Reed (Texas A&M) in the exact order, with the exact
 * rank-change signal (flat / flat / up / up-as-new), shown in the in-game
 * "2026 Heisman Watch" screen.
 *
 * @returns {{rank:number, prev_rank:number|null, first_name, last_name, position, team_id}[]}
 */
async function buildHeismanWatch(save, heismanTable) {
  const out = [];
  if (!heismanTable) return out;

  const pickerCache = new Map();
  const pickerFor = (table) => {
    if (!pickerCache.has(table)) pickerCache.set(table, buildPlayerFieldPicker(table));
    return pickerCache.get(table);
  };

  for (const rec of heismanTable.records) {
    if (!rec || rec.isEmpty) continue;
    const currentRank = Number(readCell(rec, 'CurrentRank'));
    const lastWeekRank = Number(readCell(rec, 'LastWeekRank'));
    if (!Number.isFinite(currentRank)) continue;

    const playerResolved = await resolveRefWithTable(save, readCell(rec, 'Player'));
    if (!playerResolved || playerResolved.rec.isEmpty) continue;
    const F = pickerFor(playerResolved.table);

    const teamRec = await resolveRef(save, readCell(rec, 'Team'));
    const rawTid = (teamRec && !teamRec.isEmpty) ? Number(readCell(teamRec, 'TeamIndex')) : null;

    out.push({
      rank: currentRank + 1,
      prev_rank: lastWeekRank === -1 ? null : lastWeekRank + 1,
      first_name: F.first ? readCell(playerResolved.rec, F.first) : null,
      last_name: F.last ? readCell(playerResolved.rec, F.last) : null,
      position: F.position ? String(readCell(playerResolved.rec, F.position) || '') : null,
      asset_name: F.assetName ? readCell(playerResolved.rec, F.assetName) : null,
      generic_head_asset_name: F.genericHeadAssetName ? readCell(playerResolved.rec, F.genericHeadAssetName) : null,
      portrait_id: F.portraitId ? Number(readCell(playerResolved.rec, F.portraitId)) : null,
      team_id: rawTid,
    });
  }

  out.sort((a, b) => a.rank - b.rank);
  return out;
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
 * @param {object[]} teamRecords - merged Team records (getAllTableRecords)
 * @param {object} F - buildPlayerFieldPicker(playerTable) output
 * @param {number[]} playedWeeks - week numbers (SeasonWeek convention) with at least one played game
 */
// The four stat-category tables a player's weekly GameStats slot can resolve
// into hold thousands of rows each (offensive/defensive alone: tens of
// thousands combined in a real save) — restricting each to only the columns
// pickFields() below actually reads cuts the dominant chunk of this
// function's memory use, which otherwise comes from fully decoding every
// row of every one of these tables the moment the FIRST player's slot
// happens to land in it.
function playerGameStatsAttribsByTable() {
  return {
    GameOffensiveStats: GAME_OFFENSIVE_STAT_FIELDS,
    GameOffensiveKPReturnStats: GAME_OFFENSIVE_STAT_FIELDS,
    GameDefensiveStats: GAME_DEFENSIVE_STAT_FIELDS,
    GameDefensiveKPReturnStats: GAME_DEFENSIVE_STAT_FIELDS,
    GameKickingStats: GAME_KICKING_STAT_FIELDS,
    GameOLineStats: GAME_OLINE_STAT_FIELDS,
  };
}

async function buildGameStats(save, playerTable, teamRecords, F, playedWeeks) {
  const teamStatsByWeek = {};
  const playerStatsByWeek = {};
  const playerStatsAttribs = playerGameStatsAttribsByTable();
  // GameStats[]/TeamStats[] are array-type tables with one auto-named slot
  // field per possible week (GameStats0..GameStats22) — restricting to just
  // the weeks actually played avoids decoding ~20 unused slots per player/
  // team on top of the ones below.
  const teamArrAttribs = { 'TeamStats[]': playedWeeks.map((w) => `TeamStats${w}`) };
  const playerArrAttribs = { 'GameStats[]': playedWeeks.map((w) => `GameStats${w}`) };
  for (const week of playedWeeks) {
    teamStatsByWeek[week] = {};
    playerStatsByWeek[week] = [];
  }
  if (!playedWeeks.length) return { teamStatsByWeek, playerStatsByWeek };

  if (teamRecords && teamRecords.length) {
    for (const teamRec of teamRecords) {
      if (!teamRec || teamRec.isEmpty) continue;
      const rawTid = Number(readCell(teamRec, 'TeamIndex'));
      if (!Number.isFinite(rawTid)) continue;
      const ref = readCell(teamRec, 'TeamGameStatsRegSeason');
      const arrRow = ref ? (await resolveRefWithTable(save, ref, teamArrAttribs))?.rec : null;
      if (!arrRow) continue;
      for (const week of playedWeeks) {
        let slotRef;
        try { slotRef = arrRow[`TeamStats${week}`]; } catch (err) { continue; }
        const resolved = await resolveRefWithTable(save, slotRef, { TeamStats: TEAM_GAME_STAT_FIELDS });
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
      const arrRow = (await resolveRefWithTable(save, ref, playerArrAttribs))?.rec;
      if (!arrRow) continue;

      for (const week of playedWeeks) {
        let slotRef;
        try { slotRef = arrRow[`GameStats${week}`]; } catch (err) { continue; }
        const resolved = await resolveRefWithTable(save, slotRef, playerStatsAttribs);
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
    // Injury Report fields — direct on the player row, no reference chain
    // needed. Verified against a real save (John Walker, Ohio State DT):
    // InjuryStatus 'Injured', InjuryType 'LegQuadTear', MaxInjuryDuration 2
    // — matches the in-game Injury Report screen's "Quad Tear" / Length 2
    // exactly. MaxInjuryDuration (not MinInjuryDuration/TotalInjuryDuration,
    // both of which read differently for the same player) is the field that
    // matches the displayed "Length".
    injuryStatus: pick('InjuryStatus'),
    injuryType: pick('InjuryType'),
    injuryLength: pick('MaxInjuryDuration'),
    // 6-bit field: 0-6 = real draft rounds 1-7, 63 (all-1s) is the sentinel
    // for "not drafted / not yet drafted this cycle" — same convention as
    // the TeamIndex 255 sentinel used elsewhere in this file. Not yet
    // verified against a real post-draft screenshot (the test save used
    // this session was mid-regular-season) — implemented on the same
    // sentinel-exclusion pattern already proven correct for other fields.
    draftRound: pick('PLYR_DRAFTROUND'),
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
      is_injured: F.injuryStatus ? readCell(rec, F.injuryStatus) === 'Injured' : false,
      injury_type: F.injuryType ? readCell(rec, F.injuryType) : null,
      injury_length: F.injuryLength ? Number(readCell(rec, F.injuryLength)) : null,
      draft_round: F.draftRound ? Number(readCell(rec, F.draftRound)) : null,
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
  // Field names are resolvable off table.schema.attributes alone (attached
  // during the file's initial parse(), independent of any table's own
  // readRecords()) — computed BEFORE reading records so the read below can
  // ask for exactly these fields instead of decoding all ~288 raw fields
  // the game stores per player. Every consumer of this table (below, plus
  // buildRecruitingBoard/buildGameStats/buildDepthCharts, which all share
  // this same table object via resolveRef's tableId lookup — see
  // resolveRef's header comment) only ever reads this picker's fields plus
  // the rating columns, so restricting to exactly that set here is safe:
  // resolveRef only re-reads a table it finds with zero records already
  // loaded, so it won't widen this back out once it's been read.
  const playerFieldPicker = buildPlayerFieldPicker(playerTable);
  const playerFieldNames = new Set(playerTable.schema.attributes.map((f) => f.name));
  const presentRatings = schema.RATING_FIELDS.filter((r) => playerFieldNames.has(r));
  const playerAttribsToLoad = [...new Set([
    ...Object.values(playerFieldPicker).filter(Boolean),
    ...presentRatings,
  ])];
  await playerTable.readRecords(playerAttribsToLoad);

  // Confirmed sharded across multiple simultaneously-populated instances,
  // same shape as PlayerAward/Recruit/SeasonGame/Coach — getBestTable's
  // single-instance pick was silently discarding 7 real teams' worth of
  // ratings/coaching/recruiting/school-grades/records data in a real save
  // (caught by getBestTable's own instance-count warning). None of Team's
  // consumers below rely on row-position identity the way buildCoachOffers
  // used to (they all resolve OTHER teams via full reference resolution,
  // never by decoding+comparing a raw row number to a loop index), so this
  // is a safe drop-in merge unlike the Coach fix.
  const teamRecords = await getAllTableRecords(save, 'Team');
  const { names: teamNames, ratings: teamRatings, fcsFillerRatings, rankings: teamRankings, cfpRankings, topClassRanks } = buildTeamMaps(teamRecords);

  const players = buildPlayerRows(playerTable, teamNames, opts, playerFieldPicker);
  const recruitingBoard = await buildRecruitingBoard(save, playerFieldPicker, presentRatings);

  const recruitRecords = await getAllTableRecords(save, 'Recruit');
  // New/less-tested traversal (Team -> RecruitingBoard -> 60 possible
  // RecruitTarget slots, across every team) — degrade to "no NIL data"
  // rather than failing the whole sync (ratings/schedule/recruiting
  // counts/etc.) if something about this specific chain breaks on a save
  // shaped differently than the one this was verified against.
  let recruitNilOffers = new Map();
  try {
    recruitNilOffers = await buildRecruitTeamNilOffers(save, teamRecords);
  } catch (err) {
    console.error('buildRecruitTeamNilOffers failed, continuing without NIL data:', err.message);
  }
  const leagueRecruitingClasses = await buildLeagueRecruitingClasses(save, recruitRecords, playerFieldPicker, recruitNilOffers, presentRatings);
  const leagueRecruitDirectory = await buildLeagueRecruitDirectory(save, recruitRecords, playerFieldPicker);

  const leagueRivalries = await buildLeagueRivalries(save, teamRecords);
  const leagueSchoolGrades = await buildLeagueSchoolGrades(save, teamRecords);

  const leagueStatRecords = await buildLeagueStatRecords(save);

  // PlayerAward is a high-volume table (every week's Player of the Week x
  // every team, All-Americans, All-Conference, every named award) — unlike
  // Team/Coach/Conference/etc., some of these tables shard across MULTIPLE
  // simultaneously-populated instances rather than one dominant instance
  // plus empty scratch copies, and getBestTable's "pick the single biggest
  // instance" heuristic would silently drop anything landing in a smaller
  // one. getAllTableRecords merges every instance's non-empty rows
  // instead, same fix already proven correct for the 'Recruit' table below.
  const playerAwardRecords = await getAllTableRecords(save, 'PlayerAward');
  const playerAwards = await buildPlayerAwards(save, playerAwardRecords);
  const leagueHonors = await buildLeagueHonors(save, playerAwardRecords);

  const coachAwardTable = await getBestTable(save, 'CoachAward');
  const coachNamedAwards = await buildCoachAwards(save, coachAwardTable);
  leagueHonors.namedAwards = { ...leagueHonors.namedAwards, ...coachNamedAwards };

  const heismanTable = await getBestTable(save, 'HeismanAwardRanking');
  const heismanWatch = await buildHeismanWatch(save, heismanTable);

  // Confirmed sharded across multiple simultaneously-populated instances,
  // same shape as PlayerAward/Recruit/SeasonGame — getBestTable's single-
  // instance pick was silently discarding a real coach (1 of 498 in a real
  // save, caught by getBestTable's own instance-count warning). See
  // buildCoachOffers' header comment for how the row-index-based matching
  // that used to rely on a single instance was replaced.
  const coachRecords = await getAllTableRecords(save, 'Coach');
  const coachingStaff = buildCoachingStaff(coachRecords);
  const userCoachInfo = await buildUserCoachInfo(save, coachRecords);
  const allHeadCoaches = await buildAllHeadCoaches(save, coachRecords);

  const jobOpeningTable = await getBestTable(save, 'JobOpening');
  const coachOffers = await buildCoachOffers(save, jobOpeningTable, userCoachInfo?.coachRec);

  const confTable = await getBestTable(save, 'Conference');
  const conferences = await buildConferences(save, confTable);

  const seasonTable = await getBestTable(save, 'SeasonInfo');
  const season = buildSeasonInfo(seasonTable);

  // Confirmed sharded across multiple simultaneously-populated instances,
  // same shape as PlayerAward/Recruit — getBestTable's single-instance
  // pick was silently discarding real games (4 discarded in a real save,
  // caught by getBestTable's own instance-count warning).
  const gameRecords = await getAllTableRecords(save, 'SeasonGame');
  const playoffBowlSites = await buildPlayoffBowlSites(save);
  const games = await buildSchedule(save, gameRecords, teamNames, playoffBowlSites);

  // Only bother resolving weekly stat slots (whole-league, 2 tables' worth
  // of reference-chasing) for weeks that actually have a played game —
  // an early-season sync has 1-2 played weeks, not the full 15+.
  //
  // NOT restricted to weekType === 'RegularSeason': that used to silently
  // exclude every bowl/CFP week's raw week number from this list, which
  // meant buildGameStats below never even resolved the GameStats{week}/
  // TeamStats{week} slots for a bowl or playoff game — so bowl/CFP box
  // scores (player stat lines, team stats) never made it into gameStats at
  // all, for either the user's own postseason game or any CPU one, even
  // though the final score always synced fine (that comes straight off the
  // SeasonGame row, not gameStats). Conference championship games were
  // never affected — they carry weekType 'RegularSeason' themselves.
  const playedWeeks = [...new Set(
    games.filter((g) => g.status !== 'Unplayed').map((g) => g.week)
  )];
  const gameStats = await buildGameStats(save, playerTable, teamRecords, playerFieldPicker, playedWeeks);
  const depthCharts = await buildDepthCharts(save, teamRecords, playerFieldPicker);

  // coachRec (a raw internal file-parsing object, needed only for
  // buildCoachOffers' identity match above) can't survive JSON
  // serialization back to the client — strip it before returning.
  const { coachRec: _coachRec, ...userCoachInfoSafe } = userCoachInfo || {};
  const userCoachInfoResult = userCoachInfo ? userCoachInfoSafe : null;

  return {
    players,
    teamCount: teamNames.size,
    tableRowCount: playerTable.records.length,
    teamRatings: Object.fromEntries(teamRatings),
    fcsFillerRatings: Object.fromEntries(fcsFillerRatings),
    teamRankings: Object.fromEntries(teamRankings),
    cfpRankings: Object.fromEntries(cfpRankings),
    topClassRanks: Object.fromEntries(topClassRanks),
    coachingStaff: Object.fromEntries(coachingStaff),
    conferences,
    season,
    games,
    recruitingBoard,
    leagueRecruitingClasses: Object.fromEntries(leagueRecruitingClasses),
    leagueRecruitDirectory,
    leagueRivalries: Object.fromEntries(leagueRivalries),
    leagueSchoolGrades: Object.fromEntries(leagueSchoolGrades),
    leagueStatRecords,
    playerAwards,
    leagueHonors,
    heismanWatch,
    userCoachInfo: userCoachInfoResult,
    allHeadCoaches,
    coachOffers,
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
