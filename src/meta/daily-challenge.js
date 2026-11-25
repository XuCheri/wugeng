// 每日异事挑战（v4 M3.2）：
// - 按本地日历日 YYYY-MM-DD 生成全服统一确定性种子、固定守夜人、固定起手兵刃及 1–2 条异事规则；
// - 每日首局结算发放 200 铜钱 + 30 周积分 + 50 令火，并按「异事分」计入每日异事榜；
// - 同日后续场次可反复「试手」冲击更高异事分，不重复发放首局铜钱与周分。

import {
  DEFAULT_DAO_NAME,
  HERO_IDS,
  WEAPON_IDS,
  canMutateObj,
  canWriteProp,
  isPlainObj,
  isValidDateStr,
  sanitizeDaoName,
  toFiniteNumber,
} from './save.js';
import { localDateString } from './checkin.js';
import { syncDailyReset } from './daily.js';
import { hashSeed, Rng } from '../core/rng.js';

export const DAILY_CHALLENGE_FIRST_COINS = 200;
export const DAILY_CHALLENGE_FIRST_WEEKLY_PTS = 30;
export const DAILY_CHALLENGE_FIRST_SEASON_XP = 50;

// 12 条异事词条规则池（全部转为纯数据传入 createRun({ runRules })，严守 sim 纯函数）
export const DAILY_RULES = [
  {
    id: 'only_zhenhun',
    group: 'school_lock',
    name: '独修镇魂',
    desc: '升级候选优先显现镇魂系器物，全队伤害 +18%',
    scoreMul: 1.12,
    mods: { onlySchool: 'zhenhun', dmgPct: 0.18 },
  },
  {
    id: 'only_daofa',
    group: 'school_lock',
    name: '独修道法',
    desc: '升级候选优先显现道法系器物，冷却缩减 +12%',
    scoreMul: 1.12,
    mods: { onlySchool: 'daofa', cdr: 0.12 },
  },
  {
    id: 'only_zhizha',
    group: 'school_lock',
    name: '独修纸扎',
    desc: '升级候选优先显现纸扎系器物，器物数量 +1',
    scoreMul: 1.12,
    mods: { onlySchool: 'zhizha', amount: 1 },
  },
  {
    id: 'only_yangyan',
    group: 'school_lock',
    name: '独修阳焰',
    desc: '升级候选优先显现阳焰系器物，攻击范围 +22%',
    scoreMul: 1.12,
    mods: { onlySchool: 'yangyan', areaPct: 0.22 },
  },
  {
    id: 'magnet_rush',
    group: 'tempo',
    name: '魂火自飞',
    desc: '全场魂火自动飞来，但邪祟移速 +30%',
    scoreMul: 1.18,
    mods: { autoMagnetXp: true, enemySpeedMul: 1.3 },
  },
  {
    id: 'watch_swap',
    group: 'tempo',
    name: '每更易兵',
    desc: '每到换更自动将一把未开光兵刃轮换为同阶新兵刃，伤害 +15%',
    scoreMul: 1.15,
    mods: { swapWeaponPerWatch: true, dmgPct: 0.15 },
  },
  {
    id: 'glass_blade',
    group: 'risk',
    name: '脆身重刃',
    desc: '全队伤害 +45%，但最大气血降为 65%',
    scoreMul: 1.2,
    mods: { dmgPct: 0.45, maxHpMul: 0.65 },
  },
  {
    id: 'elite_tide',
    group: 'risk',
    name: '精怪夜行',
    desc: '红印精怪现身率翻倍，魂火经验 +25%',
    scoreMul: 1.18,
    mods: { eliteChanceMul: 2.0, xpMul: 1.25 },
  },
  {
    id: 'coin_feast',
    group: 'boon',
    name: '满街铜钱',
    desc: '局内铜钱掉落翻倍，拾取范围 +40%',
    scoreMul: 1.08,
    mods: { coinDropMul: 2.0, pickupPct: 0.4 },
  },
  {
    id: 'swift_fasting',
    group: 'risk',
    name: '疾步轻身',
    desc: '移速 +25%、更锣聚气 +30%，但不再掉落回血肉包',
    scoreMul: 1.16,
    mods: { playerSpeedMul: 1.25, ultChargePct: 0.3, noBuns: true },
  },
  {
    id: 'deep_night',
    group: 'risk',
    name: '暗夜深重',
    desc: '提灯照明缩减 25%，暴击率 +18%、暴击伤害 +40%',
    scoreMul: 1.15,
    mods: { lightMul: 0.75, critChance: 0.18, critDmg: 0.4 },
  },
  {
    id: 'swarm_surge',
    group: 'tempo',
    name: '百祟夜涌',
    desc: '夜祟涌现密度 +25%，兵刃冷却缩减 +15%',
    scoreMul: 1.2,
    mods: { spawnRateMul: 1.25, cdr: 0.15 },
  },
];

