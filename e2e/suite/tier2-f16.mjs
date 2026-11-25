// Tier 2 (Part 3): Boundary, Edge & Negative E2E Tests for v4 M1 (F16)
// STRICT OPAQUE-BOX: ZERO imports from ../../src/**.

import assert from 'node:assert/strict';
import { SAVE_VERSION } from './contracts.mjs';
import {
  bootAndStartRun,
  bootToHub,
  createIsolatedPage,
  fastClick,
  stepFrames,
  suppressWardersInPage,
  triggerLethalHit,
  triggerLevelUp,
} from './harness.mjs';

export const TIER2_F16 = [
  {
    id: 'T2-F16-01',
    tier: 2,
    feature: 'F16',
    name: '[M1.2] Haptics disabled suppresses all pulses & playerHurt enforces 250ms throttle window',
    run: async ({ browser, baseUrl }) => {
      const s = await createIsolatedPage(browser, { isolated: true });
      try {
        await bootToHub(s.page, baseUrl);
        const res = await s.page.evaluate(() => {
          const calls = [];
          navigator.vibrate = (ms) => { calls.push(ms); return true; };
          const h = window.__wugeng.haptics;
          h.setEnabled(false);
          h.pulse('bossSpawn');
          h.onEvents([{ type: 'bossSpawn' }, { type: 'playerHurt' }]);
          const countWhileOff = calls.length;

          h.setEnabled(true);
          h.onEvents([{ type: 'playerHurt' }]);
          h.onEvents([{ type: 'playerHurt' }]);
          h.onEvents([{ type: 'playerHurt' }]);
          const countAfterBurst = calls.length;
          return { countWhileOff, countAfterBurst };
        });
        assert.equal(res.countWhileOff, 0, 'Expected zero vibrations while haptics disabled');
        assert.equal(res.countAfterBurst, 1, 'Expected rapid playerHurt burst within 250ms to vibrate exactly once');
        s.assertNoErrors('T2-F16-01');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T2-F16-02',
    tier: 2,
    feature: 'F16',
    name: '[M1.3] Returning v3 save migrates to v4 with all coach whispers pre-seen & zero Hub locks',
    run: async ({ browser, baseUrl }) => {
      const s = await createIsolatedPage(browser, {
        isolated: true,
        beforeBootInitScript: () => {
          if (!localStorage.getItem('wugeng.save')) {
            localStorage.setItem('wugeng.save', JSON.stringify({
              version: 3,
              coins: 300,
              nightCleared: 0,
              nightUnlocked: 1,
              stats: { runs: 2, clears: 1, firstRunDone: true },
            }));
          }
        },
      });
      try {
        await bootToHub(s.page, baseUrl, { freshCoach: true });

        const migrated = await s.page.evaluate(() => ({
          version: window.__wugeng.save.version,
          seenKeys: Object.keys(window.__wugeng.save.coach?.seen || {}).sort(),
          lockedCount: document.querySelectorAll('.screen--hub .is-coach-locked').length,
        }));
        assert.equal(migrated.version, SAVE_VERSION, `Expected migrated save version ${SAVE_VERSION}`);
        assert.deepEqual(
          migrated.seenKeys,
          ['firstChest', 'firstElite', 'firstEvolve', 'firstLevelUp', 'firstUltReady'],
          'Expected returning v3 player to have all 5 coach whispers pre-marked seen',
        );
        assert.equal(migrated.lockedCount, 0, 'Expected zero locked Hub features for returning cleared player');

        // Start a run and level up -> no .coach-whisper should pop up
        await fastClick(s.page, '.hub-cta', 'Start run as returning player');
        await s.page.waitForFunction(() => Boolean(window.__wugeng?.game?.run));
        await triggerLevelUp(s.page);
        const whisperCount = await s.page.evaluate(() => document.querySelectorAll('.coach-whisper').length);
        assert.equal(whisperCount, 0, 'Expected no .coach-whisper for returning player');
        s.assertNoErrors('T2-F16-02');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T2-F16-03',
    tier: 2,
    feature: 'F16',
    name: '[M1.3] Progressive Hub unlock exact boundaries across 0 -> 1 -> 2 runs -> 1 clear',
    run: async ({ browser, baseUrl }) => {
      const s = await createIsolatedPage(browser);
      try {
        await bootToHub(s.page, baseUrl, { freshCoach: true });
        const checkStage = async (patch) => {
          return s.page.evaluate((p) => {
            const sv = window.__wugeng.save;
            sv.stats.runs = p.runs;
            sv.stats.clears = p.clears;
            sv.nightCleared = p.nightCleared;
            sv.coins = 0;
            sv.coach = { seen: {}, runsPlayed: p.runs };
            window.__wugeng.showHub();
            return {
              shop: document.querySelector('.hub-nav .btn:nth-child(1)')?.dataset.locked === '1',
              codex: document.querySelector('.hub-nav .btn:nth-child(2)')?.dataset.locked === '1',
              market: document.querySelector('[data-action="open-market"]')?.dataset.locked === '1',
              achievements: document.querySelector('[data-action="open-achievements"]')?.dataset.locked === '1',
              leaderboard: document.querySelector('[data-action="open-leaderboard"]')?.dataset.locked === '1',
              coop: document.querySelector('[data-action="open-coop"]')?.dataset.locked === '1',
            };
          }, patch);
        };

        assert.deepEqual(
          await checkStage({ runs: 0, clears: 0, nightCleared: -1 }),
          { shop: true, codex: true, market: true, achievements: true, leaderboard: true, coop: true },
          'Stage 0 (0 runs): all 6 progressive entries locked',
        );
        assert.deepEqual(
          await checkStage({ runs: 1, clears: 0, nightCleared: -1 }),
          { shop: false, codex: false, market: true, achievements: true, leaderboard: true, coop: true },
          'Stage 1 (1 run): shop & codex unlocked',
        );
        assert.deepEqual(
          await checkStage({ runs: 2, clears: 0, nightCleared: -1 }),
          { shop: false, codex: false, market: false, achievements: false, leaderboard: false, coop: true },
          'Stage 2 (2 runs): market, achievements & leaderboard unlocked; coop still locked',
        );
        assert.deepEqual(
          await checkStage({ runs: 2, clears: 1, nightCleared: 0 }),
          { shop: false, codex: false, market: false, achievements: false, leaderboard: false, coop: false },
          'Stage 3 (1 clear): all entries unlocked including coop',
        );
        s.assertNoErrors('T2-F16-03');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T2-F16-04',
    tier: 2,
    feature: 'F16',
    name: '[M1.4] Settling mid-Boss fight tears down .boss-card & resets audio.bossMusic to false',
    run: async ({ browser, baseUrl }) => {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { heroId: 'zhou', seed: 2604 });
        await suppressWardersInPage(s.page);

        await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          r._blessingWatches = { 1: true, 2: true, 3: true, 4: true, 5: true };
          r.player.invulnT = 120;
          r.time = 168.1;
        });
        await stepFrames(s.page, 2, { stopOnOverlay: false });
        const active = await s.page.evaluate(() => ({
          card: !!document.querySelector('.boss-card'),
          bossMusic: window.__wugeng.audio.bossMusic,
        }));
        assert.equal(active.card, true, 'Expected .boss-card active before mid-fight death');
        assert.equal(active.bossMusic, true, 'Expected bossMusic active before mid-fight death');

        // Force death & settle mid-boss fight
        await triggerLethalHit(s.page);
        await s.page.evaluate(() => {
          const btns = [...document.querySelectorAll('.veil button')];
          (btns.find((b) => b.textContent.includes('结算')) || btns[btns.length - 1])?.click();
        });
        await s.page.waitForSelector('.screen--result');
        const cleaned = await s.page.evaluate(() => ({
          cardCount: document.querySelectorAll('.boss-card').length,
          bossMusic: window.__wugeng.audio.bossMusic,
        }));
        assert.equal(cleaned.cardCount, 0, 'Expected .boss-card removed on result screen');
        assert.equal(cleaned.bossMusic, false, 'Expected audio.bossMusic reset to false on result screen');
        s.assertNoErrors('T2-F16-04');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T2-F16-05',
    tier: 2,
    feature: 'F16',
    name: '[M1.5] Narrow 360x780 result CTA bounds, ad-double next-goal live refresh & all-unlocked empty goal hide',
    run: async ({ browser, baseUrl }) => {
      const s = await createIsolatedPage(browser, {
        isolated: true,
        viewport: { width: 360, height: 780 },
      });
      try {
        await bootAndStartRun(s.page, baseUrl, {
          heroId: 'zhou',
          seed: 2605,
          query: 'mockAds=complete',
          savePatch: {
            coins: 600,
            unlockedHeroes: ['zhou', 'mian', 'daotong', 'yinyang', 'tiejiang', 'nuoxi'],
          },
        });
        // Set up run stats + 6 weapons & 6 relics to stress vertical height on 360x780
        await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          r.time = 130;
          r.stats.kills = 120;
          r.stats.coins = 100;
          r.stats.maxHit = 1200;
          r.stats.damageDealt = 8000;
          r.stats.damageByWeapon = { gong: 5200, lantern: 2800 };
          r.stats.maxCombo = 28;
          r.weapons = [
            { id: 'gong', level: 8, cd: 0, evolved: true },
            { id: 'lantern', level: 5, cd: 0, evolved: false },
            { id: 'talisman', level: 4, cd: 0, evolved: false },
            { id: 'brush', level: 3, cd: 0, evolved: false },
            { id: 'coinsword', level: 2, cd: 0, evolved: false },
            { id: 'bell', level: 2, cd: 0, evolved: false },
          ];
          r.relics = [
            { id: 'clapper', level: 2 },
            { id: 'censer', level: 2 },
            { id: 'cinnabar', level: 1 },
            { id: 'inkstone', level: 1 },
            { id: 'bagua', level: 1 },
            { id: 'fivecoins', level: 1 },
          ];
        });
        await triggerLethalHit(s.page);
        await s.page.evaluate(() => {
          const btns = [...document.querySelectorAll('.veil button')];
          (btns.find((b) => b.textContent.includes('结算')) || btns[btns.length - 1])?.click();
        });
        await s.page.waitForSelector('.screen--result');

        const layout = await s.page.evaluate(() => {
          const again = document.querySelector('[data-action="result-again"]')?.getBoundingClientRect();
          const hub = document.querySelector('[data-action="result-hub"]')?.getBoundingClientRect();
          const loadoutCount = document.querySelectorAll('.result-loadout__item').length;
          return {
            loadoutCount,
            againBottom: again ? Math.round(again.bottom) : 9999,
            hubBottom: hub ? Math.round(hub.bottom) : 9999,
            noOverlap: Boolean(again && hub && again.right <= hub.left + 1),
          };
        });
        assert.equal(layout.loadoutCount, 12, 'Expected full 6+6 loadout items rendered');
        assert.ok(layout.againBottom <= 780, `Expected 再守一夜 within 360x780 viewport, bottom=${layout.againBottom}`);
        assert.ok(layout.hubBottom <= 780, `Expected 回更房 within 360x780 viewport, bottom=${layout.hubBottom}`);
        assert.equal(layout.noOverlap, true, 'Expected 再守一夜 and 回更房 side-by-side without overlap');

        // Verify ad double updates coins cleanly
        const coinsBefore = await s.page.evaluate(() => window.__wugeng.save.coins);
        await fastClick(s.page, '.result-actions .btn--ad', 'Click ad double');
        await s.page.waitForSelector('.mock-ad', { state: 'detached', timeout: 7000 });
        const coinsAfter = await s.page.evaluate(() => window.__wugeng.save.coins);
        assert.ok(coinsAfter > coinsBefore, `Expected ad double to increase coins (${coinsBefore} -> ${coinsAfter})`);

        // Now mark every achievement & shop cosmetic owned -> start & finish a run -> nextGoal host hidden
        await fastClick(s.page, '[data-action="result-again"]', 'Restart run for full-unlock check');
        await s.page.waitForFunction(() => Boolean(window.__wugeng?.game?.run));
        await s.page.evaluate(() => {
          const sv = window.__wugeng.save;
          for (const a of window.__wugeng.achievements.ACHIEVEMENTS) sv.achievements[a.id] = 1;
          sv.coins = 999999; // covers every shop cosmetic so coins >= price
        });
        await triggerLethalHit(s.page);
        await s.page.evaluate(() => {
          const btns = [...document.querySelectorAll('.veil button')];
          (btns.find((b) => b.textContent.includes('结算')) || btns[btns.length - 1])?.click();
        });
        await s.page.waitForSelector('.screen--result');
        const emptyGoalHidden = await s.page.evaluate(() => {
          const host = document.querySelector('.result-next-goal-host');
          return Boolean(host && host.hidden && !host.querySelector('.result-next-goal'));
        });
        assert.equal(emptyGoalHidden, true, 'Expected .result-next-goal-host hidden when no incomplete goal remains');
        s.assertNoErrors('T2-F16-05');
      } finally {
        await s.close();
      }
    },
  },
];
