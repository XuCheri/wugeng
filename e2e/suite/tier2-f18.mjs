// Tier 2 (Part 5): Boundary, Edge & Negative E2E Tests for v4 M3 Retention (F18)
// STRICT OPAQUE-BOX: ZERO imports from ../../src/**.

import assert from 'node:assert/strict';
import {
  bootToHub,
  closeActiveModal,
  createIsolatedPage,
  fastClick,
  requireOpenSelector,
  stepFrames,
  triggerLethalHit,
} from './harness.mjs';

export const TIER2_F18 = [
  {
    id: 'T2-F18-01',
    tier: 2,
    feature: 'F18',
    name: '[M3.1] Cross-day task refresh, Monday weekly reset & anti-rollback claim guard',
    run: async ({ browser, baseUrl }) => {
      const s = await createIsolatedPage(browser);
      try {
        await bootToHub(s.page, baseUrl);
        const res = await s.page.evaluate(() => {
          const w = window.__wugeng;
          // Day 1 (Wednesday 2026-12-02)
          w.save.daily = {
            date: '2026-12-02',
            weekKey: '2026-11-30',
            weeklyPoints: 40,
            weeklyClaimed: [30],
            progress: {},
            claimed: [],
            totalTaskClaims: 0,
            totalWeeklyClaims: 1,
          };
          const day1 = w.daily.getState('2026-12-02');
          const task0 = day1.tasks[0];
          w.save.daily.progress[task0.id] = task0.need;
          const claimOk = w.daily.claimTask(task0.id, '2026-12-02');
          const dupClaim = w.daily.claimTask(task0.id, '2026-12-02');

          // Anti-rollback: clock moved back to 2026-12-01
          const rbState = w.daily.getState('2026-12-01');
          const rbClaim = w.daily.claimWeeklyChest(30, '2026-12-01');

          // Same week next day (Thursday 2026-12-03): tasks reset, weekly points (50) preserved
          const day2 = w.daily.getState('2026-12-03');

          // Next Monday (2026-12-07): weekly points & claimed chests reset to 0
          const nextMon = w.daily.getState('2026-12-07');
          return {
            claimOk: claimOk.ok,
            dupOk: dupClaim.ok,
            rbRollback: rbState.rollback,
            rbClaimOk: rbClaim.ok,
            day2WeeklyPts: day2.weeklyPoints,
            day2ClaimedTasks: day2.tasks.filter((t) => t.claimed).length,
            nextMonWeeklyPts: nextMon.weeklyPoints,
            nextMonClaimedChests: nextMon.chests.filter((c) => c.claimed).length,
          };
        });

        assert.equal(res.claimOk, true, 'Expected completed task claim to succeed');
        assert.equal(res.dupOk, false, 'Expected duplicate task claim on same day to fail');
        assert.equal(res.rbRollback, true, 'Expected rollback=true when local date < saved date');
        assert.equal(res.rbClaimOk, false, 'Expected weekly chest claim blocked during clock rollback');
        assert.equal(res.day2WeeklyPts, 50, 'Expected weekly points preserved across days within same week');
        assert.equal(res.day2ClaimedTasks, 0, 'Expected daily tasks refreshed on next calendar day');
        assert.equal(res.nextMonWeeklyPts, 0, 'Expected weekly points reset to 0 on Monday');
        assert.equal(res.nextMonClaimedChests, 0, 'Expected weekly chest claims reset on Monday');
        s.assertNoErrors('T2-F18-01');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T2-F18-02',
    tier: 2,
    feature: 'F18',
    name: '[M3.2] Second daily challenge run on same day updates best score without duplicate 200-coin grant',
    run: async ({ browser, baseUrl }) => {
      const s = await createIsolatedPage(browser, { isolated: true });
      try {
        await bootToHub(s.page, baseUrl, { savePatch: { coins: 0 } });

        // Run #1: short daily challenge -> earns 200-coin first-clear bonus
        await s.page.evaluate(() => window.__wugeng.dailyChallenge.start('2026-12-08'));
        await s.page.waitForFunction(() => Boolean(window.__wugeng?.game?.run));
        await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          r.time = 25;
          r.stats.kills = 12;
          r.stats.coins = 0;
        });
        await triggerLethalHit(s.page);
        await s.page.evaluate(() => {
          const btns = [...document.querySelectorAll('.veil button')];
          (btns.find((b) => b.textContent.includes('结算')) || btns[btns.length - 1])?.click();
        });
        await s.page.waitForSelector('.screen--result');
        const afterRun1 = await s.page.evaluate(() => ({
          coins: window.__wugeng.save.coins,
          best1: window.__wugeng.dailyChallenge.getState('2026-12-08').todayBestScore,
          weeklyPts1: window.__wugeng.save.daily?.weeklyPoints || 0,
        }));
        assert.ok(afterRun1.coins >= 200, `Expected >= 200 coins on first daily challenge run, got ${afterRun1.coins}`);
        assert.equal(afterRun1.weeklyPts1, 30);

        // Run #2 on SAME date with much higher kills -> best score rises, NO extra 200 coins or 30 weekly pts
        await fastClick(s.page, '[data-action="result-hub"]', 'Back to Hub');
        await s.page.waitForSelector('.screen--hub');
        const coinsBeforeRun2 = await s.page.evaluate(() => {
          window.__wugeng.save.coins = 500;
          return 500;
        });
        await s.page.evaluate(() => window.__wugeng.dailyChallenge.start('2026-12-08'));
        await s.page.waitForFunction(() => Boolean(window.__wugeng?.game?.run));
        await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          r.time = 6; // ~0 time-bonus coins (< 1 coin)
          r.stats.kills = 240;
          r.stats.coins = 0;
        });
        await triggerLethalHit(s.page);
        await s.page.evaluate(() => {
          const btns = [...document.querySelectorAll('.veil button')];
          (btns.find((b) => b.textContent.includes('结算')) || btns[btns.length - 1])?.click();
        });
        await s.page.waitForSelector('.screen--result');
        const afterRun2 = await s.page.evaluate(() => ({
          coins: window.__wugeng.save.coins,
          best2: window.__wugeng.dailyChallenge.getState('2026-12-08').todayBestScore,
          weeklyPts2: window.__wugeng.save.daily?.weeklyPoints || 0,
        }));
        assert.ok(afterRun2.coins < coinsBeforeRun2 + 20, `Expected NO duplicate 200-coin daily bonus on 2nd run, got ${afterRun2.coins}`);
        assert.equal(afterRun2.weeklyPts2, 30, 'Expected NO duplicate +30 weekly points on 2nd run');
        assert.ok(afterRun2.best2 > afterRun1.best1, `Expected higher practice run to update todayBestScore (${afterRun1.best1} -> ${afterRun2.best2})`);
        s.assertNoErrors('T2-F18-02');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T2-F18-03',
    tier: 2,
    feature: 'F18',
    name: '[M3.3] Season 血月守夜 toggle isolation: OFF leaves main run untouched; ON injects +12% enemy speed & +15% soul fire XP',
    run: async ({ browser, baseUrl }) => {
      const s = await createIsolatedPage(browser);
      try {
        await bootToHub(s.page, baseUrl);
        await s.page.evaluate(() => window.__wugeng.season.setRuleActive(false));
        await fastClick(s.page, '.hub-cta', 'Start normal run with season rule OFF');
        await s.page.waitForFunction(() => Boolean(window.__wugeng?.game?.run));
        const offCheck = await s.page.evaluate(() => ({
          runRules: window.__wugeng.game.run.runRules,
          xpMul: window.__wugeng.game.run.mods.xpMul,
        }));
        assert.equal(offCheck.runRules, null, 'Main run must have runRules === null when 血月守夜 is OFF');

        // Return to Hub, toggle 血月守夜 ON via UI modal, and start run
        await s.page.evaluate(() => {
          window.__wugeng.game.clear();
          window.__wugeng.showHub();
        });
        await s.page.waitForSelector('.screen--hub');
        await fastClick(s.page, '[data-action="open-season"]', 'Open season modal');
        await fastClick(s.page, '[data-action="toggle-season-rule"]', 'Toggle 血月守夜 ON');
        await closeActiveModal(s.page);

        await fastClick(s.page, '.hub-cta', 'Start run with 血月守夜 ON');
        await s.page.waitForFunction(() => Boolean(window.__wugeng?.game?.run));
        await stepFrames(s.page, 2, { stopOnOverlay: false });
        const onCheck = await s.page.evaluate(() => ({
          mode: window.__wugeng.game.run.runRules?.mode || null,
          enemySpeedMul: window.__wugeng.game.run.runRules?.enemySpeedMul || 1,
          xpMul: window.__wugeng.game.run.mods.xpMul,
        }));
        assert.equal(onCheck.mode, 'season');
        assert.ok(Math.abs(onCheck.enemySpeedMul - 1.12) < 1e-4, `Expected enemySpeedMul=1.12, got ${onCheck.enemySpeedMul}`);
        assert.ok(onCheck.xpMul > offCheck.xpMul * 1.12, `Expected +15% soul fire XP mul (${offCheck.xpMul} -> ${onCheck.xpMul})`);
        s.assertNoErrors('T2-F18-03');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T2-F18-04',
    tier: 2,
    feature: 'F18',
    name: '[M3.3] Season skin zhou_bloodmoon rejects coin purchase before Tier 30 & persists across page reload once unlocked',
    run: async ({ browser, baseUrl }) => {
      const s = await createIsolatedPage(browser, { isolated: true });
      try {
        await bootToHub(s.page, baseUrl, {
          savePatch: {
            coins: 99_999,
            season: { seasonId: 's1', xp: 2900, claimedTiers: [] },
          },
        });
        const lockedCheck = await s.page.evaluate(() => {
          const st = window.__wugeng.season.getState();
          const claim30 = window.__wugeng.season.claimTier(30);
          return { currentTier: st.currentTier, claim30Ok: claim30.ok };
        });
        assert.equal(lockedCheck.currentTier, 29, '2900 令火 must be Tier 29 (100 short of Tier 30)');
        assert.equal(lockedCheck.claim30Ok, false, 'Tier 30 cannot be claimed at 2900 令火');

        // Reach 3000 令火, claim Tier 30, equip zhou_bloodmoon, and reload page
        await s.page.evaluate(() => {
          window.__wugeng.save.season.xp = 3000;
          const r = window.__wugeng.season.claimTier(30);
          if (!r.ok) throw new Error('Expected Tier 30 claim to succeed at 3000 xp');
        });
        await fastClick(s.page, '[data-action="open-season"]', 'Open season modal');
        await fastClick(s.page, '[data-action="equip-bloodmoon-skin"]', 'Equip zhou_bloodmoon');
        await closeActiveModal(s.page);

        await s.page.reload();
        await s.page.waitForSelector('.screen--title');
        const persisted = await s.page.evaluate(() => ({
          owned: window.__wugeng.save.cosmetics?.owned?.includes('zhou_bloodmoon') || false,
          equipped: window.__wugeng.save.cosmetics?.equipped?.heroSkins?.zhou || null,
        }));
        assert.equal(persisted.owned, true, 'zhou_bloodmoon ownership must survive reload');
        assert.equal(persisted.equipped, 'zhou_bloodmoon', 'Equipped zhou_bloodmoon must survive reload');
        s.assertNoErrors('T2-F18-04');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T2-F18-05',
    tier: 2,
    feature: 'F18',
    name: '[M3] Narrow 360x780 viewport bounds audit across Hub 5-lamp ribbon, .daily-modal, .daily-challenge-modal & .season-modal',
    run: async ({ browser, baseUrl }) => {
      const s = await createIsolatedPage(browser, {
        isolated: true,
        viewport: { width: 360, height: 780 },
      });
      try {
        await bootToHub(s.page, baseUrl);
        const hubFit = await s.page.evaluate(() => {
          const btns = [...document.querySelectorAll('.hub-ribbon__btn')];
          const stage = document.querySelector('.hero-stage')?.getBoundingClientRect();
          const cta = document.querySelector('.hub-cta')?.getBoundingClientRect();
          const allInsideStage = btns.every((b) => {
            const r = b.getBoundingClientRect();
            return stage && r.top >= stage.top - 1 && r.bottom <= stage.bottom + 1 && r.right <= 360;
          });
          return {
            ribbonCount: btns.length,
            allInsideStage,
            ctaBottom: cta ? Math.round(cta.bottom) : 9999,
            overflowX: document.documentElement.scrollWidth > 360,
          };
        });
        assert.equal(hubFit.ribbonCount, 5, 'Expected 5 Hub ribbon lamps on unlocked save');
        assert.equal(hubFit.allInsideStage, true, 'All 5 Hub ribbon lamps must fit within .hero-stage on 360x780');
        assert.ok(hubFit.ctaBottom <= 780, `Expected .hub-cta within 360x780 viewport, bottom=${hubFit.ctaBottom}`);
        assert.equal(hubFit.overflowX, false, 'Zero horizontal overflow on 360x780 Hub');

        for (const [sel, modalSel] of [
          ['[data-action="open-daily"]', '.daily-modal'],
          ['[data-action="open-daily-challenge"]', '.daily-challenge-modal'],
          ['[data-action="open-season"]', '.season-modal'],
        ]) {
          await fastClick(s.page, sel, `Open ${modalSel}`);
          await requireOpenSelector(s.page, modalSel);
          const fit = await s.page.evaluate((ms) => {
            const r = document.querySelector(ms)?.getBoundingClientRect();
            return Boolean(r && r.left >= 0 && r.right <= 361 && r.bottom <= 781);
          }, modalSel);
          assert.equal(fit, true, `Expected ${modalSel} strictly within 360x780 viewport`);
          await closeActiveModal(s.page);
        }
        s.assertNoErrors('T2-F18-05');
      } finally {
        await s.close();
      }
    },
  },
];
