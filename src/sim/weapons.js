// 武器（PLAN §3.3）：8 种武器的冷却、发射与开光进化。
// 发射时把 B × M开光 算进弹体的 dmg；命中时再由 combat.damageEnemy 乘增伤 / 暴击 / 溢出签。
// 持续存在的弹体（灯笼、长明灯火环、纸人）按「数量 + 是否开光」自动同步。

import { WEAPONS, WEAPON_IDS, MAX_WEAPON_LEVEL, MAX_WEAPONS, FX } from './balance.js';
import { damageCircle, damageEnemy } from './combat.js';
import { hasRelic } from './relics.js';
import { hitPropsCircle } from './props.js';
import { wrapAngle } from '../core/math.js';

/** 取武器某项属性在 level 级时的数值（数组按级取，标量直接返回） */
export function wstat(id, key, level) {
  const v = WEAPONS[id][key];
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
  run.weapons.push({ id, level: 1, evolved: false, cd: FX.firstFireDelay });
  return 1;
}

/** 开光条件：武器满级 + 拥有对应法器 + 尚未开光（还需要打开供盒） */
export function canEvolve(run, w) {
  return !!w && w.level >= MAX_WEAPON_LEVEL && !w.evolved && hasRelic(run, WEAPONS[w.id].pair);
}

export function evolvableWeapons(run) {
  return run.weapons.filter((w) => canEvolve(run, w));
}

export function evolveWeapon(run, id) {
  const w = getWeapon(run, id);
  if (!canEvolve(run, w)) return false;
  w.evolved = true;
  run.events.push({ type: 'evolve', weaponId: id });
  return true;
}

/** 本武器本次发射的基础伤害（含开光倍率） */
function baseDmg(w) {
  const def = WEAPONS[w.id];
  return wstat(w.id, 'dmg', w.level) * (w.evolved ? def.evoMult : 1);
}

function cooldown(run, w) {
  return wstat(w.id, 'cd', w.level) * run.mods.cdMul;
}

function fire(run, w) {
  run.events.push({ type: 'fire', weaponId: w.id });
}

function newProj(run, kind, x, y, r, angle, life, extra) {
  const pr = { id: run._nextId++, kind, x, y, r, angle, t: 0, life, weaponId: null, ...extra };
  run.projectiles.push(pr);
  return pr;
}

// ───────────────────────── 各武器的发射逻辑 ─────────────────────────

function gongPulse(run, w) {
  const p = run.player;
  const def = WEAPONS.gong;
  const R = wstat('gong', 'radius', w.level) * run.mods.areaMul;
  damageCircle(run, p.x, p.y, R, baseDmg(w), 'gong', { knock: def.knockback, stun: w.evolved ? def.evo.stun : 0 });
  newProj(run, 'gongPulse', p.x, p.y, R, 0, def.pulseLife, { weaponId: 'gong', radius: 0, maxRadius: R, evolved: w.evolved });
  fire(run, w);
}

function updateGong(run, w, dt) {
  const evo = WEAPONS.gong.evo;
  if (w._burst > 0) {
    w._burstT -= dt;
    if (w._burstT <= 0) {
      w._burst--;
      w._burstT = evo.interval;
      gongPulse(run, w);
    }
  }
  w.cd -= dt;
  if (w.cd <= 0) {
    w.cd = cooldown(run, w);
    gongPulse(run, w);
    if (w.evolved) {
      w._burst = evo.pulses - 1;
      w._burstT = evo.interval;
    }
  }
}

function updateLantern(run, w, dt) {
  const def = WEAPONS.lantern;
  const p = run.player;
  w.cd -= dt;
  if (w.cd > 0) return;
  w.cd = def.tick * run.mods.cdMul;
  const dmg = baseDmg(w);
  const burst = w.evolved ? { radius: def.evo.burstRadius * run.mods.areaMul, dmg: dmg * def.evo.burstDmgMul, weaponId: 'lantern' } : null;
  const opts = burst ? { burst } : null;
  const hitR = def.hitR * run.mods.areaMul;
  for (const pr of run.projectiles) {
    if (pr.kind === 'lantern') damageCircle(run, pr.x, pr.y, hitR, dmg, 'lantern', opts);
    else if (pr.kind === 'flameRing') damageCircle(run, p.x, p.y, pr.radius, dmg * def.evo.ringDmgMul, 'lantern', opts);
  }
}

