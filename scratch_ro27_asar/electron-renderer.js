const ROW_HEIGHT = 60;
const RAW_ROW_HEIGHT = 36;
const OVERSCAN_ROWS = 8;
const RAW_OVERSCAN_ROWS = 16;
const NAME_WEIGHT_VISIBLE_LIMIT = 350;
const APP_DEFAULT_SETTINGS_VERSION = 8;
const APP_DEFAULT_SETTINGS_STORAGE_KEY = `recruitOverhaul27.appDefaultSettings.v${APP_DEFAULT_SETTINGS_VERSION}`;
const SETTING_MODULES_STORAGE_KEY = `recruitOverhaul27.settingModules.v${APP_DEFAULT_SETTINGS_VERSION}`;
const SETTINGS_CONFIG_NAME_STORAGE_KEY = `recruitOverhaul27.settingsConfigName.v${APP_DEFAULT_SETTINGS_VERSION}`;
const SETTINGS_CONFIG_SCHEMA = 'recruit-overhaul-27-settings-config';
const SETTINGS_CONFIG_SCHEMA_VERSION = 1;
const DEFAULT_SETTINGS_CONFIG_NAME = 'Fangs Settings';
const SETTINGS_AUTOSAVE_DEBOUNCE_MS = 450;
const GLOBAL_RATING_VARIANCE_STORAGE_KEY = 'recruitOverhaul27.globalRatingVariance';
const DIAMOND_IN_THE_ROUGH_SETTINGS_STORAGE_KEY = 'recruitOverhaul27.diamondInTheRoughSettings';
const BLUE_CHIP_SETTINGS_STORAGE_KEY = 'recruitOverhaul27.blueChipSettings';
const PROJECT_PLAYERS_STORAGE_KEY = `recruitOverhaul27.projectPlayers.v${APP_DEFAULT_SETTINGS_VERSION}`;
const HIDE_GEMS_BUSTS_STORAGE_KEY = `recruitOverhaul27.hideGemsBusts.v${APP_DEFAULT_SETTINGS_VERSION}`;
const GEM_BUST_VARIANCE_STORAGE_KEY = 'recruitOverhaul27.gemBustVariance';
const STAR_CALIBER_STRENGTH_STORAGE_KEY = 'recruitOverhaul27.starCaliberStrength';
const HEIGHT_VARIANCE_STORAGE_KEY = 'recruitOverhaul27.heightVarianceByPosition';
const WEIGHT_VARIANCE_STORAGE_KEY = 'recruitOverhaul27.weightVarianceByPosition';
const DYNASTY_FOLDER_STORAGE_KEY = 'recruitOverhaul27.dynastyFolderPath';
const MAX_GLOBAL_RATING_VARIANCE = 20;
const DEFAULT_DIAMOND_IN_THE_ROUGH_PERCENT = 5;
const DIAMOND_IN_THE_ROUGH_SKILL_BONUS_MAX = 7;
const DIAMOND_IN_THE_ROUGH_PHYSICAL_BONUS_MAX = 2;
const DEFAULT_BLUE_CHIP_PERCENT = 10;
const BLUE_CHIP_SKILL_BONUS_MAX = 5;
const BLUE_CHIP_PHYSICAL_BONUS_MAX = 3;
const DEFAULT_PROJECT_PLAYERS_ENABLED = true;
const DEFAULT_HIDE_GEMS_BUSTS_ENABLED = true;
const PROJECT_PLAYER_CHANCE_PERCENT = 1;
const PROJECT_PLAYER_SKILL_DROP_MAX = 4;
const PROJECT_PLAYER_PHYSICAL_BOOST_MAX = 3;
const PROJECT_PLAYER_DEV_UPGRADE_DOUBLE_CHANCE = 0.25;
const LAST_NAME_SUFFIX_RULES = Object.freeze([
  { suffix: 'Jr', chance: 1 },
  { suffix: 'II', chance: 0.5 },
  { suffix: 'III', chance: 0.25 },
  { suffix: 'IV', chance: 0.1 },
  { suffix: 'V', chance: 0.1 }
]);
const LAST_NAME_SUFFIX_PATTERN = /(?:^|[\s,]+)(?:Jr\.?|II|III|IV|V)$/i;
const MAX_GEM_BUST_VARIANCE = 20;
const MAX_STRENGTH_DELTA = 10;
const MAX_HEIGHT_VARIANCE_INCHES = 6;
const MAX_WEIGHT_VARIANCE_POUNDS = 20;
const MIN_PREVIEW_HEIGHT_INCHES = 60;
const MAX_PREVIEW_HEIGHT_INCHES = 84;
const MIN_PREVIEW_WEIGHT_POUNDS = 160;
const MAX_PREVIEW_WEIGHT_POUNDS = 380;
const MIN_RATING_VALUE = 10;
const MAX_RATING_VALUE = 99;
const HIGH_RATING_STEP_START = 96;
const HIGH_RATING_STEP_COST = 2;
const STRENGTH_SLIDER_MIDPOINT = 10;
const SKILL_RATING_VARIANCE_FACTOR = 1;
const PHYSICAL_RATING_VARIANCE_FACTOR = 0.4;
const MIN_RELEVANT_OVR_WEIGHT = 0.1;
const STAR_CALIBER_ORDER = [5, 4, 3, 2, 1];
const ABILITY_RANK_ORDER = ['Bronze', 'Silver', 'Gold', 'Platinum'];
const DEV_TRAIT_ORDER = ['Normal', 'Impact', 'Star', 'Elite'];
const SETTING_MODULE_KEYS = [
  'globalRating',
  'diamondInTheRough',
  'blueChip',
  'gemBust',
  'starStrength',
  'heightVariance',
  'weightVariance',
  'nameSuffixes',
];
const FORCED_SETTING_MODULE_KEYS = new Set(['skinTone', 'nameWeights']);
const ABILITY_RANK_SAVE_VALUE = Object.freeze({
  bronze: '1',
  silver: '10',
  gold: '11',
  platinum: '100'
});
const DEV_TRAIT_SAVE_VALUE = Object.freeze({
  normal: '0',
  impact: '1',
  star: '10',
  elite: '11'
});
const GEM_BUST_NORMAL_SAVE_VALUE = '0';
const RAW_TABLE_OPTIONS = [
  { key: 'recruit', label: 'Recruit' },
  { key: 'player', label: 'PLAY' },
  { key: 'userRecruitTarget', label: 'UserRecruitTarget' },
  { key: 'prospectTargetSchoolArray', label: 'ProspectTargetSchool[]' },
  { key: 'prospectTargetSchool', label: 'ProspectTargetSchool' },
  { key: 'team', label: 'Team' },
  { key: 'positionSignatureAbilityArray', label: 'PositionSignatureAbility[]' },
  { key: 'positionToAbilityTable', label: 'PositionToAbilityTable' }
];
const POSITION_ORDER = [
  'QB', 'HB', 'FB', 'WR', 'TE',
  'LT', 'LG', 'C', 'RG', 'RT',
  'LE', 'RE', 'DT',
  'LOLB', 'MLB', 'ROLB',
  'CB', 'FS', 'SS',
  'K', 'P', 'ATH'
];
const POSITION_ALIASES = Object.freeze({
  RB: 'HB'
});
const positionRank = new Map(POSITION_ORDER.map((position, index) => [position, index]));
const RATING_FIELDS = [
  'AccelerationRating',
  'AgilityRating',
  'AwarenessRating',
  'BCVisionRating',
  'BlockSheddingRating',
  'BreakSackRating',
  'BreakTackleRating',
  'CarryingRating',
  'CatchInTrafficRating',
  'CatchingRating',
  'ChangeOfDirectionRating',
  'ConfidenceRating',
  'DeepRouteRunningRating',
  'FinesseMovesRating',
  'HitPowerRating',
  'ImpactBlockingRating',
  'InjuryRating',
  'JukeMoveRating',
  'JumpingRating',
  'KickAccuracyRating',
  'KickPowerRating',
  'KickReturnRating',
  'LeadBlockRating',
  'LongSnapRating',
  'ManCoverageRating',
  'MediumRouteRunningRating',
  'OverallRating',
  'PassBlockFinesseRating',
  'PassBlockPowerRating',
  'PassBlockRating',
  'PlayActionRating',
  'PlayRecognitionRating',
  'PowerMovesRating',
  'PressRating',
  'PursuitRating',
  'ReleaseRating',
  'RunBlockFinesseRating',
  'RunBlockPowerRating',
  'RunBlockRating',
  'ShortRouteRunningRating',
  'SpectacularCatchRating',
  'SpeedRating',
  'SpinMoveRating',
  'StaminaRating',
  'StiffArmRating',
  'StrengthRating',
  'TackleRating',
  'ThrowAccuracyDeepRating',
  'ThrowAccuracyMidRating',
  'ThrowAccuracyRating',
  'ThrowAccuracyShortRating',
  'ThrowOnTheRunRating',
  'ThrowPowerRating',
  'ThrowUnderPressureRating',
  'ToughnessRating',
  'TruckingRating',
  'ZoneCoverageRating'
];

const RATING_GROUPS = [
  { key: 'overall', label: 'Overall', fields: ['OverallRating'] },
  {
    key: 'passing',
    label: 'Passing',
    fields: [
      'ThrowAccuracyRating',
      'ThrowAccuracyShortRating',
      'ThrowAccuracyMidRating',
      'ThrowAccuracyDeepRating',
      'ThrowOnTheRunRating',
      'ThrowUnderPressureRating',
      'PlayActionRating',
      'BreakSackRating'
    ]
  },
  {
    key: 'running',
    label: 'Running',
    fields: [
      'BCVisionRating',
      'BreakTackleRating',
      'CarryingRating',
      'JukeMoveRating',
      'SpinMoveRating',
      'StiffArmRating',
      'TruckingRating'
    ]
  },
  {
    key: 'receiving',
    label: 'Receiving',
    fields: [
      'CatchingRating',
      'CatchInTrafficRating',
      'SpectacularCatchRating',
      'ReleaseRating',
      'ShortRouteRunningRating',
      'MediumRouteRunningRating',
      'DeepRouteRunningRating'
    ]
  },
  {
    key: 'blocking',
    label: 'Blocking',
    fields: [
      'ImpactBlockingRating',
      'LeadBlockRating',
      'RunBlockRating',
      'RunBlockFinesseRating',
      'RunBlockPowerRating',
      'PassBlockRating',
      'PassBlockFinesseRating',
      'PassBlockPowerRating',
      'LongSnapRating'
    ]
  },
  { key: 'passRush', label: 'Pass Rush', fields: ['FinesseMovesRating', 'PowerMovesRating'] },
  { key: 'runDefense', label: 'Run Defense', fields: ['BlockSheddingRating', 'HitPowerRating', 'PursuitRating', 'TackleRating'] },
  { key: 'coverage', label: 'Coverage', fields: ['ManCoverageRating', 'ZoneCoverageRating', 'PressRating', 'PlayRecognitionRating'] },
  { key: 'specialTeams', label: 'Special Teams', fields: ['KickAccuracyRating', 'KickPowerRating', 'KickReturnRating'] },
  { key: 'athletic', label: 'Athletic', fields: ['SpeedRating', 'AccelerationRating', 'AgilityRating', 'ChangeOfDirectionRating', 'StrengthRating', 'JumpingRating', 'ThrowPowerRating'] },
  { key: 'general', label: 'General', fields: ['AwarenessRating', 'ConfidenceRating', 'InjuryRating', 'StaminaRating', 'ToughnessRating'] }
];

const PHYSICAL_RATING_FIELDS = new Set([
  'AccelerationRating',
  'AgilityRating',
  'ChangeOfDirectionRating',
  'InjuryRating',
  'JumpingRating',
  'SpeedRating',
  'StaminaRating',
  'StrengthRating',
  'ThrowPowerRating',
  'ToughnessRating'
]);

const OVR_WEIGHT_NAME_BY_RATING_FIELD = Object.freeze({
  AccelerationRating: 'Acceleration',
  AgilityRating: 'Agility',
  AwarenessRating: 'Awareness',
  BCVisionRating: 'BCVision',
  BlockSheddingRating: 'BlockShedding',
  BreakSackRating: 'BreakSack',
  BreakTackleRating: 'BreakTackle',
  CarryingRating: 'Carrying',
  CatchInTrafficRating: 'CatchInTraffic',
  CatchingRating: 'Catching',
  ChangeOfDirectionRating: 'ChangeOfDirection',
  DeepRouteRunningRating: 'DeepRouteRunning',
  FinesseMovesRating: 'FinesseMoves',
  HitPowerRating: 'HitPower',
  ImpactBlockingRating: 'ImpactBlocking',
  JukeMoveRating: 'JukeMove',
  JumpingRating: 'Jumping',
  KickAccuracyRating: 'KickAccuracy',
  KickPowerRating: 'KickPower',
  KickReturnRating: 'KickReturn',
  LeadBlockRating: 'LeadBlock',
  LongSnapRating: 'LongSnap',
  ManCoverageRating: 'ManCoverage',
  MediumRouteRunningRating: 'MediumRouteRunning',
  PassBlockRating: 'PassBlock',
  PassBlockFinesseRating: 'PassBlockFinesse',
  PassBlockPowerRating: 'PassBlockPower',
  PlayActionRating: 'PlayAction',
  PlayRecognitionRating: 'PlayRecognition',
  PowerMovesRating: 'PowerMoves',
  PressRating: 'Press',
  PursuitRating: 'Pursuit',
  ReleaseRating: 'Release',
  RunBlockRating: 'RunBlock',
  RunBlockFinesseRating: 'RunBlockFinesse',
  RunBlockPowerRating: 'RunBlockPower',
  ShortRouteRunningRating: 'ShortRouteRunning',
  SpectacularCatchRating: 'SpectacularCatch',
  SpeedRating: 'Speed',
  SpinMoveRating: 'SpinMove',
  StiffArmRating: 'StiffArm',
  StrengthRating: 'Strength',
  TackleRating: 'Tackle',
  ThrowAccuracyDeepRating: 'ThrowAccuracyDeep',
  ThrowAccuracyMidRating: 'ThrowAccuracyMid',
  ThrowAccuracyRating: 'ThrowAccuracy',
  ThrowAccuracyShortRating: 'ThrowAccuracyShort',
  ThrowOnTheRunRating: 'ThrowOnTheRun',
  ThrowPowerRating: 'ThrowPower',
  ThrowUnderPressureRating: 'ThrowUnderPressure',
  ToughnessRating: 'Toughness',
  TruckingRating: 'Trucking',
  ZoneCoverageRating: 'ZoneCoverage'
});

const POSITION_OVR_GROUPS = Object.freeze({
  QB: 'QB',
  HB: 'HB',
  RB: 'HB',
  FB: 'FB',
  WR: 'WR',
  TE: 'TE',
  LT: 'OT',
  RT: 'OT',
  LG: 'G',
  RG: 'G',
  C: 'C',
  LE: 'DE',
  RE: 'DE',
  DT: 'DT',
  LOLB: 'OLB',
  ROLB: 'OLB',
  MLB: 'MLB',
  CB: 'CB',
  FS: 'S',
  SS: 'S',
  K: 'KP',
  P: 'KP',
  LS: 'LS',
  KR: 'KR',
  PR: 'PR',
  ATH: 'GAD'
});

const RATING_FIELD_SET = new Set(RATING_FIELDS);
const ADJUSTABLE_RATING_FIELDS = RATING_FIELDS.filter((field) => field !== 'OverallRating');
let appDefaultSettings = null;
appDefaultSettings = readAppDefaultSettings();
let ratingShadeIndex = 0;
const DETAIL_RATING_GROUPS = RATING_GROUPS.map((group) => {
  const fields = group.fields.filter((field) => RATING_FIELD_SET.has(field));
  const shade = group.key === 'overall'
    ? 'rating-overall'
    : ratingShadeIndex++ % 2 === 0
      ? 'rating-shade-a'
      : 'rating-shade-b';
  return { ...group, fields, shade };
}).filter((group) => group.fields.length);
const RATING_FIELD_GROUPS = new Map();
for (const group of DETAIL_RATING_GROUPS) {
  group.fields.forEach((field, index) => {
    RATING_FIELD_GROUPS.set(field, {
      groupKey: group.key,
      groupLabel: group.label,
      groupShade: group.shade,
      groupStart: index === 0
    });
  });
}
const RATING_DISPLAY_FIELDS = DETAIL_RATING_GROUPS
  .flatMap((group) => group.fields);

function ratingGroupMeta(field) {
  return RATING_FIELD_GROUPS.get(field) || {};
}

const ratingTableColumns = RATING_DISPLAY_FIELDS.map((field) => ({
  key: field,
  label: ratingLabel(field),
  numeric: true,
  type: 'rating',
  ...ratingGroupMeta(field)
}));
const ratingAverageColumns = RATING_DISPLAY_FIELDS.flatMap((field) => {
  const label = ratingLabel(field);
  const groupMeta = ratingGroupMeta(field);
  return [
    { key: `avg${field}`, label: `Avg ${label}`, numeric: true, ...groupMeta },
    { key: `min${field}`, label: `Min ${label}`, numeric: true, ...groupMeta, groupStart: false },
    { key: `max${field}`, label: `Max ${label}`, numeric: true, ...groupMeta, groupStart: false }
  ];
});

const gemBustAverageGroup = {
  groupKey: 'gemBustAverage',
  groupLabel: 'Gem/Bust',
  groupShade: 'rating-shade-a'
};

const state = {
  rows: [],
  filtered: [],
  averageRows: [],
  selectedRecruitRow: null,
  sortKey: 'nationalRank',
  sortDir: 'asc',
  averageSortKey: 'position',
  averageSortDir: 'asc',
  view: 'recruits',
  settingsPanel: '',
  detailView: 'profile',
  recruitingSpoilersVisible: null,
  settingsConfigName: readStoredSettingsConfigName(appDefaultSettings?.configName),
  settingModules: readStoredSettingModules(),
  globalRatingVariance: readStoredGlobalRatingVariance(),
  diamondInTheRoughSettings: readStoredDiamondInTheRoughSettings(),
  blueChipSettings: readStoredBlueChipSettings(),
  projectPlayersSettings: readStoredProjectPlayersSettings(),
  hideGemsBustsSettings: readStoredHideGemsBustsSettings(),
  gemBustVariance: readStoredGemBustVariance(),
  starCaliberStrength: readStoredStarCaliberStrength(),
  heightVariance: readStoredPositionVariance(HEIGHT_VARIANCE_STORAGE_KEY, clampHeightVariance),
  weightVariance: readStoredPositionVariance(WEIGHT_VARIANCE_STORAGE_KEY, clampWeightVariance),
  skinToneSettings: null,
  skinToneDirty: false,
  nameWeights: null,
  nameWeightGroup: '',
  nameWeightFilter: '',
  nameWeightsDirty: false,
  dataLoaded: false,
  loading: false,
  calculating: false,
  loadMessage: '',
  loadProgressPercent: 0,
  loadProgressLabel: 'Loading Dynasty',
  dataPayload: null,
  rawTableKey: RAW_TABLE_OPTIONS[0].key,
  rawLoadedKey: '',
  rawLoading: false,
  rawRows: [],
  rawColumns: [],
  rawFilteredIndexes: [],
  rawSortKey: '_index',
  rawSortDir: 'asc',
  rawPurpose: '',
  rawFileName: '',
  ovrWeightEntries: [],
  ovrWeightEntriesByPosition: new Map(),
  ovrRelevantFieldsByPosition: new Map(),
  ovrWeightsLoaded: false,
  portraitManifest: null,
  portraitManifestLoaded: false,
  previewActive: false,
  previewRun: 0,
  previewByRecruitRow: new Map(),
  dynastyFolderPath: readStoredDynastyFolderPath(),
  dynastyFolderFiles: [],
  selectedDynastyPath: ''
};

let settingsPreviewRefreshTimer = null;
let settingsAutosaveTimer = null;

const schoolColumns = Array.from({ length: 10 }, (_, index) => {
  const slot = index + 1;
  return [
    { key: `topSchool${slot}Team`, label: `School ${slot}`, type: 'school', slot },
    { key: `topSchool${slot}Influence`, label: `S${slot} Inf`, numeric: true }
  ];
}).flat();

const playerVisualGroup = {
  groupKey: 'playerVisuals',
  groupLabel: 'Player Visuals',
  groupShade: 'visual-shade'
};

const playerVisualColumns = [
  { key: 'characterBodyType', label: 'Body Type', type: 'bodyType', ...playerVisualGroup, groupStart: true },
  { key: 'previewSkinTone', label: 'Skin', type: 'skinTone', ...playerVisualGroup },
  { key: 'genericHeadPortraitId', label: 'Head ID', type: 'visual', ...playerVisualGroup },
  { key: 'portraitId', label: 'Portrait ID', type: 'visual', ...playerVisualGroup }
];

const devAbilityGroup = {
  groupKey: 'devAbilities',
  groupLabel: 'Dev & Abilities',
  groupShade: 'ability-shade'
};

const devAbilityColumns = [
  { key: 'devTrait', label: 'Dev', type: 'devTrait', ...devAbilityGroup, groupStart: true },
  { key: 'recruitingDealbreaker', label: 'Dealbreaker', type: 'dealbreaker', ...devAbilityGroup },
  { key: 'idealRecruitingPitch', label: 'Pitch', type: 'pitch', ...devAbilityGroup },
  { key: 'physicalAbilities', label: 'Physical', type: 'abilityList', ...devAbilityGroup },
  { key: 'mentalAbilities', label: 'Mental', type: 'abilityList', ...devAbilityGroup }
];

const tableColumns = [
  { key: 'nationalRank', label: 'Nat', numeric: true, width: '3.6%' },
  { key: 'positionRank', label: 'Pos Rank', numeric: true, width: '4%' },
  { key: 'stateRank', label: 'State Rank', numeric: true, width: '4.2%' },
  { key: 'firstName', label: 'First', width: '4.8%' },
  { key: 'lastName', label: 'Last', width: '4.8%' },
  { key: 'recruitPosition', label: 'Pos', width: '3.3%' },
  { key: 'playerType', label: 'Archetype', width: '9.1%' },
  { key: 'stars', label: 'Stars', width: '5.6%' },
  { key: 'class', label: 'Class', width: '5.1%' },
  { key: 'height', label: 'Ht', width: '3.2%' },
  { key: 'weight', label: 'Wt', numeric: true, width: '3.4%' },
  { key: 'baseNilValue', label: 'NIL', numeric: true, width: '4.2%' },
  { key: 'homeTown', label: 'Town', width: '5.1%' },
  { key: 'homeState', label: 'State', width: '5.1%' },
  { key: 'pipeline', label: 'Pipeline', width: '6.6%' },
  { key: 'stage', label: 'Stage', width: '4.1%' },
  { key: 'gemBust', label: 'Gem', width: '4.5%' },
  { key: 'recruitingDealbreaker', label: 'Deal', type: 'dealbreaker', width: '7.3%' },
  { key: 'idealRecruitingPitch', label: 'Pitch', type: 'pitch', width: '8.3%' }
];

const averageColumns = [
  { key: 'position', label: 'Pos' },
  { key: 'stars', label: 'Stars' },
  { key: 'count', label: 'Total', numeric: true, type: 'count', ...gemBustAverageGroup, groupStart: true },
  { key: 'normalCount', label: 'Normal Ct', numeric: true, type: 'count', ...gemBustAverageGroup },
  { key: 'normalPct', label: 'Normal %', numeric: true, type: 'percent', ...gemBustAverageGroup },
  { key: 'gems', label: 'Gem Ct', numeric: true, type: 'count', ...gemBustAverageGroup },
  { key: 'gemPct', label: 'Gem %', numeric: true, type: 'percent', ...gemBustAverageGroup },
  { key: 'busts', label: 'Bust Ct', numeric: true, type: 'count', ...gemBustAverageGroup },
  { key: 'bustPct', label: 'Bust %', numeric: true, type: 'percent', ...gemBustAverageGroup },
  { key: 'hiddenCount', label: 'Hidden Ct', numeric: true, type: 'count', ...gemBustAverageGroup },
  { key: 'hiddenPct', label: 'Hidden %', numeric: true, type: 'percent', ...gemBustAverageGroup },
  { key: 'avgHeight', label: 'Avg Ht', type: 'height' },
  { key: 'minHeight', label: 'Min Ht', type: 'height' },
  { key: 'maxHeight', label: 'Max Ht', type: 'height' },
  { key: 'avgWeight', label: 'Avg Wt', numeric: true },
  { key: 'minWeight', label: 'Min Wt', numeric: true },
  { key: 'maxWeight', label: 'Max Wt', numeric: true },
  { key: 'avgNationalRank', label: 'Avg Nat', numeric: true },
  { key: 'minNationalRank', label: 'Min Nat', numeric: true },
  { key: 'maxNationalRank', label: 'Max Nat', numeric: true },
  { key: 'avgPositionRank', label: 'Avg Pos Rank', numeric: true },
  { key: 'minPositionRank', label: 'Min Pos Rank', numeric: true },
  { key: 'maxPositionRank', label: 'Max Pos Rank', numeric: true },
  { key: 'avgOffers', label: 'Avg Offers', numeric: true },
  { key: 'minOffers', label: 'Min Offers', numeric: true },
  { key: 'maxOffers', label: 'Max Offers', numeric: true },
  { key: 'avgCommitScore', label: 'Avg Commit', numeric: true },
  { key: 'minCommitScore', label: 'Min Commit', numeric: true },
  { key: 'maxCommitScore', label: 'Max Commit', numeric: true },
  { key: 'avgNilOffer', label: 'Avg NIL', numeric: true },
  { key: 'minNilOffer', label: 'Min NIL', numeric: true },
  { key: 'maxNilOffer', label: 'Max NIL', numeric: true },
  { key: 'avgHours', label: 'Avg Hours', numeric: true },
  { key: 'minHours', label: 'Min Hours', numeric: true },
  { key: 'maxHours', label: 'Max Hours', numeric: true },
  { key: 'avgInfluence', label: 'Avg Influence', numeric: true },
  { key: 'minInfluence', label: 'Min Influence', numeric: true },
  { key: 'maxInfluence', label: 'Max Influence', numeric: true },
  ...ratingAverageColumns,
  { key: 'boardCount', label: 'Board', numeric: true }
];

const columnByKey = new Map(tableColumns.map((column) => [column.key, column]));
const averageColumnByKey = new Map(averageColumns.map((column) => [column.key, column]));
const numericColumns = new Set(tableColumns.filter((column) => column.numeric).map((column) => column.key));
const averageNumericColumns = new Set(averageColumns.filter((column) => column.numeric).map((column) => column.key));
const searchKeys = [
  'firstName',
  'lastName',
  'name',
  'recruitPosition',
  'displayPosition',
  'position',
  'playerPosition',
  'alternatePositions',
  'alternatePosition1',
  'alternatePosition2',
  'playerType',
  'playerTypeToken',
  'stars',
  'class',
  'homeTown',
  'homeState',
  'hometown',
  'pipeline',
  'stage',
  'advance',
  'gemBust',
  'devTrait',
  'recruitingDealbreaker',
  'idealRecruitingPitch',
  'physicalAbilities',
  'mentalAbilities',
  ...Array.from({ length: 5 }, (_, index) => `physicalAbility${index + 1}Name`),
  ...Array.from({ length: 5 }, (_, index) => `physicalAbility${index + 1}Rank`),
  ...Array.from({ length: 3 }, (_, index) => `mentalAbility${index + 1}Name`),
  ...Array.from({ length: 3 }, (_, index) => `mentalAbility${index + 1}Rank`),
  'scholarshipStatus',
  ...Array.from({ length: 10 }, (_, index) => `topSchool${index + 1}Team`)
];

