// 更房：8 项永久加点。数值表以 src/sim/balance.js 为准（META_SHOP / metaBonusesFromLevels），
// 这里只做「读存档 → 换算加成」和「扣铜钱 → 升一级」。
// 用命名空间导入，balance.js 字段缺失时也不会在模块链接期报错，而是退回 PLAN §4.6 的默认值。
import * as balance from '../sim/balance.js';
import { SHOP_IDS, SHOP_MAX_LEVEL } from './save.js';

/** PLAN §4.6 价目表（与 balance.js 的 META_COSTS 一致），ℓ 为要升到的等级（1..5）。 */
const FALLBACK_COSTS = [60, 181, 347, 553, 794];
export function defaultCost(level) {
  return FALLBACK_COSTS[level - 1] ?? Infinity;
}

function fallbackBonuses(levels = {}) {
  const lv = (id) => Math.max(0, Math.min(SHOP_MAX_LEVEL, Math.floor(levels[id] || 0)));
  const r = (x) => Math.round(x * 1000) / 1000;
  return {
    maxHpPct: r(0.05 * lv('tizhi')),
    dmgPct: r(0.03 * lv('lidao')),
    speedPct: r(0.03 * lv('jiaoli')),
    pickupPct: r(0.06 * lv('yanli')),
    xpPct: r(0.03 * lv('wuxing')),
    coinPct: r(0.05 * lv('caiyun')),
    freeRerolls: (lv('jiyuan') >= 2 ? 1 : 0) + (lv('jiyuan') >= 4 ? 1 : 0),
    armor: (lv('huchi') >= 3 ? 1 : 0) + (lv('huchi') >= 5 ? 1 : 0),
  };
}

function normalizeShop() {
  const src = balance.META_SHOP;
  let list = [];
  if (Array.isArray(src)) list = src;
  else if (src && typeof src === 'object') list = Object.entries(src).map(([id, v]) => ({ id, ...v }));
  const byId = new Map(list.filter((x) => x && x.id).map((x) => [x.id, x]));
  return SHOP_IDS.map((id) => {
    const it = byId.get(id) || {};
    const maxLevel = Number.isFinite(it.maxLevel) ? it.maxLevel : SHOP_MAX_LEVEL;
    let costFn;
    if (Array.isArray(it.costs)) costFn = (l) => it.costs[l - 1] ?? Infinity;
    else if (Array.isArray(it.cost)) costFn = (l) => it.cost[l - 1] ?? Infinity;
    else if (typeof it.cost === 'function') costFn = (l) => it.cost(l);
    else if (typeof balance.metaCost === 'function') costFn = (l) => balance.metaCost(l, id);
    else if (typeof balance.metaShopCost === 'function') costFn = (l) => balance.metaShopCost(l, id);
    else costFn = defaultCost;
    return { id, name: it.name, desc: it.desc, maxLevel, costFn };
  });
}

const SHOP = normalizeShop();
const SHOP_BY_ID = new Map(SHOP.map((x) => [x.id, x]));

export function getShopItems() {
  return SHOP.map(({ id, name, desc, maxLevel }) => ({ id, name, desc, maxLevel }));
}

/** 某项在 level 级时的累计效果文案（balance.describeMeta 优先）。 */
export function describeLevel(id, level) {
  if (typeof balance.describeMeta === 'function') return balance.describeMeta(id, level);
  return '';
}

export function getLevel(save, id) {
  return Math.max(0, Math.floor(save?.shop?.[id] || 0));
}

/** 升到下一级的价格；已满级返回 null。 */
export function nextCost(save, id) {
  const it = SHOP_BY_ID.get(id);
  if (!it) return null;
  const lv = getLevel(save, id);
  if (lv >= it.maxLevel) return null;
  return it.costFn(lv + 1);
}

export function getMetaBonuses(save) {
  const levels = { ...(save?.shop || {}) };
  const fn = typeof balance.metaBonusesFromLevels === 'function' ? balance.metaBonusesFromLevels : fallbackBonuses;
  const out = { ...fallbackBonuses({}), ...fn(levels) };
  return out;
}

/**
 * 买一级：成功时扣铜钱并写入 save（调用方负责 saveSave）。
 * 返回 { ok, reason?: 'unknown'|'max'|'coins', cost, level }
 */
export function buyLevel(save, id) {
  const it = SHOP_BY_ID.get(id);
  if (!it) return { ok: false, reason: 'unknown', cost: null, level: 0 };
  const lv = getLevel(save, id);
  if (lv >= it.maxLevel) return { ok: false, reason: 'max', cost: null, level: lv };
  const cost = it.costFn(lv + 1);
  if (!(save.coins >= cost)) return { ok: false, reason: 'coins', cost, level: lv };
  save.coins -= cost;
  save.shop[id] = lv + 1;
  return { ok: true, cost, level: lv + 1 };
}

/** 全部 8 项的总进度 0..1（用于更房标题旁的小字）。 */
export function shopProgress(save) {
  let have = 0, total = 0;
  for (const it of SHOP) { have += Math.min(it.maxLevel, getLevel(save, it.id)); total += it.maxLevel; }
  return total ? have / total : 0;
}
