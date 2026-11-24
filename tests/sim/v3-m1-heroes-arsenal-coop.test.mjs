// v3 M1 全面单元测试：6+6 槽位、16+16 民俗百器、6 守夜人（含 3 新绝技与解锁）、
// 自选初始武器与本命亲和（HERO_AFFINITY）、2–4 人纯确定性协同模拟、朱砂八卦阵救援、道友 AI、MVP 与守夜积分。

import test from 'node:test';
import assert from 'node:assert/strict';

import * as B from '../../src/sim/balance.js';
import {
  WEAPONS, WEAPON_IDS, RELICS, RELIC_IDS, HEROES, HERO_IDS, MAX_WEAPONS, MAX_RELICS,
  HERO_AFFINITY, MINI_WARDERS, ULT, DT, isHeroSignatureWeapon,
} from '../../src/sim/balance.js';
import {
  createRun, stepRun, chooseUpgrade, openChest, interactShrine, revive, enterEndless, endRun, computeRunScore,
} from '../../src/sim/run.js';
import {
  addOrUpgradeWeapon, getWeapon, evolveWeapon, weaponBaseDmg, weaponFullCooldown, weaponAreaMul, isWeaponSignature,
} from '../../src/sim/weapons.js';
import { addOrUpgradeRelic, relicEffect } from '../../src/sim/relics.js';
import { recomputeMods, healPlayer } from '../../src/sim/player.js';
import { spawnEnemy, rebuildHash, updateEnemies } from '../../src/sim/enemies.js';
import { spawnBoss } from '../../src/sim/bosses.js';
import { castUlt } from '../../src/sim/ultimate.js';
import { generateChoices, allMaxed } from '../../src/sim/levelup.js';
import {
  REVIVE_RADIUS, REVIVE_SECONDS, coopHpScale, coopSpawnScale, hurtTargetPlayer, withPlayerContext,
} from '../../src/sim/coop.js';
import { defaultSave } from '../../src/meta/save.js';
import { evaluateUnlocks, heroUnlockProgress, recordRun } from '../../src/meta/unlocks.js';
import * as Copy from '../../src/ui/copy.js';
import { createRenderer } from '../../src/render/renderer.js';
import { createHud } from '../../src/render/hud.js';
import { clearSpriteCache, heroSprite } from '../../src/render/sprites.js';
import { createAudio } from '../../src/audio/synth.js';

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `expected ${a} ≈ ${b}`);

// ───────────────────────── F1: 6+6 槽位与 4 把新民俗武器 / 4 件新法器 / 四更小头目 ─────────────────────────

test('V3-M1-01: 6+6 器物栏上限、16 对本命双射、新四法器精确数值与四更巡更小头目（430s）', () => {
  assert.equal(MAX_WEAPONS, 6);
  assert.equal(MAX_RELICS, 6);
  assert.equal(WEAPON_IDS.length, 16);
  assert.equal(RELIC_IDS.length, 16);
  assert.equal(MINI_WARDERS.length, 3);
  assert.equal(MINI_WARDERS[2].id, 'warder_430');
  assert.equal(MINI_WARDERS[2].time, 430);
  assert.equal(MINI_WARDERS[2].chest, true);

  const run = createRun({ seed: 3001, heroId: 'zhou' });
  const sixW = ['gong', 'talisman', 'taomujian', 'suohun_chain', 'zhinian_kite', 'nuo_drum'];
  for (const wid of sixW) {
    while (addOrUpgradeWeapon(run, wid));
  }
  assert.equal(run.weapons.length, 6);
  assert.equal(addOrUpgradeWeapon(run, 'lantern'), 0, '第 7 把武器不得突破 6 槽上限');

  const sixR = ['clapper', 'cinnabar', 'leijimu', 'yinpai', 'huoyao_pouch', 'wuse_mask'];
  for (const rid of sixR) {
    while (addOrUpgradeRelic(run, rid));
  }
  assert.equal(run.relics.length, 6);
  assert.equal(addOrUpgradeRelic(run, 'censer'), 0, '第 7 件法器不得突破 6 槽上限');
  recomputeMods(run);
  assert.equal(allMaxed(run), true);

  // 新四法器数值校验
  assert.equal(relicEffect('leijimu', 1).bonusPierce, 0);
  assert.equal(relicEffect('leijimu', 2).bonusPierce, 1);
  assert.equal(relicEffect('leijimu', 5).bonusPierce, 2);
  near(relicEffect('leijimu', 5).cdr, 0.20);
  near(relicEffect('leijimu', 5).critChance, 0.15);

  near(relicEffect('yinpai', 5).dmgPct, 0.30);
  assert.equal(relicEffect('yinpai', 5).armor, 5);
  near(relicEffect('yinpai', 5).controlDurPct, 0.40);
  assert.ok(run.mods.controlDurMul >= 1.40);

  near(relicEffect('huoyao_pouch', 5).areaPct, 0.35);
  near(relicEffect('huoyao_pouch', 5).dmgPct, 0.25);

  near(relicEffect('wuse_mask', 5).cdr, 0.20);
  near(relicEffect('wuse_mask', 5).speedPct, 0.20);
  near(relicEffect('wuse_mask', 5).ultChargePct, 0.40);

  // 430s 催命吹鼓头小头目刷新且必带供盒
  const rWarder = createRun({ seed: 3002, heroId: 'zhou' });
  rWarder.time = 429.96;
  for (let s = 0; s < 5; s++) {
    rWarder.player.invulnT = 99;
    stepRun(rWarder, {}, DT);
  }
  const w430 = rWarder.enemies.find((e) => e.warder && e.warderName === '催命吹鼓头');
  assert.ok(w430 && w430.chest === true && w430.affix === 'mirror_twin');
});

