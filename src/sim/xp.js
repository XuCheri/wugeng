// 经验与升级（PLAN §4.1）。升级不会立即弹三选一，而是累积到 run._pendingLevels，
// 由 run.js 在本帧末尾切换到 status='levelup'。

import { xpForLevel, XP_PACE_MUL } from './balance.js';

/** 获得经验（已乘节奏补偿与经验加成之前的原始值） */
export function gainXp(run, rawValue) {
  const p = run.player;
  p.xp += rawValue * XP_PACE_MUL * run.mods.xpMul;
  while (p.xp >= p.xpNext) {
    p.xp -= p.xpNext;
    p.level++;
    p.xpNext = xpForLevel(p.level);
    run._pendingLevels++;
    run.events.push({ type: 'levelup', level: p.level });
  }
}

/** 升到 level 级累计需要的经验 */
export function totalXpToLevel(level) {
  let s = 0;
  for (let L = 1; L < level; L++) s += xpForLevel(L);
  return s;
}

export { xpForLevel };
