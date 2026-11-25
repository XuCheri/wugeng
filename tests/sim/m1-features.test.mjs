// M1 专项全覆盖单元测试（F1–F10 + 确定性与性能）：
// 覆盖防粘人物理、移速与冲锋预警、四路径自由开光、8 大经典神兵重做、+4/+4 新器物、
// 四门流派羁绊（2/4/6 件全验证）、18 道守夜命签、弃签/留签策略、香案/试炼碑/货郎奇遇、
// 新战术鬼祟/词缀/三英雄专属大招、多帧状态散列确定性与 300敌+400弹性能预算。

import test from 'node:test';
import assert from 'node:assert/strict';
import { SpatialHash } from '../../src/core/spatial-hash.js';
import {
  PLAYER_BASE, ENEMY_AI, BOSS_AI, WEAPONS, WEAPON_IDS, RELICS, RELIC_IDS, EVOLUTION, ULT, SHRINES, SPAWN, ENEMIES,
  DAMAGE, MAX_NIGHT, MINI_WARDERS, WATCH_DURATION, MAIN_DURATION, nightModifiers,
} from '../../src/sim/balance.js';
import {
  createRun, stepRun, chooseUpgrade, rerollChoices, banishChoice, toggleLockChoice,
  openChest, interactShrine, resolveShrine, dismissShrine, getEvolutionRecipe, canEvolve, endRun, DT,
} from '../../src/sim/run.js';
import { hurtPlayer, healPlayer, updatePlayer, recomputeMods, earnCoins, spendCoins } from '../../src/sim/player.js';
import { spawnEnemy, rebuildHash, updateEnemies, flushSpawnQueue } from '../../src/sim/enemies.js';
import { spawnBoss } from '../../src/sim/bosses.js';
import { damageEnemy, damageCircle, knockback, killEnemy, applySlow } from '../../src/sim/combat.js';
import {
  addOrUpgradeWeapon, getWeapon, evolveWeapon, weaponBaseDmg, weaponFullCooldown, updateWeapons,
} from '../../src/sim/weapons.js';
import { addOrUpgradeRelic } from '../../src/sim/relics.js';
import { updateProjectiles, processScheduled } from '../../src/sim/projectiles.js';
import { castUlt } from '../../src/sim/ultimate.js';
import { SYNERGIES, SYNERGY_TUNING, synergyStatMods, updateSynergyRuntime } from '../../src/sim/synergies.js';
import { BLESSINGS, BLESSING_IDS, BLESSING_TUNING, computeBlessingMods, applyBlessingChoice, generateBlessingChoices } from '../../src/sim/blessings.js';
import { generateChoices, describeUpgrade, describeEvolution } from '../../src/sim/levelup.js';
import { buildShrineOptions } from '../../src/sim/shrines.js';

// ───────────────────────── F1: 防粘人物理、受击无敌帧与分裂保护 ─────────────────────────

test('F1: hurtPlayer 赋予受击无敌帧（0.24s + 糯米加成）并仅在实际掉血时触发非 Boss 护体震退脉冲', () => {
  const run = createRun({ seed: 101 });
  const closeMob = spawnEnemy(run, 'paperkid', 22, 0);
  const boss = spawnBoss(run, 'horse');
  boss.x = 25;
  boss.y = 0;

  assert.equal(hurtPlayer(run, 0), 0);
  assert.equal(closeMob.kbx, 0, '未掉血不应触发护体脉冲');

  const d1 = hurtPlayer(run, 12);
  assert.equal(d1, 12);
  assert.ok(Math.abs(run.player.invulnT - PLAYER_BASE.hurtInvuln) < 1e-6);
  // 受击无敌窗口内后续碰撞不掉血
  assert.equal(hurtPlayer(run, 15), 0);
  // 近身小怪被向外震退，Boss 不受受击脉冲掀飞
  assert.ok(closeMob.kbx > 80, `closeMob.kbx=${closeMob.kbx}`);
  assert.equal(boss.kbx, 0);

  // 拥有 5 级糯米后无敌帧延长，且不覆盖复活的 3 秒长无敌
  for (let i = 0; i < 5; i++) addOrUpgradeRelic(run, 'glutinous');
  recomputeMods(run);
  run.player.invulnT = 0;
  hurtPlayer(run, 10);
  assert.ok(run.player.invulnT > PLAYER_BASE.hurtInvuln + 0.15);
  run.player.invulnT = 2.8;
  assert.equal(hurtPlayer(run, 10), 0);
  assert.equal(run.player.invulnT, 2.8);
});

test('F1: 连续软分离（0.85 半径）阻止群怪钻入玩家圆心粘死，同时保留接触判定与接触微回弹', () => {
  const run = createRun({ seed: 102 });
  run.weapons.length = 0;
  run.player.hp = run.player.maxHp = 5000;
  assert.equal(ENEMY_AI.playerSoftSepRatio, 0.85);
  assert.equal(ENEMY_AI.knockbackDecay, 0.008);

  // 单怪接触命中时获得向外回弹冲量（contactBounce）
  const striker = spawnEnemy(run, 'paperkid', 20, 0);
  updateEnemies(run, DT);
  assert.ok(striker.kbx > 40, `接触攻击者应获得外弹冲量: kbx=${striker.kbx}`);

  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    spawnEnemy(run, 'shade', Math.cos(a) * 32, Math.sin(a) * 32);
  }
  const hpBefore = run.player.hp;
  for (let f = 0; f < 90; f++) {
    stepRun(run, { moveX: 0, moveY: 0 }, DT);
  }
  assert.ok(run.player.hp < hpBefore, '软分离不应使玩家永久免伤');
  for (const e of run.enemies) {
    const d = Math.hypot(e.x - run.player.x, e.y - run.player.y);
    assert.ok(d >= e.r + run.player.r * 0.72, `enemy collapsed into player center: d=${d}`);
  }
});

test('F1: 纸轿子（sedan）死亡分裂 4 童子带 0.40s 攻击保护与外扩击退冲量；暴击击退 ×1.35', () => {
  const run = createRun({ seed: 103 });
  const sedan = spawnEnemy(run, 'sedan', 18, 0);
  rebuildHash(run);
  killEnemy(run, sedan);
  flushSpawnQueue(run);
  const kids = run.enemies.filter((e) => !e.dead && e.type === 'paperkid');
  assert.equal(kids.length, 4);
  for (const k of kids) {
    assert.ok(Math.abs(k.atkT - 0.40) < 1e-6);
    assert.ok(Math.hypot(k.kbx, k.kby) > 100);
  }

  const eNorm = spawnEnemy(run, 'lanternghost', 80, 0);
  const eCrit = spawnEnemy(run, 'lanternghost', 80, 40);
  eNorm.hp = eNorm.maxHp = 5000;
  eCrit.hp = eCrit.maxHp = 5000;
  run.mods.critChance = 0;
  damageEnemy(run, eNorm, 20, 'gong', { originX: 0, originY: 0 });
  run.mods.critChance = 1;
  damageEnemy(run, eCrit, 20, 'gong', { originX: 0, originY: 40 });
  assert.ok(Math.abs(eCrit.kbx / eNorm.kbx - 1.35) < 0.02, `ratio=${eCrit.kbx / eNorm.kbx}`);
});

// ───────────────────────── F2: 公平移速曲线与夜色预警走廊 ─────────────────────────

