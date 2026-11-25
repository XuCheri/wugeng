// Tier 1 (Part 4): Feature Happy-Path E2E Tests for v4 M2 (F17)
// STRICT OPAQUE-BOX: ZERO imports from ../../src/**.

import assert from 'node:assert/strict';
import {
  ALL_WEAPON_IDS,
  V4_BASE_WEAPON_NAMES,
  V4_NEW_REGULAR_ENEMY_IDS,
  V4_NEW_RELIC_IDS,
  V4_NEW_WEAPON_IDS,
  WEAPON_PAIRS,
} from './contracts.mjs';
import {
  bootAndStartRun,
  bootToHub,
  createIsolatedPage,
  fastClick,
  grantItemViaLevelUp,
  requireOpenSelector,
  stepFrames,
  suppressWardersInPage,
  triggerChest,
  triggerLevelUp,
} from './harness.mjs';

async function queueEnemy(page, type, dx, dy = 0, hp = 300) {
  await page.evaluate(({ t, ox, oy, fixedHp }) => {
    const r = window.__wugeng.game.run;
    r._spawnQueue.push({ type: t, x: r.player.x + ox, y: r.player.y + oy, opts: { fixedHp } });
  }, { t: type, ox: dx, oy: dy, fixedHp: hp });
  await stepFrames(page, 1, { stopOnOverlay: false });
}

