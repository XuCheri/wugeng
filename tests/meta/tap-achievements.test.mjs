import test from 'node:test';
import assert from 'node:assert/strict';
import { ACHIEVEMENTS } from '../../src/meta/achievements.js';
import { defaultSave } from '../../src/meta/save.js';
import {
  TAP_ACHIEVEMENT_SPECS,
  isValidTapAchievementId,
  resolveTapAchievementId,
} from '../../src/meta/tap-achievements-config.js';
import {
  TAP_ACH_SYNCED_KEY,
  createTapAchievements,
  parseMockTapAchievement,
} from '../../src/meta/tap-achievements.js';

function createMemStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

test('TapTap 成就配置：22 项守夜功绩 ID 100% 符合字母数字 <=40 规范且文案不超限', () => {
  assert.equal(TAP_ACHIEVEMENT_SPECS.length, ACHIEVEMENTS.length);
  assert.ok(TAP_ACHIEVEMENT_SPECS.length >= 22);
  const seen = new Set();
  for (const spec of TAP_ACHIEVEMENT_SPECS) {
    assert.equal(isValidTapAchievementId(spec.tapId), true, `非法成就 ID: ${spec.tapId}`);
    assert.equal(resolveTapAchievementId(spec.id), spec.tapId);
    assert.ok(!seen.has(spec.tapId), `重复成就 ID: ${spec.tapId}`);
    seen.add(spec.tapId);
    assert.ok(spec.name.length >= 1 && spec.name.length <= 40, `名称超长: ${spec.name}`);
    assert.ok(spec.desc.length >= 1 && spec.desc.length <= 200, `简介超长: ${spec.desc}`);
  }
  assert.equal(isValidTapAchievementId('bad_id_with_underscore'), false);
  assert.equal(isValidTapAchievementId(''), false);
  assert.equal(resolveTapAchievementId('bad_id_with_underscore'), null);
});

test('普通浏览器离线降级：window.tap 缺失时全部接口安全返回且不污染存档', () => {
  const save = defaultSave();
  save.achievements.firstClear = 1700000000000;
  const beforeSnap = JSON.stringify(save);

  const bridge = createTapAchievements({ tapHost: null, search: '', storage: createMemStorage() });
  assert.equal(bridge.isAvailable(), false);
  assert.equal(bridge.isNativeAvailable(), false);
  assert.equal(bridge.unlock('firstClear').reason, 'unavailable');
  assert.equal(bridge.syncUnlocked(save).reason, 'unavailable');
  assert.equal(bridge.openNativeAchievements(save).reason, 'unavailable');
  assert.equal(JSON.stringify(save), beforeSnap);
  bridge.teardown();
});

