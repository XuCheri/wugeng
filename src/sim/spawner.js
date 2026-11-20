// 刷怪：按 S(m) 连续累积刷普通敌人（每更不同的种类权重），按时间轴刷 Boss。
// 水鬼优先从附近的古井爬出；同屏上限 260。

import { SPAWN, ROSTER, BOSS_TIMELINE, ENDLESS, ENEMY_AI, WAVES, spawnRate } from './balance.js';
import { spawnEnemy, ringPoint } from './enemies.js';
import { spawnBoss } from './bosses.js';
import { findWell } from './props.js';

const ROSTER_LISTS = Object.fromEntries(
  Object.entries(ROSTER).map(([w, tbl]) => [w, Object.entries(tbl).map(([type, weight]) => ({ type, weight }))]),
);

/** 当前用于刷怪公式的分钟数 */
export function spawnMinutes(run) {
  if (run.mode === 'endless') {
    const k = (run.time - run._endlessStart) / 60;
    return Math.min(run._endlessStart / 60 + k, ENDLESS.rateMinuteCap);
  }
  return run.time / 60;
}

export function rosterFor(run) {
  if (run.mode === 'endless') return ROSTER_LISTS[5];
  if (run.watch === 1 && run.time >= SPAWN.watch1LateAt && ROSTER_LISTS['1b']) return ROSTER_LISTS['1b'];
  return ROSTER_LISTS[Math.min(5, run.watch)];
}

function spawnOne(run) {
  const def = run.rng.weighted(rosterFor(run));
  const type = def.type;
  const elite = run.rng.chance(run.night.eliteChance);
  let pos = null;
  if (type === 'drowned') {
    const well = findWell(run, ENEMY_AI.drowned.wellMin, ENEMY_AI.drowned.wellMax);
    if (well) pos = { x: well.x + run.rng.range(-well.r, well.r), y: well.y + run.rng.range(-well.r, well.r) };
  }
  if (!pos) pos = ringPoint(run);
  spawnEnemy(run, type, pos.x, pos.y, { elite });
}

export function updateSpawner(run, dt) {
  // Boss 时间轴（主线）
  if (run.mode === 'main') {
    for (const b of BOSS_TIMELINE) {
      if (!run._bossSpawned[b.type] && run.time >= b.time) {
        run._bossSpawned[b.type] = true;
        spawnBoss(run, b.type, { chest: b.chest, final: b.final });
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

  let rate = spawnRate(spawnMinutes(run)) * run.night.spawnMul;
  if (run.boss) rate *= run.boss.type === 'youshen' ? SPAWN.youshenSpawnMul : SPAWN.bossSpawnMul;
  run._spawnAcc += rate * dt;
  while (run._spawnAcc >= 1) {
    run._spawnAcc -= 1;
    if (run.enemies.length >= SPAWN.cap) {
      run._spawnAcc = 0; // 满员时丢弃积压，避免上限解除后瞬间刷一大片
      break;
    }
    spawnOne(run);
  }
}

/** 合围：一圈同种敌人从四周收拢（Boss 在场时暂停） */
function updateWaves(run) {
  if (!WAVES.enabled || run.boss) return;
  if (run._nextWaveT == null) run._nextWaveT = WAVES.firstAt;
  if (run.time < run._nextWaveT) return;
  run._nextWaveT = run.time + WAVES.every;
  const m = spawnMinutes(run);
  const n = Math.min(WAVES.maxCount, Math.round(WAVES.baseCount + WAVES.perMinute * m), SPAWN.cap - run.enemies.length);
  if (n <= 0) return;
  const type = WAVES.types[run.mode === 'endless' ? 5 : Math.min(5, run.watch)];
  const p = run.player;
  const a0 = run.rng.range(0, Math.PI * 2);
  for (let i = 0; i < n; i++) {
    const a = a0 + (i / n) * Math.PI * 2;
    spawnEnemy(run, type, p.x + Math.cos(a) * WAVES.radius, p.y + Math.sin(a) * WAVES.radius);
  }
  run.events.push({ type: 'wave', count: n, enemyType: type });
}