test('V3-M1-02: 四把新增民俗武器（桃木飞剑 / 无常锁魂链 / 纸鸢火鸦 / 傩神战鼓）基础与开光神兵全机制实战验证', () => {
  // 1) 桃木飞剑 → 天罡雷木剑阵（flyingSword 穿透 + 每三击天罡神雷 thunderBolt）
  {
    const r = createRun({ seed: 3011, heroId: 'zhou' });
    r.weapons.length = 0;
    while (addOrUpgradeWeapon(r, 'taomujian'));
    addOrUpgradeRelic(r, 'leijimu');
    assert.equal(evolveWeapon(r, 'taomujian'), true);
    recomputeMods(r);
    for (let i = 0; i < 6; i++) {
      const e = spawnEnemy(r, 'sedan', 70 + i * 18, (i % 2) * 14);
      e.hp = e.maxHp = 20000;
    }
    getWeapon(r, 'taomujian').cd = 0;
    let sawSword = false;
    let sawThunder = false;
    for (let f = 0; f < 30; f++) {
      r.player.invulnT = 99;
      stepRun(r, {}, DT);
      if (r.projectiles.some((p) => p.kind === 'flyingSword')) sawSword = true;
      if (r.projectiles.some((p) => p.kind === 'thunderBolt' && p.weaponId === 'taomujian')) sawThunder = true;
    }
    assert.ok(sawSword, '应发射 flyingSword 飞剑弹体');
    assert.ok(sawThunder, '开光天罡雷木剑阵每三击应引落 thunderBolt 神雷');
    assert.ok(r.stats.damageDealt > 200);
  }

  // 2) 无常锁魂链 → 黑白无常夺魄索（破除纸甲 + 牵引定身易伤 + 夺魄延时爆裂）
  {
    const r = createRun({ seed: 3012, heroId: 'tiejiang' });
    while (addOrUpgradeWeapon(r, 'suohun_chain'));
    addOrUpgradeRelic(r, 'yinpai');
    assert.equal(evolveWeapon(r, 'suohun_chain'), true);
    recomputeMods(r);
    const elite = spawnEnemy(r, 'lanternghost', 140, 0, { elite: true, affix: 'paper_armor' });
    elite.hp = elite.maxHp = 50000;
    assert.equal(elite.paperArmor, 6);
    getWeapon(r, 'suohun_chain').cd = 0;
    let sawChain = false;
    let sawChainBurst = false;
    for (let f = 0; f < 20; f++) {
      r.player.invulnT = 99;
      stepRun(r, {}, DT);
      if (r.projectiles.some((p) => p.kind === 'soulChain')) sawChain = true;
      if (r.events.some((ev) => ev.type === 'explosion' && ev.kind === 'chainBurst')) sawChainBurst = true;
    }
    assert.ok(sawChain, '应生成 soulChain 锁魂链弹体');
    assert.ok(sawChainBurst, '开光夺魄索应触发 chainBurst 阴煞爆裂');
    assert.equal(elite.paperArmor, 0, '无常锁魂链破甲攻击应直接粉碎精英纸甲');
    assert.ok(elite.vulnT > 0 && elite.stunT > 0);
  }

  // 3) 纸鸢火鸦 → 金乌焚天火鸦阵（俯冲轰炸 + 流火径 emberZone + 阳炎印记）
  {
    const r = createRun({ seed: 3013, heroId: 'mian' });
    r.weapons.length = 0;
    while (addOrUpgradeWeapon(r, 'zhinian_kite'));
    addOrUpgradeRelic(r, 'huoyao_pouch');
    assert.equal(evolveWeapon(r, 'zhinian_kite'), true);
    recomputeMods(r);
    const target = spawnEnemy(r, 'sedan', 160, 0);
    target.hp = target.maxHp = 40000;
    getWeapon(r, 'zhinian_kite').cd = 0;
    let sawCrow = false;
    let sawTrail = false;
    let sawBlast = false;
    for (let f = 0; f < 45; f++) {
      r.player.invulnT = 99;
      stepRun(r, {}, DT);
      if (r.projectiles.some((p) => p.kind === 'fireCrow')) sawCrow = true;
      if (r.projectiles.some((p) => p.kind === 'inkPool' && p.weaponId === 'zhinian_kite')) sawTrail = true;
      if (r.events.some((ev) => ev.type === 'explosion' && ev.kind === 'goldenCrow')) sawBlast = true;
    }
    assert.ok(sawCrow && sawTrail && sawBlast, `crow=${sawCrow} trail=${sawTrail} blast=${sawBlast}`);
    assert.ok(target.yangyanMarkT > 0, '金乌火鸦爆裂应刻印阳炎印记');
  }

  // 4) 傩神战鼓 → 太古百相傩坛（立鼓四拍震波 + 净除敌弹 + 末拍五方傩面连爆）
  {
    const r = createRun({ seed: 3014, heroId: 'nuoxi' });
    while (addOrUpgradeWeapon(r, 'nuo_drum'));
    addOrUpgradeRelic(r, 'wuse_mask');
    assert.equal(evolveWeapon(r, 'nuo_drum'), true);
    recomputeMods(r);
    const foe = spawnEnemy(r, 'sedan', 60, 0);
    foe.hp = foe.maxHp = 60000;
    r.projectiles.push({ id: 8801, kind: 'enemyBullet', x: 65, y: 0, r: 6, vx: 0, vy: 0, t: 0, life: 10, dmg: 10 });
    getWeapon(r, 'nuo_drum').cd = 0;
    let sawDrum = false;
    let maskBursts = 0;
    for (let f = 0; f < 95; f++) {
      r.player.invulnT = 99;
      stepRun(r, {}, DT);
      if (r.projectiles.some((p) => p.kind === 'nuoDrum')) sawDrum = true;
      for (const ev of r.events) {
        if (ev.type === 'explosion' && ev.kind === 'nuoMaskBurst') maskBursts++;
      }
    }
    assert.ok(sawDrum, '应布下 nuoDrum 战鼓图腾');
    assert.equal(r.projectiles.some((p) => p.id === 8801), false, '开光傩坛震波应净除范围内敌弹');
    assert.ok(maskBursts >= 5, `末拍应触发五方傩面连爆，实得 ${maskBursts}`);
  }
});

// ───────────────────────── F2 & F3: 6 角色、3 新绝技、自选起手武器与本命亲和 ─────────────────────────

