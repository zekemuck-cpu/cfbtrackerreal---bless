import React, { useState, useMemo, useEffect, useRef } from 'react';
import { getAllStaffDataForDynasty, createStaffAccessor } from './staffDB';
import { uploadImage } from '../utils/imageUpload';
import PlayerDatabase from './PlayerDatabase';
import ScoutAnalysis from './ScoutAnalysis';
import ThresholdLookup from './ThresholdLookup';
import PlayerCount from './PlayerCount';
import { useDynasty, getRecruitingCommitments, getCurrentRoster, getPlayerClassForYear } from '../context/DynastyContext';
import { isMyTarget } from '../utils/recruitingTargets';
import { getCurrentTeamTid } from '../data/teamRegistry';
import { flattenClassCommitments } from '../utils/recruitingScore';
import { positionBucket, recruitingPosLabel } from '../utils/recruitAttributes';
import { useTeamColors } from '../hooks/useTeamColors';
import { getMascotName } from '../data/teams';
import { computeRecentRanks } from '../utils/recruitingDatabasePool';
import { resolveRecruitGroup } from '../utils/recruitGroup';
import { useToast } from './ui';

// Shapes a raw dynasty.players record into the grading-ready recruit shape Scout Staff uses.
function shapeRecruit(pl, addedIndex) {
  const position = positionBucket(pl.position);
  const group = resolveRecruitGroup(position, pl.archetype);
  return {
    pid: pl.pid,
    // The raw, un-bucketed position ("LT"/"RT"/"SAM"/...) as originally
    // entered — preserved alongside the bucketed `position` below so the
    // Recruiting Database can display/store the finer distinction (a scout
    // knows which side of the line a tackle prospect plays) while every
    // grading/threshold lookup below still keys off the bucketed value.
    rawPosition: pl.position,
    scoutedAt: typeof pl.scoutedAt === 'number' ? pl.scoutedAt : null,
    updatedAt: typeof pl.updatedAt === 'number' ? pl.updatedAt : null,
    name: pl.name,
    position,
    archetype: pl.archetype || '',
    devTrait: pl.devTrait || '',
    gemBust: pl.gemBust || '',
    stars: pl.stars,
    attributes: pl.attributes || {},
    group,
    isPortal: pl.isPortal,
    previousTeam: pl.previousTeam,
    nationalRank: pl.nationalRank,
    // These four + class were captured on the recruit at entry but were
    // missing from this shape entirely — silently dropped between the entry
    // form and every surface (Recruiting Database, Threshold Lookup, ...)
    // that reads recruits through shapeRecruit rather than the raw
    // dynasty.players record.
    stateRank: pl.stateRank,
    height: pl.height || '',
    weight: pl.weight || null,
    hometown: pl.hometown || '',
    state: pl.state || '',
    // A still-open (not yet committed) CFB27 JUCO target has no
    // classByYear/year yet (only set once they actually commit — see
    // reconcileRecruitingBoard) — jucoClassLabel is set on the raw player
    // record regardless of commit status, so prefer it here to avoid a
    // JUCO recruit falsely reading "HS" before they sign.
    class: pl.jucoClassLabel || getPlayerClassForYear(pl, pl.recruitYear) || 'HS',
    positionRank: pl.positionRank,
    addedIndex,
    boardRemoved: !!pl.boardRemoved,
    // CFB27-sync-only fields (undefined for manually-entered recruits —
    // every consumer of these must treat undefined as "unknown, don't
    // exclude" rather than "fails the check").
    isHighSchoolRecruit: pl.isHighSchoolRecruit,
    scoutedFully: pl.scoutedFully,
  };
}

// Recruiting.jsx owns the actual top-level tab (and its URL persistence);
// this just translates that outer tab key to the internal view name this
// component's JSX below still switches on.
const SECTION_TO_VIEW = { database: 'database', outlook: 'analysis', thresholds: 'thresholds', counts: 'counts' };

