#!/usr/bin/env node
// 《五更天》平衡模拟器（PLAN §4.4 + M1 Roguelike 校准）
// 无界面跑 N 局：机器人具备人类反应延迟与夜色视野衰减，支持风筝、躲冲锋/阴火预警、
// 多路径开光自选、四门流派凑羁绊、弃签/留签、守夜命签与香案/试炼碑/货郎交互。
//
// 用法：node tools/simulate.mjs --runs 120 --meta 0 --night 0 --hero zhou [--workers 2] [--seed0 1] [--json]

import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import {
  createRun, stepRun, chooseUpgrade, rerollChoices, banishChoice, toggleLockChoice,
  openChest, interactShrine, resolveShrine, dismissShrine, endRun, DT,
} from '../src/sim/run.js';
import { metaBonusesFromLevels, META_IDS, MAIN_DURATION, WATCH5_TIME, PACE, BOSS_AI, ENEMY_AI } from '../src/sim/balance.js';
import * as BALANCE from '../src/sim/balance.js';

// ───────────────────────── 参数 ─────────────────────────
function parseArgs(argv) {
  const o = {
    runs: 200,
    meta: 0,
    night: 0,
    hero: 'zhou',
    startWeapon: null,
    workers: Math.max(1, Math.min(2, os.cpus().length)),
    seed0: 1,
    json: false,
    set: [],
    dt: DT,
    maxTime: MAIN_DURATION + 240,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    const v = argv[i + 1];
    if (a === '--runs') (o.runs = +v), i++;
    else if (a === '--meta') (o.meta = +v), i++;
    else if (a === '--night') (o.night = +v), i++;
    else if (a === '--hero') (o.hero = v), i++;
    else if (a === '--startWeapon') (o.startWeapon = v), i++;
    else if (a === '--workers') (o.workers = +v), i++;
    else if (a === '--seed0') (o.seed0 = +v), i++;
    else if (a === '--dt') (o.dt = 1 / +v), i++;
    else if (a === '--json') o.json = true;
    else if (a === '--set') o.set.push(v), i++;
  }
  return o;
}

/** 局外成长比例 f（0..1）→ 更房等级：总等级 = round(40f)，按优先级轮流分配 */
export function metaLevelsForFraction(f) {
  const order = ['tizhi', 'lidao', 'huchi', 'jiaoli', 'wuxing', 'yanli', 'jiyuan', 'caiyun'];
  const levels = Object.fromEntries(META_IDS.map((id) => [id, 0]));
  let total = Math.round(40 * Math.max(0, Math.min(1, f)));
  while (total > 0) {
    for (const id of order) {
      if (total <= 0) break;
      if (levels[id] < 5) {
        levels[id]++;
        total--;
      }
    }
  }
  return levels;
}

/** 临时覆盖 balance.js 里的数值（只影响本进程 / worker） */
export function applyOverrides(list = []) {
  for (const kv of list) {
    const [path, val] = kv.split('=');
    const keys = path.split('.');
    let obj = BALANCE;
    for (let i = 0; i < keys.length - 1; i++) obj = obj[keys[i]];
    obj[keys[keys.length - 1]] = JSON.parse(val);
  }
}

// ───────────────────────── 机器人 ─────────────────────────
const BOT = {
  dirs: 16,
  lookahead: [0.18, 0.40],
  scanR: 250,
  telegraphScanR: 315,
  safe: 32,
  dangerW: 1.0,
  bossW: 2.9,
  eliteW: 1.5,
  bulletSafe: 20,
  bulletW: 2.2,
  chargeSafe: 42,
  chargeW: 5.2,
  cinderSafe: 16,
  cinderW: 4.2,
  orbR: 410,
  gainW: 940,
  inertia: 0.16,
  lowHp: 0.58,
  baseReaction: 11, // 一更明亮视野反应帧数
  darkReactionExtra: 12, // 五更浓黑夜色额外反应帧数
  attention: 7,
};
const DIRS = Array.from({ length: BOT.dirs }, (_, i) => ({
  x: Math.cos((i / BOT.dirs) * Math.PI * 2),
  y: Math.sin((i / BOT.dirs) * Math.PI * 2),
}));
DIRS.push({ x: 0, y: 0 });

function shouldUseShrine(run, s, mem = null) {
  if (!s || s.used || s.active || run.boss) return false;
  if (mem?.dismissedUntil && (mem.dismissedUntil[s.id] || 0) > run.time) return false;
  const p = run.player;
  if (s.kind === 'peddler') return run.stats.coins >= BALANCE.SHRINES.peddlerCosts.elixir;
  if (s.kind === 'trial') return p.hp > p.maxHp * 0.78 && run.time >= 275 * PACE && run.time <= 460 * PACE && run.weapons.length >= 3;
  return true; // altar
}

