import React, { useMemo } from 'react';
import { useDynasty } from '../context/DynastyContext';
import { positionBucket } from '../utils/recruitAttributes';
import { normalizeArch } from './archetypeWeights';
import { ARCHETYPE_REGISTRY } from '../data/configData';

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

export default function PlayerCount({ teamColors, onBack }) {
  const { currentDynasty } = useDynasty();
  const primary = teamColors?.primary || '#374151';

  const allRecruits = useMemo(() => {
    return (currentDynasty?.players || []).filter(p => p.isTarget && p.name);
  }, [currentDynasty?.players]);

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
    allRecruits.forEach(r => {
      const pos = positionBucket(r.position) || r.position || 'Other';
      counts[pos] = (counts[pos] || 0) + 1;
    });
    return Object.entries(counts).sort((a, b) => {
      const ai = POS_ORDER.indexOf(a[0]);
      const bi = POS_ORDER.indexOf(b[0]);
      if (ai !== -1 && bi !== -1) return ai - bi;
      if (ai !== -1) return -1;
      if (bi !== -1) return 1;
      return b[1] - a[1];
    });
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

  return (
    <div className="max-w-4xl mx-auto space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-surface-2 border border-surface-4">
        <div>
          <p className="text-sm font-display font-bold uppercase text-txt-primary">Scouting Database</p>
          <p className="text-[10px] text-txt-tertiary mt-0.5">
            {total > 0 ? `${total} recruits on file across all seasons` : 'No recruits on file yet'}
          </p>
        </div>
        {onBack && (
          <button onClick={onBack} className="text-xs font-display font-bold uppercase text-txt-secondary hover:text-txt-primary transition px-3 py-1.5 rounded-lg border border-surface-4 hover:bg-surface-3 shrink-0">
            Back
          </button>
        )}
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
              <p className="text-[8px] font-display font-black uppercase tracking-[0.12em] text-txt-tertiary">By Position</p>
            </div>
            <div className="p-4 grid grid-cols-2 sm:grid-cols-3 gap-x-8 gap-y-3">
              {byPosition.map(([pos, count]) => (
                <div key={pos} className="flex items-center gap-2.5">
                  <span className="text-[10px] font-display font-black uppercase w-9 shrink-0 text-txt-secondary">{pos}</span>
                  <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                    <div className="h-full rounded-full" style={{ width: `${(count / maxPos) * 100}%`, background: primary }} />
                  </div>
                  <span className="text-[10px] font-display font-bold tabular-nums text-txt-tertiary w-5 text-right shrink-0">{count}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Archetypes by position — all canonical archetypes shown, 0-count = empty bar */}
          <div className="rounded-xl bg-surface-2 border border-surface-4 overflow-hidden">
            <div className="px-4 py-2.5 border-b border-surface-4">
              <p className="text-[8px] font-display font-black uppercase tracking-[0.12em] text-txt-tertiary">Archetypes by Position</p>
            </div>
            <div className="p-4 grid sm:grid-cols-2 gap-x-10 gap-y-6">
              {byPosition.map(([pos, posTotal]) => {
                const registryArchs = ARCHETYPES_BY_POS[pos];
                if (!registryArchs?.length) return null;

                const normCounts = archCountsByPos[pos] || {};
                const maxCount = Math.max(...registryArchs.map(a => normCounts[normalizeArch(a)] || 0), 1);

                return (
                  <div key={pos}>
                    <div className="flex items-baseline gap-1.5 mb-2.5">
                      <span className="text-[11px] font-display font-black uppercase text-txt-primary">{pos}</span>
                      <span className="text-[9px] font-display text-txt-tertiary">{posTotal} total</span>
                    </div>
                    <div className="space-y-2">
                      {registryArchs.map(arch => {
                        const displayName = normalizeArch(arch);
                        const count = normCounts[normalizeArch(arch)] || 0;
                        return (
                          <div key={arch} className="flex items-center gap-2">
                            <span className="text-[9px] w-32 shrink-0 truncate" style={{ color: count > 0 ? 'var(--txt-secondary)' : 'var(--txt-tertiary)' }}>{displayName}</span>
                            <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                              {count > 0 && (
                                <div className="h-full rounded-full" style={{ width: `${(count / maxCount) * 100}%`, background: `${primary}bb` }} />
                              )}
                            </div>
                            <span className="text-[9px] font-display font-bold tabular-nums w-4 text-right shrink-0" style={{ color: count > 0 ? 'var(--txt-tertiary)' : 'rgba(100,116,139,0.35)' }}>{count}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
