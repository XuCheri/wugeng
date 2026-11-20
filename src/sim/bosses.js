// Boss：纸马将军（三连冲锋）、无面伞女（撑伞减伤 + 纸钱弹幕）、夜游神（召唤 → 弹幕 → 狂暴）。
// updateBoss 返回本帧期望速度，由 enemies.js 统一积分位置。

import { ENEMIES, BOSS_AI, SPAWN, ENDLESS, DARKNESS } from './balance.js';
import { spawnEnemy, queueSpawn } from './enemies.js';
import { dropPickup } from './pickups.js';

const V = { x: 0, y: 0 };

/** 生成 Boss。opts.chest：死亡掉供盒；opts.final：最终 Boss（打败即通关） */
export function spawnBoss(run, type, opts = {}) {
  const p = run.player;
  const a = run.rng.range(0, Math.PI * 2);
  const e = spawnEnemy(run, type, p.x + Math.cos(a) * BOSS_AI.spawnDist, p.y + Math.sin(a) * BOSS_AI.spawnDist);
  // Boss 血量不吃分钟成长，只吃夜色 / 夜色词缀 / 无尽成长
  let hp = ENEMIES[type].hp * (1 + SPAWN.nightHpGrowth * run.nightLevel) * run.night.bossHpMul * BOSS_AI.hpMul * (BOSS_AI[type]?.hpMul || 1);
  if (run.mode === 'endless') hp *= ENDLESS.bossHpMul * Math.pow(ENDLESS.hpGrowth, Math.max(0, (run.time - run._endlessStart) / 60));
  e.hp = e.maxHp = Math.round(hp);
  e.chest = !!opts.chest;
  e.final = !!opts.final;
  e.phase = 1;
  e.dmgMul = 1;
  e._fireT = BOSS_AI.firstAttackDelay;
  e._summonT = 1;
  e._spiralA = 0;
  e._charges = 0;
  if (type === 'horse') {
    e.state = 'chase';
    e.stateT = BOSS_AI.horse.chase;
  } else if (type === 'umbrella') {
    e.state = 'shield';
    e.stateT = BOSS_AI.umbrella.shieldTime;
  } else {
    e.state = 'summon';
  }
  run.boss = { id: e.id, type, hp: e.hp, maxHp: e.maxHp, phase: 1 };
  run.events.push({ type: 'bossSpawn', bossType: type });
  return e;
}

function fireBullet(run, x, y, angle, speed, dmg, r, life, style) {
  run.projectiles.push({
    id: run._nextId++, kind: 'enemyBullet', x, y, r, angle, t: 0, life,
    vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, style, dmg,
  });
}

function ring(run, e, count, offset, cfg, style) {
  for (let i = 0; i < count; i++) {
    const a = offset + (i / count) * Math.PI * 2;
    fireBullet(run, e.x, e.y, a, cfg.bulletSpeed, cfg.bulletDmg, cfg.bulletR, cfg.bulletLife, style);
  }
}

export function updateBoss(run, e, dt, tx, ty, d) {
  V.x = 0;
  V.y = 0;
  const p = run.player;
  // 拴绳：离玩家太远就拉回到屏幕边缘
  if (d > BOSS_AI.leashDist) {
    e.x = p.x - tx * BOSS_AI.spawnDist;
    e.y = p.y - ty * BOSS_AI.spawnDist;
  }
  if (e.type === 'horse') horse(run, e, dt, tx, ty);
  else if (e.type === 'umbrella') umbrella(run, e, dt, tx, ty);
  else youshen(run, e, dt, tx, ty);
  if (run.boss && run.boss.id === e.id) {
    run.boss.hp = Math.max(0, e.hp);
    run.boss.phase = e.phase;
  }
  return V;
}

function lockCharge(e, tx, ty) {
  e.dx = tx;
  e.dy = ty;
  e.angle = Math.atan2(ty, tx);
}

