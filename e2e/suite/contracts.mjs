// Requirement-driven opaque-box contract definitions from ORIGINAL_REQUEST.md & PROJECT.md §§1–4.
// STRICT RULE: ZERO imports from ../../src/**.

export const FEATURE_IDS = [
  'F1', 'F2', 'F3', 'F4', 'F5',
  'F6', 'F7', 'F8', 'F9', 'F10',
  'F11', 'F12', 'F13', 'F14', 'F15',
  'F16', 'F17',
];

export const FEATURE_TITLES = {
  F1: '加载动画与「剑清酱工作室」Logo 开屏动画',
  F2: '6 名守夜角色与初始武器自选（本命亲和加成）',
  F3: '6 兵刃 + 6 法器槽位扩容与百器扩充',
  F4: '6+6 怪潮密度、巡更头目与数值曲线重调',
  F5: '每角色多套明显差异皮肤（6 角色 × 3 套 = 18 套）',
  F6: '5 套明显差异攻击特效主题',
  F7: '国风暗夜灯火 UI 全面精修与动态演武台',
  F8: '铜钱鬼市商铺（购买皮肤与攻击特效）',
  F9: '守夜功绩成就系统（奖励解锁新武器或角色皮肤）',
  F10: '升级/开箱/神龛选签时暂停查看已有装备面板',
  F11: 'TapTap 云存档 v3 升级与跨端无损合并',
  F12: 'TapTap「五更守夜总榜」真实对接（c5mzumajes9houq0ra）',
  F13: 'TapTap 好友系统、组队分享拉起与隐私政策更新',
  F14: '2–4 人「同守五更」真实多人联机（房间/多通道同步/倒地救援/MVP）',
  F15: '分模块中文 Git 合入 main、实机预览图、零缺字打包与 TapTap 测试包二维码',
  F16: 'v4 M1 体验基础（7 分钟节奏、震动、情境旁白与更房渐进开放、Boss 演出配乐、结算页亮点与一键再守）',
  F17: 'v4 M2 局内玩法（4 种新邪祟、每更随机异事、20 对兵刃法器开光、留签弃签强化）',
};

export const MAX_WEAPONS = 6;
export const MAX_RELICS = 6;

export const CLASSIC_HERO_IDS = ['zhou', 'mian', 'daotong'];
export const V3_NEW_HERO_IDS = ['yinyang', 'tiejiang', 'nuoxi'];
export const HERO_IDS = [...CLASSIC_HERO_IDS, ...V3_NEW_HERO_IDS];

export const HERO_SIGNATURE_WEAPONS = {
  zhou: 'gong',
  mian: 'paperman',
  daotong: 'talisman',
  yinyang: 'compass',
  tiejiang: 'suohun_chain',
  nuoxi: 'nuo_drum',
};

