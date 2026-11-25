// v4 M5 全面单元测试：第二地界「河灯水口」地形与积分、三水口邪祟、三阶段终局夜主「河神夜婚」、
// 新守夜人「芦二娘」「钱算子」被动与绝技、22 对兵刃法器、6 套重彩衣冠与 2 项守夜功绩。

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DT,
  HEROES,
  HERO_IDS,
  WEAPONS,
  WEAPON_IDS,
  RELIC_IDS,
  ENEMY_AI,
  BOSS_AI,
} from '../../src/sim/balance.js';
import {
  MAP_IDS,
  MAPS,
  isRiverWater,
  isWoodenBridge,
  riverChannelYAt,
  terrainMoveMul,
} from '../../src/sim/maps.js';
import { createRun, stepRun, endRun, computeRunScore } from '../../src/sim/run.js';
import { addOrUpgradeWeapon, evolveWeapon } from '../../src/sim/weapons.js';
import { addOrUpgradeRelic } from '../../src/sim/relics.js';
import { recomputeMods } from '../../src/sim/player.js';
import { spawnEnemy, rebuildHash } from '../../src/sim/enemies.js';
import { spawnBoss } from '../../src/sim/bosses.js';
import { damageEnemy } from '../../src/sim/combat.js';
import { dropXp, dropPickup } from '../../src/sim/pickups.js';
import { hitPropsCircle, updateProps } from '../../src/sim/props.js';
import { castUlt } from '../../src/sim/ultimate.js';
import { defaultSave, mergeSaves, migrateSave } from '../../src/meta/save.js';
import { evaluateUnlocks, heroUnlockProgress, recordRun } from '../../src/meta/unlocks.js';
import { ACHIEVEMENTS_BY_ID, claimAchievement, reconcileAchievements } from '../../src/meta/achievements.js';
import { HERO_SKINS, getHeroSkins } from '../../src/meta/cosmetics.js';

const near = (a, b, eps = 1e-4) => assert.ok(Math.abs(a - b) <= eps, `expected ${a} ≈ ${b}`);

test('M5.1 地界「河灯水口」：出生码头干爽、夜河 0.75x 减速、木板跨桥原速、防风蓑衣抗减速、河灯落魂火与 1.12x 积分', () => {
  assert.deepEqual(MAP_IDS, ['qingshi', 'hedeng']);
  assert.equal(MAPS.hedeng.waterSlowMul, 0.75);
  assert.equal(MAPS.hedeng.scoreMul, 1.12);

  // 出生点安全圆内不淌水，正南 (0, 175) 固定有木板桥，(160, cy) 处于夜河水面
  const seed = 1024;
  assert.equal(isRiverWater(0, 0, seed), false);
  const bridgeY = riverChannelYAt(0, 0, seed);
  assert.equal(isWoodenBridge(0, bridgeY, seed), true);
  assert.equal(isRiverWater(0, bridgeY, seed), false);
  assert.equal(terrainMoveMul('hedeng', 0, bridgeY, seed, 0), 1);

  const waterX = 160;
  const waterY = riverChannelYAt(waterX, 0, seed);
  assert.equal(isRiverWater(waterX, waterY, seed), true);
  near(terrainMoveMul('hedeng', waterX, waterY, seed, 0), 0.75);

  // 防风蓑衣（straw_cape）满级提供 5×14% = 70% 减速抗性，将水面移速从 0.75 抬升至 0.925
  const run = createRun({ heroId: 'zhou', mapId: 'hedeng', seed });
  assert.equal(run.mapId, 'hedeng');
  for (let lv = 0; lv < 5; lv++) addOrUpgradeRelic(run, 'straw_cape');
  recomputeMods(run);
  near(run.mods.slowResist, 0.70);
  near(terrainMoveMul('hedeng', waterX, waterY, seed, run.mods.slowResist), 0.925);

  // 漂浮河灯（riverlantern）被击破时掉落 2 团魂火（xp）
  updateProps(run);
  const lantern = run.props.find((pr) => pr.kind === 'riverlantern');
  assert.ok(lantern, '河灯水口区块应生成可破坏漂浮河灯');
  const xpBefore = run.pickups.filter((pk) => pk.kind === 'xp').length;
  hitPropsCircle(run, lantern.x, lantern.y, lantern.r + 6);
  const xpAfter = run.pickups.filter((pk) => pk.kind === 'xp').length;
  assert.equal(xpAfter - xpBefore, 2, '击破一盏漂浮河灯应落下 2 团魂火');

  // 积分系数 1.12x 且通关青石镇解锁河灯水口、云存档合并保留双地界
  const baseSummary = {
    cleared: true,
    mode: 'main',
    time: 420,
    kills: 500,
    nightLevel: 1,
    coopSize: 1,
    eventsCompleted: 2,
  };
  const sQing = computeRunScore({ ...baseSummary, mapId: 'qingshi' });
  const sHe = computeRunScore({ ...baseSummary, mapId: 'hedeng' });
  assert.equal(sHe, Math.round(sQing * 1.12));

  const saveA = defaultSave();
  assert.deepEqual(saveA.mapsUnlocked, ['qingshi']);
  recordRun(saveA, { ...baseSummary, mapId: 'qingshi', coins: 60, heroId: 'zhou' });
  assert.ok(saveA.mapsUnlocked.includes('hedeng'), '通关青石镇应自动解锁河灯水口');

  const saveB = defaultSave();
  saveB.mapsUnlocked = ['qingshi', 'hedeng'];
  saveB.clearsByMap = { qingshi: 1, hedeng: 2 };
  const merged = mergeSaves(defaultSave(), saveB);
  assert.ok(merged.mapsUnlocked.includes('hedeng'));
  assert.equal(merged.clearsByMap.hedeng, 2);
});

