import React, { useState } from 'react';

// =========================================================================
// POSITION CONFIGURATION MAP (Baking your spreadsheet rules into the code)
// =========================================================================
const POSITION_CONFIG = {
  QB: ["Awareness", "Throw Power", "Short Accuracy", "Medium Accuracy", "Deep Accuracy", "Throw On Run", "Under Pressure", "Break Sack", "Speed", "Acceleration"],
  HB: ["Awareness", "Speed", "Acceleration", "Carrying", "Break Tackle", "Change of Direction", "Juke Move", "Spin Move", "BC Vision", "Catching"],
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
};

// Specialized Overrides for WR Archetypes based on your sheet config
const ARCHETYPE_CONFIG_OVERRIDES = {
  "Speedster":             ["Awareness", "Speed", "Acceleration", "Catching", "Catch In Traffic", "Spectacular Catch", "Short Route", "Medium Route", "Deep Route", "Release"],
  "Route Artist":          ["Awareness", "Speed", "Acceleration", "Catching", "Catch In Traffic", "Spectacular Catch", "Short Route", "Medium Route", "Deep Route", "Agility"],
  "Elusive Route Runner":   ["Awareness", "Speed", "Acceleration", "Catching", "Catch In Traffic", "Spectacular Catch", "Short Route", "Medium Route", "Deep Route", "Agility"],
  "Physical Route Runner": ["Awareness", "Speed", "Acceleration", "Catching", "Catch In Traffic", "Spectacular Catch", "Short Route", "Medium Route", "Deep Route", "Release"],
  "Gritty Possession":     ["Awareness", "Speed", "Acceleration", "Catching", "Catch In Traffic", "Spectacular Catch", "Short Route", "Medium Route", "Deep Route", "Run Block"],
  "Contested Specialist":  ["Awareness", "Speed", "Acceleration", "Catching", "Catch In Traffic", "Spectacular Catch", "Short Route", "Medium Route", "Deep Route", "Release"],
  "Gadget":                ["Awareness", "Speed", "Acceleration", "Catching", "Catch In Traffic", "Spectacular Catch", "Short Route", "Medium Route", "Deep Route", "Throw Power"],
  "Vertical Threat":       ["Awareness", "Speed", "Acceleration", "Catching", "Catch In Traffic", "Spectacular Catch", "Short Route", "Medium Route", "Deep Route", "Deep Route"],
};