test('F2: 移速上限与影祟降速、黄皮子解耦扑击（255px/s, 0.72s, 175px）与纸马/夜游神 P3 预警走廊', () => {
  assert.equal(SPAWN.minuteSpeedGrowth, 0.032);
  assert.equal(SPAWN.speedGrowthCap, 1.35);
  assert.equal(ENEMIES.shade.speed, 72);
  assert.ok(Math.abs(nightModifiers(1).shadeSpeedMul - 1.12) < 1e-9);
  assert.equal(ENEMY_AI.weasel.dashSpeed, 255);
  assert.equal(ENEMY_AI.weasel.pause, 0.72);
  assert.equal(ENEMY_AI.weasel.triggerDist, 175);
  assert.equal(ENEMY_AI.drowned.playerSlow, 0.80);
  assert.equal(BOSS_AI.youshen.enrageSpeedMul, 1.60);

  // SpatialHash.nearest(pad=48) 跨格命中大体型 Boss
  const sh = new SpatialHash(64, 12);
  const bigBoss = { id: 1, x: 66, y: 10, r: 40, dead: false };
  sh.insert(bigBoss);
  assert.equal(sh.nearest(60, 10, 20, []), bigBoss);

  // 黄皮子预警走廊与定身打断
  const rEarly = createRun({ seed: 201 });
  rEarly.weapons.length = 0;
  rEarly.player.invulnT = 999;
  const wEarly = spawnEnemy(rEarly, 'weasel', 120, 0);
  updateEnemies(rEarly, DT);
  assert.equal(wEarly.state, 'pause');
  assert.ok(wEarly.telegraphProgress > 0 && wEarly.telegraphLen > 120 && wEarly.telegraphWidth === wEarly.r * 2);
  assert.ok(Number.isFinite(wEarly.telegraphX) && Number.isFinite(wEarly.telegraphY));
  wEarly.stunT = 0.5;
  updateEnemies(rEarly, DT);
  assert.equal(wEarly.state, 'move');
  assert.equal(wEarly.telegraphProgress, 0);

  // 对比 0 分钟与 9 分钟黄皮子扑击位移完全一致（与分钟移速成长解耦）
  const measureDashStep = (minutes) => {
    const r = createRun({ seed: 202 });
    r.weapons.length = 0;
    r.time = minutes * 60;
    r.player.invulnT = 999;
    const w = spawnEnemy(r, 'weasel', 120, 0);
    w.state = 'dash';
    w.stateT = 0.4;
    w.dx = -1;
    w.dy = 0;
    const x0 = w.x;
    updateEnemies(r, DT);
    return x0 - w.x;
  };
  assert.ok(Math.abs(measureDashStep(0) - measureDashStep(9)) < 1e-6);

  // 水鬼 0.80 减速 + 草鞋减速抗性
  const rSlow = createRun({ seed: 203 });
  rSlow.weapons.length = 0;
  spawnEnemy(rSlow, 'drowned', 20, 0);
  updateEnemies(rSlow, DT);
  assert.equal(rSlow._auraSlow, 0.80);
  stepRun(rSlow, { moveX: 1, moveY: 0 }, DT);
  const moveNoShoes = rSlow.player.x;

  const rShoes = createRun({ seed: 203 });
  rShoes.weapons.length = 0;
  for (let i = 0; i < 5; i++) addOrUpgradeRelic(rShoes, 'strawshoes');
  recomputeMods(rShoes);
  spawnEnemy(rShoes, 'drowned', 20, 0);
  updateEnemies(rShoes, DT);
  stepRun(rShoes, { moveX: 1, moveY: 0 }, DT);
  assert.ok(rShoes.player.x > moveNoShoes * 1.4);

  // 纸马将军与夜游神 P3 挥戟预警字段
  const rBoss = createRun({ seed: 204 });
  rBoss.weapons.length = 0;
  rBoss.player.invulnT = 999;
  const horse = spawnBoss(rBoss, 'horse');
  horse.x = 180;
  horse.y = 0;
  horse.stateT = 0;
  updateEnemies(rBoss, DT);
  assert.equal(horse.state, 'windup');
  assert.ok(horse.telegraphProgress > 0 && horse.telegraphLen > 200);

  const rYs = createRun({ seed: 205 });
  rYs.weapons.length = 0;
  rYs.player.invulnT = 999;
  const ys = spawnBoss(rYs, 'youshen', { final: true });
  ys.x = 180;
  ys.y = 0;
  ys.hp = Math.floor(ys.maxHp * 0.25);
  let sawWindup = false;
  let sawLunge = false;
  for (let i = 0; i < 240; i++) {
    updateEnemies(rYs, DT);
    if (ys.state === 'windup' && ys.telegraphProgress > 0 && ys.telegraphLen > 180) sawWindup = true;
    if (ys.state === 'lunge' && ys.telegraphProgress === 0) sawLunge = true;
  }
  assert.ok(sawWindup && sawLunge);
});

// ───────────────────────── F3: 四路径自由开光、供盒自选与巡更小头目 ─────────────────────────

test('F3: getEvolutionRecipe 四路径（paired / resonance / maxRelic / altar）、×1.18 精通、供盒自选与 150s/360s 必掉供盒小头目', () => {
  // 1) resonance + 本命补齐 ×1.18 精通
  const rRes = createRun({ seed: 301, heroId: 'zhou' });
  while (addOrUpgradeWeapon(rRes, 'gong'));
  addOrUpgradeWeapon(rRes, 'bell');
  addOrUpgradeRelic(rRes, 'strawshoes');
  recomputeMods(rRes);
  const gongRes = getWeapon(rRes, 'gong');
  assert.deepEqual(getEvolutionRecipe(rRes, gongRes), { ok: true, recipe: 'resonance', tag: 'zhenhun' });
  assert.equal(canEvolve(rRes, gongRes), true);
  evolveWeapon(rRes, 'gong');
  const dmgWithoutPair = weaponBaseDmg(gongRes, rRes);
  addOrUpgradeRelic(rRes, 'clapper');
  const dmgWithPair = weaponBaseDmg(gongRes, rRes);
  assert.ok(Math.abs(dmgWithPair / dmgWithoutPair - EVOLUTION.pairedMasteryMul) < 1e-6);

  // 2) maxRelic
  const rMax = createRun({ seed: 302, heroId: 'zhou' });
  while (addOrUpgradeWeapon(rMax, 'gong'));
  for (let i = 0; i < 5; i++) addOrUpgradeRelic(rMax, 'censer');
  recomputeMods(rMax);
  assert.deepEqual(getEvolutionRecipe(rMax, getWeapon(rMax, 'gong')), { ok: true, recipe: 'maxRelic' });

  // 3) altar
  const rAltar = createRun({ seed: 303, heroId: 'zhou' });
  while (addOrUpgradeWeapon(rAltar, 'gong'));
  getWeapon(rAltar, 'gong').altarReady = true;
  assert.deepEqual(getEvolutionRecipe(rAltar, getWeapon(rAltar, 'gong')), { ok: true, recipe: 'altar' });

  // 4) chestChoices + openChest 自选与单参默认 + +50 大招气 + r=180 清弹无伤推开 + evolve 事件
  const rChest = createRun({ seed: 304, heroId: 'zhou' });
  while (addOrUpgradeWeapon(rChest, 'gong'));
  while (addOrUpgradeWeapon(rChest, 'talisman'));
  addOrUpgradeRelic(rChest, 'clapper');
  addOrUpgradeRelic(rChest, 'cinnabar');
  recomputeMods(rChest);
  rChest.player.ult = 10;
  rChest.projectiles.push({ id: 999, kind: 'enemyBullet', x: 150, y: 0, r: 6, vx: 0, vy: 0, t: 0, life: 5, dmg: 10 });
  const nearMob = spawnEnemy(rChest, 'paperkid', 40, 0);
  const hpBefore = nearMob.hp;
  rChest._pendingChests = 2;
  stepRun(rChest, {}, DT);
  assert.equal(rChest.status, 'chest');
  assert.equal(rChest.chestChoices.length, 2);
  const res1 = openChest(rChest, 'talisman');
  assert.equal(res1.evolved, 'talisman');
  assert.equal(rChest.player.ult, 60);
  assert.ok(!rChest.projectiles.some((p) => p.kind === 'enemyBullet'));
  assert.equal(nearMob.hp, hpBefore);
  assert.ok(nearMob.kbx > 100);
  // 第二个供盒用 1 参调用默认开光剩余的 gong
  assert.equal(rChest.status, 'chest');
  const res2 = openChest(rChest);
  assert.equal(res2.evolved, 'gong');
  stepRun(rChest, {}, DT);
  assert.ok(rChest.events.some((e) => e.type === 'evolve' && e.weaponId === 'talisman' && e.recipe === 'paired'));

  // 5) 前两名巡更小头目击杀必掉供盒
  const rWarder = createRun({ seed: 305 });
  rWarder.player.invulnT = 999;
  rWarder.time = MINI_WARDERS[0].time - 0.01;
  stepRun(rWarder, {}, DT);
  const w150 = rWarder.enemies.find((e) => e.warder);
  assert.ok(w150 && w150.chest);
  killEnemy(rWarder, w150);
  assert.ok(rWarder.pickups.some((p) => p.kind === 'chest'));

  rWarder.pickups.length = 0;
  rWarder._pendingBlessings = 0;
  rWarder.status = 'playing';
  rWarder.time = MINI_WARDERS[1].time - 0.01;
  stepRun(rWarder, {}, DT);
  const w360 = rWarder.enemies.find((e) => e.warder && !e.dead);
  assert.ok(w360 && w360.chest);
  killEnemy(rWarder, w360);
  assert.ok(rWarder.pickups.some((p) => p.kind === 'chest'));
});

// ───────────────────────── F4 & F5: 12 武器开光重做与 +4/+4 新器物 ─────────────────────────

