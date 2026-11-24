// 文案：打更人口吻，短、有味道。数值与词条从 sim 单一真源读取，确保 100% 数值一致。
import * as B from '../sim/balance.js';
import { describeUpgrade, describeEvolution } from '../sim/levelup.js';
import { relicEffect } from '../sim/relics.js';
import { BLESSINGS } from '../sim/blessings.js';
import { SYNERGIES } from '../sim/synergies.js';
import { cnNum } from './dom.js';

export const GAME_NAME = '五更天';

export const HERO_COPY = {
  zhou: {
    name: '打更人·老周',
    short: '老周',
    flavor: '敲了三十年更，锣一响，鬼也绕道。',
    trait: '大招攒气 +25%',
    weapon: 'gong',
    ultName: '五更镇魂锣',
    ultDesc: '三叠扩域震波净除敌弹，眩晕群祟并附加易伤',
    unlock: '默认',
  },
  mian: {
    name: '纸扎匠·阿绵',
    short: '阿绵',
    flavor: '纸人纸马，扎得活灵活现。',
    trait: '召唤物伤害 +20%，最大生命 −10%',
    weapon: 'paperman',
    ultName: '百鬼纸马阵',
    ultDesc: '八向纸马铁骑踏弹冲阵，并令纸兵攻移狂热',
    unlock: '单局打败 800 只敌人',
  },
  daotong: {
    name: '小道童',
    short: '小道童',
    flavor: '师父云游未归，替他守这一夜。',
    trait: '暴击率 +10%',
    weapon: 'talisman',
    ultName: '九天玄雷敕',
    ultDesc: '镇坛震波净弹，连劈九道索敌天雷轰击群祟',
    unlock: '一个包子不吃，守到五更（8:00）',
  },
  yinyang: {
    name: '阴阳先生·沈观星',
    short: '沈观星',
    flavor: '铁口断阴阳，罗盘定乾坤，星移鬼神惊。',
    trait: '攻击范围 +15%，持续与弹速 +15%',
    weapon: 'compass',
    ultName: '奇门遁甲大阵',
    ultDesc: '布下奇门八卦大阵聚拢群祟，四门星落轰击并附加破绽易伤',
    unlock: '单局敕封开光 2 把神兵',
  },
  tiejiang: {
    name: '镇魂铁匠·石敢当',
    short: '石敢当',
    flavor: '炉火炼百煞，重锤落砧，邪祟骨碎魂消。',
    trait: '护甲 +2，伤害 +12%',
    weapon: 'suohun_chain',
    ultName: '十方熔金镇狱锤',
    ultDesc: '重锤碎甲震退四方并获金身护体，十方熔金连爆灼烧邪祟',
    unlock: '累计打败 2500 只敌人',
  },
  nuoxi: {
    name: '傩戏传人·柳青衣',
    short: '柳青衣',
    flavor: '戴面即成神，鼓点一急，百鬼皆退避。',
    trait: '移速 +12%，冷却缩减 +10%',
    weapon: 'nuo_drum',
    ultName: '大傩逐疫百相舞',
    ultDesc: '起舞连擂四重逐疫傩鼓随身净弹，五秒内移速与攻速大幅提升',
    unlock: '单局激活任意流派 6 件羁绊',
  },
};

function own(obj, k) {
  return Boolean(obj && typeof k === 'string' && Object.hasOwn(obj, k));
}

export function heroInfo(id) {
  const safeId = own(HERO_COPY, id) ? id : 'zhou';
  const c = HERO_COPY[safeId];
  const b = own(B.HEROES, id) ? B.HEROES[id] : B.HEROES?.[safeId];
  const u = own(B.ULT, id) ? B.ULT[id] : B.ULT?.[safeId];
  return {
    id: safeId,
    name: b?.name || c.name,
    short: b?.short || c.short,
    trait: b?.trait || c.trait,
    unlock: b?.unlock?.desc || c.unlock,
    weapon: b?.startWeapon || c.weapon,
    ultName: u?.name || c.ultName,
    ultDesc: c.ultDesc,
    flavor: c.flavor,
  };
}

export const SCHOOL_TAG_IDS = B.SCHOOL_TAG_IDS || ['zhenhun', 'daofa', 'zhizha', 'yangyan'];
export const SCHOOL_NAMES = B.SCHOOL_NAMES || {
  zhenhun: '镇魂',
  daofa: '道法',
  zhizha: '纸扎',
  yangyan: '阳炎',
};
export const SCHOOL_TAGS = B.SCHOOL_TAGS || {};
export { BLESSINGS, SYNERGIES, describeEvolution };

