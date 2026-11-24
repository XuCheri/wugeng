import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultSave, migrateSave, loadSave, saveSave, SAVE_KEY, SAVE_VERSION,
} from '../../src/meta/save.js';

function memStorage(init = {}) {
  const m = new Map(Object.entries(init));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    _m: m,
  };
}

test('默认存档字段齐全', () => {
  const s = defaultSave();
  assert.equal(s.version, SAVE_VERSION);
  assert.equal(s.coins, 0);
  assert.deepEqual(Object.values(s.shop), [0, 0, 0, 0, 0, 0, 0, 0]);
  assert.equal(Object.keys(s.shop).length, 8);
  assert.deepEqual(s.unlockedHeroes, ['zhou']);
  assert.equal(s.selectedHero, 'zhou');
  assert.equal(s.nightUnlocked, 0);
  assert.equal(s.nightCleared, -1);
  assert.deepEqual(s.settings, { sfx: true, music: true, shake: true, dmgText: 'all', lowQuality: false });
  assert.deepEqual(s.checkin.cycleDay, 0);
  assert.equal(s.checkin.lastClaimDate, null);
  assert.deepEqual(s.cosmetics, {
    owned: [],
    equipped: { lantern: null, outfit: null, attackVfx: 'default', heroSkins: {} },
  });
  assert.deepEqual(s.charms, []);
  assert.equal(s.stats.runs, 0);
  assert.equal(s.stats.firstRunDone, false);
});

test('非对象 / null / 数组 → 默认存档', () => {
  for (const raw of [null, undefined, 42, 'x', [], true]) {
    assert.deepEqual(migrateSave(raw), defaultSave());
  }
});

test('v0 原型存档迁移：gold/heroes/upgrades', () => {
  const s = migrateSave({ gold: 321, heroes: ['zhou', 'mian'], upgrades: { tizhi: 2, lidao: 9 } });
  assert.equal(s.version, SAVE_VERSION);
  assert.equal(s.coins, 321);
  assert.deepEqual(s.unlockedHeroes, ['zhou', 'mian']);
  assert.equal(s.shop.tizhi, 2);
  assert.equal(s.shop.lidao, 5, '超过满级被夹紧');
  assert.equal(s.shop.huchi, 0);
});

test('越界与脏数据被修补', () => {
  const s = migrateSave({
    version: 1,
    coins: -50,
    shop: { tizhi: 'abc', jiaoli: 3.7, bogus: 4 },
    unlockedHeroes: ['daotong', 'hacker', 'daotong'],
    selectedHero: 'mian',
    nightUnlocked: 99,
    nightCleared: 2,
    selectedNight: 50,
    settings: { sfx: 'yes', dmgText: 'rainbow', lowQuality: true },
    checkin: { cycleDay: 12, lastClaimDate: 'yesterday' },
    cosmetics: { owned: ['lantern_plain', 7], equipped: { lantern: 'lantern_plain', outfit: 'nope' } },
    charms: [{ relicId: 'cinnabar' }, { relicId: 'nuke' }, 'redstring'],
    stats: { runs: 3, totalPlaySec: NaN },
    extra: 'dropped',
  });
  assert.equal(s.coins, 0);
  assert.equal(s.shop.tizhi, 0);
  assert.equal(s.shop.jiaoli, 3);
  assert.equal('bogus' in s.shop, false);
  assert.deepEqual(s.unlockedHeroes, ['zhou', 'daotong']);
  assert.equal(s.selectedHero, 'zhou', '未解锁英雄不能被选中');
  assert.equal(s.nightUnlocked, 10);
  assert.equal(s.nightCleared, 2);
  assert.equal(s.selectedNight, 10);
  assert.equal(s.settings.sfx, true);
  assert.equal(s.settings.dmgText, 'all');
  assert.equal(s.settings.lowQuality, true);
  assert.equal(s.checkin.cycleDay, 6);
  assert.equal(s.checkin.lastClaimDate, null);
  assert.deepEqual(s.cosmetics.owned, ['lantern_plain']);
  assert.deepEqual(s.cosmetics.equipped, { lantern: 'lantern_plain', outfit: null, attackVfx: 'default', heroSkins: {} });
  assert.deepEqual(s.charms, [{ relicId: 'cinnabar' }, { relicId: 'redstring' }]);
  assert.equal(s.stats.runs, 3);
  assert.equal(s.stats.firstRunDone, true);
  assert.equal(s.stats.totalPlaySec, 0);
  assert.equal('extra' in s, false);
});

test('nightUnlocked 至少为 nightCleared + 1', () => {
  const s = migrateSave({ version: 1, nightUnlocked: 0, nightCleared: 3 });
  assert.equal(s.nightUnlocked, 4);
});

test('读写往返', () => {
  const st = memStorage();
  const s = defaultSave();
  s.coins = 777;
  s.shop.caiyun = 4;
  s.unlockedHeroes.push('mian');
  assert.equal(saveSave(s, st), true);
  const back = loadSave(st);
  assert.equal(back.coins, 777);
  assert.equal(back.shop.caiyun, 4);
  assert.deepEqual(back.unlockedHeroes, ['zhou', 'mian']);
});

test('损坏 JSON → 默认存档，并备份坏档', () => {
  const st = memStorage({ [SAVE_KEY]: '{"coins": 12,,' });
  const s = loadSave(st);
  assert.deepEqual(s, defaultSave());
  assert.equal(st.getItem(SAVE_KEY + '.broken'), '{"coins": 12,,');
});

test('存储不可用时不崩', () => {
  const throwing = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('quota'); } };
  assert.deepEqual(loadSave(throwing), defaultSave());
  assert.equal(saveSave(defaultSave(), throwing), false);
});

test('空存储 → 默认存档', () => {
  assert.deepEqual(loadSave(memStorage()), defaultSave());
});
