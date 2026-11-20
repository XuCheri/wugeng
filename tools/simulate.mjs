#!/usr/bin/env node
// 《五更天》平衡模拟器（PLAN §4.4）
// 无界面跑 N 局：机器人「风筝 + 吃魂火 + 每次升级按简单评分挑选 + 满气就放大招」，
// 输出死亡时间分布、通关率、每分钟压力比、最高单次伤害、等级、击杀、铜钱，并对照验收目标。
//
// 用法：node tools/simulate.mjs --runs 200 --meta 0 --night 0 --hero zhou [--workers 2] [--seed0 1] [--json]
//
// 压力比定义：每秒涌入的敌人总血量（非 Boss 敌人生成时的满血量之和）÷ 玩家 DPS（实际打出的伤害数字之和，
// 含溢出伤害与 AoE 多目标），按分钟统计，只统计没有 Boss 在场的时间段。
// 涌入血量按到达时间（生成后约 8 秒走到玩家身边）计入分钟桶。

import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import { createRun, stepRun, chooseUpgrade, rerollChoices, openChest, endRun, DT } from '../src/sim/run.js';
import { metaBonusesFromLevels, META_IDS, MAIN_DURATION, BOSS_AI, ENEMY_AI } from '../src/sim/balance.js';
import * as BALANCE from '../src/sim/balance.js';

