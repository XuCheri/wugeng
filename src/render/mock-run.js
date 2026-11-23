// mock-run.js —— 风格检查用的假 RunState（对齐 M1/M2 全量新精灵、奇遇、羁绊、预警与 22 种弹体）
// 仅供 style-lab.html 与渲染预览使用，不参与正式逻辑。
import { makeRng } from './ink.js';

const TAU = Math.PI * 2;
const DARK = [0, 0.18, 0.34, 0.5, 0.66, 0.84, 0];
const ENEMY_R = {
  paperkid: 11,
  shade: 10,
  lanternghost: 15,
  weasel: 12,
  sedan: 20,
  drowned: 13,
  suona: 14,
  paperbride: 13,
  cinder: 12,
};
const BOSS = {
  horse: { r: 30, hp: 1800 },
  umbrella: { r: 28, hp: 6000 },
  youshen: { r: 40, hp: 24000 },
};

/**
 * @param {{watch?:number, scene?:'crowd'|'boss'|'hud', seed?:number, hero?:string, boss?:string, awakened?:boolean}} o
 */
export function createMockRun(o = {}) {
  const watch = Math.max(1, Math.min(6, o.watch || 3));
  const scene = o.scene || 'crowd';
  const seed = o.seed || 20261120;
  const rng = makeRng(seed);
  const hud = scene === 'hud';
  const isBossScene = scene === 'boss';
  const isDawn = watch >= 6 && !hud;
  const bossType = o.boss || (isBossScene ? 'horse' : hud ? 'umbrella' : 'youshen');
  const time = hud ? 25 * 60 + 20 : isDawn ? 600 : (watch - 1) * 120 + 72;

  const fullAwakened = !!o.awakened || hud;
  const evolvedCrowd = fullAwakened || watch === 3;

  const run = {
    seed,
    heroId: o.hero || 'zhou',
    nightLevel: hud ? 3 : 0,
    time,
    watch,
    mode: hud ? 'endless' : 'main',
    status: isDawn ? 'cleared' : 'playing',
    darkness: hud ? 0.62 : DARK[watch],
    mods: {
      lightRadius: fullAwakened ? 136 : 118,
    },
    player: {
      x: 0,
      y: 0,
      r: 12,
      hp: hud ? 28 : 96,
      maxHp: 120,
      armor: 2,
      speed: 125,
      level: hud ? 58 : 18,
      xp: hud ? 410 : 46,
      xpNext: hud ? 520 : 71,
      facingX: 1,
      facingY: 0,
      moving: true,
      ult: hud ? 100 : 72,
      ultMax: 100,
      invulnT: 0,
      hurtT: 0,
      soulBarrier: fullAwakened ? 2 : 0,
      heroId: o.hero || 'zhou',
    },
    enemies: [],
    projectiles: [],
    pickups: [],
    props: [],
    shrines: [
      { id: 901, kind: 'altar', x: -124, y: -165, r: 24, used: watch === 5, active: false, timer: 0, maxTimer: 0 },
      { id: 902, kind: 'trial', x: 340, y: -20, r: 24, used: false, active: isBossScene, timer: 12.4, maxTimer: 18 },
      { id: 903, kind: 'peddler', x: -320, y: 210, r: 24, used: false, active: false, timer: 0, maxTimer: 0 },
    ],
    nearbyShrine: null,
    weapons: isBossScene
      ? [
          { id: 'gong', level: 4, evolved: false, cd: 0.4 },
          { id: 'talisman', level: 4, evolved: false, cd: 0.2 },
          { id: 'compass', level: 3, evolved: false, cd: 0.5 },
        ]
      : [
          { id: 'talisman', level: 5, evolved: evolvedCrowd, cd: 0.1 },
          { id: 'brush', level: 5, evolved: fullAwakened, cd: 0.2 },
          { id: 'bronze_mirror', level: 5, evolved: fullAwakened, cd: 0 },
          { id: 'paperhorse', level: 4, evolved: hud, cd: 0.3 },
        ],
    relics: [
      { id: 'bagua', level: 4 },
      { id: 'fivecoins', level: 3 },
      { id: 'soulwick', level: 5 },
      { id: 'strawshoes', level: 2 },
    ],
    synergies: {
      counts: { daofa: 4, yangyan: 2, zhizha: 2, zhenhun: 1 },
      active: [
        { tag: 'daofa', tier: 4, name: '道法自然', summary: '' },
        { tag: 'yangyan', tier: 2, name: '阳炎炽盛', summary: '' },
        ...(hud ? [{ tag: 'zhizha', tier: 2, name: '纸扎通灵', summary: '' }] : []),
      ],
    },
    blessings: [
      { id: 'thunder_grace', stacks: 1 },
      ...(hud ? [{ id: 'crimson_oath', stacks: 1 }] : []),
    ],
    choices: null,
    rerolls: { free: 2, ad: 0, adGrants: 0, adGrantMax: 2 },
    revives: { mainUsed: 0, endlessUsed: 0 },
    boss: null,
    stats: { kills: 812, coins: 46, bunsEaten: 1, damageDealt: 152340, maxHit: 2410, killsByType: { paperkid: 500, shade: 312 } },
    events: [],
    _scene: scene,
    _rng: rng,
    _clock: 0,
    _nextId: 1,
    _hitAcc: 0,
    _killAcc: 0,
    _orbit: [],
  };
  const nid = () => run._nextId++;

  // ---------- 9 种普通敌人 + 精英词缀 + 小头目 ----------
  const types = Object.keys(ENEMY_R);
  const counts =
    scene === 'crowd'
      ? { paperkid: 14, shade: 10, lanternghost: 5, weasel: 5, sedan: 2, drowned: 4, suona: 3, paperbride: 4, cinder: 4 }
      : isBossScene
      ? { paperkid: 6, shade: 6, lanternghost: 2, weasel: 4, sedan: 1, drowned: 2, suona: 2, paperbride: 2, cinder: 2 }
      : { paperkid: 8, shade: 6, lanternghost: 3, weasel: 3, sedan: 1, drowned: 2, suona: 2, paperbride: 2, cinder: 2 };

  const affixes = ['paper_armor', 'swift_step', 'soul_fire', 'mirror_twin', 'treasure_bearer'];
  let affixIdx = 0;

  for (const type of types) {
    const n = counts[type] || 2;
    for (let i = 0; i < n; i++) {
      const a = rng() * TAU;
      const rad = 108 + rng() * 230;
      const elite = i === 0 && (type === 'paperbride' || type === 'suona' || type === 'weasel' || type === 'cinder' || type === 'lanternghost');
      const warder = scene === 'crowd' && type === 'sedan' && i === 0;
      const r = ENEMY_R[type] * (warder ? 1.35 : elite ? 1.25 : 1);
      const isWindupWeasel = type === 'weasel' && i === 1;
      const ex = Math.cos(a) * rad;
      const ey = Math.sin(a) * rad * 1.35;
      const dLen = Math.hypot(-ex, -ey) || 1;
      const e = {
        id: nid(),
        type,
        x: ex,
        y: ey,
        r,
        hp: 10,
        maxHp: 10,
        elite: elite || warder,
        affix: elite ? affixes[affixIdx++ % affixes.length] : null,
        paperArmor: 3,
        warder,
        warderName: warder ? '巡街轿头' : null,
        boss: false,
        hitT: 0,
        slowT: type === 'drowned' ? 0.5 : 0,
        yangyanMarkT: i === 2 ? 1.2 : 0,
        stunT: 0,
        state: isWindupWeasel ? 'pause' : 'move',
        dx: -ex / dLen,
        dy: -ey / dLen,
        telegraphProgress: isWindupWeasel ? 0.68 : 0,
        telegraphLen: isWindupWeasel ? 155 : 0,
        telegraphWidth: isWindupWeasel ? 26 : 0,
        angle: Math.atan2(-ey, -ex),
      };
      run.enemies.push(e);
      run._orbit.push({ e, a, rad, w: (0.11 + rng() * 0.16) * (rng() < 0.5 ? -1 : 1), ph: rng() * TAU });
    }
  }

  // ---------- Boss ----------
  const bd = BOSS[bossType] || BOSS.horse;
  const bossPos = isBossScene ? { x: -18, y: -225 } : scene === 'crowd' ? { x: 46, y: -245 } : { x: 14, y: -185 };
  const bLen = Math.hypot(-bossPos.x, -bossPos.y) || 1;
  const bossWindup = isBossScene && (bossType === 'horse' || bossType === 'youshen');
  const bossE = {
    id: nid(),
    type: bossType,
    x: bossPos.x,
    y: bossPos.y,
    r: bd.r,
    hp: bd.hp * 0.64,
    maxHp: bd.hp,
    elite: false,
    boss: true,
    hitT: 0,
    slowT: 0,
    state: bossType === 'umbrella' ? (hud ? 'shield' : 'open') : bossWindup ? 'windup' : 'chase',
    dx: -bossPos.x / bLen,
    dy: -bossPos.y / bLen,
    telegraphProgress: bossWindup ? 0.74 : 0,
    telegraphLen: bossWindup ? 264 : 0,
    telegraphWidth: bossWindup ? 60 : 0,
    angle: Math.atan2(-bossPos.y, -bossPos.x),
    phase: isBossScene ? 2 : 1,
  };
  run.enemies.push(bossE);
  run.boss = { id: bossE.id, type: bossType, hp: bossE.hp, maxHp: bossE.maxHp, phase: bossE.phase };
  run._boss = bossE;

  // ---------- 拾取物 ----------
  for (let i = 0; i < 20; i++) {
    const a = rng() * TAU;
    const rad = 45 + rng() * 280;
    const tier = rng() < 0.6 ? 1 : rng() < 0.7 ? 2 : 3;
    run.pickups.push({ id: nid(), kind: 'xp', x: Math.cos(a) * rad, y: Math.sin(a) * rad * 1.3, value: tier * 3, tier });
  }
  run.pickups.push({ id: nid(), kind: 'coin', x: -70, y: 64, value: 1, tier: 1 });
  run.pickups.push({ id: nid(), kind: 'bun', x: 64, y: 96, value: 30, tier: 1 });
  run.pickups.push({ id: nid(), kind: 'banner', x: -112, y: 36, value: 0, tier: 1 });
  run.pickups.push({ id: nid(), kind: 'chest', x: 114, y: 146, value: 0, tier: 1 });

  // ---------- 场景物件 ----------
  run.props.push({ id: nid(), kind: 'lanternpost', x: -152, y: 42, r: 10, hp: 20 });
  run.props.push({ id: nid(), kind: 'lanternpost', x: 152, y: -68, r: 10, hp: 20 });
  run.props.push({ id: nid(), kind: 'well', x: -120, y: 245, r: 24, hp: undefined });
  run.props.push({ id: nid(), kind: 'arch', x: 95, y: 330, r: 30, hp: undefined });

  // ---------- 弹体与法阵 ----------
  const P = (kind, f) => ({ id: nid(), kind, x: 0, y: 0, r: 6, angle: 0, t: 0, life: 1, ...f });
  run.projectiles.push(P('gongPulse', { radius: 54, maxRadius: 115, evolved: evolvedCrowd, waveIdx: 3, life: 1.1, _period: 1.6 }));
  if (!isBossScene) {
    run.projectiles.push(P('ultPulse', { radius: 85, maxRadius: 210, life: 0.9, _period: 3.2, _t0: 0.4 }));
    run.projectiles.push(P('talismanArray', { x: 68, y: -96, radius: 92, evolved: true, life: 2.2, _period: 2.2, _static: true }));
    run.projectiles.push(P('compassField', { x: -82, y: 92, radius: 78, evolved: true, life: 2.4, _period: 2.4, _static: true }));
    run.projectiles.push(P('mirrorBeam', { x: 0, y: 0, angle: -0.45, length: 245, width: 26, evolved: true, life: 1.4, _period: 1.4 }));
    run.projectiles.push(P('inkWave', { x: 90, y: 24, angle: 0.25, radius: 28, evolved: true, life: 0.9, _period: 0.9, _dir: 0.25 }));
    run.projectiles.push(P('soulSweep', { x: 0, y: 0, radius: 118, spread: 2.4, angle: 2.5, evolved: true, life: 0.45, _period: 1.2 }));
    run.projectiles.push(P('paperHorse', { x: -60, y: -40, angle: -0.4, evolved: true, life: 1.1, _period: 1.1, _dir: -0.4 }));
    run.projectiles.push(P('thunderBolt', { x: -56, y: -135, radius: 56, evolved: true, life: 0.42, _period: 1.5, _static: true }));
    run.projectiles.push(P('flameRing', { radius: 86, innerRadius: 48, dualLotus: true, evolved: true, persistent: true, life: 1 }));
  } else {
    for (let i = 0; i < 3; i++) run.projectiles.push(P('lantern', { orbitIndex: i, persistent: true, life: 1, r: 9 }));
    run.projectiles.push(P('cinderCore', { x: 76, y: 62, radius: 68, life: 0.9, _period: 1.4, _static: true }));
  }
  for (let i = 0; i < 3; i++) run.projectiles.push(P('talisman', { vx: 0, vy: 0, evolved: evolvedCrowd, pierce: 1, life: 0.9, _period: 0.9, _t0: i * 0.3, _dir: -1.2 + i * 1.3 }));
  run.projectiles.push(P('brushArc', { radius: 96, spread: evolvedCrowd ? 5.6 : 2.2, evolved: evolvedCrowd, life: 0.42, _period: 1.3, _t0: 0.1 }));
  run.projectiles.push(P('inkPool', { x: 74, y: 58, radius: 42, subKind: 'emberZone', evolved: true, life: 3.5, _period: 3.5, _static: true }));
  run.projectiles.push(P('inkPool', { x: -54, y: -96, radius: 34, subKind: 'inkRiver', evolved: true, life: 3.5, _period: 3.5, _t0: 1.4, _static: true }));
  run.projectiles.push(P('coinsword', { vx: 0, vy: 0, evolved: evolvedCrowd, returning: false, life: 1.4, _period: 1.4, _dir: 2.6 }));
  for (let i = 0; i < 3; i++) {
    const role = i === 0 ? 'guard' : i === 1 ? 'cavalry' : 'seeker';
    run.projectiles.push(P('paperman', { role, mode: role === 'cavalry' ? 'charge' : 'follow', evolved: evolvedCrowd, persistent: true, life: 1, _idx: i }));
  }
  run.projectiles.push(P('firecracker', { fromX: 0, fromY: 0, toX: -125, toY: -115, evolved: evolvedCrowd, life: 0.75, _period: 1.5 }));
  run.projectiles.push(P('explosion', { x: 132, y: 106, radius: 58, evolved: evolvedCrowd, subKind: 'firecrackerLotus', life: 0.5, _period: 1.5, _t0: 0.75, _static: true }));
  run.projectiles.push(P('bellChain', { points: [], evolved: evolvedCrowd, life: 0.35, _period: 0.9 }));
  run.projectiles.push(P('talismanChain', { points: [{ x: 18, y: -32 }, { x: 68, y: -96 }, { x: 112, y: -74 }], evolved: true, life: 0.35, _period: 0.85, _static: true }));
  for (let i = 0; i < 10; i++) {
    const style = i % 3 === 0 ? 'soulFire' : i % 4 === 3 ? 'ink' : 'paperMoney';
    run.projectiles.push(P('enemyBullet', { vx: 0, vy: 0, style, life: 2.4, _period: 2.4, _t0: (i % 7) * 0.12, _dir: (i / 10) * TAU, r: 5 }));
  }

  stepMock(run, 0.5);
  run.events.length = 0;
  return run;
}

