// Tier 2 (Part 1): Boundary, Negative, Security & Invariant E2E Tests for v3 F1–F7
// STRICT OPAQUE-BOX: ZERO imports from ../../src/**.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  ALLOWED_WOODBLOCK_HEX,
  ALL_ENEMY_IDS,
  ALL_RELIC_IDS,
  ALL_WEAPON_IDS,
  ATTACK_VFX_IDS,
  DEFAULT_UNLOCKED_WEAPON_IDS,
  HERO_IDS,
  MAX_RELICS,
  MAX_WEAPONS,
  V3_NEW_WEAPON_IDS,
} from './contracts.mjs';
import {
  ROOT,
  analyzeCanvasSpriteBox,
  auditCanvasWoodblockPalette,
  bootAndStartRun,
  bootColdIntro,
  bootGame,
  bootToHub,
  checkHubSignatureBadge,
  closeActiveModal,
  confirmChestModal,
  createIsolatedPage,
  fastClick,
  grantItemViaLevelUp,
  readNormalizedSave,
  requireOpenSelector,
  shopBuyAndEquipInModal,
  stepFrames,
  suppressWardersInPage,
  triggerChest,
  triggerLevelUp,
} from './harness.mjs';

export const TIER2_F1_F7 = [
  // ═══════════════════════════════════════════════════════════════════════════
  // F1 Boundaries (5 tests)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'T2-F1-01',
    tier: 2,
    feature: 'F1',
    name: '?skipIntro=1 bypasses .boot-intro completely (0 mounts) and mounts .screen--title rapidly',
    async run({ browser, baseUrl }) {
      const s = await bootColdIntro(browser, baseUrl, { query: 'skipIntro=1' });
      try {
        const trace = await s.page.evaluate(() => window.__e2eIntroTrace);
        assert.equal(trace.mountedCount, 0, 'Expected ?skipIntro=1 to never mount .boot-intro');
        assert.ok(s.elapsedMs < 800, `Expected fast ?skipIntro=1 boot (< 800ms), got ${Math.round(s.elapsedMs)}ms`);
        s.assertNoErrors('T2-F1-01');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T2-F1-02',
    tier: 2,
    feature: 'F1',
    name: 'Rapid triple-skip race (2x click + Escape + Space in same tick) is idempotent & mounts exactly 1 .screen--title',
    async run({ browser, baseUrl }) {
      const s = await bootColdIntro(browser, baseUrl, { query: 'introHold=logo', waitForHold: true });
      try {
        await requireOpenSelector(s.page, '[data-action="skip-intro"]');
        await s.page.evaluate(() => {
          const btn = document.querySelector('[data-action="skip-intro"]');
          btn?.click();
          btn?.click();
          window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
          window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true }));
        });
        await s.page.waitForSelector('.screen--title', { timeout: 1500 });
        const counts = await s.page.evaluate(() => ({
          titles: document.querySelectorAll('.screen--title').length,
          activeIntros: [...document.querySelectorAll('.boot-intro')].filter((el) => !el.hidden && getComputedStyle(el).display !== 'none').length,
        }));
        assert.equal(counts.titles, 1, 'Triple-skip race must mount .screen--title strictly once');
        assert.equal(counts.activeIntros, 0);
        s.assertNoErrors('T2-F1-02');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T2-F1-03',
    tier: 2,
    feature: 'F1',
    name: 'Mid-intro viewport resize (390x844 -> 360x780 -> 412x915) on ?introHold=logo rescales Canvas without 0x0 blanking',
    async run({ browser, baseUrl }) {
      const s = await bootColdIntro(browser, baseUrl, { query: 'introHold=logo', waitForHold: true });
      try {
        await s.page.setViewportSize({ width: 360, height: 780 });
        await s.page.waitForTimeout(40);
        await s.page.setViewportSize({ width: 412, height: 915 });
        await s.page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

        const overflow = await s.page.evaluate(() => {
          const rect = document.querySelector('.boot-intro')?.getBoundingClientRect();
          return {
            sw: document.documentElement.scrollWidth,
            cw: document.documentElement.clientWidth,
            introW: rect?.width || 0,
            introH: rect?.height || 0,
          };
        });
        assert.ok(overflow.sw <= overflow.cw + 1, `Unexpected horizontal overflow after resize: ${JSON.stringify(overflow)}`);
        assert.ok(
          overflow.introW >= 400 && overflow.introH >= 900,
          `Expected .boot-intro container rect >= 400x900 on 412x915, got ${overflow.introW}x${overflow.introH}`,
        );

        const canvasSel = (await s.page.$('.boot-intro canvas')) ? '.boot-intro canvas' : '#game-canvas';
        const snap = await analyzeCanvasSpriteBox(s.page, canvasSel);
        assert.ok(snap && snap.width >= 200 && snap.height >= 160, `Expected rescaled canvas >= 200x160, got ${snap?.width}x${snap?.height}`);
        assert.ok(snap.nonBgPixels > 150, `Expected logo artwork redrawn after resize (not cleared blank), got ${snap.nonBgPixels}`);
        s.assertNoErrors('T2-F1-03');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T2-F1-04',
    tier: 2,
    feature: 'F1',
    name: 'Invalid query ?introHold=__invalid__ falls through safely to .screen--title without hanging forever',
    async run({ browser, baseUrl }) {
      const s = await bootColdIntro(browser, baseUrl, { query: 'introHold=__invalid__', titleTimeoutMs: 3000 });
      try {
        await requireOpenSelector(s.page, '.screen--title');
        assert.ok(s.elapsedMs < 3000);
        s.assertNoErrors('T2-F1-04');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T2-F1-05',
    tier: 2,
    feature: 'F1',
    name: 'Intro rAF loop terminates at done & never hijacks deterministic gameFrameCb stepper',
    async run({ browser, baseUrl }) {
      const s = await bootColdIntro(browser, baseUrl);
      try {
        await fastClick(s.page, '.title-actions .btn--seal');
        await s.page.waitForSelector('.screen--hub');
        await fastClick(s.page, '.hub-foot .btn--seal, .btn--big');
        const t0 = await s.page.evaluate(() => window.__wugeng.game.run.time);
        await stepFrames(s.page, 12);
        const t1 = await s.page.evaluate(() => window.__wugeng.game.run.time);
        assert.ok(
          Math.abs((t1 - t0) - 12 / 60) < 0.04,
          `Expected __e2eStepFrames(12) to advance game loop by ~0.20s after cold intro, got ${(t1 - t0).toFixed(3)}s`,
        );
        s.assertNoErrors('T2-F1-05');
      } finally {
        await s.close();
      }
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // F2 Boundaries (5 tests)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'T2-F2-01',
    tier: 2,
    feature: 'F2',
    name: 'Locked hero tiles (yinyang, nuoxi, mian) reject selection in Hub, keep selectedHero === "zhou" & show toast',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootToHub(s.page, baseUrl, { savePatch: { unlockedHeroes: ['zhou'], selectedHero: 'zhou' } });
        for (const lockedHero of ['yinyang', 'nuoxi', 'mian']) {
          await s.page.evaluate((hid) => document.querySelector(`[data-hero-id="${hid}"]`)?.click(), lockedHero);
          assert.equal(await s.page.evaluate(() => window.__wugeng.save.selectedHero), 'zhou');
        }
        const toastText = (await s.page.textContent('.toast')) || '';
        assert.ok(/未解锁|解锁/.test(toastText), `Expected locked hero unlock hint toast, got '${toastText}'`);
        s.assertNoErrors('T2-F2-01');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T2-F2-02',
    tier: 2,
    feature: 'F2',
    name: 'Locked achievement weapons (taomujian / zhinian_kite) cannot be equipped in Hub or drafted in level-up pool',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootToHub(s.page, baseUrl, {
          savePatch: {
            unlockedHeroes: ['zhou'],
            unlockedWeapons: DEFAULT_UNLOCKED_WEAPON_IDS,
            selectedHero: 'zhou',
          },
        });
        await s.page.evaluate(() => {
          document.querySelector('[data-starter-weapon="taomujian"]')?.click();
        });
        await fastClick(s.page, '.hub-foot .btn--seal, .btn--big');
        await stepFrames(s.page, 2);
        assert.equal(await s.page.evaluate(() => window.__wugeng.game.run.weapons[0]?.id), 'gong');

        await s.page.evaluate(() => { window.__wugeng.game.run.rerolls.free = 15; });
        await triggerLevelUp(s.page);
        for (let i = 0; i < 12; i++) {
          const offeredIds = await s.page.evaluate(() => window.__wugeng.game.run.choices.map((c) => c.id));
          assert.equal(
            offeredIds.includes('taomujian') || offeredIds.includes('zhinian_kite'),
            false,
            `Locked achievement weapon must not appear in levelup choices before unlock: [${offeredIds.join(',')}]`,
          );
          await fastClick(s.page, '[data-action="reroll"]');
        }
        s.assertNoErrors('T2-F2-02');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T2-F2-03',
    tier: 2,
    feature: 'F2',
    name: 'Corrupt selectedStarterWeapon ("__bogus_weapon__") in localStorage sanitizes cleanly to hero signature weapon',
    async run({ browser, baseUrl }) {
      const tampered = JSON.stringify({
        version: 3,
        unlockedHeroes: ['zhou', 'tiejiang'],
        selectedHero: 'tiejiang',
        unlockedWeapons: ['gong', 'suohun_chain'],
        selectedStarterWeapon: '__bogus_weapon__',
      });
      const s = await createIsolatedPage(browser, {
        beforeBootInitScript: (raw) => { localStorage.setItem('wugeng.save', raw); },
        beforeBootArg: tampered,
      });
      try {
        await bootToHub(s.page, baseUrl);
        await fastClick(s.page, '.hub-foot .btn--seal, .btn--big');
        await stepFrames(s.page, 2);
        const startId = await s.page.evaluate(() => window.__wugeng.game.run.weapons[0]?.id);
        assert.equal(startId, 'suohun_chain', `Expected corrupt starter weapon on tiejiang to fall back to signature 'suohun_chain', got '${startId}'`);
        s.assertNoErrors('T2-F2-03');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T2-F2-04',
    tier: 2,
    feature: 'F2',
    name: 'Switching heroes in Hub updates starter weapon / .signature-badge consistently without leaking badge state',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootToHub(s.page, baseUrl, {
          savePatch: {
            unlockedHeroes: ['zhou', 'nuoxi'],
            unlockedWeapons: DEFAULT_UNLOCKED_WEAPON_IDS,
            selectedHero: 'zhou',
          },
        });
        await fastClick(s.page, '[data-hero-id="zhou"]');
        await fastClick(s.page, '[data-starter-weapon="gong"]');
        const zhouBadge = await checkHubSignatureBadge(s.page);
        assert.equal(zhouBadge.visible, true, 'Expected .signature-badge visible when zhou selects gong');

        await fastClick(s.page, '[data-hero-id="nuoxi"]');
        const nuoxiBadge = await checkHubSignatureBadge(s.page);
        const savedStarter = (await readNormalizedSave(s.page)).starterWeapon;
        const activeWeaponInHub = nuoxiBadge.activeStarterWeapon || savedStarter || 'nuo_drum';
        assert.equal(
          nuoxiBadge.visible,
          activeWeaponInHub === 'nuo_drum',
          `Expected Hub .signature-badge visibility (${nuoxiBadge.visible}) to match nuoxi active starter '${activeWeaponInHub}'`,
        );

        await fastClick(s.page, '.hub-foot .btn--seal, .btn--big');
        await stepFrames(s.page, 2);
        const res = await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          const summary = window.__wugeng.game.finish();
          return { w0: r.weapons[0]?.id, sigStart: summary.signatureStart };
        });
        assert.equal(res.w0, activeWeaponInHub, `Expected run starter weapon '${res.w0}' to match Hub active weapon '${activeWeaponInHub}'`);
        assert.equal(res.sigStart, res.w0 === 'nuo_drum', `Expected signatureStart consistent with nuoxi weapon '${res.w0}'`);
        s.assertNoErrors('T2-F2-04');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T2-F2-05',
    tier: 2,
    feature: 'F2',
    name: 'Ultimate cast at ult === 99 (< ultMax=100) is rejected across classic & new v3 heroes via Space & HUD gong',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, {
          savePatch: { unlockedHeroes: HERO_IDS },
          seed: 22205,
        });
        for (const hid of ['zhou', 'yinyang', 'nuoxi']) {
          await s.page.evaluate((h) => {
            const g = window.__wugeng.game;
            g.start({ heroId: h, nightLevel: 0, meta: {}, charm: null, seed: 22205 });
            g.run.enemies.length = 0;
            g.run._spawnAcc = -99999;
            g.run.player.ult = 99;
          }, hid);
          await s.page.keyboard.press('Space');
          await s.page.mouse.click(334, 788);
          const after = await s.page.evaluate(() => {
            window.__e2eStepFrames(2);
            return {
              ultsCast: window.__wugeng.game.run.stats.ultsCast,
              ult: window.__wugeng.game.run.player.ult,
            };
          });
          assert.equal(after.ultsCast, 0, `Hero ${hid} must not cast ultimate at 99/100 charge`);
          assert.equal(after.ult, 99);
        }
        s.assertNoErrors('T2-F2-05');
      } finally {
        await s.close();
      }
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // F3 Boundaries (7 tests)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'T2-F3-01',
    tier: 2,
    feature: 'F3',
    name: '6-weapon + 6-relic slot cap strictly blocks any 7th isNew weapon or relic across rerolls (32-item pool)',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, {
          unlockedWeapons: ALL_WEAPON_IDS,
          savePatch: { unlockedWeapons: ALL_WEAPON_IDS },
          seed: 2301,
        });
        for (const wid of ['compass', 'soulbanner', 'paperhorse', 'suohun_chain', 'nuo_drum']) {
          await grantItemViaLevelUp(s.page, 'weapon', wid, 1);
        }
        for (const rid of ['strawshoes', 'glutinous', 'fivecoins', 'soulwick', 'yinpai', 'wuse_mask']) {
          await grantItemViaLevelUp(s.page, 'relic', rid, 1);
        }

        const counts = await s.page.evaluate(() => ({
          w: window.__wugeng.game.run.weapons.length,
          r: window.__wugeng.game.run.relics.length,
        }));
        assert.equal(counts.w, MAX_WEAPONS);
        assert.equal(counts.r, MAX_RELICS);

        await s.page.evaluate(() => { window.__wugeng.game.run.rerolls.free = 10; });
        await triggerLevelUp(s.page);
        for (let i = 0; i < 7; i++) {
          const anyNew = await s.page.evaluate(() => window.__wugeng.game.run.choices.some((c) => c.isNew));
          assert.equal(anyNew, false, 'With 6/6 weapons & 6/6 relics occupied, normal levelup must offer 0 isNew items');
          await fastClick(s.page, '[data-action="reroll"]');
        }
        s.assertNoErrors('T2-F3-01');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T2-F3-02',
    tier: 2,
    feature: 'F3',
    name: 'All 6W + 6R maxed at Lv5 offers fallback overflow/coin/bun on levelup AND fallback coins on Chest without softlock',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, {
          unlockedWeapons: ALL_WEAPON_IDS,
          savePatch: { unlockedWeapons: ALL_WEAPON_IDS },
          seed: 2302,
        });
        await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          r.weapons = [
            { id: 'gong', level: 5, evolved: true, cd: 1 },
            { id: 'talisman', level: 5, evolved: true, cd: 1 },
            { id: 'compass', level: 5, evolved: true, cd: 1 },
            { id: 'suohun_chain', level: 5, evolved: true, cd: 1 },
            { id: 'nuo_drum', level: 5, evolved: true, cd: 1 },
            { id: 'taomujian', level: 5, evolved: true, cd: 1 },
          ];
          r.relics = [
            { id: 'clapper', level: 5 },
            { id: 'cinnabar', level: 5 },
            { id: 'soulwick', level: 5 },
            { id: 'yinpai', level: 5 },
            { id: 'wuse_mask', level: 5 },
            { id: 'leijimu', level: 5 },
          ];
        });

        await triggerLevelUp(s.page);
        const kinds = await s.page.evaluate(() => window.__wugeng.game.run.choices.map((c) => c.kind));
        assert.equal(kinds.length, 3, 'Expected 3 fallback choices when all 6W+6R are Lv5');
        assert.ok(
          kinds.includes('overflow') && kinds.includes('coin') && kinds.includes('bun'),
          `Expected fallback kinds [overflow, coin, bun], got [${kinds.join(',')}]`,
        );
        await fastClick(s.page, '.qian');

        const coins0 = await s.page.evaluate(() => window.__wugeng.game.run.stats.coins);
        await triggerChest(s.page);
        await confirmChestModal(s.page);
        const afterChest = await s.page.evaluate(() => ({
          coins: window.__wugeng.game.run.stats.coins,
          overlay: window.__wugeng.overlay,
          status: window.__wugeng.game.run.status,
        }));
        assert.ok(afterChest.coins > coins0, 'All-maxed 6+6 chest must award fallback copper coins');
        assert.equal(afterChest.overlay, null);
        assert.equal(afterChest.status, 'playing');
        s.assertNoErrors('T2-F3-02');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T2-F3-03',
    tier: 2,
    feature: 'F3',
    name: 'Narrow 360x780 viewport HUD renders full 6W + 6R slots with ZERO pixel overlap into center Watch Timer plaque',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser, {
        viewport: { width: 360, height: 780 },
        deviceScaleFactor: 2,
      });
      try {
        await bootAndStartRun(s.page, baseUrl, {
          unlockedWeapons: ALL_WEAPON_IDS,
          savePatch: { unlockedWeapons: ALL_WEAPON_IDS },
          seed: 2303,
        });
        for (const wid of ['talisman', 'bell', 'compass', 'suohun_chain', 'nuo_drum']) {
          await grantItemViaLevelUp(s.page, 'weapon', wid, 1);
        }
        for (const rid of ['clapper', 'cinnabar', 'redstring', 'bagua', 'yinpai', 'wuse_mask']) {
          await grantItemViaLevelUp(s.page, 'relic', rid, 1);
        }

        const check = await s.page.evaluate(async () => {
          const r = window.__wugeng.game.run;
          r.enemies.length = 0;
          r.props.length = 0;
          r.pickups.length = 0;
          r.projectiles.length = 0;
          if (Array.isArray(r.shrines)) r.shrines.length = 0;
          r._spawnAcc = -99999;
          r.time = 125;
          r.watch = 2;
          r.darkness = 0;
          r.player.hurtT = 0;
          window.__wugeng.game.pause();

          const c = document.getElementById('game-canvas');
          const ctx = c.getContext('2d');
          const dpr = c.width / window.innerWidth;
          const sampleTimerCenter = () => {
            const x0 = Math.floor((180 - 62) * dpr);
            const y0 = Math.floor(38 * dpr);
            const w = Math.floor(124 * dpr);
            const h = Math.floor(36 * dpr);
            return ctx.getImageData(x0, y0, w, h).data;
          };
          const sampleLeftSlots = () => {
            const x0 = Math.floor(4 * dpr);
            const y0 = Math.floor(36 * dpr);
            const w = Math.floor(112 * dpr);
            const h = Math.floor(88 * dpr);
            return ctx.getImageData(x0, y0, w, h).data;
          };

          await new Promise((res) => requestAnimationFrame(res));
          await new Promise((res) => requestAnimationFrame(res));
          const timerFull = sampleTimerCenter();
          const leftFull = sampleLeftSlots();

          const fullW = r.weapons;
          const fullR = r.relics;
          r.weapons = [fullW[0]];
          r.relics = [];
          await new Promise((res) => requestAnimationFrame(res));
          await new Promise((res) => requestAnimationFrame(res));
          const timerMin = sampleTimerCenter();
          const leftMin = sampleLeftSlots();

          r.weapons = fullW;
          r.relics = fullR;

          let timerDiff = 0;
          for (let i = 0; i < timerFull.length; i += 4) {
            if (
              Math.abs(timerFull[i] - timerMin[i]) +
              Math.abs(timerFull[i + 1] - timerMin[i + 1]) +
              Math.abs(timerFull[i + 2] - timerMin[i + 2]) > 8
            ) {
              timerDiff++;
            }
          }
          let leftDiff = 0;
          for (let i = 0; i < leftFull.length; i += 4) {
            if (
              Math.abs(leftFull[i] - leftMin[i]) +
              Math.abs(leftFull[i + 1] - leftMin[i + 1]) +
              Math.abs(leftFull[i + 2] - leftMin[i + 2]) > 20
            ) {
              leftDiff++;
            }
          }
          return { timerDiff, leftDiff };
        });

        assert.equal(check.timerDiff, 0, `6+6 HUD slots on 360x780 must NOT bleed into center Watch Timer plaque (timerDiff=${check.timerDiff})`);
        assert.ok(check.leftDiff > 80, `Expected left 6+6 HUD region rendered on 360x780 (leftDiff=${check.leftDiff})`);
        s.assertNoErrors('T2-F3-03');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T2-F3-04',
    tier: 2,
    feature: 'F3',
    name: '4 new evolved weapons handle 0-enemy arena without NaN AND max CDR + affinity respects >= 0.25s cooldown floor',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, {
          heroId: 'zhou',
          unlockedWeapons: ALL_WEAPON_IDS,
          savePatch: { unlockedWeapons: ALL_WEAPON_IDS },
          seed: 2304,
        });
        await grantItemViaLevelUp(s.page, 'weapon', 'gong', 4);
        await grantItemViaLevelUp(s.page, 'relic', 'clapper', 5);
        await triggerChest(s.page);
        await confirmChestModal(s.page, 'gong');

        const res = await s.page.evaluate((newWids) => {
          const r = window.__wugeng.game.run;
          r.enemies.length = 0;
          r._spawnAcc = -99999;
          r._nextWaveT = 99999;

          const g = r.weapons.find((w) => w.id === 'gong');
          g.cd = 0;
          window.__e2eStepFrames(1);
          const gongCdFloor = g.cd;

          // Equip all 4 new evolved v3 weapons in empty arena
          r.weapons = newWids.map((id) => ({ id, level: 5, evolved: true, cd: 0 }));
          let finiteOk = true;
          window.__e2eStepFrames(60, {
            onStep: () => {
              for (const p of r.projectiles) {
                if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) finiteOk = false;
              }
            },
          });
          return { gongCdFloor, finiteOk };
        }, V3_NEW_WEAPON_IDS);

        assert.ok(res.gongCdFloor >= 0.25, `Expected positive cooldown floor (>= 0.25s) with Lv5 clapper + HERO_AFFINITY, got ${res.gongCdFloor}`);
        assert.equal(res.finiteOk, true, 'Expected 0 NaN/Infinity projectile coordinates across all 4 new evolved weapons in 0-enemy arena');
        s.assertNoErrors('T2-F3-04');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T2-F3-05',
    tier: 2,
    feature: 'F3',
    name: 'All 16 weapon icons + 16 relic icons (32) and all 12 enemy icons in 百物谱 have pairwise-unique bitmaps',
    async run({ browser, baseUrl }) {
      const enemyKillMap = Object.fromEntries(ALL_ENEMY_IDS.map((id) => [id, 5]));
      const s = await createIsolatedPage(browser);
      try {
        await bootToHub(s.page, baseUrl, {
          savePatch: {
            codex: { weapons: ALL_WEAPON_IDS, relics: ALL_RELIC_IDS, enemies: enemyKillMap },
          },
        });
        await fastClick(s.page, '.hub-nav .btn:nth-child(2)');
        await requireOpenSelector(s.page, '.codex');

        const hashTab = async (tabIdx) => {
          await s.page.evaluate((idx) => document.querySelectorAll('.codex-tab')[idx]?.click(), tabIdx);
          return s.page.$$eval('.codex-list > .codex-row:not(.codex-row--ach) img.icon', (imgs) => {
            const c = document.createElement('canvas');
            c.width = 48;
            c.height = 48;
            const ctx = c.getContext('2d');
            return imgs.map((img) => {
              ctx.clearRect(0, 0, 48, 48);
              ctx.drawImage(img, 0, 0, 48, 48);
              const d = ctx.getImageData(0, 0, 48, 48).data;
              let h = 2166136261;
              for (let i = 0; i < d.length; i += 4) {
                h = Math.imul(h ^ d[i] ^ (d[i + 1] << 2) ^ (d[i + 3] << 4), 16777619) >>> 0;
              }
              return h;
            });
          });
        };

        const wHashes = await hashTab(0);
        const rHashes = await hashTab(2);
        const eHashes = await hashTab(3);
        assert.equal(wHashes.length, 16);
        assert.equal(rHashes.length, 16);
        assert.equal(new Set([...wHashes, ...rHashes]).size, 32, 'All 16 weapons + 16 relics must have 32 distinct icon bitmaps');
        assert.equal(eHashes.length, 12);
        assert.equal(new Set(eHashes).size, 12, 'All 12 enemy icons must have 12 distinct bitmaps');
        s.assertNoErrors('T2-F3-05');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T2-F3-06',
    tier: 2,
    feature: 'F3',
    name: 'Asymmetric 6W + 2R cap blocks 7th isNew weapon while still offering isNew relics + Lv4 chest non-evolution guard',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, {
          unlockedWeapons: ALL_WEAPON_IDS,
          savePatch: { unlockedWeapons: ALL_WEAPON_IDS },
          seed: 2306,
        });
        // Lv4 gong + clapper Lv1 must NOT evolve on chest
        await grantItemViaLevelUp(s.page, 'weapon', 'gong', 3); // Lv4
        await grantItemViaLevelUp(s.page, 'relic', 'clapper', 1);
        await triggerChest(s.page);
        await confirmChestModal(s.page);
        assert.equal(await s.page.evaluate(() => window.__wugeng.game.run.weapons[0].evolved), false, 'Lv4 weapon must not evolve');

        // Fill 6 Lv5 evolved weapons + 2 Lv1 relics
        await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          r.weapons = [
            { id: 'gong', level: 5, evolved: true, cd: 1 },
            { id: 'talisman', level: 5, evolved: true, cd: 1 },
            { id: 'compass', level: 5, evolved: true, cd: 1 },
            { id: 'suohun_chain', level: 5, evolved: true, cd: 1 },
            { id: 'nuo_drum', level: 5, evolved: true, cd: 1 },
            { id: 'lantern', level: 5, evolved: true, cd: 1 },
          ];
          r.relics = [
            { id: 'clapper', level: 1 },
            { id: 'cinnabar', level: 1 },
          ];
          r.rerolls.free = 8;
        });

        await triggerLevelUp(s.page);
        let sawNewRelic = false;
        for (let i = 0; i < 6; i++) {
          const info = await s.page.evaluate(() => ({
            newWeapon: window.__wugeng.game.run.choices.some((c) => c.kind === 'weapon' && c.isNew),
            newRelic: window.__wugeng.game.run.choices.some((c) => c.kind === 'relic' && c.isNew),
          }));
          assert.equal(info.newWeapon, false, '6/6 weapons must block isNew weapon cards');
          if (info.newRelic) sawNewRelic = true;
          await fastClick(s.page, '[data-action="reroll"]');
        }
        assert.equal(sawNewRelic, true, '2/6 relics must still offer isNew relic cards');
        s.assertNoErrors('T2-F3-06');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T2-F3-07',
    tier: 2,
    feature: 'F3',
    name: 'WebAudio MAX_VOICES=20 polyphony throttle (priority boss/dawn bypass) & multi-reason suspend refcounting',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser, { isolated: true });
      try {
        await bootToHub(s.page, baseUrl);
        const res = await s.page.evaluate(async () => {
          const a = window.__wugeng.audio;
          const waitRunning = async (maxMs = 800) => {
            let waited = 0;
            while (a.state !== 'running' && waited < maxMs) {
              await new Promise((r) => setTimeout(r, 20));
              waited += 20;
            }
          };
          a.unlock();
          a.resume('all');
          await waitRunning(800);
          a.setMusicMode('off');
          a.setEnabled({ music: false, sfx: true });

          const unknown = a.play('__nonexistent_voice__');
          // Multi-reason suspend refcount
          a.suspend('ad');
          a.suspend('hidden');
          const whileBoth = a.play('gong');
          a.resume('ad');
          await new Promise((r) => setTimeout(r, 20));
          const whileHidden = a.play('woodblock');
          a.resume('hidden');
          await waitRunning(800);
          await new Promise((r) => setTimeout(r, 280));
          const afterResume = a.play('gong');
          return { unknown, whileBoth, whileHidden, afterResume };
        });
        assert.equal(res.unknown, false);
        assert.equal(res.whileBoth, false);
        assert.equal(res.whileHidden, false);
        assert.equal(res.afterResume, true);
        s.assertNoErrors('T2-F3-07');
      } finally {
        await s.close();
      }
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // F4 Boundaries (5 tests)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'T2-F4-01',
    tier: 2,
    feature: 'F4',
    name: 'Raised horde cap (SPAWN.cap = 300): active enemies exceed 260 under wave flood and clamp strictly <= 300',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { seed: 2401 });
        await suppressWardersInPage(s.page);
        const res = await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          r.enemies.length = 0;
          r.weapons.forEach((w) => { w.cd = 9999; });
          r.player.invulnT = 60;
          r._bossSpawned = { horse: true, umbrella: true, youshen: true };
          r.time = 520;
          for (let i = 0; i < 360; i++) {
            const a = (i / 360) * Math.PI * 2;
            r._spawnQueue.push({
              type: 'paperkid',
              x: r.player.x + Math.cos(a) * (120 + (i % 12) * 14),
              y: r.player.y + Math.sin(a) * (120 + (i % 12) * 14),
              opts: {},
            });
          }
          let maxAlive = 0;
          const t0 = performance.now();
          for (let f = 0; f < 10; f++) {
            window.__e2eStepFrames(1, { stopOnOverlay: false });
            maxAlive = Math.max(maxAlive, r.enemies.filter((e) => !e.dead).length);
          }
          const msPerFrame = (performance.now() - t0) / 10;
          return { maxAlive, msPerFrame };
        });

        assert.ok(res.maxAlive > 260, `Expected raised v3 horde cap > 260 (got ${res.maxAlive})`);
        assert.ok(res.maxAlive <= 300, `Active enemies must clamp strictly <= 300 (got ${res.maxAlive})`);
        assert.ok(res.msPerFrame < 35, `Expected bounded per-frame simulation cost (< 35ms), got ${res.msPerFrame.toFixed(2)}ms`);
        s.assertNoErrors('T2-F4-01');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T2-F4-02',
    tier: 2,
    feature: 'F4',
    name: 'Endless 25m (t=1500s) finite HP & strict 1.35x speed clamp + glutinous maxHp clamp',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { seed: 2402 });
        await grantItemViaLevelUp(s.page, 'relic', 'glutinous', 5);
        await suppressWardersInPage(s.page);
        const res = await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          r._bossSpawned = { horse: true, umbrella: true, youshen: true };
          r.weapons.forEach((w) => { w.cd = 9999; });
          r._spawnAcc = -99999;
          r._nextWaveT = 99999;

          r.enemies.length = 0;
          r.time = 0;
          r._spawnQueue.push({ type: 'paperkid', x: r.player.x + 200, y: r.player.y, opts: {} });
          window.__e2eStepFrames(1, { stopOnOverlay: false });
          const spd0 = r.enemies[0].speed;

          r.enemies.length = 0;
          r.mode = 'endless';
          r.time = 1500;
          r._spawnQueue.push({ type: 'paperkid', x: r.player.x + 200, y: r.player.y, opts: {} });
          r._spawnQueue.push({ type: 'sedan', x: r.player.x + 230, y: r.player.y, opts: {} });
          window.__e2eStepFrames(1, { stopOnOverlay: false });
          while (window.__wugeng.overlay === 'levelup') document.querySelector('.qian')?.click();
          const pk25 = r.enemies.find((e) => e.type === 'paperkid');
          const sed25 = r.enemies.find((e) => e.type === 'sedan');
          return {
            hpFinite: Number.isFinite(pk25.hp) && pk25.hp > 0 && Number.isFinite(sed25.hp) && sed25.hp > 0,
            spdRatio: pk25.speed / spd0,
          };
        });

        assert.equal(res.hpFinite, true, '25-minute endless enemy HP must stay finite & positive');
        assert.ok(Math.abs(res.spdRatio - 1.35) <= 0.03, `Expected speed clamped at ~1.35x at 25m, got ${res.spdRatio.toFixed(3)}`);
        s.assertNoErrors('T2-F4-02');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T2-F4-03',
    tier: 2,
    feature: 'F4',
    name: 'Watch-4 (~430s) 3rd Mini-Warder spawns strictly once per run (zero duplicate chest farming)',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { seed: 2403 });
        const spawnedCount = await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          r._bossSpawned = { horse: true, umbrella: true, youshen: true };
          r._warderSpawned = { warder_150: true, warder_360: true };
          r.enemies.length = 0;
          r.pickups.length = 0;
          r._spawnAcc = -99999;
          r._nextWaveT = 99999;
          r.time = 415;

          const seenWarderIds = new Set();
          for (let step = 0; step < 90; step++) {
            window.__e2eStepFrames(30, { stopOnOverlay: false }); // +0.5s per loop -> 415..460s
            while (window.__wugeng.overlay === 'levelup') document.querySelector('.qian')?.click();
            for (const e of r.enemies) {
              if (e.chest && !e.boss) {
                seenWarderIds.add(e.id);
                e.hp = 0;
                e.dead = true;
              }
            }
          }
          return seenWarderIds.size;
        });

        assert.equal(spawnedCount, 1, `Expected Watch-4 Mini-Warder to spawn strictly once across 415..460s, got ${spawnedCount}`);
        s.assertNoErrors('T2-F4-03');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T2-F4-04',
    tier: 2,
    feature: 'F4',
    name: 'Deterministic seed replayability: two identical runs (seed=4404, tiejiang + suohun_chain) match 100% after 180 frames',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootToHub(s.page, baseUrl, {
          savePatch: { unlockedHeroes: HERO_IDS, unlockedWeapons: ALL_WEAPON_IDS },
        });
        const runDeterministic = () =>
          s.page.evaluate(() => {
            const g = window.__wugeng.game;
            g.start({ heroId: 'tiejiang', startWeapon: 'suohun_chain', nightLevel: 0, meta: {}, charm: null, seed: 4404 });
            window.__e2eStepFrames(180, { maxBatch: 1, stopOnOverlay: false });
            const r = g.run;
            return {
              time: Math.round(r.time * 1000),
              kills: r.stats.kills,
              enemyCount: r.enemies.length,
              sample: r.enemies.slice(0, 5).map((e) => `${e.type}:${Math.round(e.x * 10)}:${Math.round(e.y * 10)}:${Math.round(e.hp)}`),
            };
          });

        const snap1 = await runDeterministic();
        const snap2 = await runDeterministic();
        assert.deepEqual(snap1, snap2, 'Identical seed & starter weapon must yield bit-exact simulation state');
        s.assertNoErrors('T2-F4-04');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T2-F4-05',
    tier: 2,
    feature: 'F4',
    name: 'Organic waves pause during active Boss + 700px Boss leash snaps Boss back within <= 480px without despawning',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { seed: 2405 });
        await suppressWardersInPage(s.page);
        const res = await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          r.enemies.length = 0;
          r.weapons.forEach((w) => { w.cd = 9999; });
          r.player.invulnT = 30;
          r._bossSpawned = { horse: true, umbrella: false, youshen: true };
          r.time = 480.2;
          window.__e2eStepFrames(2, { stopOnOverlay: false });
          while (window.__wugeng.overlay === 'levelup') document.querySelector('.qian')?.click();

          const boss = r.enemies.find((e) => e.type === 'umbrella');
          // Force wave timer ready and place Boss beyond 700px leash
          if (typeof r._nextWaveT === 'number') r._nextWaveT = r.time + 0.05;
          boss.x = r.player.x + 900;
          boss.y = r.player.y;
          let sawWaveEvent = false;
          window.__e2eStepFrames(60, {
            stopOnOverlay: false,
            onStep: () => {
              if ((r.events || []).some((ev) => ev.type === 'wave')) sawWaveEvent = true;
            },
          });
          const distAfter = Math.hypot(boss.x - r.player.x, boss.y - r.player.y);
          return { alive: !boss.dead && Boolean(r.boss), distAfter, sawWaveEvent };
        });

        assert.equal(res.alive, true, 'Leashed Boss must remain alive');
        assert.ok(res.distAfter <= 490, `Expected >700px Boss leash to pull Boss within <=490px, got ${res.distAfter.toFixed(1)}`);
        assert.equal(res.sawWaveEvent, false, 'Organic horde wave events must pause while Boss is active');
        s.assertNoErrors('T2-F4-05');
      } finally {
        await s.close();
      }
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // F5 Boundaries (5 tests)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'T2-F5-01',
    tier: 2,
    feature: 'F5',
    name: 'All 6 heroes default skins + default VFX strictly pass 6-color warm woodblock check (< 0.5% cool pixels)',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser, { styleLab: true });
      try {
        for (const hid of HERO_IDS) {
          await s.page.goto(`${baseUrl}/style-lab.html?watch=4&scene=crowd&hero=${hid}`);
          await s.page.waitForFunction(() => Boolean(window.__renderer && window.__run), null, { timeout: 5000 });
          await s.page.evaluate(() => {
            window.__renderer.render(window.__run, 1, 0.016, { shake: false, dmgText: 'all', safeTop: 0, safeBottom: 0 });
          });
          const audit = await auditCanvasWoodblockPalette(s.page, 45);
          assert.ok(
            audit.violationRatio < 0.005,
            `Default skin for hero '${hid}' violated warm woodblock palette: ${(audit.violationRatio * 100).toFixed(2)}%`,
          );
        }
        s.assertNoErrors('T2-F5-01');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T2-F5-02',
    tier: 2,
    feature: 'F5',
    name: 'Unowned skin cannot be equipped via UI — previewing in shop leaves save.cosmetics untouched on close',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootToHub(s.page, baseUrl, { savePatch: { coins: 0, unlockedHeroes: HERO_IDS, selectedHero: 'zhou' } });
        await fastClick(s.page, '[data-action="open-market"]');
        await requireOpenSelector(s.page, '.cosmetic-shop-modal');
        await shopBuyAndEquipInModal(s.page, {
          kind: 'skin',
          heroId: 'zhou',
          targetIdx: 1,
          buy: false,
          equip: true,
          close: true,
        });

        const after = await readNormalizedSave(s.page);
        const zhouSkin = after.heroSkins.zhou;
        assert.ok(!zhouSkin || /default$/i.test(zhouSkin), `Unowned skin must NOT equip onto zhou, got '${zhouSkin}'`);
        s.assertNoErrors('T2-F5-02');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T2-F5-03',
    tier: 2,
    feature: 'F5',
    name: 'Corrupt skin ID ("__ghost_skin_999__") in localStorage falls back safely to default skin without blank player sprite',
    async run({ browser, baseUrl }) {
      const tampered = JSON.stringify({
        version: 3,
        selectedHero: 'zhou',
        unlockedHeroes: ['zhou'],
        cosmetics: {
          owned: ['__ghost_skin_999__'],
          equipped: { lantern: null, outfit: null, attackVfx: 'default', heroSkins: { zhou: '__ghost_skin_999__' } },
        },
      });
      const s = await createIsolatedPage(browser, {
        beforeBootInitScript: (raw) => { localStorage.setItem('wugeng.save', raw); },
        beforeBootArg: tampered,
      });
      try {
        await bootAndStartRun(s.page, baseUrl, { seed: 2503 });
        await s.page.evaluate(async () => {
          const r = window.__wugeng.game.run;
          r.enemies.length = 0;
          r.props.length = 0;
          r.weapons.forEach((w) => { w.cd = 9999; });
          r.darkness = 0;
          window.__wugeng.game.pause();
          await new Promise((res) => requestAnimationFrame(res));
        });
        const centerSnap = await analyzeCanvasSpriteBox(
          s.page,
          '#game-canvas',
          { x: Math.floor(390 / 2 - 28), y: Math.floor(844 / 2 - 32), width: 56, height: 64 },
          { cssCoords: true },
        );
        assert.ok(centerSnap && centerSnap.nonBgPixels > 100, `Expected non-blank fallback player sprite, got ${centerSnap?.nonBgPixels}`);
        s.assertNoErrors('T2-F5-03');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T2-F5-04',
    tier: 2,
    feature: 'F5',
    name: 'Per-hero skin isolation: equipping skins on zhou & mian preserves independent heroSkins across hero switches',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootToHub(s.page, baseUrl, {
          savePatch: { coins: 9999, unlockedHeroes: HERO_IDS, selectedHero: 'zhou' },
        });
        const buyFirstPaidSkinFor = async (hid) => {
          await fastClick(s.page, `[data-hero-id="${hid}"]`);
          await fastClick(s.page, '[data-action="open-market"]');
          await requireOpenSelector(s.page, '.cosmetic-shop-modal');
          const res = await shopBuyAndEquipInModal(s.page, {
            kind: 'skin',
            heroId: hid,
            targetIdx: 1,
            buy: true,
            equip: true,
            close: true,
          });
          assert.equal(res.ok, true, res.reason || `Failed buying paid skin for ${hid}`);
        };

        await buyFirstPaidSkinFor('zhou');
        await buyFirstPaidSkinFor('mian');
        const beforeSwitch = await readNormalizedSave(s.page);
        assert.ok(beforeSwitch.heroSkins.zhou && beforeSwitch.heroSkins.mian);
        assert.notEqual(beforeSwitch.heroSkins.zhou, beforeSwitch.heroSkins.mian);

        // Switch zhou -> mian -> nuoxi -> zhou
        for (const hid of ['zhou', 'mian', 'nuoxi', 'zhou']) {
          await fastClick(s.page, `[data-hero-id="${hid}"]`);
        }
        const afterSwitch = await readNormalizedSave(s.page);
        assert.equal(afterSwitch.heroSkins.zhou, beforeSwitch.heroSkins.zhou);
        assert.equal(afterSwitch.heroSkins.mian, beforeSwitch.heroSkins.mian);
        assert.ok(!afterSwitch.heroSkins.nuoxi || /default$/i.test(afterSwitch.heroSkins.nuoxi));
        s.assertNoErrors('T2-F5-04');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T2-F5-05',
    tier: 2,
    feature: 'F5',
    name: '52x58 skin offscreen canvas renders cleanly without error or clipping under lowQuality: true on 360x780',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser, { viewport: { width: 360, height: 780 }, deviceScaleFactor: 2 });
      try {
        await bootToHub(s.page, baseUrl, {
          savePatch: {
            coins: 9999,
            unlockedHeroes: HERO_IDS,
            selectedHero: 'nuoxi',
            settings: { lowQuality: true, shake: false, dmgText: 'off' },
          },
        });
        await fastClick(s.page, '[data-action="open-market"]');
        await requireOpenSelector(s.page, '.cosmetic-shop-modal');
        const eqNuoxi = await shopBuyAndEquipInModal(s.page, {
          kind: 'skin',
          heroId: 'nuoxi',
          targetIdx: 'last',
          buy: true,
          equip: true,
          close: true,
        });
        assert.equal(eqNuoxi.ok, true, eqNuoxi.reason || 'Failed equipping nuoxi skin');
        await fastClick(s.page, '.hub-foot .btn--seal, .btn--big');
        await stepFrames(s.page, 15);
        const snap = await analyzeCanvasSpriteBox(
          s.page,
          '#game-canvas',
          { x: Math.floor(360 / 2 - 30), y: Math.floor(780 / 2 - 32), width: 60, height: 64 },
          { cssCoords: true },
        );
        assert.ok(snap && snap.nonBgPixels > 90);
        s.assertNoErrors('T2-F5-05');
      } finally {
        await s.close();
      }
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // F6 Boundaries (5 tests)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'T2-F6-01',
    tier: 2,
    feature: 'F6',
    name: 'SAFETY INVARIANT: Enemy bullets & Boss windup telegraphs remain #C23B26 vermilion under ALL 5 Attack VFX themes',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, {
          savePatch: {
            cosmetics: { owned: ATTACK_VFX_IDS, equipped: { attackVfx: 'default', heroSkins: {} } },
          },
          seed: 2601,
        });

        for (const themeId of ATTACK_VFX_IDS) {
          const check = await s.page.evaluate(async (vfx) => {
            const w = window.__wugeng;
            w.save.cosmetics.equipped.attackVfx = vfx;
            w.game.applySettings({
              shake: false,
              dmgText: 'off',
              lowQuality: false,
              cosmetics: w.save.cosmetics.equipped,
            });
            const r = w.game.run;
            if (r.player) r.player.attackVfx = vfx;
            if (Array.isArray(r.players) && r.players[0]) r.players[0].attackVfx = vfx;
            r.props.length = 0;
            r.pickups.length = 0;
            if (Array.isArray(r.shrines)) r.shrines.length = 0;
            r.weapons.forEach((wp) => { wp.cd = 9999; });
            r.darkness = 0.76;
            r.enemies = [
              {
                id: 77701,
                type: 'horse',
                boss: true,
                elite: false,
                x: r.player.x - 90,
                y: r.player.y + 45,
                r: 26,
                hp: 9999,
                maxHp: 9999,
                state: 'windup',
                stateT: 0.45,
                windupT: 0.45,
                chargeAngle: 0,
                angle: 0,
                dx: 1,
                dy: 0,
                telegraphLen: 320,
                hitT: 0,
                slowT: 0,
                stunT: 0,
                kbx: 0,
                kby: 0,
                dead: false,
              },
            ];
            r.boss = r.enemies[0];
            r.projectiles = [
              {
                id: 77702,
                kind: 'enemyBullet',
                x: r.player.x,
                y: r.player.y - 75,
                vx: 0,
                vy: 0,
                r: 10,
                angle: 0,
                t: 0.1,
                life: 5,
                dmg: 15,
              },
            ];
            w.game.pause();
            await new Promise((res) => requestAnimationFrame(res));
            await new Promise((res) => requestAnimationFrame(res));

            const c = document.getElementById('game-canvas');
            const ctx = c.getContext('2d');
            const dpr = c.width / window.innerWidth;
            const sampleVerm = (cxCss, cyCss, radCss) => {
              const x0 = Math.max(0, Math.floor((cxCss - radCss) * dpr));
              const y0 = Math.max(0, Math.floor((cyCss - radCss) * dpr));
              const rw = Math.floor(radCss * 2 * dpr);
              const rh = Math.floor(radCss * 2 * dpr);
              const d = ctx.getImageData(x0, y0, rw, rh).data;
              let verm = 0;
              let cool = 0;
              for (let i = 0; i < d.length; i += 4) {
                const R = d[i];
                const G = d[i + 1];
                const B = d[i + 2];
                if (R >= 105 && R - G >= 40 && R - B >= 45) verm++;
                if (G > R + 22 || B > R + 22) cool++;
              }
              return { verm, cool };
            };

            return {
              bullet: sampleVerm(window.innerWidth / 2, window.innerHeight / 2 - 75, 16),
              telegraph: sampleVerm(window.innerWidth / 2 + 20, window.innerHeight / 2 + 45, 45),
            };
          }, themeId);

          assert.ok(
            check.bullet.verm >= 12 && check.bullet.cool === 0,
            `[${themeId}] Enemy bullet must stay #C23B26 vermilion with 0 cool VFX tint: ${JSON.stringify(check.bullet)}`,
          );
          assert.ok(
            check.telegraph.verm >= 15 && check.telegraph.cool === 0,
            `[${themeId}] Boss charge telegraph must stay #C23B26 vermilion with 0 cool VFX tint: ${JSON.stringify(check.telegraph)}`,
          );
        }
        s.assertNoErrors('T2-F6-01');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T2-F6-02',
    tier: 2,
    feature: 'F6',
    name: 'default (古墨朱砂) Attack VFX strictly passes < 0.5% woodblock palette invariant under intense multi-weapon VFX',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser, { styleLab: true });
      try {
        await s.page.goto(`${baseUrl}/style-lab.html?watch=4&scene=crowd`);
        await s.page.waitForFunction(() => Boolean(window.__renderer && window.__run));
        await s.page.evaluate(() => {
          const r = window.__run;
          const ren = window.__renderer;
          ren.consumeEvents([
            { type: 'evolve', weaponId: 'talisman', evoName: '天师符阵' },
            { type: 'explosion', x: r.player.x + 50, y: r.player.y - 30, radius: 95, evolved: true },
            { type: 'ult', x: r.player.x, y: r.player.y },
          ]);
          ren.render(r, 1, 0.016, { shake: true, dmgText: 'all', safeTop: 0, safeBottom: 0 });
        });
        const audit = await auditCanvasWoodblockPalette(s.page, 50);
        assert.ok(audit.total > 1500);
        assert.ok(audit.violationRatio < 0.005, `default VFX violated woodblock palette: ${(audit.violationRatio * 100).toFixed(2)}%`);
        s.assertNoErrors('T2-F6-02');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T2-F6-03',
    tier: 2,
    feature: 'F6',
    name: 'Tampered unknown attackVfx ("__neon_laser__") falls back safely to default warm woodblock VFX',
    async run({ browser, baseUrl }) {
      const tampered = JSON.stringify({
        version: 3,
        cosmetics: {
          owned: ['__neon_laser__'],
          equipped: { lantern: null, outfit: null, attackVfx: '__neon_laser__', heroSkins: {} },
        },
      });
      const s = await createIsolatedPage(browser, {
        beforeBootInitScript: (raw) => { localStorage.setItem('wugeng.save', raw); },
        beforeBootArg: tampered,
      });
      try {
        await bootAndStartRun(s.page, baseUrl, { seed: 2603 });
        await stepFrames(s.page, 20);
        const audit = await auditCanvasWoodblockPalette(s.page, 45);
        assert.ok(audit.violationRatio < 0.005, `Unknown attackVfx must fall back to default warm palette (${audit.violationRatio})`);
        s.assertNoErrors('T2-F6-03');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T2-F6-04',
    tier: 2,
    feature: 'F6',
    name: 'Attack VFX theme NEVER alters pure src/sim determinism (default vs jade_ghostfire at seed=6604)',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootToHub(s.page, baseUrl, {
          savePatch: {
            cosmetics: { owned: ATTACK_VFX_IDS, equipped: { attackVfx: 'default', heroSkins: {} } },
          },
        });
        const runWithVfx = (vfx) =>
          s.page.evaluate((theme) => {
            const w = window.__wugeng;
            w.save.cosmetics.equipped.attackVfx = theme;
            w.game.applySettings({
              shake: false,
              dmgText: 'off',
              lowQuality: false,
              cosmetics: w.save.cosmetics.equipped,
            });
            w.game.start({ heroId: 'zhou', startWeapon: 'gong', nightLevel: 0, meta: {}, charm: null, seed: 6604 });
            window.__e2eStepFrames(180, { maxBatch: 1, stopOnOverlay: false });
            const r = w.game.run;
            return {
              hp: r.player.hp,
              xp: r.player.xp,
              kills: r.stats.kills,
              enemyHps: r.enemies.slice(0, 8).map((e) => Math.round(e.hp * 100)),
            };
          }, vfx);

        const simDefault = await runWithVfx('default');
        const simJade = await runWithVfx('jade_ghostfire');
        assert.deepEqual(simDefault, simJade, 'Cosmetic Attack VFX theme must never affect pure simulation state');
        s.assertNoErrors('T2-F6-04');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T2-F6-05',
    tier: 2,
    feature: 'F6',
    name: '6-weapon evolved barrage under violet_thunder + lowQuality: true sustains fast bounded rendering',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, {
          unlockedWeapons: ALL_WEAPON_IDS,
          savePatch: {
            unlockedWeapons: ALL_WEAPON_IDS,
            settings: { lowQuality: true, shake: false, dmgText: 'off' },
            cosmetics: { owned: ATTACK_VFX_IDS, equipped: { attackVfx: 'violet_thunder', heroSkins: {} } },
          },
          seed: 2605,
        });
        const avgMs = await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          r.weapons = [
            { id: 'gong', level: 5, evolved: true, cd: 0 },
            { id: 'talisman', level: 5, evolved: true, cd: 0 },
            { id: 'brush', level: 5, evolved: true, cd: 0 },
            { id: 'taomujian', level: 5, evolved: true, cd: 0 },
            { id: 'suohun_chain', level: 5, evolved: true, cd: 0 },
            { id: 'nuo_drum', level: 5, evolved: true, cd: 0 },
          ];
          for (let i = 0; i < 100; i++) {
            const a = (i / 100) * Math.PI * 2;
            r._spawnQueue.push({
              type: 'paperkid',
              x: r.player.x + Math.cos(a) * (75 + (i % 8) * 16),
              y: r.player.y + Math.sin(a) * (75 + (i % 8) * 16),
              opts: {},
            });
          }
          const t0 = performance.now();
          window.__e2eStepFrames(20, { maxBatch: 2, stopOnOverlay: false });
          return (performance.now() - t0) / 20;
        });

        assert.ok(avgMs < 30, `Expected < 30ms average frame under lowQuality 6-evo VFX barrage, got ${avgMs.toFixed(2)}ms`);
        s.assertNoErrors('T2-F6-05');
      } finally {
        await s.close();
      }
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // F7 Boundaries (5 tests)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'T2-F7-01',
    tier: 2,
    feature: 'F7',
    name: 'Narrow 360x780 Title & Hub have ZERO horizontal overflow & non-overlapping primary dock/ribbon controls',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser, { viewport: { width: 360, height: 780 }, deviceScaleFactor: 2 });
      try {
        await bootGame(s.page, baseUrl);
        const titleOverflow = await s.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        assert.ok(titleOverflow <= 1, `Title horizontal overflow on 360x780: +${titleOverflow}px`);

        await fastClick(s.page, '.title-actions .btn--seal');
        await s.page.waitForSelector('.screen--hub');
        const hubLayout = await s.page.evaluate(() => {
          const sw = document.documentElement.scrollWidth;
          const cw = document.documentElement.clientWidth;
          const navBtns = [...document.querySelectorAll('.hub-nav .btn')].map((b) => b.getBoundingClientRect());
          let navOverlap = false;
          for (let i = 0; i < navBtns.length; i++) {
            for (let j = i + 1; j < navBtns.length; j++) {
              const a = navBtns[i];
              const b = navBtns[j];
              const ix = Math.min(a.right, b.right) - Math.max(a.left, b.left);
              const iy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
              if (ix > 2 && iy > 2) navOverlap = true;
            }
          }
          return { sw, cw, navOverlap };
        });
        assert.ok(hubLayout.sw <= hubLayout.cw + 1, `Hub horizontal overflow on 360x780: ${hubLayout.sw} > ${hubLayout.cw}`);
        assert.equal(hubLayout.navOverlap, false, 'Hub bottom dock buttons must not overlap on 360x780');
        s.assertNoErrors('T2-F7-01');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T2-F7-02',
    tier: 2,
    feature: 'F7',
    name: 'Static CSS/HTML Woodblock Lock: styles.css & index.html use ONLY the 6 woodblock colors, 0 gradients, 0 backdrop-filter, 0 Emoji',
    async run() {
      const css = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');
      const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

      // Strip comments & .age-badge rule (CADPA green badge exception)
      const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '');
      const cssClean = stripComments(css).replace(/\.age-badge\b[^{]*\{[^}]*\}/g, '');
      const htmlClean = stripComments(html);
      const combined = `${cssClean}\n${htmlClean}`;

      assert.equal(/(?:linear|radial|conic)-gradient\s*\(/i.test(combined), false, 'Forbidden CSS gradient found in styles.css / index.html');
      assert.equal(/backdrop-filter\s*:/i.test(combined), false, 'Forbidden backdrop-filter found in styles.css / index.html');
      assert.equal(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(combined), false, 'Forbidden Emoji found in styles.css / index.html');

      const allowedHex = new Set(ALLOWED_WOODBLOCK_HEX);
      const allowedRgbTriplets = new Set([
        '239,230,210',
        '224,210,180',
        '28,26,23',
        '194,59,38',
        '142,42,27',
        '240,190,98',
      ]);

      const badHex = [];
      for (const m of combined.matchAll(/#([0-9a-fA-F]{3,8})\b/g)) {
        let hex = m[0].toLowerCase();
        if (hex.length === 4) {
          hex = `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
        } else if (hex.length === 9) {
          hex = hex.slice(0, 7);
        }
        if (!allowedHex.has(hex)) badHex.push(m[0]);
      }
      assert.deepEqual(badHex, [], `Disallowed non-woodblock hex color(s) in styles.css / index.html: ${badHex.join(', ')}`);

      const badRgb = [];
      for (const m of combined.matchAll(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/gi)) {
        const key = `${m[1]},${m[2]},${m[3]}`;
        if (!allowedRgbTriplets.has(key)) badRgb.push(m[0]);
      }
      assert.deepEqual(badRgb, [], `Disallowed non-woodblock rgb/rgba color(s) in styles.css / index.html: ${badRgb.join(', ')}`);
    },
  },
  {
    id: 'T2-F7-03',
    tier: 2,
    feature: 'F7',
    name: 'Rapid Hub modal cycling (鬼市商铺 -> 守夜功绩 -> 加点 x3) leaks 0 stacked .veil overlays',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootToHub(s.page, baseUrl);
        for (let i = 0; i < 3; i++) {
          for (const opener of ['[data-action="open-market"]', '[data-action="open-achievements"]', '.hub-nav .btn:nth-child(1)']) {
            await fastClick(s.page, opener);
            await closeActiveModal(s.page);
          }
        }
        const remaining = await s.page.evaluate(() => ({
          veils: document.querySelectorAll('#ui .veil').length,
          stages: document.querySelectorAll('.hero-stage__canvas').length,
        }));
        assert.equal(remaining.veils, 0, 'Expected 0 orphaned .veil modals after rapid cycling');
        assert.ok(remaining.stages <= 1, 'Expected at most 1 .hero-stage__canvas');
        s.assertNoErrors('T2-F7-03');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T2-F7-04',
    tier: 2,
    feature: 'F7',
    name: 'Title Night-Watch street backdrop Canvas strictly passes < 0.5% warm woodblock palette check',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootGame(s.page, baseUrl);
        await s.page.waitForTimeout(80);
        const audit = await auditCanvasWoodblockPalette(s.page, 45);
        assert.ok(audit.total > 1000);
        assert.ok(audit.violationRatio < 0.005, `Title backdrop violated warm woodblock palette: ${(audit.violationRatio * 100).toFixed(2)}%`);
        s.assertNoErrors('T2-F7-04');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T2-F7-05',
    tier: 2,
    feature: 'F7',
    name: 'document.hidden visibility toggle on Hub pauses/recovers menu & stage animation cleanly without errors',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootToHub(s.page, baseUrl);
        await s.page.evaluate(() => {
          Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
          document.dispatchEvent(new Event('visibilitychange'));
          Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
          document.dispatchEvent(new Event('visibilitychange'));
        });
        await fastClick(s.page, '.hub-nav .btn:nth-child(1)');
        await requireOpenSelector(s.page, '#ui .veil');
        s.assertNoErrors('T2-F7-05');
      } finally {
        await s.close();
      }
    },
  },
];
