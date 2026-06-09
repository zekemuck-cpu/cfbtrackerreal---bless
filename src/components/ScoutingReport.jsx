import React, { useState, useEffect } from 'react';

// Explicit Archetype Specific Overrides mapping right past the ATH prefix straight to underlying attribute matrices
// We keep a local reference here to drive the dynamic form labeling instantly
const RECRUIT_FORM_OVERRIDES = {
  "Speedster": ["Awareness", "Speed", "Acceleration", "Catching", "Catch In Traffic", "Spectacular Catch", "Short Route", "Medium Route", "Deep Route", "Release"],
  "Route Artist": ["Awareness", "Speed", "Acceleration", "Catching", "Catch In Traffic", "Spectacular Catch", "Short Route", "Medium Route", "Deep Route", "Agility"],
  "Elusive Route Runner": ["Awareness", "Speed", "Acceleration", "Catching", "Catch In Traffic", "Spectacular Catch", "Short Route", "Medium Route", "Deep Route", "Agility"],
  "Physical Route Runner": ["Awareness", "Speed", "Acceleration", "Catching", "Catch In Traffic", "Spectacular Catch", "Short Route", "Medium Route", "Deep Route", "Release"],
  "Gritty Possession": ["Awareness", "Speed", "Acceleration", "Catching", "Catch In Traffic", "Spectacular Catch", "Short Route", "Medium Route", "Deep Route", "Run Block"],
  "Contested Specialist": ["Awareness", "Speed", "Acceleration", "Catching", "Catch In Traffic", "Spectacular Catch", "Short Route", "Medium Route", "Deep Route", "Release"],
  "Gadget": ["Awareness", "Speed", "Acceleration", "Catching", "Catch In Traffic", "Spectacular Catch", "Short Route", "Medium Route", "Deep Route", "Throw Power"],
  "Vertical Threat": ["Awareness", "Speed", "Strength", "Acceleration", "Run Block", "Pass Block", "Catching", "Catch In Traffic", "Medium Route", "Deep Route"],
  "Raw Strength (OT)": ["Awareness", "Run Block", "Run Block Power", "Run Block Finesse", "Pass Block", "Pass Block Power", "Pass Block Finesse", "Impact Blocking", "Agility", "Strength"],
  "Raw Strength (OG)": ["Awareness", "Run Block", "Run Block Power", "Run Block Finesse", "Pass Block", "Pass Block Power", "Pass Block Finesse", "Impact Blocking", "Agility", "Strength"],
  "Raw Strength (C)": ["Awareness", "Run Block", "Run Block Power", "Run Block Finesse", "Pass Block", "Pass Block Power", "Pass Block Finesse", "Impact Blocking", "Agility", "Strength"],
  
  "ATH - Power Rusher": ["Awareness", "Strength", "Acceleration", "Block Shedding", "Tackle", "Hit Power", "Power Moves", "Finesse Moves", "Speed", "Pursuit"],
  "ATH - East/West Playmaker": ["Awareness", "Speed", "Acceleration", "Carrying", "Break Tackle", "Change of Direction", "Juke Move", "Spin Move", "BC Vision", "Catching"],
  "ATH - Contested Specialist": ["Awareness", "Speed", "Acceleration", "Catching", "Catch In Traffic", "Spectacular Catch", "Short Route", "Medium Route", "Deep Route", "Release"],
  "ATH - Agile": ["Awareness", "Run Block", "Run Block Power", "Run Block Finesse", "Pass Block", "Pass Block Power", "Pass Block Finesse", "Impact Blocking", "Agility", "Acceleration"],
  "ATH - Pure Runner": ["Awareness", "Throw Power", "Short Accuracy", "Medium Accuracy", "Deep Accuracy", "Throw On Run", "Under Pressure", "Break Sack", "Speed", "Acceleration"], 
  "ATH - Dual Threat": ["Awareness", "Throw Power", "Short Accuracy", "Medium Accuracy", "Deep Accuracy", "Throw On Run", "Under Pressure", "Break Sack", "Speed", "Acceleration"],
  "ATH - Contact Seeker": ["Awareness", "Speed", "Acceleration", "Carrying", "Break Tackle", "Change of Direction", "Juke Move", "Spin Move", "BC Vision", "Catching"],
  "ATH - Lurker": ["Awareness", "Speed", "Acceleration", "Strength", "Play Recognition", "Tackle", "Hit Power", "Pursuit", "Man Coverage", "Zone Coverage"],
  "ATH - Pure Possession": ["Awareness", "Speed", "Strength", "Acceleration", "Run Block", "Pass Block", "Catching", "Catch In Traffic", "Short Route", "Medium Route"],
  "ATH - Thumper": ["Awareness", "Speed", "Acceleration", "Strength", "Play Recognition", "Tackle", "Hit Power", "Pursuit", "Man Coverage", "Zone Coverage"],
  "ATH - Backfield Threat": ["Awareness", "Speed", "Acceleration", "Carrying", "Break Tackle", "Change of Direction", "Juke Move", "Spin Move", "BC Vision", "Catching"],
  "ATH - Physical Route Runner": ["Awareness", "Speed", "Strength", "Acceleration", "Run Block", "Pass Block", "Catching", "Catch In Traffic", "Short Route", "Medium Route"]
};

