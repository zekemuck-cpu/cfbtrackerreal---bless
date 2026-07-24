const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { pathToFileURL } = require('url');
const pkg = require('./package.json');

const APP_ROOT = __dirname;
const PORTABLE_ROOT = app.isPackaged ? path.dirname(process.execPath) : APP_ROOT;
const RUNTIME_ROOT = app.isPackaged ? path.join(PORTABLE_ROOT, 'data') : APP_ROOT;
const ROOT = RUNTIME_ROOT;
function firstExistingPath(candidates, fallback) {
  return candidates.find((candidate) => candidate && fs.existsSync(candidate)) || fallback || candidates[0];
}

function firstAssetRoot(candidates, fallback) {
  return candidates.find((candidate) => (
    candidate &&
    fs.existsSync(path.join(candidate, 'team-logos')) &&
    fs.existsSync(path.join(candidate, 'Player_Portraits'))
  )) || firstExistingPath(candidates, fallback);
}

const APP_RUNTIME_DIR = process.env.RECRUIT_RUNTIME_ROOT || path.join(APP_ROOT, 'runtime');
const APP_NAME = 'Recruit Overhaul 27';
const APP_RELEASE_LABEL = 'Beta 1';
const APP_WINDOW_TITLE = `${APP_NAME} ${APP_RELEASE_LABEL}`;
const DATA_PATH = path.join(ROOT, 'recruiting-data.json');
const CSV_PATH = path.join(ROOT, 'recruiting-data.csv');
const REPORT_PATH = path.join(ROOT, 'recruit-overhaul-report.txt');
const GENERATOR_PATH = path.join(APP_ROOT, 'build-recruiting-table.mjs');
const PARSE_DIR = path.join(ROOT, 'scratch', 'dynasty_parse');
const APP_ASSETS_ROOT = process.env.RECRUIT_ASSETS_ROOT || path.join(APP_ROOT, 'assets');
const FRANCHISE_BRIDGE_PATH = path.join(APP_RUNTIME_DIR, 'tools', 'madden_franchise_bridge.mjs');
const MADDEN_FRANCHISE_ROOT = path.join(APP_RUNTIME_DIR, 'vendor', 'madden-franchise');
const CFB27_SCHEMA_ROOT = path.join(APP_RUNTIME_DIR, 'data', 'cfb27', 'Dynasty_Files');
const SKIN_TONE_SETTINGS_PATH = path.join(ROOT, 'skin-tone-settings.json');
const NAME_WEIGHTS_PATH = path.join(ROOT, 'weightedNamePools.json');
const OVR_WEIGHTS_PATH = path.join(APP_RUNTIME_DIR, 'data', 'cfb27', 'CFB27 OVR Weights Archetypes.json');
const PLAYER_PORTRAITS_DIR = path.join(APP_ASSETS_ROOT, 'Player_Portraits');
const RAW_TABLE_SPECS = Object.freeze({
  recruit: {
    label: 'Recruit',
    fileName: 'FRANCHISE_Recruit_1873209313.json',
    purpose: 'Raw recruit rank, class, stage, offers, commit score, and TopSchoolsList reference.'
  },
  player: {
    label: 'PLAY',
    fileName: 'FRANCHISE_PLAY.json',
    purpose: 'Raw player names, ratings, portraits, position, hometown, height, weight, star rating, and base NIL value.'
  },
  userRecruitTarget: {
    label: 'UserRecruitTarget',
    fileName: 'FRANCHISE_UserRecruitTarget_3987156317.json',
    purpose: 'Raw user board, scholarship, recruiting hours, influence, NIL, and action fields.'
  },
  prospectTargetSchoolArray: {
    label: 'ProspectTargetSchool[]',
    fileName: 'FRANCHISE_ProspectTargetSchool__2332540366.json',
    purpose: 'Raw ten-slot school-reference array used by Recruit.TopSchoolsList.'
  },
  prospectTargetSchool: {
    label: 'ProspectTargetSchool',
    fileName: 'FRANCHISE_ProspectTargetSchool_3789266353.json',
    purpose: 'Raw TeamId and TeamInfluence rows referenced by ProspectTargetSchool[].'
  },
  team: {
    label: 'Team',
    fileName: 'FRANCHISE_TEAM.json',
    purpose: 'Raw save-specific Team rows used to map ProspectTargetSchool.TeamId through Team.TeamIndex.'
  },
  positionSignatureAbilityArray: {
    label: 'PositionSignatureAbility[]',
    fileName: 'FRANCHISE_PositionSignatureAbility__98263752.json',
    purpose: 'Raw signature-ability reference array discovered from the native dynasty table index.'
  },
  positionToAbilityTable: {
    label: 'PositionToAbilityTable',
    fileName: 'FRANCHISE_PositionToAbilityTable_2459081317.json',
    purpose: 'Raw position-to-ability tuning table used while tracing physical ability slot mapping.'
  }
});
const POSITION_ORDER = [
  'QB', 'HB', 'RB', 'FB', 'WR', 'TE',
  'LT', 'LG', 'C', 'RG', 'RT',
  'LE', 'RE', 'DT',
  'LOLB', 'MLB', 'ROLB',
  'CB', 'FS', 'SS',
  'K', 'P', 'ATH'
];

let mainWindow = null;

app.setName(APP_NAME);

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1800,
    height: 1000,
    minWidth: 1800,
    maxWidth: 1800,
    minHeight: 1000,
    maxHeight: 1000,
    resizable: false,
    maximizable: false,
    center: true,
    autoHideMenuBar: true,
    backgroundColor: '#101010',
    title: APP_WINDOW_TITLE,
    icon: path.join(APP_ROOT, 'assets', 'ro27-icon.png'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      preload: path.join(APP_ROOT, 'electron-preload.cjs')
    }
  });

  mainWindow.loadFile(path.join(APP_ROOT, 'electron-index.html'));
}

function seedRuntimeFile(fileName) {
  const targetPath = path.join(ROOT, fileName);
  if (fs.existsSync(targetPath)) return;
  const sourcePath = path.join(APP_ROOT, fileName);
  if (!fs.existsSync(sourcePath)) return;
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.copyFileSync(sourcePath, targetPath);
}

