// 解锁与结算入账（PLAN §4.7 + v3 六角色）。
// - 阿绵：单局打败 ≥ 800 只敌人
// - 小道童：一个包子都不吃，守到五更（撑到 8:00 = 480 秒）
// - 沈观星：单局敕封开光 ≥ 2 把神兵
// - 石敢当：累计打败 ≥ 2500 只敌人
// - 柳青衣：单局激活任意流派 6 件羁绊
// - 夜色 N+1：通关夜色 N
import {
  HERO_IDS, NIGHT_MAX, markAchievement, toFiniteNumber,
  isPlainObj, canMutateObj, canWriteProp, canMutateArray,
} from './save.js';
import { recordCodexSummary, canMutateCodex } from './codex.js';
import { WEAPONS, RELICS, SCHOOL_TAG_IDS } from '../sim/balance.js';

export const MIAN_KILLS = 800;
export const DAOTONG_TIME = 480;
export const YINYANG_EVOLVES = 2;
export const TIEJIANG_TOTAL_KILLS = 2500;
export const NUOXI_SYNERGY_TIER = 6;

const STAT_KEYS = [
  'runs', 'clears', 'firstRunDone', 'totalPlaySec',
  'bestTimeSec', 'bestKills', 'bestHit', 'totalKills', 'totalCoins',
];
const ACH_KEYS = ['firstClear', 'kills800', 'noBun480', 'endless10', 'hit10k', 'hit100m', 'night10'];

const safeNum = (v, max = 1e15) => {
  const n = toFiniteNumber(v);
  return Number.isFinite(n) && n > 0 ? Math.min(max, n) : 0;
};
const safeInt = (v, max = 1e12) => Math.floor(safeNum(v, max));

function canMutateUnlockSave(save) {
  if (!canMutateObj(save)) return false;
  if (
    !canWriteProp(save, 'coins')
    || !canWriteProp(save, 'nightCleared')
    || !canWriteProp(save, 'nightUnlocked')
    || !canWriteProp(save, 'unlockedHeroes')
  ) {
    return false;
  }
  if (Array.isArray(save.unlockedHeroes) && !canMutateArray(save.unlockedHeroes)) return false;

  if (isPlainObj(save.stats)) {
    if (!canMutateObj(save.stats)) return false;
    for (const k of STAT_KEYS) {
      if (!canWriteProp(save.stats, k)) return false;
    }
  } else if (!canWriteProp(save, 'stats')) {
    return false;
  }

  if (isPlainObj(save.achievements)) {
    if (!canMutateObj(save.achievements)) return false;
    for (const k of ACH_KEYS) {
      if (!save.achievements[k] && !canWriteProp(save.achievements, k)) return false;
    }
  } else if (!canWriteProp(save, 'achievements')) {
    return false;
  }

  if (!canMutateCodex(save)) return false;
  return true;
}

function ensureUnlockSave(save) {
  const c = toFiniteNumber(save.coins);
  save.coins = Number.isFinite(c) && c >= 0 ? Math.min(1e12, Math.floor(c)) : 0;

  if (!Array.isArray(save.unlockedHeroes)) {
    save.unlockedHeroes = ['zhou'];
  } else {
    save.unlockedHeroes = save.unlockedHeroes.filter((h) => HERO_IDS.includes(h));
    if (!save.unlockedHeroes.includes('zhou')) save.unlockedHeroes.unshift('zhou');
  }

  const nc = toFiniteNumber(save.nightCleared);
  save.nightCleared = Number.isFinite(nc) ? Math.max(-1, Math.min(NIGHT_MAX, Math.floor(nc))) : -1;

  const nu = toFiniteNumber(save.nightUnlocked);
  save.nightUnlocked = Math.max(
    Number.isFinite(nu) ? Math.max(0, Math.min(NIGHT_MAX, Math.floor(nu))) : 0,
    Math.min(NIGHT_MAX, save.nightCleared + 1),
  );

  if (!isPlainObj(save.stats)) save.stats = {};
  const st = save.stats;
  st.runs = safeInt(st.runs, 1e9);
  st.clears = safeInt(st.clears, 1e9);
  st.firstRunDone = typeof st.firstRunDone === 'boolean' ? st.firstRunDone : st.runs > 0;
  st.totalPlaySec = safeNum(st.totalPlaySec, 1e12);
  st.bestTimeSec = safeNum(st.bestTimeSec, 1e12);
  st.bestKills = safeInt(st.bestKills, 1e12);
  st.bestHit = safeNum(st.bestHit, 1e15);
  st.totalKills = safeInt(st.totalKills, 1e12);
  st.totalCoins = safeInt(st.totalCoins, 1e12);

  if (!isPlainObj(save.achievements)) save.achievements = {};
}

