// Tier 4: Realistic End-User Application Journeys (12 full scenarios: T4-S01..T4-S12)
// STRICT OPAQUE-BOX: ZERO imports from ../../src/**.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  ALL_ENEMY_IDS,
  ALL_RELIC_IDS,
  ALL_WEAPON_IDS,
  ATTACK_VFX_IDS,
  BASELINE_MAIN_COMMIT,
  CODEX_TOTAL,
  DEFAULT_UNLOCKED_WEAPON_IDS,
  HERO_IDS,
  HERO_SIGNATURE_WEAPONS,
  PRIMARY_LEADERBOARD_ID,
  REGULAR_ENEMY_IDS,
  TAPTAP,
} from './contracts.mjs';
import {
  ROOT,
  VENV_PYTHON,
  analyzeCanvasSpriteBox,
  auditCanvasWoodblockPalette,
  bootAndStartRun,
  bootColdIntro,
  bootToHub,
  closeActiveModal,
  confirmChestModal,
  createCoopPages,
  createIsolatedPage,
  engageInspectorPeek,
  execFileAsync,
  extractH5ZipToScratch,
  fastClick,
  grantItemViaLevelUp,
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
  triggerLethalHit,
  triggerLevelUp,
} from './harness.mjs';
import { discoverCoopHeroSkins, launchTwoPageCoopRun } from './tier1-f8-f15.mjs';

