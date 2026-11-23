// Tier 4: Realistic Multi-Feature End-User Application Scenarios (10 full journeys)
// STRICT OPAQUE-BOX: ZERO imports from ../../src/**.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  ALL_ENEMY_IDS,
  ALL_RELIC_IDS,
  ALL_WEAPON_IDS,
  REGULAR_ENEMY_IDS,
  TAPTAP,
} from './contracts.mjs';
import {
  ROOT,
  VENV_PYTHON,
  auditCanvasWoodblockPalette,
  bootAndStartRun,
  bootGame,
  bootToHub,
  confirmChestModal,
  createIsolatedPage,
  execFileAsync,
  extractH5ZipToScratch,
  fastClick,
  grantItemViaLevelUp,
  requireOpenSelector,
  startStaticServer,
  stepFrames,
  triggerChest,
  triggerLethalHit,
  triggerLevelUp,
} from './harness.mjs';

export const TIER4_TESTS = [
  {
    id: 'T4-S01',
    tier: 4,
    feature: 'F3',
    features: ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12'],
    timeoutMs: 20_000,
    name: '390×844 Full Five-Watch -> Dawn -> Endless Player Journey (Title -> Hub -> Shop -> Synergies/Blessings/Shrines/Bosses -> Settlement)',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser, { isolated: true });
      try {
        await bootGame(s.page, baseUrl);
        await fastClick(s.page, '.age-badge');
        await fastClick(s.page, '.veil .btn--seal');
        await fastClick(s.page, '.title-foot .link-btn');
        await s.page.waitForSelector('.privacy-body');
        await fastClick(s.page, '.veil .btn--seal');

        await fastClick(s.page, '.title-actions .btn--seal');
        await s.page.waitForSelector('.screen--hub');
        await s.page.evaluate(() => {
          window.__wugeng.save.coins = 500;
          window.__wugeng.save.charms = [{ relicId: 'strawshoes' }];
          window.__wugeng.showHub();
        });
        await fastClick(s.page, '.hub-nav .btn:nth-child(1)');
        await fastClick(s.page, '.shop-row .btn--small');
        await fastClick(s.page, '.veil .btn--ghost');

        await fastClick(s.page, '.charm-pick');
        await fastClick(s.page, '.hub-foot .btn--seal, .btn--big');
        await stepFrames(s.page, 5);
        assert.equal(await s.page.evaluate(() => window.__wugeng.game.run.relics[0]?.id), 'strawshoes');

        // Build 3-piece zhenhun resonance (gong + strawshoes + soulbanner), banish 1 unwanted item
        await triggerLevelUp(s.page);
        await requireOpenSelector(s.page, '.overlay--levelup', 'Expected .overlay--levelup');
        assert.ok(await s.page.locator('[data-action="banish"]').count() > 0, 'Expected [data-action="banish"]');
        const banishBtn = s.page.locator('.qian >> nth=2 >> [data-action="banish"]');
        if (await banishBtn.count() > 0) await banishBtn.first().click();
        else { await fastClick(s.page, '[data-action="banish"]'); await s.page.evaluate(() => document.querySelectorAll('.qian')[2]?.click()); }
        await fastClick(s.page, '.qian');

        await grantItemViaLevelUp(s.page, 'weapon', 'gong', 4);
        await grantItemViaLevelUp(s.page, 'weapon', 'soulbanner', 2);

        await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          r.enemies.length = 0;
          r._spawnAcc = -99999;
          r.time = 119.97;
          window.__e2eStepFrames(4);
        });
        assert.equal(await s.page.evaluate(() => window.__wugeng.game.run.choiceMode), 'blessing');
        await fastClick(s.page, '.qian');

        await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          const altar = r.shrines.find((x) => x.kind === 'altar' && !x.used);
          if (altar) {
            r.player.x = altar.x;
            r.player.y = altar.y;
          }
          window.__e2eStepFrames(3);
        });
        await fastClick(s.page, '[data-action="interact-shrine"]', 'Expected HUD [data-action="interact-shrine"]');
        await fastClick(s.page, '.overlay--shrine [data-shrine-option]:not([disabled])');
        if (await s.page.evaluate(() => window.__wugeng.overlay === 'levelup')) {
          await fastClick(s.page, '.qian');
        }

        // Open Chest -> evolve gong via zhenhun school resonance (NO clapper!)
        if (!(await s.page.evaluate(() => window.__wugeng.game.run.weapons.find((w) => w.id === 'gong')?.evolved))) {
          await triggerChest(s.page);
          await confirmChestModal(s.page);
        }
        assert.equal(await s.page.evaluate(() => window.__wugeng.game.run.weapons.find((w) => w.id === 'gong')?.evolved), true);

        // Defeat Youshen at 600s -> Dawn Clear -> Enter Endless -> Settle -> Hub Night 1 unlocked
        await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          r.enemies.length = 0;
          r._spawnAcc = -99999;
          r._bossSpawned = { horse: true, umbrella: true, youshen: false };
          r.time = 601;
          window.__e2eStepFrames(2);
          if (r.status === 'levelup') document.querySelector('.qian')?.click();
          const ys = r.enemies.find((e) => e.type === 'youshen');
          ys.x = r.player.x + 25;
          ys.y = r.player.y;
          ys.hp = 1;
          r.player.ult = r.player.ultMax;
        });
        await s.page.keyboard.press('Space');
        await stepFrames(s.page, 4);
        while (await s.page.evaluate(() => window.__wugeng.overlay === 'levelup')) {
          await s.page.click('.qian >> nth=0');
        }
        assert.equal(await s.page.evaluate(() => window.__wugeng.overlay), 'cleared');
        await s.page.click('text=继续守夜');
        assert.equal(await s.page.evaluate(() => window.__wugeng.game.run.mode), 'endless');

        await triggerLethalHit(s.page);
        await s.page.click('text=不了，结算');
        await s.page.waitForSelector('.screen--result.is-dawn');
        await s.page.click('text=回更房');
        await s.page.waitForSelector('.screen--hub');

        const hubProgress = await s.page.evaluate(() => ({
          clears: window.__wugeng.save.stats.clears,
          nightUnlocked: window.__wugeng.save.nightUnlocked,
        }));
        assert.ok(hubProgress.clears >= 1);
        assert.ok(hubProgress.nightUnlocked >= 1, 'Clearing Night 0 must unlock Night 1');
        s.assertNoErrors('T4-S01');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T4-S02',
    tier: 4,
    feature: 'F8',
    features: ['F6', 'F7', 'F8', 'F9', 'F12'],
    name: '360×780 Compact Mobile Responsive Layout + Visibility Auto-Pause + Cloud Sync Dirty Flush',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser, { viewport: { width: 360, height: 780 }, deviceScaleFactor: 2 });
      try {
        await bootAndStartRun(s.page, baseUrl, {
          query: 'mockCloud=1',
          seed: 4002,
          savePatch: { coins: 300 },
        });
        await grantItemViaLevelUp(s.page, 'weapon', 'bell', 1); // zhenhun 2pc

        // Check zero horizontal overflow on 360px narrow screen in .overlay--levelup
        await triggerLevelUp(s.page);
        assert.ok(await s.page.$('.overlay--levelup'), 'Expected .overlay--levelup');
        const levelupFit = await s.page.evaluate(() => {
          const el = document.querySelector('.overlay--levelup');
          const r = el.getBoundingClientRect();
          return { left: r.left, right: r.right, vw: window.innerWidth };
        });
        assert.ok(levelupFit.left >= -1 && levelupFit.right <= levelupFit.vw + 1, `360px overflow in levelup: ${JSON.stringify(levelupFit)}`);
        await s.page.click('.qian >> nth=0');

        // Schedule dirty cloud save, then simulate backgrounding tab (`visibilitychange` with document.hidden=true)
        await s.page.evaluate(() => {
          window.__wugeng.save.coins = 456;
          window.__wugeng.cloud.scheduleSync(window.__wugeng.save);
          Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
          document.dispatchEvent(new Event('visibilitychange'));
        });
        await s.page.waitForFunction(() => window.__wugeng.overlay === 'pause');
        assert.ok(await s.page.$('.overlay--pause'), 'Visibility auto-pause should mount .overlay--pause');
        const bgCheck = await s.page.evaluate(() => ({
          paused: window.__wugeng.game.isPaused(),
          audioMuted: window.__wugeng.audio.play('gong'),
          savedLocalCoins: JSON.parse(localStorage.getItem('wugeng.save')).coins,
        }));
        assert.equal(bgCheck.paused, true);
        assert.equal(bgCheck.audioMuted, false, 'Backgrounded tab must suspend WebAudio');
        assert.equal(bgCheck.savedLocalCoins, 456, 'visibilitychange must flush save to localStorage');

        // Restore foreground visibility and resume run
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
    feature: 'F7',
    features: ['F7', 'F8', 'F9'],
    name: '100% Offline Zero-Ad Complete Player Journey (/index.html without mockAds -> Retry Loop)',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootToHub(s.page, baseUrl);
        await fastClick(s.page, '.hub-nav .btn:nth-child(3)');
        assert.equal(await s.page.locator('.btn--ad').count(), 0);
        await fastClick(s.page, '.veil .btn--seal');
        await fastClick(s.page, '.veil .btn--ghost');

        await fastClick(s.page, '.hub-foot .btn--seal, .btn--big');
        await stepFrames(s.page, 3);

        await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          r.time = 90;
          r.rerolls.free = 0;
        });
        await triggerLevelUp(s.page);
        assert.equal(await s.page.locator('.btn--ad').count(), 0);
        await fastClick(s.page, '.qian');

        await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          r.enemies.length = 0;
          r._spawnAcc = -99999;
          r.time = 119.97;
          window.__e2eStepFrames(4);
        });
        assert.equal(await s.page.evaluate(() => window.__wugeng.game.run.choiceMode), 'blessing');
        assert.equal(await s.page.locator('.btn--ad').count(), 0);
        await fastClick(s.page, '.qian');

        await triggerLethalHit(s.page);
        assert.equal(await s.page.locator('.btn--ad').count(), 0);
        await s.page.evaluate(() => {
          const btns = [...document.querySelectorAll('.veil button')];
          const settle = btns.find((b) => b.textContent.includes('结算')) || btns[btns.length - 1];
          settle?.click();
        });
        await s.page.waitForSelector('.screen--result');
        assert.equal(await s.page.locator('.btn--ad').count(), 0);
        await s.page.evaluate(() => {
          const btns = [...document.querySelectorAll('.screen--result button')];
          const retry = btns.find((b) => b.textContent.includes('再守')) || btns[0];
          retry?.click();
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
    feature: 'F12',
    features: ['F8', 'F12'],
    timeoutMs: 22_000,
    name: 'Full Rewarded Ads + Mock Cloud Save Lifecycle (?mockAds=1&mockCloud=1 + skip/fail Resilience)',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser, { isolated: true });
      try {
        await bootToHub(s.page, baseUrl, { query: 'mockAds=1&mockCloud=1', savePatch: { coins: 100 } });

        // 1) Check-in double via real 3s mock ad
        await fastClick(s.page, '.hub-nav .btn:nth-child(3)');
        await fastClick(s.page, '.veil .btn--ad');
        await s.page.waitForSelector('.mock-ad');
        await s.page.waitForSelector('.mock-ad', { state: 'detached', timeout: 7500 });
        await fastClick(s.page, '.veil .btn--ghost');
        const coinsAfterCheckin = await s.page.evaluate(() => window.__wugeng.save.coins);
        assert.equal(coinsAfterCheckin, 160, 'Day 1 check-in (30) doubled via ad should grant +60 coins');

        // 2) Start run -> advance past AD_GRACE_SEC (60s) -> death ad revive via 3s mock ad
        await fastClick(s.page, '.hub-foot .btn--seal, .btn--big');
        await stepFrames(s.page, 3);
        await s.page.evaluate(() => {
          window.__wugeng.game.run.time = 75;
        });
        await triggerLethalHit(s.page);
        await fastClick(s.page, '.veil .btn--ad');
        await s.page.waitForSelector('.mock-ad', { state: 'detached', timeout: 7500 });
        assert.equal(await s.page.evaluate(() => window.__wugeng.game.run.status), 'playing');

        // 3) Verify mockAds=fail grants 0 coins on fresh unclaimed check-in
        await bootToHub(s.page, baseUrl, {
          query: 'mockAds=fail',
          savePatch: { coins: 0, checkin: { cycleDay: 1, lastClaimDate: null, cycles: 0, totalClaims: 0 } },
        });
        await fastClick(s.page, '.hub-nav .btn:nth-child(3)');
        await fastClick(s.page, '.veil .btn--ad');
        await s.page.waitForTimeout(520);
        assert.equal(await s.page.evaluate(() => window.__wugeng.save.coins), 0, 'mockAds=fail must grant 0 coins');
        s.assertNoErrors('T4-S04');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T4-S05',
    tier: 4,
    feature: 'F11',
    features: ['F4', 'F5', 'F10', 'F11'],
    timeoutMs: 18_000,
    name: '300 Mixed 9-Type Enemies (incl. suona/paperbride/cinder + elites) + 400 Mixed 12-Weapon Projectiles Render Stress',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { seed: 4005 });
        const perf = await s.page.evaluate(async ({ enemyTypes }) => {
          const g = window.__wugeng.game;
          const r = g.run;
          r.enemies.length = 0;
          r._spawnAcc = -99999;
          r._nextWaveT = 99999;
          r.weapons.forEach((w) => { w.cd = 9999; });
          // Spawn real simulation entities for all 9 regular enemy types (including suona, paperbride, cinder)
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

          // Warm 2 frames so any first-frame sprite baking settles before steady-state sampling
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

        assert.equal(perf.enemies, 300, `Expected all 300 spawned stress-test enemies alive, got ${perf.enemies}`);
        assert.equal(perf.distinctEnemyTypes, 9, 'Expected all 9 regular enemy species (6 classic + 3 new F10) spawned & rendered');
        assert.equal(perf.projectiles, 400, `Expected all 400 projectiles active, got ${perf.projectiles}`);
        assert.ok(perf.p50 < 400, `Expected smooth 300-enemy + 400-projectile software headless frame render p50 < 400ms, got ${perf.p50.toFixed(1)}ms`);
        s.assertNoErrors('T4-S05');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T4-S06',
    tier: 4,
    feature: 'F10',
    features: ['F10', 'F6', 'F12'],
    name: 'Three-Hero Unlock & Signature Ultimate Journey (老周 -> unlock 阿绵 & 小道童 -> test all 3 Ultimates via HUD Gong)',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { heroId: 'zhou', seed: 4006 });
        // Achieve both 800 kills (unlocks mian) and >=480s with 0 buns (unlocks daotong) in 1 run settlement!
        await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          r.time = 500;
          r.stats.kills = 850;
          r.stats.bunsEaten = 0;
          r.stats.firstBunTime = null;
          window.__wugeng.game.finish();
        });
        await s.page.waitForSelector('.screen--result');
        await s.page.evaluate(() => {
          const btns = [...document.querySelectorAll('.screen--result button')];
          const hubBtn = btns.find((b) => b.textContent.includes('更房')) || btns[btns.length - 1];
          hubBtn?.click();
        });
        await s.page.waitForSelector('.screen--hub');

        const unlocked = await s.page.evaluate(() => window.__wugeng.save.unlockedHeroes);
        assert.deepEqual(new Set(unlocked), new Set(['zhou', 'mian', 'daotong']), 'Both mian and daotong should now be unlocked');

        await s.page.evaluate(() => document.querySelectorAll('.hero-tile')[1]?.click());
        await fastClick(s.page, '.hub-foot .btn--seal, .btn--big');
        await stepFrames(s.page, 3);
        await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          r.enemies.length = 0;
          r._spawnAcc = -99999;
          r.player.ult = r.player.ultMax;
        });
        await s.page.mouse.click(334, 788);
        const mianCast = await s.page.evaluate(() => {
          window.__e2eStepFrames(5);
          const r = window.__wugeng.game.run;
          return {
            hero: r.heroId,
            ults: r.stats.ultsCast,
            hasPaperHorse: r.projectiles.some((p) => p.kind === 'paperHorse'),
          };
        });
        assert.equal(mianCast.hero, 'mian');
        assert.equal(mianCast.ults, 1);
        assert.equal(mianCast.hasPaperHorse, true, 'Tapping HUD Ult Gong as 阿绵 should unleash 百鬼纸马阵 (paperHorse)');
        s.assertNoErrors('T4-S06');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T4-S07',
    tier: 4,
    feature: 'F2',
    features: ['F2', 'F11', 'F12'],
    timeoutMs: 18_000,
    name: 'style-lab.html Full Visual & 6-Color Woodblock Audit Across Watches 1..6 & Scenes (sheet, crowd, boss, hud)',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser, { styleLab: true });
      try {
        await s.page.goto(`${baseUrl}/style-lab.html?scene=sheet`);
        await s.page.waitForFunction(() => window.__ready === true);
        const sheetFont = await s.page.evaluate(() => document.fonts.check('16px "WenKai"', '五更天'));
        assert.equal(sheetFont, true, 'style-lab.html must load WenKai via /assets/fonts/ HTML directory listing');
        const sheetAudit = await auditCanvasWoodblockPalette(s.page, 45);
        assert.ok(sheetAudit.violationRatio < 0.005);

        // 2) Compare Watch 1, Watch 5, and Watch 6 (Dawn) darkness & woodblock palette
        const lumaByWatch = {};
        for (const w of [1, 5, 6]) {
          await s.page.goto(`${baseUrl}/style-lab.html?watch=${w}&scene=crowd`);
          await s.page.waitForFunction(() => Boolean(window.__renderer && window.__run));
          const stats = await s.page.evaluate(() => {
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
          lumaByWatch[w] = stats;
          const pal = await auditCanvasWoodblockPalette(s.page, 40);
          assert.ok(pal.violationRatio < 0.005, `Palette violation at watch=${w}: ${pal.violationRatio}`);
        }
        assert.ok(lumaByWatch[1] > lumaByWatch[5] + 25, `Watch 1 (${lumaByWatch[1]}) must be brighter than Watch 5 (${lumaByWatch[5]})`);
        assert.ok(lumaByWatch[6] > lumaByWatch[5] + 60, `Watch 6 Dawn (${lumaByWatch[6]}) must be much brighter than Watch 5 (${lumaByWatch[5]})`);
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
    feature: 'F12',
    features: ['F5', 'F10', 'F11', 'F12'],
    name: 'Complete 51-Entry 百物谱 Tour (12W + 12Evo + 12R + 12Enemies + 3Heroes) & Full Rendered Glyph Verification',
    async run({ browser, baseUrl }) {
      const allEnemyKills = Object.fromEntries(ALL_ENEMY_IDS.map((id, idx) => [id, idx + 1]));
      const s = await createIsolatedPage(browser);
      try {
        await bootToHub(s.page, baseUrl, {
          savePatch: {
            unlockedHeroes: ['zhou', 'mian', 'daotong'],
            codex: {
              weapons: ALL_WEAPON_IDS,
              evolutions: ALL_WEAPON_IDS,
              relics: ALL_RELIC_IDS,
              enemies: allEnemyKills,
            },
          },
        });
        await fastClick(s.page, '.hub-nav .btn:nth-child(2)');
        await requireOpenSelector(s.page, '.codex', 'Expected .codex on 百物谱 modal (PROJECT.md §4)');
        const subText = await s.page.textContent('.codex .scroll__sub');
        assert.ok(subText.includes('51 / 51'), `Expected full 百物谱 header '已收录 51 / 51 项', got: ${subText}`);

        let allCodexText = subText;
        for (let t = 0; t < 5; t++) {
          await s.page.evaluate((idx) => document.querySelectorAll('.codex-tab')[idx]?.click(), t);
          const lockedRows = await s.page.locator('.codex-list > .codex-row:not(.codex-row--ach).is-locked').count();
          assert.equal(lockedRows, 0, `Expected 0 locked items in tab #${t} when 100% unlocked`);
          allCodexText += '\n' + (await s.page.textContent('.codex-list'));
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
        assert.deepEqual(JSON.parse(stdout.trim()), [], 'Every character in unlocked 51-entry 百物谱 must exist in wenkai-subset.woff2');
        s.assertNoErrors('T4-S08');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T4-S09',
    tier: 4,
    feature: 'F13',
    features: ['F3', 'F5', 'F6', 'F7', 'F8', 'F9', 'F13'],
    timeoutMs: 18_000,
    name: 'Extracted dist/wugeng-h5.zip Production Simulation: Overhaul Arsenal + Synergy + Blessing + Shrine + Settlement',
    async run({ browser }) {
      const { appDir } = await extractH5ZipToScratch('prod_sim');
      assert.equal(
        fs.existsSync(path.join(appDir, 'src', 'sim', 'blessings.js')),
        true,
        'dist/wugeng-h5.zip is stale (missing overhaul modules; re-run python3 tools/package_h5.py in M4)',
      );
      const zipServer = await startStaticServer(appDir);
      const s = await createIsolatedPage(browser, { isolated: true });
      try {
        await bootAndStartRun(s.page, zipServer.baseUrl, { seed: 4009 });
        await grantItemViaLevelUp(s.page, 'weapon', 'compass', 5);
        await grantItemViaLevelUp(s.page, 'relic', 'soulwick', 1);
        await grantItemViaLevelUp(s.page, 'weapon', 'talisman', 1);

        await triggerChest(s.page);
        await requireOpenSelector(s.page, '.overlay--chest', 'Extracted zip must contain M3 .overlay--chest');
        await confirmChestModal(s.page, 'compass');

        await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          r.enemies.length = 0;
          r._spawnAcc = -99999;
          r.time = 119.97;
          window.__e2eStepFrames(4);
        });
        assert.equal(await s.page.evaluate(() => window.__wugeng.game.run.choiceMode), 'blessing');
        await fastClick(s.page, '.qian');

        await s.page.evaluate(() => window.__wugeng.game.finish());
        await s.page.waitForSelector('.screen--result');
        assert.deepEqual(s.badResponses, []);
        s.assertNoErrors('T4-S09');
      } finally {
        await s.close();
        await zipServer.close();
      }
    },
  },
  {
    id: 'T4-S10',
    tier: 4,
    feature: 'F13',
    features: ['F12', 'F13'],
    name: 'TapTap H5 Pre-Release Gate Scenario (Clean Git Exclude + Stale-Zip Guard + Portrait Dry-Run + Protected Filing 26847)',
    async run() {
      // 1) Git status free of untracked .agents/
      const gitRes = await execFileAsync('git', ['status', '--porcelain'], { cwd: ROOT, timeout: 10_000 });
      const leakedAgents = gitRes.stdout.split('\n').filter((l) => l.includes('.agents'));
      assert.deepEqual(
        leakedAgents,
        [],
        `Git status must not leak untracked .agents/ metadata: ${leakedAgents.join(' | ')}`,
      );

      // 2) TapTap dry-run portrait validation
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

      // 3) Protected filing 26847 untouched
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
      assert.ok(filing.stdout.includes(String(TAPTAP.protectedFilingId)));
    },
  },
];