function ensureRuntimeData() {
  fs.mkdirSync(ROOT, { recursive: true });
  [
    'recruiting-data.json',
    'recruiting-data.csv',
    'recruit-overhaul-report.txt',
    'skin-tone-settings.json',
    'weightedNamePools.json',
    'physical-ability-slot-map.json'
  ].forEach(seedRuntimeFile);
}

function readRecruitingData() {
  const raw = fs.readFileSync(DATA_PATH, 'utf8');
  const payload = JSON.parse(raw);
  const dataStat = fs.statSync(DATA_PATH);
  const csvStat = fs.existsSync(CSV_PATH) ? fs.statSync(CSV_PATH) : null;
  return {
    ...payload,
    files: {
      dataPath: DATA_PATH,
      csvPath: CSV_PATH,
      reportPath: REPORT_PATH,
      assetBaseUrl: app.isPackaged ? '' : pathToFileURL(`${APP_ASSETS_ROOT}${path.sep}`).href,
      dataModified: dataStat.mtime.toISOString(),
      csvModified: csvStat ? csvStat.mtime.toISOString() : null
    }
  };
}

function rawColumnsFor(table) {
  const columns = [];
  const seen = new Set();
  const add = (name) => {
    const key = String(name || '').trim();
    if (!key || seen.has(key)) return;
    seen.add(key);
    columns.push(key);
  };
  add('_index');
  for (const field of table.field_definitions || []) add(field.name);
  for (const row of table.records || []) {
    for (const key of Object.keys(row || {})) add(key);
  }
  return columns;
}

function readRawTable(key) {
  const spec = RAW_TABLE_SPECS[key];
  if (!spec) {
    return { ok: false, error: `Unknown raw table: ${key}` };
  }
  const tablePath = path.join(PARSE_DIR, spec.fileName);
  if (!fs.existsSync(tablePath)) {
    return { ok: false, error: `${spec.label} has not been exported yet. Select a dynasty file first.` };
  }
  const table = JSON.parse(fs.readFileSync(tablePath, 'utf8'));
  const rows = Array.isArray(table.records) ? table.records : [];
  const columns = rawColumnsFor(table);
  return {
    ok: true,
    key,
    label: spec.label,
    purpose: spec.purpose,
    fileName: spec.fileName,
    sourcePath: tablePath,
    recordCount: rows.length,
    columnCount: columns.length,
    columns,
    rows
  };
}

function readOvrWeights() {
  const payload = JSON.parse(fs.readFileSync(OVR_WEIGHTS_PATH, 'utf8'));
  return {
    ok: true,
    path: OVR_WEIGHTS_PATH,
    archetypes: Array.isArray(payload.archetypes) ? payload.archetypes : []
  };
}

function portraitBodyTypeFromPath(filePath) {
  return path.basename(path.dirname(filePath));
}

function packagedAssetPath(fullPath) {
  return `assets/${path.relative(APP_ASSETS_ROOT, fullPath).replace(/\\/g, '/')}`;
}

function readPortraitManifest() {
  const skinFolders = [
    { skinTone: 'Light', folder: 'LightGeneric' },
    { skinTone: 'Medium', folder: 'MediumGeneric' },
    { skinTone: 'Dark', folder: 'DarkGeneric' }
  ];
  const bySkinBody = {};
  let total = 0;
  for (const { skinTone, folder } of skinFolders) {
    const folderPath = path.join(PLAYER_PORTRAITS_DIR, folder);
    bySkinBody[skinTone] = {};
    if (!fs.existsSync(folderPath)) continue;
    const stack = [folderPath];
        while (stack.length) {
          const current = stack.pop();
          for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
            const fullPath = path.join(current, entry.name);
        if (entry.isDirectory()) {
          stack.push(fullPath);
          continue;
        }
            if (!entry.isFile() || !/\.webp$/i.test(entry.name)) continue;
            const idMatch = entry.name.match(/nilpp_Generic_(\d+)/i);
            if (!idMatch) continue;
            const genericHeadAssetName = entry.name.replace(/^nilpp_/i, '').replace(/\.webp$/i, '');
            const bodyType = portraitBodyTypeFromPath(fullPath);
            if (!bySkinBody[skinTone][bodyType]) bySkinBody[skinTone][bodyType] = [];
            const id = idMatch[1];
            bySkinBody[skinTone][bodyType].push({
              id,
              headId: id,
              portraitId: Number(id),
              genericHeadAssetName,
              fileName: entry.name,
              skinTone,
              bodyType,
          path: packagedAssetPath(fullPath)
        });
        total += 1;
      }
    }
    Object.values(bySkinBody[skinTone]).forEach((list) => {
      list.sort((a, b) => a.portraitId - b.portraitId);
    });
  }
  return { ok: true, path: PLAYER_PORTRAITS_DIR, total, bySkinBody };
}

function sendLoadProgress(update) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const payload = update && typeof update === 'object'
    ? {
        message: String(update.message || 'Loading dynasty...'),
        percent: Number.isFinite(Number(update.percent)) ? Math.max(0, Math.min(100, Math.round(Number(update.percent)))) : null
      }
    : { message: String(update || 'Loading dynasty...'), percent: null };
  mainWindow.webContents.send('recruiting:load-progress', payload);
}

function assertInsideRoot(targetPath) {
  const rootPath = path.resolve(ROOT);
  const resolved = path.resolve(targetPath);
  if (resolved !== rootPath && !resolved.startsWith(`${rootPath}${path.sep}`)) {
    throw new Error(`Refusing to write outside workspace: ${resolved}`);
  }
  return resolved;
}

function resetParseDir() {
  const parsePath = assertInsideRoot(PARSE_DIR);
  if (fs.existsSync(parsePath)) {
    fs.rmSync(parsePath, { recursive: true, force: true });
  }
  fs.mkdirSync(parsePath, { recursive: true });
}

function runNodeScript(args, options = {}) {
  return new Promise((resolve) => {
    const runner = app.isPackaged ? process.execPath : 'node';
    const child = spawn(runner, args, {
      cwd: ROOT,
      windowsHide: true,
      env: {
        ...process.env,
        ...(app.isPackaged ? { ELECTRON_RUN_AS_NODE: '1' } : {}),
        RECRUIT_SOURCE_ROOT: APP_ROOT,
        RECRUIT_DATA_ROOT: ROOT,
        RECRUIT_RUNTIME_ROOT: APP_RUNTIME_DIR,
        RECRUIT_ASSETS_ROOT: APP_ASSETS_ROOT,
        MADDEN_FRANCHISE_ROOT,
        CFB27_DYNASTY_FILES_ROOT: CFB27_SCHEMA_ROOT,
        FORCE_CFB27_SCHEMAS: '1',
        ...(options.env || {})
      }
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', (error) => {
      resolve({ ok: false, error: error.message, stdout, stderr });
    });
    child.on('close', (code) => {
      resolve({ ok: code === 0, code, stdout, stderr });
    });
  });
}

