import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { createStaffAccessor } from './staffDB';
import FrontPage from './ScoutStaffFrontPage';
import PlayerDatabase from './PlayerDatabase';
import ScoutAnalysis from './ScoutAnalysis';
import ThresholdLookup from './ThresholdLookup';
import PlayerCount from './PlayerCount';
import { useDynasty, getRecruitingCommitments, getCurrentRoster, getPlayerClassForYear } from '../context/DynastyContext';
import { flattenClassCommitments } from '../utils/recruitingScore';
import { positionBucket } from '../utils/recruitAttributes';
import { useTeamColors } from '../hooks/useTeamColors';
import { getSiblingScoutedPlayers } from '../utils/sharedRecruitingDb';
import { useToast } from './ui';

// Shapes a raw dynasty.players record into the grading-ready recruit shape Scout Staff uses.
// sourceDynastyId + pid together form a globally unique identity — pid alone is only a
// small per-dynasty counter, so two different dynasties can share the same pid.
function shapeRecruit(pl, addedIndex, sourceDynastyId) {
  const position = positionBucket(pl.position);
  const group = position === 'ATH'
    ? 'Athlete Pipeline'
    : ['QB', 'HB', 'WR', 'TE', 'OT', 'OG', 'C'].includes(position) ? 'Offense' : 'Defense';
  return {
    pid: pl.pid,
    sourceDynastyId,
    scoutedAt: typeof pl.scoutedAt === 'number' ? pl.scoutedAt : null,
    // Needed by the Recruiting Database's Google Sheet sync to tell whether
    // a sheet edit is actually newer than this record before writing it back.
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
    // form and every surface (Recruiting Database, its Sheet sync) that reads
    // recruits through shapeRecruit rather than the raw dynasty.players record.
    stateRank: pl.stateRank,
    height: pl.height || '',
    weight: pl.weight || null,
    hometown: pl.hometown || '',
    state: pl.state || '',
    class: getPlayerClassForYear(pl, pl.recruitYear) || 'HS',
    positionRank: pl.positionRank,
    addedIndex,
    boardRemoved: !!pl.boardRemoved,
  };
}

// Module-scoped (not component state): stays true for the lifetime of this
// page load once Scout Staff has mounted, and resets to false only on a real
// browser reload — see the subView/dbHighlightPid initializers below.
let scoutStaffHydrated = false;

