import React, { useState, useEffect, useMemo } from 'react';
import FrontPage from './ScoutStaffFrontPage';
import ScoutingReport from './ScoutingReport';
import PlayerDatabase from './PlayerDatabase';
import ScoutAnalysis from './ScoutAnalysis';
import ThresholdLookup from './ThresholdLookup';
import PlayerCount from './PlayerCount';
import { useDynasty, getRecruitingCommitments } from '../context/DynastyContext';
import { flattenClassCommitments } from '../utils/recruitingScore';
import { getStaffData } from './staffDB';
import { useTeamColors } from '../hooks/useTeamColors';

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

// ── Portal Board sub-view ─────────────────────────────────────────────────────
function PortalBoard({ committedRecruits, teamColors, teamLogo }) {
  const p = teamColors?.primary || '#374151';
  const portalPlayers = (committedRecruits || []).filter(r => r.isPortal || r.previousTeam);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header strip */}
      <div className="flex items-center gap-3 px-4 py-3 rounded-xl" style={{ background: '#080c14', border: `1px solid ${p}22` }}>
        {teamLogo && <img src={teamLogo} alt="" className="w-6 h-6 object-contain flex-shrink-0" style={{ opacity: 0.7 }} />}
        <p style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 'clamp(1.1rem, 3vw, 1.5rem)', color: p, letterSpacing: '0.08em', lineHeight: 1 }}>TRANSFER PORTAL BOARD</p>
        <span className="ml-auto text-[9px] font-black uppercase tracking-widest" style={{ color: `${p}99` }}>
          {portalPlayers.length} Transfer{portalPlayers.length !== 1 ? 's' : ''}
        </span>
      </div>

      {portalPlayers.length === 0 ? (
        <div className="rounded-xl p-8 text-center" style={{ background: '#080c14', border: `1px solid ${p}22` }}>
          <p className="text-sm text-slate-500">No portal players in this year&apos;s class.</p>
          <p className="text-[10px] text-slate-600 mt-1">Portal commits are added via the Recruiting page. They appear here automatically once saved.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {portalPlayers.map((player, i) => {
            const stars = Number(player.stars) || 0;
            const devCls = {
              Elite: 'bg-amber-950 border-amber-700 text-amber-400',
              Star:  'bg-sky-950 border-sky-700 text-sky-400',
              Impact:'bg-emerald-950 border-emerald-700 text-emerald-400',
            }[player.devTrait] || 'bg-slate-800 border-slate-700 text-slate-400';

            return (
              <div key={player.pid || player.name || i}
                className="p-3 rounded-xl space-y-2"
                style={{ background: `linear-gradient(135deg, ${p}12, #0f172a)`, border: `1px solid ${p}30` }}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-black text-white truncate">{player.name || 'Unknown'}</p>
                    <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">{player.position || '—'} · {player.archetype || '—'}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className="flex gap-0.5">
                      {[...Array(5)].map((_, si) => (
                        <svg key={si} className="w-2.5 h-2.5" fill={si < stars ? '#f59e0b' : '#334155'} viewBox="0 0 20 20">
                          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                        </svg>
                      ))}
                    </span>
                    {player.devTrait && (
                      <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded border ${devCls}`}>{player.devTrait}</span>
                    )}
                  </div>
                </div>

                {player.previousTeam && (
                  <div className="flex items-center gap-1.5 text-[9px] text-slate-500">
                    <span className="font-bold uppercase tracking-wider text-sky-600">FROM</span>
                    <span className="text-slate-400 truncate">{player.previousTeam}</span>
                  </div>
                )}

                {(player.nationalRank || player.positionRank) && (
                  <div className="flex gap-3 text-[9px] text-slate-500">
                    {player.nationalRank && <span>Natl <span className="text-white font-bold">#{player.nationalRank}</span></span>}
                    {player.positionRank && <span>{player.position} <span className="text-white font-bold">#{player.positionRank}</span></span>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function ScoutStaff() {
  const { currentDynasty, updateDynasty, isViewOnly } = useDynasty();
  const teamColors = useTeamColors(currentDynasty?.teamName, currentDynasty?.teams);
  const teamLogo   = currentDynasty?.teams?.[currentDynasty?.currentTid]?.logo || '';
  const p = teamColors?.primary   || '#374151';
  const s = teamColors?.secondary || '#ffffff';
  const [subView, setSubView] = useState('home');
  const [pasteInput, setPasteInput] = useState('');
  const [scoutImg, setScoutImg] = useState('');
  const [scoutName, setScoutName] = useState('Regional Scout');

  useEffect(() => {
    async function loadScout() {
      const img = await getStaffData('scout_img');
      const name = await getStaffData('scout_name');
      if (img) setScoutImg(img);
      if (name) setScoutName(name);
    }
    loadScout();
  }, []);

  // Scout board lives in dynasty.scoutBoard (per-dynasty, synced via dynasty storage tier)
  const recruits = currentDynasty?.scoutBoard || [];
  const setRecruits = async (newRecruitsOrFn) => {
    if (!currentDynasty?.id) return;
    const current = currentDynasty?.scoutBoard || [];
    const newArr = typeof newRecruitsOrFn === 'function' ? newRecruitsOrFn(current) : newRecruitsOrFn;
    await updateDynasty(currentDynasty.id, { scoutBoard: newArr });
  };

  // Committed recruits for the current team/year, pulled from dynasty recruiting data
  const committedRecruits = useMemo(() => {
    if (!currentDynasty?.currentTid || !currentDynasty?.currentYear) return [];
    const raw = getRecruitingCommitments(currentDynasty, currentDynasty.currentTid, currentDynasty.currentYear);
    return flattenClassCommitments(raw);
  }, [currentDynasty]);

  const handleIngest = (e) => {
    e.preventDefault();
    try {
      const sanitizedText = pasteInput
        .replaceAll('&#10;', '\n')
        .replaceAll('&#13;', '\n')
        .trim();

      const rawLines = sanitizedText.split('\n').map(line => line.trim());
      const filteredLines = rawLines.filter(line => !line.startsWith('```') && line !== '***' && line !== '');

      if (filteredLines.length < 15) {
        throw new Error(`Invalid data profile. Found only ${filteredLines.length} values.`);
      }

      const name = filteredLines[0];
      const position = filteredLines[1].toUpperCase();
      const rawArchetype = filteredLines[2];
      const devTrait = filteredLines[3] || "Normal";
      const stars = filteredLines[4];

      // Normalize position-tagged archetypes (e.g. "Raw Strength" → "Raw Strength (OT)")
      const archetype = ARCHETYPE_CONFIG_OVERRIDES[rawArchetype]
        ? rawArchetype
        : (ARCHETYPE_CONFIG_OVERRIDES[`${rawArchetype} (${position})`] ? `${rawArchetype} (${position})` : rawArchetype);

      let configLabels = ARCHETYPE_CONFIG_OVERRIDES[archetype] || POSITION_CONFIG[position] || [];

      if (configLabels.length === 0) {
        throw new Error(`Unsupported position abbreviation found: "${position}"`);
      }

      // blank spacer line is already filtered out — attributes start at index 5
      const attributeScores = filteredLines.slice(5, 15).map(num => parseInt(num, 10));

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

  const VIEW_META = {
    home:      { title: 'Scout Staff Intelligence Engine', sub: 'Integrating field intelligence with structured positional data' },
    input:     { title: 'Scouting Report',   sub: 'Record Player Metrics' },
    database:  { title: 'Player Database',   sub: 'Complete Data Storage' },
    thresholds:{ title: 'Threshold Lookup',  sub: 'Player Comparison Tool' },
    analysis:  { title: 'Data Analysis',     sub: 'Staff Recommendations' },
    counts:    { title: 'Player Count',      sub: 'Current Overview' },
    portal:    { title: 'Portal Board',      sub: 'Transfer portal commitments' },
  };
  const meta = VIEW_META[subView] || VIEW_META.home;

  const teamTheme = { teamColors, teamLogo };

  return (
    <div
      className="w-full p-6 text-slate-100 rounded-xl shadow-2xl relative overflow-hidden"
      style={{
        background: `linear-gradient(155deg, ${p}22 0%, #020617 35%, #020617 70%, ${s}0a 100%)`,
        border: `1px solid ${p}35`,
      }}
    >
      {/* Full-page logo watermark */}
      {teamLogo && (
        <img
          src={teamLogo}
          alt=""
          className="absolute top-6 right-6 w-56 h-56 pointer-events-none select-none object-contain"
          style={{ opacity: 0.07, filter: 'grayscale(20%)' }}
        />
      )}

      <header className="flex justify-between items-center mb-6 pb-4 relative" style={{ borderBottom: `1px solid ${p}40` }}>
        <div>
          <h2 className="text-2xl font-bold text-white cursor-pointer" onClick={() => setSubView('home')}>{meta.title}</h2>
          <p className="text-sm text-slate-400">{meta.sub}</p>
        </div>
        {subView !== 'home' && (
          <button
            onClick={() => setSubView('home')}
            className="text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded-lg text-slate-400 transition"
            style={{ background: `${p}18`, border: `1px solid ${p}40` }}
          >
            ← Main Hub
          </button>
        )}
      </header>

      <div className="mt-4">
        {subView === 'home' && <FrontPage setView={setSubView} currentTeamName={currentDynasty?.teamName || 'college football team'} currentYear={currentDynasty?.currentYear || new Date().getFullYear()} {...teamTheme} />}

        {subView === 'input' && (
          <div className="space-y-4">

            {/* Header strip */}
            <div className="flex items-center gap-3">
              {teamLogo && (
                <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 flex items-center justify-center" style={{ background: `${p}22`, border: `1px solid ${p}44` }}>
                  <img src={teamLogo} alt="" className="w-8 h-8 object-contain" />
                </div>
              )}
              <div>
                <p className="text-[9px] font-black uppercase tracking-[0.2em] leading-none" style={{ color: `${p}bb` }}>Scout Staff Intelligence Engine</p>
                <h2 className="text-white font-black leading-none mt-0.5" style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 'clamp(1.4rem, 3vw, 2rem)', letterSpacing: '0.04em' }}>
                  SCOUTING REPORT
                </h2>
              </div>
            </div>

            {/* Two-column body: portrait left, cards right */}
            <div className="flex flex-col sm:flex-row gap-3 items-start">

              {/* ── Scout portrait card (left) — narrow, tall enough to anchor the layout ── */}
              <div className="relative rounded-xl overflow-hidden shadow-xl w-full h-44 sm:w-[120px] sm:h-[320px] sm:flex-shrink-0">
                {scoutImg ? (
                  <img src={scoutImg} alt="Regional Scout" className="absolute inset-0 w-full h-full object-cover object-top" />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center" style={{ background: `linear-gradient(160deg, ${p}33 0%, #020617 100%)` }}>
                    {teamLogo && <img src={teamLogo} alt="" className="w-12 h-12 object-contain select-none pointer-events-none" style={{ opacity: 0.12 }} />}
                  </div>
                )}
                <div className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,0.15) 40%, rgba(0,0,0,0.82) 68%, rgba(0,0,0,0.92) 100%)' }} />
                <div className="absolute inset-0 pointer-events-none" style={{ background: `linear-gradient(to bottom, transparent 45%, ${p}55 100%)` }} />
                <div className="absolute top-2 left-2 pointer-events-none">
                  <span className="text-[7px] font-black uppercase tracking-[0.15em] px-1.5 py-0.5 rounded" style={{ background: 'rgba(0,0,0,0.6)', color: p, backdropFilter: 'blur(4px)', border: `1px solid ${p}44` }}>Scout</span>
                </div>
                <div className="absolute bottom-0 left-0 right-0 p-2">
                  <div className="w-4 h-0.5 mb-1 rounded-full" style={{ background: p }} />
                  {(() => {
                    const parts = scoutName.trim().split(' ');
                    const last = parts.pop() || '';
                    const first = parts.join(' ');
                    return (
                      <>
                        {first && <p className="leading-none text-[7px] font-black uppercase tracking-[0.12em]" style={{ color: 'rgba(255,255,255,0.7)', textShadow: '0 1px 6px rgba(0,0,0,1)' }}>{first}</p>}
                        <p className="text-white leading-none font-black" style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '1.05rem', letterSpacing: '0.04em', textShadow: '0 2px 10px rgba(0,0,0,1)' }}>{last.toUpperCase()}</p>
                      </>
                    );
                  })()}
                  <p className="text-[6px] font-black uppercase tracking-[0.12em] mt-0.5" style={{ color: p }}>Regional Scout</p>
                </div>
              </div>

              {/* ── Right column: compact action cards ── */}
              <div className="flex-1 space-y-2 min-w-0">

                {/* Step 1 — AI Prompt: compact inline row */}
                <div className="relative rounded-xl overflow-hidden" style={{ background: '#080c14', border: `1px solid ${p}22` }}>
                  {teamLogo && <img src={teamLogo} alt="" className="absolute right-2 top-1/2 -translate-y-1/2 w-14 h-14 object-contain pointer-events-none select-none" style={{ opacity: 0.06 }} />}
                  <div className="relative p-3.5 flex items-center gap-4">
                    <div className="min-w-0 flex-1">
                      <p className="text-[8px] font-black uppercase tracking-[0.18em] leading-none" style={{ color: `${p}99` }}>Step 1</p>
                      <h3 className="text-white font-black leading-tight mt-0.5" style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '1.25rem', letterSpacing: '0.04em' }}>COPY AI PROMPT</h3>
                      <p className="text-[10px] text-slate-500 leading-snug mt-0.5 hidden sm:block">Screenshot recruits, then run this prompt to extract attribute data.</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
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
4. Row 5 (Dev Trait): The development trait. Use EXACTLY one of these five values: Normal, Impact, Star, Elite, Hidden. Use "Hidden" when the dev trait is not yet revealed or visible in the screenshot (the player's dev trait is sealed until National Signing Day). Do NOT leave this line blank — if unseen, write Hidden.
5. Row 6 (Star Rating): Output ONLY the numerical value of the stars the recruit has (e.g., 5, 4, 3) referenced in the picture.
6. Row 7 (Header Spacer): Always leave a completely blank line here so the "Scouted Attributes" header row is skipped.
7. Rows 8-17 (Scouted Attributes): List ONLY the numerical values of the attributes, one per line. Read strictly DOWN the entire left column of the Attributes grid first (top to bottom, items 1-5), and then DOWN the entire right column of the grid second (top to bottom, items 6-10). Do not include the attribute names.

Output Isolation Rules for Copy-Pasting:
- Treat every single player as an entirely isolated entity.
- Put each individual player's 16-line data block inside its own separate markdown code block (\`\`\`text ... \`\`\`) so I can use the UI's one-click copy button for each player.
- Separate these code blocks from one another using a line with "***".

Do not include conversational filler, markdown bolding, or bullet points anywhere in the response. Output only the isolated player blocks.`;
                        navigator.clipboard.writeText(prompt);
                        alert('AI Prompt copied to clipboard!');
                      }}
                      className="flex-shrink-0 px-4 py-2 rounded-lg font-black text-xs uppercase tracking-wider transition-all whitespace-nowrap"
                      style={{ background: p, color: '#fff' }}
                      onMouseEnter={e => e.currentTarget.style.opacity = '0.8'}
                      onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                    >
                      Copy Prompt
                    </button>
                  </div>
                </div>

                {/* Step 2 — File the Report */}
                <div className="relative rounded-xl overflow-hidden" style={{ background: '#080c14', border: `1px solid ${p}22` }}>
                  {teamLogo && <img src={teamLogo} alt="" className="absolute right-2 top-3 w-14 h-14 object-contain pointer-events-none select-none" style={{ opacity: 0.06 }} />}
                  <div className="relative p-3.5 space-y-2">
                    <div>
                      <p className="text-[8px] font-black uppercase tracking-[0.18em] leading-none" style={{ color: `${p}99` }}>Step 2</p>
                      <h3 className="text-white font-black leading-tight mt-0.5" style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '1.25rem', letterSpacing: '0.04em' }}>FILE THE REPORT</h3>
                    </div>
                    <form onSubmit={handleIngest} className="space-y-2">
                      <textarea
                        value={pasteInput}
                        onChange={(e) => setPasteInput(e.target.value)}
                        rows={17}
                        className="w-full p-2.5 rounded-lg font-mono text-xs text-slate-200 focus:outline-none resize-none transition-colors leading-relaxed"
                        style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${p}25`, caretColor: 'white' }}
                        onFocus={e => e.currentTarget.style.borderColor = `${p}66`}
                        onBlur={e => e.currentTarget.style.borderColor = `${p}25`}
                        placeholder={"Zion Cross\nWR\nSpeedster\nElite\n5\n\n88\n96\n79\n84\n91\n88\n74\n83\n90\n86"}
                        required
                      />
                      <button
                        type="submit"
                        className="w-full py-2 rounded-lg font-black text-xs uppercase tracking-wider transition-all"
                        style={{ background: '#10b981', color: '#fff' }}
                        onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
                        onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                      >
                        File Scouting Report to Staff
                      </button>
                    </form>
                  </div>
                </div>

              </div>{/* end right column */}
            </div>{/* end two-column flex */}

          </div>
        )}

        {subView === 'database'   && <PlayerDatabase players={recruits} roleContext="Regional Scout" {...teamTheme} onDelete={p => setRecruits(prev => prev.filter(r => r !== p))} onEdit={(updated, original) => setRecruits(prev => prev.map(r => r === original ? updated : r))} onGoToInput={() => setSubView('input')} onGoToThresholds={() => setSubView('thresholds')} />}
        {subView === 'thresholds' && <ThresholdLookup players={recruits} roleContext="Data Analyst" {...teamTheme} onGoToDatabase={() => setSubView('database')} />}
        {subView === 'analysis'   && <ScoutAnalysis players={recruits} roleContext="Data Analyst" {...teamTheme} dynasty={currentDynasty} committedRecruits={committedRecruits} />}
        {subView === 'counts'     && <PlayerCount players={recruits} roleContext="Regional Scout" {...teamTheme} committedRecruits={committedRecruits} currentYear={currentDynasty?.currentYear} />}
        {subView === 'portal'     && <PortalBoard committedRecruits={committedRecruits} {...teamTheme} />}
      </div>
    </div>
  );
}