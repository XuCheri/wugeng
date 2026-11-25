// 每日差事与周赏供盒（v4 M3.1）：
// - 30 条差事池分 6 大类，每日按本地日期 YYYY-MM-DD 确定性抽取 3 条互不重类的差事；
// - 每条奖励 60–120 铜钱 + 10 周积分 + 20 令火（支持看广告双倍铜钱）；
// - 周积分满 30 / 60 / 100 / 150 可开启四档周赏供盒（每周一本地零点重置），发放铜钱、护身符、外观与令火；
// - 单人局与联机同守局结算均计入进度。

import {
  RELIC_IDS,
  isPlainObj,
  canMutateObj,
  canWriteProp,
  canMutateArray,
  isValidDateStr,
  toFiniteNumber,
} from './save.js';
import { COSMETIC_FALLBACK_COINS, localDateString, nextCosmetic } from './checkin.js';
import { recordCodexCharms } from './codex.js';
import { hashSeed, Rng } from '../core/rng.js';
import { WEAPONS, RELICS } from '../sim/balance.js';

export const DAILY_TASK_SEASON_XP = 20;
export const DAILY_TASK_WEEKLY_POINTS = 10;

export const DAILY_TASK_POOL = [
  // 1. 斩祟类 (5)
  { id: 'dk_kills_180', group: 'kills', name: '夜巡扫祟·初', desc: '今日累计斩灭 180 纸祟', metric: 'kills', need: 180, coins: 60 },
  { id: 'dk_kills_320', group: 'kills', name: '夜巡扫祟·中', desc: '今日累计斩灭 320 纸祟', metric: 'kills', need: 320, coins: 80 },
  { id: 'dk_kills_500', group: 'kills', name: '夜巡扫祟·高', desc: '今日累计斩灭 500 纸祟', metric: 'kills', need: 500, coins: 100 },
  { id: 'dk_single_260', group: 'kills', name: '一鼓破邪', desc: '单局击败 260 纸祟', metric: 'singleKills', need: 260, coins: 80 },
  { id: 'dk_single_400', group: 'kills', name: '百鬼退散', desc: '单局击败 400 纸祟', metric: 'singleKills', need: 400, coins: 110 },

  // 2. 更漏与天亮类 (5)
  { id: 'dw_watch_2', group: 'watch', name: '二更定梆', desc: '单局守至二更', metric: 'maxWatch', need: 2, coins: 60 },
  { id: 'dw_watch_3', group: 'watch', name: '三更掌灯', desc: '单局守至三更', metric: 'maxWatch', need: 3, coins: 80 },
  { id: 'dw_watch_4', group: 'watch', name: '四更听霜', desc: '单局守至四更', metric: 'maxWatch', need: 4, coins: 100 },
  { id: 'dw_play_240', group: 'watch', name: '长街巡守', desc: '今日累计守夜 240 秒', metric: 'playSec', need: 240, coins: 70 },
  { id: 'dw_clear_1', group: 'watch', name: '五更见晓', desc: '守到五更鸡鸣天亮 1 回', metric: 'clears', need: 1, coins: 120 },

  // 3. 流派与羁绊类 (6)
  { id: 'ds_zhenhun_2', group: 'school', name: '镇魂定夜', desc: '携镇魂系器物守至二更', metric: 'schoolWatch2', school: 'zhenhun', need: 1, coins: 80 },
  { id: 'ds_daofa_2', group: 'school', name: '玄坛行法', desc: '携道法系器物守至二更', metric: 'schoolWatch2', school: 'daofa', need: 1, coins: 80 },
  { id: 'ds_zhizha_2', group: 'school', name: '巧手裁纸', desc: '携纸扎系器物守至二更', metric: 'schoolWatch2', school: 'zhizha', need: 1, coins: 80 },
  { id: 'ds_yangyan_2', group: 'school', name: '烈火照街', desc: '携阳焰系器物守至二更', metric: 'schoolWatch2', school: 'yangyan', need: 1, coins: 80 },
  { id: 'ds_synergy_3', group: 'school', name: '三才同气', desc: '单局激活任意 3 件同门羁绊', metric: 'synergy3', need: 1, coins: 90 },
  { id: 'ds_synergy_6', group: 'school', name: '六合归宗', desc: '单局激活任意 6 件同门大羁绊', metric: 'synergy6', need: 1, coins: 120 },

  // 4. 神兵与行囊类 (5)
  { id: 'da_evolve_1', group: 'arsenal', name: '神兵初敕', desc: '今日开光敕封 1 把神兵', metric: 'evolves', need: 1, coins: 90 },
  { id: 'da_evolve_2', group: 'arsenal', name: '双器重光', desc: '今日累计开光 2 把神兵', metric: 'evolves', need: 2, coins: 120 },
  { id: 'da_sig_run', group: 'arsenal', name: '本命随身', desc: '携本命兵刃完成 1 局守夜', metric: 'sigRuns', need: 1, coins: 70 },
  { id: 'da_level_12', group: 'arsenal', name: '魂火满身', desc: '单局升至 12 级', metric: 'maxLevel', need: 12, coins: 80 },
  { id: 'da_weapons_4', group: 'arsenal', name: '四兵齐鸣', desc: '单局集齐 4 把随身兵刃', metric: 'maxWeapons', need: 4, coins: 80 },

  // 5. 激战与夜主类 (5)
  { id: 'dc_combo_30', group: 'combat', name: '连斩不断', desc: '单局达成 30 连斩', metric: 'maxCombo', need: 30, coins: 70 },
  { id: 'dc_combo_60', group: 'combat', name: '疾风破阵', desc: '单局达成 60 连斩', metric: 'maxCombo', need: 60, coins: 100 },
  { id: 'dc_boss_1', group: 'combat', name: '退却夜主', desc: '今日斩灭 1 尊夜主', metric: 'bossKills', need: 1, coins: 90 },
  { id: 'dc_boss_2', group: 'combat', name: '连斩凶神', desc: '今日累计斩灭 2 尊夜主', metric: 'bossKills', need: 2, coins: 120 },
  { id: 'dc_hit_800', group: 'combat', name: '天雷一击', desc: '单次打出 800 点伤害', metric: 'maxHit', need: 800, coins: 80 },

  // 6. 巡街与异事类 (4)
  { id: 'dp_event_1', group: 'patrol', name: '夜半奇遇', desc: '完成 1 次每更随机异事', metric: 'events', need: 1, coins: 90 },
  { id: 'dp_event_2', group: 'patrol', name: '平定异事', desc: '今日累计完成 2 次随机异事', metric: 'events', need: 2, coins: 120 },
  { id: 'dp_runs_2', group: 'patrol', name: '两度出更', desc: '今日完成 2 局守夜', metric: 'runs', need: 2, coins: 70 },
  { id: 'dp_coins_80', group: 'patrol', name: '街巷拾金', desc: '今日结算累计入账 80 铜钱', metric: 'runCoins', need: 80, coins: 70 },
];

