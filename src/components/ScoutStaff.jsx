import React, { useState, useMemo } from 'react';
import FrontPage from './ScoutStaffFrontPage';
import PlayerDatabase from './PlayerDatabase';
import ScoutAnalysis from './ScoutAnalysis';
import ThresholdLookup from './ThresholdLookup';
import PlayerCount from './PlayerCount';
import { useDynasty, getRecruitingCommitments, getCurrentRoster, getPlayerClassForYear } from '../context/DynastyContext';
import { flattenClassCommitments } from '../utils/recruitingScore';
import { positionBucket } from '../utils/recruitAttributes';
import { useTeamColors } from '../hooks/useTeamColors';

// ── Portal Board sub-view ─────────────────────────────────────────────────────
function PortalBoard({ committedRecruits, onBack }) {
  const portalPlayers = (committedRecruits || []).filter(r => r.isPortal || r.previousTeam);

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      {/* Header strip */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-surface-2 border border-surface-4">
        <div className="flex items-center gap-3 min-w-0">
          <p className="text-sm font-display font-bold uppercase text-txt-primary">Transfer Portal Board</p>
          <span className="text-xs text-txt-tertiary">
            {portalPlayers.length} Transfer{portalPlayers.length !== 1 ? 's' : ''}
          </span>
        </div>
        {onBack && (
          <button onClick={onBack} className="text-xs font-display font-bold uppercase text-txt-secondary hover:text-txt-primary transition px-3 py-1.5 rounded-lg border border-surface-4 hover:bg-surface-3 flex-shrink-0">
            ← Main Hub
          </button>
        )}
      </div>

      {portalPlayers.length === 0 ? (
        <div className="rounded-xl p-8 text-center bg-surface-2 border border-surface-4">
          <p className="text-sm text-txt-secondary">No portal players in this year&apos;s class.</p>
          <p className="text-xs text-txt-tertiary mt-1">Portal commits are added via the Recruiting page. They appear here automatically once saved.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {portalPlayers.map((player, i) => {
            const stars = Number(player.stars) || 0;
            const devCls = {
              Elite: 'bg-amber-950 border-amber-700 text-amber-400',
              Star:  'bg-sky-950 border-sky-700 text-sky-400',
              Impact:'bg-emerald-950 border-emerald-700 text-emerald-400',
            }[player.devTrait] || 'bg-surface-4 border-surface-5 text-txt-tertiary';

            return (
              <div key={player.pid || player.name || i}
                className="p-3 rounded-xl space-y-2 bg-surface-2 border border-surface-4"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-txt-primary truncate">{player.name || 'Unknown'}</p>
                    <p className="text-[9px] font-bold uppercase tracking-wider text-txt-tertiary">{player.position || '—'} · {player.archetype || '—'}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className="flex gap-0.5">
                      {[...Array(5)].map((_, si) => (
                        <svg key={si} className="w-2.5 h-2.5" fill={si < stars ? '#f59e0b' : '#334155'} viewBox="0 0 20 20">
                          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                        </svg>
                      ))}
                    </span>
                    {player.devTrait && (
                      <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded border ${devCls}`}>{player.devTrait}</span>
                    )}
                  </div>
                </div>

                {player.previousTeam && (
                  <div className="flex items-center gap-1.5 text-[9px] text-txt-tertiary">
                    <span className="font-bold uppercase tracking-wider text-sky-500">FROM</span>
                    <span className="text-txt-secondary truncate">{player.previousTeam}</span>
                  </div>
                )}

                {(player.nationalRank || player.positionRank) && (
                  <div className="flex gap-3 text-[9px] text-txt-tertiary">
                    {player.nationalRank && <span>Natl <span className="text-txt-primary font-bold">#{player.nationalRank}</span></span>}
                    {player.positionRank && <span>{player.position} <span className="text-txt-primary font-bold">#{player.positionRank}</span></span>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function ScoutStaff({ year } = {}) {
  const { currentDynasty } = useDynasty();
  const teamColors = useTeamColors(currentDynasty?.teamName, currentDynasty?.teams);
  const teamLogo   = currentDynasty?.teams?.[currentDynasty?.currentTid]?.logo || '';
  const [subView, setSubView] = useState('home');

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

  const VIEW_META = {
    home:      { title: 'Scout Staff Intelligence Engine', sub: 'Integrating field intelligence with structured positional data' },
    database:  { title: 'Player Database',   sub: 'Complete Data Storage' },
    thresholds:{ title: 'Threshold Lookup',  sub: 'Player Comparison Tool' },
    analysis:  { title: 'Data Analysis',     sub: 'Staff Recommendations' },
    counts:    { title: 'Player Count',      sub: 'Current Overview' },
    portal:    { title: 'Portal Board',      sub: 'Transfer portal commitments' },
  };
  const meta = VIEW_META[subView] || VIEW_META.home;

  const teamTheme = { teamColors, teamLogo };

  const goHome = () => setSubView('home')

  return (
    <div className="w-full space-y-4">
      {subView === 'home' && <FrontPage setView={setSubView} currentTeamName={currentDynasty?.teamName || 'college football team'} currentYear={currentDynasty?.currentYear || new Date().getFullYear()} coachName={currentDynasty?.coachName || ''} recruits={recruits} rosterWarnings={rosterWarnings} {...teamTheme} />}

      {/* Read-only: the board mirrors the recruiting Targets sheet. Add or edit
          recruits there (the same place the default Targets tab uses). */}
      {subView === 'database'   && <PlayerDatabase players={recruits} roleContext="Regional Scout" {...teamTheme} onGoToThresholds={() => setSubView('thresholds')} onBack={goHome} />}
      {subView === 'thresholds' && <ThresholdLookup players={recruits} roleContext="Data Analyst" {...teamTheme} onGoToDatabase={() => setSubView('database')} onBack={goHome} />}
      {subView === 'analysis'   && <ScoutAnalysis players={recruits} roleContext="Data Analyst" {...teamTheme} dynasty={currentDynasty} committedRecruits={committedRecruits} onBack={goHome} />}
      {subView === 'counts'     && <PlayerCount players={recruits} roleContext="Regional Scout" {...teamTheme} committedRecruits={committedRecruits} currentYear={currentDynasty?.currentYear} onBack={goHome} />}
      {subView === 'portal'     && <PortalBoard committedRecruits={committedRecruits} onBack={goHome} />}
    </div>
  );
}