export function schoolName(tag) {
  if (own(SCHOOL_NAMES, tag)) return SCHOOL_NAMES[tag];
  return typeof tag === 'string' ? tag : '';
}

export function weaponTags(weaponId) {
  return own(B.WEAPONS, weaponId) && Array.isArray(B.WEAPONS[weaponId].tags) ? [...B.WEAPONS[weaponId].tags] : [];
}

export function relicTags(relicId) {
  return own(B.RELICS, relicId) && Array.isArray(B.RELICS[relicId].tags) ? [...B.RELICS[relicId].tags] : [];
}

export function blessingInfo(id) {
  if (own(BLESSINGS, id)) return BLESSINGS[id];
  const s = typeof id === 'string' ? id : '';
  return { id: s, name: s, tier: 'auspicious', tags: [], maxStacks: 1, desc: '' };
}

const WEAPON_FALLBACK = {
  gong: ['更锣', '五更鸣锣'],
  lantern: ['灯笼', '长明灯'],
  talisman: ['符纸', '天师符阵'],
  brush: ['墨笔', '泼墨山河'],
  coinsword: ['铜钱剑', '七星剑阵'],
  paperman: ['纸人', '纸扎仪仗'],
  firecracker: ['爆竹', '满堂红'],
  bell: ['铜铃', '千铃引魂'],
  compass: ['罗盘', '天星定穴盘'],
  soulbanner: ['招魂幡', '无常勾魂幡'],
  bronze_mirror: ['照妖铜镜', '乾坤赤阳镜'],
  paperhorse: ['纸马镖', '百鬼夜行图'],
  taomujian: ['桃木飞剑', '天罡雷木剑阵'],
  suohun_chain: ['无常锁魂链', '黑白无常夺魄索'],
  zhinian_kite: ['纸鸢火鸦', '金乌焚天火鸦阵'],
  nuo_drum: ['傩神战鼓', '太古百相傩坛'],
};

const RELIC_FALLBACK = {
  clapper: '梆子',
  censer: '香炉',
  cinnabar: '朱砂',
  inkstone: '砚台',
  bagua: '八卦镜',
  scissors: '剪刀',
  tinder: '火折子',
  redstring: '红绳',
  strawshoes: '草鞋',
  glutinous: '糯米',
  fivecoins: '五帝钱',
  soulwick: '引魂灯芯',
  leijimu: '雷击枣木',
  yinpai: '勾魂阴牌',
  huoyao_pouch: '硫磺火药囊',
  wuse_mask: '五色傩面',
};

const PAIRS = {
  clapper: 'gong',
  censer: 'lantern',
  cinnabar: 'talisman',
  inkstone: 'brush',
  bagua: 'coinsword',
  scissors: 'paperman',
  tinder: 'firecracker',
  redstring: 'bell',
  strawshoes: 'paperhorse',
  glutinous: 'soulbanner',
  fivecoins: 'bronze_mirror',
  soulwick: 'compass',
  leijimu: 'taomujian',
  yinpai: 'suohun_chain',
  huoyao_pouch: 'zhinian_kite',
  wuse_mask: 'nuo_drum',
};

export const WEAPON_INTRO = {
  gong: '以身为心，一锣震退四邻群祟',
  lantern: '灯笼绕身旋转，近者灼烧自焚',
  talisman: '符纸索敌飞射，精准镇压邪祟',
  brush: '朝前挥毫一扫，劈出扇形墨锋',
  coinsword: '铜钱剑破空掷出，穿行往返',
  paperman: '扎出纸人护卫，主动冲阵撕咬',
  firecracker: '往鬼堆里抛投爆竹，轰炸一片',
  bell: '铜铃清响，音波在邪祟间连环弹跳',
  compass: '鬼群深处布下定穴磁阵，牵引聚怪并引爆地脉',
  soulbanner: '挥动招魂大幡重扫前方，破甲易伤并凝护体魂障',
  bronze_mirror: '射出持续横扫的赤阳神光，焚毁敌弹并灼烧叠伤',
  paperhorse: '唤出纸马铁骑从后方奔袭贯穿全屏，撞退沿途群祟',
  taomujian: '御使桃木飞剑自动索敌穿刺，灵动贯穿群祟',
  suohun_chain: '甩出无常铁链破甲定身，将前方邪祟强力拽聚',
  zhinian_kite: '放飞纸鸢火鸦俯冲鬼群，轰然爆裂灼烧一片',
  nuo_drum: '立起傩神战鼓连擂逐疫音波，减速震退四方群祟',
};