const dom = {
  statusText: document.getElementById('statusText'),
  loadStatus: document.getElementById('loadStatus'),
  loadProgress: document.getElementById('loadProgress'),
  loadProgressBar: document.getElementById('loadProgressBar'),
  loadProgressValue: document.getElementById('loadProgressValue'),
  centerLoadLabel: document.getElementById('centerLoadLabel'),
  searchInput: document.getElementById('searchInput'),
  positionFilter: document.getElementById('positionFilter'),
  starsFilter: document.getElementById('starsFilter'),
  classFilter: document.getElementById('classFilter'),
  stageFilter: document.getElementById('stageFilter'),
  clearButton: document.getElementById('clearButton'),
  previewButton: document.getElementById('previewButton'),
  saveButton: document.getElementById('saveButton'),
  calculateOverlay: document.getElementById('calculateOverlay'),
  calculateEyebrow: document.getElementById('calculateEyebrow'),
  calculateTitle: document.getElementById('calculateTitle'),
  calculateCopy: document.getElementById('calculateCopy'),
  calculateProgress: document.getElementById('calculateProgress'),
  calculateProgressLabel: document.getElementById('calculateProgressLabel'),
  calculateProgressValue: document.getElementById('calculateProgressValue'),
  calculateProgressBar: document.getElementById('calculateProgressBar'),
  calculateStats: document.getElementById('calculateStats'),
  calculateActions: document.getElementById('calculateActions'),
  calculateReviewButton: document.getElementById('calculateReviewButton'),
  calculateSaveButton: document.getElementById('calculateSaveButton'),
  recruitingSpoilerGate: document.getElementById('recruitingSpoilerGate'),
  recruitingSpoilerEyebrow: document.querySelector('.recruiting-spoiler-eyebrow'),
  recruitingSpoilerTitle: document.getElementById('recruitingSpoilerTitle'),
  recruitingSpoilerCopy: document.getElementById('recruitingSpoilerCopy'),
  recruitingSpoilerNote: document.getElementById('recruitingSpoilerNote'),
  showRecruitingSpoilersButton: document.getElementById('showRecruitingSpoilersButton'),
  hideRecruitingSpoilersButton: document.getElementById('hideRecruitingSpoilersButton'),
  selectFolderButton: document.getElementById('selectFolderButton'),
  dynastyFileSelect: document.getElementById('dynastyFileSelect'),
  refreshFolderButton: document.getElementById('refreshFolderButton'),
  detailProfileButton: document.getElementById('detailProfileButton'),
  detailRatingsButton: document.getElementById('detailRatingsButton'),
  detailAbilitiesButton: document.getElementById('detailAbilitiesButton'),
  recruitsViewButton: document.getElementById('recruitsViewButton'),
  settingsViewButton: document.getElementById('settingsViewButton'),
  recruitsView: document.getElementById('recruitsView'),
  rawView: document.getElementById('rawView'),
  settingsView: document.getElementById('settingsView'),
  rawTableSelect: document.getElementById('rawTableSelect'),
  rawSearchInput: document.getElementById('rawSearchInput'),
  rawClearButton: document.getElementById('rawClearButton'),
  rawTableStats: document.getElementById('rawTableStats'),
  rawTableWrap: document.querySelector('.raw-table-wrap'),
  rawHeaderRow: document.getElementById('rawHeaderRow'),
  rawTbody: document.querySelector('#rawTable tbody'),
  rawEmptyState: document.getElementById('rawEmptyState'),
  saveAppDefaultsButton: document.getElementById('saveAppDefaultsButton'),
  appDefaultSettingsStatus: document.getElementById('appDefaultSettingsStatus'),
  settingsInfoPanel: document.getElementById('settingsInfoPanel'),
  settingsConfigNameInput: document.getElementById('settingsConfigNameInput'),
  settingsConfigStatus: document.getElementById('settingsConfigStatus'),
  exportSettingsConfigButton: document.getElementById('exportSettingsConfigButton'),
  importSettingsConfigButton: document.getElementById('importSettingsConfigButton'),
  globalRatingVarianceBody: document.getElementById('globalRatingVarianceBody'),
  globalRatingVarianceStatus: document.getElementById('globalRatingVarianceStatus'),
  resetGlobalRatingVarianceButton: document.getElementById('resetGlobalRatingVarianceButton'),
  diamondInTheRoughPercentSlider: document.getElementById('diamondInTheRoughPercentSlider'),
  diamondInTheRoughPercentValue: document.getElementById('diamondInTheRoughPercentValue'),
  diamondInTheRoughStatus: document.getElementById('diamondInTheRoughStatus'),
  resetDiamondInTheRoughButton: document.getElementById('resetDiamondInTheRoughButton'),
  blueChipPercentSlider: document.getElementById('blueChipPercentSlider'),
  blueChipPercentValue: document.getElementById('blueChipPercentValue'),
  blueChipStatus: document.getElementById('blueChipStatus'),
  resetBlueChipButton: document.getElementById('resetBlueChipButton'),
  projectPlayersToggle: document.getElementById('projectPlayersToggle'),
  projectPlayersStatus: document.getElementById('projectPlayersStatus'),
  resetProjectPlayersButton: document.getElementById('resetProjectPlayersButton'),
  hideGemsBustsToggle: document.getElementById('hideGemsBustsToggle'),
  hideGemsBustsStatus: document.getElementById('hideGemsBustsStatus'),
  resetHideGemsBustsButton: document.getElementById('resetHideGemsBustsButton'),
  gemBustVarianceRows: document.getElementById('gemBustVarianceRows'),
  gemBustVarianceStatus: document.getElementById('gemBustVarianceStatus'),
  resetGemBustVarianceButton: document.getElementById('resetGemBustVarianceButton'),
  starCaliberStrengthRows: document.getElementById('starCaliberStrengthRows'),
  starCaliberStrengthStatus: document.getElementById('starCaliberStrengthStatus'),
  resetStarCaliberStrengthButton: document.getElementById('resetStarCaliberStrengthButton'),
  heightVarianceBody: document.getElementById('heightVarianceBody'),
  heightVarianceStatus: document.getElementById('heightVarianceStatus'),
  resetHeightVarianceButton: document.getElementById('resetHeightVarianceButton'),
  weightVarianceBody: document.getElementById('weightVarianceBody'),
  weightVarianceStatus: document.getElementById('weightVarianceStatus'),
  resetWeightVarianceButton: document.getElementById('resetWeightVarianceButton'),
  resetNameSuffixesButton: document.getElementById('resetNameSuffixesButton'),
  skinToneSettingsBody: document.getElementById('skinToneSettingsBody'),
  resetSkinToneButton: document.getElementById('resetSkinToneButton'),
  saveSkinToneButton: document.getElementById('saveSkinToneButton'),
  nameWeightGroupSelect: document.getElementById('nameWeightGroupSelect'),
  nameWeightSearchInput: document.getElementById('nameWeightSearchInput'),
  nameWeightSettingsBody: document.getElementById('nameWeightSettingsBody'),
  nameWeightStats: document.getElementById('nameWeightStats'),
  nameWeightStatus: document.getElementById('nameWeightStatus'),
  addNameWeightButton: document.getElementById('addNameWeightButton'),
  reloadNameWeightsButton: document.getElementById('reloadNameWeightsButton'),
  saveNameWeightsButton: document.getElementById('saveNameWeightsButton'),
  headerRow: document.getElementById('headerRow'),
  tableWrap: document.querySelector('.table-wrap'),
  table: document.getElementById('recruitTable'),
  tbody: document.querySelector('#recruitTable tbody'),
  emptyState: document.getElementById('emptyState'),
  emptyStateText: document.getElementById('emptyStateText'),
  detailPanel: document.getElementById('detailPanel'),
  detailName: document.getElementById('detailName'),
  groupHeaderRow: document.getElementById('groupHeaderRow'),
  detailBody: document.getElementById('detailBody')
};

const detailProfileReportFields = [
  { label: 'First', key: 'firstName' },
  { label: 'Last', key: 'lastName' },
  { label: 'National', key: 'nationalRank' },
  { label: 'Position', key: 'recruitPosition' },
  { label: 'Player Position', key: 'playerPosition' },
  { label: 'Alternate Positions', key: 'alternatePositions' },
  { label: 'Archetype', key: 'playerType' },
  { label: 'Stars', key: 'stars' },
  { label: 'Class', key: 'class' },
  { label: 'Height', key: 'height' },
  { label: 'Weight', key: 'weight' },
  { label: 'Town', key: 'homeTown' },
  { label: 'State', key: 'homeState' },
  { label: 'Pipeline', key: 'pipeline' },
  { label: 'Stage', key: 'stage' },
  { label: 'Gem/Bust', key: 'gemBust' },
  { label: 'Dev', key: 'devTrait' },
  { label: 'Dealbreaker', key: 'recruitingDealbreaker' },
  { label: 'Pitch', key: 'idealRecruitingPitch' },
  { label: 'Offers', key: 'offers' },
  { label: 'Commit', key: 'commitScore' },
  { label: 'Board', key: 'onUserBoard' },
  { label: 'Scholarship', key: 'scholarshipStatus' },
  { label: 'Hours', key: 'hours' },
  { label: 'Influence', key: 'influence' },
  { label: 'Influence Delta', key: 'influenceDelta' },
  { label: 'Influence Last Week', key: 'influenceLastWeek' },
  { label: 'Base NIL Value', key: 'baseNilValue' },
  { label: 'Body Type', key: 'characterBodyTypeLabel' },
  { label: 'Head ID', key: 'genericHeadPortraitId' },
  { label: 'Portrait ID', key: 'portraitId' },
  { label: 'Recruit Row', key: 'recruitRow' },
  { label: 'Player Row', key: 'playerRow' },
  { label: 'Top Schools Row', key: 'topSchoolsArrayRow' }
];

const reportSourceTables = [
  { table: 'Recruit', file: 'FRANCHISE_Recruit_1873209313.json', purpose: 'Recruit rank, class, stage, offers, top-school list reference.' },
  { table: 'PLAY', file: 'FRANCHISE_PLAY.json', purpose: 'Names, position, home town/state, portrait fields, CharacterVisuals reference, star enum, OVR, base NIL value, and player ratings.' },
  { table: 'UserRecruitTarget', file: 'FRANCHISE_UserRecruitTarget_3987156317.json', purpose: 'User board, scholarship status, hours, influence, NIL offer/expectation, favorite/action fields.' },
  { table: 'ProspectTargetSchool[]', file: 'FRANCHISE_ProspectTargetSchool__2332540366.json', purpose: 'Ten top-school references per recruit.' },
  { table: 'ProspectTargetSchool', file: 'FRANCHISE_ProspectTargetSchool_3789266353.json', purpose: 'Exact TeamId and TeamInfluence for each top-school entry.' },
  { table: 'Team', file: 'FRANCHISE_TEAM.json', purpose: 'Save-specific TeamIndex to school display map used by ProspectTargetSchool.TeamId.' },
  { table: 'PositionSignatureAbility[]', file: 'FRANCHISE_PositionSignatureAbility__98263752.json', purpose: 'Signature-ability reference array discovered from the native dynasty table index.' },
  { table: 'PositionToAbilityTable', file: 'FRANCHISE_PositionToAbilityTable_2459081317.json', purpose: 'Position-to-ability tuning table used while tracing physical ability slot mapping.' },
  { table: 'Player_Portraits', file: 'assets/Player_Portraits/*Generic/*/nilpp_*.webp', purpose: 'Detail-view recruit face images keyed by GenericHeadAssetName.' },
  { table: 'team-logos', file: 'assets/team-logos/*.webp', purpose: 'Exact named school logos; numeric PNG fallback is intentionally disabled.' }
];

function formatNumber(value) {
  return Number(value || 0).toLocaleString();
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const SETTINGS_INFO = Object.freeze({
  globalRating: {
    title: 'Global Rating Variance',
    body: 'Add variance to any rating you want to tune. For example, if you do not use Wear and Tear, you may prefer a higher stamina variance.'
  },
  diamondInTheRough: {
    title: 'Diamond in the Rough',
    body: 'Add an extra boost layer to a percentage of gems rated 3 stars or lower.'
  },
  blueChip: {
    title: 'Blue Chip',
    body: 'Add an extra boost layer to a percentage of 4- and 5-star recruits.'
  },
  projectPlayers: {
    title: 'Project Players',
    body: 'Slightly rework a small percentage of players into project builds with strong athleticism and potential, but less current skill.'
  },
  hideGemsBusts: {
    title: 'Hide Gems and Busts',
    body: 'Remove gem and bust tags from recruits, so scouting depends on understanding ratings and deciding each player\'s caliber yourself.'
  },
  gemBust: {
    title: 'Gem/Bust Variance',
    body: 'Add or subtract rating variance for gems and busts.'
  },
  starStrength: {
    title: 'Star Strength',
    body: 'Adjust the baseline strength of players by star caliber.'
  },
  skinTone: {
    title: 'Skin Tone %',
    body: 'Adjust skin tone percentages by position.'
  },
  heightVariance: {
    title: 'Height Variance',
    body: 'Add variance to recruit height.'
  },
  weightVariance: {
    title: 'Weight Variance',
    body: 'Add variance to recruit weight.'
  },
  nameSuffixes: {
    title: 'Name Suffixes',
    body: 'Add suffixes to a small percentage of names.'
  },
  nameWeights: {
    title: 'Name Weights',
    body: 'Add names and adjust how often they appear in the name generator.'
  }
});

function renderSettingsInfoPanel(panelKey = state.settingsPanel) {
  if (!dom.settingsInfoPanel) return;
  const info = SETTINGS_INFO[panelKey] || {
    title: 'Settings Guide',
    body: 'Open a setting to see what it changes.'
  };
  dom.settingsInfoPanel.innerHTML = `
    <h3>${escapeHtml(info.title)}</h3>
    <p>${escapeHtml(info.body)}</p>`;
}

function renderSettingModuleToggles() {
  document.querySelectorAll('[data-setting-module-toggle]').forEach((input) => {
    const key = input.dataset.settingModuleToggle;
    input.checked = isSettingModuleEnabled(key);
    const label = input.closest('.setting-module-toggle')?.querySelector('span');
    if (label) label.textContent = input.checked ? 'On' : 'Off';
  });
}

function setSettingModuleEnabled(key, enabled) {
  if (!SETTING_MODULE_KEYS.includes(key)) return;
  state.settingModules = sanitizeSettingModules(state.settingModules);
  state.settingModules[key] = Boolean(enabled);
  storeSettingModules();
  autoSaveCurrentSettingsConfig();
  invalidatePreviewFromSettingsChange();
  renderSettingModuleToggles();
  setStatus(`${SETTINGS_INFO[key]?.title || 'Setting'} ${state.settingModules[key] ? 'enabled' : 'disabled'}. Click Calculate to generate changes.`);
}

function resetSettingModuleToDefault(key) {
  if (!SETTING_MODULE_KEYS.includes(key)) return;
  state.settingModules = sanitizeSettingModules(state.settingModules);
  state.settingModules[key] = defaultSettingModules()[key] !== false;
  storeSettingModules();
  renderSettingModuleToggles();
}

function ratingLabel(field) {
  if (field === 'OverallRating') return 'OVR';
  return String(field || '')
    .replace(/Rating$/, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\bBC\b/g, 'BCV')
    .replace(/\bAccuracy\b/g, 'Acc')
    .replace(/\bAcceleration\b/g, 'Accel')
    .replace(/\bAwareness\b/g, 'AWR')
    .replace(/\bBlock\b/g, 'Blk')
    .replace(/\bCoverage\b/g, 'Cov')
    .replace(/\bFinesse\b/g, 'Fin')
    .replace(/\bPower\b/g, 'Pwr')
    .replace(/\bRecognition\b/g, 'Rec')
    .replace(/\bSpectacular\b/g, 'Spec')
    .replace(/\bThrow\b/g, 'Throw')
    .replace(/\s+/g, ' ')
    .trim();
}

function readStoredJsonSetting(storageKey, fallback) {
  try {
    const raw = window.localStorage?.getItem(storageKey);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function writeStoredJsonSetting(storageKey, value) {
  try {
    window.localStorage?.setItem(storageKey, JSON.stringify(value));
  } catch {
    // Local storage is a convenience only; preview can still run without it.
  }
}

function sanitizeSettingsConfigName(value) {
  const clean = String(value || '').replace(/\s+/g, ' ').trim();
  return clean || DEFAULT_SETTINGS_CONFIG_NAME;
}

function readStoredSettingsConfigName(fallback = DEFAULT_SETTINGS_CONFIG_NAME) {
  return sanitizeSettingsConfigName(readStoredJsonSetting(SETTINGS_CONFIG_NAME_STORAGE_KEY, fallback));
}

function storeSettingsConfigName() {
  writeStoredJsonSetting(SETTINGS_CONFIG_NAME_STORAGE_KEY, sanitizeSettingsConfigName(state.settingsConfigName));
}

function renderSettingsConfigPanel() {
  const name = sanitizeSettingsConfigName(state.settingsConfigName);
  state.settingsConfigName = name;
  if (dom.settingsConfigNameInput && dom.settingsConfigNameInput.value !== name) {
    dom.settingsConfigNameInput.value = name;
  }
  if (dom.settingsConfigStatus) dom.settingsConfigStatus.textContent = name;
}

function sanitizeSettingModules(value) {
  const source = value && typeof value === 'object' ? value : {};
  return Object.fromEntries(SETTING_MODULE_KEYS.map((key) => [key, source[key] === undefined ? true : Boolean(source[key])]));
}

function defaultSettingModules() {
  return sanitizeSettingModules(appDefaultSettings?.settingModules ?? hardDefaultSettingModules());
}

function readStoredSettingModules() {
  try {
    const raw = window.localStorage?.getItem(SETTING_MODULES_STORAGE_KEY);
    return sanitizeSettingModules(raw ? JSON.parse(raw) : defaultSettingModules());
  } catch {
    return defaultSettingModules();
  }
}

function storeSettingModules() {
  writeStoredJsonSetting(SETTING_MODULES_STORAGE_KEY, sanitizeSettingModules(state.settingModules));
}

function isSettingModuleEnabled(key) {
  if (FORCED_SETTING_MODULE_KEYS.has(key)) return true;
  if (key === 'projectPlayers') return sanitizeProjectPlayersSettings(state.projectPlayersSettings).enabled;
  if (key === 'hideGemsBusts') return sanitizeHideGemsBustsSettings(state.hideGemsBustsSettings).enabled;
  return sanitizeSettingModules(state.settingModules)[key] !== false;
}

function hardDefaultGlobalRatingVariance() {
  return Object.fromEntries(ADJUSTABLE_RATING_FIELDS.map((field) => [field, { min: 0, max: 0 }]));
}

function hardDefaultSettingModules() {
  return Object.fromEntries(SETTING_MODULE_KEYS.map((key) => [key, true]));
}

function hardDefaultDiamondInTheRoughSettings() {
  return { percent: DEFAULT_DIAMOND_IN_THE_ROUGH_PERCENT };
}

function hardDefaultBlueChipSettings() {
  return { percent: DEFAULT_BLUE_CHIP_PERCENT };
}

function hardDefaultProjectPlayersSettings() {
  return { enabled: DEFAULT_PROJECT_PLAYERS_ENABLED };
}

function hardDefaultHideGemsBustsSettings() {
  return { enabled: DEFAULT_HIDE_GEMS_BUSTS_ENABLED };
}

function hardDefaultGemBustVariance() {
  return {
    '5': { min: 4, max: 2 },
    '4': { min: 4, max: 4 },
    '3': { min: 6, max: 6 },
    '2': { min: 6, max: 6 },
    '1': { min: 6, max: 6 }
  };
}

function hardDefaultStarCaliberStrength() {
  return Object.fromEntries(STAR_CALIBER_ORDER.map((stars) => [String(stars), 0]));
}

function hardDefaultPositionVariance() {
  return Object.fromEntries(POSITION_ORDER.map((position) => [position, { min: 0, max: 0 }]));
}

function readAppDefaultSettings() {
  const hardDefaults = {
    version: APP_DEFAULT_SETTINGS_VERSION,
    configName: DEFAULT_SETTINGS_CONFIG_NAME,
    settingModules: hardDefaultSettingModules(),
    globalRatingVariance: hardDefaultGlobalRatingVariance(),
    diamondInTheRoughSettings: hardDefaultDiamondInTheRoughSettings(),
    blueChipSettings: hardDefaultBlueChipSettings(),
    projectPlayersSettings: hardDefaultProjectPlayersSettings(),
    hideGemsBustsSettings: hardDefaultHideGemsBustsSettings(),
    gemBustVariance: hardDefaultGemBustVariance(),
    starCaliberStrength: hardDefaultStarCaliberStrength(),
    heightVariance: hardDefaultPositionVariance(),
    weightVariance: hardDefaultPositionVariance(),
    skinToneSettings: defaultSkinToneSettings()
  };
  const storedDefaults = readStoredJsonSetting(APP_DEFAULT_SETTINGS_STORAGE_KEY, null);
  if (storedDefaults && typeof storedDefaults === 'object') {
    return {
      version: APP_DEFAULT_SETTINGS_VERSION,
      savedAt: storedDefaults.savedAt || '',
      configName: sanitizeSettingsConfigName(storedDefaults.configName ?? storedDefaults.name ?? hardDefaults.configName),
      settingModules: sanitizeSettingModules(storedDefaults.settingModules ?? hardDefaults.settingModules),
      globalRatingVariance: sanitizeGlobalRatingVariance(storedDefaults.globalRatingVariance ?? hardDefaults.globalRatingVariance),
      diamondInTheRoughSettings: sanitizeDiamondInTheRoughSettings(storedDefaults.diamondInTheRoughSettings ?? hardDefaults.diamondInTheRoughSettings),
      blueChipSettings: sanitizeBlueChipSettings(storedDefaults.blueChipSettings ?? hardDefaults.blueChipSettings),
      projectPlayersSettings: sanitizeProjectPlayersSettings(storedDefaults.projectPlayersSettings ?? hardDefaults.projectPlayersSettings),
      hideGemsBustsSettings: sanitizeHideGemsBustsSettings(storedDefaults.hideGemsBustsSettings ?? hardDefaults.hideGemsBustsSettings),
      gemBustVariance: sanitizeGemBustVariance(storedDefaults.gemBustVariance ?? hardDefaults.gemBustVariance),
      starCaliberStrength: sanitizeStarCaliberStrength(storedDefaults.starCaliberStrength ?? hardDefaults.starCaliberStrength),
      heightVariance: sanitizePositionVariance(storedDefaults.heightVariance ?? hardDefaults.heightVariance, clampHeightVariance),
      weightVariance: sanitizePositionVariance(storedDefaults.weightVariance ?? hardDefaults.weightVariance, clampWeightVariance),
      skinToneSettings: sanitizeSkinToneSettings(storedDefaults.skinToneSettings ?? hardDefaults.skinToneSettings)
    };
  }

  const snapshot = {
    version: APP_DEFAULT_SETTINGS_VERSION,
    savedAt: new Date().toISOString(),
    configName: sanitizeSettingsConfigName(readStoredJsonSetting(SETTINGS_CONFIG_NAME_STORAGE_KEY, hardDefaults.configName)),
    settingModules: sanitizeSettingModules(
      readStoredJsonSetting(SETTING_MODULES_STORAGE_KEY, hardDefaults.settingModules)
    ),
    globalRatingVariance: sanitizeGlobalRatingVariance(
      readStoredJsonSetting(GLOBAL_RATING_VARIANCE_STORAGE_KEY, hardDefaults.globalRatingVariance)
    ),
    diamondInTheRoughSettings: sanitizeDiamondInTheRoughSettings(
      readStoredJsonSetting(DIAMOND_IN_THE_ROUGH_SETTINGS_STORAGE_KEY, hardDefaults.diamondInTheRoughSettings)
    ),
    blueChipSettings: sanitizeBlueChipSettings(
      readStoredJsonSetting(BLUE_CHIP_SETTINGS_STORAGE_KEY, hardDefaults.blueChipSettings)
    ),
    projectPlayersSettings: sanitizeProjectPlayersSettings(
      readStoredJsonSetting(PROJECT_PLAYERS_STORAGE_KEY, hardDefaults.projectPlayersSettings)
    ),
    hideGemsBustsSettings: sanitizeHideGemsBustsSettings(
      readStoredJsonSetting(HIDE_GEMS_BUSTS_STORAGE_KEY, hardDefaults.hideGemsBustsSettings)
    ),
    gemBustVariance: sanitizeGemBustVariance(
      readStoredJsonSetting(GEM_BUST_VARIANCE_STORAGE_KEY, hardDefaults.gemBustVariance)
    ),
    starCaliberStrength: sanitizeStarCaliberStrength(
      readStoredJsonSetting(STAR_CALIBER_STRENGTH_STORAGE_KEY, hardDefaults.starCaliberStrength)
    ),
    heightVariance: sanitizePositionVariance(
      readStoredJsonSetting(HEIGHT_VARIANCE_STORAGE_KEY, hardDefaults.heightVariance),
      clampHeightVariance
    ),
    weightVariance: sanitizePositionVariance(
      readStoredJsonSetting(WEIGHT_VARIANCE_STORAGE_KEY, hardDefaults.weightVariance),
      clampWeightVariance
    ),
    skinToneSettings: hardDefaults.skinToneSettings
  };
  writeStoredJsonSetting(APP_DEFAULT_SETTINGS_STORAGE_KEY, snapshot);
  return snapshot;
}

function clampDiamondInTheRoughPercent(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_DIAMOND_IN_THE_ROUGH_PERCENT;
  return Math.max(0, Math.min(100, Math.round(parsed)));
}

function sanitizeDiamondInTheRoughSettings(value) {
  if (value && typeof value === 'object') {
    return { percent: clampDiamondInTheRoughPercent(value.percent ?? value.chance ?? value.rate) };
  }
  return { percent: clampDiamondInTheRoughPercent(value ?? DEFAULT_DIAMOND_IN_THE_ROUGH_PERCENT) };
}

function defaultDiamondInTheRoughSettings() {
  return sanitizeDiamondInTheRoughSettings(appDefaultSettings?.diamondInTheRoughSettings ?? hardDefaultDiamondInTheRoughSettings());
}

function readStoredDiamondInTheRoughSettings() {
  try {
    const raw = window.localStorage?.getItem(DIAMOND_IN_THE_ROUGH_SETTINGS_STORAGE_KEY);
    return sanitizeDiamondInTheRoughSettings(raw ? JSON.parse(raw) : defaultDiamondInTheRoughSettings());
  } catch {
    return defaultDiamondInTheRoughSettings();
  }
}

function storeDiamondInTheRoughSettings() {
  writeStoredJsonSetting(
    DIAMOND_IN_THE_ROUGH_SETTINGS_STORAGE_KEY,
    sanitizeDiamondInTheRoughSettings(state.diamondInTheRoughSettings)
  );
}

function clampBlueChipPercent(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_BLUE_CHIP_PERCENT;
  return Math.max(0, Math.min(100, Math.round(parsed)));
}

function sanitizeBlueChipSettings(value) {
  if (value && typeof value === 'object') {
    return { percent: clampBlueChipPercent(value.percent ?? value.chance ?? value.rate) };
  }
  return { percent: clampBlueChipPercent(value ?? DEFAULT_BLUE_CHIP_PERCENT) };
}

function defaultBlueChipSettings() {
  return sanitizeBlueChipSettings(appDefaultSettings?.blueChipSettings ?? hardDefaultBlueChipSettings());
}

function readStoredBlueChipSettings() {
  try {
    const raw = window.localStorage?.getItem(BLUE_CHIP_SETTINGS_STORAGE_KEY);
    return sanitizeBlueChipSettings(raw ? JSON.parse(raw) : defaultBlueChipSettings());
  } catch {
    return defaultBlueChipSettings();
  }
}

function storeBlueChipSettings() {
  writeStoredJsonSetting(BLUE_CHIP_SETTINGS_STORAGE_KEY, sanitizeBlueChipSettings(state.blueChipSettings));
}

function sanitizeToggleSetting(value, fallbackEnabled = true) {
  if (value && typeof value === 'object') {
    const enabled = value.enabled ?? value.active ?? value.on;
    return { enabled: enabled === undefined ? Boolean(fallbackEnabled) : Boolean(enabled) };
  }
  if (value === undefined || value === null || value === '') return { enabled: Boolean(fallbackEnabled) };
  return { enabled: Boolean(value) };
}

function sanitizeProjectPlayersSettings(value) {
  return sanitizeToggleSetting(value, DEFAULT_PROJECT_PLAYERS_ENABLED);
}

function defaultProjectPlayersSettings() {
  return sanitizeProjectPlayersSettings(appDefaultSettings?.projectPlayersSettings ?? hardDefaultProjectPlayersSettings());
}

function readStoredProjectPlayersSettings() {
  try {
    const raw = window.localStorage?.getItem(PROJECT_PLAYERS_STORAGE_KEY);
    return sanitizeProjectPlayersSettings(raw ? JSON.parse(raw) : defaultProjectPlayersSettings());
  } catch {
    return defaultProjectPlayersSettings();
  }
}

function storeProjectPlayersSettings() {
  writeStoredJsonSetting(PROJECT_PLAYERS_STORAGE_KEY, sanitizeProjectPlayersSettings(state.projectPlayersSettings));
}

function sanitizeHideGemsBustsSettings(value) {
  return sanitizeToggleSetting(value, DEFAULT_HIDE_GEMS_BUSTS_ENABLED);
}

function defaultHideGemsBustsSettings() {
  return sanitizeHideGemsBustsSettings(appDefaultSettings?.hideGemsBustsSettings ?? hardDefaultHideGemsBustsSettings());
}

function readStoredHideGemsBustsSettings() {
  try {
    const raw = window.localStorage?.getItem(HIDE_GEMS_BUSTS_STORAGE_KEY);
    return sanitizeHideGemsBustsSettings(raw ? JSON.parse(raw) : defaultHideGemsBustsSettings());
  } catch {
    return defaultHideGemsBustsSettings();
  }
}

function storeHideGemsBustsSettings() {
  writeStoredJsonSetting(HIDE_GEMS_BUSTS_STORAGE_KEY, sanitizeHideGemsBustsSettings(state.hideGemsBustsSettings));
}

function clampGlobalRatingVariance(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(MAX_GLOBAL_RATING_VARIANCE, Math.round(parsed)));
}

function sanitizeGlobalRatingVarianceRange(value) {
  if (value && typeof value === 'object') {
    return {
      min: clampGlobalRatingVariance(value.min ?? value.minimum ?? value.lower ?? value.down ?? value.negative ?? 0),
      max: clampGlobalRatingVariance(value.max ?? value.maximum ?? value.upper ?? value.up ?? value.positive ?? 0)
    };
  }
  const symmetric = clampGlobalRatingVariance(value);
  return { min: symmetric, max: symmetric };
}

function sanitizeGlobalRatingVariance(value) {
  const source = value && typeof value === 'object' ? value : {};
  return Object.fromEntries(ADJUSTABLE_RATING_FIELDS.map((field) => [
    field,
    sanitizeGlobalRatingVarianceRange(source[field])
  ]));
}

function defaultGlobalRatingVariance() {
  return sanitizeGlobalRatingVariance(appDefaultSettings?.globalRatingVariance ?? hardDefaultGlobalRatingVariance());
}

function readStoredGlobalRatingVariance() {
  try {
    const raw = window.localStorage?.getItem(GLOBAL_RATING_VARIANCE_STORAGE_KEY);
    return sanitizeGlobalRatingVariance(raw ? JSON.parse(raw) : defaultGlobalRatingVariance());
  } catch {
    return defaultGlobalRatingVariance();
  }
}

function storeGlobalRatingVarianceSettings() {
  writeStoredJsonSetting(
    GLOBAL_RATING_VARIANCE_STORAGE_KEY,
    sanitizeGlobalRatingVariance(state.globalRatingVariance)
  );
}

function clampGemBustVariance(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(MAX_GEM_BUST_VARIANCE, Math.round(parsed)));
}

function sanitizeGemBustVarianceRange(value) {
  if (value && typeof value === 'object') {
    return {
      min: clampGemBustVariance(value.min ?? value.minimum ?? value.lower ?? value.down ?? value.negative ?? 0),
      max: clampGemBustVariance(value.max ?? value.maximum ?? value.upper ?? value.up ?? value.positive ?? 0)
    };
  }
  const symmetric = clampGemBustVariance(value);
  return { min: symmetric, max: symmetric };
}

function defaultGemBustVariance() {
  return sanitizeGemBustVariance(appDefaultSettings?.gemBustVariance ?? hardDefaultGemBustVariance());
}

function sanitizeGemBustVariance(value) {
  if (value === null || value === undefined || value === '') return defaultGemBustVariance();
  if (typeof value !== 'object') {
    const shared = sanitizeGemBustVarianceRange(value);
    return Object.fromEntries(STAR_CALIBER_ORDER.map((stars) => [String(stars), shared]));
  }
  return Object.fromEntries(STAR_CALIBER_ORDER.map((stars) => [
    String(stars),
    sanitizeGemBustVarianceRange(value[String(stars)] ?? value[stars])
  ]));
}

function readStoredGemBustVariance() {
  try {
    const raw = window.localStorage?.getItem(GEM_BUST_VARIANCE_STORAGE_KEY);
    if (!raw) return defaultGemBustVariance();
    let parsed = raw;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = raw;
    }
    return sanitizeGemBustVariance(parsed);
  } catch {
    return defaultGemBustVariance();
  }
}

function storeGemBustVarianceSettings() {
  writeStoredJsonSetting(GEM_BUST_VARIANCE_STORAGE_KEY, sanitizeGemBustVariance(state.gemBustVariance));
}

function clampStrengthDelta(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(-MAX_STRENGTH_DELTA, Math.min(MAX_STRENGTH_DELTA, Math.round(parsed)));
}

