// 文案：打更人口吻，短、有味道。数值从 balance.js 读，文案只描述「怎么个打法」。
import * as B from '../sim/balance.js';
import { cnNum } from './dom.js';

export const GAME_NAME = '五更天';

export const HERO_COPY = {
  zhou: { name: '打更人·老周', short: '老周', flavor: '敲了三十年更，锣一响，鬼也绕道。', trait: '大招攒气 +25%', weapon: 'gong', unlock: '默认' },
  mian: { name: '纸扎匠·阿绵', short: '阿绵', flavor: '纸人纸马，扎得活灵活现。', trait: '召唤物伤害 +20%，最大生命 −10%', weapon: 'paperman', unlock: '单局打败 800 只敌人' },
  daotong: { name: '小道童', short: '小道童', flavor: '师父云游未归，替他守这一夜。', trait: '暴击率 +10%', weapon: 'talisman', unlock: '一个包子不吃，守到五更（8:00）' },
};

export function heroInfo(id) {
  const c = HERO_COPY[id] || HERO_COPY.zhou;
  const b = B.HEROES?.[id];
  return {
    id,
    name: b?.name || c.name,
    short: b?.short || c.short,
    trait: b?.trait || c.trait,
    unlock: b?.unlock?.desc || c.unlock,
    weapon: b?.startWeapon || c.weapon,
    flavor: c.flavor,
  };
}

const WEAPON_FALLBACK = {
  gong: ['更锣', '五更鸣锣'], lantern: ['灯笼', '长明灯'], talisman: ['符纸', '天师符阵'], brush: ['墨笔', '泼墨山河'],
  coinsword: ['铜钱剑', '七星剑阵'], paperman: ['纸人', '纸扎仪仗'], firecracker: ['爆竹', '满堂红'], bell: ['铜铃', '千铃引魂'],
};
const RELIC_FALLBACK = {
  clapper: '梆子', censer: '香炉', cinnabar: '朱砂', inkstone: '砚台', bagua: '八卦镜', scissors: '剪刀', tinder: '火折子', redstring: '红绳',
};
const PAIRS = {
  clapper: 'gong', censer: 'lantern', cinnabar: 'talisman', inkstone: 'brush',
  bagua: 'coinsword', scissors: 'paperman', tinder: 'firecracker', redstring: 'bell',
};

export const WEAPON_INTRO = {
  gong: '以身为心，一锣震开四邻',
  lantern: '灯笼绕身，近者自焚',
  talisman: '符纸自寻邪祟',
  brush: '朝前一笔，扫出扇形墨锋',
  coinsword: '铜钱剑掷出，穿行而回',
  paperman: '扎几个纸人替你冲阵',
  firecracker: '往鬼堆里扔一挂爆竹',
  bell: '铜铃一响，邪祟间连环弹跳',
};

export const EVOLVE_INTRO = {
  gong: '连震三声，定住群鬼',
  lantern: '火环常驻，烧死者炸开',
  talisman: '符纸穿透，命中连锁',
  brush: '前后两刀，墨迹灼地',
  coinsword: '七剑环身，齐射而出',
  paperman: '八个纸人列队巡游',
  firecracker: '一炸连一炸',
  bell: '每跳一下，分作两路',
};

const RELIC_LINE = {
  clapper: '冷却 −8%',
  censer: '范围 +10%',
  cinnabar: '伤害 +8%',
  inkstone: '持续与弹速 +10%',
  bagua: '护甲 +1，生命 +10',
  tinder: '经验 +8%，拾取 +10%',
  redstring: '暴击率 +5%',
};

export function weaponName(id, evolved = false) {
  const w = B.WEAPONS?.[id];
  if (evolved) return w?.evoName || WEAPON_FALLBACK[id]?.[1] || id;
  return w?.name || WEAPON_FALLBACK[id]?.[0] || id;
}
export function relicName(id) { return B.RELICS?.[id]?.name || RELIC_FALLBACK[id] || id; }
export function pairOf(relicId) { return B.RELICS?.[relicId]?.pair || PAIRS[relicId]; }

const STAT_LABEL = { dmg: '伤害', radius: '范围', cd: '冷却', count: '数量', bounces: '弹跳', spread: '角度' };
const STAT_ORDER = ['count', 'bounces', 'dmg', 'radius', 'spread', 'cd'];

/** 武器从 level-1 升到 level 的变化，挑最多两项写成「伤害 20→26」。 */
function weaponDiff(id, level) {
  const w = B.WEAPONS?.[id];
  if (!w || level < 2) return '';
  const parts = [];
  for (const k of STAT_ORDER) {
    const arr = w[k];
    if (!Array.isArray(arr)) continue;
    const a = arr[level - 2], b = arr[level - 1];
    if (a === undefined || b === undefined || a === b) continue;
    const fmt = (x) => (k === 'cd' ? `${x}秒` : k === 'spread' ? `${x}°` : String(x));
    parts.push(`${STAT_LABEL[k]} ${fmt(a)}→${fmt(b)}`);
    if (parts.length >= 2) break;
  }
  return parts.join('，');
}

function relicLine(id, level) {
  if (id === 'scissors') {
    const amount = B.RELICS?.scissors?.amountLevels || [2, 5];
    return amount.includes(level) ? '召唤数 +1' : '伤害 +4%';
  }
  return RELIC_LINE[id] || '';
}

/** 签面信息：{ name, vertical, level, desc, isNew, evolvable, kind, id } */
export function describeChoice(c) {
  const kind = c?.kind;
  const level = c?.level ?? 1;
  if (kind === 'weapon') {
    return {
      kind, id: c.id, name: weaponName(c.id), level,
      desc: c.isNew ? WEAPON_INTRO[c.id] || '' : weaponDiff(c.id, level) || '再强一分',
      isNew: !!c.isNew, evolvable: !!c.evolvable,
    };
  }
  if (kind === 'relic') {
    const pair = pairOf(c.id);
    const line = relicLine(c.id, level);
    return {
      kind, id: c.id, name: relicName(c.id), level,
      desc: c.isNew && pair ? `${line}；配${weaponName(pair)}可开光` : line,
      isNew: !!c.isNew, evolvable: !!c.evolvable,
    };
  }
  if (kind === 'overflow') {
    const m = B.DAMAGE?.overflowMult ?? 1.12;
    return { kind, id: c.id, name: '溢签', level: null, desc: `器物已满，伤害 ×${m}`, isNew: false, evolvable: false };
  }
  if (kind === 'coin') {
    return { kind, id: 'coin', name: '铜钱', level: null, desc: `铜钱 +${c.value ?? B.LEVELUP?.coinValue ?? 15}`, isNew: false, evolvable: false };
  }
  if (kind === 'bun') {
    return { kind, id: 'bun', name: '包子', level: null, desc: `回复 ${c.value ?? B.LEVELUP?.bunHeal ?? 40} 生命`, isNew: false, evolvable: false };
  }
  return { kind, id: c?.id, name: String(c?.id ?? '？'), level, desc: '', isNew: false, evolvable: false };
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
};
