// 更簿：7 天累计签到。断签不重置——哪天来都接着上次的格子往下领。
// 日期一律用本地日历日 YYYY-MM-DD（由调用方注入 now，便于测试）。
// 防回拨：本地时间早于上次领取日时不能领。
import {
  RELIC_IDS, isValidDateStr, toFiniteNumber,
  isPlainObj, canMutateObj, canWriteProp, canMutateArray,
} from './save.js';
import { recordCodexCharms, canMutateCodex } from './codex.js';

export const CHECKIN_TABLE = [
  { day: 1, coins: 30, charms: 0, cosmetic: false },
  { day: 2, coins: 40, charms: 1, cosmetic: false },
  { day: 3, coins: 50, charms: 0, cosmetic: false },
  { day: 4, coins: 60, charms: 1, cosmetic: false },
  { day: 5, coins: 70, charms: 0, cosmetic: false },
  { day: 6, coins: 80, charms: 1, cosmetic: false },
  { day: 7, coins: 0, charms: 0, cosmetic: true },
];
/** 第 7 天双倍：外观照给，另补一份第 6 天的铜钱。 */
export const DAY7_DOUBLE_BONUS = CHECKIN_TABLE[5].coins;
/** 外观全部集齐后，第 7 天改发铜钱。 */
export const COSMETIC_FALLBACK_COINS = 150;

export const COSMETICS = [
  { id: 'lantern_cinnabar', kind: 'lantern', name: '朱纱灯' },
  { id: 'outfit_indigo', kind: 'outfit', name: '靛青袍' },
  { id: 'lantern_plain', kind: 'lantern', name: '素绢灯' },
  { id: 'outfit_straw', kind: 'outfit', name: '蓑衣' },
  { id: 'lantern_lotus', kind: 'lantern', name: '莲花灯' },
  { id: 'outfit_ink', kind: 'outfit', name: '墨染长衫' },
  { id: 'lantern_carp', kind: 'lantern', name: '鲤鱼灯' },
  { id: 'outfit_hemp', kind: 'outfit', name: '麻布短打' },
];

const isObj = isPlainObj;
const ISO_TS_RE = /^(\d{4}-\d{2}-\d{2})[T\s]/;

function canMutateCheckinSave(save) {
  if (!canMutateObj(save)) return false;
  if (!canWriteProp(save, 'coins')) return false;

  if (isPlainObj(save.checkin)) {
    const ck = save.checkin;
    if (!canMutateObj(ck)) return false;
    for (const k of ['cycleDay', 'lastClaimDate', 'cycles', 'totalClaims']) {
      if (!canWriteProp(ck, k)) return false;
    }
  } else if (!canWriteProp(save, 'checkin')) {
    return false;
  }

  if (Array.isArray(save.charms)) {
    if (!canMutateArray(save.charms)) return false;
  } else if (!canWriteProp(save, 'charms')) {
    return false;
  }

  if (isPlainObj(save.cosmetics)) {
    const cos = save.cosmetics;
    if (!canMutateObj(cos)) return false;
    if (Array.isArray(cos.owned)) {
      if (!canMutateArray(cos.owned)) return false;
    } else if (!canWriteProp(cos, 'owned')) {
      return false;
    }
    if (isPlainObj(cos.equipped)) {
      if (!canMutateObj(cos.equipped)) return false;
      for (const slot of ['lantern', 'outfit']) {
        if (!canWriteProp(cos.equipped, slot)) return false;
      }
    } else if (!canWriteProp(cos, 'equipped')) {
      return false;
    }
  } else if (!canWriteProp(save, 'cosmetics')) {
    return false;
  }

  if (!canMutateCodex(save)) return false;
  return true;
}

function formatLocalDate(d) {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  if (y < 1970 || y > 2999) return null;
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const out = `${String(y).padStart(4, '0')}-${m}-${day}`;
  return isValidDateStr(out) ? out : null;
}

export function localDateString(now) {
  if (now instanceof Date) return formatLocalDate(now);
  if (typeof now === 'number') {
    if (!Number.isFinite(now)) return null;
    return formatLocalDate(new Date(now));
  }
  if (typeof now === 'string') {
    const s = now.trim();
    if (!s) return null;
    if (s.length === 10) return isValidDateStr(s) ? s : null;
    const m = ISO_TS_RE.exec(s);
    if (!m || !isValidDateStr(m[1])) return null;
    return formatLocalDate(new Date(s));
  }
  return null;
}

/** 这一轮第 7 天会给哪件外观（全部拥有时为 null）。 */
export function nextCosmetic(save) {
  const rawCos = isPlainObj(save) && isPlainObj(save.cosmetics) ? save.cosmetics : null;
  const rawOwned = rawCos && Array.isArray(rawCos.owned) ? rawCos.owned : [];
  const owned = new Set(rawOwned);
  const rawCk = isPlainObj(save) && isPlainObj(save.checkin) ? save.checkin : null;
  const rawCycles = rawCk ? toFiniteNumber(rawCk.cycles) : NaN;
  const cycles = Number.isFinite(rawCycles) && rawCycles >= 0 ? Math.floor(rawCycles) : 0;
  const prefer = cycles % 2 === 0 ? 'lantern' : 'outfit';
  return COSMETICS.find((c) => c.kind === prefer && !owned.has(c.id))
    || COSMETICS.find((c) => !owned.has(c.id))
    || null;
}