test('F4: 经典 8 武器开光质变（全局 0.82 急速、五更鸣锣聚怪易伤清弹、长明灯跨武器阳炎爆与六叠爆燃、天师符阵四雷、泼墨山河、七星回旋七剑裂阵、纸扎仪仗拦弹铁骑、满堂红六莲余烬、千铃 32 裂与孤王四叠 +15% 回响）', () => {
  assert.deepEqual(WEAPONS.firecracker.count, [1, 1, 2, 2, 3]);

  // 1) 五更鸣锣：0.82 急速 + 聚怪 + Boss 易伤 + 第三响清弹
  const rGong = createRun({ seed: 401, heroId: 'zhou' });
  const wGong = getWeapon(rGong, 'gong');
  while (addOrUpgradeWeapon(rGong, 'gong'));
  addOrUpgradeRelic(rGong, 'clapper');
  recomputeMods(rGong);
  const cdBefore = weaponFullCooldown(rGong, wGong);
  evolveWeapon(rGong, 'gong');
  assert.ok(Math.abs(weaponFullCooldown(rGong, wGong) / cdBefore - 0.82) < 1e-6);
  const pullMob = spawnEnemy(rGong, 'lanternghost', 140, 0);
  pullMob.hp = pullMob.maxHp = 9999;
  const boss1 = spawnBoss(rGong, 'horse');
  boss1.x = 120;
  boss1.y = 0;
  rGong.projectiles.push({ id: 888, kind: 'enemyBullet', x: 150, y: 0, r: 6, vx: 0, vy: 0, t: 0, life: 9, dmg: 5 });
  wGong.cd = 0;
  rebuildHash(rGong);
  updateWeapons(rGong, DT);
  assert.ok(pullMob.kbx < 0, '五更鸣锣前两响向内聚怪');
  for (let i = 0; i < 40; i++) {
    updateWeapons(rGong, DT);
    updateProjectiles(rGong, DT);
  }
  assert.ok(boss1.vulnT > 0);
  assert.ok(!rGong.projectiles.some((p) => p.id === 888));

  // 2) 长明灯：0.25s 双莲 + +25% 光照 + 跨武器阳炎印记爆裂 + 6 叠 Boss 爆燃
  const rLan = createRun({ seed: 402, heroId: 'zhou' });
  rLan.weapons.length = 0;
  while (addOrUpgradeWeapon(rLan, 'lantern'));
  addOrUpgradeRelic(rLan, 'censer');
  recomputeMods(rLan);
  const lightBefore = rLan.mods.lightRadius;
  evolveWeapon(rLan, 'lantern');
  recomputeMods(rLan);
  assert.equal(WEAPONS.lantern.evo.tick, 0.25);
  assert.ok(rLan.mods.lightRadius >= Math.round(lightBefore * 1.24));
  const fodder = spawnEnemy(rLan, 'lanternghost', 50, 0);
  fodder.hp = fodder.maxHp = 5000;
  const bossLan = spawnBoss(rLan, 'umbrella');
  bossLan.x = 70;
  bossLan.y = 0;
  rebuildHash(rLan);
  let sawFlare = false;
  for (let tick = 0; tick < 6; tick++) {
    getWeapon(rLan, 'lantern').cd = 0;
    updateWeapons(rLan, DT);
    processScheduled(rLan, 0);
    if (rLan.events.some((ev) => ev.type === 'explosion' && ev.kind === 'lanternFlare')) sawFlare = true;
  }
  assert.ok(sawFlare);
  rLan.events.length = 0;
  damageEnemy(rLan, fodder, 99999, 'gong');
  processScheduled(rLan, 0);
  assert.ok(rLan.events.some((ev) => ev.type === 'explosion' && ev.kind === 'yangyanBurst'));

  // 3) 天师符阵：+2 符数 + 孤立 Boss 四落神雷 + talismanChain
  const rTal = createRun({ seed: 403, heroId: 'daotong' });
  while (addOrUpgradeWeapon(rTal, 'talisman'));
  addOrUpgradeRelic(rTal, 'cinnabar');
  evolveWeapon(rTal, 'talisman');
  recomputeMods(rTal);
  const soloBoss = spawnBoss(rTal, 'horse');
  soloBoss.x = 90;
  soloBoss.y = 0;
  soloBoss.hp = soloBoss.maxHp = 999999;
  getWeapon(rTal, 'talisman').cd = 0;
  rebuildHash(rTal);
  updateWeapons(rTal, DT);
  assert.equal(rTal.projectiles.filter((p) => p.kind === 'talisman').length, 6);
  let sawArray = false;
  let sawTalismanChain = false;
  for (let i = 0; i < 120; i++) {
    rTal.player.invulnT = 99;
    stepRun(rTal, {}, DT);
    if (rTal.projectiles.some((p) => p.kind === 'talismanArray')) sawArray = true;
    if (rTal.projectiles.some((p) => p.kind === 'talismanChain')) sawTalismanChain = true;
  }
  assert.ok(sawArray && sawTalismanChain);

  // 4) 泼墨山河（360° + inkWave + r=78 墨河）、七星剑阵（7 剑回旋 + 第7击裂阵）、满堂红（6莲+余烬）
  const rMix = createRun({ seed: 404, heroId: 'zhou' });
  rMix.weapons.length = 0;
  for (const wid of ['brush', 'coinsword', 'firecracker']) {
    while (addOrUpgradeWeapon(rMix, wid));
    addOrUpgradeRelic(rMix, WEAPONS[wid].pair);
    evolveWeapon(rMix, wid);
  }
  recomputeMods(rMix);
  const dummy = spawnBoss(rMix, 'umbrella');
  dummy.x = 100;
  dummy.y = 0;
  dummy.hp = dummy.maxHp = 999999;
  for (let m = 0; m < 6; m++) {
    const mob = spawnEnemy(rMix, 'sedan', 85 + m * 12, (m - 3) * 8);
    mob.hp = mob.maxHp = 50000;
  }
  for (const w of rMix.weapons) w.cd = 0;
  let sawInkWave = false;
  let sawInkRiver = false;
  let sawReturningSword = false;
  let sawStarCleave = false;
  let sawLotus = false;
  let sawEmber = false;
  for (let i = 0; i < 90; i++) {
    rMix.player.invulnT = 99;
    stepRun(rMix, {}, DT);
    if (rMix.projectiles.some((p) => p.kind === 'inkWave')) sawInkWave = true;
    if (rMix.projectiles.some((p) => p.kind === 'inkPool' && p.subKind === 'inkRiver' && p.radius >= 78)) sawInkRiver = true;
    if (rMix.projectiles.some((p) => p.kind === 'coinsword' && p.evolved && p.returning)) sawReturningSword = true;
    if (rMix.events.some((ev) => ev.type === 'explosion' && ev.kind === 'starCleave')) sawStarCleave = true;
    if (rMix.events.some((ev) => ev.type === 'explosion' && ev.kind === 'firecrackerLotus')) sawLotus = true;
    if (rMix.projectiles.some((p) => p.kind === 'inkPool' && p.subKind === 'emberZone')) sawEmber = true;
  }
  assert.ok(sawInkWave && sawInkRiver && sawReturningSword && sawStarCleave && sawLotus && sawEmber);

  // 5) 千铃引魂：孤立 Boss 4 叠递增 +15% 摄魂回响 & 群怪最多 32 裂
  const rBell = createRun({ seed: 406, heroId: 'zhou' });
  rBell.weapons.length = 0;
  while (addOrUpgradeWeapon(rBell, 'bell'));
  addOrUpgradeRelic(rBell, 'redstring');
  evolveWeapon(rBell, 'bell');
  recomputeMods(rBell);
  rBell.mods.critChance = 0;
  const bellBoss = spawnBoss(rBell, 'horse');
  bellBoss.x = 120;
  bellBoss.y = 0;
  bellBoss.hp = bellBoss.maxHp = 999999;
  getWeapon(rBell, 'bell').cd = 0;
  rebuildHash(rBell);
  updateWeapons(rBell, DT);
  assert.equal(rBell._scheduled.filter((s) => s.type === 'soulEcho').length, 4);
  const echoes = rBell._scheduled.filter((s) => s.type === 'soulEcho').map((s) => s.dmg);
  assert.ok(echoes[3] > echoes[2] && echoes[2] > echoes[1] && echoes[1] > echoes[0]);

  // 6) 纸扎仪仗：内卫拦弹 + 320px/s 红衣纸骑冲阵
  const rPaper = createRun({ seed: 405, heroId: 'mian' });
  while (addOrUpgradeWeapon(rPaper, 'paperman'));
  addOrUpgradeRelic(rPaper, 'scissors');
  evolveWeapon(rPaper, 'paperman');
  recomputeMods(rPaper);
  assert.equal(WEAPONS.paperman.evo.cavalrySpeed, 320);
  const farFoe = spawnEnemy(rPaper, 'lanternghost', 360, 0);
  farFoe.hp = farFoe.maxHp = 5000;
  stepRun(rPaper, {}, DT);
  const guard = rPaper.projectiles.find((p) => p.kind === 'paperman' && p.role === 'guard');
  rPaper.projectiles.push({ id: 777, kind: 'enemyBullet', x: guard.x, y: guard.y, r: 5, vx: 0, vy: 0, t: 0, life: 5, dmg: 10 });
  for (let i = 0; i < 75; i++) stepRun(rPaper, {}, DT);
  assert.ok(!rPaper.projectiles.some((p) => p.id === 777));
  assert.ok(farFoe.hp < 5000);
});

