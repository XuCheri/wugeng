import test from 'node:test';
import assert from 'node:assert/strict';
import { SAVE_VERSION, COACH_KEYS, defaultSave, migrateSave, mergeSaves } from '../../src/meta/save.js';
import { getHubFeatureLock, COACH_WHISPERS } from '../../src/ui/coach.js';
import { recordRun } from '../../src/meta/unlocks.js';

test('M1.3 Save v4: 新存档 coach 为空，v3 老存档（有局数）自动标记所有旁白已读', () => {
  assert.equal(SAVE_VERSION, 4);
  const fresh = defaultSave();
  assert.equal(fresh.version, 4);
  assert.deepEqual(fresh.coach, { seen: {}, runsPlayed: 0 });

  const migratedReturning = migrateSave({
    version: 3,
    stats: { runs: 2, clears: 0, firstRunDone: true },
  });
  assert.equal(migratedReturning.version, 4);
  assert.equal(migratedReturning.coach.runsPlayed, 2);
  for (const k of COACH_KEYS) {
    assert.equal(migratedReturning.coach.seen[k], true, `老玩家迁移后应跳过旁白 ${k}`);
  }

  const migratedFresh = migrateSave({ version: 3, stats: { runs: 0, clears: 0, firstRunDone: false } });
  assert.deepEqual(migratedFresh.coach.seen, {});
  assert.equal(migratedFresh.coach.runsPlayed, 0);

  // 合并取并集与最大值
  const a = defaultSave();
  a.coach.seen.firstLevelUp = true;
  a.coach.runsPlayed = 1;
  a.stats.runs = 1;
  const b = defaultSave();
  b.coach.seen.firstChest = true;
  b.coach.runsPlayed = 3;
  b.stats.runs = 3;
  const merged = mergeSaves(a, b);
  assert.equal(merged.coach.seen.firstLevelUp, true);
  assert.equal(merged.coach.seen.firstChest, true);
  assert.equal(merged.coach.runsPlayed, 3);
});

test('M1.3 Coach Hub 渐进开放：0局仅开放出门打更，1局开加点/图鉴，2局开鬼市/功绩/天榜，首通开同守', () => {
  for (const k of COACH_KEYS) {
    assert.ok(typeof COACH_WHISPERS[k] === 'string' && COACH_WHISPERS[k].length >= 8);
  }

  const s = defaultSave();
  // 0 局
  assert.equal(getHubFeatureLock(s, 'shop').locked, true);
  assert.equal(getHubFeatureLock(s, 'codex').locked, true);
  assert.equal(getHubFeatureLock(s, 'market').locked, true);
  assert.equal(getHubFeatureLock(s, 'achievements').locked, true);
  assert.equal(getHubFeatureLock(s, 'leaderboard').locked, true);
  assert.equal(getHubFeatureLock(s, 'coop').locked, true);

  // 第 1 局未通关（无铜钱）
  recordRun(s, { cleared: false, timeSec: 120, kills: 50, coins: 0 });
  assert.equal(s.coach.runsPlayed, 1);
  assert.equal(getHubFeatureLock(s, 'shop').locked, false);
  assert.equal(getHubFeatureLock(s, 'codex').locked, false);
  assert.equal(getHubFeatureLock(s, 'market').locked, true);
  assert.equal(getHubFeatureLock(s, 'achievements').locked, true);
  assert.equal(getHubFeatureLock(s, 'leaderboard').locked, true);
  assert.equal(getHubFeatureLock(s, 'coop').locked, true);

  // 第 2 局未通关
  recordRun(s, { cleared: false, timeSec: 180, kills: 120, coins: 40 });
  assert.equal(getHubFeatureLock(s, 'market').locked, false);
  assert.equal(getHubFeatureLock(s, 'achievements').locked, false);
  assert.equal(getHubFeatureLock(s, 'leaderboard').locked, false);
  assert.equal(getHubFeatureLock(s, 'coop').locked, true);

  // 首通鸡鸣天亮 -> 全部开放（含同守联机）
  recordRun(s, { cleared: true, timeSec: 420, kills: 900, coins: 200 });
  assert.equal(getHubFeatureLock(s, 'coop').locked, false);
});
