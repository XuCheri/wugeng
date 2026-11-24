// 百物图鉴数据记录与聚合（纯存档逻辑，不碰 DOM）。
import {
  HERO_IDS, HERO_START_WEAPON, WEAPON_IDS, RELIC_IDS, ENEMY_IDS, defaultCodex, toFiniteNumber,
  isPlainObj, canMutateObj, canWriteProp, canMutateArray,
} from './save.js';

function toPosInt(v, max = 1e9) {
  const n = toFiniteNumber(v);
  return Number.isFinite(n) && n > 0 ? Math.min(max, Math.floor(n)) : 0;
}

function canMutateEnemiesMap(enemies) {
  if (!canMutateObj(enemies) || !Object.isExtensible(enemies)) return false;
  for (const k of ENEMY_IDS) {
    const d = Object.getOwnPropertyDescriptor(enemies, k);
    if (d && (d.writable !== true || d.configurable !== true)) return false;
  }
  return true;
}

export function canMutateCodex(save) {
  if (!canMutateObj(save)) return false;
  if (!isPlainObj(save.codex)) return canWriteProp(save, 'codex');
  const c = save.codex;
  if (!canMutateObj(c)) return false;
  if (Array.isArray(c.weapons) ? !canMutateArray(c.weapons) : !canWriteProp(c, 'weapons')) return false;
  if (Array.isArray(c.evolutions) ? !canMutateArray(c.evolutions) : !canWriteProp(c, 'evolutions')) return false;
  if (Array.isArray(c.relics) ? !canMutateArray(c.relics) : !canWriteProp(c, 'relics')) return false;
  if (isPlainObj(c.enemies) ? !canMutateEnemiesMap(c.enemies) : !canWriteProp(c, 'enemies')) return false;
  return true;
}

function readNormalizedCodex(save) {
  const raw = isPlainObj(save) && isPlainObj(save.codex) ? save.codex : null;
  if (!raw) return defaultCodex();
  const weapons = Array.isArray(raw.weapons)
    ? WEAPON_IDS.filter((w) => raw.weapons.includes(w))
    : ['gong'];
  const evolutions = Array.isArray(raw.evolutions)
    ? WEAPON_IDS.filter((w) => raw.evolutions.includes(w))
    : [];
  const relics = Array.isArray(raw.relics)
    ? RELIC_IDS.filter((r) => raw.relics.includes(r))
    : [];
  const enemies = {};
  if (isPlainObj(raw.enemies)) {
    for (const e of ENEMY_IDS) {
      const cnt = toPosInt(raw.enemies[e], 1e9);
      if (cnt > 0) enemies[e] = cnt;
    }
  }
  return { weapons, evolutions, relics, enemies };
}

export function ensureCodex(save) {
  if (!canMutateCodex(save)) return readNormalizedCodex(save);
  if (!isPlainObj(save.codex)) save.codex = defaultCodex();
  if (!Array.isArray(save.codex.weapons)) save.codex.weapons = ['gong'];
  if (!Array.isArray(save.codex.evolutions)) save.codex.evolutions = [];
  if (!Array.isArray(save.codex.relics)) save.codex.relics = [];
  if (!isPlainObj(save.codex.enemies)) {
    save.codex.enemies = {};
  }
  return save.codex;
}

function addUnique(arr, id, validList) {
  if (!validList.includes(id)) return false;
  if (arr.includes(id)) return false;
  arr.push(id);
  return true;
}

/** 局内实时同步已拿到的兵刃、开光神兵与法器（不累加击杀数，击杀在结算时一次性累加防重算）。 */
export function syncCodexFromRun(save, run) {
  if (!canMutateCodex(save) || !isPlainObj(run)) return false;
  const c = ensureCodex(save);
  let changed = false;
  const weapons = Array.isArray(run.weapons) ? run.weapons : [];
  for (const w of weapons) {
    if (!isPlainObj(w)) continue;
    if (addUnique(c.weapons, w.id, WEAPON_IDS)) changed = true;
    if (w.evolved && addUnique(c.evolutions, w.id, WEAPON_IDS)) changed = true;
  }
  const relics = Array.isArray(run.relics) ? run.relics : [];
  for (const r of relics) {
    if (!isPlainObj(r)) continue;
    if (addUnique(c.relics, r.id, RELIC_IDS)) changed = true;
  }
  return changed;
}

