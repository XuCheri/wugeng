import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAds, parseMockMode } from '../../src/ads/ads.js';

const UNIT = { rewardedAdUnitId: 'unit-123' };

/** 假 TapTap 宿主：behavior 决定 show/load 的表现。 */
function fakeTap(behavior = {}) {
  const log = { created: 0, destroyed: 0, offClose: 0, offError: 0, show: 0, load: 0, unitIds: [] };
  const tap = {
    createRewardedVideoAd({ adUnitId }) {
      log.created++;
      log.unitIds.push(adUnitId);
      const closeCbs = new Set();
      const errorCbs = new Set();
      const ad = {
        onClose: (cb) => closeCbs.add(cb),
        offClose: (cb) => { log.offClose++; closeCbs.delete(cb); },
        onError: (cb) => errorCbs.add(cb),
        offError: (cb) => { log.offError++; errorCbs.delete(cb); },
        destroy: () => { log.destroyed++; },
        load: () => { log.load++; return behavior.load ? behavior.load(ad) : Promise.resolve(); },
        show: () => {
          log.show++;
          return behavior.show ? behavior.show(ad, log.show) : Promise.resolve();
        },
        emitClose: (e) => [...closeCbs].forEach((cb) => cb(e)),
        emitError: (e) => [...errorCbs].forEach((cb) => cb(e)),
      };
      return ad;
    },
  };
  return { tap, log };
}

const later = (fn, ms = 5) => setTimeout(fn, ms);

test('无广告位 ID：入口隐藏，watchAd 直接 unavailable 且不创建广告', async () => {
  const { tap, log } = fakeTap();
  const ads = createAds({ win: { tap }, config: { rewardedAdUnitId: '' }, search: '' });
  assert.equal(ads.adsEnabled(), false);
  assert.equal(await ads.watchAd('reroll'), 'unavailable');
  assert.equal(log.created, 0);
});

test('有 ID 但宿主无 SDK：入口隐藏', async () => {
  const ads = createAds({ win: {}, config: UNIT, search: '' });
  assert.equal(ads.adsEnabled(), false);
  assert.equal(await ads.watchAd('revive'), 'unavailable');
});

test('看完：isEnded === true → completed，并清理监听与销毁', async () => {
  const { tap, log } = fakeTap({ show: (ad) => { later(() => ad.emitClose({ isEnded: true })); return Promise.resolve(); } });
  const ads = createAds({ win: { tap }, config: UNIT, search: '' });
  assert.equal(ads.adsEnabled(), true);
  assert.equal(await ads.watchAd('reroll'), 'completed');
  assert.deepEqual(log.unitIds, ['unit-123']);
  assert.equal(log.offClose, 1);
  assert.equal(log.offError, 1);
  assert.equal(log.destroyed, 1);
  assert.equal(ads.isBusy(), false);
});

test('中途关闭：isEnded false / 缺省 → skipped', async () => {
  for (const ev of [{ isEnded: false }, undefined, { isEnded: 'true' }]) {
    const { tap } = fakeTap({ show: (ad) => { later(() => ad.emitClose(ev)); return Promise.resolve(); } });
    const ads = createAds({ win: { tap }, config: UNIT, search: '' });
    assert.equal(await ads.watchAd('resultDouble'), 'skipped');
  }
});

test('onError → unavailable', async () => {
  const { tap, log } = fakeTap({ show: (ad) => { later(() => ad.emitError({ errCode: 1004 })); return Promise.resolve(); } });
  const ads = createAds({ win: { tap }, config: UNIT, search: '' });
  assert.equal(await ads.watchAd('checkinDouble'), 'unavailable');
  assert.equal(log.destroyed, 1);
});

test('show 失败 → load 后重试一次成功', async () => {
  const { tap, log } = fakeTap({
    show: (ad, n) => {
      if (n === 1) return Promise.reject(new Error('not ready'));
      later(() => ad.emitClose({ isEnded: true }));
      return Promise.resolve();
    },
  });
  const ads = createAds({ win: { tap }, config: UNIT, search: '' });
  assert.equal(await ads.watchAd('reroll'), 'completed');
  assert.equal(log.load, 1);
  assert.equal(log.show, 2);
});

test('show 两次都失败 → unavailable（只重试一次）', async () => {
  const { tap, log } = fakeTap({ show: () => Promise.reject(new Error('no fill')) });
  const ads = createAds({ win: { tap }, config: UNIT, search: '' });
  assert.equal(await ads.watchAd('reroll'), 'unavailable');
  assert.equal(log.show, 2);
  assert.equal(log.load, 1);
});

