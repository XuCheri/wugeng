// 战斗结算：对敌人造成伤害、击杀处理（掉落、分裂、Boss 结算）、范围伤害。
// 伤害公式（PLAN §4.2）：D = B × (1 + Σ增伤%) × Crit × M开光 × 溢出签
// 其中 raw 参数已含 B × M开光（由武器在发射时算好），这里补上增伤、暴击、溢出。

import { PLAYER_BASE, DAMAGE, ULT, PICKUPS, ENEMY_AI, BOSS_AI, ELITE } from './balance.js';
import { dropXp, dropPickup } from './pickups.js';
import { queueSpawn } from './enemies.js';
import { onBossKilled } from './bosses.js';
import { hitPropsCircle } from './props.js';

/**
 * 对单个敌人造成伤害；返回实际伤害（整数）。
 * opts.burst：被这次伤害打死的敌人会爆开（长明灯）
 * opts.noCrit：不判定暴击
 */
export function damageEnemy(run, e, raw, weaponId, opts) {
  if (e.dead || raw <= 0) return 0;
  const m = run.mods;
  let dmg = raw * (1 + m.dmgPct + (weaponId === 'paperman' ? m.summonDmgPct : 0)) * m.overflowMult;
  const crit = !(opts && opts.noCrit) && run.rng.next() < m.critChance;
  if (crit) dmg *= PLAYER_BASE.critMult;
  // 无面伞女撑伞时减伤
  if (e.type === 'umbrella' && e.state === 'shield') dmg *= 1 - BOSS_AI.umbrella.shieldDr;
  dmg = Math.max(1, Math.round(dmg));
  e.hp -= dmg;
  e.hitT = DAMAGE.hitFlash;
  const st = run.stats;
  st.damageDealt += dmg;
  if (dmg > st.maxHit) st.maxHit = dmg;
  run._tele.dmg += dmg;
  if (!e.boss) run._tele.dmgNonBoss += dmg;
  run.events.push({ type: 'hit', x: e.x, y: e.y, amount: dmg, crit, enemyId: e.id, weaponId });
  if (e.hp <= 0) killEnemy(run, e, opts);
  return dmg;
}

/** 击退：沿 (dx,dy) 方向施加速度（Boss 几乎免疫） */
export function knockback(e, dx, dy, force) {
  const l = Math.hypot(dx, dy) || 1;
  const k = e.boss ? BOSS_AI.knockbackMul : 1;
  e.kbx += (dx / l) * force * k;
  e.kby += (dy / l) * force * k;
}

/** 击杀：事件、攒气、掉落、分裂、Boss 结算 */
export function killEnemy(run, e, opts) {
  if (e.dead) return;
  e.dead = true;
  e.hp = 0;
  const st = run.stats;
  st.kills++;
  st.killsByType[e.type] = (st.killsByType[e.type] || 0) + 1;
  run.events.push({ type: 'kill', x: e.x, y: e.y, enemyType: e.type, elite: e.elite, boss: e.boss });

  // 大招攒气：普通击杀随时间衰减，精英 / Boss 固定
  const p = run.player;
  let charge;
  if (e.boss) charge = ULT.bossCharge;
  else if (e.elite) charge = ULT.eliteCharge;
  else charge = ULT.killCharge / (1 + ULT.decayPerMin * (run.time / 60));
  if (!e.summoned || e.elite) p.ult = Math.min(p.ultMax, p.ult + charge * run.mods.ultChargeMul);

  // 掉落
  if (e.xp > 0) dropXp(run, e.x, e.y, e.xp, e.boss ? PICKUPS.bossXpSplit : 1);
  if (e.boss) {
    dropPickup(run, 'coin', e.x + 18, e.y, PICKUPS.bossCoinValue);
    onBossKilled(run, e);
  } else if (e.elite) {
    dropPickup(run, 'coin', e.x + 10, e.y, PICKUPS.eliteCoinValue);
    if (run.rng.chance(ELITE.bannerChance)) dropPickup(run, 'banner', e.x - 10, e.y, 0);
  } else if (run.rng.chance(PICKUPS.coinChance)) {
    dropPickup(run, 'coin', e.x, e.y, PICKUPS.coinValue);
  }

  // 纸轿子裂成纸扎童子
  if (e.type === 'sedan') {
    const s = ENEMY_AI.sedan;
    for (let i = 0; i < s.splitCount; i++) {
      const a = (i / s.splitCount) * Math.PI * 2 + run.rng.range(-0.3, 0.3);
      queueSpawn(run, s.splitType, e.x + Math.cos(a) * s.splitSpread, e.y + Math.sin(a) * s.splitSpread, { summoned: false, split: true });
    }
  }

  // 长明灯：被灼烧致死的敌人爆开（延迟到下一次 scheduled 处理，避免在查询中递归）
  if (opts && opts.burst) {
    run._scheduled.push({ delay: 0, type: 'explosion', x: e.x, y: e.y, radius: opts.burst.radius, dmg: opts.burst.dmg, weaponId: opts.burst.weaponId });
  }
}

/**
 * 圆形范围伤害（敌人 + 可破坏灯笼柱）。返回命中数。
 * opts.knock：击退力度；opts.stun：定身秒数；opts.slow：减速秒数；opts.burst 见 damageEnemy
 */
export function damageCircle(run, x, y, r, raw, weaponId, opts) {
  const list = run._sys.hash.queryCircle(x, y, r, run._sys.scratchArea);
  let n = 0;
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (e.dead) continue;
    if (opts) {
      if (opts.knock) knockback(e, e.x - x, e.y - y, opts.knock);
      if (opts.stun && !e.boss) e.stunT = Math.max(e.stunT, opts.stun);
      if (opts.slow) e.slowT = Math.max(e.slowT, opts.slow);
    }
    damageEnemy(run, e, raw, weaponId, opts);
    n++;
  }
  hitPropsCircle(run, x, y, r);
  return n;
}
