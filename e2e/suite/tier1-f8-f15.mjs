// Tier 1 (Part 2): Feature Happy-Path E2E Tests for v3 F8–F15
// STRICT OPAQUE-BOX: ZERO imports from ../../src/**.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  ALL_ENEMY_IDS,
  ALL_RELIC_IDS,
  ALL_WEAPON_IDS,
  ATTACK_VFX_IDS,
  ATTACK_VFX_NAMES,
  CODEX_TAB_COUNTS,
  COOP_SPEC,
  DEFAULT_UNLOCKED_WEAPON_IDS,
  HERO_IDS,
  LEGACY_ACHIEVEMENT_IDS,
  MAX_RELICS,
  MAX_WEAPONS,
  NEW_REGULAR_ENEMY_IDS,
  PRIMARY_LEADERBOARD_ID,
  SAVE_VERSION,
  TAPTAP,
  V3_BASE_WEAPON_NAMES,
  V3_RELIC_NAMES,
} from './contracts.mjs';
import {
  APPLY_SAVE_PATCH_IN_PAGE,
  ROOT,
  VENV_PYTHON,
  analyzeCanvasSpriteBox,
  bootAndStartRun,
  bootColdIntro,
  bootGame,
  bootToHub,
  closeActiveModal,
  compareSpriteSnapshots,
  confirmChestModal,
  countOwnedBarSlots,
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
  releaseInspectorPeek,
  requireOpenSelector,
  sha256File,
  shopBuyAndEquipInModal,
  startStaticServer,
  stepCoopFrames,
  stepFrames,
  suppressWardersInPage,
  triggerChest,
  triggerLevelUp,
} from './harness.mjs';

/**
 * Opaque-box helper to buy & discover genuine distinct non-default hero skin IDs for `hostHero` and `guestHero`
 * via `.cosmetic-shop-modal` before launching a 2-page Co-op session.
 */
export async function discoverCoopHeroSkins(page, baseUrl, hostHero = 'zhou', guestHero = 'nuoxi', query = 'mockTap=1') {
  await bootToHub(page, baseUrl, {
    query,
    savePatch: {
      coins: 20_000,
      unlockedHeroes: HERO_IDS,
      selectedHero: guestHero,
      unlockedWeapons: ALL_WEAPON_IDS,
    },
  });
  await fastClick(page, `[data-hero-id="${guestHero}"]`);
  await fastClick(page, '[data-action="open-market"]');
  await requireOpenSelector(page, '.cosmetic-shop-modal');
  const gRes = await shopBuyAndEquipInModal(page, {
    kind: 'skin',
    heroId: guestHero,
    targetIdx: 1,
    buy: true,
    equip: true,
    close: true,
  });
  assert.equal(gRes.ok, true, gRes.reason || `Failed buying coop skin for ${guestHero}`);
  const afterGuest = await readNormalizedSave(page);
  const guestSkin = afterGuest.heroSkins[guestHero];

  await fastClick(page, `[data-hero-id="${hostHero}"]`);
  await fastClick(page, '[data-action="open-market"]');
  await requireOpenSelector(page, '.cosmetic-shop-modal');
  const hRes = await shopBuyAndEquipInModal(page, {
    kind: 'skin',
    heroId: hostHero,
    targetIdx: 1,
    buy: true,
    equip: true,
    close: true,
  });
  assert.equal(hRes.ok, true, hRes.reason || `Failed buying coop skin for ${hostHero}`);
  const afterHost = await readNormalizedSave(page);
  const hostSkin = afterHost.heroSkins[hostHero];

  assert.ok(hostSkin && !/default$/i.test(hostSkin), `Expected non-default hostSkin for ${hostHero}, got '${hostSkin}'`);
  assert.ok(guestSkin && !/default$/i.test(guestSkin), `Expected non-default guestSkin for ${guestHero}, got '${guestSkin}'`);
  assert.notEqual(hostSkin, guestSkin, `Expected distinct non-default skins for ${hostHero} vs ${guestHero}`);
  return { hostSkin, guestSkin, ownedSkins: afterHost.ownedCosmetics };
}

/**
 * Helper to start a real 2-page shared-BrowserContext BroadcastChannel Co-op session and enter gameplay.
 * Pre-seeds Guest's profile into shared `localStorage['wugeng.save']` BEFORE navigating `guestPage` to `?room=<code>`
 * (without clobbering Host's in-memory `w.save` and without calling `w.showHub()` after `?room=` auto-opens `.coop-modal`).
 */
