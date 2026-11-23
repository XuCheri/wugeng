// 武器（PLAN §3.3 + F3/F4/F5）：12 把武器的多路径开光判定、冷却、发射与神兵质变。

import {
  WEAPONS, WEAPON_IDS, RELICS, MAX_WEAPON_LEVEL, MAX_RELIC_LEVEL, MAX_WEAPONS, FX, EVOLUTION,
} from './balance.js';
import { damageCircle, damageEnemy, knockback, applyStun, applyVuln } from './combat.js';
import { hasRelic } from './relics.js';
import { hitPropsCircle } from './props.js';
import { wrapAngle } from '../core/math.js';

/** 取武器某项属性在 level 级时的数值（数组按级取，标量直接返回） */
export function wstat(id, key, level) {
  const v = WEAPONS[id]?.[key];
  return Array.isArray(v) ? v[Math.min(level, MAX_WEAPON_LEVEL) - 1] : v;
}

export function getWeapon(run, id) {
  return run.weapons.find((w) => w.id === id) || null;
}

/** 获得新武器或升一级；返回新等级，失败返回 0 */
export function addOrUpgradeWeapon(run, id) {
  if (!WEAPON_IDS.includes(id)) return 0;
  const w = getWeapon(run, id);
  if (w) {
    if (w.level >= MAX_WEAPON_LEVEL) return 0;
    w.level++;
    return w.level;
  }
  if (run.weapons.length >= MAX_WEAPONS) return 0;
  run.weapons.push({ id, level: 1, evolved: false, evolvedRecipe: null, altarReady: false, cd: FX.firstFireDelay });
  return 1;
}

/** 统计已拥有的某流派器物总数（含百神同契全流派 +1） */
export function countOwnedTag(run, tag) {
  if (!run) return 0;
  let n = 0;
  for (const w of run.weapons) if (WEAPONS[w.id]?.tags?.includes(tag)) n++;
  for (const r of run.relics) if (RELICS[r.id]?.tags?.includes(tag)) n++;
  if (n > 0 || run.weapons.length + run.relics.length > 0) {
    n += run._allSchoolBonus || 0;
  }
  return n;
}

/**
 * 多路径开光配方判定（F3）：
 * 1. paired：拥有本命配对法器（开光后额外享 ×1.18 精通增伤）
 * 2. resonance：拥有 ≥3 件同门流派器物（武器 + 法器合计）
 * 3. maxRelic：拥有任意 1 件 5 级满级法器
 * 4. altar：经土地香案燃血祭器敕封（w.altarReady）
 */
export function getEvolutionRecipe(run, w) {
  if (!run || !w || w.level < MAX_WEAPON_LEVEL || w.evolved) return null;
  const def = WEAPONS[w.id];
  if (!def) return null;

  if (def.pair && hasRelic(run, def.pair)) {
    return { ok: true, recipe: 'paired' };
  }
  if (Array.isArray(def.tags)) {
    for (const tag of def.tags) {
      if (countOwnedTag(run, tag) >= EVOLUTION.resonanceCount) {
        return { ok: true, recipe: 'resonance', tag };
      }
    }
  }
  if (run.relics.some((r) => r.level >= MAX_RELIC_LEVEL)) {
    return { ok: true, recipe: 'maxRelic' };
  }
  if (w.altarReady) {
    return { ok: true, recipe: 'altar' };
  }
  return null;
}

export function canEvolve(run, w) {
  return !!getEvolutionRecipe(run, w);
}

export function evolvableWeapons(run) {
  return run.weapons.filter((w) => canEvolve(run, w));
}

export function evolveWeapon(run, id, forcedRecipe = null) {
  const w = getWeapon(run, id);
  if (!w || w.evolved) return false;
  const rec = forcedRecipe ? { ok: true, recipe: forcedRecipe } : getEvolutionRecipe(run, w);
  if (!rec) return false;
  const def = WEAPONS[id];
  w.evolved = true;
  w.evolvedRecipe = rec.recipe;
  run.events.push({
    type: 'evolve',
    weaponId: id,
    evoName: def.evoName,
    recipe: rec.recipe,
  });
  return true;
}

/** 本武器本次发射的基础伤害（含开光倍率、巧匠开物加成及本命法器 ×1.18 精通） */
function baseDmg(w, run = null) {
  const def = WEAPONS[w.id];
  if (!def) return 0;
  let d = wstat(w.id, 'dmg', w.level);
  if (w.evolved) {
    const evoMult = def.evoMult + (run?.mods?.evoMultBonus || 0);
    d *= evoMult;
    const hasPair = (run && def.pair && hasRelic(run, def.pair)) || w.evolvedRecipe === 'paired';
    if (hasPair) d *= EVOLUTION.pairedMasteryMul;
  }
  return d;
}

/** 武器当前完整冷却时长（开光神兵享全局 ×0.82 急速；亦供引魂灯芯返还冷却使用） */
export function weaponFullCooldown(run, w) {
  const cd = wstat(w.id, 'cd', w.level);
  if (typeof cd === 'number' && cd > 0) {
    return cd * run.mods.cdMul * (w.evolved ? EVOLUTION.evoCdMul : 1);
  }
  const def = WEAPONS[w.id];
  if (def && typeof def.tick === 'number' && def.tick > 0) {
    return (w.evolved && def.evo?.tick ? def.evo.tick : def.tick) * run.mods.cdMul;
  }
  return 0;
}

