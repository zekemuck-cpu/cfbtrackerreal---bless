import React, { useEffect, useMemo, useState } from 'react';
import { useDynasty } from '../context/DynastyContext';
import { positionBucket } from '../utils/recruitAttributes';
import { normalizeArch } from './archetypeWeights';
import { ARCHETYPE_REGISTRY } from '../data/configData';
import { getSiblingScoutedPlayers } from '../utils/sharedRecruitingDb';
import { useCurrentTeamColors } from '../hooks/useTeamColors';
import { createStaffAccessor } from './staffDB';

const POS_ORDER = ['QB','HB','WR','TE','OT','OG','C','DE','DT','OLB','MIKE','CB','FS','SS','ATH'];

const STAR_CONFIG = [
  { key: '5' },
  { key: '4' },
  { key: '3' },
  { key: '2' },
  { key: '1' },
];

// Full canonical archetype list keyed by bucketed position
const ARCHETYPES_BY_POS = {};
ARCHETYPE_REGISTRY.forEach(({ position, archetype }) => {
  if (!ARCHETYPES_BY_POS[position]) ARCHETYPES_BY_POS[position] = [];
  ARCHETYPES_BY_POS[position].push(archetype);
});

export default function PlayerCount({ onBack, onGoToDatabase }) {
  const { currentDynasty, dynasties, getDynastyPlayers } = useDynasty();
  const [selectedPos, setSelectedPos] = useState(null);
  const [selectedStar, setSelectedStar] = useState('5');
  const [siblingPlayers, setSiblingPlayers] = useState([]);

  const teamColors = useCurrentTeamColors(currentDynasty);
  const positionBar = teamColors.primary;

  const [scoutImg, setScoutImg] = useState('');
  const [scoutName, setScoutName] = useState('National Scout');

  useEffect(() => {
    const { getStaffData } = createStaffAccessor(currentDynasty?.id ?? null);
    async function loadScout() {
      const img  = await getStaffData('scout_img');
      const name = await getStaffData('scout_name');
      if (img)  setScoutImg(img);
      if (name) setScoutName(name);
    }
    loadScout();
  }, [currentDynasty?.id]);

  const isolated = !!currentDynasty?.recruitingDbIsolated;

  // Stable key so the sibling fetch only reruns when dynasty membership or
  // isolation flags actually change, not on every unrelated context re-render.
  const dynastiesKey = useMemo(
    () => (dynasties || []).map(d => `${d.id}:${d.recruitingDbIsolated ? 1 : 0}`).join('|'),
    [dynasties]
  );

  // getSiblingScoutedPlayers is async (reads every sibling dynasty), so on
  // every mount this page would show counts computed from just this dynasty's
  // own recruits, then jump a moment later once siblings load in — the same
  // flash-of-wrong-data issue fixed on the Daily Brief. Seed from the last
  // confirmed-correct sibling list (localStorage, synchronous) instead of an
  // empty array while the real fetch is in flight.
  const cachedSiblingPlayers = useMemo(() => {
    if (!currentDynasty?.id) return [];
    try {
      const raw = localStorage.getItem(`cfb_sibling_players_${currentDynasty.id}`);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }, [currentDynasty?.id]);

  useEffect(() => {
    let alive = true;
    getSiblingScoutedPlayers(currentDynasty, dynasties, getDynastyPlayers).then(list => {
      if (!alive) return;
      setSiblingPlayers(list);
      if (currentDynasty?.id) {
        try { localStorage.setItem(`cfb_sibling_players_${currentDynasty.id}`, JSON.stringify(list)); } catch {}
      }
    });
    return () => { alive = false };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentDynasty?.id, isolated, dynastiesKey]);

  const effectiveSiblingPlayers = siblingPlayers.length ? siblingPlayers : cachedSiblingPlayers;

  // HS recruits only (matches Recruiting Database) — portal/transfer targets are a
  // different evaluation context and shouldn't skew freshman class counts.
  const allRecruits = useMemo(() => {
    const own = currentDynasty?.players || [];
    const pool = isolated ? own : [...own, ...effectiveSiblingPlayers];
    return pool.filter(p => p.isTarget && p.name && !p.isPortal && !p.previousTeam);
  }, [currentDynasty?.players, effectiveSiblingPlayers, isolated]);

  const total = allRecruits.length;

  const byStars = useMemo(() => {
    const counts = { '5': 0, '4': 0, '3': 0, '2': 0, '1': 0 };
    allRecruits.forEach(r => {
      const s = String(r.stars ?? '');
      if (s in counts) counts[s]++;
    });
    return counts;
  }, [allRecruits]);

  // Star-tier counts scoped to each position — drives the star pill counts
  // in Archetypes by Position, which should reflect only the active position's
  // recruits, not the database-wide totals in `byStars`.
  const starCountsByPos = useMemo(() => {
    const result = {};
    allRecruits.forEach(r => {
      const pos = positionBucket(r.position) || r.position || 'Other';
      const s = String(r.stars ?? '');
      if (!result[pos]) result[pos] = { '5': 0, '4': 0, '3': 0, '2': 0, '1': 0 };
      if (s in result[pos]) result[pos][s]++;
    });
    return result;
  }, [allRecruits]);

  const byPosition = useMemo(() => {
    const counts = {};
    POS_ORDER.forEach(pos => { counts[pos] = 0; });
    allRecruits.forEach(r => {
      const pos = positionBucket(r.position) || r.position || 'Other';
      counts[pos] = (counts[pos] || 0) + 1;
    });
    const known = POS_ORDER.map(pos => [pos, counts[pos]]);
    const extra = Object.entries(counts)
      .filter(([pos, count]) => !POS_ORDER.includes(pos) && count > 0)
      .sort((a, b) => b[1] - a[1]);
    return [...known, ...extra];
  }, [allRecruits]);

  // Normalized archetype counts keyed by bucketed position
  const archCountsByPos = useMemo(() => {
    const result = {};
    allRecruits.forEach(r => {
      const pos  = positionBucket(r.position) || r.position || 'Other';
      const norm = normalizeArch(r.archetype?.trim() || '');
      if (!norm) return;
      if (!result[pos]) result[pos] = {};
      result[pos][norm] = (result[pos][norm] || 0) + 1;
    });
    return result;
  }, [allRecruits]);

  // Same shape as archCountsByPos, but scoped to the selected star tier —
  // drives the Archetypes by Position breakdown only, so the position tabs
  // above it keep showing overall totals regardless of the star filter.
  const archCountsByPosStar = useMemo(() => {
    const result = {};
    allRecruits.forEach(r => {
      if (String(r.stars ?? '') !== selectedStar) return;
      const pos  = positionBucket(r.position) || r.position || 'Other';
      const norm = normalizeArch(r.archetype?.trim() || '');
      if (!norm) return;
      if (!result[pos]) result[pos] = {};
      result[pos][norm] = (result[pos][norm] || 0) + 1;
    });
    return result;
  }, [allRecruits, selectedStar]);

  // Only positions with a defined archetype list get a tab
  const archPositions = byPosition.filter(([pos]) => ARCHETYPES_BY_POS[pos]?.length);
  const activePos = (selectedPos && archPositions.some(([pos]) => pos === selectedPos))
    ? selectedPos
    : archPositions[0]?.[0];

  return (
    <div className="space-y-5">

      {/* Header strip */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-surface-2 border border-surface-4">
        <h2 className="text-sm font-display font-bold uppercase text-txt-primary">Player Count</h2>
        <div className="flex items-center gap-3 flex-shrink-0">
          {onBack && (
            <button onClick={onBack} className="flex items-center gap-1.5 text-xs font-display font-bold uppercase text-txt-secondary hover:text-txt-primary transition px-3 py-1.5 rounded-lg border border-surface-4 hover:bg-surface-3">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3"><polyline points="15 18 9 12 15 6"/></svg>
              Main Hub
            </button>
          )}
          {onGoToDatabase && (
            <button onClick={onGoToDatabase} className="flex items-center gap-1.5 text-xs font-display font-bold uppercase text-txt-secondary hover:text-txt-primary transition px-3 py-1.5 rounded-lg border border-surface-4 hover:bg-surface-3">
              Recruiting Database
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
          )}
        </div>
      </div>

      {/* Scout portrait + info row */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch">

        {/* Scout portrait card */}
        <div className="relative rounded-xl overflow-hidden shadow-xl w-full h-32 sm:w-[110px] sm:h-[100px] sm:flex-shrink-0">
          {scoutImg ? (
            <img src={scoutImg} alt="National Scout" className="absolute inset-0 w-full h-full object-cover object-top" />
          ) : (
            <div className="absolute inset-0 bg-surface-3" />
          )}
          <div className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,0) 82%, rgba(0,0,0,0.85) 90%, rgba(0,0,0,0.95) 100%)' }} />
          <div className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(to bottom, transparent 85%, #38bdf855 100%)' }} />
          <p className="absolute top-2 right-2 text-[5px] font-black uppercase tracking-[0.12em] text-sky-400" style={{ textShadow: '0 1px 6px rgba(0,0,0,1)' }}>National Scout</p>
          <div className="absolute bottom-0 left-0 right-0 p-2">
            <div className="w-4 h-0.5 mb-1 rounded-full bg-sky-400" />
            {(() => {
              const parts = scoutName.trim().split(' ');
              const last = parts.pop() || '';
              const first = parts.join(' ');
              return (
                <>
                  {first && <p className="leading-none text-[6px] font-semibold uppercase tracking-wide" style={{ color: 'rgba(255,255,255,0.7)', textShadow: '0 1px 6px rgba(0,0,0,1)' }}>{first}</p>}
                  <p className="text-white leading-none font-bold text-xs" style={{ textShadow: '0 2px 10px rgba(0,0,0,1)' }}>{last}</p>
                </>
              );
            })()}
          </div>
        </div>

        {/* Info card */}
        <div className="flex-1 min-w-0 rounded-xl p-3 flex flex-col justify-center gap-1.5 bg-surface-2 border border-surface-4 sm:h-[100px]">
          <p className="text-base font-semibold text-txt-primary">Player Count</p>
          <p className="text-xs text-txt-tertiary leading-snug">
            {total > 0 ? `${total} recruits in the database across all seasons` : 'No recruits in the database yet'}
          </p>
        </div>
      </div>

      {total === 0 ? (
        <div className="rounded-xl bg-surface-2 border border-surface-4 p-10 text-center">
          <p className="text-sm text-txt-tertiary italic">Add recruiting targets to build the database.</p>
        </div>
      ) : (
        <>
          {/* Star tier breakdown */}
          <div className="grid grid-cols-5 gap-2">
            {STAR_CONFIG.map(({ key }) => {
              const count = byStars[key];
              const pct   = total > 0 ? ((count / total) * 100).toFixed(0) : 0;
              return (
                <div key={key} className="bg-surface-2 border border-surface-4 rounded-xl p-3 flex items-center justify-between gap-2">
                  <div className="flex flex-col gap-1.5">
                    <p className="text-xl font-display font-black text-txt-secondary leading-none">{key}★</p>
                    <p className="text-[9px] font-display font-bold tabular-nums text-txt-tertiary">{pct}%</p>
                  </div>
                  <p className="text-4xl font-display font-black tabular-nums leading-none text-txt-primary">{count}</p>
                </div>
              );
            })}
          </div>

          {/* Position breakdown */}
          <div className="rounded-xl bg-surface-2 border border-surface-4 overflow-hidden">
            <div className="px-4 py-2.5 border-b border-surface-4">
              <p className="text-[10px] font-display font-black uppercase tracking-[0.12em] text-txt-tertiary">By Position</p>
            </div>
            <div className="p-4 grid grid-cols-2 sm:grid-cols-3 gap-x-8 gap-y-3.5">
              {byPosition.map(([pos, count]) => (
                <div key={pos} className="flex items-center gap-2.5">
                  <span className="text-[13px] font-display font-black uppercase w-10 shrink-0 text-txt-secondary">{pos}</span>
                  <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                    {count > 0 && (
                      <div className="h-full rounded-full" style={{ width: `${(count / total) * 100}%`, background: positionBar }} />
                    )}
                  </div>
                  <span className="text-[13px] font-display font-bold tabular-nums text-txt-tertiary w-5 text-right shrink-0">{count}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Archetypes by position — pick a position via tabs, all its archetypes shown, 0-count = empty bar */}
          <div className="rounded-xl bg-surface-2 border border-surface-4 overflow-hidden">
            <div className="px-4 py-2.5 border-b border-surface-4">
              <p className="text-[10px] font-display font-black uppercase tracking-[0.12em] text-txt-tertiary">Archetypes by Position</p>
            </div>
            <div className="px-4 pt-3 flex flex-wrap gap-1.5">
              {archPositions.map(([pos, posTotal]) => (
                <button
                  key={pos}
                  type="button"
                  onClick={() => setSelectedPos(pos)}
                  className={`px-3 py-1.5 rounded-lg text-[12px] font-display font-black uppercase transition ${
                    pos === activePos
                      ? 'bg-surface-4 text-txt-primary'
                      : 'text-txt-tertiary hover:text-txt-secondary hover:bg-surface-3'
                  }`}
                >
                  {pos} <span className="opacity-60">{posTotal}</span>
                </button>
              ))}
            </div>
            {/* Offset so the first star pill starts at the QB pill's horizontal
                midpoint above it, instead of flush with the position row. */}
            <div className="pr-4 pt-2 flex flex-wrap gap-1.5" style={{ paddingLeft: '43px' }}>
              {STAR_CONFIG.map(({ key }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSelectedStar(key)}
                  className={`px-2.5 py-1 rounded-md text-[10px] font-display font-black transition ${
                    key === selectedStar
                      ? 'bg-surface-4 text-txt-primary'
                      : 'text-txt-tertiary hover:text-txt-secondary hover:bg-surface-3'
                  }`}
                >
                  {key}★ <span className="opacity-60">{starCountsByPos[activePos]?.[key] ?? 0}</span>
                </button>
              ))}
            </div>
            {activePos && (() => {
              const registryArchs = ARCHETYPES_BY_POS[activePos];
              const normCounts = archCountsByPosStar[activePos] || {};
              const normTotals = archCountsByPos[activePos] || {};
              return (
                <div className="p-4 space-y-2.5">
                  {registryArchs.map(arch => {
                    const displayName = normalizeArch(arch);
                    const count = normCounts[normalizeArch(arch)] || 0;
                    const archTotal = normTotals[normalizeArch(arch)] || 0;
                    return (
                      <div key={arch} className="flex items-center gap-2.5">
                        <span className="text-[13px] w-44 shrink-0 truncate" style={{ color: count > 0 ? 'var(--txt-secondary)' : 'var(--txt-tertiary)' }}>{displayName}</span>
                        <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                          {count > 0 && archTotal > 0 && (
                            <div className="h-full rounded-full" style={{ width: `${(count / archTotal) * 100}%`, background: positionBar }} />
                          )}
                        </div>
                        <span className="text-[13px] font-display font-bold tabular-nums w-5 text-right shrink-0" style={{ color: count > 0 ? 'var(--txt-tertiary)' : 'rgba(100,116,139,0.35)' }}>{count}</span>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        </>
      )}
    </div>
  );
}