export function botInput(run, mem) {
  const p = run.player;
  const ult = p.ult >= p.ultMax;
  const canInteract = run.nearbyShrine && shouldUseShrine(run, run.nearbyShrine, mem);

  const dk = run.darkness || 0;
  const darkK = Math.max(0, Math.min(1, (dk - 0.15) / 0.60));
  const reactSec = (BOT.baseReaction + BOT.darkReactionExtra * darkK) * DT;
  if (!mem.inp) mem.inp = { moveX: 0, moveY: 0, ultimate: false, interact: false };
  if (mem.last && run.time - (mem.lastT ?? -9) < reactSec) {
    mem.inp.moveX = mem.last.moveX;
    mem.inp.moveY = mem.last.moveY;
    mem.inp.ultimate = ult;
    mem.inp.interact = !!canInteract;
    return mem.inp;
  }
  mem.lastT = run.time;

  const lightR = run.mods?.lightRadius || 118;
  const effScanR = Math.max(135, Math.min(BOT.scanR, lightR * (2.25 - 0.75 * darkK)));
  const effBulletSafe = BOT.bulletSafe * (1 - 0.15 * darkK);
  const scan2 = effScanR * effScanR;
  const tele2 = BOT.telegraphScanR * BOT.telegraphScanR;

  const near = mem.near || (mem.near = []);
  const nearD2 = mem.nearD2 || (mem.nearD2 = []);
  near.length = 0;
  nearD2.length = 0;
  const maxAtt = BOT.attention;
  const ens = run.enemies;
  for (let i = 0; i < ens.length; i++) {
    const e = ens[i];
    if (e.dead) continue;
    const dx = e.x - p.x;
    const dy = e.y - p.y;
    const d2 = dx * dx + dy * dy;
    const hasTele = e.telegraphProgress > 0 || e.state === 'charge' || e.state === 'dash' || e.state === 'lunge';
    let sd2 = -1;
    if (e.boss || hasTele) {
      if (d2 < tele2) sd2 = e.boss ? 0 : d2 * 0.5;
    } else if (d2 < scan2) {
      sd2 = d2;
    }
    if (sd2 < 0) continue;
    if (near.length === maxAtt && sd2 >= nearD2[maxAtt - 1]) continue;
    let pos = near.length;
    if (pos < maxAtt) {
      near.push(e);
      nearD2.push(sd2);
    } else {
      pos = maxAtt - 1;
    }
    while (pos > 0 && sd2 < nearD2[pos - 1]) {
      near[pos] = near[pos - 1];
      nearD2[pos] = nearD2[pos - 1];
      pos--;
    }
    near[pos] = e;
    nearD2[pos] = sd2;
  }

  const bullets = mem.bullets || (mem.bullets = []);
  const cinders = mem.cinders || (mem.cinders = []);
  bullets.length = 0;
  cinders.length = 0;
  const projs = run.projectiles;
  for (let i = 0; i < projs.length; i++) {
    const b = projs[i];
    if (b.dead) continue;
    const bdx = b.x - p.x;
    const bdy = b.y - p.y;
    const d2 = bdx * bdx + bdy * bdy;
    if (b.kind === 'enemyBullet' && d2 < scan2) bullets.push(b);
    else if (b.kind === 'cinderCore' && b.t >= 0.2 && d2 < tele2) cinders.push(b);
  }

  const hpLow = p.hp < p.maxHp * BOT.lowHp;
  const goals = mem.goals || (mem.goals = []);
  const goalPool = mem.goalPool || (mem.goalPool = []);
  goals.length = 0;
  let gIdx = 0;
  const pushGoal = (gx, gy, gv) => {
    let g = goalPool[gIdx];
    if (!g) g = goalPool[gIdx] = { x: gx, y: gy, v: gv };
    else {
      g.x = gx;
      g.y = gy;
      g.v = gv;
    }
    gIdx++;
    goals.push(g);
  };
  const orb2 = BOT.orbR * BOT.orbR;
  for (let i = 0; i < run.pickups.length; i++) {
    const o = run.pickups[i];
    if (o.mag) continue;
    const dx = o.x - p.x;
    const dy = o.y - p.y;
    const d2 = dx * dx + dy * dy;
    if (d2 > orb2 && o.kind !== 'chest') continue;
    let v;
    if (o.kind === 'xp') v = Math.sqrt(o.value);
    else if (o.kind === 'chest') v = 34;
    else if (o.kind === 'bun') v = hpLow ? 26 : 0;
    else if (o.kind === 'banner') v = 7;
    else v = 1.6;
    if (v > 0) pushGoal(o.x, o.y, v);
  }
  if (hpLow) {
    for (let i = 0; i < run.props.length; i++) {
      const pr = run.props[i];
      if (pr.kind === 'lanternpost') pushGoal(pr.x, pr.y, 12);
    }
  }
  if (!run.boss && run.shrines) {
    for (let i = 0; i < run.shrines.length; i++) {
      const s = run.shrines[i];
      if (!shouldUseShrine(run, s, mem)) continue;
      const sdx = s.x - p.x;
      const sdy = s.y - p.y;
      if (sdx * sdx + sdy * sdy <= 420 * 420) pushGoal(s.x, s.y, s.kind === 'altar' ? 14 : 11);
    }
  }

  let gain0 = 0;
  for (let gi = 0; gi < goals.length; gi++) {
    const g = goals[gi];
    const gdx0 = g.x - p.x;
    const gdy0 = g.y - p.y;
    gain0 += g.v / (Math.sqrt(gdx0 * gdx0 + gdy0 * gdy0) + 40);
  }
  const goalNorm = Math.max(1, Math.sqrt(goals.length));

  const T0 = BOT.lookahead[0];
  const T1 = BOT.lookahead[1];
  const nearInfo = mem.nearInfo || (mem.nearInfo = []);
  const nearLen = near.length;
  for (let ni = 0; ni < nearLen; ni++) {
    const e = near[ni];
    let inf = nearInfo[ni];
    if (!inf) inf = nearInfo[ni] = {};
    const isCharger =
      (e.telegraphProgress > 0 || e.state === 'charge' || e.state === 'dash' || e.state === 'lunge') &&
      (e.dx !== 0 || e.dy !== 0);
    inf.e = e;
    inf.isCharger = isCharger;
    if (isCharger) {
      const len =
        e.telegraphLen > 0
          ? e.telegraphLen
          : e.type === 'horse'
            ? BOSS_AI.horse.chargeSpeed * BOSS_AI.horse.chargeTime
            : e.type === 'youshen'
              ? BOSS_AI.youshen.lungeSpeed * BOSS_AI.youshen.lungeTime
              : ENEMY_AI.weasel.dashSpeed * ENEMY_AI.weasel.dashTime;
      inf.maxAlong = len * 1.08;
      inf.chargeW = e.boss ? BOT.chargeW : BOT.chargeW * 0.55;
      const cThresh = BOT.chargeSafe + e.r + p.r;
      inf.chargeThresh2 = cThresh * cThresh;
      inf.ex0 = e.x;
      inf.ey0 = e.y;
      inf.ex1 = e.x;
      inf.ey1 = e.y;
    } else {
      const tx = p.x - e.x;
      const ty = p.y - e.y;
      const tl = Math.sqrt(tx * tx + ty * ty) || 1;
      const ux = tx / tl;
      const uy = ty / tl;
      const effSpd = e.type === 'youshen' && e.state === 'enrage' ? e.speed * BOSS_AI.youshen.enrageSpeedMul : e.speed;
      const mv0 = Math.min(tl, effSpd * T0);
      const mv1 = Math.min(tl, effSpd * T1);
      inf.ex0 = e.x + ux * mv0;
      inf.ey0 = e.y + uy * mv0;
      inf.ex1 = e.x + ux * mv1;
      inf.ey1 = e.y + uy * mv1;
    }
    const safeGap = e.boss ? BOT.safe + 40 : BOT.safe;
    const safeR = safeGap + e.r + p.r;
    inf.safeGap = safeGap;
    inf.safeR2 = safeR * safeR;
    inf.dangerWeight = BOT.dangerW * (e.boss ? BOT.bossW : 1) * (e.elite ? BOT.eliteW : 1) * (e.dmg / 6);
  }

  const bulletInfo = mem.bulletInfo || (mem.bulletInfo = []);
  const bulletLen = bullets.length;
  const invBulletDenom = 1 / Math.max(6, effBulletSafe);
  for (let bi = 0; bi < bulletLen; bi++) {
    const b = bullets[bi];
    let biInf = bulletInfo[bi];
    if (!biInf) biInf = bulletInfo[bi] = {};
    biInf.r = b.r;
    biInf.bx0 = b.x + b.vx * T0;
    biInf.by0 = b.y + b.vy * T0;
    biInf.bx1 = b.x + b.vx * T1;
    biInf.by1 = b.y + b.vy * T1;
    const bSafe = effBulletSafe + b.r + p.r;
    biInf.bSafe2 = bSafe * bSafe;
  }

  const cinderInfo = mem.cinderInfo || (mem.cinderInfo = []);
  const cinderLen = cinders.length;
  for (let ci = 0; ci < cinderLen; ci++) {
    const c = cinders[ci];
    let ciInf = cinderInfo[ci];
    if (!ciInf) ciInf = cinderInfo[ci] = {};
    ciInf.x = c.x;
    ciInf.y = c.y;
    const rad = c.radius || 68;
    ciInf.rad = rad;
    const cSafe = BOT.cinderSafe + rad + p.r;
    ciInf.cSafe2 = cSafe * cSafe;
  }

  let best = -Infinity;
  let bd = DIRS[DIRS.length - 1];
  const spd = p.speed;
  for (let di = 0; di < DIRS.length; di++) {
    const d = DIRS[di];
    let danger = 0;
    for (let li = 0; li < BOT.lookahead.length; li++) {
      const T = BOT.lookahead[li];
      const fx = p.x + d.x * spd * T;
      const fy = p.y + d.y * spd * T;
      for (let ni = 0; ni < nearLen; ni++) {
        const inf = nearInfo[ni];
        const e = inf.e;
        if (inf.isCharger) {
          const rx = fx - e.x;
          const ry = fy - e.y;
          const along = Math.max(0, Math.min(inf.maxAlong, rx * e.dx + ry * e.dy));
          const px = e.x + e.dx * along - fx;
          const py = e.y + e.dy * along - fy;
          const p2 = px * px + py * py;
          if (p2 < inf.chargeThresh2) {
            const lineD = Math.sqrt(p2) - e.r - p.r;
            if (lineD < BOT.chargeSafe) danger += inf.chargeW * ((BOT.chargeSafe - lineD) / BOT.chargeSafe) ** 2;
          }
        }
        const ex = li === 0 ? inf.ex0 : inf.ex1;
        const ey = li === 0 ? inf.ey0 : inf.ey1;
        const edx = fx - ex;
        const edy = fy - ey;
        const ed2 = edx * edx + edy * edy;
        if (ed2 < inf.safeR2) {
          const gap = Math.sqrt(ed2) - e.r - p.r;
          if (gap < inf.safeGap) {
            const k = (inf.safeGap - gap) / inf.safeGap;
            danger += inf.dangerWeight * k * k;
          }
        }
      }
      for (let bi = 0; bi < bulletLen; bi++) {
        const biInf = bulletInfo[bi];
        const bdx = fx - (li === 0 ? biInf.bx0 : biInf.bx1);
        const bdy = fy - (li === 0 ? biInf.by0 : biInf.by1);
        const bd2 = bdx * bdx + bdy * bdy;
        if (bd2 < biInf.bSafe2) {
          const gap = Math.sqrt(bd2) - biInf.r - p.r;
          if (gap < effBulletSafe) danger += BOT.bulletW * ((effBulletSafe - gap) * invBulletDenom) ** 2;
        }
      }
      for (let ci = 0; ci < cinderLen; ci++) {
        const ciInf = cinderInfo[ci];
        const cdx = fx - ciInf.x;
        const cdy = fy - ciInf.y;
        const cd2 = cdx * cdx + cdy * cdy;
        if (cd2 < ciInf.cSafe2) {
          const gap = Math.sqrt(cd2) - ciInf.rad - p.r;
          if (gap < BOT.cinderSafe) danger += BOT.cinderW * ((BOT.cinderSafe - gap) / BOT.cinderSafe) ** 2;
        }
      }
    }

    const T = BOT.lookahead[BOT.lookahead.length - 1];
    const fx = p.x + d.x * spd * T;
    const fy = p.y + d.y * spd * T;
    let gain = 0;
    for (let gi = 0; gi < goals.length; gi++) {
      const g = goals[gi];
      const gdx = g.x - fx;
      const gdy = g.y - fy;
      gain += g.v / (Math.sqrt(gdx * gdx + gdy * gdy) + 40);
    }
    let score = ((gain - gain0) * BOT.gainW) / goalNorm - danger * 10;
    if (mem.last) score += BOT.inertia * (d.x * mem.last.moveX + d.y * mem.last.moveY);
    if (!goals.length && d.x === 0 && d.y === 0) score -= 0.05;
    if (score > best) {
      best = score;
      bd = d;
    }
  }
  mem.last = { moveX: bd.x, moveY: bd.y };
  mem.inp.moveX = bd.x;
  mem.inp.moveY = bd.y;
  mem.inp.ultimate = ult;
  mem.inp.interact = !!canInteract;
  return mem.inp;
}