function horse(run, e, dt, tx, ty) {
  const H = BOSS_AI.horse;
  e.dmgMul = 1;
  switch (e.state) {
    case 'chase':
      V.x = tx * e.speed;
      V.y = ty * e.speed;
      e.angle = Math.atan2(ty, tx);
      if (e.stateT <= 0) {
        e.state = 'windup';
        e.stateT = H.windup;
        e._charges = 0;
        lockCharge(e, tx, ty);
      }
      break;
    case 'windup':
      // 蓄力：冲锋方向在蓄力开始时锁定（e.angle），渲染层可据此画出预警线，玩家横移即可躲开
      if (e.stateT <= 0) {
        e.state = 'charge';
        e.stateT = H.chargeTime;
      }
      break;
    case 'charge':
      V.x = e.dx * H.chargeSpeed;
      V.y = e.dy * H.chargeSpeed;
      e.dmgMul = H.chargeDmgMul;
      if (e.stateT <= 0) {
        e._charges++;
        if (e._charges >= H.charges) {
          e.state = 'rest';
          e.stateT = H.rest;
        } else {
          e.state = 'windup';
          e.stateT = H.gap + H.windup * H.rewindMul;
          lockCharge(e, tx, ty);
        }
      }
      break;
    default: // rest
      if (e.stateT <= 0) {
        e.state = 'chase';
        e.stateT = H.chase;
      }
  }
}

function umbrella(run, e, dt, tx, ty) {
  const U = BOSS_AI.umbrella;
  if (e.state === 'shield') {
    e.phase = 1;
    e.angle += U.spinSpeed * dt; // 伞面旋转
    V.x = tx * e.speed * U.shieldMoveMul;
    V.y = ty * e.speed * U.shieldMoveMul;
    e._fireT -= dt;
    if (e._fireT <= 0) {
      e._fireT = U.ringInterval;
      ring(run, e, U.ringCount, e.angle, U, 'paperMoney');
    }
    if (e.stateT <= 0) {
      e.state = 'open';
      e.stateT = U.openTime;
    }
  } else {
    e.phase = 2;
    V.x = tx * e.speed;
    V.y = ty * e.speed;
    if (e.stateT <= 0) {
      e.state = 'shield';
      e.stateT = U.shieldTime;
      e._fireT = U.firstRingDelay;
    }
  }
}

function youshen(run, e, dt, tx, ty) {
  const Y = BOSS_AI.youshen;
  const ratio = e.hp / e.maxHp;
  e.phase = ratio > Y.phase2At ? 1 : ratio > Y.phase3At ? 2 : 3;
  e.state = e.phase === 1 ? 'summon' : e.phase === 2 ? 'barrage' : 'enrage';
  const spd = e.speed * (e.phase === 3 ? Y.enrageSpeedMul : 1);
  V.x = tx * spd;
  V.y = ty * spd;
  e.angle = Math.atan2(ty, tx);
  // 召唤：阶段 1 和 3
  if (e.phase !== 2) {
    e._summonT -= dt;
    if (e._summonT <= 0) {
      e._summonT = e.phase === 3 ? Y.enrageSummonInterval : Y.summonInterval;
      const type = run.rng.pick(Y.summonTypes);
      for (let i = 0; i < Y.summonCount; i++) {
        const a = (i / Y.summonCount) * Math.PI * 2;
        queueSpawn(run, type, e.x + Math.cos(a) * Y.summonDist, e.y + Math.sin(a) * Y.summonDist, { summoned: true });
      }
    }
  }
  // 弹幕：阶段 2 螺旋，阶段 3 圆环
  e._fireT -= dt;
  if (e.phase === 2 && e._fireT <= 0) {
    e._fireT = Y.spiralInterval;
    e._spiralA += Y.spiralTurn;
    for (let k = 0; k < Y.spiralArms; k++) {
      fireBullet(run, e.x, e.y, e._spiralA + (k / Y.spiralArms) * Math.PI * 2, Y.bulletSpeed, Y.bulletDmg, Y.bulletR, Y.bulletLife, 'ink');
    }
  } else if (e.phase === 3 && e._fireT <= 0) {
    e._fireT = Y.enrageRingInterval;
    e._spiralA += Y.ringTurn;
    ring(run, e, Y.enrageRingCount, e._spiralA, Y, 'ink');
  }
}

/** Boss 被打败：事件、供盒、通关 */
export function onBossKilled(run, e) {
  run.events.push({ type: 'bossDefeated', bossType: e.type });
  if (e.chest) dropPickup(run, 'chest', e.x, e.y, 0);
  // Boss 血条切到另一只仍存活的 Boss（若有）
  run.boss = null;
  for (const o of run.enemies) {
    if (o.boss && !o.dead && o !== e) run.boss = { id: o.id, type: o.type, hp: o.hp, maxHp: o.maxHp, phase: o.phase };
  }
  if (e.final && run.mode === 'main') {
    // 鸡鸣天亮：通关
    run.status = 'cleared';
    run.watch = 6;
    run.darkness = DARKNESS.dawn;
    run.events.push({ type: 'dawn' });
    for (const pr of run.projectiles) if (pr.kind === 'enemyBullet') pr.dead = true;
  }
}
