// Tier 1 (Part 3): Feature Happy-Path E2E Tests for v4 M1 (F16)
// STRICT OPAQUE-BOX: ZERO imports from ../../src/**.

import assert from 'node:assert/strict';
import {
  bootAndStartRun,
  bootToHub,
  closeActiveModal,
  createIsolatedPage,
  fastClick,
  requireOpenSelector,
  stepFrames,
  suppressWardersInPage,
  triggerChest,
  triggerLethalHit,
  triggerLevelUp,
} from './harness.mjs';

export const TIER1_F16 = [
  {
    id: 'T1-F16-01',
    tier: 1,
    feature: 'F16',
    name: '[M1.1] 7-minute fragmented pacing: 84s watch cadence, Boss timeline (168/336/420s) & dawn clear',
    run: async ({ browser, baseUrl }) => {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { heroId: 'zhou', seed: 1601 });
        await suppressWardersInPage(s.page);

        // Watch 1 -> Watch 2 at 84s (vs legacy 120s)
        await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          r.player.invulnT = 120;
          r.time = 84.5;
        });
        await stepFrames(s.page, 3, { stopOnOverlay: false });
        // Dismiss any blessing overlay triggered on watch transition
        await s.page.evaluate(() => {
          const q = document.querySelector('.qian');
          if (q) q.click();
        });
        const w2 = await s.page.evaluate(() => window.__wugeng.game.run.watch);
        assert.equal(w2, 2, `Expected Watch 2 at t=84.5s, got Watch ${w2}`);

        // Boss #1 horse spawns at 168s
        await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          r._blessingWatches = { 1: true, 2: true, 3: true, 4: true, 5: true };
          r.time = 168.2;
        });
        await stepFrames(s.page, 3, { stopOnOverlay: false });
        const boss1 = await s.page.evaluate(() => window.__wugeng.game.run.boss?.type || null);
        assert.equal(boss1, 'horse', `Expected horse boss at t=168.2s, got ${boss1}`);

        // Final Boss youshen spawns at 420s and clearing it reaches dawn
        await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          r.enemies.length = 0;
          r.boss = null;
          r._bossSpawned = { horse: true, umbrella: true };
          r.time = 420.2;
        });
        await stepFrames(s.page, 3, { stopOnOverlay: false });
        const boss3 = await s.page.evaluate(() => window.__wugeng.game.run.boss?.type || null);
        assert.equal(boss3, 'youshen', `Expected youshen boss at t=420.2s, got ${boss3}`);

        await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          const b = r.enemies.find((e) => e.boss && !e.dead);
          if (b) {
            b.paperArmor = 0;
            b.hp = 1;
            b.x = r.player.x + 12;
            b.y = r.player.y;
          }
          for (const w of r.weapons) w.cd = 0;
        });
        await stepFrames(s.page, 36, { stopOnOverlay: false });
        const status = await s.page.evaluate(() => window.__wugeng.game.run?.status || null);
        assert.equal(status, 'cleared', `Expected run to clear after defeating youshen at 420s, got ${status}`);
        s.assertNoErrors('T1-F16-01');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T1-F16-02',
    tier: 1,
    feature: 'F16',
    name: '[M1.2] Haptics setting toggle persists & fires vibration on combat/boss events',
    run: async ({ browser, baseUrl }) => {
      const s = await createIsolatedPage(browser, { isolated: true });
      try {
        await bootToHub(s.page, baseUrl);
        const initState = await s.page.evaluate(() => {
          window.__vibCalls = [];
          navigator.vibrate = (ms) => { window.__vibCalls.push(ms); return true; };
          return {
            setting: window.__wugeng.save.settings.haptics,
            enabled: window.__wugeng.haptics.isEnabled(),
          };
        });
        assert.equal(initState.setting, true, 'Expected save.settings.haptics default true');
        assert.equal(initState.enabled, true, 'Expected haptics.isEnabled() default true');

        // Open Settings modal and toggle 震动 -> 关 -> 开
        await fastClick(s.page, '.hub-nav .btn:nth-child(4)', 'Open settings modal');
        await requireOpenSelector(s.page, '.veil .setting', 'Settings modal visible');
        const toggledOff = await s.page.evaluate(() => {
          const rows = [...document.querySelectorAll('.veil .setting')];
          const row = rows.find((r) => (r.textContent || '').includes('震动'));
          if (!row) return null;
          const offBtn = [...row.querySelectorAll('.seg__opt')].find((b) => (b.textContent || '').trim() === '关');
          offBtn?.click();
          return {
            setting: window.__wugeng.save.settings.haptics,
            enabled: window.__wugeng.haptics.isEnabled(),
          };
        });
        assert.deepEqual(toggledOff, { setting: false, enabled: false }, 'Expected 震动=关 to disable haptics');

        const toggledOn = await s.page.evaluate(() => {
          const rows = [...document.querySelectorAll('.veil .setting')];
          const row = rows.find((r) => (r.textContent || '').includes('震动'));
          const onBtn = [...row.querySelectorAll('.seg__opt')].find((b) => (b.textContent || '').trim() === '开');
          onBtn?.click();
          window.__wugeng.haptics.onEvents([{ type: 'bossSpawn', bossType: 'horse' }]);
          return {
            setting: window.__wugeng.save.settings.haptics,
            enabled: window.__wugeng.haptics.isEnabled(),
            calls: window.__vibCalls.slice(),
          };
        });
        assert.equal(toggledOn.setting, true, 'Expected 震动=开 to persist true');
        assert.equal(toggledOn.enabled, true, 'Expected haptics re-enabled');
        assert.ok(toggledOn.calls.length >= 1, `Expected vibration call on bossSpawn, got ${JSON.stringify(toggledOn.calls)}`);
        await closeActiveModal(s.page);
        s.assertNoErrors('T1-F16-02');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T1-F16-03',
    tier: 1,
    feature: 'F16',
    name: '[M1.3] Fresh save progressive Hub locks, situational in-run .coach-whisper & unlock after 1 run',
    run: async ({ browser, baseUrl }) => {
      const s = await createIsolatedPage(browser);
      try {
        await bootToHub(s.page, baseUrl, { freshCoach: true });
        const locked0 = await s.page.evaluate(() => {
          const lockedBtns = [...document.querySelectorAll('.screen--hub .is-coach-locked[data-locked="1"]')];
          return {
            count: lockedBtns.length,
            marketLocked: document.querySelector('[data-action="open-market"]')?.dataset.locked === '1',
            shopLocked: document.querySelector('.hub-nav .btn:nth-child(1)')?.dataset.locked === '1',
          };
        });
        assert.equal(locked0.count, 6, `Expected all 6 progressive features locked on fresh save, got ${locked0.count}`);
        assert.equal(locked0.marketLocked, true);
        assert.equal(locked0.shopLocked, true);

        // Clicking locked feature shows toast without opening modal
        await fastClick(s.page, '[data-action="open-market"]', 'Click locked market');
        const toastMsg = await s.page.evaluate(() => ({
          toast: (document.querySelector('.toast')?.textContent || '').trim(),
          modalCount: document.querySelectorAll('#ui .veil').length,
        }));
        assert.ok(toastMsg.toast.length > 0, 'Expected toast notice when clicking locked feature');
        assert.equal(toastMsg.modalCount, 0, 'Expected locked feature click not to open modal');

        // Start first run, trigger level-up -> firstLevelUp whisper fires & persists
        await fastClick(s.page, '.hub-cta', 'Start fresh run');
        await s.page.waitForFunction(() => Boolean(window.__wugeng?.game?.run));
        await triggerLevelUp(s.page);
        const lvlCoach = await s.page.evaluate(() => {
          const w = document.querySelector('.coach-whisper');
          return {
            whisper: (w?.textContent || '').trim(),
            pointerEvents: w ? getComputedStyle(w).pointerEvents : null,
            seenLevelUp: !!window.__wugeng.save.coach?.seen?.firstLevelUp,
          };
        });
        assert.ok(lvlCoach.whisper.length > 0, 'Expected .coach-whisper banner on first level-up');
        assert.equal(lvlCoach.pointerEvents, 'none', 'Coach whisper must be non-blocking (pointer-events: none)');
        assert.equal(lvlCoach.seenLevelUp, true, 'Expected save.coach.seen.firstLevelUp persisted');
        await fastClick(s.page, '.qian', 'Pick first level-up choice');

        // Trigger chest -> firstChest whisper persists
        await triggerChest(s.page);
        const seenChest = await s.page.evaluate(() => !!window.__wugeng.save.coach?.seen?.firstChest);
        assert.equal(seenChest, true, 'Expected save.coach.seen.firstChest persisted');
        await s.page.evaluate(() => document.querySelector('.veil .btn--seal')?.click());

        // Settle run -> 1 run unlocks shop & codex while market/achievements/leaderboard stay locked
        await triggerLethalHit(s.page);
        await s.page.evaluate(() => {
          const btns = [...document.querySelectorAll('.veil button')];
          (btns.find((b) => b.textContent.includes('结算')) || btns[btns.length - 1])?.click();
        });
        await s.page.waitForSelector('.screen--result');
        await fastClick(s.page, '[data-action="result-hub"]', 'Return to Hub');
        await s.page.waitForSelector('.screen--hub');
        const after1 = await s.page.evaluate(() => ({
          runs: window.__wugeng.save.stats.runs,
          shopLocked: document.querySelector('.hub-nav .btn:nth-child(1)')?.dataset.locked === '1',
          codexLocked: document.querySelector('.hub-nav .btn:nth-child(2)')?.dataset.locked === '1',
          marketLocked: document.querySelector('[data-action="open-market"]')?.dataset.locked === '1',
        }));
        assert.equal(after1.runs, 1);
        assert.equal(after1.shopLocked, false, 'Expected 香火铺 unlocked after 1 run');
        assert.equal(after1.codexLocked, false, 'Expected 百物谱 unlocked after 1 run');
        assert.equal(after1.marketLocked, true, 'Expected 鬼市 still locked until 2 runs');
        s.assertNoErrors('T1-F16-03');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T1-F16-04',
    tier: 1,
    feature: 'F16',
    name: '[M1.4] Boss spawn shows non-blocking .boss-card, triggers slow-mo & bossMusic, clears on defeat',
    run: async ({ browser, baseUrl }) => {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { heroId: 'zhou', seed: 1604 });
        await suppressWardersInPage(s.page);

        await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          r._blessingWatches = { 1: true, 2: true, 3: true, 4: true, 5: true };
          r.player.invulnT = 120;
          r.time = 168.1;
        });
        await stepFrames(s.page, 2, { stopOnOverlay: false });

        const onSpawn = await s.page.evaluate(() => {
          const card = document.querySelector('.boss-card');
          return {
            exists: !!card,
            bossType: card?.dataset.bossType || null,
            text: (card?.textContent || '').trim(),
            pointerEvents: card ? getComputedStyle(card).pointerEvents : null,
            timeScale: window.__wugeng.game.timeScale,
            bossMusic: window.__wugeng.audio.bossMusic,
          };
        });
        assert.equal(onSpawn.exists, true, 'Expected .boss-card mounted on horse boss spawn');
        assert.equal(onSpawn.bossType, 'horse');
        assert.ok(onSpawn.text.includes('纸马'), `Expected boss card to name 纸马, got "${onSpawn.text}"`);
        assert.equal(onSpawn.pointerEvents, 'none', 'Boss card must be non-blocking (pointer-events: none)');
        assert.ok(onSpawn.timeScale > 0 && onSpawn.timeScale < 1, `Expected slow-mo timeScale < 1, got ${onSpawn.timeScale}`);
        assert.equal(onSpawn.bossMusic, true, 'Expected audio.bossMusic === true while boss is active');

        // Defeat horse boss -> bossMusic turns false
        await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          const b = r.enemies.find((e) => e.boss && !e.dead);
          if (b) {
            b.paperArmor = 0;
            b.hp = 1;
            b.x = r.player.x + 12;
            b.y = r.player.y;
          }
          for (const w of r.weapons) w.cd = 0;
        });
        await stepFrames(s.page, 30, { stopOnOverlay: false });
        const afterKill = await s.page.evaluate(() => ({
          boss: window.__wugeng.game.run.boss,
          bossMusic: window.__wugeng.audio.bossMusic,
          timeScale: window.__wugeng.game.timeScale,
        }));
        assert.equal(afterKill.boss, null, 'Expected horse boss defeated');
        assert.equal(afterKill.bossMusic, false, 'Expected audio.bossMusic restored to false after boss defeat');
        assert.ok(afterKill.timeScale > 0 && afterKill.timeScale <= 1);
        s.assertNoErrors('T1-F16-04');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T1-F16-05',
    tier: 1,
    feature: 'F16',
    name: '[M1.5] Redesigned Result screen highlights, loadout, next unlock goal & primary 再守一夜 instant restart',
    run: async ({ browser, baseUrl }) => {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { heroId: 'zhou', startWeapon: 'gong', seed: 1605 });
        // Populate combat stats (damageByWeapon, maxCombo, weapons & relics) via run state and finish cleanly
        await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          r.time = 95;
          r.stats.kills = 42;
          r.stats.maxHit = 680;
          r.stats.damageDealt = 4200;
          r.stats.damageByWeapon = { gong: 3150, lantern: 1050 };
          r.stats.maxCombo = 19;
          r.weapons.push({ id: 'lantern', level: 4, cd: 0, evolved: false });
          r.relics.push({ id: 'clapper', level: 2 });
        });
        await triggerLethalHit(s.page);
        await s.page.evaluate(() => {
          const btns = [...document.querySelectorAll('.veil button')];
          (btns.find((b) => b.textContent.includes('结算')) || btns[btns.length - 1])?.click();
        });
        await s.page.waitForSelector('.screen--result');

        const resultDom = await s.page.evaluate(() => {
          const hl = document.querySelector('.result-highlight');
          const loadoutItems = document.querySelectorAll('.result-loadout__item').length;
          const goal = document.querySelector('.result-next-goal');
          const againBtn = document.querySelector('[data-action="result-again"]');
          const hubBtn = document.querySelector('[data-action="result-hub"]');
          const allBtns = [...document.querySelectorAll('.screen--result button')];
          return {
            hlText: (hl?.textContent || '').trim(),
            barWidth: hl?.querySelector('.result-bar__fill')?.style.width || '',
            loadoutItems,
            goalText: (goal?.textContent || '').trim(),
            againIsSeal: againBtn?.classList.contains('btn--seal') || false,
            hubIsGhost: hubBtn?.classList.contains('btn--ghost') || false,
            hubIsLast: allBtns[allBtns.length - 1] === hubBtn,
          };
        });

        const barPct = Number.parseInt(resultDom.barWidth, 10);
        assert.ok(resultDom.hlText.includes('头功兵刃'), `Expected 头功兵刃 in highlight: ${resultDom.hlText}`);
        assert.ok(barPct >= 65 && barPct <= 85, `Expected gong share near 75%, got ${resultDom.barWidth}`);
        assert.ok(resultDom.hlText.includes(`${barPct}%`), `Expected ${barPct}% in highlight: ${resultDom.hlText}`);
        assert.ok(resultDom.hlText.includes('最长连斩 19'), `Expected 最长连斩 19 in highlight: ${resultDom.hlText}`);
        assert.equal(resultDom.loadoutItems, 3, 'Expected 2 weapons + 1 relic in .result-loadout');
        assert.ok(resultDom.goalText.includes('距下一目标'), `Expected 距下一目标 card: ${resultDom.goalText}`);
        assert.equal(resultDom.againIsSeal, true, 'Expected 再守一夜 to be primary vermilion seal button');
        assert.equal(resultDom.hubIsGhost, true, 'Expected 回更房 to be secondary ghost button');
        assert.equal(resultDom.hubIsLast, true, 'Expected 回更房 to remain last button for E2E contract');

        // Click 再守一夜 -> immediately restarts fresh run with same hero & startWeapon
        await fastClick(s.page, '[data-action="result-again"]', 'Click 再守一夜');
        await s.page.waitForFunction(() => !document.querySelector('.screen--result') && Boolean(window.__wugeng.game.run));
        const restarted = await s.page.evaluate(() => ({
          heroId: window.__wugeng.game.run.heroId,
          startWeapon: window.__wugeng.game.run.startWeapon,
          time: window.__wugeng.game.run.time,
          status: window.__wugeng.game.run.status,
        }));
        assert.equal(restarted.heroId, 'zhou');
        assert.equal(restarted.startWeapon, 'gong');
        assert.ok(restarted.time < 5, `Expected fresh run time < 5s, got ${restarted.time}`);
        assert.equal(restarted.status, 'playing');
        s.assertNoErrors('T1-F16-05');
      } finally {
        await s.close();
      }
    },
  },
];