export const DAILY_RULES_BY_ID = Object.fromEntries(DAILY_RULES.map((r) => [r.id, r]));

function safeInt(v, max = 1e12) {
  const n = toFiniteNumber(v);
  return Number.isFinite(n) && n > 0 ? Math.min(max, Math.floor(n)) : 0;
}

/**
 * 将一组词条合并为可直传 createRun({ runRules }) 的纯序列化规则对象。
 */
export function buildCombinedRunRules(rules = [], extra = {}) {
  const out = {
    mode: extra.mode || 'daily',
    dailyDate: typeof extra.dailyDate === 'string' ? extra.dailyDate : null,
    seasonRuleActive: Boolean(extra.seasonRuleActive),
    ruleIds: [],
    onlySchool: null,
    autoMagnetXp: false,
    swapWeaponPerWatch: false,
    noBuns: false,
    dmgPct: 0,
    cdr: 0,
    amount: 0,
    areaPct: 0,
    maxHpMul: 1,
    playerSpeedMul: 1,
    enemySpeedMul: 1,
    eliteChanceMul: 1,
    xpMul: 1,
    coinDropMul: 1,
    pickupPct: 0,
    ultChargePct: 0,
    lightMul: 1,
    critChance: 0,
    critDmg: 0,
    spawnRateMul: 1,
    scoreMul: 1,
  };

  for (const r of rules) {
    if (!r || typeof r !== 'object') continue;
    if (typeof r.id === 'string') out.ruleIds.push(r.id);
    const m = r.mods && typeof r.mods === 'object' ? r.mods : r;
    if (typeof m.onlySchool === 'string' && !out.onlySchool) out.onlySchool = m.onlySchool;
    if (m.autoMagnetXp) out.autoMagnetXp = true;
    if (m.swapWeaponPerWatch) out.swapWeaponPerWatch = true;
    if (m.noBuns) out.noBuns = true;
    if (Number.isFinite(m.dmgPct)) out.dmgPct += m.dmgPct;
    if (Number.isFinite(m.cdr)) out.cdr += m.cdr;
    if (Number.isFinite(m.amount)) out.amount += Math.round(m.amount);
    if (Number.isFinite(m.areaPct)) out.areaPct += m.areaPct;
    if (Number.isFinite(m.maxHpMul) && m.maxHpMul > 0) out.maxHpMul *= m.maxHpMul;
    if (Number.isFinite(m.playerSpeedMul) && m.playerSpeedMul > 0) out.playerSpeedMul *= m.playerSpeedMul;
    if (Number.isFinite(m.enemySpeedMul) && m.enemySpeedMul > 0) out.enemySpeedMul *= m.enemySpeedMul;
    if (Number.isFinite(m.eliteChanceMul) && m.eliteChanceMul > 0) out.eliteChanceMul *= m.eliteChanceMul;
    if (Number.isFinite(m.xpMul) && m.xpMul > 0) out.xpMul *= m.xpMul;
    if (Number.isFinite(m.coinDropMul) && m.coinDropMul > 0) out.coinDropMul *= m.coinDropMul;
    if (Number.isFinite(m.pickupPct)) out.pickupPct += m.pickupPct;
    if (Number.isFinite(m.ultChargePct)) out.ultChargePct += m.ultChargePct;
    if (Number.isFinite(m.lightMul) && m.lightMul > 0) out.lightMul *= m.lightMul;
    if (Number.isFinite(m.critChance)) out.critChance += m.critChance;
    if (Number.isFinite(m.critDmg)) out.critDmg += m.critDmg;
    if (Number.isFinite(m.spawnRateMul) && m.spawnRateMul > 0) out.spawnRateMul *= m.spawnRateMul;
    if (Number.isFinite(r.scoreMul) && r.scoreMul > 0) out.scoreMul *= r.scoreMul;
  }
  out.scoreMul = Math.round(out.scoreMul * 1000) / 1000;
  return out;
}

/**
 * 按本地日期生成当日全服统一的「每日异事」挑战配置。
 */
