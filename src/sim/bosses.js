// Boss：纸马将军（三连冲锋 + 预警走廊）、无面伞女（撑伞减伤 + 纸钱弹幕）、
// 夜游神（召唤 → 弹幕 → 狂暴追击 + 蓄力挥戟突刺预警）、
// 河神夜婚（一折红轿连冲吹鼓护轿 → 二折沧浪横街留木板桥安全口 → 三折万灯锁魂四阵眼护盾）。

import { ENEMIES, BOSS_AI, SPAWN, ENDLESS, DARKNESS, MAIN_DURATION } from './balance.js';
import { clamp, fsin, fcos, fatan2 } from '../core/math.js';
import { spawnEnemy, queueSpawn, setTelegraph, clearTelegraph } from './enemies.js';
import { dropPickup } from './pickups.js';
import { coopHpScale, coopPartySize, nearestLivingPlayer } from './coop.js';
import { findNearestBridgeX, RIVER_GAP_Y } from './maps.js';

const V = { x: 0, y: 0 };

/** 生成 Boss。opts.chest：死亡掉供盒；opts.final：最终 Boss（打败即通关）；opts.hpMulOverride：可选巡江中头目倍率 */
export function spawnBoss(run, type, opts = {}) {
  const p =
    run.player?.downed && coopPartySize(run) > 1
      ? nearestLivingPlayer(run, run.player.x, run.player.y)
      : run.player;
  const a = run.rng.range(0, Math.PI * 2);
  const e = spawnEnemy(run, type, p.x + fcos(a) * BOSS_AI.spawnDist, p.y + fsin(a) * BOSS_AI.spawnDist);
  let hp =
    ENEMIES[type].hp *
    (1 + SPAWN.nightHpGrowth * run.nightLevel) *
    run.night.bossHpMul *
    BOSS_AI.hpMul *
    (opts.hpMulOverride ?? BOSS_AI[type]?.hpMul ?? 1) *
    coopHpScale(run);
  if (run.mode === 'endless') {
    const es = Number.isFinite(run._endlessStart) && run._endlessStart > 0
      ? run._endlessStart
      : Math.min(Math.max(0, run.time || 0), MAIN_DURATION);
    hp *= ENDLESS.bossHpMul * Math.pow(ENDLESS.hpGrowth, Math.max(0, (run.time - es) / 60));
  }
  e.hp = e.maxHp = Math.max(100, Math.round(hp));
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
  e._waveT = 1.2;
  e._wardAngle = 0;
  e._wardRecastT = 0;
  e._wardHadActive = false;
  e.wardShieldActive = false;
  if (type === 'horse') {
    e.state = 'chase';
    e.stateT = BOSS_AI.horse.chase;
  } else if (type === 'umbrella') {
    e.state = 'shield';
    e.stateT = BOSS_AI.umbrella.shieldTime;
  } else if (type === 'hebo_wedding') {
    e.state = 'chase';
    e.stateT = BOSS_AI.hebo_wedding.chase;
  } else {
    e.state = 'summon';
  }
  run.boss = { id: e.id, type, hp: e.hp, maxHp: e.maxHp, phase: 1 };
  run.events.push({ type: 'bossSpawn', bossType: type });
  return e;
}