export const DAILY_TASKS_BY_ID = Object.fromEntries(DAILY_TASK_POOL.map((t) => [t.id, t]));
export const DAILY_TASK_GROUPS = ['kills', 'watch', 'school', 'arsenal', 'combat', 'patrol'];

export const WEEKLY_CHESTS = [
  { id: 'wc_30', points: 30, name: '初阶供盒', coins: 80, charms: 1, cosmetic: false, seasonXp: 25 },
  { id: 'wc_60', points: 60, name: '中阶供盒', coins: 120, charms: 1, cosmetic: false, seasonXp: 35 },
  { id: 'wc_100', points: 100, name: '上阶供盒', coins: 180, charms: 2, cosmetic: false, seasonXp: 50 },
  { id: 'wc_150', points: 150, name: '天罡供盒', coins: 240, charms: 2, cosmetic: true, seasonXp: 80 },
];

export const WEEKLY_CHEST_POINTS = WEEKLY_CHESTS.map((c) => c.points);

function safeInt(v, max = 1e9) {
  const n = toFiniteNumber(v);
  return Number.isFinite(n) && n > 0 ? Math.min(max, Math.floor(n)) : 0;
}

/**
 * 根据本地日历日计算所在自然周的周一日期 YYYY-MM-DD（周一为一周起点）。
 */