const BASE_POSITION_CONFIG = {
  QB: ["Awareness", "Throw Power", "Short Accuracy", "Medium Accuracy", "Deep Accuracy", "Throw On Run", "Under Pressure", "Break Sack", "Speed", "Acceleration"],
  HB: ["Awareness", "Speed", "Acceleration", "Carrying", "Break Tackle", "Change of Direction", "Juke Move", "Spin Move", "BC Vision", "Catching"],
  WR: ["Awareness", "Speed", "Acceleration", "Catching", "Catch In Traffic", "Spectacular Catch", "Short Route", "Medium Route", "Deep Route", "Release"],
  TE: ["Awareness", "Speed", "Strength", "Acceleration", "Run Block", "Pass Block", "Catching", "Catch In Traffic", "Short Route", "Medium Route"],
  OT: ["Awareness", "Run Block", "Run Block Power", "Run Block Finesse", "Pass Block", "Pass Block Power", "Pass Block Finesse", "Impact Blocking", "Agility", "Acceleration"],
  OG: ["Awareness", "Run Block", "Run Block Power", "Run Block Finesse", "Pass Block", "Pass Block Power", "Pass Block Finesse", "Impact Blocking", "Agility", "Acceleration"],
  C:  ["Awareness", "Run Block", "Run Block Power", "Run Block Finesse", "Pass Block", "Pass Block Power", "Pass Block Finesse", "Impact Blocking", "Agility", "Acceleration"],
  DE: ["Awareness", "Strength", "Acceleration", "Block Shedding", "Tackle", "Hit Power", "Power Moves", "Finesse Moves", "Speed", "Pursuit"],
  DT: ["Awareness", "Strength", "Acceleration", "Block Shedding", "Tackle", "Hit Power", "Power Moves", "Finesse Moves", "Speed", "Pursuit"],
  OLB: ["Awareness", "Speed", "Acceleration", "Strength", "Play Recognition", "Tackle", "Hit Power", "Pursuit", "Man Coverage", "Zone Coverage"],
  MIKE: ["Awareness", "Speed", "Acceleration", "Strength", "Play Recognition", "Tackle", "Hit Power", "Pursuit", "Man Coverage", "Zone Coverage"],
  CB: ["Awareness", "Speed", "Acceleration", "Change of Direction", "Agility", "Man Coverage", "Zone Coverage", "Press", "Catching", "Tackle"],
  FS: ["Awareness", "Speed", "Acceleration", "Change of Direction", "Agility", "Man Coverage", "Zone Coverage", "Press", "Catching", "Tackle"],
  SS: ["Awareness", "Speed", "Acceleration", "Change of Direction", "Agility", "Man Coverage", "Zone Coverage", "Press", "Catching", "Tackle"],
  ATH: ["Awareness", "Speed", "Acceleration", "Strength", "Agility", "Change of Direction", "Catching", "Tackle", "Zone Coverage", "Man Coverage"]
};