/**
 * 小道童条件：撑到 480 秒，且 480 秒前没吃过包子。
 * 优先看 summary.firstBunTime（null = 一个没吃）；字段缺失时回退 bunsEaten === 0。
 */
export function isNoBunDawn(summary) {
  if (!isPlainObj(summary) || safeNum(summary.timeSec) < DAOTONG_TIME) return false;
  if (Object.prototype.hasOwnProperty.call(summary, 'firstBunTime') && summary.firstBunTime !== undefined) {
    const t = summary.firstBunTime;
    if (t === null) return true;
    const tn = toFiniteNumber(t);
    return Number.isFinite(tn) && tn >= DAOTONG_TIME;
  }
  const buns = summary.bunsEaten === undefined ? 0 : toFiniteNumber(summary.bunsEaten);
  return Number.isFinite(buns) && buns >= 0 && Math.floor(buns) === 0;
}

function summaryEvolvedCount(summary) {
  let fromArr = 0;
  if (Array.isArray(summary.weapons)) {
    for (const w of summary.weapons) {
      if (isPlainObj(w) && w.evolved === true) fromArr++;
    }
  }
  return Math.max(safeInt(summary.evolvedCount, 99), fromArr);
}

function maxTagCountFromSummary(summary) {
  const counts = { zhenhun: 0, daofa: 0, zhizha: 0, yangyan: 0 };
  if (Array.isArray(summary.weapons)) {
    const seenW = new Set();
    for (const w of summary.weapons) {
      const id = isPlainObj(w) ? w.id : null;
      if (!id || seenW.has(id) || !WEAPONS[id]) continue;
      seenW.add(id);
      for (const t of WEAPONS[id].tags || []) if (counts[t] !== undefined) counts[t]++;
    }
  }
  if (Array.isArray(summary.relics)) {
    const seenR = new Set();
    for (const r of summary.relics) {
      const id = isPlainObj(r) ? r.id : null;
      if (!id || seenR.has(id) || !RELICS[id]) continue;
      seenR.add(id);
      for (const t of RELICS[id].tags || []) if (counts[t] !== undefined) counts[t]++;
    }
  }
  let best = 0;
  for (const t of SCHOOL_TAG_IDS) if (counts[t] > best) best = counts[t];
  return best;
}

function summaryMaxSynergy(summary) {
  return Math.max(safeInt(summary.maxSynergyTier, 99), maxTagCountFromSummary(summary));
}

/** 判定并写入 save，返回本次新解锁的列表 [{ kind: 'hero'|'night', id }]。 */
export function evaluateUnlocks(save, summary) {
  const out = [];
  if (!canMutateUnlockSave(save) || !isPlainObj(summary)) return out;
  ensureUnlockSave(save);
  const unlockHero = (id) => {
    if (!save.unlockedHeroes.includes(id)) {
      save.unlockedHeroes.push(id);
      out.push({ kind: 'hero', id });
    }
  };
  if (safeInt(summary.kills) >= MIAN_KILLS) unlockHero('mian');
  if (isNoBunDawn(summary)) unlockHero('daotong');
  if (summaryEvolvedCount(summary) >= YINYANG_EVOLVES) unlockHero('yinyang');
  if (Math.max(safeInt(save.stats?.totalKills), safeInt(summary.kills)) >= TIEJIANG_TOTAL_KILLS) unlockHero('tiejiang');
  if (summaryMaxSynergy(summary) >= NUOXI_SYNERGY_TIER) unlockHero('nuoxi');

  if (summary.cleared) {
    const rawNight = toFiniteNumber(summary.nightLevel);
    const n = Number.isFinite(rawNight) ? Math.max(0, Math.min(NIGHT_MAX, Math.floor(rawNight))) : 0;
    if (n > save.nightCleared) save.nightCleared = n;
    const next = Math.min(NIGHT_MAX, n + 1);
    if (next > save.nightUnlocked) {
      save.nightUnlocked = next;
      out.push({ kind: 'night', id: next });
    }
  }
  return out;
}