export function localMondayString(now) {
  const ds = localDateString(now);
  if (!ds) return null;
  const [y, m, d] = ds.split('-').map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d));
  const dow = utc.getUTCDay(); // 0=周日, 1=周一..6=周六
  const diffToMon = dow === 0 ? -6 : 1 - dow;
  utc.setUTCDate(utc.getUTCDate() + diffToMon);
  const my = String(utc.getUTCFullYear()).padStart(4, '0');
  const mm = String(utc.getUTCMonth() + 1).padStart(2, '0');
  const md = String(utc.getUTCDate()).padStart(2, '0');
  return `${my}-${mm}-${md}`;
}

/**
 * 按日期种子确定性抽取当天 3 条互不同类的差事。
 */
export function drawDailyTasks(dateStr) {
  const safeDate = isValidDateStr(dateStr) ? dateStr : '2026-01-01';
  const rng = new Rng(hashSeed(`wugeng_daily_tasks:${safeDate}`));
  const groups = [...DAILY_TASK_GROUPS];
  for (let i = groups.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    const tmp = groups[i];
    groups[i] = groups[j];
    groups[j] = tmp;
  }
  const pickedGroups = groups.slice(0, 3);
  return pickedGroups.map((g) => {
    const candidates = DAILY_TASK_POOL.filter((t) => t.group === g);
    return candidates[rng.int(0, candidates.length - 1)];
  });
}

export function defaultDailyState() {
  return {
    date: null,
    progress: {},
    claimed: [],
    weekKey: null,
    weeklyPoints: 0,
    weeklyClaimed: [],
    totalTaskClaims: 0,
    totalWeeklyClaims: 0,
  };
}

export function ensureDailyStruct(save) {
  if (!canMutateObj(save)) return null;
  if (!isPlainObj(save.daily)) {
    if (!canWriteProp(save, 'daily')) return null;
    save.daily = defaultDailyState();
    return save.daily;
  }
  const d = save.daily;
  if (!canMutateObj(d)) return null;
  if (!isValidDateStr(d.date)) d.date = null;
  if (!isPlainObj(d.progress)) d.progress = {};
  if (!Array.isArray(d.claimed)) d.claimed = [];
  if (!isValidDateStr(d.weekKey)) d.weekKey = null;
  d.weeklyPoints = safeInt(d.weeklyPoints, 99999);
  if (!Array.isArray(d.weeklyClaimed)) d.weeklyClaimed = [];
  d.totalTaskClaims = safeInt(d.totalTaskClaims, 1e9);
  d.totalWeeklyClaims = safeInt(d.totalWeeklyClaims, 1e9);
  return d;
}

/**
 * 同步跨日与跨周一重置；若系统时间回拨（today < d.date），保留进度并返回 rollback=true。
 */
export function syncDailyReset(save, now = new Date()) {
  const today = localDateString(now);
  const monday = localMondayString(now);
  const d = ensureDailyStruct(save);
  if (!d || !today || !monday) {
    return { ok: false, today, weekKey: monday, rollback: false };
  }
  const rollback = Boolean(d.date && today < d.date);
  if (!rollback) {
    if (!d.date || today > d.date) {
      d.date = today;
      d.progress = {};
      d.claimed = [];
    }
    if (!d.weekKey || monday > d.weekKey) {
      d.weekKey = monday;
      d.weeklyPoints = 0;
      d.weeklyClaimed = [];
    }
  }
  return { ok: true, today, weekKey: monday, rollback };
}

function summaryHasSchool(summary, school) {
  if (!school || !isPlainObj(summary)) return false;
  if (typeof summary.startWeapon === 'string' && WEAPONS[summary.startWeapon]?.tags?.includes(school)) {
    return true;
  }
  if (Array.isArray(summary.weapons)) {
    for (const w of summary.weapons) {
      const id = isPlainObj(w) ? w.id : (typeof w === 'string' ? w : null);
      if (id && WEAPONS[id]?.tags?.includes(school)) return true;
    }
  }
  if (Array.isArray(summary.relics)) {
    for (const r of summary.relics) {
      const id = isPlainObj(r) ? r.id : (typeof r === 'string' ? r : null);
      if (id && RELICS[id]?.tags?.includes(school)) return true;
    }
  }
  return false;
}

