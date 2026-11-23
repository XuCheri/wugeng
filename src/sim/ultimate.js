// 英雄专属大招（F10）：老周「五更镇魂锣」、阿绵「百鬼纸马阵」、小道童「九天玄雷敕」；
// 同时结算引魂灯芯的武器冷却返还与五雷号令命签的极速暴伤增益。

import { ULT } from './balance.js';
import { damageCircle } from './combat.js';
import { weaponFullCooldown } from './weapons.js';
import { recomputeMods } from './player.js';
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

  // 五雷号令命签：大招后极速与暴伤增益
  if ((run.mods?.thunderDecreeStacks || 0) > 0) {
    run._ultFrenzyT = BLESSING_TUNING.thunder_decree.frenzySec;
    recomputeMods(run);
  }

  const areaMul = run.mods?.areaMul || 1;
  const dmg = ULT.baseDmg + ULT.perLevelDmg * p.level;
  const heroId = run.heroId || 'zhou';

  if (heroId === 'mian') {
    // 纸扎匠·阿绵：百鬼纸马阵（八骑八向踏弹穿阵 + 5 秒纸兵狂热）
    const M = ULT.mian;
    const R = M.burstR * areaMul;
    clearEnemyBullets(run, p.x, p.y, 180 * areaMul);
    damageCircle(run, p.x, p.y, R, dmg * M.burstDmgMul, 'ult', { knock: 240, stun: 0.7 });
    run.projectiles.push({
      id: run._nextId++,
      kind: 'ultPulse',
      weaponId: 'ult',
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
      const cosA = Math.cos(a);
      const sinA = Math.sin(a);
      run.projectiles.push({
        id: run._nextId++,
        kind: 'paperHorse',
        weaponId: 'paperhorse',
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
    clearEnemyBullets(run, p.x, p.y, 185 * areaMul);
    damageCircle(run, p.x, p.y, R, dmg * D.burstDmgMul, 'ult', { knock: 220, stun: D.stun });
    run.projectiles.push({
      id: run._nextId++,
      kind: 'ultPulse',
      weaponId: 'ult',
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
      });
    }
  } else {
    // 打更人·老周：五更镇魂锣（三叠扩域震波 + 破甲易伤 + 净除敌弹）
    const Z = ULT.zhou;
    const r0 = Z.radii[0] * areaMul;
    clearEnemyBullets(run, p.x, p.y, 260 * areaMul);
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
      });
    }
  }

  run.events.push({ type: 'ult', heroId, x: p.x, y: p.y });
  run.stats.ultsCast = (run.stats.ultsCast || 0) + 1;
  return true;
}

export function updateUltimate(run, input) {
  if (input && input.ultimate) castUlt(run);
}
