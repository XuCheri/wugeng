import test from 'node:test';
import assert from 'node:assert/strict';

import { createInput } from '../../src/input.js';
import { createRun, stepRun, endRun } from '../../src/sim/run.js';
import { defaultSave, migrateSave, mergeSaves } from '../../src/meta/save.js';
import { getCodexCounts, syncCodexFromRun } from '../../src/meta/codex.js';
import { recordRun } from '../../src/meta/unlocks.js';
import { createCloudSave, ARCHIVE_NAME } from '../../src/meta/cloud-save.js';

function makeFakeTarget() {
  const listeners = new Map();
  return {
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(fn);
    },
    removeEventListener(type, fn) {
      const arr = listeners.get(type) || [];
      const i = arr.indexOf(fn);
      if (i >= 0) arr.splice(i, 1);
    },
    setPointerCapture() {},
    emit(type, payload) {
      for (const fn of listeners.get(type) || []) {
        fn({ preventDefault() {}, ...payload });
      }
    },
  };
}

test('摇杆：落指中心固定不随手指漂移，轻推即满速且回拉不掉移速', () => {
  const prevWin = globalThis.window;
  globalThis.window = makeFakeTarget();
  try {
    const el = makeFakeTarget();
    const input = createInput(el);

    // 在 (150, 500) 按下
    el.emit('pointerdown', { pointerId: 1, clientX: 150, clientY: 500 });
    assert.equal(input.state.stick.ox, 150);
    assert.equal(input.state.stick.oy, 500);

    // 手指大幅向右滑到 (310, 500)（滑出 160px）
    el.emit('pointermove', { pointerId: 1, clientX: 310, clientY: 500 });
    assert.equal(input.state.stick.ox, 150, '摇杆锚点不得跟手滑走');
    assert.equal(input.state.stick.oy, 500);
    assert.equal(input.sample().moveX, 1, '应保持 100% 满移速');
    assert.ok(input.state.stick.kx <= 42.01, '视觉推杆珠限制在外圈内');

    // 手指往回缩到 (172, 500)（距原落指处仅 22px）：旧版跟随摇杆会掉速甚至停下，新版仍满速！
    el.emit('pointermove', { pointerId: 1, clientX: 172, clientY: 500 });
    const s2 = input.sample();
    assert.equal(input.state.stick.ox, 150);
    assert.equal(s2.moveX, 1, '手指回拉微调时移速不得变慢');

    // 手指转向正上方 (150, 475)（距中心 25px）：立即满速向上
    el.emit('pointermove', { pointerId: 1, clientX: 150, clientY: 475 });
    const s3 = input.sample();
    assert.ok(Math.abs(s3.moveX) < 1e-6);
    assert.equal(s3.moveY, -1);

    input.destroy();
  } finally {
    globalThis.window = prevWin;
  }
});

test('鬼潮位置去程序化：不再生成等半径 360° 闭合正圆，具备纵深差与突围缺口', () => {
  const run = createRun({ seed: 20261120, heroId: 'zhou', meta: { maxHpPct: 5 } });
  run.time = 94.99;
  run.enemies.length = 0;
  stepRun(run, { moveX: 1, moveY: 0 });
  const waveEv = run.events.find((e) => e.type === 'wave');
  assert.ok(waveEv, '应在约 95s 触发鬼潮');
  assert.ok(run.enemies.length >= 15);

  const dists = run.enemies.map((e) => Math.hypot(e.x - run.player.x, e.y - run.player.y));
  const spread = Math.max(...dists) - Math.min(...dists);
  assert.ok(spread > 45, `鬼潮应有自然景深错落而非固定半径圆圈（实测差值 ${spread.toFixed(1)}）`);

  const angles = run.enemies
    .map((e) => {
      let a = Math.atan2(e.y - run.player.y, e.x - run.player.x);
      if (a < 0) a += Math.PI * 2;
      return a;
    })
    .sort((a, b) => a - b);
  let maxGap = (angles[0] + Math.PI * 2) - angles[angles.length - 1];
  for (let i = 1; i < angles.length; i++) maxGap = Math.max(maxGap, angles[i] - angles[i - 1]);
  assert.ok(maxGap > 0.95, `鬼潮应留有自然街巷突围缺口而非均匀围死（最大角缺口 ${maxGap.toFixed(2)} rad）`);
});