function evaluateTaskIncrement(task, summary, prevVal) {
  const s = isPlainObj(summary) ? summary : {};
  const kills = safeInt(s.kills, 1e9);
  const watch = Math.max(1, safeInt(s.reachedWatch, 10) || (s.cleared ? 6 : 1));
  const cleared = Boolean(s.cleared);
  const playSec = safeInt(s.timeSec, 1e9);
  const evolves = safeInt(s.evolvedCount, 99);
  const maxSyn = safeInt(s.maxSynergyTier, 99);
  const level = Math.max(1, safeInt(s.level, 999));
  const weaponCnt = Array.isArray(s.weapons) ? s.weapons.filter(Boolean).length : 1;
  const maxCombo = safeInt(s.maxCombo, 1e9);
  const bossKills = safeInt(s.bossKills, 1e6);
  const maxHit = safeInt(s.maxHit, 1e12);
  const events = safeInt(s.eventsCompleted, 1e6);
  const coins = safeInt(s.coins, 1e9);

  switch (task.metric) {
    case 'kills':
      return prevVal + kills;
    case 'singleKills':
      return Math.max(prevVal, kills);
    case 'maxWatch':
      return Math.max(prevVal, cleared ? 6 : watch);
    case 'playSec':
      return prevVal + playSec;
    case 'clears':
      return prevVal + (cleared ? 1 : 0);
    case 'schoolWatch2':
      return prevVal + ((cleared || watch >= 2) && summaryHasSchool(s, task.school) ? 1 : 0);
    case 'synergy3':
      return prevVal + (maxSyn >= 3 ? 1 : 0);
    case 'synergy6':
      return prevVal + (maxSyn >= 6 ? 1 : 0);
    case 'evolves':
      return prevVal + evolves;
    case 'sigRuns':
      return prevVal + (s.signatureStart !== false ? 1 : 0);
    case 'maxLevel':
      return Math.max(prevVal, level);
    case 'maxWeapons':
      return Math.max(prevVal, weaponCnt);
    case 'maxCombo':
      return Math.max(prevVal, maxCombo);
    case 'bossKills':
      return prevVal + bossKills;
    case 'maxHit':
      return Math.max(prevVal, maxHit);
    case 'events':
      return prevVal + events;
    case 'runs':
      return prevVal + 1;
    case 'runCoins':
      return prevVal + coins;
    default:
      return prevVal;
  }
}

/**
 * 结算一局（含单人、同守联机、每日异事）后推进当日差事进度。
 */
export function recordDailyRun(save, summary, now = new Date()) {
  if (!isPlainObj(summary)) return { updated: false, completedIds: [] };
  const sync = syncDailyReset(save, now);
  if (!sync.ok || sync.rollback) return { updated: false, completedIds: [] };
  const d = save.daily;
  const tasks = drawDailyTasks(d.date);
  const completedIds = [];
  let changed = false;

  for (const t of tasks) {
    const prev = safeInt(d.progress[t.id], 1e9);
    const next = Math.min(t.need, evaluateTaskIncrement(t, summary, prev));
    if (next !== prev) {
      d.progress[t.id] = next;
      changed = true;
    }
    if (next >= t.need && !d.claimed.includes(t.id)) {
      completedIds.push(t.id);
    }
  }
  return { updated: changed, completedIds };
}

/**
 * 读取差事与周赏供盒完整视图状态（不主动污染只读对象，若日期跨天则在视图层反映新任务）。
 */
