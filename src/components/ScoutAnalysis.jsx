import React, { useState } from 'react';

const ANALYSIS_ROSTER = [
  { group: "Passing Game", pos: "QB", archetype: "Pocket / Dual / Creator / Pure Runner", details: "Tracks passing accuracy layers matched with pressure handling parameters and movement thresholds." },
  { group: "Ball Carriers", pos: "HB", archetype: "Elusive / Playmaker / Seeker / Threat / Rec / Blk", details: "Balances space navigation, change of direction agility, physical tackle breakage, and secondary checkdown hands." },
  { group: "Perimeter Threats", pos: "WR", archetype: "Speedster / Route Artist / Elusive / Physical / Possession / Specialist / Gadget", details: "Differentiates flat agility, press release, route depths, tracking visibility, and dynamic run blocking assets." },
  { group: "Hybrid Modern Targets", pos: "TE", archetype: "Vertical Threat / Pure Poss / Gritty Poss / Physical Route / Pure Blocker", details: "Combines inline protection anchors, physical downfield separation, and horizontal short possession patterns." },
  { group: "Line Anchors", pos: "OT / OG / C", archetype: "Well Rounded / Pass Protector / Agile / Raw Strength", details: "Measures power versus finesse profiles across run-heavy block sets and deep pocket pass protective anchors." },
  { group: "Pass Rush Front", pos: "DE / DT", archetype: "Edge Setter / Power / Speed / Pure Power / Gap Specialist", details: "Isolates block shedding speeds, gap manipulation power, interior push formulas, and tracking pursuit angles." },
  { group: "Second Level Core", pos: "OLB / MIKE", archetype: "Thumper / Signal Caller / Lurker", details: "Unified tracking built for tackle leverage, mid-field zone visibility, play recognition, and space containment." },
  { group: "Secondary Secondary", pos: "CB / FS / SS", archetype: "Field / Bump & Run / Boundary / Zone / Hybrid / Coverage / Box", details: "Maps press containment variables, deep coverage ranges, recovery agilities, and low-box run diagnostic hits." }
];

export default function ScoutAnalysis() {
  const [activeTab, setActiveTab] = useState('Passing Game');

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl max-w-4xl mx-auto">
      <div className="bg-slate-950/50 border-b border-slate-800 px-5 py-3 text-xs font-black uppercase tracking-wider text-emerald-400">
        Strategic Archetype Parameters Blueprint
      </div>
      <div className="flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-slate-800 min-h-[340px]">
        {/* Navigation Column Links */}
        <div className="w-full md:w-1/3 bg-slate-950/20 p-2 flex flex-row md:flex-col overflow-x-auto md:overflow-x-visible gap-1 scrollbar-none">
          {ANALYSIS_ROSTER.map(item => (
            <button
              key={item.group}
              onClick={() => setActiveTab(item.group)}
              className={`w-full text-left text-[10px] font-bold uppercase tracking-wider p-2.5 rounded-lg transition shrink-0 md:shrink ${
                activeTab === item.group 
                  ? 'bg-slate-800 text-emerald-400 border-l-2 border-emerald-500 rounded-l-none' 
                  : 'text-slate-400 hover:bg-slate-850/40 hover:text-slate-200'
              }`}
            >
              {item.group}
            </button>
          ))}
        </div>
        
        {/* Content Panel Area */}
        <div className="flex-1 p-6 flex flex-col justify-center bg-slate-900">
          {ANALYSIS_ROSTER.filter(item => item.group === activeTab).map(item => (
            <div key={item.group} className="space-y-4 animate-fadeIn">
              <div className="space-y-1">
                <span className="text-[9px] font-black tracking-widest text-emerald-500 uppercase">Tracked Code Classes</span>
                <h3 className="text-xl font-black text-white uppercase tracking-tight">{item.pos}</h3>
              </div>
              <div className="space-y-1">
                <span className="text-[9px] font-black tracking-widest text-slate-500 uppercase">Available System Blueprints</span>
                <p className="text-xs font-bold text-slate-200 bg-slate-950 border border-slate-850 p-2.5 rounded-lg leading-relaxed">
                  {item.archetype}
                </p>
              </div>
              <div className="space-y-1">
                <span className="text-[9px] font-black tracking-widest text-slate-500 uppercase">Matrix Logic & Intended Application</span>
                <p className="text-xs text-slate-400 leading-relaxed">{item.details}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