const OPTIONS_REGISTRY = [
  { position: "QB", archetypes: ["Pocket Passer", "Dual Threat", "Backfield Creator", "Pure Runner"] },
  { position: "HB", archetypes: ["Elusive Bruiser", "East/West Playmaker", "Contact Seeker", "Backfield Threat", "North/South Receiver", "North/South Blocker"] },
  { position: "WR", archetypes: ["Speedster", "Route Artist", "Elusive Route Runner", "Physical Route Runner", "Gritty Possession", "Contested Specialist", "Gadget"] },
  { position: "TE", archetypes: ["Vertical Threat", "Pure Possession", "Gritty Possession", "Physical Route Runner", "Pure Blocker"] },
  { position: "OT", archetypes: ["Well Rounded", "Pass Protector", "Agile", "Raw Strength (OT)"] },
  { position: "OG", archetypes: ["Well Rounded", "Pass Protector", "Agile", "Raw Strength (OG)"] },
  { position: "C", archetypes: ["Well Rounded", "Pass Protector", "Agile", "Raw Strength (C)"] },
  { position: "DE", archetypes: ["Edge Setter", "Power Rusher", "Speed Rusher", "Pure Power"] },
  { position: "DT", archetypes: ["Power Rusher", "Speed Rusher", "Pure Power", "Gap Specialist"] },
  { position: "OLB", archetypes: ["Thumper", "Signal Caller", "Lurker"] },
  { position: "MIKE", archetypes: ["Thumper", "Signal Caller", "Lurker"] },
  { position: "CB", archetypes: ["Field", "Bump and Run", "Boundary", "Zone"] },
  { position: "FS", archetypes: ["Hybrid", "Coverage Specialist", "Box Specialist"] },
  { position: "SS", archetypes: ["Hybrid", "Coverage Specialist", "Box Specialist"] },
  { position: "ATH", archetypes: [
      "ATH - Power Rusher", "ATH - East/West Playmaker", "ATH - Contested Specialist", 
      "ATH - Agile", "ATH - Pure Runner", "ATH - Dual Threat", "ATH - Contact Seeker", 
      "ATH - Lurker", "ATH - Pure Possession", "ATH - Thumper", "ATH - Backfield Threat", 
      "ATH - Physical Route Runner"
    ] 
  }
];

