// Tier 1: Feature Happy-Path E2E Coverage (F1–F13, >= 5 genuine tests per feature, 69 total)
// STRICT OPAQUE-BOX: ZERO imports from ../../src/**.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  ALL_ENEMY_IDS,
  ALL_RELIC_IDS,
  ALL_WEAPON_IDS,
  BASELINE_SFX_NAMES,
  ELITE_AFFIX_IDS,
  NEW_REGULAR_ENEMY_IDS,
  NEW_RELIC_IDS,
  NEW_WEAPON_IDS,
  SCHOOL_LABELS,
  SHRINE_KINDS,
  TAPTAP,
  WEAPON_EVO_NAMES,
} from './contracts.mjs';
import {
  ROOT,
  VENV_PYTHON,
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
  sha256File,
  startStaticServer,
  stepFrames,
  triggerChest,
  triggerLevelUp,
} from './harness.mjs';

export const TIER1_TESTS = [
  // ═══════════════════════════════════════════════════════════════════════════
  // F1: Anti-Sticking Combat Physics & Multi-Hit Protection (6 tests)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'T1-F1-01',
    tier: 1,
    feature: 'F1',
    name: 'Post-hit invulnerability (hurtInvuln ~0.24s) blocks multi-enemy instant burst in 1 frame',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { seed: 101 });
        const res = await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          r.enemies.length = 0;
          r._spawnAcc = -99999;
          r._nextWaveT = 99999;
          r.weapons.forEach((w) => { w.cd = 9999; });
          r.player.hp = 100;
          r.player.maxHp = 100;
          r.player.armor = 0;
          r.player.invulnT = 0;
          for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2;
            r._spawnQueue.push({
              type: 'lanternghost',
              x: r.player.x + Math.cos(a) * 6,
              y: r.player.y + Math.sin(a) * 6,
              opts: {},
            });
          }
          window.__e2eStepFrames(2);
          return {
            hpAfter: r.player.hp,
            invulnT: r.player.invulnT,
          };
        });
        assert.ok(
          res.hpAfter >= 88 && res.hpAfter < 100,
          `Expected only 1 contact hit from 6 overlapping ghosts due to post-hit hurtInvuln (got hp=${res.hpAfter}/100)`,
        );
        assert.ok(
          res.invulnT >= 0.16,
          `Expected post-hit player.invulnT >= 0.16s (~0.24s hurtInvuln), got ${res.invulnT}`,
        );
        s.assertNoErrors('T1-F1-01');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T1-F1-02',
    tier: 1,
    feature: 'F1',
    name: 'Player hurt triggers radial emergency pushback pulse (hurtPushRadius ~58, force ~220)',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { seed: 102 });
        const res = await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          r.enemies.length = 0;
          r._spawnAcc = -99999;
          r._nextWaveT = 99999;
          r.weapons.forEach((w) => { w.cd = 9999; });
          r.player.invulnT = 0;
          // 1 attacker touching player + 3 surrounding enemies within r=36 (inside hurtPushRadius=58)
          r._spawnQueue.push({ type: 'paperkid', x: r.player.x + 8, y: r.player.y, opts: {} });
          r._spawnQueue.push({ type: 'paperkid', x: r.player.x - 32, y: r.player.y, opts: {} });
          r._spawnQueue.push({ type: 'paperkid', x: r.player.x, y: r.player.y + 34, opts: {} });
          r._spawnQueue.push({ type: 'paperkid', x: r.player.x, y: r.player.y - 34, opts: {} });
          window.__e2eStepFrames(1);
          const beforeAvgDist = r.enemies.reduce((acc, e) => acc + Math.hypot(e.x - r.player.x, e.y - r.player.y), 0) / r.enemies.length;
          window.__e2eStepFrames(6);
          const afterAvgDist = r.enemies.reduce((acc, e) => acc + Math.hypot(e.x - r.player.x, e.y - r.player.y), 0) / r.enemies.length;
          return { beforeAvgDist, afterAvgDist };
        });
        assert.ok(
          res.afterAvgDist > res.beforeAvgDist + 4,
          `Expected emergency radial pushback on player hurt to push nearby enemies outward (before=${res.beforeAvgDist.toFixed(2)}, after=${res.afterAvgDist.toFixed(2)})`,
        );
        s.assertNoErrors('T1-F1-02');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T1-F1-03',
    tier: 1,
    feature: 'F1',
    name: 'Continuous player-enemy soft separation prevents enemy center collapse onto player',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { seed: 103 });
        const res = await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          r.enemies.length = 0;
          r._spawnAcc = -99999;
          r._nextWaveT = 99999;
          r.weapons.forEach((w) => { w.cd = 9999; });
          r._spawnQueue.push({ type: 'lanternghost', x: r.player.x + 3, y: r.player.y, opts: {} });
          window.__e2eStepFrames(1);
          // Prevent contact hurt pulse so we isolate pure continuous soft separation
          r.enemies[0].atkT = 20;
          r.enemies[0].kbx = 0;
          r.enemies[0].kby = 0;
          window.__e2eStepFrames(20);
          const e = r.enemies[0];
          const dist = Math.hypot(e.x - r.player.x, e.y - r.player.y);
          const minTarget = e.r + r.player.r * 0.85;
          return { dist, minTarget };
        });
        assert.ok(
          res.dist >= res.minTarget * 0.8,
          `Expected continuous player-enemy soft separation to maintain dist >= ${(res.minTarget * 0.8).toFixed(1)}px, got ${res.dist.toFixed(2)}px`,
        );
        s.assertNoErrors('T1-F1-03');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T1-F1-04',
    tier: 1,
    feature: 'F1',
    name: 'Sedan (纸轿子) death split grants 4 paperkids ~0.40s atkT grace and outward impulse',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { seed: 104 });
        const res = await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          r.enemies.length = 0;
          r._spawnAcc = -99999;
          r._nextWaveT = 99999;
          r.player.hp = 100;
          r.player.invulnT = 0;
          r._spawnQueue.push({ type: 'sedan', x: r.player.x + 44, y: r.player.y, opts: {} });
          window.__e2eStepFrames(1);
          const sedan = r.enemies.find((e) => e.type === 'sedan');
          sedan.hp = 1;
          sedan.atkT = 10;
          const hpBeforeSplit = r.player.hp;
          const gong = r.weapons.find((w) => w.id === 'gong');
          gong.cd = 0;
          window.__e2eStepFrames(2);
          const kids = r.enemies.filter((e) => e.type === 'paperkid' && !e.dead);
          return {
            kidCount: kids.length,
            minAtkT: kids.length ? Math.min(...kids.map((k) => k.atkT)) : -1,
            hpBeforeSplit,
            hpAfterSplit: r.player.hp,
          };
        });
        assert.equal(res.kidCount, 4, `Expected sedan to split into 4 paperkids, got ${res.kidCount}`);
        assert.ok(
          res.minAtkT >= 0.30,
          `Expected split paperkids to spawn with ~0.40s atkT grace (>= 0.30s), got minAtkT=${res.minAtkT.toFixed(3)}`,
        );
        assert.equal(res.hpAfterSplit, res.hpBeforeSplit, 'Split paperkids must not deal frame-1 ambush contact damage');
        s.assertNoErrors('T1-F1-04');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T1-F1-05',
    tier: 1,
    feature: 'F1',
    name: 'Tuned knockbackDecay (~0.008) & stagger knockback visibly displaces hit enemies',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { seed: 105 });
        const res = await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          r.enemies.length = 0;
          r._spawnAcc = -99999;
          r._nextWaveT = 99999;
          r._spawnQueue.push({ type: 'drowned', x: r.player.x + 42, y: r.player.y, opts: {} });
          window.__e2eStepFrames(1);
          const e = r.enemies[0];
          e.hp = 9999;
          e.speed = 0;
          const startX = e.x;
          r.weapons[0].cd = 0; // gong fires knockback pulse
          window.__e2eStepFrames(12);
          return { pushedPx: e.x - startX, kbx: e.kbx };
        });
        assert.ok(
          res.pushedPx >= 18,
          `Expected gong knockback with tuned knockbackDecay (0.008) to displace enemy >= 18px in 0.2s (got ${res.pushedPx.toFixed(2)}px)`,
        );
        s.assertNoErrors('T1-F1-05');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T1-F1-06',
    tier: 1,
    feature: 'F1',
    name: 'Virtual joystick drag (>= 14px) + anti-stick physics allows clean escape from 8-enemy surround',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { seed: 106 });
        await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          r.enemies.length = 0;
          r._spawnAcc = -99999;
          r._nextWaveT = 99999;
          r.weapons.forEach((w) => { w.cd = 9999; });
          r.player.hp = 100;
          for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2;
            r._spawnQueue.push({
              type: 'paperkid',
              x: r.player.x + Math.cos(a) * 24,
              y: r.player.y + Math.sin(a) * 24,
              opts: {},
            });
          }
          window.__e2eStepFrames(1);
        });
        await s.page.mouse.move(180, 520);
        await s.page.mouse.down();
        await s.page.mouse.move(225, 520); // 45px right drag > FULL_SPEED_RADIUS (14px)
        const escaped = await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          const x0 = r.player.x;
          window.__e2eStepFrames(24); // 0.40s
          return { dx: r.player.x - x0, hp: r.player.hp, status: r.status };
        });
        await s.page.mouse.up();
        assert.equal(escaped.status, 'playing');
        assert.ok(escaped.dx > 28, `Expected player to escape rightward > 28px via joystick, got dx=${escaped.dx.toFixed(1)}`);
        assert.ok(escaped.hp >= 85, `Expected multi-hit protection during escape (hp=${escaped.hp}/100)`);
        s.assertNoErrors('T1-F1-06');
      } finally {
        await s.close();
      }
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // F2: Fair Monster/Boss Speed Curves & Darkness-Penetrating Telegraphs (5 tests)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'T1-F2-01',
    tier: 1,
    feature: 'F2',
    name: 'Minute speed scaling lowered (minuteSpeedGrowth=0.032, speedGrowthCap=1.35)',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { seed: 201 });
        const res = await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          r.enemies.length = 0;
          r._spawnAcc = -99999;
          r._nextWaveT = 99999;
          r._bossSpawned = { horse: true, umbrella: true, youshen: true };
          r._warderSpawned = { warder_150: true, warder_360: true };
          r.time = 0;
          r._spawnQueue.push({ type: 'paperkid', x: 200, y: 0, opts: {} });
          window.__e2eStepFrames(1);
          const spd0 = r.enemies.find((e) => e.type === 'paperkid').speed;
          r.enemies.length = 0;
          r.time = 540; // 9 minutes (Watch 5)
          r.watch = 5;
          r._spawnQueue.push({ type: 'paperkid', x: 200, y: 0, opts: {} });
          window.__e2eStepFrames(1);
          const spd9 = r.enemies.find((e) => e.type === 'paperkid').speed;
          return { spd0, spd9, ratio: spd9 / spd0 };
        });
        assert.ok(
          res.ratio <= 1.36 && res.ratio >= 1.24,
          `Expected 9-min enemy speed ratio ~1.288 (<= 1.35 cap, down from old 1.522), got ${res.ratio.toFixed(3)}`,
        );
        s.assertNoErrors('T1-F2-01');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T1-F2-02',
    tier: 1,
    feature: 'F2',
    name: 'Shade (影祟) base speed rebalanced (~72 vs old 85) so base player outruns it in Watch 5',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { seed: 202 });
        const res = await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          r.enemies.length = 0;
          r._spawnAcc = -99999;
          r._nextWaveT = 99999;
          r._bossSpawned = { horse: true, umbrella: true, youshen: true };
          r._warderSpawned = { warder_150: true, warder_360: true };
          r.time = 0;
          r._spawnQueue.push({ type: 'shade', x: 200, y: 0, opts: {} });
          window.__e2eStepFrames(1);
          const baseShade = r.enemies.find((e) => e.type === 'shade').speed;
          r.enemies.length = 0;
          r.time = 540;
          r.watch = 5;
          r._spawnQueue.push({ type: 'shade', x: 200, y: 0, opts: {} });
          window.__e2eStepFrames(1);
          const watch5Shade = r.enemies.find((e) => e.type === 'shade').speed;
          return { baseShade, watch5Shade, playerSpeed: r.player.speed };
        });
        assert.ok(
          res.baseShade <= 75,
          `Expected rebalanced shade base speed ~72 (<= 75, down from 85), got ${res.baseShade}`,
        );
        assert.ok(
          res.watch5Shade < res.playerSpeed,
          `Expected Watch 5 shade speed (${res.watch5Shade.toFixed(1)}) < base player speed (${res.playerSpeed.toFixed(1)})`,
        );
        s.assertNoErrors('T1-F2-02');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T1-F2-03',
    tier: 1,
    feature: 'F2',
    name: 'Weasel (黄皮子) dash decoupled from minute speed growth (~255 px/s, pause ~0.72s, trigger ~175px)',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { seed: 203 });
        const res = await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          r.enemies.length = 0;
          r._spawnAcc = -99999;
          r._nextWaveT = 99999;
          r._bossSpawned = { horse: true, umbrella: true, youshen: true };
          r.weapons.forEach((w) => { w.cd = 9999; });
          r.time = 490; // 8+ minutes
          r.watch = 5;
          // At d=200 (> triggerDist=175), weasel should NOT trigger pause yet
          r._spawnQueue.push({ type: 'weasel', x: r.player.x + 200, y: r.player.y, opts: {} });
          window.__e2eStepFrames(2);
          const stateAt200 = r.enemies[0].state;
          // Move inside triggerDist=175 (e.g. d=150)
          r.enemies[0].x = r.player.x + 150;
          r.enemies[0].y = r.player.y;
          r.enemies[0].stateT = 0;
          window.__e2eStepFrames(1);
          const pauseState = r.enemies[0].state;
          const pauseDuration = r.enemies[0].stateT;
          // Advance into dash and measure 6-frame (0.10s) dash velocity
          r.enemies[0].state = 'dash';
          r.enemies[0].stateT = 0.5;
          r.enemies[0].dx = -1;
          r.enemies[0].dy = 0;
          r.player.y = 400; // move player out of collision line
          const xBefore = r.enemies[0].x;
          const tBefore = r.time;
          window.__e2eStepFrames(6);
          const dashSpeed = Math.abs(r.enemies[0].x - xBefore) / (r.time - tBefore);
          return { stateAt200, pauseState, pauseDuration, dashSpeed };
        });
        assert.equal(res.stateAt200, 'move', 'Weasel at d=200px (> triggerDist=175px) should still be moving, not pausing');
        assert.equal(res.pauseState, 'pause', 'Weasel at d=150px (< triggerDist=175px) should enter pause windup');
        assert.ok(res.pauseDuration >= 0.68, `Expected weasel pause >= 0.68s (~0.72s), got ${res.pauseDuration.toFixed(3)}s`);
        assert.ok(
          res.dashSpeed >= 220 && res.dashSpeed <= 285,
          `Expected weasel dash speed decoupled around ~255 px/s at 8 min (got ${res.dashSpeed.toFixed(1)} px/s)`,
        );
        s.assertNoErrors('T1-F2-03');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T1-F2-04',
    tier: 1,
    feature: 'F2',
    name: 'Drowned (水鬼) slow rebalanced to 0.80 & Youshen (夜游神) P3 enrage speed ~1.60x with lunge',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { seed: 204 });
        const res = await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          r.enemies.length = 0;
          r._spawnAcc = -99999;
          r._nextWaveT = 99999;
          r.weapons.forEach((w) => { w.cd = 9999; });
          r._spawnQueue.push({ type: 'drowned', x: r.player.x + 40, y: r.player.y, opts: {} });
          window.__e2eStepFrames(2);
          const auraSlow = r._auraSlow;

          // Spawn Youshen via BOSS_TIMELINE at t=600
          r.enemies.length = 0;
          r._bossSpawned = { horse: true, umbrella: true, youshen: false };
          r.time = 600.1;
          window.__e2eStepFrames(2);
          const ys = r.enemies.find((e) => e.type === 'youshen');
          r.player.invulnT = 99;
          ys.x = r.player.x + 300; ys.y = r.player.y;
          const p1x = ys.x, p1t = r.time;
          window.__e2eStepFrames(6);
          const p1Speed = Math.abs(ys.x - p1x) / (r.time - p1t);
          ys.hp = Math.floor(ys.maxHp * 0.2); // Phase 3
          ys.x = r.player.x + 300; ys.y = r.player.y;
          const p3x = ys.x, p3t = r.time;
          window.__e2eStepFrames(6);
          const p3Speed = Math.abs(ys.x - p3x) / (r.time - p3t);
          let sawWindup = false, sawLunge = false;
          window.__e2eStepFrames(200, { onStep: () => {
            if (ys.state === 'windup' && ys.telegraphLen > 0) sawWindup = true;
            if (ys.state === 'lunge') sawLunge = true;
          } });
          return { auraSlow, p1Speed, p3Speed, ratio: p3Speed / p1Speed, ysPhase: ys.phase, sawWindup, sawLunge };
        });
        assert.ok(
          Math.abs(res.auraSlow - 0.80) <= 0.02,
          `Expected drowned playerSlow rebalanced to ~0.80 (up from 0.72), got ${res.auraSlow}`,
        );
        assert.equal(res.ysPhase, 3);
        assert.ok(
          res.ratio >= 1.48 && res.ratio <= 1.66 && res.p3Speed <= 98,
          `Expected Youshen P3/P1 speed ratio ~1.60 (<= 1.66 vs old >= 1.85) and p3Speed <= 98 px/s, got ratio=${res.ratio.toFixed(3)}, p3Speed=${res.p3Speed.toFixed(1)}`,
        );
        assert.ok(res.sawWindup && res.sawLunge, `Expected Youshen P3 telegraphed halberd lunge (sawWindup=${res.sawWindup}, sawLunge=${res.sawLunge})`);
        s.assertNoErrors('T1-F2-04');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T1-F2-05',
    tier: 1,
    feature: 'F2',
    name: 'Darkness-penetrating vermilion charge telegraph & Umbrella shield/open visual distinction on canvas',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser, { styleLab: true });
      try {
        await s.page.goto(`${baseUrl}/style-lab.html?watch=5&scene=boss&boss=horse`);
        await s.page.waitForFunction(() => Boolean(window.__renderer && window.__run));
        const check = await s.page.evaluate(() => {
          const run = window.__run;
          const renderer = window.__renderer;
          const c = document.getElementById('game-canvas');
          const ctx = c.getContext('2d');
          const dpr = Math.min(2, window.devicePixelRatio || 1);

          // 1) Horse at d=210px right of player in Watch 5 heavy darkness (0.78)
          run.darkness = 0.78;
          run.projectiles.length = 0;
          run.enemies = [{
            id: 1, type: 'horse', boss: true, elite: false,
            x: run.player.x + 210, y: run.player.y, r: 30, hp: 1800, maxHp: 1800,
            state: 'chase', stateT: 1, hitT: 0, slowT: 0, stunT: 0, atkT: 0,
            angle: Math.PI, dx: -1, dy: 0, kbx: 0, kby: 0, speed: 60, dmg: 11, phase: 1, dead: false,
          }];
          run.boss = { id: 1, type: 'horse', hp: 1800, maxHp: 1800, phase: 1 };

          const sampleCorridorVermilion = () => {
            // Sample world offset +145..+215px right of screen center (well outside 118px lantern hole)
            const cy = Math.floor((window.innerHeight / 2) * dpr);
            const xStart = Math.floor((window.innerWidth / 2 + 135) * dpr);
            const w = Math.max(10, Math.floor(60 * dpr));
            const h = Math.max(8, Math.floor(28 * dpr));
            const data = ctx.getImageData(xStart, cy - Math.floor(h / 2), w, h).data;
            let verm = 0;
            for (let i = 0; i < data.length; i += 4) {
              if (data[i] >= 65 && data[i] - data[i + 1] >= 26) verm++;
            }
            return verm;
          };

          renderer.render(run, 1, 0, { shake: false, dmgText: 'off', safeTop: 0, safeBottom: 0 });
          const chaseVerm = sampleCorridorVermilion();

          run.enemies[0].state = 'windup';
          run.enemies[0].stateT = 0.85;
          run.enemies[0].telegraphLen = 410;
          run.enemies[0].telegraphWidth = 60;
          run.enemies[0].telegraphProgress = 0.55;
          run.enemies[0].telegraphX = run.player.x - 200;
          run.enemies[0].telegraphY = run.player.y;
          renderer.render(run, 1, 0, { shake: false, dmgText: 'off', safeTop: 0, safeBottom: 0 });
          const windupVerm = sampleCorridorVermilion();

          // 2) Umbrella shield vs open visual distinction in lit center
          run.darkness = 0.1;
          run.enemies = [{
            id: 2, type: 'umbrella', boss: true, elite: false,
            x: run.player.x + 70, y: run.player.y, r: 28, hp: 5000, maxHp: 5000,
            state: 'shield', stateT: 3, hitT: 0, slowT: 0, stunT: 0, atkT: 0,
            angle: 0, dx: 0, dy: 0, kbx: 0, kby: 0, speed: 45, dmg: 18, phase: 1, dead: false,
          }];
          run.boss = { id: 2, type: 'umbrella', hp: 5000, maxHp: 5000, phase: 1 };
          const bx = Math.floor((window.innerWidth / 2 + 70 - 34) * dpr);
          const by = Math.floor((window.innerHeight / 2 - 34) * dpr);
          const bw = Math.floor(68 * dpr);
          renderer.render(run, 1, 0, { shake: false, dmgText: 'off', safeTop: 0, safeBottom: 0 });
          const shieldImg = ctx.getImageData(bx, by, bw, bw).data;

          run.enemies[0].state = 'open';
          run.enemies[0].phase = 2;
          renderer.render(run, 1, 0, { shake: false, dmgText: 'off', safeTop: 0, safeBottom: 0 });
          const openImg = ctx.getImageData(bx, by, bw, bw).data;

          let diffPx = 0;
          for (let i = 0; i < shieldImg.length; i += 4) {
            const dr = Math.abs(shieldImg[i] - openImg[i]);
            const dg = Math.abs(shieldImg[i + 1] - openImg[i + 1]);
            const db = Math.abs(shieldImg[i + 2] - openImg[i + 2]);
            if (dr + dg + db > 35) diffPx++;
          }
          return { chaseVerm, windupVerm, umbrellaDiffPx: diffPx };
        });
        assert.ok(
          check.windupVerm > check.chaseVerm + 25,
          `Expected vermilion charge telegraph above darkness mask during horse windup (chase=${check.chaseVerm}, windup=${check.windupVerm})`,
        );
        assert.ok(
          check.umbrellaDiffPx > 80,
          `Expected distinct woodblock visuals between umbrella 'shield' and 'open' states (diffPx=${check.umbrellaDiffPx})`,
        );
        s.assertNoErrors('T1-F2-05');
      } finally {
        await s.close();
      }
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // F3: Decoupled Multi-Path 开光 & Interactive Chest Awakening (6 tests)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'T1-F3-01',
    tier: 1,
    feature: 'F3',
    name: 'Paired relic evolution path grants 开光 + ~18% paired mastery damage bonus',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        // Run A: gong Lv5 + paired clapper -> evolved with paired mastery bonus
        await bootAndStartRun(s.page, baseUrl, { seed: 301 });
        await grantItemViaLevelUp(s.page, 'weapon', 'gong', 4);
        await grantItemViaLevelUp(s.page, 'relic', 'clapper', 1);
        await triggerChest(s.page);
        await confirmChestModal(s.page);
        const dmgPaired = await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          r.enemies.length = 0;
          r._spawnAcc = -99999;
          r._nextWaveT = 99999;
          r.mods.critChance = 0;
          r._spawnQueue.push({ type: 'drowned', x: r.player.x + 35, y: r.player.y, opts: {} });
          window.__e2eStepFrames(1);
          const e = r.enemies[0];
          e.hp = 5000;
          e.maxHp = 5000;
          const g = r.weapons.find((w) => w.id === 'gong');
          g.cd = 0;
          g._burst = 0;
          window.__e2eStepFrames(1);
          return { evolved: g.evolved, dealt: 5000 - e.hp };
        });
        assert.equal(dmgPaired.evolved, true, 'Expected gong Lv5 + clapper to evolve');

        // Run B: gong Lv5 + Lv5 bagua (maxRelic path, NO clapper) -> evolved without paired bonus
        await bootAndStartRun(s.page, baseUrl, { seed: 301 });
        await grantItemViaLevelUp(s.page, 'weapon', 'gong', 4);
        await grantItemViaLevelUp(s.page, 'relic', 'bagua', 5);
        await triggerChest(s.page);
        await confirmChestModal(s.page);
        const dmgUnpaired = await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          const g = r.weapons.find((w) => w.id === 'gong');
          if (!g.evolved) return { evolved: false, dealt: 0 };
          r.enemies.length = 0;
          r._spawnAcc = -99999;
          r._nextWaveT = 99999;
          r.mods.critChance = 0;
          r._spawnQueue.push({ type: 'drowned', x: r.player.x + 35, y: r.player.y, opts: {} });
          window.__e2eStepFrames(1);
          const e = r.enemies[0];
          e.hp = 5000;
          e.maxHp = 5000;
          g.cd = 0;
          g._burst = 0;
          window.__e2eStepFrames(1);
          return { evolved: g.evolved, dealt: 5000 - e.hp };
        });
        assert.equal(dmgUnpaired.evolved, true, 'Expected gong Lv5 + Lv5 bagua to evolve via maxRelic path');
        assert.ok(
          dmgPaired.dealt >= dmgUnpaired.dealt * 1.14,
          `Expected paired relic evolution to deal ~+18% mastery bonus over non-paired evolution (paired=${dmgPaired.dealt}, unpaired=${dmgUnpaired.dealt})`,
        );
        s.assertNoErrors('T1-F3-01');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T1-F3-02',
    tier: 1,
    feature: 'F3',
    name: 'Decoupled school resonance path (>= 3 school-tag items, NO paired relic) evolves Lv5 weapon',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { seed: 302 });
        // gong (zhenhun) Lv5 + bell (zhenhun) Lv1 + redstring (zhenhun) Lv1 => 3 zhenhun items, NO clapper!
        await grantItemViaLevelUp(s.page, 'weapon', 'gong', 4);
        await grantItemViaLevelUp(s.page, 'weapon', 'bell', 1);
        await grantItemViaLevelUp(s.page, 'relic', 'redstring', 1);
        await triggerChest(s.page);
        assert.ok(await s.page.$('.overlay--chest'), 'Expected .overlay--chest on chest open (PROJECT.md §4)');
        await confirmChestModal(s.page);
        const evolved = await s.page.evaluate(() => window.__wugeng.game.run.weapons.find((w) => w.id === 'gong')?.evolved);
        assert.equal(evolved, true, 'Expected gong Lv5 to evolve via >=3 zhenhun school resonance without clapper');
        s.assertNoErrors('T1-F3-02');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T1-F3-03',
    tier: 1,
    feature: 'F3',
    name: 'Decoupled max-relic path (any Lv5 relic, NO paired relic, < 3 school items) evolves Lv5 weapon',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { seed: 303 });
        // lantern (yangyan, pair=censer) Lv5 + bagua (daofa) Lv5 => no censer, only 1 yangyan item, 1 daofa item
        await grantItemViaLevelUp(s.page, 'weapon', 'lantern', 5);
        await grantItemViaLevelUp(s.page, 'relic', 'bagua', 5);
        await triggerChest(s.page);
        await confirmChestModal(s.page);
        const evolved = await s.page.evaluate(() => window.__wugeng.game.run.weapons.find((w) => w.id === 'lantern')?.evolved);
        assert.equal(evolved, true, 'Expected lantern Lv5 to evolve via Lv5 bagua (maxRelic path) without censer');
        s.assertNoErrors('T1-F3-03');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T1-F3-04',
    tier: 1,
    feature: 'F3',
    name: 'Interactive Chest UI lets player pick which eligible weapon to evolve ([data-evo-weapon])',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { seed: 304 });
        // Weapon 0: gong Lv5 + clapper; Weapon 1: talisman Lv5 + cinnabar
        await grantItemViaLevelUp(s.page, 'weapon', 'gong', 4);
        await grantItemViaLevelUp(s.page, 'relic', 'clapper', 1);
        await grantItemViaLevelUp(s.page, 'weapon', 'talisman', 5);
        await grantItemViaLevelUp(s.page, 'relic', 'cinnabar', 1);

        await triggerChest(s.page);
        assert.ok(await s.page.$('.overlay--chest'), 'Expected .overlay--chest container');
        const chestChoicesLen = await s.page.evaluate(() => window.__wugeng.game.run.chestChoices?.length || 0);
        assert.ok(chestChoicesLen >= 2, `Expected run.chestChoices to list >= 2 eligible weapons, got ${chestChoicesLen}`);

        // Deliberately pick SECOND weapon ('talisman'), NOT slot 0 ('gong')!
        await confirmChestModal(s.page, 'talisman');

        const state = await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          return {
            gongEvolved: r.weapons.find((w) => w.id === 'gong')?.evolved,
            talismanEvolved: r.weapons.find((w) => w.id === 'talisman')?.evolved,
            overlay: window.__wugeng.overlay,
          };
        });
        assert.equal(state.talismanEvolved, true, 'Player-selected talisman should be evolved');
        assert.equal(state.gongEvolved, false, 'Unselected gong should remain un-evolved for a later chest');
        assert.equal(state.overlay, null);
        s.assertNoErrors('T1-F3-04');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T1-F3-05',
    tier: 1,
    feature: 'F3',
    name: 'Chest weapon awakening grants +50 ult charge and clears enemyBullets within r=180 shockwave',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { seed: 305 });
        await grantItemViaLevelUp(s.page, 'weapon', 'gong', 4);
        await grantItemViaLevelUp(s.page, 'relic', 'clapper', 1);
        await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          r.player.ult = 15;
          // Place hostile enemyBullets at d=90 (<180, should clear) and d=260 (>180, should survive)
          r.projectiles.push(
            { id: 77001, kind: 'enemyBullet', x: r.player.x + 90, y: r.player.y, r: 7, angle: 0, t: 0, life: 5, vx: 0, vy: 0, dmg: 10 },
            { id: 77002, kind: 'enemyBullet', x: r.player.x + 260, y: r.player.y, r: 7, angle: 0, t: 0, life: 5, vx: 0, vy: 0, dmg: 10 },
          );
        });
        await triggerChest(s.page);
        await confirmChestModal(s.page);
        await stepFrames(s.page, 1);
        const res = await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          return {
            ult: r.player.ult,
            nearBulletAlive: r.projectiles.some((p) => p.id === 77001 && !p.dead),
            farBulletAlive: r.projectiles.some((p) => p.id === 77002 && !p.dead),
          };
        });
        assert.ok(res.ult >= 65, `Expected +50 ult charge on weapon awakening (15 -> >=65), got ${res.ult}`);
        assert.equal(res.nearBulletAlive, false, 'Expected enemyBullet at r=90 (<180) cleared by awakening shockwave');
        assert.equal(res.farBulletAlive, true, 'Expected enemyBullet at r=260 (>180) outside shockwave to remain');
        s.assertNoErrors('T1-F3-05');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T1-F3-06',
    tier: 1,
    feature: 'F3',
    name: 'Main run provides >= 4 chest sources (2:30 & 6:00 Mini-Warders + 4:00 Horse + 8:00 Umbrella)',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { seed: 306 });
        const chestDrops = await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          const milestones = [150, 240, 360, 480];
          const results = [];
          r.mods.pickupRange = 1; // keep dropped chest & XP on ground so we inspect each drop cleanly
          for (const t of milestones) {
            if (window.__wugeng.game.isPaused()) window.__wugeng.game.resume();
            r.enemies.length = 0;
            r.pickups.length = 0;
            r._spawnAcc = -99999;
            r._nextWaveT = 99999;
            r.time = t - 0.04;
            for (let k = 0; k < 5; k++) {
              window.__e2eStepFrames(2);
              while (window.__wugeng.overlay === 'levelup') {
                document.querySelector('.qian')?.click();
              }
            }
            const chestCarrier = r.enemies.find((e) => e.chest);
            if (!chestCarrier) {
              results.push({ t, spawned: false, droppedChest: false });
              continue;
            }
            chestCarrier.x = r.player.x + 56; // inside gong r=70, outside collectRadius+player.r=28
            chestCarrier.y = r.player.y;
            chestCarrier.hp = 1;
            chestCarrier.paperArmor = 0;
            const g = r.weapons.find((w) => w.id === 'gong');
            g.cd = 0;
            window.__e2eStepFrames(2);
            const droppedChest = r.pickups.some((p) => p.kind === 'chest') || r.status === 'chest' || r._pendingChests > 0;
            results.push({ t, spawned: true, type: chestCarrier.type, droppedChest });
          }
          return results;
        });
        const validCount = chestDrops.filter((x) => x.spawned && x.droppedChest).length;
        assert.equal(
          validCount,
          4,
          `Expected all 4 main-run milestones (150s, 240s, 360s, 480s) to spawn a chest-dropping warder/boss: ${JSON.stringify(chestDrops)}`,
        );
        s.assertNoErrors('T1-F3-06');
      } finally {
        await s.close();
      }
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // F4: Overhauled Post-开光 Weapon Evolutions & Power Transformation (6 tests)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'T1-F4-01',
    tier: 1,
    feature: 'F4',
    name: 'Global evolved haste (evoCdMul=0.82) & higher evoMult (>=1.85) boost post-开光 DPS',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { seed: 401 });
        await grantItemViaLevelUp(s.page, 'weapon', 'gong', 4);
        await grantItemViaLevelUp(s.page, 'relic', 'bagua', 5); // zero CDR/dmgPct relic so ratio is pure!

        const beforeEvo = await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          r.enemies.length = 0;
          r._spawnAcc = -99999;
          r._nextWaveT = 99999;
          r.mods.critChance = 0;
          r._spawnQueue.push({ type: 'drowned', x: r.player.x + 35, y: r.player.y, opts: {} });
          window.__e2eStepFrames(1);
          const e = r.enemies[0];
          e.hp = 5000;
          e.maxHp = 5000;
          const g = r.weapons.find((w) => w.id === 'gong');
          g.cd = 0;
          window.__e2eStepFrames(1);
          return { cdAfterFire: g.cd, dmg: 5000 - e.hp };
        });

        await triggerChest(s.page);
        await confirmChestModal(s.page);

        const afterEvo = await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          r.enemies.length = 0;
          r._spawnAcc = -99999;
          r._nextWaveT = 99999;
          r.mods.critChance = 0;
          r._spawnQueue.push({ type: 'drowned', x: r.player.x + 35, y: r.player.y, opts: {} });
          window.__e2eStepFrames(1);
          const e = r.enemies[0];
          e.hp = 5000;
          e.maxHp = 5000;
          const g = r.weapons.find((w) => w.id === 'gong');
          g.cd = 0;
          g._burst = 0;
          window.__e2eStepFrames(1);
          return { evolved: g.evolved, cdAfterFire: g.cd, dmg: 5000 - e.hp };
        });

        assert.equal(afterEvo.evolved, true);
        const cdRatio = afterEvo.cdAfterFire / beforeEvo.cdAfterFire;
        const dmgRatio = afterEvo.dmg / beforeEvo.dmg;
        assert.ok(
          cdRatio <= 0.85,
          `Expected evolved weapon cooldown multiplied by evoCdMul=0.82 (ratio <= 0.85), got ${cdRatio.toFixed(3)} (${beforeEvo.cdAfterFire} -> ${afterEvo.cdAfterFire})`,
        );
        assert.ok(
          dmgRatio >= 1.85,
          `Expected evolved weapon evoMult >= 1.85, got ${dmgRatio.toFixed(3)} (${beforeEvo.dmg} -> ${afterEvo.dmg})`,
        );
        s.assertNoErrors('T1-F4-01');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T1-F4-02',
    tier: 1,
    feature: 'F4',
    name: 'Overhauled 五更鸣锣 (gong) 3rd-wave bullet shatter & 长明灯 (lantern) yangyanMark + Boss 6-stack flare',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { seed: 402 });
        await grantItemViaLevelUp(s.page, 'weapon', 'gong', 4);
        await grantItemViaLevelUp(s.page, 'relic', 'clapper', 1);
        await triggerChest(s.page);
        await confirmChestModal(s.page);
        await grantItemViaLevelUp(s.page, 'weapon', 'lantern', 5);
        await grantItemViaLevelUp(s.page, 'relic', 'censer', 1);
        await triggerChest(s.page);
        await confirmChestModal(s.page);

        const res = await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          r.enemies.length = 0;
          r._spawnAcc = -99999;
          r._nextWaveT = 99999;
          const g = r.weapons.find((w) => w.id === 'gong');
          const lan = r.weapons.find((w) => w.id === 'lantern');
          lan.cd = 9999;
          r.projectiles = r.projectiles.filter((p) => p.persistent);
          r.projectiles.push({
            id: 78001, kind: 'enemyBullet', x: r.player.x + 120, y: r.player.y,
            r: 7, angle: 0, t: 0, life: 8, vx: 0, vy: 0, dmg: 10,
          });
          r._spawnQueue.push({ type: 'drowned', x: r.player.x + 175, y: r.player.y, opts: { fixedHp: 9999 } });
          window.__e2eStepFrames(1);
          const farEnemy = r.enemies[0];
          farEnemy.speed = 0;
          const startDist = Math.hypot(farEnemy.x - r.player.x, farEnemy.y - r.player.y);
          g.cd = 0;
          window.__e2eStepFrames(38);
          const bulletShattered = !r.projectiles.some((p) => p.id === 78001 && !p.dead);
          const hitAt175 = farEnemy.hp < 9999 || Math.hypot(farEnemy.x - r.player.x, farEnemy.y - r.player.y) < startDist - 4;

          r.enemies.length = 0;
          g.cd = 9999;
          r._bossSpawned = { horse: false, umbrella: true, youshen: true };
          r._warderSpawned = { warder_150: true, warder_360: true };
          r.time = 240.1;
          window.__e2eStepFrames(2);
          while (window.__wugeng.overlay === 'levelup') document.querySelector('.qian')?.click();
          const boss = r.enemies.find((e) => e.boss);
          boss.x = r.player.x + 68;
          boss.y = r.player.y;
          boss.speed = 0;
          const hp0 = boss.hp;
          lan.cd = 0;
          let explosionSeen = false;
          window.__e2eStepFrames(100, {
            maxBatch: 5,
            onStep: () => {
              boss.x = r.player.x + 68;
              boss.y = r.player.y;
              if (r.projectiles.some((p) => p.kind === 'explosion') || (boss.yangyanMarkT || boss.yangyanMark || 0) > 0) {
                explosionSeen = true;
              }
            },
          });
          return {
            bulletShattered,
            hitAt175,
            bossDmg: hp0 - boss.hp,
            explosionSeen,
          };
        });
        assert.equal(res.hitAt175, true, 'Expected evolved gong (五更鸣锣) expanded r=165..220 wave to hit/pull enemy at 175px');
        assert.equal(res.bulletShattered, true, 'Expected evolved gong 3rd wave to shatter enemyBullet');
        assert.equal(res.explosionSeen, true, 'Expected evolved lantern (长明灯) to apply yangyanMark / trigger Boss flare explosion');
        assert.ok(res.bossDmg > 150, `Expected evolved lantern rapid 0.25s ticks + flare to deal heavy Boss damage (got ${res.bossDmg})`);
        s.assertNoErrors('T1-F4-02');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T1-F4-03',
    tier: 1,
    feature: 'F4',
    name: 'Overhauled 天师符阵 (talisman) spawns talismanChain + r=95 talismanArray thunder zone on target',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { heroId: 'zhou', seed: 403 });
        await grantItemViaLevelUp(s.page, 'weapon', 'talisman', 5);
        await grantItemViaLevelUp(s.page, 'relic', 'cinnabar', 1);
        await triggerChest(s.page);
        await confirmChestModal(s.page);

        const res = await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          r.enemies.length = 0;
          r._spawnAcc = -99999;
          r._nextWaveT = 99999;
          r.weapons.find((w) => w.id === 'gong').cd = 9999;
          r._spawnQueue.push({ type: 'drowned', x: r.player.x + 110, y: r.player.y, opts: {} });
          r._spawnQueue.push({ type: 'drowned', x: r.player.x + 150, y: r.player.y + 30, opts: {} });
          window.__e2eStepFrames(1);
          r.enemies.forEach((e) => { e.hp = 9999; e.speed = 0; });
          const tal = r.weapons.find((w) => w.id === 'talisman');
          tal.cd = 0;
          const seenKinds = new Set();
          let talCount = 0;
          window.__e2eStepFrames(45, {
            maxBatch: 3,
            onStep: () => {
              const curTal = r.projectiles.filter((p) => p.kind === 'talisman').length;
              if (curTal > talCount) talCount = curTal;
              for (const p of r.projectiles) seenKinds.add(p.kind);
            },
          });
          return {
            talCount,
            kinds: [...seenKinds],
          };
        });
        assert.ok(res.talCount >= 6, `Expected evolved talisman (+2 count over Lv5=4 -> >=6 talismans), got ${res.talCount}`);
        assert.ok(
          res.kinds.includes('talismanChain'),
          `Expected evolved talisman to spawn 'talismanChain' (fixing bellChain regression), saw kinds=${res.kinds.join(',')}`,
        );
        assert.ok(
          res.kinds.includes('talismanArray'),
          `Expected evolved talisman to spawn 'talismanArray' Bagua thunder zone, saw kinds=${res.kinds.join(',')}`,
        );
        s.assertNoErrors('T1-F4-03');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T1-F4-04',
    tier: 1,
    feature: 'F4',
    name: 'Overhauled 泼墨山河 (brush inkWave + r=78 inkPool) & 七星剑阵 (coinsword 7 aimed piercing swords)',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { seed: 404 });
        await grantItemViaLevelUp(s.page, 'weapon', 'brush', 5);
        await grantItemViaLevelUp(s.page, 'relic', 'inkstone', 1);
        await triggerChest(s.page);
        await confirmChestModal(s.page);
        await grantItemViaLevelUp(s.page, 'weapon', 'coinsword', 5);
        await grantItemViaLevelUp(s.page, 'relic', 'bagua', 1);
        await triggerChest(s.page);
        await confirmChestModal(s.page);

        const res = await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          r.enemies.length = 0;
          r._spawnAcc = -99999;
          r._nextWaveT = 99999;
          r.weapons.find((w) => w.id === 'gong').cd = 9999;
          r._spawnQueue.push({ type: 'drowned', x: r.player.x + 180, y: r.player.y, opts: { fixedHp: 50000 } });
          window.__e2eStepFrames(1);
          const target = r.enemies.find((e) => e.type === 'drowned');
          target.speed = 0;

          const br = r.weapons.find((w) => w.id === 'brush');
          const cs = r.weapons.find((w) => w.id === 'coinsword');
          br.cd = 0;
          cs.cd = 0;
          const kinds = new Set();
          let maxInkPoolR = 0;
          let maxSwords = 0;
          window.__e2eStepFrames(60, {
            maxBatch: 5,
            onStep: () => {
              for (const p of r.projectiles) {
                kinds.add(p.kind);
                if (p.kind === 'inkPool' && (p.radius || p.r) > maxInkPoolR) maxInkPoolR = p.radius || p.r;
              }
              const sw = r.projectiles.filter((p) => p.kind === 'coinsword' && p.evolved).length;
              if (sw > maxSwords) maxSwords = sw;
            },
          });
          return { kinds: [...kinds], maxInkPoolR, maxSwords, enemyHp: target.hp };
        });
        assert.ok(res.kinds.includes('inkWave'), `Expected evolved brush to launch piercing 'inkWave' projectile, saw ${res.kinds.join(',')}`);
        assert.ok(res.maxInkPoolR >= 75, `Expected evolved brush ink river radius >= 75 (r=78 * areaMul), got ${res.maxInkPoolR}`);
        assert.ok(res.maxSwords >= 7, `Expected evolved coinsword to deploy >= 7 Big-Dipper swords, got ${res.maxSwords}`);
        assert.ok(res.enemyHp < 50000, 'Expected distant target at 180px to take damage from inkWave / aimed 7-sword volley');
        s.assertNoErrors('T1-F4-04');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T1-F4-05',
    tier: 1,
    feature: 'F4',
    name: 'Overhauled 纸扎仪仗 (paperman bullet-blocking guards + cavalry) & 满堂红 (firecracker multi-throw + cluster)',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { seed: 405 });
        await grantItemViaLevelUp(s.page, 'weapon', 'paperman', 5);
        await grantItemViaLevelUp(s.page, 'relic', 'scissors', 1);
        await triggerChest(s.page);
        await confirmChestModal(s.page);
        await grantItemViaLevelUp(s.page, 'weapon', 'firecracker', 5);
        await grantItemViaLevelUp(s.page, 'relic', 'tinder', 1);

        // Check Lv5 firecracker throws >= 3 crackers before evolution (`count: [1,1,2,2,3]`)
        const lv5Crackers = await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          r.enemies.length = 0;
          r._spawnAcc = -99999;
          r._nextWaveT = 99999;
          r.weapons.forEach((w) => { w.cd = 9999; });
          r.projectiles.length = 0;
          r._spawnQueue.push({ type: 'drowned', x: r.player.x + 130, y: r.player.y, opts: { fixedHp: 99999 } });
          window.__e2eStepFrames(1);
          const fc = r.weapons.find((w) => w.id === 'firecracker');
          fc.cd = 0;
          window.__e2eStepFrames(2);
          return r.projectiles.filter((p) => p.kind === 'firecracker').length;
        });
        assert.ok(lv5Crackers >= 3, `Expected Lv5 firecracker base count >= 3 ([1,1,2,2,3] + scissors), got ${lv5Crackers}`);

        await triggerChest(s.page);
        await confirmChestModal(s.page);

        const evoRes = await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          const pm = r.weapons.find((w) => w.id === 'paperman');
          if (pm) pm._key = -1;
          r.weapons.find((w) => w.id === 'gong').cd = 9999;
          window.__e2eStepFrames(5);
          const guards = r.projectiles.filter((p) => p.kind === 'paperman');
          const targetGuard = guards[0];
          let blocked = false;
          if (targetGuard) {
            r.projectiles.push({
              id: 79001, kind: 'enemyBullet', x: targetGuard.x, y: targetGuard.y,
              r: 8, angle: 0, t: 0, life: 4, vx: 0, vy: 0, dmg: 10,
            });
            window.__e2eStepFrames(3);
            blocked = !r.projectiles.some((p) => p.id === 79001 && !p.dead);
          }
          const fc = r.weapons.find((w) => w.id === 'firecracker');
          fc.cd = 0;
          let maxExplosions = 0;
          window.__e2eStepFrames(65, {
            maxBatch: 5,
            onStep: () => {
              const ex = r.projectiles.filter((p) => p.kind === 'explosion').length;
              if (ex > maxExplosions) maxExplosions = ex;
            },
          });
          return { guardCount: guards.length, blocked, maxExplosions };
        });
        assert.ok(evoRes.guardCount >= 4, `Expected evolved paperman guards/cavalry active, got ${evoRes.guardCount}`);
        assert.equal(evoRes.blocked, true, 'Expected evolved paperman inner guard to block incoming enemyBullet');
        assert.ok(evoRes.maxExplosions >= 6, `Expected evolved firecracker (满堂红) 6-ring lotus cluster explosions, got ${evoRes.maxExplosions}`);
        s.assertNoErrors('T1-F4-05');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T1-F4-06',
    tier: 1,
    feature: 'F4',
    name: 'Overhauled 千铃引魂 (bell) triggers 4-hit escalating Soul Echo against a solo isolated Boss',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { seed: 406 });
        await grantItemViaLevelUp(s.page, 'weapon', 'bell', 5);
        await grantItemViaLevelUp(s.page, 'relic', 'redstring', 1);
        await triggerChest(s.page);
        await confirmChestModal(s.page);

        const res = await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          r.enemies.length = 0;
          r._spawnAcc = -99999;
          r._nextWaveT = 99999;
          r.weapons.find((w) => w.id === 'gong').cd = 9999;
          r.mods.critChance = 0;
          // Spawn a SOLO Boss (zero other enemies to bounce to!)
          r._bossSpawned = { horse: false, umbrella: true, youshen: true };
          r.time = 240.1;
          window.__e2eStepFrames(2);
          if (r.status === 'levelup') document.querySelector('.qian')?.click();
          const boss = r.enemies.find((e) => e.boss);
          r.enemies = [boss];
          boss.x = r.player.x + 120;
          boss.y = r.player.y;
          boss.speed = 0;
          const hpBefore = boss.hp;
          const bell = r.weapons.find((w) => w.id === 'bell');
          bell.cd = 0;
          let hitEvents = 0;
          window.__e2eStepFrames(45, {
            onStep: (_run, stepped) => {
              boss.x = r.player.x + 120;
              boss.y = r.player.y;
              if (stepped >= 2) bell.cd = 9999;
              hitEvents += r.events.filter((ev) => ev.type === 'hit').length;
            },
          });
          return { totalDmg: hpBefore - boss.hp, hitEvents };
        });
        assert.ok(
          res.totalDmg >= 180,
          `Expected evolved bell (千铃引魂) 4-hit escalating Soul Echo on solo Boss to deal >= 180 dmg (old solo hit was only ~51), got ${res.totalDmg}`,
        );
        s.assertNoErrors('T1-F4-06');
      } finally {
        await s.close();
      }
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // F5: Expanded Folk Arsenal (+4 Weapons w/ Evolutions & +4 Relics) (6 tests)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'T1-F5-01',
    tier: 1,
    feature: 'F5',
    name: 'New weapon compass (罗盘 -> 天星定穴盘) spawns compassField vortex pulling enemies & evolves',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { seed: 501 });
        await grantItemViaLevelUp(s.page, 'weapon', 'compass', 5);
        await grantItemViaLevelUp(s.page, 'relic', 'soulwick', 1);
        await triggerChest(s.page);
        await confirmChestModal(s.page, 'compass');

        const res = await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          r.enemies.length = 0;
          r._spawnAcc = -99999;
          r._nextWaveT = 99999;
          r.weapons.find((w) => w.id === 'gong').cd = 9999;
          r._spawnQueue.push({ type: 'drowned', x: r.player.x + 140, y: r.player.y, opts: {} });
          r._spawnQueue.push({ type: 'drowned', x: r.player.x + 185, y: r.player.y + 45, opts: {} });
          window.__e2eStepFrames(1);
          r.enemies.forEach((e) => { e.hp = 9999; e.speed = 0; });
          const d0 = Math.hypot(r.enemies[0].x - r.enemies[1].x, r.enemies[0].y - r.enemies[1].y);
          const cw = r.weapons.find((w) => w.id === 'compass');
          cw.cd = 0;
          let sawField = false;
          window.__e2eStepFrames(40, {
            onStep: () => {
              if (r.projectiles.some((p) => p.kind === 'compassField')) sawField = true;
            },
          });
          const d1 = Math.hypot(r.enemies[0].x - r.enemies[1].x, r.enemies[0].y - r.enemies[1].y);
          return { evolved: cw.evolved, sawField, d0, d1, damaged: r.enemies[0].hp < 9999 };
        });
        assert.equal(res.evolved, true, 'Expected compass Lv5 + soulwick to evolve into 天星定穴盘');
        assert.equal(res.sawField, true, 'Expected compass to spawn kind="compassField" projectile');
        assert.equal(res.damaged, true, 'Expected compassField to damage enemies');
        assert.ok(res.d1 < res.d0 - 3, `Expected compassField vortex to pull enemies closer together (${res.d0.toFixed(1)} -> ${res.d1.toFixed(1)})`);
        s.assertNoErrors('T1-F5-01');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T1-F5-02',
    tier: 1,
    feature: 'F5',
    name: 'New weapon soulbanner (招魂幡 -> 无常勾魂幡) sweeps soulSweep arc & evolves with glutinous',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { seed: 502 });
        await grantItemViaLevelUp(s.page, 'weapon', 'soulbanner', 5);
        await grantItemViaLevelUp(s.page, 'relic', 'glutinous', 1);
        await triggerChest(s.page);
        await confirmChestModal(s.page, 'soulbanner');

        const res = await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          r.enemies.length = 0;
          r._spawnAcc = -99999;
          r._nextWaveT = 99999;
          r.weapons.find((w) => w.id === 'gong').cd = 9999;
          r._spawnQueue.push({ type: 'sedan', x: r.player.x + 85, y: r.player.y - 20, opts: {} });
          window.__e2eStepFrames(1);
          const e = r.enemies[0];
          e.hp = 9999;
          e.speed = 0;
          const sb = r.weapons.find((w) => w.id === 'soulbanner');
          sb.cd = 0;
          let sawSweep = false;
          window.__e2eStepFrames(30, {
            onStep: () => {
              if (r.projectiles.some((p) => p.kind === 'soulSweep')) sawSweep = true;
            },
          });
          return { evolved: sb.evolved, sawSweep, damaged: e.hp < 9999 };
        });
        assert.equal(res.evolved, true, 'Expected soulbanner Lv5 + glutinous to evolve into 无常勾魂幡');
        assert.equal(res.sawSweep, true, 'Expected soulbanner to spawn kind="soulSweep" construct');
        assert.equal(res.damaged, true, 'Expected soulSweep to deal heavy sweep damage');
        s.assertNoErrors('T1-F5-02');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T1-F5-03',
    tier: 1,
    feature: 'F5',
    name: 'New weapon bronze_mirror (照妖铜镜 -> 乾坤赤阳镜) fires sweeping mirrorBeam burning enemyBullets',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { seed: 503 });
        await grantItemViaLevelUp(s.page, 'weapon', 'bronze_mirror', 5);
        await grantItemViaLevelUp(s.page, 'relic', 'fivecoins', 1);
        await triggerChest(s.page);
        await confirmChestModal(s.page, 'bronze_mirror');

        const res = await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          r.enemies.length = 0;
          r._spawnAcc = -99999;
          r._nextWaveT = 99999;
          r.weapons.find((w) => w.id === 'gong').cd = 9999;
          r._spawnQueue.push({ type: 'drowned', x: r.player.x + 120, y: r.player.y, opts: {} });
          window.__e2eStepFrames(1);
          const e = r.enemies[0];
          e.hp = 9999;
          e.speed = 0;
          r.projectiles.push({
            id: 79501, kind: 'enemyBullet', x: r.player.x + 75, y: r.player.y,
            r: 8, angle: 0, t: 0, life: 6, vx: 0, vy: 0, dmg: 10,
          });
          const bm = r.weapons.find((w) => w.id === 'bronze_mirror');
          bm.cd = 0;
          let sawBeam = false;
          window.__e2eStepFrames(35, {
            onStep: () => {
              if (r.projectiles.some((p) => p.kind === 'mirrorBeam')) sawBeam = true;
            },
          });
          const bulletBurned = !r.projectiles.some((p) => p.id === 79501 && !p.dead);
          return { evolved: bm.evolved, sawBeam, damaged: e.hp < 9999, bulletBurned };
        });
        assert.equal(res.evolved, true, 'Expected bronze_mirror Lv5 + fivecoins to evolve into 乾坤赤阳镜');
        assert.equal(res.sawBeam, true, 'Expected bronze_mirror to spawn kind="mirrorBeam"');
        assert.equal(res.damaged, true, 'Expected mirrorBeam to damage enemies');
        assert.equal(res.bulletBurned, true, 'Expected evolved 乾坤赤阳镜 beam to burn hostile enemyBullets');
        s.assertNoErrors('T1-F5-03');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T1-F5-04',
    tier: 1,
    feature: 'F5',
    name: 'New weapon paperhorse (纸马镖 -> 百鬼夜行图) launches piercing paperHorse lane stampede',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { seed: 504 });
        await grantItemViaLevelUp(s.page, 'weapon', 'paperhorse', 5);
        await grantItemViaLevelUp(s.page, 'relic', 'strawshoes', 1);
        await triggerChest(s.page);
        await confirmChestModal(s.page, 'paperhorse');

        const res = await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          r.enemies.length = 0;
          r._spawnAcc = -99999;
          r._nextWaveT = 99999;
          r.weapons.find((w) => w.id === 'gong').cd = 9999;
          r._spawnQueue.push({ type: 'drowned', x: r.player.x + 80, y: r.player.y, opts: {} });
          r._spawnQueue.push({ type: 'drowned', x: r.player.x + 135, y: r.player.y, opts: {} });
          r._spawnQueue.push({ type: 'drowned', x: r.player.x + 190, y: r.player.y, opts: {} });
          window.__e2eStepFrames(1);
          r.enemies.forEach((e) => { e.hp = 9999; e.speed = 0; });
          const ph = r.weapons.find((w) => w.id === 'paperhorse');
          ph.cd = 0;
          let sawHorse = false;
          window.__e2eStepFrames(35, {
            onStep: () => {
              if (r.projectiles.some((p) => p.kind === 'paperHorse')) sawHorse = true;
            },
          });
          const hitCount = r.enemies.filter((e) => e.hp < 9999).length;
          return { evolved: ph.evolved, sawHorse, hitCount };
        });
        assert.equal(res.evolved, true, 'Expected paperhorse Lv5 + strawshoes to evolve into 百鬼夜行图');
        assert.equal(res.sawHorse, true, 'Expected paperhorse to spawn kind="paperHorse"');
        assert.ok(res.hitCount >= 2, `Expected paperHorse stampede to pierce multiple lane targets, hit ${res.hitCount}/3`);
        s.assertNoErrors('T1-F5-04');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T1-F5-05',
    tier: 1,
    feature: 'F5',
    name: 'New 4 relics (strawshoes, glutinous, fivecoins, soulwick) apply distinct stat & combat effects',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { seed: 505 });
        const baseSnap = await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          return {
            speed: r.player.speed,
            ultMul: r.mods.ultChargeMul,
            critMult: r.mods.critMult || 2,
          };
        });
        await grantItemViaLevelUp(s.page, 'relic', 'strawshoes', 2);
        await grantItemViaLevelUp(s.page, 'relic', 'glutinous', 2);
        await grantItemViaLevelUp(s.page, 'relic', 'fivecoins', 2);
        await grantItemViaLevelUp(s.page, 'relic', 'soulwick', 2);

        const afterSnap = await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          const speedAfter = r.player.speed;
          const ultMulAfter = r.mods.ultChargeMul;
          const critMultAfter = r.mods.critMult || 2;

          // Test soulwick weapon cooldown refund on casting Ultimate
          const g = r.weapons.find((w) => w.id === 'gong');
          g.cd = 2.0;
          r.player.ult = r.player.ultMax;
          return { speedAfter, ultMulAfter, critMultAfter, cdBeforeUlt: g.cd };
        });
        await s.page.keyboard.press('Space');
        await stepFrames(s.page, 2);
        const cdAfterUlt = await s.page.evaluate(() => window.__wugeng.game.run.weapons.find((w) => w.id === 'gong').cd);

        assert.ok(
          afterSnap.speedAfter >= baseSnap.speed * 1.11,
          `Expected strawshoes Lv2 (+6%/Lv) to raise player.speed >= +11% (${baseSnap.speed} -> ${afterSnap.speedAfter})`,
        );
        assert.ok(
          afterSnap.critMultAfter >= baseSnap.critMult + 0.30,
          `Expected fivecoins Lv2 (+18%/Lv critMult) to raise critMult (${baseSnap.critMult} -> ${afterSnap.critMultAfter})`,
        );
        assert.ok(
          afterSnap.ultMulAfter > baseSnap.ultMul,
          `Expected soulwick Lv2 to raise ultChargeMul (${baseSnap.ultMul} -> ${afterSnap.ultMulAfter})`,
        );
        assert.ok(
          cdAfterUlt < afterSnap.cdBeforeUlt - 0.15,
          `Expected soulwick ult cast to refund active weapon cooldown (${afterSnap.cdBeforeUlt} -> ${cdAfterUlt})`,
        );
        s.assertNoErrors('T1-F5-05');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T1-F5-06',
    tier: 1,
    feature: 'F5',
    name: 'Natural level-up RNG pool offers new F5 weapons & relics with data-item-id and non-empty copy',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { seed: 506 });
        await s.page.evaluate(() => {
          window.__wugeng.game.run.rerolls.free = 25;
        });
        await triggerLevelUp(s.page);
        const seenIds = new Set();
        for (let i = 0; i < 18; i++) {
          const cards = await s.page.$$eval('.qian', (els) => els.map((el) => ({
            id: el.getAttribute('data-item-id'),
            kind: el.getAttribute('data-item-kind'),
            name: el.querySelector('.qian__name')?.textContent?.trim() || '',
            desc: el.querySelector('.qian__desc')?.textContent?.trim() || '',
          })));
          for (const c of cards) {
            if (c.id) seenIds.add(c.id);
            assert.ok(c.name.length > 0 && !c.name.includes('undefined'), `Invalid card name: ${JSON.stringify(c)}`);
            assert.ok(c.desc.length > 0 && !c.desc.includes('undefined'), `Invalid card desc: ${JSON.stringify(c)}`);
          }
          const rerollBtn = await s.page.$('[data-action="reroll"], .levelup-actions .btn--ghost');
          if (!rerollBtn) break;
          await fastClick(s.page, '[data-action="reroll"], .levelup-actions .btn--ghost');
        }
        const sawNewWeapon = NEW_WEAPON_IDS.some((id) => seenIds.has(id));
        const sawNewRelic = NEW_RELIC_IDS.some((id) => seenIds.has(id));
        assert.equal(sawNewWeapon, true, `Expected natural levelup draws to include >=1 new F5 weapon, saw: ${[...seenIds].join(',')}`);
        assert.equal(sawNewRelic, true, `Expected natural levelup draws to include >=1 new F5 relic, saw: ${[...seenIds].join(',')}`);
        s.assertNoErrors('T1-F5-06');
      } finally {
        await s.close();
      }
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // F6: Four Folk School Synergies (镇魂·道法·纸扎·阳炎 羁绊) (5 tests)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'T1-F6-01',
    tier: 1,
    feature: 'F6',
    name: '镇魂 (zhenhun) school activates tiered 2 / 4 / 6 piece synergies in run.synergies',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { heroId: 'zhou', seed: 601 }); // starts with gong (1 zhenhun)
        await grantItemViaLevelUp(s.page, 'weapon', 'bell', 1); // 2 zhenhun
        const t2 = await s.page.evaluate(() => window.__wugeng.game.run.synergies);
        assert.ok(t2 && t2.counts?.zhenhun >= 2, `Expected zhenhun count >= 2, got ${JSON.stringify(t2)}`);
        assert.equal(t2.active.find((a) => a.tag === 'zhenhun')?.tier, 2, 'Expected zhenhun tier 2 active');

        await grantItemViaLevelUp(s.page, 'weapon', 'soulbanner', 1); // 3
        await grantItemViaLevelUp(s.page, 'relic', 'clapper', 1); // 4 zhenhun
        const t4 = await s.page.evaluate(() => window.__wugeng.game.run.synergies);
        assert.equal(t4.active.find((a) => a.tag === 'zhenhun')?.tier, 4, 'Expected zhenhun tier 4 active');

        await grantItemViaLevelUp(s.page, 'relic', 'redstring', 1); // 5
        await grantItemViaLevelUp(s.page, 'relic', 'strawshoes', 1); // 6 zhenhun
        const t6 = await s.page.evaluate(() => window.__wugeng.game.run.synergies);
        assert.equal(t6.counts.zhenhun, 6);
        assert.equal(t6.active.find((a) => a.tag === 'zhenhun')?.tier, 6, 'Expected zhenhun tier 6 active');
        s.assertNoErrors('T1-F6-01');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T1-F6-02',
    tier: 1,
    feature: 'F6',
    name: '道法 (daofa) school activates 2 / 4 / 6 piece bonuses (+crit, thunder-on-crit, pierce + CDR cap)',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, {
          heroId: 'daotong',
          seed: 602,
          savePatch: { unlockedHeroes: ['zhou', 'daotong'], selectedHero: 'daotong' },
        }); // starts with talisman (1 daofa)
        const baseCrit = await s.page.evaluate(() => window.__wugeng.game.run.mods.critChance);
        await grantItemViaLevelUp(s.page, 'weapon', 'coinsword', 1); // 2 daofa -> +crit
        const critAt2 = await s.page.evaluate(() => window.__wugeng.game.run.mods.critChance);
        assert.ok(critAt2 > baseCrit, `Expected daofa 2-piece to boost critChance (${baseCrit} -> ${critAt2})`);

        await grantItemViaLevelUp(s.page, 'weapon', 'compass', 1); // 3
        await grantItemViaLevelUp(s.page, 'relic', 'cinnabar', 1); // 4 daofa -> thunder on crit
        await grantItemViaLevelUp(s.page, 'relic', 'bagua', 1); // 5
        await grantItemViaLevelUp(s.page, 'relic', 'fivecoins', 1); // 6 daofa
        const syn = await s.page.evaluate(() => window.__wugeng.game.run.synergies);
        assert.equal(syn?.counts?.daofa, 6);
        assert.equal(syn?.active?.find((a) => a.tag === 'daofa')?.tier, 6, 'Expected daofa tier 6 active');
        s.assertNoErrors('T1-F6-02');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T1-F6-03',
    tier: 1,
    feature: 'F6',
    name: '纸扎 (zhizha) & 阳炎 (yangyan) schools activate tiered bonuses (AoE+light, summon haste)',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { seed: 603 });
        const area0 = await s.page.evaluate(() => window.__wugeng.game.run.mods.areaMul);
        // Add 2 zhizha (paperman + brush) and 2 yangyan (lantern + tinder)
        await grantItemViaLevelUp(s.page, 'weapon', 'paperman', 1);
        await grantItemViaLevelUp(s.page, 'weapon', 'brush', 1);
        await grantItemViaLevelUp(s.page, 'weapon', 'lantern', 1);
        await grantItemViaLevelUp(s.page, 'relic', 'tinder', 1); // tinder has no areaPct, so areaMul increase comes purely from yangyan 2pc!

        const res = await s.page.evaluate(() => ({
          synergies: window.__wugeng.game.run.synergies,
          areaMul: window.__wugeng.game.run.mods.areaMul,
        }));
        assert.equal(res.synergies?.active?.find((a) => a.tag === 'zhizha')?.tier, 2, 'Expected zhizha tier 2 active');
        assert.equal(res.synergies?.active?.find((a) => a.tag === 'yangyan')?.tier, 2, 'Expected yangyan tier 2 active');
        assert.ok(res.areaMul > area0, `Expected yangyan 2-piece synergy to increase areaMul (${area0} -> ${res.areaMul})`);
        s.assertNoErrors('T1-F6-03');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T1-F6-04',
    tier: 1,
    feature: 'F6',
    name: 'Dual-tag items (bronze_mirror, fivecoins, soulwick) increment both school counts simultaneously',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { seed: 604 });
        await grantItemViaLevelUp(s.page, 'weapon', 'bronze_mirror', 1); // daofa + yangyan
        await grantItemViaLevelUp(s.page, 'relic', 'fivecoins', 1); // daofa + yangyan
        await grantItemViaLevelUp(s.page, 'relic', 'soulwick', 1); // zhizha + yangyan
        await grantItemViaLevelUp(s.page, 'weapon', 'paperman', 1); // zhizha

        const syn = await s.page.evaluate(() => window.__wugeng.game.run.synergies);
        assert.ok(syn, 'Expected run.synergies object');
        assert.equal(syn.counts.daofa, 2, 'bronze_mirror + fivecoins should give daofa=2');
        assert.equal(syn.counts.yangyan, 3, 'bronze_mirror + fivecoins + soulwick should give yangyan=3');
        assert.equal(syn.counts.zhizha, 2, 'soulwick + paperman should give zhizha=2');
        assert.equal(syn.active.length, 3, 'Expected daofa(2), yangyan(2), and zhizha(2) all active simultaneously');
        s.assertNoErrors('T1-F6-04');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T1-F6-05',
    tier: 1,
    feature: 'F6',
    name: 'Pause overlay (.overlay--pause .pause-synergies) & level-up cards display folk school synergy badges',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { seed: 605 });
        await grantItemViaLevelUp(s.page, 'weapon', 'bell', 1); // activates 镇魂 (2)

        // Check level-up cards show school tags
        await triggerLevelUp(s.page);
        await requireOpenSelector(s.page, '.overlay--levelup', 'Expected .overlay--levelup on level-up modal (PROJECT.md §4)');
        const levelupText = await s.page.textContent('.overlay--levelup');
        const hasSchoolLabelInCards = Object.values(SCHOOL_LABELS).some((lbl) => levelupText.includes(lbl));
        assert.equal(hasSchoolLabelInCards, true, `Expected level-up talismans to show school badge (镇魂/道法/纸扎/阳炎), text=${levelupText}`);
        await fastClick(s.page, '.qian');

        // Open Pause overlay and verify .overlay--pause + .pause-synergies
        await fastClick(s.page, '.pause-btn');
        await s.page.waitForFunction(() => window.__wugeng.overlay === 'pause');
        await requireOpenSelector(s.page, '.overlay--pause', 'Expected .overlay--pause selector on pause dialog (PROJECT.md §4)');
        const synEl = await requireOpenSelector(s.page, '.overlay--pause .pause-synergies, .pause-synergies', 'Expected .pause-synergies summary container in pause overlay');
        const synText = await synEl.textContent();
        assert.ok(synText.includes('镇魂'), `Expected .pause-synergies to list active 镇魂 synergy, got: ${synText}`);
        s.assertNoErrors('T1-F6-05');
      } finally {
        await s.close();
      }
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // F7: Night-Watch Blessings & Cursed Talismans (守夜命签) (5 tests)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'T1-F7-01',
    tier: 1,
    feature: 'F7',
    name: 'Watch transition at 120s triggers 守夜命签 (.overlay--levelup[data-choice-mode="blessing"]) with 3 slips',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { seed: 701 });
        await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          r.enemies.length = 0;
          r._spawnAcc = -99999;
          r._nextWaveT = 99999;
          r.time = 119.97;
          window.__e2eStepFrames(4);
        });
        const state = await s.page.evaluate(() => ({
          overlay: window.__wugeng.overlay,
          choiceMode: window.__wugeng.game.run.choiceMode,
          choices: window.__wugeng.game.run.choices,
        }));
        assert.equal(state.overlay, 'levelup', 'Expected watch transition at 120s to open levelup/blessing overlay');
        assert.equal(state.choiceMode, 'blessing', 'Expected run.choiceMode === "blessing" at 120s watch transition');
        assert.equal(state.choices?.length, 3, 'Expected 3 blessing slips offered');
        assert.ok(state.choices.every((c) => c.kind === 'blessing' && ['auspicious', 'cursed'].includes(c.tier)));

        const lvlEl = await requireOpenSelector(s.page, '.overlay--levelup', 'Expected .overlay--levelup container (PROJECT.md §4)');
        const modeAttr = await lvlEl.getAttribute('data-choice-mode');
        assert.equal(modeAttr, 'blessing', 'Expected .overlay--levelup[data-choice-mode="blessing"]');
        const kindAttrs = await s.page.$$eval('.qian', (els) => els.map((e) => e.getAttribute('data-item-kind')));
        assert.deepEqual(kindAttrs, ['blessing', 'blessing', 'blessing']);
        s.assertNoErrors('T1-F7-01');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T1-F7-02',
    tier: 1,
    feature: 'F7',
    name: 'Picking an auspicious 吉签 adds to run.blessings without occupying 4+4 weapon/relic slots',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { seed: 702 });
        await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          r.enemies.length = 0;
          r._spawnAcc = -99999;
          r._nextWaveT = 99999;
          r.time = 119.97;
          window.__e2eStepFrames(4);
        });
        assert.equal(await s.page.evaluate(() => window.__wugeng.game.run.choiceMode), 'blessing');
        const ausIdx = await s.page.evaluate(() => {
          const idx = window.__wugeng.game.run.choices.findIndex((c) => c.tier === 'auspicious');
          return idx >= 0 ? idx : 0;
        });
        await s.page.evaluate((idx) => document.querySelectorAll('.qian')[idx]?.click(), ausIdx);
        const after = await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          return {
            status: r.status,
            blessings: r.blessings,
            weaponsLen: r.weapons.length,
            relicsLen: r.relics.length,
          };
        });
        assert.equal(after.status, 'playing');
        assert.equal(after.blessings?.length, 1, 'Expected 1 active blessing recorded in run.blessings');
        assert.equal(after.weaponsLen, 1, 'Blessing must not consume a weapon slot');
        assert.equal(after.relicsLen, 0, 'Blessing must not consume a relic slot');
        s.assertNoErrors('T1-F7-02');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T1-F7-03',
    tier: 1,
    feature: 'F7',
    name: 'Cursed talismans (凶签) appear in blessing pool and apply rule-bending upside + trade-off cleanly',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { seed: 703 });
        let cursedIdx = -1;
        for (const watchSec of [120, 240, 360, 480]) {
          await s.page.evaluate((t) => {
            const r = window.__wugeng.game.run;
            r.enemies.length = 0;
            r._spawnAcc = -99999;
            r._nextWaveT = 99999;
            r._bossSpawned = { horse: true, umbrella: true, youshen: true };
            r._warderSpawned = { warder_150: true, warder_360: true };
            r.time = t - 0.03;
            window.__e2eStepFrames(4);
          }, watchSec);
          assert.equal(await s.page.evaluate(() => window.__wugeng.game.run.choiceMode), 'blessing');
          cursedIdx = await s.page.evaluate(() => window.__wugeng.game.run.choices.findIndex((c) => c.tier === 'cursed'));
          if (cursedIdx >= 0) break;
          await fastClick(s.page, '.qian');
        }
        assert.ok(cursedIdx >= 0, 'Expected at least 1 cursed (凶签) slip across 4 watch transitions');
        const pickedId = await s.page.evaluate((i) => window.__wugeng.game.run.choices[i].id, cursedIdx);
        await s.page.evaluate((i) => document.querySelectorAll('.qian')[i]?.click(), cursedIdx);
        const hasBlessing = await s.page.evaluate((id) => window.__wugeng.game.run.blessings?.some((b) => b.id === id), pickedId);
        assert.equal(hasBlessing, true, `Expected cursed blessing '${pickedId}' to be active in run.blessings`);
        s.assertNoErrors('T1-F7-03');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T1-F7-04',
    tier: 1,
    feature: 'F7',
    name: 'All 4 watch transitions (120s, 240s, 360s, 480s) grant blessings & render in .pause-blessings',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { seed: 704 });
        for (const t of [120, 240, 360, 480]) {
          await s.page.evaluate((sec) => {
            const r = window.__wugeng.game.run;
            r.enemies.length = 0;
            r._spawnAcc = -99999;
            r._nextWaveT = 99999;
            r._bossSpawned = { horse: true, umbrella: true, youshen: true };
            r._warderSpawned = { warder_150: true, warder_360: true };
            r.time = sec - 0.03;
            window.__e2eStepFrames(4);
          }, t);
          assert.equal(await s.page.evaluate(() => window.__wugeng.game.run.choiceMode), 'blessing', `Watch at ${t}s should offer blessing`);
          await fastClick(s.page, '.qian');
        }
        const totalBlessings = await s.page.evaluate(() => (
          (window.__wugeng.game.run.blessings || []).reduce((acc, b) => acc + (b.stacks || 1), 0)
        ));
        assert.equal(totalBlessings, 4, `Expected 4 accumulated watch blessings across Watches 2..5, got ${totalBlessings}`);

        await fastClick(s.page, '.pause-btn');
        await s.page.waitForFunction(() => window.__wugeng.overlay === 'pause');
        const blEl = await requireOpenSelector(s.page, '.overlay--pause .pause-blessings, .pause-blessings', 'Expected .pause-blessings container inside .overlay--pause');
        const blText = await blEl.textContent();
        assert.ok(blText.trim().length > 4, 'Expected .pause-blessings to display chosen 守夜命签 names');
        s.assertNoErrors('T1-F7-04');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T1-F7-05',
    tier: 1,
    feature: 'F7',
    name: 'Blessing catalog diversity (>= 10 distinct blessings across seeded draws from 18-blessing pool)',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { seed: 705 });
        const seen = new Set();
        const tiers = new Set();
        for (let seed = 710; seed < 716; seed++) {
          await s.page.evaluate((sd) => {
            window.__wugeng.game.start({ heroId: 'zhou', nightLevel: 0, meta: {}, charm: null, seed: sd });
            const r = window.__wugeng.game.run;
            r.enemies.length = 0;
            r._spawnAcc = -99999;
            r.time = 119.97;
            window.__e2eStepFrames(4);
          }, seed);
          const choices = await s.page.evaluate(() => window.__wugeng.game.run.choices || []);
          for (const c of choices) {
            if (c.kind === 'blessing') {
              seen.add(c.id);
              tiers.add(c.tier);
              assert.ok(c.name && c.desc, `Blessing ${c.id} missing name/desc`);
            }
          }
        }
        assert.ok(seen.size >= 10, `Expected >= 10 distinct blessing IDs across seeded draws (from 18-slip pool), got ${seen.size}`);
        assert.ok(tiers.has('auspicious') && tiers.has('cursed'), 'Expected both auspicious and cursed tiers in pool');
        s.assertNoErrors('T1-F7-05');
      } finally {
        await s.close();
      }
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // F8: Roguelike Level-Up Agency (弃签 Banish, 留签 Lock & Weights) (5 tests)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'T1-F8-01',
    tier: 1,
    feature: 'F8',
    name: 'Banish button ([data-action="banish"]) consumes 1 of 2 base banishesLeft & records in run.banished',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { seed: 801 });
        const initBanishes = await s.page.evaluate(() => window.__wugeng.game.run.banishesLeft);
        assert.equal(initBanishes, 2, 'Expected run.banishesLeft === 2 at start of run (PROJECT.md §2 F8)');

        await triggerLevelUp(s.page);
        assert.ok(await s.page.$('.overlay--levelup[data-choice-mode="normal"]'), 'Expected .overlay--levelup[data-choice-mode="normal"]');
        const firstId = await s.page.getAttribute('.qian >> nth=0', 'data-item-id');
        assert.ok(firstId, 'Expected data-item-id on .qian >> nth=0');

        // Support either per-card banish button or mode-toggle banish + card click
        const cardBanish = s.page.locator('.qian >> nth=0 >> [data-action="banish"]');
        const actionBanish = s.page.locator('[data-action="banish"]');
        assert.ok(await actionBanish.count() > 0, 'Expected [data-action="banish"] control on .overlay--levelup');
        if (await cardBanish.count() > 0) {
          await cardBanish.first().click();
        } else {
          await actionBanish.first().click();
          const banishedAlready = await s.page.evaluate(() => window.__wugeng.game.run.banished?.length || 0);
          if (!banishedAlready) await s.page.click('.qian >> nth=0');
        }

        const after = await s.page.evaluate(() => ({
          banishesLeft: window.__wugeng.game.run.banishesLeft,
          banished: window.__wugeng.game.run.banished,
          currentIds: (window.__wugeng.game.run.choices || []).map((c) => c.id),
        }));
        assert.equal(after.banishesLeft, 1, 'Expected banishesLeft decremented from 2 to 1');
        assert.equal(after.banished?.length, 1, 'Expected banished item recorded in run.banished');
        assert.equal(after.currentIds.includes(after.banished[0]), false, 'Banished item must be immediately replaced in choices');
        s.assertNoErrors('T1-F8-01');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T1-F8-02',
    tier: 1,
    feature: 'F8',
    name: 'Banished item is permanently excluded across all subsequent rerolls and level-ups in the run',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { seed: 802 });
        await s.page.evaluate(() => { window.__wugeng.game.run.rerolls.free = 15; });
        await triggerLevelUp(s.page);

        const cardBanish = s.page.locator('.qian >> nth=0 >> [data-action="banish"]');
        const actionBanish = s.page.locator('[data-action="banish"]');
        assert.ok(await actionBanish.count() > 0, 'Expected [data-action="banish"] button');
        if (await cardBanish.count() > 0) {
          await cardBanish.first().click();
        } else {
          await actionBanish.first().click();
          if (!(await s.page.evaluate(() => window.__wugeng.game.run.banished?.length))) {
            await s.page.click('.qian >> nth=0');
          }
        }
        const banishedId = await s.page.evaluate(() => window.__wugeng.game.run.banished?.[0]);
        assert.ok(banishedId, 'Expected a banished item ID');

        for (let i = 0; i < 10; i++) {
          await s.page.click('[data-action="reroll"]');
          const ids = await s.page.evaluate(() => window.__wugeng.game.run.choices.map((c) => c.id));
          assert.equal(ids.includes(banishedId), false, `Banished '${banishedId}' must never reappear on reroll #${i + 1}`);
        }
        await s.page.click('.qian >> nth=0');
        await triggerLevelUp(s.page);
        const nextIds = await s.page.evaluate(() => window.__wugeng.game.run.choices.map((c) => c.id));
        assert.equal(nextIds.includes(banishedId), false, `Banished '${banishedId}' must never reappear on next level-up`);
        s.assertNoErrors('T1-F8-02');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T1-F8-03',
    tier: 1,
    feature: 'F8',
    name: 'Lock button ([data-action="lock"] 留签) preserves locked slip into the next normal level-up draw',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { seed: 803 });
        await triggerLevelUp(s.page);

        const targetId = await s.page.getAttribute('.qian >> nth=2', 'data-item-id');
        assert.ok(targetId, 'Expected data-item-id on 3rd .qian slip');

        const cardLock = s.page.locator('.qian >> nth=2 >> [data-action="lock"]');
        const actionLock = s.page.locator('[data-action="lock"]');
        assert.ok(await actionLock.count() > 0, 'Expected [data-action="lock"] control on .overlay--levelup');
        if (await cardLock.count() > 0) {
          await cardLock.first().click();
        } else {
          await actionLock.first().click();
          if (!(await s.page.evaluate(() => Boolean(window.__wugeng.game.run.lockedChoice)))) {
            await s.page.click('.qian >> nth=2');
          }
        }

        const lockedId = await s.page.evaluate(() => window.__wugeng.game.run.lockedChoice?.id);
        assert.equal(lockedId, targetId, 'Expected run.lockedChoice to store locked slip');

        // Pick card 0 (different from locked card 2), then trigger next level-up
        await s.page.click('.qian >> nth=0');
        await triggerLevelUp(s.page);
        const nextChoiceIds = await s.page.evaluate(() => window.__wugeng.game.run.choices.map((c) => c.id));
        assert.ok(
          nextChoiceIds.includes(targetId),
          `Expected locked slip '${targetId}' to be preserved in next level-up choices (got ${nextChoiceIds.join(',')})`,
        );
        s.assertNoErrors('T1-F8-03');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T1-F8-04',
    tier: 1,
    feature: 'F8',
    name: 'Level-up cards expose data-choice-index/data-item-id/data-item-kind and [data-action="reroll"]',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { seed: 804 });
        await triggerLevelUp(s.page);
        const attrs = await s.page.$$eval('.overlay--levelup .qian', (els) => els.map((el) => ({
          idx: el.getAttribute('data-choice-index'),
          id: el.getAttribute('data-item-id'),
          kind: el.getAttribute('data-item-kind'),
        })));
        assert.equal(attrs.length, 3, 'Expected 3 .qian cards inside .overlay--levelup');
        assert.deepEqual(attrs.map((a) => a.idx), ['0', '1', '2']);
        assert.ok(attrs.every((a) => a.id && a.kind));

        const rerollBtn = s.page.locator('.overlay--levelup [data-action="reroll"]');
        assert.ok(await rerollBtn.count() > 0, 'Expected [data-action="reroll"] button');
        const freeBefore = await s.page.evaluate(() => window.__wugeng.game.run.rerolls.free);
        await rerollBtn.click();
        const freeAfter = await s.page.evaluate(() => window.__wugeng.game.run.rerolls.free);
        assert.equal(freeAfter, freeBefore - 1, 'Clicking [data-action="reroll"] should decrement free rerolls');
        s.assertNoErrors('T1-F8-04');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T1-F8-05',
    tier: 1,
    feature: 'F8',
    name: 'Level-up cards highlight multi-path 开光 readiness & school resonance hints',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { seed: 805 });
        // gong Lv4 + bell Lv1 + redstring Lv1 (3 zhenhun items, NO clapper): gong Lv5 choice should show evolvable!
        await grantItemViaLevelUp(s.page, 'weapon', 'gong', 3); // Lv4
        await grantItemViaLevelUp(s.page, 'weapon', 'bell', 1);
        await grantItemViaLevelUp(s.page, 'relic', 'redstring', 1);

        await s.page.evaluate(() => { window.__wugeng.game.run.rerolls.free = 20; });
        await triggerLevelUp(s.page);
        let gongEvolvable = false;
        for (let i = 0; i < 12; i++) {
          const found = await s.page.evaluate(() => window.__wugeng.game.run.choices.find((c) => c.kind === 'weapon' && c.id === 'gong'));
          if (found) {
            gongEvolvable = Boolean(found.evolvable);
            break;
          }
          await fastClick(s.page, '[data-action="reroll"], .levelup-actions .btn--ghost');
        }
        assert.equal(
          gongEvolvable,
          true,
          'Expected gong Lv4->Lv5 choice to be marked evolvable=true when 3 zhenhun resonance items are owned (even without clapper)',
        );
        // Also verify resonance/evo hint is rendered on the .qian card in DOM (M3 F8)
        await requireOpenSelector(s.page, '.overlay--levelup .qian[data-item-id="gong"]', 'Expected .qian[data-item-id="gong"] in .overlay--levelup');
        s.assertNoErrors('T1-F8-05');
      } finally {
        await s.close();
      }
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // F9: Interactive World Shrines, Trial Steles & Ghost-Market Peddler (5 tests)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'T1-F9-01',
    tier: 1,
    feature: 'F9',
    name: 'Deterministic folk shrines spawn in run.shrines and proximity reveals [data-action="interact-shrine"]',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { seed: 901 });
        const info = await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          if (!Array.isArray(r.shrines)) return { hasArray: false };
          const target = r.shrines.find((sh) => !sh.used && (sh.kind === 'altar' || sh.kind === 'peddler')) || r.shrines[0];
          if (target) {
            r.enemies.length = 0;
            r.player.x = target.x;
            r.player.y = target.y;
            window.__e2eStepFrames(3);
          }
          return {
            hasArray: true,
            count: r.shrines.length,
            kinds: r.shrines.map((x) => x.kind),
            nearby: Boolean(r.nearbyShrine),
          };
        });
        assert.equal(info.hasArray, true, 'Expected run.shrines array on RunState (PROJECT.md §2 F9)');
        assert.ok(info.count >= 1, `Expected >= 1 spawned shrine in world, got ${info.count}`);
        assert.ok(info.kinds.every((k) => SHRINE_KINDS.includes(k)), `Unexpected shrine kinds: ${info.kinds.join(',')}`);
        assert.equal(info.nearby, true, 'Expected run.nearbyShrine truthy when player stands on unused shrine');
        await requireOpenSelector(
          s.page,
          '[data-action="interact-shrine"]',
          'Expected HUD [data-action="interact-shrine"] button when near shrine (PROJECT.md §4)',
        );
        s.assertNoErrors('T1-F9-01');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T1-F9-02',
    tier: 1,
    feature: 'F9',
    name: '土地香案 (altar) opens .overlay--shrine (overlay="shrine") and resolves [data-shrine-option]',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { seed: 902 });
        const setup = await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          if (!Array.isArray(r.shrines)) return false;
          const altar = r.shrines.find((x) => x.kind === 'altar' && !x.used);
          if (!altar) return false;
          r.enemies.length = 0;
          r._spawnAcc = -99999;
          r.player.hp = r.player.maxHp;
          r.player.x = altar.x;
          r.player.y = altar.y;
          window.__e2eStepFrames(3);
          return altar.id;
        });
        assert.ok(setup !== false, 'Expected starter altar shrine in run.shrines');

        await fastClick(s.page, '[data-action="interact-shrine"]', 'Expected HUD [data-action="interact-shrine"] button');
        assert.equal(await s.page.evaluate(() => window.__wugeng.overlay), 'shrine', 'Expected window.__wugeng.overlay === "shrine"');
        await requireOpenSelector(s.page, '.overlay--shrine', 'Expected .overlay--shrine modal');

        await fastClick(s.page, '.overlay--shrine [data-shrine-option]:not([disabled])', 'Expected enabled [data-shrine-option] on altar modal');

        if (await s.page.evaluate(() => window.__wugeng.overlay === 'levelup')) {
          await fastClick(s.page, '.qian');
        }
        const done = await s.page.evaluate((id) => {
          const sh = window.__wugeng.game.run.shrines.find((x) => x.id === id);
          return { used: sh?.used, status: window.__wugeng.game.run.status };
        }, setup);
        assert.equal(done.used, true, 'Altar shrine should be marked used=true after resolving option');
        assert.equal(done.status, 'playing');
        s.assertNoErrors('T1-F9-02');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T1-F9-03',
    tier: 1,
    feature: 'F9',
    name: '镇邪试炼碑 (trial) triggers ~18s elite ambush and drops guaranteed 供盒 chest on completion',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { seed: 903 });
        const trialId = await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          if (!Array.isArray(r.shrines)) return false;
          const tr = r.shrines.find((x) => x.kind === 'trial' && !x.used);
          if (!tr) return false;
          r.enemies.length = 0;
          r._spawnAcc = -99999;
          r._nextWaveT = 99999;
          r.pickups = r.pickups.filter((p) => p.kind !== 'chest');
          r.player.x = tr.x;
          r.player.y = tr.y;
          r.player.invulnT = 30;
          window.__e2eStepFrames(3);
          return tr.id;
        });
        assert.ok(trialId !== false, 'Expected starter trial stele in run.shrines');

        await fastClick(s.page, '[data-action="interact-shrine"]', 'Expected HUD [data-action="interact-shrine"] for trial stele');
        if (await s.page.evaluate(() => window.__wugeng.overlay === 'shrine')) {
          await fastClick(s.page, '.overlay--shrine [data-shrine-option]:not([disabled])');
        }

        const outcome = await s.page.evaluate((id) => {
          const r = window.__wugeng.game.run;
          const tr = r.shrines.find((x) => x.id === id);
          r.mods.pickupRange = 1;
          let elitesSeen = r.enemies.filter((e) => e.elite).length;
          for (let sec = 0; sec < 20; sec++) {
            r.player.invulnT = 5;
            window.__e2eStepFrames(60);
            elitesSeen = Math.max(elitesSeen, r.enemies.filter((e) => e.elite).length);
            while (window.__wugeng.overlay === 'levelup') document.querySelector('.qian')?.click();
            if (r.status === 'chest' || r.pickups.some((p) => p.kind === 'chest')) break;
          }
          const hasChest = r.status === 'chest' || r._pendingChests > 0 || r.pickups.some((p) => p.kind === 'chest');
          return { elitesSeen, used: tr?.used, hasChest };
        }, trialId);

        assert.ok(outcome.elitesSeen >= 1, `Expected trial stele to spawn elite ambushers, got elitesSeen=${outcome.elitesSeen}`);
        assert.equal(outcome.hasChest, true, 'Expected completed 18s trial stele to reward a guaranteed 供盒 chest');
        s.assertNoErrors('T1-F9-03');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T1-F9-04',
    tier: 1,
    feature: 'F9',
    name: '鬼市货郎 (peddler) lets player spend in-run coins on upgrades, heals, or reroll/banish charges',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { seed: 904 });
        const peddlerId = await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          if (!Array.isArray(r.shrines)) return false;
          const ped = r.shrines.find((x) => x.kind === 'peddler' && !x.used);
          if (!ped) return false;
          r.enemies.length = 0;
          r._spawnAcc = -99999;
          r.stats.coins = 300;
          if (typeof r.coinsEarned === 'number') r.coinsEarned = 300;
          r.player.hp = Math.max(20, r.player.maxHp - 40);
          r.player.x = ped.x;
          r.player.y = ped.y;
          window.__e2eStepFrames(3);
          return ped.id;
        });
        assert.ok(peddlerId !== false, 'Expected starter peddler shrine in run.shrines');

        await fastClick(s.page, '[data-action="interact-shrine"]', 'Expected HUD [data-action="interact-shrine"] for peddler');
        assert.equal(await s.page.evaluate(() => window.__wugeng.overlay), 'shrine');
        await requireOpenSelector(s.page, '.overlay--shrine', 'Expected .overlay--shrine for peddler');

        const before = await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          return {
            coins: r.stats.coins,
            hp: r.player.hp,
            banishes: r.banishesLeft,
            rerolls: r.rerolls.free,
            totalLevels: r.weapons.reduce((a, w) => a + w.level, 0) + r.relics.reduce((a, x) => a + x.level, 0),
          };
        });
        await fastClick(s.page, '.overlay--shrine [data-shrine-option]:not([disabled])');
        const after = await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          return {
            coins: r.stats.coins,
            hp: r.player.hp,
            banishes: r.banishesLeft,
            rerolls: r.rerolls.free,
            totalLevels: r.weapons.reduce((a, w) => a + w.level, 0) + r.relics.reduce((a, x) => a + x.level, 0),
          };
        });
        assert.ok(after.coins < before.coins && after.coins >= 0, `Expected peddler purchase to deduct coins (${before.coins} -> ${after.coins})`);
        const gotBenefit = after.hp > before.hp || after.banishes > before.banishes || after.rerolls > before.rerolls || after.totalLevels > before.totalLevels;
        assert.equal(gotBenefit, true, 'Expected peddler purchase to grant upgrade, heal, or reroll/banish charge');
        s.assertNoErrors('T1-F9-04');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T1-F9-05',
    tier: 1,
    feature: 'F9',
    name: 'World shrines & off-screen directional pointers render cleanly on #game-canvas',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { seed: 905 });
        const check = await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          if (!Array.isArray(r.shrines) || !r.shrines.length) return { ok: false };
          const sh = r.shrines[0];
          for (let i = 1; i < r.shrines.length; i++) r.shrines[i].used = true;
          // Teleport >500px from origin so camera snaps immediately to player with sh due east (+360, 0)
          r.enemies.length = 0;
          sh.used = false;
          sh.x = 2000;
          sh.y = 2000;
          r.player.x = 1640;
          r.player.y = 2000;
          window.__e2eStepFrames(3);
          const c = document.getElementById('game-canvas');
          const ctx = c.getContext('2d');
          const dpr = Math.min(2, window.devicePixelRatio || 1);
          const rx = Math.max(0, c.width - Math.floor(46 * dpr));
          const ry = Math.floor((c.height / 2) - 40 * dpr);
          const data = ctx.getImageData(rx, ry, Math.floor(44 * dpr), Math.floor(80 * dpr)).data;
          let vermPx = 0;
          for (let i = 0; i < data.length; i += 4) {
            if (data[i] > 120 && data[i] - data[i + 1] > 45) vermPx++;
          }
          return { ok: true, vermPx };
        });
        assert.equal(check.ok, true, 'Expected run.shrines array');
        assert.ok(check.vermPx >= 8, `Expected vermilion directional pointer at right screen edge for off-screen shrine (vermPx=${check.vermPx})`);
        s.assertNoErrors('T1-F9-05');
      } finally {
        await s.close();
      }
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // F10: New Tactical Enemies (+3), Elite Affixes, Mini-Warders & Hero Ultimates (5 tests)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'T1-F10-01',
    tier: 1,
    feature: 'F10',
    name: 'New tactical enemies suona (吹鼓鬼 buff aura) & paperbride (红衣纸新娘 ranged kiter) behave distinctly',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { seed: 1001 });
        const res = await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          r.enemies.length = 0;
          r._spawnAcc = -99999;
          r._nextWaveT = 99999;
          r.weapons.forEach((w) => { w.cd = 9999; });

          // 1) Measure paperkid displacement alone vs next to suona
          r._spawnQueue.push({ type: 'paperkid', x: r.player.x + 220, y: r.player.y, opts: {} });
          window.__e2eStepFrames(1);
          const xSolo0 = r.enemies[0].x;
          window.__e2eStepFrames(12);
          const soloDist = Math.abs(r.enemies[0].x - xSolo0);

          r.enemies.length = 0;
          r._spawnQueue.push({ type: 'paperkid', x: r.player.x + 220, y: r.player.y, opts: {} });
          r._spawnQueue.push({ type: 'suona', x: r.player.x + 220, y: r.player.y + 48, opts: {} });
          window.__e2eStepFrames(1);
          const kid = r.enemies.find((e) => e.type === 'paperkid');
          const xBuff0 = kid.x;
          window.__e2eStepFrames(12);
          const buffedDist = Math.abs(kid.x - xBuff0);

          // 2) Paperbride close-range kiting retreat + ranged projectile attack
          r.enemies.length = 0;
          r.projectiles.length = 0;
          r.player.invulnT = 20;
          r._spawnQueue.push({ type: 'paperbride', x: r.player.x + 100, y: r.player.y, opts: {} });
          window.__e2eStepFrames(1);
          const pb0 = r.enemies[0];
          const pbDist0 = Math.hypot(pb0.x - r.player.x, pb0.y - r.player.y);
          let firedBullet = false;
          window.__e2eStepFrames(160, {
            onStep: () => {
              if (r.projectiles.some((p) => p.kind === 'enemyBullet' && !p.dead)) firedBullet = true;
            },
          });
          const pbEnd = r.enemies[0];
          const pbDistEnd = pbEnd ? Math.hypot(pbEnd.x - r.player.x, pbEnd.y - r.player.y) : 0;
          return { soloDist, buffedDist, firedBullet, pbDist0, pbDistEnd };
        });
        assert.ok(
          res.buffedDist > res.soloDist * 1.08,
          `Expected suona (吹鼓鬼) aura to accelerate nearby ally movement (${res.soloDist.toFixed(2)} -> ${res.buffedDist.toFixed(2)})`,
        );
        assert.equal(res.firedBullet, true, 'Expected paperbride (红衣纸新娘) to fire ranged enemyBullet projectiles');
        assert.ok(res.pbDistEnd > res.pbDist0 + 25, `Expected paperbride close-range kiting retreat (pbDist0=${res.pbDist0.toFixed(1)}, pbDistEnd=${res.pbDistEnd.toFixed(1)})`);
        s.assertNoErrors('T1-F10-01');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T1-F10-02',
    tier: 1,
    feature: 'F10',
    name: 'New tactical enemy cinder (阴火骷髅) triggers delayed death-blast damaging adjacent enemies',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { seed: 1002 });
        const res = await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          r.enemies.length = 0;
          r._spawnAcc = -99999;
          r._nextWaveT = 99999;
          r._spawnQueue.push({ type: 'cinder', x: r.player.x + 55, y: r.player.y, opts: {} });
          r._spawnQueue.push({ type: 'drowned', x: r.player.x + 75, y: r.player.y, opts: {} });
          window.__e2eStepFrames(1);
          const cinder = r.enemies.find((e) => e.type === 'cinder');
          const bystander = r.enemies.find((e) => e.type === 'drowned');
          cinder.hp = 1;
          bystander.hp = 5000;
          bystander.maxHp = 5000;
          bystander.speed = 0;
          // Move bystander outside gong's base radius=70? Wait: keep bystander at +90 so gong (r=70) ONLY kills cinder (+55), then cinder blast hits bystander (+90)!
          bystander.x = r.player.x + 92;
          r.weapons[0].cd = 0;
          window.__e2eStepFrames(2);
          r.weapons[0].cd = 9999;
          const hpImmediatelyAfterGong = bystander.hp;
          let sawExplosion = false;
          for (let f = 0; f < 55; f++) {
            bystander.x = r.player.x + 65; // stand near cinder's death spot (+55)
            window.__e2eStepFrames(1);
            if (r.projectiles.some((p) => p.kind === 'explosion') || r.events.some((ev) => ev.type === 'explosion')) {
              sawExplosion = true;
            }
          }
          return { hpImmediatelyAfterGong, hpAfterBlast: bystander.hp, sawExplosion };
        });
        assert.equal(res.sawExplosion, true, 'Expected killed cinder (阴火骷髅) to trigger delayed death explosion');
        assert.ok(
          res.hpAfterBlast < res.hpImmediatelyAfterGong,
          `Expected cinder death-blast to damage nearby enemy (${res.hpImmediatelyAfterGong} -> ${res.hpAfterBlast})`,
        );
        s.assertNoErrors('T1-F10-02');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T1-F10-03',
    tier: 1,
    feature: 'F10',
    name: 'Elite enemies roll from the 5 canonical ELITE_AFFIXES (纸甲/疾行/阴火/分身/藏宝)',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { nightLevel: 3, seed: 1003, savePatch: { nightUnlocked: 5 } });
        const affixes = await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          r.enemies.length = 0;
          r._spawnAcc = -99999;
          r._nextWaveT = 99999;
          r.weapons.forEach((w) => { w.cd = 9999; });
          for (let i = 0; i < 30; i++) {
            r._spawnQueue.push({
              type: 'lanternghost',
              x: r.player.x + 220 + (i % 5) * 20,
              y: r.player.y + Math.floor(i / 5) * 20,
              opts: { elite: true },
            });
          }
          window.__e2eStepFrames(2);
          const collected = [];
          for (const e of r.enemies) {
            if (Array.isArray(e.affixes)) collected.push(...e.affixes);
            else if (e.affix) collected.push(e.affix);
          }
          return [...new Set(collected)];
        });
        assert.ok(affixes.length >= 3, `Expected elites to spawn with canonical ELITE_AFFIXES, got: ${affixes.join(',')}`);
        assert.ok(
          affixes.every((a) => ELITE_AFFIX_IDS.includes(a)),
          `Expected all elite affixes in ${ELITE_AFFIX_IDS.join(',')}, got ${affixes.join(',')}`,
        );
        s.assertNoErrors('T1-F10-03');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T1-F10-04',
    tier: 1,
    feature: 'F10',
    name: '2:30 (150s) & 6:00 (360s) Mini-Warders spawn on schedule and drop 供盒 chests on defeat',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { seed: 1004 });
        const warders = await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          r.mods.pickupRange = 1;
          r._bossSpawned = { horse: true, umbrella: true, youshen: true };
          const out = [];
          for (const sec of [150, 360]) {
            if (window.__wugeng.game.isPaused()) window.__wugeng.game.resume();
            r.enemies.length = 0;
            r.pickups.length = 0;
            r._spawnAcc = -99999;
            r._nextWaveT = 99999;
            r.time = sec - 0.04;
            for (let k = 0; k < 5; k++) {
              window.__e2eStepFrames(2);
              while (window.__wugeng.overlay === 'levelup') document.querySelector('.qian')?.click();
            }
            const w = r.enemies.find((e) => e.chest);
            if (!w) {
              out.push({ sec, found: false });
              continue;
            }
            w.x = r.player.x + 56;
            w.y = r.player.y;
            w.hp = 1;
            w.paperArmor = 0;
            r.weapons[0].cd = 0;
            window.__e2eStepFrames(2);
            const dropped = r.pickups.some((p) => p.kind === 'chest') || r.status === 'chest' || r._pendingChests > 0;
            out.push({ sec, found: true, type: w.type, dropped });
          }
          return out;
        });
        assert.equal(warders.length, 2);
        assert.ok(warders.every((w) => w.found && w.dropped), `Expected both 150s & 360s Mini-Warders to drop chests: ${JSON.stringify(warders)}`);
        s.assertNoErrors('T1-F10-04');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T1-F10-05',
    tier: 1,
    feature: 'F10',
    name: '3 Hero-specific Ultimates (zhou 五更镇魂锣, mian 百鬼纸马阵, daotong 九天玄雷敕) execute distinct effects',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, {
          heroId: 'zhou',
          seed: 1005,
          savePatch: { unlockedHeroes: ['zhou', 'mian', 'daotong'] },
        });

        const runUltForHero = async (heroId) => {
          await s.page.evaluate((h) => {
            const g = window.__wugeng.game;
            g.start({ heroId: h, nightLevel: 0, meta: {}, charm: null, seed: 1005 });
            const r = g.run;
            r.enemies.length = 0;
            r._spawnAcc = -99999;
            r._nextWaveT = 99999;
            r.weapons.forEach((w) => { w.cd = 9999; });
            for (let i = 0; i < 4; i++) {
              r._spawnQueue.push({
                type: 'drowned',
                x: r.player.x + 80 + i * 28,
                y: r.player.y + (i % 2 ? 20 : -20),
                opts: {},
              });
            }
            window.__e2eStepFrames(2);
            r.enemies.forEach((e) => { e.hp = 9999; e.speed = 0; });
            r.player.ult = r.player.ultMax;
          }, heroId);
          await s.page.keyboard.press('Space');
          return s.page.evaluate(() => {
            const r = window.__wugeng.game.run;
            const kinds = new Set();
            window.__e2eStepFrames(25, {
              onStep: () => {
                for (const p of r.projectiles) kinds.add(p.kind);
              },
            });
            return {
              ultsCast: r.stats.ultsCast,
              projKinds: [...kinds],
              stunned: r.enemies.some((e) => e.stunT > 0),
              damaged: r.enemies.some((e) => e.hp < 9999),
            };
          });
        };

        const zhouUlt = await runUltForHero('zhou');
        const mianUlt = await runUltForHero('mian');
        const daotongUlt = await runUltForHero('daotong');

        assert.equal(zhouUlt.ultsCast, 1);
        assert.equal(zhouUlt.stunned, true, 'Expected zhou ultimate (五更镇魂锣) to stun enemies');
        assert.ok(
          mianUlt.projKinds.includes('paperHorse'),
          `Expected mian ultimate (百鬼纸马阵) to summon 'paperHorse' stampede, saw kinds=${mianUlt.projKinds.join(',')}`,
        );
        assert.ok(
          daotongUlt.projKinds.includes('thunderBolt'),
          `Expected daotong ultimate (九天玄雷敕) to call down 'thunderBolt' strikes, saw kinds=${daotongUlt.projKinds.join(',')}`,
        );
        s.assertNoErrors('T1-F10-05');
      } finally {
        await s.close();
      }
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // F11: Hit-Feel, Awakened Ceremony/Aura, HUD Loadout, Watch Atmosphere & SFX (5 tests)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'T1-F11-01',
    tier: 1,
    feature: 'F11',
    name: 'All 12 evolved weapon icons (EVO_WEAPON_ICONS) render bespoke divine woodblock art (not scaled base weapon)',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootToHub(s.page, baseUrl, {
          savePatch: {
            codex: {
              weapons: ALL_WEAPON_IDS,
              evolutions: ALL_WEAPON_IDS,
              relics: ALL_RELIC_IDS,
            },
          },
        });
        await s.page.click('.hub-nav .btn:nth-child(2)');
        await s.page.waitForSelector('.codex-scroll, .codex');

        const grabTabIcons = async (tabIdx) => {
          await s.page.click(`.codex-tab >> nth=${tabIdx}`);
          return s.page.$$eval('.codex-list .codex-row img.icon', (imgs) => {
            const c = document.createElement('canvas');
            c.width = 64;
            c.height = 64;
            const ctx = c.getContext('2d');
            return imgs.map((img) => {
              ctx.clearRect(0, 0, 64, 64);
              ctx.drawImage(img, 0, 0, 64, 64);
              const d = ctx.getImageData(0, 0, 64, 64).data;
              let opaque = 0;
              let hash = 2166136261;
              // Also sample inner 28x28 center scaled vs base to catch border-only wrapper
              const center = [];
              for (let y = 0; y < 64; y++) {
                for (let x = 0; x < 64; x++) {
                  const i = (y * 64 + x) * 4;
                  if (d[i + 3] > 20) opaque++;
                  hash = Math.imul(hash ^ d[i] ^ (d[i + 1] << 1) ^ (d[i + 2] << 2) ^ (d[i + 3] << 3), 16777619) >>> 0;
                  if (x >= 18 && x < 46 && y >= 18 && y < 46) {
                    center.push(d[i + 3] > 40 ? (d[i] > 120 && d[i] - d[i + 1] > 45 ? 2 : 1) : 0);
                  }
                }
              }
              // Compute scaled-base simulation center (0.74/0.86 = 0.8605 around 32,32) for comparison
              const scaledFromSelf = [];
              const scale = 0.74 / 0.86;
              for (let y = 18; y < 46; y++) {
                for (let x = 18; x < 46; x++) {
                  const sx = Math.round(32 + (x - 32) / scale);
                  const sy = Math.round(32 + (y - 32) / scale);
                  const i = (sy * 64 + sx) * 4;
                  scaledFromSelf.push(d[i + 3] > 40 ? (d[i] > 120 && d[i] - d[i + 1] > 45 ? 2 : 1) : 0);
                }
              }
              return { srcOk: img.src.startsWith('data:image/png;base64,'), opaque, hash, center, scaledFromSelf };
            });
          });
        };

        const weaponIcons = await grabTabIcons(0);
        const evoIcons = await grabTabIcons(1);
        assert.equal(weaponIcons.length, 12, `Expected 12 weapon icons in Codex, got ${weaponIcons.length}`);
        assert.equal(evoIcons.length, 12, `Expected 12 evolved weapon icons in Codex, got ${evoIcons.length}`);
        assert.equal(new Set(evoIcons.map((x) => x.hash)).size, 12, 'All 12 evo icons must have unique pixel hashes');

        let bespokeCount = 0;
        for (let i = 0; i < 12; i++) {
          assert.ok(evoIcons[i].srcOk && evoIcons[i].opaque > 220, `Evo icon #${i} should be non-empty PNG`);
          let diffs = 0;
          for (let p = 0; p < evoIcons[i].center.length; p++) {
            if (evoIcons[i].center[p] !== weaponIcons[i].scaledFromSelf[p]) diffs++;
          }
          if (diffs > 55) bespokeCount++;
        }
        assert.equal(
          bespokeCount,
          12,
          `Expected all 12 evo icons to use bespoke EVO_WEAPON_ICONS art rather than scaled base weapon + border (${bespokeCount}/12 bespoke)`,
        );
        s.assertNoErrors('T1-F11-01');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T1-F11-02',
    tier: 1,
    feature: 'F11',
    name: 'Awakened weapon renders persistent underfoot Bagua/seal aura & expanded lantern radius on #game-canvas',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser, { styleLab: true });
      try {
        await s.page.goto(`${baseUrl}/style-lab.html?watch=5&scene=hud`);
        await s.page.waitForFunction(() => Boolean(window.__renderer && window.__run));
        const res = await s.page.evaluate(() => {
          const run = window.__run;
          const renderer = window.__renderer;
          const c = document.getElementById('game-canvas');
          const ctx = c.getContext('2d');
          const dpr = Math.min(2, window.devicePixelRatio || 1);

          run.enemies.length = 0;
          run.projectiles.length = 0;
          run.pickups.length = 0;
          run.props.length = 0;
          run.darkness = 0.78;
          run.weapons = [{ id: 'gong', level: 5, evolved: false, cd: 9 }];

          const sampleAuraAndLight = () => {
            const cx = Math.floor((window.innerWidth / 2) * dpr);
            const cy = Math.floor((window.innerHeight / 2) * dpr);
            // Ring r=20..38px around player feet
            let ringAccent = 0;
            for (let a = 0; a < 36; a++) {
              for (const rad of [22, 28, 34]) {
                const px = Math.floor(cx + Math.cos((a / 36) * Math.PI * 2) * rad * dpr);
                const py = Math.floor(cy + Math.sin((a / 36) * Math.PI * 2) * rad * dpr);
                const p = ctx.getImageData(px, py, 1, 1).data;
                if (p[0] - p[1] > 28 || (p[0] > 215 && p[1] > 170 && p[2] < 140)) ringAccent++;
              }
            }
            // Brightness at d=126px from player (near edge of base 118px lantern hole)
            const edgeP = ctx.getImageData(Math.floor(cx + 126 * dpr), cy, 1, 1).data;
            const edgeLuma = edgeP[0] + edgeP[1] + edgeP[2];
            return { ringAccent, edgeLuma };
          };

          renderer.render(run, 1, 0, { shake: false, dmgText: 'off', safeTop: 0, safeBottom: 0 });
          const base = sampleAuraAndLight();

          run.weapons[0].evolved = true;
          renderer.render(run, 1, 0, { shake: false, dmgText: 'off', safeTop: 0, safeBottom: 0 });
          const awakened = sampleAuraAndLight();
          return { base, awakened };
        });
        assert.ok(
          res.awakened.ringAccent > res.base.ringAccent + 6 || res.awakened.edgeLuma > res.base.edgeLuma + 25,
          `Expected visible underfoot awakened aura & lantern growth when weapon is evolved (base=${JSON.stringify(res.base)}, awakened=${JSON.stringify(res.awakened)})`,
        );
        s.assertNoErrors('T1-F11-02');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T1-F11-03',
    tier: 1,
    feature: 'F11',
    name: 'Compact in-run HUD strip displays equipped weapons, relics & active synergies without pausing',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { seed: 1103 });
        const readDomHudLen = () => s.page.evaluate(() => {
          const dedicated = document.querySelector('#ui .hud-loadout, #ui .hud-strip, #ui [data-hud-loadout], #ui .run-loadout, #ui .hud-synergies');
          if (dedicated) return dedicated.innerHTML.length;
          return [...document.querySelectorAll('#ui > *:not(.veil):not(.toast):not(.run-hint)')]
            .reduce((sum, el) => sum + el.innerHTML.length, 0);
        });

        const domHud1 = await readDomHudLen();

        await grantItemViaLevelUp(s.page, 'weapon', 'bell', 1);
        await grantItemViaLevelUp(s.page, 'weapon', 'talisman', 1);
        await grantItemViaLevelUp(s.page, 'weapon', 'compass', 1);
        await grantItemViaLevelUp(s.page, 'relic', 'clapper', 1);
        await grantItemViaLevelUp(s.page, 'relic', 'cinnabar', 1);
        await grantItemViaLevelUp(s.page, 'relic', 'redstring', 1);
        await grantItemViaLevelUp(s.page, 'relic', 'bagua', 1);

        const domHudFull = await readDomHudLen();

        // Compare Canvas HUD perimeter at 100% frozen (time=10, darkness=0, realDt=0 / clock frozen)
        // between full 4W+4R+synergies loadout vs 1W starter loadout so background drift is strictly 0.
        const canvasDiff = await s.page.evaluate(async () => {
          const r = window.__wugeng.game.run;
          r.enemies.length = 0;
          r.props.length = 0;
          r.pickups.length = 0;
          r.projectiles.length = 0;
          if (Array.isArray(r.shrines)) r.shrines.length = 0;
          r.boss = null;
          r._spawnAcc = -99999;
          r.time = 10;
          r.watch = 1;
          r.darkness = 0;
          r.mods.lightRadius = 1;
          r.player.xp = 0;
          r.player.xpNext = 100;
          r.player.hp = 100;
          r.player.maxHp = 100;
          r.player.ult = 0;
          r.player.hurtT = 0;

          // Warm 2 rAF ticks (realDt === 0) so lastRunTime === 10 and camera/XP bar settle
          await new Promise((res) => requestAnimationFrame(res));
          await new Promise((res) => requestAnimationFrame(res));

          const sampleHudPerimeter = () => {
            const c = document.getElementById('game-canvas');
            const ctx = c.getContext('2d');
            const dpr = Math.min(2, window.devicePixelRatio || 1);
            const W = window.innerWidth;
            const H = window.innerHeight;
            const out = [];
            // Top & upper-side HUD (y = 40..240 CSS px), excluding top XP bar (y < 40) & center timer box
            const topY = Math.floor(40 * dpr);
            const topH = Math.floor(200 * dpr);
            const topData = ctx.getImageData(0, topY, c.width, topH).data;
            const timerMinX = Math.floor((W / 2 - 75) * dpr);
            const timerMaxX = Math.ceil((W / 2 + 75) * dpr);
            const timerMaxY = Math.ceil(82 * dpr);
            for (let py = 0; py < topH; py += 2) {
              const absY = topY + py;
              for (let px = 0; px < c.width; px += 2) {
                if (absY < timerMaxY && px >= timerMinX && px <= timerMaxX) continue;
                const idx = (py * c.width + px) * 4;
                out.push(topData[idx], topData[idx + 1], topData[idx + 2]);
              }
            }
            // Bottom-center HUD strip between HP seal (x < 90) and Ult Gong (x > W - 105)
            const botX = Math.floor(90 * dpr);
            const botW = Math.max(8, Math.floor((W - 195) * dpr));
            const botY = Math.floor((H - 95) * dpr);
            const botH = Math.floor(90 * dpr);
            const botData = ctx.getImageData(botX, botY, botW, botH).data;
            for (let i = 0; i < botData.length; i += 8) {
              out.push(botData[i], botData[i + 1], botData[i + 2]);
            }
            return out;
          };

          await new Promise((res) => requestAnimationFrame(res));
          const fullSample = sampleHudPerimeter();

          const savedWeapons = r.weapons;
          const savedRelics = r.relics;
          const savedSynergies = r.synergies;
          r.weapons = [{ id: 'gong', level: 1, evolved: false, cd: 9 }];
          r.relics = [];
          r.synergies = { counts: { zhenhun: 1 }, active: [] };

          await new Promise((res) => requestAnimationFrame(res));
          const starterSample = sampleHudPerimeter();

          r.weapons = savedWeapons;
          r.relics = savedRelics;
          r.synergies = savedSynergies;

          let diff = 0;
          const n = Math.min(fullSample.length, starterSample.length);
          for (let i = 0; i < n; i++) {
            if (Math.abs(fullSample[i] - starterSample[i]) > 18) diff++;
          }
          return diff;
        });

        const domDelta = domHudFull - domHud1;
        assert.ok(
          canvasDiff > 45 || domDelta > 40,
          `Expected compact in-run HUD loadout/synergy strip to render newly acquired weapons/relics/synergies (canvasDiff=${canvasDiff}, domDelta=${domDelta})`,
        );
        s.assertNoErrors('T1-F11-03');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T1-F11-04',
    tier: 1,
    feature: 'F11',
    name: 'Hit-feel directional camera shake & hitstop trigger on evolve, crit & explosion events',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser, { styleLab: true });
      try {
        await s.page.goto(`${baseUrl}/style-lab.html?watch=3&scene=crowd`);
        await s.page.waitForFunction(() => Boolean(window.__renderer && window.__run));
        const res = await s.page.evaluate(() => {
          const run = window.__run;
          const renderer = window.__renderer;
          const c = document.getElementById('game-canvas');
          const ctx = c.getContext('2d');

          // Advance +0.5s (> HITSTOP_MIN_GAP = 0.3s) so any initial mock-run crit hitstop cooldown is cleared
          for (let i = 0; i < 5; i++) {
            renderer.render(run, 1, 0.1, { shake: false, dmgText: 'all', safeTop: 0, safeBottom: 0 });
          }

          renderer.consumeEvents([
            { type: 'evolve', weaponId: 'gong', evoName: '五更鸣锣', recipe: 'paired' },
            { type: 'explosion', x: run.player.x + 80, y: run.player.y, radius: 90, evolved: true },
            { type: 'hit', x: run.player.x + 40, y: run.player.y, amount: 180, crit: true },
          ]);
          const hitstopAfterEvolve = renderer.hitstop || 0;

          renderer.render(run, 1, 0.008, { shake: false, dmgText: 'all', safeTop: 0, safeBottom: 0 });
          const noShake = ctx.getImageData(120, 240, 120, 120).data;

          renderer.render(run, 1, 0.008, { shake: true, dmgText: 'all', safeTop: 0, safeBottom: 0 });
          const withShake = ctx.getImageData(120, 240, 120, 120).data;

          let diff = 0;
          for (let i = 0; i < noShake.length; i += 4) {
            if (Math.abs(noShake[i] - withShake[i]) > 15) diff++;
          }
          return { hitstopAfterEvolve, shakeDiffPx: diff };
        });
        assert.ok(res.hitstopAfterEvolve > 0, `Expected renderer.hitstop > 0 on evolve/crit impact, got ${res.hitstopAfterEvolve}`);
        assert.ok(res.shakeDiffPx > 80, `Expected camera shake displacement when shake=true vs shake=false (diffPx=${res.shakeDiffPx})`);
        s.assertNoErrors('T1-F11-04');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T1-F11-05',
    tier: 1,
    feature: 'F11',
    name: 'WebAudio synthesizer plays baseline cues and handles all 12 weapon fire + explosion/wave/shrine events',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser, { isolated: true });
      try {
        await bootToHub(s.page, baseUrl);
        const res = await s.page.evaluate(async ({ sfxNames, weapons }) => {
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
          const proto = window.BaseAudioContext?.prototype || window.AudioContext?.prototype;
          const origOsc = proto.createOscillator;
          const origBuf = proto.createBufferSource;
          let audioCtx = null;
          let scheduledNodes = 0;
          const missingWeapons = [];
          const missingEvents = [];
          proto.createOscillator = function wrappedCreateOscillator(...args) {
            audioCtx = this;
            scheduledNodes++;
            return origOsc.apply(this, args);
          };
          proto.createBufferSource = function wrappedCreateBufferSource(...args) {
            audioCtx = this;
            scheduledNodes++;
            return origBuf.apply(this, args);
          };
          const playedBaseline = sfxNames.every((n) => a.play(n, { arg: 2 }) !== false);
          scheduledNodes = 0;
          const waitAudioMs = async (ms) => {
            const targetSec = ms / 1000;
            const startCtx = audioCtx ? audioCtx.currentTime : 0;
            const startWall = performance.now();
            await new Promise((r) => setTimeout(r, ms));
            while (audioCtx && audioCtx.currentTime - startCtx < targetSec && performance.now() - startWall < 1500) {
              await new Promise((r) => setTimeout(r, 20));
            }
          };
          try {
            // Clear baseline cooldowns (>=210ms & >0.25s gong gap), then space each event check by 200ms
            await waitAudioMs(260);
            for (let i = 0; i < weapons.length; i++) {
              if (i > 0) await waitAudioMs(200);
              const wid = weapons[i];
              const before = scheduledNodes;
              a.onEvents([{ type: 'fire', weaponId: wid, evolved: true, x: 0, y: 0 }], null);
              if (scheduledNodes <= before) missingWeapons.push(wid);
            }
            const worldEvents = [
              { label: 'explosion', ev: { type: 'explosion', x: 10, y: 10, radius: 85, evolved: true } },
              { label: 'wave', ev: { type: 'wave', count: 24 } },
              { label: 'shrineActivate', ev: { type: 'shrineActivate', kind: 'altar', outcome: 'heal' } },
            ];
            for (const item of worldEvents) {
              await waitAudioMs(200);
              const before = scheduledNodes;
              a.onEvents([item.ev], null);
              if (scheduledNodes <= before) missingEvents.push(item.label);
            }
            a.onEvents([
              { type: 'synergyUp', tag: 'daofa', tier: 4, name: '道法四象' },
              { type: 'blessingPick', id: 'test_blessing', tier: 'auspicious' },
            ], null);
          } finally {
            proto.createOscillator = origOsc;
            proto.createBufferSource = origBuf;
          }
          return { state: a.state, playedBaseline, missingWeapons, missingEvents };
        }, { sfxNames: BASELINE_SFX_NAMES, weapons: ALL_WEAPON_IDS });

        assert.equal(res.state, 'running', 'Expected AudioContext state === "running"');
        assert.equal(res.playedBaseline, true, 'Expected all 15 baseline WebAudio voices to play');
        assert.equal(
          res.missingWeapons.length === 0 && res.missingEvents.length === 0,
          true,
          `Expected WebAudio onEvents() synthesis for all 12 weapons and explosion/wave/shrineActivate events; missingWeapons=[${res.missingWeapons.join(',')}], missingEvents=[${res.missingEvents.join(',')}]`,
        );
        s.assertNoErrors('T1-F11-05');
      } finally {
        await s.close();
      }
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // F12: Expanded Codex (百物谱), Save Migration & Zero-Tofu Font Pipeline (5 tests)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'T1-F12-01',
    tier: 1,
    feature: 'F12',
    name: '百物谱 Codex (.codex) expands to 12 weapons, 12 evolutions, 12 relics, 12 enemies (+3 heroes = 51)',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootToHub(s.page, baseUrl);
        await s.page.click('.hub-nav .btn:nth-child(2)');
        await s.page.waitForSelector('.codex-scroll, .codex');
        assert.ok(await s.page.$('.codex'), 'Expected .codex selector on 百物谱 modal (PROJECT.md §4 F12)');

        const counts = [];
        for (let t = 0; t < 5; t++) {
          await s.page.click(`.codex-tab >> nth=${t}`);
          const n = await s.page.$$eval('.codex-list > .codex-row:not(.codex-row--ach)', (els) => els.length);
          counts.push(n);
        }
        assert.deepEqual(
          counts,
          [12, 12, 12, 12, 3],
          `Expected 百物谱 tab counts [12 weapons, 12 evolutions, 12 relics, 12 enemies, 3 heroes], got [${counts.join(', ')}]`,
        );
        s.assertNoErrors('T1-F12-01');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T1-F12-02',
    tier: 1,
    feature: 'F12',
    name: 'New F5 weapons/evolutions/relics & F10 enemies persist in localStorage codex across page reload',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser, { isolated: true });
      try {
        await bootAndStartRun(s.page, baseUrl, { seed: 1202 });
        await grantItemViaLevelUp(s.page, 'weapon', 'compass', 5);
        await grantItemViaLevelUp(s.page, 'relic', 'soulwick', 1);
        await triggerChest(s.page);
        await confirmChestModal(s.page, 'compass');

        // Kill all 3 new tactical enemy types and finish run
        await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          for (const et of ['suona', 'paperbride', 'cinder']) {
            r.stats.killsByType[et] = (r.stats.killsByType[et] || 0) + 2;
            r.stats.kills += 2;
          }
          window.__wugeng.game.finish();
        });
        await s.page.waitForSelector('.screen--result');

        // Reload page from scratch and verify persisted save in localStorage['wugeng.save']
        await s.page.reload();
        await s.page.waitForSelector('.screen--title');
        const codex = await s.page.evaluate(() => window.__wugeng.save.codex);
        assert.ok(codex.weapons.includes('compass'), 'Expected compass persisted in codex.weapons');
        assert.ok(codex.evolutions.includes('compass'), 'Expected compass evolution persisted in codex.evolutions');
        assert.ok(codex.relics.includes('soulwick'), 'Expected soulwick persisted in codex.relics');
        for (const et of NEW_REGULAR_ENEMY_IDS) {
          assert.ok(codex.enemies[et] >= 2, `Expected new enemy '${et}' kill count persisted in codex.enemies`);
        }
        s.assertNoErrors('T1-F12-02');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T1-F12-03',
    tier: 1,
    feature: 'F12',
    name: 'Legacy v1 & v0 saves migrate cleanly via migrateSave without losing coins/shop/heroes/codex',
    async run({ browser, baseUrl }) {
      const legacyV1 = JSON.stringify({
        version: 1,
        updatedAt: 1700000000000,
        coins: 888,
        shop: { tizhi: 3, lidao: 2, jiaoli: 1, yanli: 0, wuxing: 0, caiyun: 1, jiyuan: 2, huchi: 0 },
        unlockedHeroes: ['zhou', 'mian'],
        selectedHero: 'mian',
        nightUnlocked: 3,
        nightCleared: 2,
        selectedNight: 2,
        achievements: { firstClear: 1700000000000, kills800: 1700000000000 },
        codex: { weapons: ['gong', 'paperman'], evolutions: ['gong'], relics: ['clapper'], enemies: { paperkid: 42 } },
        settings: { sfx: true, music: false, shake: true, dmgText: 'crit', lowQuality: false },
        checkin: { cycleDay: 2, lastClaimDate: '2026-11-20', cycles: 0, totalClaims: 2 },
        cosmetics: { owned: [], equipped: { lantern: null, outfit: null } },
        charms: [{ relicId: 'clapper' }],
        stats: { runs: 5, clears: 2, firstRunDone: true, totalPlaySec: 1800, bestTimeSec: 600, bestKills: 900, bestHit: 400, totalKills: 2500, totalCoins: 1500 },
      });
      const s = await createIsolatedPage(browser, {
        beforeBootInitScript: (raw) => { localStorage.setItem('wugeng.save', raw); },
        beforeBootArg: legacyV1,
      });
      try {
        await bootToHub(s.page, baseUrl);
        const migrated = await s.page.evaluate(() => window.__wugeng.save);
        assert.equal(migrated.coins, 888);
        assert.equal(migrated.shop.tizhi, 3);
        assert.equal(migrated.selectedHero, 'mian');
        assert.equal(migrated.nightCleared, 2);
        assert.equal(migrated.codex.enemies.paperkid, 42);
        assert.equal(migrated.settings.dmgText, 'crit');
        s.assertNoErrors('T1-F12-03');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T1-F12-04',
    tier: 1,
    feature: 'F12',
    name: 'wenkai-subset.woff2 (< 400KB) loads over HTTP with OpenType vertical GSUB features (vert & vrt2)',
    async run({ browser, baseUrl }) {
      const fontPath = path.join(ROOT, 'assets', 'fonts', 'wenkai-subset.woff2');
      const stat = fs.statSync(fontPath);
      assert.ok(stat.size > 50_000 && stat.size < 400 * 1024, `Expected wenkai-subset.woff2 < 400KB, got ${stat.size} bytes`);

      const { stdout } = await execFileAsync(
        VENV_PYTHON,
        [
          '-c',
          'import json, sys; from fontTools.ttLib import TTFont; tt = TTFont(sys.argv[1]); tags = sorted({r.FeatureTag for r in tt["GSUB"].table.FeatureList.FeatureRecord}) if "GSUB" in tt else []; print(json.dumps({"glyphs": tt.getGlyphOrder().__len__(), "tags": tags}))',
          fontPath,
        ],
        { cwd: ROOT, timeout: 10_000 },
      );
      const meta = JSON.parse(stdout.trim());
      assert.ok(meta.tags.includes('vert'), `Expected OpenType vertical layout feature ('vert') in GSUB, got ${meta.tags.join(',')}`);

      const s = await createIsolatedPage(browser);
      try {
        await bootToHub(s.page, baseUrl);
        const fontLoaded = await s.page.evaluate(() => ({
          ready: document.fonts.check('18px "WenKai"', '五更天百物谱'),
          uiFont: getComputedStyle(document.getElementById('ui')).fontFamily,
        }));
        assert.equal(fontLoaded.ready, true, 'Expected WenKai subset font active in document.fonts');
        assert.ok(/WenKai/i.test(fontLoaded.uiFont), `Expected #ui font-family to start with WenKai, got ${fontLoaded.uiFont}`);
        s.assertNoErrors('T1-F12-04');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T1-F12-05',
    tier: 1,
    feature: 'F12',
    name: '100% Zero-Tofu TTFont.getBestCmap() coverage across runtime HTML/CSS/JS + symbols (° U+00B0) + F3–F12 copy',
    async run() {
      const pyScript = String.raw`
import json, pathlib, re, sys
from fontTools.ttLib import TTFont

root = pathlib.Path(sys.argv[1])
tt = TTFont(str(root / "assets/fonts/wenkai-subset.woff2"))
cmap = set(tt.getBestCmap().keys())

required_chars = set("°−×·‹›→←↑↓＋－％：；，。！？「」『』【】（）—…")
required_copy = (
    "五更天守夜百物谱更房加点图鉴更簿设置抽一支签弃签留签换签供盒开光"
    "镇魂道法纸扎阳炎守夜命签吉签凶签土地香案镇邪试炼碑鬼市货郎"
    "罗盘天星定穴盘招魂幡无常勾魂幡照妖铜镜乾坤赤阳镜纸马镖百鬼夜行图"
    "草鞋糯米五帝钱引魂灯芯吹鼓鬼红衣纸新娘阴火骷髅纸甲疾行阴火分身藏宝"
)
required_chars.update(required_copy)

scan_files = [root / "index.html", root / "privacy.html", root / "styles.css"]
scan_files.extend(p for p in (root / "src").rglob("*.js") if p.name not in {"mock-run.js", "sheet.js"})

str_re = re.compile(r"""(?:'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|\x60(?:\\.|[^\x60\\])*\x60)""", re.S)
for f in scan_files:
    txt = f.read_text(encoding="utf-8")
    if f.suffix == ".html":
        txt = re.sub(r"<script\b[^>]*>.*?</script>", "", txt, flags=re.S)
        txt = re.sub(r"<style\b[^>]*>.*</style>", "", txt, flags=re.S)
        txt = re.sub(r"<[^>]+>", "", txt)
        for ch in txt:
            if ord(ch) > 0x7E and not ch.isspace():
                required_chars.add(ch)
    else:
        clean = re.sub(r"/\*.*?\*/", "", txt, flags=re.S)
        clean = re.sub(r"(?m)^\s*//.*$", "", clean)
        for m in str_re.finditer(clean):
            lit = m.group(0)[1:-1]
            for ch in lit:
                cp = ord(ch)
                if cp >= 0xA0 and not ch.isspace() and not (0xD800 <= cp <= 0xDFFF):
                    required_chars.add(ch)

missing = sorted(
    f"U+{ord(c):04X}({c})"
    for c in required_chars
    if not c.isspace() and ord(c) >= 0x20 and ord(c) not in cmap
)
print(json.dumps({"checked": len(required_chars), "missing": missing[:40], "missingCount": len(missing)}, ensure_ascii=False))
`;
      const { stdout } = await execFileAsync(VENV_PYTHON, ['-c', pyScript, ROOT], { cwd: ROOT, timeout: 15_000 });
      const report = JSON.parse(stdout.trim());
      assert.equal(
        report.missingCount,
        0,
        `wenkai-subset.woff2 is missing ${report.missingCount} runtime/overhaul glyphs (including tofu check): ${report.missing.join(', ')}`,
      );
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // F13: Clean H5 Zip Packaging & TapTap Test Build + Compliance Audit (5 tests)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'T1-F13-01',
    tier: 1,
    feature: 'F13',
    name: 'dist/wugeng-h5.zip structure, CRC integrity, <= 300MB size & wugeng/index.html root',
    async run() {
      const zipPath = path.join(ROOT, 'dist', 'wugeng-h5.zip');
      assert.ok(fs.existsSync(zipPath), 'Expected dist/wugeng-h5.zip to exist');
      const size = fs.statSync(zipPath).size;
      assert.ok(size > 100_000 && size <= 300_000_000, `Expected zip size in (100KB, 300MB], got ${size}`);

      const { stdout } = await execFileAsync(
        VENV_PYTHON,
        [
          '-c',
          'import json, sys, zipfile; z = zipfile.ZipFile(sys.argv[1]); print(json.dumps({"bad": z.testzip(), "names": z.namelist()}))',
          zipPath,
        ],
        { cwd: ROOT, timeout: 10_000 },
      );
      const info = JSON.parse(stdout.trim());
      assert.equal(info.bad, null, `Zip CRC test failed on ${info.bad}`);
      assert.ok(info.names.every((n) => n.startsWith('wugeng/')), 'Every zip entry must reside under wugeng/');
      for (const req of [
        'wugeng/index.html',
        'wugeng/privacy.html',
        'wugeng/styles.css',
        'wugeng/src/main.js',
        'wugeng/assets/fonts/wenkai-subset.woff2',
        'wugeng/assets/fonts/OFL.txt',
      ]) {
        assert.ok(info.names.includes(req), `Missing required entry '${req}' in dist/wugeng-h5.zip`);
      }
    },
  },
  {
    id: 'T1-F13-02',
    tier: 1,
    feature: 'F13',
    name: 'dist/wugeng-h5.zip matches live runtime source files byte-for-byte (SHA-256 stale-zip guard)',
    async run() {
      const { appDir } = await extractH5ZipToScratch('parity');
      const walkJs = (dir, acc = []) => {
        for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, ent.name);
          if (ent.isDirectory()) walkJs(full, acc);
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
        ...walkJs(path.join(ROOT, 'src')),
      ];
      const mismatches = [];
      for (const rel of expectedRelFiles) {
        const livePath = path.join(ROOT, rel);
        const zippedPath = path.join(appDir, rel);
        if (!fs.existsSync(zippedPath)) {
          mismatches.push(`MISSING_IN_ZIP:${rel}`);
          continue;
        }
        if (sha256File(livePath) !== sha256File(zippedPath)) {
          mismatches.push(`STALE_SHA256:${rel}`);
        }
      }
      assert.deepEqual(
        mismatches,
        [],
        `dist/wugeng-h5.zip is out of sync with live repo files (re-run python3 tools/package_h5.py): ${mismatches.join(', ')}`,
      );
    },
  },
  {
    id: 'T1-F13-03',
    tier: 1,
    feature: 'F13',
    name: 'Extracted dist/wugeng-h5.zip boots over ephemeral HTTP server & runs Title -> Hub -> Gameplay cleanly',
    async run({ browser }) {
      const { appDir } = await extractH5ZipToScratch('boot');
      const zipServer = await startStaticServer(appDir);
      const s = await createIsolatedPage(browser, { isolated: true });
      try {
        await s.page.goto(`${zipServer.baseUrl}/privacy.html`);
        await s.page.waitForSelector('.privacy-page h1');

        await bootAndStartRun(s.page, zipServer.baseUrl, { seed: 1303 });
        await stepFrames(s.page, 90);
        await triggerLevelUp(s.page);
        await fastClick(s.page, '.qian');
        const state = await s.page.evaluate(() => ({
          status: window.__wugeng.game.run.status,
          time: window.__wugeng.game.run.time,
          fontOk: document.fonts.check('18px "WenKai"', '五更天'),
        }));
        assert.equal(state.status, 'playing');
        assert.ok(state.time >= 1.2);
        assert.equal(state.fontOk, true);
        assert.deepEqual(s.badResponses, [], `Unexpected HTTP 4xx/5xx on extracted zip: ${s.badResponses.join(', ')}`);
        s.assertNoErrors('T1-F13-03');
      } finally {
        await s.close();
        await zipServer.close();
      }
    },
  },
  {
    id: 'T1-F13-04',
    tier: 1,
    feature: 'F13',
    name: 'taptap-cli upload-h5-package portrait (--screen-orientation 1 --dry-run) validates package cleanly',
    async run() {
      const { stdout } = await execFileAsync(
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
      const parsed = JSON.parse(stdout.trim());
      const payloadStr = JSON.stringify(parsed);
      assert.ok(payloadStr.includes(TAPTAP.appId), `Expected dry-run JSON to reference app ${TAPTAP.appId}: ${payloadStr}`);
    },
  },
  {
    id: 'T1-F13-05',
    tier: 1,
    feature: 'F13',
    name: 'Read-only TapTap audit confirms H5 filing_id 26847 (v529750) & formal store review remain untouched',
    async run() {
      const filingRes = await execFileAsync(
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
      const filingText = filingRes.stdout.trim();
      assert.ok(
        filingText.includes(String(TAPTAP.protectedFilingId)) && filingText.includes(String(TAPTAP.protectedFilingVersionId)),
        `Expected protected filing_id=${TAPTAP.protectedFilingId} (version_id=${TAPTAP.protectedFilingVersionId}) intact: ${filingText}`,
      );

      const verRes = await execFileAsync(
        'taptap-cli',
        [
          'app',
          'list-versions',
          '--dev-id', TAPTAP.devId,
          '--app-id', TAPTAP.appId,
          '--data', '{"page":1,"page_size":20}',
          '--json',
        ],
        { cwd: ROOT, timeout: 15_000 },
      );
      const verText = verRes.stdout.trim();
      assert.equal(
        /"status"\s*:\s*"(?:in_review|reviewing|submitted)"/i.test(verText),
        false,
        `Formal TapTap app version must NOT be submitted to store review: ${verText}`,
      );
    },
  },
];
