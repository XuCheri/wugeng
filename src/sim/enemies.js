// 敌人：生成、移动（朝玩家追击 + 软分离）、特殊行为（黄皮子扑击、水鬼减速光环）、
// 接触伤害、远距离回收。Boss 的行为在 bosses.js。

import { ENEMIES, ELITE, ENEMY_AI, SPAWN, MAX_ENEMY_RADIUS, enemyHpScale, enemySpeedScale, enemyDmgScale } from './balance.js';
import { hurtPlayer } from './player.js';
import { updateBoss } from './bosses.js';

/** 当前时刻的敌人血量倍率（主线分钟 + 夜色 + 无尽） */
export function currentHpScale(run) {
  if (run.mode === 'endless') {
    // 无尽：分钟成长冻结在进入无尽时，之后按 ×1.22^k 乘算
    return enemyHpScale(run._endlessStart / 60, run.nightLevel, (run.time - run._endlessStart) / 60);
  }
  return enemyHpScale(run.time / 60, run.nightLevel, 0);
}

/**
 * 创建一个敌人并加入 run.enemies。
 * opts: { elite, summoned, hpMul }
 */
export function spawnEnemy(run, type, x, y, opts = {}) {
  const def = ENEMIES[type];
  const night = run.night;
  const elite = !!opts.elite && !def.boss;
  let hp = def.hp * currentHpScale(run) * (opts.hpMul || 1);
  const m = run.mode === 'endless' ? run._endlessStart / 60 : run.time / 60;
  let speed = def.speed * night.enemySpeedMul * (def.boss ? 1 : enemySpeedScale(m));
  let dmg = def.dmg * night.contactDmgMul * (def.boss ? 1 : enemyDmgScale(m));
  let r = def.r;
  let xp = def.xp;
  if (type === 'shade') speed *= night.shadeSpeedMul;
  if (elite) {
    hp *= ELITE.hpMul * night.eliteHpMul;
    r *= ELITE.rMul;
    dmg *= ELITE.dmgMul;
    xp *= ELITE.xpMul;
    speed *= ELITE.speedMul;
  }
  hp = Math.max(1, Math.round(hp));
  const e = {
    id: run._nextId++,
    type,
    x,
    y,
    r,
    hp,
    maxHp: hp,
    elite,
    boss: !!def.boss,
    hitT: 0,
    slowT: 0,
    state: 'move',
    angle: Math.atan2(run.player.y - y, run.player.x - x),
    // ↓ 内部字段（渲染层可忽略）
    speed,
    dmg,
    xp,
    atkT: 0,
    stateT: 0,
    stunT: 0,
    dx: 0,
    dy: 0,
    kbx: 0,
    kby: 0,
    dead: false,
    summoned: !!opts.summoned,
  };
  run.enemies.push(e);
  if (!e.boss) run._tele.spawnHp += hp;
  return e;
}

/** 延迟生成（在遍历敌人数组期间安全使用，如纸轿子分裂） */
export function queueSpawn(run, type, x, y, opts) {
  run._spawnQueue.push({ type, x, y, opts });
}

export function flushSpawnQueue(run) {
  const q = run._spawnQueue;
  for (let i = 0; i < q.length; i++) {
    if (run.enemies.length >= SPAWN.cap + q.length) break; // 分裂允许小幅超出上限
    spawnEnemy(run, q[i].type, q[i].x, q[i].y, q[i].opts);
  }
  q.length = 0;
}

