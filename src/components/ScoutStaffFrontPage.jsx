import React, { useState, useEffect, useMemo } from 'react';
import { computeScore } from './archetypeWeights';

// =========================================================================
// LIGHTWEIGHT INDEXEDDB MANAGER (Permanently Bypasses the 5MB Quota Limit)
// =========================================================================
import { getStaffData, saveStaffData, deleteStaffData } from './staffDB';

export default function ScoutStaffFrontPage({ setView, currentTeamName = 'college football team', currentYear, coachName = '', teamColors, teamLogo, recruits = [], rosterWarnings = [] }) {
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
  const [copiedKey, setCopiedKey] = useState(null);
  const [pasteState, setPasteState] = useState({});

  const [showScoutUrlInput, setShowScoutUrlInput] = useState(false);
  const [showAnalystUrlInput, setShowAnalystUrlInput] = useState(false);
  const [scoutUrlText, setScoutUrlText] = useState('');
  const [analystUrlText, setAnalystUrlText] = useState('');

  // localStorage keys used as backup for small text fields
  const LS = {
    scout_name:    'staff_scout_name',
    analyst_name:  'staff_analyst_name',
    scout_bio:     'staff_scout_bio',
    analyst_bio:   'staff_analyst_bio',
  };

  // Initial Boot-up: load names/images/bios immediately on mount
  useEffect(() => {
    async function loadBasicStaff() {
      const img1  = await getStaffData('scout_img');
      const img2  = await getStaffData('analyst_img');

      // For text fields prefer IndexedDB; fall back to localStorage backup
      const name1 = await getStaffData('scout_name')   || localStorage.getItem(LS.scout_name)   || '';
      const name2 = await getStaffData('analyst_name') || localStorage.getItem(LS.analyst_name) || '';
      const bio1  = await getStaffData('scout_bio')    || localStorage.getItem(LS.scout_bio)    || '';
      const bio2  = await getStaffData('analyst_bio')  || localStorage.getItem(LS.analyst_bio)  || '';

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
      localStorage.setItem(LS.scout_name, val);
      await saveStaffData('scout_name', val);
    } else {
      setAnalystName(val);
      localStorage.setItem(LS.analyst_name, val);
      await saveStaffData('analyst_name', val);
    }
  };

  const handleBioChange = async (val, slot) => {
    if (slot === 1) {
      setScoutBio(val);
      localStorage.setItem(LS.scout_bio, val);
      await saveStaffData('scout_bio', val);
    } else {
      setAnalystBio(val);
      localStorage.setItem(LS.analyst_bio, val);
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

  const handleCopy = (text, key) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1000);
  };

  const generateImgPrompt = (role) => {
    const roleTitle = role === 'scout' ? 'Regional Talent Scout/Recruiter' : 'Data Analyst/Statistical Evaluator';
    return `A crisp, highly detailed 1:1 square ratio centered profile headshot of a college football ${roleTitle}, ${getDynamicAgeString()}, ${getDynamicAttireString()}. 
    STYLE SPECIFICATIONS: The artwork must perfectly match the clean, premium, highly-polished 3D character asset style seen in EA Sports College Football menu selection screens. This is a clear 3D model render using realistic textures, natural skin details, and high-fidelity depth. It must NOT look like a cartoon, hand-drawn sketch, 2D vector, or stylized illustration. 
    BACKGROUND AND COMPOSITION: Set against a realistic photoshoot background, featuring either a soft gradient canvas or blurred team-colored lighting matching ${currentTeamName} aesthetics. CRITICAL: The background must be completely clear of any typography, watermarks, floating logo elements, floating text strings, or overlaid graphic words. It must look like a clean, professional stadium or facility media-day headshot.
    [DIVERSITY MANDATE - HYPER-VARIED INHERITANCE]: Intentionally generate an entirely randomized demographic combination. The person must feature a completely unique face shape, variable body weight (ranging from stocky, heavy-set, husky, or round builds to lean or average tracking builds), distinct skin tones (Black, Caucasian, Hispanic, Asian, Indigenous, Mixed-race), multi-ethnic features, diverse facial structures, varying nose/jawline shapes, and entirely unique hairstyles or facial hair setups. Avoid default baselines or repetitive character templates.
    COMPOSITION AND CLOSE-UP SCALE: Tightly frame and crop the subject so it focuses closely on their head and neck, showing only the very top apex of the shoulders. It should be a clear, close-up asset portrait that maximizes facial details without getting cut off, ensuring the character's face remains cleanly centered and highly visible when scaled down to a small card box icon.`;
  };

  const generateBioPrompt = (role, otherName) => {
    const isScout = role === 'scout';
    const roleTitle   = isScout ? 'Regional Scout' : 'Data Analyst';
    const roleContext = isScout
      ? 'a Regional Scout who specializes in hands-on field evaluation, on-campus recruiting visits, building relationships with high school coaches, and identifying under-the-radar talent'
      : 'a Data Analyst who specializes in player metrics, statistical modeling, film breakdown, and delivering data-driven insight to guide recruiting decisions and game planning';

    // Randomly seed a geographic zone and conference group so each button press
    // forces the AI into a different corner of the country / tier of football.
    const zones = [
      'Deep South (Alabama, Mississippi, Georgia, Louisiana, South Carolina)',
      'Midwest (Ohio, Indiana, Illinois, Michigan, Wisconsin, Iowa, Missouri)',
      'Mid-Atlantic (Pennsylvania, New Jersey, Maryland, Virginia, Delaware)',
      'Texas (Houston suburbs, DFW suburbs, San Antonio area, East Texas)',
      'Great Plains (Nebraska, Kansas, Oklahoma, South Dakota, North Dakota)',
      'Appalachia (West Virginia, eastern Kentucky, western North Carolina, Tennessee)',
      'Pacific Coast (Southern California, Central California, Pacific Northwest excluding Idaho)',
      'Mountain West (Colorado, Utah, Nevada excluding Las Vegas, Arizona)',
      'New England (Massachusetts, Connecticut, Rhode Island, upstate New York)',
      'Gulf Coast (Florida Panhandle, coastal Mississippi, Alabama coast, east Texas coast)',
      'Upper South (Arkansas, central Kentucky, western Virginia, middle Tennessee)',
    ];
    const conferences = [
      'MAC (Ball State, Ohio, Akron, Kent State, Eastern Michigan, Bowling Green)',
      'Sun Belt (Appalachian State, Arkansas State, Southern Miss, Georgia Southern, Old Dominion)',
      'CUSA (UTEP, Louisiana Tech, Middle Tennessee, FAU, Charlotte, Western Kentucky)',
      'Mountain West (Wyoming, San Jose State, Fresno State, Air Force, Colorado State, Hawaii)',
      'American Athletic (Tulane, Memphis, ECU, Temple, Tulsa, UTSA)',
      'Big South / Southland (Incarnate Word, Nicholls, Southeastern Louisiana, McNeese, Sam Houston)',
      'SWAC (Grambling, Southern, Jackson State, Alabama A&M, Arkansas-Pine Bluff)',
      'FCS Mid-Major (Furman, Wofford, Samford, Davidson, Western Illinois, Eastern Kentucky)',
      'Missouri Valley (North Dakota State, South Dakota State, Illinois State, Missouri State)',
      'OVC / Southern (Austin Peay, UT Martin, Eastern Illinois, Lindenwood, Central Arkansas)',
    ];
    const zone = zones[Math.floor(Math.random() * zones.length)];
    const conf = conferences[Math.floor(Math.random() * conferences.length)];

    const placeholderNames = ['Staff Slot #1', 'Staff Slot #2', ''];
    const otherIsNamed = otherName && !placeholderNames.includes(otherName);
    const uniquenessClause = otherIsNamed
      ? `CRITICAL UNIQUENESS RULE: The other staff member on this board is already named "${otherName}". You MUST generate a completely different person — different first name, different last name, different state, different alma mater. Do NOT echo or rhyme with any part of their name or background.\n\n`
      : '';

    const coachLine = coachName
      ? `The program's head coach is ${coachName}. `
      : '';

    return `Generate a text biography for a college football staff member's dossier board. This person is ${roleContext}. Output ONLY the following lines with no introduction, no markdown, no bullet symbols, and no extra blank lines:\n\n${uniquenessClause}Suggested Name: (CRITICAL — look at the headshot image carefully before writing anything. Identify the person's visible ethnic and racial background from their face, skin tone, and features. Then generate a name that authentically matches that specific person. The name must feel natural and believable for someone of that exact background who grew up in America. Examples by background: if they look Black/African-American → names like Darius Webb, Andre Collins, DeShawn Morris, Terrell Grant; if they look Hispanic/Latino → names like Carlos Reyes, Miguel Torres, Luis Mendez, Marco Rios; if they look East Asian → names like Kevin Park, Jason Chen, Tyler Nguyen, Daniel Kim — never a fully Black or European name for someone with Asian features; if they look white → names like Ryan Mitchell, Scott Henderson, Tyler Brooks, Brian Callahan. Common first names are fine as long as they match the face. Do not assign a name that would look wrong next to the headshot — the name and face must feel like the same real person.)
Hometown: (THIS IS THE MOST IMPORTANT FIELD FOR VARIETY. You MUST draw this person's hometown from the following specific U.S. region for this generation: ${zone}. Pick a real, specific smaller city or town within that zone — NOT a major metro hub. Every generation should feel like it comes from a completely different part of the country. Lean toward towns that are not frequently chosen — the goal is geographic spread across the full breadth of America.)
Alma Mater: (Draw this person's college from the following specific conference tier for this generation: ${conf}. Pick a specific school from that group. The goal is a country-wide coaching tree that goes deep into mid-major and lower-tier football. Be specific — name the actual school, not just the conference. Favor less commonly chosen schools within the tier to maximize variety across generations.)
Staff Note: (${coachLine}Write a tight one-liner that tells the mini origin story of how this person landed this job — how they crossed paths with ${coachName || 'the head coach'} or the ${currentTeamName} program. Make it feel like a real backstory: maybe they coached against each other, worked at the same school years ago, were referred through a mutual contact, got noticed at a clinic or combine, or their recruiting region overlapped with the program's needs at the right time. It should read like a fact from their dossier file, not a generic job description. HARD LIMIT: 120 characters maximum including spaces — count before writing. Rewrite shorter if over. Do not exceed this limit.)`;
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

  const flashPaste = (slot, status) => {
    setPasteState(s => ({ ...s, [slot]: status }));
    setTimeout(() => setPasteState(s => ({ ...s, [slot]: null })), 1500);
  };

  const pasteFromBtn = async (slot) => {
    if (!navigator.clipboard?.read) {
      flashPaste(slot, 'unsupported');
      return;
    }
    try {
      const clipboardItems = await navigator.clipboard.read();
      let found = false;
      for (const item of clipboardItems) {
        for (const type of item.types) {
          if (type.startsWith('image/')) {
            const blob = await item.getType(type);
            processRawFile(blob, slot);
            found = true;
            break;
          }
        }
        if (found) break;
      }
      flashPaste(slot, found ? 'ok' : 'noimg');
    } catch {
      flashPaste(slot, 'denied');
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
      localStorage.removeItem(LS.scout_name);
      localStorage.removeItem(LS.scout_bio);
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
      localStorage.removeItem(LS.analyst_name);
      localStorage.removeItem(LS.analyst_bio);
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

  const analysisData = useMemo(() => {
    const scored = recruits.map(r => ({ ...r, score: computeScore(r) })).sort((a, b) => b.score - a.score);
    const total  = scored.length;
    const t1 = scored.filter(r => r.score >= 88).length;
    const t2 = scored.filter(r => r.score >= 82 && r.score < 88).length;
    const t4 = scored.filter(r => r.score <  76).length;
    return { scored, total, t1, t2, t4 };
  }, [recruits]);

  const briefData = useMemo(() => {
    const { scored, total, t1, t2, t4 } = analysisData;
    if (!total) return null;

    const hiddenDev = d => !d || d === 'Hidden' || d === 'hidden' || d === '';

    const eliteDevs  = scored.filter(r => r.devTrait === 'Elite');
    const starDevs   = scored.filter(r => r.devTrait === 'Star');
    const hiddenDevs = scored.filter(r => hiddenDev(r.devTrait));
    const portalCount = scored.filter(r => r.isPortal).length;

    // Headline — single most important thing right now
    let headline;
    if (t1 >= 2) {
      const names = scored.filter(r => r.score >= 88).slice(0, 2).map(r => r.name).join(' and ');
      headline = `${names} are both elite-tier. Someone's getting them soon — make sure it's us.`;
    } else if (t1 === 1) {
      const top = scored.find(r => r.score >= 88);
      headline = `${top.name} is the only elite prospect on the board. He's the whole conversation.`;
    } else if (t1 === 0 && t2 === 0) {
      headline = `No premium talent on this board. The entire class needs to be upgraded.`;
    } else if (t4 > total * 0.6 && total > 3) {
      headline = `Board's loaded with depth guys. Need to find ceiling talent before this class locks in.`;
    } else {
      const top = scored[0];
      headline = `${top.name} leads the board at ${top.position}. ${t1 + t2} premium prospects — class is taking shape.`;
    }

    // Info bullets (green / neutral)
    const info = [];

    info.push({
      text: `${total} prospects on file — ${t1} elite, ${t2} solid, ${t4} depth`,
      flag: t1 > 0 ? 'good' : 'neutral',
    });

    const top = scored[0];
    const topDevNote = top.devTrait && !hiddenDev(top.devTrait) ? ` — ${top.devTrait} dev` : '';
    info.push({
      text: `${top.name} (${top.position}) leads at ${top.score.toFixed(0)} composite${topDevNote}`,
      flag: top.score >= 88 ? 'good' : 'neutral',
    });

    if (eliteDevs.length > 0) {
      info.push({ text: `${eliteDevs.map(r => r.name).join(', ')} — Elite dev confirmed`, flag: 'good' });
    } else if (starDevs.length > 0) {
      info.push({ text: `${starDevs.length} Star dev${starDevs.length > 1 ? 's' : ''} — ${starDevs.slice(0, 2).map(r => r.name).join(', ')}`, flag: 'good' });
    }

    if (portalCount > 0 && portalCount <= total * 0.5) {
      info.push({ text: `${portalCount} portal transfer${portalCount > 1 ? 's' : ''} in the mix`, flag: 'neutral' });
    }

    return { headline, info: info.slice(0, 3) };
  }, [analysisData]);

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

      {/* ── HERO ROW: portrait cards + recommendations panel ── */}
      <div className="flex flex-col md:flex-row gap-4 items-stretch">

        {/* Portrait cards — side by side, stretch to match right panel height */}
        <div className="flex gap-2 sm:gap-3 shrink-0 md:w-[42%]">
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
          <div key={slot} className="flex-1 flex flex-col rounded-xl overflow-hidden group min-h-[300px] bg-surface-2 border border-surface-4"
            style={ isExpired ? { borderColor: 'rgba(239,68,68,0.25)', background: 'rgba(25,5,5,1)' } : {} }>

            {/* ── PHOTO — full face visible, no text overlay ── */}
            <div
              className={`relative flex-shrink-0 overflow-hidden ${img && !isExpired ? 'cursor-zoom-in' : ''}`}
              style={{ aspectRatio: '4/5' }}
              onClick={() => { if (img && !isExpired) setActiveModalImg(img); }}
            >
              {img ? (
                <img
                  src={img}
                  alt={role}
                  className="absolute inset-0 w-full h-full object-cover object-top transition-transform duration-500 group-hover:scale-[1.03]"
                />
              ) : (
                <div className="absolute inset-0 bg-surface-3 flex items-center justify-center">
                  <p className="text-[9px] font-display font-bold uppercase text-txt-tertiary tracking-widest text-center px-3 leading-loose">{role}<br/>No Photo</p>
                </div>
              )}
              {/* Subtle bottom fade into info section */}
              {img && <div className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(to bottom, transparent 60%, rgba(0,0,0,0.45) 100%)' }} />}
              {img && !isExpired && <div className="absolute inset-0 pointer-events-none" style={{ background: `linear-gradient(to bottom, transparent 70%, ${accentColor}33 100%)` }} />}
              {isExpired && <div className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(to bottom, rgba(80,0,0,0.2) 0%, rgba(20,0,0,0.55) 100%)' }} />}
              {/* Badges */}
              <div className="absolute top-3 left-3 right-3 flex items-start justify-between gap-2 pointer-events-none">
                <span className="text-[8px] font-black uppercase tracking-wide px-2 py-1 rounded whitespace-nowrap"
                  style={{ background: 'rgba(0,0,0,0.55)', color: roleColor, backdropFilter: 'blur(4px)', border: `1px solid ${roleColor}44` }}>
                  {role}
                </span>
                {contractLength > 0 && (
                  <span className={`text-[8px] font-black uppercase tracking-wider px-2 py-1 rounded ${isExpired ? 'animate-pulse' : ''}`}
                    style={{
                      background: isExpired ? 'rgba(127,29,29,0.8)' : 'rgba(0,0,0,0.55)',
                      color: isExpired ? '#f87171' : '#94a3b8',
                      backdropFilter: 'blur(4px)',
                      border: isExpired ? '1px solid rgba(239,68,68,0.4)' : '1px solid rgba(100,116,139,0.3)',
                    }}>
                    {isExpired ? 'CONTRACT EXPIRED' : `${yearsRemaining}yr left`}
                  </span>
                )}
              </div>
            </div>

            {/* ── INFO SECTION — solid background, always readable ── */}
            <div className="flex flex-col gap-2 p-3 border-t border-surface-4">
              {/* Accent bar + Name */}
              <div>
                <div className="w-6 h-0.5 mb-1.5 rounded-full" style={{ background: accentColor }} />
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
                    className="bg-surface-3 border-0 border-b-2 focus:outline-none focus:ring-0 w-full text-txt-primary text-lg font-display font-black leading-none pb-0.5"
                    style={{ caretColor: 'white', borderColor: accentColor }}
                  />
                ) : (
                  <div onClick={() => !isExpired && setNameEditSlot(slot)} className={!isExpired ? 'cursor-text' : 'opacity-50'}>
                    {name.trim().includes(' ') && (
                      <p className="text-txt-secondary text-[11px] font-display font-semibold uppercase leading-none mb-0.5">
                        {name.trim().split(' ').slice(0, -1).join(' ')}
                      </p>
                    )}
                    <p className="text-txt-primary text-xl font-display font-black leading-tight">
                      {name.trim().includes(' ') ? name.trim().split(' ').pop() : name.trim()}
                    </p>
                  </div>
                )}
              </div>

              {/* Expired actions */}
              {isExpired && (
                <div className="flex gap-2">
                  <button onClick={() => handleResignStaff(slot)} className="flex-1 py-1.5 rounded font-display font-black text-[10px] uppercase tracking-wider transition" style={{ background: '#059669', color: '#fff' }}>
                    Re-sign
                  </button>
                  <button onClick={() => { if (slot === 1) clearSlot(1); else clearSlot(2); }} className="flex-1 py-1.5 rounded font-display font-black text-[10px] uppercase tracking-wider transition" style={{ background: 'rgba(127,29,29,0.8)', color: '#fca5a5' }}>
                    Replace
                  </button>
                </div>
              )}

              {!isExpired && (<>
                {/* Bio */}
                {bioEditSlot === slot ? (
                  <textarea
                    autoFocus
                    value={bio}
                    onChange={(e) => handleBioChange(e.target.value, slot)}
                    onBlur={() => setBioEditSlot(null)}
                    rows={3}
                    placeholder="Paste bio here…"
                    className="w-full rounded-lg text-[10px] text-txt-secondary leading-snug resize-none focus:outline-none p-2 bg-surface-3 border border-surface-5"
                    style={{ caretColor: 'white', scrollbarWidth: 'none' }}
                  />
                ) : (
                  <div className="cursor-text" onClick={() => setBioEditSlot(slot)}>
                    {bio
                      ? <p className="text-[10px] text-txt-secondary leading-snug whitespace-pre-line">{bio}</p>
                      : <p className="text-[9px] italic" style={{ color: `${accentColor}55` }}>Tap to add bio…</p>
                    }
                  </div>
                )}

                {/* Upload/Paste/URL/Clear */}
                <div className={`flex flex-wrap gap-1.5 transition-all duration-200 ${img ? 'opacity-0 group-hover:opacity-100' : 'opacity-100'}`}>
                  <label className="cursor-pointer px-2 py-1 rounded text-[9px] font-display font-bold uppercase tracking-wider transition" style={{ background: 'rgba(0,0,0,0.6)', color: roleColor, border: `1px solid ${roleColor}44`, backdropFilter: 'blur(4px)' }}>
                    Upload
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => handleImageUpload(e, slot)} />
                  </label>
                  <button onClick={() => pasteFromBtn(slot)} className="px-2 py-1 rounded text-[9px] font-display font-bold uppercase tracking-wider transition" style={{
                    background: 'rgba(0,0,0,0.6)',
                    color: pasteState[slot] === 'ok' ? '#34d399' : pasteState[slot] ? '#f87171' : '#94a3b8',
                    border: pasteState[slot] === 'ok' ? '1px solid rgba(52,211,153,0.4)' : pasteState[slot] ? '1px solid rgba(248,113,113,0.4)' : '1px solid rgba(100,116,139,0.3)',
                    backdropFilter: 'blur(4px)',
                  }}>
                    {pasteState[slot] === 'ok' ? 'Pasted' : pasteState[slot] === 'noimg' ? 'No Image' : pasteState[slot] === 'denied' ? 'Blocked' : pasteState[slot] === 'unsupported' ? 'Unsupported' : 'Paste'}
                  </button>
                  <button onClick={() => setShowUrl(!showUrl)} className="px-2 py-1 rounded text-[9px] font-display font-bold uppercase tracking-wider transition" style={{ background: 'rgba(0,0,0,0.6)', color: '#94a3b8', border: '1px solid rgba(100,116,139,0.3)', backdropFilter: 'blur(4px)' }}>
                    URL
                  </button>
                  {img && (
                    <button onClick={() => { if (slot === 1) clearSlot(1); else clearSlot(2); }} className="px-2 py-1 rounded text-[9px] font-display font-bold uppercase tracking-wider transition" style={{ background: 'rgba(127,29,29,0.6)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.3)', backdropFilter: 'blur(4px)' }}>
                      Clear
                    </button>
                  )}
                </div>

                {/* URL input */}
                {showUrl && (
                  <div className="flex gap-2 rounded-lg overflow-hidden" style={{ background: 'rgba(0,0,0,0.7)', border: '1px solid rgba(100,116,139,0.3)', backdropFilter: 'blur(4px)' }}>
                    <input type="text" value={urlText}
                      onChange={(e) => { if (slot === 1) setScoutUrlText(e.target.value); else setAnalystUrlText(e.target.value); }}
                      placeholder="Paste image URL…"
                      className="flex-1 bg-transparent text-[11px] font-mono text-slate-300 focus:outline-none px-2 py-1"
                    />
                    <button onClick={() => handleUrlSubmit(slot)} className="px-3 py-1 text-[9px] font-display font-bold text-white uppercase" style={{ background: accentColor }}>
                      Save
                    </button>
                  </div>
                )}

                {/* AI prompt buttons */}
                <div className="flex gap-1.5">
                  <button onClick={() => handleCopy(generateImgPrompt(slot === 1 ? 'scout' : 'analyst'), `${slot}-img`)} className="px-2 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider transition" style={{ background: 'rgba(0,0,0,0.5)', color: roleColor, backdropFilter: 'blur(4px)' }}>
                    {copiedKey === `${slot}-img` ? 'Copied' : 'IMG Prompt'}
                  </button>
                  <button onClick={() => handleCopy(generateBioPrompt(slot === 1 ? 'scout' : 'analyst', slot === 1 ? analystName : scoutName), `${slot}-bio`)} className="px-2 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider transition" style={{ background: 'rgba(0,0,0,0.5)', color: '#64748b', backdropFilter: 'blur(4px)' }}>
                    {copiedKey === `${slot}-bio` ? 'Copied' : 'BIO Prompt'}
                  </button>
                </div>
              </>)}
            </div>
          </div>
        ))}
        </div>{/* end portrait grid */}

        {/* Daily Brief panel */}
        <div className="flex-1 rounded-xl bg-surface-2 border border-surface-4 flex flex-col overflow-hidden">

          {/* Header */}
          <div className="px-4 py-3 border-b border-surface-4 shrink-0 flex items-center justify-between gap-3">
            <p className="text-[9px] font-black uppercase tracking-[0.15em] text-emerald-500">Daily Brief</p>
            <p className="text-[9px] text-txt-tertiary">from {analystName}</p>
          </div>

          {!briefData ? (
            <div className="flex-1 p-5 flex items-center justify-center">
              <p className="text-[10px] text-txt-tertiary italic text-center leading-relaxed">
                No prospects on file yet.<br/>Add targets on the Recruiting page to activate the brief.
              </p>
            </div>
          ) : (
            <div className="flex-1 flex flex-col min-h-0">
              {/* Headline */}
              <div className="px-5 pt-4 pb-3">
                <p className="text-[13px] font-bold text-txt-primary leading-snug">{briefData.headline}</p>
              </div>

              {/* Board Intel bullets */}
              <div className="px-5 pb-3 space-y-2">
                {briefData.info.map((b, i) => (
                  <div key={i} className="flex items-start gap-2.5">
                    <span className={`mt-[5px] w-1.5 h-1.5 rounded-full shrink-0 ${b.flag === 'good' ? 'bg-emerald-400' : 'bg-slate-500'}`} />
                    <p className="text-[11px] text-txt-secondary leading-snug">{b.text}</p>
                  </div>
                ))}
              </div>

              {/* Roster Concerns */}
              {rosterWarnings.length > 0 && (
                <div className="mx-4 mb-3 rounded-lg px-3 py-2.5 space-y-2" style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.12)' }}>
                  <p className="text-[8px] font-black uppercase tracking-[0.12em] text-red-500/70">Roster Concerns</p>
                  {rosterWarnings.map((w, i) => (
                    <div key={i} className="flex items-start gap-2.5">
                      <span className="mt-[5px] w-1.5 h-1.5 rounded-full shrink-0 bg-red-500/70" />
                      <p className="text-[11px] text-red-300/70 leading-snug">{w}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Sign-off */}
              <div className="mt-auto px-5 py-3 border-t border-surface-4">
                <p className="text-[9px] text-txt-tertiary">— {analystName}</p>
              </div>
            </div>
          )}
        </div>

      </div>{/* end hero row */}

      {/* ── ACTION CARDS ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[
          { view: 'database',   label: 'Player Database',    sub: 'Complete Data Storage' },
          { view: 'thresholds', label: 'Threshold Lookup',   sub: 'Player Comparison Tool' },
          { view: 'analysis',   label: 'Data Analysis',      sub: 'Staff Recommendations' },
          { view: 'counts',     label: 'Player Count',       sub: 'Current Overview' },
          { view: 'portal',     label: 'Portal Board',       sub: 'Transfer Commits' },
        ].map(({ view, label, sub }) => (
          <button
            key={view}
            onClick={() => setView(view)}
            className="rounded-xl text-left transition-all duration-200 bg-surface-2 border border-surface-4 hover:bg-surface-3 hover:border-surface-5 p-4 flex flex-col gap-2"
            style={{ minHeight: '88px' }}
          >
            <h4 className="text-sm font-display font-bold uppercase text-txt-primary leading-snug">{label}</h4>
            <p className="text-xs text-txt-tertiary leading-tight">{sub}</p>
          </button>
        ))}
      </div>
    </div>
  );
}