export function getDailyState(save, now = new Date()) {
  const today = localDateString(now) || '2026-01-01';
  const monday = localMondayString(now) || '2025-12-29';
  const rawD = isPlainObj(save?.daily) ? save.daily : null;
  const savedDate = rawD && isValidDateStr(rawD.date) ? rawD.date : null;
  const savedWeek = rawD && isValidDateStr(rawD.weekKey) ? rawD.weekKey : null;
  const rollback = Boolean(savedDate && today < savedDate);

  const activeDate = rollback ? savedDate : today;
  const sameDay = savedDate === activeDate;
  const sameWeek = rollback ? Boolean(savedWeek) : savedWeek === monday;

  const progressMap = sameDay && isPlainObj(rawD?.progress) ? rawD.progress : {};
  const claimedSet = new Set(sameDay && Array.isArray(rawD?.claimed) ? rawD.claimed : []);
  const weeklyPoints = sameWeek ? safeInt(rawD?.weeklyPoints, 99999) : 0;
  const weeklyClaimedSet = new Set(
    sameWeek && Array.isArray(rawD?.weeklyClaimed)
      ? rawD.weeklyClaimed.map((n) => Number(n)).filter((n) => WEEKLY_CHEST_POINTS.includes(n))
      : [],
  );

  const tasks = drawDailyTasks(activeDate).map((t) => {
    const have = Math.min(t.need, safeInt(progressMap[t.id], 1e9));
    const claimed = claimedSet.has(t.id);
    const done = have >= t.need;
    return {
      ...t,
      have,
      done,
      claimed,
      canClaim: !rollback && done && !claimed,
      weeklyPoints: DAILY_TASK_WEEKLY_POINTS,
      seasonXp: DAILY_TASK_SEASON_XP,
    };
  });

  const cosmeticNext = nextCosmetic(save);
  const chests = WEEKLY_CHESTS.map((c) => {
    const claimed = weeklyClaimedSet.has(c.points);
    const reached = weeklyPoints >= c.points;
    return {
      ...c,
      cosmeticItem: c.cosmetic ? cosmeticNext : null,
      reached,
      claimed,
      canClaim: !rollback && reached && !claimed,
    };
  });

  const claimableTasks = tasks.filter((t) => t.canClaim).length;
  const claimableChests = chests.filter((c) => c.canClaim).length;

  return {
    today: activeDate,
    weekKey: sameWeek && savedWeek ? savedWeek : monday,
    rollback,
    tasks,
    weeklyPoints,
    weeklyMax: WEEKLY_CHESTS[WEEKLY_CHESTS.length - 1].points,
    chests,
    claimableTasks,
    claimableChests,
    claimableCount: claimableTasks + claimableChests,
  };
}

export function getUnclaimedDailyCount(save, now = new Date()) {
  return getDailyState(save, now).claimableCount;
}

function addSeasonXpInternal(save, xp, onSeasonXp) {
  if (xp <= 0) return 0;
  if (typeof onSeasonXp === 'function') {
    onSeasonXp(xp);
    return xp;
  }
  if (isPlainObj(save?.season) && canMutateObj(save.season) && canWriteProp(save.season, 'xp')) {
    save.season.xp = Math.min(1e9, safeInt(save.season.xp, 1e9) + xp);
  }
  return xp;
}

/**
 * 领取单条每日差事奖励。
 */
export function claimDailyTask(save, taskId, now = new Date(), opts = {}) {
  const { doubled = false, onSeasonXp = null } = opts;
  if (!canMutateObj(save) || !canWriteProp(save, 'coins')) {
    return { ok: false, reason: 'invalid_save' };
  }
  const sync = syncDailyReset(save, now);
  if (!sync.ok) return { ok: false, reason: 'invalid_date' };
  if (sync.rollback) return { ok: false, reason: 'rollback' };

  const st = getDailyState(save, now);
  const task = st.tasks.find((t) => t.id === taskId);
  if (!task) return { ok: false, reason: 'unknown_task' };
  if (task.claimed) return { ok: false, reason: 'claimed' };
  if (!task.done) return { ok: false, reason: 'incomplete' };

  const mult = doubled ? 2 : 1;
  const coins = task.coins * mult;
  const baseCoins = safeInt(save.coins, 1e12);
  save.coins = Math.min(1e12, baseCoins + coins);
  save.daily.claimed.push(task.id);
  save.daily.weeklyPoints = Math.min(99999, safeInt(save.daily.weeklyPoints, 99999) + DAILY_TASK_WEEKLY_POINTS);
  save.daily.totalTaskClaims = Math.min(1e9, safeInt(save.daily.totalTaskClaims, 1e9) + 1);
  const seasonXp = addSeasonXpInternal(save, DAILY_TASK_SEASON_XP, onSeasonXp);

  return {
    ok: true,
    taskId: task.id,
    doubled: Boolean(doubled),
    coins,
    weeklyPointsAdded: DAILY_TASK_WEEKLY_POINTS,
    weeklyPoints: save.daily.weeklyPoints,
    seasonXp,
  };
}

