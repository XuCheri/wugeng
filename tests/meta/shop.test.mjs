import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultSave } from '../../src/meta/save.js';
import { getMetaBonuses, buyLevel, nextCost, defaultCost, getShopItems, shopProgress } from '../../src/meta/shop.js';

test('价目表：60 / 181 / 347 / 553 / 794', () => {
  assert.deepEqual([1, 2, 3, 4, 5].map(defaultCost), [60, 181, 347, 553, 794]);
  const s = defaultSave();
  s.coins = 1e6;
  const seen = [];
  for (let i = 0; i < 5; i++) { seen.push(nextCost(s, 'lidao')); buyLevel(s, 'lidao'); }
  assert.deepEqual(seen, [60, 181, 347, 553, 794]);
});

test('8 项、每项 5 级', () => {
  const items = getShopItems();
  assert.deepEqual(items.map((x) => x.id), ['tizhi', 'lidao', 'jiaoli', 'yanli', 'wuxing', 'caiyun', 'jiyuan', 'huchi']);
  for (const it of items) assert.equal(it.maxLevel, 5);
});

test('单项满级约 1,935；全部满级约 1.55 万', () => {
  const s = defaultSave();
  s.coins = 1e9;
  let spent = 0;
  for (const it of getShopItems()) {
    for (let l = 0; l < 5; l++) {
      const r = buyLevel(s, it.id);
      assert.equal(r.ok, true);
      spent += r.cost;
    }
    assert.equal(nextCost(s, it.id), null);
    assert.equal(buyLevel(s, it.id).reason, 'max');
  }
  assert.ok(spent >= 15000 && spent <= 16000, `spent ${spent}`);
  assert.equal(shopProgress(s), 1);
});

test('铜钱不够买不了，不扣钱', () => {
  const s = defaultSave();
  s.coins = 59;
  const r = buyLevel(s, 'tizhi');
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'coins');
  assert.equal(s.coins, 59);
  assert.equal(s.shop.tizhi, 0);
  s.coins = 60;
  assert.equal(buyLevel(s, 'tizhi').ok, true);
  assert.equal(s.coins, 0);
  assert.equal(s.shop.tizhi, 1);
  assert.equal(buyLevel(s, 'nope').reason, 'unknown');
});

test('加成：默认全 0', () => {
  const b = getMetaBonuses(defaultSave());
  for (const k of ['maxHpPct', 'dmgPct', 'speedPct', 'pickupPct', 'xpPct', 'coinPct', 'freeRerolls', 'armor']) {
    assert.equal(b[k], 0, k);
  }
});

test('加成：满级约 +30%，机缘 +2 次刷新，护持 +2 护甲', () => {
  const s = defaultSave();
  for (const id of Object.keys(s.shop)) s.shop[id] = 5;
  const b = getMetaBonuses(s);
  assert.ok(Math.abs(b.maxHpPct - 0.25) < 1e-9);
  assert.ok(Math.abs(b.dmgPct - 0.15) < 1e-9);
  assert.ok(Math.abs(b.speedPct - 0.15) < 1e-9);
  assert.ok(Math.abs(b.pickupPct - 0.30) < 1e-9);
  assert.ok(Math.abs(b.xpPct - 0.15) < 1e-9);
  assert.ok(Math.abs(b.coinPct - 0.25) < 1e-9);
  assert.equal(b.freeRerolls, 2);
  assert.equal(b.armor, 2);
});

test('机缘 2/4 级、护持 3/5 级才生效', () => {
  const s = defaultSave();
  s.shop.jiyuan = 1; s.shop.huchi = 2;
  assert.equal(getMetaBonuses(s).freeRerolls, 0);
  assert.equal(getMetaBonuses(s).armor, 0);
  s.shop.jiyuan = 3; s.shop.huchi = 4;
  assert.equal(getMetaBonuses(s).freeRerolls, 1);
  assert.equal(getMetaBonuses(s).armor, 1);
});