test('V3-M1-03: 新三名守夜人（沈观星 / 石敢当 / 柳青衣）被动词条、专属大招与英雄解锁条件验证', () => {
  assert.deepEqual(HERO_IDS, ['zhou', 'mian', 'daotong', 'yinyang', 'tiejiang', 'nuoxi']);

  // 1) 沈观星：范围 +15%、弹速持续 +15%，大招「奇门遁甲大阵」
  const rYin = createRun({ seed: 3021, heroId: 'yinyang' });
  near(rYin.mods.areaMul, 1.15);
  near(rYin.mods.durMul, 1.15);
  assert.equal(rYin.weapons[0].id, 'compass');
  assert.equal(rYin.signatureStart, true);
  const foeY = spawnEnemy(rYin, 'sedan', 90, 0);
  foeY.hp = foeY.maxHp = 50000;
  rebuildHash(rYin);
  rYin.player.ult = ULT.cost;
  assert.equal(castUlt(rYin), true);
  assert.ok(rYin.projectiles.some((p) => p.kind === 'compassField' && p.subKind === 'qimenArray'));
  let gateBlasts = 0;
  for (let i = 0; i < 75; i++) {
    rYin.player.invulnT = 99;
    stepRun(rYin, {}, DT);
    for (const ev of rYin.events) if (ev.type === 'explosion' && ev.kind === 'compassStar') gateBlasts++;
  }
  assert.equal(gateBlasts, ULT.yinyang.gates);

  // 2) 石敢当：护甲 +2、伤害 +12%，大招「十方熔金镇狱锤」
  const rTie = createRun({ seed: 3022, heroId: 'tiejiang' });
  assert.equal(rTie.player.armor, 2);
  near(rTie.mods.dmgPct, 0.12);
  assert.equal(rTie.weapons[0].id, 'suohun_chain');
  const armored = spawnEnemy(rTie, 'sedan', 80, 0, { elite: true, affix: 'paper_armor' });
  armored.hp = armored.maxHp = 50000;
  rebuildHash(rTie);
  rTie.player.ult = ULT.cost;
  assert.equal(castUlt(rTie), true);
  assert.ok(rTie.player.invulnT >= ULT.tiejiang.wardInvuln - 0.01, '石敢当大招赋予金身无敌');
  assert.equal(armored.paperArmor, 0, '十方熔金镇狱锤碎甲直破纸甲');
  assert.ok(rTie.projectiles.some((p) => p.kind === 'inkPool' && p.subKind === 'moltenZone'));
  let anvilBlasts = 0;
  for (let i = 0; i < 50; i++) {
    stepRun(rTie, {}, DT);
    for (const ev of rTie.events) if (ev.type === 'explosion' && ev.kind === 'forgeAnvil') anvilBlasts++;
  }
  assert.equal(anvilBlasts, ULT.tiejiang.anvils);

  // 3) 柳青衣：移速 +12%、冷却缩减 +10%，大招「大傩逐疫百相舞」
  const rNuo = createRun({ seed: 3023, heroId: 'nuoxi' });
  near(rNuo.player.speed, B.PLAYER_BASE.speed * 1.12);
  near(rNuo.mods.cdMul, 0.90);
  const spdBefore = rNuo.player.speed;
  const cdBefore = rNuo.mods.cdMul;
  rNuo.player.ult = ULT.cost;
  assert.equal(castUlt(rNuo), true);
  assert.ok(rNuo.projectiles.some((p) => p.kind === 'nuoDanceRing'));
  assert.ok(rNuo.player.speed > spdBefore * 1.20, '大傩疾舞期间移速提升');
  assert.ok(rNuo.mods.cdMul < cdBefore, '大傩疾舞期间冷却进一步缩短');

  // 4) 新三角色解锁条件判定（沈观星 2 开光 / 石敢当累计 2500 杀 / 柳青衣 6 件同门羁绊）
  const save = defaultSave();
  save.stats.totalKills = 2000;
  const rec = recordRun(save, {
    heroId: 'zhou',
    nightLevel: 0,
    cleared: false,
    timeSec: 360,
    kills: 550,
    coins: 120,
    evolvedCount: 2,
    maxSynergyTier: 6,
    weapons: [{ id: 'gong', level: 5, evolved: true }, { id: 'bell', level: 5, evolved: true }],
    relics: [],
  }, 1700009000);
  const unlockedIds = rec.unlocks.filter((u) => u.kind === 'hero').map((u) => u.id);
  assert.deepEqual(unlockedIds.sort(), ['nuoxi', 'tiejiang', 'yinyang']);
  assert.deepEqual(heroUnlockProgress(save, 'tiejiang'), { have: 2500, need: 2500 });
});

test('V3-M1-04: 自选初始武器、本命亲和加成（伤害 ×1.25 / 冷却 ×0.90 / 范围 +15%）与 unlockedWeapons 候选池过滤', () => {
  // 老周用本命更锣 vs 借用符纸开局，再后天习得更锣
  const rSig = createRun({ seed: 3031, heroId: 'zhou', startWeapon: 'gong' });
  const rBorrow = createRun({
    seed: 3031,
    heroId: 'zhou',
    startWeapon: 'talisman',
    unlockedWeapons: ['gong', 'talisman', 'taomujian'],
  });
  const rDaotong = createRun({ seed: 3031, heroId: 'daotong', startWeapon: 'talisman' });

  assert.equal(rSig.signatureStart, true);
  assert.equal(rBorrow.signatureStart, false);
  assert.equal(rBorrow.weapons[0].id, 'talisman');
  assert.equal(isWeaponSignature(rBorrow.weapons[0], rBorrow), false);
  assert.equal(isWeaponSignature(rDaotong.weapons[0], rDaotong), true);

  // 同为 1 级符纸：小道童本命符纸基础伤害 ×1.25、冷却 ×0.90（对比老周非本命符纸）
  near(weaponBaseDmg(rDaotong.weapons[0], rDaotong) / weaponBaseDmg(rBorrow.weapons[0], rBorrow), HERO_AFFINITY.dmgMul);
  near(weaponFullCooldown(rDaotong, rDaotong.weapons[0]) / weaponFullCooldown(rBorrow, rBorrow.weapons[0]), HERO_AFFINITY.cdMul);
  near(weaponAreaMul(rSig, rSig.weapons[0]) / rSig.mods.areaMul, 1 + HERO_AFFINITY.areaBonus);

  // 老周借符纸开局后，在局内升级拿到更锣时依然激活老周本命更锣亲和
  addOrUpgradeWeapon(rBorrow, 'gong');
  const lateGong = getWeapon(rBorrow, 'gong');
  assert.equal(lateGong.signature, true);
  near(weaponBaseDmg(lateGong, rBorrow), weaponBaseDmg(rSig.weapons[0], rSig));

  // unlockedWeapons 严格过滤新武器候选，绝不抽出未解锁武器
  for (let k = 0; k < 40; k++) {
    const chs = generateChoices(rBorrow);
    for (const c of chs) {
      if (c.kind === 'weapon' && c.isNew) {
        assert.ok(['gong', 'talisman', 'taomujian'].includes(c.id), `抽出了未解锁武器: ${c.id}`);
      }
    }
  }
});

// ───────────────────────── F14 & F16: 2–4 人协同模拟、八卦救援、AI 道友、MVP 与守夜积分 ─────────────────────────

