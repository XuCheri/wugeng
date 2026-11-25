// 刷怪：按 S(m) 连续累积刷普通敌人（每更不同的种类权重），按时间轴刷巡更小头目与 Boss。

import {
  SPAWN, ROSTER, BOSS_TIMELINE, MINI_WARDERS,
  HEDENG_ROSTER, HEDENG_BOSS_TIMELINE, HEDENG_MINI_WARDERS,
  ENDLESS, ENEMY_AI, WAVES, ELITE, spawnRate, designMinutes,
} from './balance.js';
import { fsin, fcos, fatan2 } from '../core/math.js';
import { spawnEnemy, ringPoint } from './enemies.js';
import { spawnBoss } from './bosses.js';
import { findWell } from './props.js';
import { coopSpawnScale, coopPartySize, nearestLivingPlayer } from './coop.js';

function spawnAnchorPlayer(run) {
  return run.player?.downed && coopPartySize(run) > 1
    ? nearestLivingPlayer(run, run.player.x, run.player.y)
    : run.player;
}

const ROSTER_LISTS = Object.fromEntries(
  Object.entries(ROSTER).map(([w, tbl]) => [w, Object.entries(tbl).map(([type, weight]) => ({ type, weight }))]),
);
const HEDENG_ROSTER_LISTS = Object.fromEntries(
  Object.entries(HEDENG_ROSTER).map(([w, tbl]) => [w, Object.entries(tbl).map(([type, weight]) => ({ type, weight }))]),
);

/** 当前用于刷怪公式的设计分钟数（按 PACE 换算，保证 7 分钟曲线形状与原 10 分钟一致） */
export function spawnMinutes(run) {
  if (run.mode === 'endless') {
    const k = (run.time - run._endlessStart) / 60;
    return Math.min(designMinutes(run._endlessStart) + k, ENDLESS.rateMinuteCap);
  }
  return designMinutes(run.time);
}

export function rosterFor(run) {
  const lists = run.mapId === 'hedeng' ? HEDENG_ROSTER_LISTS : ROSTER_LISTS;
  if (run.mode === 'endless') return lists[5];
  if (run.watch === 1 && run.time >= SPAWN.watch1LateAt && lists['1b']) return lists['1b'];
  if (run.watch === 2 && run.time >= SPAWN.watch2LateAt && lists['2b']) return lists['2b'];
  if (run.watch === 3 && run.time >= SPAWN.watch3LateAt && lists['3b']) return lists['3b'];
  return lists[Math.min(5, run.watch)];
}

function tri(rng, half) {
  return (rng.range(-half, half) + rng.range(-half, half)) * 0.5;
}

/** 维护随时间缓慢偏转的两条「巷口阴风」来向，让日常刷怪有街巷涌入的疏密感 */
function ensureAlleyFlow(run, dt) {
  let flow = run._alleyFlow;
  if (!flow) {
    const a1 = run.rng.range(0, Math.PI * 2);
    flow = {
      t: run.rng.range(7, 11),
      a1,
      a2: a1 + run.rng.range(1.65, 2.75),
    };
    run._alleyFlow = flow;
  }
  flow.t -= dt;
  if (flow.t <= 0) {
    flow.t = run.rng.range(7.5, 12.5);
    flow.a1 += run.rng.range(-1.35, 1.35);
    flow.a2 = flow.a1 + (run.rng.chance(0.5) ? 1 : -1) * run.rng.range(1.55, 2.75);
  }
  return flow;
}

function ambientSpawnPoint(run) {
  const rng = run.rng;
  const p = spawnAnchorPlayer(run);
  const flow = run._alleyFlow || ensureAlleyFlow(run, 0);
  const roll = rng.next();
  let a;
  let d;
  if (roll < 0.54) {
    const base = rng.chance(0.58) ? flow.a1 : flow.a2;
    a = base + tri(rng, 0.62);
    d = rng.range(SPAWN.ringMin - 20, SPAWN.ringMax + 65);
  } else if (roll < 0.80 && p.moving) {
    a = fatan2(p.facingY, p.facingX) + tri(rng, 1.18);
    d = rng.range(SPAWN.ringMin - 10, SPAWN.ringMax + 55);
  } else {
    a = rng.range(0, Math.PI * 2);
    d = rng.range(SPAWN.ringMin - 15, SPAWN.ringMax + 75);
  }
  return {
    x: p.x + fcos(a) * d + rng.range(-24, 24),
    y: p.y + fsin(a) * d + rng.range(-24, 24),
  };
}