export function getDailyChallengeSpec(now = new Date()) {
  const rawDate = typeof now === 'string' && isValidDateStr(now) ? now : localDateString(now);
  const date = rawDate || '2026-01-01';
  const seed = hashSeed(`wugeng_daily_challenge_v4:${date}`);
  const rng = new Rng(seed);

  const heroId = HERO_IDS[rng.int(0, HERO_IDS.length - 1)];
  const startWeapon = WEAPON_IDS[rng.int(0, WEAPON_IDS.length - 1)];
  const ruleCount = rng.chance(0.65) ? 2 : 1;

  const pickedRules = [];
  const first = DAILY_RULES[rng.int(0, DAILY_RULES.length - 1)];
  pickedRules.push(first);
  if (ruleCount >= 2) {
    const secondPool = DAILY_RULES.filter((r) => r.id !== first.id && !(first.group === 'school_lock' && r.group === 'school_lock'));
    if (secondPool.length > 0) {
      pickedRules.push(secondPool[rng.int(0, secondPool.length - 1)]);
    }
  }

  const runRules = buildCombinedRunRules(pickedRules, { mode: 'daily', dailyDate: date });
  return {
    date,
    seed,
    heroId,
    startWeapon,
    nightLevel: 1,
    rules: pickedRules,
    runRules,
    firstReward: {
      coins: DAILY_CHALLENGE_FIRST_COINS,
      weeklyPoints: DAILY_CHALLENGE_FIRST_WEEKLY_PTS,
      seasonXp: DAILY_CHALLENGE_FIRST_SEASON_XP,
    },
  };
}

export function defaultDailyChallengeState() {
  return {
    lastRewardDate: null,
    todayDate: null,
    todayBestScore: 0,
    todayRuns: 0,
    bestScore: 0,
    totalRewardClaims: 0,
    pendingScore: 0,
    history: [],
  };
}

export function ensureDailyChallengeStruct(save) {
  if (!canMutateObj(save)) return null;
  if (!isPlainObj(save.dailyChallenge)) {
    if (!canWriteProp(save, 'dailyChallenge')) return null;
    save.dailyChallenge = defaultDailyChallengeState();
    return save.dailyChallenge;
  }
  const dc = save.dailyChallenge;
  if (!canMutateObj(dc)) return null;
  if (!isValidDateStr(dc.lastRewardDate)) dc.lastRewardDate = null;
  if (!isValidDateStr(dc.todayDate)) dc.todayDate = null;
  dc.todayBestScore = safeInt(dc.todayBestScore, 1e12);
  dc.todayRuns = safeInt(dc.todayRuns, 1e6);
  dc.bestScore = safeInt(dc.bestScore, 1e12);
  dc.totalRewardClaims = safeInt(dc.totalRewardClaims, 1e9);
  dc.pendingScore = safeInt(dc.pendingScore, 1e12);
  if (!Array.isArray(dc.history)) dc.history = [];
  return dc;
}

export function getDailyChallengeState(save, now = new Date()) {
  const spec = getDailyChallengeSpec(now);
  const rawDc = isPlainObj(save?.dailyChallenge) ? save.dailyChallenge : null;
  const lastReward = rawDc && isValidDateStr(rawDc.lastRewardDate) ? rawDc.lastRewardDate : null;
  const rollback = Boolean(lastReward && spec.date < lastReward);
  const rewardedToday = Boolean(lastReward && lastReward === spec.date);
  const sameDay = rawDc && rawDc.todayDate === spec.date;
  const todayBestScore = sameDay ? safeInt(rawDc.todayBestScore, 1e12) : 0;
  const todayRuns = sameDay ? safeInt(rawDc.todayRuns, 1e6) : 0;

  return {
    ...spec,
    rollback,
    rewardedToday,
    canEarnFirstReward: !rollback && !rewardedToday,
    todayBestScore,
    todayRuns,
    bestScore: safeInt(rawDc?.bestScore, 1e12),
  };
}

export function computeDailyScore(summary, spec = null) {
  if (!isPlainObj(summary)) return 0;
  const explicit = safeInt(summary.dailyScore, 1e12);
  if (explicit > 0) return explicit;
  const base = safeInt(summary.score, 1e12);
  const mul = Number.isFinite(spec?.runRules?.scoreMul) && spec.runRules.scoreMul > 0 ? spec.runRules.scoreMul : 1;
  return Math.min(9_999_999_999, Math.max(0, Math.round(base * mul)));
}

/**
 * 记录一局「每日异事」结算：
 * - 当日首局发放 200 铜钱 + 30 周积分 + 50 令火；
 * - 同日再次挑战仅刷新最佳异事分与本机异事榜记录，不重复发首局赏银。
 */
