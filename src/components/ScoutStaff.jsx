import React, { useState, useEffect } from 'react';
import FrontPage from './ScoutStaffFrontPage';
import ScoutingReport from './ScoutingReport';
import PlayerDatabase from './PlayerDatabase';
import ScoutAnalysis from './ScoutAnalysis';
import ThresholdLookup from './ThresholdLookup';
import PlayerCount from './PlayerCount';

// =========================================================================
// 1. POSITION CONFIGURATION MAP (Baking your spreadsheet rules into the code)
// =========================================================================
const POSITION_CONFIG = {
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

// Underlying skill arrays used to resolve archetype overrides dynamically
const BASE_ARRAYS = {
  WR_STANDARD: ["Awareness", "Speed", "Acceleration", "Catching", "Catch In Traffic", "Spectacular Catch", "Short Route", "Medium Route", "Deep Route", "Release"],
  WR_AGILITY: ["Awareness", "Speed", "Acceleration", "Catching", "Catch In Traffic", "Spectacular Catch", "Short Route", "Medium Route", "Deep Route", "Agility"],
  WR_BLOCK: ["Awareness", "Speed", "Acceleration", "Catching", "Catch In Traffic", "Spectacular Catch", "Short Route", "Medium Route", "Deep Route", "Run Block"],
  WR_THROWS: ["Awareness", "Speed", "Acceleration", "Catching", "Catch In Traffic", "Spectacular Catch", "Short Route", "Medium Route", "Deep Route", "Throw Power"],
  TE_VERTICAL: ["Awareness", "Speed", "Strength", "Acceleration", "Run Block", "Pass Block", "Catching", "Catch In Traffic", "Medium Route", "Deep Route"],
  TE_PHYSICAL: ["Awareness", "Speed", "Strength", "Acceleration", "Run Block", "Pass Block", "Catching", "Catch In Traffic", "Short Route", "Medium Route"],
  LINEMAN_STRENGTH: ["Awareness", "Run Block", "Run Block Power", "Run Block Finesse", "Pass Block", "Pass Block Power", "Pass Block Finesse", "Impact Blocking", "Agility", "Strength"],
  PASSER: ["Awareness", "Throw Power", "Short Accuracy", "Medium Accuracy", "Deep Accuracy", "Throw On Run", "Under Pressure", "Break Sack", "Speed", "Acceleration"],
  RUNNER: ["Awareness", "Speed", "Acceleration", "Carrying", "Break Tackle", "Change of Direction", "Juke Move", "Spin Move", "BC Vision", "Catching"],
  POWER_RUSHER: ["Awareness", "Strength", "Acceleration", "Block Shedding", "Tackle", "Hit Power", "Power Moves", "Finesse Moves", "Speed", "Pursuit"],
  LINEMAN_AGILE: ["Awareness", "Run Block", "Run Block Power", "Run Block Finesse", "Pass Block", "Pass Block Power", "Pass Block Finesse", "Impact Blocking", "Agility", "Acceleration"],
  LURKER: ["Awareness", "Speed", "Acceleration", "Strength", "Play Recognition", "Tackle", "Hit Power", "Pursuit", "Man Coverage", "Zone Coverage"],
  THUMPER: ["Awareness", "Speed", "Acceleration", "Strength", "Play Recognition", "Tackle", "Hit Power", "Pursuit", "Man Coverage", "Zone Coverage"]
};

// =========================================================================
// 2. ARCHETYPE CONFIG OVERRIDES (Seamlessly maps overrides & ATH variations)
// =========================================================================
const ARCHETYPE_CONFIG_OVERRIDES = {
  "Speedster": BASE_ARRAYS.WR_STANDARD,
  "Route Artist": BASE_ARRAYS.WR_AGILITY,
  "Elusive Route Runner": BASE_ARRAYS.WR_AGILITY,
  "Physical Route Runner": BASE_ARRAYS.WR_STANDARD,
  "Gritty Possession": BASE_ARRAYS.WR_BLOCK,
  "Contested Specialist": BASE_ARRAYS.WR_STANDARD,
  "Gadget": BASE_ARRAYS.WR_THROWS,
  "Vertical Threat": BASE_ARRAYS.TE_VERTICAL,
  "Raw Strength (OT)": BASE_ARRAYS.LINEMAN_STRENGTH,
  "Raw Strength (OG)": BASE_ARRAYS.LINEMAN_STRENGTH,
  "Raw Strength (C)": BASE_ARRAYS.LINEMAN_STRENGTH,
  
  // Athlete Direct Skill Routing Logic
  "ATH - Power Rusher": BASE_ARRAYS.POWER_RUSHER,
  "ATH - East/West Playmaker": BASE_ARRAYS.RUNNER,
  "ATH - Contested Specialist": BASE_ARRAYS.WR_STANDARD,
  "ATH - Agile": BASE_ARRAYS.LINEMAN_AGILE,
  "ATH - Pure Runner": BASE_ARRAYS.PASSER, 
  "ATH - Dual Threat": BASE_ARRAYS.PASSER,
  "ATH - Contact Seeker": BASE_ARRAYS.RUNNER,
  "ATH - Lurker": BASE_ARRAYS.LURKER,
  "ATH - Pure Possession": BASE_ARRAYS.TE_PHYSICAL,
  "ATH - Thumper": BASE_ARRAYS.THUMPER,
  "ATH - Backfield Threat": BASE_ARRAYS.RUNNER,
  "ATH - Physical Route Runner": BASE_ARRAYS.TE_PHYSICAL
};

// =========================================================================
// 3. MASTER TERMINAL COMPONENT EXECUTIVE
// =========================================================================
export const ScoutStaff = () => {
  const [subView, setSubView] = useState('home');
  const [pasteInput, setPasteInput] = useState('');
  const [recruits, setRecruits] = useState(() => {
    const saved = localStorage.getItem('scout_staff_clean_players');
    return saved ? JSON.parse(saved) : [];
  });

  useEffect(() => {
    localStorage.setItem('scout_staff_clean_players', JSON.stringify(recruits));
  }, [recruits]);

  const handleIngest = (e) => {
    e.preventDefault();
    try {
      const rawLines = pasteInput.split('\n').map(line => line.trim());
      const filteredLines = rawLines.filter(line => !line.startsWith('```') && line !== '***');

      if (filteredLines.length < 16) {
        throw new Error(`Invalid data profile. Found only ${filteredLines.length} values.`);
      }

      const name = filteredLines[0];
      const position = filteredLines[1].toUpperCase();
      const archetype = filteredLines[2];
      const devTrait = filteredLines[3] || "Normal";
      const stars = filteredLines[4];

      let configLabels = ARCHETYPE_CONFIG_OVERRIDES[archetype] || POSITION_CONFIG[position] || [];

      if (configLabels.length === 0) {
        throw new Error(`Unsupported position abbreviation found: "${position}"`);
      }

      const attributeScores = filteredLines.slice(6, 16).map(num => parseInt(num, 10));

      let mappedAttributes = {};
      configLabels.forEach((label, index) => {
        if (!isNaN(attributeScores[index])) {
          mappedAttributes[label] = attributeScores[index];
        }
      });

      const scoreSum = Object.values(mappedAttributes).reduce((a, b) => a + b, 0);
      const avg = scoreSum / (Object.keys(mappedAttributes).length || 1);
      let staffGrade = 'C';

      if (devTrait === 'Elite' || avg >= 88) staffGrade = 'A+';
      else if (devTrait === 'Star' || avg >= 82) staffGrade = 'A';
      else if (devTrait === 'Impact' || avg >= 76) staffGrade = 'B';

      const newRecruitObj = {
        name,
        position,
        archetype,
        devTrait,
        stars,
        group: position === 'ATH' ? 'Athlete Pipeline' : ['QB','HB','WR','TE','OT','OG','C'].includes(position) ? 'Offense' : 'Defense',
        attributes: mappedAttributes,
        grade: staffGrade
      };

      setRecruits([newRecruitObj, ...recruits]);
      setPasteInput('');
      setSubView('database');
    } catch (err) {
      alert(`Ingest Error: ${err.message}`);
    }
  };

  return (
    <div className="w-full p-6 bg-slate-950 text-slate-100 rounded-xl border border-slate-800 shadow-2xl">
      <header className="flex justify-between items-center mb-6 border-b border-slate-800 pb-4">
        <div>
          <h2 className="text-2xl font-bold text-white cursor-pointer" onClick={() => setSubView('home')}>Scout Staff Intelligence Engine</h2>
          <p className="text-sm text-slate-400">Context-aware structural data parsing engine mapped across positional archetypes</p>
        </div>
        {subView !== 'home' && (
          <button onClick={() => setSubView('home')} className="text-xs font-bold uppercase tracking-wider px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg hover:bg-slate-800 text-slate-400 transition">
            ← Main Hub
          </button>
        )}
      </header>

      <div className="mt-4">
        {subView === 'home' && <FrontPage setView={setSubView} />}
        
        {subView === 'input' && (
          <div className="space-y-4 max-w-xl mx-auto">
            <form onSubmit={handleIngest} className="space-y-4">
              <label className="block text-sm font-medium text-slate-300">Paste your 16-line vertical AI text block below:</label>
              <textarea
                value={pasteInput}
                onChange={(e) => setPasteInput(e.target.value)}
                rows={12}
                className="w-full p-4 rounded-lg bg-slate-900 border border-slate-800 text-slate-100 font-mono text-sm focus:outline-none focus:border-emerald-500"
                placeholder={"Zion Cross\nWR\nSpeedster\nElite\n5\n...\n88\n96\n..."}
                required
              />
              <button type="submit" className="w-full bg-sky-600 hover:bg-sky-500 text-white font-medium py-2.5 rounded-lg transition">
                File Scouting Report to Staff
              </button>
            </form>
          </div>
        )}

        {subView === 'database' && <PlayerDatabase players={recruits} />}
        {subView === 'analysis' && <ScoutAnalysis />}
        {subView === 'thresholds' && <ThresholdLookup />}
        {subView === 'counts' && <PlayerCount players={recruits} />}
      </div>
    </div>
  );
}; //

export default ScoutStaff;
