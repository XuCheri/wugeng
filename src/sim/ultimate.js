// 英雄专属大招（F10）：老周「五更镇魂锣」、阿绵「百鬼纸马阵」、小道童「九天玄雷敕」；
// 同时结算引魂灯芯的武器冷却返还与五雷号令命签的极速暴伤增益。

import { ULT, HEROES } from './balance.js';
import { fsin, fcos, fatan2 } from '../core/math.js';
import { damageCircle } from './combat.js';
import { weaponFullCooldown } from './weapons.js';
import { recomputeMods, earnCoins } from './player.js';
import { collectPickup } from './pickups.js';
import { BLESSING_TUNING } from './blessings.js';

export function ultReady(run) {
  return run.player.ult >= (run.player.ultMax ?? ULT.cost);
}

function clearEnemyBullets(run, x, y, radius) {
  for (let i = 0; i < run.projectiles.length; i++) {
    const pr = run.projectiles[i];
    if (pr.kind === 'enemyBullet' && !pr.dead) {
      const rr = radius + (pr.r || 0);
      if ((pr.x - x) ** 2 + (pr.y - y) ** 2 <= rr * rr) pr.dead = true;
    }
  }
}

/** 释放大招；force=true 时无视气量（复活时的自动大招） */
export function castUlt(run, force = false) {
  const p = run.player;
  if (!force && !ultReady(run)) return false;
  if (!force) p.ult = 0;

  // 引魂灯芯：释放大招时按比例返还所有武器冷却
  const refund = run.mods?.ultCdRefund || 0;
  if (refund > 0) {
    for (const w of run.weapons) {
      const full = weaponFullCooldown(run, w);
      if (full > 0 && w.cd > 0) {
        w.cd = Math.max(0, w.cd - full * refund);
      }
    }
  }

  // 五雷号令命签与五色傩面五阶觉醒：大招后增益
  const caps = run.mods?.capstones || {};
  if (caps.soulwick && !force) {
    p.dashCd = 0;
    p.ult = Math.min(p.ultMax ?? ULT.cost, p.ult + 15);
  }
  let needRecompute = false;
  if ((run.mods?.thunderDecreeStacks || 0) > 0) {
    run._ultFrenzyT = BLESSING_TUNING.thunder_decree.frenzySec;
    needRecompute = true;
  }
  if (caps.wuse_mask) {
    run._wuseMaskT = 5.0;
    needRecompute = true;
  }
  if (needRecompute) recomputeMods(run);

  const areaMul = run.mods?.areaMul || 1;
  const dmg = ULT.baseDmg + ULT.perLevelDmg * p.level;
  const heroId = p.heroId || run.heroId || 'zhou';
  const ownerSlot = run._activeSlot || 0;

  if (heroId === 'mian') {
    // 纸扎匠·阿绵：百鬼纸马阵（八骑八向踏弹穿阵 + 5 秒纸兵狂热）
    const M = ULT.mian;
    const R = M.burstR * areaMul;
    clearEnemyBullets(run, p.x, p.y, 180 * Math.min(areaMul, 1.2));
    damageCircle(run, p.x, p.y, R, dmg * M.burstDmgMul, 'ult', { knock: 240, stun: 0.7 });
    run.projectiles.push({
      id: run._nextId++,
      kind: 'ultPulse',
      weaponId: 'ult',
      ownerSlot,
      x: p.x,
      y: p.y,
      r: Math.max(0, R),
      angle: 0,
      t: 0,
      life: ULT.pulseLife,
      radius: 0,
      maxRadius: R,
    });
    const hitR = M.horseHitR * areaMul;
    for (let i = 0; i < M.horses; i++) {
      const a = (i / M.horses) * Math.PI * 2;
      const cosA = fcos(a);
      const sinA = fsin(a);
      run.projectiles.push({
        id: run._nextId++,
        kind: 'paperHorse',
        weaponId: 'paperhorse',
        ownerSlot,
        x: p.x + cosA * 18,
        y: p.y + sinA * 18,
        r: M.horseR,
        hitR,
        radius: hitR,
        angle: a,
        t: 0,
        life: M.horseLife,
        vx: cosA * M.horseSpeed,
        vy: sinA * M.horseSpeed,
        speed: M.horseSpeed,
        dmg: dmg * M.horseDmgMul,
        knock: 180,
        evolved: true,
        trampleBullets: true,
        _hit: [],
      });
    }
    run._summonFrenzyT = M.frenzyT;
    recomputeMods(run);
  } else if (heroId === 'daotong') {
    // 小道童：九天玄雷敕（镇坛震波 + 九道索敌玄雷连劈）
    const D = ULT.daotong;
    const R = D.burstR * areaMul;
    const strikeR = D.strikeRadius * areaMul;
    clearEnemyBullets(run, p.x, p.y, 185 * Math.min(areaMul, 1.2));
    damageCircle(run, p.x, p.y, R, dmg * D.burstDmgMul, 'ult', { knock: 220, stun: D.stun });
    run.projectiles.push({
      id: run._nextId++,
      kind: 'ultPulse',
      weaponId: 'ult',
      ownerSlot,
      x: p.x,
      y: p.y,
      r: Math.max(0, R),
      angle: 0,
      t: 0,
      life: ULT.pulseLife,
      radius: 0,
      maxRadius: R,
    });
    const struck = new Set();
    for (let i = 0; i < D.strikes; i++) {
      run._scheduled.push({
        delay: i * D.strikeInterval,
        type: 'thunderStrike',
        radius: strikeR,
        dmg: dmg * D.strikeDmgMul,
        seekRange: D.seekRange,
        stun: D.stun,
        struck,
        ownerSlot,
      });
    }
  } else if (heroId === 'yinyang') {
    // 阴阳先生·沈观星：奇门遁甲大阵（八卦聚怪大阵 + 四门天星连爆易伤）
    const Y = ULT.yinyang;
    const R = Y.burstR * areaMul;
    const fieldR = Y.fieldRadius * areaMul;
    clearEnemyBullets(run, p.x, p.y, 240 * Math.min(areaMul, 1.2));
    damageCircle(run, p.x, p.y, R, dmg * Y.burstDmgMul, 'ult', {
      knock: 160,
      stun: Y.stun,
      vuln: Y.vulnT,
      vulnPct: Y.vulnPct,
    });
    run.projectiles.push({
      id: run._nextId++,
      kind: 'ultPulse',
      weaponId: 'ult',
      ownerSlot,
      x: p.x,
      y: p.y,
      r: Math.max(0, R),
      angle: 0,
      t: 0,
      life: ULT.pulseLife,
      radius: 0,
      maxRadius: R,
    });
    run.projectiles.push({
      id: run._nextId++,
      kind: 'compassField',
      subKind: 'qimenArray',
      weaponId: 'compass',
      ownerSlot,
      x: p.x,
      y: p.y,
      r: 12,
      radius: fieldR,
      angle: 0,
      t: 0,
      life: Y.fieldLife,
      dmg: dmg * 0.55,
      tick: Y.fieldTick,
      _tickT: 0.1,
      pullForce: Y.pullForce,
      evolved: true,
    });
    for (let i = 0; i < Y.gates; i++) {
      const a = (i / Y.gates) * Math.PI * 2 + Math.PI / 4;
      const gd = Y.gateDist * areaMul;
      run._scheduled.push({
        delay: Y.gateDelay * (i + 1),
        type: 'explosion',
        x: p.x + fcos(a) * gd,
        y: p.y + fsin(a) * gd,
        radius: Y.gateRadius * areaMul,
        dmg: dmg * Y.gateDmgMul,
        weaponId: 'ult',
        evolved: true,
        explosionKind: 'compassStar',
        knock: 120,
        stun: Y.stun,
        vuln: Y.vulnT,
        vulnPct: Y.vulnPct,
        ownerSlot,
      });
    }
  } else if (heroId === 'tiejiang') {
    // 镇魂铁匠·石敢当：十方熔金镇狱锤（碎甲震退 + 金身护体 + 十方铁砧熔火场）
    const T = ULT.tiejiang;
    const R = T.slamR * areaMul;
    const emberR = T.emberRadius * areaMul;
    clearEnemyBullets(run, p.x, p.y, 230 * Math.min(areaMul, 1.2));
    p.invulnT = Math.max(p.invulnT || 0, T.wardInvuln);
    damageCircle(run, p.x, p.y, R, dmg * T.slamDmgMul, 'ult', {
      armorBreak: true,
      knock: 340,
      stun: T.stun,
      vuln: T.vulnT,
      vulnPct: T.vulnPct,
    });
    run.projectiles.push({
      id: run._nextId++,
      kind: 'ultPulse',
      weaponId: 'ult',
      ownerSlot,
      x: p.x,
      y: p.y,
      r: Math.max(0, R),
      angle: 0,
      t: 0,
      life: ULT.pulseLife,
      radius: 0,
      maxRadius: R,
    });
    run.projectiles.push({
      id: run._nextId++,
      kind: 'inkPool',
      weaponId: 'ult',
      subKind: 'moltenZone',
      ownerSlot,
      evolved: true,
      x: p.x,
      y: p.y,
      r: Math.max(0, emberR),
      radius: emberR,
      angle: 0,
      t: 0,
      life: T.emberLife,
      tick: T.emberTick,
      _tickT: 0.15,
      dmg: dmg * T.emberDmgMul,
    });
    for (let i = 0; i < T.anvils; i++) {
      const a = (i / T.anvils) * Math.PI * 2;
      const rd = T.ringDist * areaMul;
      run._scheduled.push({
        delay: (i + 1) * T.anvilInterval,
        type: 'explosion',
        x: p.x + fcos(a) * rd,
        y: p.y + fsin(a) * rd,
        radius: T.anvilRadius * areaMul,
        dmg: dmg * T.anvilDmgMul,
        weaponId: 'ult',
        evolved: true,
        explosionKind: 'forgeAnvil',
        armorBreak: true,
        knock: 160,
        stun: 0.6,
        ownerSlot,
      });
    }
  } else if (heroId === 'nuoxi') {
    // 傩戏传人·柳青衣：大傩逐疫百相舞（四重随身逐疫傩鼓净弹 + 5 秒疾舞攻移速）
    const N = ULT.nuoxi;
    const R = N.burstR * areaMul;
    clearEnemyBullets(run, p.x, p.y, 220 * Math.min(areaMul, 1.2));
    damageCircle(run, p.x, p.y, R, dmg * N.burstDmgMul, 'ult', {
      knock: 200,
      stun: N.stun,
      vuln: N.vulnT,
      vulnPct: N.vulnPct,
    });
    run.projectiles.push({
      id: run._nextId++,
      kind: 'ultPulse',
      weaponId: 'ult',
      ownerSlot,
      x: p.x,
      y: p.y,
      r: Math.max(0, R),
      angle: 0,
      t: 0,
      life: ULT.pulseLife,
      radius: 0,
      maxRadius: R,
    });
    run.projectiles.push({
      id: run._nextId++,
      kind: 'nuoDanceRing',
      weaponId: 'ult',
      ownerSlot,
      evolved: true,
      x: p.x,
      y: p.y,
      r: 46,
      radius: 46,
      maxRadius: 46,
      angle: 0,
      t: 0,
      life: N.danceT,
    });
    for (let k = 0; k < N.beats; k++) {
      run._scheduled.push({
        delay: (k + 1) * N.beatInterval,
        type: 'zhouUltWave',
        radius: N.beatRadius * areaMul,
        dmg: dmg * N.beatDmgMul,
        knock: 180,
        stun: N.stun * 0.65,
        vulnT: N.vulnT,
        vulnPct: N.vulnPct,
        ownerSlot,
      });
    }
    run._nuoDanceT = N.danceT;
    recomputeMods(run);
  } else if (heroId === 'weier') {
    // 水路引灯娘·芦二娘：千浪过（立满五层推浪 + 六道破甲巨浪净弹定身 + 双叠潮涌）
    const W = ULT.weier;
    const R = W.burstR * areaMul;
    p.waveStacks = HEROES.weier.waveMaxStacks || 5;
    p._waveAcc = 0;
    recomputeMods(run);
    clearEnemyBullets(run, p.x, p.y, 240 * Math.min(areaMul, 1.2));
    damageCircle(run, p.x, p.y, R, dmg * W.burstDmgMul, 'ult', {
      armorBreak: true,
      knock: 260,
      stun: W.stun,
      vuln: W.vulnT,
      vulnPct: W.vulnPct,
    });
    run.projectiles.push({
      id: run._nextId++,
      kind: 'ultPulse',
      weaponId: 'ult',
      ownerSlot,
      x: p.x,
      y: p.y,
      r: Math.max(0, R),
      angle: 0,
      t: 0,
      life: ULT.pulseLife,
      radius: 0,
      maxRadius: R,
    });
    const baseA = fatan2(p.facingY || -1, p.facingX || 0);
    const waveR = W.waveR * areaMul;
    for (let i = 0; i < W.waves; i++) {
      const wa = baseA + (i / W.waves) * Math.PI * 2;
      run.projectiles.push({
        id: run._nextId++,
        kind: 'bambooWave',
        weaponId: 'ult',
        ownerSlot,
        x: p.x + fcos(wa) * 20,
        y: p.y + fsin(wa) * 20,
        r: waveR,
        hitR: waveR,
        radius: waveR,
        angle: wa,
        t: 0,
        life: W.waveLife,
        vx: fcos(wa) * W.waveSpeed,
        vy: fsin(wa) * W.waveSpeed,
        speed: W.waveSpeed,
        dmg: dmg * W.waveDmgMul,
        stunDur: W.stun * 0.75,
        clearBullets: true,
        evolved: true,
        _hit: [],
      });
    }
    for (let k = 0; k < W.surgeDelays.length; k++) {
      run._scheduled.push({
        delay: W.surgeDelays[k],
        type: 'zhouUltWave',
        radius: W.surgeRadii[k] * areaMul,
        dmg: dmg * W.surgeDmgMul,
        knock: 240,
        stun: W.stun * 0.65,
        vulnT: W.vulnT,
        vulnPct: W.vulnPct,
        ownerSlot,
      });
    }
  } else if (heroId === 'qiansuanzi') {
    // 账房·钱算子：清账（引爆全屏魂火与铜钱倍率入账 + 化作赤金算子索敌连弹轰击）
    const Q = ULT.qiansuanzi;
    const R = Q.burstR * areaMul;
    clearEnemyBullets(run, p.x, p.y, 235 * Math.min(areaMul, 1.2));
    damageCircle(run, p.x, p.y, R, dmg * Q.burstDmgMul, 'ult', {
      knock: 210,
      stun: Q.stun,
      vuln: Q.vulnT,
      vulnPct: Q.vulnPct,
    });
    run.projectiles.push({
      id: run._nextId++,
      kind: 'ultPulse',
      weaponId: 'ult',
      ownerSlot,
      x: p.x,
      y: p.y,
      r: Math.max(0, R),
      angle: 0,
      t: 0,
      life: ULT.pulseLife,
      radius: 0,
      maxRadius: R,
    });

    const xpList = [];
    for (let i = 0; i < run.pickups.length; i++) {
      if (run.pickups[i].kind === 'xp') xpList.push(run.pickups[i]);
    }
    const batchMult = Math.min(
      HEROES.qiansuanzi.abacusMaxMult || 2.0,
      1 + (HEROES.qiansuanzi.abacusPerOrb || 0.08) * xpList.length,
    );
    const origins = [];
    let keepIdx = 0;
    for (let i = 0; i < run.pickups.length; i++) {
      const pk = run.pickups[i];
      if (pk.kind === 'xp' || pk.kind === 'coin') {
        origins.push({ x: pk.x, y: pk.y });
        if (pk.kind === 'xp') pk.batchMult = Math.max(pk.batchMult || 1, batchMult);
        collectPickup(run, pk, p);
      } else {
        run.pickups[keepIdx++] = pk;
      }
    }
    run.pickups.length = keepIdx;
    p._abacusPulseT = 0;
    earnCoins(run, Q.bonusCoinsBase + Math.min(16, Math.floor(origins.length * 0.5)), true);

    const shotCount = Math.min(Q.maxBeads, Math.max(Q.minBeads, origins.length));
    const liveEnemies = [];
    for (let i = 0; i < run.enemies.length; i++) {
      if (!run.enemies[i].dead) liveEnemies.push(run.enemies[i]);
    }
    for (let s = 0; s < shotCount; s++) {
      const orig = origins.length > 0
        ? origins[s % origins.length]
        : { x: p.x + fcos((s / shotCount) * Math.PI * 2) * 26, y: p.y + fsin((s / shotCount) * Math.PI * 2) * 26 };
      const tgt = liveEnemies.length > 0 ? liveEnemies[s % liveEnemies.length] : null;
      const a = tgt ? fatan2(tgt.y - orig.y, tgt.x - orig.x) : (s / shotCount) * Math.PI * 2;
      run.projectiles.push({
        id: run._nextId++,
        kind: 'abacusBead',
        weaponId: 'ult',
        ownerSlot,
        x: orig.x,
        y: orig.y,
        r: 9,
        angle: a,
        t: 0,
        life: 1.9,
        vx: fcos(a) * Q.beadSpeed,
        vy: fsin(a) * Q.beadSpeed,
        speed: Q.beadSpeed,
        bouncesLeft: Q.beadBounces,
        bounceCount: 0,
        bounceRange: 250 * areaMul,
        dmg: dmg * Q.beadDmgMul,
        evolved: true,
        _hit: [],
        _tgt: tgt,
      });
    }
  } else {
    // 打更人·老周：五更镇魂锣（三叠扩域震波 + 破甲易伤 + 净除敌弹）
    const Z = ULT.zhou;
    const r0 = Z.radii[0] * areaMul;
    clearEnemyBullets(run, p.x, p.y, 260 * Math.min(areaMul, 1.2));
    damageCircle(run, p.x, p.y, r0, dmg * Z.waveDmgMuls[0], 'ult', {
      knock: ULT.knockback,
      stun: Z.stun,
      vuln: Z.vulnT,
      vulnPct: Z.vulnPct,
    });
    run.projectiles.push({
      id: run._nextId++,
      kind: 'ultPulse',
      weaponId: 'ult',
      ownerSlot,
      x: p.x,
      y: p.y,
      r: Math.max(0, r0),
      angle: 0,
      t: 0,
      life: ULT.pulseLife,
      radius: 0,
      maxRadius: r0,
    });
    for (let k = 0; k < Z.waveDelays.length; k++) {
      run._scheduled.push({
        delay: Z.waveDelays[k],
        type: 'zhouUltWave',
        radius: Z.radii[k + 1] * areaMul,
        dmg: dmg * Z.waveDmgMuls[k + 1],
        knock: 280,
        stun: Z.stun * 0.7,
        vulnT: Z.vulnT,
        vulnPct: Z.vulnPct,
        ownerSlot,
      });
    }
  }

  run.events.push({ type: 'ult', heroId, slot: ownerSlot, x: p.x, y: p.y });
  run.stats.ultsCast = (run.stats.ultsCast || 0) + 1;
  return true;
}

export function updateUltimate(run, input) {
  if (input && input.ultimate) castUlt(run);
}
