// Requirement-driven opaque-box contract definitions from PROJECT.md §1–§4.
// STRICT RULE: ZERO imports from ../../src/**.

export const FEATURE_IDS = [
  'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7',
  'F8', 'F9', 'F10', 'F11', 'F12', 'F13',
];

export const FEATURE_TITLES = {
  F1: 'Anti-Sticking Combat Physics & Multi-Hit Protection',
  F2: 'Fair Monster/Boss Speed Curves & Darkness-Penetrating Telegraphs',
  F3: 'Decoupled Multi-Path 开光 & Interactive Chest Awakening',
  F4: 'Overhauled Post-开光 Weapon Evolutions & Power Transformation',
  F5: 'Expanded Folk Arsenal (+4 Weapons w/ Evolutions & +4 Relics)',
  F6: 'Four Folk School Synergies (镇魂·道法·纸扎·阳炎 羁绊)',
  F7: 'Night-Watch Blessings & Cursed Talismans (守夜命签)',
  F8: 'Roguelike Level-Up Agency (弃签 Banish, 留签 Lock & Weights)',
  F9: 'Interactive World Shrines, Trial Steles & Ghost-Market Peddler',
  F10: 'New Tactical Enemies (+3), Elite Affixes, Mini-Warders & Hero Ultimates',
  F11: 'Hit-Feel, Awakened Ceremony/Aura, HUD Loadout, Watch Atmosphere & SFX',
  F12: 'Expanded Codex (百物谱), Save Migration & Zero-Tofu Font Pipeline',
  F13: 'Clean H5 Zip Packaging & TapTap Test Build + Compliance Audit',
};

export const SCHOOL_TAGS = ['zhenhun', 'daofa', 'zhizha', 'yangyan'];
export const SCHOOL_LABELS = {
  zhenhun: '镇魂',
  daofa: '道法',
  zhizha: '纸扎',
  yangyan: '阳炎',
};

export const CLASSIC_WEAPON_IDS = [
  'gong', 'lantern', 'talisman', 'brush',
  'coinsword', 'paperman', 'firecracker', 'bell',
];
export const NEW_WEAPON_IDS = [
  'compass', 'soulbanner', 'bronze_mirror', 'paperhorse',
];
export const ALL_WEAPON_IDS = [...CLASSIC_WEAPON_IDS, ...NEW_WEAPON_IDS];

export const WEAPON_PAIRS = {
  gong: 'clapper',
  lantern: 'censer',
  talisman: 'cinnabar',
  brush: 'inkstone',
  coinsword: 'bagua',
  paperman: 'scissors',
  firecracker: 'tinder',
  bell: 'redstring',
  compass: 'soulwick',
  soulbanner: 'glutinous',
  bronze_mirror: 'fivecoins',
  paperhorse: 'strawshoes',
};

export const WEAPON_EVO_NAMES = {
  gong: '五更鸣锣',
  lantern: '长明灯',
  talisman: '天师符阵',
  brush: '泼墨山河',
  coinsword: '七星剑阵',
  paperman: '纸扎仪仗',
  firecracker: '满堂红',
  bell: '千铃引魂',
  compass: '天星定穴盘',
  soulbanner: '无常勾魂幡',
  bronze_mirror: '乾坤赤阳镜',
  paperhorse: '百鬼夜行图',
};

export const WEAPON_TAGS = {
  gong: ['zhenhun'],
  bell: ['zhenhun'],
  soulbanner: ['zhenhun'],
  talisman: ['daofa'],
  coinsword: ['daofa'],
  compass: ['daofa'],
  bronze_mirror: ['daofa', 'yangyan'],
  paperman: ['zhizha'],
  brush: ['zhizha'],
  paperhorse: ['zhizha'],
  lantern: ['yangyan'],
  firecracker: ['yangyan'],
};

export const CLASSIC_RELIC_IDS = [
  'clapper', 'censer', 'cinnabar', 'inkstone',
  'bagua', 'scissors', 'tinder', 'redstring',
];
export const NEW_RELIC_IDS = [
  'strawshoes', 'glutinous', 'fivecoins', 'soulwick',
];
export const ALL_RELIC_IDS = [...CLASSIC_RELIC_IDS, ...NEW_RELIC_IDS];

export const RELIC_TAGS = {
  clapper: ['zhenhun'],
  redstring: ['zhenhun'],
  strawshoes: ['zhenhun'],
  glutinous: ['zhenhun'],
  cinnabar: ['daofa'],
  bagua: ['daofa'],
  fivecoins: ['daofa', 'yangyan'],
  inkstone: ['zhizha'],
  scissors: ['zhizha'],
  soulwick: ['zhizha', 'yangyan'],
  censer: ['yangyan'],
  tinder: ['yangyan'],
};

export const CLASSIC_REGULAR_ENEMY_IDS = [
  'paperkid', 'shade', 'lanternghost', 'weasel', 'sedan', 'drowned',
];
export const NEW_REGULAR_ENEMY_IDS = [
  'suona', 'paperbride', 'cinder',
];
export const REGULAR_ENEMY_IDS = [
  ...CLASSIC_REGULAR_ENEMY_IDS,
  ...NEW_REGULAR_ENEMY_IDS,
];
export const BOSS_ENEMY_IDS = ['horse', 'umbrella', 'youshen'];
export const ALL_ENEMY_IDS = [...REGULAR_ENEMY_IDS, ...BOSS_ENEMY_IDS];

export const ELITE_AFFIX_IDS = [
  'paper_armor', 'swift_step', 'soul_fire', 'mirror_twin', 'treasure_bearer',
];
export const SHRINE_KINDS = ['altar', 'trial', 'peddler'];
export const HERO_IDS = ['zhou', 'mian', 'daotong'];

export const BASELINE_SFX_NAMES = [
  'gong', 'gongSmall', 'woodblock', 'paper', 'hit', 'crit', 'pickup', 'coin',
  'levelup', 'boss', 'dawn', 'hurt', 'evolve', 'click', 'watch',
];

export const TAPTAP = {
  devId: '543535',
  appId: '1081538',
  orientation: '1',
  protectedFilingId: 26847,
  protectedFilingVersionId: 529750,
};
