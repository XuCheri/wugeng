// 弹体更新：移动、碰撞、持续伤害、视觉寿命；以及延迟动作（连环爆炸等）。
// 渲染层按 kind 绘制（ARCHITECTURE §3.1）；持续弹体 persistent=true，t 在 0..1 循环作为动画相位。

import { WEAPONS, FX } from './balance.js';
import { damageEnemy, damageCircle } from './combat.js';
import { hurtPlayer } from './player.js';
import { papermanDmg, getWeapon } from './weapons.js';

function explode(run, x, y, radius, dmg, weaponId) {
  damageCircle(run, x, y, radius, dmg, weaponId);
  run.projectiles.push({ id: run._nextId++, kind: 'explosion', x, y, r: radius, angle: 0, t: 0, life: FX.explosionLife, weaponId, radius });
}

/** 处理延迟动作（满堂红连环爆、长明灯爆开） */
export function processScheduled(run, dt) {
  const list = run._scheduled;
  if (!list.length) return;
  const due = [];
  let w = 0;
  for (let i = 0; i < list.length; i++) {
    const s = list[i];
    s.delay -= dt;
    if (s.delay <= 0) due.push(s);
    else list[w++] = s;
  }
  list.length = w;
  for (const s of due) if (s.type === 'explosion') explode(run, s.x, s.y, s.radius, s.dmg, s.weaponId);
}

export function updateProjectiles(run, dt) {
  const p = run.player;
  const hash = run._sys.hash;
  const near = run._sys.scratchP;
  const arr = run.projectiles;
  const lanternW = getWeapon(run, 'lantern');
  const lanternBase = run.time * WEAPONS.lantern.angSpeed;

  // 注意：循环中可能有新弹体被 push（爆炸），用动态长度
  for (let i = 0; i < arr.length; i++) {
    const pr = arr[i];
    if (pr.dead) continue;
    pr.t += dt;
    if (pr.persistent) {
      if (pr.t >= 1) pr.t -= 1;
    } else if (pr.t >= pr.life && pr.kind !== 'firecracker') {
      pr.dead = true;
      continue;
    }

    switch (pr.kind) {
      case 'gongPulse':
      case 'ultPulse': {
        const k = Math.min(1, pr.t / pr.life);
        pr.radius = pr.maxRadius * (1 - (1 - k) * (1 - k));
        pr.x = p.x;
        pr.y = p.y;
        break;
      }
      case 'lantern': {
        const lv = lanternW ? lanternW.level : 1;
        const R = WEAPONS.lantern.orbitR[lv - 1] * run.mods.areaMul;
        pr.angle = lanternBase + (pr.orbitIndex / pr.orbitCount) * Math.PI * 2;
        pr.x = p.x + Math.cos(pr.angle) * R;
        pr.y = p.y + Math.sin(pr.angle) * R;
        break;
      }
      case 'flameRing':
        pr.x = p.x;
        pr.y = p.y;
        pr.radius = pr.r = WEAPONS.lantern.evo.ringRadius * run.mods.areaMul;
        break;
      case 'talisman':
        updateTalisman(run, pr, dt, hash, near);
        break;
      case 'coinsword':
        updateCoinsword(run, pr, dt, hash, near);
        break;
      case 'paperman':
        updatePaperman(run, pr, dt, hash, near);
        break;
      case 'inkPool':
        pr._tickT -= dt;
        if (pr._tickT <= 0) {
          pr._tickT = pr.tick;
          damageCircle(run, pr.x, pr.y, pr.radius, pr.dmg, 'brush', { slow: pr.tick + FX.inkSlowExtra });
        }
        break;
      case 'firecracker': {
        const k = Math.min(1, pr.t / pr.life);
        pr.x = pr.fromX + (pr.toX - pr.fromX) * k;
        pr.y = pr.fromY + (pr.toY - pr.fromY) * k;
        if (k >= 1) {
          pr.dead = true;
          explode(run, pr.toX, pr.toY, pr.radius, pr.dmg, 'firecracker');
          if (pr.evolved) {
            // 满堂红：落点周围连环爆炸
            const e = WEAPONS.firecracker.evo;
            for (let c = 0; c < e.chains; c++) {
              const a = run.rng.range(0, Math.PI * 2);
              const d = run.rng.range(e.chainSpread * 0.5, e.chainSpread);
              run._scheduled.push({
                delay: e.chainDelay * (c + 1), type: 'explosion', weaponId: 'firecracker',
                x: pr.toX + Math.cos(a) * d, y: pr.toY + Math.sin(a) * d,
                radius: pr.radius * e.chainRadiusMul, dmg: pr.dmg * e.chainDmgMul,
              });
            }
          }
        }
        break;
      }
      case 'enemyBullet': {
        pr.x += pr.vx * dt;
        pr.y += pr.vy * dt;
        const rr = pr.r + p.r;
        if ((pr.x - p.x) ** 2 + (pr.y - p.y) ** 2 <= rr * rr) {
          hurtPlayer(run, pr.dmg);
          pr.dead = true;
        }
        break;
      }
      default:
        // brushArc / explosion / bellChain：纯视觉，等寿命结束
        break;
    }
  }

  // 压缩
  let w = 0;
  for (let i = 0; i < arr.length; i++) if (!arr[i].dead) arr[w++] = arr[i];
  arr.length = w;
}