function runGenerator(sourceFile = '') {
  if (!fs.existsSync(GENERATOR_PATH)) {
    return Promise.resolve({ ok: false, error: 'Generator script is missing.' });
  }
  return runNodeScript([
    '--preserve-symlinks',
    '--preserve-symlinks-main',
    GENERATOR_PATH
  ], {
    env: sourceFile ? { RECRUIT_SOURCE_FILE: path.basename(sourceFile) } : {}
  }).then((result) => ({
    ...result,
    data: result.ok ? readRecruitingData() : null
  }));
}

function dynastyFileSort(a, b) {
  const modifiedDiff = Date.parse(b.modifiedAt) - Date.parse(a.modifiedAt);
  return modifiedDiff || a.name.localeCompare(b.name, undefined, { numeric: true });
}

function isLikelyDynastyFile(filePath, stat) {
  const name = path.basename(filePath);
  if (!stat.isFile()) return false;
  return /^DYNASTY(?:$|[-_.\s])/i.test(name);
}

function listDynastyFolder(folderPath) {
  const resolved = path.resolve(String(folderPath || ''));
  if (!resolved || !fs.existsSync(resolved)) {
    return { ok: false, error: 'Dynasty folder does not exist.', folderPath: resolved };
  }
  const stat = fs.statSync(resolved);
  if (!stat.isDirectory()) {
    return { ok: false, error: 'Dynasty folder path is not a folder.', folderPath: resolved };
  }
  const files = fs.readdirSync(resolved, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /^DYNASTY(?:$|[-_.\s])/i.test(entry.name))
    .map((entry) => {
      const filePath = path.join(resolved, entry.name);
      const fileStat = fs.statSync(filePath);
      return {
        name: entry.name,
        path: filePath,
        size: fileStat.size,
        modifiedAt: fileStat.mtime.toISOString()
      };
    })
    .sort(dynastyFileSort);
  return { ok: true, folderPath: resolved, files };
}

function summaryPathFor(inputPath) {
  return path.join(PARSE_DIR, `${path.parse(inputPath).name}_summary.json`);
}

function pickRequiredTables(summary) {
  const tables = summary.tables || [];
  const byJson = new Map(tables.map((table) => [table.json_file, table]));
  const pickLargest = (predicate) => tables
    .filter(predicate)
    .sort((a, b) => (b.record_capacity || 0) - (a.record_capacity || 0))[0];
  return [
    {
      label: 'PLAY',
      output: 'FRANCHISE_PLAY.json',
      table: byJson.get('FRANCHISE_PLAY.json') || pickLargest((table) => table.path === 'FRANCHISE.PLAY' || table.name === 'PLAY')
    },
    {
      label: 'Recruit',
      output: 'FRANCHISE_Recruit_1873209313.json',
      table: byJson.get('FRANCHISE_Recruit_1873209313.json') || pickLargest((table) => table.actual_name === 'Recruit')
    },
    {
      label: 'User Recruit Target',
      output: 'FRANCHISE_UserRecruitTarget_3987156317.json',
      table: byJson.get('FRANCHISE_UserRecruitTarget_3987156317.json') || pickLargest((table) => table.actual_name === 'UserRecruitTarget')
    },
    {
      label: 'Prospect Target School Array',
      output: 'FRANCHISE_ProspectTargetSchool__2332540366.json',
      table: byJson.get('FRANCHISE_ProspectTargetSchool__2332540366.json') || pickLargest((table) => table.actual_name === 'ProspectTargetSchool[]')
    },
    {
      label: 'Prospect Target School',
      output: 'FRANCHISE_ProspectTargetSchool_3789266353.json',
      table: byJson.get('FRANCHISE_ProspectTargetSchool_3789266353.json') || pickLargest((table) => table.actual_name === 'ProspectTargetSchool')
    },
    {
      label: 'Team',
      output: 'FRANCHISE_TEAM.json',
      table: byJson.get('FRANCHISE_TEAM.json') || pickLargest((table) => (
        table.path === 'FRANCHISE.TEAM' ||
        (table.actual_name === 'Team' && (table.record_capacity || table.record_count || 0) > 100)
      ))
    },
    {
      label: 'Position Signature Ability Array',
      output: 'FRANCHISE_PositionSignatureAbility__98263752.json',
      table: byJson.get('FRANCHISE_PositionSignatureAbility__98263752.json') || pickLargest((table) => table.actual_name === 'PositionSignatureAbility[]')
    },
    {
      label: 'Position To Ability Table',
      output: 'FRANCHISE_PositionToAbilityTable_2459081317.json',
      table: byJson.get('FRANCHISE_PositionToAbilityTable_2459081317.json') || pickLargest((table) => table.actual_name === 'PositionToAbilityTable')
    }
  ];
}

async function exportRequiredTables(inputPath, summary, notify = () => {}) {
  const specs = pickRequiredTables(summary);
  const total = Math.max(1, specs.length);
  for (const [index, spec] of specs.entries()) {
    if (!spec.table) {
      throw new Error(`Missing required dynasty table: ${spec.label}`);
    }
    notify({
      message: 'Extracting dynasty data...',
      percent: 30 + Math.round((index / total) * 45)
    });
    const metaPath = path.join(PARSE_DIR, `${spec.output.replace(/\.json$/i, '')}.table-meta.json`);
    const outputPath = path.join(PARSE_DIR, spec.output);
    fs.writeFileSync(metaPath, JSON.stringify(spec.table, null, 2), 'utf8');
    const result = await runNodeScript([
      '--preserve-symlinks',
      '--preserve-symlinks-main',
      FRANCHISE_BRIDGE_PATH,
      'export-table',
      inputPath,
      metaPath,
      outputPath
    ]);
    if (!result.ok) {
      throw new Error(`Could not export ${spec.label}: ${result.error || result.stderr || `exit ${result.code}`}`);
    }
  }
  notify({ message: 'Extracting dynasty data...', percent: 75 });
}

