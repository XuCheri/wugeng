// Tier 5 全栈白盒对抗测试套件（跨模块交互、状态机边界、确定性、渲染/合成器防护与发布包一致性）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

import * as B from '../../src/sim/balance.js';
import {
  PLAYER_BASE, BOSS_AI, EVOLUTION, ULT, SHRINES, DAMAGE,
} from '../../src/sim/balance.js';
import {
  createRun, stepRun, chooseUpgrade, rerollChoices, banishChoice, toggleLockChoice,
  openChest, interactShrine, resolveShrine, dismissShrine, revive, enterEndless, endRun,
  getEvolutionRecipe, DT,
} from '../../src/sim/run.js';
import { hurtPlayer, recomputeMods, earnCoins } from '../../src/sim/player.js';
import { spawnEnemy, updateEnemies, flushSpawnQueue } from '../../src/sim/enemies.js';
import { spawnBoss } from '../../src/sim/bosses.js';
import { damageEnemy, applyVuln } from '../../src/sim/combat.js';
import { addOrUpgradeWeapon, getWeapon, evolveWeapon, weaponBaseDmg } from '../../src/sim/weapons.js';
import { addOrUpgradeRelic, relicEffect } from '../../src/sim/relics.js';
import { generateChoices } from '../../src/sim/levelup.js';
import {
  BLESSINGS, BLESSING_IDS, applyBlessingChoice, generateBlessingChoices,
} from '../../src/sim/blessings.js';
import { SYNERGIES, SYNERGY_TIERS } from '../../src/sim/synergies.js';
import { SHRINE_TITLES } from '../../src/sim/shrines.js';

import * as Save from '../../src/meta/save.js';
import * as Codex from '../../src/meta/codex.js';
import * as Unlocks from '../../src/meta/unlocks.js';
import * as Shop from '../../src/meta/shop.js';
import * as Checkin from '../../src/meta/checkin.js';
import { createCloudSave } from '../../src/meta/cloud-save.js';

import * as Copy from '../../src/ui/copy.js';
import { createInput } from '../../src/input.js';
import {
  AD_GRACE_SEC, canShowRerollAd, canShowReviveAd, canShowResultDouble, canShowCheckinDouble,
} from '../../src/ads/ad-policy.js';

import {
  PAPER, PAPER_SHADE, INK, VERM, VERM_DARK, LANTERN, RGB,
} from '../../src/render/palette.js';
import { WEAPON_ICONS, EVO_WEAPON_ICONS, RELIC_ICONS, HERO_ICONS } from '../../src/render/icons.js';
import { ENEMY_TYPES, SHRINE_TYPES, clearSpriteCache, iconDataURL } from '../../src/render/sprites.js';
import { BOSS_NAMES, EVOLVED_NAMES } from '../../src/render/fx.js';
import { createRenderer } from '../../src/render/renderer.js';
import { createMockRun, stepMock } from '../../src/render/mock-run.js';
import { createAudio, renderPluck } from '../../src/audio/synth.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// ───────────────────────── 核心模拟与跨机制边界（T5-01 .. T5-10） ─────────────────────────

test('T5-01: 多路径开光优先级（paired > resonance > maxRelic > altar）、补配本命 +18% 精通、openChest 自选/兜底与清弹攒气上限', () => {
  const r = createRun({ seed: 5001, heroId: 'zhou' });
  while (addOrUpgradeWeapon(r, 'gong'));
  while (addOrUpgradeWeapon(r, 'soulbanner'));
  while (addOrUpgradeWeapon(r, 'compass'));
  while (addOrUpgradeWeapon(r, 'lantern'));

  getWeapon(r, 'lantern').altarReady = true;
  assert.deepEqual(getEvolutionRecipe(r, getWeapon(r, 'lantern')), { ok: true, recipe: 'altar' });

  for (let i = 0; i < 5; i++) addOrUpgradeRelic(r, 'bagua');
  assert.deepEqual(getEvolutionRecipe(r, getWeapon(r, 'lantern')), { ok: true, recipe: 'maxRelic' });
  assert.deepEqual(getEvolutionRecipe(r, getWeapon(r, 'compass')), { ok: true, recipe: 'maxRelic' });

  addOrUpgradeRelic(r, 'clapper');
  recomputeMods(r);
  assert.deepEqual(getEvolutionRecipe(r, getWeapon(r, 'gong')), { ok: true, recipe: 'paired' });
  assert.deepEqual(getEvolutionRecipe(r, getWeapon(r, 'soulbanner')), { ok: true, recipe: 'resonance', tag: 'zhenhun' });

  r.player.ult = 75;
  r.projectiles.push({ id: 91, kind: 'enemyBullet', x: 185, y: 0, r: 6, vx: 0, vy: 0, t: 0, life: 5, dmg: 10 });
  r.projectiles.push({ id: 92, kind: 'enemyBullet', x: 187, y: 0, r: 6, vx: 0, vy: 0, t: 0, life: 5, dmg: 10 });
  const nearMob = spawnEnemy(r, 'paperkid', 50, 0);
  r._pendingChests = 4;
  stepRun(r, {}, DT);
  assert.equal(r.status, 'chest');
  assert.equal(r.chestChoices.length, 4);

  const c1 = openChest(r, 'not_a_weapon');
  assert.equal(c1.evolved, 'gong');
  assert.equal(c1.recipe, 'paired');
  assert.equal(r.player.ult, ULT.max);
  assert.equal(r.projectiles.some((p) => p.id === 91), false);
  assert.equal(r.projectiles.some((p) => p.id === 92), true);
  assert.ok(nearMob.kbx > 100);

  const c2 = openChest(r, 'lantern');
  assert.equal(c2.evolved, 'lantern');
  assert.equal(c2.recipe, 'maxRelic');
  const dmgBeforePair = weaponBaseDmg(getWeapon(r, 'lantern'), r);
  addOrUpgradeRelic(r, 'censer');
  const dmgAfterPair = weaponBaseDmg(getWeapon(r, 'lantern'), r);
  assert.ok(Math.abs(dmgAfterPair / dmgBeforePair - EVOLUTION.pairedMasteryMul) < 1e-9);

  assert.equal(openChest(r, 'compass').evolved, 'compass');
  assert.equal(openChest(r).evolved, 'soulbanner');
  assert.equal(r.status, 'playing');
  assert.equal(r.chestChoices.length, 0);
});

test('T5-02: 四门羁绊计数 × 百神同契（全流派 +1）跨模块解锁共鸣开光与 synergyUp 防重复触发', () => {
  const r = createRun({ seed: 5002, heroId: 'zhou' });
  addOrUpgradeWeapon(r, 'bronze_mirror');
  addOrUpgradeWeapon(r, 'paperman');
  addOrUpgradeRelic(r, 'fivecoins');
  addOrUpgradeRelic(r, 'soulwick');
  recomputeMods(r);
  assert.deepEqual(r.synergies.counts, { zhenhun: 1, daofa: 2, zhizha: 2, yangyan: 3 });

  r.events.length = 0;
  assert.equal(applyBlessingChoice(r, 'incense_resonance', { recomputeMods, earnCoins }), true);
  assert.deepEqual(r.synergies.counts, { zhenhun: 2, daofa: 3, zhizha: 3, yangyan: 4 });
  assert.equal(r.mods.yangyan4, true);
  assert.equal(r.events.filter((e) => e.type === 'synergyUp' && e.tag === 'zhenhun' && e.tier === 2).length, 1);
  assert.equal(r.events.filter((e) => e.type === 'synergyUp' && e.tag === 'yangyan' && e.tier === 4).length, 1);

  r.events.length = 0;
  recomputeMods(r);
  assert.equal(r.events.filter((e) => e.type === 'synergyUp').length, 0);

  while (addOrUpgradeWeapon(r, 'paperman'));
  assert.deepEqual(getEvolutionRecipe(r, getWeapon(r, 'paperman')), { ok: true, recipe: 'resonance', tag: 'zhizha' });
});