// ───────────────────────── 参数 ─────────────────────────
function parseArgs(argv) {
  const o = { runs: 200, meta: 0, night: 0, hero: 'zhou', workers: Math.max(1, Math.min(2, os.cpus().length)), seed0: 1, json: false, set: [], dt: DT, maxTime: MAIN_DURATION + 240 };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    const v = argv[i + 1];
    if (a === '--runs') o.runs = +v, i++;
    else if (a === '--meta') o.meta = +v, i++;
    else if (a === '--night') o.night = +v, i++;
    else if (a === '--hero') o.hero = v, i++;
    else if (a === '--workers') o.workers = +v, i++;
    else if (a === '--seed0') o.seed0 = +v, i++;
    else if (a === '--dt') o.dt = 1 / +v, i++; // 例如 --dt 30 表示 1/30 秒（仅用于快速迭代）
    else if (a === '--json') o.json = true;
    else if (a === '--set') o.set.push(v), i++; // 校准用：--set SPAWN.hpMul=1.5（可多次）
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

/** 临时覆盖 balance.js 里的数值（只影响本进程 / worker），格式 'SPAWN.hpMul=1.5' 或 'WEAPONS.gong.dmg=[14,20,26,33,40]' */
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
// 方向采样：每帧评估 16 个方向 + 原地不动，预测 lookahead 秒后的位置，
// 得分 = 拾取收益 − 危险（预测的敌人 / 弹幕 / 冲锋路线距离）+ 方向惯性。
const BOT = {
  dirs: 16,
  lookahead: [0.2, 0.45],
  scanR: 320,
  safe: 34, // 与敌人边缘保持的安全距离
  dangerW: 1.0,
  bossW: 3,
  eliteW: 1.6,
  bulletSafe: 26,
  bulletW: 4,
  chargeSafe: 46,
  chargeW: 6,
  orbR: 450,
  gainW: 900,
  inertia: 0.15,
  lowHp: 0.6,
  reactionEvery: 9, // 每 9 帧（150ms）重新决策一次，模拟人类反应
  attention: 10, // 只考虑最近的 10 个敌人（Boss 总在其中）
};
const DIRS = Array.from({ length: BOT.dirs }, (_, i) => ({ x: Math.cos((i / BOT.dirs) * Math.PI * 2), y: Math.sin((i / BOT.dirs) * Math.PI * 2) }));
DIRS.push({ x: 0, y: 0 });

export function botInput(run, mem) {
  const p = run.player;
  const ult = p.ult >= p.ultMax;
  mem.n = (mem.n || 0) + 1;
  if (mem.last && mem.n % BOT.reactionEvery !== 0) return { ...mem.last, ultimate: ult };

  const scan2 = BOT.scanR * BOT.scanR;
  // 注意力有限：只看最近的若干个敌人（新手不会同时盯住满屏的鬼）
  let near = [];
  for (const e of run.enemies) {
    const dx = e.x - p.x;
    const dy = e.y - p.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < scan2) near.push({ e, d2: e.boss ? 0 : d2 });
  }
  near.sort((a, b) => a.d2 - b.d2);
  near = near.slice(0, BOT.attention).map((x) => x.e);
  const bullets = [];
  for (const b of run.projectiles) {
    if (b.kind === 'enemyBullet' && (b.x - p.x) ** 2 + (b.y - p.y) ** 2 < scan2) bullets.push(b);
  }
  const hpLow = p.hp < p.maxHp * BOT.lowHp;
  const goals = [];
  const orb2 = BOT.orbR * BOT.orbR;
  for (const o of run.pickups) {
    if (o.mag) continue;
    const d2 = (o.x - p.x) ** 2 + (o.y - p.y) ** 2;
    if (d2 > orb2 && o.kind !== 'chest') continue;
    let v;
    if (o.kind === 'xp') v = Math.sqrt(o.value);
    else if (o.kind === 'chest') v = 30;
    else if (o.kind === 'bun') v = hpLow ? 25 : 0;
    else if (o.kind === 'banner') v = 6;
    else v = 1.5; // coin
    if (v > 0) goals.push({ x: o.x, y: o.y, v });
  }
  if (hpLow) for (const pr of run.props) if (pr.kind === 'lanternpost') goals.push({ x: pr.x, y: pr.y, v: 12 });

  let best = -Infinity;
  let bd = DIRS[DIRS.length - 1];
  const spd = p.speed;
  for (const d of DIRS) {
    let danger = 0;
    for (const T of BOT.lookahead) {
      const fx = p.x + d.x * spd * T;
      const fy = p.y + d.y * spd * T;
      for (const e of near) {
        // 预测敌人位置：朝玩家当前位置移动；冲锋中的纸马按冲锋方向
        let ex = e.x;
        let ey = e.y;
        let charge = false;
        const isCharger = (e.type === 'horse' && (e.state === 'charge' || e.state === 'windup')) || (e.type === 'weasel' && (e.state === 'pause' || e.state === 'dash'));
        if (isCharger) {
          // 冲锋 / 扑击路线：方向已锁定（e.dx, e.dy），线段到预测位置的距离
          const len = e.type === 'horse' ? BOSS_AI.horse.chargeSpeed * BOSS_AI.horse.chargeTime : e.speed * ENEMY_AI.weasel.dashMul * ENEMY_AI.weasel.dashTime;
          const rx = fx - e.x;
          const ry = fy - e.y;
          const along = Math.max(0, Math.min(len * 1.1, rx * e.dx + ry * e.dy));
          const px = e.x + e.dx * along - fx;
          const py = e.y + e.dy * along - fy;
          const lineD = Math.hypot(px, py) - e.r - p.r;
          const w = e.type === 'horse' ? BOT.chargeW : BOT.chargeW * 0.5;
          if (lineD < BOT.chargeSafe) danger += w * ((BOT.chargeSafe - lineD) / BOT.chargeSafe) ** 2;
          charge = true;
        }
        if (!charge) {
          const tx = p.x - e.x;
          const ty = p.y - e.y;
          const tl = Math.hypot(tx, ty) || 1;
          const mv = Math.min(tl, e.speed * T);
          ex += (tx / tl) * mv;
          ey += (ty / tl) * mv;
        }
        const gap = Math.hypot(fx - ex, fy - ey) - e.r - p.r;
        if (gap < BOT.safe) {
          const w = (e.boss ? BOT.bossW : 1) * (e.elite ? BOT.eliteW : 1) * (e.dmg / 6);
          const k = (BOT.safe - gap) / BOT.safe;
          danger += BOT.dangerW * w * k * k;
        }
      }
      for (const b of bullets) {
        const bx = b.x + b.vx * T;
        const by = b.y + b.vy * T;
        const gap = Math.hypot(fx - bx, fy - by) - b.r - p.r;
        if (gap < BOT.bulletSafe) danger += BOT.bulletW * ((BOT.bulletSafe - gap) / BOT.bulletSafe) ** 2;
      }
    }
    // 收益：离拾取物更近
    const T = BOT.lookahead[BOT.lookahead.length - 1];
    const fx = p.x + d.x * spd * T;
    const fy = p.y + d.y * spd * T;
    let gain = 0;
    for (const g of goals) gain += g.v / (Math.hypot(g.x - fx, g.y - fy) + 40);
    let gain0 = 0;
    for (const g of goals) gain0 += g.v / (Math.hypot(g.x - p.x, g.y - p.y) + 40);
    let score = (gain - gain0) * BOT.gainW / Math.max(1, goals.length ** 0.5) - danger * 10;
    if (mem.last) score += BOT.inertia * (d.x * mem.last.moveX + d.y * mem.last.moveY);
    if (!goals.length && d.x === 0 && d.y === 0) score -= 0.05; // 没事做时也慢慢走动
    if (score > best) {
      best = score;
      bd = d;
    }
  }
  mem.last = { moveX: bd.x, moveY: bd.y };
  return { moveX: bd.x, moveY: bd.y, ultimate: ult };
}