function updateTalisman(run, pr, dt, hash, near) {
  const def = WEAPONS.talisman;
  let t = pr._tgt;
  if (!t || t.dead) {
    t = pr._tgt = hash.nearest(pr.x, pr.y, def.seekRange, near, (e) => !e.dead && !pr._hit.includes(e.id));
  }
  if (t) {
    // 追踪：速度方向逐步转向目标
    const want = Math.atan2(t.y - pr.y, t.x - pr.x);
    let da = want - pr.angle;
    da = Math.atan2(Math.sin(da), Math.cos(da));
    const maxTurn = def.turnRate * dt;
    pr.angle += Math.max(-maxTurn, Math.min(maxTurn, da));
    pr.vx = Math.cos(pr.angle) * pr.speed;
    pr.vy = Math.sin(pr.angle) * pr.speed;
  }
  pr.x += pr.vx * dt;
  pr.y += pr.vy * dt;
  const list = hash.queryCircle(pr.x, pr.y, pr.r, near);
  for (const e of list) {
    if (e.dead || pr._hit.includes(e.id)) continue;
    pr._hit.push(e.id);
    damageEnemy(run, e, pr.dmg, 'talisman');
    if (pr.evolved) chainFrom(run, e, pr, hash);
    if (pr.pierce-- <= 0) {
      pr.dead = true;
      break;
    }
    pr._tgt = null;
  }
}

/** 天师符阵：命中时连锁到附近敌人 */
function chainFrom(run, src, pr, hash) {
  const evo = WEAPONS.talisman.evo;
  const list = hash.queryCircle(src.x, src.y, evo.chainRange, run._sys.scratchW2, 0);
  let n = 0;
  const pts = [{ x: src.x, y: src.y }];
  for (const e of list) {
    if (n >= evo.chain) break;
    if (e === src || e.dead) continue;
    damageEnemy(run, e, pr.dmg * evo.chainDmgMul, 'talisman');
    pts.push({ x: e.x, y: e.y });
    n++;
  }
  if (n) run.projectiles.push({ id: run._nextId++, kind: 'bellChain', x: src.x, y: src.y, r: 0, angle: 0, t: 0, life: FX.chainLife, weaponId: 'talisman', points: pts });
}

