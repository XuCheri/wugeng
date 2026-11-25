// 守夜令（4 周一期）与 30 档免费通行证逻辑（v4 M3.3）：
// - 令火来源：每局按生存秒数与斩祟数发放 + 每日差事 + 周赏供盒 + 每日异事；
// - 「血月守夜」开关关闭时主线零影响；开启时注入当期规则（敌移速 +12%、魂火经验 +15%）并记入守夜令榜；
// - 第 30 档解锁当期限定皮肤「老周·血月」（zhou_bloodmoon）。

import {
  DEFAULT_DAO_NAME,
  HERO_IDS,
  RELIC_IDS,
  canMutateArray,
  canMutateObj,
  canWriteProp,
  isPlainObj,
  isValidDateStr,
  sanitizeDaoName,
  toFiniteNumber,
} from './save.js';
import { COSMETIC_FALLBACK_COINS, COSMETICS, localDateString } from './checkin.js';
import { recordCodexCharms } from './codex.js';
import { equipHeroSkin, grantCosmeticUnlock } from './cosmetics.js';
import {
  SEASON_TITLE_IDS,
  SEASON_TITLES,
  SEASONS,
  SEASONS_BY_ID,
  buildSeasonPassTable,
} from './season-config.js';

function safeInt(v, max = 1e9) {
  const n = toFiniteNumber(v);
  return Number.isFinite(n) && n > 0 ? Math.min(max, Math.floor(n)) : 0;
}

function dateToUtcDays(dateStr) {
  if (!isValidDateStr(dateStr)) return null;
  const [y, m, d] = dateStr.split('-').map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
}

/**
 * 根据当前日期解析生效中的守夜令期次（配置首期前默认预热展示首期，末期后保留最新一期）。
 */
export function getActiveSeason(now = new Date()) {
  const ds = typeof now === 'string' && isValidDateStr(now) ? now : localDateString(now);
  const curDays = ds ? dateToUtcDays(ds) : null;
  if (curDays !== null) {
    for (const s of SEASONS) {
      const startDays = dateToUtcDays(s.start);
      if (startDays === null) continue;
      const endDays = startDays + Math.max(1, s.weeks || 4) * 7;
      if (curDays >= startDays && curDays < endDays) {
        return { ...s, daysLeft: Math.max(1, endDays - curDays) };
      }
    }
    const first = SEASONS[0];
    const firstStart = dateToUtcDays(first.start);
    if (firstStart !== null && curDays < firstStart) {
      const totalDays = Math.max(1, first.weeks || 4) * 7;
      return { ...first, daysLeft: totalDays };
    }
  }
  const last = SEASONS[SEASONS.length - 1];
  return { ...last, daysLeft: Math.max(1, (last.weeks || 4) * 7) };
}

export function defaultSeasonState() {
  return {
    seasonId: SEASONS[0].id,
    xp: 0,
    claimedTiers: [],
    activeRule: false,
    bestSeasonScore: 0,
    pendingScore: 0,
    ownedTitles: [],
    selectedTitle: '',
    totalTierClaims: 0,
    history: [],
  };
}

