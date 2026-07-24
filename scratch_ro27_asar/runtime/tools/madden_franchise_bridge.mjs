import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';

const franchiseRoot =
  process.env.MADDEN_FRANCHISE_ROOT ||
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'vendor', 'madden-franchise');

const franchiseModuleUrl = pathToFileURL(path.join(franchiseRoot, 'src', 'index.js')).href;
const { default: FranchiseFile } = await import(franchiseModuleUrl);

const command = process.argv[2];
const bridgeDir = path.dirname(fileURLToPath(import.meta.url));

function pickSchemaFilesRoot(family) {
  const candidates = family === 'college'
    ? [
        process.env.CFB27_DYNASTY_FILES_ROOT,
        path.resolve(bridgeDir, '..', 'data', 'cfb27', 'Dynasty_Files'),
        path.resolve(bridgeDir, '..', 'data', 'cfb27', 'Dynasty_Files')
      ]
    : [
        process.env.MADDEN27_FRANCHISE_FILES_ROOT,
        path.resolve(bridgeDir, '..', 'data', 'madden27', 'Franchise'),
        path.resolve(bridgeDir, '..', 'data', 'madden27', 'Franchise')
      ];
  const filteredCandidates = candidates.filter(Boolean);
  for (const candidate of filteredCandidates) {
    if (fs.existsSync(path.join(candidate, 'franchise-schemas.FTX'))) {
      return candidate;
    }
  }
  return filteredCandidates[filteredCandidates.length - 1];
}

const schemaFilesRoots = {
  college: pickSchemaFilesRoot('college'),
  madden: pickSchemaFilesRoot('madden')
};

function normalizeSchemaKey(value) {
  return String(value || '')
    .replace(/\.(ftx|xml)$/i, '')
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .toLowerCase();
}

function addSchemaMapEntry(fileMap, key, filePath) {
  const raw = String(key || '').replace(/\.(ftx|xml)$/i, '');
  if (!raw) return;
  fileMap[raw] = filePath;
  fileMap[raw.toLowerCase()] = filePath;
  fileMap[raw.replace(/\//g, '\\')] = filePath;
  fileMap[raw.replace(/\\/g, '/')] = filePath;
  fileMap[normalizeSchemaKey(raw)] = filePath;
  const base = path.basename(raw);
  fileMap[base] = filePath;
  fileMap[base.toLowerCase()] = filePath;
}

function walkSchemaFiles(rootDir) {
  const out = [];
  if (!rootDir || !fs.existsSync(rootDir)) return out;
  for (const entry of fs.readdirSync(rootDir, { withFileTypes: true })) {
    const entryPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkSchemaFiles(entryPath));
    } else if (/\.(ftx|xml)$/i.test(entry.name)) {
      out.push(entryPath);
    }
  }
  return out;
}

function buildSchemaFileMap(rootDir, mainPath) {
  const fileMap = { main: mainPath };
  for (const filePath of walkSchemaFiles(rootDir)) {
    const rel = path.relative(rootDir, filePath);
    addSchemaMapEntry(fileMap, rel, filePath);
    addSchemaMapEntry(fileMap, path.basename(filePath), filePath);
  }
  return fileMap;
}

function schemaMajorFromData(data) {
  if (data.length < 0x42) return null;
  if (data.subarray(0, 4).toString('ascii') === 'FrTk') {
    return data.readUInt32BE(0x2c);
  }
  return data.readUInt32LE(0x3e);
}