function spawnOne(run) {
  const def = run.rng.weighted(rosterFor(run));
  const type = def.type;
  const m = spawnMinutes(run);
  const baseElite = run.night.eliteChance + (ELITE.perMinute || 0) * Math.max(0, m - 2);
  const eliteChance = Math.min(0.48, baseElite * (run.mods?.eliteChanceMul || 1));
  const elite = run.rng.chance(eliteChance);
  let pos = null;
  if (type === 'drowned') {
    const well = findWell(run, ENEMY_AI.drowned.wellMin, ENEMY_AI.drowned.wellMax, spawnAnchorPlayer(run));
    if (well) pos = { x: well.x + run.rng.range(-well.r, well.r), y: well.y + run.rng.range(-well.r, well.r) };
  }
  if (!pos) pos = ambientSpawnPoint(run);
  spawnEnemy(run, type, pos.x, pos.y, { elite });
}

export function updateSpawner(run, dt) {
  ensureAlleyFlow(run, dt);

  // 主线：巡更小头目与 Boss 时间轴（河灯水口切换专属巡江头目与河神夜婚终局）
  if (run.mode === 'main') {
    const warderList = run.mapId === 'hedeng' ? HEDENG_MINI_WARDERS : MINI_WARDERS;
    const bossTimeline = run.mapId === 'hedeng' ? HEDENG_BOSS_TIMELINE : BOSS_TIMELINE;
    if (!run._warderSpawned) run._warderSpawned = {};
    for (const mw of warderList) {
      if (!run._warderSpawned[mw.id] && run.time >= mw.time) {
        run._warderSpawned[mw.id] = true;
        // 若被测试脚本大跨度跳转时间（超过 30 秒），跳过过时小头目
        if (run.time - mw.time <= 30) {
          const pt = ringPoint(run, 340, 410, true, spawnAnchorPlayer(run));
          spawnEnemy(run, mw.type, pt.x, pt.y, {
            elite: true,
            affix: mw.affix,
            hpMul: mw.hpMul,
            rMul: mw.rMul,
            warder: true,
            warderName: mw.name,
            chest: mw.chest,
          });
          run.events.push({
            type: 'warderSpawn',
            warderId: mw.id,
            enemyType: mw.type,
            name: mw.name,
            x: pt.x,
            y: pt.y,
          });
        }
      }
    }

    for (const b of bossTimeline) {
      const key = b.id || b.type;
      if (!run._bossSpawned[key] && !run._bossSpawned[b.type] && run.time >= b.time) {
        run._bossSpawned[key] = true;
        if (!b.id) run._bossSpawned[b.type] = true;
        spawnBoss(run, b.type, {
          chest: b.chest,
          final: b.final,
          hpMulOverride: b.hpMulOverride,
        });
      }
    }
  } else {
    // 无尽：每隔一段时间轮换一只夜主，掉供盒
    run._endlessBossT -= dt;
    if (run._endlessBossT <= 0) {
      run._endlessBossT = ENDLESS.bossEvery;
      const type = ENDLESS.bossCycle[run._endlessBossIdx++ % ENDLESS.bossCycle.length];
      spawnBoss(run, type, { chest: true });
    }
  }

  updateWaves(run);

  let rate = spawnRate(spawnMinutes(run)) * run.night.spawnMul * (run.mods?.spawnRateMul || 1) * coopSpawnScale(run);
  if (run.boss) {
    rate *= (run.boss.type === 'youshen' || run.boss.type === 'hebo_wedding')
      ? SPAWN.youshenSpawnMul
      : SPAWN.bossSpawnMul;
  }
  run._spawnAcc += rate * dt;
  while (run._spawnAcc >= 1) {
    run._spawnAcc -= 1;
    if (run.enemies.length >= SPAWN.cap) {
      run._spawnAcc = 0;
      break;
    }
    spawnOne(run);
  }
}