test('T5-03: 吉凶命签叠加上限、护甲清零与残血扣上限保护、四次换更（120/240/360/480s）回血及命签池耗尽保底', () => {
  const r = createRun({ seed: 5003, heroId: 'zhou' });
  assert.equal(applyBlessingChoice(r, 'lantern_oil', { recomputeMods }), true);
  assert.equal(applyBlessingChoice(r, 'lantern_oil', { recomputeMods }), true);
  assert.equal(applyBlessingChoice(r, 'lantern_oil', { recomputeMods }), false);

  assert.equal(applyBlessingChoice(r, 'heavy_bronze', { recomputeMods }), true);
  assert.equal(applyBlessingChoice(r, 'earth_blessing', { recomputeMods }), true);
  assert.ok(r.player.armor >= 5);
  assert.equal(applyBlessingChoice(r, 'glass_talisman', { recomputeMods }), true);
  assert.equal(r.player.armor, 0);
  r.player.hp = 1;
  assert.equal(applyBlessingChoice(r, 'blood_oath', { recomputeMods }), true);
  assert.ok(r.player.hp >= 1 && r.player.hp <= r.player.maxHp);

  for (const w of [1, 2, 3, 4]) {
    const t = w * B.WATCH_DURATION;
    r.player.hp = 10;
    r.player.invulnT = 999;
    r.time = t - 0.01;
    stepRun(r, {}, DT);
    assert.ok(r.player.hp > 10);
    assert.equal(r.status, 'levelup');
    assert.equal(r.choiceMode, 'blessing');
    assert.equal(chooseUpgrade(r, 0), true);
  }

  for (const id of BLESSING_IDS) {
    while (applyBlessingChoice(r, id, { recomputeMods, earnCoins }));
  }
  const exhausted = generateBlessingChoices(r);
  assert.equal(exhausted.length, 3);
  assert.deepEqual(exhausted.map((c) => c.kind), ['coin', 'bun', 'overflow']);
});

test('T5-04: lockedChoice 跨守夜命签保留、rerollChoices 模式隔离、banishChoice 越界/零次数与 24 器物池全耗尽', () => {
  const r = createRun({ seed: 5004, heroId: 'zhou' });
  r._pendingLevels = 2;
  r.status = 'levelup';
  generateChoices(r);

  for (const bad of [-1, 3, 99, NaN, null, undefined, '']) {
    assert.equal(banishChoice(r, bad), false);
    assert.equal(toggleLockChoice(r, bad), false);
  }
  assert.equal(r.banishesLeft, 2);

  const lockedTarget = { ...r.choices[2] };
  assert.equal(toggleLockChoice(r, 2), true);
  r._pendingBlessings = 1;
  assert.equal(chooseUpgrade(r, 0), true);
  assert.equal(r.choiceMode, 'blessing');
  assert.deepEqual(r.lockedChoice, { kind: lockedTarget.kind, id: lockedTarget.id });

  assert.equal(banishChoice(r, 0), false);
  assert.equal(toggleLockChoice(r, 0), false);
  assert.equal(r.banishesLeft, 2);
  assert.equal(rerollChoices(r), true);
  assert.equal(r.choiceMode, 'blessing');
  assert.deepEqual(r.lockedChoice, { kind: lockedTarget.kind, id: lockedTarget.id });

  assert.equal(chooseUpgrade(r, 0), true);
  assert.equal(r.choiceMode, 'normal');
  assert.equal(r.choices[0].id, lockedTarget.id);
  assert.equal(r.choices[0].locked, true);

  assert.equal(banishChoice(r, 1), true);
  assert.equal(banishChoice(r, 1), true);
  assert.equal(r.banishesLeft, 0);
  assert.equal(banishChoice(r, 1), false);

  r.banishesLeft = 40;
  while (r.choices.some((c) => c.kind === 'weapon' || c.kind === 'relic')) {
    const idx = r.choices.findIndex((c) => c.kind === 'weapon' || c.kind === 'relic');
    assert.equal(banishChoice(r, idx), true);
    assert.equal(new Set(r.choices.map((c) => `${c.kind}:${c.id}`)).size, 3);
  }
  assert.deepEqual(r.choices.map((c) => c.kind), ['coin', 'bun', 'overflow']);
  assert.equal(banishChoice(r, 0), false);
});

test('T5-05: 留签（toggleLockChoice）锁定保底签（coin / bun / overflow）后跨换签与跨升级不丢失', () => {
  const r = createRun({ seed: 5005, heroId: 'zhou' });
  for (const wid of ['gong', 'talisman', 'brush', 'bell', 'compass', 'taomujian']) while (addOrUpgradeWeapon(r, wid));
  getWeapon(r, 'gong').level = 4;
  for (const rid of ['clapper', 'censer', 'cinnabar', 'inkstone', 'soulwick', 'leijimu']) while (addOrUpgradeRelic(r, rid));
  recomputeMods(r);
  r._pendingLevels = 2;
  r.status = 'levelup';
  generateChoices(r);

  const bunIdx = r.choices.findIndex((c) => c.kind === 'bun');
  assert.ok(bunIdx >= 0);
  assert.equal(toggleLockChoice(r, bunIdx), true);
  assert.deepEqual(r.lockedChoice, { kind: 'bun', id: 'bun' });

  assert.equal(rerollChoices(r), true);
  assert.deepEqual(r.lockedChoice, { kind: 'bun', id: 'bun' });
  assert.ok(r.choices.some((c) => c.kind === 'bun' && c.locked === true));

  const gongIdx = r.choices.findIndex((c) => c.kind === 'weapon' && c.id === 'gong');
  assert.equal(chooseUpgrade(r, gongIdx), true);
  assert.ok(r.choices.some((c) => c.kind === 'bun' && c.locked === true));
});

test('T5-06: 奇遇地标边界：香案残血禁献祭与关闭不消耗、货郎全满阶升溢出与收支守恒、试炼碑跨区块 18s 必落供盒', () => {
  const r = createRun({ seed: 5006, heroId: 'zhou' });
  const altar = r.shrines.find((s) => s.kind === 'altar');
  const peddler = r.shrines.find((s) => s.kind === 'peddler');
  const trial = r.shrines.find((s) => s.kind === 'trial');

  r.player.hp = 15;
  assert.equal(interactShrine(r, altar.id), true);
  assert.equal(r.activeShrine.options[0].disabled, true);
  assert.equal(resolveShrine(r, 0), null);
  assert.equal(resolveShrine(r, -1), null);
  assert.equal(resolveShrine(r, 9), null);
  dismissShrine(r);
  assert.equal(r.status, 'playing');
  assert.equal(altar.used, false);

  while (addOrUpgradeWeapon(r, 'gong'));
  addOrUpgradeRelic(r, 'clapper');
  while (addOrUpgradeRelic(r, 'clapper'));
  recomputeMods(r);
  earnCoins(r, 30, false);
  assert.equal(interactShrine(r, peddler.id), true);
  assert.equal(r.activeShrine.options[0].desc.includes('签'), false);
  assert.equal(resolveShrine(r, 0)?.outcome, 'peddler_upgrade');
  assert.equal(r.mods.overflowStacks, 1);
  assert.ok(Math.abs(r.mods.overflowMult - DAMAGE.overflowMult) < 1e-9);
  assert.equal(r.coinsSpent, 25);
  assert.equal(r.stats.coins, 5);
  assert.ok(r.coinsSpent <= r.coinsEarned);

  assert.equal(interactShrine(r, trial.id), true);
  assert.equal(resolveShrine(r, 0)?.outcome, 'start_trial');
  assert.equal(trial.active, true);
  assert.equal(interactShrine(r, trial.id), false);
  r.player.x = 3000;
  r.player.y = 3000;
  for (let i = 0; i < Math.ceil(SHRINES.trialDuration / DT) + 4; i++) {
    r.player.invulnT = 999;
    if (r.status === 'levelup') { chooseUpgrade(r, 0); continue; }
    if (r.status === 'chest') break;
    stepRun(r, {}, DT);
  }
  assert.equal(trial.active, false);
  const droppedChest = r.pickups.find((p) => p.kind === 'chest');
  assert.ok(r.status === 'chest' || (droppedChest && Math.hypot(droppedChest.x - r.player.x, droppedChest.y - r.player.y) < 120));
});

test('T5-07: 三夜主完整状态机（纸马三连冲循环、伞女撑伞减伤/破甲与开伞切换、夜游神 P1→P2→P3 突刺循环与移速上界）', () => {
  const r = createRun({ seed: 5007, heroId: 'zhou', nightLevel: 10 });
  r.weapons.length = 0;
  r.player.invulnT = 1e6;

  const horse = spawnBoss(r, 'horse');
  horse.x = 180; horse.y = 0; horse.stateT = 0;
  const horseStates = [];
  for (let i = 0; i < 420; i++) {
    horse.x = 180; horse.y = 0;
    updateEnemies(r, DT);
    if (horseStates[horseStates.length - 1] !== horse.state) horseStates.push(horse.state);
  }
  assert.deepEqual(horseStates.slice(0, 8), ['windup', 'charge', 'windup', 'charge', 'windup', 'charge', 'rest', 'chase']);
  horse.dead = true;

  const umb = spawnBoss(r, 'umbrella');
  umb.x = 150; umb.y = 0; umb.hp = umb.maxHp = 100000;
  r.mods.critChance = 0;
  assert.equal(umb.state, 'shield');
  assert.equal(damageEnemy(r, umb, 100, 'gong', { knock: 0 }), 30);
  assert.equal(damageEnemy(r, umb, 100, 'soulbanner', { armorBreak: true, knock: 0 }), 100);
  umb.stateT = 0;
  updateEnemies(r, DT);
  updateEnemies(r, DT);
  assert.equal(umb.state, 'open');
  assert.equal(umb.phase, 2);
  assert.equal(damageEnemy(r, umb, 100, 'gong', { knock: 0 }), 100);
  umb.dead = true;

  const ys = spawnBoss(r, 'youshen', { final: true });
  assert.ok(ys.speed * BOSS_AI.youshen.enrageSpeedMul < PLAYER_BASE.speed);
  assert.equal(ys.phase, 1);
  ys.hp = Math.floor(ys.maxHp * 0.80);
  updateEnemies(r, DT);
  assert.equal(ys.phase, 2);
  assert.equal(ys.state, 'barrage');
  ys.hp = Math.floor(ys.maxHp * 0.50);
  const ysP3 = [];
  for (let i = 0; i < 240; i++) {
    ys.x = 200; ys.y = 0;
    updateEnemies(r, DT);
    if (ysP3[ysP3.length - 1] !== ys.state) ysP3.push(ys.state);
  }
  assert.deepEqual(ysP3.slice(0, 5), ['enrage', 'windup', 'lunge', 'recover', 'enrage']);
});

