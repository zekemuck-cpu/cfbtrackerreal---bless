import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SOURCE_ROOT = process.env.RECRUIT_SOURCE_ROOT || ROOT;
const DATA_ROOT = process.env.RECRUIT_DATA_ROOT || ROOT;
const PARSE_DIR = path.join(DATA_ROOT, 'scratch', 'dynasty_parse');
function firstExistingRoot(candidates, requiredSubpaths = [], fallback = '') {
  return candidates.find((candidate) => (
    candidate &&
    requiredSubpaths.every((subPath) => fs.existsSync(path.join(candidate, subPath)))
  )) || candidates.find((candidate) => candidate && fs.existsSync(candidate)) || fallback || candidates[0];
}

const APP_DIR = process.env.RECRUIT_RUNTIME_ROOT || path.join(SOURCE_ROOT, 'runtime');
function firstExistingAssetRoot(candidates, fallback) {
  return candidates.find((candidate) => (
    candidate &&
    fs.existsSync(path.join(candidate, 'team-logos')) &&
    fs.existsSync(path.join(candidate, 'Player_Portraits'))
  )) || fallback || candidates[0];
}

const ASSET_DIR = process.env.RECRUIT_ASSETS_ROOT || path.join(SOURCE_ROOT, 'assets');
const SCHEMA_DIR = path.join(APP_DIR, 'data', 'cfb27_dynasty');
const SOURCE_FILE = process.env.RECRUIT_SOURCE_FILE || 'DYNASTY-DYNASTY';
const PHYSICAL_ABILITY_SLOT_MAP_PATH = path.join(DATA_ROOT, 'physical-ability-slot-map.json');
const INCLUDE_M26_PORTRAITS = process.env.RECRUIT_INCLUDE_M26 !== '0';
const GENERIC_PORTRAIT_FOLDERS = ['LightGeneric', 'MediumGeneric', 'DarkGeneric'];

const files = {
  recruit: path.join(PARSE_DIR, 'FRANCHISE_Recruit_1873209313.json'),
  player: path.join(PARSE_DIR, 'FRANCHISE_PLAY.json'),
  userRecruitTarget: path.join(PARSE_DIR, 'FRANCHISE_UserRecruitTarget_3987156317.json'),
  prospectTargetSchoolArray: path.join(PARSE_DIR, 'FRANCHISE_ProspectTargetSchool__2332540366.json'),
  prospectTargetSchool: path.join(PARSE_DIR, 'FRANCHISE_ProspectTargetSchool_3789266353.json'),
  team: path.join(PARSE_DIR, 'FRANCHISE_TEAM.json')
};

const outputFiles = {
  json: path.join(DATA_ROOT, 'recruiting-data.json'),
  csv: path.join(DATA_ROOT, 'recruiting-data.csv'),
  html: path.join(DATA_ROOT, 'recruiting-table.html')
};

const enumFiles = {
  PositionE: path.join(SCHEMA_DIR, 'football-schemas', 'positione.FTX'),
  DraftPositionE: path.join(SCHEMA_DIR, 'football-schemas', 'draftpositione.FTX'),
  ProspectQuality: path.join(SCHEMA_DIR, 'franchise-schemas', 'prospectquality.FTX'),
  RecruitingClass: path.join(SCHEMA_DIR, 'franchise-schemas', 'recruitingclass.FTX'),
  GemBust: path.join(SCHEMA_DIR, 'franchise-schemas', 'gembust.FTX'),
  RecruitStage: path.join(SCHEMA_DIR, 'franchise-schemas', 'recruitstage.FTX'),
  RecruitStageAdvance: path.join(SCHEMA_DIR, 'franchise-schemas', 'recruitstageadvance.FTX'),
  ScholarshipStatus: path.join(SCHEMA_DIR, 'franchise-schemas', 'scholarshipstatus.FTX'),
  StateName: path.join(SCHEMA_DIR, 'football-schemas', 'statename.FTX'),
  Pipeline: path.join(SCHEMA_DIR, 'franchise-schemas', 'pipeline.FTX'),
  CharacterBodyType: path.join(SCHEMA_DIR, 'football-schemas', 'characterbodytype.FTX'),
  TraitDevelopment: path.join(SCHEMA_DIR, 'football-schemas', 'traitdevelopment.FTX'),
  RecruitingMotivationType: path.join(SCHEMA_DIR, 'franchise-schemas', 'recruitingmotivationtype.FTX'),
  RecruitingPitchType: path.join(SCHEMA_DIR, 'franchise-schemas', 'recruitingpitchtype.FTX'),
  PlayerType: path.join(SCHEMA_DIR, 'football-schemas', 'playertype.FTX'),
  AbilitiesRank: path.join(SCHEMA_DIR, 'football-schemas', 'abilitiesrank.FTX'),
  MentalAbilities: path.join(SCHEMA_DIR, 'franchise-schemas', 'mentalabilities.FTX')
};

const TEAM_ORIG_ID_PATH = path.join(SCHEMA_DIR, 'franchise-schemas', 'teamorigids_onlyforjourneyuse.FTX');
const TEAM_LABEL_OVERRIDES = new Map([
  ['AppState', 'Appalachian State'],
  ['AppalachianState', 'Appalachian State'],
  ['ArizonaSt', 'Arizona State'],
  ['ArkansasSt', 'Arkansas State'],
  ['BallSt', 'Ball State'],
  ['BoiseSt', 'Boise State'],
  ['CAL', 'California'],
  ['Cal', 'California'],
  ['ColoradoSt', 'Colorado State'],
  ['Connecticut', 'UConn'],
  ['CostalCarolina', 'Coastal Carolina'],
  ['ECU', 'East Carolina'],
  ['FIU', 'FIU'],
  ['FloridaSt', 'Florida State'],
  ['FresnoSt', 'Fresno State'],
  ['GeorgiaSt', 'Georgia State'],
  ['IowaSt', 'Iowa State'],
  ['JacksonvilleSt', 'Jacksonville State'],
  ['JamesMadison', 'James Madison'],
  ['KansasSt', 'Kansas State'],
  ['KansasState', 'Kansas State'],
  ['KennesawState', 'Kennesaw State'],
  ['KennesawSt', 'Kennesaw State'],
  ['KentSt', 'Kent State'],
  ['KentState', 'Kent State'],
  ['LouisianaSt', 'Louisiana Tech'],
  ['LouisianaRaginCajuns', 'Louisiana'],
  ['Marshal', 'Marshall'],
  ['Meryland', 'Maryland'],
  ['MiamiU', 'Miami University'],
  ['MiamiUniversity', 'Miami University'],
  ['MichigamSt', 'Michigan State'],
  ['MidTenSt', 'Middle Tennessee'],
  ['MidTennState', 'Middle Tennessee'],
  ['MississippiSt', 'Mississippi State'],
  ['MississippiState', 'Mississippi State'],
  ['MissouriState', 'Missouri State'],
  ['NCSt', 'NC State'],
  ['NCState', 'NC State'],
  ['NewMexico', 'New Mexico'],
  ['NewMexicoSt', 'New Mexico State'],
  ['NewMexicoState', 'New Mexico State'],
  ['NorthCarolina', 'North Carolina'],
  ['NorthDakotaState', 'North Dakota State'],
  ['NorthTexas', 'North Texas'],
  ['NorthernIllinois', 'Northern Illinois'],
  ['NotreDame', 'Notre Dame'],
  ['OhioSt', 'Ohio State'],
  ['OklahomaSt', 'Oklahoma State'],
  ['OldDominion', 'Old Dominion'],
  ['OleMiss', 'Ole Miss'],
  ['OregonSt', 'Oregon State'],
  ['PennSt', 'Penn State'],
  ['SamHouston', 'Sam Houston'],
  ['SanDiagoSt', 'San Diego State'],
  ['SanDiegoState', 'San Diego State'],
  ['SanJoseState', 'San Jose State'],
  ['SanJoseSt', 'San Jose State'],
  ['SouthAlabama', 'South Alabama'],
  ['SouthCarolina', 'South Carolina'],
  ['SouthernMiss', 'Southern Miss'],
  ['TexasAM', 'Texas A&M'],
  ['TexasSt', 'Texas State'],
  ['TexasState', 'Texas State'],
  ['TexasTech', 'Texas Tech'],
  ['UtahSt', 'Utah State'],
  ['UTEP', 'UTEP'],
  ['UTSA', 'UTSA'],
  ['VirginiaTech', 'Virginia Tech'],
  ['WakeForest', 'Wake Forest'],
  ['WashingtonSt', 'Washington State'],
  ['WestVirginia', 'West Virginia'],
  ['WesternKentucky', 'Western Kentucky'],
  ['WesternMichigan', 'Western Michigan'],
  ['WshingtonState', 'Washington State']
]);
const TEAM_LOGO_KEY_OVERRIDES = new Map([
  ['fiu', 'floridainternational'],
  ['middletennessee', 'middletennessee'],
  ['southernmiss', 'southernmississippi']
]);

