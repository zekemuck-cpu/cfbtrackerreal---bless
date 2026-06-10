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

export default function PlayerCount({ players, roleContext, teamColors, teamLogo, committedRecruits = [], currentYear }) {
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
      <div className="flex items-center gap-3 px-4 py-3 rounded-xl" style={{ background: '#080c14', border: `1px solid ${p}22` }}>
        {teamLogo && <img src={teamLogo} alt="" className="w-6 h-6 object-contain flex-shrink-0" style={{ opacity: 0.7 }} />}
        <p style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 'clamp(1.1rem, 3vw, 1.5rem)', color: p, letterSpacing: '0.08em', lineHeight: 1 }}>ROSTER PIPELINE</p>
      </div>

      {/* Portrait + Aggregate row */}
      <div className="flex flex-col sm:flex-row gap-4 items-stretch">
        {/* Scout portrait card */}
        <div className="relative rounded-xl overflow-hidden w-full h-40 sm:w-[110px] sm:h-[280px] sm:flex-shrink-0">
          {scoutImg
            ? <img src={scoutImg} alt="" className="absolute inset-0 w-full h-full object-cover object-top" />
            : <div className="absolute inset-0 flex items-center justify-center text-[10px] text-slate-500" style={{ background: '#0a0f1a' }}>N/A</div>
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
                {fn && <p style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 'clamp(0.7rem, 1.5vw, 0.9rem)', color: 'rgba(255,255,255,0.75)', letterSpacing: '0.06em', lineHeight: 1, textShadow: '0 1px 8px rgba(0,0,0,1), 0 2px 16px rgba(0,0,0,1)' }}>{fn}</p>}
                <p style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 'clamp(1.4rem, 3.5vw, 2rem)', color: 'white', letterSpacing: '0.04em', lineHeight: 1, textShadow: '0 1px 8px rgba(0,0,0,1), 0 2px 16px rgba(0,0,0,1)' }}>{ln}</p>
                <p style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '0.6rem', color: p, letterSpacing: '0.1em', lineHeight: 1.4, textShadow: '0 1px 8px rgba(0,0,0,1)' }}>REGIONAL SCOUT</p>
              </>;
            })()}
          </div>
        </div>

        {/* Aggregate card */}
        <div className="flex-1 relative rounded-xl overflow-hidden p-4 flex flex-col justify-between" style={{ background: '#080c14', border: `1px solid ${p}22` }}>
          {teamLogo && <img src={teamLogo} alt="" className="absolute right-3 top-3 w-16 h-16 object-contain pointer-events-none select-none" style={{ opacity: 0.06 }} />}
          <div>
            <p style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 'clamp(1.2rem, 2.5vw, 1.7rem)', color: 'white', letterSpacing: '0.06em', lineHeight: 1 }}>ROSTER POOL AGGREGATES</p>
            <p className="text-[9px] text-slate-500 mt-0.5">Live quantitative tracking distribution mapping all stored data profiles</p>
          </div>
          <div className="flex items-end gap-6">
            <div>
              <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 'clamp(2.5rem, 5vw, 3.5rem)', color: '#10b981', lineHeight: 1, letterSpacing: '0.02em' }}>{totalScouted}</div>
              <div className="text-[9px] font-black uppercase tracking-widest text-slate-600">Scouted</div>
            </div>
            {hasCommits && (
              <div>
                <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 'clamp(2.5rem, 5vw, 3.5rem)', color: p, lineHeight: 1, letterSpacing: '0.02em' }}>{totalCommitted}</div>
                <div className="text-[9px] font-black uppercase tracking-widest text-slate-600">Committed</div>
              </div>
            )}
          </div>
          <p className="text-[10px] text-slate-400 italic leading-snug">{(() => {
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
                <span className="text-3xl font-black font-mono tracking-tight">{card.count}</span>
                <span className="text-[10px] font-mono font-bold opacity-40">{percentage}%</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Class Progress Dashboard */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-[9px] font-black uppercase tracking-widest text-slate-500">
            {currentYear ? `${currentYear} Class Progress` : 'Class Progress'} — Committed vs. Target
          </h3>
          {hasCommits && (
            <span className="text-[9px] text-slate-500">
              {totalCommitted} total · {committedRecruits.filter(r => r.isPortal || r.previousTeam).length} portal
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
          {classProgress.map(group => {
            const { status, committed, portalCommits, min, max, label } = group;
            const barPct = max > 0 ? Math.min(100, (committed / max) * 100) : 0;
            const barColor = status === 'full' ? '#10b981' : status === 'ok' ? '#3b82f6' : status === 'low' ? '#f59e0b' : '#334155';
            const textColor = status === 'full' ? 'text-emerald-400' : status === 'ok' ? 'text-sky-400' : status === 'low' ? 'text-amber-400' : 'text-slate-600';
            const borderColor = status === 'full' ? 'border-emerald-900/40' : status === 'ok' ? 'border-sky-900/30' : status === 'low' ? 'border-amber-900/30' : 'border-slate-800';

            return (
              <div key={group.key}
                className={`rounded-xl border p-3 space-y-2 ${borderColor}`}
                style={{ background: '#080c14' }}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className={`text-[11px] font-black uppercase ${textColor}`}>{label}</span>
                  <span className={`text-[10px] font-bold tabular-nums ${textColor}`}>{committed}</span>
                </div>
                {/* Progress bar */}
                <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{ width: `${barPct}%`, backgroundColor: barColor }} />
                </div>
                <div className="text-[8px] text-slate-600 tabular-nums">
                  Target {min === max ? min : `${min}–${max}`}
                  {portalCommits > 0 && <span className="text-sky-700 ml-1">· {portalCommits} portal</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