test('T5-08: 纸甲易伤穿透与破甲粉碎、分身零经验防递归、以及「魂障 → 借纸还魂 → 复活」三层免死结算链', () => {
  const r = createRun({ seed: 5008, heroId: 'zhou' });
  r.mods.critChance = 0;

  const pa = spawnEnemy(r, 'lanternghost', 80, 0, { elite: true, affix: 'paper_armor' });
  pa.hp = pa.maxHp = 10000;
  assert.equal(pa.paperArmor, 6);
  assert.equal(damageEnemy(r, pa, 100, 'gong', { knock: 0 }), 65);
  assert.equal(pa.paperArmor, 5);
  applyVuln(pa, 2.0, 0.25);
  assert.equal(damageEnemy(r, pa, 100, 'gong', { knock: 0 }), 125);
  assert.equal(pa.paperArmor, 5);
  pa.vulnT = 0; pa.vulnPct = 0;
  damageEnemy(r, pa, 100, 'soulbanner', { armorBreak: true, knock: 0 });
  assert.equal(pa.paperArmor, 0);

  const mt = spawnEnemy(r, 'weasel', 90, 20, { elite: true, affix: 'mirror_twin' });
  mt.hp = Math.ceil(mt.maxHp * 0.45);
  damageEnemy(r, mt, 1, 'gong', { knock: 0 });
  flushSpawnQueue(r);
  const clones = r.enemies.filter((e) => e.mirrorClone);
  assert.equal(clones.length, 1);
  assert.equal(clones[0].xp, 0);
  clones[0].hp = 1;
  damageEnemy(r, clones[0], 0.1, 'gong', { knock: 0 });
  flushSpawnQueue(r);
  assert.equal(r.enemies.filter((e) => e.mirrorClone).length, 1);

  addOrUpgradeWeapon(r, 'soulbanner');
  while (addOrUpgradeWeapon(r, 'soulbanner'));
  evolveWeapon(r, 'soulbanner', 'paired');
  applyBlessingChoice(r, 'paper_soul', { recomputeMods });
  recomputeMods(r);
  r.player.soulBarrier = 1;
  r.player.hp = 10;
  r.player.invulnT = 0;

  assert.equal(hurtPlayer(r, 999), 0);
  assert.equal(r.player.soulBarrier, 0);
  assert.equal(r._paperSoulUsed, undefined);
  assert.equal(r.player.hp, 10);

  r.player.invulnT = 0;
  assert.equal(hurtPlayer(r, 999), 0);
  assert.equal(r._paperSoulUsed, true);
  assert.ok(r.player.hp >= Math.ceil(r.player.maxHp * 0.5));
  assert.equal(r.revives.mainUsed, 0);

  r.player.invulnT = 0;
  assert.ok(hurtPlayer(r, 999) > 0);
  stepRun(r, {}, DT);
  assert.equal(r.status, 'dead');
  assert.equal(revive(r), true);
  assert.equal(r.revives.mainUsed, 1);
});

test('T5-09: 终局生命周期与事件池隔离：复活自动大招斩杀夜游神保留通关、同帧双杀进无尽免暴毙、outbox 命中事件防串改', () => {
  // 1) revive() 自动大招击杀夜游神必须保持 cleared 并允许进入无尽
  const r1 = createRun({ seed: 5009, heroId: 'zhou' });
  r1.time = 605;
  r1._bossSpawned.youshen = true;
  const ys1 = spawnBoss(r1, 'youshen', { chest: false, final: true });
  ys1.x = 40; ys1.y = 0; ys1.hp = 30;
  r1.player.hp = 0;
  stepRun(r1, {}, DT);
  assert.equal(r1.status, 'dead');
  assert.equal(revive(r1), true);
  assert.equal(ys1.dead, true);
  assert.equal(r1.status, 'cleared');
  assert.equal(endRun(r1).cleared, true);
  assert.equal(enterEndless(r1), true);
  assert.equal(r1.status, 'playing');

  // 2) 同帧玩家受致命伤 + 武器斩杀夜游神：通关后 enterEndless 不得因 hp===0 在第 0 帧暴毙
  const r2 = createRun({ seed: 5010, heroId: 'zhou' });
  r2.time = 605;
  r2._bossSpawned.youshen = true;
  const ys2 = spawnBoss(r2, 'youshen', { chest: false, final: true });
  ys2.x = 20; ys2.y = 0; ys2.hp = 10; ys2.dmg = 500;
  getWeapon(r2, 'gong').cd = 0;
  stepRun(r2, {}, DT);
  assert.equal(r2.status, 'cleared');
  assert.equal(enterEndless(r2), true);
  assert.equal(r2.status, 'playing');
  assert.ok(r2.player.hp >= 1);

  // 3) outside() 产生的 hit 事件进入 _outbox 后，下一帧 stepRun 不得被 hitPool 覆写或重复引用
  const r3 = createRun({ seed: 5011, heroId: 'zhou' });
  const m1 = spawnEnemy(r3, 'sedan', 30, 0); m1.hp = m1.maxHp = 5000;
  r3.player.hp = 0;
  stepRun(r3, {}, DT);
  revive(r3);
  const m2 = spawnEnemy(r3, 'paperkid', 40, 20); m2.hp = m2.maxHp = 5000;
  getWeapon(r3, 'gong').cd = 0;
  stepRun(r3, {}, DT);
  const hits = r3.events.filter((e) => e.type === 'hit');
  assert.equal(new Set(hits).size, hits.length);
  assert.ok(hits.some((h) => h.weaponId === 'ult'));
});

test('T5-10: 全系统混合操作确定性（换更命签 + 留签/弃签/换签 + 供盒自选 + 试炼碑奇遇）同种子状态散列严格一致', () => {
  function runFullScenario(seed) {
    const r = createRun({ seed, heroId: 'daotong', nightLevel: 3, meta: { dmgPct: 0.09, freeRerolls: 1 } });
    for (let step = 0; step < 600; step++) {
      if (r.status === 'levelup') {
        if (r.choiceMode === 'normal' && step % 5 === 0 && r.banishesLeft > 0) banishChoice(r, 0);
        if (r.choiceMode === 'normal' && step % 7 === 0) toggleLockChoice(r, 1);
        if (step % 11 === 0) rerollChoices(r);
        chooseUpgrade(r, step % r.choices.length);
        continue;
      }
      if (r.status === 'chest') {
        openChest(r, r.chestChoices[1]?.id || null);
        continue;
      }
      if (r.status === 'shrine') {
        if (!resolveShrine(r, 0)) dismissShrine(r);
        continue;
      }
      if (r.status !== 'playing') break;
      if (step === 150) {
        const trial = r.shrines.find((s) => s.kind === 'trial' && !s.used);
        if (trial) { interactShrine(r, trial.id); resolveShrine(r, 0); continue; }
      }
      if (step === 300) r.time = 119.99;
      const a = step * 0.11;
      r.player.invulnT = 99;
      stepRun(r, { moveX: Math.cos(a), moveY: Math.sin(a), ultimate: step % 80 === 0 }, DT);
    }
    return JSON.stringify({
      t: r.time.toFixed(6),
      w: r.watch,
      p: [r.player.x.toFixed(4), r.player.y.toFixed(4), r.player.hp, r.player.level, r.player.ult.toFixed(4)],
      wp: r.weapons.map((x) => [x.id, x.level, x.evolved]),
      rl: r.relics.map((x) => [x.id, x.level]),
      bl: r.blessings,
      sy: r.synergies,
      bn: [r.banishesLeft, r.banished, r.lockedChoice],
      sh: r.shrines.map((s) => [s.id, s.used, s.active, s.timer.toFixed(3)]),
      st: r.stats,
      rng: r.rng.getState(),
    });
  }
  const snapA = runFullScenario('wugeng-tier5-det');
  const snapB = runFullScenario('wugeng-tier5-det');
  const snapC = runFullScenario('wugeng-tier5-other');
  assert.equal(snapA, snapB);
  assert.notEqual(snapA, snapC);
});

