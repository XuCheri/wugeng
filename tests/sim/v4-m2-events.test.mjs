import test from 'node:test';
import assert from 'node:assert/strict';
import { createRun, stepRun, endRun, DT, WATCH_EVENT_KINDS, startWatchEvent } from '../../src/sim/run.js';
import { spawnEnemy } from '../../src/sim/enemies.js';
import { damageEnemy } from '../../src/sim/combat.js';
import { defaultSave, mergeSaves } from '../../src/meta/save.js';
import { recordRun } from '../../src/meta/unlocks.js';

function prepCleanEventRun(seed = 2026) {
  const run = createRun({ seed, heroId: 'zhou' });
  run.weapons.length = 0;
  run.enemies.length = 0;
  run.projectiles.length = 0;
  run.pickups.length = 0;
  run._bossSpawned = { horse: true, umbrella: true, youshen: true, 0: true, 1: true, 2: true };
  run._blessingWatches = { 1: true, 2: true, 3: true, 4: true, 5: true };
  run.time = 10;
  run.watch = 1;
  return run;
}

test('M2.2 每更随机异事：二更至四更按种子触发 3 场不重复异事且双端严格一致', () => {
  assert.equal(WATCH_EVENT_KINDS.length, 4);

  const r1 = prepCleanEventRun(7788);
  const r2 = prepCleanEventRun(7788);

  const seen1 = [];
  const seen2 = [];
  for (const t of [108.5, 200.5, 276.5]) {
    r1.time = t;
    r2.time = t;
    r1.watchEvent = null;
    r2.watchEvent = null;
    stepRun(r1, {}, DT);
    stepRun(r2, {}, DT);
    assert.ok(r1.watchEvent, `时刻 ${t}s 应触发异事`);
    assert.equal(r1.watchEvent.kind, r2.watchEvent.kind);
    assert.equal(r1.watchEvent.targetX, r2.watchEvent.targetX);
    seen1.push(r1.watchEvent.kind);
    seen2.push(r2.watchEvent.kind);
  }
  assert.deepEqual(seen1, seen2);
  assert.equal(new Set(seen1).size, 3, '同一局三更异事应互不重复');
});

test('M2.2 护送货郎：贴近护送至街口掉落供盒；气血耗尽判未成', () => {
  const run = prepCleanEventRun(101);
  const ev = startWatchEvent(run, 'escort_peddler');
  assert.equal(ev.kind, 'escort_peddler');

  for (let i = 0; i < Math.round(12 / DT) && run.watchEvent; i++) {
    run.enemies.length = 0;
    run.player.x = run.watchEvent.x;
    run.player.y = run.watchEvent.y;
    stepRun(run, {}, DT);
  }
  assert.equal(run.watchEvent, null, '贴近护送应在时限内抵达街口');
  assert.equal(run.stats.eventsCompleted, 1);
  assert.equal(run.watchEventResult?.ok, true);
  assert.ok(
    run.pickups.some((p) => p.kind === 'chest') || run.status === 'chest' || (run._pendingChests || 0) > 0,
    '护送礼成应掉落或立即开启供盒',
  );

  // 失败分支：货郎气血耗尽
  const failRun = prepCleanEventRun(102);
  const ev2 = startWatchEvent(failRun, 'escort_peddler');
  ev2.hp = 10;
  spawnEnemy(failRun, 'paperkid', ev2.x + 5, ev2.y, { fixedHp: 100 });
  stepRun(failRun, {}, DT);
  assert.equal(failRun.watchEvent, null);
  assert.equal(failRun.watchEventResult?.ok, false);
  assert.equal(failRun.stats.eventsCompleted, 0);
});

test('M2.2 点亮社火：依次踏亮三处社火坛净除群祟并洒下魂火', () => {
  const run = prepCleanEventRun(202);
  const ev = startWatchEvent(run, 'light_bonfires');
  assert.equal(ev.nodes.length, 3);

  const fodder = spawnEnemy(run, 'lanternghost', run.player.x + 90, run.player.y, { fixedHp: 80 });
  for (const node of ev.nodes) {
    run.player.x = node.x;
    run.player.y = node.y;
    stepRun(run, {}, DT);
  }
  assert.equal(run.watchEvent, null);
  assert.equal(run.stats.eventsCompleted, 1);
  assert.ok(fodder.dead, '点亮三坛应净除视野内普通邪祟');
  assert.ok(
    run.pickups.filter((p) => p.kind === 'xp').length >= 6 || run.player.xp > 0 || run.player.level > 1,
    '点亮三坛应洒下大量魂火',
  );
});