const WEAPON_PREF = { firecracker: 9.5, talisman: 9.4, lantern: 9.2, bell: 9.3, gong: 9.0, brush: 8.6, coinsword: 8.8, paperman: 8.7 };
const RELIC_PREF = { cinnabar: 7, clapper: 6.8, censer: 6.2, redstring: 6.2, bagua: 6.4, scissors: 6.0, inkstone: 5.6, tinder: 6.1 };

function scoreChoice(run, c) {
  const p = run.player;
  switch (c.kind) {
    case 'weapon':
      return (c.isNew ? WEAPON_PREF[c.id] : 10 + c.level * 0.2) + (c.evolvable ? 5 : 0);
    case 'relic': {
      const paired = run.weapons.some((w) => w.id === ({ clapper: 'gong', censer: 'lantern', cinnabar: 'talisman', inkstone: 'brush', bagua: 'coinsword', scissors: 'paperman', tinder: 'firecracker', redstring: 'bell' })[c.id]);
      return RELIC_PREF[c.id] + (paired ? 1.2 : 0) + (c.isNew ? 0 : 0.5) + (c.evolvable ? 5 : 0);
    }
    case 'overflow':
      return 10;
    case 'bun':
      return p.hp < p.maxHp * 0.5 ? 8 : 1;
    default:
      return 0.5;
  }
}

export function botChoose(run) {
  let best = -1;
  let bi = 0;
  run.choices.forEach((c, i) => {
    const s = scoreChoice(run, c);
    if (s > best) {
      best = s;
      bi = i;
    }
  });
  if (best < 5 && run.rerolls.free > 0 && rerollChoices(run)) return botChoose(run);
  chooseUpgrade(run, bi);
}

// ───────────────────────── 单局 ─────────────────────────
const ARRIVAL_LAG = 8;
export function simulateOne({ seed, meta = 0, night = 0, hero = 'zhou', dt = DT, maxTime = MAIN_DURATION + 240 }) {
  const metaB = metaBonusesFromLevels(metaLevelsForFraction(meta));
  const run = createRun({ seed, heroId: hero, nightLevel: night, meta: metaB });
  const mem = {};
  const minutes = []; // 每分钟：{ spawnHp, dmg, bossFree }
  let lastSpawn = 0;
  let lastDmg = 0;
  let lastTaken = 0;
  let levelAt10 = null;
  let ults = 0;
  let lastLevel = 1;
  const levelTimes = [];
  while (run.time < maxTime) {
    if (run.status === 'levelup') {
      botChoose(run);
      continue;
    }
    if (run.status === 'chest') {
      openChest(run);
      continue;
    }
    if (run.status !== 'playing') break;
    const inp = botInput(run, mem);
    if (inp.ultimate) ults++;
    const bossBefore = !!run.boss;
    stepRun(run, inp, dt);
    const mi = Math.floor(run.time / 60);
    // 涌入血量按「到达时间」计：敌人从屏外圆环走到玩家身边约需 ARRIVAL_LAG 秒
    const mia = Math.floor((run.time + ARRIVAL_LAG) / 60);
    for (const k of [mi, mia]) if (!minutes[k]) minutes[k] = { spawnHp: 0, dmg: 0, t: 0, taken: 0, alive: 0, n: 0 };
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
      levelTimes.push(run.time);
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
    pressure.push({ minute: m, alive, taken: taken / Math.max(1, alive), crowd: crowd / Math.max(1, alive), ratio: d > 0 ? s / d : NaN, incomingHps: t > 0 ? s / t : 0, dps: t > 0 ? d / t : 0, sampledSec: t / Math.max(1, alive) });
  }
  const at10 = results.filter((r) => r.levelAt10 !== null).map((r) => r.levelAt10 - 1);
  const maxHitsLate = results.filter((r) => r.time >= 480).map((r) => r.maxHit);
  const ultInterval = results.map((r) => Math.min(r.time, MAIN_DURATION) / Math.max(1, r.ults));
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
  };
}

function check(label, ok, value) {
  return `${ok ? '✓' : '✗'} ${label}: ${value}`;
}