test('TapTap 原生 AchievementManager：实时冒泡解锁、静默历史回填、失败重试与唤起面板', async () => {
  const calls = [];
  const toastAtCall = [];
  const listeners = new Set();
  let failIds = new Set(['night10']);
  let showCount = 0;

  const fakeMgr = {
    toastEnable: true,
    registerListener(l) { listeners.add(l); },
    unregisterListener(l) { listeners.delete(l); },
    unlockAchievement({ achievementId }) {
      calls.push({ method: 'unlock', achievementId });
      toastAtCall.push({ achievementId, toastEnable: this.toastEnable });
      if (failIds.has(achievementId)) {
        for (const l of listeners) l.onAchievementFailure?.(achievementId, 700003, 'achievement not published');
        return;
      }
      for (const l of listeners) {
        l.onAchievementSuccess?.(70001, {
          achievementId,
          achievementName: achievementId,
          achievementType: 0,
        });
      }
    },
    incrementAchievement({ achievementId, steps }) {
      calls.push({ method: 'increment', achievementId, steps });
      for (const l of listeners) {
        l.onAchievementSuccess?.(70002, {
          achievementId,
          achievementName: achievementId,
          achievementType: 0,
          currentStep: steps,
        });
      }
    },
    showAchievements() {
      showCount += 1;
    },
  };

  let createCalls = 0;
  const fakeTapHost = {
    createAchievementManager(opts) {
      createCalls += 1;
      fakeMgr.toastEnable = opts?.toastEnable !== false;
      return fakeMgr;
    },
  };

  const storage = createMemStorage();
  let platinumEvents = 0;
  const bridge = createTapAchievements({
    tapHost: fakeTapHost,
    storage,
    onPlatinum: () => { platinumEvents += 1; },
  });

  assert.equal(bridge.isAvailable(), true);
  assert.equal(bridge.isNativeAvailable(), true);

  // 1. 实时解锁（开启冒泡 toastEnable = true）
  const r1 = bridge.unlock('firstClear', { silent: false });
  assert.equal(r1.ok, true);
  assert.equal(r1.skipped, false);
  assert.equal(createCalls, 1);
  assert.deepEqual(toastAtCall[0], { achievementId: 'firstClear', toastEnable: true });

  // 同一成就已同步，重复调用自动跳过
  const r1Dup = bridge.unlock('firstClear', { silent: false });
  assert.equal(r1Dup.skipped, true);
  assert.equal(calls.length, 1);

  // 2. 历史存档静默回填（toastEnable 临时置为 false；未发布失败项 night10 不落盘，后续可重传）
  const save = defaultSave();
  save.achievements.firstClear = 100;
  save.achievements.kills800 = 200;
  save.achievements.night10 = 300;
  save.stats.totalKills = 1600; // 满足 totalKills1500

  const syncRes = bridge.syncUnlocked(save, { silent: true });
  assert.deepEqual(syncRes.dispatched.sort(), ['kills800', 'night10', 'totalKills1500']);
  for (const item of toastAtCall.slice(1)) {
    assert.equal(item.toastEnable, false, `静默回填期间 ${item.achievementId} 应关闭原生冒泡`);
  }

  const persisted1 = JSON.parse(storage.getItem(TAP_ACH_SYNCED_KEY));
  assert.deepEqual(persisted1.sort(), ['firstClear', 'kills800', 'totalKills1500']);
  assert.equal(bridge.getState().lastError?.id, 'night10');

  // 3. 后台发布 night10 后，打开原生成就墙前自动补传成功并唤起 showAchievements()
  failIds = new Set();
  const openRes = bridge.openNativeAchievements(save);
  assert.deepEqual(openRes, { ok: true, native: true });
  assert.equal(showCount, 1);
  const persisted2 = JSON.parse(storage.getItem(TAP_ACH_SYNCED_KEY));
  assert.ok(persisted2.includes('night10'));

  // 4. 分步累加与白金回调
  const incRes = bridge.increment('bossKills15', 3, { silent: false });
  assert.equal(incRes.ok, true);
  assert.equal(fakeMgr.toastEnable, true);

  for (const l of listeners) {
    l.onAchievementSuccess?.(70001, {
      achievementId: 'wugengPlatinum',
      achievementName: '万邪辟易',
      achievementType: 1,
    });
  }
  assert.equal(platinumEvents, 1);
  assert.equal(bridge.getState().syncedIds.includes('wugengPlatinum'), false);

  bridge.teardown();
  assert.equal(listeners.size, 0);
});

test('模拟宿主 (?mockTap=1 / ?mockAchievement=1)：全成就达成触发白金事件', () => {
  assert.equal(parseMockTapAchievement('?mockTap=1'), true);
  assert.equal(parseMockTapAchievement('?mockAchievement=1'), true);
  assert.equal(parseMockTapAchievement('?mockTap=0'), false);

  let platinumCount = 0;
  const bridge = createTapAchievements({
    tapHost: null,
    search: '?mockAchievement=1',
    storage: createMemStorage(),
    onPlatinum: () => { platinumCount += 1; },
  });
  assert.equal(bridge.isAvailable(), true);
  assert.equal(bridge.isNativeAvailable(), false);

  const save = defaultSave();
  for (const a of ACHIEVEMENTS) {
    save.achievements[a.id] = 1700000000000;
  }
  bridge.syncUnlocked(save, { silent: true });
  assert.equal(bridge.getState().syncedCount, ACHIEVEMENTS.length);
  assert.equal(platinumCount, 1);

  const openRes = bridge.openNativeAchievements(save);
  assert.deepEqual(openRes, { ok: true, native: false });
  assert.equal(bridge.getState().overlayOpenCount, 1);
  bridge.teardown();
});
