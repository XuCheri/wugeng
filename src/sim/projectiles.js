// 弹体更新：移动、碰撞、持续场域、视觉寿命；以及延迟动作（连环莲花爆、阴火自爆、摄魂回响、天雷轰击等）。

import { WEAPONS, FX, ULT } from './balance.js';
import { turnToward } from '../core/math.js';
import { damageEnemy, damageCircle, knockback, applySlow } from './combat.js';
import { hurtPlayer } from './player.js';
import { hitPropsCircle } from './props.js';
import { papermanDmg, getWeapon, sweepSoulbanner, emitFire } from './weapons.js';

export function explode(run, x, y, radius, dmg, weaponId, opts = {}) {
  const safeR = Math.max(0, radius || 0);
  const evolved = !!opts.evolved;
  const kind = opts.explosionKind || opts.kind || weaponId || 'explosion';
  const circleOpts = {
    knock: opts.knock !== undefined ? opts.knock : 110,
    ...(opts.noReburst ? { noReburst: true } : {}),
    ...(opts.noCrit ? { noCrit: true } : {}),
    ...(opts.direct ? { direct: true } : {}),
    ...(opts.stun ? { stun: opts.stun } : {}),
    ...(opts.vuln ? { vuln: opts.vuln, vulnPct: opts.vulnPct || 0.25 } : {}),
  };
  damageCircle(run, x, y, safeR, dmg, weaponId, circleOpts);
  run.projectiles.push({
    id: run._nextId++,
    kind: 'explosion',
    x,
    y,
    r: safeR,
    angle: 0,
    t: 0,
    life: FX.explosionLife,
    weaponId,
    radius: safeR,
    evolved,
    subKind: kind,
  });
  run.events.push({
    type: 'explosion',
    x,
    y,
    radius: safeR,
    evolved,
    kind,
    weaponId,
  });
}

const _duePool = [[], [], []];
let _dueDepth = 0;