function cooldown(run, w) {
  return weaponFullCooldown(run, w);
}

export function emitFire(run, w, x = run.player.x, y = run.player.y, angle = 0, extra = null) {
  run.events.push({
    type: 'fire',
    weaponId: w.id,
    evolved: !!w.evolved,
    x,
    y,
    angle,
    ...(extra || {}),
  });
}

function newProj(run, kind, x, y, r, angle, life, extra) {
  const safeR = Math.max(0, Number.isFinite(r) ? r : 0);
  const pr = { id: run._nextId++, kind, x, y, r: safeR, angle, t: 0, life, weaponId: null, ...extra };
  run.projectiles.push(pr);
  return pr;
}

/** 在指定距离内优先挑选 Boss > 精英 > 最近存活敌人 */
function findPriorityTarget(run, x, y, maxR, scratch) {
  const list = run._sys.hash.queryCircle(x, y, maxR, scratch);
  let best = null;
  let bestScore = -Infinity;
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (e.dead) continue;
    const d2 = (e.x - x) ** 2 + (e.y - y) ** 2;
    const score = (e.boss ? 1e8 : e.elite ? 1e6 : 0) - d2;
    if (score > bestScore) {
      bestScore = score;
      best = e;
    }
  }
  return best;
}

// ───────────────────────── 1. 更锣 → 五更鸣锣 ─────────────────────────

function gongPulse(run, w, waveIdx = 1) {
  const p = run.player;
  const def = WEAPONS.gong;
  const evo = def.evo;
  const dmg = baseDmg(w, run);

  if (!w.evolved) {
    const R = wstat('gong', 'radius', w.level) * run.mods.areaMul;
    damageCircle(run, p.x, p.y, R, dmg, 'gong', { knock: def.knockback });
    newProj(run, 'gongPulse', p.x, p.y, R, 0, def.pulseLife, {
      weaponId: 'gong',
      radius: 0,
      maxRadius: R,
      evolved: false,
      waveIdx: 1,
    });
    emitFire(run, w, p.x, p.y, 0, { waveIdx: 1 });
    return;
  }

  if (waveIdx < 3) {
    const R = evo.waveRadius * run.mods.areaMul;
    const list = run._sys.hash.queryCircle(p.x, p.y, R, run._sys.scratchW);
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (e.dead) continue;
      applyVuln(e, evo.vulnDur, evo.vulnPct);
      if (!e.boss) {
        applyStun(run, e, evo.staggerStun);
        const dist = Math.hypot(e.x - p.x, e.y - p.y);
        if (dist > p.r + e.r + 32) {
          knockback(e, p.x - e.x, p.y - e.y, evo.pullForce);
        }
      }
      damageEnemy(run, e, dmg, 'gong', { knock: 0 });
    }
    hitPropsCircle(run, p.x, p.y, R);
    newProj(run, 'gongPulse', p.x, p.y, R, 0, def.pulseLife, {
      weaponId: 'gong',
      radius: 0,
      maxRadius: R,
      evolved: true,
      waveIdx,
    });
    emitFire(run, w, p.x, p.y, 0, { waveIdx });
  } else {
    const R = evo.finalRadius * run.mods.areaMul;
    damageCircle(run, p.x, p.y, R, dmg * evo.finalDmgMul, 'gong', {
      knock: evo.finalKnock,
      stun: evo.finalStun,
      vuln: evo.vulnDur,
      vulnPct: evo.vulnPct,
    });
    for (const pr of run.projectiles) {
      if (pr.kind === 'enemyBullet' && !pr.dead) {
        const rr = R + (pr.r || 0);
        if ((pr.x - p.x) ** 2 + (pr.y - p.y) ** 2 <= rr * rr) pr.dead = true;
      }
    }
    newProj(run, 'gongPulse', p.x, p.y, R, 0, def.pulseLife * 1.25, {
      weaponId: 'gong',
      radius: 0,
      maxRadius: R,
      evolved: true,
      waveIdx: 3,
    });
    emitFire(run, w, p.x, p.y, 0, { waveIdx: 3 });
  }
}

function updateGong(run, w, dt) {
  const evo = WEAPONS.gong.evo;
  if (w._burst > 0) {
    w._burstT -= dt;
    if (w._burstT <= 0) {
      w._burst--;
      w._waveIdx = (w._waveIdx || 1) + 1;
      w._burstT = evo.interval;
      gongPulse(run, w, w._waveIdx);
    }
  }
  w.cd -= dt;
  if (w.cd <= 0) {
    w.cd = cooldown(run, w);
    w._waveIdx = 1;
    gongPulse(run, w, 1);
    if (w.evolved) {
      w._burst = evo.pulses - 1;
      w._burstT = evo.interval;
    } else {
      w._burst = 0;
    }
  }
}

// ───────────────────────── 2. 灯笼 → 长明灯 ─────────────────────────

