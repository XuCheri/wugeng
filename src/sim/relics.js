// 法器：把已拥有的法器折算成属性加成（PLAN §3.4 + F5）。

import { RELICS, RELIC_IDS, MAX_RELIC_LEVEL, MAX_RELICS } from './balance.js';

export function emptyRelicTotals() {
  return {
    cdr: 0,
    areaPct: 0,
    dmgPct: 0,
    durPct: 0,
    armor: 0,
    maxHp: 0,
    amount: 0,
    xpPct: 0,
    pickupPct: 0,
    critChance: 0,
    // +4 新增民俗法器属性（草鞋、糯米、五帝钱、引魂灯芯）
    speedPct: 0,
    slowResist: 0,
    hurtInvuln: 0,
    killHeal: 0,
    critDmg: 0,
    coinPct: 0,
    lightPct: 0,
    ultChargePct: 0,
    ultCdRefund: 0,
    // +4 v3 新增法器属性（雷击枣木、勾魂阴牌）
    bonusPierce: 0,
    controlDurPct: 0,
  };
}

/** 单个法器在 level 级时的累计效果 */
export function relicEffect(id, level) {
  const out = emptyRelicTotals();
  const def = typeof id === 'string' && Object.hasOwn(RELICS, id) ? RELICS[id] : null;
  if (!def || level <= 0) return out;
  if (id === 'scissors') {
    // 剪刀：2 级、5 级各 +1 数量；其余每级伤害 +4%
    for (let l = 1; l <= level; l++) {
      if (def.amountLevels.includes(l)) out.amount += 1;
      else out.dmgPct += def.dmgPerOtherLevel;
    }
    return out;
  }
  if (Array.isArray(def.pierceLevels)) {
    for (let l = 1; l <= level; l++) {
      if (def.pierceLevels.includes(l)) out.bonusPierce += 1;
    }
  }
  if (def.perLevel) {
    for (const [k, v] of Object.entries(def.perLevel)) out[k] += v * level;
  }
  return out;
}

/** 汇总所有法器 */
export function relicTotals(relics) {
  const t = emptyRelicTotals();
  for (const r of relics) {
    const e = relicEffect(r.id, r.level);
    for (const k in t) t[k] += e[k];
  }
  return t;
}

/** 汇总已升至五阶满级觉醒的法器表：{ [relicId]: true } */
export function relicCapstones(relics) {
  const out = {};
  if (!Array.isArray(relics)) return out;
  for (const r of relics) {
    if (r && typeof r.id === 'string' && r.level >= MAX_RELIC_LEVEL && Object.hasOwn(RELICS, r.id)) {
      out[r.id] = true;
    }
  }
  return out;
}

export function hasRelic(run, id) {
  return run.relics.some((r) => r.id === id);
}

export function getRelic(run, id) {
  return run.relics.find((r) => r.id === id) || null;
}

/** 获得新法器或升一级；返回新等级，失败返回 0 */
export function addOrUpgradeRelic(run, id) {
  if (!RELIC_IDS.includes(id)) return 0;
  const r = getRelic(run, id);
  if (r) {
    if (r.level >= MAX_RELIC_LEVEL) return 0;
    r.level++;
    return r.level;
  }
  if (run.relics.length >= MAX_RELICS) return 0;
  run.relics.push({ id, level: 1 });
  return 1;
}