export const EVOLVE_INTRO = {
  gong: B.WEAPONS?.gong?.evoDesc || '三叠震魂波聚怪易伤，末响震碎敌弹并重创定身',
  lantern: B.WEAPONS?.lantern?.evoDesc || '双层火莲疾速灼烧并刻印阳炎，亡魂爆裂、夜主六叠爆燃、照亮扩域',
  talisman: B.WEAPONS?.talisman?.evoDesc || '齐射增符穿透连锁，首中布下八卦天雷阵四落神雷',
  brush: B.WEAPONS?.brush?.evoDesc || '周天泼墨横扫全屏，破空墨浪贯穿群祟并铺开镇邪墨河',
  coinsword: B.WEAPONS?.coinsword?.evoDesc || '北斗七剑索敌往返穿刺，每七剑引发星芒裂阵爆斩',
  paperman: B.WEAPONS?.paperman?.evoDesc || '内卫纸甲拦弹护主，外阵红衣纸骑疾驰穿阵冲杀',
  firecracker: B.WEAPONS?.firecracker?.evoDesc || '多枚红炮齐投，落地绽开六瓣莲花连爆并留灼热余烬场',
  bell: B.WEAPONS?.bell?.evoDesc || '铃音三十二重裂变清群，孤立夜主承受四叠递增摄魂回响',
  compass: B.WEAPONS?.compass?.evoDesc || '定穴磁阵强力牵引群祟并附破绽，收阵连爆两重天星余震',
  soulbanner: B.WEAPONS?.soulbanner?.evoDesc || '巨幡往返横扫破除纸甲伞盾，残血斩杀并凝聚护体魂障抵挡伤害',
  bronze_mirror: B.WEAPONS?.bronze_mirror?.evoDesc || '赤阳神光横扫焚毁敌方弹幕，持续照射叠伤并引爆纯阳耀斑',
  paperhorse: B.WEAPONS?.paperhorse?.evoDesc || '成列纸马铁骑贯穿全屏冲阵，铁蹄踏碎敌群连环爆裂',
  taomujian: B.WEAPONS?.taomujian?.evoDesc || '多柄雷木飞剑疾速御空穿刺，每三击引落天罡神雷轰击群祟',
  suohun_chain: B.WEAPONS?.suohun_chain?.evoDesc || '双链裂空贯穿破甲，强力拽聚群祟定身并引爆夺魄阴煞',
  zhinian_kite: B.WEAPONS?.zhinian_kite?.evoDesc || '成群金乌火鸦俯冲轰炸并刻印阳炎，掠过之处铺开流火焚天径',
  nuo_drum: B.WEAPONS?.nuo_drum?.evoDesc || '立起百相神鼓连擂四重逐疫震波，净除敌弹、破甲易伤并终响五方爆裂',
};

export const RECIPE_LABELS = {
  paired: '本命共鸣 · 伤害 +18%',
  resonance: '流派共鸣 · 三器同门',
  maxRelic: '五阶法器 · 灵气贯通',
  altar: '香案血祭 · 神明敕封',
};

export const RECIPE_SHORT = {
  paired: '本命配对',
  resonance: '流派共鸣',
  maxRelic: '五阶法器',
  altar: '香案敕封',
};

export const SHRINE_PROMPT_TEXT = {
  altar: '参拜香案',
  trial: '开启试炼',
  peddler: '鬼市交易',
};

export const SHRINE_FLAVOR = {
  altar: '街角残存土地香火，可燃血祭器、求取命签或祈安神护体。',
  trial: '古碑镇压凶煞，开启后迎战十八息群英围攻，礼成必落供盒。',
  peddler: '鬼市货郎提灯摆摊，收局内铜钱换器物精炼、符印与还阳汤药。',
};

export function weaponName(id, evolved = false) {
  const w = own(B.WEAPONS, id) ? B.WEAPONS[id] : null;
  const fb = own(WEAPON_FALLBACK, id) ? WEAPON_FALLBACK[id] : null;
  if (evolved) return w?.evoName || fb?.[1] || (typeof id === 'string' ? id : '');
  return w?.name || fb?.[0] || (typeof id === 'string' ? id : '');
}

