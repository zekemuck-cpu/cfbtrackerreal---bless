import React, { useState, useMemo, useEffect } from 'react';
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


export default function ScoutStaff({ year } = {}) {
  const { currentDynasty } = useDynasty();
  const teamColors = useTeamColors(currentDynasty?.teamName, currentDynasty?.teams);
  const teamLogo   = currentDynasty?.teams?.[currentDynasty?.currentTid]?.logo || '';
  const [subView, setSubView] = useState('home');
  const [outlookSummary, setOutlookSummary] = useState(null);
  const dynastyId = currentDynasty?.id ?? null;

  useEffect(() => {
    if (!dynastyId) return;
    const { getStaffData } = createStaffAccessor(dynastyId);
    getStaffData('analysis_outlook_summary').then(raw => {
      if (raw) try { setOutlookSummary(JSON.parse(raw)); } catch {}
    });
  }, [dynastyId]);

  // The recruit board IS the recruiting Targets board — a single shared source.
  // Targets entered via the recruiting sheet (dynasty.players, isTarget) flow
  // straight into Scout Staff; attributes are already stored under the same
  // canonical names the grading engine expects (see utils/recruitAttributes.js).
  // We only normalize the raw game position to its grading bucket (RT → OT).
  const boardYear = Number(year ?? currentDynasty?.currentYear);
  const recruits = useMemo(() => {
    const players = currentDynasty?.players || [];
    return players
      .map((pl, originalIndex) => ({ pl, originalIndex }))
      .filter(({ pl }) => pl?.isTarget && Number(pl.targetYear) === boardYear && pl.name)
      .map(({ pl, originalIndex }) => {
        const position = positionBucket(pl.position);
        const group = position === 'ATH'
          ? 'Athlete Pipeline'
          : ['QB', 'HB', 'WR', 'TE', 'OT', 'OG', 'C'].includes(position) ? 'Offense' : 'Defense';
        return {
          pid: pl.pid,
          name: pl.name,
          position,
          archetype: pl.archetype || '',
          devTrait: pl.devTrait || '',
          stars: pl.stars,
          attributes: pl.attributes || {},
          group,
          isPortal: pl.isPortal,
          previousTeam: pl.previousTeam,
          nationalRank: pl.nationalRank,
          positionRank: pl.positionRank,
          addedIndex: originalIndex,
        };
      });
  }, [currentDynasty?.players, boardYear]);

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
  const freshmanRecruits = useMemo(() => recruits.filter(r => !r.isPortal && !r.previousTeam), [recruits]);
  // Portal/transfer targets — any recruit flagged as portal or carrying a previous team
  const portalRecruits = useMemo(() => recruits.filter(r => r.isPortal || r.previousTeam), [recruits]);

  const VIEW_META = {
    home:      { title: 'Scout Staff Intelligence Engine', sub: 'Integrating field intelligence with structured positional data' },
    database:  { title: 'Recruiting Database', sub: 'True Freshmen Only' },
    thresholds:{ title: 'Threshold Lookup',  sub: 'Player Comparison Tool' },
    analysis:  { title: 'Program Outlook',    sub: 'Staff Recommendations' },
    counts:    { title: 'Player Count',      sub: 'Current Overview' },
    portal:    { title: 'Portal Board',      sub: 'Transfer targets' },
  };
  const meta = VIEW_META[subView] || VIEW_META.home;

  const teamTheme = { teamColors, teamLogo };

  const goHome = () => setSubView('home')

  return (
    <div className="w-full space-y-4">
      {subView === 'home' && <FrontPage setView={setSubView} currentTeamName={currentDynasty?.teamName || 'college football team'} currentYear={currentDynasty?.currentYear || new Date().getFullYear()} coachName={currentDynasty?.coachName || ''} recruits={recruits} rosterWarnings={rosterWarnings} rosterSummary={rosterSummary} outlookSummary={outlookSummary} dynastyId={dynastyId} {...teamTheme} />}

      {/* Read-only: mirrors the recruiting Targets sheet. Freshmen and portal targets are split. */}
      {subView === 'database'   && <PlayerDatabase players={freshmanRecruits} roleContext="National Scout" dynastyId={dynastyId} {...teamTheme} onGoToThresholds={() => setSubView('thresholds')} onBack={goHome} />}
      {subView === 'thresholds' && <ThresholdLookup players={recruits} roleContext="Data Analyst" dynastyId={dynastyId} {...teamTheme} onGoToDatabase={() => setSubView('database')} onBack={goHome} />}
      {subView === 'counts'     && <PlayerCount players={recruits} roleContext="National Scout" {...teamTheme} committedRecruits={committedRecruits} currentYear={currentDynasty?.currentYear} onBack={goHome} />}
      {subView === 'portal'     && <PlayerDatabase players={portalRecruits} roleContext="National Scout" portalMode dynastyId={dynastyId} {...teamTheme} onGoToThresholds={() => setSubView('thresholds')} onBack={goHome} />}

      {/* Always mounted so allHubs recomputes live whenever recruits or roster data changes.
          Hidden when not on the analysis view — UI is invisible but computation runs. */}
      <div className={subView === 'analysis' ? '' : 'hidden'}>
        <ScoutAnalysis players={recruits} roleContext="Data Analyst" {...teamTheme} dynasty={currentDynasty} committedRecruits={committedRecruits} onBack={goHome} onOutlookReady={data => { setOutlookSummary(data); }} />
      </div>
    </div>
  );
}