// ───────────────────────── 全栈白盒防护与架构不变量（T5-WB-01 .. T5-WB-10） ─────────────────────────

test('T5-WB-01: 跨模块权威 ID、双向本命配对与文案表 100% 零漂移（sim ↔ copy ↔ meta ↔ render）', () => {
  assert.equal(B.WEAPON_IDS.length, 16);
  assert.equal(B.RELIC_IDS.length, 16);
  assert.equal(B.ENEMY_IDS.length, 12);
  assert.equal(B.HERO_IDS.length, 6);
  assert.equal(B.SCHOOL_TAG_IDS.length, 4);
  assert.equal(BLESSING_IDS.length, 18);
  assert.equal(B.SHRINE_KINDS.length, 3);
  assert.equal(B.ELITE_AFFIX_IDS.length, 5);

  assert.deepEqual(Save.WEAPON_IDS, B.WEAPON_IDS);
  assert.deepEqual(Save.RELIC_IDS, B.RELIC_IDS);
  assert.deepEqual(Save.ENEMY_IDS, B.ENEMY_IDS);
  assert.deepEqual(Save.HERO_IDS, B.HERO_IDS);
  assert.deepEqual(Save.SHOP_IDS, B.META_IDS);
  assert.equal(Save.NIGHT_MAX, B.MAX_NIGHT);
  assert.equal(Save.SHOP_MAX_LEVEL, B.META_MAX_LEVEL);

  // 16 武器 + 16 开光神兵 + 双向本命法器配对
  const seenPairs = new Set();
  for (const wid of B.WEAPON_IDS) {
    const w = B.WEAPONS[wid];
    assert.ok(w && w.name && w.evoName && w.evoDesc);
    assert.equal(Copy.weaponName(wid, false), w.name);
    assert.equal(Copy.weaponName(wid, true), w.evoName);
    assert.equal(Copy.EVOLVE_INTRO[wid], w.evoDesc);
    assert.equal(EVOLVED_NAMES[wid], w.evoName);
    assert.ok(typeof WEAPON_ICONS[wid] === 'function');
    assert.ok(typeof EVO_WEAPON_ICONS[wid] === 'function');
    assert.ok(Array.isArray(w.tags) && w.tags.every((t) => B.SCHOOL_TAG_IDS.includes(t)));
    assert.deepEqual(Copy.weaponTags(wid), w.tags);
    assert.ok(B.RELIC_IDS.includes(w.pair), `weapon ${wid} pair ${w.pair} invalid`);
    assert.equal(B.RELICS[w.pair].pair, wid, `bijective pair broken for ${wid} <-> ${w.pair}`);
    assert.equal(Copy.weaponPairRelic(wid), w.pair);
    seenPairs.add(w.pair);
  }
  assert.equal(seenPairs.size, 16, '16 把兵刃与 16 件法器必须构成严格一一双射');

  // 12 法器各等级加成与文案
  for (const rid of B.RELIC_IDS) {
    const r = B.RELICS[rid];
    assert.equal(Copy.relicName(rid), r.name);
    assert.equal(Copy.pairOf(rid), r.pair);
    assert.ok(typeof RELIC_ICONS[rid] === 'function');
    assert.deepEqual(Copy.relicTags(rid), r.tags);
    for (let lv = 1; lv <= 5; lv++) {
      const eff = relicEffect(rid, lv);
      assert.ok(Object.values(eff).some((v) => Number.isFinite(v) && v > 0));
      assert.ok(Copy.relicTotalDesc(rid, lv).length >= 4);
    }
  }

  // 12 百鬼（9 常规 + 3 夜主）、4 流派、18 命签、3 奇遇、5 词缀、3 英雄
  for (const eid of B.ENEMY_IDS) {
    assert.equal(Copy.ENEMY_COPY[eid]?.name, B.ENEMIES[eid].name);
    assert.ok(ENEMY_TYPES.includes(eid));
  }
  for (const bid of ['horse', 'umbrella', 'youshen']) {
    assert.equal(BOSS_NAMES[bid], B.ENEMIES[bid].name);
    assert.equal(Copy.ENEMY_COPY[bid]?.boss, true);
  }
  assert.deepEqual(Object.keys(SYNERGIES).sort(), [...B.SCHOOL_TAG_IDS].sort());
  for (const tag of B.SCHOOL_TAG_IDS) {
    assert.equal(Copy.schoolName(tag), B.SCHOOL_NAMES[tag]);
    for (const tier of SYNERGY_TIERS) {
      const tierDef = SYNERGIES[tag].tiers.find((x) => x.tier === tier);
      assert.ok(tierDef?.name && tierDef?.summary);
    }
  }
  for (const id of BLESSING_IDS) {
    const c = Copy.describeChoice({ kind: 'blessing', id });
    assert.equal(c.name, BLESSINGS[id].name);
    assert.equal(c.desc, BLESSINGS[id].desc);
    assert.ok(c.tier === 'auspicious' || c.tier === 'cursed');
  }
  for (const sk of B.SHRINE_KINDS) {
    assert.ok(SHRINE_TITLES[sk] && Copy.SHRINE_PROMPT_TEXT[sk] && Copy.SHRINE_FLAVOR[sk]);
    assert.ok(SHRINE_TYPES.includes(sk));
  }
  for (const hid of B.HERO_IDS) {
    const info = Copy.heroInfo(hid);
    assert.equal(Save.HERO_START_WEAPON[hid], B.HEROES[hid].startWeapon);
    assert.equal(info.weapon, B.HEROES[hid].startWeapon);
    assert.equal(info.ultName, B.ULT[hid].name);
    assert.ok(typeof HERO_ICONS[hid] === 'function');
  }
});