test('V3-M1-05: 2–4 人难度缩放、倒地不团灭、朱砂八卦阵（R=48, 2.4s）单人/双人加速救援与全员阵亡判定', () => {
  const r1 = createRun({ seed: 3041, heroId: 'zhou' });
  const r2 = createRun({
    seed: 3041,
    coop: { party: [{ heroId: 'zhou' }, { heroId: 'mian' }] },
  });
  const r4 = createRun({
    seed: 3041,
    coop: {
      party: [
        { heroId: 'zhou', name: '老周' },
        { heroId: 'mian', name: '阿绵' },
        { heroId: 'yinyang', name: '沈观星' },
        { heroId: 'tiejiang', name: '石敢当' },
      ],
    },
  });

  assert.equal(r1.players.length, 1);
  assert.equal(r1.players[0], r1.player);
  near(coopHpScale(r1), 1.0);
  near(coopHpScale(r2), 1.55);
  near(coopHpScale(r4), 2.65);
  near(coopSpawnScale(r2), 1.30);
  near(coopSpawnScale(r4), 1.90);

  const m1 = spawnEnemy(r1, 'lanternghost', 200, 0);
  const m4 = spawnEnemy(r4, 'lanternghost', 200, 0);
  near(m4.maxHp / m1.maxHp, 2.65, 0.05);
  const b1 = spawnBoss(r1, 'horse');
  const b4 = spawnBoss(r4, 'horse');
  near(b4.maxHp / b1.maxHp, 2.65, 0.02);

  // 清场测试精确救援数学：老周倒地，但队友存活 -> status 保持 playing
  r4.enemies.length = 0;
  r4.weapons.length = 0;
  for (const pl of r4.players) pl.weapons.length = 0;
  r4.players[1].x = 200; r4.players[1].y = 0;
  r4.players[2].x = 200; r4.players[2].y = 40;
  r4.players[3].x = 200; r4.players[3].y = -40;

  hurtTargetPlayer(r4, r4.players[0], 9999);
  stepRun(r4, {}, DT);
  assert.equal(r4.players[0].downed, true);
  assert.equal(r4.status, 'playing', '仍有存活队友时不得判定死局');

  // 圈外（距离 > 48）不涨进度
  for (let i = 0; i < 20; i++) stepRun(r4, {}, DT);
  assert.equal(r4.players[0].reviveProgress, 0);

  // 1 名队友进圈（距离 24 <= 48）站立 1.2 秒 -> 进度约 0.5
  r4.players[1].x = 24; r4.players[1].y = 0;
  const halfSteps = Math.round((REVIVE_SECONDS * 0.5) / DT);
  for (let i = 0; i < halfSteps; i++) stepRun(r4, {}, DT);
  assert.ok(r4.players[0].reviveProgress > 0.46 && r4.players[0].reviveProgress < 0.54, `prog=${r4.players[0].reviveProgress}`);
  assert.equal(r4.players[0].downed, true);

  // 第 2 名队友也进圈（双人同救 2× 速率）：再过 0.65 秒即满进度扶起！
  r4.players[2].x = -20; r4.players[2].y = 0;
  let sawCoopRevive = false;
  for (let i = 0; i < Math.round(0.68 / DT); i++) {
    stepRun(r4, {}, DT);
    if (r4.events.some((e) => e.type === 'coopRevive')) sawCoopRevive = true;
  }
  assert.equal(sawCoopRevive, true);
  assert.equal(r4.players[0].downed, false);
  assert.equal(r4.players[0].hp, Math.ceil(r4.players[0].maxHp * 0.5));
  assert.ok(r4.players[0].invulnT >= 2.3);
  assert.equal(r4.players[2].stats.revivesDone, 1, '最近救援者记录 1 次救起功劳');

  // 全员倒地 -> status 切换为 dead；广告复活可全队起身再战
  for (const pl of r4.players) {
    pl.invulnT = 0;
    hurtTargetPlayer(r4, pl, 9999);
  }
  stepRun(r4, {}, DT);
  assert.equal(r4.status, 'dead');
  assert.equal(revive(r4), true);
  assert.equal(r4.status, 'playing');
  assert.ok(r4.players.every((pl) => !pl.downed && pl.hp === pl.maxHp));
});

test('V3-M1-06: 智能道友 AI（isBot: true）自动奔赴倒地玩家并驻留八卦阵完成救援 + 4P 确定性与性能预算', () => {
  const run = createRun({
    seed: 3051,
    coop: {
      party: [
        { heroId: 'zhou', name: '掌灯人', isBot: false },
        { heroId: 'nuoxi', name: '道友·柳青衣', isBot: true },
      ],
    },
  });
  run.enemies.length = 0;
  run.players[0].x = 0;
  run.players[0].y = 0;
  run.players[1].x = 150;
  run.players[1].y = 0;
  hurtTargetPlayer(run, run.players[0], 9999);

  // 道友 AI 从 150px 外自动跑进 <= 48px 八卦阵并驻留 2.4s 救起队长
  for (let step = 0; step < 300; step++) {
    stepRun(run, { moveX: 0, moveY: 0 }, DT);
    if (!run.players[0].downed) break;
  }
  assert.equal(run.players[0].downed, false, '智能道友 AI 应自主跑入八卦阵把倒地玩家救起');
  assert.ok(Math.hypot(run.players[1].x - run.players[0].x, run.players[1].y - run.players[0].y) <= REVIVE_RADIUS);
  assert.equal(run.players[1].stats.revivesDone, 1);

  // 4P 确定性散列校验 + JSON 序列化无环验证 + 性能预算 < 4ms/step
  function runCoopScenario(seed) {
    const r = createRun({
      seed,
      coop: {
        party: [
          { heroId: 'zhou', startWeapon: 'taomujian', isBot: false },
          { heroId: 'yinyang', isBot: true },
          { heroId: 'tiejiang', isBot: true },
          { heroId: 'nuoxi', isBot: false },
        ],
      },
    });
    for (let i = 0; i < 180; i++) {
      if (r.status === 'levelup') { chooseUpgrade(r, i % r.choices.length); continue; }
      if (r.status === 'chest') { openChest(r); continue; }
      const a = i * 0.09;
      stepRun(r, {
        0: { moveX: Math.cos(a), moveY: Math.sin(a), ultimate: i === 60 },
        3: { moveX: -Math.sin(a), moveY: Math.cos(a), ultimate: false },
      }, DT);
    }
    const serialized = JSON.stringify(r);
    assert.ok(serialized.length > 200);
    return JSON.stringify({
      t: r.time.toFixed(6),
      pls: r.players.map((p) => [p.x.toFixed(4), p.y.toFixed(4), p.hp, p.level, p.weapons.length, p.stats]),
      ens: r.enemies.map((e) => [e.id, e.type, e.x.toFixed(3), e.y.toFixed(3), e.hp]),
      rng: r.rng.getState(),
    });
  }
  const snap1 = runCoopScenario('coop-det-seed');
  const snap2 = runCoopScenario('coop-det-seed');
  const snap3 = runCoopScenario('coop-other-seed');
  assert.equal(snap1, snap2, '4 人协同模拟同种子同输入必须 100% 确定性一致');
  assert.notEqual(snap1, snap3);

  // 性能预算校验：4 人同场 + 240 敌，单步远低于 4ms
  const perfRun = createRun({
    seed: 3059,
    coop: {
      party: [
        { heroId: 'zhou', isBot: true },
        { heroId: 'yinyang', isBot: true },
        { heroId: 'tiejiang', isBot: true },
        { heroId: 'nuoxi', isBot: true },
      ],
    },
  });
  for (const pl of perfRun.players) pl.hp = pl.maxHp = 1e8;
  for (let k = 0; k < 240; k++) {
    const a = k * 2.399;
    const d = 90 + (k % 30) * 9;
    const e = spawnEnemy(perfRun, 'lanternghost', Math.cos(a) * d, Math.sin(a) * d);
    e.hp = e.maxHp = 1e7;
  }
  for (let w = 0; w < 15; w++) stepRun(perfRun, {}, DT);
  const N = 90;
  const t0 = performance.now();
  for (let i = 0; i < N; i++) {
    if (perfRun.status === 'levelup') chooseUpgrade(perfRun, 0);
    else if (perfRun.status === 'chest') openChest(perfRun);
    stepRun(perfRun, {}, DT);
  }
  const avgMs = (performance.now() - t0) / N;
  assert.ok(avgMs < 4, `4P 协同模拟每帧耗时应 < 4ms，实测 ${avgMs.toFixed(3)}ms`);
});

