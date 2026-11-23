// Tier 3: Cross-Feature Combination & Interaction E2E Tests (18 multi-feature tests)
// STRICT OPAQUE-BOX: ZERO imports from ../../src/**.

import assert from 'node:assert/strict';
import path from 'node:path';
import {
  ROOT,
  VENV_PYTHON,
  bootAndStartRun,
  confirmChestModal,
  createIsolatedPage,
  execFileAsync,
  fastClick,
  grantItemViaLevelUp,
  requireOpenSelector,
  stepFrames,
  triggerChest,
  triggerLevelUp,
} from './harness.mjs';

export const TIER3_TESTS = [
  {
    id: 'T3-C01',
    tier: 3,
    feature: 'F3',
    features: ['F3', 'F6'],
    name: '[F3+F6] 镇魂 3-piece school resonance unlocks gong evolution in .overlay--chest without clapper + grants shockwave',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { heroId: 'zhou', seed: 3101 }); // gong (zhenhun #1)
        await grantItemViaLevelUp(s.page, 'weapon', 'gong', 4); // gong Lv5
        await grantItemViaLevelUp(s.page, 'weapon', 'soulbanner', 1); // zhenhun #2
        await grantItemViaLevelUp(s.page, 'relic', 'strawshoes', 1); // zhenhun #3 (NO clapper!)

        await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          r.player.ult = 10;
          r.projectiles.push({
            id: 81001, kind: 'enemyBullet', x: r.player.x + 80, y: r.player.y,
            r: 8, angle: 0, t: 0, life: 5, vx: 0, vy: 0, dmg: 12,
          });
        });
        await triggerChest(s.page);
        await confirmChestModal(s.page);
        const res = await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          return {
            synCount: r.synergies?.counts?.zhenhun,
            evolved: r.weapons.find((w) => w.id === 'gong')?.evolved,
            ult: r.player.ult,
            bulletCleared: !r.projectiles.some((p) => p.id === 81001 && !p.dead),
          };
        });
        assert.equal(res.synCount, 3);
        assert.equal(res.evolved, true, 'Expected gong Lv5 to evolve via 3-piece zhenhun resonance');
        assert.ok(res.ult >= 60);
        assert.equal(res.bulletCleared, true);
        s.assertNoErrors('T3-C01');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T3-C02',
    tier: 3,
    feature: 'F5',
    features: ['F3', 'F5', 'F6'],
    name: '[F3+F5+F6] Dual-tag bronze_mirror (daofa+yangyan) Lv5 evolves via yangyan 3-piece resonance without fivecoins',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { seed: 3102 });
        await grantItemViaLevelUp(s.page, 'weapon', 'bronze_mirror', 5); // yangyan #1 + daofa #1
        await grantItemViaLevelUp(s.page, 'weapon', 'lantern', 1); // yangyan #2
        await grantItemViaLevelUp(s.page, 'relic', 'tinder', 1); // yangyan #3 (NO fivecoins!)
        await triggerChest(s.page);
        await confirmChestModal(s.page, 'bronze_mirror');

        const res = await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          return {
            yangyan: r.synergies?.counts?.yangyan,
            evolved: r.weapons.find((w) => w.id === 'bronze_mirror')?.evolved,
          };
        });
        assert.equal(res.yangyan, 3);
        assert.equal(res.evolved, true, 'Expected dual-tag bronze_mirror Lv5 to evolve via 3-piece yangyan resonance');
        s.assertNoErrors('T3-C02');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T3-C03',
    tier: 3,
    feature: 'F9',
    features: ['F9', 'F3', 'F12'],
    name: '[F9+F3+F12] 土地香案 (altar) blood-rite enables altar evolution path for Lv5 weapon & syncs Codex',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { seed: 3103 });
        // Upgrade gong to Lv5 with ZERO relics and only 1 school item (only altar rite can unlock/evolve it!)
        await grantItemViaLevelUp(s.page, 'weapon', 'gong', 4);
        const hasShrines = await s.page.evaluate(() => {
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
          return true;
        });
        assert.equal(hasShrines, true, 'Expected starter altar shrine');

        await fastClick(s.page, '[data-action="interact-shrine"]', 'Expected HUD [data-action="interact-shrine"]');
        await requireOpenSelector(s.page, '.overlay--shrine', 'Expected .overlay--shrine');
        await fastClick(s.page, '.overlay--shrine [data-shrine-option]:not([disabled])');
        if (await s.page.evaluate(() => window.__wugeng.overlay === 'levelup')) {
          await fastClick(s.page, '.qian');
        }
        let evolved = await s.page.evaluate(() => window.__wugeng.game.run.weapons.find((w) => w.id === 'gong').evolved);
        if (!evolved) {
          await triggerChest(s.page);
          await confirmChestModal(s.page);
          evolved = await s.page.evaluate(() => window.__wugeng.game.run.weapons.find((w) => w.id === 'gong').evolved);
        }
        assert.equal(evolved, true, 'Expected altar blood-rite path to evolve Lv5 gong without paired relic or school resonance');
        const inCodex = await s.page.evaluate(() => window.__wugeng.save.codex.evolutions.includes('gong'));
        assert.equal(inCodex, true, 'Expected altar-evolved weapon synced into save.codex.evolutions');
        s.assertNoErrors('T3-C03');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T3-C04',
    tier: 3,
    feature: 'F8',
    features: ['F9', 'F8'],
    name: '[F9+F8] 鬼市货郎 (peddler) grants extra reroll/banish charges usable on subsequent .overlay--levelup',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { seed: 3104 });
        const setup = await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          if (!Array.isArray(r.shrines)) return false;
          const ped = r.shrines.find((x) => x.kind === 'peddler' && !x.used);
          if (!ped) return false;
          r.banishesLeft = 0;
          r.rerolls.free = 0;
          r.stats.coins = 500;
          r.enemies.length = 0;
          r._spawnAcc = -99999;
          r.player.x = ped.x;
          r.player.y = ped.y;
          window.__e2eStepFrames(3);
          return true;
        });
        assert.equal(setup, true, 'Expected starter peddler shrine');

        await fastClick(s.page, '[data-action="interact-shrine"]', 'Expected HUD [data-action="interact-shrine"]');
        await requireOpenSelector(s.page, '.overlay--shrine', 'Expected .overlay--shrine');
        const chargeIdx = await s.page.evaluate(() => {
          const opts = window.__wugeng.game.run.activeShrine?.options || [];
          return opts.findIndex((o) => !o.disabled && /签|刷|弃|换/.test(`${o.label}${o.desc}`));
        });
        assert.ok(chargeIdx >= 0, 'Expected peddler to offer a reroll/banish slip-agency option');
        await fastClick(s.page, `.overlay--shrine [data-shrine-option="${chargeIdx}"]`);

        const agencyAfter = await s.page.evaluate(() => ({
          banishes: window.__wugeng.game.run.banishesLeft,
          rerolls: window.__wugeng.game.run.rerolls.free,
        }));
        assert.ok(
          agencyAfter.banishes > 0 || agencyAfter.rerolls > 0,
          `Expected peddler slip option to replenish banishes or free rerolls: ${JSON.stringify(agencyAfter)}`,
        );
        s.assertNoErrors('T3-C04');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T3-C05',
    tier: 3,
    feature: 'F7',
    features: ['F8', 'F7'],
    name: '[F8+F7] Locked normal slip (留签) survives across a 120s 守夜命签 watch blessing draw into the next normal level-up',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { seed: 3105 });
        await triggerLevelUp(s.page);
        const lockedTargetId = await s.page.getAttribute('.qian >> nth=1', 'data-item-id');
        assert.ok(lockedTargetId, 'Expected data-item-id on .qian');

        assert.ok(await s.page.locator('[data-action="lock"]').count() > 0, 'Expected [data-action="lock"]');
        const cardLock = s.page.locator('.qian >> nth=1 >> [data-action="lock"]');
        if (await cardLock.count() > 0) await cardLock.first().click();
        else { await fastClick(s.page, '[data-action="lock"]'); await s.page.evaluate(() => document.querySelectorAll('.qian')[1]?.click()); }
        await fastClick(s.page, '.qian');

        await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          r.enemies.length = 0;
          r._spawnAcc = -99999;
          r.time = 119.97;
          window.__e2eStepFrames(4);
        });
        assert.equal(await s.page.evaluate(() => window.__wugeng.game.run.choiceMode), 'blessing');
        await fastClick(s.page, '.qian');

        await triggerLevelUp(s.page);
        const idsAfterBlessing = await s.page.evaluate(() => window.__wugeng.game.run.choices.map((c) => c.id));
        assert.ok(
          idsAfterBlessing.includes(lockedTargetId),
          `Locked slip '${lockedTargetId}' must survive across intervening watch blessing draw (got ${idsAfterBlessing.join(',')})`,
        );
        s.assertNoErrors('T3-C05');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T3-C06',
    tier: 3,
    feature: 'F1',
    features: ['F5', 'F1'],
    name: '[F5+F1] Glutinous (糯米) extends F1 post-hit hurtInvuln beyond base 0.24s and heals on retaliatory kills',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { seed: 3106 });
        await grantItemViaLevelUp(s.page, 'relic', 'glutinous', 4);
        const res = await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          r.enemies.length = 0;
          r._spawnAcc = -99999;
          r.weapons.forEach((w) => { w.cd = 9999; });
          r.player.hp = 60;
          r.player.invulnT = 0;
          r._spawnQueue.push({ type: 'paperkid', x: r.player.x + 5, y: r.player.y, opts: {} });
          window.__e2eStepFrames(2);
          const invulnAfterHit = r.player.invulnT;
          const hpAfterHit = r.player.hp;

          r.enemies.length = 0;
          r._nextWaveT = 99999;
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
          return { invulnAfterHit, hpAfterHit, hpAfterKills: r.player.hp, killsDelta: r.stats.kills - kills0 };
        });
        assert.ok(
          res.invulnAfterHit > 0.26,
          `Expected glutinous Lv4 to extend post-hit invulnT > 0.26s (above base 0.24s), got ${res.invulnAfterHit}`,
        );
        assert.ok(res.killsDelta >= 35, `Expected >= 35 kills across two gong waves for glutinous killInterval=35, got ${res.killsDelta}`);
        assert.ok(res.hpAfterKills > res.hpAfterHit + 0.5, `Expected glutinous kill-heal after wiping swarm (${res.hpAfterHit} -> ${res.hpAfterKills})`);
        s.assertNoErrors('T3-C06');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T3-C07',
    tier: 3,
    feature: 'F2',
    features: ['F5', 'F2'],
    name: '[F5+F2] Strawshoes (草鞋) speed + slow-resist counters drowned aura to outrun Watch 5 shade & weasel',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { seed: 3107 });
        await grantItemViaLevelUp(s.page, 'relic', 'strawshoes', 3);
        await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          r.enemies.length = 0;
          r._spawnAcc = -99999;
          r._bossSpawned = { horse: true, umbrella: true, youshen: true };
          r._warderSpawned = { warder_150: true, warder_360: true };
          r.weapons.forEach((w) => { w.cd = 9999; });
          r.time = 500;
          r.watch = 5;
          r._spawnQueue.push({ type: 'drowned', x: r.player.x, y: r.player.y + 45, opts: { atkT: 20 } });
          r._spawnQueue.push({ type: 'shade', x: r.player.x - 220, y: r.player.y, opts: {} });
          window.__e2eStepFrames(2);
        });
        await s.page.keyboard.down('KeyD');
        const res = await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          const x0 = r.player.x;
          const t0 = r.time;
          window.__e2eStepFrames(10, { preserveInput: true });
          const effectivePlayerSpeed = (r.player.x - x0) / (r.time - t0);
          const shadeSpeed = r.enemies.find((e) => e.type === 'shade').speed;
          return { effectivePlayerSpeed, shadeSpeed };
        });
        await s.page.keyboard.up('KeyD');
        assert.ok(
          res.effectivePlayerSpeed > res.shadeSpeed,
          `Player with strawshoes Lv3 inside drowned aura (${res.effectivePlayerSpeed.toFixed(1)}) should still outrun Watch 5 shade (${res.shadeSpeed.toFixed(1)})`,
        );
        s.assertNoErrors('T3-C07');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T3-C08',
    tier: 3,
    feature: 'F10',
    features: ['F5', 'F10'],
    name: '[F5+F10] Soulwick (引魂灯芯) + daotong 九天玄雷敕 ultimate spawns thunderBolts & refunds weapon cooldowns',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, {
          heroId: 'daotong',
          seed: 3108,
          savePatch: { unlockedHeroes: ['zhou', 'daotong'], selectedHero: 'daotong' },
        });
        await grantItemViaLevelUp(s.page, 'relic', 'soulwick', 3);
        await grantItemViaLevelUp(s.page, 'weapon', 'compass', 2);

        await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          r.enemies.length = 0;
          r._spawnAcc = -99999;
          r._spawnQueue.push({ type: 'sedan', x: r.player.x + 95, y: r.player.y, opts: {} });
          window.__e2eStepFrames(1);
          r.enemies[0].hp = 9999;
          r.weapons.forEach((w) => { w.cd = 3.0; });
          r.player.ult = r.player.ultMax;
        });
        await s.page.keyboard.press('Space');
        const res = await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          let sawThunder = false;
          window.__e2eStepFrames(15, {
            onStep: () => {
              if (r.projectiles.some((p) => p.kind === 'thunderBolt')) sawThunder = true;
            },
          });
          return {
            sawThunder,
            maxCd: Math.max(...r.weapons.map((w) => w.cd)),
          };
        });
        assert.equal(res.sawThunder, true, 'Expected daotong ultimate to spawn thunderBolt strikes');
        assert.ok(res.maxCd < 2.5, `Expected soulwick to refund weapon cooldowns from 3.0s down to <2.5s (got ${res.maxCd})`);
        s.assertNoErrors('T3-C08');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T3-C09',
    tier: 3,
    feature: 'F6',
    features: ['F4', 'F6'],
    name: '[F4+F6] 4-piece 镇魂 synergy + evolved 五更鸣锣 & 千铃引魂 amplifies stun control & chain crowd wipe',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { heroId: 'zhou', seed: 3109 });
        await grantItemViaLevelUp(s.page, 'weapon', 'gong', 4);
        await grantItemViaLevelUp(s.page, 'relic', 'clapper', 1);
        await triggerChest(s.page);
        await confirmChestModal(s.page);
        await grantItemViaLevelUp(s.page, 'weapon', 'bell', 5);
        await grantItemViaLevelUp(s.page, 'relic', 'redstring', 1); // 4 zhenhun!
        await triggerChest(s.page);
        await confirmChestModal(s.page);

        const res = await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          r.enemies.length = 0;
          r._spawnAcc = -99999;
          r._nextWaveT = 99999;
          for (let i = 0; i < 10; i++) {
            r._spawnQueue.push({
              type: 'drowned',
              x: r.player.x + 65 + (i % 5) * 18,
              y: r.player.y - 20 + Math.floor(i / 5) * 35,
              opts: {},
            });
          }
          window.__e2eStepFrames(1);
          r.enemies.forEach((e) => { e.hp = 800; e.maxHp = 800; });
          r.weapons.forEach((w) => { w.cd = 0; });
          window.__e2eStepFrames(30);
          return {
            tier: r.synergies?.active?.find((a) => a.tag === 'zhenhun')?.tier,
            stunnedOrDead: (10 - r.enemies.length) + r.enemies.filter((e) => e.dead || e.stunT > 0 || e.hp < 800).length,
          };
        });
        assert.equal(res.tier, 4);
        assert.equal(res.stunnedOrDead, 10, 'Expected 4-piece zhenhun + evolved gong/bell to stun & chain all 10 enemies');
        s.assertNoErrors('T3-C09');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T3-C10',
    tier: 3,
    feature: 'F4',
    features: ['F4', 'F6'],
    name: '[F4+F6] 4-piece 道法 synergy + evolved 天师符阵 & 七星剑阵 triggers crit thunder strikes + Bagua arrays',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, {
          heroId: 'daotong',
          seed: 3110,
          savePatch: { unlockedHeroes: ['zhou', 'daotong'], selectedHero: 'daotong' },
        });
        await grantItemViaLevelUp(s.page, 'weapon', 'talisman', 4);
        await grantItemViaLevelUp(s.page, 'relic', 'cinnabar', 1);
        await triggerChest(s.page);
        await confirmChestModal(s.page);
        await grantItemViaLevelUp(s.page, 'weapon', 'coinsword', 5);
        await grantItemViaLevelUp(s.page, 'relic', 'fivecoins', 3); // 4 daofa + high crit
        await triggerChest(s.page);
        await confirmChestModal(s.page);

        const res = await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          r.enemies.length = 0;
          r._spawnAcc = -99999;
          r.mods.critChance = 1.0;
          r._spawnQueue.push({ type: 'sedan', x: r.player.x + 110, y: r.player.y, opts: {} });
          window.__e2eStepFrames(1);
          r.enemies[0].hp = 50000;
          r.enemies[0].speed = 0;
          r.weapons.forEach((w) => { w.cd = 0; });
          const kinds = new Set();
          window.__e2eStepFrames(40, {
            onStep: () => {
              for (const p of r.projectiles) kinds.add(p.kind);
            },
          });
          return {
            tier: r.synergies?.active?.find((a) => a.tag === 'daofa')?.tier,
            kinds: [...kinds],
            dmgDealt: 50000 - r.enemies[0].hp,
          };
        });
        assert.equal(res.tier, 4);
        assert.ok(res.kinds.includes('talismanArray'), `Expected talismanArray, saw ${res.kinds.join(',')}`);
        assert.ok(res.dmgDealt > 500, `Expected heavy crit + daofa thunder damage, got ${res.dmgDealt}`);
        s.assertNoErrors('T3-C10');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T3-C11',
    tier: 3,
    feature: 'F6',
    features: ['F4', 'F5', 'F6'],
    name: '[F4+F5+F6] 阿绵 (mian) + 4-piece 纸扎 synergy + evolved 纸扎仪仗 & 纸马镖 boosts construct swarm DPS',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, {
          heroId: 'mian',
          seed: 3111,
          savePatch: { unlockedHeroes: ['zhou', 'mian'], selectedHero: 'mian' },
        }); // starts with paperman (zhizha #1)
        await grantItemViaLevelUp(s.page, 'weapon', 'paperman', 4);
        await grantItemViaLevelUp(s.page, 'weapon', 'paperhorse', 3); // zhizha #2
        await grantItemViaLevelUp(s.page, 'relic', 'scissors', 2); // zhizha #3
        await grantItemViaLevelUp(s.page, 'relic', 'inkstone', 1); // zhizha #4
        await triggerChest(s.page);
        await confirmChestModal(s.page, 'paperman');

        const res = await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          r.enemies.length = 0;
          r._spawnAcc = -99999;
          r._spawnQueue.push({ type: 'sedan', x: r.player.x + 95, y: r.player.y, opts: {} });
          window.__e2eStepFrames(1);
          r.enemies[0].hp = 20000;
          r.enemies[0].speed = 0;
          r.weapons.forEach((w) => { w.cd = 0; });
          window.__e2eStepFrames(60);
          return {
            tier: r.synergies?.active?.find((a) => a.tag === 'zhizha')?.tier,
            dmg: 20000 - r.enemies[0].hp,
          };
        });
        assert.equal(res.tier, 4);
        assert.ok(res.dmg > 300, `Expected mian + 4pc zhizha + evolved paperman/paperhorse to deal >300 dmg in 1s, got ${res.dmg}`);
        s.assertNoErrors('T3-C11');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T3-C12',
    tier: 3,
    feature: 'F4',
    features: ['F4', 'F6'],
    name: '[F4+F6] 4-piece 阳炎 synergy + evolved 长明灯 & 满堂红 expands AoE/light & amplifies scorch damage',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { seed: 3112 });
        await grantItemViaLevelUp(s.page, 'weapon', 'lantern', 5);
        await grantItemViaLevelUp(s.page, 'relic', 'censer', 1);
        await triggerChest(s.page);
        await confirmChestModal(s.page);
        await grantItemViaLevelUp(s.page, 'weapon', 'firecracker', 5);
        await grantItemViaLevelUp(s.page, 'relic', 'tinder', 1); // 4 yangyan!
        await triggerChest(s.page);
        await confirmChestModal(s.page);

        const res = await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          r.enemies.length = 0;
          r._spawnAcc = -99999;
          r.weapons.find((w) => w.id === 'gong').cd = 9999;
          r._spawnQueue.push({ type: 'sedan', x: r.player.x + 85, y: r.player.y, opts: {} });
          window.__e2eStepFrames(1);
          r.enemies[0].hp = 30000;
          r.enemies[0].speed = 0;
          r.weapons.find((w) => w.id === 'lantern').cd = 0;
          r.weapons.find((w) => w.id === 'firecracker').cd = 0;
          window.__e2eStepFrames(65);
          return {
            tier: r.synergies?.active?.find((a) => a.tag === 'yangyan')?.tier,
            areaMul: r.mods.areaMul,
            dmg: 30000 - r.enemies[0].hp,
          };
        });
        assert.equal(res.tier, 4);
        assert.ok(res.areaMul > 1.18, `Expected censer + 4pc yangyan areaMul > 1.18, got ${res.areaMul}`);
        assert.ok(res.dmg > 400, `Expected heavy scorch + lotus cluster damage, got ${res.dmg}`);
        s.assertNoErrors('T3-C12');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T3-C13',
    tier: 3,
    feature: 'F10',
    features: ['F10', 'F9', 'F3', 'F5'],
    name: '[F10+F9+F3+F5] 2:30 Mini-Warder chest + Trial Stele chest sequentially evolve 2 new F5 weapons',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { seed: 3113 });
        await grantItemViaLevelUp(s.page, 'weapon', 'compass', 5);
        await grantItemViaLevelUp(s.page, 'relic', 'soulwick', 1);
        await grantItemViaLevelUp(s.page, 'weapon', 'soulbanner', 5);
        await grantItemViaLevelUp(s.page, 'relic', 'glutinous', 1);

        await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          r.enemies.length = 0;
          r._spawnAcc = -99999;
          r._nextWaveT = 99999;
          r.time = 149.96;
          for (let k = 0; k < 5; k++) {
            window.__e2eStepFrames(2);
            while (window.__wugeng.overlay === 'levelup') document.querySelector('.qian')?.click();
          }
          const warder = r.enemies.find((e) => e.chest);
          if (warder) {
            warder.x = r.player.x + 20;
            warder.y = r.player.y;
            warder.hp = 1;
            warder.paperArmor = 0;
            r.weapons[0].cd = 0;
            window.__e2eStepFrames(6);
          }
        });
        assert.equal(await s.page.evaluate(() => window.__wugeng.overlay), 'chest', 'Expected 150s Mini-Warder to open chest');
        await confirmChestModal(s.page, 'compass');

        const foundTrial = await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          if (!Array.isArray(r.shrines)) return false;
          const tr = r.shrines.find((x) => x.kind === 'trial' && !x.used);
          if (!tr) return false;
          r.player.x = tr.x;
          r.player.y = tr.y;
          window.__e2eStepFrames(3);
          return true;
        });
        assert.equal(foundTrial, true, 'Expected starter trial stele');
        await fastClick(s.page, '[data-action="interact-shrine"]', 'Expected HUD [data-action="interact-shrine"]');
        if (await s.page.evaluate(() => window.__wugeng.overlay === 'shrine')) {
          await fastClick(s.page, '.overlay--shrine [data-shrine-option]:not([disabled])');
        }
        await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          for (let sec = 0; sec < 20; sec++) {
            r.player.invulnT = 5;
            window.__e2eStepFrames(60);
            while (window.__wugeng.overlay === 'levelup') document.querySelector('.qian')?.click();
            if (r.status === 'chest') break;
          }
          const c = r.pickups.find((p) => p.kind === 'chest');
          if (c) { c.x = r.player.x; c.y = r.player.y; window.__e2eStepFrames(4); }
        });
        assert.equal(await s.page.evaluate(() => window.__wugeng.overlay), 'chest', 'Expected Trial Stele chest');
        await confirmChestModal(s.page);

        const both = await s.page.evaluate(() => ({
          compass: window.__wugeng.game.run.weapons.find((w) => w.id === 'compass')?.evolved,
          soulbanner: window.__wugeng.game.run.weapons.find((w) => w.id === 'soulbanner')?.evolved,
        }));
        assert.equal(both.compass, true);
        assert.equal(both.soulbanner, true);
        s.assertNoErrors('T3-C13');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T3-C14',
    tier: 3,
    feature: 'F11',
    features: ['F6', 'F7', 'F11'],
    name: '[F6+F7+F11] Evolved weapon + active 羁绊 + active 守夜命签 all surface accurately in .overlay--pause',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { seed: 3114 });
        await grantItemViaLevelUp(s.page, 'weapon', 'gong', 4);
        await grantItemViaLevelUp(s.page, 'relic', 'clapper', 1);
        await triggerChest(s.page);
        await confirmChestModal(s.page);

        await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          r.enemies.length = 0;
          r._spawnAcc = -99999;
          r.time = 119.97;
          window.__e2eStepFrames(4);
        });
        assert.equal(await s.page.evaluate(() => window.__wugeng.game.run.choiceMode), 'blessing');
        const chosenBlessingName = await s.page.evaluate(() => window.__wugeng.game.run.choices[0].name);
        await fastClick(s.page, '.qian');

        await fastClick(s.page, '.pause-btn');
        await s.page.waitForFunction(() => window.__wugeng.overlay === 'pause');
        await requireOpenSelector(s.page, '.overlay--pause', 'Expected .overlay--pause');
        const fullText = await s.page.textContent('.overlay--pause');
        assert.ok(fullText.includes('五更鸣锣'), 'Pause overlay must display evolved weapon 五更鸣锣');
        assert.ok(fullText.includes('镇魂'), 'Pause overlay .pause-synergies must display active 镇魂 synergy');
        assert.ok(fullText.includes(chosenBlessingName), `Pause overlay .pause-blessings must display chosen blessing '${chosenBlessingName}'`);
        s.assertNoErrors('T3-C14');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T3-C15',
    tier: 3,
    feature: 'F4',
    features: ['F4', 'F5', 'F10'],
    name: '[F4+F5+F10] Evolved 纸扎仪仗 guards + 乾坤赤阳镜 beam intercept paperbride & umbrella bullet barrages',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { seed: 3115 });
        await grantItemViaLevelUp(s.page, 'weapon', 'paperman', 5);
        await grantItemViaLevelUp(s.page, 'relic', 'scissors', 1);
        await triggerChest(s.page);
        await confirmChestModal(s.page);
        await grantItemViaLevelUp(s.page, 'weapon', 'bronze_mirror', 5);
        await grantItemViaLevelUp(s.page, 'relic', 'fivecoins', 1);
        await triggerChest(s.page);
        await confirmChestModal(s.page);

        const intercepted = await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          r.enemies.length = 0;
          r._spawnAcc = -99999;
          r.weapons.find((w) => w.id === 'gong').cd = 9999;
          r._spawnQueue.push({ type: 'paperbride', x: r.player.x + 150, y: r.player.y, opts: {} });
          window.__e2eStepFrames(2);
          r.enemies[0].hp = 99999;
          for (let i = 0; i < 12; i++) {
            r.projectiles.push({
              id: 83000 + i, kind: 'enemyBullet',
              x: r.player.x + 40 + i * 8, y: r.player.y + ((i % 3) - 1) * 6,
              r: 8, angle: Math.PI, t: 0, life: 6, vx: -35, vy: 0, dmg: 10,
            });
          }
          r.weapons.find((w) => w.id === 'bronze_mirror').cd = 0;
          r.player.hp = 100;
          r.player.invulnT = 0;
          window.__e2eStepFrames(35);
          const remaining = r.projectiles.filter((p) => p.id >= 83000 && p.id < 83012 && !p.dead).length;
          return { remaining, hp: r.player.hp };
        });
        assert.ok(intercepted.remaining < 8, `Expected guards + mirrorBeam to destroy incoming enemyBullets (remaining=${intercepted.remaining}/12)`);
        s.assertNoErrors('T3-C15');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T3-C16',
    tier: 3,
    feature: 'F9',
    features: ['F5', 'F9', 'F12'],
    name: '[F5+F9+F12] Fivecoins (五帝钱) coin bonus funds peddler purchase and settles accurate net coins to save',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { seed: 3116, savePatch: { coins: 0 } });
        await grantItemViaLevelUp(s.page, 'relic', 'fivecoins', 3);
        const ok = await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          if (!Array.isArray(r.shrines)) return false;
          const ped = r.shrines.find((x) => x.kind === 'peddler' && !x.used);
          if (!ped) return false;
          r.enemies.length = 0;
          r._spawnAcc = -99999;
          for (let i = 0; i < 10; i++) {
            r.pickups.push({ id: 97000 + i, kind: 'coin', x: r.player.x, y: r.player.y, value: 20, tier: 2, mag: true, ms: 9999 });
          }
          window.__e2eStepFrames(2);
          r.player.x = ped.x;
          r.player.y = ped.y;
          window.__e2eStepFrames(3);
          return r.stats.coins > 200;
        });
        assert.equal(ok, true, 'Expected fivecoins Lv3 to boost collected coin value > 200 and locate peddler');

        await fastClick(s.page, '[data-action="interact-shrine"]', 'Expected HUD [data-action="interact-shrine"]');
        await fastClick(s.page, '.overlay--shrine [data-shrine-option]:not([disabled])');

        const settled = await s.page.evaluate(() => {
          const summary = window.__wugeng.game.finish();
          return {
            summaryCoins: summary.coins,
            savedCoins: window.__wugeng.save.coins,
            hasFivecoinsInCodex: window.__wugeng.save.codex.relics.includes('fivecoins'),
          };
        });
        assert.ok(settled.summaryCoins >= 0 && settled.savedCoins === settled.summaryCoins);
        assert.equal(settled.hasFivecoinsInCodex, true);
        s.assertNoErrors('T3-C16');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T3-C17',
    tier: 3,
    feature: 'F11',
    features: ['F11', 'F4', 'F10'],
    name: '[F11+F4+F10] Simultaneous Boss spawn + Hero Ult + Weapon Evolve + Cinder explosion runs SFX & VFX cleanly',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { seed: 3117 });
        await grantItemViaLevelUp(s.page, 'weapon', 'gong', 4);
        await grantItemViaLevelUp(s.page, 'relic', 'clapper', 1);
        await triggerChest(s.page);
        await confirmChestModal(s.page);

        await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          window.__wugeng.audio.unlock();
          r._bossSpawned = { horse: false, umbrella: true, youshen: true };
          r.time = 240.1;
          r._spawnQueue.push({ type: 'cinder', x: r.player.x + 35, y: r.player.y, opts: {} });
          r.player.ult = r.player.ultMax;
          window.__e2eStepFrames(2);
          if (r.status === 'levelup') document.querySelector('.qian')?.click();
          const c = r.enemies.find((e) => e.type === 'cinder');
          if (c) c.hp = 1;
        });
        await s.page.keyboard.press('Space');
        await stepFrames(s.page, 45);
        const state = await s.page.evaluate(() => ({
          audioState: window.__wugeng.audio.state,
          ultsCast: window.__wugeng.game.run.stats.ultsCast,
        }));
        assert.equal(state.audioState, 'running');
        assert.ok(state.ultsCast >= 1);
        s.assertNoErrors('T3-C17');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T3-C18',
    tier: 3,
    feature: 'F12',
    features: ['F12', 'F5', 'F7', 'F9'],
    name: '[F12+F5+F7+F9] Live DOM characters rendered in F5 level-up, F7 blessing slips & F9 shrine modals have 0 missing font glyphs',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { seed: 3118 });
        let collectedDomText = '';

        // 1) F5 level-up cards
        await grantItemViaLevelUp(s.page, 'weapon', 'compass', 1);
        await triggerLevelUp(s.page);
        collectedDomText += await s.page.textContent('#ui');
        await fastClick(s.page, '.qian');

        await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          r.enemies.length = 0;
          r._spawnAcc = -99999;
          r.time = 119.97;
          window.__e2eStepFrames(4);
        });
        assert.equal(await s.page.evaluate(() => window.__wugeng.game.run.choiceMode), 'blessing');
        collectedDomText += await s.page.textContent('#ui');
        await fastClick(s.page, '.qian');

        const hasShrine = await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          if (!Array.isArray(r.shrines)) return false;
          const altar = r.shrines.find((x) => x.kind === 'altar' && !x.used);
          if (!altar) return false;
          r.player.x = altar.x;
          r.player.y = altar.y;
          window.__e2eStepFrames(3);
          return true;
        });
        assert.equal(hasShrine, true, 'Expected starter altar shrine');
        await fastClick(s.page, '[data-action="interact-shrine"]', 'Expected HUD [data-action="interact-shrine"]');
        collectedDomText += await s.page.textContent('#ui');

        const fontPath = path.join(ROOT, 'assets', 'fonts', 'wenkai-subset.woff2');
        const { stdout } = await execFileAsync(
          VENV_PYTHON,
          [
            '-c',
            'import json, sys; from fontTools.ttLib import TTFont; cmap = set(TTFont(sys.argv[1]).getBestCmap().keys()); txt = sys.argv[2]; miss = sorted({f"U+{ord(c):04X}({c})" for c in txt if not c.isspace() and ord(c) >= 0x20 and ord(c) not in cmap}); print(json.dumps(miss, ensure_ascii=False))',
            fontPath,
            collectedDomText,
          ],
          { cwd: ROOT, timeout: 10_000 },
        );
        const missing = JSON.parse(stdout.trim());
        assert.deepEqual(missing, [], `Live DOM overlays rendered characters missing from wenkai-subset.woff2: ${missing.join(', ')}`);
        s.assertNoErrors('T3-C18');
      } finally {
        await s.close();
      }
    },
  },
];
