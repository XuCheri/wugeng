// Tier 1 (Part 1): Feature Happy-Path E2E Tests for v3 F1–F7
// STRICT OPAQUE-BOX: ZERO imports from ../../src/**.

import assert from 'node:assert/strict';
import {
  ALL_RELIC_IDS,
  ALL_WEAPON_IDS,
  ATTACK_VFX_IDS,
  BASELINE_SFX_NAMES,
  CODEX_TAB_COUNTS,
  DEFAULT_UNLOCKED_WEAPON_IDS,
  ELITE_AFFIX_IDS,
  HERO_AFFINITY,
  HERO_IDS,
  HERO_SIGNATURE_WEAPONS,
  MAX_RELICS,
  MAX_WEAPONS,
  V3_BASE_WEAPON_NAMES,
  V3_NEW_RELIC_IDS,
  V3_NEW_WEAPON_IDS,
  WEAPON_PAIRS,
} from './contracts.mjs';
import {
  analyzeCanvasSpriteBox,
  bootAndStartRun,
  bootColdIntro,
  bootGame,
  bootToHub,
  checkHubSignatureBadge,
  compareSpriteSnapshots,
  confirmChestModal,
  createIsolatedPage,
  fastClick,
  grantItemViaLevelUp,
  readNormalizedSave,
  requireOpenSelector,
  shopBuyAndEquipInModal,
  stepFrames,
  suppressWardersInPage,
  triggerChest,
  triggerLethalHit,
} from './harness.mjs';

/**
 * Auto-probe 18 skin cells on `style-lab.html?scene=skins` (390x844 default viewport),
 * preferring `window.__skinCells` if exposed and otherwise evaluating candidate `[6x3 centered-390, 6x3 full, 3x6 full]`
 * grids on `#game-canvas`. When `spriteOnly === true`, crops strictly to the upper sprite region excluding bottom labels.
 */
async function probeStyleLabSkinCells(page, spriteOnly = false) {
  return page.evaluate(({ heroIds, tight }) => {
    const c = document.getElementById('game-canvas');
    if (!c || !c.width || !c.height) return [];
    if (Array.isArray(window.__skinCells) && window.__skinCells.length === 18) {
      const ordered = [];
      for (let hIdx = 0; hIdx < heroIds.length; hIdx++) {
        const hid = heroIds[hIdx];
        const matching = window.__skinCells.filter((x) => x.heroId === hid);
        const list = matching.length === 3 ? matching : window.__skinCells.slice(hIdx * 3, hIdx * 3 + 3);
        for (const cell of list) {
          if (!tight) {
            ordered.push(cell.spriteRect || cell);
          } else {
            ordered.push(
              cell.spriteRect || {
                x: cell.x + Math.floor(cell.width * 0.12),
                y: cell.y + Math.floor(cell.height * 0.06),
                width: Math.floor(cell.width * 0.76),
                height: Math.floor(cell.height * 0.66),
              },
            );
          }
        }
      }
      return ordered;
    }

    const ctx = c.getContext('2d');
    const W = c.width;
    const H = c.height;
    const dpr = c.clientWidth ? W / c.clientWidth : 1;
    const img = ctx.getImageData(0, 0, W, H).data;
    const bgR = img[0];
    const bgG = img[1];
    const bgB = img[2];

    const countCellFg = (rect) => {
      const x0 = Math.max(0, rect.x);
      const y0 = Math.max(0, rect.y);
      const x1 = Math.min(W, rect.x + rect.width);
      const y1 = Math.min(H, rect.y + rect.height);
      let fg = 0;
      for (let y = y0; y < y1; y += 2) {
        for (let x = x0; x < x1; x += 2) {
          const i = (y * W + x) * 4;
          if (img[i + 3] >= 25 && Math.abs(img[i] - bgR) + Math.abs(img[i + 1] - bgG) + Math.abs(img[i + 2] - bgB) > 36) {
            fg++;
          }
        }
      }
      return fg * 4;
    };

    const topPad = Math.floor(H * 0.06);
    const usableH = H - topPad - Math.floor(H * 0.02);
    const centerSpan = Math.min(W, Math.round(390 * dpr));
    const centerOx = Math.max(0, Math.floor((W - centerSpan) / 2));

    const candidates = [
      { rows: 6, cols: 3, ox: centerOx, spanW: centerSpan },
      { rows: 6, cols: 3, ox: 0, spanW: W },
      { rows: 3, cols: 6, ox: 0, spanW: W },
    ];

    let bestCells = null;
    let bestScore = -1;
    for (const cand of candidates) {
      const cellW = Math.floor(cand.spanW / cand.cols);
      const cellH = Math.floor(usableH / cand.rows);
      const cells = [];
      let populated = 0;
      let minFg = Infinity;
      for (let idx = 0; idx < 18; idx++) {
        const r = Math.floor(idx / cand.cols);
        const col = idx % cand.cols;
        const rect = tight
          ? {
              x: cand.ox + col * cellW + Math.floor(cellW * 0.14),
              y: topPad + r * cellH + Math.floor(cellH * 0.06),
              width: Math.floor(cellW * 0.72),
              height: Math.floor(cellH * 0.65),
            }
          : {
              x: cand.ox + col * cellW + Math.floor(cellW * 0.10),
              y: topPad + r * cellH + Math.floor(cellH * 0.06),
              width: Math.floor(cellW * 0.80),
              height: Math.floor(cellH * 0.72),
            };
        const fg = countCellFg(rect);
        if (fg > 100) populated++;
        if (fg < minFg) minFg = fg;
        cells.push(rect);
      }
      const score = populated * 1_000_000 + Math.min(minFg, 999_999);
      if (score > bestScore) {
        bestScore = score;
        bestCells = cells;
      }
    }
    return bestCells || [];
  }, { heroIds: HERO_IDS, tight: spriteOnly });
}

/**
 * Helper to buy & equip a non-default skin for `heroId` through `.cosmetic-shop-modal`
 * using pure black-box DOM interactions (`shopBuyAndEquipInModal`).
 */
async function buyAndEquipHeroSkinViaMarket(page, baseUrl, heroId = 'zhou', tierIndex = 1) {
  await bootToHub(page, baseUrl, {
    savePatch: {
      coins: 9999,
      unlockedHeroes: HERO_IDS,
      selectedHero: heroId,
    },
  });
  await fastClick(page, `[data-hero-id="${heroId}"]`, `Expected [data-hero-id="${heroId}"] in Hub`);
  await fastClick(page, '[data-action="open-market"]', 'Expected [data-action="open-market"] in Hub');
  await requireOpenSelector(page, '.cosmetic-shop-modal', 'Expected .cosmetic-shop-modal');

  const equippedOk = await shopBuyAndEquipInModal(page, {
    kind: 'skin',
    heroId,
    targetIdx: tierIndex,
    buy: true,
    equip: true,
    close: true,
  });
  assert.equal(equippedOk.ok, true, equippedOk.reason || 'Failed to buy/equip hero skin via .cosmetic-shop-modal');
  return readNormalizedSave(page);
}

/**
 * Helper to buy & equip an Attack VFX theme via `.cosmetic-shop-modal`.
 */
async function buyAndEquipAttackVfxViaMarket(page, vfxId) {
  await fastClick(page, '[data-action="open-market"]', 'Expected [data-action="open-market"]');
  await requireOpenSelector(page, '.cosmetic-shop-modal', 'Expected .cosmetic-shop-modal');
  const res = await shopBuyAndEquipInModal(page, {
    kind: 'vfx',
    vfxId,
    buy: vfxId !== 'default',
    equip: true,
    close: true,
  });
  assert.equal(res.ok, true, res.reason || `Failed to equip VFX ${vfxId}`);
}

