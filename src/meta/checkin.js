// 更簿：7 天累计签到。断签不重置——哪天来都接着上次的格子往下领。
// 日期一律用本地日历日 YYYY-MM-DD（由调用方注入 now，便于测试）。
// 防回拨：本地时间早于上次领取日时不能领。
import { RELIC_IDS } from './save.js';
import { recordCodexCharms } from './codex.js';

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

export function localDateString(now) {
  const d = now instanceof Date ? now : new Date(now);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 这一轮第 7 天会给哪件外观（全部拥有时为 null）。 */
export function nextCosmetic(save) {
  const owned = new Set(save.cosmetics?.owned || []);
  const prefer = (save.checkin?.cycles || 0) % 2 === 0 ? 'lantern' : 'outfit';
  return COSMETICS.find((c) => c.kind === prefer && !owned.has(c.id))
    || COSMETICS.find((c) => !owned.has(c.id))
    || null;
}

export function getCheckinState(save, now) {
  const today = localDateString(now);
  const last = save.checkin?.lastClaimDate || null;
  const cycleDay = Math.max(0, Math.min(6, save.checkin?.cycleDay || 0));
  const rollback = !!last && today < last;
  const claimedToday = !!last && today === last;
  const canClaim = !last || today > last;
  const cosmetic = nextCosmetic(save);
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
  const st = getCheckinState(save, now);
  if (!st.canClaim) {
    return { ok: false, reason: st.rollback ? 'rollback' : 'claimed', day: st.day, doubled: false, coins: 0, charms: [], cosmetic: null };
  }
  const row = CHECKIN_TABLE[st.day - 1];
  const mult = doubled ? 2 : 1;
  let coins = row.coins * mult;
  const charms = [];
  for (let i = 0; i < row.charms * mult; i++) {
    const idx = Math.min(RELIC_IDS.length - 1, Math.floor(rng() * RELIC_IDS.length));
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

  save.coins += coins;
  save.charms.push(...charms);
  recordCodexCharms(save, charms);
  save.checkin.lastClaimDate = st.today;
  save.checkin.totalClaims = (save.checkin.totalClaims || 0) + 1;
  if (st.day >= 7) {
    save.checkin.cycleDay = 0;
    save.checkin.cycles = (save.checkin.cycles || 0) + 1;
  } else {
    save.checkin.cycleDay = st.day;
  }
  return { ok: true, day: st.day, doubled: !!doubled, coins, charms, cosmetic: cosmetic ? { ...cosmetic } : null };
}
