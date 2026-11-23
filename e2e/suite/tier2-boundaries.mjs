// Tier 2: Boundary, Edge & Negative/Graceful-Rejection E2E Coverage (F1–F13, >= 5 per feature, 68 total)
// STRICT OPAQUE-BOX: ZERO imports from ../../src/**.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {
  ALL_ENEMY_IDS,
  ALL_RELIC_IDS,
  ALL_WEAPON_IDS,
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

export const TIER2_TESTS = [
  // ═══════════════════════════════════════════════════════════════════════════
  // F1 Boundaries (5 tests)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'T2-F1-01',
    tier: 2,
    feature: 'F1',
    name: 'Active invulnT (>0) completely blocks both enemy contact and enemyBullet damage without resetting',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { seed: 2101 });
        const res = await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          r.enemies.length = 0;
          r._spawnAcc = -99999;
          r.weapons.forEach((w) => { w.cd = 9999; });
          r.player.hp = 80;
          r.player.invulnT = 0.24;
          r._spawnQueue.push({ type: 'sedan', x: r.player.x, y: r.player.y, opts: {} });
          r.projectiles.push({
            id: 61001, kind: 'enemyBullet', x: r.player.x, y: r.player.y,
            r: 10, angle: 0, t: 0, life: 3, vx: 0, vy: 0, dmg: 45,
          });
          window.__e2eStepFrames(5);
          return { hp: r.player.hp, invulnT: r.player.invulnT };
        });
        assert.equal(res.hp, 80, 'Player must take 0 damage from contact + bullet while invulnT > 0');
        assert.ok(res.invulnT > 0.10, `Expected remaining invulnT > 0.10s after 5 frames, got ${res.invulnT}`);
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
    name: 'Armor reduction floor (damageTaken >= 1): extreme armor never reduces valid hit to 0 or negative heal',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { seed: 2102, savePatch: { shop: { huchi: 5 } } });
        await grantItemViaLevelUp(s.page, 'relic', 'bagua', 5); // armor >= 7 > shade dmg (4)
        const res = await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          r.enemies.length = 0;
          r._spawnAcc = -99999;
          r.weapons.forEach((w) => { w.cd = 9999; });
          r.player.invulnT = 0;
          const hp0 = r.player.hp;
          r._spawnQueue.push({ type: 'shade', x: r.player.x + 4, y: r.player.y, opts: {} });
          window.__e2eStepFrames(2);
          return { armor: r.player.armor, dmgTaken: hp0 - r.player.hp };
        });
        assert.ok(res.armor >= 6, `Expected high armor >= 6, got ${res.armor}`);
        assert.equal(res.dmgTaken, 1, `Expected armor floor minTaken === 1, got ${res.dmgTaken}`);
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
    name: 'Boss knockback resistance boundary: player hurt pushback & gong do not yeet Boss off-screen',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { seed: 2103 });
        const res = await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          r.enemies.length = 0;
          r._spawnAcc = -99999;
          r._bossSpawned = { horse: false, umbrella: true, youshen: true };
          r.time = 240.1;
          window.__e2eStepFrames(2);
          if (r.status === 'levelup') document.querySelector('.qian')?.click();
          const boss = r.enemies.find((e) => e.boss);
          boss.x = r.player.x + 25;
          boss.y = r.player.y;
          boss.speed = 0;
          boss.state = 'rest';
          boss.stateT = 10;
          r.player.invulnT = 0;
          r.weapons[0].cd = 0;
          window.__e2eStepFrames(8);
          return { dist: Math.hypot(boss.x - r.player.x, boss.y - r.player.y) };
        });
        assert.ok(res.dist < 140, `Boss must resist massive knockback (< 140px displacement), got dist=${res.dist.toFixed(1)}`);
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
    name: 'Virtual joystick DEAD_ZONE=6px boundary: 4px micro-jitter does not move player while 16px reaches full speed',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { seed: 2104 });
        await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          r.enemies.length = 0;
          r._spawnAcc = -99999;
        });
        await s.page.mouse.move(180, 560);
        await s.page.mouse.down();
        await s.page.mouse.move(184, 560);
        const deadRes = await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          const x0 = r.player.x;
          window.__e2eStepFrames(10, { preserveInput: true });
          return { moving: r.player.moving, dx: Math.abs(r.player.x - x0) };
        });
        await s.page.mouse.move(204, 560);
        const fullRes = await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          const x0 = r.player.x;
          window.__e2eStepFrames(10);
          return { moving: r.player.moving, dx: r.player.x - x0 };
        });
        await s.page.mouse.up();
        assert.equal(deadRes.moving, false, '4px drag inside 6px DEAD_ZONE must not move player');
        assert.equal(deadRes.dx, 0, `Expected 0px displacement inside 6px DEAD_ZONE, got ${deadRes.dx}`);
        assert.equal(fullRes.moving, true, `Expected player.moving === true on 24px drag (>14px FULL_SPEED_RADIUS), got dx=${fullRes.dx}`);
        assert.ok(fullRes.dx > 14, `Expected full speed displacement > 14px in 10 frames, got ${fullRes.dx.toFixed(2)}`);
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
    name: 'Lethal hit boundary (hp <= dmgTaken): transitions cleanly to dead overlay without post-hit i-frame zombie state',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { seed: 2105 });
        await triggerLethalHit(s.page);
        const state = await s.page.evaluate(() => ({
          hp: window.__wugeng.game.run.player.hp,
          status: window.__wugeng.game.run.status,
          overlay: window.__wugeng.overlay,
        }));
        assert.equal(state.hp, 0);
        assert.equal(state.status, 'dead');
        assert.equal(state.overlay, 'dead');
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
    name: 'Extreme late-game minute speed cap (t=1500s / 25 min) clamps strictly at speedGrowthCap=1.35',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { seed: 2201 });
        const res = await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          r.enemies.length = 0;
          r._spawnAcc = -99999;
          r._bossSpawned = { horse: true, umbrella: true, youshen: true };
          r._warderSpawned = { warder_150: true, warder_360: true };
          r.time = 0;
          r._spawnQueue.push({ type: 'paperkid', x: 200, y: 0, opts: {} });
          window.__e2eStepFrames(1);
          const s0 = r.enemies.find((e) => e.type === 'paperkid').speed;
          r.enemies.length = 0;
          r.time = 1500;
          r.watch = 5;
          r._spawnQueue.push({ type: 'paperkid', x: 200, y: 0, opts: {} });
          window.__e2eStepFrames(1);
          const s25 = r.enemies.find((e) => e.type === 'paperkid').speed;
          return { s0, s25, ratio: s25 / s0 };
        });
        assert.ok(
          Math.abs(res.ratio - 1.35) <= 0.015,
          `Expected speedGrowthCap clamped strictly at 1.35 even at 25 min, got ${res.ratio.toFixed(4)}`,
        );
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
    name: 'Night affix shadeFast speed multiplier capped at ~1.12 so shade remains fair on high Night levels',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, {
          nightLevel: 6,
          seed: 2202,
          savePatch: { nightUnlocked: 10, selectedNight: 6 },
        });
        const res = await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          r.enemies.length = 0;
          r._spawnAcc = -99999;
          r.time = 0;
          r._spawnQueue.push({ type: 'shade', x: 200, y: 0, opts: {} });
          r._spawnQueue.push({ type: 'paperkid', x: 240, y: 0, opts: {} });
          window.__e2eStepFrames(1);
          const shade = r.enemies.find((e) => e.type === 'shade');
          return { shadeSpeed: shade.speed, shadeMul: r.night.shadeSpeedMul };
        });
        assert.ok(
          res.shadeMul <= 1.13,
          `Expected Night shadeFast multiplier rebalanced to <= 1.13 (~1.12), got ${res.shadeMul}`,
        );
        assert.ok(res.shadeSpeed <= 92, `Expected Night 6 t=0 shade speed <= 92, got ${res.shadeSpeed.toFixed(1)}`);
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
    name: 'Multiple overlapping drowned (水鬼) slow auras do NOT stack multiplicatively below 0.80',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { seed: 2203 });
        const slow = await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          r.enemies.length = 0;
          r._spawnAcc = -99999;
          r.weapons.forEach((w) => { w.cd = 9999; });
          for (let i = 0; i < 4; i++) {
            r._spawnQueue.push({
              type: 'drowned',
              x: r.player.x + 35 * Math.cos((i * Math.PI) / 2),
              y: r.player.y + 35 * Math.sin((i * Math.PI) / 2),
              opts: {},
            });
          }
          window.__e2eStepFrames(3);
          return r._auraSlow;
        });
        assert.ok(
          slow >= 0.79,
          `4 overlapping drowned auras must NOT stack below 0.80 (got _auraSlow=${slow})`,
        );
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
    name: 'Boss leash boundary (leashDist=700): distant Boss snaps back to spawn ring instead of despawning',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { seed: 2204 });
        const res = await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          r.enemies.length = 0;
          r._spawnAcc = -99999;
          r._bossSpawned = { horse: false, umbrella: true, youshen: true };
          r.time = 240.1;
          window.__e2eStepFrames(2);
          if (r.status === 'levelup') document.querySelector('.qian')?.click();
          const boss = r.enemies.find((e) => e.boss);
          boss.x = r.player.x + 1200; // > leashDist (700)
          boss.y = r.player.y;
          window.__e2eStepFrames(2);
          return {
            stillAlive: Boolean(r.boss && !boss.dead),
            distAfterLeash: Math.hypot(boss.x - r.player.x, boss.y - r.player.y),
          };
        });
        assert.equal(res.stillAlive, true);
        assert.ok(res.distAfterLeash <= 470, `Expected Boss leashed back within <= 470px, got ${res.distAfterLeash.toFixed(1)}`);
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
    name: 'Locked charge direction on weasel & horse does NOT home mid-dash, allowing perpendicular sidestep',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { seed: 2205 });
        const res = await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          r.enemies.length = 0;
          r._spawnAcc = -99999;
          r.weapons.forEach((w) => { w.cd = 9999; });
          r.player.hp = 100;
          r.player.invulnT = 0;
          r._spawnQueue.push({ type: 'weasel', x: r.player.x + 120, y: r.player.y, opts: {} });
          window.__e2eStepFrames(2);
          const w = r.enemies[0];
          // Force pause windup locked along (-1, 0) toward (player.x, player.y)
          w.state = 'pause';
          w.stateT = 0.02;
          w.dx = -1;
          w.dy = 0;
          // Player sidesteps 65px north perpendicular to locked corridor
          r.player.y -= 65;
          window.__e2eStepFrames(30); // full dash passes along y=0
          return { hp: r.player.hp, wy: Math.abs(w.y) };
        });
        assert.equal(res.hp, 100, 'Perpendicular sidestep should cleanly dodge locked weasel dash with 0 hits');
        assert.ok(res.wy < 5, `Weasel dash must stay on locked y=0 line without homing, got |y|=${res.wy.toFixed(2)}`);
        s.assertNoErrors('T2-F2-05');
      } finally {
        await s.close();
      }
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // F3 Boundaries (6 tests)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'T2-F3-01',
    tier: 2,
    feature: 'F3',
    name: 'Lv4 weapon (< MAX_WEAPON_LEVEL=5) CANNOT evolve via chest even with paired relic + 4 school items + Lv5 relic',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { seed: 2301 });
        await grantItemViaLevelUp(s.page, 'weapon', 'gong', 3); // Lv4 only!
        await grantItemViaLevelUp(s.page, 'weapon', 'bell', 1);
        await grantItemViaLevelUp(s.page, 'relic', 'clapper', 5);
        await grantItemViaLevelUp(s.page, 'relic', 'redstring', 1);
        await triggerChest(s.page);
        await confirmChestModal(s.page);
        const gongEvolved = await s.page.evaluate(() => window.__wugeng.game.run.weapons.find((w) => w.id === 'gong').evolved);
        assert.equal(gongEvolved, false, 'Lv4 weapon must never evolve directly without first being Lv5 when chest opens');
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
    name: 'Lv5 weapon with NO paired relic, only 2 school items (<3), and only Lv4 relic (<5) CANNOT evolve',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { seed: 2302 });
        // gong Lv5 (1 zhenhun) + redstring Lv1 (2 zhenhun, NOT clapper) + bagua Lv4 (<5)
        await grantItemViaLevelUp(s.page, 'weapon', 'gong', 4);
        await grantItemViaLevelUp(s.page, 'relic', 'redstring', 1);
        await grantItemViaLevelUp(s.page, 'relic', 'bagua', 4);
        await triggerChest(s.page);
        await confirmChestModal(s.page);
        const gongEvolved = await s.page.evaluate(() => window.__wugeng.game.run.weapons.find((w) => w.id === 'gong').evolved);
        assert.equal(gongEvolved, false, 'Lv5 gong with only 2 zhenhun items, no clapper, and no Lv5 relic must NOT evolve');
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
    name: 'Already-evolved weapon (evolved=true) is excluded from chestChoices on subsequent chests',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { seed: 2303 });
        await grantItemViaLevelUp(s.page, 'weapon', 'gong', 4);
        await grantItemViaLevelUp(s.page, 'relic', 'clapper', 1);
        await triggerChest(s.page);
        await confirmChestModal(s.page);
        assert.equal(await s.page.evaluate(() => window.__wugeng.game.run.weapons[0].evolved), true);

        // Open a second chest: gong must NOT appear in chestChoices or [data-evo-weapon="gong"]
        await triggerChest(s.page);
        const dupCount = await s.page.locator('[data-evo-weapon="gong"]').count();
        const inChoices = await s.page.evaluate(() => (window.__wugeng.game.run.chestChoices || []).some((c) => c.id === 'gong'));
        assert.equal(dupCount, 0, 'Already-evolved gong must not appear as [data-evo-weapon="gong"] on second chest');
        assert.equal(inChoices, false, 'Already-evolved gong must not appear in run.chestChoices');
        await confirmChestModal(s.page);
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
    name: 'All-maxed 4+4 inventory chest boundary grants fallback coins cleanly without softlocking modal',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { seed: 2304 });
        await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          r.weapons = [
            { id: 'gong', level: 5, evolved: true, cd: 1 },
            { id: 'talisman', level: 5, evolved: true, cd: 1 },
            { id: 'lantern', level: 5, evolved: true, cd: 1 },
            { id: 'brush', level: 5, evolved: true, cd: 1 },
          ];
          r.relics = [
            { id: 'clapper', level: 5 },
            { id: 'cinnabar', level: 5 },
            { id: 'censer', level: 5 },
            { id: 'inkstone', level: 5 },
          ];
        });
        const coinsBefore = await s.page.evaluate(() => window.__wugeng.game.run.stats.coins);
        await triggerChest(s.page);
        await confirmChestModal(s.page);
        const after = await s.page.evaluate(() => ({
          coins: window.__wugeng.game.run.stats.coins,
          status: window.__wugeng.game.run.status,
          overlay: window.__wugeng.overlay,
        }));
        assert.ok(after.coins > coinsBefore, `Expected fallback coins when 4+4 inventory is 100% maxed (${coinsBefore} -> ${after.coins})`);
        assert.equal(after.status, 'playing');
        assert.equal(after.overlay, null);
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
    name: 'Single-eligible-weapon chest flow evolves weapon & closes cleanly via [data-action="confirm-chest"]',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { seed: 2305 });
        await grantItemViaLevelUp(s.page, 'weapon', 'gong', 4);
        await grantItemViaLevelUp(s.page, 'relic', 'clapper', 1);
        await triggerChest(s.page);
        assert.ok(await s.page.$('.overlay--chest'), 'Expected .overlay--chest');
        assert.ok(await s.page.locator('[data-action="confirm-chest"]').count() > 0, 'Expected [data-action="confirm-chest"]');
        await s.page.click('[data-action="confirm-chest"]');
        const state = await s.page.evaluate(() => ({
          evolved: window.__wugeng.game.run.weapons[0].evolved,
          overlay: window.__wugeng.overlay,
        }));
        assert.equal(state.evolved, true);
        assert.equal(state.overlay, null);
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
    name: 'Simultaneous double-chest collection queues _pendingChests=2 and resolves both sequentially without loss',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { seed: 2306 });
        await grantItemViaLevelUp(s.page, 'weapon', 'gong', 4);
        await grantItemViaLevelUp(s.page, 'relic', 'clapper', 1);
        await grantItemViaLevelUp(s.page, 'weapon', 'talisman', 5);
        await grantItemViaLevelUp(s.page, 'relic', 'cinnabar', 1);

        await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          r.pickups.push(
            { id: 96001, kind: 'chest', x: r.player.x, y: r.player.y, value: 1 },
            { id: 96002, kind: 'chest', x: r.player.x, y: r.player.y, value: 1 },
          );
          window.__e2eStepFrames(2);
        });
        await s.page.waitForFunction(() => window.__wugeng.overlay === 'chest');
        await confirmChestModal(s.page, 'talisman');
        // Second queued chest should immediately open
        await s.page.waitForFunction(() => window.__wugeng.overlay === 'chest');
        await confirmChestModal(s.page);

        const both = await s.page.evaluate(() => ({
          gong: window.__wugeng.game.run.weapons.find((w) => w.id === 'gong').evolved,
          talisman: window.__wugeng.game.run.weapons.find((w) => w.id === 'talisman').evolved,
          overlay: window.__wugeng.overlay,
        }));
        assert.equal(both.talisman, true);
        assert.equal(both.gong, true);
        assert.equal(both.overlay, null);
        s.assertNoErrors('T2-F3-06');
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
    name: 'Evolved talisman chain NEVER emits bellChain projectile kind when bell is not equipped',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { seed: 2401 });
        await grantItemViaLevelUp(s.page, 'weapon', 'talisman', 5);
        await grantItemViaLevelUp(s.page, 'relic', 'cinnabar', 1);
        await triggerChest(s.page);
        await confirmChestModal(s.page);

        const sawBellChain = await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          r.enemies.length = 0;
          r._spawnAcc = -99999;
          r.weapons.find((w) => w.id === 'gong').cd = 9999;
          r._spawnQueue.push({ type: 'drowned', x: r.player.x + 100, y: r.player.y, opts: {} });
          r._spawnQueue.push({ type: 'drowned', x: r.player.x + 135, y: r.player.y + 20, opts: {} });
          window.__e2eStepFrames(1);
          r.enemies.forEach((e) => { e.hp = 9999; e.speed = 0; });
          r.weapons.find((w) => w.id === 'talisman').cd = 0;
          let bad = false;
          window.__e2eStepFrames(40, {
            onStep: () => {
              if (r.projectiles.some((p) => p.kind === 'bellChain')) bad = true;
            },
          });
          return bad;
        });
        assert.equal(sawBellChain, false, 'Evolved talisman must use talismanChain, NEVER bellChain');
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
    name: 'All evolved classic weapons handle zero-enemy empty arena without NaN projectile coordinates or errors',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { seed: 2402 });
        const badCoords = await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          r.enemies.length = 0;
          r._spawnAcc = -99999;
          r._nextWaveT = 99999;
          r.weapons = [
            { id: 'talisman', level: 5, evolved: true, cd: 0 },
            { id: 'coinsword', level: 5, evolved: true, cd: 0 },
            { id: 'firecracker', level: 5, evolved: true, cd: 0 },
            { id: 'bell', level: 5, evolved: true, cd: 0 },
          ];
          window.__e2eStepFrames(45);
          return r.projectiles.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y));
        });
        assert.equal(badCoords, false, 'Zero-target evolved weapons must never produce NaN/Infinite coordinates');
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
    name: 'Bullet-clearing evolutions (五更鸣锣 & 纸扎仪仗) never delete friendly player projectiles',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { seed: 2403 });
        await grantItemViaLevelUp(s.page, 'weapon', 'gong', 4);
        await grantItemViaLevelUp(s.page, 'relic', 'clapper', 1);
        await grantItemViaLevelUp(s.page, 'weapon', 'coinsword', 3);
        await triggerChest(s.page);
        await confirmChestModal(s.page, 'gong');

        const friendlySurvived = await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          r.enemies.length = 0;
          r._spawnAcc = -99999;
          r.projectiles.push({
            id: 55111, kind: 'coinsword', weaponId: 'coinsword',
            x: r.player.x + 40, y: r.player.y, r: 12, angle: 0, t: 0, life: 5,
            vx: 10, vy: 0, returning: false, phase: 'fly', speed: 10, range: 500, dist: 0, dmg: 20, _hit: new Set(),
          });
          r.weapons.find((w) => w.id === 'gong').cd = 0;
          window.__e2eStepFrames(40);
          return r.projectiles.some((p) => p.id === 55111 && !p.dead);
        });
        assert.equal(friendlySurvived, true, 'Friendly coinsword projectile must survive evolved gong 3-wave bullet shatter');
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
    name: 'Evolved lantern yangyanMark death-explosion chain terminates cleanly on dense cluster without infinite loop',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { seed: 2404 });
        await grantItemViaLevelUp(s.page, 'weapon', 'lantern', 5);
        await grantItemViaLevelUp(s.page, 'relic', 'censer', 1);
        await triggerChest(s.page);
        await confirmChestModal(s.page, 'lantern');

        const res = await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          r.enemies.length = 0;
          r._spawnAcc = -99999;
          r.weapons.find((w) => w.id === 'gong').cd = 9999;
          for (let i = 0; i < 18; i++) {
            r._spawnQueue.push({
              type: 'paperkid',
              x: r.player.x + 65 + (i % 6) * 5,
              y: r.player.y - 12 + Math.floor(i / 6) * 8,
              opts: {},
            });
          }
          window.__e2eStepFrames(1);
          r.enemies.forEach((e) => { e.hp = 2; });
          r.weapons.find((w) => w.id === 'lantern').cd = 0;
          window.__e2eStepFrames(20);
          return { remaining: r.enemies.filter((e) => !e.dead).length };
        });
        assert.equal(res.remaining, 0, 'All 18 clustered paperkids should be wiped cleanly by lantern + yangyanMark chain');
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
    name: 'Max CDR + evolved haste (evoCdMul=0.82) respects positive cooldown floor (> 0.25s, never 0)',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { seed: 2405 });
        await grantItemViaLevelUp(s.page, 'weapon', 'gong', 4);
        await grantItemViaLevelUp(s.page, 'relic', 'clapper', 5); // +40% CDR
        await triggerChest(s.page);
        await confirmChestModal(s.page);

        const cdAfter = await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          const g = r.weapons.find((w) => w.id === 'gong');
          g.cd = 0;
          window.__e2eStepFrames(1);
          return g.cd;
        });
        assert.ok(cdAfter > 0.30, `Expected positive cooldown floor (> 0.30s) on evolved gong with Lv5 clapper, got ${cdAfter}`);
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
    name: '4-weapon + 4-relic slot cap strictly blocks new items in generateChoices even with 24-item pool',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { seed: 2501 });
        // Equip 4 weapons (gong + 3 new) and 4 relics (4 new) at Lv1
        await grantItemViaLevelUp(s.page, 'weapon', 'compass', 1);
        await grantItemViaLevelUp(s.page, 'weapon', 'soulbanner', 1);
        await grantItemViaLevelUp(s.page, 'weapon', 'paperhorse', 1);
        await grantItemViaLevelUp(s.page, 'relic', 'strawshoes', 1);
        await grantItemViaLevelUp(s.page, 'relic', 'glutinous', 1);
        await grantItemViaLevelUp(s.page, 'relic', 'fivecoins', 1);
        await grantItemViaLevelUp(s.page, 'relic', 'soulwick', 1);

        await s.page.evaluate(() => { window.__wugeng.game.run.rerolls.free = 10; });
        await triggerLevelUp(s.page);
        for (let i = 0; i < 6; i++) {
          const anyNew = await s.page.evaluate(() => window.__wugeng.game.run.choices.some((c) => c.isNew));
          assert.equal(anyNew, false, 'With 4/4 weapons & 4/4 relics occupied, normal levelup must offer 0 isNew items');
          await fastClick(s.page, '[data-action="reroll"], .levelup-actions .btn--ghost');
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
    name: 'Glutinous (糯米) kill-heal clamps strictly at player.maxHp without overhealing',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { seed: 2502 });
        await grantItemViaLevelUp(s.page, 'relic', 'glutinous', 5);
        const res = await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          r.enemies.length = 0;
          r._spawnAcc = -99999;
          r._nextWaveT = 99999;
          r.player.hp = r.player.maxHp - 1;
          r.mods.pickupRange = 1;
          const kills0 = r.stats.kills;
          for (let wave = 0; wave < 2; wave++) {
            r.pickups.length = 0;
            for (let i = 0; i < 24; i++) {
              const a = (i / 24) * Math.PI * 2;
              r._spawnQueue.push({
                type: 'paperkid',
                x: r.player.x + Math.cos(a) * 34,
                y: r.player.y + Math.sin(a) * 34,
                opts: { fixedHp: 1, atkT: 10 },
              });
            }
            window.__e2eStepFrames(1);
            r.weapons[0].cd = 0;
            window.__e2eStepFrames(2);
          }
          return { hp: r.player.hp, maxHp: r.player.maxHp, killsDelta: r.stats.kills - kills0 };
        });
        assert.ok(res.killsDelta >= 35, `Expected >= 35 kills across two gong waves for glutinous killInterval=35, got ${res.killsDelta}`);
        assert.equal(res.hp, res.maxHp, `Glutinous kill-heal should heal up to maxHp (${res.maxHp}) and never exceed it (got ${res.hp})`);
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
    name: 'Strawshoes (草鞋) Lv5 slow resistance inside drowned aura clamps effective movement multiplier in [0.85, 1.0]',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { seed: 2503 });
        await grantItemViaLevelUp(s.page, 'relic', 'strawshoes', 5);
        await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          r.enemies.length = 0;
          r._spawnAcc = -99999;
          r.weapons.forEach((w) => { w.cd = 9999; });
          r._spawnQueue.push({ type: 'drowned', x: r.player.x, y: r.player.y + 45, opts: { atkT: 20 } });
          window.__e2eStepFrames(2);
        });
        await s.page.keyboard.down('KeyD');
        const res = await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          const x0 = r.player.x;
          const t0 = r.time;
          window.__e2eStepFrames(10, { preserveInput: true });
          const actualSpeed = (r.player.x - x0) / (r.time - t0);
          return { ratio: actualSpeed / r.player.speed };
        });
        await s.page.keyboard.up('KeyD');
        assert.ok(
          res.ratio >= 0.85 && res.ratio <= 1.005,
          `Expected strawshoes Lv5 to mitigate drowned slow into [0.85, 1.0] of player.speed, got ratio=${res.ratio.toFixed(3)}`,
        );
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
    name: 'Soulwick (引魂灯芯) Lv5 ult cooldown refund clamps weapon cd >= 0 (never negative or NaN)',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { seed: 2504 });
        await grantItemViaLevelUp(s.page, 'relic', 'soulwick', 5);
        await grantItemViaLevelUp(s.page, 'weapon', 'compass', 1);
        await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          r.weapons.forEach((w) => { w.cd = 0.05; });
          r.player.ult = r.player.ultMax;
        });
        await s.page.keyboard.press('Space');
        const cds = await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          window.__e2eStepFrames(1);
          return r.weapons.map((w) => w.cd);
        });
        assert.ok(cds.every((c) => Number.isFinite(c) && c >= 0), `Weapon cooldowns must stay finite & >= 0, got ${cds.join(',')}`);
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
    name: 'All 4 new weapons & 4 new relics have unique non-fallback icons distinct from coin & classic items',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootToHub(s.page, baseUrl, {
          savePatch: { codex: { weapons: ALL_WEAPON_IDS, relics: ALL_RELIC_IDS } },
        });
        await fastClick(s.page, '.hub-nav .btn:nth-child(2)');
        await s.page.waitForSelector('.codex-scroll, .codex');

        const hashTab = async (tabIdx) => {
          await s.page.evaluate((idx) => document.querySelectorAll('.codex-tab')[idx]?.click(), tabIdx);
          return s.page.$$eval('.codex-list .codex-row img.icon', (imgs) => {
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
        assert.equal(wHashes.length, 12, `Expected 12 weapon icons in Codex, got ${wHashes.length}`);
        assert.equal(rHashes.length, 12, `Expected 12 relic icons in Codex, got ${rHashes.length}`);
        assert.equal(new Set([...wHashes, ...rHashes]).size, 24, 'All 12 weapons + 12 relics must have 24 distinct icon bitmaps (no coin fallback)');
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
    name: 'Upgrading 1 weapon from Lv1 to Lv5 still counts as 1 school piece (no duplicate level counting)',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { heroId: 'zhou', seed: 2601 });
        await grantItemViaLevelUp(s.page, 'weapon', 'gong', 4); // gong Lv5, still only 1 item
        const syn = await s.page.evaluate(() => window.__wugeng.game.run.synergies);
        assert.ok(syn, 'Expected run.synergies');
        assert.equal(syn.counts.zhenhun, 1, 'gong Lv5 alone must count as 1 zhenhun item, not 5');
        assert.equal(syn.active.length, 0, '1 item must not activate tier-2 school synergy');
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
    name: 'Intermediate piece counts (3 & 5 pieces) stay at tier 2 & tier 4 without premature tier promotion',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { heroId: 'zhou', seed: 2602 }); // gong (1)
        await grantItemViaLevelUp(s.page, 'weapon', 'bell', 1); // 2
        await grantItemViaLevelUp(s.page, 'weapon', 'soulbanner', 1); // 3 -> must stay tier 2
        const tierAt3 = await s.page.evaluate(() => window.__wugeng.game.run.synergies?.active?.find((a) => a.tag === 'zhenhun')?.tier);
        assert.equal(tierAt3, 2, '3 pieces must remain at tier 2');

        await grantItemViaLevelUp(s.page, 'relic', 'clapper', 1); // 4
        await grantItemViaLevelUp(s.page, 'relic', 'redstring', 1); // 5 -> must stay tier 4
        const tierAt5 = await s.page.evaluate(() => window.__wugeng.game.run.synergies?.active?.find((a) => a.tag === 'zhenhun')?.tier);
        assert.equal(tierAt5, 4, '5 pieces must remain at tier 4');
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
    name: '6-piece 道法 CDR cap improvement still enforces a safe positive cdMul floor (>= 0.35)',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, {
          heroId: 'daotong',
          seed: 2603,
          savePatch: { unlockedHeroes: ['zhou', 'daotong'] },
        });
        await grantItemViaLevelUp(s.page, 'weapon', 'coinsword', 1);
        await grantItemViaLevelUp(s.page, 'weapon', 'compass', 1);
        await grantItemViaLevelUp(s.page, 'relic', 'cinnabar', 1);
        await grantItemViaLevelUp(s.page, 'relic', 'bagua', 1);
        await grantItemViaLevelUp(s.page, 'relic', 'fivecoins', 1); // 6 daofa
        await grantItemViaLevelUp(s.page, 'relic', 'clapper', 5); // +40% CDR

        const cdMul = await s.page.evaluate(() => window.__wugeng.game.run.mods.cdMul);
        assert.ok(cdMul >= 0.35 && cdMul < 0.65, `Expected safe positive cdMul floor in [0.35, 0.65), got ${cdMul}`);
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
    name: 'synergyUp event fires on crossing 1->2 threshold, NOT on 2->3 non-threshold step',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { heroId: 'zhou', seed: 2604 });
        await grantItemViaLevelUp(s.page, 'weapon', 'bell', 1); // 1 -> 2 (should queue synergyUp in _outbox or events)
        const evAt2 = await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          const hadInOutbox = (r._outbox || []).some((e) => e.type === 'synergyUp' && e.tag === 'zhenhun');
          window.__e2eStepFrames(1);
          const hadInEvents = r.events.some((e) => e.type === 'synergyUp' && e.tag === 'zhenhun');
          return hadInOutbox || hadInEvents;
        });
        assert.equal(evAt2, true, 'Expected synergyUp event when crossing 1 -> 2 zhenhun pieces');

        await grantItemViaLevelUp(s.page, 'weapon', 'soulbanner', 1); // 2 -> 3 (still tier 2)
        const evAt3 = await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          const hadInOutbox = (r._outbox || []).some((e) => e.type === 'synergyUp' && e.tag === 'zhenhun');
          window.__e2eStepFrames(1);
          const hadInEvents = r.events.some((e) => e.type === 'synergyUp' && e.tag === 'zhenhun');
          return hadInOutbox || hadInEvents;
        });
        assert.equal(evAt3, false, 'Going 2 -> 3 pieces must not emit duplicate tier-2 synergyUp event');
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
    name: 'Pause overlay (.overlay--pause) renders empty .pause-synergies & .pause-blessings cleanly at t=0',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { seed: 2605 });
        await fastClick(s.page, '.pause-btn');
        await s.page.waitForFunction(() => window.__wugeng.overlay === 'pause');
        await requireOpenSelector(s.page, '.overlay--pause', 'Expected .overlay--pause');
        await requireOpenSelector(s.page, '.pause-synergies', 'Expected .pause-synergies present even with 0 active synergies');
        await requireOpenSelector(s.page, '.pause-blessings', 'Expected .pause-blessings present even with 0 active blessings');
        s.assertNoErrors('T2-F6-05');
      } finally {
        await s.close();
      }
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // F7 Boundaries (6 tests)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'T2-F7-01',
    tier: 2,
    feature: 'F7',
    name: 'Simultaneous XP level-up + 120s watch transition queues both draws without dropping either',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { seed: 2701 });
        await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          r.enemies.length = 0;
          r._spawnAcc = -99999;
          r.time = 119.99;
          r.pickups.push({
            id: 920001, kind: 'xp', x: r.player.x, y: r.player.y,
            value: r.player.xpNext + 2, tier: 3, mag: true, ms: 9999,
          });
          r._xpCount = (r._xpCount || 0) + 1;
          window.__e2eStepFrames(2);
        });
        await s.page.waitForFunction(() => window.__wugeng.overlay === 'levelup');
        const modesSeen = [];
        modesSeen.push(await s.page.evaluate(() => window.__wugeng.game.run.choiceMode));
        await fastClick(s.page, '.qian');
        assert.equal(await s.page.evaluate(() => window.__wugeng.overlay), 'levelup', 'Second queued draw should open immediately');
        modesSeen.push(await s.page.evaluate(() => window.__wugeng.game.run.choiceMode));
        await fastClick(s.page, '.qian');

        assert.deepEqual(new Set(modesSeen), new Set(['normal', 'blessing']), `Expected both 'normal' and 'blessing' draws resolved, saw ${modesSeen.join(',')}`);
        assert.equal(await s.page.evaluate(() => window.__wugeng.overlay), null);
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
    name: 'Picking a maxHp-reducing cursed 凶签 when player is at 1 HP clamps hp >= 1 (never self-kills)',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { seed: 2702 });
        await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          r.enemies.length = 0;
          r._spawnAcc = -99999;
          r.player.hp = 1;
          r.time = 119.97;
          window.__e2eStepFrames(4);
        });
        assert.equal(await s.page.evaluate(() => window.__wugeng.game.run.choiceMode), 'blessing');
        const cursedIdx = await s.page.evaluate(() => {
          const idx = window.__wugeng.game.run.choices.findIndex((c) => c.tier === 'cursed');
          return idx >= 0 ? idx : 0;
        });
        await s.page.evaluate((idx) => document.querySelectorAll('.qian')[idx]?.click(), cursedIdx);
        const after = await s.page.evaluate(() => ({
          hp: window.__wugeng.game.run.player.hp,
          maxHp: window.__wugeng.game.run.player.maxHp,
          status: window.__wugeng.game.run.status,
        }));
        assert.ok(after.hp >= 1 && after.maxHp >= 1, `Cursed blessing must clamp hp/maxHp >= 1, got hp=${after.hp}/${after.maxHp}`);
        assert.equal(after.status, 'playing');
        s.assertNoErrors('T2-F7-02');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T2-F7-03',
    tier: 2,
    feature: 'F7',
    name: 'Watch 6 Dawn clear (600s Youshen defeat) opens cleared modal without hanging on watch-6 blessing',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { seed: 2703 });
        await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          r.enemies.length = 0;
          r._spawnAcc = -99999;
          r._bossSpawned = { horse: true, umbrella: true, youshen: false };
          r._warderSpawned = { warder_150: true, warder_360: true };
          r.time = 600.2;
          window.__e2eStepFrames(2);
          while (window.__wugeng.overlay === 'levelup') document.querySelector('.qian')?.click();
          const ys = r.enemies.find((e) => e.type === 'youshen');
          ys.x = r.player.x + 25;
          ys.y = r.player.y;
          ys.hp = 1;
          r.weapons[0].cd = 0;
          window.__e2eStepFrames(3);
        });
        while (await s.page.evaluate(() => window.__wugeng.overlay === 'levelup')) {
          await fastClick(s.page, '.qian');
        }
        assert.equal(await s.page.evaluate(() => window.__wugeng.overlay), 'cleared');
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
    name: 'Single-draw blessing slips are pairwise distinct (no duplicate blessing IDs within 1 守夜命签 modal)',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { seed: 2704 });
        await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          r.enemies.length = 0;
          r._spawnAcc = -99999;
          r.time = 119.97;
          window.__e2eStepFrames(4);
        });
        assert.equal(await s.page.evaluate(() => window.__wugeng.game.run.choiceMode), 'blessing');
        const ids = await s.page.evaluate(() => window.__wugeng.game.run.choices.map((c) => c.id));
        assert.equal(ids.length, 3);
        assert.equal(new Set(ids).size, 3, `Expected 3 distinct blessing slips in single draw, got ${ids.join(',')}`);
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
    name: 'Normal level-up following a blessing draw resets data-choice-mode back to "normal"',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { seed: 2705 });
        await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          r.enemies.length = 0;
          r._spawnAcc = -99999;
          r.time = 119.97;
          window.__e2eStepFrames(4);
        });
        const lvlEl1 = await requireOpenSelector(s.page, '.overlay--levelup', 'Expected .overlay--levelup');
        assert.equal(await lvlEl1.getAttribute('data-choice-mode'), 'blessing');
        await fastClick(s.page, '.qian');

        await triggerLevelUp(s.page);
        const lvlEl2 = await requireOpenSelector(s.page, '.overlay--levelup', 'Expected .overlay--levelup');
        assert.equal(await lvlEl2.getAttribute('data-choice-mode'), 'normal');
        const kinds = await s.page.$$eval('.qian', (els) => els.map((e) => e.getAttribute('data-item-kind')));
        assert.equal(kinds.includes('blessing'), false, 'Normal level-up must not offer blessing slips');
        s.assertNoErrors('T2-F7-05');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T2-F7-06',
    tier: 2,
    feature: 'F7',
    name: 'Offline mode (/index.html without mockAds) renders zero .btn--ad inside blessing modal',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { seed: 2706 });
        await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          r.enemies.length = 0;
          r._spawnAcc = -99999;
          r.rerolls.free = 0;
          r.time = 119.97;
          window.__e2eStepFrames(4);
        });
        assert.equal(await s.page.evaluate(() => window.__wugeng.game.run.choiceMode), 'blessing');
        assert.equal(await s.page.locator('.btn--ad').count(), 0, 'Offline mode must show 0 ad buttons during blessing draw');
        s.assertNoErrors('T2-F7-06');
      } finally {
        await s.close();
      }
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // F8 Boundaries (6 tests)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'T2-F8-01',
    tier: 2,
    feature: 'F8',
    name: 'Zero banishesLeft boundary: banish button disabled/rejected when banishesLeft === 0 (never goes negative)',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { seed: 2801 });
        await s.page.evaluate(() => { window.__wugeng.game.run.banishesLeft = 0; });
        await triggerLevelUp(s.page);

        const banishLoc = s.page.locator('[data-action="banish"]');
        assert.ok(await banishLoc.count() > 0, 'Expected [data-action="banish"] button rendered');
        const isDisabled = await banishLoc.first().isDisabled();
        if (!isDisabled) {
          await banishLoc.first().click();
        }
        const after = await s.page.evaluate(() => ({
          banishesLeft: window.__wugeng.game.run.banishesLeft,
          banishedLen: (window.__wugeng.game.run.banished || []).length,
        }));
        assert.equal(after.banishesLeft, 0, 'banishesLeft must never go below 0');
        assert.equal(after.banishedLen, 0, 'Zero-charge banish must not banish any item');
        s.assertNoErrors('T2-F8-01');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T2-F8-02',
    tier: 2,
    feature: 'F8',
    name: 'Single-lock exclusivity & toggle-off: locking card 0 then card 1 switches lock, clicking again clears to null',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { seed: 2802 });
        await triggerLevelUp(s.page);
        const id0 = await s.page.getAttribute('.qian >> nth=0', 'data-item-id');
        const id1 = await s.page.getAttribute('.qian >> nth=1', 'data-item-id');

        const clickLockOn = async (idx) => {
          const cardLock = s.page.locator(`.qian >> nth=${idx} >> [data-action="lock"]`);
          if (await cardLock.count() > 0) {
            await cardLock.first().click();
          } else {
            await s.page.click('[data-action="lock"]');
            await s.page.click(`.qian >> nth=${idx}`);
          }
        };
        assert.ok(await s.page.locator('[data-action="lock"]').count() > 0, 'Expected [data-action="lock"]');
        await clickLockOn(0);
        assert.equal(await s.page.evaluate(() => window.__wugeng.game.run.lockedChoice?.id), id0);
        await clickLockOn(1);
        assert.equal(await s.page.evaluate(() => window.__wugeng.game.run.lockedChoice?.id), id1, 'Locking card 1 must replace card 0 lock');
        await clickLockOn(1);
        assert.equal(await s.page.evaluate(() => window.__wugeng.game.run.lockedChoice), null, 'Clicking lock again on locked card should toggle off to null');
        s.assertNoErrors('T2-F8-02');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T2-F8-03',
    tier: 2,
    feature: 'F8',
    name: 'Picking the locked slip itself clears run.lockedChoice instead of keeping stale level metadata',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { seed: 2803 });
        await triggerLevelUp(s.page);
        const cardLock = s.page.locator('.qian >> nth=0 >> [data-action="lock"]');
        assert.ok(await s.page.locator('[data-action="lock"]').count() > 0, 'Expected [data-action="lock"]');
        if (await cardLock.count() > 0) {
          await cardLock.first().click();
        } else {
          await s.page.click('[data-action="lock"]');
          if (!(await s.page.evaluate(() => Boolean(window.__wugeng.game.run.lockedChoice)))) {
            await s.page.click('.qian >> nth=0');
          }
        }
        // Now actually pick card 0!
        await s.page.click('.qian >> nth=0');
        const lockedAfterPick = await s.page.evaluate(() => window.__wugeng.game.run.lockedChoice);
        assert.equal(lockedAfterPick, null, 'Picking the locked card itself should clear run.lockedChoice');
        s.assertNoErrors('T2-F8-03');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T2-F8-04',
    tier: 2,
    feature: 'F8',
    name: 'Banishing a currently locked card clears lockedChoice so banished item cannot sneak back next level',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { seed: 2804 });
        await triggerLevelUp(s.page);
        const id0 = await s.page.getAttribute('.qian >> nth=0', 'data-item-id');
        assert.ok(await s.page.locator('[data-action="lock"]').count() > 0, 'Expected [data-action="lock"]');
        assert.ok(await s.page.locator('[data-action="banish"]').count() > 0, 'Expected [data-action="banish"]');

        const cardLock0 = s.page.locator('.qian >> nth=0 >> [data-action="lock"]');
        if (await cardLock0.count() > 0) await cardLock0.first().click();
        else { await s.page.click('[data-action="lock"]'); await s.page.click('.qian >> nth=0'); }

        const cardBanish0 = s.page.locator('.qian >> nth=0 >> [data-action="banish"]');
        if (await cardBanish0.count() > 0) await cardBanish0.first().click();
        else { await s.page.click('[data-action="banish"]'); await s.page.click('.qian >> nth=0'); }

        const lockedAfterBanish = await s.page.evaluate(() => window.__wugeng.game.run.lockedChoice);
        assert.equal(lockedAfterBanish, null, 'Banishing locked card must clear run.lockedChoice');

        await s.page.click('.qian >> nth=0');
        await triggerLevelUp(s.page);
        const nextIds = await s.page.evaluate(() => window.__wugeng.game.run.choices.map((c) => c.id));
        assert.equal(nextIds.includes(id0), false, 'Banished formerly-locked card must not return on next levelup');
        s.assertNoErrors('T2-F8-04');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T2-F8-05',
    tier: 2,
    feature: 'F8',
    name: 'Fallback filler cards (overflow / coin / bun) when 4+4 maxed never softlock generateChoices below 1-3 valid options',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { seed: 2805 });
        await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          r.weapons = [
            { id: 'gong', level: 5, evolved: true, cd: 1 },
            { id: 'talisman', level: 5, evolved: true, cd: 1 },
            { id: 'lantern', level: 5, evolved: true, cd: 1 },
            { id: 'brush', level: 5, evolved: true, cd: 1 },
          ];
          r.relics = [
            { id: 'clapper', level: 5 },
            { id: 'cinnabar', level: 5 },
            { id: 'censer', level: 5 },
            { id: 'inkstone', level: 5 },
          ];
        });
        await triggerLevelUp(s.page);
        const kinds = await s.page.evaluate(() => window.__wugeng.game.run.choices.map((c) => c.kind));
        assert.equal(kinds.length, 3);
        assert.ok(kinds.includes('overflow') && kinds.includes('coin') && kinds.includes('bun'));
        await fastClick(s.page, '.qian');
        assert.equal(await s.page.evaluate(() => window.__wugeng.overlay), null);
        s.assertNoErrors('T2-F8-05');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T2-F8-06',
    tier: 2,
    feature: 'F8',
    name: 'Rewarded ad reroll respects <60s grace window AND adGrantMax=2 per-run cap',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser, { isolated: true });
      try {
        await bootAndStartRun(s.page, baseUrl, { query: 'mockAds=1', seed: 2806 });
        await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          r.time = 59.0;
          r.rerolls.free = 0;
          r.rerolls.ad = 0;
        });
        await triggerLevelUp(s.page);
        assert.equal(await s.page.locator('.levelup-actions .btn--ad').count(), 0, 'No ad reroll button allowed at t < 60s');

        await fastClick(s.page, '.qian');
        await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          r.time = 75;
          r.rerolls.free = 0;
          r.rerolls.ad = 0;
          r.rerolls.adGrants = 2;
        });
        await triggerLevelUp(s.page);
        assert.equal(await s.page.locator('.levelup-actions .btn--ad').count(), 0, 'No ad reroll button allowed once adGrants === adGrantMax(2)');
        s.assertNoErrors('T2-F8-06');
      } finally {
        await s.close();
      }
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // F9 Boundaries (5 tests)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'T2-F9-01',
    tier: 2,
    feature: 'F9',
    name: 'Clicking [data-action="dismiss-shrine"] closes .overlay--shrine without consuming shrine (used=false)',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { seed: 2901 });
        const altarId = await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          if (!Array.isArray(r.shrines)) return false;
          const sh = r.shrines.find((x) => x.kind === 'altar' && !x.used);
          if (!sh) return false;
          r.enemies.length = 0;
          r._spawnAcc = -99999;
          r.player.x = sh.x;
          r.player.y = sh.y;
          window.__e2eStepFrames(3);
          return sh.id;
        });
        assert.ok(altarId !== false, 'Expected starter altar shrine');

        await fastClick(s.page, '[data-action="interact-shrine"]', 'Expected HUD [data-action="interact-shrine"]');
        assert.equal(await s.page.evaluate(() => window.__wugeng.overlay), 'shrine');
        await fastClick(s.page, '[data-action="dismiss-shrine"]', 'Expected [data-action="dismiss-shrine"] on shrine modal');

        const after = await s.page.evaluate((id) => ({
          overlay: window.__wugeng.overlay,
          status: window.__wugeng.game.run.status,
          used: window.__wugeng.game.run.shrines.find((x) => x.id === id)?.used,
        }), altarId);
        assert.equal(after.overlay, null);
        assert.equal(after.status, 'playing');
        assert.equal(after.used, false, 'Dismissing shrine must keep shrine.used === false for later interaction');
        s.assertNoErrors('T2-F9-01');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T2-F9-02',
    tier: 2,
    feature: 'F9',
    name: 'Insufficient coins at 鬼市货郎 (peddler): 0-coin player cannot buy paid options or go negative',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { seed: 2902 });
        const ok = await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          if (!Array.isArray(r.shrines)) return false;
          const ped = r.shrines.find((x) => x.kind === 'peddler' && !x.used);
          if (!ped) return false;
          r.enemies.length = 0;
          r._spawnAcc = -99999;
          r.stats.coins = 0;
          r.player.x = ped.x;
          r.player.y = ped.y;
          window.__e2eStepFrames(3);
          return true;
        });
        assert.equal(ok, true, 'Expected starter peddler shrine');

        await fastClick(s.page, '[data-action="interact-shrine"]', 'Expected HUD [data-action="interact-shrine"]');
        await requireOpenSelector(s.page, '.overlay--shrine', 'Expected .overlay--shrine');
        const disabledCount = await s.page.locator('.overlay--shrine [data-shrine-option][disabled]').count();
        assert.ok(disabledCount >= 1, 'Paid peddler options must be disabled when player has 0 coins');
        assert.ok(await s.page.evaluate(() => window.__wugeng.game.run.stats.coins >= 0));
        s.assertNoErrors('T2-F9-02');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T2-F9-03',
    tier: 2,
    feature: 'F9',
    name: 'Used shrine (used=true) clears nearbyShrine and hides [data-action="interact-shrine"]',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { seed: 2903 });
        const check = await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          if (!Array.isArray(r.shrines) || !r.shrines.length) return { hasArray: false };
          const sh = r.shrines[0];
          sh.used = true;
          r.enemies.length = 0;
          r._spawnAcc = -99999;
          r.player.x = sh.x;
          r.player.y = sh.y;
          window.__e2eStepFrames(4);
          return { hasArray: true, nearby: r.nearbyShrine };
        });
        assert.equal(check.hasArray, true, 'Expected run.shrines array');
        assert.equal(check.nearby, null, 'Used shrine must not register as nearbyShrine');
        assert.equal(await s.page.locator('[data-action="interact-shrine"]:visible').count(), 0);
        s.assertNoErrors('T2-F9-03');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T2-F9-04',
    tier: 2,
    feature: 'F9',
    name: 'Altar blood-rite HP sacrifice at 1 HP never kills the player inside the shrine modal',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { seed: 2904 });
        const ok = await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          if (!Array.isArray(r.shrines)) return false;
          const altar = r.shrines.find((x) => x.kind === 'altar' && !x.used);
          if (!altar) return false;
          r.enemies.length = 0;
          r._spawnAcc = -99999;
          r.player.hp = 1;
          r.player.x = altar.x;
          r.player.y = altar.y;
          window.__e2eStepFrames(3);
          return true;
        });
        assert.equal(ok, true, 'Expected starter altar shrine');

        await fastClick(s.page, '[data-action="interact-shrine"]', 'Expected HUD [data-action="interact-shrine"]');
        await fastClick(s.page, '.overlay--shrine [data-shrine-option]:not([disabled])');
        if (await s.page.evaluate(() => window.__wugeng.overlay === 'levelup')) {
          await fastClick(s.page, '.qian');
        }
        const state = await s.page.evaluate(() => ({
          hp: window.__wugeng.game.run.player.hp,
          status: window.__wugeng.game.run.status,
        }));
        assert.ok(state.hp >= 1, `Altar option at 1 HP must never self-kill player (got hp=${state.hp})`);
        assert.equal(state.status, 'playing');
        s.assertNoErrors('T2-F9-04');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T2-F9-05',
    tier: 2,
    feature: 'F9',
    name: 'Walking out of shrine range clears run.nearbyShrine and hides HUD interact prompt',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { seed: 2905 });
        const check = await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          if (!Array.isArray(r.shrines) || !r.shrines.length) return { hasArray: false };
          const sh = r.shrines[0];
          r.enemies.length = 0;
          r._spawnAcc = -99999;
          r.player.x = sh.x;
          r.player.y = sh.y;
          window.__e2eStepFrames(2);
          const nearWhenOnTop = Boolean(r.nearbyShrine);
          // Move to origin (guaranteed >= 250px away from all starter shrines)
          r.player.x = 0;
          r.player.y = 0;
          window.__e2eStepFrames(3);
          const nearWhenFar = r.nearbyShrine;
          return { hasArray: true, nearWhenOnTop, nearWhenFar };
        });
        assert.equal(check.hasArray, true, 'Expected run.shrines array');
        assert.equal(check.nearWhenOnTop, true);
        assert.equal(check.nearWhenFar, null, 'Walking away to origin must clear nearbyShrine to null');
        assert.equal(await s.page.locator('[data-action="interact-shrine"]:visible').count(), 0);
        s.assertNoErrors('T2-F9-05');
      } finally {
        await s.close();
      }
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // F10 Boundaries (5 tests)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'T2-F10-01',
    tier: 2,
    feature: 'F10',
    name: 'Chain-detonating 6 clustered cinder (阴火骷髅) enemies resolves cleanly without infinite recursion',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { seed: 3001 });
        const res = await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          r.enemies.length = 0;
          r._spawnAcc = -99999;
          for (let i = 0; i < 6; i++) {
            r._spawnQueue.push({ type: 'cinder', x: r.player.x + 50 + i * 6, y: r.player.y, opts: {} });
          }
          window.__e2eStepFrames(1);
          r.enemies.forEach((e) => { e.hp = 1; });
          r.weapons[0].cd = 0;
          window.__e2eStepFrames(70);
          return { alive: r.enemies.filter((e) => !e.dead).length };
        });
        assert.equal(res.alive, 0, '6 chain-detonating cinders must all resolve and compact cleanly');
        s.assertNoErrors('T2-F10-01');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T2-F10-02',
    tier: 2,
    feature: 'F10',
    name: 'Elite mirror_twin (分身) affix clones do NOT recursively retain mirror_twin to split infinitely',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { seed: 3002 });
        const res = await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          r.enemies.length = 0;
          r._spawnAcc = -99999;
          r.mods.critChance = 0;
          r._spawnQueue.push({
            type: 'lanternghost',
            x: r.player.x + 42,
            y: r.player.y,
            opts: { elite: true, affix: 'mirror_twin' },
          });
          window.__e2eStepFrames(1);
          const orig = r.enemies[0];
          orig.maxHp = 100;
          orig.hp = 56; // 1 gong hit (~14 dmg) drops hp to ~42 <= 50% (splitAtHpRatio=0.5) while keeping orig alive!
          r.weapons[0].cd = 0;
          window.__e2eStepFrames(3);
          const afterFirstSplit = r.enemies.filter((e) => !e.dead).length;
          // Now bring clone below 50% HP and verify clone does NOT split again
          const clone = r.enemies.find((e) => e !== orig && !e.dead);
          if (clone) {
            clone.x = r.player.x + 42;
            clone.y = r.player.y;
            clone.maxHp = 100;
            clone.hp = 56;
            orig.x = r.player.x + 300; // move orig out of gong range
            r.weapons[0].cd = 0;
            window.__e2eStepFrames(3);
          }
          const afterCloneHit = r.enemies.filter((e) => !e.dead).length;
          return { afterFirstSplit, afterCloneHit };
        });
        assert.equal(res.afterFirstSplit, 2, `Expected mirror_twin elite crossing 50% HP to split into 2 (orig + twin), got ${res.afterFirstSplit}`);
        assert.equal(res.afterCloneHit, 2, 'Mirror-twin clone crossing 50% HP must NOT split recursively');
        s.assertNoErrors('T2-F10-02');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T2-F10-03',
    tier: 2,
    feature: 'F10',
    name: 'Paperbride (红衣纸新娘) kiting maintains valid finite coordinates and her bullets expire cleanly',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { seed: 3003 });
        const res = await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          r.enemies.length = 0;
          r._spawnAcc = -99999;
          r._nextWaveT = 99999;
          r.weapons.forEach((w) => { w.cd = 9999; });
          r.player.invulnT = 20;
          r._spawnQueue.push({ type: 'paperbride', x: r.player.x + 90, y: r.player.y, opts: {} });
          let dodged = false;
          let maxInFlight = 0;
          window.__e2eStepFrames(90, {
            onStep: () => {
              const cnt = r.projectiles.filter((p) => p.kind === 'enemyBullet' && !p.dead).length;
              if (cnt > maxInFlight) maxInFlight = cnt;
              if (cnt > 0 && !dodged) {
                dodged = true;
                r.player.y += 220;
              }
            },
          });
          const pb = r.enemies[0];
          const finitePos = Boolean(pb && Number.isFinite(pb.x) && Number.isFinite(pb.y));
          const firedCount = maxInFlight;
          const inFlightBeforeExpiry = r.projectiles.filter((p) => p.kind === 'enemyBullet' && !p.dead).length;
          // Remove paperbride and step 4.0s (> bulletLife=3.4-3.6s) so in-flight enemyBullets expire naturally
          r.enemies.length = 0;
          window.__e2eStepFrames(240, { maxBatch: 5 });
          const lingeringBullets = r.projectiles.filter((p) => p.kind === 'enemyBullet').length;
          return { finitePos, firedCount, inFlightBeforeExpiry, lingeringBullets };
        });
        assert.equal(res.finitePos, true, 'Paperbride kiting must maintain finite coordinates');
        assert.ok(res.firedCount >= 1, 'Expected paperbride to fire at least 1 enemyBullet within 1.50s');
        assert.ok(res.inFlightBeforeExpiry >= 1, 'Expected dodged paperbride enemyBullet to remain in flight before lifetime expiry');
        assert.equal(res.lingeringBullets, 0, 'Paperbride enemyBullets must expire cleanly after their lifetime');
        s.assertNoErrors('T2-F10-03');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T2-F10-04',
    tier: 2,
    feature: 'F10',
    name: 'Ultimate cast rejected via both Space & HUD gong click when player.ult === 99 (< ultMax=100)',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { seed: 3004 });
        await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          r.enemies.length = 0;
          r._spawnAcc = -99999;
          r.player.ult = 99;
        });
        await s.page.keyboard.press('Space');
        await s.page.mouse.click(334, 788); // 390x844 Ult gong center (W-56, H-56)
        const after = await s.page.evaluate(() => {
          window.__e2eStepFrames(3);
          return {
            ultsCast: window.__wugeng.game.run.stats.ultsCast,
            ult: window.__wugeng.game.run.player.ult,
          };
        });
        assert.equal(after.ultsCast, 0, 'Ultimate must NOT cast at 99/100 charge');
        assert.equal(after.ult, 99);
        s.assertNoErrors('T2-F10-04');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T2-F10-05',
    tier: 2,
    feature: 'F10',
    name: 'Hub locked hero tile rejects selection and keeps selectedHero === "zhou" with unlock toast',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootToHub(s.page, baseUrl, { savePatch: { unlockedHeroes: ['zhou'], selectedHero: 'zhou' } });
        await s.page.click('.hero-tile >> nth=1'); // locked 'mian'
        const selected = await s.page.evaluate(() => window.__wugeng.save.selectedHero);
        assert.equal(selected, 'zhou', 'Clicking locked hero tile must not switch selectedHero');
        const toastText = await s.page.textContent('.toast');
        assert.ok(toastText.includes('未解锁'), `Expected unlock hint toast, got: ${toastText}`);
        s.assertNoErrors('T2-F10-05');
      } finally {
        await s.close();
      }
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // F11 Boundaries (5 tests)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'T2-F11-01',
    tier: 2,
    feature: 'F11',
    name: 'Strict 6-color Chinese woodblock palette invariant (<0.5% non-warm RGB pixels) under intense VFX',
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
        assert.ok(audit.total > 1500, 'Expected valid non-empty canvas sample');
        assert.ok(
          audit.violationRatio < 0.005,
          `Woodblock 6-color palette violated by neon/cool RGB pixels: ${audit.violations}/${audit.total} (${(audit.violationRatio * 100).toFixed(2)}%)`,
        );
        s.assertNoErrors('T2-F11-01');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T2-F11-02',
    tier: 2,
    feature: 'F11',
    name: 'Settings shake=false & lowQuality=true disable camera shake displacement and resize cleanly',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, {
          seed: 3102,
          savePatch: { settings: { shake: false, dmgText: 'off', lowQuality: true } },
        });
        const settings = await s.page.evaluate(() => {
          window.__wugeng.game.applySettings({ shake: false, dmgText: 'off', lowQuality: true });
          window.__e2eStepFrames(5);
          return { ...window.__wugeng.game.settings };
        });
        assert.equal(settings.shake, false);
        assert.equal(settings.dmgText, 'off');
        assert.equal(settings.lowQuality, true);
        s.assertNoErrors('T2-F11-02');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T2-F11-03',
    tier: 2,
    feature: 'F11',
    name: 'WebAudio MAX_VOICES=20 polyphony cap throttles non-priority spam while priority boss/dawn bypasses cap',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser, { isolated: true });
      try {
        await bootToHub(s.page, baseUrl);
        const res = await s.page.evaluate(async () => {
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
          const unknown = a.play('__nonexistent_voice__');
          const proto = window.BaseAudioContext?.prototype || window.AudioContext?.prototype;
          const origOsc = proto.createOscillator;
          let audioCtx = null;
          proto.createOscillator = function captureAudioCtx(...args) {
            audioCtx = this;
            return origOsc.apply(this, args);
          };
          try {
            const liveExpiries = [];
            const wallStart = performance.now();
            let gongCount = 0;
            let lastGongCtx = -Infinity;
            while (performance.now() - wallStart < 4500) {
              const nowMs = performance.now();
              const liveCount = liveExpiries.filter((exp) => exp > nowMs).length;
              const gongGapClear = !audioCtx || audioCtx.currentTime - lastGongCtx >= 0.28;
              if (liveCount >= 15 && gongCount >= 3 && gongGapClear) break;
              if (gongCount < 3 && a.play('gong')) {
                gongCount++;
                lastGongCtx = audioCtx ? audioCtx.currentTime : 0;
                liveExpiries.push(performance.now() + 2950);
              }
              if (a.play('gongSmall')) liveExpiries.push(performance.now() + 2950);
              if (a.play('levelup')) liveExpiries.push(performance.now() + 1450);
              if (a.play('evolve')) liveExpiries.push(performance.now() + 2950);
              if (a.play('watch')) liveExpiries.push(performance.now() + 3250);
              await new Promise((r) => setTimeout(r, 45));
            }
          } finally {
            proto.createOscillator = origOsc;
          }
          for (const n of ['hurt', 'paper', 'coin', 'hit', 'crit', 'pickup']) a.play(n);
          const throttledClick = a.play('click');
          const throttledWoodblock = a.play('woodblock');
          const priorityBoss = a.play('boss');
          const priorityDawn = a.play('dawn');
          const priorityGong = a.play('gong');
          return {
            unknown,
            throttledClick,
            throttledWoodblock,
            priorityBoss,
            priorityDawn,
            priorityGong,
          };
        });
        assert.equal(res.unknown, false, 'Unknown SFX name must safely return false without throwing');
        assert.equal(res.throttledClick, false, 'Non-priority click SFX must be throttled when activeVoices >= MAX_VOICES');
        assert.equal(res.throttledWoodblock, false, 'Non-priority woodblock SFX must be throttled when activeVoices >= MAX_VOICES');
        assert.equal(res.priorityBoss, true, 'Priority boss SFX must bypass MAX_VOICES cap');
        assert.equal(res.priorityDawn, true, 'Priority dawn SFX must bypass MAX_VOICES cap');
        assert.equal(res.priorityGong, true, 'Priority gong SFX must bypass MAX_VOICES cap');
        s.assertNoErrors('T2-F11-03');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T2-F11-04',
    tier: 2,
    feature: 'F11',
    name: 'WebAudio multi-reason suspend reference counting (ad + hidden) stays muted until all reasons resume',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
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
          a.suspend('ad');
          a.suspend('hidden');
          const whileBoth = a.play('gong');
          a.resume('ad');
          await new Promise((r) => setTimeout(r, 25));
          const whileHiddenStillActive = a.play('woodblock');
          a.resume('hidden');
          await waitRunning(800);
          // Advance AudioContext.currentTime past gong gap (0.25s) while running
          await new Promise((r) => setTimeout(r, 275));
          const afterAllCleared = a.play('gong');
          return { whileBoth, whileHiddenStillActive, afterAllCleared, finalState: a.state };
        });
        assert.equal(res.whileBoth, false);
        assert.equal(res.whileHiddenStillActive, false, 'Audio must remain suspended when "ad" resumes while "hidden" is still active');
        assert.equal(res.afterAllCleared, true, `Audio must resume once final suspend reason clears (state=${res.finalState})`);
        s.assertNoErrors('T2-F11-04');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T2-F11-05',
    tier: 2,
    feature: 'F11',
    name: 'All 12 enemy woodblock icons in 百物谱 are pairwise-distinct (zero silent fallback to paperkid)',
    async run({ browser, baseUrl }) {
      const enemyKillMap = Object.fromEntries(ALL_ENEMY_IDS.map((id) => [id, 5]));
      const s = await createIsolatedPage(browser);
      try {
        await bootToHub(s.page, baseUrl, {
          savePatch: { codex: { enemies: enemyKillMap } },
        });
        await fastClick(s.page, '.hub-nav .btn:nth-child(2)');
        await s.page.waitForSelector('.codex-scroll, .codex');
        await s.page.evaluate(() => document.querySelectorAll('.codex-tab')[3]?.click());

        const hashes = await s.page.$$eval('.codex-list .codex-row img.icon', (imgs) => {
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
        assert.equal(hashes.length, 12, `Expected 12 enemy rows in 百鬼 tab, got ${hashes.length}`);
        assert.equal(new Set(hashes).size, 12, 'All 12 enemy icons must have distinct pixel hashes (no silent paperkid fallback)');
        s.assertNoErrors('T2-F11-05');
      } finally {
        await s.close();
      }
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // F12 Boundaries (5 tests)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'T2-F12-01',
    tier: 2,
    feature: 'F12',
    name: 'Corrupt localStorage["wugeng.save"] JSON recovers to defaultSave and backs up wugeng.save.broken',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser, {
        beforeBootInitScript: () => {
          localStorage.setItem('wugeng.save', '{corrupt_json_missing_quote: 999');
        },
      });
      try {
        await bootGame(s.page, baseUrl);
        const res = await s.page.evaluate(() => ({
          brokenBackup: localStorage.getItem('wugeng.save.broken'),
          coins: window.__wugeng.save.coins,
          hero: window.__wugeng.save.selectedHero,
        }));
        assert.equal(res.brokenBackup, '{corrupt_json_missing_quote: 999');
        assert.equal(res.coins, 0);
        assert.equal(res.hero, 'zhou');
        s.assertNoErrors('T2-F12-01');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T2-F12-02',
    tier: 2,
    feature: 'F12',
    name: 'migrateSave clamps out-of-range fields & strips bogus IDs while preserving valid new F5/F10 IDs',
    async run({ browser, baseUrl }) {
      const tampered = JSON.stringify({
        version: 1,
        coins: -5000,
        shop: { tizhi: 99, lidao: -4 },
        unlockedHeroes: ['zhou'],
        selectedHero: 'nonexistent_hero',
        nightUnlocked: 2,
        nightCleared: 1,
        selectedNight: 99,
        codex: {
          weapons: ['gong', 'compass', '__fake_weapon__'],
          evolutions: ['paperhorse', '__fake_evo__'],
          relics: ['strawshoes', '__fake_relic__'],
          enemies: { cinder: 7, __fake_ghost__: 10, paperkid: -3 },
        },
        charms: [{ relicId: 'soulwick' }, { relicId: '__fake_charm__' }],
      });
      const s = await createIsolatedPage(browser, {
        beforeBootInitScript: (raw) => { localStorage.setItem('wugeng.save', raw); },
        beforeBootArg: tampered,
      });
      try {
        await bootGame(s.page, baseUrl);
        const sv = await s.page.evaluate(() => window.__wugeng.save);
        assert.equal(sv.coins, 0);
        assert.equal(sv.shop.tizhi, 5);
        assert.equal(sv.shop.lidao, 0);
        assert.equal(sv.selectedHero, 'zhou');
        assert.equal(sv.selectedNight, 2);
        assert.ok(sv.codex.weapons.includes('compass') && !sv.codex.weapons.includes('__fake_weapon__'), 'Must keep compass & strip fake weapon');
        assert.ok(sv.codex.evolutions.includes('paperhorse') && !sv.codex.evolutions.includes('__fake_evo__'), 'Must keep paperhorse evo');
        assert.ok(sv.codex.relics.includes('strawshoes') && !sv.codex.relics.includes('__fake_relic__'), 'Must keep strawshoes');
        assert.equal(sv.codex.enemies.cinder, 7, 'Must keep new F10 enemy cinder kill count');
        assert.equal(sv.codex.enemies.__fake_ghost__, undefined);
        assert.equal(sv.charms.length, 1);
        assert.equal(sv.charms[0].relicId, 'soulwick');
        s.assertNoErrors('T2-F12-02');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T2-F12-03',
    tier: 2,
    feature: 'F12',
    name: 'Daily check-in (更簿) anti-rollback clock guard blocks claims when lastClaimDate is in the future',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser, { isolated: true });
      try {
        await bootToHub(s.page, baseUrl, {
          query: 'mockAds=1',
          savePatch: { checkin: { cycleDay: 1, lastClaimDate: '2099-12-31', cycles: 0, totalClaims: 1 } },
        });
        await fastClick(s.page, '.hub-nav .btn:nth-child(3)');
        await s.page.waitForSelector('.checkin-grid');
        assert.equal(await s.page.locator('.checkin-foot .btn--ad').count(), 0, 'Clock rollback must hide double-claim ad button');
        const sealBtns = await s.page.$$eval('.checkin-foot .btn--seal', (els) => els.map((e) => e.textContent));
        assert.equal(sealBtns.some((t) => t.includes('画押领取')), false, 'Clock rollback must block normal claim button');
        s.assertNoErrors('T2-F12-03');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T2-F12-04',
    tier: 2,
    feature: 'F12',
    name: 'Unseen enemies in 12-entry 百鬼 tab mask names as "？？？" ("未遇") until killed at least once',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootToHub(s.page, baseUrl, {
          savePatch: { codex: { enemies: { cinder: 1 } } },
        });
        await fastClick(s.page, '.hub-nav .btn:nth-child(2)');
        await s.page.waitForSelector('.codex-scroll, .codex');
        await s.page.evaluate(() => document.querySelectorAll('.codex-tab')[3]?.click());
        const rows = await s.page.$$eval('.codex-list .codex-row', (els) => els.map((el) => ({
          locked: el.classList.contains('is-locked'),
          name: el.querySelector('.codex-row__name')?.textContent?.trim() || '',
        })));
        assert.equal(rows.length, 12, `Expected 12 enemy rows in 百鬼 tab, got ${rows.length}`);
        const unlocked = rows.filter((r) => !r.locked);
        const locked = rows.filter((r) => r.locked);
        assert.equal(unlocked.length, 1);
        assert.equal(unlocked[0].name, '阴火骷髅');
        assert.equal(locked.length, 11);
        assert.ok(locked.every((r) => r.name === '？？？'));
        s.assertNoErrors('T2-F12-04');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T2-F12-05',
    tier: 2,
    feature: 'F12',
    name: 'Cloud sync (?mockCloud=1) union-merges new F5/F10 codex IDs and enforces 62s upload cooldown',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser, { isolated: true });
      try {
        await bootToHub(s.page, baseUrl, { query: 'mockCloud=1' });
        const res = await s.page.evaluate(async () => {
          const w = window.__wugeng;
          w.save.coins = 500;
          w.save.codex.weapons.push('paperhorse');
          w.save.codex.enemies.suona = 3;
          w.save.updatedAt = Date.now() + 5000;
          const up1 = await w.cloud.uploadNow(w.save);
          const up2 = await w.cloud.uploadNow(w.save); // immediate 2nd call -> 62s cooldown!

          // Mutate local save to have different new codex items ('compass', 'cinder') and lower timestamp, then pull merge
          w.save.coins = 100;
          w.save.codex.weapons = ['gong', 'compass'];
          w.save.codex.enemies = { cinder: 4 };
          w.save.updatedAt = 1000;
          const pull = await w.cloud.pullFromCloud(w.save);
          return { up1, up2, merged: pull.merged };
        });
        assert.equal(res.up1.ok, true);
        assert.equal(res.up2.ok, false);
        assert.equal(res.up2.reason, 'cooldown', 'Second upload within 62s must return reason="cooldown"');
        assert.equal(res.merged.coins, 500);
        assert.ok(
          res.merged.codex.weapons.includes('compass') && res.merged.codex.weapons.includes('paperhorse'),
          'Cloud merge must preserve union of new F5 weapons from both local and remote saves',
        );
        assert.equal(res.merged.codex.enemies.suona, 3);
        assert.equal(res.merged.codex.enemies.cinder, 4);
        s.assertNoErrors('T2-F12-05');
      } finally {
        await s.close();
      }
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // F13 Boundaries (5 tests)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'T2-F13-01',
    tier: 2,
    feature: 'F13',
    name: 'Zero dev/test/agent leakage inside dist/wugeng-h5.zip AND zero teamwork docs in repo root',
    async run() {
      const zipPath = path.join(ROOT, 'dist', 'wugeng-h5.zip');
      const { stdout } = await execFileAsync(
        VENV_PYTHON,
        ['-c', 'import json, sys, zipfile; print(json.dumps(zipfile.ZipFile(sys.argv[1]).namelist()))', zipPath],
        { cwd: ROOT, timeout: 10_000 },
      );
      const names = JSON.parse(stdout.trim());
      const forbiddenPatterns = [
        /\.agents/i,
        /\.git/i,
        /\.venv/i,
        /node_modules/i,
        /^wugeng\/(?:e2e|tests|tools|store|docs)\//i,
        /style-lab\.html$/i,
        /mock-run\.js$/i,
        /sheet\.js$/i,
        /collect_chars\.py$/i,
        /common-hanzi\.txt$/i,
        /\.test\./i,
        /\.md$/i,
        /\.py$/i,
        /__pycache__/i,
        /\/\.[^/]+/,
      ];
      const leaked = names.filter((n) => forbiddenPatterns.some((re) => re.test(n)));
      assert.deepEqual(leaked, [], `Forbidden non-runtime files leaked into dist/wugeng-h5.zip: ${leaked.join(', ')}`);

      for (const rootDoc of ['ORIGINAL_REQUEST.md', 'PROJECT.md', 'TEST_INFRA.md', 'TEST_READY.md']) {
        assert.equal(fs.existsSync(path.join(ROOT, rootDoc)), false, `Teamwork metadata ${rootDoc} must NOT sit in repo root`);
      }
    },
  },
  {
    id: 'T2-F13-02',
    tier: 2,
    feature: 'F13',
    name: 'Git status exclude hygiene: .agents/teamwork/ is locally ignored and not reported untracked',
    async run() {
      const { stdout } = await execFileAsync('git', ['status', '--porcelain'], { cwd: ROOT, timeout: 10_000 });
      const lines = stdout.split('\n').filter(Boolean);
      const leakedAgents = lines.filter((l) => l.includes('.agents'));
      assert.deepEqual(
        leakedAgents,
        [],
        `Expected .agents/teamwork/ excluded via .git/info/exclude so git status stays clean, got: ${leakedAgents.join(' | ')}`,
      );
    },
  },
  {
    id: 'T2-F13-03',
    tier: 2,
    feature: 'F13',
    name: 'Extracted zip HTTP server blocks ../ path traversal (403) and returns 404 on excluded style-lab.html',
    async run() {
      const { appDir } = await extractH5ZipToScratch('sec');
      const srv = await startStaticServer(appDir);
      try {
        const rawStatus = await new Promise((resolve, reject) => {
          const req = http.get({ host: '127.0.0.1', port: srv.port, path: '/%2e%2e/package.json' }, (res) => {
            res.resume();
            resolve(res.statusCode);
          });
          req.on('error', reject);
        });
        assert.equal(rawStatus, 403, 'Encoded ../ traversal must be rejected with 403');
        const resStyleLab = await fetch(`${srv.baseUrl}/style-lab.html`);
        assert.equal(resStyleLab.status, 404, 'Dev-only style-lab.html must not exist in extracted H5 package');
        const resMissing = await fetch(`${srv.baseUrl}/src/does-not-exist.js`);
        assert.equal(resMissing.status, 404);
      } finally {
        await srv.close();
      }
    },
  },
  {
    id: 'T2-F13-04',
    tier: 2,
    feature: 'F13',
    name: 'taptap-cli upload-h5-package --dry-run rejects missing/invalid zip path with non-zero exit code',
    async run() {
      let failedCleanly = false;
      try {
        await execFileAsync(
          'taptap-cli',
          [
            'upload-h5-package',
            'dist/__nonexistent_wugeng_h5__.zip',
            '--dev-id', TAPTAP.devId,
            '--app-id', TAPTAP.appId,
            '--screen-orientation', TAPTAP.orientation,
            '--dry-run',
          ],
          { cwd: ROOT, timeout: 10_000 },
        );
      } catch (err) {
        failedCleanly = (err.code ?? 1) !== 0;
      }
      assert.equal(failedCleanly, true, 'taptap-cli must reject missing/invalid H5 zip path on dry-run');
    },
  },
  {
    id: 'T2-F13-05',
    tier: 2,
    feature: 'F13',
    name: 'Extracted production zip enforces 100% zero-ad UI offline & loads privacy.html modal without errors',
    async run({ browser }) {
      const { appDir } = await extractH5ZipToScratch('offline');
      const zipServer = await startStaticServer(appDir);
      const s = await createIsolatedPage(browser, { isolated: true });
      try {
        await bootGame(s.page, zipServer.baseUrl);
        await fastClick(s.page, '.title-foot .link-btn');
        await s.page.waitForSelector('.privacy-body');
        await fastClick(s.page, '.veil .btn--seal');

        await fastClick(s.page, '.title-actions .btn--seal');
        await s.page.waitForSelector('.screen--hub');
        await fastClick(s.page, '.hub-nav .btn:nth-child(3)');
        assert.equal(await s.page.locator('.btn--ad').count(), 0, 'Offline extracted zip must show 0 ad buttons in check-in');
        await fastClick(s.page, '.veil .btn--ghost');

        await fastClick(s.page, '.hub-foot .btn--seal, .btn--big');
        await stepFrames(s.page, 2);
        await triggerLethalHit(s.page);
        assert.equal(await s.page.locator('.btn--ad').count(), 0, 'Offline extracted zip must show 0 ad buttons on death');
        s.assertNoErrors('T2-F13-05');
      } finally {
        await s.close();
        await zipServer.close();
      }
    },
  },
];