test('M2.2 追斩纸元宝：逃逸走位、击破获双倍铜钱并立即升阶', () => {
  const run = prepCleanEventRun(303);
  const ev = startWatchEvent(run, 'chase_ingot');
  const ingot = run.enemies.find((e) => e.id === ev.targetEnemyId);
  assert.ok(ingot && ingot.eventIngot);

  const d0 = Math.hypot(ingot.x - run.player.x, ingot.y - run.player.y);
  for (let i = 0; i < 20; i++) stepRun(run, {}, DT);
  const d1 = Math.hypot(ingot.x - run.player.x, ingot.y - run.player.y);
  assert.ok(d1 > d0, '纸元宝靠近守夜人时应疾走逃逸');

  const coinsBefore = run.stats.coins;
  const lvBefore = run.player.level;
  damageEnemy(run, ingot, ingot.hp + 50, 'gong', { noCrit: true, noProc: true });
  stepRun(run, {}, DT);

  assert.equal(run.watchEvent, null);
  assert.equal(run.stats.eventsCompleted, 1);
  assert.ok(run.stats.coins >= coinsBefore + 20, '击破纸元宝应立得双倍铜钱');
  assert.ok(run.player.level > lvBefore, '击破纸元宝应立即升阶');
});

test('M2.2 阴兵借道与存档累计：无伤避让赐回血与包子，冲撞判未成，结算写入 totalEvents', () => {
  const dodgeRun = prepCleanEventRun(404);
  dodgeRun.player.hp = Math.max(10, dodgeRun.player.maxHp - 50);
  const hpBefore = dodgeRun.player.hp;
  const ev = startWatchEvent(dodgeRun, 'ghost_parade');
  // 移至阴兵走廊法线外侧安全区
  const perpX = -ev.uy;
  const perpY = ev.ux;
  dodgeRun.player.x = ev.cx + perpX * 140;
  dodgeRun.player.y = ev.cy + perpY * 140;

  for (let i = 0; i < Math.ceil((ev.duration + 0.3) / DT) && dodgeRun.watchEvent; i++) {
    dodgeRun.enemies.length = 0;
    stepRun(dodgeRun, {}, DT);
  }
  assert.equal(dodgeRun.watchEvent, null);
  assert.equal(dodgeRun.stats.eventsCompleted, 1);
  assert.ok(dodgeRun.player.hp > hpBefore, '避开阴兵借道应恢复气血');
  assert.ok(
    dodgeRun.pickups.some((p) => p.kind === 'bun') || (dodgeRun.stats.bunsEaten || 0) >= 1,
    '避开阴兵借道应赐包子',
  );

  // 冲撞失败分支
  const hitRun = prepCleanEventRun(405);
  hitRun.player.hp = hitRun.player.maxHp = 500;
  const evHit = startWatchEvent(hitRun, 'ghost_parade');
  for (let i = 0; i < Math.ceil((evHit.duration + 0.3) / DT) && hitRun.watchEvent; i++) {
    hitRun.enemies.length = 0;
    if (hitRun.watchEvent?.soldiers?.length) {
      hitRun.player.x = hitRun.watchEvent.soldiers[0].x;
      hitRun.player.y = hitRun.watchEvent.soldiers[0].y;
    }
    stepRun(hitRun, {}, DT);
  }
  assert.equal(hitRun.stats.eventsCompleted, 0);
  assert.equal(hitRun.watchEventResult?.ok, false);

  // 结算入账与跨端合并
  const sum = endRun(dodgeRun, false);
  assert.equal(sum.eventsCompleted, 1);
  const saveA = defaultSave();
  recordRun(saveA, sum, 1000);
  assert.equal(saveA.stats.totalEvents, 1);
  const saveB = defaultSave();
  saveB.stats.totalEvents = 4;
  saveB.stats.runs = 2;
  const merged = mergeSaves(saveA, saveB);
  assert.equal(merged.stats.totalEvents, 4);
});
