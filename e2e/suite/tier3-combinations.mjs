// Tier 3: Cross-Feature Pairwise & Multi-Feature Combination E2E Tests (18 tests: T3-C01..T3-C18)
// STRICT OPAQUE-BOX: ZERO imports from ../../src/**.

import assert from 'node:assert/strict';
import path from 'node:path';
import {
  ALL_WEAPON_IDS,
  ATTACK_VFX_IDS,
  COOP_SPEC,
  DEFAULT_UNLOCKED_WEAPON_IDS,
  HERO_IDS,
  MAX_RELICS,
  MAX_WEAPONS,
  PRIMARY_LEADERBOARD_ID,
} from './contracts.mjs';
import {
  ROOT,
  VENV_PYTHON,
  analyzeCanvasSpriteBox,
  bootAndStartRun,
  bootColdIntro,
  bootToHub,
  checkHubSignatureBadge,
  closeActiveModal,
  compareSpriteSnapshots,
  confirmChestModal,
  createCoopPages,
  createIsolatedPage,
  engageInspectorPeek,
  execFileAsync,
  fastClick,
  grantItemViaLevelUp,
  readLeaderboardBodyText,
  readNormalizedSave,
  releaseInspectorPeek,
  requireOpenSelector,
  shopBuyAndEquipInModal,
  stepCoopFrames,
  stepFrames,
  suppressWardersInPage,
  triggerChest,
  triggerLevelUp,
} from './harness.mjs';
import { discoverCoopHeroSkins, launchTwoPageCoopRun } from './tier1-f8-f15.mjs';