test('F4 & F5: 全部 12 武器发射 fire 事件、+4 新武器与 +4 新法器（糯米回血、五帝钱暴伤加钱、引魂灯芯大招减冷却）', () => {
  const seenFire = new Set();
  for (const wid of WEAPON_IDS) {
    const r = createRun({ seed: 510 });
    r.weapons.length = 0;
    while (addOrUpgradeWeapon(r, wid));
    addOrUpgradeRelic(r, WEAPONS[wid].pair);
    evolveWeapon(r, wid);
    recomputeMods(r);
    const foe = spawnEnemy(r, 'sedan', 55, 0);
    foe.hp = foe.maxHp = 50000;
    for (const w of r.weapons) w.cd = 0;
    for (let i = 0; i < 25; i++) {
      r.player.invulnT = 99;
      stepRun(r, {}, DT);
      for (const ev of r.events) if (ev.type === 'fire') seenFire.add(ev.weaponId);
    }
  }
  assert.equal(seenFire.size, WEAPON_IDS.length, `期望全部 ${WEAPON_IDS.length} 把武器均发出 fire 事件，实得: ${[...seenFire]}`);

  // 招魂幡破伞盾 + 魂障免伤、照妖铜镜焚弹叠伤、五帝钱加钱、糯米击杀回血、引魂灯芯返还冷却
  const run = createRun({ seed: 501, heroId: 'zhou' });
  run.weapons.length = 0;
  for (const wid of ['compass', 'soulbanner', 'bronze_mirror', 'paperhorse']) {
    while (addOrUpgradeWeapon(run, wid));
    evolveWeapon(run, wid, 'paired');
  }
  while (addOrUpgradeRelic(run, 'glutinous'));
  while (addOrUpgradeRelic(run, 'fivecoins'));
  while (addOrUpgradeRelic(run, 'soulwick'));
  recomputeMods(run);

  // 五帝钱：暴伤提升 + 铜钱加成
  assert.ok(run.mods.critMult >= 2.9);
  const gained = earnCoins(run, 10, true);
  assert.equal(gained, 15);

  // 糯米：击杀积分累积回血
  run.player.hp = 50;
  for (let k = 0; k < 4; k++) {
    const b = spawnBoss(run, 'horse');
    killEnemy(run, b);
  }
  assert.ok(run.player.hp > 50, '糯米法器应在累积击杀后自动回复生命');

  // 招魂幡贯穿伞盾 + 魂障抵伤
  const umb = spawnBoss(run, 'umbrella');
  umb.state = 'shield';
  umb.x = 75;
  umb.y = 0;
  umb.hp = umb.maxHp = 50000;
  run.mods.critChance = 0;
  const dNormal = damageEnemy(run, umb, 100, 'gong', { knock: 0 });
  const dBanner = damageEnemy(run, umb, 100, 'soulbanner', { armorBreak: true, knock: 0 });
  assert.ok(dBanner > dNormal * 2.5);

  run.player.soulBarrier = 1;
  run.player.invulnT = 0;
  const hp0 = run.player.hp;
  assert.equal(hurtPlayer(run, 30), 0);
  assert.equal(run.player.hp, hp0);
  assert.equal(run.player.soulBarrier, 0);

  // 照妖铜镜焚弹 + 叠层增伤
  for (const w of run.weapons) w.cd = 0;
  run.projectiles.push({ id: 666, kind: 'enemyBullet', x: 45, y: 0, r: 6, vx: 0, vy: 0, t: 0, life: 5, dmg: 10 });
  for (let i = 0; i < 20; i++) {
    run.player.invulnT = 99;
    stepRun(run, {}, DT);
  }
  assert.ok(!run.projectiles.some((p) => p.id === 666));
  assert.ok(umb._mirrorStacks >= 2);

  // 引魂灯芯 5 级：释放大招返还 50% 武器冷却
  const comp = getWeapon(run, 'compass');
  const fullCd = weaponFullCooldown(run, comp);
  comp.cd = fullCd;
  run.player.ult = ULT.cost;
  assert.equal(castUlt(run), true);
  assert.ok(Math.abs(comp.cd - fullCd * 0.5) < 1e-5);
});

// ───────────────────────── F6: 四门流派羁绊全验证 ─────────────────────────

test('F6: 四门流派（镇魂/道法/纸扎/阳炎）2/4/6 件阶梯激活、不重复触发 synergyUp 及专属运行时效果', () => {
  // 1) 道法 2/4/6 + 暴击掌心雷 + 防刷屏 synergyUp
  const rDao = createRun({ seed: 601, heroId: 'daotong' });
  addOrUpgradeWeapon(rDao, 'coinsword');
  recomputeMods(rDao);
  recomputeMods(rDao);
  assert.equal(rDao.events.filter((e) => e.type === 'synergyUp' && e.tag === 'daofa' && e.tier === 2).length, 1);
  addOrUpgradeWeapon(rDao, 'compass');
  addOrUpgradeWeapon(rDao, 'bronze_mirror');
  addOrUpgradeRelic(rDao, 'cinnabar');
  addOrUpgradeRelic(rDao, 'bagua');
  recomputeMods(rDao);
  assert.equal(rDao.synergies.counts.daofa, 6);
  assert.equal(rDao.mods.cooldownFloor, 0.42);
  assert.equal(rDao.mods.bonusPierce, 2);
  const foeDao = spawnEnemy(rDao, 'sedan', 80, 0);
  foeDao.hp = foeDao.maxHp = 5000;
  rebuildHash(rDao);
  rDao.mods.critChance = 1;
  damageEnemy(rDao, foeDao, 40, 'talisman');
  assert.ok(rDao.projectiles.some((p) => p.kind === 'thunderBolt'));

  // 2) 镇魂 6 件自动敲响镇煞锣清弹
  const rZhen = createRun({ seed: 602, heroId: 'zhou' });
  addOrUpgradeWeapon(rZhen, 'bell');
  addOrUpgradeWeapon(rZhen, 'soulbanner');
  addOrUpgradeRelic(rZhen, 'clapper');
  addOrUpgradeRelic(rZhen, 'strawshoes');
  addOrUpgradeRelic(rZhen, 'glutinous');
  recomputeMods(rZhen);
  assert.equal(rZhen.synergies.counts.zhenhun, 6);
  rZhen.projectiles.push({ id: 555, kind: 'enemyBullet', x: 40, y: 0, r: 6, vx: 0, vy: 0, t: 0, life: 5, dmg: 10 });
  rZhen._zhenhunGongT = 0.01;
  rebuildHash(rZhen);
  updateSynergyRuntime(rZhen, 0.05);
  updateProjectiles(rZhen, DT);
  assert.ok(!rZhen.projectiles.some((p) => p.id === 555));

  // 3) 纸扎 6 件：剪纸成兵自爆纸童 + 纸裂流血
  const rZhi = createRun({ seed: 603, heroId: 'mian' });
  addOrUpgradeWeapon(rZhi, 'brush');
  addOrUpgradeWeapon(rZhi, 'paperhorse');
  addOrUpgradeRelic(rZhi, 'inkstone');
  addOrUpgradeRelic(rZhi, 'scissors');
  addOrUpgradeRelic(rZhi, 'soulwick');
  recomputeMods(rZhi);
  assert.equal(rZhi.synergies.counts.zhizha, 6);
  const foeZhi = spawnEnemy(rZhi, 'sedan', 80, 0);
  foeZhi.hp = foeZhi.maxHp = 5000;
  rebuildHash(rZhi);
  rZhi._zhizhaImpT = 0.01;
  updateSynergyRuntime(rZhi, 0.05);
  assert.ok(rZhi.projectiles.some((p) => p.kind === 'paperman' && p.mode === 'imp'));
  damageEnemy(rZhi, foeZhi, 30, 'brush');
  assert.ok(foeZhi.bleedT > 0);

  // 4) 阳炎 6 件：灼烧减速 + 燃尽爆裂
  const rYang = createRun({ seed: 604, heroId: 'zhou' });
  rYang.weapons.length = 0;
  addOrUpgradeWeapon(rYang, 'lantern');
  addOrUpgradeWeapon(rYang, 'firecracker');
  addOrUpgradeWeapon(rYang, 'bronze_mirror');
  addOrUpgradeRelic(rYang, 'censer');
  addOrUpgradeRelic(rYang, 'tinder');
  addOrUpgradeRelic(rYang, 'fivecoins');
  recomputeMods(rYang);
  assert.equal(rYang.synergies.counts.yangyan, 6);
  const foeYang = spawnEnemy(rYang, 'lanternghost', 60, 0);
  foeYang.hp = foeYang.maxHp = 500;
  damageEnemy(rYang, foeYang, 20, 'firecracker');
  assert.ok(foeYang.burnT > 0 && foeYang.slowT > 0);
  killEnemy(rYang, foeYang);
  assert.ok(rYang._scheduled.some((s) => s.explosionKind === 'yangyanBurst'));
});

