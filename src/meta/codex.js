// 百物图鉴数据记录与聚合（纯存档逻辑，不碰 DOM）。
import {
  HERO_IDS, HERO_START_WEAPON, WEAPON_IDS, RELIC_IDS, ENEMY_IDS, defaultCodex,
} from './save.js';

export function ensureCodex(save) {
  if (!save.codex || typeof save.codex !== 'object') save.codex = defaultCodex();
  if (!Array.isArray(save.codex.weapons)) save.codex.weapons = ['gong'];
  if (!Array.isArray(save.codex.evolutions)) save.codex.evolutions = [];
  if (!Array.isArray(save.codex.relics)) save.codex.relics = [];
  if (!save.codex.enemies || typeof save.codex.enemies !== 'object') save.codex.enemies = {};
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
  if (!save || !run) return false;
  const c = ensureCodex(save);
  let changed = false;
  for (const w of run.weapons || []) {
    if (addUnique(c.weapons, w.id, WEAPON_IDS)) changed = true;
    if (w.evolved && addUnique(c.evolutions, w.id, WEAPON_IDS)) changed = true;
  }
  for (const r of run.relics || []) {
    if (addUnique(c.relics, r.id, RELIC_IDS)) changed = true;
  }
  return changed;
}

/** 签到获得护身符时收录对应法器。 */
export function recordCodexCharms(save, charms) {
  if (!save || !Array.isArray(charms)) return false;
  const c = ensureCodex(save);
  let changed = false;
  for (const ch of charms) {
    const id = typeof ch === 'string' ? ch : ch?.relicId;
    if (addUnique(c.relics, id, RELIC_IDS)) changed = true;
  }
  return changed;
}

/** 一局结束时把本局兵刃、开光、法器与击杀的邪祟计入图鉴。 */
export function recordCodexSummary(save, summary) {
  if (!save || !summary) return;
  const c = ensureCodex(save);
  for (const h of save.unlockedHeroes || []) {
    if (HERO_START_WEAPON[h]) addUnique(c.weapons, HERO_START_WEAPON[h], WEAPON_IDS);
  }
  for (const w of summary.weapons || []) {
    addUnique(c.weapons, w.id, WEAPON_IDS);
    if (w.evolved) addUnique(c.evolutions, w.id, WEAPON_IDS);
  }
  for (const r of summary.relics || []) {
    addUnique(c.relics, r.id, RELIC_IDS);
  }
  const byType = summary.killsByType || {};
  for (const k of ENEMY_IDS) {
    const n = Math.max(0, Math.floor(Number(byType[k]) || 0));
    if (n > 0) c.enemies[k] = (c.enemies[k] || 0) + n;
  }
}

/** 统计图鉴整体收集进度（打更人 3 + 兵刃 8 + 开光 8 + 法器 8 + 百鬼 9 = 36 项）。 */
export function getCodexCounts(save) {
  const c = ensureCodex(save);
  const heroes = HERO_IDS.filter((h) => save.unlockedHeroes?.includes(h)).length;
  const weapons = WEAPON_IDS.filter((w) => c.weapons.includes(w)).length;
  const evolutions = WEAPON_IDS.filter((w) => c.evolutions.includes(w)).length;
  const relics = RELIC_IDS.filter((r) => c.relics.includes(r)).length;
  const enemies = ENEMY_IDS.filter((e) => (c.enemies[e] || 0) > 0).length;
  const have = heroes + weapons + evolutions + relics + enemies;
  const total = HERO_IDS.length + WEAPON_IDS.length * 2 + RELIC_IDS.length + ENEMY_IDS.length;
  return {
    have,
    total,
    heroes: { have: heroes, total: HERO_IDS.length },
    weapons: { have: weapons, total: WEAPON_IDS.length },
    evolutions: { have: evolutions, total: WEAPON_IDS.length },
    relics: { have: relics, total: RELIC_IDS.length },
    enemies: { have: enemies, total: ENEMY_IDS.length },
  };
}