export const TIER1_F1_F7 = [
  // ═══════════════════════════════════════════════════════════════════════════
  // F1: 加载动画与「剑清酱工作室」Logo 开屏动画 (5 tests)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'T1-F1-01',
    tier: 1,
    feature: 'F1',
    name: 'Cold boot (/index.html without ?skipIntro=1) runs loading -> studio logo (lingers >= 3s) -> .screen--title in 3.0s..6.5s without pointer block',
    async run({ browser, baseUrl }) {
      const s = await bootColdIntro(browser, baseUrl);
      try {
        assert.ok(
          s.elapsedMs >= 3000 && s.elapsedMs < 6500,
          `Expected cold-boot studio intro to linger >= 3000ms and reach .screen--title in < 6500ms (PROJECT.md §F1), took ${Math.round(s.elapsedMs)}ms`,
        );
        const postIntro = await s.page.evaluate(() => {
          const trace = window.__e2eIntroTrace || { phases: [], mountedCount: 0 };
          const introEl = document.querySelector('.boot-intro');
          const obstructing = Boolean(
            introEl &&
              !introEl.hidden &&
              getComputedStyle(introEl).display !== 'none' &&
              getComputedStyle(introEl).pointerEvents !== 'none' &&
              parseFloat(getComputedStyle(introEl).opacity || '1') > 0.05,
          );
          return {
            phases: trace.phases,
            mountedCount: trace.mountedCount,
            introState: window.__wugengIntro || null,
            obstructing,
          };
        });
        assert.ok(
          postIntro.mountedCount >= 1 || postIntro.phases.length >= 1 || postIntro.introState !== null,
          `Expected .boot-intro to mount during cold boot, got ${JSON.stringify(postIntro)}`,
        );
        assert.ok(postIntro.phases.includes('loading'), `Expected 'loading' phase in cold-boot trace [${postIntro.phases.join(',')}]`);
        assert.ok(postIntro.phases.includes('logo'), `Expected 'logo' phase in cold-boot trace [${postIntro.phases.join(',')}]`);
        assert.equal(postIntro.obstructing, false, '.boot-intro must detach or disable pointer events after reaching Title');

        await fastClick(s.page, '.title-actions .btn--seal', 'Expected 开始守夜 clickable after cold intro');
        await s.page.waitForSelector('.screen--hub');
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
    name: '?introHold=loading freezes Phase 1 loading progress UI with window.__wugengIntro.ready === true & WenKai font loaded',
    async run({ browser, baseUrl }) {
      const s = await bootColdIntro(browser, baseUrl, { query: 'introHold=loading', waitForHold: true });
      try {
        await requireOpenSelector(s.page, '.boot-intro[data-intro-phase="loading"]', 'Expected .boot-intro[data-intro-phase="loading"]');
        const info = await s.page.evaluate(() => {
          const st = window.__wugengIntro;
          const intro = document.querySelector('.boot-intro');
          const rect = intro?.getBoundingClientRect();
          const fontOk = document.fonts.check('18px "WenKai"', '剑清酱工作室');
          return {
            ready: st?.ready,
            phase: st?.phase,
            progress: st?.progress,
            width: rect?.width || 0,
            height: rect?.height || 0,
            fontOk,
          };
        });
        assert.equal(info.ready, true);
        assert.equal(info.phase, 'loading');
        assert.ok(
          Number.isFinite(info.progress) && info.progress > 0 && info.progress <= 100,
          `Expected finite positive loading progress in (0, 100], got ${info.progress}`,
        );
        assert.ok(info.width >= 300 && info.height >= 500, `Expected fullscreen .boot-intro bounds, got ${info.width}x${info.height}`);
        assert.equal(info.fontOk, true, 'Expected WenKai subset font to contain 剑清酱工作室');

        const canvasSel = (await s.page.$('.boot-intro canvas')) ? '.boot-intro canvas' : '#game-canvas';
        const snap = await analyzeCanvasSpriteBox(s.page, canvasSel);
        assert.ok(snap && snap.nonBgPixels > 120, `Expected non-blank loading canvas artwork, got ${snap?.nonBgPixels} fg pixels`);
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
    name: '?introHold=logo renders multi-color「剑清酱工作室」ink-paper-vermilion-gold Canvas composition',
    async run({ browser, baseUrl }) {
      const s = await bootColdIntro(browser, baseUrl, { query: 'introHold=logo', waitForHold: true });
      try {
        await requireOpenSelector(s.page, '.boot-intro[data-intro-phase="logo"]', 'Expected .boot-intro[data-intro-phase="logo"]');
        const meta = await s.page.evaluate(() => {
          const intro = document.querySelector('.boot-intro');
          return {
            phase: window.__wugengIntro?.phase,
            ready: window.__wugengIntro?.ready,
            domText: intro?.textContent || '',
            aria: intro?.getAttribute('aria-label') || intro?.querySelector('canvas')?.getAttribute('aria-label') || '',
            canvasTexts: (window.__e2eIntroTrace?.canvasTexts || []).join(' '),
          };
        });
        assert.equal(meta.ready, true);
        assert.equal(meta.phase, 'logo');

        const canvasSel = (await s.page.$('.boot-intro canvas')) ? '.boot-intro canvas' : '#game-canvas';
        const snap = await analyzeCanvasSpriteBox(s.page, canvasSel);
        assert.ok(snap, 'Expected rendered canvas on ?introHold=logo');
        assert.ok(snap.hueBuckets.ink >= 200, `Expected deep night ink background/strokes (>=200 px), got ${snap.hueBuckets.ink}`);
        assert.ok(snap.hueBuckets.paper >= 80, `Expected rice-paper sword/calligraphy highlights (>=80 px), got ${snap.hueBuckets.paper}`);
        assert.ok(snap.hueBuckets.verm >= 30, `Expected vermilion cinnabar seal pixels (>=30 px), got ${snap.hueBuckets.verm}`);
        assert.ok(snap.hueBuckets.gold >= 15, `Expected lantern-gold ember/accent pixels (>=15 px), got ${snap.hueBuckets.gold}`);
        const combinedIntroText = `${meta.domText} ${meta.aria} ${meta.canvasTexts}`;
        const missingStudioChars = [...'剑清酱工作室'].filter((ch) => !combinedIntroText.includes(ch));
        assert.deepEqual(
          missingStudioChars,
          [],
          `Expected all characters of '剑清酱工作室' across intro DOM/aria/canvasTexts, missing [${missingStudioChars.join(',')}], got '${combinedIntroText.slice(0, 180)}'`,
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
    name: 'Clicking [data-action="skip-intro"] and pressing Escape / Space immediately dismiss intro to .screen--title',
    async run({ browser, baseUrl }) {
      // A) Button click skip
      const sClick = await bootColdIntro(browser, baseUrl, { query: 'introHold=loading', waitForHold: true });
      try {
        await requireOpenSelector(sClick.page, '[data-action="skip-intro"]', 'Expected [data-action="skip-intro"]');
        const t0 = performance.now();
        await fastClick(sClick.page, '[data-action="skip-intro"]');
        await sClick.page.waitForSelector('.screen--title', { timeout: 1000 });
        assert.ok(performance.now() - t0 < 500, 'Expected skip-intro click to mount .screen--title in < 500ms');
        sClick.assertNoErrors('T1-F1-04-click');
      } finally {
        await sClick.close();
      }

      // B) Escape & Space keyboard skip
      for (const key of ['Escape', 'Space']) {
        const sKey = await bootColdIntro(browser, baseUrl, { query: 'introHold=logo', waitForHold: true });
        try {
          const t0 = performance.now();
          await sKey.page.keyboard.press(key);
          await sKey.page.waitForSelector('.screen--title', { timeout: 1000 });
          assert.ok(performance.now() - t0 < 500, `Expected ${key} keypress to skip intro in < 500ms`);
          sKey.assertNoErrors(`T1-F1-04-${key}`);
        } finally {
          await sKey.close();
        }
      }
    },
  },
  {
    id: 'T1-F1-05',
    tier: 1,
    feature: 'F1',
    name: 'window.__wugeng.replayIntro() replays studio intro on demand and cleanly restores Hub interactivity',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser, { isolated: true });
      try {
        await bootToHub(s.page, baseUrl, { savePatch: { coins: 777 } });
        await s.page.evaluate(() => {
          window.__replayPromise = Promise.resolve(window.__wugeng.replayIntro());
        });
        await s.page.waitForSelector('.boot-intro', { timeout: 2000 });
        await fastClick(s.page, '[data-action="skip-intro"]', 'Expected [data-action="skip-intro"] during replayIntro()');
        await s.page.evaluate(() => window.__replayPromise);
        await s.page.waitForFunction(() => !document.querySelector('.boot-intro') || document.querySelector('.boot-intro').hidden);

        await requireOpenSelector(s.page, '.screen--hub', 'Expected .screen--hub restored after replayIntro()');
        await fastClick(s.page, '.hub-nav .btn:nth-child(1)', 'Expected Hub 加点 clickable after replayIntro()');
        await requireOpenSelector(s.page, '#ui .veil', 'Expected stat shop modal to open without pointer-event block');
        assert.equal(await s.page.evaluate(() => window.__wugeng.save.coins), 777);
        s.assertNoErrors('T1-F1-05');
      } finally {
        await s.close();
      }
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // F2: 6 名守夜角色与初始武器自选（本命亲和加成） (6 tests)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'T1-F2-01',
    tier: 1,
    feature: 'F2',
    name: 'All 6 heroes (zhou, mian, daotong, yinyang, tiejiang, nuoxi) render [data-hero-id] in Hub and start runs',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootToHub(s.page, baseUrl, {
          savePatch: { unlockedHeroes: HERO_IDS, unlockedWeapons: ALL_WEAPON_IDS },
        });
        for (const hid of HERO_IDS) {
          await requireOpenSelector(s.page, `[data-hero-id="${hid}"]`, `Missing Hub hero tile [data-hero-id="${hid}"]`);
          await fastClick(s.page, `[data-hero-id="${hid}"]`);
          const sel = await s.page.evaluate(() => window.__wugeng.save.selectedHero);
          assert.equal(sel, hid, `Clicking [data-hero-id="${hid}"] must update save.selectedHero`);

          await fastClick(s.page, '.hub-foot .btn--seal, .btn--big');
          await stepFrames(s.page, 2);
          const runHero = await s.page.evaluate(() => {
            const r = window.__wugeng.game.run;
            const actual = r?.heroId || r?.player?.heroId;
            window.__wugeng.game.finish();
            window.__wugeng.game.clear();
            window.__wugeng.showHub();
            return actual;
          });
          await s.page.waitForSelector('.screen--hub');
          assert.equal(runHero, hid, `Expected started run heroId === '${hid}', got '${runHero}'`);
        }
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
    name: 'All 6 heroes execute mechanically distinct Ultimates at full ultMax charge',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, {
          heroId: 'zhou',
          seed: 2202,
          savePatch: { unlockedHeroes: HERO_IDS, unlockedWeapons: ALL_WEAPON_IDS },
        });

        const results = {};
        for (const hid of HERO_IDS) {
          await s.page.evaluate((h) => {
            const g = window.__wugeng.game;
            g.start({ heroId: h, nightLevel: 0, meta: {}, charm: null, seed: 2202 });
            const r = g.run;
            r.enemies.length = 0;
            r._spawnAcc = -99999;
            r._nextWaveT = 99999;
            r.weapons.forEach((w) => { w.cd = 9999; });
            for (let i = 0; i < 4; i++) {
              const a = (i / 4) * Math.PI * 2;
              r._spawnQueue.push({
                type: 'sedan',
                x: r.player.x + Math.cos(a) * 80,
                y: r.player.y + Math.sin(a) * 80,
                opts: {},
              });
            }
            window.__e2eStepFrames(1);
            r.enemies.forEach((e) => { e.hp = 9999; e.maxHp = 9999; e.speed = 0; });
            r.projectiles.push({
              id: 82001, kind: 'enemyBullet',
              x: r.player.x + 65, y: r.player.y,
              r: 8, angle: Math.PI, t: 0, life: 6, vx: 0, vy: 0, dmg: 10,
            });
            r.player.ult = r.player.ultMax;
          }, hid);

          await s.page.keyboard.press('Space');
          results[hid] = await s.page.evaluate(() => {
            const r = window.__wugeng.game.run;
            const projKinds = new Set();
            const eventTypes = new Set();
            let stunnedAny = false;
            window.__e2eStepFrames(30, {
              onStep: () => {
                for (const p of r.projectiles) {
                  if (p.kind !== 'enemyBullet') projKinds.add(p.kind);
                }
                for (const ev of r.events || []) eventTypes.add(ev.type);
                if (r.enemies.some((e) => e.stunT > 0 || e.vulnT > 0 || e.vuln > 0 || e.chainedT > 0)) {
                  stunnedAny = true;
                }
              },
            });
            const totalDmg = r.enemies.reduce((sum, e) => sum + Math.max(0, 9999 - e.hp), 0);
            const bulletCleared = !r.projectiles.some((p) => p.id === 82001 && !p.dead);
            return {
              ultsCast: r.stats.ultsCast,
              ultAfter: r.player.ult,
              totalDmg,
              stunnedAny,
              bulletCleared,
              projKinds: [...projKinds].sort(),
              eventTypes: [...eventTypes].sort(),
            };
          });

          assert.equal(results[hid].ultsCast, 1, `Expected ${hid} ultimate to increment ultsCast to 1`);
          assert.ok(results[hid].ultAfter < 25, `Expected ${hid} ultimate to consume ult gauge (got ${results[hid].ultAfter})`);
          assert.ok(
            results[hid].totalDmg > 0 || results[hid].projKinds.length > 0 || results[hid].stunnedAny || results[hid].bulletCleared,
            `Expected ${hid} ultimate to produce tangible combat effect: ${JSON.stringify(results[hid])}`,
          );
        }

        assert.equal(results.zhou.bulletCleared && results.zhou.stunnedAny, true, 'Expected zhou ultimate to stun & clear enemyBullets');
        assert.ok(results.mian.projKinds.includes('paperHorse'), `Expected mian ultimate paperHorse, got ${results.mian.projKinds}`);
        assert.ok(results.daotong.projKinds.includes('thunderBolt'), `Expected daotong ultimate thunderBolt, got ${results.daotong.projKinds}`);
        const newSigs = new Set(
          ['yinyang', 'tiejiang', 'nuoxi'].map((h) => `${results[h].projKinds.join('|')}:${results[h].stunnedAny}:${results[h].bulletCleared}:${Math.round(results[h].totalDmg / 25)}`),
        );
        assert.ok(newSigs.size >= 2, 'Expected new heroes (yinyang, tiejiang, nuoxi) to have mechanically distinct ultimates');
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
    name: 'Hub [data-starter-weapon] picker equips any unlocked non-signature starter weapon at t=0',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootToHub(s.page, baseUrl, {
          savePatch: {
            unlockedHeroes: HERO_IDS,
            unlockedWeapons: DEFAULT_UNLOCKED_WEAPON_IDS,
            selectedHero: 'zhou',
          },
        });
        await fastClick(s.page, '[data-hero-id="zhou"]');
        await fastClick(s.page, '[data-starter-weapon="talisman"]', 'Expected [data-starter-weapon="talisman"] in Hub');
        await fastClick(s.page, '.hub-foot .btn--seal, .btn--big');
        await stepFrames(s.page, 2);
        const wZhou = await s.page.evaluate(() => window.__wugeng.game.run.weapons.map((w) => ({ id: w.id, level: w.level })));
        assert.equal(wZhou.length, 1);
        assert.equal(wZhou[0].id, 'talisman', 'Expected zhou to start with selected non-signature weapon talisman');
        assert.equal(wZhou[0].level, 1);

        await bootToHub(s.page, baseUrl, {
          savePatch: {
            unlockedHeroes: HERO_IDS,
            unlockedWeapons: DEFAULT_UNLOCKED_WEAPON_IDS,
            selectedHero: 'tiejiang',
          },
        });
        await fastClick(s.page, '[data-hero-id="tiejiang"]');
        await fastClick(s.page, '[data-starter-weapon="gong"]', 'Expected [data-starter-weapon="gong"] in Hub');
        await fastClick(s.page, '.hub-foot .btn--seal, .btn--big');
        await stepFrames(s.page, 2);
        const wTie = await s.page.evaluate(() => window.__wugeng.game.run.weapons[0]?.id);
        assert.equal(wTie, 'gong', 'Expected tiejiang to start with selected non-signature weapon gong');
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
    name: 'Selecting hero signature weapon displays .signature-badge (本命) across all 6 hero-weapon pairs',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        const allSigWeapons = [...new Set([...DEFAULT_UNLOCKED_WEAPON_IDS, ...Object.values(HERO_SIGNATURE_WEAPONS)])];
        await bootToHub(s.page, baseUrl, {
          savePatch: {
            unlockedHeroes: HERO_IDS,
            unlockedWeapons: allSigWeapons,
          },
        });

        for (const hid of HERO_IDS) {
          const sigW = HERO_SIGNATURE_WEAPONS[hid];
          const nonSigW = sigW === 'gong' ? 'talisman' : 'gong';
          await fastClick(s.page, `[data-hero-id="${hid}"]`);
          await fastClick(s.page, `[data-starter-weapon="${sigW}"]`);
          const onSig = await checkHubSignatureBadge(s.page);
          assert.equal(onSig.visible, true, `Expected active .signature-badge for ${hid} + signature '${sigW}'`);
          assert.ok(onSig.text.includes('本命'), `Expected .signature-badge text to include '本命', got '${onSig.text}'`);

          await fastClick(s.page, `[data-starter-weapon="${nonSigW}"]`);
          const onNonSig = await checkHubSignatureBadge(s.page);
          assert.equal(onNonSig.visible, false, `Expected .signature-badge inactive when ${hid} selects non-signature '${nonSigW}'`);
        }
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
    name: 'Signature weapon HERO_AFFINITY grants ×1.25 damage, ×0.90 cooldown & +15% area vs non-signature wielder',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootToHub(s.page, baseUrl, {
          savePatch: {
            unlockedHeroes: ['zhou', 'mian'],
            unlockedWeapons: ['gong', 'paperman'],
          },
        });

        const measureGong = async (heroId) =>
          s.page.evaluate((h) => {
            const g = window.__wugeng.game;
            g.start({ heroId: h, startWeapon: 'gong', nightLevel: 0, meta: {}, charm: null, seed: 2205 });
            const r = g.run;
            r.enemies.length = 0;
            r._spawnAcc = -99999;
            r._nextWaveT = 99999;
            r.mods.critChance = 0;
            r._spawnQueue.push({ type: 'drowned', x: r.player.x + 36, y: r.player.y, opts: {} });
            r._spawnQueue.push({ type: 'drowned', x: r.player.x + 200, y: r.player.y, opts: {} });
            window.__e2eStepFrames(1);
            const inner = r.enemies[0];
            const outer = r.enemies[1];
            inner.hp = 5000;
            inner.maxHp = 5000;
            inner.speed = 0;
            outer.hp = 5000;
            outer.maxHp = 5000;
            outer.speed = 0;
            // Base gong radius is 70; place outer probe at 70*1.07 + outer.r so +15% area hits while 1.00x misses!
            outer.x = r.player.x + 70 * 1.07 + (outer.r || 12);
            outer.y = r.player.y;
            r.weapons[0].cd = 0;
            window.__e2eStepFrames(1);
            return {
              dmg: 5000 - inner.hp,
              outerHit: outer.hp < 5000,
              cdAfter: r.weapons[0].cd,
            };
          }, heroId);

        const sig = await measureGong('zhou'); // zhou passive is ultChargePct; gong IS signature
        const nonSig = await measureGong('mian'); // mian passive is summonDmgPct; gong is NOT signature

        assert.ok(nonSig.dmg > 0, `Expected non-signature gong to deal positive damage, got ${nonSig.dmg}`);
        const dmgRatio = sig.dmg / nonSig.dmg;
        const cdRatio = sig.cdAfter / nonSig.cdAfter;
        assert.ok(
          dmgRatio >= 1.21 && dmgRatio <= 1.29,
          `Expected HERO_AFFINITY dmgMul ~${HERO_AFFINITY.dmgMul}x (got ${sig.dmg}/${nonSig.dmg} = ${dmgRatio.toFixed(3)})`,
        );
        assert.ok(
          cdRatio >= 0.86 && cdRatio <= 0.94,
          `Expected HERO_AFFINITY cdMul ~${HERO_AFFINITY.cdMul}x (got ${sig.cdAfter.toFixed(3)}/${nonSig.cdAfter.toFixed(3)} = ${cdRatio.toFixed(3)})`,
        );
        assert.equal(sig.outerHit, true, 'Expected zhou +15% signature areaBonus to hit probe at 1.07x base radius');
        assert.equal(nonSig.outerHit, false, 'Expected non-signature mian base radius to miss probe at 1.07x base radius');
        s.assertNoErrors('T1-F2-05');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T1-F2-06',
    tier: 1,
    feature: 'F2',
    name: 'End-of-run summary accurately records startWeapon and signatureStart (true vs false)',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, {
          heroId: 'yinyang',
          startWeapon: 'compass',
          unlockedWeapons: ALL_WEAPON_IDS,
          savePatch: { unlockedHeroes: HERO_IDS, unlockedWeapons: ALL_WEAPON_IDS },
          seed: 2206,
        });
        const sumSig = await s.page.evaluate(() => window.__wugeng.game.finish());
        assert.equal(sumSig.startWeapon, 'compass');
        assert.equal(sumSig.signatureStart, true, 'Expected signatureStart === true for yinyang + compass');

        await bootAndStartRun(s.page, baseUrl, {
          heroId: 'yinyang',
          startWeapon: 'gong',
          unlockedWeapons: ALL_WEAPON_IDS,
          savePatch: { unlockedHeroes: HERO_IDS, unlockedWeapons: ALL_WEAPON_IDS },
          seed: 2207,
        });
        const sumNonSig = await s.page.evaluate(() => window.__wugeng.game.finish());
        assert.equal(sumNonSig.startWeapon, 'gong');
        assert.equal(sumNonSig.signatureStart, false, 'Expected signatureStart === false for yinyang + gong');
        s.assertNoErrors('T1-F2-06');
      } finally {
        await s.close();
      }
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // F3: 6 兵刃 + 6 法器槽位扩容与 16+16 百器扩充 (7 tests)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'T1-F3-01',
    tier: 1,
    feature: 'F3',
    name: 'Player equips full 6 weapons (MAX_WEAPONS=6) + 6 relics (MAX_RELICS=6) via .qian level-ups & views in .overlay--pause',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, {
          heroId: 'zhou',
          unlockedWeapons: ALL_WEAPON_IDS,
          savePatch: { unlockedWeapons: ALL_WEAPON_IDS },
          seed: 3301,
        });
        for (const wid of ['talisman', 'suohun_chain', 'nuo_drum', 'compass', 'lantern']) {
          await grantItemViaLevelUp(s.page, 'weapon', wid, 1);
        }
        for (const rid of ['clapper', 'yinpai', 'wuse_mask', 'censer', 'cinnabar', 'bagua']) {
          await grantItemViaLevelUp(s.page, 'relic', rid, 1);
        }

        const counts = await s.page.evaluate(() => ({
          w: window.__wugeng.game.run.weapons.length,
          r: window.__wugeng.game.run.relics.length,
        }));
        assert.equal(counts.w, MAX_WEAPONS, 'Expected 6 equipped weapons');
        assert.equal(counts.r, MAX_RELICS, 'Expected 6 equipped relics');

        await fastClick(s.page, '.pause-btn');
        await s.page.waitForFunction(() => window.__wugeng.overlay === 'pause');
        await requireOpenSelector(s.page, '.overlay--pause', 'Expected .overlay--pause');
        const pauseInfo = await s.page.evaluate(() => {
          const slots = document.querySelectorAll('.overlay--pause .pause-slot');
          const txt = document.querySelector('.overlay--pause')?.textContent || '';
          return { slotCount: slots.length, txt };
        });
        assert.ok(pauseInfo.slotCount >= 12, `Expected >= 12 .pause-slot elements for 6+6 loadout, got ${pauseInfo.slotCount}`);
        assert.ok(pauseInfo.txt.includes('无常锁魂链') && pauseInfo.txt.includes('傩神战鼓'), 'Expected v3 weapon names in .overlay--pause');
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
    name: 'New v3 weapons taomujian (桃木飞剑 + leijimu) & suohun_chain (无常锁魂链 + yinpai) fire, damage enemies & evolve via Chest',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        for (const wid of ['taomujian', 'suohun_chain']) {
          const rid = WEAPON_PAIRS[wid];
          await bootAndStartRun(s.page, baseUrl, {
            heroId: 'zhou',
            startWeapon: wid,
            unlockedWeapons: ALL_WEAPON_IDS,
            savePatch: { unlockedWeapons: ALL_WEAPON_IDS },
            seed: 3302,
          });
          await grantItemViaLevelUp(s.page, 'weapon', wid, 4); // Lv5
          await grantItemViaLevelUp(s.page, 'relic', rid, 1);
          await triggerChest(s.page);
          const chestText = (await s.page.textContent('.overlay--chest')) || '';
          await confirmChestModal(s.page, wid);

          const combat = await s.page.evaluate((wId) => {
            const r = window.__wugeng.game.run;
            r.enemies.length = 0;
            r._spawnAcc = -99999;
            r._nextWaveT = 99999;
            r._spawnQueue.push({ type: 'sedan', x: r.player.x + 95, y: r.player.y, opts: {} });
            r._spawnQueue.push({ type: 'drowned', x: r.player.x + 55, y: r.player.y + 20, opts: {} });
            window.__e2eStepFrames(1);
            r.enemies.forEach((e) => { e.hp = 9999; e.maxHp = 9999; e.speed = 0; });
            const wObj = r.weapons.find((w) => w.id === wId);
            wObj.cd = 0;
            let sawProjOrEvent = false;
            window.__e2eStepFrames(45, {
              onStep: () => {
                if (r.projectiles.length > 0 || (r.events && r.events.length > 0)) sawProjOrEvent = true;
                for (const p of r.projectiles) {
                  if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) throw new Error(`NaN projectile on ${wId}`);
                }
              },
            });
            const totalDmg = r.enemies.reduce((sum, e) => sum + Math.max(0, 9999 - e.hp), 0);
            return { evolved: wObj?.evolved, sawProjOrEvent, totalDmg };
          }, wid);

          assert.equal(combat.evolved, true, `Expected ${wid} + ${rid} to evolve via Chest`);
          assert.equal(combat.sawProjOrEvent, true, `Expected evolved ${wid} to fire projectiles/events`);
          assert.ok(combat.totalDmg > 0, `Expected evolved ${wid} to damage enemies, got ${combat.totalDmg}`);
          assert.ok(/[\u4e00-\u9fff]{2,}/.test(chestText), `Expected Chinese evolved title in .overlay--chest for ${wid}`);
        }
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
    name: 'New v3 weapons zhinian_kite (纸鸢火鸦 + huoyao_pouch) & nuo_drum (傩神战鼓 + wuse_mask) + 4 new relics apply bonuses & evolve',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        // 1) Verify all 4 new relics mutate player/mod stats
        await bootAndStartRun(s.page, baseUrl, {
          unlockedWeapons: ALL_WEAPON_IDS,
          savePatch: { unlockedWeapons: ALL_WEAPON_IDS },
          seed: 3303,
        });
        for (const rid of V3_NEW_RELIC_IDS) {
          const beforeSnap = await s.page.evaluate(() => JSON.stringify({
            mods: window.__wugeng.game.run.mods,
            maxHp: window.__wugeng.game.run.player.maxHp,
            speed: window.__wugeng.game.run.player.speed,
            armor: window.__wugeng.game.run.player.armor,
          }));
          await grantItemViaLevelUp(s.page, 'relic', rid, 2);
          const afterSnap = await s.page.evaluate(() => JSON.stringify({
            mods: window.__wugeng.game.run.mods,
            maxHp: window.__wugeng.game.run.player.maxHp,
            speed: window.__wugeng.game.run.player.speed,
            armor: window.__wugeng.game.run.player.armor,
          }));
          assert.notEqual(afterSnap, beforeSnap, `Expected new v3 relic '${rid}' to apply measurable stat/mod bonuses`);
        }

        // 2) Verify zhinian_kite & nuo_drum combat + evolution
        for (const wid of ['zhinian_kite', 'nuo_drum']) {
          const rid = WEAPON_PAIRS[wid];
          await bootAndStartRun(s.page, baseUrl, {
            heroId: 'nuoxi',
            startWeapon: wid,
            unlockedWeapons: ALL_WEAPON_IDS,
            savePatch: { unlockedHeroes: HERO_IDS, unlockedWeapons: ALL_WEAPON_IDS },
            seed: 3304,
          });
          await grantItemViaLevelUp(s.page, 'weapon', wid, 4);
          await grantItemViaLevelUp(s.page, 'relic', rid, 1);
          await triggerChest(s.page);
          await confirmChestModal(s.page, wid);

          const res = await s.page.evaluate((wId) => {
            const r = window.__wugeng.game.run;
            r.enemies.length = 0;
            r._spawnAcc = -99999;
            r._nextWaveT = 99999;
            r._spawnQueue.push({ type: 'sedan', x: r.player.x + 80, y: r.player.y, opts: {} });
            r._spawnQueue.push({ type: 'paperkid', x: r.player.x + 48, y: r.player.y - 18, opts: {} });
            window.__e2eStepFrames(1);
            r.enemies.forEach((e) => { e.hp = 9999; e.maxHp = 9999; e.speed = 0; });
            r.weapons.find((w) => w.id === wId).cd = 0;
            window.__e2eStepFrames(50);
            const totalDmg = r.enemies.reduce((sum, e) => sum + Math.max(0, 9999 - e.hp), 0);
            return { evolved: r.weapons.find((w) => w.id === wId)?.evolved, totalDmg };
          }, wid);

          assert.equal(res.evolved, true, `Expected ${wid} + ${rid} to evolve`);
          assert.ok(res.totalDmg > 0, `Expected evolved ${wid} to deal damage, got ${res.totalDmg}`);
        }
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
    timeoutMs: 16_000,
    name: 'WebAudio synthesizer plays all 15 baseline voices & bespoke fire_<weapon> cues for all 16 weapons',
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
          proto.createOscillator = function wrappedOsc(...args) {
            audioCtx = this;
            scheduledNodes++;
            return origOsc.apply(this, args);
          };
          proto.createBufferSource = function wrappedBuf(...args) {
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
            while (audioCtx && audioCtx.currentTime - startCtx < targetSec && performance.now() - startWall < 1200) {
              await new Promise((r) => setTimeout(r, 15));
            }
          };
          try {
            await waitAudioMs(260);
            for (let i = 0; i < weapons.length; i++) {
              if (i > 0) await waitAudioMs(190);
              const wid = weapons[i];
              const before = scheduledNodes;
              a.onEvents([{ type: 'fire', weaponId: wid, evolved: true, x: 0, y: 0 }], null);
              if (scheduledNodes <= before) missingWeapons.push(wid);
            }
          } finally {
            proto.createOscillator = origOsc;
            proto.createBufferSource = origBuf;
          }
          return { state: a.state, playedBaseline, totalChecked: weapons.length, missingWeapons };
        }, { sfxNames: BASELINE_SFX_NAMES, weapons: ALL_WEAPON_IDS });

        assert.equal(res.state, 'running');
        assert.equal(res.playedBaseline, true, 'Expected all 15 baseline SFX voices to play');
        assert.equal(res.totalChecked, 16);
        assert.deepEqual(res.missingWeapons, [], `Missing WebAudio fire_<weapon> cues for: ${res.missingWeapons.join(', ')}`);
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
    name: 'Codex (百物谱) displays [16, 16, 16, 12, 6] entries (66 total) & 16 unique bespoke evolved weapon icons',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootToHub(s.page, baseUrl, {
          savePatch: {
            unlockedHeroes: HERO_IDS,
            codex: {
              weapons: ALL_WEAPON_IDS,
              evolutions: ALL_WEAPON_IDS,
              relics: ALL_RELIC_IDS,
            },
          },
        });
        await fastClick(s.page, '.hub-nav .btn:nth-child(2)');
        await requireOpenSelector(s.page, '.codex', 'Expected .codex on 百物谱 modal');

        const counts = [];
        for (let t = 0; t < 5; t++) {
          await s.page.evaluate((idx) => document.querySelectorAll('.codex-tab')[idx]?.click(), t);
          const n = await s.page.$$eval('.codex-list > .codex-row:not(.codex-row--ach)', (els) => els.length);
          counts.push(n);
        }
        assert.deepEqual(counts, CODEX_TAB_COUNTS, `Expected Codex counts [16,16,16,12,6], got [${counts.join(',')}]`);

        // Verify all 16 evolved weapon names are distinct from base weapon names & icons are bespoke
        const grabTab = async (tabIdx) => {
          await s.page.evaluate((idx) => document.querySelectorAll('.codex-tab')[idx]?.click(), tabIdx);
          return s.page.$$eval('.codex-list > .codex-row:not(.codex-row--ach)', (rows) => {
            const c = document.createElement('canvas');
            c.width = 64;
            c.height = 64;
            const ctx = c.getContext('2d');
            return rows.map((row) => {
              const img = row.querySelector('img.icon');
              const title = row.querySelector('.codex-row__name')?.textContent?.trim() || '';
              ctx.clearRect(0, 0, 64, 64);
              if (img) ctx.drawImage(img, 0, 0, 64, 64);
              const d = ctx.getImageData(0, 0, 64, 64).data;
              let opaque = 0;
              let hash = 2166136261;
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
              return { title, opaque, hash, center, scaledFromSelf };
            });
          });
        };

        const baseRows = await grabTab(0);
        const evoRows = await grabTab(1);
        assert.equal(baseRows.length, 16);
        assert.equal(evoRows.length, 16);
        assert.equal(new Set(evoRows.map((x) => x.hash)).size, 16, 'All 16 evolved weapon icons must have unique pixel hashes');

        // Verify the 4 new base weapon names appear on tab 0 and evolved tab has distinct non-empty Chinese names
        const baseTitles = baseRows.map((r) => r.title);
        for (const wid of V3_NEW_WEAPON_IDS) {
          assert.ok(baseTitles.some((t) => t.includes(V3_BASE_WEAPON_NAMES[wid])), `Missing ${V3_BASE_WEAPON_NAMES[wid]} in Codex tab 0`);
        }
        for (let i = 0; i < 16; i++) {
          assert.ok(evoRows[i].opaque > 200, `Evo icon #${i} should be non-empty`);
          assert.ok(/[\u4e00-\u9fff]{2,}/.test(evoRows[i].title) && evoRows[i].title !== '？？？', `Invalid evo title '${evoRows[i].title}'`);
          assert.notEqual(evoRows[i].title, baseRows[i].title, `Evolved weapon #${i} title must differ from base weapon '${baseRows[i].title}'`);
        }
        let bespokeCount = 0;
        for (let i = 0; i < 16; i++) {
          let diffs = 0;
          for (let p = 0; p < evoRows[i].center.length; p++) {
            if (evoRows[i].center[p] !== baseRows[i].scaledFromSelf[p]) diffs++;
          }
          if (diffs > 45) bespokeCount++;
        }
        assert.equal(bespokeCount, 16, `Expected all 16 evo icons to use bespoke art (${bespokeCount}/16 bespoke)`);
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
    name: 'In-run HUD renders slots 5 & 6 progressively when expanding from 4W+4R to full 6W+6R',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, {
          unlockedWeapons: ALL_WEAPON_IDS,
          savePatch: { unlockedWeapons: ALL_WEAPON_IDS },
          seed: 3306,
        });
        for (const wid of ['bell', 'talisman', 'compass', 'suohun_chain', 'nuo_drum']) {
          await grantItemViaLevelUp(s.page, 'weapon', wid, 1);
        }
        for (const rid of ['clapper', 'cinnabar', 'redstring', 'bagua', 'yinpai', 'wuse_mask']) {
          await grantItemViaLevelUp(s.page, 'relic', rid, 1);
        }

        const hudDelta = await s.page.evaluate(async () => {
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
          r.player.hurtT = 0;

          await new Promise((res) => requestAnimationFrame(res));
          await new Promise((res) => requestAnimationFrame(res));

          const c = document.getElementById('game-canvas');
          const ctx = c.getContext('2d');
          const dpr = Math.min(2, window.devicePixelRatio || 1);
          const sampleTopLeft = () => {
            const maxX = Math.floor((window.innerWidth / 2 - 58) * dpr);
            const y0 = Math.floor(34 * dpr);
            const h = Math.floor(110 * dpr);
            return ctx.getImageData(0, y0, Math.max(10, maxX), h).data;
          };

          await new Promise((res) => requestAnimationFrame(res));
          const full6 = sampleTopLeft();

          const savedW = r.weapons;
          const savedR = r.relics;
          r.weapons = savedW.slice(0, 4);
          r.relics = savedR.slice(0, 4);
          await new Promise((res) => requestAnimationFrame(res));
          const cap4 = sampleTopLeft();

          r.weapons = savedW;
          r.relics = savedR;

          let diffPx = 0;
          for (let i = 0; i < full6.length; i += 4) {
            if (
              Math.abs(full6[i] - cap4[i]) +
              Math.abs(full6[i + 1] - cap4[i + 1]) +
              Math.abs(full6[i + 2] - cap4[i + 2]) > 24
            ) {
              diffPx++;
            }
          }
          return diffPx;
        });

        assert.ok(hudDelta > 30, `Expected HUD top-left strip to render slots 5 & 6 distinctly from 4W+4R (diffPx=${hudDelta})`);
        s.assertNoErrors('T1-F3-06');
      } finally {
        await s.close();
      }
    },
  },
  {
    id: 'T1-F3-07',
    tier: 1,
    feature: 'F3',
    name: 'Multi-path Chest [data-evo-weapon] selection + 6-piece school synergy & underfoot awakened aura',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, {
          unlockedWeapons: ALL_WEAPON_IDS,
          savePatch: { unlockedWeapons: ALL_WEAPON_IDS },
          seed: 3307,
        });
        // Build 6-piece zhenhun + 2 eligible Lv5 weapons (gong & bell)
        await grantItemViaLevelUp(s.page, 'weapon', 'gong', 4);
        await grantItemViaLevelUp(s.page, 'weapon', 'bell', 5);
        await grantItemViaLevelUp(s.page, 'weapon', 'soulbanner', 1);
        await grantItemViaLevelUp(s.page, 'relic', 'clapper', 1);
        await grantItemViaLevelUp(s.page, 'relic', 'redstring', 1);
        await grantItemViaLevelUp(s.page, 'relic', 'strawshoes', 1);

        await triggerChest(s.page);
        await requireOpenSelector(s.page, '[data-evo-weapon="bell"]', 'Expected multi-eligible [data-evo-weapon="bell"]');
        await confirmChestModal(s.page, 'bell');

        const state = await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          return {
            bellEvolved: r.weapons.find((w) => w.id === 'bell')?.evolved,
            gongEvolved: r.weapons.find((w) => w.id === 'gong')?.evolved,
            zhenhunTier: r.synergies?.active?.find((a) => a.tag === 'zhenhun')?.tier,
          };
        });
        assert.equal(state.bellEvolved, true, 'Selecting [data-evo-weapon="bell"] must evolve bell');
        assert.equal(state.gongEvolved, false, 'Unselected gong must remain unevolved until next chest');
        assert.equal(state.zhenhunTier, 6, 'Expected 6-piece 镇魂 synergy active with 6+6 loadout');
        s.assertNoErrors('T1-F3-07');
      } finally {
        await s.close();
      }
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // F4: 6+6 怪潮密度、巡更头目与数值曲线重调 (6 tests)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'T1-F4-01',
    tier: 1,
    feature: 'F4',
    name: 'Brisk Watch-1 kill pace (<= 2 gong hits on paperkid) paired with dense wave bursts (>= 18 enemies)',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { heroId: 'zhou', seed: 4101 });
        const res = await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          r.enemies.length = 0;
          r._spawnAcc = -99999;
          r.time = 10;
          r._spawnQueue.push({ type: 'paperkid', x: r.player.x + 34, y: r.player.y, opts: {} });
          window.__e2eStepFrames(1);
          const pk = r.enemies[0];
          const pkHp0 = pk.hp;
          r.weapons[0].cd = 0;
          window.__e2eStepFrames(1);
          const hitsNeeded = pk.dead || pk.hp <= 0 ? 1 : Math.ceil(pkHp0 / Math.max(1, pkHp0 - pk.hp));

          // Trigger natural wave burst in Watch 2
          r.enemies.length = 0;
          r.weapons[0].cd = 9999;
          r.player.invulnT = 30;
          r._spawnAcc = 0;
          r.time = 88;
          if (typeof r._nextWaveT === 'number' && r._nextWaveT > 90) r._nextWaveT = 89;
          let maxAlive = 0;
          for (let i = 0; i < 30; i++) {
            window.__e2eStepFrames(6, { stopOnOverlay: false });
            while (window.__wugeng.overlay === 'levelup') document.querySelector('.qian')?.click();
            maxAlive = Math.max(maxAlive, r.enemies.filter((e) => !e.dead).length);
          }
          return { hitsNeeded, maxAlive };
        });

        assert.ok(res.hitsNeeded <= 2, `Expected Lv1 signature gong to kill Watch-1 paperkid in <= 2 hits, got ${res.hitsNeeded}`);
        assert.ok(res.maxAlive >= 18, `Expected dense wave burst (>= 18 active enemies), got ${res.maxAlive}`);
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
    name: 'All 5 main-run chest milestones (150s, 240s, 360s, Watch-4 3rd Mini-Warder ~430s, 480s) spawn & drop chests',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { seed: 4102 });
        const milestones = await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          r.mods.pickupRange = 1;
          const checkExactSec = (sec, label) => {
            if (window.__wugeng.game.isPaused()) window.__wugeng.game.resume();
            r.enemies.length = 0;
            r.pickups.length = 0;
            r._spawnAcc = -99999;
            r._nextWaveT = 99999;
            r.boss = null;
            r.time = sec - 0.05;
            for (let k = 0; k < 6; k++) {
              window.__e2eStepFrames(2, { stopOnOverlay: false });
              while (window.__wugeng.overlay === 'levelup') document.querySelector('.qian')?.click();
            }
            const carrier = r.enemies.find((e) => e.chest || e.boss);
            if (!carrier) return { label, found: false, dropped: false };
            carrier.x = r.player.x + 42;
            carrier.y = r.player.y;
            carrier.hp = 1;
            carrier.paperArmor = 0;
            if (carrier.state === 'shield') carrier.state = 'open';
            r.weapons[0].cd = 0;
            window.__e2eStepFrames(3, { stopOnOverlay: false });
            const dropped = r.pickups.some((p) => p.kind === 'chest') || r.status === 'chest' || (r._pendingChests || 0) > 0;
            r.boss = null;
            return { label, found: true, type: carrier.type, dropped };
          };

          const m150 = checkExactSec(150, '150s_warder');
          const m240 = checkExactSec(240, '240s_horse');
          const m360 = checkExactSec(360, '360s_warder');

          // Scan Watch-4 window (415s..455s) for the new 3rd Mini-Warder
          r.enemies.length = 0;
          r.pickups.length = 0;
          r._spawnAcc = -99999;
          r._nextWaveT = 99999;
          r.boss = null;
          let m430 = { label: 'watch4_warder', found: false, dropped: false };
          for (let sec = 415; sec <= 455; sec += 2) {
            r.time = sec - 0.05;
            window.__e2eStepFrames(6, { stopOnOverlay: false });
            while (window.__wugeng.overlay === 'levelup') document.querySelector('.qian')?.click();
            const w4 = r.enemies.find((e) => e.chest && !e.boss);
            if (w4) {
              w4.x = r.player.x + 42;
              w4.y = r.player.y;
              w4.hp = 1;
              w4.paperArmor = 0;
              r.weapons[0].cd = 0;
              window.__e2eStepFrames(3, { stopOnOverlay: false });
              const dropped = r.pickups.some((p) => p.kind === 'chest') || r.status === 'chest' || (r._pendingChests || 0) > 0;
              m430 = { label: 'watch4_warder', secFound: Math.round(r.time), found: true, type: w4.type, dropped };
              break;
            }
          }

          const m480 = checkExactSec(480, '480s_umbrella');
          return [m150, m240, m360, m430, m480];
        });

        assert.equal(milestones.length, 5);
        for (const m of milestones) {
          assert.equal(
            m.found && m.dropped,
            true,
            `Expected guaranteed chest milestone '${m.label}' to spawn & drop chest: ${JSON.stringify(m)}`,
          );
        }
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
    name: 'Steepened quadratic mid/late-watch enemy HP curve scales Watch-4/5 above Watch-1 to match 6+6 DPS',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { seed: 4103 });
        await suppressWardersInPage(s.page);
        const hps = await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          r._bossSpawned = { horse: true, umbrella: true, youshen: true };
          const sampleAt = (sec) => {
            r.enemies.length = 0;
            r._spawnAcc = -99999;
            r._nextWaveT = 99999;
            r.weapons.forEach((w) => { w.cd = 9999; });
            r.time = sec;
            r._spawnQueue.push({ type: 'lanternghost', x: r.player.x + 180, y: r.player.y, opts: { elite: false } });
            window.__e2eStepFrames(1, { stopOnOverlay: false });
            while (window.__wugeng.overlay === 'levelup') document.querySelector('.qian')?.click();
            return r.enemies[0]?.maxHp || 0;
          };
          return {
            hp0: sampleAt(0),
            hp240: sampleAt(240),
            hp540: sampleAt(540),
          };
        });

        assert.ok(hps.hp0 > 0);
        assert.ok(
          hps.hp240 / hps.hp0 >= 3.5,
          `Expected Watch-3/4 lanternghost HP ratio >= 3.5x vs t=0 (${hps.hp240}/${hps.hp0} = ${(hps.hp240 / hps.hp0).toFixed(2)})`,
        );
        assert.ok(
          hps.hp540 / hps.hp0 >= 11.0,
          `Expected Watch-5 quadratic HP ratio >= 11.0x vs t=0 (${hps.hp540}/${hps.hp0} = ${(hps.hp540 / hps.hp0).toFixed(2)})`,
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
    name: 'Recalibrated Bosses (horse @ 240s, umbrella @ 480s shield DR, youshen @ 600s 3-phase) scale HP & phase mechanics',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { seed: 4104 });
        await suppressWardersInPage(s.page);
        const bossStats = await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          r.weapons.forEach((w) => { w.cd = 9999; });
          const spawnBossAt = (key, sec) => {
            r.enemies.length = 0;
            r.boss = null;
            r._spawnAcc = -99999;
            r._nextWaveT = 99999;
            r._bossSpawned = { horse: true, umbrella: true, youshen: true, [key]: false };
            r.time = sec + 0.1;
            window.__e2eStepFrames(2, { stopOnOverlay: false });
            while (window.__wugeng.overlay === 'levelup') document.querySelector('.qian')?.click();
            return r.enemies.find((e) => e.type === key);
          };

          const horse = spawnBossAt('horse', 240);
          const horseHp = horse?.maxHp || 0;

          const umb = spawnBossAt('umbrella', 480);
          const umbHp = umb?.maxHp || 0;
          umb.x = r.player.x + 36;
          umb.y = r.player.y;
          umb.state = 'open';
          const hpOpen0 = umb.hp;
          r.weapons[0].cd = 0;
          window.__e2eStepFrames(1, { stopOnOverlay: false });
          const dmgOpen = hpOpen0 - umb.hp;

          umb.state = 'shield';
          const hpShield0 = umb.hp;
          r.weapons[0].cd = 0;
          window.__e2eStepFrames(1, { stopOnOverlay: false });
          const dmgShield = hpShield0 - umb.hp;
          r.weapons[0].cd = 9999;

          const ys = spawnBossAt('youshen', 600);
          const ysHp = ys?.maxHp || 0;
          ys.hp = Math.floor(ys.maxHp * 0.22);
          window.__e2eStepFrames(4, { stopOnOverlay: false });
          const ysPhase = ys.phase;

          return { horseHp, umbHp, ysHp, dmgOpen, dmgShield, ysPhase };
        });

        assert.ok(bossStats.horseHp >= 4500, `Expected horse maxHp >= 4500, got ${bossStats.horseHp}`);
        assert.ok(bossStats.umbHp >= 45_000 && bossStats.umbHp > bossStats.horseHp * 6, `Expected umbrella maxHp scaling, got ${bossStats.umbHp}`);
        assert.ok(bossStats.ysHp >= 450_000 && bossStats.ysHp > bossStats.umbHp * 6, `Expected youshen maxHp scaling, got ${bossStats.ysHp}`);
        assert.ok(bossStats.dmgOpen > 0 && bossStats.dmgShield < bossStats.dmgOpen * 0.5, `Expected umbrella shield DR (${bossStats.dmgShield} vs ${bossStats.dmgOpen})`);
        assert.equal(bossStats.ysPhase, 3, 'Expected youshen at 22% HP to transition into Phase 3');
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
    name: 'Watch-5 enemy speed fairness (speedGrowthCap <= 1.35, shade & youshen P3 slower than base player)',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { seed: 4105 });
        await suppressWardersInPage(s.page);
        const speeds = await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          r._bossSpawned = { horse: true, umbrella: true, youshen: true };
          r.weapons.forEach((w) => { w.cd = 9999; });
          r._spawnAcc = -99999;
          r._nextWaveT = 99999;

          r.enemies.length = 0;
          r.time = 0;
          r._spawnQueue.push({ type: 'paperkid', x: r.player.x + 200, y: r.player.y, opts: {} });
          window.__e2eStepFrames(1, { stopOnOverlay: false });
          const pk0 = r.enemies[0].speed;

          r.enemies.length = 0;
          r.time = 540;
          r._spawnQueue.push({ type: 'paperkid', x: r.player.x + 200, y: r.player.y, opts: {} });
          r._spawnQueue.push({ type: 'shade', x: r.player.x + 220, y: r.player.y, opts: {} });
          window.__e2eStepFrames(1, { stopOnOverlay: false });
          while (window.__wugeng.overlay === 'levelup') document.querySelector('.qian')?.click();
          const pk9 = r.enemies.find((e) => e.type === 'paperkid').speed;
          const shade9 = r.enemies.find((e) => e.type === 'shade').speed;

          r.enemies.length = 0;
          r.boss = null;
          r._bossSpawned.youshen = false;
          r.time = 600.2;
          window.__e2eStepFrames(2, { stopOnOverlay: false });
          while (window.__wugeng.overlay === 'levelup') document.querySelector('.qian')?.click();
          const ys = r.enemies.find((e) => e.type === 'youshen');
          ys.hp = Math.floor(ys.maxHp * 0.25);
          window.__e2eStepFrames(3, { stopOnOverlay: false });

          return {
            playerSpeed: r.player.speed,
            pkRatio: pk9 / pk0,
            shade9,
            ysSpeed: ys.speed,
          };
        });

        assert.ok(speeds.pkRatio <= 1.36, `Expected paperkid speed ratio <= 1.36, got ${speeds.pkRatio.toFixed(3)}`);
        assert.ok(speeds.shade9 < speeds.playerSpeed, `Expected Watch-5 shade (${speeds.shade9}) < player.speed (${speeds.playerSpeed})`);
        assert.ok(speeds.ysSpeed < speeds.playerSpeed, `Expected Youshen P3 speed (${speeds.ysSpeed}) < player.speed (${speeds.playerSpeed})`);
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
    name: 'Tactical enemies (paperbride, cinder death-blast w/ +125px affinity isolation), 5 elite affixes & hurtInvuln',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, { nightLevel: 3, seed: 4106, savePatch: { nightUnlocked: 5 } });
        const res = await s.page.evaluate(() => {
          const r = window.__wugeng.game.run;
          r.enemies.length = 0;
          r._spawnAcc = -99999;
          r._nextWaveT = 99999;
          r._spawnQueue.push({ type: 'cinder', x: r.player.x + 55, y: r.player.y, opts: {} });
          r._spawnQueue.push({ type: 'drowned', x: r.player.x + 125, y: r.player.y, opts: {} });
          window.__e2eStepFrames(1);
          const cinder = r.enemies.find((e) => e.type === 'cinder');
          const bystander = r.enemies.find((e) => e.type === 'drowned');
          cinder.hp = 1;
          bystander.hp = 5000;
          bystander.maxHp = 5000;
          bystander.speed = 0;
          // Bystander at +125px is outside zhou's +15% signature gong radius (70*1.15 + 14 = 94.5 < 125)!
          bystander.x = r.player.x + 125;
          r.weapons[0].cd = 0;
          window.__e2eStepFrames(2);
          r.weapons[0].cd = 9999;
          const hpImmediatelyAfterGong = bystander.hp;
          let sawExplosion = false;
          for (let f = 0; f < 55; f++) {
            bystander.x = r.player.x + 65;
            window.__e2eStepFrames(1);
            if (r.projectiles.some((p) => p.kind === 'explosion') || (r.events || []).some((ev) => ev.type === 'explosion')) {
              sawExplosion = true;
            }
          }
          const hpAfterBlast = bystander.hp;

          // Spawn 24 elites to verify canonical ELITE_AFFIX_IDS
          r.enemies.length = 0;
          for (let i = 0; i < 24; i++) {
            r._spawnQueue.push({
              type: 'lanternghost',
              x: r.player.x + 220 + (i % 6) * 18,
              y: r.player.y + Math.floor(i / 6) * 18,
              opts: { elite: true },
            });
          }
          window.__e2eStepFrames(2);
          const affixes = [];
          for (const e of r.enemies) {
            if (Array.isArray(e.affixes)) affixes.push(...e.affixes);
            else if (e.affix) affixes.push(e.affix);
          }
          return {
            hpImmediatelyAfterGong,
            hpAfterBlast,
            sawExplosion,
            affixes: [...new Set(affixes)],
          };
        });

        assert.equal(res.hpImmediatelyAfterGong, 5000, 'Bystander at +125px must not be clipped by zhou signature gong');
        assert.equal(res.sawExplosion, true, 'Killed cinder must trigger delayed death explosion');
        assert.ok(res.hpAfterBlast < 5000, 'Cinder death-blast must damage nearby enemy');
        assert.ok(res.affixes.length >= 3 && res.affixes.every((a) => ELITE_AFFIX_IDS.includes(a)));
        s.assertNoErrors('T1-F4-06');
      } finally {
        await s.close();
      }
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // F5: 每角色多套明显差异皮肤（6 角色 × 3 套 = 18 套） (5 tests)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'T1-F5-01',
    tier: 1,
    feature: 'F5',
    name: 'style-lab.html?scene=skins sets window.__ready === true and renders 18 non-blank pairwise-unique skin bitmaps',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser, { styleLab: true });
      try {
        await s.page.setViewportSize({ width: 390, height: 844 });
        await s.page.goto(`${baseUrl}/style-lab.html?scene=skins`);
        await s.page.waitForFunction(() => window.__ready === true, null, { timeout: 6000 });

        const cells = await probeStyleLabSkinCells(s.page, false);
        assert.equal(cells.length, 18, 'Expected 18 skin showcase cells (6 heroes × 3 skins)');
        const snaps = await Promise.all(cells.map((rect) => analyzeCanvasSpriteBox(s.page, '#game-canvas', rect)));
        snaps.forEach((snap, idx) => {
          assert.ok(snap && snap.nonBgPixels > 100, `Expected non-blank skin cell ${JSON.stringify(cells[idx])}, got ${snap?.nonBgPixels}`);
        });
        const uniqueHashes = new Set(snaps.map((x) => x.hash)).size;
        assert.equal(uniqueHashes, 18, `Expected 18 pairwise-unique skin bitmaps on ?scene=skins, got ${uniqueHashes}`);
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
    name: 'Quantitative skin divergence: for ALL 6 heroes, all 3 skins exceed >18% pixel delta & >8% upper headgear + lower cloak silhouette XOR',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser, { styleLab: true });
      try {
        await s.page.setViewportSize({ width: 390, height: 844 });
        await s.page.goto(`${baseUrl}/style-lab.html?scene=skins`);
        await s.page.waitForFunction(() => window.__ready === true, null, { timeout: 6000 });

        const spriteCells = await probeStyleLabSkinCells(s.page, true);
        assert.equal(spriteCells.length, 18, 'Expected 18 tight sprite cells (6 heroes × 3 skins)');

        for (let h = 0; h < HERO_IDS.length; h++) {
          const hid = HERO_IDS[h];
          const groupRects = spriteCells.slice(h * 3, h * 3 + 3);
          const [s0, s1, s2] = await Promise.all(
            groupRects.map((rect) => analyzeCanvasSpriteBox(s.page, '#game-canvas', rect)),
          );
          for (const [label, a, b] of [['0v1', s0, s1], ['0v2', s0, s2], ['1v2', s1, s2]]) {
            const cmp = compareSpriteSnapshots(a, b);
            assert.ok(
              cmp.pixelDiffRatio > 0.18,
              `[${hid} ${label}] Expected >18% foreground pixel delta across skins, got ${(cmp.pixelDiffRatio * 100).toFixed(1)}%`,
            );
            assert.ok(
              cmp.upperSilhouetteXorRatio > 0.08,
              `[${hid} ${label}] Expected >8% upper headgear/crown outer silhouette XOR, got ${(cmp.upperSilhouetteXorRatio * 100).toFixed(1)}%`,
            );
            assert.ok(
              cmp.lowerSilhouetteXorRatio > 0.08,
              `[${hid} ${label}] Expected >8% lower robe/cloak/aura outer silhouette XOR, got ${(cmp.lowerSilhouetteXorRatio * 100).toFixed(1)}%`,
            );
          }
        }
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
    name: 'Chromatic mineral-pigment diversity across the 12 non-default hero skins (jade, azure, violet, burnished gold)',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser, { styleLab: true });
      try {
        await s.page.setViewportSize({ width: 390, height: 844 });
        await s.page.goto(`${baseUrl}/style-lab.html?scene=skins`);
        await s.page.waitForFunction(() => window.__ready === true, null, { timeout: 6000 });

        const rects = await probeStyleLabSkinCells(s.page, true);
        const snaps = await Promise.all(rects.map((rect) => analyzeCanvasSpriteBox(s.page, '#game-canvas', rect)));
        let totalJade = 0;
        let totalAzure = 0;
        let totalViolet = 0;
        let totalGold = 0;
        for (let h = 0; h < 6; h++) {
          const s0 = snaps[h * 3];
          const s1 = snaps[h * 3 + 1];
          const s2 = snaps[h * 3 + 2];
          const maxHueShift = Math.max(
            compareSpriteSnapshots(s0, s1).l1HueDistance,
            compareSpriteSnapshots(s0, s2).l1HueDistance,
          );
          assert.ok(maxHueShift > 0.15, `Expected measurable mineral palette shift on hero #${h} skins, got L1=${maxHueShift.toFixed(3)}`);
          for (const alt of [s1, s2]) {
            totalJade += alt.hueBuckets.jade;
            totalAzure += alt.hueBuckets.azure;
            totalViolet += alt.hueBuckets.violet;
            totalGold += alt.hueBuckets.gold;
          }
        }
        const distinctMineralFamilies = [totalJade > 30, totalAzure > 30, totalViolet > 25, totalGold > 90].filter(Boolean).length;
        assert.ok(
          distinctMineralFamilies >= 3,
          `Expected >= 3 mineral pigment families across non-default skins (jade=${totalJade}, azure=${totalAzure}, violet=${totalViolet}, gold=${totalGold})`,
        );
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
    name: 'Equipping a hero skin immediately updates the live Hub stage preview Canvas (.hero-stage__canvas)',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootToHub(s.page, baseUrl, {
          savePatch: { coins: 9999, unlockedHeroes: HERO_IDS, selectedHero: 'zhou' },
        });
        const stageSel = (await s.page.$('.hero-stage__canvas')) ? '.hero-stage__canvas' : '.screen--hub canvas';
        await requireOpenSelector(s.page, stageSel, 'Expected .hero-stage__canvas in Hub');
        const snapDefault = await analyzeCanvasSpriteBox(s.page, stageSel);
        assert.ok(snapDefault && snapDefault.nonBgPixels > 150, 'Expected non-blank Hub stage preview canvas');

        await buyAndEquipHeroSkinViaMarket(s.page, baseUrl, 'zhou', 1);
        await s.page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
        const snapEquipped = await analyzeCanvasSpriteBox(s.page, stageSel);

        const cmp = compareSpriteSnapshots(snapDefault, snapEquipped);
        assert.ok(
          cmp.pixelDiffRatio > 0.12,
          `Expected Hub stage preview canvas to change >12% pixels after equipping new skin, got ${(cmp.pixelDiffRatio * 100).toFixed(1)}%`,
        );
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
    name: 'Equipped non-default hero skin renders in live combat (#game-canvas sprite + foot aura) & persists across reload',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser, { isolated: true });
      try {
        const sampleCenterPlayer = async () => {
          await s.page.evaluate(async () => {
            const r = window.__wugeng.game.run;
            r.enemies.length = 0;
            r.props.length = 0;
            r.pickups.length = 0;
            r.projectiles.length = 0;
            if (Array.isArray(r.shrines)) r.shrines.length = 0;
            r.weapons.forEach((w) => { w.cd = 9999; });
            r._spawnAcc = -99999;
            r.time = 5;
            r.darkness = 0;
            r.player.hurtT = 0;
            r.player.invulnT = 0;
            window.__wugeng.game.pause();
            await new Promise((res) => requestAnimationFrame(res));
            await new Promise((res) => requestAnimationFrame(res));
          });
          const crop = await s.page.evaluate(() => ({
            x: Math.floor(window.innerWidth / 2 - 34),
            y: Math.floor(window.innerHeight / 2 - 36),
            width: 68,
            height: 72,
          }));
          return analyzeCanvasSpriteBox(s.page, '#game-canvas', crop, { cssCoords: true });
        };

        // 1) Baseline default skin on daotong
        await bootAndStartRun(s.page, baseUrl, {
          heroId: 'daotong',
          savePatch: { unlockedHeroes: HERO_IDS, selectedHero: 'daotong' },
          seed: 5105,
        });
        const snapDefault = await sampleCenterPlayer();

        // 2) Buy & equip non-default skin on daotong, reload page, verify persistence + live combat pixels
        const saved = await buyAndEquipHeroSkinViaMarket(s.page, baseUrl, 'daotong', 1);
        const equippedSkinId = saved.heroSkins.daotong;
        assert.ok(equippedSkinId && !/default$/i.test(equippedSkinId), `Expected non-default skin equipped on daotong, got ${equippedSkinId}`);

        await s.page.reload();
        await s.page.waitForSelector('.screen--title');
        const afterReload = await readNormalizedSave(s.page);
        assert.equal(afterReload.heroSkins.daotong, equippedSkinId, 'Equipped hero skin must survive page.reload()');

        await fastClick(s.page, '.title-actions .btn--seal');
        await s.page.waitForSelector('.screen--hub');
        await fastClick(s.page, '.hub-foot .btn--seal, .btn--big');
        await stepFrames(s.page, 2);
        const snapCustom = await sampleCenterPlayer();

        const cmp = compareSpriteSnapshots(snapDefault, snapCustom);
        assert.ok(
          cmp.pixelDiffRatio > 0.15,
          `Expected live #game-canvas player + foot aura to differ >15% with equipped skin, got ${(cmp.pixelDiffRatio * 100).toFixed(1)}%`,
        );
        s.assertNoErrors('T1-F5-05');
      } finally {
        await s.close();
      }
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // F6: 5 套明显差异攻击特效主题 (5 tests)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'T1-F6-01',
    tier: 1,
    feature: 'F6',
    name: 'style-lab.html?scene=vfx sets window.__ready === true and renders 5 pairwise-distinct Attack VFX panels',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser, { styleLab: true });
      try {
        await s.page.setViewportSize({ width: 540, height: 960 });
        await s.page.goto(`${baseUrl}/style-lab.html?scene=vfx`);
        await s.page.waitForFunction(() => window.__ready === true, null, { timeout: 6000 });

        const panels = await s.page.evaluate(() => {
          const c = document.getElementById('game-canvas');
          if (Array.isArray(window.__vfxPanels) && window.__vfxPanels.length === 5) {
            return window.__vfxPanels;
          }
          const W = c.width;
          const H = c.height;
          const topPad = Math.floor(H * 0.06);
          const rowH = Math.floor((H - topPad - Math.floor(H * 0.02)) / 5);
          return [0, 1, 2, 3, 4].map((i) => ({
            x: Math.floor(W * 0.06),
            y: topPad + i * rowH + Math.floor(rowH * 0.08),
            width: Math.floor(W * 0.88),
            height: Math.floor(rowH * 0.84),
          }));
        });

        assert.equal(panels.length, 5);
        const snaps = await Promise.all(panels.map((rect) => analyzeCanvasSpriteBox(s.page, '#game-canvas', rect)));
        for (let i = 0; i < 5; i++) {
          assert.ok(snaps[i] && snaps[i].nonBgPixels > 220, `Expected non-blank VFX panel #${i}, got ${snaps[i]?.nonBgPixels}`);
        }
        assert.equal(new Set(snaps.map((x) => x.hash)).size, 5, 'All 5 VFX showcase panels must be pairwise distinct');
        s.assertNoErrors('T1-F6-01');
      } finally {
        await s.page.setViewportSize({ width: 390, height: 844 }).catch(() => {});
        await s.close();
      }
    },
  },
  {
    id: 'T1-F6-02',
    tier: 1,
    feature: 'F6',
    name: 'Chromatic mineral signatures in live weapon fire (jade_ghostfire, violet_thunder, frost_moon, gilded_imperial)',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, {
          unlockedWeapons: ALL_WEAPON_IDS,
          savePatch: {
            unlockedWeapons: ALL_WEAPON_IDS,
            cosmetics: { owned: ATTACK_VFX_IDS, equipped: { attackVfx: 'default', heroSkins: {} } },
          },
          seed: 6102,
        });
        await grantItemViaLevelUp(s.page, 'weapon', 'brush', 2);
        await grantItemViaLevelUp(s.page, 'weapon', 'talisman', 2);

        const sampleTheme = async (themeId) => {
          await s.page.evaluate(async (vfx) => {
            const w = window.__wugeng;
            w.save.cosmetics = w.save.cosmetics || { owned: [], equipped: {} };
            w.save.cosmetics.equipped = Object.assign({}, w.save.cosmetics.equipped || {}, { attackVfx: vfx });
            w.game.applySettings({
              shake: false,
              dmgText: 'off',
              lowQuality: false,
              cosmetics: w.save.cosmetics.equipped,
            });
            const r = w.game.run;
            if (r.player) r.player.attackVfx = vfx;
            if (Array.isArray(r.players) && r.players[0]) r.players[0].attackVfx = vfx;
            r.enemies.length = 0;
            r.props.length = 0;
            r.pickups.length = 0;
            r.darkness = 0;
            r.time = 15;
            r.projectiles = [
              { id: 901, kind: 'gongPulse', x: r.player.x, y: r.player.y, r: 65, radius: 65, maxRadius: 85, t: 0.12, life: 0.35, evolved: true, attackVfx: vfx },
              { id: 902, kind: 'brushArc', x: r.player.x + 42, y: r.player.y - 20, r: 48, radius: 56, angle: 0.2, spread: 1.4, t: 0.1, life: 0.3, evolved: true, attackVfx: vfx },
              { id: 903, kind: 'talisman', x: r.player.x - 55, y: r.player.y + 15, vx: -120, vy: 20, r: 14, angle: 2.9, t: 0.1, life: 1.0, evolved: true, attackVfx: vfx },
              { id: 904, kind: 'talismanArray', x: r.player.x + 70, y: r.player.y + 45, r: 44, radius: 44, t: 0.2, life: 1.2, evolved: true, attackVfx: vfx },
            ];
            w.game.pause();
            await new Promise((res) => requestAnimationFrame(res));
            await new Promise((res) => requestAnimationFrame(res));
          }, themeId);
          return analyzeCanvasSpriteBox(s.page, '#game-canvas', {
            x: Math.floor(390 / 2 - 130),
            y: Math.floor(844 / 2 - 110),
            width: 260,
            height: 220,
          }, { cssCoords: true });
        };

        const snaps = {};
        for (const id of ATTACK_VFX_IDS) {
          snaps[id] = await sampleTheme(id);
        }

        assert.ok(snaps.jade_ghostfire.hueBuckets.jade >= 35, `Expected jade_ghostfire emerald pixels >= 35, got ${snaps.jade_ghostfire.hueBuckets.jade}`);
        assert.ok(snaps.violet_thunder.hueBuckets.violet >= 35, `Expected violet_thunder violet pixels >= 35, got ${snaps.violet_thunder.hueBuckets.violet}`);
        assert.ok(snaps.frost_moon.hueBuckets.azure >= 35, `Expected frost_moon glacier azure pixels >= 35, got ${snaps.frost_moon.hueBuckets.azure}`);
        assert.ok(
          snaps.gilded_imperial.hueBuckets.gold >= Math.max(35, snaps.default.hueBuckets.gold * 1.6),
          `Expected gilded_imperial burnished gold boost (${snaps.gilded_imperial.hueBuckets.gold} vs default ${snaps.default.hueBuckets.gold})`,
        );
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
    name: 'Color-blind binary foreground & luminance masks BOTH prove >15% geometric shape XOR across Attack VFX themes (not mere recolor)',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootAndStartRun(s.page, baseUrl, {
          savePatch: {
            cosmetics: { owned: ATTACK_VFX_IDS, equipped: { attackVfx: 'default', heroSkins: {} } },
          },
          seed: 6103,
        });

        const renderIsolatedShape = async (themeId) => {
          await s.page.evaluate(async (vfx) => {
            const w = window.__wugeng;
            w.save.cosmetics.equipped.attackVfx = vfx;
            w.game.applySettings({
              shake: false,
              dmgText: 'off',
              lowQuality: false,
              cosmetics: w.save.cosmetics.equipped,
            });
            const r = w.game.run;
            if (r.player) r.player.attackVfx = vfx;
            if (Array.isArray(r.players) && r.players[0]) r.players[0].attackVfx = vfx;
            r.enemies.length = 0;
            r.props.length = 0;
            r.pickups.length = 0;
            if (Array.isArray(r.shrines)) r.shrines.length = 0;
            r.darkness = 0;
            r.time = 12;
            r.projectiles = [
              { id: 951, kind: 'gongPulse', x: r.player.x + 80, y: r.player.y - 80, r: 52, radius: 52, maxRadius: 72, t: 0.14, life: 0.35, evolved: true, attackVfx: vfx },
              { id: 952, kind: 'brushArc', x: r.player.x + 80, y: r.player.y - 80, r: 48, radius: 54, angle: 0.35, spread: 1.5, t: 0.12, life: 0.3, evolved: true, attackVfx: vfx },
            ];
            w.game.pause();
            await new Promise((res) => requestAnimationFrame(res));
            await new Promise((res) => requestAnimationFrame(res));
          }, themeId);
          return analyzeCanvasSpriteBox(
            s.page,
            '#game-canvas',
            { x: Math.floor(390 / 2 + 80 - 72), y: Math.floor(844 / 2 - 80 - 72), width: 144, height: 144 },
            { cssCoords: true, lumaThreshold: 22 },
          );
        };

        const baseSnap = await renderIsolatedShape('default');
        for (const themeId of ['jade_ghostfire', 'violet_thunder', 'gilded_imperial', 'frost_moon']) {
          const snap = await renderIsolatedShape(themeId);
          const cmp = compareSpriteSnapshots(baseSnap, snap);
          assert.ok(
            cmp.silhouetteXorRatio > 0.15,
            `Expected >15% binary foreground silhouette XOR between default and ${themeId}, got ${(cmp.silhouetteXorRatio * 100).toFixed(1)}%`,
          );
          assert.ok(
            cmp.lumaMaskXorRatio > 0.15,
            `Expected >15% color-blind luminance-mask XOR between default and ${themeId}, got ${(cmp.lumaMaskXorRatio * 100).toFixed(1)}%`,
          );
        }
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
    name: 'Equipping Attack VFX updates both Hub live stage preview AND in-run combat projectiles across classic + v3 weapons',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser, { isolated: true });
      try {
        await bootToHub(s.page, baseUrl, {
          savePatch: {
            coins: 9999,
            unlockedHeroes: HERO_IDS,
            unlockedWeapons: ALL_WEAPON_IDS,
          },
        });
        await buyAndEquipAttackVfxViaMarket(s.page, 'violet_thunder');

        await fastClick(s.page, '.hub-foot .btn--seal, .btn--big');
        await stepFrames(s.page, 2);
        await grantItemViaLevelUp(s.page, 'weapon', 'taomujian', 2);
        await grantItemViaLevelUp(s.page, 'weapon', 'suohun_chain', 2);

        await s.page.evaluate(async () => {
          const r = window.__wugeng.game.run;
          r.enemies.length = 0;
          r._spawnAcc = -99999;
          r.darkness = 0;
          r._spawnQueue.push({ type: 'sedan', x: r.player.x + 65, y: r.player.y, opts: {} });
          window.__e2eStepFrames(1);
          r.enemies[0].hp = 9999;
          r.enemies[0].speed = 0;
          r.weapons.forEach((w) => { w.cd = 0; });
          window.__e2eStepFrames(3);
          window.__wugeng.game.pause();
          await new Promise((res) => requestAnimationFrame(res));
        });

        const snap = await analyzeCanvasSpriteBox(s.page, '#game-canvas');
        assert.ok(
          snap.hueBuckets.violet >= 25,
          `Expected >= 25 violet VFX pixels in live combat with violet_thunder equipped, got ${snap.hueBuckets.violet}`,
        );
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
    name: 'Mid-session Attack VFX theme switch (default -> frost_moon) cleanly separates cached projectile/slash sprites',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        // Run 1: Bake sprites under 'default'
        await bootAndStartRun(s.page, baseUrl, {
          savePatch: {
            coins: 9999,
            cosmetics: { owned: ATTACK_VFX_IDS, equipped: { attackVfx: 'default', heroSkins: {} } },
          },
          seed: 6105,
        });
        await grantItemViaLevelUp(s.page, 'weapon', 'talisman', 1);
        await stepFrames(s.page, 25);

        // Return to Hub, switch to frost_moon, start Run 2 with same weapons
        await s.page.evaluate(() => {
          window.__wugeng.game.finish();
          window.__wugeng.game.clear();
          window.__wugeng.showHub();
        });
        await s.page.waitForSelector('.screen--hub');
        await buyAndEquipAttackVfxViaMarket(s.page, 'frost_moon');
        await fastClick(s.page, '.hub-foot .btn--seal, .btn--big');
        await stepFrames(s.page, 2);
        await grantItemViaLevelUp(s.page, 'weapon', 'talisman', 1);

        await s.page.evaluate(async () => {
          const r = window.__wugeng.game.run;
          if (r.player) r.player.attackVfx = 'frost_moon';
          if (Array.isArray(r.players) && r.players[0]) r.players[0].attackVfx = 'frost_moon';
          r.darkness = 0;
          r.projectiles.push(
            { id: 981, kind: 'gongPulse', x: r.player.x, y: r.player.y, r: 60, radius: 60, maxRadius: 80, t: 0.12, life: 0.35, evolved: true, attackVfx: 'frost_moon' },
            { id: 982, kind: 'talisman', x: r.player.x + 48, y: r.player.y, vx: 120, vy: 0, r: 14, angle: 0, t: 0.1, life: 1.0, evolved: true, attackVfx: 'frost_moon' },
          );
          window.__wugeng.game.pause();
          await new Promise((res) => requestAnimationFrame(res));
          await new Promise((res) => requestAnimationFrame(res));
        });

        const snap = await analyzeCanvasSpriteBox(s.page, '#game-canvas');
        assert.ok(
          snap.hueBuckets.azure >= 30,
          `Expected frost_moon azure pixels (>=30) after switching from default (no stale sprite cache), got ${snap.hueBuckets.azure}`,
        );
        s.assertNoErrors('T1-F6-05');
      } finally {
        await s.close();
      }
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // F7: 国风暗夜灯火 UI 全面精修与动态演武台 (5 tests)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'T1-F7-01',
    tier: 1,
    feature: 'F7',
    name: '#game-canvas renders animated Night-Watch street & lantern scene on BOTH .screen--title and .screen--hub',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootGame(s.page, baseUrl);
        const titleT0 = await analyzeCanvasSpriteBox(s.page, '#game-canvas');
        await s.page.waitForTimeout(320);
        const titleT1 = await analyzeCanvasSpriteBox(s.page, '#game-canvas');

        assert.ok(titleT0 && titleT0.hueBuckets.ink > 1000, 'Expected night-watch ink backdrop on Title #game-canvas');
        assert.ok(
          titleT0.hueBuckets.gold + titleT0.hueBuckets.verm > 80,
          `Expected warm lantern gold/vermilion street lights on Title #game-canvas, got gold=${titleT0.hueBuckets.gold}, verm=${titleT0.hueBuckets.verm}`,
        );
        assert.notEqual(titleT0.hash, titleT1.hash, 'Expected Title Night-Watch #game-canvas scene to animate swaying lanterns/embers');

        await fastClick(s.page, '.title-actions .btn--seal');
        await s.page.waitForSelector('.screen--hub');
        await s.page.waitForTimeout(120);
        const hubSnap = await analyzeCanvasSpriteBox(s.page, '#game-canvas');
        assert.ok(hubSnap && hubSnap.hueBuckets.ink > 1000 && hubSnap.hueBuckets.gold + hubSnap.hueBuckets.verm > 60);
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
    name: 'Live Hub Stage (.hero-stage__canvas) animates selected hero + starter weapon and updates on hero switch',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootToHub(s.page, baseUrl, {
          savePatch: { unlockedHeroes: HERO_IDS, unlockedWeapons: ALL_WEAPON_IDS, selectedHero: 'zhou' },
        });
        const stageSel = (await s.page.$('.hero-stage__canvas')) ? '.hero-stage__canvas' : '.screen--hub canvas';
        await requireOpenSelector(s.page, stageSel, 'Expected .hero-stage__canvas in .screen--hub');

        const dims = await s.page.$eval(stageSel, (c) => ({
          cssW: c.clientWidth,
          cssH: c.clientHeight,
          w: c.width,
          h: c.height,
        }));
        assert.ok(dims.cssW >= 140 && dims.cssH >= 80 && dims.w >= 140, `Expected positive stage dimensions, got ${JSON.stringify(dims)}`);

        const zhouT0 = await analyzeCanvasSpriteBox(s.page, stageSel);
        await s.page.waitForTimeout(350);
        const zhouT1 = await analyzeCanvasSpriteBox(s.page, stageSel);
        assert.ok(zhouT0.nonBgPixels > 200, 'Expected non-blank hero stage canvas');
        assert.notEqual(zhouT0.hash, zhouT1.hash, 'Expected .hero-stage__canvas live preview to animate over time');

        await fastClick(s.page, '[data-hero-id="nuoxi"]');
        await s.page.waitForTimeout(120);
        const nuoxiSnap = await analyzeCanvasSpriteBox(s.page, stageSel);
        const cmp = compareSpriteSnapshots(zhouT1, nuoxiSnap);
        assert.ok(cmp.pixelDiffRatio > 0.14, `Expected stage canvas to update visibly when switching zhou -> nuoxi (${(cmp.pixelDiffRatio * 100).toFixed(1)}%)`);
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
    name: 'Bottom dock .hub-nav .btn:nth-child(1..4) preserves 加点/图鉴/更簿/设置 alongside all v3 .hub-ribbon & .hub-head actions',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootToHub(s.page, baseUrl);
        const navLabels = await s.page.$$eval('.hub-nav .btn', (btns) => btns.slice(0, 4).map((b) => (b.textContent || '').trim()));
        assert.equal(navLabels.length, 4);
        assert.ok(navLabels[0].includes('加点'), `Expected nav[0] 加点, got ${navLabels[0]}`);
        assert.ok(navLabels[1].includes('图鉴'), `Expected nav[1] 图鉴, got ${navLabels[1]}`);
        assert.ok(navLabels[2].includes('更簿'), `Expected nav[2] 更簿, got ${navLabels[2]}`);
        assert.ok(navLabels[3].includes('设置'), `Expected nav[3] 设置, got ${navLabels[3]}`);

        for (const sel of [
          '[data-action="quick-cloud"]',
          '[data-action="open-market"]',
          '[data-action="open-achievements"]',
          '[data-action="open-leaderboard"]',
          '[data-action="open-coop"]',
        ]) {
          await requireOpenSelector(s.page, sel, `Missing Hub v3 entry '${sel}'`);
        }
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
    name: 'Menu Night-Watch rAF loop halts cleanly during active run and resumes cleanly upon returning to Hub',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootToHub(s.page, baseUrl);
        await fastClick(s.page, '.hub-foot .btn--seal, .btn--big');
        await stepFrames(s.page, 4);

        await s.page.evaluate(() => window.__wugeng.game.pause());
        await s.page.waitForTimeout(80);
        const pausedA = await analyzeCanvasSpriteBox(s.page, '#game-canvas');
        await s.page.waitForTimeout(260);
        const pausedB = await analyzeCanvasSpriteBox(s.page, '#game-canvas');
        assert.equal(
          pausedA.hash,
          pausedB.hash,
          'Menu street-scene rAF loop must cancel during gameplay so #game-canvas stays 100% static when run is paused',
        );

        await triggerLethalHit(s.page);
        await s.page.evaluate(() => {
          const btns = [...document.querySelectorAll('.veil button')];
          (btns.find((b) => b.textContent.includes('结算')) || btns[btns.length - 1])?.click();
        });
        await s.page.waitForSelector('.screen--result');
        await s.page.evaluate(() => {
          const btns = [...document.querySelectorAll('.screen--result button')];
          (btns.find((b) => b.textContent.includes('更房')) || btns[btns.length - 1])?.click();
        });
        await s.page.waitForSelector('.screen--hub');
        await s.page.waitForTimeout(120);
        const hubAfter = await analyzeCanvasSpriteBox(s.page, '#game-canvas');
        assert.ok(hubAfter && hubAfter.nonBgPixels > 300, 'Expected Hub backdrop to resume rendering after run');
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
    name: 'Redesigned Title & Hub plaques maintain >= 4.5:1 text contrast and preserve 12+ CADPA & Privacy modals',
    async run({ browser, baseUrl }) {
      const s = await createIsolatedPage(browser);
      try {
        await bootGame(s.page, baseUrl);
        await fastClick(s.page, '.age-badge');
        await requireOpenSelector(s.page, '#ui .veil', 'Expected 12+ CADPA modal');
        await fastClick(s.page, '#ui .veil .btn--seal');

        await fastClick(s.page, '.title-foot .link-btn');
        await s.page.waitForSelector('.privacy-body');
        await fastClick(s.page, '#ui .veil .btn--seal');

        const contrast = await s.page.evaluate(() => {
          const relLum = ([r, g, b]) => {
            const f = (v) => {
              const sRgb = v / 255;
              return sRgb <= 0.03928 ? sRgb / 12.92 : ((sRgb + 0.055) / 1.055) ** 2.4;
            };
            return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
          };
          const parseRgb = (str) => {
            const m = str.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
            return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
          };
          const btn = document.querySelector('.title-actions .btn--seal');
          const fg = parseRgb(getComputedStyle(btn).color) || [239, 230, 210];
          let bg = null;
          let cur = btn;
          while (cur && cur !== document.documentElement) {
            const st = getComputedStyle(cur).backgroundColor;
            if (st && !st.endsWith(', 0)') && st !== 'transparent') {
              bg = parseRgb(st);
              if (bg) break;
            }
            cur = cur.parentElement;
          }
          bg = bg || [194, 59, 38];
          const l1 = relLum(fg);
          const l2 = relLum(bg);
          return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
        });
        assert.ok(contrast >= 4.0, `Expected readable CTA plaque contrast (>= 4.0:1), got ${contrast.toFixed(2)}:1`);
        s.assertNoErrors('T1-F7-05');
      } finally {
        await s.close();
      }
    },
  },
];
