import React, { useEffect, useMemo, useState } from 'react';
import { useDynasty } from '../context/DynastyContext';
import { positionBucket, recruitingPosLabel } from '../utils/recruitAttributes';
import { normalizeArch, isHiddenDev } from './archetypeWeights';
import { ARCHETYPE_REGISTRY } from '../data/configData';
import { DEV_TRAITS, buildRevealedPool, countBoundaries, gapToStrong } from '../utils/devTraitLearning';
import { useCurrentTeamColors } from '../hooks/useTeamColors';
import { createStaffAccessor } from './staffDB';

const POS_ORDER = ['QB','HB','WR','TE','OT','OG','C','DE','DT','OLB','MIKE','CB','FS','SS','ATH'];

// Display order (best-to-worst) for the dev-trait counts per archetype — order
// only affects rendering here, not the boundary math (countBoundaries/
// gapToStrong work off a Set, so ordering is irrelevant to them).
const LADDER_ORDER = ['Elite', 'Star', 'Impact', 'Normal'];

// Same per-trait color + glow as the dev trait pill in the Recruiting
// Database table (PlayerDatabase.jsx's DevTraitPill) — repeated here rather
// than imported since it's just presentational constants, matching how every
// other surface that shows dev-trait colors (ThresholdLookup.jsx,
// ScoutAnalysis.jsx, GemBustIcon.jsx) already keeps its own copy instead of
// sharing one module.
const TRAIT_COLORS = {
  Elite:  { border: '#0E7A2A', text: '#22E065', glow: '0 0 16px rgba(14,122,42,0.85)' },
  Star:   { border: '#9C7209', text: '#FFD100', glow: '0 0 14px rgba(156,114,9,0.8)' },
  Impact: { border: '#7C8991', text: '#D6DEE2', glow: 'none' },
  Normal: { border: '#8C5524', text: '#CD7F32', glow: 'none' },
};

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