// ───────────────────────── F7 & F8: 18 守夜命签与弃签/留签 ─────────────────────────

test('F7 & F8: 18 命签全表、四次换更（120/240/360/480s）触发与 602s 跳转保护、弃签永久移除与留签跨轮保留', () => {
  assert.equal(BLESSING_IDS.length, 18);
  assert.equal(BLESSING_IDS.filter((k) => BLESSINGS[k].tier === 'auspicious').length, 12);
  assert.equal(BLESSING_IDS.filter((k) => BLESSINGS[k].tier === 'cursed').length, 6);
  for (const wid of WEAPON_IDS) assert.ok(describeEvolution(wid).name && describeEvolution(wid).desc);
  for (const rid of RELIC_IDS) assert.ok(describeUpgrade({ kind: 'relic', id: rid, level: 1, isNew: true }).desc);

  // 逐一验证全部 18 张命签均可正常挂载且不占 4+4 器物槽
  const rAllB = createRun({ seed: 700 });
  for (const bid of BLESSING_IDS) {
    assert.equal(applyBlessingChoice(rAllB, bid, { recomputeMods, earnCoins }), true);
  }
  assert.equal(rAllB.weapons.length, 1);
  assert.equal(rAllB.relics.length, 0);
  assert.equal(rAllB.blessings.length, 18);

  // 验证四个换更节点（WATCH_DURATION × 1..4）依次触发命签
  const run = createRun({ seed: 701, heroId: 'zhou' });
  for (const w of [1, 2, 3, 4]) {
    const boundary = w * WATCH_DURATION;
    run.time = boundary - 0.01;
    run.player.invulnT = 999;
    stepRun(run, {}, DT);
    assert.equal(run.status, 'levelup');
    assert.equal(run.choiceMode, 'blessing');
    assert.equal(chooseUpgrade(run, 0), true);
    stepRun(run, {}, DT);
    assert.ok(run.events.some((e) => e.type === 'blessingPick'));
  }

  // 主线终点后（MAIN_DURATION + 2）烟雾测试跳转保护
  const smokeRun = createRun({ seed: 702 });
  smokeRun.time = MAIN_DURATION + 2;
  smokeRun.player.invulnT = 99;
  stepRun(smokeRun, {}, DT);
  assert.equal(smokeRun.status, 'playing');
  assert.equal(smokeRun.boss?.type, 'youshen');

  // F8 弃签（Banish）永久剔除 + 不重复补位 + 留签（Lock）跨刷新与跨升级保留
  const rAgency = createRun({ seed: 801 });
  rAgency._pendingLevels = 2;
  rAgency.status = 'levelup';
  generateChoices(rAgency);
  const banishedId = rAgency.choices[0].id;
  assert.equal(banishChoice(rAgency, 0), true);
  assert.equal(rAgency.banishesLeft, 1);
  assert.ok(rAgency.banished.includes(banishedId));
  assert.equal(new Set(rAgency.choices.map((c) => `${c.kind}:${c.id}`)).size, 3);
  for (let r = 0; r < 15; r++) {
    generateChoices(rAgency);
    assert.ok(!rAgency.choices.some((c) => c.id === banishedId), '已弃签器物绝不再进入候选池');
  }

  const lockTarget = rAgency.choices[1];
  assert.equal(toggleLockChoice(rAgency, 1), true);
  assert.equal(rerollChoices(rAgency), true);
  assert.equal(rAgency.choices[0].id, lockTarget.id);
  assert.equal(rAgency.choices[0].locked, true);
  assert.equal(chooseUpgrade(rAgency, 1), true);
  assert.equal(rAgency.choices[0].id, lockTarget.id);
  assert.equal(chooseUpgrade(rAgency, 0), true);
  assert.equal(rAgency.lockedChoice, null);
});

// ───────────────────────── F9: 奇遇地标（香案 / 试炼碑 / 鬼市货郎）─────────────────────────

test('F9: 确定性三地标生成、香案燃血/求签/安神、货郎铜钱消费不穿负、18s 试炼碑必落供盒', () => {
  const runA = createRun({ seed: 901 });
  const runB = createRun({ seed: 901 });
  assert.deepEqual(runA.shrines, runB.shrines);
  const kinds = new Set(runA.shrines.map((s) => s.kind));
  assert.ok(kinds.has('altar') && kinds.has('trial') && kinds.has('peddler'));

  // 香案燃血祭器开光
  const altar = runA.shrines.find((s) => s.kind === 'altar');
  while (addOrUpgradeWeapon(runA, 'gong'));
  assert.equal(interactShrine(runA, altar.id), true);
  const aRes = resolveShrine(runA, 0);
  assert.equal(aRes.outcome, 'blood_rite');
  assert.equal(getWeapon(runA, 'gong').evolved, true);
  assert.equal(getWeapon(runA, 'gong').evolvedRecipe, 'altar');

  // 货郎没钱拒绝 + dismissShrine 可重开 + 有钱正常扣费且不穿负
  const peddler = runA.shrines.find((s) => s.kind === 'peddler');
  runA.player.x = peddler.x;
  runA.player.y = peddler.y;
  stepRun(runA, {}, DT);
  assert.equal(runA.nearbyShrine?.id, peddler.id);
  assert.equal(interactShrine(runA), true);
  assert.equal(resolveShrine(runA, 0), null);
  dismissShrine(runA);
  assert.equal(peddler.used, false);

  earnCoins(runA, 30, false);
  assert.equal(interactShrine(runA, peddler.id), true);
  assert.equal(resolveShrine(runA, 0).outcome, 'peddler_upgrade');
  assert.equal(runA.stats.coins, 5);
  assert.equal(runA.coinsSpent, 25);
  assert.equal(spendCoins(runA, 10), false);
  assert.equal(runA.stats.coins, 5);

  // 18s 试炼碑精英围攻 -> 必落供盒
  const trial = runA.shrines.find((s) => s.kind === 'trial');
  assert.equal(interactShrine(runA, trial.id), true);
  assert.equal(resolveShrine(runA, 0).outcome, 'start_trial');
  assert.equal(trial.active, true);
  for (let i = 0; i < Math.ceil(SHRINES.trialDuration / DT) + 5; i++) {
    runA.player.invulnT = 99;
    if (runA.status === 'levelup') {
      chooseUpgrade(runA, 0);
      continue;
    }
    if (runA.status === 'chest') break;
    stepRun(runA, {}, DT);
  }
  assert.equal(trial.active, false);
  assert.ok(runA.pickups.some((p) => p.kind === 'chest') || runA.status === 'chest');
});

// ───────────────────────── F10: 新战术鬼祟、5 精英词缀与三英雄专属大招 ─────────────────────────

