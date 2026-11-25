// Tier 2 (Part 6): Boundary, Resilience & Rate-Limit E2E Tests for v4 M4 True Online Co-op (F19)
// STRICT OPAQUE-BOX: ZERO imports from ../../src/**.

import assert from 'node:assert/strict';
import {
  bootToHub,
  closeActiveModal,
  createCoopPages,
  createIsolatedPage,
  fastClick,
  requireOpenSelector,
  stepCoopFrames,
  stepFrames,
} from './harness.mjs';
import { tapOnlineBattleInitScript } from './tier1-f19.mjs';

export const TIER2_F19 = [
  {
    id: 'T2-F19-01',
    tier: 2,
    feature: 'F19',
    timeoutMs: 20_000,
    name: '[M4.2] Rapid input bursts & room updates strictly obey <=15 msg/s rate limit & <=2048B packet cap',
    run: async ({ browser, baseUrl }) => {
      const ch = `__tap_t2_f19_01_${Date.now()}`;
      const coop = await createCoopPages(browser, 2, {
        beforeBootInitScript: tapOnlineBattleInitScript,
        beforeBootArg: ch,
      });
      try {
        await bootToHub(coop.hostPage, baseUrl);
        await bootToHub(coop.guestPage, baseUrl);

        await coop.hostPage.evaluate(() => window.__wugeng.coop.createRoom().ready);
        const code = await coop.hostPage.evaluate(() => window.__wugeng.coop.roomCode);
        await coop.guestPage.evaluate((c) => window.__wugeng.coop.joinRoom(c), code);
        await coop.hostPage.waitForFunction(() => window.__wugeng.coop.getParty().length === 2);

        // Toggle ready rapidly 12 times in 20ms before match start
        await coop.guestPage.evaluate(() => {
          for (let i = 0; i < 12; i++) window.__wugeng.coop.toggleReady();
        });
        await coop.hostPage.evaluate(() => window.__wugeng.coop.startMatch({ seed: 778899 }));
        await coop.guestPage.waitForFunction(() => Boolean(window.__wugeng.game.run?._coopLockstep));

        for (let i = 0; i < 5; i++) {
          await coop.guestPage.keyboard.down(i % 2 === 0 ? 'KeyD' : 'KeyA');
          await stepCoopFrames([coop.hostPage, coop.guestPage], 6, 6);
          await coop.guestPage.keyboard.up(i % 2 === 0 ? 'KeyD' : 'KeyA');
          await new Promise((r) => setTimeout(r, 105));
        }

        const [hStats, gStats] = await Promise.all([
          coop.hostPage.evaluate(() => window.__e2eTapBattle.stats),
          coop.guestPage.evaluate(() => window.__e2eTapBattle.stats),
        ]);
        assert.deepEqual(hStats.violations, [], `Host TapTap SDK violations: ${hStats.violations.join(',')}`);
        assert.deepEqual(gStats.violations, [], `Guest TapTap SDK violations: ${gStats.violations.join(',')}`);
        assert.ok(hStats.maxRateObserved <= 15 && gStats.maxRateObserved <= 15);
        assert.ok(hStats.maxBytesObserved <= 2048 && gStats.maxBytesObserved <= 2048);
        coop.assertNoErrors('T2-F19-01');
      } finally {
        await coop.close();
      }
    },
  },
  {
    id: 'T2-F19-02',
    tier: 2,
    feature: 'F19',
    timeoutMs: 20_000,
    name: '[M4.3] Peer network drop: >1s mounts .coop-wait-banner ("等待道友") & >8s triggers AI takeover',
    run: async ({ browser, baseUrl }) => {
      const ch = `__tap_t2_f19_02_${Date.now()}`;
      const coop = await createCoopPages(browser, 2, {
        beforeBootInitScript: tapOnlineBattleInitScript,
        beforeBootArg: ch,
      });
      try {
        await bootToHub(coop.hostPage, baseUrl);
        await bootToHub(coop.guestPage, baseUrl);

        await coop.hostPage.evaluate(() => window.__wugeng.coop.createRoom().ready);
        const code = await coop.hostPage.evaluate(() => window.__wugeng.coop.roomCode);
        await coop.guestPage.evaluate((c) => window.__wugeng.coop.joinRoom(c), code);
        await coop.hostPage.waitForFunction(() => window.__wugeng.coop.getParty().length === 2);
        await coop.hostPage.evaluate(() => window.__wugeng.coop.startMatch({ seed: 334455 }));
        await coop.guestPage.waitForFunction(() => Boolean(window.__wugeng.game.run?._coopLockstep));

        // Mute Guest network and drain pre-buffered turns (Turn 0..1 = 12 frames) so Host blocks on Turn 2
        await coop.guestPage.evaluate(() => window.__e2eTapBattle.setMuted(true));
        await stepFrames(coop.hostPage, 18, { stopOnOverlay: false });

        // Advance Host coop clock by 1.2s -> .coop-wait-banner appears!
        await coop.hostPage.evaluate(() => window.__wugeng.coop.advanceClock(1200));
        await stepFrames(coop.hostPage, 2, { stopOnOverlay: false });
        await requireOpenSelector(coop.hostPage, '.coop-wait-banner', 'Expected .coop-wait-banner after >1s peer silence');
        const bannerTxt = await coop.hostPage.textContent('.coop-wait-banner');
        assert.ok(bannerTxt.includes('等待道友'), `Expected 等待道友 text, got '${bannerTxt}'`);

        // Advance Host coop clock past 8s -> Guest slot converts to Daoist AI bot & Host simulation resumes!
        const tBlocked = await coop.hostPage.evaluate(() => window.__wugeng.game.run.time);
        await coop.hostPage.evaluate(() => window.__wugeng.coop.advanceClock(8000));
        await stepFrames(coop.hostPage, 18, { stopOnOverlay: false });

        const afterTakeover = await coop.hostPage.evaluate(() => ({
          time: window.__wugeng.game.run.time,
          slot1IsBot: window.__wugeng.game.run.players[1].isBot,
          bannerGone: !document.querySelector('.coop-wait-banner'),
        }));
        assert.equal(afterTakeover.slot1IsBot, true, 'Expected disconnected Guest slot promoted to Daoist AI after 8s');
        assert.equal(afterTakeover.bannerGone, true, 'Expected .coop-wait-banner cleared after AI takeover');
        assert.ok(afterTakeover.time > tBlocked + 0.15, `Expected Host simulation to advance post-takeover (${tBlocked} -> ${afterTakeover.time})`);
        coop.assertNoErrors('T2-F19-02');
      } finally {
        await coop.close();
      }
    },
  },
  {
    id: 'T2-F19-03',
    tier: 2,
    feature: 'F19',
    timeoutMs: 25_000,
    name: '[M4.3] Turn-20 32-bit state hash check detects forced Guest drift & recovers via <=1.8KB chunked snapshot',
    run: async ({ browser, baseUrl }) => {
      const ch = `__tap_t2_f19_03_${Date.now()}`;
      const coop = await createCoopPages(browser, 2, {
        beforeBootInitScript: tapOnlineBattleInitScript,
        beforeBootArg: ch,
      });
      try {
        await bootToHub(coop.hostPage, baseUrl);
        await bootToHub(coop.guestPage, baseUrl);

        await coop.hostPage.evaluate(() => window.__wugeng.coop.createRoom().ready);
        const code = await coop.hostPage.evaluate(() => window.__wugeng.coop.roomCode);
        await coop.guestPage.evaluate((c) => window.__wugeng.coop.joinRoom(c), code);
        await coop.hostPage.waitForFunction(() => window.__wugeng.coop.getParty().length === 2);
        await coop.hostPage.evaluate(() => window.__wugeng.coop.startMatch({ seed: 667788 }));
        await coop.guestPage.waitForFunction(() => Boolean(window.__wugeng.game.run?._coopLockstep));

        // Corrupt Guest players[1].x by +650px before Turn 20
        await coop.guestPage.evaluate(() => {
          window.__wugeng.game.run.players[1].x += 650;
        });

        // Step across Turn 20 (22 turns = 132 frames) with 105ms throttle pacing so ls_hash -> ls_hash_mismatch -> ls_corr completes
        for (let t = 0; t < 23; t++) {
          await stepCoopFrames([coop.hostPage, coop.guestPage], 6, 6);
          await coop.hostPage.evaluate(() => window.__wugeng.coop.advanceClock(120));
          await coop.guestPage.evaluate(() => window.__wugeng.coop.advanceClock(120));
          await new Promise((r) => setTimeout(r, 110));
        }
        await new Promise((r) => setTimeout(r, 260));

        const [hostX, guestRes] = await Promise.all([
          coop.hostPage.evaluate(() => window.__wugeng.game.run.players[1].x),
          coop.guestPage.evaluate(() => ({
            x: window.__wugeng.game.run.players[1].x,
            ls: window.__wugeng.coop.getState().lockstepStats,
          })),
        ]);
        assert.ok((guestRes.ls?.desyncCount || 0) >= 1, 'Guest must detect Turn-20 hash mismatch');
        assert.ok((guestRes.ls?.recoveredCount || 0) >= 1, 'Guest must apply Host <=1.8KB correction chunks');
        assert.ok(Math.abs(guestRes.x - hostX) < 15, `Expected Guest X reconciled to Host (${guestRes.x} vs ${hostX})`);
        coop.assertNoErrors('T2-F19-03');
      } finally {
        await coop.close();
      }
    },
  },
  {
    id: 'T2-F19-04',
    tier: 2,
    feature: 'F19',
    name: '[M4.4] Environment without tap.getOnlineBattleManager or BroadcastChannel shows "当前环境暂不支持联机" cleanly & keeps AI coop working',
    run: async ({ browser, baseUrl }) => {
      const s = await createIsolatedPage(browser, {
        beforeBootInitScript: () => {
          delete window.tap;
          window.BroadcastChannel = undefined;
        },
      });
      try {
        await bootToHub(s.page, baseUrl);
        await fastClick(s.page, '[data-action="open-coop"]', 'Open Co-op Lobby without online transports');
        await requireOpenSelector(s.page, '.coop-modal');

        const statusTxt = await s.page.textContent('.coop-status');
        assert.ok(statusTxt.includes('当前环境暂不支持联机'), `Expected 当前环境暂不支持联机 notice, got '${statusTxt}'`);

        const joinRes = await s.page.evaluate(() => window.__wugeng.coop.joinRoom('AB23CD'));
        assert.equal(joinRes.ok, false);
        assert.ok(joinRes.message.includes('当前环境暂不支持联机'));

        // Still allows adding Daoist AI bot and starting local AI co-op run cleanly
        await fastClick(s.page, '[data-action="coop-add-bot"]', 'Add Daoist AI bot offline');
        await fastClick(s.page, '[data-action="coop-start"]', 'Start offline AI co-op run');
        await s.page.waitForFunction(() => window.__wugeng.game.run?.players?.length === 2);
        s.assertNoErrors('T2-F19-04');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T2-F19-05',
    tier: 2,
    feature: 'F19',
    name: '[M4.4] Narrow 360x780 viewport bounds audit on redesigned 3-entry .coop-modal',
    run: async ({ browser, baseUrl }) => {
      const s = await createIsolatedPage(browser, {
        isolated: true,
        viewport: { width: 360, height: 780 },
      });
      try {
        await bootToHub(s.page, baseUrl);
        await fastClick(s.page, '[data-action="open-coop"]');
        await requireOpenSelector(s.page, '.coop-modal');

        const fit = await s.page.evaluate(() => {
          const modal = document.querySelector('.coop-modal')?.getBoundingClientRect();
          const entries = [...document.querySelectorAll('.coop-entry-card')].map((el) => el.getBoundingClientRect());
          return {
            modalFits: Boolean(modal && modal.left >= 0 && modal.right <= 361 && modal.bottom <= 781),
            entryCount: entries.length,
            entriesFit: entries.every((r) => r.left >= 0 && r.right <= 360),
          };
        });
        assert.equal(fit.modalFits, true, 'Expected .coop-modal strictly within 360x780');
        assert.equal(fit.entryCount, 2, 'Expected 2 top entry cards + 1 room-code input bar');
        assert.equal(fit.entriesFit, true, 'Expected .coop-entry-card elements strictly within 360px width');
        await closeActiveModal(s.page);
        s.assertNoErrors('T2-F19-05');
      } finally {
        await s.close();
      }
    },
  },
];