async function loadDynastyFile(inputPath) {
  if (!fs.existsSync(FRANCHISE_BRIDGE_PATH)) {
    return { ok: false, error: 'Franchise bridge is missing.' };
  }
  sendLoadProgress({ message: 'Preparing dynasty...', percent: 5 });
  resetParseDir();
  const stem = path.parse(inputPath).name;
  sendLoadProgress({ message: 'Scanning dynasty...', percent: 15 });
  const summaryResult = await runNodeScript([
    '--preserve-symlinks',
    '--preserve-symlinks-main',
    FRANCHISE_BRIDGE_PATH,
    'summary',
    inputPath,
    PARSE_DIR,
    stem
  ]);
  if (!summaryResult.ok) {
    return { ok: false, error: summaryResult.error || summaryResult.stderr || `exit ${summaryResult.code}`, stdout: summaryResult.stdout, stderr: summaryResult.stderr };
  }
  sendLoadProgress({ message: 'Finding recruit data...', percent: 25 });
  const summary = JSON.parse(fs.readFileSync(summaryPathFor(inputPath), 'utf8'));
  try {
    await exportRequiredTables(inputPath, summary, sendLoadProgress);
  } catch (error) {
    return { ok: false, error: error.message };
  }
  sendLoadProgress({ message: 'Building recruit class...', percent: 85 });
  const buildResult = await runGenerator(inputPath);
  if (!buildResult.ok) {
    return { ok: false, error: buildResult.error || buildResult.stderr || `exit ${buildResult.code}`, stdout: buildResult.stdout, stderr: buildResult.stderr };
  }
  sendLoadProgress({ message: 'Rendering recruits...', percent: 95 });
  return {
    ok: true,
    selectedPath: inputPath,
    selectedFile: path.basename(inputPath),
    data: buildResult.data
  };
}

function timestampForFileName(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, '').replace('T', '-');
}

function tempSavePathFor(inputPath) {
  const parsed = path.parse(inputPath);
  return path.join(parsed.dir, `${parsed.base}.recruit-overhaul-${Date.now()}.tmp`);
}

function backupPathFor(inputPath) {
  const parsed = path.parse(inputPath);
  return path.join(parsed.dir, 'RecruitOverhaulBackups', `${parsed.base}.backup-${timestampForFileName()}`);
}

function isAllowedPlayerSaveField(field) {
  const name = String(field || '');
  return (
    ['FirstName', 'LastName', 'Height', 'Weight', 'GenericHeadAssetName', 'PLYR_PORTRAIT', 'TraitDevelopment'].includes(name) ||
    /^[A-Za-z0-9_]+Rating$/.test(name) ||
    /^PhysicalAbility[1-5]$/.test(name) ||
    /^MentalAbilityRank[1-3]$/.test(name)
  );
}

function applyPlayerSaveRowsToParseTable(playerRows, workDir) {
  const sourceTablePath = path.join(PARSE_DIR, 'FRANCHISE_PLAY.json');
  if (!fs.existsSync(sourceTablePath)) {
    throw new Error('PLAY table has not been exported. Load the dynasty file before saving.');
  }
  const sourceTable = JSON.parse(fs.readFileSync(sourceTablePath, 'utf8'));
  const sourceRecords = Array.isArray(sourceTable.records) ? sourceTable.records : [];
  const records = [];
  let changedRows = 0;
  let changedFields = 0;
  const skippedFields = [];

  for (const change of Array.isArray(playerRows) ? playerRows : []) {
    const rowIndex = Number(change?.rowIndex);
    if (!Number.isInteger(rowIndex) || rowIndex < 0 || rowIndex >= sourceRecords.length) {
      continue;
    }
    const sourceRecord = sourceRecords[rowIndex];
    if (!sourceRecord || sourceRecord._isEmpty) continue;
    const fields = change?.fields && typeof change.fields === 'object' ? change.fields : {};
    const minimalRecord = { _index: rowIndex };
    let rowChanged = false;
    for (const [field, nextValue] of Object.entries(fields)) {
      if (!isAllowedPlayerSaveField(field) || !Object.prototype.hasOwnProperty.call(sourceRecord, field)) {
        skippedFields.push(field);
        continue;
      }
      if (nextValue === null || nextValue === undefined) continue;
      if (String(sourceRecord[field] ?? '') === String(nextValue)) continue;
      minimalRecord[field] = nextValue;
      changedFields += 1;
      rowChanged = true;
    }
    if (rowChanged) {
      records.push(minimalRecord);
      changedRows += 1;
    }
  }

  if (!changedFields) {
    return { changedRows, changedFields, skippedFields };
  }
  fs.mkdirSync(workDir, { recursive: true });
  fs.writeFileSync(path.join(workDir, 'FRANCHISE_PLAY.json'), JSON.stringify({ records }), 'utf8');
  return { changedRows, changedFields, skippedFields };
}

function applyRecruitSaveRowsToParseTable(recruitRows, workDir) {
  const sourceTablePath = path.join(PARSE_DIR, 'FRANCHISE_Recruit_1873209313.json');
  if (!fs.existsSync(sourceTablePath)) {
    throw new Error('Recruit table has not been exported. Load the dynasty file before saving.');
  }
  const sourceTable = JSON.parse(fs.readFileSync(sourceTablePath, 'utf8'));
  const sourceRecords = Array.isArray(sourceTable.records) ? sourceTable.records : [];
  const records = [];
  let changedRows = 0;
  let changedFields = 0;
  const skippedFields = [];

  for (const change of Array.isArray(recruitRows) ? recruitRows : []) {
    const rowIndex = Number(change?.rowIndex);
    if (!Number.isInteger(rowIndex) || rowIndex < 0 || rowIndex >= sourceRecords.length) {
      continue;
    }
    const sourceRecord = sourceRecords[rowIndex];
    if (!sourceRecord || sourceRecord._isEmpty) continue;
    const fields = change?.fields && typeof change.fields === 'object' ? change.fields : {};
    const minimalRecord = { _index: rowIndex };
    let rowChanged = false;
    for (const [field, nextValue] of Object.entries(fields)) {
      if (field !== 'QualityModifier' || !Object.prototype.hasOwnProperty.call(sourceRecord, field)) {
        skippedFields.push(field);
        continue;
      }
      if (nextValue === null || nextValue === undefined) continue;
      if (String(sourceRecord[field] ?? '') === String(nextValue)) continue;
      minimalRecord[field] = nextValue;
      changedFields += 1;
      rowChanged = true;
    }
    if (rowChanged) {
      records.push(minimalRecord);
      changedRows += 1;
    }
  }

  if (!changedFields) {
    return { changedRows, changedFields, skippedFields };
  }
  fs.mkdirSync(workDir, { recursive: true });
  fs.writeFileSync(path.join(workDir, 'FRANCHISE_Recruit_1873209313.json'), JSON.stringify({ records }), 'utf8');
  return { changedRows, changedFields, skippedFields };
}

