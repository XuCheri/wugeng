// 「敲更锣」大招（PLAN §3.5）：击杀攒气，满气后由 input.ultimate 触发。
// 半径 220 的震波，伤害 = 60 + 10 × 角色等级，附带强力击退。

import { ULT } from './balance.js';
import { damageCircle } from './combat.js';

export function ultReady(run) {
  return run.player.ult >= run.player.ultMax;
}

/** 释放大招；force=true 时无视气量（复活时的自动敲锣） */
export function castUlt(run, force = false) {
  const p = run.player;
  if (!force && !ultReady(run)) return false;
  if (!force) p.ult = 0;
  const dmg = ULT.baseDmg + ULT.perLevelDmg * p.level;
  damageCircle(run, p.x, p.y, ULT.radius, dmg, 'ult', { knock: ULT.knockback });
  run.projectiles.push({
    id: run._nextId++, kind: 'ultPulse', x: p.x, y: p.y, r: ULT.radius, angle: 0, t: 0, life: ULT.pulseLife,
    weaponId: 'ult', radius: 0, maxRadius: ULT.radius,
  });
  run.events.push({ type: 'ult', x: p.x, y: p.y });
  run.stats.ultsCast = (run.stats.ultsCast || 0) + 1;
  return true;
}

export function updateUltimate(run, input) {
  if (input && input.ultimate) castUlt(run);
}