export function getCheckinState(save, now) {
  const today = localDateString(now);
  const s = isPlainObj(save) ? save : null;
  const ck = s && isPlainObj(s.checkin) ? s.checkin : null;
  const rawLast = ck ? ck.lastClaimDate : null;
  const last = isValidDateStr(rawLast) ? rawLast : null;
  const rawCycleDay = ck ? toFiniteNumber(ck.cycleDay) : NaN;
  const cycleDay = Number.isFinite(rawCycleDay) ? Math.max(0, Math.min(6, Math.floor(rawCycleDay))) : 0;
  const validToday = today !== null;
  const rollback = validToday && !!last && today < last;
  const claimedToday = validToday && !!last && today === last;
  const canClaim = !!s && validToday && (!last || today > last);
  const cosmetic = nextCosmetic(s);
  const rewards = CHECKIN_TABLE.map((r, i) => ({
    ...r,
    cosmeticItem: r.cosmetic ? cosmetic : null,
    claimed: i < cycleDay,
    current: i === cycleDay,
  }));
  return { day: cycleDay + 1, canClaim, claimedToday, rollback, today, rewards };
}

/**
 * 领取当天奖励并写入 save（调用方负责 saveSave）。
 * doubled = 看完广告。返回 reward：
 * { ok, reason?, day, doubled, coins, charms: [{relicId}], cosmetic: {id,kind,name}|null }
 */
export function claimCheckin(save, now, doubled = false, rng = Math.random) {
  if (!canMutateCheckinSave(save)) {
    const rawCk = isPlainObj(save) && isPlainObj(save.checkin) ? save.checkin : null;
    const rawCycleDay = rawCk ? toFiniteNumber(rawCk.cycleDay) : NaN;
    const d = Number.isFinite(rawCycleDay) ? Math.max(0, Math.min(6, Math.floor(rawCycleDay))) + 1 : 1;
    return { ok: false, reason: 'invalid_save', day: d, doubled: false, coins: 0, charms: [], cosmetic: null };
  }
  const st = getCheckinState(save, now);
  if (st.today === null) {
    return { ok: false, reason: 'invalid_date', day: st.day, doubled: false, coins: 0, charms: [], cosmetic: null };
  }
  if (!st.canClaim) {
    return { ok: false, reason: st.rollback ? 'rollback' : 'claimed', day: st.day, doubled: false, coins: 0, charms: [], cosmetic: null };
  }

  if (!isObj(save.checkin)) {
    save.checkin = { cycleDay: 0, lastClaimDate: null, cycles: 0, totalClaims: 0 };
  } else if (!isValidDateStr(save.checkin.lastClaimDate)) {
    save.checkin.lastClaimDate = null;
  }
  if (!Array.isArray(save.charms)) save.charms = [];
  if (!isObj(save.cosmetics)) {
    save.cosmetics = { owned: [], equipped: { lantern: null, outfit: null } };
  } else {
    if (!Array.isArray(save.cosmetics.owned)) save.cosmetics.owned = [];
    if (!isObj(save.cosmetics.equipped)) save.cosmetics.equipped = { lantern: null, outfit: null };
  }
  const baseCoins = toFiniteNumber(save.coins);
  save.coins = Number.isFinite(baseCoins) && baseCoins >= 0 ? Math.min(1e12, Math.floor(baseCoins)) : 0;

  const row = CHECKIN_TABLE[st.day - 1];
  const mult = doubled ? 2 : 1;
  let coins = row.coins * mult;
  const charms = [];
  const fn = typeof rng === 'function' ? rng : Math.random;
  for (let i = 0; i < row.charms * mult; i++) {
    let rawR = NaN;
    try { rawR = toFiniteNumber(fn()); } catch { rawR = NaN; }
    const idx = Number.isFinite(rawR)
      ? Math.max(0, Math.min(RELIC_IDS.length - 1, Math.floor(rawR * RELIC_IDS.length)))
      : 0;
    charms.push({ relicId: RELIC_IDS[idx] });
  }
  let cosmetic = null;
  if (row.cosmetic) {
    cosmetic = nextCosmetic(save);
    if (cosmetic) {
      save.cosmetics.owned.push(cosmetic.id);
      if (!save.cosmetics.equipped[cosmetic.kind]) save.cosmetics.equipped[cosmetic.kind] = cosmetic.id;
    } else {
      coins += COSMETIC_FALLBACK_COINS;
    }
    if (doubled) coins += DAY7_DOUBLE_BONUS;
  }

  save.coins = Math.min(1e12, save.coins + coins);
  save.charms.push(...charms);
  recordCodexCharms(save, charms);
  save.checkin.lastClaimDate = st.today;
  const prevClaims = toFiniteNumber(save.checkin.totalClaims);
  save.checkin.totalClaims = Math.min(1e9, (Number.isFinite(prevClaims) && prevClaims >= 0 ? Math.floor(prevClaims) : 0) + 1);
  if (st.day >= 7) {
    save.checkin.cycleDay = 0;
    const prevCycles = toFiniteNumber(save.checkin.cycles);
    save.checkin.cycles = Math.min(1e9, (Number.isFinite(prevCycles) && prevCycles >= 0 ? Math.floor(prevCycles) : 0) + 1);
  } else {
    save.checkin.cycleDay = st.day;
  }
  return { ok: true, day: st.day, doubled: !!doubled, coins, charms, cosmetic: cosmetic ? { ...cosmetic } : null };
}