/**
 * 开启周赏供盒（支持传入积分档位 30/60/100/150 或 id 如 'wc_30'）。
 */
export function claimWeeklyChest(save, chestIdOrPoints, now = new Date(), opts = {}) {
  const { doubled = false, rng = Math.random, onSeasonXp = null } = opts;
  if (!canMutateObj(save) || !canWriteProp(save, 'coins')) {
    return { ok: false, reason: 'invalid_save' };
  }
  if (Array.isArray(save.charms) && !canMutateArray(save.charms)) {
    return { ok: false, reason: 'invalid_save' };
  }
  const sync = syncDailyReset(save, now);
  if (!sync.ok) return { ok: false, reason: 'invalid_date' };
  if (sync.rollback) return { ok: false, reason: 'rollback' };

  const st = getDailyState(save, now);
  const chest = st.chests.find((c) => c.id === chestIdOrPoints || c.points === Number(chestIdOrPoints));
  if (!chest) return { ok: false, reason: 'unknown_chest' };
  if (chest.claimed) return { ok: false, reason: 'claimed' };
  if (!chest.reached) return { ok: false, reason: 'insufficient_points' };

  if (!Array.isArray(save.charms)) save.charms = [];
  if (!isPlainObj(save.cosmetics)) {
    save.cosmetics = { owned: [], equipped: { lantern: null, outfit: null, attackVfx: 'default', heroSkins: {} } };
  }
  if (!Array.isArray(save.cosmetics.owned)) save.cosmetics.owned = [];
  if (!isPlainObj(save.cosmetics.equipped)) {
    save.cosmetics.equipped = { lantern: null, outfit: null, attackVfx: 'default', heroSkins: {} };
  }

  const mult = doubled ? 2 : 1;
  let coins = chest.coins * mult;
  const charms = [];
  const fn = typeof rng === 'function' ? rng : Math.random;
  for (let i = 0; i < chest.charms; i++) {
    let rawR = NaN;
    try { rawR = toFiniteNumber(fn()); } catch { rawR = NaN; }
    const idx = Number.isFinite(rawR)
      ? Math.max(0, Math.min(RELIC_IDS.length - 1, Math.floor(rawR * RELIC_IDS.length)))
      : 0;
    charms.push({ relicId: RELIC_IDS[idx] });
  }

  let cosmetic = null;
  if (chest.cosmetic) {
    cosmetic = nextCosmetic(save);
    if (cosmetic) {
      save.cosmetics.owned.push(cosmetic.id);
      if (!save.cosmetics.equipped[cosmetic.kind]) {
        save.cosmetics.equipped[cosmetic.kind] = cosmetic.id;
      }
    } else {
      coins += COSMETIC_FALLBACK_COINS;
    }
  }

  save.coins = Math.min(1e12, safeInt(save.coins, 1e12) + coins);
  save.charms.push(...charms);
  recordCodexCharms(save, charms);
  save.daily.weeklyClaimed.push(chest.points);
  save.daily.totalWeeklyClaims = Math.min(1e9, safeInt(save.daily.totalWeeklyClaims, 1e9) + 1);
  const seasonXp = addSeasonXpInternal(save, chest.seasonXp, onSeasonXp);

  return {
    ok: true,
    chestId: chest.id,
    points: chest.points,
    doubled: Boolean(doubled),
    coins,
    charms,
    cosmetic: cosmetic ? { ...cosmetic } : null,
    seasonXp,
  };
}