function updateLantern(run, w, dt) {
  const def = WEAPONS.lantern;
  const evo = def.evo;
  const p = run.player;
  w.cd -= dt;
  if (w.cd > 0) return;
  w.cd = (w.evolved ? evo.tick : def.tick) * run.mods.cdMul;

  const dmg = baseDmg(w, run);
  const hitR = def.hitR * (w.evolved ? 1.25 : 1) * run.mods.areaMul;
  const burstR = evo.burstRadius * run.mods.areaMul;
  const burstDmg = dmg * evo.burstDmgMul;
  let totalHits = 0;
  const bossTouched = new Set();

  const stampMark = (x, y, r) => {
    if (!w.evolved) return;
    const list = run._sys.hash.queryCircle(x, y, r, run._sys.scratchW);
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (e.dead) continue;
      e.yangyanMarkT = evo.markDuration;
      e.yangyanBurstDmg = burstDmg;
      e.yangyanBurstR = burstR;
      if (e.boss) bossTouched.add(e);
    }
  };

  for (let i = 0; i < run.projectiles.length; i++) {
    const pr = run.projectiles[i];
    if (pr.dead) continue;
    if (pr.kind === 'lantern') {
      stampMark(pr.x, pr.y, hitR);
      totalHits += damageCircle(run, pr.x, pr.y, hitR, dmg, 'lantern', { knock: def.knockback });
    } else if (pr.kind === 'flameRing') {
      stampMark(p.x, p.y, pr.radius);
      totalHits += damageCircle(run, p.x, p.y, pr.radius, dmg * evo.ringDmgMul, 'lantern', { knock: 0 });
      if (pr.innerRadius > 0) {
        totalHits += damageCircle(run, p.x, p.y, pr.innerRadius, dmg * evo.innerLotusMul, 'lantern', { knock: 0 });
      }
    }
  }

  if (w.evolved && bossTouched.size > 0) {
    for (const b of bossTouched) {
      if (b.dead) continue;
      b._lanternTicks = (b._lanternTicks || 0) + 1;
      if (b._lanternTicks >= evo.bossStacks) {
        b._lanternTicks = 0;
        run._scheduled.push({
          delay: 0,
          type: 'explosion',
          x: b.x,
          y: b.y,
          radius: evo.bossFlareRadius * run.mods.areaMul,
          dmg: dmg * evo.bossFlareDmgMul,
          weaponId: 'lantern',
          evolved: true,
          explosionKind: 'lanternFlare',
          knock: 110,
        });
      }
    }
  }

  if (totalHits > 0) {
    emitFire(run, w, p.x, p.y, run.time * def.angSpeed);
  }
}

// ───────────────────────── 3. 符纸 → 天师符阵 ─────────────────────────

function updateTalisman(run, w, dt) {
  w.cd -= dt;
  if (w.cd > 0) return;
  const def = WEAPONS.talisman;
  const p = run.player;
  const rawList = run._sys.hash.queryCircle(p.x, p.y, def.seekRange, run._sys.scratchW);
  const targets = [];
  for (let i = 0; i < rawList.length; i++) if (!rawList[i].dead) targets.push(rawList[i]);
  if (!targets.length) {
    w.cd = FX.retryDelay;
    return;
  }
  targets.sort((a, b) => (a.x - p.x) ** 2 + (a.y - p.y) ** 2 - ((b.x - p.x) ** 2 + (b.y - p.y) ** 2));
  w.cd = cooldown(run, w);
  const n = wstat('talisman', 'count', w.level) + (w.evolved ? def.evo.bonusCount : 0) + run.mods.amount;
  const spd = def.speed * run.mods.durMul;
  const dmg = baseDmg(w, run);
  const pierce = (w.evolved ? def.evo.pierce : 0) + (run.mods.bonusPierce || 0);
  const volleyId = run._nextId++;
  let mainAngle = 0;

  for (let i = 0; i < n; i++) {
    const t = targets[i % targets.length];
    const baseA = Math.atan2(t.y - p.y, t.x - p.x);
    if (i === 0) mainAngle = baseA;
    const a = baseA + (i - (n - 1) / 2) * FX.talismanFan;
    newProj(run, 'talisman', p.x, p.y, def.r, a, def.life * run.mods.durMul, {
      weaponId: 'talisman',
      vx: Math.cos(a) * spd,
      vy: Math.sin(a) * spd,
      speed: spd,
      pierce,
      dmg,
      evolved: w.evolved,
      volleyId,
      _tgt: t,
      _hit: [],
    });
  }
  emitFire(run, w, p.x, p.y, mainAngle);
}

// ───────────────────────── 4. 墨笔 → 泼墨山河 ─────────────────────────

/** 扇形伤害（墨笔与招魂幡共用底层判角） */
export function damageSector(run, x, y, R, angle, spread, raw, weaponId, opts) {
  const list = run._sys.hash.queryCircle(x, y, R, run._sys.scratchW);
  const half = spread / 2;
  let hits = 0;
  const subOpts = opts ? { ...opts, originX: x, originY: y } : { originX: x, originY: y };
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (e.dead) continue;
    const d = Math.hypot(e.x - x, e.y - y) || 1;
    const tol = Math.asin(Math.min(1, e.r / d));
    if (Math.abs(wrapAngle(Math.atan2(e.y - y, e.x - x) - angle)) <= half + tol) {
      damageEnemy(run, e, raw, weaponId, subOpts);
      hits++;
    }
  }
  hitPropsCircle(run, x + Math.cos(angle) * R * 0.5, y + Math.sin(angle) * R * 0.5, R * 0.5);
  return hits;
}