test('V3-M1-07: computeRunScore 守夜积分单调性与 endRun 小队 MVP 评选', () => {
  const rLow = createRun({ seed: 3061, heroId: 'zhou', nightLevel: 0 });
  rLow.time = 180;
  rLow.stats.kills = 120;
  const sLow = computeRunScore(rLow, false);

  const rHigh = createRun({
    seed: 3061,
    nightLevel: 2,
    coop: {
      party: [
        { heroId: 'zhou', name: '老周' },
        { heroId: 'yinyang', name: '沈观星' },
      ],
    },
  });
  rHigh.time = 600;
  rHigh._cleared = true;
  rHigh.stats.kills = 900;
  rHigh.stats.killsByType = { horse: 1, umbrella: 1, youshen: 1 };
  rHigh.weapons[0].evolved = true;
  rHigh.players[0].stats.damageDealt = 40000;
  rHigh.players[0].stats.kills = 300;
  rHigh.players[1].stats.damageDealt = 95000;
  rHigh.players[1].stats.kills = 600;
  rHigh.players[1].stats.revivesDone = 2;

  const summary = endRun(rHigh);
  assert.ok(Number.isInteger(summary.score) && summary.score > sLow * 5, `${summary.score} vs ${sLow}`);
  assert.equal(summary.bossKills, 3);
  assert.equal(summary.evolvedCount, 1);
  assert.equal(summary.coopSize, 2);
  assert.equal(summary.revivesDone, 2);
  assert.equal(summary.squad.length, 2);
  assert.equal(summary.squad.filter((m) => m.mvp).length, 1);
  assert.equal(summary.squad[1].mvp, true, '伤害/击杀/救援更高的 1 号位队友应获评唯一 MVP');
});

test('V3-M1-08: 6+6 窄屏 HUD、4 新武器弹体、联机倒地八卦阵渲染与新 16 兵刃 + 协同救援 WebAudio 合成无异常', () => {
  const prevOC = globalThis.OffscreenCanvas;
  const prevAC = globalThis.AudioContext;
  const errors = [];

  class MockCanvas {
    constructor(w = 64, h = 64) {
      this.width = w; this.height = h; this.clientWidth = w; this.clientHeight = h;
      this._ctx = null;
    }
    getContext() {
      if (this._ctx) return this._ctx;
      const chk = (op, arr) => {
        for (const v of arr) if (typeof v !== 'number' || !Number.isFinite(v)) errors.push(`${op}:${v}`);
      };
      this._ctx = {
        canvas: this, lineWidth: 1, globalAlpha: 1, fillStyle: '#000', strokeStyle: '#000',
        font: '12px serif', textAlign: 'left', textBaseline: 'alphabetic',
        save() {}, restore() {}, beginPath() {}, closePath() {}, fill() {}, stroke() {}, clip() {},
        scale(x, y) { chk('scale', [x, y]); }, translate(x, y) { chk('translate', [x, y]); }, rotate(a) { chk('rotate', [a]); },
        setTransform(...a) { chk('setTransform', a); },
        moveTo(x, y) { chk('moveTo', [x, y]); }, lineTo(x, y) { chk('lineTo', [x, y]); },
        quadraticCurveTo(...a) { chk('quad', a); }, bezierCurveTo(...a) { chk('bezier', a); },
        arc(x, y, r, s, e) { chk('arc', [x, y, r, s, e]); if (r < 0) errors.push(`arc r<0:${r}`); },
        ellipse(x, y, rx, ry) { chk('ellipse', [x, y, rx, ry]); if (rx < 0 || ry < 0) errors.push(`ellipse r<0`); },
        rect(...a) { chk('rect', a); }, fillRect(...a) { chk('fillRect', a); }, strokeRect(...a) { chk('strokeRect', a); },
        clearRect(...a) { chk('clearRect', a); }, fillText(t, x, y) { chk('fillText', [x, y]); },
        strokeText(t, x, y) { chk('strokeText', [x, y]); }, measureText(t) { return { width: String(t).length * 10 }; },
        drawImage(_img, ...a) { chk('drawImage', a); }, createPattern() { return {}; },
        createRadialGradient(...a) {
          chk('radial', a);
          return { addColorStop(o) { chk('stop', [o]); } };
        },
        createImageData(w, h) { return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }; },
        putImageData() {},
      };
      return this._ctx;
    }
    toDataURL() { return 'data:image/png;base64,AA=='; }
  }

  let audioNodes = 0;
  let mockNow = 0;
  class MockAudioContext {
    constructor() { this.sampleRate = 22050; this.state = 'running'; this.destination = {}; }
    get currentTime() { return mockNow; }
    resume() { this.state = 'running'; return Promise.resolve(); }
    createDynamicsCompressor() { return { threshold: { value: 0 }, ratio: { value: 1 }, connect() {} }; }
    createGain() { return { gain: { value: 1, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} }; }
    createBiquadFilter() { return { type: 'lowpass', Q: { value: 1 }, frequency: { value: 1000, setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} }; }
    createBuffer(_c, len, sr) { return { sampleRate: sr, length: len, getChannelData: () => new Float32Array(len) }; }
    createOscillator() { audioNodes++; return { type: 'sine', frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, start() {}, stop() {} }; }
    createBufferSource() { audioNodes++; return { buffer: null, loop: false, playbackRate: { value: 1 }, connect() {}, start() {}, stop() {} }; }
  }

  globalThis.OffscreenCanvas = MockCanvas;
  globalThis.AudioContext = MockAudioContext;
  clearSpriteCache();
  try {
    const run = createRun({
      seed: 3071,
      coop: {
        party: [
          { heroId: 'yinyang', name: '沈观星' },
          { heroId: 'tiejiang', name: '石敢当' },
          { heroId: 'nuoxi', name: '柳青衣' },
        ],
      },
    });
    for (const wid of ['taomujian', 'suohun_chain', 'zhinian_kite', 'nuo_drum', 'gong']) {
      while (addOrUpgradeWeapon(run, wid));
      evolveWeapon(run, wid, 'paired');
    }
    for (const rid of ['leijimu', 'yinpai', 'huoyao_pouch', 'wuse_mask', 'clapper', 'soulwick']) {
      while (addOrUpgradeRelic(run, rid));
    }
    recomputeMods(run);
    const dummy = spawnEnemy(run, 'sedan', 90, 10);
    dummy.hp = dummy.maxHp = 99999;
    for (const w of run.weapons) w.cd = 0;
    run.players[1].downed = true;
    run.players[1].reviveProgress = 0.62;
    stepRun(run, {}, DT);

    const screen = new MockCanvas(360, 780);
    const renderer = createRenderer(screen, { lowQuality: false });
    renderer.consumeEvents(run.events);
    renderer.render(run, 1, DT, { shake: true, dmgText: 'all' });
    assert.deepEqual(errors, [], `360x780 6+6 HUD 与协同场景出现非法 Canvas2D 数值: ${errors.join(', ')}`);

    const audio = createAudio();
    audio.unlock();
    for (const wid of ['taomujian', 'suohun_chain', 'zhinian_kite', 'nuo_drum']) {
      mockNow += 2;
      const before = audioNodes;
      audio.onEvents([{ type: 'fire', weaponId: wid, evolved: true }]);
      assert.ok(audioNodes > before, `fire_${wid} 应合成真实 WebAudio 节点`);
    }
    mockNow += 2;
    const bDown = audioNodes;
    audio.onEvents([{ type: 'allyDowned' }]);
    assert.ok(audioNodes > bDown);
    mockNow += 2;
    const bRev = audioNodes;
    audio.onEvents([{ type: 'coopRevive' }]);
    assert.ok(audioNodes > bRev);
  } finally {
    clearSpriteCache();
    if (prevOC === undefined) delete globalThis.OffscreenCanvas; else globalThis.OffscreenCanvas = prevOC;
    if (prevAC === undefined) delete globalThis.AudioContext; else globalThis.AudioContext = prevAC;
  }
});

