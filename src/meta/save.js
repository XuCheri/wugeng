// 本地存档：带版本号，读档时一律走 migrateSave 修补，坏档不崩。
// 只存本机 localStorage，不联网。

export const SAVE_KEY = 'wugeng.save';
export const SAVE_VERSION = 1;

export const HERO_IDS = ['zhou', 'mian', 'daotong'];
export const SHOP_IDS = ['tizhi', 'lidao', 'jiaoli', 'yanli', 'wuxing', 'caiyun', 'jiyuan', 'huchi'];
export const RELIC_IDS = ['clapper', 'censer', 'cinnabar', 'inkstone', 'bagua', 'scissors', 'tinder', 'redstring'];
export const NIGHT_MAX = 10;
export const SHOP_MAX_LEVEL = 5;
export const DMG_TEXT_MODES = ['all', 'crit', 'off'];

export function defaultSettings() {
  return { sfx: true, music: true, shake: true, dmgText: 'all', lowQuality: false };
}

export function defaultSave() {
  const shop = {};
  for (const id of SHOP_IDS) shop[id] = 0;
  return {
    version: SAVE_VERSION,
    coins: 0,
    shop,
    unlockedHeroes: ['zhou'],
    selectedHero: 'zhou',
    nightUnlocked: 0,     // 可选的最高夜色（0 = 寻常夜）
    nightCleared: -1,     // 已通关的最高夜色，-1 = 从未通关
    selectedNight: 0,
    achievements: {},     // { id: 首次达成的时间戳 }
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

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const int = (v, def, min = -Infinity, max = Infinity) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, Math.floor(n)));
};
const num = (v, def, min = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(min, n) : def;
};
const bool = (v, def) => (typeof v === 'boolean' ? v : def);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

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
      if (typeof k === 'string' && k.length < 40 && (typeof v === 'number' || v === true)) {
        out.achievements[k] = v === true ? 1 : v;
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
    out.checkin.lastClaimDate = typeof c.lastClaimDate === 'string' && DATE_RE.test(c.lastClaimDate)
      ? c.lastClaimDate : null;
    out.checkin.cycles = int(c.cycles, 0, 0);
    out.checkin.totalClaims = int(c.totalClaims, 0, 0);
  }

  if (isObj(src.cosmetics)) {
    const owned = Array.isArray(src.cosmetics.owned)
      ? [...new Set(src.cosmetics.owned.filter((x) => typeof x === 'string' && x.length < 40))]
      : [];
    out.cosmetics.owned = owned;
    const eq = isObj(src.cosmetics.equipped) ? src.cosmetics.equipped : {};
    for (const slot of ['lantern', 'outfit']) {
      out.cosmetics.equipped[slot] = owned.includes(eq[slot]) ? eq[slot] : null;
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
    out.stats.runs = int(s.runs, 0, 0);
    out.stats.clears = int(s.clears, 0, 0);
    out.stats.firstRunDone = bool(s.firstRunDone, out.stats.runs > 0);
    out.stats.totalPlaySec = num(s.totalPlaySec, 0);
    out.stats.bestTimeSec = num(s.bestTimeSec, 0);
    out.stats.bestKills = int(s.bestKills, 0, 0);
    out.stats.bestHit = num(s.bestHit, 0);
    out.stats.totalKills = int(s.totalKills, 0, 0);
    out.stats.totalCoins = int(s.totalCoins, 0, 0);
  }

  out.version = SAVE_VERSION;
  return out;
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
export function saveSave(save, storage) {
  const st = getStorage(storage);
  if (!st) return false;
  try {
    st.setItem(SAVE_KEY, JSON.stringify({ ...save, version: SAVE_VERSION }));
    return true;
  } catch {
    return false;
  }
}

/** 记一次成就（只记首次时间）。返回是否为新达成。 */
export function markAchievement(save, id, ts = 1) {
  if (save.achievements[id]) return false;
  save.achievements[id] = ts;
  return true;
}
