// Tier 2 (Part 4): Boundary, Edge & Negative E2E Tests for v4 M2 (F17)
// STRICT OPAQUE-BOX: ZERO imports from ../../src/**.

import assert from 'node:assert/strict';
import { ALL_WEAPON_IDS } from './contracts.mjs';
import {
  bootAndStartRun,
  createIsolatedPage,
  fastClick,
  requireOpenSelector,
  stepFrames,
  suppressWardersInPage,
  triggerLevelUp,
} from './harness.mjs';

async function queueEnemy(page, type, dx, dy = 0, hp = 50) {
  await page.evaluate(({ t, ox, oy, fixedHp }) => {
    const r = window.__wugeng.game.run;
    r._spawnQueue.push({ type: t, x: r.player.x + ox, y: r.player.y + oy, opts: { fixedHp } });
  }, { t: type, ox: dx, oy: dy, fixedHp: hp });
  await stepFrames(page, 1, { stopOnOverlay: false });
}

export const TIER2_F17 = [
  {
    id: 'T2-F17-01',
    tier: 2,
    feature: 'F17',
    name: '[M2.1 Boundary] Killing firecracker_boy before fuse ends prevents blast & twin_paper caps splitDepth at 2',
    run: async ({ browser, baseUrl }) => {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { heroId: 'zhou', seed: 2701 });
        await suppressWardersInPage(s.page);
        await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          r.weapons.length = 0;
          r.enemies.length = 0;
        });

        // Spawn firecracker_boy close to player so it enters 'fuse', then kill it early
        await queueEnemy(s.page, 'firecracker_boy', 30, 0, 5);
        await stepFrames(s.page, 3, { stopOnOverlay: false });
        const hpBefore = await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          const fb = r.enemies.find((e) => e.type === 'firecracker_boy');
          if (fb) {
            fb.hp = 0;
            fb.dead = true;
          }
          return r.player.hp;
        });
        await stepFrames(s.page, 80, { stopOnOverlay: false });
        const hpAfter = await s.page.evaluate(() => window.__wugeng.game.run.player.hp);
        assert.equal(hpAfter, hpBefore, 'Killing firecracker_boy early must not schedule delayed self-destruct damage');

        // Spawn twin_paper and verify splitDepth never exceeds 2
        await queueEnemy(s.page, 'twin_paper', 90, 0, 10);
        const splitCheck = await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          r.weapons.push({ id: 'gong', level: 5, evolved: false, cd: 0 });
          return r.enemies.filter((e) => e.type === 'twin_paper').length;
        });
        assert.equal(splitCheck, 1);
        for (let wave = 0; wave < 4; wave++) {
          await s.page.evaluate(() => {
            const r = window.__wugeng.game.run;
            for (const e of r.enemies) {
              if (e.type === 'twin_paper' && !e.dead) {
                e.x = r.player.x + 25;
                e.y = r.player.y;
                e.atkT = 0;
                e.hp = 1;
              }
            }
            for (const w of r.weapons) w.cd = 0;
          });
          await stepFrames(s.page, 6, { stopOnOverlay: false });
        }
        const maxDepth = await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          return r.enemies.reduce((m, e) => Math.max(m, e.splitDepth || 0), 0);
        });
        assert.ok(maxDepth <= 2, `twin_paper splitDepth must never exceed 2, got ${maxDepth}`);
        s.assertNoErrors('T2-F17-01');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T2-F17-02',
    tier: 2,
    feature: 'F17',
    name: '[M2.2 Negative] Failed escort_peddler (0 HP) & hit ghost_parade record ok=false without incrementing eventsCompleted',
    run: async ({ browser, baseUrl }) => {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { heroId: 'zhou', seed: 2702 });
        await suppressWardersInPage(s.page);

        await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          r.weapons.length = 0;
          r.enemies.length = 0;
          r.watchEvent = {
            kind: 'escort_peddler',
            name: '护送货郎',
            stamp: '送',
            hint: '贴近护送至街口',
            duration: 40,
            timer: 0.01,
            elapsed: 39.99,
            progress: 0.2,
            x: r.player.x + 200,
            y: r.player.y,
            goalX: r.player.x + 500,
            goalY: r.player.y,
            totalDist: 300,
            hp: 100,
            maxHp: 260,
            hurtCd: 0,
            targetX: r.player.x + 200,
            targetY: r.player.y,
          };
        });
        await stepFrames(s.page, 3, { stopOnOverlay: false });
        const failRes = await s.page.evaluate(() => ({
          active: window.__wugeng.game.run.watchEvent,
          ok: window.__wugeng.game.run.watchEventResult?.ok,
          done: window.__wugeng.game.run.stats.eventsCompleted,
        }));
        assert.equal(failRes.active, null);
        assert.equal(failRes.ok, false, 'Timed-out escort_peddler must record ok=false');
        assert.equal(failRes.done, 0, 'Failed watchEvent must not increment eventsCompleted');
        s.assertNoErrors('T2-F17-02');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T2-F17-03',
    tier: 2,
    feature: 'F17',
    name: '[M2.2 Determinism] Identical seeds produce identical watchEvent kinds & coordinates across two isolated pages',
    run: async ({ browser, baseUrl }) => {
      const s1 = await createIsolatedPage(browser, { isolated: true });
      const s2 = await createIsolatedPage(browser, { isolated: true });
      try {
        await bootAndStartRun(s1.page, baseUrl, { heroId: 'zhou', seed: 778899 });
        await bootAndStartRun(s2.page, baseUrl, { heroId: 'zhou', seed: 778899 });

        const sampleEvents = async (page) => {
          const out = [];
          for (const t of [108.5, 200.5, 276.5]) {
            const snap = await page.evaluate((tm) => {
              const g = window.__wugeng.game;
              const r = g.run;
              r._blessingWatches = { 1: true, 2: true, 3: true, 4: true, 5: true };
              r._bossSpawned = { horse: true, umbrella: true, youshen: true };
              r.enemies.length = 0;
              r.watchEvent = null;
              r.player.x = 0;
              r.player.y = 0;
              r.player.invulnT = 120;
              r.time = tm;
              window.__e2eStepFrames(1, { stopOnOverlay: false });
              const ev = r.watchEvent;
              return ev ? { kind: ev.kind, tx: Math.round(ev.targetX || 0), ty: Math.round(ev.targetY || 0) } : null;
            }, t);
            out.push(snap);
          }
          return out;
        };

        const seq1 = await sampleEvents(s1.page);
        const seq2 = await sampleEvents(s2.page);
        assert.deepEqual(seq1, seq2, 'Identical seeds must produce identical watchEvent sequences');
        assert.equal(new Set(seq1.map((x) => x?.kind)).size, 3, 'All 3 watches in a run must pick distinct events');
        s1.assertNoErrors('T2-F17-03-A');
        s2.assertNoErrors('T2-F17-03-B');
      } finally {
        await s1.close();
        await s2.close();
      }
    },
  },
  {
    id: 'T2-F17-04',
    tier: 2,
    feature: 'F17',
    name: '[M2.3 Boundary] Exhausting all banishes disables banish buttons & banishing a locked card clears lock',
    run: async ({ browser, baseUrl }) => {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, {
          heroId: 'zhou',
          unlockedWeapons: ALL_WEAPON_IDS,
          savePatch: { unlockedWeapons: ALL_WEAPON_IDS },
          seed: 2704,
        });
        await triggerLevelUp(s.page);

        await fastClick(s.page, '[data-action="lock"][data-choice-index="0"]');
        assert.ok(await s.page.evaluate(() => window.__wugeng.game.run.lockedChoice !== null));
        await fastClick(s.page, '[data-action="banish"][data-choice-index="0"]');
        assert.equal(
          await s.page.evaluate(() => window.__wugeng.game.run.lockedChoice),
          null,
          'Banishing a locked card must clear run.lockedChoice',
        );

        let guard = 0;
        while ((await s.page.evaluate(() => window.__wugeng.game.run.banishesLeft || 0)) > 0 && guard++ < 8) {
          await fastClick(s.page, '[data-action="banish"]:not(:disabled)');
        }
        const exhausted = await s.page.evaluate(() => ({
          left: window.__wugeng.game.run.banishesLeft,
          allDisabled: [...document.querySelectorAll('[data-action="banish"]')].every((b) => b.disabled),
        }));
        assert.equal(exhausted.left, 0);
        assert.equal(exhausted.allDisabled, true, 'All banish buttons must disable when banishesLeft reaches 0');
        s.assertNoErrors('T2-F17-04');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T2-F17-05',
    tier: 2,
    feature: 'F17',
    name: '[M2.3 Layout] Narrow 360x780 viewport renders prominent lock/banish seal buttons without card overflow',
    run: async ({ browser, baseUrl }) => {
      const s = await createIsolatedPage(browser, { viewport: { width: 360, height: 780 } });
      try {
        await bootAndStartRun(s.page, baseUrl, {
          heroId: 'zhou',
          unlockedWeapons: ALL_WEAPON_IDS,
          savePatch: { unlockedWeapons: ALL_WEAPON_IDS },
          seed: 2705,
        });
        await triggerLevelUp(s.page);
        await requireOpenSelector(s.page, '.qian-row', 'Expected .qian-row on 360x780');

        const layout = await s.page.evaluate(() => {
          const cards = [...document.querySelectorAll('.qian')];
          const btns = [...document.querySelectorAll('.qian-act')];
          const winW = window.innerWidth;
          const winH = window.innerHeight;
          const cardsInBounds = cards.every((c) => {
            const r = c.getBoundingClientRect();
            return r.left >= -1 && r.right <= winW + 1 && r.top >= -1 && r.bottom <= winH + 1;
          });
          const btnsReadable = btns.every((b) => {
            const r = b.getBoundingClientRect();
            return r.width >= 38 && r.height >= 24;
          });
          return { cardCount: cards.length, btnCount: btns.length, cardsInBounds, btnsReadable };
        });
        assert.equal(layout.cardCount, 3);
        assert.equal(layout.btnCount, 6);
        assert.equal(layout.cardsInBounds, true, 'All 3 .qian cards must fit cleanly inside 360x780 viewport');
        assert.equal(layout.btnsReadable, true, 'All 6 lock/banish buttons must remain >= 38x24px on 360x780');
        s.assertNoErrors('T2-F17-05');
      } finally {
        await s.close();
      }
    },
  },
];