const TEAM_ORIG_ID_MIN = 1100;
const TEAM_STADIUM_ID_OFFSET = 600;
const TEAM_INDEX_ANCHORS_BY_ORIG_ID = new Map([
  [1102, 2],
  [1182, 71],
  [1202, 90]
]);
const TEAM_INDEX_FIELD_CANDIDATES = [
  'TeamIndex',
  'TEAM_INDEX',
  'TeamIndex_',
  'Field_387',
  'Field_62'
];
const TEAM_ORIG_ID_FIELD_CANDIDATES = [
  'TEAM_ORIGID',
  'TeamOrigId',
  'TeamOriginalId',
  'Field_348'
];
const TEAM_DISPLAY_FIELD_CANDIDATES = [
  'DisplayName',
  'LongName',
  'ShortName',
  'NickName',
  'TEAM_AFL_DISPLAYNAME',
  'TEAM_LOGO_ASSETNAME',
  'AssetName'
];
const PHYSICAL_ABILITY_FIELDS = [
  'PhysicalAbility1',
  'PhysicalAbility2',
  'PhysicalAbility3',
  'PhysicalAbility4',
  'PhysicalAbility5'
];
const MENTAL_ABILITY_FIELDS = [
  'MentalAbility1',
  'MentalAbility2',
  'MentalAbility3'
];
const MENTAL_ABILITY_RANK_FIELDS = [
  'MentalAbilityRank1',
  'MentalAbilityRank2',
  'MentalAbilityRank3'
];
const CFB27_EXTRA_RECRUITING_TEAMS = [
  { teamId: 134, team: 'Delaware' },
  { teamId: 135, team: 'Missouri State' },
  { teamId: 136, team: 'Sacramento State' },
  { teamId: 137, team: 'North Dakota State' }
];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function decodeReference(value) {
  const bits = String(value || '').trim();
  if (bits.length !== 32 || /[^01]/.test(bits)) return null;
  const tableId = parseInt(bits.slice(0, 15), 2);
  const row = parseInt(bits.slice(15), 2);
  return tableId ? { tableId, row } : null;
}

function enumNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return value;
  const text = String(value);
  if (/^[01]+$/.test(text)) return parseInt(text, 2);
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function cleanLabel(label) {
  return String(label || '')
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\bJUCO\b/i, 'Junior College')
    .replace(/\s+/g, ' ')
    .trim();
}

function isEnumSentinel(name) {
  return (
    /^(First|Last|Count|Max)_?/i.test(name) ||
    /_(First|Last|Count|Max)_?$/i.test(name) ||
    name === 'Invalid' ||
    name === 'Invalid_'
  );
}

function parseEnum(filePath) {
  const source = fs.readFileSync(filePath, 'utf8');
  const out = new Map();
  const seen = new Set();
  const attrRe = /<attribute\s+name="([^"]+)"[^>]*\svalue="(-?\d+)"/gi;
  for (const match of source.matchAll(attrRe)) {
    const name = match[1];
    const value = Number(match[2]);
    if (isEnumSentinel(name)) {
      continue;
    }
    if (!seen.has(value)) {
      out.set(value, cleanLabel(name));
      seen.add(value);
    }
  }
  return out;
}

function parseEnumTokens(filePath) {
  const source = fs.readFileSync(filePath, 'utf8');
  const out = new Map();
  const seen = new Set();
  const attrRe = /<attribute\s+name="([^"]+)"[^>]*\svalue="(-?\d+)"/gi;
  for (const match of source.matchAll(attrRe)) {
    const name = match[1];
    const value = Number(match[2]);
    if (isEnumSentinel(name)) {
      continue;
    }
    if (!seen.has(value)) {
      out.set(value, name);
      seen.add(value);
    }
  }
  return out;
}

const enumMaps = Object.fromEntries(
  Object.entries(enumFiles).map(([name, filePath]) => [name, parseEnum(filePath)])
);
const enumTokenMaps = Object.fromEntries(
  Object.entries(enumFiles).map(([name, filePath]) => [name, parseEnumTokens(filePath)])
);
const physicalAbilitySlotMap = readJson(PHYSICAL_ABILITY_SLOT_MAP_PATH);
const RECRUITING_PITCH_LABEL_OVERRIDES = new Map([
  ['ItsGameTime', "It's Game Time"],
  ['TVTime', 'TV Time'],
  ['CoachsFavorite', "Coach's Favorite"],
  ['WorkHorse', 'Workhorse']
]);

function enumLabel(type, value, fallback = '') {
  const number = enumNumber(value);
  if (number === null) return fallback;
  const label = enumMaps[type]?.get(number) || fallback || String(number);
  if (type === 'GemBust') {
    return { NORMAL: 'Normal', GEM: 'Gem', BUST: 'Bust', HIDDEN: 'Hidden' }[label] || label;
  }
  return label;
}

function enumToken(type, value, fallback = '') {
  const number = enumNumber(value);
  if (number === null) return fallback;
  return enumTokenMaps[type]?.get(number) || fallback || String(number);
}

function devTraitLabel(value) {
  const number = enumNumber(value);
  if (number === null) return '';
  return new Map([
    [0, 'Normal'],
    [1, 'Impact'],
    [2, 'Star'],
    [3, 'Elite'],
    [4, 'Hidden']
  ]).get(number) || enumLabel('TraitDevelopment', value);
}

function recruitingDealbreakerLabel(value) {
  const number = enumNumber(value);
  if (number === null || number === 15) return '';
  return enumLabel('RecruitingMotivationType', number);
}

function recruitingPitchLabel(value) {
  const number = enumNumber(value);
  if (number === null || number === 22) return '';
  const token = enumToken('RecruitingPitchType', number);
  return RECRUITING_PITCH_LABEL_OVERRIDES.get(token) || enumLabel('RecruitingPitchType', number);
}

function draftPositionLabel(value) {
  const number = enumNumber(value);
  if (number === null || number === 31) return '';
  return enumLabel('DraftPositionE', number);
}

function abilityRankLabel(value) {
  const label = enumLabel('AbilitiesRank', value);
  return label === 'None' || label === '0' ? '' : label;
}

function mentalAbilityLabel(value) {
  const label = enumLabel('MentalAbilities', value);
  return label === 'None' || label === '0' ? '' : label;
}