function detectSchemaFamily(inputPath) {
  const lower = path.basename(inputPath || '').toLowerCase();
  if (process.env.FORCE_CFB27_SCHEMAS === '1') return 'college';
  if (process.env.FORCE_MADDEN27_SCHEMAS === '1') return 'madden';
  if (lower.includes('dynasty')) return 'college';

  const raw = fs.readFileSync(inputPath);
  if (raw.length > 0x2a && raw[0x2a] === 0x37) return 'madden';
  let schemaMajor = schemaMajorFromData(raw);
  if (raw[0] === 0x78 && raw[1] === 0x9c) {
    try {
      const inflated = zlib.inflateSync(raw);
      schemaMajor = schemaMajorFromData(inflated);
    } catch {
      // The franchise reader will provide the detailed decompression error.
    }
  }
  // Map the schema major to a family. These checks must apply whether the payload is
  // still zlib-compressed (.FTC exports -> inflate to 773) OR already decompressed
  // (FrTk in-game save payloads from the FBCHUNKS unwrap, which read 773 directly).
  // Missing the decompressed 773 case left save payloads with NO schema applied, so
  // every field came back as the generic "Field_N" (team names/ratings showed 0).
  // College CFB27: 441 (FTC binary export) / 773 (FrTk save payload).
  // Madden 27:     525 / 850.
  if (schemaMajor === 441 || schemaMajor === 773) return 'college';
  if (schemaMajor === 525 || schemaMajor === 850) return 'madden';
  return null;
}

function readSchemaProfile(family, rootDir) {
  const mainPath = path.join(rootDir, 'franchise-schemas.FTX');
  const source = fs.readFileSync(mainPath, 'utf8').slice(0, 2048);
  const major = Number(/\bdataMajorVersion="(\d+)"/i.exec(source)?.[1]);
  const minor = Number(/\bdataMinorVersion="(\d+)"/i.exec(source)?.[1]);
  const databaseName = /\bdatabaseName="([^"]+)"/i.exec(source)?.[1] || '';
  const gameYear = Number(/(?:Madden|CollegeFB)(\d{2})/i.exec(databaseName)?.[1]);
  if (!Number.isInteger(major) || !Number.isInteger(minor) || !Number.isInteger(gameYear)) {
    fail(`Could not read ${family} schema metadata from ${mainPath}`);
  }
  return { family, rootDir, mainPath, major, minor, gameYear };
}

function buildOpenSettings(inputPath) {
  const family = detectSchemaFamily(inputPath);
  if (!family) {
    return undefined;
  }
  const rootDir = schemaFilesRoots[family];
  if (!rootDir) {
    fail(`${family === 'college' ? 'CFB 27' : 'Madden 27'} schema folder is not configured.`);
  }
  const mainPath = path.join(rootDir, 'franchise-schemas.FTX');
  if (!fs.existsSync(mainPath)) {
    fail(`${family === 'college' ? 'CFB 27' : 'Madden 27'} schema folder not found: ${rootDir}`);
  }
  const profile = readSchemaProfile(family, rootDir);
  return {
    schemaOverride: {
      gameYear: profile.gameYear,
      major: profile.major,
      minor: profile.minor,
      path: profile.mainPath
    },
    gameYearOverride: profile.gameYear,
    gameTypeOverride: family === 'college' ? 'college' : 'madden',
    useNewSchemaGeneration: true,
    schemaFileMap: buildSchemaFileMap(rootDir, profile.mainPath)
  };
}

async function openFranchiseFile(inputPath) {
  return FranchiseFile.create(inputPath, buildOpenSettings(inputPath));
}

const NFL_TEAM_INDEX_TO_CGID = {
  0: 0,
  1: 0,
  2: 0,
  3: 0,
  4: 0,
  7: 0,
  8: 0,
  9: 0,
  11: 0,
  16: 0,
  17: 0,
  21: 0,
  22: 0,
  24: 0,
  28: 0,
  29: 0,
  31: 0,
  5: 1,
  6: 1,
  10: 1,
  12: 1,
  13: 1,
  14: 1,
  15: 1,
  18: 1,
  19: 1,
  20: 1,
  23: 1,
  25: 1,
  26: 1,
  27: 1,
  30: 1
};

function fail(message) {
  console.error(message);
  process.exit(1);
}

