// 弹体更新：移动、碰撞、持续场域、视觉寿命；以及延迟动作（连环莲花爆、阴火自爆、摄魂回响、天雷轰击等）。

import { WEAPONS, FX, ULT } from './balance.js';
import { turnToward, fsin, fcos, fatan2 } from '../core/math.js';
import { damageEnemy, damageCircle, knockback, applySlow, applyStun } from './combat.js';
import { hurtPlayer } from './player.js';
import { hitPropsCircle } from './props.js';
import { dropPickup } from './pickups.js';
import { papermanDmg, getWeapon, sweepSoulbanner, emitFire, weaponAreaMul } from './weapons.js';
import { withPlayerContext, hurtTargetPlayer, coopPartySize } from './coop.js';

export function explode(run, x, y, radius, dmg, weaponId, opts = {}) {
  const safeR = Math.max(0, radius || 0);
  const evolved = !!opts.evolved;
  const kind = opts.explosionKind || opts.kind || weaponId || 'explosion';
  const circleOpts = {
    knock: opts.knock !== undefined ? opts.knock : 110,
    ...(opts.noReburst ? { noReburst: true } : {}),
    ...(opts.noCrit ? { noCrit: true } : {}),
    ...(opts.direct ? { direct: true } : {}),
    ...(opts.armorBreak ? { armorBreak: true } : {}),
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
    ownerSlot: run._activeSlot || 0,
    attackVfx: opts.attackVfx ?? run.player?.attackVfx ?? null,
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

  const hash = run._sys.hash;
  const scratch = run._sys.scratchW3 || run._sys.scratchW2;

  const execScheduled = (s) => {
    const p = run.player;
    const ownerSlot = s.ownerSlot || 0;
    switch (s.type) {
      case 'explosion':
        explode(run, s.x, s.y, s.radius, s.dmg, s.weaponId, {
          evolved: s.evolved,
          explosionKind: s.explosionKind,
          knock: s.knock,
          noReburst: s.noReburst,
          armorBreak: s.armorBreak,
          stun: s.stun,
          vuln: s.vuln,
          vulnPct: s.vulnPct,
          attackVfx: s.attackVfx,
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
        if (coopPartySize(run) > 1) {
          for (let i = 0; i < run.players.length; i++) {
            const pl = run.players[i];
            if (pl.downed || pl.hp <= 0) continue;
            const rr = s.radius + pl.r;
            if ((pl.x - s.x) ** 2 + (pl.y - s.y) ** 2 <= rr * rr) {
              hurtTargetPlayer(run, pl, s.playerDmg);
            }
          }
        } else {
          const rr = s.radius + p.r;
          if ((p.x - s.x) ** 2 + (p.y - s.y) ** 2 <= rr * rr) {
            hurtPlayer(run, s.playerDmg);
          }
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
            ownerSlot,
            evolved: true,
            x: tgt.x,
            y: tgt.y,
            r: 2,
            angle: 0,
            t: 0,
            life: 0.22,
            points: [
              { x: tgt.x + fcos(ang) * 28, y: tgt.y + fsin(ang) * 28 },
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
          ownerSlot,
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
          tx = p.x + fcos(a) * d;
          ty = p.y + fsin(a) * d;
        }
        damageCircle(run, tx, ty, s.radius, s.dmg, 'ult', { knock: 140, stun: s.stun || 0.6 });
        run.projectiles.push({
          id: run._nextId++,
          kind: 'thunderBolt',
          weaponId: 'ult',
          ownerSlot,
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
          ownerSlot,
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

      case 'weierWake':
        hitPropsCircle(run, s.x, s.y, s.radius);
        damageCircle(run, s.x, s.y, s.radius, s.dmg, 'bamboo_pole', { knock: 65, slow: 0.85 });
        run.projectiles.push({
          id: run._nextId++,
          kind: 'gongPulse',
          weaponId: 'bamboo_pole',
          subKind: 'weierWake',
          ownerSlot,
          fixedPos: true,
          x: s.x,
          y: s.y,
          r: Math.max(0, s.radius),
          radius: 0,
          maxRadius: s.radius,
          angle: 0,
          t: 0,
          life: 0.28,
          evolved: (s.stacks || 1) >= 4,
        });
        break;
    }
  };

  for (const s of due) {
    const slot = s.ownerSlot || 0;
    if (slot > 0 && run.players?.[slot]) {
      withPlayerContext(run, run.players[slot], () => execScheduled(s));
    } else {
      execScheduled(s);
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
  const hash = run._sys.hash;
  const near = run._sys.scratchP;
  const arr = run.projectiles;
  const lanternBase = run.time * WEAPONS.lantern.angSpeed;
  const isCoop = coopPartySize(run) > 1;

  const stepSingleProj = (pr) => {
    const p = run.player;
    switch (pr.kind) {
      case 'gongPulse':
      case 'nuoBeat':
      case 'ultPulse': {
        const k = Math.min(1, pr.t / pr.life);
        pr.radius = pr.maxRadius * (1 - (1 - k) * (1 - k));
        if (!pr.fixedPos) {
          pr.x = p.x;
          pr.y = p.y;
        }
        break;
      }

      case 'nuoDanceRing':
        pr.x = p.x;
        pr.y = p.y;
        break;

      case 'soulChain':
        pr.fromX = p.x;
        pr.fromY = p.y;
        break;

      case 'lantern': {
        const lanternW = getWeapon(run, 'lantern');
        const lv = lanternW ? lanternW.level : 1;
        const R = WEAPONS.lantern.orbitR[lv - 1] * weaponAreaMul(run, lanternW);
        pr.angle = lanternBase + (pr.orbitIndex / pr.orbitCount) * Math.PI * 2;
        pr.x = p.x + fcos(pr.angle) * R;
        pr.y = p.y + fsin(pr.angle) * R;
        break;
      }

      case 'flameRing': {
        const lanternW = getWeapon(run, 'lantern');
        const areaMul = weaponAreaMul(run, lanternW);
        pr.x = p.x;
        pr.y = p.y;
        pr.radius = pr.r = WEAPONS.lantern.evo.ringRadius * areaMul;
        pr.innerRadius = WEAPONS.lantern.evo.innerLotusRadius * areaMul;
        break;
      }

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

      case 'flyingSword':
        updateFlyingSwordProj(run, pr, dt, hash, near);
        break;

      case 'fireCrow':
        updateFireCrowProj(run, pr, dt, hash, near);
        break;

      case 'nuoDrum':
        updateNuoDrumProj(run, pr, dt);
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
                x: pr.toX + fcos(a) * d,
                y: pr.toY + fsin(a) * d,
                radius: pr.radius * evo.lotusRadiusMul,
                dmg: pr.dmg * evo.lotusDmgMul,
                ownerSlot: pr.ownerSlot || 0,
                attackVfx: pr.attackVfx || null,
              });
            }
            arr.push({
              id: run._nextId++,
              kind: 'inkPool',
              weaponId: 'firecracker',
              subKind: 'emberZone',
              ownerSlot: pr.ownerSlot || 0,
              attackVfx: pr.attackVfx || null,
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
      case 'mourningSweep':
        pr.x = p.x;
        pr.y = p.y;
        break;

      case 'skyLantern':
        updateSkyLanternProj(run, pr, hash, arr);
        break;

      case 'inkLine':
        updateInkLineProj(run, pr, dt, hash);
        break;

      case 'luopanSlip':
        updateLuopanSlipProj(run, pr, dt, hash, near);
        break;

      case 'bambooWave':
        updateBambooWaveProj(run, pr, dt, hash, near);
        break;

      case 'abacusBead':
        updateAbacusBeadProj(run, pr, dt, hash, near);
        break;

      case 'enemyBullet': {
        pr.x += pr.vx * dt;
        pr.y += pr.vy * dt;
        if (isCoop) {
          for (let k = 0; k < run.players.length; k++) {
            const pl = run.players[k];
            if (pl.downed || pl.hp <= 0) continue;
            const rr = pr.r + pl.r;
            if ((pr.x - pl.x) ** 2 + (pr.y - pl.y) ** 2 <= rr * rr) {
              hurtTargetPlayer(run, pl, pr.dmg);
              pr.dead = true;
              break;
            }
          }
        } else {
          const rr = pr.r + p.r;
          if ((pr.x - p.x) ** 2 + (pr.y - p.y) ** 2 <= rr * rr) {
            hurtPlayer(run, pr.dmg);
            pr.dead = true;
          }
        }
        break;
      }

      case 'enemyWaveWall': {
        const telT = pr.telegraphT || 0.95;
        if (pr.t < telT) break;
        pr.y += (pr.vy || 0) * dt;
        const halfH = pr.halfH || 22;
        const safeHalfW = pr.safeHalfW || 48;
        const spanW = pr.spanW || 560;
        if (!pr._hitSlots) pr._hitSlots = {};
        if (isCoop) {
          for (let k = 0; k < run.players.length; k++) {
            const pl = run.players[k];
            if (!pl || pl.downed || pl.hp <= 0 || pr._hitSlots[k]) continue;
            if (Math.abs(pl.y - pr.y) <= halfH + pl.r && Math.abs(pl.x - pr.safeX) <= spanW && Math.abs(pl.x - pr.safeX) > safeHalfW) {
              pr._hitSlots[k] = true;
              hurtTargetPlayer(run, pl, pr.dmg);
            }
          }
        } else if (!pr._hitSlots[0]) {
          if (Math.abs(p.y - pr.y) <= halfH + p.r && Math.abs(p.x - pr.safeX) <= spanW && Math.abs(p.x - pr.safeX) > safeHalfW) {
            pr._hitSlots[0] = true;
            hurtPlayer(run, pr.dmg);
          }
        }
        break;
      }

      default:
        break;
    }
  };

  for (let i = 0; i < arr.length; i++) {
    const pr = arr[i];
    if (pr.dead) continue;
    pr.t += dt;
    if (pr.persistent) {
      if (pr.t >= 1) pr.t -= 1;
    } else if (
      pr.t >= pr.life
      && pr.kind !== 'firecracker'
      && pr.kind !== 'skyLantern'
      && pr.kind !== 'compassField'
      && pr.kind !== 'fireCrow'
      && !(pr.kind === 'inkLine' && pr.evolved && pr.snapBurst)
    ) {
      if (pr.kind === 'paperman' && pr.mode === 'imp') {
        const slot = pr.ownerSlot || 0;
        if (slot > 0 && run.players?.[slot]) {
          withPlayerContext(run, run.players[slot], () => {
            explode(run, pr.x, pr.y, pr.blastR || 54, pr.dmg || 30, 'paperman', {
              evolved: true,
              explosionKind: 'paperImp',
              knock: 100,
            });
          });
        } else {
          explode(run, pr.x, pr.y, pr.blastR || 54, pr.dmg || 30, 'paperman', {
            evolved: true,
            explosionKind: 'paperImp',
            knock: 100,
          });
        }
      }
      pr.dead = true;
      continue;
    }

    const slot = pr.ownerSlot || 0;
    if (pr.kind !== 'enemyBullet' && pr.kind !== 'enemyWaveWall' && slot > 0 && run.players?.[slot]) {
      withPlayerContext(run, run.players[slot], () => stepSingleProj(pr));
    } else {
      stepSingleProj(pr);
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
    const want = fatan2(t.y - pr.y, t.x - pr.x);
    let da = want - pr.angle;
    da = fatan2(fsin(da), fcos(da));
    const maxTurn = def.turnRate * dt;
    pr.angle += Math.max(-maxTurn, Math.min(maxTurn, da));
    pr.vx = fcos(pr.angle) * pr.speed;
    pr.vy = fsin(pr.angle) * pr.speed;
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
          ownerSlot: pr.ownerSlot || 0,
          attackVfx: pr.attackVfx || null,
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
    ownerSlot: pr.ownerSlot || 0,
    attackVfx: pr.attackVfx || null,
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
        ownerSlot: pr.ownerSlot || 0,
        attackVfx: pr.attackVfx || null,
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
          ownerSlot: pr.ownerSlot || 0,
          attackVfx: pr.attackVfx || null,
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

  const owner = run.players?.[pr.ownerSlot || 0] || p;
  if (pr.persistent && owner?.downed) {
    pr.mode = 'follow';
    pr.targetId = null;
    pr.chargeT = 0;
    const idleR = pr.role === 'guard' ? evo.guardR * 0.75 : FX.summonOffset;
    const oa = run.time * 1.1 + ((pr.orbitIndex || 0) / Math.max(1, pr.orbitCount || 1)) * Math.PI * 2;
    const tx = owner.x + fcos(oa) * idleR;
    const ty = owner.y + fsin(oa) * idleR;
    const dx = tx - pr.x;
    const dy = ty - pr.y;
    const d = Math.hypot(dx, dy);
    if (d > def.leash) {
      pr.x = tx;
      pr.y = ty;
    } else if (d > 1) {
      const step = Math.min(d, def.speed * 0.75 * dt);
      pr.x += (dx / d) * step;
      pr.y += (dy / d) * step;
      pr.angle = fatan2(dy, dx);
    }
    return;
  }

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
      pr.angle = fatan2(dy, dx);
      if (d <= pr.r + t.r + 6) {
        pr.dead = true;
        explode(run, pr.x, pr.y, pr.blastR || 54, pr.dmg || 30, 'paperman', {
          evolved: true,
          explosionKind: 'paperImp',
          knock: 110,
        });
      }
    } else {
      pr.x += fcos(pr.angle) * spd * dt;
      pr.y += fsin(pr.angle) * spd * dt;
    }
    return;
  }

  const dmg = papermanDmg(run);
  const w = getWeapon(run, 'paperman');
  const sigScale = pr.sigScale || 1;
  const sigCdMul = pr.sigCdMul || 1;

  // 开光内卫：绕身拦截敌弹 + 近身震退横扫
  if (pr.role === 'guard') {
    const R = evo.guardR * weaponAreaMul(run, w);
    pr.angle = run.time * evo.guardAngSpeed * haste + (pr.orbitIndex / pr.orbitCount) * Math.PI * 2;
    pr.x = p.x + fcos(pr.angle) * R;
    pr.y = p.y + fsin(pr.angle) * R;

    if (pr._blockCd > 0) pr._blockCd -= dt;
    if (!(pr._blockCd > 0)) {
      for (let j = 0; j < run.projectiles.length; j++) {
        const b = run.projectiles[j];
        if (b.kind === 'enemyBullet' && !b.dead) {
          const rr = evo.guardBlockR * sigScale + (b.r || 0);
          if ((b.x - pr.x) ** 2 + (b.y - pr.y) ** 2 <= rr * rr) {
            b.dead = true;
            pr._blockCd = evo.guardBlockCd || 0.65;
            break;
          }
        }
      }
    }

    if (pr.atkT <= 0) {
      const list = hash.queryCircle(pr.x, pr.y, evo.guardHitR * sigScale, near);
      let any = false;
      for (let j = 0; j < list.length; j++) {
        const e = list[j];
        if (e.dead) continue;
        damageEnemy(run, e, dmg * 0.85, 'paperman', { knock: 95, originX: p.x, originY: p.y });
        any = true;
      }
      if (any) pr.atkT = (evo.guardAtkCd * sigCdMul) / haste;
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
      const cands = hash.queryCircle(p.x, p.y, evo.seekRange * sigScale, near);
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
        pr.angle = fatan2(uy, ux);
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
        const tx = p.x + fcos(oa) * 90;
        const ty = p.y + fsin(oa) * 90;
        const dx = tx - pr.x;
        const dy = ty - pr.y;
        const d = Math.hypot(dx, dy);
        if (d > 1) {
          const step = Math.min(d, spd * dt);
          pr.x += (dx / d) * step;
          pr.y += (dy / d) * step;
          pr.angle = fatan2(dy, dx);
        }
      }
    }

    const hits = hash.queryCircle(pr.x, pr.y, pr.r + 5, near);
    for (let j = 0; j < hits.length; j++) {
      const e = hits[j];
      if (e.dead || (pr._hitUntil.get(e.id) || 0) > run.time) continue;
      pr._hitUntil.set(e.id, run.time + (evo.cavalryHitCd * sigCdMul) / haste);
      damageEnemy(run, e, dmg * evo.cavalryDmgMul, 'paperman', {
        knock: evo.cavalryKnock,
        knockDx: fcos(pr.angle),
        knockDy: fsin(pr.angle),
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
  const t = hash.nearest(pr.x, pr.y, def.seekRange * sigScale, near, (e) => !e.dead);
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
    tx = p.x + fcos(a) * FX.summonOffset;
    ty = p.y + fsin(a) * FX.summonOffset;
  }
  const dx = tx - pr.x;
  const dy = ty - pr.y;
  const d = Math.hypot(dx, dy);
  const spd = def.speed * haste;
  if (d > 1) {
    const step = Math.min(d, spd * dt);
    pr.x += (dx / d) * step;
    pr.y += (dy / d) * step;
    pr.angle = fatan2(dy, dx);
  }
  if (t && pr.atkT <= 0 && d <= pr.r + t.r + FX.summonReach) {
    damageEnemy(run, t, dmg, 'paperman');
    pr.atkT = (def.atkCd * sigCdMul) / haste;
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
          weaponId: pr.weaponId || 'compass',
          evolved: true,
          explosionKind: 'compassStar',
          knock: 90,
          ownerSlot: pr.ownerSlot || 0,
          attackVfx: pr.attackVfx || null,
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
    const want = fatan2(pr._aimTarget.y - p.y, pr._aimTarget.x - p.x);
    pr.baseAngle = turnToward(pr.baseAngle, want, def.turnSpeed * dt);
  }
  pr.angle = pr.baseAngle + (pr.angleOffset || 0);
  pr.endX = p.x + fcos(pr.angle) * pr.length;
  pr.endY = p.y + fsin(pr.angle) * pr.length;

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
        knockDx: fcos(pr.angle),
        knockDy: fsin(pr.angle),
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
          ownerSlot: pr.ownerSlot || 0,
          attackVfx: pr.attackVfx || null,
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
          ownerSlot: pr.ownerSlot || 0,
        });
      }
    }
  }
}

function updateFlyingSwordProj(run, pr, dt, hash, near) {
  const def = WEAPONS.taomujian;
  const evo = def.evo;
  let t = pr._tgt;
  if (!t || t.dead) {
    t = pr._tgt = hash.nearest(pr.x, pr.y, pr.seekRange || def.seekRange, near, (e) => !e.dead && !pr._hit.includes(e.id));
  }
  if (t) {
    const want = fatan2(t.y - pr.y, t.x - pr.x);
    pr.angle = turnToward(pr.angle, want, (pr.turnRate || def.turnRate) * dt);
    pr.vx = fcos(pr.angle) * pr.speed;
    pr.vy = fsin(pr.angle) * pr.speed;
  }
  pr.x += pr.vx * dt;
  pr.y += pr.vy * dt;
  hitPropsCircle(run, pr.x, pr.y, pr.r);

  const list = hash.queryCircle(pr.x, pr.y, pr.r, near);
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (e.dead || pr._hit.includes(e.id)) continue;
    pr._hit.push(e.id);
    damageEnemy(run, e, pr.dmg, 'taomujian', {
      knock: def.knockback,
      knockDx: pr.vx,
      knockDy: pr.vy,
    });
    if (pr.evolved) {
      run._taomujianHits = (run._taomujianHits || 0) + 1;
      if (run._taomujianHits % evo.thunderEvery === 0) {
        const tr = evo.thunderRadius * (run.mods?.areaMul || 1);
        damageCircle(run, e.x, e.y, tr, pr.dmg * evo.thunderDmgMul, 'taomujian', {
          stun: evo.stun,
          knock: 75,
        });
        run.projectiles.push({
          id: run._nextId++,
          kind: 'thunderBolt',
          weaponId: 'taomujian',
          ownerSlot: pr.ownerSlot || 0,
          attackVfx: pr.attackVfx || null,
          evolved: true,
          x: e.x,
          y: e.y,
          r: 10,
          radius: tr,
          angle: 0,
          t: 0,
          life: 0.28,
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

function updateFireCrowProj(run, pr, dt, hash, near) {
  const def = WEAPONS.zhinian_kite;
  const evo = def.evo;
  let t = pr._tgt;
  if (!t || t.dead) {
    t = pr._tgt = hash.nearest(pr.x, pr.y, pr.seekRange || def.seekRange, near, (e) => !e.dead);
  }
  if (t) {
    const want = fatan2(t.y - pr.y, t.x - pr.x);
    pr.angle = turnToward(pr.angle, want, (pr.turnRate || def.turnRate) * dt);
    pr.vx = fcos(pr.angle) * pr.speed;
    pr.vy = fsin(pr.angle) * pr.speed;
  }
  pr.x += pr.vx * dt;
  pr.y += pr.vy * dt;

  if (pr.evolved) {
    pr._trailT = (pr._trailT ?? evo.trailInterval) - dt;
    if (pr._trailT <= 0) {
      pr._trailT = evo.trailInterval;
      const tr = evo.trailRadius * (run.mods?.areaMul || 1);
      run.projectiles.push({
        id: run._nextId++,
        kind: 'inkPool',
        weaponId: 'zhinian_kite',
        subKind: 'emberZone',
        ownerSlot: pr.ownerSlot || 0,
        attackVfx: pr.attackVfx || null,
        evolved: true,
        x: pr.x,
        y: pr.y,
        r: Math.max(0, tr),
        radius: tr,
        angle: pr.angle,
        t: 0,
        life: evo.trailLife * (run.mods?.durMul || 1),
        tick: evo.trailTick,
        _tickT: 0.12,
        dmg: pr.dmg * evo.trailDmgMul,
      });
    }
  }

  let hitEnemy = false;
  const list = hash.queryCircle(pr.x, pr.y, pr.r + 4, near);
  for (let i = 0; i < list.length; i++) {
    if (!list[i].dead) {
      hitEnemy = true;
      break;
    }
  }

  if (hitEnemy || pr.t >= pr.life) {
    pr.dead = true;
    const blastR = pr.blastR || pr.radius || 52;
    if (pr.evolved) {
      const marked = hash.queryCircle(pr.x, pr.y, blastR, run._sys.scratchW2);
      for (let i = 0; i < marked.length; i++) {
        const e = marked[i];
        if (e.dead) continue;
        e.yangyanMarkT = Math.max(e.yangyanMarkT || 0, evo.markDuration);
        e.yangyanBurstDmg = Math.max(e.yangyanBurstDmg || 0, pr.dmg * 0.85);
        e.yangyanBurstR = Math.max(e.yangyanBurstR || 0, blastR * 0.9);
      }
    }
    explode(run, pr.x, pr.y, blastR, pr.dmg, 'zhinian_kite', {
      evolved: pr.evolved,
      explosionKind: pr.evolved ? 'goldenCrow' : 'fireCrow',
      knock: def.knockback,
    });
  }
}

function updateNuoDrumProj(run, pr, dt) {
  const def = WEAPONS.nuo_drum;
  const evo = def.evo;
  pr._beatT -= dt;
  while (pr._beatT <= 0 && pr.beatsLeft > 0) {
    pr._beatT += pr.beatInterval;
    pr.beatsLeft--;
    const isFinal = pr.beatsLeft === 0;
    const accent = isFinal ? (pr.evolved ? evo.accentDmgMul : def.accentDmgMul) : 1;
    damageCircle(run, pr.x, pr.y, pr.radius, pr.dmg * accent, 'nuo_drum', {
      knock: isFinal ? def.knockback * 1.35 : def.knockback * 0.65,
      slow: 0.65,
      ...(isFinal ? { stun: pr.evolved ? evo.stunDur : 0.35 } : {}),
      ...(pr.evolved ? { armorBreak: isFinal, vuln: evo.vulnDur, vulnPct: evo.vulnPct } : {}),
    });

    if (pr.evolved && isFinal) {
      for (let j = 0; j < run.projectiles.length; j++) {
        const b = run.projectiles[j];
        if (b.kind === 'enemyBullet' && !b.dead) {
          const rr = pr.radius + (b.r || 0);
          if ((b.x - pr.x) ** 2 + (b.y - pr.y) ** 2 <= rr * rr) b.dead = true;
        }
      }
    }

    run.projectiles.push({
      id: run._nextId++,
      kind: 'nuoBeat',
      subKind: 'nuoBeat',
      fixedPos: true,
      weaponId: 'nuo_drum',
      ownerSlot: pr.ownerSlot || 0,
      attackVfx: pr.attackVfx || null,
      x: pr.x,
      y: pr.y,
      r: Math.max(0, pr.radius),
      radius: 0,
      maxRadius: pr.radius,
      angle: 0,
      t: 0,
      life: 0.30,
      evolved: pr.evolved,
    });

    if (isFinal && pr.evolved) {
      const burstR = evo.maskBurstR * (run.mods?.areaMul || 1);
      const md = pr.radius * 0.68;
      for (let m = 0; m < evo.maskBursts; m++) {
        const ma = (m / evo.maskBursts) * Math.PI * 2;
        run._scheduled.push({
          delay: 0.06 * (m + 1),
          type: 'explosion',
          x: pr.x + fcos(ma) * md,
          y: pr.y + fsin(ma) * md,
          radius: burstR,
          dmg: pr.dmg * evo.maskBurstMul,
          weaponId: 'nuo_drum',
          evolved: true,
          explosionKind: 'nuoMaskBurst',
          knock: 90,
          ownerSlot: pr.ownerSlot || 0,
          attackVfx: pr.attackVfx || null,
        });
      }
    }
  }
}

function updateSkyLanternProj(run, pr, hash, arr) {
  const def = WEAPONS.sky_lantern;
  const evo = def.evo;
  const k = Math.min(1, pr.t / pr.life);
  pr.x = pr.fromX + (pr.toX - pr.fromX) * k;
  pr.y = pr.fromY + (pr.toY - pr.fromY) * k;

  if (pr.evolved && !pr._midSpark && k >= 0.5) {
    pr._midSpark = true;
    damageCircle(run, pr.x, pr.y, Math.max(26, pr.radius * 0.5), pr.dmg * 0.28, 'sky_lantern', { knock: 45 });
  }

  if (k >= 1) {
    pr.dead = true;
    const blastR = pr.radius || 62;
    if (pr.evolved) {
      const marked = hash.queryCircle(pr.toX, pr.toY, blastR, run._sys.scratchW2);
      for (let i = 0; i < marked.length; i++) {
        const e = marked[i];
        if (e.dead) continue;
        e.yangyanMarkT = Math.max(e.yangyanMarkT || 0, evo.markDuration);
        e.yangyanBurstDmg = Math.max(e.yangyanBurstDmg || 0, pr.dmg * 0.8);
        e.yangyanBurstR = Math.max(e.yangyanBurstR || 0, blastR * 0.88);
      }
      arr.push({
        id: run._nextId++,
        kind: 'inkPool',
        weaponId: 'sky_lantern',
        subKind: 'emberZone',
        ownerSlot: pr.ownerSlot || 0,
        attackVfx: pr.attackVfx || null,
        evolved: true,
        x: pr.toX,
        y: pr.toY,
        r: Math.max(0, blastR),
        radius: blastR,
        angle: 0,
        t: 0,
        life: evo.emberLife * (run.mods?.durMul || 1),
        tick: evo.emberTick,
        _tickT: 0.16,
        dmg: pr.dmg * evo.emberDmgMul,
      });
    }
    explode(run, pr.toX, pr.toY, blastR, pr.dmg, 'sky_lantern', {
      evolved: pr.evolved,
      explosionKind: pr.evolved ? 'skyLanternEvo' : 'skyLantern',
      knock: def.knockback,
    });
  }
}

function updateInkLineProj(run, pr, dt, hash) {
  const def = WEAPONS.carpenter_line;
  const evo = def.evo;
  if (pr.evolved && pr.tick > 0) {
    pr._tickT -= dt;
    if (pr._tickT <= 0) {
      pr._tickT += pr.tick;
      const halfW = (pr.width || 24) * 0.5;
      const mx = (pr.ax + pr.bx) * 0.5;
      const my = (pr.ay + pr.by) * 0.5;
      const segHalf = (pr.length || 180) * 0.5 + halfW + 36;
      const list = hash.queryCircle(mx, my, segHalf, run._sys.scratchW2);
      const activeSlot = pr.ownerSlot || 0;
      for (let i = 0; i < list.length; i++) {
        const e = list[i];
        if (e.dead) continue;
        const rr = halfW + e.r;
        if (pointToSegDist2(e.x, e.y, pr.ax, pr.ay, pr.bx, pr.by) > rr * rr) continue;
        applySlow(run, e, 0.75);
        if (pr.bleedDur > 0 && pr.bleedDps > 0) {
          e.bleedT = Math.max(e.bleedT || 0, pr.bleedDur);
          e.bleedDps = Math.max(e.bleedDps || 0, pr.bleedDps);
          e.bleedSlot = activeSlot;
        }
        damageEnemy(run, e, pr.dmg, 'carpenter_line', {
          knock: def.knockback * 0.5,
          armorBreak: true,
        });
      }
    }
  }
  if (pr.t >= pr.life) {
    pr.dead = true;
    if (pr.evolved && pr.snapBurst) {
      explode(
        run,
        (pr.ax + pr.bx) * 0.5,
        (pr.ay + pr.by) * 0.5,
        evo.burstRadius * (run.mods?.areaMul || 1),
        (pr.fullDmg || pr.dmg) * evo.burstDmgMul,
        'carpenter_line',
        {
          evolved: true,
          explosionKind: 'inkSnap',
          knock: 95,
          armorBreak: true,
        },
      );
    }
  }
}

function updateLuopanSlipProj(run, pr, dt, hash, near) {
  const def = WEAPONS.luopan_slip;
  const evo = def.evo;
  let t = pr._tgt;
  if (!t || t.dead) {
    t = pr._tgt = hash.nearest(pr.x, pr.y, pr.seekRange || def.seekRange, near, (e) => !e.dead && !pr._hit.includes(e.id));
  }
  if (t) {
    const want = fatan2(t.y - pr.y, t.x - pr.x);
    pr.angle = turnToward(pr.angle, want, (pr.turnRate || def.turnRate) * dt);
    pr.vx = fcos(pr.angle) * pr.speed;
    pr.vy = fsin(pr.angle) * pr.speed;
  }
  pr.x += pr.vx * dt;
  pr.y += pr.vy * dt;
  hitPropsCircle(run, pr.x, pr.y, pr.r);

  const list = hash.queryCircle(pr.x, pr.y, pr.r, near);
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (e.dead || pr._hit.includes(e.id)) continue;
    pr._hit.push(e.id);
    damageEnemy(run, e, pr.dmg, 'luopan_slip', {
      knock: def.knockback,
      knockDx: pr.vx,
      knockDy: pr.vy,
    });
    if (pr.evolved && !e.dead) {
      e._acupointHits = (e._acupointHits || 0) + 1;
      if (e._acupointHits >= evo.acupointHits) {
        e._acupointHits = 0;
        explode(run, e.x, e.y, evo.burstRadius * (run.mods?.areaMul || 1), pr.dmg * evo.burstDmgMul, 'luopan_slip', {
          evolved: true,
          explosionKind: 'acupointBurst',
          knock: 85,
          stun: evo.stunDur,
          vuln: evo.vulnDur,
          vulnPct: evo.vulnPct,
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

function updateBambooWaveProj(run, pr, dt, hash, near) {
  pr.x += pr.vx * dt;
  pr.y += pr.vy * dt;
  const hitR = pr.hitR || pr.radius || pr.r || 22;
  hitPropsCircle(run, pr.x, pr.y, hitR);
  if (pr.clearBullets) {
    for (let j = 0; j < run.projectiles.length; j++) {
      const b = run.projectiles[j];
      if (b.kind === 'enemyBullet' && !b.dead) {
        const rr = hitR + (b.r || 0);
        if ((b.x - pr.x) ** 2 + (b.y - pr.y) ** 2 <= rr * rr) b.dead = true;
      }
    }
  }
  const wid = pr.weaponId || 'bamboo_pole';
  const list = hash.queryCircle(pr.x, pr.y, hitR, near);
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (e.dead || pr._hit.includes(e.id)) continue;
    pr._hit.push(e.id);
    applySlow(run, e, 1.0);
    if (pr.stunDur > 0) applyStun(run, e, pr.stunDur);
    damageEnemy(run, e, pr.dmg, wid, {
      knock: 95,
      knockDx: pr.vx,
      knockDy: pr.vy,
      armorBreak: !!pr.evolved,
    });
  }
}

function updateAbacusBeadProj(run, pr, dt, hash, near) {
  const def = WEAPONS.gold_abacus;
  const evo = def.evo;
  let t = pr._tgt;
  if (!t || t.dead) {
    t = pr._tgt = hash.nearest(pr.x, pr.y, pr.bounceRange || def.bounceRange, near, (e) => !e.dead && !pr._hit.includes(e.id));
  }
  if (t) {
    const want = fatan2(t.y - pr.y, t.x - pr.x);
    pr.angle = turnToward(pr.angle, want, 12.5 * dt);
    pr.vx = fcos(pr.angle) * pr.speed;
    pr.vy = fsin(pr.angle) * pr.speed;
  }
  pr.x += pr.vx * dt;
  pr.y += pr.vy * dt;
  hitPropsCircle(run, pr.x, pr.y, pr.r);

  const wid = pr.weaponId || 'gold_abacus';
  const list = hash.queryCircle(pr.x, pr.y, pr.r + 3, near);
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (e.dead || pr._hit.includes(e.id)) continue;
    pr._hit.push(e.id);
    pr.bounceCount = (pr.bounceCount || 0) + 1;
    damageEnemy(run, e, pr.dmg, wid, {
      knock: def.knockback,
      knockDx: pr.vx,
      knockDy: pr.vy,
    });

    if (pr.evolved && pr.bounceCount % evo.burstEvery === 0) {
      explode(run, e.x, e.y, evo.burstRadius * (run.mods?.areaMul || 1), pr.dmg * evo.burstDmgMul, wid, {
        evolved: true,
        explosionKind: 'abacusGoldBurst',
        knock: 75,
      });
      if (run.rng.chance(evo.coinChance * (run.mods?.coinDropMul || 1))) {
        dropPickup(run, 'coin', e.x, e.y, 1);
      }
    }

    if ((pr.bouncesLeft || 0) <= 0) {
      pr.dead = true;
      break;
    }
    pr.bouncesLeft--;

    const bRange = pr.bounceRange || def.bounceRange;
    let next = hash.nearest(e.x, e.y, bRange, run._sys.scratchW2, (cand) => !cand.dead && cand.id !== e.id && !pr._hit.includes(cand.id));
    if (!next) {
      pr._hit.length = 0;
      pr._hit.push(e.id);
      next = hash.nearest(e.x, e.y, bRange, run._sys.scratchW2, (cand) => !cand.dead && cand.id !== e.id);
    }
    if (next) {
      pr._tgt = next;
      pr.angle = fatan2(next.y - pr.y, next.x - pr.x);
      pr.vx = fcos(pr.angle) * pr.speed;
      pr.vy = fsin(pr.angle) * pr.speed;
    } else {
      pr.dead = true;
    }
    break;
  }
}