/** 推进 mock 动画 */
export function stepMock(run, dt) {
  run.events.length = 0;
  run._clock += dt;
  const c = run._clock;
  const rng = run._rng;
  const p = run.player;

  const pa = c * 0.32;
  const nx = Math.cos(pa) * 28;
  const ny = Math.sin(pa) * 18;
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
    if (e.type === 'weasel' && e.state === 'pause') {
      const dl = Math.hypot(p.x - e.x, p.y - e.y) || 1;
      e.dx = (p.x - e.x) / dl;
      e.dy = (p.y - e.y) / dl;
      e.telegraphProgress = 0.45 + 0.45 * ((c * 1.1) % 1);
      continue;
    }
    const rad = o.rad + Math.sin(c * 0.5 + o.ph) * 16;
    const a = o.a + c * o.w * (90 / rad);
    e.x = p.x + Math.cos(a) * rad;
    e.y = p.y + Math.sin(a) * rad * 1.35;
    e.hitT = Math.max(0, e.hitT - dt);
  }
  const b = run._boss;
  b.hitT = Math.max(0, b.hitT - dt);
  if (b.state === 'windup') {
    const dl = Math.hypot(p.x - b.x, p.y - b.y) || 1;
    b.dx = (p.x - b.x) / dl;
    b.dy = (p.y - b.y) / dl;
    b.telegraphProgress = 0.55 + 0.35 * Math.sin(c * 2.2) * 0.5 + 0.15;
    b.telegraphX = b.x + b.dx * b.telegraphLen;
    b.telegraphY = b.y + b.dy * b.telegraphLen;
  } else {
    b.x += Math.sin(c * 0.7) * 0.3;
  }

  for (const q of run.projectiles) {
    const period = q._period || q.life;
    if (!q.persistent && q.life < 50) q.t = (c + (q._t0 || 0)) % period;
    else q.t = c % 1;
    const k = Math.min(1, q.t / Math.max(0.01, q.life));
    switch (q.kind) {
      case 'gongPulse':
      case 'ultPulse':
        q.x = p.x;
        q.y = p.y;
        q.radius = q.maxRadius * (0.25 + 0.75 * k);
        if (q.t > q.life) q.t = q.life;
        break;
      case 'lantern': {
        const a = c * 2.4 + (q.orbitIndex / 3) * TAU;
        q.x = p.x + Math.cos(a) * 52;
        q.y = p.y + Math.sin(a) * 52;
        break;
      }
      case 'flameRing':
      case 'soulSweep':
        q.x = p.x;
        q.y = p.y;
        if (q.kind === 'soulSweep' && q.t > q.life) q.t = q.life;
        break;
      case 'mirrorBeam': {
        q.x = p.x;
        q.y = p.y;
        q.angle = -0.55 + Math.sin(c * 1.8) * 0.45;
        q.endX = q.x + Math.cos(q.angle) * q.length;
        q.endY = q.y + Math.sin(q.angle) * q.length;
        break;
      }
      case 'talisman':
      case 'inkWave':
      case 'paperHorse': {
        const a = (q._dir || 0) + (q.kind === 'talisman' ? Math.sin(c * 2 + q.id) * 0.25 : 0);
        const d = 24 + 210 * k;
        q.x = p.x + Math.cos(a) * d;
        q.y = p.y + Math.sin(a) * d;
        q.angle = a;
        q.vx = Math.cos(a) * 320;
        q.vy = Math.sin(a) * 320;
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
        q.angle = c * 14;
        const d = (out ? k * 2 : (1 - k) * 2) * 185;
        q.x = p.x + Math.cos(q._dir) * d;
        q.y = p.y + Math.sin(q._dir) * d;
        q.vx = Math.cos(q._dir) * (out ? 300 : -300);
        q.vy = Math.sin(q._dir) * (out ? 300 : -300);
        break;
      }
      case 'paperman': {
        const rad = q.role === 'guard' ? 42 : 118;
        const a = c * (q.role === 'guard' ? 1.8 : 0.95) + (q._idx / 3) * TAU;
        q.x = p.x + Math.cos(a) * rad;
        q.y = p.y + Math.sin(a) * (rad * 0.76);
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
      case 'thunderBolt':
      case 'cinderCore':
      case 'talismanChain':
        if (q.t > q.life) q.t = q.life;
        break;
      case 'bellChain': {
        const pts = [{ x: p.x + 10, y: p.y - 10 }];
        const used = new Set();
        let cur = pts[0];
        for (let n = 0; n < 4; n++) {
          let best = null;
          let bd2 = 175 * 175;
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
        const d = 30 + 250 * k;
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

  run._hitAcc += dt;
  const hud = run._scene === 'hud';
  while (run._hitAcc > 0.08) {
    run._hitAcc -= 0.08;
    const e = run.enemies[Math.floor(rng() * Math.min(run.enemies.length, 50))];
    if (!e) break;
    const crit = rng() < 0.18;
    let amount = Math.round((e.boss ? 60 : 14) * (0.6 + rng() * 0.9) * (crit ? 2 : 1));
    if (hud) amount = Math.round(amount * (rng() < 0.5 ? 1200 : 3.4e6) * (crit ? 1.5 : 1));
    e.hitT = 0.12;
    run.events.push({ type: 'hit', x: e.x, y: e.y, amount, crit, enemyId: e.id, weaponId: 'talisman' });
  }
  run._killAcc += dt;
  if (run._killAcc > 0.65) {
    run._killAcc = 0;
    const e = run.enemies[Math.floor(rng() * Math.min(run.enemies.length - 1, 50))];
    if (e && !e.boss) run.events.push({ type: 'kill', x: e.x, y: e.y, enemyType: e.type, elite: e.elite, boss: false });
  }
  if (run.boss) {
    run.boss.hp = b.hp;
  }
}
