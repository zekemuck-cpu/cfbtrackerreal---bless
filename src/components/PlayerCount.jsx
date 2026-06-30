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
  { key: '5', label: 'Five Star',  gradient: 'from-amber-500/20',  border: 'border-amber-500/30',  color: '#fbbf24' },
  { key: '4', label: 'Four Star',  gradient: 'from-slate-300/10',  border: 'border-slate-600/40',  color: '#cbd5e1' },
  { key: '3', label: 'Three Star', gradient: 'from-orange-600/10', border: 'border-orange-900/40', color: '#fb923c' },
  { key: '2', label: 'Two Star',   gradient: 'from-teal-600/10',   border: 'border-teal-900/40',   color: '#2dd4bf' },
  { key: '1', label: 'One Star',   gradient: 'from-slate-700/20',  border: 'border-slate-800',     color: '#64748b' },
];

// Full canonical archetype list keyed by bucketed position
const ARCHETYPES_BY_POS = {};
ARCHETYPE_REGISTRY.forEach(({ position, archetype }) => {
  if (!ARCHETYPES_BY_POS[position]) ARCHETYPES_BY_POS[position] = [];
  ARCHETYPES_BY_POS[position].push(archetype);
});

export default function PlayerCount({ onBack }) {
  const { currentDynasty, dynasties, getDynastyPlayers, updateDynasty, isViewOnly } = useDynasty();
  const [selectedPos, setSelectedPos] = useState(null);
  const [siblingPlayers, setSiblingPlayers] = useState([]);

  const teamColors = useCurrentTeamColors(currentDynasty);
  const positionBar = `linear-gradient(90deg, ${teamColors.primary}, ${teamColors.secondary})`;

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

  useEffect(() => {
    let alive = true;
    getSiblingScoutedPlayers(currentDynasty, dynasties, getDynastyPlayers).then(list => {
      if (alive) setSiblingPlayers(list);
    });
    return () => { alive = false };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentDynasty?.id, isolated, dynastiesKey]);

  // HS recruits only (matches Recruiting Database) — portal/transfer targets are a
  // different evaluation context and shouldn't skew freshman class counts.
  const allRecruits = useMemo(() => {
    const own = currentDynasty?.players || [];
    const pool = isolated ? own : [...own, ...siblingPlayers];
    return pool.filter(p => p.isTarget && p.name && !p.isPortal && !p.previousTeam);
  }, [currentDynasty?.players, siblingPlayers, isolated]);

  const handleToggleIsolated = () => {
    if (!currentDynasty || isViewOnly) return;
    updateDynasty(currentDynasty.id, { recruitingDbIsolated: !isolated });
  };

  const total = allRecruits.length;

  const byStars = useMemo(() => {
    const counts = { '5': 0, '4': 0, '3': 0, '2': 0, '1': 0 };
    allRecruits.forEach(r => {
      const s = String(r.stars ?? '');
      if (s in counts) counts[s]++;
    });
    return counts;
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

  const maxPos = Math.max(...byPosition.map(([, c]) => c), 1);

  // Only positions with a defined archetype list get a tab
  const archPositions = byPosition.filter(([pos]) => ARCHETYPES_BY_POS[pos]?.length);
  const activePos = (selectedPos && archPositions.some(([pos]) => pos === selectedPos))
    ? selectedPos
    : archPositions[0]?.[0];

  return (
    <div className="space-y-5">

      {/* Scout identity + header row */}
      <div className="flex flex-col sm:flex-row gap-3 items-start">

        {/* Scout portrait card */}
        <div className="relative rounded-xl overflow-hidden shadow-xl w-full h-32 sm:w-[110px] sm:h-[130px] sm:flex-shrink-0">
          {scoutImg ? (
            <img src={scoutImg} alt="National Scout" className="absolute inset-0 w-full h-full object-cover object-top" />
          ) : (
            <div className="absolute inset-0 bg-surface-3" />
          )}
          <div className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,0.15) 40%, rgba(0,0,0,0.82) 68%, rgba(0,0,0,0.92) 100%)' }} />
          <div className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(to bottom, transparent 45%, #38bdf855 100%)' }} />
          <div className="absolute bottom-0 left-0 right-0 p-2">
            <div className="w-4 h-0.5 mb-1 rounded-full bg-sky-400" />
            {(() => {
              const parts = scoutName.trim().split(' ');
              const last = parts.pop() || '';
              const first = parts.join(' ');
              return (
                <>
                  {first && <p className="leading-none text-[7px] font-semibold uppercase tracking-wide" style={{ color: 'rgba(255,255,255,0.7)', textShadow: '0 1px 6px rgba(0,0,0,1)' }}>{first}</p>}
                  <p className="text-white leading-none font-bold text-base" style={{ textShadow: '0 2px 10px rgba(0,0,0,1)' }}>{last}</p>
                </>
              );
            })()}
            <p className="text-[6px] font-black uppercase tracking-[0.12em] mt-0.5 text-sky-400">National Scout</p>
            <p className="text-[8px] text-white/55 italic leading-snug mt-1" style={{ textShadow: '0 1px 6px rgba(0,0,0,1)' }}>
              {total} prospect{total !== 1 ? 's' : ''} on file
            </p>
          </div>
        </div>

        {/* Header */}
        <div className="flex-1 min-w-0 flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-surface-2 border border-surface-4 h-32 sm:h-[130px]">
          <div>
            <p className="text-sm font-display font-bold uppercase text-txt-primary">Recruiting Database</p>
            <p className="text-[10px] text-txt-tertiary mt-0.5">
              {total > 0 ? `${total} recruits in the database across all seasons` : 'No recruits in the database yet'}
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {!isViewOnly && (
              <label className="flex items-center gap-1.5 text-[10px] text-txt-tertiary hover:text-txt-secondary transition cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isolated}
                  onChange={handleToggleIsolated}
                  className="w-3 h-3 accent-current"
                />
                Start from scratch (this dynasty only)
              </label>
            )}
            {onBack && (
              <button onClick={onBack} className="text-xs font-display font-bold uppercase text-txt-secondary hover:text-txt-primary transition px-3 py-1.5 rounded-lg border border-surface-4 hover:bg-surface-3 shrink-0">
                Back
              </button>
            )}
          </div>
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
            {STAR_CONFIG.map(({ key, label, gradient, border, color }) => {
              const count = byStars[key];
              const pct   = total > 0 ? ((count / total) * 100).toFixed(0) : 0;
              return (
                <div key={key} className={`bg-gradient-to-b ${gradient} to-transparent ${border} border rounded-xl p-3 flex flex-col gap-1.5`}>
                  <p className="text-[8px] font-display font-black uppercase tracking-wide leading-tight" style={{ color: `${color}99` }}>{label}</p>
                  <p className="text-3xl font-display font-black tabular-nums leading-none" style={{ color }}>{count}</p>
                  <p className="text-[9px] font-display font-bold tabular-nums" style={{ color: `${color}55` }}>{pct}%</p>
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
                      <div className="h-full rounded-full" style={{ width: `${(count / maxPos) * 100}%`, background: positionBar }} />
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
            {activePos && (() => {
              const registryArchs = ARCHETYPES_BY_POS[activePos];
              const normCounts = archCountsByPos[activePos] || {};
              const maxCount = Math.max(...registryArchs.map(a => normCounts[normalizeArch(a)] || 0), 1);
              return (
                <div className="p-4 space-y-2.5">
                  {registryArchs.map(arch => {
                    const displayName = normalizeArch(arch);
                    const count = normCounts[normalizeArch(arch)] || 0;
                    return (
                      <div key={arch} className="flex items-center gap-2.5">
                        <span className="text-[13px] w-44 shrink-0 truncate" style={{ color: count > 0 ? 'var(--txt-secondary)' : 'var(--txt-tertiary)' }}>{displayName}</span>
                        <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                          {count > 0 && (
                            <div className="h-full rounded-full" style={{ width: `${(count / maxCount) * 100}%`, background: positionBar }} />
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