function updateBrush(run, w, dt) {
  w.cd -= dt;
  if (w.cd > 0) return;
  w.cd = cooldown(run, w);
  const def = WEAPONS.brush;
  const p = run.player;
  const dmg = baseDmg(w, run);

  if (!w.evolved) {
    const R = wstat('brush', 'radius', w.level) * run.mods.areaMul;
    const spread = (wstat('brush', 'spread', w.level) * Math.PI) / 180;
    const base = Math.atan2(p.facingY, p.facingX);
    damageSector(run, p.x, p.y, R, base, spread, dmg, 'brush', { knock: def.knockback });
    newProj(run, 'brushArc', p.x, p.y, R, base, def.arcLife, {
      weaponId: 'brush',
      radius: R,
      spread,
      evolved: false,
    });
    emitFire(run, w, p.x, p.y, base);
    return;
  }

  // 泼墨山河：周天满圆挥砍 + 360px 贯穿墨浪 + 镇邪墨河
  const evo = def.evo;
  const R = (wstat('brush', 'radius', w.level) + evo.slashRadiusBonus) * run.mods.areaMul;
  const pri = findPriorityTarget(run, p.x, p.y, 380, run._sys.scratchW);
  const aimAngle = pri ? Math.atan2(pri.y - p.y, pri.x - p.x) : Math.atan2(p.facingY, p.facingX);

  damageCircle(run, p.x, p.y, R, dmg, 'brush', { knock: 125, slow: 0.7 });
  newProj(run, 'brushArc', p.x, p.y, R, aimAngle, evo.arcLife, {
    weaponId: 'brush',
    radius: R,
    spread: Math.PI * 1.88,
    evolved: true,
  });

  const waveCount = 1 + Math.min(2, run.mods.amount);
  const waveHitR = evo.waveRadius * run.mods.areaMul;
  const waveRange = evo.waveRange * run.mods.durMul;
  const waveLife = waveRange / evo.waveSpeed;
  for (let i = 0; i < waveCount; i++) {
    const a = aimAngle + (i - (waveCount - 1) / 2) * 0.22;
    newProj(run, 'inkWave', p.x, p.y, 14, a, waveLife, {
      weaponId: 'brush',
      hitR: waveHitR,
      radius: waveHitR,
      vx: Math.cos(a) * evo.waveSpeed,
      vy: Math.sin(a) * evo.waveSpeed,
      speed: evo.waveSpeed,
      dmg: dmg * evo.waveDmgMul,
      evolved: true,
      _hit: [],
    });
  }

  const poolR = evo.poolRadius * run.mods.areaMul;
  for (const dist of [95, 225]) {
    newProj(
      run,
      'inkPool',
      p.x + Math.cos(aimAngle) * dist,
      p.y + Math.sin(aimAngle) * dist,
      poolR,
      aimAngle,
      evo.poolLife * run.mods.durMul,
      {
        weaponId: 'brush',
        subKind: 'inkRiver',
        radius: poolR,
        dmg: dmg * evo.poolDmgMul,
        tick: evo.poolTick,
        _tickT: 0.05,
        evolved: true,
      },
    );
  }

  emitFire(run, w, p.x, p.y, aimAngle);
}

// ───────────────────────── 5. 铜钱剑 → 七星剑阵 ─────────────────────────

function updateCoinsword(run, w, dt) {
  w.cd -= dt;
  if (w.cd > 0) return;
  const def = WEAPONS.coinsword;
  const p = run.player;
  w.cd = cooldown(run, w);
  const dmg = baseDmg(w, run);

  if (w.evolved) {
    const evo = def.evo;
    const n = evo.swords + run.mods.amount;
    const spd = evo.speed * run.mods.durMul;
    const rawList = run._sys.hash.queryCircle(p.x, p.y, evo.seekRange, run._sys.scratchW);
    const threats = [];
    for (let i = 0; i < rawList.length; i++) if (!rawList[i].dead) threats.push(rawList[i]);
    threats.sort((a, b) => {
      const sa = (a.boss ? 2 : a.elite ? 1 : 0);
      const sb = (b.boss ? 2 : b.elite ? 1 : 0);
      if (sb !== sa) return sb - sa;
      return (a.x - p.x) ** 2 + (a.y - p.y) ** 2 - ((b.x - p.x) ** 2 + (b.y - p.y) ** 2);
    });

    const fallbackBase = Math.atan2(p.facingY, p.facingX);
    let primaryAngle = fallbackBase;
    for (let i = 0; i < n; i++) {
      let a;
      if (threats.length > 0) {
        const t = threats[i % Math.min(threats.length, 4)];
        const baseA = Math.atan2(t.y - p.y, t.x - p.x);
        if (i === 0) primaryAngle = baseA;
        const fan = threats.length === 1 ? 0.055 : 0.09;
        a = baseA + (i - (n - 1) / 2) * fan;
      } else {
        a = fallbackBase + (i - (n - 1) / 2) * 0.18;
      }
      const ringA = primaryAngle + (i / n) * Math.PI * 2;
      const sx = p.x + Math.cos(ringA) * 20;
      const sy = p.y + Math.sin(ringA) * 20;
      newProj(run, 'coinsword', sx, sy, def.r, a, FX.coinswordMaxLife, {
        weaponId: 'coinsword',
        vx: Math.cos(a) * spd,
        vy: Math.sin(a) * spd,
        returning: false,
        phase: 'fly',
        speed: spd,
        range: evo.range * run.mods.durMul,
        dist: 0,
        dmg,
        evolved: true,
        _hit: [],
      });
    }
    emitFire(run, w, p.x, p.y, primaryAngle);
  } else {
    const spd = def.speed * run.mods.durMul;
    const n = wstat('coinsword', 'count', w.level) + run.mods.amount;
    const t = run._sys.hash.nearest(p.x, p.y, def.range * 1.5, run._sys.scratchW, (e) => !e.dead);
    const base = t ? Math.atan2(t.y - p.y, t.x - p.x) : Math.atan2(p.facingY, p.facingX);
    for (let i = 0; i < n; i++) {
      const a = base + (i - (n - 1) / 2) * def.spreadAngle;
      newProj(run, 'coinsword', p.x, p.y, def.r, a, FX.coinswordMaxLife, {
        weaponId: 'coinsword',
        vx: Math.cos(a) * spd,
        vy: Math.sin(a) * spd,
        returning: false,
        phase: 'fly',
        speed: spd,
        range: def.range * run.mods.durMul,
        dist: 0,
        dmg,
        evolved: false,
        _hit: [],
      });
    }
    emitFire(run, w, p.x, p.y, base);
  }
}