function physicalAbilityRows(player) {
  const playerTypeToken = enumToken('PlayerType', player.PlayerType);
  const slotNames = Array.isArray(physicalAbilitySlotMap[playerTypeToken])
    ? physicalAbilitySlotMap[playerTypeToken]
    : [];
  return PHYSICAL_ABILITY_FIELDS.map((field, index) => {
    const slot = index + 1;
    const rank = abilityRankLabel(player[field]);
    const name = rank ? (slotNames[index] || '') : '';
    return {
      slot,
      field,
      name,
      rank,
      raw: player[field] ?? '',
      label: name ? `${name} (${rank})` : (rank ? `P${slot} ${rank}` : '')
    };
  });
}

function mentalAbilityRows(player) {
  return MENTAL_ABILITY_FIELDS.map((field, index) => {
    const rankField = MENTAL_ABILITY_RANK_FIELDS[index];
    const rank = abilityRankLabel(player[rankField]);
    const ability = rank ? mentalAbilityLabel(player[field]) : '';
    return {
      slot: index + 1,
      field,
      rankField,
      ability,
      rank,
      label: ability ? `${ability} (${rank})` : '',
      raw: player[field] ?? '',
      rankRaw: player[rankField] ?? ''
    };
  });
}

function summarizePhysicalAbilities(abilities) {
  return abilities
    .filter((ability) => ability.rank)
    .map((ability) => `${ability.name || `P${ability.slot}`} (${ability.rank})`)
    .join('; ');
}

function summarizeMentalAbilities(abilities) {
  return abilities
    .filter((ability) => ability.label)
    .map((ability) => ability.label)
    .join('; ');
}

function starCount(value) {
  const number = enumNumber(value);
  if (number === null || number < 0 || number > 4) return null;
  return number + 1;
}

function formatStars(value) {
  const count = starCount(value);
  return count ? `${count}-star` : '';
}

function formatHeight(inches) {
  const value = Number(inches);
  if (!Number.isFinite(value) || value <= 0) return '';
  return `${Math.floor(value / 12)}'${value % 12}"`;
}

function formatWeight(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return '';
  return String(number + 160);
}

function numericOrBlank(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : '';
}

function heightParts(inches) {
  const value = Number(inches);
  if (!Number.isFinite(value) || value <= 0) {
    return { feet: '', inches: '', total: '' };
  }
  return {
    feet: Math.floor(value / 12),
    inches: value % 12,
    total: value
  };
}

function relativeAsset(...parts) {
  return parts.join('/').replace(/\\/g, '/');
}

function helperAssetPath(...parts) {
  return relativeAsset('assets', ...parts);
}