test('T5-WB-02: synth.js WebAudio 全事件白盒压力测试（有限频率/增益、原型链免疫、恶形事件零异常与节流）', () => {
  const prevAC = globalThis.AudioContext;
  const prevSetInterval = globalThis.setInterval;
  const prevClearInterval = globalThis.clearInterval;
  let mockNow = 0;
  let scheduledTick = null;
  const paramErrors = [];
  let createdNodes = 0;

  class StrictParam {
    constructor(name, init = 0) {
      this.name = name;
      this._v = init;
    }
    get value() { return this._v; }
    set value(v) {
      if (typeof v !== 'number' || !Number.isFinite(v)) paramErrors.push(`${this.name}.value=${v}`);
      this._v = v;
    }
    setValueAtTime(v, t) {
      if (typeof v !== 'number' || !Number.isFinite(v) || typeof t !== 'number' || !Number.isFinite(t) || t < 0) {
        paramErrors.push(`${this.name}.setValueAtTime(${v}, ${t})`);
      }
    }
    linearRampToValueAtTime(v, t) {
      if (typeof v !== 'number' || !Number.isFinite(v) || typeof t !== 'number' || !Number.isFinite(t) || t < 0) {
        paramErrors.push(`${this.name}.linearRamp(${v}, ${t})`);
      }
    }
    exponentialRampToValueAtTime(v, t) {
      if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0 || typeof t !== 'number' || !Number.isFinite(t) || t < 0) {
        paramErrors.push(`${this.name}.expRamp(${v}, ${t})`);
      }
    }
    setTargetAtTime(v, t, c) {
      if (!Number.isFinite(v) || !Number.isFinite(t) || t < 0 || !Number.isFinite(c) || c <= 0) {
        paramErrors.push(`${this.name}.setTarget(${v}, ${t}, ${c})`);
      }
    }
  }

  class StrictAudioContext {
    constructor() {
      this.sampleRate = 22050;
      this.state = 'suspended';
      this.destination = {};
    }
    get currentTime() { return mockNow; }
    resume() { this.state = 'running'; return Promise.resolve(); }
    suspend() { this.state = 'suspended'; return Promise.resolve(); }
    createDynamicsCompressor() {
      return { threshold: new StrictParam('threshold'), ratio: new StrictParam('ratio', 1), connect() {} };
    }
    createGain() {
      return { gain: new StrictParam('gain', 1), connect() {} };
    }
    createBiquadFilter() {
      return { type: 'lowpass', Q: new StrictParam('Q', 1), frequency: new StrictParam('filterFreq', 1000), connect() {} };
    }
    createOscillator() {
      createdNodes++;
      return {
        type: 'sine',
        frequency: new StrictParam('oscFreq', 440),
        connect() {},
        start(t) { if (typeof t !== 'number' || !Number.isFinite(t) || t < 0) paramErrors.push(`osc.start(${t})`); },
        stop(t) { if (typeof t !== 'number' || !Number.isFinite(t) || t < 0) paramErrors.push(`osc.stop(${t})`); },
      };
    }
    createBuffer(ch, len, sr) {
      const arr = new Float32Array(len);
      return { sampleRate: sr, length: len, getChannelData: () => arr, copyToChannel: (s) => arr.set(s) };
    }
    createBufferSource() {
      createdNodes++;
      return {
        buffer: null,
        loop: false,
        playbackRate: new StrictParam('playbackRate', 1),
        connect() {},
        start(t) { if (t !== undefined && (typeof t !== 'number' || !Number.isFinite(t) || t < 0)) paramErrors.push(`buf.start(${t})`); },
        stop(t) { if (typeof t !== 'number' || !Number.isFinite(t) || t < 0) paramErrors.push(`buf.stop(${t})`); },
      };
    }
  }

  globalThis.AudioContext = StrictAudioContext;
  globalThis.setInterval = (fn) => { scheduledTick = fn; return { unref() {} }; };
  globalThis.clearInterval = () => {};

  try {
    const pluckSamples = renderPluck(22050, 146.83, 0.25, 0.5);
    assert.ok(pluckSamples.every((x) => Number.isFinite(x) && Math.abs(x) <= 1.05));

    const audio = createAudio();
    assert.equal(audio.unlock(), true);

    // 1. 全部 12 把武器普通 + 开光开火事件与高频连射节流
    for (const wid of B.WEAPON_IDS) {
      mockNow += 1;
      const before = createdNodes;
      audio.onEvents([{ type: 'fire', weaponId: wid, evolved: false }]);
      const afterFirst = createdNodes;
      assert.ok(afterFirst > before, `base fire for ${wid} should schedule nodes`);
      audio.onEvents([{ type: 'fire', weaponId: wid, evolved: false }]);
      assert.equal(createdNodes, afterFirst, `rapid duplicate fire_${wid} must be rate-limited`);

      mockNow += 1;
      const bEvo = createdNodes;
      audio.onEvents([{ type: 'fire', weaponId: wid, evolved: true }]);
      assert.ok(createdNodes > bEvo, `evolved fire for ${wid} should schedule nodes`);
    }

    // 2. 全量局内事件集（含 PROJECT.md 别名 bossKill / watch）
    const fullEventPayloads = [
      { type: 'explosion', x: 0, y: 0, radius: 80, evolved: false },
      { type: 'explosion', x: 0, y: 0, radius: 110, evolved: true },
      { type: 'evolve', weaponId: 'gong', evoName: '五更鸣锣', recipe: 'paired' },
      { type: 'synergyUp', tag: 'daofa', tier: 2 },
      { type: 'synergyUp', tag: 'daofa', tier: 6 },
      { type: 'blessingPick', id: 'cinnabar_ink', tier: 'auspicious' },
      { type: 'blessingPick', id: 'blood_moon', tier: 'cursed' },
      { type: 'shrineActivate', kind: 'altar', outcome: 'blood_rite' },
      { type: 'wave', count: 14, pattern: 'alley' },
      { type: 'warderSpawn', name: '巡街轿头' },
      { type: 'shieldBlock', x: 0, y: 0 },
      { type: 'banish', itemId: 'bell' },
      { type: 'bossSpawn', bossType: 'horse' },
      { type: 'bossDefeated', bossType: 'horse' },
      { type: 'bossKill', bossType: 'umbrella' },
      { type: 'watchChange', watch: 3 },
      { type: 'watch', watch: 5 },
      { type: 'ult', heroId: 'daotong' },
      { type: 'playerHurt', amount: 18 },
      { type: 'heal', amount: 25 },
      { type: 'pickup', kind: 'coin', value: 5 },
      { type: 'pickup', kind: 'xp', value: 2 },
      { type: 'pickup', kind: 'bun', value: 40 },
      { type: 'levelup', level: 4 },
      { type: 'propBreak', kind: 'well' },
      { type: 'revive' },
      { type: 'dawn' },
      { type: 'hit', crit: false, amount: 22 },
      { type: 'hit', crit: true, amount: 95 },
      { type: 'kill', elite: true, boss: false },
    ];
    for (const ev of fullEventPayloads) {
      mockNow += 3;
      const b = createdNodes;
      audio.onEvents([ev]);
      assert.ok(createdNodes > b, `event ${ev.type} (${JSON.stringify(ev)}) must synthesize audio`);
    }

    // 3. 五声音阶背景乐调度器（menu + watches 1..6）
    audio.setMusicMode('menu');
    if (scheduledTick) { mockNow += 1; scheduledTick(); }
    audio.setMusicMode('run');
    for (let w = 1; w <= 6; w++) {
      audio.setWatch(w);
      mockNow += 1;
      if (scheduledTick) scheduledTick();
    }

    // 4. 敌对原型链键、非有限参数与畸形事件零异常且零 NaN AudioParam
    mockNow += 10;
    for (const protoKey of ['toString', 'valueOf', 'constructor', '__proto__', '__defineGetter__', 'hasOwnProperty']) {
      assert.equal(audio.play(protoKey), false, `prototype key ${protoKey} must be rejected`);
    }
    assert.equal(audio.play('click', { volume: NaN }), false);
    assert.equal(audio.play('click', { volume: Infinity }), false);
    assert.equal(audio.play('click', { volume: -2 }), false);
    mockNow += 5;
    assert.equal(audio.play('watch', { arg: NaN }), true);
    mockNow += 5;
    assert.equal(audio.play('synergyUp', { arg: NaN }), true);

    audio.onEvents([
      null,
      undefined,
      42,
      'corrupt',
      {},
      { type: 'unknown_future_event' },
      { type: 'fire', weaponId: '__proto__' },
      { type: 'fire', weaponId: 'toString' },
      { type: 'watchChange', watch: NaN },
      { type: 'watch', watch: -99 },
    ]);

    // 验证原型链攻击没有污染 20 复音池
    mockNow += 10;
    assert.equal(audio.play('click'), true);
    assert.deepEqual(paramErrors, [], `WebAudio received non-finite/invalid params: ${paramErrors.join('; ')}`);
  } finally {
    globalThis.setInterval = prevSetInterval;
    globalThis.clearInterval = prevClearInterval;
    if (prevAC === undefined) delete globalThis.AudioContext;
    else globalThis.AudioContext = prevAC;
  }
});

