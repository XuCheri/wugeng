// 武器（PLAN §3.3 + F3/F4/F5 + v3 16 兵刃与本命亲和）：多路径开光判定、冷却、发射与神兵质变。

import {
  WEAPONS, WEAPON_IDS, RELICS, MAX_WEAPON_LEVEL, MAX_RELIC_LEVEL, MAX_WEAPONS, FX, EVOLUTION,
  HERO_AFFINITY, isHeroSignatureWeapon,
} from './balance.js';
import { damageCircle, damageEnemy, knockback, applyStun, applySlow, applyVuln } from './combat.js';
import { hasRelic } from './relics.js';
import { hitPropsCircle } from './props.js';
import { wrapAngle, fsin, fcos, fatan2 } from '../core/math.js';

/** 取武器某项属性在 level 级时的数值（数组按级取，标量直接返回） */
export function wstat(id, key, level) {
  if (typeof id !== 'string' || !Object.hasOwn(WEAPONS, id)) return undefined;
  const v = WEAPONS[id][key];
  return Array.isArray(v) ? v[Math.min(level, MAX_WEAPON_LEVEL) - 1] : v;
}

export function getWeapon(run, id) {
  return run.weapons.find((w) => w.id === id) || null;
}

export function isWeaponSignature(w, run = null, owner = null) {
  if (!w) return false;
  if (typeof w.signature === 'boolean') return w.signature;
  const hid = owner?.heroId || run?.player?.heroId || run?.heroId || null;
  return hid ? isHeroSignatureWeapon(hid, w.id) : false;
}

export function weaponAreaMul(run, w, owner = null) {
  const base = run?.mods?.areaMul || 1;
  return isWeaponSignature(w, run, owner) ? base * (1 + HERO_AFFINITY.areaBonus) : base;
}

/** 获得新武器或升一级；返回新等级，失败返回 0 */
export function addOrUpgradeWeapon(run, id, owner = null) {
  if (!WEAPON_IDS.includes(id)) return 0;
  const w = getWeapon(run, id);
  if (w) {
    if (w.level >= MAX_WEAPON_LEVEL) return 0;
    w.level++;
    return w.level;
  }
  if (run.weapons.length >= MAX_WEAPONS) return 0;
  const heroId = owner?.heroId || run?.player?.heroId || run?.heroId || 'zhou';
  run.weapons.push({
    id,
    level: 1,
    evolved: false,
    evolvedRecipe: null,
    altarReady: false,
    signature: isHeroSignatureWeapon(heroId, id),
    cd: FX.firstFireDelay,
  });
  return 1;
}

/** 统计已拥有的某流派器物总数（含百神同契全流派 +1） */
export function countOwnedTag(run, tag) {
  if (!run) return 0;
  let n = 0;
  for (const w of run.weapons) if (typeof w?.id === 'string' && Object.hasOwn(WEAPONS, w.id) && WEAPONS[w.id]?.tags?.includes(tag)) n++;
  for (const r of run.relics) if (typeof r?.id === 'string' && Object.hasOwn(RELICS, r.id) && RELICS[r.id]?.tags?.includes(tag)) n++;
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
  const def = typeof w.id === 'string' && Object.hasOwn(WEAPONS, w.id) ? WEAPONS[w.id] : null;
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

/** 本武器本次发射的基础伤害（含本命武器 ×1.25 亲和、开光倍率、巧匠开物加成及本命法器 ×1.18 精通） */
function baseDmg(w, run = null, owner = null) {
  const def = w && typeof w.id === 'string' && Object.hasOwn(WEAPONS, w.id) ? WEAPONS[w.id] : null;
  if (!def) return 0;
  let d = wstat(w.id, 'dmg', w.level);
  if (isWeaponSignature(w, run, owner)) {
    d *= HERO_AFFINITY.dmgMul;
  }
  if (w.evolved) {
    const evoMult = def.evoMult + (run?.mods?.evoMultBonus || 0);
    d *= evoMult;
    const hasPair = (run && def.pair && hasRelic(run, def.pair)) || w.evolvedRecipe === 'paired';
    if (hasPair) d *= EVOLUTION.pairedMasteryMul;
  }
  return d;
}

/** 武器当前完整冷却时长（本命武器享 ×0.90 急速；开光神兵享全局 ×0.82 急速；亦供引魂灯芯返还冷却使用） */
export function weaponFullCooldown(run, w, owner = null) {
  if (!w || typeof w.id !== 'string' || !Object.hasOwn(WEAPONS, w.id)) return 0;
  const sigMul = isWeaponSignature(w, run, owner) ? HERO_AFFINITY.cdMul : 1;
  const cdMul = run?.mods?.cdMul ?? 1;
  const cd = wstat(w.id, 'cd', w.level);
  if (typeof cd === 'number' && cd > 0) {
    return cd * cdMul * sigMul * (w.evolved ? EVOLUTION.evoCdMul : 1);
  }
  const def = WEAPONS[w.id];
  if (def && typeof def.tick === 'number' && def.tick > 0) {
    return (w.evolved && def.evo?.tick ? def.evo.tick : def.tick) * cdMul * sigMul;
  }
  if (def && typeof def.atkCd === 'number' && def.atkCd > 0) {
    return def.atkCd * sigMul;
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
    slot: run._activeSlot || 0,
    x,
    y,
    angle,
    ...(extra || {}),
  });
}