async function savePreviewChanges(payload = {}) {
  if (!fs.existsSync(FRANCHISE_BRIDGE_PATH)) {
    return { ok: false, error: 'Franchise bridge is missing.' };
  }
  const inputPath = path.resolve(String(payload.dynastyPath || ''));
  if (!inputPath || !fs.existsSync(inputPath) || !fs.statSync(inputPath).isFile()) {
    return { ok: false, error: 'Selected dynasty file does not exist.' };
  }
  if (!isLikelyDynastyFile(inputPath, fs.statSync(inputPath))) {
    return { ok: false, error: 'Only DYNASTY files can be saved.' };
  }
  const playerRows = Array.isArray(payload.playerRows) ? payload.playerRows : [];
  const recruitRows = Array.isArray(payload.recruitRows) ? payload.recruitRows : [];
  if (!playerRows.length && !recruitRows.length) {
    return { ok: false, error: 'No calculated changes were provided.' };
  }
  const summaryPath = summaryPathFor(inputPath);
  if (!fs.existsSync(summaryPath)) {
    return { ok: false, error: 'Selected dynasty summary is missing. Reload the dynasty file before saving.' };
  }

  let applied = null;
  let recruitApplied = null;
  let backupPath = '';
  let tempOutputPath = '';
  const saveWorkDir = path.join(PARSE_DIR, `_save_work_${Date.now()}`);
  try {
    applied = playerRows.length
      ? applyPlayerSaveRowsToParseTable(playerRows, saveWorkDir)
      : { changedRows: 0, changedFields: 0, skippedFields: [] };
    recruitApplied = recruitRows.length
      ? applyRecruitSaveRowsToParseTable(recruitRows, saveWorkDir)
      : { changedRows: 0, changedFields: 0, skippedFields: [] };
    const totalChangedFields = applied.changedFields + recruitApplied.changedFields;
    if (!totalChangedFields) {
      return { ok: false, error: 'No calculated changes were different from the loaded save.' };
    }

    backupPath = backupPathFor(inputPath);
    fs.mkdirSync(path.dirname(backupPath), { recursive: true });
    fs.copyFileSync(inputPath, backupPath);
    tempOutputPath = tempSavePathFor(inputPath);
    const saveResult = await runNodeScript([
      '--preserve-symlinks',
      '--preserve-symlinks-main',
      FRANCHISE_BRIDGE_PATH,
      'save',
      inputPath,
      summaryPath,
      saveWorkDir,
      tempOutputPath
    ]);
    if (!saveResult.ok) {
      throw new Error(saveResult.error || saveResult.stderr || `exit ${saveResult.code}`);
    }
    if (!fs.existsSync(tempOutputPath)) {
      throw new Error('Franchise bridge did not create a saved output file.');
    }
    fs.copyFileSync(tempOutputPath, inputPath);
    fs.rmSync(tempOutputPath, { force: true });
    fs.rmSync(`${tempOutputPath}.save-summary.json`, { force: true });
    return {
      ok: true,
      outputPath: inputPath,
      backupPath,
      changedRows: applied.changedRows + recruitApplied.changedRows,
      changedFields: totalChangedFields,
      playerChangedRows: applied.changedRows,
      recruitChangedRows: recruitApplied.changedRows,
      skippedFields: Array.from(new Set([
        ...applied.skippedFields,
        ...recruitApplied.skippedFields
      ])).slice(0, 20)
    };
  } catch (error) {
    if (tempOutputPath && fs.existsSync(tempOutputPath)) {
      try {
        fs.rmSync(tempOutputPath, { force: true });
      } catch {
        // Non-fatal cleanup best effort.
      }
    }
    if (tempOutputPath && fs.existsSync(`${tempOutputPath}.save-summary.json`)) {
      try {
        fs.rmSync(`${tempOutputPath}.save-summary.json`, { force: true });
      } catch {
        // Non-fatal cleanup best effort.
      }
    }
    return { ok: false, error: error.message, backupPath };
  } finally {
    if (fs.existsSync(saveWorkDir)) {
      try {
        fs.rmSync(saveWorkDir, { recursive: true, force: true });
      } catch {
        // Non-fatal cleanup best effort.
      }
    }
  }
}

function defaultSkinToneSettings() {
  const baselines = {
    QB: { light: 50, medium: 27, dark: 23 },
    HB: { light: 20, medium: 30, dark: 50 },
    RB: { light: 20, medium: 30, dark: 50 },
    FB: { light: 38, medium: 30, dark: 32 },
    WR: { light: 18, medium: 30, dark: 52 },
    TE: { light: 42, medium: 31, dark: 27 },
    LT: { light: 46, medium: 29, dark: 25 },
    LG: { light: 48, medium: 29, dark: 23 },
    C: { light: 50, medium: 30, dark: 20 },
    RG: { light: 48, medium: 29, dark: 23 },
    RT: { light: 46, medium: 29, dark: 25 },
    LE: { light: 24, medium: 31, dark: 45 },
    RE: { light: 24, medium: 31, dark: 45 },
    DT: { light: 22, medium: 30, dark: 48 },
    LOLB: { light: 28, medium: 31, dark: 41 },
    MLB: { light: 30, medium: 31, dark: 39 },
    ROLB: { light: 28, medium: 31, dark: 41 },
    CB: { light: 18, medium: 29, dark: 53 },
    FS: { light: 22, medium: 31, dark: 47 },
    SS: { light: 20, medium: 31, dark: 49 },
    K: { light: 68, medium: 22, dark: 10 },
    P: { light: 70, medium: 21, dark: 9 },
    ATH: { light: 22, medium: 30, dark: 48 }
  };
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    positions: Object.fromEntries(POSITION_ORDER.map((position) => [
      position,
      baselines[position] || { light: 34, medium: 33, dark: 33 }
    ]))
  };
}