const WEAPON_PREF = {
  firecracker: 9.5,
  talisman: 9.4,
  taomujian: 9.35,
  bell: 9.3,
  soulbanner: 9.3,
  suohun_chain: 9.25,
  zhinian_kite: 9.2,
  compass: 9.2,
  lantern: 9.2,
  nuo_drum: 9.15,
  bronze_mirror: 9.1,
  paperhorse: 9.0,
  gong: 9.0,
  coinsword: 8.9,
  brush: 8.8,
  paperman: 8.8,
};

const RELIC_PREF = {
  cinnabar: 7.0,
  clapper: 6.9,
  leijimu: 6.8,
  fivecoins: 6.7,
  yinpai: 6.65,
  soulwick: 6.6,
  huoyao_pouch: 6.55,
  wuse_mask: 6.5,
  bagua: 6.5,
  strawshoes: 6.4,
  glutinous: 6.4,
  censer: 6.3,
  redstring: 6.3,
  tinder: 6.1,
  scissors: 6.1,
  inkstone: 5.8,
};

function schoolBonusFor(run, tags = []) {
  if (!tags || !tags.length || !run.synergies) return 0;
  let bonus = 0;
  for (const t of tags) {
    const cnt = run.synergies.counts?.[t] || 0;
    if (cnt > 0) bonus += 0.7;
    if (cnt === 1 || cnt === 3 || cnt === 5) bonus += 1.1; // 临近 2/4/6 阶梯羁绊或 3 件共鸣开光
  }
  return bonus;
}