function safeJson(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'bigint') return Number(value);
  if (Buffer.isBuffer(value)) return value.toString('hex');
  if (Array.isArray(value)) return value.map((entry) => safeJson(entry));
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    if ('tableId' in value && 'rowNumber' in value) {
      return {
        tableId: value.tableId ?? null,
        rowNumber: value.rowNumber ?? null
      };
    }
    try {
      return JSON.parse(JSON.stringify(value));
    } catch {
      return String(value);
    }
  }
  return String(value);
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function sanitizeSegment(value) {
  return String(value || 'TABLE').replace(/[^A-Za-z0-9_-]+/g, '_');
}

function pickPrimaryTeamTable(franchise) {
  const teamTables = franchise.getAllTablesByName('Team') || [];
  if (!teamTables.length) return null;
  return [...teamTables].sort((a, b) => (b.header?.recordCapacity ?? 0) - (a.header?.recordCapacity ?? 0))[0];
}

function tableAliasFor(table, primaryTeamUniqueId) {
  const actualName = String(table.header?.name || table.name || 'TABLE');
  const uniqueId = table.header?.uniqueId ?? table.header?.tablePad1 ?? table.index;
  if (actualName === 'Player') {
    return { name: 'PLAY', path: 'FRANCHISE.PLAY' };
  }
  if (actualName === 'CharacterVisuals') {
    return { name: 'CHVI', path: 'FRANCHISE.CHVI' };
  }
  if (actualName === 'Coach') {
    return { name: 'COCH', path: 'FRANCHISE.COCH' };
  }
  if (actualName === 'Team' && uniqueId === primaryTeamUniqueId) {
    return { name: 'TEAM', path: 'FRANCHISE.TEAM' };
  }
  if (actualName === 'Team') {
    return {
      name: `TEAM_${uniqueId}`,
      path: `FRANCHISE.${sanitizeSegment(actualName)}.${uniqueId}`
    };
  }
  const upper = actualName.toUpperCase();
  return {
    name: upper,
    path: `FRANCHISE.${sanitizeSegment(actualName)}.${uniqueId}`
  };
}

function franchiseLogoId(record) {
  const assetName = String(record.AssetName || '');
  if (assetName === 'AFCProBowl') return 34;
  if (assetName === 'NFCProBowl') return 33;
  if (record.TeamIndex === 32 && assetName === 'FreeAgents') return 32;
  if (record.TeamIndex !== null && record.TeamIndex !== undefined && Number.isFinite(Number(record.TeamIndex))) {
    return Number(record.TeamIndex);
  }
  return null;
}

function franchiseConferenceId(record) {
  const assetName = String(record.AssetName || '');
  if (assetName === 'FreeAgents' || assetName === 'Practice') return null;
  if (assetName === 'AFCProBowl') return 0;
  if (assetName === 'NFCProBowl') return 1;
  const teamIndex = Number(record.TeamIndex);
  if (Number.isFinite(teamIndex) && Object.prototype.hasOwnProperty.call(NFL_TEAM_INDEX_TO_CGID, teamIndex)) {
    return NFL_TEAM_INDEX_TO_CGID[teamIndex];
  }
  return null;
}