function existingAsset(relativePath, fallback = '') {
  if (!relativePath) return fallback;
  const normalized = String(relativePath).replace(/\\/g, '/').replace(/^assets\//i, '');
  return fs.existsSync(path.join(ASSET_DIR, ...normalized.split('/'))) ? relativePath : fallback;
}

function buildGenericPortraitLookup() {
  const lookup = new Map();
  const portraitRoot = path.join(ASSET_DIR, 'Player_Portraits');

  function addPortraitFile(fullPath) {
    const fileName = path.basename(fullPath);
    const match = /^nilpp_(Generic_.+)\.webp$/i.exec(fileName);
    if (!match) return;
    const genericHead = match[1];
    if (lookup.has(genericHead)) return;
    const relativePath = path.relative(ASSET_DIR, fullPath).replace(/\\/g, '/');
    lookup.set(genericHead, helperAssetPath(relativePath));
  }

  function walk(folderPath) {
    if (!fs.existsSync(folderPath)) return;
    for (const entry of fs.readdirSync(folderPath, { withFileTypes: true })) {
      const fullPath = path.join(folderPath, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }
      if (entry.isFile() && /\.webp$/i.test(entry.name)) {
        addPortraitFile(fullPath);
      }
    }
  }

  for (const folder of GENERIC_PORTRAIT_FOLDERS) {
    walk(path.join(portraitRoot, folder));
  }

  return lookup;
}

function normalizedTeamKey(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function readTeamLogoLookup() {
  const logoDir = path.join(ASSET_DIR, 'team-logos');
  const lookup = new Map();
  if (!fs.existsSync(logoDir)) return lookup;

  for (const fileName of fs.readdirSync(logoDir)) {
    if (!/\.webp$/i.test(fileName) || /^Blank\./i.test(fileName)) continue;
    const schoolPart = fileName.replace(/\.webp$/i, '').split('_')[0];
    const key = normalizedTeamKey(schoolPart);
    if (key && !lookup.has(key)) {
      lookup.set(key, helperAssetPath('team-logos', fileName));
    }
  }
  return lookup;
}

function playerPortraitInfo(player) {
  const genericHead = String(player.GenericHeadAssetName || '').trim();
  const genericHeadMatch = genericHead.match(/^Generic_(\d+)_P_T(\d+)_([A-Z])_(\d+)_(\d+)$/);
  const portraitId = Number(player.PLYR_PORTRAIT);
  const blank = helperAssetPath('Player_Portraits', 'nilpp_Blank.webp');
  const genericHeadPortraitPath = genericHead ? genericPortraitLookup.get(genericHead) || '' : '';
  const m26PortraitPath = INCLUDE_M26_PORTRAITS && Number.isFinite(portraitId) && portraitId > 0
    ? helperAssetPath('M26', 'Portraits', `${portraitId}.webp`)
    : '';
  const candidates = [];
  if (genericHeadPortraitPath) {
    candidates.push({
      source: 'GenericHeadAssetName',
      path: genericHeadPortraitPath,
      connection: `GenericHeadAssetName ${genericHead} -> ${genericHeadPortraitPath.replace(/^assets\//, '')}`
    });
  }
  if (m26PortraitPath && Number.isFinite(portraitId) && portraitId > 0) {
    candidates.push({
      source: 'PLYR_PORTRAIT',
      path: m26PortraitPath,
      connection: `PLYR_PORTRAIT ${portraitId} -> M26/Portraits/${portraitId}.webp`
    });
  }
  const selected = candidates.find((candidate) => existingAsset(candidate.path));
  const pathValue = selected?.path || blank;
  const characterVisuals = String(player.CharacterVisuals ?? '');
  const characterVisualsHasData = Boolean(characterVisuals && !/^0+$/.test(characterVisuals));
  return {
    path: pathValue,
    source: selected?.source || 'Blank',
    fileName: path.basename(pathValue),
    genericHeadPortraitPath,
    m26PortraitPath,
    characterVisuals,
    characterVisualsHasData,
    characterBodyType: player.CharacterBodyType ?? '',
    genericHeadRaw: player.PLYR_GENERICHEAD ?? '',
    genericHeadPortraitId: genericHeadMatch?.[1] || '',
    faceDataSource: characterVisualsHasData ? 'CharacterVisuals/CHVI' : 'GenericHeadAssetName portrait asset',
    connection: selected?.connection || 'No generic-head or portrait-id asset matched; using Player_Portraits/nilpp_Blank.webp'
  };
}

const genericPortraitLookup = buildGenericPortraitLookup();
const teamLogoLookup = readTeamLogoLookup();

function teamLogoPath(teamId, teamName) {
  const names = Array.isArray(teamName) ? teamName : [teamName];
  const tried = [];
  for (const name of names) {
    const key = normalizedTeamKey(name);
    if (!key || tried.includes(key)) continue;
    tried.push(key);
    const logoKey = TEAM_LOGO_KEY_OVERRIDES.get(key) || key;
    const namedLogo = teamLogoLookup.get(logoKey);
    if (namedLogo) return namedLogo;
  }
  throw new Error(`No exact named logo mapped for TeamId ${teamId} (${names.filter(Boolean).join(' / ') || 'unknown'})`);
}

function readEnumAttributes(filePath) {
  const xml = fs.readFileSync(filePath, 'utf8');
  return Array.from(xml.matchAll(/<attribute\s+name="([^"]+)"\s+idx="(\d+)"\s+value="(\d+)"/g))
    .map((match) => ({
      name: match[1],
      idx: Number(match[2]),
      value: Number(match[3])
    }));
}

function teamLabelFromEnumName(name) {
  if (TEAM_LABEL_OVERRIDES.has(name)) return TEAM_LABEL_OVERRIDES.get(name);
  return String(name || '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\bSt\b/g, 'State')
    .trim();
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function integerInRange(value, min, max) {
  const number = numberOrNull(value);
  if (!Number.isInteger(number)) return null;
  if (number < min || number > max) return null;
  return number;
}

function teamOrigIdForRow(row) {
  for (const field of TEAM_ORIG_ID_FIELD_CANDIDATES) {
    const value = integerInRange(row[field], TEAM_ORIG_ID_MIN, 1600);
    if (value !== null) return value;
  }
  return null;
}

function teamDisplayNameForRow(row) {
  for (const field of TEAM_DISPLAY_FIELD_CANDIDATES) {
    const raw = row[field];
    if (raw === null || raw === undefined) continue;
    const text = String(raw).trim();
    if (!text || /^-?\d+$/.test(text) || /^[01]{16,}$/.test(text) || /^0+$/.test(text)) continue;
    const label = cleanLabel(text);
    if (label) return label;
  }
  return '';
}

function readTeamOrigLabelsByRawId() {
  const teamOrigIds = readEnumAttributes(TEAM_ORIG_ID_PATH);
  const labels = new Map();
  for (const entry of teamOrigIds) {
    if (!Number.isFinite(entry.value)) continue;
    const label = teamLabelFromEnumName(entry.name);
    if (label) labels.set(entry.value, label);
  }
  return labels;
}

function teamIndexFieldStats(field, rows) {
  const values = [];
  const distinct = new Set();
  let anchorTotal = 0;
  let anchorMatches = 0;
  const anchorMismatches = [];
  for (const row of rows) {
    if (!row || row._isEmpty) continue;
    const teamIndex = integerInRange(row[field], 0, 255);
    if (teamIndex === null) continue;
    values.push(teamIndex);
    distinct.add(teamIndex);
    const origId = teamOrigIdForRow(row);
    if (!TEAM_INDEX_ANCHORS_BY_ORIG_ID.has(origId)) continue;
    anchorTotal += 1;
    const expected = TEAM_INDEX_ANCHORS_BY_ORIG_ID.get(origId);
    if (teamIndex === expected) {
      anchorMatches += 1;
    } else {
      anchorMismatches.push(`${origId}:${teamIndex}!=${expected}`);
    }
  }
  const usable = values.filter((value) => value !== 255);
  return {
    field,
    count: values.length,
    usableCount: usable.length,
    distinctCount: distinct.size,
    min: values.length ? Math.min(...values) : null,
    max: values.length ? Math.max(...values) : null,
    anchorTotal,
    anchorMatches,
    anchorMismatches
  };
}

function pickTeamIndexField(teamRows) {
  const stats = TEAM_INDEX_FIELD_CANDIDATES
    .map((field) => teamIndexFieldStats(field, teamRows))
    .filter((entry) => entry.usableCount > 0);
  const anchored = stats.find((entry) => (
    entry.anchorTotal > 0 &&
    entry.anchorMatches === entry.anchorTotal &&
    entry.usableCount >= 100 &&
    entry.distinctCount >= 100
  ));
  if (anchored) return anchored;

  const named = stats.find((entry) => (
    /^teamindex_?$/i.test(entry.field) &&
    entry.usableCount >= 100 &&
    entry.distinctCount >= 100 &&
    entry.anchorMismatches.length === 0
  ));
  if (named) return named;

  const minimumDistinct = Math.min(100, Math.max(1, Math.floor(teamRows.length * 0.6)));
  const broad = stats.find((entry) => (
    entry.usableCount >= minimumDistinct &&
    entry.distinctCount >= minimumDistinct &&
    entry.anchorMismatches.length === 0
  ));
  if (broad) return broad;

  const summary = stats
    .map((entry) => `${entry.field}: usable=${entry.usableCount}, distinct=${entry.distinctCount}, anchors=${entry.anchorMatches}/${entry.anchorTotal}`)
    .join('; ');
  throw new Error(`Could not identify Team.TeamIndex field from exported Team table. Checked ${summary || 'no candidate fields'}.`);
}

function teamEntryScore(entry) {
  const labelScore = entry.labelSource === 'Team table display field' ? 100
    : entry.labelSource === 'Team original-id fallback' ? 80
      : entry.labelSource === 'CFB27 extra-team fallback' ? 60
        : 10;
  return labelScore + (entry.teamGameId ? 5 : 0);
}

function readRecruitingTeams(teamTable) {
  const teamRows = teamTable.records || [];
  const teamOrigLabels = readTeamOrigLabelsByRawId();
  const extraLabelsByIndex = new Map(CFB27_EXTRA_RECRUITING_TEAMS.map((entry) => [entry.teamId, entry.team]));
  const teamIndexField = pickTeamIndexField(teamRows);
  const teams = new Map();
  let skippedEmpty = 0;
  let skippedNoIndex = 0;
  for (const [rowIndex, row] of teamRows.entries()) {
    if (!row || row._isEmpty) {
      skippedEmpty += 1;
      continue;
    }
    const teamId = integerInRange(row[teamIndexField.field], 0, 255);
    if (teamId === null || teamId === 255) {
      skippedNoIndex += 1;
      continue;
    }
    const teamGameId = teamOrigIdForRow(row);
    const saveDisplayName = teamDisplayNameForRow(row);
    const originalIdLabel = teamGameId !== null ? teamOrigLabels.get(teamGameId) || '' : '';
    const extraLabel = extraLabelsByIndex.get(teamId) || '';
    const team = saveDisplayName || originalIdLabel || extraLabel || `TeamIndex ${teamId}`;
    const labelSource = saveDisplayName ? 'Team table display field'
      : originalIdLabel ? 'Team original-id fallback'
        : extraLabel ? 'CFB27 extra-team fallback'
          : 'TeamIndex placeholder';
    const entry = {
      teamId,
      team,
      stadiumId: teamGameId !== null ? teamGameId - TEAM_STADIUM_ID_OFFSET : '',
      teamGameId: teamGameId ?? '',
      teamRow: row._index ?? rowIndex,
      teamIndexField: teamIndexField.field,
      labelSource,
      originalIdLabel,
      extraLabel
    };
    const existing = teams.get(teamId);
    if (!existing || teamEntryScore(entry) > teamEntryScore(existing)) {
      teams.set(teamId, entry);
    }
  }
  return {
    teams,
    metadata: {
      teamIndexField,
      teamRowsScanned: teamRows.length,
      mappedTeamCount: teams.size,
      skippedEmpty,
      skippedNoIndex,
      labelFallback: 'Team.DisplayName/LongName when decoded; otherwise the same Team row original-id label, with CFB27 extra-team labels only after the save row is matched.'
    }
  };
}

function ratingValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : '';
}

function ratingLabel(field) {
  return cleanLabel(field.replace(/Rating$/, ' Rating'));
}

function csvEscape(value) {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function htmlEscape(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function scriptJson(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

const recruitTable = readJson(files.recruit);
const playerTable = readJson(files.player);
const userRecruitTargetTable = readJson(files.userRecruitTarget);
const prospectArrayTable = readJson(files.prospectTargetSchoolArray);
const prospectTargetSchoolTable = readJson(files.prospectTargetSchool);
const teamTable = readJson(files.team);
const { teams: recruitingTeams, metadata: teamMapping } = readRecruitingTeams(teamTable);

const players = playerTable.records || [];
const recruits = recruitTable.records || [];
const userTargets = userRecruitTargetTable.records || [];
const topSchoolArrays = prospectArrayTable.records || [];
const topSchoolRows = prospectTargetSchoolTable.records || [];
const ratingFields = (playerTable.field_definitions || [])
  .map((field) => field.name)
  .filter((name) => /Rating$/.test(name))
  .sort();

const userTargetByRecruitRow = new Map();
for (const target of userTargets) {
  if (target._isEmpty) continue;
  const recruitRef = decodeReference(target.Recruit);
  if (recruitRef?.row !== undefined) {
    userTargetByRecruitRow.set(recruitRef.row, target);
  }
}

function topSchoolsFor(recruit) {
  const arrayRef = decodeReference(recruit.TopSchoolsList);
  if (!arrayRef) return [];
  const arrayRow = topSchoolArrays[arrayRef.row];
  if (!arrayRow || arrayRow._isEmpty) return [];
  const schools = [];
  for (let i = 0; i < 10; i += 1) {
    const ref = decodeReference(arrayRow[`ProspectTargetSchool${i}`]);
    const entry = ref ? topSchoolRows[ref.row] : null;
    if (!entry || entry._isEmpty) continue;
    const teamId = Number(entry.TeamId);
    if (!Number.isFinite(teamId)) continue;
    const teamInfo = recruitingTeams.get(teamId);
    if (!teamInfo?.team) {
      throw new Error(`No exact recruiting team label mapped for TeamId ${teamId}`);
    }
    schools.push({
      rank: 0,
      listSlot: i + 1,
      teamId,
      team: teamInfo.team,
      stadiumId: teamInfo.stadiumId,
      teamGameId: teamInfo.teamGameId,
      influence: entry.TeamInfluence ?? '',
      logoPath: teamLogoPath(teamId, [teamInfo.team, teamInfo.originalIdLabel, teamInfo.extraLabel]),
      prospectTargetSchoolRow: ref.row,
      teamRow: teamInfo.teamRow,
      teamIndexField: teamInfo.teamIndexField,
      teamLabelSource: teamInfo.labelSource
    });
  }
  schools.sort((a, b) => {
    const influenceA = numberOrNull(a.influence);
    const influenceB = numberOrNull(b.influence);
    const sortableA = influenceA === null ? Number.NEGATIVE_INFINITY : influenceA;
    const sortableB = influenceB === null ? Number.NEGATIVE_INFINITY : influenceB;
    return sortableB - sortableA || a.listSlot - b.listSlot;
  });
  schools.forEach((school, index) => {
    school.rank = index + 1;
  });
  return schools;
}

function assignTopSchoolColumns(row, schools) {
  for (let i = 0; i < 10; i += 1) {
    const school = schools[i] || {};
    const slot = i + 1;
    row[`topSchool${slot}Team`] = school.team || '';
    row[`topSchool${slot}TeamId`] = school.teamId ?? '';
    row[`topSchool${slot}StadiumId`] = school.stadiumId ?? '';
    row[`topSchool${slot}TeamGameId`] = school.teamGameId ?? '';
    row[`topSchool${slot}Influence`] = school.influence ?? '';
    row[`topSchool${slot}LogoPath`] = school.logoPath || '';
    row[`topSchool${slot}ProspectTargetSchoolRow`] = school.prospectTargetSchoolRow ?? '';
    row[`topSchool${slot}ListSlot`] = school.listSlot ?? '';
    row[`topSchool${slot}TeamRow`] = school.teamRow ?? '';
    row[`topSchool${slot}TeamIndexField`] = school.teamIndexField || '';
    row[`topSchool${slot}TeamLabelSource`] = school.teamLabelSource || '';
  }
}

const rows = [];
for (const recruit of recruits) {
  if (recruit._isEmpty) continue;
  const nationalRank = Number(recruit.NationalRank);
  if (!Number.isFinite(nationalRank) || nationalRank <= 0) continue;

  const playerRef = decodeReference(recruit.Player);
  const player = playerRef ? players[playerRef.row] : null;
  if (!player || player._isEmpty) continue;

  const firstName = String(player.FirstName || '').trim();
  const lastName = String(player.LastName || '').trim();
  const name = `${firstName} ${lastName}`.trim();
  if (!name) continue;

  const userTarget = userTargetByRecruitRow.get(recruit._index) || null;
  const schools = topSchoolsFor(recruit);
  const topFiveSchools = schools
    .slice(0, 5)
    .map((school) => `${school.team} (${school.influence})`)
    .join('; ');

  const state = enumLabel('StateName', player.PLYR_HOME_STATE);
  const height = heightParts(player.Height);
  const topSchoolArrayRef = decodeReference(recruit.TopSchoolsList);
  const portraitInfo = playerPortraitInfo(player);
  const physicalAbilities = physicalAbilityRows(player);
  const mentalAbilities = mentalAbilityRows(player);
  const playerPosition = enumLabel('PositionE', player.Position);
  const alternatePosition1 = draftPositionLabel(recruit.AlternatePosition1);
  const alternatePosition2 = draftPositionLabel(recruit.AlternatePosition2);
  const alternatePositions = [alternatePosition1, alternatePosition2].filter(Boolean);
  const recruitPosition = alternatePositions.length ? 'ATH' : playerPosition;
  const row = {
    nationalRank,
    positionRank: Number(recruit.PositionRank) || '',
    stateRank: Number(recruit.StateRank) || '',
    name,
    firstName,
    lastName,
    position: playerPosition,
    positionRaw: player.Position ?? '',
    recruitPosition,
    displayPosition: recruitPosition,
    playerPosition,
    playerPositionRaw: player.Position ?? '',
    isAthlete: alternatePositions.length > 0,
    alternatePositions: alternatePositions.join('/'),
    alternatePosition1,
    alternatePosition1Raw: recruit.AlternatePosition1 ?? '',
    alternatePosition2,
    alternatePosition2Raw: recruit.AlternatePosition2 ?? '',
    playerType: enumLabel('PlayerType', player.PlayerType),
    playerTypeToken: enumToken('PlayerType', player.PlayerType),
    playerTypeRaw: player.PlayerType ?? '',
    stars: formatStars(player.ProspectStarRating),
    starCount: starCount(player.ProspectStarRating) || 0,
    prospectStarRatingRaw: player.ProspectStarRating ?? '',
    overall: Number(player.OverallRating) || '',
    class: enumLabel('RecruitingClass', recruit.Class),
    classRaw: recruit.Class ?? '',
    height: formatHeight(player.Height),
    heightFeet: height.feet,
    heightInches: height.inches,
    heightTotalInches: height.total,
    weight: formatWeight(player.Weight),
    weightRaw: player.Weight ?? '',
    homeTown: player.PLYR_HOME_TOWN || '',
    hometown: [player.PLYR_HOME_TOWN, state].filter(Boolean).join(', '),
    homeState: state,
    homeStateRaw: player.PLYR_HOME_STATE ?? '',
    pipeline: enumLabel('Pipeline', player.HomePipeline),
    pipelineRaw: player.HomePipeline ?? '',
    stage: enumLabel('RecruitStage', recruit.RecruitStage),
    stageRaw: recruit.RecruitStage ?? '',
    advance: enumLabel('RecruitStageAdvance', recruit.RecruitStageAdvance),
    advanceRaw: recruit.RecruitStageAdvance ?? '',
    gemBust: enumLabel('GemBust', recruit.QualityModifier),
    gemBustRaw: recruit.QualityModifier ?? '',
    devTrait: devTraitLabel(player.TraitDevelopment),
    devTraitRaw: player.TraitDevelopment ?? '',
    recruitingDealbreaker: recruitingDealbreakerLabel(player.RecruitingDealbreaker),
    recruitingDealbreakerRaw: player.RecruitingDealbreaker ?? '',
    idealRecruitingPitch: recruitingPitchLabel(player.IdealRecruitingPitch),
    idealRecruitingPitchRaw: player.IdealRecruitingPitch ?? '',
    physicalAbilities: summarizePhysicalAbilities(physicalAbilities),
    mentalAbilities: summarizeMentalAbilities(mentalAbilities),
    offers: Number(recruit.TotalScholarshipOffers) || 0,
    commitScore: Number(recruit.CommitScore) || 0,
    baseNilValue: numericOrBlank(player.BaseNILValue),
    currentNilCompensation: numericOrBlank(player.CurrentNILCompensation),
    isNil: Boolean(player.IsNIL),
    topFiveSchools,
    topSchools: schools,
    onUserBoard: Boolean(userTarget),
    userRecruitTargetRow: userTarget?._index ?? '',
    scholarshipStatus: userTarget ? enumLabel('ScholarshipStatus', userTarget.ScholarshipStatus) : '',
    scholarshipStatusRaw: userTarget?.ScholarshipStatus ?? '',
    hours: userTarget ? Number(userTarget.ProspectHoursSpentCurrent) || 0 : '',
    influence: userTarget ? Number(userTarget.ProspectInfluenceTotal) || 0 : '',
    influenceDelta: userTarget ? Number(userTarget.ProspectInfluenceDelta) || 0 : '',
    influenceLastWeek: userTarget ? Number(userTarget.ProspectInfluenceTotalLastWeek) || 0 : '',
    nilOffer: userTarget ? Number(userTarget.CurrentNILOffer) || 0 : '',
    nilExpectation: userTarget ? Number(userTarget.NILExpectation) || 0 : '',
    originalNilExpectation: userTarget ? Number(userTarget.OriginalNILExpectation) || 0 : '',
    isFavorite: userTarget ? Boolean(userTarget.IsFavorite) : false,
    sendTheHouse: userTarget ? Boolean(userTarget.SendTheHouse) : false,
    contactFriendsAndFamily: userTarget ? Boolean(userTarget.ContactFriendsAndFamily) : false,
    contactHighSchoolCoaches: userTarget ? Boolean(userTarget.ContactHighSchoolCoaches) : false,
    searchSocialMedia: userTarget ? Boolean(userTarget.SearchSocialMedia) : false,
    visitRecruitsSchool: userTarget ? Boolean(userTarget.VisitRecruitsSchool) : false,
    portraitPath: portraitInfo.path,
    portraitSource: portraitInfo.source,
    portraitFileName: portraitInfo.fileName,
    genericHeadPortraitPath: portraitInfo.genericHeadPortraitPath,
    m26PortraitPath: portraitInfo.m26PortraitPath,
    characterVisuals: portraitInfo.characterVisuals,
    characterVisualsHasData: portraitInfo.characterVisualsHasData,
    characterBodyType: portraitInfo.characterBodyType,
    characterBodyTypeLabel: enumLabel('CharacterBodyType', portraitInfo.characterBodyType),
    genericHeadRaw: portraitInfo.genericHeadRaw,
    genericHeadPortraitId: portraitInfo.genericHeadPortraitId,
    faceDataSource: portraitInfo.faceDataSource,
    portraitFaceConnection: portraitInfo.connection,
    playerAssetName: player.PLYR_ASSETNAME || '',
    genericHeadAssetName: player.GenericHeadAssetName || '',
    portraitId: player.PLYR_PORTRAIT ?? '',
    recruitRow: recruit._index,
    playerRow: playerRef?.row ?? '',
    recruitPlayerReference: recruit.Player ?? '',
    topSchoolsArrayRow: topSchoolArrayRef?.row ?? '',
    topSchoolsListReference: recruit.TopSchoolsList ?? ''
  };
  for (const ability of physicalAbilities) {
    row[`physicalAbility${ability.slot}`] = ability.label;
    row[`physicalAbility${ability.slot}Name`] = ability.name;
    row[`physicalAbility${ability.slot}Rank`] = ability.rank;
    row[`physicalAbility${ability.slot}Raw`] = ability.raw;
  }
  for (const ability of mentalAbilities) {
    row[`mentalAbility${ability.slot}`] = ability.label;
    row[`mentalAbility${ability.slot}Name`] = ability.ability;
    row[`mentalAbility${ability.slot}Rank`] = ability.rank;
    row[`mentalAbility${ability.slot}Raw`] = ability.raw;
    row[`mentalAbility${ability.slot}RankRaw`] = ability.rankRaw;
  }
  for (const field of ratingFields) {
    row[field] = ratingValue(player[field]);
  }
  assignTopSchoolColumns(row, schools);
  rows.push(row);
}

rows.sort((a, b) => a.nationalRank - b.nationalRank);

const csvColumns = [
  ['National Rank', 'nationalRank'],
  ['Position Rank', 'positionRank'],
  ['State Rank', 'stateRank'],
  ['First Name', 'firstName'],
  ['Last Name', 'lastName'],
  ['Full Name', 'name'],
  ['Position', 'position'],
  ['Position Raw', 'positionRaw'],
  ['Recruit Display Position', 'recruitPosition'],
  ['Player Position', 'playerPosition'],
  ['Player Position Raw', 'playerPositionRaw'],
  ['Is Athlete', 'isAthlete'],
  ['Alternate Positions', 'alternatePositions'],
  ['Alternate Position 1', 'alternatePosition1'],
  ['Alternate Position 1 Raw', 'alternatePosition1Raw'],
  ['Alternate Position 2', 'alternatePosition2'],
  ['Alternate Position 2 Raw', 'alternatePosition2Raw'],
  ['Player Type', 'playerType'],
  ['Player Type Token', 'playerTypeToken'],
  ['Player Type Raw', 'playerTypeRaw'],
  ['Stars', 'stars'],
  ['Star Count', 'starCount'],
  ['Prospect Star Raw', 'prospectStarRatingRaw'],
  ['OVR', 'overall'],
  ['Class', 'class'],
  ['Class Raw', 'classRaw'],
  ['Height', 'height'],
  ['Height Feet', 'heightFeet'],
  ['Height Inches', 'heightInches'],
  ['Height Total Inches', 'heightTotalInches'],
  ['Weight', 'weight'],
  ['Weight Raw', 'weightRaw'],
  ['Home Town', 'homeTown'],
  ['Home State', 'homeState'],
  ['Home State Raw', 'homeStateRaw'],
  ['Pipeline', 'pipeline'],
  ['Pipeline Raw', 'pipelineRaw'],
  ['Stage', 'stage'],
  ['Stage Raw', 'stageRaw'],
  ['Advance', 'advance'],
  ['Advance Raw', 'advanceRaw'],
  ['Gem/Bust', 'gemBust'],
  ['Gem/Bust Raw', 'gemBustRaw'],
  ['Dev Trait', 'devTrait'],
  ['Dev Trait Raw', 'devTraitRaw'],
  ['Recruiting Dealbreaker', 'recruitingDealbreaker'],
  ['Recruiting Dealbreaker Raw', 'recruitingDealbreakerRaw'],
  ['Ideal Recruiting Pitch', 'idealRecruitingPitch'],
  ['Ideal Recruiting Pitch Raw', 'idealRecruitingPitchRaw'],
  ['Physical Abilities', 'physicalAbilities'],
  ['Mental Abilities', 'mentalAbilities'],
  ['Offers', 'offers'],
  ['Commit Score', 'commitScore'],
  ['Base NIL Value', 'baseNilValue'],
  ['Current NIL Compensation', 'currentNilCompensation'],
  ['Is NIL', 'isNil'],
  ['On User Board', 'onUserBoard'],
  ['User Recruit Target Row', 'userRecruitTargetRow'],
  ['Scholarship', 'scholarshipStatus'],
  ['Scholarship Raw', 'scholarshipStatusRaw'],
  ['Hours', 'hours'],
  ['Influence', 'influence'],
  ['Influence Delta', 'influenceDelta'],
  ['Influence Last Week', 'influenceLastWeek'],
  ['NIL Offer', 'nilOffer'],
  ['NIL Expectation', 'nilExpectation'],
  ['Original NIL Expectation', 'originalNilExpectation'],
  ['Is Favorite', 'isFavorite'],
  ['Send The House', 'sendTheHouse'],
  ['Contact Friends And Family', 'contactFriendsAndFamily'],
  ['Contact High School Coaches', 'contactHighSchoolCoaches'],
  ['Search Social Media', 'searchSocialMedia'],
  ['Visit Recruit School', 'visitRecruitsSchool'],
  ['Portrait Path', 'portraitPath'],
  ['Portrait Source', 'portraitSource'],
  ['Portrait File Name', 'portraitFileName'],
  ['Generic Head Portrait Path', 'genericHeadPortraitPath'],
  ['M26 Portrait Path', 'm26PortraitPath'],
  ['Character Visuals Reference', 'characterVisuals'],
  ['Character Visuals Has Data', 'characterVisualsHasData'],
  ['Character Body Type', 'characterBodyType'],
  ['Character Body Type Label', 'characterBodyTypeLabel'],
  ['PLYR Generic Head Raw', 'genericHeadRaw'],
  ['Generic Head Portrait ID', 'genericHeadPortraitId'],
  ['Face Data Source', 'faceDataSource'],
  ['Portrait Face Connection', 'portraitFaceConnection'],
  ['Player Asset Name', 'playerAssetName'],
  ['Generic Head Asset Name', 'genericHeadAssetName'],
  ['Portrait ID', 'portraitId'],
  ['Recruit Row', 'recruitRow'],
  ['Player Row', 'playerRow'],
  ['Recruit Player Reference', 'recruitPlayerReference'],
  ['Top Schools Array Row', 'topSchoolsArrayRow'],
  ['Top Schools List Reference', 'topSchoolsListReference'],
  ...PHYSICAL_ABILITY_FIELDS.flatMap((_field, index) => {
    const slot = index + 1;
    return [
      [`Physical Ability ${slot}`, `physicalAbility${slot}`],
      [`Physical Ability ${slot} Name`, `physicalAbility${slot}Name`],
      [`Physical Ability ${slot} Rank`, `physicalAbility${slot}Rank`],
      [`Physical Ability ${slot} Raw`, `physicalAbility${slot}Raw`]
    ];
  }),
  ...MENTAL_ABILITY_FIELDS.flatMap((_field, index) => {
    const slot = index + 1;
    return [
      [`Mental Ability ${slot}`, `mentalAbility${slot}`],
      [`Mental Ability ${slot} Name`, `mentalAbility${slot}Name`],
      [`Mental Ability ${slot} Rank`, `mentalAbility${slot}Rank`],
      [`Mental Ability ${slot} Raw`, `mentalAbility${slot}Raw`],
      [`Mental Ability ${slot} Rank Raw`, `mentalAbility${slot}RankRaw`]
    ];
  }),
  ...ratingFields.map((field) => [ratingLabel(field), field]),
  ...Array.from({ length: 10 }, (_, index) => {
    const slot = index + 1;
    return [
      [`Top School ${slot} Team`, `topSchool${slot}Team`],
      [`Top School ${slot} TeamIndex`, `topSchool${slot}TeamId`],
      [`Top School ${slot} Stadium ID`, `topSchool${slot}StadiumId`],
      [`Top School ${slot} TGID`, `topSchool${slot}TeamGameId`],
      [`Top School ${slot} Influence`, `topSchool${slot}Influence`],
      [`Top School ${slot} Logo Path`, `topSchool${slot}LogoPath`],
      [`Top School ${slot} Prospect Target School Row`, `topSchool${slot}ProspectTargetSchoolRow`],
      [`Top School ${slot} Source List Slot`, `topSchool${slot}ListSlot`],
      [`Top School ${slot} Team Row`, `topSchool${slot}TeamRow`],
      [`Top School ${slot} TeamIndex Field`, `topSchool${slot}TeamIndexField`],
      [`Top School ${slot} Team Label Source`, `topSchool${slot}TeamLabelSource`]
    ];
  }).flat()
];

const csv = [
  csvColumns.map(([label]) => csvEscape(label)).join(','),
  ...rows.map((row) => csvColumns.map(([, key]) => csvEscape(row[key])).join(','))
].join('\r\n');

fs.writeFileSync(outputFiles.json, JSON.stringify({
  sourceFile: SOURCE_FILE,
  generatedAt: new Date().toISOString(),
  recruitCount: rows.length,
  teamMapping,
  columns: Object.fromEntries(csvColumns.map(([label, key]) => [key, label])),
  rows
}, null, 2));
fs.writeFileSync(outputFiles.csv, csv);

const filterOptions = {
  positions: [...new Set(rows.map((row) => row.recruitPosition || row.position).filter(Boolean))].sort(),
  stars: [...new Set(rows.map((row) => row.stars).filter(Boolean))].sort((a, b) => Number(b[0]) - Number(a[0])),
  classes: [...new Set(rows.map((row) => row.class).filter(Boolean))].sort()
};

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>CFB27 Recruiting Table</title>
  <style>
    :root {
      --bg: #0b0d10;
      --panel: #141820;
      --panel-2: #1b2029;
      --text: #f5f7fb;
      --muted: #aab2bf;
      --border: #303846;
      --accent: #67a2ff;
      --accent-2: #7fd1ae;
      --warn: #e5c36a;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      color: var(--text);
      background: var(--bg);
      font-family: Inter, Segoe UI, Arial, sans-serif;
    }
    header {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      align-items: end;
      justify-content: space-between;
      padding: 18px 20px 12px;
      border-bottom: 1px solid var(--border);
      background: #10141b;
      position: sticky;
      top: 0;
      z-index: 5;
    }
    h1 { margin: 0; font-size: 20px; letter-spacing: 0; }
    .meta { color: var(--muted); font-size: 12px; margin-top: 4px; }
    .controls {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
      justify-content: flex-end;
    }
    input, select, button {
      color: var(--text);
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 6px;
      min-height: 34px;
      padding: 7px 9px;
      font: inherit;
      font-size: 13px;
    }
    input { width: min(280px, 100%); }
    button { cursor: pointer; }
    button.active {
      border-color: var(--accent);
      background: #19314f;
    }
    main { padding: 14px 20px 20px; }
    .summary {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-bottom: 12px;
      color: var(--muted);
      font-size: 12px;
    }
    .chip {
      border: 1px solid var(--border);
      background: var(--panel);
      border-radius: 6px;
      padding: 6px 8px;
    }
    .table-wrap {
      border: 1px solid var(--border);
      overflow: auto;
      max-height: calc(100vh - 142px);
      background: #0f1319;
    }
    table {
      border-collapse: separate;
      border-spacing: 0;
      width: max-content;
      min-width: 100%;
      font-size: 12px;
    }
    th, td {
      border-right: 1px solid var(--border);
      border-bottom: 1px solid #222a35;
      padding: 7px 8px;
      white-space: nowrap;
      vertical-align: middle;
    }
    th {
      position: sticky;
      top: 0;
      z-index: 2;
      background: var(--panel-2);
      text-align: left;
      cursor: pointer;
      color: #e7ecf5;
      user-select: none;
    }
    tbody tr:nth-child(even) td { background: #121720; }
    tbody tr:hover td { background: #18202b; }
    .num { text-align: right; font-variant-numeric: tabular-nums; }
    .stars { color: var(--warn); font-weight: 700; }
    .board { color: var(--accent-2); font-weight: 700; }
    .schools {
      max-width: 460px;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .empty {
      color: var(--muted);
      padding: 26px;
      text-align: center;
      display: none;
    }
    @media (max-width: 800px) {
      header { position: static; }
      .controls { justify-content: flex-start; width: 100%; }
      input, select, button { flex: 1 1 150px; }
      main { padding: 12px; }
      .table-wrap { max-height: none; }
    }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>CFB27 Recruiting Table</h1>
      <div class="meta">Generated from ${htmlEscape(SOURCE_FILE)}. Sorted by national rank.</div>
    </div>
    <div class="controls">
      <input id="search" type="search" placeholder="Search recruits, hometowns, schools">
      <select id="position"><option value="">All positions</option>${filterOptions.positions.map((value) => `<option>${htmlEscape(value)}</option>`).join('')}</select>
      <select id="stars"><option value="">All stars</option>${filterOptions.stars.map((value) => `<option>${htmlEscape(value)}</option>`).join('')}</select>
      <select id="class"><option value="">All classes</option>${filterOptions.classes.map((value) => `<option>${htmlEscape(value)}</option>`).join('')}</select>
      <button id="boardOnly" type="button">User board</button>
      <button id="reset" type="button">Reset</button>
    </div>
  </header>
  <main>
    <div class="summary">
      <span class="chip"><strong id="visibleCount">${rows.length.toLocaleString()}</strong> visible</span>
      <span class="chip">${rows.length.toLocaleString()} total recruits</span>
      <span class="chip">${rows.filter((row) => row.onUserBoard).length.toLocaleString()} on user board</span>
      <span class="chip"><a href="recruiting-data.csv" style="color: var(--accent)">CSV</a></span>
      <span class="chip"><a href="recruiting-data.json" style="color: var(--accent)">JSON</a></span>
    </div>
    <div class="table-wrap">
      <table id="table">
        <thead>
          <tr>
            <th data-key="nationalRank" class="num">Nat</th>
            <th data-key="positionRank" class="num">Pos Rank</th>
            <th data-key="stateRank" class="num">State Rank</th>
            <th data-key="name">Name</th>
            <th data-key="recruitPosition">Pos</th>
            <th data-key="stars">Stars</th>
            <th data-key="overall" class="num">OVR</th>
            <th data-key="class">Class</th>
            <th data-key="height">Ht</th>
            <th data-key="weight" class="num">Wt</th>
            <th data-key="hometown">Hometown</th>
            <th data-key="pipeline">Pipeline</th>
            <th data-key="stage">Stage</th>
            <th data-key="gemBust">Gem</th>
            <th data-key="offers" class="num">Offers</th>
            <th data-key="topFiveSchools">Top Schools</th>
            <th data-key="onUserBoard">Board</th>
            <th data-key="scholarshipStatus">Scholarship</th>
            <th data-key="hours" class="num">Hours</th>
            <th data-key="influence" class="num">Influence</th>
          </tr>
        </thead>
        <tbody></tbody>
      </table>
    </div>
    <div id="empty" class="empty">No recruits match the current filters.</div>
  </main>
  <script id="recruit-data" type="application/json">${scriptJson(rows)}</script>
  <script>
    const rows = JSON.parse(document.getElementById('recruit-data').textContent);
    const tbody = document.querySelector('#table tbody');
    const visibleCount = document.getElementById('visibleCount');
    const empty = document.getElementById('empty');
    const state = { sortKey: 'nationalRank', sortDir: 'asc', boardOnly: false };
    const controls = {
      search: document.getElementById('search'),
      position: document.getElementById('position'),
      stars: document.getElementById('stars'),
      className: document.getElementById('class'),
      boardOnly: document.getElementById('boardOnly')
    };
    const cols = ['nationalRank','positionRank','stateRank','name','recruitPosition','stars','overall','class','height','weight','hometown','pipeline','stage','gemBust','offers','topFiveSchools','onUserBoard','scholarshipStatus','hours','influence'];
    const numeric = new Set(['nationalRank','positionRank','stateRank','overall','weight','offers','hours','influence']);

    function compare(a, b) {
      const key = state.sortKey;
      const av = a[key] ?? '';
      const bv = b[key] ?? '';
      if (numeric.has(key)) {
        return (Number(av) || 0) - (Number(bv) || 0);
      }
      return String(av).localeCompare(String(bv), undefined, { numeric: true });
    }
    function matches(row) {
      const needle = controls.search.value.trim().toLowerCase();
      if (state.boardOnly && !row.onUserBoard) return false;
      const displayPosition = row.recruitPosition || row.displayPosition || row.position || '';
      if (controls.position.value && displayPosition !== controls.position.value) return false;
      if (controls.stars.value && row.stars !== controls.stars.value) return false;
      if (controls.className.value && row.class !== controls.className.value) return false;
      if (!needle) return true;
      return [row.name, displayPosition, row.position, row.alternatePositions, row.stars, row.class, row.hometown, row.pipeline, row.stage, row.topFiveSchools, row.scholarshipStatus]
        .join(' ')
        .toLowerCase()
        .includes(needle);
    }
    function cell(row, key) {
      if (key === 'onUserBoard') return row.onUserBoard ? '<span class="board">Yes</span>' : '';
      if (key === 'stars') return '<span class="stars">' + (row.stars || '') + '</span>';
      const value = row[key] ?? '';
      return String(value).replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]));
    }
    function render() {
      const filtered = rows.filter(matches).sort((a, b) => {
        const result = compare(a, b);
        return state.sortDir === 'asc' ? result : -result;
      });
      visibleCount.textContent = filtered.length.toLocaleString();
      empty.style.display = filtered.length ? 'none' : 'block';
      tbody.innerHTML = filtered.map((row) => '<tr>' + cols.map((key) => '<td class="' + (numeric.has(key) ? 'num ' : '') + (key === 'topFiveSchools' ? 'schools' : '') + '">' + cell(row, key) + '</td>').join('') + '</tr>').join('');
    }
    for (const control of [controls.search, controls.position, controls.stars, controls.className]) {
      control.addEventListener('input', render);
    }
    controls.boardOnly.addEventListener('click', () => {
      state.boardOnly = !state.boardOnly;
      controls.boardOnly.classList.toggle('active', state.boardOnly);
      render();
    });
    document.getElementById('reset').addEventListener('click', () => {
      controls.search.value = '';
      controls.position.value = '';
      controls.stars.value = '';
      controls.className.value = '';
      state.boardOnly = false;
      controls.boardOnly.classList.remove('active');
      state.sortKey = 'nationalRank';
      state.sortDir = 'asc';
      render();
    });
    document.querySelectorAll('th[data-key]').forEach((th) => {
      th.addEventListener('click', () => {
        const key = th.dataset.key;
        if (state.sortKey === key) state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
        else {
          state.sortKey = key;
          state.sortDir = numeric.has(key) ? 'desc' : 'asc';
        }
        render();
      });
    });
    render();
  </script>
</body>
</html>`;

fs.writeFileSync(outputFiles.html, html);

console.log(`Wrote ${rows.length} recruits`);
console.log(outputFiles.html);
console.log(outputFiles.csv);
console.log(outputFiles.json);