function scoreChoice(run, c) {
  const p = run.player;
  switch (c.kind) {
    case 'blessing': {
      const tagB = schoolBonusFor(run, c.tags) * 0.5;
      if (c.tier === 'cursed') {
        if (c.id === 'glass_talisman' || c.id === 'blood_oath' || c.id === 'cursed_lantern' || c.id === 'heavy_bronze') {
          return (p.hp > p.maxHp * 0.85 ? 6.8 : 1.5) + tagB * 0.5;
        }
        return (p.hp > p.maxHp * 0.75 ? 7.4 : 2.5) + tagB * 0.5;
      }
      let base = 9.0 + tagB;
      if ((c.id === 'earth_blessing' || c.id === 'lantern_oil' || c.id === 'paper_soul') && p.hp < p.maxHp * 0.65) {
        base += 1.5;
      }
      return base;
    }
    case 'weapon': {
      const tags = BALANCE.WEAPONS[c.id]?.tags || [];
      const syn = c.isNew ? schoolBonusFor(run, tags) : 0;
      const sigBonus = BALANCE.isHeroSignatureWeapon?.(run.heroId, c.id) ? 0.8 : 0;
      return (c.isNew ? (WEAPON_PREF[c.id] ?? 8.8) + syn : 10.2 + c.level * 0.25) + sigBonus + (c.evolvable ? 5.5 : 0);
    }
    case 'relic': {
      const def = BALANCE.RELICS[c.id];
      const paired = run.weapons.some((w) => BALANCE.WEAPONS[w.id]?.pair === c.id);
      const syn = c.isNew ? schoolBonusFor(run, def?.tags || []) : 0;
      return (RELIC_PREF[c.id] ?? 6.2) + (paired ? 1.35 : 0) + syn + (c.isNew ? 0 : 0.6) + (c.evolvable ? 5.5 : 0);
    }
    case 'overflow':
      return 10;
    case 'bun':
      return p.hp < p.maxHp * 0.5 ? 8 : 1;
    default:
      return 0.5;
  }
}