export async function launchTwoPageCoopRun(coop, baseUrl, opts = {}) {
  const hostHero = opts.hostHero || 'zhou';
  const guestHero = opts.guestHero || 'nuoxi';
  const hostVfx = opts.hostVfx || 'default';
  const guestVfx = opts.guestVfx || 'default';
  const hostSkin = opts.hostSkin || null;
  const guestSkin = opts.guestSkin || null;
  const tapQuery = opts.query !== undefined ? String(opts.query).replace(/^\?/, '') : 'mockTap=1';
  const allOwned = [
    ...new Set([
      ...ATTACK_VFX_IDS,
      ...(hostSkin ? [hostSkin] : []),
      ...(guestSkin ? [guestSkin] : []),
    ]),
  ];

  await bootToHub(coop.hostPage, baseUrl, {
    query: tapQuery,
    savePatch: {
      daoName: opts.hostName || '守夜房主',
      coins: 5000,
      unlockedHeroes: HERO_IDS,
      selectedHero: hostHero,
      unlockedWeapons: ALL_WEAPON_IDS,
      cosmetics: {
        owned: allOwned,
        equipped: {
          lantern: null,
          outfit: null,
          attackVfx: hostVfx,
          heroSkins: hostSkin ? { [hostHero]: hostSkin } : {},
        },
      },
    },
  });

  await fastClick(coop.hostPage, '[data-action="open-coop"]', 'Expected [data-action="open-coop"] in Hub');
  await requireOpenSelector(coop.hostPage, '.coop-modal', 'Expected .coop-modal on Host');
  await fastClick(coop.hostPage, '[data-action="coop-create"]', 'Expected [data-action="coop-create"]');
  await coop.hostPage.waitForFunction(() => {
    const el = document.querySelector('[data-room-code]');
    const code = el?.getAttribute('data-room-code') || el?.textContent?.trim() || '';
    return /^[A-Z0-9]{4,8}$/i.test(code);
  });

  const roomCode = await coop.hostPage.evaluate(() => {
    const el = document.querySelector('[data-room-code]');
    const attr = el?.getAttribute('data-room-code') || '';
    if (/^[A-Z0-9]{4,8}$/i.test(attr)) return attr.trim();
    const m = (el?.textContent || '').match(/\b([A-Z0-9]{6})\b/i);
    return m ? m[1] : (el?.textContent || '').trim();
  });
  assert.match(roomCode, /^[A-Z0-9]{4,8}$/i, `Expected valid 6-char room code, got '${roomCode}'`);

  if (typeof opts.onRoomCreated === 'function') {
    await opts.onRoomCreated(roomCode);
  }

  if (opts.botCount) {
    for (let b = 0; b < opts.botCount; b++) {
      await fastClick(coop.hostPage, '[data-action="coop-add-bot"]', 'Expected [data-action="coop-add-bot"]');
    }
  }

  // Write Guest's profile into shared localStorage['wugeng.save'] BEFORE navigating guestPage to ?room=${roomCode}
  // while keeping Host's in-memory `window.__wugeng.save` untouched on hostPage!
  const guestPatch = {
    daoName: opts.guestName || '同行道友',
    coins: 5000,
    unlockedHeroes: HERO_IDS,
    selectedHero: guestHero,
    unlockedWeapons: ALL_WEAPON_IDS,
    cosmetics: {
      owned: allOwned,
      equipped: {
        lantern: null,
        outfit: null,
        attackVfx: guestVfx,
        heroSkins: guestSkin ? { [guestHero]: guestSkin } : {},
      },
    },
  };
  await coop.hostPage.evaluate(
    ({ patch, patchFnSrc }) => {
      let baseSave = {};
      try {
        baseSave = JSON.parse(localStorage.getItem('wugeng.save') || '{}') || {};
      } catch {
        baseSave = structuredClone(window.__wugeng.save);
      }
      if (baseSave.cosmetics?.equipped) {
        baseSave.cosmetics.equipped.heroSkins = {};
      }
      // eslint-disable-next-line no-new-func
      const applyPatch = new Function('return (' + patchFnSrc + ')')();
      applyPatch(baseSave, patch);
      localStorage.setItem('wugeng.save', JSON.stringify(baseSave));
    },
    { patch: guestPatch, patchFnSrc: APPLY_SAVE_PATCH_IN_PAGE.toString() },
  );

  const guestQuery = ['skipIntro=1', tapQuery, `room=${roomCode}`].filter(Boolean).join('&');
  await coop.guestPage.goto(`${baseUrl}/index.html?${guestQuery}`);
  await coop.guestPage.waitForSelector('.screen--hub, .coop-modal', { timeout: 4500 });
  await coop.guestPage.evaluate(() => document.fonts.ready);
  await coop.guestPage.waitForFunction(() => Boolean(window.__wugeng && window.__wugeng.game), null, { timeout: 4500 });

  // Do NOT call w.showHub() on guestPage! Only open/join .coop-modal if not already joined to roomCode.
  const guestJoined = await coop.guestPage.evaluate((code) => {
    const w = window.__wugeng;
    const activeCode =
      w?.coop?.roomCode ||
      w?.coop?.getState?.()?.roomCode ||
      document.querySelector('[data-room-code]')?.getAttribute('data-room-code') ||
      document.querySelector('[data-room-code]')?.textContent ||
      '';
    return activeCode.toUpperCase().includes(code.toUpperCase());
  }, roomCode);

  if (!guestJoined) {
    if (!(await coop.guestPage.$('.coop-modal'))) {
      const hubMounted = await coop.guestPage.$('.screen--hub');
      if (!hubMounted) {
        await fastClick(coop.guestPage, '.title-actions .btn--seal');
        await coop.guestPage.waitForSelector('.screen--hub');
      }
      await fastClick(coop.guestPage, '[data-action="open-coop"]');
      await requireOpenSelector(coop.guestPage, '.coop-modal');
    }
    await coop.guestPage.evaluate((code) => {
      const input = document.querySelector('.coop-modal input[type="text"], .coop-modal input[data-room-input], .coop-modal input');
      if (input) {
        input.value = code;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
      document.querySelector('[data-action="coop-join"]')?.click();
    }, roomCode);
  }

  await coop.guestPage.evaluate(() => {
    const readyBtn = document.querySelector('[data-action="coop-ready"]');
    if (
      readyBtn &&
      !readyBtn.disabled &&
      !readyBtn.classList.contains('is-ready') &&
      !readyBtn.classList.contains('is-on') &&
      readyBtn.getAttribute('aria-pressed') !== 'true'
    ) {
      readyBtn.click();
    }
  });

  await coop.hostPage.waitForFunction(
    (expectedMin) => {
      const w = window.__wugeng;
      const partyLen =
        w?.coop?.getParty?.()?.length ||
        w?.coop?.party?.length ||
        w?.coop?.state?.party?.length ||
        document.querySelectorAll('.coop-modal [data-slot]:not(.is-empty), .coop-modal .coop-member.is-occupied').length;
      return partyLen >= expectedMin;
    },
    2 + (opts.botCount || 0),
    { timeout: 4500 },
  );

  // Restore Host's authoritative save into localStorage before starting run
  await coop.hostPage.evaluate(() => {
    window.__wugeng.persist?.(false);
  });

  await fastClick(coop.hostPage, '[data-action="coop-start"]', 'Expected [data-action="coop-start"] on Host');
  await Promise.all([
    coop.hostPage.waitForFunction(() => Boolean(window.__wugeng?.game?.run && window.__wugeng.game.run.players?.length >= 2), null, { timeout: 4500 }),
    coop.guestPage.waitForFunction(() => Boolean(window.__wugeng?.game?.run && window.__wugeng.game.run.players?.length >= 2), null, { timeout: 4500 }),
  ]);
  await stepCoopFrames([coop.hostPage, coop.guestPage], 12, 6);
  return { roomCode };
}

export const TIER1_F8_F15 = [
  // ═══════════════════════════════════════════════════════════════════════════
  // F8: 铜钱鬼市商铺（购买皮肤与攻击特效） (5 tests)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'T1-F8-01',
    tier: 1,
    feature: 'F8',
    name: '[data-action="open-market"] opens .cosmetic-shop-modal listing >= 9 copper Hero Skins & >= 3 copper Attack VFX themes',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootToHub(s.page, baseUrl, {
          savePatch: { coins: 2468, unlockedHeroes: HERO_IDS },
        });
        await fastClick(s.page, '[data-action="open-market"]', 'Expected [data-action="open-market"] in Hub');
        await requireOpenSelector(s.page, '.cosmetic-shop-modal', 'Expected .cosmetic-shop-modal');

        const catalog = await s.page.evaluate(async (heroIds) => {
          const modal = document.querySelector('.cosmetic-shop-modal');
          const modalText0 = modal.textContent || '';
          const showsCoins = modalText0.includes('2468') || modalText0.includes('2,468');

          const copperSkinKeys = new Set();
          const achSkinKeys = new Set();
          const collectVisibleSkins = (tagPrefix) => {
            const cards = [
              ...modal.querySelectorAll('[data-skin-id], [data-cosmetic-kind="skin"], .cosmetic-card, .market-card, .shop-card'),
            ].filter((c) => !c.dataset.vfxId && !/古墨朱砂|青冥幽火|紫电天罡|鎏金神诏|玄霜寒月/.test(c.textContent || ''));
            cards.forEach((c, idx) => {
              const key = c.dataset.skinId || c.dataset.cosmeticId || c.dataset.id || `${tagPrefix}_${(c.textContent || '').trim().slice(0, 18)}_${idx}`;
              const cleanTxt = (c.textContent || '').replace(/,/g, '');
              const dp = Number(c.dataset?.price || c.dataset?.cost || '');
              const isAchOnly = c.dataset?.unlock === 'achievement' || c.dataset?.source === 'achievement' || (/功绩|成就/.test(cleanTxt) && !/铜钱/.test(cleanTxt));
              const priceMatch = cleanTxt.match(/(?:^|\D)(5[89]\d|[6-9]\d\d|1[0-6]\d\d)(?:\D|$)/);
              if (!isAchOnly && ((Number.isFinite(dp) && dp > 0) || priceMatch || /铜钱|购|买/.test(cleanTxt))) {
                copperSkinKeys.add(key);
              }
              if (isAchOnly || /功绩|成就/.test(cleanTxt)) achSkinKeys.add(key);
            });
          };

          collectVisibleSkins('all');
          for (const hid of heroIds) {
            const hBtn = modal.querySelector(
              `[data-shop-hero="${hid}"]:not([data-skin-id]):not(.cosmetic-card):not(.shop-card):not(.market-card), ` +
              `[data-filter-hero="${hid}"]:not([data-skin-id]):not(.cosmetic-card):not(.shop-card):not(.market-card), ` +
              `[data-hero-id="${hid}"]:not([data-skin-id]):not([data-cosmetic-id]):not(.cosmetic-card):not(.shop-card):not(.market-card)`,
            );
            if (hBtn) {
              hBtn.click();
              await new Promise((r) => requestAnimationFrame(r));
              collectVisibleSkins(hid);
            }
          }

          const vfxTab = [...modal.querySelectorAll('button, [role="tab"]')].find(
            (b) => /特效|锋芒|兵气|灵光/.test(b.textContent || '') && !b.closest('.shop-card, .cosmetic-card, .market-card'),
          );
          if (vfxTab) {
            vfxTab.click();
            await new Promise((r) => requestAnimationFrame(r));
          }
          const vfxText = modal.textContent || '';
          const vfxFound = ['青冥幽火', '紫电天罡', '鎏金神诏', '玄霜寒月'].filter((n) => vfxText.includes(n));
          return {
            showsCoins,
            copperSkinsCount: copperSkinKeys.size,
            achSkinsCount: achSkinKeys.size,
            vfxFound,
          };
        }, HERO_IDS);

        assert.equal(catalog.showsCoins, true, 'Expected .cosmetic-shop-modal to display live copper balance (2468)');
        assert.ok(catalog.copperSkinsCount >= 9, `Expected >= 9 copper-purchasable hero skins across 6 heroes, got ${catalog.copperSkinsCount}`);
        assert.ok(catalog.vfxFound.length >= 3, `Expected >= 3 non-default Attack VFX themes in shop, found: ${catalog.vfxFound.join(',')}`);
        s.assertNoErrors('T1-F8-01');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T1-F8-02',
    tier: 1,
    feature: 'F8',
    name: 'Live Preview <canvas> inside .cosmetic-shop-modal previews unowned Skins & VFX with 0 coins spent',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootToHub(s.page, baseUrl, { savePatch: { coins: 0, unlockedHeroes: HERO_IDS } });
        await fastClick(s.page, '[data-action="open-market"]');
        await requireOpenSelector(s.page, '.cosmetic-shop-modal canvas', 'Expected preview <canvas> inside .cosmetic-shop-modal');

        const snap0 = await analyzeCanvasSpriteBox(s.page, '.cosmetic-shop-modal canvas');
        assert.ok(snap0 && snap0.nonBgPixels > 80, 'Expected non-blank preview canvas in .cosmetic-shop-modal');

        await s.page.evaluate(async () => {
          const modal = document.querySelector('.cosmetic-shop-modal');
          const cards = [...modal.querySelectorAll('[data-skin-id], [data-cosmetic-id], .cosmetic-card, .market-card, .shop-card')];
          if (cards[1]) cards[1].click();
          await new Promise((r) => setTimeout(r, 60));
        });
        const snap1 = await analyzeCanvasSpriteBox(s.page, '.cosmetic-shop-modal canvas');
        const cmpSkin = compareSpriteSnapshots(snap0, snap1);
        assert.ok(cmpSkin.pixelDiffRatio > 0.10, `Expected shop preview canvas to update when clicking unowned skin (${(cmpSkin.pixelDiffRatio * 100).toFixed(1)}%)`);

        // Switch to VFX preview
        await s.page.evaluate(async () => {
          const modal = document.querySelector('.cosmetic-shop-modal');
          const vfxTab = [...modal.querySelectorAll('button, [role="tab"]')].find((b) => /特效|锋芒|兵气|灵光/.test(b.textContent || ''));
          vfxTab?.click();
          await new Promise((r) => requestAnimationFrame(r));
          const vfxCards = [...modal.querySelectorAll('[data-vfx-id], [data-cosmetic-id], .cosmetic-card, .market-card, .shop-card')];
          const jade = vfxCards.find((c) => (c.textContent || '').includes('青冥幽火')) || vfxCards[1];
          jade?.click();
          await new Promise((r) => setTimeout(r, 80));
        });
        const snapVfx = await analyzeCanvasSpriteBox(s.page, '.cosmetic-shop-modal canvas');
        assert.ok(snapVfx && snapVfx.nonBgPixels > 80, 'Expected non-blank VFX preview canvas');
        const cmpVfx = compareSpriteSnapshots(snap1, snapVfx);
        assert.ok(
          cmpVfx.pixelDiffRatio > 0.05,
          `Expected shop preview canvas to update (>5% pixel diff) when switching from skin to VFX preview, got ${(cmpVfx.pixelDiffRatio * 100).toFixed(1)}%`,
        );

        const after = await readNormalizedSave(s.page);
        assert.equal(after.coins, 0, 'Previewing unowned items must spend 0 coins');
        assert.equal(after.ownedCosmetics.filter((x) => x !== 'default' && !/default$/i.test(x)).length, 0, 'Previewing must not grant ownership');
        s.assertNoErrors('T1-F8-02');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T1-F8-03',
    tier: 1,
    feature: 'F8',
    name: 'Buying an affordable Hero Skin deducts exact copper cost & persists ownership + equip across page.reload()',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser, { isolated: true });
      try {
        await bootToHub(s.page, baseUrl, { savePatch: { coins: 3000, unlockedHeroes: HERO_IDS, selectedHero: 'zhou' } });
        // Exercise 加点 -> 鬼市商铺 cross-link if present, else open via Hub ribbon [data-action="open-market"]
        await fastClick(s.page, '.hub-nav .btn:nth-child(1)');
        const crossLinked = await s.page.evaluate(() => {
          const veil = document.querySelector('#ui .veil');
          if (!veil) return false;
          const link =
            veil.querySelector('[data-action="open-market"]') ||
            [...veil.querySelectorAll('button, [role="tab"]')].find((b) => /鬼市|衣冠|外观|商铺/.test(b.textContent || ''));
          if (link) {
            link.click();
            return Boolean(document.querySelector('.cosmetic-shop-modal'));
          }
          return false;
        });
        if (!crossLinked) {
          await closeActiveModal(s.page);
          await fastClick(s.page, '[data-action="open-market"]');
        }
        await requireOpenSelector(s.page, '.cosmetic-shop-modal');

        const purchase = await shopBuyAndEquipInModal(s.page, {
          kind: 'skin',
          heroId: 'zhou',
          targetIdx: 1,
          buy: true,
          equip: true,
          close: true,
        });

        assert.equal(purchase.ok, true, purchase.reason);
        assert.ok(purchase.price >= 500 && purchase.price <= 2000, `Expected copper skin price in [500, 2000], got ${purchase.price}`);

        const afterBuy = await readNormalizedSave(s.page);
        assert.equal(afterBuy.coins, 3000 - purchase.price, 'Expected exact copper cost deducted');
        assert.ok(afterBuy.ownedCosmetics.length >= 1, 'Expected bought skin added to owned cosmetics');
        assert.ok(
          afterBuy.heroSkins.zhou && !/default$/i.test(afterBuy.heroSkins.zhou),
          `Expected non-default zhou skin equipped after buy+equip, got '${afterBuy.heroSkins.zhou}'`,
        );

        await s.page.reload();
        await s.page.waitForSelector('.screen--title');
        const afterReload = await readNormalizedSave(s.page);
        assert.equal(afterReload.coins, 3000 - purchase.price, 'Copper deduction must persist across reload');
        assert.deepEqual(afterReload.ownedCosmetics, afterBuy.ownedCosmetics, 'Owned skin must persist across reload');
        assert.equal(afterReload.heroSkins.zhou, afterBuy.heroSkins.zhou, 'Equipped zhou skin must persist across reload');
        s.assertNoErrors('T1-F8-03');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T1-F8-04',
    tier: 1,
    feature: 'F8',
    name: 'Buying & equipping jade_ghostfire (青冥幽火) VFX deducts exact copper & renders emerald pixels in next run',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootToHub(s.page, baseUrl, { savePatch: { coins: 3500 } });
        await fastClick(s.page, '[data-action="open-market"]');
        await requireOpenSelector(s.page, '.cosmetic-shop-modal');

        const buyVfx = await shopBuyAndEquipInModal(s.page, {
          kind: 'vfx',
          vfxId: 'jade_ghostfire',
          buy: true,
          equip: true,
          close: true,
        });
        assert.equal(buyVfx.ok, true, buyVfx.reason || 'Failed buying jade_ghostfire VFX');

        const st = await readNormalizedSave(s.page);
        assert.ok(st.coins < 3500 && st.coins >= 1000, `Expected copper deducted for jade_ghostfire, got coins=${st.coins}`);
        assert.equal(st.attackVfx, 'jade_ghostfire');

        await fastClick(s.page, '.hub-foot .btn--seal, .btn--big');
        await stepFrames(s.page, 2);
        await s.page.evaluate(async () => {
          const r = window.__wugeng.game.run;
          r.darkness = 0;
          r.projectiles.push({
            id: 991, kind: 'gongPulse', x: r.player.x, y: r.player.y,
            r: 62, radius: 62, maxRadius: 82, t: 0.12, life: 0.35, evolved: true, attackVfx: 'jade_ghostfire',
          });
          window.__wugeng.game.pause();
          await new Promise((res) => requestAnimationFrame(res));
        });
        const snap = await analyzeCanvasSpriteBox(s.page, '#game-canvas');
        assert.ok(snap.hueBuckets.jade >= 25, `Expected emerald/jade pixels >= 25 in run after buying jade_ghostfire, got ${snap.hueBuckets.jade}`);
        s.assertNoErrors('T1-F8-04');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T1-F8-05',
    tier: 1,
    feature: 'F8',
    name: 'Switching back from purchased cosmetics to free default Skin / default Attack VFX costs 0 copper',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootToHub(s.page, baseUrl, {
          savePatch: {
            coins: 5000,
            unlockedHeroes: HERO_IDS,
            selectedHero: 'zhou',
          },
        });
        // First buy & equip BOTH a paid Hero Skin on zhou and jade_ghostfire Attack VFX
        await fastClick(s.page, '[data-action="open-market"]');
        await requireOpenSelector(s.page, '.cosmetic-shop-modal');
        const paidSkinRes = await shopBuyAndEquipInModal(s.page, {
          kind: 'skin',
          heroId: 'zhou',
          targetIdx: 1,
          buy: true,
          equip: true,
          close: false,
        });
        assert.equal(paidSkinRes.ok, true, paidSkinRes.reason);
        const paidVfxRes = await shopBuyAndEquipInModal(s.page, {
          kind: 'vfx',
          vfxId: 'jade_ghostfire',
          buy: true,
          equip: true,
          close: true,
        });
        assert.equal(paidVfxRes.ok, true, paidVfxRes.reason);

        const mid = await readNormalizedSave(s.page);
        assert.ok(mid.heroSkins.zhou && !/default$/i.test(mid.heroSkins.zhou), `Expected paid zhou skin equipped first, got ${mid.heroSkins.zhou}`);
        assert.equal(mid.attackVfx, 'jade_ghostfire');

        // Pin coins to 123 and revert BOTH skin and VFX back to free 'default'
        await s.page.evaluate(() => {
          window.__wugeng.save.coins = 123;
          window.__wugeng.persist(false);
          window.__wugeng.showHub();
        });
        await s.page.waitForSelector('.screen--hub');
        await fastClick(s.page, '[data-action="open-market"]');
        await requireOpenSelector(s.page, '.cosmetic-shop-modal');
        const revSkin = await shopBuyAndEquipInModal(s.page, {
          kind: 'skin',
          heroId: 'zhou',
          skinId: 'default',
          onlyDefault: true,
          buy: false,
          equip: true,
          close: false,
        });
        assert.equal(revSkin.ok, true, revSkin.reason);
        const revVfx = await shopBuyAndEquipInModal(s.page, {
          kind: 'vfx',
          vfxId: 'default',
          buy: false,
          equip: true,
          close: true,
        });
        assert.equal(revVfx.ok, true, revVfx.reason);

        const after = await readNormalizedSave(s.page);
        assert.equal(after.coins, 123, 'Reverting BOTH paid skin & paid VFX to free default must cost 0 copper');
        assert.ok(!after.heroSkins.zhou || /default$/i.test(after.heroSkins.zhou), `Expected default zhou skin restored, got '${after.heroSkins.zhou}'`);
        assert.ok(!after.attackVfx || after.attackVfx === 'default', `Expected default attackVfx restored, got '${after.attackVfx}'`);
        s.assertNoErrors('T1-F8-05');
      } finally {
        await s.close();
      }
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // F9: 守夜功绩成就系统（奖励解锁新武器或角色皮肤） (6 tests)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'T1-F9-01',
    tier: 1,
    feature: 'F9',
    name: '[data-action="open-achievements"] opens .achievements-modal w/ >= 18 entries, 7 legacy IDs & numeric progress bars',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootToHub(s.page, baseUrl, {
          savePatch: { stats: { totalKills: 350, bestKills: 350, runs: 3 } },
        });
        await fastClick(s.page, '[data-action="open-achievements"]', 'Expected [data-action="open-achievements"] in Hub');
        await requireOpenSelector(s.page, '.achievements-modal', 'Expected .achievements-modal');

        const info = await s.page.evaluate(async () => {
          const modal = document.querySelector('.achievements-modal');
          const seenKeys = new Set();
          const domAttrIds = new Set();
          let allText = '';
          let numericProgressRows = 0;

          const scanRows = (prefix) => {
            allText += ' ' + (modal.textContent || '');
            const rows = modal.querySelectorAll('[data-achievement-id], .achievement-row, .ach-row, .achievement-card, .codex-row--ach');
            rows.forEach((r, idx) => {
              if (r.dataset.achievementId) domAttrIds.add(r.dataset.achievementId);
              const id = r.dataset.achievementId || r.dataset.id || `${prefix}_${(r.textContent || '').trim().slice(0, 16)}_${idx}`;
              seenKeys.add(id);
              if (/\d+\s*\/\s*\d+/.test((r.textContent || '').replace(/,/g, ''))) numericProgressRows++;
            });
          };

          const allTab = [...modal.querySelectorAll('button, [role="tab"]')].find((b) => /全部|总览/.test(b.textContent || ''));
          if (allTab) {
            allTab.click();
            await new Promise((r) => requestAnimationFrame(r));
          }
          scanRows('init');
          const tabs = [...modal.querySelectorAll('[data-ach-tab], [data-category], [role="tab"]')];
          for (let i = 0; i < tabs.length; i++) {
            tabs[i].click();
            await new Promise((r) => requestAnimationFrame(r));
            scanRows(`tab${i}`);
          }

          const w = window.__wugeng;
          const catalogIds = [];
          const rawCat =
            w?.achievements?.list ||
            w?.achievements?.catalog ||
            w?.achievements?.ACHIEVEMENTS ||
            (typeof w?.achievements?.getAll === 'function' ? w.achievements.getAll() : null);
          if (Array.isArray(rawCat)) {
            for (const item of rawCat) {
              if (item?.id) catalogIds.push(item.id);
            }
          } else if (rawCat && typeof rawCat === 'object') {
            catalogIds.push(...Object.keys(rawCat));
          }

          return {
            totalCount: seenKeys.size,
            domAttrIds: [...domAttrIds],
            catalogIds,
            allText: allText.replace(/,/g, ''),
            numericProgressRows,
          };
        });

        assert.ok(info.totalCount >= 18, `Expected >= 18 achievements in .achievements-modal, got ${info.totalCount}`);
        assert.ok(info.numericProgressRows >= 5, `Expected numeric 'current / target' progress bars, found ${info.numericProgressRows}`);

        if (info.domAttrIds.length > 0) {
          const missingLegacy = LEGACY_ACHIEVEMENT_IDS.filter((id) => !info.domAttrIds.includes(id));
          assert.deepEqual(
            missingLegacy,
            [],
            `Expected all 7 legacy [data-achievement-id] keys preserved in .achievements-modal, missing: [${missingLegacy.join(',')}]`,
          );
        } else if (info.catalogIds.length > 0) {
          const missingLegacy = LEGACY_ACHIEVEMENT_IDS.filter((id) => !info.catalogIds.includes(id));
          assert.deepEqual(
            missingLegacy,
            [],
            `Expected all 7 legacy achievement IDs preserved in window.__wugeng.achievements, missing: [${missingLegacy.join(',')}]`,
          );
        } else {
          // Strict fallback check across all 7 legacy achievement conditions/titles when neither DOM attr nor catalog array is exposed
          const legacyMatchers = [
            ['firstClear', /天亮|鸡鸣|首通|初见五更|通关/],
            ['kills800', /800/],
            ['noBun480', /480|包子|馒头|不食|滴水/],
            ['endless10', /无尽.*10|600|十更|10\s*分/],
            ['hit10k', /10000|一万|万钧/],
            ['hit100m', /100|百步/],
            ['night10', /夜.*10|十夜|夜十/],
          ];
          const missingTitles = legacyMatchers.filter(([, re]) => !re.test(info.allText)).map(([id]) => id);
          assert.deepEqual(
            missingTitles,
            [],
            `Expected all 7 legacy achievements rendered in .achievements-modal, missing: [${missingTitles.join(',')}]`,
          );
        }
        s.assertNoErrors('T1-F9-01');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T1-F9-02',
    tier: 1,
    feature: 'F9',
    name: 'Unlocking/claiming weapon-reward achievement #1 grants taomujian (桃木飞剑) to save.unlockedWeapons, Hub picker & levelup pool',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, {
          savePatch: {
            unlockedHeroes: HERO_IDS,
            unlockedWeapons: DEFAULT_UNLOCKED_WEAPON_IDS,
            nightUnlocked: 10,
            nightCleared: 10,
            stats: {
              runs: 30,
              clears: 10,
              firstRunDone: true,
              totalPlaySec: 20_000,
              bestTimeSec: 1200,
              bestKills: 3500,
              bestHit: 50_000,
              totalKills: 25_000,
              totalCoins: 15_000,
              totalEvolutions: 30,
              totalBossKills: 25,
              coopRuns: 6,
              coopRevives: 6,
            },
          },
          seed: 9102,
        });
        await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          r.time = 610;
          r.stats.kills = 1200;
          r.stats.bunsEaten = 0;
          window.__wugeng.game.finish();
          window.__wugeng.game.clear();
          window.__wugeng.showHub();
        });
        await s.page.waitForSelector('.screen--hub');

        await fastClick(s.page, '[data-action="open-achievements"]');
        await requireOpenSelector(s.page, '.achievements-modal');
        await s.page.evaluate(async () => {
          const modal = document.querySelector('.achievements-modal');
          const claimMatching = () => {
            const rows = [...modal.querySelectorAll('[data-achievement-id], .achievement-row, .ach-row, .achievement-card')];
            for (const row of rows) {
              if ((row.textContent || '').includes('桃木飞剑') || row.dataset.rewardWeapon === 'taomujian') {
                const btn = row.querySelector('button:not([disabled])');
                btn?.click();
              }
            }
            modal.querySelectorAll('[data-action="claim-achievement"]:not([disabled]), [data-action="claim-all"]:not([disabled])').forEach((b) => b.click());
          };
          claimMatching();
          const tabs = [...modal.querySelectorAll('[data-ach-tab], [data-category], [role="tab"]')];
          for (const t of tabs) {
            t.click();
            await new Promise((r) => requestAnimationFrame(r));
            claimMatching();
          }
        });
        await closeActiveModal(s.page, 'close-achievements');

        const st = await readNormalizedSave(s.page);
        assert.ok(st.unlockedWeapons.includes('taomujian'), `Expected taomujian in save.unlockedWeapons, got [${st.unlockedWeapons.join(',')}]`);

        // Verify selectable as Hub starter weapon & starts run with taomujian
        await fastClick(s.page, '[data-starter-weapon="taomujian"]', 'Expected [data-starter-weapon="taomujian"] unlocked in Hub');
        await fastClick(s.page, '.hub-foot .btn--seal, .btn--big');
        await stepFrames(s.page, 2);
        assert.equal(await s.page.evaluate(() => window.__wugeng.game.run.weapons[0]?.id), 'taomujian');
        s.assertNoErrors('T1-F9-02');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T1-F9-03',
    tier: 1,
    feature: 'F9',
    name: 'Unlocking/claiming weapon-reward achievement #2 grants zhinian_kite (纸鸢火鸦) into save.unlockedWeapons & Hub starter picker',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, {
          savePatch: {
            unlockedHeroes: HERO_IDS,
            unlockedWeapons: DEFAULT_UNLOCKED_WEAPON_IDS,
            nightUnlocked: 10,
            nightCleared: 10,
            stats: {
              runs: 30,
              clears: 10,
              firstRunDone: true,
              totalPlaySec: 20_000,
              bestTimeSec: 1200,
              bestKills: 3500,
              bestHit: 50_000,
              totalKills: 25_000,
              totalCoins: 15_000,
              totalEvolutions: 30,
              totalBossKills: 25,
              coopRuns: 6,
              coopRevives: 6,
            },
          },
          seed: 9103,
        });
        await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          r.time = 620;
          r.stats.kills = 1500;
          window.__wugeng.game.finish();
          window.__wugeng.game.clear();
          window.__wugeng.showHub();
        });
        await s.page.waitForSelector('.screen--hub');

        await fastClick(s.page, '[data-action="open-achievements"]');
        await requireOpenSelector(s.page, '.achievements-modal');
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
        await closeActiveModal(s.page, 'close-achievements');

        const st = await readNormalizedSave(s.page);
        assert.ok(st.unlockedWeapons.includes('zhinian_kite'), `Expected zhinian_kite unlocked via achievements, got [${st.unlockedWeapons.join(',')}]`);

        await fastClick(s.page, '[data-starter-weapon="zhinian_kite"]', 'Expected [data-starter-weapon="zhinian_kite"] selectable in Hub');
        await fastClick(s.page, '.hub-foot .btn--seal, .btn--big');
        await stepFrames(s.page, 2);
        assert.equal(await s.page.evaluate(() => window.__wugeng.game.run.weapons[0]?.id), 'zhinian_kite');
        s.assertNoErrors('T1-F9-03');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T1-F9-04',
    tier: 1,
    feature: 'F9',
    name: 'Unlocking/claiming skin-reward achievement grants exclusive Hero Skin (>= 3 in catalog) wearable with 0 copper spent',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, {
          savePatch: {
            coins: 0,
            unlockedHeroes: HERO_IDS,
            nightUnlocked: 10,
            nightCleared: 10,
            stats: {
              runs: 30,
              clears: 10,
              firstRunDone: true,
              totalPlaySec: 20_000,
              bestTimeSec: 1200,
              bestKills: 3500,
              bestHit: 50_000,
              totalKills: 25_000,
              totalEvolutions: 30,
              totalBossKills: 25,
              coopRuns: 6,
              coopRevives: 6,
            },
          },
          seed: 9104,
        });
        await s.page.evaluate(() => {
          window.__wugeng.game.finish();
          window.__wugeng.game.clear();
          window.__wugeng.showHub();
        });
        await s.page.waitForSelector('.screen--hub');

        await fastClick(s.page, '[data-action="open-achievements"]');
        await requireOpenSelector(s.page, '.achievements-modal');
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
        await closeActiveModal(s.page, 'close-achievements');

        const st = await readNormalizedSave(s.page);
        const nonVfxOwned = st.ownedCosmetics.filter((id) => !ATTACK_VFX_IDS.includes(id));
        assert.ok(
          nonVfxOwned.length >= 3,
          `Expected >= 3 achievement-exclusive hero skins unlocked after full achievement completion, got [${nonVfxOwned.join(',')}]`,
        );
        s.assertNoErrors('T1-F9-04');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T1-F9-05',
    tier: 1,
    feature: 'F9',
    name: 'Claiming copper-bounty achievement increments save.coins accurately & clears unclaimed notification badge',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootToHub(s.page, baseUrl, {
          savePatch: {
            coins: 100,
            stats: {
              runs: 5,
              clears: 2,
              firstRunDone: true,
              bestKills: 1200,
              totalKills: 3000,
              totalEvolutions: 6,
              totalBossKills: 5,
            },
          },
        });
        const coinsBefore = await s.page.evaluate(() => window.__wugeng.save.coins);
        await fastClick(s.page, '[data-action="open-achievements"]');
        await requireOpenSelector(s.page, '.achievements-modal');

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
        await closeActiveModal(s.page, 'close-achievements');

        const after = await s.page.evaluate(() => {
          const persisted = JSON.parse(localStorage.getItem('wugeng.save') || '{}');
          const achBtn = document.querySelector('[data-action="open-achievements"]');
          const activeDot = achBtn?.querySelector('.badge-dot, .red-dot, [data-badge]');
          const dotVisible = Boolean(
            activeDot && !activeDot.hidden && getComputedStyle(activeDot).display !== 'none' && (activeDot.textContent || '1') !== '0',
          );
          return {
            coins: window.__wugeng.save.coins,
            persistedCoins: persisted.coins,
            dotVisible,
          };
        });
        assert.ok(after.coins > coinsBefore, `Expected copper bounty claim to increase coins (${coinsBefore} -> ${after.coins})`);
        assert.equal(after.persistedCoins, after.coins);
        assert.equal(after.dotVisible, false, 'Expected unclaimed achievement red-dot cleared once all met achievements are claimed');
        s.assertNoErrors('T1-F9-05');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T1-F9-06',
    tier: 1,
    feature: 'F9',
    name: 'Run settlement (evolve weapon + defeat youshen Dawn clear) updates firstClear, totalEvolutions & totalBossKills in .achievements-modal',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { seed: 9106 });
        await grantItemViaLevelUp(s.page, 'weapon', 'gong', 4);
        await grantItemViaLevelUp(s.page, 'relic', 'clapper', 1);
        await triggerChest(s.page);
        await confirmChestModal(s.page);

        await suppressWardersInPage(s.page);
        await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          r.enemies.length = 0;
          r._spawnAcc = -99999;
          r._bossSpawned = { horse: true, umbrella: true, youshen: false };
          r.time = 601;
          window.__e2eStepFrames(2, { stopOnOverlay: false });
          while (window.__wugeng.overlay === 'levelup') document.querySelector('.qian')?.click();
          const ys = r.enemies.find((e) => e.type === 'youshen');
          ys.x = r.player.x + 25;
          ys.y = r.player.y;
          ys.hp = 1;
          r.player.ult = r.player.ultMax;
        });
        await s.page.keyboard.press('Space');
        await stepFrames(s.page, 4, { stopOnOverlay: false });
        while (await s.page.evaluate(() => window.__wugeng.overlay === 'levelup')) {
          await fastClick(s.page, '.qian');
        }
        await s.page.evaluate(() => {
          window.__wugeng.game.finish();
        });
        await s.page.waitForSelector('.screen--result');
        await s.page.evaluate(() => {
          const btns = [...document.querySelectorAll('.screen--result button')];
          (btns.find((b) => b.textContent.includes('更房')) || btns[btns.length - 1])?.click();
        });
        await s.page.waitForSelector('.screen--hub');

        const stats = await s.page.evaluate(() => ({
          firstClear: Boolean(window.__wugeng.save.achievements?.firstClear),
          totalEvolutions: window.__wugeng.save.stats?.totalEvolutions || 0,
          totalBossKills: window.__wugeng.save.stats?.totalBossKills || 0,
        }));
        assert.equal(stats.firstClear, true, 'Expected firstClear unlocked after defeating Youshen');
        assert.ok(stats.totalEvolutions >= 1, `Expected stats.totalEvolutions >= 1, got ${stats.totalEvolutions}`);
        assert.ok(stats.totalBossKills >= 1, `Expected stats.totalBossKills >= 1, got ${stats.totalBossKills}`);
        s.assertNoErrors('T1-F9-06');
      } finally {
        await s.close();
      }
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // F10: 升级/开箱/神龛选签时暂停查看已有装备面板 (6 tests)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'T1-F10-01',
    tier: 1,
    feature: 'F10',
    name: 'Glanceable .selection-owned-bar renders 6 weapon + 6 relic slots inside .overlay--levelup, .overlay--chest & .overlay--shrine',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, {
          unlockedWeapons: ALL_WEAPON_IDS,
          savePatch: { unlockedWeapons: ALL_WEAPON_IDS },
          seed: 10101,
        });
        for (const wid of ['talisman', 'bell', 'compass', 'suohun_chain', 'nuo_drum']) {
          await grantItemViaLevelUp(s.page, 'weapon', wid, 1);
        }
        await grantItemViaLevelUp(s.page, 'weapon', 'gong', 4);
        await grantItemViaLevelUp(s.page, 'weapon', 'talisman', 4);
        for (const rid of ['clapper', 'cinnabar', 'redstring', 'bagua', 'yinpai', 'wuse_mask']) {
          await grantItemViaLevelUp(s.page, 'relic', rid, 1);
        }

        // 1) .overlay--levelup
        await triggerLevelUp(s.page);
        await requireOpenSelector(s.page, '.overlay--levelup .selection-owned-bar', 'Expected .selection-owned-bar in .overlay--levelup');
        const lvSlots = await countOwnedBarSlots(s.page, '.overlay--levelup');
        assert.ok(lvSlots >= MAX_WEAPONS + MAX_RELICS, `Expected >= 12 distinct slots in levelup .selection-owned-bar, got ${lvSlots}`);
        await fastClick(s.page, '.qian');

        // 2) .overlay--chest
        await triggerChest(s.page);
        await requireOpenSelector(s.page, '.overlay--chest .selection-owned-bar', 'Expected .selection-owned-bar in .overlay--chest');
        const chestSlots = await countOwnedBarSlots(s.page, '.overlay--chest');
        assert.ok(chestSlots >= MAX_WEAPONS + MAX_RELICS, `Expected >= 12 distinct slots in chest .selection-owned-bar, got ${chestSlots}`);
        await confirmChestModal(s.page, 'gong');

        // 3) .overlay--shrine
        await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          const sh = r.shrines.find((x) => !x.used);
          r.enemies.length = 0;
          r._spawnAcc = -99999;
          r.player.x = sh.x;
          r.player.y = sh.y;
          window.__e2eStepFrames(3);
        });
        await fastClick(s.page, '[data-action="interact-shrine"]');
        await requireOpenSelector(s.page, '.overlay--shrine .selection-owned-bar', 'Expected .selection-owned-bar in .overlay--shrine');
        const shrineSlots = await countOwnedBarSlots(s.page, '.overlay--shrine');
        assert.ok(shrineSlots >= MAX_WEAPONS + MAX_RELICS, `Expected >= 12 distinct slots in shrine .selection-owned-bar, got ${shrineSlots}`);
        s.assertNoErrors('T1-F10-01');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T1-F10-02',
    tier: 1,
    feature: 'F10',
    name: '[data-action="inspect-loadout"] opens .veil--inspector (inspectorOpen===true) while keeping overlay==="levelup", time frozen & choices intact',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { seed: 10102 });
        await grantItemViaLevelUp(s.page, 'weapon', 'bell', 1); // zhenhun 2pc
        await grantItemViaLevelUp(s.page, 'relic', 'clapper', 1); // zhenhun 3pc

        await triggerLevelUp(s.page);
        const before = await s.page.evaluate(() => ({
          time: window.__wugeng.game.run.time,
          choices: JSON.stringify(window.__wugeng.game.run.choices),
        }));

        await fastClick(s.page, '[data-action="inspect-loadout"]', 'Expected [data-action="inspect-loadout"] in .overlay--levelup');
        await requireOpenSelector(s.page, '.veil--inspector', 'Expected .veil--inspector');

        const mid = await s.page.evaluate(async () => {
          await new Promise((r) => setTimeout(r, 120));
          window.__e2eStepFrames(10);
          return {
            inspectorOpen: window.__wugeng.inspectorOpen,
            overlay: window.__wugeng.overlay,
            paused: window.__wugeng.game.isPaused(),
            time: window.__wugeng.game.run.time,
            text: document.querySelector('.veil--inspector')?.textContent || '',
          };
        });

        assert.equal(mid.inspectorOpen, true, 'Expected window.__wugeng.inspectorOpen === true');
        assert.equal(mid.overlay, 'levelup', 'Underlying window.__wugeng.overlay must stay "levelup"');
        assert.equal(mid.paused, true, 'Game must stay paused while inspector is open');
        assert.equal(mid.time, before.time, 'Simulation run.time must remain strictly frozen');
        assert.ok(mid.text.includes('镇魂'), 'Inspector must display active school synergy 镇魂');

        await fastClick(s.page, '[data-action="close-inspector"]', 'Expected [data-action="close-inspector"]');
        const after = await s.page.evaluate(() => ({
          inspectorOpen: window.__wugeng.inspectorOpen,
          inspectorDom: Boolean(document.querySelector('.veil--inspector')),
          overlay: window.__wugeng.overlay,
          choices: JSON.stringify(window.__wugeng.game.run.choices),
        }));
        assert.equal(after.inspectorOpen, false);
        assert.equal(after.inspectorDom, false);
        assert.equal(after.overlay, 'levelup');
        assert.equal(after.choices, before.choices, 'Closing inspector must preserve exact .qian choices');

        await fastClick(s.page, '.qian');
        assert.equal(await s.page.evaluate(() => window.__wugeng.overlay), null);
        s.assertNoErrors('T1-F10-02');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T1-F10-03',
    tier: 1,
    feature: 'F10',
    name: '[data-action="inspect-loadout"] works non-destructively inside Watch Blessing, .overlay--chest & .overlay--shrine',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { seed: 10103 });
        await grantItemViaLevelUp(s.page, 'weapon', 'gong', 4);
        await grantItemViaLevelUp(s.page, 'weapon', 'talisman', 5);
        await grantItemViaLevelUp(s.page, 'relic', 'clapper', 1);
        await grantItemViaLevelUp(s.page, 'relic', 'cinnabar', 1);

        // A) Watch Blessing at 84s (WATCH_DURATION)
        await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          r.enemies.length = 0;
          r._spawnAcc = -99999;
          r.time = 83.97;
          window.__e2eStepFrames(4);
        });
        assert.equal(await s.page.evaluate(() => window.__wugeng.game.run.choiceMode), 'blessing');
        await fastClick(s.page, '[data-action="inspect-loadout"]');
        assert.equal(await s.page.evaluate(() => window.__wugeng.inspectorOpen && window.__wugeng.overlay === 'levelup'), true);
        await fastClick(s.page, '[data-action="close-inspector"]');
        assert.equal(await s.page.evaluate(() => window.__wugeng.game.run.choiceMode), 'blessing');
        await fastClick(s.page, '.qian');

        // B) Multi-eligible Chest
        await triggerChest(s.page);
        await fastClick(s.page, '[data-action="inspect-loadout"]');
        assert.equal(await s.page.evaluate(() => window.__wugeng.inspectorOpen && window.__wugeng.overlay === 'chest'), true);
        await fastClick(s.page, '[data-action="close-inspector"]');
        await confirmChestModal(s.page, 'talisman');
        assert.equal(await s.page.evaluate(() => window.__wugeng.game.run.weapons.find((w) => w.id === 'talisman')?.evolved), true);

        // C) World Shrine
        await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          const sh = r.shrines.find((x) => !x.used);
          r.player.x = sh.x;
          r.player.y = sh.y;
          window.__e2eStepFrames(3);
        });
        await fastClick(s.page, '[data-action="interact-shrine"]');
        await requireOpenSelector(s.page, '.overlay--shrine');
        await fastClick(s.page, '[data-action="inspect-loadout"]');
        assert.equal(await s.page.evaluate(() => window.__wugeng.inspectorOpen && window.__wugeng.overlay === 'shrine'), true);
        await fastClick(s.page, '[data-action="close-inspector"]');
        assert.equal(await s.page.evaluate(() => window.__wugeng.overlay), 'shrine');
        s.assertNoErrors('T1-F10-03');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T1-F10-04',
    tier: 1,
    feature: 'F10',
    name: '[data-action="peek-battlefield"] (透视战场) lowers inspector opacity to reveal frozen battlefield & restores cleanly',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { seed: 10104 });
        await triggerLevelUp(s.page);
        await fastClick(s.page, '[data-action="inspect-loadout"]');
        await requireOpenSelector(s.page, '.veil--inspector');

        const opBefore = await readInspectorOpacity(s.page);
        assert.ok(opBefore.effectiveOpacity >= 0.85, `Expected full initial opacity >= 0.85, got ${opBefore.effectiveOpacity}`);

        const peek = await engageInspectorPeek(s.page);
        assert.ok(
          peek.state.effectiveOpacity <= 0.45,
          `Expected peek-battlefield (${peek.mode}) to lower inspector opacity <= 0.45, got ${JSON.stringify(peek.state)}`,
        );
        assert.equal(await s.page.evaluate(() => window.__wugeng.inspectorOpen && window.__wugeng.game.isPaused()), true);

        const opAfter = await releaseInspectorPeek(s.page, peek.mode);
        assert.ok(
          opAfter.effectiveOpacity >= 0.85,
          `Expected releasing peek-battlefield to restore opacity >= 0.85, got ${JSON.stringify(opAfter)}`,
        );
        s.assertNoErrors('T1-F10-04');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T1-F10-05',
    tier: 1,
    feature: 'F10',
    name: 'Locked slip (留签 lockedChoice), banishesLeft & rerolls.free stay 100% intact across open/peek/close of .veil--inspector',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { seed: 10105 });
        await triggerLevelUp(s.page);

        const lockedId = await s.page.getAttribute('.qian >> nth=2', 'data-item-id');
        const cardLock = s.page.locator('.qian >> nth=2 >> [data-action="lock"]');
        if (await cardLock.count() > 0) await cardLock.first().click();
        else {
          await fastClick(s.page, '[data-action="lock"]');
          await s.page.evaluate(() => document.querySelectorAll('.qian')[2]?.click());
        }

        const cardBanish = s.page.locator('.qian >> nth=0 >> [data-action="banish"]');
        if (await cardBanish.count() > 0) await cardBanish.first().click();
        else {
          await fastClick(s.page, '[data-action="banish"]');
          await s.page.evaluate(() => document.querySelectorAll('.qian')[0]?.click());
        }

        const agencyBefore = await s.page.evaluate(() => ({
          lockedId: window.__wugeng.game.run.lockedChoice?.id,
          banishesLeft: window.__wugeng.game.run.banishesLeft,
          rerollsFree: window.__wugeng.game.run.rerolls.free,
        }));
        assert.equal(agencyBefore.lockedId, lockedId);

        await fastClick(s.page, '[data-action="inspect-loadout"]');
        const peek = await engageInspectorPeek(s.page);
        await releaseInspectorPeek(s.page, peek.mode);
        await fastClick(s.page, '[data-action="close-inspector"]');

        const agencyAfter = await s.page.evaluate(() => ({
          lockedId: window.__wugeng.game.run.lockedChoice?.id,
          banishesLeft: window.__wugeng.game.run.banishesLeft,
          rerollsFree: window.__wugeng.game.run.rerolls.free,
        }));
        assert.deepEqual(agencyAfter, agencyBefore, 'Inspector must preserve lockedChoice, banishesLeft & rerolls.free');
        s.assertNoErrors('T1-F10-05');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T1-F10-06',
    tier: 1,
    feature: 'F10',
    name: 'Inspector displays full 6+6 (12-item) loadout, evolved weapon 五更鸣锣, 6-piece 镇魂 synergy & numeric player stats',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, {
          unlockedWeapons: ALL_WEAPON_IDS,
          savePatch: { unlockedWeapons: ALL_WEAPON_IDS },
          seed: 10106,
        });
        await grantItemViaLevelUp(s.page, 'weapon', 'gong', 4);
        for (const wid of ['bell', 'soulbanner', 'talisman', 'suohun_chain', 'nuo_drum']) {
          await grantItemViaLevelUp(s.page, 'weapon', wid, 1);
        }
        for (const rid of ['clapper', 'redstring', 'strawshoes', 'glutinous', 'yinpai', 'wuse_mask']) {
          await grantItemViaLevelUp(s.page, 'relic', rid, 1);
        }
        await triggerChest(s.page);
        await confirmChestModal(s.page, 'gong');

        await triggerLevelUp(s.page);
        await fastClick(s.page, '[data-action="inspect-loadout"]');
        const text = (await s.page.textContent('.veil--inspector')) || '';
        assert.ok(text.includes('五更鸣锣'), 'Expected evolved weapon 五更鸣锣 in .veil--inspector');
        assert.ok(text.includes('无常锁魂链') && text.includes('傩神战鼓'), 'Expected v3 weapons in .veil--inspector');
        assert.ok(text.includes('镇魂'), 'Expected 6-piece 镇魂 synergy in .veil--inspector');
        assert.ok(/伤害|冷却|护甲|移速/.test(text), 'Expected numeric player combat stats in .veil--inspector');
        s.assertNoErrors('T1-F10-06');
      } finally {
        await s.close();
      }
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // F11: TapTap 云存档 v3 升级与跨端无损合并 (6 tests)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'T1-F11-01',
    tier: 1,
    feature: 'F11',
    name: 'Legacy v1 save migrates losslessly to SAVE_VERSION === 3 & backfills signature weapons + v3 schema',
    async run({ browser, baseUrl }) {
      const legacyV1 = JSON.stringify({
        version: 1,
        updatedAt: 1700000000000,
        coins: 888,
        shop: { tizhi: 3, lidao: 2, jiaoli: 1, yanli: 0, wuxing: 0, caiyun: 1, jiyuan: 2, huchi: 0 },
        unlockedHeroes: ['zhou', 'mian', 'daotong'],
        selectedHero: 'mian',
        nightUnlocked: 3,
        nightCleared: 2,
        selectedNight: 2,
        achievements: { firstClear: 1700000000000, kills800: 1700000000000 },
        codex: { weapons: ['gong', 'paperman'], evolutions: ['gong'], relics: ['clapper'], enemies: { paperkid: 42 } },
        settings: { sfx: true, music: false, shake: true, dmgText: 'crit', lowQuality: false },
        checkin: { cycleDay: 2, lastClaimDate: '2026-11-20', cycles: 0, totalClaims: 2 },
        cosmetics: { owned: [], equipped: { lantern: null, outfit: null } },
        charms: [{ relicId: 'clapper' }],
        stats: { runs: 5, clears: 2, firstRunDone: true, totalPlaySec: 1800, bestTimeSec: 600, bestKills: 900, bestHit: 400, totalKills: 2500, totalCoins: 1500 },
      });
      const s = await createIsolatedPage(browser, {
        beforeBootInitScript: (raw) => { localStorage.setItem('wugeng.save', raw); },
        beforeBootArg: legacyV1,
      });
      try {
        await bootToHub(s.page, baseUrl);
        const migrated = await s.page.evaluate(() => window.__wugeng.save);
        assert.equal(migrated.version, SAVE_VERSION, 'Expected save.version === 3');
        assert.equal(migrated.coins, 888);
        assert.equal(migrated.selectedHero, 'mian');
        assert.ok(Array.isArray(migrated.unlockedWeapons), 'Expected save.unlockedWeapons array');
        for (const wid of ['gong', 'paperman', 'talisman']) {
          assert.ok(migrated.unlockedWeapons.includes(wid), `Expected signature weapon '${wid}' backfilled in unlockedWeapons`);
        }
        assert.equal(typeof migrated.daoName, 'string');
        assert.ok(Array.isArray(migrated.achievementClaims));
        assert.equal(typeof migrated.leaderboard?.bestScore, 'number');
        assert.equal(typeof migrated.stats?.coopRuns, 'number');
        assert.equal(typeof migrated.stats?.coopRevives, 'number');
        s.assertNoErrors('T1-F11-01');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T1-F11-02',
    tier: 1,
    feature: 'F11',
    name: '?mockCloud=1 full v3 Cloud Save uploadNow & pullFromCloud round-trip across all new v3 fields',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser, { isolated: true });
      try {
        await bootToHub(s.page, baseUrl, {
          query: 'mockCloud=1',
          savePatch: {
            daoName: '守夜剑客',
            coins: 1450,
            unlockedHeroes: ['zhou', 'yinyang', 'tiejiang', 'nuoxi'],
            selectedHero: 'nuoxi',
            unlockedWeapons: ['gong', 'compass', 'suohun_chain', 'nuo_drum', 'taomujian'],
            selectedStarterWeapon: 'taomujian',
            cosmetics: {
              owned: ['violet_thunder'],
              equipped: { lantern: null, outfit: null, attackVfx: 'violet_thunder', heroSkins: {} },
            },
            leaderboard: { bestScore: 26800, bestEndlessSec: 720, bestKills: 1400, pendingScore: 0, history: [] },
          },
        });

        const res = await s.page.evaluate(async () => {
          const w = window.__wugeng;
          w.save.updatedAt = Date.now() + 10_000;
          const up = await w.cloud.uploadNow(w.save);

          w.save.daoName = '临时重置';
          w.save.coins = 0;
          w.save.unlockedHeroes = ['zhou'];
          w.save.unlockedWeapons = ['gong'];
          w.save.leaderboard.bestScore = 0;
          w.save.updatedAt = 1;

          const pull = await w.cloud.pullFromCloud(w.save);
          const restored = pull?.merged || w.save;
          return { up, restored };
        });

        assert.equal(res.up.ok, true);
        assert.equal(res.restored.daoName, '守夜剑客');
        assert.equal(res.restored.coins, 1450);
        assert.ok(res.restored.unlockedHeroes.includes('nuoxi') && res.restored.unlockedHeroes.includes('yinyang'));
        assert.ok(res.restored.unlockedWeapons.includes('taomujian'));
        assert.equal(res.restored.leaderboard.bestScore, 26800);
        s.assertNoErrors('T1-F11-02');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T1-F11-03',
    tier: 1,
    feature: 'F11',
    name: 'Cross-device lossless union mergeSaves over cloud pull (heroes, weapons, cosmetics, bestScore, codex)',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser, { isolated: true });
      try {
        await bootToHub(s.page, baseUrl, { query: 'mockCloud=1' });
        const merged = await s.page.evaluate(async () => {
          const w = window.__wugeng;
          // Upload Device A archive
          w.save.coins = 400;
          w.save.unlockedHeroes = ['zhou', 'yinyang'];
          w.save.unlockedWeapons = ['gong', 'compass', 'taomujian'];
          w.save.cosmetics.owned = ['frost_moon'];
          w.save.leaderboard.bestScore = 32_000;
          w.save.codex.enemies.suona = 6;
          w.save.updatedAt = 1700000001000;
          await w.cloud.uploadNow(w.save);

          // Simulate newer Device B local state
          w.save.coins = 950;
          w.save.unlockedHeroes = ['zhou', 'nuoxi'];
          w.save.unlockedWeapons = ['gong', 'nuo_drum', 'zhinian_kite'];
          w.save.cosmetics.owned = ['jade_ghostfire'];
          w.save.leaderboard.bestScore = 18_000;
          w.save.codex.enemies = { cinder: 9 };
          w.save.updatedAt = 1700000099000;

          const pull = await w.cloud.pullFromCloud(w.save);
          return pull?.merged || w.save;
        });

        assert.equal(merged.coins, 950, 'Primary newer save coins preserved');
        assert.ok(merged.unlockedHeroes.includes('yinyang') && merged.unlockedHeroes.includes('nuoxi'), 'Union of unlockedHeroes');
        assert.ok(merged.unlockedWeapons.includes('taomujian') && merged.unlockedWeapons.includes('zhinian_kite'), 'Union of unlockedWeapons');
        assert.ok(merged.cosmetics.owned.includes('frost_moon') && merged.cosmetics.owned.includes('jade_ghostfire'), 'Union of cosmetics.owned');
        assert.equal(merged.leaderboard.bestScore, 32_000, 'Max leaderboard.bestScore preserved');
        assert.equal(merged.codex.enemies.suona, 6);
        assert.equal(merged.codex.enemies.cinder, 9);
        s.assertNoErrors('T1-F11-03');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T1-F11-04',
    tier: 1,
    feature: 'F11',
    name: 'Hub Header [data-action="quick-cloud"] displays Chinese status & performs one-click cloud sync',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser, { isolated: true });
      try {
        await bootToHub(s.page, baseUrl, {
          query: 'mockCloud=1',
          savePatch: { coins: 1680, leaderboard: { bestScore: 29_500 } },
        });
        await s.page.evaluate(async () => {
          const w = window.__wugeng;
          w.save.updatedAt = Date.now() + 60_000;
          await w.cloud.uploadNow(w.save);
          w.save.coins = 10;
          w.save.leaderboard.bestScore = 0;
          w.save.updatedAt = 1;
          w.persist(false);
          w.showHub();
        });
        await s.page.waitForSelector('.screen--hub');
        await requireOpenSelector(s.page, '[data-action="quick-cloud"]', 'Expected [data-action="quick-cloud"]');
        const label = (await s.page.textContent('[data-action="quick-cloud"]')) || '';
        assert.ok(/[\u4e00-\u9fff]/.test(label), `Expected Chinese cloud status text on [data-action="quick-cloud"], got '${label}'`);

        await fastClick(s.page, '[data-action="quick-cloud"]');
        await s.page.waitForFunction(() => window.__wugeng.save.coins === 1680, null, { timeout: 3000 });
        const synced = await s.page.evaluate(() => ({
          coins: window.__wugeng.save.coins,
          bestScore: window.__wugeng.save.leaderboard?.bestScore,
          localCoins: JSON.parse(localStorage.getItem('wugeng.save') || '{}').coins,
        }));
        assert.equal(synced.coins, 1680);
        assert.equal(synced.bestScore, 29_500);
        assert.equal(synced.localCoins, 1680);
        s.assertNoErrors('T1-F11-04');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T1-F11-05',
    tier: 1,
    feature: 'F11',
    name: 'Settings .cloud-box (上传云端 / 拉取云端) preserved & tracks auto-upload state cleanly',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser, { isolated: true });
      try {
        await bootToHub(s.page, baseUrl, { query: 'mockCloud=1', savePatch: { coins: 1200 } });
        await fastClick(s.page, '.hub-nav .btn:nth-child(1)');
        await fastClick(s.page, '.shop-row .btn--small');
        await fastClick(s.page, '#ui .veil .btn--ghost');

        await fastClick(s.page, '.hub-nav .btn:nth-child(4)');
        await requireOpenSelector(s.page, '.cloud-box', 'Expected .cloud-box in Settings');
        const txt = (await s.page.textContent('.cloud-box')) || '';
        assert.ok(txt.includes('上传云端') && txt.includes('拉取云端'), 'Settings .cloud-box must keep 上传云端 & 拉取云端 buttons');
        assert.ok(await s.page.evaluate(() => window.__wugeng.cloud.getState().lastUploadAt > 0));
        s.assertNoErrors('T1-F11-05');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T1-F11-06',
    tier: 1,
    feature: 'F11',
    name: '66-entry 百物谱 Codex & newly discovered v3 weapons/relics/enemies persist across page.reload()',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser, { isolated: true });
      try {
        await bootAndStartRun(s.page, baseUrl, {
          unlockedWeapons: ALL_WEAPON_IDS,
          savePatch: { unlockedWeapons: ALL_WEAPON_IDS },
          seed: 11106,
        });
        await grantItemViaLevelUp(s.page, 'weapon', 'suohun_chain', 5);
        await grantItemViaLevelUp(s.page, 'relic', 'yinpai', 1);
        await triggerChest(s.page);
        await confirmChestModal(s.page, 'suohun_chain');

        await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          for (const et of ['suona', 'paperbride', 'cinder']) {
            r.stats.killsByType[et] = (r.stats.killsByType[et] || 0) + 2;
            r.stats.kills += 2;
          }
          window.__wugeng.game.finish();
        });
        await s.page.waitForSelector('.screen--result');

        await s.page.reload();
        await s.page.waitForSelector('.screen--title');
        const codex = await s.page.evaluate(() => window.__wugeng.save.codex);
        assert.ok(codex.weapons.includes('suohun_chain'));
        assert.ok(codex.evolutions.includes('suohun_chain'));
        assert.ok(codex.relics.includes('yinpai'));
        for (const et of NEW_REGULAR_ENEMY_IDS) {
          assert.ok(codex.enemies[et] >= 2);
        }

        await fastClick(s.page, '.title-actions .btn--seal');
        await s.page.waitForSelector('.screen--hub');
        await fastClick(s.page, '.hub-nav .btn:nth-child(2)');
        await requireOpenSelector(s.page, '.codex');
        const counts = [];
        for (let t = 0; t < 5; t++) {
          await s.page.evaluate((idx) => document.querySelectorAll('.codex-tab')[idx]?.click(), t);
          counts.push(await s.page.$$eval('.codex-list > .codex-row:not(.codex-row--ach)', (els) => els.length));
        }
        assert.deepEqual(counts, CODEX_TAB_COUNTS);
        s.assertNoErrors('T1-F11-06');
      } finally {
        await s.close();
      }
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // F12: TapTap「五更守夜总榜」真实对接（c5mzumajes9houq0ra） (5 tests)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'T1-F12-01',
    tier: 1,
    feature: 'F12',
    name: 'Live default PRIMARY_LEADERBOARD_ID === "c5mzumajes9houq0ra" non-empty guard & 五更守夜总榜 modal header',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser, {
        beforeBootInitScript: () => {
          window.__lbCalls = [];
          window.tap = {
            getLeaderboardManager() {
              return {
                loadLeaderboardScores(params) {
                  window.__lbCalls.push({ method: 'loadLeaderboardScores', leaderboardId: params?.leaderboardId, collection: params?.collection });
                  params?.callback?.onSuccess?.({
                    scores: [{ rank: 1, score: 38800, user: { name: '镇魂魁首' } }],
                  });
                },
                loadCurrentPlayerLeaderboardScore(params) {
                  window.__lbCalls.push({ method: 'loadCurrentPlayerLeaderboardScore', leaderboardId: params?.leaderboardId });
                  params?.callback?.onSuccess?.({
                    currentUserScore: { rank: 3, score: 16800, user: { name: '剑清道友' } },
                  });
                },
                submitScores(params) {
                  window.__lbCalls.push({ method: 'submitScores', scores: params?.scores });
                  params?.callback?.onSuccess?.({ results: [] });
                },
                openLeaderboard(params) {
                  window.__lbCalls.push({ method: 'openLeaderboard', leaderboardId: params?.leaderboardId });
                  params?.callback?.onSuccess?.({});
                },
              };
            },
          };
        },
      });
      try {
        await bootToHub(s.page, baseUrl);
        await fastClick(s.page, '[data-action="open-leaderboard"]', 'Expected [data-action="open-leaderboard"] in Hub');
        await requireOpenSelector(s.page, '.leaderboard-modal', 'Expected .leaderboard-modal');
        await s.page.waitForFunction(() => (window.__lbCalls || []).length >= 1, null, { timeout: 3000 });

        const info = await s.page.evaluate(() => ({
          calls: window.__lbCalls,
          text: document.querySelector('.leaderboard-modal')?.textContent || '',
          cfgId:
            window.__wugeng?.leaderboard?.PRIMARY_LEADERBOARD_ID ||
            window.__wugeng?.leaderboard?.leaderboardId ||
            window.__wugeng?.leaderboard?.getConfig?.()?.leaderboardId ||
            null,
        }));
        assert.equal(info.calls[0].leaderboardId, PRIMARY_LEADERBOARD_ID, `Expected SDK call to use '${PRIMARY_LEADERBOARD_ID}'`);
        if (info.cfgId) {
          assert.equal(info.cfgId, PRIMARY_LEADERBOARD_ID);
        }
        assert.ok(info.text.includes('五更守夜总榜'), 'Expected modal title 五更守夜总榜');
        assert.ok(info.text.includes('分'), 'Expected score unit 分');
        s.assertNoErrors('T1-F12-01');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T1-F12-02',
    tier: 1,
    feature: 'F12',
    name: 'End-of-run settlement auto-calls submitScores with positive integer Math.round(score) & leaderboardId c5mzumajes9houq0ra',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser, {
        beforeBootInitScript: () => {
          window.__submittedPayloads = [];
          window.tap = {
            getLeaderboardManager() {
              return {
                submitScores(params) {
                  window.__submittedPayloads.push(params?.scores || []);
                  params?.callback?.onSuccess?.({ results: [] });
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
        await bootAndStartRun(s.page, baseUrl, { seed: 12102 });
        const res = await s.page.evaluate(async () => {
          const r = window.__wugeng.game.run;
          r.time = 185;
          r.stats.kills = 128;
          const summary = window.__wugeng.game.finish();
          await new Promise((res2) => setTimeout(res2, 60));
          return {
            summaryScore: summary.score,
            bestScore: window.__wugeng.save.leaderboard?.bestScore,
            submitted: window.__submittedPayloads,
          };
        });
        await requireOpenSelector(s.page, '.screen--result .result-score', 'Expected .result-score on .screen--result');
        const domScoreText = (await s.page.textContent('.screen--result .result-score')) || '';
        assert.ok(Number.isSafeInteger(res.summaryScore) && res.summaryScore > 0, `Expected positive integer score, got ${res.summaryScore}`);
        assert.ok(domScoreText.replace(/,/g, '').includes(String(res.summaryScore)), `Expected .result-score (${domScoreText}) to match ${res.summaryScore}`);
        assert.ok(res.submitted.length >= 1, 'Expected automatic submitScores call on run settlement');
        const firstBatch = res.submitted[0];
        assert.ok(Array.isArray(firstBatch) && firstBatch.length >= 1 && firstBatch.length <= 5, 'scores.length must be in 1..5');
        const primaryEntry = firstBatch.find((x) => x.leaderboardId === PRIMARY_LEADERBOARD_ID) || firstBatch[0];
        assert.equal(primaryEntry.leaderboardId, PRIMARY_LEADERBOARD_ID);
        assert.equal(primaryEntry.score, res.summaryScore);
        assert.equal(res.bestScore, res.summaryScore);
        s.assertNoErrors('T1-F12-02');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T1-F12-03',
    tier: 1,
    feature: 'F12',
    name: '.leaderboard-modal switches 全服总榜 ([data-collection="public"]) <-> 好友榜 ([data-collection="friends"]) + current rank',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser, { isolated: true });
      try {
        await bootToHub(s.page, baseUrl, {
          query: 'mockLeaderboard=1',
          savePatch: { daoName: '本机守夜人', leaderboard: { bestScore: 18_600 } },
        });
        await fastClick(s.page, '[data-action="open-leaderboard"]');
        await requireOpenSelector(s.page, '.leaderboard-modal');
        await requireOpenSelector(s.page, '[data-collection="public"]', 'Expected [data-collection="public"] tab');
        await requireOpenSelector(s.page, '[data-collection="friends"]', 'Expected [data-collection="friends"] tab');

        await s.page.waitForTimeout(80);
        const pub = await readLeaderboardBodyText(s.page);
        assert.ok(/\d+/.test(pub.bodyText), `Expected numeric rank/score entries in public leaderboard body, got '${pub.bodyText}'`);
        assert.ok(
          /排名|第\s*\d+|名|我的|本机|守夜|\d{3,}/.test(pub.bodyText.replace(/,/g, '')),
          `Expected rank/score rows + current player rank in public leaderboard body, got '${pub.bodyText}'`,
        );

        await fastClick(s.page, '[data-collection="friends"]');
        await s.page.waitForTimeout(80);
        const friends = await readLeaderboardBodyText(s.page);
        assert.ok(/\d+/.test(friends.bodyText), `Expected numeric rank/score entries in friends leaderboard body, got '${friends.bodyText}'`);
        assert.notEqual(
          friends.bodyText,
          pub.bodyText,
          `Switching [data-collection="public"] <-> [data-collection="friends"] must visibly update board rows ('${pub.bodyText}' vs '${friends.bodyText}')`,
        );

        await fastClick(s.page, '[data-collection="public"]');
        await s.page.waitForTimeout(60);
        const pubAgain = await readLeaderboardBodyText(s.page);
        assert.equal(pubAgain.bodyText, pub.bodyText, 'Switching back to public tab must restore public leaderboard rows');
        s.assertNoErrors('T1-F12-03');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T1-F12-04',
    tier: 1,
    feature: 'F12',
    name: '[data-action="open-native-leaderboard"] invokes tap.getLeaderboardManager().openLeaderboard with c5mzumajes9houq0ra',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser, {
        beforeBootInitScript: () => {
          window.__openLbArgs = [];
          window.tap = {
            getLeaderboardManager() {
              return {
                loadLeaderboardScores(p) { p?.callback?.onSuccess?.({ scores: [] }); },
                loadCurrentPlayerLeaderboardScore(p) { p?.callback?.onSuccess?.({}); },
                submitScores(p) { p?.callback?.onSuccess?.({}); },
                openLeaderboard(params) {
                  window.__openLbArgs.push({ leaderboardId: params?.leaderboardId, collection: params?.collection });
                  params?.callback?.onSuccess?.({});
                },
              };
            },
          };
        },
      });
      try {
        await bootToHub(s.page, baseUrl);
        await fastClick(s.page, '[data-action="open-leaderboard"]');
        await requireOpenSelector(s.page, '.leaderboard-modal');
        await fastClick(s.page, '[data-collection="friends"]');
        await fastClick(s.page, '[data-action="open-native-leaderboard"]', 'Expected [data-action="open-native-leaderboard"]');

        const args = await s.page.evaluate(() => window.__openLbArgs);
        assert.ok(args.length >= 1, 'Expected openLeaderboard() called');
        assert.equal(args[0].leaderboardId, PRIMARY_LEADERBOARD_ID);
        assert.equal(args[0].collection, 'friends');
        s.assertNoErrors('T1-F12-04');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T1-F12-05',
    tier: 1,
    feature: 'F12',
    name: 'Result screen [data-action="result-leaderboard"] opens .leaderboard-modal & returns cleanly to .screen--result -> Hub',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser, { isolated: true });
      try {
        await bootAndStartRun(s.page, baseUrl, { query: 'mockLeaderboard=1', seed: 12105 });
        await s.page.evaluate(() => {
          window.__wugeng.game.run.time = 120;
          window.__wugeng.game.run.stats.kills = 80;
          window.__wugeng.game.finish();
        });
        await requireOpenSelector(s.page, '.screen--result [data-action="result-leaderboard"]', 'Expected [data-action="result-leaderboard"]');
        await fastClick(s.page, '[data-action="result-leaderboard"]');
        await requireOpenSelector(s.page, '.leaderboard-modal');

        await closeActiveModal(s.page, 'close-leaderboard');
        await requireOpenSelector(s.page, '.screen--result');
        await s.page.evaluate(() => {
          const btns = [...document.querySelectorAll('.screen--result button')];
          (btns.find((b) => b.textContent.includes('更房')) || btns[btns.length - 1])?.click();
        });
        await s.page.waitForSelector('.screen--hub');
        s.assertNoErrors('T1-F12-05');
      } finally {
        await s.close();
      }
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // F13: TapTap 好友系统、组队分享拉起与隐私政策更新 (5 tests)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'T1-F13-01',
    tier: 1,
    feature: 'F13',
    name: 'Native window.tap.openFriendList() spy invocation & ?mockFriends=1 / ?mockTap=1 simulated friend list rendering',
    async run({ browser, baseUrl }) {
      // Part A: Native window.tap.openFriendList spy WITHOUT ?mockTap=1 shadowing (strict calls >= 1, zero #ui tautology)
      const sNative = await createIsolatedPage(browser, {
        beforeBootInitScript: () => {
          window.__friendListCalls = 0;
          window.tap = {
            openFriendList(opts) {
              window.__friendListCalls++;
              opts?.success?.({});
            },
          };
        },
      });
      try {
        await bootToHub(sNative.page, baseUrl);
        if (await sNative.page.$('[data-action="open-friends"]')) {
          await fastClick(sNative.page, '[data-action="open-friends"]');
        } else {
          await fastClick(sNative.page, '[data-action="open-coop"]');
          await requireOpenSelector(sNative.page, '.coop-modal');
          if (await sNative.page.$('[data-action="open-friends"]')) {
            await fastClick(sNative.page, '[data-action="open-friends"]');
          }
        }
        const nativeCalls = await sNative.page.evaluate(() => {
          if (window.__friendListCalls === 0) {
            const nativeBtn = document.querySelector('[data-action="open-native-friends"], [data-action="tap-friend-list"]');
            if (nativeBtn) nativeBtn.click();
            else window.__wugeng.friends?.openFriendList?.();
          }
          return window.__friendListCalls;
        });
        assert.ok(nativeCalls >= 1, `Expected window.tap.openFriendList() to be invoked (>= 1 call), got ${nativeCalls}`);
        sNative.assertNoErrors('T1-F13-01-native');
      } finally {
        await sNative.close();
      }

      // Part B: Both ?mockFriends=1 and ?mockTap=1 render simulated Daoist friend entries + online status inside the opened panel
      for (const mockQ of ['mockFriends=1', 'mockTap=1']) {
        const sMock = await createIsolatedPage(browser, { isolated: true });
        try {
          await bootToHub(sMock.page, baseUrl, { query: mockQ });
          if (await sMock.page.$('[data-action="open-friends"]')) {
            await fastClick(sMock.page, '[data-action="open-friends"]');
          } else {
            await fastClick(sMock.page, '[data-action="open-coop"]');
            await requireOpenSelector(sMock.page, '.coop-modal');
            if (await sMock.page.$('[data-action="open-friends"]')) {
              await fastClick(sMock.page, '[data-action="open-friends"]');
            }
          }
          await sMock.page.waitForTimeout(60);
          const panelInfo = await sMock.page.evaluate(() => {
            const panel =
              document.querySelector('.friends-modal, .friend-drawer, .friends-panel, #ui .veil:last-of-type, .coop-modal');
            if (!panel) return { mounted: false, bodyText: '', itemCount: 0 };
            const clone = panel.cloneNode(true);
            clone
              .querySelectorAll('h1, h2, h3, .scroll__title, .scroll__head, .scroll__foot, [data-action^="close"], .modal-close')
              .forEach((el) => el.remove());
            const items = panel.querySelectorAll(
              '[data-friend-id], .friend-row, .friend-item, .friend-card, .daoist-friend, .coop-friend',
            );
            return {
              mounted: true,
              bodyText: (clone.textContent || '').replace(/\s+/g, ' ').trim(),
              itemCount: items.length,
            };
          });
          assert.equal(panelInfo.mounted, true, `[${mockQ}] Expected friend modal/drawer mounted`);
          assert.ok(
            panelInfo.itemCount >= 1 || /在线|空闲|守夜中|组队中|可邀请/.test(panelInfo.bodyText),
            `[${mockQ}] Expected simulated friend entries & online status inside opened friend panel, got items=${panelInfo.itemCount}, body='${panelInfo.bodyText}'`,
          );
          sMock.assertNoErrors(`T1-F13-01-${mockQ}`);
        } finally {
          await sMock.close();
        }
      }
    },
  },
  {
    id: 'T1-F13-02',
    tier: 1,
    feature: 'F13',
    name: '[data-action="coop-invite-friend"] passes room=<6-char> to tap.shareAppMessage & tap.showShareboard',
    async run({ browser, baseUrl }) {
      // Case A: shareAppMessage
      const sA = await createIsolatedPage(browser, {
        beforeBootInitScript: () => {
          window.__shareCalls = [];
          window.tap = {
            shareAppMessage(payload) {
              window.__shareCalls.push(payload);
              payload?.success?.({});
            },
          };
        },
      });
      try {
        await bootToHub(sA.page, baseUrl);
        await fastClick(sA.page, '[data-action="open-coop"]');
        await fastClick(sA.page, '[data-action="coop-create"]');
        await sA.page.waitForSelector('[data-room-code]');
        const codeA = await sA.page.evaluate(() => {
          const el = document.querySelector('[data-room-code]');
          return el?.getAttribute('data-room-code') || (el?.textContent || '').trim().match(/[A-Z0-9]{6}/i)?.[0] || '';
        });
        assert.match(codeA, /^[A-Z0-9]{6}$/i);
        await fastClick(sA.page, '[data-action="coop-invite-friend"]', 'Expected [data-action="coop-invite-friend"]');
        const callsA = await sA.page.evaluate(() => window.__shareCalls);
        assert.ok(callsA.length >= 1, 'Expected tap.shareAppMessage called');
        assert.ok(JSON.stringify(callsA[0]).includes(`room=${codeA}`), `Expected share payload to include room=${codeA}: ${JSON.stringify(callsA[0])}`);
        sA.assertNoErrors('T1-F13-02-shareAppMessage');
      } finally {
        await sA.close();
      }

      // Case B: showShareboard fallback when shareAppMessage is absent
      const sB = await createIsolatedPage(browser, {
        beforeBootInitScript: () => {
          window.__boardCalls = [];
          window.tap = {
            showShareboard(payload) {
              window.__boardCalls.push(payload);
              payload?.success?.({});
            },
          };
        },
      });
      try {
        await bootToHub(sB.page, baseUrl);
        await fastClick(sB.page, '[data-action="open-coop"]');
        await fastClick(sB.page, '[data-action="coop-create"]');
        await sB.page.waitForSelector('[data-room-code]');
        const codeB = await sB.page.evaluate(() => {
          const el = document.querySelector('[data-room-code]');
          return el?.getAttribute('data-room-code') || (el?.textContent || '').trim().match(/[A-Z0-9]{6}/i)?.[0] || '';
        });
        await fastClick(sB.page, '[data-action="coop-invite-friend"]');
        const callsB = await sB.page.evaluate(() => window.__boardCalls);
        assert.ok(callsB.length >= 1, 'Expected tap.showShareboard fallback called');
        assert.ok(JSON.stringify(callsB[0]).includes(`room=${codeB}`));
        sB.assertNoErrors('T1-F13-02-showShareboard');
      } finally {
        await sB.close();
      }
    },
  },
  {
    id: 'T1-F13-03',
    tier: 1,
    feature: 'F13',
    name: 'Passive tap.onShareMessage / tap.onShareAppMessage hook registered on boot attaches active roomCode',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser, {
        beforeBootInitScript: () => {
          window.__shareHooks = [];
          window.tap = {
            onShareMessage(cb) { window.__shareHooks.push(cb); },
            onShareAppMessage(cb) { window.__shareHooks.push(cb); },
          };
        },
      });
      try {
        await bootToHub(s.page, baseUrl);
        await fastClick(s.page, '[data-action="open-coop"]');
        await fastClick(s.page, '[data-action="coop-create"]');
        await s.page.waitForSelector('[data-room-code]');

        const res = await s.page.evaluate(() => {
          const el = document.querySelector('[data-room-code]');
          const code = el?.getAttribute('data-room-code') || (el?.textContent || '').trim().match(/[A-Z0-9]{6}/i)?.[0] || '';
          const outputs = (window.__shareHooks || []).map((fn) => fn({}));
          return { hookCount: (window.__shareHooks || []).length, code, outputsStr: JSON.stringify(outputs) };
        });
        assert.ok(res.hookCount >= 1, 'Expected tap.onShareMessage / onShareAppMessage listener registered on boot');
        assert.ok(res.outputsStr.includes(res.code), `Expected passive share hook to attach room ${res.code}: ${res.outputsStr}`);
        s.assertNoErrors('T1-F13-03');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T1-F13-04',
    tier: 1,
    feature: 'F13',
    name: 'Cold/warm auto-join via ?room=AB23CD, ?invite=EF45GH, getLaunchOptionsSync().query.sceneParam & tap.onShow',
    async run({ browser, baseUrl }) {
      // 1) ?room=AB23CD
      const sRoom = await createIsolatedPage(browser, { isolated: true });
      try {
        await sRoom.page.goto(`${baseUrl}/index.html?skipIntro=1&room=AB23CD`);
        await sRoom.page.waitForSelector('.coop-modal', { timeout: 4000 });
        const txt = (await sRoom.page.textContent('.coop-modal')) || '';
        const attr = await sRoom.page.$eval('[data-room-code]', (el) => el.getAttribute('data-room-code') || el.textContent || '').catch(() => txt);
        assert.ok(`${txt} ${attr}`.toUpperCase().includes('AB23CD'), `Expected auto-join to AB23CD, got '${attr}'`);
        sRoom.assertNoErrors('T1-F13-04-room');
      } finally {
        await sRoom.close();
      }

      // 2) ?invite=EF45GH
      const sInv = await createIsolatedPage(browser, { isolated: true });
      try {
        await sInv.page.goto(`${baseUrl}/index.html?skipIntro=1&invite=EF45GH`);
        await sInv.page.waitForSelector('.coop-modal', { timeout: 4000 });
        const txt = (await sInv.page.textContent('.coop-modal')) || '';
        assert.ok(txt.toUpperCase().includes('EF45GH'), `Expected ?invite=EF45GH auto-join, got '${txt}'`);
        sInv.assertNoErrors('T1-F13-04-invite');
      } finally {
        await sInv.close();
      }

      // 3) getLaunchOptionsSync().query.sceneParam + warm tap.onShow
      const sTap = await createIsolatedPage(browser, {
        beforeBootInitScript: () => {
          window.__onShowCbs = [];
          window.tap = {
            getLaunchOptionsSync: () => ({ scene: 1001, query: { sceneParam: 'room=JK67MN' } }),
            onShow: (cb) => { window.__onShowCbs.push(cb); },
          };
        },
      });
      try {
        await sTap.page.goto(`${baseUrl}/index.html?skipIntro=1`);
        await sTap.page.waitForSelector('.coop-modal', { timeout: 4000 });
        assert.ok(((await sTap.page.textContent('.coop-modal')) || '').toUpperCase().includes('JK67MN'));

        await sTap.page.evaluate(() => {
          for (const cb of window.__onShowCbs || []) {
            cb({ scene: 1001, query: { sceneParam: 'room=PQ89RS' } });
          }
        });
        await sTap.page.waitForFunction(() => (document.querySelector('.coop-modal')?.textContent || '').toUpperCase().includes('PQ89RS'));
        sTap.assertNoErrors('T1-F13-04-onShow');
      } finally {
        await sTap.close();
      }
    },
  },
  {
    id: 'T1-F13-05',
    tier: 1,
    feature: 'F13',
    name: 'privacy.html & Title .privacy-body disclose 剑清酱工作室, c5mzumajes9houq0ra, 云存档, 好友 & 多人联机',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser, { isolated: true });
      try {
        await s.page.goto(`${baseUrl}/privacy.html`);
        await s.page.waitForSelector('h1');
        const pageText = (await s.page.textContent('body')) || '';
        for (const term of ['剑清酱工作室', PRIMARY_LEADERBOARD_ID, '云存档', '好友', '联机']) {
          assert.ok(pageText.includes(term), `Expected privacy.html to disclose '${term}'`);
        }

        await s.page.goto(`${baseUrl}/index.html?skipIntro=1`);
        await s.page.waitForSelector('.screen--title');
        await fastClick(s.page, '.title-foot .link-btn');
        await s.page.waitForSelector('.privacy-body');
        const modalText = (await s.page.textContent('.privacy-body')) || '';
        for (const term of ['剑清酱工作室', '排行榜', '好友', '联机']) {
          assert.ok(modalText.includes(term), `Expected Title .privacy-body modal to disclose '${term}'`);
        }
        s.assertNoErrors('T1-F13-05');
      } finally {
        await s.close();
      }
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // F14: 2–4 人「同守五更」真实多人联机 (6 tests)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'T1-F14-01',
    tier: 1,
    feature: 'F14',
    timeoutMs: 18_000,
    name: 'Real 2-page shared-BrowserContext BroadcastChannel join, distinct peerId/heroId/skinId/attackVfx, movement sync & document.hidden non-freeze',
    async run({ browser, baseUrl }) {
      const coop = await createCoopPages(browser, 2);
      try {
        const { hostSkin, guestSkin } = await discoverCoopHeroSkins(coop.hostPage, baseUrl, 'zhou', 'nuoxi', 'mockTap=1');
        await launchTwoPageCoopRun(coop, baseUrl, {
          hostHero: 'zhou',
          guestHero: 'nuoxi',
          hostSkin,
          guestSkin,
          hostVfx: 'jade_ghostfire',
          guestVfx: 'violet_thunder',
        });

        const peers = await Promise.all([
          coop.hostPage.evaluate(() => ({
            peerId: sessionStorage.getItem('wugeng.peerId'),
            localPeerLeak: localStorage.getItem('wugeng.peerId'),
            players: window.__wugeng.game.run.players.map((p) => ({
              heroId: p.heroId,
              skinId: p.skinId,
              x: p.x,
              y: p.y,
              attackVfx: p.attackVfx,
            })),
          })),
          coop.guestPage.evaluate(() => ({
            peerId: sessionStorage.getItem('wugeng.peerId'),
            players: window.__wugeng.game.run.players.map((p) => ({
              heroId: p.heroId,
              skinId: p.skinId,
              x: p.x,
              y: p.y,
              attackVfx: p.attackVfx,
            })),
          })),
        ]);

        assert.ok(peers[0].peerId && peers[1].peerId, 'Expected non-empty sessionStorage["wugeng.peerId"] on both tabs');
        assert.notEqual(peers[0].peerId, peers[1].peerId, 'Host and Guest tabs must have distinct peerIds');
        assert.equal(peers[0].localPeerLeak, null, 'peerId must NOT be stored in shared localStorage');
        assert.equal(peers[0].players.length, 2);
        assert.equal(peers[1].players.length, 2);

        for (const [tabLabel, pList] of [['hostPage', peers[0].players], ['guestPage', peers[1].players]]) {
          assert.equal(pList[0].heroId, 'zhou', `[${tabLabel}] Expected players[0].heroId === 'zhou'`);
          assert.equal(pList[1].heroId, 'nuoxi', `[${tabLabel}] Expected players[1].heroId === 'nuoxi'`);
          assert.equal(pList[0].skinId, hostSkin, `[${tabLabel}] Expected players[0].skinId === '${hostSkin}'`);
          assert.equal(pList[1].skinId, guestSkin, `[${tabLabel}] Expected players[1].skinId === '${guestSkin}'`);
          assert.notEqual(pList[0].skinId, pList[1].skinId, `[${tabLabel}] Host & Guest must have distinct non-default skinIds`);
          assert.equal(pList[0].attackVfx, 'jade_ghostfire', `[${tabLabel}] Expected players[0].attackVfx === 'jade_ghostfire'`);
          assert.equal(pList[1].attackVfx, 'violet_thunder', `[${tabLabel}] Expected players[1].attackVfx === 'violet_thunder'`);
        }

        // Hold KeyD on guestPage -> verify guest player x increases on BOTH hostPage and guestPage!
        const guestX0OnHost = peers[0].players[1].x;
        await Promise.all([
          coop.hostPage.evaluate(() => {
            const r = window.__wugeng.game.run;
            r.enemies.length = 0;
            r._spawnAcc = -99999;
          }),
          coop.guestPage.evaluate(() => {
            const r = window.__wugeng.game.run;
            r.enemies.length = 0;
            r._spawnAcc = -99999;
          }),
        ]);
        await coop.guestPage.keyboard.down('KeyD');
        await stepCoopFrames([coop.hostPage, coop.guestPage], 36, 6, { preserveInput: true });
        await coop.guestPage.keyboard.up('KeyD');
        await stepCoopFrames([coop.hostPage, coop.guestPage], 6, 6);

        const afterMove = await Promise.all([
          coop.hostPage.evaluate(() => window.__wugeng.game.run.players[1].x),
          coop.guestPage.evaluate(() => window.__wugeng.game.run.players[1].x),
        ]);
        assert.ok(
          afterMove[0] > guestX0OnHost + 20,
          `Expected Guest KeyD input to sync over BroadcastChannel onto hostPage (${guestX0OnHost.toFixed(1)} -> ${afterMove[0].toFixed(1)})`,
        );
        assert.ok(Math.abs(afterMove[0] - afterMove[1]) < 35, `Expected Host & Guest positions converged (${afterMove[0]} vs ${afterMove[1]})`);

        // Verify document.hidden = true does NOT auto-pause active Co-op session!
        const hiddenRes = await coop.hostPage.evaluate(() => {
          Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
          document.dispatchEvent(new Event('visibilitychange'));
          return {
            paused: window.__wugeng.game.isPaused(),
            pauseOverlay: Boolean(document.querySelector('.overlay--pause')),
          };
        });
        assert.equal(hiddenRes.paused, false, 'Active Co-op session must NOT freeze/pause when tab becomes document.hidden');
        assert.equal(hiddenRes.pauseOverlay, false);
        coop.assertNoErrors('T1-F14-01');
      } finally {
        await coop.close();
      }
    },
  },
  {
    id: 'T1-F14-02',
    tier: 1,
    feature: 'F14',
    timeoutMs: 20_000,
    name: 'Real 2-page Co-op downed ally (downed===true non-wipe) -> r<=48 Bagua circle revive (>=2.4s) -> .result-squad & .mvp-seal',
    async run({ browser, baseUrl }) {
      const coop = await createCoopPages(browser, 2);
      try {
        await launchTwoPageCoopRun(coop, baseUrl, { hostHero: 'zhou', guestHero: 'mian' });

        // 1) Deal lethal hit to Guest (players[1]) while Host (players[0]) is 180px away
        await coop.hostPage.evaluate(() => {
          const r = window.__wugeng.game.run;
          r.enemies.length = 0;
          r._spawnAcc = -99999;
          r._nextWaveT = 99999;
          r.weapons.forEach((w) => { w.cd = 9999; });
          const p0 = r.players[0];
          const p1 = r.players[1];
          p0.hp = p0.maxHp;
          p0.invulnT = 10;
          p0.x = 0;
          p0.y = 0;
          p1.x = 180;
          p1.y = 0;
          p1.invulnT = 0;
          p1.hp = 1;
          r.enemies.push({
            id: 890001, type: 'lanternghost', x: p1.x, y: p1.y, r: 22,
            hp: 99999, maxHp: 99999, elite: false, boss: false, hitT: 0, slowT: 0,
            state: 'move', angle: 0, speed: 0, dmg: 9999, xp: 0, atkT: 0, stateT: 0, stunT: 0,
            dx: 0, dy: 0, kbx: 0, kby: 0, dead: false,
          });
        });
        await stepCoopFrames([coop.hostPage, coop.guestPage], 12, 6);

        const downedState = await Promise.all([
          coop.hostPage.evaluate(() => ({
            status: window.__wugeng.game.run.status,
            downed: window.__wugeng.game.run.players[1].downed,
            hp: window.__wugeng.game.run.players[1].hp,
          })),
          coop.guestPage.evaluate(() => ({
            status: window.__wugeng.game.run.status,
            downed: window.__wugeng.game.run.players[1].downed,
          })),
        ]);
        assert.equal(downedState[0].status, 'playing', 'Downing 1 of 2 players must NOT wipe run');
        assert.equal(downedState[0].downed, true, 'Expected players[1].downed === true on Host');
        assert.equal(downedState[0].hp, 0);
        assert.equal(downedState[1].downed, true, 'Expected downed state synced onto Guest tab');

        // 2) Clear enemy, move Host into Guest's Bagua revive circle (d=16 <= 48px) and step 162 frames (2.7s >= 2.4s)
        await coop.hostPage.evaluate(() => {
          const r = window.__wugeng.game.run;
          r.enemies.length = 0;
          const p0 = r.players[0];
          const p1 = r.players[1];
          p0.x = p1.x - 16;
          p0.y = p1.y;
        });
        await stepCoopFrames([coop.hostPage, coop.guestPage], 162, 6);

        const [revived, guestRevived] = await Promise.all([
          coop.hostPage.evaluate(() => {
            const r = window.__wugeng.game.run;
            const p0 = r.players[0];
            const p1 = r.players[1];
            return {
              downed: p1.downed,
              hp: p1.hp,
              maxHp: p1.maxHp,
              invulnT: p1.invulnT,
              revivesDone: p0.stats?.revivesDone || 0,
            };
          }),
          coop.guestPage.evaluate(() => {
            const p1 = window.__wugeng.game.run.players[1];
            return {
              downed: p1.downed,
              hp: p1.hp,
            };
          }),
        ]);
        assert.equal(revived.downed, false, 'Expected Guest revived after >= 2.4s inside r<=48 Bagua circle on Host');
        assert.ok(revived.hp >= Math.floor(revived.maxHp * 0.45), `Expected ~50% HP restored (${revived.hp}/${revived.maxHp})`);
        assert.ok(revived.invulnT > 1.0, `Expected post-revive invulnT > 1.0s, got ${revived.invulnT}`);
        assert.ok(revived.revivesDone >= 1, `Expected rescuer stats.revivesDone >= 1, got ${revived.revivesDone}`);
        assert.equal(guestRevived.downed, false, 'Expected revived downed===false state synced back onto guestPage');
        assert.ok(guestRevived.hp > 0, `Expected revived positive HP synced back onto guestPage, got ${guestRevived.hp}`);

        // 3) Settle run -> verify .result-squad & .mvp-seal
        await coop.hostPage.evaluate(() => {
          const r = window.__wugeng.game.run;
          r.players[0].stats.damageDealt = 9600;
          r.players[0].stats.kills = 48;
          r.players[1].stats.damageDealt = 2400;
          r.players[1].stats.kills = 12;
          r.time = 150;
          r.stats.kills = 60;
          window.__wugeng.game.finish();
        });
        await requireOpenSelector(coop.hostPage, '.screen--result .result-squad', 'Expected .result-squad on Co-op Result screen');
        await requireOpenSelector(coop.hostPage, '.screen--result .mvp-seal', 'Expected .mvp-seal on Co-op Result screen');
        coop.assertNoErrors('T1-F14-02');
      } finally {
        await coop.close();
      }
    },
  },
  {
    id: 'T1-F14-03',
    tier: 1,
    feature: 'F14',
    name: 'Smart Daoist Companion AI ([data-action="coop-add-bot"]): 3P HP scaling (1 + 0.55*(N-1)) & autonomous AI rescue',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser, { isolated: true });
      try {
        // Measure solo baseline enemy maxHp at t=10
        await bootAndStartRun(s.page, baseUrl, { seed: 14103 });
        const soloHp = await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          r.enemies.length = 0;
          r._spawnAcc = -99999;
          r.time = 10;
          r._spawnQueue.push({ type: 'lanternghost', x: r.player.x + 200, y: r.player.y, opts: { elite: false } });
          window.__e2eStepFrames(1);
          return r.enemies[0].maxHp;
        });

        // Create 3P session via Hub .coop-modal + 2 Daoist bots
        await bootToHub(s.page, baseUrl, { query: 'mockTap=1' });
        await fastClick(s.page, '[data-action="open-coop"]');
        await fastClick(s.page, '[data-action="coop-create"]');
        await fastClick(s.page, '[data-action="coop-add-bot"]', 'Expected [data-action="coop-add-bot"]');
        await fastClick(s.page, '[data-action="coop-add-bot"]');
        await fastClick(s.page, '[data-action="coop-start"]');
        await s.page.waitForFunction(() => window.__wugeng.game.run?.players?.length === 3);

        const coopRes = await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          r.enemies.length = 0;
          r._spawnAcc = -99999;
          r._nextWaveT = 99999;
          r.time = 10;
          r._spawnQueue.push({ type: 'lanternghost', x: r.player.x + 220, y: r.player.y, opts: { elite: false } });
          window.__e2eStepFrames(1);
          const hp3P = r.enemies[0].maxHp;

          // Down human player (players[0]), place bots 110px away, verify autonomous AI rescue
          r.enemies.length = 0;
          const p0 = r.players[0];
          p0.invulnT = 0;
          p0.hp = 1;
          r.players[1].x = p0.x + 110;
          r.players[1].y = p0.y;
          r.players[2].x = p0.x - 110;
          r.players[2].y = p0.y;
          r.enemies.push({
            id: 891001, type: 'lanternghost', x: p0.x, y: p0.y, r: 20,
            hp: 99999, maxHp: 99999, elite: false, boss: false, hitT: 0, slowT: 0,
            state: 'move', angle: 0, speed: 0, dmg: 9999, xp: 0, atkT: 0, stateT: 0, stunT: 0,
            dx: 0, dy: 0, kbx: 0, kby: 0, dead: false,
          });
          window.__e2eStepFrames(4, { stopOnOverlay: false });
          const wasDowned = p0.downed;
          r.enemies.length = 0;
          window.__e2eStepFrames(240, { stopOnOverlay: false });
          return {
            hp3P,
            botsValid: Boolean(r.players[1].isBot && r.players[2].isBot),
            wasDowned,
            revivedByBots: !p0.downed && p0.hp > 0,
          };
        });

        const expectedRatio = 1 + COOP_SPEC.hpScalePerExtra * 2; // 2.10x
        const actualRatio = coopRes.hp3P / soloHp;
        assert.ok(
          actualRatio >= expectedRatio - 0.15 && actualRatio <= expectedRatio + 0.15,
          `Expected 3P enemy HP scaling ~${expectedRatio}x (${soloHp} -> ${coopRes.hp3P}, ratio=${actualRatio.toFixed(2)})`,
        );
        assert.equal(coopRes.botsValid, true);
        assert.equal(coopRes.wasDowned, true);
        assert.equal(coopRes.revivedByBots, true, 'Smart Daoist AI companions must walk into Bagua circle and revive downed human player');
        s.assertNoErrors('T1-F14-03');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T1-F14-04',
    tier: 1,
    feature: 'F14',
    name: 'Quick Match ([data-action="coop-quick"]) pairs two tabs over wugeng.coop.lobby.v3 into the same room',
    async run({ browser, baseUrl }) {
      const coop = await createCoopPages(browser, 2);
      try {
        await bootToHub(coop.hostPage, baseUrl, { query: 'mockTap=1' });
        await bootToHub(coop.guestPage, baseUrl, { query: 'mockTap=1' });

        await fastClick(coop.hostPage, '[data-action="open-coop"]');
        await fastClick(coop.guestPage, '[data-action="open-coop"]');
        await fastClick(coop.hostPage, '[data-action="coop-quick"]', 'Expected [data-action="coop-quick"]');
        await coop.hostPage.waitForTimeout(80);
        await fastClick(coop.guestPage, '[data-action="coop-quick"]');

        await coop.hostPage.waitForFunction(() => {
          const w = window.__wugeng;
          const len = w?.coop?.getParty?.()?.length || w?.coop?.party?.length || w?.coop?.state?.party?.length || 0;
          return len >= 2 || Boolean(window.__wugeng?.game?.run?.players?.length >= 2);
        }, null, { timeout: 4500 });

        const codes = await Promise.all(
          [coop.hostPage, coop.guestPage].map((p) =>
            p.evaluate(() => {
              const el = document.querySelector('[data-room-code]');
              const code =
                el?.getAttribute('data-room-code') ||
                (el?.textContent || '').match(/[A-Z0-9]{6}/i)?.[0] ||
                window.__wugeng?.coop?.roomCode ||
                window.__wugeng?.coop?.getState?.()?.roomCode ||
                '';
              return code.toUpperCase();
            }),
          ),
        );
        assert.ok(codes[0].length >= 4, `Expected non-empty paired room code, got '${codes[0]}'`);
        assert.equal(codes[0], codes[1], `Both Quick-Match tabs must converge on the same room code (${codes[0]} vs ${codes[1]})`);
        coop.assertNoErrors('T1-F14-04');
      } finally {
        await coop.close();
      }
    },
  },
  {
    id: 'T1-F14-05',
    tier: 1,
    feature: 'F14',
    timeoutMs: 15_000,
    name: 'Serverless WebRTC P2P (RTCPeerConnection + RTCDataChannel) offer/answer signaling handshake connects cleanly',
    async run({ browser, baseUrl }) {
      const coop = await createCoopPages(browser, 2);
      try {
        await bootToHub(coop.hostPage, baseUrl, { query: 'mockTap=1' });
        await bootToHub(coop.guestPage, baseUrl, { query: 'mockTap=1' });
        await fastClick(coop.hostPage, '[data-action="open-coop"]');
        await fastClick(coop.guestPage, '[data-action="open-coop"]');

        const offerCode = await coop.hostPage.evaluate(async () => {
          const c = window.__wugeng.coop;
          if (typeof c?.createWebRtcOffer === 'function') {
            const res = await c.createWebRtcOffer();
            return typeof res === 'string' ? res : res?.code || res?.offer || '';
          }
          return '';
        });
        assert.ok(typeof offerCode === 'string' && offerCode.length > 16, `Expected non-empty WebRTC offer code, got '${offerCode}'`);

        const answerCode = await coop.guestPage.evaluate(async (offer) => {
          const c = window.__wugeng.coop;
          const res = await c.acceptWebRtcOffer(offer);
          return typeof res === 'string' ? res : res?.code || res?.answer || '';
        }, offerCode);
        assert.ok(typeof answerCode === 'string' && answerCode.length > 16, `Expected non-empty WebRTC answer code, got '${answerCode}'`);

        const accepted = await coop.hostPage.evaluate(async (ans) => {
          const c = window.__wugeng.coop;
          await c.acceptWebRtcAnswer(ans);
          return true;
        }, answerCode);
        assert.equal(accepted, true);
        coop.assertNoErrors('T1-F14-05');
      } finally {
        await coop.close();
      }
    },
  },
  {
    id: 'T1-F14-06',
    tier: 1,
    feature: 'F14',
    name: 'Multi-Watchman #game-canvas renders overhead nameplates/HP bars & vermilion r~48px Bagua revive ring around downed ally',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser, { isolated: true });
      try {
        await bootToHub(s.page, baseUrl, { query: 'mockTap=1' });
        await fastClick(s.page, '[data-action="open-coop"]');
        await fastClick(s.page, '[data-action="coop-create"]');
        await fastClick(s.page, '[data-action="coop-add-bot"]');
        await fastClick(s.page, '[data-action="coop-start"]');
        await s.page.waitForFunction(() => window.__wugeng.game.run?.players?.length === 2);

        const ringDelta = await s.page.evaluate(async () => {
          const w = window.__wugeng;
          const r = w.game.run;
          r.enemies.length = 0;
          r.props.length = 0;
          r.pickups.length = 0;
          r.projectiles.length = 0;
          if (Array.isArray(r.shrines)) r.shrines.length = 0;
          r.weapons.forEach((wp) => { wp.cd = 9999; });
          r.darkness = 0;
          r.time = 8;
          const p0 = r.players[0];
          const p1 = r.players[1];
          p0.x = 0;
          p0.y = 0;
          p1.x = 85;
          p1.y = 0;
          p1.downed = false;
          p1.hp = Math.max(1, Math.floor(p1.maxHp * 0.65));
          w.game.pause();

          const c = document.getElementById('game-canvas');
          const ctx = c.getContext('2d');
          const dpr = c.width / window.innerWidth;
          const cx = Math.floor((window.innerWidth / 2 + 85) * dpr);
          const cy = Math.floor((window.innerHeight / 2) * dpr);

          const sampleOverheadHud = () => {
            const x0 = Math.max(0, Math.floor(cx - 18 * dpr));
            const y0 = Math.max(0, Math.floor(cy - 48 * dpr));
            const bw = Math.min(c.width - x0, Math.max(1, Math.floor(36 * dpr)));
            const bh = Math.min(c.height - y0, Math.max(1, Math.floor(24 * dpr)));
            const d = ctx.getImageData(x0, y0, bw, bh).data;
            let ink = 0;
            let verm = 0;
            for (let i = 0; i < d.length; i += 4) {
              const R = d[i];
              const G = d[i + 1];
              const B = d[i + 2];
              if (R < 60 && G < 60 && B < 60) ink++;
              if (R > 135 && R - G > 45 && R - B > 45) verm++;
            }
            return { ink, verm };
          };

          const countVermRing = () => {
            let verm = 0;
            for (let a = 0; a < 48; a++) {
              for (const rad of [42, 46, 48, 50]) {
                const px = Math.floor(cx + Math.cos((a / 48) * Math.PI * 2) * rad * dpr);
                const py = Math.floor(cy + Math.sin((a / 48) * Math.PI * 2) * rad * dpr);
                if (px < 0 || py < 0 || px >= c.width || py >= c.height) continue;
                const d = ctx.getImageData(px, py, 1, 1).data;
                if (d[0] > 135 && d[0] - d[1] > 45) verm++;
              }
            }
            return verm;
          };

          await new Promise((res) => requestAnimationFrame(res));
          await new Promise((res) => requestAnimationFrame(res));
          const overhead = sampleOverheadHud();
          const aliveRing = countVermRing();

          p1.downed = true;
          p1.hp = 0;
          p1.reviveProgress = 0.5;
          await new Promise((res) => requestAnimationFrame(res));
          await new Promise((res) => requestAnimationFrame(res));
          const downedRing = countVermRing();

          return { overhead, aliveRing, downedRing };
        });

        assert.ok(
          ringDelta.overhead.ink >= 4 && ringDelta.overhead.verm >= 2,
          `Expected overhead Daoist nameplate (INK) & HP bar (VERM) pixels above watchman, got ${JSON.stringify(ringDelta.overhead)}`,
        );
        assert.ok(
          ringDelta.downedRing > ringDelta.aliveRing + 10,
          `Expected vermilion Bagua revive circle (~48px) drawn around downed teammate (alive=${ringDelta.aliveRing}, downed=${ringDelta.downedRing})`,
        );
        s.assertNoErrors('T1-F14-06');
      } finally {
        await s.close();
      }
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // F15: 分模块中文 Git 合入 main、实机预览图、零缺字打包与 TapTap 合规 (6 tests)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'T1-F15-01',
    tier: 1,
    feature: 'F15',
    name: 'wenkai-subset.woff2 (< 400KB) carries OpenType vert GSUB & renders v3 vocabulary via document.fonts',
    async run({ browser, baseUrl }) {
      const fontPath = path.join(ROOT, 'assets', 'fonts', 'wenkai-subset.woff2');
      const stat = fs.statSync(fontPath);
      assert.ok(stat.size > 50_000 && stat.size < 409_600, `Expected wenkai-subset.woff2 < 400KB (409,600 B), got ${stat.size} B`);

      const { stdout } = await execFileAsync(
        VENV_PYTHON,
        [
          '-c',
          'import json, sys; from fontTools.ttLib import TTFont; tt = TTFont(sys.argv[1]); tags = sorted({r.FeatureTag for r in tt["GSUB"].table.FeatureList.FeatureRecord}) if "GSUB" in tt else []; print(json.dumps({"tags": tags}))',
          fontPath,
        ],
        { cwd: ROOT, timeout: 10_000 },
      );
      const meta = JSON.parse(stdout.trim());
      assert.ok(meta.tags.includes('vert'), `Expected OpenType 'vert' feature in GSUB, got ${meta.tags.join(',')}`);

      const s = await createIsolatedPage(browser);
      try {
        await bootToHub(s.page, baseUrl);
        const fontOk = await s.page.evaluate(() =>
          document.fonts.check('18px "WenKai"', '剑清酱工作室五更守夜总榜同守五更鬼市商铺守夜功绩查看行囊透视战场本命专精'),
        );
        assert.equal(fontOk, true, 'Expected WenKai subset active in document.fonts for v3 vocabulary');
        s.assertNoErrors('T1-F15-01');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T1-F15-02',
    tier: 1,
    feature: 'F15',
    name: '100% Zero-Tofu TTFont.getBestCmap() scan across all runtime HTML/CSS/JS + v3 copy',
    async run() {
      const v3ExtraCopy = [
        '剑清酱工作室五更守夜总榜同守五更鬼市商铺守夜功绩查看行囊透视战场本命专精全服总榜好友榜',
        '沈观星石敢当柳青衣',
        ...Object.values(V3_BASE_WEAPON_NAMES),
        ...Object.values(V3_RELIC_NAMES),
        ...Object.values(ATTACK_VFX_NAMES),
      ].join('');

      const pyScript = String.raw`
import json, pathlib, re, sys
from fontTools.ttLib import TTFont

root = pathlib.Path(sys.argv[1])
extra = sys.argv[2]
tt = TTFont(str(root / "assets/fonts/wenkai-subset.woff2"))
cmap = set(tt.getBestCmap().keys())

required_chars = set("°−×·‹›→←↑↓＋－％：；，。！？「」『』【】（）—…")
required_chars.update(extra)

scan_files = [root / "index.html", root / "privacy.html", root / "styles.css"]
scan_files.extend(p for p in (root / "src").rglob("*.js") if p.name not in {"mock-run.js", "sheet.js"})

str_re = re.compile(r"""(?:'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|\x60(?:\\.|[^\x60\\])*\x60)""", re.S)
for f in scan_files:
    txt = f.read_text(encoding="utf-8")
    if f.suffix == ".html":
        txt = re.sub(r"<script\b[^>]*>.*?</script>", "", txt, flags=re.S)
        txt = re.sub(r"<style\b[^>]*>.*?</style>", "", txt, flags=re.S)
        txt = re.sub(r"<[^>]+>", "", txt)
        for ch in txt:
            if ord(ch) > 0x7E and not ch.isspace():
                required_chars.add(ch)
    else:
        clean = re.sub(r"/\*.*?\*/", "", txt, flags=re.S)
        clean = re.sub(r"(?m)^\s*//.*$", "", clean)
        for m in str_re.finditer(clean):
            lit = m.group(0)[1:-1]
            for ch in lit:
                cp = ord(ch)
                if cp >= 0xA0 and not ch.isspace() and not (0xD800 <= cp <= 0xDFFF):
                    required_chars.add(ch)

missing = sorted(
    f"U+{ord(c):04X}({c})"
    for c in required_chars
    if not c.isspace() and ord(c) >= 0x20 and ord(c) not in cmap
)
print(json.dumps({"checked": len(required_chars), "missing": missing[:50], "missingCount": len(missing)}, ensure_ascii=False))
`;
      const { stdout } = await execFileAsync(VENV_PYTHON, ['-c', pyScript, ROOT, v3ExtraCopy], { cwd: ROOT, timeout: 15_000 });
      const report = JSON.parse(stdout.trim());
      assert.equal(
        report.missingCount,
        0,
        `wenkai-subset.woff2 is missing ${report.missingCount} runtime/v3 glyphs: ${report.missing.join(', ')}`,
      );
    },
  },
  {
    id: 'T1-F15-03',
    tier: 1,
    feature: 'F15',
    name: 'dist/wugeng-h5.zip CRC, <= 300MB structure & SHA-256 byte-for-byte parity with live runtime files',
    async run() {
      const zipPath = path.join(ROOT, 'dist', 'wugeng-h5.zip');
      assert.ok(fs.existsSync(zipPath), 'Expected dist/wugeng-h5.zip to exist');
      const size = fs.statSync(zipPath).size;
      assert.ok(size > 100_000 && size <= 300_000_000, `Expected zip size in (100KB, 300MB], got ${size}`);

      const { stdout } = await execFileAsync(
        VENV_PYTHON,
        [
          '-c',
          'import json, sys, zipfile; z = zipfile.ZipFile(sys.argv[1]); print(json.dumps({"bad": z.testzip(), "names": z.namelist()}))',
          zipPath,
        ],
        { cwd: ROOT, timeout: 10_000 },
      );
      const info = JSON.parse(stdout.trim());
      assert.equal(info.bad, null, `Zip CRC failed on ${info.bad}`);
      assert.ok(info.names.every((n) => n.startsWith('wugeng/')));
      for (const req of [
        'wugeng/index.html',
        'wugeng/privacy.html',
        'wugeng/styles.css',
        'wugeng/src/main.js',
        'wugeng/assets/fonts/wenkai-subset.woff2',
        'wugeng/assets/fonts/OFL.txt',
      ]) {
        assert.ok(info.names.includes(req), `Missing required zip entry '${req}'`);
      }

      const { appDir } = await extractH5ZipToScratch('parity_v3');
      const walkJs = (dir, acc = []) => {
        for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, ent.name);
          if (ent.isDirectory()) walkJs(full, acc);
          else if (
            ent.isFile() &&
            ent.name.endsWith('.js') &&
            !['mock-run.js', 'sheet.js'].includes(ent.name) &&
            !ent.name.includes('.test.')
          ) {
            acc.push(path.relative(ROOT, full));
          }
        }
        return acc;
      };
      const expectedRelFiles = [
        'index.html',
        'privacy.html',
        'styles.css',
        'assets/fonts/wenkai-subset.woff2',
        ...walkJs(path.join(ROOT, 'src')),
      ];
      const mismatches = [];
      for (const rel of expectedRelFiles) {
        const livePath = path.join(ROOT, rel);
        const zippedPath = path.join(appDir, rel);
        if (!fs.existsSync(zippedPath)) {
          mismatches.push(`MISSING_IN_ZIP:${rel}`);
        } else if (sha256File(livePath) !== sha256File(zippedPath)) {
          mismatches.push(`STALE_SHA256:${rel}`);
        }
      }
      assert.deepEqual(
        mismatches,
        [],
        `dist/wugeng-h5.zip out of sync with live repo (re-run python3 tools/package_h5.py): ${mismatches.join(', ')}`,
      );
    },
  },
  {
    id: 'T1-F15-04',
    tier: 1,
    feature: 'F15',
    name: 'Deterministic preview screenshot hooks (?introHold=loading|logo, style-lab?scene=skins|vfx) & 12+ CADPA modal',
    async run({ browser, baseUrl }) {
      const sLoad = await bootColdIntro(browser, baseUrl, { query: 'introHold=loading', waitForHold: true });
      try {
        assert.equal(await sLoad.page.evaluate(() => window.__wugengIntro?.phase), 'loading');
      } finally {
        await sLoad.close();
      }

      const sLogo = await bootColdIntro(browser, baseUrl, { query: 'introHold=logo', waitForHold: true });
      try {
        assert.equal(await sLogo.page.evaluate(() => window.__wugengIntro?.phase), 'logo');
      } finally {
        await sLogo.close();
      }

      const sLab = await createIsolatedPage(browser, { styleLab: true });
      try {
        for (const sc of ['skins', 'vfx']) {
          await sLab.page.goto(`${baseUrl}/style-lab.html?scene=${sc}`);
          await sLab.page.waitForFunction(() => window.__ready === true, null, { timeout: 6000 });
          const snap = await analyzeCanvasSpriteBox(sLab.page, '#game-canvas');
          assert.ok(snap && snap.nonBgPixels > 500, `Expected non-blank preview canvas for style-lab?scene=${sc}`);
        }
        sLab.assertNoErrors('T1-F15-04-lab');
      } finally {
        await sLab.close();
      }

      const sCadpa = await createIsolatedPage(browser);
      try {
        await bootGame(sCadpa.page, baseUrl);
        await requireOpenSelector(sCadpa.page, '.age-badge', 'Expected 12+ CADPA .age-badge on Title');
        await fastClick(sCadpa.page, '.age-badge');
        await requireOpenSelector(sCadpa.page, '#ui .veil', 'Expected 12+ CADPA modal');
        const cadpaTxt = (await sCadpa.page.textContent('#ui .veil')) || '';
        assert.ok(/12|适龄/.test(cadpaTxt), `Expected 12+ CADPA content in modal, got '${cadpaTxt}'`);
        await closeActiveModal(sCadpa.page);
        assert.equal(await sCadpa.page.locator('#ui .veil').count(), 0, 'Expected 12+ CADPA modal to close cleanly');
        sCadpa.assertNoErrors('T1-F15-04-cadpa');
      } finally {
        await sCadpa.close();
      }
    },
  },
  {
    id: 'T1-F15-05',
    tier: 1,
    feature: 'F15',
    timeoutMs: 16_000,
    name: 'Extracted dist/wugeng-h5.zip boots over ephemeral HTTP server across v3 Hub modals, gameplay & Loadout Inspector',
    async run({ browser }) {
      const { appDir } = await extractH5ZipToScratch('boot_v3');
      const zipServer = await startStaticServer(appDir);
      const s = await createIsolatedPage(browser, { isolated: true });
      try {
        await s.page.goto(`${zipServer.baseUrl}/privacy.html`);
        await s.page.waitForSelector('h1');

        await bootToHub(s.page, zipServer.baseUrl, { query: 'mockTap=1' });
        for (const action of ['open-market', 'open-achievements', 'open-leaderboard', 'open-coop']) {
          await fastClick(s.page, `[data-action="${action}"]`);
          await closeActiveModal(s.page);
        }

        await fastClick(s.page, '.hub-foot .btn--seal, .btn--big');
        await stepFrames(s.page, 30);
        await triggerLevelUp(s.page);
        await fastClick(s.page, '[data-action="inspect-loadout"]');
        await requireOpenSelector(s.page, '.veil--inspector');
        await fastClick(s.page, '[data-action="close-inspector"]');
        await fastClick(s.page, '.qian');

        assert.deepEqual(s.badResponses, [], `Unexpected HTTP 4xx/5xx on extracted zip: ${s.badResponses.join(', ')}`);
        s.assertNoErrors('T1-F15-05');
      } finally {
        await s.close();
        await zipServer.close();
      }
    },
  },
  {
    id: 'T1-F15-06',
    tier: 1,
    feature: 'F15',
    name: 'taptap-cli upload-h5-package (--screen-orientation 1 --dry-run) & protected filing_id 26847 (v529750) untouched',
    async run() {
      const dryRes = await execFileAsync(
        'taptap-cli',
        [
          'upload-h5-package',
          'dist/wugeng-h5.zip',
          '--dev-id', TAPTAP.devId,
          '--app-id', TAPTAP.appId,
          '--screen-orientation', TAPTAP.orientation,
          '--dry-run',
          '--json',
        ],
        { cwd: ROOT, timeout: 15_000 },
      );
      assert.ok(dryRes.stdout.includes(TAPTAP.appId), `Expected dry-run JSON to reference ${TAPTAP.appId}`);

      const filingRes = await execFileAsync(
        'taptap-cli',
        [
          'qualification',
          'get-mini-app-filing-progress',
          '--dev-id', TAPTAP.devId,
          '--app-id', TAPTAP.appId,
          '--json',
        ],
        { cwd: ROOT, timeout: 15_000 },
      );
      const fTxt = filingRes.stdout.trim();
      assert.ok(
        fTxt.includes(String(TAPTAP.protectedFilingId)) && fTxt.includes(String(TAPTAP.protectedFilingVersionId)),
        `Protected filing ${TAPTAP.protectedFilingId} (v${TAPTAP.protectedFilingVersionId}) must remain intact`,
      );

      const verRes = await execFileAsync(
        'taptap-cli',
        [
          'app',
          'list-versions',
          '--dev-id', TAPTAP.devId,
          '--app-id', TAPTAP.appId,
          '--data', '{"page":1,"page_size":20}',
          '--json',
        ],
        { cwd: ROOT, timeout: 15_000 },
      );
      assert.equal(/"status"\s*:\s*"(?:in_review|reviewing|submitted)"/i.test(verRes.stdout), false);
    },
  },
];