export function ensureSeasonStruct(save, now = new Date()) {
  if (!canMutateObj(save)) return null;
  const active = getActiveSeason(now);
  if (!isPlainObj(save.season)) {
    if (!canWriteProp(save, 'season')) return null;
    save.season = { ...defaultSeasonState(), seasonId: active.id };
    return save.season;
  }
  const sn = save.season;
  if (!canMutateObj(sn)) return null;
  if (typeof sn.seasonId !== 'string' || !SEASONS_BY_ID[sn.seasonId]) {
    sn.seasonId = active.id;
  }
  sn.xp = safeInt(sn.xp, 1e9);
  if (!Array.isArray(sn.claimedTiers)) sn.claimedTiers = [];
  sn.activeRule = Boolean(sn.activeRule);
  sn.bestSeasonScore = safeInt(sn.bestSeasonScore, 1e12);
  sn.pendingScore = safeInt(sn.pendingScore, 1e12);
  if (!Array.isArray(sn.ownedTitles)) sn.ownedTitles = [];
  sn.selectedTitle = typeof sn.selectedTitle === 'string' && SEASON_TITLE_IDS.includes(sn.selectedTitle)
    && sn.ownedTitles.includes(sn.selectedTitle)
    ? sn.selectedTitle
    : '';
  sn.totalTierClaims = safeInt(sn.totalTierClaims, 1e9);
  if (!Array.isArray(sn.history)) sn.history = [];

  // 若配置推进到了新一期，重置当期档位进度但完整保留已获名号与衣冠
  if (sn.seasonId !== active.id) {
    sn.seasonId = active.id;
    sn.xp = 0;
    sn.claimedTiers = [];
    sn.bestSeasonScore = 0;
    sn.pendingScore = 0;
    sn.history = [];
  }
  return sn;
}

export function addSeasonXp(save, amount, now = new Date()) {
  const add = safeInt(amount, 1e7);
  if (add <= 0) return 0;
  const sn = ensureSeasonStruct(save, now);
  if (!sn) return 0;
  sn.xp = Math.min(1e9, sn.xp + add);
  return add;
}

export function setSeasonRuleActive(save, active, now = new Date()) {
  const sn = ensureSeasonStruct(save, now);
  if (!sn) return false;
  sn.activeRule = Boolean(active);
  return sn.activeRule;
}

/**
 * 当「血月守夜」开关开启时构造 createRun({ runRules }) 参数；关闭时返回 null，主线零影响。
 */
export function buildSeasonRunRules(save, now = new Date()) {
  if (!save?.season?.activeRule) return null;
  const season = getActiveSeason(now);
  const r = season.rule || {};
  return {
    mode: 'season',
    seasonRuleActive: true,
    ruleIds: [r.id || 'blood_moon'],
    enemySpeedMul: 1 + (Number(r.enemySpeedPct) || 0.12),
    xpMul: 1 + (Number(r.soulFirePct) || 0.15),
    scoreMul: Number(r.scoreMul) || 1.15,
  };
}

/**
 * 计算单局结算可获得的令火经验。
 */
export function computeRunSeasonXp(summary) {
  if (!isPlainObj(summary)) return 0;
  const sec = safeInt(summary.timeSec, 3600);
  const kills = safeInt(summary.kills, 1e6);
  const cleared = Boolean(summary.cleared);
  const raw = Math.round(sec / 10 + kills / 22 + (cleared ? 40 : 0));
  const base = (sec >= 12 || kills >= 5) ? Math.max(10, Math.min(200, raw)) : Math.max(0, raw);
  const mul = summary.seasonRuleActive ? 1.25 : 1;
  return Math.round(base * mul);
}

export function recordSeasonRun(save, summary, now = new Date()) {
  if (!isPlainObj(summary)) return { ok: false, xpAdded: 0, seasonScore: 0 };
  const sn = ensureSeasonStruct(save, now);
  if (!sn) return { ok: false, xpAdded: 0, seasonScore: 0 };

  const xpAdded = computeRunSeasonXp(summary);
  sn.xp = Math.min(1e9, sn.xp + xpAdded);

  let seasonScore = 0;
  if (summary.seasonRuleActive) {
    const rawScore = safeInt(summary.dailyScore || summary.score, 9_999_999_999);
    seasonScore = rawScore;
    if (seasonScore > sn.bestSeasonScore) sn.bestSeasonScore = seasonScore;
    const daoName = sanitizeDaoName(save.daoName || DEFAULT_DAO_NAME);
    sn.history.unshift({
      score: seasonScore,
      daoName,
      heroId: HERO_IDS.includes(summary.heroId) ? summary.heroId : 'zhou',
      nightLevel: safeInt(summary.nightLevel, 20),
      kills: safeInt(summary.kills, 1e9),
      timeSec: safeInt(summary.timeSec, 1e9),
      cleared: Boolean(summary.cleared),
      at: Date.now(),
    });
    sn.history.sort((a, b) => (b.score - a.score) || (b.at - a.at));
    if (sn.history.length > 15) sn.history.length = 15;
  }

  return {
    ok: true,
    xpAdded,
    xp: sn.xp,
    seasonScore,
  };
}