export function botChoose(run, depth = 0) {
  if (!run.choices || !run.choices.length) {
    throw new Error(`botChoose called with empty choices at t=${run.time}`);
  }
  const scored = run.choices.map((c, i) => ({ c, i, s: scoreChoice(run, c) }));
  scored.sort((a, b) => b.s - a.s);
  const best = scored[0];

  if (run.choiceMode !== 'blessing' && depth < 6) {
    const worst = scored[scored.length - 1];
    if (best.s < 5.5 && run.banishesLeft > 0 && (worst.c.kind === 'weapon' || worst.c.kind === 'relic')) {
      if (banishChoice(run, worst.i)) return botChoose(run, depth + 1);
    }
    if (best.s < 5.5 && run.rerolls.free > 0 && rerollChoices(run)) {
      return botChoose(run, depth + 1);
    }
    const second = scored[1];
    if (second && second.s >= 12.5 && !run.lockedChoice) {
      toggleLockChoice(run, second.i);
    }
  }

  if (chooseUpgrade(run, best.i)) return true;
  for (let i = 0; i < run.choices.length; i++) {
    if (chooseUpgrade(run, i)) return true;
  }
  throw new Error(`chooseUpgrade failed for all choices at t=${run.time}: ${JSON.stringify(run.choices)}`);
}

export function botOpenChest(run) {
  const list = run.chestChoices || [];
  if (!list.length) return openChest(run);
  let bestId = list[0].id;
  let bestScore = -Infinity;
  for (const ch of list) {
    const s = (WEAPON_PREF[ch.id] ?? 8.8) + (ch.recipe === 'paired' ? 2.0 : 0);
    if (s > bestScore) {
      bestScore = s;
      bestId = ch.id;
    }
  }
  return openChest(run, bestId);
}

export function botResolveShrine(run, mem = null) {
  const sh = run.activeShrine;
  const markDismissed = () => {
    if (mem && sh?.id != null) {
      if (!mem.dismissedUntil) mem.dismissedUntil = {};
      mem.dismissedUntil[sh.id] = run.time + 8;
    }
    dismissShrine(run);
  };
  if (!sh) {
    markDismissed();
    return false;
  }
  const p = run.player;
  const opts = sh.options || [];
  let res = null;

  if (sh.kind === 'altar') {
    if (p.hp < p.maxHp * 0.52 && !opts[2]?.disabled) {
      res = resolveShrine(run, 2); // 安神香火
    } else if (!opts[0]?.disabled && p.hp > p.maxHp * 0.78 && run.weapons.some((w) => !w.evolved && w.level >= 4)) {
      res = resolveShrine(run, 0); // 燃血祭器
    } else if (!opts[1]?.disabled) {
      res = resolveShrine(run, 1); // 求取命签
    }
  } else if (sh.kind === 'trial') {
    if (p.hp > p.maxHp * 0.65 && !run.boss && !opts[0]?.disabled) {
      res = resolveShrine(run, 0);
    }
  } else {
    // peddler
    if (p.hp < p.maxHp * 0.55 && !opts[2]?.disabled) res = resolveShrine(run, 2);
    else if (!opts[0]?.disabled) res = resolveShrine(run, 0);
    else if (!opts[1]?.disabled) res = resolveShrine(run, 1);
    else if (!opts[2]?.disabled) res = resolveShrine(run, 2);
  }

  if (!res) {
    markDismissed();
    return false;
  }
  return true;
}