export function relicName(id) {
  const r = own(B.RELICS, id) ? B.RELICS[id] : null;
  const fb = own(RELIC_FALLBACK, id) ? RELIC_FALLBACK[id] : null;
  return r?.name || fb || (typeof id === 'string' ? id : '');
}

export function pairOf(relicId) {
  if (own(B.RELICS, relicId)) return B.RELICS[relicId].pair || null;
  if (own(PAIRS, relicId)) return PAIRS[relicId];
  return null;
}

function fmtNum(v) {
  return Number.isInteger(v) ? String(v) : Number(v.toFixed(2)).toString();
}

const RELIC_TOTAL_FIELDS = [
  ['cdr', (v) => `冷却 −${Math.round(v * 100)}%`],
  ['areaPct', (v) => `范围 +${Math.round(v * 100)}%`],
  ['dmgPct', (v) => `伤害 +${Math.round(v * 100)}%`],
  ['durPct', (v) => `持续与弹速 +${Math.round(v * 100)}%`],
  ['armor', (v) => `护甲 +${v}`],
  ['maxHp', (v) => `生命 +${v}`],
  ['amount', (v) => `数量 +${v}`],
  ['xpPct', (v) => `经验 +${Math.round(v * 100)}%`],
  ['pickupPct', (v) => `拾取 +${Math.round(v * 100)}%`],
  ['critChance', (v) => `暴击率 +${Math.round(v * 100)}%`],
  ['speedPct', (v) => `移速 +${Math.round(v * 100)}%`],
  ['slowResist', (v) => `减速抗性 +${Math.round(v * 100)}%`],
  ['hurtInvuln', (v) => `受击无敌 +${fmtNum(v)}秒`],
  ['killHeal', (v) => `每${B.RELICS?.glutinous?.killInterval ?? 35}杀回血 +${v}`],
  ['critDmg', (v) => `暴击伤害 +${Math.round(v * 100)}%`],
  ['coinPct', (v) => `铜钱 +${Math.round(v * 100)}%`],
  ['lightPct', (v) => `照亮 +${Math.round(v * 100)}%`],
  ['ultChargePct', (v) => `攒气 +${Math.round(v * 100)}%`],
  ['ultCdRefund', (v) => `大招返还冷却 ${Math.round(v * 100)}%`],
  ['bonusPierce', (v) => `穿透 +${v}`],
  ['controlDurPct', (v) => `控场时长 +${Math.round(v * 100)}%`],
];

/** 法器在当前等级（1..5）下的总加成文案，直接由 relicEffect 计算保证零偏差 */
export function relicTotalDesc(id, level = 1) {
  const lv = Math.max(1, Math.min(5, Math.floor(level || 1)));
  if (!own(B.RELICS, id)) return '';
  const eff = relicEffect(id, lv);
  const parts = [];
  for (const [k, fmt] of RELIC_TOTAL_FIELDS) {
    const v = +Number(eff[k] || 0).toFixed(4);
    if (v) parts.push(fmt(v));
  }
  return parts.join('，');
}

/**
 * 签面信息：兼容 12 兵刃、12 法器、18 守夜命签与溢签/铜钱/包子，
 * 保留流派标签 tags、留签态 locked、开光提示 evolveHint。
 */