test('M5.2 水口三邪祟：沉水鬼 55% 潜行减伤与出水猛扑、浮木纸妖横河冲撞、拉脚水怪水草拖拽', () => {
  const run = createRun({ heroId: 'zhou', mapId: 'hedeng', seed: 2048 });
  run.weapons.length = 0;
  run._spawnAcc = -99999;
  run._nextWaveT = 99999;
  run.player.invulnT = 999;

  // 1) 沉水鬼（water_lurker）：潜行时承受伤害减免 55%，逼近至 ambushDist 后出水蓄力猛扑，减伤消失
  const lurker = spawnEnemy(run, 'water_lurker', run.player.x + 220, run.player.y, { fixedHp: 500 });
  assert.equal(lurker.submerged, true);
  const subDmg = damageEnemy(run, lurker, 100, 'gong', { noCrit: true, noProc: true });
  lurker.x = run.player.x + 80;
  lurker.y = run.player.y;
  lurker.stateT = 0;
  stepRun(run, { moveX: 0, moveY: 0 }, DT);
  assert.equal(lurker.state, 'windup');
  assert.equal(lurker.submerged, false);
  const surfDmg = damageEnemy(run, lurker, 100, 'gong', { noCrit: true, noProc: true });
  assert.ok(subDmg <= Math.round(surfDmg * (1 - ENEMY_AI.water_lurker.submergeDr) + 2), `潜行伤害 ${subDmg} 应约为出水伤害 ${surfDmg} 的 45%`);

  // 2) 浮木纸妖（paper_raft）：与玩家同走廊高度时进入蓄力并横向高速冲撞
  run.enemies.length = 0;
  const raft = spawnEnemy(run, 'paper_raft', run.player.x + 150, run.player.y + 10, { fixedHp: 400 });
  raft.stateT = 0;
  stepRun(run, { moveX: 0, moveY: 0 }, DT);
  assert.equal(raft.state, 'windup');
  assert.ok(raft.telegraphLen > 100);
  for (let i = 0; i < 40; i++) stepRun(run, { moveX: 0, moveY: 0 }, DT);
  assert.ok(raft.x < run.player.x + 120, '浮木纸妖蓄力后应向玩家方向高速横撞');

  // 3) 拉脚水怪（water_puller）：蓄力后抛出水草，将玩家朝夜河河槽方向拖拽
  run.enemies.length = 0;
  run.player.x = 150;
  run.player.y = 95;
  const puller = spawnEnemy(run, 'water_puller', 150, 175, { fixedHp: 400 });
  puller._pullCd = 0;
  const startY = run.player.y;
  for (let i = 0; i < 50; i++) stepRun(run, { moveX: 0, moveY: 0 }, DT);
  assert.ok(run.player.y > startY + 12, `拉脚水怪应将玩家向夜河方向拉拽（${startY} -> ${run.player.y}）`);
});