function updateCoinsword(run, pr, dt, hash, near) {
  const p = run.player;
  if (pr.phase === 'orbit') {
    const evo = WEAPONS.coinsword.evo;
    pr.orbitA += evo.orbitSpeed * dt;
    pr.x = p.x + Math.cos(pr.orbitA) * evo.orbitR;
    pr.y = p.y + Math.sin(pr.orbitA) * evo.orbitR;
    pr.angle = pr.orbitA;
    if (pr.t >= evo.orbitTime) {
      pr.phase = 'fly';
      pr.vx = Math.cos(pr.orbitA) * pr.speed;
      pr.vy = Math.sin(pr.orbitA) * pr.speed;
      pr._hit.clear();
    }
  } else if (pr.phase === 'fly') {
    pr.x += pr.vx * dt;
    pr.y += pr.vy * dt;
    pr.dist += pr.speed * dt;
    pr.angle += FX.coinswordSpin * dt;
    if (pr.dist >= pr.range) {
      if (pr.evolved) {
        pr.dead = true;
        return;
      }
      pr.phase = 'return';
      pr.returning = true;
      pr._hit.clear();
    }
  } else {
    // 回旋：飞回玩家
    const dx = p.x - pr.x;
    const dy = p.y - pr.y;
    const d = Math.hypot(dx, dy) || 1;
    const spd = pr.speed * FX.coinswordReturnMul;
    pr.vx = (dx / d) * spd;
    pr.vy = (dy / d) * spd;
    pr.x += pr.vx * dt;
    pr.y += pr.vy * dt;
    pr.angle += FX.coinswordSpin * dt;
    if (d < p.r + pr.r) {
      pr.dead = true;
      return;
    }
  }
  const list = hash.queryCircle(pr.x, pr.y, pr.r, near);
  for (const e of list) {
    if (e.dead || pr._hit.has(e.id)) continue;
    pr._hit.add(e.id);
    damageEnemy(run, e, pr.dmg, 'coinsword');
  }
}

function updatePaperman(run, pr, dt, hash, near) {
  const def = WEAPONS.paperman;
  const p = run.player;
  if (pr.atkT > 0) pr.atkT -= dt;
  const dmg = papermanDmg(run);
  if (pr.mode === 'patrol') {
    // 纸扎仪仗：绕玩家巡游
    const evo = def.evo;
    pr.angle = run.time * evo.angSpeed + (pr.orbitIndex / pr.orbitCount) * Math.PI * 2;
    pr.x = p.x + Math.cos(pr.angle) * evo.patrolR * run.mods.areaMul;
    pr.y = p.y + Math.sin(pr.angle) * evo.patrolR * run.mods.areaMul;
    if (pr.atkT <= 0) {
      const list = hash.queryCircle(pr.x, pr.y, evo.hitR, near);
      let any = false;
      for (const e of list) {
        if (e.dead) continue;
        damageEnemy(run, e, dmg, 'paperman');
        any = true;
      }
      if (any) pr.atkT = evo.atkCd;
    }
    return;
  }
  // 离玩家太远就瞬移回来
  if ((pr.x - p.x) ** 2 + (pr.y - p.y) ** 2 > def.leash * def.leash) {
    pr.x = p.x;
    pr.y = p.y;
  }
  const t = hash.nearest(pr.x, pr.y, def.seekRange, near, (e) => !e.dead);
  let tx;
  let ty;
  if (t) {
    pr.mode = 'seek';
    pr.targetId = t.id;
    tx = t.x;
    ty = t.y;
  } else {
    pr.mode = 'follow';
    pr.targetId = null;
    const a = (pr.orbitIndex / pr.orbitCount) * Math.PI * 2;
    tx = p.x + Math.cos(a) * FX.summonOffset;
    ty = p.y + Math.sin(a) * FX.summonOffset;
  }
  const dx = tx - pr.x;
  const dy = ty - pr.y;
  const d = Math.hypot(dx, dy);
  if (d > 1) {
    const step = Math.min(d, def.speed * dt);
    pr.x += (dx / d) * step;
    pr.y += (dy / d) * step;
    pr.angle = Math.atan2(dy, dx);
  }
  if (t && pr.atkT <= 0 && d <= pr.r + t.r + FX.summonReach) {
    damageEnemy(run, t, dmg, 'paperman');
    pr.atkT = def.atkCd;
  }
}

export { explode };