export function getSeasonState(save, now = new Date()) {
  const season = getActiveSeason(now);
  const rawSn = isPlainObj(save?.season) && save.season.seasonId === season.id ? save.season : null;
  const xp = rawSn ? safeInt(rawSn.xp, 1e9) : 0;
  const xpPerTier = Math.max(10, Number(season.xpPerTier) || 100);
  const maxTier = Math.max(1, Number(season.passTiers) || 30);
  const currentTier = Math.min(maxTier, Math.floor(xp / xpPerTier));
  const tierProgressXp = currentTier >= maxTier ? xpPerTier : (xp % xpPerTier);
  const claimedSet = new Set(
    rawSn && Array.isArray(rawSn.claimedTiers)
      ? rawSn.claimedTiers.map((n) => Number(n)).filter((n) => Number.isInteger(n) && n >= 1 && n <= maxTier)
      : [],
  );
  const activeRule = Boolean(rawSn ? rawSn.activeRule : save?.season?.activeRule);
  const ownedTitles = Array.isArray(save?.season?.ownedTitles)
    ? save.season.ownedTitles.filter((t) => SEASON_TITLE_IDS.includes(t))
    : [];
  const selectedTitle = typeof save?.season?.selectedTitle === 'string' && ownedTitles.includes(save.season.selectedTitle)
    ? save.season.selectedTitle
    : '';

  const table = buildSeasonPassTable(season);
  const tiers = table.map((row) => {
    const unlocked = currentTier >= row.tier;
    const claimed = claimedSet.has(row.tier);
    return {
      ...row,
      unlocked,
      claimed,
      canClaim: unlocked && !claimed,
    };
  });

  const claimableCount = tiers.filter((t) => t.canClaim).length;
  return {
    season,
    xp,
    xpPerTier,
    currentTier,
    maxTier,
    tierProgressXp,
    activeRule,
    bestSeasonScore: rawSn ? safeInt(rawSn.bestSeasonScore, 1e12) : 0,
    tiers,
    claimableCount,
    ownedTitles,
    selectedTitle,
    selectedTitleName: selectedTitle ? (SEASON_TITLES[selectedTitle]?.name || '') : '',
  };
}

export function getUnclaimedSeasonCount(save, now = new Date()) {
  return getSeasonState(save, now).claimableCount;
}

function pickSeasonCosmetic(save, prefer = 'lantern') {
  const owned = new Set(Array.isArray(save?.cosmetics?.owned) ? save.cosmetics.owned : []);
  return COSMETICS.find((c) => c.kind === prefer && !owned.has(c.id))
    || COSMETICS.find((c) => !owned.has(c.id))
    || null;
}