// ───────────────────────── Iteration 2 专项回归守卫（Fixes 2–7）─────────────────────────

test('V3-M1-09: 原型链键（__proto__ / constructor）注入免疫与 createRun/endRun/computeRunScore 恶形数值硬化', () => {
  const prevOC = globalThis.OffscreenCanvas;
  class TinyCanvas {
    constructor(w = 64, h = 64) { this.width = w; this.height = h; }
    getContext() {
      return {
        canvas: this, lineWidth: 1, globalAlpha: 1, fillStyle: '#000', strokeStyle: '#000',
        font: '12px serif', textAlign: 'left', textBaseline: 'alphabetic',
        save() {}, restore() {}, beginPath() {}, closePath() {}, fill() {}, stroke() {}, clip() {},
        scale() {}, translate() {}, rotate() {}, setTransform() {}, moveTo() {}, lineTo() {},
        quadraticCurveTo() {}, bezierCurveTo() {}, arc() {}, ellipse() {}, rect() {},
        fillRect() {}, strokeRect() {}, clearRect() {}, fillText() {}, strokeText() {},
        measureText(t) { return { width: String(t).length * 10 }; },
        drawImage() {}, createPattern() { return {}; },
        createRadialGradient() { return { addColorStop() {} }; },
        createImageData(w, h) { return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }; },
        putImageData() {},
      };
    }
  }
  globalThis.OffscreenCanvas = TinyCanvas;
  clearSpriteCache();
  try {
    for (const protoKey of ['__proto__', 'constructor', 'toString', 'valueOf']) {
      assert.equal(isHeroSignatureWeapon(protoKey, 'gong'), false);
      assert.equal(isHeroSignatureWeapon('zhou', protoKey), false);
      const rProto = createRun({
        heroId: protoKey,
        startWeapon: protoKey,
        coop: { party: Array(10).fill({ heroId: protoKey, startWeapon: 'invalid' }) },
      });
      assert.equal(rProto.heroId, 'zhou');
      assert.equal(rProto.startWeapon, 'gong');
      assert.equal(rProto.players.length, 4);
      for (const pl of rProto.players) {
        assert.equal(pl.heroId, 'zhou');
        assert.equal(pl.startWeapon, 'gong');
        assert.equal(pl.weapons.length, 1);
        assert.equal(pl.weapons[0].id, 'gong');
        assert.ok(typeof pl.name === 'string' && pl.name.length > 0);
      }
      const sp = heroSprite(protoKey, 0, false, null);
      assert.ok(sp && sp.canvas);
      assert.equal(Copy.heroInfo(protoKey).id, 'zhou');
      assert.equal(Copy.weaponPairRelic(protoKey), null);
      assert.equal(Copy.pairOf(protoKey), null);
      assert.equal(Copy.relicTotalDesc(protoKey, 5), '');
      assert.equal(Copy.describeChoice({ kind: 'weapon', id: protoKey }).evolveHint, '');
      assert.equal(Copy.describeChoice({ kind: 'relic', id: protoKey }).evolveHint, '');
    }

    // createRun(null) 与非有限 meta 安全兜底
    const rNull = createRun(null);
    assert.equal(rNull.heroId, 'zhou');
    assert.equal(rNull.weapons[0].id, 'gong');
    const rBadMeta = createRun({ meta: { maxHpPct: Infinity, dmgPct: NaN, coinPct: -Infinity, armor: NaN } });
    assert.equal(rBadMeta.player.hp, 100);
    assert.equal(rBadMeta.player.maxHp, 100);
    assert.equal(rBadMeta.mods.dmgPct, 0);

    // endRun(null | NaN | ±Infinity) 与脏字段不泄漏 NaN/Infinity、绝不误发 1e9 铜钱
    for (const badRun of [null, undefined, NaN, Infinity, -Infinity, 'bad']) {
      const s = endRun(badRun);
      assert.equal(s.score, 0);
      assert.equal(s.coins, 0);
      assert.deepEqual(s.squad, []);
    }
    const rDirty = createRun({ seed: 91 });
    rDirty.time = NaN;
    rDirty.stats.kills = Infinity;
    rDirty.stats.maxHit = NaN;
    rDirty.nightLevel = NaN;
    const sumDirty = endRun(rDirty);
    assert.equal(sumDirty.timeSec, 0);
    assert.equal(sumDirty.kills, 0);
    assert.equal(sumDirty.maxHit, 0);
    assert.equal(sumDirty.coins, 0, 'nightLevel=NaN 时绝不能错误发放 1e9 铜钱');

    const rHugeBoss = createRun({ seed: 92 });
    rHugeBoss.stats.killsByType = { horse: 1e308 };
    assert.equal(computeRunScore(rHugeBoss), B.SCORE_TUNING.maxScore);
  } finally {
    clearSpriteCache();
    if (prevOC === undefined) delete globalThis.OffscreenCanvas; else globalThis.OffscreenCanvas = prevOC;
  }
});

