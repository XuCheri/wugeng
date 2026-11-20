import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  canShowRerollAd, canShowReviveAd, canShowResultDouble, canShowCheckinDouble,
  adResultMessage, inRunAdsAllowed,
} from '../../src/ads/ad-policy.js';

const run = (o = {}) => ({
  time: 120, mode: 'main',
  rerolls: { free: 0, ad: 0, adGrants: 0, adGrantMax: 2 },
  revives: { mainUsed: false, endlessUsed: false },
  ...o,
});

test('前 60 秒不显示任何局内广告', () => {
  assert.equal(inRunAdsAllowed(true, run({ time: 59.9 })), false);
  assert.equal(canShowRerollAd(true, run({ time: 30 })), false);
  assert.equal(canShowReviveAd(true, run({ time: 59 })), false);
  assert.equal(canShowReviveAd(true, run({ time: 60 })), true);
});

test('广告关闭时全部隐藏', () => {
  assert.equal(canShowRerollAd(false, run()), false);
  assert.equal(canShowReviveAd(false, run()), false);
  assert.equal(canShowResultDouble(false, { coins: 100, timeSec: 300 }, false), false);
  assert.equal(canShowCheckinDouble(false, { canClaim: true }), false);
});

test('换签广告：免费/广告次数用完才出现，每局最多 2 次', () => {
  assert.equal(canShowRerollAd(true, run({ rerolls: { free: 1, ad: 0, adGrants: 0, adGrantMax: 2 } })), false);
  assert.equal(canShowRerollAd(true, run({ rerolls: { free: 0, ad: 2, adGrants: 1, adGrantMax: 2 } })), false);
  assert.equal(canShowRerollAd(true, run()), true);
  assert.equal(canShowRerollAd(true, run({ rerolls: { free: 0, ad: 0, adGrants: 2, adGrantMax: 2 } })), false);
  assert.equal(canShowRerollAd(true, run({ rerolls: { free: 0, ad: 0, adGrants: 1 } })), true);
});

test('复活：主线一次、无尽再一次', () => {
  assert.equal(canShowReviveAd(true, run({ revives: { mainUsed: true, endlessUsed: false } })), false);
  assert.equal(canShowReviveAd(true, run({ mode: 'endless', revives: { mainUsed: true, endlessUsed: false } })), true);
  assert.equal(canShowReviveAd(true, run({ mode: 'endless', revives: { mainUsed: true, endlessUsed: true } })), false);
});

test('结算翻倍：每次结算一次，需有铜钱且满 60 秒', () => {
  assert.equal(canShowResultDouble(true, { coins: 100, timeSec: 300 }, false), true);
  assert.equal(canShowResultDouble(true, { coins: 100, timeSec: 300 }, true), false);
  assert.equal(canShowResultDouble(true, { coins: 0, timeSec: 300 }, false), false);
  assert.equal(canShowResultDouble(true, { coins: 10, timeSec: 40 }, false), false);
});

test('更簿双倍：仅在今天可领时出现', () => {
  assert.equal(canShowCheckinDouble(true, { canClaim: true }), true);
  assert.equal(canShowCheckinDouble(true, { canClaim: false }), false);
});

test('提示文案', () => {
  assert.equal(adResultMessage('completed'), null);
  assert.equal(adResultMessage('skipped'), '看完才能领取奖励');
  assert.equal(adResultMessage('unavailable'), '广告暂时不可用');
});
