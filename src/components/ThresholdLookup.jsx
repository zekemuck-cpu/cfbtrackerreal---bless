import React, { useState } from 'react';

const THRESHOLD_BENCHMARKS = [
  { tier: "Tier 1: Elite Targets", min: "88 Avg Attribute", max: "99 Max Attribute", condition: "Requires an Elite developmental trait or an overall attribute average sitting at or above 88. Mapped directly onto A+ staff grades." },
  { tier: "Tier 2: Premium Star Pipeline", min: "82 Avg Attribute", max: "87 Avg Attribute", condition: "Requires a Star developmental trait or an overall attribute average sitting between 82 and 87. Mapped directly onto A staff grades." },
  { tier: "Tier 3: Core Contribution Core", min: "76 Avg Attribute", max: "81 Avg Attribute", condition: "Requires an Impact developmental trait or an overall attribute average sitting between 76 and 81. Mapped directly onto B staff grades." },
  { tier: "Tier 4: Roster Depth Foundation", min: "0 Baseline", max: "75 Avg Attribute", condition: "Standard rotational depth or developmental projects tracking under a 76 attribute average. Mapped directly onto C staff grades." }
];

export default function ThresholdLookup() {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredBenchmarks = THRESHOLD_BENCHMARKS.filter(b => 
    b.tier.toLowerCase().includes(searchTerm.toLowerCase()) ||
    b.condition.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      {/* Search Header Filtering Row */}
      <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex items-center justify-between">
        <span className="text-xs font-black uppercase tracking-widest text-slate-400 hidden sm:inline">Baseline Lookups</span>
        <input 
          type="text" 
          placeholder="Filter benchmarks by tier or grade parameters..." 
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="w-full sm:w-72 bg-slate-950 border border-slate-800 text-xs p-2 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition"
        />
      </div>

      {/* Benchmarks Matrix Grid List */}
      <div className="grid gap-4">
        {filteredBenchmarks.length === 0 ? (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center text-slate-500 uppercase tracking-widest font-bold text-[10px]">
            No benchmark tiers match your search query.
          </div>
        ) : (
          filteredBenchmarks.map((b, i) => (
            <div key={i} className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-lg hover:border-slate-700/60 transition">
              <div className="space-y-1.5 max-w-xl">
                <h4 className="text-sm font-black text-white uppercase tracking-wide">{b.tier}</h4>
                <p className="text-xs text-slate-400 leading-relaxed">{b.condition}</p>
              </div>
              <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center border-t sm:border-t-0 border-slate-800 pt-3 sm:pt-0 gap-1.5 shrink-0">
                <div className="bg-slate-950 border border-slate-850 px-2.5 py-1 rounded-md text-[10px] font-mono text-emerald-400">
                  <span className="text-slate-600 mr-1 uppercase">Min:</span><strong>{b.min}</strong>
                </div>
                <div className="bg-slate-950 border border-slate-850 px-2.5 py-1 rounded-md text-[10px] font-mono text-sky-400">
                  <span className="text-slate-600 mr-1 uppercase">Max:</span><strong>{b.max}</strong>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
