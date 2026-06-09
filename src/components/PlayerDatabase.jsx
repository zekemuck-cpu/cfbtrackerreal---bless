import React, { useState } from 'react';

export default function PlayerDatabase({ players }) {
  const [filterPos, setFilterPos] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Filtering configurations
  const positionsList = ['ALL', 'QB', 'HB', 'WR', 'TE', 'OT', 'OG', 'C', 'DE', 'DT', 'OLB', 'MIKE', 'CB', 'FS', 'SS', 'ATH'];

  const filteredPlayers = players.filter(p => {
    const matchesPos = filterPos === 'ALL' || p.position === filterPos;
    const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          p.archetype.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesPos && matchesSearch;
  });

  return (
    <div className="space-y-4">
      {/* Control Filters Row */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900 p-4 rounded-xl border border-slate-800">
        <div className="flex-1">
          <input 
            type="text" 
            placeholder="Search prospect name or archetype focus..." 
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 text-xs p-2.5 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition"
          />
        </div>
        <div className="flex items-center space-x-2 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 shrink-0">Filter:</span>
          {positionsList.map(pos => (
            <button
              key={pos}
              onClick={() => setFilterPos(pos)}
              className={`text-[10px] font-bold px-2.5 py-1 rounded-md transition uppercase tracking-wider shrink-0 ${
                filterPos === pos 
                  ? 'bg-emerald-500 text-slate-950 font-black' 
                  : 'bg-slate-950 text-slate-400 border border-slate-800 hover:bg-slate-850'
              }`}
            >
              {pos}
            </button>
          ))}
        </div>
      </div>

      {/* Roster Ledger Database Output Grid Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-950 text-[10px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-800">
                <th className="p-3.5">Prospect Identity</th>
                <th className="p-3.5 text-center">Grade</th>
                <th className="p-3.5">Pipeline Group</th>
                <th className="p-3.5">Pos</th>
                <th className="p-3.5">Archetype Blueprint Focus</th>
                <th className="p-3.5 text-center">Stars</th>
                <th className="p-3.5">Dev Trait</th>
                <th className="p-3.5 font-mono">Attribute Values Matrix breakdown</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/40 text-xs">
              {filteredPlayers.length === 0 ? (
                <tr>
                  <td colSpan="8" className="p-12 text-center text-slate-500 uppercase tracking-widest font-bold text-[10px]">
                    No scouting logs found matching active criteria.
                  </td>
                </tr>
              ) : (
                filteredPlayers.map((p, i) => (
                  <tr key={i} className="hover:bg-slate-850/20 transition group">
                    <td className="p-3.5 font-bold text-slate-200 group-hover:text-white transition">{p.name}</td>
                    <td className="p-3.5 text-center">
                      <span className={`font-black tracking-wide text-xs ${
                        p.grade.startsWith('A') ? 'text-emerald-400' : p.grade.startsWith('B') ? 'text-sky-400' : 'text-amber-400'
                      }`}>
                        {p.grade}
                      </span>
                    </td>
                    <td className="p-3.5 uppercase font-black text-slate-500 text-[10px] tracking-wider">{p.group}</td>
                    <td className="p-3.5">
                      <span className="px-2 py-0.5 bg-slate-950 border border-slate-800 text-emerald-400 font-black rounded text-[10px]">
                        {p.position}
                      </span>
                    </td>
                    <td className="p-3.5 text-slate-300 font-medium">{p.archetype}</td>
                    <td className="p-3.5 text-center font-black text-amber-400 tracking-wide">{p.stars}★</td>
                    <td className="p-3.5">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        p.devTrait === 'Elite' ? 'bg-purple-950/40 border border-purple-900 text-purple-300' :
                        p.devTrait === 'Star' ? 'bg-blue-950/40 border border-blue-900 text-blue-300' :
                        p.devTrait === 'Impact' ? 'bg-orange-950/40 border border-orange-900 text-orange-300' :
                        'bg-slate-950 border border-slate-850 text-slate-400'
                      }`}>
                        {p.devTrait}
                      </span>
                    </td>
                    <td className="p-3.5 font-mono text-[10px] text-slate-400 max-w-sm">
                      <div className="flex flex-wrap gap-1.5">
                        {Object.entries(p.attributes).map(([key, val]) => (
                          <span key={key} className="bg-slate-950 border border-slate-850 px-1.5 py-0.5 rounded text-slate-300 shrink-0">
                            <strong className="text-slate-500 font-normal mr-0.5">{key}:</strong>{val}
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