/** 处理延迟动作（满堂红莲花爆、阳炎爆裂、阴火骷髅自爆、千铃回响、招魂幡回扫、大招多段） */
export function processScheduled(run, dt) {
  const list = run._scheduled;
  if (!list.length) return;
  const depth = _dueDepth++;
  const due = _duePool[depth] || (_duePool[depth] = []);
  due.length = 0;
  let w = 0;
  for (let i = 0; i < list.length; i++) {
    const s = list[i];
    s.delay -= dt;
    if (s.delay <= 0) due.push(s);
    else list[w++] = s;
  }
  list.length = w;
  if (!due.length) {
    _dueDepth = depth;
    return;
  }

  const p = run.player;
  const hash = run._sys.hash;
  const scratch = run._sys.scratchW3 || run._sys.scratchW2;

  for (const s of due) {
    switch (s.type) {
      case 'explosion':
        explode(run, s.x, s.y, s.radius, s.dmg, s.weaponId, {
          evolved: s.evolved,
          explosionKind: s.explosionKind,
          knock: s.knock,
          noReburst: s.noReburst,
        });
        break;

      case 'cinderBlast': {
        explode(run, s.x, s.y, s.radius, s.enemyDmg, 'cinder', {
          evolved: false,
          explosionKind: 'cinder',
          knock: 165,
          noCrit: true,
          direct: true,
        });
        const rr = s.radius + p.r;
        if ((p.x - s.x) ** 2 + (p.y - s.y) ** 2 <= rr * rr) {
          hurtPlayer(run, s.playerDmg);
        }
        break;
      }

      case 'soulEcho': {
        const tgt = s.target && !s.target.dead ? s.target : hash.nearest(s.target?.x ?? p.x, s.target?.y ?? p.y, s.range || 200, scratch, (e) => !e.dead);
        if (tgt) {
          damageEnemy(run, tgt, s.dmg, 'bell', { knock: 25 });
          const ang = (s.echoIdx || 1) * 1.57;
          run.projectiles.push({
            id: run._nextId++,
            kind: 'bellChain',
            weaponId: 'bell',
            subKind: 'soulEcho',
            evolved: true,
            x: tgt.x,
            y: tgt.y,
            r: 2,
            angle: 0,
            t: 0,
            life: 0.22,
            points: [
              { x: tgt.x + Math.cos(ang) * 28, y: tgt.y + Math.sin(ang) * 28 },
              { x: tgt.x, y: tgt.y },
            ],
          });
        }
        break;
      }

      case 'soulSweep2': {
        const sb = getWeapon(run, 'soulbanner');
        sweepSoulbanner(run, sb, p.x, p.y, s.radius, s.angle, s.spread, s.dmg, true);
        break;
      }

      case 'zhouUltWave': {
        damageCircle(run, p.x, p.y, s.radius, s.dmg, 'ult', {
          knock: s.knock,
          stun: s.stun,
          vuln: s.vulnT,
          vulnPct: s.vulnPct,
        });
        for (const pr of run.projectiles) {
          if (pr.kind === 'enemyBullet' && !pr.dead) {
            const rr = s.radius + (pr.r || 0);
            if ((pr.x - p.x) ** 2 + (pr.y - p.y) ** 2 <= rr * rr) pr.dead = true;
          }
        }
        run.projectiles.push({
          id: run._nextId++,
          kind: 'ultPulse',
          weaponId: 'ult',
          x: p.x,
          y: p.y,
          r: Math.max(0, s.radius),
          angle: 0,
          t: 0,
          life: ULT.pulseLife,
          radius: 0,
          maxRadius: s.radius,
        });
        break;
      }

      case 'thunderStrike': {
        const rawList = hash.queryCircle(p.x, p.y, s.seekRange || 380, scratch);
        let best = null;
        let bestScore = -Infinity;
        for (let i = 0; i < rawList.length; i++) {
          const e = rawList[i];
          if (e.dead) continue;
          const unstruck = s.struck && !s.struck.has(e.id) ? 1e5 : 0;
          const score = (e.boss ? 1e7 : e.elite ? 5e5 : 0) + unstruck + e.hp;
          if (score > bestScore) {
            bestScore = score;
            best = e;
          }
        }
        let tx;
        let ty;
        if (best) {
          tx = best.x;
          ty = best.y;
          if (s.struck) s.struck.add(best.id);
        } else {
          const a = run.rng.range(0, Math.PI * 2);
          const d = run.rng.range(45, 190);
          tx = p.x + Math.cos(a) * d;
          ty = p.y + Math.sin(a) * d;
        }
        damageCircle(run, tx, ty, s.radius, s.dmg, 'ult', { knock: 140, stun: s.stun || 0.6 });
        run.projectiles.push({
          id: run._nextId++,
          kind: 'thunderBolt',
          weaponId: 'ult',
          evolved: true,
          x: tx,
          y: ty,
          r: 10,
          radius: s.radius,
          angle: 0,
          t: 0,
          life: 0.32,
        });
        run.events.push({
          type: 'explosion',
          x: tx,
          y: ty,
          radius: s.radius,
          evolved: true,
          kind: 'thunderBolt',
          weaponId: 'ult',
        });
        break;
      }

      case 'soulGourdPulse':
        damageCircle(run, p.x, p.y, s.radius, s.dmg, 'gong', { knock: 240, stun: 0.6 });
        run.projectiles.push({
          id: run._nextId++,
          kind: 'gongPulse',
          weaponId: 'gong',
          x: p.x,
          y: p.y,
          r: Math.max(0, s.radius),
          radius: 0,
          maxRadius: s.radius,
          angle: 0,
          t: 0,
          life: 0.32,
          evolved: false,
        });
        break;
    }
  }
  due.length = 0;
  _dueDepth = depth;
}

function pointToSegDist2(px, py, ax, ay, bx, by) {
  const vx = bx - ax;
  const vy = by - ay;
  const l2 = vx * vx + vy * vy;
  if (l2 < 1e-6) return (px - ax) ** 2 + (py - ay) ** 2;
  const t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / l2));
  const cx = ax + vx * t;
  const cy = ay + vy * t;
  return (px - cx) ** 2 + (py - cy) ** 2;
}

