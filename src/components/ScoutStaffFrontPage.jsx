import React, { useState, useEffect, useMemo } from 'react';
import { computeScore } from './archetypeWeights';
import { buildRevealedPool, buildWeightsMap } from '../utils/devTraitLearning';

// =========================================================================
// LIGHTWEIGHT INDEXEDDB MANAGER (Permanently Bypasses the 5MB Quota Limit)
// =========================================================================
import { createStaffAccessor } from './staffDB';
import RecruitingPlanRow from './RecruitingPlanRow';

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

export default function ScoutStaffFrontPage({ setView, onViewDatabase, currentTeamName = 'college football team', currentYear, coachName = '', teamColors, teamLogo, recruits = [], databaseRecruits = [], rosterWarnings = [], rosterSummary = null, outlookSummary = null, committedRecruits = [], dynastyId = null }) {
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

  // A slot only counts as "hired" once the user explicitly confirms — not just
  // because a photo happened to get uploaded first.
  const [scoutConfirmed, setScoutConfirmed] = useState(false);
  const [analystConfirmed, setAnalystConfirmed] = useState(false);

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
  const [bioPasteState, setBioPasteState] = useState({});

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

      const conf1 = await getStaffData('scout_confirmed');
      const conf2 = await getStaffData('analyst_confirmed');
      if (conf1) {
        setScoutConfirmed(true);
      } else if (img1 && name1 && name1 !== 'Staff Slot #1' && bio1) {
        // Migration: this slot was fully filled out before the confirm step existed — honor it as hired.
        setScoutConfirmed(true);
        await saveStaffData('scout_confirmed', true);
      }
      if (conf2) {
        setAnalystConfirmed(true);
      } else if (img2 && name2 && name2 !== 'Staff Slot #2' && bio2) {
        setAnalystConfirmed(true);
        await saveStaffData('analyst_confirmed', true);
      }

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
    const roleTitle = role === 'scout' ? 'National Scout' : 'Data Analyst';
    return `Generate one image of a college football staff member. Two rules below are the most important and are broken most often — follow them exactly, in order, before anything else in this prompt.

RULE 1 — CROP AND CANVAS (the #1 mistake: cropping too tight and cutting off the head):
- Portrait orientation, 4:5 aspect ratio (width:height = 4:5 — e.g. 1024 wide x 1280 tall). Never square (1:1), never landscape.
- Leave a clearly visible gap of empty background between the top of the hair and the top edge of the canvas — about 10% of the total image height. The hair/head must NEVER touch, crop into, or come close to the top edge.
- The bottom edge of the canvas must show the neck and the top of the shoulders/upper chest — not the chin, not just the apex of the shoulders.
- Center the person left-to-right with equal empty margin on both sides.
- Think "staff directory ID photo" framing: head-and-shoulders, with breathing room on all four sides — not a tight face-only crop, not a zoomed-out waist-up shot.

RULE 2 — ART STYLE (the #2 mistake: rendering a realistic photo instead of a video game character):
- The output must look like a 3D real-time VIDEO GAME character model — the in-engine portrait style used by current-gen sports video games (comparable to EA Sports College Football's coach/staff portraits). It must NOT look like a photograph of a real human being, no matter what your default rendering style is.
- Do not produce a photo, photorealistic image, corporate headshot, stock photo, or DSLR-style portrait. Do not produce real photographic skin pores, camera grain, or camera bokeh.
- Skin: smooth, semi-matte, slightly synthetic game-engine PBR shader look, visibly cleaner and less detailed than real human skin. Eyes: glassy stylized game-render catchlight, not photoreal depth. Hair: rendered hair-card/hair-strand geometry in defined clumps, not photographic frizz.
- Lighting: even, stylized three-point in-game cutscene lighting with a soft rim light separating the subject from the background — not natural or studio photography lighting.

SUBJECT: A ${roleTitle} for ${currentTeamName}, ${getDynamicAgeString()}, ${getDynamicAttireString()}.

BACKGROUND: Soft, blurred stadium or facility background using ${currentTeamName} team colors, blurred with the same stylized in-game depth-of-field look as Rule 2 — not real camera bokeh. No text, watermarks, or logos overlaid anywhere on the image.

DIVERSITY: Randomize the person's ethnicity, skin tone, face shape, body build, and hairstyle/facial hair every time this prompt is used — avoid repeating the same look across generations.

BEFORE FINALIZING, CHECK BOTH RULES AGAIN: (1) Is this a 4:5 portrait canvas with visible headroom above the hair and the shoulders/upper chest visible at the bottom — not cropped tight to the face? (2) Does this look like an obvious video game render and NOT a real photograph? If either check fails, redo the image until both pass.`;
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
      'MAC (Ball State, Ohio, Akron, Kent State, Eastern Michigan, Bowling Green, Toledo, Buffalo, Western Michigan)',
      'Sun Belt (Appalachian State, Arkansas State, Southern Miss, Georgia Southern, Old Dominion, Coastal Carolina, Troy, James Madison)',
      'Conference USA (UTEP, Louisiana Tech, Middle Tennessee, FAU, Liberty, Western Kentucky, Jacksonville State, Sam Houston)',
      'Mountain West (Wyoming, San Jose State, Fresno State, Air Force, Colorado State, Hawaii, UNLV, Boise State)',
      'American Athletic (Tulane, Memphis, ECU, Temple, Tulsa, UTSA, Navy, Rice, South Florida)',
      'ACC (Wake Forest, Boston College, Duke, Virginia, Syracuse, Georgia Tech, NC State, Pittsburgh)',
      'Big 12 (Kansas, Kansas State, Iowa State, West Virginia, Cincinnati, Houston, TCU, Baylor)',
      'SEC and Big Ten lower-profile programs (Vanderbilt, Mississippi State, Purdue, Rutgers, Northwestern, Illinois, Minnesota, Kentucky)',
      'Pac-12 and independents (Oregon State, Washington State, Notre Dame, UConn, UMass)',
      'Group of Five overlooked programs (New Mexico State, Kennesaw State, Delaware, Missouri State, Charlotte)',
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

    const scoutNoteContext = `This person is a National Scout. Their staff note must name the SPECIFIC real program or organization they worked at immediately before this job — an actual real FBS college football program's scouting/recruiting department, a specific high school football powerhouse, or a named scouting organization. Do not describe their skills in the abstract ("sharp evaluations", "trusted connections") — name the actual prior school or organization.`;
    const analystNoteContext = `This person is a Data Analyst. Their staff note must name the SPECIFIC real program or organization they worked at immediately before this job — an actual real FBS college football program's analytics department, a pro football front office, or a named sports-analytics firm. Do not describe their skills in the abstract ("an analytics presentation that got noticed") — name the actual prior school or organization.`;
    const noteContext = isScout ? scoutNoteContext : analystNoteContext;

    const connectionInstruction = `Then state the SPECIFIC, concrete event or place where the connection to ${coachRef} or ${programRef} was made — e.g. "on staff together at [a specific real FBS school] in [a specific year]", "at the [a specific named combine, bowl game, or recruiting camp]", "during a shared coaching stint at [a specific real school]". Pick either the ${coachRef} angle or the ${programRef} angle, but make it a real, named, concrete detail — never a vague phrase like "a mutual contact" or "impressed the staff."`;

    return `Generate a text biography for a college football staff member's dossier board. This person is ${roleContext}. Output ONLY the following lines with no introduction, no markdown, no bullet symbols, and no extra blank lines:\n\n${uniquenessClause}Suggested Name: (CRITICAL — look at the headshot image carefully before writing anything. First identify TWO things from the face: (1) apparent gender — male or female, and (2) visible ethnic/racial background from skin tone and features. Then invent an original, realistic first and last name that authentically matches BOTH the gender AND the background you identified. Hard rule: never give a clearly female face a male name, and never give a clearly male face a female name — check the photo's gender before finalizing the name. Do NOT pull from a small mental list of "go-to" names for a given ethnicity or gender — in real life there are thousands of realistic names within any one background, not a handful of obvious ones. Treat this like meeting a random real person of that background: the name should feel completely natural and unremarkable for someone of that exact gender and ethnicity who grew up in America, but should NOT be the first, most stereotypical, or most overused name that comes to mind for that demographic. Actively avoid repeating a name you've used before. The full realistic range — common names, less common names, regionally varied names, generational-cohort-varied names — is all fair game, as long as it would never look out of place on a real person of that background.)
Hometown: (THIS IS THE MOST IMPORTANT FIELD FOR VARIETY. You MUST draw this person's hometown from the following specific U.S. region for this generation: ${zone}. Pick a real, specific smaller city or town within that zone — NOT a major metro hub. Every generation should feel like it comes from a completely different part of the country. Lean toward towns that are not frequently chosen — the goal is geographic spread across the full breadth of America.)
Alma Mater: (Draw this person's college from the following specific conference tier for this generation: ${conf}. Pick a specific school from that group. CRITICAL: this must be a real, currently active FBS (Football Bowl Subdivision) program — one of the actual ~134-138 FBS schools. NEVER name an FCS, Division II, Division III, NAIA, or junior college school as the alma mater. Be specific — name the actual school, not just the conference. Favor less commonly chosen schools within the tier to maximize variety across generations.)
Staff Note: (${noteContext} ${connectionInstruction} Write one tight sentence that reads like a real resume bullet — concrete and factual, built entirely out of the specific prior school/organization name and the specific event/place named above, not vague flavor text. CRITICAL RULE: If you mention the head coach, NEVER use their full name — always write "${coachRef}" or just "Coach". HARD LIMIT: 160 characters maximum including spaces — count before writing. Rewrite shorter if over. Do not exceed this limit.)`;
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

  const flashBioPaste = (slot, status) => {
    setBioPasteState(s => ({ ...s, [slot]: status }));
    setTimeout(() => setBioPasteState(s => ({ ...s, [slot]: null })), 1500);
  };

  const pasteBioFromBtn = async (slot) => {
    if (!navigator.clipboard?.readText) {
      flashBioPaste(slot, 'unsupported');
      return;
    }
    try {
      const text = await navigator.clipboard.readText();
      if (!text?.trim()) { flashBioPaste(slot, 'empty'); return; }
      handleBioChange(text, slot);
      flashBioPaste(slot, 'ok');
    } catch {
      flashBioPaste(slot, 'denied');
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
      setScoutConfirmed(false);
      await deleteStaffData('scout_img');
      await deleteStaffData('scout_name');
      await deleteStaffData('scout_bio');
      await deleteStaffData('scout_contract_len');
      await deleteStaffData('scout_contract_start_year');
      await deleteStaffData('scout_contract_cur');
      await deleteStaffData('scout_confirmed');
    } else {
      setAnalystImg('');
      setAnalystName('Staff Slot #2');
      setAnalystBio('');
      setAnalystContractLength(0);
      setAnalystContractStartYear(0);
      setAnalystConfirmed(false);
      await deleteStaffData('analyst_img');
      await deleteStaffData('analyst_name');
      await deleteStaffData('analyst_bio');
      await deleteStaffData('analyst_contract_len');
      await deleteStaffData('analyst_contract_start_year');
      await deleteStaffData('analyst_contract_cur');
      await deleteStaffData('analyst_confirmed');
    }
  };

  const confirmHire = async (slot) => {
    if (slot === 1) {
      setScoutConfirmed(true);
      await saveStaffData('scout_confirmed', true);
    } else {
      setAnalystConfirmed(true);
      await saveStaffData('analyst_confirmed', true);
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

  // Revealed-devTrait HS recruit pool — nudges archetype grading once enough data exists.
  const revealedPool = useMemo(() => buildRevealedPool(recruits), [recruits]);
  const weightsMap = useMemo(() => buildWeightsMap(revealedPool, recruits), [revealedPool, recruits]);

  const analysisData = useMemo(() => {
    const scored = recruits.map(r => ({ ...r, score: computeScore(r, weightsMap) })).sort((a, b) => b.score - a.score);
    const total  = scored.length;
    const t1 = scored.filter(r => r.score >= 88).length;
    const t2 = scored.filter(r => r.score >= 82 && r.score < 88).length;
    const t4 = scored.filter(r => r.score <  76).length;
    return { scored, total, t1, t2, t4 };
  }, [recruits, weightsMap]);

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
    const ALL_POS = ['QB','HB','FB','WR','TE','OT','OG','C','DE','DT','OLB','MIKE','CB','FS','SS','K','P'];
    let outlookRows = null;

    if (outlookSummary) {
      // Full detail from Program Outlook — use its verdicts and labels
      const actionRows = [];
      const coveredList = [];
      ALL_POS.forEach(pos => {
        const s = outlookSummary[pos];
        if (!s) return;
        const vk = s.verdictKey;
        if (!vk || vk === 'no-investment') {
          coveredList.push(pos);
          return;
        }
        // 'extra' positions have a voluntary recruiting plan but no roster need —
        // add them to actionRows with flag 'extra' so their row gets emerald styling.
        if (vk === 'extra') {
          actionRows.push({ pos, label: s.label || 'extra', flag: 'extra' });
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

        {/* Left column — portrait cards, with action shortcuts filling the space below
            them whenever they're shorter than the Daily Brief panel beside them */}
        <div className="flex flex-col gap-4 shrink-0 md:w-[42%]">
        <div className="flex gap-2 sm:gap-3">
        {[
          {
            slot: 1,
            img: scoutImg, setImg: setScoutImg,
            name: scoutName, setName: setScoutName,
            bio: scoutBio,
            isExpired: isScoutExpired,
            yearsRemaining: scoutYearsRemaining,
            contractLength: scoutContractLength,
            confirmed: scoutConfirmed,
            role: 'National Scout',
            roleColor: '#94a3b8',
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
            confirmed: analystConfirmed,
            role: 'Data Analyst',
            roleColor: '#94a3b8',
            showUrl: showAnalystUrlInput, setShowUrl: setShowAnalystUrlInput,
            urlText: analystUrlText, setUrlText: setAnalystUrlText,
            accentColor: s !== '#ffffff' ? s : p,
          },
        ].map(({ slot, img, name, bio, isExpired, yearsRemaining, contractLength, confirmed, role, roleColor, showUrl, setShowUrl, urlText, setUrlText, accentColor }) => {
          const PLACEHOLDER = slot === 1 ? 'Staff Slot #1' : 'Staff Slot #2';
          const isHired = !!confirmed;
          const readyToConfirm = !!img && !!name?.trim() && name.trim() !== PLACEHOLDER && !!bio?.trim();
          const isEmptySlot = !isHired && !hiringMode[slot];
          const isHiring   = !isHired && !!hiringMode[slot];
          const fireStaff  = () => { clearSlot(slot); setHiringMode(prev => ({ ...prev, [slot]: false })); };
          // Overlay matches the role badge treatment — dark glass with the role color
          // glowing through the border/text, instead of a flat color fill.
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
              {img && !isExpired && <div className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(to bottom, transparent 70%, rgba(0,0,0,0.3) 100%)' }} />}
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
                <div className="w-6 h-0.5 mb-1.5 rounded-full bg-slate-600" />
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
                    className="w-full rounded-lg text-[10px] text-txt-secondary leading-snug resize-none focus:outline-none p-2 bg-surface-3 border-2"
                    style={{ caretColor: 'white', scrollbarWidth: 'none', borderColor: accentColor }}
                  />
                ) : bio ? (
                  <p
                    onClick={() => setBioEditSlot(slot)}
                    className="cursor-text text-[10px] text-txt-secondary leading-snug whitespace-pre-line"
                  >
                    {bio}
                  </p>
                ) : (
                  <div
                    onClick={() => setBioEditSlot(slot)}
                    className="cursor-text rounded-lg p-2 min-h-[44px]"
                    style={{ background: 'rgba(0,0,0,0.35)', border: '1.5px dashed #475569' }}
                  >
                    <p className="text-[10px] font-bold text-slate-400">+ Click to add bio…</p>
                  </div>
                )}
                {!bio && (
                  <div className="flex flex-wrap gap-1.5">
                    <button onClick={() => handleCopy(generateBioPrompt(slot === 1 ? 'scout' : 'analyst', slot === 1 ? analystName : scoutName), `${slot}-bio`)} className="px-2 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider" style={{ background: 'rgba(0,0,0,0.5)', color: '#64748b', backdropFilter: 'blur(4px)' }}>
                      {copiedKey === `${slot}-bio` ? 'Copied' : 'BIO Prompt'}
                    </button>
                    <button onClick={() => pasteBioFromBtn(slot)} className="px-2 py-1 rounded text-[9px] font-display font-bold uppercase tracking-wider" style={{
                      background: 'rgba(0,0,0,0.6)',
                      color: bioPasteState[slot] === 'ok' ? '#34d399' : bioPasteState[slot] ? '#f87171' : '#94a3b8',
                      border: bioPasteState[slot] === 'ok' ? '1px solid rgba(52,211,153,0.4)' : bioPasteState[slot] ? '1px solid rgba(248,113,113,0.4)' : '1px solid rgba(100,116,139,0.3)',
                      backdropFilter: 'blur(4px)',
                    }}>
                      {bioPasteState[slot] === 'ok' ? 'Bio Pasted' : bioPasteState[slot] === 'empty' ? 'Clipboard Empty' : bioPasteState[slot] === 'denied' ? 'Blocked' : bioPasteState[slot] === 'unsupported' ? 'Unsupported' : 'Paste Bio'}
                    </button>
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
                    className="w-full rounded-lg text-[10px] text-txt-secondary leading-snug resize-none focus:outline-none p-2 bg-surface-3 border-2"
                    style={{ caretColor: 'white', scrollbarWidth: 'none', borderColor: accentColor }}
                  />
                ) : bio ? (
                  <p
                    onClick={() => setBioEditSlot(slot)}
                    className="cursor-text text-[10px] text-txt-secondary leading-snug whitespace-pre-line"
                  >
                    {bio}
                  </p>
                ) : (
                  <div
                    onClick={() => setBioEditSlot(slot)}
                    className="cursor-text rounded-lg p-2 min-h-[44px]"
                    style={{ background: 'rgba(0,0,0,0.35)', border: '1.5px dashed #475569' }}
                  >
                    <p className="text-[10px] font-bold text-slate-400">+ Click to add bio…</p>
                  </div>
                )}
                <div className="flex flex-wrap gap-1.5">
                  <button onClick={() => handleCopy(generateImgPrompt(slot === 1 ? 'scout' : 'analyst'), `${slot}-img`)} className="px-2 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider" style={{ background: 'rgba(0,0,0,0.5)', color: roleColor, backdropFilter: 'blur(4px)' }}>
                    {copiedKey === `${slot}-img` ? 'Copied' : 'IMG Prompt'}
                  </button>
                  <button onClick={() => handleCopy(generateBioPrompt(slot === 1 ? 'scout' : 'analyst', slot === 1 ? analystName : scoutName), `${slot}-bio`)} className="px-2 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider" style={{ background: 'rgba(0,0,0,0.5)', color: '#64748b', backdropFilter: 'blur(4px)' }}>
                    {copiedKey === `${slot}-bio` ? 'Copied' : 'BIO Prompt'}
                  </button>
                  <label className="cursor-pointer px-2 py-1 rounded text-[9px] font-display font-bold uppercase tracking-wider" style={{ background: 'rgba(0,0,0,0.6)', color: roleColor, border: `1px solid ${roleColor}44`, backdropFilter: 'blur(4px)' }}>
                    Upload Img
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => handleImageUpload(e, slot)} />
                  </label>
                  <button onClick={() => pasteFromBtn(slot)} className="px-2 py-1 rounded text-[9px] font-display font-bold uppercase tracking-wider" style={{
                    background: 'rgba(0,0,0,0.6)',
                    color: pasteState[slot] === 'ok' ? '#34d399' : pasteState[slot] ? '#f87171' : '#94a3b8',
                    border: pasteState[slot] === 'ok' ? '1px solid rgba(52,211,153,0.4)' : pasteState[slot] ? '1px solid rgba(248,113,113,0.4)' : '1px solid rgba(100,116,139,0.3)',
                    backdropFilter: 'blur(4px)',
                  }}>
                    {pasteState[slot] === 'ok' ? 'Pasted' : pasteState[slot] === 'noimg' ? 'No Image' : pasteState[slot] === 'denied' ? 'Blocked' : pasteState[slot] === 'unsupported' ? 'Unsupported' : 'Paste Img'}
                  </button>
                  <button onClick={() => setShowUrl(!showUrl)} className="px-2 py-1 rounded text-[9px] font-display font-bold uppercase tracking-wider" style={{ background: 'rgba(0,0,0,0.6)', color: '#94a3b8', border: '1px solid rgba(100,116,139,0.3)', backdropFilter: 'blur(4px)' }}>
                    Img URL
                  </button>
                  <button onClick={() => pasteBioFromBtn(slot)} className="px-2 py-1 rounded text-[9px] font-display font-bold uppercase tracking-wider" style={{
                    background: 'rgba(0,0,0,0.6)',
                    color: bioPasteState[slot] === 'ok' ? '#34d399' : bioPasteState[slot] ? '#f87171' : '#94a3b8',
                    border: bioPasteState[slot] === 'ok' ? '1px solid rgba(52,211,153,0.4)' : bioPasteState[slot] ? '1px solid rgba(248,113,113,0.4)' : '1px solid rgba(100,116,139,0.3)',
                    backdropFilter: 'blur(4px)',
                  }}>
                    {bioPasteState[slot] === 'ok' ? 'Bio Pasted' : bioPasteState[slot] === 'empty' ? 'Clipboard Empty' : bioPasteState[slot] === 'denied' ? 'Blocked' : bioPasteState[slot] === 'unsupported' ? 'Unsupported' : 'Paste Bio'}
                  </button>
                  {(!!img || (!!name?.trim() && name.trim() !== PLACEHOLDER) || !!bio?.trim()) && (
                    <button onClick={() => clearSlot(slot)} className="px-2 py-1 rounded text-[9px] font-display font-bold uppercase tracking-wider" style={{ background: 'rgba(0,0,0,0.6)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)', backdropFilter: 'blur(4px)' }}>
                      Clear
                    </button>
                  )}
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
                <button
                  onClick={() => readyToConfirm && confirmHire(slot)}
                  disabled={!readyToConfirm}
                  className={`w-full py-1.5 rounded font-display font-black text-[10px] uppercase tracking-wider mt-auto transition-all ${readyToConfirm ? '' : 'cursor-not-allowed'}`}
                  style={readyToConfirm
                    ? { background: roleColor, color: '#04131a' }
                    : { background: 'rgba(100,116,139,0.2)', color: '#64748b', border: '1px solid rgba(100,116,139,0.25)' }
                  }
                >
                  {readyToConfirm ? `Save & Confirm Hire` : `Add Photo, Name & Bio to Confirm`}
                </button>
              </>)}
            </div>

            {/* ── EMPTY OVERLAY — dark glass + role-colored glow, matching the title badge look ── */}
            {isEmptySlot && (
              <div
                className="absolute inset-0 flex items-center justify-center z-20"
                style={{ background: 'rgba(3,7,13,0.86)', backdropFilter: 'blur(1px)' }}
              >
                <div
                  className="absolute rounded-full pointer-events-none"
                  style={{
                    width: 160, height: 160,
                    background: `radial-gradient(circle, ${roleColor}3d 0%, ${roleColor}00 70%)`,
                  }}
                />
                <button
                  onClick={() => setHiringMode(prev => ({ ...prev, [slot]: true }))}
                  className="relative px-8 py-3 rounded-xl font-display font-black text-[13px] uppercase tracking-widest transition-all"
                  style={{
                    background: 'rgba(0,0,0,0.5)',
                    color: roleColor,
                    border: `1.5px solid ${roleColor}`,
                    boxShadow: `0 0 10px 2px ${roleColor}99, 0 0 22px 4px ${roleColor}4d, inset 0 0 8px ${roleColor}33`,
                    backdropFilter: 'blur(6px)',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0,0,0,0.65)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'rgba(0,0,0,0.5)'; }}
                >
                  Hire {slot === 1 ? 'Scout' : 'Analyst'}
                </button>
              </div>
            )}
          </div>
        );})}

        </div>{/* end portrait grid */}

        {/* Action shortcuts — sits under the portrait cards and grows to fill the rest of
            the column, so the bottom of the last row locks to the Daily Brief's bottom */}
        <div className="grid grid-cols-2 gap-3 flex-1 auto-rows-fr">
          {[
            { view: 'database',   label: 'Recruiting Database', sub: 'True Freshmen Only',      color: 'text-txt-tertiary',    icon: (
              <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4" stroke="currentColor" strokeWidth="1.5">
                <ellipse cx="8" cy="4" rx="5" ry="2"/>
                <path d="M3 4v4c0 1.1 2.24 2 5 2s5-.9 5-2V4"/>
                <path d="M3 8v4c0 1.1 2.24 2 5 2s5-.9 5-2V8"/>
              </svg>
            )},
            { view: 'analysis',   label: 'Program Outlook',    sub: 'Staff Recommendations',    color: 'text-txt-tertiary', icon: (
              <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4" stroke="currentColor" strokeWidth="1.5">
                <rect x="3" y="2" width="10" height="12" rx="1.5"/>
                <path d="M5.5 5h5M5.5 7.5h5M5.5 10h3"/>
              </svg>
            )},
            { view: 'thresholds', label: 'Threshold Lookup',   sub: 'Player Comparison Tool',   color: 'text-txt-tertiary',   icon: (
              <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4" stroke="currentColor" strokeWidth="1.5">
                <path d="M2 12l4-4 3 3 5-7"/>
                <circle cx="14" cy="5" r="1.5" fill="currentColor" stroke="none"/>
              </svg>
            )},
            { view: 'counts',     label: 'Player Count',       sub: 'Current Overview',         color: 'text-txt-tertiary', icon: (
              <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4" stroke="currentColor" strokeWidth="1.5">
                <circle cx="6" cy="5" r="2"/>
                <circle cx="11" cy="5" r="2"/>
                <path d="M2 13c0-2.2 1.8-4 4-4h4c2.2 0 4 1.8 4 4"/>
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

        </div>{/* end left column */}

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
              <p className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-500 mb-3">Position Status</p>
              {outlookSummary ? (() => {
                // Read directly from outlookSummary verdictKey — same source as Program Outlook
                const ALL_TRACKED = ['QB','HB','WR','TE','OT','OG','C','DE','DT','OLB','MIKE','CB','FS','SS','FB','K','P'];
                const crits  = ALL_TRACKED.filter(pos => outlookSummary[pos]?.verdictKey === 'critical').map(pos => ({ pos }));
                const depths = ALL_TRACKED.filter(pos => outlookSummary[pos]?.verdictKey === 'depth-needed').map(pos => ({ pos }));
                const allClear = crits.length === 0 && depths.length === 0;
                return (
                  <div className="space-y-3">
                    {/* At-a-glance counts */}
                    <div className="flex items-end gap-5">
                      {crits.length > 0 && (
                        <div>
                          <p className="text-[26px] font-black leading-none text-txt-primary">{crits.length}</p>
                          <p className="text-[9px] font-bold uppercase tracking-widest text-red-400 mt-0.5">Critical</p>
                        </div>
                      )}
                      {depths.length > 0 && (
                        <div>
                          <p className="text-[26px] font-black leading-none text-txt-primary">{depths.length}</p>
                          <p className="text-[9px] font-bold uppercase tracking-widest text-amber-400 mt-0.5">Depth</p>
                        </div>
                      )}
                    </div>

                    {/* Summary sentences */}
                    {allClear ? (
                      <p className="text-[13px] text-slate-400 leading-snug">All positions are in good shape. Nothing urgent on the roster right now.</p>
                    ) : (
                      <div className="space-y-2">
                        {crits.length > 0 && (
                          <p className="text-[13px] leading-snug text-slate-300">
                            <span className="text-red-400 font-semibold">{crits.map(r => r.pos).join(', ')}</span>
                            {crits.length === 1 ? ' has a gap' : ' have gaps'} that need to be addressed before next season.
                          </p>
                        )}
                        {depths.length > 0 && (
                          <p className="text-[13px] leading-snug text-slate-400">
                            <span className="text-amber-400/80 font-semibold">{depths.map(r => r.pos).join(', ')}</span>
                            {depths.length === 1 ? ' is running light' : ' are running light'} on depth in the next couple years.
                          </p>
                        )}
                      </div>
                    )}

                    <button
                      onClick={() => setView('analysis')}
                      className="text-[11px] text-slate-500 hover:text-slate-300 transition-colors font-medium tracking-wide"
                    >
                      Program Outlook →
                    </button>
                  </div>
                );
              })() : (
                <button onClick={() => setView('analysis')} className="w-full rounded-lg px-3 py-3 border border-dashed border-slate-700 text-[11px] text-slate-500 hover:border-slate-500 hover:text-slate-400 transition-colors text-center">
                  Open Program Outlook to generate position data
                </button>
              )}
            </div>

            {/* ── RECRUITING PLAN ── */}
            {outlookSummary && (() => {
              const POSITIONS = ['QB','HB','FB','WR','TE','OT','OG','C','DE','DT','OLB','MIKE','CB','FS','SS','K','P'];
              // Build a flag lookup from Position Status data
              const flagMap = {};
              if (briefData?.outlookRows?.actionRows) {
                briefData.outlookRows.actionRows.forEach(r => { flagMap[r.pos] = r.flag; });
              }
              const rows = POSITIONS
                .map(pos => {
                  const o = outlookSummary[pos] || {};
                  let hs = o.hsMin ?? 0;
                  let portal = o.portalMin ?? 0;
                  const targetName = o.topTargetName || null;
                  const targetIsPortal = !!o.topTargetIsPortal;
                  // A named board target counts toward its bucket's total even if the
                  // roster math alone didn't call for an investment here.
                  if (targetName) {
                    if (targetIsPortal) portal = Math.max(portal, 1);
                    else hs = Math.max(hs, 1);
                  }
                  return { pos, hs, portal, targetName, targetIsPortal, flag: flagMap[pos] ?? null };
                })
                .filter(r => r.hs > 0 || r.portal > 0);
              if (!rows.length) return null;
              const totalHs     = rows.reduce((s, r) => s + r.hs, 0);
              const totalPortal = rows.reduce((s, r) => s + r.portal, 0);
              return (
                <div className="px-4 pt-4 pb-4 border-b border-surface-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-500 mb-3">Recruiting Plan</p>

                  {/* At-a-glance totals */}
                  <div className="flex items-end gap-4 mb-3">
                    {totalHs > 0 && (
                      <div>
                        <p className="text-[20px] font-black leading-none text-txt-primary">{totalHs}</p>
                        <p className="text-[8px] font-bold uppercase tracking-widest text-txt-tertiary mt-0.5">HS Targets</p>
                      </div>
                    )}
                    {totalPortal > 0 && (
                      <div>
                        <p className="text-[20px] font-black leading-none text-txt-primary">{totalPortal}</p>
                        <p className="text-[8px] font-bold uppercase tracking-widest text-txt-tertiary mt-0.5">Portal</p>
                      </div>
                    )}
                    <div>
                      <p className="text-[20px] font-black leading-none text-slate-400">{totalHs + totalPortal}</p>
                      <p className="text-[8px] font-bold uppercase tracking-widest text-slate-500 mt-0.5">Total</p>
                    </div>
                    {rosterSummary?.returning != null && (
                      <div className="ml-auto text-right">
                        <p className="text-[20px] font-black leading-none text-slate-400">
                          {rosterSummary.returning + (committedRecruits?.length ?? 0)}<span className="text-[13px] text-slate-600">/85</span>
                        </p>
                        <p className="text-[8px] font-bold uppercase tracking-widest text-slate-500 mt-0.5">Proj. Roster</p>
                      </div>
                    )}
                  </div>

                  {(() => {
                    const OFF_POS = new Set(['QB','HB','FB','WR','TE','OT','OG','C']);
                    const DEF_POS = new Set(['DE','DT','OLB','MIKE','CB','FS','SS']);
                    const offRows = rows.filter(r => OFF_POS.has(r.pos));
                    const defRows = rows.filter(r => DEF_POS.has(r.pos));
                    const stRows  = rows.filter(r => !OFF_POS.has(r.pos) && !DEF_POS.has(r.pos));
                    const col = (label, colRows) => colRows.length ? (
                      <div className="flex-1 min-w-0">
                        <p className="text-[8px] font-black uppercase tracking-[0.12em] text-slate-600 mb-1.5">{label}</p>
                        <div className="space-y-1">
                          {colRows.map((r, i) => <RecruitingPlanRow key={i} {...r} />)}
                        </div>
                      </div>
                    ) : null;
                    return (
                      <div className="space-y-2">
                        <div className="flex gap-3">
                          {col('Offense', offRows)}
                          {col('Defense', defRows)}
                        </div>
                        {stRows.length > 0 && (
                          <div>
                            <p className="text-[8px] font-black uppercase tracking-[0.12em] text-slate-600 mb-1.5">Special Teams</p>
                            <div className="space-y-1">
                              {stRows.map((r, i) => <RecruitingPlanRow key={i} {...r} />)}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              );
            })()}

            {/* ── RECENTLY FILED ── */}
            {databaseRecruits.length > 0 && (() => {
              // Sort by recentRank descending — highest rank = most recently added to the database
              const recent = [...databaseRecruits].sort((a, b) => (b.recentRank ?? 0) - (a.recentRank ?? 0)).slice(0, 3);
              return (
                <div className="px-4 pt-3 pb-4 border-b border-surface-4">
                  <p className="text-[8px] font-black uppercase tracking-[0.15em] text-slate-500 mb-2.5">Recently Filed</p>
                  <div className="space-y-1.5">
                    {recent.map((r, i) => {
                      const showDev = r.devTrait && r.devTrait !== 'Hidden';
                      const score = Math.round(computeScore(r, weightsMap));
                      // Same grade tiers + glows as Recruiting Database
                      const gradeTiers = [
                        { grade: 'A+', min: 95, cls: 'bg-surface-3 border border-[#0E7A2A] text-[#3DD65A]' },
                        { grade: 'A',  min: 90, cls: 'bg-surface-3 border border-[#0E7A2A] text-[#2FC44E]' },
                        { grade: 'A-', min: 86, cls: 'bg-surface-3 border border-[#0A6020] text-[#22A83E]' },
                        { grade: 'B+', min: 82, cls: 'bg-surface-3 border border-[#8B7A40] text-[#F5E8A0]' },
                        { grade: 'B',  min: 78, cls: 'bg-surface-3 border border-[#8B7A40] text-[#DDD090]' },
                        { grade: 'B-', min: 74, cls: 'bg-surface-3 border border-[#6E6030] text-[#C4B475]' },
                        { grade: 'C+', min: 70, cls: 'bg-surface-3 border border-[#6B7275] text-[#D8E0E2]' },
                        { grade: 'C',  min: 66, cls: 'bg-surface-3 border border-[#6B7275] text-[#BEC8CA]' },
                        { grade: 'C-', min: 62, cls: 'bg-surface-3 border border-[#505558] text-[#A0A8AA]' },
                        { grade: 'D+', min: 58, cls: 'bg-surface-3 border border-[#7F6533] text-[#DDB870]' },
                        { grade: 'D',  min: 54, cls: 'bg-surface-3 border border-[#7F6533] text-[#C9A85C]' },
                        { grade: 'D-', min: 50, cls: 'bg-surface-3 border border-[#664E25] text-[#A88040]' },
                        { grade: 'F',  min: 0,  cls: 'bg-surface-3 border border-[#7F6533] text-[#C9A85C]' },
                      ];
                      const tier = gradeTiers.find(t => score >= t.min) ?? gradeTiers[gradeTiers.length - 1];
                      return (
                        <div
                          key={i}
                          onClick={() => onViewDatabase && onViewDatabase(r.pid)}
                          className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 bg-surface-3 border border-surface-4 transition-colors ${onViewDatabase ? 'cursor-pointer hover:bg-surface-4' : ''}`}
                        >
                          <span className="text-[8px] font-display font-black tracking-wide px-1.5 py-0.5 rounded shrink-0 bg-surface-4 border border-surface-5 text-txt-tertiary">{r.position}</span>
                          <span className="text-[11px] font-bold text-txt-primary truncate flex-1">{r.name}</span>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-[9px] font-black tabular-nums text-slate-400">{score}</span>
                            <span className={`text-[10px] font-black px-1.5 py-0.5 rounded border ${tier.cls}`}>{tier.grade}</span>
                            {showDev && (
                              <span className={`text-[7px] font-black uppercase tracking-wide px-1 py-0.5 rounded border ${
                                r.devTrait === 'Elite'  ? 'bg-surface-3 border-[#0E7A2A] text-[#2FC44E] shadow-[0_0_16px_rgba(14,122,42,0.85)]'
                                : r.devTrait === 'Star'   ? 'bg-surface-3 border-[#8B7A40] text-[#DDD090] shadow-[0_0_14px_rgba(139,122,64,0.8)]'
                                : r.devTrait === 'Impact' ? 'bg-surface-3 border-[#6B7275] text-[#BEC8CA]'
                                : 'bg-surface-3 border-[#7F6533] text-[#C9A85C]'
                              }`}>{r.devTrait}</span>
                            )}
                            {r.stars > 0 && <span className="text-[10px] font-bold text-amber-400 drop-shadow-[0_0_10px_rgba(251,191,36,0.9)]">{r.stars}★</span>}
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
    </div>
  );
}