import React, { useState, useEffect, useMemo } from 'react';
import { computeScore } from './archetypeWeights';

// =========================================================================
// LIGHTWEIGHT INDEXEDDB MANAGER (Permanently Bypasses the 5MB Quota Limit)
// =========================================================================
import { createStaffAccessor } from './staffDB';

// Deterministic seeded RNG — same name always produces the same signature style.
function seededRng(seed) {
  let s = (seed ^ 0x5f3759df) >>> 0
  return () => { s ^= s << 13; s ^= s >> 17; s ^= s << 5; return ((s >>> 0) / 4294967296) }
}
function nameSeed(name) {
  return name.split('').reduce((a, c, i) => ((a * 31 + c.charCodeAt(0) * (i + 1)) | 0) >>> 0, 0x12345678)
}

// Load Dancing Script (a high-quality handwriting font) once per session.
let _sigFontInjected = false
function ensureSigFont() {
  if (_sigFontInjected || typeof document === 'undefined') return
  _sigFontInjected = true
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = 'https://fonts.googleapis.com/css2?family=Great+Vibes&display=swap'
  document.head.appendChild(link)
}

// Per-person style variation derived from their name so it's always the same.
function getSigVariant(name) {
  const rng = seededRng(nameSeed(name || ''))
  return {
    rotate: (rng() * 6 - 3).toFixed(2),              // -3° to +3°
    letterSpacing: (rng() * 0.03 - 0.01).toFixed(3), // slight spacing variation
  }
}

// Renders a staff member's name in Dancing Script — guaranteed to look good.
function Signature({ name, color = 'currentColor', fontSize = '1.45rem' }) {
  ensureSigFont()
  if (!name) return null
  const v = getSigVariant(name)
  return (
    <span style={{
      fontFamily: "'Great Vibes', cursive",
      fontSize,
      letterSpacing: `${v.letterSpacing}em`,
      color,
      display: 'inline-block',
      transform: `rotate(${v.rotate}deg)`,
      transformOrigin: 'left center',
      lineHeight: 1.1,
    }}>
      {name}
    </span>
  )
}