export function updateProjectiles(run, dt) {
  const p = run.player;
  const hash = run._sys.hash;
  const near = run._sys.scratchP;
  const arr = run.projectiles;
  const lanternW = getWeapon(run, 'lantern');
  const lanternBase = run.time * WEAPONS.lantern.angSpeed;

  for (let i = 0; i < arr.length; i++) {
    const pr = arr[i];
    if (pr.dead) continue;
    pr.t += dt;
    if (pr.persistent) {
      if (pr.t >= 1) pr.t -= 1;
    } else if (pr.t >= pr.life && pr.kind !== 'firecracker' && pr.kind !== 'compassField') {
      if (pr.kind === 'paperman' && pr.mode === 'imp') {
        explode(run, pr.x, pr.y, pr.blastR || 54, pr.dmg || 30, 'paperman', {
          evolved: true,
          explosionKind: 'paperImp',
          knock: 100,
        });
      }
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
        pr.innerRadius = WEAPONS.lantern.evo.innerLotusRadius * run.mods.areaMul;
        break;

      case 'talisman':
        updateTalismanProj(run, pr, dt, hash, near);
        break;

      case 'talismanArray':
        updateTalismanArray(run, pr, dt, hash);
        break;

      case 'inkWave':
        updateInkWave(run, pr, dt, hash, near);
        break;

      case 'coinsword':
        updateCoinswordProj(run, pr, dt, hash, near);
        break;

      case 'paperman':
        updatePapermanProj(run, pr, dt, hash, near);
        break;

      case 'inkPool':
        pr._tickT -= dt;
        if (pr._tickT <= 0) {
          pr._tickT = pr.tick;
          damageCircle(run, pr.x, pr.y, pr.radius, pr.dmg, pr.weaponId || 'brush', {
            slow: pr.tick + FX.inkSlowExtra,
            knock: 0,
          });
        }
        break;

      case 'firecracker': {
        const k = Math.min(1, pr.t / pr.life);
        pr.x = pr.fromX + (pr.toX - pr.fromX) * k;
        pr.y = pr.fromY + (pr.toY - pr.fromY) * k;
        if (k >= 1) {
          pr.dead = true;
          const evo = WEAPONS.firecracker.evo;
          const mainR = pr.radius * (pr.evolved ? evo.mainRadiusMul : 1);
          explode(run, pr.toX, pr.toY, mainR, pr.dmg, 'firecracker', {
            evolved: pr.evolved,
            explosionKind: pr.evolved ? 'firecrackerMain' : 'firecracker',
            knock: pr.evolved ? 165 : WEAPONS.firecracker.knockback,
          });
          if (pr.evolved) {
            const baseA = run.rng.range(0, Math.PI * 2);
            for (let c = 0; c < evo.lotusCount; c++) {
              const a = baseA + (c * Math.PI * 2) / evo.lotusCount + run.rng.range(-0.1, 0.1);
              const d = pr.radius * evo.lotusSpreadMul;
              run._scheduled.push({
                delay: evo.lotusDelay * (c + 1),
                type: 'explosion',
                weaponId: 'firecracker',
                evolved: true,
                explosionKind: 'firecrackerLotus',
                knock: 90,
                x: pr.toX + Math.cos(a) * d,
                y: pr.toY + Math.sin(a) * d,
                radius: pr.radius * evo.lotusRadiusMul,
                dmg: pr.dmg * evo.lotusDmgMul,
              });
            }
            arr.push({
              id: run._nextId++,
              kind: 'inkPool',
              weaponId: 'firecracker',
              subKind: 'emberZone',
              evolved: true,
              x: pr.toX,
              y: pr.toY,
              r: Math.max(0, pr.radius),
              radius: pr.radius,
              angle: 0,
              t: 0,
              life: evo.emberLife * run.mods.durMul,
              tick: evo.emberTick,
              _tickT: 0.20,
              dmg: pr.dmg * evo.emberDmgMul,
            });
          }
        }
        break;
      }

      case 'compassField':
        updateCompassField(run, pr, dt, hash, near);
        break;

      case 'mirrorBeam':
        updateMirrorBeam(run, pr, dt, hash, near);
        break;

      case 'paperHorse':
        updatePaperHorse(run, pr, dt, hash, near);
        break;

      case 'soulSweep':
        pr.x = p.x;
        pr.y = p.y;
        break;

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
        break;
    }
  }

  let w = 0;
  for (let i = 0; i < arr.length; i++) if (!arr[i].dead) arr[w++] = arr[i];
  arr.length = w;
}

