import React, { useState, useEffect } from 'react';
import { getStaffData } from './staffDB';

// --- CONSTANTS ---
export const RECRUIT_FORM_OVERRIDES = {
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

export const BASE_POSITION_CONFIG = {
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
  { position: "ATH", archetypes: ["ATH - Power Rusher", "ATH - East/West Playmaker", "ATH - Contested Specialist", "ATH - Agile", "ATH - Pure Runner", "ATH - Dual Threat", "ATH - Contact Seeker", "ATH - Lurker", "ATH - Pure Possession", "ATH - Thumper", "ATH - Backfield Threat", "ATH - Physical Route Runner"] }
];

export default function ScoutingReport({ setView, players, setPlayers }) {
  const [form, setForm] = useState({
    name: '', position: 'QB', archetype: 'Pocket Passer', devTrait: 'Normal', stars: '5',
    attrs: Array(10).fill('')
  });
  const [scoutImg, setScoutImg] = useState('');
  const [scoutName, setScoutName] = useState('Regional Scout');

    useEffect(() => {
    async function loadScout() {
      try {
        const img = await getStaffData('scout_img');
        const name = await getStaffData('scout_name');
        
        console.log("Database fetch result:", { img, name }); // DEBUG: Check console
        
        if (img) setScoutImg(img);
        if (name) setScoutName(name);
      } catch (err) {
        console.error("Database connection failed:", err);
      }
    }
    loadScout();
  }, []);

  const currentOptions = OPTIONS_REGISTRY.find(item => item.position === form.position);
  const availableArchetypes = currentOptions ? currentOptions.archetypes : [];

  useEffect(() => {
    if (availableArchetypes.length > 0) {
      setForm(f => ({ ...f, archetype: availableArchetypes[0] }));
    }
  }, [form.position]);

  let activeLabels = RECRUIT_FORM_OVERRIDES[form.archetype] || BASE_POSITION_CONFIG[form.position] || Array(10).fill('Attribute');
  
const copyPrompt = () => {
  const prompt = `Act as an advanced OCR and data entry assistant for my Google Sheets "Scout Staff" tracker. 

I am going to provide you with screenshots of fully scouted recruits. Your job is to extract the data and format it exactly to match the vertical layout of column C (Rows 2 through 17) in my spreadsheet. 

Extract and format the data using these strict rules:
1. Row 2 (Player Name): First and Last name capitalized (Title Case).
2. Row 3 (Position): Use the position abbreviation exactly as shown in the picture reference, with the following strict exceptions:
   - Convert "SAM" to "OLB"
   - Convert "WILL" to "OLB"
   - Convert "RT" to "OT"
   - Convert "LT" to "OT"
   - Convert "LG" to "OG"
   - Convert "RG" to "OG"
   - Convert "LEDG" to "DE"
   - Convert "REDG" to "DE"
3. Row 4 (Archetype): The player's specific archetype.
4. Row 5 (Dev Trait): The development trait (e.g., Normal, Impact, Star, Elite). If not visible, leave it completely blank.
5. Row 6 (Star Rating): Output ONLY the numerical value of the stars the recruit has (e.g., 5, 4, 3) referenced in the picture.
6. Row 7 (Header Spacer): Always leave a completely blank line here so the "Scouted Attributes" header row is skipped.
7. Rows 8-17 (Scouted Attributes): List ONLY the numerical values of the attributes, one per line. Read strictly DOWN the entire left column of the Attributes grid first (top to bottom, items 1-5), and then DOWN the entire right column of the grid second (top to bottom, items 6-10). Do not include the attribute names.

Output Isolation Rules for Copy-Pasting:
- Treat every single player as an entirely isolated entity. 
- Put each individual player's 16-line data block inside its own separate markdown code block (
\`\`\`text ... 
\`\`\`) so I can use the UI's one-click copy button for each player.
- Separate these code blocks from one another using a line with "***".

Do not include conversational filler, markdown bolding, or bullet points anywhere in the response. Output only the isolated player blocks.`;

  navigator.clipboard.writeText(prompt);
  alert("AI Prompt copied to clipboard!");
};

  const executeSubmit = (e) => {
    e.preventDefault();
    if (!form.name) return;
    const assignedAttributes = {};
    activeLabels.forEach((label, i) => { assignedAttributes[label] = Number(form.attrs[i]) || 0; });
    const scoreSum = Object.values(assignedAttributes).reduce((a, b) => a + b, 0);
    const avg = scoreSum / (activeLabels.length || 1);
    let staffGrade = 'C';
    if (form.devTrait === 'Elite' || avg >= 88) staffGrade = 'A+';
    else if (form.devTrait === 'Star' || avg >= 82) staffGrade = 'A';
    else if (form.devTrait === 'Impact' || avg >= 76) staffGrade = 'B';
    const record = { name: form.name, grade: staffGrade, group: form.position === 'ATH' ? 'Athlete Pipeline' : ['QB','HB','WR','TE','OT','OG','C'].includes(form.position) ? 'Offense' : 'Defense', position: form.position, archetype: form.archetype, stars: form.stars, devTrait: form.devTrait, attributes: assignedAttributes };
    setPlayers([record, ...players]);
    setView('database');
  };

  return (
    <div className="max-w-md mx-auto bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-2xl">
      <div className="flex items-center gap-4 p-4 bg-slate-950 border-b border-slate-800">
        {scoutImg ? <img src={scoutImg} alt="Regional Scout" className="w-12 h-12 rounded-lg object-cover border border-slate-700" /> : <div className="w-12 h-12 bg-slate-800 rounded-lg flex items-center justify-center text-[8px] text-slate-500">N/A</div>}
        <div>
          <h3 className="text-xs font-bold text-white">{scoutName}</h3>
          <p className="text-[9px] font-black uppercase text-sky-500 tracking-wider">Regional Scout</p>
        </div>
      </div>
      <form onSubmit={executeSubmit} className="p-5 space-y-4">
        {/* ... form fields ... */}

        <div className="bg-slate-800 p-4 rounded-lg border border-slate-700 my-4">
  <p className="text-xs text-slate-300 mb-3">
    Screenshot up to 10 players' attributes, copy and paste the AI prompt, 
    and/or enter in the data 1 by 1 and send to your Data Analyst.
  </p>
  <button 
  type="button" 
  onClick={copyPrompt}
  className="bg-sky-600 hover:bg-sky-500 text-white font-bold py-2 px-4 rounded text-xs w-full transition-colors"
>
  COPY AI PROMPT
</button>
</div>
        <button type="submit" className="w-full bg-emerald-500 py-2 rounded text-xs">SUBMIT</button>
      </form>
    </div>
  );
}