function clampPercent(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(100, Math.round(parsed)));
}

function normalizeMix(mix = {}) {
  let light = clampPercent(mix.light);
  let medium = clampPercent(mix.medium);
  let dark = clampPercent(mix.dark);
  const total = light + medium + dark;
  if (total <= 0) {
    return { light: 34, medium: 33, dark: 33 };
  }
  if (total !== 100) {
    light = Math.round((light / total) * 100);
    medium = Math.round((medium / total) * 100);
    dark = 100 - light - medium;
  }
  return { light, medium, dark };
}

function sanitizeSkinToneSettings(settings = {}) {
  const defaults = defaultSkinToneSettings();
  const incoming = settings.positions || {};
  const positions = {};
  for (const position of POSITION_ORDER) {
    positions[position] = normalizeMix(incoming[position] || defaults.positions[position]);
  }
  return {
    version: 1,
    updatedAt: settings.updatedAt || new Date().toISOString(),
    positions
  };
}

function readSkinToneSettings() {
  if (!fs.existsSync(SKIN_TONE_SETTINGS_PATH)) {
    const defaults = defaultSkinToneSettings();
    fs.writeFileSync(SKIN_TONE_SETTINGS_PATH, JSON.stringify(defaults, null, 2), 'utf8');
    return defaults;
  }
  const parsed = JSON.parse(fs.readFileSync(SKIN_TONE_SETTINGS_PATH, 'utf8'));
  return sanitizeSkinToneSettings(parsed);
}

function writeSkinToneSettings(settings = {}) {
  const clean = sanitizeSkinToneSettings({
    ...settings,
    updatedAt: new Date().toISOString()
  });
  fs.writeFileSync(SKIN_TONE_SETTINGS_PATH, JSON.stringify(clean, null, 2), 'utf8');
  return { ok: true, path: SKIN_TONE_SETTINGS_PATH, settings: clean };
}

function clampNameWeight(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(999999, Math.round(parsed)));
}

function sanitizeNameWeightEntry(entry = {}) {
  return {
    name: cleanText(entry.name),
    weight: clampNameWeight(entry.weight)
  };
}

function normalizeNameWeightPools(raw = {}) {
  const pools = {};
  const groups = [];
  for (const [group, entries] of Object.entries(raw)) {
    if (!Array.isArray(entries)) continue;
    groups.push(group);
    pools[group] = entries
      .map(sanitizeNameWeightEntry)
      .filter((entry) => entry.name);
  }
  return { groups, pools };
}

function nameWeightSummary(pools = {}) {
  return Object.fromEntries(Object.entries(pools).map(([group, entries]) => {
    const totalWeight = entries.reduce((sum, entry) => sum + clampNameWeight(entry.weight), 0);
    return [group, { count: entries.length, totalWeight }];
  }));
}

function nameWeightReportLines() {
  try {
    const payload = readNameWeights();
    return [
      `Source JSON: ${path.basename(payload.path)}`,
      ...payload.groups.map((group) => {
        const info = payload.summary[group] || {};
        return `${group}: ${(info.count || 0).toLocaleString()} names | ${(info.totalWeight || 0).toLocaleString()} total weight`;
      })
    ];
  } catch (error) {
    return [`Unavailable: ${error.message}`];
  }
}

function readNameWeights() {
  if (!fs.existsSync(NAME_WEIGHTS_PATH)) {
    throw new Error(`Name weights file is missing: ${NAME_WEIGHTS_PATH}`);
  }
  const raw = JSON.parse(fs.readFileSync(NAME_WEIGHTS_PATH, 'utf8'));
  const { groups, pools } = normalizeNameWeightPools(raw);
  if (!groups.length) {
    throw new Error('Name weights file has no editable weighted name pools.');
  }
  return {
    path: NAME_WEIGHTS_PATH,
    groups,
    pools,
    summary: nameWeightSummary(pools)
  };
}