/** 用当前敌人位置重建空间哈希 */
export function rebuildHash(run) {
  const h = run._sys.hash;
  h.clear();
  const arr = run.enemies;
  for (let i = 0; i < arr.length; i++) if (!arr[i].dead) h.insert(arr[i]);
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
  const near = run._sys.scratchSep;
  const ai = ENEMY_AI;
  const sepK = ai.separation;
  const kbKeep = Math.pow(ai.knockbackDecay, dt);
  const despawn2 = SPAWN.despawnDist * SPAWN.despawnDist;
  const aura2 = (ai.drowned.auraRadius + p.r) ** 2;
  let auraSlow = 1;

  rebuildHash(run); // 用移动前的位置做分离
  const arr = run.enemies;
  for (let i = 0; i < arr.length; i++) {
    const e = arr[i];
    if (e.dead) continue;
    if (e.hitT > 0) e.hitT -= dt;
    if (e.slowT > 0) e.slowT -= dt;
    if (e.stunT > 0) e.stunT -= dt;
    if (e.atkT > 0) e.atkT -= dt;
    if (e.stateT > 0) e.stateT -= dt;

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
    } else if (e.stunT <= 0) {
      let spd = e.speed * (e.slowT > 0 ? ai.slowMul : 1);
      if (e.type === 'weasel') {
        const W = ai.weasel;
        if (e.state === 'move' && d < W.triggerDist && e.stateT <= 0) {
          // 停顿蓄力：扑击方向在此刻锁定（e.angle），玩家看到停顿后横移即可躲开
          e.state = 'pause';
          e.stateT = W.pause;
          e.dx = tx;
          e.dy = ty;
          e.angle = Math.atan2(ty, tx);
        } else if (e.state === 'pause') {
          spd = 0;
          if (e.stateT <= 0) {
            e.state = 'dash';
            e.stateT = W.dashTime;
          }
        } else if (e.state === 'dash') {
          tx = e.dx;
          ty = e.dy;
          spd *= W.dashMul * run.night.weaselDashMul;
          if (e.stateT <= 0) {
            e.state = 'move';
            e.stateT = W.recover;
          }
        }
      }
      vx = tx * spd;
      vy = ty * spd;
      if (spd > 0 && e.state !== 'dash') e.angle = Math.atan2(ty, tx);
    }

    // 软分离：被重叠的邻居推开（Boss 不被推）
    let sx = 0;
    let sy = 0;
    if (!e.boss) {
      hash.queryCircle(e.x, e.y, e.r, near, MAX_ENEMY_RADIUS);
      for (let j = 0; j < near.length; j++) {
        const n = near[j];
        if (n === e || n.dead) continue;
        let ox = e.x - n.x;
        let oy = e.y - n.y;
        const od = Math.sqrt(ox * ox + oy * oy);
        const overlap = e.r + n.r - od;
        if (overlap > 0) {
          if (od < 1e-4) {
            ox = (e.id & 1) - 0.5;
            oy = ((e.id >> 1) & 1) - 0.5;
          }
          const inv = 1 / (od || 1);
          const k = overlap * sepK * (n.boss ? 2 : 0.5);
          sx += ox * inv * k;
          sy += oy * inv * k;
        }
      }
    }

    e.x += (vx + e.kbx) * dt + sx;
    e.y += (vy + e.kby) * dt + sy;
    e.kbx *= kbKeep;
    e.kby *= kbKeep;

    // 接触伤害
    const cr = e.r + p.r;
    const cdx = p.x - e.x;
    const cdy = p.y - e.y;
    const cd2 = cdx * cdx + cdy * cdy;
    if (cd2 <= cr * cr && e.atkT <= 0) {
      e.atkT = ai.contactCd;
      hurtPlayer(run, e.boss ? e.dmg * (e.dmgMul || 1) : e.dmg);
    }
    // 水鬼减速光环
    if (e.type === 'drowned' && cd2 <= aura2) auraSlow = ai.drowned.playerSlow;

    // 远距离回收：普通敌人挪到玩家前方的圆环上
    if (!e.boss && cd2 > despawn2) {
      const pt = ringPoint(run, SPAWN.ringMin, SPAWN.ringMax, true);
      e.x = pt.x;
      e.y = pt.y;
      e.kbx = e.kby = 0;
      if (e.type === 'weasel') e.state = 'move';
    }
  }
  run._auraSlow = auraSlow;
  rebuildHash(run); // 武器 / 弹体使用移动后的位置
}