test('M5.2 三阶段终局夜主「河神夜婚」：红轿护卫、沧浪横街水墙木桥避险、万灯锁魂四阵眼 80% 护盾与破阵易伤通关', () => {
  const run = createRun({ heroId: 'zhou', mapId: 'hedeng', seed: 3072 });
  run.weapons.length = 0;
  run._spawnAcc = -99999;
  run._nextWaveT = 99999;
  run._blessingWatches = { 1: true, 2: true, 3: true, 4: true, 5: true };
  run._bossSpawned = { horse: true, umbrella: true, youshen: true, hebo_wedding: true };
  run.time = 418;

  const boss = spawnBoss(run, 'hebo_wedding', { final: true });
  assert.equal(boss.type, 'hebo_wedding');
  assert.equal(boss.final, true);

  // 一阶段：召唤吹鼓鬼与纸新娘护轿 + 红轿蓄力冲锋
  boss._summonT = 0.01;
  boss.stateT = 0.01;
  for (let i = 0; i < 6; i++) stepRun(run, { moveX: 0, moveY: 0 }, DT);
  assert.equal(boss.phase, 1);
  assert.ok(run.enemies.some((e) => e.type === 'suona' || e.type === 'paperbride'), '一阶段应召唤迎亲护轿邪祟');

  // 二阶段（HP <= 65%）：放出横街沧浪水墙（enemyWaveWall），站在 safeX 安全桥口免伤，偏离桥口受创
  run.enemies = [boss];
  boss.hp = Math.floor(boss.maxHp * 0.55);
  for (let i = 0; i < 45; i++) stepRun(run, { moveX: 0, moveY: 0 }, DT);
  assert.equal(boss.phase, 2);
  const wall = run.projectiles.find((pr) => pr.kind === 'enemyWaveWall');
  assert.ok(wall, '二阶段应放出沧浪横街水墙');

  // 验证站在木桥安全缺口内免伤
  run.player.invulnT = 0;
  const hpSafeBefore = run.player.hp;
  run.player.x = wall.safeX;
  wall.t = 1.2;
  wall.y = run.player.y - wall.vy * DT * 0.5;
  stepRun(run, { moveX: 0, moveY: 0 }, DT);
  assert.equal(run.player.hp, hpSafeBefore, '站在木板桥安全缺口（safeX）内不应被沧浪水墙冲伤');

  // 验证偏离安全缺口被浪墙命中扣血
  run.projectiles.push({
    id: run._nextId++,
    kind: 'enemyWaveWall',
    x: 0,
    y: run.player.y,
    vy: 120,
    safeX: 0,
    safeHalfW: 48,
    halfH: 22,
    spanW: 560,
    telegraphT: 0.5,
    t: 1.2,
    life: 3.0,
    dmg: 18,
  });
  run.player.x = 140;
  run.player.invulnT = 0;
  const hpHitBefore = run.player.hp;
  stepRun(run, { moveX: 0, moveY: 0 }, DT);
  assert.ok(run.player.hp < hpHitBefore, '站在桥口安全区外应承受沧浪水墙伤害');

  // 三阶段（HP <= 30%）：召唤 4 盏锁魂河灯阵眼，开启 80% 护盾；全部击破后破盾暴露 +35% 易伤
  run.projectiles.length = 0;
  run.player.invulnT = 999;
  boss.hp = Math.floor(boss.maxHp * 0.25);
  for (let i = 0; i < 4; i++) stepRun(run, { moveX: 0, moveY: 0 }, DT);
  assert.equal(boss.phase, 3);
  const wards = run.enemies.filter((e) => !e.dead && e.bossWardOf === boss.id);
  assert.equal(wards.length, BOSS_AI.hebo_wedding.wardCount);
  assert.equal(boss.wardShieldActive, true);

  const shieldedDmg = damageEnemy(run, boss, 200, 'gong', { noCrit: true, noProc: true });
  for (const w of wards) {
    damageEnemy(run, w, 999999, 'gong', { direct: true });
  }
  stepRun(run, { moveX: 0, moveY: 0 }, DT);
  assert.equal(boss.wardShieldActive, false);
  assert.ok(boss.vulnT > 0 && boss.vulnPct >= 0.35, '击破全部锁魂阵眼后应暴露 +35% 破阵易伤');
  const exposedDmg = damageEnemy(run, boss, 200, 'gong', { noCrit: true, noProc: true });
  assert.ok(exposedDmg >= shieldedDmg * 4, `破阵易伤伤害 ${exposedDmg} 应显著高于 80% 护盾期伤害 ${shieldedDmg}`);

  // 斩杀河神夜婚触发五更破晓通关
  damageEnemy(run, boss, boss.hp + 99999, 'gong', { direct: true });
  assert.equal(run.status, 'cleared');
  assert.equal(run.watch, 6);
});