test('T5-WB-03: render/** 严格 Canvas2D 规范校验（51 图标互异、更次 1..6 实机步进与畸形事件防 NaN）', () => {
  const prevOC = globalThis.OffscreenCanvas;
  const specErrors = [];
  const checkFinite = (op, vals) => {
    for (const v of vals) {
      if (typeof v !== 'number' || !Number.isFinite(v)) {
        specErrors.push(`${op}: non-finite ${v} in [${vals.join(',')}]`);
      }
    }
  };

  class SpecCanvas {
    constructor(w = 64, h = 64) {
      this.width = w;
      this.height = h;
      this.clientWidth = w;
      this.clientHeight = h;
      this.ops = [];
      this._ctx = null;
    }
    getContext() {
      if (this._ctx) return this._ctx;
      const ops = this.ops;
      let fillStyle = '#000', strokeStyle = '#000', globalAlpha = 1, lineWidth = 1;
      this._ctx = {
        canvas: this,
        lineCap: 'butt', lineJoin: 'miter', globalCompositeOperation: 'source-over',
        font: '12px serif', textAlign: 'start', textBaseline: 'alphabetic', imageSmoothingEnabled: true,
        get fillStyle() { return fillStyle; },
        set fillStyle(v) { fillStyle = v; ops.push(`fs:${typeof v === 'string' ? v : 'g'}`); },
        get strokeStyle() { return strokeStyle; },
        set strokeStyle(v) { strokeStyle = v; ops.push(`ss:${typeof v === 'string' ? v : 'g'}`); },
        get globalAlpha() { return globalAlpha; },
        set globalAlpha(v) { checkFinite('globalAlpha', [v]); globalAlpha = v; },
        get lineWidth() { return lineWidth; },
        set lineWidth(v) { checkFinite('lineWidth', [v]); lineWidth = v; },
        save() {}, restore() {}, beginPath() {}, closePath() {}, clip() {},
        fill() { ops.push('f'); }, stroke() { ops.push('s'); },
        scale(x, y) { checkFinite('scale', [x, y]); },
        translate(x, y) { checkFinite('translate', [x, y]); },
        rotate(a) { checkFinite('rotate', [a]); },
        setTransform(...a) { checkFinite('setTransform', a); },
        moveTo(x, y) { checkFinite('moveTo', [x, y]); ops.push(`M${Math.round(x)},${Math.round(y)}`); },
        lineTo(x, y) { checkFinite('lineTo', [x, y]); ops.push(`L${Math.round(x)},${Math.round(y)}`); },
        quadraticCurveTo(...a) { checkFinite('quadraticCurveTo', a); ops.push(`Q${Math.round(a[2])}`); },
        bezierCurveTo(...a) { checkFinite('bezierCurveTo', a); ops.push(`C${Math.round(a[4])}`); },
        arc(x, y, r, s, e) {
          checkFinite('arc', [x, y, r, s, e]);
          if (r < 0) specErrors.push(`arc r<0: ${r}`);
          ops.push(`A${Math.round(r)}`);
        },
        ellipse(x, y, rx, ry, rot = 0, s = 0, e = Math.PI * 2) {
          checkFinite('ellipse', [x, y, rx, ry, rot, s, e]);
          if (rx < 0 || ry < 0) specErrors.push(`ellipse r<0: ${rx},${ry}`);
          ops.push(`E${Math.round(rx)},${Math.round(ry)}`);
        },
        rect(...a) { checkFinite('rect', a); ops.push(`R${Math.round(a[2])}`); },
        fillRect(...a) { checkFinite('fillRect', a); ops.push(`FR${Math.round(a[2])}`); },
        strokeRect(...a) { checkFinite('strokeRect', a); ops.push(`SR${Math.round(a[2])}`); },
        clearRect(...a) { checkFinite('clearRect', a); },
        fillText(t, x, y) { checkFinite('fillText', [x, y]); ops.push(`FT:${t}`); },
        strokeText(t, x, y) { checkFinite('strokeText', [x, y]); },
        measureText(t) { return { width: String(t).length * 11 }; },
        drawImage(img, ...a) { checkFinite('drawImage', a); ops.push(`DI:${img?.ops?.length || 0}`); },
        createPattern() { return {}; },
        createRadialGradient(x0, y0, r0, x1, y1, r1) {
          checkFinite('createRadialGradient', [x0, y0, r0, x1, y1, r1]);
          if (r0 < 0 || r1 < 0) specErrors.push(`radialGradient r<0: ${r0},${r1}`);
          return {
            addColorStop(off, col) {
              checkFinite('addColorStop', [off]);
              if (off < 0 || off > 1) specErrors.push(`addColorStop offset=${off}`);
              if (typeof col === 'string' && col.includes('NaN')) specErrors.push(`NaN gradient color: ${col}`);
            },
          };
        },
        createImageData(w, h) { return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }; },
        putImageData() {},
      };
      return this._ctx;
    }
    toDataURL() {
      const raw = `${this.width}x${this.height}|${this.ops.join(';')}`;
      let h = 2166136261;
      for (let i = 0; i < raw.length; i++) h = Math.imul(h ^ raw.charCodeAt(i), 16777619) >>> 0;
      return `data:image/png;base64,${Buffer.from(`${h.toString(16)}_${this.ops.length}`).toString('base64')}`;
    }
  }

  globalThis.OffscreenCanvas = SpecCanvas;
  clearSpriteCache();
  try {
    // 66 个核心图标（16 兵刃 + 16 开光 + 16 法器 + 12 百鬼 + 6 英雄）全部唯一有效（用独立尺寸 58 避开前置测试缓存）
    const all66 = new Set();
    for (const id of B.WEAPON_IDS) {
      all66.add(iconDataURL('weapon', id, 58));
      all66.add(iconDataURL('evo', id, 58));
    }
    for (const id of B.RELIC_IDS) all66.add(iconDataURL('relic', id, 58));
    for (const id of B.ENEMY_IDS) all66.add(iconDataURL('enemy', id, 58));
    for (const id of B.HERO_IDS) all66.add(iconDataURL('hero', id, 58));
    assert.equal(all66.size, 66, '66 枚版画图标 dataURL 必须全部两两互异');

    // style-lab 三大场景 + 一更到鸡鸣全覆盖
    for (const scene of ['crowd', 'boss', 'hud']) {
      for (const watch of [1, 2, 3, 4, 5, 6]) {
        const c = new SpecCanvas(390, 844);
        const r = createRenderer(c, { lowQuality: watch === 2 });
        const mr = createMockRun({ watch, scene, hero: 'daotong', awakened: true });
        stepMock(mr, 1 / 60);
        r.consumeEvents(mr.events);
        r.render(mr, 0.5, 1 / 60, { shake: true, dmgText: 'all' });
      }
    }

    // 畸形/缺坐标事件 + PROJECT.md 别名事件不得抛错或产生任何 NaN Canvas 指令
    const screen = new SpecCanvas(360, 780);
    const renderer = createRenderer(screen, { lowQuality: false });
    const run = createRun({ seed: 77, heroId: 'zhou' });
    renderer.consumeEvents([
      null,
      undefined,
      {},
      { type: 'hit', amount: 88, crit: true, x: NaN, y: undefined },
      { type: 'kill', enemyType: 'paperkid', elite: true },
      { type: 'propBreak' },
      { type: 'explosion', radius: -40, x: Infinity, y: -Infinity },
      { type: 'bossKill', bossType: 'horse' },
      { type: 'watch', watch: 4 },
      { type: 'watch', watch: NaN },
    ]);
    renderer.render(run, 1, 1 / 60, { shake: true, dmgText: 'all' });
    assert.deepEqual(specErrors, [], `Canvas2D spec violations: ${specErrors.slice(0, 8).join('; ')}`);
  } finally {
    clearSpriteCache();
    if (prevOC === undefined) delete globalThis.OffscreenCanvas;
    else globalThis.OffscreenCanvas = prevOC;
  }
});

test('T5-WB-04: meta/** 全链路幂等性、深拷贝隔离与零负资产不变量（save + codex + shop + checkin + unlocks）', () => {
  const mem = new Map();
  const storage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
  };

  const s = Save.defaultSave();
  let rngStep = 0;
  const detRng = () => ((rngStep++ * 0.37) % 1);

  // 14 天两整轮签到 + 回拨拦截 + 同日重领幂等拦截
  for (let d = 1; d <= 14; d++) {
    const dateStr = `2026-11-${String(d).padStart(2, '0')}`;
    const res = Checkin.claimCheckin(s, dateStr, d % 3 === 0, detRng);
    assert.equal(res.ok, true);
    assert.equal(Checkin.claimCheckin(s, dateStr, true, detRng).ok, false, '同日重复签到必须拒绝');
  }
  assert.equal(Checkin.claimCheckin(s, '2026-11-10', false, detRng).reason, 'rollback');
  assert.equal(s.checkin.cycles, 2);
  assert.equal(s.checkin.totalClaims, 14);
  assert.ok(s.coins > 0 && Number.isInteger(s.coins));

  // 更房购买与余额不足拦截（绝不产生负铜钱）
  s.coins = 500;
  assert.equal(Shop.buyLevel(s, 'tizhi').ok, true);
  assert.equal(Shop.buyLevel(s, 'tizhi').ok, true);
  const failBuy = Shop.buyLevel(s, 'tizhi');
  assert.equal(failBuy.ok, false);
  assert.equal(failBuy.reason, 'coins');
  assert.equal(s.coins, 259);
  assert.equal(s.shop.tizhi, 2);

  // 局内实时同步 + 结算入账 + 翻倍
  const run = createRun({ seed: 99, heroId: 'zhou', meta: Shop.getMetaBonuses(s), charm: s.charms[0] || null });
  run.weapons.push({ id: 'soulbanner', level: 5, evolved: true });
  run.relics.push({ id: 'glutinous', level: 3 });
  run.stats.kills = 850;
  run.stats.killsByType = { suona: 12, paperbride: 6, cinder: 9, horse: 1 };
  run.time = 490;
  assert.equal(Codex.syncCodexFromRun(s, run), true);
  assert.equal(Codex.syncCodexFromRun(s, run), false);

  const summary = endRun(run);
  const rec = Unlocks.recordRun(s, summary, 1700005000);
  assert.ok(rec.coins >= 0);
  assert.ok(s.unlockedHeroes.includes('mian') && s.unlockedHeroes.includes('daotong'));
  const beforeDouble = s.coins;
  const added = Unlocks.grantDoubleCoins(s, rec.coins);
  assert.equal(s.coins, beforeDouble + added);

  // 读写往返 + migrateSave / mergeSaves 幂等性与深拷贝引用隔离
  assert.equal(Save.saveSave(s, storage, 1700006000), true);
  const loaded = Save.loadSave(storage);
  assert.deepEqual(Save.migrateSave(loaded), loaded);
  assert.deepEqual(Save.mergeSaves(loaded, loaded), loaded);

  const earlyMerged = Save.mergeSaves(loaded, Save.defaultSave());
  earlyMerged.coins = 0;
  earlyMerged.codex.weapons.push('FAKE');
  earlyMerged.unlockedHeroes.push('FAKE');
  assert.ok(loaded.coins > 0, 'mergeSaves 早退分支不得共享原对象引用');
  assert.equal(loaded.codex.weapons.includes('FAKE'), false);
  assert.equal(loaded.unlockedHeroes.includes('FAKE'), false);
});