export default function ScoutStaffFrontPage({ setView, currentTeamName = 'college football team', currentYear, coachName = '', teamColors, teamLogo, recruits = [], rosterWarnings = [], rosterSummary = null, outlookSummary = null, dynastyId = null }) {
  const { getStaffData, saveStaffData, deleteStaffData } = createStaffAccessor(dynastyId);
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

  const [hiringMode, setHiringMode] = useState({ 1: false, 2: false });

  const [showScoutUrlInput, setShowScoutUrlInput] = useState(false);
  const [showAnalystUrlInput, setShowAnalystUrlInput] = useState(false);
  const [scoutUrlText, setScoutUrlText] = useState('');
  const [analystUrlText, setAnalystUrlText] = useState('');

  // Initial Boot-up: load names/images/bios immediately on mount
  useEffect(() => {
    async function loadBasicStaff() {
      const img1  = await getStaffData('scout_img');
      const img2  = await getStaffData('analyst_img');
      const name1 = await getStaffData('scout_name')   || '';
      const name2 = await getStaffData('analyst_name') || '';
      const bio1  = await getStaffData('scout_bio')    || '';
      const bio2  = await getStaffData('analyst_bio')  || '';

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

  const handleCopy = (text, key) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1000);
  };

  const generateImgPrompt = (role) => {
    const roleTitle = role === 'scout' ? 'National Scout/Recruiter' : 'Data Analyst/Statistical Evaluator';
    return `A crisp, highly detailed 1:1 square ratio centered profile headshot of a college football ${roleTitle}, ${getDynamicAgeString()}, ${getDynamicAttireString()}.
    STYLE SPECIFICATIONS: The character must look exactly like a rendered character from EA Sports College Football 27 — the specific in-game 3D art style used for coaches and staff on sidelines and menu screens. This means: slightly stylized but highly detailed 3D rendering, smooth yet textured skin with subtle subsurface scattering, polished game-engine lighting, sharp facial features with a slight cinematic sheen, and the unmistakable look of a next-gen sports video game character model. It must NOT look photorealistic or like a real photograph. It must NOT look like a cartoon, anime, or 2D illustration. The target aesthetic is the EA CFB 27 in-game coach/staff character — think Brian Kelly or Dabo Swinney rendered in the game engine, leaning forward on the sideline.
    BACKGROUND AND COMPOSITION: Set against a clean background with soft blurred stadium or facility lighting using ${currentTeamName} team colors. CRITICAL: The background must be completely clear of any typography, watermarks, logos, or overlaid graphic text. It must look like a clean in-game portrait asset.
    [DIVERSITY MANDATE - HYPER-VARIED INHERITANCE]: Intentionally generate an entirely randomized demographic combination. The person must feature a completely unique face shape, variable body weight (ranging from stocky, heavy-set, husky, or round builds to lean or average builds), distinct skin tones (Black, Caucasian, Hispanic, Asian, Indigenous, Mixed-race), multi-ethnic features, diverse facial structures, varying nose/jawline shapes, and entirely unique hairstyles or facial hair setups. Avoid default baselines or repetitive character templates.
    COMPOSITION AND CLOSE-UP SCALE: Tightly frame and crop the subject so it focuses closely on their head and neck, showing only the very top apex of the shoulders. It should be a clear, close-up portrait that maximizes facial details without getting cut off, ensuring the character's face remains cleanly centered and highly visible when scaled down to a small card box icon.`;
  };

  const generateBioPrompt = (role, otherName) => {
    const isScout = role === 'scout';
    const roleTitle   = isScout ? 'National Scout' : 'Data Analyst';
    const roleContext = isScout
      ? 'a National Scout who specializes in hands-on field evaluation, on-campus recruiting visits, building relationships with high school coaches, and identifying under-the-radar talent'
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

    const coachLastName = coachName ? coachName.trim().split(/\s+/).slice(-1)[0] : '';
    const coachRef = coachLastName ? `Coach ${coachLastName}` : 'the head coach';
    const programRef = currentTeamName || 'the program';

    const scoutNoteContext = `This person is a National Scout. Their staff note must relate to scouting, talent evaluation, player character assessment, reading a prospect's upside, or their relationships with high school or junior college coaches. The backstory should feel grounded in the field — a coach's recommendation, a combine evaluation, a recruiting overlap, noticing a kid that nobody else was watching, or being trusted to evaluate character as much as ability.`;
    const analystNoteContext = `This person is a Data Analyst. Their staff note must relate to data analysis, roster construction, player metrics, statistical modeling, film breakdown, or identifying roster inefficiencies. The backstory should feel grounded in the film room or the numbers — a metric system they built, a roster gap they identified, an analytics presentation that got noticed, or being brought in to modernize how the staff evaluates talent.`;
    const noteContext = isScout ? scoutNoteContext : analystNoteContext;

    const connectionInstruction = `The connection can be to ${coachRef} directly (they worked together before, were recommended by a mutual contact, crossed paths at a clinic or combine, or the coach sought them out specifically) OR to the ${programRef} program itself (they played here, have deep ties to this region, or were already embedded in the school's network). Either is valid — vary the angle.`;

    return `Generate a text biography for a college football staff member's dossier board. This person is ${roleContext}. Output ONLY the following lines with no introduction, no markdown, no bullet symbols, and no extra blank lines:\n\n${uniquenessClause}Suggested Name: (CRITICAL — look at the headshot image carefully before writing anything. Identify the person's visible ethnic and racial background from their face, skin tone, and features. Then generate a name that authentically matches that specific person. The name must feel natural and believable for someone of that exact background who grew up in America. Examples by background: if they look Black/African-American → names like Darius Webb, Andre Collins, DeShawn Morris, Terrell Grant; if they look Hispanic/Latino → names like Carlos Reyes, Miguel Torres, Luis Mendez, Marco Rios; if they look East Asian → names like Kevin Park, Jason Chen, Tyler Nguyen, Daniel Kim — never a fully Black or European name for someone with Asian features; if they look white → names like Ryan Mitchell, Scott Henderson, Tyler Brooks, Brian Callahan. Common first names are fine as long as they match the face. Do not assign a name that would look wrong next to the headshot — the name and face must feel like the same real person.)
Hometown: (THIS IS THE MOST IMPORTANT FIELD FOR VARIETY. You MUST draw this person's hometown from the following specific U.S. region for this generation: ${zone}. Pick a real, specific smaller city or town within that zone — NOT a major metro hub. Every generation should feel like it comes from a completely different part of the country. Lean toward towns that are not frequently chosen — the goal is geographic spread across the full breadth of America.)
Alma Mater: (Draw this person's college from the following specific conference tier for this generation: ${conf}. Pick a specific school from that group. The goal is a country-wide coaching tree that goes deep into mid-major and lower-tier football. Be specific — name the actual school, not just the conference. Favor less commonly chosen schools within the tier to maximize variety across generations.)
Staff Note: (${noteContext} ${connectionInstruction} Write a tight one-liner origin story of how this person landed this specific job. It should read like a fact from their dossier file, not a generic job description. CRITICAL RULE: If you mention the head coach, NEVER use their full name — always write "${coachRef}" or just "Coach". HARD LIMIT: 120 characters maximum including spaces — count before writing. Rewrite shorter if over. Do not exceed this limit.)`;
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
    const hasBoard = total > 0;
    const hasRoster = rosterSummary && rosterSummary.total > 0;

    if (!hasBoard && !hasRoster) return null;

    const hiddenDev = d => !d || d === 'Hidden' || d === 'hidden' || d === '';

    // Roster line (always shown when roster data exists)
    let rosterLine = null;
    if (hasRoster) {
      const { returning, leaving, available } = rosterSummary;
      rosterLine = `${returning} returning · ${leaving} graduating · ${available} open spot${available !== 1 ? 's' : ''}`;
    }

    // Critical / pipeline position flags
    const criticals = rosterSummary?.criticalPositions ?? [];
    const pipelines = rosterSummary?.pipelinePositions ?? [];

    // Headline — board-driven if board exists, roster-driven otherwise
    let headline;
    if (hasBoard) {
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
    } else if (criticals.length > 0) {
      headline = `${criticals.slice(0, 2).join(' and ')} ${criticals.length === 1 ? 'is a critical need' : 'are critical needs'} — no targets on the board yet.`;
    } else if (hasRoster) {
      const { available } = rosterSummary;
      headline = `${available} spot${available !== 1 ? 's' : ''} to fill this class. No targets filed yet — open the board.`;
    }

    // Board intel bullets
    const info = [];
    if (hasBoard) {
      info.push({ text: `${total} prospects on file — ${t1} elite, ${t2} solid, ${t4} depth`, flag: t1 > 0 ? 'good' : 'neutral' });

      const top = scored[0];
      if (top) {
        const topDevNote = top.devTrait && !hiddenDev(top.devTrait) ? ` — ${top.devTrait} dev` : '';
        info.push({ text: `${top.name} (${top.position}) leads at ${top.score.toFixed(0)} composite${topDevNote}`, flag: top.score >= 88 ? 'good' : 'neutral' });
      }

      const eliteDevs = scored.filter(r => r.devTrait === 'Elite');
      const starDevs  = scored.filter(r => r.devTrait === 'Star');
      if (eliteDevs.length > 0) {
        info.push({ text: `${eliteDevs.map(r => r.name).join(', ')} — Elite dev confirmed`, flag: 'good' });
      } else if (starDevs.length > 0) {
        info.push({ text: `${starDevs.length} Star dev${starDevs.length > 1 ? 's' : ''} — ${starDevs.slice(0, 2).map(r => r.name).join(', ')}`, flag: 'good' });
      }

      const portalCount = scored.filter(r => r.isPortal).length;
      if (portalCount > 0 && portalCount <= total * 0.5) {
        info.push({ text: `${portalCount} portal transfer${portalCount > 1 ? 's' : ''} in the mix`, flag: 'neutral' });
      }
    }

    // Program Outlook summary rows
    const ALL_POS = ['QB','HB','WR','TE','OT','OG','C','DE','DT','OLB','MIKE','CB','FS','SS'];
    let outlookRows = null;

    if (outlookSummary) {
      // Full detail from Program Outlook — use its verdicts and labels
      const actionRows = [];
      const coveredList = [];
      ALL_POS.forEach(pos => {
        const s = outlookSummary[pos];
        if (!s) return;
        const vk = s.verdictKey;
        if (!vk || vk === 'no-investment' || vk === 'covered' || vk === 'monitor') {
          coveredList.push(pos);
          return;
        }
        if (s.subPositionSummary?.length >= 2) {
          const needsSides = s.subPositionSummary.filter(sg => sg.needsPortal);
          if (needsSides.length > 0 && needsSides.length < s.subPositionSummary.length) {
            needsSides.forEach(sg => {
              actionRows.push({ pos: sg.label, label: '1 portal target', flag: vk === 'critical' ? 'critical' : 'depth' });
            });
            s.subPositionSummary.filter(sg => !sg.needsPortal).forEach(sg => coveredList.push(sg.label));
            return;
          }
        }
        const flag = vk === 'critical' ? 'critical' : 'depth';
        const label = s.label || (vk === 'depth-needed' ? 'depth work needed' : 'needs attention');
        actionRows.push({ pos, label, flag });
      });
      if (actionRows.length > 0 || coveredList.length > 0) outlookRows = { actionRows, coveredList };
    }

    return { headline, info: info.slice(0, 3), rosterLine, criticals, pipelines, outlookRows };
  }, [analysisData, rosterSummary, outlookSummary]);

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
            role: 'National Scout',
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
        ].map(({ slot, img, name, bio, isExpired, yearsRemaining, contractLength, role, roleColor, showUrl, setShowUrl, urlText, setUrlText, accentColor }) => {
          const PLACEHOLDER = slot === 1 ? 'Staff Slot #1' : 'Staff Slot #2';
          const isHired = !!img || (name && name !== PLACEHOLDER) || !!bio;
          const isEmptySlot = !isHired && !hiringMode[slot];
          const isHiring   = !isHired && !!hiringMode[slot];
          const fireStaff  = () => { clearSlot(slot); setHiringMode(prev => ({ ...prev, [slot]: false })); };
          // Overlay color matches the role badge text color exactly — near-opaque so the
          // true hex reads correctly (heavy alpha-blending over the dark card shifts the hue).
          const overlayBg = `${roleColor}F5`;
          return (
          <div key={slot} className="relative flex-1 flex flex-col rounded-xl overflow-hidden group min-h-[300px] bg-surface-2 border border-surface-4"
            style={ isExpired ? { borderColor: 'rgba(239,68,68,0.25)', background: 'rgba(25,5,5,1)' } : {} }>

            {/* ── PHOTO — always rendered (visible through overlay when empty) ── */}
            <div
              className={`relative flex-shrink-0 overflow-hidden ${img && !isExpired && !isEmptySlot ? 'cursor-zoom-in' : ''}`}
              style={{ aspectRatio: '4/5' }}
              onClick={() => { if (img && !isExpired && !isEmptySlot) setActiveModalImg(img); }}
            >
              {img ? (
                <img src={img} alt={role} className="absolute inset-0 w-full h-full object-cover object-top transition-transform duration-500 group-hover:scale-[1.03]" />
              ) : (
                <div className="absolute inset-0 bg-surface-3 flex items-center justify-center">
                  <p className="text-[9px] font-display font-bold uppercase text-txt-tertiary tracking-widest text-center px-3 leading-loose">{role}<br/>No Photo</p>
                </div>
              )}
              {img && <div className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(to bottom, transparent 60%, rgba(0,0,0,0.45) 100%)' }} />}
              {img && !isExpired && <div className="absolute inset-0 pointer-events-none" style={{ background: `linear-gradient(to bottom, transparent 70%, ${accentColor}33 100%)` }} />}
              {isExpired && <div className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(to bottom, rgba(80,0,0,0.2) 0%, rgba(20,0,0,0.55) 100%)' }} />}
              {!isEmptySlot && (
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
              )}
            </div>

            {/* ── INFO SECTION — always rendered ── */}
            <div className="flex flex-col gap-2 p-3 border-t border-surface-4">
              {/* Accent bar + Name */}
              <div>
                <div className="w-6 h-0.5 mb-1.5 rounded-full" style={{ background: accentColor }} />
                {nameEditSlot === slot && !isEmptySlot ? (
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
                  <div onClick={() => !isExpired && !isEmptySlot && setNameEditSlot(slot)} className={!isExpired && !isEmptySlot ? 'cursor-text' : 'opacity-50'}>
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
                  <button onClick={() => { clearSlot(slot); setHiringMode(prev => ({ ...prev, [slot]: true })); }} className="flex-1 py-1.5 rounded font-display font-black text-[10px] uppercase tracking-wider transition" style={{ background: 'rgba(127,29,29,0.8)', color: '#fca5a5' }}>
                    Replace
                  </button>
                </div>
              )}

              {/* ── HIRED: bio (editable) + Fire button only ── */}
              {!isExpired && isHired && (<>
                {bioEditSlot === slot ? (
                  <textarea autoFocus value={bio} onChange={(e) => handleBioChange(e.target.value, slot)} onBlur={() => setBioEditSlot(null)}
                    rows={3} placeholder="Paste bio here…"
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
                <button onClick={fireStaff}
                  className="w-full py-1.5 rounded font-display font-black text-[10px] uppercase tracking-wider mt-auto"
                  style={{ background: 'rgba(127,29,29,0.45)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.2)' }}>
                  Fire {slot === 1 ? 'Scout' : 'Analyst'}
                </button>
              </>)}

              {/* ── HIRING MODE: full setup controls ── */}
              {!isExpired && isHiring && (<>
                {bioEditSlot === slot ? (
                  <textarea autoFocus value={bio} onChange={(e) => handleBioChange(e.target.value, slot)} onBlur={() => setBioEditSlot(null)}
                    rows={3} placeholder="Paste bio here…"
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
                <div className="flex flex-wrap gap-1.5">
                  <label className="cursor-pointer px-2 py-1 rounded text-[9px] font-display font-bold uppercase tracking-wider" style={{ background: 'rgba(0,0,0,0.6)', color: roleColor, border: `1px solid ${roleColor}44`, backdropFilter: 'blur(4px)' }}>
                    Upload
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => handleImageUpload(e, slot)} />
                  </label>
                  <button onClick={() => pasteFromBtn(slot)} className="px-2 py-1 rounded text-[9px] font-display font-bold uppercase tracking-wider" style={{
                    background: 'rgba(0,0,0,0.6)',
                    color: pasteState[slot] === 'ok' ? '#34d399' : pasteState[slot] ? '#f87171' : '#94a3b8',
                    border: pasteState[slot] === 'ok' ? '1px solid rgba(52,211,153,0.4)' : pasteState[slot] ? '1px solid rgba(248,113,113,0.4)' : '1px solid rgba(100,116,139,0.3)',
                    backdropFilter: 'blur(4px)',
                  }}>
                    {pasteState[slot] === 'ok' ? 'Pasted' : pasteState[slot] === 'noimg' ? 'No Image' : pasteState[slot] === 'denied' ? 'Blocked' : pasteState[slot] === 'unsupported' ? 'Unsupported' : 'Paste'}
                  </button>
                  <button onClick={() => setShowUrl(!showUrl)} className="px-2 py-1 rounded text-[9px] font-display font-bold uppercase tracking-wider" style={{ background: 'rgba(0,0,0,0.6)', color: '#94a3b8', border: '1px solid rgba(100,116,139,0.3)', backdropFilter: 'blur(4px)' }}>
                    URL
                  </button>
                </div>
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
                <div className="flex gap-1.5">
                  <button onClick={() => handleCopy(generateImgPrompt(slot === 1 ? 'scout' : 'analyst'), `${slot}-img`)} className="px-2 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider" style={{ background: 'rgba(0,0,0,0.5)', color: roleColor, backdropFilter: 'blur(4px)' }}>
                    {copiedKey === `${slot}-img` ? 'Copied' : 'IMG Prompt'}
                  </button>
                  <button onClick={() => handleCopy(generateBioPrompt(slot === 1 ? 'scout' : 'analyst', slot === 1 ? analystName : scoutName), `${slot}-bio`)} className="px-2 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider" style={{ background: 'rgba(0,0,0,0.5)', color: '#64748b', backdropFilter: 'blur(4px)' }}>
                    {copiedKey === `${slot}-bio` ? 'Copied' : 'BIO Prompt'}
                  </button>
                </div>
              </>)}
            </div>

            {/* ── EMPTY OVERLAY — colored glass on top, barely shows card beneath ── */}
            {isEmptySlot && (
              <div
                className="absolute inset-0 flex items-center justify-center z-20"
                style={{
                  background: overlayBg,
                  boxShadow: `inset 0 0 90px 18px ${roleColor}66, 0 0 45px 6px ${roleColor}55`,
                }}
              >
                <button
                  onClick={() => setHiringMode(prev => ({ ...prev, [slot]: true }))}
                  className="px-8 py-3 rounded-xl font-display font-black text-[13px] uppercase tracking-widest transition-all"
                  style={{
                    background: 'rgba(255,255,255,0.15)',
                    color: '#fff',
                    border: '1px solid rgba(255,255,255,0.35)',
                    backdropFilter: 'blur(6px)',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.25)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.15)'; }}
                >
                  Hire {slot === 1 ? 'Scout' : 'Analyst'}
                </button>
              </div>
            )}
          </div>
        );})}

        </div>{/* end portrait grid */}

        {/* Daily Brief panel */}
        <div className="flex-1 rounded-xl bg-surface-2 border border-surface-4 flex flex-col overflow-hidden">

          {/* Header */}
          <div className="px-4 py-3 border-b border-surface-4 shrink-0 flex items-center justify-between gap-3">
            <p className="text-sm font-display font-bold uppercase text-txt-primary">Daily Brief</p>
            <p className="text-[9px] text-txt-tertiary">from {analystName}</p>
          </div>

          <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">

            {/* ── PROGRAM OUTLOOK SNAPSHOT ── */}
            <div className="px-4 pt-4 pb-3 border-b border-surface-4">
              <p className="text-[8px] font-black uppercase tracking-[0.15em] text-slate-500 mb-3">Position Status</p>
              {briefData?.outlookRows ? (() => {
                const crits  = briefData.outlookRows.actionRows.filter(r => r.flag === 'critical');
                const depths = briefData.outlookRows.actionRows.filter(r => r.flag === 'depth');
                const nCovered = briefData.outlookRows.coveredList.length;
                const allClear = crits.length === 0 && depths.length === 0;
                return (
                  <div className="space-y-3">
                    {/* At-a-glance counts */}
                    <div className="flex items-end gap-5">
                      {crits.length > 0 && (
                        <div>
                          <p className="text-[26px] font-black leading-none text-red-400">{crits.length}</p>
                          <p className="text-[7px] font-bold uppercase tracking-widest text-red-400/50 mt-0.5">critical</p>
                        </div>
                      )}
                      {depths.length > 0 && (
                        <div>
                          <p className="text-[26px] font-black leading-none text-amber-400">{depths.length}</p>
                          <p className="text-[7px] font-bold uppercase tracking-widest text-amber-400/50 mt-0.5">depth</p>
                        </div>
                      )}
                      <div>
                        <p className={`text-[26px] font-black leading-none ${allClear ? 'text-emerald-400' : 'text-slate-400'}`}>{nCovered}</p>
                        <p className={`text-[7px] font-bold uppercase tracking-widest mt-0.5 ${allClear ? 'text-emerald-400/50' : 'text-slate-500'}`}>set</p>
                      </div>
                    </div>

                    {/* Summary sentences */}
                    {allClear ? (
                      <p className="text-[10px] text-slate-400 leading-snug">All positions are in good shape. Nothing urgent on the roster right now.</p>
                    ) : (
                      <div className="space-y-1.5">
                        {crits.length > 0 && (
                          <p className="text-[10px] leading-snug text-slate-300">
                            <span className="text-red-400 font-semibold">{crits.map(r => r.pos).join(', ')}</span>
                            {crits.length === 1 ? ' has a gap' : ' have gaps'} that need to be addressed before next season.
                          </p>
                        )}
                        {depths.length > 0 && (
                          <p className="text-[10px] leading-snug text-slate-400">
                            <span className="text-amber-400/80 font-semibold">{depths.map(r => r.pos).join(', ')}</span>
                            {depths.length === 1 ? ' is running light' : ' are running light'} on depth in the next couple years.
                          </p>
                        )}
                      </div>
                    )}

                    <button
                      onClick={() => setView('analysis')}
                      className="text-[9px] text-slate-500 hover:text-slate-300 transition-colors font-medium tracking-wide"
                    >
                      Program Outlook →
                    </button>
                  </div>
                );
              })() : (
                <button onClick={() => setView('analysis')} className="w-full rounded-lg px-3 py-3 border border-dashed border-slate-700 text-[9px] text-slate-500 hover:border-slate-500 hover:text-slate-400 transition-colors text-center">
                  Open Program Outlook to generate position notes
                </button>
              )}
            </div>

            {/* ── RECRUITING PLAN ── */}
            {outlookSummary && (() => {
              const POSITIONS = ['QB','HB','WR','TE','OT','OG','C','DE','DT','OLB','MIKE','CB','FS','SS'];
              // Build a flag lookup from Position Status data
              const flagMap = {};
              if (briefData?.outlookRows?.actionRows) {
                briefData.outlookRows.actionRows.forEach(r => { flagMap[r.pos] = r.flag; });
              }
              const rows = POSITIONS
                .map(pos => ({ pos, hs: outlookSummary[pos]?.hsMin ?? 0, portal: outlookSummary[pos]?.portalMin ?? 0, flag: flagMap[pos] ?? null }))
                .filter(r => r.hs > 0 || r.portal > 0);
              if (!rows.length) return null;
              const totalHs     = rows.reduce((s, r) => s + r.hs, 0);
              const totalPortal = rows.reduce((s, r) => s + r.portal, 0);
              return (
                <div className="px-4 pt-3 pb-3 border-b border-surface-4">
                  <div className="flex items-center justify-between mb-2.5">
                    <p className="text-[8px] font-black uppercase tracking-[0.15em] text-slate-500">Recruiting Plan</p>
                    <div className="flex items-center gap-2">
                      {totalHs > 0 && <span className="text-[7px] font-bold text-slate-400">{totalHs} HS</span>}
                      {totalHs > 0 && totalPortal > 0 && <span className="text-slate-700 text-[7px]">·</span>}
                      {totalPortal > 0 && <span className="text-[7px] font-bold text-purple-400">{totalPortal} Portal</span>}
                    </div>
                  </div>
                  <div className="space-y-1">
                    {rows.map((r, i) => {
                      const isCritical = r.flag === 'critical';
                      const isDepth    = r.flag === 'depth';
                      const posColor   = isCritical ? 'text-red-400' : isDepth ? 'text-amber-400' : 'text-slate-400';
                      // Badge styles: critical → red tint, depth → amber tint, normal → sky/purple
                      const hsBg    = isCritical ? 'bg-red-950 border-red-800 text-red-300'
                                    : isDepth    ? 'bg-amber-950 border-amber-800 text-amber-300'
                                    : 'bg-sky-950 border-sky-700 text-sky-300';
                      const portalBg = isCritical ? 'bg-red-950 border-red-800 text-red-300'
                                     : isDepth    ? 'bg-amber-950 border-amber-800 text-amber-300'
                                     : 'bg-purple-950 border-purple-800 text-purple-300';
                      return (
                        <div key={i} className="flex items-center gap-2">
                          <span className={`text-[9px] font-display font-black tracking-wide w-8 shrink-0 ${posColor}`}>{r.pos}</span>
                          <div className="flex items-center gap-1.5">
                            {r.hs > 0 && (
                              <span className={`text-[8px] font-bold px-2 py-0.5 rounded border ${hsBg}`}>
                                {r.hs} HS
                              </span>
                            )}
                            {r.portal > 0 && (
                              <span className={`text-[8px] font-bold px-2 py-0.5 rounded border ${portalBg}`}>
                                {r.portal} Portal
                              </span>
                            )}
                            {isCritical && <span className="text-[7px] font-black uppercase tracking-wide text-red-500/60">critical</span>}
                            {isDepth    && <span className="text-[7px] font-black uppercase tracking-wide text-amber-500/50">depth</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {/* ── RECENTLY FILED ── */}
            {recruits.length > 0 && (() => {
              const recent = [...recruits].sort((a, b) => b.addedIndex - a.addedIndex).slice(0, 3);
              return (
                <div className="px-4 pt-3 pb-4 border-b border-surface-4">
                  <p className="text-[8px] font-black uppercase tracking-[0.15em] text-slate-500 mb-2.5">Recently Filed</p>
                  <div className="space-y-1.5">
                    {recent.map((r, i) => {
                      const showDev = r.devTrait && r.devTrait !== 'Hidden';
                      const score = Math.round(computeScore(r));
                      const gradeTiers = [
                        { grade: 'A+', min: 95, cls: 'text-emerald-200' },
                        { grade: 'A',  min: 90, cls: 'text-emerald-300' },
                        { grade: 'A-', min: 86, cls: 'text-emerald-400' },
                        { grade: 'B+', min: 82, cls: 'text-sky-200' },
                        { grade: 'B',  min: 78, cls: 'text-sky-300' },
                        { grade: 'B-', min: 74, cls: 'text-sky-400' },
                        { grade: 'C+', min: 70, cls: 'text-yellow-300' },
                        { grade: 'C',  min: 66, cls: 'text-amber-300' },
                        { grade: 'C-', min: 62, cls: 'text-amber-400' },
                        { grade: 'D+', min: 58, cls: 'text-orange-300' },
                        { grade: 'D',  min: 54, cls: 'text-orange-400' },
                        { grade: 'D-', min: 50, cls: 'text-red-400' },
                        { grade: 'F',  min: 0,  cls: 'text-red-400' },
                      ];
                      const tier = gradeTiers.find(t => score >= t.min) ?? gradeTiers[gradeTiers.length - 1];
                      return (
                        <div key={i} className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 bg-slate-800/40 border border-slate-700/40">
                          <span className={`text-[8px] font-display font-black tracking-wide px-1.5 py-0.5 rounded shrink-0 ${r.isPortal ? 'bg-purple-950 border border-purple-800 text-purple-300' : 'bg-slate-700 border border-slate-600 text-slate-300'}`}>{r.position}</span>
                          <span className="text-[11px] font-bold text-txt-primary truncate flex-1">{r.name}</span>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className={`text-[9px] font-black tabular-nums text-slate-400`}>{score}</span>
                            <span className={`text-[10px] font-black ${tier.cls}`}>{tier.grade}</span>
                            {showDev && (
                              <span className={`text-[7px] font-black uppercase tracking-wide px-1 py-0.5 rounded border ${
                                r.devTrait === 'Elite' ? 'bg-yellow-950 border-yellow-700 text-yellow-400'
                                : r.devTrait === 'Star' ? 'bg-sky-950 border-sky-700 text-sky-400'
                                : r.devTrait === 'Impact' ? 'bg-emerald-950 border-emerald-700 text-emerald-400'
                                : 'bg-slate-800 border-slate-600 text-slate-400'
                              }`}>{r.devTrait}</span>
                            )}
                            {r.stars > 0 && <span className="text-[10px] font-bold text-amber-400">{r.stars}★</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {/* Sign-off */}
            <div className="mt-auto px-4 py-3">
              <span className="text-[9px] text-txt-tertiary flex items-center gap-1.5">— <Signature name={analystName} color="#94a3b8" fontSize="1.25rem" /></span>
            </div>
          </div>
        </div>

      </div>{/* end hero row */}

      {/* ── ACTION CARDS ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[
          { view: 'database',   label: 'Recruiting Database', sub: 'True Freshmen Only',      color: 'text-red-500',    icon: (
            <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4" stroke="currentColor" strokeWidth="1.5">
              <ellipse cx="8" cy="4" rx="5" ry="2"/>
              <path d="M3 4v4c0 1.1 2.24 2 5 2s5-.9 5-2V4"/>
              <path d="M3 8v4c0 1.1 2.24 2 5 2s5-.9 5-2V8"/>
            </svg>
          )},
          { view: 'thresholds', label: 'Threshold Lookup',   sub: 'Player Comparison Tool',   color: 'text-blue-400',   icon: (
            <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4" stroke="currentColor" strokeWidth="1.5">
              <path d="M2 12l4-4 3 3 5-7"/>
              <circle cx="14" cy="5" r="1.5" fill="currentColor" stroke="none"/>
            </svg>
          )},
          { view: 'analysis',   label: 'Program Outlook',    sub: 'Staff Recommendations',    color: 'text-emerald-400', icon: (
            <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="2" width="10" height="12" rx="1.5"/>
              <path d="M5.5 5h5M5.5 7.5h5M5.5 10h3"/>
            </svg>
          )},
          { view: 'counts',     label: 'Player Count',       sub: 'Current Overview',         color: 'text-orange-400', icon: (
            <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4" stroke="currentColor" strokeWidth="1.5">
              <circle cx="6" cy="5" r="2"/>
              <circle cx="11" cy="5" r="2"/>
              <path d="M2 13c0-2.2 1.8-4 4-4h4c2.2 0 4 1.8 4 4"/>
            </svg>
          )},
          { view: 'portal',     label: 'Portal Board',       sub: 'Transfer Commits',         color: 'text-purple-400', icon: (
            <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4" stroke="currentColor" strokeWidth="1.5">
              <path d="M9 3l4 5-4 5"/>
              <path d="M13 8H5"/>
              <path d="M3 5v6"/>
            </svg>
          )},
        ].map(({ view, label, sub, icon, color }) => (
          <button
            key={view}
            onClick={() => setView(view)}
            className="relative rounded-xl text-left transition-all duration-200 bg-surface-2 border border-surface-4 hover:bg-surface-3 hover:border-surface-5 p-4 flex flex-col gap-2"
            style={{ minHeight: '88px' }}
          >
            <span className={`absolute top-3 right-3 opacity-60 ${color}`}>{icon}</span>
            <h4 className="text-sm font-display font-bold uppercase text-txt-primary leading-snug">{label}</h4>
            <p className="text-xs text-txt-tertiary leading-tight">{sub}</p>
          </button>
        ))}
      </div>
    </div>
  );
}