// ───────────────────────── 7. 爆竹 → 满堂红 ─────────────────────────

function updateFirecracker(run, w, dt) {
  w.cd -= dt;
  if (w.cd > 0) return;
  const def = WEAPONS.firecracker;
  const p = run.player;
  const hash = run._sys.hash;
  const rawCands = hash.queryCircle(p.x, p.y, def.range, run._sys.scratchW);
  const cands = [];
  for (let i = 0; i < rawCands.length; i++) if (!rawCands[i].dead) cands.push(rawCands[i]);
  if (!cands.length) {
    w.cd = FX.retryDelay;
    return;
  }
  w.cd = cooldown(run, w);
  const n = wstat('firecracker', 'count', w.level) + (w.evolved ? def.evo.bonusCount : 0) + run.mods.amount;

  const picks = [];
  const step = Math.max(1, Math.floor(cands.length / def.sample));
  for (let i = 0; i < cands.length && picks.length < def.sample; i += step) picks.push(cands[i]);
  const scored = picks.map((e) => ({
    e,
    n: hash.queryCircle(e.x, e.y, def.densityR, run._sys.scratchW2).length + (e.boss ? 5 : 0),
  }));
  scored.sort((a, b) => b.n - a.n);

  const R = wstat('firecracker', 'radius', w.level) * run.mods.areaMul;
  const flight = w.evolved ? def.evo.flight : def.flight;
  const dmg = baseDmg(w, run);
  const firstT = scored[0].e;
  for (let i = 0; i < n; i++) {
    const t = scored[i % scored.length].e;
    const jx = i > 0 ? run.rng.range(-R * 0.75, R * 0.75) : 0;
    const jy = i > 0 ? run.rng.range(-R * 0.75, R * 0.75) : 0;
    newProj(run, 'firecracker', p.x, p.y, FX.firecrackerR, Math.atan2(t.y - p.y, t.x - p.x), flight, {
      weaponId: 'firecracker',
      fromX: p.x,
      fromY: p.y,
      toX: t.x + jx,
      toY: t.y + jy,
      radius: R,
      dmg,
      evolved: w.evolved,
    });
  }
  emitFire(run, w, p.x, p.y, Math.atan2(firstT.y - p.y, firstT.x - p.x));
}

// ───────────────────────── 8. 铜铃 → 千铃引魂 ─────────────────────────

function updateBell(run, w, dt) {
  w.cd -= dt;
  if (w.cd > 0) return;
  const def = WEAPONS.bell;
  const p = run.player;
  const hash = run._sys.hash;
  const first = hash.nearest(p.x, p.y, def.range, run._sys.scratchW, (e) => !e.dead);
  if (!first) {
    w.cd = FX.retryDelay;
    return;
  }
  w.cd = cooldown(run, w);
  const bounces = wstat('bell', 'bounces', w.level) + run.mods.amount;
  const dmg = baseDmg(w, run);
  const range = def.chainRange * run.mods.areaMul;
  const life = def.chainLife;
  const hit = new Set();

  if (!w.evolved) {
    const pts = [{ x: p.x, y: p.y }];
    let cur = first;
    for (let i = 0; i < bounces && cur; i++) {
      hit.add(cur.id);
      pts.push({ x: cur.x, y: cur.y });
      damageEnemy(run, cur, dmg, 'bell');
      const from = cur;
      cur = hash.nearest(from.x, from.y, range, run._sys.scratchW, (e) => !e.dead && !hit.has(e.id));
    }
    newProj(run, 'bellChain', p.x, p.y, 2, 0, life, { weaponId: 'bell', points: pts, evolved: false });
  } else {
    const evo = def.evo;
    const maxHits = evo.maxHits;
    let frontier = [{ from: { x: p.x, y: p.y }, e: first }];
    hit.add(first.id);
    for (let depth = 0; depth < bounces && frontier.length && hit.size <= maxHits; depth++) {
      const next = [];
      for (const f of frontier) {
        newProj(run, 'bellChain', f.from.x, f.from.y, 2, 0, life, {
          weaponId: 'bell',
          points: [
            { x: f.from.x, y: f.from.y },
            { x: f.e.x, y: f.e.y },
          ],
          evolved: true,
        });
        damageEnemy(run, f.e, dmg, 'bell');
        const near = hash.queryCircle(f.e.x, f.e.y, range, run._sys.scratchW);
        let forks = 0;
        for (const n of near) {
          if (forks >= evo.forks || hit.size >= maxHits) break;
          if (n.dead || hit.has(n.id)) continue;
          hit.add(n.id);
          next.push({ from: { x: f.e.x, y: f.e.y }, e: n });
          forks++;
        }
      }
      frontier = next;
    }

    // 孤立夜主 / 单目标摄魂回响：四叠递增 +15% 追魂铃击
    if (hit.size === 1 || (first.boss && hit.size <= 2)) {
      for (let k = 1; k <= evo.echoHits; k++) {
        run._scheduled.push({
          delay: evo.echoDelay * k,
          type: 'soulEcho',
          target: first,
          dmg: dmg * (1 + evo.echoStepPct * k),
          echoIdx: k,
          range,
        });
      }
    }
  }
  emitFire(run, w, p.x, p.y, Math.atan2(first.y - p.y, first.x - p.x));
}