function addLegacyAliases(tableName, record, rowIndex) {
  if (tableName === 'TEAM') {
    const displayName = record.DisplayName ?? null;
    const longName = record.LongName === displayName ? null : (record.LongName ?? null);
    const logoId = franchiseLogoId(record);
    const cgid = franchiseConferenceId(record);
    record.TDNA = displayName;
    record.TDLN = longName;
    // TMNC is the team nickname (e.g. "Ducks"), NOT the display name. The franchise
    // schema stores it under NickName/NickNameAlt; falling back to displayName only
    // when no nickname exists keeps the header from showing "Oregon Oregon".
    record.TMNC = record.NickName ?? record.NickNameAlt ?? displayName;
    record.TDAN = record.AssetName ?? displayName;
    record.TABB = record.ShortName ?? null;
    record.TGID = record.TeamIndex ?? rowIndex;
    record.TROV = record.TEAM_RATINGOVR ?? null;
    record.TROF = record.TEAM_RATINGOFF ?? null;
    record.TRDE = record.TEAM_RATINGDEF ?? null;
    record.CGID = cgid;
    record.TLGO = logoId;
    record.TBCR = record.TEAM_BACKGROUNDCOLORR ?? record.HubBackgroundColorR ?? null;
    record.TBCG = record.TEAM_BACKGROUNDCOLORG ?? record.HubBackgroundColorG ?? null;
    record.TBCB = record.TEAM_BACKGROUNDCOLORB ?? record.HubBackgroundColorB ?? null;
    record.TB2R = record.TEAM_BACKGROUNDCOLORR2 ?? record.TEAM_LOGO_SECONDARYR ?? null;
    record.TB2G = record.TEAM_BACKGROUNDCOLORG2 ?? record.TEAM_LOGO_SECONDARYG ?? null;
    record.TB2B = record.TEAM_BACKGROUNDCOLORB2 ?? record.TEAM_LOGO_SECONDARYB ?? null;
  }
  if (tableName === 'PLAY') {
    record.PFID = rowIndex;
    record.PGID = rowIndex;
    record.PFNA = record.FirstName ?? null;
    record.PLNA = record.LastName ?? null;
    record.POVR = record.OverallRating ?? null;
    record.PPOS = record.Position ?? null;
    record.PJEN = record.JerseyNum ?? null;
    record.JNUM = record.JerseyNum ?? null;
    record.TGID = record.TeamIndex ?? null;
    // Bio fields for the Player Editor's Bio/Status section
    record.PHGT = record.Height ?? null;
    record.PWGT = record.Weight ?? null;
    record.PYEA = record.SchoolYear ?? record.YearsInLeague ?? null;
    record.PYRP = record.YearsInLeague ?? record.SchoolYear ?? null;
    record.PROL = record.TraitDevelopment ?? null;
    record.PINJ = record.InjuryStatus ?? null;
    record.PRSD = record.RedshirtStatus ?? null;
    record.PHTN = record.PLYR_PORTRAIT ?? null;
    record.PGHE = record.GenericHeadAssetName ?? null;
    record.PAGE = record.Age ?? null;
    record.PHAN = record.PLYR_HANDEDNESS ?? null;
    // Athleticism ratings
    record.PSPD = record.SpeedRating ?? null;
    record.PACC = record.AccelerationRating ?? null;
    record.PAGI = record.AgilityRating ?? null;
    record.PSTR = record.StrengthRating ?? null;
    record.PJMP = record.JumpingRating ?? null;
    record.PSTA = record.StaminaRating ?? null;
    record.PTGH = record.ToughnessRating ?? null;
    record.PAWR = record.AwarenessRating ?? null;
    record.PYCF = record.ConfidenceRating ?? null;
    // Passing ratings
    record.PTHP = record.ThrowPowerRating ?? null;
    record.PTAS = record.ThrowAccuracyShortRating ?? null;
    record.PTAM = record.ThrowAccuracyMidRating ?? null;
    record.PTAD = record.ThrowAccuracyDeepRating ?? null;
    record.PTHA = record.ThrowAccuracyRating ?? null;
    record.PTOR = record.ThrowOnTheRunRating ?? null;
    record.PTUP = record.ThrowUnderPressureRating ?? null;
    record.PPLA = record.PlayActionRating ?? null;
    // Ball carrier ratings
    record.PCAR = record.CarryingRating ?? null;
    record.PBCV = record.BCVisionRating ?? null;
    record.PBKT = record.BreakTackleRating ?? null;
    record.PELU = record.ChangeOfDirectionRating ?? null;
    record.PLJM = record.JukeMoveRating ?? null;
    record.PLSM = record.SpinMoveRating ?? null;
    record.PLTR = record.TruckingRating ?? null;
    record.PLSA = record.StiffArmRating ?? null;
    // Receiving ratings
    record.PCTH = record.CatchingRating ?? null;
    record.PCBT = record.CatchInTrafficRating ?? null;
    record.PLSC = record.SpectacularCatchRating ?? null;
    record.PDRR = record.DeepRouteRunningRating ?? null;
    record.PMRR = record.MediumRouteRunningRating ?? null;
    record.SRRN = record.ShortRouteRunningRating ?? null;
    record.PLRL = record.ReleaseRating ?? null;
    // Blocking ratings
    record.PPBK = record.PassBlockRating ?? null;
    record.PPBF = record.PassBlockFinesseRating ?? null;
    record.PPBS = record.PassBlockPowerRating ?? null;
    record.PRBK = record.RunBlockRating ?? null;
    record.PRBF = record.RunBlockFinesseRating ?? null;
    record.PRBS = record.RunBlockPowerRating ?? null;
    record.PLBK = record.LeadBlockRating ?? null;
    record.PLIB = record.ImpactBlockingRating ?? null;
    // Defense ratings
    record.PLMC = record.ManCoverageRating ?? null;
    record.PLZC = record.ZoneCoverageRating ?? null;
    record.PLPE = record.PressRating ?? null;
    record.PLPR = record.PlayRecognitionRating ?? null;
    record.PTAK = record.TackleRating ?? null;
    record.PLHT = record.HitPowerRating ?? null;
    record.PBSG = record.BlockSheddingRating ?? null;
    record.PLPU = record.PowerMovesRating ?? null;
    record.PFMS = record.FinesseMovesRating ?? null;
    record.PLPM = record.PursuitRating ?? null;
    record.PBSK = record.BreakSackRating ?? null;
    // Special teams ratings
    record.PKAC = record.KickAccuracyRating ?? null;
    record.PKPR = record.KickPowerRating ?? null;
    record.PKRT = record.KickReturnRating ?? null;
    record.PIMP = record.LongSnapRating ?? null;
  }
  if (tableName === 'COCH') {
    record.PFID = rowIndex;
    record.CFNM = record.FirstName ?? null;
    record.CLNM = record.LastName ?? null;
    // Name is the combined display name stored on the Coach record directly.
    record.CLNA = record.Name ?? null;
    record.CASN = record.AssetName ?? null;
    record.TGID = record.TeamIndex ?? null;
    record.CPID = record.Portrait ?? null;
    // Position maps to CoachPosition enum (HeadCoach, OffensiveCoordinator, etc.).
    record.CDTY = record.Position ?? null;
    // Career stats
    record.CCTI = record.CareerTies ?? null;
    // SeasonsWithTeam is the closest franchise equivalent to TDB years-with-team.
    record.CYCO = record.SeasonsWithTeam ?? null;
    // Ratings (COACH_ prefix fields in franchise schema)
    record.COTR = record.COACH_RATING ?? null;
    record.COTA = record.COACH_OFFENSE ?? null;
    record.CDTA = record.COACH_DEFENSE ?? null;
    record.CSTA = record.COACH_K ?? null;
    // Scheme / tendencies
    record.COFF = record.COACH_OFFTENDENCYRUNPASS ?? null;
    record.CDEF = record.COACH_DEFTENDENCYRUNPASS ?? null;
    record.CDEM = record.COACH_DEMEANOR ?? null;
    // Contract
    record.CSAL = record.ContractSalary ?? null;
    // Appearance
    record.CHGT = record.Height ?? null;
    record.CCBT = record.CharacterBodyType ?? null;
  }
}