export default function ScoutingReport({ setView, players, setPlayers }) {
  const [form, setForm] = useState({
    name: '', position: 'QB', archetype: 'Pocket Passer', devTrait: 'Normal', stars: '5',
    attrs: Array(10).fill('')
  });

  const currentOptions = OPTIONS_REGISTRY.find(item => item.position === form.position);
  const availableArchetypes = currentOptions ? currentOptions.archetypes : [];

  useEffect(() => {
    if (availableArchetypes.length > 0) {
      setForm(f => ({ ...f, archetype: availableArchetypes[0] }));
    }
  }, [form.position]);

  // Swaps attribute fields instantly when archetype or position drop-downs are chosen
  let activeLabels = RECRUIT_FORM_OVERRIDES[form.archetype] || BASE_POSITION_CONFIG[form.position] || Array(10).fill('Attribute');

  const executeSubmit = (e) => {
    e.preventDefault();
    if (!form.name) return;

    const assignedAttributes = {};
    activeLabels.forEach((label, i) => {
      assignedAttributes[label] = Number(form.attrs[i]) || 0;
    });

    const scoreSum = Object.values(assignedAttributes).reduce((a, b) => a + b, 0);
    const avg = scoreSum / (activeLabels.length || 1);
    let staffGrade = 'C';

    if (form.devTrait === 'Elite' || avg >= 88) staffGrade = 'A+';
    else if (form.devTrait === 'Star' || avg >= 82) staffGrade = 'A';
    else if (form.devTrait === 'Impact' || avg >= 76) staffGrade = 'B';

    const record = {
      name: form.name,
      grade: staffGrade,
      group: form.position === 'ATH' ? 'Athlete Pipeline' : ['QB','HB','WR','TE','OT','OG','C'].includes(form.position) ? 'Offense' : 'Defense',
      position: form.position,
      archetype: form.archetype,
      stars: form.stars,
      devTrait: form.devTrait,
      attributes: assignedAttributes
    };

    setPlayers([record, ...players]);
    setView('database');
  };

  return (
    <div className="max-w-md mx-auto bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-2xl">
      <div className="bg-slate-950/40 px-5 py-3 border-b border-slate-800 text-xs font-black uppercase tracking-wider text-emerald-400">
        Manual Entry Terminal Form
      </div>
      <form onSubmit={executeSubmit} className="p-5 space-y-4">
        <div className="space-y-1">
          <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Player Name</label>
          <input type="text" value={form.name} onChange={e => setForm({...form, name: e.target.value})} className="w-full bg-slate-950 border border-slate-800 p-2 rounded text-xs focus:outline-none focus:border-emerald-500 text-slate-200" placeholder="Prospect Identity..." required />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Position Group</label>
            <select value={form.position} onChange={e => setForm({...form, position: e.target.value})} className="w-full bg-slate-950 border border-slate-800 p-2 rounded text-xs focus:outline-none focus:border-emerald-500 text-slate-200">
              {OPTIONS_REGISTRY.map(o => <option key={o.position} value={o.position}>{o.position}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Archetype Focus</label>
            <select value={form.archetype} onChange={e => setForm({...form, archetype: e.target.value})} className="w-full bg-slate-950 border border-slate-800 p-2 rounded text-xs focus:outline-none focus:border-emerald-500 text-slate-200">
              {availableArchetypes.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Dev Trait</label>
            <select value={form.devTrait} onChange={e => setForm({...form, devTrait: e.target.value})} className="w-full bg-slate-950 border border-slate-800 p-2 rounded text-xs focus:outline-none focus:border-emerald-500 text-slate-200">
              <option value="Normal">Normal</option>
              <option value="Impact">Impact</option>
              <option value="Star">Star</option>
              <option value="Elite">Elite</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Stars</label>
            <select value={form.stars} onChange={e => setForm({...form, stars: e.target.value})} className="w-full bg-slate-950 border border-slate-800 p-2 rounded text-xs focus:outline-none focus:border-emerald-500 text-slate-200">
              <option value="5">5 Stars</option>
              <option value="4">4 Stars</option>
              <option value="3">3 Stars</option>
              <option value="2">2 Stars</option>
              <option value="1">1 Star</option>
            </select>
          </div>
        </div>

        <div className="bg-slate-950 p-3 border border-slate-850 rounded-lg space-y-2">
          <div className="text-[10px] font-black uppercase tracking-widest text-emerald-400/80 border-b border-slate-800/60 pb-1">
            Dynamic Position Attributes
          </div>
          <div className="grid grid-cols-2 gap-2">
            {activeLabels.map((label, idx) => (
              <div key={idx} className="flex justify-between items-center bg-slate-900 border border-slate-800/40 p-1.5 rounded animate-fadeIn">
                <span className="text-[10px] font-medium text-slate-400 truncate pr-1">{label}</span>
                <input type="number" min="0" max="99" value={form.attrs[idx]} onChange={e => {
                  const updated = [...form.attrs];
                  updated[idx] = e.target.value;
                  setForm({...form, attrs: updated});
                }} className="w-12 bg-slate-950 border border-slate-850 text-center rounded text-xs py-0.5 font-bold text-emerald-400 focus:outline-none" />
              </div>
            ))}
          </div>
        </div>

        <button type="submit" className="w-full bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-black uppercase tracking-widest py-2.5 rounded text-xs transition shadow-lg">
          SUBMIT SCOUT DATA
        </button>
      </form>
    </div>
  );
}