test('百物谱图鉴与跨设备存档合并（mergeSaves）', () => {
  const s1 = defaultSave();
  assert.deepEqual(s1.codex.weapons, ['gong']);
  assert.equal(getCodexCounts(s1).have, 2); // 老周 + 更锣

  // 局内实时收录 + 结算累计击杀
  const run = createRun({ seed: 7, heroId: 'zhou' });
  run.weapons.push({ id: 'lantern', level: 5, evolved: true });
  run.relics.push({ id: 'censer', level: 2 });
  run.stats.kills = 820;
  run.stats.killsByType = { paperkid: 500, horse: 1 };
  assert.equal(syncCodexFromRun(s1, run), true);

  const summary = endRun(run);
  recordRun(s1, summary, 1000);
  assert.ok(s1.unlockedHeroes.includes('mian'), '800 杀解锁阿绵');
  assert.ok(s1.codex.weapons.includes('lantern'));
  assert.ok(s1.codex.weapons.includes('paperman'), '解锁阿绵自动收录起手纸人');
  assert.ok(s1.codex.evolutions.includes('lantern'), '收录开光长明灯');
  assert.ok(s1.codex.relics.includes('censer'));
  assert.equal(s1.codex.enemies.paperkid, 500);
  assert.equal(s1.codex.enemies.horse, 1);

  // 另一台设备的云端存档：铜钱更多、解锁了小道童与砚台，但不含长明灯
  const remote = migrateSave({
    version: 1,
    updatedAt: 5000,
    coins: 999,
    unlockedHeroes: ['zhou', 'daotong'],
    codex: { weapons: ['gong', 'talisman', 'brush'], evolutions: [], relics: ['inkstone'], enemies: { paperkid: 300, youshen: 1 } },
    stats: { runs: 5, clears: 1, totalCoins: 1200 },
  });
  s1.updatedAt = 2000;
  const merged = mergeSaves(s1, remote);
  assert.equal(merged.coins, 999, '资产取较新快照，不双倍刷钱');
  assert.deepEqual(merged.unlockedHeroes, ['zhou', 'mian', 'daotong'], '英雄解锁取并集');
  assert.ok(merged.codex.evolutions.includes('lantern'), '图鉴开光记录不丢失');
  assert.ok(merged.codex.relics.includes('censer') && merged.codex.relics.includes('inkstone'));
  assert.equal(merged.codex.enemies.paperkid, 500);
  assert.equal(merged.codex.enemies.youshen, 1);
});

test('TapTap 云存档：createArchive / updateArchive / 62 秒节流防 400001 / 拉取合并', async () => {
  let clock = 100_000;
  const files = new Map();
  const cloudRecords = [];
  let calls = { create: 0, update: 0, list: 0, get: 0 };

  const fakeWin = {
    location: { search: '' },
    tap: {
      env: { USER_DATA_PATH: 'tapfile://usr' },
      getFileSystemManager() {
        return {
          writeFile({ filePath, data, success }) { files.set(filePath, data); success?.({}); },
          readFile({ filePath, success, fail }) {
            if (!files.has(filePath)) fail?.(new Error('missing'));
            else success?.({ data: files.get(filePath) });
          },
        };
      },
      getCloudSaveManager() {
        return {
          getArchiveList({ success }) { calls.list++; success?.({ saves: [...cloudRecords] }); },
          createArchive({ archiveMetaData, archiveFilePath, success }) {
            calls.create++;
            assert.equal(archiveMetaData.name, ARCHIVE_NAME);
            assert.ok(!/[\s\u4e00-\u9fff]/.test(archiveMetaData.name), '存档名严禁空格与中文');
            const rec = { uuid: 'u-101', fileId: 'f-1', name: archiveMetaData.name, data: files.get(archiveFilePath) };
            cloudRecords.splice(0, cloudRecords.length, rec);
            success?.(rec);
          },
          updateArchive({ archiveUUID, archiveMetaData, archiveFilePath, success }) {
            calls.update++;
            assert.equal(archiveUUID, 'u-101');
            const rec = { uuid: archiveUUID, fileId: 'f-2', name: archiveMetaData.name, data: files.get(archiveFilePath) };
            cloudRecords.splice(0, cloudRecords.length, rec);
            success?.(rec);
          },
          getArchiveData({ targetFilePath, success }) {
            calls.get++;
            files.set(targetFilePath, cloudRecords[0].data);
            success?.({ filePath: targetFilePath });
          },
        };
      },
    },
  };

  const cs = createCloudSave({ win: fakeWin, now: () => clock, cooldownMs: 62_000, coalesceMs: 20 });
  assert.equal(cs.isAvailable(), true);

  const s = defaultSave();
  s.coins = 320;
  s.stats.runs = 2;
  s.updatedAt = clock;

  // 首次上传 → createArchive
  const r1 = await cs.uploadNow(s);
  assert.equal(r1.ok, true);
  assert.equal(calls.create, 1);
  assert.equal(calls.update, 0);

  // 10 秒后再次手动上传 → 命中本地节流保护（避免触发平台 400001 报错）
  clock += 10_000;
  s.coins = 500;
  const r2 = await cs.uploadNow(s);
  assert.equal(r2.ok, false);
  assert.equal(r2.reason, 'cooldown');
  assert.ok(r2.waitSec >= 50);

  // 跨过 62 秒冷却窗口后上传 → updateArchive
  clock += 55_000;
  const r3 = await cs.uploadNow(s);
  assert.equal(r3.ok, true);
  assert.equal(calls.update, 1);

  // 新设备空档拉取云端 → 恢复 500 铜钱进度
  const freshDevice = defaultSave();
  const pulled = await cs.pullFromCloud(freshDevice);
  assert.equal(pulled.ok, true);
  assert.equal(pulled.hasRemote, true);
  assert.equal(pulled.updated, true);
  assert.equal(pulled.merged.coins, 500);

  cs.destroy();
});
