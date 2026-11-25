// Boss：纸马将军（三连冲锋 + 预警走廊）、无面伞女（撑伞减伤 + 纸钱弹幕）、
// 夜游神（召唤 → 弹幕 → 狂暴追击 + 蓄力挥戟突刺预警）。

import { ENEMIES, BOSS_AI, SPAWN, ENDLESS, DARKNESS, MAIN_DURATION } from './balance.js';
import { clamp } from '../core/math.js';
import { spawnEnemy, queueSpawn, setTelegraph, clearTelegraph } from './enemies.js';
import { dropPickup } from './pickups.js';
import { coopHpScale, coopPartySize, nearestLivingPlayer } from './coop.js';

const V = { x: 0, y: 0 };

/** 生成 Boss。opts.chest：死亡掉供盒；opts.final：最终 Boss（打败即通关） */
export function spawnBoss(run, type, opts = {}) {
  const p =
    run.player?.downed && coopPartySize(run) > 1
      ? nearestLivingPlayer(run, run.player.x, run.player.y)
      : run.player;
  const a = run.rng.range(0, Math.PI * 2);
  const e = spawnEnemy(run, type, p.x + Math.cos(a) * BOSS_AI.spawnDist, p.y + Math.sin(a) * BOSS_AI.spawnDist);
  let hp =
    ENEMIES[type].hp *
    (1 + SPAWN.nightHpGrowth * run.nightLevel) *
    run.night.bossHpMul *
    BOSS_AI.hpMul *
    (BOSS_AI[type]?.hpMul || 1) *
    coopHpScale(run);
  if (run.mode === 'endless') {
    const es = Number.isFinite(run._endlessStart) && run._endlessStart > 0
      ? run._endlessStart
      : Math.min(Math.max(0, run.time || 0), MAIN_DURATION);
    hp *= ENDLESS.bossHpMul * Math.pow(ENDLESS.hpGrowth, Math.max(0, (run.time - es) / 60));
  }
  e.hp = e.maxHp = Math.round(hp);
  e.chest = !!opts.chest;
  e.final = !!opts.final;
  e.phase = 1;
  e.dmgMul = 1;
  e._fireT = BOSS_AI.firstAttackDelay;
  e._summonT = 1;
  e._spiralA = 0;
  e._charges = 0;
  e._windupTotal = 0;
  e._lungeCd = BOSS_AI.youshen.lungeEvery * 0.6;
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
    id: run._nextId++,
    kind: 'enemyBullet',
    x,
    y,
    r,
    angle,
    t: 0,
    life,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    style,
    dmg,
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
  if (d > BOSS_AI.leashDist) {
    e.x = p.x - tx * BOSS_AI.spawnDist;
    e.y = p.y - ty * BOSS_AI.spawnDist;
  }
  if (e.type === 'horse') horse(run, e, dt, tx, ty);
  else if (e.type === 'umbrella') umbrella(run, e, dt, tx, ty);
  else youshen(run, e, dt, tx, ty, d);
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
  const telLen = H.chargeSpeed * H.chargeTime + e.r;
  const telWid = e.r * 2;
  e.dmgMul = 1;
  switch (e.state) {
    case 'chase':
      clearTelegraph(e);
      V.x = tx * e.speed;
      V.y = ty * e.speed;
      e.angle = Math.atan2(ty, tx);
      if (e.stateT <= 0) {
        e.state = 'windup';
        e.stateT = H.windup;
        e._windupTotal = H.windup;
        e._charges = 0;
        lockCharge(e, tx, ty);
        setTelegraph(e, telLen, telWid, 0.02);
      }
      break;
    case 'windup': {
      const total = e._windupTotal || H.windup;
      setTelegraph(e, telLen, telWid, clamp(1 - Math.max(0, e.stateT) / total, 0.01, 1));
      if (e.stateT <= 0) {
        e.state = 'charge';
        e.stateT = H.chargeTime;
        clearTelegraph(e);
      }
      break;
    }
    case 'charge':
      clearTelegraph(e);
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
          e._windupTotal = e.stateT;
          lockCharge(e, tx, ty);
          setTelegraph(e, telLen, telWid, 0.02);
        }
      }
      break;
    default:
      clearTelegraph(e);
      if (e.stateT <= 0) {
        e.state = 'chase';
        e.stateT = H.chase;
      }
  }
}

