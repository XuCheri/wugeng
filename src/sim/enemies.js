// 敌人：生成、移动（朝玩家追击 + 邻居软分离 + 玩家防粘软分离）、特殊行为
// （黄皮子解耦蓄力扑击、吹鼓鬼增益光环、纸新娘风筝抛射、水鬼减速、精英词缀）、接触回弹、远距回收。

import {
  ENEMIES, ELITE, ELITE_AFFIXES, ELITE_AFFIX_IDS, ENEMY_AI, SPAWN, MAX_ENEMY_RADIUS,
  enemyHpScale, enemySpeedScale, enemyDmgScale,
} from './balance.js';
import { clamp } from '../core/math.js';
import { hurtPlayer } from './player.js';
import { updateBoss } from './bosses.js';
import { damageEnemy, knockback } from './combat.js';

/** 当前时刻的敌人血量倍率（主线分钟 + 夜色 + 无尽） */
export function currentHpScale(run) {
  if (run.mode === 'endless') {
    return enemyHpScale(run._endlessStart / 60, run.nightLevel, (run.time - run._endlessStart) / 60);
  }
  return enemyHpScale(run.time / 60, run.nightLevel, 0);
}

/** 写入冲锋 / 扑击 / 挥戟预警线公开字段（供渲染层在夜色遮罩上方绘制朱砂走廊） */
export function setTelegraph(e, len, width, progress) {
  e.telegraphLen = len;
  e.telegraphWidth = width;
  e.telegraphProgress = progress;
  e.telegraphX = e.x + e.dx * len;
  e.telegraphY = e.y + e.dy * len;
}

export function clearTelegraph(e) {
  if (e.telegraphProgress === 0 && e.telegraphLen === 0) return;
  e.telegraphX = 0;
  e.telegraphY = 0;
  e.telegraphProgress = 0;
  e.telegraphLen = 0;
  e.telegraphWidth = 0;
}

/**
 * 创建一个敌人并加入 run.enemies。
 * opts: { elite, affix, summoned, hpMul, rMul, fixedHp, warder, warderName, chest, mirrorClone, atkT, kbx, kby }
 */
export function spawnEnemy(run, type, x, y, opts = {}) {
  const def = ENEMIES[type];
  const night = run.night;
  const elite = !!opts.elite && !def.boss;
  let affix = null;
  if (elite) {
    affix = opts.affix !== undefined ? opts.affix : opts.mirrorClone ? null : run.rng.pick(ELITE_AFFIX_IDS);
  }

  const m = run.mode === 'endless' ? run._endlessStart / 60 : run.time / 60;
  let hp;
  if (opts.fixedHp !== undefined) {
    hp = opts.fixedHp;
  } else {
    hp = def.hp * currentHpScale(run) * (opts.hpMul || 1);
    if (elite) hp *= ELITE.hpMul * night.eliteHpMul;
    if (affix === 'treasure_bearer') hp *= ELITE_AFFIXES.treasure_bearer.hpMul;
  }

  let speed = def.speed * night.enemySpeedMul * (def.boss ? 1 : enemySpeedScale(m));
  let dmg = def.dmg * night.contactDmgMul * (def.boss ? 1 : enemyDmgScale(m));
  let r = def.r * (opts.rMul || 1);
  let xp = opts.mirrorClone ? 0 : def.xp;

  if (type === 'shade') speed *= night.shadeSpeedMul;
  if (elite) {
    r *= ELITE.rMul;
    dmg *= ELITE.dmgMul;
    if (!opts.mirrorClone) xp *= ELITE.xpMul;
    speed *= ELITE.speedMul;
    if (affix === 'swift_step') speed *= ELITE_AFFIXES.swift_step.speedMul;
  }

  hp = Math.max(1, Math.round(hp));
  const sx = Number.isFinite(x) ? x : 0;
  const sy = Number.isFinite(y) ? y : 0;
  const e = {
    id: run._nextId++,
    type,
    x: sx,
    y: sy,
    r,
    hp,
    maxHp: hp,
    elite,
    affix,
    warder: !!opts.warder,
    warderName: opts.warderName || null,
    chest: !!opts.chest,
    boss: !!def.boss,
    final: false,
    phase: 0,
    dmgMul: 1,
    hitT: 0,
    slowT: 0,
    vulnT: 0,
    vulnPct: 0,
    yangyanMarkT: 0,
    yangyanBurstDmg: 0,
    yangyanBurstR: 0,
    burnT: 0,
    burnDps: 0,
    _burnTick: 0,
    bleedT: 0,
    bleedDps: 0,
    _bleedTick: 0,
    buffedT: 0,
    state: 'move',
    angle: Math.atan2(run.player.y - sy, run.player.x - sx),
    telegraphX: 0,
    telegraphY: 0,
    telegraphProgress: 0,
    telegraphLen: 0,
    telegraphWidth: 0,
    // ↓ 内部字段
    speed,
    dmg,
    xp,
    atkT: opts.atkT || 0,
    stateT: 0,
    stunT: 0,
    dx: 0,
    dy: 0,
    kbx: opts.kbx || 0,
    kby: opts.kby || 0,
    paperArmor: affix === 'paper_armor' ? ELITE_AFFIXES.paper_armor.armorHits : 0,
    kbResist: affix === 'paper_armor' ? ELITE_AFFIXES.paper_armor.kbResist : 0,
    mirrorClone: !!opts.mirrorClone,
    _mirrored: !!opts.mirrorClone,
    _fireT: type === 'paperbride' ? run.rng.range(ENEMY_AI.paperbride.firstFireMin, ENEMY_AI.paperbride.firstFireMax) : 0,
    _affixT: affix === 'soul_fire' ? run.rng.range(1.0, ELITE_AFFIXES.soul_fire.fireInterval) : 0,
    _summonT: 0,
    _spiralA: 0,
    _charges: 0,
    _windupTotal: 0,
    _lungeCd: 0,
    _lanternTicks: 0,
    _mirrorRampUntil: 0,
    _mirrorStacks: 0,
    _qs: 0,
    dead: false,
    summoned: !!opts.summoned,
  };
  run.enemies.push(e);
  if (!e.boss) run._tele.spawnHp += hp;
  return e;
}