test('F10: 吹鼓鬼光环不叠加、红衣纸新娘风筝抛射、阴火骷髅 0.9s 敌我双伤自爆、5 精英词缀与三英雄大招', () => {
  // 1) 验证 1 只与 2 只吹鼓鬼增益光环绝不叠加
  const measureBuffedMove = (suonaCount) => {
    const r = createRun({ seed: 1001 });
    r.weapons.length = 0;
    r.player.invulnT = 99;
    const kid = spawnEnemy(r, 'paperkid', 150, 0);
    for (let s = 0; s < suonaCount; s++) spawnEnemy(r, 'suona', 160 + s * 8, 25);
    const x0 = kid.x;
    updateEnemies(r, DT);
    return x0 - kid.x;
  };
  const step0 = measureBuffedMove(0);
  const step1 = measureBuffedMove(1);
  const step2 = measureBuffedMove(2);
  assert.ok(step1 > step0 * 1.18, '吹鼓鬼应提升同伴移速');
  assert.ok(Math.abs(step2 - step1) < 1e-6, '多只吹鼓鬼光环不得叠加');

  // 2) 红衣纸新娘近距后撤风筝 + 远程抛射
  const rBride = createRun({ seed: 1005 });
  rBride.weapons.length = 0;
  rBride.player.invulnT = 99;
  const bride = spawnEnemy(rBride, 'paperbride', 100, 0);
  bride._fireT = 0.01;
  updateEnemies(rBride, DT);
  assert.ok(bride.x > 100, '纸新娘过近时应向后风筝拉开距离');
  assert.ok(rBride.projectiles.some((p) => p.kind === 'enemyBullet' && p.source === 'paperbride'));

  // 3) 阴火骷髅 0.9s 延迟自爆敌我双伤且不记入 maxHit
  const rCin = createRun({ seed: 1002 });
  rCin.weapons.length = 0;
  const cinder = spawnEnemy(rCin, 'cinder', 30, 0);
  const neighbor = spawnEnemy(rCin, 'sedan', 42, 0);
  const nHp0 = neighbor.hp;
  rebuildHash(rCin);
  killEnemy(rCin, cinder);
  for (let i = 0; i < 65; i++) {
    processScheduled(rCin, DT);
    updateProjectiles(rCin, DT);
  }
  assert.ok(neighbor.hp < nHp0);
  assert.ok(rCin.player.hp < rCin.player.maxHp);
  assert.equal(rCin.stats.maxHit, 0);

  // 4) 全部 5 精英词缀（纸甲减伤、疾行加速抗减速、阴火三连弹、分身半血裂变、藏宝丰厚掉落）
  const rAff = createRun({ seed: 1003 });
  rAff.weapons.length = 0;
  rAff.mods.critChance = 0;
  const armorE = spawnEnemy(rAff, 'lanternghost', 80, 0, { elite: true, affix: 'paper_armor' });
  const swiftE = spawnEnemy(rAff, 'lanternghost', 80, 30, { elite: true, affix: 'swift_step' });
  const plainE = spawnEnemy(rAff, 'lanternghost', 80, 60, { elite: true, affix: 'treasure_bearer' });
  assert.ok(swiftE.speed > armorE.speed * 1.25);
  applySlow(rAff, swiftE, 2.0);
  applySlow(rAff, armorE, 2.0);
  assert.ok(Math.abs(swiftE.slowT - armorE.slowT * 0.5) < 1e-6, '疾行精英减速时长减半');
  armorE.hp = armorE.maxHp = 5000;
  swiftE.hp = swiftE.maxHp = 5000;
  assert.ok(damageEnemy(rAff, armorE, 100, 'gong') < damageEnemy(rAff, swiftE, 100, 'gong'));

  const soulE = spawnEnemy(rAff, 'weasel', 180, 0, { elite: true, affix: 'soul_fire' });
  soulE._affixT = 0.01;
  rAff.player.invulnT = 99;
  updateEnemies(rAff, DT);
  assert.equal(rAff.projectiles.filter((p) => p.source === 'soul_fire').length, 3);

  const twinE = spawnEnemy(rAff, 'weasel', 90, 0, { elite: true, affix: 'mirror_twin' });
  twinE.hp = Math.ceil(twinE.maxHp * 0.55);
  damageEnemy(rAff, twinE, Math.ceil(twinE.maxHp * 0.2), 'gong');
  flushSpawnQueue(rAff);
  assert.ok(rAff.enemies.some((e) => e.mirrorClone));

  killEnemy(rAff, plainE);
  assert.ok(rAff.pickups.filter((p) => p.kind === 'coin').length >= 4);

  // 5) 三英雄专属大招（zhou 五更镇魂锣三叠波、mian 八骑百鬼纸马阵、daotong 九天玄雷敕九落雷）
  for (const heroId of ['zhou', 'mian', 'daotong']) {
    const rh = createRun({ seed: 1004, heroId });
    const dummy = spawnEnemy(rh, 'sedan', 90, 0);
    dummy.hp = dummy.maxHp = 50000;
    rebuildHash(rh);
    rh.player.ult = ULT.cost;
    assert.equal(castUlt(rh), true);
    let sawHeroVfx = false;
    for (let i = 0; i < 60; i++) {
      rh.player.invulnT = 99;
      stepRun(rh, {}, DT);
      if (heroId === 'mian' && rh.projectiles.some((p) => p.kind === 'paperHorse')) sawHeroVfx = true;
      if (heroId === 'daotong' && rh.projectiles.some((p) => p.kind === 'thunderBolt')) sawHeroVfx = true;
      if (heroId === 'zhou' && rh.projectiles.some((p) => p.kind === 'ultPulse')) sawHeroVfx = true;
    }
    assert.ok(sawHeroVfx && dummy.hp < 50000, `${heroId} 专属大招未完整生效`);
  }
});

// ───────────────────────── 文案与数值公式 100% 一致性锁 ─────────────────────────

test('文案与数值公式 100% 一致性锁：18 命签、12 法器（含糯米击杀间隔）、12 羁绊阶梯（含阳炎减速）与三地标奇遇', () => {
  const pct = (v) => Math.round(v * 100);

  // 1) 法器文案：糯米必须动态反映 RELICS.glutinous.killInterval，不再硬编码 25
  const glutDesc = describeUpgrade({ kind: 'relic', id: 'glutinous', level: 1, isNew: true }).desc;
  assert.ok(
    glutDesc.includes(`每${RELICS.glutinous.killInterval}杀回血 +${RELICS.glutinous.perLevel.killHeal}`),
    `glutinous desc desync: ${glutDesc}`,
  );
  const gongCard = describeUpgrade({ kind: 'weapon', id: 'gong', level: 2, isNew: false });
  assert.ok(gongCard.evolveHint.includes(`${EVOLUTION.resonanceCount}件`), `evolveHint desync: ${gongCard.evolveHint}`);

  // 2) 全部 18 张守夜命签：逐张挂载校对 computeBlessingMods 实际修正值与 desc 展示数字 1:1 吻合
  for (const bid of BLESSING_IDS) {
    const r = createRun({ seed: 9901, heroId: 'zhou' });
    const hp0 = r.player.maxHp;
    const armor0 = r.player.armor;
    r.player.hp = Math.floor(hp0 * 0.5);
    applyBlessingChoice(r, bid, {
      recomputeMods,
      healPlayer: (run, amt) => {
        const before = run.player.hp;
        run.player.hp = Math.min(run.player.maxHp, run.player.hp + amt);
        return run.player.hp - before;
      },
      earnCoins,
    });
    const bm = computeBlessingMods(r);
    const desc = BLESSINGS[bid].desc;
    const V = BLESSING_TUNING[bid];
    assert.ok(V, `missing BLESSING_TUNING.${bid}`);

    if (bid === 'lantern_oil') {
      assert.ok(desc.includes(`+${pct(bm.areaPct)}%`) && desc.includes(`+${pct(bm.lightMul - 1)}%`), desc);
      assert.ok(desc.includes(`${pct(V.pickHealPct)}%`) && desc.includes(`${pct(V.watchHealPct)}%`), desc);
    } else if (bid === 'watchman_step') {
      assert.ok(desc.includes(`+${pct(bm.speedPct)}%`) && desc.includes(`${V.stepDist}`), desc);
    } else if (bid === 'soul_gourd') {
      assert.ok(desc.includes(`+${pct(bm.pickupPct)}%`) && desc.includes(`+${pct(bm.xpPct)}%`), desc);
    } else if (bid === 'earth_blessing') {
      assert.equal(r.player.armor - armor0, bm.bonusArmor);
      assert.equal(r.player.maxHp - hp0, bm.bonusMaxHp);
      assert.ok(desc.includes(`护甲 +${bm.bonusArmor}`) && desc.includes(`最大生命 +${bm.bonusMaxHp}`), desc);
      assert.ok(desc.includes(`${bm.bonusHurtInvuln}`), desc);
    } else if (bid === 'morning_dew') {
      assert.ok(desc.includes(`${bm.hpRegen}`) && desc.includes(`+${pct(V.fullHpDmgPct)}%`), desc);
    } else if (bid === 'artisan_craft') {
      assert.ok(desc.includes(`+${bm.evoMultBonus}`), desc);
    } else if (bid === 'blood_oath') {
      assert.ok(
        desc.includes(`−${pct(1 - bm.maxHpMul)}%`) &&
          desc.includes(`+${pct(bm.dmgPct)}%`) &&
          desc.includes(`+${pct(bm.critChance)}%`),
        desc,
      );
    } else if (bid === 'ghost_feast') {
      assert.ok(
        desc.includes(`+${pct(bm.spawnRateMul - 1)}%`) &&
          desc.includes(`+${pct(bm.eliteChanceMul - 1)}%`) &&
          desc.includes(`+${pct(bm.xpPct)}%`) &&
          desc.includes(`+${pct(bm.coinDropMul - 1)}%`),
        desc,
      );
    } else if (bid === 'heavy_bronze') {
      assert.equal(r.player.armor - armor0, bm.bonusArmor);
      assert.ok(
        desc.includes(`−${pct(-bm.speedPct)}%`) &&
          desc.includes(`护甲 +${bm.bonusArmor}`) &&
          desc.includes(`范围 +${pct(bm.areaPct)}%`) &&
          desc.includes(`击退 +${pct(bm.knockbackMul - 1)}%`),
        desc,
      );
    } else if (bid === 'glass_talisman') {
      assert.equal(r.player.armor, 0);
      assert.ok(
        desc.includes(`+${pct(bm.takenDmgMul - 1)}%`) &&
          desc.includes(`+${pct(bm.cdr)}%`) &&
          desc.includes(`+${bm.amount}`),
        desc,
      );
    } else if (bid === 'cursed_lantern') {
      assert.ok(
        desc.includes(`−${pct(1 - bm.lightMul)}%`) &&
          desc.includes(`+${pct(bm.critMultBonus)}%`) &&
          desc.includes(`${pct(bm.killBlastChance)}%`),
        desc,
      );
    } else if (bid === 'hungry_ghost') {
      assert.ok(desc.includes(`${bm.hpDrain}`) && desc.includes(`+${pct(bm.dmgPct)}%`), desc);
    }
  }

  // 3) 四门羁绊阶梯文案：阳炎 4 件减速比例必须等于 1 - ENEMY_AI.slowMul，道法/镇魂/纸扎属性严格对齐 synergyStatMods
  const yangT4 = SYNERGIES.yangyan.tiers.find((t) => t.tier === 4).summary;
  assert.ok(yangT4.includes(`减速 ${pct(1 - ENEMY_AI.slowMul)}%`), `yangyan T4 desync: ${yangT4}`);
  const fullSyn = synergyStatMods({ counts: { zhenhun: 6, daofa: 6, zhizha: 6, yangyan: 6 } });
  assert.ok(SYNERGIES.zhenhun.tiers[0].summary.includes(`击退 +${pct(SYNERGY_TUNING.zhenhun2.knockbackPct)}%`));
  assert.ok(SYNERGIES.daofa.tiers[2].summary.includes(`${fullSyn.cooldownFloor}`));
  assert.ok(SYNERGIES.zhizha.tiers[0].summary.includes(`+${pct(fullSyn.summonDmgPct)}%`));
  assert.ok(SYNERGIES.yangyan.tiers[0].summary.includes(`+${pct(fullSyn.areaPct)}%`));

  // 4) 奇遇地标选项文案与消费数值严格对齐 SHRINES / DAMAGE 常量
  const rShrine = createRun({ seed: 9902 });
  const altar = rShrine.shrines.find((s) => s.kind === 'altar');
  const peddler = rShrine.shrines.find((s) => s.kind === 'peddler');
  const trial = rShrine.shrines.find((s) => s.kind === 'trial');

  const altarModal = buildShrineOptions(rShrine, altar);
  const expectedHpCost = Math.max(1, Math.floor(rShrine.player.maxHp * SHRINES.altarHpPct));
  assert.equal(altarModal.options[0].costText, `生命 −${expectedHpCost}`);
  assert.ok(altarModal.options[2].desc.includes(`${SHRINES.altarWardInvuln}`));
  // Lv4 武器燃血升级只差 1 级满级，文案应如实展示 1 级；全开光时展示 DAMAGE.overflowMult
  while (rShrine.weapons[0].level < 4) addOrUpgradeWeapon(rShrine, rShrine.weapons[0].id);
  assert.ok(buildShrineOptions(rShrine, altar).options[0].desc.includes('1 级'));
  rShrine.weapons[0].level = 5;
  rShrine.weapons[0].evolved = true;
  assert.ok(buildShrineOptions(rShrine, altar).options[0].desc.includes(`×${DAMAGE.overflowMult}`));

  const trialModal = buildShrineOptions(rShrine, trial);
  assert.ok(trialModal.options[0].desc.includes(`${SHRINES.trialDuration}`));

  const peddlerModal = buildShrineOptions(rShrine, peddler);
  assert.equal(peddlerModal.options[0].costText, `${SHRINES.peddlerCosts.upgrade} 铜钱`);
  assert.equal(peddlerModal.options[1].costText, `${SHRINES.peddlerCosts.seals} 铜钱`);
  assert.equal(peddlerModal.options[2].costText, `${SHRINES.peddlerCosts.elixir} 铜钱`);
  assert.ok(peddlerModal.options[1].desc.includes(`+${SHRINES.peddlerSealRerolls}`) && peddlerModal.options[1].desc.includes(`+${SHRINES.peddlerSealBanishes}`));
  assert.ok(peddlerModal.options[2].desc.includes(`${SHRINES.peddlerElixirHeal}`) && peddlerModal.options[2].desc.includes(`${SHRINES.peddlerElixirUlt}`));
});