function umbrella(run, e, dt, tx, ty) {
  const U = BOSS_AI.umbrella;
  clearTelegraph(e);
  if (e.state === 'shield') {
    e.phase = 1;
    e.angle += U.spinSpeed * dt;
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

function youshen(run, e, dt, tx, ty, d) {
  const Y = BOSS_AI.youshen;
  const ratio = e.hp / e.maxHp;
  const nextPhase = ratio > Y.phase2At ? 1 : ratio > Y.phase3At ? 2 : 3;

  if (nextPhase < 3) {
    e.phase = nextPhase;
    e.state = e.phase === 1 ? 'summon' : 'barrage';
    e.dmgMul = 1;
    clearTelegraph(e);
    V.x = tx * e.speed;
    V.y = ty * e.speed;
    e.angle = Math.atan2(ty, tx);
  } else {
    if (e.phase !== 3) {
      e.phase = 3;
      e.state = 'enrage';
      e._lungeCd = 2.2;
    }
    const telLen = Y.lungeSpeed * Y.lungeTime + e.r;
    const telWid = Math.round(e.r * 1.8);

    if (e.state === 'windup') {
      e.dmgMul = 1;
      V.x = 0;
      V.y = 0;
      setTelegraph(e, telLen, telWid, clamp(1 - Math.max(0, e.stateT) / Y.lungeWindup, 0.01, 1));
      if (e.stateT <= 0) {
        e.state = 'lunge';
        e.stateT = Y.lungeTime;
        clearTelegraph(e);
      }
    } else if (e.state === 'lunge') {
      clearTelegraph(e);
      e.dmgMul = Y.lungeDmgMul;
      V.x = e.dx * Y.lungeSpeed;
      V.y = e.dy * Y.lungeSpeed;
      if (e.stateT <= 0) {
        e.state = 'recover';
        e.stateT = Y.lungeRecover;
        e.dmgMul = 1;
        e._lungeCd = Y.lungeEvery;
      }
    } else if (e.state === 'recover') {
      clearTelegraph(e);
      e.dmgMul = 1;
      const spd = e.speed * Y.enrageSpeedMul * 0.35;
      V.x = tx * spd;
      V.y = ty * spd;
      e.angle = Math.atan2(ty, tx);
      if (e.stateT <= 0) {
        e.state = 'enrage';
      }
    } else {
      e.state = 'enrage';
      clearTelegraph(e);
      e.dmgMul = 1;
      const spd = e.speed * Y.enrageSpeedMul;
      V.x = tx * spd;
      V.y = ty * spd;
      e.angle = Math.atan2(ty, tx);
      e._lungeCd = (e._lungeCd ?? Y.lungeEvery) - dt;
      if (e._lungeCd <= 0 && d <= 340) {
        e.state = 'windup';
        e.stateT = Y.lungeWindup;
        lockCharge(e, tx, ty);
        setTelegraph(e, telLen, telWid, 0.02);
      }
    }
  }

  const lunging = e.state === 'windup' || e.state === 'lunge';
  if (!lunging && e.phase !== 2) {
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

  if (!lunging) {
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
}

/** Boss 被打败：事件、供盒、通关 */
export function onBossKilled(run, e) {
  run.events.push({ type: 'bossDefeated', bossType: e.type });
  if (e.chest) dropPickup(run, 'chest', e.x, e.y, 0);
  run.boss = null;
  for (const o of run.enemies) {
    if (o.boss && !o.dead && o !== e) run.boss = { id: o.id, type: o.type, hp: o.hp, maxHp: o.maxHp, phase: o.phase };
  }
  if (e.final && run.mode === 'main') {
    run.status = 'cleared';
    run._cleared = true;
    if (run.player.hp <= 0) run.player.hp = 1;
    if (Array.isArray(run.players)) {
      for (const pl of run.players) {
        pl.downed = false;
        pl.reviveProgress = 0;
        if (pl.hp <= 0) pl.hp = 1;
      }
    }
    run.watch = 6;
    run.darkness = DARKNESS.dawn;
    run.events.push({ type: 'dawn' });
    for (const pr of run.projectiles) if (pr.kind === 'enemyBullet') pr.dead = true;
    run.projectiles = run.projectiles.filter((pr) => pr.kind !== 'enemyBullet');
  }
}