// ───────────────────────── 单局 ─────────────────────────
const ARRIVAL_LAG = 8;
export function simulateOne({ seed, meta = 0, night = 0, hero = 'zhou', startWeapon = null, dt = DT, maxTime = MAIN_DURATION + 240 }) {
  const metaB = metaBonusesFromLevels(metaLevelsForFraction(meta));
  const run = createRun({ seed, heroId: hero, startWeapon, nightLevel: night, meta: metaB });
  const mem = { dismissedUntil: {} };
  const minutes = [];
  const evoRecipes = { paired: 0, resonance: 0, maxRelic: 0, altar: 0 };
  let shrinesUsed = 0;
  let lastSpawn = 0;
  let lastDmg = 0;
  let lastTaken = 0;
  let levelAt10 = null;
  let lastLevel = 1;
  let modalGuard = 0;
  let loopGuard = 0;

  while (run.time < maxTime) {
    if (++loopGuard > 80000) {
      throw new Error(`Loop guard exceeded seed=${seed} t=${run.time} status=${run.status} dt=${dt}`);
    }
    if (run.status === 'levelup') {
      if (++modalGuard > 32) {
        throw new Error(`Modal guard exceeded (levelup) seed=${seed} t=${run.time.toFixed(3)} mode=${run.choiceMode}`);
      }
      botChoose(run);
      continue;
    }
    if (run.status === 'chest') {
      if (++modalGuard > 32) {
        throw new Error(`Modal guard exceeded (chest) seed=${seed} t=${run.time.toFixed(3)}`);
      }
      const res = botOpenChest(run);
      if (res && res.evolved && res.recipe && evoRecipes[res.recipe] !== undefined) {
        evoRecipes[res.recipe]++;
      }
      continue;
    }
    if (run.status === 'shrine') {
      if (++modalGuard > 32) {
        throw new Error(`Modal guard exceeded (shrine) seed=${seed} t=${run.time.toFixed(3)} id=${run.activeShrine?.id}`);
      }
      const beforeW = run.weapons.filter((w) => w.evolved).length;
      if (botResolveShrine(run, mem)) shrinesUsed++;
      const afterW = run.weapons.filter((w) => w.evolved).length;
      if (afterW > beforeW) evoRecipes.altar += afterW - beforeW;
      continue;
    }
    if (run.status !== 'playing') break;

    if (run.nearbyShrine && shouldUseShrine(run, run.nearbyShrine, mem)) {
      if (interactShrine(run)) {
        if (++modalGuard > 32) {
          throw new Error(`Modal guard exceeded (interactShrine) seed=${seed} t=${run.time.toFixed(3)}`);
        }
        continue;
      }
    }

    modalGuard = 0;
    const inp = botInput(run, mem);
    const bossBefore = !!run.boss;
    stepRun(run, inp, dt);
    const mi = Math.floor(run.time / 60);
    const mia = Math.floor((run.time + ARRIVAL_LAG) / 60);
    if (!minutes[mi]) minutes[mi] = { spawnHp: 0, dmg: 0, t: 0, taken: 0, alive: 0, n: 0 };
    if (!minutes[mia]) minutes[mia] = { spawnHp: 0, dmg: 0, t: 0, taken: 0, alive: 0, n: 0 };
    minutes[mi].taken += run._tele.taken - lastTaken;
    lastTaken = run._tele.taken;
    minutes[mi].alive += run.enemies.length;
    minutes[mi].n++;
    const ds = run._tele.spawnHp - lastSpawn;
    const dd = run._tele.dmgNonBoss - lastDmg;
    lastSpawn = run._tele.spawnHp;
    lastDmg = run._tele.dmgNonBoss;
    if (!bossBefore && !run.boss) {
      minutes[mia].spawnHp += ds;
      minutes[mi].dmg += dd;
      minutes[mi].t += dt;
    }
    if (run.player.level !== lastLevel) {
      lastLevel = run.player.level;
    }
    if (levelAt10 === null && run.time >= MAIN_DURATION) levelAt10 = run.player.level;
  }
  const cleared = run.status === 'cleared' || run._cleared;
  const sum = endRun(run);
  return {
    seed,
    cleared,
    time: run.time,
    level: run.player.level,
    levelAt10,
    kills: run.stats.kills,
    coins: sum.coins,
    maxHit: run.stats.maxHit,
    ults: run.stats.ultsCast,
    minutes,
    weapons: sum.weapons,
    relics: sum.relics,
    evoCount: sum.weapons.filter((w) => w.evolved).length,
    evoRecipes,
    blessingsCount: run.blessings.reduce((a, b) => a + b.stacks, 0),
    synergiesCount: run.synergies?.active?.length || 0,
    shrinesUsed,
  };
}

// ───────────────────────── 统计 ─────────────────────────
function quantile(arr, q) {
  if (!arr.length) return NaN;
  const s = [...arr].sort((a, b) => a - b);
  const i = (s.length - 1) * q;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return s[lo] + (s[hi] - s[lo]) * (i - lo);
}