function strengthSliderValue(delta) {
  return clampStrengthDelta(delta) + STRENGTH_SLIDER_MIDPOINT;
}

function strengthDeltaFromSlider(value) {
  return clampStrengthDelta(Number(value) - STRENGTH_SLIDER_MIDPOINT);
}

function defaultStarCaliberStrength() {
  return sanitizeStarCaliberStrength(appDefaultSettings?.starCaliberStrength ?? hardDefaultStarCaliberStrength());
}

function sanitizeStarCaliberStrength(value) {
  const source = value && typeof value === 'object' ? value : {};
  return Object.fromEntries(STAR_CALIBER_ORDER.map((stars) => [
    String(stars),
    clampStrengthDelta(source[String(stars)] ?? source[stars])
  ]));
}

function readStoredStarCaliberStrength() {
  try {
    const raw = window.localStorage?.getItem(STAR_CALIBER_STRENGTH_STORAGE_KEY);
    return sanitizeStarCaliberStrength(raw ? JSON.parse(raw) : defaultStarCaliberStrength());
  } catch {
    return defaultStarCaliberStrength();
  }
}

function storeStarCaliberStrengthSettings() {
  writeStoredJsonSetting(STAR_CALIBER_STRENGTH_STORAGE_KEY, sanitizeStarCaliberStrength(state.starCaliberStrength));
}

function clampHeightVariance(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(MAX_HEIGHT_VARIANCE_INCHES, Math.round(parsed)));
}

function clampWeightVariance(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(MAX_WEIGHT_VARIANCE_POUNDS, Math.round(parsed)));
}

function defaultHeightVariance() {
  return sanitizePositionVariance(appDefaultSettings?.heightVariance ?? hardDefaultPositionVariance(), clampHeightVariance);
}

function defaultWeightVariance() {
  return sanitizePositionVariance(appDefaultSettings?.weightVariance ?? hardDefaultPositionVariance(), clampWeightVariance);
}

function sanitizePositionVarianceRange(value, clampFn) {
  if (value && typeof value === 'object') {
    return {
      min: clampFn(value.min ?? value.minimum ?? value.lower ?? value.down ?? value.negative ?? 0),
      max: clampFn(value.max ?? value.maximum ?? value.upper ?? value.up ?? value.positive ?? 0)
    };
  }
  const symmetric = clampFn(value);
  return { min: symmetric, max: symmetric };
}

function sourcePositionValue(source, position) {
  if (!source || typeof source !== 'object') return undefined;
  if (source[position] !== undefined) return source[position];
  const alias = Object.entries(POSITION_ALIASES).find(([, target]) => target === position)?.[0];
  return alias ? source[alias] : undefined;
}

function sanitizePositionVariance(value, clampFn) {
  const source = value && typeof value === 'object' ? value : {};
  return Object.fromEntries(POSITION_ORDER.map((position) => [
    position,
    sanitizePositionVarianceRange(sourcePositionValue(source, position), clampFn)
  ]));
}

function readStoredPositionVariance(storageKey, clampFn) {
  const fallback = storageKey === HEIGHT_VARIANCE_STORAGE_KEY
    ? defaultHeightVariance()
    : storageKey === WEIGHT_VARIANCE_STORAGE_KEY
      ? defaultWeightVariance()
      : hardDefaultPositionVariance();
  try {
    const raw = window.localStorage?.getItem(storageKey);
    return sanitizePositionVariance(raw ? JSON.parse(raw) : fallback, clampFn);
  } catch {
    return fallback;
  }
}

function storePositionVarianceSettings(storageKey, values, clampFn) {
  writeStoredJsonSetting(storageKey, sanitizePositionVariance(values, clampFn));
}

function readStoredDynastyFolderPath() {
  try {
    return String(window.localStorage?.getItem(DYNASTY_FOLDER_STORAGE_KEY) || '').trim();
  } catch {
    return '';
  }
}

function storeDynastyFolderPath(folderPath) {
  try {
    const value = String(folderPath || '').trim();
    if (value) window.localStorage?.setItem(DYNASTY_FOLDER_STORAGE_KEY, value);
    else window.localStorage?.removeItem(DYNASTY_FOLDER_STORAGE_KEY);
  } catch {
    // Folder memory is a convenience only.
  }
}

function fileSizeLabel(bytes) {
  const size = Number(bytes);
  if (!Number.isFinite(size) || size <= 0) return '';
  if (size >= 1024 * 1024) return `${Math.round(size / 1024 / 102.4) / 10} MB`;
  if (size >= 1024) return `${Math.round(size / 1024)} KB`;
  return `${size} B`;
}

function dynastyFileOptionLabel(file) {
  const size = fileSizeLabel(file?.size);
  const date = file?.modifiedAt ? new Date(file.modifiedAt) : null;
  const dateText = date && Number.isFinite(date.getTime()) ? date.toLocaleDateString() : '';
  return [file?.name || 'Dynasty file', size, dateText].filter(Boolean).join(' - ');
}

function renderDynastyFolderSelect(message = '') {
  if (!dom.dynastyFileSelect || !dom.refreshFolderButton || !dom.selectFolderButton) return;
  const folderPath = state.dynastyFolderPath || '';
  const files = Array.isArray(state.dynastyFolderFiles) ? state.dynastyFolderFiles : [];
  dom.selectFolderButton.title = folderPath || 'Choose the folder where your dynasty saves live';
  dom.refreshFolderButton.disabled = state.loading || !folderPath;
  dom.dynastyFileSelect.title = folderPath || '';
  if (!folderPath) {
    dom.dynastyFileSelect.disabled = true;
    dom.dynastyFileSelect.innerHTML = '<option value="">Choose a folder</option>';
    return;
  }
  if (!files.length) {
    dom.dynastyFileSelect.disabled = true;
    dom.dynastyFileSelect.innerHTML = `<option value="">${escapeHtml(message || 'No dynasty files found')}</option>`;
    return;
  }
  const current = state.selectedDynastyPath;
  dom.dynastyFileSelect.disabled = state.loading;
  dom.dynastyFileSelect.innerHTML = [
    '<option value="">Load saved dynasty...</option>',
    ...files.map((file) => `<option value="${escapeHtml(file.path)}">${escapeHtml(dynastyFileOptionLabel(file))}</option>`)
  ].join('');
  if (files.some((file) => file.path === current)) dom.dynastyFileSelect.value = current;
}

function baseRatingValue(row, field) {
  if (field === 'OverallRating') return row.OverallRating ?? row.overall ?? '';
  return row[field] ?? '';
}

function clampRatingValue(field, value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return '';
  if (!RATING_FIELD_SET.has(field)) return Math.round(parsed);
  return Math.max(MIN_RATING_VALUE, Math.min(MAX_RATING_VALUE, Math.round(parsed)));
}

function ratingVarianceFactor(field) {
  if (PHYSICAL_RATING_FIELDS.has(field)) return PHYSICAL_RATING_VARIANCE_FACTOR;
  return SKILL_RATING_VARIANCE_FACTOR;
}

function numericValue(value) {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function applyRatingAdjustmentBudget(field, base, delta) {
  const value = numericValue(clampRatingValue(field, base));
  if (value === null) return null;
  const budget = Math.round(Number(delta) || 0);
  if (!budget || !RATING_FIELD_SET.has(field)) return value;
  if (budget < 0) return numericValue(clampRatingValue(field, value + budget));

  let adjusted = value;
  let remaining = budget;
  while (remaining > 0 && adjusted < MAX_RATING_VALUE) {
    const stepCost = adjusted >= HIGH_RATING_STEP_START ? HIGH_RATING_STEP_COST : 1;
    if (remaining < stepCost) break;
    adjusted += 1;
    remaining -= stepCost;
  }
  return numericValue(clampRatingValue(field, adjusted));
}

function positionOvrGroup(row) {
  const position = normalizePositionKey(row?.position);
  return POSITION_OVR_GROUPS[position] || '';
}

function ovrWeightEntriesForRow(row) {
  const group = positionOvrGroup(row);
  return group ? state.ovrWeightEntriesByPosition.get(group) || [] : [];
}

function ovrRelevantFieldsForGroup(group) {
  if (!group) return new Set();
  if (state.ovrRelevantFieldsByPosition.has(group)) {
    return state.ovrRelevantFieldsByPosition.get(group);
  }
  const weightNames = new Set();
  for (const entry of state.ovrWeightEntriesByPosition.get(group) || []) {
    for (const [name, weight] of Object.entries(entry?.weights || {})) {
      if ((numericValue(weight) || 0) >= MIN_RELEVANT_OVR_WEIGHT) weightNames.add(name);
    }
  }
  const fields = new Set(Object.entries(OVR_WEIGHT_NAME_BY_RATING_FIELD)
    .filter(([, weightName]) => weightNames.has(weightName))
    .map(([field]) => field));
  state.ovrRelevantFieldsByPosition.set(group, fields);
  return fields;
}

function isRatingRelevantToPosition(row, field) {
  if (field === 'OverallRating') return false;
  const weightName = OVR_WEIGHT_NAME_BY_RATING_FIELD[field];
  if (!weightName) return false;
  return ovrRelevantFieldsForGroup(positionOvrGroup(row)).has(field);
}

function isStrengthRatingField(field) {
  return RATING_FIELD_SET.has(field) && field !== 'OverallRating';
}

function starCaliberKey(row) {
  const starCount = Number(row?.starCount);
  if (Number.isFinite(starCount) && starCount >= 1 && starCount <= 5) return String(Math.round(starCount));
  const match = String(row?.stars || '').match(/[1-5]/);
  return match ? match[0] : '';
}

function gemBustVarianceForRow(row) {
  if (!isSettingModuleEnabled('gemBust')) return 0;
  const key = starCaliberKey(row);
  if (!key) return 0;
  const direction = gemBustDirection(row);
  if (!direction) return 0;
  const range = sanitizeGemBustVarianceRange(sanitizeGemBustVariance(state.gemBustVariance)[key]);
  return direction > 0 ? range.max : range.min;
}

function starCaliberAdjustmentDelta(row, field) {
  if (!isSettingModuleEnabled('starStrength')) return 0;
  if (!isStrengthRatingField(field)) return 0;
  const key = starCaliberKey(row);
  if (!key) return 0;
  const delta = clampStrengthDelta(state.starCaliberStrength?.[key]);
  if (!delta) return 0;
  return isRatingRelevantToPosition(row, field) ? delta : 0;
}

function gemBustDirection(row) {
  if (row?.gemBust === 'Gem') return 1;
  if (row?.gemBust === 'Bust') return -1;
  return 0;
}

function gemBustAdjustmentDelta(row, field) {
  const direction = gemBustDirection(row);
  const variance = gemBustVarianceForRow(row);
  if (!direction || !variance) return 0;
  if (!isRatingRelevantToPosition(row, field)) return 0;
  return direction * Math.round(variance * ratingVarianceFactor(field));
}

function globalRatingAdjustmentDelta(row, field) {
  if (!state.previewActive || !ADJUSTABLE_RATING_FIELDS.includes(field)) return 0;
  const delta = Number(previewForRow(row)?.ratingDeltas?.[field]);
  return Number.isFinite(delta) ? Math.round(delta) : 0;
}

function blueChipAdjustmentDelta(row, field) {
  if (!state.previewActive || !ADJUSTABLE_RATING_FIELDS.includes(field)) return 0;
  const delta = Number(previewForRow(row)?.blueChipRatingDeltas?.[field]);
  return Number.isFinite(delta) ? Math.max(0, Math.round(delta)) : 0;
}

function diamondInTheRoughAdjustmentDelta(row, field) {
  if (!state.previewActive || !ADJUSTABLE_RATING_FIELDS.includes(field)) return 0;
  const delta = Number(previewForRow(row)?.diamondInTheRoughRatingDeltas?.[field]);
  return Number.isFinite(delta) ? Math.max(0, Math.round(delta)) : 0;
}

function projectPlayerAdjustmentDelta(row, field) {
  if (!state.previewActive || !ADJUSTABLE_RATING_FIELDS.includes(field)) return 0;
  const delta = Number(previewForRow(row)?.projectPlayerRatingDeltas?.[field]);
  return Number.isFinite(delta) ? Math.round(delta) : 0;
}

function laterRatingAdjustmentDelta(row, field) {
  return starCaliberAdjustmentDelta(row, field)
    + gemBustAdjustmentDelta(row, field);
}

function adjustedRatingValue(row, field) {
  const base = numericValue(baseRatingValue(row, field));
  if (base === null) return null;
  if (!state.previewActive || !ADJUSTABLE_RATING_FIELDS.includes(field)) {
    return numericValue(clampRatingValue(field, base));
  }

  const adjustmentBudget = globalRatingAdjustmentDelta(row, field)
    + laterRatingAdjustmentDelta(row, field)
    + blueChipAdjustmentDelta(row, field)
    + diamondInTheRoughAdjustmentDelta(row, field)
    + projectPlayerAdjustmentDelta(row, field);
  return applyRatingAdjustmentBudget(field, base, adjustmentBudget);
}

function ratingAdjustmentDelta(row, field) {
  if (!state.previewActive) return 0;
  const base = numericValue(baseRatingValue(row, field));
  const adjusted = adjustedRatingValue(row, field);
  if (base === null || adjusted === null) return 0;
  return adjusted - base;
}

function ratingValueForOverallFormula(row, field, adjusted) {
  const base = numericValue(baseRatingValue(row, field));
  if (base === null) return null;
  if (!adjusted) return base;
  return adjustedRatingValue(row, field);
}

function calculateArchetypeOverall(row, entry, adjusted) {
  const desiredLow = numericValue(entry?.desiredLow);
  const desiredHigh = numericValue(entry?.desiredHigh);
  const sumWeight = numericValue(entry?.sum);
  const maxRating = numericValue(entry?.maxRating);
  const weights = entry?.weights;
  if (
    desiredLow === null ||
    desiredHigh === null ||
    desiredHigh === desiredLow ||
    sumWeight === null ||
    sumWeight === 0 ||
    maxRating === null ||
    !weights ||
    typeof weights !== 'object'
  ) {
    return null;
  }

  let weightedSum = 0;
  const ratingRange = desiredHigh - desiredLow;
  for (const [field, weightName] of Object.entries(OVR_WEIGHT_NAME_BY_RATING_FIELD)) {
    const ratingWeight = numericValue(weights[weightName]);
    if (ratingWeight === null || ratingWeight === 0) continue;
    const rating = ratingValueForOverallFormula(row, field, adjusted);
    if (rating === null) continue;
    weightedSum += ((rating - desiredLow) / ratingRange) * (ratingWeight / sumWeight);
  }

  return Math.round(Math.max(0, Math.min(weightedSum * maxRating, maxRating)));
}

function calculateBestOverall(row, adjusted) {
  let best = null;
  for (const entry of ovrWeightEntriesForRow(row)) {
    const overall = calculateArchetypeOverall(row, entry, adjusted);
    if (overall === null) continue;
    if (best === null || overall > best) best = overall;
  }
  return best;
}

function ratingFieldRelevanceWeight(row, field) {
  const weightName = OVR_WEIGHT_NAME_BY_RATING_FIELD[field];
  if (!weightName) return 0;
  return ovrWeightEntriesForRow(row)
    .map((entry) => numericValue(entry?.weights?.[weightName]) || 0)
    .reduce((sum, weight) => sum + weight, 0);
}

function ratingGroupRelevanceWeight(row, group) {
  return group.fields
    .map((field) => ratingFieldRelevanceWeight(row, field))
    .reduce((sum, weight) => sum + weight, 0);
}

function orderedRatingFieldsForGroup(row, group) {
  if (group.key === 'athletic') return group.fields;
  return group.fields
    .map((field, index) => ({ field, index, weight: ratingFieldRelevanceWeight(row, field) }))
    .sort((a, b) => (b.weight - a.weight) || (a.index - b.index))
    .map((entry) => entry.field);
}

function orderedDetailRatingGroups(row) {
  return DETAIL_RATING_GROUPS
    .map((group, index) => ({
      ...group,
      fields: orderedRatingFieldsForGroup(row, group),
      originalIndex: index,
      relevanceWeight: ratingGroupRelevanceWeight(row, group)
    }))
    .sort((a, b) => {
      const bucket = (group) => {
        if (group.key === 'athletic') return 0;
        if (group.relevanceWeight > 0) return 1;
        if (group.key === 'overall') return 2;
        return 3;
      };
      const bucketDiff = bucket(a) - bucket(b);
      if (bucketDiff) return bucketDiff;
      if (a.relevanceWeight !== b.relevanceWeight) return b.relevanceWeight - a.relevanceWeight;
      return a.originalIndex - b.originalIndex;
    });
}

function overallRatingChangeInfo(row) {
  const base = numericValue(baseRatingValue(row, 'OverallRating'));
  if (base === null) return { base: '', value: '', delta: 0 };
  if (!state.previewActive) return { base, value: clampRatingValue('OverallRating', base), delta: 0 };
  const hasGlobalRatingVariance = ADJUSTABLE_RATING_FIELDS.some((field) => globalRatingAdjustmentDelta(row, field));
  const hasBlueChip = Boolean(previewForRow(row)?.blueChip);
  const hasDiamondInTheRough = Boolean(previewForRow(row)?.diamondInTheRough);
  const hasProjectPlayer = Boolean(previewForRow(row)?.projectPlayer);
  const hasGemBust = Boolean(gemBustDirection(row) && gemBustVarianceForRow(row));
  const hasStarCaliberStrength = Boolean(clampStrengthDelta(state.starCaliberStrength?.[starCaliberKey(row)]));
  if (!hasGlobalRatingVariance && !hasBlueChip && !hasDiamondInTheRough && !hasProjectPlayer && !hasGemBust && !hasStarCaliberStrength) {
    return { base, value: clampRatingValue('OverallRating', base), delta: 0 };
  }

  const baseOverall = calculateBestOverall(row, false);
  const adjustedOverall = calculateBestOverall(row, true);
  if (baseOverall === null || adjustedOverall === null) {
    return { base, value: clampRatingValue('OverallRating', base), delta: 0 };
  }

  const value = clampRatingValue('OverallRating', base + (adjustedOverall - baseOverall));
  return { base, value, delta: numericValue(value) - base };
}

function ratingChangeInfo(row, field) {
  if (field === 'OverallRating') return overallRatingChangeInfo(row);
  const base = Number(baseRatingValue(row, field));
  if (!Number.isFinite(base)) return { base: '', value: '', delta: 0 };
  const value = adjustedRatingValue(row, field);
  if (value === null) return { base: '', value: '', delta: 0 };
  return { base, value, delta: Number(value) - base };
}

function ratingValue(row, field) {
  return ratingChangeInfo(row, field).value;
}

function ratingChangeClass(delta) {
  if (delta > 0) return 'rating-up';
  if (delta < 0) return 'rating-down';
  return '';
}

function ratingDisplayHtml(row, field) {
  const info = ratingChangeInfo(row, field);
  if (info.value === '') return '';
  const changeClass = ratingChangeClass(info.delta);
  if (!changeClass) return escapeHtml(info.value);
  const sign = info.delta > 0 ? '+' : '';
  return `<span class="rating-change ${changeClass}"><span>${escapeHtml(info.value)}</span><small>${sign}${escapeHtml(info.delta)}</small></span>`;
}

function bodyTypeLabel(row) {
  if (row.characterBodyTypeLabel) return row.characterBodyTypeLabel;
  const labels = new Map([
    ['0', 'Standard'],
    ['1', 'Thin'],
    ['10', 'Muscular'],
    ['11', 'Heavy'],
    ['100', 'Freshman'],
    ['1000', 'Standard Alternate'],
    ['1001', 'Thin Alternate']
  ]);
  const raw = String(row.characterBodyType ?? '').trim();
  return labels.get(raw) || raw || 'None';
}

function starCountFromValue(count, label) {
  const labelMatch = String(label || '').match(/([1-5])\s*-?\s*star/i);
  if (labelMatch) return Number(labelMatch[1]);

  const parsedCount = Number(count);
  if (!Number.isFinite(parsedCount)) return 0;
  if (parsedCount >= 1 && parsedCount <= 5) return parsedCount;

  const rawEnumStars = new Map([
    [10, 3],
    [11, 4],
    [100, 5]
  ]);
  if (rawEnumStars.has(parsedCount)) return rawEnumStars.get(parsedCount);

  const text = String(count ?? '');
  if (/^[01]+$/.test(text) && text.length > 1) {
    const enumNumber = parseInt(text, 2);
    if (enumNumber >= 0 && enumNumber <= 4) return enumNumber + 1;
  }
  return 0;
}

function starRatingHtml(count, label) {
  const stars = starCountFromValue(count, label);
  if (!stars) return escapeHtml(label || '');
  const filled = Array.from({ length: stars }, () => '<span class="star-gold">&#9733;</span>').join('');
  const ariaLabel = `${stars}-star`;
  return `<span class="star-rating" title="${escapeHtml(label || ariaLabel)}" aria-label="${escapeHtml(ariaLabel)}">${filled}</span>`;
}

function assetSrc(value) {
  let text = String(value || '');
  const assetBaseUrl = state.dataPayload?.files?.assetBaseUrl || '';
  const normalized = text.replace(/\\/g, '/');
  if (assetBaseUrl && /^assets\//i.test(normalized)) {
    try {
      text = new URL(normalized.replace(/^assets\//i, ''), assetBaseUrl).href;
    } catch {
      text = normalized;
    }
  }
  if (/^(?:file|https?|data|blob):/i.test(text)) {
    return escapeHtml(text);
  }
  try {
    return escapeHtml(encodeURI(text));
  } catch {
    return escapeHtml(text);
  }
}

function previewForRow(row) {
  if (!state.previewActive || !row) return null;
  return state.previewByRecruitRow.get(row.recruitRow) || null;
}

function abilityRankUpgradeAmount(row) {
  const preview = previewForRow(row);
  return preview?.blueChip || preview?.diamondInTheRough || preview?.projectPlayer ? 1 : 0;
}

function upgradeAbilityRank(rank, amount = 1) {
  const currentIndex = ABILITY_RANK_ORDER.findIndex((entry) => entry.toLowerCase() === String(rank || '').toLowerCase());
  if (currentIndex < 0) return rank || '';
  const nextIndex = Math.min(ABILITY_RANK_ORDER.length - 1, currentIndex + Math.max(0, Math.round(amount)));
  return ABILITY_RANK_ORDER[nextIndex];
}

function upgradeDevTrait(devTrait, amount = 0) {
  const currentIndex = DEV_TRAIT_ORDER.findIndex((entry) => entry.toLowerCase() === String(devTrait || '').toLowerCase());
  if (currentIndex < 0) return devTrait || '';
  const nextIndex = Math.min(DEV_TRAIT_ORDER.length - 1, currentIndex + Math.max(0, Math.round(amount)));
  return DEV_TRAIT_ORDER[nextIndex];
}

function previewDevTrait(row) {
  const base = row?.devTrait || '';
  const delta = Number(previewForRow(row)?.projectPlayerDevTraitDelta);
  return Number.isFinite(delta) && delta > 0 ? upgradeDevTrait(base, delta) : base;
}

function previewAbilityRank(row, kind, slot) {
  const base = row?.[`${kind}Ability${slot}Rank`] || '';
  const bump = abilityRankUpgradeAmount(row);
  return bump ? upgradeAbilityRank(base, bump) : base;
}

function previewAbilityLabel(row, kind, slot) {
  const name = row?.[`${kind}Ability${slot}Name`] || '';
  const rank = previewAbilityRank(row, kind, slot);
  if (!rank) return '';
  if (kind === 'physical') return name ? `${name} (${rank})` : `P${slot} (${rank})`;
  return name ? `${name} (${rank})` : '';
}

function previewAbilitySummary(row, kind) {
  const slots = kind === 'physical' ? 5 : 3;
  return Array.from({ length: slots }, (_, index) => previewAbilityLabel(row, kind, index + 1))
    .filter(Boolean)
    .join('; ');
}

function previewFieldValue(row, key) {
  const preview = previewForRow(row);
  if (key === 'devTrait') return previewDevTrait(row);
  if (key === 'physicalAbilities') return previewAbilitySummary(row, 'physical') || row?.physicalAbilities || '';
  if (key === 'mentalAbilities') return previewAbilitySummary(row, 'mental') || row?.mentalAbilities || '';
  const physicalRankMatch = String(key).match(/^physicalAbility([1-5])Rank$/);
  if (physicalRankMatch) return previewAbilityRank(row, 'physical', physicalRankMatch[1]);
  const physicalLabelMatch = String(key).match(/^physicalAbility([1-5])$/);
  if (physicalLabelMatch) return previewAbilityLabel(row, 'physical', physicalLabelMatch[1]) || row?.[key] || '';
  const mentalRankMatch = String(key).match(/^mentalAbility([1-3])Rank$/);
  if (mentalRankMatch) return previewAbilityRank(row, 'mental', mentalRankMatch[1]);
  const mentalLabelMatch = String(key).match(/^mentalAbility([1-3])$/);
  if (mentalLabelMatch) return previewAbilityLabel(row, 'mental', mentalLabelMatch[1]) || row?.[key] || '';
  if (!preview) return row?.[key] ?? '';
  if (key === 'firstName') return preview.firstName ?? row.firstName ?? '';
  if (key === 'lastName') return preview.lastName ?? row.lastName ?? '';
  if (key === 'name') return [preview.firstName ?? row.firstName, preview.lastName ?? row.lastName].filter(Boolean).join(' ');
  if (key === 'height') return preview.height ?? row.height ?? '';
  if (key === 'heightTotalInches') return preview.heightTotalInches ?? row.heightTotalInches ?? '';
  if (key === 'weight') return preview.weight ?? row.weight ?? '';
  if (key === 'genericHeadPortraitId') return preview.headId ?? row.genericHeadPortraitId ?? '';
  if (key === 'genericHeadAssetName') return preview.genericHeadAssetName ?? row.genericHeadAssetName ?? '';
  if (key === 'portraitId') return preview.portraitId ?? row.portraitId ?? '';
  if (key === 'portraitPath') return preview.portraitPath ?? row.portraitPath ?? '';
  if (key === 'previewSkinTone') return preview.skinTone ?? '';
  return row?.[key] ?? '';
}

function previewFieldChanged(row, key) {
  const preview = previewForRow(row);
  if (!preview) return false;
  if (key === 'devTrait') return String(previewFieldValue(row, key) || '') !== String(row.devTrait || '');
  if (key === 'physicalAbilities') return String(previewFieldValue(row, key) || '') !== String(row.physicalAbilities || '');
  if (key === 'mentalAbilities') return String(previewFieldValue(row, key) || '') !== String(row.mentalAbilities || '');
  if (/^physicalAbility[1-5]Rank$/.test(String(key)) || /^mentalAbility[1-3]Rank$/.test(String(key))) {
    return String(previewFieldValue(row, key) || '') !== String(row[key] || '');
  }
  if (/^physicalAbility[1-5]$/.test(String(key)) || /^mentalAbility[1-3]$/.test(String(key))) {
    return String(previewFieldValue(row, key) || '') !== String(row[key] || '');
  }
  if (key === 'firstName') return String(preview.firstName ?? '') !== String(row.firstName ?? '');
  if (key === 'lastName') return String(preview.lastName ?? '') !== String(row.lastName ?? '');
  if (key === 'name') return previewFieldChanged(row, 'firstName') || previewFieldChanged(row, 'lastName');
  if (key === 'height') return String(preview.height ?? '') !== String(row.height ?? '');
  if (key === 'heightTotalInches') return Number(preview.heightTotalInches) !== Number(row.heightTotalInches);
  if (key === 'weight') return Number(preview.weight) !== Number(row.weight);
  if (key === 'genericHeadPortraitId') return String(preview.headId ?? '') !== String(row.genericHeadPortraitId ?? '');
  if (key === 'genericHeadAssetName') return String(preview.genericHeadAssetName ?? '') !== String(row.genericHeadAssetName ?? '');
  if (key === 'portraitId') return String(preview.portraitId ?? '') !== String(row.portraitId ?? '');
  if (key === 'portraitPath') return String(preview.portraitPath ?? '') !== String(row.portraitPath ?? '');
  if (key === 'previewSkinTone') return Boolean(preview.skinTone);
  return false;
}

function previewChangeHtml(value) {
  return `<span class="preview-change">${escapeHtml(value)}</span>`;
}

function setStatus(message) {
  dom.statusText.textContent = message;
}

function updateActionButtons() {
  const busy = state.loading || state.calculating;
  if (dom.previewButton) dom.previewButton.disabled = busy || !state.dataLoaded;
  if (dom.saveButton) {
    dom.saveButton.disabled = busy || !state.dataLoaded || !state.previewActive || !state.selectedDynastyPath;
  }
  if (dom.calculateSaveButton) {
    dom.calculateSaveButton.disabled = busy || !state.dataLoaded || !state.previewActive || !state.selectedDynastyPath;
  }
}

function renderRecruitingSpoilerGate() {
  const recruitsActive = state.view === 'recruits';
  const answered = state.recruitingSpoilersVisible !== null;
  const hideSensitiveSpoilers = state.recruitingSpoilersVisible === false;
  document.body.classList.toggle('recruits-active', recruitsActive);
  document.body.classList.toggle('recruiting-spoilers-hidden', hideSensitiveSpoilers);
  if (dom.recruitingSpoilerGate) dom.recruitingSpoilerGate.hidden = answered;
}

function setRecruitingSpoilersVisible(visible) {
  state.recruitingSpoilersVisible = Boolean(visible);
  renderRecruitingSpoilerGate();
  renderSelectedDetail();
}

function nextPaint() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  });
}

function setCalculateProgress(percent, label = '') {
  if (!dom.calculateProgressBar || !dom.calculateProgress) return;
  const value = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
  dom.calculateProgressBar.style.width = `${value}%`;
  dom.calculateProgress.setAttribute('aria-valuenow', String(value));
  if (dom.calculateProgressValue) dom.calculateProgressValue.textContent = `${value}%`;
  if (dom.calculateProgressLabel) dom.calculateProgressLabel.textContent = label || 'Calculating';
}

function renderCalculateStats(stats = []) {
  if (!dom.calculateStats) return;
  const valid = stats.filter((entry) => entry && entry.label);
  dom.calculateStats.hidden = !valid.length;
  dom.calculateStats.innerHTML = valid.map((entry) => `
    <div>
      <span>${escapeHtml(entry.label)}</span>
      <strong>${escapeHtml(entry.value)}</strong>
    </div>
  `).join('');
}