export const HERO_AFFINITY = {
  dmgMul: 1.25,
  cdMul: 0.90,
  areaBonus: 0.15,
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
export const V2_WEAPON_IDS = NEW_WEAPON_IDS;
export const V3_NEW_WEAPON_IDS = [
  'taomujian', 'suohun_chain', 'zhinian_kite', 'nuo_drum',
];
export const V3_WEAPON_IDS = V3_NEW_WEAPON_IDS;
export const V4_NEW_WEAPON_IDS = [
  'mourning_staff', 'sky_lantern', 'carpenter_line', 'luopan_slip',
];
export const ACHIEVEMENT_WEAPON_IDS = ['taomujian', 'zhinian_kite'];
export const DEFAULT_UNLOCKED_WEAPON_IDS = [
  'gong', 'lantern', 'talisman', 'brush', 'suohun_chain', 'nuo_drum',
];
export const ALL_WEAPON_IDS = [
  ...CLASSIC_WEAPON_IDS,
  ...NEW_WEAPON_IDS,
  ...V3_NEW_WEAPON_IDS,
  ...V4_NEW_WEAPON_IDS,
];

export const V3_BASE_WEAPON_NAMES = {
  taomujian: '桃木飞剑',
  suohun_chain: '无常锁魂链',
  zhinian_kite: '纸鸢火鸦',
  nuo_drum: '傩神战鼓',
};

export const V4_BASE_WEAPON_NAMES = {
  mourning_staff: '引魂丧杆',
  sky_lantern: '孔明灯',
  carpenter_line: '墨斗线',
  luopan_slip: '风水飞签',
};

export const CLASSIC_RELIC_IDS = [
  'clapper', 'censer', 'cinnabar', 'inkstone',
  'bagua', 'scissors', 'tinder', 'redstring',
];
export const NEW_RELIC_IDS = [
  'strawshoes', 'glutinous', 'fivecoins', 'soulwick',
];
export const V2_RELIC_IDS = NEW_RELIC_IDS;
export const V3_NEW_RELIC_IDS = [
  'leijimu', 'yinpai', 'huoyao_pouch', 'wuse_mask',
];
export const V3_RELIC_IDS = V3_NEW_RELIC_IDS;
export const V4_NEW_RELIC_IDS = [
  'altar_mirror', 'lamp_oil', 'folk_rice', 'cinnabar_pen',
];
export const ALL_RELIC_IDS = [
  ...CLASSIC_RELIC_IDS,
  ...NEW_RELIC_IDS,
  ...V3_NEW_RELIC_IDS,
  ...V4_NEW_RELIC_IDS,
];

export const V3_RELIC_NAMES = {
  leijimu: '雷击枣木',
  yinpai: '勾魂阴牌',
  huoyao_pouch: '硫磺火药囊',
  wuse_mask: '五色傩面',
};

export const V4_RELIC_NAMES = {
  altar_mirror: '镇坛铜镜',
  lamp_oil: '长明灯油',
  folk_rice: '百家米',
  cinnabar_pen: '朱砂笔',
};

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
  taomujian: 'leijimu',
  suohun_chain: 'yinpai',
  zhinian_kite: 'huoyao_pouch',
  nuo_drum: 'wuse_mask',
  mourning_staff: 'altar_mirror',
  sky_lantern: 'lamp_oil',
  carpenter_line: 'folk_rice',
  luopan_slip: 'cinnabar_pen',
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
export const V4_NEW_REGULAR_ENEMY_IDS = [
  'archer_ghost', 'firecracker_boy', 'twin_paper', 'shaman',
];
export const REGULAR_ENEMY_IDS = [
  ...CLASSIC_REGULAR_ENEMY_IDS,
  ...NEW_REGULAR_ENEMY_IDS,
  ...V4_NEW_REGULAR_ENEMY_IDS,
];
export const BOSS_ENEMY_IDS = ['horse', 'umbrella', 'youshen'];
export const ALL_ENEMY_IDS = [...REGULAR_ENEMY_IDS, ...BOSS_ENEMY_IDS];

export const ELITE_AFFIX_IDS = [
  'paper_armor', 'swift_step', 'soul_fire', 'mirror_twin', 'treasure_bearer',
];
export const SHRINE_KINDS = ['altar', 'trial', 'peddler'];

export const CODEX_TAB_COUNTS = [
  ALL_WEAPON_IDS.length,
  ALL_WEAPON_IDS.length,
  ALL_RELIC_IDS.length,
  ALL_ENEMY_IDS.length,
  HERO_IDS.length,
];
export const CODEX_TOTAL = CODEX_TAB_COUNTS.reduce((a, b) => a + b, 0);

export const ATTACK_VFX_IDS = [
  'default',
  'jade_ghostfire',
  'violet_thunder',
  'gilded_imperial',
  'frost_moon',
];

export const ATTACK_VFX_NAMES = {
  default: '古墨朱砂',
  jade_ghostfire: '青冥幽火',
  violet_thunder: '紫电天罡',
  gilded_imperial: '鎏金神诏',
  frost_moon: '玄霜寒月',
};

export const LEGACY_ACHIEVEMENT_IDS = [
  'firstClear',
  'kills800',
  'noBun480',
  'endless10',
  'hit10k',
  'hit100m',
  'night10',
];

export const PRIMARY_LEADERBOARD_ID = 'c5mzumajes9houq0ra';
export const SAVE_VERSION = 4;

export const COOP_SPEC = {
  maxPlayers: 4,
  reviveRadius: 48,
  reviveSeconds: 2.4,
  hpScalePerExtra: 0.55,
  spawnScalePerExtra: 0.30,
};

export const BASELINE_MAIN_COMMIT = '16d16da03c9a6f57702c4ccabb69ea66238a549a';

export const ALLOWED_WOODBLOCK_HEX = [
  '#efe6d2',
  '#e0d2b4',
  '#1c1a17',
  '#c23b26',
  '#8e2a1b',
  '#f0be62',
];

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
