// 玩家：创建、属性汇总（法器 + 英雄 + 更房）、移动、受伤与治疗。

import { PLAYER_BASE, HEROES, ULT, xpForLevel, cooldownMul, damageTaken } from './balance.js';
import { relicTotals } from './relics.js';
import { clamp } from '../core/math.js';

export function createPlayer(heroId) {
  return {
    x: 0,
    y: 0,
    r: PLAYER_BASE.r,
    hp: PLAYER_BASE.maxHp,
    maxHp: PLAYER_BASE.maxHp,
    armor: PLAYER_BASE.armor,
    speed: PLAYER_BASE.speed,
    level: 1,
    xp: 0,
    xpNext: xpForLevel(1),
    facingX: 0,
    facingY: -1,
    moving: false,
    ult: 0,
    ultMax: ULT.max,
    invulnT: 0,
    hurtT: 0,
    heroId,
  };
}

/**
 * 重新计算派生属性 run.mods，并同步到 player 上的公开字段。
 * 增伤%（朱砂、剪刀、更房）全部加算；开光倍率和溢出签在伤害结算时乘算。
 */
export function recomputeMods(run) {
  const rel = relicTotals(run.relics);
  const hero = HEROES[run.heroId]?.mods || {};
  const meta = run.meta;
  const prevMax = run.player.maxHp;
  const overflowMult = run.mods ? run.mods.overflowMult : 1;
  const overflowStacks = run.mods ? run.mods.overflowStacks : 0;

  const mods = {
    dmgPct: rel.dmgPct + (meta.dmgPct || 0),
    summonDmgPct: hero.summonDmgPct || 0,
    cdr: rel.cdr,
    cdMul: cooldownMul(rel.cdr),
    areaMul: 1 + rel.areaPct,
    durMul: 1 + rel.durPct,
    amount: rel.amount,
    critChance: PLAYER_BASE.critChance + rel.critChance + (hero.critChance || 0),
    xpMul: (1 + rel.xpPct + (meta.xpPct || 0)) * run.night.xpMul,
    pickupRange: PLAYER_BASE.pickupRange * (1 + rel.pickupPct + (meta.pickupPct || 0)),
    ultChargeMul: 1 + (hero.ultChargePct || 0),
    overflowMult,
    overflowStacks,
  };
  run.mods = mods;

  const p = run.player;
  p.armor = PLAYER_BASE.armor + rel.armor + (meta.armor || 0);
  p.maxHp = Math.round((PLAYER_BASE.maxHp + rel.maxHp) * (1 + (meta.maxHpPct || 0) + (hero.maxHpPct || 0)));
  p.speed = PLAYER_BASE.speed * (1 + (meta.speedPct || 0));
  // 最大生命提升时，当前生命同步增加相同数值
  if (p.maxHp > prevMax) p.hp += p.maxHp - prevMax;
  p.hp = Math.min(p.hp, p.maxHp);
  return mods;
}

/** 移动：input.moveX/moveY 已归一化（长度 ≤ 1） */
export function updatePlayer(run, input, dt) {
  const p = run.player;
  let mx = +input?.moveX || 0;
  let my = +input?.moveY || 0;
  const l = Math.hypot(mx, my);
  if (l > 1) {
    mx /= l;
    my /= l;
  }
  p.moving = l > 0.05;
  if (p.moving) {
    const inv = 1 / Math.max(l, 1e-6);
    p.facingX = mx * inv;
    p.facingY = my * inv;
  }
  const spd = p.speed * (run._auraSlow || 1);
  p.x += mx * spd * dt;
  p.y += my * spd * dt;
  if (p.invulnT > 0) p.invulnT = Math.max(0, p.invulnT - dt);
  if (p.hurtT > 0) p.hurtT = Math.max(0, p.hurtT - dt);
}

/** 玩家受伤：max(1, 原始 − 护甲)；返回实际伤害 */
export function hurtPlayer(run, raw) {
  const p = run.player;
  if (p.invulnT > 0 || p.hp <= 0) return 0;
  const dmg = damageTaken(raw, p.armor);
  p.hp = Math.max(0, p.hp - dmg);
  p.hurtT = PLAYER_BASE.hurtFlash;
  run.events.push({ type: 'playerHurt', amount: dmg });
  run._tele.taken += dmg;
  return dmg;
}

export function healPlayer(run, amount) {
  const p = run.player;
  const before = p.hp;
  p.hp = clamp(p.hp + amount, 0, p.maxHp);
  return p.hp - before;
}