function updateTalisman(run, w, dt) {
  w.cd -= dt;
  if (w.cd > 0) return;
  const def = WEAPONS.talisman;
  const p = run.player;
  const targets = run._sys.hash.queryCircle(p.x, p.y, def.seekRange, run._sys.scratchW, 0);
  if (!targets.length) {
    w.cd = FX.retryDelay;
    return;
  }
  // 按距离排序，优先打最近的不同目标
  targets.sort((a, b) => (a.x - p.x) ** 2 + (a.y - p.y) ** 2 - ((b.x - p.x) ** 2 + (b.y - p.y) ** 2));
  w.cd = cooldown(run, w);
  const n = wstat('talisman', 'count', w.level) + run.mods.amount;
  const spd = def.speed * run.mods.durMul;
  for (let i = 0; i < n; i++) {
    const t = targets[i % targets.length];
    const a = Math.atan2(t.y - p.y, t.x - p.x) + (i - (n - 1) / 2) * FX.talismanFan;
    newProj(run, 'talisman', p.x, p.y, def.r, a, def.life * run.mods.durMul, {
      weaponId: 'talisman', vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, speed: spd,
      pierce: w.evolved ? def.evo.pierce : 0, dmg: baseDmg(w), evolved: w.evolved, _tgt: t, _hit: [],
    });
  }
  fire(run, w);
}

/** 扇形伤害（墨笔） */
export function damageSector(run, x, y, R, angle, spread, raw, weaponId) {
  const list = run._sys.hash.queryCircle(x, y, R, run._sys.scratchW);
  const half = spread / 2;
  for (const e of list) {
    if (e.dead) continue;
    const d = Math.hypot(e.x - x, e.y - y) || 1;
    const tol = Math.asin(Math.min(1, e.r / d));
    if (Math.abs(wrapAngle(Math.atan2(e.y - y, e.x - x) - angle)) <= half + tol) damageEnemy(run, e, raw, weaponId);
  }
  hitPropsCircle(run, x + Math.cos(angle) * R * 0.5, y + Math.sin(angle) * R * 0.5, R * 0.5);
}

function updateBrush(run, w, dt) {
  w.cd -= dt;
  if (w.cd > 0) return;
  w.cd = cooldown(run, w);
  const def = WEAPONS.brush;
  const p = run.player;
  const R = wstat('brush', 'radius', w.level) * run.mods.areaMul;
  const spread = (wstat('brush', 'spread', w.level) * Math.PI) / 180;
  const base = Math.atan2(p.facingY, p.facingX);
  const dirs = w.evolved ? [base, base + Math.PI] : [base];
  const dmg = baseDmg(w);
  for (const a of dirs) {
    damageSector(run, p.x, p.y, R, a, spread, dmg, 'brush');
    newProj(run, 'brushArc', p.x, p.y, R, a, def.arcLife, { weaponId: 'brush', radius: R, spread, evolved: w.evolved });
    if (w.evolved) {
      const e = def.evo;
      newProj(run, 'inkPool', p.x + Math.cos(a) * R * FX.inkPoolOffset, p.y + Math.sin(a) * R * FX.inkPoolOffset,
        e.poolRadius * run.mods.areaMul, a, e.poolLife * run.mods.durMul, {
          weaponId: 'brush', radius: e.poolRadius * run.mods.areaMul, dmg: dmg * e.poolDmgMul, tick: e.poolTick, _tickT: 0,
        });
    }
  }
  fire(run, w);
}

function updateCoinsword(run, w, dt) {
  w.cd -= dt;
  if (w.cd > 0) return;
  const def = WEAPONS.coinsword;
  const p = run.player;
  w.cd = cooldown(run, w);
  const spd = def.speed * run.mods.durMul;
  const dmg = baseDmg(w);
  if (w.evolved) {
    // 七星剑阵：七剑环绕后齐射
    const n = def.evo.swords + run.mods.amount;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      newProj(run, 'coinsword', p.x, p.y, def.r, a, def.evo.orbitTime + def.evo.range / spd, {
        weaponId: 'coinsword', vx: 0, vy: 0, returning: false, phase: 'orbit', orbitA: a, speed: spd,
        range: def.evo.range, dist: 0, dmg, evolved: true, _hit: new Set(),
      });
    }
  } else {
    const n = wstat('coinsword', 'count', w.level) + run.mods.amount;
    const t = run._sys.hash.nearest(p.x, p.y, def.range * 1.5, run._sys.scratchW, (e) => !e.dead);
    const base = t ? Math.atan2(t.y - p.y, t.x - p.x) : Math.atan2(p.facingY, p.facingX);
    for (let i = 0; i < n; i++) {
      const a = base + (i - (n - 1) / 2) * def.spreadAngle;
      newProj(run, 'coinsword', p.x, p.y, def.r, a, FX.coinswordMaxLife, {
        weaponId: 'coinsword', vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, returning: false, phase: 'fly', speed: spd,
        range: def.range * run.mods.durMul, dist: 0, dmg, evolved: false, _hit: new Set(),
      });
    }
  }
  fire(run, w);
}