function updateTalismanProj(run, pr, dt, hash, near) {
  const def = WEAPONS.talisman;
  let t = pr._tgt;
  if (!t || t.dead) {
    t = pr._tgt = hash.nearest(pr.x, pr.y, def.seekRange, near, (e) => !e.dead && !pr._hit.includes(e.id));
  }
  if (t) {
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
    damageEnemy(run, e, pr.dmg, 'talisman', { knockDx: pr.vx, knockDy: pr.vy });
    if (pr.evolved) {
      chainFromTalisman(run, e, pr, hash);
      if (pr._hit.length === 1 && run._lastTalismanVolleyArray !== pr.volleyId) {
        run._lastTalismanVolleyArray = pr.volleyId;
        const evo = def.evo;
        const R = evo.arrayRadius * run.mods.areaMul;
        run.projectiles.push({
          id: run._nextId++,
          kind: 'talismanArray',
          weaponId: 'talisman',
          evolved: true,
          x: e.x,
          y: e.y,
          r: 10,
          radius: R,
          angle: 0,
          t: 0,
          life: evo.arrayLife,
          strikesLeft: evo.arrayStrikes,
          strikeInterval: evo.arrayInterval,
          _strikeT: 0.10,
          dmg: pr.dmg * evo.arrayDmgMul,
          anchorId: e.boss ? e.id : null,
        });
      }
    }
    if (pr.pierce-- <= 0) {
      pr.dead = true;
      break;
    }
    pr._tgt = null;
  }
}

/** 天师符阵：命中连锁并生成独立的 talismanChain（区别于铜铃 bellChain） */
function chainFromTalisman(run, src, pr, hash) {
  const evo = WEAPONS.talisman.evo;
  const list = hash.queryCircle(src.x, src.y, evo.chainRange, run._sys.scratchW2);
  let n = 0;
  const pts = [{ x: src.x, y: src.y }];
  for (const e of list) {
    if (n >= evo.chain) break;
    if (e === src || e.dead) continue;
    damageEnemy(run, e, pr.dmg * evo.chainDmgMul, 'talisman');
    pts.push({ x: e.x, y: e.y });
    n++;
  }
  if (n === 0) {
    pts.unshift({ x: pr.x - pr.vx * 0.04, y: pr.y - pr.vy * 0.04 });
  }
  run.projectiles.push({
    id: run._nextId++,
    kind: 'talismanChain',
    weaponId: 'talisman',
    evolved: true,
    x: src.x,
    y: src.y,
    r: 3,
    angle: 0,
    t: 0,
    life: FX.chainLife,
    points: pts,
  });
}

function updateTalismanArray(run, pr, dt, hash) {
  if (pr.anchorId) {
    const boss = run.enemies.find((e) => e.id === pr.anchorId && !e.dead);
    if (boss) {
      const k = Math.min(1, dt * 3.5);
      pr.x += (boss.x - pr.x) * k;
      pr.y += (boss.y - pr.y) * k;
    }
  }
  pr._strikeT -= dt;
  while (pr._strikeT <= 0 && pr.strikesLeft > 0) {
    pr._strikeT += pr.strikeInterval;
    pr.strikesLeft--;
    const list = hash.queryCircle(pr.x, pr.y, pr.radius, run._sys.scratchW2);
    const pts = [];
    for (let i = 0; i < list.length && pts.length < 3; i++) {
      if (!list[i].dead) pts.push({ x: list[i].x, y: list[i].y });
    }
    damageCircle(run, pr.x, pr.y, pr.radius, pr.dmg, 'talisman', { slow: 0.35, knock: 30 });
    if (pts.length === 1) {
      pts.unshift({ x: pr.x, y: pr.y - 28 });
    }
    if (pts.length >= 2) {
      run.projectiles.push({
        id: run._nextId++,
        kind: 'talismanChain',
        weaponId: 'talisman',
        evolved: true,
        x: pr.x,
        y: pr.y,
        r: 3,
        angle: 0,
        t: 0,
        life: FX.chainLife,
        points: pts,
      });
    }
  }
}

function updateInkWave(run, pr, dt, hash, near) {
  pr.x += pr.vx * dt;
  pr.y += pr.vy * dt;
  const hitR = pr.hitR || pr.radius || pr.r;
  hitPropsCircle(run, pr.x, pr.y, hitR);
  const list = hash.queryCircle(pr.x, pr.y, hitR, near);
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (e.dead || pr._hit.includes(e.id)) continue;
    pr._hit.push(e.id);
    applySlow(run, e, 1.1);
    damageEnemy(run, e, pr.dmg, 'brush', { knock: 105, knockDx: pr.vx, knockDy: pr.vy });
  }
}