test('T5-WB-05: cloud-save.js 62s 节流尾部合并、400001 频控自动重排与跨端并集合并', async () => {
  let clock = 50_000;
  let failWith400001Once = false;
  const remoteFiles = new Map();
  let archiveMeta = null;
  let uploadCount = 0;

  const fakeWin = {
    location: { search: '' },
    tap: {
      env: { USER_DATA_PATH: 'tapfile://usr' },
      getFileSystemManager() {
        return {
          writeFile({ filePath, data, success }) { remoteFiles.set(filePath, String(data)); success?.({}); },
          readFile({ filePath, success, fail }) {
            if (!remoteFiles.has(filePath)) fail?.(new Error('not found'));
            else success?.({ data: remoteFiles.get(filePath) });
          },
        };
      },
      getCloudSaveManager() {
        return {
          getArchiveList({ success }) { success?.({ saves: archiveMeta ? [archiveMeta] : [] }); },
          createArchive({ archiveMetaData, archiveFilePath, success, fail }) {
            if (failWith400001Once) {
              failWith400001Once = false;
              fail?.({ errCode: 400001, errMsg: 'rate limit' });
              return;
            }
            uploadCount++;
            archiveMeta = { uuid: 'u-1', fileId: 'f-1', name: archiveMetaData.name, data: remoteFiles.get(archiveFilePath) };
            success?.(archiveMeta);
          },
          updateArchive({ archiveUUID, archiveMetaData, archiveFilePath, success, fail }) {
            if (failWith400001Once) {
              failWith400001Once = false;
              fail?.({ errCode: 400001, errMsg: 'rate limit' });
              return;
            }
            uploadCount++;
            archiveMeta = { uuid: archiveUUID, fileId: 'f-2', name: archiveMetaData.name, data: remoteFiles.get(archiveFilePath) };
            success?.(archiveMeta);
          },
          getArchiveData({ targetFilePath, success }) {
            remoteFiles.set(targetFilePath, archiveMeta.data);
            success?.({ filePath: targetFilePath });
          },
        };
      },
    },
  };

  const cloud = createCloudSave({ win: fakeWin, now: () => clock, cooldownMs: 62_000, coalesceMs: 1_200 });
  try {
    const s1 = Save.defaultSave(); s1.coins = 100;
    const s2 = Save.defaultSave(); s2.coins = 250;
    const s3 = Save.defaultSave(); s3.coins = 420; s3.codex.weapons.push('compass');
    assert.equal(cloud.scheduleSync(s1), true);
    assert.equal(cloud.scheduleSync(s2), true);
    assert.equal(cloud.scheduleSync(s3), true);
    assert.equal(cloud.getState().dirty, true);

    failWith400001Once = true;
    const errRes = await cloud.flushDirty();
    assert.equal(errRes.ok, false);
    assert.equal(cloud.getState().dirty, true, '400001 失败不得丢失待传快照');

    clock += 63_000;
    const okRes = await cloud.flushDirty();
    assert.equal(okRes.ok, true);
    assert.equal(uploadCount, 1);
    assert.equal(cloud.getState().dirty, false);

    const localOther = Save.defaultSave();
    localOther.coins = 50;
    localOther.unlockedHeroes = ['zhou', 'daotong'];
    localOther.codex.relics.push('fivecoins');
    const pulled = await cloud.pullFromCloud(localOther);
    assert.equal(pulled.ok, true);
    assert.equal(pulled.merged.coins, 420);
    assert.ok(pulled.merged.unlockedHeroes.includes('daotong'));
    assert.ok(pulled.merged.codex.weapons.includes('compass'));
    assert.ok(pulled.merged.codex.relics.includes('fivecoins'));
  } finally {
    cloud.destroy();
  }
});

test('T5-WB-06: 奇遇地标弹窗实时刷新（pendingLevels/pendingChests 并存时不清空选项且铜钱变化实时重算可用态）', () => {
  const run = createRun({ seed: 42, heroId: 'zhou' });
  const peddler = run.shrines.find((s) => s.kind === 'peddler') || {
    id: 999, kind: 'peddler', x: 0, y: 0, r: 22, used: false, active: false, timer: 0, maxTimer: 0,
  };
  if (!run.shrines.includes(peddler)) run.shrines.push(peddler);
  run.player.x = peddler.x;
  run.player.y = peddler.y;
  run.stats.coins = 0;

  run._pendingLevels = 1;
  assert.equal(interactShrine(run, peddler.id), true);
  assert.equal(run.status, 'shrine');
  assert.ok(run.activeShrine && run.activeShrine.options.length === 3);
  assert.ok(run.activeShrine.options.every((o) => o.disabled === true), '0 铜钱时货郎三项均应禁用');

  run.stats.coins = 80;
  assert.equal(interactShrine(run, peddler.id), true);
  assert.equal(run.status, 'shrine');
  assert.ok(run.activeShrine && run.activeShrine.options.length === 3);
  assert.ok(run.activeShrine.options.some((o) => !o.disabled), '80 铜钱刷新后货郎选项应立即变为可买');

  const buyIdx = run.activeShrine.options.findIndex((o) => !o.disabled);
  const res = resolveShrine(run, buyIdx);
  assert.ok(res);
  assert.ok(run.stats.coins >= 0);
  assert.equal(run.status, 'levelup', '完成奇遇交易后应无缝弹出挂起的升级抽签');
});