function updateFirecracker(run, w, dt) {
  w.cd -= dt;
  if (w.cd > 0) return;
  const def = WEAPONS.firecracker;
  const p = run.player;
  const hash = run._sys.hash;
  const cands = hash.queryCircle(p.x, p.y, def.range, run._sys.scratchW, 0);
  if (!cands.length) {
    w.cd = FX.retryDelay;
    return;
  }
  w.cd = cooldown(run, w);
  const n = wstat('firecracker', 'count', w.level) + run.mods.amount;
  // 抽样若干敌人，选周围敌人最多的作为落点
  const picks = [];
  const step = Math.max(1, Math.floor(cands.length / def.sample));
  for (let i = 0; i < cands.length && picks.length < def.sample; i += step) picks.push(cands[i]);
  const scored = picks.map((e) => ({ e, n: hash.queryCircle(e.x, e.y, def.densityR, run._sys.scratchW2, 0).length }));
  scored.sort((a, b) => b.n - a.n);
  const R = wstat('firecracker', 'radius', w.level) * run.mods.areaMul;
  for (let i = 0; i < n; i++) {
    const t = scored[i % scored.length].e;
    const jx = i > 0 ? run.rng.range(-R, R) : 0;
    const jy = i > 0 ? run.rng.range(-R, R) : 0;
    newProj(run, 'firecracker', p.x, p.y, FX.firecrackerR, Math.atan2(t.y - p.y, t.x - p.x), def.flight, {
      weaponId: 'firecracker', fromX: p.x, fromY: p.y, toX: t.x + jx, toY: t.y + jy, radius: R, dmg: baseDmg(w), evolved: w.evolved,
    });
  }
  fire(run, w);
}

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
  const dmg = baseDmg(w);
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
    newProj(run, 'bellChain', p.x, p.y, 0, 0, life, { weaponId: 'bell', points: pts });
  } else {
    // 千铃引魂：每次弹跳分叉（广度优先，总命中数有上限）
    const maxHits = def.evo.maxHits;
    let frontier = [{ from: { x: p.x, y: p.y }, e: first }];
    hit.add(first.id);
    for (let depth = 0; depth < bounces && frontier.length && hit.size <= maxHits; depth++) {
      const next = [];
      for (const f of frontier) {
        newProj(run, 'bellChain', f.from.x, f.from.y, 0, 0, life, { weaponId: 'bell', points: [{ x: f.from.x, y: f.from.y }, { x: f.e.x, y: f.e.y }] });
        damageEnemy(run, f.e, dmg, 'bell');
        const near = hash.queryCircle(f.e.x, f.e.y, range, run._sys.scratchW, 0);
        let forks = 0;
        for (const n of near) {
          if (forks >= def.evo.forks || hit.size >= maxHits) break;
          if (n.dead || hit.has(n.id)) continue;
          hit.add(n.id);
          next.push({ from: { x: f.e.x, y: f.e.y }, e: n });
          forks++;
        }
      }
      frontier = next;
    }
  }
  fire(run, w);
}

// ───────────────────────── 持续弹体同步 ─────────────────────────

function summonKey(run, w) {
  if (w.id === 'lantern') return `${wstat('lantern', 'count', w.level) + run.mods.amount}|${w.evolved}`;
  if (w.id === 'paperman') return `${w.evolved ? WEAPONS.paperman.evo.count : wstat('paperman', 'count', w.level)}|${run.mods.amount}|${w.evolved}`;
  return '';
}

/** 让灯笼 / 火环 / 纸人的数量和当前等级一致 */
function syncSummons(run, w) {
  const key = summonKey(run, w);
  if (w._key === key) return;
  w._key = key;
  const p = run.player;
  if (w.id === 'lantern') {
    run.projectiles = run.projectiles.filter((pr) => pr.kind !== 'lantern' && pr.kind !== 'flameRing');
    const n = wstat('lantern', 'count', w.level) + run.mods.amount;
    for (let i = 0; i < n; i++) {
      newProj(run, 'lantern', p.x, p.y, WEAPONS.lantern.hitR, 0, 1, { weaponId: 'lantern', orbitIndex: i, orbitCount: n, persistent: true });
    }
    if (w.evolved) {
      const R = WEAPONS.lantern.evo.ringRadius * run.mods.areaMul;
      newProj(run, 'flameRing', p.x, p.y, R, 0, 1, { weaponId: 'lantern', radius: R, persistent: true });
    }
  } else if (w.id === 'paperman') {
    run.projectiles = run.projectiles.filter((pr) => pr.kind !== 'paperman');
    const def = WEAPONS.paperman;
    const n = (w.evolved ? def.evo.count : wstat('paperman', 'count', w.level)) + run.mods.amount;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      newProj(run, 'paperman', p.x + Math.cos(a) * FX.summonOffset, p.y + Math.sin(a) * FX.summonOffset, def.r, a, 1, {
        weaponId: 'paperman', targetId: null, mode: w.evolved ? 'patrol' : 'follow', orbitIndex: i, orbitCount: n,
        atkT: 0, persistent: true, evolved: w.evolved,
      });
    }
  }
}

const UPDATERS = {
  gong: updateGong,
  lantern: updateLantern,
  talisman: updateTalisman,
  brush: updateBrush,
  coinsword: updateCoinsword,
  paperman: null, // 纸人的攻击在 projectiles.js 里按个体结算
  firecracker: updateFirecracker,
  bell: updateBell,
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
  return w ? baseDmg(w) : 0;
}

export { baseDmg as weaponBaseDmg };
