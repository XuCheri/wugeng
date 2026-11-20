// mock-run.js —— 风格检查用的假 RunState（严格对齐 ARCHITECTURE §3），并提供简单动画推进
// 仅供 style-lab.html 与渲染测试使用，不参与正式逻辑。
import { makeRng } from './ink.js';

const TAU = Math.PI * 2;
const DARK = [0, 0.18, 0.34, 0.5, 0.66, 0.82, 0];
const ENEMY_R = { paperkid: 11, shade: 10, lanternghost: 15, weasel: 12, sedan: 22, drowned: 13 };
const BOSS = {
  horse: { r: 34, hp: 1800 },
  umbrella: { r: 30, hp: 6000 },
  youshen: { r: 44, hp: 24000 },
};

/**
 * @param {{watch?:number, scene?:'crowd'|'boss'|'hud', seed?:number, hero?:string, boss?:string}} o
 */
export function createMockRun(o = {}) {
  const watch = Math.max(1, Math.min(6, o.watch || 3));
  const scene = o.scene || 'crowd';
  const seed = o.seed || 20261120;
  const rng = makeRng(seed);
  const hud = scene === 'hud';
  const bossType = o.boss || (scene === 'boss' ? 'youshen' : hud ? 'umbrella' : 'horse');
  const time = hud ? 25 * 60 + 20 : watch >= 6 ? 600 : (watch - 1) * 120 + 72;

  const run = {
    seed,
    heroId: o.hero || 'zhou',
    nightLevel: hud ? 3 : 0,
    time,
    watch,
    mode: hud ? 'endless' : 'main',
    status: watch >= 6 && !hud ? 'cleared' : 'playing',
    darkness: hud ? 0.66 : DARK[watch],
    player: {
      x: 0,
      y: 0,
      r: 12,
      hp: hud ? 23 : 86,
      maxHp: 120,
      armor: 2,
      speed: 120,
      level: hud ? 58 : 14,
      xp: hud ? 410 : 38,
      xpNext: hud ? 520 : 71,
      facingX: 1,
      facingY: 0,
      moving: true,
      ult: hud ? 100 : 64,
      ultMax: 100,
      invulnT: 0,
      hurtT: 0,
      heroId: o.hero || 'zhou',
    },
    enemies: [],
    projectiles: [],
    pickups: [],
    props: [],
    weapons: [
      { id: 'gong', level: 4, evolved: false, cd: 0.4 },
      { id: 'lantern', level: 5, evolved: true, cd: 0 },
      { id: 'talisman', level: 3, evolved: false, cd: 0.2 },
      { id: 'brush', level: 2, evolved: false, cd: 0.6 },
    ],
    relics: [
      { id: 'clapper', level: 2 },
      { id: 'censer', level: 5 },
      { id: 'redstring', level: 1 },
    ],
    choices: null,
    rerolls: { free: 2, ad: 0, adGrants: 0, adGrantMax: 2 },
    revives: { mainUsed: 0, endlessUsed: 0 },
    boss: null,
    stats: { kills: 812, coins: 46, bunsEaten: 1, damageDealt: 152340, maxHit: 2410, killsByType: { paperkid: 500, shade: 312 } },
    events: [],
    // ---- 以下为 mock 私有字段（下划线开头，渲染层不会读）----
    _scene: scene,
    _rng: rng,
    _clock: 0,
    _nextId: 1,
    _hitAcc: 0,
    _killAcc: 0,
    _orbit: [],
  };
  const nid = () => run._nextId++;

  // ---------- 敌人：每种都来一群，环绕玩家 ----------
  const types = Object.keys(ENEMY_R);
  const counts = scene === 'crowd' ? { paperkid: 26, shade: 18, lanternghost: 8, weasel: 8, sedan: 3, drowned: 6 } : scene === 'boss' ? { paperkid: 10, shade: 8, lanternghost: 3, weasel: 3, sedan: 1, drowned: 3 } : { paperkid: 12, shade: 10, lanternghost: 4, weasel: 4, sedan: 2, drowned: 3 };
  for (const type of types) {
    for (let i = 0; i < counts[type]; i++) {
      const a = rng() * TAU;
      const rad = 105 + rng() * 260;
      const elite = (type === 'lanternghost' || type === 'weasel') && i === 0;
      const r = ENEMY_R[type] * (elite ? 1.3 : 1);
      const e = {
        id: nid(),
        type,
        x: Math.cos(a) * rad,
        y: Math.sin(a) * rad * 1.5,
        r,
        hp: 10,
        maxHp: 10,
        elite,
        boss: false,
        hitT: 0,
        slowT: 0,
        state: type === 'weasel' && i === 1 ? 'windup' : 'chase',
        angle: 0,
      };
      run.enemies.push(e);
      run._orbit.push({ e, a, rad, w: (0.12 + rng() * 0.18) * (rng() < 0.5 ? -1 : 1), ph: rng() * TAU });
    }
  }
  // ---------- Boss ----------
  const bd = BOSS[bossType];
  const bossPos = scene === 'crowd' ? { x: 40, y: -250 } : { x: 10, y: -190 };
  const bossE = {
    id: nid(),
    type: bossType,
    x: bossPos.x,
    y: bossPos.y,
    r: bd.r,
    hp: bd.hp * 0.62,
    maxHp: bd.hp,
    elite: false,
    boss: true,
    hitT: 0,
    slowT: 0,
    state: 'chase',
    angle: 0,
    phase: scene === 'boss' ? 2 : 1,
  };
  run.enemies.push(bossE);
  run.boss = { id: bossE.id, type: bossType, hp: bossE.hp, maxHp: bossE.maxHp, phase: bossE.phase };
  run._boss = bossE;

  // ---------- 拾取物 ----------
  for (let i = 0; i < 26; i++) {
    const a = rng() * TAU;
    const rad = 40 + rng() * 300;
    const tier = rng() < 0.6 ? 1 : rng() < 0.7 ? 2 : 3;
    run.pickups.push({ id: nid(), kind: 'xp', x: Math.cos(a) * rad, y: Math.sin(a) * rad * 1.4, value: tier * 3, tier });
  }
  run.pickups.push({ id: nid(), kind: 'coin', x: -70, y: 64, value: 1, tier: 1 });
  run.pickups.push({ id: nid(), kind: 'coin', x: -58, y: 74, value: 1, tier: 1 });
  run.pickups.push({ id: nid(), kind: 'coin', x: 96, y: -40, value: 1, tier: 1 });
  run.pickups.push({ id: nid(), kind: 'bun', x: 64, y: 96, value: 30, tier: 1 });
  run.pickups.push({ id: nid(), kind: 'banner', x: -112, y: -36, value: 0, tier: 1 });
  run.pickups.push({ id: nid(), kind: 'chest', x: 118, y: 150, value: 0, tier: 1 });

  // ---------- 场景物件 ----------
  run.props.push({ id: nid(), kind: 'lanternpost', x: -150, y: 40, r: 10, hp: 20 });
  run.props.push({ id: nid(), kind: 'lanternpost', x: 150, y: -70, r: 10, hp: 20 });
  run.props.push({ id: nid(), kind: 'well', x: -120, y: 240, r: 24, hp: undefined });
  run.props.push({ id: nid(), kind: 'arch', x: 95, y: 330, r: 30, hp: undefined });

  // ---------- 弹体：§3.1 每种 kind ----------
  const P = (kind, f) => ({ id: nid(), kind, x: 0, y: 0, r: 6, angle: 0, t: 0, life: 1, ...f });
  run.projectiles.push(P('gongPulse', { radius: 40, maxRadius: 96, life: 1.1, _period: 1.6 }));
  run.projectiles.push(P('ultPulse', { radius: 60, maxRadius: 220, life: 0.9, _period: 3.2, _t0: 0.4 }));
  if (scene === 'crowd') {
    run.weapons[1].evolved = false;
    for (let i = 0; i < 3; i++) run.projectiles.push(P('lantern', { orbitIndex: i, life: 99, r: 9 }));
  } else {
    run.projectiles.push(P('flameRing', { radius: 74, life: 99 }));
  }
  for (let i = 0; i < 3; i++) run.projectiles.push(P('talisman', { vx: 0, vy: 0, pierce: 1, life: 0.9, _period: 0.9, _t0: i * 0.3, _dir: -1.2 + i * 1.3 }));
  run.projectiles.push(P('brushArc', { radius: 84, spread: 2.2, life: 0.42, _period: 1.3, _t0: 0.1 }));
  run.projectiles.push(P('inkPool', { x: 70, y: 40, radius: 42, life: 3.5, _period: 3.5, _static: true }));
  run.projectiles.push(P('inkPool', { x: -40, y: -110, radius: 30, life: 3.5, _period: 3.5, _t0: 1.6, _static: true }));
  run.projectiles.push(P('coinsword', { vx: 0, vy: 0, returning: false, life: 1.4, _period: 1.4, _dir: 2.6 }));
  run.projectiles.push(P('coinsword', { vx: 0, vy: 0, returning: false, life: 1.4, _period: 1.4, _t0: 0.7, _dir: -0.5 }));
  for (let i = 0; i < 3; i++) run.projectiles.push(P('paperman', { targetId: 1, mode: 'charge', life: 99, _idx: i }));
  run.projectiles.push(P('firecracker', { fromX: 0, fromY: 0, toX: -130, toY: -120, life: 0.75, _period: 1.5 }));
  run.projectiles.push(P('explosion', { x: 140, y: 110, radius: 60, life: 0.5, _period: 1.5, _t0: 0.75, _static: true }));
  run.projectiles.push(P('bellChain', { points: [], life: 0.35, _period: 0.9 }));
  for (let i = 0; i < 14; i++) {
    run.projectiles.push(P('enemyBullet', { vx: 0, vy: 0, style: i % 4 === 3 ? 'ink' : 'paperMoney', life: 2.4, _period: 2.4, _t0: (i % 7) * 0.12, _dir: (i / 14) * TAU, r: 5 }));
  }

  // 初始推进一点，使所有对象处于动画中途
  stepMock(run, 0.5);
  run.events.length = 0;
  return run;
}