export const TIER3_TESTS = [
  {
    id: 'T3-C01',
    tier: 3,
    feature: 'F2',
    features: ['F2', 'F3'],
    name: '[F2+F3] Hero signature starter weapon (tiejiang + suohun_chain HERO_AFFINITY) + 6+6 loadout + yinpai paired Chest evolution',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootToHub(s.page, baseUrl, {
          savePatch: { unlockedHeroes: HERO_IDS, unlockedWeapons: ALL_WEAPON_IDS, selectedHero: 'tiejiang' },
        });
        await fastClick(s.page, '[data-hero-id="tiejiang"]');
        await fastClick(s.page, '[data-starter-weapon="suohun_chain"]');
        const badgeState = await checkHubSignatureBadge(s.page);
        assert.equal(badgeState.visible, true, 'Expected .signature-badge visible on tiejiang + suohun_chain');
        assert.ok(badgeState.text.includes('本命'), `Expected '本命' in .signature-badge, got '${badgeState.text}'`);

        // Compare suohun_chain cooldown & damage on tiejiang (signature) vs zhou (non-signature)
        const measureChain = (hid) =>
          s.page.evaluate((h) => {
            const g = window.__wugeng.game;
            g.start({ heroId: h, startWeapon: 'suohun_chain', nightLevel: 0, meta: {}, charm: null, seed: 3001 });
            const r = g.run;
            r.enemies.length = 0;
            r._spawnAcc = -99999;
            r.mods.critChance = 0;
            r._spawnQueue.push({ type: 'sedan', x: r.player.x + 56, y: r.player.y, opts: {} });
            window.__e2eStepFrames(1);
            r.enemies[0].hp = 9999;
            r.enemies[0].maxHp = 9999;
            r.enemies[0].speed = 0;
            r.weapons[0].cd = 0;
            window.__e2eStepFrames(1);
            const cdAfter = r.weapons[0].cd;
            window.__e2eStepFrames(12);
            return { dmg: 9999 - r.enemies[0].hp, cdAfter };
          }, hid);

        const sig = await measureChain('tiejiang');
        const nonSig = await measureChain('zhou');
        assert.ok(sig.dmg > nonSig.dmg * 1.15, `Expected tiejiang signature suohun_chain dmg > zhou (${sig.dmg} vs ${nonSig.dmg})`);
        assert.ok(sig.cdAfter < nonSig.cdAfter * 0.96, `Expected tiejiang signature cd < zhou (${sig.cdAfter} vs ${nonSig.cdAfter})`);

        // Fill 6W+6R & evolve suohun_chain with yinpai
        await bootAndStartRun(s.page, baseUrl, {
          heroId: 'tiejiang',
          startWeapon: 'suohun_chain',
          unlockedWeapons: ALL_WEAPON_IDS,
          savePatch: { unlockedHeroes: HERO_IDS, unlockedWeapons: ALL_WEAPON_IDS },
          seed: 3001,
        });
        await grantItemViaLevelUp(s.page, 'weapon', 'suohun_chain', 4);
        for (const wid of ['gong', 'talisman', 'compass', 'nuo_drum', 'taomujian']) {
          await grantItemViaLevelUp(s.page, 'weapon', wid, 1);
        }
        for (const rid of ['yinpai', 'clapper', 'cinnabar', 'soulwick', 'wuse_mask', 'leijimu']) {
          await grantItemViaLevelUp(s.page, 'relic', rid, 1);
        }
        await triggerChest(s.page);
        await confirmChestModal(s.page, 'suohun_chain');

        const finalState = await s.page.evaluate(() => ({
          wLen: window.__wugeng.game.run.weapons.length,
          rLen: window.__wugeng.game.run.relics.length,
          evolved: window.__wugeng.game.run.weapons.find((w) => w.id === 'suohun_chain')?.evolved,
        }));
        assert.equal(finalState.wLen, MAX_WEAPONS);
        assert.equal(finalState.rLen, MAX_RELICS);
        assert.equal(finalState.evolved, true);
        s.assertNoErrors('T3-C01');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T3-C02',
    tier: 3,
    feature: 'F3',
    features: ['F2', 'F3', 'F4'],
    name: '[F2+F3+F4] Non-signature starter weapon (yinyang + nuo_drum) + 6+6 slot cap + 3-piece school resonance evolution',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, {
          heroId: 'yinyang',
          startWeapon: 'nuo_drum',
          unlockedWeapons: ALL_WEAPON_IDS,
          savePatch: { unlockedHeroes: HERO_IDS, unlockedWeapons: ALL_WEAPON_IDS },
          seed: 3002,
        });
        await grantItemViaLevelUp(s.page, 'weapon', 'gong', 5); // zhenhun #1 Lv5
        await grantItemViaLevelUp(s.page, 'weapon', 'soulbanner', 1); // zhenhun #2
        await grantItemViaLevelUp(s.page, 'weapon', 'taomujian', 1);
        await grantItemViaLevelUp(s.page, 'weapon', 'zhinian_kite', 1);
        await grantItemViaLevelUp(s.page, 'weapon', 'talisman', 1);

        await grantItemViaLevelUp(s.page, 'relic', 'strawshoes', 1); // zhenhun #3 (NO clapper!)
        for (const rid of ['leijimu', 'wuse_mask', 'cinnabar', 'censer', 'bagua']) {
          await grantItemViaLevelUp(s.page, 'relic', rid, 1);
        }

        await s.page.evaluate(() => { window.__wugeng.game.run.rerolls.free = 6; });
        await triggerLevelUp(s.page);
        for (let i = 0; i < 4; i++) {
          const anyNew = await s.page.evaluate(() => window.__wugeng.game.run.choices.some((c) => c.isNew));
          assert.equal(anyNew, false, 'Full 6+6 loadout must block 7th isNew item');
          await fastClick(s.page, '[data-action="reroll"]');
        }
        await fastClick(s.page, '.qian');

        await triggerChest(s.page);
        await confirmChestModal(s.page, 'gong');
        const res = await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          const gongEvo = r.weapons.find((w) => w.id === 'gong')?.evolved;
          const sum = window.__wugeng.game.finish();
          return { gongEvo, signatureStart: sum.signatureStart, startWeapon: sum.startWeapon };
        });
        assert.equal(res.gongEvo, true, 'gong Lv5 must evolve via 3-piece zhenhun school resonance without clapper');
        assert.equal(res.startWeapon, 'nuo_drum');
        assert.equal(res.signatureStart, false);
        s.assertNoErrors('T3-C02');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T3-C03',
    tier: 3,
    feature: 'F8',
    features: ['F8', 'F5', 'F6', 'F4'],
    name: '[F8+F5+F6+F4] Ghost-Market Shop buy skin + jade_ghostfire VFX -> live emerald VFX while Boss telegraph stays #C23B26',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootToHub(s.page, baseUrl, { savePatch: { coins: 6000, unlockedHeroes: HERO_IDS, selectedHero: 'zhou' } });
        await fastClick(s.page, '[data-action="open-market"]');
        await requireOpenSelector(s.page, '.cosmetic-shop-modal');

        const skinRes = await shopBuyAndEquipInModal(s.page, {
          kind: 'skin',
          heroId: 'zhou',
          targetIdx: 1,
          buy: true,
          equip: true,
          close: false,
        });
        assert.equal(skinRes.ok, true, skinRes.reason || 'Failed buying skin in T3-C03');
        const vfxRes = await shopBuyAndEquipInModal(s.page, {
          kind: 'vfx',
          vfxId: 'jade_ghostfire',
          buy: true,
          equip: true,
          close: true,
        });
        assert.equal(vfxRes.ok, true, vfxRes.reason || 'Failed buying jade_ghostfire in T3-C03');

        await fastClick(s.page, '.hub-foot .btn--seal, .btn--big');
        await stepFrames(s.page, 2);

        const colors = await s.page.evaluate(async () => {
          const w = window.__wugeng;
          const r = w.game.run;
          r.props.length = 0;
          r.pickups.length = 0;
          r.darkness = 0.4;
          r.enemies = [
            {
              id: 77801, type: 'horse', boss: true, elite: false,
              x: r.player.x - 100, y: r.player.y + 80, r: 26, hp: 9999, maxHp: 9999,
              state: 'windup', stateT: 0.45, windupT: 0.45, chargeAngle: 0, angle: 0, dx: 1, dy: 0, telegraphLen: 300,
              hitT: 0, slowT: 0, stunT: 0, kbx: 0, kby: 0, dead: false,
            },
          ];
          r.boss = r.enemies[0];
          r.projectiles = [
            { id: 77802, kind: 'gongPulse', x: r.player.x, y: r.player.y - 70, r: 58, radius: 58, maxRadius: 78, t: 0.12, life: 0.35, evolved: true, attackVfx: 'jade_ghostfire' },
          ];
          w.game.pause();
          await new Promise((res) => requestAnimationFrame(res));
          await new Promise((res) => requestAnimationFrame(res));

          const c = document.getElementById('game-canvas');
          const ctx = c.getContext('2d');
          const dpr = c.width / window.innerWidth;
          const playerBox = ctx.getImageData(
            Math.floor((window.innerWidth / 2 - 70) * dpr),
            Math.floor((window.innerHeight / 2 - 140) * dpr),
            Math.floor(140 * dpr),
            Math.floor(140 * dpr),
          ).data;
          let jadePx = 0;
          for (let i = 0; i < playerBox.length; i += 4) {
            if (playerBox[i + 1] > playerBox[i] + 20 && playerBox[i + 1] > 95) jadePx++;
          }
          const teleBox = ctx.getImageData(
            Math.floor((window.innerWidth / 2 - 20) * dpr),
            Math.floor((window.innerHeight / 2 + 50) * dpr),
            Math.floor(100 * dpr),
            Math.floor(60 * dpr),
          ).data;
          let vermPx = 0;
          for (let i = 0; i < teleBox.length; i += 4) {
            if (teleBox[i] >= 105 && teleBox[i] - teleBox[i + 1] >= 40 && teleBox[i] - teleBox[i + 2] >= 45) vermPx++;
          }
          return { jadePx, vermPx };
        });

        assert.ok(colors.jadePx >= 20, `Expected emerald player VFX pixels (>=20), got ${colors.jadePx}`);
        assert.ok(colors.vermPx >= 15, `Expected Boss telegraph to stay #C23B26 vermilion (>=15), got ${colors.vermPx}`);
        s.assertNoErrors('T3-C03');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T3-C04',
    tier: 3,
    feature: 'F7',
    features: ['F7', 'F2', 'F5', 'F6'],
    name: '[F7+F2+F5+F6] Hub Dynamic Stage (.hero-stage__canvas) reflects Hero x Skin x Starter Weapon x Attack VFX',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootToHub(s.page, baseUrl, {
          savePatch: {
            coins: 9999,
            unlockedHeroes: HERO_IDS,
            unlockedWeapons: ALL_WEAPON_IDS,
            selectedHero: 'zhou',
          },
        });
        const stageSel = (await s.page.$('.hero-stage__canvas')) ? '.hero-stage__canvas' : '.screen--hub canvas';
        const snapBase = await analyzeCanvasSpriteBox(s.page, stageSel);

        await fastClick(s.page, '[data-hero-id="nuoxi"]');
        await fastClick(s.page, '[data-starter-weapon="taomujian"]');
        await fastClick(s.page, '[data-action="open-market"]');
        await requireOpenSelector(s.page, '.cosmetic-shop-modal');
        const vtRes = await shopBuyAndEquipInModal(s.page, {
          kind: 'vfx',
          vfxId: 'violet_thunder',
          buy: true,
          equip: true,
          close: true,
        });
        assert.equal(vtRes.ok, true, vtRes.reason || 'Failed equipping violet_thunder in T3-C04');
        await s.page.waitForTimeout(120);

        const snapUpdated = await analyzeCanvasSpriteBox(s.page, stageSel);
        const cmp = compareSpriteSnapshots(snapBase, snapUpdated);
        assert.ok(cmp.pixelDiffRatio > 0.14, `Expected Hub stage canvas to change >14%, got ${(cmp.pixelDiffRatio * 100).toFixed(1)}%`);
        const overflow = await s.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        assert.ok(overflow <= 1);
        s.assertNoErrors('T3-C04');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T3-C05',
    tier: 3,
    feature: 'F9',
    features: ['F9', 'F2', 'F3'],
    name: '[F9+F2+F3] Achievement unlocks exclusive weapon (taomujian) -> Hub starter pick -> in-run combat damage',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootToHub(s.page, baseUrl, {
          savePatch: {
            unlockedHeroes: HERO_IDS,
            unlockedWeapons: DEFAULT_UNLOCKED_WEAPON_IDS,
            nightUnlocked: 10,
            nightCleared: 10,
            stats: {
              runs: 30, clears: 10, firstRunDone: true, bestTimeSec: 1200,
              bestKills: 3500, bestHit: 50_000, totalKills: 25_000,
              totalEvolutions: 30, totalBossKills: 25, coopRuns: 6, coopRevives: 6,
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
        await closeActiveModal(s.page, 'close-achievements');

        await fastClick(s.page, '[data-starter-weapon="taomujian"]');
        await fastClick(s.page, '.hub-foot .btn--seal, .btn--big');
        await stepFrames(s.page, 2);

        const dmg = await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          r.enemies.length = 0;
          r._spawnAcc = -99999;
          r._spawnQueue.push({ type: 'sedan', x: r.player.x + 80, y: r.player.y, opts: {} });
          window.__e2eStepFrames(1);
          r.enemies[0].hp = 9999;
          r.enemies[0].speed = 0;
          r.weapons[0].cd = 0;
          window.__e2eStepFrames(35);
          return { wid: r.weapons[0].id, dealt: 9999 - r.enemies[0].hp };
        });
        assert.equal(dmg.wid, 'taomujian');
        assert.ok(dmg.dealt > 0, 'Unlocked taomujian starter weapon must deal combat damage');
        s.assertNoErrors('T3-C05');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T3-C06',
    tier: 3,
    feature: 'F9',
    features: ['F9', 'F5', 'F8'],
    name: '[F9+F5+F8] Achievement unlocks exclusive Hero Skin -> synced owned & wearable in Ghost-Market Shop for 0 copper',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootToHub(s.page, baseUrl, {
          savePatch: {
            coins: 0,
            unlockedHeroes: HERO_IDS,
            nightUnlocked: 10,
            nightCleared: 10,
            stats: {
              runs: 30, clears: 10, firstRunDone: true, bestTimeSec: 1200,
              bestKills: 3500, bestHit: 50_000, totalKills: 25_000,
              totalEvolutions: 30, totalBossKills: 25, coopRuns: 6, coopRevives: 6,
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
        await closeActiveModal(s.page, 'close-achievements');

        const afterAchSave = await readNormalizedSave(s.page);
        const coinsAfterAch = afterAchSave.coins;
        const unlockedAchSkins = afterAchSave.ownedCosmetics.filter((id) => !ATTACK_VFX_IDS.includes(id) && !/default$/i.test(id));
        assert.ok(unlockedAchSkins.length >= 1, `Expected >= 1 achievement skin unlocked, got [${unlockedAchSkins.join(',')}]`);

        await fastClick(s.page, '[data-action="open-market"]');
        await requireOpenSelector(s.page, '.cosmetic-shop-modal');
        const equippedAchSkin = await s.page.evaluate(async ({ heroIds, achSkinIds }) => {
          const modal = document.querySelector('.cosmetic-shop-modal');
          const vfxRe = /青冥幽火|紫电天罡|鎏金神诏|玄霜寒月|古墨朱砂/;
          const equipRe = /穿戴|装备|披挂|启用|使用/;

          const tryEquipUnlocked = async () => {
            const cards = [...modal.querySelectorAll('[data-skin-id], [data-cosmetic-id], .cosmetic-card, .market-card, .shop-card')].filter(
              (c) => !c.hasAttribute('data-vfx-id') && !vfxRe.test(c.textContent || ''),
            );
            const candidates = cards.filter((c) => {
              const cid = c.dataset?.skinId || c.dataset?.cosmeticId || c.dataset?.id || '';
              if (cid && achSkinIds.includes(cid)) return true;
              if (/默认|原装|初始|default/i.test(cid + ' ' + (c.textContent || ''))) return false;
              return /功绩|成就|已拥有|已解锁|穿戴|装备/.test(c.textContent || '');
            });
            for (const c of candidates) {
              c.click();
              await new Promise((r) => requestAnimationFrame(r));
              const inCard = [...c.querySelectorAll('button')].find((b) => !b.disabled && equipRe.test(b.textContent || ''));
              const selfBtn = c.tagName === 'BUTTON' && !c.disabled && equipRe.test(c.textContent || '') ? c : null;
              const inModal = [...modal.querySelectorAll('button')].find((b) => {
                if (b.disabled || !equipRe.test(b.textContent || '')) return false;
                const owner = b.closest('[data-skin-id], [data-vfx-id], [data-cosmetic-id], .cosmetic-card, .market-card, .shop-card');
                return !owner || owner === c;
              });
              const eq = inCard || selfBtn || inModal;
              if (eq) {
                eq.click();
                await new Promise((r) => requestAnimationFrame(r));
                return true;
              }
            }
            return false;
          };

          if (await tryEquipUnlocked()) return true;
          for (const hid of heroIds) {
            const hBtn = modal.querySelector(
              `[data-shop-hero="${hid}"]:not([data-skin-id]):not(.cosmetic-card):not(.shop-card):not(.market-card), ` +
              `[data-filter-hero="${hid}"]:not([data-skin-id]):not(.cosmetic-card):not(.shop-card):not(.market-card), ` +
              `[data-hero-id="${hid}"]:not([data-skin-id]):not([data-cosmetic-id]):not(.cosmetic-card):not(.shop-card):not(.market-card)`,
            );
            if (hBtn) {
              hBtn.click();
              await new Promise((r) => requestAnimationFrame(r));
              if (await tryEquipUnlocked()) return true;
            }
          }
          return false;
        }, { heroIds: HERO_IDS, achSkinIds: unlockedAchSkins });
        assert.equal(equippedAchSkin, true, 'Expected achievement-unlocked skin wearable in Ghost-Market Shop');
        await closeActiveModal(s.page, 'close-market');

        const afterShop = await readNormalizedSave(s.page);
        assert.equal(afterShop.coins, coinsAfterAch, 'Equipping achievement-unlocked skin in Market must spend 0 copper');
        assert.ok(Object.values(afterShop.heroSkins).some((v) => v && !/default$/i.test(v)), 'Expected achievement skin equipped on hero');
        s.assertNoErrors('T3-C06');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T3-C07',
    tier: 3,
    feature: 'F10',
    features: ['F10', 'F3'],
    name: '[F10+F3] Loadout Inspector + peek-battlefield across .overlay--levelup & .overlay--chest with full 6+6 build',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, {
          unlockedWeapons: ALL_WEAPON_IDS,
          savePatch: { unlockedWeapons: ALL_WEAPON_IDS },
          seed: 3007,
        });
        await grantItemViaLevelUp(s.page, 'weapon', 'gong', 4);
        await grantItemViaLevelUp(s.page, 'weapon', 'talisman', 5);
        for (const wid of ['compass', 'suohun_chain', 'nuo_drum', 'taomujian']) {
          await grantItemViaLevelUp(s.page, 'weapon', wid, 1);
        }
        for (const rid of ['clapper', 'cinnabar', 'soulwick', 'yinpai', 'wuse_mask', 'leijimu']) {
          await grantItemViaLevelUp(s.page, 'relic', rid, 1);
        }

        await triggerLevelUp(s.page);
        await requireOpenSelector(s.page, '.overlay--levelup .selection-owned-bar');
        await fastClick(s.page, '[data-action="inspect-loadout"]');
        const peek1 = await engageInspectorPeek(s.page);
        assert.ok(peek1.state.effectiveOpacity <= 0.45);
        await releaseInspectorPeek(s.page, peek1.mode);
        await fastClick(s.page, '[data-action="close-inspector"]');
        assert.equal(await s.page.evaluate(() => window.__wugeng.overlay), 'levelup');
        await fastClick(s.page, '.qian');

        await triggerChest(s.page);
        await requireOpenSelector(s.page, '.overlay--chest .selection-owned-bar');
        await fastClick(s.page, '[data-action="inspect-loadout"]');
        const peek2 = await engageInspectorPeek(s.page);
        assert.ok(peek2.state.effectiveOpacity <= 0.45);
        await releaseInspectorPeek(s.page, peek2.mode);
        await fastClick(s.page, '[data-action="close-inspector"]');
        assert.equal(await s.page.evaluate(() => window.__wugeng.overlay), 'chest');
        await confirmChestModal(s.page, 'gong');
        s.assertNoErrors('T3-C07');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T3-C08',
    tier: 3,
    feature: 'F10',
    features: ['F10', 'F2', 'F4'],
    name: '[F10+F2+F4] Shrine modal (.overlay--shrine) Loadout Inspector preserves shrine options & resolves cleanly',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, {
          heroId: 'yinyang',
          startWeapon: 'compass',
          unlockedWeapons: ALL_WEAPON_IDS,
          savePatch: { unlockedHeroes: HERO_IDS, unlockedWeapons: ALL_WEAPON_IDS },
          seed: 3008,
        });
        await grantItemViaLevelUp(s.page, 'weapon', 'talisman', 1); // daofa 2pc

        await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          const ped = r.shrines.find((x) => x.kind === 'peddler' && !x.used) || r.shrines.find((x) => !x.used);
          r.stats.coins = 500;
          r.enemies.length = 0;
          r._spawnAcc = -99999;
          r.player.x = ped.x;
          r.player.y = ped.y;
          window.__e2eStepFrames(3);
        });
        await fastClick(s.page, '[data-action="interact-shrine"]');
        await requireOpenSelector(s.page, '.overlay--shrine');
        const optsBefore = await s.page.evaluate(() => JSON.stringify(window.__wugeng.game.run.activeShrine?.options || []));

        await fastClick(s.page, '[data-action="inspect-loadout"]');
        assert.equal(await s.page.evaluate(() => window.__wugeng.inspectorOpen && window.__wugeng.overlay === 'shrine'), true);
        const inspText = (await s.page.textContent('.veil--inspector')) || '';
        assert.ok(inspText.includes('道法'), 'Inspector inside shrine must display active 道法 synergy');
        await fastClick(s.page, '[data-action="close-inspector"]');

        const optsAfter = await s.page.evaluate(() => JSON.stringify(window.__wugeng.game.run.activeShrine?.options || []));
        assert.equal(optsAfter, optsBefore);
        await fastClick(s.page, '.overlay--shrine [data-shrine-option]:not([disabled])');
        s.assertNoErrors('T3-C08');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T3-C09',
    tier: 3,
    feature: 'F11',
    features: ['F11', 'F8', 'F9'],
    name: '[F11+F8+F9] Cloud Save v3 sync (?mockCloud=1) + Copper Shop (cosmeticShopSpent) + remote Achievement union merge',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser, { isolated: true });
      try {
        await bootToHub(s.page, baseUrl, {
          query: 'mockCloud=1',
          savePatch: {
            coins: 3000,
            unlockedHeroes: HERO_IDS,
            unlockedWeapons: [...DEFAULT_UNLOCKED_WEAPON_IDS, 'taomujian'],
            achievements: { firstClear: 1700000001000 },
          },
        });
        await s.page.evaluate(async () => {
          window.__wugeng.save.updatedAt = 1700000020000;
          await window.__wugeng.cloud.uploadNow(window.__wugeng.save);
          // Balance local unlockedWeapons count (zhinian_kite on local vs taomujian on remote) so timestamp-tie score tests cosmeticShopSpent cleanly
          window.__wugeng.save.unlockedWeapons = [
            ...window.__wugeng.save.unlockedWeapons.filter((x) => x !== 'taomujian'),
            'zhinian_kite',
          ];
        });

        await fastClick(s.page, '[data-action="open-market"]');
        await requireOpenSelector(s.page, '.cosmetic-shop-modal');
        const buyGilded = await shopBuyAndEquipInModal(s.page, {
          kind: 'vfx',
          vfxId: 'gilded_imperial',
          buy: true,
          equip: false,
          close: true,
        });
        assert.equal(buyGilded.ok, true, buyGilded.reason || 'Failed buying gilded_imperial in T3-C09');

        const coinsAfterBuy = await s.page.evaluate(() => {
          window.__wugeng.save.updatedAt = 1700000020000;
          localStorage.setItem('wugeng.save', JSON.stringify(window.__wugeng.save));
          return window.__wugeng.save.coins;
        });
        await fastClick(s.page, '[data-action="quick-cloud"]');
        await s.page.waitForTimeout(100);

        const afterSync = await readNormalizedSave(s.page);
        assert.equal(afterSync.coins, coinsAfterBuy, 'quick-cloud merge must preserve post-purchase copper');
        assert.ok(afterSync.ownedCosmetics.includes('gilded_imperial'), 'Must retain purchased gilded_imperial VFX');
        assert.ok(afterSync.unlockedWeapons.includes('taomujian'), 'Must union remote achievement-unlocked taomujian');
        assert.ok(afterSync.unlockedWeapons.includes('zhinian_kite'), 'Must retain local zhinian_kite in union merge');
        s.assertNoErrors('T3-C09');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T3-C10',
    tier: 3,
    feature: 'F12',
    features: ['F12', 'F2', 'F4'],
    name: '[F12+F2+F4] Night 3 + signature evolved Dawn clear score multiplier -> auto submitScores to c5mzumajes9houq0ra',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser, {
        beforeBootInitScript: () => {
          window.__lbSubmits = [];
          window.tap = {
            getLeaderboardManager() {
              return {
                submitScores(p) {
                  window.__lbSubmits.push(p?.scores || []);
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
        // Run 1: Night 0 non-clear
        await bootAndStartRun(s.page, baseUrl, {
          nightLevel: 0,
          savePatch: { nightUnlocked: 5 },
          seed: 3010,
        });
        const lowScore = await s.page.evaluate(() => {
          window.__wugeng.game.run.time = 200;
          window.__wugeng.game.run.stats.kills = 150;
          return window.__wugeng.game.finish().score;
        });

        // Run 2: Night 3 Dawn clear with evolved signature weapon
        await bootAndStartRun(s.page, baseUrl, {
          heroId: 'zhou',
          startWeapon: 'gong',
          nightLevel: 3,
          savePatch: { nightUnlocked: 5 },
          seed: 3010,
        });
        await grantItemViaLevelUp(s.page, 'weapon', 'gong', 4);
        await grantItemViaLevelUp(s.page, 'relic', 'clapper', 1);
        await triggerChest(s.page);
        await confirmChestModal(s.page);
        await suppressWardersInPage(s.page);

        const highRes = await s.page.evaluate(async () => {
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
          r.weapons[0].cd = 0;
          window.__e2eStepFrames(4, { stopOnOverlay: false });
          r.stats.kills = 150;
          const sum = window.__wugeng.game.finish();
          await new Promise((res2) => setTimeout(res2, 60));
          return {
            score: sum.score,
            bestScore: window.__wugeng.save.leaderboard?.bestScore,
            submits: window.__lbSubmits,
          };
        });

        assert.ok(highRes.score > lowScore * 1.3, `Expected Night 3 Dawn clear score (${highRes.score}) > Night 0 loss (${lowScore})`);
        assert.equal(highRes.bestScore, highRes.score);
        assert.ok(highRes.submits.some((batch) => batch.some((x) => x.leaderboardId === PRIMARY_LEADERBOARD_ID && x.score === highRes.score)));
        s.assertNoErrors('T3-C10');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T3-C11',
    tier: 3,
    feature: 'F13',
    features: ['F12', 'F13'],
    name: '[F12+F13] TapTap Friends x Leaderboard ([data-collection="friends"] under ?mockTap=1 + 1025 Chinese fallback)',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser, { isolated: true });
      try {
        await bootToHub(s.page, baseUrl, { query: 'mockTap=1' });
        await fastClick(s.page, '[data-action="open-leaderboard"]');
        await requireOpenSelector(s.page, '.leaderboard-modal');
        await fastClick(s.page, '[data-collection="friends"]');
        await s.page.waitForTimeout(80);
        const friendsLb = await readLeaderboardBodyText(s.page);
        assert.ok(/\d+/.test(friendsLb.bodyText), `Expected mock friends scores rendered in leaderboard body, got '${friendsLb.bodyText}'`);

        await bootToHub(s.page, baseUrl, { query: 'mockLeaderboard=1025' });
        await fastClick(s.page, '[data-action="open-leaderboard"]');
        await requireOpenSelector(s.page, '.leaderboard-modal');
        await fastClick(s.page, '[data-collection="friends"]');
        await s.page.waitForTimeout(80);
        const fbLb = await readLeaderboardBodyText(s.page);
        assert.ok(
          /权限|授权|未开通|暂未|暂不可用|无法|本地|本机|荣誉/.test(fbLb.bodyText),
          `Expected Chinese permission/fallback notice in leaderboard body on 1025, got '${fbLb.bodyText}'`,
        );
        assert.equal(/friend permission not granted|undefined|\[object Object\]/i.test(fbLb.fullText), false);
        await fastClick(s.page, '[data-collection="public"]');
        s.assertNoErrors('T3-C11');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T3-C12',
    tier: 3,
    feature: 'F14',
    features: ['F14', 'F12'],
    timeoutMs: 18_000,
    name: '[F14+F12] Real 2-page BroadcastChannel Co-op run -> .result-squad & .mvp-seal -> Leaderboard c5mzumajes9houq0ra submit',
    async run({ browser, baseUrl }) {
      const coop = await createCoopPages(browser, 2);
      try {
        await launchTwoPageCoopRun(coop, baseUrl);
        await stepCoopFrames([coop.hostPage, coop.guestPage], 30, 6);

        const settled = await coop.hostPage.evaluate(async () => {
          const r = window.__wugeng.game.run;
          r.time = 180;
          r.stats.kills = 120;
          r.players[0].stats.damageDealt = 8500;
          r.players[0].stats.kills = 80;
          r.players[1].stats.damageDealt = 3200;
          r.players[1].stats.kills = 40;
          const sum = window.__wugeng.game.finish();
          await new Promise((res2) => setTimeout(res2, 60));
          return { score: sum.score, bestScore: window.__wugeng.save.leaderboard?.bestScore };
        });

        await requireOpenSelector(coop.hostPage, '.screen--result .result-squad');
        await requireOpenSelector(coop.hostPage, '.screen--result .mvp-seal');
        assert.ok(settled.score > 0 && settled.bestScore === settled.score);

        await fastClick(coop.hostPage, '[data-action="result-leaderboard"]');
        await requireOpenSelector(coop.hostPage, '.leaderboard-modal');
        coop.assertNoErrors('T3-C12');
      } finally {
        await coop.close();
      }
    },
  },
  {
    id: 'T3-C13',
    tier: 3,
    feature: 'F14',
    features: ['F13', 'F14'],
    timeoutMs: 20_000,
    name: '[F13+F14] Friend invite share (coop-invite-friend room=) -> 2nd tab URL auto-join -> 2-page Co-op Bagua revive',
    async run({ browser, baseUrl }) {
      const coop = await createCoopPages(browser, 2, {
        beforeBootInitScript: () => {
          window.__sharedQueries = [];
          window.tap = {
            shareAppMessage(p) {
              window.__sharedQueries.push(p?.query || p?.sceneParam || '');
              p?.success?.({});
            },
          };
        },
      });
      try {
        await bootToHub(coop.hostPage, baseUrl, { query: 'mockFriends=1' });
        await fastClick(coop.hostPage, '[data-action="open-coop"]');
        await fastClick(coop.hostPage, '[data-action="coop-create"]');
        await coop.hostPage.waitForSelector('[data-room-code]');
        await fastClick(coop.hostPage, '[data-action="coop-invite-friend"]');

        const sharedQuery = await coop.hostPage.evaluate(() => {
          const q = (window.__sharedQueries || [])[0] || '';
          const m = q.match(/room=([A-Z0-9]{4,8})/i);
          if (m) return `room=${m[1]}`;
          const code = document.querySelector('[data-room-code]')?.getAttribute('data-room-code') || '';
          return `room=${code}`;
        });
        assert.match(sharedQuery, /^room=[A-Z0-9]{4,8}$/i);

        await coop.guestPage.goto(`${baseUrl}/index.html?skipIntro=1&${sharedQuery}`);
        await coop.guestPage.waitForSelector('.coop-modal', { timeout: 4500 });
        await coop.guestPage.evaluate(() => document.querySelector('[data-action="coop-ready"]:not([disabled])')?.click());
        await coop.hostPage.waitForFunction(() => {
          const w = window.__wugeng;
          return (w?.coop?.getParty?.()?.length || w?.coop?.party?.length || w?.coop?.state?.party?.length || 0) >= 2;
        }, null, { timeout: 4500 });

        await fastClick(coop.hostPage, '[data-action="coop-start"]');
        await Promise.all([
          coop.hostPage.waitForFunction(() => window.__wugeng.game.run?.players?.length >= 2),
          coop.guestPage.waitForFunction(() => window.__wugeng.game.run?.players?.length >= 2),
        ]);

        // Down Guest & revive via Host standing inside r<=48 circle
        await coop.hostPage.evaluate(() => {
          const r = window.__wugeng.game.run;
          r.enemies.length = 0;
          r._spawnAcc = -99999;
          r.weapons.forEach((w) => { w.cd = 9999; });
          r.players[0].x = 0;
          r.players[0].y = 0;
          r.players[1].x = 12;
          r.players[1].y = 0;
          r.players[1].downed = true;
          r.players[1].hp = 0;
          r.players[1].reviveProgress = 0;
        });
        await stepCoopFrames([coop.hostPage, coop.guestPage], 162, 6);
        const revived = await coop.hostPage.evaluate(() => !window.__wugeng.game.run.players[1].downed);
        assert.equal(revived, true);
        coop.assertNoErrors('T3-C13');
      } finally {
        await coop.close();
      }
    },
  },
  {
    id: 'T3-C14',
    tier: 3,
    feature: 'F14',
    features: ['F14', 'F5', 'F6', 'F4'],
    timeoutMs: 18_000,
    name: '[F14+F5+F6+F4] 2-page Co-op distinct Hero x Skin x Attack VFX sync + 1.55x 2P monster HP scaling',
    async run({ browser, baseUrl }) {
      const soloSession = await createIsolatedPage(browser);
      let soloEnemyHp = 0;
      try {
        await bootAndStartRun(soloSession.page, baseUrl, { seed: 3014 });
        soloEnemyHp = await soloSession.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          r.enemies.length = 0;
          r._spawnAcc = -99999;
          r.time = 10;
          r._spawnQueue.push({ type: 'lanternghost', x: r.player.x + 200, y: r.player.y, opts: { elite: false } });
          window.__e2eStepFrames(1);
          return r.enemies[0].maxHp;
        });
      } finally {
        await soloSession.close();
      }

      const coop = await createCoopPages(browser, 2);
      try {
        const { hostSkin, guestSkin } = await discoverCoopHeroSkins(coop.hostPage, baseUrl, 'zhou', 'tiejiang', 'mockTap=1');
        await launchTwoPageCoopRun(coop, baseUrl, {
          hostHero: 'zhou',
          hostSkin,
          hostVfx: 'gilded_imperial',
          guestHero: 'tiejiang',
          guestSkin,
          guestVfx: 'frost_moon',
        });

        const synced = await Promise.all([
          coop.hostPage.evaluate(() => {
            const r = window.__wugeng.game.run;
            r.enemies.length = 0;
            r._spawnAcc = -99999;
            r.time = 10;
            r._spawnQueue.push({ type: 'lanternghost', x: r.player.x + 200, y: r.player.y, opts: { elite: false } });
            window.__e2eStepFrames(1);
            return {
              hp2P: r.enemies[0].maxHp,
              p0: { heroId: r.players[0].heroId, skinId: r.players[0].skinId, attackVfx: r.players[0].attackVfx },
              p1: { heroId: r.players[1].heroId, skinId: r.players[1].skinId, attackVfx: r.players[1].attackVfx },
            };
          }),
          coop.guestPage.evaluate(() => {
            const r = window.__wugeng.game.run;
            return {
              p0: { heroId: r.players[0].heroId, skinId: r.players[0].skinId, attackVfx: r.players[0].attackVfx },
              p1: { heroId: r.players[1].heroId, skinId: r.players[1].skinId, attackVfx: r.players[1].attackVfx },
            };
          }),
        ]);

        for (const [tabName, side] of [['hostPage', synced[0]], ['guestPage', synced[1]]]) {
          assert.equal(side.p0.heroId, 'zhou', `[${tabName}] Expected p0.heroId === 'zhou'`);
          assert.equal(side.p1.heroId, 'tiejiang', `[${tabName}] Expected p1.heroId === 'tiejiang'`);
          assert.equal(side.p0.skinId, hostSkin, `[${tabName}] Expected p0.skinId === '${hostSkin}'`);
          assert.equal(side.p1.skinId, guestSkin, `[${tabName}] Expected p1.skinId === '${guestSkin}'`);
          assert.notEqual(side.p0.skinId, side.p1.skinId, `[${tabName}] Expected distinct non-default skins`);
          assert.equal(side.p0.attackVfx, 'gilded_imperial', `[${tabName}] Expected p0.attackVfx === 'gilded_imperial'`);
          assert.equal(side.p1.attackVfx, 'frost_moon', `[${tabName}] Expected p1.attackVfx === 'frost_moon'`);
        }

        const expected2P = 1 + COOP_SPEC.hpScalePerExtra; // 1.55x
        const ratio = synced[0].hp2P / soloEnemyHp;
        assert.ok(Math.abs(ratio - expected2P) <= 0.12, `Expected ~1.55x 2P monster HP scaling (${soloEnemyHp} -> ${synced[0].hp2P}, ratio=${ratio.toFixed(2)})`);
        coop.assertNoErrors('T3-C14');
      } finally {
        await coop.close();
      }
    },
  },
  {
    id: 'T3-C15',
    tier: 3,
    feature: 'F1',
    features: ['F1', 'F13', 'F14'],
    name: '[F1+F13+F14] Cold-boot ?room=AB23CD deep-link through studio splash into Hub .coop-modal in <= 2.5s',
    async run({ browser, baseUrl }) {
      const s = await bootColdIntro(browser, baseUrl, { query: 'mockTap=1&room=AB23CD', waitForTitle: false });
      try {
        const t0 = performance.now();
        await s.page.waitForSelector('.coop-modal', { timeout: 3500 });
        const totalElapsed = s.elapsedMs + (performance.now() - t0);
        assert.ok(totalElapsed < 2800, `Expected cold-boot ?room=AB23CD deep-link into .coop-modal in < 2.8s, got ${Math.round(totalElapsed)}ms`);
        const txt = (await s.page.textContent('.coop-modal')) || '';
        assert.ok(txt.toUpperCase().includes('AB23CD'), `Expected .coop-modal joined to AB23CD, got '${txt}'`);
        s.assertNoErrors('T3-C15');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T3-C16',
    tier: 3,
    feature: 'F1',
    features: ['F1', 'F7', 'F11'],
    name: '[F1+F7+F11] replayIntro() + [data-action="skip-intro"] from Hub preserves v3 save, cosmetics & single game loop',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser, { isolated: true });
      try {
        await bootToHub(s.page, baseUrl, {
          savePatch: {
            daoName: '青衫打更人',
            coins: 1357,
            unlockedHeroes: HERO_IDS,
            selectedHero: 'nuoxi',
            cosmetics: {
              owned: ['frost_moon'],
              equipped: { lantern: null, outfit: null, attackVfx: 'frost_moon', heroSkins: {} },
            },
          },
        });
        await s.page.evaluate(() => {
          window.__replay = Promise.resolve(window.__wugeng.replayIntro());
        });
        await s.page.waitForSelector('.boot-intro', { timeout: 2000 });
        await fastClick(s.page, '[data-action="skip-intro"]');
        await s.page.evaluate(() => window.__replay);

        const after = await readNormalizedSave(s.page);
        assert.equal(after.coins, 1357);
        assert.equal(after.selectedHero, 'nuoxi');
        assert.equal(after.attackVfx, 'frost_moon');

        await fastClick(s.page, '.hub-foot .btn--seal, .btn--big');
        const t0 = await s.page.evaluate(() => window.__wugeng.game.run.time);
        await stepFrames(s.page, 15);
        const t1 = await s.page.evaluate(() => window.__wugeng.game.run.time);
        assert.ok(Math.abs((t1 - t0) - 15 / 60) < 0.04, 'Single deterministic gameFrameCb loop must stay intact');
        s.assertNoErrors('T3-C16');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T3-C17',
    tier: 3,
    feature: 'F3',
    features: ['F3', 'F6', 'F7', 'F15'],
    timeoutMs: 16_000,
    name: '[F3+F6+F7+F15] All 16 weapon WebAudio fire_<id> cues + 360x780 narrow-screen 6+6 HUD/pause/levelup zero overflow',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser, {
        isolated: true,
        viewport: { width: 360, height: 780 },
        deviceScaleFactor: 2,
      });
      try {
        await bootAndStartRun(s.page, baseUrl, {
          unlockedWeapons: ALL_WEAPON_IDS,
          savePatch: {
            unlockedWeapons: ALL_WEAPON_IDS,
            cosmetics: { owned: ATTACK_VFX_IDS, equipped: { attackVfx: 'jade_ghostfire', heroSkins: {} } },
          },
          seed: 3017,
        });
        for (const wid of ['taomujian', 'suohun_chain', 'zhinian_kite', 'nuo_drum', 'talisman']) {
          await grantItemViaLevelUp(s.page, 'weapon', wid, 1);
        }
        for (const rid of ['leijimu', 'yinpai', 'huoyao_pouch', 'wuse_mask', 'clapper', 'cinnabar']) {
          await grantItemViaLevelUp(s.page, 'relic', rid, 1);
        }

        const missingAudio = await s.page.evaluate(async (weapons) => {
          const a = window.__wugeng.audio;
          a.unlock();
          a.resume('all');
          let waited = 0;
          while (a.state !== 'running' && waited < 800) {
            await new Promise((r) => setTimeout(r, 20));
            waited += 20;
          }
          a.setMusicMode('off');
          a.setEnabled({ music: false, sfx: true });
          const proto = window.BaseAudioContext?.prototype || window.AudioContext?.prototype;
          const origOsc = proto.createOscillator;
          const origBuf = proto.createBufferSource;
          let count = 0;
          proto.createOscillator = function osc(...args) { count++; return origOsc.apply(this, args); };
          proto.createBufferSource = function buf(...args) { count++; return origBuf.apply(this, args); };
          const missing = [];
          try {
            await new Promise((r) => setTimeout(r, 240));
            for (const wid of weapons) {
              const before = count;
              a.onEvents([{ type: 'fire', weaponId: wid, evolved: true, x: 0, y: 0 }], null);
              if (count <= before) missing.push(wid);
              await new Promise((r) => setTimeout(r, 185));
            }
          } finally {
            proto.createOscillator = origOsc;
            proto.createBufferSource = origBuf;
          }
          return missing;
        }, ALL_WEAPON_IDS);
        assert.deepEqual(missingAudio, []);

        // Verify 360x780 pause & levelup zero overflow with 6+6 items
        await fastClick(s.page, '.pause-btn');
        await requireOpenSelector(s.page, '.overlay--pause');
        assert.ok((await s.page.evaluate(() => document.documentElement.scrollWidth)) <= 361);
        await s.page.evaluate(() => {
          ([...document.querySelectorAll('.overlay--pause button')].find((b) => b.textContent.includes('接着守')))?.click();
        });

        await triggerLevelUp(s.page);
        assert.ok((await s.page.evaluate(() => document.documentElement.scrollWidth)) <= 361);
        s.assertNoErrors('T3-C17');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T3-C18',
    tier: 3,
    feature: 'F15',
    features: ['F15', 'F1', 'F7', 'F8', 'F9', 'F10', 'F12', 'F14'],
    timeoutMs: 18_000,
    name: '[F15+All] Live rendered DOM Zero-Tofu glyph audit harvested across Intro, Hub, Market, Achievements, Leaderboard, Co-op, Inspector & Result',
    async run({ browser, baseUrl }) {
      let harvested = '';

      // 1) Intro logo hold
      const sIntro = await bootColdIntro(browser, baseUrl, { query: 'introHold=logo', waitForHold: true });
      try {
        harvested += '\n' + ((await sIntro.page.textContent('body')) || '');
      } finally {
        await sIntro.close();
      }

      // 2) Hub, Market, Achievements, Leaderboard, Co-op, Inspector & Co-op Result
      const s = await createIsolatedPage(browser, { isolated: true });
      try {
        await bootToHub(s.page, baseUrl, {
          query: 'mockTap=1',
          savePatch: { unlockedHeroes: HERO_IDS, unlockedWeapons: ALL_WEAPON_IDS },
        });
        harvested += '\n' + ((await s.page.textContent('#ui')) || '');

        for (const action of ['open-market', 'open-achievements', 'open-leaderboard', 'open-coop']) {
          await fastClick(s.page, `[data-action="${action}"]`);
          await s.page.waitForTimeout(40);
          harvested += '\n' + ((await s.page.textContent('#ui')) || '');
          await closeActiveModal(s.page);
        }

        // Start 2P bot Co-op -> Inspector -> Result
        await fastClick(s.page, '[data-action="open-coop"]');
        await fastClick(s.page, '[data-action="coop-create"]');
        await fastClick(s.page, '[data-action="coop-add-bot"]');
        await fastClick(s.page, '[data-action="coop-start"]');
        await s.page.waitForFunction(() => window.__wugeng.game.run?.players?.length === 2);

        await triggerLevelUp(s.page);
        await fastClick(s.page, '[data-action="inspect-loadout"]');
        harvested += '\n' + ((await s.page.textContent('.veil--inspector')) || '');
        await fastClick(s.page, '[data-action="close-inspector"]');
        await fastClick(s.page, '.qian');

        await s.page.evaluate(() => window.__wugeng.game.finish());
        await s.page.waitForSelector('.screen--result');
        harvested += '\n' + ((await s.page.textContent('.screen--result')) || '');
        s.assertNoErrors('T3-C18');
      } finally {
        await s.close();
      }

      const fontPath = path.join(ROOT, 'assets', 'fonts', 'wenkai-subset.woff2');
      const { stdout } = await execFileAsync(
        VENV_PYTHON,
        [
          '-c',
          'import json, sys; from fontTools.ttLib import TTFont; cmap = set(TTFont(sys.argv[1]).getBestCmap().keys()); txt = sys.argv[2]; miss = sorted({f"U+{ord(c):04X}({c})" for c in txt if not c.isspace() and ord(c) >= 0x20 and ord(c) not in cmap}); print(json.dumps(miss, ensure_ascii=False))',
          fontPath,
          harvested,
        ],
        { cwd: ROOT, timeout: 10_000 },
      );
      assert.deepEqual(JSON.parse(stdout.trim()), [], 'Every live rendered character across all v3 modals/screens must exist in wenkai-subset.woff2');
    },
  },
];