export default function PlayerCount({ onSelectBucket = null } = {}) {
  const { currentDynasty } = useDynasty();
  const [selectedPos, setSelectedPos] = useState(null);
  const [selectedStar, setSelectedStar] = useState('5');

  const teamColors = useCurrentTeamColors(currentDynasty);
  const p = teamColors.primary;

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

  // HS recruits only (matches Recruiting Database) — portal/transfer targets are a
  // different evaluation context and shouldn't skew freshman class counts. Also
  // excludes anyone still Hidden/unrevealed — an unknown dev trait isn't a real
  // outcome yet, so it shouldn't skew these benchmarks either; it'll count itself
  // in automatically the moment its dev trait is filled in (see Update Dev Traits).
  // Folds in this dynasty's own recruitingDatabasePlayers extras — recruits
  // that were never a real Target but still belong in these counts once
  // their dev trait is known.
  const mergedRecruits = useMemo(() => {
    const excluded = new Set((currentDynasty?.recruitingDatabaseExcludedPids || []).map(String));
    const own = currentDynasty?.players || [];
    const targets = own.filter(p => p.isTarget && p.name && !p.isPortal && !p.previousTeam && !excluded.has(String(p.pid)));
    const seen = new Set(targets.map(p => `${p.pid}`));
    const extras = (currentDynasty?.recruitingDatabasePlayers || []).filter(p => p.name && !p.isPortal && !p.previousTeam && !seen.has(`${p.pid}`) && !excluded.has(String(p.pid)));
    return [...targets, ...extras];
  }, [currentDynasty]);

  const allRecruits = useMemo(
    () => mergedRecruits.filter(p => !isHiddenDev(p.devTrait)),
    [mergedRecruits]
  );

  // Same revealed pool Threshold Lookup builds off — feeds the confidence-gap
  // badge below (how many more scouted recruits until this bucket is
  // "Strong"), so the badge can never disagree with what Thresholds itself
  // would show for the same position/archetype/star.
  const pool = useMemo(() => buildRevealedPool(mergedRecruits), [mergedRecruits]);

  const total = allRecruits.length;

  // Star-tier counts scoped to each position — drives the star pill counts
  // in Archetypes by Position.
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

  // Only positions with a defined archetype list get a tab
  const archPositions = byPosition.filter(([pos]) => ARCHETYPES_BY_POS[pos]?.length);
  const activePos = (selectedPos && archPositions.some(([pos]) => pos === selectedPos))
    ? selectedPos
    : archPositions[0]?.[0];

  return (
    <div className="space-y-4">

      {/* Scout portrait + info row */}
      <div className="flex flex-col sm:flex-row gap-4 items-stretch">

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

        {/* Info card — the total is the hero stat here, not a caption */}
        <div className="flex-1 rounded-xl p-3 flex items-start justify-between gap-3 bg-surface-2 border border-surface-4 sm:h-[100px]">
          <div className="flex flex-col justify-center gap-1.5 h-full">
            <p className="text-base font-semibold text-txt-primary">Scouting Needs</p>
            <p className="text-xs text-txt-tertiary leading-snug">
              Exactly which dev traits to scout next so your Analyst has real data to compare future recruits against
            </p>
          </div>
          <div className="flex-shrink-0 flex flex-col justify-center items-end h-full text-right">
            <p className="text-4xl sm:text-5xl font-display font-black leading-none tabular-nums" style={{ color: p }}>{total}</p>
            <p className="text-[9px] font-display font-black uppercase tracking-[0.14em] text-txt-tertiary mt-1">Recruits</p>
          </div>
        </div>
      </div>

      {total === 0 ? (
        <div className="rounded-xl bg-surface-2 border border-surface-4 p-10 text-center">
          <p className="text-sm text-txt-tertiary italic">Add recruiting targets to build the database.</p>
        </div>
      ) : (
        <>
          {/* Archetypes by position — position nav (left) + star sub-tabs and
              a prioritized scouting-needs list (right), same structural
              pattern as Threshold Lookup / Program Outlook so this reads as a
              sibling page instead of the odd one out. Doubles as the position
              breakdown too (each nav item already carries its total), so a
              separate "By Position" section isn't needed anymore. Every
              archetype at the selected star shows, including ones with zero
              data — nothing is hidden, they're all equally worth knowing
              about — but the list is sorted so the buckets closest to
              "Strong" confidence (fewest additional recruits needed) surface
              first, since those are the quickest wins. */}
          <div className="rounded-xl overflow-hidden flex flex-col md:flex-row min-h-[420px] bg-surface-2 border border-surface-4">
            {/* Position Nav */}
            <div className="w-full md:w-28 bg-surface-3 border-b md:border-b-0 md:border-r border-surface-4 p-2 flex flex-row md:flex-col gap-1 overflow-x-auto md:overflow-x-visible scrollbar-none shrink-0">
              {archPositions.map(([pos, posTotal]) => (
                <button
                  key={pos}
                  type="button"
                  onClick={() => setSelectedPos(pos)}
                  style={pos === activePos ? { backgroundColor: p, color: '#fff' } : undefined}
                  className={`flex items-center justify-between gap-2 text-[10px] font-semibold uppercase tracking-wider px-2 py-2 rounded-lg transition shrink-0 text-left ${
                    pos === activePos
                      ? ''
                      : 'text-txt-tertiary hover:bg-surface-4 hover:text-txt-primary'
                  }`}
                >
                  <span>{recruitingPosLabel(pos)}</span>
                  <span className="opacity-60">{posTotal}</span>
                </button>
              ))}
            </div>

            {/* Right panel */}
            <div className="flex-1 flex flex-col min-w-0">
              <div className="border-b border-surface-4 px-4 py-2.5 flex flex-wrap gap-1.5">
                {STAR_CONFIG.map(({ key }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSelectedStar(key)}
                    style={key === selectedStar ? { backgroundColor: p, color: '#fff' } : undefined}
                    className={`px-2.5 py-1 rounded-md text-[10px] font-semibold transition ${
                      key === selectedStar
                        ? ''
                        : 'text-txt-tertiary hover:text-txt-secondary hover:bg-surface-4'
                    }`}
                  >
                    {key}★ <span className="opacity-60">{starCountsByPos[activePos]?.[key] ?? 0}</span>
                  </button>
                ))}
              </div>
              {activePos && (() => {
                const registryArchs = ARCHETYPES_BY_POS[activePos];
                const rows = registryArchs.map(arch => {
                  const archNorm = normalizeArch(arch);
                  const byTrait = pool[`${activePos}_${archNorm}`]?.[selectedStar] || {};
                  const traitCounts = {};
                  DEV_TRAITS.forEach(dt => { traitCounts[dt] = byTrait[dt]?.length || 0; });
                  const populated = LADDER_ORDER.filter(dt => traitCounts[dt] > 0);
                  const boundaries = countBoundaries(new Set(populated));
                  const isStrong = boundaries >= 2;
                  // All 3 boundaries only happens when all 4 dev traits have at
                  // least one revealed comp — the max possible confidence for
                  // this bucket, since there's nothing left on the ladder to add.
                  const isComplete = boundaries >= 3;
                  const gap = isStrong ? null : gapToStrong(populated);
                  // Once Strong, exactly one tier is still missing (always Normal
                  // or Elite — the two "outer" rungs. A missing middle rung
                  // (Impact/Star) would have already capped boundaries at 1, not
                  // 2, since middle rungs each serve double duty across two
                  // boundaries at once).
                  const missingForComplete = isStrong && !isComplete
                    ? LADDER_ORDER.filter(dt => !populated.includes(dt))
                    : [];
                  // Same 4-level confidence ladder used everywhere else in the
                  // app (PlayerDatabase's confidence pill, Threshold Lookup's
                  // Key panel): Thin (0 boundaries) → Limited (1) → Strong (2) →
                  // and Complete on top of that (all 3 boundaries — every dev
                  // trait represented). "Broad" doesn't apply here since this
                  // view never widens across star levels — every row is scoped
                  // to one exact star, matching the pool it reads from.
                  const label = isComplete ? 'Complete' : isStrong ? 'Strong' : boundaries === 1 ? 'Limited' : 'Thin';
                  const colorCls = isComplete ? 'text-sky-400' : isStrong ? 'text-emerald-400' : boundaries === 1 ? 'text-amber-400' : 'text-orange-400';
                  return { arch, archNorm, traitCounts, isStrong, isComplete, gap, missingForComplete, label, colorCls };
                });
                // Priority order: buckets not yet Strong (closest first — the
                // quickest wins), then Strong-but-not-Complete (still one more
                // recruit worth getting), then Complete last (nothing left to do).
                rows.sort((a, b) => {
                  const key = r => r.isComplete ? Infinity : r.isStrong ? 4 : r.gap.count;
                  return key(a) - key(b);
                });
                return (
                  <div className="flex-1 p-4 space-y-3 overflow-y-auto">
                    {rows.map(({ arch, archNorm, traitCounts, isStrong, isComplete, gap, missingForComplete, label, colorCls }) => (
                      <button
                        key={arch}
                        type="button"
                        onClick={() => onSelectBucket?.(activePos, arch, selectedStar)}
                        className={`w-full text-left bg-surface-3 border border-surface-4 rounded-lg px-4 py-3 space-y-2.5 transition ${
                          onSelectBucket ? 'hover:border-txt-tertiary cursor-pointer' : ''
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3 flex-wrap">
                          <span className="text-sm font-display font-bold text-txt-primary">{archNorm}</span>
                          <div className="text-right">
                            <p className={`text-[11px] font-display font-black uppercase tracking-wide ${colorCls}`}>
                              {label}
                            </p>
                            {isStrong && !isComplete && (
                              <p className="text-[10px] font-display font-semibold uppercase tracking-wide text-txt-tertiary mt-0.5">
                                1 more until Complete: {missingForComplete.join(', ')}
                              </p>
                            )}
                            {!isStrong && (
                              <p className="text-[10px] font-display font-semibold uppercase tracking-wide text-txt-tertiary mt-0.5">
                                Needs {gap.count} more until Strong: {gap.options.map(opt => opt.join(' + ')).join(' or ')}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {LADDER_ORDER.map(dt => {
                            const has = traitCounts[dt] > 0;
                            const c = TRAIT_COLORS[dt];
                            return (
                              <span
                                key={dt}
                                className="bg-surface-2 border px-2.5 py-1 rounded-md text-xs font-display font-bold uppercase tracking-wide"
                                style={has
                                  ? { borderColor: c.border, color: c.text, boxShadow: c.glow }
                                  : { borderColor: 'var(--surface-4)', color: 'var(--txt-tertiary)', opacity: 0.45 }
                                }
                              >
                                {dt}: {traitCounts[dt]}
                              </span>
                            );
                          })}
                        </div>
                      </button>
                    ))}
                  </div>
                );
              })()}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