export function claimSeasonTier(save, tierNum, now = new Date(), opts = {}) {
  const { rng = Math.random } = opts;
  if (!canMutateObj(save) || !canWriteProp(save, 'coins')) {
    return { ok: false, reason: 'invalid_save' };
  }
  if (Array.isArray(save.charms) && !canMutateArray(save.charms)) {
    return { ok: false, reason: 'invalid_save' };
  }
  const sn = ensureSeasonStruct(save, now);
  if (!sn) return { ok: false, reason: 'invalid_save' };

  const st = getSeasonState(save, now);
  const row = st.tiers.find((t) => t.tier === Number(tierNum));
  if (!row) return { ok: false, reason: 'unknown_tier' };
  if (row.claimed) return { ok: false, reason: 'claimed' };
  if (!row.unlocked) return { ok: false, reason: 'locked' };

  if (!Array.isArray(save.charms)) save.charms = [];
  if (!isPlainObj(save.cosmetics)) {
    save.cosmetics = { owned: [], equipped: { lantern: null, outfit: null, attackVfx: 'default', heroSkins: {} } };
  }
  if (!Array.isArray(save.cosmetics.owned)) save.cosmetics.owned = [];
  if (!isPlainObj(save.cosmetics.equipped)) {
    save.cosmetics.equipped = { lantern: null, outfit: null, attackVfx: 'default', heroSkins: {} };
  }

  let coins = row.coins || 0;
  const charms = [];
  const fn = typeof rng === 'function' ? rng : Math.random;
  for (let i = 0; i < (row.charms || 0); i++) {
    let rawR = NaN;
    try { rawR = toFiniteNumber(fn()); } catch { rawR = NaN; }
    const idx = Number.isFinite(rawR)
      ? Math.max(0, Math.min(RELIC_IDS.length - 1, Math.floor(rawR * RELIC_IDS.length)))
      : 0;
    charms.push({ relicId: RELIC_IDS[idx] });
  }

  let grantedSkin = null;
  let grantedTitle = null;
  let grantedCosmetic = null;

  if (row.type === 'skin' && row.id) {
    grantCosmeticUnlock(save, row.id);
    grantedSkin = row.id;
  } else if (row.type === 'title' && row.id && SEASON_TITLES[row.id]) {
    if (!sn.ownedTitles.includes(row.id)) sn.ownedTitles.push(row.id);
    if (!sn.selectedTitle) sn.selectedTitle = row.id;
    grantedTitle = row.id;
  } else if (row.type === 'cosmetic') {
    const cos = pickSeasonCosmetic(save, row.prefer || 'lantern');
    if (cos) {
      save.cosmetics.owned.push(cos.id);
      if (!save.cosmetics.equipped[cos.kind]) save.cosmetics.equipped[cos.kind] = cos.id;
      grantedCosmetic = cos;
    } else {
      coins += COSMETIC_FALLBACK_COINS;
    }
  }

  save.coins = Math.min(1e12, safeInt(save.coins, 1e12) + coins);
  if (charms.length > 0) {
    save.charms.push(...charms);
    recordCodexCharms(save, charms);
  }
  sn.claimedTiers.push(row.tier);
  sn.claimedTiers.sort((a, b) => a - b);
  sn.totalTierClaims = Math.min(1e9, safeInt(sn.totalTierClaims, 1e9) + 1);

  return {
    ok: true,
    tier: row.tier,
    coins,
    charms,
    skinId: grantedSkin,
    titleId: grantedTitle,
    cosmetic: grantedCosmetic,
  };
}

export function claimAllSeasonTiers(save, now = new Date(), opts = {}) {
  const st = getSeasonState(save, now);
  const results = [];
  for (const row of st.tiers) {
    if (row.canClaim) {
      const r = claimSeasonTier(save, row.tier, now, opts);
      if (r.ok) results.push(r);
    }
  }
  return {
    ok: results.length > 0,
    claimedCount: results.length,
    results,
  };
}

export function equipSeasonTitle(save, titleId, now = new Date()) {
  const sn = ensureSeasonStruct(save, now);
  if (!sn) return { ok: false, reason: 'invalid_save' };
  if (!titleId) {
    sn.selectedTitle = '';
    return { ok: true, titleId: '' };
  }
  if (!SEASON_TITLE_IDS.includes(titleId) || !sn.ownedTitles.includes(titleId)) {
    return { ok: false, reason: 'unowned' };
  }
  sn.selectedTitle = titleId;
  return { ok: true, titleId };
}

export function equipBloodmoonSkinIfOwned(save) {
  return equipHeroSkin(save, 'zhou', 'zhou_bloodmoon');
}
