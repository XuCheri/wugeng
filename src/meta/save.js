// 本地存档 v3：带版本号，读档时一律走 migrateSave 修补，坏档不崩；支持跨端无损合并与防刷钱计分。
// 只存本机 localStorage（云端同步由 cloud-save.js 负责）。

import {
  ATTACK_VFX_IDS,
  HERO_SKIN_IDS,
  cosmeticShopCount,
  cosmeticShopSpent,
} from './cosmetics.js';

export const SAVE_KEY = 'wugeng.save';
export const SAVE_VERSION = 4;
export const COACH_KEYS = ['firstLevelUp', 'firstChest', 'firstUltReady', 'firstEvolve', 'firstElite'];
export const DEFAULT_DAO_NAME = '守夜打更人';

export const HERO_IDS = ['zhou', 'mian', 'daotong', 'yinyang', 'tiejiang', 'nuoxi'];
export const HERO_START_WEAPON = {
  zhou: 'gong',
  mian: 'paperman',
  daotong: 'talisman',
  yinyang: 'compass',
  tiejiang: 'suohun_chain',
  nuoxi: 'nuo_drum',
};
export const DEFAULT_UNLOCKED_WEAPONS = [
  'gong', 'lantern', 'talisman', 'brush', 'suohun_chain', 'nuo_drum',
];
export const SHOP_IDS = ['tizhi', 'lidao', 'jiaoli', 'yanli', 'wuxing', 'caiyun', 'jiyuan', 'huchi'];
export const WEAPON_IDS = [
  'gong', 'lantern', 'talisman', 'brush', 'coinsword', 'paperman', 'firecracker', 'bell',
  'compass', 'soulbanner', 'bronze_mirror', 'paperhorse',
  'taomujian', 'suohun_chain', 'zhinian_kite', 'nuo_drum',
];
export const RELIC_IDS = [
  'clapper', 'censer', 'cinnabar', 'inkstone', 'bagua', 'scissors', 'tinder', 'redstring',
  'strawshoes', 'glutinous', 'fivecoins', 'soulwick',
  'leijimu', 'yinpai', 'huoyao_pouch', 'wuse_mask',
];
export const ENEMY_IDS = [
  'paperkid', 'shade', 'lanternghost', 'weasel', 'sedan', 'drowned',
  'suona', 'paperbride', 'cinder',
  'horse', 'umbrella', 'youshen',
];
export const NIGHT_MAX = 10;
export const SHOP_MAX_LEVEL = 5;
export const DMG_TEXT_MODES = ['all', 'crit', 'off'];

const LEGACY_CHECKIN_COSMETIC_IDS = [
  'lantern_cinnabar', 'outfit_indigo', 'lantern_plain', 'outfit_straw',
  'lantern_lotus', 'outfit_ink', 'lantern_carp', 'outfit_hemp',
];
const VALID_COSMETIC_ID_SET = new Set([
  ...LEGACY_CHECKIN_COSMETIC_IDS,
  ...HERO_SKIN_IDS,
  ...ATTACK_VFX_IDS,
]);