function updateCoinswordProj(run, pr, dt, hash, near) {
  const p = run.player;
  if (pr.phase === 'fly') {
    pr.x += pr.vx * dt;
    pr.y += pr.vy * dt;
    pr.dist += pr.speed * dt;
    pr.angle += FX.coinswordSpin * dt;
    if (pr.dist >= pr.range) {
      pr.phase = 'return';
      pr.returning = true;
      pr._hit.length = 0;
    }
  } else {
    const dx = p.x - pr.x;
    const dy = p.y - pr.y;
    const d = Math.hypot(dx, dy) || 1;
    const spd = pr.speed * (pr.evolved ? 1.28 : FX.coinswordReturnMul);
    pr.vx = (dx / d) * spd;
    pr.vy = (dy / d) * spd;
    pr.x += pr.vx * dt;
    pr.y += pr.vy * dt;
    pr.angle += FX.coinswordSpin * dt;
    if (d < p.r + pr.r + 4) {
      pr.dead = true;
      return;
    }
  }

  const list = hash.queryCircle(pr.x, pr.y, pr.r, near);
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (e.dead || pr._hit.includes(e.id)) continue;
    pr._hit.push(e.id);
    damageEnemy(run, e, pr.dmg, 'coinsword', { knockDx: pr.vx, knockDy: pr.vy });
    if (pr.evolved) {
      run._coinswordEvoHits = (run._coinswordEvoHits || 0) + 1;
      const evo = WEAPONS.coinsword.evo;
      if (run._coinswordEvoHits % evo.cleaveEvery === 0) {
        run._scheduled.push({
          delay: 0,
          type: 'explosion',
          x: e.x,
          y: e.y,
          radius: evo.cleaveRadius * run.mods.areaMul,
          dmg: pr.dmg * evo.cleaveDmgMul,
          weaponId: 'coinsword',
          evolved: true,
          explosionKind: 'starCleave',
          knock: 120,
        });
      }
    }
  }
}