function enumMembersFor(field) {
  const members = field?.enum?.members || [];
  return members
    .filter((member) => member?.name && member.name !== 'First_' && member.name !== 'Last_')
    .map((member) => ({
      label: member.name,
      value: member.name,
      rawValue: member.value ?? null,
      unformattedValue: member.unformattedValue ?? null
    }));
}

async function exportTableToJson(franchise, tableMeta, outputPath) {
  const table = franchise.getTableByUniqueId(tableMeta.unique_id);
  if (!table) fail(`Table not found: ${tableMeta.path}`);
  await table.readRecords();
  const fieldDefinitions = (table.offsetTable || []).map((field) => ({
    name: field.name,
    type: field.type,
    isReference: !!field.isReference,
    enumName: field.enum?.name ?? null,
    enumOptions: enumMembersFor(field)
  }));
  const records = table.records.map((sourceRecord, rowIndex) => {
    const record = {
      _index: rowIndex
    };
    if (sourceRecord.isEmpty) {
      record._isEmpty = true;
    }
    for (const field of table.offsetTable || []) {
      record[field.name] = safeJson(sourceRecord[field.name]);
    }
    addLegacyAliases(tableMeta.name, record, rowIndex);
    return record;
  });
  const payload = {
    name: tableMeta.name,
    actual_name: tableMeta.actual_name,
    path: tableMeta.path,
    unique_id: tableMeta.unique_id,
    table_id: tableMeta.table_id,
    field_definitions: fieldDefinitions,
    records
  };
  ensureDir(path.dirname(outputPath));
  fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2), 'utf8');
}