test('M5.3 新守夜人「芦二娘」「钱算子」与配对兵刃法器、六套衣冠及两项功绩全链路验证', () => {
  assert.equal(HERO_IDS.length, 8);
  assert.equal(WEAPON_IDS.length, 22);
  assert.equal(RELIC_IDS.length, 22);
  assert.equal(WEAPONS.bamboo_pole.pair, 'straw_cape');
  assert.equal(WEAPONS.gold_abacus.pair, 'ledger_book');
  assert.equal(HEROES.weier.startWeapon, 'bamboo_pole');
  assert.equal(HEROES.qiansuanzi.startWeapon, 'gold_abacus');

  // ── 1) 芦二娘（weier）：移动叠满 5 层「推浪」（+35% 伤 / +20% 范围 + 尾浪溅射），驻足消退；破浪竹杆 → 靖海镇浪杆；绝技「千浪过水口」
  const rWei = createRun({ heroId: 'weier', mapId: 'hedeng', seed: 4096 });
  rWei._spawnAcc = -99999;
  rWei._nextWaveT = 99999;
  rWei.weapons.forEach((w) => { w.cd = 999; });
  const baseDmgPct = rWei.mods.dmgPct;
  const baseAreaMul = rWei.mods.areaMul;
  const dummy = spawnEnemy(rWei, 'paperkid', rWei.player.x - 16, rWei.player.y, { fixedHp: 800 });
  dummy.speed = 0;
  rWei.player.invulnT = 999;
  for (let i = 0; i < 200; i++) {
    dummy.x = rWei.player.x - 18;
    dummy.y = rWei.player.y;
    rWei.status = 'playing';
    rWei._pendingLevels = 0;
    stepRun(rWei, { moveX: 1, moveY: 0 }, DT);
  }
  assert.equal(rWei.player.waveStacks, 5, '持续移动应叠满 5 层推浪');
  near(rWei.mods.dmgPct, baseDmgPct + 0.35, 0.02);
  near(rWei.mods.areaMul, baseAreaMul + 0.20, 0.02);
  assert.ok(dummy.hp < 800, '满层推浪尾浪溅射应对身后邪祟造成伤害');

  // 驻足后推浪层数逐步消退
  for (let i = 0; i < 200; i++) {
    rWei.status = 'playing';
    rWei._pendingLevels = 0;
    stepRun(rWei, { moveX: 0, moveY: 0 }, DT);
  }
  assert.equal(rWei.player.waveStacks, 0, '驻足后推浪层数应消退归零');

  // 破浪竹杆升满配防风蓑衣开光为「靖海镇浪杆」并劈出 bambooWave
  for (let lv = 0; lv < 5; lv++) addOrUpgradeWeapon(rWei, 'bamboo_pole');
  addOrUpgradeRelic(rWei, 'straw_cape');
  assert.equal(evolveWeapon(rWei, 'bamboo_pole'), true);
  rWei.weapons[0].cd = 0;
  const target = spawnEnemy(rWei, 'lanternghost', rWei.player.x + 80, rWei.player.y, { fixedHp: 500 });
  rebuildHash(rWei);
  stepRun(rWei, { moveX: 0, moveY: 0 }, DT);
  assert.ok(rWei.projectiles.some((pr) => pr.kind === 'bambooWave' && pr.evolved), '靖海镇浪杆应劈出开光竹浪气劲');

  // 芦二娘绝技「千浪过水口」：全屏清弹 + 击退定身 + 瞬间叠满 5 层推浪
  rWei.projectiles.push({ id: 9991, kind: 'enemyBullet', x: rWei.player.x + 30, y: rWei.player.y, r: 6, vx: 0, vy: 0, t: 0, life: 5, dmg: 10 });
  rWei.player.ult = rWei.player.ultMax;
  assert.equal(castUlt(rWei), true);
  assert.equal(rWei.player.waveStacks, 5);
  assert.equal(rWei.projectiles.filter((pr) => pr.kind === 'enemyBullet' && !pr.dead).length, 0);
  assert.ok(target.stunT > 0);

  // ── 2) 钱算子（qiansuanzi）：常态抑制远程吸魂，每 3.0s 批量铁算收魂享 1+0.08*N（封顶 ×2）；金算盘 → 乾坤金算盘；绝技「万贯清账令」
  const rQian = createRun({ heroId: 'qiansuanzi', mapId: 'qingshi', seed: 5120 });
  rQian.weapons.length = 0;
  rQian._spawnAcc = -99999;
  rQian._nextWaveT = 99999;

  // 在距玩家 64px 处撒 10 团魂火（普通角色磁吸半径 68px 会立刻吸走，钱算子未到 3s 不远程吸取）
  for (let i = 0; i < 10; i++) {
    dropXp(rQian, rQian.player.x + 64, rQian.player.y + (i - 5) * 3, 10);
  }
  stepRun(rQian, { moveX: 0, moveY: 0 }, DT);
  assert.equal(rQian.pickups.every((pk) => !pk.mag), true, '钱算子未到 3.0s 清算周期前不应触发普通远程磁吸');

  // 推进至 3.0s 触发批量清算：10 团 ×10 点魂火享 (1 + 0.08×10 = 1.80) 倍率 → 等级远高于无加成 100 XP
  const rCtrl = createRun({ heroId: 'zhou', mapId: 'qingshi', seed: 5120 });
  for (let i = 0; i < 10; i++) dropXp(rCtrl, rCtrl.player.x, rCtrl.player.y, 10);
  for (let i = 0; i < 5; i++) {
    rCtrl.status = 'playing';
    rCtrl._pendingLevels = 0;
    stepRun(rCtrl, { moveX: 0, moveY: 0 }, DT);
  }

  rQian.player._abacusPulseT = 2.99;
  for (let i = 0; i < 40; i++) {
    rQian.status = 'playing';
    rQian._pendingLevels = 0;
    stepRun(rQian, { moveX: 0, moveY: 0 }, DT);
  }
  assert.equal(rQian.stats.xpOrbsCollected, 10);
  const qianProg = rQian.player.level * 1000 + rQian.player.xp;
  const ctrlProg = rCtrl.player.level * 1000 + rCtrl.player.xp;
  assert.ok(qianProg > ctrlProg, `钱算子批量清算等级进度（${qianProg}）应显著高于普通拾取（${ctrlProg}）`);

  // 金算盘升满配阴阳账册开光为「乾坤金算盘」并发射 abacusBead 弹珠
  rQian.status = 'playing';
  rQian._pendingLevels = 0;
  for (let lv = 0; lv < 5; lv++) addOrUpgradeWeapon(rQian, 'gold_abacus');
  addOrUpgradeRelic(rQian, 'ledger_book');
  assert.equal(evolveWeapon(rQian, 'gold_abacus'), true);
  const e1 = spawnEnemy(rQian, 'lanternghost', rQian.player.x + 95, rQian.player.y, { fixedHp: 300 });
  const e2 = spawnEnemy(rQian, 'lanternghost', rQian.player.x + 135, rQian.player.y + 20, { fixedHp: 300 });
  rebuildHash(rQian);
  rQian.weapons[0].cd = 0;
  stepRun(rQian, { moveX: 0, moveY: 0 }, DT);
  assert.ok(rQian.projectiles.some((pr) => pr.kind === 'abacusBead' && pr.evolved), '乾坤金算盘应射出开光金算珠');
  for (let i = 0; i < 30; i++) {
    rQian.status = 'playing';
    rQian._pendingLevels = 0;
    stepRun(rQian, { moveX: 0, moveY: 0 }, DT);
  }
  assert.ok(e1.hp < 300 && e2.hp < 300, '乾坤金算盘弹珠应在多目标间弹射杀伤');

  // 钱算子绝技「万贯清账令」：引爆场上掉落物轰击邪祟并双倍吸收 + 赐铜钱
  const eUlt = spawnEnemy(rQian, 'lanternghost', rQian.player.x + 90, rQian.player.y, { fixedHp: 900 });
  rebuildHash(rQian);
  dropXp(rQian, eUlt.x + 12, eUlt.y, 12);
  dropPickup(rQian, 'coin', eUlt.x - 10, eUlt.y, 5);
  const coinsBeforeUlt = rQian.stats.coins;
  rQian.player.ult = rQian.player.ultMax;
  assert.equal(castUlt(rQian), true);
  assert.ok(rQian.stats.coins >= coinsBeforeUlt + 10, '万贯清账令应清算掉落物并赐予额外铜钱');
  for (let i = 0; i < 15; i++) {
    rQian.status = 'playing';
    rQian._pendingLevels = 0;
    stepRun(rQian, { moveX: 0, moveY: 0 }, DT);
  }
  assert.ok(eUlt.hp < 900, '万贯清账令引爆掉落物应对周围邪祟造成轰击伤害');

  // ── 3) 解锁进度、6 套重彩衣冠与 2 项功绩（hedengClear / xpOrbs5000）
  assert.equal(getHeroSkins('weier').length, 3);
  assert.equal(getHeroSkins('qiansuanzi').length, 3);
  assert.ok(HERO_SKINS.some((s) => s.id === 'weier_azure_tide'));
  assert.ok(HERO_SKINS.some((s) => s.id === 'qiansuanzi_gold_treasury'));
  assert.ok(ACHIEVEMENTS_BY_ID.hedengClear && ACHIEVEMENTS_BY_ID.xpOrbs5000);

  const save = migrateSave(defaultSave());
  assert.equal(heroUnlockProgress(save, 'weier').need, 1);
  assert.equal(heroUnlockProgress(save, 'qiansuanzi').need, 20000);

  const summary = endRun(rQian);
  assert.ok(summary.xpOrbsCollected >= 10);
  recordRun(save, {
    cleared: true,
    mode: 'main',
    mapId: 'hedeng',
    heroId: 'zhou',
    timeSec: 420,
    kills: 400,
    coins: 80,
    xpOrbsCollected: 20000,
  });
  evaluateUnlocks(save);
  const newlyAch = reconcileAchievements(save);
  assert.ok(save.unlockedHeroes.includes('weier'), '通关河灯水口应解锁芦二娘');
  assert.ok(save.unlockedHeroes.includes('qiansuanzi'), '累计吸取 20000 团魂火应解锁钱算子');
  assert.ok(newlyAch.includes('hedengClear') || save.achievements.hedengClear, '应达成水口破晓功绩');
  assert.ok(newlyAch.includes('xpOrbs5000') || save.achievements.xpOrbs5000, '应达成聚魂成海功绩');
  assert.equal(claimAchievement(save, 'hedengClear').ok, true);
  assert.equal(claimAchievement(save, 'xpOrbs5000').ok, true);
  assert.ok(save.cosmetics.owned.includes('weier_azure_tide'));
  assert.ok(save.cosmetics.owned.includes('qiansuanzi_gold_treasury'));
});