function writeNameWeights(payload = {}) {
  if (!fs.existsSync(NAME_WEIGHTS_PATH)) {
    throw new Error(`Name weights file is missing: ${NAME_WEIGHTS_PATH}`);
  }
  const current = JSON.parse(fs.readFileSync(NAME_WEIGHTS_PATH, 'utf8'));
  const incomingPools = payload.pools || {};
  const incomingGroups = Array.isArray(payload.groups)
    ? payload.groups
    : Object.keys(incomingPools);
  const next = { ...current };
  for (const group of incomingGroups) {
    if (!Array.isArray(current[group]) && !Array.isArray(incomingPools[group])) continue;
    next[group] = (incomingPools[group] || [])
      .map(sanitizeNameWeightEntry)
      .filter((entry) => entry.name);
  }
  const tmpPath = `${NAME_WEIGHTS_PATH}.tmp`;
  fs.writeFileSync(tmpPath, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  fs.renameSync(tmpPath, NAME_WEIGHTS_PATH);
  return { ok: true, ...readNameWeights() };
}

function cleanText(value) {
  return String(value ?? '').replace(/\r?\n/g, ' ').trim();
}

function section(title, lines = []) {
  return [
    '',
    title,
    '-'.repeat(title.length),
    ...lines
  ].join('\n');
}

function formatColumnList(columns = []) {
  if (!columns.length) return ['None'];
  return columns.map((column, index) => {
    const parts = [
      `${index + 1}. ${cleanText(column.label)} [${cleanText(column.key)}]`
    ];
    if (column.group) parts.push(`group=${cleanText(column.group)}`);
    if (column.type) parts.push(`type=${cleanText(column.type)}`);
    if (column.numeric) parts.push('numeric');
    return parts.join(' | ');
  });
}

function formatRatingGroups(groups = []) {
  if (!groups.length) return ['None'];
  return groups.flatMap((group) => [
    `${cleanText(group.label)} (${cleanText(group.key)})`,
    ...(group.fields || []).map((field) => `  - ${cleanText(field.label)} [${cleanText(field.key)}]`)
  ]);
}

function formatExportedColumns(columns = []) {
  if (!columns.length) return ['None'];
  return columns.map((column, index) => `${index + 1}. ${cleanText(column.label)} [${cleanText(column.key)}]`);
}

function formatTopSchoolSlots(slots = []) {
  if (!slots.length) return ['None'];
  return slots.flatMap((slot) => [
    `Slot ${slot.slot}`,
    ...(slot.fields || []).map((field) => `  - ${cleanText(field)}`)
  ]);
}

function topSchoolLogoAudit(rows = []) {
  const audit = { total: 0, namedWebp: 0, numericPng: 0, missing: 0 };
  for (const row of rows) {
    for (let slot = 1; slot <= 10; slot += 1) {
      const team = row[`topSchool${slot}Team`];
      if (!team) continue;
      audit.total += 1;
      const logoPath = String(row[`topSchool${slot}LogoPath`] || '');
      if (!logoPath) audit.missing += 1;
      else if (/\.webp$/i.test(logoPath)) audit.namedWebp += 1;
      else if (/\.png$/i.test(logoPath)) audit.numericPng += 1;
    }
  }
  return audit;
}

function schoolIdMapLines(rows = []) {
  const byId = new Map();
  for (const row of rows) {
    for (let slot = 1; slot <= 10; slot += 1) {
      const rawId = row[`topSchool${slot}TeamId`];
      if (rawId === '' || rawId === undefined || rawId === null) continue;
      const teamId = Number(rawId);
      if (!Number.isFinite(teamId) || byId.has(teamId)) continue;
      byId.set(teamId, {
        team: row[`topSchool${slot}Team`],
        logo: row[`topSchool${slot}LogoPath`]
      });
    }
  }
  return [...byId.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([teamId, info]) => `${teamId}: ${cleanText(info.team)} -> ${cleanText(info.logo)}`);
}

function fiveStarLeaderLines(rows = []) {
  const counts = new Map();
  for (const row of rows) {
    if (row.stars !== '5-star') continue;
    const team = row.topSchool1Team || 'Unknown';
    counts.set(team, (counts.get(team) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))
    .map(([team, count]) => `${team}: ${count}`);
}

function countRowsBy(rows = [], key) {
  const counts = new Map();
  for (const row of rows) {
    const value = cleanText(row[key] || 'Blank');
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([value, count]) => `${value}: ${count.toLocaleString()}`);
}

function portraitFaceMapLines(rows = []) {
  const rowsWithCharacterVisuals = rows.filter((row) => row.characterVisualsHasData).length;
  const zeroCharacterVisuals = rows.length - rowsWithCharacterVisuals;
  const samples = rows.slice(0, 8).map((row) => (
    `${cleanText(row.name)} | PGHE=${cleanText(row.genericHeadAssetName)} | PHTN=${cleanText(row.portraitId)} | source=${cleanText(row.portraitSource)} | file=${cleanText(row.portraitFileName)} | CharacterVisuals=${cleanText(row.characterVisuals)}`
  ));
  return [
    'Field map:',
    'PLAY.GenericHeadAssetName / PGHE -> assets/Player_Portraits/<Skin>Generic/<Body>/nilpp_<GenericHeadAssetName>.webp. This is the primary displayed portrait path.',
    'PLAY.CharacterVisuals -> CharacterVisuals/CHVI face and gear payload when non-zero/decoded. This is separate from the 2D portrait image.',
    'Decoded CharacterVisuals face data can include genericHeadName, genericHead, skinTone, skinToneScale, bodyType, and slots such as Face, Hair, GenericHead, CustomHead, FaceTexture, and FacialHair.',
    '',
    'Current file audit:',
    `Recruit rows checked: ${rows.length.toLocaleString()}`,
    `Rows with non-zero CharacterVisuals: ${rowsWithCharacterVisuals.toLocaleString()}`,
    `Rows with zero CharacterVisuals: ${zeroCharacterVisuals.toLocaleString()}`,
    'Portrait source counts:',
    ...countRowsBy(rows, 'portraitSource').map((line) => `  ${line}`),
    'Face data source counts:',
    ...countRowsBy(rows, 'faceDataSource').map((line) => `  ${line}`),
    '',
    'Sample chains:',
    ...(samples.length ? samples.map((line) => `  ${line}`) : ['  None'])
  ];
}

function writeTextReport(metadata = {}) {
  const payload = readRecruitingData();
  const rows = payload.rows || [];
  const audit = topSchoolLogoAudit(rows);
  const generatedAt = new Date().toISOString();
  const lines = [
    'Recruit Overhaul 27 - Data/Header Report',
    `Generated: ${generatedAt}`,
    `Source file: ${cleanText(metadata.sourceFile || payload.sourceFile || 'DYNASTY-DYNASTY')}`,
    `Recruit rows: ${rows.length.toLocaleString()}`,
    `Data JSON: ${path.basename(DATA_PATH)}`,
    `CSV: ${path.basename(CSV_PATH)}`,
    `Report: ${path.basename(REPORT_PATH)}`,
    '',
    'Current write/edit behavior',
    '---------------------------',
    'This app reads the selected dynasty file, calculates previewed recruit edits, and can save those calculated Player-table edits back after creating a backup.',
    'Save applies the active Calculate preview only; reload the dynasty file before saving a different file.',
    'The listed columns are display/edit candidates for future field editing.',
    'Team logos are exact named assets only. Numeric logo fallback is disabled.',
    section('Source Tables And Assets', (metadata.sourceTables || []).map((source) => (
      `${cleanText(source.table)} | ${cleanText(source.file)} | ${cleanText(source.purpose)}`
    ))),
    section('Name Weight Pools', nameWeightReportLines()),
    section('Portrait To Face Map', portraitFaceMapLines(rows)),
    section('Filters/Search', (metadata.filters || []).map((filter) => {
      const keys = Array.isArray(filter.keys) ? filter.keys.join(', ') : filter.key || '';
      return `${cleanText(filter.label)}: ${cleanText(keys)}`;
    })),
    section('Recruit Table Headers', formatColumnList(metadata.recruitTableColumns || [])),
    section('Detail Profile Fields', (metadata.detailProfileFields || []).map((field, index) => (
      `${index + 1}. ${cleanText(field.label)} [${cleanText(field.key)}]`
    ))),
    section('Detail Rating Groups', formatRatingGroups(metadata.detailRatingGroups || [])),
    section('Top School Slot Fields', formatTopSchoolSlots(metadata.topSchoolSlots || [])),
    section('Exported JSON/CSV Columns', formatExportedColumns(metadata.exportedColumns || [])),
    section('Exact Logo Audit', [
      `Top-school cells checked: ${audit.total.toLocaleString()}`,
      `Named .webp logos: ${audit.namedWebp.toLocaleString()}`,
      `Numeric .png logos: ${audit.numericPng.toLocaleString()}`,
      `Missing logos: ${audit.missing.toLocaleString()}`
    ]),
    section('Top School TeamIndex Map Seen In This File', schoolIdMapLines(rows)),
    section('Five-Star Top School Counts', fiveStarLeaderLines(rows))
  ];
  fs.writeFileSync(REPORT_PATH, `${lines.join('\n')}\n`, 'utf8');
  return { ok: true, path: REPORT_PATH, generatedAt };
}

function safeConfigFileStem(name = '') {
  const clean = String(name || 'Recruit Overhaul 27 Settings')
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return clean || 'Recruit-Overhaul-27-Settings';
}

async function exportSettingsConfig(payload = {}) {
  const name = String(payload.name || payload.settings?.configName || 'Recruit Overhaul 27 Settings').trim();
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Export Settings Config',
    defaultPath: `${safeConfigFileStem(name)}.ro27-settings.json`,
    filters: [
      { name: 'RO27 Settings Config', extensions: ['json'] }
    ]
  });
  if (result.canceled || !result.filePath) {
    return { ok: false, canceled: true };
  }
  const exportPayload = {
    ...payload,
    exportedAt: payload.exportedAt || new Date().toISOString()
  };
  fs.writeFileSync(result.filePath, `${JSON.stringify(exportPayload, null, 2)}\n`, 'utf8');
  return { ok: true, path: result.filePath };
}