export const ACHIEVEMENT_WEAPON_REWARDS = {
  totalKills1500: 'taomujian',
  evolve5: 'zhinian_kite',
};
export const ACHIEVEMENT_COSMETIC_REWARDS = {
  night5: 'zhou_imperial_bell',
  evolve12: 'daotong_jade_immortal',
  score50k: 'yinyang_gold_oracle',
  endless15: 'frost_moon',
};

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export function sanitizeDaoName(raw) {
  if (typeof raw !== 'string') return DEFAULT_DAO_NAME;
  const noTags = raw.replace(/<[^>]*>/g, '');
  const clean = noTags.replace(/[<>"'`&\x00-\x1f\x7f]/g, '').replace(/\s+/g, ' ').trim();
  const sliced = [...clean].slice(0, 12).join('');
  return sliced || DEFAULT_DAO_NAME;
}

export function defaultSettings() {
  return { sfx: true, music: true, shake: true, haptics: true, dmgText: 'all', lowQuality: false };
}

export function defaultCodex() {
  return {
    weapons: ['gong'],
    evolutions: [],
    relics: [],
    enemies: {},
  };
}

export function defaultStarterWeaponByHero(unlockedWeapons = DEFAULT_UNLOCKED_WEAPONS) {
  const out = {};
  for (const h of HERO_IDS) {
    const sig = HERO_START_WEAPON[h];
    out[h] = unlockedWeapons.includes(sig) ? sig : (unlockedWeapons[0] || 'gong');
  }
  return out;
}

export function defaultLeaderboard() {
  return {
    bestScore: 0,
    bestEndlessSec: 0,
    bestKills: 0,
    pendingScore: 0,
    history: [],
  };
}

export function defaultCoach() {
  return {
    seen: {},
    runsPlayed: 0,
  };
}

export function defaultSave() {
  const shop = {};
  for (const id of SHOP_IDS) shop[id] = 0;
  const unlockedWeapons = [...DEFAULT_UNLOCKED_WEAPONS];
  return {
    version: SAVE_VERSION,
    updatedAt: 0,
    daoName: DEFAULT_DAO_NAME,
    coins: 0,
    shop,
    unlockedHeroes: ['zhou'],
    selectedHero: 'zhou',
    unlockedWeapons,
    selectedStarterWeapon: 'gong',
    starterWeaponByHero: defaultStarterWeaponByHero(unlockedWeapons),
    nightUnlocked: 0,     // 可选的最高夜色（0 = 寻常夜）
    nightCleared: -1,     // 已通关的最高夜色，-1 = 从未通关
    selectedNight: 0,
    achievements: {},     // { id: 首次达成的时间戳 }
    achievementClaims: [],
    codex: defaultCodex(),
    settings: defaultSettings(),
    checkin: { cycleDay: 0, lastClaimDate: null, cycles: 0, totalClaims: 0 },
    cosmetics: {
      owned: [],
      equipped: { lantern: null, outfit: null, attackVfx: 'default', heroSkins: {} },
    },
    charms: [],           // 护身符：[{ relicId }]，开局带一枚，用掉即消耗
    leaderboard: defaultLeaderboard(),
    coach: defaultCoach(),
    stats: {
      runs: 0, clears: 0, firstRunDone: false, totalPlaySec: 0,
      bestTimeSec: 0, bestKills: 0, bestHit: 0, totalKills: 0, totalCoins: 0,
      totalEvolutions: 0, totalBossKills: 0, coopRuns: 0, coopRevives: 0,
    },
  };
}

export function isPlainObj(v) {
  if (v === null || typeof v !== 'object') return false;
  try {
    const proto = Object.getPrototypeOf(v);
    return proto === Object.prototype || proto === null;
  } catch {
    return false;
  }
}

export function canMutateObj(v) {
  return isPlainObj(v) && !Object.isFrozen(v);
}

export function canWriteProp(obj, key) {
  if (!isPlainObj(obj) || Object.isFrozen(obj)) return false;
  const d = Object.getOwnPropertyDescriptor(obj, key);
  return !d ? Object.isExtensible(obj) : (d.writable === true || typeof d.set === 'function');
}

export function canMutateArray(a) {
  if (!Array.isArray(a) || Object.isFrozen(a) || !Object.isExtensible(a)) return false;
  const lenDesc = Object.getOwnPropertyDescriptor(a, 'length');
  return !lenDesc || lenDesc.writable === true;
}

const isObj = isPlainObj;

export function toFiniteNumber(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
  if (typeof v === 'string') {
    if (v.trim() === '') return NaN;
    const n = Number(v);
    return Number.isFinite(n) ? n : NaN;
  }
  return NaN;
}

const int = (v, def, min = -Infinity, max = 9e15) => {
  const n = toFiniteNumber(v);
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, Math.floor(n)));
};
const num = (v, def, min = 0, max = 1e15) => {
  const n = toFiniteNumber(v);
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, n));
};
const bool = (v, def) => (typeof v === 'boolean' ? v : def);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidDateStr(s) {
  if (typeof s !== 'string' || !DATE_RE.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  if (y < 1970 || y > 2999 || m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function isValidNonDefaultCosmeticId(id) {
  if (typeof id !== 'string' || !id || id.length >= 40 || FORBIDDEN_KEYS.has(id)) return false;
  if (id === 'default' || id.endsWith('_default')) return false;
  return VALID_COSMETIC_ID_SET.has(id);
}

function sanitizeLeaderboardHistory(rawList) {
  if (!Array.isArray(rawList)) return [];
  const out = [];
  for (const item of rawList) {
    if (!isObj(item)) continue;
    const score = int(item.score, -1, 0, 1e12);
    if (score < 0) continue;
    const heroId = HERO_IDS.includes(item.heroId) ? item.heroId : 'zhou';
    out.push({
      score,
      heroId,
      daoName: sanitizeDaoName(item.daoName),
      nightLevel: int(item.nightLevel, 0, 0, NIGHT_MAX),
      kills: int(item.kills, 0, 0, 1e9),
      timeSec: int(item.timeSec, 0, 0, 1e9),
      cleared: bool(item.cleared, false),
      at: int(item.at, 0, 0, 9e15),
    });
    if (out.length >= 30) break;
  }
  out.sort((a, b) => (b.score - a.score) || (b.at - a.at));
  return out.slice(0, 20);
}

export function getHeroStarterWeapon(save, heroId) {
  const safeHero = HERO_IDS.includes(heroId) ? heroId : 'zhou';
  const unlocked = Array.isArray(save?.unlockedWeapons) && save.unlockedWeapons.length
    ? save.unlockedWeapons.filter((w) => WEAPON_IDS.includes(w))
    : DEFAULT_UNLOCKED_WEAPONS;
  const perHero = save?.starterWeaponByHero?.[safeHero];
  if (typeof perHero === 'string' && unlocked.includes(perHero)) return perHero;
  if (safeHero === save?.selectedHero && typeof save?.selectedStarterWeapon === 'string' && unlocked.includes(save.selectedStarterWeapon)) {
    return save.selectedStarterWeapon;
  }
  const sig = HERO_START_WEAPON[safeHero];
  if (unlocked.includes(sig)) return sig;
  return unlocked[0] || 'gong';
}

export function setHeroStarterWeapon(save, heroId, weaponId) {
  if (!canMutateObj(save)) return false;
  const safeHero = HERO_IDS.includes(heroId) ? heroId : (HERO_IDS.includes(save.selectedHero) ? save.selectedHero : 'zhou');
  const unlocked = Array.isArray(save.unlockedWeapons) ? save.unlockedWeapons : DEFAULT_UNLOCKED_WEAPONS;
  if (typeof weaponId !== 'string' || !WEAPON_IDS.includes(weaponId) || !unlocked.includes(weaponId)) {
    return false;
  }
  if (!isObj(save.starterWeaponByHero)) {
    save.starterWeaponByHero = defaultStarterWeaponByHero(unlocked);
  }
  save.starterWeaponByHero[safeHero] = weaponId;
  if (safeHero === save.selectedHero) {
    save.selectedStarterWeapon = weaponId;
  }
  return true;
}

/**
 * 把任意来源（旧版本 v0/v1/v2、手改、半截损坏）的数据修补成当前 v3 版本的合法存档。
 * 未知字段丢弃，缺失字段补默认值，越界数值夹紧。
 */
export function migrateSave(raw) {
  const def = defaultSave();
  if (!isObj(raw)) return def;
  let src = raw;

  // v0（原型期）：字段名为 gold / heroes / upgrades，且没有 version。
  if (src.version === undefined || src.version === 0) {
    src = {
      ...src,
      coins: src.coins ?? src.gold,
      unlockedHeroes: src.unlockedHeroes ?? src.heroes,
      shop: src.shop ?? src.upgrades,
    };
  }

  const out = def;
  out.updatedAt = int(src.updatedAt ?? src.savedAt, 0, 0, 9e15);
  out.daoName = sanitizeDaoName(src.daoName);
  out.coins = int(src.coins, 0, 0, 1e12);

  if (isObj(src.shop)) {
    for (const id of SHOP_IDS) out.shop[id] = int(src.shop[id], 0, 0, SHOP_MAX_LEVEL);
  }

  if (Array.isArray(src.unlockedHeroes)) {
    const set = new Set(['zhou']);
    for (const h of src.unlockedHeroes) if (HERO_IDS.includes(h)) set.add(h);
    out.unlockedHeroes = HERO_IDS.filter((h) => set.has(h));
  }
  out.selectedHero = out.unlockedHeroes.includes(src.selectedHero) ? src.selectedHero : 'zhou';

  out.nightCleared = int(src.nightCleared, -1, -1, NIGHT_MAX);
  out.nightUnlocked = Math.max(
    int(src.nightUnlocked, 0, 0, NIGHT_MAX),
    Math.min(NIGHT_MAX, out.nightCleared + 1),
  );
  out.selectedNight = int(src.selectedNight, 0, 0, out.nightUnlocked);

  if (isObj(src.achievements)) {
    for (const [k, v] of Object.entries(src.achievements)) {
      if (typeof k !== 'string' || !k || k.length >= 40 || FORBIDDEN_KEYS.has(k)) continue;
      if (v === true) {
        out.achievements[k] = 1;
      } else if (typeof v === 'number' && Number.isFinite(v) && v > 0) {
        out.achievements[k] = Math.min(9e15, Math.max(1, Math.floor(v)));
      }
    }
  }

  if (Array.isArray(src.achievementClaims)) {
    const claimSet = new Set();
    for (const id of src.achievementClaims) {
      if (typeof id === 'string' && id.length > 0 && id.length < 40 && !FORBIDDEN_KEYS.has(id)) {
        claimSet.add(id);
      }
    }
    out.achievementClaims = [...claimSet];
  }

  // 已解锁初始与升级池兵刃：默认 6 把 + 已解锁角色本命 + 存档已解锁 + 已领赏成就兵刃
  const uwSet = new Set(DEFAULT_UNLOCKED_WEAPONS);
  for (const h of out.unlockedHeroes) {
    if (HERO_START_WEAPON[h]) uwSet.add(HERO_START_WEAPON[h]);
  }
  if (Array.isArray(src.unlockedWeapons)) {
    for (const w of src.unlockedWeapons) {
      if (typeof w === 'string' && WEAPON_IDS.includes(w)) uwSet.add(w);
    }
  }
  for (const cid of out.achievementClaims) {
    const rw = Object.hasOwn(ACHIEVEMENT_WEAPON_REWARDS, cid) ? ACHIEVEMENT_WEAPON_REWARDS[cid] : null;
    if (rw && WEAPON_IDS.includes(rw)) uwSet.add(rw);
  }
  out.unlockedWeapons = WEAPON_IDS.filter((w) => uwSet.has(w));

  const byHero = defaultStarterWeaponByHero(out.unlockedWeapons);
  if (isObj(src.starterWeaponByHero)) {
    for (const h of HERO_IDS) {
      const cand = src.starterWeaponByHero[h];
      if (typeof cand === 'string' && out.unlockedWeapons.includes(cand)) {
        byHero[h] = cand;
      }
    }
  }
  if (typeof src.selectedStarterWeapon === 'string' && out.unlockedWeapons.includes(src.selectedStarterWeapon)) {
    if (!isObj(src.starterWeaponByHero) || src.starterWeaponByHero[out.selectedHero] === undefined) {
      byHero[out.selectedHero] = src.selectedStarterWeapon;
    }
    out.selectedStarterWeapon = byHero[out.selectedHero];
  } else {
    out.selectedStarterWeapon = byHero[out.selectedHero];
  }
  out.starterWeaponByHero = byHero;

  if (isObj(src.settings)) {
    const s = src.settings;
    out.settings.sfx = bool(s.sfx, true);
    out.settings.music = bool(s.music, true);
    out.settings.shake = bool(s.shake, true);
    out.settings.haptics = bool(s.haptics, true);
    out.settings.dmgText = DMG_TEXT_MODES.includes(s.dmgText) ? s.dmgText : 'all';
    out.settings.lowQuality = bool(s.lowQuality, false);
  }

  if (isObj(src.checkin)) {
    const c = src.checkin;
    out.checkin.cycleDay = int(c.cycleDay, 0, 0, 6);
    out.checkin.lastClaimDate = isValidDateStr(c.lastClaimDate) ? c.lastClaimDate : null;
    out.checkin.cycles = int(c.cycles, 0, 0, 1e9);
    out.checkin.totalClaims = int(c.totalClaims, 0, 0, 1e9);
  }

  const ownedCosSet = new Set();
  if (isObj(src.cosmetics) && Array.isArray(src.cosmetics.owned)) {
    for (const x of src.cosmetics.owned) {
      if (isValidNonDefaultCosmeticId(x)) ownedCosSet.add(x);
    }
  }
  for (const cid of out.achievementClaims) {
    const rc = Object.hasOwn(ACHIEVEMENT_COSMETIC_REWARDS, cid) ? ACHIEVEMENT_COSMETIC_REWARDS[cid] : null;
    if (rc && isValidNonDefaultCosmeticId(rc)) ownedCosSet.add(rc);
  }
  const owned = [...ownedCosSet];
  out.cosmetics.owned = owned;

  if (isObj(src.cosmetics)) {
    const eq = isObj(src.cosmetics.equipped) ? src.cosmetics.equipped : {};
    for (const slot of ['lantern', 'outfit']) {
      out.cosmetics.equipped[slot] = owned.includes(eq[slot]) ? eq[slot] : null;
    }
    if (typeof eq.attackVfx === 'string' && ATTACK_VFX_IDS.includes(eq.attackVfx)) {
      out.cosmetics.equipped.attackVfx = (eq.attackVfx === 'default' || owned.includes(eq.attackVfx))
        ? eq.attackVfx
        : 'default';
    } else {
      out.cosmetics.equipped.attackVfx = 'default';
    }
    if (isObj(eq.heroSkins)) {
      const hs = {};
      for (const h of HERO_IDS) {
        const sid = eq.heroSkins[h];
        if (typeof sid === 'string' && HERO_SKIN_IDS.includes(sid) && sid.startsWith(`${h}_`)) {
          if (sid === `${h}_default` || owned.includes(sid)) hs[h] = sid;
        }
      }
      out.cosmetics.equipped.heroSkins = hs;
    }
  }

  if (Array.isArray(src.charms)) {
    out.charms = src.charms
      .map((c) => (typeof c === 'string' ? { relicId: c } : c))
      .filter((c) => isObj(c) && RELIC_IDS.includes(c.relicId))
      .slice(0, 99)
      .map((c) => ({ relicId: c.relicId }));
  }

  if (isObj(src.stats)) {
    const s = src.stats;
    out.stats.runs = int(s.runs, 0, 0, 1e9);
    out.stats.clears = int(s.clears, 0, 0, 1e9);
    out.stats.firstRunDone = bool(s.firstRunDone, out.stats.runs > 0);
    out.stats.totalPlaySec = num(s.totalPlaySec, 0, 0, 1e12);
    out.stats.bestTimeSec = num(s.bestTimeSec, 0, 0, 1e12);
    out.stats.bestKills = int(s.bestKills, 0, 0, 1e12);
    out.stats.bestHit = num(s.bestHit, 0, 0, 1e15);
    out.stats.totalKills = int(s.totalKills, 0, 0, 1e12);
    out.stats.totalCoins = int(s.totalCoins, 0, 0, 1e12);
    out.stats.totalEvolutions = int(s.totalEvolutions, 0, 0, 1e9);
    out.stats.totalBossKills = int(s.totalBossKills, 0, 0, 1e9);
    out.stats.coopRuns = int(s.coopRuns, 0, 0, 1e9);
    out.stats.coopRevives = int(s.coopRevives, 0, 0, 1e9);
  }

  if (isObj(src.leaderboard)) {
    const lb = src.leaderboard;
    out.leaderboard.bestScore = int(lb.bestScore, 0, 0, 1e12);
    out.leaderboard.bestEndlessSec = int(lb.bestEndlessSec, 0, 0, 1e9);
    out.leaderboard.bestKills = Math.max(out.stats.bestKills, int(lb.bestKills, 0, 0, 1e12));
    out.leaderboard.pendingScore = int(lb.pendingScore, 0, 0, 1e12);
    out.leaderboard.history = sanitizeLeaderboardHistory(lb.history);
  } else {
    out.leaderboard.bestKills = out.stats.bestKills;
  }

  // 图鉴数据清洗 + 根据已解锁英雄与已有护身符自动回填
  const wSet = new Set(['gong']);
  for (const h of out.unlockedHeroes) if (HERO_START_WEAPON[h]) wSet.add(HERO_START_WEAPON[h]);
  const eSet = new Set();
  const rSet = new Set();
  for (const c of out.charms) if (RELIC_IDS.includes(c.relicId)) rSet.add(c.relicId);
  const enemies = {};
  if (isObj(src.codex)) {
    if (Array.isArray(src.codex.weapons)) {
      for (const w of src.codex.weapons) if (WEAPON_IDS.includes(w)) wSet.add(w);
    }
    if (Array.isArray(src.codex.evolutions)) {
      for (const w of src.codex.evolutions) {
        if (WEAPON_IDS.includes(w)) { eSet.add(w); wSet.add(w); }
      }
    }
    if (Array.isArray(src.codex.relics)) {
      for (const r of src.codex.relics) if (RELIC_IDS.includes(r)) rSet.add(r);
    }
    if (isObj(src.codex.enemies)) {
      for (const k of ENEMY_IDS) {
        const cnt = int(src.codex.enemies[k], 0, 0, 1e9);
        if (cnt > 0) enemies[k] = cnt;
      }
    }
  }
  out.codex = {
    weapons: WEAPON_IDS.filter((w) => wSet.has(w)),
    evolutions: WEAPON_IDS.filter((w) => eSet.has(w)),
    relics: RELIC_IDS.filter((r) => rSet.has(r)),
    enemies,
  };

  // 情境新手旁白与渐进开放状态迁移：旧版（<v4）已有守夜记录的老玩家默认已读全部提点，避免重复打扰
  const srcVersion = int(src.version, 0, 0, 99);
  const seenCoach = {};
  if (isObj(src.coach) && isObj(src.coach.seen)) {
    for (const k of COACH_KEYS) {
      if (src.coach.seen[k] === true) seenCoach[k] = true;
    }
  } else if (srcVersion < 4 && (out.stats.runs > 0 || out.stats.firstRunDone || out.stats.clears > 0)) {
    for (const k of COACH_KEYS) seenCoach[k] = true;
  }
  const rawCoachRuns = isObj(src.coach) ? int(src.coach.runsPlayed, 0, 0, 1e9) : 0;
  out.coach = {
    seen: seenCoach,
    runsPlayed: Math.max(out.stats.runs, rawCoachRuns, out.stats.firstRunDone ? 1 : 0),
  };

  out.version = SAVE_VERSION;
  return out;
}

const SHOP_STEP_COSTS = [60, 181, 347, 553, 794];

function shopSpent(shop) {
  let sum = 0;
  for (const id of SHOP_IDS) {
    const lv = int(shop?.[id], 0, 0, SHOP_MAX_LEVEL);
    for (let i = 0; i < lv; i++) sum += SHOP_STEP_COSTS[i];
  }
  return sum;
}

export function isFreshSave(s) {
  if (!isObj(s)) return true;
  const weapons = Array.isArray(s.codex?.weapons) ? s.codex.weapons : [];
  const onlyDefaultWeapon = weapons.length === 0 || (weapons.length === 1 && weapons[0] === 'gong');
  const heroes = Array.isArray(s.unlockedHeroes) ? s.unlockedHeroes : [];
  const onlyDefaultHero = heroes.length === 0 || (heroes.length === 1 && heroes[0] === 'zhou');
  const uw = Array.isArray(s.unlockedWeapons) ? s.unlockedWeapons : [];
  const extraUnlockedWeapon = uw.some((w) => WEAPON_IDS.includes(w) && !DEFAULT_UNLOCKED_WEAPONS.includes(w));
  return int(s.stats?.runs, 0, 0, 1e9) === 0
    && int(s.coins, 0, 0, 1e12) === 0
    && shopSpent(s.shop) === 0
    && int(s.checkin?.totalClaims, 0, 0, 1e9) === 0
    && onlyDefaultHero
    && !extraUnlockedWeapon
    && (Array.isArray(s.charms) ? s.charms.length : 0) === 0
    && int(s.nightUnlocked, 0, 0, NIGHT_MAX) === 0
    && int(s.nightCleared, -1, -1, NIGHT_MAX) < 0
    && (isObj(s.achievements) ? Object.keys(s.achievements).length : 0) === 0
    && (Array.isArray(s.achievementClaims) ? s.achievementClaims.length : 0) === 0
    && (Array.isArray(s.cosmetics?.owned) ? s.cosmetics.owned.length : 0) === 0
    && int(s.leaderboard?.bestScore, 0, 0, 1e12) === 0
    && (typeof s.daoName !== 'string' || s.daoName === DEFAULT_DAO_NAME || sanitizeDaoName(s.daoName) === DEFAULT_DAO_NAME)
    && onlyDefaultWeapon
    && (Array.isArray(s.codex?.evolutions) ? s.codex.evolutions.length : 0) === 0
    && (Array.isArray(s.codex?.relics) ? s.codex.relics.length : 0) === 0
    && (isObj(s.codex?.enemies) ? Object.keys(s.codex.enemies).length : 0) === 0;
}

export function saveProgressScore(s) {
  const ownedCos = s?.cosmetics?.owned;
  return (s?.coins || 0)
    + shopSpent(s?.shop)
    + cosmeticShopSpent(ownedCos)
    + cosmeticShopCount(ownedCos) * 2
    + (s?.stats?.clears || 0) * 500
    + (s?.stats?.runs || 0) * 25
    + (s?.checkin?.totalClaims || 0) * 60
    + Math.floor(s?.stats?.totalPlaySec || 0);
}

/**
 * 合并本机存档与云端存档（v3 无损合并）：
 * - 铜钱/加点/签到/护身符等可消费资产整包取更新（或进度分更高）的一方，并将鬼市皮肤/特效花费计入进度分严防刷钱；
 * - 英雄解锁、兵刃解锁、最高夜色、成就与领赏记录、鬼市外观、图鉴收集、天榜最高分与累计统计取并集/最大值。
 */
export function mergeSaves(localRaw, remoteRaw) {
  const a = migrateSave(localRaw);
  const b = migrateSave(remoteRaw);
  if (isFreshSave(b) && !isFreshSave(a)) return a;
  if (isFreshSave(a) && !isFreshSave(b)) return b;

  let primary = a;
  let secondary = b;
  const scoreA = saveProgressScore(a);
  const scoreB = saveProgressScore(b);
  if (b.updatedAt > a.updatedAt + 1000 && scoreB >= scoreA * 0.5) {
    primary = b; secondary = a;
  } else if (scoreB > scoreA && a.updatedAt <= b.updatedAt + 1000) {
    primary = b; secondary = a;
  }

  const merged = migrateSave(JSON.parse(JSON.stringify(primary)));
  merged.updatedAt = Math.max(a.updatedAt || 0, b.updatedAt || 0);

  if (merged.daoName === DEFAULT_DAO_NAME && secondary.daoName && secondary.daoName !== DEFAULT_DAO_NAME) {
    merged.daoName = secondary.daoName;
  }

  // 永久解锁角色与兵刃并集
  const heroSet = new Set([...a.unlockedHeroes, ...b.unlockedHeroes]);
  merged.unlockedHeroes = HERO_IDS.filter((h) => heroSet.has(h));
  if (!merged.unlockedHeroes.includes(merged.selectedHero)) merged.selectedHero = 'zhou';

  merged.achievementClaims = [...new Set([...a.achievementClaims, ...b.achievementClaims])];

  const uwSet = new Set([
    ...DEFAULT_UNLOCKED_WEAPONS,
    ...a.unlockedWeapons,
    ...b.unlockedWeapons,
    ...merged.unlockedHeroes.map((h) => HERO_START_WEAPON[h]).filter(Boolean),
  ]);
  for (const cid of merged.achievementClaims) {
    const rw = Object.hasOwn(ACHIEVEMENT_WEAPON_REWARDS, cid) ? ACHIEVEMENT_WEAPON_REWARDS[cid] : null;
    if (rw && WEAPON_IDS.includes(rw)) uwSet.add(rw);
  }
  merged.unlockedWeapons = WEAPON_IDS.filter((w) => uwSet.has(w));

  const byHero = defaultStarterWeaponByHero(merged.unlockedWeapons);
  for (const h of HERO_IDS) {
    const pPick = primary.starterWeaponByHero?.[h];
    const sPick = secondary.starterWeaponByHero?.[h];
    const defSig = HERO_START_WEAPON[h];
    if (pPick && pPick !== defSig && merged.unlockedWeapons.includes(pPick)) byHero[h] = pPick;
    else if (sPick && sPick !== defSig && merged.unlockedWeapons.includes(sPick)) byHero[h] = sPick;
    else if (pPick && merged.unlockedWeapons.includes(pPick)) byHero[h] = pPick;
    else if (sPick && merged.unlockedWeapons.includes(sPick)) byHero[h] = sPick;
  }
  merged.starterWeaponByHero = byHero;
  merged.selectedStarterWeapon = merged.unlockedWeapons.includes(primary.selectedStarterWeapon)
    ? primary.selectedStarterWeapon
    : byHero[merged.selectedHero];

  merged.nightCleared = Math.max(a.nightCleared, b.nightCleared);
  merged.nightUnlocked = Math.max(a.nightUnlocked, b.nightUnlocked, Math.min(NIGHT_MAX, merged.nightCleared + 1));
  merged.selectedNight = Math.min(merged.selectedNight, merged.nightUnlocked);

  // 成就（保留最早达成时间）
  for (const [k, v] of Object.entries(secondary.achievements)) {
    if (FORBIDDEN_KEYS.has(k) || !(v > 0)) continue;
    if (!merged.achievements[k] || v < merged.achievements[k]) merged.achievements[k] = v;
  }

  // 外观并集
  const cosSet = new Set([...a.cosmetics.owned, ...b.cosmetics.owned]);
  for (const cid of merged.achievementClaims) {
    const rc = Object.hasOwn(ACHIEVEMENT_COSMETIC_REWARDS, cid) ? ACHIEVEMENT_COSMETIC_REWARDS[cid] : null;
    if (rc && isValidNonDefaultCosmeticId(rc)) cosSet.add(rc);
  }
  merged.cosmetics.owned = [...cosSet];
  for (const slot of ['lantern', 'outfit']) {
    const pick = primary.cosmetics.equipped[slot] || secondary.cosmetics.equipped[slot];
    merged.cosmetics.equipped[slot] = merged.cosmetics.owned.includes(pick) ? pick : null;
  }
  const pickVfx = (primary.cosmetics.equipped.attackVfx && primary.cosmetics.equipped.attackVfx !== 'default'
    ? primary.cosmetics.equipped.attackVfx
    : secondary.cosmetics.equipped.attackVfx) || primary.cosmetics.equipped.attackVfx || 'default';
  merged.cosmetics.equipped.attackVfx = pickVfx === 'default' || merged.cosmetics.owned.includes(pickVfx) ? pickVfx : 'default';

  const hs = {};
  const pHs = isObj(primary.cosmetics.equipped.heroSkins) ? primary.cosmetics.equipped.heroSkins : {};
  const sHs = isObj(secondary.cosmetics.equipped.heroSkins) ? secondary.cosmetics.equipped.heroSkins : {};
  for (const h of HERO_IDS) {
    const pickSkin = (pHs[h] && pHs[h] !== `${h}_default` ? pHs[h] : sHs[h]) || pHs[h];
    if (pickSkin && (pickSkin === `${h}_default` || merged.cosmetics.owned.includes(pickSkin))) {
      hs[h] = pickSkin;
    }
  }
  merged.cosmetics.equipped.heroSkins = hs;

  // 图鉴并集
  const eSet = new Set([...a.codex.evolutions, ...b.codex.evolutions]);
  const wSet = new Set([...a.codex.weapons, ...b.codex.weapons, ...eSet]);
  for (const h of merged.unlockedHeroes) if (HERO_START_WEAPON[h]) wSet.add(HERO_START_WEAPON[h]);
  const rSet = new Set([...a.codex.relics, ...b.codex.relics]);
  for (const c of merged.charms) if (RELIC_IDS.includes(c.relicId)) rSet.add(c.relicId);
  const enemies = {};
  for (const k of ENEMY_IDS) {
    const cnt = Math.max(a.codex.enemies[k] || 0, b.codex.enemies[k] || 0);
    if (cnt > 0) enemies[k] = cnt;
  }
  merged.codex = {
    weapons: WEAPON_IDS.filter((w) => wSet.has(w)),
    evolutions: WEAPON_IDS.filter((w) => eSet.has(w)),
    relics: RELIC_IDS.filter((r) => rSet.has(r)),
    enemies,
  };

  // 历史纪录与天榜取更优
  merged.stats = {
    runs: Math.max(a.stats.runs, b.stats.runs),
    clears: Math.max(a.stats.clears, b.stats.clears),
    firstRunDone: a.stats.firstRunDone || b.stats.firstRunDone,
    totalPlaySec: Math.max(a.stats.totalPlaySec, b.stats.totalPlaySec),
    bestTimeSec: Math.max(a.stats.bestTimeSec, b.stats.bestTimeSec),
    bestKills: Math.max(a.stats.bestKills, b.stats.bestKills),
    bestHit: Math.max(a.stats.bestHit, b.stats.bestHit),
    totalKills: Math.max(a.stats.totalKills, b.stats.totalKills),
    totalCoins: Math.max(a.stats.totalCoins, b.stats.totalCoins),
    totalEvolutions: Math.max(a.stats.totalEvolutions, b.stats.totalEvolutions),
    totalBossKills: Math.max(a.stats.totalBossKills, b.stats.totalBossKills),
    coopRuns: Math.max(a.stats.coopRuns, b.stats.coopRuns),
    coopRevives: Math.max(a.stats.coopRevives, b.stats.coopRevives),
  };

  const coachSeen = {};
  for (const k of COACH_KEYS) {
    if (a.coach?.seen?.[k] || b.coach?.seen?.[k]) coachSeen[k] = true;
  }
  merged.coach = {
    seen: coachSeen,
    runsPlayed: Math.max(a.coach?.runsPlayed || 0, b.coach?.runsPlayed || 0, merged.stats.runs),
  };

  const histMap = new Map();
  for (const item of [...a.leaderboard.history, ...b.leaderboard.history]) {
    const key = `${item.score}|${item.heroId}|${item.at}`;
    if (!histMap.has(key)) histMap.set(key, item);
  }
  merged.leaderboard = {
    bestScore: Math.max(a.leaderboard.bestScore, b.leaderboard.bestScore),
    bestEndlessSec: Math.max(a.leaderboard.bestEndlessSec, b.leaderboard.bestEndlessSec),
    bestKills: Math.max(a.leaderboard.bestKills, b.leaderboard.bestKills, merged.stats.bestKills),
    pendingScore: Math.max(a.leaderboard.pendingScore, b.leaderboard.pendingScore),
    history: sanitizeLeaderboardHistory([...histMap.values()]),
  };

  return merged;
}

function getStorage(storage) {
  if (storage) return storage;
  try { return globalThis.localStorage ?? null; } catch { return null; }
}

/** 读档：任何异常（无 localStorage、JSON 损坏、隐私模式）都回落到默认存档。 */
export function loadSave(storage) {
  const st = getStorage(storage);
  if (!st) return defaultSave();
  let text = null;
  try { text = st.getItem(SAVE_KEY); } catch { return defaultSave(); }
  if (!text) return defaultSave();
  let raw = null;
  try { raw = JSON.parse(text); } catch { raw = null; }
  if (raw === null) {
    try { st.setItem(SAVE_KEY + '.broken', text); } catch {}
    return defaultSave();
  }
  return migrateSave(raw);
}

/** 写档：返回是否成功（存储满或被禁用时为 false，游戏照常进行）。 */
export function saveSave(save, storage, now = Date.now()) {
  if (!isPlainObj(save)) return false;
  try {
    const prevTs = int(save.updatedAt, 0, 0, 9e15);
    const nowTs = int(now, 0, 0, 9e15);
    const nextTs = Math.max(prevTs, nowTs);
    if (canWriteProp(save, 'updatedAt')) {
      try { save.updatedAt = nextTs; } catch {}
    }
    const st = getStorage(storage);
    if (!st || typeof st.setItem !== 'function') return false;
    const clean = migrateSave(save);
    clean.updatedAt = nextTs;
    st.setItem(SAVE_KEY, JSON.stringify({ ...clean, version: SAVE_VERSION }));
    return true;
  } catch {
    return false;
  }
}

/** 记一次成就（只记首次时间）。返回是否为新达成。 */
export function markAchievement(save, id, ts = 1) {
  if (!canMutateObj(save) || typeof id !== 'string' || !id || id.length >= 40 || FORBIDDEN_KEYS.has(id)) return false;
  if (isPlainObj(save.achievements)) {
    if (save.achievements[id]) return false;
    if (!canWriteProp(save.achievements, id)) return false;
  } else {
    if (!canWriteProp(save, 'achievements')) return false;
    save.achievements = {};
  }
  const n = toFiniteNumber(ts);
  const stamp = Number.isFinite(n) && n > 0 ? Math.min(9e15, Math.max(1, Math.floor(n))) : 1;
  try {
    save.achievements[id] = stamp;
    return true;
  } catch {
    return false;
  }
}
