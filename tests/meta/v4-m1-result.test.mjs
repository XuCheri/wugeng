import test from 'node:test';
import assert from 'node:assert/strict';

import { createRun, stepRun, endRun } from '../../src/sim/run.js';
import { damageEnemy } from '../../src/sim/combat.js';
import { spawnEnemy } from '../../src/sim/enemies.js';
import { defaultSave } from '../../src/meta/save.js';
import { findNextUnlockGoal } from '../../src/meta/unlocks.js';
import { ACHIEVEMENT_IDS } from '../../src/meta/achievements.js';
import { HERO_SKINS, ATTACK_VFX_LIST } from '../../src/meta/cosmetics.js';

test('M1.5 结算统计：记录各兵刃伤害占比与 topWeapon，排除非兵刃大招充当头功兵刃', () => {
  const run = createRun({ heroId: 'zhou', seed: 42 });
  const e1 = spawnEnemy(run, 'paperkid', run.player.x + 80, run.player.y, { fixedHp: 5000 });
  const e2 = spawnEnemy(run, 'paperkid', run.player.x + 120, run.player.y, { fixedHp: 5000 });

  damageEnemy(run, e1, 200, 'gong', { noCrit: true, noProc: true, knock: 0 });
  damageEnemy(run, e1, 600, 'talisman', { noCrit: true, noProc: true, knock: 0 });
  damageEnemy(run, e2, 1200, 'ult', { noCrit: true, noProc: true, knock: 0 });

  const sum = endRun(run, false);
  assert.ok(sum.damageByWeapon.gong > 0);
  assert.ok(sum.damageByWeapon.talisman > sum.damageByWeapon.gong);
  assert.ok(sum.damageByWeapon.ult > sum.damageByWeapon.talisman);
  assert.ok(sum.topWeapon, '应计算头功兵刃');
  assert.equal(sum.topWeapon.id, 'talisman', '头功兵刃应取实际兵刃中伤害最高者（而非 ult）');
  assert.ok(sum.topWeapon.share > 0 && sum.topWeapon.share < 100, `占比应在 (0, 100) 内，实际 ${sum.topWeapon.share}`);
});

test('M1.5 连斩追踪：连续击杀递增 combo/maxCombo，超过 2.6 秒自动归零且保留 maxCombo', () => {
  const run = createRun({ heroId: 'zhou', seed: 77 });
  for (let i = 0; i < 4; i++) {
    const e = spawnEnemy(run, 'paperkid', run.player.x + 260 + i * 20, run.player.y, { fixedHp: 10 });
    damageEnemy(run, e, 50, 'gong', { noCrit: true, noProc: true, knock: 0 });
  }
  assert.equal(run.stats.combo, 4);
  assert.equal(run.stats.maxCombo, 4);
  assert.ok(run.stats.comboT > 2.5);

  // 推进 3 秒，连斩超时归零
  for (let i = 0; i < 180; i++) stepRun(run, {}, 1 / 60);
  assert.equal(run.stats.combo, 0, '超过 2.6 秒未击杀时当前连斩应归零');
  assert.equal(run.stats.maxCombo, 4, '最长连斩应保留历史峰值');

  const sum = endRun(run, false);
  assert.equal(sum.maxCombo, 4);
});

test('M1.5 距下一目标：优先选取最接近完成的解锁目标（英雄 > 功绩 > 已解锁英雄的鬼市衣冠）', () => {
  // 1. 全新存档（无进度）回退到阿绵（800 斩）
  const fresh = defaultSave();
  const g0 = findNextUnlockGoal(fresh);
  assert.ok(g0);
  assert.equal(g0.kind, 'hero');
  assert.equal(g0.id, 'mian');
  assert.equal(g0.have, 0);
  assert.equal(g0.need, 800);

  // 2. bestKills = 600（75%）时，同比例下英雄阿绵优先于 kills800 功绩
  const sHero = defaultSave();
  sHero.stats.bestKills = 600;
  sHero.stats.totalKills = 600;
  const g1 = findNextUnlockGoal(sHero);
  assert.equal(g1.kind, 'hero');
  assert.equal(g1.id, 'mian');
  assert.equal(g1.pct, 75);

  // 3. 功绩接近完成（bossKills3: 2/3 = 67%）优先于低进度铜钱衣冠
  const sAch = defaultSave();
  sAch.unlockedHeroes.push('mian');
  sAch.stats.totalBossKills = 2;
  sAch.coins = 100;
  const g2 = findNextUnlockGoal(sAch);
  assert.equal(g2.kind, 'achievement');
  assert.equal(g2.id, 'bossKills3');
  assert.equal(g2.title, '功绩 · 三斩夜主');
  assert.ok(g2.hint.includes('铜钱'));
  assert.equal(g2.pct, 67);

  // 4. 铜钱逼近已解锁英雄的鬼市皮肤（zhou_jade_watch 680 铜钱），且不推荐未解锁英雄皮肤
  const sCos = defaultSave();
  sCos.unlockedHeroes = ['zhou', 'mian'];
  sCos.coins = 600; // 600/680 = 88%
  const g3 = findNextUnlockGoal(sCos);
  assert.equal(g3.kind, 'cosmetic');
  assert.equal(g3.id, 'zhou_jade_watch');
  assert.equal(g3.pct, 88);

  // 5. 全部解锁与拥有时返回 null
  const sFull = defaultSave();
  sFull.unlockedHeroes = ['zhou', 'mian', 'daotong', 'yinyang', 'tiejiang', 'nuoxi', 'weier', 'qiansuanzi'];
  for (const id of ACHIEVEMENT_IDS) sFull.achievements[id] = 1;
  sFull.cosmetics.owned = [
    ...HERO_SKINS.filter((x) => x.unlock === 'shop').map((x) => x.id),
    ...ATTACK_VFX_LIST.filter((x) => x.unlock === 'shop').map((x) => x.id),
  ];
  assert.equal(findNextUnlockGoal(sFull), null);
});