// ───────────────────────── 边界防御：NaN / ±Infinity / 字符串下标 / 单态结构 / 破晓清弹 ─────────────────────────

test('边界硬化：±Infinity/NaN 移动与伤害/治疗/铜钱/nightLevel/dt 防污染、字符串下标兼容、Enemy 单态与夜游神即时清弹', () => {
  // 1) ±Infinity / NaN / 超大数 / 非法对象移动输入与非法 dt 绝不污染玩家坐标与朝向
  const rMove = createRun({ seed: 1101 });
  const badInputs = [
    null,
    undefined,
    { moveX: Infinity, moveY: 0 },
    { moveX: 0, moveY: -Infinity },
    { moveX: -Infinity, moveY: Infinity },
    { moveX: NaN, moveY: NaN },
    { moveX: 1.7e308, moveY: -1.7e308 },
    { moveX: 'abc', moveY: {} },
    { moveX: true, moveY: false },
  ];
  for (const inp of badInputs) {
    stepRun(rMove, inp, DT);
    assert.ok(Number.isFinite(rMove.player.x) && Number.isFinite(rMove.player.y), `non-finite pos for ${JSON.stringify(inp)}`);
    assert.ok(Number.isFinite(rMove.player.facingX) && Number.isFinite(rMove.player.facingY));
  }
  const tBefore = rMove.time;
  for (const badDt of [NaN, Infinity, -Infinity, -1, 0, null, 'abc', false]) {
    stepRun(rMove, { moveX: 1, moveY: 0 }, badDt);
  }
  assert.equal(rMove.time, tBefore);
  assert.ok(Number.isFinite(rMove.player.x));

  // 2) hurtPlayer / healPlayer / earnCoins / spendCoins / damageEnemy / damageCircle / knockback 防 NaN 与 ±Infinity
  const rSafe = createRun({ seed: 1102 });
  rSafe.player.hp = 60;
  for (const bad of [NaN, Infinity, -Infinity, undefined, null, -20, 0, '50', true]) {
    assert.equal(hurtPlayer(rSafe, bad), 0);
    assert.equal(healPlayer(rSafe, bad), 0);
    assert.equal(earnCoins(rSafe, bad, true), 0);
  }
  assert.equal(rSafe.player.hp, 60);
  assert.equal(rSafe._tele.taken, 0);
  assert.equal(rSafe.stats.coins, 0);
  earnCoins(rSafe, 30);
  for (const badCost of [NaN, Infinity, -Infinity, undefined, null, -5, '10', true]) {
    assert.equal(spendCoins(rSafe, badCost), false);
  }
  assert.equal(rSafe.stats.coins, 30);

  const foe = spawnEnemy(rSafe, 'lanternghost', 80, 0);
  const foeHp0 = foe.hp;
  rebuildHash(rSafe);
  for (const bad of [NaN, Infinity, -Infinity, undefined, null, -10, 0, '20']) {
    assert.equal(damageEnemy(rSafe, foe, bad, 'gong'), 0);
  }
  assert.equal(damageCircle(rSafe, NaN, 0, 60, 20, 'gong'), 0);
  assert.equal(damageCircle(rSafe, 0, 0, Infinity, 20, 'gong'), 0);
  assert.equal(damageCircle(rSafe, 0, 0, 60, NaN, 'gong'), 0);
  knockback(foe, Infinity, 0, 80);
  knockback(foe, 1, 0, NaN);
  knockback(foe, 1, 0, Infinity);
  assert.equal(foe.hp, foeHp0);
  assert.equal(rSafe.stats.damageDealt, 0);
  assert.ok(Number.isFinite(foe.kbx) && Number.isFinite(foe.kby));

  // 3) createRun({ nightLevel }) 与 nightModifiers 边界钳制 [0, MAX_NIGHT]
  assert.equal(createRun({ seed: 1103, nightLevel: NaN }).nightLevel, 0);
  assert.equal(createRun({ seed: 1103, nightLevel: Infinity }).nightLevel, 0);
  assert.equal(createRun({ seed: 1103, nightLevel: -5 }).nightLevel, 0);
  assert.equal(createRun({ seed: 1103, nightLevel: 99 }).nightLevel, MAX_NIGHT);
  assert.equal(createRun({ seed: 1103, nightLevel: '4' }).nightLevel, 4);
  assert.ok(Number.isFinite(nightModifiers(NaN).eliteChance));
  assert.equal(nightModifiers(99).affixes.length, MAX_NIGHT);
  const rNanNight = createRun({ seed: 1104, nightLevel: NaN });
  rNanNight.player.invulnT = 999;
  for (let i = 0; i < 120; i++) stepRun(rNanNight, {}, DT);
  assert.ok(rNanNight.enemies.length > 0 && rNanNight.enemies.every((e) => Number.isFinite(e.hp) && e.hp >= 1));

  // 4) DOM 字符串下标（'0'/'1'/'2'）兼容 + null/空串/布尔/越界严格拒绝
  const rIdx = createRun({ seed: 1105 });
  rIdx._pendingLevels = 2;
  rIdx.status = 'levelup';
  generateChoices(rIdx);
  for (const invalid of [null, undefined, '', '   ', false, true, [], 1.5, NaN, Infinity, -1, 3, '9']) {
    assert.equal(toggleLockChoice(rIdx, invalid), false);
    assert.equal(banishChoice(rIdx, invalid), false);
    assert.equal(chooseUpgrade(rIdx, invalid), false);
  }
  assert.equal(toggleLockChoice(rIdx, '1'), true);
  assert.equal(rIdx.choices[1].locked, true);
  assert.equal(rIdx.choices[0].locked, false);
  assert.equal(banishChoice(rIdx, '0'), true);
  assert.equal(chooseUpgrade(rIdx, '2'), true);
  assert.equal(rIdx.choices[0].locked, true, '字符串下标锁定的签应跨级保留至下一轮');
  assert.equal(chooseUpgrade(rIdx, '0'), true);
  assert.equal(rIdx.status, 'playing');

  const peddler = rIdx.shrines.find((s) => s.kind === 'peddler');
  earnCoins(rIdx, 50);
  assert.equal(interactShrine(rIdx, String(peddler.id)), true);
  for (const invalid of [null, undefined, '', false, true, NaN, Infinity, -1, 9]) {
    assert.equal(resolveShrine(rIdx, invalid), null);
  }
  assert.equal(resolveShrine(rIdx, '1')?.outcome, 'peddler_seals');

  // 5) Monomorphic Enemy 隐藏类字段完全一致 & 夜游神击杀当帧立即清除 enemyBullet
  const rMono = createRun({ seed: 1106 });
  const regE = spawnEnemy(rMono, 'paperkid', 100, 0);
  const ys = spawnBoss(rMono, 'youshen', { final: true });
  assert.deepEqual(Object.keys(regE), Object.keys(ys), '普通怪与 Boss 必须共享完全一致的属性键顺序（V8 单态隐藏类）');
  rMono.projectiles.push({ id: 9001, kind: 'enemyBullet', x: 30, y: 0, r: 6, vx: 0, vy: 0, t: 0, life: 5, dmg: 20 });
  rMono.projectiles.push({ id: 9002, kind: 'gongPulse', x: 0, y: 0, r: 10, radius: 50, maxRadius: 100, t: 0, life: 0.3 });
  killEnemy(rMono, ys);
  assert.equal(rMono.status, 'cleared');
  assert.ok(!rMono.projectiles.some((pr) => pr.kind === 'enemyBullet'), '击败夜游神当刻应立即从 projectiles 滤除敌弹');
  assert.ok(rMono.projectiles.some((pr) => pr.id === 9002), '非敌方弹幕的己方结算特效予以保留');
});