function fireBullet(run, x, y, angle, speed, dmg, r, life, style) {
  // 夜主弹幕随夜色加深（与接触伤害同口径）
  dmg = Math.round(dmg * (run.night?.contactDmgMul || 1));
  run.projectiles.push({
    id: run._nextId++,
    kind: 'enemyBullet',
    bossBullet: true,
    x,
    y,
    r,
    angle,
    t: 0,
    life,
    vx: fcos(angle) * speed,
    vy: fsin(angle) * speed,
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
  else if (e.type === 'hebo_wedding') heboWedding(run, e, dt, tx, ty, d);
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
  e.angle = fatan2(ty, tx);
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
      e.angle = fatan2(ty, tx);
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
    e.angle = fatan2(ty, tx);
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
      e.angle = fatan2(ty, tx);
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
      e.angle = fatan2(ty, tx);
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
        queueSpawn(run, type, e.x + fcos(a) * Y.summonDist, e.y + fsin(a) * Y.summonDist, { summoned: true });
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

function heboWedding(run, e, dt, tx, ty) {
  const HB = BOSS_AI.hebo_wedding;
  const p = run.player;
  const ratio = e.hp / e.maxHp;
  const targetPhase = ratio > HB.phase2At ? 1 : ratio > HB.phase3At ? 2 : 3;

  // ── 一阶段（100%→65%）：红轿二连冲 + 吹鼓鬼护轿 ──
  if (targetPhase === 1) {
    e.phase = 1;
    e.wardShieldActive = false;
    const telLen = HB.chargeSpeed * HB.chargeTime + e.r;
    const telWid = e.r * 2;
    e.dmgMul = 1;

    e._summonT -= dt;
    if (e._summonT <= 0 && e.state !== 'windup' && e.state !== 'charge') {
      e._summonT = HB.summonInterval;
      for (let i = 0; i < HB.summonCount; i++) {
        const stype = HB.summonTypes[i % HB.summonTypes.length];
        const a = (i / HB.summonCount) * Math.PI * 2 + 0.4;
        queueSpawn(run, stype, e.x + fcos(a) * HB.summonDist, e.y + fsin(a) * HB.summonDist, { summoned: true });
      }
    }

    switch (e.state) {
      case 'chase':
        clearTelegraph(e);
        V.x = tx * e.speed;
        V.y = ty * e.speed;
        e.angle = fatan2(ty, tx);
        if (e.stateT <= 0) {
          e.state = 'windup';
          e.stateT = HB.windup;
          e._windupTotal = HB.windup;
          e._charges = 0;
          lockCharge(e, tx, ty);
          setTelegraph(e, telLen, telWid, 0.03);
        }
        break;
      case 'windup': {
        const total = e._windupTotal || HB.windup;
        setTelegraph(e, telLen, telWid, clamp(1 - Math.max(0, e.stateT) / total, 0.02, 1));
        if (e.stateT <= 0) {
          e.state = 'charge';
          e.stateT = HB.chargeTime;
          clearTelegraph(e);
        }
        break;
      }
      case 'charge':
        clearTelegraph(e);
        V.x = e.dx * HB.chargeSpeed;
        V.y = e.dy * HB.chargeSpeed;
        e.dmgMul = HB.chargeDmgMul;
        if (e.stateT <= 0) {
          e._charges++;
          if (e._charges >= HB.charges) {
            e.state = 'rest';
            e.stateT = HB.rest;
          } else {
            e.state = 'windup';
            e.stateT = HB.gap + HB.windup * 0.65;
            e._windupTotal = e.stateT;
            lockCharge(e, tx, ty);
            setTelegraph(e, telLen, telWid, 0.03);
          }
        }
        break;
      default:
        clearTelegraph(e);
        if (e.stateT <= 0) {
          e.state = 'chase';
          e.stateT = HB.chase;
        }
    }
    return;
  }

  // ── 二阶段（65%→30%）：沧浪横街水墙 + 木板桥安全口 ──
  if (targetPhase === 2) {
    if (e.phase !== 2) {
      e.phase = 2;
      e.state = 'wave';
      e.wardShieldActive = false;
      e.dmgMul = 1;
      clearTelegraph(e);
      e._waveT = 0.55;
      e._fireT = 0.95;
    }
    V.x = tx * e.speed * 0.82;
    V.y = ty * e.speed * 0.82;
    e.angle = fatan2(ty, tx);

    e._waveT = (e._waveT ?? HB.waveEvery) - dt;
    if (e._waveT <= 0) {
      e._waveT = HB.waveEvery;
      const dirY = e.y <= p.y ? 1 : -1;
      const nearK = Math.round((p.y - 175) / RIVER_GAP_Y);
      const bridgeX = findNearestBridgeX(p.x, nearK, run._seedNum);
      const safeX = clamp(bridgeX, p.x - 115, p.x + 115);
      run.projectiles.push({
        id: run._nextId++,
        kind: 'enemyWaveWall',
        x: safeX,
        y: p.y - dirY * 195,
        vy: dirY * HB.waveSpeed,
        safeX,
        safeHalfW: HB.waveSafeHalfW,
        halfH: HB.waveHalfH,
        spanW: 560,
        telegraphT: HB.waveTelegraph,
        t: 0,
        life: HB.waveLife,
        dmg: HB.waveDmg,
      });
    }

    e._fireT -= dt;
    if (e._fireT <= 0) {
      e._fireT = HB.fanEvery;
      const baseA = fatan2(ty, tx);
      for (let k = 0; k < HB.fanShots; k++) {
        const a = baseA + (k - (HB.fanShots - 1) / 2) * HB.fanSpread;
        fireBullet(run, e.x, e.y, a, HB.bulletSpeed, HB.bulletDmg, HB.bulletR, HB.bulletLife, 'ink');
      }
    }
    return;
  }

  // ── 三阶段（≤30%）：万灯锁魂四阵眼护盾（打碎全部阵眼破盾暴露易伤）──
  if (e.phase !== 3) {
    e.phase = 3;
    e.state = 'array';
    e.dmgMul = 1;
    clearTelegraph(e);
    e._wardRecastT = 0;
    e._wardHadActive = false;
    e._wardAngle = 0;
    e._fireT = 0.75;
  }

  e._wardAngle = (e._wardAngle || 0) + HB.wardOrbitSpeed * dt;
  let liveWards = 0;
  for (let i = 0; i < run.enemies.length; i++) {
    const w = run.enemies[i];
    if (!w.dead && w.bossWardOf === e.id) liveWards++;
  }

  if (liveWards > 0) {
    e.wardShieldActive = true;
    e._wardHadActive = true;
    V.x = tx * e.speed * 0.54;
    V.y = ty * e.speed * 0.54;
    e.angle = fatan2(ty, tx);
    e._fireT -= dt;
    if (e._fireT <= 0) {
      e._fireT = HB.ringEvery;
      e._spiralA += 0.24;
      ring(run, e, HB.ringCount, e._spiralA, HB, 'paperMoney');
    }
  } else if (e._wardHadActive) {
    e._wardHadActive = false;
    e.wardShieldActive = false;
    e.vulnT = Math.max(e.vulnT || 0, HB.wardExposeSec);
    e.vulnPct = Math.max(e.vulnPct || 0, HB.wardExposeVuln);
    e._wardRecastT = HB.wardRecastCd;
    run.events.push({ type: 'wardBroken', x: e.x, y: e.y, bossId: e.id });
  } else {
    e.wardShieldActive = false;
    V.x = tx * e.speed * 0.72;
    V.y = ty * e.speed * 0.72;
    e.angle = fatan2(ty, tx);
    e._wardRecastT = (e._wardRecastT ?? 0) - dt;
    if (e._wardRecastT <= 0) {
      const wardHp = Math.max(60, Math.round(e.maxHp * HB.wardHpRatio));
      for (let k = 0; k < HB.wardCount; k++) {
        const a = (e._wardAngle || 0) + (k / HB.wardCount) * Math.PI * 2;
        queueSpawn(run, 'lanternghost', e.x + fcos(a) * HB.wardDist, e.y + fsin(a) * HB.wardDist, {
          summoned: true,
          warder: true,
          warderName: '锁魂河灯',
          bossWardOf: e.id,
          wardOrbitIdx: k,
          wardOrbitCount: HB.wardCount,
          fixedHp: wardHp,
        });
      }
      e.wardShieldActive = true;
      e._wardHadActive = true;
      e._wardRecastT = HB.wardRecastCd;
    }
  }
}

/** Boss 被打败：事件、供盒、通关 */
export function onBossKilled(run, e) {
  run.events.push({ type: 'bossDefeated', bossType: e.type });
  if (e.chest) dropPickup(run, 'chest', e.x, e.y, 0);
  if (e.type === 'hebo_wedding') {
    for (let i = 0; i < run.enemies.length; i++) {
      const w = run.enemies[i];
      if (!w.dead && w.bossWardOf === e.id) {
        w.dead = true;
        w.hp = 0;
      }
    }
  }
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
    for (const pr of run.projectiles) if (pr.kind === 'enemyBullet' || pr.kind === 'enemyWaveWall') pr.dead = true;
    run.projectiles = run.projectiles.filter((pr) => pr.kind !== 'enemyBullet' && pr.kind !== 'enemyWaveWall');
  }
}