export const TIER4_TESTS = [
  {
    id: 'T4-S01',
    tier: 4,
    feature: 'F1',
    features: ['F1', 'F2', 'F3', 'F4', 'F7', 'F10', 'F12', 'F13'],
    timeoutMs: 24_000,
    name: '390×844 Full Cold-Boot v3 Solo Journey (Studio Splash -> CADPA/Privacy -> Hub Affinity -> 6+6 + Banish + Inspector + Blessing + Shrine + Evo -> Youshen Dawn Clear -> Leaderboard -> Night 1)',
    async run({ browser, baseUrl }) {
      const s = await bootColdIntro(browser, baseUrl, { query: 'mockLeaderboard=1' });
      try {
        assert.ok(s.elapsedMs >= 3000 && s.elapsedMs < 6500, `Expected cold splash to linger 3000..6500ms, got ${Math.round(s.elapsedMs)}ms`);

        await fastClick(s.page, '.age-badge');
        await fastClick(s.page, '#ui .veil .btn--seal');
        await fastClick(s.page, '.title-foot .link-btn');
        await s.page.waitForSelector('.privacy-body');
        const privTxt = (await s.page.textContent('.privacy-body')) || '';
        assert.ok(privTxt.includes('剑清酱工作室') && privTxt.includes('排行榜'));
        await fastClick(s.page, '#ui .veil .btn--seal');

        await fastClick(s.page, '.title-actions .btn--seal');
        await s.page.waitForSelector('.screen--hub');
        await s.page.evaluate((allW) => {
          window.__wugeng.save.coins = 500;
          window.__wugeng.save.unlockedWeapons = [...allW];
          window.__wugeng.save.charms = [{ relicId: 'strawshoes' }];
          window.__wugeng.showHub();
        }, ALL_WEAPON_IDS);

        await fastClick(s.page, '[data-hero-id="zhou"]');
        await fastClick(s.page, '[data-starter-weapon="gong"]');
        await requireOpenSelector(s.page, '.signature-badge');

        await fastClick(s.page, '.hub-nav .btn:nth-child(1)');
        await fastClick(s.page, '.shop-row .btn--small');
        await fastClick(s.page, '#ui .veil .btn--ghost');

        await fastClick(s.page, '.charm-pick');
        await fastClick(s.page, '.hub-foot .btn--seal, .btn--big');
        await stepFrames(s.page, 4);
        assert.equal(await s.page.evaluate(() => window.__wugeng.game.run.relics[0]?.id), 'strawshoes');

        // Levelup: banish 1 slip, inspect loadout via .veil--inspector, then pick .qian
        await triggerLevelUp(s.page);
        await requireOpenSelector(s.page, '.selection-owned-bar');
        const banishBtn = s.page.locator('.qian >> nth=2 >> [data-action="banish"]');
        if (await banishBtn.count() > 0) await banishBtn.first().click();
        else {
          await fastClick(s.page, '[data-action="banish"]');
          await s.page.evaluate(() => document.querySelectorAll('.qian')[2]?.click());
        }
        await fastClick(s.page, '[data-action="inspect-loadout"]');
        await requireOpenSelector(s.page, '.veil--inspector');
        await fastClick(s.page, '[data-action="close-inspector"]');
        await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          if (Array.isArray(r?.choices) && r.choices.length) {
            r.choices[0] = { kind: 'relic', id: 'strawshoes', level: 2, isNew: false, evolvable: false };
          }
        });
        await fastClick(s.page, '.qian');

        // Expand toward 6+6 & 3pc zhenhun
        await grantItemViaLevelUp(s.page, 'weapon', 'gong', 4);
        for (const wid of ['soulbanner', 'suohun_chain', 'nuo_drum', 'talisman', 'compass']) {
          await grantItemViaLevelUp(s.page, 'weapon', wid, 1);
        }
        for (const rid of ['yinpai', 'wuse_mask', 'cinnabar', 'bagua', 'censer']) {
          await grantItemViaLevelUp(s.page, 'relic', rid, 1);
        }

        // 84s Watch Blessing
        await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          r.enemies.length = 0;
          r._spawnAcc = -99999;
          r.time = 83.97;
          window.__e2eStepFrames(4);
        });
        assert.equal(await s.page.evaluate(() => window.__wugeng.game.run.choiceMode), 'blessing');
        await fastClick(s.page, '.qian');

        // World Shrine
        await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          const altar = r.shrines.find((x) => x.kind === 'altar' && !x.used) || r.shrines.find((x) => !x.used);
          if (altar) {
            r.player.x = altar.x;
            r.player.y = altar.y;
          }
          window.__e2eStepFrames(3);
        });
        await fastClick(s.page, '[data-action="interact-shrine"]');
        await fastClick(s.page, '.overlay--shrine [data-shrine-option]:not([disabled])');
        if (await s.page.evaluate(() => window.__wugeng.overlay === 'levelup')) {
          await fastClick(s.page, '.qian');
        }

        if (!(await s.page.evaluate(() => window.__wugeng.game.run.weapons.find((w) => w.id === 'gong')?.evolved))) {
          await triggerChest(s.page);
          await confirmChestModal(s.page, 'gong');
        }
        assert.equal(await s.page.evaluate(() => window.__wugeng.game.run.weapons.find((w) => w.id === 'gong')?.evolved), true);

        // Defeat Youshen at 420s -> Dawn Clear -> Endless -> Settle
        await suppressWardersInPage(s.page);
        await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          r.enemies.length = 0;
          r._spawnAcc = -99999;
          r._bossSpawned = { horse: true, umbrella: true, youshen: false };
          r.time = 421;
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
        assert.equal(await s.page.evaluate(() => window.__wugeng.overlay), 'cleared');
        await s.page.click('text=继续守夜');
        assert.equal(await s.page.evaluate(() => window.__wugeng.game.run.mode), 'endless');

        await triggerLethalHit(s.page);
        await s.page.click('text=不了，结算');
        await s.page.waitForSelector('.screen--result.is-dawn');
        await requireOpenSelector(s.page, '.screen--result .result-score');

        await s.page.click('text=回更房');
        await s.page.waitForSelector('.screen--hub');
        const hubProgress = await s.page.evaluate(() => ({
          clears: window.__wugeng.save.stats.clears,
          nightUnlocked: window.__wugeng.save.nightUnlocked,
          bestScore: window.__wugeng.save.leaderboard?.bestScore || 0,
        }));
        assert.ok(hubProgress.clears >= 1);
        assert.ok(hubProgress.nightUnlocked >= 1);
        assert.ok(hubProgress.bestScore > 0);
        s.assertNoErrors('T4-S01');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T4-S02',
    tier: 4,
    feature: 'F10',
    features: ['F3', 'F7', 'F10', 'F11'],
    name: '360×780 Narrow Mobile 6+6 Responsive Layout + Loadout Inspector 透视战场 + Solo Visibility Auto-Pause + Cloud Flush',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser, {
        viewport: { width: 360, height: 780 },
        deviceScaleFactor: 2,
      });
      try {
        await bootAndStartRun(s.page, baseUrl, {
          query: 'mockCloud=1',
          unlockedWeapons: ALL_WEAPON_IDS,
          savePatch: { coins: 300, unlockedWeapons: ALL_WEAPON_IDS },
          seed: 4002,
        });
        for (const wid of ['bell', 'talisman', 'compass', 'suohun_chain', 'nuo_drum']) {
          await grantItemViaLevelUp(s.page, 'weapon', wid, 1);
        }
        for (const rid of ['clapper', 'cinnabar', 'redstring', 'bagua', 'yinpai', 'wuse_mask']) {
          await grantItemViaLevelUp(s.page, 'relic', rid, 1);
        }

        await triggerLevelUp(s.page);
        const levelupFit = await s.page.evaluate(() => {
          const r = document.querySelector('.overlay--levelup').getBoundingClientRect();
          return { left: r.left, right: r.right, vw: window.innerWidth };
        });
        assert.ok(levelupFit.left >= -1 && levelupFit.right <= levelupFit.vw + 1);

        await fastClick(s.page, '[data-action="inspect-loadout"]');
        const peek = await engageInspectorPeek(s.page);
        assert.ok(peek.state.effectiveOpacity <= 0.45);
        await releaseInspectorPeek(s.page, peek.mode);
        await fastClick(s.page, '[data-action="close-inspector"]');
        await fastClick(s.page, '.qian');

        // Solo visibilitychange MUST auto-pause, suspend WebAudio, and flush dirty save
        await s.page.evaluate(() => {
          window.__wugeng.save.coins = 456;
          window.__wugeng.cloud.scheduleSync(window.__wugeng.save);
          Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
          document.dispatchEvent(new Event('visibilitychange'));
        });
        await s.page.waitForFunction(() => window.__wugeng.overlay === 'pause');
        const bgCheck = await s.page.evaluate(() => ({
          paused: window.__wugeng.game.isPaused(),
          audioMuted: window.__wugeng.audio.play('gong'),
          savedLocalCoins: JSON.parse(localStorage.getItem('wugeng.save') || '{}').coins,
        }));
        assert.equal(bgCheck.paused, true);
        assert.equal(bgCheck.audioMuted, false);
        assert.equal(bgCheck.savedLocalCoins, 456);

        await s.page.evaluate(() => {
          Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
          document.dispatchEvent(new Event('visibilitychange'));
        });
        await s.page.click('text=接着守');
        assert.equal(await s.page.evaluate(() => window.__wugeng.overlay), null);
        s.assertNoErrors('T4-S02');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T4-S03',
    tier: 4,
    feature: 'F12',
    features: ['F7', 'F8', 'F12', 'F13'],
    name: '100% Offline Ordinary Browser Journey (window.tap === undefined, 0 Ads, Local Honor Board, Invite Fallback & Retry)',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser, { isolated: true });
      try {
        await bootToHub(s.page, baseUrl);
        await fastClick(s.page, '.hub-nav .btn:nth-child(3)');
        assert.equal(await s.page.locator('.btn--ad').count(), 0);
        await fastClick(s.page, '#ui .veil .btn--seal');
        await fastClick(s.page, '#ui .veil .btn--ghost');

        // Offline local leaderboard
        await fastClick(s.page, '[data-action="open-leaderboard"]');
        await requireOpenSelector(s.page, '.leaderboard-modal');
        await closeActiveModal(s.page, 'close-leaderboard');

        // Offline co-op invite fallback
        await fastClick(s.page, '[data-action="open-coop"]');
        await fastClick(s.page, '[data-action="coop-create"]');
        await fastClick(s.page, '[data-action="coop-invite-friend"]');
        await s.page.evaluate(() => {
          window.__wugeng.coop?.leave?.();
          window.__wugeng.coop?.close?.();
        });
        await closeActiveModal(s.page, 'close-coop');

        await fastClick(s.page, '.hub-foot .btn--seal, .btn--big');
        await stepFrames(s.page, 3);
        await s.page.evaluate(() => {
          window.__wugeng.game.run.time = 90;
          window.__wugeng.game.run.rerolls.free = 0;
        });
        await triggerLevelUp(s.page);
        assert.equal(await s.page.locator('.btn--ad').count(), 0);
        await fastClick(s.page, '.qian');

        await triggerLethalHit(s.page);
        assert.equal(await s.page.locator('.btn--ad').count(), 0);
        await s.page.evaluate(() => {
          const btns = [...document.querySelectorAll('.veil button')];
          (btns.find((b) => b.textContent.includes('结算')) || btns[btns.length - 1])?.click();
        });
        await s.page.waitForSelector('.screen--result');
        assert.equal(await s.page.locator('.btn--ad').count(), 0);
        await s.page.evaluate(() => {
          const btns = [...document.querySelectorAll('.screen--result button')];
          (btns.find((b) => b.textContent.includes('再守')) || btns[0])?.click();
        });
        await s.page.waitForFunction(() => window.__wugeng.game.run?.status === 'playing');
        s.assertNoErrors('T4-S03');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T4-S04',
    tier: 4,
    feature: 'F8',
    features: ['F5', 'F6', 'F8', 'F9', 'F11'],
    timeoutMs: 20_000,
    name: 'Achievement Unlock (taomujian/skin) -> Ghost-Market Copper Shop (violet_thunder VFX) -> Live Combat Render -> Cloud v3 Anti-Dupe',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser, { isolated: true });
      try {
        await bootToHub(s.page, baseUrl, {
          query: 'mockCloud=1',
          savePatch: {
            coins: 4000,
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
        await s.page.evaluate(async () => {
          window.__wugeng.save.updatedAt = 1700000100000;
          await window.__wugeng.cloud.uploadNow(window.__wugeng.save);
        });

        // 1) Claim achievements
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

        // 2) Buy copper skin + violet_thunder VFX in Ghost-Market Shop
        await fastClick(s.page, '[data-action="open-market"]');
        await requireOpenSelector(s.page, '.cosmetic-shop-modal');
        const buySkin = await shopBuyAndEquipInModal(s.page, {
          kind: 'skin',
          heroId: 'zhou',
          targetIdx: 1,
          buy: true,
          equip: true,
          close: false,
        });
        assert.equal(buySkin.ok, true, buySkin.reason || 'Failed buying copper skin in T4-S04');
        const buyVt = await shopBuyAndEquipInModal(s.page, {
          kind: 'vfx',
          vfxId: 'violet_thunder',
          buy: true,
          equip: true,
          close: true,
        });
        assert.equal(buyVt.ok, true, buyVt.reason || 'Failed buying violet_thunder in T4-S04');

        const coinsBeforeSync = await s.page.evaluate(() => window.__wugeng.save.coins);
        await fastClick(s.page, '[data-starter-weapon="taomujian"]');
        await fastClick(s.page, '.hub-foot .btn--seal, .btn--big');
        await stepFrames(s.page, 2);

        await s.page.evaluate(async () => {
          const r = window.__wugeng.game.run;
          r.darkness = 0;
          r.projectiles.push({
            id: 995, kind: 'gongPulse', x: r.player.x, y: r.player.y,
            r: 64, radius: 64, maxRadius: 84, t: 0.12, life: 0.35, evolved: true, attackVfx: 'violet_thunder',
          });
          window.__wugeng.game.pause();
          await new Promise((res) => requestAnimationFrame(res));
        });
        const snap = await analyzeCanvasSpriteBox(s.page, '#game-canvas');
        assert.ok(snap.hueBuckets.violet >= 25, `Expected violet_thunder VFX pixels >= 25, got ${snap.hueBuckets.violet}`);

        // Cloud pull merge must not duplicate copper
        const mergedCoins = await s.page.evaluate(async () => {
          window.__wugeng.save.updatedAt = 1700000100000;
          const p = await window.__wugeng.cloud.pullFromCloud(window.__wugeng.save);
          return (p?.merged || window.__wugeng.save).coins;
        });
        assert.equal(mergedCoins, coinsBeforeSync);
        s.assertNoErrors('T4-S04');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T4-S05',
    tier: 4,
    feature: 'F4',
    features: ['F3', 'F4', 'F5', 'F6'],
    timeoutMs: 18_000,
    name: '300 Mixed 9-Type Enemies + 400 Mixed 16-Weapon Projectiles + Mineral VFX Steady-State Render Stress',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, {
          savePatch: {
            cosmetics: { owned: ATTACK_VFX_IDS, equipped: { attackVfx: 'jade_ghostfire', heroSkins: {} } },
          },
          seed: 4005,
        });
        const perf = await s.page.evaluate(async ({ enemyTypes }) => {
          const g = window.__wugeng.game;
          const r = g.run;
          r.enemies.length = 0;
          r._spawnAcc = -99999;
          r._nextWaveT = 99999;
          r.weapons.forEach((w) => { w.cd = 9999; });
          for (let i = 0; i < 300; i++) {
            const a = (i / 300) * Math.PI * 2;
            const d = 55 + (i % 15) * 18;
            r._spawnQueue.push({
              type: enemyTypes[i % enemyTypes.length],
              x: r.player.x + Math.cos(a) * d,
              y: r.player.y + Math.sin(a) * d,
              opts: { elite: i % 20 === 0 },
            });
          }
          window.__e2eStepFrames(1);
          g.pause();

          const projKinds = [
            'talisman', 'talismanChain', 'talismanArray', 'coinsword', 'paperman',
            'firecracker', 'inkWave', 'compassField', 'soulSweep', 'mirrorBeam', 'paperHorse', 'thunderBolt',
          ];
          r.projectiles.length = 0;
          for (let i = 0; i < 400; i++) {
            const a = (i / 400) * Math.PI * 2;
            const kind = projKinds[i % projKinds.length];
            const sx = r.player.x + Math.cos(a) * (35 + (i % 18) * 12);
            const sy = r.player.y + Math.sin(a) * (35 + (i % 18) * 12);
            const endX = r.player.x + Math.cos(a + 0.3) * 195;
            const endY = r.player.y + Math.sin(a + 0.3) * 195;
            r.projectiles.push({
              id: 70000 + i,
              kind,
              x: sx,
              y: sy,
              x2: endX,
              y2: endY,
              endX,
              endY,
              fromX: r.player.x,
              fromY: r.player.y,
              toX: endX,
              toY: endY,
              points: [{ x: sx, y: sy }, { x: endX, y: endY }],
              length: 195,
              width: 22,
              hitR: 18,
              vx: Math.cos(a) * 180,
              vy: Math.sin(a) * 180,
              r: 14,
              radius: 42,
              maxRadius: 80,
              angle: a,
              spread: 1.2,
              t: 0.18,
              life: 2.0,
              evolved: true,
            });
          }

          await new Promise((res) => requestAnimationFrame(res));
          await new Promise((res) => requestAnimationFrame(res));

          const deltas = [];
          for (let f = 0; f < 18; f++) {
            const t0 = performance.now();
            await new Promise((res) => requestAnimationFrame(res));
            deltas.push(performance.now() - t0);
          }
          deltas.sort((x, y) => x - y);
          return {
            enemies: r.enemies.length,
            distinctEnemyTypes: new Set(r.enemies.map((e) => e.type)).size,
            projectiles: r.projectiles.length,
            p50: deltas[Math.floor(deltas.length / 2)],
          };
        }, { enemyTypes: REGULAR_ENEMY_IDS });

        assert.equal(perf.enemies, 300);
        assert.equal(perf.distinctEnemyTypes, REGULAR_ENEMY_IDS.length);
        assert.equal(perf.projectiles, 400);
        assert.ok(perf.p50 < 400, `Expected p50 < 400ms, got ${perf.p50.toFixed(1)}ms`);
        s.assertNoErrors('T4-S05');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T4-S06',
    tier: 4,
    feature: 'F2',
    features: ['F2', 'F3', 'F9'],
    timeoutMs: 18_000,
    name: 'All 6 Watchman Heroes (zhou, mian, daotong, yinyang, tiejiang, nuoxi) Unlock, Starter Affinity & Signature Ultimates Tour',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        // 1) Verify classic hero unlock superset after 850-kill 500s 0-bun run
        await bootAndStartRun(s.page, baseUrl, { heroId: 'zhou', seed: 4006 });
        await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          r.time = 500;
          r.stats.kills = 850;
          r.stats.bunsEaten = 0;
          r.stats.firstBunTime = null;
          window.__wugeng.game.finish();
        });
        await s.page.waitForSelector('.screen--result');
        const unlockedAfterRun = await s.page.evaluate(() => window.__wugeng.save.unlockedHeroes);
        for (const baseHero of ['zhou', 'mian', 'daotong']) {
          assert.ok(unlockedAfterRun.includes(baseHero), `Expected ${baseHero} unlocked`);
        }

        // 2) Full 6-hero Hub selection, signature badge & HUD Ult Gong tour
        await bootToHub(s.page, baseUrl, {
          savePatch: { unlockedHeroes: HERO_IDS, unlockedWeapons: ALL_WEAPON_IDS },
        });
        for (const hid of HERO_IDS) {
          const sigW = HERO_SIGNATURE_WEAPONS[hid];
          await fastClick(s.page, `[data-hero-id="${hid}"]`);
          await fastClick(s.page, `[data-starter-weapon="${sigW}"]`);
          await requireOpenSelector(s.page, '.signature-badge');

          await fastClick(s.page, '.hub-foot .btn--seal, .btn--big');
          await stepFrames(s.page, 2);
          await s.page.evaluate(() => {
            const r = window.__wugeng.game.run;
            r.enemies.length = 0;
            r._spawnAcc = -99999;
            r._spawnQueue.push({ type: 'sedan', x: r.player.x + 70, y: r.player.y, opts: {} });
            window.__e2eStepFrames(1);
            r.enemies[0].hp = 9999;
            r.enemies[0].speed = 0;
            r.player.ult = r.player.ultMax;
          });
          await s.page.mouse.click(334, 788);
          const cast = await s.page.evaluate(() => {
            window.__e2eStepFrames(12);
            const u = window.__wugeng.game.run.stats.ultsCast;
            window.__wugeng.game.finish();
            window.__wugeng.game.clear();
            window.__wugeng.showHub();
            return u;
          });
          await s.page.waitForSelector('.screen--hub');
          assert.equal(cast, 1, `Expected HUD Ult Gong to trigger ${hid} signature Ultimate`);
        }
        s.assertNoErrors('T4-S06');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T4-S07',
    tier: 4,
    feature: 'F5',
    features: ['F5', 'F6', 'F7', 'F15'],
    timeoutMs: 20_000,
    name: 'style-lab.html Complete Visual Audit (Watches 1..6 Woodblock Palette + ?scene=skins 18 Skins + ?scene=vfx 5 VFX Themes)',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser, { styleLab: true });
      try {
        await s.page.goto(`${baseUrl}/style-lab.html?scene=sheet`);
        await s.page.waitForFunction(() => window.__ready === true);
        assert.equal(await s.page.evaluate(() => document.fonts.check('16px "WenKai"', '五更天')), true);
        const sheetAudit = await auditCanvasWoodblockPalette(s.page, 45);
        assert.ok(sheetAudit.violationRatio < 0.005);

        const lumaByWatch = {};
        for (const w of [1, 5, 6]) {
          await s.page.goto(`${baseUrl}/style-lab.html?watch=${w}&scene=crowd`);
          await s.page.waitForFunction(() => Boolean(window.__renderer && window.__run));
          lumaByWatch[w] = await s.page.evaluate(() => {
            const c = document.getElementById('game-canvas');
            const ctx = c.getContext('2d');
            const r = window.__run;
            r.props.length = 0;
            r.enemies.length = 0;
            r.pickups.length = 0;
            r.projectiles.length = 0;
            if (Array.isArray(r.shrines)) r.shrines.length = 0;
            window.__renderer.render(r, 1, 0.016, { shake: false, dmgText: 'off', safeTop: 0, safeBottom: 0 });
            const p = ctx.getImageData(16, 140, 32, 32).data;
            let sum = 0;
            for (let i = 0; i < p.length; i += 4) sum += p[0] + p[1] + p[2];
            return sum / (p.length / 4);
          });
          const pal = await auditCanvasWoodblockPalette(s.page, 40);
          assert.ok(pal.violationRatio < 0.005, `Palette violation at watch=${w}: ${pal.violationRatio}`);
        }
        assert.ok(lumaByWatch[1] > lumaByWatch[5] + 25);
        assert.ok(lumaByWatch[6] > lumaByWatch[5] + 60);

        // ?scene=skins & ?scene=vfx
        await s.page.goto(`${baseUrl}/style-lab.html?scene=skins`);
        await s.page.waitForFunction(() => window.__ready === true, null, { timeout: 6000 });
        const skinSnap = await analyzeCanvasSpriteBox(s.page, '#game-canvas');
        assert.ok(skinSnap && skinSnap.nonBgPixels > 1000);

        await s.page.goto(`${baseUrl}/style-lab.html?scene=vfx`);
        await s.page.waitForFunction(() => window.__ready === true, null, { timeout: 6000 });
        const vfxSnap = await analyzeCanvasSpriteBox(s.page, '#game-canvas');
        assert.ok(vfxSnap && vfxSnap.nonBgPixels > 1000);
        assert.deepEqual(s.badResponses, []);
        s.assertNoErrors('T4-S07');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T4-S08',
    tier: 4,
    feature: 'F11',
    features: ['F2', 'F3', 'F11', 'F15'],
    name: 'Complete 66-Entry 百物谱 Codex Tour (16W + 16Evo + 16R + 12Enemies + 6Heroes = 66 / 66) & Font Glyph Audit',
    async run({ browser, baseUrl }) {
      const allEnemyKills = Object.fromEntries(ALL_ENEMY_IDS.map((id, idx) => [id, idx + 1]));
      const s = await createIsolatedPage(browser);
      try {
        await bootToHub(s.page, baseUrl, {
          savePatch: {
            unlockedHeroes: HERO_IDS,
            codex: {
              weapons: ALL_WEAPON_IDS,
              evolutions: ALL_WEAPON_IDS,
              relics: ALL_RELIC_IDS,
              enemies: allEnemyKills,
            },
          },
        });
        await fastClick(s.page, '.hub-nav .btn:nth-child(2)');
        await requireOpenSelector(s.page, '.codex');
        const subText = (await s.page.textContent('.codex .scroll__sub')) || '';
        assert.ok(subText.includes(`${CODEX_TOTAL} / ${CODEX_TOTAL}`), `Expected '66 / 66' in 百物谱 header, got: ${subText}`);

        let allCodexText = subText;
        for (let t = 0; t < 5; t++) {
          await s.page.evaluate((idx) => document.querySelectorAll('.codex-tab')[idx]?.click(), t);
          const lockedRows = await s.page.locator('.codex-list > .codex-row:not(.codex-row--ach).is-locked').count();
          assert.equal(lockedRows, 0, `Expected 0 locked rows in tab #${t} when all 66 entries are unlocked`);
          allCodexText += '\n' + ((await s.page.textContent('.codex-list')) || '');
        }

        const fontPath = path.join(ROOT, 'assets', 'fonts', 'wenkai-subset.woff2');
        const { stdout } = await execFileAsync(
          VENV_PYTHON,
          [
            '-c',
            'import json, sys; from fontTools.ttLib import TTFont; cmap = set(TTFont(sys.argv[1]).getBestCmap().keys()); txt = sys.argv[2]; miss = sorted({f"U+{ord(c):04X}({c})" for c in txt if not c.isspace() and ord(c) >= 0x20 and ord(c) not in cmap}); print(json.dumps(miss, ensure_ascii=False))',
            fontPath,
            allCodexText,
          ],
          { cwd: ROOT, timeout: 10_000 },
        );
        assert.deepEqual(JSON.parse(stdout.trim()), [], 'Every character in unlocked 66-entry 百物谱 must exist in wenkai-subset.woff2');
        s.assertNoErrors('T4-S08');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T4-S09',
    tier: 4,
    feature: 'F14',
    features: ['F12', 'F13', 'F14', 'F5', 'F6'],
    timeoutMs: 26_000,
    name: 'MANDATORY Real 2-Page Shared-BrowserContext BroadcastChannel Co-op + Friend Share + Daoist Bot + Bagua Revive + MVP + Leaderboard Journey',
    async run({ browser, baseUrl }) {
      const coop = await createCoopPages(browser, 2, {
        beforeBootInitScript: () => {
          window.__t4SharePayloads = [];
          window.__t4LbSubmits = [];
          window.tap = {
            shareAppMessage(p) {
              window.__t4SharePayloads.push(p);
              p?.success?.({});
            },
            showShareboard(p) {
              window.__t4SharePayloads.push(p);
              p?.success?.({});
            },
            openFriendList(p) {
              p?.success?.({});
            },
            getLeaderboardManager() {
              return {
                submitScores(p) {
                  window.__t4LbSubmits.push(p?.scores || []);
                  p?.callback?.onSuccess?.({ results: [] });
                },
                loadLeaderboardScores(p) {
                  p?.callback?.onSuccess?.({
                    scores: [{ rank: 1, score: 68_000, user: { name: '五更魁首' } }],
                  });
                },
                loadCurrentPlayerLeaderboardScore(p) {
                  p?.callback?.onSuccess?.({
                    currentUserScore: { rank: 2, score: 15_000, user: { name: '守夜房主' } },
                  });
                },
                openLeaderboard(p) {
                  p?.callback?.onSuccess?.({});
                },
              };
            },
          };
        },
      });
      try {
        const { hostSkin, guestSkin } = await discoverCoopHeroSkins(coop.hostPage, baseUrl, 'zhou', 'nuoxi', 'mockFriends=1');
        let sharedBeforeStart = [];
        const { roomCode } = await launchTwoPageCoopRun(coop, baseUrl, {
          query: 'mockFriends=1',
          hostHero: 'zhou',
          hostSkin,
          hostVfx: 'jade_ghostfire',
          guestHero: 'nuoxi',
          guestSkin,
          guestVfx: 'violet_thunder',
          botCount: 1, // Host + Guest + 1 Daoist AI Bot = 3 players!
          onRoomCreated: async () => {
            await fastClick(coop.hostPage, '[data-action="coop-invite-friend"]', 'Expected [data-action="coop-invite-friend"] in T4-S09');
            sharedBeforeStart = await coop.hostPage.evaluate(() => window.__t4SharePayloads || []);
          },
        });
        assert.match(roomCode, /^[A-Z0-9]{4,8}$/i);
        assert.ok(sharedBeforeStart.length >= 1, 'Expected [data-action="coop-invite-friend"] to invoke TapTap share API');
        assert.ok(
          JSON.stringify(sharedBeforeStart[0]).includes(`room=${roomCode}`),
          `Expected friend share payload to carry room=${roomCode}: ${JSON.stringify(sharedBeforeStart[0])}`,
        );

        const initial = await Promise.all([
          coop.hostPage.evaluate(() => ({
            peerId: sessionStorage.getItem('wugeng.peerId'),
            playerCount: window.__wugeng.game.run.players.length,
            players: window.__wugeng.game.run.players.map((p) => ({
              heroId: p.heroId,
              skinId: p.skinId,
              attackVfx: p.attackVfx,
            })),
          })),
          coop.guestPage.evaluate(() => ({
            peerId: sessionStorage.getItem('wugeng.peerId'),
            playerCount: window.__wugeng.game.run.players.length,
            players: window.__wugeng.game.run.players.map((p) => ({
              heroId: p.heroId,
              skinId: p.skinId,
              attackVfx: p.attackVfx,
            })),
          })),
        ]);
        assert.notEqual(initial[0].peerId, initial[1].peerId);
        assert.equal(initial[0].playerCount, 3, 'Expected 3 active players (Host + Guest + Bot)');
        assert.equal(initial[1].playerCount, 3);
        for (const [tabName, side] of [['hostPage', initial[0]], ['guestPage', initial[1]]]) {
          assert.equal(side.players[0].heroId, 'zhou', `[${tabName}] Expected players[0].heroId === 'zhou'`);
          assert.equal(side.players[1].heroId, 'nuoxi', `[${tabName}] Expected players[1].heroId === 'nuoxi'`);
          assert.equal(side.players[0].skinId, hostSkin, `[${tabName}] Expected players[0].skinId === '${hostSkin}'`);
          assert.equal(side.players[1].skinId, guestSkin, `[${tabName}] Expected players[1].skinId === '${guestSkin}'`);
          assert.notEqual(side.players[0].skinId, side.players[1].skinId, `[${tabName}] Expected distinct non-default skins`);
          assert.equal(side.players[0].attackVfx, 'jade_ghostfire', `[${tabName}] Expected players[0].attackVfx === 'jade_ghostfire'`);
          assert.equal(side.players[1].attackVfx, 'violet_thunder', `[${tabName}] Expected players[1].attackVfx === 'violet_thunder'`);
        }

        // Verify Guest movement sync & document.hidden non-freeze
        const x0 = await coop.hostPage.evaluate(() => {
          const r = window.__wugeng.game.run;
          r.enemies.length = 0;
          r._spawnAcc = -99999;
          return r.players[1].x;
        });
        await coop.guestPage.keyboard.down('KeyD');
        await stepCoopFrames([coop.hostPage, coop.guestPage], 30, 6, { preserveInput: true });
        await coop.guestPage.keyboard.up('KeyD');
        const x1 = await coop.hostPage.evaluate(() => {
          Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
          document.dispatchEvent(new Event('visibilitychange'));
          return { x: window.__wugeng.game.run.players[1].x, paused: window.__wugeng.game.isPaused() };
        });
        assert.ok(x1.x > x0 + 15);
        assert.equal(x1.paused, false);

        // Down Guest -> Host walks into r<=48 Bagua circle -> revives Guest!
        await coop.hostPage.evaluate(() => {
          const r = window.__wugeng.game.run;
          r.enemies.length = 0;
          r.weapons.forEach((w) => { w.cd = 9999; });
          const p1 = r.players[1];
          const p2 = r.players[2];
          p2.x = -300;
          p2.y = -300;
          p1.x = 120;
          p1.y = 0;
          p1.invulnT = 0;
          p1.hp = 1;
          r.enemies.push({
            id: 899001, type: 'lanternghost', x: p1.x, y: p1.y, r: 22,
            hp: 99999, maxHp: 99999, elite: false, boss: false, hitT: 0, slowT: 0,
            state: 'move', angle: 0, speed: 0, dmg: 9999, xp: 0, atkT: 0, stateT: 0, stunT: 0,
            dx: 0, dy: 0, kbx: 0, kby: 0, dead: false,
          });
        });
        await stepCoopFrames([coop.hostPage, coop.guestPage], 12, 6);
        assert.equal(await coop.hostPage.evaluate(() => window.__wugeng.game.run.players[1].downed), true);

        await coop.hostPage.evaluate(() => {
          const r = window.__wugeng.game.run;
          r.enemies.length = 0;
          r.players[0].x = r.players[1].x - 14;
          r.players[0].y = r.players[1].y;
        });
        await stepCoopFrames([coop.hostPage, coop.guestPage], 162, 6);
        const [afterRevive, guestAfterRevive] = await Promise.all([
          coop.hostPage.evaluate(() => ({
            downed: window.__wugeng.game.run.players[1].downed,
            revivesDone: window.__wugeng.game.run.players[0].stats?.revivesDone || 0,
          })),
          coop.guestPage.evaluate(() => ({
            downed: window.__wugeng.game.run.players[1].downed,
            hp: window.__wugeng.game.run.players[1].hp,
          })),
        ]);
        assert.equal(afterRevive.downed, false);
        assert.ok(afterRevive.revivesDone >= 1);
        assert.equal(guestAfterRevive.downed, false);
        assert.ok(guestAfterRevive.hp > 0);

        // Settle & verify .result-score, .result-squad (3 rows), .mvp-seal & live 'c5mzumajes9houq0ra' leaderboard submit
        const endSummary = await coop.hostPage.evaluate(async () => {
          const r = window.__wugeng.game.run;
          r.time = 240;
          r.stats.kills = 210;
          r.players[0].stats.damageDealt = 18_000;
          r.players[0].stats.kills = 110;
          r.players[1].stats.damageDealt = 9500;
          r.players[1].stats.kills = 60;
          r.players[2].stats.damageDealt = 6200;
          r.players[2].stats.kills = 40;
          const sum = window.__wugeng.game.finish();
          await new Promise((res2) => setTimeout(res2, 80));
          return {
            score: sum.score,
            coopSize: sum.coopSize,
            bestScore: window.__wugeng.save.leaderboard?.bestScore,
            lbSubmits: window.__t4LbSubmits || [],
          };
        });
        await requireOpenSelector(coop.hostPage, '.screen--result .result-score');
        await requireOpenSelector(coop.hostPage, '.screen--result .result-squad');
        await requireOpenSelector(coop.hostPage, '.screen--result .mvp-seal');
        assert.equal(endSummary.coopSize, 3);
        assert.ok(endSummary.score > 0 && endSummary.bestScore === endSummary.score);
        assert.ok(
          endSummary.lbSubmits.some((batch) =>
            Array.isArray(batch) && batch.some((item) => item.leaderboardId === PRIMARY_LEADERBOARD_ID && item.score === endSummary.score),
          ),
          `Expected automatic submitScores to '${PRIMARY_LEADERBOARD_ID}' with score=${endSummary.score}, got ${JSON.stringify(endSummary.lbSubmits)}`,
        );
        coop.assertNoErrors('T4-S09');
      } finally {
        await coop.close();
      }
    },
  },
  {
    id: 'T4-S10',
    tier: 4,
    feature: 'F13',
    features: ['F11', 'F12', 'F13'],
    timeoutMs: 24_000,
    name: 'TapTap Full Ecosystem Lifecycle (?mockTap=1&mockAds=1, quick-cloud, Check-In/Revive Ads, mockAds=fail, public/friends/1025 Leaderboard, Friends)',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser, { isolated: true });
      try {
        await bootToHub(s.page, baseUrl, { query: 'mockTap=1&mockAds=1', savePatch: { coins: 100 } });

        // 1) Check-in double via mock ad
        await fastClick(s.page, '.hub-nav .btn:nth-child(3)');
        await fastClick(s.page, '#ui .veil .btn--ad');
        await s.page.waitForSelector('.mock-ad');
        await s.page.waitForSelector('.mock-ad', { state: 'detached', timeout: 7500 });
        await closeActiveModal(s.page);
        assert.equal(await s.page.evaluate(() => window.__wugeng.save.coins), 160);

        // 2) Hub quick-cloud + Leaderboard public/friends + Friends
        await fastClick(s.page, '[data-action="quick-cloud"]');
        await fastClick(s.page, '[data-action="open-leaderboard"]');
        await requireOpenSelector(s.page, '.leaderboard-modal');
        await s.page.waitForTimeout(60);
        const pubLb = await readLeaderboardBodyText(s.page);
        assert.ok(/\d+/.test(pubLb.bodyText), `Expected numeric entries in public leaderboard, got '${pubLb.bodyText}'`);
        await fastClick(s.page, '[data-collection="friends"]');
        await s.page.waitForTimeout(60);
        const friendsLb = await readLeaderboardBodyText(s.page);
        assert.ok(/\d+/.test(friendsLb.bodyText), `Expected numeric entries in friends leaderboard, got '${friendsLb.bodyText}'`);
        await fastClick(s.page, '[data-collection="public"]');
        await closeActiveModal(s.page, 'close-leaderboard');

        // Exercise [data-action="open-friends"] & openFriendList under ?mockTap=1
        if (await s.page.$('[data-action="open-friends"]')) {
          await fastClick(s.page, '[data-action="open-friends"]');
        } else {
          await fastClick(s.page, '[data-action="open-coop"]');
          await requireOpenSelector(s.page, '.coop-modal');
          if (await s.page.$('[data-action="open-friends"]')) {
            await fastClick(s.page, '[data-action="open-friends"]');
          }
        }
        await s.page.evaluate(() => window.__wugeng.friends?.openFriendList?.());
        await s.page.waitForTimeout(50);
        while (await s.page.$('#ui .veil')) {
          const closed = await closeActiveModal(s.page);
          if (!closed) break;
        }

        // 3) Run death ad revive after 60s grace
        await fastClick(s.page, '.hub-foot .btn--seal, .btn--big');
        await stepFrames(s.page, 3);
        await s.page.evaluate(() => { window.__wugeng.game.run.time = 75; });
        await triggerLethalHit(s.page);
        await fastClick(s.page, '#ui .veil .btn--ad');
        await s.page.waitForSelector('.mock-ad', { state: 'detached', timeout: 7500 });
        assert.equal(await s.page.evaluate(() => window.__wugeng.game.run.status), 'playing');

        // 4) mockAds=fail grants 0 coins & mockLeaderboard=1025 shows polite Chinese fallback in modal body
        await bootToHub(s.page, baseUrl, {
          query: 'mockAds=fail&mockLeaderboard=1025',
          savePatch: { coins: 0, checkin: { cycleDay: 1, lastClaimDate: null, cycles: 0, totalClaims: 0 } },
        });
        await fastClick(s.page, '.hub-nav .btn:nth-child(3)');
        await fastClick(s.page, '#ui .veil .btn--ad');
        await s.page.waitForTimeout(450);
        assert.equal(await s.page.evaluate(() => window.__wugeng.save.coins), 0);
        await closeActiveModal(s.page);

        await fastClick(s.page, '[data-action="open-leaderboard"]');
        await requireOpenSelector(s.page, '.leaderboard-modal');
        await fastClick(s.page, '[data-collection="friends"]');
        await s.page.waitForTimeout(80);
        const lb1025 = await readLeaderboardBodyText(s.page);
        assert.ok(
          /权限|授权|未开通|暂未|暂不可用|无法|本地|本机|荣誉/.test(lb1025.bodyText),
          `Expected Chinese permission/fallback notice in T4-S10 1025 leaderboard body, got '${lb1025.bodyText}'`,
        );
        assert.equal(/friend permission not granted|undefined|\[object Object\]/i.test(lb1025.fullText), false);
        s.assertNoErrors('T4-S10');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T4-S11',
    tier: 4,
    feature: 'F15',
    features: ['F15', 'F1', 'F2', 'F3', 'F8', 'F9', 'F10', 'F12', 'F14'],
    timeoutMs: 22_000,
    name: 'Extracted dist/wugeng-h5.zip Production Package End-to-End Simulation (v3 Modules, Splash, Market, Achievements, 2P Bot Co-op, Inspector, Settlement)',
    async run({ browser }) {
      const { appDir } = await extractH5ZipToScratch('prod_v3_sim');
      for (const reqMod of [
        ['src', 'sim', 'coop.js'],
        ['src', 'net', 'coop-net.js'],
        ['src', 'meta', 'cosmetics.js'],
        ['src', 'meta', 'achievements.js'],
        ['src', 'meta', 'leaderboard-config.js'],
        ['src', 'meta', 'leaderboard.js'],
        ['src', 'meta', 'friends.js'],
      ]) {
        assert.equal(
          fs.existsSync(path.join(appDir, ...reqMod)),
          true,
          `Extracted dist/wugeng-h5.zip is missing v3 module ${reqMod.join('/')} (re-run python3 tools/package_h5.py)`,
        );
      }

      const zipServer = await startStaticServer(appDir);
      const s = await bootColdIntro(browser, zipServer.baseUrl, { query: 'mockTap=1' });
      try {
        await fastClick(s.page, '.title-actions .btn--seal');
        await s.page.waitForSelector('.screen--hub');
        await s.page.evaluate(() => {
          const sv = window.__wugeng.save;
          sv.coach = sv.coach || { seen: {}, runsPlayed: 0 };
          sv.coach.runsPlayed = Math.max(sv.coach.runsPlayed || 0, 2);
          sv.nightCleared = Math.max(sv.nightCleared ?? -1, 0);
          window.__wugeng.showHub();
        });
        await s.page.waitForSelector('.screen--hub');

        for (const action of ['open-market', 'open-achievements', 'open-leaderboard']) {
          await fastClick(s.page, `[data-action="${action}"]`);
          await closeActiveModal(s.page);
        }

        await fastClick(s.page, '[data-action="open-coop"]');
        await fastClick(s.page, '[data-action="coop-create"]');
        await fastClick(s.page, '[data-action="coop-add-bot"]');
        await fastClick(s.page, '[data-action="coop-start"]');
        await s.page.waitForFunction(() => window.__wugeng.game.run?.players?.length === 2);

        await triggerLevelUp(s.page);
        await fastClick(s.page, '[data-action="inspect-loadout"]');
        await requireOpenSelector(s.page, '.veil--inspector');
        await fastClick(s.page, '[data-action="close-inspector"]');
        await fastClick(s.page, '.qian');

        await s.page.evaluate(() => window.__wugeng.game.finish());
        await s.page.waitForSelector('.screen--result');
        await requireOpenSelector(s.page, '.screen--result .result-squad');
        assert.deepEqual(s.badResponses, []);
        s.assertNoErrors('T4-S11');
      } finally {
        await s.close();
        await zipServer.close();
      }
    },
  },
  {
    id: 'T4-S12',
    tier: 4,
    feature: 'F15',
    features: ['F15'],
    name: 'TapTap H5 Pre-Release Gate (Git Cleanliness + 100% Chinese v3 Commits + SHA-256 Zip Parity + Portrait --dry-run + Protected Filing 26847)',
    async run() {
      // 1) Git exclude & untracked hygiene
      const gitStatus = await execFileAsync('git', ['status', '--porcelain'], { cwd: ROOT, timeout: 10_000 });
      const leaked = gitStatus.stdout
        .split('\n')
        .filter((l) => l.includes('.agents') || l.includes('e2e/screenshots'));
      assert.deepEqual(leaked, [], `Git status leaked .agents or screenshots: ${leaked.join(' | ')}`);

      // 2) 100% Chinese v3 commit messages after baseline 16d16da
      const gitLog = await execFileAsync('git', ['log', `${BASELINE_MAIN_COMMIT}..HEAD`, '--format=%H:::%s'], {
        cwd: ROOT,
        timeout: 10_000,
      });
      const badCommits = gitLog.stdout
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .filter((l) => !/[\u4e00-\u9fff]/.test(l.split(':::').slice(1).join(':::')));
      assert.deepEqual(badCommits, [], `Non-Chinese v3 commit messages detected: ${badCommits.join(' | ')}`);

      // 3) SHA-256 byte parity across index.html, privacy.html, styles.css, wenkai-subset.woff2, and ALL runtime src/**/*.js files
      const { appDir } = await extractH5ZipToScratch('gate_parity');
      const walkRuntimeJs = (dir, acc = []) => {
        for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, ent.name);
          if (ent.isDirectory()) walkRuntimeJs(full, acc);
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
        ...walkRuntimeJs(path.join(ROOT, 'src')),
      ];
      const parityMismatches = [];
      for (const rel of expectedRelFiles) {
        const livePath = path.join(ROOT, rel);
        const zippedPath = path.join(appDir, rel);
        if (!fs.existsSync(zippedPath)) {
          parityMismatches.push(`MISSING_IN_ZIP:${rel}`);
        } else if (sha256File(livePath) !== sha256File(zippedPath)) {
          parityMismatches.push(`STALE_SHA256:${rel}`);
        }
      }
      assert.deepEqual(
        parityMismatches,
        [],
        `dist/wugeng-h5.zip out of sync with live runtime files: ${parityMismatches.join(', ')}`,
      );

      // 4) TapTap portrait dry-run & protected filing 26847
      const dryRun = await execFileAsync(
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
      assert.ok(dryRun.stdout.includes(TAPTAP.appId));

      const filing = await execFileAsync(
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
      assert.ok(
        filing.stdout.includes(String(TAPTAP.protectedFilingId)) &&
          filing.stdout.includes(String(TAPTAP.protectedFilingVersionId)),
      );
    },
  },
];