// ───────────────────────── 9. 罗盘 → 天星定穴盘 ─────────────────────────

function updateCompass(run, w, dt) {
  w.cd -= dt;
  if (w.cd > 0) return;
  const def = WEAPONS.compass;
  const p = run.player;
  const hash = run._sys.hash;
  const rawCands = hash.queryCircle(p.x, p.y, def.range, run._sys.scratchW);
  const cands = [];
  for (let i = 0; i < rawCands.length; i++) if (!rawCands[i].dead) cands.push(rawCands[i]);
  if (!cands.length) {
    w.cd = FX.retryDelay;
    return;
  }

  w.cd = cooldown(run, w);
  const sampleMax = 10;
  const picks = [];
  const step = Math.max(1, Math.floor(cands.length / sampleMax));
  for (let i = 0; i < cands.length && picks.length < sampleMax; i += step) picks.push(cands[i]);
  const scored = picks.map((e) => ({
    e,
    score: hash.queryCircle(e.x, e.y, 85, run._sys.scratchW2).length + (e.boss ? 5 : e.elite ? 2 : 0),
  }));
  scored.sort((a, b) => b.score - a.score);

  const evo = def.evo;
  const n = 1 + Math.min(2, run.mods.amount);
  const baseR = wstat('compass', 'radius', w.level) * (w.evolved ? evo.radiusMul : 1) * run.mods.areaMul;
  const life = (w.evolved ? evo.fieldLife : def.fieldLife) * run.mods.durMul;
  const tick = w.evolved ? evo.tick : def.tick;
  const pullForce = w.evolved ? evo.pullForce : def.pullForce;
  const dmg = baseDmg(w, run);

  let firstAngle = 0;
  for (let i = 0; i < n; i++) {
    const t = scored[i % scored.length].e;
    const jx = i > 0 ? run.rng.range(-45, 45) : 0;
    const jy = i > 0 ? run.rng.range(-45, 45) : 0;
    const tx = t.x + jx;
    const ty = t.y + jy;
    const a = Math.atan2(ty - p.y, tx - p.x);
    if (i === 0) firstAngle = a;
    newProj(run, 'compassField', tx, ty, 12, a, life, {
      weaponId: 'compass',
      radius: baseR,
      dmg,
      tick,
      _tickT: 0.08,
      pullForce,
      evolved: w.evolved,
    });
  }
  emitFire(run, w, p.x, p.y, firstAngle);
}

// ───────────────────────── 10. 招魂幡 → 无常勾魂幡 ─────────────────────────

export function sweepSoulbanner(run, w, x, y, R, aimAngle, spreadRad, dmg, isSecond = false) {
  const def = WEAPONS.soulbanner;
  const evo = def.evo;
  const evolved = !!w?.evolved;
  const vulnDur = evolved ? evo.vulnDur : def.vulnDur;
  const vulnPct = evolved ? evo.vulnPct : def.vulnPct;
  const list = run._sys.hash.queryCircle(x, y, R, run._sys.scratchW);
  const half = spreadRad / 2;
  const p = run.player;

  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (e.dead) continue;
    const d = Math.hypot(e.x - x, e.y - y) || 1;
    const tol = Math.asin(Math.min(1, e.r / d));
    if (Math.abs(wrapAngle(Math.atan2(e.y - y, e.x - x) - aimAngle)) > half + tol) continue;

    applyVuln(e, vulnDur, vulnPct);
    if (evolved && !e.boss) applyStun(run, e, evo.stunDur);
    let effDmg = dmg;
    if (evolved && isSecond && e.hp / Math.max(1, e.maxHp) <= evo.executeHpRatio) {
      effDmg *= evo.executeBonusMul;
    }
    damageEnemy(run, e, effDmg, 'soulbanner', { armorBreak: true, originX: x, originY: y, knock: def.knockback });

    if (evolved && e.boss && w) {
      w._bossHits = (w._bossHits || 0) + 1;
      if (w._bossHits >= evo.bossHitsPerShield) {
        w._bossHits = 0;
        if (p.soulBarrier < p.soulBarrierMax) p.soulBarrier++;
      }
    }
  }

  hitPropsCircle(run, x + Math.cos(aimAngle) * R * 0.5, y + Math.sin(aimAngle) * R * 0.5, R * 0.5);
  newProj(run, 'soulSweep', x, y, 10, aimAngle, def.sweepLife, {
    weaponId: 'soulbanner',
    radius: R,
    spread: spreadRad,
    reverse: isSecond,
    evolved,
  });
}

