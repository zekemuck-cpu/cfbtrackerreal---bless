import React, { useState, useEffect } from 'react';

// =========================================================================
// LIGHTWEIGHT INDEXEDDB MANAGER (Permanently Bypasses the 5MB Quota Limit)
// =========================================================================
import { getStaffData, saveStaffData, deleteStaffData } from './staffDB';

export default function ScoutStaffFrontPage({ setView, currentTeamName = 'college football team', currentYear, teamColors, teamLogo }) {
  const p = teamColors?.primary   || '#374151';
  const s = teamColors?.secondary || '#ffffff';
  // Live State Holders
  const [scoutImg, setScoutImg] = useState('');
  const [analystImg, setAnalystImg] = useState('');

  const [scoutName, setScoutName] = useState('Staff Slot #1');
  const [analystName, setAnalystName] = useState('Staff Slot #2');

  const [scoutBio, setScoutBio] = useState('');
  const [analystBio, setAnalystBio] = useState('');

  // Contracts: store start year so the current year is auto-derived from dynasty year
  const [scoutContractLength, setScoutContractLength] = useState(0);
  const [scoutContractStartYear, setScoutContractStartYear] = useState(0);
  const [analystContractLength, setAnalystContractLength] = useState(0);
  const [analystContractStartYear, setAnalystContractStartYear] = useState(0);

  const [activeModalImg, setActiveModalImg] = useState(null);
  const [nameEditSlot, setNameEditSlot] = useState(null);
  const [bioEditSlot, setBioEditSlot] = useState(null);

  const [showScoutUrlInput, setShowScoutUrlInput] = useState(false);
  const [showAnalystUrlInput, setShowAnalystUrlInput] = useState(false);
  const [scoutUrlText, setScoutUrlText] = useState('');
  const [analystUrlText, setAnalystUrlText] = useState('');

  // Initial Boot-up: load names/images/bios immediately on mount
  useEffect(() => {
    async function loadBasicStaff() {
      const img1  = await getStaffData('scout_img');
      const img2  = await getStaffData('analyst_img');
      const name1 = await getStaffData('scout_name');
      const name2 = await getStaffData('analyst_name');
      const bio1  = await getStaffData('scout_bio');
      const bio2  = await getStaffData('analyst_bio');

      if (img1)  setScoutImg(img1);
      if (img2)  setAnalystImg(img2);
      if (name1) setScoutName(name1);
      if (name2) setAnalystName(name2);
      if (bio1)  setScoutBio(bio1);
      if (bio2)  setAnalystBio(bio2);

      // Contract lengths load without needing the dynasty year
      const len1 = await getStaffData('scout_contract_len');
      const len2 = await getStaffData('analyst_contract_len');
      if (len1) setScoutContractLength(Number(len1));
      if (len2) setAnalystContractLength(Number(len2));

      // Load start years (no migration needed here — done separately when year is ready)
      const sy1 = await getStaffData('scout_contract_start_year');
      const sy2 = await getStaffData('analyst_contract_start_year');
      if (sy1) setScoutContractStartYear(Number(sy1));
      if (sy2) setAnalystContractStartYear(Number(sy2));
    }
    loadBasicStaff();
  }, []);

  // Contract migration: run once when dynasty year becomes available
  useEffect(() => {
    if (!currentYear) return;
    async function migrateContracts() {
      const sy1 = await getStaffData('scout_contract_start_year');
      if (!sy1) {
        const len1 = await getStaffData('scout_contract_len');
        const cur1 = await getStaffData('scout_contract_cur');
        if (len1 && cur1) {
          const startYear = currentYear - Number(cur1) + 1;
          setScoutContractStartYear(startYear);
          await saveStaffData('scout_contract_start_year', startYear);
        }
      }
      const sy2 = await getStaffData('analyst_contract_start_year');
      if (!sy2) {
        const len2 = await getStaffData('analyst_contract_len');
        const cur2 = await getStaffData('analyst_contract_cur');
        if (len2 && cur2) {
          const startYear = currentYear - Number(cur2) + 1;
          setAnalystContractStartYear(startYear);
          await saveStaffData('analyst_contract_start_year', startYear);
        }
      }
    }
    migrateContracts();
  }, [currentYear]);

  // Automated write listeners saving content to Database clusters on mutations
  const handleNameChange = async (val, slot) => {
    if (slot === 1) {
      setScoutName(val);
      await saveStaffData('scout_name', val);
    } else {
      setAnalystName(val);
      await saveStaffData('analyst_name', val);
    }
  };

  const handleBioChange = async (val, slot) => {
    if (slot === 1) {
      setScoutBio(val);
      await saveStaffData('scout_bio', val);
    } else {
      setAnalystBio(val);
      await saveStaffData('analyst_bio', val);
    }
  };

  // =========================================================================
  // CORE CONTRACT ENGINE LOGIC FUNCTIONS
  // =========================================================================
  const generateRandomContract = async (slot) => {
    const randomizedYears = Math.floor(Math.random() * 4) + 1;
    const startYear = currentYear || new Date().getFullYear();
    if (slot === 1) {
      setScoutContractLength(randomizedYears);
      setScoutContractStartYear(startYear);
      await saveStaffData('scout_contract_len', randomizedYears);
      await saveStaffData('scout_contract_start_year', startYear);
    } else {
      setAnalystContractLength(randomizedYears);
      setAnalystContractStartYear(startYear);
      await saveStaffData('analyst_contract_len', randomizedYears);
      await saveStaffData('analyst_contract_start_year', startYear);
    }
  };

  const handleResignStaff = async (slot) => {
    const freshYears = Math.floor(Math.random() * 4) + 1;
    const startYear = currentYear || new Date().getFullYear();
    if (slot === 1) {
      setScoutContractLength(freshYears);
      setScoutContractStartYear(startYear);
      await saveStaffData('scout_contract_len', freshYears);
      await saveStaffData('scout_contract_start_year', startYear);
      alert(`${scoutName} has signed a new ${freshYears}-year extension contract!`);
    } else {
      setAnalystContractLength(freshYears);
      setAnalystContractStartYear(startYear);
      await saveStaffData('analyst_contract_len', freshYears);
      await saveStaffData('analyst_contract_start_year', startYear);
      alert(`${analystName} has signed a new ${freshYears}-year extension contract!`);
    }
  };

  const getDynamicAgeString = () => {
    const minAge = Math.floor(Math.random() * (45 - 25 + 1)) + 25;
    const maxAge = minAge + 5 > 50 ? 50 : minAge + 5;
    return `age ranging from ${minAge} to ${maxAge} years old`;
  };

  const getDynamicAttireString = () => {
    const clothingOptions = ['polo shirt', 'crewneck sweatshirt', 'hoodie', 'quarter-zip pullover', 'suit and tie', 'dress shirt and blazer'];
    const clothing = clothingOptions[Math.floor(Math.random() * clothingOptions.length)];
    const headwearRoll = Math.floor(Math.random() * 100);
    let headwear = '';
    if (headwearRoll < 70) headwear = ''; 
    else if (headwearRoll < 85) headwear = ', wearing a team-branded baseball cap';
    else headwear = ', wearing a team-branded visor'; 
    return `wearing a sharp modern ${currentTeamName}-branded ${clothing}${headwear}`;
  };

  const handleCopy = (text, type) => {
    navigator.clipboard.writeText(text);
    alert(`${type} prompt copied to clipboard!`);
  };

  const generateImgPrompt = (role) => {
    const roleTitle = role === 'scout' ? 'Regional Talent Scout/Recruiter' : 'Data Analyst/Statistical Evaluator';
    return `A crisp, highly detailed 1:1 square ratio centered profile headshot of a college football ${roleTitle}, ${getDynamicAgeString()}, ${getDynamicAttireString()}. 
    STYLE SPECIFICATIONS: The artwork must perfectly match the clean, premium, highly-polished 3D character asset style seen in EA Sports College Football menu selection screens. This is a clear 3D model render using realistic textures, natural skin details, and high-fidelity depth. It must NOT look like a cartoon, hand-drawn sketch, 2D vector, or stylized illustration. 
    BACKGROUND AND COMPOSITION: Set against a realistic photoshoot background, featuring either a soft gradient canvas or blurred team-colored lighting matching ${currentTeamName} aesthetics. CRITICAL: The background must be completely clear of any typography, watermarks, floating logo elements, floating text strings, or overlaid graphic words. It must look like a clean, professional stadium or facility media-day headshot.
    [DIVERSITY MANDATE - HYPER-VARIED INHERITANCE]: Intentionally generate an entirely randomized demographic combination. The person must feature a completely unique face shape, variable body weight (ranging from stocky, heavy-set, husky, or round builds to lean or average tracking builds), distinct skin tones (Black, Caucasian, Hispanic, Asian, Indigenous, Mixed-race), multi-ethnic features, diverse facial structures, varying nose/jawline shapes, and entirely unique hairstyles or facial hair setups. Avoid default baselines or repetitive character templates.
    COMPOSITION AND CLOSE-UP SCALE: Tightly frame and crop the subject so it focuses closely on their head and neck, showing only the very top apex of the shoulders. It should be a clear, close-up asset portrait that maximizes facial details without getting cut off, ensuring the character's face remains cleanly centered and highly visible when scaled down to a small card box icon.`;
  };

  const generateBioPrompt = (role) => {
    return `Generate a text biography for a college football staff member's dossier board. Output ONLY the following lines with no introduction sentences, no formatting markdown, no bullet symbols (-), and no extra text spaces, so it can be cleanly copied:

Suggested Name: (Generate a completely unique first and last name. CRITICAL STIPULATION: Do not use common default names like Marcus, David, John, Michael, or typical baseline choices. Cycle through a massive variety of naming data, choosing distinct, uncommon, or ethnically appropriate names that logically align with the specific race, ancestral heritage, body build, and age expression generated in the headshot picture above to ensure an absolute 1-of-1 identity)
Hometown: (Insert a randomized American town or city. To ensure a 100% unique feel across multiple iterations, draw from different states across the country, completely unrelated and geographically separated from the ${currentTeamName} region or state, bringing in someone from an entirely different local pipeline layout)
Alma Mater: (Insert a randomized college football university program. Avoid choosing the same standard top-tier programs repeatedly; mix in mid-major, lower-tier, or far-away universities to represent a true country-wide coaching tree matrix, completely separate from ${currentTeamName})
Staff Note: (Write a concise, high-impact summary statement. HARD LIMIT: The entire Staff Note MUST be 120 characters or fewer — count every character including spaces before writing. If your draft exceeds 120 characters, rewrite it shorter. Do NOT exceed this limit under any circumstance; going over will break the application layout. Additionally, weave in a clear background connection showing how their hometown region, their alma mater tree, or their past professional assignments explicitly link their skills back to the local history, staff, or pipelines of the ${currentTeamName})`;
  };

  const processRawFile = (file, slot) => {
    if (!file || !file.type.startsWith('image/')) return;
    
    const reader = new FileReader();
    reader.onload = async () => {
      const rawDataUrl = reader.result;
      
      const img = new Image();
      img.onload = async () => {
        const maxCanvas = document.createElement('canvas');
        const MAX_DIM = Math.min(img.width, img.height, 1024);
        maxCanvas.width = MAX_DIM;
        maxCanvas.height = MAX_DIM;
        const mCtx = maxCanvas.getContext('2d');
        const mSide = Math.min(img.width, img.height);
        mCtx.drawImage(img, (img.width - mSide)/2, (img.height - mSide)/2, mSide, mSide, 0, 0, MAX_DIM, MAX_DIM);
        const highResUrl = maxCanvas.toDataURL('image/jpeg', 0.95);

        if (slot === 1) {
          setScoutImg(highResUrl);
          await saveStaffData('scout_img', highResUrl);
          if (scoutContractLength === 0) await generateRandomContract(1);
        } else {
          setAnalystImg(highResUrl);
          await saveStaffData('analyst_img', highResUrl);
          if (analystContractLength === 0) await generateRandomContract(2);
        }
      };
      img.src = rawDataUrl;
    };
    reader.readAsDataURL(file);
  };

  const handleImageUpload = (e, slot) => processRawFile(e.target.files[0], slot);

  const handlePaste = (e, slot) => {
    const items = (e.clipboardData || e.originalEvent.clipboardData).items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        processRawFile(items[i].getAsFile(), slot);
        break;
      }
    }
  };

  const pasteFromBtn = async (slot) => {
    try {
      const clipboardItems = await navigator.clipboard.read();
      for (const item of clipboardItems) {
        for (const type of item.types) {
          if (type.startsWith('image/')) {
            const blob = await item.getType(type);
            processRawFile(blob, slot);
            return;
          }
        }
      }
      alert("No image detected on clipboard!");
    } catch (err) {
      alert("Please check browser clipboard permissions.");
    }
  };

  const handleUrlSubmit = async (slot) => {
    const targetUrl = slot === 1 ? scoutUrlText.trim() : analystUrlText.trim();
    if (!targetUrl) return;

    if (slot === 1) {
      setScoutImg(targetUrl);
      await saveStaffData('scout_img', targetUrl);
      if (scoutContractLength === 0) await generateRandomContract(1);
      setShowScoutUrlInput(false);
      setScoutUrlText('');
    } else {
      setAnalystImg(targetUrl);
      await saveStaffData('analyst_img', targetUrl);
      if (analystContractLength === 0) await generateRandomContract(2);
      setShowAnalystUrlInput(false);
      setAnalystUrlText('');
    }
  };

  const clearSlot = async (slot) => {
    if (slot === 1) {
      setScoutImg('');
      setScoutName('Staff Slot #1');
      setScoutBio('');
      setScoutContractLength(0);
      setScoutContractStartYear(0);
      await deleteStaffData('scout_img');
      await deleteStaffData('scout_name');
      await deleteStaffData('scout_bio');
      await deleteStaffData('scout_contract_len');
      await deleteStaffData('scout_contract_start_year');
      await deleteStaffData('scout_contract_cur');
    } else {
      setAnalystImg('');
      setAnalystName('Staff Slot #2');
      setAnalystBio('');
      setAnalystContractLength(0);
      setAnalystContractStartYear(0);
      await deleteStaffData('analyst_img');
      await deleteStaffData('analyst_name');
      await deleteStaffData('analyst_bio');
      await deleteStaffData('analyst_contract_len');
      await deleteStaffData('analyst_contract_start_year');
      await deleteStaffData('analyst_contract_cur');
    }
  };

  // Derive current contract year from dynasty year instead of a manual counter
  const effectiveYear = currentYear || new Date().getFullYear();
  const scoutContractCurrent  = scoutContractStartYear  ? effectiveYear - scoutContractStartYear  + 1 : 0;
  const analystContractCurrent = analystContractStartYear ? effectiveYear - analystContractStartYear + 1 : 0;

  const isScoutExpired   = scoutContractLength   > 0 && scoutContractCurrent   > scoutContractLength;
  const isAnalystExpired = analystContractLength > 0 && analystContractCurrent > analystContractLength;

  const scoutYearsRemaining   = Math.max(0, scoutContractLength   - scoutContractCurrent   + 1);
  const analystYearsRemaining = Math.max(0, analystContractLength - analystContractCurrent + 1);

  return (
    <div className="space-y-6 relative">

      {/* HIGH-RESOLUTION MODAL OVERLAY */}
      {activeModalImg && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md cursor-zoom-out p-4"
          onClick={() => setActiveModalImg(null)}
        >
          <div className="relative max-w-lg w-full aspect-square bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden p-1.5 shadow-2xl">
            <img src={activeModalImg} alt="Staff Portrait" className="w-full h-full object-cover rounded-xl select-none" />
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-1.5 bg-black/70 backdrop-blur-md rounded-full text-[10px] tracking-widest text-slate-300 font-bold uppercase select-none border border-slate-800">
              Click Anywhere to Close
            </div>
          </div>
        </div>
      )}

      {/* ── HEADER STRIP ── Madden "2026: WEEK 1 / VS BROWNS" style */}
      <div className="flex items-center gap-3">
        {teamLogo && (
          <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 flex items-center justify-center" style={{ background: `${p}22`, border: `1px solid ${p}44` }}>
            <img src={teamLogo} alt="" className="w-8 h-8 object-contain" />
          </div>
        )}
        <div>
          <p className="text-[9px] font-black uppercase tracking-[0.2em] leading-none" style={{ color: `${p}bb` }}>
            Scout Staff Intelligence Engine
          </p>
          <h2 className="text-white font-black leading-none mt-0.5" style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 'clamp(1.4rem, 3vw, 2rem)', letterSpacing: '0.04em' }}>
            {(currentTeamName || 'College Football').toUpperCase()}
          </h2>
        </div>
      </div>

      {/* ── STAFF PORTRAIT CARDS ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {[
          {
            slot: 1,
            img: scoutImg, setImg: setScoutImg,
            name: scoutName, setName: setScoutName,
            bio: scoutBio,
            isExpired: isScoutExpired,
            yearsRemaining: scoutYearsRemaining,
            contractLength: scoutContractLength,
            role: 'Regional Scout',
            roleColor: '#38bdf8',
            showUrl: showScoutUrlInput, setShowUrl: setShowScoutUrlInput,
            urlText: scoutUrlText, setUrlText: setScoutUrlText,
            accentColor: p,
          },
          {
            slot: 2,
            img: analystImg, setImg: setAnalystImg,
            name: analystName, setName: setAnalystName,
            bio: analystBio,
            isExpired: isAnalystExpired,
            yearsRemaining: analystYearsRemaining,
            contractLength: analystContractLength,
            role: 'Data Analyst',
            roleColor: '#34d399',
            showUrl: showAnalystUrlInput, setShowUrl: setShowAnalystUrlInput,
            urlText: analystUrlText, setUrlText: setAnalystUrlText,
            accentColor: s !== '#ffffff' ? s : p,
          },
        ].map(({ slot, img, name, bio, isExpired, yearsRemaining, contractLength, role, roleColor, showUrl, setShowUrl, urlText, setUrlText, accentColor }) => (
          <div key={slot} className="relative rounded-2xl overflow-hidden shadow-2xl group" style={{ aspectRatio: '3/4', minHeight: '340px', maxHeight: '480px' }}>

            {/* Background: photo or team-color placeholder */}
            {img ? (
              <img
                src={img}
                alt={role}
                className="absolute inset-0 w-full h-full object-cover cursor-zoom-in transition-transform duration-500 group-hover:scale-105"
                onClick={() => { if (!isExpired) setActiveModalImg(img); }}
              />
            ) : (
              <div
                className="absolute inset-0 flex flex-col items-center justify-center"
                style={{ background: `linear-gradient(160deg, ${accentColor}33 0%, #020617 100%)` }}
              >
                {teamLogo && <img src={teamLogo} alt="" className="w-32 h-32 object-contain select-none pointer-events-none" style={{ opacity: 0.12, filter: 'grayscale(30%)' }} />}
              </div>
            )}

            {/* Gradient overlay — two layers: dark base always + team color tint on top */}
            {/* Layer 1: dark base — guarantees text legibility regardless of photo brightness */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background: isExpired
                  ? 'linear-gradient(to bottom, rgba(80,0,0,0.1) 0%, rgba(20,0,0,0.92) 70%)'
                  : 'linear-gradient(to bottom, rgba(0,0,0,0.0) 0%, rgba(0,0,0,0.15) 40%, rgba(0,0,0,0.82) 68%, rgba(0,0,0,0.92) 100%)',
              }}
            />
            {/* Layer 2: team color tint — purely decorative, at reduced opacity */}
            {!isExpired && (
              <div
                className="absolute inset-0 pointer-events-none"
                style={{ background: `linear-gradient(to bottom, transparent 45%, ${accentColor}55 100%)` }}
              />
            )}

            {/* Top badges */}
            <div className="absolute top-3 left-3 right-3 flex items-start justify-between gap-2 pointer-events-none">
              <span
                className="text-[8px] font-black uppercase tracking-[0.15em] px-2 py-1 rounded"
                style={{ background: 'rgba(0,0,0,0.55)', color: roleColor, backdropFilter: 'blur(4px)', border: `1px solid ${roleColor}44` }}
              >
                {role}
              </span>
              {contractLength > 0 && (
                <span
                  className={`text-[8px] font-black uppercase tracking-wider px-2 py-1 rounded ${isExpired ? 'animate-pulse' : ''}`}
                  style={{
                    background: isExpired ? 'rgba(127,29,29,0.8)' : 'rgba(0,0,0,0.55)',
                    color: isExpired ? '#f87171' : '#94a3b8',
                    backdropFilter: 'blur(4px)',
                    border: isExpired ? '1px solid rgba(239,68,68,0.4)' : '1px solid rgba(100,116,139,0.3)',
                  }}
                >
                  {isExpired ? 'CONTRACT EXPIRED' : `${yearsRemaining}yr left`}
                </span>
              )}
            </div>

            {/* Bottom overlay — name + bio + controls */}
            <div className="absolute bottom-0 left-0 right-0 p-4 space-y-2">
              {/* Name — display/edit toggle */}
              {nameEditSlot === slot ? (
                <input
                  type="text"
                  value={name}
                  autoFocus
                  onChange={(e) => {
                    const val = e.target.value;
                    if (slot === 1) { setScoutName(val); } else { setAnalystName(val); }
                    handleNameChange(val, slot);
                  }}
                  onBlur={() => setNameEditSlot(null)}
                  className="bg-black/40 border-0 border-b-2 focus:outline-none focus:ring-0 w-full text-white leading-none"
                  style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 'clamp(1.6rem, 4vw, 2.2rem)', letterSpacing: '0.04em', caretColor: 'white', borderColor: accentColor, backdropFilter: 'blur(4px)' }}
                />
              ) : (
                <div
                  onClick={() => !isExpired && setNameEditSlot(slot)}
                  className={`space-y-0 ${!isExpired ? 'cursor-text' : 'opacity-60'}`}
                >
                  {/* Accent bar */}
                  <div className="w-8 h-0.5 mb-1 rounded-full" style={{ background: accentColor }} />
                  {/* First name (everything before last word) */}
                  {name.trim().includes(' ') && (
                    <p
                      className="text-white/80 leading-none"
                      style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 'clamp(0.85rem, 2vw, 1.1rem)', letterSpacing: '0.12em', textShadow: '0 1px 8px rgba(0,0,0,0.9)' }}
                    >
                      {name.trim().split(' ').slice(0, -1).join(' ').toUpperCase()}
                    </p>
                  )}
                  {/* Last name (last word) — large */}
                  <p
                    className="text-white leading-none"
                    style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 'clamp(1.8rem, 5vw, 2.6rem)', letterSpacing: '0.04em', textShadow: '0 2px 16px rgba(0,0,0,0.95)' }}
                  >
                    {(name.trim().includes(' ') ? name.trim().split(' ').pop() : name.trim()).toUpperCase()}
                  </p>
                </div>
              )}

              {/* Bio display / edit */}
              {!isExpired && (
                bioEditSlot === slot ? (
                  <textarea
                    autoFocus
                    value={bio}
                    onChange={(e) => handleBioChange(e.target.value, slot)}
                    onBlur={() => setBioEditSlot(null)}
                    rows={4}
                    placeholder="Paste bio here…"
                    className="w-full rounded-lg text-[10px] text-white leading-snug resize-none focus:outline-none p-2"
                    style={{ background: 'rgba(0,0,0,0.65)', border: `1px solid ${accentColor}55`, caretColor: 'white', backdropFilter: 'blur(6px)', scrollbarWidth: 'none' }}
                  />
                ) : (
                  <div
                    className="max-h-[72px] overflow-y-auto cursor-text"
                    style={{ scrollbarWidth: 'none' }}
                    onClick={() => setBioEditSlot(slot)}
                  >
                    {bio
                      ? <p className="text-[10px] text-white leading-snug whitespace-pre-line" style={{ textShadow: '0 1px 8px rgba(0,0,0,1), 0 2px 16px rgba(0,0,0,1)' }}>{bio}</p>
                      : <p className="text-[9px] italic" style={{ color: `${accentColor}66` }}>Tap to add bio…</p>
                    }
                  </div>
                )
              )}

              {/* Expired actions */}
              {isExpired && (
                <div className="flex gap-2 pt-1">
                  <button onClick={() => handleResignStaff(slot)} className="flex-1 py-1.5 rounded font-black text-[10px] uppercase tracking-wider transition" style={{ background: '#059669', color: '#fff' }}>
                    Re-sign
                  </button>
                  <button onClick={() => { if (slot === 1) clearSlot(1); else clearSlot(2); }} className="flex-1 py-1.5 rounded font-black text-[10px] uppercase tracking-wider transition" style={{ background: 'rgba(127,29,29,0.8)', color: '#fca5a5' }}>
                    Replace
                  </button>
                </div>
              )}

              {/* Upload/edit controls (shown when no photo or on hover) */}
              {!isExpired && (
                <div className={`flex flex-wrap gap-1.5 transition-all duration-200 ${img ? 'opacity-0 group-hover:opacity-100' : 'opacity-100'}`}>
                  <label className="cursor-pointer px-2 py-1 rounded text-[9px] font-bold uppercase tracking-wider transition" style={{ background: 'rgba(0,0,0,0.6)', color: roleColor, border: `1px solid ${roleColor}44`, backdropFilter: 'blur(4px)' }}>
                    Upload
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => handleImageUpload(e, slot)} />
                  </label>
                  <button
                    onPaste={(e) => handlePaste(e, slot)}
                    onClick={() => pasteFromBtn(slot)}
                    className="px-2 py-1 rounded text-[9px] font-bold uppercase tracking-wider transition"
                    style={{ background: 'rgba(0,0,0,0.6)', color: '#94a3b8', border: '1px solid rgba(100,116,139,0.3)', backdropFilter: 'blur(4px)' }}
                  >
                    Paste
                  </button>
                  <button
                    onClick={() => setShowUrl(!showUrl)}
                    className="px-2 py-1 rounded text-[9px] font-bold uppercase tracking-wider transition"
                    style={{ background: 'rgba(0,0,0,0.6)', color: '#94a3b8', border: '1px solid rgba(100,116,139,0.3)', backdropFilter: 'blur(4px)' }}
                  >
                    URL
                  </button>
                  {img && (
                    <button
                      onClick={() => { if (slot === 1) clearSlot(1); else clearSlot(2); }}
                      className="px-2 py-1 rounded text-[9px] font-bold uppercase tracking-wider transition"
                      style={{ background: 'rgba(127,29,29,0.6)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.3)', backdropFilter: 'blur(4px)' }}
                    >
                      Clear
                    </button>
                  )}
                </div>
              )}

              {/* URL input */}
              {showUrl && !isExpired && (
                <div className="flex gap-2 rounded-lg overflow-hidden" style={{ background: 'rgba(0,0,0,0.7)', border: '1px solid rgba(100,116,139,0.3)', backdropFilter: 'blur(4px)' }}>
                  <input
                    type="text"
                    value={urlText}
                    onChange={(e) => { if (slot === 1) setScoutUrlText(e.target.value); else setAnalystUrlText(e.target.value); }}
                    placeholder="Paste image URL…"
                    className="flex-1 bg-transparent text-[11px] font-mono text-slate-300 focus:outline-none px-2 py-1"
                  />
                  <button onClick={() => handleUrlSubmit(slot)} className="px-3 py-1 text-[9px] font-bold text-white uppercase" style={{ background: accentColor }}>
                    Save
                  </button>
                </div>
              )}

              {/* AI prompt buttons */}
              {!isExpired && (
                <div className="flex gap-1.5 pt-0.5">
                  <button onClick={() => handleCopy(generateImgPrompt(slot === 1 ? 'scout' : 'analyst'), 'Image')} className="px-2 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider transition" style={{ background: 'rgba(0,0,0,0.5)', color: roleColor, backdropFilter: 'blur(4px)' }}>
                    IMG Prompt
                  </button>
                  <button onClick={() => handleCopy(generateBioPrompt(slot === 1 ? 'scout' : 'analyst'), 'Bio')} className="px-2 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider transition" style={{ background: 'rgba(0,0,0,0.5)', color: '#64748b', backdropFilter: 'blur(4px)' }}>
                    BIO Prompt
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>


      {/* ── ACTION CARDS — Madden dark navy style ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[
          { view: 'input',      label: 'Scouting\nReport',    sub: 'Record Player Metrics' },
          { view: 'database',   label: 'Player\nDatabase',    sub: 'Complete Data Storage' },
          { view: 'thresholds', label: 'Threshold\nLookup',   sub: 'Player Comparison Tool' },
          { view: 'analysis',   label: 'Data\nAnalysis',      sub: 'Staff Recommendations' },
          { view: 'counts',     label: 'Player\nCount',       sub: 'Current Overview' },
          { view: 'portal',     label: 'Portal\nBoard',       sub: 'Transfer Commits' },
        ].map(({ view, label, sub }) => (
          <button
            key={view}
            onClick={() => setView(view)}
            className="relative rounded-xl overflow-hidden text-left transition-all duration-200 group"
            style={{ background: '#080c14', border: `1px solid ${p}22`, minHeight: '100px' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = `${p}66`; e.currentTarget.style.background = `${p}12`; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = `${p}22`; e.currentTarget.style.background = '#080c14'; }}
          >
            {/* Team logo watermark */}
            {teamLogo && (
              <img
                src={teamLogo}
                alt=""
                className="absolute right-2 top-1/2 -translate-y-1/2 w-16 h-16 object-contain pointer-events-none select-none"
                style={{ opacity: 0.07, filter: 'grayscale(20%)' }}
              />
            )}
            <div className="relative p-4 flex flex-col justify-between h-full gap-2">
              <h4
                className="text-white font-black leading-none whitespace-pre-line"
                style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 'clamp(1.15rem, 2.5vw, 1.5rem)', letterSpacing: '0.04em' }}
              >
                {label}
              </h4>
              <p className="text-[10px] font-semibold leading-tight" style={{ color: `${p}99` }}>
                {sub}
              </p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}