function setCalculateOverlay(mode, options = {}) {
  if (!dom.calculateOverlay) return;
  dom.calculateOverlay.hidden = false;
  dom.calculateOverlay.dataset.mode = mode;
  if (dom.calculateEyebrow) dom.calculateEyebrow.textContent = options.eyebrow || (mode === 'done' ? 'Ready To Save' : mode === 'error' ? 'Calculation Stopped' : 'Calculating');
  if (dom.calculateTitle) dom.calculateTitle.textContent = options.title || 'Calculating recruit changes...';
  if (dom.calculateCopy) dom.calculateCopy.textContent = options.copy || 'Building the preview from the current settings.';
  if (dom.calculateProgress) dom.calculateProgress.hidden = mode !== 'busy';
  if (dom.calculateActions) dom.calculateActions.hidden = mode !== 'done';
  renderCalculateStats(mode === 'busy' ? [] : options.stats || []);
  setCalculateProgress(options.percent ?? 0, options.progressLabel || 'Starting');
  updateActionButtons();
}

function hideCalculateOverlay() {
  if (!dom.calculateOverlay) return;
  dom.calculateOverlay.hidden = true;
  renderCalculateStats([]);
}

function normalizeLoadProgress(update, fallbackMessage = 'Loading Dynasty...') {
  if (update && typeof update === 'object') {
    const percent = Number(update.percent);
    return {
      message: String(update.message || fallbackMessage),
      percent: Number.isFinite(percent) ? Math.max(0, Math.min(100, Math.round(percent))) : null
    };
  }
  return {
    message: String(update || fallbackMessage),
    percent: null
  };
}

function setLoadProgress(percent, { visible = true, label = '' } = {}) {
  if (!dom.loadProgress || !dom.loadProgressBar) return;
  const progressLabel = label || state.loadProgressLabel || 'Loading Dynasty';
  state.loadProgressLabel = progressLabel;
  dom.loadProgress.hidden = !visible;
  dom.loadProgress.setAttribute('aria-label', progressLabel);
  if (percent !== null && percent !== undefined && Number.isFinite(Number(percent))) {
    const value = Math.max(0, Math.min(100, Math.round(Number(percent))));
    state.loadProgressPercent = value;
    dom.loadProgressBar.style.width = `${value}%`;
    dom.loadProgress.setAttribute('aria-valuenow', String(value));
    if (dom.loadProgressValue) dom.loadProgressValue.textContent = `${value}%`;
  } else if (!visible) {
    state.loadProgressPercent = 0;
    dom.loadProgressBar.style.width = '0%';
    dom.loadProgress.setAttribute('aria-valuenow', '0');
    if (dom.loadProgressValue) dom.loadProgressValue.textContent = '0%';
  }
  if (dom.centerLoadLabel) {
    dom.centerLoadLabel.textContent = visible ? progressLabel : '';
  }
}

function setLoadStatus(message, tone = '', options = {}) {
  if (options.progressLabel) state.loadProgressLabel = options.progressLabel;
  state.loadMessage = message || '';
  dom.loadStatus.textContent = state.loadMessage || (state.dataLoaded ? 'Data loaded' : 'No file loaded');
  dom.loadStatus.className = `load-status${tone ? ` ${tone}` : ''}`;
  if (tone === 'busy') setLoadProgress(null, { visible: true, label: state.loadProgressLabel });
  else if (tone === 'done') setLoadProgress(100, { visible: true, label: state.loadProgressLabel });
  else if (tone === 'error') setLoadProgress(null, { visible: false });
  else setLoadProgress(null, { visible: false });
}

function setFileLoading(loading, message = '', options = {}) {
  state.loading = loading;
  if (options.progressLabel) state.loadProgressLabel = options.progressLabel;
  if (dom.selectFolderButton) dom.selectFolderButton.disabled = loading;
  if (dom.refreshFolderButton) dom.refreshFolderButton.disabled = loading || !state.dynastyFolderPath;
  if (dom.dynastyFileSelect) dom.dynastyFileSelect.disabled = loading || !state.dynastyFolderFiles.length;
  updateActionButtons();
  renderRecruitingSpoilerGate();
  if (!loading) renderDynastyFolderSelect();
  if (message) {
    setLoadStatus(message, loading ? 'busy' : '', { progressLabel: state.loadProgressLabel });
    setStatus(message);
  }
  updateFilteredRows();
}

function displayName(row) {
  const splitName = [previewFieldValue(row, 'firstName'), previewFieldValue(row, 'lastName')].filter(Boolean).join(' ');
  return splitName || row.name || 'Unknown Recruit';
}

function normalizePositionKey(position) {
  const key = String(position || '').trim().toUpperCase();
  return POSITION_ALIASES[key] || key;
}

function rowDisplayPosition(row) {
  return normalizePositionKey(row.recruitPosition || row.displayPosition || row.position || '');
}

function fillSelect(select, values, allLabel) {
  const current = select.value;
  select.innerHTML = `<option value="">${escapeHtml(allLabel)}</option>${values
    .map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`)
    .join('')}`;
  if (values.includes(current)) select.value = current;
}

function uniqueSorted(key, sorter) {
  const values = [...new Set(state.rows.map((row) => row[key]).filter(Boolean))];
  return values.sort(sorter || ((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true })));
}

function populateFilters() {
  fillSelect(
    dom.positionFilter,
    [...new Set(state.rows.map(rowDisplayPosition).filter(Boolean))].sort(positionCompare),
    'All positions'
  );
  fillSelect(
    dom.starsFilter,
    uniqueSorted('stars', (a, b) => Number(String(b).slice(0, 1)) - Number(String(a).slice(0, 1))),
    'All stars'
  );
  fillSelect(dom.classFilter, uniqueSorted('class'), 'All classes');
  fillSelect(dom.stageFilter, uniqueSorted('stage'), 'All stages');
}

function rowSearchText(row) {
  return searchKeys.map((key) => row[key] ?? '').join(' ').toLowerCase();
}

function matchesFilters(row) {
  const query = dom.searchInput.value.trim().toLowerCase();
  if (dom.positionFilter.value && rowDisplayPosition(row) !== dom.positionFilter.value) return false;
  if (dom.starsFilter.value && row.stars !== dom.starsFilter.value) return false;
  if (dom.classFilter.value && row.class !== dom.classFilter.value) return false;
  if (dom.stageFilter.value && row.stage !== dom.stageFilter.value) return false;
  return !query || rowSearchText(row).includes(query);
}

function positionCompare(a, b) {
  const ar = positionRank.has(a) ? positionRank.get(a) : 999;
  const br = positionRank.has(b) ? positionRank.get(b) : 999;
  return ar === br ? String(a).localeCompare(String(b), undefined, { numeric: true }) : ar - br;
}

function compareRows(a, b) {
  const key = state.sortKey;
  const column = columnByKey.get(key) || {};
  const aValue = column.type === 'rating' ? ratingValue(a, key) : column.type === 'bodyType' ? bodyTypeLabel(a) : previewFieldValue(a, key);
  const bValue = column.type === 'rating' ? ratingValue(b, key) : column.type === 'bodyType' ? bodyTypeLabel(b) : previewFieldValue(b, key);
  let result;
  if (numericColumns.has(key)) {
    result = (Number(aValue) || 0) - (Number(bValue) || 0);
  } else if (key === 'position' || key === 'recruitPosition') {
    result = positionCompare(aValue, bValue);
  } else if (column.type === 'boolean') {
    result = Number(Boolean(aValue)) - Number(Boolean(bValue));
  } else {
    result = String(aValue).localeCompare(String(bValue), undefined, { numeric: true });
  }
  return state.sortDir === 'asc' ? result : -result;
}

function average(values) {
  const numbers = values.map(Number).filter((value) => Number.isFinite(value) && value > 0);
  return numbers.length ? numbers.reduce((sum, value) => sum + value, 0) / numbers.length : 0;
}

function minValue(values) {
  const numbers = values.map(Number).filter((value) => Number.isFinite(value) && value > 0);
  return numbers.length ? Math.min(...numbers) : 0;
}

function maxValue(values) {
  const numbers = values.map(Number).filter((value) => Number.isFinite(value) && value > 0);
  return numbers.length ? Math.max(...numbers) : 0;
}

function roundAverage(value) {
  return value ? Math.round(value * 10) / 10 : 0;
}

function formatAverage(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return '';
  return Number.isInteger(number) ? String(number) : number.toFixed(1);
}

function formatCount(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '';
  return String(Math.max(0, Math.round(number)));
}

function formatPercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '';
  const clamped = Math.max(0, number);
  return `${Number.isInteger(clamped) ? clamped : clamped.toFixed(1)}%`;
}

function percentOf(count, total) {
  const countNumber = Number(count);
  const totalNumber = Number(total);
  if (!Number.isFinite(countNumber) || !Number.isFinite(totalNumber) || totalNumber <= 0) return 0;
  return Math.round((countNumber / totalNumber) * 1000) / 10;
}

function formatHeight(totalInches) {
  const number = Math.round(Number(totalInches) || 0);
  if (!number) return '';
  return `${Math.floor(number / 12)}'${number % 12}"`;
}

function buildAverageRows(rows) {
  const groups = new Map();
  for (const row of rows) {
    const position = rowDisplayPosition(row) || 'Unknown';
    const stars = row.stars || 'Unknown';
    const key = `${position}|${stars}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }

  return [...groups.entries()].map(([key, group]) => {
    const [position, stars] = key.split('|');
    const overallValues = group.map((row) => ratingValue(row, 'OverallRating'));
    const heightValues = group.map((row) => previewFieldValue(row, 'heightTotalInches'));
    const weightValues = group.map((row) => previewFieldValue(row, 'weight'));
    const nationalRankValues = group.map((row) => row.nationalRank);
    const positionRankValues = group.map((row) => row.positionRank);
    const offerValues = group.map((row) => row.offers);
    const commitScoreValues = group.map((row) => row.commitScore);
    const nilOfferValues = group.map((row) => row.nilOffer);
    const hourValues = group.map((row) => row.hours);
    const influenceValues = group.map((row) => row.influence);
    const normalCount = group.filter((row) => row.gemBust === 'Normal').length;
    const gems = group.filter((row) => row.gemBust === 'Gem').length;
    const busts = group.filter((row) => row.gemBust === 'Bust').length;
    const hiddenCount = group.filter((row) => row.gemBust === 'Hidden').length;
    const totalCount = group.length;
    const out = {
      position,
      stars,
      starCount: Number(group[0]?.starCount || String(stars).slice(0, 1)) || 0,
      count: totalCount,
      normalCount,
      normalPct: percentOf(normalCount, totalCount),
      gems,
      gemPct: percentOf(gems, totalCount),
      busts,
      bustPct: percentOf(busts, totalCount),
      hiddenCount,
      hiddenPct: percentOf(hiddenCount, totalCount),
      avgOverall: roundAverage(average(overallValues)),
      minOverall: minValue(overallValues),
      maxOverall: maxValue(overallValues),
      avgHeight: roundAverage(average(heightValues)),
      minHeight: minValue(heightValues),
      maxHeight: maxValue(heightValues),
      avgWeight: roundAverage(average(weightValues)),
      minWeight: minValue(weightValues),
      maxWeight: maxValue(weightValues),
      avgNationalRank: roundAverage(average(nationalRankValues)),
      minNationalRank: minValue(nationalRankValues),
      maxNationalRank: maxValue(nationalRankValues),
      avgPositionRank: roundAverage(average(positionRankValues)),
      minPositionRank: minValue(positionRankValues),
      maxPositionRank: maxValue(positionRankValues),
      avgOffers: roundAverage(average(offerValues)),
      minOffers: minValue(offerValues),
      maxOffers: maxValue(offerValues),
      avgCommitScore: roundAverage(average(commitScoreValues)),
      minCommitScore: minValue(commitScoreValues),
      maxCommitScore: maxValue(commitScoreValues),
      avgNilOffer: roundAverage(average(nilOfferValues)),
      minNilOffer: minValue(nilOfferValues),
      maxNilOffer: maxValue(nilOfferValues),
      avgHours: roundAverage(average(hourValues)),
      minHours: minValue(hourValues),
      maxHours: maxValue(hourValues),
      avgInfluence: roundAverage(average(influenceValues)),
      minInfluence: minValue(influenceValues),
      maxInfluence: maxValue(influenceValues),
      boardCount: group.filter((row) => row.onUserBoard).length
    };
    for (const field of RATING_DISPLAY_FIELDS) {
      const values = group.map((row) => ratingValue(row, field));
      out[`avg${field}`] = roundAverage(average(values));
      out[`min${field}`] = minValue(values);
      out[`max${field}`] = maxValue(values);
    }
    return out;
  });
}

function compareAverageRows(a, b) {
  const key = state.averageSortKey;
  const column = averageColumnByKey.get(key) || {};
  const aValue = a[key] ?? '';
  const bValue = b[key] ?? '';
  let result;
  if (key === 'position') {
    result = positionCompare(a.position, b.position) || (b.starCount - a.starCount);
  } else if (key === 'stars') {
    result = (a.starCount - b.starCount) || positionCompare(a.position, b.position);
  } else if (averageNumericColumns.has(key) || column.type === 'height') {
    result = (Number(aValue) || 0) - (Number(bValue) || 0);
  } else {
    result = String(aValue).localeCompare(String(bValue), undefined, { numeric: true });
  }
  return state.averageSortDir === 'asc' ? result : -result;
}

function updateFilteredRows() {
  state.filtered = state.rows.filter(matchesFilters).sort(compareRows);
  if (!state.filtered.some((row) => row.recruitRow === state.selectedRecruitRow)) {
    state.selectedRecruitRow = state.filtered[0]?.recruitRow ?? null;
  }
  const emptyMessage = state.loading
    ? (state.loadMessage || 'Loading dynasty file...')
    : state.dataLoaded
    ? 'No recruits match the current filters.'
    : 'Select a dynasty file to load recruiting data.';
  if (dom.emptyStateText) {
    dom.emptyStateText.textContent = emptyMessage;
  } else {
    dom.emptyState.textContent = emptyMessage;
  }
  dom.emptyState.classList.toggle('loading-state', state.loading);
  if (dom.loadProgress) dom.loadProgress.hidden = !state.loading;
  dom.emptyState.style.display = state.loading || !state.filtered.length ? 'grid' : 'none';
  if (state.dataLoaded) {
    setStatus(`${formatNumber(state.filtered.length)} visible / ${formatNumber(state.rows.length)} total recruits.`);
  }
}

function addRatingColumnClasses(column, classes) {
  if (!column.groupKey) return;
  classes.push('rating-column', column.groupShade || 'rating-shade-a');
  if (column.groupStart) classes.push('rating-group-start');
  if (column.groupKey === 'overall') classes.push('overall-column');
}

function headerLabelHtml(column) {
  return `<span>${escapeHtml(column.label)}</span>`;
}

function rowSpanAttr(rowSpan) {
  return rowSpan ? ' rowspan="2"' : '';
}

function columnStyleAttr(column) {
  return column.width ? ` style="width:${escapeHtml(column.width)}"` : '';
}

function headerHtml(column, rowSpan = false) {
  const classes = ['column-heading', `col-${classToken(column.key)}`];
  if (column.numeric) classes.push('num');
  if (column.type === 'portrait') classes.push('portrait-column');
  addRatingColumnClasses(column, classes);
  if (state.sortKey === column.key) classes.push('sorted');
  const sortLabel = state.sortKey === column.key
    ? `<span class="sort-mark">${state.sortDir === 'asc' ? 'ASC' : 'DESC'}</span>`
    : '';
  return `
    <th data-key="${escapeHtml(column.key)}" class="${classes.join(' ')}" title="${escapeHtml(column.label)}"${rowSpanAttr(rowSpan)}${columnStyleAttr(column)}>
      ${headerLabelHtml(column)}${sortLabel}
    </th>`;
}

function averageHeaderHtml(column, rowSpan = false) {
  const classes = ['column-heading'];
  if (column.numeric || column.type === 'height') classes.push('num');
  addRatingColumnClasses(column, classes);
  if (state.averageSortKey === column.key) classes.push('sorted');
  const sortLabel = state.averageSortKey === column.key
    ? `<span class="sort-mark">${state.averageSortDir === 'asc' ? 'ASC' : 'DESC'}</span>`
    : '';
  return `
    <th data-average-key="${escapeHtml(column.key)}" class="${classes.join(' ')}" title="${escapeHtml(column.label)}"${rowSpanAttr(rowSpan)}>
      ${headerLabelHtml(column)}${sortLabel}
    </th>`;
}

function groupHeaderHtml(columns, leafHeaderHtml) {
  const cells = [];
  for (let index = 0; index < columns.length;) {
    const column = columns[index];
    if (!column.groupKey) {
      cells.push(leafHeaderHtml(column, true));
      index += 1;
      continue;
    }

    const groupKey = column.groupKey;
    const groupLabel = column.groupLabel || column.label;
    const groupShade = column.groupShade || 'rating-shade-a';
    let span = 0;
    while (columns[index + span]?.groupKey === groupKey) {
      span += 1;
    }
    const classes = ['rating-group-heading', groupShade];
    if (groupKey === 'overall') classes.push('overall-column');
    cells.push(`<th colspan="${span}" class="${classes.join(' ')}">${escapeHtml(groupLabel)}</th>`);
    index += span;
  }
  return cells.join('');
}

function groupedLeafColumns(columns) {
  return columns.filter((column) => column.groupKey);
}

function wireRecruitHeaderSorting(root) {
  root.querySelectorAll('th[data-key]').forEach((th) => {
    th.addEventListener('click', () => {
      const key = th.dataset.key;
      const column = columnByKey.get(key) || {};
      if (state.sortKey === key) {
        state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        state.sortKey = key;
        state.sortDir = column.numeric ? 'desc' : 'asc';
      }
      renderHeaders();
      renderTable({ resetScroll: true });
      renderSelectedDetail();
    });
  });
}

function wireAverageHeaderSorting(root) {
  root.querySelectorAll('th[data-average-key]').forEach((th) => {
    th.addEventListener('click', () => {
      const key = th.dataset.averageKey;
      const column = averageColumnByKey.get(key) || {};
      if (state.averageSortKey === key) {
        state.averageSortDir = state.averageSortDir === 'asc' ? 'desc' : 'asc';
      } else {
        state.averageSortKey = key;
        state.averageSortDir = column.numeric || column.type === 'height' ? 'desc' : 'asc';
      }
      state.averageRows.sort(compareAverageRows);
      renderAverageHeaders();
      renderAverages();
    });
  });
}

function renderHeaders() {
  dom.groupHeaderRow.innerHTML = groupHeaderHtml(tableColumns, headerHtml);
  dom.headerRow.innerHTML = groupedLeafColumns(tableColumns).map((column) => headerHtml(column)).join('');
  wireRecruitHeaderSorting(dom.groupHeaderRow);
  wireRecruitHeaderSorting(dom.headerRow);
}

function renderAverageHeaders() {
  if (!dom.averagesGroupHeaderRow || !dom.averagesHeaderRow) return;
  dom.averagesGroupHeaderRow.innerHTML = groupHeaderHtml(averageColumns, averageHeaderHtml);
  dom.averagesHeaderRow.innerHTML = groupedLeafColumns(averageColumns).map((column) => averageHeaderHtml(column)).join('');
  wireAverageHeaderSorting(dom.averagesGroupHeaderRow);
  wireAverageHeaderSorting(dom.averagesHeaderRow);
}

function cellClass(column) {
  const classes = [`col-${classToken(column.key)}`];
  if (column.numeric) classes.push('num');
  if (column.type === 'portrait') classes.push('portrait-cell');
  if (column.type === 'school') classes.push('school-cell');
  if (['ability', 'abilitySlot', 'abilityList', 'devTrait', 'dealbreaker', 'pitch'].includes(column.type)) classes.push('ability-cell');
  if (column.type === 'abilityList') classes.push('ability-list-td');
  if (column.type === 'boolean') classes.push('boolean-cell');
  if (column.type === 'visual' || column.type === 'skinTone') classes.push('visual-cell');
  if (isSpoilerSensitiveColumn(column)) classes.push('spoiler-sensitive');
  addRatingColumnClasses(column, classes);
  return classes.join(' ');
}

function isSpoilerSensitiveColumn(column = {}) {
  if (column.key === 'gemBust' || column.key === 'idealRecruitingPitch') return true;
  if (column.groupKey === 'gemBustAverage') return true;
  return ['ability', 'abilitySlot', 'abilityList', 'devTrait', 'pitch', 'rating'].includes(column.type)
    || Boolean(column.groupKey && RATING_GROUPS.some((group) => group.key === column.groupKey));
}

function tableAbilityTierHtml(rank) {
  const text = rank || '';
  if (!text) return '';
  return `<span class="ability-tier ability-rank-${abilityRankClass(text)}">${escapeHtml(text)}</span>`;
}

function tableAbilitySlotHtml(row, column) {
  const name = row[column.nameKey] || '';
  const rank = row[column.rankKey] || '';
  if (!name || !rank) return '';
  return `
    <span class="ability-slot-cell" title="${escapeHtml([name, rank].filter(Boolean).join(' - '))}">
      <span class="ability-name">${escapeHtml(name)}</span>
      ${tableAbilityTierHtml(rank)}
    </span>`;
}

function parseAbilitySummary(value) {
  return String(value || '')
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const match = /^(.*)\s+\(([^()]+)\)$/.exec(part);
      return match
        ? { name: match[1].trim(), rank: match[2].trim() }
        : { name: part, rank: '' };
    })
    .filter((ability) => ability.name && ability.rank);
}

function tableAbilityListHtml(value) {
  const abilities = parseAbilitySummary(value);
  if (!abilities.length) return '';
  const title = abilities.map((ability) => `${ability.name} - ${ability.rank}`).join('; ');
  return `
    <span class="ability-list-cell" title="${escapeHtml(title)}">
      ${abilities.map((ability) => `
        <span class="ability-list-chip">
          <span class="ability-name">${escapeHtml(ability.name)}</span>
          ${tableAbilityTierHtml(ability.rank)}
        </span>`).join('')}
    </span>`;
}

function tableDevTraitHtml(value) {
  if (!value) return '';
  return `<span class="table-dev-badge dev-trait-${classToken(value)}">${escapeHtml(value)}</span>`;
}

function tableDealbreakerHtml(value) {
  if (!value) return '';
  return `<span class="dealbreaker-cell" title="${escapeHtml(value)}">${escapeHtml(value)}</span>`;
}

function tablePitchHtml(value) {
  if (!value) return '';
  return `<span class="pitch-cell" title="${escapeHtml(value)}">${escapeHtml(value)}</span>`;
}

function rankMarkerForRow(row) {
  const preview = previewForRow(row);
  if (preview?.projectPlayer) return { key: 'project', label: 'Project Player', text: '?' };
  if (preview?.blueChip) return { key: 'blue-chip', label: 'Blue Chip' };
  if (preview?.diamondInTheRough) return { key: 'diamond', label: 'Diamond in the Rough' };
  if (row?.gemBust === 'Gem') return { key: 'gem', label: 'Gem' };
  if (row?.gemBust === 'Bust') return { key: 'bust', label: 'Bust' };
  return null;
}

function rankMarkerHtml(row) {
  if (state.recruitingSpoilersVisible === false) return '';
  const marker = rankMarkerForRow(row);
  if (!marker) return '';
  return `<span class="rank-marker rank-marker-${marker.key} spoiler-sensitive" title="${escapeHtml(marker.label)}" aria-label="${escapeHtml(marker.label)}">${escapeHtml(marker.text || '')}</span>`;
}

function nationalRankHtml(row, value) {
  return `
    <span class="national-rank-cell">
      <span class="national-rank-number">${escapeHtml(value)}</span>
      ${rankMarkerHtml(row)}
    </span>`;
}

function cellHtml(row, column) {
  const key = column.key;
  const value = key === 'recruitPosition' ? rowDisplayPosition(row) : previewFieldValue(row, key);
  if (key === 'nationalRank') return nationalRankHtml(row, value);
  if (column.type === 'portrait') {
    if (!value) return '';
    return `<img class="portrait-thumb" src="${assetSrc(value)}" alt="${escapeHtml(displayName(row))} portrait" loading="lazy">`;
  }
  if (column.type === 'school') {
    const logoPath = row[`topSchool${column.slot}LogoPath`];
    const logo = logoPath
      ? `<img class="team-logo-mini" src="${assetSrc(logoPath)}" alt="" loading="lazy">`
      : '';
    return `<span class="logo-cell">${logo}<span>${escapeHtml(value)}</span></span>`;
  }
  if (column.type === 'boolean') {
    if (!value) return '';
    const className = key === 'onUserBoard' ? 'board yes-pill' : 'yes-pill';
    return `<span class="${className}">Yes</span>`;
  }
  if (column.type === 'visual') {
    const text = value === '' || value === null || value === undefined ? 'None' : String(value);
    const muted = text === 'None' || text === 'No CHVI data' || text === 'Not exposed in PLAY';
    if (previewFieldChanged(row, key)) return previewChangeHtml(text);
    return `<span class="${muted ? 'visual-muted' : ''}">${escapeHtml(text)}</span>`;
  }
  if (column.type === 'skinTone') {
    if (!value) return '<span class="visual-muted">None</span>';
    return previewFieldChanged(row, key) ? previewChangeHtml(value) : escapeHtml(value);
  }
  if (column.type === 'bodyType') {
    const text = bodyTypeLabel(row);
    return `<span class="${text === 'None' ? 'visual-muted' : ''}">${escapeHtml(text)}</span>`;
  }
  if (column.type === 'abilitySlot') return tableAbilitySlotHtml(row, column);
  if (column.type === 'abilityList') return tableAbilityListHtml(value);
  if (column.type === 'devTrait') return tableDevTraitHtml(value);
  if (column.type === 'dealbreaker') return tableDealbreakerHtml(value);
  if (column.type === 'pitch') return tablePitchHtml(value);
  if (column.type === 'rating') return ratingDisplayHtml(row, key);
  if (key === 'stars') return starRatingHtml(row.starCount, value);
  if (key === 'firstName' || key === 'lastName') {
    return previewFieldChanged(row, key) ? previewChangeHtml(value) : escapeHtml(value);
  }
  if (key === 'height' || key === 'weight') {
    return previewFieldChanged(row, key) ? previewChangeHtml(value) : escapeHtml(value);
  }
  return escapeHtml(value);
}

function rowHtml(row) {
  const selected = row.recruitRow === state.selectedRecruitRow ? ' selected' : '';
  const cells = tableColumns
    .map((column) => `<td class="${cellClass(column)}"${columnStyleAttr(column)}>${cellHtml(row, column)}</td>`)
    .join('');
  return `<tr class="data-row${selected}" data-recruit-row="${escapeHtml(row.recruitRow)}">${cells}</tr>`;
}

function spacerRow(height) {
  if (height <= 0) return '';
  return `<tr class="spacer-row"><td colspan="${tableColumns.length}" style="height:${Math.max(0, Math.round(height))}px"></td></tr>`;
}

function renderVisibleRows() {
  const total = state.filtered.length;
  if (!total) {
    dom.tbody.innerHTML = '';
    return;
  }

  const headerHeight = recruitTableHeaderHeight();
  const maxScrollTop = Math.max(0, headerHeight + (total * ROW_HEIGHT) - (dom.tableWrap.clientHeight || ROW_HEIGHT * 12));
  const scrollTop = Math.min(dom.tableWrap.scrollTop, maxScrollTop);
  if (dom.tableWrap.scrollTop !== scrollTop) dom.tableWrap.scrollTop = scrollTop;
  const viewportHeight = dom.tableWrap.clientHeight || ROW_HEIGHT * 12;
  const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN_ROWS);
  const end = Math.min(total, Math.ceil((scrollTop + viewportHeight) / ROW_HEIGHT) + OVERSCAN_ROWS);
  const visibleRows = state.filtered.slice(start, end).map(rowHtml).join('');
  dom.tbody.innerHTML = [
    spacerRow(start * ROW_HEIGHT),
    visibleRows,
    spacerRow((total - end) * ROW_HEIGHT)
  ].join('');
}

function selectedFilteredIndex() {
  return state.filtered.findIndex((row) => row.recruitRow === state.selectedRecruitRow);
}

function recruitTableHeaderHeight() {
  return (dom.groupHeaderRow?.offsetHeight || 0) + (dom.headerRow?.offsetHeight || 0);
}

function scrollRecruitIndexIntoView(index) {
  if (!dom.tableWrap || index < 0) return;
  const headerHeight = recruitTableHeaderHeight();
  const viewportHeight = dom.tableWrap.clientHeight || ROW_HEIGHT * 12;
  const rowTop = headerHeight + (index * ROW_HEIGHT);
  const rowBottom = rowTop + ROW_HEIGHT;
  const currentTop = dom.tableWrap.scrollTop;
  const currentBottom = currentTop + viewportHeight;
  if (rowTop < currentTop + headerHeight) {
    dom.tableWrap.scrollTop = Math.max(0, rowTop - headerHeight);
  } else if (rowBottom > currentBottom) {
    dom.tableWrap.scrollTop = Math.max(0, rowBottom - viewportHeight);
  }
}

function selectRecruitAtIndex(index, { focusTable = false, scrollIntoView = false } = {}) {
  if (!state.filtered.length) return;
  const nextIndex = Math.max(0, Math.min(state.filtered.length - 1, index));
  const row = state.filtered[nextIndex];
  if (!row) return;
  state.selectedRecruitRow = row.recruitRow;
  if (scrollIntoView) scrollRecruitIndexIntoView(nextIndex);
  renderVisibleRows();
  renderSelectedDetail();
  if (focusTable && dom.tableWrap) dom.tableWrap.focus({ preventScroll: true });
}

function selectRecruitByRow(recruitRow, options = {}) {
  const index = state.filtered.findIndex((row) => row.recruitRow === recruitRow);
  if (index < 0) return;
  selectRecruitAtIndex(index, options);
}

function handleRecruitTableKeydown(event) {
  if (state.view !== 'recruits' || !state.filtered.length) return;
  if (event.altKey || event.ctrlKey || event.metaKey) return;
  let offset = 0;
  if (event.key === 'ArrowDown') offset = 1;
  if (event.key === 'ArrowUp') offset = -1;
  if (!offset) return;
  const currentIndex = selectedFilteredIndex();
  const nextIndex = currentIndex < 0 ? 0 : currentIndex + offset;
  event.preventDefault();
  selectRecruitAtIndex(nextIndex, { scrollIntoView: true });
}

function averageCellHtml(row, column) {
  const value = row[column.key];
  if (column.type === 'height') return escapeHtml(formatHeight(value));
  if (column.type === 'count') return escapeHtml(formatCount(value));
  if (column.type === 'percent') return escapeHtml(formatPercent(value));
  if (column.numeric) return escapeHtml(formatAverage(value));
  if (column.key === 'stars') return starRatingHtml(row.starCount, value);
  return escapeHtml(value);
}

function renderAverages() {
  if (!dom.averagesTbody) return;
  dom.averagesTbody.innerHTML = state.averageRows.map((row) => {
    const cells = averageColumns.map((column) => {
      const classes = [];
      if (column.numeric || column.type === 'height') classes.push('num');
      if (isSpoilerSensitiveColumn(column)) classes.push('spoiler-sensitive');
      addRatingColumnClasses(column, classes);
      const className = classes.join(' ');
      return `<td class="${className}">${averageCellHtml(row, column)}</td>`;
    }).join('');
    return `<tr>${cells}</tr>`;
  }).join('');
}

function renderTable({ resetScroll = false } = {}) {
  updateFilteredRows();
  if (resetScroll) dom.tableWrap.scrollTop = 0;
  renderVisibleRows();
}

function populateRawTableSelect() {
  dom.rawTableSelect.innerHTML = RAW_TABLE_OPTIONS
    .map((table) => `<option value="${escapeHtml(table.key)}">${escapeHtml(table.label)}</option>`)
    .join('');
  dom.rawTableSelect.value = state.rawTableKey;
}

function resetRawTableState(message = 'Select a dynasty file to inspect raw source tables.') {
  state.rawLoadedKey = '';
  state.rawLoading = false;
  state.rawRows = [];
  state.rawColumns = [];
  state.rawFilteredIndexes = [];
  state.rawSortKey = '_index';
  state.rawSortDir = 'asc';
  state.rawPurpose = '';
  state.rawFileName = '';
  dom.rawHeaderRow.innerHTML = '';
  dom.rawTbody.innerHTML = '';
  dom.rawTableStats.textContent = message;
  dom.rawEmptyState.textContent = message;
  dom.rawEmptyState.style.display = 'grid';
  dom.rawSearchInput.value = '';
}

function rawCellValue(row, key) {
  const value = row?.[key];
  if (value === undefined || value === null) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function rawSearchText(row) {
  if (!Object.prototype.hasOwnProperty.call(row, '__rawSearchText')) {
    Object.defineProperty(row, '__rawSearchText', {
      value: Object.values(row).map((value) => (
        value && typeof value === 'object' ? JSON.stringify(value) : String(value ?? '')
      )).join(' ').toLowerCase(),
      enumerable: false
    });
  }
  return row.__rawSearchText;
}

function compareRawIndexes(aIndex, bIndex) {
  const key = state.rawSortKey;
  const aValue = rawCellValue(state.rawRows[aIndex], key);
  const bValue = rawCellValue(state.rawRows[bIndex], key);
  const aNumber = Number(aValue);
  const bNumber = Number(bValue);
  let result;
  if (aValue !== '' && bValue !== '' && Number.isFinite(aNumber) && Number.isFinite(bNumber)) {
    result = aNumber - bNumber;
  } else {
    result = aValue.localeCompare(bValue, undefined, { numeric: true });
  }
  return state.rawSortDir === 'asc' ? result : -result;
}

function updateRawFilteredRows() {
  const query = dom.rawSearchInput.value.trim().toLowerCase();
  state.rawFilteredIndexes = state.rawRows
    .map((_, index) => index)
    .filter((index) => !query || rawSearchText(state.rawRows[index]).includes(query))
    .sort(compareRawIndexes);
  const total = formatNumber(state.rawRows.length);
  const visible = formatNumber(state.rawFilteredIndexes.length);
  const purpose = state.rawPurpose ? ` | ${state.rawPurpose}` : '';
  dom.rawTableStats.textContent = state.rawLoading
    ? 'Loading raw table...'
    : `${visible} visible / ${total} rows | ${formatNumber(state.rawColumns.length)} columns | ${state.rawFileName}${purpose}`;
  dom.rawEmptyState.textContent = state.dataLoaded
    ? 'No raw rows match the current search.'
    : 'Select a dynasty file to inspect raw source tables.';
  dom.rawEmptyState.style.display = state.rawFilteredIndexes.length ? 'none' : 'grid';
}

function renderRawHeaders() {
  dom.rawHeaderRow.innerHTML = state.rawColumns.map((key) => {
    const sorted = state.rawSortKey === key;
    const sortLabel = sorted ? `<span class="sort-mark">${state.rawSortDir === 'asc' ? 'ASC' : 'DESC'}</span>` : '';
    return `<th data-raw-key="${escapeHtml(key)}" title="${escapeHtml(key)}">${escapeHtml(key)}${sortLabel}</th>`;
  }).join('');
  dom.rawHeaderRow.querySelectorAll('th[data-raw-key]').forEach((th) => {
    th.addEventListener('click', () => {
      const key = th.dataset.rawKey;
      if (state.rawSortKey === key) {
        state.rawSortDir = state.rawSortDir === 'asc' ? 'desc' : 'asc';
      } else {
        state.rawSortKey = key;
        state.rawSortDir = key === '_index' ? 'asc' : 'desc';
      }
      updateRawFilteredRows();
      renderRawHeaders();
      renderRawVisibleRows({ resetScroll: true });
    });
  });
}

function rawRowHtml(row) {
  return `<tr class="raw-data-row">${state.rawColumns
    .map((key) => `<td title="${escapeHtml(rawCellValue(row, key))}">${escapeHtml(rawCellValue(row, key))}</td>`)
    .join('')}</tr>`;
}

function rawSpacerRow(height) {
  if (height <= 0) return '';
  return `<tr class="spacer-row" style="height:${height}px"><td colspan="${Math.max(1, state.rawColumns.length)}"></td></tr>`;
}

function renderRawVisibleRows({ resetScroll = false } = {}) {
  if (resetScroll) dom.rawTableWrap.scrollTop = 0;
  const total = state.rawFilteredIndexes.length;
  if (!total) {
    dom.rawTbody.innerHTML = '';
    return;
  }
  const scrollTop = dom.rawTableWrap.scrollTop;
  const viewportHeight = dom.rawTableWrap.clientHeight || RAW_ROW_HEIGHT * 18;
  const start = Math.max(0, Math.floor(scrollTop / RAW_ROW_HEIGHT) - RAW_OVERSCAN_ROWS);
  const end = Math.min(total, Math.ceil((scrollTop + viewportHeight) / RAW_ROW_HEIGHT) + RAW_OVERSCAN_ROWS);
  const visibleRows = state.rawFilteredIndexes
    .slice(start, end)
    .map((index) => rawRowHtml(state.rawRows[index]))
    .join('');
  dom.rawTbody.innerHTML = [
    rawSpacerRow(start * RAW_ROW_HEIGHT),
    visibleRows,
    rawSpacerRow((total - end) * RAW_ROW_HEIGHT)
  ].join('');
}

async function loadRawTable(key = state.rawTableKey) {
  state.rawTableKey = key;
  dom.rawTableSelect.value = key;
  if (!state.dataLoaded) {
    resetRawTableState('Select a dynasty file to inspect raw source tables.');
    return;
  }
  state.rawLoading = true;
  dom.rawTableStats.textContent = 'Loading raw table...';
  dom.rawEmptyState.textContent = 'Loading raw table...';
  dom.rawEmptyState.style.display = 'grid';
  try {
    const result = await window.recruitingApi.getRawTable(key);
    if (!result.ok) throw new Error(result.error || 'Raw table load failed.');
    state.rawLoadedKey = key;
    state.rawRows = result.rows || [];
    state.rawColumns = result.columns || [];
    state.rawSortKey = state.rawColumns.includes('_index') ? '_index' : state.rawColumns[0] || '';
    state.rawSortDir = 'asc';
    state.rawPurpose = result.purpose || '';
    state.rawFileName = result.fileName || result.label || key;
    state.rawLoading = false;
    renderRawHeaders();
    updateRawFilteredRows();
    renderRawVisibleRows({ resetScroll: true });
    setStatus(`Loaded raw ${result.label || key}: ${formatNumber(state.rawRows.length)} rows.`);
  } catch (error) {
    state.rawLoading = false;
    resetRawTableState(`Raw table failed: ${error.message}`);
    setStatus(`Raw table failed: ${error.message}`);
  }
}

function schoolRowHtml(school) {
  const logo = school.logoPath
    ? `<img class="school-logo" src="${assetSrc(school.logoPath)}" alt="" loading="lazy">`
    : '<span class="school-logo empty-logo"></span>';
  const ids = [
    school.teamId !== undefined && school.teamId !== '' ? `TIDX ${school.teamId}` : '',
    school.stadiumId !== undefined && school.stadiumId !== '' ? `SGID ${school.stadiumId}` : '',
    school.teamGameId !== undefined && school.teamGameId !== '' ? `TGID ${school.teamGameId}` : ''
  ].filter(Boolean).join(' / ');
  return `
    <div class="school-row">
      <b>${escapeHtml(school.rank)}</b>
      ${logo}
      <span>${escapeHtml(school.team)}${ids ? `<small>${escapeHtml(ids)}</small>` : ''}</span>
      <strong>${escapeHtml(school.influence)}</strong>
    </div>`;
}

function classToken(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'none';
}

function abilityRankClass(rank) {
  const token = classToken(rank);
  return ['bronze', 'silver', 'gold', 'platinum'].includes(token) ? token : 'none';
}

function detailAbilityBadgeHtml(label, value, extraClass = '', title = '') {
  if (!value) return '';
  const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';
  return `<span class="detail-ability-badge ${extraClass}"${titleAttr}><small>${escapeHtml(label)}</small>${escapeHtml(value)}</span>`;
}

function devTraitBadgeHtml(row) {
  const devTrait = previewFieldValue(row, 'devTrait') || '';
  if (!devTrait) return '';
  return detailAbilityBadgeHtml(
    'DEV',
    devTrait,
    `dev-trait-${classToken(devTrait)} spoiler-sensitive`,
    `Development Trait: ${devTrait}`
  );
}

function dealbreakerBadgeHtml(row) {
  const dealbreaker = row.recruitingDealbreaker || '';
  if (!dealbreaker) return '';
  return detailAbilityBadgeHtml('DEAL', dealbreaker, 'dealbreaker-badge', `Recruiting Dealbreaker: ${dealbreaker}`);
}

function pitchBadgeHtml(row) {
  const pitch = row.idealRecruitingPitch || '';
  if (!pitch) return '';
  return detailAbilityBadgeHtml('PITCH', pitch, 'pitch-badge spoiler-sensitive', `Ideal Recruiting Pitch: ${pitch}`);
}

function detailKickerText() {
  if (state.detailView === 'ratings') return 'Player Ratings';
  if (state.detailView === 'abilities') return 'Player Abilities';
  return 'Recruit Profile';
}

function detailHeroHtml(row) {
  const name = displayName(row);
  const starHtml = starRatingHtml(row.starCount, row.stars);
  const overallHtml = ratingDisplayHtml(row, 'OverallRating');
  const portraitPath = previewFieldValue(row, 'portraitPath');
  const portraitClass = previewFieldChanged(row, 'portraitPath') ? ' detail-portrait-preview' : '';
  const nameClass = previewFieldChanged(row, 'name') ? ' class="preview-change"' : '';
  const portrait = portraitPath
    ? `<img class="detail-portrait${portraitClass}" src="${assetSrc(portraitPath)}" alt="${escapeHtml(name)} portrait">`
    : '<div class="detail-portrait portrait-empty">No Image</div>';
  return `
    <div class="detail-hero">
      ${portrait}
      <div class="detail-hero-copy">
        <span class="detail-kicker">${detailKickerText()}</span>
        <strong${nameClass}>${escapeHtml(name)}</strong>
        <div class="detail-meta">
          <span class="detail-position-pill">${escapeHtml(rowDisplayPosition(row) || 'POS')}</span>
          ${overallHtml ? `<span class="detail-overall-pill spoiler-sensitive"><small>OVR</small>${overallHtml}</span>` : ''}
          <span class="detail-stars">${starHtml}</span>
        </div>
      </div>
    </div>`;
}

function abilityRawText(parts) {
  return parts
    .filter((part) => part.value !== undefined && part.value !== null && part.value !== '')
    .map((part) => `${part.label}: ${part.value}`)
    .join(' / ');
}

function abilityDetailRowHtml({ label, value, rank = '', rawText = '', kind = '', sensitive = true }) {
  const displayValue = value || 'None';
  const displayRank = rank || '';
  const rankBadge = displayRank
    ? detailAbilityBadgeHtml('RANK', displayRank, `ability-rank-${abilityRankClass(displayRank)}`)
    : '';
  const rowClass = [
    'ability-detail-row',
    kind ? `ability-detail-${kind}` : '',
    sensitive ? 'spoiler-sensitive' : ''
  ].filter(Boolean).join(' ');
  return `
    <div class="${rowClass}">
      <div>
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(displayValue)}</strong>
        ${rawText ? `<small>${escapeHtml(rawText)}</small>` : ''}
      </div>
      ${rankBadge}
    </div>`;
}

function physicalAbilityDetailRowsHtml(row) {
  const rows = Array.from({ length: 5 }, (_, index) => {
    const slot = index + 1;
    const name = row[`physicalAbility${slot}Name`] || '';
    const rank = previewFieldValue(row, `physicalAbility${slot}Rank`) || '';
    if (!name || !rank) return '';
    return abilityDetailRowHtml({
      label: `Physical ${slot}`,
      value: name,
      rank,
      kind: 'physical'
    });
  }).filter(Boolean);
  return rows.join('') || '<div class="ability-detail-empty">No physical abilities</div>';
}

function mentalAbilityDetailRowsHtml(row) {
  const rows = Array.from({ length: 3 }, (_, index) => {
    const slot = index + 1;
    const ability = row[`mentalAbility${slot}Name`] || '';
    const rank = previewFieldValue(row, `mentalAbility${slot}Rank`) || '';
    if (!ability || !rank) return '';
    return abilityDetailRowHtml({
      label: `Mental ${slot}`,
      value: ability,
      rank,
      kind: 'mental'
    });
  }).filter(Boolean);
  return rows.join('') || '<div class="ability-detail-empty">No mental abilities</div>';
}

function renderAbilitiesDetail(row) {
  const devTrait = previewFieldValue(row, 'devTrait') || 'None';
  const dealbreaker = row.recruitingDealbreaker || 'None';
  const pitch = row.idealRecruitingPitch || 'None';
  const showAbilityPanels = state.recruitingSpoilersVisible !== false;
  const abilityPanelsHtml = showAbilityPanels
    ? `
      <section class="ability-detail-section physical-ability-section">
        <h3>Physical</h3>
        <div class="ability-detail-list">
          ${physicalAbilityDetailRowsHtml(row)}
        </div>
      </section>
      <section class="ability-detail-section mental-ability-section">
        <h3>Mental</h3>
        <div class="ability-detail-list">
          ${mentalAbilityDetailRowsHtml(row)}
        </div>
      </section>`
    : '';
  dom.detailBody.innerHTML = `
    ${detailHeroHtml(row)}
    <div class="ability-detail-sections">
      <section class="ability-detail-section dev-ability-section">
        <h3>Development</h3>
        <div class="ability-detail-list">
          <div class="ability-detail-row ability-detail-dev spoiler-sensitive">
            <div>
              <span>Dev Trait</span>
              <strong>${escapeHtml(devTrait)}</strong>
            </div>
            ${devTraitBadgeHtml(row) || detailAbilityBadgeHtml('DEV', 'None', 'dev-trait-normal')}
          </div>
          <div class="ability-detail-row ability-detail-dev">
            <div>
              <span>Dealbreaker</span>
              <strong>${escapeHtml(dealbreaker)}</strong>
            </div>
            ${dealbreakerBadgeHtml(row)}
          </div>
          <div class="ability-detail-row ability-detail-dev spoiler-sensitive">
            <div>
              <span>Pitch</span>
              <strong>${escapeHtml(pitch)}</strong>
            </div>
            ${pitchBadgeHtml(row)}
          </div>
        </div>
      </section>
      ${abilityPanelsHtml}
    </div>`;
}

function detailCardHtml(label, value, isHtml = false, extraClass = '') {
  const className = ['detail-card', extraClass].filter(Boolean).join(' ');
  return `
    <div class="${className}">
      <span>${escapeHtml(label)}</span>
      <strong>${isHtml ? value : escapeHtml(value)}</strong>
    </div>`;
}

function detailSectionHtml(title, facts) {
  return `
    <section class="profile-detail-section">
      <h3>${escapeHtml(title)}</h3>
      <div class="detail-grid">
        ${facts.map(([label, value, isHtml, extraClass]) => detailCardHtml(label, value, isHtml, extraClass)).join('')}
      </div>
    </section>`;
}

function renderProfileDetail(row) {
  const profileFacts = [
    ['First', previewFieldValue(row, 'firstName'), false, previewFieldChanged(row, 'firstName') ? 'preview-card' : ''],
    ['Last', previewFieldValue(row, 'lastName'), false, previewFieldChanged(row, 'lastName') ? 'preview-card' : ''],
    ['National', `#${row.nationalRank}`],
    ['Position', rowDisplayPosition(row)],
    ['Player Pos', row.playerPosition || row.position],
    ['Alt Positions', row.alternatePositions || ''],
    ['Archetype', row.playerType],
    ['Stars', starRatingHtml(row.starCount, row.stars), true, 'stars-card'],
    ['Class', row.class],
    ['Height', previewFieldValue(row, 'height'), false, previewFieldChanged(row, 'height') ? 'preview-card' : ''],
    ['Weight', previewFieldValue(row, 'weight'), false, previewFieldChanged(row, 'weight') ? 'preview-card' : ''],
    ['Town', row.homeTown || row.hometown],
    ['State', row.homeState],
    ['Pipeline', row.pipeline],
    ['Stage', row.stage],
    ['Gem/Bust', row.gemBust, false, 'spoiler-sensitive']
  ];
  const recruitingFacts = [
    ['Project', previewForRow(row)?.projectPlayer ? 'Yes' : 'No', false, previewForRow(row)?.projectPlayer ? 'preview-card spoiler-sensitive' : ''],
    ['Dev', previewFieldValue(row, 'devTrait') || 'None', false, ['spoiler-sensitive', previewFieldChanged(row, 'devTrait') ? 'preview-card' : ''].filter(Boolean).join(' ')],
    ['Dealbreaker', row.recruitingDealbreaker || 'None'],
    ['Pitch', row.idealRecruitingPitch || 'None', false, 'spoiler-sensitive'],
    ['Offers', row.offers],
    ['Commit', row.commitScore],
    ['Board', row.onUserBoard ? 'Yes' : 'No'],
    ['Scholarship', row.scholarshipStatus || ''],
    ['Hours', row.hours],
    ['Influence', row.influence],
    ['Influence Delta', row.influenceDelta],
    ['Last Week', row.influenceLastWeek],
    ['Base NIL Value', row.baseNilValue],
    ['Favorite', row.isFavorite ? 'Yes' : 'No'],
    ['Send House', row.sendTheHouse ? 'Yes' : 'No'],
    ['Friends/Family', row.contactFriendsAndFamily ? 'Yes' : 'No'],
    ['HS Coaches', row.contactHighSchoolCoaches ? 'Yes' : 'No'],
    ['Social Media', row.searchSocialMedia ? 'Yes' : 'No'],
    ['Visit School', row.visitRecruitsSchool ? 'Yes' : 'No']
  ];
  const visualFacts = [
    ['Body Type', bodyTypeLabel(row)],
    ['Skin', previewFieldValue(row, 'previewSkinTone'), false, previewFieldChanged(row, 'previewSkinTone') ? 'preview-card' : ''],
    ['Head ID', previewFieldValue(row, 'genericHeadPortraitId'), false, previewFieldChanged(row, 'genericHeadPortraitId') ? 'preview-card' : ''],
    ['Portrait ID', previewFieldValue(row, 'portraitId'), false, previewFieldChanged(row, 'portraitId') ? 'preview-card' : ''],
    ['Portrait Source', row.portraitSource || ''],
    ['Portrait File', row.portraitFileName || ''],
    ['Asset Name', row.playerAssetName || ''],
    ['Generic Head', row.genericHeadAssetName || '']
  ];
  const sourceFacts = [
    ['Recruit Row', row.recruitRow],
    ['Player Row', row.playerRow],
    ['Target Row', row.userRecruitTargetRow],
    ['Top Schools Row', row.topSchoolsArrayRow],
    ['Class Raw', row.classRaw],
    ['Stage Raw', row.stageRaw],
    ['Dealbreaker Raw', row.recruitingDealbreakerRaw],
    ['Pitch Raw', row.idealRecruitingPitchRaw, false, 'spoiler-sensitive'],
    ['Dev Raw', row.devTraitRaw, false, 'spoiler-sensitive']
  ];
  const schools = (row.topSchools || []).map(schoolRowHtml).join('');

  dom.detailBody.innerHTML = `
    ${detailHeroHtml(row)}
    <div class="profile-detail-sections">
      ${detailSectionHtml('Profile', profileFacts)}
      ${detailSectionHtml('Recruiting', recruitingFacts)}
      ${detailSectionHtml('Visuals', visualFacts)}
      ${detailSectionHtml('Source', sourceFacts)}
      <section class="profile-detail-section">
        <h3>Top Schools</h3>
        <div class="school-list">
          ${schools || '<p>No top schools stored for this recruit.</p>'}
        </div>
      </section>
    </div>`;
}