/** 鬼潮来袭：采用巷口群涌、斜街包抄、夜雾散祟三种不规则阵势，彻底告别机械正圆围圈 */
function updateWaves(run) {
  if (!WAVES.enabled || run.boss) return;
  if (run._nextWaveT == null) run._nextWaveT = WAVES.firstAt;
  if (run.time < run._nextWaveT) return;
  const rng = run.rng;
  run._nextWaveT = run.time + WAVES.every * rng.range(0.9, 1.1);
  const m = spawnMinutes(run);
  const waveScale = coopSpawnScale(run);
  const n = Math.min(
    Math.round(WAVES.maxCount * waveScale),
    Math.round((WAVES.baseCount + WAVES.perMinute * m) * waveScale),
    SPAWN.cap - run.enemies.length,
  );
  if (n <= 0) return;

  const mainType = WAVES.types[run.mode === 'endless' ? 5 : Math.min(5, run.watch)];
  const roster = rosterFor(run);
  const pickWaveType = () => (rng.chance(0.78) ? mainType : rng.weighted(roster).type);

  const p = spawnAnchorPlayer(run);
  const heading = p.moving ? fatan2(p.facingY, p.facingX) : rng.range(0, Math.PI * 2);
  const R = WAVES.radius;
  const styleRoll = rng.next();
  let pattern = 'alley';

  if (styleRoll < 0.45) {
    pattern = 'alley';
    const three = n >= 24 && rng.chance(0.45);
    const a0 = heading + rng.range(-0.85, 0.85);
    const dirs = three
      ? [a0, a0 + rng.range(1.35, 1.95), a0 - rng.range(1.4, 2.05)]
      : [a0, a0 + (rng.chance(0.5) ? 1 : -1) * rng.range(1.65, 2.65)];
    const shares = three ? [0.46, 0.32, 0.22] : [0.58, 0.42];
    let spawned = 0;
    for (let c = 0; c < dirs.length; c++) {
      const cnt = c === dirs.length - 1 ? n - spawned : Math.max(2, Math.round(n * shares[c]));
      spawned += cnt;
      const baseA = dirs[c];
      const baseD = R * rng.range(0.88, 1.06);
      for (let i = 0; i < cnt; i++) {
        const a = baseA + tri(rng, 0.38);
        const d = baseD + i * rng.range(3.2, 7.5) + rng.range(-18, 36);
        const x = p.x + fcos(a) * d + rng.range(-24, 24);
        const y = p.y + fsin(a) * d + rng.range(-24, 24);
        spawnEnemy(run, pickWaveType(), x, y);
      }
    }
  } else if (styleRoll < 0.76) {
    pattern = 'flank';
    const axis = heading + rng.range(-0.7, 0.7);
    const flanks = [axis + rng.range(-0.45, 0.35), axis + rng.range(2.35, 3.25)];
    for (let i = 0; i < n; i++) {
      const side = i < Math.ceil(n * 0.56) ? flanks[0] : flanks[1];
      const knot = (i % 2 === 0 ? -1 : 1) * rng.range(0.08, 0.36);
      const a = side + knot + tri(rng, 0.26);
      const d = R * rng.range(0.86, 1.36);
      const x = p.x + fcos(a) * d + rng.range(-26, 26);
      const y = p.y + fsin(a) * d + rng.range(-26, 26);
      spawnEnemy(run, pickWaveType(), x, y);
    }
  } else {
    pattern = 'packs';
    const packs = n >= 28 ? rng.int(4, 5) : rng.int(3, 4);
    const anchors = [];
    let curA = rng.range(0, Math.PI * 2);
    for (let k = 0; k < packs; k++) {
      curA += rng.range(0.85, 1.85);
      const dist = R * rng.range(0.88, 1.40);
      anchors.push({ x: p.x + fcos(curA) * dist, y: p.y + fsin(curA) * dist });
    }
    for (let i = 0; i < n; i++) {
      const anc = anchors[i % packs];
      const oa = rng.range(0, Math.PI * 2);
      const od = rng.range(10, 64);
      spawnEnemy(run, pickWaveType(), anc.x + fcos(oa) * od, anc.y + fsin(oa) * od);
    }
  }
  run.events.push({ type: 'wave', count: n, enemyType: mainType, pattern });
}