async function applyTableJson(franchise, tableMeta, jsonPath) {
  if (!fs.existsSync(jsonPath)) return { path: tableMeta.path, applied: 0, skipped: true };
  const table = franchise.getTableByUniqueId(tableMeta.unique_id);
  if (!table) return { path: tableMeta.path, applied: 0, skipped: true, reason: 'table not found' };
  await table.readRecords();
  const payload = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const records = payload.records || [];
  const fields = new Set((table.offsetTable || []).map((field) => field.name));
  let applied = 0;
  for (const sourceRecord of records) {
    const rowIndex = Number(sourceRecord._index);
    if (!Number.isInteger(rowIndex) || rowIndex < 0 || rowIndex >= table.records.length) continue;
    const targetRecord = table.records[rowIndex];
    if (!targetRecord || targetRecord.isEmpty) continue;
    for (const fieldName of fields) {
      if (!Object.prototype.hasOwnProperty.call(sourceRecord, fieldName)) continue;
      const nextValue = sourceRecord[fieldName];
      if (nextValue === null || nextValue === undefined) continue;
      try {
        targetRecord[fieldName] = nextValue;
        applied++;
      } catch {
        // Some generated/schema fields are read-only or expect opaque binary. Keep saving
        // resilient by preserving the original value if the library rejects the edit.
      }
    }
  }
  return { path: tableMeta.path, applied, skipped: false };
}