async function importSettingsConfig() {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Import Settings Config',
    properties: ['openFile'],
    filters: [
      { name: 'RO27 Settings Config', extensions: ['json'] }
    ]
  });
  if (result.canceled || !result.filePaths.length) {
    return { ok: false, canceled: true };
  }
  const filePath = result.filePaths[0];
  const config = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return { ok: true, path: filePath, config };
}

ipcMain.handle('recruiting:get-data', () => readRecruitingData());

ipcMain.handle('recruiting:get-raw-table', (_event, key) => {
  try {
    return readRawTable(String(key || ''));
  } catch (error) {
    return { ok: false, error: error.message };
  }
});

ipcMain.handle('recruiting:get-skin-tone-settings', () => {
  try {
    return { ok: true, path: SKIN_TONE_SETTINGS_PATH, settings: readSkinToneSettings() };
  } catch (error) {
    return { ok: false, error: error.message };
  }
});

ipcMain.handle('recruiting:save-skin-tone-settings', (_event, settings) => {
  try {
    return writeSkinToneSettings(settings || {});
  } catch (error) {
    return { ok: false, error: error.message };
  }
});

ipcMain.handle('recruiting:get-name-weights', () => {
  try {
    return { ok: true, ...readNameWeights() };
  } catch (error) {
    return { ok: false, error: error.message };
  }
});

ipcMain.handle('recruiting:get-ovr-weights', () => {
  try {
    return readOvrWeights();
  } catch (error) {
    return { ok: false, error: error.message };
  }
});

ipcMain.handle('recruiting:get-portrait-manifest', () => {
  try {
    return readPortraitManifest();
  } catch (error) {
    return { ok: false, error: error.message };
  }
});

ipcMain.handle('recruiting:save-name-weights', (_event, payload) => {
  try {
    return writeNameWeights(payload || {});
  } catch (error) {
    return { ok: false, error: error.message };
  }
});

ipcMain.handle('recruiting:write-report', (_event, metadata) => {
  try {
    return writeTextReport(metadata || {});
  } catch (error) {
    return { ok: false, error: error.message };
  }
});

ipcMain.handle('recruiting:export-settings-config', async (_event, payload) => {
  try {
    return await exportSettingsConfig(payload || {});
  } catch (error) {
    return { ok: false, error: error.message };
  }
});

ipcMain.handle('recruiting:import-settings-config', async () => {
  try {
    return await importSettingsConfig();
  } catch (error) {
    return { ok: false, error: error.message };
  }
});

ipcMain.handle('recruiting:open-csv', async () => {
  if (!fs.existsSync(CSV_PATH)) {
    return { ok: false, error: 'CSV file is missing.' };
  }
  const error = await shell.openPath(CSV_PATH);
  return { ok: !error, error };
});

ipcMain.handle('recruiting:open-report', async () => {
  if (!fs.existsSync(REPORT_PATH)) {
    writeTextReport({});
  }
  const error = await shell.openPath(REPORT_PATH);
  return { ok: !error, error, path: REPORT_PATH };
});

ipcMain.handle('recruiting:show-data-file', async () => {
  if (!fs.existsSync(DATA_PATH)) {
    return { ok: false, error: 'Data file is missing.' };
  }
  shell.showItemInFolder(DATA_PATH);
  return { ok: true };
});

ipcMain.handle('recruiting:select-dynasty-folder', async (_event, defaultPath = '') => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Dynasty Save Folder',
    defaultPath: defaultPath && fs.existsSync(defaultPath) ? defaultPath : undefined,
    properties: ['openDirectory']
  });
  if (result.canceled || !result.filePaths.length) {
    return { ok: false, canceled: true };
  }
  return listDynastyFolder(result.filePaths[0]);
});

ipcMain.handle('recruiting:list-dynasty-folder', (_event, folderPath) => {
  return listDynastyFolder(folderPath);
});

ipcMain.handle('recruiting:load-dynasty-file', (_event, filePath) => {
  const resolved = path.resolve(String(filePath || ''));
  if (!resolved || !fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    return { ok: false, error: 'Selected dynasty file does not exist.' };
  }
  if (!isLikelyDynastyFile(resolved, { isFile: () => true })) {
    return { ok: false, error: 'Only DYNASTY files can be loaded from the folder dropdown.' };
  }
  return loadDynastyFile(resolved);
});

ipcMain.handle('recruiting:save-preview-changes', (_event, payload) => {
  return savePreviewChanges(payload || {});
});

ipcMain.handle('recruiting:rebuild-data', async () => {
  return runGenerator();
});

app.whenReady().then(() => {
  ensureRuntimeData();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