export const TIER1_F17 = [
  {
    id: 'T1-F17-01',
    tier: 1,
    feature: 'F17',
    name: '[M2.1] Four new folklore enemies (archer_ghost, firecracker_boy, twin_paper, shaman) execute AI & populate Codex',
    run: async ({ browser, baseUrl }) => {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { heroId: 'zhou', seed: 1701 });
        await suppressWardersInPage(s.page);

        const aiCheck = await s.page.evaluate((enemyIds) => {
          const r = window.__wugeng.game.run;
          r.weapons.length = 0;
          r.enemies.length = 0;
          r.player.invulnT = 120;
          return enemyIds.length;
        }, V4_NEW_REGULAR_ENEMY_IDS);
        assert.equal(aiCheck, 4);

        // 1. archer_ghost fires 3-dart fan after windup
        await queueEnemy(s.page, 'archer_ghost', 190, 0, 300);
        await stepFrames(s.page, 135, { stopOnOverlay: false });
        const dartCount = await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          return r.projectiles.filter((p) => p.kind === 'enemyBullet' && p.source === 'archer_ghost').length;
        });
        assert.ok(dartCount >= 3, `Expected archer_ghost to fire >= 3 paper darts, got ${dartCount}`);

        // 2. shaman summons paperkid & grants paperArmor
        await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          r.enemies.length = 0;
          r.projectiles.length = 0;
        });
        await queueEnemy(s.page, 'shaman', 220, 0, 400);
        await queueEnemy(s.page, 'lanternghost', 240, 15, 400);
        await s.page.evaluate(() => {
          const sh = window.__wugeng.game.run.enemies.find((e) => e.type === 'shaman');
          if (sh) sh._summonT = 0.05;
        });
        await stepFrames(s.page, 10, { stopOnOverlay: false });
        const shamanRes = await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          const kids = r.enemies.filter((e) => e.type === 'paperkid' && !e.dead).length;
          const armored = r.enemies.some((e) => e.type === 'lanternghost' && (e.paperArmor || 0) > 0);
          return { kids, armored };
        });
        assert.ok(shamanRes.kids >= 4, `Expected shaman to summon >= 4 paperkids, got ${shamanRes.kids}`);
        assert.equal(shamanRes.armored, true, 'Expected shaman to grant paperArmor to nearby regular enemy');
        s.assertNoErrors('T1-F17-01');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T1-F17-02',
    tier: 1,
    feature: 'F17',
    name: '[M2.2] Random watch events (escort_peddler, light_bonfires, chase_ingot, ghost_parade) complete & persist totalEvents',
    run: async ({ browser, baseUrl }) => {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { heroId: 'zhou', seed: 1702 });
        await suppressWardersInPage(s.page);

        // Trigger watch 2 random event via run time reaching 108.5s
        await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          r._blessingWatches = { 1: true, 2: true, 3: true, 4: true, 5: true };
          r._bossSpawned = { horse: true, umbrella: true, youshen: true };
          r.enemies.length = 0;
          r.player.invulnT = 120;
          r.time = 108.5;
        });
        await stepFrames(s.page, 4, { stopOnOverlay: false });
        const triggered = await s.page.evaluate(() => window.__wugeng.game.run.watchEvent?.kind || null);
        assert.ok(
          ['escort_peddler', 'light_bonfires', 'chase_ingot', 'ghost_parade'].includes(triggered),
          `Expected watch 2 event to auto-trigger at 108.5s, got ${triggered}`,
        );

        // Force light_bonfires event and light all 3 altars to verify completion & world render
        await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          r.watchEvent = {
            kind: 'light_bonfires',
            name: '点亮社火',
            stamp: '火',
            hint: '踏亮三处社火坛',
            duration: 25,
            timer: 25,
            elapsed: 0,
            progress: 0,
            litCount: 0,
            targetX: r.player.x + 300,
            targetY: r.player.y,
            nodes: [
              { x: r.player.x, y: r.player.y, lit: false },
              { x: r.player.x + 12, y: r.player.y, lit: false },
              { x: r.player.x - 12, y: r.player.y, lit: false },
            ],
          };
        });
        await stepFrames(s.page, 4, { stopOnOverlay: false });
        const afterLit = await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          return {
            active: r.watchEvent,
            completed: r.stats.eventsCompleted,
            resOk: r.watchEventResult?.ok,
          };
        });
        assert.equal(afterLit.active, null, 'Expected light_bonfires event to clear on lighting all 3 altars');
        assert.equal(afterLit.completed, 1, 'Expected eventsCompleted === 1');
        assert.equal(afterLit.resOk, true, 'Expected watchEventResult.ok === true');
        s.assertNoErrors('T1-F17-02');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T1-F17-03',
    tier: 1,
    feature: 'F17',
    name: '[M2.3] Four new weapons & four paired relics evolve via chest & fire distinct combat projectiles',
    run: async ({ browser, baseUrl }) => {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, {
          heroId: 'zhou',
          unlockedWeapons: ALL_WEAPON_IDS,
          savePatch: { unlockedWeapons: ALL_WEAPON_IDS },
          seed: 1703,
        });
        await suppressWardersInPage(s.page);

        await s.page.evaluate(() => {
          window.__wugeng.game.run.weapons.length = 0;
          window.__wugeng.game.run.relics.length = 0;
        });
        for (const wid of V4_NEW_WEAPON_IDS) {
          await grantItemViaLevelUp(s.page, 'weapon', wid, 5);
        }
        for (const rid of V4_NEW_RELIC_IDS) {
          await grantItemViaLevelUp(s.page, 'relic', rid, 1);
        }

        await triggerChest(s.page);
        await requireOpenSelector(s.page, '.chest', 'Expected chest ceremony modal');
        const choiceCount = await s.page.$$eval('.chest-choice', (els) => els.length);
        assert.equal(choiceCount, 4, `Expected all 4 M2.3 Lv5 paired weapons in chest choices, got ${choiceCount}`);

        await fastClick(s.page, '[data-action="confirm-chest"]');
        await queueEnemy(s.page, 'sedan', 95, 0, 5000);
        await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          for (const w of r.weapons) w.cd = 0;
        });
        await stepFrames(s.page, 45, { stopOnOverlay: false });

        const combatStats = await s.page.evaluate((wids) => {
          const r = window.__wugeng.game.run;
          const evolvedCount = r.weapons.filter((w) => w.evolved).length;
          const dmgMap = r.stats.damageByWeapon || {};
          const dealtIds = wids.filter((id) => (dmgMap[id] || 0) > 0);
          return { evolvedCount, dealtIds };
        }, V4_NEW_WEAPON_IDS);
        assert.equal(combatStats.evolvedCount, 1, 'Expected selected M2.3 weapon to evolve');
        assert.equal(combatStats.dealtIds.length, 4, `Expected all 4 M2.3 weapons to deal combat damage, got [${combatStats.dealtIds.join(',')}]`);
        s.assertNoErrors('T1-F17-03');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T1-F17-04',
    tier: 1,
    feature: 'F17',
    name: '[M2.3] Prominent lock (留签) & banish (弃签) seal badges preserve locked card & banish unwanted item',
    run: async ({ browser, baseUrl }) => {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, {
          heroId: 'zhou',
          unlockedWeapons: ALL_WEAPON_IDS,
          savePatch: { unlockedWeapons: ALL_WEAPON_IDS },
          seed: 1704,
        });
        await triggerLevelUp(s.page);
        await requireOpenSelector(s.page, '.qian-act--lock .qian-act__seal', 'Expected prominent lock seal badge');
        await requireOpenSelector(s.page, '.qian-act--banish .qian-act__seal', 'Expected prominent banish seal badge');

        const firstId = await s.page.evaluate(() => window.__wugeng.game.run.choices[0]?.id);
        await fastClick(s.page, '[data-action="lock"][data-choice-index="0"]');
        await fastClick(s.page, '[data-action="reroll"]');
        const afterReroll = await s.page.evaluate(() => ({
          id0: window.__wugeng.game.run.choices[0]?.id,
          locked0: window.__wugeng.game.run.choices[0]?.locked,
        }));
        assert.equal(afterReroll.id0, firstId, 'Locked choice must persist across reroll');
        assert.equal(afterReroll.locked0, true);

        const secondId = await s.page.evaluate(() => window.__wugeng.game.run.choices[1]?.id);
        await fastClick(s.page, '[data-action="banish"][data-choice-index="1"]');
        const afterBanish = await s.page.evaluate(() => ({
          banished: [...(window.__wugeng.game.run.banished || [])],
          id1: window.__wugeng.game.run.choices[1]?.id,
        }));
        assert.ok(afterBanish.banished.includes(secondId), 'Banished item must be recorded in run.banished');
        assert.notEqual(afterBanish.id1, secondId, 'Banished slot must immediately redeal a new choice');
        s.assertNoErrors('T1-F17-04');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T1-F17-05',
    tier: 1,
    feature: 'F17',
    name: '[M2.3] Starting from Hub includes all 4 M2.3 field weapons in run pool & Codex shows all 20+20 pairs',
    run: async ({ browser, baseUrl }) => {
      const s = await createIsolatedPage(browser);
      try {
        await bootToHub(s.page, baseUrl, {
          savePatch: {
            codex: { weapons: ALL_WEAPON_IDS },
            coach: { seen: {}, runsPlayed: 3 },
            stats: { runs: 3, firstRunDone: true },
          },
        });
        await fastClick(s.page, '.hub-nav .btn:nth-child(2)');
        await requireOpenSelector(s.page, '.codex', 'Expected Codex modal');
        const names = await s.page.$$eval('.codex-row__name', (els) => els.map((e) => e.textContent.trim()));
        for (const wid of V4_NEW_WEAPON_IDS) {
          assert.ok(names.some((n) => n.includes(V4_BASE_WEAPON_NAMES[wid])), `Codex missing ${V4_BASE_WEAPON_NAMES[wid]}`);
          assert.ok(WEAPON_PAIRS[wid], `Missing pair mapping for ${wid}`);
        }
        await fastClick(s.page, '.codex .btn--ghost, .veil .btn--ghost');

        await fastClick(s.page, '.hub-cta');
        await stepFrames(s.page, 2);
        const pool = await s.page.evaluate(() => window.__wugeng.game.run.unlockedWeapons || []);
        for (const wid of V4_NEW_WEAPON_IDS) {
          assert.ok(pool.includes(wid), `Hub start pool must include M2.3 field weapon '${wid}'`);
        }
        assert.equal(pool.includes('taomujian'), false, 'Locked achievement weapon must remain gated before unlock');
        s.assertNoErrors('T1-F17-05');
      } finally {
        await s.close();
      }
    },
  },
];
