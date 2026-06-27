import React, { useState, useEffect, useMemo } from 'react';
import { getStaffData } from './staffDB';

// Position groups with targets for class-building dashboard
const CLASS_GROUPS = [
  { key: 'QB',   label: 'QB',   positions: ['QB'],                                              min: 1, max: 2 },
  { key: 'HB',   label: 'HB',   positions: ['HB', 'FB', 'RB'],                                  min: 1, max: 2 },
  { key: 'WR',   label: 'WR',   positions: ['WR'],                                              min: 2, max: 3 },
  { key: 'TE',   label: 'TE',   positions: ['TE'],                                              min: 1, max: 2 },
  { key: 'OL',   label: 'OL',   positions: ['OT', 'LT', 'RT', 'OG', 'LG', 'RG', 'C'],          min: 2, max: 4 },
  { key: 'EDGE', label: 'EDGE', positions: ['DE', 'LEDG', 'REDG', 'EDGE', 'LE', 'RE'],          min: 1, max: 2 },
  { key: 'DT',   label: 'DT',   positions: ['DT', 'NT', 'DL'],                                  min: 1, max: 2 },
  { key: 'LB',   label: 'LB',   positions: ['OLB', 'SAM', 'WILL', 'LOLB', 'ROLB', 'MIKE', 'MLB', 'ILB', 'LB'], min: 1, max: 3 },
  { key: 'DB',   label: 'DB',   positions: ['CB', 'FS', 'SS', 'S', 'DB'],                       min: 2, max: 3 },
];

