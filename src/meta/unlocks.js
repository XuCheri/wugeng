// 解锁与结算入账（PLAN §4.7 + v3 六角色、累计神兵/夜主/联机统计、天榜最高分与 20 项功绩同步）。
// - 阿绵：单局打败 ≥ 800 只敌人
// - 小道童：一个包子都不吃，守到五更（撑到 8:00 = 480 秒）
// - 沈观星：单局敕封开光 ≥ 2 把神兵
// - 石敢当：累计打败 ≥ 2500 只敌人
// - 柳青衣：单局激活任意流派 6 件羁绊
// - 夜色 N+1：通关夜色 N
import {
  DEFAULT_DAO_NAME, DEFAULT_UNLOCKED_WEAPONS, HERO_IDS, HERO_START_WEAPON, NIGHT_MAX, WEAPON_IDS,
  markAchievement, sanitizeDaoName, toFiniteNumber,
  isPlainObj, canMutateObj, canWriteProp, canMutateArray,
} from './save.js';
import { recordCodexSummary, canMutateCodex } from './codex.js';
import { ACHIEVEMENT_IDS, reconcileAchievements } from './achievements.js';
import { WEAPONS, RELICS, SCHOOL_TAG_IDS, MAIN_DURATION, WATCH5_TIME } from '../sim/balance.js';

export const MIAN_KILLS = 800;
export const DAOTONG_TIME = WATCH5_TIME;
export const YINYANG_EVOLVES = 2;
export const TIEJIANG_TOTAL_KILLS = 2500;
export const NUOXI_SYNERGY_TIER = 6;

const STAT_KEYS = [
  'runs', 'clears', 'firstRunDone', 'totalPlaySec',
  'bestTimeSec', 'bestKills', 'bestHit', 'totalKills', 'totalCoins',
  'totalEvolutions', 'totalBossKills', 'coopRuns', 'coopRevives',
];

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
    for (const k of ACHIEVEMENT_IDS) {
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
  st.totalEvolutions = safeInt(st.totalEvolutions, 1e9);
  st.totalBossKills = safeInt(st.totalBossKills, 1e9);
  st.coopRuns = safeInt(st.coopRuns, 1e9);
  st.coopRevives = safeInt(st.coopRevives, 1e9);

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

function summaryBossKillCount(summary) {
  let fromMap = 0;
  if (isPlainObj(summary.killsByType)) {
    for (const bid of ['horse', 'umbrella', 'youshen']) {
      fromMap += safeInt(summary.killsByType[bid], 1e6);
    }
  }
  return Math.max(safeInt(summary.bossKills, 1e6), fromMap);
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

function syncUnlockedHeroSignatureWeapons(save) {
  if (Array.isArray(save.unlockedWeapons) && canMutateArray(save.unlockedWeapons)) {
    for (const h of save.unlockedHeroes) {
      const sig = HERO_START_WEAPON[h];
      if (sig && WEAPON_IDS.includes(sig) && !save.unlockedWeapons.includes(sig)) {
        save.unlockedWeapons.push(sig);
      }
    }
  } else if (save.unlockedWeapons === undefined && canWriteProp(save, 'unlockedWeapons')) {
    const set = new Set(DEFAULT_UNLOCKED_WEAPONS);
    for (const h of save.unlockedHeroes) {
      if (HERO_START_WEAPON[h]) set.add(HERO_START_WEAPON[h]);
    }
    save.unlockedWeapons = WEAPON_IDS.filter((w) => set.has(w));
  }
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
  syncUnlockedHeroSignatureWeapons(save);

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

function recordLeaderboardEntry(save, sum, now) {
  if (!canMutateObj(save)) return;
  if (!isPlainObj(save.leaderboard)) {
    if (!canWriteProp(save, 'leaderboard')) return;
    save.leaderboard = { bestScore: 0, bestEndlessSec: 0, bestKills: 0, pendingScore: 0, history: [] };
  }
  const lb = save.leaderboard;
  if (!canMutateObj(lb)) return;
  const score = safeInt(sum.score, 1e12);
  const kills = safeInt(sum.kills, 1e9);
  const timeSec = Math.floor(safeNum(sum.timeSec, 1e9));
  if (canWriteProp(lb, 'bestScore')) lb.bestScore = Math.max(safeInt(lb.bestScore, 1e12), score);
  if (canWriteProp(lb, 'bestKills')) lb.bestKills = Math.max(safeInt(lb.bestKills, 1e12), kills);
  if (sum.mode === 'endless' && canWriteProp(lb, 'bestEndlessSec')) {
    lb.bestEndlessSec = Math.max(safeInt(lb.bestEndlessSec, 1e9), Math.max(0, timeSec - MAIN_DURATION));
  }
  if (!Array.isArray(lb.history) && canWriteProp(lb, 'history')) lb.history = [];
  if (Array.isArray(lb.history) && canMutateArray(lb.history)) {
    const stampRaw = toFiniteNumber(now);
    const at = Number.isFinite(stampRaw) && stampRaw > 0 ? Math.min(9e15, Math.floor(stampRaw)) : 1;
    lb.history.push({
      score,
      heroId: HERO_IDS.includes(sum.heroId) ? sum.heroId : 'zhou',
      daoName: sanitizeDaoName(save.daoName || DEFAULT_DAO_NAME),
      nightLevel: Math.min(NIGHT_MAX, safeInt(sum.nightLevel, NIGHT_MAX)),
      kills,
      timeSec,
      cleared: Boolean(sum.cleared),
      at,
    });
    lb.history.sort((a, b) => (b.score - a.score) || (b.at - a.at));
    if (lb.history.length > 20) lb.history.length = 20;
  }
}

/**
 * 一局结束入账：加铜钱、记统计、判解锁、记成就、同步图鉴与本地天榜。调用方负责 saveSave。
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
  const evoCount = summaryEvolvedCount(sum);
  const bossKills = summaryBossKillCount(sum);
  const coopSize = safeInt(sum.coopSize, 16);
  const revivesDone = safeInt(sum.revivesDone, 1e6);

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
  st.totalEvolutions = Math.min(1e9, st.totalEvolutions + evoCount);
  st.totalBossKills = Math.min(1e9, st.totalBossKills + bossKills);
  if (coopSize >= 2) st.coopRuns = Math.min(1e9, st.coopRuns + 1);
  st.coopRevives = Math.min(1e9, st.coopRevives + revivesDone);
  if (sum.cleared) st.clears = Math.min(1e9, st.clears + 1);

  recordLeaderboardEntry(save, sum, now);
  const unlocks = evaluateUnlocks(save, sum);
  recordCodexSummary(save, sum);

  const achievements = [];
  const ach = (id, cond) => { if (cond && markAchievement(save, id, now)) achievements.push(id); };
  ach('firstClear', Boolean(sum.cleared));
  ach('kills800', kills >= MIAN_KILLS);
  ach('noBun480', isNoBunDawn(sum));
  ach('endless10', sum.mode === 'endless' && timeSec >= MAIN_DURATION + 600);
  ach('hit10k', maxHit >= 1e4);
  ach('hit100m', maxHit >= 1e8);
  ach('night10', Boolean(sum.cleared) && safeInt(sum.nightLevel, NIGHT_MAX) >= NIGHT_MAX);
  for (const extraId of reconcileAchievements(save, now)) {
    if (!achievements.includes(extraId)) achievements.push(extraId);
  }
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