function newProj(run, kind, x, y, r, angle, life, extra) {
  const safeR = Math.max(0, Number.isFinite(r) ? r : 0);
  const pr = {
    id: run._nextId++,
    kind,
    x,
    y,
    r: safeR,
    angle,
    t: 0,
    life,
    weaponId: null,
    ownerSlot: run._activeSlot || 0,
    attackVfx: run.player?.attackVfx || null,
    ...extra,
  };
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
  const areaMul = weaponAreaMul(run, w);

  if (!w.evolved) {
    const R = wstat('gong', 'radius', w.level) * areaMul;
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
    const R = evo.waveRadius * areaMul;
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
    const R = evo.finalRadius * areaMul;
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
  const activeSlot = run._activeSlot || 0;
  w.cd -= dt;
  if (w.cd > 0) return;
  w.cd = cooldown(run, w);

  const areaMul = weaponAreaMul(run, w);
  const dmg = baseDmg(w, run);
  const hitR = def.hitR * (w.evolved ? 1.25 : 1) * areaMul;
  const burstR = evo.burstRadius * areaMul;
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
    if (pr.dead || (pr.ownerSlot || 0) !== activeSlot) continue;
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
          radius: evo.bossFlareRadius * areaMul,
          dmg: dmg * evo.bossFlareDmgMul,
          weaponId: 'lantern',
          evolved: true,
          explosionKind: 'lanternFlare',
          knock: 110,
          ownerSlot: activeSlot,
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
  const sigScale = isWeaponSignature(w, run) ? 1 + HERO_AFFINITY.areaBonus : 1;
  const seekR = def.seekRange * sigScale;
  const rawList = run._sys.hash.queryCircle(p.x, p.y, seekR, run._sys.scratchW);
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
  const projR = def.r * sigScale;
  const volleyId = run._nextId++;
  let mainAngle = 0;

  for (let i = 0; i < n; i++) {
    const t = targets[i % targets.length];
    const baseA = fatan2(t.y - p.y, t.x - p.x);
    if (i === 0) mainAngle = baseA;
    const a = baseA + (i - (n - 1) / 2) * FX.talismanFan;
    newProj(run, 'talisman', p.x, p.y, projR, a, def.life * run.mods.durMul, {
      weaponId: 'talisman',
      vx: fcos(a) * spd,
      vy: fsin(a) * spd,
      speed: spd,
      pierce,
      dmg,
      seekRange: seekR,
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
    if (Math.abs(wrapAngle(fatan2(e.y - y, e.x - x) - angle)) <= half + tol) {
      damageEnemy(run, e, raw, weaponId, subOpts);
      hits++;
    }
  }
  hitPropsCircle(run, x + fcos(angle) * R * 0.5, y + fsin(angle) * R * 0.5, R * 0.5);
  return hits;
}

function updateBrush(run, w, dt) {
  w.cd -= dt;
  if (w.cd > 0) return;
  w.cd = cooldown(run, w);
  const def = WEAPONS.brush;
  const p = run.player;
  const dmg = baseDmg(w, run);
  const areaMul = weaponAreaMul(run, w);

  if (!w.evolved) {
    const R = wstat('brush', 'radius', w.level) * areaMul;
    const spread = (wstat('brush', 'spread', w.level) * Math.PI) / 180;
    const base = fatan2(p.facingY, p.facingX);
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
  const R = (wstat('brush', 'radius', w.level) + evo.slashRadiusBonus) * areaMul;
  const pri = findPriorityTarget(run, p.x, p.y, 380, run._sys.scratchW);
  const aimAngle = pri ? fatan2(pri.y - p.y, pri.x - p.x) : fatan2(p.facingY, p.facingX);

  damageCircle(run, p.x, p.y, R, dmg, 'brush', { knock: 125, slow: 0.7 });
  newProj(run, 'brushArc', p.x, p.y, R, aimAngle, evo.arcLife, {
    weaponId: 'brush',
    radius: R,
    spread: Math.PI * 1.88,
    evolved: true,
  });

  const waveCount = 1 + Math.min(2, run.mods.amount);
  const waveHitR = evo.waveRadius * areaMul;
  const waveRange = evo.waveRange * run.mods.durMul;
  const waveLife = waveRange / evo.waveSpeed;
  for (let i = 0; i < waveCount; i++) {
    const a = aimAngle + (i - (waveCount - 1) / 2) * 0.22;
    newProj(run, 'inkWave', p.x, p.y, 14, a, waveLife, {
      weaponId: 'brush',
      hitR: waveHitR,
      radius: waveHitR,
      vx: fcos(a) * evo.waveSpeed,
      vy: fsin(a) * evo.waveSpeed,
      speed: evo.waveSpeed,
      dmg: dmg * evo.waveDmgMul,
      evolved: true,
      _hit: [],
    });
  }

  const poolR = evo.poolRadius * areaMul;
  for (const dist of [95, 225]) {
    newProj(
      run,
      'inkPool',
      p.x + fcos(aimAngle) * dist,
      p.y + fsin(aimAngle) * dist,
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

    const fallbackBase = fatan2(p.facingY, p.facingX);
    let primaryAngle = fallbackBase;
    for (let i = 0; i < n; i++) {
      let a;
      if (threats.length > 0) {
        const t = threats[i % Math.min(threats.length, 4)];
        const baseA = fatan2(t.y - p.y, t.x - p.x);
        if (i === 0) primaryAngle = baseA;
        const fan = threats.length === 1 ? 0.055 : 0.09;
        a = baseA + (i - (n - 1) / 2) * fan;
      } else {
        a = fallbackBase + (i - (n - 1) / 2) * 0.18;
      }
      const ringA = primaryAngle + (i / n) * Math.PI * 2;
      const sx = p.x + fcos(ringA) * 20;
      const sy = p.y + fsin(ringA) * 20;
      newProj(run, 'coinsword', sx, sy, def.r, a, FX.coinswordMaxLife, {
        weaponId: 'coinsword',
        vx: fcos(a) * spd,
        vy: fsin(a) * spd,
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
    const base = t ? fatan2(t.y - p.y, t.x - p.x) : fatan2(p.facingY, p.facingX);
    for (let i = 0; i < n; i++) {
      const a = base + (i - (n - 1) / 2) * def.spreadAngle;
      newProj(run, 'coinsword', p.x, p.y, def.r, a, FX.coinswordMaxLife, {
        weaponId: 'coinsword',
        vx: fcos(a) * spd,
        vy: fsin(a) * spd,
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

  const R = wstat('firecracker', 'radius', w.level) * weaponAreaMul(run, w);
  const flight = w.evolved ? def.evo.flight : def.flight;
  const dmg = baseDmg(w, run);
  const firstT = scored[0].e;
  for (let i = 0; i < n; i++) {
    const t = scored[i % scored.length].e;
    const jx = i > 0 ? run.rng.range(-R * 0.75, R * 0.75) : 0;
    const jy = i > 0 ? run.rng.range(-R * 0.75, R * 0.75) : 0;
    newProj(run, 'firecracker', p.x, p.y, FX.firecrackerR, fatan2(t.y - p.y, t.x - p.x), flight, {
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
  emitFire(run, w, p.x, p.y, fatan2(firstT.y - p.y, firstT.x - p.x));
}

// ───────────────────────── 8. 铜铃 → 千铃引魂 ─────────────────────────

function updateBell(run, w, dt) {
  w.cd -= dt;
  if (w.cd > 0) return;
  const def = WEAPONS.bell;
  const p = run.player;
  const hash = run._sys.hash;
  const areaMul = weaponAreaMul(run, w);
  const first = hash.nearest(p.x, p.y, def.range, run._sys.scratchW, (e) => !e.dead);
  if (!first) {
    w.cd = FX.retryDelay;
    return;
  }
  w.cd = cooldown(run, w);
  const bounces = wstat('bell', 'bounces', w.level) + run.mods.amount;
  const dmg = baseDmg(w, run);
  const range = def.chainRange * areaMul;
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
          ownerSlot: run._activeSlot || 0,
        });
      }
    }
  }
  emitFire(run, w, p.x, p.y, fatan2(first.y - p.y, first.x - p.x));
}

// ───────────────────────── 9. 罗盘 → 天星定穴盘 ─────────────────────────

function updateCompass(run, w, dt) {
  w.cd -= dt;
  if (w.cd > 0) return;
  const def = WEAPONS.compass;
  const p = run.player;
  const hash = run._sys.hash;
  const areaMul = weaponAreaMul(run, w);
  const seekR = def.range * (isWeaponSignature(w, run) ? 1 + HERO_AFFINITY.areaBonus : 1);
  const rawCands = hash.queryCircle(p.x, p.y, seekR, run._sys.scratchW);
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
  const baseR = wstat('compass', 'radius', w.level) * (w.evolved ? evo.radiusMul : 1) * areaMul;
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
    const a = fatan2(ty - p.y, tx - p.x);
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
    if (Math.abs(wrapAngle(fatan2(e.y - y, e.x - x) - aimAngle)) > half + tol) continue;

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

  hitPropsCircle(run, x + fcos(aimAngle) * R * 0.5, y + fsin(aimAngle) * R * 0.5, R * 0.5);
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
  const R = wstat('soulbanner', 'radius', w.level) * (w.evolved ? evo.radiusMul : 1) * weaponAreaMul(run, w);
  const spreadDeg = w.evolved ? evo.spread : wstat('soulbanner', 'spread', w.level);
  const spreadRad = (spreadDeg * Math.PI) / 180;
  const pri = findPriorityTarget(run, p.x, p.y, R * 1.35, run._sys.scratchW);
  const aimAngle = pri ? fatan2(pri.y - p.y, pri.x - p.x) : fatan2(p.facingY, p.facingX);
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
      ownerSlot: run._activeSlot || 0,
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
  const areaMul = weaponAreaMul(run, w);
  const L = wstat('bronze_mirror', 'length', w.level) * (w.evolved ? evo.lengthMul : 1) * areaMul;
  const W = wstat('bronze_mirror', 'width', w.level) * (w.evolved ? evo.widthMul : 1) * areaMul;
  const pri = findPriorityTarget(run, p.x, p.y, Math.max(305, L * 1.15), run._sys.scratchW);
  if (!pri) {
    w.cd = FX.retryDelay;
    return;
  }

  w.cd = cooldown(run, w);
  const aimAngle = fatan2(pri.y - p.y, pri.x - p.x);
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
      endX: p.x + fcos(a) * L,
      endY: p.y + fsin(a) * L,
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
  const mainAngle = fatan2(pri.y - p.y, pri.x - p.x);
  const n = wstat('paperhorse', 'count', w.level) + (w.evolved ? evo.bonusCount : 0) + run.mods.amount;
  const spd = (w.evolved ? evo.speed : def.speed) * run.mods.durMul;
  const span = (w.evolved ? evo.span : def.span) * run.mods.durMul;
  const hitR = (w.evolved ? evo.r : def.r) * weaponAreaMul(run, w);
  const dmg = baseDmg(w, run);
  const cosA = fcos(mainAngle);
  const sinA = fsin(mainAngle);
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

// ───────────────────────── 13. 桃木飞剑 → 天罡雷木剑阵 ─────────────────────────

function updateTaomujian(run, w, dt) {
  w.cd -= dt;
  if (w.cd > 0) return;
  const def = WEAPONS.taomujian;
  const evo = def.evo;
  const p = run.player;
  const sigScale = isWeaponSignature(w, run) ? 1 + HERO_AFFINITY.areaBonus : 1;
  const seekR = (w.evolved ? evo.seekRange : def.seekRange) * sigScale;
  const rawList = run._sys.hash.queryCircle(p.x, p.y, seekR, run._sys.scratchW);
  const targets = [];
  for (let i = 0; i < rawList.length; i++) if (!rawList[i].dead) targets.push(rawList[i]);
  if (!targets.length) {
    w.cd = FX.retryDelay;
    return;
  }
  targets.sort((a, b) => {
    const sa = a.boss ? 2 : a.elite ? 1 : 0;
    const sb = b.boss ? 2 : b.elite ? 1 : 0;
    if (sb !== sa) return sb - sa;
    return (a.x - p.x) ** 2 + (a.y - p.y) ** 2 - ((b.x - p.x) ** 2 + (b.y - p.y) ** 2);
  });

  w.cd = cooldown(run, w);
  const n = wstat('taomujian', 'count', w.level) + (w.evolved ? evo.bonusCount : 0) + run.mods.amount;
  const spd = (w.evolved ? evo.speed : def.speed) * run.mods.durMul;
  const dmg = baseDmg(w, run);
  const pierce = (w.evolved ? evo.pierce : def.pierce) + (run.mods.bonusPierce || 0);
  const hitR = def.r * weaponAreaMul(run, w);
  let mainAngle = 0;

  for (let i = 0; i < n; i++) {
    const t = targets[i % targets.length];
    const baseA = fatan2(t.y - p.y, t.x - p.x);
    if (i === 0) mainAngle = baseA;
    const a = baseA + (i - (n - 1) / 2) * 0.14;
    newProj(run, 'flyingSword', p.x, p.y, hitR, a, def.life * run.mods.durMul, {
      weaponId: 'taomujian',
      vx: fcos(a) * spd,
      vy: fsin(a) * spd,
      speed: spd,
      turnRate: w.evolved ? evo.turnRate : def.turnRate,
      seekRange: seekR,
      pierce,
      dmg,
      evolved: w.evolved,
      _tgt: t,
      _hit: [],
    });
  }
  emitFire(run, w, p.x, p.y, mainAngle);
}

// ───────────────────────── 14. 无常锁魂链 → 黑白无常夺魄索 ─────────────────────────

function segDist2(px, py, ax, ay, bx, by) {
  const vx = bx - ax;
  const vy = by - ay;
  const l2 = vx * vx + vy * vy;
  if (l2 < 1e-6) return (px - ax) ** 2 + (py - ay) ** 2;
  const t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / l2));
  return (px - (ax + vx * t)) ** 2 + (py - (ay + vy * t)) ** 2;
}

function updateSuohunChain(run, w, dt) {
  w.cd -= dt;
  if (w.cd > 0) return;
  const def = WEAPONS.suohun_chain;
  const evo = def.evo;
  const p = run.player;
  const areaMul = weaponAreaMul(run, w);
  const L = wstat('suohun_chain', 'length', w.level) * (w.evolved ? evo.lengthMul : 1) * areaMul;
  const W = def.width * (w.evolved ? evo.widthMul : 1) * areaMul;
  const pri = findPriorityTarget(run, p.x, p.y, L * 1.35, run._sys.scratchW);
  if (!pri) {
    w.cd = FX.retryDelay;
    return;
  }

  w.cd = cooldown(run, w);
  const baseAngle = fatan2(pri.y - p.y, pri.x - p.x);
  const n = wstat('suohun_chain', 'count', w.level) + (w.evolved ? evo.bonusCount : 0) + Math.min(2, run.mods.amount);
  const dmg = baseDmg(w, run);
  const pullForce = w.evolved ? evo.pullForce : def.pullForce;
  const stunDur = w.evolved ? evo.stunDur : def.stunDur;
  const activeSlot = run._activeSlot || 0;

  for (let i = 0; i < n; i++) {
    const a = n === 1 ? baseAngle : baseAngle + (i - (n - 1) / 2) * (w.evolved ? 0.34 : 0.42);
    const endX = p.x + fcos(a) * L;
    const endY = p.y + fsin(a) * L;
    const mx = (p.x + endX) * 0.5;
    const my = (p.y + endY) * 0.5;
    const cands = run._sys.hash.queryCircle(mx, my, L * 0.5 + W, run._sys.scratchW2);
    for (let j = 0; j < cands.length; j++) {
      const e = cands[j];
      if (e.dead) continue;
      const rr = W * 0.5 + e.r;
      if (segDist2(e.x, e.y, p.x, p.y, endX, endY) > rr * rr) continue;
      if (w.evolved) applyVuln(e, evo.vulnDur, evo.vulnPct);
      if (!e.boss) {
        applyStun(run, e, stunDur);
        const dist = Math.hypot(e.x - p.x, e.y - p.y);
        if (dist > p.r + e.r + 22) {
          knockback(e, p.x - e.x, p.y - e.y, pullForce);
        }
      }
      damageEnemy(run, e, dmg, 'suohun_chain', { armorBreak: true, knock: 0 });
    }
    hitPropsCircle(run, mx, my, L * 0.5);

    if (w.evolved) {
      run._scheduled.push({
        delay: 0.14,
        type: 'explosion',
        x: p.x + fcos(a) * (L * 0.62),
        y: p.y + fsin(a) * (L * 0.62),
        radius: evo.burstRadius * areaMul,
        dmg: dmg * evo.burstDmgMul,
        weaponId: 'suohun_chain',
        evolved: true,
        explosionKind: 'chainBurst',
        knock: 85,
        stun: 0.35,
        vuln: evo.vulnDur,
        vulnPct: evo.vulnPct,
        ownerSlot: activeSlot,
      });
    }

    newProj(run, 'soulChain', endX, endY, Math.max(6, W * 0.5), a, def.life, {
      weaponId: 'suohun_chain',
      fromX: p.x,
      fromY: p.y,
      endX,
      endY,
      width: W,
      length: L,
      evolved: w.evolved,
    });
  }
  emitFire(run, w, p.x, p.y, baseAngle);
}

// ───────────────────────── 15. 纸鸢火鸦 → 金乌焚天火鸦阵 ─────────────────────────

function updateZhinianKite(run, w, dt) {
  w.cd -= dt;
  if (w.cd > 0) return;
  const def = WEAPONS.zhinian_kite;
  const evo = def.evo;
  const p = run.player;
  const areaMul = weaponAreaMul(run, w);
  const sigScale = isWeaponSignature(w, run) ? 1 + HERO_AFFINITY.areaBonus : 1;
  const seekR = def.seekRange * sigScale;
  const rawList = run._sys.hash.queryCircle(p.x, p.y, seekR, run._sys.scratchW);
  const targets = [];
  for (let i = 0; i < rawList.length; i++) if (!rawList[i].dead) targets.push(rawList[i]);
  if (!targets.length) {
    w.cd = FX.retryDelay;
    return;
  }
  targets.sort((a, b) => {
    const sa = a.boss ? 2 : a.elite ? 1 : 0;
    const sb = b.boss ? 2 : b.elite ? 1 : 0;
    if (sb !== sa) return sb - sa;
    return (a.x - p.x) ** 2 + (a.y - p.y) ** 2 - ((b.x - p.x) ** 2 + (b.y - p.y) ** 2);
  });

  w.cd = cooldown(run, w);
  const n = wstat('zhinian_kite', 'count', w.level) + (w.evolved ? evo.bonusCount : 0) + run.mods.amount;
  const spd = (w.evolved ? evo.speed : def.speed) * run.mods.durMul;
  const blastR = wstat('zhinian_kite', 'radius', w.level) * (w.evolved ? evo.radiusMul : 1) * areaMul;
  const dmg = baseDmg(w, run);
  let mainAngle = 0;

  for (let i = 0; i < n; i++) {
    const t = targets[i % targets.length];
    const baseA = fatan2(t.y - p.y, t.x - p.x);
    if (i === 0) mainAngle = baseA;
    const a = baseA + (i - (n - 1) / 2) * 0.22;
    newProj(run, 'fireCrow', p.x, p.y, def.r * sigScale, a, def.life * run.mods.durMul, {
      weaponId: 'zhinian_kite',
      vx: fcos(a) * spd,
      vy: fsin(a) * spd,
      speed: spd,
      turnRate: def.turnRate,
      seekRange: seekR,
      blastR,
      radius: blastR,
      dmg,
      evolved: w.evolved,
      _tgt: t,
      _trailT: evo.trailInterval,
    });
  }
  emitFire(run, w, p.x, p.y, mainAngle);
}

// ───────────────────────── 16. 傩神战鼓 → 太古百相傩坛 ─────────────────────────

function updateNuoDrum(run, w, dt) {
  w.cd -= dt;
  if (w.cd > 0) return;
  w.cd = cooldown(run, w);
  const def = WEAPONS.nuo_drum;
  const evo = def.evo;
  const p = run.player;
  const areaMul = weaponAreaMul(run, w);
  const R = wstat('nuo_drum', 'radius', w.level) * (w.evolved ? evo.radiusMul : 1) * areaMul;
  const beats = w.evolved ? evo.beats : wstat('nuo_drum', 'beats', w.level);
  const beatInterval = w.evolved ? evo.beatInterval : def.beatInterval;
  const dmg = baseDmg(w, run);

  const pri = findPriorityTarget(run, p.x, p.y, def.placeRange + R, run._sys.scratchW);
  let tx = p.x;
  let ty = p.y;
  let aimAngle = fatan2(p.facingY, p.facingX);
  if (pri) {
    const dx = pri.x - p.x;
    const dy = pri.y - p.y;
    const d = Math.hypot(dx, dy);
    if (d > 1) {
      aimAngle = fatan2(dy, dx);
      const stepD = Math.min(d, def.placeRange);
      tx = p.x + (dx / d) * stepD;
      ty = p.y + (dy / d) * stepD;
    }
  }

  const totalLife = beats * beatInterval + 0.16;
  newProj(run, 'nuoDrum', tx, ty, 16, 0, totalLife, {
    weaponId: 'nuo_drum',
    radius: R,
    dmg,
    beatsTotal: beats,
    beatsLeft: beats,
    beatInterval,
    _beatT: 0.02,
    evolved: w.evolved,
  });
  emitFire(run, w, tx, ty, aimAngle);
}

// ───────────────────────── 17. 引魂丧杆 → 幽冥镇魂杆 ─────────────────────────

function pointSegDist2W(px, py, ax, ay, bx, by) {
  const vx = bx - ax;
  const vy = by - ay;
  const l2 = vx * vx + vy * vy;
  if (l2 < 1e-6) return (px - ax) ** 2 + (py - ay) ** 2;
  const t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / l2));
  return (px - (ax + vx * t)) ** 2 + (py - (ay + vy * t)) ** 2;
}

function updateMourningStaff(run, w, dt) {
  w.cd -= dt;
  if (w.cd > 0) return;
  w.cd = cooldown(run, w);
  const def = WEAPONS.mourning_staff;
  const evo = def.evo;
  const p = run.player;
  const areaMul = weaponAreaMul(run, w);
  const R = wstat('mourning_staff', 'radius', w.level) * (w.evolved ? evo.radiusMul : 1) * areaMul;
  const spreadRad = w.evolved ? Math.PI * 2 : (wstat('mourning_staff', 'spread', w.level) * Math.PI) / 180;
  const dmg = baseDmg(w, run);

  const pri = findPriorityTarget(run, p.x, p.y, R + 60, run._sys.scratchW);
  const aim = pri ? fatan2(pri.y - p.y, pri.x - p.x) : fatan2(p.facingY, p.facingX);
  w._sweeps = (w._sweeps || 0) + 1;

  hitPropsCircle(run, p.x, p.y, R);
  const list = run._sys.hash.queryCircle(p.x, p.y, R, run._sys.scratchW);
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (e.dead) continue;
    const dx = e.x - p.x;
    const dy = e.y - p.y;
    const dist = Math.hypot(dx, dy);
    if (dist > R + e.r) continue;
    if (!w.evolved) {
      const da = Math.abs(wrapAngle(fatan2(dy, dx) - aim));
      if (da > spreadRad * 0.5 && dist > p.r + e.r + 10) continue;
    }
    applySlow(run, e, 0.9);
    if (w.evolved) {
      applyStun(run, e, evo.stunDur);
      applyVuln(e, evo.vulnDur, evo.vulnPct);
    }
    damageEnemy(run, e, dmg, 'mourning_staff', {
      knock: def.knockback,
      knockDx: dx || 1,
      knockDy: dy,
      armorBreak: w.evolved,
    });
  }

  if (w.evolved) {
    for (let j = 0; j < run.projectiles.length; j++) {
      const b = run.projectiles[j];
      if (b.kind === 'enemyBullet' && !b.dead) {
        const rr = R + (b.r || 0);
        if ((b.x - p.x) ** 2 + (b.y - p.y) ** 2 <= rr * rr) b.dead = true;
      }
    }
    if (w._sweeps % evo.pulseEvery === 0) {
      const pR = R * evo.pulseRadiusMul;
      damageCircle(run, p.x, p.y, pR, dmg * evo.pulseDmgMul, 'mourning_staff', {
        knock: def.knockback * 1.25,
        stun: evo.stunDur,
      });
      newProj(run, 'gongPulse', p.x, p.y, pR, 0, 0.34, {
        weaponId: 'mourning_staff',
        radius: 0,
        maxRadius: pR,
        evolved: true,
      });
    }
  }

  newProj(run, 'mourningSweep', p.x, p.y, R, aim, def.sweepLife, {
    weaponId: 'mourning_staff',
    radius: R,
    spread: spreadRad,
    reverse: (w._sweeps & 1) === 0,
    evolved: w.evolved,
  });
  emitFire(run, w, p.x, p.y, aim);
}

// ───────────────────────── 18. 孔明灯 → 九天赤焰灯 ─────────────────────────

function updateSkyLantern(run, w, dt) {
  w.cd -= dt;
  if (w.cd > 0) return;
  w.cd = cooldown(run, w);
  const def = WEAPONS.sky_lantern;
  const evo = def.evo;
  const p = run.player;
  const areaMul = weaponAreaMul(run, w);
  const sigScale = isWeaponSignature(w, run) ? 1 + HERO_AFFINITY.areaBonus : 1;
  const seekR = def.range * sigScale;
  const blastR = wstat('sky_lantern', 'radius', w.level) * (w.evolved ? evo.radiusMul : 1) * areaMul;
  const n = wstat('sky_lantern', 'count', w.level) + (w.evolved ? evo.bonusCount : 0) + run.mods.amount;
  const flight = w.evolved ? evo.flight : def.flight;
  const dmg = baseDmg(w, run);

  const rawList = run._sys.hash.queryCircle(p.x, p.y, seekR, run._sys.scratchW);
  const live = [];
  for (let i = 0; i < rawList.length; i++) if (!rawList[i].dead) live.push(rawList[i]);

  let mainAngle = 0;
  for (let i = 0; i < n; i++) {
    let tx;
    let ty;
    if (live.length > 0) {
      const pick = live[(i * 3) % live.length];
      const jitterA = (i / Math.max(1, n)) * Math.PI * 2;
      const jitterD = i === 0 ? 0 : 24;
      tx = pick.x + fcos(jitterA) * jitterD;
      ty = pick.y + fsin(jitterA) * jitterD;
    } else {
      const a = run.rng.range(0, Math.PI * 2);
      const d = run.rng.range(75, Math.max(95, seekR * 0.72));
      tx = p.x + fcos(a) * d;
      ty = p.y + fsin(a) * d;
    }
    if (i === 0) mainAngle = fatan2(ty - p.y, tx - p.x);
    newProj(run, 'skyLantern', p.x, p.y, 10, 0, flight, {
      weaponId: 'sky_lantern',
      fromX: p.x,
      fromY: p.y,
      toX: tx,
      toY: ty,
      radius: blastR,
      dmg,
      evolved: w.evolved,
      _midSpark: false,
    });
  }
  emitFire(run, w, p.x, p.y, mainAngle);
}

// ───────────────────────── 19. 墨斗线 → 乾坤断魂线 ─────────────────────────

function sliceAlongInkSegment(run, ax, ay, bx, by, halfW, dmg, bleedDps, bleedDur, armorBreak) {
  const mx = (ax + bx) * 0.5;
  const my = (ay + by) * 0.5;
  const segHalf = Math.hypot(bx - ax, by - ay) * 0.5 + halfW + 36;
  const list = run._sys.hash.queryCircle(mx, my, segHalf, run._sys.scratchW);
  const activeSlot = run._activeSlot || 0;
  const lx = bx - ax;
  const ly = by - ay;
  const perpX = -ly;
  const perpY = lx;
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (e.dead) continue;
    const rr = halfW + e.r;
    if (pointSegDist2W(e.x, e.y, ax, ay, bx, by) > rr * rr) continue;
    applySlow(run, e, 0.9);
    if (bleedDur > 0 && bleedDps > 0) {
      e.bleedT = Math.max(e.bleedT || 0, bleedDur);
      e.bleedDps = Math.max(e.bleedDps || 0, bleedDps);
      e.bleedSlot = activeSlot;
    }
    damageEnemy(run, e, dmg, 'carpenter_line', {
      knock: WEAPONS.carpenter_line.knockback,
      knockDx: perpX || 1,
      knockDy: perpY,
      armorBreak,
    });
  }
  hitPropsCircle(run, mx, my, Math.min(90, segHalf * 0.6));
}

function updateCarpenterLine(run, w, dt) {
  w.cd -= dt;
  if (w.cd > 0) return;
  const def = WEAPONS.carpenter_line;
  const evo = def.evo;
  const p = run.player;
  const areaMul = weaponAreaMul(run, w);
  const L = wstat('carpenter_line', 'length', w.level) * (w.evolved ? evo.lengthMul : 1) * areaMul;
  const W = def.width * (w.evolved ? evo.widthMul : 1) * (isWeaponSignature(w, run) ? 1 + HERO_AFFINITY.areaBonus : 1);

  const rawList = run._sys.hash.queryCircle(p.x, p.y, L * 1.15, run._sys.scratchW);
  const live = [];
  for (let i = 0; i < rawList.length; i++) if (!rawList[i].dead) live.push(rawList[i]);
  if (!live.length) {
    w.cd = FX.retryDelay;
    return;
  }
  live.sort((a, b) => {
    const sa = a.boss ? 2 : a.elite ? 1 : 0;
    const sb = b.boss ? 2 : b.elite ? 1 : 0;
    if (sb !== sa) return sb - sa;
    return (a.x - p.x) ** 2 + (a.y - p.y) ** 2 - ((b.x - p.x) ** 2 + (b.y - p.y) ** 2);
  });

  w.cd = cooldown(run, w);
  const dmg = baseDmg(w, run);
  const bleedDps = dmg * def.bleedDpsMul * (1 + (run.mods?.dmgPct || 0));
  const bleedDur = def.bleedDur * (run.mods?.durMul || 1);
  const lineCount = (w.evolved ? evo.lines : wstat('carpenter_line', 'count', w.level)) + run.mods.amount;
  const life = (w.evolved ? evo.life : def.life) * (run.mods?.durMul || 1);
  const anchor = live[0];
  const baseAngle = fatan2(anchor.y - p.y, anchor.x - p.x);

  if (w.evolved && lineCount >= 3) {
    // 乾坤断魂线：以首目标为中心结成贯穿心腹的三才/多向断魂星墨阵并持续斩裂
    const cx = anchor.x;
    const cy = anchor.y;
    const halfSpan = Math.max(72, L * 0.5);
    for (let i = 0; i < lineCount; i++) {
      const a = baseAngle + (i / lineCount) * Math.PI;
      const v0 = { x: cx - fcos(a) * halfSpan, y: cy - fsin(a) * halfSpan };
      const v1 = { x: cx + fcos(a) * halfSpan, y: cy + fsin(a) * halfSpan };
      sliceAlongInkSegment(run, v0.x, v0.y, v1.x, v1.y, W * 0.5, dmg, bleedDps, bleedDur, true);
      newProj(run, 'inkLine', cx, cy, W * 0.5, a, life, {
        weaponId: 'carpenter_line',
        ax: v0.x,
        ay: v0.y,
        bx: v1.x,
        by: v1.y,
        width: W,
        length: halfSpan * 2,
        dmg: dmg * evo.tickDmgMul,
        fullDmg: dmg,
        bleedDps,
        bleedDur,
        tick: evo.tick,
        _tickT: evo.tick,
        snapBurst: i === 0,
        evolved: true,
      });
    }
  } else {
    for (let i = 0; i < lineCount; i++) {
      const eA = live[i % live.length];
      let ax;
      let ay;
      let bx;
      let by;
      if (live.length >= 2) {
        const eB = live[(i + 1) % live.length];
        const dx = eB.x - eA.x;
        const dy = eB.y - eA.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 24 && dist <= L) {
          const ux = dx / dist;
          const uy = dy / dist;
          const pad = Math.min(48, (L - dist) * 0.5);
          ax = eA.x - ux * pad;
          ay = eA.y - uy * pad;
          bx = eB.x + ux * pad;
          by = eB.y + uy * pad;
        } else {
          const ang = baseAngle + Math.PI * 0.5 + i * 0.55;
          ax = eA.x - fcos(ang) * L * 0.5;
          ay = eA.y - fsin(ang) * L * 0.5;
          bx = eA.x + fcos(ang) * L * 0.5;
          by = eA.y + fsin(ang) * L * 0.5;
        }
      } else {
        const ang = baseAngle + Math.PI * 0.5 + i * 0.62;
        ax = eA.x - fcos(ang) * L * 0.5;
        ay = eA.y - fsin(ang) * L * 0.5;
        bx = eA.x + fcos(ang) * L * 0.5;
        by = eA.y + fsin(ang) * L * 0.5;
      }
      sliceAlongInkSegment(run, ax, ay, bx, by, W * 0.5, dmg, bleedDps, bleedDur, false);
      newProj(run, 'inkLine', (ax + bx) * 0.5, (ay + by) * 0.5, W * 0.5, fatan2(by - ay, bx - ax), life, {
        weaponId: 'carpenter_line',
        ax,
        ay,
        bx,
        by,
        width: W,
        length: Math.hypot(bx - ax, by - ay),
        dmg: dmg * 0.45,
        fullDmg: dmg,
        bleedDps,
        bleedDur,
        tick: 0,
        _tickT: 99,
        snapBurst: false,
        evolved: false,
      });
    }
  }
  emitFire(run, w, anchor.x, anchor.y, baseAngle);
}

// ───────────────────────── 20. 风水飞签 → 天罡定穴签 ─────────────────────────

function updateLuopanSlip(run, w, dt) {
  w.cd -= dt;
  if (w.cd > 0) return;
  const def = WEAPONS.luopan_slip;
  const evo = def.evo;
  const p = run.player;
  const sigScale = isWeaponSignature(w, run) ? 1 + HERO_AFFINITY.areaBonus : 1;
  const seekR = def.seekRange * sigScale;
  const t0 = findPriorityTarget(run, p.x, p.y, seekR, run._sys.scratchW);
  if (!t0) {
    w.cd = FX.retryDelay;
    return;
  }
  w.cd = cooldown(run, w);
  const n = wstat('luopan_slip', 'count', w.level) + (w.evolved ? evo.bonusCount : 0) + run.mods.amount;
  const spd = (w.evolved ? evo.speed : def.speed) * run.mods.durMul;
  const pierce = (w.evolved ? evo.pierce : def.pierce) + (run.mods.bonusPierce || 0);
  const turnRate = w.evolved ? evo.turnRate : def.turnRate;
  const dmg = baseDmg(w, run);
  const baseA = fatan2(t0.y - p.y, t0.x - p.x);

  for (let i = 0; i < n; i++) {
    const a = baseA + (i - (n - 1) / 2) * 0.16;
    newProj(run, 'luopanSlip', p.x, p.y, def.r * sigScale, a, def.life * run.mods.durMul, {
      weaponId: 'luopan_slip',
      vx: fcos(a) * spd,
      vy: fsin(a) * spd,
      speed: spd,
      turnRate,
      seekRange: seekR,
      pierce,
      dmg,
      evolved: w.evolved,
      _hit: [],
      _tgt: i === 0 ? t0 : null,
    });
  }
  emitFire(run, w, p.x, p.y, baseA);
}

// ───────────────────────── 持续弹体同步（灯笼、火环、纸扎仪仗）─────────────────────────

function summonKey(run, w) {
  const sigBit = isWeaponSignature(w, run) ? 1 : 0;
  if (w.id === 'lantern') {
    const cnt = (wstat('lantern', 'count', w.level) + run.mods.amount) & 0xff;
    return (cnt << 21) | ((w.evolved ? 1 : 0) << 20) | (sigBit << 19) | ((Math.round(weaponAreaMul(run, w) * 1000)) & 0x7ffff);
  }
  if (w.id === 'paperman') {
    return ((wstat('paperman', 'count', w.level) & 0xff) << 13) | (((run.mods.amount + 32) & 0xff) << 3) | (sigBit << 1) | (w.evolved ? 1 : 0);
  }
  return 0;
}

function syncSummons(run, w) {
  const key = summonKey(run, w);
  if (w._key === key) return;
  w._key = key;
  const p = run.player;
  const activeSlot = run._activeSlot || 0;
  const areaMul = weaponAreaMul(run, w);
  const sigScale = isWeaponSignature(w, run) ? 1 + HERO_AFFINITY.areaBonus : 1;

  if (w.id === 'lantern') {
    run.projectiles = run.projectiles.filter(
      (pr) => (pr.ownerSlot || 0) !== activeSlot || (pr.kind !== 'lantern' && pr.kind !== 'flameRing'),
    );
    const n = wstat('lantern', 'count', w.level) + run.mods.amount;
    for (let i = 0; i < n; i++) {
      newProj(run, 'lantern', p.x, p.y, WEAPONS.lantern.hitR * sigScale, 0, 1, {
        weaponId: 'lantern',
        orbitIndex: i,
        orbitCount: n,
        persistent: true,
        evolved: w.evolved,
      });
    }
    if (w.evolved) {
      const evo = WEAPONS.lantern.evo;
      const R = evo.ringRadius * areaMul;
      const innerR = evo.innerLotusRadius * areaMul;
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
    // 保留非常驻的纸扎羁绊自爆红纸童（persistent === false）与其他队友的纸人
    run.projectiles = run.projectiles.filter(
      (pr) => (pr.ownerSlot || 0) !== activeSlot || !(pr.kind === 'paperman' && pr.persistent),
    );
    const def = WEAPONS.paperman;
    const sigCdMul = isWeaponSignature(w, run) ? HERO_AFFINITY.cdMul : 1;
    if (!w.evolved) {
      const n = wstat('paperman', 'count', w.level) + run.mods.amount;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        newProj(run, 'paperman', p.x + fcos(a) * FX.summonOffset, p.y + fsin(a) * FX.summonOffset, def.r * sigScale, a, 1, {
          weaponId: 'paperman',
          role: 'seeker',
          targetId: null,
          mode: 'follow',
          orbitIndex: i,
          orbitCount: n,
          atkT: 0,
          sigScale,
          sigCdMul,
          persistent: true,
          evolved: false,
        });
      }
    } else {
      const evo = def.evo;
      for (let g = 0; g < evo.guards; g++) {
        const a = (g / evo.guards) * Math.PI * 2;
        newProj(run, 'paperman', p.x + fcos(a) * evo.guardR * areaMul, p.y + fsin(a) * evo.guardR * areaMul, def.r * sigScale, a, 1, {
          weaponId: 'paperman',
          role: 'guard',
          mode: 'guard',
          orbitIndex: g,
          orbitCount: evo.guards,
          atkT: 0,
          sigScale,
          sigCdMul,
          persistent: true,
          evolved: true,
        });
      }
      const cN = evo.cavalry + run.mods.amount;
      for (let c = 0; c < cN; c++) {
        const a = (c / cN) * Math.PI * 2;
        newProj(run, 'paperman', p.x + fcos(a) * 84, p.y + fsin(a) * 84, (def.r + 1) * sigScale, a, 1, {
          weaponId: 'paperman',
          role: 'cavalry',
          mode: 'follow',
          orbitIndex: c,
          orbitCount: cN,
          atkT: 0,
          chargeT: 0,
          vx: 0,
          vy: 0,
          sigScale,
          sigCdMul,
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
  taomujian: updateTaomujian,
  suohun_chain: updateSuohunChain,
  zhinian_kite: updateZhinianKite,
  nuo_drum: updateNuoDrum,
  mourning_staff: updateMourningStaff,
  sky_lantern: updateSkyLantern,
  carpenter_line: updateCarpenterLine,
  luopan_slip: updateLuopanSlip,
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