test('T5-WB-07: 零构建 ESM 静态导入图完整性与 src/{core,sim}/** 纯确定性零全局污染审计', () => {
  function walkJs(dir) {
    const out = [];
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) out.push(...walkJs(p));
      else if (p.endsWith('.js')) out.push(p);
    }
    return out;
  }

  const stripComments = (txt) => txt.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const importRe = /(?:import\s+(?:[^'"]*?\s+from\s+)?|export\s+[^'"]*?\s+from\s+|import\s*\(\s*)['"]([^'"]+)['"]/g;

  const srcDir = path.join(REPO_ROOT, 'src');
  const allSrcFiles = walkJs(srcDir);
  const graph = new Map();

  for (const file of allSrcFiles) {
    const clean = stripComments(fs.readFileSync(file, 'utf8'));
    const deps = [];
    for (const m of clean.matchAll(importRe)) {
      const spec = m[1];
      assert.ok(spec.startsWith('./') || spec.startsWith('../'), `禁止裸模块说明符: ${spec} in ${file}`);
      assert.ok(spec.endsWith('.js'), `浏览器原生 ESM 必须带 .js 后缀: ${spec} in ${file}`);
      const target = path.resolve(path.dirname(file), spec);
      assert.ok(fs.existsSync(target), `断开的相对导入: ${spec} in ${file}`);
      deps.push(target);
    }
    graph.set(path.resolve(file), deps);
  }

  for (const htmlName of ['index.html', 'style-lab.html']) {
    const html = fs.readFileSync(path.join(REPO_ROOT, htmlName), 'utf8');
    for (const m of html.matchAll(/(?:src|from)\s*=?\s*['"]([^'"]+\.js)['"]/g)) {
      const target = path.resolve(REPO_ROOT, m[1]);
      assert.ok(fs.existsSync(target), `${htmlName} 引用了不存在的脚本: ${m[1]}`);
    }
  }

  const reachable = new Set();
  const visit = (u) => {
    if (reachable.has(u)) return;
    reachable.add(u);
    for (const v of graph.get(u) || []) visit(v);
  };
  visit(path.resolve(REPO_ROOT, 'src/main.js'));
  const unreachableRel = [...graph.keys()]
    .filter((f) => !reachable.has(f))
    .map((f) => path.relative(REPO_ROOT, f).replace(/\\/g, '/'))
    .sort();
  assert.deepEqual(unreachableRel, ['src/render/mock-run.js', 'src/render/sheet.js']);

  const forbiddenRe = /\b(window|document|localStorage|sessionStorage|navigator|location|AudioContext|webkitAudioContext|OffscreenCanvas|requestAnimationFrame|cancelAnimationFrame|fetch|XMLHttpRequest|setTimeout|setInterval)\b|Math\.random\b|Date\.now\b|performance\.now\b/g;
  for (const sub of ['src/core', 'src/sim']) {
    for (const file of walkJs(path.join(REPO_ROOT, sub))) {
      const clean = stripComments(fs.readFileSync(file, 'utf8'));
      const hits = [...clean.matchAll(forbiddenRe)].map((m) => m[0]);
      assert.deepEqual(hits, [], `${path.relative(REPO_ROOT, file)} 违反纯确定性约束: ${hits.join(', ')}`);
    }
  }
});

test('T5-WB-08: 6 色民俗木版色板与反现代毛玻璃/渐变/Emoji 静态审计（palette.js + styles.css + index.html）', () => {
  assert.equal(PAPER, '#EFE6D2');
  assert.equal(PAPER_SHADE, '#E0D2B4');
  assert.equal(INK, '#1C1A17');
  assert.equal(VERM, '#C23B26');
  assert.equal(VERM_DARK, '#8E2A1B');
  assert.equal(LANTERN, '#F0BE62');
  for (const [k, [r, g, b]] of Object.entries(RGB)) {
    assert.ok(r >= g && g >= b, `palette.${k} 不满足暖色阶 R>=G>=B`);
  }

  const allowedHex = new Set(['#efe6d2', '#e0d2b4', '#1c1a17', '#c23b26', '#8e2a1b', '#f0be62']);
  const allowedRgb = new Set(['239,230,210', '224,210,180', '28,26,23', '194,59,38', '142,42,27', '240,190,98']);

  const css = fs.readFileSync(path.join(REPO_ROOT, 'styles.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.equal(/(?:linear|radial|conic)-gradient\s*\(/i.test(css), false, 'styles.css 严禁使用 CSS 渐变');
  assert.equal(/backdrop-filter/i.test(css), false, 'styles.css 严禁使用毛玻璃 backdrop-filter');
  assert.equal(/\p{Extended_Pictographic}/u.test(css), false, 'styles.css 严禁含 Emoji');

  const cssBody = css.replace(/\.age-badge\s*\{[^}]*\}/g, '');
  for (const m of cssBody.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) {
    assert.ok(allowedHex.has(m[0].toLowerCase()), `styles.css 出现色板外 Hex 颜色: ${m[0]}`);
  }
  for (const m of cssBody.matchAll(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/g)) {
    const rgbKey = `${m[1]},${m[2]},${m[3]}`;
    assert.ok(allowedRgb.has(rgbKey), `styles.css 出现色板外 RGB 颜色: ${m[0]}`);
  }

  const indexHtml = fs.readFileSync(path.join(REPO_ROOT, 'index.html'), 'utf8');
  for (const m of indexHtml.matchAll(/#[0-9a-fA-F]{6}\b/g)) {
    assert.ok(allowedHex.has(m[0].toLowerCase()), `index.html 出现色板外颜色: ${m[0]}`);
  }
});

test('T5-WB-09: dist/wugeng-h5.zip 与 tools/package_h5.py 纯净度、零元数据泄漏及工作区字节一致性', () => {
  const zipPath = path.join(REPO_ROOT, 'dist/wugeng-h5.zip');
  assert.ok(fs.existsSync(zipPath), '缺少 dist/wugeng-h5.zip');
  const buf = fs.readFileSync(zipPath);
  assert.ok(buf.length > 100_000 && buf.length < 300_000_000, `ZIP 体积异常: ${buf.length}`);

  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  assert.ok(eocd >= 0, 'ZIP 缺少合法 EOCD 签名');
  const totalEntries = buf.readUInt16LE(eocd + 10);
  let pos = buf.readUInt32LE(eocd + 16);
  const zipEntries = new Map();

  for (let i = 0; i < totalEntries; i++) {
    assert.equal(buf.readUInt32LE(pos), 0x02014b50);
    const method = buf.readUInt16LE(pos + 10);
    const compSize = buf.readUInt32LE(pos + 20);
    const nameLen = buf.readUInt16LE(pos + 28);
    const extraLen = buf.readUInt16LE(pos + 30);
    const commentLen = buf.readUInt16LE(pos + 32);
    const lfhOffset = buf.readUInt32LE(pos + 42);
    const name = buf.subarray(pos + 46, pos + 46 + nameLen).toString('utf8');
    zipEntries.set(name, { method, compSize, lfhOffset });
    pos += 46 + nameLen + extraLen + commentLen;
  }

  for (const mustHave of [
    'wugeng/',
    'wugeng/index.html',
    'wugeng/privacy.html',
    'wugeng/styles.css',
    'wugeng/src/main.js',
    'wugeng/assets/fonts/wenkai-subset.woff2',
  ]) {
    assert.ok(zipEntries.has(mustHave), `ZIP 缺少必需入口文件: ${mustHave}`);
  }

  for (const [name, meta] of zipEntries) {
    assert.ok(name.startsWith('wugeng/'), `所有归档条目必须位于单一顶层目录 wugeng/ 下: ${name}`);
    assert.equal(
      /(\.agents|e2e\/|tests\/|tools\/|style-lab\.html|mock-run\.js|sheet\.js|collect_chars\.py|common-hanzi\.txt|\.test\.|\.spec\.)/.test(name),
      false,
      `ZIP 混入开发/测试/代理元数据文件: ${name}`,
    );
    if (!name.endsWith('/')) {
      const diskFile = path.join(REPO_ROOT, name.slice('wugeng/'.length));
      assert.ok(fs.existsSync(diskFile), `ZIP 含未知残留文件: ${name}`);
      const lfhNameLen = buf.readUInt16LE(meta.lfhOffset + 26);
      const lfhExtraLen = buf.readUInt16LE(meta.lfhOffset + 28);
      const start = meta.lfhOffset + 30 + lfhNameLen + lfhExtraLen;
      const raw = buf.subarray(start, start + meta.compSize);
      const unzipped = meta.method === 0 ? raw : zlib.inflateRawSync(raw);
      assert.equal(Buffer.compare(unzipped, fs.readFileSync(diskFile)), 0, `ZIP 文件内容与当前工作区不一致: ${name}`);
    }
  }
});

test('T5-WB-10: input.js 双指移动+大招并发隔离与 ad-policy.js 60s 保护期精确边界', () => {
  const makeBus = () => {
    const map = new Map();
    return {
      addEventListener(t, fn) { if (!map.has(t)) map.set(t, []); map.get(t).push(fn); },
      removeEventListener(t, fn) { const a = map.get(t) || []; const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); },
      setPointerCapture() {},
      emit(type, ev) { for (const fn of [...(map.get(type) || [])]) fn({ type, preventDefault() {}, ...ev }); },
      listenerCount() { let n = 0; for (const a of map.values()) n += a.length; return n; },
    };
  };

  const prevWin = globalThis.window;
  const fakeWin = makeBus();
  globalThis.window = fakeWin;
  try {
    const canvas = makeBus();
    const ultRect = { x: 300, y: 740, w: 80, h: 88 };
    const input = createInput(canvas, { getUltRect: () => ultRect });

    canvas.emit('pointerdown', { pointerId: 1, clientX: 90, clientY: 600 });
    canvas.emit('pointermove', { pointerId: 1, clientX: 140, clientY: 600 });
    canvas.emit('pointerdown', { pointerId: 2, clientX: 335, clientY: 780 });
    canvas.emit('pointermove', { pointerId: 3, clientX: 10, clientY: 600 });
    canvas.emit('pointerup', { pointerId: 2, clientX: 335, clientY: 780 });

    const s1 = input.sample();
    assert.equal(s1.moveX, 1, '右拇指点大招不得打断左拇指满速移动');
    assert.equal(s1.ultimate, true, '大招单次触发成功');
    const s2 = input.sample();
    assert.equal(s2.moveX, 1);
    assert.equal(s2.ultimate, false, 'ultimate 信号消费后自动复位');

    canvas.emit('pointerup', { pointerId: 1, clientX: 140, clientY: 600 });
    fakeWin.emit('keydown', { key: 'W', repeat: false });
    fakeWin.emit('keydown', { key: 'D', repeat: false });
    fakeWin.emit('keydown', { key: 'E', repeat: false });
    const sk = input.sample();
    assert.ok(Math.hypot(sk.moveX, sk.moveY) <= 1.000001 && sk.moveX > 0.7 && sk.moveY < -0.7);
    assert.equal(sk.interact, true);

    input.destroy();
    assert.equal(canvas.listenerCount(), 0, 'destroy() 必须清空全部 canvas 事件监听');
    assert.equal(fakeWin.listenerCount(), 0, 'destroy() 必须清空全部 window 事件监听');
  } finally {
    globalThis.window = prevWin;
  }

  assert.equal(AD_GRACE_SEC, 60);
  const run59 = { time: 59.999, mode: 'main', rerolls: { free: 0, ad: 0, adGrants: 0, adGrantMax: 2 }, revives: { mainUsed: 0, endlessUsed: 0 } };
  const run60 = { ...run59, time: 60 };
  assert.equal(canShowRerollAd(true, run59), false);
  assert.equal(canShowReviveAd(true, run59), false);
  assert.equal(canShowRerollAd(true, run60), true);
  assert.equal(canShowReviveAd(true, run60), true);
  assert.equal(canShowRerollAd(true, { ...run60, rerolls: { free: 0, ad: 0, adGrants: 2, adGrantMax: 2 } }), false);
  assert.equal(canShowReviveAd(true, { ...run60, mode: 'main', revives: { mainUsed: 1, endlessUsed: 0 } }), false);
  assert.equal(canShowReviveAd(true, { ...run60, mode: 'endless', revives: { mainUsed: 1, endlessUsed: 0 } }), true);
  assert.equal(canShowResultDouble(true, { coins: 50, timeSec: 59.9 }, false), false);
  assert.equal(canShowResultDouble(true, { coins: 50, timeSec: 60 }, false), true);
  assert.equal(canShowResultDouble(true, { coins: 50, timeSec: 60 }, true), false);
  assert.equal(canShowCheckinDouble(true, { canClaim: true }), true);
  assert.equal(canShowCheckinDouble(true, { canClaim: false }), false);
});