function updatePapermanProj(run, pr, dt, hash, near) {
  const def = WEAPONS.paperman;
  const evo = def.evo;
  const p = run.player;
  const haste = run.mods?.summonHasteMul || 1;
  if (pr.atkT > 0) pr.atkT -= dt;

  // 纸扎 4 件羁绊：追魂红纸童冲阵自爆
  if (pr.mode === 'imp') {
    const spd = (pr.speed || 290) * haste;
    const t = hash.nearest(pr.x, pr.y, 480, near, (e) => !e.dead);
    if (t) {
      const dx = t.x - pr.x;
      const dy = t.y - pr.y;
      const d = Math.hypot(dx, dy) || 1;
      pr.x += (dx / d) * Math.min(d, spd * dt);
      pr.y += (dy / d) * Math.min(d, spd * dt);
      pr.angle = Math.atan2(dy, dx);
      if (d <= pr.r + t.r + 6) {
        pr.dead = true;
        explode(run, pr.x, pr.y, pr.blastR || 54, pr.dmg || 30, 'paperman', {
          evolved: true,
          explosionKind: 'paperImp',
          knock: 110,
        });
      }
    } else {
      pr.x += Math.cos(pr.angle) * spd * dt;
      pr.y += Math.sin(pr.angle) * spd * dt;
    }
    return;
  }

  const dmg = papermanDmg(run);
  const w = getWeapon(run, 'paperman');

  // 开光内卫：绕身拦截敌弹 + 近身震退横扫
  if (pr.role === 'guard') {
    const R = evo.guardR * run.mods.areaMul;
    pr.angle = run.time * evo.guardAngSpeed * haste + (pr.orbitIndex / pr.orbitCount) * Math.PI * 2;
    pr.x = p.x + Math.cos(pr.angle) * R;
    pr.y = p.y + Math.sin(pr.angle) * R;

    if (pr._blockCd > 0) pr._blockCd -= dt;
    if (!(pr._blockCd > 0)) {
      for (let j = 0; j < run.projectiles.length; j++) {
        const b = run.projectiles[j];
        if (b.kind === 'enemyBullet' && !b.dead) {
          const rr = evo.guardBlockR + (b.r || 0);
          if ((b.x - pr.x) ** 2 + (b.y - pr.y) ** 2 <= rr * rr) {
            b.dead = true;
            pr._blockCd = evo.guardBlockCd || 0.65;
            break;
          }
        }
      }
    }

    if (pr.atkT <= 0) {
      const list = hash.queryCircle(pr.x, pr.y, evo.guardHitR, near);
      let any = false;
      for (let j = 0; j < list.length; j++) {
        const e = list[j];
        if (e.dead) continue;
        damageEnemy(run, e, dmg * 0.85, 'paperman', { knock: 95, originX: p.x, originY: p.y });
        any = true;
      }
      if (any) pr.atkT = evo.guardAtkCd / haste;
    }
    return;
  }

  // 开光外阵先锋红衣纸骑：420px 索敌、320px/s 穿阵冲锋
  if (pr.role === 'cavalry') {
    if ((pr.x - p.x) ** 2 + (pr.y - p.y) ** 2 > evo.leash * evo.leash) {
      pr.x = p.x;
      pr.y = p.y;
      pr.chargeT = 0;
    }
    for (const [eid, until] of pr._hitUntil) {
      if (until <= run.time) pr._hitUntil.delete(eid);
    }

    const spd = evo.cavalrySpeed * haste;
    if (pr.chargeT > 0) {
      pr.chargeT -= dt;
      pr.x += pr.vx * dt;
      pr.y += pr.vy * dt;
    } else {
      const cands = hash.queryCircle(p.x, p.y, evo.seekRange, near);
      let best = null;
      let bestScore = -Infinity;
      for (let j = 0; j < cands.length; j++) {
        const e = cands[j];
        if (e.dead) continue;
        const fresh = !pr._hitUntil.has(e.id) ? 1e6 : 0;
        const score = (e.boss ? 1e8 : e.elite ? 5e6 : 0) + fresh - ((e.x - pr.x) ** 2 + (e.y - pr.y) ** 2);
        if (score > bestScore) {
          bestScore = score;
          best = e;
        }
      }
      if (best) {
        pr.mode = 'charge';
        pr.targetId = best.id;
        const dx = best.x - pr.x;
        const dy = best.y - pr.y;
        const d = Math.hypot(dx, dy) || 1;
        const ux = dx / d;
        const uy = dy / d;
        pr.angle = Math.atan2(uy, ux);
        if (d <= 120) {
          pr.vx = ux * spd;
          pr.vy = uy * spd;
          pr.chargeT = evo.chargeDur;
        } else {
          pr.x += ux * spd * dt;
          pr.y += uy * spd * dt;
        }
      } else {
        pr.mode = 'follow';
        pr.targetId = null;
        const oa = run.time * 1.9 + (pr.orbitIndex / pr.orbitCount) * Math.PI * 2;
        const tx = p.x + Math.cos(oa) * 90;
        const ty = p.y + Math.sin(oa) * 90;
        const dx = tx - pr.x;
        const dy = ty - pr.y;
        const d = Math.hypot(dx, dy);
        if (d > 1) {
          const step = Math.min(d, spd * dt);
          pr.x += (dx / d) * step;
          pr.y += (dy / d) * step;
          pr.angle = Math.atan2(dy, dx);
        }
      }
    }

    const hits = hash.queryCircle(pr.x, pr.y, pr.r + 5, near);
    for (let j = 0; j < hits.length; j++) {
      const e = hits[j];
      if (e.dead || (pr._hitUntil.get(e.id) || 0) > run.time) continue;
      pr._hitUntil.set(e.id, run.time + evo.cavalryHitCd / haste);
      damageEnemy(run, e, dmg * evo.cavalryDmgMul, 'paperman', {
        knock: evo.cavalryKnock,
        knockDx: Math.cos(pr.angle),
        knockDy: Math.sin(pr.angle),
      });
      if (w && (run._papermanFireT || 0) <= run.time) {
        run._papermanFireT = run.time + 0.45;
        emitFire(run, w, pr.x, pr.y, pr.angle);
      }
    }
    return;
  }

  // 基础纸人：索敌追咬
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
  const spd = def.speed * haste;
  if (d > 1) {
    const step = Math.min(d, spd * dt);
    pr.x += (dx / d) * step;
    pr.y += (dy / d) * step;
    pr.angle = Math.atan2(dy, dx);
  }
  if (t && pr.atkT <= 0 && d <= pr.r + t.r + FX.summonReach) {
    damageEnemy(run, t, dmg, 'paperman');
    pr.atkT = def.atkCd / haste;
    if (w && (run._papermanFireT || 0) <= run.time) {
      run._papermanFireT = run.time + 0.55;
      emitFire(run, w, pr.x, pr.y, pr.angle);
    }
  }
}