const mmss = (t) => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

export function summarize(results, opts) {
  const n = results.length;
  const times = results.map((r) => (r.cleared ? Math.max(r.time, MAIN_DURATION) : r.time));
  const deaths = results.filter((r) => !r.cleared).map((r) => r.time);
  const clears = results.filter((r) => r.cleared).length;
  const pressure = [];
  for (let m = 0; m < 11; m++) {
    let s = 0;
    let d = 0;
    let t = 0;
    let alive = 0;
    let taken = 0;
    let crowd = 0;
    for (const r of results) {
      const b = r.minutes[m];
      if (!b) continue;
      alive++;
      taken += b.taken;
      crowd += b.alive / Math.max(1, b.n);
      s += b.spawnHp;
      d += b.dmg;
      t += b.t;
    }
    pressure.push({
      minute: m,
      alive,
      taken: taken / Math.max(1, alive),
      crowd: crowd / Math.max(1, alive),
      ratio: d > 0 ? s / d : NaN,
      incomingHps: t > 0 ? s / t : 0,
      dps: t > 0 ? d / t : 0,
      sampledSec: t / Math.max(1, alive),
    });
  }
  const at10 = results.filter((r) => r.levelAt10 !== null).map((r) => r.levelAt10 - 1);
  const maxHitsLate = results.filter((r) => r.time >= WATCH5_TIME).map((r) => r.maxHit);
  const ultInterval = results.map((r) => Math.min(r.time, MAIN_DURATION) / Math.max(1, r.ults));
  const recipeTotals = { paired: 0, resonance: 0, maxRelic: 0, altar: 0 };
  let evoTotal = 0;
  let blessingTotal = 0;
  let synergyRuns = 0;
  for (const r of results) {
    evoTotal += r.evoCount || 0;
    blessingTotal += r.blessingsCount || 0;
    if ((r.synergiesCount || 0) > 0) synergyRuns++;
    if (r.evoRecipes) {
      for (const k of Object.keys(recipeTotals)) recipeTotals[k] += r.evoRecipes[k] || 0;
    }
  }
  return {
    opts,
    runs: n,
    deathMedian: quantile(times, 0.5),
    deathP25: quantile(times, 0.25),
    deathP75: quantile(times, 0.75),
    deathOnlyMedian: quantile(deaths, 0.5),
    clearRate: clears / n,
    pressure,
    maxHitMedian: quantile(results.map((r) => r.maxHit), 0.5),
    maxHitLateMedian: quantile(maxHitsLate, 0.5),
    maxHitLateP90: quantile(maxHitsLate, 0.9),
    maxHitMax: Math.max(...results.map((r) => r.maxHit)),
    levelMedian: quantile(results.map((r) => r.level), 0.5),
    levelUpsBy10Median: quantile(at10, 0.5),
    killsMedian: quantile(results.map((r) => r.kills), 0.5),
    coinsMedian: quantile(results.map((r) => r.coins), 0.5),
    coinsClearMedian: quantile(results.filter((r) => r.cleared).map((r) => r.coins), 0.5),
    ultIntervalMedian: quantile(ultInterval, 0.5),
    avgEvolutions: evoTotal / Math.max(1, n),
    recipeTotals,
    avgBlessings: blessingTotal / Math.max(1, n),
    synergyRate: synergyRuns / Math.max(1, n),
  };
}

function check(label, ok, value) {
  return `${ok ? '✓' : '✗'} ${label}: ${value}`;
}

