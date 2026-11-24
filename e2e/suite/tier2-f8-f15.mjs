// Tier 2 (Part 2): Boundary, Negative, Security & Anti-Exploit E2E Tests for v3 F8–F15
// STRICT OPAQUE-BOX: ZERO imports from ../../src/**.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {
  ALL_WEAPON_IDS,
  BASELINE_MAIN_COMMIT,
  COOP_SPEC,
  HERO_IDS,
  PRIMARY_LEADERBOARD_ID,
  SAVE_VERSION,
  TAPTAP,
} from './contracts.mjs';
import {
  ROOT,
  VENV_PYTHON,
  bootAndStartRun,
  bootGame,
  bootToHub,
  closeActiveModal,
  createCoopPages,
  createIsolatedPage,
  engageInspectorPeek,
  execFileAsync,
  extractH5ZipToScratch,
  fastClick,
  grantItemViaLevelUp,
  readInspectorOpacity,
  readLeaderboardBodyText,
  readNormalizedSave,
  requireOpenSelector,
  shopBuyAndEquipInModal,
  startStaticServer,
  stepCoopFrames,
  stepFrames,
  triggerChest,
  triggerLethalHit,
  triggerLevelUp,
} from './harness.mjs';
import { launchTwoPageCoopRun } from './tier1-f8-f15.mjs';