function renderRatingsDetail(row) {
  const ratingSections = orderedDetailRatingGroups(row).filter((group) => group.key !== 'overall').map((group) => {
    const sectionClass = [
      'rating-section',
      group.shade
    ].filter(Boolean).join(' ');
    const ratingCards = group.fields
      .map((field) => {
        const changeClass = ratingChangeClass(ratingChangeInfo(row, field).delta);
        const extraClass = [
          'spoiler-sensitive',
          changeClass ? `${changeClass}-card` : ''
        ].filter(Boolean).join(' ');
        return detailCardHtml(ratingLabel(field), ratingDisplayHtml(row, field), true, extraClass);
      })
      .join('');
    return `
      <section class="${sectionClass}">
        <h3>${escapeHtml(group.label)}</h3>
        <div class="ratings-detail-grid">
          ${ratingCards}
        </div>
      </section>`;
  }).join('');
  dom.detailBody.innerHTML = `
    ${detailHeroHtml(row)}
    <div class="rating-sections">
      ${ratingSections}
    </div>`;
}

function renderDetail(row) {
  if (!row) {
    dom.detailName.textContent = 'None';
    dom.detailBody.innerHTML = '<p>Select a row to see the recruit profile and ratings.</p>';
    return;
  }

  dom.detailName.textContent = displayName(row);
  if (state.detailView === 'ratings') {
    renderRatingsDetail(row);
  } else if (state.detailView === 'abilities') {
    renderAbilitiesDetail(row);
  } else {
    renderProfileDetail(row);
  }
}

function renderSelectedDetail() {
  renderDetail(state.rows.find((row) => row.recruitRow === state.selectedRecruitRow) || null);
}

function scheduleSettingsPreviewRefresh() {
  if (settingsPreviewRefreshTimer) clearTimeout(settingsPreviewRefreshTimer);
  settingsPreviewRefreshTimer = setTimeout(() => {
    settingsPreviewRefreshTimer = null;
    renderTable();
    renderSelectedDetail();
  }, 90);
}

function invalidatePreviewFromSettingsChange() {
  const hadPreview = state.previewActive || state.previewByRecruitRow.size;
  if (!hadPreview) return;
  clearPreviewState();
  scheduleSettingsPreviewRefresh();
}

function varianceDeltaText(value, factor) {
  const range = sanitizeGemBustVarianceRange(value);
  const minDelta = Math.round(range.min * factor);
  const maxDelta = Math.round(range.max * factor);
  return `Bust -${minDelta}, Gem +${maxDelta}`;
}

function gemBustVarianceRowHtml(stars, value) {
  const range = sanitizeGemBustVarianceRange(value);
  return `
    <div class="star-caliber-row gem-bust-variance-row" data-gem-bust-row="${escapeHtml(stars)}">
      <div class="star-caliber-label">${escapeHtml(starCaliberLabel(stars))}</div>
      <div class="gem-bust-variance-control">
        <label class="gem-bust-variance-slider">
          <span>Bust Drop</span>
          <input
            type="range"
            min="0"
            max="${escapeHtml(MAX_GEM_BUST_VARIANCE)}"
            step="1"
            value="${escapeHtml(range.min)}"
            data-gem-bust-star-caliber="${escapeHtml(stars)}"
            data-gem-bust-bound="min"
            data-gem-bust-control="slider"
            aria-label="${escapeHtml(starCaliberLabel(stars))} bust rating drop">
          <b class="variance-value" data-gem-bust-control="minValue">${escapeHtml(range.min)}</b>
        </label>
        <label class="gem-bust-variance-slider">
          <span>Gem Boost</span>
          <input
            type="range"
            min="0"
            max="${escapeHtml(MAX_GEM_BUST_VARIANCE)}"
            step="1"
            value="${escapeHtml(range.max)}"
            data-gem-bust-star-caliber="${escapeHtml(stars)}"
            data-gem-bust-bound="max"
            data-gem-bust-control="slider"
            aria-label="${escapeHtml(starCaliberLabel(stars))} gem rating boost">
          <b class="variance-value" data-gem-bust-control="maxValue">${escapeHtml(range.max)}</b>
        </label>
      </div>
      <div class="star-caliber-delta" data-gem-bust-delta="skill">Skills: ${escapeHtml(varianceDeltaText(range, SKILL_RATING_VARIANCE_FACTOR))}</div>
      <div class="star-caliber-delta" data-gem-bust-delta="physical">Physical: ${escapeHtml(varianceDeltaText(range, PHYSICAL_RATING_VARIANCE_FACTOR))}</div>
    </div>`;
}

function updateGemBustVarianceStatus(values = state.gemBustVariance) {
  if (!dom.gemBustVarianceStatus) return;
  const sanitized = sanitizeGemBustVariance(values);
  const active = STAR_CALIBER_ORDER.filter((stars) => {
    const range = sanitizeGemBustVarianceRange(sanitized[String(stars)]);
    return range.min > 0 || range.max > 0;
  });
  dom.gemBustVarianceStatus.textContent = active.length
    ? `${active.length} caliber${active.length === 1 ? '' : 's'} adjusted`
    : 'Untouched';
}

function updateGemBustVarianceRow(stars, value) {
  const key = String(stars);
  const range = sanitizeGemBustVarianceRange(value);
  const row = dom.gemBustVarianceRows?.querySelector(`[data-gem-bust-row="${key}"]`);
  if (!row) return;
  const minSlider = row.querySelector('[data-gem-bust-bound="min"]');
  const maxSlider = row.querySelector('[data-gem-bust-bound="max"]');
  const minReadout = row.querySelector('[data-gem-bust-control="minValue"]');
  const maxReadout = row.querySelector('[data-gem-bust-control="maxValue"]');
  const skill = row.querySelector('[data-gem-bust-delta="skill"]');
  const physical = row.querySelector('[data-gem-bust-delta="physical"]');
  if (minSlider && String(minSlider.value) !== String(range.min)) minSlider.value = range.min;
  if (maxSlider && String(maxSlider.value) !== String(range.max)) maxSlider.value = range.max;
  if (minReadout) minReadout.textContent = range.min;
  if (maxReadout) maxReadout.textContent = range.max;
  if (skill) skill.textContent = `Skills: ${varianceDeltaText(range, SKILL_RATING_VARIANCE_FACTOR)}`;
  if (physical) physical.textContent = `Physical: ${varianceDeltaText(range, PHYSICAL_RATING_VARIANCE_FACTOR)}`;
}

function renderGemBustVarianceSettings() {
  const values = sanitizeGemBustVariance(state.gemBustVariance);
  state.gemBustVariance = values;
  if (dom.gemBustVarianceRows) {
    dom.gemBustVarianceRows.innerHTML = STAR_CALIBER_ORDER
      .map((stars) => gemBustVarianceRowHtml(stars, values[String(stars)]))
      .join('');
  }
  updateGemBustVarianceStatus(values);
}

function setGemBustVariance(stars, bound, value) {
  const key = String(stars);
  if (!STAR_CALIBER_ORDER.includes(Number(key))) return;
  if (bound !== 'min' && bound !== 'max') return;
  state.gemBustVariance = sanitizeGemBustVariance(state.gemBustVariance);
  state.gemBustVariance[key] = {
    ...(state.gemBustVariance[key] || { min: 0, max: 0 }),
    [bound]: clampGemBustVariance(value)
  };
  invalidatePreviewFromSettingsChange();
  queueSettingsAutosave();
  updateGemBustVarianceRow(key, state.gemBustVariance[key]);
  updateGemBustVarianceStatus(state.gemBustVariance);
  const range = sanitizeGemBustVarianceRange(state.gemBustVariance[key]);
  setStatus(`${starCaliberLabel(key)} gem/bust variance set to -${range.min} / +${range.max}. Click Calculate to generate changes.`);
}

function resetGemBustVariance() {
  resetSettingModuleToDefault('gemBust');
  state.gemBustVariance = defaultGemBustVariance();
  storeGemBustVarianceSettings();
  autoSaveCurrentSettingsConfig();
  clearPreviewState();
  renderGemBustVarianceSettings();
  renderTable();
  renderSelectedDetail();
  setStatus('Gem/bust rating variance reset. Click Calculate to generate changes.');
}

function globalRatingVarianceRowHtml(field, value) {
  const range = sanitizeGlobalRatingVarianceRange(value);
  return `
    <tr data-global-rating-row="${escapeHtml(field)}">
      <th scope="row">${escapeHtml(ratingLabel(field))}</th>
      <td>
        <div class="position-variance-control rating-variance-control">
          <label class="position-variance-slider rating-variance-slider">
            <span>Min</span>
            <input
              type="range"
              min="0"
              max="${escapeHtml(MAX_GLOBAL_RATING_VARIANCE)}"
              step="1"
              value="${escapeHtml(range.min)}"
              data-global-rating-field="${escapeHtml(field)}"
              data-global-rating-bound="min"
              data-global-rating-control="slider"
              aria-label="${escapeHtml(ratingLabel(field))} minimum rating variance">
            <b class="variance-value" data-global-rating-control="minValue">${escapeHtml(range.min)}</b>
          </label>
          <label class="position-variance-slider rating-variance-slider">
            <span>Max</span>
            <input
              type="range"
              min="0"
              max="${escapeHtml(MAX_GLOBAL_RATING_VARIANCE)}"
              step="1"
              value="${escapeHtml(range.max)}"
              data-global-rating-field="${escapeHtml(field)}"
              data-global-rating-bound="max"
              data-global-rating-control="slider"
              aria-label="${escapeHtml(ratingLabel(field))} maximum rating variance">
            <b class="variance-value" data-global-rating-control="maxValue">${escapeHtml(range.max)}</b>
          </label>
        </div>
      </td>
      <td><span class="variance-range" data-global-rating-control="range">-${escapeHtml(range.min)} / +${escapeHtml(range.max)}</span></td>
    </tr>`;
}

