// 数值公式单元测试：经验曲线、伤害公式、冷却下限、四门流派、12+12 器物、12 敌人、精英词缀、更房价格与加成。
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  xpForLevel, computeDamage, damageTaken, cooldownMul, metaCost, META_COSTS, META_SHOP,
  metaBonusesFromLevels, enemyHpScale, enemySpeedScale, spawnRate, nightModifiers, ENDLESS, SPAWN,
  SCHOOL_TAGS, SCHOOL_TAG_IDS, SCHOOL_NAMES, WEAPONS, WEAPON_IDS, RELICS, RELIC_IDS,
  ENEMIES, ENEMY_IDS, REGULAR_ENEMY_IDS, ELITE_AFFIXES, ELITE_AFFIX_IDS, MINI_WARDERS,
  BOSS_AI, ENEMY_AI, ULT, SHRINE_KINDS, PLAYER_BASE,
} from '../../src/sim/balance.js';
import { totalXpToLevel } from '../../src/sim/xp.js';
import { createRun } from '../../src/sim/run.js';
import { damageEnemy } from '../../src/sim/combat.js';
import { spawnEnemy } from '../../src/sim/enemies.js';
import { relicEffect } from '../../src/sim/relics.js';

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} ≈ ${b}`);

test('经验曲线 XP(L) = 5 + 6(L−1) + 0.35(L−1)²', () => {
  near(xpForLevel(1), 5);
  near(xpForLevel(2), 11.35);
  near(xpForLevel(11), 100);
  near(xpForLevel(21), 265);
  const total = totalXpToLevel(33);
  assert.ok(total > 6700 && total < 6900, `total=${total}`);
});

test('伤害公式：增伤加算、暴击 ×2（或自定义暴伤）、开光乘算', () => {
  near(computeDamage(40, 0.5, false), 60);
  near(computeDamage(40, 0.5, true), 120);
  near(computeDamage(40, 0.5, true, 2), 240);
  near(computeDamage(10, 0.4 + 0.15, false, 1.5, 1.12 * 1.12), 10 * 1.55 * 1.5 * 1.2544);
  near(computeDamage(40, 0.5, true, 1, 1, 2.5), 150);
});

test('受到伤害 = max(1, 原始 − 护甲)', () => {
  assert.equal(damageTaken(10, 3), 7);
  assert.equal(damageTaken(3, 5), 1);
  assert.equal(damageTaken(1, 0), 1);
});

test('冷却下限默认 0.55，支持道法/命签下调下限', () => {
  near(cooldownMul(0), 1);
  near(cooldownMul(0.4), 0.6);
  near(cooldownMul(0.45), 0.55);
  near(cooldownMul(0.9), 0.55);
  near(cooldownMul(0.9, 0.42), 0.42);
  near(cooldownMul(0.9, 0.40), 0.40);
});

test('damageEnemy 按增伤 / 暴击结算并记录 maxHit', () => {
  const run = createRun({ seed: 3, meta: { dmgPct: 0.15 } });
  run.mods.critChance = 0;
  const e = spawnEnemy(run, 'lanternghost', 100, 0);
  e.hp = e.maxHp = 1000;
  const d1 = damageEnemy(run, e, 100, 'gong');
  assert.equal(d1, 115);
  run.mods.critChance = 1;
  const d2 = damageEnemy(run, e, 100, 'gong');
  assert.equal(d2, 230);
  assert.equal(run.stats.maxHit, 230);
  assert.ok(run.events.some((ev) => ev.type === 'hit' && ev.crit && ev.amount === 230));
});

test('12 武器与 12 法器：流派标签、配对双向对称、新增四法器数值', () => {
  assert.deepEqual(SCHOOL_TAG_IDS, ['zhenhun', 'daofa', 'zhizha', 'yangyan']);
  for (const t of SCHOOL_TAG_IDS) {
    assert.ok(SCHOOL_TAGS[t] && SCHOOL_NAMES[t]);
  }
  assert.equal(WEAPON_IDS.length, 12);
  assert.equal(RELIC_IDS.length, 12);
  assert.deepEqual(WEAPON_IDS.slice(0, 8), ['gong', 'lantern', 'talisman', 'brush', 'coinsword', 'paperman', 'firecracker', 'bell']);
  assert.deepEqual(WEAPON_IDS.slice(8), ['compass', 'soulbanner', 'bronze_mirror', 'paperhorse']);
  assert.deepEqual(RELIC_IDS.slice(0, 8), ['clapper', 'censer', 'cinnabar', 'inkstone', 'bagua', 'scissors', 'tinder', 'redstring']);
  assert.deepEqual(RELIC_IDS.slice(8), ['strawshoes', 'glutinous', 'fivecoins', 'soulwick']);

  for (const wid of WEAPON_IDS) {
    const w = WEAPONS[wid];
    assert.ok(Array.isArray(w.tags) && w.tags.length >= 1, `${wid} missing tags`);
    assert.ok(w.evoMult >= 1.85 && w.evoMult <= 2.30, `${wid} evoMult=${w.evoMult}`);
    assert.equal(RELICS[w.pair]?.pair, wid, `${wid} <-> ${w.pair} pair mismatch`);
  }

  near(relicEffect('clapper', 5).cdr, 0.4);
  assert.equal(relicEffect('scissors', 1).amount, 0);
  assert.equal(relicEffect('scissors', 2).amount, 1);
  assert.equal(relicEffect('scissors', 5).amount, 2);
  near(relicEffect('scissors', 5).dmgPct, 0.12);
  assert.equal(relicEffect('bagua', 5).armor, 5);
  assert.equal(relicEffect('bagua', 5).maxHp, 50);

  near(relicEffect('strawshoes', 5).speedPct, 0.30);
  near(relicEffect('strawshoes', 5).slowResist, 0.70);
  assert.equal(relicEffect('glutinous', 5).killHeal, 10);
  assert.ok(relicEffect('glutinous', 5).hurtInvuln > 0.15);
  near(relicEffect('fivecoins', 5).critDmg, 0.90);
  near(relicEffect('fivecoins', 5).coinPct, 0.50);
  near(relicEffect('soulwick', 5).lightPct, 0.40);
  near(relicEffect('soulwick', 5).ultChargePct, 0.50);
  near(relicEffect('soulwick', 5).ultCdRefund, 0.50);
});

test('12 敌人、5 精英词缀、小头目、大招与公平移速上限（F2 / F10）', () => {
  assert.equal(ENEMY_IDS.length, 12);
  assert.equal(REGULAR_ENEMY_IDS.length, 9);
  assert.ok(REGULAR_ENEMY_IDS.includes('suona') && REGULAR_ENEMY_IDS.includes('paperbride') && REGULAR_ENEMY_IDS.includes('cinder'));
  assert.deepEqual(ELITE_AFFIX_IDS, ['paper_armor', 'swift_step', 'soul_fire', 'mirror_twin', 'treasure_bearer']);
  assert.equal(MINI_WARDERS.length, 2);
  assert.deepEqual(SHRINE_KINDS, ['altar', 'trial', 'peddler']);
  assert.equal(ULT.cost, 100);
  assert.equal(ULT.max, 100);

  near(SPAWN.minuteSpeedGrowth, 0.032);
  near(SPAWN.speedGrowthCap, 1.35);
  near(enemySpeedScale(20), 1.35);
  assert.equal(ENEMIES.shade.speed, 72);
  near(nightModifiers(1).shadeSpeedMul, 1.12);
  near(ENEMY_AI.drowned.playerSlow, 0.80);
  near(ENEMY_AI.knockbackDecay, 0.008);
  near(BOSS_AI.youshen.enrageSpeedMul, 1.60);
  assert.equal(ENEMIES.youshen.speed, 58);
  assert.ok(ENEMIES.youshen.speed * BOSS_AI.youshen.enrageSpeedMul <= 98);
  assert.ok(ENEMIES.youshen.speed * nightModifiers(10).enemySpeedMul * BOSS_AI.youshen.enrageSpeedMul < PLAYER_BASE.speed);
  assert.ok(BOSS_AI.youshen.lungeSpeed >= 420);
});

test('更房价格 60/181/347/553/794，单项合计 1,935', () => {
  assert.deepEqual([1, 2, 3, 4, 5].map(metaCost), [60, 181, 347, 553, 794]);
  assert.equal(META_COSTS.reduce((a, b) => a + b, 0), 1935);
  assert.equal(metaCost(6), Infinity);
  assert.deepEqual(META_SHOP.map((x) => x.id), ['tizhi', 'lidao', 'jiaoli', 'yanli', 'wuxing', 'caiyun', 'jiyuan', 'huchi']);
});

test('更房加成 metaBonusesFromLevels', () => {
  assert.deepEqual(metaBonusesFromLevels({}), { maxHpPct: 0, dmgPct: 0, speedPct: 0, pickupPct: 0, xpPct: 0, coinPct: 0, freeRerolls: 0, armor: 0 });
  const full = metaBonusesFromLevels({ tizhi: 5, lidao: 5, jiaoli: 5, yanli: 5, wuxing: 5, caiyun: 5, jiyuan: 5, huchi: 5 });
  assert.deepEqual(full, { maxHpPct: 0.25, dmgPct: 0.15, speedPct: 0.15, pickupPct: 0.3, xpPct: 0.15, coinPct: 0.25, freeRerolls: 2, armor: 2 });
  const some = metaBonusesFromLevels({ jiyuan: 3, huchi: 2 });
  assert.equal(some.freeRerolls, 1);
  assert.equal(some.armor, 0);
});

test('敌人成长与刷怪公式', () => {
  near(enemyHpScale(0, 0), SPAWN.hpMul);
  near(enemyHpScale(5, 2) / enemyHpScale(5, 0), 1.3);
  assert.ok(enemyHpScale(5, 0) > enemyHpScale(0, 0));
  near(spawnRate(10), (SPAWN.rateA + SPAWN.rateB * 10 + SPAWN.rateC * 100) * SPAWN.rateMul);
  near(enemyHpScale(10, 0, 3) / enemyHpScale(10, 0, 0), ENDLESS.hpGrowth ** 3, 1e-9);
  const n3 = nightModifiers(3);
  assert.equal(n3.affixes.length, 3);
  near(n3.bunHealMul, 0.5);
});