export default function ScoutStaff({ year } = {}) {
  const { currentDynasty, dynasties, getDynastyPlayers, updateDynasty, updatePlayer, isViewOnly } = useDynasty();
  const { toast } = useToast();
  const teamColors = useTeamColors(currentDynasty?.teamName, currentDynasty?.teams);
  const teamLogo   = currentDynasty?.teams?.[currentDynasty?.currentTid]?.logo || '';
  const [searchParams, setSearchParams] = useSearchParams();
  // A page refresh or first visit should always land on the home hub — never
  // silently reopen a player card because a stale ?view=/&pid= was still
  // sitting in the address bar from a previous visit. Internal navigation
  // within an already-mounted Scout Staff (e.g. clicking a prospect from
  // Actively Targeting) still needs those params to work, so we only ignore
  // them on the very first mount of a fresh page load — tracked with a
  // module-level flag that resets whenever the page itself reloads.
  const [subView, setSubView] = useState(() => {
    if (!scoutStaffHydrated) return 'home';
    const v = searchParams.get('view');
    return v === 'database' || v === 'thresholds' || v === 'analysis' || v === 'counts' ? v : 'home';
  });
  const [dbHighlightPid, setDbHighlightPid] = useState(() => (
    scoutStaffHydrated ? (searchParams.get('pid') ?? null) : null
  ));
  const highlightPid = dbHighlightPid;

  useEffect(() => {
    scoutStaffHydrated = true;
  }, []);

  const openDatabase = (pid) => {
    setDbHighlightPid(pid ?? null);
    setSubView('database');
  };

  // subView/dbHighlightPid above only seed from the URL once, at mount. If
  // ScoutStaff is already mounted (e.g. the user is sitting on Program Outlook)
  // and something navigates here again with new ?view=/&pid= params — like
  // clicking a prospect name in Actively Targeting — those lazy initializers
  // never re-run, so the visible subView silently stayed put even though the
  // URL changed. Mirror the URL on every change instead of just on mount. The
  // very first firing (at mount) is skipped so it doesn't immediately undo the
  // fresh-load reset above by re-reading whatever stale params were already
  // sitting in the URL.
  const skippedFirstSearchParamsSync = useRef(false);
  useEffect(() => {
    if (!skippedFirstSearchParamsSync.current) {
      skippedFirstSearchParamsSync.current = true;
      return;
    }
    const v = searchParams.get('view');
    if (v === 'database' || v === 'thresholds' || v === 'analysis' || v === 'counts') {
      setSubView(v);
    }
    const pid = searchParams.get('pid');
    if (pid) setDbHighlightPid(pid);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Mirror subView/dbHighlightPid back into the URL as real history entries so
  // the native browser/OS swipe-back gesture works within Scout Staff the same
  // way it already does on the rest of the site. Params are omitted entirely
  // when at their default so a refresh (which ignores stale params anyway,
  // see above) can't reopen anything unexpected.
  useEffect(() => {
    const wantView = subView === 'home' ? null : subView;
    const wantPid  = subView === 'database' ? dbHighlightPid : null;
    if (searchParams.get('view') === wantView && searchParams.get('pid') === wantPid) return;
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (wantView) next.set('view', wantView); else next.delete('view');
      if (wantPid)  next.set('pid', wantPid);   else next.delete('pid');
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subView, dbHighlightPid]);
  // outlookSummary is populated by the live onOutlookReady callback from
  // ScoutAnalysis. That callback only fires once every staffDB-backed config
  // it depends on has finished loading (see ScoutAnalysis's strategiesLoaded
  // gate), so it's always correct — but it's still async, which left a brief
  // empty Daily Brief on every mount. localStorage is synchronous, so we seed
  // from the last confirmed-correct result for THIS dynasty immediately, then
  // let the live computation silently replace it once it resolves.
  const [outlookSummary, setOutlookSummary] = useState(null);
  const dynastyId = currentDynasty?.id ?? null;
  const cachedOutlookSummary = useMemo(() => {
    if (!dynastyId) return null;
    try {
      const raw = localStorage.getItem(`cfb_outlook_summary_${dynastyId}`);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }, [dynastyId]);
  const dbIsolated = !!currentDynasty?.recruitingDbIsolated;

  // Sub-navigation doesn't change the URL, so the route-level ScrollToTop never
  // fires — land at the top of each page whenever the user switches tabs.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [subView]);

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
      .filter(pl => pl?.isTarget && pl.name)
      .map((pl, globalIndex) => ({ pl, globalIndex }))
      .filter(({ pl }) => Number(pl.targetYear) === boardYear)
      .map(({ pl, globalIndex }) => shapeRecruit(pl, globalIndex, currentDynasty?.id));
  }, [currentDynasty?.players, currentDynasty?.id, boardYear]);

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

  // Cross-dynasty scouted players (other non-isolated dynasties this user owns), pulled in
  // for the Recruiting Database view only — not year-scoped, since "year" numbering isn't
  // comparable across separate dynasty saves. Toggling "start from scratch" stops THIS
  // dynasty from pulling these in, but this dynasty's own players still flow out to others.
  const [siblingPlayers, setSiblingPlayers] = useState([]);
  const dynastiesKey = useMemo(
    () => (dynasties || []).map(d => d.id).join('|'),
    [dynasties]
  );
  useEffect(() => {
    let alive = true;
    getSiblingScoutedPlayers(currentDynasty, dynasties, getDynastyPlayers).then(list => {
      if (alive) setSiblingPlayers(list);
    });
    return () => { alive = false };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentDynasty?.id, dbIsolated, dynastiesKey]);

  const siblingRecruits = useMemo(() => {
    return siblingPlayers
      .filter(pl => pl?.isTarget && pl.name)
      .map((pl, i) => shapeRecruit(pl, 1e6 + i, pl._sourceDynastyId));
  }, [siblingPlayers]);

  // Full Recruiting Database pool — this dynasty's current class plus every shared
  // dynasty's scouted players. Program Outlook stays on `recruits`/`boardRecruits`
  // (current dynasty + season only, since "assess this season's class" shouldn't mix
  // in other save files); the database and threshold views below merge.
  // `recentRank` is the true add order across every dynasty — #1 is the very first
  // target ever scouted anywhere, the highest number is the most recently added. Players
  // scouted before this field existed (scoutedAt === null) sort first, oldest, by their
  // original per-dynasty insertion order.
  const databaseRecruits = useMemo(() => {
    const merged = [...recruits, ...siblingRecruits];
    const ranked = [...merged].sort((a, b) => {
      const at = a.scoutedAt ?? 0;
      const bt = b.scoutedAt ?? 0;
      if (at !== bt) return at - bt;
      return (a.addedIndex ?? 0) - (b.addedIndex ?? 0);
    });
    const rankByKey = new Map(ranked.map((r, i) => [`${r.sourceDynastyId}:${r.pid}`, i + 1]));
    return merged.map(r => ({ ...r, recentRank: rankByKey.get(`${r.sourceDynastyId}:${r.pid}`) }));
  }, [recruits, siblingRecruits]);

  // Threshold Lookup's pool — same cross-dynasty merge as the Recruiting Database,
  // minus anything removed from the board, so benchmark sample sizes grow across saves.
  // HS recruits only (matches Recruiting Database) — portal/transfer targets are a
  // different evaluation context and shouldn't skew freshman benchmark data.
  const thresholdRecruits = useMemo(() => databaseRecruits.filter(r => !r.boardRemoved && !r.isPortal && !r.previousTeam), [databaseRecruits]);

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
        warns.push(`No ${zeroed.slice(0, 3).map(x => x.pos).join(', ')} targets on the board — these spots need immediate attention`);
      }
      // Always surface the 2 thinnest covered positions
      const covered = byThin.filter(x => x.count > 0).slice(0, 2);
      if (covered.length > 0) {
        warns.push(`Thinnest pipeline: ${covered.map(t => `${t.pos} (${t.count})`).join(', ')} — need more depth at these spots`);
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
      warnings.push(`No ${thinnest[0].pos} on the depth chart — position completely unaddressed`);
      if (thinnest[1]?.count === 0)
        warnings.push(`No ${thinnest[1].pos} either — two key spots with zero depth`);
      else if (thinnest[1])
        warnings.push(`Only ${thinnest[1].count} ${thinnest[1].pos} on the roster — needs more bodies`);
    } else {
      warnings.push(`Thinnest spots: ${thinnest.map(t => `${t.pos} (${t.count})`).join(', ')} — priority recruiting targets`);
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
      warnings.push(`${ws.name} leads at ${ws.pos} with ${ws.ovr} OVR — ${ws.ovr < 78 ? 'a clear weak point on the roster' : 'the lowest-rated starter, upgrade needed'}`);
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
        const str = urgentLosses.slice(0, 2).map(([pos, n]) => `${n > 1 ? n + ' ' : ''}${pos}`).join(', ');
        warnings.push(`Losing ${str} to graduation — depth chart will be critical next season`);
      } else {
        const topLoss = Object.entries(byPosSr).sort(([, a], [, b]) => b - a)[0];
        warnings.push(`${seniors.length} seniors graduating — ${topLoss[0]} loses the most`);
      }
    }

    return warnings.slice(0, 3);
  }, [currentDynasty, recruits]);

  // True freshmen only — no portal/transfer players
  const freshmanRecruits = useMemo(() => databaseRecruits.filter(r => !r.isPortal && !r.previousTeam), [databaseRecruits]);

  const VIEW_META = {
    home:      { title: 'Scout Staff Intelligence Engine', sub: 'Integrating field intelligence with structured positional data' },
    database:  { title: 'Recruiting Database', sub: 'True Freshmen Only' },
    thresholds:{ title: 'Threshold Lookup',  sub: 'Player Comparison Tool' },
    analysis:  { title: 'Program Outlook',    sub: 'Staff Recommendations' },
    counts:    { title: 'Player Count',      sub: 'Current Overview' },
  };
  const meta = VIEW_META[subView] || VIEW_META.home;

  const teamTheme = { teamColors, teamLogo };

  const goHome = () => setSubView('home')

  // Deep-link from a Daily Brief "Recruiting Plan" row straight to that
  // position's tab in Program Outlook.
  const [analysisJumpPos, setAnalysisJumpPos] = useState(null);
  const goToAnalysisPosition = (pos) => {
    setAnalysisJumpPos({ pos, ts: Date.now() });
    setSubView('analysis');
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
    setSubView('analysis');
  };

  // ScoutAnalysis is always mounted (see below), so it's the single source of
  // truth for posExtraTargets — rather than duplicating that state here, it
  // hands its own adjustExtraTargets function up through this ref once
  // mounted, and this stable wrapper is what Daily Brief calls to decrement a
  // generic "1 HS"/"1 Portal" pill straight from the Recruiting Plan, exactly
  // as if the coach had clicked the "−" stepper inside Program Outlook itself.
  const analysisActionsRef = useRef({});
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
  // dynasty.players record — by sourceDynastyId, since the database also
  // shows recruits scouted in sibling dynasties — so every other surface
  // reading that player's data (board, thresholds, roster) picks it up too.
  // Returns true on success, false on failure — callers use this to decide
  // whether it's safe to discard the edit form (never close/clear on failure,
  // so a failed save never costs the user their in-progress edit).
  const handleEditDatabasePlayer = async (updated) => {
    if (isViewOnly) return false;
    try {
      const targetDynastyId = updated.sourceDynastyId || dynastyId;
      const fields = {
        name: updated.name,
        position: updated.position,
        archetype: updated.archetype,
        devTrait: updated.devTrait,
        gemBust: updated.gemBust,
        stars: updated.stars,
        attributes: updated.attributes,
      };
      const targetDynasty = targetDynastyId === dynastyId
        ? currentDynasty
        : dynasties.find(d => String(d.id) === String(targetDynastyId));
      if (!targetDynasty) {
        toast.error('Could not save — that dynasty could not be found. Your edit was not saved.');
        return false;
      }
      const players = targetDynastyId === dynastyId ? (currentDynasty?.players || []) : await getDynastyPlayers(targetDynasty);
      const original = players.find(p => p.pid === updated.pid);
      if (!original) {
        toast.error('Could not save — that prospect could not be found. Your edit was not saved.');
        return false;
      }
      await updatePlayer(targetDynastyId, { ...original, ...fields });
      if (targetDynastyId !== dynastyId) {
        getSiblingScoutedPlayers(currentDynasty, dynasties, getDynastyPlayers).then(setSiblingPlayers);
      }
      return true;
    } catch (err) {
      console.error('Failed to save prospect edit:', err);
      toast.error('Failed to save your edit. Please try again — if this keeps happening, export your dynasty as a backup.');
      return false;
    }
  };

  return (
    <div className="w-full space-y-4">
      {subView === 'home' && <FrontPage setView={setSubView} onViewDatabase={openDatabase} onJumpToPosition={goToAnalysisPosition} onGoToAnalysisOverview={goToAnalysisOverview} onRemoveFromBoard={isViewOnly ? null : handleToggleBoardRemoved} onAdjustTarget={isViewOnly ? null : adjustExtraTargetsFromBrief} currentTeamName={currentDynasty?.teamName || 'college football team'} currentYear={currentDynasty?.currentYear || new Date().getFullYear()} coachName={currentDynasty?.coachName || ''} recruits={recruits} databaseRecruits={freshmanRecruits} rosterWarnings={rosterWarnings} rosterSummary={rosterSummary} outlookSummary={outlookSummary || cachedOutlookSummary} committedRecruits={committedRecruits} dynastyId={dynastyId} {...teamTheme} />}

      {/* Read-only: mirrors the recruiting Targets sheet. Freshmen and portal targets are split.
          Uses the unfiltered list so a target removed from the board still shows up here. */}
      {subView === 'database'   && <PlayerDatabase players={freshmanRecruits} roleContext="National Scout" dynastyId={dynastyId} {...teamTheme} onEdit={isViewOnly ? null : handleEditDatabasePlayer} onGoToThresholds={() => setSubView('thresholds')} onBack={goHome} highlightPid={highlightPid} />}
      {subView === 'thresholds' && <ThresholdLookup players={thresholdRecruits} roleContext="Data Analyst" dynastyId={dynastyId} {...teamTheme} onGoToDatabase={() => { setDbHighlightPid(null); setSubView('database'); }} onBack={goHome} />}
      {subView === 'counts'     && <PlayerCount onBack={goHome} onGoToDatabase={() => { setDbHighlightPid(null); setSubView('database'); }} />}

      {/* Always mounted so allHubs recomputes live whenever recruits or roster data changes.
          Hidden when not on the analysis view — UI is invisible but computation runs.
          Uses boardRecruits so removed targets are no longer discussed in Program Outlook. */}
      <div className={subView === 'analysis' ? '' : 'hidden'}>
        <ScoutAnalysis players={boardRecruits} removedRecruits={removedBoardRecruits} onToggleBoardRemoved={isViewOnly ? null : handleToggleBoardRemoved} roleContext="Data Analyst" {...teamTheme} dynasty={currentDynasty} committedRecruits={committedRecruits} onBack={goHome} onOutlookReady={data => { setOutlookSummary(data); }} jumpToPos={analysisJumpPos} resetToOverviewKey={analysisResetKey} actionsRef={analysisActionsRef} />
      </div>
    </div>
  );
}