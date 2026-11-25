// Tier 2 (Part 7): Boundary, Negative & Invariant E2E Tests for v4 M5 (F20)
// STRICT OPAQUE-BOX: ZERO imports from ../../src/**.

import assert from 'node:assert/strict';
import {
  ALL_HERO_IDS,
  ALL_WEAPON_IDS,
} from './contracts.mjs';
import {
  bootAndStartRun,
  bootToHub,
  createIsolatedPage,
  fastClick,
  grantItemViaLevelUp,
  stepFrames,
  suppressWardersInPage,
} from './harness.mjs';

export const TIER2_F20 = [
  {
    id: 'T2-F20-01',
    tier: 2,
    feature: 'F20',
    name: '[M5.1 Negative] Locked 河灯水口 rejects selection with toast & corrupt selectedMap="__abyss__" falls back safely to qingshi',
    run: async ({ browser, baseUrl }) => {
      const s = await createIsolatedPage(browser);
      try {
        await bootToHub(s.page, baseUrl, {
          savePatch: {
            mapsUnlocked: ['qingshi'],
            selectedMap: '__abyss__',
          },
        });

        const initMap = await s.page.evaluate(() => ({
          qingshiOn: document.querySelector('.hub-map-card[data-map-id="qingshi"]')?.classList.contains('is-on'),
          hedengLocked: document.querySelector('.hub-map-card[data-map-id="hedeng"]')?.classList.contains('is-map-locked'),
        }));
        assert.equal(initMap.qingshiOn, true, 'Corrupt selectedMap must normalize back to qingshi');
        assert.equal(initMap.hedengLocked, true, 'hedeng must render locked before qingshi is cleared');

        await fastClick(s.page, '.hub-map-card[data-map-id="hedeng"]');
        const afterClick = await s.page.evaluate(() => ({
          selectedMap: window.__wugeng.save.selectedMap,
          toastText: document.querySelector('#ui .toast')?.textContent || '',
        }));
        assert.notEqual(afterClick.selectedMap, 'hedeng', 'Clicking locked hedeng card must not switch selectedMap');
        assert.ok(afterClick.toastText.includes('未开放'), `Expected lock toast, got '${afterClick.toastText}'`);
        s.assertNoErrors('T2-F20-01');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T2-F20-02',
    tier: 2,
    feature: 'F20',
    name: '[M5.1 Boundary] Spawn dock (0,0) stays dry at 1.0x speed & straw_cape Lv5 slowResist mitigates river slow above 0.90x',
    run: async ({ browser, baseUrl }) => {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { heroId: 'zhou', mapId: 'hedeng', seed: 2202 });
        await suppressWardersInPage(s.page);

        // 1. Spawn dock (0, 0) moves at full dry speed (same as wooden bridge)
        await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          r.weapons.length = 0;
          r.enemies.length = 0;
          r.props.length = 0;
          r.player.x = -15;
          r.player.y = 0;
        });
        await s.page.keyboard.down('KeyD');
        await stepFrames(s.page, 10, { stopOnOverlay: false, preserveInput: true });
        await s.page.keyboard.up('KeyD');
        const dryDockDist = await s.page.evaluate(() => window.__wugeng.game.run.player.x - (-15));

        // 2. Equip straw_cape Lv5 via genuine level-up choices and verify river water speed > 0.90x of dry dock
        for (let lv = 0; lv < 5; lv++) {
          await grantItemViaLevelUp(s.page, 'relic', 'straw_cape');
        }
        await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          r.player.x = 140;
          r.player.y = 175;
        });
        await s.page.keyboard.down('KeyD');
        await stepFrames(s.page, 10, { stopOnOverlay: false, preserveInput: true });
        await s.page.keyboard.up('KeyD');
        const capeWaterDist = await s.page.evaluate(() => window.__wugeng.game.run.player.x - 140);

        const ratio = capeWaterDist / dryDockDist;
        assert.ok(ratio >= 0.90, `Expected straw_cape Lv5 to mitigate river slow to >=0.90x, got ${ratio.toFixed(3)}`);
        s.assertNoErrors('T2-F20-02');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T2-F20-03',
    tier: 2,
    feature: 'F20',
    name: '[M5.2 Boundary] hebo_wedding Phase 3 80% wardShieldActive reduces hit damage until all 4 wards die, & Boss death cleans up wards + wave walls',
    run: async ({ browser, baseUrl }) => {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { heroId: 'zhou', mapId: 'hedeng', seed: 2203 });
        await suppressWardersInPage(s.page);

        await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          r.weapons.length = 0;
          r.enemies.length = 0;
          r._blessingWatches = { 1: true, 2: true, 3: true, 4: true, 5: true };
          r._bossSpawned = { horse: true, umbrella: true, youshen: true };
          r.watchEventsDone = { 2: true, 3: true, 4: true };
          r.player.invulnT = 180;
          r.time = 419.95;
        });
        await stepFrames(s.page, 5, { stopOnOverlay: false });

        // Force Phase 3 (25% HP) so 4 bossWardOf lanterns spawn and wardShieldActive = true
        await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          const b = r.enemies.find((e) => e.type === 'hebo_wedding');
          b.hp = Math.floor(b.maxHp * 0.25);
        });
        await stepFrames(s.page, 6, { stopOnOverlay: false });

        // Kill only 3 of the 4 wards -> wardShieldActive MUST remain true!
        const partialKill = await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          const b = r.enemies.find((e) => e.type === 'hebo_wedding');
          const wards = r.enemies.filter((e) => !e.dead && e.bossWardOf === b.id);
          for (let i = 0; i < 3; i++) {
            wards[i].dead = true;
            wards[i].hp = 0;
          }
          return wards.length;
        });
        assert.equal(partialKill, 4);
        await stepFrames(s.page, 3, { stopOnOverlay: false });
        assert.equal(
          await s.page.evaluate(() => window.__wugeng.game.run.enemies.find((e) => e.type === 'hebo_wedding')?.wardShieldActive),
          true,
          'With 1 ward still alive, wardShieldActive must stay true',
        );

        // Inject an active enemyWaveWall, then kill Boss directly -> remaining ward and enemyWaveWall must be purged
        await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          r.projectiles.push({
            id: 987654,
            kind: 'enemyWaveWall',
            x: 0,
            y: r.player.y - 180,
            vy: 120,
            safeX: 0,
            safeHalfW: 48,
            halfH: 22,
            spanW: 560,
            telegraphT: 0.5,
            t: 0.2,
            life: 3,
            dmg: 20,
          });
          const b = r.enemies.find((e) => e.type === 'hebo_wedding');
          b.x = r.player.x + 24;
          b.y = r.player.y;
          b.wardShieldActive = false;
          b.hp = 1;
          r.weapons.push({ id: 'gong', level: 5, evolved: true, cd: 0 });
        });
        await stepFrames(s.page, 4, { stopOnOverlay: false });

        const cleanup = await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          if (!r) return { liveWards: 0, waveWalls: 0 };
          return {
            liveWards: r.enemies.filter((e) => !e.dead && e.bossWardOf).length,
            waveWalls: r.projectiles.filter((pr) => pr.kind === 'enemyWaveWall' && !pr.dead).length,
          };
        });
        assert.equal(cleanup.liveWards, 0, 'Boss death must destroy any remaining bossWardOf lanterns');
        assert.equal(cleanup.waveWalls, 0, 'Final Boss death must clear enemyWaveWall projectiles');
        s.assertNoErrors('T2-F20-03');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T2-F20-04',
    tier: 2,
    feature: 'F20',
    name: '[M5.3 Negative] Locked weier / qiansuanzi tiles show unlock progress toast without switching hero, & stopping decays weier waveStacks to 0',
    run: async ({ browser, baseUrl }) => {
      const s = await createIsolatedPage(browser);
      try {
        await bootToHub(s.page, baseUrl, {
          savePatch: {
            unlockedHeroes: ['zhou'],
            selectedHero: 'zhou',
            stats: { totalXpOrbs: 3500 },
          },
        });

        await fastClick(s.page, '[data-hero-id="qiansuanzi"]');
        const qianToast = await s.page.evaluate(() => ({
          selectedHero: window.__wugeng.save.selectedHero,
          toast: document.querySelector('#ui .toast')?.textContent || '',
        }));
        assert.equal(qianToast.selectedHero, 'zhou');
        assert.ok(qianToast.toast.includes('3500/20000'), `Expected 3500/20000 progress in toast, got '${qianToast.toast}'`);

        // Boot run with unlocked weier, build waveStacks via movement, then stop and verify decay to 0
        await bootAndStartRun(s.page, baseUrl, {
          heroId: 'weier',
          savePatch: { unlockedHeroes: ALL_HERO_IDS, unlockedWeapons: ALL_WEAPON_IDS },
          seed: 2204,
        });
        await suppressWardersInPage(s.page);
        await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          r.weapons.length = 0;
          r.enemies.length = 0;
        });

        await s.page.keyboard.down('KeyD');
        await stepFrames(s.page, 180, { stopOnOverlay: false, preserveInput: true });
        await s.page.keyboard.up('KeyD');
        const peakStacks = await s.page.evaluate(() => window.__wugeng.game.run.player.waveStacks);
        assert.equal(peakStacks, 5, 'Continuous movement must cap weier waveStacks at 5');

        await stepFrames(s.page, 195, { stopOnOverlay: false });
        const decayedStacks = await s.page.evaluate(() => window.__wugeng.game.run.player.waveStacks);
        assert.equal(decayedStacks, 0, 'Standing still must decay weier waveStacks back to 0');
        s.assertNoErrors('T2-F20-04');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T2-F20-05',
    tier: 2,
    feature: 'F20',
    name: '[M5.3 Boundary] qiansuanzi batch magnet multiplier caps strictly at 2.0x with 25 orbs & hedeng clear unlocks weier + hedengClear skin reward',
    run: async ({ browser, baseUrl }) => {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, {
          heroId: 'qiansuanzi',
          mapId: 'hedeng',
          savePatch: {
            unlockedHeroes: ['zhou', 'qiansuanzi'],
            unlockedWeapons: ALL_WEAPON_IDS,
            mapsUnlocked: ['qingshi', 'hedeng'],
          },
          seed: 2205,
        });
        await suppressWardersInPage(s.page);

        // Spawn 25 XP orbs (1 + 0.08 * 25 = 3.0 -> must cap at 2.0x!)
        await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          r.weapons.length = 0;
          r.enemies.length = 0;
          r.pickups.length = 0;
          for (let i = 0; i < 25; i++) {
            r.pickups.push({
              id: 880000 + i,
              kind: 'xp',
              x: r.player.x + 60,
              y: r.player.y + (i - 12) * 2,
              value: 4,
              mag: false,
              ms: 0,
            });
          }
          r._xpCount = 25;
          r.player._abacusPulseT = 2.99;
        });
        await stepFrames(s.page, 2, { stopOnOverlay: false });
        const maxBatchMult = await s.page.evaluate(() =>
          window.__wugeng.game.run.pickups.reduce((m, pk) => Math.max(m, pk.batchMult || 0), 0));
        assert.equal(maxBatchMult, 2, `Expected qiansuanzi batchMult to cap strictly at 2.0x, got ${maxBatchMult}`);

        // Settle run as cleared on hedeng -> unlocks weier & marks hedengClear achievement claimable
        const settle = await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          r.time = 420;
          r.status = 'cleared';
          r._cleared = true;
          window.__wugeng.game.finish();
          return {
            weierUnlocked: window.__wugeng.save.unlockedHeroes.includes('weier'),
            hedengClears: window.__wugeng.save.clearsByMap?.hedeng || 0,
            hedengAch: Boolean(window.__wugeng.save.achievements?.hedengClear),
          };
        });
        assert.equal(settle.weierUnlocked, true, 'Clearing hedeng must unlock weier');
        assert.ok(settle.hedengClears >= 1);
        assert.equal(settle.hedengAch, true, 'Clearing hedeng must unlock hedengClear achievement');
        s.assertNoErrors('T2-F20-05');
      } finally {
        await s.close();
      }
    },
  },
];