function updateCompassField(run, pr, dt, hash, near) {
  const def = WEAPONS.compass;
  const evo = def.evo;
  if (pr.t >= pr.life) {
    pr.dead = true;
    const blastMul = pr.evolved ? evo.blastDmgMul : def.blastDmgMul;
    explode(run, pr.x, pr.y, pr.radius * (pr.evolved ? 1 : 0.9), pr.dmg * blastMul, 'compass', {
      evolved: pr.evolved,
      explosionKind: 'compassBlast',
      knock: 135,
    });
    if (pr.evolved) {
      for (let k = 1; k <= evo.aftershocks; k++) {
        run._scheduled.push({
          delay: 0.14 * k,
          type: 'explosion',
          x: pr.x,
          y: pr.y,
          radius: pr.radius * 0.85,
          dmg: pr.dmg * 0.95,
          weaponId: 'compass',
          evolved: true,
          explosionKind: 'compassStar',
          knock: 90,
        });
      }
    }
    return;
  }

  // 磁场牵引（0.08s 节流脉冲，兼顾丝滑聚怪与 300 敌零开销）
  pr._pullT = (pr._pullT || 0) - dt;
  if (pr._pullT <= 0) {
    const stepT = 0.08;
    pr._pullT = stepT;
    const list = hash.queryCircle(pr.x, pr.y, pr.radius, near);
    const f = pr.pullForce * stepT * 8;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (e.dead || e.boss) continue;
      const dx = pr.x - e.x;
      const dy = pr.y - e.y;
      if (dx * dx + dy * dy > 100) knockback(e, dx, dy, f);
    }
  }

  pr._tickT -= dt;
  if (pr._tickT <= 0) {
    pr._tickT = pr.tick;
    const tickMul = pr.evolved ? evo.tickDmgMul : def.tickDmgMul;
    damageCircle(run, pr.x, pr.y, pr.radius, pr.dmg * tickMul, 'compass', {
      slow: 0.55,
      knock: 0,
      ...(pr.evolved ? { vuln: evo.vulnDur, vulnPct: evo.vulnPct } : {}),
    });
  }
}