function updateGlobalRatingVarianceStatus(values = state.globalRatingVariance) {
  if (!dom.globalRatingVarianceStatus) return;
  const sanitized = sanitizeGlobalRatingVariance(values);
  const active = ADJUSTABLE_RATING_FIELDS.filter((field) => {
    const range = sanitizeGlobalRatingVarianceRange(sanitized[field]);
    return range.min > 0 || range.max > 0;
  });
  dom.globalRatingVarianceStatus.textContent = active.length
    ? `${active.length} rating${active.length === 1 ? '' : 's'} adjusted`
    : 'Untouched';
}

function updateGlobalRatingVarianceRow(field, value) {
  const range = sanitizeGlobalRatingVarianceRange(value);
  const row = dom.globalRatingVarianceBody?.querySelector(`[data-global-rating-row="${field}"]`);
  if (!row) return;
  const minSlider = row.querySelector('[data-global-rating-bound="min"]');
  const maxSlider = row.querySelector('[data-global-rating-bound="max"]');
  const minReadout = row.querySelector('[data-global-rating-control="minValue"]');
  const maxReadout = row.querySelector('[data-global-rating-control="maxValue"]');
  const rangeReadout = row.querySelector('[data-global-rating-control="range"]');
  if (minSlider && String(minSlider.value) !== String(range.min)) minSlider.value = range.min;
  if (maxSlider && String(maxSlider.value) !== String(range.max)) maxSlider.value = range.max;
  if (minReadout) minReadout.textContent = range.min;
  if (maxReadout) maxReadout.textContent = range.max;
  if (rangeReadout) rangeReadout.textContent = `-${range.min} / +${range.max}`;
}

function renderGlobalRatingVarianceSettings() {
  const values = sanitizeGlobalRatingVariance(state.globalRatingVariance);
  state.globalRatingVariance = values;
  if (dom.globalRatingVarianceBody) {
    dom.globalRatingVarianceBody.innerHTML = ADJUSTABLE_RATING_FIELDS
      .map((field) => globalRatingVarianceRowHtml(field, values[field]))
      .join('');
  }
  updateGlobalRatingVarianceStatus(values);
}

function setGlobalRatingVariance(field, bound, value) {
  if (!ADJUSTABLE_RATING_FIELDS.includes(field)) return;
  if (bound !== 'min' && bound !== 'max') return;
  state.globalRatingVariance = sanitizeGlobalRatingVariance(state.globalRatingVariance);
  state.globalRatingVariance[field] = {
    ...(state.globalRatingVariance[field] || { min: 0, max: 0 }),
    [bound]: clampGlobalRatingVariance(value)
  };
  invalidatePreviewFromSettingsChange();
  queueSettingsAutosave();
  updateGlobalRatingVarianceRow(field, state.globalRatingVariance[field]);
  updateGlobalRatingVarianceStatus(state.globalRatingVariance);
  const range = sanitizeGlobalRatingVarianceRange(state.globalRatingVariance[field]);
  setStatus(`${ratingLabel(field)} global variance set to -${range.min} / +${range.max}. Click Calculate to generate changes.`);
}

function resetGlobalRatingVariance() {
  resetSettingModuleToDefault('globalRating');
  state.globalRatingVariance = defaultGlobalRatingVariance();
  storeGlobalRatingVarianceSettings();
  autoSaveCurrentSettingsConfig();
  clearPreviewState();
  renderGlobalRatingVarianceSettings();
  renderTable();
  renderSelectedDetail();
  setStatus('Global rating variance reset. Click Calculate to generate changes.');
}

function updateDiamondInTheRoughStatus(settings = state.diamondInTheRoughSettings) {
  const value = sanitizeDiamondInTheRoughSettings(settings).percent;
  if (dom.diamondInTheRoughPercentSlider && String(dom.diamondInTheRoughPercentSlider.value) !== String(value)) {
    dom.diamondInTheRoughPercentSlider.value = value;
  }
  if (dom.diamondInTheRoughPercentValue) dom.diamondInTheRoughPercentValue.textContent = `${value}%`;
  if (dom.diamondInTheRoughStatus) dom.diamondInTheRoughStatus.textContent = value ? 'Active' : 'Off';
}

function renderDiamondInTheRoughSettings() {
  state.diamondInTheRoughSettings = sanitizeDiamondInTheRoughSettings(state.diamondInTheRoughSettings);
  updateDiamondInTheRoughStatus(state.diamondInTheRoughSettings);
}

function setDiamondInTheRoughPercent(value) {
  state.diamondInTheRoughSettings = sanitizeDiamondInTheRoughSettings({ percent: value });
  invalidatePreviewFromSettingsChange();
  queueSettingsAutosave();
  updateDiamondInTheRoughStatus(state.diamondInTheRoughSettings);
  setStatus('Diamond in the Rough chance changed. Click Calculate to generate changes.');
}

function resetDiamondInTheRoughSettings() {
  resetSettingModuleToDefault('diamondInTheRough');
  state.diamondInTheRoughSettings = defaultDiamondInTheRoughSettings();
  storeDiamondInTheRoughSettings();
  autoSaveCurrentSettingsConfig();
  clearPreviewState();
  renderDiamondInTheRoughSettings();
  renderTable();
  renderSelectedDetail();
  setStatus('Diamond in the Rough settings reset. Click Calculate to generate changes.');
}

function updateBlueChipStatus(settings = state.blueChipSettings) {
  const value = sanitizeBlueChipSettings(settings).percent;
  if (dom.blueChipPercentSlider && String(dom.blueChipPercentSlider.value) !== String(value)) {
    dom.blueChipPercentSlider.value = value;
  }
  if (dom.blueChipPercentValue) dom.blueChipPercentValue.textContent = `${value}%`;
  if (dom.blueChipStatus) dom.blueChipStatus.textContent = value ? 'Active' : 'Off';
}

function renderBlueChipSettings() {
  state.blueChipSettings = sanitizeBlueChipSettings(state.blueChipSettings);
  updateBlueChipStatus(state.blueChipSettings);
}

function setBlueChipPercent(value) {
  state.blueChipSettings = sanitizeBlueChipSettings({ percent: value });
  invalidatePreviewFromSettingsChange();
  queueSettingsAutosave();
  updateBlueChipStatus(state.blueChipSettings);
  setStatus('Blue chip chance changed. Click Calculate to generate changes.');
}

function resetBlueChipSettings() {
  resetSettingModuleToDefault('blueChip');
  state.blueChipSettings = defaultBlueChipSettings();
  storeBlueChipSettings();
  autoSaveCurrentSettingsConfig();
  clearPreviewState();
  renderBlueChipSettings();
  renderTable();
  renderSelectedDetail();
  setStatus('Blue chip settings reset. Click Calculate to generate changes.');
}

function updateProjectPlayersStatus(settings = state.projectPlayersSettings) {
  const enabled = sanitizeProjectPlayersSettings(settings).enabled;
  if (dom.projectPlayersToggle && dom.projectPlayersToggle.checked !== enabled) {
    dom.projectPlayersToggle.checked = enabled;
  }
  if (dom.projectPlayersStatus) dom.projectPlayersStatus.textContent = enabled ? 'On' : 'Off';
}

function renderProjectPlayersSettings() {
  state.projectPlayersSettings = sanitizeProjectPlayersSettings(state.projectPlayersSettings);
  updateProjectPlayersStatus(state.projectPlayersSettings);
}

function setProjectPlayersEnabled(value) {
  state.projectPlayersSettings = sanitizeProjectPlayersSettings({ enabled: value });
  storeProjectPlayersSettings();
  autoSaveCurrentSettingsConfig();
  invalidatePreviewFromSettingsChange();
  updateProjectPlayersStatus(state.projectPlayersSettings);
  setStatus(`Project Players ${state.projectPlayersSettings.enabled ? 'enabled' : 'disabled'}. Click Calculate to generate changes.`);
}

function resetProjectPlayersSettings() {
  state.projectPlayersSettings = defaultProjectPlayersSettings();
  storeProjectPlayersSettings();
  autoSaveCurrentSettingsConfig();
  clearPreviewState();
  renderProjectPlayersSettings();
  renderTable();
  renderSelectedDetail();
  setStatus('Project Players reset. Click Calculate to generate changes.');
}

function updateHideGemsBustsStatus(settings = state.hideGemsBustsSettings) {
  const enabled = sanitizeHideGemsBustsSettings(settings).enabled;
  if (dom.hideGemsBustsToggle && dom.hideGemsBustsToggle.checked !== enabled) {
    dom.hideGemsBustsToggle.checked = enabled;
  }
  if (dom.hideGemsBustsStatus) dom.hideGemsBustsStatus.textContent = enabled ? 'On' : 'Off';
}

function renderHideGemsBustsSettings() {
  state.hideGemsBustsSettings = sanitizeHideGemsBustsSettings(state.hideGemsBustsSettings);
  updateHideGemsBustsStatus(state.hideGemsBustsSettings);
}

function setHideGemsBustsEnabled(value) {
  state.hideGemsBustsSettings = sanitizeHideGemsBustsSettings({ enabled: value });
  storeHideGemsBustsSettings();
  autoSaveCurrentSettingsConfig();
  invalidatePreviewFromSettingsChange();
  updateHideGemsBustsStatus(state.hideGemsBustsSettings);
  setStatus(`Hide Gems and Busts ${state.hideGemsBustsSettings.enabled ? 'enabled' : 'disabled'}. Click Calculate to generate changes.`);
}

function resetHideGemsBustsSettings() {
  state.hideGemsBustsSettings = defaultHideGemsBustsSettings();
  storeHideGemsBustsSettings();
  autoSaveCurrentSettingsConfig();
  clearPreviewState();
  renderHideGemsBustsSettings();
  renderTable();
  renderSelectedDetail();
  setStatus('Hide Gems and Busts reset. Click Calculate to generate changes.');
}

function strengthDeltaText(delta) {
  const value = clampStrengthDelta(delta);
  if (!value) return '0';
  return `${value > 0 ? '+' : ''}${value}`;
}

function starCaliberLabel(stars) {
  return `${stars}-star`;
}

function starCaliberStrengthRowHtml(stars, delta) {
  return `
    <div class="star-caliber-row" data-star-row="${escapeHtml(stars)}">
      <div class="star-caliber-label">${escapeHtml(starCaliberLabel(stars))}</div>
      <input
        type="range"
        min="0"
        max="20"
        step="1"
        value="${escapeHtml(strengthSliderValue(delta))}"
        data-star-caliber="${escapeHtml(stars)}"
        data-star-control="slider"
        aria-label="${escapeHtml(starCaliberLabel(stars))} strength">
      <input
        class="variance-number star-caliber-number"
        type="number"
        min="-10"
        max="10"
        step="1"
        value="${escapeHtml(delta)}"
        data-star-caliber="${escapeHtml(stars)}"
        data-star-control="number"
        aria-label="${escapeHtml(starCaliberLabel(stars))} strength delta">
      <div class="star-caliber-delta" data-star-control="delta">${escapeHtml(strengthDeltaText(delta))}</div>
    </div>`;
}

function updateStarCaliberStrengthStatus(deltas = state.starCaliberStrength) {
  if (!dom.starCaliberStrengthStatus) return;
  const active = STAR_CALIBER_ORDER.filter((stars) => clampStrengthDelta(deltas[String(stars)]));
  dom.starCaliberStrengthStatus.textContent = active.length
    ? `${active.length} caliber${active.length === 1 ? '' : 's'} adjusted`
    : 'Untouched';
}

function updateStarCaliberStrengthRow(stars, delta) {
  const key = String(stars);
  const clamped = clampStrengthDelta(delta);
  const row = dom.starCaliberStrengthRows?.querySelector(`[data-star-row="${key}"]`);
  if (!row) return;
  const slider = row.querySelector('[data-star-control="slider"]');
  const number = row.querySelector('[data-star-control="number"]');
  const deltaText = row.querySelector('[data-star-control="delta"]');
  const sliderValue = strengthSliderValue(clamped);
  if (slider && String(slider.value) !== String(sliderValue)) slider.value = sliderValue;
  if (number && String(number.value) !== String(clamped)) number.value = clamped;
  if (deltaText) deltaText.textContent = strengthDeltaText(clamped);
}

function renderStarCaliberStrengthSettings() {
  const deltas = sanitizeStarCaliberStrength(state.starCaliberStrength);
  state.starCaliberStrength = deltas;
  if (dom.starCaliberStrengthRows) {
    dom.starCaliberStrengthRows.innerHTML = STAR_CALIBER_ORDER
      .map((stars) => starCaliberStrengthRowHtml(stars, deltas[String(stars)]))
      .join('');
  }
  updateStarCaliberStrengthStatus(deltas);
}

function setStarCaliberStrength(stars, value) {
  const key = String(stars);
  if (!STAR_CALIBER_ORDER.includes(Number(key))) return;
  state.starCaliberStrength = sanitizeStarCaliberStrength(state.starCaliberStrength);
  state.starCaliberStrength[key] = clampStrengthDelta(value);
  invalidatePreviewFromSettingsChange();
  queueSettingsAutosave();
  updateStarCaliberStrengthRow(key, state.starCaliberStrength[key]);
  updateStarCaliberStrengthStatus(state.starCaliberStrength);
  setStatus(`${starCaliberLabel(key)} strength set to ${strengthDeltaText(state.starCaliberStrength[key])}. Click Calculate to generate changes.`);
}

function resetStarCaliberStrength() {
  resetSettingModuleToDefault('starStrength');
  state.starCaliberStrength = defaultStarCaliberStrength();
  storeStarCaliberStrengthSettings();
  autoSaveCurrentSettingsConfig();
  clearPreviewState();
  renderStarCaliberStrengthSettings();
  renderTable();
  renderSelectedDetail();
  setStatus('Star caliber strength reset. Click Calculate to generate changes.');
}

function positionVarianceRowHtml(position, value, kind, unitLabel, maxValue) {
  const clampFn = kind === 'height' ? clampHeightVariance : clampWeightVariance;
  const varianceRange = sanitizePositionVarianceRange(value, clampFn);
  return `
    <tr data-position-variance-row="${escapeHtml(kind)}-${escapeHtml(position)}">
      <th scope="row">${escapeHtml(position)}</th>
      <td>
        <div class="position-variance-control">
          <label class="position-variance-slider">
            <span>Min</span>
            <input
              type="range"
              min="0"
              max="${escapeHtml(maxValue)}"
              step="1"
              value="${escapeHtml(varianceRange.min)}"
              data-position="${escapeHtml(position)}"
              data-variance-kind="${escapeHtml(kind)}"
              data-variance-bound="min"
              data-variance-control="slider"
              aria-label="${escapeHtml(position)} ${escapeHtml(kind)} minimum variance">
            <b class="variance-value" data-variance-control="minValue">${escapeHtml(varianceRange.min)}</b>
          </label>
          <label class="position-variance-slider">
            <span>Max</span>
            <input
              type="range"
              min="0"
              max="${escapeHtml(maxValue)}"
              step="1"
              value="${escapeHtml(varianceRange.max)}"
              data-position="${escapeHtml(position)}"
              data-variance-kind="${escapeHtml(kind)}"
              data-variance-bound="max"
              data-variance-control="slider"
              aria-label="${escapeHtml(position)} ${escapeHtml(kind)} maximum variance">
            <b class="variance-value" data-variance-control="maxValue">${escapeHtml(varianceRange.max)}</b>
          </label>
        </div>
      </td>
      <td><span class="variance-range" data-variance-control="range">-${escapeHtml(varianceRange.min)} / +${escapeHtml(varianceRange.max)} ${escapeHtml(unitLabel)}</span></td>
    </tr>`;
}

function updatePositionVarianceStatus(kind, values = kind === 'height' ? state.heightVariance : state.weightVariance) {
  const isHeight = kind === 'height';
  const clampFn = isHeight ? clampHeightVariance : clampWeightVariance;
  const status = isHeight ? dom.heightVarianceStatus : dom.weightVarianceStatus;
  if (!status) return;
  const active = POSITION_ORDER.filter((position) => {
    const range = sanitizePositionVarianceRange(values[position], clampFn);
    return range.min > 0 || range.max > 0;
  });
  status.textContent = active.length
    ? `${active.length} position${active.length === 1 ? '' : 's'} adjusted`
    : 'Untouched';
}

function updatePositionVarianceRow(kind, position, value) {
  const isHeight = kind === 'height';
  const clampFn = isHeight ? clampHeightVariance : clampWeightVariance;
  const varianceRange = sanitizePositionVarianceRange(value, clampFn);
  const body = isHeight ? dom.heightVarianceBody : dom.weightVarianceBody;
  const unitLabel = isHeight ? 'in' : 'lbs';
  const row = body?.querySelector(`[data-position-variance-row="${kind}-${position}"]`);
  if (!row) return;
  const minSlider = row.querySelector('[data-variance-bound="min"]');
  const maxSlider = row.querySelector('[data-variance-bound="max"]');
  const minReadout = row.querySelector('[data-variance-control="minValue"]');
  const maxReadout = row.querySelector('[data-variance-control="maxValue"]');
  const rangeReadout = row.querySelector('[data-variance-control="range"]');
  if (minSlider && String(minSlider.value) !== String(varianceRange.min)) minSlider.value = varianceRange.min;
  if (maxSlider && String(maxSlider.value) !== String(varianceRange.max)) maxSlider.value = varianceRange.max;
  if (minReadout) minReadout.textContent = varianceRange.min;
  if (maxReadout) maxReadout.textContent = varianceRange.max;
  if (rangeReadout) rangeReadout.textContent = `-${varianceRange.min} / +${varianceRange.max} ${unitLabel}`;
}

function renderPositionVarianceSettings(kind) {
  const isHeight = kind === 'height';
  const values = sanitizePositionVariance(
    isHeight ? state.heightVariance : state.weightVariance,
    isHeight ? clampHeightVariance : clampWeightVariance
  );
  const body = isHeight ? dom.heightVarianceBody : dom.weightVarianceBody;
  if (isHeight) state.heightVariance = values;
  else state.weightVariance = values;
  if (body) {
    body.innerHTML = POSITION_ORDER
      .map((position) => positionVarianceRowHtml(
        position,
        values[position],
        kind,
        isHeight ? 'in' : 'lbs',
        isHeight ? MAX_HEIGHT_VARIANCE_INCHES : MAX_WEIGHT_VARIANCE_POUNDS
      ))
      .join('');
  }
  updatePositionVarianceStatus(kind, values);
}

function renderHeightVarianceSettings() {
  renderPositionVarianceSettings('height');
}

function renderWeightVarianceSettings() {
  renderPositionVarianceSettings('weight');
}

function setPositionVariance(kind, position, bound, value) {
  const isHeight = kind === 'height';
  if (!POSITION_ORDER.includes(position)) return;
  if (bound !== 'min' && bound !== 'max') return;
  if (isHeight) {
    state.heightVariance = sanitizePositionVariance(state.heightVariance, clampHeightVariance);
    state.heightVariance[position] = {
      ...(state.heightVariance[position] || { min: 0, max: 0 }),
      [bound]: clampHeightVariance(value)
    };
    updatePositionVarianceRow('height', position, state.heightVariance[position]);
    updatePositionVarianceStatus('height', state.heightVariance);
  } else {
    state.weightVariance = sanitizePositionVariance(state.weightVariance, clampWeightVariance);
    state.weightVariance[position] = {
      ...(state.weightVariance[position] || { min: 0, max: 0 }),
      [bound]: clampWeightVariance(value)
    };
    updatePositionVarianceRow('weight', position, state.weightVariance[position]);
    updatePositionVarianceStatus('weight', state.weightVariance);
  }
  invalidatePreviewFromSettingsChange();
  queueSettingsAutosave();
  const range = isHeight ? state.heightVariance[position] : state.weightVariance[position];
  setStatus(`${position} ${isHeight ? 'height' : 'weight'} variance set to -${range.min} / +${range.max}. Click Calculate to generate changes.`);
}

function resetHeightVariance() {
  resetSettingModuleToDefault('heightVariance');
  state.heightVariance = defaultHeightVariance();
  storePositionVarianceSettings(HEIGHT_VARIANCE_STORAGE_KEY, state.heightVariance, clampHeightVariance);
  autoSaveCurrentSettingsConfig();
  clearPreviewState();
  renderHeightVarianceSettings();
  renderTable();
  renderSelectedDetail();
  setStatus('Height variance reset. Click Calculate to generate changes.');
}

function resetWeightVariance() {
  resetSettingModuleToDefault('weightVariance');
  state.weightVariance = defaultWeightVariance();
  storePositionVarianceSettings(WEIGHT_VARIANCE_STORAGE_KEY, state.weightVariance, clampWeightVariance);
  autoSaveCurrentSettingsConfig();
  clearPreviewState();
  renderWeightVarianceSettings();
  renderTable();
  renderSelectedDetail();
  setStatus('Weight variance reset. Click Calculate to generate changes.');
}

function currentAppDefaultSettingsSnapshot() {
  return {
    version: APP_DEFAULT_SETTINGS_VERSION,
    savedAt: new Date().toISOString(),
    configName: sanitizeSettingsConfigName(state.settingsConfigName),
    settingModules: sanitizeSettingModules(state.settingModules),
    globalRatingVariance: sanitizeGlobalRatingVariance(state.globalRatingVariance),
    diamondInTheRoughSettings: sanitizeDiamondInTheRoughSettings(state.diamondInTheRoughSettings),
    blueChipSettings: sanitizeBlueChipSettings(state.blueChipSettings),
    projectPlayersSettings: sanitizeProjectPlayersSettings(state.projectPlayersSettings),
    hideGemsBustsSettings: sanitizeHideGemsBustsSettings(state.hideGemsBustsSettings),
    gemBustVariance: sanitizeGemBustVariance(state.gemBustVariance),
    starCaliberStrength: sanitizeStarCaliberStrength(state.starCaliberStrength),
    heightVariance: sanitizePositionVariance(state.heightVariance, clampHeightVariance),
    weightVariance: sanitizePositionVariance(state.weightVariance, clampWeightVariance),
    skinToneSettings: sanitizeSkinToneSettings(state.skinToneSettings || defaultSkinToneSettings())
  };
}

function settingsFromImportedConfig(payload) {
  const source = payload && typeof payload === 'object'
    ? (payload.settings && typeof payload.settings === 'object' ? payload.settings : payload)
    : {};
  const name = sanitizeSettingsConfigName(payload?.name ?? source.configName ?? source.name ?? DEFAULT_SETTINGS_CONFIG_NAME);
  return {
    name,
    settings: {
      version: APP_DEFAULT_SETTINGS_VERSION,
      savedAt: new Date().toISOString(),
      configName: name,
      settingModules: sanitizeSettingModules(source.settingModules),
      globalRatingVariance: sanitizeGlobalRatingVariance(source.globalRatingVariance),
      diamondInTheRoughSettings: sanitizeDiamondInTheRoughSettings(source.diamondInTheRoughSettings),
      blueChipSettings: sanitizeBlueChipSettings(source.blueChipSettings),
      projectPlayersSettings: sanitizeProjectPlayersSettings(source.projectPlayersSettings),
      hideGemsBustsSettings: sanitizeHideGemsBustsSettings(source.hideGemsBustsSettings),
      gemBustVariance: sanitizeGemBustVariance(source.gemBustVariance),
      starCaliberStrength: sanitizeStarCaliberStrength(source.starCaliberStrength),
      heightVariance: sanitizePositionVariance(source.heightVariance, clampHeightVariance),
      weightVariance: sanitizePositionVariance(source.weightVariance, clampWeightVariance),
      skinToneSettings: sanitizeSkinToneSettings(source.skinToneSettings ?? defaultSkinToneSettings())
    }
  };
}

function buildSettingsConfigExportPayload() {
  const settings = currentAppDefaultSettingsSnapshot();
  return {
    schema: SETTINGS_CONFIG_SCHEMA,
    schemaVersion: SETTINGS_CONFIG_SCHEMA_VERSION,
    app: 'Recruit Overhaul 27',
    exportedAt: new Date().toISOString(),
    name: settings.configName,
    settings
  };
}

function storeCurrentSettingsSnapshot() {
  writeStoredJsonSetting(APP_DEFAULT_SETTINGS_STORAGE_KEY, appDefaultSettings);
  storeSettingsConfigName();
  storeSettingModules();
  storeGlobalRatingVarianceSettings();
  storeDiamondInTheRoughSettings();
  storeBlueChipSettings();
  storeProjectPlayersSettings();
  storeHideGemsBustsSettings();
  storeGemBustVarianceSettings();
  storeStarCaliberStrengthSettings();
  storePositionVarianceSettings(HEIGHT_VARIANCE_STORAGE_KEY, state.heightVariance, clampHeightVariance);
  storePositionVarianceSettings(WEIGHT_VARIANCE_STORAGE_KEY, state.weightVariance, clampWeightVariance);
}

function cancelQueuedSettingsAutosave() {
  if (!settingsAutosaveTimer) return;
  clearTimeout(settingsAutosaveTimer);
  settingsAutosaveTimer = null;
}

function persistCurrentSettingsConfig({ updateStatus = true } = {}) {
  appDefaultSettings = currentAppDefaultSettingsSnapshot();
  storeCurrentSettingsSnapshot();
  renderSettingsConfigPanel();
  if (updateStatus && dom.settingsConfigStatus) {
    dom.settingsConfigStatus.textContent = `Saved ${appDefaultSettings.configName}`;
  }
}

function autoSaveCurrentSettingsConfig({ updateStatus = true } = {}) {
  cancelQueuedSettingsAutosave();
  persistCurrentSettingsConfig({ updateStatus });
}

function queueSettingsAutosave({ updateStatus = true } = {}) {
  const hadQueuedSave = Boolean(settingsAutosaveTimer);
  if (settingsAutosaveTimer) clearTimeout(settingsAutosaveTimer);
  if (!hadQueuedSave && updateStatus && dom.settingsConfigStatus) {
    dom.settingsConfigStatus.textContent = 'Unsaved changes';
  }
  settingsAutosaveTimer = setTimeout(() => {
    settingsAutosaveTimer = null;
    persistCurrentSettingsConfig({ updateStatus });
  }, SETTINGS_AUTOSAVE_DEBOUNCE_MS);
}

function flushQueuedSettingsAutosave({ updateStatus = false } = {}) {
  if (!settingsAutosaveTimer) return;
  cancelQueuedSettingsAutosave();
  persistCurrentSettingsConfig({ updateStatus });
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    flushQueuedSettingsAutosave({ updateStatus: false });
  });
}

function renderAllSettingsControls() {
  renderSettingsConfigPanel();
  renderSettingModuleToggles();
  renderGlobalRatingVarianceSettings();
  renderDiamondInTheRoughSettings();
  renderBlueChipSettings();
  renderProjectPlayersSettings();
  renderHideGemsBustsSettings();
  renderGemBustVarianceSettings();
  renderStarCaliberStrengthSettings();
  renderHeightVarianceSettings();
  renderWeightVarianceSettings();
  renderSkinToneSettings();
  renderNameWeightEditor();
  renderSettingsInfoPanel();
}

async function applySettingsConfig(payload) {
  const imported = settingsFromImportedConfig(payload);
  state.settingsConfigName = imported.name;
  state.settingModules = sanitizeSettingModules(imported.settings.settingModules);
  state.globalRatingVariance = sanitizeGlobalRatingVariance(imported.settings.globalRatingVariance);
  state.diamondInTheRoughSettings = sanitizeDiamondInTheRoughSettings(imported.settings.diamondInTheRoughSettings);
  state.blueChipSettings = sanitizeBlueChipSettings(imported.settings.blueChipSettings);
  state.projectPlayersSettings = sanitizeProjectPlayersSettings(imported.settings.projectPlayersSettings);
  state.hideGemsBustsSettings = sanitizeHideGemsBustsSettings(imported.settings.hideGemsBustsSettings);
  state.gemBustVariance = sanitizeGemBustVariance(imported.settings.gemBustVariance);
  state.starCaliberStrength = sanitizeStarCaliberStrength(imported.settings.starCaliberStrength);
  state.heightVariance = sanitizePositionVariance(imported.settings.heightVariance, clampHeightVariance);
  state.weightVariance = sanitizePositionVariance(imported.settings.weightVariance, clampWeightVariance);
  state.skinToneSettings = sanitizeSkinToneSettings(imported.settings.skinToneSettings);
  state.skinToneDirty = false;
  appDefaultSettings = {
    ...imported.settings,
    configName: imported.name,
    savedAt: new Date().toISOString()
  };
  storeCurrentSettingsSnapshot();
  if (window.recruitingApi?.saveSkinToneSettings) {
    const result = await window.recruitingApi.saveSkinToneSettings(state.skinToneSettings);
    if (!result.ok) throw new Error(result.error || 'Skin tone settings could not be saved.');
    state.skinToneSettings = sanitizeSkinToneSettings(result.settings);
  }
  clearPreviewState();
  renderAllSettingsControls();
  renderTable();
  renderSelectedDetail();
}

async function saveCurrentSettingsAsDefaults() {
  if (dom.saveAppDefaultsButton) dom.saveAppDefaultsButton.disabled = true;
  if (dom.appDefaultSettingsStatus) dom.appDefaultSettingsStatus.textContent = 'Saving...';
  try {
    appDefaultSettings = currentAppDefaultSettingsSnapshot();
    storeCurrentSettingsSnapshot();

    if (window.recruitingApi?.saveSkinToneSettings && state.skinToneSettings) {
      const result = await window.recruitingApi.saveSkinToneSettings(appDefaultSettings.skinToneSettings);
      if (!result.ok) throw new Error(result.error || 'Skin tone defaults could not be saved.');
      state.skinToneSettings = sanitizeSkinToneSettings(result.settings);
      state.skinToneDirty = false;
      renderSkinToneSettings();
    }

    if (dom.appDefaultSettingsStatus) dom.appDefaultSettingsStatus.textContent = 'Saved';
    setStatus('Current settings saved as the app default. Reset now returns to these values.');
  } catch (error) {
    if (dom.appDefaultSettingsStatus) dom.appDefaultSettingsStatus.textContent = 'Error';
    setStatus(`Could not save defaults: ${error.message}`);
  } finally {
    if (dom.saveAppDefaultsButton) dom.saveAppDefaultsButton.disabled = false;
  }
}

function syncSettingsConfigNameFromInput() {
  if (!dom.settingsConfigNameInput) return;
  state.settingsConfigName = sanitizeSettingsConfigName(dom.settingsConfigNameInput.value);
  autoSaveCurrentSettingsConfig();
}

