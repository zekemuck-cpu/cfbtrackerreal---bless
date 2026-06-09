import React from 'react';

export default function PlayerCount({ players }) {
  // Count pipeline records across star tiers
  const tallies = {
    fiveStar: players.filter(p => p.stars === '5').length,
    fourStar: players.filter(p => p.stars === '4').length,
    threeStar: players.filter(p => p.stars === '3').length,
    twoStar: players.filter(p => p.stars === '2').length,
    oneStar: players.filter(p => p.stars === '1').length,
  };

  const totalScouted = players.length;

  const dataCards = [
    { label: "Five Star Prospects", count: tallies.fiveStar, style: "from-amber-500/20 to-yellow-600/5 border-amber-500/40 text-amber-400" },
    { label: "Four Star Prospects", count: tallies.fourStar, style: "from-slate-300/10 to-slate-400/5 border-slate-700 text-slate-300" },
    { label: "Three Star Prospects", count: tallies.threeStar, style: "from-orange-600/10 to-amber-700/5 border-orange-900/60 text-orange-400" },
    { label: "Two Star Prospects", count: tallies.twoStar, style: "from-teal-600/10 to-emerald-700/5 border-teal-900/60 text-teal-400" },
    { label: "One Star Prospects", count: tallies.oneStar, style: "from-slate-800/40 to-slate-900/5 border-slate-850 text-slate-500" }
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Total Aggregate Header Panel */}
      <div className="bg-gradient-to-r from-slate-900 to-slate-950 border border-slate-800 rounded-xl p-6 flex items-center justify-between shadow-xl">
        <div className="space-y-1">
          <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest">Roster Pool Aggregates</h3>
          <p className="text-xs text-slate-500">Live quantitative tracking distribution mapping all stored data profiles</p>
        </div>
        <div className="text-right">
          <div className="text-3xl font-black text-emerald-400 font-mono tracking-tight">{totalScouted}</div>
          <div className="text-[9px] font-black uppercase tracking-widest text-slate-600">Total Records</div>
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
    </div>
  );
}