function updateMirrorBeam(run, pr, dt, hash, near) {
  const def = WEAPONS.bronze_mirror;
  const evo = def.evo;
  const p = run.player;
  pr.x = p.x;
  pr.y = p.y;

  pr._aimT = (pr._aimT || 0) - dt;
  if (pr._aimT <= 0) {
    pr._aimT = 0.08;
    const list = hash.queryCircle(p.x, p.y, pr.length * 1.15, run._sys.scratchW2);
    let pri = null;
    let bestScore = -Infinity;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (e.dead) continue;
      const score = (e.boss ? 1e8 : e.elite ? 1e6 : 0) - ((e.x - p.x) ** 2 + (e.y - p.y) ** 2);
      if (score > bestScore) {
        bestScore = score;
        pri = e;
      }
    }
    pr._aimTarget = pri;
  }
  if (pr._aimTarget && !pr._aimTarget.dead) {
    const want = Math.atan2(pr._aimTarget.y - p.y, pr._aimTarget.x - p.x);
    pr.baseAngle = turnToward(pr.baseAngle, want, def.turnSpeed * dt);
  }
  pr.angle = pr.baseAngle + (pr.angleOffset || 0);
  pr.endX = p.x + Math.cos(pr.angle) * pr.length;
  pr.endY = p.y + Math.sin(pr.angle) * pr.length;

  // 焚毁与光束胶囊体相交的敌方弹幕（每道光束有净除上限，保留夜主弹幕压迫感）
  if (pr._burnsLeft === undefined) pr._burnsLeft = pr.evolved ? 8 : 4;
  if (pr._burnsLeft > 0) {
    for (let j = 0; j < run.projectiles.length && pr._burnsLeft > 0; j++) {
      const b = run.projectiles[j];
      if (b.kind !== 'enemyBullet' || b.dead) continue;
      const rr = pr.width * 0.65 + (b.r || 0);
      if (pointToSegDist2(b.x, b.y, pr.x, pr.y, pr.endX, pr.endY) <= rr * rr) {
        b.dead = true;
        pr._burnsLeft--;
      }
    }
  }

  pr._tickT -= dt;
  if (pr._tickT <= 0) {
    pr._tickT = pr.tick;
    const mx = (pr.x + pr.endX) * 0.5;
    const my = (pr.y + pr.endY) * 0.5;
    const halfL = pr.length * 0.5 + pr.width;
    const cands = hash.queryCircle(mx, my, halfL, near);
    const rampPer = pr.evolved ? evo.rampPerHit : def.rampPerHit;
    const rampMax = pr.evolved ? evo.rampMax : def.rampMax;

    for (let j = 0; j < cands.length; j++) {
      const e = cands[j];
      if (e.dead) continue;
      const rr = pr.width * 0.5 + e.r;
      if (pointToSegDist2(e.x, e.y, pr.x, pr.y, pr.endX, pr.endY) > rr * rr) continue;

      if (!e._mirrorRampUntil || run.time > e._mirrorRampUntil) e._mirrorStacks = 0;
      e._mirrorStacks = (e._mirrorStacks || 0) + 1;
      e._mirrorRampUntil = run.time + 0.65;

      const mult = 1 + Math.min(rampMax, (e._mirrorStacks - 1) * rampPer);
      if (pr.evolved) {
        e.yangyanMarkT = Math.max(e.yangyanMarkT || 0, 2.0);
        e.yangyanBurstDmg = Math.max(e.yangyanBurstDmg || 0, pr.dmg * 2.2);
        e.yangyanBurstR = Math.max(e.yangyanBurstR || 0, 64 * run.mods.areaMul);
      }
      damageEnemy(run, e, pr.dmg * mult, 'bronze_mirror', {
        knockDx: Math.cos(pr.angle),
        knockDy: Math.sin(pr.angle),
      });

      if (pr.evolved && e._mirrorStacks % evo.solarEvery === 0) {
        run._scheduled.push({
          delay: 0,
          type: 'explosion',
          x: e.x,
          y: e.y,
          radius: evo.solarBurstR * run.mods.areaMul,
          dmg: pr.dmg * evo.solarBurstMul,
          weaponId: 'bronze_mirror',
          evolved: true,
          explosionKind: 'solarFlare',
          knock: 105,
        });
      }
    }
    hitPropsCircle(run, mx, my, pr.length * 0.5);
  }
}

function updatePaperHorse(run, pr, dt, hash, near) {
  pr.x += pr.vx * dt;
  pr.y += pr.vy * dt;
  const hitR = pr.hitR || pr.r;
  hitPropsCircle(run, pr.x, pr.y, hitR);

  if (pr.trampleBullets) {
    for (let j = 0; j < run.projectiles.length; j++) {
      const b = run.projectiles[j];
      if (b.kind === 'enemyBullet' && !b.dead) {
        const rr = hitR + (b.r || 0);
        if ((b.x - pr.x) ** 2 + (b.y - pr.y) ** 2 <= rr * rr) b.dead = true;
      }
    }
  }

  const list = hash.queryCircle(pr.x, pr.y, hitR, near);
  for (let j = 0; j < list.length; j++) {
    const e = list[j];
    if (e.dead || pr._hit.includes(e.id)) continue;
    pr._hit.push(e.id);
    pr.trampleCount = (pr.trampleCount || 0) + 1;
    damageEnemy(run, e, pr.dmg, pr.weaponId || 'paperhorse', {
      isSummon: true,
      knock: pr.knock || 135,
      knockDx: pr.vx,
      knockDy: pr.vy,
    });

    if (pr.evolved && pr.weaponId === 'paperhorse') {
      const evo = WEAPONS.paperhorse.evo;
      const shouldBlast = ((e.boss || e.elite) && !pr._priorityBlasted) || pr.trampleCount % 3 === 0;
      if (shouldBlast) {
        if (e.boss || e.elite) pr._priorityBlasted = true;
        run._scheduled.push({
          delay: 0,
          type: 'explosion',
          x: e.x,
          y: e.y,
          radius: evo.trampleExplodeR * run.mods.areaMul,
          dmg: pr.dmg * evo.trampleExplodeMul,
          weaponId: 'paperhorse',
          evolved: true,
          explosionKind: 'paperStampede',
          knock: 95,
        });
      }
    }
  }
}
