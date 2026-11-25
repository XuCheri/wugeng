import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultSave } from '../../src/meta/save.js';
import { evaluateUnlocks, recordRun, grantDoubleCoins, DAOTONG_TIME } from '../../src/meta/unlocks.js';
import { MAIN_DURATION } from '../../src/sim/balance.js';

const summary = (o = {}) => ({
  heroId: 'zhou', nightLevel: 0, cleared: false, mode: 'main', timeSec: 210, reachedWatch: 3,
  level: 12, kills: 200, coins: 100, bunsEaten: 1, maxHit: 400, killsByType: {}, weapons: [], relics: [],
  ...o,
});

test('阿绵：单局 800 杀', () => {
  const s = defaultSave();
  assert.deepEqual(evaluateUnlocks(s, summary({ kills: 799 })), []);
  assert.deepEqual(evaluateUnlocks(s, summary({ kills: 800 })), [{ kind: 'hero', id: 'mian' }]);
  assert.ok(s.unlockedHeroes.includes('mian'));
  assert.deepEqual(evaluateUnlocks(s, summary({ kills: 900 })), [], '不重复解锁');
});

test('小道童：不吃包子守到五更起点（5:36）', () => {
  const s = defaultSave();
  assert.deepEqual(evaluateUnlocks(s, summary({ timeSec: DAOTONG_TIME, bunsEaten: 1 })), []);
  assert.deepEqual(evaluateUnlocks(s, summary({ timeSec: DAOTONG_TIME - 0.1, bunsEaten: 0 })), []);
  assert.deepEqual(evaluateUnlocks(s, summary({ timeSec: DAOTONG_TIME, bunsEaten: 0 })), [{ kind: 'hero', id: 'daotong' }]);
});

test('小道童：firstBunTime 优先，五更起点后吃包子不算破戒', () => {
  const fresh = () => defaultSave();
  const hit = [{ kind: 'hero', id: 'daotong' }];
  assert.deepEqual(evaluateUnlocks(fresh(), summary({ timeSec: MAIN_DURATION, bunsEaten: 0, firstBunTime: null })), hit);
  assert.deepEqual(evaluateUnlocks(fresh(), summary({ timeSec: MAIN_DURATION, bunsEaten: 3, firstBunTime: DAOTONG_TIME })), hit);
  assert.deepEqual(evaluateUnlocks(fresh(), summary({ timeSec: MAIN_DURATION, bunsEaten: 2, firstBunTime: DAOTONG_TIME + 40.5 })), hit);
  assert.deepEqual(evaluateUnlocks(fresh(), summary({ timeSec: MAIN_DURATION, bunsEaten: 1, firstBunTime: DAOTONG_TIME - 0.1 })), []);
  assert.deepEqual(evaluateUnlocks(fresh(), summary({ timeSec: DAOTONG_TIME - 10, bunsEaten: 0, firstBunTime: null })), []);
  // 字段缺失 → 回退 bunsEaten
  assert.deepEqual(evaluateUnlocks(fresh(), summary({ timeSec: MAIN_DURATION, bunsEaten: 1, firstBunTime: undefined })), []);
  const r = recordRun(fresh(), summary({ timeSec: MAIN_DURATION, bunsEaten: 2, firstBunTime: DAOTONG_TIME + 20 }));
  assert.ok(r.achievements.includes('noBun480'));
});

test('夜色：通关 N 解锁 N+1，最高 10', () => {
  const s = defaultSave();
  assert.deepEqual(evaluateUnlocks(s, summary({ cleared: false, timeSec: 600 })), []);
  assert.deepEqual(evaluateUnlocks(s, summary({ cleared: true, nightLevel: 0, timeSec: 600, kills: 10 })), [{ kind: 'night', id: 1 }]);
  assert.equal(s.nightCleared, 0);
  assert.equal(s.nightUnlocked, 1);
  // 重打低夜色不倒退
  assert.deepEqual(evaluateUnlocks(s, summary({ cleared: true, nightLevel: 0, kills: 10 })), []);
  assert.equal(s.nightUnlocked, 1);
  s.nightUnlocked = 10; s.nightCleared = 9;
  assert.deepEqual(evaluateUnlocks(s, summary({ cleared: true, nightLevel: 10, kills: 10 })), []);
  assert.equal(s.nightCleared, 10);
  assert.equal(s.nightUnlocked, 10);
});

test('同一局可同时解锁英雄与夜色', () => {
  const s = defaultSave();
  const u = evaluateUnlocks(s, summary({ cleared: true, kills: 1200, timeSec: 600, bunsEaten: 0 }));
  assert.deepEqual(u.map((x) => x.id).sort(), [1, 'daotong', 'mian'].sort());
});

test('recordRun：铜钱入账与统计', () => {
  const s = defaultSave();
  const r = recordRun(s, summary({ coins: 150, kills: 820, timeSec: 400, maxHit: 12000 }), 123);
  assert.equal(r.coins, 150);
  assert.equal(s.coins, 150);
  assert.equal(s.stats.runs, 1);
  assert.equal(s.stats.firstRunDone, true);
  assert.equal(s.stats.bestKills, 820);
  assert.equal(s.stats.bestHit, 12000);
  assert.deepEqual(r.unlocks, [{ kind: 'hero', id: 'mian' }]);
  assert.ok(r.achievements.includes('kills800'));
  assert.ok(r.achievements.includes('hit10k'));
  assert.equal(s.achievements.kills800, 123);
  const r2 = recordRun(s, summary({ coins: 10, kills: 900 }), 456);
  assert.equal(r2.achievements.includes('kills800'), false);
  assert.equal(s.stats.runs, 2);
});

test('结算翻倍再加一份', () => {
  const s = defaultSave();
  recordRun(s, summary({ coins: 120 }));
  grantDoubleCoins(s, 120);
  assert.equal(s.coins, 240);
});
