// 本地存档：带版本号，读档时一律走 migrateSave 修补，坏档不崩。
// 只存本机 localStorage，不联网。

export const SAVE_KEY = 'wugeng.save';
export const SAVE_VERSION = 1;

export const HERO_IDS = ['zhou', 'mian', 'daotong', 'yinyang', 'tiejiang', 'nuoxi'];
export const HERO_START_WEAPON = {
  zhou: 'gong',
  mian: 'paperman',
  daotong: 'talisman',
  yinyang: 'compass',
  tiejiang: 'suohun_chain',
  nuoxi: 'nuo_drum',
};
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

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export function defaultSettings() {
  return { sfx: true, music: true, shake: true, dmgText: 'all', lowQuality: false };
}

export function defaultCodex() {
  return {
    weapons: ['gong'],
    evolutions: [],
    relics: [],
    enemies: {},
  };
}

export function defaultSave() {
  const shop = {};
  for (const id of SHOP_IDS) shop[id] = 0;
  return {
    version: SAVE_VERSION,
    updatedAt: 0,
    coins: 0,
    shop,
    unlockedHeroes: ['zhou'],
    selectedHero: 'zhou',
    nightUnlocked: 0,     // 可选的最高夜色（0 = 寻常夜）
    nightCleared: -1,     // 已通关的最高夜色，-1 = 从未通关
    selectedNight: 0,
    achievements: {},     // { id: 首次达成的时间戳 }
    codex: defaultCodex(),
    settings: defaultSettings(),
    checkin: { cycleDay: 0, lastClaimDate: null, cycles: 0, totalClaims: 0 },
    cosmetics: { owned: [], equipped: { lantern: null, outfit: null } },
    charms: [],           // 护身符：[{ relicId }]，开局带一枚，用掉即消耗
    stats: {
      runs: 0, clears: 0, firstRunDone: false, totalPlaySec: 0,
      bestTimeSec: 0, bestKills: 0, bestHit: 0, totalKills: 0, totalCoins: 0,
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

/**
 * 把任意来源（旧版本、手改、半截损坏）的数据修补成当前版本的合法存档。
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

  if (isObj(src.settings)) {
    const s = src.settings;
    out.settings.sfx = bool(s.sfx, true);
    out.settings.music = bool(s.music, true);
    out.settings.shake = bool(s.shake, true);
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

  if (isObj(src.cosmetics)) {
    const owned = Array.isArray(src.cosmetics.owned)
      ? [...new Set(src.cosmetics.owned.filter((x) => typeof x === 'string' && x.length > 0 && x.length < 40 && !FORBIDDEN_KEYS.has(x)))]
      : [];
    out.cosmetics.owned = owned;
    const eq = isObj(src.cosmetics.equipped) ? src.cosmetics.equipped : {};
    for (const slot of ['lantern', 'outfit']) {
      out.cosmetics.equipped[slot] = owned.includes(eq[slot]) ? eq[slot] : null;
    }
    if (eq.attackVfx !== undefined) {
      if (eq.attackVfx === null) {
        out.cosmetics.equipped.attackVfx = null;
      } else if (eq.attackVfx === 'default' || (typeof eq.attackVfx === 'string' && owned.includes(eq.attackVfx))) {
        out.cosmetics.equipped.attackVfx = eq.attackVfx;
      } else {
        out.cosmetics.equipped.attackVfx = 'default';
      }
    }
    if (isObj(eq.heroSkins)) {
      const hs = {};
      for (const h of HERO_IDS) {
        const sid = eq.heroSkins[h];
        if (typeof sid === 'string' && sid.length > 0 && sid.length < 40 && !FORBIDDEN_KEYS.has(sid)) {
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
  return int(s.stats?.runs, 0, 0, 1e9) === 0
    && int(s.coins, 0, 0, 1e12) === 0
    && shopSpent(s.shop) === 0
    && int(s.checkin?.totalClaims, 0, 0, 1e9) === 0
    && onlyDefaultHero
    && (Array.isArray(s.charms) ? s.charms.length : 0) === 0
    && int(s.nightUnlocked, 0, 0, NIGHT_MAX) === 0
    && int(s.nightCleared, -1, -1, NIGHT_MAX) < 0
    && (isObj(s.achievements) ? Object.keys(s.achievements).length : 0) === 0
    && (Array.isArray(s.cosmetics?.owned) ? s.cosmetics.owned.length : 0) === 0
    && onlyDefaultWeapon
    && (Array.isArray(s.codex?.evolutions) ? s.codex.evolutions.length : 0) === 0
    && (Array.isArray(s.codex?.relics) ? s.codex.relics.length : 0) === 0
    && (isObj(s.codex?.enemies) ? Object.keys(s.codex.enemies).length : 0) === 0;
}

function saveProgressScore(s) {
  return (s.coins || 0)
    + shopSpent(s.shop)
    + (s.stats?.clears || 0) * 500
    + (s.stats?.runs || 0) * 25
    + (s.checkin?.totalClaims || 0) * 60
    + Math.floor(s.stats?.totalPlaySec || 0);
}

/**
 * 合并本机存档与云端存档：
 * - 铜钱/加点/签到/护身符等可消费资产整包取更新（或进度更高）的一方，防止双端刷钱；
 * - 英雄解锁、最高夜色、成就、外观、图鉴收集与历史最高纪录取并集/最大值，绝不丢收集进度。
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

  // 永久解锁并集
  const heroSet = new Set([...a.unlockedHeroes, ...b.unlockedHeroes]);
  merged.unlockedHeroes = HERO_IDS.filter((h) => heroSet.has(h));
  if (!merged.unlockedHeroes.includes(merged.selectedHero)) merged.selectedHero = 'zhou';

  merged.nightCleared = Math.max(a.nightCleared, b.nightCleared);
  merged.nightUnlocked = Math.max(a.nightUnlocked, b.nightUnlocked, Math.min(NIGHT_MAX, merged.nightCleared + 1));
  merged.selectedNight = Math.min(merged.selectedNight, merged.nightUnlocked);

  // 成就（保留最早达成时间）
  for (const [k, v] of Object.entries(secondary.achievements)) {
    if (FORBIDDEN_KEYS.has(k) || !(v > 0)) continue;
    if (!merged.achievements[k] || v < merged.achievements[k]) merged.achievements[k] = v;
  }

  // 外观并集
  merged.cosmetics.owned = [...new Set([...a.cosmetics.owned, ...b.cosmetics.owned])];
  for (const slot of ['lantern', 'outfit']) {
    const pick = primary.cosmetics.equipped[slot] || secondary.cosmetics.equipped[slot];
    merged.cosmetics.equipped[slot] = merged.cosmetics.owned.includes(pick) ? pick : null;
  }
  if (primary.cosmetics.equipped.attackVfx !== undefined || secondary.cosmetics.equipped.attackVfx !== undefined) {
    const pickVfx = (primary.cosmetics.equipped.attackVfx && primary.cosmetics.equipped.attackVfx !== 'default'
      ? primary.cosmetics.equipped.attackVfx
      : secondary.cosmetics.equipped.attackVfx) || primary.cosmetics.equipped.attackVfx || 'default';
    merged.cosmetics.equipped.attackVfx = pickVfx === 'default' || merged.cosmetics.owned.includes(pickVfx) ? pickVfx : 'default';
  }
  if (isObj(primary.cosmetics.equipped.heroSkins) || isObj(secondary.cosmetics.equipped.heroSkins)) {
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
  }

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

  // 历史纪录取更优
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
    // 坏档留个备份，方便排查，不覆盖已有备份以外的数据。
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