/** 推进 mock 动画；会生成 hit / kill 事件 */
export function stepMock(run, dt) {
  run.events.length = 0;
  run._clock += dt;
  const c = run._clock;
  const rng = run._rng;
  const p = run.player;
  // 玩家缓慢绕圈走
  const pa = c * 0.35;
  const nx = Math.cos(pa) * 40;
  const ny = Math.sin(pa) * 24;
  const dx = nx - p.x;
  const dy = ny - p.y;
  p.x = nx;
  p.y = ny;
  const l = Math.hypot(dx, dy) || 1;
  if (Math.abs(dx) > 0.001) p.facingX = dx / l;
  p.facingY = dy / l;
  p.hurtT = Math.max(0, p.hurtT - dt);
  if (run._scene !== 'hud') run.time += dt;

  for (const o of run._orbit) {
    const e = o.e;
    const rad = o.rad + Math.sin(c * 0.5 + o.ph) * 18;
    const a = o.a + c * o.w * (90 / rad);
    e.x = p.x + Math.cos(a) * rad;
    e.y = p.y + Math.sin(a) * rad * 1.5;
    e.hitT = Math.max(0, e.hitT - dt);
  }
  const b = run._boss;
  b.hitT = Math.max(0, b.hitT - dt);
  b.x += Math.sin(c * 0.7) * 0.3;

  // 弹体
  const nearest = run.enemies.slice(0, 40);
  for (const q of run.projectiles) {
    const period = q._period || q.life;
    if (q.life < 50) q.t = (c + (q._t0 || 0)) % period;
    else q.t = c;
    const k = Math.min(1, q.t / q.life);
    switch (q.kind) {
      case 'gongPulse':
        q.x = p.x;
        q.y = p.y;
        q.radius = q.maxRadius * (0.25 + 0.75 * k);
        break;
      case 'ultPulse':
        q.x = p.x;
        q.y = p.y;
        q.radius = q.maxRadius * (0.2 + 0.8 * k);
        if (q.t > q.life) q.t = q.life; // 间歇
        break;
      case 'lantern': {
        const a = c * 2.4 + (q.orbitIndex / 3) * TAU;
        q.x = p.x + Math.cos(a) * 50;
        q.y = p.y + Math.sin(a) * 50;
        break;
      }
      case 'flameRing':
        q.x = p.x;
        q.y = p.y;
        break;
      case 'talisman': {
        const a = q._dir + Math.sin(c * 2 + q.id) * 0.3;
        const d = 20 + 230 * k;
        q.x = p.x + Math.cos(a) * d;
        q.y = p.y + Math.sin(a) * d;
        q.vx = Math.cos(a) * 300;
        q.vy = Math.sin(a) * 300;
        break;
      }
      case 'brushArc':
        q.x = p.x;
        q.y = p.y;
        q.angle = Math.atan2(p.facingY, p.facingX) - 0.3;
        if (q.t > q.life) q.t = q.life;
        break;
      case 'coinsword': {
        const out = k < 0.5;
        q.returning = !out;
        const d = (out ? k * 2 : (1 - k) * 2) * 190;
        q.x = p.x + Math.cos(q._dir) * d;
        q.y = p.y + Math.sin(q._dir) * d;
        q.vx = Math.cos(q._dir) * (out ? 300 : -300);
        q.vy = Math.sin(q._dir) * (out ? 300 : -300);
        break;
      }
      case 'paperman': {
        const a = c * 0.9 + (q._idx / 3) * TAU;
        q.x = p.x + Math.cos(a) * 128;
        q.y = p.y + Math.sin(a) * 92;
        break;
      }
      case 'firecracker':
        q.fromX = p.x;
        q.fromY = p.y;
        q.x = q.fromX + (q.toX - q.fromX) * k;
        q.y = q.fromY + (q.toY - q.fromY) * k;
        if (q.t > q.life) q.t = q.life - 0.001;
        break;
      case 'explosion':
        if (q.t > q.life) q.t = q.life;
        break;
      case 'bellChain': {
        const pts = [{ x: p.x + 10, y: p.y - 10 }];
        const used = new Set();
        let cur = pts[0];
        for (let n = 0; n < 4; n++) {
          let best = null;
          let bd2 = 170 * 170;
          for (const e of run.enemies) {
            if (e.boss || used.has(e)) continue;
            const d2 = (e.x - cur.x) ** 2 + (e.y - cur.y) ** 2;
            if (d2 < bd2) {
              bd2 = d2;
              best = e;
            }
          }
          if (!best) break;
          used.add(best);
          cur = { x: best.x, y: best.y - 8 };
          pts.push(cur);
        }
        q.points = pts;
        q.x = p.x;
        q.y = p.y;
        if (q.t > q.life) q.t = q.life;
        break;
      }
      case 'enemyBullet': {
        const a = q._dir + c * 0.25;
        const d = 30 + 260 * k;
        q.x = b.x + Math.cos(a) * d;
        q.y = b.y - 30 + Math.sin(a) * d;
        q.vx = Math.cos(a) * 100;
        q.vy = Math.sin(a) * 100;
        break;
      }
      default:
        break;
    }
  }

  // 事件：命中 / 暴击 / 击杀
  run._hitAcc += dt;
  const hud = run._scene === 'hud';
  while (run._hitAcc > 0.07) {
    run._hitAcc -= 0.07;
    const e = run.enemies[Math.floor(rng() * Math.min(run.enemies.length, 60))];
    if (!e) break;
    const crit = rng() < 0.16;
    let amount = Math.round((e.boss ? 60 : 12) * (0.6 + rng() * 0.9) * (crit ? 2 : 1));
    if (hud) amount = Math.round(amount * (rng() < 0.5 ? 1200 : 3.4e6) * (crit ? 1.5 : 1));
    e.hitT = 0.12;
    run.events.push({ type: 'hit', x: e.x, y: e.y, amount, crit, enemyId: e.id, weaponId: 'talisman' });
  }
  run._killAcc += dt;
  if (run._killAcc > 0.55) {
    run._killAcc = 0;
    const e = run.enemies[Math.floor(rng() * Math.min(run.enemies.length - 1, 60))];
    if (e && !e.boss) run.events.push({ type: 'kill', x: e.x, y: e.y, enemyType: e.type, elite: e.elite, boss: false });
  }
  if (run.boss) {
    run.boss.hp = b.hp;
  }
}
