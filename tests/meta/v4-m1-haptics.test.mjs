import test from 'node:test';
import assert from 'node:assert/strict';
import { createHaptics } from '../../src/platform/haptics.js';
import { defaultSave, migrateSave, mergeSaves } from '../../src/meta/save.js';

test('M1.2 Haptics: 优先调用 tap.vibrateShort/vibrateLong，退回 navigator.vibrate，无接口或抛错时静默', () => {
  const calls = [];
  let t = 1000;
  const tapH = createHaptics({
    win: {
      tap: {
        vibrateShort: (o) => calls.push(['short', o?.type]),
        vibrateLong: () => calls.push(['long']),
      },
    },
    nav: { vibrate: (ms) => calls.push(['web', ms]) },
    now: () => t,
  });

  assert.equal(tapH.pulse('hurt'), true);
  t += 100;
  assert.equal(tapH.pulse('hurt'), false, '受伤震动 250ms 内应节流');
  t += 200;
  assert.equal(tapH.pulse('hurt'), true, '超过 250ms 后允许再次震动');

  t += 100;
  assert.equal(tapH.onEvents([{ type: 'playerHurt' }, { type: 'bossSpawn', bossType: 'horse' }]), true);
  t += 100;
  assert.equal(tapH.onEvents([{ type: 'ult', heroId: 'zhou' }]), true);
  t += 100;
  assert.equal(tapH.onEvents([{ type: 'evolve', weaponId: 'gong' }]), true);
  t += 100;
  assert.equal(tapH.onEvents([{ type: 'bossDefeated', bossType: 'horse' }]), true);
  t += 100;
  assert.equal(tapH.onEvents([{ type: 'allyDowned' }]), true);
  t += 100;
  assert.equal(tapH.onEvents([{ type: 'revive' }]), true);

  assert.deepEqual(calls, [
    ['short', 'light'],
    ['short', 'light'],
    ['long'],
    ['short', 'heavy'],
    ['short', 'medium'],
    ['short', 'heavy'],
    ['short', 'medium'],
    ['short', 'medium'],
  ]);

  // 关闭震动后全部静默
  tapH.setEnabled(false);
  assert.equal(tapH.isEnabled(), false);
  t += 500;
  assert.equal(tapH.pulse('ult'), false);
  assert.equal(tapH.onEvents([{ type: 'bossSpawn' }]), false);

  // 无 tap 宿主时回退 navigator.vibrate
  const webCalls = [];
  let wt = 2000;
  const webH = createHaptics({
    win: {},
    nav: { vibrate: (ms) => webCalls.push(ms) },
    now: () => wt,
  });
  assert.equal(webH.pulse('ult'), true);
  assert.deepEqual(webCalls, [38]);

  // 均无接口或抛错时不崩
  const noopH = createHaptics({ win: { tap: { vibrateShort() { throw new Error('boom'); } } }, nav: null, now: () => 3000 });
  assert.equal(noopH.pulse('ult'), false);
});

test('M1.2 Settings: save.settings.haptics 默认为 true，迁移与合并保留开关状态', () => {
  const s = defaultSave();
  assert.equal(s.settings.haptics, true);
  const migratedOld = migrateSave({ version: 3, settings: { sfx: false } });
  assert.equal(migratedOld.settings.haptics, true);
  const migratedOff = migrateSave({ version: 3, settings: { haptics: false } });
  assert.equal(migratedOff.settings.haptics, false);
  const merged = mergeSaves({ ...s, updatedAt: 1000, settings: { ...s.settings, haptics: false } }, { ...s, updatedAt: 500 });
  assert.equal(merged.settings.haptics, false);
});