/** 延迟生成（在遍历敌人数组期间安全使用，如纸轿子分裂、分身精英） */
export function queueSpawn(run, type, x, y, opts) {
  run._spawnQueue.push({ type, x, y, opts });
}

export function flushSpawnQueue(run) {
  const q = run._spawnQueue;
  for (let i = 0; i < q.length; i++) {
    if (run.enemies.length >= SPAWN.cap + q.length) break;
    spawnEnemy(run, q[i].type, q[i].x, q[i].y, q[i].opts);
  }
  q.length = 0;
}

/** 用当前敌人位置重建空间哈希，并记录当前在场最大敌人半径供分离查询收紧候选格 */
export function rebuildHash(run) {
  const sys = run._sys;
  const h = sys.hash;
  h.clear();
  const arr = run.enemies;
  for (let i = 0; i < arr.length; i++) {
    const e = arr[i];
    if (!e.dead) h.insert(e);
  }
}

function rebuildSepHash(run) {
  const sys = run._sys;
  const h = sys.hash;
  const sh = sys.sepHash;
  h.clear();
  if (sh) sh.clear();
  const arr = run.enemies;
  let maxNonBossR = 11;
  let liveBoss = null;
  for (let i = 0; i < arr.length; i++) {
    const e = arr[i];
    if (!e.dead) {
      h.insert(e);
      if (e.boss) {
        liveBoss = e;
      } else {
        if (sh) sh.insert(e);
        if (e.r > maxNonBossR) maxNonBossR = e.r;
      }
    }
  }
  sys.maxNonBossR = maxNonBossR;
  sys.liveBoss = liveBoss;
}

/** 移除已死亡的敌人 */
export function compactEnemies(run) {
  const arr = run.enemies;
  let w = 0;
  for (let i = 0; i < arr.length; i++) if (!arr[i].dead) arr[w++] = arr[i];
  arr.length = w;
}

/** 在玩家周围的屏外圆环上取一个点；若玩家在移动，偏向前方 */
export function ringPoint(run, min = SPAWN.ringMin, max = SPAWN.ringMax, biasForward = false) {
  const p = run.player;
  let a;
  if (biasForward && p.moving) a = Math.atan2(p.facingY, p.facingX) + run.rng.range(-1.2, 1.2);
  else a = run.rng.range(0, Math.PI * 2);
  const d = run.rng.range(min, max);
  return { x: p.x + Math.cos(a) * d, y: p.y + Math.sin(a) * d };
}