async function doSummary(inputPath, outDir, inputStem) {
  const franchise = await openFranchiseFile(inputPath);
  const primaryTeamTable = pickPrimaryTeamTable(franchise);
  const primaryTeamUniqueId = primaryTeamTable?.header?.uniqueId ?? null;
  const allTableMetas = franchise.tables.map((table) => {
    const alias = tableAliasFor(table, primaryTeamUniqueId);
    const actualName = String(table.header?.name || table.name || 'TABLE');
    const uniqueId = table.header?.uniqueId ?? table.index;
    const jsonFile = `${sanitizeSegment(alias.path)}.json`;
    return {
      path: alias.path,
      name: alias.name,
      actual_name: actualName,
      unique_id: uniqueId,
      table_id: table.header?.tableId ?? null,
      field_count: Array.isArray(table.schema?.attributes) ? table.schema.attributes.length : 0,
      record_capacity: table.header?.recordCapacity ?? 0,
      records_parsed: table.header?.recordCapacity ?? 0,
      json_file: jsonFile,
      csv_file: `${sanitizeSegment(alias.path)}.csv`
    };
  });
  // When multiple source tables map to the same alias (e.g. several "Coach" tables all
  // becoming COCH), keep the one with the highest record_capacity as the canonical entry
  // so find_table() and the preload export both target the main data table.
  const canonicalByPath = new Map();
  for (const meta of allTableMetas) {
    const existing = canonicalByPath.get(meta.path);
    if (!existing || meta.record_capacity > existing.record_capacity) {
      canonicalByPath.set(meta.path, meta);
    }
  }
  const tables = Array.from(canonicalByPath.values());
  const summary = {
    parser: 'madden-franchise',
    game_year: franchise.gameYear,
    file_type: franchise.type,
    table_count: tables.length,
    warnings: [],
    tables
  };
  ensureDir(outDir);
  fs.writeFileSync(path.join(outDir, `${inputStem}_summary.json`), JSON.stringify(summary, null, 2), 'utf8');

  // Pre-export the small tables the editors open first (TEAM drives the default
  // Team Editor view, COCH the Coaches view) while the franchise is already parsed in
  // memory. Otherwise the first editor request triggers a fresh ~30s franchise open on
  // demand and the UI hangs at "Loading...". PLAY is intentionally excluded — it is
  // large and would add minutes to file open; it stays lazy (exported on first
  // Player Editor open).
  const EDITOR_PRELOAD_TABLES = new Set(['TEAM', 'COCH']);
  for (const tableMeta of tables) {
    if (!EDITOR_PRELOAD_TABLES.has(String(tableMeta.name).toUpperCase())) continue;
    if (!tableMeta.json_file) continue;
    try {
      await exportTableToJson(franchise, tableMeta, path.join(outDir, tableMeta.json_file));
    } catch {
      // Non-fatal: the table can still be exported lazily on demand later.
    }
  }
}

async function doExportTable(inputPath, tableMetaPath, outputPath) {
  const tableMeta = JSON.parse(fs.readFileSync(tableMetaPath, 'utf8'));
  const franchise = await openFranchiseFile(inputPath);
  await exportTableToJson(franchise, tableMeta, outputPath);
}

async function doSave(inputPath, summaryPath, parseDir, outputPath) {
  const franchise = await openFranchiseFile(inputPath);
  const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
  const results = [];
  for (const tableMeta of summary.tables || []) {
    const jsonFile = tableMeta.json_file;
    if (!jsonFile) continue;
    const jsonPath = path.join(parseDir, jsonFile);
    results.push(await applyTableJson(franchise, tableMeta, jsonPath));
  }
  if (!franchise.packedFileContents) {
    franchise.packedFileContents = franchise.rawContents;
  }
  ensureDir(path.dirname(outputPath));
  await franchise.save(outputPath, { sync: true });
  fs.writeFileSync(`${outputPath}.save-summary.json`, JSON.stringify({ outputPath, tables: results }, null, 2), 'utf8');
}

try {
  if (command === 'summary') {
    const [, , , inputPath, outDir, inputStem] = process.argv;
    if (!inputPath || !outDir || !inputStem) fail('Usage: summary <inputPath> <outDir> <inputStem>');
    await doSummary(inputPath, outDir, inputStem);
    process.exit(0);
  }
  if (command === 'export-table') {
    const [, , , inputPath, tableMetaPath, outputPath] = process.argv;
    if (!inputPath || !tableMetaPath || !outputPath) fail('Usage: export-table <inputPath> <tableMetaPath> <outputPath>');
    await doExportTable(inputPath, tableMetaPath, outputPath);
    process.exit(0);
  }
  if (command === 'save') {
    const [, , , inputPath, summaryPath, parseDir, outputPath] = process.argv;
    if (!inputPath || !summaryPath || !parseDir || !outputPath) fail('Usage: save <inputPath> <summaryPath> <parseDir> <outputPath>');
    await doSave(inputPath, summaryPath, parseDir, outputPath);
    process.exit(0);
  }
  fail(`Unknown command: ${command}`);
} catch (error) {
  fail(error?.stack || error?.message || String(error));
}