/** 签到获得护身符时收录对应法器。 */
export function recordCodexCharms(save, charms) {
  if (!canMutateCodex(save) || !Array.isArray(charms)) return false;
  const c = ensureCodex(save);
  let changed = false;
  for (const ch of charms) {
    const id = typeof ch === 'string' ? ch : (isPlainObj(ch) ? ch.relicId : null);
    if (addUnique(c.relics, id, RELIC_IDS)) changed = true;
  }
  return changed;
}

/** 一局结束时把本局兵刃、开光、法器与击杀的邪祟计入图鉴。 */
export function recordCodexSummary(save, summary) {
  if (!canMutateCodex(save) || !isPlainObj(summary)) return false;
  const c = ensureCodex(save);
  const unlockedHeroes = Array.isArray(save.unlockedHeroes) ? save.unlockedHeroes : [];
  for (const h of unlockedHeroes) {
    if (HERO_START_WEAPON[h]) addUnique(c.weapons, HERO_START_WEAPON[h], WEAPON_IDS);
  }
  const weapons = Array.isArray(summary.weapons) ? summary.weapons : [];
  for (const w of weapons) {
    if (!isPlainObj(w)) continue;
    addUnique(c.weapons, w.id, WEAPON_IDS);
    if (w.evolved) addUnique(c.evolutions, w.id, WEAPON_IDS);
  }
  const relics = Array.isArray(summary.relics) ? summary.relics : [];
  for (const r of relics) {
    if (!isPlainObj(r)) continue;
    addUnique(c.relics, r.id, RELIC_IDS);
  }
  const byType = isPlainObj(summary.killsByType) ? summary.killsByType : {};
  for (const k of ENEMY_IDS) {
    const prev = toPosInt(c.enemies[k], 1e9);
    const n = toPosInt(byType[k], 1e9);
    if (n > 0) {
      c.enemies[k] = Math.min(1e9, prev + n);
    } else if (prev > 0) {
      c.enemies[k] = prev;
    } else if (Object.prototype.hasOwnProperty.call(c.enemies, k)) {
      delete c.enemies[k];
    }
  }
  return true;
}

/** 统计图鉴整体收集进度（百物核心 16 兵刃 + 16 开光 + 16 法器 + 12 百鬼 = 60 项；另含打更人 6 项，总计 66 项）。 */
export function getCodexCounts(save) {
  const rawCodex = isPlainObj(save) && isPlainObj(save.codex) ? save.codex : null;
  const heroList = isPlainObj(save) && Array.isArray(save.unlockedHeroes) ? save.unlockedHeroes : [];
  const weaponList = rawCodex && Array.isArray(rawCodex.weapons) ? rawCodex.weapons : ['gong'];
  const evoList = rawCodex && Array.isArray(rawCodex.evolutions) ? rawCodex.evolutions : [];
  const relicList = rawCodex && Array.isArray(rawCodex.relics) ? rawCodex.relics : [];
  const enemyMap = rawCodex && isPlainObj(rawCodex.enemies) ? rawCodex.enemies : null;

  const heroes = HERO_IDS.filter((h) => heroList.includes(h)).length;
  const weapons = WEAPON_IDS.filter((w) => weaponList.includes(w)).length;
  const evolutions = WEAPON_IDS.filter((w) => evoList.includes(w)).length;
  const relics = RELIC_IDS.filter((r) => relicList.includes(r)).length;
  const enemies = enemyMap ? ENEMY_IDS.filter((e) => toPosInt(enemyMap[e], 1e9) > 0).length : 0;
  const coreHave = weapons + evolutions + relics + enemies;
  const coreTotal = WEAPON_IDS.length * 2 + RELIC_IDS.length + ENEMY_IDS.length;
  const have = heroes + coreHave;
  const total = HERO_IDS.length + coreTotal;
  return {
    have,
    total,
    coreHave,
    coreTotal,
    heroes: { have: heroes, total: HERO_IDS.length },
    weapons: { have: weapons, total: WEAPON_IDS.length },
    evolutions: { have: evolutions, total: WEAPON_IDS.length },
    relics: { have: relics, total: RELIC_IDS.length },
    enemies: { have: enemies, total: ENEMY_IDS.length },
  };
}