function updateSoulbanner(run, w, dt) {
  w.cd -= dt;
  if (w.cd > 0) return;
  w.cd = cooldown(run, w);
  const def = WEAPONS.soulbanner;
  const evo = def.evo;
  const p = run.player;
  const R = wstat('soulbanner', 'radius', w.level) * (w.evolved ? evo.radiusMul : 1) * run.mods.areaMul;
  const spreadDeg = w.evolved ? evo.spread : wstat('soulbanner', 'spread', w.level);
  const spreadRad = (spreadDeg * Math.PI) / 180;
  const pri = findPriorityTarget(run, p.x, p.y, R * 1.35, run._sys.scratchW);
  const aimAngle = pri ? Math.atan2(pri.y - p.y, pri.x - p.x) : Math.atan2(p.facingY, p.facingX);
  const dmg = baseDmg(w, run);

  sweepSoulbanner(run, w, p.x, p.y, R, aimAngle, spreadRad, dmg, false);
  if (w.evolved) {
    run._scheduled.push({
      delay: evo.doubleSweepDelay,
      type: 'soulSweep2',
      radius: R,
      spread: spreadRad,
      angle: aimAngle,
      dmg: dmg * evo.secondDmgMul,
    });
  }
  emitFire(run, w, p.x, p.y, aimAngle);
}

// ───────────────────────── 11. 照妖铜镜 → 乾坤赤阳镜 ─────────────────────────

function updateBronzeMirror(run, w, dt) {
  w.cd -= dt;
  if (w.cd > 0) return;
  const def = WEAPONS.bronze_mirror;
  const evo = def.evo;
  const p = run.player;
  const L = wstat('bronze_mirror', 'length', w.level) * (w.evolved ? evo.lengthMul : 1) * run.mods.areaMul;
  const W = wstat('bronze_mirror', 'width', w.level) * (w.evolved ? evo.widthMul : 1) * run.mods.areaMul;
  const pri = findPriorityTarget(run, p.x, p.y, Math.max(305, L * 1.15), run._sys.scratchW);
  if (!pri) {
    w.cd = FX.retryDelay;
    return;
  }

  w.cd = cooldown(run, w);
  const aimAngle = Math.atan2(pri.y - p.y, pri.x - p.x);
  const count = 1 + Math.min(2, (w.evolved ? 1 : 0) + run.mods.amount);
  const life = (w.evolved ? evo.beamLife : def.beamLife) * run.mods.durMul;
  const tick = w.evolved ? evo.tick : def.tick;
  const dmg = baseDmg(w, run);

  for (let i = 0; i < count; i++) {
    const angleOffset = (i - (count - 1) / 2) * 0.28;
    const a = aimAngle + angleOffset;
    newProj(run, 'mirrorBeam', p.x, p.y, Math.min(14, Math.max(4, W * 0.5)), a, life, {
      weaponId: 'bronze_mirror',
      radius: L,
      length: L,
      width: W,
      baseAngle: aimAngle,
      angleOffset,
      endX: p.x + Math.cos(a) * L,
      endY: p.y + Math.sin(a) * L,
      tick,
      _tickT: 0,
      dmg,
      evolved: w.evolved,
    });
  }
  emitFire(run, w, p.x, p.y, aimAngle);
}

// ───────────────────────── 12. 纸马镖 → 百鬼夜行图 ─────────────────────────

function updatePaperhorse(run, w, dt) {
  w.cd -= dt;
  if (w.cd > 0) return;
  const def = WEAPONS.paperhorse;
  const evo = def.evo;
  const p = run.player;
  const pri = findPriorityTarget(run, p.x, p.y, 310, run._sys.scratchW);
  if (!pri) {
    w.cd = FX.retryDelay;
    return;
  }

  w.cd = cooldown(run, w);
  const mainAngle = Math.atan2(pri.y - p.y, pri.x - p.x);
  const n = wstat('paperhorse', 'count', w.level) + (w.evolved ? evo.bonusCount : 0) + run.mods.amount;
  const spd = (w.evolved ? evo.speed : def.speed) * run.mods.durMul;
  const span = (w.evolved ? evo.span : def.span) * run.mods.durMul;
  const hitR = (w.evolved ? evo.r : def.r) * run.mods.areaMul;
  const dmg = baseDmg(w, run);
  const cosA = Math.cos(mainAngle);
  const sinA = Math.sin(mainAngle);
  const perpX = -sinA;
  const perpY = cosA;

  for (let i = 0; i < n; i++) {
    const lat = (i - (n - 1) / 2) * 26;
    const back = 180 + Math.abs(i - (n - 1) / 2) * 14;
    const sx = p.x - cosA * back + perpX * lat;
    const sy = p.y - sinA * back + perpY * lat;
    newProj(run, 'paperHorse', sx, sy, 14, mainAngle, span / spd, {
      weaponId: 'paperhorse',
      hitR,
      radius: hitR,
      vx: cosA * spd,
      vy: sinA * spd,
      speed: spd,
      dmg,
      knock: def.knockback,
      evolved: w.evolved,
      trampleCount: 0,
      _hit: [],
    });
  }
  emitFire(run, w, p.x, p.y, mainAngle);
}