export default function PlayerCount({ players, roleContext, teamColors, teamLogo, committedRecruits = [], currentYear, onBack }) {
  const p = teamColors?.primary || '#374151';
  const [scoutImg, setScoutImg] = useState('');
  const [scoutName, setScoutName] = useState('Regional Scout');

  useEffect(() => {
    async function loadScout() {
      const img  = await getStaffData('scout_img');
      const name = await getStaffData('scout_name');
      if (img)  setScoutImg(img);
      if (name) setScoutName(name);
    }
    loadScout();
  }, []);

  // Count pipeline records across star tiers
  const tallies = {
    fiveStar:  players.filter(p => p.stars === '5').length,
    fourStar:  players.filter(p => p.stars === '4').length,
    threeStar: players.filter(p => p.stars === '3').length,
    twoStar:   players.filter(p => p.stars === '2').length,
    oneStar:   players.filter(p => p.stars === '1').length,
  };

  const totalScouted = players.length;

  // Class progress: count committed recruits per position group
  const classProgress = useMemo(() => {
    return CLASS_GROUPS.map(group => {
      const committed = committedRecruits.filter(r =>
        group.positions.includes((r.position || '').toUpperCase())
      ).length;
      const portalCommits = committedRecruits.filter(r =>
        group.positions.includes((r.position || '').toUpperCase()) && (r.isPortal || r.previousTeam)
      ).length;
      let status;
      if (committed >= group.max)      status = 'full';
      else if (committed >= group.min) status = 'ok';
      else if (committed > 0)          status = 'low';
      else                             status = 'empty';
      return { ...group, committed, portalCommits, status };
    });
  }, [committedRecruits]);

  const totalCommitted = committedRecruits.length;
  const hasCommits = totalCommitted > 0;

  const dataCards = [
    { label: "Five Star Prospects",  count: tallies.fiveStar,  style: "from-amber-500/20 to-yellow-600/5 border-amber-500/40 text-amber-400" },
    { label: "Four Star Prospects",  count: tallies.fourStar,  style: "from-slate-300/10 to-slate-400/5 border-slate-700 text-slate-300" },
    { label: "Three Star Prospects", count: tallies.threeStar, style: "from-orange-600/10 to-amber-700/5 border-orange-900/60 text-orange-400" },
    { label: "Two Star Prospects",   count: tallies.twoStar,   style: "from-teal-600/10 to-emerald-700/5 border-teal-900/60 text-teal-400" },
    { label: "One Star Prospects",   count: tallies.oneStar,   style: "from-slate-800/40 to-slate-900/5 border-slate-850 text-slate-500" }
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header strip */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-surface-2 border border-surface-4">
        <p className="text-sm font-display font-bold uppercase text-txt-primary">Roster Pipeline</p>
        {onBack && (
          <button onClick={onBack} className="text-xs font-display font-bold uppercase text-txt-secondary hover:text-txt-primary transition px-3 py-1.5 rounded-lg border border-surface-4 hover:bg-surface-3 flex-shrink-0">
            ← Main Hub
          </button>
        )}
      </div>

      {/* Portrait + Aggregate row */}
      <div className="flex flex-col sm:flex-row gap-4 items-stretch">
        {/* Scout portrait card */}
        <div className="relative rounded-xl overflow-hidden w-full h-40 sm:w-[110px] sm:h-[280px] sm:flex-shrink-0">
          {scoutImg
            ? <img src={scoutImg} alt="" className="absolute inset-0 w-full h-full object-cover object-top" />
            : <div className="absolute inset-0 bg-surface-3" />
          }
          <div className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.0) 0%, rgba(0,0,0,0.15) 40%, rgba(0,0,0,0.82) 68%, rgba(0,0,0,0.92) 100%)' }} />
          <div className="absolute inset-0 pointer-events-none" style={{ background: `linear-gradient(to bottom, transparent 45%, ${p}55 100%)` }} />
          <div className="absolute bottom-0 left-0 right-0 p-2.5 pointer-events-none">
            <div className="w-6 h-0.5 mb-1 rounded-full" style={{ background: p }} />
            {(() => {
              const parts = scoutName.trim().split(/\s+/);
              const fn = parts.length > 1 ? parts.slice(0, -1).join(' ') : '';
              const ln = parts[parts.length - 1];
              return <>
                {fn && <p className="text-[0.7rem] font-semibold leading-none" style={{ color: 'rgba(255,255,255,0.75)', textShadow: '0 1px 8px rgba(0,0,0,1)' }}>{fn}</p>}
                <p className="text-xl font-bold leading-tight" style={{ color: 'white', textShadow: '0 1px 8px rgba(0,0,0,1)' }}>{ln}</p>
                <p className="text-[0.6rem] font-semibold tracking-wider leading-snug" style={{ color: p, textShadow: '0 1px 8px rgba(0,0,0,1)' }}>REGIONAL SCOUT</p>
              </>;
            })()}
          </div>
        </div>

        {/* Aggregate card */}
        <div className="flex-1 rounded-xl p-4 flex flex-col justify-between bg-surface-2 border border-surface-4">
          <div>
            <p className="text-base font-semibold text-txt-primary">Roster Pool Aggregates</p>
            <p className="text-xs text-txt-tertiary mt-0.5">Live quantitative tracking distribution mapping all stored data profiles</p>
          </div>
          <div className="flex items-end gap-6">
            <div>
              <div className="text-4xl font-bold tabular-nums text-emerald-400 leading-none">{totalScouted}</div>
              <div className="text-[9px] font-semibold uppercase tracking-widest text-txt-tertiary mt-0.5">Scouted</div>
            </div>
            {hasCommits && (
              <div>
                <div className="text-4xl font-bold tabular-nums leading-none" style={{ color: p }}>{totalCommitted}</div>
                <div className="text-[9px] font-semibold uppercase tracking-widest text-txt-tertiary mt-0.5">Committed</div>
              </div>
            )}
          </div>
          <p className="text-xs text-txt-secondary italic leading-snug">{(() => {
            if (!players.length) return "Board is empty — I'll start filing reports as soon as I find talent worth tracking, boss.";
            const five = players.filter(pl => pl.stars === '5').length;
            const four = players.filter(pl => pl.stars === '4').length;
            const low  = players.filter(pl => ['3','2','1'].includes(pl.stars)).length;
            if (five === 0 && four <= 1) return `${players.length} on the board and no five-stars yet — chasing higher-rated targets as we speak.`;
            if (five >= 3) return `${five} five-stars on the board — this class is shaping up to be something special if we can close them.`;
            if (low > five + four) return "Depth is building at the lower tiers but we need more blue-chip talent at the top of this board.";
            return `${players.length} total tracked — ${five + four} four-and-five star targets leading the class right now.`;
          })()}</p>
        </div>
      </div>

      {/* Tally Tier Display Grid */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {dataCards.map((card, idx) => {
          const percentage = totalScouted > 0 ? ((card.count / totalScouted) * 100).toFixed(0) : 0;
          return (
            <div key={idx} className={`bg-gradient-to-b ${card.style} border rounded-xl p-4 flex flex-col justify-between shadow-lg h-32 hover:scale-[1.02] transition duration-200`}>
              <div className="text-[10px] font-black uppercase tracking-wider opacity-80">
                {card.label}
              </div>
              <div className="flex items-baseline justify-between mt-4">
                <span className="text-3xl font-display font-black">{card.count}</span>
                <span className="text-[10px] font-bold tabular-nums opacity-40">{percentage}%</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Class Progress Dashboard */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-[9px] font-semibold uppercase tracking-widest text-txt-tertiary">
            {currentYear ? `${currentYear} Class Progress` : 'Class Progress'} — Committed vs. Target
          </h3>
          {hasCommits && (
            <span className="text-[9px] text-txt-tertiary">
              {totalCommitted} total · {committedRecruits.filter(r => r.isPortal || r.previousTeam).length} portal
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
          {classProgress.map(group => {
            const { status, committed, portalCommits, min, max, label } = group;
            const barPct = max > 0 ? Math.min(100, (committed / max) * 100) : 0;
            const barColor = status === 'full' ? '#10b981' : status === 'ok' ? '#3b82f6' : status === 'low' ? '#f59e0b' : '#334155';
            const textColor = status === 'full' ? 'text-emerald-400' : status === 'ok' ? 'text-sky-400' : status === 'low' ? 'text-amber-400' : 'text-txt-tertiary';
            const borderColor = status === 'full' ? 'border-emerald-900/40' : status === 'ok' ? 'border-sky-900/30' : status === 'low' ? 'border-amber-900/30' : 'border-surface-4';

            return (
              <div key={group.key}
                className={`rounded-xl border p-3 space-y-2 bg-surface-2 ${borderColor}`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className={`text-[11px] font-semibold uppercase ${textColor}`}>{label}</span>
                  <span className={`text-[10px] font-bold tabular-nums ${textColor}`}>{committed}</span>
                </div>
                {/* Progress bar */}
                <div className="h-1 bg-surface-4 rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{ width: `${barPct}%`, backgroundColor: barColor }} />
                </div>
                <div className="text-[8px] text-txt-tertiary tabular-nums">
                  Target {min === max ? min : `${min}–${max}`}
                  {portalCommits > 0 && <span className="text-sky-600 ml-1">· {portalCommits} portal</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