export function updateEnemies(run, dt) {
  const p = run.player;
  const hash = run._sys.hash;
  const sepHash = run._sys.sepHash || hash;
  const near = run._sys.scratchSep;
  const scratchAura = run._sys.scratchAura || near;
  const ai = ENEMY_AI;
  const sepK = ai.separation;
  const kbKeep = Math.pow(ai.knockbackDecay, dt);
  const despawn2 = SPAWN.despawnDist * SPAWN.despawnDist;
  const aura2 = (ai.drowned.auraRadius + p.r) ** 2;
  let auraSlow = 1;

  rebuildSepHash(run);
  const arr = run.enemies;
  const maxPad = run._sys.maxNonBossR || MAX_ENEMY_RADIUS;
  const liveBoss = run._sys.liveBoss;

  // 吹鼓鬼增益光环预处理（不叠加）
  let hasSuona = false;
  for (let i = 0; i < arr.length; i++) {
    const e = arr[i];
    if (e.dead) continue;
    if (e.buffedT > 0) e.buffedT = Math.max(0, e.buffedT - dt);
    if (e.type === 'suona' && e.stunT <= 0) hasSuona = true;
  }
  if (hasSuona) {
    for (let i = 0; i < arr.length; i++) {
      const e = arr[i];
      if (e.dead || e.type !== 'suona' || e.stunT > 0) continue;
      sepHash.queryCircle(e.x, e.y, ai.suona.auraRadius, scratchAura, maxPad);
      for (let j = 0; j < scratchAura.length; j++) {
        const ally = scratchAura[j];
        if (ally !== e && !ally.dead && !ally.boss) ally.buffedT = 0.25;
      }
    }
  }

  for (let i = 0; i < arr.length; i++) {
    const e = arr[i];
    if (e.dead) continue;
    if (e.hitT > 0) e.hitT -= dt;
    if (e.slowT > 0) e.slowT -= dt;
    if (e.stunT > 0) e.stunT -= dt;
    if (e.atkT > 0) e.atkT -= dt;
    if (e.stateT > 0) e.stateT -= dt;
    if (e.vulnT > 0) {
      e.vulnT -= dt;
      if (e.vulnT <= 0) {
        e.vulnT = 0;
        e.vulnPct = 0;
      }
    }
    if (e.yangyanMarkT > 0) e.yangyanMarkT = Math.max(0, e.yangyanMarkT - dt);

    // 持续异常结算（阳炎灼烧 & 纸扎流血）
    if (e.burnT > 0) {
      e.burnT -= dt;
      e._burnTick -= dt;
      if (e._burnTick <= 0) {
        e._burnTick += 0.5;
        damageEnemy(run, e, Math.max(2, (e.burnDps || 10) * 0.5), 'lantern', { noCrit: true, noProc: true, knock: 0 });
        if (e.dead) continue;
      }
    }
    if (e.bleedT > 0) {
      e.bleedT -= dt;
      e._bleedTick -= dt;
      if (e._bleedTick <= 0) {
        e._bleedTick += 0.5;
        damageEnemy(run, e, Math.max(2, (e.bleedDps || 8) * 0.5), 'paperman', { noCrit: true, noProc: true, knock: 0 });
        if (e.dead) continue;
      }
    }

    let tx = p.x - e.x;
    let ty = p.y - e.y;
    const d2 = tx * tx + ty * ty;
    const d = Math.sqrt(d2) || 1;
    tx /= d;
    ty /= d;

    let vx = 0;
    let vy = 0;
    if (e.boss) {
      const v = updateBoss(run, e, dt, tx, ty, d);
      vx = v.x;
      vy = v.y;
    } else if (e.stunT > 0) {
      if (e.type === 'weasel' && e.state === 'pause') {
        e.state = 'move';
        e.stateT = ai.weasel.recover * 0.5;
      }
      clearTelegraph(e);
    } else {
      let spd = e.speed * (e.buffedT > 0 ? ai.suona.speedBuff : 1) * (e.slowT > 0 ? ai.slowMul : 1);
      let moveX = tx;
      let moveY = ty;

      if (e.type === 'weasel') {
        const W = ai.weasel;
        const telLen = W.dashSpeed * W.dashTime + e.r;
        const telWid = e.r * 2;
        if (e.state === 'move' && d < W.triggerDist && e.stateT <= 0) {
          e.state = 'pause';
          e.stateT = W.pause;
          e.dx = tx;
          e.dy = ty;
          e.angle = Math.atan2(ty, tx);
          setTelegraph(e, telLen, telWid, 0.02);
          spd = 0;
        } else if (e.state === 'pause') {
          spd = 0;
          setTelegraph(e, telLen, telWid, clamp(1 - Math.max(0, e.stateT) / W.pause, 0.01, 1));
          if (e.stateT <= 0) {
            e.state = 'dash';
            e.stateT = W.dashTime;
            clearTelegraph(e);
          }
        } else if (e.state === 'dash') {
          moveX = e.dx;
          moveY = e.dy;
          spd =
            W.dashSpeed *
            run.night.enemySpeedMul *
            run.night.weaselDashMul *
            (e.elite ? ELITE.speedMul : 1) *
            (e.affix === 'swift_step' ? ELITE_AFFIXES.swift_step.speedMul : 1) *
            (e.slowT > 0 ? ai.slowMul : 1);
          if (e.stateT <= 0) {
            e.state = 'move';
            e.stateT = W.recover;
            clearTelegraph(e);
          }
        }
      } else if (e.type === 'suona') {
        const S = ai.suona;
        const sign = e.id & 1 ? 1 : -1;
        if (d < S.retreatDist) {
          moveX = -tx;
          moveY = -ty;
          spd *= 0.55;
        } else if (d <= S.holdDist) {
          moveX = -ty * sign;
          moveY = tx * sign;
          spd *= 0.45;
        }
      } else if (e.type === 'paperbride') {
        const PB = ai.paperbride;
        const sign = e.id & 1 ? 1 : -1;
        if (d < PB.preferMin) {
          moveX = -tx;
          moveY = -ty;
          spd *= 0.78;
        } else if (d <= PB.preferMax) {
          moveX = -ty * sign;
          moveY = tx * sign;
          spd *= 0.50;
        }
        e._fireT -= dt;
        if (e._fireT <= 0 && d <= PB.fireRange) {
          e._fireT = PB.fireCd;
          const a = Math.atan2(p.y - e.y, p.x - e.x);
          const m = run.mode === 'endless' ? run._endlessStart / 60 : run.time / 60;
          const bdmg = Math.max(2, Math.round(PB.bulletDmg * run.night.contactDmgMul * enemyDmgScale(m) * (e.elite ? 1.25 : 1)));
          run.projectiles.push({
            id: run._nextId++,
            kind: 'enemyBullet',
            source: 'paperbride',
            x: e.x,
            y: e.y,
            r: PB.bulletR,
            angle: a,
            t: 0,
            life: PB.bulletLife,
            vx: Math.cos(a) * PB.bulletSpeed,
            vy: Math.sin(a) * PB.bulletSpeed,
            style: PB.bulletStyle,
            dmg: bdmg,
          });
        }
      }

      if (e.affix === 'soul_fire') {
        const SF = ELITE_AFFIXES.soul_fire;
        e._affixT -= dt;
        if (e._affixT <= 0 && d <= SF.fireRange) {
          e._affixT = SF.fireInterval;
          const baseA = Math.atan2(p.y - e.y, p.x - e.x);
          const m = run.mode === 'endless' ? run._endlessStart / 60 : run.time / 60;
          const bdmg = Math.max(2, Math.round(SF.bulletDmg * run.night.contactDmgMul * enemyDmgScale(m)));
          for (let b = 0; b < SF.bulletCount; b++) {
            const a = baseA + (b - (SF.bulletCount - 1) / 2) * SF.spread;
            run.projectiles.push({
              id: run._nextId++,
              kind: 'enemyBullet',
              source: 'soul_fire',
              x: e.x,
              y: e.y,
              r: SF.bulletR,
              angle: a,
              t: 0,
              life: SF.bulletLife,
              vx: Math.cos(a) * SF.bulletSpeed,
              vy: Math.sin(a) * SF.bulletSpeed,
              style: 'ink',
              dmg: bdmg,
            });
          }
        }
      }

      vx = moveX * spd;
      vy = moveY * spd;
      if (e.type === 'weasel' && spd > 0 && e.state !== 'dash') e.angle = Math.atan2(ty, tx);
    }

    // 软分离：被重叠的邻居推开（Boss 不被推，普通怪直接扫描细网格桶，零数组分配）
    let sx = 0;
    let sy = 0;
    if (!e.boss) {
      const sInv = sepHash.inv;
      const sBuckets = sepHash.buckets;
      const sMask = sepHash.mask;
      const sR = e.r + 16;
      const cx0 = Math.floor((e.x - sR) * sInv);
      const cx1 = Math.floor((e.x + sR) * sInv);
      const cy0 = Math.floor((e.y - sR) * sInv);
      const cy1 = Math.floor((e.y + sR) * sInv);
      let pushed = 0;
      for (let cx = cx0; cx <= cx1 && pushed < 8; cx++) {
        const hx = Math.imul(cx, 73856093);
        for (let cy = cy0; cy <= cy1 && pushed < 8; cy++) {
          const b = sBuckets[(hx ^ Math.imul(cy, 19349663)) & sMask];
          const bLen = b.length;
          for (let j = 0; j < bLen; j++) {
            const n = b[j];
            if (n === e || n.dead) continue;
            let ox = e.x - n.x;
            let oy = e.y - n.y;
            const rr = e.r + n.r;
            const od2 = ox * ox + oy * oy;
            if (od2 < rr * rr) {
              const od = Math.sqrt(od2);
              const overlap = rr - od;
              if (od < 1e-4) {
                ox = (e.id & 1) - 0.5;
                oy = ((e.id >> 1) & 1) - 0.5;
              }
              const inv = 1 / (od || 1);
              const k = overlap * sepK * 0.5;
              sx += ox * inv * k;
              sy += oy * inv * k;
              if (++pushed >= 8) break;
            }
          }
        }
      }
      if (liveBoss && !liveBoss.dead) {
        let ox = e.x - liveBoss.x;
        let oy = e.y - liveBoss.y;
        const rr = e.r + liveBoss.r;
        const od2 = ox * ox + oy * oy;
        if (od2 < rr * rr) {
          const od = Math.sqrt(od2);
          const overlap = rr - od;
          if (od < 1e-4) {
            ox = (e.id & 1) - 0.5;
            oy = ((e.id >> 1) & 1) - 0.5;
          }
          const inv = 1 / (od || 1);
          const k = overlap * sepK * 2;
          sx += ox * inv * k;
          sy += oy * inv * k;
        }
      }
    }

    // 与玩家的连续软分离：阻止非冲锋单位钻进玩家圆心粘死，同时保留接触判定半径
    const isCharging = e.state === 'charge' || e.state === 'dash' || e.state === 'lunge';
    const minDist = e.r + p.r * ai.playerSoftSepRatio;
    if (d < minDist && !isCharging) {
      const vIn = vx * tx + vy * ty;
      if (vIn > 0) {
        vx -= tx * vIn;
        vy -= ty * vIn;
      }
      const sIn = sx * tx + sy * ty;
      if (sIn > 0) {
        sx -= tx * sIn;
        sy -= ty * sIn;
      }
      let outX = -tx;
      let outY = -ty;
      if (d2 < 1e-6) {
        const fa = (e.id % 8) * (Math.PI / 4);
        outX = Math.cos(fa);
        outY = Math.sin(fa);
      }
      const pen = minDist - (d2 < 1e-6 ? 0 : d);
      const push = pen * (e.boss ? 0.35 : ai.playerSoftPush);
      sx += outX * push;
      sy += outY * push;
    }

    e.x += (vx + e.kbx) * dt + sx;
    e.y += (vy + e.kby) * dt + sy;
    e.kbx *= kbKeep;
    e.kby *= kbKeep;
    if (e.telegraphProgress > 0) {
      e.telegraphX = e.x + e.dx * e.telegraphLen;
      e.telegraphY = e.y + e.dy * e.telegraphLen;
    }

    // 接触伤害 + 攻击者微回弹
    const cr = e.r + p.r;
    const cdx = p.x - e.x;
    const cdy = p.y - e.y;
    const cd2 = cdx * cdx + cdy * cdy;
    if (cd2 <= cr * cr && e.atkT <= 0) {
      const rawContact = (e.boss ? e.dmg * (e.dmgMul || 1) : e.dmg) * (e.buffedT > 0 ? ai.suona.dmgBuff : 1);
      const dealt = hurtPlayer(run, rawContact);
      e.atkT = dealt > 0 ? ai.contactCd : 0.20;
      if (!e.boss && !isCharging) {
        const cd = Math.sqrt(cd2) || 1;
        const bx = cd2 > 1e-6 ? -cdx / cd : e.id & 1 ? 1 : -1;
        const by = cd2 > 1e-6 ? -cdy / cd : 0;
        knockback(e, bx, by, ai.contactBounce);
      }
    }

    // 水鬼减速光环
    if (e.type === 'drowned' && cd2 <= aura2) auraSlow = ai.drowned.playerSlow;

    // 远距离回收：普通敌人挪到玩家前方的圆环上（巡更小头目保留原地附近拉回，防丢失供盒）
    if (!e.boss && cd2 > despawn2) {
      const pt = ringPoint(run, SPAWN.ringMin, SPAWN.ringMax, true);
      e.x = pt.x;
      e.y = pt.y;
      e.kbx = e.kby = 0;
      if (e.type === 'weasel') e.state = 'move';
      clearTelegraph(e);
    }
  }
  run._auraSlow = auraSlow;
  rebuildHash(run);
}
