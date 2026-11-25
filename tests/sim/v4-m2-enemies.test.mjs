import test from 'node:test';
import assert from 'node:assert/strict';

import { createRun, stepRun, DT } from '../../src/sim/run.js';
import { spawnEnemy, flushSpawnQueue } from '../../src/sim/enemies.js';
import { damageEnemy } from '../../src/sim/combat.js';

function disarmPlayerWeapons(run) {
  run.weapons.length = 0;
  run._spawnAcc = -999999;
}

test('M2.1 纸射手（archer_ghost）：中距立定 0.8s 蓄力显示朱砂准线，连射 3 枚扇形纸镖', () => {
  const run = createRun({ heroId: 'zhou', seed: 2101 });
  disarmPlayerWeapons(run);
  run.player.invulnT = 100;

  const ag = spawnEnemy(run, 'archer_ghost', run.player.x + 190, run.player.y, { fixedHp: 500 });
  ag._fireT = 0.05;

  // 进入瞄准态并展示预警准线
  for (let i = 0; i < 6; i++) stepRun(run, {}, DT);
  assert.equal(ag.state, 'aim');
  assert.ok(ag.telegraphLen > 200 && ag.telegraphProgress > 0, '瞄准期间应显示朱砂准线');

  // 走完 0.8s 蓄力后射出 3 枚纸镖并清除准线
  for (let i = 0; i < 55; i++) stepRun(run, {}, DT);
  const darts = run.projectiles.filter((p) => p.kind === 'enemyBullet' && p.source === 'archer_ghost');
  assert.equal(darts.length, 3, '蓄力结束应齐射 3 枚纸镖');
  assert.equal(ag.telegraphProgress, 0, '齐射后准线应清除');
});

test('M2.1 爆竹童子（firecracker_boy）：贴身 1.0s 引信灼亮后范围自爆，同时炸伤玩家与周围其他敌人；提前击杀不自爆', () => {
  const run = createRun({ heroId: 'zhou', seed: 2102 });
  disarmPlayerWeapons(run);
  run.player.invulnT = 0;
  const hp0 = run.player.hp;

  const fc = spawnEnemy(run, 'firecracker_boy', run.player.x + 36, run.player.y, { fixedHp: 500 });
  const bystander = spawnEnemy(run, 'paperkid', run.player.x + 52, run.player.y + 10, { fixedHp: 400 });

  stepRun(run, {}, DT);
  assert.equal(fc.state, 'fuse', '近身应进入引信倒计时态');

  // 推进 >1.0s 触发自爆
  for (let i = 0; i < 66; i++) stepRun(run, {}, DT);
  assert.equal(fc.dead, true, '引信结束应自爆消失');
  assert.ok(run.player.hp < hp0, '近距自爆应炸伤玩家');
  assert.ok(bystander.hp < 400, '自爆也应范围炸伤周围其他敌人');

  // 若在引信期间被玩家提前打死，不应触发自爆炸伤近旁单位
  const run2 = createRun({ heroId: 'zhou', seed: 2103 });
  disarmPlayerWeapons(run2);
  const fc2 = spawnEnemy(run2, 'firecracker_boy', run2.player.x + 36, run2.player.y, { fixedHp: 30 });
  const nearMob = spawnEnemy(run2, 'paperkid', run2.player.x + 48, run2.player.y, { fixedHp: 400 });
  stepRun(run2, {}, DT);
  assert.equal(fc2.state, 'fuse');
  damageEnemy(run2, fc2, 100, 'gong', { noCrit: true, noProc: true, knock: 0 });
  for (let i = 0; i < 70; i++) stepRun(run2, {}, DT);
  assert.equal(nearMob.hp, 400, '引信中途被击杀的爆竹童子不应自爆');
});

test('M2.1 剪纸双生（twin_paper）：本体死亡分裂 2 中体，中体死亡再分裂 2 小体，小体死亡不再分裂', () => {
  const run = createRun({ heroId: 'zhou', seed: 2104 });
  disarmPlayerWeapons(run);

  const root = spawnEnemy(run, 'twin_paper', run.player.x + 160, run.player.y, { fixedHp: 100 });
  damageEnemy(run, root, 200, 'gong', { noCrit: true, noProc: true, knock: 0 });
  flushSpawnQueue(run);

  const gen1 = run.enemies.filter((e) => !e.dead && e.type === 'twin_paper' && e.splitDepth === 1);
  assert.equal(gen1.length, 2, '第 1 次击杀应分裂出 2 只中体');
  assert.equal(gen1[0].xp, 0, '分裂子体不重复掉落经验防无限刷级');

  for (const m of gen1) {
    damageEnemy(run, m, 500, 'gong', { noCrit: true, noProc: true, knock: 0 });
  }
  flushSpawnQueue(run);

  const gen2 = run.enemies.filter((e) => !e.dead && e.type === 'twin_paper' && e.splitDepth === 2);
  assert.equal(gen2.length, 4, '2 只中体全部击杀后应分裂出 4 只小体');

  for (const s of gen2) {
    damageEnemy(run, s, 500, 'gong', { noCrit: true, noProc: true, knock: 0 });
  }
  flushSpawnQueue(run);
  const gen3 = run.enemies.filter((e) => !e.dead && e.type === 'twin_paper');
  assert.equal(gen3.length, 0, '第 2 层小体死亡后不应继续分裂');
});

test('M2.1 纸钱妖师（shaman）：远距游走，施法召唤 4 只纸扎童子并为周围敌人套上纸甲护盾', () => {
  const run = createRun({ heroId: 'zhou', seed: 2105 });
  disarmPlayerWeapons(run);
  run.player.invulnT = 100;

  const sh = spawnEnemy(run, 'shaman', run.player.x + 210, run.player.y, { fixedHp: 500 });
  const ally1 = spawnEnemy(run, 'lanternghost', sh.x + 40, sh.y, { fixedHp: 200 });
  const ally2 = spawnEnemy(run, 'shade', sh.x - 45, sh.y + 20, { fixedHp: 200 });
  assert.equal(ally1.paperArmor, 0);
  assert.equal(ally2.paperArmor, 0);

  sh._summonT = 0.05;
  for (let i = 0; i < 6; i++) stepRun(run, {}, DT);

  const kids = run.enemies.filter((e) => !e.dead && e.type === 'paperkid' && e.summoned);
  assert.equal(kids.length, 4, '纸钱妖师每次施法应召唤 4 只纸扎童子');
  assert.ok(ally1.paperArmor >= 1 && ally2.paperArmor >= 1, '周围普通敌人应获得至少 1 层纸甲护盾');
});