export function report(s) {
  const o = s.opts;
  const lines = [];
  lines.push(`《五更天》平衡模拟：${s.runs} 局  meta=${o.meta} night=${o.night} hero=${o.hero} dt=1/${Math.round(1 / o.dt)}${o.set.length ? '  覆盖 ' + o.set.join(' ') : ''}`);
  lines.push(`死亡时间（通关计为 10:00+）中位数 ${mmss(s.deathMedian)}  p25 ${mmss(s.deathP25)}  p75 ${mmss(s.deathP75)}   仅死亡局中位数 ${mmss(s.deathOnlyMedian || 0)}`);
  lines.push(`通关率 ${(s.clearRate * 100).toFixed(1)}%`);
  lines.push(`最高单次伤害：全体中位 ${Math.round(s.maxHitMedian)}  活过 8:00 中位 ${Math.round(s.maxHitLateMedian || 0)}  p90 ${Math.round(s.maxHitLateP90 || 0)}  最大 ${s.maxHitMax}`);
  lines.push(`等级中位 ${s.levelMedian}  10:00 时已升级次数中位 ${s.levelUpsBy10Median ?? '-'}  击杀中位 ${Math.round(s.killsMedian)}  铜钱中位 ${Math.round(s.coinsMedian)}（通关局 ${Math.round(s.coinsClearMedian || 0)}）  大招间隔中位 ${s.ultIntervalMedian.toFixed(0)}s`);
  lines.push('分钟 | 存活局 | 涌入HP/s | 玩家DPS | 压力比 | 场上敌人 | 每局受伤');
  for (const p of s.pressure) {
    if (!p.alive) continue;
    lines.push(`${String(p.minute).padStart(4)} | ${String(p.alive).padStart(6)} | ${p.incomingHps.toFixed(0).padStart(8)} | ${p.dps.toFixed(0).padStart(7)} | ${isNaN(p.ratio) ? '  -' : p.ratio.toFixed(2)} | ${p.crowd.toFixed(0).padStart(8)} | ${p.taken.toFixed(0).padStart(8)}`);
  }
  lines.push('—— 验收（PLAN §4.4）——');
  if (o.meta === 0 && o.night === 0) {
    lines.push(check('meta 0 死亡时间中位数 5:00–7:00', s.deathMedian >= 300 && s.deathMedian <= 420, mmss(s.deathMedian)));
    lines.push(check('meta 0 通关率 5–15%', s.clearRate >= 0.05 && s.clearRate <= 0.15, `${(s.clearRate * 100).toFixed(1)}%`));
  }
  if (o.meta >= 0.5 && o.night === 0) lines.push(check(`meta ${o.meta} 通关率 ≥ 60%`, s.clearRate >= 0.6, `${(s.clearRate * 100).toFixed(1)}%`));
  const pr = s.pressure.filter((p) => p.alive >= Math.max(3, s.runs * 0.1) && p.minute < 10 && p.sampledSec > 20 && !isNaN(p.ratio));
  const prOk = pr.every((p) => p.ratio >= 0.6 && p.ratio <= 0.95);
  lines.push(check('非 Boss 时段压力比 0.6–0.95', prOk, pr.map((p) => p.ratio.toFixed(2)).join(' ')));
  if (s.maxHitLateMedian) lines.push(check('主线最高单次伤害 1,000–5,000（活过 8:00 的局）', s.maxHitLateMedian >= 1000 && s.maxHitLateMedian <= 5000, Math.round(s.maxHitLateMedian)));
  if (s.levelUpsBy10Median) lines.push(check('10:00 时约 32 次升级（28–36）', s.levelUpsBy10Median >= 28 && s.levelUpsBy10Median <= 36, s.levelUpsBy10Median));
  return lines.join('\n');
}

// ───────────────────────── 并行执行 ─────────────────────────
async function runAll(o) {
  const seeds = Array.from({ length: o.runs }, (_, i) => o.seed0 + i);
  const results = [];
  const nW = Math.max(1, Math.min(o.workers, o.runs));
  const self = fileURLToPath(import.meta.url);
  await Promise.all(
    Array.from({ length: nW }, (_, wi) => new Promise((resolve, reject) => {
      const mine = seeds.filter((_, i) => i % nW === wi);
      const w = new Worker(self, { workerData: { seeds: mine, meta: o.meta, night: o.night, hero: o.hero, dt: o.dt, maxTime: o.maxTime, set: o.set } });
      w.on('message', (m) => results.push(m));
      w.on('error', reject);
      w.on('exit', resolve);
    })),
  );
  return results;
}

if (!isMainThread && workerData) {
  applyOverrides(workerData.set);
  for (const seed of workerData.seeds) parentPort.postMessage(simulateOne({ ...workerData, seed }));
} else if (isMainThread && process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const o = parseArgs(process.argv);
  const t0 = Date.now();
  const results = await runAll(o);
  const s = summarize(results, o);
  if (o.json) console.log(JSON.stringify(s, null, 2));
  else console.log(report(s));
  console.log(`用时 ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}