test('load 失败 → unavailable', async () => {
  const { tap } = fakeTap({ show: () => Promise.reject(new Error('x')), load: () => Promise.reject(new Error('net')) });
  const ads = createAds({ win: { tap }, config: UNIT, search: '' });
  assert.equal(await ads.watchAd('reroll'), 'unavailable');
});

test('加载超时（show 一直不返回）→ unavailable', async () => {
  const { tap, log } = fakeTap({ show: () => new Promise(() => {}) });
  const ads = createAds({ win: { tap }, config: UNIT, search: '', loadTimeoutMs: 30 });
  const t0 = Date.now();
  assert.equal(await ads.watchAd('revive'), 'unavailable');
  assert.ok(Date.now() - t0 >= 25);
  assert.equal(log.destroyed, 1);
});

test('超时之后迟到的 onClose 不会改写结果', async () => {
  let adRef;
  const { tap } = fakeTap({ show: (ad) => { adRef = ad; return new Promise(() => {}); } });
  const ads = createAds({ win: { tap }, config: UNIT, search: '', loadTimeoutMs: 20 });
  const r = await ads.watchAd('revive');
  adRef.emitClose({ isEnded: true });
  assert.equal(r, 'unavailable');
});

test('同一时间只允许一个请求', async () => {
  let adRef;
  const { tap, log } = fakeTap({ show: (ad) => { adRef = ad; return Promise.resolve(); } });
  const ads = createAds({ win: { tap }, config: UNIT, search: '' });
  const p1 = ads.watchAd('reroll');
  assert.equal(ads.isBusy(), true);
  assert.equal(await ads.watchAd('revive'), 'unavailable');
  await new Promise((r) => setTimeout(r, 5));
  adRef.emitClose({ isEnded: true });
  assert.equal(await p1, 'completed');
  assert.equal(log.created, 1);
  assert.equal(ads.isBusy(), false);
});

test('createRewardedVideoAd 抛错 → unavailable', async () => {
  const win = { tap: { createRewardedVideoAd() { throw new Error('boom'); } } };
  const ads = createAds({ win, config: UNIT, search: '' });
  assert.equal(await ads.watchAd('reroll'), 'unavailable');
  assert.equal(ads.isBusy(), false);
});

test('mockAds 解析', () => {
  assert.equal(parseMockMode(''), null);
  assert.equal(parseMockMode('?mockAds=1'), 'complete');
  assert.equal(parseMockMode('?a=2&mockAds=skip'), 'skip');
  assert.equal(parseMockMode('?mockAds=fail'), 'fail');
  assert.equal(parseMockMode('?mockAds=0'), null);
});

test('mock 模式：无 ID 也开启入口，三条路径', async () => {
  for (const [q, want] of [['?mockAds=1', 'completed'], ['?mockAds=skip', 'skipped'], ['?mockAds=fail', 'unavailable']]) {
    const ads = createAds({
      win: {}, config: { rewardedAdUnitId: '' }, search: q,
      mockOverlay: async (mode) => (mode === 'complete' ? 'completed' : mode === 'skip' ? 'skipped' : 'unavailable'),
    });
    assert.equal(ads.adsEnabled(), true);
    assert.equal(await ads.watchAd('reroll'), want);
  }
});

test('mock 模式默认遮罩在无 DOM 时也能结束', async () => {
  const ads = createAds({ win: {}, config: { rewardedAdUnitId: '' }, search: '?mockAds=1' });
  assert.equal(await ads.watchAd('reroll'), 'completed');
});

test('线上默认激励广告配置锁定为 TapTap 竖屏广告位 1054324，宿主内预热与播放正常、离线自动隐藏', async () => {
  const { ADS_CONFIG, REWARDED_AD_UNIT_ID } = await import('../../src/ads/ads-config.js');
  assert.equal(REWARDED_AD_UNIT_ID, '1054324');
  assert.equal(ADS_CONFIG.rewardedAdUnitId, '1054324');

  const offlineAds = createAds({ win: {}, search: '' });
  assert.equal(offlineAds.adsEnabled(), false);
  assert.equal(offlineAds.preload(), false);

  const { tap, log } = fakeTap({
    show: (ad) => {
      later(() => ad.emitClose({ isEnded: true }));
      return Promise.resolve();
    },
  });
  const liveAds = createAds({ win: { tap }, search: '' });
  assert.equal(liveAds.adsEnabled(), true);
  assert.equal(liveAds.preload(), true);
  assert.equal(log.load, 1);
  assert.deepEqual(log.unitIds, ['1054324']);

  assert.equal(await liveAds.watchAd('dailyTaskDouble'), 'completed');
  assert.deepEqual(log.unitIds, ['1054324', '1054324']);
});