export const TIER2_F8_F15 = [
  // ═══════════════════════════════════════════════════════════════════════════
  // F8 Boundaries (5 tests)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'T2-F8-01',
    tier: 2,
    feature: 'F8',
    name: 'Insufficient copper (price - 1 and 0) blocks skin/VFX purchase with ZERO coin mutation or ownership grant',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootToHub(s.page, baseUrl, { savePatch: { coins: 0, unlockedHeroes: HERO_IDS } });
        await fastClick(s.page, '[data-action="open-market"]');
        await requireOpenSelector(s.page, '.cosmetic-shop-modal');

        const cheapest = await s.page.evaluate(async () => {
          const modal = document.querySelector('.cosmetic-shop-modal');
          const extractPrice = (el) => {
            const dp = Number(el?.dataset?.price || el?.dataset?.cost || '');
            if (Number.isFinite(dp) && dp > 0) return dp;
            const clean = (el?.textContent || '').replace(/,/g, '');
            if (/功绩|成就/.test(clean) && !/铜钱/.test(clean)) return 0;
            const m = clean.match(/(?:^|\D)(5[89]\d|[6-9]\d\d|1[0-9]\d\d)(?:\D|$)/);
            return m ? Number(m[1]) : 0;
          };

          let best = { price: Infinity, tab: 'skin', index: 1, id: null };
          const scanCurrentTab = (tabKind) => {
            const cards = [...modal.querySelectorAll('[data-skin-id], [data-vfx-id], [data-cosmetic-id], .cosmetic-card, .market-card, .shop-card')];
            cards.forEach((c, idx) => {
              const p = extractPrice(c);
              if (p > 0 && p < best.price) {
                best = {
                  price: p,
                  tab: tabKind,
                  index: idx,
                  id: c.dataset?.skinId || c.dataset?.vfxId || c.dataset?.cosmeticId || c.dataset?.id || null,
                };
              }
            });
          };

          scanCurrentTab('skin');
          const vfxTab = [...modal.querySelectorAll('button, [role="tab"]')].find(
            (b) => /特效|锋芒|兵气|灵光/.test(b.textContent || '') && !b.closest('.shop-card, .cosmetic-card, .market-card'),
          );
          if (vfxTab) {
            vfxTab.click();
            await new Promise((r) => requestAnimationFrame(r));
            scanCurrentTab('vfx');
          }
          if (!Number.isFinite(best.price)) {
            best = { price: 580, tab: 'skin', index: 1, id: null };
          }
          return best;
        });

        for (const testCoins of [0, cheapest.price - 1]) {
          await bootToHub(s.page, baseUrl, { savePatch: { coins: testCoins, unlockedHeroes: HERO_IDS } });
          await fastClick(s.page, '[data-action="open-market"]');
          await requireOpenSelector(s.page, '.cosmetic-shop-modal');
          await s.page.evaluate(async (target) => {
            const modal = document.querySelector('.cosmetic-shop-modal');
            if (target.tab === 'vfx') {
              const vfxTab = [...modal.querySelectorAll('button, [role="tab"]')].find(
                (b) => /特效|锋芒|兵气|灵光/.test(b.textContent || '') && !b.closest('.shop-card, .cosmetic-card, .market-card'),
              );
              if (vfxTab) {
                vfxTab.click();
                await new Promise((r) => requestAnimationFrame(r));
              }
            }
            const cards = [...modal.querySelectorAll('[data-skin-id], [data-vfx-id], [data-cosmetic-id], .cosmetic-card, .market-card, .shop-card')];
            const card =
              (target.id
                ? cards.find((c) => (c.dataset?.skinId || c.dataset?.vfxId || c.dataset?.cosmeticId || c.dataset?.id) === target.id)
                : null) ||
              cards[target.index] ||
              cards[1] ||
              cards[0];
            card?.click();
            await new Promise((r) => requestAnimationFrame(r));
            const clickBuy = (b) => {
              if (!b || b.disabled) return;
              const txt = (b.textContent || '').replace(/,/g, '');
              if (/购|买|兑换|\b[3-9]\d\d\b|\b[12]\d\d\d\b/.test(txt)) b.click();
            };
            if (card) {
              card.querySelectorAll('button').forEach(clickBuy);
              if (card.tagName === 'BUTTON') clickBuy(card);
            }
            modal.querySelectorAll('button').forEach((b) => {
              const owner = b.closest('[data-skin-id], [data-vfx-id], [data-cosmetic-id], .cosmetic-card, .market-card, .shop-card');
              if (!owner || owner === card) clickBuy(b);
            });
          }, cheapest);
          const after = await readNormalizedSave(s.page);
          assert.equal(after.coins, testCoins, `Coins must stay ${testCoins} on failed purchase of ${cheapest.price}-coin item`);
          assert.equal(after.ownedCosmetics.filter((x) => x !== 'default' && !/default$/i.test(x)).length, 0);
        }
        s.assertNoErrors('T2-F8-01');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T2-F8-02',
    tier: 2,
    feature: 'F8',
    name: 'Synchronous double-click buy on unowned cosmetic deducts price strictly once & creates 0 duplicate owned IDs',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootToHub(s.page, baseUrl, { savePatch: { coins: 5000, unlockedHeroes: HERO_IDS } });
        await fastClick(s.page, '[data-action="open-market"]');
        await requireOpenSelector(s.page, '.cosmetic-shop-modal');

        const bought = await shopBuyAndEquipInModal(s.page, {
          kind: 'vfx',
          vfxId: 'jade_ghostfire',
          buy: true,
          doubleClickBuy: true,
          equip: false,
          close: false,
        });
        assert.equal(bought.ok, true, bought.reason || 'Failed buying jade_ghostfire');
        assert.ok(bought.price > 0, `Expected positive extracted copper price for jade_ghostfire, got ${bought.price}`);

        const after = await readNormalizedSave(s.page);
        assert.ok(after.coins < 5000, 'Expected single purchase to succeed');
        assert.equal(after.coins, 5000 - bought.price, 'Double-click buy must charge price strictly once');
        const rawOwned = after.raw.cosmetics?.owned || [];
        assert.equal(rawOwned.length, new Set(rawOwned).size, 'cosmetics.owned must contain zero duplicate entries');
        s.assertNoErrors('T2-F8-02');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T2-F8-03',
    tier: 2,
    feature: 'F8',
    name: 'Achievement-exclusive Hero Skin cannot be bought with copper even when player holds 99,999 coins',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootToHub(s.page, baseUrl, { savePatch: { coins: 99_999, unlockedHeroes: HERO_IDS } });
        await fastClick(s.page, '[data-action="open-market"]');
        await requireOpenSelector(s.page, '.cosmetic-shop-modal');

        const foundAchSkin = await s.page.evaluate(async (heroIds) => {
          const modal = document.querySelector('.cosmetic-shop-modal');
          const vfxRe = /古墨朱砂|青冥幽火|紫电天罡|鎏金神诏|玄霜寒月/;
          const isAchSkin = (c) => {
            if (c.hasAttribute('data-vfx-id') || vfxRe.test(c.textContent || '')) return false;
            if (c.dataset?.unlock === 'achievement' || c.dataset?.source === 'achievement') return true;
            const clean = (c.textContent || '').replace(/,/g, '');
            return /功绩|成就/.test(clean) && !/铜钱/.test(clean);
          };
          const tryClickAchCard = async () => {
            const cards = [...modal.querySelectorAll('[data-skin-id], [data-cosmetic-id], .cosmetic-card, .market-card, .shop-card')];
            const ach = cards.find(isAchSkin);
            if (ach) {
              ach.click();
              await new Promise((r) => requestAnimationFrame(r));
              ach.querySelectorAll('button:not([disabled])').forEach((b) => {
                if (/购|买|兑换|穿戴|装备/.test(b.textContent || '')) b.click();
              });
              modal.querySelectorAll('button:not([disabled])').forEach((b) => {
                const owner = b.closest('[data-skin-id], [data-vfx-id], [data-cosmetic-id], .cosmetic-card, .market-card, .shop-card');
                if ((!owner || owner === ach) && /购|买|兑换/.test(b.textContent || '')) b.click();
              });
              return true;
            }
            return false;
          };
          if (await tryClickAchCard()) return true;
          for (const hid of heroIds) {
            const hBtn = modal.querySelector(
              `[data-shop-hero="${hid}"]:not([data-skin-id]):not(.cosmetic-card):not(.shop-card):not(.market-card), ` +
              `[data-filter-hero="${hid}"]:not([data-skin-id]):not(.cosmetic-card):not(.shop-card):not(.market-card), ` +
              `[data-hero-id="${hid}"]:not([data-skin-id]):not([data-cosmetic-id]):not(.cosmetic-card):not(.shop-card):not(.market-card)`,
            );
            if (hBtn) {
              hBtn.click();
              await new Promise((r) => requestAnimationFrame(r));
              if (await tryClickAchCard()) return true;
            }
          }
          return false;
        }, HERO_IDS);

        assert.equal(foundAchSkin, true, 'Expected achievement-exclusive skin card visible in .cosmetic-shop-modal');
        const after = await readNormalizedSave(s.page);
        assert.equal(after.coins, 99_999, 'Achievement-exclusive skin must never deduct copper');
        assert.equal(after.ownedCosmetics.filter((x) => x !== 'default' && !/default$/i.test(x)).length, 0);
        s.assertNoErrors('T2-F8-03');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T2-F8-04',
    tier: 2,
    feature: 'F8',
    name: 'Cloud Save cosmeticShopSpent anti-exploit: spending copper on skin is NOT refunded by pre-purchase cloud snapshot',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser, { isolated: true });
      try {
        await bootToHub(s.page, baseUrl, {
          query: 'mockCloud=1',
          savePatch: { coins: 2000, unlockedHeroes: HERO_IDS },
        });

        await s.page.evaluate(async () => {
          const w = window.__wugeng;
          w.save.updatedAt = 1700000050000;
          await w.cloud.uploadNow(w.save);
        });

        await fastClick(s.page, '[data-action="open-market"]');
        await requireOpenSelector(s.page, '.cosmetic-shop-modal');
        const buyRes = await shopBuyAndEquipInModal(s.page, {
          kind: 'vfx',
          vfxId: 'jade_ghostfire',
          buy: true,
          equip: false,
          close: true,
        });
        assert.equal(buyRes.ok, true, buyRes.reason || 'Failed buying jade_ghostfire');

        const res = await s.page.evaluate(async () => {
          const w = window.__wugeng;
          const postBuyCoins = w.save.coins;
          // Force exact timestamp tie with pre-purchase cloud snapshot so saveProgressScore decides!
          w.save.updatedAt = 1700000050000;
          const pull = await w.cloud.pullFromCloud(w.save);
          const merged = pull?.merged || w.save;
          return { postBuyCoins, mergedCoins: merged.coins, owned: merged.cosmetics?.owned || [] };
        });

        assert.ok(res.postBuyCoins < 2000, 'Expected purchase to spend copper');
        assert.equal(res.mergedCoins, res.postBuyCoins, 'Merged save must NOT refund spent copper from pre-purchase cloud snapshot');
        assert.ok(res.owned.includes('jade_ghostfire'), 'Merged save must retain purchased cosmetic');
        s.assertNoErrors('T2-F8-04');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T2-F8-05',
    tier: 2,
    feature: 'F8',
    name: 'Corrupt negative coins & bogus cosmetics.owned IDs sanitize cleanly + unseen 百鬼 rows mask as ？？？',
    async run({ browser, baseUrl }) {
      const tampered = JSON.stringify({
        version: 3,
        coins: -500,
        cosmetics: { owned: ['__bad_id__', null, 42], equipped: {} },
        codex: { enemies: { cinder: 1 } },
      });
      const s = await createIsolatedPage(browser, {
        beforeBootInitScript: (raw) => { localStorage.setItem('wugeng.save', raw); },
        beforeBootArg: tampered,
      });
      try {
        await bootToHub(s.page, baseUrl);
        const st = await readNormalizedSave(s.page);
        assert.equal(st.coins, 0);
        assert.equal(st.ownedCosmetics.includes('__bad_id__'), false);

        await fastClick(s.page, '[data-action="open-market"]');
        await requireOpenSelector(s.page, '.cosmetic-shop-modal');
        assert.equal(((await s.page.textContent('.cosmetic-shop-modal')) || '').includes('NaN'), false);
        await closeActiveModal(s.page, 'close-market');

        // Verify unseen enemies in 百物谱 still mask as ？？？
        await fastClick(s.page, '.hub-nav .btn:nth-child(2)');
        await s.page.evaluate(() => document.querySelectorAll('.codex-tab')[3]?.click());
        const lockedNames = await s.page.$$eval('.codex-list .codex-row.is-locked .codex-row__name', (els) => els.map((e) => e.textContent?.trim()));
        assert.equal(lockedNames.length, 11);
        assert.ok(lockedNames.every((n) => n === '？？？'));
        s.assertNoErrors('T2-F8-05');
      } finally {
        await s.close();
      }
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // F9 Boundaries (6 tests)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'T2-F9-01',
    tier: 2,
    feature: 'F9',
    name: 'Unmet achievement (799/800 kills on kills800 & minimal stats on taomujian/zhinian_kite) CANNOT be claimed',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        // A) Exact 799 / 800 off-by-one boundary specifically against kills800
        await bootToHub(s.page, baseUrl, {
          savePatch: {
            coins: 100,
            stats: { runs: 1, clears: 0, bestKills: 799, totalKills: 799, bestTimeSec: 120, totalEvolutions: 0, totalBossKills: 0 },
          },
        });
        await fastClick(s.page, '[data-action="open-achievements"]');
        await requireOpenSelector(s.page, '.achievements-modal');
        await s.page.evaluate(async () => {
          const modal = document.querySelector('.achievements-modal');
          const tryKills800 = () => {
            const rows = [...modal.querySelectorAll('[data-achievement-id], .achievement-row, .ach-row, .achievement-card')];
            for (const r of rows) {
              const isKills800 =
                r.dataset?.achievementId === 'kills800' ||
                (r.dataset?.achievementId === undefined && /800/.test((r.textContent || '').replace(/,/g, '')));
              if (isKills800) {
                r.querySelectorAll('button:not([disabled])').forEach((b) => {
                  if (/领|取|赏/.test(b.textContent || '')) b.click();
                });
              }
            }
          };
          tryKills800();
          for (const t of modal.querySelectorAll('[data-ach-tab], [data-category], [role="tab"]')) {
            t.click();
            await new Promise((r) => requestAnimationFrame(r));
            tryKills800();
          }
        });
        const after799 = await readNormalizedSave(s.page);
        assert.ok(!after799.achievements?.kills800, '799/800 kills must NOT unlock kills800');
        assert.equal(after799.achievementClaims.includes('kills800'), false, '799/800 kills must NOT claim kills800');

        // B) Minimal stats (runs: 0, kills: 5) -> 0 copper, 0 exclusive weapons (taomujian / zhinian_kite), 0 skins
        await bootToHub(s.page, baseUrl, {
          savePatch: {
            coins: 100,
            stats: { runs: 0, clears: 0, firstRunDone: false, bestKills: 5, totalKills: 5, bestTimeSec: 5, totalEvolutions: 0, totalBossKills: 0, coopRuns: 0, coopRevives: 0 },
          },
        });
        await fastClick(s.page, '[data-action="open-achievements"]');
        await requireOpenSelector(s.page, '.achievements-modal');
        await s.page.evaluate(async () => {
          const modal = document.querySelector('.achievements-modal');
          const tryAll = () => {
            modal.querySelectorAll('button:not([disabled])').forEach((b) => {
              if (/领|取|赏/.test(b.textContent || '')) b.click();
            });
          };
          tryAll();
          for (const t of modal.querySelectorAll('[data-ach-tab], [data-category], [role="tab"]')) {
            t.click();
            await new Promise((r) => requestAnimationFrame(r));
            tryAll();
          }
        });

        const afterMin = await readNormalizedSave(s.page);
        assert.equal(afterMin.coins, 100, 'Unmet achievements must grant 0 copper');
        assert.equal(afterMin.unlockedWeapons.includes('taomujian'), false);
        assert.equal(afterMin.unlockedWeapons.includes('zhinian_kite'), false);
        assert.equal(afterMin.achievementClaims.length, 0);
        s.assertNoErrors('T2-F9-01');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T2-F9-02',
    tier: 2,
    feature: 'F9',
    name: 'Double-claim idempotence: rapid synchronous double-click claim grants copper/weapon strictly once',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser, { isolated: true });
      try {
        await bootAndStartRun(s.page, baseUrl, {
          savePatch: {
            coins: 200,
            nightUnlocked: 5,
            nightCleared: 3,
            stats: { runs: 10, clears: 3, firstRunDone: true, bestKills: 1500, totalKills: 5000, totalBossKills: 8, totalEvolutions: 8 },
          },
          seed: 2902,
        });
        await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          r.time = 605;
          r.stats.kills = 950;
          window.__wugeng.game.finish();
          window.__wugeng.game.clear();
          window.__wugeng.save.coins = 200;
          window.__wugeng.persist(false);
          window.__wugeng.showHub();
        });
        await s.page.waitForSelector('.screen--hub');
        await fastClick(s.page, '[data-action="open-achievements"]');
        await requireOpenSelector(s.page, '.achievements-modal');

        await s.page.evaluate(async () => {
          const modal = document.querySelector('.achievements-modal');
          const doubleClaimVisible = () => {
            const claimBtns = [...modal.querySelectorAll('button:not([disabled])')].filter((b) => /领|取|赏/.test(b.textContent || ''));
            for (const btn of claimBtns) {
              btn.click();
              btn.click();
            }
          };
          doubleClaimVisible();
          for (const t of modal.querySelectorAll('[data-ach-tab], [data-category], [role="tab"]')) {
            t.click();
            await new Promise((r) => requestAnimationFrame(r));
            doubleClaimVisible();
          }
        });
        const coinsAfterFirstPass = await s.page.evaluate(() => window.__wugeng.save.coins);

        // Second pass across all tabs — must grant 0 additional coins
        await s.page.evaluate(async () => {
          const modal = document.querySelector('.achievements-modal');
          const clickAgain = () => {
            modal?.querySelectorAll('button:not([disabled])').forEach((b) => {
              if (/领|取|赏/.test(b.textContent || '')) b.click();
            });
          };
          clickAgain();
          for (const t of modal?.querySelectorAll('[data-ach-tab], [data-category], [role="tab"]') || []) {
            t.click();
            await new Promise((r) => requestAnimationFrame(r));
            clickAgain();
          }
        });
        const st = await readNormalizedSave(s.page);
        assert.ok(
          coinsAfterFirstPass > 200 || st.achievementClaims.length >= 1,
          `Expected >= 1 met achievement claimed on first pass (coins=${coinsAfterFirstPass}, claims=${st.achievementClaims.length})`,
        );
        assert.equal(st.coins, coinsAfterFirstPass, 'Repeated claim attempts must grant 0 duplicate coins');
        assert.equal(st.achievementClaims.length, new Set(st.achievementClaims).size, 'Zero duplicate IDs in achievementClaims');
        assert.equal(st.unlockedWeapons.length, new Set(st.unlockedWeapons).size, 'Zero duplicate IDs in unlockedWeapons');
        s.assertNoErrors('T2-F9-02');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T2-F9-03',
    tier: 2,
    feature: 'F9',
    name: 'Monotonic progress invariant: short 5s 0-kill death run NEVER regresses bestKills or cumulative totalKills',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, {
          savePatch: { stats: { runs: 4, bestKills: 650, totalKills: 1200, bestTimeSec: 420 } },
          seed: 2903,
        });
        await s.page.evaluate(() => {
          window.__wugeng.game.run.time = 5;
          window.__wugeng.game.run.stats.kills = 0;
          window.__wugeng.game.finish();
        });
        const stats = await s.page.evaluate(() => window.__wugeng.save.stats);
        assert.equal(stats.bestKills, 650, 'bestKills must never regress on 0-kill run');
        assert.ok(stats.totalKills >= 1200, 'totalKills must never decrease');
        assert.equal(stats.bestTimeSec, 420);
        s.assertNoErrors('T2-F9-03');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T2-F9-04',
    tier: 2,
    feature: 'F9',
    name: 'Legacy v1 achievements timestamps (firstClear, kills800) reconcile cleanly without locking out v3 rewards',
    async run({ browser, baseUrl }) {
      const legacy = JSON.stringify({
        version: 1,
        coins: 300,
        unlockedHeroes: ['zhou', 'mian'],
        achievements: { firstClear: 1700000000000, kills800: 1700000000000 },
        stats: { runs: 3, clears: 1, bestKills: 850, totalKills: 1600 },
      });
      const s = await createIsolatedPage(browser, {
        beforeBootInitScript: (raw) => { localStorage.setItem('wugeng.save', raw); },
        beforeBootArg: legacy,
      });
      try {
        await bootToHub(s.page, baseUrl);
        await fastClick(s.page, '[data-action="open-achievements"]');
        await requireOpenSelector(s.page, '.achievements-modal');
        await s.page.evaluate(() => {
          document.querySelectorAll('.achievements-modal button:not([disabled])').forEach((b) => {
            if (/领|取|赏/.test(b.textContent || '')) b.click();
          });
        });
        const ach = await s.page.evaluate(() => window.__wugeng.save.achievements);
        assert.ok(ach.firstClear && ach.kills800, 'Legacy unlocked achievement timestamps must remain unlocked');
        s.assertNoErrors('T2-F9-04');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T2-F9-05',
    tier: 2,
    feature: 'F9',
    name: 'Claimed achievement rewards (taomujian / achievementClaims) persist across full page.reload()',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser, { isolated: true });
      try {
        await bootToHub(s.page, baseUrl, {
          savePatch: {
            unlockedHeroes: HERO_IDS,
            nightUnlocked: 10,
            nightCleared: 10,
            stats: {
              runs: 25,
              clears: 8,
              firstRunDone: true,
              bestTimeSec: 1000,
              bestKills: 3000,
              bestHit: 40_000,
              totalKills: 20_000,
              totalEvolutions: 25,
              totalBossKills: 20,
              coopRuns: 5,
              coopRevives: 5,
            },
          },
        });
        await fastClick(s.page, '[data-action="open-achievements"]');
        await s.page.evaluate(async () => {
          const modal = document.querySelector('.achievements-modal');
          const claimAll = () => {
            modal.querySelectorAll('button:not([disabled])').forEach((b) => {
              if (/领|取|赏/.test(b.textContent || '')) b.click();
            });
          };
          claimAll();
          for (const t of modal.querySelectorAll('[data-ach-tab], [data-category], [role="tab"]')) {
            t.click();
            await new Promise((r) => requestAnimationFrame(r));
            claimAll();
          }
        });
        const beforeReload = await readNormalizedSave(s.page);
        assert.ok(beforeReload.unlockedWeapons.includes('taomujian'));

        await s.page.reload();
        await s.page.waitForSelector('.screen--title');
        const afterReload = await readNormalizedSave(s.page);
        assert.ok(afterReload.unlockedWeapons.includes('taomujian'), 'Unlocked taomujian must survive page.reload()');
        assert.deepEqual(afterReload.achievementClaims, beforeReload.achievementClaims);
        s.assertNoErrors('T2-F9-05');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T2-F9-06',
    tier: 2,
    feature: 'F9',
    name: 'Extreme current > target (totalKills = 999,999) clamps progress bar fill <= 100% without overflow on 360x780',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser, { viewport: { width: 360, height: 780 }, deviceScaleFactor: 2 });
      try {
        await bootToHub(s.page, baseUrl, {
          savePatch: { stats: { totalKills: 999_999, bestKills: 999_999, runs: 999 } },
        });
        await fastClick(s.page, '[data-action="open-achievements"]');
        await requireOpenSelector(s.page, '.achievements-modal');

        const fit = await s.page.evaluate(() => {
          const modal = document.querySelector('.achievements-modal');
          const bars = [
            ...modal.querySelectorAll(
              'progress, [role="progressbar"], .progress-fill, .ach-bar__fill, .ach-progress__fill, .ach-fill, .bar-fill, [data-progress-fill]',
            ),
          ];
          let overflowBars = 0;
          for (const el of bars) {
            if (el.tagName === 'PROGRESS') {
              if (Number.isFinite(el.max) && el.max > 0 && el.value > el.max + 1e-6) overflowBars++;
              const r = el.getBoundingClientRect();
              const pr = el.parentElement?.getBoundingClientRect();
              if (pr && r.width > pr.width + 2) overflowBars++;
            } else if (el.getAttribute('role') === 'progressbar' && el.firstElementChild) {
              const tr = el.getBoundingClientRect();
              const fr = el.firstElementChild.getBoundingClientRect();
              if (fr.width > tr.width + 2) overflowBars++;
            } else {
              const p = el.parentElement;
              if (p) {
                const fr = el.getBoundingClientRect();
                const pr = p.getBoundingClientRect();
                if (fr.width > pr.width + 2) overflowBars++;
              }
            }
          }
          return {
            sw: document.documentElement.scrollWidth,
            cw: document.documentElement.clientWidth,
            barCount: bars.length,
            overflowBars,
          };
        });
        assert.ok(fit.barCount > 0, 'Expected >= 1 rendered progress bar element in .achievements-modal');
        assert.equal(fit.overflowBars, 0, 'Progress bar fills must clamp <= 100% of track width');
        assert.ok(fit.sw <= fit.cw + 1);
        s.assertNoErrors('T2-F9-06');
      } finally {
        await s.close();
      }
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // F10 Boundaries (7 tests)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'T2-F10-01',
    tier: 2,
    feature: 'F10',
    name: 'Pressing Escape while .veil--inspector is open dismisses ONLY .veil--inspector (never closes .overlay--levelup)',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { seed: 21001 });
        await triggerLevelUp(s.page);
        await fastClick(s.page, '[data-action="inspect-loadout"]');
        await requireOpenSelector(s.page, '.veil--inspector');

        await s.page.keyboard.press('Escape');
        const state = await s.page.evaluate(() => ({
          inspectorOpen: window.__wugeng.inspectorOpen,
          inspectorCount: document.querySelectorAll('.veil--inspector').length,
          overlay: window.__wugeng.overlay,
          paused: window.__wugeng.game.isPaused(),
          qianCount: document.querySelectorAll('.overlay--levelup .qian').length,
        }));
        assert.equal(state.inspectorOpen, false);
        assert.equal(state.inspectorCount, 0);
        assert.equal(state.overlay, 'levelup', 'Escape must NOT close underlying .overlay--levelup');
        assert.equal(state.paused, true);
        assert.equal(state.qianCount, 3);
        s.assertNoErrors('T2-F10-01');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T2-F10-02',
    tier: 2,
    feature: 'F10',
    name: 'Clicking .veil--inspector backdrop does NOT click through onto underlying .qian selection slips',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { seed: 21002 });
        await triggerLevelUp(s.page);
        const before = await s.page.evaluate(() => ({
          choicesJson: JSON.stringify(window.__wugeng.game.run.choices),
          weaponsJson: JSON.stringify(window.__wugeng.game.run.weapons),
        }));
        await fastClick(s.page, '[data-action="inspect-loadout"]');
        await requireOpenSelector(s.page, '.veil--inspector');

        const probe = await s.page.evaluate(() => {
          const veil = document.querySelector('.veil--inspector');
          const qians = [...document.querySelectorAll('.overlay--levelup .qian')];
          const q0 = qians[0];
          const qr = q0.getBoundingClientRect();
          const qx = Math.round(qr.left + qr.width / 2);
          const qy = Math.round(qr.top + qr.height / 2);
          const hitOverQian = document.elementFromPoint(qx, qy);
          const coveredByInspector = Boolean(hitOverQian && veil.contains(hitOverQian));
          const leakedToQian = Boolean(hitOverQian && hitOverQian.closest('.qian'));

          let inner = veil.querySelector(
            '.scroll, .inspector-panel, .inspector-card, .modal-card, .inspector-drawer, .inspector-body, .inspector-sheet, .inspector-content',
          );
          if (!inner && veil.children.length > 0) {
            let bestArea = -1;
            for (const ch of veil.children) {
              const r = ch.getBoundingClientRect();
              const area = Math.max(0, r.width) * Math.max(0, r.height);
              if (area > bestArea) {
                bestArea = area;
                inner = ch;
              }
            }
          }
          const ir = inner?.getBoundingClientRect();

          // Prefer an exposed backdrop point outside inner panel (ideally overlapping an underlying .qian card if exposed)
          const candidates = [];
          for (const q of qians) {
            const r = q.getBoundingClientRect();
            candidates.push(
              [Math.round(r.left + 8), Math.round(r.top + 8)],
              [Math.round(r.right - 8), Math.round(r.bottom - 8)],
              [Math.round(r.left + r.width / 2), Math.round(r.top + 6)],
              [Math.round(r.left + r.width / 2), Math.round(r.bottom - 6)],
            );
          }
          if (ir) {
            if (ir.top > 10) candidates.push([Math.round(window.innerWidth / 2), Math.max(4, Math.floor(ir.top / 2))]);
            if (ir.bottom < window.innerHeight - 10) {
              candidates.push([Math.round(window.innerWidth / 2), Math.min(window.innerHeight - 4, Math.ceil((ir.bottom + window.innerHeight) / 2))]);
            }
            if (ir.left > 6) candidates.push([Math.max(2, Math.floor(ir.left / 2)), Math.round(window.innerHeight / 2)]);
            if (ir.right < window.innerWidth - 6) {
              candidates.push([Math.min(window.innerWidth - 2, Math.ceil((ir.right + window.innerWidth) / 2)), Math.round(window.innerHeight / 2)]);
            }
          }
          candidates.push([8, 8], [window.innerWidth - 8, 8], [8, window.innerHeight - 8]);

          let backdropPt = null;
          for (const [cx, cy] of candidates) {
            if (cx < 1 || cy < 1 || cx >= window.innerWidth - 1 || cy >= window.innerHeight - 1) continue;
            const el = document.elementFromPoint(cx, cy);
            if (el && veil.contains(el) && (!inner || !inner.contains(el) || el === veil)) {
              backdropPt = { x: cx, y: cy };
              break;
            }
          }
          return { coveredByInspector, leakedToQian, backdropPt };
        });

        assert.equal(probe.coveredByInspector, true, 'elementFromPoint over .qian center must hit .veil--inspector');
        assert.equal(probe.leakedToQian, false, 'elementFromPoint over .qian center must NEVER hit underlying .qian');

        if (probe.backdropPt) {
          await s.page.mouse.click(probe.backdropPt.x, probe.backdropPt.y);
        } else {
          await s.page.evaluate(() => {
            document.querySelector('.veil--inspector')?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
          });
        }

        const after = await s.page.evaluate(() => ({
          inspectorOpen: Boolean(window.__wugeng.inspectorOpen),
          inspectorDom: Boolean(document.querySelector('.veil--inspector')),
          overlay: window.__wugeng.overlay,
          paused: window.__wugeng.game.isPaused(),
          choicesCount: window.__wugeng.game.run.choices.length,
          choicesJson: JSON.stringify(window.__wugeng.game.run.choices),
          weaponsJson: JSON.stringify(window.__wugeng.game.run.weapons),
        }));
        assert.equal(after.overlay, 'levelup', 'Backdrop click must NEVER click through onto .qian or close .overlay--levelup');
        assert.equal(after.paused, true, 'Game must stay paused on .overlay--levelup after backdrop click');
        assert.equal(after.choicesCount, 3);
        assert.equal(after.choicesJson, before.choicesJson, 'Underlying .qian choices must remain untouched');
        assert.equal(after.weaponsJson, before.weaponsJson, 'Equipped weapons must not mutate from backdrop click');
        assert.equal(after.inspectorOpen, after.inspectorDom, 'window.__wugeng.inspectorOpen must stay synchronized with .veil--inspector DOM');
        s.assertNoErrors('T2-F10-02');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T2-F10-03',
    tier: 2,
    feature: 'F10',
    name: 'Rapid x4 open -> close toggle of [data-action="inspect-loadout"] stacks <= 1 .veil--inspector & preserves RNG/choices',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { seed: 21003 });
        await triggerLevelUp(s.page);
        const choices0 = await s.page.evaluate(() => JSON.stringify(window.__wugeng.game.run.choices));

        for (let i = 0; i < 4; i++) {
          await fastClick(s.page, '[data-action="inspect-loadout"]');
          assert.equal(await s.page.locator('.veil--inspector').count(), 1);
          await fastClick(s.page, '[data-action="close-inspector"]');
          assert.equal(await s.page.locator('.veil--inspector').count(), 0);
        }

        const choicesAfter = await s.page.evaluate(() => JSON.stringify(window.__wugeng.game.run.choices));
        assert.equal(choicesAfter, choices0);
        s.assertNoErrors('T2-F10-03');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T2-F10-04',
    tier: 2,
    feature: 'F10',
    name: 'Closing .veil--inspector while peek-battlefield is active resets opacity cleanly on next reopen',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { seed: 21004 });
        await triggerLevelUp(s.page);
        await fastClick(s.page, '[data-action="inspect-loadout"]');
        const peek = await engageInspectorPeek(s.page);
        assert.ok(peek.state.effectiveOpacity <= 0.45);

        await s.page.keyboard.press('Escape');
        if (await s.page.$('.veil--inspector')) {
          await fastClick(s.page, '[data-action="close-inspector"]');
        }
        await fastClick(s.page, '[data-action="inspect-loadout"]');
        const reopened = await readInspectorOpacity(s.page);
        assert.ok(
          reopened && reopened.effectiveOpacity >= 0.85,
          `Reopened .veil--inspector must start at full readable opacity (>= 0.85), got ${JSON.stringify(reopened)}`,
        );
        s.assertNoErrors('T2-F10-04');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T2-F10-05',
    tier: 2,
    feature: 'F10',
    name: 'Single-eligible-weapon .overlay--chest Branch 2 supports [data-action="inspect-loadout"] without duplicate reward',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { seed: 21005 });
        await grantItemViaLevelUp(s.page, 'weapon', 'gong', 4);
        await grantItemViaLevelUp(s.page, 'relic', 'clapper', 1);

        await triggerChest(s.page);
        await fastClick(s.page, '[data-action="inspect-loadout"]', 'Expected [data-action="inspect-loadout"] in single-evo chest');
        await requireOpenSelector(s.page, '.veil--inspector');
        await fastClick(s.page, '[data-action="close-inspector"]');

        if (await s.page.$('[data-action="confirm-chest"]')) {
          await fastClick(s.page, '[data-action="confirm-chest"]');
        } else {
          await fastClick(s.page, '#ui .veil .btn--seal');
        }
        const st = await s.page.evaluate(() => ({
          evolved: window.__wugeng.game.run.weapons.find((w) => w.id === 'gong')?.evolved,
          overlay: window.__wugeng.overlay,
          status: window.__wugeng.game.run.status,
        }));
        assert.equal(st.evolved, true);
        assert.equal(st.overlay, null);
        assert.equal(st.status, 'playing');
        s.assertNoErrors('T2-F10-05');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T2-F10-06',
    tier: 2,
    feature: 'F10',
    name: 'Early-run minimal 1W+0R loadout renders .selection-owned-bar & .veil--inspector cleanly with 0 undefined/NaN text',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { seed: 21006 });
        await triggerLevelUp(s.page);
        await requireOpenSelector(s.page, '.selection-owned-bar');
        await fastClick(s.page, '[data-action="inspect-loadout"]');
        const txt = (await s.page.textContent('.veil--inspector')) || '';
        assert.equal(/undefined|NaN|null/i.test(txt), false, `Unexpected undefined/NaN in minimal inspector: ${txt}`);
        s.assertNoErrors('T2-F10-06');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T2-F10-07',
    tier: 2,
    feature: 'F10',
    name: 'Narrow 360x780 viewport fits .selection-owned-bar (6+6) & .veil--inspector with zero horizontal overflow',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser, { viewport: { width: 360, height: 780 }, deviceScaleFactor: 2 });
      try {
        await bootAndStartRun(s.page, baseUrl, {
          unlockedWeapons: ALL_WEAPON_IDS,
          savePatch: { unlockedWeapons: ALL_WEAPON_IDS },
          seed: 21007,
        });
        for (const wid of ['talisman', 'bell', 'compass', 'suohun_chain', 'nuo_drum']) {
          await grantItemViaLevelUp(s.page, 'weapon', wid, 1);
        }
        for (const rid of ['clapper', 'cinnabar', 'redstring', 'bagua', 'yinpai', 'wuse_mask']) {
          await grantItemViaLevelUp(s.page, 'relic', rid, 1);
        }

        await triggerLevelUp(s.page);
        const barFit = await s.page.$eval('.selection-owned-bar', (el) => {
          const r = el.getBoundingClientRect();
          return { left: r.left, right: r.right, vw: window.innerWidth };
        });
        assert.ok(barFit.left >= -1 && barFit.right <= barFit.vw + 1, `360px overflow in .selection-owned-bar: ${JSON.stringify(barFit)}`);

        await fastClick(s.page, '[data-action="inspect-loadout"]');
        const inspFit = await s.page.evaluate(() => ({
          sw: document.documentElement.scrollWidth,
          cw: document.documentElement.clientWidth,
        }));
        assert.ok(inspFit.sw <= inspFit.cw + 1);
        await fastClick(s.page, '[data-action="close-inspector"]');
        assert.equal(await s.page.evaluate(() => window.__wugeng.overlay), 'levelup');
        s.assertNoErrors('T2-F10-07');
      } finally {
        await s.close();
      }
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // F11 Boundaries (5 tests)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'T2-F11-01',
    tier: 2,
    feature: 'F11',
    name: 'cosmeticShopSpent timestamp-tie anti-coin-duplication guard on mergeSaves / pullFromCloud',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser, { isolated: true });
      try {
        await bootToHub(s.page, baseUrl, {
          query: 'mockCloud=1',
          savePatch: { coins: 2500, unlockedHeroes: HERO_IDS },
        });
        await s.page.evaluate(async () => {
          window.__wugeng.save.updatedAt = 1700000010000;
          await window.__wugeng.cloud.uploadNow(window.__wugeng.save);
        });

        await fastClick(s.page, '[data-action="open-market"]');
        await requireOpenSelector(s.page, '.cosmetic-shop-modal');
        const buySkin = await shopBuyAndEquipInModal(s.page, {
          kind: 'skin',
          heroId: 'zhou',
          targetIdx: 1,
          buy: true,
          equip: false,
          close: false,
        });
        assert.equal(buySkin.ok, true, buySkin.reason || 'Failed buying skin in T2-F11-01');
        const buyVfx = await shopBuyAndEquipInModal(s.page, {
          kind: 'vfx',
          vfxId: 'violet_thunder',
          buy: true,
          equip: false,
          close: true,
        });
        assert.equal(buyVfx.ok, true, buyVfx.reason || 'Failed buying violet_thunder in T2-F11-01');

        const res = await s.page.evaluate(async () => {
          const w = window.__wugeng;
          const postSpend = w.save.coins;
          const ownedBefore = [...(w.save.cosmetics?.owned || [])];
          w.save.updatedAt = 1700000010000; // exact timestamp tie with pre-spend 2500-coin cloud archive!
          const pull = await w.cloud.pullFromCloud(w.save);
          const merged = pull?.merged || w.save;
          return { postSpend, mergedCoins: merged.coins, mergedOwned: merged.cosmetics?.owned || [], ownedBefore };
        });

        assert.ok(res.postSpend < 2500, 'Expected skin + VFX purchases to spend coins');
        assert.equal(res.mergedCoins, res.postSpend, 'Timestamp-tie merge must NOT restore pre-purchase 2500 coins');
        assert.ok(res.ownedBefore.every((id) => res.mergedOwned.includes(id)));
        s.assertNoErrors('T2-F11-01');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T2-F11-02',
    tier: 2,
    feature: 'F11',
    name: '62s upload cooldown (reason === "cooldown") & TapTap 400001 rate-limit error resilience',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser, { isolated: true });
      try {
        await bootToHub(s.page, baseUrl, { query: 'mockCloud=1', savePatch: { coins: 500 } });
        const cooldownRes = await s.page.evaluate(async () => {
          const w = window.__wugeng;
          const up1 = await w.cloud.uploadNow(w.save);
          const up2 = await w.cloud.uploadNow(w.save);
          return { up1, up2 };
        });
        assert.equal(cooldownRes.up1.ok, true);
        assert.equal(cooldownRes.up2.ok, false);
        assert.equal(cooldownRes.up2.reason, 'cooldown');
        s.assertNoErrors('T2-F11-02-cooldown');
      } finally {
        await s.close();
      }

      const sRate = await createIsolatedPage(browser, {
        beforeBootInitScript: () => {
          window.tap = {
            getCloudSaveManager() {
              return {
                createArchive(opts) { opts?.fail?.({ errno: 400001, errMsg: 'rate limit exceeded' }); },
                updateArchive(opts) { opts?.fail?.({ errno: 400001, errMsg: 'rate limit exceeded' }); },
                getArchiveList(opts) { opts?.success?.({ archives: [] }); },
              };
            },
            getFileSystemManager() {
              return { writeFile(opts) { opts?.success?.({}); } };
            },
          };
        },
      });
      try {
        await bootToHub(sRate.page, baseUrl);
        const failRes = await sRate.page.evaluate(async () => {
          const r = await window.__wugeng.cloud.uploadNow(window.__wugeng.save);
          return { ok: r?.ok ?? false };
        });
        assert.equal(failRes.ok, false);
        sRate.assertNoErrors('T2-F11-02-400001');
      } finally {
        await sRate.close();
      }
    },
  },
  {
    id: 'T2-F11-03',
    tier: 2,
    feature: 'F11',
    name: 'Corrupt localStorage["wugeng.save"] backs up wugeng.save.broken & corrupt cloud JSON preserves local save',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser, {
        beforeBootInitScript: () => {
          localStorage.setItem('wugeng.save', '{corrupt_v3: [');
        },
      });
      try {
        await bootToHub(s.page, baseUrl, { query: 'mockCloud=1' });
        const recovered = await s.page.evaluate(async () => {
          const broken = localStorage.getItem('wugeng.save.broken');
          const ver = window.__wugeng.save.version;
          const coins0 = window.__wugeng.save.coins;

          window.__wugeng.save.coins = 777;
          sessionStorage.setItem('wugeng.mockCloudArchive', '{{bad_cloud_json');
          await window.__wugeng.cloud.pullFromCloud(window.__wugeng.save).catch(() => null);
          const coinsAfterBadOuter = window.__wugeng.save.coins;

          sessionStorage.setItem(
            'wugeng.mockCloudArchive',
            JSON.stringify({ meta: { uuid: 'u1', fileId: 'f1', name: 'wugeng_save' }, data: '{{bad_cloud_json' }),
          );
          await window.__wugeng.cloud.pullFromCloud(window.__wugeng.save).catch(() => null);
          const coinsAfterBadData = window.__wugeng.save.coins;
          return { broken, ver, coins0, coinsAfterBadOuter, coinsAfterBadData };
        });
        assert.equal(recovered.broken, '{corrupt_v3: [');
        assert.equal(recovered.ver, SAVE_VERSION);
        assert.equal(recovered.coins0, 0);
        assert.equal(recovered.coinsAfterBadOuter, 777, 'Corrupt outer cloud archive JSON must preserve local save');
        assert.equal(recovered.coinsAfterBadData, 777, 'Corrupt inner cloud archive data JSON must preserve local save');
        s.assertNoErrors('T2-F11-03');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T2-F11-04',
    tier: 2,
    feature: 'F11',
    name: 'Prototype pollution (__proto__), NaN/negative coins, bogus skin/VFX/weapon IDs & XSS daoName sanitized',
    async run({ browser, baseUrl }) {
      const malicious =
        '{"version":3,"coins":-9999,"__proto__":{"pwned":1},"selectedHero":"__bad__","selectedStarterWeapon":"__unowned__","unlockedWeapons":["__fake__"],"cosmetics":{"owned":["__fake__"],"equipped":{"attackVfx":"__fake__","heroSkins":{"zhou":"__unowned_skin__"}}},"leaderboard":{"bestScore":"NaN","pendingScore":-50},"daoName":"<img src=x onerror=window.__xss=1>超长名字测试一二三四五六七八"}';
      const s = await createIsolatedPage(browser, {
        beforeBootInitScript: (raw) => { localStorage.setItem('wugeng.save', raw); },
        beforeBootArg: malicious,
      });
      try {
        await bootToHub(s.page, baseUrl);
        const check = await s.page.evaluate(() => {
          const sv = window.__wugeng.save;
          return {
            protoClean: ({}).pwned === undefined,
            xssClean: window.__xss === undefined,
            coins: sv.coins,
            hero: sv.selectedHero,
            hasFakeWeapon: (sv.unlockedWeapons || []).includes('__fake__'),
            hasFakeCosmetic: (sv.cosmetics?.owned || []).includes('__fake__'),
            bestScore: sv.leaderboard?.bestScore,
            pendingScore: sv.leaderboard?.pendingScore,
            daoName: sv.daoName,
          };
        });
        assert.equal(check.protoClean, true);
        assert.equal(check.xssClean, true);
        assert.equal(check.coins, 0);
        assert.equal(check.hero, 'zhou');
        assert.equal(check.hasFakeWeapon, false);
        assert.equal(check.hasFakeCosmetic, false);
        assert.equal(check.bestScore, 0);
        assert.equal(check.pendingScore, 0);
        assert.ok(check.daoName.length <= 12 && !/[<>]/.test(check.daoName), `Expected sanitized <=12-char daoName, got '${check.daoName}'`);
        s.assertNoErrors('T2-F11-04');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T2-F11-05',
    tier: 2,
    feature: 'F11',
    name: 'Offline non-TapTap cloud fallback & future check-in date (2099-12-31) anti-rollback guard',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser, { isolated: true });
      try {
        await bootToHub(s.page, baseUrl);
        await fastClick(s.page, '[data-action="quick-cloud"]');

        await bootToHub(s.page, baseUrl, {
          query: 'mockAds=1',
          savePatch: { checkin: { cycleDay: 1, lastClaimDate: '2099-12-31', cycles: 0, totalClaims: 1 } },
        });
        await fastClick(s.page, '.hub-nav .btn:nth-child(3)');
        await s.page.waitForSelector('.checkin-grid');
        assert.equal(await s.page.locator('.checkin-foot .btn--ad').count(), 0);
        const sealBtns = await s.page.$$eval('.checkin-foot .btn--seal', (els) => els.map((e) => e.textContent || ''));
        assert.equal(sealBtns.some((t) => t.includes('画押领取')), false);
        s.assertNoErrors('T2-F11-05');
      } finally {
        await s.close();
      }
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // F12 Boundaries (5 tests)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'T2-F12-01',
    tier: 2,
    feature: 'F12',
    name: 'Friend-permission errors 1025 / 103 / 104 (2-arg onFailure(code, msg)) on friends tab show Chinese notice w/ 0 errors',
    async run({ browser, baseUrl }) {
      const assertFriendlyPermissionFallback = (lb, label) => {
        assert.ok(
          /权限|授权|未开通|暂未|暂不可用|无法|本地|本机|荣誉/.test(lb.bodyText),
          `[${label}] Expected Chinese permission/fallback notice in leaderboard modal body, got '${lb.bodyText}'`,
        );
        assert.equal(
          /friend permission not granted|undefined|\[object Object\]/i.test(lb.fullText),
          false,
          `[${label}] Leaderboard modal must NOT leak raw SDK error string or undefined: '${lb.fullText}'`,
        );
      };

      const sMockQuery = await createIsolatedPage(browser, { isolated: true });
      try {
        await bootToHub(sMockQuery.page, baseUrl, { query: 'mockLeaderboard=1025' });
        await fastClick(sMockQuery.page, '[data-action="open-leaderboard"]');
        await requireOpenSelector(sMockQuery.page, '.leaderboard-modal');
        await fastClick(sMockQuery.page, '[data-collection="friends"]');
        await sMockQuery.page.waitForTimeout(80);
        const lbQuery = await readLeaderboardBodyText(sMockQuery.page);
        assertFriendlyPermissionFallback(lbQuery, 'mockLeaderboard=1025');
        sMockQuery.assertNoErrors('T2-F12-01-query');
      } finally {
        await sMockQuery.close();
      }

      for (const errCode of [1025, 103, 104]) {
        const s = await createIsolatedPage(browser, {
          beforeBootInitScript: (code) => {
            window.tap = {
              getLeaderboardManager() {
                return {
                  loadLeaderboardScores(params) {
                    if (params?.collection === 'friends') {
                      params?.callback?.onFailure?.(code, 'friend permission not granted');
                    } else {
                      params?.callback?.onSuccess?.({ scores: [{ rank: 1, score: 12000, user: { name: '道友甲' } }] });
                    }
                  },
                  loadCurrentPlayerLeaderboardScore(p) { p?.callback?.onSuccess?.({}); },
                  submitScores(p) { p?.callback?.onSuccess?.({}); },
                  openLeaderboard(p) { p?.callback?.onSuccess?.({}); },
                };
              },
            };
          },
          beforeBootArg: errCode,
        });
        try {
          await bootToHub(s.page, baseUrl);
          await fastClick(s.page, '[data-action="open-leaderboard"]');
          await requireOpenSelector(s.page, '.leaderboard-modal');
          await fastClick(s.page, '[data-collection="friends"]');
          await s.page.waitForTimeout(80);
          const lbErr = await readLeaderboardBodyText(s.page);
          assertFriendlyPermissionFallback(lbErr, `onFailure(${errCode}, msg)`);
          await fastClick(s.page, '[data-collection="public"]');
          await s.page.waitForTimeout(60);
          const lbPub = await readLeaderboardBodyText(s.page);
          assert.ok(lbPub.bodyText.includes('12000') || lbPub.bodyText.includes('12,000') || lbPub.bodyText.includes('道友甲'));
          s.assertNoErrors(`T2-F12-01-${errCode}`);
        } finally {
          await s.close();
        }
      }
    },
  },
  {
    id: 'T2-F12-02',
    tier: 2,
    feature: 'F12',
    name: '500001 error & pure offline browser (window.tap === undefined) render descending local woodblock honor board',
    async run({ browser, baseUrl }) {
      for (const query of ['mockLeaderboard=500001', '']) {
        const s = await createIsolatedPage(browser, { isolated: true });
        try {
          await bootAndStartRun(s.page, baseUrl, { query, seed: 21202 });
          const s1 = await s.page.evaluate(() => {
            window.__wugeng.game.run.time = 60;
            window.__wugeng.game.run.stats.kills = 30;
            const sum = window.__wugeng.game.finish();
            window.__wugeng.game.clear();
            window.__wugeng.showHub();
            return sum.score;
          });
          await s.page.waitForSelector('.screen--hub');
          await fastClick(s.page, '.hub-foot .btn--seal, .btn--big');
          await stepFrames(s.page, 2);
          const s2 = await s.page.evaluate(() => {
            window.__wugeng.game.run.time = 300;
            window.__wugeng.game.run.stats.kills = 400;
            const sum = window.__wugeng.game.finish();
            window.__wugeng.game.clear();
            window.__wugeng.showHub();
            return sum.score;
          });
          await s.page.waitForSelector('.screen--hub');

          await fastClick(s.page, '[data-action="open-leaderboard"]');
          await requireOpenSelector(s.page, '.leaderboard-modal');
          await s.page.waitForTimeout(60);
          const txt = ((await s.page.textContent('.leaderboard-modal')) || '').replace(/,/g, '');
          const hi = String(Math.max(s1, s2));
          const lo = String(Math.min(s1, s2));
          assert.ok(txt.includes(hi), `Expected local honor board to display top score ${hi}: ${txt}`);
          if (s1 !== s2 && txt.includes(lo)) {
            assert.ok(txt.indexOf(hi) <= txt.indexOf(lo), `Expected descending order (${hi} before ${lo}) on local honor board`);
          }
          s.assertNoErrors(`T2-F12-02-${query || 'offline'}`);
        } finally {
          await s.close();
        }
      }
    },
  },
  {
    id: 'T2-F12-03',
    tier: 2,
    feature: 'F12',
    name: 'Float, 0, negative, NaN & Infinity score inputs clamp to safe non-negative integers & scores.length in 1..5',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser, {
        beforeBootInitScript: () => {
          window.__submittedBatches = [];
          window.tap = {
            getLeaderboardManager() {
              return {
                submitScores(p) {
                  window.__submittedBatches.push(p?.scores || []);
                  p?.callback?.onSuccess?.({ results: [] });
                },
                loadLeaderboardScores(p) { p?.callback?.onSuccess?.({ scores: [] }); },
                loadCurrentPlayerLeaderboardScore(p) { p?.callback?.onSuccess?.({}); },
                openLeaderboard(p) { p?.callback?.onSuccess?.({}); },
              };
            },
          };
        },
      });
      try {
        await bootAndStartRun(s.page, baseUrl, { seed: 21203 });
        const check = await s.page.evaluate(async () => {
          const w = window.__wugeng;
          // 1) Instant t=0, kills=0 finish
          w.game.run.time = 0;
          w.game.run.stats.kills = 0;
          const sum0 = w.game.finish();
          // 2) Edge inputs on leaderboard submit helper if exposed
          const submitFn = w.leaderboard?.submitScore || w.leaderboard?.submitRunScore || w.leaderboard?.submit;
          if (typeof submitFn === 'function') {
            for (const raw of [-42.7, 199.6, NaN, Infinity]) {
              await Promise.resolve(submitFn.call(w.leaderboard, raw)).catch(() => null);
            }
          }
          return { sum0Score: sum0.score, batches: window.__submittedBatches };
        });

        assert.ok(Number.isSafeInteger(check.sum0Score) && check.sum0Score >= 0);
        for (const batch of check.batches) {
          assert.ok(batch.length >= 1 && batch.length <= 5, `scores.length must stay in 1..5, got ${batch.length}`);
          for (const item of batch) {
            assert.ok(Number.isSafeInteger(item.score) && item.score >= 0, `Invalid non-integer/negative score submitted: ${JSON.stringify(item)}`);
          }
        }
        s.assertNoErrors('T2-F12-03');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T2-F12-04',
    tier: 2,
    feature: 'F12',
    name: 'maxSize clamped 1..200 (500198 guard) & official schema normalization (nextContinuationToken + currentUserScore)',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser, {
        beforeBootInitScript: () => {
          window.tap = {
            getLeaderboardManager() {
              return {
                loadLeaderboardScores(params) {
                  const sz = params?.maxSize ?? 20;
                  if (sz < 1 || sz > 200) {
                    params?.callback?.onFailure?.(500198, 'invalid maxSize');
                    return;
                  }
                  params?.callback?.onSuccess?.({
                    scores: [{ rank: 1, score: 54321, user: { name: '魁首道长' } }],
                    nextContinuationToken: 'page_token_2',
                  });
                },
                loadCurrentPlayerLeaderboardScore(params) {
                  params?.callback?.onSuccess?.({
                    currentUserScore: { rank: 4, score: 12345, user: { name: '本机打更人' } },
                  });
                },
                submitScores(p) { p?.callback?.onSuccess?.({}); },
                openLeaderboard(p) { p?.callback?.onSuccess?.({}); },
              };
            },
          };
        },
      });
      try {
        await bootToHub(s.page, baseUrl);
        await fastClick(s.page, '[data-action="open-leaderboard"]');
        await requireOpenSelector(s.page, '.leaderboard-modal');
        await s.page.waitForTimeout(80);

        const txt = ((await s.page.textContent('.leaderboard-modal')) || '').replace(/,/g, '');
        assert.ok(txt.includes('魁首道长') && txt.includes('54321'), `Expected normalized top entry in modal: ${txt}`);
        assert.ok(txt.includes('12345'), `Expected normalized currentUserScore (12345) in modal: ${txt}`);
        s.assertNoErrors('T2-F12-04');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T2-F12-05',
    tier: 2,
    feature: 'F12',
    name: 'Transient submitScores failure persists pendingScore in localStorage & flushes to 0 on retry',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser, {
        beforeBootInitScript: () => {
          window.__failOnce = true;
          window.tap = {
            getLeaderboardManager() {
              return {
                submitScores(p) {
                  if (window.__failOnce) {
                    window.__failOnce = false;
                    p?.callback?.onFailure?.(500000, 'transient network error');
                  } else {
                    p?.callback?.onSuccess?.({ results: [] });
                  }
                },
                loadLeaderboardScores(p) { p?.callback?.onSuccess?.({ scores: [] }); },
                loadCurrentPlayerLeaderboardScore(p) { p?.callback?.onSuccess?.({}); },
                openLeaderboard(p) { p?.callback?.onSuccess?.({}); },
              };
            },
          };
        },
      });
      try {
        await bootAndStartRun(s.page, baseUrl, { seed: 21205 });
        const afterFail = await s.page.evaluate(async () => {
          window.__wugeng.game.run.time = 150;
          window.__wugeng.game.run.stats.kills = 95;
          window.__wugeng.game.finish();
          await new Promise((r) => setTimeout(r, 60));
          const saved = JSON.parse(localStorage.getItem('wugeng.save') || '{}');
          return {
            bestScore: saved.leaderboard?.bestScore || 0,
            pendingScore: saved.leaderboard?.pendingScore || 0,
          };
        });
        assert.ok(afterFail.bestScore > 0, 'bestScore must still save locally when submitScores fails');
        assert.ok(afterFail.pendingScore > 0, `Expected positive pendingScore queued on failure, got ${afterFail.pendingScore}`);

        await fastClick(s.page, '[data-action="result-leaderboard"]');
        await s.page.waitForTimeout(100);
        const pendingAfterRetry = await s.page.evaluate(() => window.__wugeng.save.leaderboard?.pendingScore || 0);
        assert.equal(pendingAfterRetry, 0, 'Expected queued pendingScore flushed to 0 on subsequent leaderboard open/retry');
        s.assertNoErrors('T2-F12-05');
      } finally {
        await s.close();
      }
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // F13 Boundaries (5 tests)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'T2-F13-01',
    tier: 2,
    feature: 'F13',
    name: 'Malformed & XSS ?room= / ?invite= query strings (<script>, <svg onload>, 1-char, 24-char) safely rejected',
    async run({ browser, baseUrl }) {
      const payloads = [
        'room=%3Cscript%3Ewindow.__pwn%3D1%3C%2Fscript%3E',
        'invite=%22%3E%3Csvg%20onload%3Dwindow.__pwn%3D2%3E',
        'room=X',
        'room=ABCDEFGHIJKLMNOPQRSTUVWX',
      ];
      for (const q of payloads) {
        const s = await createIsolatedPage(browser, { isolated: true });
        try {
          await s.page.goto(`${baseUrl}/index.html?skipIntro=1&${q}`);
          await s.page.waitForTimeout(180);
          const check = await s.page.evaluate(() => ({
            pwn: window.__pwn,
            injectedSvg: document.querySelectorAll('#ui svg[onload], #ui script').length,
            codeAttr: document.querySelector('[data-room-code]')?.getAttribute('data-room-code') || '',
          }));
          assert.equal(check.pwn, undefined, `XSS executed on query '${q}'`);
          assert.equal(check.injectedSvg, 0);
          assert.equal(/<|>|ABCDEFGHIJKLMNOPQRSTUVWX/.test(check.codeAttr), false);
          s.assertNoErrors(`T2-F13-01-${q.slice(0, 12)}`);
        } finally {
          await s.close();
        }
      }
    },
  },
  {
    id: 'T2-F13-02',
    tier: 2,
    feature: 'F13',
    name: 'Offline browser without window.tap & denied clipboard permission falls back cleanly to toast/code display',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser, {
        beforeBootInitScript: () => {
          try {
            Object.defineProperty(navigator, 'clipboard', {
              configurable: true,
              value: {
                writeText: () => Promise.reject(new DOMException('Clipboard permission denied', 'NotAllowedError')),
              },
            });
          } catch {}
        },
      });
      try {
        await bootToHub(s.page, baseUrl);
        await fastClick(s.page, '[data-action="open-coop"]');
        await fastClick(s.page, '[data-action="coop-create"]');
        await s.page.waitForSelector('[data-room-code]');
        const preInvite = await s.page.evaluate(() => {
          const codeEl = document.querySelector('[data-room-code]');
          const roomCode = codeEl?.getAttribute('data-room-code') || (codeEl?.textContent || '').trim().match(/[A-Z0-9]{6}/i)?.[0] || '';
          const toastBefore = [...document.querySelectorAll('#ui .toast')].map((e) => e.textContent || '').join(' ');
          const modalBefore = document.querySelector('.coop-modal')?.textContent || '';
          return { roomCode, toastBefore, modalBefore };
        });

        await fastClick(s.page, '[data-action="coop-invite-friend"]');
        await s.page.waitForTimeout(90);

        const postInvite = await s.page.evaluate(() => {
          const toastAfter = [...document.querySelectorAll('#ui .toast')].map((e) => e.textContent || '').join(' ');
          const modalAfter = document.querySelector('.coop-modal')?.textContent || '';
          const extraDialog = [...document.querySelectorAll('#ui .veil:not(.coop-modal)')].map((e) => e.textContent || '').join(' ');
          return { toastAfter, modalAfter, extraDialog };
        });

        assert.ok(
          postInvite.toastAfter !== preInvite.toastBefore ||
          postInvite.modalAfter !== preInvite.modalBefore ||
          postInvite.extraDialog.length > 0,
          'Clicking [data-action="coop-invite-friend"] offline with denied clipboard must surface a new toast or share prompt',
        );
        const deltaFeedback = `${postInvite.toastAfter} ${postInvite.extraDialog} ${
          postInvite.modalAfter !== preInvite.modalBefore ? postInvite.modalAfter : ''
        }`;
        assert.ok(
          (preInvite.roomCode && deltaFeedback.toUpperCase().includes(preInvite.roomCode.toUpperCase())) ||
          /复制|分享|房号|口令|邀请/.test(deltaFeedback),
          `Expected post-click offline invite feedback to include roomCode (${preInvite.roomCode}) or Chinese copy/share prompt, got '${deltaFeedback}'`,
        );
        s.assertNoErrors('T2-F13-02');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T2-F13-03',
    tier: 2,
    feature: 'F13',
    name: 'Synchronous tap.openFriendList throw & tap.showShareboard cancel/fail handled cleanly with 0 errors',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser, {
        beforeBootInitScript: () => {
          window.tap = {
            openFriendList() {
              throw new Error('TapTap friend module unavailable');
            },
            showShareboard(opts) {
              opts?.fail?.({ errMsg: 'share canceled by user' });
            },
          };
        },
      });
      try {
        await bootToHub(s.page, baseUrl);
        await s.page.evaluate(() => window.__wugeng.friends?.openFriendList?.());
        await fastClick(s.page, '[data-action="open-coop"]');
        await fastClick(s.page, '[data-action="coop-create"]');
        await fastClick(s.page, '[data-action="coop-invite-friend"]');
        await s.page.waitForTimeout(60);
        s.assertNoErrors('T2-F13-03');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T2-F13-04',
    tier: 2,
    feature: 'F13',
    name: 'Aborted /privacy.html fetch falls back to inline privacy summary mentioning 云存档, 排行榜, 好友 & 联机',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser, { isolated: true });
      try {
        await bootGame(s.page, baseUrl);
        await s.page.route('**/privacy.html*', (route) => route.abort('failed'));
        await fastClick(s.page, '.title-foot .link-btn');
        await s.page.waitForSelector('.privacy-body');
        const txt = (await s.page.textContent('.privacy-body')) || '';
        for (const term of ['云存档', '排行榜', '好友', '联机']) {
          assert.ok(txt.includes(term), `Expected offline privacy fallback to mention '${term}', got: ${txt}`);
        }
        assert.deepEqual(s.pageErrors, []);
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T2-F13-05',
    tier: 2,
    feature: 'F13',
    name: 'Mid-combat tap.onShow empty foreground event preserves active game.run without reset or interruption',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser, {
        beforeBootInitScript: () => {
          window.__onShowList = [];
          window.tap = {
            onShow(cb) { window.__onShowList.push(cb); },
          };
        },
      });
      try {
        await bootAndStartRun(s.page, baseUrl, { seed: 21305 });
        await stepFrames(s.page, 30);
        const before = await s.page.evaluate(() => ({
          time: window.__wugeng.game.run.time,
          hp: window.__wugeng.game.run.player.hp,
        }));
        await s.page.evaluate(() => {
          for (const cb of window.__onShowList || []) cb({ scene: 1001, query: {} });
        });
        const after = await s.page.evaluate(() => ({
          status: window.__wugeng.game.run?.status,
          time: window.__wugeng.game.run?.time,
          hp: window.__wugeng.game.run?.player?.hp,
        }));
        assert.equal(after.status, 'playing');
        assert.equal(after.time, before.time);
        assert.equal(after.hp, before.hp);
        s.assertNoErrors('T2-F13-05');
      } finally {
        await s.close();
      }
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // F14 Boundaries (5 tests)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'T2-F14-01',
    tier: 2,
    feature: 'F14',
    timeoutMs: 18_000,
    name: 'Simultaneous total party wipe (ALL run.players downed === true) transitions run.status === "dead"',
    async run({ browser, baseUrl }) {
      const coop = await createCoopPages(browser, 2);
      try {
        await launchTwoPageCoopRun(coop, baseUrl);
        await coop.hostPage.evaluate(() => {
          const r = window.__wugeng.game.run;
          r.enemies.length = 0;
          r._spawnAcc = -99999;
          r.weapons.forEach((w) => { w.cd = 9999; });
          for (const p of r.players) {
            p.invulnT = 0;
            p.hp = 1;
            r.enemies.push({
              id: 895000 + p.slot, type: 'lanternghost', x: p.x, y: p.y, r: 22,
              hp: 99999, maxHp: 99999, elite: false, boss: false, hitT: 0, slowT: 0,
              state: 'move', angle: 0, speed: 0, dmg: 9999, xp: 0, atkT: 0, stateT: 0, stunT: 0,
              dx: 0, dy: 0, kbx: 0, kby: 0, dead: false,
            });
          }
        });
        await stepCoopFrames([coop.hostPage, coop.guestPage], 12, 6);

        const wipe = await coop.hostPage.evaluate(() => ({
          allDowned: window.__wugeng.game.run.players.every((p) => p.downed),
          status: window.__wugeng.game.run.status,
          overlay: window.__wugeng.overlay,
        }));
        assert.equal(wipe.allDowned, true);
        assert.equal(wipe.status, 'dead', 'When all Co-op party members are simultaneously downed, run.status must become "dead"');
        assert.equal(wipe.overlay, 'dead');
        coop.assertNoErrors('T2-F14-01');
      } finally {
        await coop.close();
      }
    },
  },
  {
    id: 'T2-F14-02',
    tier: 2,
    feature: 'F14',
    name: 'Revive circle distance boundary (d=62 > 48 progresses 0) vs dual-rescuer speedup (revives in <= 1.65s < 2.4s)',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser, { isolated: true });
      try {
        await bootToHub(s.page, baseUrl, { query: 'mockTap=1' });
        await fastClick(s.page, '[data-action="open-coop"]');
        await fastClick(s.page, '[data-action="coop-create"]');
        await fastClick(s.page, '[data-action="coop-add-bot"]');
        await fastClick(s.page, '[data-action="coop-add-bot"]');
        await fastClick(s.page, '[data-action="coop-start"]');
        await s.page.waitForFunction(() => window.__wugeng.game.run?.players?.length === 3);

        const res = await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          r.enemies.length = 0;
          r._spawnAcc = -99999;
          r._nextWaveT = 99999;
          r.weapons.forEach((w) => { w.cd = 9999; });
          const [p0, p1, p2] = r.players;
          // Temporarily disable bot AI movement so exact distance boundary can be tested
          p1.isBot = false;
          p2.isBot = false;
          p2.downed = true;
          p2.hp = 0;
          p2.reviveProgress = 0;
          p2.x = 0;
          p2.y = 0;

          // 1) Outside r=48 circle (d=62 > 48): 60 frames -> progress stays 0
          p0.x = 62;
          p0.y = 0;
          p1.x = -62;
          p1.y = 0;
          window.__e2eStepFrames(60, { stopOnOverlay: false });
          const outsideProgress = p2.reviveProgress;
          const stillDownedOutside = p2.downed;

          // 2) Move BOTH p0 and p1 inside r<=48 (d=15): 96 frames (1.60s < 2.40s) -> dual-rescuer speedup!
          p0.x = 15;
          p0.y = 0;
          p1.x = -15;
          p1.y = 0;
          window.__e2eStepFrames(96, { stopOnOverlay: false });
          return {
            outsideProgress,
            stillDownedOutside,
            revivedFast: !p2.downed && p2.hp > 0,
          };
        });

        assert.equal(res.outsideProgress, 0, 'Standing at d=62 > 48px must NOT advance reviveProgress');
        assert.equal(res.stillDownedOutside, true);
        assert.equal(res.revivedFast, true, 'Two alive rescuers inside r<=48 must stack revive rate (< 2.4s)');
        s.assertNoErrors('T2-F14-02');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T2-F14-03',
    tier: 2,
    feature: 'F14',
    timeoutMs: 16_000,
    name: '4-player max room cap: [data-action="coop-add-bot"] caps at 4 & 5th joiner tab receives Chinese room-full notice',
    async run({ browser, baseUrl }) {
      const coop = await createCoopPages(browser, 2);
      try {
        await bootToHub(coop.hostPage, baseUrl, { query: 'mockTap=1' });
        await fastClick(coop.hostPage, '[data-action="open-coop"]');
        await fastClick(coop.hostPage, '[data-action="coop-create"]');
        await coop.hostPage.waitForSelector('[data-room-code]');
        const roomCode = await coop.hostPage.evaluate(() => {
          const el = document.querySelector('[data-room-code]');
          return el?.getAttribute('data-room-code') || (el?.textContent || '').trim().match(/[A-Z0-9]{6}/i)?.[0] || '';
        });

        // Click coop-add-bot 5 times -> party must cap strictly at 4
        for (let i = 0; i < 5; i++) {
          await coop.hostPage.evaluate(() => document.querySelector('[data-action="coop-add-bot"]')?.click());
        }
        const hostPartyLen = await coop.hostPage.evaluate(() => {
          const w = window.__wugeng;
          return w?.coop?.getParty?.()?.length || w?.coop?.party?.length || w?.coop?.state?.party?.length || 0;
        });
        assert.equal(hostPartyLen, COOP_SPEC.maxPlayers, 'Party size must cap strictly at 4 players');

        // 5th tab attempting to join full 4/4 room
        await coop.guestPage.goto(`${baseUrl}/index.html?skipIntro=1&mockTap=1&room=${roomCode}`);
        await coop.guestPage.waitForTimeout(220);
        const guestText = (await coop.guestPage.textContent('#ui')) || '';
        const hostAfter = await coop.hostPage.evaluate(() => {
          const w = window.__wugeng;
          return w?.coop?.getParty?.()?.length || w?.coop?.party?.length || w?.coop?.state?.party?.length || 0;
        });
        assert.equal(hostAfter, 4, '5th joiner must not exceed 4-player party cap');
        assert.ok(/满|上限|无法加入|人数/.test(guestText), `Expected Chinese room-full notice on 5th joiner, got: ${guestText}`);
        coop.assertNoErrors('T2-F14-03');
      } finally {
        await coop.close();
      }
    },
  },
  {
    id: 'T2-F14-04',
    tier: 2,
    feature: 'F14',
    name: 'Non-existent room code ("99ZZZZ") & invalid WebRTC SDP ("@@@invalid_sdp@@@") fail gracefully with Chinese notice',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser, { isolated: true });
      try {
        await bootToHub(s.page, baseUrl, { query: 'mockTap=1' });
        await fastClick(s.page, '[data-action="open-coop"]');
        await requireOpenSelector(s.page, '.coop-modal');

        const beforeJoin = await s.page.evaluate(() => ({
          toast: [...document.querySelectorAll('#ui .toast')].map((e) => e.textContent || '').join(' '),
          modal: document.querySelector('.coop-modal')?.textContent || '',
        }));

        await s.page.evaluate(() => {
          const modal = document.querySelector('.coop-modal');
          const input = modal.querySelector('input[type="text"], input[data-room-input], input');
          if (input) {
            input.value = '99ZZZZ';
            input.dispatchEvent(new Event('input', { bubbles: true }));
          }
          modal.querySelector('[data-action="coop-join"]')?.click();
        });
        await s.page.waitForTimeout(350);

        const joinOutcome = await s.page.evaluate(async () => {
          const w = window.__wugeng;
          const runIsNull = w?.game?.run === null || w?.game?.run === undefined;
          const partyLen = w?.coop?.getParty?.()?.length || w?.coop?.party?.length || w?.coop?.state?.party?.length || 0;
          const toast = [...document.querySelectorAll('#ui .toast')].map((e) => e.textContent || '').join(' ');
          const modal = document.querySelector('.coop-modal')?.textContent || '';

          let sdpRejectedOrFalse = false;
          let hasSdpApi = false;
          if (typeof w?.coop?.acceptWebRtcOffer === 'function') {
            hasSdpApi = true;
            try {
              const sdpRes = await w.coop.acceptWebRtcOffer('@@@invalid_sdp@@@');
              sdpRejectedOrFalse =
                sdpRes === false ||
                sdpRes === null ||
                sdpRes === undefined ||
                sdpRes === '' ||
                (typeof sdpRes === 'object' && sdpRes.ok === false);
            } catch {
              sdpRejectedOrFalse = true;
            }
          }
          return { runIsNull, partyLen, toast, modal, hasSdpApi, sdpRejectedOrFalse };
        });

        assert.equal(joinOutcome.runIsNull, true, 'Joining non-existent room "99ZZZZ" must keep game.run === null');
        assert.ok(joinOutcome.partyLen <= 1, `Non-existent room "99ZZZZ" must not form a multi-peer party (partyLen=${joinOutcome.partyLen})`);
        const afterFeedback = `${joinOutcome.toast} ${joinOutcome.modal !== beforeJoin.modal ? joinOutcome.modal : ''}`;
        assert.ok(
          /不存在|未找到|无效|过期|超时|失败|无法|无人|无此|未开启/.test(afterFeedback),
          `Expected post-click Chinese not-found/error notice when joining "99ZZZZ", got toast='${joinOutcome.toast}', modal='${joinOutcome.modal}'`,
        );
        assert.equal(/undefined|\[object Object\]/.test(afterFeedback), false);
        assert.equal(joinOutcome.hasSdpApi, true, 'Expected window.__wugeng.coop.acceptWebRtcOffer to be exposed');
        assert.equal(joinOutcome.sdpRejectedOrFalse, true, 'acceptWebRtcOffer("@@@invalid_sdp@@@") must reject or return { ok: false }');
        s.assertNoErrors('T2-F14-04');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T2-F14-05',
    tier: 2,
    feature: 'F14',
    timeoutMs: 18_000,
    name: 'Abrupt Guest tab disconnect (guestPage.close()) mid-run does NOT freeze or crash Host simulation',
    async run({ browser, baseUrl }) {
      const coop = await createCoopPages(browser, 2);
      try {
        await launchTwoPageCoopRun(coop, baseUrl);
        await stepCoopFrames([coop.hostPage, coop.guestPage], 18, 6);

        const tBefore = await coop.hostPage.evaluate(() => window.__wugeng.game.run.time);
        await coop.guestPage.close();

        await stepFrames(coop.hostPage, 60, { stopOnOverlay: false });
        const tAfter = await coop.hostPage.evaluate(() => {
          const t = window.__wugeng.game.run.time;
          window.__wugeng.game.finish();
          return t;
        });
        await coop.hostPage.waitForSelector('.screen--result');
        assert.ok(tAfter > tBefore + 0.5, `Host simulation must keep advancing after Guest disconnect (${tBefore} -> ${tAfter})`);
        coop.assertNoErrors('T2-F14-05');
      } finally {
        await coop.close();
      }
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // F15 Boundaries (5 tests)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'T2-F15-01',
    tier: 2,
    feature: 'F15',
    name: 'Zero dev/test/agent/screenshot leakage inside dist/wugeng-h5.zip & zero teamwork docs in repo root',
    async run() {
      const zipPath = path.join(ROOT, 'dist', 'wugeng-h5.zip');
      const { stdout } = await execFileAsync(
        VENV_PYTHON,
        ['-c', 'import json, sys, zipfile; print(json.dumps(zipfile.ZipFile(sys.argv[1]).namelist()))', zipPath],
        { cwd: ROOT, timeout: 10_000 },
      );
      const names = JSON.parse(stdout.trim());
      const forbidden = [
        /\.agents/i,
        /\.git/i,
        /\.venv/i,
        /node_modules/i,
        /^wugeng\/(?:e2e|tests|tools|store|docs)\//i,
        /style-lab\.html$/i,
        /mock-run\.js$/i,
        /sheet\.js$/i,
        /collect_chars\.py$/i,
        /common-hanzi\.txt$/i,
        /preview-.*\.png$/i,
        /\.test\./i,
        /\.md$/i,
        /\.py$/i,
        /__pycache__/i,
        /\/\.[^/]+/,
      ];
      const leaked = names.filter((n) => forbidden.some((re) => re.test(n)));
      assert.deepEqual(leaked, [], `Forbidden files leaked into dist/wugeng-h5.zip: ${leaked.join(', ')}`);

      for (const rootDoc of ['ORIGINAL_REQUEST.md', 'PROJECT.md', 'TEST_INFRA.md', 'TEST_READY.md']) {
        assert.equal(fs.existsSync(path.join(ROOT, rootDoc)), false, `Teamwork file ${rootDoc} must NOT sit in repo root`);
      }
    },
  },
  {
    id: 'T2-F15-02',
    tier: 2,
    feature: 'F15',
    name: 'Git tracked & untracked hygiene: zero .agents/, e2e/screenshots/, or dist/ tracked or leaked',
    async run() {
      const lsRes = await execFileAsync('git', ['ls-files'], { cwd: ROOT, timeout: 10_000 });
      const badTracked = lsRes.stdout
        .split('\n')
        .filter((f) => /^(?:\.agents|e2e\/screenshots|dist)\//.test(f.trim()) && f.trim() !== '.agents/environment.json');
      assert.deepEqual(badTracked, [], `Forbidden artifacts tracked in git ls-files: ${badTracked.join(', ')}`);

      const stRes = await execFileAsync('git', ['status', '--porcelain'], { cwd: ROOT, timeout: 10_000 });
      const badStatus = stRes.stdout
        .split('\n')
        .filter((l) => l.includes('.agents') || l.includes('e2e/screenshots'));
      assert.deepEqual(badStatus, [], `Untracked .agents or e2e/screenshots leaked in git status: ${badStatus.join(' | ')}`);
    },
  },
  {
    id: 'T2-F15-03',
    tier: 2,
    feature: 'F15',
    name: '100% Chinese Git commit & merge messages on all v3 commits after baseline 16d16da (ORIGINAL_REQUEST.md)',
    async run() {
      const logRes = await execFileAsync(
        'git',
        ['log', `${BASELINE_MAIN_COMMIT}..HEAD`, '--format=%H:::%s'],
        { cwd: ROOT, timeout: 10_000 },
      );
      const lines = logRes.stdout.split('\n').map((l) => l.trim()).filter(Boolean);
      const nonChineseCommits = [];
      for (const line of lines) {
        const [sha, ...rest] = line.split(':::');
        const subject = rest.join(':::').trim();
        if (!/[\u4e00-\u9fff]/.test(subject)) {
          nonChineseCommits.push(`${sha.slice(0, 8)}: ${subject}`);
        }
      }
      assert.deepEqual(
        nonChineseCommits,
        [],
        `Every v3 git commit/merge message after ${BASELINE_MAIN_COMMIT.slice(0, 7)} MUST use Chinese: ${nonChineseCommits.join(' | ')}`,
      );
    },
  },
  {
    id: 'T2-F15-04',
    tier: 2,
    feature: 'F15',
    name: 'Extracted zip server blocks /%2e%2e/ traversal (403), returns 404 on style-lab.html & CLI rejects missing zip',
    async run() {
      const { appDir } = await extractH5ZipToScratch('sec_v3');
      const srv = await startStaticServer(appDir);
      try {
        const rawStatus = await new Promise((resolve, reject) => {
          const req = http.get({ host: '127.0.0.1', port: srv.port, path: '/%2e%2e/package.json' }, (res) => {
            res.resume();
            resolve(res.statusCode);
          });
          req.on('error', reject);
        });
        assert.equal(rawStatus, 403);
        const resLab = await fetch(`${srv.baseUrl}/style-lab.html`);
        assert.equal(resLab.status, 404);
      } finally {
        await srv.close();
      }

      let rejectedMissing = false;
      try {
        await execFileAsync(
          'taptap-cli',
          [
            'upload-h5-package',
            'dist/__nonexistent_wugeng_h5__.zip',
            '--dev-id', TAPTAP.devId,
            '--app-id', TAPTAP.appId,
            '--screen-orientation', TAPTAP.orientation,
            '--dry-run',
          ],
          { cwd: ROOT, timeout: 10_000 },
        );
      } catch (err) {
        rejectedMissing = (err.code ?? 1) !== 0;
      }
      assert.equal(rejectedMissing, true);
    },
  },
  {
    id: 'T2-F15-05',
    tier: 2,
    feature: 'F15',
    name: 'Extracted production zip enforces 100% zero-ad UI offline & loads updated privacy.html modal without errors',
    async run({ browser }) {
      const { appDir } = await extractH5ZipToScratch('offline_v3');
      const zipServer = await startStaticServer(appDir);
      const s = await createIsolatedPage(browser, { isolated: true });
      try {
        await bootGame(s.page, zipServer.baseUrl);
        await fastClick(s.page, '.title-foot .link-btn');
        await s.page.waitForSelector('.privacy-body');
        assert.ok(((await s.page.textContent('.privacy-body')) || '').includes('剑清酱工作室'));
        await fastClick(s.page, '#ui .veil .btn--seal');

        await fastClick(s.page, '.title-actions .btn--seal');
        await s.page.waitForSelector('.screen--hub');
        await fastClick(s.page, '.hub-nav .btn:nth-child(3)');
        assert.equal(await s.page.locator('.btn--ad').count(), 0);
        await fastClick(s.page, '#ui .veil .btn--ghost');

        await fastClick(s.page, '.hub-foot .btn--seal, .btn--big');
        await stepFrames(s.page, 2);
        await triggerLethalHit(s.page);
        assert.equal(await s.page.locator('.btn--ad').count(), 0);
        s.assertNoErrors('T2-F15-05');
      } finally {
        await s.close();
        await zipServer.close();
      }
    },
  },
];