test('V3-M1-10: 协同副弹体/延时爆裂/持续灼烧流血 ownerSlot 归属、withPlayerContext 重入与 nuoBeat 末拍清弹', () => {
  const r = createRun({
    seed: 3081,
    coop: {
      party: [
        { heroId: 'zhou', name: '零号观察者' },
        { heroId: 'yinyang', name: '一号输出', attackVfx: 'jade_ghostfire' },
      ],
    },
  });

  // 嵌套重入 0 -> 1 -> 0 必须精确切回 0 号位并无损恢复 1 号位
  const nestedCheck = withPlayerContext(r, r.players[1], () => {
    const outerHero = r.player.heroId;
    const inner = withPlayerContext(r, r.players[0], () => [r.player.heroId, r._activeSlot]);
    return [outerHero, inner, r.player.heroId, r._activeSlot];
  });
  assert.deepEqual(nestedCheck, ['yinyang', ['zhou', 0], 'yinyang', 1]);
  assert.equal(r.player.heroId, 'zhou');
  assert.equal(r._activeSlot, 0);

  // 0 号位无武器且远离战场；1 号位持满配开光符纸/铜钱剑/罗盘/照妖镜 + 阳炎4/纸扎6 DoT
  r.weapons.length = 0;
  r.players[0].weapons.length = 0;
  r.players[0].x = -5000;
  r.players[0].y = -5000;
  r.players[0].invulnT = 9999;
  r.players[1].x = 0;
  r.players[1].y = 0;
  r.players[1].invulnT = 9999;

  withPlayerContext(r, r.players[1], () => {
    r.weapons.length = 0;
    for (const wid of ['talisman', 'coinsword', 'compass', 'bronze_mirror', 'zhinian_kite', 'brush']) {
      while (addOrUpgradeWeapon(r, wid, r.players[1]));
      evolveWeapon(r, wid, 'paired');
    }
    for (const rid of ['cinnabar', 'bagua', 'soulwick', 'fivecoins', 'scissors', 'inkstone']) {
      while (addOrUpgradeRelic(r, rid));
    }
    recomputeMods(r);
    for (const w of r.weapons) w.cd = 0;
  });

  for (let i = 0; i < 8; i++) {
    const e = spawnEnemy(r, 'sedan', 70 + (i % 4) * 24, (i - 3.5) * 18);
    e.hp = e.maxHp = 80000;
  }
  let sawAllyArray = false;
  let sawBurnSlot1 = false;
  for (let f = 0; f < 150; f++) {
    r.players[0].x = -5000;
    r.players[0].y = -5000;
    r.players[0].invulnT = 9999;
    r.players[1].invulnT = 9999;
    stepRun(r, {}, DT);
    if (r.projectiles.some((p) => p.kind === 'talismanArray' && p.ownerSlot === 1 && p.attackVfx === 'jade_ghostfire')) {
      sawAllyArray = true;
    }
    if (r.enemies.some((e) => !e.dead && e.burnSlot === 1)) {
      sawBurnSlot1 = true;
    }
  }
  assert.equal(sawAllyArray, true, 'talismanArray 应继承 1 号队友 ownerSlot 与 attackVfx');
  assert.equal(sawBurnSlot1, true, '灼烧异常应记录施加者 burnSlot = 1');
  assert.equal(r.players[0].stats.damageDealt, 0, '零武器 0 号位绝不可窃取 1 号位副弹体/DoT 伤害');
  assert.equal(r.players[0].stats.kills, 0);
  assert.ok(r.players[1].stats.damageDealt > 5000);
  assert.equal(endRun(r).squad[1].mvp, true);

  // 开光傩神战鼓：生成 kind='nuoBeat'，且仅末拍净除敌弹
  const rNuo = createRun({ seed: 3082, heroId: 'nuoxi' });
  while (addOrUpgradeWeapon(rNuo, 'nuo_drum'));
  addOrUpgradeRelic(rNuo, 'wuse_mask');
  evolveWeapon(rNuo, 'nuo_drum', 'paired');
  recomputeMods(rNuo);
  const dummy = spawnEnemy(rNuo, 'sedan', 40, 0);
  dummy.hp = dummy.maxHp = 99999;
  rNuo.projectiles.push({ id: 7701, kind: 'enemyBullet', x: 45, y: 0, r: 6, vx: 0, vy: 0, t: 0, life: 10, dmg: 10 });
  getWeapon(rNuo, 'nuo_drum').cd = 0;
  rNuo.player.invulnT = 999;
  for (let f = 0; f < 6; f++) stepRun(rNuo, {}, DT);
  assert.ok(rNuo.projectiles.some((p) => p.kind === 'nuoBeat'), '应生成独立 nuoBeat 震波弹体激活傩面渲染分支');
  assert.equal(rNuo.projectiles.some((p) => p.id === 7701), true, '非末拍不得提前全清敌弹');
  for (let f = 0; f < 75; f++) stepRun(rNuo, {}, DT);
  assert.equal(rNuo.projectiles.some((p) => p.id === 7701), false, '末拍重音应净除敌弹');
});

test('V3-M1-11: 倒地玩家禁回血/纸人待机/禁神龛交互、远距存活队友防瞬移死循环与道友虫群救援', () => {
  // 1) 倒地期间 healPlayer / recomputeMods 严守 hp===0、纸人召唤物待机零击杀、禁开神龛
  const r = createRun({
    seed: 3091,
    coop: {
      party: [
        { heroId: 'mian', name: '阿绵' },
        { heroId: 'zhou', name: '老周' },
      ],
    },
  });
  while (addOrUpgradeWeapon(r, 'paperman'));
  addOrUpgradeRelic(r, 'scissors');
  addOrUpgradeRelic(r, 'glutinous');
  evolveWeapon(r, 'paperman', 'paired');
  recomputeMods(r);
  r.players[1].weapons.length = 0;
  r.players[1].x = 1400;
  r.players[1].y = 0;
  r.players[1].invulnT = 9999;

  // 先激活常驻纸人，再击倒 0 号位阿绵
  stepRun(r, {}, DT);
  assert.ok(r.projectiles.filter((p) => p.kind === 'paperman' && p.persistent).length >= 7);
  const altar = r.shrines[0];
  r.players[0].x = altar.x;
  r.players[0].y = altar.y;
  hurtTargetPlayer(r, r.players[0], 99999);
  assert.equal(r.players[0].downed, true);
  assert.equal(r.players[0].hp, 0);
  assert.equal(healPlayer(r, 60), 0, '倒地状态禁止回血变僵尸');
  addOrUpgradeRelic(r, 'bagua');
  recomputeMods(r);
  assert.equal(r.players[0].hp, 0, '倒地状态涨最大生命后 hp 仍须保持 0');

  const killsBefore = r.players[0].stats.kills;
  for (let i = 0; i < 12; i++) {
    const k = spawnEnemy(r, 'paperkid', altar.x + 18 + (i % 4) * 8, altar.y + (i >> 2) * 8);
    k.hp = k.maxHp = 1;
  }
  r.projectiles.push({ id: 7801, kind: 'enemyBullet', x: altar.x + 20, y: altar.y, r: 8, vx: 0, vy: 0, t: 0, life: 5, dmg: 10 });
  stepRun(r, { interact: true }, DT);
  assert.equal(r.nearbyShrine, null, '倒地玩家不得探测附近神龛');
  assert.equal(interactShrine(r, altar.id), false, '倒地玩家不得开启神龛');
  assert.equal(r.status, 'playing');

  // 远距回收锚点校验：靠近倒地 0 号位的怪应在首帧回收至 1400px 处的存活队友周围，绝不逐帧反复瞬移
  for (let f = 0; f < 30; f++) stepRun(r, {}, DT);
  assert.equal(r.players[0].hp, 0);
  assert.equal(r.players[0].stats.kills, killsBefore, '倒地玩家的常驻纸人不得继续索敌斩杀');
  assert.equal(r.projectiles.some((p) => p.id === 7801), true, '倒地玩家内卫纸人不得继续拦弹');
  for (const e of r.enemies) {
    if (!e.dead && !e.boss) {
      assert.ok(Math.hypot(e.x - r.players[1].x, e.y - r.players[1].y) < B.SPAWN.despawnDist, '远距怪应锚定至存活队友圆环');
    }
  }
  const boss = spawnBoss(r, 'horse');
  near(Math.hypot(boss.x - r.players[1].x, boss.y - r.players[1].y), B.BOSS_AI.spawnDist, 2);

  // 2) 智能道友在近身怪潮（rad=34..42px 受击触发 hurtInvuln=0.24）中稳守八卦阵完成救援
  const rSwarm = createRun({
    seed: 3092,
    coop: {
      party: [
        { heroId: 'zhou', isBot: false },
        { heroId: 'tiejiang', isBot: true },
      ],
    },
  });
  rSwarm.enemies.length = 0;
  rSwarm.players[0].weapons.length = 0;
  rSwarm.weapons.length = 0;
  rSwarm.players[0].x = 0;
  rSwarm.players[0].y = 0;
  rSwarm.players[1].x = 30;
  rSwarm.players[1].y = 0;
  rSwarm.players[1].maxHp = 260;
  rSwarm.players[1].hp = 260;
  hurtTargetPlayer(rSwarm, rSwarm.players[0], 99999);
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2;
    const rad = 36 + (i % 3) * 6;
    const m = spawnEnemy(rSwarm, 'paperkid', Math.cos(a) * rad, Math.sin(a) * rad);
    m.hp = m.maxHp = 80;
  }
  for (let f = 0; f < 220; f++) {
    stepRun(rSwarm, {}, DT);
    if (!rSwarm.players[0].downed) break;
  }
  assert.equal(rSwarm.players[0].downed, false, '智能道友在近身群祟受击下仍应稳守八卦阵完成扶起');
});

