// Tier 1 (Part 5): Feature Happy-Path E2E Tests for v4 M3 Retention (F18)
// STRICT OPAQUE-BOX: ZERO imports from ../../src/**.

import assert from 'node:assert/strict';
import {
  DAILY_LEADERBOARD_ID,
  PRIMARY_LEADERBOARD_ID,
  SEASON_LEADERBOARD_ID,
} from './contracts.mjs';
import {
  analyzeCanvasSpriteBox,
  bootToHub,
  closeActiveModal,
  compareSpriteSnapshots,
  createIsolatedPage,
  fastClick,
  requireOpenSelector,
  stepFrames,
  triggerLethalHit,
} from './harness.mjs';

export const TIER1_F18 = [
  {
    id: 'T1-F18-01',
    tier: 1,
    feature: 'F18',
    name: '[M3.1] Hub [data-action="open-daily"] opens .daily-modal with 3 daily tasks, red badge on completion & coin/weekly/season reward claim',
    run: async ({ browser, baseUrl }) => {
      const s = await createIsolatedPage(browser, { isolated: true });
      try {
        await bootToHub(s.page, baseUrl, { savePatch: { coins: 100 } });
        await requireOpenSelector(s.page, '[data-action="open-daily"]', 'Expected 差事 lamp in Hub ribbon');
        await fastClick(s.page, '[data-action="open-daily"]', 'Open daily tasks modal');
        await requireOpenSelector(s.page, '.daily-modal', 'Expected .daily-modal');

        const initial = await s.page.evaluate(() => ({
          taskCount: document.querySelectorAll('.daily-modal .daily-task').length,
          chestCount: document.querySelectorAll('.daily-modal .weekly-chest').length,
        }));
        assert.equal(initial.taskCount, 3, `Expected 3 daily tasks, got ${initial.taskCount}`);
        assert.equal(initial.chestCount, 4, `Expected 4 weekly chests (30/60/100/150), got ${initial.chestCount}`);
        await closeActiveModal(s.page);

        // Start a run, populate rich stats to complete at least 1-2 daily tasks, and settle cleanly
        await fastClick(s.page, '.hub-cta', 'Start run');
        await s.page.waitForFunction(() => Boolean(window.__wugeng?.game?.run));
        await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          r.time = 260;
          r.watch = 4;
          r.player.level = 16;
          r.stats.kills = 520;
          r.stats.coins = 120;
          r.stats.maxCombo = 75;
          r.stats.maxHit = 1500;
          r.stats.eventsCompleted = 2;
          r.stats.killsByType = { horse: 1, umbrella: 1 };
          r.weapons = [
            { id: 'gong', level: 8, cd: 0, evolved: true },
            { id: 'talisman', level: 8, cd: 0, evolved: true },
            { id: 'paperman', level: 5, cd: 0, evolved: false },
            { id: 'lantern', level: 5, cd: 0, evolved: false },
          ];
          r.relics = [
            { id: 'clapper', level: 3 },
            { id: 'censer', level: 3 },
          ];
        });
        await triggerLethalHit(s.page);
        await s.page.evaluate(() => {
          const btns = [...document.querySelectorAll('.veil button')];
          (btns.find((b) => b.textContent.includes('结算')) || btns[btns.length - 1])?.click();
        });
        await s.page.waitForSelector('.screen--result');
        await fastClick(s.page, '[data-action="result-hub"]', 'Return to Hub');
        await s.page.waitForSelector('.screen--hub');

        const badgeCount = await s.page.evaluate(() => {
          const dot = document.querySelector('[data-action="open-daily"] .badge-dot:not([hidden])');
          return dot ? Number(dot.textContent || '0') : 0;
        });
        assert.ok(badgeCount >= 1, `Expected red badge >= 1 on 差事 lamp after completing tasks, got ${badgeCount}`);

        const beforeClaim = await s.page.evaluate(() => ({
          coins: window.__wugeng.save.coins,
          weeklyPts: window.__wugeng.save.daily?.weeklyPoints || 0,
          seasonXp: window.__wugeng.save.season?.xp || 0,
        }));
        await fastClick(s.page, '[data-action="open-daily"]', 'Re-open daily modal to claim');
        await requireOpenSelector(s.page, '[data-action="claim-daily-task"]', 'Expected claimable daily task button');
        await fastClick(s.page, '[data-action="claim-daily-task"]', 'Claim completed daily task');

        const afterClaim = await s.page.evaluate(() => ({
          coins: window.__wugeng.save.coins,
          weeklyPts: window.__wugeng.save.daily?.weeklyPoints || 0,
          seasonXp: window.__wugeng.save.season?.xp || 0,
        }));
        assert.ok(afterClaim.coins >= beforeClaim.coins + 60, `Expected +60..120 coins on task claim (${beforeClaim.coins} -> ${afterClaim.coins})`);
        assert.equal(afterClaim.weeklyPts, beforeClaim.weeklyPts + 10, 'Expected +10 weekly points');
        assert.equal(afterClaim.seasonXp, beforeClaim.seasonXp + 20, 'Expected +20 season 令火');
        await closeActiveModal(s.page);
        s.assertNoErrors('T1-F18-01');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T1-F18-02',
    tier: 1,
    feature: 'F18',
    name: '[M3.1] Weekly chest milestones (30 / 60 / 100 / 150) unlock & grant coins, charms, cosmetic & 令火',
    run: async ({ browser, baseUrl }) => {
      const s = await createIsolatedPage(browser);
      try {
        await bootToHub(s.page, baseUrl, {
          savePatch: { coins: 50 },
        });
        // Align daily weekKey to current local week so 150 pts are active today
        await s.page.evaluate(() => {
          const st = window.__wugeng.daily.getState();
          window.__wugeng.save.daily.date = st.today;
          window.__wugeng.save.daily.weekKey = st.weekKey;
          window.__wugeng.save.daily.weeklyPoints = 150;
          window.__wugeng.save.daily.weeklyClaimed = [];
          window.__wugeng.hub.refresh();
        });

        await fastClick(s.page, '[data-action="open-daily"]', 'Open daily modal');
        await requireOpenSelector(s.page, '[data-action="claim-weekly-chest"][data-points="30"]', 'Expected 30-pt chest claim button');
        await fastClick(s.page, '[data-action="claim-weekly-chest"][data-points="30"]', 'Claim 30-pt chest');
        await fastClick(s.page, '[data-action="claim-weekly-chest"][data-points="150"]', 'Claim 150-pt chest');

        const afterChests = await s.page.evaluate(() => ({
          coins: window.__wugeng.save.coins,
          charms: window.__wugeng.save.charms.length,
          ownedCos: window.__wugeng.save.cosmetics.owned.length,
          claimed: window.__wugeng.save.daily.weeklyClaimed.slice(),
        }));
        assert.ok(afterChests.coins >= 50 + 80 + 240, `Expected chest coins granted, got ${afterChests.coins}`);
        assert.ok(afterChests.charms >= 3, `Expected >= 3 charms from 30+150 chests, got ${afterChests.charms}`);
        assert.ok(afterChests.ownedCos >= 1, 'Expected 150-pt chest to grant a cosmetic item');
        assert.deepEqual(afterChests.claimed, [30, 150]);
        await closeActiveModal(s.page);
        s.assertNoErrors('T1-F18-02');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T1-F18-03',
    tier: 1,
    feature: 'F18',
    name: '[M3.2] Hub [data-action="open-daily-challenge"] launches fixed-seed daily challenge & awards 200-coin first-clear bonus',
    run: async ({ browser, baseUrl }) => {
      const s = await createIsolatedPage(browser, { isolated: true });
      try {
        await bootToHub(s.page, baseUrl, { savePatch: { coins: 100 } });
        await requireOpenSelector(s.page, '[data-action="open-daily-challenge"]', 'Expected 今日异事 pill in Hub');
        await fastClick(s.page, '[data-action="open-daily-challenge"]', 'Open daily challenge modal');
        await requireOpenSelector(s.page, '.daily-challenge-modal', 'Expected .daily-challenge-modal');

        const spec = await s.page.evaluate(() => window.__wugeng.dailyChallenge.getSpec());
        const ruleCount = await s.page.evaluate(() => document.querySelectorAll('.daily-challenge-modal .dc-rule-row').length);
        assert.ok(ruleCount >= 1 && ruleCount <= 2, `Expected 1..2 daily rules rendered, got ${ruleCount}`);

        await fastClick(s.page, '[data-action="start-daily-challenge"]', 'Start daily challenge');
        await s.page.waitForFunction(() => Boolean(window.__wugeng?.game?.run));

        const runCheck = await s.page.evaluate(() => ({
          heroId: window.__wugeng.game.run.heroId,
          startWeapon: window.__wugeng.game.run.startWeapon,
          mode: window.__wugeng.game.run.runRules?.mode || null,
        }));
        assert.equal(runCheck.heroId, spec.heroId, 'Daily challenge must use date-fixed hero');
        assert.equal(runCheck.startWeapon, spec.startWeapon, 'Daily challenge must use date-fixed starter weapon');
        assert.equal(runCheck.mode, 'daily');

        await stepFrames(s.page, 10, { stopOnOverlay: false });
        await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          r.time = 65;
          r.stats.kills = 48;
        });
        await triggerLethalHit(s.page);
        await s.page.evaluate(() => {
          const btns = [...document.querySelectorAll('.veil button')];
          (btns.find((b) => b.textContent.includes('结算')) || btns[btns.length - 1])?.click();
        });
        await s.page.waitForSelector('.screen--result');

        const rewarded = await s.page.evaluate(() => ({
          coins: window.__wugeng.save.coins,
          weeklyPts: window.__wugeng.save.daily?.weeklyPoints || 0,
          rewardedToday: window.__wugeng.dailyChallenge.getState().rewardedToday,
          todayBest: window.__wugeng.dailyChallenge.getState().todayBestScore,
        }));
        assert.ok(rewarded.coins >= 300, `Expected >= 300 coins (100 base + 200 first daily reward), got ${rewarded.coins}`);
        assert.ok(rewarded.weeklyPts >= 30, `Expected +30 weekly points from daily challenge, got ${rewarded.weeklyPts}`);
        assert.equal(rewarded.rewardedToday, true);
        assert.ok(rewarded.todayBest > 0, `Expected positive todayBestScore, got ${rewarded.todayBest}`);
        s.assertNoErrors('T1-F18-03');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T1-F18-04',
    tier: 1,
    feature: 'F18',
    name: '[M3.3] Hub [data-action="open-season"] opens 30-tier 守夜令·血月, claims Tier 30 老周·血月 & updates live Hub stage canvas',
    run: async ({ browser, baseUrl }) => {
      const s = await createIsolatedPage(browser, { isolated: true });
      try {
        await bootToHub(s.page, baseUrl, {
          savePatch: {
            selectedHero: 'zhou',
            season: { seasonId: 's1', xp: 3000, claimedTiers: [], activeRule: false },
          },
        });
        const snapBefore = await analyzeCanvasSpriteBox(s.page, '.hero-stage__canvas');
        await fastClick(s.page, '[data-action="open-season"]', 'Open season modal');
        await requireOpenSelector(s.page, '.season-modal', 'Expected .season-modal');

        const tierCount = await s.page.evaluate(() => document.querySelectorAll('.season-modal .season-tier').length);
        assert.equal(tierCount, 30, `Expected 30 free season tiers, got ${tierCount}`);

        await fastClick(s.page, '[data-action="claim-all-season"]', 'Claim all 30 season tiers');
        await requireOpenSelector(s.page, '[data-action="equip-bloodmoon-skin"]', 'Expected equip-bloodmoon-skin button after Tier 30 claim');
        await fastClick(s.page, '[data-action="equip-bloodmoon-skin"]', 'Equip 老周·血月');
        await closeActiveModal(s.page);
        await s.page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

        const snapAfter = await analyzeCanvasSpriteBox(s.page, '.hero-stage__canvas');
        const cmp = compareSpriteSnapshots(snapBefore, snapAfter);
        assert.ok(
          cmp.pixelDiffRatio > 0.10,
          `Expected live Hub stage canvas to update >10% after equipping zhou_bloodmoon, got ${(cmp.pixelDiffRatio * 100).toFixed(1)}%`,
        );
        const equipped = await s.page.evaluate(() => window.__wugeng.save.cosmetics?.equipped?.heroSkins?.zhou);
        assert.equal(equipped, 'zhou_bloodmoon');
        s.assertNoErrors('T1-F18-04');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T1-F18-05',
    tier: 1,
    feature: 'F18',
    name: '[M3.2/M3.3] .leaderboard-modal switches across 守夜总榜 / 每日异事榜 (ofuwiinc9n5khd1ehh) / 守夜令榜 (hxw70v121367vj083y) with SDK + local fallback',
    run: async ({ browser, baseUrl }) => {
      const s = await createIsolatedPage(browser);
      try {
        await bootToHub(s.page, baseUrl, {
          savePatch: {
            leaderboard: { bestScore: 19_500 },
            dailyChallenge: {
              todayDate: '2026-12-05',
              todayBestScore: 8420,
              bestScore: 8420,
              history: [{ date: '2026-12-05', score: 8420, daoName: '异事魁首', heroId: 'mian', kills: 310, timeSec: 280, at: 1 }],
            },
            season: {
              seasonId: 's1',
              xp: 500,
              bestSeasonScore: 14_600,
              history: [{ score: 14_600, daoName: '血月执更', heroId: 'zhou', nightLevel: 1, kills: 420, timeSec: 350, at: 2 }],
            },
          },
        });
        await fastClick(s.page, '[data-action="open-leaderboard"]', 'Open leaderboard modal');
        await requireOpenSelector(s.page, '.leaderboard-modal', 'Expected .leaderboard-modal');

        await fastClick(s.page, '[data-board="daily"]', 'Switch to 每日异事榜');
        const dailyTxt = await s.page.evaluate(() => (document.querySelector('.leaderboard-modal')?.textContent || '').replace(/,/g, ''));
        assert.ok(dailyTxt.includes('8420'), `Expected daily score 8420 on 每日异事榜, got: ${dailyTxt}`);
        assert.ok(dailyTxt.includes(DAILY_LEADERBOARD_ID), `Expected header to include ${DAILY_LEADERBOARD_ID}`);

        await fastClick(s.page, '[data-board="season"]', 'Switch to 守夜令榜');
        const seasonTxt = await s.page.evaluate(() => (document.querySelector('.leaderboard-modal')?.textContent || '').replace(/,/g, ''));
        assert.ok(seasonTxt.includes('14600'), `Expected season score 14600 on 守夜令榜, got: ${seasonTxt}`);
        assert.ok(seasonTxt.includes(SEASON_LEADERBOARD_ID), `Expected header to include ${SEASON_LEADERBOARD_ID}`);

        await fastClick(s.page, '[data-board="primary"]', 'Switch back to 守夜总榜');
        await requireOpenSelector(s.page, '[data-collection="public"]', 'Expected public tab visible on primary board');
        await requireOpenSelector(s.page, '[data-collection="friends"]', 'Expected friends tab visible on primary board');
        await closeActiveModal(s.page);
        s.assertNoErrors('T1-F18-05-local');
      } finally {
        await s.close();
      }

      const sTap = await createIsolatedPage(browser, {
        beforeBootInitScript: () => {
          window.__subLbCalls = [];
          window.tap = {
            getLeaderboardManager() {
              return {
                loadLeaderboardScores(p) {
                  window.__subLbCalls.push({ method: 'loadLeaderboardScores', leaderboardId: p?.leaderboardId, collection: p?.collection });
                  const score = p?.leaderboardId === 'ofuwiinc9n5khd1ehh' ? 21_300 : p?.leaderboardId === 'hxw70v121367vj083y' ? 46_800 : 59_900;
                  p?.callback?.onSuccess?.({
                    scores: [{ rank: 1, score, user: { name: '云端魁首' } }],
                  });
                },
                loadCurrentPlayerLeaderboardScore(p) {
                  window.__subLbCalls.push({ method: 'loadCurrentPlayerLeaderboardScore', leaderboardId: p?.leaderboardId });
                  p?.callback?.onSuccess?.({
                    currentUserScore: { rank: 2, score: 12_500, user: { name: '剑清道友' } },
                  });
                },
                submitScores(p) {
                  window.__subLbCalls.push({ method: 'submitScores', scores: p?.scores });
                  p?.callback?.onSuccess?.({ results: [] });
                },
                openLeaderboard(p) {
                  window.__subLbCalls.push({ method: 'openLeaderboard', leaderboardId: p?.leaderboardId, collection: p?.collection });
                  p?.callback?.onSuccess?.({});
                },
              };
            },
          };
        },
      });
      try {
        await bootToHub(sTap.page, baseUrl);
        await fastClick(sTap.page, '[data-action="open-leaderboard"]', 'Open live leaderboard modal');
        await requireOpenSelector(sTap.page, '.leaderboard-modal', 'Expected .leaderboard-modal');

        await fastClick(sTap.page, '[data-board="daily"]', 'Switch to live 每日异事榜');
        await sTap.page.waitForFunction(
          (id) => (window.__subLbCalls || []).some((c) => c.method === 'loadLeaderboardScores' && c.leaderboardId === id),
          DAILY_LEADERBOARD_ID,
          { timeout: 3000 },
        );
        const liveDailyTxt = await sTap.page.evaluate(() => (document.querySelector('.leaderboard-modal')?.textContent || '').replace(/,/g, ''));
        assert.ok(liveDailyTxt.includes('21300'), `Expected live daily score 21300, got: ${liveDailyTxt}`);

        await fastClick(sTap.page, '[data-board="season"]', 'Switch to live 守夜令榜');
        await sTap.page.waitForFunction(
          (id) => (window.__subLbCalls || []).some((c) => c.method === 'loadLeaderboardScores' && c.leaderboardId === id),
          SEASON_LEADERBOARD_ID,
          { timeout: 3000 },
        );
        const liveSeasonTxt = await sTap.page.evaluate(() => (document.querySelector('.leaderboard-modal')?.textContent || '').replace(/,/g, ''));
        assert.ok(liveSeasonTxt.includes('46800'), `Expected live season score 46800, got: ${liveSeasonTxt}`);

        await fastClick(sTap.page, '[data-action="open-native-leaderboard"]', 'Open native season leaderboard');
        const calls = await sTap.page.evaluate(() => window.__subLbCalls || []);
        assert.ok(
          calls.some((c) => c.method === 'openLeaderboard' && c.leaderboardId === SEASON_LEADERBOARD_ID),
          `Expected openLeaderboard with ${SEASON_LEADERBOARD_ID}`,
        );
        assert.ok(
          calls.some((c) => c.method === 'loadLeaderboardScores' && c.leaderboardId === PRIMARY_LEADERBOARD_ID),
          `Expected initial loadLeaderboardScores with ${PRIMARY_LEADERBOARD_ID}`,
        );
        await closeActiveModal(sTap.page);
        sTap.assertNoErrors('T1-F18-05-tap');
      } finally {
        await sTap.close();
      }
    },
  },
];