export function recordDailyChallengeRun(save, summary, now = new Date(), opts = {}) {
  const { onSeasonXp = null } = opts;
  if (!canMutateObj(save) || !isPlainObj(summary)) {
    return { ok: false, rewarded: false, dailyScore: 0, coins: 0, weeklyPointsAdded: 0, seasonXp: 0 };
  }
  const dc = ensureDailyChallengeStruct(save);
  if (!dc) {
    return { ok: false, rewarded: false, dailyScore: 0, coins: 0, weeklyPointsAdded: 0, seasonXp: 0 };
  }
  const spec = getDailyChallengeSpec(summary.dailyDate || now);
  const rollback = Boolean(dc.lastRewardDate && spec.date < dc.lastRewardDate);
  const dailyScore = computeDailyScore(summary, spec);

  if (dc.todayDate !== spec.date && !rollback) {
    dc.todayDate = spec.date;
    dc.todayBestScore = 0;
    dc.todayRuns = 0;
  }
  if (!rollback) {
    dc.todayRuns = Math.min(1e6, safeInt(dc.todayRuns, 1e6) + 1);
    if (dailyScore > dc.todayBestScore) dc.todayBestScore = dailyScore;
  }
  if (dailyScore > dc.bestScore) dc.bestScore = dailyScore;

  const daoName = sanitizeDaoName(save.daoName || DEFAULT_DAO_NAME);
  dc.history.unshift({
    date: spec.date,
    score: dailyScore,
    daoName,
    heroId: HERO_IDS.includes(summary.heroId) ? summary.heroId : spec.heroId,
    startWeapon: WEAPON_IDS.includes(summary.startWeapon) ? summary.startWeapon : spec.startWeapon,
    kills: safeInt(summary.kills, 1e9),
    timeSec: safeInt(summary.timeSec, 1e9),
    cleared: Boolean(summary.cleared),
    at: Date.now(),
  });
  dc.history.sort((a, b) => (b.score - a.score) || (b.at - a.at));
  if (dc.history.length > 15) dc.history.length = 15;

  let rewarded = false;
  let coins = 0;
  let weeklyPointsAdded = 0;
  let seasonXp = 0;

  if (!rollback && dc.lastRewardDate !== spec.date) {
    rewarded = true;
    coins = DAILY_CHALLENGE_FIRST_COINS;
    weeklyPointsAdded = DAILY_CHALLENGE_FIRST_WEEKLY_PTS;
    seasonXp = DAILY_CHALLENGE_FIRST_SEASON_XP;

    save.coins = Math.min(1e12, safeInt(save.coins, 1e12) + coins);
    dc.lastRewardDate = spec.date;
    dc.totalRewardClaims = Math.min(1e9, safeInt(dc.totalRewardClaims, 1e9) + 1);

    const dailySync = syncDailyReset(save, spec.date);
    if (dailySync.ok && !dailySync.rollback && isPlainObj(save.daily)) {
      save.daily.weeklyPoints = Math.min(99999, safeInt(save.daily.weeklyPoints, 99999) + weeklyPointsAdded);
    }
    if (typeof onSeasonXp === 'function') {
      onSeasonXp(seasonXp);
    } else if (isPlainObj(save.season) && canMutateObj(save.season) && canWriteProp(save.season, 'xp')) {
      save.season.xp = Math.min(1e9, safeInt(save.season.xp, 1e9) + seasonXp);
    }
  }

  return {
    ok: true,
    date: spec.date,
    rewarded,
    dailyScore,
    isFirstToday: rewarded,
    coins,
    weeklyPointsAdded,
    seasonXp,
  };
}

export function buildLocalDailyEntries(save, now = new Date()) {
  const today = localDateString(now);
  const daoName = sanitizeDaoName(save?.daoName || DEFAULT_DAO_NAME);
  const rawHist = Array.isArray(save?.dailyChallenge?.history) ? save.dailyChallenge.history : [];
  const filtered = rawHist
    .filter((item) => item && typeof item === 'object' && (!today || !item.date || item.date === today))
    .map((item) => ({
      score: safeInt(item.score, 9_999_999_999),
      name: sanitizeDaoName(item.daoName || daoName),
      heroId: HERO_IDS.includes(item.heroId) ? item.heroId : 'zhou',
      kills: safeInt(item.kills, 1e9),
      timeSec: safeInt(item.timeSec, 1e9),
      cleared: Boolean(item.cleared),
      date: typeof item.date === 'string' ? item.date : today,
      at: safeInt(item.at, 9e15),
      isSelf: true,
    }));

  const fallbackAll = filtered.length > 0
    ? filtered
    : rawHist
      .filter((item) => item && typeof item === 'object')
      .map((item) => ({
        score: safeInt(item.score, 9_999_999_999),
        name: sanitizeDaoName(item.daoName || daoName),
        heroId: HERO_IDS.includes(item.heroId) ? item.heroId : 'zhou',
        kills: safeInt(item.kills, 1e9),
        timeSec: safeInt(item.timeSec, 1e9),
        cleared: Boolean(item.cleared),
        date: typeof item.date === 'string' ? item.date : '',
        at: safeInt(item.at, 9e15),
        isSelf: true,
      }));

  fallbackAll.sort((a, b) => (b.score - a.score) || (b.at - a.at));
  return fallbackAll.slice(0, 10).map((row, idx) => ({
    ...row,
    rank: idx + 1,
  }));
}