export default function ScoutStaff({ year, section = 'staff', onNavigate, toolbarActionsRef = null, onToolbarReady = null } = {}) {
  const { currentDynasty, updateDynasty, updatePlayer, isViewOnly, activeUserTid } = useDynasty();
  const { toast } = useToast();
  // Resolve the team's display name LIVE from currentTid so a mid-dynasty rename
  // flows into the color theming AND the AI scouting brief. Fall back to the
  // stored teamName snapshot only when no tid is in scope (legacy dynasties).
  const currentTeamName = getMascotName(currentDynasty?.currentTid, currentDynasty?.teams) || currentDynasty?.teamName;
  const teamColors = useTeamColors(currentTeamName, currentDynasty?.teams);
  const teamLogo   = currentDynasty?.teams?.[currentDynasty?.currentTid]?.logo || '';


  // One-time cloud migration: earlier builds stored Scout Staff config only in
  // a device-local IndexedDB ('ScoutStaffComprehensiveDB'). Now it lives on
  // dynasty.scoutStaff and syncs like everything else. When a dynasty has no
  // scoutStaff yet but this device still holds legacy local config, lift it up
  // once so nothing is lost. Fresh dynasties/devices simply start empty.
  const migratedRef = useRef(new Set());
  useEffect(() => {
    const id = currentDynasty?.id;
    if (!id || isViewOnly) return;
    if (currentDynasty.scoutStaff !== undefined) return; // already on the cloud model
    if (migratedRef.current.has(id)) return;
    migratedRef.current.add(id);
    (async () => {
      try {
        const legacy = await getAllStaffDataForDynasty(id);
        if (legacy && Object.keys(legacy).length) {
          // Legacy portraits were stored as base64 data URLs. Re-host them to
          // the image host so they don't bloat the cloud doc; drop rather than
          // persist base64 if the re-host fails.
          for (const k of ['scout_img', 'analyst_img']) {
            const v = legacy[k];
            if (typeof v === 'string' && v.startsWith('data:')) {
              try {
                const blob = await (await fetch(v)).blob();
                legacy[k] = await uploadImage(blob);
              } catch {
                delete legacy[k];
              }
            }
          }
          await updateDynasty(id, { scoutStaff: legacy });
        }
      } catch (err) {
        console.warn('[ScoutStaff] legacy staff migration failed:', err);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentDynasty?.id, currentDynasty?.scoutStaff, isViewOnly]);
  // v15: navigation moved up to Recruiting.jsx, which passes the active section
  // as a prop; subView is derived from it (was internal searchParams before).
  const subView = SECTION_TO_VIEW[section] || 'home';
  const [dbHighlightPid, setDbHighlightPid] = useState(null);
  const highlightPid = dbHighlightPid;

  const openDatabase = (pid) => {
    setDbHighlightPid(pid ?? null);
    onNavigate?.('database');
  };

  // outlookSummary is populated by the live onOutlookReady callback from
  // ScoutAnalysis. That callback only fires once every staffDB-backed config
  // it depends on has finished loading (see ScoutAnalysis's strategiesLoaded
  // gate), so it's always correct — but it's still async, which left a brief
  // empty Daily Brief on every mount. localStorage is synchronous, so we seed
  // from the last confirmed-correct result for THIS dynasty immediately, then
  // let the live computation silently replace it once it resolves.
  const [outlookSummary, setOutlookSummary] = useState(null);
  const dynastyId = currentDynasty?.id ?? null;
  // The team whose recruiting board this is. In a shared league that's the
  // acting member's own team, not the dynasty's (owner's) current team.
  const myRecruitingTid = activeUserTid ?? getCurrentTeamTid(currentDynasty);
  const cachedOutlookSummary = useMemo(() => {
    if (!dynastyId) return null;
    try {
      const raw = localStorage.getItem(`cfb_outlook_summary_${dynastyId}`);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }, [dynastyId]);
  // The recruit board IS the recruiting Targets board — a single shared source.
  // Targets entered via the recruiting sheet (dynasty.players, isTarget) flow
  // straight into Scout Staff; attributes are already stored under the same
  // canonical names the grading engine expects (see utils/recruitAttributes.js).
  // We only normalize the raw game position to its grading bucket (RT → OT).
  const boardYear = Number(year ?? currentDynasty?.currentYear);
  // Numbering for "Recent" is global across the whole Recruiting Database, not
  // per-class: the 1st target ever entered into the tab (any year) is #1, the
  // 2nd is #2, etc. So we index every target first, then filter to boardYear.
  const recruits = useMemo(() => {
    const players = currentDynasty?.players || [];
    return players
      // Shared leagues share one players array — only MY board's targets.
      .filter(pl => pl?.isTarget && pl.name && isMyTarget(pl, myRecruitingTid))
      .map((pl, globalIndex) => ({ pl, globalIndex }))
      .filter(({ pl }) => Number(pl.targetYear) === boardYear)
      .map(({ pl, globalIndex }) => shapeRecruit(pl, globalIndex));
  }, [currentDynasty?.players, currentDynasty?.id, boardYear, myRecruitingTid]);

  // Same shaping as `recruits` above, but NOT scoped to the current class
  // year — the Recruiting Database (and Threshold Lookup) are "every recruit
  // ever scouted in this dynasty" references, unlike the Targets board/
  // Program Outlook, which are deliberately scoped to the active class only.
  // `recruits` used to double as this dynasty's half of databaseRecruits too,
  // which silently dropped every prior class's targets from the Database view
  // (undercounting it against PlayerCount.jsx's own all-seasons total).
  const allYearRecruits = useMemo(() => {
    const players = currentDynasty?.players || [];
    return players
      .filter(pl => pl?.isTarget && pl.name && isMyTarget(pl, myRecruitingTid))
      .map((pl, globalIndex) => shapeRecruit(pl, globalIndex));
  }, [currentDynasty?.players, currentDynasty?.id, myRecruitingTid]);

  // Active board — excludes anything removed via the Targets tab's remove toggle. Drives
  // Program Outlook and Threshold Lookup, scoped to this dynasty's current class only.
  const boardRecruits = useMemo(() => recruits.filter(r => !r.boardRemoved), [recruits]);
  // The other half of the same split — feeds Program Outlook's "Removed" section so it
  // mirrors the Targets tab's Big Board/Removed view exactly (same boardRemoved field).
  const removedBoardRecruits = useMemo(() => recruits.filter(r => r.boardRemoved), [recruits]);

  // Toggles a recruit's boardRemoved flag — identical to ScoutBoard.jsx's own
  // handleToggleRemove, so Program Outlook's targeting toggle and the Targets
  // tab always agree (same dynasty field, same write path). `recruits` here is
  // scoped to this dynasty only (no sibling merge), so no cross-dynasty case.
  const handleToggleBoardRemoved = async (pl) => {
    if (!currentDynasty || isViewOnly) return;
    const players = currentDynasty.players || [];
    const newPlayers = players.map(p => p.pid === pl.pid ? { ...p, boardRemoved: !p.boardRemoved } : p);
    await updateDynasty(currentDynasty.id, { players: newPlayers }, { changedPlayerPids: [pl.pid] });
  };

  // Full Recruiting Database pool — every one of this dynasty's targets across
  // every class year. Program Outlook stays on `recruits`/`boardRecruits`
  // (current season only, since "assess this season's class" shouldn't mix
  // in prior seasons); the database and threshold views below use this wider
  // pool. `recentRank` is the true add order — #1 is the very first target
  // ever scouted in this dynasty, the highest number is the most recently
  // added. Players scouted before this field existed (scoutedAt === null)
  // sort first, oldest, by their original insertion order.
  const databaseRecruits = useMemo(() => {
    const rankByKey = computeRecentRanks(allYearRecruits);
    return allYearRecruits.map(r => ({ ...r, recentRank: rankByKey.get(`${r.pid}`) }));
  }, [allYearRecruits]);

  // Threshold Lookup's pool, deliberately NOT filtered by boardRemoved: a
  // recruit dropped from the Targets board is a triage decision about this
  // dynasty's recruiting class, not a signal that his scouted attributes/dev
  // trait are bad data — he still counts toward benchmarks exactly like he
  // still shows in the Recruiting Database. HS recruits only (matches
  // Recruiting Database) — portal/transfer targets are a different
  // evaluation context and shouldn't skew freshman benchmark data.
  //
  // Also folds in this dynasty's own recruitingDatabasePlayers extras —
  // recruits that were never a real Target but are still genuine scouted
  // comps worth learning from. No explicit dev-trait filter is needed here:
  // buildRevealedPool (which every Threshold Lookup computation reads
  // through) already excludes Hidden/blank dev traits on its own, so a Hidden
  // extra folded in here contributes nothing until its dev trait is filled in.
  const thresholdRecruits = useMemo(() => {
    // isJucoRecruit duplicated here (same predicate as freshmanRecruits below)
    // since this runs before that declaration — this comment already claimed
    // "matches Recruiting Database" but never actually excluded JUCO recruits,
    // the same drift fixed in PlayerCount.jsx's Scouting Needs total.
    const isJuco = (r) => r.isHighSchoolRecruit === false ||
      (typeof r.class === 'string' && (r.class.toUpperCase().startsWith('JUCO') || r.class.startsWith('JC (')));
    // The whole point of this pool is correlating the 10 scouted attributes
    // against dev trait — a recruit with no attribute data on file can't
    // contribute to that and would just pollute the comps, regardless of
    // whether its dev trait happens to be known.
    const hasAttrs = (r) => !!r.attributes && Object.keys(r.attributes).length > 0;
    const excluded = new Set((currentDynasty?.recruitingDatabaseExcludedPids || []).map(String));
    const targets = databaseRecruits.filter(r => !r.isPortal && !r.previousTeam && !isJuco(r) && hasAttrs(r) && !excluded.has(String(r.pid)));
    const seen = new Set(targets.map(r => `${r.pid}`));
    const extras = (currentDynasty?.recruitingDatabasePlayers || []).filter(r => !r.isPortal && !r.previousTeam && !isJuco(r) && hasAttrs(r) && !seen.has(`${r.pid}`) && !excluded.has(String(r.pid)));
    return [...targets, ...extras];
  }, [databaseRecruits, currentDynasty]);

  // Committed recruits for the current team/year, pulled from dynasty recruiting data
  const committedRecruits = useMemo(() => {
    if (!currentDynasty?.currentTid || !currentDynasty?.currentYear) return [];
    const raw = getRecruitingCommitments(currentDynasty, currentDynasty.currentTid, currentDynasty.currentYear);
    return flattenClassCommitments(raw);
  }, [currentDynasty]);

  // Roster summary for the Daily Brief — matches Data Analysis logic
  const rosterSummary = useMemo(() => {
    if (!currentDynasty?.currentYear) return null;
    const year = Number(currentDynasty.currentYear);
    const roster = getCurrentRoster(currentDynasty).filter(p => !p.isTarget && !p.isHonorOnly);
    if (!roster.length) return null;

    const ylFn = p => {
      const cls = (getPlayerClassForYear(p, year) || '').toLowerCase().replace(/\s+/g, '');
      if (cls === 'sr' || cls === 'rssr') return 0;
      if (cls === 'jr' || cls === 'rsjr') return 1;
      if (cls === 'so' || cls === 'rsso') return 2;
      if (cls === 'fr' || cls === 'rsfr') return 3;
      return 2;
    };
    const toOvr = p => Number(p.overallByYear?.[year] ?? p.overallByYear?.[String(year)] ?? p.overall ?? 0);

    const leaving = roster.filter(p => ylFn(p) === 0).length;
    const returning = roster.length - leaving;
    const available = Math.max(0, 85 - returning);

    const POS_MAP = {
      QB: ['QB'], HB: ['HB', 'FB', 'RB'], WR: ['WR'], TE: ['TE'],
      OT: ['LT', 'RT', 'OT'], OG: ['LG', 'RG', 'OG'], C: ['C'],
      DE: ['DE', 'LEDG', 'REDG', 'EDGE', 'LE', 'RE'], DT: ['DT', 'NT', 'DL'],
      OLB: ['SAM', 'WILL', 'OLB', 'LOLB', 'ROLB'], MIKE: ['MIKE', 'MLB', 'ILB', 'LB'],
      CB: ['CB', 'DB'], FS: ['FS'], SS: ['SS'],
    };
    const MIN_STARTERS = { QB:1, HB:2, WR:3, TE:1, OT:2, OG:2, C:1, DE:2, DT:2, OLB:2, MIKE:1, CB:3, FS:1, SS:1 };
    const MIN_DEPTH    = { QB:3, HB:4, WR:7, TE:3, OT:6, OG:6, C:3, DE:6, DT:4, OLB:6, MIKE:3, CB:5, FS:3, SS:3 };

    const criticalPositions = [];
    const pipelinePositions = [];

    Object.entries(POS_MAP).forEach(([pos, posSet]) => {
      const valid = new Set(posSet);
      const group = roster.filter(p => {
        const pp = (p.positionByYear?.[year] ?? p.positionByYear?.[String(year)] ?? p.position ?? '').toUpperCase();
        return valid.has(pp);
      });
      if (!group.length) return;

      const minStart = MIN_STARTERS[pos] ?? 1;
      const players = group.map(p => ({ ovr: toOvr(p), yl: ylFn(p), dev: p.devTrait || '' }));
      const isProjected = p => p.ovr >= 80 || (p.ovr >= 70 && (p.dev === 'Elite' || p.dev === 'Star'));

      const nextYrStarters = players.filter(p => p.yl >= 1 && p.ovr >= 80).length;
      const yr2 = players.filter(p => p.yl >= 2 && isProjected(p)).length;
      const yr3 = players.filter(p => p.yl >= 3 && isProjected(p)).length;

      if (nextYrStarters < minStart) criticalPositions.push(pos);
      else if (yr2 < minStart || yr3 < minStart) pipelinePositions.push(pos);
    });

    return { total: roster.length, leaving, returning, available, criticalPositions, pipelinePositions };
  }, [currentDynasty]);

  const rosterWarnings = useMemo(() => {
    if (!currentDynasty?.currentYear) return [];
    const year = Number(currentDynasty.currentYear);

    const roster = getCurrentRoster(currentDynasty).filter(p => !p.isTarget);

    // No roster data entered — derive warnings from the target board instead
    if (roster.length === 0) {
      if (!recruits.length) return [];
      const KEY_POS = ['QB', 'HB', 'WR', 'OT', 'OG', 'DE', 'DT', 'OLB', 'CB', 'FS', 'SS'];
      const posCounts = {};
      recruits.forEach(r => { posCounts[r.position] = (posCounts[r.position] || 0) + 1; });

      // Sort all key positions by how few targets they have (always shows something)
      const byThin = KEY_POS
        .map(pos => ({ pos, count: posCounts[pos] || 0 }))
        .sort((a, b) => a.count - b.count);

      const warns = [];
      const zeroed = byThin.filter(x => x.count === 0);
      if (zeroed.length > 0) {
        warns.push(`No ${zeroed.slice(0, 3).map(x => recruitingPosLabel(x.pos)).join(', ')} targets on the board — these spots need immediate attention`);
      }
      // Always surface the 2 thinnest covered positions
      const covered = byThin.filter(x => x.count > 0).slice(0, 2);
      if (covered.length > 0) {
        warns.push(`Thinnest pipeline: ${covered.map(t => `${recruitingPosLabel(t.pos)} (${t.count})`).join(', ')} — need more depth at these spots`);
      }
      // If still nothing (every position is loaded), flag the weakest by stars
      if (warns.length === 0) {
        const lowStar = recruits.filter(r => Number(r.stars) <= 2).length;
        if (lowStar > 0)
          warns.push(`${lowStar} low-star targets on the board — pipeline needs higher ceiling prospects`);
        else
          warns.push(`Board looks balanced — enter roster players to see depth chart concerns`);
      }
      return warns.slice(0, 3);
    }

    const norm = roster.map(p => ({
      name: p.name,
      pos:  positionBucket(p.position) || p.position,
      ovr:  Number(p.overallByYear?.[year] ?? p.overallByYear?.[String(year)] ?? p.overall ?? 0),
      cls:  getPlayerClassForYear(p, year),
    })).filter(p => p.pos);

    const byPos = {};
    norm.forEach(p => { (byPos[p.pos] = byPos[p.pos] || []).push(p); });

    const warnings = [];
    const TRACK_POS = ['QB', 'HB', 'WR', 'TE', 'OT', 'OG', 'DE', 'DT', 'OLB', 'CB', 'FS', 'SS'];
    const CRIT_POS  = ['QB', 'HB', 'WR', 'OT', 'DE', 'CB'];

    // 1. Always surface the thinnest positions (no threshold — just rank by count)
    const byDepth = TRACK_POS
      .map(pos => ({ pos, count: (byPos[pos] || []).length }))
      .sort((a, b) => a.count - b.count);

    const thinnest = byDepth.slice(0, 2);
    if (thinnest[0].count === 0) {
      warnings.push(`No ${recruitingPosLabel(thinnest[0].pos)} on the depth chart — position completely unaddressed`);
      if (thinnest[1]?.count === 0)
        warnings.push(`No ${recruitingPosLabel(thinnest[1].pos)} either — two key spots with zero depth`);
      else if (thinnest[1])
        warnings.push(`Only ${thinnest[1].count} ${recruitingPosLabel(thinnest[1].pos)} on the roster — needs more bodies`);
    } else {
      warnings.push(`Thinnest spots: ${thinnest.map(t => `${recruitingPosLabel(t.pos)} (${t.count})`).join(', ')} — priority recruiting targets`);
    }

    // 2. Lowest-rated starter at a critical position (always surface one)
    const starterRatings = CRIT_POS
      .map(pos => {
        const group = byPos[pos] || [];
        if (!group.length) return null;
        const starter = [...group].sort((a, b) => b.ovr - a.ovr)[0];
        return starter.ovr > 0 ? { pos, ovr: starter.ovr, name: starter.name } : null;
      })
      .filter(Boolean)
      .sort((a, b) => a.ovr - b.ovr);

    if (starterRatings.length > 0) {
      const ws = starterRatings[0];
      warnings.push(`${ws.name} leads at ${recruitingPosLabel(ws.pos)} with ${ws.ovr} OVR — ${ws.ovr < 78 ? 'a clear weak point on the roster' : 'the lowest-rated starter, upgrade needed'}`);
    }

    // 3. Seniors vacating positions (flag when it leaves a group short)
    const isSenior = cls => ['SR', 'RS SR', 'SENIOR', '5TH'].includes(String(cls || '').toUpperCase());
    const seniors = norm.filter(p => isSenior(p.cls));
    if (seniors.length > 0) {
      const byPosSr = {};
      seniors.forEach(p => { byPosSr[p.pos] = (byPosSr[p.pos] || 0) + 1; });
      const urgentLosses = Object.entries(byPosSr)
        .filter(([pos, n]) => ((byPos[pos] || []).length - n) <= 1)
        .sort(([, a], [, b]) => b - a);
      if (urgentLosses.length > 0) {
        const str = urgentLosses.slice(0, 2).map(([pos, n]) => `${n > 1 ? n + ' ' : ''}${recruitingPosLabel(pos)}`).join(', ');
        warnings.push(`Losing ${str} to graduation — depth chart will be critical next season`);
      } else {
        const topLoss = Object.entries(byPosSr).sort(([, a], [, b]) => b - a)[0];
        warnings.push(`${seniors.length} seniors graduating — ${recruitingPosLabel(topLoss[0])} loses the most`);
      }
    }

    return warnings.slice(0, 3);
  }, [currentDynasty, recruits]);

  // True freshmen only — no portal/transfer players, no Junior College
  // transfers (checked both via the CFB27 sync's explicit isHighSchoolRecruit
  // flag and the class string itself, so a manually-entered 'JUCO ...' recruit
  // is excluded the same way). The whole point of this database is
  // correlating the 10 scouted attributes against dev trait, so a recruit
  // with no attribute data on file (never scouted — whether still Hidden or,
  // via the Update Dev Traits modal, a dev trait revealed with no attributes
  // behind it) must never count here regardless of dev trait status; a
  // recruit that IS scouted but still Hidden is fine (that's the normal
  // pre-signing-day state) and stays in.
  const isJucoRecruit = (r) => r.isHighSchoolRecruit === false ||
    (typeof r.class === 'string' && (r.class.toUpperCase().startsWith('JUCO') || r.class.startsWith('JC (')));
  const hasAttrs = (r) => !!r.attributes && Object.keys(r.attributes).length > 0;
  const freshmanRecruits = useMemo(() => databaseRecruits.filter(r =>
    !r.isPortal && !r.previousTeam && !isJucoRecruit(r) && hasAttrs(r)
  ), [databaseRecruits]);

  const teamTheme = { teamColors, teamLogo };

  // Deep-link from a Daily Brief "Recruiting Plan" row straight to that
  // position's tab in Program Outlook.
  const [analysisJumpPos, setAnalysisJumpPos] = useState(null);
  const goToAnalysisPosition = (pos) => {
    setAnalysisJumpPos({ pos, ts: Date.now() });
    onNavigate?.('outlook');
  };
  // ScoutAnalysis stays mounted (CSS-hidden) the whole time Scout Staff is
  // open, so its own activePos/isOverview state otherwise just sits wherever
  // it was last left — e.g. a QB detail page — and silently reappears the
  // next time the user presses the plain "Program Outlook" nav button. That
  // button should ALWAYS land on Overview; only an explicit deep link
  // (goToAnalysisPosition above) should ever open straight to a position.
  const [analysisResetKey, setAnalysisResetKey] = useState(0);
  const goToAnalysisOverview = () => {
    setAnalysisResetKey(k => k + 1);
    onNavigate?.('outlook');
  };

  // Deep-link from Scouting Needs (History) — clicking an archetype card
  // there jumps straight to that exact position + archetype + star bucket in
  // Thresholds. Unlike ScoutAnalysis, ThresholdLookup unmounts whenever
  // subView leaves 'thresholds' (see the render below), so a stale jump
  // target left set from a past visit would otherwise get silently reapplied
  // the next time the coach mounts it via the plain "Thresholds" tab — this
  // clears it right after the jump lands, one-shot, same reasoning as
  // analysisJumpPos above.
  const [thresholdsJumpTarget, setThresholdsJumpTarget] = useState(null);
  const goToThresholdsBucket = (pos, arch, star) => {
    setThresholdsJumpTarget({ pos, arch, star, ts: Date.now() });
    onNavigate?.('thresholds');
  };
  useEffect(() => {
    if (subView === 'thresholds' && thresholdsJumpTarget) setThresholdsJumpTarget(null);
  }, [subView, thresholdsJumpTarget]);

  // ScoutAnalysis is always mounted (see below), so it's the single source of
  // truth for posExtraTargets — rather than duplicating that state here, it
  // hands its own adjustExtraTargets function up through this ref once
  // mounted, and this stable wrapper is what Daily Brief calls to decrement a
  // generic "1 HS"/"1 Portal" pill straight from the Recruiting Plan, exactly
  // as if the coach had clicked the "−" stepper inside Program Outlook itself.
  // Reuses the same ref Recruiting.jsx's hero toolbar buttons write into
  // (toolbarActionsRef) when provided, so ScoutAnalysis's Configure/Help
  // hooks land in the one ref object the toolbar already calls — falls back
  // to a local ref so this component still works standalone.
  const localActionsRef = useRef({});
  const analysisActionsRef = toolbarActionsRef || localActionsRef;
  const adjustExtraTargetsFromBrief = (key, type, delta, resolved) =>
    analysisActionsRef.current.adjustExtraTargets?.(key, type, delta, resolved);
  // One-shot: analysisJumpPos never went back to null after being consumed, so
  // every later plain "Program Outlook" nav (main-hub button, tabs, etc.) also
  // mounted ScoutAnalysis with the old jumpToPos still set, re-triggering the
  // jump instead of defaulting to Overview. React runs child effects before
  // parent effects in the same commit, so ScoutAnalysis's own jumpToPos effect
  // has already fired (and jumped) by the time this clears it back to null.
  useEffect(() => {
    if (subView === 'analysis' && analysisJumpPos) setAnalysisJumpPos(null);
  }, [subView, analysisJumpPos]);

  // Recruiting Database's edit modal hands back a shaped recruit (a trimmed
  // view of the raw player). Merge just the edited fields into the real
  // dynasty.players record so every other surface reading that player's data
  // (board, thresholds, roster) picks it up too. Returns true on success,
  // false on failure — callers use this to decide whether it's safe to
  // discard the edit form (never close/clear on failure, so a failed save
  // never costs the user their in-progress edit).
  const handleEditDatabasePlayer = async (updated) => {
    if (isViewOnly) return false;
    try {
      const fields = {
        name: updated.name,
        position: updated.position,
        archetype: updated.archetype,
        devTrait: updated.devTrait,
        gemBust: updated.gemBust,
        stars: updated.stars,
        attributes: updated.attributes,
      };
      const players = currentDynasty?.players || [];
      const original = players.find(p => p.pid === updated.pid);
      if (!original) {
        toast.error('Could not save — that prospect could not be found. Your edit was not saved.');
        return false;
      }
      await updatePlayer(dynastyId, { ...original, ...fields });
      return true;
    } catch (err) {
      console.error('Failed to save prospect edit:', err);
      toast.error('Failed to save your edit. Please try again — if this keeps happening, export your dynasty as a backup.');
      return false;
    }
  };

  // PlayerDatabase.jsx's own handleDelete already intercepts database-only
  // recruits internally (isFromRecruitingDatabase -> recruitingDatabasePlayers)
  // BEFORE ever calling this — so this only ever runs for a real, save-synced
  // Target. Actually deleting one isn't available (it would just reappear on
  // the next Sync from Save, or orphan history tied to the pid) — but Batch
  // Edit's own "delete" for exactly this case already has a real answer:
  // recruitingDatabaseExcludedPids, which hides the pid from the Recruiting
  // Database view only (every other surface — Targets, roster, stats — is
  // untouched). This mirrors that same mechanism for the single-row Delete
  // Prospect button, so both paths behave identically. Also, passing a
  // non-null onDelete here is what makes the "Delete Prospect" button render
  // AT ALL for genuine database-only recruits — PlayerDatabase.jsx gates the
  // button's visibility on `onDelete` being truthy, not on whether the
  // currently-open recruit happens to be database-only, so leaving this prop
  // unset (as it was) hid the button for every recruit, even ones that
  // really are deletable.
  const handleDeleteDatabasePlayer = async (pl) => {
    if (!pl?.pid) return;
    try {
      const existingExcluded = currentDynasty?.recruitingDatabaseExcludedPids || [];
      if (existingExcluded.some(id => String(id) === String(pl.pid))) return;
      const nextExcluded = [...existingExcluded, pl.pid];
      await updateDynasty(currentDynasty.id, { recruitingDatabaseExcludedPids: nextExcluded });
      toast.success(`Removed "${pl.name}" from the Recruiting Database. The real recruiting target itself (Targets, roster, etc.) is untouched.`);
    } catch (err) {
      console.error('Failed to remove prospect from Recruiting Database:', err);
      toast.error('Failed to remove. Please try again.');
    }
  };

  return (
    <div className="w-full space-y-4">
      {/* Read-only: mirrors the recruiting Targets sheet. Freshmen and portal targets are split.
          Uses the unfiltered list so a target removed from the board still shows up here. */}
      {subView === 'database'   && <PlayerDatabase players={freshmanRecruits} roleContext="National Scout" dynastyId={dynastyId} {...teamTheme} onEdit={isViewOnly ? null : handleEditDatabasePlayer} onDelete={isViewOnly ? null : handleDeleteDatabasePlayer} highlightPid={highlightPid} actionsRef={toolbarActionsRef} onReady={onToolbarReady} />}
      {subView === 'thresholds' && <ThresholdLookup players={thresholdRecruits} roleContext="Data Analyst" dynastyId={dynastyId} {...teamTheme} jumpTarget={thresholdsJumpTarget} actionsRef={toolbarActionsRef} onReady={onToolbarReady} />}
      {subView === 'counts'     && <PlayerCount onSelectBucket={goToThresholdsBucket} {...teamTheme} actionsRef={toolbarActionsRef} onReady={onToolbarReady} />}


      {/* Always mounted so allHubs recomputes live whenever recruits or roster data changes.
          Hidden when not on the analysis view — UI is invisible but computation runs.
          Uses boardRecruits so removed targets are no longer discussed in Program Outlook. */}
      <div className={subView === 'analysis' ? '' : 'hidden'}>
        <ScoutAnalysis players={boardRecruits} removedRecruits={removedBoardRecruits} onToggleBoardRemoved={isViewOnly ? null : handleToggleBoardRemoved} roleContext="Data Analyst" {...teamTheme} dynasty={currentDynasty} committedRecruits={committedRecruits} onOutlookReady={data => { setOutlookSummary(data); }} jumpToPos={analysisJumpPos} resetToOverviewKey={analysisResetKey} actionsRef={analysisActionsRef} onReady={onToolbarReady} />
      </div>
    </div>
  );
}