// ───────────────────────── 持续弹体同步（灯笼、火环、纸扎仪仗）─────────────────────────

function summonKey(run, w) {
  if (w.id === 'lantern') {
    const cnt = (wstat('lantern', 'count', w.level) + run.mods.amount) & 0xff;
    return (cnt << 20) | ((w.evolved ? 1 : 0) << 19) | ((run.mods.areaMul * 1000) & 0x7ffff);
  }
  if (w.id === 'paperman') {
    return ((wstat('paperman', 'count', w.level) & 0xff) << 12) | (((run.mods.amount + 32) & 0xff) << 2) | (w.evolved ? 1 : 0);
  }
  return 0;
}

function syncSummons(run, w) {
  const key = summonKey(run, w);
  if (w._key === key) return;
  w._key = key;
  const p = run.player;
  if (w.id === 'lantern') {
    run.projectiles = run.projectiles.filter((pr) => pr.kind !== 'lantern' && pr.kind !== 'flameRing');
    const n = wstat('lantern', 'count', w.level) + run.mods.amount;
    for (let i = 0; i < n; i++) {
      newProj(run, 'lantern', p.x, p.y, WEAPONS.lantern.hitR, 0, 1, {
        weaponId: 'lantern',
        orbitIndex: i,
        orbitCount: n,
        persistent: true,
        evolved: w.evolved,
      });
    }
    if (w.evolved) {
      const evo = WEAPONS.lantern.evo;
      const R = evo.ringRadius * run.mods.areaMul;
      const innerR = evo.innerLotusRadius * run.mods.areaMul;
      newProj(run, 'flameRing', p.x, p.y, R, 0, 1, {
        weaponId: 'lantern',
        radius: R,
        innerRadius: innerR,
        dualLotus: true,
        persistent: true,
        evolved: true,
      });
    }
  } else if (w.id === 'paperman') {
    // 保留非常驻的纸扎羁绊自爆红纸童（persistent === false）
    run.projectiles = run.projectiles.filter((pr) => !(pr.kind === 'paperman' && pr.persistent));
    const def = WEAPONS.paperman;
    if (!w.evolved) {
      const n = wstat('paperman', 'count', w.level) + run.mods.amount;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        newProj(run, 'paperman', p.x + Math.cos(a) * FX.summonOffset, p.y + Math.sin(a) * FX.summonOffset, def.r, a, 1, {
          weaponId: 'paperman',
          role: 'seeker',
          targetId: null,
          mode: 'follow',
          orbitIndex: i,
          orbitCount: n,
          atkT: 0,
          persistent: true,
          evolved: false,
        });
      }
    } else {
      const evo = def.evo;
      for (let g = 0; g < evo.guards; g++) {
        const a = (g / evo.guards) * Math.PI * 2;
        newProj(run, 'paperman', p.x + Math.cos(a) * evo.guardR, p.y + Math.sin(a) * evo.guardR, def.r, a, 1, {
          weaponId: 'paperman',
          role: 'guard',
          mode: 'guard',
          orbitIndex: g,
          orbitCount: evo.guards,
          atkT: 0,
          persistent: true,
          evolved: true,
        });
      }
      const cN = evo.cavalry + run.mods.amount;
      for (let c = 0; c < cN; c++) {
        const a = (c / cN) * Math.PI * 2;
        newProj(run, 'paperman', p.x + Math.cos(a) * 84, p.y + Math.sin(a) * 84, def.r + 1, a, 1, {
          weaponId: 'paperman',
          role: 'cavalry',
          mode: 'follow',
          orbitIndex: c,
          orbitCount: cN,
          atkT: 0,
          chargeT: 0,
          vx: 0,
          vy: 0,
          persistent: true,
          evolved: true,
          _hitUntil: new Map(),
        });
      }
    }
  }
}

const UPDATERS = {
  gong: updateGong,
  lantern: updateLantern,
  talisman: updateTalisman,
  brush: updateBrush,
  coinsword: updateCoinsword,
  paperman: null,
  firecracker: updateFirecracker,
  bell: updateBell,
  compass: updateCompass,
  soulbanner: updateSoulbanner,
  bronze_mirror: updateBronzeMirror,
  paperhorse: updatePaperhorse,
};

export function updateWeapons(run, dt) {
  for (const w of run.weapons) {
    if (w.id === 'lantern' || w.id === 'paperman') syncSummons(run, w);
    const fn = UPDATERS[w.id];
    if (fn) fn(run, w, dt);
  }
}

/** 纸人当前单次伤害（供 projectiles.js 使用） */
export function papermanDmg(run) {
  const w = getWeapon(run, 'paperman');
  return w ? baseDmg(w, run) : 0;
}

export { baseDmg as weaponBaseDmg };