export function report(s) {
  const o = s.opts;
  const mainMin = Math.round(MAIN_DURATION / 60);
  const lines = [];
  lines.push(`《五更天》平衡模拟：${s.runs} 局  meta=${o.meta} night=${o.night} hero=${o.hero} dt=1/${Math.round(1 / o.dt)}${o.set.length ? '  覆盖 ' + o.set.join(' ') : ''}`);
  lines.push(`死亡时间（通关计为 ${mmss(MAIN_DURATION)}+）中位数 ${mmss(s.deathMedian)}  p25 ${mmss(s.deathP25)}  p75 ${mmss(s.deathP75)}   仅死亡局中位数 ${mmss(s.deathOnlyMedian || 0)}`);
  lines.push(`通关率 ${(s.clearRate * 100).toFixed(1)}%`);
  lines.push(`最高单次伤害：全体中位 ${Math.round(s.maxHitMedian)}  活过 ${mmss(WATCH5_TIME)} 中位 ${Math.round(s.maxHitLateMedian || 0)}  p90 ${Math.round(s.maxHitLateP90 || 0)}  最大 ${s.maxHitMax}`);
  lines.push(`等级中位 ${s.levelMedian}  ${mmss(MAIN_DURATION)} 时已升级次数中位 ${s.levelUpsBy10Median ?? '-'}  击杀中位 ${Math.round(s.killsMedian)}  铜钱中位 ${Math.round(s.coinsMedian)}（通关局 ${Math.round(s.coinsClearMedian || 0)}）  大招间隔中位 ${s.ultIntervalMedian.toFixed(0)}s`);
  lines.push(`构筑深度：场均开光 ${s.avgEvolutions.toFixed(2)} 把（本命=${s.recipeTotals.paired} 共鸣=${s.recipeTotals.resonance} 满器=${s.recipeTotals.maxRelic} 香案=${s.recipeTotals.altar}）  羁绊激活率 ${(s.synergyRate * 100).toFixed(0)}%  场均命签 ${s.avgBlessings.toFixed(1)}`);
  lines.push('分钟 | 存活局 | 涌入HP/s | 玩家DPS | 压力比 | 场上敌人 | 每局受伤');
  for (const p of s.pressure) {
    if (!p.alive) continue;
    lines.push(`${String(p.minute).padStart(4)} | ${String(p.alive).padStart(6)} | ${p.incomingHps.toFixed(0).padStart(8)} | ${p.dps.toFixed(0).padStart(7)} | ${isNaN(p.ratio) ? '  -' : p.ratio.toFixed(2)} | ${p.crowd.toFixed(0).padStart(8)} | ${p.taken.toFixed(0).padStart(8)}`);
  }
  lines.push('—— 验收（PLAN §4.4 / 7分钟节奏）——');
  if (o.meta === 0 && o.night === 0) {
    const lo = Math.round(300 * PACE);
    const hi = Math.round(420 * PACE);
    lines.push(check(`meta 0 死亡时间中位数 ${mmss(lo)}–${mmss(hi)}`, s.deathMedian >= lo && s.deathMedian <= hi, mmss(s.deathMedian)));
    lines.push(check('meta 0 通关率 5–25%', s.clearRate >= 0.05 && s.clearRate <= 0.25, `${(s.clearRate * 100).toFixed(1)}%`));
  }
  if (o.meta >= 0.5 && o.night === 0) lines.push(check(`meta ${o.meta} 通关率 ≥ 60%`, s.clearRate >= 0.6, `${(s.clearRate * 100).toFixed(1)}%`));
  const pr = s.pressure.filter((p) => p.alive >= Math.max(3, s.runs * 0.1) && p.minute < mainMin && p.sampledSec > 20 && !isNaN(p.ratio));
  const prOk = pr.every((p) => p.ratio >= 0.6 && p.ratio <= 0.95);
  lines.push(check('非 Boss 时段压力比 0.6–0.95', prOk, pr.map((p) => p.ratio.toFixed(2)).join(' ')));
  if (s.maxHitLateMedian) lines.push(check(`主线最高单次伤害 1,000–5,000（活过 ${mmss(WATCH5_TIME)} 的局）`, s.maxHitLateMedian >= 1000 && s.maxHitLateMedian <= 5000, Math.round(s.maxHitLateMedian)));
  if (s.levelUpsBy10Median) lines.push(check(`${mmss(MAIN_DURATION)} 时约 32 次升级（28–36）`, s.levelUpsBy10Median >= 28 && s.levelUpsBy10Median <= 36, s.levelUpsBy10Median));
  return lines.join('\n');
}

// ───────────────────────── 并行执行（动态领任务防长尾空转）─────────────────────────
async function runAll(o) {
  const seeds = Array.from({ length: o.runs }, (_, i) => o.seed0 + i);
  const results = new Array(seeds.length);
  const nW = Math.max(1, Math.min(o.workers, seeds.length));
  const self = fileURLToPath(import.meta.url);
  let nextIdx = 0;
  await Promise.all(
    Array.from({ length: nW }, () =>
      new Promise((resolve, reject) => {
        const w = new Worker(self, {
          workerData: { dynamic: true, meta: o.meta, night: o.night, hero: o.hero, startWeapon: o.startWeapon, dt: o.dt, maxTime: o.maxTime, set: o.set },
        });
        const sendNext = () => {
          if (nextIdx < seeds.length) {
            const idx = nextIdx++;
            w.postMessage({ idx, seed: seeds[idx] });
          } else {
            w.postMessage({ done: true });
          }
        };
        w.on('message', ({ idx, res }) => {
          results[idx] = res;
          sendNext();
        });
        w.on('error', reject);
        w.on('exit', resolve);
        sendNext();
      }),
    ),
  );
  return results;
}

if (!isMainThread && workerData) {
  applyOverrides(workerData.set);
  if (workerData.dynamic) {
    parentPort.on('message', (msg) => {
      if (msg.done) {
        parentPort.close();
        return;
      }
      parentPort.postMessage({ idx: msg.idx, res: simulateOne({ ...workerData, seed: msg.seed }) });
    });
  } else {
    for (const seed of workerData.seeds) parentPort.postMessage(simulateOne({ ...workerData, seed }));
  }
} else if (isMainThread && process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const o = parseArgs(process.argv);
  const t0 = Date.now();
  const results = await runAll(o);
  const s = summarize(results, o);
  if (o.json) console.log(JSON.stringify(s, null, 2));
  else console.log(report(s));
  console.log(`用时 ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}