export function describeChoice(c) {
  if (!c || typeof c !== 'object') {
    return {
      kind: 'unknown', id: '', name: '？', level: null, levelText: '',
      desc: '', isNew: false, evolvable: false, locked: false, tags: [], evolveHint: '',
    };
  }
  if (c.kind === 'blessing') {
    const def = blessingInfo(c.id);
    const tier = c.tier || def.tier || 'auspicious';
    const tags = Array.isArray(c.tags) && c.tags.length ? [...c.tags] : [...(def.tags || [])];
    const stacks = c.stacks ?? c.level ?? 1;
    const maxStacks = c.maxStacks ?? def.maxStacks ?? 1;
    return {
      kind: 'blessing',
      id: c.id,
      name: c.name || def.name || String(c.id),
      level: stacks,
      stacks,
      maxStacks,
      levelText: tier === 'cursed' ? '凶签' : '吉签',
      desc: c.desc || def.desc || '',
      isNew: c.isNew !== undefined ? !!c.isNew : stacks <= 1,
      evolvable: false,
      locked: false,
      tags,
      evolveHint: maxStacks > 1 && stacks > 1 ? `叠至 ${cnNum(stacks)} 重` : '不占兵刃法器栏位',
      tier,
    };
  }
  if (c.kind === 'coin') {
    const v = c.value ?? B.LEVELUP?.coinValue ?? 15;
    return {
      kind: 'coin', id: 'coin', name: '铜钱', level: null, levelText: '',
      desc: `铜钱 +${v}`, isNew: false, evolvable: false, locked: !!c.locked, tags: [], evolveHint: '',
    };
  }
  if (c.kind === 'bun') {
    const v = c.value ?? B.LEVELUP?.bunHeal ?? 40;
    return {
      kind: 'bun', id: 'bun', name: '包子', level: null, levelText: '',
      desc: `回复 ${v} 生命`, isNew: false, evolvable: false, locked: !!c.locked, tags: [], evolveHint: '',
    };
  }
  if (c.kind === 'overflow') {
    const m = B.DAMAGE?.overflowMult ?? 1.12;
    const lv = c.level ?? null;
    return {
      kind: 'overflow', id: 'overflow', name: '溢签', level: null,
      levelText: lv ? `第${cnNum(lv)}签` : '',
      desc: `器物已满，伤害 ×${m}`,
      isNew: false, evolvable: false, locked: !!c.locked, tags: [], evolveHint: '',
    };
  }
  if (c.kind === 'weapon' && own(B.WEAPONS, c.id)) {
    const u = describeUpgrade({ ...c, level: c.level ?? 1 });
    return {
      ...u,
      evolveTargetId: c.evolveTargetId || c.id,
    };
  }
  if (c.kind === 'relic' && own(B.RELICS, c.id)) {
    const u = describeUpgrade({ ...c, level: c.level ?? 1 });
    return {
      ...u,
      evolveTargetId: c.evolveTargetId || B.RELICS[c.id].pair || null,
    };
  }
  return {
    kind: c.kind, id: c.id, name: String(c.name ?? c.id ?? '？'),
    level: c.level ?? 1, levelText: '', desc: c.desc || '',
    isNew: !!c.isNew, evolvable: !!c.evolvable, locked: !!c.locked,
    tags: Array.isArray(c.tags) ? [...c.tags] : [], evolveHint: '',
  };
}

export const SHOP_COPY = {
  tizhi: { name: '体魄', flavor: '夜风硬，身板先得扛住' },
  lidao: { name: '力道', flavor: '锣槌抡得更沉' },
  jiaoli: { name: '脚力', flavor: '青石板上跑得快些' },
  yanli: { name: '眼力', flavor: '魂火隔老远也瞧得见' },
  wuxing: { name: '悟性', flavor: '一点就透，升得快' },
  caiyun: { name: '财运', flavor: '铜钱多落几枚' },
  jiyuan: { name: '机缘', flavor: '多求几回签' },
  huchi: { name: '护持', flavor: '护身的家伙结实些' },
};

export function nightLabel(n) {
  return n <= 0 ? '寻常夜' : `夜色 ${cnNum(n)}`;
}

export function nightDesc(n) {
  if (n <= 0) return '不加码，先摸清这条街';
  const pct = Math.round((B.COIN_REWARD?.nightPct ?? 0.15) * 100 * n);
  const affix = B.NIGHT_AFFIXES?.[n]?.name;
  return `鬼更硬 +${15 * n}% · 铜钱 +${pct}%${affix ? ` · 新添「${affix}」` : ''}`;
}

export function watchName(w) {
  return B.WATCH_NAMES?.[w] || ['', '一更', '二更', '三更', '四更', '五更', '鸡鸣'][w] || '';
}

export const AGE_TIPS = [
  '本游戏是一款以民俗守夜为题材的休闲动作游戏，适用于年满 12 周岁及以上的用户，建议未成年人在家长监护下使用游戏产品。',
  '本游戏基于架空的民俗幻想世界观，含有轻度的鬼怪形象与卡通化的战斗表现，无血腥、暴力细节，不涉及真实历史人物与宗教活动。',
  '本游戏为单机游戏，不含付费内容与玩家间社交功能；广告均需玩家主动点击观看，不看不影响正常游玩。',
  '一局约 10 分钟。请合理安排游戏时间，注意休息，避免沉迷。',
];

export const CHARM_LABEL = (relicId) => `护身符·${relicName(relicId)}`;

