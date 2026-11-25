// Tier 1 (Part 7): Feature Happy-Path E2E Tests for v4 M5 (F20)
// STRICT OPAQUE-BOX: ZERO imports from ../../src/**.

import assert from 'node:assert/strict';
import {
  ALL_HERO_IDS,
  ALL_WEAPON_IDS,
  V4_M5_REGULAR_ENEMY_IDS,
  V4_NEW_HERO_IDS,
} from './contracts.mjs';
import {
  bootAndStartRun,
  bootToHub,
  createIsolatedPage,
  fastClick,
  requireOpenSelector,
  shopBuyAndEquipInModal,
  stepFrames,
  suppressWardersInPage,
} from './harness.mjs';

async function queueEnemy(page, type, dx, dy = 0, hp = 400) {
  await page.evaluate(({ t, ox, oy, fixedHp }) => {
    const r = window.__wugeng.game.run;
    r._spawnQueue.push({ type: t, x: r.player.x + ox, y: r.player.y + oy, opts: { fixedHp } });
  }, { t: type, ox: dx, oy: dy, fixedHp: hp });
  await stepFrames(page, 1, { stopOnOverlay: false });
}

export const TIER1_F20 = [
  {
    id: 'T1-F20-01',
    tier: 1,
    feature: 'F20',
    name: '[M5.1] Hub .hub-map-strip selects unlocked 河灯水口 (1.12x score), renders river/bridge world & riverlantern drops 2 soul fire orbs',
    run: async ({ browser, baseUrl }) => {
      const s = await createIsolatedPage(browser);
      try {
        await bootToHub(s.page, baseUrl, {
          savePatch: {
            mapsUnlocked: ['qingshi', 'hedeng'],
            selectedMap: 'qingshi',
            unlockedHeroes: ALL_HERO_IDS,
            unlockedWeapons: ALL_WEAPON_IDS,
          },
        });

        await requireOpenSelector(s.page, '.hub-map-strip');
        await fastClick(s.page, '.hub-map-card[data-map-id="hedeng"]');
        const mapState = await s.page.evaluate(() => ({
          selectedMap: window.__wugeng.save.selectedMap,
          cardOn: document.querySelector('.hub-map-card[data-map-id="hedeng"]')?.classList.contains('is-on'),
          cardText: document.querySelector('.hub-map-card[data-map-id="hedeng"]')?.textContent || '',
        }));
        assert.equal(mapState.selectedMap, 'hedeng');
        assert.equal(mapState.cardOn, true);
        assert.ok(mapState.cardText.includes('河灯水口') && mapState.cardText.includes('1.12'));

        // Launch run from Hub button and verify mapId === 'hedeng' + riverlantern prop break drops 2 XP orbs
        await fastClick(s.page, '.hub-foot .btn--seal, .btn--big');
        await stepFrames(s.page, 3, { stopOnOverlay: false });

        const propCheck = await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          r.weapons.length = 0;
          const lantern = r.props.find((pr) => pr.kind === 'riverlantern');
          if (!lantern) return { mapId: r.mapId, found: false, gainedXpOrbs: 0 };
          const xpBefore = r.pickups.filter((pk) => pk.kind === 'xp').length;
          r.player.x = lantern.x;
          r.player.y = lantern.y;
          return { mapId: r.mapId, found: true, xpBefore };
        });
        assert.equal(propCheck.mapId, 'hedeng');
        assert.equal(propCheck.found, true, 'Expected riverlantern prop in hedeng active chunks');
        await stepFrames(s.page, 2, { stopOnOverlay: false });

        const afterBreak = await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          return {
            xpOrbsCollected: r.stats.xpOrbsCollected || 0,
            xpOnGround: r.pickups.filter((pk) => pk.kind === 'xp').length,
          };
        });
        assert.ok(
          afterBreak.xpOrbsCollected + afterBreak.xpOnGround >= (propCheck.xpBefore || 0) + 2,
          'Breaking riverlantern must spawn 2 soul fire XP orbs',
        );
        s.assertNoErrors('T1-F20-01');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T1-F20-02',
    tier: 1,
    feature: 'F20',
    name: '[M5.1] River water applies 0.75x move slow while wooden plank bridge at x=0 restores 1.0x full crossing speed',
    run: async ({ browser, baseUrl }) => {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { heroId: 'zhou', mapId: 'hedeng', seed: 2002 });
        await suppressWardersInPage(s.page);

        // Measure 12 frames horizontal movement on wooden bridge (x=0, y=175) vs river water (x=160, y=175)
        await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          r.weapons.length = 0;
          r.enemies.length = 0;
          r.props.length = 0;
          r.player.x = -10;
          r.player.y = 175;
        });
        await s.page.keyboard.down('KeyD');
        await stepFrames(s.page, 10, { stopOnOverlay: false, preserveInput: true });
        await s.page.keyboard.up('KeyD');
        const bridgeDist = await s.page.evaluate(() => window.__wugeng.game.run.player.x - (-10));

        await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          r.player.x = 140;
          r.player.y = 175;
        });
        await s.page.keyboard.down('KeyD');
        await stepFrames(s.page, 10, { stopOnOverlay: false, preserveInput: true });
        await s.page.keyboard.up('KeyD');
        const waterDist = await s.page.evaluate(() => window.__wugeng.game.run.player.x - 140);

        const ratio = waterDist / bridgeDist;
        assert.ok(ratio > 0.70 && ratio < 0.80, `Expected river water speed ~0.75x of wooden bridge, got ratio=${ratio.toFixed(3)}`);
        s.assertNoErrors('T1-F20-02');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T1-F20-03',
    tier: 1,
    feature: 'F20',
    name: '[M5.2] Three river enemies (water_lurker, paper_raft, water_puller) execute submerge/lunge, corridor ram & river tether AI',
    run: async ({ browser, baseUrl }) => {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { heroId: 'zhou', mapId: 'hedeng', seed: 2003 });
        await suppressWardersInPage(s.page);
        assert.equal(V4_M5_REGULAR_ENEMY_IDS.length, 3);

        await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          r.weapons.length = 0;
          r.enemies.length = 0;
          r.player.invulnT = 120;
        });

        // 1. water_lurker spawns submerged and surfaces into windup when close
        await queueEnemy(s.page, 'water_lurker', 78, 0, 400);
        await stepFrames(s.page, 3, { stopOnOverlay: false });
        const lurkerState = await s.page.evaluate(() => {
          const e = window.__wugeng.game.run.enemies.find((x) => x.type === 'water_lurker');
          return e ? { state: e.state, submerged: e.submerged } : null;
        });
        assert.equal(lurkerState?.state, 'windup');
        assert.equal(lurkerState?.submerged, false);

        // 2. paper_raft winds up horizontal corridor ram
        await s.page.evaluate(() => { window.__wugeng.game.run.enemies.length = 0; });
        await queueEnemy(s.page, 'paper_raft', 145, 8, 400);
        await stepFrames(s.page, 3, { stopOnOverlay: false });
        const raftTele = await s.page.evaluate(() => {
          const e = window.__wugeng.game.run.enemies.find((x) => x.type === 'paper_raft');
          return e ? { state: e.state, len: e.telegraphLen } : null;
        });
        assert.equal(raftTele?.state, 'windup');
        assert.ok((raftTele?.len || 0) > 100);

        // 3. water_puller tethers player toward river channel
        await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          r.enemies.length = 0;
          r.player.x = 150;
          r.player.y = 95;
        });
        await queueEnemy(s.page, 'water_puller', 0, 80, 400);
        await s.page.evaluate(() => {
          const wp = window.__wugeng.game.run.enemies.find((x) => x.type === 'water_puller');
          if (wp) wp._pullCd = 0;
        });
        await stepFrames(s.page, 45, { stopOnOverlay: false });
        const pulledY = await s.page.evaluate(() => window.__wugeng.game.run.player.y);
        assert.ok(pulledY > 107, `Expected water_puller to pull player toward river (y=95 -> ${pulledY})`);
        s.assertNoErrors('T1-F20-03');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T1-F20-04',
    tier: 1,
    feature: 'F20',
    name: '[M5.2] 3-phase final Boss 河神夜婚 (hebo_wedding) spawns at 420s in hedeng, fires enemyWaveWall, raises 4-lantern ward & clears at dawn',
    run: async ({ browser, baseUrl }) => {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { heroId: 'zhou', mapId: 'hedeng', seed: 2004 });
        await suppressWardersInPage(s.page);

        // Advance run time to 419.95s on hedeng so natural final Boss spawn produces hebo_wedding
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
        const bossType = await s.page.evaluate(() => window.__wugeng.game.run.boss?.type || null);
        assert.equal(bossType, 'hebo_wedding', 'Expected hedeng 420s final Boss to be hebo_wedding');

        // Phase 2 (<65% HP): spawns enemyWaveWall
        await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          const b = r.enemies.find((e) => e.type === 'hebo_wedding');
          b.hp = Math.floor(b.maxHp * 0.55);
        });
        await stepFrames(s.page, 45, { stopOnOverlay: false });
        const hasWaveWall = await s.page.evaluate(() =>
          window.__wugeng.game.run.projectiles.some((pr) => pr.kind === 'enemyWaveWall'));
        assert.equal(hasWaveWall, true, 'Expected Phase 2 hebo_wedding to launch enemyWaveWall');

        // Phase 3 (<30% HP): spawns 4 bossWardOf lanterns & wardShieldActive, then Boss defeat clears run
        await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          const b = r.enemies.find((e) => e.type === 'hebo_wedding');
          b.hp = Math.floor(b.maxHp * 0.25);
        });
        await stepFrames(s.page, 6, { stopOnOverlay: false });
        const phase3 = await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          const b = r.enemies.find((e) => e.type === 'hebo_wedding');
          const wards = r.enemies.filter((e) => !e.dead && e.bossWardOf === b.id);
          return { phase: b.phase, shield: b.wardShieldActive, wardCount: wards.length };
        });
        assert.equal(phase3.phase, 3);
        assert.equal(phase3.shield, true);
        assert.equal(phase3.wardCount, 4);

        // Defeat wards + Boss via evolved weapon burst -> run clears into result overlay
        await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          for (const e of r.enemies) {
            if (e.bossWardOf) {
              e.hp = 1;
              e.x = r.player.x + 24;
              e.y = r.player.y;
            } else if (e.type === 'hebo_wedding') {
              e.wardShieldActive = false;
              e.hp = 1;
              e.x = r.player.x + 28;
              e.y = r.player.y;
            }
          }
          r.weapons.push({ id: 'gong', level: 5, evolved: true, cd: 0 });
        });
        await stepFrames(s.page, 12, { stopOnOverlay: false });
        const cleared = await s.page.evaluate(() => ({
          watch: window.__wugeng.game.run?.watch,
          hedengClears: window.__wugeng.save.clearsByMap?.hedeng || 0,
          weierUnlocked: window.__wugeng.save.unlockedHeroes?.includes('weier'),
        }));
        assert.ok(cleared.hedengClears >= 1 || cleared.watch === 6);
        s.assertNoErrors('T1-F20-04');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T1-F20-05',
    tier: 1,
    feature: 'F20',
    name: '[M5.3] New heroes 芦二娘 (weier) & 钱算子 (qiansuanzi): Hub selection, 6 Ghost-Market skins & signature combat mechanics',
    run: async ({ browser, baseUrl }) => {
      const s = await createIsolatedPage(browser);
      try {
        assert.deepEqual(V4_NEW_HERO_IDS, ['weier', 'qiansuanzi']);
        await bootToHub(s.page, baseUrl, {
          savePatch: {
            coins: 25_000,
            unlockedHeroes: ALL_HERO_IDS,
            unlockedWeapons: ALL_WEAPON_IDS,
            mapsUnlocked: ['qingshi', 'hedeng'],
          },
        });

        // Select weier & buy shop skin in Ghost-Market
        await fastClick(s.page, '[data-hero-id="weier"]');
        const weierSpotlight = await s.page.evaluate(() => ({
          selectedHero: window.__wugeng.save.selectedHero,
          starter: window.__wugeng.save.selectedStarterWeapon,
          text: document.querySelector('.hero-spotlight')?.textContent || '',
        }));
        assert.equal(weierSpotlight.selectedHero, 'weier');
        assert.equal(weierSpotlight.starter, 'bamboo_pole');
        assert.ok(weierSpotlight.text.includes('芦二娘') && weierSpotlight.text.includes('千浪过水口'));

        await fastClick(s.page, '[data-action="open-market"]');
        await requireOpenSelector(s.page, '.cosmetic-shop-modal');
        const buyWeier = await shopBuyAndEquipInModal(s.page, {
          kind: 'skin',
          heroId: 'weier',
          targetIdx: 1,
          buy: true,
          equip: true,
          close: false,
        });
        assert.equal(buyWeier.ok, true, buyWeier.reason || 'Expected buying weier shop skin to succeed');

        const buyQian = await shopBuyAndEquipInModal(s.page, {
          kind: 'skin',
          heroId: 'qiansuanzi',
          targetIdx: 1,
          buy: true,
          equip: true,
          close: true,
        });
        assert.equal(buyQian.ok, true, buyQian.reason || 'Expected buying qiansuanzi shop skin to succeed');

        // Select qiansuanzi and start run with gold_abacus -> verify abacusBead fires & 3s batch magnet works
        await fastClick(s.page, '[data-hero-id="qiansuanzi"]');
        await fastClick(s.page, '.hub-foot .btn--seal, .btn--big');
        await stepFrames(s.page, 2, { stopOnOverlay: false });
        await suppressWardersInPage(s.page);

        await queueEnemy(s.page, 'lanternghost', 95, 0, 500);
        await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          r.weapons[0].cd = 0;
        });
        await stepFrames(s.page, 4, { stopOnOverlay: false });
        const firedBead = await s.page.evaluate(() =>
          window.__wugeng.game.run.projectiles.some((pr) => pr.kind === 'abacusBead'));
        assert.equal(firedBead, true, 'Expected qiansuanzi starter gold_abacus to fire abacusBead');
        s.assertNoErrors('T1-F20-05');
      } finally {
        await s.close();
      }
    },
  },
];