test('边界硬化 2：1.7e308 近 MAX_VALUE 浮点上溢与 SpatialHash 反死循环回归锁', () => {
  const BIG = 1.7e308;

  // 1) updatePlayer 传入 dt = 1.7e308（含巡夜疾步 watchman_step）瞬时返回且绝不溢出/死循环
  const rStep = createRun({ seed: 1201 });
  applyBlessingChoice(rStep, 'watchman_step', { recomputeMods, earnCoins });
  const t0Step = performance.now();
  updatePlayer(rStep, { moveX: 1, moveY: 0 }, BIG);
  const stepElapsed = performance.now() - t0Step;
  assert.ok(stepElapsed < 20, `updatePlayer(dt=1.7e308) took ${stepElapsed.toFixed(2)}ms`);
  assert.ok(Number.isFinite(rStep.player.x) && Number.isFinite(rStep.player.y));
  assert.ok(rStep.player.x > 0 && rStep.player.x <= rStep.player.speed + 1e-6);
  assert.ok(Number.isFinite(rStep._stepChargeDist) && Number.isFinite(rStep.player.ult));

  // 2) hurtPlayer(run, 1.7e308) 挂载薄纸凶符（takenDmgMul = 1.25）绝不因上溢 Infinity 免疫致命伤，且多次受击 _tele.taken 保持有限
  const rHurt = createRun({ seed: 1202 });
  applyBlessingChoice(rHurt, 'glass_talisman', { recomputeMods, earnCoins });
  const dealtToPlayer = hurtPlayer(rHurt, BIG);
  assert.ok(Number.isFinite(dealtToPlayer) && dealtToPlayer > 0, `expected lethal finite dmg, got ${dealtToPlayer}`);
  assert.equal(rHurt.player.hp, 0);
  rHurt.player.hp = rHurt.player.maxHp;
  rHurt.player.invulnT = 0;
  hurtPlayer(rHurt, BIG);
  assert.ok(Number.isFinite(rHurt._tele.taken) && rHurt._tele.taken <= Number.MAX_SAFE_INTEGER);

  // 3) earnCoins(run, 1.7e308) 连续调用 + 五帝钱/夜色结算 endRun 始终保持安全有限整数
  const rCoins = createRun({ seed: 1203, nightLevel: 4, meta: { coinPct: 0.5 } });
  addOrUpgradeRelic(rCoins, 'fivecoins');
  recomputeMods(rCoins);
  earnCoins(rCoins, BIG, true);
  earnCoins(rCoins, BIG, true);
  assert.ok(Number.isSafeInteger(rCoins.stats.coins) && rCoins.stats.coins <= 1e9);
  assert.ok(Number.isSafeInteger(rCoins.coinsEarned) && rCoins.coinsEarned <= 1e9);
  const summary = endRun(rCoins);
  assert.ok(Number.isSafeInteger(summary.coins) && summary.coins > 0 && summary.coins <= 1e9);

  // 4) damageEnemy(run, foe, 1.7e308) 连续命中保持 stats.damageDealt / maxHit / _tele.dmg 有限
  const rDmg = createRun({ seed: 1204 });
  const tank = spawnEnemy(rDmg, 'sedan', 80, 0);
  tank.hp = tank.maxHp = 5e12;
  const hit1 = damageEnemy(rDmg, tank, BIG, 'gong');
  const hit2 = damageEnemy(rDmg, tank, BIG, 'gong');
  assert.ok(Number.isFinite(hit1) && hit1 > 0 && Number.isFinite(hit2) && hit2 > 0);
  assert.ok(Number.isFinite(rDmg.stats.damageDealt) && rDmg.stats.damageDealt <= Number.MAX_SAFE_INTEGER);
  assert.ok(Number.isFinite(rDmg.stats.maxHit) && rDmg.stats.maxHit <= 1e9);
  assert.ok(Number.isFinite(rDmg._tele.dmg) && rDmg._tele.dmg <= Number.MAX_SAFE_INTEGER);

  // 5) knockback(foe, 1, 0, 1.7e308) 精确钳制 kbx === 460，对角线 1.7e308 方向归一化不溢出
  const foeKb = spawnEnemy(rDmg, 'paperkid', 100, 0);
  foeKb.kbx = 0;
  foeKb.kby = 0;
  knockback(foeKb, 1, 0, BIG);
  assert.equal(foeKb.kbx, ENEMY_AI.maxKnockbackSpeed);
  assert.equal(foeKb.kby, 0);
  foeKb.kbx = 0;
  foeKb.kby = 0;
  knockback(foeKb, BIG, BIG, BIG);
  assert.ok(Number.isFinite(foeKb.kbx) && Number.isFinite(foeKb.kby));
  assert.ok(Math.abs(Math.hypot(foeKb.kbx, foeKb.kby) - ENEMY_AI.maxKnockbackSpeed) < 1e-6);

  // 6) damageCircle 超大半径/超大坐标与 SpatialHash 极端落格在 < 20ms 内瞬时完成
  const rCircle = createRun({ seed: 1205 });
  const targetA = spawnEnemy(rCircle, 'lanternghost', 60, 0);
  const targetB = spawnEnemy(rCircle, 'paperkid', -90, 40);
  targetA.hp = targetA.maxHp = 5000;
  targetB.hp = targetB.maxHp = 5000;
  rebuildHash(rCircle);
  rCircle._sys.hash.insert({ x: NaN, y: 0, r: 10 });
  rCircle._sys.hash.insert({ x: Infinity, y: 0, r: 10 });

  const t0Circle = performance.now();
  assert.equal(damageCircle(rCircle, 0, 0, 60, 0, 'gong'), 0);
  assert.equal(damageCircle(rCircle, 0, 0, 60, -10, 'gong'), 0);
  const hitFar = damageCircle(rCircle, BIG, 0, 60, 20, 'gong');
  const hitAll = damageCircle(rCircle, 0, 0, BIG, 20, 'gong');
  const circleElapsed = performance.now() - t0Circle;

  assert.equal(hitFar, 0);
  assert.equal(hitAll, 2);
  assert.ok(targetA.hp < 5000 && targetB.hp < 5000);
  assert.ok(circleElapsed < 20, `damageCircle(1.7e308) took ${circleElapsed.toFixed(2)}ms`);
});