const ScoutStaff = () => {
  const [recruits, setRecruits] = useState([
    { name: "Malik Harrison", position: "WR", archetype: "Speedster", devTrait: "Elite", stars: "5", attributes: { "Awareness": 88, "Speed": 98, "Acceleration": 96, "Release": 90 }, staffGrade: "A+" }
  ]);
  
  const [pasteInput, setPasteInput] = useState('');
  const [activeTab, setActiveTab] = useState('board');

  // =========================================================================
  // LINE-BY-LINE INGEST ENGINE (Maps directly to your 16-line vertical AI format)
  // =========================================================================
  const handleIngest = (e) => {
    e.preventDefault();
    try {
      // Clean up inputs and split by vertical row arrays
      const rawLines = pasteInput.split('\n').map(line => line.trim());
      
      // Filter out markdown syntax blocks if accidentally included in the paste box
      const filteredLines = rawLines.filter(line => !line.startsWith('```') && line !== '***');

      if (filteredLines.length < 16) {
        throw new Error(`Invalid data profile. Found only ${filteredLines.length} values. Ensure you copied the entire 16-line vertical block.`);
      }

      // Step-by-Step Destructuring matching your AI output template sequence
      const name = filteredLines[0];
      const position = filteredLines[1].toUpperCase();
      const archetype = filteredLines[2];
      const devTrait = filteredLines[3] || "Normal";
      const stars = filteredLines[4];
      
      // Skip array position index 5 (the header spacer gap line)
      const attributeScores = filteredLines.slice(6, 16).map(num => parseInt(num, 10));

      // Choose which dictionary array layout configuration to apply
      let configLabels = POSITION_CONFIG[position] || [];
      if (position === 'WR' && ARCHETYPE_CONFIG_OVERRIDES[archetype]) {
        configLabels = ARCHETYPE_CONFIG_OVERRIDES[archetype];
      }

      if (configLabels.length === 0) {
        throw new Error(`Unsupported position abbreviation found: "${position}"`);
      }

      // Build out the dynamic tracking attributes key-value map object dynamically
      let mappedAttributes = {};
      configLabels.forEach((label, index) => {
        if (!isNaN(attributeScores[index])) {
          mappedAttributes[label] = attributeScores[index];
        }
      });

      // Simple AI Staff Grading Logic using parsed values
      const scoreSum = Object.values(mappedAttributes).reduce((a, b) => a + b, 0);
      const avg = scoreSum / (Object.keys(mappedAttributes).length || 1);
      let staffGrade = 'C';
      if (devTrait === 'Elite' || avg >= 88) staffGrade = 'A+';
      else if (devTrait === 'Star' || avg >= 82) staffGrade = 'A';
      else if (devTrait === 'Impact' || avg >= 76) staffGrade = 'B';

      const newRecruitObj = { name, position, archetype, devTrait, stars, attributes: mappedAttributes, staffGrade };

      setRecruits([newRecruitObj, ...recruits]);
      setPasteInput('');
      setActiveTab('board');
    } catch (err) {
      alert(`Ingest Error: ${err.message}`);
    }
  };

  return (
    <div className="w-full p-6 bg-slate-950 text-slate-100 rounded-xl border border-slate-800 shadow-2xl">
      {/* Header Panel */}
      <div className="flex justify-between items-center mb-6 border-b border-slate-800 pb-4">
        <div>
          <h2 className="text-2xl font-bold text-white">Scout Staff Intelligence Engine</h2>
          <p className="text-sm text-slate-400">Context-aware structural data parsing engine mapped across positional archetypes.</p>
        </div>
        <div className="flex space-x-2 bg-slate-900 p-1 rounded-lg border border-slate-800">
          <button onClick={() => setActiveTab('board')} className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${activeTab === 'board' ? 'bg-sky-500 text-white' : 'text-slate-400'}`}>Roster Board</button>
          <button onClick={() => setActiveTab('ingest')} className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${activeTab === 'ingest' ? 'bg-sky-500 text-white' : 'text-slate-400'}`}>Ingest Room</button>
        </div>
      </div>

      {/* ROSTER TABS SCREEN DISPLAY VIEWPORT */}
      {activeTab === 'board' && (
        <div className="grid grid-cols-1 gap-4">
          {recruits.map((recruit, index) => (
            <div key={index} className="p-4 bg-slate-900 border border-slate-800 rounded-xl flex flex-col md:flex-row justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-white">{recruit.name}</h3>
                <div className="flex flex-wrap gap-2 mt-1.5 items-center text-xs">
                  <span className="text-sky-400 font-bold bg-sky-400/10 px-2 py-0.5 rounded border border-sky-400/20">{recruit.position}</span>
                  <span className="text-slate-400 font-medium">{recruit.archetype}</span>
                  <span className="text-purple-400 font-semibold bg-purple-400/10 px-2 py-0.5 rounded border border-purple-400/20">{recruit.devTrait}</span>
                  <span className="text-amber-400 font-bold bg-amber-400/10 px-2 py-0.5 rounded border border-amber-400/20">{recruit.stars} ★</span>
                </div>
              </div>
              
              {/* Context Render Attributes Panel Display */}
              <div className="flex flex-wrap gap-2 items-center bg-slate-950 p-3 rounded-lg border border-slate-800/60 flex-1 max-w-2xl">
                {Object.entries(recruit.attributes).map(([key, val]) => (
                  <div key={key} className="text-xs bg-slate-900 px-2 py-1 rounded border border-slate-800 flex items-center gap-1.5">
                    <span className="text-slate-400">{key}:</span>
                    <span className="text-white font-bold">{val}</span>
                  </div>
                ))}
              </div>
              
              <div className="flex items-center justify-center bg-slate-950 border border-slate-800 rounded-xl px-6 py-2">
                <div className="text-center">
                  <div className="text-xs text-slate-500 font-bold uppercase tracking-wider">Staff Grade</div>
                  <div className="text-2xl font-black text-emerald-400">{recruit.staffGrade}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* PROCESSING INPUT ROOM ELEMENT */}
      {activeTab === 'ingest' && (
        <form onSubmit={handleIngest} className="space-y-4 max-w-xl mx-auto py-4">
          <label className="block text-sm font-medium text-slate-300">Paste your 16-line vertical AI text block below:</label>
          <textarea
            value={pasteInput}
            onChange={(e) => setPasteInput(e.target.value)}
            rows={12}
            placeholder={`Zion Cross&#10;WR&#10;Speedster&#10;Elite&#10;5&#10;&#10;88&#10;98&#10;96&#10;92&#10;85&#10;87&#10;89&#10;91&#10;94&#10;90`}
            className="w-full p-4 rounded-lg bg-slate-900 border border-slate-800 text-slate-100 font-mono text-sm focus:outline-none focus:border-sky-500 leading-relaxed"
          />
          <button type="submit" className="w-full bg-sky-600 hover:bg-sky-500 text-white font-medium py-2.5 rounded-lg transition-colors shadow-lg">
            File Scouting Report to Staff
          </button>
        </form>
      )}
    </div>
  );
};

export default ScoutStaff;