async function exportSettingsConfig() {
  if (!window.recruitingApi?.exportSettingsConfig) {
    setStatus('Settings config export is unavailable.');
    return;
  }
  syncSettingsConfigNameFromInput();
  if (dom.exportSettingsConfigButton) dom.exportSettingsConfigButton.disabled = true;
  try {
    const payload = buildSettingsConfigExportPayload();
    const result = await window.recruitingApi.exportSettingsConfig(payload);
    if (result.canceled) {
      setStatus('Settings config export canceled.');
      return;
    }
    if (!result.ok) throw new Error(result.error || 'Settings config could not be exported.');
    if (dom.settingsConfigStatus) dom.settingsConfigStatus.textContent = `Exported ${payload.name}`;
    setStatus(`Settings config exported: ${result.path}`);
  } catch (error) {
    if (dom.settingsConfigStatus) dom.settingsConfigStatus.textContent = 'Export failed';
    setStatus(`Could not export settings config: ${error.message}`);
  } finally {
    if (dom.exportSettingsConfigButton) dom.exportSettingsConfigButton.disabled = false;
  }
}

async function importSettingsConfig() {
  if (!window.recruitingApi?.importSettingsConfig) {
    setStatus('Settings config import is unavailable.');
    return;
  }
  if (dom.importSettingsConfigButton) dom.importSettingsConfigButton.disabled = true;
  try {
    const result = await window.recruitingApi.importSettingsConfig();
    if (result.canceled) {
      setStatus('Settings config import canceled.');
      return;
    }
    if (!result.ok) throw new Error(result.error || 'Settings config could not be imported.');
    await applySettingsConfig(result.config);
    if (dom.settingsConfigStatus) dom.settingsConfigStatus.textContent = `Imported ${state.settingsConfigName}`;
    setStatus(`Settings config imported: ${state.settingsConfigName}`);
  } catch (error) {
    if (dom.settingsConfigStatus) dom.settingsConfigStatus.textContent = 'Import failed';
    setStatus(`Could not import settings config: ${error.message}`);
  } finally {
    if (dom.importSettingsConfigButton) dom.importSettingsConfigButton.disabled = false;
  }
}

function clearPreviewState({ render = false, message = '' } = {}) {
  const hadPreview = state.previewActive || state.previewByRecruitRow.size;
  state.previewActive = false;
  state.previewByRecruitRow = new Map();
  if (dom.previewButton) dom.previewButton.textContent = 'Calculate';
  hideCalculateOverlay();
  updateActionButtons();
  renderRecruitingSpoilerGate();
  if (render && hadPreview) {
    renderTable();
    renderSelectedDetail();
  }
  if (message) setStatus(message);
}

function saveEnumKey(value) {
  return String(value || '').trim().toLowerCase();
}

function abilityRankSaveValue(rank) {
  return ABILITY_RANK_SAVE_VALUE[saveEnumKey(rank)] ?? null;
}

function devTraitSaveValue(devTrait) {
  return DEV_TRAIT_SAVE_VALUE[saveEnumKey(devTrait)] ?? null;
}

function saveInteger(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number) : null;
}

function displayWeightToRawWeight(value) {
  const pounds = saveInteger(value);
  if (pounds === null) return null;
  return Math.max(0, pounds - MIN_PREVIEW_WEIGHT_POUNDS);
}

function addSaveField(fields, field, nextValue, currentValue) {
  if (nextValue === null || nextValue === undefined || nextValue === '') return;
  if (String(nextValue) === String(currentValue ?? '')) return;
  fields[field] = nextValue;
}

function buildPlayerSaveFields(row) {
  const fields = {};
  addSaveField(fields, 'FirstName', String(previewFieldValue(row, 'firstName') || '').trim(), row.firstName);
  addSaveField(fields, 'LastName', String(previewFieldValue(row, 'lastName') || '').trim(), row.lastName);
  addSaveField(fields, 'Height', saveInteger(previewFieldValue(row, 'heightTotalInches')), row.heightTotalInches);
  addSaveField(fields, 'Weight', displayWeightToRawWeight(previewFieldValue(row, 'weight')), row.weightRaw);
  addSaveField(fields, 'GenericHeadAssetName', previewFieldValue(row, 'genericHeadAssetName'), row.genericHeadAssetName);
  addSaveField(fields, 'PLYR_PORTRAIT', saveInteger(previewFieldValue(row, 'portraitId')), row.portraitId);

  const devTrait = previewFieldValue(row, 'devTrait');
  if (String(devTrait || '') !== String(row.devTrait || '')) {
    addSaveField(fields, 'TraitDevelopment', devTraitSaveValue(devTrait), row.devTraitRaw);
  }

  for (let slot = 1; slot <= 5; slot += 1) {
    const rank = previewFieldValue(row, `physicalAbility${slot}Rank`);
    if (String(rank || '') !== String(row[`physicalAbility${slot}Rank`] || '')) {
      addSaveField(fields, `PhysicalAbility${slot}`, abilityRankSaveValue(rank), row[`physicalAbility${slot}Raw`]);
    }
  }

  for (let slot = 1; slot <= 3; slot += 1) {
    const rank = previewFieldValue(row, `mentalAbility${slot}Rank`);
    if (String(rank || '') !== String(row[`mentalAbility${slot}Rank`] || '')) {
      addSaveField(fields, `MentalAbilityRank${slot}`, abilityRankSaveValue(rank), row[`mentalAbility${slot}RankRaw`]);
    }
  }

  for (const field of ADJUSTABLE_RATING_FIELDS) {
    addSaveField(fields, field, adjustedRatingValue(row, field), baseRatingValue(row, field));
  }
  addSaveField(fields, 'OverallRating', ratingValue(row, 'OverallRating'), baseRatingValue(row, 'OverallRating'));
  return fields;
}

function shouldHideGemBustTag(row) {
  if (!sanitizeHideGemsBustsSettings(state.hideGemsBustsSettings).enabled) return false;
  return row?.gemBust === 'Gem' || row?.gemBust === 'Bust';
}

function buildRecruitSaveFields(row) {
  const fields = {};
  if (shouldHideGemBustTag(row)) {
    addSaveField(fields, 'QualityModifier', GEM_BUST_NORMAL_SAVE_VALUE, row.gemBustRaw);
  }
  return fields;
}

function buildSavePreviewPayload() {
  const playerRows = [];
  const recruitRows = [];
  let changedFieldCount = 0;
  for (const row of state.rows) {
    if (!previewForRow(row)) continue;
    const rowIndex = saveInteger(row.playerRow);
    if (rowIndex !== null) {
      const fields = buildPlayerSaveFields(row);
      const fieldCount = Object.keys(fields).length;
      if (fieldCount) {
        changedFieldCount += fieldCount;
        playerRows.push({ rowIndex, fields });
      }
    }

    const recruitRowIndex = saveInteger(row.recruitRow);
    const recruitFields = recruitRowIndex === null ? {} : buildRecruitSaveFields(row);
    const recruitFieldCount = Object.keys(recruitFields).length;
    if (recruitFieldCount) {
      changedFieldCount += recruitFieldCount;
      recruitRows.push({ rowIndex: recruitRowIndex, fields: recruitFields });
    }
  }
  const changedRowCount = playerRows.length + recruitRows.length;
  return {
    dynastyPath: state.selectedDynastyPath,
    previewRun: state.previewRun,
    changedFieldCount,
    changedRowCount,
    playerRows,
    recruitRows
  };
}

async function saveCalculatedChanges() {
  if (!state.previewActive) {
    setStatus('Click Calculate before saving changes.');
    return;
  }
  if (!state.selectedDynastyPath) {
    setStatus('Load a dynasty file before saving changes.');
    return;
  }
  if (!window.recruitingApi?.savePreviewChanges) {
    setStatus('Save API unavailable.');
    return;
  }

  const payload = buildSavePreviewPayload();
  if (!payload.changedRowCount) {
    setStatus('No calculated changes to save.');
    return;
  }
  const confirmed = window.confirm(`Save calculated changes for ${formatNumber(payload.changedRowCount)} table rows to the selected dynasty file?\n\nMake sure this dynasty file is not open in game.\nA backup will be created beside the save first.`);
  if (!confirmed) {
    setStatus('Save canceled.');
    return;
  }

  const selectedPath = state.selectedDynastyPath;
  hideCalculateOverlay();
  if (dom.saveButton) dom.saveButton.textContent = 'Saving...';
  setFileLoading(true, 'Saving Dynasty...', { progressLabel: 'Saving Dynasty' });
  setLoadProgress(null, { visible: true, label: 'Saving Dynasty' });
  try {
    const result = await window.recruitingApi.savePreviewChanges(payload);
    if (!result.ok) {
      throw new Error(result.error || 'Save failed.');
    }
    const hiddenText = result.recruitChangedRows ? ` Hidden gem/bust tags: ${formatNumber(result.recruitChangedRows)}.` : '';
    const message = `Saved ${formatNumber(result.changedRows || payload.changedRowCount)} table rows (${formatNumber(result.changedFields || payload.changedFieldCount)} fields).${hiddenText} Backup: ${result.backupPath}`;
    clearPreviewState({ render: false });
    const reloaded = await loadDynastyFromPath(selectedPath, {
      loadingMessage: 'Saving Dynasty...',
      progressLabel: 'Saving Dynasty',
      renderingMessage: 'Finalizing recruits...'
    });
    setStatus(reloaded ? message : `${message}. Reload failed; load the file again to refresh the table.`);
  } catch (error) {
    setLoadStatus(`Save failed: ${error.message}`, 'error');
    setStatus(`Save failed: ${error.message}`);
  } finally {
    if (dom.saveButton) dom.saveButton.textContent = 'Save';
    setFileLoading(false);
  }
}

function randomWeightedEntry(pool = []) {
  const valid = pool
    .map((entry) => ({ name: String(entry.name || '').trim(), weight: clampNameWeight(entry.weight) }))
    .filter((entry) => entry.name && entry.weight > 0);
  if (!valid.length) return '';
  const total = valid.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = Math.random() * total;
  for (const entry of valid) {
    roll -= entry.weight;
    if (roll <= 0) return entry.name;
  }
  return valid[valid.length - 1].name;
}

function namePool(group) {
  return state.nameWeights?.pools?.[group] || [];
}

function skinToneNamePrefix(skinTone) {
  return skinTone === 'Dark' ? 'Dark' : skinTone === 'Medium' ? 'Medium' : 'Light';
}

function weightedSkinToneForPosition(position) {
  const key = normalizePositionKey(position);
  const settings = sanitizeSkinToneSettings(state.skinToneSettings || defaultSkinToneSettings());
  const mix = normalizeToneMix(settings.positions[key] || settings.positions.ATH);
  const roll = Math.random() * 100;
  if (roll < mix.light) return 'Light';
  if (roll < mix.light + mix.medium) return 'Medium';
  return 'Dark';
}

function bodyFolderForPreview(row) {
  const label = bodyTypeLabel(row);
  if (label === 'Standard Alternate') return 'Standard';
  if (label === 'Thin Alternate') return 'Thin';
  if (label === 'Freshman') return 'Thin';
  if (['Heavy', 'Muscular', 'Standard', 'Thin', 'Unknown'].includes(label)) return label;
  return 'Unknown';
}

function portraitCandidatesFor(row, skinTone) {
  const byBody = state.portraitManifest?.bySkinBody?.[skinTone] || {};
  const body = bodyFolderForPreview(row);
  return byBody[body] || [];
}

function randomPortraitFor(row, skinTone) {
  const candidates = portraitCandidatesFor(row, skinTone);
  if (!candidates.length) return null;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

function specialNameGroups(row) {
  const standardGroups = {
    firstName: '',
    lastName: ''
  };
  if (Math.random() >= 0.2) return standardGroups;
  const stateName = String(row.homeState || '').trim().toLowerCase();
  if (stateName === 'hawaii') {
    return {
      firstName: 'HawaiianFirstNames',
      lastName: 'HawaiianLastNames'
    };
  }
  if (stateName === 'louisiana') {
    return {
      firstName: '',
      lastName: 'CajunNames'
    };
  }
  return standardGroups;
}

function randomWeightedName(primaryGroup, fallbackGroup) {
  return randomWeightedEntry(namePool(primaryGroup)) || randomWeightedEntry(namePool(fallbackGroup));
}

function randomPreviewName(row, skinTone) {
  const prefix = skinToneNamePrefix(skinTone);
  const specialGroups = specialNameGroups(row);
  return {
    firstName: randomWeightedName(specialGroups.firstName, `${prefix}FirstNames`) || row.firstName || '',
    lastName: randomWeightedName(specialGroups.lastName, `${prefix}LastNames`) || row.lastName || ''
  };
}

function hasLastNameSuffix(lastName) {
  return LAST_NAME_SUFFIX_PATTERN.test(String(lastName || '').trim());
}

function rollLastNameSuffix() {
  const roll = Math.random() * 100;
  let cursor = 0;
  for (const rule of LAST_NAME_SUFFIX_RULES) {
    cursor += rule.chance;
    if (roll < cursor) return rule.suffix;
  }
  return '';
}

function maybeAddLastNameSuffix(lastName) {
  const clean = String(lastName || '').trim();
  if (!clean || hasLastNameSuffix(clean)) return clean;
  const suffix = rollLastNameSuffix();
  return suffix ? `${clean} ${suffix}` : clean;
}

function randomBoundedVariance(range) {
  const min = Math.max(0, Math.round(Number(range?.min) || 0));
  const max = Math.max(0, Math.round(Number(range?.max) || 0));
  const lower = -min;
  const upper = max;
  if (lower === 0 && upper === 0) return 0;
  return Math.floor(Math.random() * (upper - lower + 1)) + lower;
}

function buildGlobalRatingVarianceDeltas(row) {
  if (!isSettingModuleEnabled('globalRating')) return {};
  const settings = sanitizeGlobalRatingVariance(state.globalRatingVariance);
  const deltas = {};
  for (const field of ADJUSTABLE_RATING_FIELDS) {
    if (numericValue(baseRatingValue(row, field)) === null) continue;
    const delta = randomBoundedVariance(settings[field] || { min: 0, max: 0 });
    if (delta) deltas[field] = delta;
  }
  return deltas;
}

function isDiamondInTheRoughEligible(row) {
  const stars = Number(starCaliberKey(row));
  return row?.gemBust === 'Gem' && Number.isFinite(stars) && stars <= 3;
}

function rollDiamondInTheRough(row) {
  if (!isSettingModuleEnabled('diamondInTheRough')) return false;
  if (!isDiamondInTheRoughEligible(row)) return false;
  const percent = sanitizeDiamondInTheRoughSettings(state.diamondInTheRoughSettings).percent;
  return percent > 0 && Math.random() * 100 < percent;
}

function diamondInTheRoughBonusMax(field) {
  return PHYSICAL_RATING_FIELDS.has(field)
    ? DIAMOND_IN_THE_ROUGH_PHYSICAL_BONUS_MAX
    : DIAMOND_IN_THE_ROUGH_SKILL_BONUS_MAX;
}

function buildDiamondInTheRoughRatingDeltas(row) {
  const deltas = {};
  for (const field of ADJUSTABLE_RATING_FIELDS) {
    if (numericValue(baseRatingValue(row, field)) === null) continue;
    const max = diamondInTheRoughBonusMax(field);
    const delta = Math.floor(Math.random() * (max + 1));
    if (delta) deltas[field] = delta;
  }
  return deltas;
}

function isBlueChipEligible(row) {
  const stars = Number(starCaliberKey(row));
  return row?.gemBust === 'Gem' && Number.isFinite(stars) && stars >= 4;
}

function rollBlueChip(row) {
  if (!isSettingModuleEnabled('blueChip')) return false;
  if (!isBlueChipEligible(row)) return false;
  const percent = sanitizeBlueChipSettings(state.blueChipSettings).percent;
  return percent > 0 && Math.random() * 100 < percent;
}

function blueChipBonusMax(field) {
  return PHYSICAL_RATING_FIELDS.has(field) ? BLUE_CHIP_PHYSICAL_BONUS_MAX : BLUE_CHIP_SKILL_BONUS_MAX;
}

function buildBlueChipRatingDeltas(row) {
  const deltas = {};
  for (const field of ADJUSTABLE_RATING_FIELDS) {
    if (numericValue(baseRatingValue(row, field)) === null) continue;
    const max = blueChipBonusMax(field);
    const delta = Math.floor(Math.random() * (max + 1));
    if (delta) deltas[field] = delta;
  }
  return deltas;
}

function isProjectPlayerEligible(row) {
  return row?.gemBust === 'Normal';
}

function rollProjectPlayer(row) {
  if (!isProjectPlayerEligible(row)) return false;
  const enabled = sanitizeProjectPlayersSettings(state.projectPlayersSettings).enabled;
  return enabled && Math.random() * 100 < PROJECT_PLAYER_CHANCE_PERCENT;
}

function buildProjectPlayerRatingDeltas(row) {
  const deltas = {};
  for (const field of ADJUSTABLE_RATING_FIELDS) {
    if (numericValue(baseRatingValue(row, field)) === null) continue;
    const physical = PHYSICAL_RATING_FIELDS.has(field);
    const max = physical ? PROJECT_PLAYER_PHYSICAL_BOOST_MAX : PROJECT_PLAYER_SKILL_DROP_MAX;
    const delta = Math.floor(Math.random() * (max + 1));
    const signedDelta = physical ? delta : -delta;
    if (signedDelta) deltas[field] = signedDelta;
  }
  return deltas;
}

function rollProjectPlayerDevTraitDelta() {
  return Math.random() < PROJECT_PLAYER_DEV_UPGRADE_DOUBLE_CHANCE ? 2 : 1;
}

function heightVarianceForPosition(position) {
  const key = normalizePositionKey(position);
  const settings = sanitizePositionVariance(state.heightVariance, clampHeightVariance);
  return settings[key] || settings.ATH || { min: 0, max: 0 };
}

function weightVarianceForPosition(position) {
  const key = normalizePositionKey(position);
  const settings = sanitizePositionVariance(state.weightVariance, clampWeightVariance);
  return settings[key] || settings.ATH || { min: 0, max: 0 };
}

function previewHeightForRow(row) {
  const base = numericValue(row.heightTotalInches);
  if (!isSettingModuleEnabled('heightVariance')) return { height: row.height || '', heightTotalInches: row.heightTotalInches || '' };
  if (base === null) return { height: row.height || '', heightTotalInches: row.heightTotalInches || '' };
  const delta = randomBoundedVariance(heightVarianceForPosition(row.position));
  const heightTotalInches = Math.max(MIN_PREVIEW_HEIGHT_INCHES, Math.min(MAX_PREVIEW_HEIGHT_INCHES, base + delta));
  return { height: formatHeight(heightTotalInches), heightTotalInches };
}

function previewWeightForRow(row) {
  const base = numericValue(row.weight);
  if (!isSettingModuleEnabled('weightVariance')) return { weight: row.weight || '' };
  if (base === null) return { weight: row.weight || '' };
  const delta = randomBoundedVariance(weightVarianceForPosition(row.position));
  const weight = Math.max(MIN_PREVIEW_WEIGHT_POUNDS, Math.min(MAX_PREVIEW_WEIGHT_POUNDS, base + delta));
  return { weight: String(weight) };
}

function buildPreviewForRow(row) {
  const skinToneEnabled = isSettingModuleEnabled('skinTone');
  const nameWeightsEnabled = isSettingModuleEnabled('nameWeights');
  const ratingDeltas = buildGlobalRatingVarianceDeltas(row);
  const diamondInTheRough = rollDiamondInTheRough(row);
  const diamondInTheRoughRatingDeltas = diamondInTheRough ? buildDiamondInTheRoughRatingDeltas(row) : {};
  const blueChip = rollBlueChip(row);
  const blueChipRatingDeltas = blueChip ? buildBlueChipRatingDeltas(row) : {};
  const projectPlayer = rollProjectPlayer(row);
  const projectPlayerRatingDeltas = projectPlayer ? buildProjectPlayerRatingDeltas(row) : {};
  const projectPlayerDevTraitDelta = projectPlayer ? rollProjectPlayerDevTraitDelta() : 0;
  const skinTone = weightedSkinToneForPosition(row.position);
  const portrait = skinToneEnabled ? randomPortraitFor(row, skinTone) : null;
  const name = nameWeightsEnabled ? randomPreviewName(row, skinTone) : {
    firstName: row.firstName || '',
    lastName: row.lastName || ''
  };
  if (isSettingModuleEnabled('nameSuffixes')) {
    name.lastName = maybeAddLastNameSuffix(name.lastName);
  }
  const heightPreview = previewHeightForRow(row);
  const weightPreview = previewWeightForRow(row);
  return {
    ratingDeltas,
    diamondInTheRough,
    diamondInTheRoughRatingDeltas,
    blueChip,
    blueChipRatingDeltas,
    projectPlayer,
    projectPlayerRatingDeltas,
    projectPlayerDevTraitDelta,
    ...name,
    ...heightPreview,
    ...weightPreview,
    skinTone: skinToneEnabled ? skinTone : '',
    headId: portrait?.headId || row.genericHeadPortraitId || '',
    portraitId: portrait?.portraitId ?? row.portraitId ?? '',
    portraitPath: portrait?.path || row.portraitPath || '',
    portraitFileName: portrait?.fileName || row.portraitFileName || '',
    genericHeadAssetName: portrait?.genericHeadAssetName || row.genericHeadAssetName || '',
    bodyType: portrait?.bodyType || bodyFolderForPreview(row)
  };
}

async function loadPortraitManifest() {
  if (!window.recruitingApi?.getPortraitManifest) {
    state.portraitManifest = null;
    state.portraitManifestLoaded = false;
    setStatus('Portrait manifest API unavailable.');
    return false;
  }
  const result = await window.recruitingApi.getPortraitManifest();
  if (!result.ok) {
    state.portraitManifest = null;
    state.portraitManifestLoaded = false;
    setStatus(`Portrait manifest unavailable: ${result.error}`);
    return false;
  }
  state.portraitManifest = result;
  state.portraitManifestLoaded = true;
  return true;
}

async function runPreview() {
  if (!state.dataLoaded || !state.rows.length) {
    setStatus('Load a dynasty file before calculating changes.');
    return;
  }
  state.calculating = true;
  renderRecruitingSpoilerGate();
  setCalculateOverlay('busy', {
    title: 'Calculating recruit changes...',
    copy: 'Building a new preview from the current settings.',
    percent: 3,
    progressLabel: 'Preparing'
  });
  setStatus('Calculating recruit preview...');
  updateActionButtons();
  dom.previewButton.textContent = 'Calculating...';
  await nextPaint();
  try {
    const nameWeightsEnabled = isSettingModuleEnabled('nameWeights');
    const skinToneEnabled = isSettingModuleEnabled('skinTone');
    if (nameWeightsEnabled && !state.nameWeights?.groups?.length && !(await loadNameWeights())) {
      setCalculateOverlay('error', {
        title: 'Calculation stopped',
        copy: 'Name pools could not be loaded. Fix the name data and run Calculate again.'
      });
      return;
    }
    setCalculateProgress(12, skinToneEnabled ? 'Loading portraits' : 'Preparing recruits');
    await nextPaint();
    if (skinToneEnabled && !state.portraitManifestLoaded && !(await loadPortraitManifest())) {
      setCalculateOverlay('error', {
        title: 'Calculation stopped',
        copy: 'Portrait data could not be loaded. Fix the portrait data and run Calculate again.'
      });
      return;
    }
    const previewMap = new Map();
    const totalRows = Math.max(1, state.rows.length);
    for (const [index, row] of state.rows.entries()) {
      previewMap.set(row.recruitRow, buildPreviewForRow(row));
      if (index % 150 === 0 || index === state.rows.length - 1) {
        const percent = 12 + Math.round(((index + 1) / totalRows) * 76);
        setCalculateProgress(percent, `${formatNumber(index + 1)} / ${formatNumber(state.rows.length)} recruits`);
        await nextPaint();
      }
    }
    state.previewByRecruitRow = previewMap;
    state.previewActive = true;
    state.previewRun += 1;
    setCalculateProgress(92, 'Preparing results');
    await nextPaint();
    const payload = buildSavePreviewPayload();
    dom.previewButton.textContent = 'Calculate Again';
    updateActionButtons();
    renderTable();
    renderSelectedDetail();
    hideCalculateOverlay();
    renderRecruitingSpoilerGate();
    setStatus(`Calculation ready: ${formatNumber(previewMap.size)} recruits previewed, ${formatNumber(payload.changedRowCount)} rows ready, ${formatNumber(payload.changedFieldCount)} fields ready. Click Save to write the changes to the selected dynasty file.`);
  } catch (error) {
    setCalculateOverlay('error', {
      title: 'Calculation failed',
      copy: error.message || 'The preview could not be generated.'
    });
    setStatus(`Calculation failed: ${error.message}`);
  } finally {
    state.calculating = false;
    updateActionButtons();
    renderRecruitingSpoilerGate();
    if (!state.previewActive) dom.previewButton.textContent = 'Calculate';
  }
}

function clampPercent(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(100, Math.round(parsed)));
}

function normalizeToneMix(mix = {}) {
  let light = clampPercent(mix.light);
  let medium = clampPercent(mix.medium);
  let dark = clampPercent(mix.dark);
  const total = light + medium + dark;
  if (total <= 0) return { light: 34, medium: 33, dark: 33 };
  if (total !== 100) {
    light = Math.round((light / total) * 100);
    medium = Math.round((medium / total) * 100);
    dark = 100 - light - medium;
  }
  return { light, medium, dark };
}

function defaultSkinToneSettings() {
  const baselines = {
    QB: { light: 50, medium: 27, dark: 23 },
    HB: { light: 20, medium: 30, dark: 50 },
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

function sanitizeSkinToneSettings(settings = {}) {
  const defaults = defaultSkinToneSettings();
  const incoming = settings.positions || {};
  return {
    version: 1,
    updatedAt: settings.updatedAt || new Date().toISOString(),
    positions: Object.fromEntries(POSITION_ORDER.map((position) => [
      position,
      normalizeToneMix(sourcePositionValue(incoming, position) || defaults.positions[position])
    ]))
  };
}

function defaultSkinToneResetSettings() {
  return sanitizeSkinToneSettings(appDefaultSettings?.skinToneSettings || defaultSkinToneSettings());
}

function calculateMedium(light, dark) {
  return Math.max(0, 100 - clampPercent(light) - clampPercent(dark));
}

function setEditableToneMix(mix, changedTone, changedValue) {
  const current = normalizeToneMix(mix);
  const value = clampPercent(changedValue);
  if (changedTone === 'light') {
    current.light = Math.min(value, 100 - current.dark);
  } else if (changedTone === 'dark') {
    current.dark = Math.min(value, 100 - current.light);
  }
  current.medium = calculateMedium(current.light, current.dark);
  return current;
}

function editableToneBoxHtml(position, tone, value) {
  return `
    <div class="tone-box">
      <input
        type="number"
        min="0"
        max="100"
        step="1"
        value="${escapeHtml(value)}"
        data-position="${escapeHtml(position)}"
        data-tone="${escapeHtml(tone)}"
        aria-label="${escapeHtml(position)} ${escapeHtml(tone)} percent">
      <span>%</span>
    </div>`;
}

function readonlyToneBoxHtml(value) {
  return `
    <div class="tone-box readonly">
      <input type="number" value="${escapeHtml(value)}" readonly aria-label="Medium percent">
      <span>%</span>
    </div>`;
}

function renderSkinToneSettings() {
  const settings = state.skinToneSettings || defaultSkinToneSettings();
  dom.skinToneSettingsBody.innerHTML = POSITION_ORDER.map((position) => {
    const mix = normalizeToneMix(settings.positions[position]);
    const total = mix.light + mix.medium + mix.dark;
    return `
      <tr>
        <th scope="row">${escapeHtml(position)}</th>
        <td>${editableToneBoxHtml(position, 'light', mix.light)}</td>
        <td>${readonlyToneBoxHtml(mix.medium)}</td>
        <td>${editableToneBoxHtml(position, 'dark', mix.dark)}</td>
        <td class="settings-total">${escapeHtml(total)}%</td>
      </tr>`;
  }).join('');
}

async function loadSkinToneSettings() {
  const fallback = defaultSkinToneSettings();
  if (!window.recruitingApi?.getSkinToneSettings) {
    state.skinToneSettings = fallback;
    renderSkinToneSettings();
    autoSaveCurrentSettingsConfig({ updateStatus: false });
    return;
  }
  const result = await window.recruitingApi.getSkinToneSettings();
  state.skinToneSettings = sanitizeSkinToneSettings(result.ok ? result.settings : fallback);
  state.skinToneDirty = false;
  renderSkinToneSettings();
  autoSaveCurrentSettingsConfig({ updateStatus: false });
  if (!result.ok) setStatus(`Skin tone settings unavailable: ${result.error}`);
}

async function saveSkinToneSettings() {
  if (!window.recruitingApi?.saveSkinToneSettings) return;
  const result = await window.recruitingApi.saveSkinToneSettings(state.skinToneSettings || defaultSkinToneSettings());
  if (!result.ok) {
    setStatus(`Could not save settings: ${result.error}`);
    return;
  }
  state.skinToneSettings = sanitizeSkinToneSettings(result.settings);
  state.skinToneDirty = false;
  renderSkinToneSettings();
  autoSaveCurrentSettingsConfig();
  setStatus('Skin tone settings saved.');
}

function setSkinToneValue(position, tone, value) {
  const settings = sanitizeSkinToneSettings(state.skinToneSettings || defaultSkinToneSettings());
  settings.positions[position] = setEditableToneMix(settings.positions[position], tone, value);
  settings.updatedAt = new Date().toISOString();
  state.skinToneSettings = settings;
  state.skinToneDirty = true;
  clearPreviewState();
  renderSkinToneSettings();
  autoSaveCurrentSettingsConfig();
  setStatus('Skin tone settings changed. Click Calculate to generate changes.');
}

function resetSkinToneSettings() {
  resetSettingModuleToDefault('skinTone');
  state.skinToneSettings = defaultSkinToneResetSettings();
  state.skinToneDirty = true;
  clearPreviewState();
  renderSkinToneSettings();
  autoSaveCurrentSettingsConfig();
  setStatus('Skin tone settings reset. Click Calculate to generate changes.');
}

function clampNameWeight(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(999999, Math.round(parsed)));
}

function clampNamePercent(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(100, parsed));
}

function nameWeightPercent(entry, totalWeight) {
  const total = Number(totalWeight);
  if (!Number.isFinite(total) || total <= 0) return 0;
  return (clampNameWeight(entry.weight) / total) * 100;
}

function formatNamePercent(value) {
  const percent = clampNamePercent(value);
  if (percent >= 10) return percent.toFixed(2);
  if (percent >= 1) return percent.toFixed(3);
  return percent.toFixed(4);
}