test('V3-M1-12: 360x780 HUD 无尽模式三位分钟印章（109:00 / 1000:05）零重叠与第四枚徽章槽位保留', () => {
  const prevOC = globalThis.OffscreenCanvas;
  class BoxCanvas {
    constructor(w = 64, h = 64) {
      this.width = w; this.height = h;
      this.draws = [];
      this._tx = 0; this._ty = 0; this._rot = 0;
      this._stack = [];
    }
    getContext() {
      const self = this;
      return {
        canvas: this, lineWidth: 1, globalAlpha: 1, fillStyle: '#000', strokeStyle: '#000',
        font: '12px serif', textAlign: 'left', textBaseline: 'alphabetic',
        globalCompositeOperation: 'source-over', lineCap: 'butt', lineJoin: 'miter',
        save() { self._stack.push([self._tx, self._ty, self._rot]); },
        restore() { const s = self._stack.pop(); if (s) [self._tx, self._ty, self._rot] = s; },
        beginPath() {}, closePath() {}, fill() {}, stroke() {}, clip() {},
        scale() {},
        translate(x, y) { self._tx += x; self._ty += y; },
        rotate(a) { self._rot += a; },
        setTransform() {}, moveTo() {}, lineTo() {}, quadraticCurveTo() {}, bezierCurveTo() {},
        arc() {}, ellipse() {}, rect() {}, fillRect() {}, strokeRect() {}, clearRect() {},
        fillText() {}, strokeText() {},
        measureText(t) { return { width: String(t).length * 16 * 1.05 }; },
        drawImage(img, x, y, w, h) {
          self.draws.push({ w, h, x: self._tx + x, y: self._ty + y, cx: self._tx, cy: self._ty, rot: self._rot, imgW: img?.width });
        },
        createPattern() { return {}; },
        createRadialGradient() { return { addColorStop() {} }; },
      };
    }
  }
  globalThis.OffscreenCanvas = BoxCanvas;
  try {
    const run = createRun({ seed: 3101, heroId: 'zhou' });
    for (const wid of ['gong', 'talisman', 'taomujian', 'suohun_chain', 'zhinian_kite', 'nuo_drum']) {
      while (addOrUpgradeWeapon(run, wid));
      evolveWeapon(run, wid, 'paired');
    }
    for (const rid of ['clapper', 'cinnabar', 'leijimu', 'yinpai', 'huoyao_pouch', 'wuse_mask']) {
      while (addOrUpgradeRelic(run, rid));
    }
    run.blessings.push({ id: 'cinnabar_ink', stacks: 1 });
    recomputeMods(run);
    run.player.soulBarrier = 1;
    run.mode = 'endless';
    run._endlessStart = 600;
    spawnBoss(run, 'umbrella');

    const hud = createHud();
    const overlap = (a, b) => a.x1 < b.x2 && a.x2 > b.x1 && a.y1 < b.y2 && a.y2 > b.y1;

    // 1) 100:05（2 位无尽分钟印）+ Boss 在场：右侧至少容下 4 枚 26x16 徽章（含 [300, st+36]）
    {
      run.time = 6005;
      const screen = new BoxCanvas(360, 780);
      hud.draw(screen.getContext(), run, 360, 780, 1.0, { safeTop: 0 });
      const badgeDraws = screen.draws.filter((d) => d.w === 26 && d.h === 16 && d.rot === 0);
      assert.ok(badgeDraws.length >= 4, `100:05 无尽+Boss 至少应绘出 4 枚徽章，实得 ${badgeDraws.length}`);
    }

    // 2) 109:00（6540s，3 位无尽印 100）与 1000:05（60005s，3 位无尽印 901）：safeTop=0/44 均零重叠
    for (const timeSec of [6540, 60005]) {
      for (const st of [0, 44]) {
        run.time = timeSec;
        const screen = new BoxCanvas(360, 780);
        hud.draw(screen.getContext(), run, 360, 780, 1.0, { safeTop: st });
        const timerDraw = screen.draws.find((d) => d.h === 36 && d.y === st + 39);
        assert.ok(timerDraw, '应绘制计时器外框');
        const timerBox = { x1: timerDraw.x, y1: timerDraw.y, x2: timerDraw.x + timerDraw.w, y2: timerDraw.y + timerDraw.h };

        const weaponBoxes = screen.draws
          .filter((d) => d.w === 18 && d.h === 18 && d.rot === 0)
          .map((d) => ({ x1: d.x + 1, y1: d.y + 1, x2: d.x + 17, y2: d.y + 17 }));
        assert.equal(weaponBoxes.length, 6);
        for (const wb of weaponBoxes) {
          assert.equal(overlap(wb, timerBox), false, `time=${timeSec} 武器槽与计时器重叠`);
        }

        const stampBg = screen.draws.find((d) => Math.abs(d.rot - 0.08) < 1e-6);
        assert.ok(stampBg, '应绘制无尽分钟朱印');
        const c = Math.cos(0.08);
        const s = Math.sin(0.08);
        const hw = ((stampBg.w - 4) * c + (stampBg.h - 4) * s) * 0.5;
        const hh = ((stampBg.w - 4) * s + (stampBg.h - 4) * c) * 0.5;
        const stampBox = { x1: stampBg.cx - hw, y1: stampBg.cy - hh, x2: stampBg.cx + hw, y2: stampBg.cy + hh };
        const pauseBox = { x1: 306, y1: st + 52, x2: 350, y2: st + 96 };

        const badgeBoxes = screen.draws
          .filter((d) => d.w === 26 && d.h === 16 && d.rot === 0)
          .map((d) => ({ x1: d.x + 1, y1: d.y + 1, x2: d.x + 25, y2: d.y + 15 }));
        for (const bb of badgeBoxes) {
          assert.equal(overlap(bb, stampBox), false, `time=${timeSec} st=${st} 徽章与三位无尽分钟印重叠`);
          assert.equal(overlap(bb, pauseBox), false, `time=${timeSec} st=${st} 徽章与暂停钮重叠`);
          assert.equal(overlap(bb, timerBox), false, `time=${timeSec} st=${st} 徽章与计时器重叠`);
        }
      }
    }
  } finally {
    if (prevOC === undefined) delete globalThis.OffscreenCanvas; else globalThis.OffscreenCanvas = prevOC;
  }
});