/** 解锁条件说明（英雄选择界面给未解锁英雄看）。 */
export function heroUnlockProgress(save, heroId) {
  const s = isPlainObj(save) && isPlainObj(save.stats) ? save.stats : {};
  if (heroId === 'mian') return { have: Math.min(MIAN_KILLS, safeInt(s.bestKills, MIAN_KILLS)), need: MIAN_KILLS };
  if (heroId === 'tiejiang') return { have: Math.min(TIEJIANG_TOTAL_KILLS, safeInt(s.totalKills, TIEJIANG_TOTAL_KILLS)), need: TIEJIANG_TOTAL_KILLS };
  return null;
}

/**
 * 一局结束入账：加铜钱、记统计、判解锁、记成就、同步图鉴。调用方负责 saveSave。
 * 返回 { coins, unlocks, achievements: [id] }
 */
export function recordRun(save, summary, now = Date.now()) {
  if (!canMutateUnlockSave(save)) return { coins: 0, unlocks: [], achievements: [] };
  ensureUnlockSave(save);
  const sum = isPlainObj(summary) ? summary : {};
  const coins = safeInt(sum.coins, 1e12);
  const timeSec = safeNum(sum.timeSec, 1e12);
  const kills = safeInt(sum.kills, 1e12);
  const maxHit = safeNum(sum.maxHit, 1e15);
  save.coins = Math.min(1e12, save.coins + coins);
  const st = save.stats;
  st.runs = Math.min(1e9, st.runs + 1);
  st.firstRunDone = true;
  st.totalPlaySec = Math.min(1e12, st.totalPlaySec + timeSec);
  st.totalKills = Math.min(1e12, st.totalKills + kills);
  st.totalCoins = Math.min(1e12, st.totalCoins + coins);
  st.bestTimeSec = Math.max(st.bestTimeSec, timeSec);
  st.bestKills = Math.max(st.bestKills, kills);
  st.bestHit = Math.max(st.bestHit, maxHit);
  if (sum.cleared) st.clears = Math.min(1e9, st.clears + 1);

  const unlocks = evaluateUnlocks(save, sum);
  recordCodexSummary(save, sum);

  const achievements = [];
  const ach = (id, cond) => { if (cond && markAchievement(save, id, now)) achievements.push(id); };
  ach('firstClear', Boolean(sum.cleared));
  ach('kills800', kills >= MIAN_KILLS);
  ach('noBun480', isNoBunDawn(sum));
  ach('endless10', sum.mode === 'endless' && timeSec >= 1200);
  ach('hit10k', maxHit >= 1e4);
  ach('hit100m', maxHit >= 1e8);
  ach('night10', Boolean(sum.cleared) && safeInt(sum.nightLevel, NIGHT_MAX) >= NIGHT_MAX);
  return { coins, unlocks, achievements };
}

/** 结算页「广告 · 铜钱翻倍」：再给一份本局铜钱。 */
export function grantDoubleCoins(save, amount) {
  if (!canMutateUnlockSave(save)) return 0;
  ensureUnlockSave(save);
  const add = safeInt(amount, 1e12);
  save.coins = Math.min(1e12, save.coins + add);
  save.stats.totalCoins = Math.min(1e12, save.stats.totalCoins + add);
  return add;
}