function nameWeightGroupLabel(group) {
  return String(group || '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanNameWeightEntry(entry = {}) {
  return {
    name: String(entry.name ?? '').replace(/\r?\n/g, ' ').trim(),
    weight: clampNameWeight(entry.weight)
  };
}

function sanitizeNameWeightPayload(payload = {}) {
  const rawPools = payload.pools || {};
  const incomingGroups = Array.isArray(payload.groups) ? payload.groups : Object.keys(rawPools);
  const groups = [];
  const pools = {};
  for (const group of incomingGroups) {
    if (!Array.isArray(rawPools[group])) continue;
    groups.push(group);
    pools[group] = rawPools[group].map(cleanNameWeightEntry);
  }
  return {
    path: payload.path || '',
    groups,
    pools,
    summary: payload.summary || {}
  };
}

function selectedNamePool() {
  if (!state.nameWeights) return [];
  const group = state.nameWeightGroup || state.nameWeights.groups[0] || '';
  return state.nameWeights.pools[group] || [];
}

function ensureSelectedNameWeightGroup() {
  const groups = state.nameWeights?.groups || [];
  if (!groups.length) {
    state.nameWeightGroup = '';
    return '';
  }
  if (!state.nameWeightGroup || !groups.includes(state.nameWeightGroup)) {
    state.nameWeightGroup = groups[0];
  }
  return state.nameWeightGroup;
}

function renderNameWeightGroupOptions() {
  const groups = state.nameWeights?.groups || [];
  const selected = ensureSelectedNameWeightGroup();
  dom.nameWeightGroupSelect.innerHTML = groups
    .map((group) => `<option value="${escapeHtml(group)}">${escapeHtml(nameWeightGroupLabel(group))}</option>`)
    .join('');
  dom.nameWeightGroupSelect.value = selected;
}

function filteredNameWeightRows(pool) {
  const needle = state.nameWeightFilter.trim().toLowerCase();
  const totalWeight = pool.reduce((sum, entry) => sum + clampNameWeight(entry.weight), 0);
  return pool
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry, index }) => {
      if (!needle) return true;
      const percent = formatNamePercent(nameWeightPercent(entry, totalWeight));
      return `${entry.name} ${entry.weight} ${percent} ${index + 1}`.toLowerCase().includes(needle);
    });
}

function renderNameWeightEditor() {
  if (!dom.nameWeightSettingsBody) return;
  if (!state.nameWeights?.groups?.length) {
    dom.nameWeightGroupSelect.innerHTML = '';
    dom.nameWeightStats.textContent = '';
    dom.nameWeightStatus.textContent = 'Not loaded';
    dom.nameWeightSettingsBody.innerHTML = '<tr><td colspan="5">No name pools loaded.</td></tr>';
    return;
  }

  renderNameWeightGroupOptions();
  const group = ensureSelectedNameWeightGroup();
  const pool = selectedNamePool();
  const filtered = filteredNameWeightRows(pool);
  const visible = filtered.slice(0, NAME_WEIGHT_VISIBLE_LIMIT);
  const totalWeight = pool.reduce((sum, entry) => sum + clampNameWeight(entry.weight), 0);
  const moreText = filtered.length > visible.length ? ` | first ${formatNumber(visible.length)} shown` : '';
  dom.nameWeightStatus.textContent = state.nameWeightsDirty ? 'Unsaved' : 'Saved';
  dom.nameWeightStats.textContent = [
    nameWeightGroupLabel(group),
    `${formatNumber(filtered.length)} filtered`,
    `${formatNumber(pool.length)} total`,
    `100% pool`,
    `${formatNumber(totalWeight)} raw weight${moreText}`
  ].join(' | ');
  dom.nameWeightSettingsBody.innerHTML = visible.map(({ entry, index }) => `
    <tr>
      <th scope="row">${escapeHtml(index + 1)}</th>
      <td>
        <input
          class="name-weight-name"
          type="text"
          value="${escapeHtml(entry.name)}"
          data-name-weight-index="${escapeHtml(index)}"
          data-name-weight-field="name"
          aria-label="Name">
      </td>
      <td>
        <input
          class="name-weight-value"
          type="number"
          min="0"
          max="999999"
          step="1"
          value="${escapeHtml(entry.weight)}"
          data-name-weight-index="${escapeHtml(index)}"
          data-name-weight-field="weight"
          aria-label="Weight">
      </td>
      <td>
        <span class="name-weight-percent-display">${escapeHtml(formatNamePercent(nameWeightPercent(entry, totalWeight)))}%</span>
      </td>
      <td>
        <button class="delete-name-weight-button" type="button" data-delete-name-weight-index="${escapeHtml(index)}">Delete</button>
      </td>
    </tr>`).join('');
}

async function loadNameWeights() {
  if (!window.recruitingApi?.getNameWeights) {
    dom.nameWeightStatus.textContent = 'Unavailable';
    dom.nameWeightSettingsBody.innerHTML = '<tr><td colspan="5">Name weights API unavailable.</td></tr>';
    return false;
  }
  const result = await window.recruitingApi.getNameWeights();
  if (!result.ok) {
    dom.nameWeightStatus.textContent = 'Error';
    dom.nameWeightStats.textContent = result.error || '';
    dom.nameWeightSettingsBody.innerHTML = '<tr><td colspan="5">Could not load name weights.</td></tr>';
    setStatus(`Name weights unavailable: ${result.error}`);
    return false;
  }
  state.nameWeights = sanitizeNameWeightPayload(result);
  state.nameWeightsDirty = false;
  ensureSelectedNameWeightGroup();
  renderNameWeightEditor();
  return true;
}

async function saveNameWeights() {
  if (!window.recruitingApi?.saveNameWeights || !state.nameWeights) return;
  dom.saveNameWeightsButton.disabled = true;
  setStatus('Saving name weights...');
  try {
    const result = await window.recruitingApi.saveNameWeights(state.nameWeights);
    if (!result.ok) {
      setStatus(`Could not save name weights: ${result.error}`);
      dom.nameWeightStatus.textContent = 'Error';
      return;
    }
    state.nameWeights = sanitizeNameWeightPayload(result);
    state.nameWeightsDirty = false;
    ensureSelectedNameWeightGroup();
    renderNameWeightEditor();
    setStatus('Name weights saved.');
  } finally {
    dom.saveNameWeightsButton.disabled = false;
  }
}

function buildOvrWeightMaps(entries) {
  const byPosition = new Map();
  for (const entry of entries || []) {
    const position = String(entry?.position || '').trim();
    if (!position) continue;
    if (!byPosition.has(position)) byPosition.set(position, []);
    byPosition.get(position).push(entry);
  }
  state.ovrWeightEntries = entries || [];
  state.ovrWeightEntriesByPosition = byPosition;
  state.ovrRelevantFieldsByPosition = new Map();
  state.ovrWeightsLoaded = Boolean(state.ovrWeightEntries.length);
}

async function loadOvrWeights() {
  if (!window.recruitingApi?.getOvrWeights) {
    buildOvrWeightMaps([]);
    renderGemBustVarianceSettings();
    setStatus('OVR weights API unavailable; rating calculation will not recalculate OVR.');
    return false;
  }
  const result = await window.recruitingApi.getOvrWeights();
  if (!result.ok) {
    buildOvrWeightMaps([]);
    renderGemBustVarianceSettings();
    setStatus(`OVR weights unavailable: ${result.error}`);
    return false;
  }
  buildOvrWeightMaps(Array.isArray(result.archetypes) ? result.archetypes : []);
  renderGemBustVarianceSettings();
  if (state.dataLoaded) {
    renderTable();
    renderSelectedDetail();
  }
  return true;
}

function setNameWeightValue(index, field, value) {
  const pool = selectedNamePool();
  if (!pool[index]) return;
  if (field === 'name') {
    pool[index].name = String(value ?? '').replace(/\r?\n/g, ' ').trim();
  } else if (field === 'weight') {
    pool[index].weight = clampNameWeight(value);
  }
  state.nameWeightsDirty = true;
  clearPreviewState();
  renderNameWeightEditor();
  setStatus('Name weight changed. Click Calculate to generate changes.');
}

function addNameWeightRow() {
  const pool = selectedNamePool();
  if (!pool) return;
  pool.unshift({ name: 'New Name', weight: 1 });
  state.nameWeightFilter = '';
  dom.nameWeightSearchInput.value = '';
  state.nameWeightsDirty = true;
  clearPreviewState();
  renderNameWeightEditor();
  setStatus('Name row added. Click Calculate to generate changes.');
}

function deleteNameWeightRow(index) {
  const pool = selectedNamePool();
  if (!pool[index]) return;
  const deletedName = pool[index].name;
  pool.splice(index, 1);
  state.nameWeightsDirty = true;
  clearPreviewState();
  renderNameWeightEditor();
  setStatus(`Removed ${deletedName || 'name'} from name weights. Click Calculate to generate changes.`);
}

function setView(view) {
  state.view = view === 'averages' ? 'recruits' : view;
  view = state.view;
  dom.recruitsView.classList.toggle('active', view === 'recruits');
  dom.rawView.classList.toggle('active', view === 'raw');
  dom.settingsView.classList.toggle('active', view === 'settings');
  dom.recruitsViewButton.classList.toggle('active', view === 'recruits');
  dom.settingsViewButton.classList.toggle('active', view === 'settings');
  dom.recruitsViewButton.setAttribute('aria-pressed', String(view === 'recruits'));
  dom.settingsViewButton.setAttribute('aria-pressed', String(view === 'settings'));
  document.body.classList.toggle('settings-active', view === 'settings');
  document.body.classList.toggle('raw-active', view === 'raw');
  document.body.classList.toggle('recruits-active', view === 'recruits');
  renderRecruitingSpoilerGate();
  requestAnimationFrame(() => {
    renderVisibleRows();
    if (view === 'raw') {
      if (state.dataLoaded && state.rawLoadedKey !== state.rawTableKey && !state.rawLoading) {
        loadRawTable(state.rawTableKey);
      } else {
        renderRawVisibleRows();
      }
    }
    if (view === 'settings') {
      renderGlobalRatingVarianceSettings();
      renderDiamondInTheRoughSettings();
      renderBlueChipSettings();
      renderProjectPlayersSettings();
      renderGemBustVarianceSettings();
      renderStarCaliberStrengthSettings();
      renderSkinToneSettings();
      renderNameWeightEditor();
      renderHeightVarianceSettings();
      renderWeightVarianceSettings();
      if (!state.settingsPanel) state.settingsPanel = 'globalRating';
      setSettingsPanel(state.settingsPanel);
    }
  });
}

function setSettingsPanel(panelKey = '') {
  const previousPanel = state.settingsPanel;
  state.settingsPanel = panelKey;
  const settingsPage = dom.settingsView.querySelector('.settings-page');
  const currentScrollTop = settingsPage?.scrollTop ?? 0;
  let activePanel = null;
  dom.settingsView.querySelectorAll('[data-settings-panel]').forEach((panel) => {
    const active = panel.dataset.settingsPanel === panelKey;
    panel.hidden = !active;
    if (active) activePanel = panel;
  });
  dom.settingsView.querySelectorAll('[data-settings-open]').forEach((button) => {
    const active = button.dataset.settingsOpen === panelKey;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  renderSettingsInfoPanel(panelKey);
  if (settingsPage) settingsPage.scrollTop = previousPanel === panelKey ? currentScrollTop : 0;
  if (previousPanel !== panelKey) activePanel?.querySelector('.settings-table-wrap')?.scrollTo({ top: 0, left: 0 });
}

function setDetailView(view) {
  const nextView = ['profile', 'ratings', 'abilities'].includes(view) ? view : 'profile';
  state.detailView = nextView;
  dom.detailProfileButton.classList.toggle('active', nextView === 'profile');
  dom.detailRatingsButton.classList.toggle('active', nextView === 'ratings');
  dom.detailAbilitiesButton.classList.toggle('active', nextView === 'abilities');
  dom.detailProfileButton.setAttribute('aria-pressed', String(nextView === 'profile'));
  dom.detailRatingsButton.setAttribute('aria-pressed', String(nextView === 'ratings'));
  dom.detailAbilitiesButton.setAttribute('aria-pressed', String(nextView === 'abilities'));
  renderSelectedDetail();
}

function applyFilters() {
  renderTable({ resetScroll: true });
  renderSelectedDetail();
}

function reportColumn(column) {
  return {
    key: column.key,
    label: column.label,
    group: column.groupLabel || '',
    type: column.type || '',
    numeric: Boolean(column.numeric)
  };
}

function buildReportMetadata(data) {
  return {
    appName: 'Recruit Overhaul 27',
    sourceFile: data?.sourceFile || 'DYNASTY-DYNASTY',
    rowCount: state.rows.length,
    defaultSort: {
      recruits: `${state.sortKey} ${state.sortDir}`
    },
    filters: [
      { label: 'Search', keys: searchKeys },
      { label: 'Position', key: 'recruitPosition' },
      { label: 'Stars', key: 'stars' },
      { label: 'Class', key: 'class' },
      { label: 'Stage', key: 'stage' }
    ],
    sourceTables: reportSourceTables,
    recruitTableColumns: tableColumns.map(reportColumn),
    detailProfileFields: detailProfileReportFields,
    detailRatingGroups: DETAIL_RATING_GROUPS.map((group) => ({
      key: group.key,
      label: group.label,
      fields: group.fields.map((field) => ({ key: field, label: ratingLabel(field) }))
    })),
    exportedColumns: Object.entries(data?.columns || {}).map(([key, label]) => ({ key, label })),
    topSchoolSlots: Array.from({ length: 10 }, (_, index) => {
      const slot = index + 1;
      return {
        slot,
        fields: [
          `topSchool${slot}Team`,
          `topSchool${slot}TeamId`,
          `topSchool${slot}StadiumId`,
          `topSchool${slot}TeamGameId`,
          `topSchool${slot}Influence`,
          `topSchool${slot}LogoPath`,
          `topSchool${slot}ProspectTargetSchoolRow`,
          `topSchool${slot}ListSlot`,
          `topSchool${slot}TeamRow`,
          `topSchool${slot}TeamIndexField`,
          `topSchool${slot}TeamLabelSource`
        ]
      };
    })
  };
}

async function updateReport(data) {
  if (!window.recruitingApi?.writeReport) return null;
  try {
    return await window.recruitingApi.writeReport(buildReportMetadata(data));
  } catch (error) {
    console.error('Report update failed:', error);
    return { ok: false, error: error.message };
  }
}

async function loadData(payload) {
  const data = payload;
  if (!data) throw new Error('No dynasty data payload was provided.');
  state.dataLoaded = true;
  state.dataPayload = data;
  state.rows = data.rows || [];
  state.selectedRecruitRow = state.rows[0]?.recruitRow ?? null;
  clearPreviewState();
  renderRecruitingSpoilerGate();
  updateActionButtons();
  resetRawTableState('Raw source tables are available after a dynasty is loaded.');
  populateFilters();
  renderTable({ resetScroll: true });
  renderSelectedDetail();
  if (state.view === 'raw') await loadRawTable(state.rawTableKey);
  await updateReport(data);
  setStatus(`Loaded ${formatNumber(state.rows.length)} recruits.`);
}

async function refreshDynastyFolderFiles({ quiet = false } = {}) {
  if (!state.dynastyFolderPath) {
    renderDynastyFolderSelect();
    return false;
  }
  if (!window.recruitingApi?.listDynastyFolder) {
    renderDynastyFolderSelect('Folder API unavailable');
    if (!quiet) setStatus('Dynasty folder API unavailable.');
    return false;
  }
  if (!quiet) setStatus('Scanning dynasty folder...');
  const result = await window.recruitingApi.listDynastyFolder(state.dynastyFolderPath);
  if (!result.ok) {
    state.dynastyFolderFiles = [];
    renderDynastyFolderSelect('Folder unavailable');
    if (!quiet) setStatus(`Dynasty folder unavailable: ${result.error}`);
    return false;
  }
  state.dynastyFolderPath = result.folderPath || state.dynastyFolderPath;
  storeDynastyFolderPath(state.dynastyFolderPath);
  state.dynastyFolderFiles = Array.isArray(result.files) ? result.files : [];
  renderDynastyFolderSelect();
  if (!quiet) {
    setStatus(`${state.dynastyFolderFiles.length} dynasty file${state.dynastyFolderFiles.length === 1 ? '' : 's'} found.`);
  }
  return true;
}

async function chooseDynastyFolder() {
  if (!window.recruitingApi?.selectDynastyFolder) {
    setStatus('Dynasty folder picker unavailable.');
    return;
  }
  setStatus('Choose the folder where your dynasty saves live...');
  const result = await window.recruitingApi.selectDynastyFolder(state.dynastyFolderPath);
  if (result.canceled) {
    setStatus('Dynasty folder selection canceled.');
    return;
  }
  if (!result.ok) {
    setStatus(`Could not read dynasty folder: ${result.error}`);
    return;
  }
  state.dynastyFolderPath = result.folderPath || '';
  state.dynastyFolderFiles = Array.isArray(result.files) ? result.files : [];
  state.selectedDynastyPath = '';
  clearPreviewState({ render: true });
  storeDynastyFolderPath(state.dynastyFolderPath);
  renderDynastyFolderSelect();
  setStatus(`${state.dynastyFolderFiles.length} dynasty file${state.dynastyFolderFiles.length === 1 ? '' : 's'} found in saved folder.`);
}

async function loadDynastyFromPath(filePath, options = {}) {
  const selectedPath = String(filePath || '').trim();
  if (!selectedPath) return false;
  if (!window.recruitingApi?.loadDynastyFile) {
    setStatus('Dynasty file loader unavailable.');
    return false;
  }
  state.selectedDynastyPath = selectedPath;
  renderDynastyFolderSelect();
  const loadingMessage = options.loadingMessage || 'Loading Dynasty...';
  const renderingMessage = options.renderingMessage || 'Rendering recruits...';
  const progressLabel = options.progressLabel || 'Loading Dynasty';
  setFileLoading(true, loadingMessage, { progressLabel });
  setLoadProgress(2, { visible: true, label: progressLabel });
  try {
    const result = await window.recruitingApi.loadDynastyFile(selectedPath);
    if (!result.ok) {
      setLoadStatus(`Load failed: ${result.error || result.stderr || `exit ${result.code}`}`, 'error');
      setStatus(`File load failed: ${result.error || result.stderr || `exit ${result.code}`}`);
      return false;
    }
    setLoadStatus(renderingMessage, 'busy', { progressLabel });
    setLoadProgress(98, { visible: true, label: progressLabel });
    await loadData(result.data);
    setLoadStatus(`Loaded ${formatNumber(state.rows.length)} recruits.`, 'done', { progressLabel });
    setStatus(`Loaded ${formatNumber(state.rows.length)} recruits.`);
    return true;
  } catch (error) {
    setLoadStatus(`Load failed: ${error.message}`, 'error');
    setStatus(`File load failed: ${error.message}`);
    return false;
  } finally {
    setFileLoading(false);
  }
}

function initializeNoFileState() {
  state.dataLoaded = false;
  state.loading = false;
  state.loadMessage = 'No file loaded';
  state.loadProgressLabel = 'Loading Dynasty';
  state.dataPayload = null;
  state.rows = [];
  state.filtered = [];
  state.averageRows = [];
  state.selectedRecruitRow = null;
  clearPreviewState();
  renderRecruitingSpoilerGate();
  updateActionButtons();
  resetRawTableState('Select a dynasty file to inspect raw source tables.');
  populateFilters();
  renderTable({ resetScroll: true });
  renderSelectedDetail();
  renderDynastyFolderSelect();
  setLoadStatus('No file loaded');
  setStatus('No dynasty file loaded. Choose a dynasty folder to begin.');
}

function bindEvents() {
  populateRawTableSelect();
  renderHeaders();
  renderAverageHeaders();
  renderGlobalRatingVarianceSettings();
  renderDiamondInTheRoughSettings();
  renderBlueChipSettings();
  renderProjectPlayersSettings();
  renderHideGemsBustsSettings();
  renderGemBustVarianceSettings();
  renderStarCaliberStrengthSettings();
  renderHeightVarianceSettings();
  renderWeightVarianceSettings();
  renderSettingsConfigPanel();
  setSettingsPanel(state.settingsPanel);
  renderSettingModuleToggles();

  [
    dom.searchInput,
    dom.positionFilter,
    dom.starsFilter,
    dom.classFilter,
    dom.stageFilter
  ].forEach((control) => control.addEventListener('input', applyFilters));

  dom.tableWrap.addEventListener('scroll', renderVisibleRows, { passive: true });
  dom.tableWrap.addEventListener('keydown', handleRecruitTableKeydown);
  dom.rawTableWrap.addEventListener('scroll', () => renderRawVisibleRows(), { passive: true });

  dom.recruitsViewButton.addEventListener('click', () => setView('recruits'));
  dom.settingsViewButton.addEventListener('click', () => setView('settings'));
  dom.detailProfileButton.addEventListener('click', () => setDetailView('profile'));
  dom.detailRatingsButton.addEventListener('click', () => setDetailView('ratings'));
  dom.detailAbilitiesButton.addEventListener('click', () => setDetailView('abilities'));
  dom.previewButton.addEventListener('click', runPreview);
  dom.saveButton.addEventListener('click', saveCalculatedChanges);
  dom.calculateReviewButton.addEventListener('click', hideCalculateOverlay);
  dom.calculateSaveButton.addEventListener('click', saveCalculatedChanges);
  if (dom.showRecruitingSpoilersButton) {
    dom.showRecruitingSpoilersButton.addEventListener('click', () => {
      setRecruitingSpoilersVisible(true);
    });
  }
  if (dom.hideRecruitingSpoilersButton) {
    dom.hideRecruitingSpoilersButton.addEventListener('click', () => {
      setRecruitingSpoilersVisible(false);
    });
  }
  dom.selectFolderButton.addEventListener('click', chooseDynastyFolder);
  dom.refreshFolderButton.addEventListener('click', () => refreshDynastyFolderFiles());
  dom.dynastyFileSelect.addEventListener('change', () => {
    loadDynastyFromPath(dom.dynastyFileSelect.value);
  });

  dom.settingsView.addEventListener('click', (event) => {
    const openButton = event.target.closest('[data-settings-open]');
    if (openButton) {
      setSettingsPanel(openButton.dataset.settingsOpen);
      return;
    }
    if (event.target.closest('[data-settings-close]')) {
      setSettingsPanel('');
    }
  });

  document.querySelectorAll('[data-setting-module-toggle]').forEach((input) => {
    input.addEventListener('change', () => {
      setSettingModuleEnabled(input.dataset.settingModuleToggle, input.checked);
    });
  });

  if (dom.settingsConfigNameInput) {
    dom.settingsConfigNameInput.addEventListener('change', syncSettingsConfigNameFromInput);
    dom.settingsConfigNameInput.addEventListener('blur', syncSettingsConfigNameFromInput);
  }
  if (dom.exportSettingsConfigButton) dom.exportSettingsConfigButton.addEventListener('click', exportSettingsConfig);
  if (dom.importSettingsConfigButton) dom.importSettingsConfigButton.addEventListener('click', importSettingsConfig);

  dom.globalRatingVarianceBody.addEventListener('input', (event) => {
    const input = event.target.closest('[data-global-rating-field][data-global-rating-control="slider"]');
    if (!input) return;
    setGlobalRatingVariance(input.dataset.globalRatingField, input.dataset.globalRatingBound, input.value);
  });

  dom.resetGlobalRatingVarianceButton.addEventListener('click', resetGlobalRatingVariance);
  dom.diamondInTheRoughPercentSlider.addEventListener('input', () => setDiamondInTheRoughPercent(dom.diamondInTheRoughPercentSlider.value));
  dom.resetDiamondInTheRoughButton.addEventListener('click', resetDiamondInTheRoughSettings);
  dom.blueChipPercentSlider.addEventListener('input', () => setBlueChipPercent(dom.blueChipPercentSlider.value));
  dom.resetBlueChipButton.addEventListener('click', resetBlueChipSettings);
  dom.projectPlayersToggle.addEventListener('change', () => setProjectPlayersEnabled(dom.projectPlayersToggle.checked));
  dom.resetProjectPlayersButton.addEventListener('click', resetProjectPlayersSettings);
  dom.hideGemsBustsToggle.addEventListener('change', () => setHideGemsBustsEnabled(dom.hideGemsBustsToggle.checked));
  dom.resetHideGemsBustsButton.addEventListener('click', resetHideGemsBustsSettings);

  dom.gemBustVarianceRows.addEventListener('input', (event) => {
    const input = event.target.closest('[data-gem-bust-star-caliber][data-gem-bust-control="slider"]');
    if (!input) return;
    setGemBustVariance(input.dataset.gemBustStarCaliber, input.dataset.gemBustBound, input.value);
  });

  dom.resetGemBustVarianceButton.addEventListener('click', resetGemBustVariance);

  dom.starCaliberStrengthRows.addEventListener('input', (event) => {
    const input = event.target.closest('[data-star-caliber][data-star-control="slider"]');
    if (!input) return;
    setStarCaliberStrength(input.dataset.starCaliber, strengthDeltaFromSlider(input.value));
  });

  dom.starCaliberStrengthRows.addEventListener('change', (event) => {
    const input = event.target.closest('[data-star-caliber][data-star-control="number"]');
    if (!input) return;
    setStarCaliberStrength(input.dataset.starCaliber, input.value);
  });

  dom.resetStarCaliberStrengthButton.addEventListener('click', resetStarCaliberStrength);

  dom.heightVarianceBody.addEventListener('input', (event) => {
    const input = event.target.closest('input[type="range"][data-position][data-variance-kind="height"]');
    if (!input) return;
    setPositionVariance('height', input.dataset.position, input.dataset.varianceBound, input.value);
  });

  dom.weightVarianceBody.addEventListener('input', (event) => {
    const input = event.target.closest('input[type="range"][data-position][data-variance-kind="weight"]');
    if (!input) return;
    setPositionVariance('weight', input.dataset.position, input.dataset.varianceBound, input.value);
  });

  dom.resetHeightVarianceButton.addEventListener('click', resetHeightVariance);
  dom.resetWeightVarianceButton.addEventListener('click', resetWeightVariance);
  dom.resetNameSuffixesButton.addEventListener('click', () => {
    resetSettingModuleToDefault('nameSuffixes');
    autoSaveCurrentSettingsConfig();
    clearPreviewState();
    renderSettingModuleToggles();
    renderTable();
    renderSelectedDetail();
    setStatus('Name suffix settings reset. Click Calculate to generate changes.');
  });
  if (dom.saveAppDefaultsButton) dom.saveAppDefaultsButton.addEventListener('click', saveCurrentSettingsAsDefaults);

  dom.rawTableSelect.addEventListener('change', () => {
    loadRawTable(dom.rawTableSelect.value);
  });

  dom.rawSearchInput.addEventListener('input', () => {
    updateRawFilteredRows();
    renderRawVisibleRows({ resetScroll: true });
  });

  dom.rawClearButton.addEventListener('click', () => {
    dom.rawSearchInput.value = '';
    updateRawFilteredRows();
    renderRawVisibleRows({ resetScroll: true });
  });

  dom.clearButton.addEventListener('click', () => {
    dom.searchInput.value = '';
    dom.positionFilter.value = '';
    dom.starsFilter.value = '';
    dom.classFilter.value = '';
    dom.stageFilter.value = '';
    state.sortKey = 'nationalRank';
    state.sortDir = 'asc';
    renderHeaders();
    applyFilters();
  });

  dom.tbody.addEventListener('click', (event) => {
    const tr = event.target.closest('tr[data-recruit-row]');
    if (!tr) return;
    selectRecruitByRow(Number(tr.dataset.recruitRow), { focusTable: true });
  });

  dom.skinToneSettingsBody.addEventListener('change', (event) => {
    const input = event.target.closest('input[type="number"][data-position][data-tone]');
    if (!input) return;
    setSkinToneValue(input.dataset.position, input.dataset.tone, input.value);
  });

  dom.resetSkinToneButton.addEventListener('click', resetSkinToneSettings);
  dom.saveSkinToneButton.addEventListener('click', saveSkinToneSettings);

  dom.nameWeightGroupSelect.addEventListener('change', () => {
    state.nameWeightGroup = dom.nameWeightGroupSelect.value;
    renderNameWeightEditor();
  });

  dom.nameWeightSearchInput.addEventListener('input', () => {
    state.nameWeightFilter = dom.nameWeightSearchInput.value;
    renderNameWeightEditor();
  });

  dom.nameWeightSettingsBody.addEventListener('change', (event) => {
    const input = event.target.closest('[data-name-weight-index][data-name-weight-field]');
    if (!input) return;
    setNameWeightValue(Number(input.dataset.nameWeightIndex), input.dataset.nameWeightField, input.value);
  });

  dom.nameWeightSettingsBody.addEventListener('click', (event) => {
    const button = event.target.closest('[data-delete-name-weight-index]');
    if (!button) return;
    deleteNameWeightRow(Number(button.dataset.deleteNameWeightIndex));
  });

  dom.addNameWeightButton.addEventListener('click', addNameWeightRow);
  dom.reloadNameWeightsButton.addEventListener('click', async () => {
    if (await loadNameWeights()) {
      clearPreviewState({ render: true });
      setStatus('Name weights reloaded. Click Calculate to generate changes.');
    }
  });
  dom.saveNameWeightsButton.addEventListener('click', saveNameWeights);

}

bindEvents();
initializeNoFileState();
if (state.dynastyFolderPath) {
  refreshDynastyFolderFiles({ quiet: true }).catch((error) => {
    renderDynastyFolderSelect('Folder unavailable');
    setStatus(`Dynasty folder scan failed: ${error.message}`);
  });
}
if (window.recruitingApi?.onLoadProgress) {
  window.recruitingApi.onLoadProgress((update) => {
    if (!state.loading) return;
    const activeLabel = state.loadProgressLabel || 'Loading Dynasty';
    const progress = normalizeLoadProgress(update, `${activeLabel}...`);
    const progressMessage = activeLabel !== 'Loading Dynasty' && /^Loading dynasty/i.test(progress.message)
      ? `${activeLabel}...`
      : progress.message;
    setLoadStatus(progressMessage, 'busy', { progressLabel: activeLabel });
    setLoadProgress(progress.percent, { visible: true, label: activeLabel });
    setStatus(progressMessage);
    updateFilteredRows();
  });
}
loadSkinToneSettings().catch((error) => {
  state.skinToneSettings = defaultSkinToneSettings();
  renderSkinToneSettings();
  autoSaveCurrentSettingsConfig({ updateStatus: false });
  setStatus(`Skin tone settings failed: ${error.message}`);
});
loadNameWeights().catch((error) => {
  dom.nameWeightStatus.textContent = 'Error';
  dom.nameWeightSettingsBody.innerHTML = '<tr><td colspan="5">Could not load name weights.</td></tr>';
  setStatus(`Name weights failed: ${error.message}`);
});
loadOvrWeights().catch((error) => {
  buildOvrWeightMaps([]);
  renderGemBustVarianceSettings();
  setStatus(`OVR weights failed: ${error.message}`);
});