export const ACHIEVEMENT_NAMES = {
  firstClear: '头回见天亮',
  kills800: '一夜八百鬼',
  noBun480: '饿着肚子守到五更',
  endless10: '残夜又守十分钟',
  hit10k: '一击过万',
  hit100m: '一击过亿',
  night10: '夜色十，天照亮',
  totalKills1500: '桃木诛邪',
  evolve5: '火鸦破夜',
  night5: '五重镇岳',
  evolve12: '万法开光',
  score50k: '名动五更榜',
  endless15: '玄霜孤月',
  bossKills3: '三斩夜主',
  bossKills15: '威镇百鬼王',
  totalKills8000: '万邪莫近',
  heroes4: '更房聚义',
  codex30: '百物通晓',
  clears5: '五度破晓',
  coop3: '同守五更灯',
};

export const ACHIEVEMENT_DESC = {
  firstClear: '守过五更，头一回见到鸡鸣天亮',
  kills800: '单局打散 800 只邪祟',
  noBun480: '前 8 分钟不吃包子，熬进五更',
  endless10: '进入残夜无尽后累计撑满 20 分钟',
  hit10k: '单次伤害突破一万',
  hit100m: '单次伤害突破一亿',
  night10: '通关最高难度「夜色十」',
  totalKills1500: '累计打散 1500 只邪祟，解锁兵刃「桃木飞剑」',
  evolve5: '累计敕封开光 5 把神兵，解锁兵刃「纸鸢火鸦」',
  night5: '通关「夜色五」及以上，解锁皮肤「紫金鸣鸿甲」',
  evolve12: '累计敕封开光 12 把神兵，解锁皮肤「碧落乘鹤衣」',
  score50k: '单局综合守夜积分突破 50000 分，解锁皮肤「鎏金太乙诏」',
  endless15: '单局守夜存活达 900 秒，解锁特效「玄霜寒月」',
  bossKills3: '累计打散 3 尊夜主首领',
  bossKills15: '累计打散 15 尊夜主首领',
  totalKills8000: '累计打散 8000 只邪祟',
  heroes4: '解锁至少 4 名守夜打更人',
  codex30: '百物谱累计收录达到 30 项',
  clears5: '累计守满五更通关 5 回',
  coop3: '参与同守五更联机或画阵扶起队友累计 3 次',
};

export const ENEMY_COPY = {
  paperkid: { name: '纸扎童子', watch: '一更起出没', desc: '糊纸点的腮红，蹦跳着往灯火跟前凑。' },
  shade: { name: '影祟', watch: '一更起出没', desc: '贴地疾行的黑影，身子脆，胜在脚快。' },
  lanternghost: { name: '灯笼鬼', watch: '一更后半出没', desc: '飘在半空的破纸灯，皮厚耐敲。' },
  weasel: { name: '黄皮子', watch: '二更后半起出没', desc: '近身先露朱砂蓄势线，顿一息直线猛扑，横移可避。' },
  sedan: { name: '纸轿子', watch: '二更后半起出没', desc: '沉甸甸的朱红空轿，打破后会裂出四只纸扎童子。' },
  drowned: { name: '水鬼', watch: '三更后半古井出没', desc: '常从古井爬出，周身湿气会让近处的打更人步子变沉。' },
  suona: { name: '吹鼓鬼', watch: '二更起出没', desc: '吹响喜丧唢呐鼓舞群祟，令周身邪祟移速与凶性齐涨，宜先除之。' },
  paperbride: { name: '红衣纸新娘', watch: '三更起出没', desc: '执团扇远距游走，频抛冥钱暗器封路，逼近便飘身后撤。' },
  cinder: { name: '阴火骷髅', watch: '二更起出没', desc: '胸燃幽火疾奔，散架后遗留阴火核，须臾爆裂灼伤敌我。' },
  horse: { name: '纸马将军', watch: '三更夜主（04:00）', boss: true, desc: '披靠旗的纸扎战马，蓄势预警后连冲三趟，打散必落供盒。' },
  umbrella: { name: '无面伞女', watch: '四更夜主（08:00）', boss: true, desc: '收伞减伤、开伞旋射弹幕，趁其开伞破绽猛攻，打散必落供盒。' },
  youshen: { name: '夜游神', watch: '五更终主（10:00）', boss: true, desc: '巡夜大神，唤群祟、洒旋弹，残血挥戟蓄势猛突；撑过去便是天亮。' },
};

/** 反查某把武器配对开光的法器 ID */
export function weaponPairRelic(weaponId) {
  if (own(B.WEAPONS, weaponId)) return B.WEAPONS[weaponId].pair || null;
  if (typeof weaponId !== 'string') return null;
  return Object.keys(PAIRS).find((r) => PAIRS[r] === weaponId) || null;
}
